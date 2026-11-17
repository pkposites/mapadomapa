import { env, isSimulationEnvironment } from './env'
import { kindForEvent, renderEmail, isEmailKind } from './email-templates'
import { accessPredicate, pixConfigured } from '../admin/recharges'
export { appLink } from './email-templates'
import { query, type Queryable } from './db'
export const emailConfigured=()=>Boolean(env('RESEND_API_KEY')&&env('RESEND_FROM')&&env('APP_ENV')!=='staging'&&!isSimulationEnvironment()&&!['deploy-preview','branch-deploy','dev'].includes(env('CONTEXT')??''))
export function normalizeEmail(value:unknown):string|null{
  if(typeof value!=='string')return null
  const s=value.trim().toLowerCase()
  return s.length<=254 && /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(s)?s:null
}
export async function sendEmail(to:string,subject:string,body:string,key:string,html?:string){
  if(!emailConfigured())return false
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env('RESEND_FROM'),to:[to],subject,text:body,...(html?{html}:{})}),signal:AbortSignal.timeout(5000),redirect:'error'})
    if(!r.ok){console.warn('[email] provedor recusou envio',r.status);return false}
    return true
  }catch{console.warn('[email] envio indisponível');return false}
}

export async function queueEmail(userId:string,key:string,_subject:string,_body:string,tx?:Queryable){
  const kind=kindForEvent(key)
  if(!kind)return
  const template=renderEmail(kind)
  await query(`INSERT INTO email_outbox(user_id,event_key,subject,body,template_kind)
    SELECT u.id,$2,$3,$4,$5 FROM users u JOIN email_template_settings s ON s.kind=$5 AND s.enabled
    WHERE u.id=$1 AND u.status='active' AND u.email_verified_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')
    ON CONFLICT(user_id,event_key) DO NOTHING`,[userId,key,template.subject,template.text,kind],tx)
}
// Revalidar acesso e estado antes de enviar: impede avisos de pedidos removidos, pagamentos antigos,
// novas recargas já renovadas e opt-ins retirados. Nenhum dado do cliente sai do servidor.
const eligible = `(
  o.template_kind='welcome'
  OR (o.template_kind='approved' AND EXISTS(SELECT 1 FROM professional_profiles p WHERE p.user_id=u.id AND p.review_status='approved'))
  OR (o.template_kind='install' AND EXISTS(SELECT 1 FROM email_preferences p JOIN professional_profiles f ON f.user_id=p.user_id WHERE p.user_id=u.id AND p.install_reminder AND p.installed_at IS NULL AND f.review_status='approved'))
  OR (o.template_kind='offer' AND $1::boolean AND EXISTS(SELECT 1 FROM email_preferences p JOIN professional_profiles f ON f.user_id=p.user_id WHERE p.user_id=u.id AND p.offers AND f.review_status='approved')
    AND EXISTS(SELECT 1 FROM request_access_settings s WHERE s.id=1 AND s.pix_enabled AND NOT s.pix_suspended AND COALESCE((SELECT v.mode='required' FROM request_access_overrides v WHERE v.user_id=u.id),s.enabled,false))
    AND NOT EXISTS(SELECT 1 FROM request_access_pauses p WHERE p.user_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM request_recharge_cycles c WHERE c.user_id=u.id AND c.revoked_at IS NULL AND c.expires_at>now()))
  OR (o.template_kind='request' AND ${accessPredicate('u.id')} AND EXISTS(SELECT 1 FROM service_requests r WHERE o.event_key='request-'||r.id AND r.deleted_at IS NULL AND r.status='published'
    AND (EXISTS(SELECT 1 FROM service_request_invites v WHERE v.request_id=r.id AND v.user_id=u.id)
      OR (r.routing_mode='automatic' AND EXISTS(SELECT 1 FROM profile_professions p WHERE p.user_id=u.id AND p.profession_id=r.profession_id)
        AND EXISTS(SELECT 1 FROM professional_regions p WHERE p.user_id=u.id AND p.region_id=r.region_id)))
    AND NOT EXISTS(SELECT 1 FROM service_request_interests i WHERE i.request_id=r.id AND i.user_id=u.id)
    AND (SELECT count(*) FROM service_request_interests i WHERE i.request_id=r.id AND i.selected_at IS NOT NULL)<2))
  OR (o.template_kind='renewal' AND EXISTS(SELECT 1 FROM request_recharge_cycles c WHERE c.user_id=u.id AND o.event_key='renewal-'||c.id
    AND c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now() AND c.expires_at<=now()+interval '1 day'
    AND EXISTS(SELECT 1 FROM request_recharge_payments p WHERE p.cycle_id=c.id AND p.status='approved')
    AND NOT EXISTS(SELECT 1 FROM request_recharge_cycles n WHERE n.user_id=u.id AND n.revoked_at IS NULL AND n.expires_at>c.expires_at)
    AND COALESCE((SELECT v.mode='required' FROM request_access_overrides v WHERE v.user_id=u.id),(SELECT enabled FROM request_access_settings WHERE id=1),false)))
  OR EXISTS(SELECT 1 FROM request_recharge_payments p WHERE p.user_id=u.id AND (
    (o.template_kind='payment_paid' AND o.event_key='payment-'||p.id AND p.status='approved')
    OR (o.template_kind='payment_pending' AND o.event_key='payment-pending-'||p.id AND p.status='pending' AND p.expires_at>now() AND NOT EXISTS(SELECT 1 FROM request_recharge_payments n WHERE n.user_id=p.user_id AND n.created_at>p.created_at))
    OR (o.template_kind='payment_expired' AND o.event_key='payment-expired-'||p.id AND p.status='pending' AND p.expires_at<=now() AND NOT EXISTS(SELECT 1 FROM request_recharge_payments n WHERE n.user_id=p.user_id AND n.created_at>p.created_at))
    OR (o.template_kind='payment_cancelled' AND o.event_key='payment-cancelled-'||p.id AND p.status IN ('cancelled','rejected'))
    OR (o.template_kind='payment_refund' AND o.event_key='payment-refund-'||p.id AND p.status IN ('refunded','charged_back'))))
)`
export async function processEmailQueue(){
  if(!emailConfigured())return {sent:0}
  const rows=await query<{id:string;email:string;template_kind:string}>(`WITH jobs AS (
    SELECT o.id FROM email_outbox o JOIN users u ON u.id=o.user_id
    JOIN email_template_settings s ON s.kind=o.template_kind AND s.enabled AND s.enabled_at<=o.created_at
    WHERE o.sent_at IS NULL AND o.attempts<5 AND o.next_attempt_at<=now() AND o.created_at>now()-interval '24 hours'
      AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.email IS NOT NULL AND ${eligible}
      AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')
    ORDER BY o.id LIMIT 10 FOR UPDATE OF o SKIP LOCKED
  ), claimed AS (UPDATE email_outbox o SET attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' FROM jobs WHERE o.id=jobs.id RETURNING o.*)
    SELECT c.id,u.email,c.template_kind FROM claimed c JOIN users u ON u.id=c.user_id`,[pixConfigured()&&env('MERCADO_PAGO_PIX_ENABLED')!=='false'])
  const results=await Promise.all(rows.map(async r=>{
    if(!isEmailKind(r.template_kind))return false
    const t=renderEmail(r.template_kind)
    if(!await sendEmail(r.email,t.subject,t.text,'mdm-outbox-'+r.id,t.html))return false
    await query('UPDATE email_outbox SET sent_at=now() WHERE id=$1',[r.id]);return true
  }))
  return {sent:results.filter(Boolean).length}
}
