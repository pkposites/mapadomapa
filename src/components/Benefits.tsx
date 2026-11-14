import { MapPin, Smartphone, SlidersHorizontal, BadgeCheck } from 'lucide-react'
import Reveal from './Reveal'
import { BENEFITS } from '../data/steps'

const ICONS = {
  gratis: BadgeCheck,
  regiao: MapPin,
  celular: Smartphone,
  controle: SlidersHorizontal,
} as const

export default function Benefits() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            Por que se cadastrar
          </p>
          <h2 className="mt-3 max-w-[18ch] text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[40px]">
            Feito para quem vive de bons serviços
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-3 md:mt-12 md:grid-cols-3 md:gap-4">
          {BENEFITS.map((b, i) => {
            const Icon = ICONS[b.id]
            const featured = i === 0
            const wide = i === 0 || i === 3
            return (
              <Reveal
                key={b.id}
                delay={i * 60}
                className={wide ? 'md:col-span-2' : ''}
              >
                <article
                  className={`flex h-full flex-col justify-between gap-10 rounded-3xl p-6 md:p-8 ${
                    featured ? 'bg-graphite text-white' : 'bg-ice text-graphite'
                  }`}
                >
                  <span
                    className={`grid size-12 place-items-center rounded-xl ${
                      featured ? 'bg-lime text-graphite' : 'bg-white text-graphite'
                    }`}
                  >
                    <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div>
                    <h3
                      className={`font-bold leading-tight tracking-tight ${
                        featured ? 'text-[28px] md:text-[34px]' : 'text-[22px]'
                      }`}
                    >
                      {b.title}
                    </h3>
                    <p
                      className={`mt-2 max-w-md text-[17px] leading-relaxed ${
                        featured ? 'text-on-dark' : 'text-muted'
                      }`}
                    >
                      {b.text}
                    </p>
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
