import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import Header from './Header'
import Footer from './Footer'

export type LegalSection = {
  title: string
  /** Parágrafos do rascunho. */
  body: string[]
  /** O que ainda precisa ser definido/validado antes do cadastro real. */
  pending?: string
}

type Props = {
  title: string
  intro: string
  sections: LegalSection[]
}

/** Layout compartilhado das páginas jurídicas (rascunho pendente de revisão). */
export default function LegalPage({ title, intro, sections }: Props) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} — Mapa do Mapa`
    // Rascunho: não deve ser indexado por buscadores até a revisão jurídica.
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.title = previousTitle
      meta.remove()
    }
  }, [title])

  return (
    <>
      <Header variant="page" />
      <main className="bg-ice">
        <div className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            Documento legal
          </p>
          <h1 className="mt-3 text-balance text-[34px] font-bold leading-[1.08] tracking-[-0.03em] md:text-5xl">
            {title}
          </h1>

          <div
            role="note"
            className="mt-6 flex gap-3 rounded-2xl border border-graphite/10 bg-white p-4 md:p-5"
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-graphite">
              <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <p className="text-[15px] leading-snug">
              <strong className="font-semibold">Rascunho pendente de revisão jurídica.</strong>{' '}
              <span className="text-muted">
                Este texto é uma base de trabalho e não é o documento final. Ele precisa ser
                revisado e aprovado por um advogado antes da abertura do cadastro real.
              </span>
            </p>
          </div>

          <p className="mt-6 text-[17px] leading-relaxed text-muted">{intro}</p>

          <div className="mt-10 space-y-8">
            {sections.map((s, i) => (
              <section key={s.title}>
                <h2 className="text-[20px] font-semibold tracking-tight">
                  {i + 1}. {s.title}
                </h2>
                {s.body.map((p) => (
                  <p key={p} className="mt-3 text-[17px] leading-relaxed">
                    {p}
                  </p>
                ))}
                {s.pending && (
                  <p className="mt-3 rounded-xl bg-white px-4 py-3 text-[15px] leading-snug text-muted">
                    <strong className="font-semibold text-graphite">Pendente: </strong>
                    {s.pending}
                  </p>
                )}
              </section>
            ))}
          </div>

          <p className="mt-12 text-[14px] text-muted">Última atualização do rascunho: novembro de 2026.</p>
        </div>
      </main>
      <Footer />
    </>
  )
}
