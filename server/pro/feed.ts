import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query } from '../lib/db'
import { ApiError } from '../lib/http'
import { formatNational } from '../lib/phone'
import { enforce } from '../lib/rateLimit'

type Row = Record<string, any>
const bad = (code: string, message: string) => new ApiError(400, code, message)
// eslint-disable-next-line no-control-regex
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : '')
const PAGE = 10

/**
 * Mural: nenhum perfil é acessível. O navegador recebe só o id da POSTAGEM, o nome, as profissões e o texto
 * (nunca id de usuário, celular ou foto). Só profissionais APROVADOS leem e publicam.
 */
async function standing(userId: string) {
  const p = (await query<Row>('SELECT review_status, full_name FROM professional_profiles WHERE user_id = $1', [userId]))[0]
  const approved = p?.review_status === 'approved'
  return { approved, hasName: Boolean(p?.full_name) }
}

export async function listFeed(userId: string, before: unknown) {
  const s = await standing(userId)
  if (!s.approved) return { allowed: false, canPost: false, needsName: false, items: [], hasMore: false }
  const cursor = typeof before === 'string' && /^\d{1,15}$/.test(before) ? before : null
  const rows = await query<Row>(
    `SELECT p.id, p.body, p.created_at, (p.user_id = $1) AS mine, pr.full_name,
            (SELECT array_agg(pf.name ORDER BY pf.sort_order) FROM profile_professions x JOIN professions pf ON pf.id = x.profession_id WHERE x.user_id = p.user_id) AS professions
     FROM posts p
     JOIN professional_profiles pr ON pr.user_id = p.user_id AND pr.review_status = 'approved'
     JOIN users u ON u.id = p.user_id AND u.status = 'active'
     WHERE NOT p.hidden AND ($2::bigint IS NULL OR p.id < $2::bigint)
     ORDER BY p.id DESC LIMIT $3`, [userId, cursor, PAGE + 1])
  return {
    allowed: true, canPost: s.hasName, needsName: !s.hasName,
    items: rows.slice(0, PAGE).map((r) => ({
      id: String(r.id), name: (r.full_name ?? 'Profissional') as string, professions: (r.professions ?? []) as string[],
      body: r.body as string, at: r.created_at, mine: r.mine as boolean,
    })),
    hasMore: rows.length > PAGE,
  }
}

// Proteção simples: o mural não é canal de contato nem de divulgação externa.
const HAS_LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|app|me|link)(\.br)?\b)/i
const HAS_PHONE = /\d[\d\s().-]{7,}\d/
export async function createPost(userId: string, body: Record<string, unknown>) {
  const s = await standing(userId)
  if (!s.approved) throw new ApiError(403, 'feed_locked', 'O mural fica disponível depois da aprovação do seu cadastro.')
  if (!s.hasName) throw new ApiError(409, 'name_required', 'Informe seu nome no perfil para publicar no mural.')
  const text = clean(body.body)
  if (text.length < 3) throw bad('invalid_post', 'Escreva pelo menos 3 caracteres.')
  if (text.length > 600) throw bad('post_too_long', 'A postagem pode ter no máximo 600 caracteres.')
  if (HAS_LINK.test(text) || HAS_PHONE.test(text)) throw bad('post_contact_info', 'Por segurança, não inclua telefones, e-mails ou links na postagem.')
  await enforce(`feed:post:${userId}`, 10, 86400)
  await query('INSERT INTO posts (user_id, body) VALUES ($1, $2)', [userId, text])
  return listFeed(userId, null)
}

export async function deleteOwnPost(userId: string, id: string) {
  const r = await query<Row>('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
  if (!r.length) throw new ApiError(404, 'not_found', 'Postagem não encontrada.')
  return { ok: true }
}

export async function reportPost(userId: string, id: string) {
  const s = await standing(userId)
  if (!s.approved) throw new ApiError(403, 'feed_locked', 'O mural fica disponível depois da aprovação do seu cadastro.')
  await enforce(`feed:report:${userId}`, 30, 86400)
  const post = (await query<Row>('SELECT user_id FROM posts WHERE id = $1 AND NOT hidden', [id]))[0]
  if (!post) throw new ApiError(404, 'not_found', 'Postagem não encontrada.')
  if (post.user_id === userId) throw bad('own_post', 'Você não pode denunciar a sua própria postagem.')
  await query('INSERT INTO post_reports (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, userId])
  return { ok: true }
}

// ---------- Administração ----------
export async function adminFeed() {
  const rows = await query<Row>(
    `SELECT p.id, p.body, p.hidden, p.hidden_reason, p.created_at, p.user_id, pr.full_name, ph.e164,
            (SELECT count(*)::int FROM post_reports r WHERE r.post_id = p.id) AS reports
     FROM posts p
     LEFT JOIN professional_profiles pr ON pr.user_id = p.user_id
     LEFT JOIN phones ph ON ph.user_id = p.user_id AND ph.is_primary
     ORDER BY (SELECT count(*) FROM post_reports r WHERE r.post_id = p.id AND NOT p.hidden) DESC, p.id DESC LIMIT 100`)
  return { items: rows.map((r) => ({
    id: String(r.id), body: r.body as string, hidden: r.hidden as boolean, hiddenReason: r.hidden_reason as string | null, at: r.created_at,
    reports: r.reports as number, authorId: r.user_id as string, authorName: r.full_name as string | null, authorPhone: r.e164 ? formatNational(r.e164) : null,
  })) }
}
export async function adminSetHidden(adminId: string, id: string, hidden: boolean, reason: unknown) {
  const why = clean(reason).slice(0, 300)
  const r = await query<Row>(
    `UPDATE posts SET hidden = $2, hidden_by = $3, hidden_at = $4, hidden_reason = $5 WHERE id = $1 RETURNING id`,
    [id, hidden, hidden ? adminId : null, hidden ? now() : null, hidden && why ? why : null])
  if (!r.length) throw new ApiError(404, 'not_found', 'Postagem não encontrada.')
  await audit('admin.post_moderation', { userId: adminId, details: { id, hidden } })
  return adminFeed()
}
