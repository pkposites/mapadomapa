import { REQUESTS_OPEN_AT, REQUESTS_OPEN_LABEL } from '../../shared/launch'

export const SITE = {
  name: 'Mapa do Mapa',
  city: 'São Paulo',
  /**
   * Abertura dos PEDIDOS de orçamento (clientes pedindo, profissionais respondendo) — ver shared/launch.ts,
   * 00:00 no horário de Brasília. NÃO é a abertura do pré-cadastro — esse é controlado pelo
   * servidor (PRE_REGISTRATION_OPEN) e pode abrir antes.
   */
  requestsOpenDate: REQUESTS_OPEN_AT, // definido em shared/launch.ts (fonte única)
  requestsOpenLabel: REQUESTS_OPEN_LABEL,
  signupPath: '/cadastro',
  ctaLabel: 'Quero me cadastrar gratuitamente',
  instagramUrl: 'https://www.instagram.com/mapadomapa/',
  instagramHandle: '@mapadomapa',
  privacyPath: '/privacidade',
  termsPath: '/termos',
} as const

export type LaunchState =
  | { status: 'upcoming'; days: number }
  | { status: 'today' }
  | { status: 'open' }

/** Estado da contagem regressiva até a abertura dos PEDIDOS (função pura, fácil de testar). */
export function getLaunchState(now: Date = new Date()): LaunchState {
  const diff = SITE.requestsOpenDate.getTime() - now.getTime()
  if (diff > 0) return { status: 'upcoming', days: Math.ceil(diff / 86_400_000) }
  return diff > -86_400_000 ? { status: 'today' } : { status: 'open' }
}
