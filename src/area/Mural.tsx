import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Heart, MessageCircle, Send, Trash2 } from 'lucide-react'
import Alert from '../components/ui/Alert'
import Avatar from './Avatar'
import { api, ApiError } from '../lib/api'

type Post = { id: string; name: string; professions: string[]; body: string; at: string; mine: boolean; likes: number; liked: boolean; comments: number }
type Comment = { id: string; name: string; professions: string[]; body: string; at: string; mine: boolean }
type Feed = { allowed: boolean; canInteract: boolean; canPost: boolean; needsName: boolean; myName: string | null; lockedNote: string | null; items: Post[]; hasMore: boolean }
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
const msgOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Não foi possível concluir.')

function Comments({ post, canInteract, myName, onCount }: { post: Post; canInteract: boolean; myName: string | null; onCount: (n: number) => void }) {
  const [items, setItems] = useState<Comment[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.get<{ items: Comment[] }>(`/pro/feed/${post.id}/comments`).then((r) => setItems(r.items)).catch(() => setItems([])) }, [post.id])
  const send = async () => {
    setBusy(true); setErr(null)
    try { const r = await api.post<{ items: Comment[] }>(`/pro/feed/${post.id}/comments`, { body: text }); setItems(r.items); onCount(r.items.length); setText('') } catch (e) { setErr(msgOf(e)) } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="comments">
      {items === null && <p className="text-[13px] text-muted">Carregando…</p>}
      <ul className="space-y-3">
        {items?.map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar name={c.name} size={32} />
            <div className="min-w-0 flex-1 rounded-2xl bg-ice px-3.5 py-2.5">
              <p className="text-[14px] font-semibold leading-tight">{c.name} <span className="font-normal text-muted">· {c.professions.join(' · ') || 'Profissional'} · {ago(c.at)}</span></p>
              <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug">{c.body}</p>
              {c.mine && <button type="button" className="mt-1 text-[12px] text-muted underline" onClick={async () => { try { await api.del(`/pro/feed/comments/${c.id}`); const n = (items ?? []).filter((x) => x.id !== c.id); setItems(n); onCount(n.length) } catch (e) { setErr(msgOf(e)) } }}>Excluir</button>}
            </div>
          </li>
        ))}
      </ul>
      {canInteract && myName && (
        <div className="mt-3 flex items-end gap-2">
          <Avatar name={myName} size={32} />
          <label className="sr-only" htmlFor={`c-${post.id}`}>Comentar</label>
          <input id={`c-${post.id}`} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim().length >= 2 && !busy) void send() }} placeholder="Escreva um comentário…"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[15px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
          <button type="button" aria-label="Enviar comentário" disabled={busy || text.trim().length < 2} onClick={send} className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-graphite disabled:opacity-50"><Send size={18} aria-hidden="true" /></button>
        </div>
      )}
      {canInteract && !myName && <p className="mt-3 text-[13px] text-muted">Informe seu nome no <Link to="/area/perfil" className="font-semibold underline">perfil</Link> para comentar.</p>}
      {err && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{err}</p>}
    </div>
  )
}

