import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Inbox, MapPin } from 'lucide-react'
import AreaShell from '../../area/Shell'
import BoostCard from '../../area/BoostCard'
import Alert from '../../components/ui/Alert'
import { SkeletonList } from '../../components/ui/Skeleton'
import { buzz, toast } from '../../lib/toast'
import { SITE } from '../../config/site'
import { api, ApiError } from '../../lib/api'

type Opp = { id: string; title: string; description: string; profession: string; region: string; neighborhood: string; urgency: string; urgencyLabel: string; periodNote: string | null; publishedAt: string; interested: boolean }
const URG_CLS: Record<string, string> = { urgent: 'bg-[#fef3f2] text-[#7a271a]', this_week: 'bg-[#fff6dd] text-[#7a5a00]', flexible: 'bg-ice text-graphite' }

/** Oportunidades reais (cadastradas pela equipe) para quem é aprovado e compatível; senão, a comunicação do lançamento. */
export default function Pedidos() {
  const [data, setData] = useState<{ allowed: boolean; items: Opp[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => { api.get<{ allowed: boolean; items: Opp[] }>('/pro/requests').then(setData).catch(() => setData({ allowed: false, items: [] })) }, [])

  const interest = async (o: Opp) => {
    setBusy(o.id); setMsg(null)
    try {
      await api.post(`/pro/requests/${o.id}/interest`)
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, interested: true } : x)) })
      buzz(); toast('Interesse enviado')
      setMsg({ tone: 'success', text: 'Interesse enviado! A equipe entrará em contato se o pedido seguir com você.' })
    } catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível enviar agora.' }) } finally { setBusy(null) }
  }
  const items = data?.items ?? []

  return (
    <AreaShell>
      <h1 className="sr-only">Meus Pedidos</h1>
      {!data && <div className="mt-2"><SkeletonList rows={2} tall /></div>}

      {data && items.length > 0 && (
        <section className="mt-4" aria-label="Oportunidades" data-testid="opportunities">
          <p className="text-[15px] leading-snug text-muted">Pedidos reais compatíveis com a sua profissão e região. Toque em “Tenho interesse” e a equipe fará a conexão com o cliente.</p>
          {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          <ul className="mt-4 space-y-3">
            {items.map((o) => (
              <li key={o.id} className="rounded-3xl bg-white p-5" data-testid="opportunity">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-graphite px-3 py-1 text-[12px] font-semibold text-white">{o.profession}</span>
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${URG_CLS[o.urgency] ?? 'bg-ice'}`}>{o.urgencyLabel}</span>
                </div>
                <h2 className="mt-3 text-[20px] font-bold leading-snug tracking-[-0.01em]">{o.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted"><MapPin size={15} aria-hidden="true" /> {o.neighborhood} · {o.region}</p>
                <p className="mt-3 whitespace-pre-line break-words text-[16px] leading-snug">{o.description}</p>
                {o.periodNote && <p className="mt-2 text-[14px]"><strong>Período:</strong> {o.periodNote}</p>}
                <p className="mt-2 text-[12px] text-muted">Publicado em {new Date(o.publishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                {o.interested
                  ? <p className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ice font-semibold" data-testid="interested"><CheckCircle2 size={18} className="text-ok" aria-hidden="true" /> Interesse enviado</p>
                  : <button type="button" disabled={busy === o.id} onClick={() => interest(o)} data-testid="interest" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-lime px-6 font-semibold text-graphite disabled:opacity-60">Tenho interesse</button>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-snug text-muted">Por segurança, os dados do cliente não aparecem aqui. A equipe do Mapa do Mapa faz a conexão. Não há garantia de contratação.</p>
        </section>
      )}

      {data && items.length === 0 && (
        <>
          <section className="mt-5 rounded-3xl bg-graphite p-6 text-white">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime"><CalendarDays size={18} aria-hidden="true" /> {data.allowed ? 'Pedidos reais previstos' : 'Em breve'}</p>
            <p className="mt-3 text-[40px] font-bold leading-none tracking-[-0.04em]" data-testid="requests-date">{SITE.requestsOpenLabel}</p>
            <p className="mt-3 text-[16px] leading-relaxed text-on-dark">Os pedidos de orçamento estão previstos para começar nesta data. {data.allowed ? 'Quando houver pedidos compatíveis com a sua profissão e região, eles aparecem aqui antes mesmo disso.' : 'Pedidos ficam disponíveis para profissionais aprovados, da profissão e da região do pedido.'}</p>
          </section>
          <section className="mt-5 rounded-3xl bg-white p-6 text-center" aria-label="Seus pedidos">
            <Inbox size={32} strokeWidth={1.5} className="mx-auto text-muted" aria-hidden="true" />
            <p className="mt-3 text-[17px] font-semibold">Nenhum pedido ainda</p>
            <p className="mt-1 text-[15px] leading-snug text-muted">{data.allowed ? 'Quando a equipe cadastrar um pedido compatível com você, ele aparece aqui.' : 'Mantenha seu perfil completo e aguarde a aprovação do cadastro.'}</p>
          </section>
        </>
      )}
      <div className="mt-5"><BoostCard /></div>
    </AreaShell>
  )
}
