import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { QUESTIONNAIRES } from '../server/pro/questions'
import { api, cleanDb, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
const saved = { ...process.env }
beforeEach(async () => {
  await cleanDb()
  await query('TRUNCATE technical_assessments, ai_evaluations, assessment_answers, professional_profiles, professional_regions, profile_professions, review_events, announcement_reads CASCADE')
  await query("INSERT INTO announcements (title, body) VALUES ('Bem-vindo ao Mapa do Mapa!', 'Comunicado de teste.')") // TRUNCATE ... CASCADE limpa a tabela
  process.env.VERIFICATION_MODE = 'admin'; delete process.env.PASSWORD_RECOVERY
})
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved) })

const PASS = 'senha-area-teste-42'
let seq = 0
async function mkUser() {
  const digits = `119${String(2000 + ++seq).padStart(4, "0")}${String(2222 + seq).slice(-4)}`
  const r = await api('POST', '/auth/register', { body: { phone: digits, password: PASS, acceptTerms: true }, ip: `10.9.${seq}.1` })
  if (r.status !== 200) throw new Error(JSON.stringify(r.body))
  const [{ id }] = await query<any>('SELECT user_id AS id FROM phones WHERE e164 = $1', ['+55' + digits])
  const call = (m: string, p: string, body?: unknown) => api(m, p, { cookie: r.cookie!, body })
  return { id: id as string, cookie: r.cookie!, call }
}
const mkAdmin = async () => { const a = await mkUser(); await query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'admin'", [a.id]); return a }
const best = (slug: string) => QUESTIONNAIRES[slug].map((q) => ({ questionId: q.id, choice: (q as any).options.find((o: any) => o.points === 3).id }))
async function submitted(u: Awaited<ReturnType<typeof mkUser>>) {
  await u.call('PUT', '/pro/professions', { professions: ['pintores'] })
  await u.call('PUT', '/pro/regions', { regions: ['zona-sul'] })
  await u.call('PUT', '/pro/work', { experience: { pintores: { years: 5, level: 'advanced' } }, availability: { weekdays: ['seg'], periods: ['manha'], emergency: false }, ownTools: 'complete', vehicle: 'car', workStructure: 'solo' })
  await u.call('PUT', '/pro/answers', { profession: 'pintores', answers: best('pintores') })
  expect((await u.call('POST', '/pro/submit')).status).toBe(200)
}
// JPEG mínimo válido (cabeçalho FFD8FF + preenchimento) — o servidor confere assinatura e tamanho.
const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]).toString('base64')

