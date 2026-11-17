# Próximas etapas — Mapa do Mapa

Solicitações registradas em 17/11/2026. Planejadas para depois da revisão do cadastro; não ativar nem prometer disponibilidade agora.

## Treinamentos (vídeos enviados por Robson)

- Criar uma seção de treinamentos na área do profissional, com vídeos publicados pela administração.
- Aulas iniciais: como atender bem no WhatsApp; como fazer uma boa visita técnica; como fazer um orçamento profissional.
- Definir com Robson as regras de acesso e a publicação dos vídeos. Não acrescentar etapa obrigatória ao cadastro sem validação.

## Orçamentos profissionais — benefício do plano pago

- Criar uma seção de orçamentos para o técnico com plano efetivamente pago e válido.
- A referência visual e de estrutura será o modelo de orçamento da J.A. Instalações já desenvolvido por Robson. Solicitar o modelo aprovado antes de implementar; preservar seu design.
- Permitir personalizar identidade do profissional (nome, logotipo, contatos, quando aplicável), dados do cliente, descrição dos serviços, materiais, mão de obra, valores, condições de pagamento, validade e garantia conforme o modelo aprovado.
- Prever geração de PDF e compartilhamento pelo WhatsApp, histórico e rascunhos próprios. Não expor dados de um técnico a outro; validar a assinatura no servidor.
- Definir o formato, a política de acesso e os detalhes com Robson antes do desenvolvimento.

Status: backlog; nenhuma dessas funcionalidades deve ser implementada nesta etapa.

## E-mails padronizados — Resend

Preparar templates responsivos com a identidade visual do Mapa do Mapa, assunto, texto objetivo, botão para a área correta e versão em texto simples. Definir os disparos a partir dos eventos reais do sistema:

- Cadastro aprovado: boas-vindas, próximos passos e link para acessar a área profissional.
- Lembrete de instalação do app web (PWA): orientar Android/iPhone, sem insistir quando houver sinal de instalação.
- Pagamentos: confirmação de Pix aprovado, pendência, vencimento e cancelamento/estorno quando aplicável; não gerar cobranças só por enviar um e-mail.
- Conheça o plano pago: apresentar benefícios, preço vigente e contratação voluntária.
- Plano pago próximo do vencimento: lembrete antes do fim da vigência, com data e link para renovação; não enviar se renovado.
- Pedido novo: informar oportunidades atribuídas ao profissional elegível e levar à área autenticada; não incluir contato ou dados sensíveis do cliente no e-mail.

Antes de ativar: confirmar domínio remetente e credencial do Resend em ambiente protegido, definir os intervalos dos lembretes, separar avisos transacionais de comunicações promocionais (consentimento/preferências e descadastro), evitar disparos duplicados, enviar somente a endereços confirmados e testar cada template e evento. Aproveitar a integração e a fila de e-mails já existentes. Validar com Robson os textos, valores, prazos e regras antes de lançar.

Status: backlog; não ativar novos disparos agora.
