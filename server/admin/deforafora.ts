import { timingSafeEqual } from 'node:crypto'
import { query } from '../lib/db'
import { env } from '../lib/env'
import { ApiError, readJson } from '../lib/http'

type Row = Record<string, any>
const clean = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const validId = (id: string) => /^[a-zA-Z0-9-]{10,100}$/.test(id)

export async function receiveDeforafora(req: Request) {
  const secret = env('DFF_MAPA_INTAKE_031439B60533')
  const auth = req.headers.get('authorization') ?? ''
  const expected = 'Bearer ' + (secret ?? '')
  const a = Buffer.from(auth), b = Buffer.from(expected)
  if (!secret || secret.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiError(401, 'invalid_integration', 'Integração não autorizada.')
  }
  if (Number(req.headers.get('content-length') ?? 0) > 30000) throw new ApiError(413, 'too_large', 'Pedido muito grande.')
  const body = await readJson(req)
  const id = clean(body.request_id, 100)
  if (!validId(id) || body.autorizacao !== 'Sim') throw new ApiError(400, 'invalid_request', 'Pedido inválido ou sem autorização.')
  const name = clean(body.nome, 100), phone = clean(body.telefone, 40)
  const service = clean(body.servico, 150), description = clean(body.descricao, 5000), location = clean(body.local, 250)
  const urgency = clean(body.prazo, 100), preference = clean(body.preferencia_contato, 60)
  if (!name || !phone || !service || !description || !location || !urgency || !preference) throw new ApiError(400, 'missing_fields', 'Pedido incompleto.')
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
    FROM deforafora_intake WHERE converted_request_id IS NULL ORDER BY received_at DESC LIMIT 200`)
  const [{ count }] = await query<Row>('SELECT count(*)::int AS count FROM deforafora_intake WHERE converted_request_id IS NULL')
  return { count, items: rows }
}

export async function intakeDetail(id: string) {
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  const row = (await query<Row>('SELECT * FROM deforafora_intake WHERE id = $1', [id]))[0]
  if (!row) throw new ApiError(404, 'not_found', 'Pedido não encontrado.')
  return row
}
