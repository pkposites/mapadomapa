import { query, withTransaction } from '../lib/db'
import { ApiError } from '../lib/http'
import { audit } from '../lib/audit'
type Row = Record<string, any>
export const accessPredicate = (col: string) => `(NOT EXISTS (SELECT 1 FROM request_access_settings WHERE id=1 AND enabled) OR EXISTS (SELECT 1 FROM request_recharge_cycles c WHERE c.user_id=${col} AND c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now()))`
export async function getSettings() {
  const [s] = await query<Row>('SELECT enabled FROM request_access_settings WHERE id=1')
  return { enabled: Boolean(s?.enabled) }
}
export async function getRecharge(userId: string, tx?: Parameters<typeof query>[2]) {
  const [s] = await query<Row>('SELECT enabled FROM request_access_settings WHERE id=1', [], tx)
  const [c] = await query<Row>(`SELECT c.*, (c.revoked_at IS NULL AND c.starts_at<=now() AND c.expires_at>now()) AS active,
    (SELECT count(*)::int FROM service_request_interests i WHERE i.recharge_cycle_id=c.id AND i.contact_delivered_at>=c.starts_at AND i.contact_delivered_at<c.expires_at AND (c.revoked_at IS NULL OR i.contact_delivered_at<c.revoked_at)) AS delivered
    FROM request_recharge_cycles c WHERE c.user_id=$1 ORDER BY c.id DESC LIMIT 1`, [userId], tx)
  const enabled=Boolean(s?.enabled), active=Boolean(c?.active)
  return { enabled, active, canReceive: !enabled || active, cycleId:c ? String(c.id):null, startsAt:c?.starts_at??null, expiresAt:c?.expires_at??null, delivered:Number(c?.delivered??0), target:3 }
}
export async function setSettings(adminId:string, body:Record<string,unknown>) {
  if(typeof body.enabled!=='boolean') throw new ApiError(400,'invalid_setting','Informe o status da recarga.')
  await query('UPDATE request_access_settings SET enabled=$1 WHERE id=1',[body.enabled])
  await audit('admin.recharge_config',{userId:adminId,details:{enabled:body.enabled}})
  return getSettings()
}
export async function changeRecharge(adminId:string,userId:string,body:Record<string,unknown>) {
  const action=body.action
  if(action!=='grant'&&action!=='revoke') throw new ApiError(400,'invalid_action','Ação inválida.')
  await withTransaction(async tx=>{
    const [u]=await query<Row>(`SELECT u.status,p.review_status FROM users u JOIN professional_profiles p ON p.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`,[userId],tx)
    if(!u) throw new ApiError(404,'not_found','Profissional não encontrado.')
    const c=await getRecharge(userId,tx)
    if(action==='grant'){
      if(u.status!=='active'||u.review_status!=='approved') throw new ApiError(409,'not_approved','Aprove o cadastro primeiro.')
      if(c.active) throw new ApiError(409,'already_active','Já existe uma recarga ativa.')
      await query("INSERT INTO request_recharge_cycles(user_id,starts_at,expires_at,granted_by) VALUES ($1,now(),now()+interval '7 days',$2)",[userId,adminId],tx)
    }else if(c.active) await query('UPDATE request_recharge_cycles SET revoked_at=now() WHERE id=$1',[c.cycleId],tx)
  })
  await audit('admin.recharge_'+action,{userId:adminId,details:{professionalId:userId}})
  return getRecharge(userId)
}
