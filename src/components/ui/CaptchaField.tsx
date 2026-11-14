import { useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

/**
 * Verificação anti-robô. Três modos, escolhidos automaticamente:
 *  1) Cloudflare Turnstile  — se VITE_TURNSTILE_SITE_KEY estiver definida (chave PÚBLICA).
 *  2) Simulado               — somente em desenvolvimento (import.meta.env.DEV). Custo zero.
 *  3) Nada                   — produção sem chave: o servidor recusa (falha fechada) e a tela mostra o erro.
 * A validação que realmente protege acontece no servidor (server/lib/captcha.ts).
 * Doc: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
export const captchaEnabled = Boolean(SITE_KEY) || import.meta.env.DEV
export const DEV_CAPTCHA_TOKEN = 'dev-captcha-pass'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    // Precisa ser carregado exatamente deste endereço (não copiar nem fazer proxy).
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Props = {
  onToken: (token: string | null) => void
  /** Mude este número para reiniciar a verificação (o token é de uso único). */
  resetSignal: number
  error?: string | null
}

export default function CaptchaField({ onToken, resetSignal, error }: Props) {
  const cb = useRef(onToken)
  cb.current = onToken
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  // Turnstile
  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        })
      })
      .catch(() => setLoadFailed(true))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [])

  // Reinício após cada envio
  useEffect(() => {
    if (resetSignal === 0) return
    cb.current(null)
    if (SITE_KEY) {
      if (widget.current) window.turnstile?.reset(widget.current)
    } else {
      setChecked(false)
    }
  }, [resetSignal])

  if (!captchaEnabled) return null

  return (
    <div>
      {SITE_KEY ? (
        <div ref={box} className="min-h-[65px]" />
      ) : (
        <label
          htmlFor="captcha-sim"
          className="flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-ice px-4 text-[16px] font-medium"
        >
          <input
            id="captcha-sim"
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked)
              cb.current(e.target.checked ? DEV_CAPTCHA_TOKEN : null)
            }}
            className="size-6 shrink-0 cursor-pointer rounded-md accent-graphite"
          />
          <span>
            Não sou um robô
            <span className="block text-[13px] font-normal text-muted">Verificação simulada (só em desenvolvimento)</span>
          </span>
        </label>
      )}
      {loadFailed && (
        <p role="alert" className="mt-2 text-[14px] font-medium text-danger">
          Não foi possível carregar a verificação de segurança. Confira a internet e recarregue a página.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-[14px] font-medium leading-snug text-danger">
          <AlertCircle size={18} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
