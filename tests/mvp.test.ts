import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { api, advance, cleanDb, PASSWORD, PHONE, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
const saved = { ...process.env }
beforeEach(async () => { await cleanDb(); process.env.VERIFICATION_MODE = 'admin'; delete process.env.PASSWORD_RECOVERY })
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved) })

const reg = (over: Record<string, unknown> = {}, opts: { noCaptcha?: boolean } = {}) =>
  api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true, ...over }, ...opts })

describe('Cadastro MVP: celular + senha, sem SMS', () => {
  it('cria conta ATIVA e já logada, com o celular NÃO VERIFICADO e nenhum SMS enviado', async () => {
    const r = await reg()
    expect(r.status).toBe(200)
    expect(r.cookie).toMatch(/mdm_session=/)
    const [u] = await query<any>('SELECT status FROM users')
    expect(u.status).toBe('active')
    expect((await query<any>('SELECT verified_at FROM phones'))[0].verified_at).toBeNull()
    expect((await query('SELECT 1 FROM sms_messages')).length).toBe(0)
    const me = await api('GET', '/auth/me', { cookie: r.cookie })
    expect(me.body.user).toMatchObject({ phoneVerified: false, isAdmin: false, roles: ['user'] })
  })
  it('não pede e-mail; número repetido (em qualquer formato) é recusado; dados ruins têm mensagem clara', async () => {
    await reg()
    for (const p of ['11912345678', '+55 11 91234-5678']) expect((await reg({ phone: p })).body.error.code).toBe('phone_taken')
    expect((await reg({ phone: '123' })).body.error.code).toBe('invalid_phone')
    expect((await reg({ password: '12345678', phone: '(21) 98765-4321' })).body.error.code).toBe('weak_password')
    expect((await reg({ acceptTerms: false, phone: '(21) 98765-4321' })).body.error.code).toBe('terms_required')
    expect((await query('SELECT 1 FROM users')).length).toBe(1)
  })
  it('login funciona com celular não verificado; senha errada é genérica; 5 erros bloqueiam', async () => {
    await reg()
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(200)
    const bad = await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-123456' } })
    expect(bad.status).toBe(401)
    for (let i = 0; i < 4; i++) await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-' + i + 'xyz' }, ip: `10.1.1.${i}` })
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD }, ip: '10.1.1.99' })).status).toBe(429)
  })
  it('SMS e recuperação de senha ficam DESLIGADOS (nenhum código é gerado)', async () => {
    for (const [path, body] of [['/auth/verify-phone', { phone: PHONE, code: '123456' }], ['/auth/resend-code', { phone: PHONE }], ['/auth/forgot-password', { phone: PHONE }], ['/auth/reset-password', { phone: PHONE, code: '123456', password: 'nova-senha-123' }]] as const) {
      const r = await api('POST', path, { body })
      expect(r.status, path).toBe(404)
      expect(r.body.error.code).toBe('feature_disabled')
    }
    expect((await query('SELECT 1 FROM sms_messages')).length + (await query('SELECT 1 FROM verification_codes')).length).toBe(0)
  })
  it('honeypot: campo oculto preenchido (robô) é recusado e nada é criado', async () => {
    const r = await reg({ contato_extra: 'http://spam.example' })
    expect(r.status).toBe(400)
    expect((await query('SELECT 1 FROM users')).length).toBe(0)
  })
  it('o status público informa o modo (sem segredos)', async () => {
    const s = (await api('GET', '/status')).body
    expect(s).toMatchObject({ verificationMode: 'admin', passwordRecovery: false })
  })
})

