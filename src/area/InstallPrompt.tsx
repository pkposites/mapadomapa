import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { isIos, isStandalone } from '../lib/push'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const KEY = 'mdm_install_dismissed'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
// O navegador só dispara o evento de instalação quando quiser (Chrome/Edge/Android). Guardamos o primeiro que vier.
let saved: BIPEvent | null = null
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); saved = e as BIPEvent })

/**
 * Botão "Instalar app". Android/Chrome/Edge: instalação nativa quando o navegador oferece.
 * iPhone: "Compartilhar > Adicionar à Tela de Início". Demais casos (ex.: desktop): instruções do menu do navegador.
 * `persistent` = versão fixa (sem botão de dispensar), usada no perfil.
 */
export default function InstallPrompt({ persistent = false }: { persistent?: boolean }) {
  const [evt, setEvt] = useState<BIPEvent | null>(saved)
  const [hidden, setHidden] = useState(() => isStandalone() || (!persistent && read()))
  const [steps, setSteps] = useState(false)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); saved = e as BIPEvent; setEvt(e as BIPEvent) }
    const done = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done) }
  }, [])
  if (hidden) return null
  const ios = isIos()
  const dismiss = () => { try { localStorage.setItem(KEY, '1') } catch { /* sem storage */ } setHidden(true) }

  return (
    <section aria-label="Instalar aplicativo" className="relative rounded-3xl border border-line bg-white p-5" data-testid="install-card">
      {!persistent && <button type="button" onClick={dismiss} aria-label="Dispensar convite" className="absolute right-2 top-2 grid size-11 place-items-center text-muted"><X size={18} aria-hidden="true" /></button>}
      <p className="flex items-center gap-2 pr-8 text-[16px] font-semibold"><Download size={18} aria-hidden="true" /> Instalar app</p>
      <p className="mt-1 pr-6 text-[15px] leading-snug text-muted">Instale o Mapa do Mapa no seu celular e acompanhe sua atividade com mais facilidade.</p>
      {evt ? (
        <button type="button" data-testid="install-btn" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-lime px-6 font-semibold text-graphite"
          onClick={async () => { await evt.prompt(); const c = await evt.userChoice.catch(() => null); if (c?.outcome === 'accepted') setHidden(true); saved = null; setEvt(null) }}>
          Instalar app
        </button>
      ) : (
        <>
          <button type="button" data-testid="install-btn" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-lime px-6 font-semibold text-graphite" onClick={() => setSteps((s) => !s)} aria-expanded={steps}>
            {steps ? 'Fechar instruções' : 'Instalar app'}
          </button>
          {steps && (ios ? (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-snug" data-testid="install-steps">
              <li>Abra esta página no <strong>Safari</strong>.</li>
              <li>Toque em <Share size={16} className="-mt-1 inline" aria-label="Compartilhar" /> <strong>Compartilhar</strong>.</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
            </ol>
          ) : (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-snug" data-testid="install-steps">
              <li>No Chrome ou Edge, abra o menu do navegador (<strong>⋮</strong>).</li>
              <li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
              <li>Confirme. O ícone do Mapa do Mapa aparece no seu aparelho.</li>
            </ol>
          ))}
        </>
      )}
    </section>
  )
}
