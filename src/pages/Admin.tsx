import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Lock, ShieldCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import Button from '../components/Button'
import { useAuth } from '../auth/AuthContext'
import { api, ApiError } from '../lib/api'

/**
 * Base da área administrativa. A tela só aparece se o SERVIDOR confirmar a permissão
 * (/api/admin/ping). O painel completo será construído em uma etapa futura.
 */
export default function Admin() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<'checking' | 'ok' | 'forbidden' | 'reauth' | 'error'>('checking')

  useEffect(() => {
    if (!user) return
    api
      .get('/admin/ping')
      .then(() => setState('ok'))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === 'admin_reauth_required') setState('reauth')
        else if (err instanceof ApiError && (err.status === 403 || err.status === 401)) setState('forbidden')
        else setState('error')
      })
  }, [user])

  if (loading) return <Spinner fullPage />
  if (!user) return <Navigate to="/entrar" replace state={{ from: '/admin' }} />

  if (state === 'checking') return <Spinner fullPage />

  if (state === 'forbidden') {
    return (
      <AuthShell eyebrow="Acesso restrito" title="Você não tem permissão para ver esta página">
        <div className="space-y-5">
          <p className="flex items-center gap-3 text-[16px] text-muted">
            <Lock size={22} strokeWidth={1.75} aria-hidden="true" /> Esta área é apenas para administradores.
          </p>
          <Button to="/conta" variant="dark" fullWidth>Voltar para minha conta</Button>
        </div>
      </AuthShell>
    )
  }

  if (state === 'reauth') {
    return (
      <AuthShell eyebrow="Segurança" title="Entre novamente para continuar">
        <div className="space-y-5">
          <Alert tone="info">Por segurança, a área administrativa pede um novo login a cada 8 horas.</Alert>
          <SubmitButton onClick={async () => { await logout(); navigate('/entrar', { state: { from: '/admin' } }) }}>
            Entrar de novo
          </SubmitButton>
        </div>
      </AuthShell>
    )
  }

  if (state === 'error') {
    return (
      <AuthShell eyebrow="Administração" title="Não foi possível carregar">
        <Alert tone="error">Algo deu errado. Tente de novo em instantes.</Alert>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Administração" title="Área administrativa" subtitle="O painel completo está em preparação.">
      <div className="space-y-4">
        <p className="flex items-center gap-3 text-[16px]">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime text-graphite">
            <ShieldCheck size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          Permissão de administrador confirmada.
        </p>
        <Link to="/conta" className="block text-[15px] font-semibold underline underline-offset-4">Voltar para minha conta</Link>
      </div>
    </AuthShell>
  )
}
