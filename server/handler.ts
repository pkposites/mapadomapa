import { audit } from './lib/audit'
import { addSeconds, now } from './lib/clock'
import { query } from './lib/db'
import { isDevEnvironment, isPreRegistrationOpen, isSimulationEnvironment, isStagingSimulation, passwordRecoveryEnabled, runInRequestContext, verificationMode } from './lib/env'
import { captchaProvider } from './lib/captcha'
import { issuePowChallenge } from './lib/pow'
import { enforce } from './lib/rateLimit'
import {
  ApiError, assertSameOrigin, clearSessionCookie, errorResponse, json, readCookie, readJson,
  SESSION_COOKIE, sessionCookie,
} from './lib/http'
import { parseBrazilMobile } from './lib/phone'
import { loadSession, requireAdmin, requireUser, revokeSession } from './lib/sessions'
import * as pro from './pro/service'
import * as area from './pro/area'
import * as feed from './pro/feed'
import * as boost from './pro/boost'
import * as areq from './admin/requests'
import * as preq from './pro/requests'
import * as adm from './admin/service'
import * as auth from './services/auth'

function photoResponse(p: { type: string; data: Buffer } | null): Response {
  if (!p) return json({ error: { code: 'not_found', message: 'Sem foto.' } }, 404)
  return new Response(new Uint8Array(p.data), { status: 200, headers: { 'content-type': p.type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
}

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
  if (method === 'GET' && path === '/status') {
    return json({ preRegistrationOpen: isPreRegistrationOpen(), verificationMode: verificationMode(), passwordRecovery: passwordRecoveryEnabled(), captcha: captchaProvider() })
  }
  if (method === 'GET' && path === '/captcha/challenge') {
    if (captchaProvider() !== 'pow') throw new ApiError(404, 'not_found', 'Não encontrado.')
    await enforce(`pow:issue:${ctx.ip ?? 'unknown'}`, 200, 3600) // anti-"fazenda" de desafios
    return json(issuePowChallenge())
  }

  // ---------- Cadastro e login ----------
  if (method === 'POST' && path === '/auth/register') {
    const r = await auth.register(await readJson(req), ctx)
    return 'session' in r ? withSession(req, r.body, r.session) : json(r)
  }
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
    if (method === 'GET' && path === '/pro/feed') return json(await feed.listFeed(me.userId, url.searchParams.get('before'), url.searchParams.get('topic')))
    if (method === 'POST' && path === '/pro/feed') return json(await feed.createPost(me.userId, await readJson(req)))
    const fc = path.match(/^\/pro\/feed\/comments\/(\d{1,15})$/)
    if (fc && method === 'DELETE') return json(await feed.deleteOwnComment(me.userId, fc[1]))
    const fp = path.match(/^\/pro\/feed\/(\d{1,15})(\/report|\/like|\/comments)?$/)
    if (fp && method === 'GET' && !fp[2]) return json(await feed.getPost(me.userId, fp[1]))
    if (fp && method === 'DELETE' && !fp[2]) return json(await feed.deleteOwnPost(me.userId, fp[1]))
    if (fp && method === 'POST' && fp[2] === '/report') return json(await feed.reportPost(me.userId, fp[1]))
    if (fp && method === 'PUT' && fp[2] === '/like') return json(await feed.setLike(me.userId, fp[1], (await readJson(req)).liked === true))
    if (fp && method === 'GET' && fp[2] === '/comments') return json(await feed.listComments(me.userId, fp[1]))
    if (fp && method === 'POST' && fp[2] === '/comments') return json(await feed.addComment(me.userId, fp[1], await readJson(req)))
    if (method === 'GET' && path === '/pro/requests') return json(await preq.listOpportunities(me.userId))
    const pi = path.match(/^\/pro\/requests\/(\d{1,15})\/interest$/)
    if (pi && method === 'POST') return json(await preq.showInterest(me.userId, pi[1]))
    if (method === 'GET' && path === '/pro/boost') return json(await boost.getBoost(me.userId))
    if (method === 'PUT' && path === '/pro/boost') return json(await boost.setBoost(me.userId, await readJson(req)))
    if (method === 'DELETE' && path === '/pro/boost') return json(await boost.removeBoost(me.userId))
    if (method === 'GET' && path === '/pro/push') return json(await area.pushStatus(me.userId))
    if (method === 'POST' && path === '/pro/push/subscribe') return json(await area.pushSubscribe(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/push/prefs') return json(await area.pushPrefs(me.userId, await readJson(req)))
    if (method === 'POST' && path === '/pro/push/unsubscribe') return json(await area.pushUnsubscribe(me.userId, await readJson(req)))
    // Área do profissional (Etapa 5)
    if (method === 'GET' && path === '/pro/home') return json(await area.home(me.userId))
    if (method === 'GET' && path === '/pro/me') return json(await area.getMe(me.userId))
    if (method === 'PUT' && path === '/pro/me') return json(await area.updateMe(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/me/work') return json(await area.updateWork(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/me/regions') return json(await area.changeRegions(me.userId, await readJson(req)))
    if (method === 'PUT' && path === '/pro/photo') return json(await area.setPhoto(me.userId, await readJson(req)))
    if (method === 'DELETE' && path === '/pro/photo') return json(await area.removePhoto(me.userId))
    if (method === 'GET' && path === '/pro/photo') return photoResponse(await area.getPhoto(me.userId))
    if (method === 'GET' && path === '/pro/messages') return json(await area.thread(me.userId, 'professional'))
    if (method === 'GET' && path === '/pro/messages/unread') return json({ unread: await area.unreadCount(me.userId) })
    if (method === 'POST' && path === '/pro/messages') { const b = await readJson(req); return json(await area.postMessage(me.userId, 'professional', me.userId, b.body, b.kind === 'change_request' ? 'change_request' : 'message')) }
    if (method === 'GET' && path === '/pro/announcements') return json(await area.listAnnouncements(me.userId))
    if (method === 'POST' && path === '/pro/announcements/read') return json(await area.markAnnouncementsRead(me.userId))
  }

  // ---------- Administração (apenas a base: guarda de permissão; painel vem depois) ----------
  if (path.startsWith('/admin/') && path !== '/admin/ping') {
    const admin = requireAdmin(await loadSession(token))
    const m = path.match(/^\/admin\/professionals\/([0-9a-f-]{36})(\/decision|\/phone|\/messages|\/photo|\/welcome|\/whatsapp-log)?$/)
    if (method === 'GET' && path === '/admin/stats') return json(await adm.stats())
    if (method === 'GET' && path === '/admin/professionals') return json(await adm.list({ status: url.searchParams.get('status'), q: url.searchParams.get('q'), page: url.searchParams.get('page'), phone: url.searchParams.get('phone') }))
    if (m && method === 'GET' && !m[2]) return json(await adm.detail(admin.userId, m[1], ctx.ip))
    if (m && method === 'GET' && m[2] === '/messages') return json(await adm.threadFor(m[1]))
    if (m && method === 'POST' && m[2] === '/messages') return json(await adm.sendMessage(admin.userId, m[1], (await readJson(req)).body))
    if (m && method === 'GET' && m[2] === '/photo') return photoResponse(await area.getPhoto(m[1]))
    if (m && method === 'POST' && m[2] === '/whatsapp-log') return json(await adm.logWhatsApp(admin.userId, m[1], ctx.ip))
    if (m && method === 'POST' && m[2] === '/welcome') return json(await adm.sendWelcome(admin.userId, m[1], (await readJson(req)).body))
    if (method === 'GET' && path === '/admin/welcome') return json(await adm.welcomeInfo())
    if (method === 'POST' && path === '/admin/welcome-all') return json(await adm.sendWelcomeAll(admin.userId, (await readJson(req)).body))
    if (method === 'GET' && path === '/admin/requests') return json(await areq.listRequests(url.searchParams.get('status')))
    if (method === 'POST' && path === '/admin/requests') return json(await areq.createRequest(admin.userId, await readJson(req)))
    const ar = path.match(/^\/admin\/requests\/(\d{1,15})(\/publish|\/close)?$/)
    if (ar && method === 'GET' && !ar[2]) return json(await areq.requestDetail(ar[1]))
    if (ar && method === 'PUT' && !ar[2]) return json(await areq.updateRequest(admin.userId, ar[1], await readJson(req)))
    if (ar && method === 'DELETE' && !ar[2]) return json(await areq.deleteDraft(admin.userId, ar[1]))
    if (ar && method === 'POST' && ar[2] === '/publish') return json(await areq.publishRequest(admin.userId, ar[1]))
    if (ar && method === 'POST' && ar[2] === '/close') return json(await areq.closeRequest(admin.userId, ar[1]))
    if (method === 'GET' && path === '/admin/boost') return json(await boost.adminBoost())
    if (method === 'GET' && path === '/admin/feed') return json(await feed.adminFeed())
    const fac = path.match(/^\/admin\/feed\/(\d{1,15})\/comments$/)
    if (fac && method === 'GET') return json(await feed.adminComments(fac[1]))
    const fah = path.match(/^\/admin\/feed\/comments\/(\d{1,15})$/)
    if (fah && method === 'PUT') return json(await feed.adminHideComment(admin.userId, fah[1], (await readJson(req)).hidden === true))
    const fa = path.match(/^\/admin\/feed\/(\d{1,15})$/)
    if (fa && method === 'PUT') { const b = await readJson(req); return json(await feed.adminSetHidden(admin.userId, fa[1], b.hidden === true, b.reason)) }
    if (method === 'GET' && path === '/admin/inbox') return json(await adm.inbox())
    if (method === 'GET' && path === '/admin/announcements') return json(await adm.adminAnnouncements())
    if (method === 'POST' && path === '/admin/announcements') return json(await adm.createAnnouncement(admin.userId, await readJson(req)))
    const an = path.match(/^\/admin\/announcements\/(\d{1,12})$/)
    if (an && method === 'PUT') return json(await adm.setAnnouncementPublished(admin.userId, an[1], (await readJson(req)).published === true))
    if (m && method === 'POST' && m[2] === '/decision') return json(await adm.decide(admin.userId, m[1], await readJson(req), ctx.ip))
    if (m && method === 'POST' && m[2] === '/phone') return json(await adm.setPhoneVerified(admin.userId, m[1], (await readJson(req)).verified === true, ctx.ip))
  }
  if (method === 'GET' && path === '/public/professionals') {
    await enforce(`public:list:${ctx.ip ?? 'unknown'}`, 120, 3600)
    return json(await adm.publicProfessionals())
  }

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
    if (err instanceof ApiError) {
      if (err.status >= 400) console.warn(`[api] ${req.method} ${new URL(req.url).pathname} -> ${err.status} ${err.code}`)
      return errorResponse(err)
    }
    console.error('[api] erro inesperado:', err)
    return json({ error: { code: 'server_error', message: 'Algo deu errado do nosso lado. Tente de novo em instantes.' } }, 500)
  }
}

