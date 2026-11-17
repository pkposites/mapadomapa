import { env, isSimulationEnvironment } from './env'
import { query, type Queryable } from './db'
export const emailConfigured=()=>Boolean(env('RESEND_API_KEY')&&env('RESEND_FROM')&&env('APP_ENV')!=='staging'&&!isSimulationEnvironment()&&!['deploy-preview','branch-deploy','dev'].includes(env('CONTEXT')??''))
export function normalizeEmail(value:unknown):string|null{
  if(typeof value!=='string')return null
  const s=value.trim().toLowerCase()
  return s.length<=254 && /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(s)?s:null
}
export async function sendEmail(to:string,subject:string,body:string,key:string){
  if(!emailConfigured())return false
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env('RESEND_FROM'),to:[to],subject,text:body}),signal:AbortSignal.timeout(5000),redirect:'error'})
    if(!r.ok){console.warn('[email] provedor recusou envio',r.status);return false}
    return true
  }catch{console.warn('[email] envio indisponível');return false}
}
export async function queueEmail(userId:string,key:string,subject:string,body:string,tx?:Queryable){
  await query(`INSERT INTO email_outbox(user_id,event_key,subject,body)
    SELECT id,$2,$3,$4 FROM users WHERE id=$1 AND status='active' AND email_verified_at IS NOT NULL
    ON CONFLICT(user_id,event_key) DO NOTHING`,[userId,key,subject,body],tx)
}
export const appLink='https://mapadomapa.netlify.app/area'
export async function processEmailQueue(){
  if(!emailConfigured())return {sent:0}
  // Reclama cada envio por cinco minutos; chave de idempotência estável evita envio duplicado.
  const rows=await query<{id:string;email:string;subject:string;body:string}>(`WITH jobs AS (
    SELECT o.id FROM email_outbox o JOIN users u ON u.id=o.user_id
    WHERE o.sent_at IS NULL AND o.attempts<5 AND o.next_attempt_at<=now() AND o.created_at>now()-interval '24 hours'
      AND u.status='active' AND u.email_verified_at IS NOT NULL ORDER BY o.id LIMIT 10 FOR UPDATE OF o SKIP LOCKED
  ), claimed AS (UPDATE email_outbox o SET attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' FROM jobs WHERE o.id=jobs.id RETURNING o.*)
    SELECT c.id,u.email,c.subject,c.body FROM claimed c JOIN users u ON u.id=c.user_id`)
  const results=await Promise.all(rows.map(async r=>{
    if(!await sendEmail(r.email,r.subject,r.body,'mdm-outbox-'+r.id))return false
    await query('UPDATE email_outbox SET sent_at=now() WHERE id=$1',[r.id]);return true
  }))
  return {sent:results.filter(Boolean).length}
}
