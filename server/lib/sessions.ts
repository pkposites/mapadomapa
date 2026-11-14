import { createHash, randomBytes } from 'node:crypto'
import { addSeconds, now } from './clock'
import { query, type Queryable } from './db'
import { POLICY } from './env'
import { ApiError } from './http'

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export type SessionUser = {
  sessionId: string
  sessionCreatedAt: Date
  userId: string
  status: 'pending' | 'active' | 'disabled'
  phone: string
  roles: string[]
}

/** Cria uma sessão. O token (256 bits aleatórios) só existe no cookie; no banco fica o hash. */
export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string | null },
  client?: Queryable,
): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('base64url')
  const t = now()
  await query(
    'INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent) VALUES ($1,$2,$3,$3,$4,$5,$6)',
    [userId, hashToken(token), t, addSeconds(t, POLICY.sessionTtlSeconds), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
    client,
  )
  return { token, maxAge: POLICY.sessionTtlSeconds }
}

/** Resolve o cookie em usuário. Sessão vencida, revogada ou de conta bloqueada = null. */
export async function loadSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  const t = now()
  const rows = await query<{
    session_id: string; session_created_at: Date; user_id: string
    status: SessionUser['status']; phone: string; roles: string[] | null
  }>(
    `SELECT s.id AS session_id, s.created_at AS session_created_at, u.id AS user_id, u.status,
            (SELECT e164 FROM phones WHERE user_id = u.id AND is_primary) AS phone,
            (SELECT array_agg(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
    [hashToken(token), t],
  )
  const row = rows[0]
  if (!row || row.status === 'disabled') return null
  await query('UPDATE sessions SET last_seen_at = $2 WHERE id = $1', [row.session_id, t])
  return {
    sessionId: row.session_id,
    sessionCreatedAt: row.session_created_at,
    userId: row.user_id,
    status: row.status,
    phone: row.phone,
    roles: row.roles ?? [],
  }
}

export const revokeSession = (token: string): Promise<unknown[]> =>
  query('UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token), now()])

export const revokeAllSessions = (userId: string, client?: Queryable): Promise<unknown[]> =>
  query('UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, now()], client)

/** Acesso privado: exige sessão válida de conta ativa. */
export function requireUser(user: SessionUser | null): SessionUser {
  if (!user || user.status !== 'active') {
    throw new ApiError(401, 'unauthenticated', 'Entre na sua conta para continuar.')
  }
  return user
}

/**
 * Acesso administrativo (separado do acesso comum):
 *  1) papel "admin" concedido no banco; 2) sessão iniciada há no máximo 8 horas
 *  (admin precisa entrar de novo com frequência).
 */
export function requireAdmin(user: SessionUser | null): SessionUser {
  const u = requireUser(user)
  if (!u.roles.includes('admin')) {
    throw new ApiError(403, 'forbidden', 'Você não tem permissão para acessar esta área.')
  }
  const age = (now().getTime() - u.sessionCreatedAt.getTime()) / 1000
  if (age > POLICY.adminSessionMaxAgeSeconds) {
    throw new ApiError(401, 'admin_reauth_required', 'Por segurança, entre novamente para acessar a área administrativa.')
  }
  return u
}
