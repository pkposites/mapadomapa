import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query, withTransaction } from '../lib/db'
import { ApiError } from '../lib/http'
import { formatNational } from '../lib/phone'
import { OPTIONS } from '../pro/service'
import { ALL_QUESTIONS, QUESTIONNAIRES } from '../pro/questions'

type Row = Record<string, any>
const STATUSES = ['not_submitted', 'pending_review', 'needs_changes', 'approved', 'rejected', 'suspended'] as const
const bad = (code: string, msg: string) => new ApiError(400, code, msg)

/** Contagem por situação (painel inicial). Contas sem cadastro profissional contam como "não enviado". */
export async function stats() {
  const rows = await query<Row>(
    `SELECT COALESCE(pr.review_status, 'not_submitted') AS s, count(*)::int AS n
     FROM users u LEFT JOIN professional_profiles pr ON pr.user_id = u.id
     WHERE NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = 'admin')
     GROUP BY 1`)
  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const r of rows) byStatus[r.s] = r.n
  const unverified = (await query<Row>(
    `SELECT count(*)::int n FROM phones WHERE is_primary AND verified_at IS NULL`))[0].n
  return { byStatus, unverifiedPhones: unverified }
}

export async function list(params: { status?: unknown; q?: unknown; page?: unknown }) {
  const status = typeof params.status === 'string' && (STATUSES as readonly string[]).includes(params.status) ? params.status : null
  const digits = typeof params.q === 'string' ? params.q.replace(/\D/g, '').slice(0, 13) : ''
  const page = Math.max(1, Math.min(500, Number(params.page) || 1))
  const size = 20
  const rows = await query<Row>(
    `SELECT u.id, ph.e164, (ph.verified_at IS NOT NULL) AS phone_verified, u.created_at, u.status AS user_status,
            COALESCE(pr.review_status, 'not_submitted') AS review_status, pr.submitted_at,
            (SELECT array_agg(p.name ORDER BY p.sort_order) FROM profile_professions x JOIN professions p ON p.id = x.profession_id WHERE x.user_id = u.id) AS professions,
            (SELECT array_agg(r.name ORDER BY r.sort_order) FROM professional_regions y JOIN service_regions r ON r.id = y.region_id WHERE y.user_id = u.id) AS regions,
            (SELECT max(t.technical_score) FROM technical_assessments t WHERE t.user_id = u.id) AS best_score,
            (SELECT count(*) FROM technical_assessments t WHERE t.user_id = u.id AND jsonb_array_length(t.flags) > 0)::int AS flagged
     FROM users u
     JOIN phones ph ON ph.user_id = u.id AND ph.is_primary
     LEFT JOIN professional_profiles pr ON pr.user_id = u.id
     WHERE NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = 'admin')
       AND ($1::text IS NULL OR COALESCE(pr.review_status, 'not_submitted') = $1)
       AND ($2 = '' OR ph.e164 LIKE '%' || $2 || '%')
     ORDER BY (COALESCE(pr.review_status, 'not_submitted') = 'pending_review') DESC, COALESCE(pr.submitted_at, u.created_at) DESC
     LIMIT $3 OFFSET $4`, [status, digits, size + 1, (page - 1) * size])
  return {
    items: rows.slice(0, size).map((r) => ({
      id: r.id as string, phone: formatNational(r.e164), phoneVerified: r.phone_verified as boolean, createdAt: r.created_at,
      accountStatus: r.user_status as string, reviewStatus: r.review_status as string, submittedAt: r.submitted_at,
      professions: (r.professions ?? []) as string[], regions: (r.regions ?? []) as string[], bestScore: r.best_score as number | null, flagged: r.flagged as number,
    })),
    page, hasMore: rows.length > size,
  }
}

