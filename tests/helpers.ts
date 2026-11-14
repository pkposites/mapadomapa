import { NetlifyDB } from '@netlify/database-dev'
import { getDatabase } from '@netlify/database'
import { handleApi } from '../server/handler'
import { setClock } from '../server/lib/clock'
import { readdirSync, readFileSync } from 'node:fs'
import pg from 'pg'
import { query, setDb, setSerialize } from '../server/lib/db'

export const PHONE = '(11) 91234-5678'
export const E164 = '+5511912345678'
export const PASSWORD = 'minha-senha-segura-42'

let netlifyDb: NetlifyDB
let currentDb: ReturnType<typeof getDatabase> | undefined

/** Com TEST_PG_URL, a suíte roda num PostgreSQL real (concorrência de verdade). */
export const usingRealPostgres = (): boolean => Boolean(process.env.TEST_PG_URL)

export async function startDb(directory?: string): Promise<string> {
  if (process.env.TEST_PG_URL) {
    const url = process.env.TEST_PG_URL
    const c = new pg.Client({ connectionString: url })
    await c.connect()
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    const dir = './netlify/database/migrations'
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await c.query(readFileSync(`${dir}/${f}`, 'utf8'))
    await c.end()
    setSerialize(false)
    currentDb = getDatabase({ connectionString: url })
    setDb(currentDb)
    return url
  }
  setSerialize(true)
  netlifyDb = new NetlifyDB(directory ? { directory } : undefined)
  const url = await netlifyDb.start()
  await netlifyDb.applyMigrations('./netlify/database/migrations')
  currentDb = getDatabase({ connectionString: url })
  setDb(currentDb)
  return url
}
export async function stopDb(): Promise<void> {
  setDb(undefined)
  // Fecha o pool ANTES de desligar o banco, para não gerar erros de conexão encerrada.
  await (currentDb?.pool as unknown as { end(): Promise<void> } | undefined)?.end()
  currentDb = undefined
  if (!usingRealPostgres()) await netlifyDb.stop()
}

/** Limpa os dados de teste (mantém papéis e profissões, que vêm das migrações). */
export async function cleanDb(): Promise<void> {
  setClock(null)
  await query('TRUNCATE users, verification_codes, sms_messages, rate_limits, audit_log RESTART IDENTITY CASCADE')
}

export type Res = { status: number; body: any; cookie?: string; headers: Headers }

let ipCounter = 0
export async function api(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; ip?: string; origin?: string; contentType?: string | null } = {},
): Promise<Res> {
  const headers: Record<string, string> = { host: 'localhost:5173' }
  if (opts.body !== undefined && opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json'
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.origin) headers.origin = opts.origin
  const req = new Request(`http://localhost:5173/api${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const res = await handleApi(req, { ip: opts.ip ?? `10.0.0.${++ipCounter % 250}` })
  const setCookie = res.headers.get('set-cookie')
  return {
    status: res.status,
    body: await res.json().catch(() => null),
    cookie: setCookie?.split(';')[0],
    headers: res.headers,
  }
}

/** Lê o último código enviado pelo SMS simulado. */
export async function lastCode(phone = E164): Promise<string> {
  const rows = await query<{ body: string }>(
    'SELECT body FROM sms_messages WHERE phone_e164 = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [phone],
  )
  const m = rows[0]?.body.match(/\b(\d{6})\b/)
  if (!m) throw new Error('nenhum SMS simulado encontrado')
  return m[1]
}

export const smsCount = async (phone = E164): Promise<number> =>
  Number((await query<{ n: string }>('SELECT count(*) n FROM sms_messages WHERE phone_e164 = $1', [phone]))[0].n)

/** Cria conta já confirmada e logada. */
export async function signup(phone = PHONE, password = PASSWORD, e164 = E164): Promise<string> {
  const r = await api('POST', '/auth/register', { body: { phone, password, acceptTerms: true } })
  if (r.status !== 200) throw new Error('register falhou: ' + JSON.stringify(r.body))
  const v = await api('POST', '/auth/verify-phone', { body: { phone, code: await lastCode(e164) } })
  if (v.status !== 200) throw new Error('verify falhou: ' + JSON.stringify(v.body))
  return v.cookie!
}

export const advance = (seconds: number): void => {
  const base = Date.now()
  setClock(() => new Date(base + seconds * 1000))
}

export async function makeAdmin(e164 = E164): Promise<void> {
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT p.user_id, r.id FROM phones p, roles r WHERE p.e164 = $1 AND r.name = 'admin'`,
    [e164],
  )
}
