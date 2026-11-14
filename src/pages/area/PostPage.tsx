import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Flag, MessageCircle, Trash2 } from 'lucide-react'
import AreaShell from '../../area/Shell'
import Avatar from '../../area/Avatar'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import { api, ApiError } from '../../lib/api'
import { Author, CommentsBox, LikeButton, msgOf, postTitle, TopicPill, type Access, type Post } from '../../area/Mural'

type Data = Access & { post: Post }

/** Um post isolado, com texto completo e comentários. */
export default function PostPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState<Data | null>(null)
  const [missing, setMissing] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  useEffect(() => { api.get<Data>(`/pro/feed/${id}`).then(setD).catch((e) => { if (e instanceof ApiError && e.status === 404) setMissing(true) }) }, [id])
  const p = d?.post
  return (
    <AreaShell>
      <Link to="/area/mural" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={18} aria-hidden="true" /> Mural</Link>
      {missing && <div className="mt-3"><Alert tone="info">Este post não está mais disponível.</Alert></div>}
      {!d && !missing && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {d && p && (
        <article className="mt-2 rounded-3xl bg-white p-5" data-testid="post-page">
          <div className="flex items-start gap-3">
            <Avatar name={p.name} staff={p.staff} />
            <div className="min-w-0 flex-1"><Author p={p} /></div>
            {p.mine
              ? <button type="button" aria-label="Excluir post" onClick={() => { if (window.confirm('Excluir este post?')) void api.del(`/pro/feed/${p.id}`).then(() => navigate('/area/mural', { replace: true })).catch((e) => setMsg({ tone: 'error', text: msgOf(e) })) }} className="grid size-11 place-items-center text-muted"><Trash2 size={17} aria-hidden="true" /></button>
              : <button type="button" aria-label="Denunciar post" aria-disabled={!d.canInteract} onClick={() => { if (!d.canInteract) return; if (window.confirm('Denunciar este post para a equipe?')) void api.post(`/pro/feed/${p.id}/report`).then(() => setMsg({ tone: 'success', text: 'Denúncia enviada. A equipe vai analisar.' })).catch((e) => setMsg({ tone: 'error', text: msgOf(e) })) }} className={`grid size-11 place-items-center text-muted ${d.canInteract ? '' : 'opacity-60'}`}><Flag size={16} aria-hidden="true" /></button>}
          </div>
          <div className="mt-3"><TopicPill topics={d.topics} id={p.topic} /></div>
          <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-[-0.02em]">{postTitle(p)}</h1>
          {p.title && <p className="mt-3 whitespace-pre-line break-words text-[17px] leading-relaxed">{p.body}</p>}
          <div className="mt-3 flex items-center gap-1 border-b border-line pb-3">
            <LikeButton p={p} access={d} update={(n) => setD({ ...d, post: n })} note={(t) => setMsg({ tone: 'info', text: t })} />
            <span className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[14px] font-semibold text-muted"><MessageCircle size={19} aria-hidden="true" /> {p.comments}</span>
          </div>
          {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          <h2 className="mb-3 mt-4 text-[17px] font-bold">Comentários</h2>
          <CommentsBox postId={p.id} access={d} onCount={(n) => setD({ ...d, post: { ...p, comments: n } })} />
        </article>
      )}
    </AreaShell>
  )
}
