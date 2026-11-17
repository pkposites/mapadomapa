import { accessPredicate, getRecharge } from './recharges'
import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query, withTransaction } from '../lib/db'
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
     WHERE pr.review_status = 'approved' AND ${accessPredicate('u.id')}`, [professionId, regionId])
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
  const trashed = status === 'trash'
  const rows = await query<Row>(`${SELECT} WHERE (CASE WHEN $2::boolean THEN r.deleted_at IS NOT NULL ELSE r.deleted_at IS NULL END) AND ($1::text IS NULL OR r.status = $1) ORDER BY COALESCE(r.deleted_at,r.created_at) DESC, r.id DESC LIMIT 200`, [st,trashed])
  const counts = await query<Row>(`SELECT CASE WHEN deleted_at IS NOT NULL THEN 'trash' ELSE status END AS status, count(*)::int n FROM service_requests GROUP BY 1`)
  return { items: rows.map(summary), counts: Object.fromEntries(['draft', 'published', 'closed', 'trash'].map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])), urgency: URGENCY }
}

export async function requestDetail(id: string) {
  const r = (await query<Row>(`${SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]))[0]
  if (!r) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  const interested = await query<Row>(
    `SELECT i.created_at, i.selected_at, i.contact_delivered_at, ${accessPredicate('u.id')} AS can_receive, u.id AS user_id, pr.full_name, ph.e164, ph.verified_at,
            (SELECT array_agg(p.name ORDER BY p.sort_order) FROM profile_professions x JOIN professions p ON p.id = x.profession_id WHERE x.user_id = u.id) AS professions,
            (SELECT array_agg(g.name ORDER BY g.sort_order) FROM professional_regions y JOIN service_regions g ON g.id = y.region_id WHERE y.user_id = u.id) AS regions
     FROM service_request_interests i JOIN users u ON u.id = i.user_id
     LEFT JOIN professional_profiles pr ON pr.user_id = u.id LEFT JOIN phones ph ON ph.user_id = u.id AND ph.is_primary
     WHERE i.request_id = $1 ORDER BY i.created_at`, [id])
  const compatible = r.status === 'published' ? await query<Row>(
    `SELECT u.id AS user_id, p.full_name, ph.e164, ph.verified_at, p.review_status,
       (SELECT max(t.technical_score) FROM technical_assessments t WHERE t.user_id=u.id) AS score,
       (SELECT count(*) FROM service_request_invites v WHERE v.request_id=$1 AND v.user_id=u.id)>0 AS invited,
       EXISTS (SELECT 1 FROM profile_professions pp WHERE pp.user_id=u.id AND pp.profession_id=$2) AS profession_match,
       EXISTS (SELECT 1 FROM professional_regions rg WHERE rg.user_id=u.id AND rg.region_id=$3) AS region_match,
       (CASE WHEN NULLIF(trim(p.full_name),'') IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN NULLIF(trim(p.bio),'') IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN NULLIF(trim(p.services),'') IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM profile_photos x WHERE x.user_id=u.id) THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM profile_professions x WHERE x.user_id=u.id) THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM professional_regions x WHERE x.user_id=u.id) THEN 1 ELSE 0 END) AS completeness,
       ${accessPredicate('u.id')} AS can_receive
       FROM professional_profiles p JOIN users u ON u.id=p.user_id
       LEFT JOIN phones ph ON ph.user_id=u.id AND ph.is_primary
       WHERE u.status='active' AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles rl ON rl.id=ur.role_id WHERE ur.user_id=u.id AND rl.name='admin')
       AND NOT EXISTS (SELECT 1 FROM service_request_interests i WHERE i.request_id=$1 AND i.user_id=u.id)
       ORDER BY p.full_name NULLS LAST, u.id`, [id, r.profession_id, r.region_id]) : []
  const source = (await query<Row>('SELECT contact_preference, photo_reference FROM deforafora_intake WHERE converted_request_id = $1', [id]))[0]
  return {
    ...summary(r), routingMode: r.routing_mode, origin: source ? 'De fora a fora' : null, contactPreference: source?.contact_preference ?? null, photoReference: source?.photo_reference ?? null, description: r.description as string, periodNote: r.period_note as string | null, consent: r.consent as boolean, consentAt: r.consent_at,
    professionSlug: r.profession_slug as string, regionSlug: r.region_slug as string,
    client: { name: r.client_name as string, phone: formatNational(r.client_phone), whatsapp: String(r.client_phone).replace(/\D/g, '') },
    eligible: await eligibleCount(r.profession_id, r.region_id), urgencyOptions: URGENCY,
    compatible: compatible.map((i) => ({
      id: i.user_id as string, name: (i.full_name ?? null) as string | null,
      phone: i.e164 ? formatNational(i.e164) : null, whatsapp: i.e164 ? String(i.e164).replace(/\D/g, '') : null,
      phoneVerified: Boolean(i.verified_at), score: i.score == null ? null : Number(i.score), completeness: Number(i.completeness), invited: Boolean(i.invited), professionMatch: Boolean(i.profession_match), regionMatch: Boolean(i.region_match), canReceive: Boolean(i.can_receive), reviewStatus: i.review_status,
    })),
    interested: interested.map((i) => ({
      id: i.user_id as string, name: (i.full_name ?? null) as string | null, phone: i.e164 ? formatNational(i.e164) : null, whatsapp: i.e164 ? String(i.e164).replace(/\D/g, '') : null,
      phoneVerified: Boolean(i.verified_at), professions: (i.professions ?? []) as string[], regions: (i.regions ?? []) as string[], at: i.created_at, selectedAt: i.selected_at ?? null, deliveredAt:i.contact_delivered_at??null, canReceive:Boolean(i.can_receive),
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
  const cur = (await query<Row>('SELECT status FROM service_requests WHERE id = $1 AND deleted_at IS NULL', [id]))[0]
  if (!cur) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  if (cur.status !== 'draft') throw new ApiError(409, 'not_editable', 'Só rascunhos podem ser editados. Encerre este pedido e crie outro, se necessário.')
  const v = await validate(body)
  await query(
    `UPDATE service_requests SET client_name=$2, client_phone=$3, profession_id=$4, region_id=$5, neighborhood=$6, title=$7, description=$8, urgency=$9, period_note=$10,
       consent=$11, consent_at = CASE WHEN $11 THEN COALESCE(consent_at, $12) ELSE NULL END, updated_at=$12 WHERE id=$1 AND deleted_at IS NULL`,
    [id, v.clientName, v.clientPhone, v.professionId, v.regionId, v.neighborhood, v.title, v.description, v.urgency, v.periodNote, v.consent, now()])
  await audit('admin.request_updated', { userId: adminId, details: { id } })
  if (body.publish === true) return publishRequest(adminId, id)
  return requestDetail(id)
}

export async function publishRequest(adminId: string, id: string) {
  const r = (await query<Row>('SELECT status, consent FROM service_requests WHERE id = $1 AND deleted_at IS NULL', [id]))[0]
  if (!r) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  if (r.status !== 'draft') throw new ApiError(409, 'invalid_transition', 'Só rascunhos podem ser publicados.')
  if (!r.consent) throw bad('consent_required', 'Para publicar, confirme que o cliente autorizou o registro e o uso dos dados para intermediação.')
  await query(`UPDATE service_requests SET status = 'published', published_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL AND status = 'draft'`, [id, now()])
  await audit('admin.request_published', { userId: adminId, details: { id } })
  return requestDetail(id)
}

export async function closeRequest(adminId: string, id: string) {
  const r = (await query<Row>(`UPDATE service_requests SET status = 'closed', closed_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL AND status = 'published' RETURNING id`, [id, now()]))[0]
  if (!r) throw new ApiError(409, 'invalid_transition', 'Só pedidos publicados podem ser encerrados.')
  await audit('admin.request_closed', { userId: adminId, details: { id } })
  return requestDetail(id)
}

export async function deleteRequest(adminId: string, id: string) {
  const r = await query<Row>(`UPDATE service_requests SET deleted_at=$2,updated_at=$2 WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [id,now()])
  if (!r.length) throw new ApiError(404, 'not_found', 'Pedido não encontrado ou já excluído.')
  await audit('admin.request_deleted', { userId: adminId, details: { id } })
  return { ok: true }
}

export async function restoreRequest(adminId: string, id: string) {
  const r = await query<Row>(`UPDATE service_requests SET deleted_at=NULL,updated_at=$2 WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`, [id,now()])
  if (!r.length) throw new ApiError(404,'not_found','Pedido não está na lixeira.')
  await audit('admin.request_restored', { userId: adminId, details: { id } })
  return { ok: true }
}

/** Converte uma entrada privada, revisada pelo admin, em um pedido no fluxo existente. */
export async function convertIntake(adminId: string, intakeId: string, body: Record<string, unknown>) {
  const v = await validate(body)
  const publish = body.publish === true
  if (publish && !v.consent) throw bad('consent_required', 'Confirme a autorização do cliente.')
  const id = await withTransaction(async (tx) => {
    const raw = (await query<Row>('SELECT * FROM deforafora_intake WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [intakeId], tx))[0]
    if (!raw) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
    if (raw.converted_request_id) return String(raw.converted_request_id)
    const [r] = await query<Row>(
      `INSERT INTO service_requests (status,client_name,client_phone,profession_id,region_id,neighborhood,title,description,urgency,period_note,consent,consent_at,created_by,published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [publish ? 'published' : 'draft', v.clientName, v.clientPhone, v.professionId, v.regionId, v.neighborhood, v.title, v.description, v.urgency, v.periodNote, v.consent, v.consent ? raw.received_at : null, adminId, publish ? now() : null], tx)
    await query('UPDATE deforafora_intake SET converted_request_id = $2 WHERE id = $1', [intakeId, r.id], tx)
    return String(r.id)
  })
  await audit('admin.deforafora_converted', { userId: adminId, details: { id } })
  return requestDetail(id)
}

/** Seleção definitiva: máximo de dois interessados elegíveis, mesmo com admins simultâneos. */
export async function selectInterest(adminId: string, id: string, userId: string, confirmedViaWhatsApp = false) {
  await withTransaction(async (tx) => {
    const r = (await query<Row>('SELECT status, consent, profession_id, region_id FROM service_requests WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id], tx))[0]
    if (!r || r.status !== 'published' || !r.consent) throw new ApiError(409, 'not_open', 'Pedido não está aberto ou autorizado.')
    const interest = (await query<Row>('SELECT selected_at FROM service_request_interests WHERE request_id = $1 AND user_id = $2', [id, userId], tx))[0]
    if (!interest && !confirmedViaWhatsApp) throw new ApiError(404, 'not_interested', 'Profissional não manifestou interesse.')
    if (interest?.selected_at) return
    const [{ n }] = await query<Row>('SELECT count(*)::int AS n FROM service_request_interests WHERE request_id = $1 AND selected_at IS NOT NULL', [id], tx)
    if (n >= 2) throw new ApiError(409, 'selection_limit', 'Já foram selecionados dois profissionais.')
    const eligible = (await query<Row>(`SELECT 1 FROM professional_profiles p JOIN users u ON u.id=p.user_id
      WHERE p.user_id=$1 AND u.status='active' AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles rl ON rl.id=ur.role_id WHERE ur.user_id=u.id AND rl.name='admin')`, [userId], tx))[0]
    if (!eligible) throw new ApiError(409, 'not_eligible', 'Conta desativada ou não disponível.')
    const recharge = await getRecharge(userId,tx)
    // A administração só confirma por WhatsApp depois de receber o aceite explícito.
    if (!interest && confirmedViaWhatsApp) await query('INSERT INTO service_request_interests (request_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id,userId], tx)
    await query('UPDATE service_request_interests SET selected_at=$3, recharge_cycle_id=$4 WHERE request_id=$1 AND user_id=$2', [id,userId,now(),recharge.active?recharge.cycleId:null], tx)
  })
  await audit('admin.request_professional_selected', { userId: adminId, details: { id, professionalId: userId, confirmedViaWhatsApp } })
  return requestDetail(id)
}

export async function markDelivered(adminId:string,id:string,userId:string) {
  const [r]=await query<Row>(`UPDATE service_request_interests i SET contact_delivered_at=COALESCE(i.contact_delivered_at,now()) FROM service_requests r WHERE i.request_id=r.id AND r.id=$1 AND i.user_id=$2 AND i.selected_at IS NOT NULL AND r.consent AND r.deleted_at IS NULL RETURNING i.request_id`,[id,userId])
  if(!r) throw new ApiError(409,'not_selected','Selecione o profissional e confirme a autorização antes do repasse.')
  await audit('admin.request_contact_delivered',{userId:adminId,details:{id,professionalId:userId}})
  return requestDetail(id)
}

export async function setRouting(adminId: string, id: string, body: Record<string, unknown>) {
  const mode = body.mode
  if (mode !== 'manual' && mode !== 'automatic') throw bad('invalid_mode', 'Escolha o modo de distribuição.')
  const rows = await query<Row>("UPDATE service_requests SET routing_mode=$2 WHERE id=$1 AND deleted_at IS NULL AND status <> 'closed' RETURNING id", [id,mode])
  if (!rows.length) throw new ApiError(409,'not_open','Pedido encerrado ou inexistente.')
  await audit('admin.request_routing',{userId:adminId,details:{id,mode}})
  return requestDetail(id)
}

export async function inviteProfessional(adminId: string, id: string, userId: string, body: Record<string, unknown>) {
  await withTransaction(async tx => {
    const r = (await query<Row>("SELECT status,consent FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id],tx))[0]
    if (!r || r.status !== 'published' || !r.consent) throw new ApiError(409,'not_open','Pedido não está publicado ou autorizado.')
    if (body.invite === false) {
      const selected = (await query<Row>('SELECT selected_at FROM service_request_interests WHERE request_id=$1 AND user_id=$2',[id,userId],tx))[0]
      if (selected?.selected_at) throw new ApiError(409,'already_selected','Profissional já selecionado.')
      await query('DELETE FROM service_request_invites WHERE request_id=$1 AND user_id=$2',[id,userId],tx)
    } else if (body.invite === true) {
      const eligible = (await query<Row>(`SELECT 1 FROM professional_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.status='active' AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles rl ON rl.id=ur.role_id WHERE ur.user_id=u.id AND rl.name='admin')`,[userId],tx))[0]
      if (!eligible) throw new ApiError(409,'not_eligible','Conta desativada ou não disponível.')
      await query('INSERT INTO service_request_invites(request_id,user_id,invited_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[id,userId,adminId],tx)
    } else throw bad('invalid_invite','Escolha liberar ou retirar.')
  })
  await audit('admin.request_invite',{userId:adminId,details:{id,professionalId:userId,invite:body.invite}})
  return requestDetail(id)
}
