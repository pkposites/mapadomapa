import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, ClipboardList, House, MessageSquare, Newspaper, UserRound } from 'lucide-react'
import ToastHost from './Toast'
import { api } from '../lib/api'

const TABS = [
  { to: '/area', label: 'Início', Icon: House, end: true },
  { to: '/area/mural', label: 'Mural', Icon: Newspaper, end: false },
  { to: '/area/perfil', label: 'Meu Perfil', Icon: UserRound, end: false },
  { to: '/area/mensagens', label: 'Mensagens', Icon: MessageSquare, end: false },
  { to: '/area/pedidos', label: 'Pedidos', Icon: ClipboardList, end: false },
] as const

const TITLES: [string, string][] = [['/area/mural/', 'Post'], ['/area/mural', 'Mural'], ['/area/perfil', 'Meu Perfil'], ['/area/mensagens', 'Mensagens'], ['/area/pedidos', 'Pedidos'], ['/area/destaque', 'Destaque'], ['/area', 'Início']]
const titleOf = (path: string) => TITLES.find(([p]) => path.startsWith(p))?.[1] ?? 'Mapa do Mapa'
type Info = { unread: number; announcements: number; name: string | null; photoVersion: string | null; newestRequestId: number | null }
const SEEN = 'mdm_req_seen' // último pedido que a pessoa já viu
const readSeen = () => { try { return Number(localStorage.getItem(SEEN) ?? 0) } catch { return 0 } }
const initials = (n: string | null) => (n ?? '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('') || ''

/** Moldura da Área do Profissional: título da aba, sino e avatar no alto; navegação inferior (pensada para o celular). */
export default function AreaShell({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null)
  const { pathname } = useLocation()
  const [seen, setSeen] = useState(readSeen)
  useEffect(() => {
    const load = () => api.get<Info>('/pro/messages/unread').then(setInfo).catch(() => {})
    void load()
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pathname])
  // Ponto em "Pedidos" só quando existe pedido NOVO compatível; some ao abrir a tela.
  const newest = info?.newestRequestId ?? 0
  useEffect(() => {
    if (pathname.startsWith('/area/pedidos') && newest > seen) { try { localStorage.setItem(SEEN, String(newest)) } catch { /* sem storage */ } setSeen(newest) }
  }, [pathname, newest, seen])
  const unread = info?.unread ?? 0
  const bell = unread + (info?.announcements ?? 0)
  const showDot = newest > seen && !pathname.startsWith('/area/pedidos')

  return (
    <div className="min-h-dvh bg-ice">
      <header className="sticky top-0 z-30 bg-graphite pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 pl-5 pr-3">
          <p className="flex-1 truncate text-heading font-bold tracking-[-0.02em] text-white" data-testid="area-title">{titleOf(pathname)}</p>
          <Link to={unread > 0 ? '/area/mensagens' : '/area#comunicados'} aria-label={bell > 0 ? `Notificações: ${bell} novas` : 'Notificações'} data-testid="bell" className="relative grid size-11 place-items-center text-white">
            <Bell size={24} strokeWidth={1.75} aria-hidden="true" />
            {bell > 0 && <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full border-2 border-graphite bg-danger px-1 text-[10px] font-bold leading-4 text-white">{bell > 9 ? '9+' : bell}</span>}
          </Link>
          <Link to="/area/perfil" aria-label="Meu perfil" data-testid="avatar-link" className="grid size-11 place-items-center">
            <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-lime text-[13px] font-bold text-graphite" data-clarity-mask="true">
              {info?.photoVersion ? <img src={`/api/pro/photo?v=${info.photoVersion}`} alt="" className="size-full object-cover" /> : initials(info?.name ?? null) || <UserRound size={18} aria-hidden="true" />}
            </span>
          </Link>
        </div>
      </header>
      {/* Perfil e Mensagens têm dados pessoais: o Clarity não grava o conteúdo destas telas */}
      <main key={pathname} data-clarity-mask={pathname.startsWith('/area/perfil') || pathname.startsWith('/area/mensagens') ? 'true' : undefined} className="route-in mx-auto max-w-lg animate-[route-in_.22s_ease-out] px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5">{children}</main>
      <ToastHost />
      <nav aria-label="Área do profissional" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${isActive ? 'text-graphite' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-lime' : ''}`}><Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" /></span>
                    {label}
                    {to === '/area/pedidos' && showDot && (
                      <span aria-hidden="true" data-testid="pedidos-dot" className="absolute right-[26%] top-2.5 size-2.5"><span className="absolute inset-0 rounded-full bg-lime motion-safe:animate-ping opacity-60" /><span className="absolute inset-0 rounded-full bg-lime ring-2 ring-white" /></span>
                    )}
                    {to === '/area/mensagens' && unread > 0 && (
                      <span aria-label={`${unread} não lidas`} className="absolute right-[22%] top-2 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white">{unread}</span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
