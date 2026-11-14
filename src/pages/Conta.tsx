import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import AuthShell, { linkClass } from '../components/AuthShell'
import SubmitButton from '../components/ui/SubmitButton'
import { useAuth } from '../auth/AuthContext'

/** Área privada (protegida por <RequireAuth>). */
export default function Conta() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <AuthShell eyebrow="Minha conta" title="Seu cadastro está confirmado!" subtitle="Você já está dentro. Em breve vamos liberar as próximas etapas.">
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
          Em breve você poderá escolher até 2 profissões e completar o seu perfil para receber pedidos de orçamento na sua região.
        </p>

        {user.isAdmin && (
          <p className="flex items-center gap-2 text-[15px]">
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            <Link to="/admin" className={linkClass}>Área administrativa</Link>
          </p>
        )}

        <SubmitButton
          type="button"
          variant="ghost"
          className="border border-line"
          onClick={async () => {
            await logout()
            navigate('/', { replace: true })
          }}
        >
          Sair da conta
        </SubmitButton>
      </div>
    </AuthShell>
  )
}
