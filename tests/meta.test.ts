import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { query } from '../server/lib/db'
import { buildEvent, hashPhone, metaMode } from '../server/lib/meta'
import { handleApi } from '../server/handler'
import { api, cleanDb, E164, lastCode, PASSWORD, PHONE, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
beforeEach(async () => { await cleanDb() })

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const FAKE_TOKEN = 'TOKEN_FALSO_SO_PARA_TESTE_1234567890abcdef'
const PIXEL = '2018578222100683'

/** Cadastra e confirma o celular; devolve a resposta do verify-phone. */
async function signupVerify(opts: { consent?: boolean; headers?: Record<string, string>; fbp?: string; fbc?: string } = {}) {
  await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
  const code = await lastCode()
  const body: Record<string, unknown> = { phone: PHONE, code }
  if (opts.consent !== undefined) body.trackingConsent = opts.consent
  if (opts.fbp) body.fbp = opts.fbp
  if (opts.fbc) body.fbc = opts.fbc
  const req = new Request('http://localhost:5173/api/auth/verify-phone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost:5173', 'user-agent': 'Mozilla/5.0 (teste)', ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
  })
  const res = await handleApi(req, { ip: '203.0.113.7' })
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') }
}
const events = () => query<any>('SELECT * FROM tracking_events ORDER BY created_at')

describe('Evento montado para a Conversions API', () => {
  it('telefone vira SHA-256 só de dígitos com código do país (regra da Meta)', () => {
    expect(hashPhone('+5511912345678')).toBe(sha('5511912345678'))
    expect(hashPhone('+5511912345678')).not.toContain('5511912345678')
  })
  it('campos obrigatórios, hash nos dados pessoais e IP/UA sem hash', () => {
    const e = buildEvent({ eventName: 'CompleteRegistration', eventId: 'abc-123', userId: 'USER-1', phone: E164, ip: '203.0.113.7', userAgent: 'UA-teste', sourceUrl: 'https://site.com/cadastro' })
    expect(e).toMatchObject({ event_name: 'CompleteRegistration', event_id: 'abc-123', action_source: 'website', event_source_url: 'https://site.com/cadastro' })
    expect(Number.isInteger(e.event_time)).toBe(true)
    expect(e.user_data.ph).toEqual([sha('5511912345678')])
    expect(e.user_data.external_id).toEqual([sha('user-1')])
    expect(e.user_data.client_ip_address).toBe('203.0.113.7') // IP não leva hash
    expect(e.user_data.client_user_agent).toBe('UA-teste')
    expect(JSON.stringify(e)).not.toContain('11912345678')
  })
  it('fbp/fbc só passam se tiverem o formato da Meta (nada de lixo do cliente)', () => {
    const ok = buildEvent({ eventName: 'X', eventId: '1', userId: 'u', phone: E164, fbp: 'fb.1.1700000000000.1234567890', fbc: 'fb.1.1700000000000.AbCdEf' })
    expect(ok.user_data.fbp).toBe('fb.1.1700000000000.1234567890')
    expect(ok.user_data.fbc).toBe('fb.1.1700000000000.AbCdEf')
    const bad = buildEvent({ eventName: 'X', eventId: '1', userId: 'u', phone: E164, fbp: '<script>alert(1)</script>', fbc: 12345 })
    expect(bad.user_data.fbp).toBeUndefined()
    expect(bad.user_data.fbc).toBeUndefined()
  })
})

