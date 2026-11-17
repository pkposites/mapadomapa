import { WEEKLY_PRICE_LABEL, WEEKLY_DAYS } from '../../src/area/rechargePlan'

export const appLink = 'https://mapadomapa.netlify.app/area'
export const templates = {
  welcome: { label: 'E-mail confirmado', trigger: 'Ao confirmar o endereço de e-mail', subject: 'Bem-vindo ao Mapa do Mapa!', body: 'Seu e-mail foi confirmado. Acompanhe seu perfil e oportunidades na sua área profissional.', path: '', cta: 'Acessar minha área', optional: false },
  approved: { label: 'Cadastro aprovado', trigger: 'Quando a administração aprova o cadastro', subject: 'Seu cadastro foi aprovado!', body: 'Parabéns! Seu cadastro profissional foi aprovado pela nossa equipe. Complete seu perfil e acompanhe as oportunidades disponíveis para você. A aprovação não garante contratação ou rendimento.', path: '', cta: 'Acessar minha área', optional: false },
  install: { label: 'Instalar aplicativo', trigger: 'Uma vez, após 48h do envio do cadastro e aprovação, com opt-in e sem instalação registrada', subject: 'Instale o Mapa do Mapa no celular', body: 'Tenha sua área profissional sempre à mão. No Android, abra o site no Chrome e escolha Instalar app. No iPhone, abra no Safari, toque em Compartilhar e Adicionar à Tela de Início.', path: '/perfil', cta: 'Ver como instalar', optional: true },
  payment_pending: { label: 'Pix pendente', trigger: 'Uma vez, após 15 minutos sem confirmação e dentro da validade', subject: 'Seu Pix ainda está pendente', body: 'Você iniciou uma recarga, mas o pagamento ainda não foi confirmado. Verifique o status e a validade do Pix na sua área. Se já pagou, aguarde a confirmação, sem pagar novamente.', path: '/recarga', cta: 'Acompanhar pagamento', optional: false },
  payment_expired: { label: 'Pix vencido', trigger: 'Quando o código pendente perde a validade', subject: 'O prazo do seu Pix terminou', body: 'O prazo do código Pix terminou sem confirmação registrada. Confira a situação antes de gerar outro código. Se você já pagou, não faça outro pagamento sem conferir.', path: '/recarga', cta: 'Ver situação do Pix', optional: false },
  payment_paid: { label: 'Pagamento confirmado', trigger: 'Somente após aprovação autenticada pelo Mercado Pago', subject: 'Pagamento Pix confirmado!', body: 'Seu pagamento de '+WEEKLY_PRICE_LABEL+' pela recarga de '+WEEKLY_DAYS+' dias foi confirmado. Confira a validade e as condições do acesso na sua área profissional.', path: '/recarga', cta: 'Ver minha recarga', optional: false },
  payment_cancelled: { label: 'Pagamento cancelado ou recusado', trigger: 'Quando o provedor confirma cancelamento ou recusa', subject: 'Atualização do seu pagamento', body: 'O Mercado Pago informou que a transação foi cancelada ou recusada. Consulte a situação na sua área. Nenhum acesso foi liberado por essa transação.', path: '/recarga', cta: 'Ver pagamento', optional: false },
  payment_refund: { label: 'Estorno ou contestação', trigger: 'Quando o provedor registra estorno ou contestação', subject: 'Atualização de estorno ou contestação', body: 'O provedor registrou um estorno ou uma contestação para uma transação vinculada à sua recarga. Confira a situação e fale com a equipe em caso de dúvidas.', path: '/recarga', cta: 'Ver detalhes', optional: false },
  offer: { label: 'Conheça o plano pago', trigger: 'Uma vez, para aprovado que aceitou ofertas e tem contratação disponível', subject: 'Conheça a recarga semanal do Mapa do Mapa', body: 'A recarga semanal de '+WEEKLY_PRICE_LABEL+' libera o acesso a oportunidades por '+WEEKLY_DAYS+' dias, conforme as regras do plano. A contratação é opcional, sem cobrança automática, e não garante pedidos, contratação ou renda. Confira os benefícios e condições antes de contratar.', path: '/recarga', cta: 'Conhecer o plano', optional: true },
  renewal: { label: 'Plano próximo do vencimento', trigger: 'Até 24 horas antes do fim do período pago, se não renovado', subject: 'Sua recarga vence em breve', body: 'Sua recarga semanal vence nas próximas 24 horas. Confira a data exata na sua área profissional e renove se desejar. Não há cobrança automática.', path: '/recarga', cta: 'Ver validade e renovar', optional: false },
  request: { label: 'Novo pedido', trigger: 'Pedido publicado, compatível ou destinado ao profissional, ainda disponível', subject: 'Nova oportunidade no Mapa do Mapa', body: 'Uma nova oportunidade está disponível para seu perfil. Acesse sua área profissional, confira os detalhes e manifeste interesse se fizer sentido para você.', path: '/pedidos', cta: 'Ver oportunidades', optional: false },
} as const
export type EmailKind = keyof typeof templates
export function isEmailKind(v:unknown):v is EmailKind { return typeof v==='string' && Object.prototype.hasOwnProperty.call(templates,v) }
export function kindForEvent(key:string):EmailKind|null {
  if(key==='welcome'||key==='approved')return key
  if(key.startsWith('request-'))return 'request'
  if(key.startsWith('renewal-'))return 'renewal'
  if(key.startsWith('payment-cancelled-'))return 'payment_cancelled'
  if(key.startsWith('payment-refund-'))return 'payment_refund'
  if(key.startsWith('payment-pending-'))return 'payment_pending'
  if(key.startsWith('payment-expired-'))return 'payment_expired'
  if(key.startsWith('payment-'))return 'payment_paid'
  return null
}
const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>entities[c]??c)
export function renderEmail(kind:EmailKind, body?:string) {
  const t=templates[kind], message=body??t.body, href=appLink+t.path, preferences=appLink+'/perfil#email-preferences'
  return {
    subject:t.subject,
    text:message+'\n\n'+t.cta+': '+href+'\n\n'+(t.optional?'Preferências de e-mail: '+preferences+'\n':'')+'Mapa do Mapa',
    html:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#eef0eb;color:#202621;font-family:Arial,sans-serif;padding:16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-radius:20px;overflow:hidden;background:#fff"><tr><td style="background:#202621;color:#d6ff91;padding:24px;font-size:23px;font-weight:bold">Mapa do Mapa</td></tr><tr><td style="padding:28px"><p style="font-size:12px;color:#616960;letter-spacing:1px;text-transform:uppercase">Área profissional</p><h1 style="font-size:26px;line-height:1.2;margin:0 0 18px">${esc(t.subject)}</h1><p style="font-size:16px;line-height:1.65;margin:0 0 24px">${esc(message).replace(/\n/g,'<br>')}</p><a href="${esc(href)}" style="display:inline-block;background:#d6ff91;color:#202621;border-radius:12px;padding:16px 22px;font-weight:bold;text-decoration:none">${esc(t.cta)}</a><p style="margin:26px 0 0;color:#616960;font-size:12px;line-height:1.6">Mapa do Mapa · Comunicação da área profissional.${t.optional?' <a href="'+esc(preferences)+'" style="color:#202621">Gerenciar preferências de e-mail</a>.':''}</p></td></tr></table></td></tr></table></body></html>`
  }
}