describe('Início e perfil', () => {
  it('exige login; início mostra status e pendências; nome personaliza a saudação', async () => {
    expect((await api('GET', '/pro/home')).status).toBe(401)
    const u = await mkUser()
    const h = (await u.call('GET', '/pro/home')).body
    expect(h).toMatchObject({ status: 'not_submitted', statusLabel: 'Cadastro incompleto', firstName: null })
    expect(h.pendencies.map((p: any) => p.id)).toEqual(expect.arrayContaining(['name', 'finish']))
    expect(h.announcements.length).toBeGreaterThan(0) // comunicado de boas-vindas
    expect((await u.call('PUT', '/pro/me', { fullName: 'Jo', bio: 'x' })).body.error.code).toBe('invalid_name')
    const me = (await u.call('PUT', '/pro/me', { fullName: 'Maria Souza', bio: 'Pinto há 7 anos.', services: 'Pintura interna', extraInfo: '' })).body
    expect(me).toMatchObject({ fullName: 'Maria Souza', bio: 'Pinto há 7 anos.', services: 'Pintura interna', extraInfo: null })
    expect((await u.call('GET', '/pro/home')).body.firstName).toBe('Maria')
    expect((await query<any>('SELECT full_name FROM professional_profiles WHERE user_id = $1', [u.id]))[0].full_name).toBe('Maria Souza') // gravou no banco
  })
  it('cada profissional só vê/edita os PRÓPRIOS dados', async () => {
    const a = await mkUser(), b = await mkUser()
    await a.call('PUT', '/pro/me', { fullName: 'Ana Lima', bio: 'segredo-da-ana' })
    expect(JSON.stringify((await b.call('GET', '/pro/me')).body)).not.toContain('Ana')
    await b.call('PUT', '/pro/me', { fullName: 'Bruno Dias' })
    expect((await a.call('GET', '/pro/me')).body.fullName).toBe('Ana Lima')
    // não existe rota para informar o id de outro usuário
    expect((await a.call('PUT', '/pro/me', { fullName: 'Ana Lima', userId: b.id })).status).toBe(200)
    expect((await b.call('GET', '/pro/me')).body.fullName).toBe('Bruno Dias')
    expect((await a.call('GET', `/admin/professionals/${b.id}`)).status).toBe(403)
    expect((await a.call('GET', `/admin/professionals/${b.id}/photo`)).status).toBe(403)
  })
  it('aprovado: alterar região volta para análise (some do público); profissão não muda sozinha', async () => {
    const admin = await mkAdmin(), u = await mkUser()
    await submitted(u)
    await api('POST', `/admin/professionals/${u.id}/decision`, { cookie: admin.cookie, body: { action: 'approve' } })
    expect((await api('GET', '/public/professionals')).body.items).toHaveLength(1)
    const me = (await u.call('GET', '/pro/me')).body
    expect(me).toMatchObject({ canEditProfessions: false, regionsChangeResubmits: true })
    expect((await u.call('PUT', '/pro/professions', { professions: ['encanadores'] })).status).toBe(409)
    const r = await u.call('PUT', '/pro/me/regions', { regions: ['centro'] })
    expect(r.status).toBe(200); expect(r.body.status).toBe('pending_review')
    expect((await api('GET', '/public/professionals')).body.items).toHaveLength(0)
    expect((await query<any>(`SELECT 1 FROM profile_events WHERE user_id = $1 AND kind = 'resubmitted'`, [u.id])).length).toBe(1)
    const d = (await api('GET', `/admin/professionals/${u.id}`, { cookie: admin.cookie })).body
    expect(d.profileEvents[0].kind).toBe('resubmitted'); expect(d.unreadMessages).toBe(1)
  })
  it('experiência/disponibilidade editáveis mesmo em análise, registrando o evento', async () => {
    const u = await mkUser(); await submitted(u)
    const r = await u.call('PUT', '/pro/me/work', { experience: { pintores: { years: 9, level: 'expert' } }, availability: { weekdays: ['seg', 'ter'], periods: ['tarde'], emergency: true }, ownTools: 'basic', vehicle: 'moto', workStructure: 'helper' })
    expect(r.status).toBe(200); expect(r.body.professions[0]).toMatchObject({ experienceYears: 9, selfLevel: 'expert' })
    expect((await query<any>(`SELECT 1 FROM profile_events WHERE user_id = $1 AND kind = 'work_updated'`, [u.id])).length).toBe(1)
  })
})

describe('Foto privada', () => {
  it('valida tipo/assinatura/tamanho, grava e entrega só ao dono e ao admin', async () => {
    const admin = await mkAdmin(), u = await mkUser(), o = await mkUser()
    expect((await u.call('PUT', '/pro/photo', { dataUrl: 'data:text/html;base64,AAAA' })).body.error.code).toBe('invalid_photo')
    expect((await u.call('PUT', '/pro/photo', { dataUrl: 'data:image/png;base64,' + Buffer.alloc(300, 1).toString('base64') })).body.error.code).toBe('invalid_photo') // assinatura não confere
    expect((await u.call('PUT', '/pro/photo', { dataUrl: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(500_000)]).toString('base64') })).body.error.code).toBe('photo_too_large')
    expect((await u.call('PUT', '/pro/photo', { dataUrl: jpeg })).status).toBe(200)
    const own = await u.call('GET', '/pro/photo'); expect(own.status).toBe(200); expect(own.headers.get('content-type')).toBe('image/jpeg'); expect(own.headers.get('cache-control')).toContain('no-store')
    expect((await o.call('GET', '/pro/photo')).status).toBe(404)
    expect((await api('GET', `/admin/professionals/${u.id}/photo`, { cookie: admin.cookie })).status).toBe(200)
    expect((await api('GET', '/pro/photo')).status).toBe(401)
    expect((await u.call('DELETE', '/pro/photo')).body.photoVersion).toBeNull()
  })
})

