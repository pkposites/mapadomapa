import RechargeCard, { type Recharge } from '../../area/RechargeCard'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, Inbox, MapPin, RefreshCw } from 'lucide-react'
import AreaShell from '../../area/Shell'
import BoostCard from '../../area/BoostCard'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import { SITE } from '../../config/site'
import { api, ApiError } from '../../lib/api'

type Opp = { id: string; title: string; description: string; profession: string; region: string; neighborhood: string; urgency: string; urgencyLabel: string; periodNote: string | null; publishedAt: string; interested: boolean }
const URG_CLS: Record<string, string> = { urgent: 'bg-[#fef3f2] text-[#7a271a]', this_week: 'bg-[#fff6dd] text-[#7a5a00]', flexible: 'bg-ice text-graphite' }

/** Oportunidades reais (cadastradas pela equipe) para quem é aprovado e compatível; senão, a comunicação do lançamento. */
export default function Pedidos() {
  const {user}=useAuth()
  const master=Boolean(user?.isAdmin)
  const [data, setData] = useState<{ allowed: boolean; items: Opp[]; recharge?:Recharge } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const load = async () => { setRefreshing(true); try { setData(await api.get<{ allowed: boolean; items: Opp[]; recharge?:Recharge }>('/pro/requests')); setFailed(false) } catch { setFailed(true) } finally { setRefreshing(false) } }
  useEffect(() => {
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const timer = window.setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const scrolled = useRef(false)
  useEffect(() => { if (data && !scrolled.current && window.location.hash.startsWith('#pedido-')) { const item = document.getElementById(window.location.hash.slice(1)); if (item) { item.scrollIntoView({block:'center'}); scrolled.current = true } } }, [data])

  const interest = async (o: Opp) => {
    setBusy(o.id); setMsg(null)
    try {
      await api.post(`/pro/requests/${o.id}/interest`)
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, interested: true } : x)) })
      window.dispatchEvent(new Event('mdm:interest'))
      setMsg({ tone: 'success', text: 'Interesse enviado! A equipe entrará em contato se o pedido seguir com você.' })
    } catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível enviar agora.' }) } finally { setBusy(null) }
  }
  const items = [...(data?.items ?? [])].sort((a,b) => Number(a.interested)-Number(b.interested) || Number(b.urgency === 'urgent')-Number(a.urgency === 'urgent') || new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime())
  const pending = items.filter(o => !o.interested).length

  return (
    <AreaShell>
      <div className="flex items-center justify-between gap-3"><h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Meus Pedidos</h1><button type="button" aria-label="Atualizar pedidos" onClick={() => void load()} disabled={refreshing} className="grid size-11 place-items-center rounded-xl bg-white border border-line disabled:opacity-50"><RefreshCw size={20} aria-hidden="true" /></button></div>
      <div className="mt-3"><RechargeCard r={data?.recharge} master={master}/></div>
      {master&&<Link to="/admin/pedidos" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-graphite font-semibold text-white">Gerenciar pedidos</Link>}
      {failed && <div className="mt-3"><Alert tone="error">Não foi possível atualizar os pedidos. Tente novamente.</Alert></div>}
      {!data && !failed && <div className="mt-10 flex justify-center"><Spinner /></div>}

      {data && items.length > 0 && (
        <section className="mt-4" aria-label="Oportunidades" data-testid="opportunities">
          {!master && pending > 0 && <div className="mb-4 flex items-center gap-3 rounded-2xl bg-lime p-4 text-graphite"><Bell size={24} className="shrink-0" aria-hidden="true" /><div><p className="text-[19px] font-bold">{pending} {pending === 1 ? 'pedido aguardando sua resposta' : 'pedidos aguardando sua resposta'}</p><p className="text-[13px]">Confira as oportunidades e responda assim que puder.</p></div></div>}
          <p className="text-[15px] leading-snug text-muted">{master?'Visão mestre de todos os pedidos publicados. Gerencie cada solicitação no painel.':'Pedidos reais compatíveis com a sua profissão e região. Toque em “Tenho interesse” e a equipe fará a conexão com o cliente.'}</p>
          {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          <ul className="mt-4 space-y-3">
            {items.map((o) => (
              <li key={o.id} id={`pedido-${o.id}`} className={`scroll-mt-20 rounded-3xl bg-white p-5 ${!o.interested ? 'border-2 border-graphite' : 'border border-line'}`} data-testid="opportunity">
                <div className="flex flex-wrap items-center gap-2">
                  {!master && !o.interested && <span className="rounded-full bg-lime px-3 py-1 text-[12px] font-bold text-graphite">AGUARDANDO RESPOSTA</span>}
                  <span className="rounded-full bg-graphite px-3 py-1 text-[12px] font-semibold text-white">{o.profession}</span>
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${URG_CLS[o.urgency] ?? 'bg-ice'}`}>{o.urgencyLabel}</span>
                </div>
                <h2 className="mt-3 text-[20px] font-bold leading-snug tracking-[-0.01em]">{o.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted"><MapPin size={15} aria-hidden="true" /> {o.neighborhood} · {o.region}</p>
                <p className="mt-3 whitespace-pre-line break-words text-[16px] leading-snug">{o.description}</p>
                {o.periodNote && <p className="mt-2 text-[14px]"><strong>Período:</strong> {o.periodNote}</p>}
                <p className="mt-2 text-[12px] text-muted">Publicado em {new Date(o.publishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                {master?<Link to={'/admin/pedidos/'+o.id} className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-lime font-semibold">Gerenciar este pedido</Link>:o.interested
                  ? <p className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ice font-semibold" data-testid="interested"><CheckCircle2 size={18} className="text-[#2b8a00]" aria-hidden="true" /> Interesse enviado</p>
                  : <button type="button" disabled={busy === o.id} onClick={() => interest(o)} data-testid="interest" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-lime px-6 font-semibold text-graphite disabled:opacity-60">Tenho interesse</button>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-snug text-muted">Por segurança, os dados do cliente não aparecem aqui. A equipe do Mapa do Mapa faz a conexão. Não há garantia de contratação.</p>
        </section>
      )}

      {data && items.length === 0 && (
        <>
          {!master && !data.allowed && <section className="mt-5 rounded-3xl bg-graphite p-6 text-white">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime"><CalendarDays size={18} aria-hidden="true" /> {data.allowed ? 'Pedidos reais previstos' : 'Em breve'}</p>
            <p className="mt-3 text-[40px] font-bold leading-none tracking-[-0.04em]" data-testid="requests-date">{SITE.requestsOpenLabel}</p>
            <p className="mt-3 text-[16px] leading-relaxed text-on-dark">Os pedidos de orçamento estão previstos para começar nesta data. {data.allowed ? 'Quando houver pedidos compatíveis com a sua profissão e região, eles aparecem aqui antes mesmo disso.' : 'Pedidos ficam disponíveis para profissionais aprovados, da profissão e da região do pedido.'}</p>
          </section>}
          <section className="mt-5 rounded-3xl bg-white p-6 text-center" aria-label="Seus pedidos">
            <Inbox size={32} strokeWidth={1.5} className="mx-auto text-muted" aria-hidden="true" />
            <p className="mt-3 text-[17px] font-semibold">Nenhum pedido ainda</p>
            <p className="mt-1 text-[15px] leading-snug text-muted">{master?'Nenhum pedido publicado no momento.':data.allowed ? (data.recharge?.canReceive===false?'Seus pedidos anteriores continuam disponíveis. Renove para receber novas oportunidades.':'Quando houver um pedido compatível, ele aparecerá aqui.') : 'Mantenha seu perfil completo e aguarde a aprovação do cadastro.'}</p>
          </section>
        </>
      )}
      <details className="mt-4 rounded-2xl bg-white p-4"><summary className="font-semibold">Outras opções</summary><div className="mt-3"><BoostCard /></div></details>
    </AreaShell>
  )
}
