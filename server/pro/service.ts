import { audit } from '../lib/audit'
import { now } from '../lib/clock'
import { query, withTransaction } from '../lib/db'
import { ApiError } from '../lib/http'
import { enforce } from '../lib/rateLimit'
import { evaluateOpenAnswer, type AiOutcome } from '../ai'
import { OPEN_MAX_CHARS, OPEN_MIN_CHARS, publicQuestionnaire, QUESTIONNAIRE_VERSION, QUESTIONNAIRES } from './questions'
import { ruleScore, technicalScore, type AnswerMap } from './scoring'

// ---------- Opções oficiais do formulário (fonte única; o front só exibe) ----------
export const OPTIONS = {
  levels: [
    { id: 'beginner', label: 'Iniciante', hint: 'Estou começando' },
    { id: 'intermediate', label: 'Intermediário', hint: 'Faço bem o básico' },
    { id: 'advanced', label: 'Avançado', hint: 'Resolvo a maioria dos casos' },
    { id: 'expert', label: 'Especialista', hint: 'Resolvo casos difíceis' },
  ],
  ownTools: [
    { id: 'none', label: 'Não tenho ferramentas' },
    { id: 'basic', label: 'Algumas ferramentas básicas' },
    { id: 'complete', label: 'Kit completo próprio' },
  ],
  vehicle: [
    { id: 'none', label: 'Sem veículo' },
    { id: 'moto', label: 'Moto' },
    { id: 'car', label: 'Carro' },
    { id: 'van', label: 'Van ou utilitário' },
    { id: 'pickup', label: 'Caminhonete' },
  ],
  workStructure: [
    { id: 'solo', label: 'Trabalho sozinho' },
    { id: 'helper', label: 'Com um ajudante' },
    { id: 'team', label: 'Com equipe' },
    { id: 'company', label: 'Empresa ou MEI estruturado' },
  ],
  weekdays: [
    { id: 'seg', label: 'Seg' }, { id: 'ter', label: 'Ter' }, { id: 'qua', label: 'Qua' }, { id: 'qui', label: 'Qui' },
    { id: 'sex', label: 'Sex' }, { id: 'sab', label: 'Sáb' }, { id: 'dom', label: 'Dom' },
  ],
  periods: [
    { id: 'manha', label: 'Manhã' }, { id: 'tarde', label: 'Tarde' }, { id: 'noite', label: 'Noite' },
  ],
} as const
const ids = (list: readonly { id: string }[]) => list.map((x) => x.id)

const bad = (code: string, message: string, extra: Record<string, unknown> = {}) => new ApiError(400, code, message, extra)
type Row = Record<string, any>

// ---------- Leitura ----------
export async function getCatalog() {
  const professions = await query<Row>('SELECT slug, name FROM professions WHERE active ORDER BY sort_order')
  const regions = await query<Row>('SELECT slug, name FROM service_regions WHERE active ORDER BY sort_order')
  return { professions, regions, options: OPTIONS, limits: { professions: 2, regions: 2, openMin: OPEN_MIN_CHARS, openMax: OPEN_MAX_CHARS } }
}

