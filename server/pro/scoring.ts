import { QUESTIONNAIRE_VERSION, QUESTIONNAIRES, type ChoiceQuestion } from './questions'

/**
 * PONTUAÇÃO TÉCNICA = só conhecimento técnico da profissão.
 * Não usa reputação (avaliação de clientes) nem classificação comercial — são conceitos separados.
 * Pesos provisórios (a validar com o negócio): 70% objetivas + 30% resposta aberta.
 */
export const WEIGHTS = { rule: 0.7, ai: 0.3 } as const

export type AnswerMap = Record<string, { choice?: string | null; text?: string | null }>

export function ruleScore(slug: string, answers: AnswerMap): { score: number; flags: string[] } {
  const choices = (QUESTIONNAIRES[slug] ?? []).filter((x): x is ChoiceQuestion => x.kind === 'choice')
  if (choices.length === 0) return { score: 0, flags: [] }
  let got = 0
  const flags: string[] = []
  for (const qn of choices) {
    const opt = qn.options.find((op) => op.id === answers[qn.id]?.choice)
    got += opt?.points ?? 0
    if (opt?.risk) flags.push(`risco:${qn.id}:${opt.risk}`) // vai para o revisor humano
  }
  return { score: Math.round((got / (choices.length * 3)) * 100), flags }
}

export function technicalScore(rule: number, ai: number | null): number {
  return ai === null ? rule : Math.round(WEIGHTS.rule * rule + WEIGHTS.ai * ai)
}
export { QUESTIONNAIRE_VERSION }
