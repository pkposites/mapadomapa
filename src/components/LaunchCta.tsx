import { CalendarDays } from 'lucide-react'
import Button from './Button'
import Reveal from './Reveal'
import { SITE } from '../config/site'
import { useLaunchState } from '../hooks/useLaunchState'

export default function LaunchCta() {
  const launch = useLaunchState()

  return (
    <section id="abertura" className="bg-graphite py-20 text-white md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <div className="rounded-[28px] bg-graphite-2 p-6 md:p-12 lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime">
                <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                Abertura dos pedidos
              </p>
              <p className="mt-4 text-[length:min(56px,calc((100vw-96px)/5.4))] font-bold leading-none tracking-[-0.04em] md:text-[80px] lg:text-[88px]">
                {SITE.requestsOpenLabel}
              </p>
              <p className="mt-3 text-[18px] text-on-dark" data-testid="countdown">
                {launch.status === 'upcoming' && (
                  <>
                    Faltam{' '}
                    <strong className="font-semibold text-white">
                      {launch.days} {launch.days === 1 ? 'dia' : 'dias'}
                    </strong>{' '}
                    para a abertura dos pedidos.
                  </>
                )}
                {launch.status === 'today' && (
                  <strong className="font-semibold text-white">Os pedidos abrem hoje!</strong>
                )}
                {launch.status === 'open' && (
                  <strong className="font-semibold text-white">Os pedidos já estão abertos!</strong>
                )}
              </p>
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-on-dark md:text-lg">
                O pré-cadastro de profissionais está aberto agora e é gratuito. Cadastre-se e saia na frente: os pedidos de orçamento em{' '}
                {SITE.city} começam em {SITE.requestsOpenLabel}.
              </p>
            </div>

            <div className="mt-8 md:max-w-sm lg:mt-0">
              <Button id="final-cta" to={SITE.signupPath} arrow fullWidth>
                {SITE.ctaLabel}
              </Button>
              <p className="mt-3 text-[14px] text-on-dark">
                Pré-cadastro gratuito. Sem compromisso.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
