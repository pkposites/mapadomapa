import { Link } from 'react-router-dom'
import Logo from './Logo'
import { SITE } from '../config/site'

function InstagramIcon() {
  // Lucide não inclui ícones de marcas; contorno no mesmo estilo (traço 1.75).
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  )
}

const link =
  'inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-on-dark transition-colors duration-150 hover:text-white'

export default function Footer() {
  return (
    <footer className="bg-graphite pb-28 text-on-dark md:pb-10">
      <div className="mx-auto max-w-6xl border-t border-white/10 px-5 pt-8 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <Link to="/" aria-label={`${SITE.name} — início`} className="self-start rounded-lg">
            <Logo />
          </Link>

          <nav aria-label="Rodapé" className="flex flex-col md:items-end">
            <a
              href={SITE.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={link}
              aria-label={`Instagram do ${SITE.name} (${SITE.instagramHandle}), abre em nova aba`}
            >
              <InstagramIcon />
              {SITE.instagramHandle}
            </a>
            <Link to="/entrar" className={link}>
              Entrar
            </Link>
            <Link to={SITE.privacyPath} className={link}>
              Política de Privacidade
            </Link>
            <Link to={SITE.termsPath} className={link}>
              Termos de Uso
            </Link>
          </nav>
        </div>

        <p className="mt-8 text-[14px]">
          © 2026 {SITE.name} · {SITE.city}, SP
        </p>
      </div>
    </footer>
  )
}
