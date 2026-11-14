import { CalendarDays, Inbox } from 'lucide-react'
import AreaShell from '../../area/Shell'
import { SITE } from '../../config/site'
import BoostCard from '../../area/BoostCard'

/** Seção preparada para a evolução do marketplace. Nada aqui recebe pedidos reais. */
export default function Pedidos() {
  return (
    <AreaShell>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Meus Pedidos</h1>
      <section className="mt-5 rounded-3xl bg-graphite p-6 text-white">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime"><CalendarDays size={18} aria-hidden="true" /> Em breve</p>
        <p className="mt-3 text-[40px] font-bold leading-none tracking-[-0.04em]" data-testid="requests-date">{SITE.requestsOpenLabel}</p>
        <p className="mt-3 text-[16px] leading-relaxed text-on-dark">Os pedidos reais de orçamento estão previstos para começar nesta data. Por enquanto, não há pedidos para responder.</p>
      </section>
      <section className="mt-5 rounded-3xl bg-white p-6 text-center" aria-label="Seus pedidos">
        <Inbox size={32} strokeWidth={1.5} className="mx-auto text-muted" aria-hidden="true" />
        <p className="mt-3 text-[17px] font-semibold">Nenhum pedido ainda</p>
        <p className="mt-1 text-[15px] leading-snug text-muted">Quando os pedidos abrirem, os orçamentos solicitados na sua região aparecerão aqui. Mantenha seu perfil completo e seu cadastro aprovado.</p>
      </section>
      <div className="mt-5"><BoostCard /></div>
    </AreaShell>
  )
}
