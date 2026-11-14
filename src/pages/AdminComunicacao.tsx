import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import AdminGate from '../admin/AdminGate'
import { api, ApiError } from '../lib/api'

const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <><Header variant="page" /><main className="bg-ice"><div className="mx-auto max-w-2xl px-5 pb-10 pt-4 md:pt-8">
    <Link to="/admin" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={20} aria-hidden="true" /> Voltar</Link>
    <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">{title}</h1>{children}</div></main><Footer /></>
)
const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

type Th = { id: string; name: string | null; phone: string; unread: number; lastAt: string; lastBody: string }
export function AdminMensagens() {
  return <AdminGate><Inbox /></AdminGate>
}
function Inbox() {
  const [items, setItems] = useState<Th[] | null>(null)
  useEffect(() => { api.get<{ items: Th[] }>('/admin/inbox').then((r) => setItems(r.items)).catch(() => setItems([])) }, [])
  return (
    <Shell title="Mensagens">
      {!items && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {items?.length === 0 && <p className="mt-6 text-center text-muted">Nenhuma conversa ainda. Você pode escrever a um profissional pela página dele.</p>}
      <ul className="mt-5 space-y-3">{items?.map((t) => (
        <li key={t.id}><Link to={`/admin/profissionais/${t.id}`} className="block rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-[17px] font-semibold">{t.name ?? t.phone}{t.unread > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[12px] text-white">{t.unread} nova(s)</span>}<span className="ml-auto text-[13px] font-normal text-muted">{fmt(t.lastAt)}</span></p>
          <p className="mt-1 text-[14px] text-muted">{t.lastBody}</p></Link></li>))}</ul>
    </Shell>
  )
}

type An = { id: string; title: string; body: string; published: boolean; at: string }
export function AdminComunicados() {
  return <AdminGate><Announcements /></AdminGate>
}
function Announcements() {
  const [items, setItems] = useState<An[] | null>(null)
  const [title, setTitle] = useState(''); const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.get<{ items: An[] }>('/admin/announcements').then((r) => setItems(r.items)).catch(() => setItems([])) }, [])
  const run = async (fn: () => Promise<{ items: An[] }>) => { setBusy(true); setErr(null); try { setItems((await fn()).items) } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(false) } }
  return (
    <Shell title="Comunicados">
      <form className="mt-5 rounded-3xl bg-white p-5" onSubmit={(e) => { e.preventDefault(); void run(() => api.post('/admin/announcements', { title, body }).then((r) => { setTitle(''); setBody(''); return r as { items: An[] } })) }}>
        <label htmlFor="t" className="block text-[15px] font-semibold">Título</label>
        <input id="t" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 block min-h-13 w-full rounded-2xl border border-line px-4 text-[16px]" />
        <label htmlFor="b" className="mt-4 block text-[15px] font-semibold">Texto</label>
        <textarea id="b" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className="mt-2 block w-full rounded-2xl border border-line p-3 text-[16px]" />
        {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
        <div className="mt-4"><SubmitButton loading={busy} disabled={title.trim().length < 3 || body.trim().length < 3}>Publicar para todos os profissionais</SubmitButton></div>
      </form>
      {!items && <div className="mt-8 flex justify-center"><Spinner /></div>}
      <ul className="mt-5 space-y-3">{items?.map((a) => (
        <li key={a.id} className="rounded-2xl bg-white p-4">
          <p className="text-[16px] font-semibold">{a.title} <span className="text-[13px] font-normal text-muted">· {fmt(a.at)}{!a.published && ' · oculto'}</span></p>
          <p className="mt-1 whitespace-pre-line text-[14px] text-muted">{a.body}</p>
          <button type="button" className="mt-2 min-h-11 text-[14px] font-semibold underline" onClick={() => void run(() => api.put(`/admin/announcements/${a.id}`, { published: !a.published }) as Promise<{ items: An[] }>)}>{a.published ? 'Ocultar' : 'Publicar de novo'}</button>
        </li>))}</ul>
    </Shell>
  )
}
