import { audit } from './lib/audit'
import { addSeconds, now } from './lib/clock'
import { query } from './lib/db'
import { isDevEnvironment } from './lib/env'
import {
  ApiError, assertSameOrigin, clearSessionCookie, errorResponse, json, readCookie, readJson,
  SESSION_COOKIE, sessionCookie,
} from './lib/http'
import { parseBrazilMobile } from './lib/phone'
import { loadSession, requireAdmin, revokeSession } from './lib/sessions'
import * as auth from './services/auth'

export type ApiContext = { ip?: string }

const isHttps = (req: Request): boolean =>
  new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'

/** Cookie Secure sempre que houver HTTPS (produção). Em http local (ex.: celular na rede) fica sem. */
const secureCookie = (req: Request): boolean => isHttps(req) || !isDevEnvironment()

function withSession(req: Request, data: unknown, s: { token: string; maxAge: number }): Response {
  return json(data, 200, { 'set-cookie': sessionCookie(s.token, s.maxAge, secureCookie(req)) })
}

async function route(req: Request, apiCtx: ApiContext): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/'
  const method = req.method.toUpperCase()
  const ctx = { ip: apiCtx.ip, userAgent: req.headers.get('user-agent') }
  const token = readCookie(req, SESSION_COOKIE)

  if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req)

  // ---------- Rotas só do ambiente local (simulador de SMS e utilitários de teste) ----------
  if (path.startsWith('/dev/')) {
    if (!isDevEnvironment()) throw new ApiError(404, 'not_found', 'Não encontrado.')
    if (method === 'GET' && path === '/dev/sms') {
      const rows = await query(
        'SELECT phone_e164 AS phone, purpose, body, created_at FROM sms_messages WHERE provider = $1 ORDER BY created_at DESC LIMIT 10',
        ['dev'],
      )
      return json({ messages: rows })
    }
    if (method === 'POST' && path === '/dev/expire-codes') {
      const body = await readJson(req)
      const p = parseBrazilMobile(body.phone)
      if (!p.ok) throw new ApiError(400, 'invalid_phone', p.message)
      await query('UPDATE verification_codes SET expires_at = $2 WHERE phone_e164 = $1 AND consumed_at IS NULL', [p.e164, addSeconds(now(), -1)])
      return json({ ok: true })
    }
    if (method === 'POST' && path === '/dev/reset-limits') {
      await query('DELETE FROM rate_limits')
      return json({ ok: true })
    }
    throw new ApiError(404, 'not_found', 'Não encontrado.')
  }

  // ---------- Cadastro e login ----------
  if (method === 'POST' && path === '/auth/register') return json(await auth.register(await readJson(req), ctx))
  if (method === 'POST' && path === '/auth/resend-code') return json(await auth.resendSignupCode(await readJson(req), ctx))
  if (method === 'POST' && path === '/auth/verify-phone') {
    const r = await auth.verifyPhone(await readJson(req), ctx)
    return withSession(req, r.body, r.session)
  }
  if (method === 'POST' && path === '/auth/login') {
    const r = await auth.login(await readJson(req), ctx)
    return withSession(req, r.body, r.session)
  }
  if (method === 'POST' && path === '/auth/logout') {
    if (token) await revokeSession(token)
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(secureCookie(req)) })
  }
  if (method === 'POST' && path === '/auth/forgot-password') return json(await auth.forgotPassword(await readJson(req), ctx))
  if (method === 'POST' && path === '/auth/reset-password') return json(await auth.resetPassword(await readJson(req), ctx))

  // ---------- Área privada ----------
  if (method === 'GET' && path === '/auth/me') {
    const user = await loadSession(token)
    if (!user || user.status !== 'active') {
      // Sem sessão: 401 e limpa cookie inválido.
      return json({ error: { code: 'unauthenticated', message: 'Entre na sua conta para continuar.' } }, 401, token ? { 'set-cookie': clearSessionCookie(secureCookie(req)) } : {})
    }
    return json(auth.meBody(user))
  }

  // ---------- Administração (apenas a base: guarda de permissão; painel vem depois) ----------
  if (method === 'GET' && path === '/admin/ping') {
    const admin = requireAdmin(await loadSession(token))
    await audit('admin.access', { userId: admin.userId, ip: ctx.ip, details: { path } })
    return json({ ok: true, role: 'admin' })
  }

  throw new ApiError(404, 'not_found', 'Não encontrado.')
}

/** Ponto de entrada da API: traduz erros previstos em respostas amigáveis. */
export async function handleApi(req: Request, apiCtx: ApiContext = {}): Promise<Response> {
  try {
    return await route(req, apiCtx)
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err)
    console.error('[api] erro inesperado:', err)
    return json({ error: { code: 'server_error', message: 'Algo deu errado do nosso lado. Tente de novo em instantes.' } }, 500)
  }
}

