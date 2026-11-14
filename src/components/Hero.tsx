import { CalendarDays } from 'lucide-react'
import Button from './Button'
import AppMockup from './AppMockup'
import { SITE } from '../config/site'

export default function Hero() {
  return (
    <section className="overflow-hidden bg-graphite text-white">
      <div className="mx-auto grid max-w-6xl px-5 pt-8 md:px-8 md:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-20">
        <div>
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-on-dark">
            <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
            Pré-cadastro aberto • São Paulo
          </span>

          <h1 className="mt-6 max-w-[13ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.03em] md:max-w-[16ch] md:text-6xl lg:text-[68px]">
            Receba pedidos de orçamento direto no seu celular!
          </h1>

          <p className="mt-5 max-w-md text-[18px] leading-relaxed text-on-dark md:text-xl">
            Pré-cadastro de profissionais aberto agora. Cadastre-se gratuitamente e
            prepare-se para receber oportunidades de serviços na sua região.
          </p>

          <p className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-lime/15 px-4 py-2.5 text-[15px] font-semibold text-lime">
            Pré-cadastro 100% gratuito para profissionais
          </p>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <Button id="hero-cta" to={SITE.signupPath} arrow fullWidth className="sm:w-auto">
              {SITE.ctaLabel}
            </Button>

            <Button to="/entrar" variant="outline" fullWidth className="sm:w-auto">
              Já tenho cadastro — Entrar
            </Button>

            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white">
                <CalendarDays size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="leading-tight">
                <span className="block text-[13px] text-on-dark">Pedidos de orçamento abrem em</span>
                <span className="block text-[18px] font-semibold">{SITE.requestsOpenLabel}</span>
              </p>
            </div>
          </div>
        </div>

        {/* No mobile o aparelho é cortado na base, como um app saindo da tela. */}
        <div className="mt-4 h-[476px] min-w-0 overflow-hidden pt-9 lg:mt-0 lg:h-auto lg:overflow-visible lg:pt-0">
          <AppMockup />
        </div>
      </div>
    </section>
  )
}
