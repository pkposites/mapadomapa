import { addSeconds, now } from '../lib/clock'
import { isUniqueViolation, query, withTransaction } from '../lib/db'
import { POLICY } from '../lib/env'
import { ApiError } from '../lib/http'
import { audit } from '../lib/audit'
import { consumeCode, issueCode } from '../lib/codes'
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from '../lib/password'
import { formatNational, maskPhone, parseBrazilMobile } from '../lib/phone'
import { enforce, hit, peek, reset, tooMany } from '../lib/rateLimit'
import { createSession, revokeAllSessions, type SessionUser } from '../lib/sessions'
import { getSmsProvider } from '../sms'

export type Ctx = { ip?: string; userAgent?: string | null }
type Body = Record<string, unknown>

const phoneOrThrow = (v: unknown): string => {
  const p = parseBrazilMobile(v)
  if (!p.ok) throw new ApiError(400, 'invalid_phone', p.message)
  return p.e164
}
const passwordOrThrow = (v: unknown): string => {
  const problem = passwordProblem(v)
  if (problem) throw new ApiError(400, 'weak_password', problem)
  return v as string
}
const phoneTaken = () =>
  new ApiError(409, 'phone_taken', 'Esse celular já tem cadastro. Entre com a sua senha ou recupere o acesso.')

type PhoneUser = { user_id: string; status: 'pending' | 'active' | 'disabled'; password_hash: string; verified_at: Date | null }
const findByPhone = async (e164: string): Promise<PhoneUser | undefined> =>
  (
    await query<PhoneUser>(
      `SELECT p.user_id, u.status, u.password_hash, p.verified_at
       FROM phones p JOIN users u ON u.id = p.user_id WHERE p.e164 = $1`,
      [e164],
    )
  )[0]

