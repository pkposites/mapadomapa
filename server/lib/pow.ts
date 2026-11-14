import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { addSeconds, now } from './clock'
import { authSecret, env } from './env'
import { hit } from './rateLimit'

/**
 * Desafio anti-robô PRÓPRIO (sem serviço externo): prova de trabalho (hashcash).
 * O servidor assina um desafio; o navegador procura um "nonce" cujo SHA-256 de "desafio:nonce" tenha N
 * bits zero à esquerda (custo ~ 2^N tentativas para quem pede, 1 hash para o servidor conferir).
 * Cada desafio vale 10 min e só pode ser usado UMA vez. Não substitui os limites de tentativas: soma a eles.
 */
const TTL_SECONDS = 600
export const powDifficulty = (): number => {
  const d = Number(env('POW_DIFFICULTY'))
  return Number.isInteger(d) && d >= 8 && d <= 24 ? d : 16
}
const sign = (id: string, exp: number, diff: number): string =>
  createHmac('sha256', authSecret()).update(`pow:${id}.${exp}.${diff}`).digest('base64url').slice(0, 32)

export function issuePowChallenge() {
  const id = randomBytes(12).toString('base64url')
  const exp = Math.floor(addSeconds(now(), TTL_SECONDS).getTime() / 1000)
  const difficulty = powDifficulty()
  return { challenge: `${id}.${exp}.${difficulty}.${sign(id, exp, difficulty)}`, difficulty, expiresIn: TTL_SECONDS }
}

const leadingZeroBits = (buf: Buffer): number => {
  let bits = 0
  for (const byte of buf) {
    if (byte === 0) { bits += 8; continue }
    return bits + Math.clz32(byte) - 24
  }
  return bits
}

/** true se o token "<desafio>:<nonce>" é válido, não expirou e nunca foi usado. */
export async function verifyPow(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 300) return false
  const i = token.lastIndexOf(':')
  if (i < 0) return false
  const challenge = token.slice(0, i)
  const nonce = token.slice(i + 1)
  if (!/^[0-9]{1,12}$/.test(nonce)) return false
  const [id, expS, dS, mac] = challenge.split('.')
  if (!id || !expS || !dS || !mac) return false
  const exp = Number(expS)
  const diff = Number(dS)
  if (!Number.isInteger(exp) || !Number.isInteger(diff) || diff < powDifficulty()) return false // não aceita desafio mais fácil
  if (exp * 1000 < now().getTime()) return false
  const expected = Buffer.from(sign(id, exp, diff))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
  if (leadingZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) < diff) return false
  return (await hit(`pow:${id}`, TTL_SECONDS + 60)) === 1 // uso único (atômico)
}
