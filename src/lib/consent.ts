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

export function readConsent(): ConsentState {
  if (privacySignal()) return 'denied'
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && typeof v.marketing === 'boolean') return v.marketing ? 'granted' : 'denied'
  } catch {
    /* sem storage: trata como sem escolha */
  }
  return 'unset'
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
