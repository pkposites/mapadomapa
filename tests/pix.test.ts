import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPix, webhook, orderFacts } from '../server/pro/pix'

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

describe('Validação de Orders',()=>{
  const ref='12345678-1234-4134-8134-123456789abc'
  const order=()=>({id:'ORD01HRYFWNYRE1MR1E60MW3X0T2P',type:'online',country_code:'BRA',external_reference:ref,total_amount:'175.00',total_paid_amount:'175.00',status:'processed',status_detail:'accredited',transactions:{payments:[{amount:'175.00',paid_amount:'175.00',status:'processed',status_detail:'accredited',payment_method:{id:'pix',type:'bank_transfer'}}]}})
  it('aprova apenas Pix integral confirmado',()=>expect(orderFacts(order(),ref)?.status).toBe('approved'))
  it('recusa outro valor, moeda, referência ou ambiente de teste',()=>{
    expect(orderFacts({...order(),total_amount:'1.00'})).toBeNull()
    expect(orderFacts({...order(),country_code:'ARG'})).toBeNull()
    expect(orderFacts(order(),'different')).toBeNull()
    expect(orderFacts({...order(),live_mode:false})).toBeNull()
  })
  it('não ativa quando o valor pago não é integral ou está pendente',()=>{
    expect(orderFacts({...order(),total_paid_amount:'0.00'})?.status).toBe('pending')
    expect(orderFacts({...order(),status:'action_required'})?.status).toBe('pending')
  })
  it('suspende em caso de estorno',()=>expect(orderFacts({...order(),status:'refunded'})?.status).toBe('refunded'))
})
