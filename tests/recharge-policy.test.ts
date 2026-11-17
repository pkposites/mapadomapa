import { describe, expect, it } from 'vitest'
import { billingPolicy } from '../server/admin/recharge-policy'
describe('Política de cobrança',()=>{
  it('por padrão não exige nem oferece Pix',()=>expect(billingPolicy(false,false,'inherit',false,true)).toEqual({required:false,checkoutEnabled:false}))
  it('permite ativação individual sem cobrança geral',()=>expect(billingPolicy(false,false,'required',false,true)).toEqual({required:true,checkoutEnabled:true}))
  it('permite isenção individual com cobrança geral',()=>expect(billingPolicy(true,true,'free',false,true)).toEqual({required:false,checkoutEnabled:false}))
  it('segue o modo geral quando não há exceção',()=>expect(billingPolicy(true,true,'inherit',false,true)).toEqual({required:true,checkoutEnabled:true}))
  it('a trava bloqueia inclusive emissão individual',()=>expect(billingPolicy(false,false,'required',true,true)).toEqual({required:true,checkoutEnabled:false}))
  it('não emite Pix sem credenciais',()=>expect(billingPolicy(true,true,'inherit',false,false)).toEqual({required:true,checkoutEnabled:false}))
})
