import { env, isSimulationEnvironment } from '../lib/env'
import { ApiError } from '../lib/http'
import { query } from '../lib/db'

export type SmsMessage = { to: string; purpose: string; body: string }
export interface SmsProvider {
  readonly name: string
  send(msg: SmsMessage): Promise<void>
}

/**
 * SIMULADOR LOCAL: não envia nada. Grava a mensagem em sms_messages para que
 * você leia o código na tela de desenvolvimento. Custo zero.
 */
const devProvider: SmsProvider = {
  name: 'dev',
  async send({ to, purpose, body }) {
    await query('INSERT INTO sms_messages (phone_e164, purpose, provider, body) VALUES ($1, $2, $3, $4)', [
      to,
      purpose,
      'dev',
      body,
    ])
    if (process.env.VITEST !== 'true') console.log(`[SMS simulado] para ${to}: ${body}`)
  },
}

/**
 * Escolha do provedor. Por segurança, o simulador SÓ funciona em ambiente local.
 * Não há provedor real implementado ainda: em produção, enquanto nenhum for
 * integrado e aprovado, o envio falha de forma explícita (nunca "finge" que enviou).
 */
export function getSmsProvider(): SmsProvider {
  const configured = env('SMS_PROVIDER') ?? (isSimulationEnvironment() ? 'dev' : undefined)
  if (configured === 'dev' && isSimulationEnvironment()) return devProvider
  console.error(`[sms] provedor indisponível (SMS_PROVIDER=${configured ?? 'não definido'}).`)
  throw new ApiError(503, 'sms_unavailable', 'Não conseguimos enviar o SMS agora. Tente novamente em alguns minutos.')
}
