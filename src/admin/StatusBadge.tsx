import { STATUS_LABEL, type Status } from './types'
const STYLE: Record<Status, string> = {
  not_submitted: 'bg-white text-muted border border-line', pending_review: 'bg-lime text-graphite', needs_changes: 'bg-white text-graphite border border-graphite',
  approved: 'bg-graphite text-white', rejected: 'bg-[#fef3f2] text-[#7a271a] border border-[#fecdca]', suspended: 'bg-[#fef3f2] text-[#7a271a] border border-[#fecdca]',
}
export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex min-h-7 items-center rounded-full px-3 text-[13px] font-semibold ${STYLE[status]}`}>{STATUS_LABEL[status]}</span>
}
