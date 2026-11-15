import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Heart, MessageCircle, MoreHorizontal, PenSquare, Send, Trash2 } from 'lucide-react'
import Alert from '../components/ui/Alert'
import { SkeletonList } from '../components/ui/Skeleton'
import { buzz, toast } from '../lib/toast'
import Avatar, { StaffBadge } from './Avatar'
import { api, ApiError } from '../lib/api'

export type Post = { id: string; title: string | null; topic: string; name: string; staff: boolean; professions: string[]; body: string; at: string; mine: boolean; likes: number; liked: boolean; comments: number }
export type Comment = { id: string; name: string; staff: boolean; professions: string[]; body: string; at: string; mine: boolean }
export type Topic = { id: string; label: string }
export type Access = { canInteract: boolean; canPost: boolean; needsName: boolean; isStaff: boolean; myName: string | null; lockedNote: string | null; topics: Topic[]; maxPost: number; maxComment: number }
type Feed = Access & { items: Post[]; hasMore: boolean }

export const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
export const msgOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Não foi possível concluir.')
export const postTitle = (p: Post) => p.title ?? (p.body.length > 70 ? `${p.body.slice(0, 70)}…` : p.body)
const STARTERS: Record<string, string> = { duvida: 'Dúvida: ', servico: 'Serviço realizado: ', dica: 'Dica: ', novidade: 'Novidade: ', indicacao: 'Indicação: ', outro: '' }
const EXAMPLES: Record<string, string> = {
  duvida: 'Ex.: Qual tinta usar em parede com mofo?', servico: 'Ex.: Reforma de banheiro concluída na Vila Mariana', dica: 'Ex.: Como evitar mofo em armário embutido',
  novidade: 'Ex.: Chegou uma ferramenta nova na minha equipe', indicacao: 'Ex.: Indico loja de material elétrico na Zona Sul', outro: 'Dê um título ao seu post',
}
export const TopicPill = ({ topics, id }: { topics: Topic[]; id: string }) => <span className="inline-block rounded-full bg-ice px-2.5 py-0.5 text-[12px] font-semibold text-graphite" data-testid="topic-pill">{topics.find((t) => t.id === id)?.label ?? 'Outro assunto'}</span>
export const Author = ({ p }: { p: { name: string; staff: boolean; professions: string[]; at: string } }) => (
  <>
    <p className="text-[16px] font-semibold leading-tight">{p.name} {p.staff && <StaffBadge />}</p>
    <p className="text-[13px] text-muted">{p.staff ? 'Administração' : (p.professions.join(' · ') || 'Profissional')} · {ago(p.at)}</p>
  </>
)

