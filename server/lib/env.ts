/** Leitura de configuração: Netlify.env em funções, process.env em testes/scripts. */
export function env(name: string): string | undefined {
  const n = (globalThis as { Netlify?: { env: { get(k: string): string | undefined } } }).Netlify
  return n?.env.get(name) ?? process.env[name]
}

/**
 * Ambiente local (netlify dev / vite dev / testes). É a ÚNICA condição que libera
 * o simulador de SMS e as rotas /api/dev/*. Em produção e em deploy previews é falso.
 */
export function isDevEnvironment(): boolean {
  return env('CONTEXT') === 'dev' || env('NETLIFY_DEV') === 'true' || process.env.VITEST === 'true'
}

const DEV_SECRET = 'dev-only-secret-never-use-in-production'

/** Segredo para assinar códigos. Fora do ambiente local é obrigatório (falha fechada). */
export function authSecret(): string {
  const s = env('AUTH_SECRET')
  if (s && s.length >= 32) return s
  if (isDevEnvironment()) return DEV_SECRET
  throw new Error('AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres).')
}

/** Parâmetros de política de segurança (todos em um lugar, fáceis de auditar). */
export const POLICY = {
  codeLength: 6,
  codeTtlSeconds: 10 * 60,
  codeMaxAttempts: 5,
  codeResendCooldownSeconds: 60,
  codesPerPhonePerHour: 5,
  sessionTtlSeconds: 30 * 24 * 60 * 60,
  adminSessionMaxAgeSeconds: 8 * 60 * 60,
  loginFailuresPerPhone: { limit: 5, windowSeconds: 15 * 60 },
  loginAttemptsPerIp: { limit: 30, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 10, windowSeconds: 60 * 60 },
  verifyPerPhone: { limit: 10, windowSeconds: 15 * 60 },
  recoveryPerIp: { limit: 10, windowSeconds: 60 * 60 },
  passwordMin: 8,
  passwordMax: 128,
} as const

/**
 * Pré-cadastro (criação de contas) aberto?
 * Local: aberto. Produção: FECHADO por padrão — só abre com PRE_REGISTRATION_OPEN=true.
 * (Diferente da abertura dos PEDIDOS de orçamento, prevista para 25/12/2026.)
 */
export function isPreRegistrationOpen(): boolean {
  const v = env('PRE_REGISTRATION_OPEN')
  if (v === 'true') return true
  if (v === 'false') return false
  return isDevEnvironment()
}

/** Garante que uma URL de banco aponta para a MÁQUINA LOCAL (nunca produção). */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}
