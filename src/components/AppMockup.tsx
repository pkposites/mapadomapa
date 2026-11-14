import { Bell, BellRing, MapPin, PaintRoller, Wrench } from 'lucide-react'

/**
 * Ilustração da interface mobile: um chamado de orçamento chegando.
 * Puramente decorativa (dados fictícios) — descrita por aria-label.
 */
export default function AppMockup() {
  return (
    <div
      role="img"
      aria-label="Exemplo da tela do app com um pedido de orçamento de pintura em Vila Mariana"
      className="relative mx-auto w-full max-w-[300px] md:max-w-[320px]"
    >
      {/* Notificação flutuante */}
      <div className="pop-in absolute -left-3 -top-7 z-10 flex w-[236px] items-center gap-3 rounded-2xl bg-white p-3 pr-4 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] lg:-left-16">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime text-graphite">
          <BellRing size={20} strokeWidth={2} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[14px] font-semibold text-graphite">
            Novo pedido de orçamento
          </span>
          <span className="block pt-0.5 text-[13px] text-muted">Pintura · Vila Mariana</span>
        </span>
      </div>

      {/* Aparelho */}
      <div className="rounded-[44px] bg-[#0a0c0b] p-2.5 ring-1 ring-white/15">
        <div className="overflow-hidden rounded-[34px] bg-ice">
          {/* Barra de status */}
          <div className="flex items-center justify-between px-6 pb-1 pt-4 text-[12px] font-semibold text-graphite">
            <span>9:41</span>
            <span className="h-5 w-[72px] rounded-full bg-graphite" />
            <span>5G</span>
          </div>

          {/* Cabeçalho do app */}
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <div className="leading-tight">
              <p className="text-[13px] text-muted">Perto de você</p>
              <p className="text-[22px] font-bold tracking-tight text-graphite">Pedidos</p>
            </div>
            <span className="relative grid size-10 place-items-center rounded-full bg-white text-graphite">
              <Bell size={20} strokeWidth={1.75} />
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-lime ring-2 ring-white" />
            </span>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 px-5 pb-4">
            <span className="rounded-full bg-graphite px-3.5 py-1.5 text-[13px] font-semibold text-white">
              Todos
            </span>
            <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-muted">
              Hoje
            </span>
            <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-muted">
              Até 5 km
            </span>
          </div>

          {/* Pedido em destaque */}
          <div className="mx-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(20,23,21,0.06)]">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ice text-graphite">
                <PaintRoller size={22} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[16px] font-semibold text-graphite">Pintura residencial</p>
                <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
                  <MapPin size={14} strokeWidth={2} /> Vila Mariana · 2,3 km
                </p>
              </div>
            </div>
            <p className="mt-3 text-[14px] leading-snug text-graphite">
              Apartamento de 2 quartos. Paredes e teto, material já comprado.
            </p>
            <div className="mt-4 grid grid-cols-[1fr_1.5fr] gap-2">
              <span className="grid h-11 place-items-center rounded-xl border border-line text-[14px] font-semibold text-graphite">
                Agora não
              </span>
              <span className="grid h-11 place-items-center rounded-xl bg-lime text-[14px] font-semibold text-graphite">
                Enviar orçamento
              </span>
            </div>
          </div>

          {/* Segundo pedido (cortado) */}
          <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white p-4 opacity-90">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ice text-graphite">
              <Wrench size={22} strokeWidth={1.75} />
            </span>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-graphite">Troca de chuveiro</p>
              <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
                <MapPin size={14} strokeWidth={2} /> Pinheiros · 4,1 km
              </p>
            </div>
          </div>
          <div className="h-5" />
        </div>
      </div>
    </div>
  )
}
