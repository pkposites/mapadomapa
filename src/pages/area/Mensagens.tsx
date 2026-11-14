import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Send } from 'lucide-react'
import AreaShell from '../../area/Shell'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import SubmitButton from '../../components/ui/SubmitButton'
import { api, ApiError } from '../../lib/api'
import type { Msg } from '../../area/types'

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function Thread({ load, send, mine, hideComposer = false, reloadKey = 0 }: { load: () => Promise<Msg[]>; send: (body: string) => Promise<Msg[]>; mine: 'admin' | 'professional'; hideComposer?: boolean; reloadKey?: number }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const refresh = useCallback(() => load().then(setMsgs).catch(() => setErr('Não foi possível carregar as mensagens.')), [load])
  useEffect(() => {
    void refresh()
    const on = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [refresh, reloadKey])
  useEffect(() => { if (!hideComposer) end.current?.scrollIntoView({ block: 'end' }) }, [msgs, hideComposer])

  const submit = async () => {
    if (!text.trim()) return
    setBusy(true); setErr(null)
    try { setMsgs(await send(text.trim())); setText('') } catch (e) { setErr(e instanceof ApiError ? e.message : 'Não foi possível enviar.') } finally { setBusy(false) }
  }
  return (
    <div>
      {!msgs && !err && <div className="grid place-items-center py-10"><Spinner /></div>}
      {msgs && msgs.length === 0 && <p className="rounded-2xl bg-white p-5 text-center text-[15px] text-muted">Nenhuma mensagem ainda.</p>}
      <ul className="space-y-3" data-testid="thread">
        {msgs?.map((m) => (
          <li key={m.id} className={`flex ${m.from === mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug ${m.from === mine ? 'bg-lime text-graphite' : 'bg-white'}`}>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide opacity-60">
                {m.kind === 'decision' ? 'Decisão da equipe' : m.from === 'admin' ? 'Equipe Mapa do Mapa' : 'Profissional'}{m.unread && ' · nova'}
              </p>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className="mt-1 text-right text-[12px] opacity-60">{fmt(m.at)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div ref={end} />
      {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
      {!hideComposer && <div className="mt-4 rounded-3xl bg-white p-4">
        <label htmlFor="msg" className="sr-only">Mensagem</label>
        <textarea id="msg" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva sua mensagem…"
          className="block w-full resize-none rounded-2xl border border-line p-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
        <div className="mt-3"><SubmitButton type="button" loading={busy} disabled={!text.trim()} onClick={submit}><Send size={18} aria-hidden="true" /> Enviar</SubmitButton></div>
      </div>}
    </div>
  )
}

export default function Mensagens() {
  const prefill = (useLocation().state as { prefill?: string } | null)?.prefill
  const load = useCallback(() => api.get<{ messages: Msg[] }>('/pro/messages').then((r) => r.messages), [])
  const send = useCallback((body: string) => api.post<{ messages: Msg[] }>('/pro/messages', { body }).then((r) => r.messages), [])
  return (
    <AreaShell>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Mensagens</h1>
      <p className="mb-5 mt-1 text-[15px] text-muted">Converse com a equipe do Mapa do Mapa: tire dúvidas e responda a pedidos de ajuste.</p>
      {prefill && <div className="mb-4"><Alert tone="info">Escreva sua solicitação abaixo: <em>{prefill}</em></Alert></div>}
      <Thread load={load} send={send} mine="professional" />
    </AreaShell>
  )
}
