import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { addSeconds, now } from './clock'
import { query } from './db'
import { authSecret, POLICY } from './env'
import { ApiError } from './http'
import { hit, peek, tooMany } from './rateLimit'
import { getSmsProvider } from '../sms'

export type Purpose = 'signup' | 'password_reset'

const generate = (): string => String(randomInt(0, 10 ** POLICY.codeLength)).padStart(POLICY.codeLength, '0')

export const hashCode = (purpose: Purpose, phone: string, code: string): string =>
  createHmac('sha256', authSecret()).update(`${purpose}:${phone}:${code}`).digest('hex')

type CodeRow = { id: string; code_hash: string; expires_at: Date; attempts: number }

const MESSAGES: Record<Purpose, (code: string, minutes: number) => string> = {
  signup: (c, m) => `Mapa do Mapa: seu código de confirmação é ${c}. Vale por ${m} minutos. Não compartilhe com ninguém.`,
  password_reset: (c, m) => `Mapa do Mapa: seu código para criar uma nova senha é ${c}. Vale por ${m} minutos. Se não foi você, ignore.`,
}

/**
 * Gera e envia um código novo (invalidando os anteriores).
 * Regras: 1 envio por minuto por número e no máximo 5 por hora.
 * Devolve false (sem erro) quando o envio foi bloqueado em silêncio — usado na recuperação.
 */
export async function issueCode(
  purpose: Purpose,
  phone: string,
  ip: string | undefined,
  opts: { silentOnLimit?: boolean } = {},
): Promise<boolean> {
  const t = now()
  const last = await query<{ created_at: Date }>(
    'SELECT created_at FROM verification_codes WHERE phone_e164 = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1',
    [phone, purpose],
  )
  if (last[0]) {
    const wait = POLICY.codeResendCooldownSeconds - (t.getTime() - last[0].created_at.getTime()) / 1000
    if (wait > 0) {
      if (opts.silentOnLimit) return false
      throw new ApiError(429, 'resend_too_soon', `Aguarde ${Math.ceil(wait)} segundos para pedir outro código.`, {
        retryAfter: Math.ceil(wait),
      })
    }
  }
  const hourly = `codes:hour:${phone}`
  if ((await hit(hourly, 3600)) > POLICY.codesPerPhonePerHour) {
    if (opts.silentOnLimit) return false
    throw tooMany((await peek(hourly)).retryAfter)
  }

  const code = generate()
  const provider = getSmsProvider() // falha cedo (503) se não houver provedor permitido
  await query(
    'UPDATE verification_codes SET consumed_at = $3 WHERE phone_e164 = $1 AND purpose = $2 AND consumed_at IS NULL',
    [phone, purpose, t],
  )
  await query(
    'INSERT INTO verification_codes (phone_e164, purpose, code_hash, expires_at, ip) VALUES ($1, $2, $3, $4, $5)',
    [phone, purpose, hashCode(purpose, phone, code), addSeconds(t, POLICY.codeTtlSeconds), ip ?? null],
  )
  await provider.send({
    to: phone,
    purpose,
    body: MESSAGES[purpose](code, POLICY.codeTtlSeconds / 60),
  })
  return true
}

/**
 * Confere um código de forma atômica e sem transação externa:
 *  - cada tentativa é contada por um único UPDATE (vale mesmo com requisições simultâneas
 *    e nunca é desfeita por rollback);
 *  - após 5 tentativas o código é invalidado;
 *  - em caso de acerto, é consumido uma única vez.
 */
export async function consumeCode(purpose: Purpose, phone: string, code: unknown): Promise<void> {
  const expired = new ApiError(400, 'code_expired', 'Esse código venceu. Peça um novo código e tente de novo.')
  const rows = await query<CodeRow>(
    `UPDATE verification_codes SET attempts = attempts + 1
     WHERE id = (SELECT id FROM verification_codes
                 WHERE phone_e164 = $1 AND purpose = $2 AND consumed_at IS NULL
                 ORDER BY created_at DESC LIMIT 1)
     RETURNING id, code_hash, expires_at, attempts`,
    [phone, purpose],
  )
  const row = rows[0]
  if (!row) throw expired
  const t = now()
  if (row.expires_at <= t) throw expired
  if (row.attempts > POLICY.codeMaxAttempts) {
    throw new ApiError(400, 'code_locked', 'Você errou o código muitas vezes. Peça um novo código.')
  }

  const given = typeof code === 'string' ? code.replace(/\D/g, '') : ''
  const a = Buffer.from(hashCode(purpose, phone, given))
  const b = Buffer.from(row.code_hash)
  const ok = given.length === POLICY.codeLength && a.length === b.length && timingSafeEqual(a, b)
  if (!ok) {
    const left = POLICY.codeMaxAttempts - row.attempts
    throw new ApiError(
      400,
      left > 0 ? 'code_invalid' : 'code_locked',
      left > 0
        ? `Código incorreto. Confira os ${POLICY.codeLength} números do SMS. Você ainda tem ${left} ${left === 1 ? 'tentativa' : 'tentativas'}.`
        : 'Você errou o código muitas vezes. Peça um novo código.',
      { attemptsLeft: left },
    )
  }
  // Uso único: se outra requisição consumiu primeiro, esta falha.
  const used = await query('UPDATE verification_codes SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL RETURNING id', [row.id, t])
  if (!used[0]) throw expired
}
