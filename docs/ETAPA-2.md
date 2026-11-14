# Mapa do Mapa — Etapa 2: autenticação e armazenamento de usuários

Status: **desenvolvido e testado somente em ambiente local.** Nada foi enviado ao GitHub nem publicado na Netlify.

## 1. O que foi implementado

| Área | Entrega |
|---|---|
| Banco | PostgreSQL (Netlify Database), migrações versionadas, banco local separado da produção |
| Cadastro | Celular brasileiro + senha, confirmação por código SMS temporário, sem e-mail, proteção contra duplicidade |
| Login | Celular + senha, sessões seguras (cookie HttpOnly), proteção contra tentativas abusivas |
| Recuperação | Código por SMS, troca de senha, encerramento de todas as sessões antigas |
| Interface | Telas mobile-first na identidade visual aprovada: `/cadastro`, `/entrar`, `/recuperar-senha`, `/conta` |
| Administração | Base de permissões (papéis) e guarda separada `/admin` + `/api/admin/ping`. **Painel completo não foi feito.** |
| SMS | Simulador **somente local**; nenhum provedor real integrado |

Não foram desenvolvidos: quiz, IA, painel administrativo completo, provedor real de SMS.

## 2. Estrutura

```
netlify/
  database/migrations/       migrações SQL versionadas (aplicadas pelo deploy)
  functions/api.mts          função única da API (/api/*), só repassa para /server
server/                      lógica da API (testável sem a Netlify)
  handler.ts                 roteador, CSRF, rotas /api/dev/* (travadas fora do local)
  services/auth.ts           cadastro, verificação, login, recuperação
  lib/                       phone, password, codes, sessions, rateLimit, audit, db, env, http, clock
  sms/                       interface de provedor + simulador local
src/                         interface (React)
  auth/                      AuthContext e guarda de rota privada
  pages/                     Cadastro, Entrar, RecuperarSenha, Conta, Admin
tests/                       testes unitários e de integração (vitest)
e2e/                         testes no navegador, em tela de celular (Playwright)
```

## 3. Banco de dados

Migrações em `netlify/database/migrations/` (**nunca edite uma migração já aplicada; crie outra**):

- `20261114100000_auth_core.sql` — `users`, `phones`, `profiles`, `professions`, `profile_professions`, `roles`, `user_roles`, `sessions`, `verification_codes`, `sms_messages`, `rate_limits`, `audit_log`
- `20261114100100_seed_roles_and_professions.sql` — papéis `user`/`admin` e as 9 profissões aprovadas (mesmos slugs da landing)

Pontos de projeto:
- **Telefone único no banco** (`UNIQUE` em `phones.e164`): a duplicidade é bloqueada mesmo com requisições simultâneas.
- Senha: **scrypt** (N=2^16, r=8, p=2, sal único). Nunca em texto puro.
- Código SMS: guardado só como **HMAC-SHA256**; vale 10 min; 5 tentativas; uso único.
- Token de sessão: 256 bits aleatórios; no banco fica apenas o **hash SHA-256**.
- Nenhuma conta nasce admin.

### Ambiente local (separado da produção)
O banco local é embutido (PostgreSQL via `@netlify/database`, em `.netlify/`, ignorado pelo git). Não existe conexão com produção.

```bash
npm install
npm run dev          # servidor + API + banco local em http://localhost:5173
npm run db:migrate   # aplica as migrações no banco LOCAL (o dev não aplica sozinho)
npm run db:status    # migrações aplicadas/pendentes
npm run db:reset     # apaga os dados LOCAIS e reaplica as migrações
npm run admin:grant -- "(11) 91234-5678"   # concede admin no banco LOCAL
```

Com o servidor aberto, um botão **"SMS"** aparece no canto da tela (somente em desenvolvimento) mostrando os códigos simulados.

## 4. Regras de segurança (valores em `server/lib/env.ts`)

| Regra | Valor |
|---|---|
| Validade do código SMS | 10 minutos |
| Tentativas por código | 5 (depois invalida) |
| Reenvio do código | 1 por minuto; máx. 5 por hora por número |
| Erros de senha por número | 5 em 15 min → bloqueio (mesmo com a senha certa) |
| Tentativas de login por IP | 30 em 15 min |
| Cadastros por IP | 10 por hora |
| Duração da sessão | 30 dias |
| Sessão de **admin** | precisa ter sido criada há ≤ 8 h (senão pede novo login) |
| Cookie | HttpOnly, SameSite=Lax, Secure em HTTPS |
| CSRF | Origin deve ser o próprio site; só aceita JSON |

