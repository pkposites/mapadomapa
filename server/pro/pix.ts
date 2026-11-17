import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { query, withTransaction } from '../lib/db'
import { env, isSimulationEnvironment } from '../lib/env'
import { ApiError } from '../lib/http'
import { enforce } from '../lib/rateLimit'
import { getRecharge, getSettings, pixConfigured, adminRecharge } from '../admin/recharges'
import { WEEKLY_PRICE, WEEKLY_DAYS } from '../../src/area/rechargePlan'

type Row = Record<string, any>
const token = () => env('MERCADO_PAGO_ACCESS_TOKEN')
const webhookSecret = () => env('MERCADO_PAGO_WEBHOOK_SECRET')
const production = () => env('APP_ENV') !== 'staging' && !isSimulationEnvironment()
const newPaymentsEnabled = async () => pixConfigured() && env('MERCADO_PAGO_PIX_ENABLED') !== 'false' && (await getSettings()).pixEnabled
const gatewayError = () => new ApiError(503,'payment_unavailable','Não foi possível consultar o Mercado Pago agora. Tente novamente.')
const isUuid = (v:unknown) => typeof v==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const latest = async(userId:string) => (await query<Row>('SELECT * FROM request_recharge_payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[userId]))[0]
const pending = (p:Row|undefined) => p?.status==='creating'||p?.status==='pending'
const eligible = async(userId:string) => Boolean((await query<Row>(`SELECT 1 FROM users u JOIN professional_profiles p ON p.user_id=u.id
  WHERE u.id=$1 AND u.status='active' AND p.review_status='approved'
  AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')`,[userId]))[0])
function publicPayment(p:Row|undefined) {
  if(!p)return null
  return {id:String(p.id),status:String(p.status),expiresAt:p.expires_at,qrCode:p.status==='pending'&&Date.parse(p.expires_at)>Date.now()?p.qr_code:null,qrImage:p.status==='pending'&&Date.parse(p.expires_at)>Date.now()?p.qr_image:null,activated:Boolean(p.cycle_id)}
}
async function provider(path:string,method='GET',body?:unknown,key?:string):Promise<Row> {
  const access=token()
  if(!access)throw gatewayError()
  let res:Response
  try {res=await fetch('https://api.mercadopago.com/v1/'+path,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'})}catch{throw gatewayError()}
  if(!res.ok){
    if(method==='GET'&&res.status===404)throw new ApiError(404,'order_not_found','Pagamento não encontrado.') 
    // Não registrar corpo ou dados do comprador.
    if(method==='POST'&&res.status===400)throw new ApiError(400,'provider_rejected','O Mercado Pago não aceitou os dados. Confira as informações e tente de novo.')
    throw gatewayError()
  }
  try{return await res.json() as Row}catch{throw gatewayError()}
}

// Apenas a resposta autenticada da Orders API determina a situação financeira.
const exactAmount=(v:unknown)=> (typeof v==='string'||typeof v==='number') && /^\d+(?:\.\d{1,2})?$/.test(String(v)) && Number(v)===WEEKLY_PRICE
export function orderFacts(mp:Row,expected?:string) {
  const ref=mp.external_reference, pid=String(mp.id??'').toUpperCase()
  if(!isUuid(ref)||!/^ORD[A-Z0-9]{26}$/.test(pid)||(expected&&ref!==expected))return null
  if(mp.live_mode===false||mp.type!=='online'||(mp.country_code!=='BRA'&&mp.currency_id!=='BRL')||(mp.country_code&&mp.country_code!=='BRA')||(mp.currency_id&&mp.currency_id!=='BRL')||!exactAmount(mp.total_amount))return null
  const payments=mp.transactions?.payments
  if(payments!==undefined&&(!Array.isArray(payments)||payments.length>1))return null
  const payment=payments?.[0], td=payment?.payment_method
  if(payment&&(!exactAmount(payment.amount)||td?.id!=='pix'||td?.type!=='bank_transfer'))return null
  const states=[mp.status,mp.status_detail,payment?.status,payment?.status_detail]
  let status='pending'
  if(states.some(v=>['charged_back','chargeback'].includes(v))||mp.transactions?.chargebacks?.length)status='charged_back'
  else if(states.some(v=>['refunded','partially_refunded'].includes(v))||mp.transactions?.refunds?.length)status='refunded'
  else if(states.some(v=>['canceled','cancelled','expired'].includes(v)))status='cancelled'
  else if(states.some(v=>['failed','rejected'].includes(v)))status='rejected'
  else if(mp.status==='processed'&&mp.status_detail==='accredited'&&payment?.status==='processed'&&payment.status_detail==='accredited'&&exactAmount(mp.total_paid_amount)&&exactAmount(payment.paid_amount))status='approved'
  else if(!payment&&!['created','processing','action_required'].includes(mp.status))return null
  const date=payment?.date_of_expiration
  const expiry=typeof date==='string'&&Number.isFinite(Date.parse(date))?date:typeof mp.created_date==='string'&&Number.isFinite(Date.parse(mp.created_date))?new Date(Date.parse(mp.created_date)+3600000).toISOString():null
  return {ref: String(ref),pid,status,td,expiry}
}

// Apenas resposta da API autenticada pode liberar um ciclo; nunca a notificação ou o navegador.
async function syncPayment(mp:Row,expected?:string,expectedId?:string) {
  const facts=orderFacts(mp,expected)
  if(!facts||(expectedId&&facts.pid!==expectedId.toUpperCase()))return null
  const {ref,pid,status,td,expiry}=facts
  const [owner]=await query<Row>('SELECT user_id FROM request_recharge_payments WHERE id=$1',[ref])
  if(!owner)return null 
  return withTransaction(async tx=>{
    await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner.user_id],tx)
    const [p]=await query<Row>('SELECT * FROM request_recharge_payments WHERE id=$1 FOR UPDATE',[ref],tx)
    if(!p||(p.provider_id&&p.provider_id!==pid))return null
    // Não reverta estado já confirmado devido a notificações atrasadas.
    if(['refunded','charged_back'].includes(p.status))return p
    if(p.status==='approved'&&!['refunded','charged_back'].includes(status))return p
    if(['cancelled','rejected'].includes(p.status)&&status==='pending')return p
    let cycle=p.cycle_id
    if(status==='approved'&&!cycle){
      const active=await getRecharge(String(p.user_id),tx)
      const [grant]=await query<Row>(`INSERT INTO request_recharge_cycles(user_id,starts_at,expires_at)
        VALUES ($1,GREATEST(now(),COALESCE($2::timestamptz,now())),GREATEST(now(),COALESCE($2::timestamptz,now()))+($3::int * interval '1 day')) RETURNING id`,[p.user_id,active.active?active.expiresAt:null,WEEKLY_DAYS],tx)
      cycle=grant.id
    }
    if(cycle&&['refunded','charged_back'].includes(status))await query('UPDATE request_recharge_cycles SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[cycle],tx)
    const qr=typeof td?.qr_code==='string'&&td.qr_code.length<=10000?td.qr_code:null
    const img=typeof td?.qr_code_base64==='string'&&td.qr_code_base64.length<=500000&&/^[A-Za-z0-9+/=]+$/.test(td.qr_code_base64)?td.qr_code_base64:null
    if(p.status!==status)await query('INSERT INTO request_recharge_payment_events(payment_id,previous_status,new_status) VALUES ($1,$2,$3)',[ref,p.status,status],tx)
    const [updated]=await query<Row>(`UPDATE request_recharge_payments SET provider_id=$2,status=$3,cycle_id=$4,qr_code=CASE WHEN $3='pending' THEN COALESCE($5,qr_code) ELSE NULL END,
      qr_image=CASE WHEN $3='pending' THEN COALESCE($6,qr_image) ELSE NULL END,expires_at=$7,updated_at=now() WHERE id=$1 RETURNING *`,[ref,pid,status,cycle,qr,img,expiry??p.expires_at],tx)
    return updated
  })
}
async function refresh(p:Row|undefined) {
  if(!p?.provider_id||!token()||!production())return p
  return await syncPayment(await provider('orders/'+encodeURIComponent(p.provider_id)),String(p.id),String(p.provider_id))??p
}
export async function reconcileForAdmin(adminId:string,userId:string) {
  await enforce('pix:admin-verify:'+adminId,60,3600)
  const p=await latest(userId)
  if(p?.provider_id)await refresh(p)
  return adminRecharge(userId)
}
export async function checkoutState(userId:string,master:boolean,verify=false) {
  if(master)return {available:false,active:false,eligible:false,payment:null}
  let p=await latest(userId)
  if(verify&&pending(p)){await enforce('pix:verify:'+userId,180,3600);p=await refresh(p)??p}
  const recharge=await getRecharge(userId)
  return {available:(await newPaymentsEnabled())&&recharge.enabled&&!recharge.paused,active:recharge.active,eligible:await eligible(userId),expiresAt:recharge.expiresAt,payment:publicPayment(p)}
}
function validCpf(cpf:string) {
  if(!/^\d{11}$/.test(cpf)||/^(\d)\1+$/.test(cpf))return false
  const digit=(n:number)=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);const rem=(sum*10)%11;return rem===10?0:rem}
  return digit(9)===Number(cpf[9])&&digit(10)===Number(cpf[10])
}
export async function createPix(userId:string,master:boolean,body:Record<string,unknown>) {
  if(master||!pixConfigured()||env('MERCADO_PAGO_PIX_ENABLED')==='false'||!(await newPaymentsEnabled())||!(await getSettings()).enabled)throw new ApiError(409,'not_available','A contratação ainda não está disponível.')
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
    if(!r.enabled||r.active||r.paused||!r.approved||!(await getSettings(tx)).pixEnabled)throw new ApiError(409,'already_active','Já existe uma recarga ativa ou a contratação foi pausada.')
    const [existing]=await query<Row>("SELECT * FROM request_recharge_payments WHERE user_id=$1 AND status IN ('creating','pending') LIMIT 1",[userId],tx)
    if(existing)return existing
    const [created]=await query<Row>("INSERT INTO request_recharge_payments(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour') RETURNING *",[randomUUID(),userId],tx)
    return created
  })
  if(attempt.provider_id)return {payment:publicPayment(await refresh(attempt))}
  let mp:Row
  try {
    const amount=WEEKLY_PRICE.toFixed(2)
    mp=await provider('orders','POST',{type:'online',total_amount:amount,external_reference:attempt.id,processing_mode:'automatic',transactions:{payments:[{amount,payment_method:{id:'pix',type:'bank_transfer'},expiration_time:'PT1H'}]},payer:{email,identification:{type:'CPF',number:cpf}}},String(attempt.id))
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
  if(url.searchParams.get('type')&&url.searchParams.get('type')!=='order')throw new ApiError(400,'invalid_topic','Evento inválido.')
  const signature=req.headers.get('x-signature')??''
  const parts=Object.fromEntries(signature.split(',').map(part=>part.trim().split('=',2)).filter(part=>part.length===2))
  if(!/^ORD[A-Z0-9]{26}$/i.test(id)||!rid||rid.length>200||!/^\d{10,13}$/.test(parts.ts??'')||!/^[a-fA-F0-9]{64}$/.test(parts.v1??''))throw new ApiError(401,'invalid_signature','Notificação inválida.')
  const actual=Buffer.from(parts.v1,'hex')
  const valid=[id,id.toLowerCase()].some(value=>timingSafeEqual(actual,createHmac('sha256',secret).update('id:'+value+';request-id:'+rid+';ts:'+parts.ts+';').digest()))
  if(!valid)throw new ApiError(401,'invalid_signature','Notificação inválida.')
  if(!production())throw new ApiError(503,'payment_unavailable','Pagamento indisponível.')
  try { await syncPayment(await provider('orders/'+id.toUpperCase()),undefined,id) } catch(e) { if(!(e instanceof ApiError)||e.code!=='order_not_found')throw e }
  return {ok:true}
}
