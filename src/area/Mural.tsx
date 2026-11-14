import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Lock, Send, Trash2 } from 'lucide-react'
import Alert from '../components/ui/Alert'
import { api, ApiError } from '../lib/api'

type Post = { id: string; name: string; professions: string[]; body: string; at: string; mine: boolean }
type Feed = { allowed: boolean; canPost: boolean; needsName: boolean; items: Post[]; hasMore: boolean }
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/** Mural dos profissionais: só nome, profissão e texto. Não há link nem acesso ao perfil de ninguém. */
export default function Mural() {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => { api.get<Feed>('/pro/feed').then(setFeed).catch(() => setFeed(null)) }, [])
  if (!feed) return null

  if (!feed.allowed) {
    return (
      <section className="rounded-3xl bg-white p-5" aria-label="Mural dos profissionais" data-testid="mural-locked">
        <p className="flex items-center gap-2 text-[18px] font-bold"><Lock size={18} aria-hidden="true" /> Mural dos profissionais</p>
        <p className="mt-1 text-[15px] leading-snug text-muted">Um espaço para trocar ideias com outros profissionais. Ele libera para você depois da aprovação do seu cadastro.</p>
      </section>
    )
  }
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ tone: 'success', text: ok }) } catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível concluir.' }) } }
  const publish = async () => {
    setBusy(true)
    await act(async () => { setFeed(await api.post<Feed>('/pro/feed', { body: text })); setText('') })
    setBusy(false)
  }
  const more = () => act(async () => { const r = await api.get<Feed>(`/pro/feed?before=${feed.items.at(-1)!.id}`); setFeed({ ...feed, items: [...feed.items, ...r.items], hasMore: r.hasMore }) })

  return (
    <section className="rounded-3xl bg-white p-5" aria-label="Mural dos profissionais" data-testid="mural">
      <p className="text-[18px] font-bold">Mural dos profissionais</p>
      <p className="mt-1 text-[14px] leading-snug text-muted">Converse com outros profissionais. Só aparecem nome, profissão e texto. Não inclua telefone, e-mail ou links.</p>

      {feed.needsName
        ? <p className="mt-3 rounded-2xl bg-ice p-3 text-[14px]">Para publicar, <Link to="/area/perfil" className="font-semibold underline">informe seu nome no perfil</Link>.</p>
        : (
          <div className="mt-3">
            <label htmlFor="post" className="sr-only">Nova postagem</label>
            <textarea id="post" rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="Compartilhe uma dica, dúvida ou novidade…"
              className="block w-full resize-none rounded-2xl border border-line p-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">{text.length}/600</span>
              <button type="button" disabled={busy || text.trim().length < 3} onClick={publish} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-lime px-5 font-semibold text-graphite disabled:opacity-60" data-testid="post-send"><Send size={16} aria-hidden="true" /> Publicar</button>
            </div>
          </div>
        )}
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <ul className="mt-4 divide-y divide-line" data-testid="posts">
        {feed.items.length === 0 && <li className="py-4 text-center text-[15px] text-muted">Ainda não há postagens. Seja o primeiro!</li>}
        {feed.items.map((p) => (
          <li key={p.id} className="py-4">
            <p className="text-[15px] font-semibold">{p.name}{p.mine && <span className="ml-2 rounded-full bg-ice px-2 py-0.5 text-[12px] font-medium text-muted">você</span>}</p>
            <p className="text-[13px] text-muted">{p.professions.join(' · ') || 'Profissional'} · {ago(p.at)}</p>
            <p className="mt-2 whitespace-pre-line break-words text-[16px] leading-snug">{p.body}</p>
            <div className="mt-1 flex justify-end">
              {p.mine
                ? <button type="button" onClick={() => { if (window.confirm('Excluir esta postagem?')) void act(async () => { await api.del(`/pro/feed/${p.id}`); setFeed({ ...feed, items: feed.items.filter((x) => x.id !== p.id) }) }) }} className="inline-flex min-h-11 items-center gap-1 px-2 text-[13px] text-muted"><Trash2 size={14} aria-hidden="true" /> Excluir</button>
                : <button type="button" onClick={() => { if (window.confirm('Denunciar esta postagem para a equipe?')) void act(() => api.post(`/pro/feed/${p.id}/report`), 'Denúncia enviada. A equipe vai analisar.') }} className="inline-flex min-h-11 items-center gap-1 px-2 text-[13px] text-muted"><Flag size={14} aria-hidden="true" /> Denunciar</button>}
            </div>
          </li>
        ))}
      </ul>
      {feed.hasMore && <button type="button" onClick={more} className="min-h-11 text-[15px] font-semibold underline decoration-lime decoration-2 underline-offset-4">Ver postagens anteriores</button>}
    </section>
  )
}
