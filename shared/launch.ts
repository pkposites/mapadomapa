/**
 * ÚNICO lugar com a data de abertura dos PEDIDOS de orçamento (não é a do pré-cadastro).
 * Para mudar a data em todo o site (landing, contador, área do profissional, textos, mensagens e meta tags),
 * altere só a linha abaixo e publique.
 */
export const REQUESTS_OPEN_DATE = '2026-11-25' // AAAA-MM-DD, horário de Brasília (00:00)

export const REQUESTS_OPEN_LABEL = REQUESTS_OPEN_DATE.split('-').reverse().join('/') // 25/11/2026
export const REQUESTS_OPEN_AT = new Date(`${REQUESTS_OPEN_DATE}T00:00:00-03:00`)
