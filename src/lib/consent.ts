import { useSyncExternalStore } from 'react'

/**
 * Consentimento para mensuração de anúncios (Meta Pixel / Conversions API).
 * Regras:
 *  - sem escolha = SEM rastreamento ("unset" nunca rastreia);
 *  - sinal de privacidade do navegador (Global Privacy Control ou Do Not Track) = recusa automática;
 *  - recusar é tão fácil quanto aceitar, e a escolha pode ser mudada a qualquer momento.
 */
export type ConsentState = 'granted' | 'denied' | 'unset'

const KEY = 'mdm_consent_v1'

/** O navegador pediu para não ser rastreado? */
export function privacySignal(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  const w = window as Window & { doNotTrack?: string }
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || w.doNotTrack === '1' || nav.msDoNotTrack === '1'
}

// Se o navegador bloquear o armazenamento (aba privada, automação, política do aparelho), a escolha ainda
// vale na hora (memória) e tenta persistir por cookie. Sem isso o banner não fechava depois de "Recusar".
let memory: ConsentState | null = null
const COOKIE = 'mdm_consent'
const readCookie = (): ConsentState | null => {
  try { const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([01])`)); return m ? (m[1] === '1' ? 'granted' : 'denied') : null } catch { return null }
}

export function readConsent(): ConsentState {
  if (privacySignal()) return 'denied'
  if (memory) return memory
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && typeof v.marketing === 'boolean') return v.marketing ? 'granted' : 'denied'
  } catch {
    /* sem storage: tenta o cookie */
  }
  return readCookie() ?? 'unset'
}

// ---- pequeno "store" para o React reagir às mudanças
let panelOpen = false // banner reaberto pelo link "Preferências de privacidade"
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function setConsent(granted: boolean): void {
  memory = granted ? 'granted' : 'denied'
  try { document.cookie = `${COOKIE}=${granted ? 1 : 0}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}` } catch { /* sem cookies */ }
  try {
    localStorage.setItem(KEY, JSON.stringify({ marketing: granted, at: new Date().toISOString() }))
  } catch {
    /* sem storage: vale só nesta sessão */
  }
  panelOpen = false
  emit()
}
export function openPreferences(): void {
  panelOpen = true
  emit()
}

export function useConsent(): { state: ConsentState; panelOpen: boolean; signal: boolean } {
  const state = useSyncExternalStore(subscribe, readConsent, () => 'unset' as ConsentState)
  const open = useSyncExternalStore(subscribe, () => panelOpen, () => false)
  return { state, panelOpen: open, signal: privacySignal() }
}
