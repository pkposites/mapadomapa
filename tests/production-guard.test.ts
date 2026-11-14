import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { api, cleanDb, PASSWORD, PHONE, signup, startDb, stopDb } from './helpers'

beforeAll(async () => {
  await startDb()
})
afterAll(async () => {
  await stopDb()
})
beforeEach(async () => {
  await cleanDb()
})

/** Simula o ambiente de produção: nada de "dev" liberado. */
async function inProduction<T>(fn: () => Promise<T>, extra: Record<string, string> = {}): Promise<T> {
  const saved = { ...process.env }
  process.env.VITEST = 'false'
  process.env.NODE_ENV = 'production'
  process.env.CONTEXT = 'production'
  delete process.env.NETLIFY_DEV
  delete process.env.AUTH_SECRET
  delete process.env.SMS_PROVIDER
  Object.assign(process.env, extra)
  try {
    return await fn()
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
}

describe('Travas de produção', () => {
  it('rotas /api/dev/* não existem em produção', async () => {
    await inProduction(async () => {
      expect((await api('GET', '/dev/sms')).status).toBe(404)
      expect((await api('POST', '/dev/expire-codes', { body: { phone: PHONE } })).status).toBe(404)
      expect((await api('POST', '/dev/reset-limits', { body: {} })).status).toBe(404)
    })
  })

  it('o simulador de SMS é recusado em produção, mesmo com SMS_PROVIDER=dev', async () => {
    await inProduction(
      async () => {
        const r = await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
        expect(r.status).toBe(503)
        expect(r.body.error.code).toBe('sms_unavailable')
        expect((await query('SELECT 1 FROM sms_messages')).length).toBe(0) // nada foi "enviado"
      },
      { SMS_PROVIDER: 'dev', AUTH_SECRET: 'x'.repeat(40) },
    )
  })

  it('sem provedor real configurado, o envio falha de forma explícita (não finge que enviou)', async () => {
    await inProduction(async () => {
      const r = await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
      expect(r.status).toBe(503)
    })
  })

  it('sem AUTH_SECRET em produção, a API não gera códigos (falha fechada)', async () => {
    await inProduction(async () => {
      const r = await api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })
      expect(r.status).toBeGreaterThanOrEqual(500)
    }, { SMS_PROVIDER: 'dev' })
  })

  it('em produção o cookie de sessão é Secure + HttpOnly + SameSite', async () => {
    await signup()
    await inProduction(async () => {
      const r = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })
      expect(r.status).toBe(200)
      const c = r.headers.get('set-cookie')!
      expect(c).toMatch(/; Secure/)
      expect(c).toMatch(/HttpOnly/)
      expect(c).toMatch(/SameSite=Lax/)
    })
  })

  it('no ambiente local o cookie funciona em http (para testar no celular pela rede)', async () => {
    await signup()
    const r = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })
    expect(r.headers.get('set-cookie')).not.toMatch(/; Secure/)
  })
})
