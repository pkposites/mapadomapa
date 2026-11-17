import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query, withTransaction } from '../lib/db'
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
export const TOPICS = [
  { id: 'duvida', label: 'Dúvida' }, { id: 'servico', label: 'Divulgando serviço realizado' }, { id: 'dica', label: 'Dica' },
  { id: 'novidade', label: 'Novidade' }, { id: 'indicacao', label: 'Indicação' }, { id: 'outro', label: 'Outro assunto' },
] as const
export const STAFF_NAME = 'Equipe Mapa do Mapa'
const STAFF = `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = %U% AND r.name = 'admin')`
const staffOf = (col: string) => STAFF.replace('%U%', col)

/** A equipe (administração) interage sem aprovação, sem limites de uso e sem os filtros dos profissionais. */
async function standing(userId: string) {
  const p = (await query<Row>(`SELECT review_status, full_name, ${staffOf('$1')} AS staff FROM professional_profiles WHERE user_id = $1`, [userId]))[0]
  const staff = p ? Boolean(p.staff) : (await query<Row>(`SELECT ${staffOf('$1')} AS staff`, [userId]))[0].staff === true
  const approved = staff || p?.review_status === 'approved'
  const name = (p?.full_name ?? (staff ? STAFF_NAME : null)) as string | null
  return { approved, staff, hasName: staff || Boolean(p?.full_name), name }
}

const PROS = `(SELECT array_agg(pf.name ORDER BY pf.sort_order) FROM profile_professions x JOIN professions pf ON pf.id = x.profession_id WHERE x.user_id = %U%)`
const prosOf = (col: string) => PROS.replace('%U%', col)
const lockedMsg = 'Curtir, comentar e publicar liberam depois da aprovação do seu cadastro.'
const TOPIC_IDS = TOPICS.map((t) => t.id as string)

// Proteção simples (só para profissionais): o mural não é canal de contato nem de divulgação externa.
const HAS_LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|app|me|link)(\.br)?\b)/i
const HAS_PHONE = /\d[\d\s().-]{7,}\d/
const LIMITS = { member: { post: 600, comment: 300 }, staff: { post: 3000, comment: 1000 } }

const POST_SELECT = `p.id, p.title, p.topic, p.body, p.created_at, (p.user_id = $1) AS mine, pr.full_name, ${staffOf('p.user_id')} AS staff, ${prosOf('p.user_id')} AS professions,
            (SELECT count(*)::int FROM post_likes l WHERE l.post_id = p.id) AS likes,
            EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked,
            (SELECT count(*)::int FROM post_comments c WHERE c.post_id = p.id AND NOT c.hidden) AS comments, EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id=p.id) AS has_image`
// Autor visível: profissional aprovado e ativo, ou a equipe.
const POST_FROM = `FROM posts p
     LEFT JOIN professional_profiles pr ON pr.user_id = p.user_id
     JOIN users u ON u.id = p.user_id AND u.status = 'active'`
const AUTHOR_OK = `(pr.review_status = 'approved' OR ${staffOf('p.user_id')})`
const mapPost = (r: Row) => ({
  id: String(r.id), title: (r.title ?? null) as string | null, topic: r.topic as string,
  name: ((r.staff ? (r.full_name ?? STAFF_NAME) : (r.full_name ?? 'Profissional')) as string), staff: r.staff === true,
  professions: (r.professions ?? []) as string[], body: r.body as string, at: r.created_at, mine: r.mine as boolean,
  hasImage: Boolean(r.has_image), likes: r.likes as number, liked: r.liked as boolean, comments: r.comments as number,
})
const access = (s: Awaited<ReturnType<typeof standing>>) => ({
  allowed: true, canInteract: s.approved, canPost: s.approved && s.hasName, needsName: s.approved && !s.hasName, isStaff: s.staff,
  myName: s.name, lockedNote: s.approved ? null : lockedMsg, topics: TOPICS,
  maxPost: s.staff ? LIMITS.staff.post : LIMITS.member.post, maxComment: s.staff ? LIMITS.staff.comment : LIMITS.member.comment,
})

/** Todos os usuários logados VEEM o mural; interagir (publicar, curtir, comentar) exige cadastro aprovado. A equipe interage sempre. */
export async function listFeed(userId: string, before: unknown, topic?: unknown) {
  const s = await standing(userId)
  const cursor = typeof before === 'string' && /^\d{1,15}$/.test(before) ? before : null
  const t = typeof topic === 'string' && TOPIC_IDS.includes(topic) ? topic : null
  const rows = await query<Row>(
    `SELECT ${POST_SELECT} ${POST_FROM}
     WHERE NOT p.hidden AND ${AUTHOR_OK} AND ($2::bigint IS NULL OR p.id < $2::bigint) AND ($4::text IS NULL OR p.topic = $4)
     ORDER BY p.id DESC LIMIT $3`, [userId, cursor, PAGE + 1, t])
  return { ...access(s), items: rows.slice(0, PAGE).map(mapPost), hasMore: rows.length > PAGE }
}

