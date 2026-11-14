export const SITE = {
  name: 'Mapa do Mapa',
  city: 'São Paulo',
  /** Abertura prevista da plataforma (horário de Brasília). */
  launchDate: new Date('2026-12-25T00:00:00-03:00'),
  launchLabel: '25/12/2026',
  signupPath: '/cadastro',
  ctaLabel: 'Quero me cadastrar',
} as const

/** Dias inteiros restantes até a abertura (0 se já passou). */
export function daysUntilLaunch(now: Date = new Date()): number {
  const ms = SITE.launchDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
