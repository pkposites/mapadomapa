import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { QUESTIONNAIRES } from '../server/pro/questions'
import { api, cleanDb, startDb, stopDb } from './helpers'
import { setPushSender, type Sub } from '../server/lib/push'

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

describe('Boas-vindas (administração)', () => {
  it('só admin; individual personaliza e não duplica; coletivo pula quem já recebeu; resultado informado', async () => {
    const admin = await mkAdmin(), a = await mkUser(), b = await mkUser(), c = await mkUser()
    await a.call('PUT', '/pro/me', { fullName: 'Ana Souza' })
    const tpl = 'Olá, [nome]! Seja bem-vindo ao Mapa do Mapa!'
    expect((await a.call('POST', `/admin/professionals/${b.id}/welcome`, { body: tpl })).status).toBe(403)
    expect((await a.call('POST', '/admin/welcome-all', { body: tpl })).status).toBe(403)
    expect((await api('POST', `/admin/professionals/${a.id}/welcome`, { cookie: admin.cookie, body: { body: 'curta' } })).status).toBe(400)
    expect((await api('POST', `/admin/professionals/${a.id}/welcome`, { cookie: admin.cookie, body: { body: tpl } })).status).toBe(200)
    expect((await a.call('GET', '/pro/messages')).body.messages[0]).toMatchObject({ kind: 'welcome', body: 'Olá, Ana! Seja bem-vindo ao Mapa do Mapa!' })
    const again = await api('POST', `/admin/professionals/${a.id}/welcome`, { cookie: admin.cookie, body: { body: tpl } })
    expect(again.status).toBe(409); expect(again.body.error.code).toBe('welcome_already_sent')
    expect((await api('GET', '/admin/welcome', { cookie: admin.cookie })).body).toMatchObject({ total: 3, pending: 2 })
    const all = await api('POST', '/admin/welcome-all', { cookie: admin.cookie, body: { body: tpl } })
    expect(all.body).toMatchObject({ sent: 2, alreadyHad: 1, total: 3 }) // admin fora da conta
    expect((await b.call('GET', '/pro/messages')).body.messages[0].body).toBe('Olá! Seja bem-vindo ao Mapa do Mapa!') // sem nome: sem ", [nome]"
    expect((await api('POST', '/admin/welcome-all', { cookie: admin.cookie, body: { body: tpl } })).body).toMatchObject({ sent: 0 })
    expect((await query<any>("SELECT count(*)::int n FROM messages WHERE kind = 'welcome'"))[0].n).toBe(3)
    expect((await c.call('GET', '/pro/messages/unread')).body.unread).toBe(1)
    expect((await query<any>("SELECT 1 FROM messages WHERE kind='welcome' AND user_id = $1", [admin.id])).length).toBe(0) // admin não recebe
  })
})

