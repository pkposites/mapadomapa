import { REQUESTS_OPEN_LABEL } from '../../shared/launch'

export const STEPS = [
  { title: 'Cadastro gratuito', text: 'Crie sua conta só com celular e senha e escolha até 2 profissões e 2 regiões de São Paulo.' },
  { title: 'Perguntas rápidas', text: 'Responda 3 perguntas práticas por profissão. Leva poucos minutos.' },
  { title: 'Análise da equipe', text: 'Nossa equipe confere cada cadastro. Nada é aprovado automaticamente.' },
  { title: 'Aprovação', text: 'Aprovado, seu perfil fica pronto. Você acompanha tudo na sua área e pelas mensagens.' },
  { title: 'Início dos pedidos', text: `Os pedidos de orçamento começam em ${REQUESTS_OPEN_LABEL}. Quem já está aprovado sai na frente.` },
] as const

export const BENEFITS = [
  {
    id: 'gratis',
    title: 'Cadastro 100% gratuito',
    text: 'Entre antes da abertura e garanta seu lugar na plataforma.',
  },
  {
    id: 'regiao',
    title: 'Pedidos na sua região',
    text: 'Você recebe oportunidades perto de onde atende.',
  },
  {
    id: 'celular',
    title: 'Tudo no celular',
    text: 'Sem computador e sem burocracia. Instale como app.',
  },
  {
    id: 'controle',
    title: 'Você escolhe o que aceitar',
    text: 'Veja o pedido antes e responda só aos que fazem sentido para o seu trabalho.',
  },
] as const
