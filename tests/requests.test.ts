import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { QUESTIONNAIRES } from '../server/pro/questions'
import { api, cleanDb, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
const saved = { ...process.env }
beforeEach(async () => {
  await cleanDb()
  await query('TRUNCATE technical_assessments, ai_evaluations, assessment_answers, professional_profiles, professional_regions, profile_professions, review_events, service_requests CASCADE')
  process.env.VERIFICATION_MODE = 'admin'; delete process.env.PASSWORD_RECOVERY
})
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved) })

let seq = 0
async function mkUser() {
  const digits = `119${String(3000 + ++seq).padStart(4, '0')}${String(3333 + seq).slice(-4)}`
  const r = await api('POST', '/auth/register', { body: { phone: digits, password: 'senha-pedidos-42', acceptTerms: true }, ip: `10.8.${seq}.1` })
  if (r.status !== 200) throw new Error(JSON.stringify(r.body))
  const [{ id }] = await query<any>('SELECT user_id AS id FROM phones WHERE e164 = $1', ['+55' + digits])
  return { id: id as string, cookie: r.cookie!, call: (m: string, p: string, body?: unknown) => api(m, p, { cookie: r.cookie!, body }) }
}
const mkAdmin = async () => { const a = await mkUser(); await query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'admin'", [a.id]); return a }
const best = (slug: string) => QUESTIONNAIRES[slug].map((q) => ({ questionId: q.id, choice: (q as any).options.find((o: any) => o.points === 3).id }))
/** Profissional com cadastro enviado (e, se pedido, decidido pelo admin). */
async function mkPro(admin: Awaited<ReturnType<typeof mkUser>>, o: { prof?: string; region?: string; name?: string; decision?: string | null } = {}) {
  const u = await mkUser(); const prof = o.prof ?? 'pintores'
  await u.call('PUT', '/pro/me', { fullName: o.name ?? 'Profissional Teste' })
  await u.call('PUT', '/pro/professions', { professions: [prof] }); await u.call('PUT', '/pro/regions', { regions: [o.region ?? 'zona-sul'] })
  await u.call('PUT', '/pro/work', { experience: { [prof]: { years: 4, level: 'advanced' } }, availability: { weekdays: ['seg'], periods: ['manha'], emergency: false }, ownTools: 'complete', vehicle: 'car', workStructure: 'solo' })
  await u.call('PUT', '/pro/answers', { profession: prof, answers: best(prof) })
  expect((await u.call('POST', '/pro/submit')).status).toBe(200)
  const d = o.decision === undefined ? 'approve' : o.decision
  if (d) await api('POST', `/admin/professionals/${u.id}/decision`, { cookie: admin.cookie, body: { action: d, notes: 'teste de decisão' } })
  return u
}
const REQ = { clientName: 'Cliente Secreto da Silva', clientPhone: '(11) 98765-4321', profession: 'pintores', region: 'zona-sul', neighborhood: 'Vila Mariana', title: 'Pintar sala e quarto', description: 'Apartamento de 60 m², paredes em bom estado. Precisa de duas demãos.', urgency: 'this_week', periodNote: 'Preferência pela manhã', consent: true }

describe('Pedidos de serviço manuais', () => {
  it('só administradores: anônimo 401, profissional 403 em todas as rotas', async () => {
    const admin = await mkAdmin(); const pro = await mkPro(admin)
    const routes: [string, string, unknown?][] = [['GET', '/admin/requests'], ['POST', '/admin/requests', REQ], ['GET', '/admin/requests/1'], ['PUT', '/admin/requests/1', REQ], ['POST', '/admin/requests/1/publish'], ['POST', '/admin/requests/1/close'], ['DELETE', '/admin/requests/1']]
    for (const [m, p, body] of routes) {
      expect((await api(m, p, { body })).status, `${m} ${p} anônimo`).toBe(401)
      expect((await api(m, p, { cookie: pro.cookie, body })).status, `${m} ${p} profissional`).toBe(403)
    }
    expect((await query<any>('SELECT 1 FROM service_requests')).length).toBe(0)
  })

  it('cadastro: validações, rascunho, publicação exige a autorização do cliente, texto público sem contato', async () => {
    const admin = await mkAdmin()
    const post = (b: object, extra: object = {}) => api('POST', '/admin/requests', { cookie: admin.cookie, body: { ...REQ, ...b, ...extra } })
    expect((await post({ clientName: '' })).body.error.code).toBe('invalid_client_name')
    expect((await post({ clientPhone: '123' })).body.error.code).toBe('invalid_client_phone')
    expect((await post({ profession: 'x' })).body.error.code).toBe('invalid_profession')
    expect((await post({ region: 'x' })).body.error.code).toBe('invalid_region')
    expect((await post({ title: 'abc' })).body.error.code).toBe('invalid_title')
    expect((await post({ urgency: 'ontem' })).body.error.code).toBe('invalid_urgency')
    for (const description of ['Me liga no 11 98765-4321 para combinar', 'Veja fotos em www.exemplo.com', 'fale com joao@exemplo.com', 'instagram @cliente']) expect((await post({ description })).body.error.code, description).toBe('contact_in_public_text')
    expect((await post({ consent: false }, { publish: true })).body.error.code).toBe('consent_required')
    const draft = await post({ consent: false })
    expect(draft.status).toBe(200); expect(draft.body).toMatchObject({ status: 'draft', eligible: 0 })
    expect((await api('POST', `/admin/requests/${draft.body.id}/publish`, { cookie: admin.cookie })).body.error.code).toBe('consent_required')
    const up = await api('PUT', `/admin/requests/${draft.body.id}`, { cookie: admin.cookie, body: { ...REQ, consent: true, publish: true } })
    expect(up.body).toMatchObject({ status: 'published', consent: true }); expect(up.body.consentAt).not.toBeNull()
    expect((await api('PUT', `/admin/requests/${draft.body.id}`, { cookie: admin.cookie, body: REQ })).status).toBe(409) // publicado não se edita
    expect((await query<any>("SELECT client_phone FROM service_requests"))[0].client_phone).toBe('+5511987654321')
  })

  it('distribuição: só aprovados da profissão E da região; nada para pendentes, rejeitados, suspensos, rascunhos ou encerrados', async () => {
    const admin = await mkAdmin()
    const ok = await mkPro(admin, { name: 'Ana Aprovada' })
    const otherRegion = await mkPro(admin, { region: 'zona-norte' }), otherProf = await mkPro(admin, { prof: 'guincho' })
    const pending = await mkPro(admin, { decision: null }), rejected = await mkPro(admin, { decision: 'reject' })
    const suspended = await mkPro(admin, { decision: 'approve' }); await api('POST', `/admin/professionals/${suspended.id}/decision`, { cookie: admin.cookie, body: { action: 'suspend', notes: 'teste suspensão' } })
    const draft = await api('POST', '/admin/requests', { cookie: admin.cookie, body: { ...REQ, consent: false } })
    for (const u of [ok, otherRegion, otherProf, pending, rejected, suspended]) expect((await u.call('GET', '/pro/requests')).body.items, 'rascunho não aparece').toHaveLength(0)
    const pub = await api('PUT', `/admin/requests/${draft.body.id}`, { cookie: admin.cookie, body: { ...REQ, publish: true } })
    expect(pub.body.eligible).toBe(1)
    const mine = (await ok.call('GET', '/pro/requests')).body
    expect(mine.allowed).toBe(true); expect(mine.items).toHaveLength(1)
    expect(mine.items[0]).toMatchObject({ title: 'Pintar sala e quarto', profession: 'Pintores', region: 'Zona Sul', neighborhood: 'Vila Mariana', urgencyLabel: 'Nesta semana', interested: false })
    for (const u of [otherRegion, otherProf, rejected, suspended]) expect((await u.call('GET', '/pro/requests')).body.items).toHaveLength(0)
    expect((await pending.call('GET', '/pro/requests')).body).toMatchObject({ allowed: false, items: [] })
    // privacidade: nenhum dado do cliente chega ao profissional
    const raw = JSON.stringify(mine)
    for (const secret of ['Cliente Secreto', '98765', '5511987654321', 'clientName', 'client_phone', 'clientPhone']) expect(raw).not.toContain(secret)
    expect(Object.keys(mine.items[0]).sort()).toEqual(['description', 'id', 'interested', 'neighborhood', 'periodNote', 'profession', 'publishedAt', 'region', 'title', 'urgency', 'urgencyLabel'])
    // encerrar tira dos profissionais
    expect((await api('POST', `/admin/requests/${draft.body.id}/close`, { cookie: admin.cookie })).body.status).toBe('closed')
    expect((await ok.call('GET', '/pro/requests')).body.items).toHaveLength(0)
  })

  it('interesse: uma vez por pedido (sem duplicar), só compatíveis e aprovados; admin vê quem se interessou, com contato', async () => {
    const admin = await mkAdmin()
    const a = await mkPro(admin, { name: 'Ana Aprovada' }), b = await mkPro(admin, { name: 'Bruno Dias' }), out = await mkPro(admin, { region: 'zona-norte' }), pending = await mkPro(admin, { decision: null })
    const created = await api('POST', '/admin/requests', { cookie: admin.cookie, body: { ...REQ, publish: true } })
    const id = created.body.id
    expect((await a.call('POST', `/pro/requests/${id}/interest`)).body).toEqual({ ok: true, alreadyInterested: false })
    expect((await a.call('POST', `/pro/requests/${id}/interest`)).body).toEqual({ ok: true, alreadyInterested: true }) // clique repetido
    await Promise.all([b.call('POST', `/pro/requests/${id}/interest`), b.call('POST', `/pro/requests/${id}/interest`), b.call('POST', `/pro/requests/${id}/interest`)])
    expect((await query<any>('SELECT 1 FROM service_request_interests WHERE request_id = $1', [id])).length).toBe(2) // 1 por profissional, mesmo em paralelo
    expect((await out.call('POST', `/pro/requests/${id}/interest`)).status).toBe(404) // fora da região
    expect((await pending.call('POST', `/pro/requests/${id}/interest`)).status).toBe(403) // não aprovado
    expect((await api('POST', `/pro/requests/${id}/interest`)).status).toBe(401)
    expect((await a.call('GET', '/pro/requests')).body.items[0].interested).toBe(true)
    const d = (await api('GET', `/admin/requests/${id}`, { cookie: admin.cookie })).body
    expect(d.interests).toBe(2); expect(d.interested.map((i: any) => i.name).sort()).toEqual(['Ana Aprovada', 'Bruno Dias'])
    expect(d.interested[0].phone).toMatch(/^\(11\) 9\d{4}-\d{4}$/); expect(d.interested[0].whatsapp).toMatch(/^55\d{11}$/)
    expect(d.client).toMatchObject({ name: 'Cliente Secreto da Silva', phone: '(11) 98765-4321' }) // dados do cliente: só aqui (admin)
    expect(d.eligible).toBe(2)
    const list = (await api('GET', '/admin/requests?status=published', { cookie: admin.cookie })).body
    expect(list.items[0]).toMatchObject({ interests: 1 + 1 }); expect(list.counts).toMatchObject({ draft: 0, published: 1, closed: 0 })
    await api('POST', `/admin/requests/${id}/close`, { cookie: admin.cookie })
    expect((await a.call('POST', `/pro/requests/${id}/interest`)).body.error.code).toBe('request_closed')
    expect((await api('GET', '/admin/requests?status=closed', { cookie: admin.cookie })).body.items).toHaveLength(1)
  })
})
