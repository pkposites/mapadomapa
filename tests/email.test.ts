import { describe,it,expect,vi,afterEach } from 'vitest'
import { normalizeEmail,emailConfigured,sendEmail } from '../server/lib/email'
afterEach(()=>vi.unstubAllEnvs())
describe('E-mail profissional',()=>{
  it('normaliza e rejeita endereços inválidos',()=>{
    expect(normalizeEmail('  Nome@EXAMPLE.test ')).toBe('nome@example.test')
    for(const value of ['',null,'a@b','a b@example.test','a@example.test\nBcc:other@example.test'])expect(normalizeEmail(value)).toBeNull()
  })
  it('não chama Resend em testes nem homologação',async()=>{
    vi.stubEnv('APP_ENV','staging');vi.stubEnv('RESEND_API_KEY','fake-test');vi.stubEnv('RESEND_FROM','test@example.test')
    expect(emailConfigured()).toBe(false);expect(await sendEmail('test@example.test','Teste','Teste','test')).toBe(false)
  })
})
