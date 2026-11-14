import { api } from './api'

/** Estado público do sistema (sem dados pessoais). Consultado uma vez e reaproveitado. */
export type SystemStatus = {
  preRegistrationOpen: boolean
  verificationMode: 'admin' | 'sms'
  passwordRecovery: boolean
  captcha: 'dev' | 'turnstile' | 'pow' | null
}
let cached: Promise<SystemStatus> | null = null
let value: SystemStatus | null = null
export const getStatus = (): Promise<SystemStatus> => (cached ??= api.get<SystemStatus>('/status').then((s) => (value = s)).catch((e) => { cached = null; throw e }))
/** Valor já carregado (síncrono) ou null. Permite abrir /cadastro sem "Carregando" quando a landing já buscou. */
export const peekStatus = (): SystemStatus | null => value
