import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { STAGING } from './lib/sim'
import { registerSW } from 'virtual:pwa-register'

if (STAGING) {
  const m = document.createElement('meta')
  m.name = 'robots'
  m.content = 'noindex, nofollow'
  document.head.appendChild(m)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// PWA: registra o service worker e procura versão nova ao abrir o app e a cada 30 min (sem reinstalar).
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { void reg.update().catch(() => undefined) }
      setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    },
  })
}