/** Um post isolado (página do post). */
export async function getPost(userId: string, id: string) {
  const s = await standing(userId)
  const rows = await query<Row>(`SELECT ${POST_SELECT} ${POST_FROM} WHERE p.id = $2 AND NOT p.hidden AND ${AUTHOR_OK}`, [userId, id])
  if (!rows.length) throw new ApiError(404, 'not_found', 'Postagem não encontrada.')
  return { ...access(s), post: mapPost(rows[0]) }
}

async function requireApproved(userId: string) {
  const s = await standing(userId)
  if (!s.approved) throw new ApiError(403, 'feed_locked', lockedMsg)
  return s
}
const visiblePost = async (id: string) => {
  const r = await query<Row>(`SELECT p.user_id FROM posts p LEFT JOIN professional_profiles pr ON pr.user_id = p.user_id WHERE p.id = $1 AND NOT p.hidden AND ${AUTHOR_OK}`, [id])
  if (!r.length) throw new ApiError(404, 'not_found', 'Postagem não encontrada.')
  return r[0]
}

export async function setLike(userId: string, postId: string, liked: boolean) {
  const s = await requireApproved(userId)
  if (!s.staff) await enforce(`feed:like:${userId}`, 200, 3600)
  await visiblePost(postId)
  if (liked) await query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, userId])
  else await query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId])
  const [{ n }] = await query<Row>('SELECT count(*)::int n FROM post_likes WHERE post_id = $1', [postId])
  return { likes: n as number, liked }
}

export async function listComments(userId: string, postId: string) {
  await visiblePost(postId)
  const rows = await query<Row>(
    `SELECT c.id, c.body, c.created_at, (c.user_id = $2) AS mine, pr.full_name, ${staffOf('c.user_id')} AS staff, ${prosOf('c.user_id')} AS professions
     FROM post_comments c LEFT JOIN professional_profiles pr ON pr.user_id = c.user_id JOIN users u ON u.id = c.user_id AND u.status = 'active'
     WHERE c.post_id = $1 AND NOT c.hidden ORDER BY c.id LIMIT 100`, [postId, userId])
  return { items: rows.map((r) => ({ id: String(r.id), name: ((r.full_name ?? (r.staff ? STAFF_NAME : 'Profissional')) as string), staff: r.staff === true, professions: (r.professions ?? []) as string[], body: r.body as string, at: r.created_at, mine: r.mine as boolean })) }
}

export async function addComment(userId: string, postId: string, body: Record<string, unknown>) {
  const s = await requireApproved(userId)
  if (!s.hasName) throw new ApiError(409, 'name_required', 'Informe seu nome no perfil para comentar.')
  await visiblePost(postId)
  const text = clean(body.body)
  const max = s.staff ? LIMITS.staff.comment : LIMITS.member.comment
  if (text.length < 2) throw bad('invalid_comment', 'Escreva pelo menos 2 caracteres.')
  if (text.length > max) throw bad('comment_too_long', `O comentário pode ter no máximo ${max} caracteres.`)
  if (!s.staff && (HAS_LINK.test(text) || HAS_PHONE.test(text))) throw bad('post_contact_info', 'Por segurança, não inclua telefones, e-mails ou links.')
  if (!s.staff) await enforce(`feed:comment:${userId}`, 60, 86400)
  await query('INSERT INTO post_comments (post_id, user_id, body) VALUES ($1, $2, $3)', [postId, userId, text])
  return listComments(userId, postId)
}

