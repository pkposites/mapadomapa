import { createHmac, randomInt, randomUUID } from 'node:crypto'
import { query, withTransaction, isUniqueViolation } from '../lib/db'
import { ApiError } from '../lib/http'
import { authSecret } from '../lib/env'
import { enforce } from '../lib/rateLimit'
import { verifyCaptcha } from '../lib/captcha'
import { revokeAllSessions } from '../lib/sessions'
import { verifyPassword, hashPassword, passwordProblem } from '../lib/password'
import { audit } from '../lib/audit'
import { normalizeEmail, emailConfigured, sendEmail, queueEmail, appLink } from '../lib/email'
export const emailOrThrow=(value:unknown)=>{
  const email=normalizeEmail(value)
  if(!email)throw new ApiError(400,'invalid_email','Informe um e-mail válido.')
  return email
}
export const emailTaken=()=>new ApiError(409,'email_taken','Este e-mail não está disponível. Informe outro.')
export async function emailState(id:string){
  const [u]=await query<{email:string|null;email_verified_at:Date|null}>('SELECT email,email_verified_at FROM users WHERE id=$1',[id])
  return {email:u?.email??null,verified:Boolean(u?.email_verified_at),configured:emailConfigured()}
}
export async function saveEmail(id:string,body:Record<string,unknown>){
  const email=emailOrThrow(body.email)
  await enforce('email:change:'+id,5,3600)
  try{
    await withTransaction(async tx=>{
      const [u]=await query<{email:string|null;password_hash:string}>('SELECT email,password_hash FROM users WHERE id=$1 FOR UPDATE',[id],tx)
      if(u.email===email)return
      if(u.email&&!(typeof body.password==='string'&&await verifyPassword(body.password,u.password_hash)))throw new ApiError(403,'password_required','Confirme a senha atual para alterar o e-mail.')
      await query('UPDATE users SET email=$2,email_verified_at=NULL WHERE id=$1',[id,email],tx)
      await query('DELETE FROM email_verifications WHERE user_id=$1',[id],tx)
      await query('DELETE FROM email_password_resets WHERE user_id=$1',[id],tx)
    })
  }catch(e){if(isUniqueViolation(e))throw emailTaken();throw e}
  await audit('email.saved',{userId:id})
  return emailState(id)
}
const codeHash=(id:string,email:string,code:string)=>createHmac('sha256',authSecret()).update(id+'|'+email+'|'+code).digest('hex')
export async function requestEmailCode(id:string){
  if(!emailConfigured())throw new ApiError(503,'email_unavailable','Confirmação por e-mail ainda indisponível. Tente novamente mais tarde.')
  await enforce('email:send:minute:'+id,1,60)
  await enforce('email:send:hour:'+id,5,3600)
  const current=await emailState(id)
  if(!current.email)throw new ApiError(400,'invalid_email','Cadastre seu e-mail primeiro.')
  if(current.verified)return {ok:true}
  const email=current.email, code=String(randomInt(100000,1000000))
  await query(`INSERT INTO email_verifications(user_id,email,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')
    ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at`,[id,email,codeHash(id,email,code)])
  if(!await sendEmail(email,'Confirme seu e-mail · Mapa do Mapa','Seu código é '+code+'. Ele vence em 10 minutos. Se você não solicitou, ignore esta mensagem.','mdm-verify-'+randomUUID()))throw new ApiError(503,'email_unavailable','Não foi possível enviar o código. Tente em um minuto.')
  return {ok:true}
}
export async function confirmEmail(id:string,body:Record<string,unknown>){
  const code=typeof body.code==='string'?body.code.trim():''
  await enforce('email:verify:'+id,10,900)
  if(!/^\d{6}$/.test(code))throw new ApiError(400,'code_invalid','Informe os seis números do código.')
  await withTransaction(async tx=>{
    const [u]=await query<{email:string|null;email_verified_at:Date|null}>('SELECT email,email_verified_at FROM users WHERE id=$1 FOR UPDATE',[id],tx)
    if(u.email_verified_at)return
    if(!u.email)throw new ApiError(400,'invalid_email','Cadastre seu e-mail primeiro.')
    const r=await query('DELETE FROM email_verifications WHERE user_id=$1 AND email=$2 AND code_hash=$3 AND expires_at>now() RETURNING user_id',[id,u.email,codeHash(id,u.email,code)],tx)
    if(!r.length)throw new ApiError(400,'code_invalid','Código incorreto ou vencido. Solicite um novo.')
    await query('UPDATE users SET email_verified_at=now() WHERE id=$1',[id],tx)
    await queueEmail(id,'welcome','Bem-vindo ao Mapa do Mapa!','Seu e-mail foi confirmado. Acompanhe seu perfil e oportunidades em '+appLink,tx)
  })
  await audit('email.verified',{userId:id})
  return emailState(id)
}

const resetHash=(id:string,email:string,code:string)=>codeHash(id,email,'reset:'+code)
const emailLimit=(email:string)=>createHmac('sha256',authSecret()).update('rate:'+email).digest('hex')
export async function requestEmailPasswordReset(body:Record<string,unknown>,ip?:string){
  if(!emailConfigured())throw new ApiError(503,'email_unavailable','Recuperação por e-mail indisponível. Fale com a equipe.')
  const email=emailOrThrow(body.email)
  await enforce('email:reset:ip:'+(ip??'unknown'),10,3600)
  await enforce('email:reset:request:'+emailLimit(email),3,3600)
  await verifyCaptcha(body.captchaToken,ip)
  const [u]=await query<{id:string}>("SELECT id FROM users WHERE email=$1 AND email_verified_at IS NOT NULL AND status='active'",[email])
  if(u){
    const code=String(randomInt(100000,1000000))
    await query(`INSERT INTO email_password_resets(user_id,email,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')
      ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at`,[u.id,email,resetHash(u.id,email,code)])
    await sendEmail(email,'Recuperação de senha · Mapa do Mapa','Seu código de recuperação é '+code+'. Válido por 10 minutos. Se você não solicitou, ignore.','mdm-reset-'+randomUUID())
  }
  return {ok:true}
}
export async function resetByEmail(body:Record<string,unknown>,ip?:string){
  if(!emailConfigured())throw new ApiError(503,'email_unavailable','Recuperação por e-mail indisponível.')
  const email=emailOrThrow(body.email),code=typeof body.code==='string'?body.code.trim():''
  const problem=passwordProblem(body.password)
  if(problem)throw new ApiError(400,'weak_password',problem)
  await enforce('email:reset:verify:ip:'+(ip??'unknown'),30,900)
  await enforce('email:reset:verify:'+emailLimit(email),5,900)
  const bad=()=>new ApiError(400,'code_invalid','Código incorreto ou vencido.')
  if(!/^\d{6}$/.test(code))throw bad()
  const hash=await hashPassword(body.password as string)
  const id=await withTransaction(async tx=>{
    const [u]=await query<{id:string}>("SELECT id FROM users WHERE email=$1 AND email_verified_at IS NOT NULL AND status='active' FOR UPDATE",[email],tx)
    if(!u)throw bad()
    if(!(await query('DELETE FROM email_password_resets WHERE user_id=$1 AND email=$2 AND code_hash=$3 AND expires_at>now() RETURNING user_id',[u.id,email,resetHash(u.id,email,code)],tx)).length)throw bad()
    await query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[u.id,hash],tx)
    await revokeAllSessions(u.id,tx)
    return u.id
  })
  await audit('password_reset.email_completed',{userId:id,ip})
  return {ok:true}
}
