import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const KEY = 'mdm_install_dismissed'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Convite discreto para instalar o app. Android/Chrome: botão nativo. iPhone: instruções "Adicionar à Tela de Início". */
export default function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null)
  const [hidden, setHidden] = useState(() => read() || isStandalone())
  const [steps, setSteps] = useState(false)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent) }
    const done = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done) }
  }, [])
  const ios = isIos()
  if (hidden || (!evt && !ios)) return null
  const dismiss = () => { try { localStorage.setItem(KEY, '1') } catch { /* sem storage */ } setHidden(true) }

  return (
    <section aria-label="Instalar aplicativo" className="relative rounded-3xl border border-line bg-white p-5" data-testid="install-card">
      <button type="button" onClick={dismiss} aria-label="Dispensar convite" className="absolute right-2 top-2 grid size-11 place-items-center text-muted"><X size={18} aria-hidden="true" /></button>
      <p className="flex items-center gap-2 pr-8 text-[16px] font-semibold"><Download size={18} aria-hidden="true" /> Instale o Mapa do Mapa</p>
      <p className="mt-1 pr-6 text-[15px] leading-snug text-muted">Instale o Mapa do Mapa no seu celular e acompanhe sua atividade com mais facilidade.</p>
      {evt && (
        <button type="button" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-lime px-6 font-semibold text-graphite"
          onClick={async () => { await evt.prompt(); const c = await evt.userChoice.catch(() => null); if (c?.outcome === 'accepted') setHidden(true); setEvt(null) }}>
          Instalar aplicativo
        </button>
      )}
      {!evt && ios && (
        <>
          <button type="button" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-line px-6 font-semibold" onClick={() => setSteps((s) => !s)} aria-expanded={steps}>Como instalar no iPhone</button>
          {steps && (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-snug">
              <li>Abra esta página no <strong>Safari</strong>.</li>
              <li>Toque em <Share size={16} className="inline -mt-1" aria-label="Compartilhar" /> <strong>Compartilhar</strong>.</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
            </ol>
          )}
        </>
      )}
    </section>
  )
}
