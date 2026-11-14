import { CalendarDays, CheckCircle2 } from 'lucide-react'
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
            Pré-lançamento • São Paulo
          </span>

          <h1 className="mt-6 max-w-[14ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.03em] md:max-w-[16ch] md:text-6xl lg:text-[68px]">
            Seu trabalho merece mais oportunidades.
          </h1>

          <p className="mt-5 max-w-lg text-[18px] leading-relaxed text-on-dark md:text-xl">
            Cadastre-se gratuitamente no Mapa do Mapa, prepare seu perfil profissional e faça parte da nossa fase de pré-lançamento em São Paulo.
          </p>

          <ul className="mt-6 space-y-2.5" data-testid="hero-highlights">
            <li className="flex items-start gap-3 text-[17px] font-semibold leading-snug"><CheckCircle2 size={22} className="mt-px shrink-0 text-lime" aria-hidden="true" /> Pré-cadastro aberto agora.</li>
            <li className="flex items-start gap-3 text-[17px] font-semibold leading-snug"><CalendarDays size={22} className="mt-px shrink-0 text-lime" aria-hidden="true" /> Pedidos reais previstos a partir de {SITE.requestsOpenLabel}.</li>
          </ul>

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
            <Button id="hero-cta" to={SITE.signupPath} arrow fullWidth className="sm:w-auto">
              {SITE.ctaLabel}
            </Button>
            <Button to="/entrar" variant="outline" fullWidth className="sm:w-auto">
              Já tenho cadastro — Entrar
            </Button>
          </div>
          <p className="mt-4 max-w-md text-[13px] leading-snug text-on-dark">Cadastro gratuito. A aprovação depende de análise e o cadastro não garante pedidos nem rendimento.</p>
        </div>

        {/* No mobile o aparelho é cortado na base, como um app saindo da tela. */}
        <div className="mt-4 min-w-0 lg:mt-0">
          <div className="h-[476px] overflow-hidden pt-9 lg:h-auto lg:overflow-visible lg:pt-0">
            <AppMockup />
          </div>
          <p className="mt-3 pb-6 text-center text-[12px] text-on-dark lg:pb-0" data-testid="mockup-caption">Exemplo ilustrativo de como os pedidos poderão aparecer após o lançamento.</p>
        </div>
      </div>
    </section>
  )
}
