import type { ReactNode } from 'react'
import Header from './Header'
import Footer from './Footer'

/** Moldura das telas de conta: cabeçalho escuro, fundo gelo e cartão branco. */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  below,
}: {
  eyebrow: string
  title: string
  subtitle?: ReactNode
  children: ReactNode
  below?: ReactNode
}) {
  return (
    <>
      <Header variant="page" />
      <main className="bg-ice">
        <div className="mx-auto max-w-lg px-5 py-10 md:py-16">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
          <h1 className="mt-3 text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.03em] md:text-[40px]">
            {title}
          </h1>
          {subtitle && <p className="mt-3 text-[17px] leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-8 rounded-3xl bg-white p-5 md:p-8">{children}</div>
          {below && <div className="mt-6 text-center text-[16px] text-muted">{below}</div>}
        </div>
      </main>
      <Footer />
    </>
  )
}

/** Link no meio de uma frase. */
export const linkClass =
  'font-semibold text-graphite underline decoration-lime decoration-2 underline-offset-4 transition-colors duration-150 hover:decoration-graphite'
/** Link sozinho numa linha: área de toque de 44px. */
export const standaloneLink = `${linkClass} inline-block py-3`
