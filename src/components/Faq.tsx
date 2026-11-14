import Reveal from './Reveal'
import { SITE } from '../config/site'

const FAQ = [
  ['O cadastro é gratuito?', 'Sim. O pré-cadastro de profissionais é gratuito e não pede e-mail: só celular e senha.'],
  ['Quando começam os pedidos de orçamento?', `A previsão é ${SITE.requestsOpenLabel}. Até lá, complete seu perfil e acompanhe os comunicados na sua área.`],
  ['Preciso aguardar aprovação?', 'Sim. Nossa equipe analisa cada cadastro e nenhum perfil aparece ao público sem aprovação.'],
  ['Posso escolher mais de uma profissão?', 'Até 2 profissões e 2 regiões de atendimento.'],
  ['Preciso baixar um aplicativo?', 'Não. Você usa pelo navegador e, se quiser, instala na tela inicial do celular.'],
  ['Esqueci minha senha. E agora?', 'Por enquanto não há recuperação automática. Fale com nossa equipe pelo Instagram @mapadomapa.'],
] as const

export default function Faq() {
  return (
    <section id="perguntas" className="bg-ice py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-5 md:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Perguntas frequentes</p>
          <h2 className="mt-3 text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[40px]">Tire suas dúvidas</h2>
        </Reveal>
        <div className="mt-8 divide-y divide-line rounded-3xl bg-white px-5">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                {q}<span className="text-[22px] font-normal text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="pb-4 text-[16px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
