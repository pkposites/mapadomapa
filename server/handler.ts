import { audit } from './lib/audit'
import { addSeconds, now } from './lib/clock'
import { query } from './lib/db'
import { isDevEnvironment, isPreRegistrationOpen, isSimulationEnvironment, isStagingSimulation, runInRequestContext } from './lib/env'
import {
  ApiError, assertSameOrigin, clearSessionCookie, errorResponse, json, readCookie, readJson,
  SESSION_COOKIE, sessionCookie,
} from './lib/http'
import { parseBrazilMobile } from './lib/phone'
import { loadSession, requireAdmin, requireUser, revokeSession } from './lib/sessions'
import * as pro from './pro/service'
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
  // Aceita /api/... (URL pública) e /.netlify/functions/api/... (destino do redirecionamento).
  const path = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|$)/, '').replace(/\/$/, '') || '/'
  const method = req.method.toUpperCase()
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const ctx = {
    ip: apiCtx.ip,
    userAgent: req.headers.get('user-agent'),
    // Sinais de privacidade do navegador (Global Privacy Control / Do Not Track) = não rastrear.
    optOut: req.headers.get('sec-gpc') === '1' || req.headers.get('dnt') === '1',
    origin: host ? `${isHttps(req) ? 'https' : 'http'}://${host}` : undefined,
  }
  const token = readCookie(req, SESSION_COOKIE)

  if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req)

  // ---------- Rotas só do ambiente local (simulador de SMS e utilitários de teste) ----------
  if (path.startsWith('/dev/')) {
    if (!isSimulationEnvironment()) throw new ApiError(404, 'not_found', 'Não encontrado.')
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
    if (method === 'GET' && path === '/dev/tracking') {
      const rows = await query('SELECT event_name, event_id, mode, status, payload, created_at FROM tracking_events ORDER BY created_at DESC LIMIT 10')
      return json({ events: rows })
    }
    if (method === 'POST' && path === '/dev/reset-limits') {
      await query('DELETE FROM rate_limits')
      return json({ ok: true })
    }
    throw new ApiError(404, 'not_found', 'Não encontrado.')
  }

  // ---------- Estado público (sem dados pessoais) ----------
  if (method === 'GET' && path === '/status') return json({ preRegistrationOpen: isPreRegistrationOpen() })

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

  // ---------- Cadastro profissional (Etapa 3): exige login ----------
  if (path.startsWith('/pro/')) {
    const me = requireUser(await loadSession(token))
    if (method === 'GET' && path === '/pro/catalog') return json(await pro.getCatalog())
    if (method === 'GET' && path === '/pro/profile') return json(await pro.getState(me.userId))
    if (method === 'PUT' && path === '/pro/professions') return json(await pro.setProfessions(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/regions') return json(await pro.setRegions(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/work') return json(await pro.setWork(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/answers') return json(await pro.saveAnswers(me.userId, await readJson(req)))
    if (method === 'POST' && path === '/pro/submit') return json(await pro.submit(me.userId, ctx.ip))
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
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    return await runInRequestContext(host, async () => {
      const res = await route(req, apiCtx)
      // Homologação nunca deve ser indexada por buscadores.
      if (isStagingSimulation()) res.headers.set('x-robots-tag', 'noindex, nofollow')
      return res
    })
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err)
    console.error('[api] erro inesperado:', err)
    return json({ error: { code: 'server_error', message: 'Algo deu errado do nosso lado. Tente de novo em instantes.' } }, 500)
  }
}

