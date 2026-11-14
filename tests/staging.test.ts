import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aiMode } from '../server/ai'
import { runInRequestContext } from '../server/lib/env'
import { handleApi } from '../server/handler'
import { metaMode } from '../server/lib/meta'
import { query } from '../server/lib/db'
import { cleanDb, PASSWORD, PHONE, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
beforeEach(async () => { await cleanDb() })

const HOST = 'homolog.exemplo.test'
const saved = { ...process.env }
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
  Object.assign(process.env, saved)
})

/** Simula o servidor da Netlify do site de homologação (produção do ponto de vista da Netlify). */
const asStaging = (extra: Record<string, string> = {}) => {
  process.env.VITEST = 'false'; process.env.NODE_ENV = 'production'; process.env.CONTEXT = 'production'
  delete process.env.NETLIFY_DEV
  Object.assign(process.env, { APP_ENV: 'staging', STAGING_HOSTNAME: HOST, AUTH_SECRET: 'h'.repeat(40), PRE_REGISTRATION_OPEN: 'true' }, extra)
}
const call = (method: string, path: string, body?: unknown, host = HOST) =>
  handleApi(new Request(`https://${host}/api${path}`, { method, headers: { 'content-type': 'application/json', host, 'user-agent': 'teste' }, body: body ? JSON.stringify(body) : undefined }), { ip: '203.0.113.5' })
    .then(async (r) => ({ status: r.status, body: await r.json(), headers: r.headers }))
const register = (host = HOST) => call('POST', '/auth/register', { phone: PHONE, password: PASSWORD, acceptTerms: true, captchaToken: 'dev-captcha-pass' }, host)

describe('Homologação válida: simuladores liberados, mas nada externo', () => {
  it('cadastro com SMS e CAPTCHA SIMULADOS funciona, e o código fica no banco (nenhum SMS real)', async () => {
    asStaging()
    const calls: string[] = []
    globalThis.fetch = (async (u: any, i: any) => { calls.push(String(u)); return realFetch(u, i) }) as typeof fetch
    const r = await register()
    expect(r.status).toBe(200)
    const [m] = await query<any>("SELECT provider, body FROM sms_messages")
    expect(m.provider).toBe('dev')
    expect(m.body).toMatch(/\b\d{6}\b/)
    expect(calls.filter((u) => /^https?:/.test(u))).toHaveLength(0) // nenhuma chamada externa
  })
  it('o painel de testes (/api/dev/sms) funciona e todas as respostas levam noindex', async () => {
    asStaging()
    await register()
    const r = await call('GET', '/dev/sms')
    expect(r.status).toBe(200)
    expect(r.body.messages).toHaveLength(1)
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect((await call('GET', '/status')).headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
  it('IA e Meta ficam em simulação (sem chave, sem rede)', () => {
    asStaging()
    runInRequestContext(HOST, () => { expect(aiMode()).toBe('sim'); expect(metaMode()).toBe('sim') })
  })
  it('cookie de sessão é Secure (é um site online)', async () => {
    asStaging()
    const code = (await register(), (await query<any>('SELECT body FROM sms_messages'))[0].body.match(/\b(\d{6})\b/)[1])
    const res = await handleApi(new Request(`https://${HOST}/api/auth/verify-phone`, { method: 'POST', headers: { 'content-type': 'application/json', host: HOST }, body: JSON.stringify({ phone: PHONE, code }) }), { ip: '203.0.113.5' })
    expect(res.headers.get('set-cookie')).toMatch(/; Secure/)
  })
})

describe('Homologação INVÁLIDA = comporta-se como produção (falha fechada)', () => {
  const blocked = async (label: string) => {
    expect((await call('GET', '/dev/sms')).status, `${label}: /dev/sms`).toBe(404)
    const r = await register()
    expect([403, 503], `${label}: cadastro`).toContain(r.status)
    expect((await query('SELECT 1 FROM sms_messages')).length, `${label}: SMS`).toBe(0)
  }
  it('endereço diferente do STAGING_HOSTNAME', async () => { asStaging(); expect((await call('GET', '/dev/sms', undefined, 'site-oficial.exemplo.test')).status).toBe(404); expect([403, 503]).toContain((await register('site-oficial.exemplo.test')).status) })
  it('sem STAGING_HOSTNAME', async () => { asStaging({ STAGING_HOSTNAME: '' }); await blocked('sem hostname') })
  it('APP_ENV diferente de staging', async () => { asStaging({ APP_ENV: 'production' }); await blocked('APP_ENV') })
  it.each([
    ['OPENAI_API_KEY', 'sk-falsa'], ['META_CAPI_ACCESS_TOKEN', 'x'.repeat(30)], ['TURNSTILE_SECRET_KEY', 'y'.repeat(20)],
    ['SMS_PROVIDER', 'zenvia'], ['AI_PROVIDER', 'openai'], ['CAPTCHA_PROVIDER', 'turnstile'],
  ])('presença de %s (credencial/serviço real) derruba o modo homologação', async (k, v) => { asStaging({ [k]: v }); await blocked(k) })
  it('produção comum (sem APP_ENV) continua sem simuladores', async () => {
    asStaging(); delete process.env.APP_ENV
    await blocked('produção')
  })
  it('o pré-cadastro em homologação só abre com PRE_REGISTRATION_OPEN=true explícito (cadastros públicos não liberados)', async () => {
    asStaging(); delete process.env.PRE_REGISTRATION_OPEN
    const r = await register()
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('preregistration_closed')
  })
})
