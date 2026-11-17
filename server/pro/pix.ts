import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { query, withTransaction } from '../lib/db'
import { env, isSimulationEnvironment } from '../lib/env'
import { ApiError } from '../lib/http'
import { enforce } from '../lib/rateLimit'
import { getRecharge, getSettings } from '../admin/recharges'
import { WEEKLY_PRICE, WEEKLY_DAYS } from '../../src/area/rechargePlan'

type Row = Record<string, any>
const WEBHOOK = 'https://mapadomapa.netlify.app/api/integrations/mercadopago/webhook'
const token = () => env('MERCADO_PAGO_ACCESS_TOKEN')
const webhookSecret = () => env('MERCADO_PAGO_WEBHOOK_SECRET')
const configured = () => Boolean(token() && webhookSecret())
const production = () => env('APP_ENV') !== 'staging' && !isSimulationEnvironment()
const newPaymentsEnabled = () => configured() && env('MERCADO_PAGO_PIX_ENABLED') === 'true' && production()
const gatewayError = () => new ApiError(503,'payment_unavailable','Não foi possível consultar o Mercado Pago agora. Tente novamente.')
const isUuid = (v:unknown) => typeof v==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const latest = async(userId:string) => (await query<Row>('SELECT * FROM request_recharge_payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[userId]))[0]
const pending = (p:Row|undefined) => p?.status==='creating'||p?.status==='pending'
const eligible = async(userId:string) => Boolean((await query<Row>(`SELECT 1 FROM users u JOIN professional_profiles p ON p.user_id=u.id
  WHERE u.id=$1 AND u.status='active' AND p.review_status='approved'
  AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')`,[userId]))[0])
function publicPayment(p:Row|undefined) {
  if(!p)return null
  return {id:String(p.id),status:String(p.status),expiresAt:p.expires_at,qrCode:p.status==='pending'?p.qr_code:null,qrImage:p.status==='pending'?p.qr_image:null,activated:Boolean(p.cycle_id)}
}
async function provider(path:string,method='GET',body?:unknown,key?:string):Promise<Row> {
  const access=token()
  if(!access)throw gatewayError()
  let res:Response
  try {res=await fetch('https://api.mercadopago.com/v1/'+path,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'})}catch{throw gatewayError()}
  if(!res.ok){ 
    // Não registrar corpo ou dados do comprador.
    if(method==='POST'&&res.status===400)throw new ApiError(400,'provider_rejected','O Mercado Pago não aceitou os dados. Confira as informações e tente de novo.')
    throw gatewayError()
  }
  try{return await res.json() as Row}catch{throw gatewayError()}
}

// Apenas resposta da API autenticada pode liberar um ciclo; nunca a notificação ou o navegador.
async function syncPayment(mp:Row,expected?:string) {
  const ref=mp.external_reference, pid=String(mp.id??'')
  if(!isUuid(ref)||!/^\d+$/.test(pid)|| (expected&&expected!==ref))return null
  if(mp.live_mode!==true||mp.payment_method_id!=='pix'||mp.currency_id!=='BRL'||Number(mp.transaction_amount)!==WEEKLY_PRICE)return null
  const [owner]=await query<Row>('SELECT user_id FROM request_recharge_payments WHERE id=$1',[ref])
  if(!owner)return null 
  return withTransaction(async tx=>{
    await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner.user_id],tx)
    const [p]=await query<Row>('SELECT * FROM request_recharge_payments WHERE id=$1 FOR UPDATE',[ref],tx)
    if(!p||(p.provider_id&&p.provider_id!==pid))return null
    const status=['approved','cancelled','rejected','refunded','charged_back'].includes(mp.status)?String(mp.status):'pending'
    // Não reverta estado já confirmado devido a notificações atrasadas.
    if(['refunded','charged_back'].includes(p.status))return p
    if(p.status==='approved'&&!['refunded','charged_back'].includes(status))return p
    let cycle=p.cycle_id
    if(status==='approved'&&!cycle){
      const active=await getRecharge(String(p.user_id),tx)
      const [grant]=await query<Row>(`INSERT INTO request_recharge_cycles(user_id,starts_at,expires_at)
        VALUES ($1,now(),GREATEST(now(),COALESCE($2::timestamptz,now()))+($3::int * interval '1 day')) RETURNING id`,[p.user_id,active.active?active.expiresAt:null,WEEKLY_DAYS],tx)
      cycle=grant.id
    }
    if(cycle&&['refunded','charged_back'].includes(status))await query('UPDATE request_recharge_cycles SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[cycle],tx)
    const td=mp.point_of_interaction?.transaction_data
    const qr=typeof td?.qr_code==='string'&&td.qr_code.length<=10000?td.qr_code:null
    const img=typeof td?.qr_code_base64==='string'&&td.qr_code_base64.length<=500000&&/^[A-Za-z0-9+/=]+$/.test(td.qr_code_base64)?td.qr_code_base64:null
    const expiry=typeof mp.date_of_expiration==='string'&&Number.isFinite(Date.parse(mp.date_of_expiration))?mp.date_of_expiration:p.expires_at
    const [updated]=await query<Row>(`UPDATE request_recharge_payments SET provider_id=$2,status=$3,cycle_id=$4,qr_code=CASE WHEN $3='pending' THEN COALESCE($5,qr_code) ELSE NULL END,
      qr_image=CASE WHEN $3='pending' THEN COALESCE($6,qr_image) ELSE NULL END,expires_at=$7,updated_at=now() WHERE id=$1 RETURNING *`,[ref,pid,status,cycle,qr,img,expiry],tx)
    return updated
  })
}
async function refresh(p:Row|undefined) {
  if(!p?.provider_id||!token()||!production())return p
  return await syncPayment(await provider('payments/'+encodeURIComponent(p.provider_id)),String(p.id))??p
}
export async function checkoutState(userId:string,master:boolean,verify=false) {
  if(master)return {available:false,active:false,eligible:false,payment:null}
  let p=await latest(userId)
  if(verify&&pending(p)){await enforce('pix:verify:'+userId,180,3600);p=await refresh(p)??p}
  const recharge=await getRecharge(userId)
  return {available:newPaymentsEnabled()&&recharge.enabled,active:recharge.active,eligible:await eligible(userId),expiresAt:recharge.expiresAt,payment:publicPayment(p)}
}
function validCpf(cpf:string) {
  if(!/^\d{11}$/.test(cpf)||/^(\d)\1+$/.test(cpf))return false
  const digit=(n:number)=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);const rem=(sum*10)%11;return rem===10?0:rem}
  return digit(9)===Number(cpf[9])&&digit(10)===Number(cpf[10])
}
export async function createPix(userId:string,master:boolean,body:Record<string,unknown>) {
  if(master||!newPaymentsEnabled()||!(await getSettings()).enabled)throw new ApiError(409,'not_available','A contratação ainda não está disponível.')
  if(!(await eligible(userId)))throw new ApiError(403,'not_approved','Aprove seu cadastro antes de contratar.')
  await enforce('pix:create:'+userId,8,3600)
  // Quando há um Pix pendente, devolver o mesmo, não criar outro.
  const p=await latest(userId)
  if(pending(p)&&p?.provider_id){
    const checked=await refresh(p)
    if(checked&&pending(checked))return {payment:publicPayment(checked)}
    if(checked?.status==='approved')return {payment:publicPayment(checked)}
  }
  const email=typeof body.email==='string'?body.email.trim():''
  const cpf=typeof body.cpf==='string'?body.cpf.replace(/\D/g,''):''
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!validCpf(cpf)||body.consent!==true)throw new ApiError(400,'invalid_payer','Informe e-mail e CPF válidos e confirme o envio ao Mercado Pago.')
  const attempt=await withTransaction(async tx=>{
    await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId],tx)
    const r=await getRecharge(userId,tx)
    if(!r.enabled||r.active)throw new ApiError(409,'already_active','Já existe uma recarga ativa ou a contratação foi pausada.')
    const [existing]=await query<Row>("SELECT * FROM request_recharge_payments WHERE user_id=$1 AND status IN ('creating','pending') LIMIT 1",[userId],tx)
    if(existing)return existing
    const [created]=await query<Row>("INSERT INTO request_recharge_payments(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour') RETURNING *",[randomUUID(),userId],tx)
    return created
  })
  if(attempt.provider_id)return {payment:publicPayment(await refresh(attempt))}
  let mp:Row
  try {
    mp=await provider('payments','POST',{transaction_amount:WEEKLY_PRICE,description:'Mapa do Mapa - Recarga de 7 dias',payment_method_id:'pix',payer:{email,identification:{type:'CPF',number:cpf}},date_of_expiration:new Date(attempt.expires_at).toISOString(),external_reference:attempt.id,notification_url:WEBHOOK+'?source_news=webhooks'},String(attempt.id))
  } catch(e) {
    // Mesmo uma falha ambígua mantém a chave: não criar outro Pix sem confirmação do provedor.
    throw e
  }
  const synced=await syncPayment(mp,String(attempt.id))
  if(!synced)throw gatewayError()
  return {payment:publicPayment(synced)}
}
export async function webhook(req:Request) {
  const secret=webhookSecret()
  if(!secret||!token())throw new ApiError(503,'payment_unavailable','Pagamento indisponível.')
  const url=new URL(req.url)
  const id=url.searchParams.get('data.id')??''
  const rid=req.headers.get('x-request-id')??''
  const signature=req.headers.get('x-signature')??''
  const parts=Object.fromEntries(signature.split(',').map(part=>part.trim().split('=',2)).filter(part=>part.length===2))
  if(!/^\d+$/.test(id)||!rid||!/^\d+$/.test(parts.ts??'')||!/^[a-fA-F0-9]{64}$/.test(parts.v1??''))throw new ApiError(401,'invalid_signature','Notificação inválida.')
  const actual=Buffer.from(parts.v1,'hex')
  const expected=createHmac('sha256',secret).update('id:'+id+';request-id:'+rid+';ts:'+parts.ts+';').digest()
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new ApiError(401,'invalid_signature','Notificação inválida.')
  if(!production())throw new ApiError(503,'payment_unavailable','Pagamento indisponível.')
  await syncPayment(await provider('payments/'+id))
  return {ok:true}
}