/** Dados completos de UM profissional, incluindo respostas do questionário já "traduzidas" em texto. */
export async function detail(adminId: string, userId: string, ip?: string) {
  const u = (await query<Row>(
    `SELECT u.id, u.status, u.created_at, u.last_login_at, ph.e164, ph.verified_at, ph.verified_by
     FROM users u JOIN phones ph ON ph.user_id = u.id AND ph.is_primary WHERE u.id = $1`, [userId]))[0]
  if (!u) throw new ApiError(404, 'not_found', 'Profissional não encontrado.')
  const pr = (await query<Row>('SELECT * FROM professional_profiles WHERE user_id = $1', [userId]))[0]
  const pros = await query<Row>(
    `SELECT p.slug, p.name, x.experience_years, x.self_level FROM profile_professions x JOIN professions p ON p.id = x.profession_id
     WHERE x.user_id = $1 ORDER BY p.sort_order`, [userId])
  const regions = await query<Row>(
    `SELECT r.name FROM professional_regions y JOIN service_regions r ON r.id = y.region_id WHERE y.user_id = $1 ORDER BY r.sort_order`, [userId])
  const answers = await query<Row>(
    `SELECT p.slug, a.question_id, a.choice, a.text_answer FROM assessment_answers a JOIN professions p ON p.id = a.profession_id WHERE a.user_id = $1`, [userId])
  const tech = await query<Row>(
    `SELECT p.slug, t.rule_score, t.ai_score, t.technical_score, t.flags, t.evaluated_at, t.questionnaire_version
     FROM technical_assessments t JOIN professions p ON p.id = t.profession_id WHERE t.user_id = $1`, [userId])
  const ai = await query<Row>(
    `SELECT p.slug, e.provider, e.status, e.score, e.summary, e.flags, e.created_at
     FROM ai_evaluations e JOIN professions p ON p.id = e.profession_id WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 10`, [userId])
  const events = await query<Row>(
    `SELECT e.action, e.from_status, e.to_status, e.notes, e.created_at FROM review_events e WHERE e.user_id = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT 30`, [userId])
  const lv = (id: string | null) => OPTIONS.levels.find((l) => l.id === id)?.label ?? null
  const opt = (list: readonly { id: string; label: string }[], id: string | null) => list.find((o) => o.id === id)?.label ?? null

  await audit('admin.view_professional', { userId: adminId, ip, details: { target: userId } }) // trilha de quem viu dados pessoais

  return {
    id: u.id as string,
    phone: formatNational(u.e164), phoneVerified: Boolean(u.verified_at), phoneVerifiedAt: u.verified_at,
    accountStatus: u.status as string, createdAt: u.created_at, lastLoginAt: u.last_login_at,
    reviewStatus: (pr?.review_status ?? 'not_submitted') as string, submittedAt: pr?.submitted_at ?? null, reviewNotes: pr?.review_notes ?? null, reviewedAt: pr?.reviewed_at ?? null,
    work: pr ? { availability: pr.availability, ownTools: opt(OPTIONS.ownTools, pr.own_tools), vehicle: opt(OPTIONS.vehicle, pr.vehicle), workStructure: opt(OPTIONS.workStructure, pr.work_structure) } : null,
    professions: pros.map((p) => ({ slug: p.slug as string, name: p.name as string, experienceYears: p.experience_years as number | null, level: lv(p.self_level) })),
    regions: regions.map((r) => r.name as string),
    assessments: pros.map((p) => {
      const t = tech.find((x) => x.slug === p.slug)
      const mine = answers.filter((a) => a.slug === p.slug)
      return {
        slug: p.slug as string, name: p.name as string,
        scores: t ? { rule: t.rule_score as number, ai: t.ai_score as number | null, technical: t.technical_score as number, flags: t.flags as string[], evaluatedAt: t.evaluated_at } : null,
        // Para o REVISOR os pontos e riscos são mostrados (o profissional nunca os vê).
        questions: (ALL_QUESTIONS[p.slug] ?? [])
          // v2 mostra as 3 ativas; perguntas antigas (v1) aparecem só se o profissional as respondeu
          .filter((q) => (QUESTIONNAIRES[p.slug] ?? []).some((x) => x.id === q.id) || mine.some((x) => x.question_id === q.id))
          .map((q) => {
          const a = mine.find((x) => x.question_id === q.id)
          if (q.kind === 'choice') {
            const o = q.options.find((x) => x.id === a?.choice)
            return { id: q.id, kind: 'choice' as const, prompt: q.prompt, answer: o?.text ?? null, points: o?.points ?? null, risk: o?.risk ?? null, best: Math.max(...q.options.map((x) => x.points)) }
          }
          return { id: q.id, kind: 'open' as const, prompt: q.prompt, answer: (a?.text_answer as string | undefined) ?? null, points: null, risk: null, best: null }
        }),
      }
    }),
    aiEvaluations: ai.map((e) => ({ profession: e.slug as string, provider: e.provider as string, status: e.status as string, score: e.score as number | null, summary: e.summary as string | null, flags: e.flags as string[], at: e.created_at })),
    history: events.map((e) => ({ action: e.action as string, from: e.from_status as string | null, to: e.to_status as string | null, notes: e.notes as string | null, at: e.created_at })),
  }
}

