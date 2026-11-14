import Header from '../components/Header'
import Footer from '../components/Footer'
import Button from '../components/Button'
import { SITE } from '../config/site'

/** Rota inexistente dentro do app (o servidor devolve a 404.html para endereços fora do app). */
export default function NotFound() {
  return (
    <>
      <Header variant="page" />
      <main className="bg-ice">
        <div className="mx-auto max-w-lg px-5 py-16 text-center md:py-24" data-testid="not-found">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Erro 404</p>
          <h1 className="mt-3 text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.03em] md:text-[40px]">Página não encontrada</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-muted">O endereço que você abriu não existe ou mudou de lugar.</p>
          <div className="mt-8 grid gap-3">
            <Button to="/" variant="dark" fullWidth>Voltar ao início</Button>
            <Button to={SITE.signupPath} fullWidth>{SITE.ctaLabel}</Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
