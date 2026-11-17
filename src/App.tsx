import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Entrar from './pages/Entrar'
import NotFound from './pages/NotFound'
import Inicio from './pages/area/Inicio'
import Perfil from './pages/area/Perfil'
import MuralPage from './pages/area/MuralPage'
import PostPage from './pages/area/PostPage'
import Mensagens from './pages/area/Mensagens'
import Pedidos from './pages/area/Pedidos'
import Recarga from './pages/area/Recarga'
import Admin from './pages/Admin'
import AdminDestaque from './pages/AdminDestaque'
import Destaque from './pages/area/Destaque'
import AdminMural from './pages/AdminMural'
import { AdminPedidoDetalhe, AdminPedidoForm, AdminPedidos } from './pages/AdminPedidos'
import { AdminComunicados, AdminMensagens } from './pages/AdminComunicacao'
import Profissional from './pages/Profissional'
import AdminProfissional from './pages/AdminProfissional'
import DevSmsPanel from './components/DevSmsPanel'
import ConsentBanner from './components/ConsentBanner'
import MetaRouteTracker from './components/MetaRouteTracker'
import StagingBanner from './components/StagingBanner'
import { SIM_MODE } from './lib/sim'
import { AuthProvider, useAuth } from './auth/AuthContext'
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

function ProfessionalEntry() {
  const {user}=useAuth()
  return user?.isAdmin?<Navigate to="/area/perfil" replace/>:<Profissional/>
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
        <Route path="/conta" element={<Navigate to="/area" replace />} />
        <Route path="/area" element={<RequireAuth><Inicio /></RequireAuth>} />
        <Route path="/area/destaque" element={<RequireAuth><Destaque /></RequireAuth>} />
        <Route path="/area/mural/:id" element={<RequireAuth><PostPage /></RequireAuth>} />
        <Route path="/area/mural" element={<RequireAuth><MuralPage /></RequireAuth>} />
        <Route path="/area/perfil" element={<RequireAuth><Perfil /></RequireAuth>} />
        <Route path="/area/mensagens" element={<RequireAuth><Mensagens /></RequireAuth>} />
        <Route path="/area/recarga" element={<RequireAuth><Recarga /></RequireAuth>} />
        <Route path="/area/pedidos" element={<RequireAuth><Pedidos /></RequireAuth>} />
        <Route path="/profissional" element={<RequireAuth><ProfessionalEntry /></RequireAuth>} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/destaque" element={<AdminDestaque />} />
        <Route path="/admin/pedidos" element={<AdminPedidos />} />
        <Route path="/admin/pedidos/novo" element={<AdminPedidoForm />} />
        <Route path="/admin/pedidos/:id/editar" element={<AdminPedidoForm />} />
        <Route path="/admin/pedidos/:id" element={<AdminPedidoDetalhe />} />
        <Route path="/admin/mural" element={<AdminMural />} />
        <Route path="/admin/mensagens" element={<AdminMensagens />} />
        <Route path="/admin/comunicados" element={<AdminComunicados />} />
        <Route path="/admin/profissionais/:id" element={<AdminProfissional />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ConsentBanner />
      {SIM_MODE && <DevSmsPanel />}
    </AuthProvider>
  )
}