async function ensureProfile(userId: string): Promise<Row> {
  await query('INSERT INTO professional_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
  return (await query<Row>('SELECT * FROM professional_profiles WHERE user_id = $1', [userId]))[0]
}

export async function getState(userId: string) {
  const profile = await ensureProfile(userId)
  const pros = await query<Row>(
    `SELECT p.slug, p.name, pp.experience_years, pp.self_level
     FROM profile_professions pp JOIN professions p ON p.id = pp.profession_id
     WHERE pp.user_id = $1 ORDER BY p.sort_order`, [userId])
  const regs = await query<Row>(
    `SELECT r.slug FROM professional_regions pr JOIN service_regions r ON r.id = pr.region_id WHERE pr.user_id = $1 ORDER BY r.sort_order`, [userId])
  const ans = await query<Row>(
    `SELECT p.slug, a.question_id, a.choice, a.text_answer
     FROM assessment_answers a JOIN professions p ON p.id = a.profession_id WHERE a.user_id = $1`, [userId])

  const answers: Record<string, Record<string, { choice?: string; text?: string }>> = {}
  for (const a of ans) (answers[a.slug] ??= {})[a.question_id] = { ...(a.choice ? { choice: a.choice } : {}), ...(a.text_answer ? { text: a.text_answer } : {}) }

  const assessment: Record<string, { answered: number; total: number }> = {}
  for (const p of pros) {
    const qs = QUESTIONNAIRES[p.slug] ?? []
    const done = qs.filter((qn) => {
      const a = answers[p.slug]?.[qn.id]
      return qn.kind === 'choice' ? Boolean(a?.choice) : (a?.text ?? '').trim().length >= OPEN_MIN_CHARS
    }).length
    assessment[p.slug] = { answered: done, total: qs.length }
  }
  const av = profile.availability as { weekdays?: string[]; periods?: string[] } | null
  const progress = {
    professions: pros.length >= 1 && pros.length <= 2,
    regions: regs.length >= 1 && regs.length <= 2,
    work:
      pros.length > 0 && pros.every((p) => p.experience_years !== null && p.self_level) &&
      Boolean(av?.weekdays?.length && av?.periods?.length) && Boolean(profile.own_tools && profile.vehicle && profile.work_structure),
    assessment,
    assessmentDone: pros.length > 0 && pros.every((p) => assessment[p.slug].answered === assessment[p.slug].total),
  }
  const nextStep = !progress.professions ? 1 : !progress.regions ? 2 : !progress.work ? 3 : !progress.assessmentDone ? 4 : 5
  const locked = !['not_submitted', 'needs_changes'].includes(profile.review_status)
  return {
    profile: {
      reviewStatus: profile.review_status as string, submittedAt: profile.submitted_at as Date | null, currentStep: profile.current_step as number,
      availability: profile.availability, ownTools: profile.own_tools, vehicle: profile.vehicle, workStructure: profile.work_structure,
    },
    professions: pros.map((p) => ({ slug: p.slug, name: p.name, experienceYears: p.experience_years, selfLevel: p.self_level })),
    regions: regs.map((r) => r.slug as string),
    questionnaires: Object.fromEntries(pros.map((p) => [p.slug, publicQuestionnaire(p.slug)])),
    answers, progress, nextStep, locked,
    // Aviso de produto: nada é aprovado automaticamente.
    approvalNote: 'Seu cadastro será analisado por nossa equipe. Nenhuma aprovação é automática.',
  }
}

async function assertEditable(userId: string): Promise<void> {
  const p = await ensureProfile(userId)
  if (!['not_submitted', 'needs_changes'].includes(p.review_status)) {
    throw new ApiError(409, 'profile_locked', 'Seu cadastro já foi enviado e está em análise. Não é possível alterar agora.')
  }
}
const touch = async (userId: string): Promise<void> => {
  const s = await getState(userId)
  await query('UPDATE professional_profiles SET current_step = $2, updated_at = $3 WHERE user_id = $1', [userId, s.nextStep, now()])
}
const isCheckViolation = (e: unknown) => (e as { code?: string })?.code === '23514'

// ---------- Passo 1: profissões (máx. 2) ----------
export async function setProfessions(userId: string, body: Record<string, unknown>) {
  await assertEditable(userId)
  const slugs = body.professions
  if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string') || new Set(slugs).size !== slugs.length) {
    throw bad('invalid_professions', 'Escolha as profissões da lista.')
  }
  if (slugs.length < 1) throw bad('professions_required', 'Escolha pelo menos 1 profissão.')
  if (slugs.length > 2) throw bad('too_many_professions', 'Você pode escolher no máximo 2 profissões.')
  const valid = await query<Row>('SELECT id, slug FROM professions WHERE active AND slug = ANY($1::text[])', [slugs])
  if (valid.length !== slugs.length) throw bad('invalid_professions', 'Escolha as profissões da lista.')
  try {
    await withTransaction(async (c) => {
      await c.query('SELECT 1 FROM profiles WHERE user_id = $1 FOR UPDATE', [userId])
      const keep = valid.map((v) => v.id)
      // Profissão removida => some também o que dependia dela (respostas e pontuação antiga).
      await c.query('DELETE FROM assessment_answers WHERE user_id = $1 AND profession_id <> ALL($2::smallint[])', [userId, keep])
      await c.query('DELETE FROM technical_assessments WHERE user_id = $1 AND profession_id <> ALL($2::smallint[])', [userId, keep])
      await c.query('DELETE FROM profile_professions WHERE user_id = $1 AND profession_id <> ALL($2::smallint[])', [userId, keep])
      // Insere só o que é NOVO: o gatilho do banco conta a linha antes do ON CONFLICT, então reenviar a
      // mesma seleção (voltar ao passo e continuar) não pode tentar inserir de novo.
      const have = new Set((await c.query<{ profession_id: number }>('SELECT profession_id FROM profile_professions WHERE user_id = $1', [userId])).rows.map((r) => r.profession_id))
      for (const v of valid) if (!have.has(v.id)) await c.query('INSERT INTO profile_professions (user_id, profession_id) VALUES ($1, $2)', [userId, v.id])
    })
  } catch (e) {
    if (isCheckViolation(e)) throw bad('too_many_professions', 'Você pode escolher no máximo 2 profissões.')
    throw e
  }
  await touch(userId)
  return getState(userId)
}