describe('Primeiro administrador (bootstrap controlado)', () => {
  const A1 = '+5511900000001', A2 = '+5511900000002'
  it('só celulares da lista, só enquanto não houver admin, e mesmo com o pré-cadastro fechado', async () => {
    process.env.PRE_REGISTRATION_OPEN = 'false'; process.env.ADMIN_BOOTSTRAP_PHONES = `${A1},${A2}`
    expect((await reg({ phone: '(21) 98765-4321' })).body.error.code).toBe('preregistration_closed') // público segue fechado
    const first = await reg({ phone: '(11) 90000-0001' })
    expect(first.status).toBe(200)
    expect((await api('GET', '/auth/me', { cookie: first.cookie })).body.user.isAdmin).toBe(true)
    const second = await reg({ phone: '(11) 90000-0002' }) // da lista, mas já existe admin
    expect(second.status).toBe(200)
    expect((await api('GET', '/auth/me', { cookie: second.cookie })).body.user.isAdmin).toBe(false)
    expect((await query<any>("SELECT count(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin'"))[0].n).toBe('1')
  })
  it('lista malformada é ignorada (nada vira admin)', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = 'qualquer-coisa, 11900000001'
    const r = await reg({ phone: '(11) 90000-0001' })
    expect((await api('GET', '/auth/me', { cookie: r.cookie })).body.user.isAdmin).toBe(false)
  })
})

describe('Anti-robô próprio: prova de trabalho', () => {
  const zeroBits = (b: Buffer) => { let n = 0; for (const x of b) { if (x === 0) { n += 8; continue } return n + Math.clz32(x) - 24 } return n }
  const solve = (ch: string, d: number) => { for (let n = 0; ; n++) { const h = createHash('sha256').update(`${ch}:${n}`).digest(); if (zeroBits(h) >= d) return `${ch}:${n}` } }
  const challenge = async () => (await api('GET', '/captcha/challenge')).body as { challenge: string; difficulty: number }
  beforeEach(() => { process.env.CAPTCHA_PROVIDER = 'pow'; process.env.POW_DIFFICULTY = '10' })

  it('desafio resolvido é aceito UMA vez; reutilizar o mesmo é recusado', async () => {
    const c = await challenge()
    const token = solve(c.challenge, c.difficulty)
    expect((await reg({ captchaToken: token }, { noCaptcha: true })).status).toBe(200)
    const again = await reg({ captchaToken: token, phone: '(21) 98765-4321' }, { noCaptcha: true })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('captcha_failed')
  })
  it('sem token, nonce errado, assinatura adulterada ou dificuldade menor: recusado', async () => {
    expect((await reg({}, { noCaptcha: true })).body.error.code).toBe('captcha_required')
    const c = await challenge()
    const good = solve(c.challenge, c.difficulty)
    const wrongNonce = good.replace(/:\d+$/, ':0000000')
    const t = (tok: string, ph: string) => reg({ captchaToken: tok, phone: ph }, { noCaptcha: true })
    expect((await t(wrongNonce, '(21) 98765-0001')).body.error.code).toBe('captcha_failed')
    const parts = c.challenge.split('.'); parts[3] = 'x'.repeat(32)
    expect((await t(solve(parts.join('.'), 10), '(21) 98765-0002')).body.error.code).toBe('captcha_failed')
    process.env.POW_DIFFICULTY = '12' // servidor agora exige mais: o desafio antigo (10) não vale
    expect((await t(good, '(21) 98765-0003')).body.error.code).toBe('captcha_failed')
    expect((await query('SELECT 1 FROM users')).length).toBe(0)
  })
  it('desafio expira em 10 minutos', async () => {
    const c = await challenge()
    const token = solve(c.challenge, c.difficulty)
    advance(11 * 60)
    expect((await reg({ captchaToken: token }, { noCaptcha: true })).body.error.code).toBe('captcha_failed')
  })
  it('o endpoint de desafio só existe quando o provedor é "pow" e informa no /status', async () => {
    expect((await api('GET', '/status')).body.captcha).toBe('pow')
    process.env.CAPTCHA_PROVIDER = 'dev'
    expect((await api('GET', '/captcha/challenge')).status).toBe(404)
  })
})
