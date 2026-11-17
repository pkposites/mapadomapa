import { randomUUID } from 'node:crypto'
import { query } from '../lib/db'
import { ApiError } from '../lib/http'
import { audit } from '../lib/audit'
import { enforce } from '../lib/rateLimit'
import { emailConfigured, sendEmail } from '../lib/email'
import { templates, renderEmail, isEmailKind, type EmailKind } from '../lib/email-templates'
import type { SessionUser } from '../lib/sessions'

export async function settings(admin:SessionUser){
  const rows=await query<{kind:EmailKind;enabled:boolean;sent:number;pending:number}>(`SELECT s.kind,s.enabled,
    (SELECT count(*)::int FROM email_outbox o WHERE o.template_kind=s.kind AND o.sent_at IS NOT NULL) AS sent,
    (SELECT count(*)::int FROM email_outbox o WHERE o.template_kind=s.kind AND o.sent_at IS NULL AND o.attempts<5 AND o.created_at>now()-interval '24 hours' AND s.enabled AND s.enabled_at<=o.created_at) AS pending
    FROM email_template_settings s`)
  return { configured:emailConfigured(), testAddress:admin.emailVerified?admin.email:null, items:Object.keys(templates).filter(isEmailKind).map(kind=>{
    const row=rows.find(x=>x.kind===kind), t=templates[kind]
    return {kind,label:t.label,trigger:t.trigger,optional:t.optional,enabled:Boolean(row?.enabled),sent:Number(row?.sent??0),pending:Number(row?.pending??0),...renderEmail(kind)}
  })}
}
export async function setEnabled(admin:SessionUser,body:Record<string,unknown>){
  if(!isEmailKind(body.kind)||typeof body.enabled!=='boolean')throw new ApiError(400,'invalid_template','Modelo inválido.')
  if(body.enabled&&!emailConfigured())throw new ApiError(409,'email_unavailable','Configure o Resend e o remetente antes de ativar.')
  await query(`UPDATE email_template_settings SET enabled=$2,enabled_at=CASE WHEN $2 AND NOT enabled THEN now() WHEN NOT $2 THEN NULL ELSE enabled_at END WHERE kind=$1`,[body.kind,body.enabled])
  await audit('admin.email_template',{userId:admin.userId,details:{kind:body.kind,enabled:body.enabled}})
  return settings(admin)
}
export async function testTemplate(admin:SessionUser,body:Record<string,unknown>){
  if(!isEmailKind(body.kind))throw new ApiError(400,'invalid_template','Modelo inválido.')
  if(!admin.emailVerified||!admin.email)throw new ApiError(409,'email_unverified','Confirme seu próprio e-mail na área de perfil antes de testar.')
  await enforce('email:test:'+admin.userId,5,3600)
  const t=renderEmail(body.kind)
  if(!await sendEmail(admin.email,'[TESTE] '+t.subject,t.text,'mdm-test-'+randomUUID(),t.html))throw new ApiError(503,'email_unavailable','Não foi possível enviar. Verifique o Resend e o remetente.')
  await audit('admin.email_test',{userId:admin.userId,details:{kind:body.kind}})
  return {ok:true}
}
export async function preferences(userId:string){
  const [p]=await query<{offers:boolean;install_reminder:boolean;installed_at:Date|null}>('SELECT offers,install_reminder,installed_at FROM email_preferences WHERE user_id=$1',[userId])
  return {offers:Boolean(p?.offers),installReminder:Boolean(p?.install_reminder),installed:Boolean(p?.installed_at)}
}
export async function savePreferences(userId:string,body:Record<string,unknown>){
  if(typeof body.offers!=='boolean'||typeof body.installReminder!=='boolean')throw new ApiError(400,'invalid_preferences','Preferências inválidas.')
  await query(`INSERT INTO email_preferences(user_id,offers,install_reminder) VALUES ($1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET offers=EXCLUDED.offers,install_reminder=EXCLUDED.install_reminder,updated_at=now()`,[userId,body.offers,body.installReminder])
  return preferences(userId)
}
export async function markInstalled(userId:string){
  await query(`INSERT INTO email_preferences(user_id,installed_at) VALUES ($1,now())
    ON CONFLICT(user_id) DO UPDATE SET installed_at=COALESCE(email_preferences.installed_at,now()) WHERE email_preferences.installed_at IS NULL`,[userId])
  return {ok:true}
}