// ---------- Passo 2: regiões (máx. 2) ----------
export async function setRegions(userId: string, body: Record<string, unknown>, opts: { anyStatus?: boolean } = {}) {
  if (!opts.anyStatus) await assertEditable(userId)
  const slugs = body.regions
  if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string') || new Set(slugs).size !== slugs.length) throw bad('invalid_regions', 'Escolha as regiões da lista.')
  if (slugs.length < 1) throw bad('regions_required', 'Escolha pelo menos 1 região.')
  if (slugs.length > 2) throw bad('too_many_regions', 'Você pode escolher no máximo 2 regiões.')
  const valid = await query<Row>('SELECT id FROM service_regions WHERE active AND slug = ANY($1::text[])', [slugs])
  if (valid.length !== slugs.length) throw bad('invalid_regions', 'Escolha as regiões da lista.')
  try {
    await withTransaction(async (c) => {
      await c.query('SELECT 1 FROM profiles WHERE user_id = $1 FOR UPDATE', [userId])
      await c.query('DELETE FROM professional_regions WHERE user_id = $1 AND region_id <> ALL($2::smallint[])', [userId, valid.map((v) => v.id)])
      const have = new Set((await c.query<{ region_id: number }>('SELECT region_id FROM professional_regions WHERE user_id = $1', [userId])).rows.map((r) => r.region_id))
      for (const v of valid) if (!have.has(v.id)) await c.query('INSERT INTO professional_regions (user_id, region_id) VALUES ($1, $2)', [userId, v.id])
    })
  } catch (e) {
    if (isCheckViolation(e)) throw bad('too_many_regions', 'Você pode escolher no máximo 2 regiões.')
    throw e
  }
  await touch(userId)
  return getState(userId)
}