/** 1) Cria a conta (pendente) e envia o código por SMS. */
export async function register(body: Body, ctx: Ctx) {
  const phone = phoneOrThrow(body.phone)
  const password = passwordOrThrow(body.password)
  if (body.acceptTerms !== true) {
    throw new ApiError(400, 'terms_required', 'Para continuar, marque que você leu e aceita os Termos de Uso e a Política de Privacidade.')
  }
  await enforce(`register:ip:${ctx.ip ?? 'unknown'}`, POLICY.registerPerIp.limit, POLICY.registerPerIp.windowSeconds)

  const existing = await findByPhone(phone)
  if (existing?.verified_at) throw phoneTaken()

  const passwordHash = await hashPassword(password)
  const t = now()
  try {
    await withTransaction(async (c) => {
      if (existing) {
        // Cadastro abandonado (celular nunca confirmado): permite retomar com a senha nova.
        await c.query('UPDATE users SET password_hash = $2, terms_accepted_at = $3, updated_at = $3 WHERE id = $1', [existing.user_id, passwordHash, t])
        return
      }
      const u = await c.query<{ id: string }>(
        'INSERT INTO users (password_hash, terms_accepted_at) VALUES ($1, $2) RETURNING id',
        [passwordHash, t],
      )
      const id = u.rows[0].id
      await c.query('INSERT INTO phones (user_id, e164) VALUES ($1, $2)', [id, phone])
      await c.query('INSERT INTO profiles (user_id) VALUES ($1)', [id])
      await c.query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'user'", [id])
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw phoneTaken() // outra requisição criou o mesmo número ao mesmo tempo
    throw err
  }

  await issueCode('signup', phone, ctx.ip)
  await audit('signup.started', { ip: ctx.ip, details: { phone: maskPhone(phone) } })
  return { phone: formatNational(phone), resendIn: POLICY.codeResendCooldownSeconds, expiresIn: POLICY.codeTtlSeconds }
}

/** 2) Confirma o celular com o código e já deixa o usuário logado. */
export async function verifyPhone(body: Body, ctx: Ctx) {
  const phone = phoneOrThrow(body.phone)
  await enforce(`verify:phone:${phone}`, POLICY.verifyPerPhone.limit, POLICY.verifyPerPhone.windowSeconds)
  await consumeCode('signup', phone, body.code)

  const t = now()
  const session = await withTransaction(async (c) => {
    const p = await c.query<{ user_id: string }>('UPDATE phones SET verified_at = $2 WHERE e164 = $1 RETURNING user_id', [phone, t])
    const userId = p.rows[0]?.user_id
    if (!userId) throw new ApiError(400, 'code_expired', 'Esse código venceu. Peça um novo código e tente de novo.')
    await c.query("UPDATE users SET status = 'active', updated_at = $2, last_login_at = $2 WHERE id = $1 AND status = 'pending'", [userId, t])
    const s = await createSession(userId, ctx, c)
    return { ...s, userId }
  })
  await audit('signup.completed', { userId: session.userId, ip: ctx.ip })
  return { session, body: { ok: true } }
}

/** Reenvia o código de confirmação do cadastro (somente para números ainda não confirmados). */
export async function resendSignupCode(body: Body, ctx: Ctx) {
  const phone = phoneOrThrow(body.phone)
  await enforce(`resend:ip:${ctx.ip ?? 'unknown'}`, POLICY.recoveryPerIp.limit, POLICY.recoveryPerIp.windowSeconds)
  const found = await findByPhone(phone)
  if (found && !found.verified_at) await issueCode('signup', phone, ctx.ip)
  // Resposta igual para qualquer número: não revela quem tem cadastro.
  return { ok: true, resendIn: POLICY.codeResendCooldownSeconds, expiresIn: POLICY.codeTtlSeconds }
}

/** Login por celular e senha. Mensagem de erro única para não revelar se o número existe. */
export async function login(body: Body, ctx: Ctx) {
  const phone = phoneOrThrow(body.phone)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!password) throw new ApiError(400, 'password_required', 'Digite a sua senha.')

  await enforce(`login:ip:${ctx.ip ?? 'unknown'}`, POLICY.loginAttemptsPerIp.limit, POLICY.loginAttemptsPerIp.windowSeconds)
  const failKey = `login:fail:${phone}`
  const locked = await peek(failKey)
  if (locked.count >= POLICY.loginFailuresPerPhone.limit) throw tooMany(locked.retryAfter)

  const found = await findByPhone(phone)
  const bad = async () => {
    await hit(failKey, POLICY.loginFailuresPerPhone.windowSeconds)
    await audit('login.failed', { userId: found?.user_id, ip: ctx.ip, details: { phone: maskPhone(phone) } })
    return new ApiError(401, 'invalid_credentials', 'Celular ou senha incorretos. Confira e tente de novo.')
  }
  if (!found) {
    await dummyVerify(password)
    throw await bad()
  }
  if (!(await verifyPassword(password, found.password_hash))) throw await bad()

  if (found.status === 'disabled') {
    throw new ApiError(403, 'account_disabled', 'Esta conta está bloqueada. Fale com o suporte do Mapa do Mapa.')
  }
  if (!found.verified_at) {
    // Senha certa, mas o celular nunca foi confirmado: manda um código novo para concluir o cadastro.
    await issueCode('signup', phone, ctx.ip, { silentOnLimit: true })
    throw new ApiError(403, 'phone_not_verified', 'Falta confirmar o seu celular. Enviamos um código por SMS.', {
      phone: formatNational(phone),
      resendIn: POLICY.codeResendCooldownSeconds,
    })
  }

  await reset(failKey)
  const t = now()
  await query('UPDATE users SET last_login_at = $2 WHERE id = $1', [found.user_id, t])
  const session = await createSession(found.user_id, ctx)
  await audit('login.success', { userId: found.user_id, ip: ctx.ip })
  return { session, body: { ok: true } }
}

/** Recuperação, passo 1: envia o código. Resposta sempre igual, exista ou não o número. */
export async function forgotPassword(body: Body, ctx: Ctx) {
  const phone = phoneOrThrow(body.phone)
  await enforce(`recovery:ip:${ctx.ip ?? 'unknown'}`, POLICY.recoveryPerIp.limit, POLICY.recoveryPerIp.windowSeconds)
  getSmsProvider() // falha igual para todos se o envio de SMS estiver indisponível

  const found = await findByPhone(phone)
  if (found?.verified_at && found.status === 'active') {
    await issueCode('password_reset', phone, ctx.ip, { silentOnLimit: true })
    await audit('password_reset.requested', { userId: found.user_id, ip: ctx.ip })
  }
  return { ok: true, resendIn: POLICY.codeResendCooldownSeconds, expiresIn: POLICY.codeTtlSeconds }
}

/** Recuperação, passo 2: confere o código, troca a senha e encerra todas as sessões antigas. */
export async function resetPassword(body: Body, ctx: Ctx) {
  const phone = phoneOrThrow(body.phone)
  const password = passwordOrThrow(body.password) // valida antes, para não gastar o código à toa
  await enforce(`verify:phone:${phone}`, POLICY.verifyPerPhone.limit, POLICY.verifyPerPhone.windowSeconds)
  await consumeCode('password_reset', phone, body.code)

  const found = await findByPhone(phone)
  if (!found?.verified_at) throw new ApiError(400, 'code_expired', 'Esse código venceu. Peça um novo código e tente de novo.')
  const hash = await hashPassword(password)
  await withTransaction(async (c) => {
    await c.query('UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1', [found.user_id, hash, now()])
    await revokeAllSessions(found.user_id, c)
  })
  await reset(`login:fail:${phone}`)
  await audit('password_reset.completed', { userId: found.user_id, ip: ctx.ip })
  return { ok: true }
}

export const meBody = (u: SessionUser) => ({
  user: {
    id: u.userId,
    phone: formatNational(u.phone),
    phoneMasked: maskPhone(u.phone),
    roles: u.roles,
    isAdmin: u.roles.includes('admin'),
  },
})

export const sessionExpiry = (): Date => addSeconds(now(), POLICY.sessionTtlSeconds)