export async function deleteOwnComment(userId: string, id: string) {
  const r = await query<Row>('DELETE FROM post_comments WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
  if (!r.length) throw new ApiError(404, 'not_found', 'Comentário não encontrado.')
  return { ok: true }
}

export async function createPost(userId: string, body: Record<string, unknown>) {
  const s = await requireApproved(userId)
  if (!s.hasName) throw new ApiError(409, 'name_required', 'Informe seu nome no perfil para publicar no mural.')
  const topic = typeof body.topic === 'string' && TOPIC_IDS.includes(body.topic) ? body.topic : null
  if (!topic) throw bad('invalid_topic', 'Escolha o tema da postagem.')
  const title = clean(body.title).replace(/\s+/g, ' ')
  if (title.length < 3) throw bad('invalid_title', 'Escreva um título (mínimo 3 caracteres).')
  if (title.length > 80) throw bad('title_too_long', 'O título pode ter no máximo 80 caracteres.')
  const text = clean(body.body)
  const max = s.staff ? LIMITS.staff.post : LIMITS.member.post
  if (text.length < 3) throw bad('invalid_post', 'Escreva o texto da postagem (mínimo 3 caracteres).')
  if (text.length > max) throw bad('post_too_long', `A postagem pode ter no máximo ${max} caracteres.`)
  if (!s.staff && (HAS_LINK.test(text) || HAS_PHONE.test(text) || HAS_LINK.test(title) || HAS_PHONE.test(title))) throw bad('post_contact_info', 'Por segurança, não inclua telefones, e-mails ou links na postagem.')
  if (!s.staff) await enforce(`feed:post:${userId}`, 10, 86400)
  let image: Buffer | null = null
  if(body.image != null){
    if(typeof body.image!=='string'||body.image.length>1340000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)) throw bad('invalid_image','Selecione uma imagem JPEG válida de até 1 MB.')
    image=Buffer.from(body.image.slice('data:image/jpeg;base64,'.length),'base64')
    if(image.length<4||image.length>1000000||image[0]!==255||image[1]!==216||image[2]!==255||image[image.length-2]!==255||image[image.length-1]!==217) throw bad('invalid_image','Não foi possível validar a imagem.')
  }
  const id = await withTransaction(async tx=>{
    const [p] = await query<Row>('INSERT INTO posts (user_id,title,topic,body) VALUES ($1,$2,$3,$4) RETURNING id',[userId,title,topic,text],tx)
    if(image) await query("INSERT INTO post_images(post_id,bytes,mime) VALUES ($1,$2,'image/jpeg')",[p.id,image],tx)
    return p.id
  })
  return { ...(await listFeed(userId, null)), createdId: String(id) }
}

export async function deleteOwnPost(userId: string, id: string) {
  const r = await query<Row>('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
  if (!r.length) throw new ApiError(404, 'not_found', 'Postagem não encontrada.')
  return { ok: true }
}

export async function reportPost(userId: string, id: string) {
  await requireApproved(userId)
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
    `SELECT p.id, p.title, p.topic, p.body, p.hidden, p.hidden_reason, p.created_at, p.user_id, pr.full_name, ph.e164,
            (SELECT count(*)::int FROM post_reports r WHERE r.post_id = p.id) AS reports,
            (SELECT count(*)::int FROM post_comments c WHERE c.post_id = p.id) AS comments, EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id=p.id) AS has_image
     FROM posts p
     LEFT JOIN professional_profiles pr ON pr.user_id = p.user_id
     LEFT JOIN phones ph ON ph.user_id = p.user_id AND ph.is_primary
     ORDER BY (SELECT count(*) FROM post_reports r WHERE r.post_id = p.id AND NOT p.hidden) DESC, p.id DESC LIMIT 100`)
  return { items: rows.map((r) => ({
    id: String(r.id), title: (r.title ?? null) as string | null, topic: r.topic as string, body: r.body as string, hidden: r.hidden as boolean, hiddenReason: r.hidden_reason as string | null, at: r.created_at,
    hasImage:Boolean(r.has_image), reports: r.reports as number, comments: r.comments as number, authorId: r.user_id as string, authorName: r.full_name as string | null, authorPhone: r.e164 ? formatNational(r.e164) : null,
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

export async function adminComments(postId: string) {
  const rows = await query<Row>(
    `SELECT c.id, c.body, c.hidden, c.created_at, c.user_id, pr.full_name FROM post_comments c LEFT JOIN professional_profiles pr ON pr.user_id = c.user_id WHERE c.post_id = $1 ORDER BY c.id LIMIT 200`, [postId])
  return { items: rows.map((r) => ({ id: String(r.id), body: r.body as string, hidden: r.hidden as boolean, at: r.created_at, authorId: r.user_id as string, authorName: r.full_name as string | null })) }
}
export async function adminHideComment(adminId: string, id: string, hidden: boolean) {
  const r = await query<Row>('UPDATE post_comments SET hidden = $2 WHERE id = $1 RETURNING post_id', [id, hidden])
  if (!r.length) throw new ApiError(404, 'not_found', 'Comentário não encontrado.')
  await audit('admin.comment_moderation', { userId: adminId, details: { id, hidden } })
  return adminComments(String(r[0].post_id))
}

export async function getPostImage(id:string, admin=false):Promise<{type:string;data:Buffer}|null> {
  const [r]=await query<Row>(`SELECT pi.mime AS type,pi.bytes AS data FROM post_images pi JOIN posts p ON p.id=pi.post_id LEFT JOIN professional_profiles pr ON pr.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE p.id=$1 ${admin?'':`AND NOT p.hidden AND u.status='active' AND ${AUTHOR_OK}`}`,[id])
  return r?{type:r.type,data:r.data}:null
}
