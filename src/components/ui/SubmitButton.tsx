import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: 'primary' | 'ghost'
}

/** Botão de formulário: 52px, mesma identidade dos botões da landing. */
export default function SubmitButton({ loading, variant = 'primary', children, disabled, className = '', ...rest }: Props) {
  const look =
    variant === 'primary'
      ? 'bg-lime text-graphite hover:bg-[#cbf88f] focus-visible:outline-lime'
      : 'bg-transparent text-graphite hover:bg-graphite/5 focus-visible:outline-graphite'
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold leading-none transition duration-200 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${look} ${className}`}
    >
      {loading && <Loader2 size={20} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
