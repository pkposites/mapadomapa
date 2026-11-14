import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import Button from '../components/Button'
import { useAuth } from '../auth/AuthContext'
import { api, ApiError } from '../lib/api'

/** Só mostra o conteúdo se o SERVIDOR confirmar que a pessoa é administradora (sessão ≤ 8 h). */
export default function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<'checking' | 'ok' | 'forbidden' | 'reauth' | 'error'>('checking')
  useEffect(() => {
    if (!user) return
    api.get('/admin/ping').then(() => setState('ok')).catch((err: unknown) => {
      if (err instanceof ApiError && err.code === 'admin_reauth_required') setState('reauth')
      else if (err instanceof ApiError && (err.status === 403 || err.status === 401)) setState('forbidden')
      else setState('error')
    })
  }, [user])
  if (loading) return <Spinner fullPage />
  if (!user) return <Navigate to="/entrar" replace state={{ from: '/admin' }} />
  if (state === 'checking') return <Spinner fullPage />
  if (state === 'forbidden') return (
    <AuthShell eyebrow="Acesso restrito" title="Você não tem permissão para ver esta página">
      <div className="space-y-5"><p className="flex items-center gap-3 text-[16px] text-muted"><Lock size={22} strokeWidth={1.75} aria-hidden="true" /> Esta área é apenas para administradores.</p>
        <Button to="/conta" variant="dark" fullWidth>Voltar para minha conta</Button></div>
    </AuthShell>)
  if (state === 'reauth') return (
    <AuthShell eyebrow="Segurança" title="Entre novamente para continuar">
      <div className="space-y-5"><Alert tone="info">Por segurança, a área administrativa pede um novo login a cada 8 horas.</Alert>
        <SubmitButton onClick={async () => { await logout().catch(() => undefined); navigate('/entrar', { state: { from: '/admin' } }) }}>Entrar de novo</SubmitButton></div>
    </AuthShell>)
  if (state === 'error') return <AuthShell eyebrow="Administração" title="Não foi possível carregar"><Alert tone="error">Algo deu errado. Tente de novo em instantes.</Alert></AuthShell>
  return <>{children}</>
}
