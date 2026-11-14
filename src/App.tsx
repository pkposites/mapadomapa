import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Entrar from './pages/Entrar'
import Conta from './pages/Conta'
import Admin from './pages/Admin'
import Profissional from './pages/Profissional'
import DevSmsPanel from './components/DevSmsPanel'
import ConsentBanner from './components/ConsentBanner'
import MetaRouteTracker from './components/MetaRouteTracker'
import StagingBanner from './components/StagingBanner'
import { SIM_MODE } from './lib/sim'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/guards'
import Cadastro from './pages/Cadastro'
import Privacidade from './pages/Privacidade'
import Termos from './pages/Termos'
import { SITE } from './config/site'

/** Volta ao topo ao trocar de página; respeita âncoras (#categorias). */
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <StagingBanner />
      <ScrollManager />
      <MetaRouteTracker />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path={SITE.signupPath} element={<Cadastro />} />
        <Route path={SITE.privacyPath} element={<Privacidade />} />
        <Route path={SITE.termsPath} element={<Termos />} />
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/conta" element={<RequireAuth><Conta /></RequireAuth>} />
        <Route path="/profissional" element={<RequireAuth><Profissional /></RequireAuth>} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ConsentBanner />
      {SIM_MODE && <DevSmsPanel />}
    </AuthProvider>
  )
}
