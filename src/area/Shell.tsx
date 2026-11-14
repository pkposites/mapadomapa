import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ClipboardList, House, MessageSquare, Newspaper, UserRound } from 'lucide-react'
import Logo from '../components/Logo'
import { api } from '../lib/api'

const TABS = [
  { to: '/area', label: 'Início', Icon: House, end: true },
  { to: '/area/mural', label: 'Mural', Icon: Newspaper, end: false },
  { to: '/area/perfil', label: 'Meu Perfil', Icon: UserRound, end: false },
  { to: '/area/mensagens', label: 'Mensagens', Icon: MessageSquare, end: false },
  { to: '/area/pedidos', label: 'Pedidos', Icon: ClipboardList, end: false },
] as const

/** Moldura da Área do Profissional: barra superior escura + navegação inferior (pensada para o celular). */
const SEEN = 'mdm_pedidos_seen'
const readSeen = () => { try { return localStorage.getItem(SEEN) === '1' } catch { return false } }

export default function AreaShell({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0)
  const { pathname } = useLocation()
  const [seen, setSeen] = useState(readSeen) // destaque leve em "Pedidos" até a pessoa abrir a tela
  useEffect(() => { if (pathname === '/area/pedidos' && !seen) { try { localStorage.setItem(SEEN, '1') } catch { /* sem storage */ } setSeen(true) } }, [pathname, seen])
  useEffect(() => {
    const load = () => api.get<{ unread: number }>('/pro/messages/unread').then((r) => setUnread(r.unread)).catch(() => {})
    void load()
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pathname])

  return (
    <div className="min-h-dvh bg-ice">
      <header className="sticky top-0 z-30 bg-graphite pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-lg items-center px-5"><Logo /></div>
      </header>
      <main className="mx-auto max-w-lg px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6">{children}</main>
      <nav aria-label="Área do profissional" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${isActive ? 'text-graphite' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-lime' : ''}`}><Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" /></span>
                    {label}
                    {to === '/area/pedidos' && !seen && (
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
