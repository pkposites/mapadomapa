import { query } from './db'
import { emailConfigured, appLink, processEmailQueue } from './email'
import { accessPredicate } from '../admin/recharges'
export async function runEmailJobs(){
  if(!emailConfigured())return {sent:0}
  // Somente pedidos recentes, já publicados e acessíveis ao técnico, sem dados do cliente.
  await query(`INSERT INTO email_outbox(user_id,event_key,subject,body)
    SELECT u.id,'request-'||r.id,'Nova oportunidade · Mapa do Mapa',$1
    FROM users u CROSS JOIN service_requests r
    WHERE u.email_verified_at IS NOT NULL AND u.status='active' AND r.status='published' AND r.deleted_at IS NULL
      AND r.published_at>now()-interval '30 minutes' AND ${accessPredicate('u.id')}
      AND (EXISTS(SELECT 1 FROM service_request_invites i WHERE i.request_id=r.id AND i.user_id=u.id)
        OR (r.routing_mode='automatic' AND EXISTS(SELECT 1 FROM profile_professions p WHERE p.user_id=u.id AND p.profession_id=r.profession_id)
          AND EXISTS(SELECT 1 FROM professional_regions g WHERE g.user_id=u.id AND g.region_id=r.region_id)))
      AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles rl ON rl.id=ur.role_id WHERE ur.user_id=u.id AND rl.name='admin')
    ON CONFLICT(user_id,event_key) DO NOTHING`,['Você tem uma nova oportunidade. Confira seus pedidos no aplicativo: '+appLink+'/pedidos'])
  await query(`INSERT INTO email_outbox(user_id,event_key,subject,body)
    SELECT u.id,'renewal-'||c.id,'Sua recarga vence em breve',$1 FROM request_recharge_cycles c JOIN users u ON u.id=c.user_id
    WHERE u.email_verified_at IS NOT NULL AND u.status='active' AND c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now() AND c.expires_at<=now()+interval '1 day'
      AND COALESCE((SELECT o.mode='required' FROM request_access_overrides o WHERE o.user_id=u.id),(SELECT enabled FROM request_access_settings WHERE id=1),false)
    ON CONFLICT(user_id,event_key) DO NOTHING`,['Sua recarga semanal vence nas próximas 24 horas. Confira a validade e renove se desejar: '+appLink+'/recarga. Não há cobrança automática.'])
  return processEmailQueue()
}