describe('Consentimento e privacidade', () => {
  it('SEM consentimento: nenhum evento, nenhuma linha, nenhum eventId devolvido', async () => {
    for (const consent of [undefined, false]) {
      await cleanDb()
      const r = await signupVerify({ consent })
      expect(r.status).toBe(200)
      expect(r.body.tracking).toBeUndefined()
      expect(await events()).toHaveLength(0)
    }
  })
  it('consent só vale se for exatamente true (textos/números não contam)', async () => {
    const r = await signupVerify({ consent: 'true' as unknown as boolean })
    expect(r.body.tracking).toBeUndefined()
    expect(await events()).toHaveLength(0)
  })
  it('COM consentimento: devolve event_id e grava o evento simulado com o MESMO id', async () => {
    const r = await signupVerify({ consent: true })
    expect(r.status).toBe(200)
    expect(r.body.tracking.eventName).toBe('CompleteRegistration')
    expect(r.body.tracking.eventId).toMatch(/^[0-9a-f-]{36}$/)
    const rows = await events()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ event_name: 'CompleteRegistration', event_id: r.body.tracking.eventId, mode: 'sim', status: 'simulated' })
    const s = JSON.stringify(rows[0].payload)
    expect(s).not.toContain('11912345678') // telefone só em hash
    expect(s).not.toContain('203.0.113.7') // IP nunca é gravado
    expect(s).not.toContain('Mozilla') // user agent nunca é gravado
    expect(s).not.toContain(PASSWORD)
  })
  it('Sec-GPC: 1 e DNT: 1 (sinais de privacidade) anulam o consentimento', async () => {
    for (const h of [{ 'sec-gpc': '1' }, { dnt: '1' }] as Record<string, string>[]) {
      await cleanDb()
      const r = await signupVerify({ consent: true, headers: h })
      expect(r.status).toBe(200) // o cadastro funciona normalmente
      expect(r.body.tracking).toBeUndefined()
      expect(await events()).toHaveLength(0)
    }
  })
  it('o cadastro funciona igual, com ou sem rastreamento', async () => {
    const r = await signupVerify({ consent: false })
    expect(r.status).toBe(200)
    expect(r.cookie).toMatch(/mdm_session=/)
  })
})

describe('Deduplicação por event_name + event_id', () => {
  it('o banco impede o mesmo (event_name, event_id) duas vezes', async () => {
    const r = await signupVerify({ consent: true })
    const [{ user_id }] = await events()
    await expect(
      query("INSERT INTO tracking_events (event_name, event_id, user_id, mode, status) VALUES ('CompleteRegistration', $1, $2, 'sim', 'simulated')", [r.body.tracking.eventId, user_id]),
    ).rejects.toMatchObject({ code: '23505' })
  })
  it('um novo cadastro gera event_id diferente', async () => {
    const a = await signupVerify({ consent: true })
    const ids = new Set([a.body.tracking.eventId])
    expect(ids.size).toBe(1)
  })
})

describe('Isolamento local: nunca chama a Meta', () => {
  const saved = { ...process.env }
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  })
  it('mesmo com token e pixel configurados, no ambiente local nada sai para a internet', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = FAKE_TOKEN
    process.env.VITE_META_PIXEL_ID = PIXEL
    process.env.META_TEST_EVENT_CODE = 'TEST123'
    const calls: string[] = []
    globalThis.fetch = (async (u: any) => { calls.push(String(u)); return new Response('{}') }) as typeof fetch
    expect(metaMode()).toBe('sim')
    const r = await signupVerify({ consent: true })
    expect(r.status).toBe(200)
    expect(calls.filter((u) => u.includes('facebook'))).toHaveLength(0)
    expect((await events())[0].mode).toBe('sim')
  })
})

