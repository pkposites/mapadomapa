import { useEffect, useState } from 'react'
import { getLaunchState, type LaunchState } from '../config/site'

/**
 * Contagem regressiva viva: recalcula a cada minuto e ao voltar para a aba,
 * então continua correta mesmo com a página aberta por horas ou dias.
 */
export function useLaunchState(): LaunchState {
  const [state, setState] = useState<LaunchState>(() => getLaunchState())

  useEffect(() => {
    const update = () => setState(getLaunchState())
    const id = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return state
}
