import { BadgeCheck } from 'lucide-react'

const COLORS = ['#b9f46d', '#9be7c4', '#ffd88a', '#f5b5a8', '#b9c8ff', '#d9b8ff', '#a8e3f0', '#f1c0e8']
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
/** Avatar com iniciais (a foto de perfil é privada e nunca aparece no mural). A equipe usa o ícone oficial. */
export default function Avatar({ name, size = 44, staff = false }: { name: string; size?: number; staff?: boolean }) {
  if (staff) return <img src="/icons/icon-192.png" alt="" aria-hidden="true" width={size} height={size} className="shrink-0 rounded-full bg-white ring-2 ring-lime" style={{ width: size, height: size }} />
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full font-bold text-graphite" style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: size * 0.38 }}>{initials(name)}</span>
}
/** Selo da equipe: diferencia a administração dos profissionais. */
export function StaffBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-graphite px-2 py-0.5 align-middle text-[11px] font-semibold text-lime" data-testid="staff-badge"><BadgeCheck size={12} aria-hidden="true" /> Equipe</span>
}
