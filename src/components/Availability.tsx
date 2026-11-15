import { CalendarClock, CheckCircle2, Sparkles } from 'lucide-react'
import Reveal from './Reveal'
import { AVAILABILITY } from '../data/content'

/** Três blocos para o profissional não confundir o que já existe com o que é só possibilidade. */
export function AvailabilityCards({ dark = false }: { dark?: boolean }) {
  const { now, soon, future } = AVAILABILITY
  const card = dark ? 'bg-white/5 text-white' : 'bg-white'
  const sub = dark ? 'text-on-dark' : 'text-muted'
  return (
    <div className="grid gap-3 md:grid-cols-3 md:gap-4" data-testid="availability">
      <article className={`rounded-3xl p-6 ${card} ring-2 ring-lime`} data-testid="av-now">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-ok"><CheckCircle2 size={18} aria-hidden="true" /> {now.title}</p>
        <ul className="mt-4 space-y-2.5">{now.items.map((i) => <li key={i} className="flex gap-2.5 text-[16px] leading-snug"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />{i}</li>)}</ul>
      </article>
      <article className={`rounded-3xl p-6 ${card}`} data-testid="av-soon">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#8a5a00]"><CalendarClock size={18} aria-hidden="true" /> {soon.title}</p>
        <ul className="mt-4 space-y-2.5">{soon.items.map((i) => <li key={i} className="flex gap-2.5 text-[16px] leading-snug"><span className="mt-2 size-2 shrink-0 rounded-full bg-[#f0b429]" aria-hidden="true" />{i}</li>)}</ul>
        <p className={`mt-4 text-[13px] leading-snug ${sub}`}>Data prevista, sujeita a ajustes.</p>
      </article>
      <article className={`rounded-3xl border-2 border-dashed p-6 ${dark ? 'border-white/20 text-white' : 'border-line bg-ice/60'}`} data-testid="av-future">
        <p className={`flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] ${sub}`}><Sparkles size={18} aria-hidden="true" /> {future.title}</p>
        <ul className="mt-4 space-y-2.5">{future.items.map((i) => <li key={i} className={`flex gap-2.5 text-[16px] leading-snug ${sub}`}><span className="mt-2 size-2 shrink-0 rounded-full border border-current" aria-hidden="true" />{i}</li>)}</ul>
        <p className={`mt-4 text-[13px] font-medium leading-snug ${sub}`}>{future.note}</p>
      </article>
    </div>
  )
}

export default function Availability() {
  return (
    <section id="o-que-tem" className="bg-ice py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Sem confusão</p>
          <h2 className="mt-3 max-w-[20ch] text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[40px]">O que você tem hoje e o que vem depois</h2>
          <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-muted">Separamos o que já funciona do que é previsto e do que ainda é só ideia.</p>
        </Reveal>
        <div className="mt-8 md:mt-10"><AvailabilityCards /></div>
      </div>
    </section>
  )
}
