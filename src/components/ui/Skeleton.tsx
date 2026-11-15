/** Esqueleto de carregamento: mostra a forma da tela enquanto os dados chegam. */
export const Sk = ({ className = '' }: { className?: string }) => <div aria-hidden="true" className={`animate-pulse rounded-2xl bg-line/70 ${className}`} />
export function SkeletonList({ rows = 3, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div role="status" aria-label="Carregando" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <Sk key={i} className={tall ? 'h-40' : 'h-24'} />)}
    </div>
  )
}
