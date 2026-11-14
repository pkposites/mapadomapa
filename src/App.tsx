import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
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
    <>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path={SITE.signupPath} element={<Cadastro />} />
        <Route path={SITE.privacyPath} element={<Privacidade />} />
        <Route path={SITE.termsPath} element={<Termos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
