import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Send } from 'lucide-react'
import AreaShell from '../../area/Shell'
import Alert from '../../components/ui/Alert'
import SubmitButton from '../../components/ui/SubmitButton'
import { api, ApiError } from '../../lib/api'
import type { Msg } from '../../area/types'
import { buzz, toast } from '../../lib/toast'
import { SkeletonList } from '../../components/ui/Skeleton'

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Quanto o teclado do celular ocupa da tela (para o campo de mensagem ficar sempre acima dele). */
function useKeyboardInset(): number {
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => { const k = Math.round(window.innerHeight - vv.height - vv.offsetTop); setKb(k > 120 ? k : 0) } // só conta como teclado acima de 120 px
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on); on()
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on) }
  }, [])
  return kb
}

export function Thread({ load, send, mine, hideComposer = false, reloadKey = 0, dock = false, initialText = '' }: { load: () => Promise<Msg[]>; send: (body: string) => Promise<Msg[]>; mine: 'admin' | 'professional'; hideComposer?: boolean; reloadKey?: number; dock?: boolean; initialText?: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [text, setText] = useState(initialText)
  const kb = useKeyboardInset()
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
    try { setMsgs(await send(text.trim())); setText(''); buzz(); toast('Enviado') } catch (e) { setErr(e instanceof ApiError ? e.message : 'Não foi possível enviar.') } finally { setBusy(false) }
  }
  return (
    <div>
      {!msgs && !err && <SkeletonList rows={4} />}
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
      {!hideComposer && dock && (
        <>
          <div aria-hidden="true" className="h-20" />
          {/* Campo fixo: fica acima da barra de abas e, com o teclado aberto, acima do teclado */}
          <div className="fixed inset-x-0 z-20 border-t border-line bg-white px-3 py-2" style={{ bottom: kb > 0 ? kb : 'calc(4rem + env(safe-area-inset-bottom))' }} data-testid="composer-dock">
            <div className="mx-auto flex max-w-lg items-end gap-2">
              <label htmlFor="msg" className="sr-only">Mensagem</label>
              <textarea id="msg" rows={1} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem…"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-[22px] border border-line bg-ice px-4 py-2.5 text-[16px] leading-snug placeholder:text-placeholder focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
              <button type="button" aria-label="Enviar mensagem" disabled={busy || !text.trim()} onClick={submit} data-testid="send-btn" data-ready={Boolean(text.trim())}
                className={`grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95 ${text.trim() ? 'bg-lime text-graphite' : 'bg-[#e6e9e5] text-muted'}`}>
                <Send size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
      {!hideComposer && !dock && <div className="mt-4 rounded-3xl bg-white p-4">
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
      <h1 className="sr-only">Mensagens</h1>
      <p className="mb-4 text-[15px] text-muted">Converse com a equipe do Mapa do Mapa: tire dúvidas e responda a pedidos de ajuste.</p>
      <Thread load={load} send={send} mine="professional" dock initialText={prefill ?? ''} />
    </AreaShell>
  )
}
