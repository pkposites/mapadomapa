import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPix, webhook } from '../server/pro/pix'

afterEach(() => { vi.unstubAllEnvs() })
describe('Segurança do Pix de recarga',()=>{
  it('não permite cobrança sem ativação explícita',async()=>{
    vi.stubEnv('MERCADO_PAGO_PIX_ENABLED','false')
    await expect(createPix('unused',false,{})).rejects.toMatchObject({code:'not_available'})
  })
  it('não gera cobrança para a conta mestre',async()=>{
    vi.stubEnv('MERCADO_PAGO_PIX_ENABLED','true')
    await expect(createPix('unused',true,{})).rejects.toMatchObject({code:'not_available'})
  })
  it('recusa notificações sem assinatura válida',async()=>{
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN','non-production-unit-test')
    vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET','non-production-unit-test')
    await expect(webhook(new Request('https://example.invalid/api/integrations/mercadopago/webhook?data.id=123',{method:'POST'}))).rejects.toMatchObject({code:'invalid_signature'})
  })
})
