import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { POLICY } from './env'

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCb(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  )

// scrypt (nativo do Node, sem dependências). Parâmetros no padrão OWASP: N=2^16, r=8, p=2.
const N = 2 ** 16
const R = 8
const P = 2
const KEYLEN = 32
const MAXMEM = 256 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$')
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  })
  return timingSafeEqual(key, expected)
}

// Hash falso usado quando o telefone não existe: o tempo de resposta fica igual
// ao de um login real, sem revelar se o número tem conta.
let dummy: Promise<string> | undefined
export const dummyVerify = async (password: string): Promise<void> => {
  dummy ??= hashPassword('senha-falsa-para-igualar-o-tempo')
  await verifyPassword(password, await dummy)
}

const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '123123123',
  'senha123', 'senha1234', 'password', 'password1', 'qwertyui', 'qwerty123', 'abc12345',
  'brasil123', 'mudar123', 'senhasenha', 'mapadomapa',
])

/** Devolve uma mensagem amigável se a senha não serve; null se estiver ok. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < POLICY.passwordMin) {
    return `Use pelo menos ${POLICY.passwordMin} caracteres na senha.`
  }
  if (password.length > POLICY.passwordMax) return `A senha pode ter no máximo ${POLICY.passwordMax} caracteres.`
  const lower = password.toLowerCase()
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    return 'Essa senha é fácil de adivinhar. Escolha outra, misturando letras e números.'
  }
  return null
}
