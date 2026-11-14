import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { setConsent, useConsent } from '../lib/consent'
import { metaConfigured, syncPixel } from '../lib/meta'
import { SITE } from '../config/site'

/**
 * Aviso de privacidade. Só aparece se o rastreamento da Meta estiver configurado, o visitante
 * ainda não tiver escolhido (ou reabrir pelo rodapé) e o navegador não tiver enviado sinal de
 * privacidade. "Recusar" tem o mesmo destaque e tamanho de "Aceitar".
 */
export default function ConsentBanner() {
  const { state, panelOpen, signal } = useConsent()
  useEffect(() => { syncPixel() }, [state])

  if (!metaConfigured || signal || (state !== 'unset' && !panelOpen)) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-[60] rounded-2xl bg-graphite p-5 text-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/10 md:inset-x-auto md:right-5 md:bottom-5 md:w-[26rem]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <p id="consent-title" className="text-[17px] font-semibold leading-snug">Sua privacidade</p>
      <p className="mt-2 text-[15px] leading-relaxed text-on-dark">
        Podemos usar cookies de medição da Meta para entender se nossos anúncios funcionam. Isso é opcional e você decide.{' '}
        <Link to={SITE.privacyPath} target="_blank" className="font-semibold text-white underline decoration-lime decoration-2 underline-offset-4">
          Saiba mais
        </Link>
        .
      </p>
      {state !== 'unset' && (
        <p className="mt-2 text-[13px] text-on-dark">Escolha atual: {state === 'granted' ? 'permitido' : 'recusado'}.</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setConsent(false)}
          className="min-h-13 rounded-2xl border border-white/30 px-4 text-base font-semibold transition duration-200 hover:bg-white/10 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Recusar
        </button>
        <button
          type="button"
          onClick={() => setConsent(true)}
          className="min-h-13 rounded-2xl bg-lime px-4 text-base font-semibold text-graphite transition duration-200 hover:bg-[#cbf88f] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