// ---------- Passo 3: experiência, disponibilidade, ferramentas, veículo e estrutura ----------
export async function setWork(userId: string, body: Record<string, unknown>, opts: { anyStatus?: boolean } = {}) {
  if (!opts.anyStatus) await assertEditable(userId)
  const selected = await query<Row>('SELECT p.slug, p.id FROM profile_professions pp JOIN professions p ON p.id = pp.profession_id WHERE pp.user_id = $1', [userId])
  if (selected.length === 0) throw new ApiError(409, 'select_professions_first', 'Escolha suas profissões primeiro.')

  const exp = body.experience as Record<string, { years?: unknown; level?: unknown }> | undefined
  if (!exp || typeof exp !== 'object') throw bad('invalid_experience', 'Informe a experiência em cada profissão.')
  const rows: { id: number; years: number; level: string }[] = []
  for (const s of selected) {
    const e = exp[s.slug]
    if (!e || !Number.isInteger(e.years) || (e.years as number) < 0 || (e.years as number) > 60) throw bad('invalid_experience', 'Informe há quantos anos você trabalha em cada profissão (0 a 60).')
    if (typeof e.level !== 'string' || !ids(OPTIONS.levels).includes(e.level)) throw bad('invalid_level', 'Escolha o seu nível de conhecimento em cada profissão.')
    rows.push({ id: s.id, years: e.years as number, level: e.level })
  }
  const av = body.availability as { weekdays?: unknown; periods?: unknown; emergency?: unknown } | undefined
  const okList = (v: unknown, allowed: string[]) => Array.isArray(v) && v.length >= 1 && new Set(v).size === v.length && v.every((x) => typeof x === 'string' && allowed.includes(x))
  if (!av || !okList(av.weekdays, ids(OPTIONS.weekdays)) || !okList(av.periods, ids(OPTIONS.periods))) throw bad('invalid_availability', 'Escolha pelo menos 1 dia e 1 período em que você atende.')
  const pick = (v: unknown, list: readonly { id: string }[], msg: string) => {
    if (typeof v !== 'string' || !ids(list).includes(v)) throw bad('invalid_work', msg)
    return v
  }
  const ownTools = pick(body.ownTools, OPTIONS.ownTools, 'Informe se você tem ferramentas próprias.')
  const vehicle = pick(body.vehicle, OPTIONS.vehicle, 'Informe se você tem veículo.')
  const workStructure = pick(body.workStructure, OPTIONS.workStructure, 'Informe como você trabalha (sozinho, equipe...).')

  await withTransaction(async (c) => {
    for (const r of rows) await c.query('UPDATE profile_professions SET experience_years = $3, self_level = $4 WHERE user_id = $1 AND profession_id = $2', [userId, r.id, r.years, r.level])
    await c.query(
      'UPDATE professional_profiles SET availability = $2, own_tools = $3, vehicle = $4, work_structure = $5, updated_at = $6 WHERE user_id = $1',
      [userId, JSON.stringify({ weekdays: av.weekdays, periods: av.periods, emergency: av.emergency === true }), ownTools, vehicle, workStructure, now()],
    )
  })
  await touch(userId)
  return getState(userId)
}

// ---------- Passo 4: respostas do questionário (salvamento parcial permitido) ----------
export async function saveAnswers(userId: string, body: Record<string, unknown>) {
  await assertEditable(userId)
  await enforce(`pro:save:${userId}`, 240, 60) // anti-abuso: até 240 salvamentos por minuto
  const slug = body.profession
  if (typeof slug !== 'string') throw bad('invalid_profession', 'Profissão inválida.')
  const mine = await query<Row>('SELECT p.id FROM profile_professions pp JOIN professions p ON p.id = pp.profession_id WHERE pp.user_id = $1 AND p.slug = $2', [userId, slug])
  if (!mine[0]) throw bad('invalid_profession', 'Essa profissão não está no seu cadastro.')
  const list = body.answers
  if (!Array.isArray(list) || list.length === 0 || list.length > 10) throw bad('invalid_answers', 'Respostas inválidas.')
  const questions = QUESTIONNAIRES[slug] ?? []
  const clean: { qid: string; choice: string | null; text: string | null }[] = []
  for (const item of list as Row[]) {
    const qn = questions.find((x) => x.id === item?.questionId)
    if (!qn) throw bad('invalid_question', 'Pergunta inválida.')
    if (qn.kind === 'choice') {
      if (typeof item.choice !== 'string' || !qn.options.some((op) => op.id === item.choice)) throw bad('invalid_choice', 'Escolha uma das opções.')
      clean.push({ qid: qn.id, choice: item.choice, text: null })
    } else {
      // eslint-disable-next-line no-control-regex
      const text = typeof item.text === 'string' ? item.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : ''
      if (text.length === 0) throw bad('invalid_text', 'Escreva a sua resposta.')
      if (text.length > OPEN_MAX_CHARS) throw bad('text_too_long', `Escreva no máximo ${OPEN_MAX_CHARS} caracteres.`)
      clean.push({ qid: qn.id, choice: null, text })
    }
  }
  await withTransaction(async (c) => {
    for (const a of clean) {
      await c.query(
        `INSERT INTO assessment_answers (user_id, profession_id, question_id, choice, text_answer, updated_at) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, profession_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, text_answer = EXCLUDED.text_answer, updated_at = EXCLUDED.updated_at`,
        [userId, mine[0].id, a.qid, a.choice, a.text, now()])
    }
  })
  await touch(userId)
  return getState(userId)
}

