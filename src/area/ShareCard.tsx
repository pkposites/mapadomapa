import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'

const TEXT = 'Estou no pré-cadastro gratuito do Mapa do Mapa, plataforma de pedidos de orçamento para profissionais de São Paulo. Cadastre-se também:'

/** "Indique o Mapa do Mapa": compartilhamento nativo quando existe; senão, copiar o link. Sem pontos nem recompensas. */
export default function ShareCard() {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}/cadastro`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const copy = async () => {
    try { await navigator.clipboard.writeText(url) } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch { /* sem suporte */ } t.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }
  const share = async () => { try { await navigator.share({ title: 'Mapa do Mapa', text: TEXT, url }) } catch { /* cancelado */ } }
  return (
    <section className="rounded-3xl bg-white p-5" aria-label="Indique o Mapa do Mapa" data-testid="share-card">
      <p className="text-[18px] font-bold">Indique o Mapa do Mapa</p>
      <p className="mt-1 text-[15px] leading-snug text-muted">Conhece outro profissional? Convide para o pré-cadastro gratuito do Mapa do Mapa.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {canShare && <button type="button" onClick={share} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-lime px-4 font-semibold text-graphite"><Share2 size={18} aria-hidden="true" /> Compartilhar</button>}
        <button type="button" onClick={copy} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line px-4 font-semibold ${canShare ? '' : 'col-span-2'}`}>
          {copied ? <><Check size={18} aria-hidden="true" /> Link copiado!</> : <><Copy size={18} aria-hidden="true" /> Copiar link</>}
        </button>
      </div>
    </section>
  )
}
