import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { api, E164, PASSWORD, PHONE, signup, startDb, stopDb, usingRealPostgres } from './helpers'

// Persistência: os dados sobrevivem a reiniciar o banco (banco embutido em disco).
describe.skipIf(usingRealPostgres())('Persistência dos dados', () => {
  it('conta, senha e sessão continuam valendo depois de desligar e religar o banco', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdm-db-'))
    try {
      await startDb(dir)
      const cookie = await signup()
      expect((await api('GET', '/auth/me', { cookie })).status).toBe(200)
      await stopDb()

      await startDb(dir) // "reinício do servidor"
      expect((await query('SELECT 1 FROM users')).length).toBe(1)
      expect((await query<any>('SELECT e164 FROM phones'))[0].e164).toBe(E164)
      expect((await api('GET', '/auth/me', { cookie })).status).toBe(200) // mesma sessão
      expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(200)
      // telefone continua protegido contra duplicidade depois do reinício
      const dup = await api('POST', '/auth/register', { body: { phone: PHONE, password: 'outra-senha-forte-9', acceptTerms: true } })
      expect(dup.status).toBe(409)
      await stopDb()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