describe('Notificações push', () => {
  const sent: { sub: Sub; payload: any }[] = []
  let fail: number | null = null
  beforeEach(() => {
    sent.length = 0; fail = null
    process.env.VAPID_PUBLIC_KEY = 'BPublicKeyDeTeste'; process.env.VAPID_PRIVATE_KEY = 'privada-de-teste'
    setPushSender(async (sub, payload) => { if (fail) throw Object.assign(new Error('x'), { statusCode: fail }); sent.push({ sub, payload: JSON.parse(payload) }) })
  })
  afterEach(() => setPushSender(null))
  const sub = (n: string) => ({ subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } } })

  it('desligado sem chaves; exige login; valida endpoint (só serviços de push) e chaves', async () => {
    const u = await mkUser()
    delete process.env.VAPID_PUBLIC_KEY
    expect((await u.call('GET', '/pro/push')).body).toMatchObject({ configured: false, publicKey: null })
    expect((await u.call('POST', '/pro/push/subscribe', sub('a'))).status).toBe(503)
    process.env.VAPID_PUBLIC_KEY = 'BPublicKeyDeTeste'
    expect((await api('GET', '/pro/push')).status).toBe(401)
    for (const endpoint of ['http://fcm.googleapis.com/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'ftp://x']) {
      expect((await u.call('POST', '/pro/push/subscribe', { subscription: { ...sub('a').subscription, endpoint } })).body.error.code, endpoint).toBe('invalid_subscription')
    }
    expect((await u.call('POST', '/pro/push/subscribe', { subscription: { ...sub('a').subscription, keys: { p256dh: '<x>', auth: 'y' } } })).body.error.code).toBe('invalid_subscription')
    const ok = (await u.call('POST', '/pro/push/subscribe', sub('a'))).body
    expect(ok).toMatchObject({ configured: true, subscribed: true, prefs: { messages: true, announcements: true } })
    expect(ok.publicKey).toBe('BPublicKeyDeTeste'); expect(JSON.stringify(ok)).not.toContain('privada-de-teste')
  })
  it('avisa em mensagem da equipe, decisão e comunicado — com texto genérico, só para quem ativou', async () => {
    const admin = await mkAdmin(), u = await mkUser(), other = await mkUser()
    await submitted(u)
    await u.call('POST', '/pro/push/subscribe', sub('u1')); await other.call('POST', '/pro/push/subscribe', sub('o1'))
    await api('POST', `/admin/professionals/${u.id}/messages`, { cookie: admin.cookie, body: { body: 'Texto privado que NÃO pode vazar para a tela de bloqueio' } })
    expect(sent).toHaveLength(1); expect(sent[0].sub.endpoint).toContain('u1'); expect(sent[0].payload).toMatchObject({ url: '/area/mensagens' })
    expect(JSON.stringify(sent[0].payload)).not.toContain('privado')
    await api('POST', `/admin/professionals/${u.id}/decision`, { cookie: admin.cookie, body: { action: 'approve' } })
    expect(sent).toHaveLength(2); expect(sent[1].payload.body).toBe('Há uma atualização sobre o seu cadastro.')
    await api('POST', '/admin/announcements', { cookie: admin.cookie, body: { title: 'Novidade importante', body: 'Detalhes do comunicado.' } })
    expect(sent.filter((x) => x.payload.tag === 'comunicado')).toHaveLength(2) // os dois aparelhos ativados
    await u.call('PUT', '/pro/push/prefs', { messages: false, announcements: true })
    const n = sent.length
    await api('POST', `/admin/professionals/${u.id}/messages`, { cookie: admin.cookie, body: { body: 'outra' } })
    expect(sent).toHaveLength(n) // preferência respeitada
    await u.call('POST', '/pro/push/unsubscribe', {})
    expect((await u.call('GET', '/pro/push')).body.subscribed).toBe(false)
    // mensagem do PROFISSIONAL para a equipe não gera push
    await other.call('POST', '/pro/messages', { body: 'oi' }); expect(sent).toHaveLength(n)
  })
  it('endpoint expirado (410) é removido; falha comum não quebra a ação principal; aparelho trocado de conta', async () => {
    const admin = await mkAdmin(), a = await mkUser(), b = await mkUser()
    await a.call('POST', '/pro/push/subscribe', sub('x1'))
    fail = 410
    const r = await api('POST', `/admin/professionals/${a.id}/messages`, { cookie: admin.cookie, body: { body: 'oi' } })
    expect(r.status).toBe(200) // a mensagem foi enviada mesmo com a falha do push
    expect((await query<any>('SELECT 1 FROM push_subscriptions')).length).toBe(0)
    fail = null
    await a.call('POST', '/pro/push/subscribe', sub('shared')); await b.call('POST', '/pro/push/subscribe', sub('shared'))
    expect((await query<any>('SELECT user_id FROM push_subscriptions')).map((x) => x.user_id)).toEqual([b.id])
    expect((await a.call('GET', '/pro/push')).body.subscribed).toBe(false)
  })
})

