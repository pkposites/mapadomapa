import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import AdminGate from '../admin/AdminGate'
import { api, ApiError } from '../lib/api'

type Cm = { id: string; body: string; hidden: boolean; at: string; authorName: string | null }
type Item = { id: string; body: string; hidden: boolean; hiddenReason: string | null; at: string; reports: number; comments: number; authorId: string; authorName: string | null; authorPhone: string | null }
export default function AdminMural() { return <AdminGate><Page /></AdminGate> }
function Page() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<{ id: string; items: Cm[] } | null>(null)
  const showComments = async (id: string) => { if (open?.id === id) return setOpen(null); setOpen({ id, items: (await api.get<{ items: Cm[] }>(`/admin/feed/${id}/comments`)).items }) }
  const hideComment = async (pid: string, cid: string, hidden: boolean) => setOpen({ id: pid, items: (await api.put<{ items: Cm[] }>(`/admin/feed/comments/${cid}`, { hidden })).items })
  useEffect(() => { api.get<{ items: Item[] }>('/admin/feed').then((r) => setItems(r.items)).catch(() => setItems([])) }, [])
  const set = async (id: string, hidden: boolean) => {
    let reason = ''
    if (hidden) { const r = window.prompt('Motivo para ocultar (opcional):'); if (r === null) return; reason = r }
    setErr(null)
    try { setItems((await api.put<{ items: Item[] }>(`/admin/feed/${id}`, { hidden, reason })).items) } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') }
  }
  return (
    <><Header variant="page" /><main className="bg-ice"><div className="mx-auto max-w-2xl px-5 pb-10 pt-4 md:pt-8">
      <Link to="/admin" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={20} aria-hidden="true" /> Voltar</Link>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">Mural</h1>
      <p className="mt-1 text-[15px] text-muted">Postagens com denúncias aparecem primeiro. Ocultar tira a postagem do mural dos profissionais.</p>
      {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
      {!items && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {items?.length === 0 && <p className="mt-6 text-center text-muted">Nenhuma postagem ainda.</p>}
      <ul className="mt-5 space-y-3">{items?.map((p) => (
        <li key={p.id} className={`rounded-2xl p-4 ${p.hidden ? 'bg-white/60' : 'bg-white'}`}>
          <p className="text-[15px] font-semibold">{p.authorName ?? 'Sem nome'} <span className="font-normal text-muted">· {p.authorPhone} · {new Date(p.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></p>
          <p className="mt-2 whitespace-pre-line break-words text-[15px]">{p.body}</p>
          <p className="mt-2 text-[13px] text-muted">{p.reports > 0 && <strong className="text-danger">{p.reports} denúncia(s) · </strong>}{p.hidden ? `Oculta${p.hiddenReason ? `: ${p.hiddenReason}` : ''}` : 'Visível'}</p>
          <div className="mt-2 flex gap-4">
            <button type="button" onClick={() => void set(p.id, !p.hidden)} className="min-h-11 text-[14px] font-semibold underline">{p.hidden ? 'Mostrar de novo' : 'Ocultar'}</button>
            {p.comments > 0 && <button type="button" onClick={() => void showComments(p.id)} className="min-h-11 text-[14px] font-semibold underline">{open?.id === p.id ? 'Fechar comentários' : `Comentários (${p.comments})`}</button>}
            <Link to={`/admin/profissionais/${p.authorId}`} className="inline-flex min-h-11 items-center text-[14px] font-semibold underline">Ver profissional</Link>
          </div>
          {open?.id === p.id && <ul className="mt-2 space-y-2 border-t border-line pt-2">{open.items.map((c) => (
            <li key={c.id} className="text-[14px]"><strong>{c.authorName ?? 'Sem nome'}:</strong> {c.body}{c.hidden && <em className="text-muted"> (oculto)</em>}{' '}
              <button type="button" onClick={() => void hideComment(p.id, c.id, !c.hidden)} className="min-h-11 font-semibold underline">{c.hidden ? 'Mostrar' : 'Ocultar'}</button></li>))}</ul>}
        </li>))}</ul>
    </div></main><Footer /></>
  )
}
