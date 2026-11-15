import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronDown, Download, Megaphone, MessageSquare, ShieldCheck, Sparkles, UserRound, Users } from 'lucide-react'
import AreaShell from '../../area/Shell'
import InstallPrompt from '../../area/InstallPrompt'
import ShareCard from '../../area/ShareCard'
import PushCard from '../../area/PushCard'
import Mural from '../../area/Mural'
import BoostCard from '../../area/BoostCard'
import Journey from '../../area/Journey'
import { Sk } from '../../components/ui/Skeleton'
import Sheet from '../../area/Sheet'
import { journeySteps } from '../../area/Journey'
import { isIos, isStandalone, pushSupported } from '../../lib/push'
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
  const [sheet, setSheet] = useState<'install' | 'push' | 'share' | null>(null)
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

  const steps = h ? journeySteps(h) : []
  const doneCount = steps.filter((x) => x.state === 'done').length
  const BAR: Record<string, string> = { done: 'bg-lime', current: 'bg-graphite', attention: 'bg-[#f0b429]', blocked: 'bg-danger', locked: 'bg-line' }
  const tiles = h ? [
    { id: 'perfil', label: h.profilePrepared ? 'Meu perfil' : 'Completar perfil', Icon: UserRound, to: '/area/perfil' },
    ...(isStandalone() ? [] : [{ id: 'install', label: 'Instalar app', Icon: Download, sheet: 'install' as const }]),
    ...(pushSupported() || isIos() ? [{ id: 'push', label: 'Ativar avisos', Icon: Bell, sheet: 'push' as const }] : []),
    { id: 'share', label: 'Indicar', Icon: Users, sheet: 'share' as const },
  ] : []
  const fold = 'group rounded-2xl bg-white'
  const sum = 'flex min-h-14 cursor-pointer list-none items-center justify-between px-4 text-body font-semibold [&::-webkit-details-marker]:hidden'

  return (
    <AreaShell>
      {!h && !err && (
        <div role="status" aria-label="Carregando" className="space-y-3"><Sk className="h-14 w-2/3" /><Sk className="h-40" /><div className="flex gap-3"><Sk className="h-24 w-28" /><Sk className="h-24 w-28" /><Sk className="h-24 w-28" /></div><Sk className="h-20" /><Sk className="h-44" /></div>
      )}
      {err && <Alert tone="error">Não foi possível carregar. Confira a internet e <button className="font-semibold underline" onClick={() => location.reload()}>tente de novo</button>.</Alert>}
      {h && next && (
        <div className="space-y-4" id="inicio">
          {/* 1. Saudação e situação */}
          <section aria-label="Boas-vindas" data-testid="welcome">
            <h2 className="text-title font-bold tracking-[-0.03em]" data-testid="greeting" data-clarity-mask="true">{h.firstName ? `Olá, ${h.firstName}!` : 'Olá!'}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
              <span className={`inline-block rounded-full px-3 py-0.5 text-small font-semibold ${STATUS_TONE[h.status] ?? 'bg-ice'}`} data-testid="status-badge">{h.statusLabel}</span>
              <span data-testid="launch-info"><CalendarDays size={14} className="mr-1 inline -mt-0.5" aria-hidden="true" />Pedidos reais previstos a partir de {SITE.requestsOpenLabel}{launch.status === 'upcoming' ? ` (faltam ${launch.days} ${launch.days === 1 ? 'dia' : 'dias'})` : ''}</span>
            </p>
            <p className="mt-2 text-small text-muted">{STATUS_HINT[h.status]} Estamos em pré-lançamento: você já pode preparar seu perfil.</p>
          </section>

          {h.decision?.notes && <div className="rounded-2xl bg-white p-4 text-small leading-snug"><p className="font-semibold">Orientação da equipe</p><p className="mt-1">{h.decision.notes}</p></div>}

          {/* 2. Próxima ação */}
          <section className="rounded-2xl bg-lime p-4 text-graphite" data-testid="next-action" aria-label="Próxima ação recomendada">
            <p className="text-tiny font-bold uppercase tracking-[0.1em]">Próxima ação recomendada</p>
            <p className="mt-1 text-body font-semibold leading-snug">{next.why}</p>
            <Link to={next.to} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-graphite px-5 text-body font-semibold text-white">{next.label} <ArrowRight size={18} aria-hidden="true" /></Link>
          </section>
          {user && !user.phoneVerified && <p className="rounded-2xl bg-white p-3 text-small leading-snug" data-testid="phone-note"><strong>Celular ainda não verificado.</strong> A equipe verifica manualmente durante a análise do cadastro. Dúvidas? Escreva em <Link to="/area/mensagens" className="font-semibold underline">Mensagens</Link>.</p>}

          {user?.isAdmin && (
            <Link to="/admin" className="flex min-h-14 items-center gap-3 rounded-2xl bg-graphite px-4 font-semibold text-white"><ShieldCheck size={20} aria-hidden="true" /> Painel administrativo <ArrowRight size={18} className="ml-auto" aria-hidden="true" /></Link>
          )}

          {/* 3. Atalhos em carrossel */}
          <div className="relative" data-testid="shortcuts">
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 pr-10">
              {tiles.map((t) => (
                <li key={t.id} className="w-[104px] shrink-0">
                  {'to' in t && t.to
                    ? <Link to={t.to} className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl bg-white px-2 text-center text-small font-semibold"><t.Icon size={24} strokeWidth={1.75} aria-hidden="true" />{t.label}</Link>
                    : <button type="button" onClick={() => setSheet(('sheet' in t ? t.sheet : null) ?? null)} data-testid={`tile-${t.id}`} className="flex min-h-[92px] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white px-2 text-center text-small font-semibold"><t.Icon size={24} strokeWidth={1.75} aria-hidden="true" />{t.label}</button>}
                </li>
              ))}
            </ul>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -right-4 w-12 bg-gradient-to-l from-ice to-transparent" />
          </div>

          {/* 4. Jornada em uma faixa (abre ao tocar) */}
          <details className={fold} data-testid="journey-fold">
            <summary className="flex min-h-16 cursor-pointer list-none flex-col justify-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between text-body font-semibold">Sua jornada · {doneCount} de 5 <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" /></span>
              <span className="flex gap-1" aria-hidden="true">{steps.map((st, i) => <i key={i} className={`h-1.5 flex-1 rounded-full ${BAR[st.state]}`} />)}</span>
            </summary>
            <div className="border-t border-line"><Journey h={h} /></div>
          </details>

          {/* Ações obrigatórias: sempre à vista quando existem */}
          <section className="rounded-2xl bg-white p-4" aria-label="Ações obrigatórias" data-testid="pend-required">
            <p className="text-tiny font-semibold uppercase tracking-[0.1em] text-muted">Ações obrigatórias</p>
            {required.length === 0
              ? <p className="mt-2 flex items-center gap-2 text-small"><CheckCircle2 size={18} className="text-ok" aria-hidden="true" /> Nenhuma ação obrigatória pendente.</p>
              : <ul className="mt-1 divide-y divide-line">{required.map((p) => (
                  <li key={p.id}><Link to={p.to} className="flex min-h-14 items-center gap-3 py-2 text-small leading-snug"><span className="size-2.5 shrink-0 rounded-full bg-danger" aria-hidden="true" /><span className="flex-1">{p.text}</span><ArrowRight size={18} className="text-muted" aria-hidden="true" /></Link></li>))}</ul>}
          </section>

          {/* 5. Prévia do mural */}
          <Mural compact />

          {/* 6. O resto, recolhido */}
          {optional.length > 0 && (
            <details className={fold} data-testid="pend-optional">
              <summary className={sum}>Melhorias recomendadas ({optional.length}) <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" /></summary>
              <ul className="divide-y divide-line border-t border-line px-4">{optional.map((p) => (
                <li key={p.id}><Link to={p.to} className="flex min-h-14 items-center gap-3 py-2 text-small leading-snug"><span className="size-2.5 shrink-0 rounded-full bg-lime ring-1 ring-graphite/20" aria-hidden="true" /><span className="flex-1">{p.text}</span><ArrowRight size={18} className="text-muted" aria-hidden="true" /></Link></li>))}</ul>
            </details>
          )}

          <details id="comunicados" className={fold} open={h.unreadAnnouncements > 0}>
            <summary className={sum}><span className="flex items-center gap-2"><Bell size={18} aria-hidden="true" /> Comunicados {h.unreadAnnouncements > 0 && <span className="rounded-full bg-lime px-2 py-0.5 text-tiny text-graphite">{h.unreadAnnouncements} novo(s)</span>}</span><ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="border-t border-line px-4 pb-4 pt-3">
              <ul className="space-y-4">
                {(all ?? h.announcements).map((a) => (
                  <li key={a.id}>
                    <p className="flex items-center gap-2 text-body font-semibold">{!a.read && <span className="size-2 rounded-full bg-lime ring-1 ring-graphite/30" aria-label="Não lido" />}{a.title}<span className="ml-auto text-small font-normal text-muted">{fmt(a.at)}</span></p>
                    <p className="mt-1 whitespace-pre-line text-small leading-snug text-muted">{a.body}</p>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={openAll} className="mt-3 inline-flex min-h-11 items-center gap-1 text-small font-semibold underline decoration-lime decoration-2 underline-offset-4">{all ? 'Mostrar menos' : 'Ver todos e marcar como lidos'}</button>
            </div>
          </details>

          <details className={fold} data-testid="reasons">
            <summary className={sum}>Volte sempre aqui para <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" /></summary>
            <ul className="divide-y divide-line border-t border-line px-4 text-small">
              {[
                { to: '/area#inicio', Icon: ShieldCheck, t: 'Acompanhar a situação do cadastro', s: h.statusLabel },
                { to: '/area#comunicados', Icon: Megaphone, t: 'Ler os comunicados', s: h.unreadAnnouncements > 0 ? `${h.unreadAnnouncements} novo(s)` : 'em dia' },
                { to: '/area/mensagens', Icon: MessageSquare, t: 'Ver mensagens da equipe', s: h.unreadMessages > 0 ? `${h.unreadMessages} não lida(s)` : 'em dia' },
                { to: '/area/perfil', Icon: UserRound, t: 'Se preparar para o lançamento', s: h.profilePrepared ? 'perfil completo' : 'complete seu perfil' },
              ].map(({ to, Icon, t, s }) => (
                <li key={t}><Link to={to} className="flex min-h-14 items-center gap-3 py-2"><Icon size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><span className="flex-1 leading-snug">{t}</span><span className="text-tiny text-muted">{s}</span><ArrowRight size={16} className="text-muted" aria-hidden="true" /></Link></li>
              ))}
            </ul>
          </details>

          <details className={fold} data-testid="future">
            <summary className={sum}><span className="flex items-center gap-2"><Sparkles size={18} aria-hidden="true" /> Recursos futuros</span><ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="space-y-3 border-t border-line p-4">
              <p className="text-small leading-snug text-muted">O que está previsto e o que ainda é só possibilidade. Nada daqui é garantido.</p>
              <AvailabilityCards />
              <BoostCard />
            </div>
          </details>

          <details className={fold} data-testid="how-it-works">
            <summary className={sum}>Combinado claro <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="border-t border-line p-4"><TransparencyList className="text-muted" /></div>
          </details>
        </div>
      )}

      {sheet === 'install' && <Sheet title="Instalar app" onClose={() => setSheet(null)}><InstallPrompt persistent /></Sheet>}
      {sheet === 'push' && <Sheet title="Avisos no celular" onClose={() => setSheet(null)}><PushCard /></Sheet>}
      {sheet === 'share' && <Sheet title="Indique o Mapa do Mapa" onClose={() => setSheet(null)}><ShareCard /></Sheet>}
    </AreaShell>
  )
}