describe('Mural social', () => {
  async function approvedUser(admin: Awaited<ReturnType<typeof mkUser>>, name: string) {
    const u = await mkUser(); await u.call('PUT', '/pro/me', { fullName: name }); await submitted(u)
    await api('POST', `/admin/professionals/${u.id}/decision`, { cookie: admin.cookie, body: { action: 'approve' } }); return u
  }
  it('curtir (alterna, sem duplicar), comentar, validar, excluir o próprio, moderação; em análise só vê', async () => {
    const admin = await mkAdmin(), a = await approvedUser(admin, 'Ana Souza'), b = await approvedUser(admin, 'Bruno Dias'), pend = await mkUser()
    await a.call('POST', '/pro/feed', { body: 'Dica: sempre teste a vedação antes de fechar o forro.' })
    const id = (await b.call('GET', '/pro/feed')).body.items[0].id
    expect((await b.call('PUT', `/pro/feed/${id}/like`, { liked: true })).body).toEqual({ likes: 1, liked: true })
    expect((await b.call('PUT', `/pro/feed/${id}/like`, { liked: true })).body).toEqual({ likes: 1, liked: true }) // idempotente
    expect((await a.call('PUT', `/pro/feed/${id}/like`, { liked: true })).body.likes).toBe(2)
    expect((await b.call('GET', '/pro/feed')).body.items[0]).toMatchObject({ likes: 2, liked: true, comments: 0 })
    expect((await b.call('PUT', `/pro/feed/${id}/like`, { liked: false })).body).toEqual({ likes: 1, liked: false })
    expect((await pend.call('PUT', `/pro/feed/${id}/like`, { liked: true })).status).toBe(403)
    expect((await pend.call('POST', `/pro/feed/${id}/comments`, { body: 'oi' })).status).toBe(403)
    expect((await b.call('POST', `/pro/feed/${id}/comments`, { body: 'x' })).body.error.code).toBe('invalid_comment')
    expect((await b.call('POST', `/pro/feed/${id}/comments`, { body: 'me liga 11 98888-7777' })).body.error.code).toBe('post_contact_info')
    const c = await b.call('POST', `/pro/feed/${id}/comments`, { body: 'Verdade! Também uso o teste de pressão.' })
    expect(c.body.items[0]).toMatchObject({ name: 'Bruno Dias', professions: ['Pintores'], mine: true })
    expect(Object.keys(c.body.items[0]).sort()).toEqual(['at', 'body', 'id', 'mine', 'name', 'professions'])
    const seen = (await pend.call('GET', `/pro/feed/${id}/comments`)).body.items // quem está em análise lê os comentários
    expect(seen).toHaveLength(1); expect(seen[0].mine).toBe(false)
    expect((await a.call('DELETE', `/pro/feed/comments/${seen[0].id}`)).status).toBe(404) // não apaga comentário alheio
    expect((await b.call('GET', '/pro/feed')).body.items[0].comments).toBe(1)
    expect((await api('GET', `/admin/feed/${id}/comments`, { cookie: admin.cookie })).body.items).toHaveLength(1)
    expect((await a.call('GET', `/admin/feed/${id}/comments`)).status).toBe(403)
    await api('PUT', `/admin/feed/comments/${seen[0].id}`, { cookie: admin.cookie, body: { hidden: true } })
    expect((await b.call('GET', `/pro/feed/${id}/comments`)).body.items).toHaveLength(0)
    const c2 = await b.call('POST', `/pro/feed/${id}/comments`, { body: 'Outro comentário meu' })
    expect((await b.call('DELETE', `/pro/feed/comments/${c2.body.items[0].id}`)).status).toBe(200)
    expect((await b.call('GET', '/pro/feed/999999/comments')).status).toBe(404)
  })
})

