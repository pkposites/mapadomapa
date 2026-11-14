import { SITE } from '../config/site'

export const firstName = (full: string | null | undefined) => full?.trim().split(/\s+/)[0] ?? null
/** [nome] vira o primeiro nome; sem nome cadastrado, a saudação fica "Olá!". */
export const personalize = (t: string, full: string | null | undefined) => {
  const f = firstName(full)
  return (f ? t.replace(/\[nome\]/gi, f) : t.replace(/,\s*\[nome\]/gi, '').replace(/\[nome\]/gi, '')).trim()
}
/** Abre o WhatsApp (aplicativo ou web) já com a conversa e o texto prontos. Não usa API paga nem serviço externo. */
export const waUrl = (digits: string, text: string) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`

export const TEMPLATES: { id: string; label: string; text: string }[] = [
  { id: 'verify', label: 'Confirmar celular', text: 'Olá, [nome]! Aqui é a equipe do Mapa do Mapa. Para confirmar o seu cadastro, responda esta mensagem com OK. Obrigado! 💚' },
  { id: 'welcome', label: 'Boas-vindas', text: `Olá, [nome]! 👋\n\nSeja bem-vindo ao Mapa do Mapa!\n\nEstamos preparando tudo para o início dos pedidos de orçamento, previsto para ${SITE.requestsOpenLabel}.\n\nEnquanto isso, complete seu perfil e acompanhe os comunicados por aqui.\n\nEquipe Mapa do Mapa 💚` },
  { id: 'approved', label: 'Cadastro aprovado', text: `Olá, [nome]! Seu cadastro no Mapa do Mapa foi aprovado. Complete seu perfil na sua área do profissional e acompanhe os comunicados. Os pedidos reais estão previstos a partir de ${SITE.requestsOpenLabel}. Equipe Mapa do Mapa 💚` },
  { id: 'changes', label: 'Pedir ajustes', text: 'Olá, [nome]! Precisamos de um ajuste no seu cadastro do Mapa do Mapa. Abra a sua área do profissional para ver a orientação e enviar de novo. Equipe Mapa do Mapa.' },
  { id: 'free', label: 'Mensagem livre', text: '' },
]