export function LikeButton({ p, access, update, note }: { p: Post; access: Access; update: (n: Post) => void; note?: (m: string) => void }) {
  const toggle = async () => {
    if (!access.canInteract) return // o aviso de liberação já está na tela (sem repetir)
    const next = !p.liked
    update({ ...p, liked: next, likes: p.likes + (next ? 1 : -1) })
    try { const r = await api.put<{ likes: number; liked: boolean }>(`/pro/feed/${p.id}/like`, { liked: next }); update({ ...p, liked: r.liked, likes: r.likes }) } catch (e) { update(p); note?.(msgOf(e)) }
  }
  return (
    <button type="button" aria-pressed={p.liked} aria-disabled={!access.canInteract} onClick={toggle} data-testid="like" className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition active:scale-95 ${p.liked ? 'text-[#c4261d]' : 'text-muted'} ${access.canInteract ? '' : 'opacity-60'}`}>
      <Heart size={24} fill={p.liked ? 'currentColor' : 'none'} aria-hidden="true" /> {p.likes > 0 ? p.likes : ''}<span className="sr-only"> Curtir</span>
    </button>
  )
}

export function CommentsBox({ postId, access, onCount }: { postId: string; access: Access; onCount?: (n: number) => void }) {
  const [items, setItems] = useState<Comment[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.get<{ items: Comment[] }>(`/pro/feed/${postId}/comments`).then((r) => setItems(r.items)).catch(() => setItems([])) }, [postId])
  const send = async () => {
    setBusy(true); setErr(null)
    try { const r = await api.post<{ items: Comment[] }>(`/pro/feed/${postId}/comments`, { body: text }); setItems(r.items); onCount?.(r.items.length); setText('') } catch (e) { setErr(msgOf(e)) } finally { setBusy(false) }
  }
  return (
    <div data-testid="comments">
      {items === null && <p className="text-[13px] text-muted">Carregando…</p>}
      {items?.length === 0 && <p className="text-[14px] text-muted">Nenhum comentário ainda.</p>}
      <ul className="space-y-3">
        {items?.map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar name={c.name} size={32} staff={c.staff} />
            <div className="min-w-0 flex-1 rounded-2xl bg-ice px-3.5 py-2.5">
              <p className="text-[14px] font-semibold leading-tight">{c.name} {c.staff && <StaffBadge />} <span className="font-normal text-muted">· {c.staff ? 'Administração' : (c.professions.join(' · ') || 'Profissional')} · {ago(c.at)}</span></p>
              <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug">{c.body}</p>
              {c.mine && <button type="button" className="mt-1 min-h-8 text-[12px] text-muted underline" onClick={async () => { try { await api.del(`/pro/feed/comments/${c.id}`); const n = (items ?? []).filter((x) => x.id !== c.id); setItems(n); onCount?.(n.length) } catch (e) { setErr(msgOf(e)) } }}>Excluir</button>}
            </div>
          </li>
        ))}
      </ul>
      {access.canInteract && access.myName && (
        <div className="mt-3 flex items-end gap-2">
          <Avatar name={access.myName} size={32} staff={access.isStaff} />
          <label className="sr-only" htmlFor={`c-${postId}`}>Comentar</label>
          <input id={`c-${postId}`} maxLength={access.maxComment} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim().length >= 2 && !busy) void send() }} placeholder="Escreva um comentário…"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[15px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
          <button type="button" aria-label="Enviar comentário" disabled={busy || text.trim().length < 2} onClick={send} className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-graphite disabled:opacity-50"><Send size={18} aria-hidden="true" /></button>
        </div>
      )}
      {!access.canInteract && <p className="mt-3 rounded-2xl bg-ice p-3 text-[13px] leading-snug">{access.lockedNote}</p>}
      {access.canInteract && !access.myName && <p className="mt-3 text-[13px] text-muted">Informe seu nome no <Link to="/area/perfil" className="font-semibold underline">perfil</Link> para comentar.</p>}
      {err && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{err}</p>}
    </div>
  )
}

function Composer({ access, onCreated }: { access: Access; onCreated: (f: Feed) => void }) {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pick = (id: string) => {
    const prev = STARTERS[topic] ?? ''
    if (!title.trim() || title === prev) setTitle(STARTERS[id] ?? '') // sugestão de título pelo tema (editável)
    setTopic(id)
  }
  const ok = topic && title.trim().length >= 3 && text.trim().length >= 3
  const publish = async () => {
    setBusy(true); setErr(null)
    try { const f = await api.post<Feed>('/pro/feed', { topic, title, body: text }); onCreated(f); setOpen(false); setTopic(''); setTitle(''); setText('') } catch (e) { setErr(msgOf(e)) } finally { setBusy(false) }
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="new-post" className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white px-3 text-left text-[16px] text-muted">
        <Avatar name={access.myName ?? '?'} size={36} staff={access.isStaff} /> <span className="flex-1">Criar um post…</span><PenSquare size={18} aria-hidden="true" />
      </button>
    )
  }
  return (
    <div className="rounded-2xl bg-white p-4" data-testid="composer">
      <p className="text-[15px] font-semibold">Sobre o que é o seu post?</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Tema do post">
        {access.topics.map((t) => <button key={t.id} type="button" aria-pressed={topic === t.id} onClick={() => pick(t.id)} className={`min-h-11 rounded-full border px-3.5 text-[14px] font-medium ${topic === t.id ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>{t.label}</button>)}
      </div>
      <label htmlFor="post-title" className="mt-4 block text-[15px] font-semibold">Título</label>
      <input id="post-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={EXAMPLES[topic] ?? 'Escolha um tema e dê um título'} className="mt-2 block min-h-12 w-full rounded-2xl border border-line px-4 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
      <label htmlFor="post-body" className="mt-4 block text-[15px] font-semibold">Texto</label>
      <textarea id="post-body" rows={5} maxLength={access.maxPost} value={text} onChange={(e) => setText(e.target.value)} placeholder="Conte os detalhes…" className="mt-2 block w-full resize-y rounded-2xl border border-line p-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
      <p className="mt-1 text-[12px] text-muted">{text.length}/{access.maxPost}{!access.isStaff && ' · sem telefone, e-mail ou links'}</p>
      {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-2xl border border-line font-semibold">Cancelar</button>
        <button type="button" disabled={busy || !ok} onClick={publish} data-testid="post-send" className="min-h-12 rounded-2xl bg-lime font-semibold text-graphite disabled:opacity-60">Publicar</button>
      </div>
    </div>
  )
}

type Story = { id: string; title: string; body: string; read: boolean }

