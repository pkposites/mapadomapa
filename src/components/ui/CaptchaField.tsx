import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { getStatus } from '../../lib/status'

/**
 * Verificação anti-robô. O servidor diz qual usar (GET /api/status → captcha):
 *  - "pow"       prova de trabalho PRÓPRIA, invisível: o navegador resolve um desafio em ~1 s. Sem serviço externo.
 *  - "dev"       simulado (só ambiente local/homologação): caixa "Não sou um robô".
 *  - "turnstile" Cloudflare Turnstile (precisa de VITE_TURNSTILE_SITE_KEY).
 *  - null        nada a exibir (o servidor recusa o cadastro, falha fechada).
 * A validação que protege acontece sempre no servidor.
 */
export const DEV_CAPTCHA_TOKEN = 'dev-captcha-pass'
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
export type CaptchaMode = 'dev' | 'turnstile' | 'pow' | null

type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void }
declare global { interface Window { turnstile?: TurnstileApi } }

let tsScript: Promise<void> | null = null
const loadTurnstile = (): Promise<void> => {
  if (window.turnstile) return Promise.resolve()
  tsScript ??= new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('turnstile'))
    document.head.appendChild(s)
  })
  return tsScript
}

const zeroBits = (b: Uint8Array): number => {
  let n = 0
  for (const x of b) { if (x === 0) { n += 8; continue } return n + Math.clz32(x) - 24 }
  return n
}
/** Procura o nonce em lotes paralelos (WebCrypto), cedendo o controle para a tela não travar. */
async function solvePow(challenge: string, difficulty: number, cancelled: () => boolean): Promise<string | null> {
  const enc = new TextEncoder()
  const BATCH = 512
  for (let base = 0; ; base += BATCH) {
    if (cancelled()) return null
    const nonces = Array.from({ length: BATCH }, (_, i) => base + i)
    const hashes = await Promise.all(nonces.map((n) => crypto.subtle.digest('SHA-256', enc.encode(`${challenge}:${n}`))))
    for (let i = 0; i < BATCH; i++) if (zeroBits(new Uint8Array(hashes[i])) >= difficulty) return `${challenge}:${nonces[i]}`
  }
}

type Props = {
  onToken: (token: string | null) => void
  onMode?: (mode: CaptchaMode) => void
  /** Mude este número para pedir uma nova verificação (o token é de uso único). */
  resetSignal: number
  error?: string | null
}

export default function CaptchaField({ onToken, onMode, resetSignal, error }: Props) {
  const cb = useRef(onToken); cb.current = onToken
  const modeCb = useRef(onMode); modeCb.current = onMode
  const [mode, setMode] = useState<CaptchaMode | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle')
  const [checked, setChecked] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const run = useRef(0)

  useEffect(() => { getStatus().then((s) => { setMode(s.captcha); modeCb.current?.(s.captcha) }).catch(() => { setMode(null); modeCb.current?.(null) }) }, [])

  // Prova de trabalho: roda ao montar e a cada reinício
  useEffect(() => {
    if (mode !== 'pow') return
    const mine = ++run.current
    cb.current(null); setState('working')
    ;(async () => {
      try {
        const c = await api.get<{ challenge: string; difficulty: number }>('/captcha/challenge')
        const token = await solvePow(c.challenge, c.difficulty, () => run.current !== mine)
        if (token && run.current === mine) { cb.current(token); setState('done') }
      } catch { if (run.current === mine) setState('failed') }
    })()
    return () => { run.current++ }
  }, [mode, resetSignal])

  // Turnstile
  useEffect(() => {
    if (mode !== 'turnstile' || !SITE_KEY) return
    let off = false
    loadTurnstile().then(() => {
      if (off || !box.current || !window.turnstile) return
      widget.current = window.turnstile.render(box.current, { sitekey: SITE_KEY, theme: 'light', callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(null), 'error-callback': () => cb.current(null) })
    }).catch(() => setState('failed'))
    return () => { off = true; if (widget.current) window.turnstile?.remove(widget.current); widget.current = null }
  }, [mode])
  useEffect(() => {
    if (resetSignal === 0) return
    if (mode === 'turnstile' && widget.current) { cb.current(null); window.turnstile?.reset(widget.current) }
    if (mode === 'dev') { cb.current(null); setChecked(false) }
  }, [resetSignal, mode])

  if (!mode) return null
  return (
    <div>
      {mode === 'pow' && (
        <p role="status" className="flex min-h-11 items-center gap-2 text-[14px] text-muted">
          {state === 'done' ? <><CheckCircle2 size={18} className="text-graphite" aria-hidden="true" /> Verificação de segurança concluída</>
            : state === 'failed' ? <span className="font-medium text-danger">Não foi possível fazer a verificação de segurança. Recarregue a página.</span>
            : <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Verificando a segurança…</>}
        </p>
      )}
      {mode === 'turnstile' && <div ref={box} className="min-h-[65px]" />}
      {mode === 'dev' && (
        <label htmlFor="captcha-sim" className="flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-ice px-4 text-[16px] font-medium">
          <input id="captcha-sim" type="checkbox" checked={checked} onChange={(e) => { setChecked(e.target.checked); cb.current(e.target.checked ? DEV_CAPTCHA_TOKEN : null) }} className="size-6 shrink-0 cursor-pointer rounded-md accent-graphite" />
          <span>Não sou um robô<span className="block text-[13px] font-normal text-muted">Verificação simulada (só em testes)</span></span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-[14px] font-medium leading-snug text-danger">
          <AlertCircle size={18} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />{error}
        </p>
      )}
    </div>
  )
}
