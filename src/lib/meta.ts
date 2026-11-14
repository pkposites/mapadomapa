import { readConsent } from './consent'

/**
 * Meta Pixel (eventos no NAVEGADOR). Docs:
 *  https://developers.facebook.com/documentation/meta-pixel/implementation/gdpr
 *  https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events
 *
 * - O script da Meta só é baixado DEPOIS do consentimento (antes, nem a conexão é feita).
 * - Em desenvolvimento (import.meta.env.DEV) o script NUNCA é baixado: um "fbq" falso apenas
 *   registra os eventos em window.__metaEvents (visíveis no painel local). Zero conversões reais.
 * - Eventos que também são enviados pelo servidor levam o mesmo event_id (eventID) para deduplicação.
 */
export const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID
export const metaConfigured = Boolean(PIXEL_ID && /^\d{10,20}$/.test(PIXEL_ID))

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }
export type MetaLogEntry = { type: string; name?: string; params?: unknown; eventID?: string }
declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
    __metaEvents?: MetaLogEntry[]
  }
}

let started = false

function installRealPixel(): void {
  // Snippet padrão da Meta, reescrito sem alterar o comportamento.
  if (window.fbq) return
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue!.push(args)
  } as Fbq
  window.fbq = fbq
  window._fbq ??= fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
}

function installSimulatedPixel(): void {
  window.__metaEvents = window.__metaEvents ?? []
  window.fbq = ((type: string, name?: string, params?: unknown, opts?: { eventID?: string }) => {
    window.__metaEvents!.push({ type, name, params, eventID: opts?.eventID })
    window.dispatchEvent(new CustomEvent('mdm:meta'))
  }) as Fbq
}

function start(): boolean {
  if (!metaConfigured) return false
  if (!started) {
    started = true
    if (import.meta.env.DEV) installSimulatedPixel()
    else installRealPixel()
    window.fbq!('init', PIXEL_ID)
  }
  return true
}

/** Sincroniza o Pixel com a escolha atual do visitante. */
export function syncPixel(): void {
  const state = readConsent()
  if (state === 'granted') start()
  else if (started) {
    window.fbq?.('consent', 'revoke') // retira o consentimento no Pixel…
    clearMetaCookies() // …e apaga os cookies da Meta deste site (melhor esforço)
  }
}

/** Dispara um evento do navegador — apenas com consentimento. Retorna se foi disparado. */
export function trackBrowserEvent(name: string, params?: Record<string, unknown>, eventId?: string): boolean {
  if (readConsent() !== 'granted' || !start()) return false
  window.fbq!('track', name, params ?? {}, eventId ? { eventID: eventId } : undefined)
  return true
}

/** Cookies _fbp/_fbc (a Meta os cria no navegador; ajudam a Conversions API a casar o evento). */
export function readMetaCookies(): { fbp?: string; fbc?: string } {
  if (readConsent() !== 'granted') return {}
  const get = (n: string) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.slice(n.length + 1)
  return { fbp: get('_fbp'), fbc: get('_fbc') }
}

function clearMetaCookies(): void {
  for (const n of ['_fbp', '_fbc']) {
    document.cookie = `${n}=; Max-Age=0; Path=/`
    document.cookie = `${n}=; Max-Age=0; Path=/; Domain=${location.hostname}`
  }
}
