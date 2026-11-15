import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronDown, Megaphone, MessageSquare, ShieldCheck, Sparkles, UserRound, Users } from 'lucide-react'
import AreaShell from '../../area/Shell'
import InstallPrompt from '../../area/InstallPrompt'
import ShareCard from '../../area/ShareCard'
import PushCard from '../../area/PushCard'
import Mural from '../../area/Mural'
import BoostCard from '../../area/BoostCard'
import Journey from '../../area/Journey'
import Spinner from '../../components/ui/Spinner'
import Alert from '../../components/ui/Alert'
import { AvailabilityCards } from '../../components/Availability'
import { TransparencyList } from '../../components/Transparency'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { SITE, getLaunchState } from '../../config/site'
import { STATUS_HINT, STATUS_TONE, type Announcement, type Home } from '../../area/types'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

/** Próxima ação recomendada, a partir da situação real do cadastro. */
function nextAction(h: Home): { label: string; to: string; why: string } {
  if (!h.name) return { label: 'Informar meu nome', to: '/area/perfil', why: 'Precisamos do seu nome para identificar o seu perfil.' }
  switch (h.status) {
    case 'not_submitted': return { label: 'Continuar meu cadastro', to: '/profissional', why: 'Falta enviar o cadastro para a análise da equipe.' }
    case 'needs_changes': return { label: 'Ver ajustes e reenviar', to: '/profissional', why: 'A equipe pediu ajustes. Leia a orientação e envie de novo.' }
    case 'pending_review': return h.profilePrepared
      ? { label: 'Ver mensagens da equipe', to: '/area/mensagens', why: 'Seu cadastro está em análise. Não há nada obrigatório agora; acompanhe por aqui.' }
      : { label: 'Completar meu perfil', to: '/area/perfil', why: 'Enquanto a equipe analisa, deixe seu perfil pronto: foto, apresentação e serviços.' }
    case 'approved': return h.profilePrepared
      ? { label: 'Ver o mural da comunidade', to: '/area/mural', why: 'Seu perfil está pronto. Acompanhe os comunicados até o início dos pedidos.' }
      : { label: 'Completar meu perfil', to: '/area/perfil', why: 'Cadastro aprovado! Deixe o perfil completo para o início dos pedidos.' }
    default: return { label: 'Falar com a equipe', to: '/area/mensagens', why: 'Converse com a equipe para entender a situação do seu cadastro.' }
  }
}

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
  const launch = getLaunchState()
  const next = h ? nextAction(h) : null
  const required = h?.pendencies.filter((p) => p.required) ?? []
  const optional = h?.pendencies.filter((p) => !p.required) ?? []

  return (
    <AreaShell>
      {!h && !err && <div className="grid place-items-center py-20"><Spinner /></div>}
      {err && <Alert tone="error">Não foi possível carregar. Confira a internet e <button className="font-semibold underline" onClick={() => location.reload()}>tente de novo</button>.</Alert>}
      {h && next && (
        <div className="space-y-5">
          {/* 1. Boas-vindas */}
          <section id="inicio" className="rounded-3xl bg-graphite p-5 text-white" aria-label="Boas-vindas" data-testid="welcome">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]" data-testid="greeting" data-clarity-mask="true">{h.firstName ? `Olá, ${h.firstName}!` : 'Olá!'}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-on-dark">O Mapa do Mapa vai conectar profissionais de São Paulo a pedidos de orçamento. Estamos em <strong className="text-white">pré-lançamento</strong>: você já pode preparar seu perfil.</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-on-dark">Seu cadastro</span>
              <span className={`inline-block rounded-full px-3.5 py-1 text-[14px] font-semibold ${STATUS_TONE[h.status] ?? 'bg-ice'}`} data-testid="status-badge">{h.statusLabel}</span>
            </div>
            <p className="mt-2 text-[14px] leading-snug text-on-dark">{STATUS_HINT[h.status]}</p>
            {h.decision?.notes && <div className="mt-3 rounded-2xl bg-white/10 p-3.5 text-[14px] leading-snug"><p className="font-semibold">Orientação da equipe</p><p className="mt-1">{h.decision.notes}</p></div>}
            {user && !user.phoneVerified && <p className="mt-3 rounded-2xl bg-white/10 p-3.5 text-[14px] leading-snug" data-testid="phone-note"><strong>Celular ainda não verificado.</strong> A equipe verifica manualmente durante a análise do cadastro. Dúvidas? Escreva em <Link to="/area/mensagens" className="font-semibold underline">Mensagens</Link>.</p>}

            <div className="mt-4 rounded-2xl bg-lime p-4 text-graphite" data-testid="next-action">
              <p className="text-[12px] font-bold uppercase tracking-[0.1em]">Próxima ação recomendada</p>
              <p className="mt-1 text-[14px] leading-snug">{next.why}</p>
              <Link to={next.to} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-graphite px-5 font-semibold text-white">{next.label} <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>

            <p className="mt-4 flex items-start gap-2.5 text-[14px] leading-snug text-on-dark" data-testid="launch-info">
              <CalendarDays size={18} className="mt-0.5 shrink-0 text-lime" aria-hidden="true" />
              <span><strong className="text-white">Pedidos reais previstos a partir de {SITE.requestsOpenLabel}</strong>{launch.status === 'upcoming' ? ` (faltam ${launch.days} ${launch.days === 1 ? 'dia' : 'dias'})` : ''}, para profissionais aprovados.</span>
            </p>
          </section>

          {/* 2. Jornada real */}
          <Journey h={h} />

          {user?.isAdmin && (
            <Link to="/admin" className="flex min-h-14 items-center gap-3 rounded-2xl bg-graphite px-5 font-semibold text-white"><ShieldCheck size={20} aria-hidden="true" /> Painel administrativo <ArrowRight size={18} className="ml-auto" aria-hidden="true" /></Link>
          )}

          <InstallPrompt />
          <PushCard />

          {/* 3. Obrigatório × recomendado */}
          <section className="rounded-3xl bg-white p-5" aria-label="Ações obrigatórias" data-testid="pend-required">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Ações obrigatórias</p>
            {required.length === 0
              ? <p className="mt-3 flex items-center gap-2 text-[15px]"><CheckCircle2 size={18} className="text-[#2b8a00]" aria-hidden="true" /> Nenhuma ação obrigatória pendente.</p>
              : <ul className="mt-3 divide-y divide-line">{required.map((p) => (
                  <li key={p.id}><Link to={p.to} className="flex min-h-14 items-center gap-3 py-2 text-[15px] leading-snug"><span className="size-2.5 shrink-0 rounded-full bg-danger" aria-hidden="true" /><span className="flex-1">{p.text}</span><ArrowRight size={18} className="text-muted" aria-hidden="true" /></Link></li>))}</ul>}
          </section>
          {optional.length > 0 && (
            <section className="rounded-3xl bg-white p-5" aria-label="Melhorias recomendadas" data-testid="pend-optional">
              <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Melhorias recomendadas</p>
              <p className="mt-1 text-[13px] text-muted">Opcionais, mas deixam seu perfil mais completo.</p>
              <ul className="mt-2 divide-y divide-line">{optional.map((p) => (
                <li key={p.id}><Link to={p.to} className="flex min-h-14 items-center gap-3 py-2 text-[15px] leading-snug"><span className="size-2.5 shrink-0 rounded-full bg-lime ring-1 ring-graphite/20" aria-hidden="true" /><span className="flex-1">{p.text}</span><ArrowRight size={18} className="text-muted" aria-hidden="true" /></Link></li>))}</ul>
            </section>
          )}

          {/* 4. Motivos para voltar */}
          <section className="rounded-3xl bg-white p-5" aria-label="Volte sempre" data-testid="reasons">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Volte sempre aqui para</p>
            <ul className="mt-2 divide-y divide-line text-[15px]">
              {[
                { to: '/area#inicio', Icon: ShieldCheck, t: 'Acompanhar a situação do cadastro', s: h.statusLabel },
                { to: '/area#comunicados', Icon: Megaphone, t: 'Ler os comunicados', s: h.unreadAnnouncements > 0 ? `${h.unreadAnnouncements} novo(s)` : 'em dia' },
                { to: '/area/mensagens', Icon: MessageSquare, t: 'Ver mensagens da equipe', s: h.unreadMessages > 0 ? `${h.unreadMessages} não lida(s)` : 'em dia' },
                { to: '/area/perfil', Icon: UserRound, t: 'Se preparar para o lançamento', s: h.profilePrepared ? 'perfil completo' : 'complete seu perfil' },
                { to: '/area#indicar', Icon: Users, t: 'Indicar a plataforma a outros profissionais', s: '' },
              ].map(({ to, Icon, t, s }) => (
                <li key={t}><Link to={to} className="flex min-h-14 items-center gap-3 py-2"><Icon size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><span className="flex-1 leading-snug">{t}</span>{s && <span className="text-[13px] text-muted">{s}</span>}<ArrowRight size={16} className="text-muted" aria-hidden="true" /></Link></li>
              ))}
            </ul>
          </section>

          <Mural compact />

          <section id="comunicados" className="rounded-3xl bg-white p-5" aria-label="Comunicados">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted"><Bell size={14} aria-hidden="true" /> Comunicados {h.unreadAnnouncements > 0 && <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] text-graphite">{h.unreadAnnouncements} novo(s)</span>}</p>
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

          <ShareCard />

          {/* 5. Recursos futuros (não são promessas) */}
          <section aria-label="Recursos futuros" data-testid="future" className="space-y-3">
            <div className="px-1">
              <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted"><Sparkles size={14} aria-hidden="true" /> Recursos futuros</p>
              <p className="mt-1 text-[14px] leading-snug text-muted">O que está previsto e o que ainda é só possibilidade. Nada daqui é garantido.</p>
            </div>
            <AvailabilityCards />
            <BoostCard />
          </section>

          <details className="rounded-3xl bg-white p-5" data-testid="how-it-works">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[16px] font-bold [&::-webkit-details-marker]:hidden">Combinado claro <ChevronDown size={18} aria-hidden="true" /></summary>
            <TransparencyList className="mt-3 text-muted" />
          </details>
        </div>
      )}
    </AreaShell>
  )
}
