import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { query } from '../server/lib/db'
import { api, cleanDb, PASSWORD, PHONE, signup, smsCount, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
beforeEach(async () => { await cleanDb() })

const reg = (captchaToken?: unknown, over: Record<string, unknown> = {}) =>
  api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true, ...(captchaToken === undefined ? {} : { captchaToken }), ...over }, noCaptcha: true })

describe('CAPTCHA — simulador local', () => {
  it('sem token: recusa, não cria conta e não envia SMS', async () => {
    const r = await reg()
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('captcha_required')
    expect((await query('SELECT 1 FROM users')).length).toBe(0)
    expect(await smsCount()).toBe(0)
  })
  it('token errado: recusa', async () => {
    const r = await reg('token-inventado')
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('captcha_failed')
    expect(await smsCount()).toBe(0)
  })
  it('token de simulação: aceita', async () => {
    expect((await reg('dev-captcha-pass')).status).toBe(200)
  })
  it('token gigante ou de tipo errado: recusa sem erro 500', async () => {
    expect((await reg('x'.repeat(5000))).status).toBe(400)
    expect((await reg(12345)).status).toBe(400)
    expect((await reg({ a: 1 })).status).toBe(400)
  })
  it('vale também para reenvio de código e recuperação de senha', async () => {
    await signup()
    const a = await api('POST', '/auth/forgot-password', { body: { phone: PHONE }, noCaptcha: true })
    expect(a.status).toBe(400)
    const b = await api('POST', '/auth/resend-code', { body: { phone: PHONE }, noCaptcha: true })
    expect(b.status).toBe(400)
    expect(await smsCount()).toBe(1) // só o SMS do cadastro original
  })
  it('login NÃO exige CAPTCHA (protegido por bloqueio de tentativas)', async () => {
    await signup()
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(200)
  })
})

describe('CAPTCHA — Cloudflare Turnstile (com a rede simulada; nada é chamado de verdade)', () => {
  const saved = { ...process.env }
  const realFetch = globalThis.fetch
  let calls: { url: string; body: any }[] = []
  const mockSiteverify = (impl: (body: any) => Response | Promise<Response>) => {
    calls = []
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('challenges.cloudflare.com')) {
        const body = JSON.parse(init.body)
        calls.push({ url: String(url), body })
        return impl(body)
      }
      return realFetch(url, init)
    }) as typeof fetch
  }
  beforeEach(() => {
    process.env.CAPTCHA_PROVIDER = 'turnstile'
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA' // chave DE TESTE pública da Cloudflare
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
    vi.restoreAllMocks()
  })

  it('envia ao siteverify exatamente o formato documentado e aceita quando success=true', async () => {
    mockSiteverify(() => Response.json({ success: true, hostname: 'example.com' }))
    const r = await reg('XXXX.DUMMY.TOKEN.XXXX')
    expect(r.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(calls[0].body).toMatchObject({ secret: '1x0000000000000000000000000000000AA', response: 'XXXX.DUMMY.TOKEN.XXXX' })
    expect(typeof calls[0].body.remoteip).toBe('string')
  })
  it('success=false (ex.: timeout-or-duplicate): recusa e não envia SMS', async () => {
    mockSiteverify(() => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }))
    const r = await reg('token')
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('captcha_failed')
    expect(await smsCount()).toBe(0)
  })
  it('serviço fora do ar / lento / resposta inválida: FALHA FECHADA (503), nunca libera', async () => {
    mockSiteverify(() => { throw new Error('rede caiu') })
    expect((await reg('t')).status).toBe(503)
    mockSiteverify(() => new Response('erro', { status: 500 }))
    expect((await reg('t')).status).toBe(503)
    mockSiteverify(() => new Response('não é json', { status: 200 }))
    expect((await reg('t')).status).toBe(503)
    expect((await query('SELECT 1 FROM users')).length).toBe(0)
  })
  it('sem a chave secreta configurada: indisponível (503), não libera', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const r = await reg('t')
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('captcha_unavailable')
  })
  it('restringe ao domínio do site quando TURNSTILE_HOSTNAMES está definido', async () => {
    process.env.TURNSTILE_HOSTNAMES = 'mapadomapa.com.br'
    mockSiteverify(() => Response.json({ success: true, hostname: 'site-de-terceiros.com' }))
    expect((await reg('t')).status).toBe(400)
    mockSiteverify(() => Response.json({ success: true, hostname: 'mapadomapa.com.br' }))
    expect((await reg('t', { phone: '(21) 98765-4321' })).status).toBe(200)
  })
  it('a resposta e os logs nunca contêm a chave secreta', async () => {
    const logs: string[] = []
    for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.join(' ')) })
    mockSiteverify(() => { throw new Error('falha') })
    const r = await reg('t')
    expect(JSON.stringify(r.body)).not.toContain('1x0000000000000000000000000000000AA')
    expect(logs.join('\n')).not.toContain('1x0000000000000000000000000000000AA')
  })
})

describe('CAPTCHA — produção (simulada)', () => {
  const saved = { ...process.env }
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  })
  const prod = (extra: Record<string, string> = {}) => {
    process.env.VITEST = 'false'; process.env.NODE_ENV = 'production'; process.env.CONTEXT = 'production'
    delete process.env.NETLIFY_DEV; delete process.env.AUTH_SECRET; delete process.env.CAPTCHA_PROVIDER
    Object.assign(process.env, { PRE_REGISTRATION_OPEN: 'true', ...extra })
  }
  it('sem CAPTCHA configurado, o cadastro NÃO funciona (falha fechada)', async () => {
    prod()
    const r = await reg('dev-captcha-pass')
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('captcha_unavailable')
  })
  it('o simulador "dev" é recusado em produção mesmo se configurado', async () => {
    prod({ CAPTCHA_PROVIDER: 'dev' })
    const r = await reg('dev-captcha-pass')
    expect(r.status).toBe(503)
  })
})