describe('Modo live (produção simulada, rede falsa — nenhuma chamada real)', () => {
  const saved = { ...process.env }
  const realFetch = globalThis.fetch
  let calls: { url: string; body: any }[] = []
  const prod = (extra: Record<string, string | undefined> = {}) => {
    process.env.VITEST = 'false'; process.env.NODE_ENV = 'production'; process.env.CONTEXT = 'production'
    delete process.env.NETLIFY_DEV
    // Em "produção" o cadastro exige SMS real e CAPTCHA real: aqui só provamos o rastreamento,
    // então criamos a conta no modo local e trocamos para produção na hora de confirmar.
    for (const [k, v] of Object.entries(extra)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  }
  const mockMeta = (impl: (body: any) => Response | Promise<Response>) => {
    calls = []
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('graph.facebook.com')) {
        const body = JSON.parse(init.body)
        calls.push({ url: String(url), body })
        return impl(body)
      }
      return realFetch(url, init)
    }) as typeof fetch
  }
  beforeEach(() => { mockMeta(() => Response.json({ events_received: 1 })) })
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
    vi.restoreAllMocks()
  })

  // Obs.: o código SMS só pode ser gerado no modo local (provedor real não existe). Para isolar o rastreamento,
  // o código é gerado localmente e consumido já com o ambiente em "produção" — por isso AUTH_SECRET de dev é mantido.
  const LIVE = { VITE_META_PIXEL_ID: PIXEL, META_CAPI_ACCESS_TOKEN: FAKE_TOKEN }

  it('envia UMA chamada ao endpoint documentado, com o token no corpo (nunca na URL) e event_id igual ao do navegador', async () => {
    // AUTH_SECRET de dev é aceito apenas porque o código foi gerado antes; produção real exige AUTH_SECRET.
    process.env.AUTH_SECRET = 'x'.repeat(40)
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod(LIVE)
    expect(metaMode()).toBe('live')
    const res = await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', {
      method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test', 'user-agent': 'UA-prod' },
      body: JSON.stringify({ phone: PHONE, code, trackingConsent: true, fbp: 'fb.1.1700000000000.1234567890' }),
    }), { ip: '198.51.100.9' })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`https://graph.facebook.com/v25.0/${PIXEL}/events`)
    expect(calls[0].url).not.toContain(FAKE_TOKEN) // token fora da URL
    expect(calls[0].body.access_token).toBe(FAKE_TOKEN)
    expect(calls[0].body.test_event_code).toBeUndefined()
    const ev = calls[0].body.data[0]
    expect(ev).toMatchObject({ event_name: 'CompleteRegistration', event_id: body.tracking.eventId, action_source: 'website', event_source_url: 'https://mapadomapa.test/cadastro' })
    expect(ev.user_data).toMatchObject({ ph: [sha('5511912345678')], client_ip_address: '198.51.100.9', client_user_agent: 'UA-prod', fbp: 'fb.1.1700000000000.1234567890' })
    const [row] = await events()
    expect(row).toMatchObject({ mode: 'live', status: 'sent', http_status: 200 })
    // o que fica no banco não tem token, IP nem user agent
    const stored = JSON.stringify(row)
    for (const secret of [FAKE_TOKEN, '198.51.100.9', 'UA-prod', '11912345678']) expect(stored).not.toContain(secret)
  })

  it('META_TEST_EVENT_CODE é repassado quando definido (para o Test Events do Gerenciador)', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40)
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod({ ...LIVE, META_TEST_EVENT_CODE: 'TEST98765' })
    await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', { method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test' }, body: JSON.stringify({ phone: PHONE, code, trackingConsent: true }) }), { ip: '198.51.100.9' })
    expect(calls[0].body.test_event_code).toBe('TEST98765')
  })

  it('Meta responde com erro (HTTP 500): o cadastro NÃO é afetado e a falha fica registrada sem o token', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40)
    const logs: string[] = []
    for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.map(String).join(' ')) })
    mockMeta(() => new Response(`erro interno com ${FAKE_TOKEN} dentro`, { status: 500 }))
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod(LIVE)
    const res = await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', { method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test' }, body: JSON.stringify({ phone: PHONE, code, trackingConsent: true }) }), { ip: '198.51.100.9' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/mdm_session=/)
    const [row] = await events()
    expect(row).toMatchObject({ status: 'failed', http_status: 500 })
    expect(JSON.stringify(row)).not.toContain(FAKE_TOKEN)
    expect(logs.join('\n')).not.toContain(FAKE_TOKEN)
  })

  it('Meta inacessível (erro de rede): o cadastro NÃO é afetado', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40)
    mockMeta(() => { throw new Error('ECONNREFUSED simulado') })
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod(LIVE)
    const res = await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', { method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test' }, body: JSON.stringify({ phone: PHONE, code, trackingConsent: true }) }), { ip: '198.51.100.9' })
    expect(res.status).toBe(200)
    expect((await events())[0]).toMatchObject({ status: 'failed', http_status: null })
  })

  it('sem token ou sem Pixel em produção: não envia nada (modo off) e o cadastro funciona', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40)
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod({ VITE_META_PIXEL_ID: PIXEL, META_CAPI_ACCESS_TOKEN: undefined })
    expect(metaMode()).toBe('off')
    const res = await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', { method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test' }, body: JSON.stringify({ phone: PHONE, code, trackingConsent: true }) }), { ip: '198.51.100.9' })
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(0)
    expect(await events()).toHaveLength(0)
  })

  it('sem consentimento, nada vai à Meta nem em produção', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40)
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod(LIVE)
    const res = await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', { method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test' }, body: JSON.stringify({ phone: PHONE, code, trackingConsent: false }) }), { ip: '198.51.100.9' })
    expect(res.status).toBe(200)
    expect((await res.json()).tracking).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  it('o token nunca aparece na resposta da API', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40)
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
    const code = await lastCode()
    prod(LIVE)
    const res = await handleApi(new Request('https://mapadomapa.test/api/auth/verify-phone', { method: 'POST', headers: { 'content-type': 'application/json', host: 'mapadomapa.test' }, body: JSON.stringify({ phone: PHONE, code, trackingConsent: true }) }), { ip: '198.51.100.9' })
    expect(JSON.stringify(await res.json())).not.toContain(FAKE_TOKEN)
  })
})
