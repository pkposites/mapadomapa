import { useSyncExternalStore } from 'react'

/** Aviso curto e discreto ("Salvo", "Enviado"). Sem biblioteca: um pequeno store. */
type T = { id: number; text: string } | null
let current: T = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export function toast(text: string, ms = 2200): void {
  current = { id: Date.now(), text }
  emit()
  clearTimeout(timer)
  timer = setTimeout(() => { current = null; emit() }, ms)
}
export const useToast = (): T => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => current, () => null)
/** Vibração curtinha onde o aparelho suporta (o iPhone ignora). */
export const buzz = (): void => { try { navigator.vibrate?.(10) } catch { /* sem suporte */ } }
