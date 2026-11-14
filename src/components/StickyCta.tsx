import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'
import { SITE } from '../config/site'

/**
 * Barra de CTA fixa no mobile. Aparece depois que o CTA do hero sai da tela e
 * some quando o CTA final está visível (evita botões duplicados).
 */
export default function StickyCta() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const hero = document.getElementById('hero-cta')
    const final = document.getElementById('final-cta')
    if (!hero || !final || !('IntersectionObserver' in window)) return

    const visible = { hero: true, final: false }
    const update = () => setShow(!visible.hero && !visible.final)

    const heroIo = new IntersectionObserver(([e]) => {
      // "não visível" só vale se o hero ficou ACIMA da tela (usuário rolou para baixo).
      visible.hero = e.isIntersecting || e.boundingClientRect.top > 0
      update()
    })
    const finalIo = new IntersectionObserver(([e]) => {
      visible.final = e.isIntersecting
      update()
    })
    heroIo.observe(hero)
    finalIo.observe(final)
    return () => {
      heroIo.disconnect()
      finalIo.disconnect()
    }
  }, [])

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-graphite px-5 pt-3 transition-[transform,visibility] duration-200 ease-out md:hidden ${
        show ? 'translate-y-0 visible' : 'invisible translate-y-full'
      }`}
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <Button to={SITE.signupPath} arrow fullWidth>
        {SITE.ctaLabel}
      </Button>
      <Link to="/entrar" className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-white underline decoration-lime decoration-2 underline-offset-4">Já tenho cadastro — Entrar</Link>
    </div>
  )
}
