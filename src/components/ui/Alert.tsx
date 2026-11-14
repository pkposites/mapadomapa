import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

const styles = {
  error: { box: 'bg-[#fef3f2] border-[#fecdca] text-[#7a271a]', Icon: AlertCircle },
  success: { box: 'bg-[#f0fbe4] border-[#d3f2a8] text-graphite', Icon: CheckCircle2 },
  info: { box: 'bg-ice border-line text-graphite', Icon: Info },
} as const

export default function Alert({ tone = 'info', children }: { tone?: keyof typeof styles; children: ReactNode }) {
  const { box, Icon } = styles[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-2xl border p-4 text-[15px] leading-snug ${box}`}>
      <Icon size={20} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
