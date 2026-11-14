/** Relógio injetável: os testes avançam o tempo para validar expiração de códigos. */
let source: () => Date = () => new Date()
export const now = (): Date => source()
export const setClock = (fn: (() => Date) | null): void => {
  source = fn ?? (() => new Date())
}
export const addSeconds = (d: Date, s: number): Date => new Date(d.getTime() + s * 1000)
