import LegalPage, { type LegalSection } from '../components/LegalPage'

const SECTIONS: LegalSection[] = [
  {
    title: 'Quem somos',
    body: [
      'O Mapa do Mapa é uma plataforma, em pré-lançamento, que conectará profissionais autônomos a clientes em São Paulo.',
    ],
    pending: 'Razão social, CNPJ, endereço e canal de contato do controlador dos dados.',
  },
  {
    title: 'Dados nesta fase de pré-lançamento',
    body: [
      'Nesta fase, o site não possui cadastro nem formulários. Por isso, não coletamos dados pessoais por conta própria. Provedores de hospedagem podem registrar dados técnicos de acesso (como endereço IP) para segurança e funcionamento do serviço.',
    ],
    pending: 'Confirmar com o provedor de hospedagem quais registros técnicos são mantidos e por quanto tempo.',
  },
  {
    title: 'Dados que poderão ser coletados no cadastro',
    body: [
      'Quando o cadastro abrir, a previsão é coletar dados como nome, contato, até 2 profissões escolhidas e as regiões de São Paulo em que o profissional atende.',
    ],
    pending: 'Lista definitiva de dados, após o desenho final do cadastro (próximas etapas do produto).',
  },
  {
    title: 'Finalidades e base legal',
    body: [
      'Os dados serão usados para criar o perfil do profissional, conectá-lo a pedidos de orçamento e operar a plataforma, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).',
    ],
    pending: 'Base legal de cada finalidade e eventual necessidade de consentimento específico.',
  },
  {
    title: 'Compartilhamento',
    body: [
      'Parte dos dados do profissional poderá ser exibida a clientes interessados em seus serviços, e operadores de tecnologia poderão tratar dados em nome da plataforma.',
    ],
    pending: 'Relação de operadores e terceiros (hospedagem, banco de dados, comunicação) e quais dados cada um recebe.',
  },
  {
    title: 'Direitos do titular',
    body: [
      'A LGPD garante ao titular direitos como confirmação do tratamento, acesso, correção, anonimização, portabilidade e eliminação de dados, entre outros. O canal para exercê-los será informado aqui.',
    ],
    pending: 'Canal de atendimento e nome/contato do encarregado (DPO).',
  },
  {
    title: 'Retenção e segurança',
    body: [
      'Os dados serão mantidos pelo tempo necessário às finalidades do serviço e protegidos por medidas técnicas e administrativas adequadas.',
    ],
    pending: 'Prazos de retenção e descrição das medidas de segurança adotadas.',
  },
  {
    title: 'Alterações desta política',
    body: ['Esta política poderá ser atualizada. A versão vigente ficará sempre disponível nesta página.'],
  },
]

export default function Privacidade() {
  return (
    <LegalPage
      title="Política de Privacidade"
      intro="Explica como o Mapa do Mapa tratará dados pessoais. O conteúdo abaixo é um esboço para orientar a revisão jurídica."
      sections={SECTIONS}
    />
  )
}