/** Menu "⋯" do post: denunciar (ou excluir, se for seu). */
function PostMenu({ p, f, onDelete, note }: { p: Post; f: Feed; onDelete: () => void; note: (m: { tone: 'success' | 'error' | 'info'; text: string }) => void }) {
  const [open, setOpen] = useState(false)
  const item = 'flex min-h-11 w-full items-center gap-2 px-4 text-left text-[15px] font-medium'
  return (
    <div className="relative">
      <button type="button" aria-label="Mais opções" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-11 place-items-center text-graphite"><MoreHorizontal size={24} aria-hidden="true" /></button>
      {open && (
        <>
          <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-2 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lg">
            {p.mine
              ? <button role="menuitem" className={`${item} text-danger`} onClick={() => { setOpen(false); if (window.confirm('Excluir este post?')) void api.del(`/pro/feed/${p.id}`).then(onDelete).catch((e) => note({ tone: 'error', text: msgOf(e) })) }}><Trash2 size={18} aria-hidden="true" /> Excluir</button>
              : <button role="menuitem" className={`${item} ${f.canInteract ? '' : 'opacity-60'}`} onClick={() => { setOpen(false); if (!f.canInteract) return; if (window.confirm('Denunciar este post para a equipe?')) void api.post(`/pro/feed/${p.id}/report`).then(() => { toast('Denúncia enviada'); note({ tone: 'success', text: 'Denúncia enviada. A equipe vai analisar.' }) }).catch((e) => note({ tone: 'error', text: msgOf(e) })) }}><Flag size={18} aria-hidden="true" /> Denunciar</button>}
          </div>
        </>
      )}
    </div>
  )
}

