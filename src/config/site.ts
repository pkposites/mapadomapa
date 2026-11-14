export const SITE = {
  name: 'Mapa do Mapa',
  city: 'São Paulo',
  /** Abertura prevista da plataforma (00:00 no horário de Brasília). */
  launchDate: new Date('2026-12-25T00:00:00-03:00'),
  launchLabel: '25/12/2026',
  signupPath: '/cadastro',
  ctaLabel: 'Quero me cadastrar',
  instagramUrl: 'https://www.instagram.com/mapadomapa/',
  instagramHandle: '@mapadomapa',
  privacyPath: '/privacidade',
  termsPath: '/termos',
} as const

export type LaunchState =
  | { status: 'upcoming'; days: number }
  | { status: 'today' }
  | { status: 'open' }

/** Estado da contagem regressiva em um instante (função pura, fácil de testar). */
export function getLaunchState(now: Date = new Date()): LaunchState {
  const diff = SITE.launchDate.getTime() - now.getTime()
  if (diff > 0) return { status: 'upcoming', days: Math.ceil(diff / 86_400_000) }
  return diff > -86_400_000 ? { status: 'today' } : { status: 'open' }
}
