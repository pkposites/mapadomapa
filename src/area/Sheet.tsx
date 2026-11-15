import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Folha que sobe de baixo (instalar app, avisos, indicar). Fecha com o botão, tocando fora ou com Esc. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label={title} onClick={onClose} data-testid="sheet">
      <div className="mx-auto max-h-[85dvh] w-full max-w-lg animate-[sheet-up_.22s_ease-out] overflow-y-auto rounded-t-3xl bg-ice p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between"><p className="text-heading font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 place-items-center rounded-full text-graphite"><X size={24} aria-hidden="true" /></button></div>
        {children}
      </div>
    </div>
  )
}
