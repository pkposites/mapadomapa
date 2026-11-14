import Logo from './Logo'
import { SITE } from '../config/site'

export default function Footer() {
  return (
    <footer className="bg-graphite pb-28 text-on-dark md:pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-white/10 px-5 pt-8 md:flex-row md:items-center md:justify-between md:px-8">
        <Logo />
        <p className="text-[14px]">
          © 2026 {SITE.name} · {SITE.city}, SP
        </p>
      </div>
    </footer>
  )
}
