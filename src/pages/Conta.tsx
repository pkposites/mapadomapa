import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import AuthShell, { standaloneLink } from '../components/AuthShell'
import SubmitButton from '../components/ui/SubmitButton'
import Alert from '../components/ui/Alert'
import { useAuth } from '../auth/AuthContext'
import { SITE } from '../config/site'

/** Área privada (protegida por <RequireAuth>). */
export default function Conta() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  if (!user) return null

  return (
    <AuthShell eyebrow="Minha conta" title="Seu pré-cadastro está confirmado!" subtitle={<>Você já está dentro. Os pedidos de orçamento começam em {SITE.requestsOpenLabel}.</>}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime text-graphite">
            <CheckCircle2 size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] text-muted">Celular confirmado</p>
            <p className="text-[18px] font-semibold" data-testid="account-phone">{user.phone}</p>
          </div>
        </div>

        <p className="text-[16px] leading-relaxed text-muted">
          Em breve você poderá escolher até 2 profissões e completar o seu perfil para estar pronto quando os pedidos começarem.
        </p>

        {user.isAdmin && (
          <p className="flex items-center gap-2 text-[15px]">
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            <Link to="/admin" className={standaloneLink}>Área administrativa</Link>
          </p>
        )}

        {leaveError && <Alert tone="error">{leaveError}</Alert>}
        <SubmitButton
          type="button"
          variant="ghost"
          className="border border-line"
          loading={leaving}
          onClick={async () => {
            setLeaving(true)
            setLeaveError(null)
            try {
              await logout()
              navigate('/', { replace: true })
            } catch {
              setLeaveError('Não foi possível sair agora. Confira a internet e tente de novo. Sua conta continua aberta neste aparelho.')
            } finally {
              setLeaving(false)
            }
          }}
        >
          Sair da conta
        </SubmitButton>
      </div>
    </AuthShell>
  )
}
