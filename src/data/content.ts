import { REQUESTS_OPEN_LABEL } from '../../shared/launch'

/** Passos da jornada (landing). */
export const STEPS = [
  { title: 'Crie sua conta', text: 'Só com celular e senha, de graça. Leva menos de um minuto.' },
  { title: 'Monte seu perfil', text: 'Escolha até 2 profissões e 2 regiões, conte sua experiência e responda a 3 perguntas rápidas por profissão.' },
  { title: 'Análise da equipe', text: 'Nossa equipe confere cada cadastro. A aprovação depende dessa análise e nada é automático.' },
  { title: 'Perfil aprovado', text: 'Você acompanha a situação, os comunicados e as mensagens da equipe pelo celular.' },
  { title: 'Início dos pedidos', text: `Pedidos reais previstos a partir de ${REQUESTS_OPEN_LABEL}, para profissionais aprovados.` },
] as const

/** Os quatro benefícios (sem promessa de volume, renda ou contratação). */
export const BENEFITS = [
  { id: 'perfil', title: 'Perfil profissional', text: 'Apresente seus serviços e as regiões de São Paulo onde você atende.' },
  { id: 'oportunidades', title: 'Oportunidades após o lançamento', text: 'Acompanhe, dentro da plataforma, pedidos compatíveis com a sua atividade quando eles começarem. Sem garantia de quantidade.' },
  { id: 'celular', title: 'Tudo no celular', text: 'Acesse pelo celular, inclusive instalando como aplicativo na tela inicial.' },
  { id: 'equipe', title: 'Comunicados e contato com a equipe', text: 'Receba avisos e converse direto com a equipe pela caixa de mensagens.' },
] as const

/** O que existe hoje × o que está previsto × o que é só possibilidade. */
export const AVAILABILITY = {
  now: {
    title: 'Disponível agora',
    items: ['Cadastro gratuito', 'Perfil profissional', 'Acompanhamento da aprovação', 'Aplicativo no celular (instalável)', 'Mensagens e comunicados'],
  },
  soon: {
    title: `Previsto para ${REQUESTS_OPEN_LABEL}`,
    items: ['Início dos pedidos reais de orçamento', 'Acompanhamento das oportunidades dentro da plataforma, para profissionais elegíveis e aprovados'],
  },
  future: {
    title: 'Possibilidades futuras',
    note: 'Ideias em estudo, sem data, regra ou valor definidos. Não são promessas.',
    items: ['Créditos ou recompensas por indicação', 'Benefícios por participação e reputação', 'Destaques por mérito', 'Funcionalidades comerciais adicionais'],
  },
} as const

/** Combinado claro (transparência). */
export const TRANSPARENCY = [
  'O cadastro é gratuito.',
  'A aprovação depende de análise da equipe.',
  'A plataforma está em pré-lançamento.',
  `O início dos pedidos está previsto para ${REQUESTS_OPEN_LABEL}.`,
  'O cadastro não garante oportunidades, contratação nem rendimento.',
  'Condições comerciais futuras serão informadas antes de qualquer cobrança.',
] as const