Decisão de usabilidade documentada: o **cadastro informa** que um número já tem conta (necessário para o usuário entender o que fazer). Já **login e recuperação não revelam** se um número existe (mesma resposta e mesmo tempo).

## 5. Como rodar os testes

```bash
npm test                          # unitários + integração (banco embutido)
TEST_PG_URL=postgres://... npm test   # mesma suíte contra um PostgreSQL real
npm run dev   # em outro terminal, depois:
npm run test:e2e                  # navegador, tela de celular (requer Playwright)
```

## 6. Relatório de testes (execução local)

Ver o relatório final entregue na conversa. Resumo:
- Unitários + integração: **71 testes** no banco embutido (PostgreSQL 17) e **70 + 1 pulado** em PostgreSQL 16 real (o pulado é o de persistência em disco, só do banco embutido).
- Navegador (celular 390×844): **39 verificações**, executadas 3 vezes seguidas sem falha.

## 7. Configuração necessária para PRODUÇÃO (checklist)

**Antes de publicar, nada abaixo existe ainda.**

1. **Netlify Database:** exige plano *Credit-based*. Instalar `@netlify/database` (já instalado) faz a Netlify provisionar o banco no deploy e aplicar as migrações automaticamente. Só **Team Owner** pode apagar o banco.
2. **`AUTH_SECRET`** (obrigatório, ≥ 32 caracteres aleatórios): definir na Netlify (UI ou `netlify env:set --secret`) com escopo **Functions**. **Não** colocar em `netlify.toml` (variáveis do toml não chegam às funções). Sem ele, a API recusa gerar códigos.
3. **Provedor de SMS real — decisão pendente.** Nenhum foi integrado. Em produção o envio **falha de forma explícita** (HTTP 503) até existir um provedor aprovado, implementando `SmsProvider` em `server/sms/`. O simulador é recusado em produção, mesmo com `SMS_PROVIDER=dev`.
4. **Anti-abuso de SMS (CAPTCHA):** SMS custa dinheiro e pode ser abusado ("SMS pumping"). Os limites por IP/número ajudam, mas recomenda-se desafio anti-robô (ex.: Cloudflare Turnstile) no cadastro e na recuperação antes de abrir ao público.
5. **Rota `/api/*` x redirecionamento SPA — VERIFICAR no deploy preview.** A documentação da Netlify não diz explicitamente se a função com `config.path` tem precedência sobre `/* → /index.html`. Teste: `GET <preview>/api/auth/me` deve devolver JSON `401`, **não** HTML. Se devolver HTML, ajustar o roteamento antes de publicar.
6. **Primeiro administrador:** não existe rota para virar admin (de propósito). Em produção, conceder por uma **migração de dados revisada** (regra da Netlify: dados de produção só mudam por migração) ou por edição manual de um humano na interface do banco. `npm run admin:grant` é só para o banco local.
7. **Deploy previews contêm cópia dos dados de produção (inclusive telefones)** e o link é público. Ativar proteção por senha/SSO antes de compartilhar qualquer preview.
8. **Revisão jurídica** das páginas `/termos` e `/privacidade` (hoje rascunho) **antes** de coletar dados reais. O cadastro grava o aceite (`users.terms_accepted_at`). Definir retenção e a base legal (LGPD) para telefone e IP.
9. **Autenticação de dois fatores para admin** antes de construir o painel completo (hoje: papel + sessão recente + trilha de auditoria).
10. **Backups/snapshots** e acompanhamento da tabela `audit_log` (limpeza periódica).

## 8. Limitações conhecidas

- O banco local embutido atende uma conexão por vez; por isso, só localmente, o acesso é serializado. A concorrência real foi validada em PostgreSQL 16.
- O servidor de desenvolvimento da Netlify encerrava ao ter uma requisição abortada pelo navegador; foi adicionada uma rede de segurança **somente no modo dev** (`vite.config.ts`).
- O TypeScript foi fixado na versão 5.9, porque o empacotador de funções da Netlify ainda não funciona com o TypeScript 7.
- Edge Functions estão desligadas no ambiente local (o projeto não usa e exigiriam o Deno).
