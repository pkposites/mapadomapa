/** Máscara enquanto digita: 11912345678 → (11) 91234-5678 */
export function maskPhone(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2) // colou com +55
  d = d.slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const isPhoneComplete = (v: string): boolean => v.replace(/\D/g, '').length === 11
