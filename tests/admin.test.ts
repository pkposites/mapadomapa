import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { QUESTIONNAIRES } from '../server/pro/questions'
import { api, advance, cleanDb, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
const saved = { ...process.env }
beforeEach(async () => {
  await cleanDb()
  await query('TRUNCATE technical_assessments, ai_evaluations, assessment_answers, professional_profiles, professional_regions, profile_professions, review_events CASCADE')
  process.env.VERIFICATION_MODE = 'admin'; delete process.env.PASSWORD_RECOVERY
})
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved) })

const PASS = 'senha-admin-teste-42'
let phoneSeq = 0
async function mkUser(label: string) {
  const digits = `119${String(1000 + ++phoneSeq).padStart(4, '0')}${String(1111 + phoneSeq).slice(-4)}`
  const r = await api('POST', '/auth/register', { body: { phone: digits, password: PASS, acceptTerms: true }, ip: `10.${phoneSeq}.0.1` })
  if (r.status !== 200) throw new Error(label + ': ' + JSON.stringify(r.body))
  const [{ id }] = await query<any>('SELECT user_id AS id FROM phones WHERE e164 = $1', ['+55' + digits])
  return { cookie: r.cookie!, id: id as string, phone: digits }
}
const mkAdmin = async () => { const a = await mkUser('admin'); await query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'admin'", [a.id]); return a }
const best = (slug: string) => QUESTIONNAIRES[slug].map((q) => q.kind === 'choice'
  ? { questionId: q.id, choice: q.options.find((o) => o.points === 3)!.id }
  : { questionId: q.id, text: 'Primeiro verifico a origem, faço teste e explico o orçamento ao cliente com segurança.' })
/** Cadastro profissional completo e ENVIADO. */
async function mkPro(slugs = ['pintores']) {
  const u = await mkUser('pro')
  const call = (m: string, p: string, body?: unknown) => api(m, p, { cookie: u.cookie, body })
  await call('PUT', '/pro/professions', { professions: slugs })
  await call('PUT', '/pro/regions', { regions: ['zona-sul'] })
  await call('PUT', '/pro/work', { experience: Object.fromEntries(slugs.map((s) => [s, { years: 7, level: 'advanced' }])), availability: { weekdays: ['seg'], periods: ['manha'], emergency: false }, ownTools: 'complete', vehicle: 'car', workStructure: 'solo' })
  for (const s of slugs) await call('PUT', '/pro/answers', { profession: s, answers: best(s) })
  const sub = await call('POST', '/pro/submit')
  if (sub.status !== 200) throw new Error('submit: ' + JSON.stringify(sub.body))
  return { ...u, call }
}
const decide = (admin: { cookie: string }, id: string, action: string, notes?: string) => api('POST', `/admin/professionals/${id}/decision`, { cookie: admin.cookie, body: { action, notes } })
const status = async (id: string) => (await query<any>('SELECT review_status FROM professional_profiles WHERE user_id = $1', [id]))[0]?.review_status

describe('Acesso exclusivo para administrador', () => {
  it('anônimo = 401, profissional comum = 403, admin = 200 em TODAS as rotas', async () => {
    const admin = await mkAdmin(); const pro = await mkPro()
    const routes: [string, string, unknown?][] = [['GET', '/admin/stats'], ['GET', '/admin/professionals'], ['GET', `/admin/professionals/${pro.id}`], ['POST', `/admin/professionals/${pro.id}/decision`, { action: 'approve' }], ['POST', `/admin/professionals/${pro.id}/phone`, { verified: true }]]
    for (const [m, p, body] of routes) {
      expect((await api(m, p, { body })).status, `${m} ${p} anônimo`).toBe(401)
      expect((await api(m, p, { cookie: pro.cookie, body })).status, `${m} ${p} comum`).toBe(403)
    }
    expect((await api('GET', '/admin/stats', { cookie: admin.cookie })).status).toBe(200)
    expect(await status(pro.id)).toBe('pending_review') // nada foi alterado pelas tentativas negadas
  })
  it('sessão de admin com mais de 8 h exige novo login', async () => {
    const admin = await mkAdmin()
    advance(8 * 3600 + 10)
    const r = await api('GET', '/admin/stats', { cookie: admin.cookie })
    expect(r.status).toBe(401); expect(r.body.error.code).toBe('admin_reauth_required')
  })
})

describe('Listagem e consulta', () => {
  it('lista profissionais com filtros por situação e busca por telefone; "em análise" vem primeiro', async () => {
    const admin = await mkAdmin(); const a = await mkPro(['eletricistas']); const b = await mkPro(['chaveiros']); const c = await mkUser('so-conta')
    const all = (await api('GET', '/admin/professionals', { cookie: admin.cookie })).body
    expect(all.items.map((i: any) => i.id).sort()).toEqual([a.id, b.id, c.id].sort())
    expect(all.items.every((i: any) => i.id !== admin.id)).toBe(true) // admin não aparece como profissional
    expect(all.items.find((i: any) => i.id === c.id).reviewStatus).toBe('not_submitted')
    const pend = (await api('GET', '/admin/professionals?status=pending_review', { cookie: admin.cookie })).body.items
    expect(pend.map((i: any) => i.id).sort()).toEqual([a.id, b.id].sort())
    expect(pend[0]).toMatchObject({ phoneVerified: false })
    expect(pend.find((i: any) => i.id === a.id).professions).toEqual(['Eletricistas'])
    expect((await api('GET', `/admin/professionals?q=${b.phone.slice(-6)}`, { cookie: admin.cookie })).body.items.map((i: any) => i.id)).toEqual([b.id])
    const st = (await api('GET', '/admin/stats', { cookie: admin.cookie })).body
    expect(st.byStatus).toMatchObject({ pending_review: 2, not_submitted: 1, approved: 0 })
    expect(st.unverifiedPhones).toBeGreaterThanOrEqual(3)
  })
  it('detalhe traz dados, profissões, regiões, respostas legíveis, pontuação e alertas — sem segredos', async () => {
    const admin = await mkAdmin(); const p = await mkPro(['eletricistas'])
    const d = (await api('GET', `/admin/professionals/${p.id}`, { cookie: admin.cookie })).body
    expect(d).toMatchObject({ reviewStatus: 'pending_review', phoneVerified: false, regions: ['Zona Sul'], professions: [{ name: 'Eletricistas', experienceYears: 7, level: 'Avançado' }] })
    expect(d.work).toMatchObject({ ownTools: 'Kit completo próprio', vehicle: 'Carro', workStructure: 'Trabalho sozinho' })
    const a = d.assessments[0]
    expect(a.questions).toHaveLength(5)
    expect(a.questions[0]).toMatchObject({ kind: 'choice', points: 3, best: 3 })
    expect(a.questions[0].answer).toMatch(/\w/)
    expect(a.questions[4]).toMatchObject({ kind: 'open' }); expect(a.questions[4].answer).toContain('origem')
    expect(a.scores).toMatchObject({ rule: 100 }); expect(a.scores.technical).toBeGreaterThan(0)
    expect(d.aiEvaluations[0]).toMatchObject({ provider: 'sim' })
    expect(JSON.stringify(d)).not.toMatch(/scrypt|password_hash|token_hash/)
    expect((await query('SELECT 1 FROM audit_log WHERE event = $1', ['admin.view_professional'])).length).toBe(1) // quem viu dados pessoais fica registrado
  })
  it('id inexistente = 404', async () => {
    const admin = await mkAdmin()
    expect((await api('GET', '/admin/professionals/00000000-0000-0000-0000-000000000000', { cookie: admin.cookie })).status).toBe(404)
  })
})

describe('Decisões humanas: aprovar, rejeitar, pedir ajustes, suspender', () => {
  it('aprovar: registra revisor, data, observação e histórico', async () => {
    const admin = await mkAdmin(); const p = await mkPro()
    const r = await decide(admin, p.id, 'approve', 'Documentos conferidos')
    expect(r.status).toBe(200); expect(r.body.reviewStatus).toBe('approved')
    const [row] = await query<any>('SELECT * FROM professional_profiles WHERE user_id = $1', [p.id])
    expect(row).toMatchObject({ review_status: 'approved', reviewed_by: admin.id, review_notes: 'Documentos conferidos' }); expect(row.reviewed_at).toBeTruthy()
    const [ev] = await query<any>('SELECT * FROM review_events WHERE user_id = $1', [p.id])
    expect(ev).toMatchObject({ action: 'approve', from_status: 'pending_review', to_status: 'approved', admin_id: admin.id })
    expect((await query('SELECT 1 FROM audit_log WHERE event = $1', ['admin.decision'])).length).toBe(1)
  })
  it('rejeitar, suspender e pedir ajustes EXIGEM motivo; aprovar não', async () => {
    const admin = await mkAdmin(); const p = await mkPro()
    for (const a of ['reject', 'request_changes']) { const r = await decide(admin, p.id, a); expect(r.status).toBe(400); expect(r.body.error.code).toBe('notes_required') }
    expect(await status(p.id)).toBe('pending_review')
    expect((await decide(admin, p.id, 'approve')).status).toBe(200)
    expect((await decide(admin, p.id, 'suspend', 'abc')).body.error.code).toBe('notes_required')
    expect((await decide(admin, p.id, 'suspend', 'Reclamações de clientes')).body.reviewStatus).toBe('suspended')
  })
  it('só são aceitas as transições válidas (409 nas demais); ação desconhecida = 400', async () => {
    const admin = await mkAdmin(); const p = await mkPro(); const novo = await mkUser('so-conta')
    expect((await decide(admin, p.id, 'suspend', 'não aprovado ainda')).status).toBe(409)
    expect((await decide(admin, p.id, 'reinstate')).status).toBe(409)
    expect((await decide(admin, novo.id, 'approve')).status).toBe(409) // cadastro nem foi enviado
    expect((await decide(admin, p.id, 'excluir', 'x'.repeat(10))).body.error.code).toBe('invalid_action')
    await decide(admin, p.id, 'approve')
    expect((await decide(admin, p.id, 'approve')).status).toBe(409) // já aprovado
    expect((await decide(admin, p.id, 'reject', 'motivo qualquer')).status).toBe(409)
    expect((await decide(admin, p.id, 'suspend', 'motivo qualquer')).status).toBe(200)
    expect((await decide(admin, p.id, 'reinstate')).body.reviewStatus).toBe('approved')
  })
  it('NINGUÉM decide sobre o próprio cadastro (sem autoaprovação)', async () => {
    const admin = await mkAdmin()
    await query("INSERT INTO professional_profiles (user_id, review_status) VALUES ($1, 'pending_review')", [admin.id])
    const r = await decide(admin, admin.id, 'approve')
    expect(r.status).toBe(403); expect(r.body.error.code).toBe('self_review')
    expect(await status(admin.id)).toBe('pending_review')
  })
  it('pedir ajustes devolve ao profissional (pode editar e reenviar); rejeitado e suspenso ficam travados', async () => {
    const admin = await mkAdmin(); const p = await mkPro()
    await decide(admin, p.id, 'request_changes', 'Detalhe melhor a experiência')
    expect((await p.call('PUT', '/pro/regions', { regions: ['centro', 'zona-sul'] })).status).toBe(200)
    expect((await p.call('POST', '/pro/submit')).status).toBe(200)
    expect(await status(p.id)).toBe('pending_review')
    await decide(admin, p.id, 'reject', 'Não atende aos requisitos')
    expect((await p.call('PUT', '/pro/regions', { regions: ['centro'] })).body.error.code).toBe('profile_locked')
    const q = await mkPro(['guincho']); await decide(admin, q.id, 'approve'); await decide(admin, q.id, 'suspend', 'Suspensão preventiva')
    expect((await q.call('PUT', '/pro/regions', { regions: ['centro'] })).body.error.code).toBe('profile_locked')
  })
  it('o banco recusa aprovar sem revisor humano, mesmo fora da API', async () => {
    const p = await mkPro()
    for (const st of ['approved', 'rejected', 'suspended', 'needs_changes'])
      await expect(query('UPDATE professional_profiles SET review_status = $2 WHERE user_id = $1', [p.id, st])).rejects.toMatchObject({ code: '23514' })
  })
})

describe('Verificação do celular (MVP, sem SMS)', () => {
  it('só o admin marca/desmarca; o profissional vê o resultado', async () => {
    const admin = await mkAdmin(); const p = await mkPro()
    expect((await api('GET', '/auth/me', { cookie: p.cookie })).body.user.phoneVerified).toBe(false)
    expect((await api('POST', `/admin/professionals/${p.id}/phone`, { cookie: p.cookie, body: { verified: true } })).status).toBe(403)
    expect((await api('POST', `/admin/professionals/${p.id}/phone`, { cookie: admin.cookie, body: { verified: true } })).body.phoneVerified).toBe(true)
    expect((await api('GET', '/auth/me', { cookie: p.cookie })).body.user.phoneVerified).toBe(true)
    const [ph] = await query<any>('SELECT verified_by FROM phones WHERE user_id = $1', [p.id]); expect(ph.verified_by).toBe(admin.id)
    await api('POST', `/admin/professionals/${p.id}/phone`, { cookie: admin.cookie, body: { verified: false } })
    expect((await api('GET', '/auth/me', { cookie: p.cookie })).body.user.phoneVerified).toBe(false)
    expect((await query('SELECT 1 FROM review_events WHERE user_id = $1', [p.id])).length).toBe(2)
  })
})

describe('Nenhum profissional aparece publicamente sem aprovação humana', () => {
  it('a visão pública mostra SÓ aprovados, some ao suspender e nunca expõe telefone ou identificadores', async () => {
    const admin = await mkAdmin(); const a = await mkPro(['pintores']); const b = await mkPro(['guincho']); await mkPro(['chaveiros']); await mkUser('so-conta')
    expect((await api('GET', '/public/professionals')).body.items).toEqual([]) // ninguém aprovado ainda
    await decide(admin, a.id, 'approve'); await decide(admin, b.id, 'reject', 'Não atende aos requisitos')
    const pub = (await api('GET', '/public/professionals')).body.items
    expect(pub).toEqual([{ professions: ['Pintores'], regions: ['Zona Sul'], experienceYears: 7 }])
    expect(JSON.stringify(pub)).not.toMatch(/\+55|phone|telefone|id"|user/i)
    await decide(admin, a.id, 'suspend', 'Suspensão preventiva')
    expect((await api('GET', '/public/professionals')).body.items).toEqual([])
    await decide(admin, a.id, 'reinstate')
    expect((await api('GET', '/public/professionals')).body.items).toHaveLength(1)
    await query("UPDATE users SET status = 'disabled' WHERE id = $1", [a.id]) // conta bloqueada também some
    expect((await api('GET', '/public/professionals')).body.items).toEqual([])
  })
  it('a rota pública não exige login e a view não tem coluna de telefone', async () => {
    expect((await api('GET', '/public/professionals')).status).toBe(200)
    const cols = (await query<any>("SELECT column_name FROM information_schema.columns WHERE table_name = 'public_professionals'")).map((c) => c.column_name)
    expect(cols.sort()).toEqual(['experience_years', 'professions', 'regions'])
  })
})
