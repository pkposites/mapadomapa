import LegalPage, { type LegalSection } from '../components/LegalPage'

const SECTIONS: LegalSection[] = [
  {
    title: 'Sobre o serviço',
    body: [
      'O Mapa do Mapa é uma plataforma que pretende aproximar profissionais autônomos de clientes que buscam orçamentos de serviços em São Paulo. O pré-cadastro de profissionais é gratuito e a abertura dos pedidos de orçamento está prevista para 25/11/2026.',
    ],
    pending: 'Descrição jurídica precisa do serviço e do papel da plataforma (intermediação, sem vínculo com a prestação do serviço?).',
  },
  {
    title: 'Cadastro e elegibilidade',
    body: [
      'Para usar a plataforma, o profissional se cadastra com celular e senha, informa dados verdadeiros e pode escolher até 2 profissões e 2 regiões de atendimento. Cada cadastro é analisado pela equipe do Mapa do Mapa, que pode aprová-lo, pedir ajustes, rejeitá-lo ou suspendê-lo. Nenhum perfil é exibido ao público sem aprovação, e a aprovação não garante pedidos.',
    ],
    pending: 'Idade mínima, documentos exigidos e regras de verificação de identidade.',
  },
  {
    title: 'Responsabilidades do profissional',
    body: [
      'O profissional é responsável pelos serviços que oferece, pelos orçamentos que envia e pelo cumprimento da legislação aplicável à sua atividade.',
    ],
    pending: 'Obrigações específicas por categoria (por exemplo, serviços regulados) e regras de conduta.',
  },
  {
    title: 'Orçamentos, pagamentos e custos',
    body: [
      'O cadastro é gratuito. Os pedidos de orçamento estão previstos para 25/11/2026. Condições de orçamento, contratação e pagamento entre profissional e cliente serão detalhadas antes dessa abertura.',
    ],
    pending: 'Modelo de cobrança (se houver), meios de pagamento e política de cancelamento/reembolso.',
  },
  {
    title: 'Uso adequado',
    body: [
      'É proibido usar a plataforma para fraudes, informações falsas, assédio ou qualquer atividade ilegal. Contas poderão ser suspensas em caso de descumprimento.',
    ],
    pending: 'Critérios e processo de suspensão ou exclusão de contas.',
  },
  {
    title: 'Propriedade intelectual',
    body: [
      'Marca, logotipo, textos e interface do Mapa do Mapa pertencem à plataforma e não podem ser usados sem autorização.',
    ],
  },
  {
    title: 'Limitação de responsabilidade',
    body: [
      'A plataforma não garante volume de pedidos ou resultados financeiros e não se responsabiliza pela execução dos serviços contratados diretamente entre profissionais e clientes, nos limites da lei.',
    ],
    pending: 'Redação final com análise do Código de Defesa do Consumidor e do enquadramento da plataforma.',
  },
  {
    title: 'Alterações e foro',
    body: [
      'Estes termos poderão ser atualizados e a versão vigente ficará sempre disponível nesta página. Disputas serão regidas pela lei brasileira.',
    ],
    pending: 'Foro competente e mecanismo de comunicação de mudanças aos usuários.',
  },
]

export default function Termos() {
  return (
    <LegalPage
      title="Termos de Uso"
      intro="Reúne as regras de uso do Mapa do Mapa. Os itens marcados como “Pendente” dependem de definições da empresa e de revisão jurídica."
      sections={SECTIONS}
    />
  )
}
