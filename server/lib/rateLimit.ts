import { addSeconds, now } from './clock'
import { query, type Queryable } from './db'
import { ApiError } from './http'

type Row = { count: number; window_expires_at: Date }

/** Conta uma tentativa na janela. Atômico (um único UPSERT), seguro com requisições simultâneas. */
export async function hit(key: string, windowSeconds: number, client?: Queryable): Promise<number> {
  const t = now()
  const rows = await query<Row>(
    `INSERT INTO rate_limits (key, count, window_expires_at) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_expires_at <= $3 THEN 1 ELSE rate_limits.count + 1 END,
       window_expires_at = CASE WHEN rate_limits.window_expires_at <= $3 THEN $2 ELSE rate_limits.window_expires_at END
     RETURNING count, window_expires_at`,
    [key, addSeconds(t, windowSeconds), t],
    client,
  )
  return rows[0].count
}

/** Lê o contador sem incrementar. */
export async function peek(key: string): Promise<{ count: number; retryAfter: number }> {
  const t = now()
  const rows = await query<Row>('SELECT count, window_expires_at FROM rate_limits WHERE key = $1', [key])
  const row = rows[0]
  if (!row || row.window_expires_at <= t) return { count: 0, retryAfter: 0 }
  return { count: row.count, retryAfter: Math.ceil((row.window_expires_at.getTime() - t.getTime()) / 1000) }
}

export const reset = (key: string): Promise<unknown[]> => query('DELETE FROM rate_limits WHERE key = $1', [key])

export const tooMany = (retryAfter: number): ApiError => {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return new ApiError(
    429,
    'too_many_attempts',
    `Muitas tentativas. Aguarde ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e tente de novo.`,
    { retryAfter },
  )
}

/** Conta uma tentativa e bloqueia se passou do limite. */
export async function enforce(key: string, limit: number, windowSeconds: number): Promise<void> {
  const count = await hit(key, windowSeconds)
  if (count > limit) throw tooMany((await peek(key)).retryAfter || windowSeconds)
}
