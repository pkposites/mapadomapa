# Etapa 4 — Painel administrativo (MVP)

## Acesso
Somente `role = admin` (conferido no SERVIDOR a cada pedido) com sessão de **até 8 h**. Rotas: `/admin` (lista) e `/admin/profissionais/:id` (detalhe). Toda a API `/api/admin/*` devolve 401/403 para quem não é admin.
**Primeiro admin:** `ADMIN_BOOTSTRAP_PHONES` (secreta, Functions, E.164 separados por vírgula). O celular listado pode criar conta mesmo com o pré-cadastro fechado e vira admin **somente se ainda não existir nenhum admin**. Depois disso, remover a variável.

## O que o admin faz
- Ver contagem por situação, filtrar, buscar por celular.
- Consultar dados do profissional, profissões (anos/nível), regiões, disponibilidade, ferramentas, veículo, estrutura; respostas do questionário **em texto** com pontos e alertas de risco; pontuação técnica; avaliação por IA (simulada ou real); histórico de decisões.
- **Aprovar**, **pedir ajustes**, **rejeitar**, **suspender**, **reativar** — motivo obrigatório para ajustes, rejeição e suspensão. Só transições válidas (409 nas demais).
- **Marcar/desmarcar o celular como verificado** (MVP sem SMS).

## Garantias
- **Ninguém decide sobre o próprio cadastro** (403).
- **Aprovação só por humano**: o banco recusa `approved/rejected/suspended/needs_changes` sem `reviewed_by` e `reviewed_at`.
- **Nada público sem aprovação**: única porta pública é a visão `public_professionals` (só aprovados e ativos; sem telefone nem identificador). Suspender ou bloquear a conta tira da visão na hora. API: `GET /api/public/professionals`.
- Trilha: `review_events` (decisões) e `audit_log` (quem VIU dados pessoais e quem decidiu).

## Testes
Servidor: 14 (acesso, listagem, detalhe, todas as transições, autoaprovação, celular, visão pública) + suíte completa 184/184. Navegador (celular): 18/18.
