import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

type Props = {
  to?: string
  href?: string
  id?: string
  variant?: 'primary' | 'dark' | 'outline'
  size?: 'md' | 'sm'
  arrow?: boolean
  fullWidth?: boolean
  className?: string
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold text-base leading-tight ' +
  'text-balance select-none transition duration-200 ease-out active:scale-[0.97] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2'

const variants = {
  primary:
    'bg-lime text-graphite hover:bg-[#cbf88f] focus-visible:outline-lime',
  dark: 'bg-graphite text-white hover:bg-[#2a302b] focus-visible:outline-graphite',
  outline: 'border border-white/30 bg-transparent text-white hover:bg-white/10 focus-visible:outline-white',
}

const sizes = {
  md: 'min-h-13 px-6 py-3 max-w-full', // 52px; o rótulo pode quebrar linha
  sm: 'min-h-11 px-4 whitespace-nowrap', // 44px — apenas no cabeçalho
}

export default function Button({
  to,
  href,
  id,
  variant = 'primary',
  size = 'md',
  arrow = false,
  fullWidth = false,
  className = '',
  children,
}: Props) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${
    fullWidth ? 'w-full' : ''
  } ${className}`
  const content = (
    <>
      {children}
      {arrow && <ArrowRight size={20} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />}
    </>
  )

  if (to)
    return (
      <Link id={id} to={to} className={cls}>
        {content}
      </Link>
    )
  return (
    <a id={id} href={href} className={cls}>
      {content}
    </a>
  )
}
