import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useConsent } from '../lib/consent'
import { syncPixel, trackBrowserEvent } from '../lib/meta'

/** PageView a cada tela (é um SPA, então a Meta não vê as trocas de página sozinha). Só com consentimento. */
export default function MetaRouteTracker() {
  const { pathname } = useLocation()
  const { state } = useConsent()
  useEffect(() => {
    syncPixel()
    if (state === 'granted') trackBrowserEvent('PageView')
  }, [pathname, state])
  return null
}
