import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { api, cleanDb, PASSWORD, PHONE, signup, smsCount, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
beforeEach(async () => { await cleanDb() })

const saved = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
  Object.assign(process.env, saved)
})
const reg = () => api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true } })

describe('Pré-cadastro x abertura dos pedidos (25/12/2026)', () => {
  it('localmente o pré-cadastro está aberto', async () => {
    expect((await api('GET', '/status')).body).toEqual({ preRegistrationOpen: true })
    expect((await reg()).status).toBe(200)
  })

  it('em produção ele nasce FECHADO: nenhuma conta, nenhum SMS, mensagem clara', async () => {
    process.env.VITEST = 'false'; process.env.NODE_ENV = 'production'; process.env.CONTEXT = 'production'
    delete process.env.PRE_REGISTRATION_OPEN
    expect((await api('GET', '/status')).body).toEqual({ preRegistrationOpen: false })
    const r = await reg()
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('preregistration_closed')
    expect(r.body.error.message).toContain('pré-cadastro')
    expect((await query('SELECT 1 FROM users')).length).toBe(0)
    expect(await smsCount()).toBe(0)
  })

  it('só abre em produção com PRE_REGISTRATION_OPEN=true (decisão explícita)', async () => {
    process.env.VITEST = 'false'; process.env.NODE_ENV = 'production'; process.env.CONTEXT = 'production'
    process.env.PRE_REGISTRATION_OPEN = 'true'
    expect((await api('GET', '/status')).body.preRegistrationOpen).toBe(true)
  })

  it('fechar o pré-cadastro não tranca quem já tem conta (login e recuperação seguem)', async () => {
    await signup()
    process.env.PRE_REGISTRATION_OPEN = 'false'
    expect((await api('GET', '/status')).body.preRegistrationOpen).toBe(false)
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(200)
  })
})