function PostCard({ p, f, update, remove, note }: { p: Post; f: Feed; update: (n: Post) => void; remove: () => void; note: (m: { tone: 'success' | 'error'; text: string }) => void }) {
  const [open, setOpen] = useState(false)
  const toggleLike = async () => {
    if (!f.canInteract) return note({ tone: 'error', text: f.lockedNote ?? 'Disponível após a aprovação.' })
    const next = !p.liked
    update({ ...p, liked: next, likes: p.likes + (next ? 1 : -1) }) // resposta imediata
    try { const r = await api.put<{ likes: number; liked: boolean }>(`/pro/feed/${p.id}/like`, { liked: next }); update({ ...p, liked: r.liked, likes: r.likes }) } catch (e) { update(p); note({ tone: 'error', text: msgOf(e) }) }
  }
  return (
    <li className="py-4" data-testid="post">
      <div className="flex items-start gap-3">
        <Avatar name={p.name} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-tight">{p.name}{p.mine && <span className="ml-2 rounded-full bg-ice px-2 py-0.5 text-[12px] font-medium text-muted">você</span>}</p>
          <p className="text-[13px] text-muted">{p.professions.join(' · ') || 'Profissional'} · {ago(p.at)}</p>
        </div>
        {p.mine
          ? <button type="button" aria-label="Excluir postagem" onClick={() => { if (window.confirm('Excluir esta postagem?')) void api.del(`/pro/feed/${p.id}`).then(remove).catch((e) => note({ tone: 'error', text: msgOf(e) })) }} className="grid size-11 place-items-center text-muted"><Trash2 size={17} aria-hidden="true" /></button>
          : <button type="button" aria-label="Denunciar postagem" onClick={() => { if (!f.canInteract) return note({ tone: 'error', text: f.lockedNote ?? '' }); if (window.confirm('Denunciar esta postagem para a equipe?')) void api.post(`/pro/feed/${p.id}/report`).then(() => note({ tone: 'success', text: 'Denúncia enviada. A equipe vai analisar.' })).catch((e) => note({ tone: 'error', text: msgOf(e) })) }} className="grid size-11 place-items-center text-muted"><Flag size={16} aria-hidden="true" /></button>}
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-[17px] leading-snug">{p.body}</p>
      <div className="mt-3 flex items-center gap-1 text-[14px]">
        <button type="button" aria-pressed={p.liked} onClick={toggleLike} data-testid="like" className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold transition active:scale-95 ${p.liked ? 'text-[#c4261d]' : 'text-muted'}`}>
          <Heart size={19} fill={p.liked ? 'currentColor' : 'none'} aria-hidden="true" /> {p.likes > 0 ? p.likes : ''}<span className="sr-only"> Curtir</span>
        </button>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="comment-toggle" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-muted">
          <MessageCircle size={19} aria-hidden="true" /> {p.comments > 0 ? p.comments : ''}<span className="sr-only"> Comentários</span>
        </button>
      </div>
      {open && <Comments post={p} canInteract={f.canInteract} myName={f.myName} onCount={(n) => update({ ...p, comments: n })} />}
    </li>
  )
}

/** Mural dos profissionais (estilo rede social): só nome, profissão e texto. Sem acesso a perfis. */
export default function Mural({ compact = false }: { compact?: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { api.get<Feed>('/pro/feed').then(setFeed).catch(() => setFeed(null)) }, [])
  if (!feed) return null

  const items = compact ? feed.items.slice(0, 3) : feed.items
  const publish = async () => {
    setBusy(true); setMsg(null)
    try { setFeed(await api.post<Feed>('/pro/feed', { body: text })); setText('') } catch (e) { setMsg({ tone: 'error', text: msgOf(e) }) } finally { setBusy(false) }
  }
  const more = async () => { try { const r = await api.get<Feed>(`/pro/feed?before=${feed.items.at(-1)!.id}`); setFeed({ ...feed, items: [...feed.items, ...r.items], hasMore: r.hasMore }) } catch (e) { setMsg({ tone: 'error', text: msgOf(e) }) } }
  const first = feed.myName?.split(/\s+/)[0]

  return (
    <section className="rounded-3xl bg-white p-5" aria-label="Mural dos profissionais" data-testid="mural">
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-bold tracking-tight">Mural dos profissionais</h2>
        {compact && <Link to="/area/mural" className="text-[14px] font-semibold underline decoration-lime decoration-2 underline-offset-4">Ver tudo</Link>}
      </div>

      {feed.canPost ? (
        <div className="mt-4 flex gap-3">
          <Avatar name={feed.myName!} />
          <div className="min-w-0 flex-1">
            <label htmlFor="post" className="sr-only">Nova postagem</label>
            <textarea id="post" ref={box} rows={text ? 3 : 2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder={`O que você quer compartilhar, ${first}?`}
              className="block w-full resize-none rounded-2xl bg-ice p-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
            {text && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">{text.length}/600</span>
                <button type="button" disabled={busy || text.trim().length < 3} onClick={publish} data-testid="post-send" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-lime px-5 font-semibold text-graphite disabled:opacity-60"><Send size={16} aria-hidden="true" /> Publicar</button>
              </div>
            )}
            {!text && <p className="mt-1 text-[12px] text-muted">Sem telefone, e-mail ou links.</p>}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-ice p-3 text-[14px] leading-snug">
          {feed.needsName ? <>Para publicar, <Link to="/area/perfil" className="font-semibold underline">informe seu nome no perfil</Link>.</> : feed.lockedNote}
        </p>
      )}
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <ul className="mt-2 divide-y divide-line" data-testid="posts">
        {items.length === 0 && <li className="py-6 text-center text-[15px] text-muted">Ainda não há postagens. {feed.canPost ? 'Seja o primeiro a publicar!' : 'Volte em breve.'}</li>}
        {items.map((p) => (
          <PostCard key={p.id} p={p} f={feed} note={setMsg}
            update={(n) => setFeed((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === n.id ? n : x)) })}
            remove={() => setFeed((cur) => cur && { ...cur, items: cur.items.filter((x) => x.id !== p.id) })} />
        ))}
      </ul>
      {!compact && feed.hasMore && <button type="button" onClick={more} className="min-h-11 w-full rounded-2xl border border-line text-[15px] font-semibold">Ver postagens anteriores</button>}
      {compact && (feed.hasMore || feed.items.length > 3) && <Link to="/area/mural" className="mt-1 flex min-h-11 items-center justify-center rounded-2xl border border-line text-[15px] font-semibold">Ver mais no mural</Link>}
    </section>
  )
}