// ---------- Passo 5: envio para análise ----------
export async function submit(userId: string, ip?: string) {
  await assertEditable(userId)
  await enforce(`pro:submit:${userId}`, 5, 3600)
  const s = await getState(userId)
  const missing: string[] = []
  if (!s.progress.professions) missing.push('professions')
  if (!s.progress.regions) missing.push('regions')
  if (!s.progress.work) missing.push('work')
  if (!s.progress.assessmentDone) missing.push('assessment')
  if (missing.length) throw new ApiError(422, 'profile_incomplete', 'Falta preencher algumas etapas antes de enviar.', { missing, nextStep: s.nextStep })

  // 1) Avaliações (a IA, quando ligada, roda FORA da transação). Nada aqui aprova ou reprova ninguém.
  const evals: { slug: string; id: number; rule: ReturnType<typeof ruleScore>; ai: AiOutcome }[] = []
  for (const p of s.professions) {
    const idRow = (await query<Row>('SELECT id FROM professions WHERE slug = $1', [p.slug]))[0]
    const answers: AnswerMap = s.answers[p.slug] ?? {}
    const openQ = (QUESTIONNAIRES[p.slug] ?? []).find((x) => x.kind === 'open') // v2 não tem pergunta aberta
    const ai: AiOutcome = openQ ? await evaluateOpenAnswer(p.slug, p.name, answers[openQ.id]?.text ?? '') : { status: 'off' }
    evals.push({ slug: p.slug, id: idRow.id, rule: ruleScore(p.slug, answers), ai })
  }

  await withTransaction(async (c) => {
    // Só passa de "não enviado/ajustes" para "em análise". NUNCA para aprovado.
    const claimed = await c.query<Row>(
      `UPDATE professional_profiles SET review_status = 'pending_review', submitted_at = $2, current_step = 5, updated_at = $2
       WHERE user_id = $1 AND review_status IN ('not_submitted', 'needs_changes') RETURNING user_id`, [userId, now()])
    if (claimed.rows.length === 0) throw new ApiError(409, 'profile_locked', 'Seu cadastro já foi enviado e está em análise.')
    for (const e of evals) {
      const aiScore = e.ai.status === 'ok' ? e.ai.result.score : null
      const flags = [...e.rule.flags, ...(e.ai.status === 'ok' ? e.ai.result.flags : []), ...(e.ai.status === 'failed' ? ['avaliacao_ia_falhou'] : [])]
      await c.query(
        `INSERT INTO technical_assessments (user_id, profession_id, questionnaire_version, rule_score, ai_score, technical_score, flags, evaluated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, profession_id) DO UPDATE SET questionnaire_version = EXCLUDED.questionnaire_version, rule_score = EXCLUDED.rule_score,
           ai_score = EXCLUDED.ai_score, technical_score = EXCLUDED.technical_score, flags = EXCLUDED.flags, evaluated_at = EXCLUDED.evaluated_at`,
        [userId, e.id, QUESTIONNAIRE_VERSION, e.rule.score, aiScore, technicalScore(e.rule.score, aiScore), JSON.stringify([...new Set(flags)]), now()])
      if (e.ai.status !== 'off') {
        await c.query(
          'INSERT INTO ai_evaluations (user_id, profession_id, provider, model, status, score, summary, flags, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [userId, e.id, e.ai.provider, e.ai.model, e.ai.status, e.ai.status === 'ok' ? e.ai.result.score : null,
           e.ai.status === 'ok' ? e.ai.result.summary : null, JSON.stringify(e.ai.status === 'ok' ? e.ai.result.flags : []), e.ai.status === 'failed' ? e.ai.error : null])
      }
    }
  })
  await audit('pro.submitted', { userId, ip, details: { professions: s.professions.map((p) => p.slug) } })
  const state = await getState(userId)
  // O usuário NÃO vê pontuações (evita "treinar" respostas); elas são para a revisão administrativa futura.
  return { ok: true, reviewStatus: state.profile.reviewStatus, approvalNote: state.approvalNote }
}
