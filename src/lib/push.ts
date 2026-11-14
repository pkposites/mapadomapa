import { api } from './api'

export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = (): boolean => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

const toKey = (b64: string): Uint8Array<ArrayBuffer> => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(s.length)); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out
}
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])
/** O service worker só existe no site publicado (não no servidor de desenvolvimento). */
const registration = async () => (await withTimeout(navigator.serviceWorker.getRegistration(), 3000)) ?? null

export async function browserSubscription(): Promise<PushSubscription | null> {
  const r = await registration(); return r ? r.pushManager.getSubscription() : null
}
export type EnableResult = 'ok' | 'denied' | 'unsupported'
export async function enablePush(publicKey: string): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  const r = await registration(); if (!r) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const sub = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
  await api.post('/pro/push/subscribe', { subscription: sub.toJSON() })
  return 'ok'
}
/** Desativa neste aparelho (navegador + servidor). Também é chamado ao sair da conta. */
export async function disablePush(): Promise<void> {
  try {
    const sub = pushSupported() ? await browserSubscription() : null
    if (sub) { await api.post('/pro/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined); await sub.unsubscribe().catch(() => undefined) }
  } catch { /* melhor esforço */ }
}
