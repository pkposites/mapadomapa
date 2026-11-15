import { AlertTriangle, Check, Clock, Lock, XCircle } from 'lucide-react'
import { SITE, getLaunchState } from '../config/site'
import type { Home } from './types'

type State = 'done' | 'current' | 'attention' | 'blocked' | 'locked'
type Step = { title: string; detail: string; state: State }

/** A jornada reflete os dados REAIS: nada aparece como concluído se ainda estiver pendente. */
export function journeySteps(h: Pick<Home, 'status' | 'profilePrepared' | 'submitted'>): Step[] {
  const s = h.status
  const sent: State = s === 'not_submitted' ? 'current' : s === 'needs_changes' ? 'attention' : 'done'
  const review: State = s === 'not_submitted' ? 'locked' : s === 'pending_review' ? 'current' : s === 'needs_changes' ? 'attention' : s === 'rejected' || s === 'suspended' ? 'blocked' : 'done'
  const reviewDetail = ({ not_submitted: 'Começa depois do envio do cadastro.', pending_review: 'Em análise pela equipe.', needs_changes: 'A equipe pediu ajustes.', approved: 'Cadastro aprovado.', rejected: 'Cadastro não aprovado.', suspended: 'Cadastro suspenso.' } as Record<string, string>)[s]
  const prepared: State = h.profilePrepared ? 'done' : s === 'rejected' || s === 'suspended' ? 'locked' : 'current'
  const launch = getLaunchState()
  const ready = s === 'approved' && h.profilePrepared
  const wait: State = s === 'approved' ? (ready ? 'current' : 'locked') : s === 'suspended' || s === 'rejected' ? 'blocked' : 'locked'
  const waitDetail = launch.status === 'upcoming' ? `Pedidos previstos a partir de ${SITE.requestsOpenLabel} (faltam ${launch.days} ${launch.days === 1 ? 'dia' : 'dias'}).` : `Pedidos previstos a partir de ${SITE.requestsOpenLabel}. Acompanhe os comunicados.`
  return [
    { title: 'Conta criada', detail: 'Você já tem acesso à plataforma.', state: 'done' },
    { title: 'Cadastro profissional enviado', detail: sent === 'done' ? 'Enviado para a equipe.' : sent === 'attention' ? 'Ajuste e envie de novo.' : 'Falta escolher profissões, regiões e responder às perguntas.', state: sent },
    { title: 'Análise administrativa', detail: reviewDetail, state: review },
    { title: 'Perfil preparado', detail: h.profilePrepared ? 'Nome, apresentação, serviços e foto preenchidos.' : 'Complete nome, apresentação, serviços e foto em Meu Perfil.', state: prepared },
    { title: 'Aguardar o início dos pedidos', detail: s === 'approved' && !ready ? 'Complete seu perfil enquanto isso.' : s === 'approved' ? waitDetail : `Depois da aprovação. ${waitDetail}`, state: wait },
  ]
}

const LOOK: Record<State, { ring: string; Icon: typeof Check; label: string }> = {
  done: { ring: 'bg-lime text-graphite', Icon: Check, label: 'Concluído' },
  current: { ring: 'bg-graphite text-white', Icon: Clock, label: 'Agora' },
  attention: { ring: 'bg-[#f0b429] text-graphite', Icon: AlertTriangle, label: 'Atenção' },
  blocked: { ring: 'bg-danger text-white', Icon: XCircle, label: 'Bloqueado' },
  locked: { ring: 'bg-ice text-muted ring-1 ring-line', Icon: Lock, label: 'Em seguida' },
}

export default function Journey({ h }: { h: Home }) {
  const steps = journeySteps(h)
  return (
    <section className="rounded-3xl bg-white p-5" aria-label="Sua jornada" data-testid="journey" id="jornada">
      <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Sua jornada</p>
      <ol className="mt-4">
        {steps.map((st, i) => {
          const { ring, Icon, label } = LOOK[st.state]
          return (
            <li key={st.title} className="relative flex gap-3.5 pb-5 last:pb-0" data-state={st.state}>
              {i < steps.length - 1 && <span className="absolute left-[17px] top-9 bottom-0 w-px bg-line" aria-hidden="true" />}
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${ring}`} aria-hidden="true"><Icon size={18} strokeWidth={2.25} /></span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[16px] font-semibold leading-tight">{st.title} <span className="sr-only">({label})</span></p>
                <p className={`mt-0.5 text-[14px] leading-snug ${st.state === 'locked' ? 'text-muted' : 'text-graphite/80'}`}>{st.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
