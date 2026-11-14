import { describe, expect, it } from 'vitest'
import { formatNational, maskPhone, parseBrazilMobile } from '../server/lib/phone'
import { hashPassword, passwordProblem, verifyPassword } from '../server/lib/password'

describe('telefone brasileiro', () => {
  it.each([
    ['(11) 91234-5678', '+5511912345678'],
    ['11912345678', '+5511912345678'],
    ['+55 11 91234-5678', '+5511912345678'],
    ['5511912345678', '+5511912345678'],
    ['(55) 99123-4567', '+5555991234567'], // DDD 55 não pode ser confundido com o código do país
    ['(21) 98765-4321', '+5521987654321'],
  ])('aceita %s', (input, e164) => {
    const r = parseBrazilMobile(input)
    expect(r.ok && r.e164).toBe(e164)
  })

  it.each([
    ['', 'Digite o número'],
    ['1191234567', 'Faltou o 9'], // 10 dígitos
    ['(11) 3123-4567', 'Faltou o 9'], // fixo
    ['(00) 91234-5678', 'DDD'],
    ['(10) 91234-5678', 'DDD'],
    ['(11) 81234-5678', 'começa com 9'],
    ['123', 'Confira'],
  ])('recusa %s com mensagem útil', (input, hint) => {
    const r = parseBrazilMobile(input)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toContain(hint)
  })

  it('mascara e formata', () => {
    expect(maskPhone('+5511912345678')).toBe('+55 11 9****-5678')
    expect(formatNational('+5511912345678')).toBe('(11) 91234-5678')
  })
})

describe('senha', () => {
  it('faz hash com salt (hashes diferentes) e confere corretamente', async () => {
    const a = await hashPassword('senha-boa-123')
    const b = await hashPassword('senha-boa-123')
    expect(a).not.toBe(b)
    expect(a.startsWith('scrypt$')).toBe(true)
    expect(a).not.toContain('senha-boa-123')
    expect(await verifyPassword('senha-boa-123', a)).toBe(true)
    expect(await verifyPassword('senha-boa-124', a)).toBe(false)
  })

  it('política: tamanho mínimo, senhas óbvias e repetidas', () => {
    expect(passwordProblem('abc')).toContain('pelo menos 8')
    expect(passwordProblem('12345678')).toContain('fácil de adivinhar')
    expect(passwordProblem('aaaaaaaaaa')).toContain('fácil de adivinhar')
    expect(passwordProblem('x'.repeat(200))).toContain('no máximo')
    expect(passwordProblem('minha-senha-segura-42')).toBeNull()
  })
})
