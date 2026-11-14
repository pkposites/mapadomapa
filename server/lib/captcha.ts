import { env, isDevEnvironment } from './env'
import { ApiError } from './http'

/**
 * CAPTCHA anti-robô nas rotas que ENVIAM SMS (cadastro, reenvio e recuperação).
 *
 * Provedores:
 *  - "dev"       simulador, só no ambiente local (aceita o token fixo abaixo). Custo zero.
 *  - "turnstile" Cloudflare Turnstile (API "siteverify" documentada). Exige a chave secreta
 *                TURNSTILE_SECRET_KEY e um widget criado numa conta Cloudflare.
 *  - ausente     produção sem CAPTCHA configurado = FALHA FECHADA (503). Nunca libera sem verificar.
 *
 * Doc: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export const DEV_CAPTCHA_TOKEN = 'dev-captcha-pass'
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

const unavailable = () =>
  new ApiError(503, 'captcha_unavailable', 'A verificação de segurança está indisponível agora. Tente novamente em alguns minutos.')
const failed = () =>
  new ApiError(400, 'captcha_failed', 'Não conseguimos confirmar que você não é um robô. Marque a verificação e tente de novo.')

type Provider = 'dev' | 'turnstile' | null
export function captchaProvider(): Provider {
  const p = env('CAPTCHA_PROVIDER') ?? (isDevEnvironment() ? 'dev' : undefined)
  if (p === 'dev' && isDevEnvironment()) return 'dev' // o simulador nunca vale fora do local
  if (p === 'turnstile' && (env('TURNSTILE_SECRET_KEY') ?? '').length >= 10) return 'turnstile'
  return null
}

export async function verifyCaptcha(token: unknown, ip?: string): Promise<void> {
  const provider = captchaProvider()
  if (!provider) {
    console.error('[captcha] provedor indisponível (configure CAPTCHA_PROVIDER e TURNSTILE_SECRET_KEY).')
    throw unavailable()
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    throw new ApiError(400, 'captcha_required', 'Confirme que você não é um robô para continuar.')
  }
  if (provider === 'dev') {
    if (token !== DEV_CAPTCHA_TOKEN) throw failed()
    return
  }

  // Turnstile: validação no servidor é OBRIGATÓRIA (o widget sozinho não protege).
  let result: { success?: boolean; hostname?: string; 'error-codes'?: string[] }
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env('TURNSTILE_SECRET_KEY'), response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`)
    result = await res.json()
  } catch (err) {
    // Sem resposta do serviço = não libera (falha fechada). Nunca registra a chave secreta.
    console.error('[captcha] falha ao consultar o Turnstile:', (err as Error).message)
    throw unavailable()
  }
  if (!result.success) {
    console.warn('[captcha] token recusado:', (result['error-codes'] ?? []).join(','))
    throw failed()
  }
  // Opcional: restringe aos domínios do site (ex.: TURNSTILE_HOSTNAMES=mapadomapa.com.br).
  const allowed = (env('TURNSTILE_HOSTNAMES') ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  if (allowed.length && !allowed.includes(result.hostname ?? '')) {
    console.warn('[captcha] hostname fora da lista permitida:', result.hostname)
    throw failed()
  }
}
