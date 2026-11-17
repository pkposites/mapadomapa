import { RechargeSettings } from '../admin/Recharge'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, ClipboardList, Megaphone, MessageCircle, MessageSquare, ShieldAlert, Search } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import AdminGate from '../admin/AdminGate'
import WelcomeBox from '../admin/WelcomeBox'
import { personalize, TEMPLATES, waUrl } from '../admin/contact'
import StatusBadge from '../admin/StatusBadge'
import { STATUS_LABEL, type Item, type Stats, type Status } from '../admin/types'
import { api, ApiError } from '../lib/api'

const ORDER: Status[] = ['pending_review', 'approved', 'needs_changes', 'rejected', 'suspended', 'not_submitted']

/** Painel administrativo: resumo por situação + lista de profissionais. */
export default function Admin() {
  return <AdminGate><Panel /></AdminGate>
}

function Panel() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [status, setStatus] = useState<Status | ''>('pending_review')
  const [q, setQ] = useState('')
  const [unver, setUnver] = useState(false) // só celulares ainda não verificados
  const [items, setItems] = useState<Item[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (reset: boolean, p = 1) => {
    setBusy(true); setErr(null)
    try {
      const r = await api.get<{ items: Item[]; page: number; hasMore: boolean }>(`/admin/professionals?status=${status}&q=${encodeURIComponent(q)}&page=${p}${unver ? '&phone=unverified' : ''}`)
      setItems((cur) => (reset ? r.items : [...cur, ...r.items])); setPage(r.page); setMore(r.hasMore)
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Não foi possível carregar a lista.') } finally { setBusy(false) }
  }, [status, q, unver])

  const [welcome, setWelcome] = useState<{ template: string; total: number; pending: number } | null>(null)
  useEffect(() => { api.get<Stats>('/admin/stats').then(setStats).catch(() => undefined); api.get<{ template: string; total: number; pending: number }>('/admin/welcome').then(setWelcome).catch(() => undefined) }, [])
  useEffect(() => { const t = setTimeout(() => void load(true), q ? 350 : 0); return () => clearTimeout(t) }, [load, q])

  return (
    <>
      <Header variant="page" />
      <main className="bg-ice">
        <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 md:pt-10">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Administração</p>
          <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.02em]">Profissionais</h1>
          <p className="mt-1 text-[15px] text-muted">Nenhum profissional aparece ao público sem a sua aprovação.</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/admin/mensagens" className="flex min-h-14 items-center gap-2 rounded-2xl bg-graphite px-4 font-semibold text-white"><MessageSquare size={18} aria-hidden="true" /> Mensagens{stats && stats.unreadMessages > 0 && <span className="ml-auto rounded-full bg-lime px-2 text-[13px] text-graphite">{stats.unreadMessages}</span>}</Link>
            <Link to="/admin/pedidos" data-testid="link-pedidos" className="col-span-2 flex min-h-14 items-center gap-2 rounded-2xl bg-lime px-4 font-semibold text-graphite"><ClipboardList size={18} aria-hidden="true" /> Pedidos de Serviços</Link>
            <Link to="/admin/mural" className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-4 font-semibold"><MessageSquare size={18} aria-hidden="true" /> Mural</Link>
            <Link to="/admin/destaque" className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-4 font-semibold"><Megaphone size={18} aria-hidden="true" /> Interesse no Destaque</Link>
            <Link to="/admin/comunicados" className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-4 font-semibold"><Megaphone size={18} aria-hidden="true" /> Comunicados</Link>
          </div>

          <RechargeSettings />
          {welcome && (
            <section className="mt-4 rounded-2xl bg-white p-4" aria-label="Boas-vindas coletivas">
              <p className="text-[15px] font-semibold">Boas-vindas para todos</p>
              <p className="mb-3 mt-1 text-[14px] text-muted">{welcome.pending} de {welcome.total} profissional(is) ainda não receberam as boas-vindas.</p>
              <WelcomeBox openLabel="Enviar boas-vindas para todos" template={welcome.template}
                disabledReason={welcome.pending === 0 ? 'Todos os profissionais já receberam as boas-vindas.' : null}
                confirmText={`Enviar para ${welcome.pending} profissional(is)? Quem já recebeu não receberá de novo.`}
                send={async (body) => { const r = await api.post<{ sent: number; alreadyHad: number }>('/admin/welcome-all', { body }); setWelcome(await api.get('/admin/welcome')); return `Enviadas: ${r.sent}. Já tinham recebido antes: ${r.alreadyHad}.` }} />
            </section>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3" role="group" aria-label="Filtrar por situação">
            {ORDER.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}
                className={`min-h-16 rounded-2xl border p-3 text-left transition duration-150 active:scale-[0.98] ${status === s ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>
                <span className="block text-[24px] font-bold leading-none">{stats?.byStatus[s] ?? '–'}</span>
                <span className={`mt-1 block text-[13px] ${status === s ? 'text-on-dark' : 'text-muted'}`}>{STATUS_LABEL[s]}</span>
              </button>
            ))}
          </div>
          {stats && stats.unverifiedPhones > 0 && (
            <button type="button" aria-pressed={unver} onClick={() => setUnver((v) => !v)} data-testid="filter-unverified" className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-medium ${unver ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>
              <ShieldAlert size={18} aria-hidden="true" /> {unver ? 'Mostrando só celulares não verificados' : `${stats.unverifiedPhones} celular(es) não verificado(s) — filtrar`}
            </button>
          )}

          <label htmlFor="q" className="mt-5 block text-[15px] font-semibold">Buscar por celular</label>
          <div className="relative mt-2">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input id="q" inputMode="tel" placeholder="Ex.: 91234" value={q} onChange={(e) => setQ(e.target.value)}
              className="min-h-13 w-full rounded-2xl border border-line bg-white pl-12 pr-4 text-[17px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
          </div>

          {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}
          <ul className="mt-5 space-y-3">
            {items.map((i) => (
              <li key={i.id} className="rounded-2xl bg-white">
                <Link to={`/admin/profissionais/${i.id}`} className="block p-4 pb-3 transition duration-150 active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[17px] font-semibold">{i.name ?? i.phone}{i.unread > 0 && <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-[12px] text-white">{i.unread} msg</span>}</p>
                      {i.name && <p className="text-[14px] text-muted">{i.phone}</p>}
                      <p className="mt-0.5 text-[14px] text-muted">{i.professions.join(' · ') || 'Sem profissão escolhida'}</p>
                      <p className="text-[14px] text-muted">{i.regions.join(' · ') || 'Sem região'}</p>
                    </div>
                    <ChevronRight size={22} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={i.reviewStatus} />
                    {!i.phoneVerified && <span className="inline-flex min-h-7 items-center rounded-full border border-line px-3 text-[13px] text-muted">Celular não verificado</span>}
                    {i.bestScore !== null && <span className="text-[13px] font-semibold">Nota técnica {i.bestScore}</span>}
                    {i.flagged > 0 && <span className="flex items-center gap-1 text-[13px] font-semibold text-danger"><AlertTriangle size={14} aria-hidden="true" /> {i.flagged} alerta(s)</span>}
                  </div>
                </Link>
                <div className="flex items-center gap-3 px-4 pb-3">
                  <a href={waUrl(i.whatsapp, personalize((i.phoneVerified ? TEMPLATES[1] : TEMPLATES[0]).text, i.name))} target="_blank" rel="noopener noreferrer" data-testid="list-whatsapp"
                    onClick={() => { void fetch(`/api/admin/professionals/${i.id}/whatsapp-log`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined) }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25d366] px-4 text-[14px] font-semibold text-graphite"><MessageCircle size={16} aria-hidden="true" /> WhatsApp</a>
                  <span className="text-[12px] text-muted">{i.phoneVerified ? 'Boas-vindas' : 'Confirmar celular'}</span>
                </div>
              </li>
            ))}
          </ul>
          {busy && <div className="mt-6 flex justify-center"><Spinner /></div>}
          {!busy && items.length === 0 && !err && <p className="mt-8 text-center text-[16px] text-muted">Nenhum cadastro nesta situação.</p>}
          {more && <div className="mt-4"><SubmitButton variant="ghost" className="border border-line" onClick={() => void load(false, page + 1)}>Carregar mais</SubmitButton></div>}
        </div>
      </main>
      <Footer />
    </>
  )
}
