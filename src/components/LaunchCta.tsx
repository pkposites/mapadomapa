import { CalendarDays } from 'lucide-react'
import Button from './Button'
import Reveal from './Reveal'
import { SITE, daysUntilLaunch } from '../config/site'

export default function LaunchCta() {
  const days = daysUntilLaunch()

  return (
    <section id="abertura" className="bg-graphite py-20 text-white md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <div className="rounded-[28px] bg-graphite-2 p-6 md:p-12 lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime">
                <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                Abertura prevista
              </p>
              <p className="mt-4 text-[56px] font-bold leading-none tracking-[-0.04em] md:text-[80px] lg:text-[88px]">
                {SITE.launchLabel}
              </p>
              {days > 0 && (
                <p className="mt-3 text-[18px] text-on-dark">
                  Faltam <strong className="font-semibold text-white">{days} {days === 1 ? 'dia' : 'dias'}</strong>{' '}
                  para a abertura.
                </p>
              )}
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-on-dark md:text-lg">
                Cadastre-se agora e saia na frente quando a plataforma abrir em{' '}
                {SITE.city}.
              </p>
            </div>

            <div className="mt-8 md:max-w-sm lg:mt-0">
              <Button id="final-cta" to={SITE.signupPath} arrow fullWidth>
                {SITE.ctaLabel}
              </Button>
              <p className="mt-3 text-[14px] text-on-dark">
                Gratuito. Sem compromisso.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
