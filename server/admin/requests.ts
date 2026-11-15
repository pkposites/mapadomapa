import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query } from '../lib/db'
import { ApiError } from '../lib/http'
import { formatNational, parseBrazilMobile } from '../lib/phone'

type Row = Record<string, any>
const bad = (code: string, message: string) => new ApiError(400, code, message)
// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '')
export const URGENCY = [
  { id: 'urgent', label: 'Urgente (hoje ou amanhã)' }, { id: 'this_week', label: 'Nesta semana' }, { id: 'flexible', label: 'Sem pressa / flexível' },
] as const
const URGENCY_IDS = URGENCY.map((u) => u.id as string)
// Texto que os profissionais veem NÃO pode carregar contato nem link do cliente.
const HAS_CONTACT = /(https?:\/\/|www\.|@\w|\b[a-z0-9-]+\.(com|net|org|app|me|link)(\.br)?\b|\d[\d\s().-]{7,}\d)/i

/** Quantos profissionais APROVADOS, ativos, da profissão e da região receberão o pedido. */
export async function eligibleCount(professionId: number, regionId: number): Promise<number> {
  const r = await query<Row>(
    `SELECT count(DISTINCT pr.user_id)::int AS n FROM professional_profiles pr
     JOIN users u ON u.id = pr.user_id AND u.status = 'active'
     JOIN profile_professions pp ON pp.user_id = pr.user_id AND pp.profession_id = $1
     JOIN professional_regions rg ON rg.user_id = pr.user_id AND rg.region_id = $2
     WHERE pr.review_status = 'approved'`, [professionId, regionId])
  return r[0].n
}

async function validate(body: Record<string, unknown>) {
  const clientName = clean(body.clientName, 100)
  if (clientName.length < 2) throw bad('invalid_client_name', 'Informe o nome do cliente.')
  const phone = parseBrazilMobile(body.clientPhone)
  if (!phone.ok) throw bad('invalid_client_phone', phone.message)
  const prof = (await query<Row>('SELECT id FROM professions WHERE active AND slug = $1', [clean(body.profession, 60)]))[0]
  if (!prof) throw bad('invalid_profession', 'Escolha a profissão necessária.')
  const region = (await query<Row>('SELECT id FROM service_regions WHERE active AND slug = $1', [clean(body.region, 60)]))[0]
  if (!region) throw bad('invalid_region', 'Escolha a região.')
  const neighborhood = clean(body.neighborhood, 80)
  if (neighborhood.length < 2) throw bad('invalid_neighborhood', 'Informe o bairro.')
  const title = clean(body.title, 100), description = clean(body.description, 1500)
  if (title.length < 5) throw bad('invalid_title', 'O título precisa ter pelo menos 5 caracteres.')
  if (description.length < 10) throw bad('invalid_description', 'Descreva o que precisa ser feito (mínimo 10 caracteres).')
  if (typeof body.urgency !== 'string' || !URGENCY_IDS.includes(body.urgency)) throw bad('invalid_urgency', 'Escolha a urgência ou o período desejado.')
  const periodNote = clean(body.periodNote, 100) || null
  for (const [label, v] of [['título', title], ['descrição', description], ['bairro', neighborhood], ['período', periodNote ?? '']] as const) {
    if (HAS_CONTACT.test(v)) throw bad('contact_in_public_text', `Não coloque telefone, e-mail, link ou perfil de rede social no ${label}: os profissionais veem esse texto.`)
  }
  return { clientName, clientPhone: phone.e164, professionId: prof.id as number, regionId: region.id as number, neighborhood, title, description, urgency: body.urgency, periodNote, consent: body.consent === true }
}

const SELECT = `SELECT r.*, p.name AS profession_name, p.slug AS profession_slug, g.name AS region_name, g.slug AS region_slug,
  (SELECT count(*)::int FROM service_request_interests i WHERE i.request_id = r.id) AS interests
  FROM service_requests r JOIN professions p ON p.id = r.profession_id JOIN service_regions g ON g.id = r.region_id`
const summary = (r: Row) => ({
  id: String(r.id), status: r.status as string, title: r.title as string, profession: r.profession_name as string, region: r.region_name as string,
  neighborhood: r.neighborhood as string, urgency: r.urgency as string, interests: r.interests as number, clientName: r.client_name as string,
  publishedAt: r.published_at, closedAt: r.closed_at, createdAt: r.created_at,
})

export async function listRequests(status: unknown) {
  const st = typeof status === 'string' && ['draft', 'published', 'closed'].includes(status) ? status : null
  const rows = await query<Row>(`${SELECT} WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.created_at DESC, r.id DESC LIMIT 200`, [st])
  const counts = await query<Row>(`SELECT status, count(*)::int n FROM service_requests GROUP BY status`)
  return { items: rows.map(summary), counts: Object.fromEntries(['draft', 'published', 'closed'].map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])), urgency: URGENCY }
}

