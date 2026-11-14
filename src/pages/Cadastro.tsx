import { Check } from 'lucide-react'
import Header from '../components/Header'
import Button from '../components/Button'
import { SITE } from '../config/site'

const ITEMS = [
  'Seu nome e um contato',
  'Até 2 profissões que você oferece',
  'As regiões de São Paulo onde você atende',
]

/** Página informativa temporária — o cadastro real chega em uma próxima etapa. */
export default function Cadastro() {
  return (
    <>
      <Header variant="page" />
      <main className="bg-ice">
        <div className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            Cadastro
          </p>
          <h1 className="mt-3 text-balance text-[34px] font-bold leading-[1.08] tracking-[-0.03em] md:text-5xl">
            O cadastro abre em breve
          </h1>
          <p className="mt-4 text-[18px] leading-relaxed text-muted">
            Estamos finalizando a plataforma. A abertura está prevista para{' '}
            <strong className="font-semibold text-graphite">{SITE.launchLabel}</strong>.
          </p>

          <section className="mt-10 rounded-3xl bg-white p-6 md:p-8">
            <h2 className="text-[20px] font-semibold tracking-tight">
              O que você vai precisar
            </h2>
            <ul className="mt-5 space-y-4">
              {ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[17px] leading-snug">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-lime text-graphite">
                    <Check size={16} strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-8">
            <Button to="/" variant="dark" fullWidth className="md:w-auto">
              Voltar para o início
            </Button>
            <p className="mt-4 text-[14px] text-muted">
              Esta é uma página temporária da fase de pré-lançamento.
            </p>
          </div>
        </div>
      </main>
    </>
  )
}
