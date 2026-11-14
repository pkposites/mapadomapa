import { api } from './api'

/** Estado público do sistema (sem dados pessoais). Consultado uma vez e reaproveitado. */
export type SystemStatus = {
  preRegistrationOpen: boolean
  verificationMode: 'admin' | 'sms'
  passwordRecovery: boolean
  captcha: 'dev' | 'turnstile' | 'pow' | null
}
let cached: Promise<SystemStatus> | null = null
export const getStatus = (): Promise<SystemStatus> => (cached ??= api.get<SystemStatus>('/status').catch((e) => { cached = null; throw e }))