/** Cartão de post, no estilo de rede social: cabeçalho, texto e ações. Toque duplo curte. */
function PostCard({ p, f, update, remove, note, compact }: { p: Post; f: Feed; update: (n: Post) => void; remove: () => void; note: (m: { tone: 'success' | 'error' | 'info'; text: string }) => void; compact: boolean }) {
  const [pop, setPop] = useState(0)
  const last = useRef(0)
  const like = async (force?: boolean) => {
    if (!f.canInteract) return
    const next = force ?? !p.liked
    if (next === p.liked) return
    update({ ...p, liked: next, likes: p.likes + (next ? 1 : -1) })
    buzz()
    try { const r = await api.put<{ likes: number; liked: boolean }>(`/pro/feed/${p.id}/like`, { liked: next }); update({ ...p, liked: r.liked, likes: r.likes }) } catch (e) { update(p); note({ tone: 'error', text: msgOf(e) }) }
  }
  const onTap = () => { const t = Date.now(); if (t - last.current < 350) { setPop((n) => n + 1); void like(true) } last.current = t }
  return (
    <article className="relative overflow-hidden rounded-2xl bg-white" data-testid="post">
      <div className="flex items-center gap-3 pl-3 pt-3">
        <Avatar name={p.name} staff={p.staff} size={40} />
        <div className="min-w-0 flex-1"><Author p={p} /></div>
        {!compact && <PostMenu p={p} f={f} onDelete={remove} note={note} />}
      </div>
      <div className="px-3 pb-1 pt-2" onClick={onTap} data-testid="post-body">
        <Link to={`/area/mural/${p.id}`} data-testid="post-link" className="block">
          <TopicPill topics={f.topics} id={p.topic} />
          <p className="mt-1.5 text-heading font-bold leading-snug tracking-[-0.01em]">{postTitle(p)}</p>
          {p.title && <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-small leading-snug text-muted">{p.body}</p>}
        </Link>
        {pop > 0 && <Heart key={pop} aria-hidden="true" fill="currentColor" size={84} className="pointer-events-none absolute left-1/2 top-1/2 -ml-[42px] -mt-[42px] animate-[heart-pop_.7s_ease-out_forwards] text-lime drop-shadow-lg" />}
      </div>
      <div className="flex items-center px-1 pb-2">
        <LikeButton p={p} access={f} update={update} note={(t) => note({ tone: 'info', text: t })} />
        <Link to={`/area/mural/${p.id}`} aria-label="Ver post e comentários" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-small font-semibold text-muted"><MessageCircle size={24} aria-hidden="true" /> {p.comments > 0 ? p.comments : ''}</Link>
      </div>
    </article>
  )
}

/** Faixa de "stories": comunicados da equipe (os profissionais não aparecem aqui). */
function Stories() {
  const [items, setItems] = useState<Story[] | null>(null)
  const [open, setOpen] = useState<Story | null>(null)
  useEffect(() => { api.get<{ items: Story[] }>('/pro/announcements').then((r) => setItems(r.items.slice(0, 8))).catch(() => setItems([])) }, [])
  if (!items || items.length === 0) return null
  return (
    <>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1" aria-label="Comunicados da equipe" data-testid="stories">
        {items.map((s) => (
          <li key={s.id} className="w-[72px] shrink-0 text-center">
            <button type="button" onClick={() => { setOpen(s); if (!s.read) void api.post('/pro/announcements/read').then(() => setItems((cur) => cur && cur.map((x) => ({ ...x, read: true })))).catch(() => undefined) }} className="block w-full">
              <span className={`mx-auto grid size-16 place-items-center rounded-full p-[3px] ${s.read ? 'bg-line' : 'bg-lime'}`}><span className="grid size-full place-items-center rounded-full border-2 border-ice bg-white"><img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 rounded-full" /></span></span>
              <span className="mt-1 block truncate text-tiny font-semibold">{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
          <div className="mx-auto w-full max-w-lg animate-[sheet-up_.22s_ease-out] rounded-t-3xl bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <p className="text-heading font-bold">{open.title}</p>
            <p className="mt-2 whitespace-pre-line text-body leading-snug text-muted">{open.body}</p>
            <button type="button" onClick={() => setOpen(null)} className="mt-4 min-h-12 w-full rounded-2xl bg-graphite font-semibold text-white">Fechar</button>
          </div>
        </div>
      )}
    </>
  )
}

/** Mural dos profissionais (estilo rede social): só nome, profissão e texto. Sem acesso a perfis. */
export default function Mural({ compact = false }: { compact?: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const seq = useRef(0) // resposta atrasada de um filtro antigo nunca sobrescreve o filtro atual
  useEffect(() => {
    const mine = ++seq.current
    api.get<Feed>(`/pro/feed${filter ? `?topic=${filter}` : ''}`).then((f) => { if (mine === seq.current) setFeed(f) }).catch(() => { if (mine === seq.current) setFeed((cur) => cur) })
  }, [filter])
  if (!feed) return compact ? null : <SkeletonList rows={3} tall />

  const items = compact ? feed.items.slice(0, 2) : feed.items
  const more = async () => { try { const r = await api.get<Feed>(`/pro/feed?before=${feed.items.at(-1)!.id}${filter ? `&topic=${filter}` : ''}`); setFeed({ ...feed, items: [...feed.items, ...r.items], hasMore: r.hasMore }) } catch (e) { setMsg({ tone: 'error', text: msgOf(e) }) } }
  const upd = (n: Post) => setFeed((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === n.id ? n : x)) })

  return (
    <section aria-label="Mural dos profissionais" data-testid="mural" className={compact ? '' : 'space-y-3'}>
      {compact && (
        <div className="mb-2 flex items-center justify-between"><h2 className="text-heading font-bold tracking-tight">Mural</h2><Link to="/area/mural" className="inline-flex min-h-11 items-center text-small font-semibold underline decoration-lime decoration-2 underline-offset-4">Ver tudo</Link></div>
      )}
      {!compact && <Stories />}

      {!compact && (feed.canPost
        ? <Composer access={feed} onCreated={(f) => { setFeed(f); setFilter(''); toast('Post publicado'); setMsg({ tone: 'success', text: 'Post publicado!' }) }} />
        : <p className="rounded-2xl bg-white p-3 text-small leading-snug" data-testid="locked-note">
            {feed.needsName ? <>Para publicar, <Link to="/area/perfil" className="font-semibold underline">informe seu nome no perfil</Link>.</> : feed.lockedNote}
          </p>)}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {!compact && (
        <div className="relative">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pr-12" role="group" aria-label="Filtrar por tema">
            {[{ id: '', label: 'Todos' }, ...feed.topics].map((t) => <button key={t.id} type="button" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)} className={`min-h-11 shrink-0 rounded-full border px-3.5 text-small font-medium ${filter === t.id ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>{t.label}</button>)}
          </div>
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-[-16px] w-12 bg-gradient-to-l from-ice to-transparent" />
        </div>
      )}

      <div className="space-y-3" data-testid="posts">
        {items.length === 0 && <p className="rounded-2xl bg-white py-6 text-center text-body text-muted">Nenhum post por aqui ainda. {feed.canPost ? 'Seja o primeiro a publicar!' : 'Volte em breve.'}</p>}
        {items.map((p) => (
          <PostCard key={p.id} p={p} f={feed} note={setMsg} compact={compact} update={upd} remove={() => setFeed((c) => c && { ...c, items: c.items.filter((x) => x.id !== p.id) })} />
        ))}
      </div>
      {!compact && feed.hasMore && <button type="button" onClick={more} className="min-h-11 w-full rounded-2xl border border-line bg-white text-body font-semibold">Ver posts anteriores</button>}
      {compact && (feed.hasMore || feed.items.length > 2) && <Link to="/area/mural" className="mt-3 flex min-h-11 items-center justify-center rounded-2xl border border-line bg-white text-body font-semibold">Ver mais no mural</Link>}
    </section>
  )
}
