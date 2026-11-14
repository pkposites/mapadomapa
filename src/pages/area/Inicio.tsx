import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, ClipboardList, MessageSquare, ShieldCheck, UserRound } from 'lucide-react'
import AreaShell from '../../area/Shell'
import InstallPrompt from '../../area/InstallPrompt'
import ShareCard from '../../area/ShareCard'
import PushCard from '../../area/PushCard'
import Mural from '../../area/Mural'
import BoostCard from '../../area/BoostCard'
import Spinner from '../../components/ui/Spinner'
import Alert from '../../components/ui/Alert'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { NEXT_STEPS, STATUS_HINT, STATUS_TONE, type Announcement, type Home } from '../../area/types'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function Inicio() {
  const { user } = useAuth()
  const [h, setH] = useState<Home | null>(null)
  const [err, setErr] = useState(false)
  const [all, setAll] = useState<Announcement[] | null>(null)
  useEffect(() => { api.get<Home>('/pro/home').then(setH).catch(() => setErr(true)) }, [])

  const openAll = async () => {
    if (all) return setAll(null)
    const r = await api.post<{ items: Announcement[] }>('/pro/announcements/read')
    setAll(r.items)
    setH((x) => (x ? { ...x, unreadAnnouncements: 0, announcements: x.announcements.map((a) => ({ ...a, read: true })) } : x))
  }

  return (
    <AreaShell>
      {!h && !err && <div className="grid place-items-center py-20"><Spinner /></div>}
      {err && <Alert tone="error">Não foi possível carregar. Confira a internet e <button className="font-semibold underline" onClick={() => location.reload()}>tente de novo</button>.</Alert>}
      {h && (
        <div className="space-y-5">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]" data-testid="greeting">{h.firstName ? `Olá, ${h.firstName}!` : 'Olá!'}</h1>
            <p className="mt-1 text-[16px] text-muted">Bem-vindo à sua área no Mapa do Mapa.</p>
          </div>

          <section className="rounded-3xl bg-white p-5" aria-label="Status do cadastro">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Status do cadastro</p>
            <p className={`mt-2 inline-block rounded-full px-3.5 py-1.5 text-[15px] font-semibold ${STATUS_TONE[h.status] ?? 'bg-ice'}`} data-testid="status-badge">{h.statusLabel}</p>
            <p className="mt-3 text-[15px] leading-snug text-muted">{STATUS_HINT[h.status]}</p>
            <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Próximos passos</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] leading-snug" data-testid="next-steps">{(NEXT_STEPS[h.status] ?? []).map((t) => <li key={t}>{t}</li>)}</ol>
            {h.decision?.notes && (
              <div className="mt-3 rounded-2xl bg-ice p-4 text-[15px] leading-snug"><p className="font-semibold">Orientação da equipe</p><p className="mt-1">{h.decision.notes}</p></div>
            )}
          </section>

          <InstallPrompt />
          <PushCard />

          {user?.isAdmin && (
            <Link to="/admin" className="flex min-h-14 items-center gap-3 rounded-2xl bg-graphite px-5 font-semibold text-white"><ShieldCheck size={20} aria-hidden="true" /> Painel administrativo <ArrowRight size={18} className="ml-auto" aria-hidden="true" /></Link>
          )}

          {(['required', 'optional'] as const).map((kind) => {
            const list = h.pendencies.filter((p) => (kind === 'required') === p.required)
            if (list.length === 0) return null
            return (
              <section key={kind} className="rounded-3xl bg-white p-5" aria-label={kind === 'required' ? 'Pendências obrigatórias' : 'Sugestões'} data-testid={`pend-${kind}`}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{kind === 'required' ? 'Pendências obrigatórias' : 'Sugestões para melhorar seu perfil'}</p>
                <ul className="mt-3 divide-y divide-line">
                  {list.map((p) => (
                    <li key={p.id}>
                      <Link to={p.to} className="flex min-h-14 items-center gap-3 py-2 text-[15px] leading-snug">
                        <span className={`size-2.5 shrink-0 rounded-full ${kind === 'required' ? 'bg-danger' : 'bg-lime ring-1 ring-graphite/20'}`} aria-hidden="true" />
                        <span className="flex-1">{p.text}</span><ArrowRight size={18} className="text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          <BoostCard />

          <Mural compact />

          <div className="grid grid-cols-3 gap-3">
            {[
              { to: '/area/perfil', label: 'Meu Perfil', Icon: UserRound, n: 0 },
              { to: '/area/mensagens', label: 'Mensagens', Icon: MessageSquare, n: h.unreadMessages },
              { to: '/area/pedidos', label: 'Pedidos', Icon: ClipboardList, n: 0 },
            ].map(({ to, label, Icon, n }) => (
              <Link key={to} to={to} className="relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-semibold">
                <Icon size={24} strokeWidth={1.75} aria-hidden="true" />{label}
                {n > 0 && <span className="absolute right-2 top-2 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white">{n}</span>}
              </Link>
            ))}
          </div>

          <section className="rounded-3xl bg-white p-5" aria-label="Comunicados">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Comunicados {h.unreadAnnouncements > 0 && <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] text-graphite">{h.unreadAnnouncements} novo(s)</span>}</p>
            <ul className="mt-3 space-y-4">
              {(all ?? h.announcements).map((a) => (
                <li key={a.id}>
                  <p className="flex items-center gap-2 text-[16px] font-semibold">{!a.read && <span className="size-2 rounded-full bg-lime ring-1 ring-graphite/30" aria-label="Não lido" />}{a.title}<span className="ml-auto text-[13px] font-normal text-muted">{fmt(a.at)}</span></p>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-snug text-muted">{a.body}</p>
                </li>
              ))}
            </ul>
            <button type="button" onClick={openAll} className="mt-3 inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold underline decoration-lime decoration-2 underline-offset-4">
              {all ? 'Mostrar menos' : 'Ver todos e marcar como lidos'}<ChevronDown size={16} className={all ? 'rotate-180' : ''} aria-hidden="true" />
            </button>
          </section>

          <details className="rounded-3xl bg-white p-5" data-testid="how-it-works">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[16px] font-bold [&::-webkit-details-marker]:hidden">Como funciona a plataforma <ChevronDown size={18} aria-hidden="true" /></summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-snug text-muted">
              <li>Você faz o pré-cadastro e responde às perguntas rápidas.</li>
              <li>Nossa equipe analisa e aprova cada perfil. Nada é automático.</li>
              <li>Os pedidos de orçamento começam em 25/11/2026. Cada pedido chegará para você e você escolhe responder ou não.</li>
              <li>Fale com a equipe a qualquer momento em Mensagens.</li>
            </ol>
          </details>

          <ShareCard />
        </div>
      )}
    </AreaShell>
  )
}
