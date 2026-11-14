import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

/** Botão grande de escolha (radio/checkbox) para toque com o polegar. */
export default function Choice({ selected, onClick, children, hint, disabled, kind = 'radio', className = '' }: {
  selected: boolean; onClick: () => void; children: ReactNode; hint?: string; disabled?: boolean; kind?: 'radio' | 'checkbox'; className?: string
}) {
  return (
    <button
      type="button"
      role={kind}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-13 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[16px] font-medium leading-snug transition duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${
        selected ? 'border-graphite bg-graphite text-white' : 'border-line bg-white text-graphite hover:border-[#c9d0c7]'
      } ${className}`}
    >
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className={`block text-[13px] font-normal ${selected ? 'text-on-dark' : 'text-muted'}`}>{hint}</span>}
      </span>
      <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full ${selected ? 'bg-lime text-graphite' : 'border border-line'}`}>
        {selected && <Check size={16} strokeWidth={3} />}
      </span>
    </button>
  )
}
