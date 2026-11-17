import RechargeCard, { type Recharge } from './RechargeCard'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ArrowRight, Bell, ClipboardList, House, MessageSquare, Newspaper, UserRound } from 'lucide-react'
import Logo from '../components/Logo'
import { api } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

const TABS = [
  { to: '/area', label: 'Início', Icon: House, end: true },
  { to: '/area/pedidos', label: 'Pedidos', Icon: ClipboardList, end: false },
  { to: '/area/mural', label: 'Mural', Icon: Newspaper, end: false },
  { to: '/area/perfil', label: 'Meu Perfil', Icon: UserRound, end: false },
  { to: '/area/mensagens', label: 'Mensagens', Icon: MessageSquare, end: false },
 ] as const

/** Moldura da Área do Profissional: barra superior escura + navegação inferior (pensada para o celular). */

export default function AreaShell({ children }: { children: ReactNode }) {
  const {user}=useAuth()
  const [unread, setUnread] = useState(0)
  const { pathname } = useLocation()
  const [recharge,setRecharge]=useState<Recharge|null>(null)
  const [pending, setPending] = useState(0)
  const [urgent, setUrgent] = useState(0)
  useEffect(() => {
    const load = () => api.get<{ unread: number }>('/pro/messages/unread').then((r) => setUnread(r.unread)).catch(() => {})
    void load()
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pathname])

  useEffect(() => {
    let alive = true
    const refresh = () => { if (document.visibilityState !== 'visible') return; api.get<{ allowed: boolean; recharge?:Recharge; items: { interested: boolean; urgency: string }[] }>('/pro/requests').then(r => {
      if (!alive) return
      setRecharge(r.recharge??null)
      const active = r.allowed ? r.items.filter(i => !i.interested) : []
      setPending(active.length)
      setUrgent(active.filter(i => i.urgency === 'urgent').length)
    }).catch(() => {}) }
    refresh()
    const timer = window.setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('mdm:interest', refresh)
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('mdm:interest', refresh) }
  }, [pathname])

  return (
    <div className="min-h-dvh bg-ice">
      <header className="sticky top-0 z-30 bg-graphite pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-lg items-center px-5"><Logo /></div>
      </header>
      {/* Perfil e Mensagens têm dados pessoais: o Clarity não grava o conteúdo destas telas */}
      <main data-clarity-mask={pathname.startsWith('/area/perfil') || pathname.startsWith('/area/mensagens') ? 'true' : undefined} className="mx-auto max-w-lg px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-4">
        {pending > 0 && pathname !== '/area/pedidos' && <Link to="/area/pedidos" className="mb-5 flex items-center gap-3 rounded-3xl border-2 border-graphite bg-lime p-4 text-graphite shadow-sm">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-graphite text-lime"><Bell size={24} aria-hidden="true" /></span>
          <span className="flex-1"><span className="block text-[12px] font-bold uppercase tracking-wide">{user?.isAdmin?'Painel mestre':urgent ? 'Pedido urgente disponível!' : 'Nova oportunidade!'}</span><span className="block text-[19px] font-bold leading-tight">{pending} {user?.isAdmin?(pending===1?'pedido publicado':'pedidos publicados'):pending === 1 ? 'pedido para você' : 'pedidos para você'}</span><span className="block text-[13px] font-semibold">{user?.isAdmin?'Veja e gerencie as solicitações':'Veja os detalhes e manifeste interesse'}</span></span>
          <ArrowRight size={22} className="shrink-0" aria-hidden="true" />
        </Link>}
        {pathname==='/area' && <div className="mb-3"><RechargeCard r={recharge} master={user?.isAdmin}/></div>}
        {children}</main>
      <nav aria-label="Área do profissional" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white shadow-sm pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${isActive ? 'text-graphite' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-lime' : ''}`}><Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" /></span>
                    {label}
                    {to === '/area/pedidos' && pending > 0 && <span aria-label={`${pending} pedidos aguardando resposta`} className="absolute right-[17%] top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-white">{pending > 99 ? '99+' : pending}</span>}
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
