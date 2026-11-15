import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query, withTransaction } from '../lib/db'
import { ApiError } from '../lib/http'
import { enforce } from '../lib/rateLimit'
import { getState, setRegions, setWork } from './service'
import { endpointAllowed, MSG_PAYLOAD, notify, pushConfigured, vapidPublicKey } from '../lib/push'

type Row = Record<string, any>
const bad = (code: string, message: string) => new ApiError(400, code, message)
// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '')

export const STATUS_LABEL: Record<string, string> = {
  not_submitted: 'Cadastro incompleto', pending_review: 'Em análise', approved: 'Aprovado',
  needs_changes: 'Ajustes solicitados', rejected: 'Rejeitado', suspended: 'Suspenso',
}
const firstName = (full: string | null) => (full ? full.trim().split(/\s+/)[0] : null)

async function profile(userId: string): Promise<Row> {
  await query('INSERT INTO professional_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
  return (await query<Row>('SELECT * FROM professional_profiles WHERE user_id = $1', [userId]))[0]
}
const event = (userId: string, kind: string, details?: string) =>
  query('INSERT INTO profile_events (user_id, kind, details) VALUES ($1,$2,$3)', [userId, kind, details ?? null])

// ---------- Início ----------
export async function home(userId: string) {
  const p = await profile(userId)
  const st = await getState(userId)
  const [{ n: unreadMessages }] = await query<Row>(`SELECT count(*)::int n FROM messages WHERE user_id = $1 AND sender = 'admin' AND read_at IS NULL`, [userId])
  const [{ n: unreadAnnouncements }] = await query<Row>(
    `SELECT count(*)::int n FROM announcements a WHERE a.published AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1)`, [userId])
  const hasPhoto = (await query('SELECT 1 FROM profile_photos WHERE user_id = $1', [userId])).length > 0
  const last = (await query<Row>(
    `SELECT action, notes, created_at FROM review_events WHERE user_id = $1 AND action IN ('approve','reject','request_changes','suspend','reinstate') ORDER BY created_at DESC, id DESC LIMIT 1`, [userId]))[0]
  const status = p.review_status as string

  const pendencies: { id: string; text: string; to: string; required: boolean }[] = []
  if (!p.full_name) pendencies.push({ id: 'name', text: 'Informe seu nome completo.', to: '/area/perfil', required: true })
  if (status === 'not_submitted') pendencies.push({ id: 'finish', text: st.progress.professions ? `Continue seu cadastro: você parou no passo ${[2, 2, 3, 4, 4][st.nextStep - 1] ?? 4} de 4.` : 'Escolha suas profissões, regiões e responda às perguntas.', to: '/profissional', required: true })
  if (status === 'needs_changes') pendencies.push({ id: 'changes', text: 'A equipe pediu ajustes no seu cadastro. Leia a orientação e reenvie.', to: '/profissional', required: true })
  if (!hasPhoto) pendencies.push({ id: 'photo', text: 'Adicione uma foto de perfil.', to: '/area/perfil', required: false })
  if (!p.bio) pendencies.push({ id: 'bio', text: 'Escreva uma apresentação profissional.', to: '/area/perfil', required: false })
  if (!p.services) pendencies.push({ id: 'services', text: 'Descreva os serviços que você realiza.', to: '/area/perfil', required: false })

  const announcements = await query<Row>(
    `SELECT a.id, a.title, a.body, a.created_at, (r.user_id IS NOT NULL) AS read
     FROM announcements a LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
     WHERE a.published ORDER BY a.created_at DESC, a.id DESC LIMIT 3`, [userId])
  return {
    name: p.full_name as string | null, firstName: firstName(p.full_name),
    status, statusLabel: STATUS_LABEL[status] ?? status,
    decision: last && ['request_changes', 'reject', 'suspend'].includes(last.action) && ['needs_changes', 'rejected', 'suspended'].includes(status)
      ? { action: last.action as string, notes: last.notes as string | null, at: last.created_at } : null,
    pendencies, unreadMessages, unreadAnnouncements,
    announcements: announcements.map((a) => ({ id: String(a.id), title: a.title as string, body: a.body as string, at: a.created_at, read: a.read as boolean })),
    hasPhoto,
    // "Perfil preparado": nome, apresentação, serviços e foto preenchidos (a jornada mostra só o que é real)
    profilePrepared: Boolean(p.full_name && p.bio && p.services && hasPhoto), submitted: status !== 'not_submitted',
  }
}

// ---------- Meu perfil ----------
export async function getMe(userId: string) {
  const p = await profile(userId)
  const st = await getState(userId)
  const photo = (await query<Row>('SELECT extract(epoch from updated_at)::bigint v FROM profile_photos WHERE user_id = $1', [userId]))[0]
  const status = p.review_status as string
  return {
    fullName: p.full_name as string | null, bio: p.bio as string | null, services: p.services as string | null, extraInfo: p.extra_info as string | null,
    photoVersion: photo ? String(photo.v) : null,
    status, statusLabel: STATUS_LABEL[status] ?? status,
    professions: st.professions, regions: st.regions,
    availability: st.profile.availability, ownTools: st.profile.ownTools, vehicle: st.profile.vehicle, workStructure: st.profile.workStructure,
    // Profissões só mudam com liberação da equipe; regiões mudam e voltam para análise se já enviado.
    canEditProfessions: ['not_submitted', 'needs_changes'].includes(status),
    regionsChangeResubmits: status === 'approved',
    canEditRegions: ['not_submitted', 'needs_changes', 'approved', 'pending_review'].includes(status),
  }
}

export async function updateMe(userId: string, body: Record<string, unknown>) {
  const p = await profile(userId)
  if (p.review_status === 'suspended' || p.review_status === 'rejected') {
    throw new ApiError(409, 'profile_locked', 'Seu cadastro está bloqueado para edição. Fale com a equipe pela caixa de mensagens.')
  }
  const fullName = clean(body.fullName, 80).replace(/\s+/g, ' ')
  if (fullName.length < 3 || !/\p{L}{2,}/u.test(fullName)) throw bad('invalid_name', 'Informe seu nome (mínimo 3 letras).')
  const bio = clean(body.bio, 600), services = clean(body.services, 600), extra = clean(body.extraInfo, 600)
  await query('UPDATE professional_profiles SET full_name=$2, bio=$3, services=$4, extra_info=$5, updated_at=$6 WHERE user_id=$1',
    [userId, fullName, bio || null, services || null, extra || null, now()])
  if (p.review_status === 'approved' || p.review_status === 'pending_review') await event(userId, 'profile_updated', 'Nome, apresentação ou serviços atualizados')
  await audit('pro.profile_updated', { userId })
  return getMe(userId)
}

/** Experiência, disponibilidade, ferramentas, veículo e estrutura: editáveis a qualquer momento (não sensíveis). */
export async function updateWork(userId: string, body: Record<string, unknown>) {
  const p = await profile(userId)
  if (['suspended', 'rejected'].includes(p.review_status)) throw new ApiError(409, 'profile_locked', 'Seu cadastro está bloqueado para edição. Fale com a equipe pela caixa de mensagens.')
  await setWork(userId, body, { anyStatus: true })
  if (['approved', 'pending_review'].includes(p.review_status)) await event(userId, 'work_updated', 'Experiência, disponibilidade ou estrutura de trabalho atualizadas')
  return getMe(userId)
}

/** Região é alteração sensível: se o cadastro já foi aprovado, volta para análise e deixa de aparecer ao público. */
export async function changeRegions(userId: string, body: Record<string, unknown>) {
  const p = await profile(userId)
  if (['not_submitted', 'needs_changes'].includes(p.review_status)) { await setRegions(userId, body); return getMe(userId) }
  if (!['approved', 'pending_review'].includes(p.review_status)) throw new ApiError(409, 'profile_locked', 'Seu cadastro está bloqueado para edição. Fale com a equipe pela caixa de mensagens.')
  await setRegions(userId, body, { anyStatus: true })
  const resubmit = p.review_status === 'approved'
  await withTransaction(async (c) => {
    if (resubmit) await c.query(`UPDATE professional_profiles SET review_status = 'pending_review', submitted_at = $2, updated_at = $2 WHERE user_id = $1 AND review_status = 'approved'`, [userId, now()])
    await c.query('INSERT INTO profile_events (user_id, kind, details) VALUES ($1,$2,$3)', [userId, resubmit ? 'resubmitted' : 'regions_changed', 'Regiões de atendimento alteradas'])
    await c.query(`INSERT INTO messages (user_id, sender, sender_user_id, kind, body) VALUES ($1,'professional',$1,'change_request',$2)`,
      [userId, 'Alterei minhas regiões de atendimento' + (resubmit ? ' e meu cadastro voltou para reavaliação.' : '.')])
  })
  await audit('pro.regions_changed', { userId, details: { resubmit } })
  return getMe(userId)
}

// ---------- Foto (privada) ----------
const MAGIC: [string, number[]][] = [['image/jpeg', [0xff, 0xd8, 0xff]], ['image/png', [0x89, 0x50, 0x4e, 0x47]]]
export async function setPhoto(userId: string, body: Record<string, unknown>) {
  await enforce(`pro:photo:${userId}`, 20, 3600)
  const m = typeof body.dataUrl === 'string' ? body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/) : null
  if (!m) throw bad('invalid_photo', 'Envie uma foto em JPG, PNG ou WebP.')
  const data = Buffer.from(m[2], 'base64')
  if (data.length < 100 || data.length > 400_000) throw bad('photo_too_large', 'A foto está muito grande. Escolha outra (até 400 KB depois de reduzida).')
  const isWebp = data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
  const okMagic = m[1] === 'image/webp' ? isWebp : MAGIC.some(([t, sig]) => t === m[1] && sig.every((b, i) => data[i] === b))
  if (!okMagic) throw bad('invalid_photo', 'Esse arquivo não parece uma foto válida.')
  await query(
    `INSERT INTO profile_photos (user_id, content_type, data, updated_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [userId, m[1], data, now()])
  const p = await profile(userId)
  if (['approved', 'pending_review'].includes(p.review_status)) await event(userId, 'photo_updated', 'Foto de perfil atualizada')
  return getMe(userId)
}
export async function removePhoto(userId: string) {
  await query('DELETE FROM profile_photos WHERE user_id = $1', [userId])
  return getMe(userId)
}
export async function getPhoto(userId: string): Promise<{ type: string; data: Buffer } | null> {
  const r = (await query<Row>('SELECT content_type, data FROM profile_photos WHERE user_id = $1', [userId]))[0]
  return r ? { type: r.content_type as string, data: r.data as Buffer } : null
}

// ---------- Mensagens (profissional ↔ administração) ----------
export async function thread(userId: string, reader: 'professional' | 'admin') {
  const other = reader === 'professional' ? 'admin' : 'professional'
  const rows = await query<Row>('SELECT id, sender, kind, body, created_at, read_at FROM messages WHERE user_id = $1 ORDER BY created_at, id LIMIT 200', [userId])
  // Quem abre a conversa "lê" o que veio do outro lado.
  await query('UPDATE messages SET read_at = $3 WHERE user_id = $1 AND sender = $2 AND read_at IS NULL', [userId, other, now()])
  return {
    messages: rows.map((m) => ({ id: String(m.id), from: m.sender as string, kind: m.kind as string, body: m.body as string, at: m.created_at, unread: m.sender === other && m.read_at === null })),
  }
}
export async function postMessage(userId: string, sender: 'professional' | 'admin', senderId: string, body: unknown, kind: 'message' | 'change_request' = 'message') {
  const text = clean(body, 1000)
  if (text.length < 1) throw bad('empty_message', 'Escreva a mensagem.')
  await enforce(`msg:${sender}:${senderId}`, sender === 'admin' ? 300 : 20, 3600)
  await query('INSERT INTO messages (user_id, sender, sender_user_id, kind, body) VALUES ($1,$2,$3,$4,$5)', [userId, sender, senderId, kind, text])
  if (sender === 'admin') await notify('messages', [userId], MSG_PAYLOAD)
  return thread(userId, sender)
}
export async function unreadCount(userId: string): Promise<number> {
  return (await query<Row>(`SELECT count(*)::int n FROM messages WHERE user_id = $1 AND sender = 'admin' AND read_at IS NULL`, [userId]))[0].n
}

// ---------- Comunicados ----------
export async function listAnnouncements(userId: string) {
  const rows = await query<Row>(
    `SELECT a.id, a.title, a.body, a.created_at, (r.user_id IS NOT NULL) AS read
     FROM announcements a LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
     WHERE a.published ORDER BY a.created_at DESC, a.id DESC LIMIT 50`, [userId])
  return { items: rows.map((a) => ({ id: String(a.id), title: a.title as string, body: a.body as string, at: a.created_at, read: a.read as boolean })) }
}
export async function markAnnouncementsRead(userId: string) {
  await query(
    `INSERT INTO announcement_reads (user_id, announcement_id) SELECT $1, id FROM announcements WHERE published ON CONFLICT DO NOTHING`, [userId])
  return listAnnouncements(userId)
}

// ---------- Notificações push (opcionais) ----------
export async function pushStatus(userId: string) {
  const rows = await query<Row>('SELECT topic_messages, topic_announcements FROM push_subscriptions WHERE user_id = $1', [userId])
  return {
    configured: pushConfigured(), publicKey: vapidPublicKey(), subscribed: rows.length > 0,
    prefs: { messages: rows.length ? rows.every((r) => r.topic_messages) : true, announcements: rows.length ? rows.every((r) => r.topic_announcements) : true },
  }
}
export async function pushSubscribe(userId: string, body: Record<string, unknown>) {
  if (!pushConfigured()) throw new ApiError(503, 'push_unavailable', 'Os avisos no celular ainda não estão disponíveis.')
  await enforce(`push:sub:${userId}`, 20, 3600)
  const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined
  if (!sub || !endpointAllowed(sub.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string'
    || sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100 || !/^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys.p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys.auth)) {
    throw bad('invalid_subscription', 'Não foi possível ativar os avisos neste aparelho.')
  }
  await withTransaction(async (c) => {
    // Mesmo aparelho em outra conta: o aviso passa a valer só para quem entrou por último.
    await c.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, failures = 0`,
      [userId, sub.endpoint, sub.keys!.p256dh, sub.keys!.auth])
    await c.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 5)', [userId]) // no máx. 5 aparelhos
  })
  return pushStatus(userId)
}
export async function pushPrefs(userId: string, body: Record<string, unknown>) {
  if (typeof body.messages !== 'boolean' || typeof body.announcements !== 'boolean') throw bad('invalid_prefs', 'Preferências inválidas.')
  await query('UPDATE push_subscriptions SET topic_messages = $2, topic_announcements = $3 WHERE user_id = $1', [userId, body.messages, body.announcements])
  return pushStatus(userId)
}
export async function pushUnsubscribe(userId: string, body: Record<string, unknown>) {
  if (typeof body.endpoint === 'string') await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, body.endpoint])
  else await query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId])
  return pushStatus(userId)
}

