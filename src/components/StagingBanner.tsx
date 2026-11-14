import { FlaskConical } from 'lucide-react'
import { STAGING } from '../lib/sim'

/** Faixa fixa que deixa claro: este NÃO é o site oficial. Só aparece no build de homologação. */
export default function StagingBanner() {
  if (!STAGING) return null
  return (
    <div role="note" className="flex min-h-11 items-center justify-center gap-2 bg-lime px-4 py-2 text-center text-[13px] font-semibold leading-tight text-graphite">
      <FlaskConical size={16} strokeWidth={2} aria-hidden="true" />
      AMBIENTE DE TESTES · dados fictícios · nenhum SMS é enviado
    </div>
  )
}
