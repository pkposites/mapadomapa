import { query, withTransaction } from '../lib/db'
import { ApiError } from '../lib/http'
import { audit } from '../lib/audit'
import { env, isSimulationEnvironment } from '../lib/env'
import { billingPolicy, type BillingMode } from './recharge-policy'
type Row = Record<string, any>
export const pixConfigured = () => Boolean(env('MERCADO_PAGO_ACCESS_TOKEN') && env('MERCADO_PAGO_WEBHOOK_SECRET') && env('APP_ENV') !== 'staging' && !isSimulationEnvironment())
export const accessPredicate = (col: string) => `(NOT EXISTS (SELECT 1 FROM request_access_pauses p WHERE p.user_id=${col}) AND EXISTS (SELECT 1 FROM professional_profiles ap JOIN users au ON au.id=ap.user_id WHERE ap.user_id=${col} AND ap.review_status='approved' AND au.status='active') AND (NOT COALESCE((SELECT o.mode='required' FROM request_access_overrides o WHERE o.user_id=${col}),(SELECT enabled FROM request_access_settings WHERE id=1),false) OR EXISTS (SELECT 1 FROM request_recharge_cycles c WHERE c.user_id=${col} AND c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now())))`
export async function getSettings(tx?: Parameters<typeof query>[2]) {
  const [s] = await query<Row>(`SELECT enabled,pix_enabled,pix_suspended,(SELECT count(*)::int FROM request_access_overrides WHERE mode='required') AS individual_required,(SELECT count(*)::int FROM request_access_overrides WHERE mode='free') AS individual_free FROM request_access_settings WHERE id=1`, [], tx)
  return { enabled: Boolean(s?.enabled), pixEnabled: Boolean(s?.pix_enabled), pixSuspended:Boolean(s?.pix_suspended), individualRequired:Number(s?.individual_required??0), individualFree:Number(s?.individual_free??0), pixConfigured: pixConfigured() && env('MERCADO_PAGO_PIX_ENABLED') !== 'false' }
}
export async function getRecharge(userId: string, tx?: Parameters<typeof query>[2]) {
  const [s] = await query<Row>(`SELECT s.enabled,s.pix_enabled,s.pix_suspended,COALESCE(o.mode,'inherit') AS billing_mode,EXISTS(SELECT 1 FROM request_access_pauses WHERE user_id=$1) AS paused, EXISTS(SELECT 1 FROM professional_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND p.review_status='approved' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')) AS approved FROM request_access_settings s LEFT JOIN request_access_overrides o ON o.user_id=$1 WHERE s.id=1`, [userId], tx)
  const [c] = await query<Row>(`SELECT c.*, (c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now()) AS active,
    (SELECT count(*)::int FROM service_request_interests i WHERE i.recharge_cycle_id=c.id AND i.contact_delivered_at>=c.starts_at AND i.contact_delivered_at<c.expires_at AND (c.revoked_at IS NULL OR i.contact_delivered_at<c.revoked_at)) AS delivered
    FROM request_recharge_cycles c WHERE c.user_id=$1 ORDER BY (c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now()) DESC,c.expires_at DESC,c.id DESC LIMIT 1`, [userId], tx)
  const billingMode:BillingMode=s?.billing_mode==='required'||s?.billing_mode==='free'?s.billing_mode:'inherit'
  const configured=pixConfigured()&&env('MERCADO_PAGO_PIX_ENABLED')!=='false'
  const policy=billingPolicy(Boolean(s?.enabled),Boolean(s?.pix_enabled),billingMode,Boolean(s?.pix_suspended),configured)
  const enabled=policy.required, active=Boolean(c?.active)
  return { enabled, billingMode, globalEnabled:Boolean(s?.enabled), checkoutEnabled:policy.checkoutEnabled&&Boolean(s?.approved)&&!s?.paused, pixConfigured:configured, active, paused: Boolean(s?.paused), approved:Boolean(s?.approved), canReceive: Boolean(s?.approved) && !s?.paused && (!enabled || active), cycleId:c ? String(c.id):null, startsAt:c?.starts_at??null, expiresAt:c?.expires_at??null, delivered:Number(c?.delivered??0), target:3 }
}
export async function setSettings(adminId:string, body:Record<string,unknown>) {
  if(typeof body.enabled!=='boolean'&&typeof body.pixEnabled!=='boolean'&&typeof body.pixSuspended!=='boolean') throw new ApiError(400,'invalid_setting','Informe o status da recarga ou do Pix.')
  if((body.pixEnabled===true||body.enabled===true)&&(!pixConfigured()||env('MERCADO_PAGO_PIX_ENABLED')==='false')) throw new ApiError(409,'not_configured','Credenciais do Mercado Pago ainda não disponíveis neste ambiente.')
  await query('UPDATE request_access_settings SET enabled=COALESCE($1::boolean,enabled),pix_enabled=COALESCE($2::boolean,pix_enabled),pix_suspended=COALESCE($3::boolean,pix_suspended) WHERE id=1',[typeof body.enabled==='boolean'?body.enabled:null,typeof body.pixEnabled==='boolean'?body.pixEnabled:null,typeof body.pixSuspended==='boolean'?body.pixSuspended:null])
  await audit('admin.recharge_config',{userId:adminId,details:{enabled:body.enabled,pixEnabled:body.pixEnabled,pixSuspended:body.pixSuspended}})
  return getSettings()
}
export async function adminRecharge(userId:string) {
  const r=await getRecharge(userId)
  const payments=await query<Row>('SELECT id,status,created_at,updated_at,expires_at,cycle_id,provider_id FROM request_recharge_payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[userId])
  return {...r,payments:payments.map(p=>({id:String(p.id),status:p.status,createdAt:p.created_at,updatedAt:p.updated_at,expiresAt:p.expires_at,providerId:p.provider_id,cycleId:p.cycle_id?String(p.cycle_id):null}))}
}
export async function changeRecharge(adminId:string,userId:string,body:Record<string,unknown>) {
  const action=body.action
  if(action!=='grant'&&action!=='revoke'&&action!=='pause'&&action!=='resume'&&action!=='billing') throw new ApiError(400,'invalid_action','Ação inválida.')
  await withTransaction(async tx=>{
    const [u]=await query<Row>(`SELECT u.status,p.review_status FROM users u JOIN professional_profiles p ON p.user_id=u.id WHERE u.id=$1 AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin') FOR UPDATE OF u`,[userId],tx)
    if(!u) throw new ApiError(404,'not_found','Profissional não encontrado.')
    const c=await getRecharge(userId,tx)
    if(action==='billing'){
      const mode=body.mode
      if(mode!=='inherit'&&mode!=='required'&&mode!=='free') throw new ApiError(400,'invalid_mode','Selecione uma regra de cobrança válida.')
      if(mode==='required'){
        if(u.status!=='active'||u.review_status!=='approved') throw new ApiError(409,'not_approved','Aprove o cadastro primeiro.')
        if(!pixConfigured()||env('MERCADO_PAGO_PIX_ENABLED')==='false') throw new ApiError(409,'not_configured','Mercado Pago indisponível.')
      }
      if(mode==='inherit') await query('DELETE FROM request_access_overrides WHERE user_id=$1',[userId],tx)
      else await query('INSERT INTO request_access_overrides(user_id,mode,changed_by) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET mode=EXCLUDED.mode,changed_by=EXCLUDED.changed_by,changed_at=now()',[userId,mode,adminId],tx)
    } else if(action==='pause') await query('INSERT INTO request_access_pauses(user_id,paused_by) VALUES ($1,$2) ON CONFLICT DO NOTHING',[userId,adminId],tx)
    else if(action==='resume') await query('DELETE FROM request_access_pauses WHERE user_id=$1',[userId],tx)
    else if(action==='grant'){
      if(u.status!=='active'||u.review_status!=='approved') throw new ApiError(409,'not_approved','Aprove o cadastro primeiro.')
      if(c.active) throw new ApiError(409,'already_active','Já existe uma recarga ativa.')
      await query("INSERT INTO request_recharge_cycles(user_id,starts_at,expires_at,granted_by) VALUES ($1,now(),now()+interval '7 days',$2)",[userId,adminId],tx)
    }else if(c.active) {
      const [paid]=await query<Row>("SELECT 1 FROM request_recharge_payments WHERE cycle_id=$1 AND status='approved'",[c.cycleId],tx)
      if(paid)throw new ApiError(409,'paid_cycle','Recarga paga: use Pausar pedidos para bloquear sem cancelar o pagamento.')
      await query('UPDATE request_recharge_cycles SET revoked_at=now() WHERE id=$1',[c.cycleId],tx)
    }
  })
  await audit('admin.recharge_'+action,{userId:adminId,details:{professionalId:userId,mode:action==='billing'?body.mode:undefined}})
  return adminRecharge(userId)
}
