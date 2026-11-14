import { createHash } from 'node:crypto'
import { now } from './clock'
import { query } from './db'
import { env, isSimulationEnvironment } from './env'

/**
 * Meta Conversions API (eventos confirmados pelo SERVIDOR).
 * Docs: https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api
 *       https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters
 *       https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events
 *
 * Modos (escolhidos automaticamente, nunca por parâmetro do cliente):
 *  - sim  : ambiente local. NADA é enviado à Meta (nem com token configurado). Grava em tracking_events.
 *  - live : produção com VITE_META_PIXEL_ID e META_CAPI_ACCESS_TOKEN definidos.
 *  - off  : produção sem configuração completa — não envia nada.
 * Observação da Meta: eventos enviados com test_event_code NÃO são descartados; contam para medição.
 */
export type MetaMode = 'sim' | 'live' | 'off'
export const EVENT_COMPLETE_REGISTRATION = 'CompleteRegistration'

const pixelId = (): string | undefined => {
  const v = env('VITE_META_PIXEL_ID')
  return v && /^\d{10,20}$/.test(v) ? v : undefined
}
const accessToken = (): string | undefined => {
  const t = env('META_CAPI_ACCESS_TOKEN')
  return t && t.length >= 20 ? t : undefined
}
const graphVersion = (): string => (/^v\d+\.\d+$/.test(env('META_GRAPH_VERSION') ?? '') ? (env('META_GRAPH_VERSION') as string) : 'v25.0')

export function metaMode(): MetaMode {
  if (isSimulationEnvironment()) return 'sim'
  return pixelId() && accessToken() ? 'live' : 'off'
}

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex')
/** Telefone: só dígitos, com código do país, sem zeros à esquerda; depois SHA-256 (regra da Meta). */
export const hashPhone = (e164: string): string => sha256(e164.replace(/\D/g, '').replace(/^0+/, ''))
export const hashExternalId = (id: string): string => sha256(id.trim().toLowerCase())

// fbp/fbc são cookies da própria Meta; validamos o formato para nunca repassar lixo do cliente.
const FBP = /^fb\.[0-9]\.[0-9]{10,14}\.[0-9]{1,20}$/
const FBC = /^fb\.[0-9]\.[0-9]{10,14}\.[A-Za-z0-9_-]{1,200}$/

export type TrackInput = {
  eventName: string
  eventId: string
  userId: string
  phone: string // E.164
  ip?: string
  userAgent?: string | null
  sourceUrl?: string
  fbp?: unknown
  fbc?: unknown
}

export function buildEvent(i: TrackInput) {
  const user_data: Record<string, unknown> = {
    ph: [hashPhone(i.phone)],
    external_id: [hashExternalId(i.userId)],
  }
  // IP e user agent NÃO levam hash (regra da Meta). Só chegam aqui com consentimento.
  if (i.ip) user_data.client_ip_address = i.ip
  if (i.userAgent) user_data.client_user_agent = i.userAgent.slice(0, 300)
  if (typeof i.fbp === 'string' && FBP.test(i.fbp)) user_data.fbp = i.fbp
  if (typeof i.fbc === 'string' && FBC.test(i.fbc)) user_data.fbc = i.fbc
  return {
    event_name: i.eventName,
    event_time: Math.floor(now().getTime() / 1000),
    event_id: i.eventId,
    action_source: 'website',
    ...(i.sourceUrl ? { event_source_url: i.sourceUrl } : {}),
    user_data,
    custom_data: { content_name: 'pre_cadastro' },
  }
}

/** O que fica no banco: nunca IP nem user agent. */
const redact = (event: ReturnType<typeof buildEvent>) => {
  const { client_ip_address: _ip, client_user_agent: _ua, ...safeUser } = event.user_data as Record<string, unknown>
  void _ip
  void _ua
  return { ...event, user_data: safeUser }
}

const scrub = (text: string, token?: string): string => {
  let out = text.slice(0, 300)
  if (token) out = out.split(token).join('[redigido]')
  return out
}

/**
 * Registra e (em produção) envia o evento. NUNCA lança erro: falha de rastreamento
 * jamais pode impedir o cadastro do usuário.
 */
export async function trackServerEvent(input: TrackInput): Promise<void> {
  const mode = metaMode()
  if (mode === 'off') {
    console.info('[meta] Conversions API desativada (defina VITE_META_PIXEL_ID e META_CAPI_ACCESS_TOKEN).')
    return
  }
  try {
    const event = buildEvent(input)
    const stored = redact(event)
    const inserted = await query<{ id: string }>(
      `INSERT INTO tracking_events (event_name, event_id, user_id, mode, status, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_name, event_id) DO NOTHING RETURNING id`,
      [input.eventName, input.eventId, input.userId, mode, mode === 'sim' ? 'simulated' : 'pending', JSON.stringify(stored)],
    )
    if (!inserted[0] || mode === 'sim') return // duplicado ou simulado: não envia

    const token = accessToken()!
    let status: 'sent' | 'failed' = 'failed'
    let http: number | null = null
    let error: string | null = null
    try {
      const testCode = env('META_TEST_EVENT_CODE')
      const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${pixelId()}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // O token vai no corpo (nunca na URL, que poderia ser registrada em logs).
        body: JSON.stringify({ data: [event], access_token: token, ...(testCode ? { test_event_code: testCode } : {}) }),
        signal: AbortSignal.timeout(4000),
      })
      http = res.status
      if (res.ok) status = 'sent'
      else error = scrub(await res.text().catch(() => ''), token)
    } catch (err) {
      error = scrub((err as Error).message, token)
    }
    await query('UPDATE tracking_events SET status = $2, http_status = $3, error = $4 WHERE id = $1', [inserted[0].id, status, http, error])
    if (status === 'failed') console.warn(`[meta] envio falhou (http=${http ?? 'sem resposta'}): ${error}`)
  } catch (err) {
    console.error('[meta] erro ao registrar evento:', scrub((err as Error).message, accessToken()))
  }
}
