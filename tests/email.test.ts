import { describe,it,expect,vi,afterEach } from 'vitest'
import { templates, renderEmail, kindForEvent, isEmailKind } from '../server/lib/email-templates'
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

describe('Modelos e controles automáticos',()=>{
  it('tem assunto, versão HTML com CTA e texto para todos os tipos',()=>{
    for(const kind of Object.keys(templates).filter(isEmailKind)){
      const t=renderEmail(kind)
      expect(t.subject).toBeTruthy()
      expect(t.html).toContain('https://mapadomapa.netlify.app/area')
      expect(t.text).toContain('https://mapadomapa.netlify.app/area')
      expect(t.html.includes('Gerenciar preferências')).toBe(templates[kind].optional)
      expect(t.html).not.toContain('<script')
    }
  })
  it('não confunde eventos financeiros e escapa HTML',()=>{
    expect(kindForEvent('payment-123')).toBe('payment_paid')
    expect(kindForEvent('payment-cancelled-123')).toBe('payment_cancelled')
    expect(kindForEvent('payment-refund-123')).toBe('payment_refund')
    expect(kindForEvent('payment-pending-123')).toBe('payment_pending')
    expect(kindForEvent('payment-expired-123')).toBe('payment_expired')
    expect(kindForEvent('request-123')).toBe('request')
    expect(kindForEvent('unknown')).toBeNull()
    expect(renderEmail('approved','<script>alert(1)</script>').html).toContain('&lt;script&gt;')
    expect(renderEmail('approved','<script>alert(1)</script>').html).not.toContain('<script>')
  })
})
