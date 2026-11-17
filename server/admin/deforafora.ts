import { timingSafeEqual } from 'node:crypto'
import { query } from '../lib/db'
import { audit } from '../lib/audit'
import { env } from '../lib/env'
import { ApiError, readJson } from '../lib/http'

type Row = Record<string, any>
const clean = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const validId = (id: string) => /^[a-zA-Z0-9-]{10,100}$/.test(id)

function assertIntegration(req: Request) {
  const secret = env('DFF_MAPA_INTAKE_031439B60533')
  const auth = req.headers.get('authorization') ?? ''
  const expected = 'Bearer ' + (secret ?? '')
  const a = Buffer.from(auth), b = Buffer.from(expected)
  if (!secret || secret.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiError(401, 'invalid_integration', 'Integração não autorizada.')
  }
}

export async function integrationHealth(req: Request) {
  assertIntegration(req)
  await query('SELECT 1 FROM deforafora_intake LIMIT 1')
  return { ok: true }
}

export async function receiveDeforafora(req: Request) {
  assertIntegration(req)
  if (Number(req.headers.get('content-length') ?? 0) > 30000) throw new ApiError(413, 'too_large', 'Pedido muito grande.')
  return storeIntake(await readJson(req))
}

async function storeIntake(body: Record<string, unknown>) {
  const id = clean(body.request_id, 100)
  if (!validId(id) || body.autorizacao !== 'Sim') throw new ApiError(400, 'invalid_request', 'Pedido inválido ou sem autorização.')
  const name = clean(body.nome, 100), phone = clean(body.telefone, 40)
  const service = clean(body.servico, 150), description = clean(body.descricao, 5000), location = clean(body.local, 250)
  const urgency = clean(body.prazo, 100), preference = clean(body.preferencia_contato, 60)
  if (!name || !/^\d{10,13}$/.test(phone.replace(/\D/g,'')) || !service || !description || !location || !urgency || !preference) throw new ApiError(400, 'missing_fields', 'Pedido incompleto.')
  // A referência da foto permanece privada. Não se copia a foto ou o contato para a oportunidade pública.
  const photo = clean(body.foto, 2000) || null
  const rows = await query<Row>(`INSERT INTO deforafora_intake
    (id, client_name, client_phone, service, description, location, urgency, contact_preference, photo_reference)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [id,name,phone,service,description,location,urgency,preference,photo])
  return { ok: true, duplicate: rows.length === 0 }
}

export async function listIntake() {
  const rows = await query<Row>(`SELECT id, client_name, service, location, urgency, contact_preference, received_at
    FROM deforafora_intake WHERE converted_request_id IS NULL AND deleted_at IS NULL ORDER BY received_at DESC LIMIT 200`)
  const [{ count }] = await query<Row>('SELECT count(*)::int AS count FROM deforafora_intake WHERE converted_request_id IS NULL AND deleted_at IS NULL')
  const trash = await query<Row>(`SELECT id,client_name,service,location,urgency,contact_preference,received_at FROM deforafora_intake WHERE converted_request_id IS NULL AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200`)
  return { count, items: rows, trash }
}

export async function intakeDetail(id: string) {
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  const row = (await query<Row>('SELECT * FROM deforafora_intake WHERE id = $1 AND deleted_at IS NULL', [id]))[0]
  if (!row) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  return row
}

export async function importIntake(body: Record<string, unknown>) {
  if (!Array.isArray(body.items) || body.items.length > 200) throw new ApiError(400,'invalid_import','Selecione até 200 registros por importação.')
  let imported=0, duplicates=0, rejected=0
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { rejected++; continue }
    try {
      const result = await storeIntake(item as Record<string,unknown>)
      if (result.duplicate) duplicates++; else imported++
    } catch(e) { if (e instanceof ApiError) rejected++; else throw e }
  }
  return { imported, duplicates, rejected }
}

export async function deleteIntake(adminId: string,id: string) {
  const rows=await query<Row>('UPDATE deforafora_intake SET deleted_at=now() WHERE id=$1 AND converted_request_id IS NULL AND deleted_at IS NULL RETURNING id',[id])
  if (!rows.length) throw new ApiError(404,'not_found','Pedido não encontrado ou já encaminhado.')
  await audit('admin.deforafora_deleted',{userId:adminId,details:{id}})
  return {ok:true}
}
export async function restoreIntake(adminId: string,id: string) {
  const rows=await query<Row>('UPDATE deforafora_intake SET deleted_at=NULL WHERE id=$1 AND converted_request_id IS NULL AND deleted_at IS NOT NULL RETURNING id',[id])
  if(!rows.length) throw new ApiError(404,'not_found','Pedido não está na lixeira.')
  await audit('admin.deforafora_restored',{userId:adminId,details:{id}})
  return {ok:true}
}
