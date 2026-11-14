// DDDs válidos no Brasil (ANATEL).
const DDDS = new Set(
  (
    '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 ' +
    '51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'
  ).split(' '),
)

export type PhoneResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; message: string }

/** Aceita "(11) 91234-5678", "11912345678", "+55 11 91234-5678"… e devolve +5511912345678. */
export function parseBrazilMobile(input: unknown): PhoneResult {
  if (typeof input !== 'string') return { ok: false, message: 'Digite o número do seu celular.' }
  let digits = input.replace(/\D/g, '')
  if (!digits) return { ok: false, message: 'Digite o número do seu celular.' }
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2)
  if (digits.length === 10) {
    return { ok: false, message: 'Faltou o 9 na frente do número. Exemplo: (11) 91234-5678.' }
  }
  if (digits.length !== 11) {
    return { ok: false, message: 'Confira o número: use DDD + celular, com 11 números.' }
  }
  if (!DDDS.has(digits.slice(0, 2))) return { ok: false, message: 'Esse DDD não existe. Confira o número.' }
  if (digits[2] !== '9') return { ok: false, message: 'Use um número de celular, que começa com 9 depois do DDD.' }
  return { ok: true, e164: `+55${digits}`, national: digits }
}

/** +5511912345678 → +55 11 9****-5678 (para logs e telas, sem expor o número inteiro). */
export const maskPhone = (e164: string): string => `+55 ${e164.slice(3, 5)} 9****-${e164.slice(-4)}`

/** +5511912345678 → (11) 91234-5678 */
export const formatNational = (e164: string): string => {
  const d = e164.slice(3)
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
