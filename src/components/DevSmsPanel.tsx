import { useCallback, useEffect, useState } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { api } from '../lib/api'

type Msg = { phone: string; purpose: string; body: string; created_at: string }

/**
 * SIMULADOR DE SMS — existe apenas em desenvolvimento (import.meta.env.DEV).
 * Mostra os "SMS" gravados no banco local; nada é enviado a operadora alguma.
 * Não entra no build de produção.
 */
export default function DevSmsPanel() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])

  const load = useCallback(async () => {
    try {
      setMsgs((await api.get<{ messages: Msg[] }>('/dev/sms')).messages)
    } catch {
      /* API indisponível: ignora */
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(load, 2000)
    return () => window.clearInterval(id)
  }, [load])

  const latest = msgs[0]
  const code = (m: Msg) => m.body.match(/\b(\d{6})\b/)?.[1] ?? ''

  return (
    <div className="fixed bottom-3 right-3 z-[70] font-sans" data-testid="dev-sms">
      {open ? (
        <div className="w-[min(88vw,340px)] rounded-2xl border border-white/10 bg-graphite p-3 text-white shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-lime">SMS simulado · só local</p>
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
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-11 rounded-xl bg-graphite-2 text-[13px] font-semibold hover:bg-[#262b27]"
              onClick={async () => { if (latest) await api.post('/dev/expire-codes', { phone: latest.phone }); await load() }}>
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