/** Dados leves do cabeçalho/barra do app: não lidas, nome, foto e o pedido mais novo disponível para este profissional. */
export async function shellInfo(userId: string) {
  const unread = await unreadCount(userId)
  const [{ n: announcements }] = await query<Row>(
    `SELECT count(*)::int n FROM announcements a WHERE a.published AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1)`, [userId])
  const p = (await query<Row>('SELECT full_name, review_status FROM professional_profiles WHERE user_id = $1', [userId]))[0]
  const photo = (await query<Row>('SELECT extract(epoch from updated_at)::bigint v FROM profile_photos WHERE user_id = $1', [userId]))[0]
  let newestRequestId: number | null = null
  if (p?.review_status === 'approved') {
    const r = (await query<Row>(
      `SELECT max(r.id)::bigint AS id FROM service_requests r WHERE r.status = 'published'
         AND EXISTS (SELECT 1 FROM profile_professions pp WHERE pp.user_id = $1 AND pp.profession_id = r.profession_id)
         AND EXISTS (SELECT 1 FROM professional_regions pr WHERE pr.user_id = $1 AND pr.region_id = r.region_id)`, [userId]))[0]
    newestRequestId = r?.id ? Number(r.id) : null
  }
  return { unread, announcements: announcements as number, name: (p?.full_name ?? null) as string | null, photoVersion: photo ? String(photo.v) : null, newestRequestId }
}