describe('Mural', () => {
  async function approvedUser(admin: Awaited<ReturnType<typeof mkUser>>, name: string) {
    const u = await mkUser(); await u.call('PUT', '/pro/me', { fullName: name }); await submitted(u)
    await api('POST', `/admin/professionals/${u.id}/decision`, { cookie: admin.cookie, body: { action: 'approve' } }); return u
  }
  it('só aprovados leem/publicam; ninguém recebe id, celular ou perfil de outro; validações', async () => {
    const admin = await mkAdmin(), a = await approvedUser(admin, 'Ana Souza'), b = await approvedUser(admin, 'Bruno Dias'), pend = await mkUser()
    expect((await api('GET', '/pro/feed')).status).toBe(401)
    expect((await pend.call('GET', '/pro/feed')).body).toMatchObject({ allowed: true, canInteract: false, canPost: false, items: [] })
    expect((await pend.call('POST', '/pro/feed', { body: 'oi pessoal' })).status).toBe(403)
    expect((await a.call('POST', '/pro/feed', { body: 'oi' })).body.error.code).toBe('invalid_post')
    expect((await a.call('POST', '/pro/feed', { body: 'x'.repeat(601) })).body.error.code).toBe('post_too_long')
    for (const t of ['me chama no 11 99999-8888 pra orçamento', 'veja www.meusite.com', 'https://x.io/abc', 'meu site é pintura.com.br']) expect((await a.call('POST', '/pro/feed', { body: t })).body.error.code, t).toBe('post_contact_info')
    expect((await a.call('POST', '/pro/feed', { body: 'Alguém indica um bom fornecedor de tinta na Zona Sul?' })).status).toBe(200)
    const seen = (await b.call('GET', '/pro/feed')).body
    expect(seen.items).toHaveLength(1)
    expect(seen.items[0]).toMatchObject({ name: 'Ana Souza', professions: ['Pintores'], body: 'Alguém indica um bom fornecedor de tinta na Zona Sul?', mine: false })
    expect(Object.keys(seen.items[0]).sort()).toEqual(['at', 'body', 'comments', 'id', 'liked', 'likes', 'mine', 'name', 'professions'])
    expect((await pend.call('GET', '/pro/feed')).body.items).toHaveLength(1) // quem está em análise também VÊ o mural
    expect(JSON.stringify(seen)).not.toMatch(new RegExp(`${a.id}|\\+55|11 9`)) // nenhum id de usuário nem celular
    expect((await b.call('GET', `/pro/me`)).body.fullName).toBe('Bruno Dias') // não existe rota para ler perfil alheio
  })
  it('denunciar, ocultar (admin), excluir a própria; autor suspenso some do mural; sem nome não publica', async () => {
    const admin = await mkAdmin(), a = await approvedUser(admin, 'Ana Souza'), b = await approvedUser(admin, 'Bruno Dias')
    await a.call('POST', '/pro/feed', { body: 'Primeira postagem de teste' })
    const id = (await b.call('GET', '/pro/feed')).body.items[0].id
    expect((await a.call('POST', `/pro/feed/${id}/report`)).body.error.code).toBe('own_post')
    expect((await b.call('POST', `/pro/feed/${id}/report`)).status).toBe(200)
    expect((await b.call('DELETE', `/pro/feed/${id}`)).status).toBe(404) // não apaga a de outra pessoa
    expect((await b.call('PUT', `/admin/feed/${id}`, { hidden: true })).status).toBe(403)
    const adm = (await api('GET', '/admin/feed', { cookie: admin.cookie })).body.items[0]
    expect(adm).toMatchObject({ reports: 1, authorName: 'Ana Souza', hidden: false })
    await api('PUT', `/admin/feed/${id}`, { cookie: admin.cookie, body: { hidden: true, reason: 'fora das regras' } })
    expect((await b.call('GET', '/pro/feed')).body.items).toHaveLength(0)
    await api('PUT', `/admin/feed/${id}`, { cookie: admin.cookie, body: { hidden: false } })
    expect((await b.call('GET', '/pro/feed')).body.items).toHaveLength(1)
    await api('POST', `/admin/professionals/${a.id}/decision`, { cookie: admin.cookie, body: { action: 'suspend', notes: 'teste de suspensão' } })
    expect((await b.call('GET', '/pro/feed')).body.items).toHaveLength(0) // suspenso deixa de aparecer
    const noName = await mkUser(); await submitted(noName)
    await api('POST', `/admin/professionals/${noName.id}/decision`, { cookie: admin.cookie, body: { action: 'approve' } })
    expect((await noName.call('GET', '/pro/feed')).body).toMatchObject({ allowed: true, canPost: false, needsName: true })
    expect((await noName.call('POST', '/pro/feed', { body: 'sem nome ainda' })).body.error.code).toBe('name_required')
    const own = (await b.call('POST', '/pro/feed', { body: 'Minha postagem para apagar' })).body.items[0].id
    expect((await b.call('DELETE', `/pro/feed/${own}`)).status).toBe(200)
  })
})
