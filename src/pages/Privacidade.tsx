import LegalPage, { type LegalSection } from '../components/LegalPage'
import { SITE } from '../config/site'

const SECTIONS: LegalSection[] = [
  {
    title: 'Quem somos',
    body: [
      `O Mapa do Mapa é uma plataforma, em pré-lançamento, que conectará profissionais autônomos a clientes em São Paulo. O pré-cadastro de profissionais está aberto; os pedidos de orçamento estão previstos para ${SITE.requestsOpenLabel}.`,
    ],
    pending: 'Razão social, CNPJ, endereço e canal de contato do controlador dos dados.',
  },
  {
    title: 'Dados que coletamos hoje',
    body: [
      'No pré-cadastro, coletamos: número de celular, e-mail e senha (a senha é guardada de forma irreversível, nunca em texto aberto); aceite destes documentos; nome; foto e apresentação profissional (opcionais); profissões (até 2) e regiões de atendimento (até 2); experiência, disponibilidade, ferramentas, veículo e forma de trabalho; respostas do questionário técnico; e as mensagens trocadas com a equipe pela plataforma.',
      'O e-mail é obrigatório para o cadastro profissional e usado para avisos operacionais, confirmação de conta e pagamento. Você pode escolher receber comunicações promocionais ou um lembrete de instalação nas preferências do seu perfil e retirar esse aceite a qualquer momento. Registramos se o aplicativo foi aberto como app instalado ou ocorreu o evento de instalação, para não insistir no lembrete. Neste momento o celular não é confirmado por SMS: a equipe do Mapa do Mapa o marca como verificado. Se você registrar interesse no plano de destaque (opcional), guardamos a faixa de investimento e as preferências que informar. Se você ativar os avisos no celular (opcional), guardamos a inscrição técnica do seu aparelho/navegador, necessária para enviar as notificações; você pode desativar quando quiser. Também são registrados dados técnicos de acesso (como endereço IP e data/hora) para segurança e prevenção de fraudes e abusos.',
    ],
    pending: 'Confirmar a lista final de dados, o prazo em que registros técnicos são mantidos (inclusive no provedor de hospedagem) e a necessidade de dados adicionais.',
  },
  {
    title: 'Quem vê seus dados',
    body: [
      'A equipe do Mapa do Mapa analisa cada cadastro e decide se aprova, pede ajustes, rejeita ou suspende. Nenhum perfil é exibido ao público sem aprovação da equipe. Seu celular, seu e-mail, sua senha e suas respostas do questionário não são públicos. Se você publicar no mural dos profissionais, seu nome, suas profissões e o texto das postagens e comentários ficam visíveis a outros profissionais cadastrados (o mural não dá acesso ao perfil de ninguém).',
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
    title: 'Análise de uso do site (Microsoft Clarity)',
    body: [
      'Usamos o Microsoft Clarity, ferramenta de análise de uso da Microsoft, para entender como o site e o aplicativo são usados (por exemplo, cliques, rolagem e navegação) e melhorar a experiência. Ele pode gravar a sessão de navegação e usar cookies ou identificadores próprios.',
      'Essa análise carrega desde a primeira tela, em todas as páginas, e não depende da escolha feita no aviso de cookies de anúncios (Meta). Campos de telefone e senha e as áreas privadas (perfil, mensagens e administração) são mascarados: o Clarity não vê o que é digitado nem o conteúdo dessas telas. Os dados são processados pela Microsoft, com os termos e a política de privacidade dela.',
    ],
    pending: 'Base legal (por exemplo, legítimo interesse, com avaliação), transferência internacional de dados, prazo de retenção no Clarity e se será oferecida opção de recusa.',
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
      'Usamos provedores de tecnologia (como hospedagem e banco de dados, na Netlify, e entrega de e-mails transacionais pelo Resend) que tratam dados em nome da plataforma. Não vendemos dados pessoais.',
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
