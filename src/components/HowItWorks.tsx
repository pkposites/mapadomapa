import Reveal from './Reveal'
import { STEPS } from '../data/steps'

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-graphite py-20 text-white md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-lime">
            Como funciona
          </p>
          <h2 className="mt-3 max-w-[16ch] text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[40px]">
            Do cadastro ao primeiro pedido
          </h2>
        </Reveal>

        <ol className="mt-12 md:mt-16 md:grid md:grid-cols-5 md:gap-0">
          {STEPS.map((step, i) => {
            const last = i === STEPS.length - 1
            return (
              <li
                key={step.title}
                className="relative pb-10 pl-16 last:pb-0 md:pb-0 md:pl-0 md:pr-6 md:pt-16"
              >
                <Reveal delay={i * 80}>
                  <span className="absolute left-0 top-0 grid size-11 place-items-center rounded-full bg-lime text-[18px] font-bold text-graphite">
                    {i + 1}
                  </span>
                  {!last && (
                    <>
                      {/* trilho vertical (mobile) */}
                      <span className="absolute bottom-0 left-[21px] top-14 w-px bg-white/15 md:hidden" aria-hidden="true" />
                      {/* trilho horizontal (desktop) */}
                      <span className="absolute left-16 right-4 top-[22px] hidden h-px bg-white/15 md:block" aria-hidden="true" />
                    </>
                  )}
                  <h3 className="text-[20px] font-semibold leading-tight tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xs text-[16px] leading-relaxed text-on-dark">
                    {step.text}
                  </p>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
