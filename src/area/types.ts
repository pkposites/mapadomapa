import { REQUESTS_OPEN_LABEL as OPEN } from '../../shared/launch'
export type Announcement = { id: string; title: string; body: string; at: string; read: boolean }
export type Home = {
  name: string | null; firstName: string | null; status: string; statusLabel: string
  decision: { action: string; notes: string | null; at: string } | null
  pendencies: { id: string; text: string; to: string; required: boolean }[]
  unreadMessages: number; unreadAnnouncements: number; announcements: Announcement[]; hasPhoto: boolean
  profilePrepared: boolean; submitted: boolean
}
export type Me = {
  fullName: string | null; bio: string | null; services: string | null; extraInfo: string | null; photoVersion: string | null
  status: string; statusLabel: string
  professions: { slug: string; name: string; experienceYears: number | null; selfLevel: string | null }[]
  regions: string[]
  availability: { weekdays?: string[]; periods?: string[]; emergency?: boolean } | null
  ownTools: string | null; vehicle: string | null; workStructure: string | null
  canEditProfessions: boolean; regionsChangeResubmits: boolean; canEditRegions: boolean
}
export type Msg = { id: string; from: 'admin' | 'professional'; kind: string; body: string; at: string; unread: boolean }
export const STATUS_TONE: Record<string, string> = {
  not_submitted: 'bg-white text-graphite ring-1 ring-line', pending_review: 'bg-[#fff6dd] text-[#7a5a00]', approved: 'bg-[#e4f9c9] text-[#2b5a00]',
  needs_changes: 'bg-[#fff0e0] text-[#8a3b00]', rejected: 'bg-[#fef3f2] text-[#7a271a]', suspended: 'bg-[#fef3f2] text-[#7a271a]',
}
export const STATUS_HINT: Record<string, string> = {
  not_submitted: 'Termine o cadastro e envie para análise.',
  pending_review: 'Nossa equipe está analisando. Você será avisado aqui.',
  approved: `Seu cadastro foi aprovado. Os pedidos reais estão previstos a partir de ${OPEN}.`,
  needs_changes: 'Precisamos de ajustes. Veja a orientação abaixo e reenvie.',
  rejected: 'Seu cadastro não foi aprovado. Fale com a equipe se tiver dúvidas.',
  suspended: 'Seu cadastro está suspenso. Fale com a equipe pela caixa de mensagens.',
}

/** Próximos passos por situação (texto exibido na tela Início). */
export const NEXT_STEPS: Record<string, string[]> = {
  not_submitted: ['Escolha até 2 profissões e 2 regiões.', 'Responda às perguntas rápidas.', 'Envie o cadastro para análise da equipe.'],
  pending_review: ['Aguarde a análise da equipe. Você será avisado aqui e em Mensagens.', 'Enquanto isso, você pode completar a foto e a apresentação no seu perfil.'],
  approved: ['Complete seu perfil (foto, apresentação e serviços) para deixar seu perfil completo.', `Acompanhe os comunicados: os pedidos de orçamento estão previstos a partir de ${OPEN}.`, 'Indique outros profissionais para o pré-cadastro.'],
  needs_changes: ['Leia a orientação da equipe acima.', 'Ajuste o cadastro e envie de novo para análise.'],
  rejected: ['Se tiver dúvidas sobre a decisão, converse com a equipe em Mensagens.'],
  suspended: ['Converse com a equipe em Mensagens para entender o motivo e como regularizar.'],
}
