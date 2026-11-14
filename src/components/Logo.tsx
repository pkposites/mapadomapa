type Props = {
  tone?: 'light' | 'dark'
  className?: string
}

/** Marca: pin grafite sobre quadrado verde-lima + wordmark. */
export default function Logo({ tone = 'light', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="64" height="64" rx="16" fill="#B9F46D" />
        <path
          fill="#141715"
          d="M32 52S16 39.5 16 27a16 16 0 0 1 32 0c0 12.5-16 25-16 25z"
        />
        <circle cx="32" cy="27" r="6" fill="#B9F46D" />
      </svg>
      <span
        className={`text-[18px] font-bold tracking-tight ${
          tone === 'light' ? 'text-white' : 'text-graphite'
        }`}
      >
        Mapa do Mapa
      </span>
    </span>
  )
}
