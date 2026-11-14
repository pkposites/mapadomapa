import { query } from './db'

/** Registra eventos sensíveis. Nunca grave senhas, códigos ou telefones completos aqui. */
export async function audit(
  event: string,
  opts: { userId?: string | null; ip?: string; details?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await query('INSERT INTO audit_log (user_id, event, ip, details) VALUES ($1, $2, $3, $4)', [
      opts.userId ?? null,
      event,
      opts.ip ?? null,
      JSON.stringify(opts.details ?? {}),
    ])
  } catch (err) {
    // Falha de auditoria não pode derrubar o login; fica no log do servidor.
    console.error('[audit] falha ao registrar evento', event, err)
  }
}
