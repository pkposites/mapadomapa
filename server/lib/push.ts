import webpush from 'web-push'
import { now } from './clock'
import { query } from './db'
import { env, isSimulationEnvironment } from './env'

/**
 * Notificações push (Web Push, padrão aberto; sem serviço pago).
 * - Sem VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY: desligado.
 * - Ambiente local/homologação: NUNCA envia pela rede (apenas registra o que enviaria).
 * - O texto é genérico de propósito: mensagens e decisões não aparecem na tela de bloqueio.
 * - Falha de envio nunca derruba a ação principal (mensagem, decisão, comunicado).
 */
export type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }
export type Payload = { title: string; body: string; url: string; tag: string }
type Sender = (sub: Sub, payload: string) => Promise<void>
let injected: Sender | null = null
/** Só para testes. */
export const setPushSender = (s: Sender | null): void => { injected = s }
export const simOutbox: Payload[] = []

export const pushConfigured = (): boolean => Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'))
export const vapidPublicKey = (): string | null => (pushConfigured() ? env('VAPID_PUBLIC_KEY')! : null)

// Só serviços de push dos navegadores (evita que alguém cadastre um endpoint qualquer para o servidor chamar).
const HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/]
export function endpointAllowed(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 600) return false
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.username && !u.password && HOSTS.some((r) => r.test(u.hostname))
  } catch { return false }
}

async function deliver(sub: Sub, payload: string): Promise<void> {
  if (injected) return injected(sub, payload)
  if (isSimulationEnvironment()) { simOutbox.push(JSON.parse(payload)); return }
  webpush.setVapidDetails(env('VAPID_SUBJECT') ?? 'https://mapadomapa.netlify.app', env('VAPID_PUBLIC_KEY')!, env('VAPID_PRIVATE_KEY')!)
  await webpush.sendNotification(sub, payload, { TTL: 86_400, urgency: 'normal', timeout: 5000 })
}

const TOPIC = { messages: 'topic_messages', announcements: 'topic_announcements' } as const

/** Avisa os aparelhos dos usuários (ou de todos, se userIds = null) que ativaram o tópico. Nunca lança erro. */
export async function notify(topic: keyof typeof TOPIC, userIds: string[] | null, payload: Payload): Promise<{ attempted: number; ok: number }> {
  const out = { attempted: 0, ok: 0 }
  try {
    if (!pushConfigured() && !injected) return out
    if (userIds && userIds.length === 0) return out
    const col = TOPIC[topic]
    const rows = await query<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>(
      `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE ${col} AND ($1::uuid[] IS NULL OR user_id = ANY($1::uuid[])) ORDER BY id LIMIT 2000`, [userIds])
    const text = JSON.stringify(payload)
    const work = async () => {
      for (let i = 0; i < rows.length; i += 25) {
        await Promise.all(rows.slice(i, i + 25).map(async (r) => {
          out.attempted++
          try {
            await deliver({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, text)
            out.ok++
            await query('UPDATE push_subscriptions SET last_success_at = $2, failures = 0 WHERE id = $1', [r.id, now()])
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [r.id]) // aparelho desinstalou/revogou
            else await query('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1', [r.id])
          }
        }))
      }
    }
    await Promise.race([work(), new Promise((res) => setTimeout(res, 7000))]) // não prende a resposta da API
    await query('DELETE FROM push_subscriptions WHERE failures >= 5')
  } catch (err) {
    console.warn('[push] falha ao notificar:', (err as Error).message) // sem dados pessoais
  }
  return out
}

export const MSG_PAYLOAD: Payload = { title: 'Mapa do Mapa', body: 'Você tem uma nova mensagem da equipe.', url: '/area/mensagens', tag: 'mensagem' }
export const DECISION_PAYLOAD: Payload = { title: 'Mapa do Mapa', body: 'Há uma atualização sobre o seu cadastro.', url: '/area/mensagens', tag: 'mensagem' }
export const announcementPayload = (title: string): Payload => ({ title: 'Mapa do Mapa', body: `Novo comunicado: ${title}`.slice(0, 110), url: '/area', tag: 'comunicado' })
