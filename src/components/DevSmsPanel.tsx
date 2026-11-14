import { useCallback, useEffect, useState } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { api } from '../lib/api'

type Msg = { phone: string; purpose: string; body: string; created_at: string }
type ServerEv = { event_name: string; event_id: string; mode: string; status: string }

/**
 * SIMULADOR DE SMS — existe apenas em desenvolvimento (import.meta.env.DEV).
 * Mostra os "SMS" gravados no banco local; nada é enviado a operadora alguma.
 * Não entra no build de produção.
 */
export default function DevSmsPanel() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [serverEv, setServerEv] = useState<ServerEv[]>([])
  const [, bump] = useState(0)

  const load = useCallback(async (withTracking: boolean) => {
    try {
      setMsgs((await api.get<{ messages: Msg[] }>('/dev/sms')).messages)
      // O rastreamento só é consultado com o painel aberto (cada requisição custa CPU no servidor local).
      if (withTracking) setServerEv((await api.get<{ events: ServerEv[] }>('/dev/tracking')).events)
    } catch {
      /* API indisponível: ignora */
    }
  }, [])

  useEffect(() => {
    void load(open)
    // Fechado: só o último SMS, a cada 5 s. Aberto: tudo, a cada 3 s. Aba escondida: pausa.
    const id = window.setInterval(() => { if (!document.hidden) void load(open) }, open ? 3000 : 5000)
    const onMeta = () => bump((n) => n + 1)
    window.addEventListener('mdm:meta', onMeta)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('mdm:meta', onMeta)
    }
  }, [load, open])

  const latest = msgs[0]
  const code = (m: Msg) => m.body.match(/\b(\d{6})\b/)?.[1] ?? ''

  return (
    <div className="fixed bottom-3 right-3 z-[70] font-sans" data-testid="dev-sms">
      {open ? (
        <div className="w-[min(88vw,340px)] rounded-2xl border border-white/10 bg-graphite p-3 text-white shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-lime">SMS simulado · só testes</p>
            <button type="button" aria-label="Fechar simulador" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-on-dark hover:text-white">
              <X size={18} />
            </button>
          </div>
          {msgs.length === 0 && <p className="py-3 text-[14px] text-on-dark">Nenhum SMS ainda.</p>}
          <ul className="max-h-64 space-y-2 overflow-auto">
            {msgs.map((m, i) => (
              <li key={i} className="rounded-xl bg-graphite-2 p-3 text-[13px] leading-snug">
                <p className="text-on-dark">Para {m.phone} · {m.purpose === 'signup' ? 'cadastro' : 'recuperação'}</p>
                <p className="mt-1">{m.body}</p>
                <p className="mt-1 text-[18px] font-bold tracking-[0.2em] text-lime" data-testid="dev-sms-code">{code(m)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl bg-graphite-2 p-3 text-[12px] leading-snug" data-testid="dev-meta">
            <p className="font-semibold uppercase tracking-[0.08em] text-lime">Meta · simulado (nada é enviado)</p>
            <p className="mt-1 text-on-dark">Navegador (Pixel):</p>
            {(window.__metaEvents ?? []).filter((e) => e.type === 'track').slice(-4).map((e, i) => (
              <p key={i} data-testid="dev-meta-browser">{e.name}{e.eventID ? ` · id ${e.eventID.slice(0, 8)}…` : ''}</p>
            ))}
            {!(window.__metaEvents ?? []).some((e) => e.type === 'track') && <p className="text-on-dark">nenhum</p>}
            <p className="mt-1 text-on-dark">Servidor (Conversions API):</p>
            {serverEv.slice(0, 3).map((e, i) => (
              <p key={i} data-testid="dev-meta-server">{e.event_name} · id {e.event_id.slice(0, 8)}… · {e.status}</p>
            ))}
            {serverEv.length === 0 && <p className="text-on-dark">nenhum</p>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-11 rounded-xl bg-graphite-2 text-[13px] font-semibold hover:bg-[#262b27]"
              onClick={async () => { if (latest) await api.post('/dev/expire-codes', { phone: latest.phone }); await load(true) }}>
              Vencer código
            </button>
            <button type="button" className="min-h-11 rounded-xl bg-graphite-2 text-[13px] font-semibold hover:bg-[#262b27]"
              onClick={() => api.post('/dev/reset-limits')}>
              Zerar limites
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir simulador de SMS"
          className="flex min-h-11 items-center gap-2 rounded-full bg-graphite px-4 text-[13px] font-semibold text-white shadow-lg active:scale-95">
          <MessageSquareText size={18} className="text-lime" aria-hidden="true" />
          SMS
          {latest && <span className="rounded-full bg-lime px-2 py-0.5 text-graphite" data-testid="dev-sms-badge">{code(latest)}</span>}
        </button>
      )}
    </div>
  )
}
