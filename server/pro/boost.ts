import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query } from '../lib/db'
import { ApiError } from '../lib/http'
import { formatNational } from '../lib/phone'

type Row = Record<string, any>
export const BUDGETS = [
  { id: 'ate_50', label: 'Até R$ 50 por mês' },
  { id: '50_100', label: 'De R$ 50 a R$ 100 por mês' },
  { id: '100_200', label: 'De R$ 100 a R$ 200 por mês' },
  { id: 'acima_200', label: 'Mais de R$ 200 por mês' },
  { id: 'ver_valores', label: 'Prefiro ver os valores antes' },
] as const
export const PRIORITIES = [
  { id: 'primeiro', label: 'Aparecer primeiro na minha região' },
  { id: 'apresentacao', label: 'Ter uma apresentação mais completa do meu perfil' },
  { id: 'selo', label: 'Ter um selo de profissional em destaque' },
  { id: 'avisos', label: 'Receber os pedidos antes dos outros' },
] as const
const ids = (l: readonly { id: string }[]) => l.map((x) => x.id)
// eslint-disable-next-line no-control-regex
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : '')

export async function getBoost(userId: string) {
  const r = (await query<Row>('SELECT budget, priorities, note, updated_at FROM boost_interests WHERE user_id = $1', [userId]))[0]
  return { options: { budgets: BUDGETS, priorities: PRIORITIES }, interest: r ? { budget: r.budget as string, priorities: r.priorities as string[], note: (r.note ?? '') as string, at: r.updated_at } : null }
}

export async function setBoost(userId: string, body: Record<string, unknown>) {
  if (typeof body.budget !== 'string' || !ids(BUDGETS).includes(body.budget)) throw new ApiError(400, 'invalid_budget', 'Escolha uma opção de investimento.')
  const pr = body.priorities
  if (!Array.isArray(pr) || pr.length < 1 || pr.length > 4 || new Set(pr).size !== pr.length || pr.some((p) => typeof p !== 'string' || !ids(PRIORITIES).includes(p))) {
    throw new ApiError(400, 'invalid_priorities', 'Escolha o que mais importa para você (de 1 a 4 itens).')
  }
  const note = clean(body.note).slice(0, 300)
  const first = (await query('SELECT 1 FROM boost_interests WHERE user_id = $1', [userId])).length === 0
  await query(
    `INSERT INTO boost_interests (user_id, budget, priorities, note, updated_at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET budget = EXCLUDED.budget, priorities = EXCLUDED.priorities, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
    [userId, body.budget, pr, note || null, now()])
  if (first) { // a equipe vê o interesse na caixa de mensagens do profissional
    await query(`INSERT INTO messages (user_id, sender, sender_user_id, kind, body) VALUES ($1,'professional',$1,'message',$2)`,
      [userId, 'Tenho interesse no plano de destaque do Mapa do Mapa. Quero saber mais quando estiver disponível.'])
  }
  await audit('pro.boost_interest', { userId, details: { budget: body.budget } })
  return getBoost(userId)
}

export async function removeBoost(userId: string) {
  await query('DELETE FROM boost_interests WHERE user_id = $1', [userId])
  return getBoost(userId)
}

// ---------- Administração ----------
export async function adminBoost() {
  const rows = await query<Row>(
    `SELECT b.user_id, b.budget, b.priorities, b.note, b.updated_at, pr.full_name, pr.review_status, ph.e164,
            (SELECT array_agg(p.name ORDER BY p.sort_order) FROM profile_professions x JOIN professions p ON p.id = x.profession_id WHERE x.user_id = b.user_id) AS professions,
            (SELECT array_agg(r.name ORDER BY r.sort_order) FROM professional_regions y JOIN service_regions r ON r.id = y.region_id WHERE y.user_id = b.user_id) AS regions
     FROM boost_interests b JOIN users u ON u.id = b.user_id
     LEFT JOIN professional_profiles pr ON pr.user_id = b.user_id LEFT JOIN phones ph ON ph.user_id = b.user_id AND ph.is_primary
     ORDER BY b.updated_at DESC LIMIT 300`)
  const byBudget = Object.fromEntries(BUDGETS.map((b) => [b.id, 0])) as Record<string, number>
  for (const r of rows) byBudget[r.budget as string]++
  const totalPros = (await query<Row>(`SELECT count(*)::int n FROM users u WHERE u.status = 'active' AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = 'admin')`))[0].n
  return {
    total: rows.length, totalProfessionals: totalPros as number, byBudget, budgets: BUDGETS, priorities: PRIORITIES,
    items: rows.map((r) => ({
      id: r.user_id as string, name: r.full_name as string | null, phone: r.e164 ? formatNational(r.e164) : null, status: (r.review_status ?? 'not_submitted') as string,
      budget: r.budget as string, priorities: r.priorities as string[], note: r.note as string | null, at: r.updated_at,
      professions: (r.professions ?? []) as string[], regions: (r.regions ?? []) as string[],
    })),
  }
}
