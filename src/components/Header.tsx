import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Logo from './Logo'
import Button from './Button'
import { SITE } from '../config/site'
import { useAuth } from '../auth/AuthContext'

const navLink =
  'text-[15px] font-medium text-on-dark transition-colors duration-150 hover:text-white'

export default function Header({ variant = 'landing' }: { variant?: 'landing' | 'page' }) {
  const { user } = useAuth()
  return (
    <header className="sticky top-0 z-40 bg-graphite">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link to="/" aria-label={`${SITE.name} — início`} className="inline-flex min-h-11 items-center rounded-lg">
          <Logo />
        </Link>

        {variant === 'landing' ? (
          <div className="flex items-center gap-8">
            <nav className="hidden items-center gap-8 md:flex" aria-label="Seções da página">
              <a href="#categorias" className={navLink}>Categorias</a>
              <a href="#como-funciona" className={navLink}>Como funciona</a>
              <a href="#abertura" className={navLink}>Abertura</a>
              {!user && <Link to="/entrar" className={navLink}>Entrar</Link>}
            </nav>
            {user ? (
              <Button to="/area" size="sm">Minha conta</Button>
            ) : (
              <Button to={SITE.signupPath} size="sm">Cadastrar</Button>
            )}
          </div>
        ) : (
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-base font-semibold text-white transition-colors duration-150 hover:text-lime"
          >
            <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
            Voltar
          </Link>
        )}
      </div>
    </header>
  )
}