export async function requestDetail(id: string) {
  const r = (await query<Row>(`${SELECT} WHERE r.id = $1`, [id]))[0]
  if (!r) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  const interested = await query<Row>(
    `SELECT i.created_at, u.id AS user_id, pr.full_name, ph.e164, ph.verified_at,
            (SELECT array_agg(p.name ORDER BY p.sort_order) FROM profile_professions x JOIN professions p ON p.id = x.profession_id WHERE x.user_id = u.id) AS professions,
            (SELECT array_agg(g.name ORDER BY g.sort_order) FROM professional_regions y JOIN service_regions g ON g.id = y.region_id WHERE y.user_id = u.id) AS regions
     FROM service_request_interests i JOIN users u ON u.id = i.user_id
     LEFT JOIN professional_profiles pr ON pr.user_id = u.id LEFT JOIN phones ph ON ph.user_id = u.id AND ph.is_primary
     WHERE i.request_id = $1 ORDER BY i.created_at`, [id])
  return {
    ...summary(r), description: r.description as string, periodNote: r.period_note as string | null, consent: r.consent as boolean, consentAt: r.consent_at,
    professionSlug: r.profession_slug as string, regionSlug: r.region_slug as string,
    client: { name: r.client_name as string, phone: formatNational(r.client_phone), whatsapp: String(r.client_phone).replace(/\D/g, '') },
    eligible: await eligibleCount(r.profession_id, r.region_id), urgencyOptions: URGENCY,
    interested: interested.map((i) => ({
      id: i.user_id as string, name: (i.full_name ?? null) as string | null, phone: i.e164 ? formatNational(i.e164) : null, whatsapp: i.e164 ? String(i.e164).replace(/\D/g, '') : null,
      phoneVerified: Boolean(i.verified_at), professions: (i.professions ?? []) as string[], regions: (i.regions ?? []) as string[], at: i.created_at,
    })),
  }
}

export async function createRequest(adminId: string, body: Record<string, unknown>) {
  const v = await validate(body)
  const publish = body.publish === true
  if (publish && !v.consent) throw bad('consent_required', 'Para publicar, confirme que o cliente autorizou o registro e o uso dos dados para intermediação.')
  const [{ id }] = await query<Row>(
    `INSERT INTO service_requests (status, client_name, client_phone, profession_id, region_id, neighborhood, title, description, urgency, period_note, consent, consent_at, created_by, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [publish ? 'published' : 'draft', v.clientName, v.clientPhone, v.professionId, v.regionId, v.neighborhood, v.title, v.description, v.urgency, v.periodNote, v.consent, v.consent ? now() : null, adminId, publish ? now() : null])
  await audit(publish ? 'admin.request_published' : 'admin.request_created', { userId: adminId, details: { id: String(id) } })
  return requestDetail(String(id))
}

export async function updateRequest(adminId: string, id: string, body: Record<string, unknown>) {
  const cur = (await query<Row>('SELECT status FROM service_requests WHERE id = $1', [id]))[0]
  if (!cur) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  if (cur.status !== 'draft') throw new ApiError(409, 'not_editable', 'Só rascunhos podem ser editados. Encerre este pedido e crie outro, se necessário.')
  const v = await validate(body)
  await query(
    `UPDATE service_requests SET client_name=$2, client_phone=$3, profession_id=$4, region_id=$5, neighborhood=$6, title=$7, description=$8, urgency=$9, period_note=$10,
       consent=$11, consent_at = CASE WHEN $11 THEN COALESCE(consent_at, $12) ELSE NULL END, updated_at=$12 WHERE id=$1`,
    [id, v.clientName, v.clientPhone, v.professionId, v.regionId, v.neighborhood, v.title, v.description, v.urgency, v.periodNote, v.consent, now()])
  await audit('admin.request_updated', { userId: adminId, details: { id } })
  if (body.publish === true) return publishRequest(adminId, id)
  return requestDetail(id)
}

export async function publishRequest(adminId: string, id: string) {
  const r = (await query<Row>('SELECT status, consent FROM service_requests WHERE id = $1', [id]))[0]
  if (!r) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  if (r.status !== 'draft') throw new ApiError(409, 'invalid_transition', 'Só rascunhos podem ser publicados.')
  if (!r.consent) throw bad('consent_required', 'Para publicar, confirme que o cliente autorizou o registro e o uso dos dados para intermediação.')
  await query(`UPDATE service_requests SET status = 'published', published_at = $2, updated_at = $2 WHERE id = $1 AND status = 'draft'`, [id, now()])
  await audit('admin.request_published', { userId: adminId, details: { id } })
  return requestDetail(id)
}

export async function closeRequest(adminId: string, id: string) {
  const r = (await query<Row>(`UPDATE service_requests SET status = 'closed', closed_at = $2, updated_at = $2 WHERE id = $1 AND status = 'published' RETURNING id`, [id, now()]))[0]
  if (!r) throw new ApiError(409, 'invalid_transition', 'Só pedidos publicados podem ser encerrados.')
  await audit('admin.request_closed', { userId: adminId, details: { id } })
  return requestDetail(id)
}

export async function deleteDraft(adminId: string, id: string) {
  const r = await query<Row>(`DELETE FROM service_requests WHERE id = $1 AND status = 'draft' RETURNING id`, [id])
  if (!r.length) throw new ApiError(409, 'invalid_transition', 'Só rascunhos podem ser excluídos.')
  await audit('admin.request_deleted', { userId: adminId, details: { id } })
  return { ok: true }
}
