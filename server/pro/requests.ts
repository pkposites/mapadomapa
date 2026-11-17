import { getRecharge } from '../admin/recharges'
import { audit } from '../lib/audit'
import { query } from '../lib/db'
import { ApiError } from '../lib/http'
import { enforce } from '../lib/rateLimit'
import { URGENCY } from '../admin/requests'

type Row = Record<string, any>
const label = (u: string) => URGENCY.find((x) => x.id === u)?.label ?? u

/**
 * Oportunidades para o PROFISSIONAL. Só entram pedidos PUBLICADOS da profissão e da região do profissional,
 * e só para cadastro APROVADO. Nome, telefone e qualquer dado do cliente nunca saem daqui.
 */
export async function listOpportunities(userId: string) {
  const me = (await query<Row>('SELECT review_status FROM professional_profiles WHERE user_id = $1', [userId]))[0]
  if (me?.review_status !== 'approved') return { allowed: false, items: [] as unknown[] }
  const recharge = await getRecharge(userId)
  const rows = await query<Row>(
    `SELECT r.id, r.title, r.description, r.neighborhood, r.urgency, r.period_note, r.published_at, p.name AS profession, g.name AS region,
            EXISTS (SELECT 1 FROM service_request_interests i WHERE i.request_id = r.id AND i.user_id = $1) AS interested
     FROM service_requests r JOIN professions p ON p.id = r.profession_id JOIN service_regions g ON g.id = r.region_id
     WHERE r.status = 'published'
       AND ($2::boolean OR EXISTS (SELECT 1 FROM service_request_interests old WHERE old.request_id=r.id AND old.user_id=$1))
       AND EXISTS (SELECT 1 FROM profile_professions pp WHERE pp.user_id = $1 AND pp.profession_id = r.profession_id)
       AND EXISTS (SELECT 1 FROM professional_regions pr WHERE pr.user_id = $1 AND pr.region_id = r.region_id)
       AND (EXISTS (SELECT 1 FROM service_request_interests i WHERE i.request_id=r.id AND i.user_id=$1)
         OR (SELECT count(*) FROM service_request_interests i WHERE i.request_id=r.id AND i.selected_at IS NOT NULL) < 2)
     ORDER BY r.published_at DESC, r.id DESC LIMIT 100`, [userId,recharge.canReceive])
  return {
    allowed: true, recharge,
    items: rows.map((r) => ({
      id: String(r.id), title: r.title as string, description: r.description as string, profession: r.profession as string, region: r.region as string,
      neighborhood: r.neighborhood as string, urgency: r.urgency as string, urgencyLabel: label(r.urgency), periodNote: r.period_note as string | null,
      publishedAt: r.published_at, interested: r.interested as boolean,
    })),
  }
}

export async function showInterest(userId: string, id: string) {
  await enforce(`req:interest:${userId}`, 60, 3600)
  const open = await listOpportunities(userId)
  if (!open.allowed) throw new ApiError(403, 'not_approved', 'Pedidos ficam disponíveis para profissionais aprovados.')
  if(open.recharge && !open.recharge.canReceive) throw new ApiError(403,'recharge_required','Renove sua recarga para receber novos pedidos.')
  const req = (await query<Row>('SELECT status FROM service_requests WHERE id = $1', [id]))[0]
  if (req && req.status === 'closed') throw new ApiError(409, 'request_closed', 'Este pedido já foi encerrado.')
  const item = (open.items as { id: string }[]).find((i) => i.id === id)
  if (!item) throw new ApiError(404, 'not_found', 'Pedido não encontrado.') // inexistente, rascunho ou fora do seu perfil
  // Chave primária composta: manifestar duas vezes é impossível (a 2ª chamada não cria nada).
  const r = await query<Row>('INSERT INTO service_request_interests (request_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING request_id', [id, userId])
  if (r.length) await audit('pro.request_interest', { userId, details: { id } })
  return { ok: true, alreadyInterested: r.length === 0 }
}
