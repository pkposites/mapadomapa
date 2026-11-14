import { useCallback, useEffect, useState } from 'react'

/** Contagem regressiva em segundos (ex.: tempo até poder reenviar o SMS). */
export function useCooldown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])
  return [left, useCallback((s: number) => setLeft(s), [])]
}

export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