// ---------- Decisões humanas ----------
const TRANSITIONS: Record<string, { from: string[]; to: string; notesRequired: boolean; label: string }> = {
  approve: { from: ['pending_review'], to: 'approved', notesRequired: false, label: 'aprovar' },
  reject: { from: ['pending_review', 'needs_changes'], to: 'rejected', notesRequired: true, label: 'rejeitar' },
  request_changes: { from: ['pending_review'], to: 'needs_changes', notesRequired: true, label: 'pedir ajustes' },
  suspend: { from: ['approved'], to: 'suspended', notesRequired: true, label: 'suspender' },
  reinstate: { from: ['suspended'], to: 'approved', notesRequired: false, label: 'reativar' },
}

export async function decide(adminId: string, userId: string, body: Record<string, unknown>, ip?: string) {
  const action = typeof body.action === 'string' ? body.action : ''
  const t = TRANSITIONS[action]
  if (!t) throw bad('invalid_action', 'Ação inválida.')
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
  if (t.notesRequired && notes.length < 5) throw bad('notes_required', `Explique o motivo (mínimo 5 caracteres) para ${t.label}.`)
  // Ninguém aprova (nem decide sobre) o próprio cadastro.
  if (adminId === userId) throw new ApiError(403, 'self_review', 'Você não pode decidir sobre o seu próprio cadastro.')

  const result = await withTransaction(async (c) => {
    const cur = await c.query<Row>('SELECT review_status FROM professional_profiles WHERE user_id = $1 FOR UPDATE', [userId])
    if (cur.rows.length === 0) throw new ApiError(409, 'invalid_transition', 'Este cadastro profissional ainda não foi enviado.')
    const from = cur.rows[0].review_status as string
    if (!t.from.includes(from)) throw new ApiError(409, 'invalid_transition', `Não é possível ${t.label} um cadastro que está "${from}".`)
    await c.query('UPDATE professional_profiles SET review_status = $2, reviewed_by = $3, reviewed_at = $4, review_notes = $5, updated_at = $4 WHERE user_id = $1',
      [userId, t.to, adminId, now(), notes || null])
    await c.query('INSERT INTO review_events (user_id, admin_id, action, from_status, to_status, notes) VALUES ($1,$2,$3,$4,$5,$6)', [userId, adminId, action, from, t.to, notes || null])
    return { from, to: t.to }
  })
  await audit('admin.decision', { userId: adminId, ip, details: { target: userId, action, ...result } })
  return { ok: true, reviewStatus: result.to }
}

/** MVP: o celular só fica "verificado" por ato de um administrador. */
export async function setPhoneVerified(adminId: string, userId: string, verified: boolean, ip?: string) {
  const r = await query<Row>(
    `UPDATE phones SET verified_at = $2, verified_by = $3 WHERE user_id = $1 AND is_primary RETURNING 1 AS ok`,
    [userId, verified ? now() : null, verified ? adminId : null])
  if (r.length === 0) throw new ApiError(404, 'not_found', 'Profissional não encontrado.')
  await query('INSERT INTO review_events (user_id, admin_id, action, from_status, to_status) VALUES ($1,$2,$3,NULL,NULL)', [userId, adminId, verified ? 'verify_phone' : 'unverify_phone'])
  await audit('admin.phone_verification', { userId: adminId, ip, details: { target: userId, verified } })
  return { ok: true, phoneVerified: verified }
}

/** Visão pública: apenas aprovados (a view do banco já filtra). */
export async function publicProfessionals() {
  const rows = await query<Row>('SELECT professions, regions, experience_years FROM public_professionals LIMIT 100')
  return { items: rows.map((r) => ({ professions: (r.professions ?? []) as string[], regions: (r.regions ?? []) as string[], experienceYears: r.experience_years as number | null })) }
}