describe('Mensagens e comunicados', () => {
  it('troca profissional ↔ admin, não lidas, histórico e decisão como mensagem', async () => {
    const admin = await mkAdmin(), u = await mkUser(), other = await mkUser()
    await submitted(u)
    expect((await u.call('POST', '/pro/messages', { body: '   ' })).body.error.code).toBe('empty_message')
    await u.call('POST', '/pro/messages', { body: 'Posso trocar de profissão?' })
    expect((await api('GET', '/admin/stats', { cookie: admin.cookie })).body.unreadMessages).toBe(1)
    const inbox = (await api('GET', '/admin/inbox', { cookie: admin.cookie })).body.items
    expect(inbox).toHaveLength(1); expect(inbox[0].unread).toBe(1)
    const t = (await api('GET', `/admin/professionals/${u.id}/messages`, { cookie: admin.cookie })).body.messages
    expect(t.at(-1)).toMatchObject({ from: 'professional', unread: true })
    expect((await api('GET', '/admin/stats', { cookie: admin.cookie })).body.unreadMessages).toBe(0) // admin leu
    await api('POST', `/admin/professionals/${u.id}/messages`, { cookie: admin.cookie, body: { body: 'Claro, me conte o motivo.' } })
    await api('POST', `/admin/professionals/${u.id}/decision`, { cookie: admin.cookie, body: { action: 'request_changes', notes: 'Envie mais detalhes da experiência' } })
    expect((await u.call('GET', '/pro/messages/unread')).body.unread).toBe(2)
    expect((await u.call('GET', '/pro/home')).body).toMatchObject({ status: 'needs_changes', unreadMessages: 2, decision: { action: 'request_changes' } })
    const mine = (await u.call('GET', '/pro/messages')).body.messages
    expect(mine.map((m: any) => m.kind)).toEqual(['message', 'message', 'decision'])
    expect(mine.at(-1).body).toContain('Envie mais detalhes')
    expect((await u.call('GET', '/pro/messages/unread')).body.unread).toBe(0)
    expect((await other.call('GET', '/pro/messages')).body.messages).toHaveLength(0) // isolamento
    expect((await other.call('POST', `/admin/professionals/${u.id}/messages`, { body: 'oi' })).status).toBe(403)
  })
  it('limite de mensagens do profissional (anti-abuso)', async () => {
    const u = await mkUser()
    for (let i = 0; i < 20; i++) expect((await u.call('POST', '/pro/messages', { body: `m${i}` })).status).toBe(200)
    expect((await u.call('POST', '/pro/messages', { body: 'm21' })).status).toBe(429)
  })
  it('comunicados: só o admin publica; profissional lê e marca como lido', async () => {
    const admin = await mkAdmin(), u = await mkUser()
    expect((await u.call('POST', '/admin/announcements', { title: 'Aviso', body: 'texto' })).status).toBe(403)
    expect((await api('POST', '/admin/announcements', { cookie: admin.cookie, body: { title: 'Ab', body: 'x' } })).status).toBe(400)
    const c = await api('POST', '/admin/announcements', { cookie: admin.cookie, body: { title: 'Novidade', body: 'Veja as novas regras do lançamento.' } })
    expect(c.status).toBe(200)
    expect((await u.call('GET', '/pro/home')).body.unreadAnnouncements).toBe(2)
    expect((await u.call('POST', '/pro/announcements/read')).body.items.every((a: any) => a.read)).toBe(true)
    expect((await u.call('GET', '/pro/home')).body.unreadAnnouncements).toBe(0)
    const id = c.body.items[0].id
    await api('PUT', `/admin/announcements/${id}`, { cookie: admin.cookie, body: { published: false } })
    expect((await u.call('GET', '/pro/announcements')).body.items.map((a: any) => a.title)).not.toContain('Novidade')
  })
})
