export type BillingMode = 'inherit' | 'required' | 'free'
export function billingPolicy(globalRequired:boolean,globalPix:boolean,mode:BillingMode,suspended:boolean,configured:boolean) {
  const required=mode==='required'||(mode==='inherit'&&globalRequired)
  return {required,checkoutEnabled:required&&!suspended&&configured&&(mode==='required'||globalPix)}
}
