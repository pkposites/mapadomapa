import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import AuthShell, { standaloneLink } from '../components/AuthShell'
import SubmitButton from '../components/ui/SubmitButton'
import Alert from '../components/ui/Alert'
import { useAuth } from '../auth/AuthContext'
import { SITE } from '../config/site'
import Button from '../components/Button'
import { api } from '../lib/api'
import type { ProState } from '../pro/types'

/** Área privada (protegida por <RequireAuth>). */
export default function Conta() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pro, setPro] = useState<ProState | null>(null)
  useEffect(() => { api.get<ProState>('/pro/profile').then(setPro).catch(() => setPro(null)) }, [])
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  if (!user) return null

  return (
    <AuthShell eyebrow="Minha conta" title="Sua conta está criada!" subtitle={<>Você já está dentro. Os pedidos de orçamento começam em {SITE.requestsOpenLabel}.</>}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime text-graphite">
            <CheckCircle2 size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] text-muted">{user.phoneVerified ? 'Celular verificado' : 'Celular ainda não verificado'}</p>
            <p className="text-[18px] font-semibold" data-testid="account-phone">{user.phone}</p>
          </div>
        </div>

        {!user.phoneVerified && (
          <p className="rounded-2xl bg-ice p-4 text-[15px] leading-snug text-muted">Seu celular será verificado pela nossa equipe. Enquanto isso você já pode preencher o cadastro profissional.</p>
        )}
        <p className="text-[16px] leading-relaxed text-muted">
          Em breve você poderá escolher até 2 profissões e completar o seu perfil para estar pronto quando os pedidos começarem.
        </p>

        {pro && (
          <div className="rounded-2xl bg-ice p-4">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Cadastro profissional</p>
            {pro.profile.reviewStatus === 'not_submitted' || pro.profile.reviewStatus === 'needs_changes' ? (
              <>
                <p className="mt-1 text-[16px] leading-snug">{pro.progress.professions ? `Você parou no passo ${pro.nextStep} de 5.` : 'Escolha suas profissões, regiões e responda às perguntas técnicas.'}</p>
                <div className="mt-3"><Button to="/profissional" fullWidth arrow>{pro.progress.professions ? 'Continuar cadastro' : 'Começar cadastro profissional'}</Button></div>
              </>
            ) : (
              <p className="mt-1 text-[16px] leading-snug"><strong>Em análise.</strong> {pro.approvalNote}</p>
            )}
          </div>
        )}

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
