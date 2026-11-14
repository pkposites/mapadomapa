import Reveal from './Reveal'
import { CATEGORIES } from '../data/categories'

export default function Categories() {
  return (
    <section id="categorias" className="bg-ice py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            Categorias
          </p>
          <h2 className="mt-3 max-w-[18ch] text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[40px]">
            Nove áreas profissionais, um só lugar
          </h2>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted md:text-lg">
            Escolha a sua categoria no cadastro e receba pedidos de quem procura
            exatamente o seu serviço.
          </p>
        </Reveal>

        <Reveal className="mt-10 md:mt-12">
          <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
            {CATEGORIES.map(({ id, name, examples, icon: Icon }) => (
              <li
                key={id}
                className="flex items-center gap-4 bg-white p-5 transition-colors duration-150 hover:bg-[#fafbf9] md:flex-col md:items-start md:gap-6 md:p-7"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ice text-graphite">
                  <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold leading-snug tracking-tight">
                    {name}
                  </h3>
                  <p className="mt-0.5 text-[15px] leading-snug text-muted">{examples}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
