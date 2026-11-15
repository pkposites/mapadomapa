import { CheckCircle2 } from 'lucide-react'
import { useToast } from '../lib/toast'

/** Aviso flutuante acima da barra de abas. */
export default function ToastHost() {
  const t = useToast()
  if (!t) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <div key={t.id} className="flex animate-[toast-in_.2s_ease-out] items-center gap-2 rounded-full bg-graphite px-4 py-2.5 text-[14px] font-semibold text-white shadow-lg">
        <CheckCircle2 size={18} className="text-lime" aria-hidden="true" />{t.text}
      </div>
    </div>
  )
}
