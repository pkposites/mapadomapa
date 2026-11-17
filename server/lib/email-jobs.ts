import { query } from './db'
import { emailConfigured, processEmailQueue } from './email'
import { renderEmail, type EmailKind } from './email-templates'
import { accessPredicate, pixConfigured } from '../admin/recharges'
import { env } from './env'

// All candidate SELECTs return a user_id and a stable event_key. Only active templates enqueue.
async function enqueue(kind:EmailKind, candidates:string) {
  const t=renderEmail(kind)
  await query(`INSERT INTO email_outbox(user_id,event_key,subject,body,template_kind)
    SELECT x.user_id,x.event_key,$2,$3,$1 FROM (${candidates}) x
    JOIN users u ON u.id=x.user_id JOIN email_template_settings s ON s.kind=$1 AND s.enabled
    WHERE u.email_verified_at IS NOT NULL AND u.status='active'
    AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')
    ON CONFLICT(user_id,event_key) DO NOTHING`,[kind,t.subject,t.text])
}
export async function runEmailJobs(){
  if(!emailConfigured())return {sent:0}
  // Do not scan when an administrator has left a category off.
  const enabled=new Set((await query<{kind:string}>('SELECT kind FROM email_template_settings WHERE enabled')).map(r=>r.kind))
  if(enabled.has('request')) await enqueue('request',`SELECT u.id AS user_id,'request-'||r.id AS event_key FROM users u CROSS JOIN service_requests r
    WHERE u.email_verified_at IS NOT NULL AND u.status='active' AND r.status='published' AND r.deleted_at IS NULL
    AND r.published_at>now()-interval '30 minutes' AND ${accessPredicate('u.id')}
    AND (EXISTS(SELECT 1 FROM service_request_invites i WHERE i.request_id=r.id AND i.user_id=u.id)
      OR (r.routing_mode='automatic' AND EXISTS(SELECT 1 FROM profile_professions p WHERE p.user_id=u.id AND p.profession_id=r.profession_id)
      AND EXISTS(SELECT 1 FROM professional_regions g WHERE g.user_id=u.id AND g.region_id=r.region_id)))
    AND NOT EXISTS(SELECT 1 FROM service_request_interests i WHERE i.request_id=r.id AND i.user_id=u.id)
    AND (SELECT count(*) FROM service_request_interests i WHERE i.request_id=r.id AND i.selected_at IS NOT NULL)<2`)
  if(enabled.has('renewal')) await enqueue('renewal',`SELECT c.user_id,'renewal-'||c.id AS event_key FROM request_recharge_cycles c
    WHERE c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now() AND c.expires_at<=now()+interval '1 day'
    AND EXISTS(SELECT 1 FROM request_recharge_payments p WHERE p.cycle_id=c.id AND p.status='approved')
    AND NOT EXISTS(SELECT 1 FROM request_recharge_cycles n WHERE n.user_id=c.user_id AND n.revoked_at IS NULL AND n.expires_at>c.expires_at)
    AND COALESCE((SELECT o.mode='required' FROM request_access_overrides o WHERE o.user_id=c.user_id),(SELECT enabled FROM request_access_settings WHERE id=1),false)`)
  if(enabled.has('payment_pending')) await enqueue('payment_pending',`SELECT p.user_id,'payment-pending-'||p.id AS event_key FROM request_recharge_payments p
    WHERE p.status='pending' AND p.created_at<=now()-interval '15 minutes' AND p.expires_at>now()+interval '10 minutes'
    AND NOT EXISTS(SELECT 1 FROM request_recharge_payments n WHERE n.user_id=p.user_id AND n.created_at>p.created_at)`)
  if(enabled.has('payment_expired')) await enqueue('payment_expired',`SELECT p.user_id,'payment-expired-'||p.id AS event_key FROM request_recharge_payments p
    WHERE p.status='pending' AND p.expires_at<=now() AND p.expires_at>now()-interval '1 hour'
    AND NOT EXISTS(SELECT 1 FROM request_recharge_payments n WHERE n.user_id=p.user_id AND n.created_at>p.created_at)`)
  if(enabled.has('install')) await enqueue('install',`SELECT p.user_id,'install-reminder' AS event_key FROM email_preferences p JOIN professional_profiles f ON f.user_id=p.user_id
    WHERE p.install_reminder AND p.installed_at IS NULL AND f.review_status='approved' AND f.submitted_at<=now()-interval '48 hours'`)
  if(enabled.has('offer')&&pixConfigured()&&env('MERCADO_PAGO_PIX_ENABLED')!=='false') await enqueue('offer',`SELECT p.user_id,'plan-offer' AS event_key FROM email_preferences p JOIN professional_profiles f ON f.user_id=p.user_id
    JOIN request_access_settings s ON s.id=1 AND s.pix_enabled AND NOT s.pix_suspended
    WHERE p.offers AND f.review_status='approved' AND COALESCE((SELECT v.mode='required' FROM request_access_overrides v WHERE v.user_id=p.user_id),s.enabled,false)
    AND NOT EXISTS(SELECT 1 FROM request_access_pauses a WHERE a.user_id=p.user_id)
    AND NOT EXISTS(SELECT 1 FROM request_recharge_cycles c WHERE c.user_id=p.user_id AND c.revoked_at IS NULL AND c.expires_at>now())`)
  return processEmailQueue()
}
