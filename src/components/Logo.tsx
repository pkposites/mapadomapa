import mark from '../assets/logo/mark-reversed.png'
import wordmark from '../assets/logo/wordmark-reversed.png'

/**
 * Logotipo oficial (versão para fundos escuros), derivado de brand/logo-atual.webp.
 * Emblema + wordmark lado a lado: o lockup empilhado original ficaria ilegível
 * numa barra de 64px. Em telas muito estreitas (<360px) só o emblema aparece.
 */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Mapa do Mapa"
      className={`inline-flex items-center gap-2.5 ${className}`}
    >
      <img src={mark} alt="" width={37} height={36} className="h-9 w-auto shrink-0" />
      <img
        src={wordmark}
        alt=""
        width={168}
        height={24}
        className="h-6 w-auto max-[359px]:hidden"
      />
    </span>
  )
}
