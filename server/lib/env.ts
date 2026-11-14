import { AsyncLocalStorage } from 'node:async_hooks'

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

// ---------------------------------------------------------------------------------------------
// MODO HOMOLOGAÇÃO (staging): ambiente online SÓ para testes, com dados fictícios.
// Libera exatamente o que é "simulado" no ambiente local (SMS, CAPTCHA, IA, Meta) — e nada além.
// Salvaguardas (todas obrigatórias; qualquer falha = modo desligado, ou seja, comporta-se como produção):
//   1. APP_ENV=staging;
//   2. STAGING_HOSTNAME definido e IGUAL ao endereço pelo qual a requisição chegou;
//   3. NENHUMA credencial de produção/serviço pago presente no ambiente (ver FORBIDDEN_IN_STAGING).
// O acesso ao site também deve estar protegido por senha na Netlify (isso é configurado fora do código).
// ---------------------------------------------------------------------------------------------
const FORBIDDEN_IN_STAGING = ['META_CAPI_ACCESS_TOKEN', 'OPENAI_API_KEY', 'TURNSTILE_SECRET_KEY'] as const

export type StagingCheck = { ok: true } | { ok: false; reason: string }
export function checkStaging(requestHost: string | null | undefined): StagingCheck {
  if (env('APP_ENV') !== 'staging') return { ok: false, reason: 'APP_ENV não é "staging"' }
  const expected = (env('STAGING_HOSTNAME') ?? '').toLowerCase().trim()
  if (!expected) return { ok: false, reason: 'STAGING_HOSTNAME não definido' }
  if ((requestHost ?? '').toLowerCase().split(':')[0] !== expected) return { ok: false, reason: 'endereço da requisição diferente de STAGING_HOSTNAME' }
  const present = FORBIDDEN_IN_STAGING.filter((k) => Boolean(env(k)))
  if (env('SMS_PROVIDER') && env('SMS_PROVIDER') !== 'dev') present.push('SMS_PROVIDER' as never)
  if (env('AI_PROVIDER') === 'openai') present.push('AI_PROVIDER' as never)
  if (env('CAPTCHA_PROVIDER') === 'turnstile') present.push('CAPTCHA_PROVIDER' as never)
  if (present.length) return { ok: false, reason: `credenciais/serviços reais presentes (${present.join(', ')}). Homologação nunca pode tê-los` }
  return { ok: true }
}

const requestContext = new AsyncLocalStorage<{ staging: boolean }>()
/** Executa uma requisição sabendo se ela chegou a um ambiente de homologação VÁLIDO. */
export function runInRequestContext<T>(requestHost: string | null | undefined, fn: () => T): T {
  const c = checkStaging(requestHost)
  if (!c.ok && env('APP_ENV') === 'staging') console.error(`[staging] simulação RECUSADA: ${c.reason}.`) // só nomes, nunca valores
  return requestContext.run({ staging: c.ok }, fn)
}
export const isStagingSimulation = (): boolean => requestContext.getStore()?.staging === true

/** Ambiente onde simuladores são permitidos: computador local OU homologação validada. NUNCA produção. */
export const isSimulationEnvironment = (): boolean => isDevEnvironment() || isStagingSimulation()
