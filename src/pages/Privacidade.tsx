import LegalPage, { type LegalSection } from '../components/LegalPage'

const SECTIONS: LegalSection[] = [
  {
    title: 'Quem somos',
    body: [
      'O Mapa do Mapa é uma plataforma, em pré-lançamento, que conectará profissionais autônomos a clientes em São Paulo. O pré-cadastro de profissionais está aberto; os pedidos de orçamento estão previstos para 25/11/2026.',
    ],
    pending: 'Razão social, CNPJ, endereço e canal de contato do controlador dos dados.',
  },
  {
    title: 'Dados que coletamos hoje',
    body: [
      'No pré-cadastro, coletamos: número de celular e senha (a senha é guardada de forma irreversível, nunca em texto aberto); aceite destes documentos; nome; foto e apresentação profissional (opcionais); profissões (até 2) e regiões de atendimento (até 2); experiência, disponibilidade, ferramentas, veículo e forma de trabalho; respostas do questionário técnico; e as mensagens trocadas com a equipe pela plataforma.',
      'Não pedimos e-mail. Neste momento o celular não é confirmado por SMS: a equipe do Mapa do Mapa o marca como verificado. Se você ativar os avisos no celular (opcional), guardamos a inscrição técnica do seu aparelho/navegador, necessária para enviar as notificações; você pode desativar quando quiser. Também são registrados dados técnicos de acesso (como endereço IP e data/hora) para segurança e prevenção de fraudes e abusos.',
    ],
    pending: 'Confirmar a lista final de dados, o prazo em que registros técnicos são mantidos (inclusive no provedor de hospedagem) e a necessidade de dados adicionais.',
  },
  {
    title: 'Quem vê seus dados',
    body: [
      'A equipe do Mapa do Mapa analisa cada cadastro e decide se aprova, pede ajustes, rejeita ou suspende. Nenhum perfil é exibido ao público sem aprovação da equipe. Seu celular, sua senha e suas respostas do questionário não são públicos. Se você publicar no mural dos profissionais, seu nome, suas profissões e o texto das postagens e comentários ficam visíveis a outros profissionais cadastrados (o mural não dá acesso ao perfil de ninguém).',
      'Quando os pedidos de orçamento começarem, parte dos dados de profissionais aprovados poderá ser exibida a clientes interessados nos serviços.',
    ],
    pending: 'Quais dados exatos serão exibidos a clientes quando os pedidos abrirem.',
  },
  {
    title: 'Finalidades e base legal',
    body: [
      'Os dados são usados para analisar o cadastro, criar o perfil do profissional, conectá-lo a pedidos de orçamento (quando começarem) e operar a plataforma, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).',
    ],
    pending: 'Base legal de cada finalidade e eventual necessidade de consentimento específico.',
  },
  {
    title: 'Cookies e mensuração de anúncios (Meta)',
    body: [
      'Se você permitir, usamos o Meta Pixel (no navegador) e a Conversions API (no servidor) para medir se os anúncios do Mapa do Mapa funcionam. Quando você conclui o cadastro, podemos enviar à Meta o evento "cadastro concluído" com seu telefone protegido por criptografia irreversível (hash), nunca em texto aberto.',
      'Nada disso é ativado sem a sua autorização. Você pode recusar, mudar de ideia a qualquer momento em "Preferências de privacidade", no rodapé, e o sinal de privacidade do navegador (Global Privacy Control / Do Not Track) é respeitado.',
    ],
    pending: 'Base legal (consentimento), papéis de controlador/operador com a Meta, transferência internacional de dados, prazo de retenção e texto final de cookies.',
  },
  {
    title: 'Compartilhamento',
    body: [
      'Usamos provedores de tecnologia (como hospedagem e banco de dados, na Netlify) que tratam dados em nome da plataforma. Não vendemos dados pessoais.',
    ],
    pending: 'Relação de operadores e terceiros (hospedagem, banco de dados, comunicação) e quais dados cada um recebe.',
  },
  {
    title: 'Direitos do titular',
    body: [
      'A LGPD garante ao titular direitos como confirmação do tratamento, acesso, correção, anonimização, portabilidade e eliminação de dados, entre outros. Para exercê-los, fale com a equipe pela caixa de mensagens da sua área ou pelo Instagram @mapadomapa.',
    ],
    pending: 'Canal de atendimento e nome/contato do encarregado (DPO).',
  },
  {
    title: 'Retenção e segurança',
    body: [
      'Os dados são mantidos pelo tempo necessário às finalidades do serviço. Adotamos medidas como senhas armazenadas de forma irreversível, limites de tentativas de acesso, proteção contra cadastros automatizados e acesso administrativo restrito.',
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
      intro="Explica como o Mapa do Mapa trata dados pessoais. Os itens marcados como “Pendente” dependem de definições da empresa e de revisão jurídica."
      sections={SECTIONS}
    />
  )
}
