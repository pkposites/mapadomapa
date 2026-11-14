import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, advance, cleanDb, lastCode, PHONE, startDb, stopDb } from './helpers'

beforeAll(async () => { await startDb() })
afterAll(async () => { await stopDb() })
beforeEach(async () => { await cleanDb() })

describe('Nenhuma credencial vaza em logs ou respostas', () => {
  it('senha, código SMS, token de sessão e telefone completo não aparecem nos logs do servidor', async () => {
    const logs: string[] = []
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.map(String).join(' ')) })

    const PW = 'SENHA-MARCADOR-' + Math.random().toString(36).slice(2, 10)
    const NEW = 'NOVA-MARCADOR-' + Math.random().toString(36).slice(2, 10)
    await api('POST', '/auth/register', { body: { phone: PHONE, password: PW, acceptTerms: true } })
    const code = await lastCode()
    await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: '000000' } }) // erro de propósito
    const ok = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code } })
    const token = decodeURIComponent(ok.cookie!.split('=')[1])
    await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-' + PW } })
    advance(120)
    await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
    const rcode = await lastCode()
    await api('POST', '/auth/reset-password', { body: { phone: PHONE, code: rcode, password: NEW } })
    await api('POST', '/auth/login', { body: { phone: PHONE, password: NEW } })

    const all = logs.join('\n')
    for (const secret of [PW, NEW, code, rcode, token, '11912345678', '91234-5678']) {
      expect(all, `vazou: ${secret}`).not.toContain(secret)
    }
    vi.restoreAllMocks()
  })

  it('respostas de erro não revelam hash, segredo nem dados de outros usuários', async () => {
    await api('POST', '/auth/register', { body: { phone: PHONE, password: 'senha-segura-123', acceptTerms: true } })
    const dup = await api('POST', '/auth/register', { body: { phone: PHONE, password: 'outra-segura-456', acceptTerms: true } })
    const bad = await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-1234' } })
    for (const r of [dup, bad]) {
      const s = JSON.stringify(r.body)
      expect(s).not.toMatch(/scrypt|hash|AUTH_SECRET|dev-only-secret|postgres:\/\//i)
    }
  })
})
