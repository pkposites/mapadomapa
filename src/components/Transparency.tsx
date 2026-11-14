import { ShieldCheck } from 'lucide-react'
import { TRANSPARENCY } from '../data/content'

/** Combinado claro: o que o cadastro é e o que ele não é. */
export function TransparencyList({ className = '' }: { className?: string }) {
  return (
    <ul className={`space-y-2.5 ${className}`} data-testid="transparency">
      {TRANSPARENCY.map((t) => <li key={t} className="flex gap-2.5 text-[16px] leading-snug"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{t}</li>)}
    </ul>
  )
}

export default function Transparency() {
  return (
    <section id="combinado" className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-3xl px-5 md:px-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Transparência</p>
        <h2 className="mt-3 text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[36px]">Combinado claro, desde o início</h2>
        <div className="mt-6 rounded-3xl bg-ice p-6"><TransparencyList /></div>
      </div>
    </section>
  )
}
