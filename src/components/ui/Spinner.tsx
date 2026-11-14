import { Loader2 } from 'lucide-react'

export default function Spinner({ fullPage = false }: { fullPage?: boolean }) {
  const icon = <Loader2 className="animate-spin text-muted" size={28} aria-hidden="true" />
  return fullPage ? (
    <div role="status" aria-label="Carregando" className="grid min-h-dvh place-items-center bg-ice">
      {icon}
    </div>
  ) : (
    icon
  )
}
