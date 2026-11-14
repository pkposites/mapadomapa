# Mapa do Mapa — Etapa 2: autenticação, segurança e rastreamento

Status: **desenvolvido e testado somente em ambiente local.** Nada foi publicado na Netlify. Ver seção 9 sobre o envio ao GitHub.

## 1. O que existe

| Área | Entrega |
|---|---|
| Banco | PostgreSQL (Netlify Database), 3 migrações versionadas, banco local separado da produção |
| Cadastro | Celular brasileiro + senha, confirmação por código SMS temporário, sem e-mail, proteção contra duplicidade |
| Login e recuperação | Celular + senha; recuperação por código SMS; sessões em cookie HttpOnly; bloqueio de tentativas abusivas |
| Anti-robô | CAPTCHA nas rotas que enviam SMS (cadastro, reenvio, recuperação): simulado no local, Cloudflare Turnstile pronto para produção |
| Pré-cadastro | Controlado por `PRE_REGISTRATION_OPEN` (produção nasce **fechado**) — **diferente** da abertura dos *pedidos* (25/11/2026) |
| Interface | `/cadastro`, `/entrar`, `/recuperar-senha`, `/conta` (privada), `/admin` (guarda de permissão) |
| Administração | Só a base: papel `admin`, guarda separada, sessão de admin ≤ 8 h, auditoria. **Sem painel.** |
| Meta Ads | Meta Pixel (navegador) + Conversions API (servidor), deduplicação por `event_name` + `event_id`, consentimento, GPC/DNT |
| SMS | Simulador **somente local**; nenhum provedor real integrado |

Fora do escopo desta etapa: quiz, IA, painel administrativo completo, provedor real de SMS.

## 2. Estrutura

```
netlify/database/migrations/   migrações SQL (aplicadas pelo deploy; nunca edite uma já aplicada)
netlify/functions/api.mts      função única da API; /api/* chega aqui por regra no netlify.toml
server/                        lógica da API (testável sem a Netlify)
  lib/                         phone, password, codes, sessions, rateLimit, captcha, meta, db, env, http, audit
  services/auth.ts             cadastro, verificação, login, recuperação
  sms/                         interface de provedor + simulador local
src/                           interface React (auth/, pages/, components/, lib/)
tests/  e2e/                   testes de servidor (vitest) e de navegador (Playwright)
```

## 3. Banco de dados

Migrações: `auth_core` (usuários, telefones, perfis, profissões, papéis, sessões, códigos, SMS, limites, auditoria), `seed_roles_and_professions` (papéis e as 9 profissões aprovadas) e `tracking_events` (eventos enviados à Meta, só com dados em hash).

- Telefone **único no banco** (índice `UNIQUE`): vale mesmo com requisições simultâneas.
- Senha: scrypt (N=2^16, r=8, p=2). Código SMS: só o HMAC-SHA256. Token de sessão: só o hash SHA-256.
- Nenhuma migração apaga dados nem cria usuários/admins (verificado por teste automático).

### Comandos locais
```bash
npm install
npm run dev          # site + API + banco local em http://localhost:5173
npm run db:migrate   # aplica migrações no banco LOCAL (o dev não aplica sozinho)
npm run db:status    # migrações aplicadas/pendentes
npm run db:reset     # apaga dados LOCAIS e reaplica
npm run admin:grant -- "(11) 91234-5678"   # admin no banco LOCAL (recusa banco não local)
npm test             # servidor (vitest, banco embutido)
npm run test:e2e     # navegador, celular (precisa do `npm run dev` ligado)
```
Com o servidor aberto, o botão **"SMS"** (canto da tela, só em desenvolvimento) mostra os códigos simulados, o CAPTCHA simulado e os eventos Meta simulados (navegador × servidor, com o mesmo `event_id`).

## 4. Isolamento: nada local altera produção
- O ambiente local **recusa** conectar em banco que não seja `localhost`/`127.0.0.1` (mesmo se alguém exportar a URL de produção).
- A suíte de testes só aceita `TEST_PG_URL` local com "test" no nome (ela apaga o schema).
- `/api/dev/*`, o simulador de SMS, o CAPTCHA simulado e o modo "simulado" da Meta só existem no ambiente local. Em produção são recusados.
- Migrações só criam estrutura e dados de referência.

## 5. Regras de segurança (`server/lib/env.ts`)
Código SMS: 10 min, 5 tentativas, uso único; reenvio 1/min (máx. 5/h). 5 erros de senha por número em 15 min = bloqueio. Limites por IP em login (30/15 min) e cadastro (10/h). Sessão 30 dias; **admin ≤ 8 h**. Cookie HttpOnly + SameSite=Lax + Secure em HTTPS. CSRF: Origin do próprio site e só JSON. Logout com falha de rede **avisa** em vez de fingir que saiu.

## 6. Pré-cadastro × abertura dos pedidos
- **Pré-cadastro:** quando criar contas é permitido. Servidor: `PRE_REGISTRATION_OPEN` (local aberto; produção fechado até `true`). Fechado, `/cadastro` mostra "abre em breve".
- **Abertura dos pedidos (25/11/2026):** quando clientes pedem orçamentos. É a data da contagem regressiva e dos textos da landing.

## 7. Variáveis de ambiente (nomes e escopos; **nunca valores neste repositório**)

| Variável | Tipo | Escopo Netlify | Obs. |
|---|---|---|---|
| `AUTH_SECRET` | secreta | Functions | ≥ 32 caracteres. Sem ela a API não gera códigos |
| `SMS_PROVIDER` | texto | Functions | provedor real (ainda não integrado). `dev` é recusado fora do local |
| `PRE_REGISTRATION_OPEN` | texto | Functions | `true` abre o pré-cadastro |
| `CAPTCHA_PROVIDER` | texto | Functions | `turnstile` em produção |
| `TURNSTILE_SECRET_KEY` | secreta | Functions | chave secreta do widget |
| `TURNSTILE_HOSTNAMES` | texto | Functions | opcional: domínios permitidos |
| `VITE_TURNSTILE_SITE_KEY` | pública | Builds | chave pública do widget |
| `VITE_META_PIXEL_ID` | pública | Builds + Functions | **já criada** (contexto produção) |
| `META_CAPI_ACCESS_TOKEN` | secreta | Functions | **já criada** (contexto produção, secret) |
| `META_TEST_EVENT_CODE` | texto | Functions | opcional. Atenção: eventos de teste **também contam** como conversão |
| `META_GRAPH_VERSION` | texto | Functions | opcional; padrão `v25.0` |

Variáveis de runtime **não** podem ficar no `netlify.toml` (não chegam às funções). Secrets exigem contexto e escopo explícitos.

## 8. Relatório de testes (execução local)

| Teste | Resultado |
|---|---|
| Servidor (unitário + integração), banco embutido PostgreSQL 17 | 118/118 |
| Suíte anterior em PostgreSQL 16 real (concorrência de verdade) | passou; **os testes novos (CAPTCHA, Meta, pré-cadastro, isolamento) não foram repetidos nele** |
| Navegador — autenticação, em celular (390×844) | 45/45, 3 execuções seguidas |
| Navegador — Meta (consentimento, GPC, deduplicação, zero tráfego à Meta) | 22/22 |
| Auditoria de celular (320, 375, 390, 414 px) | aprovada |
| `/api/auth/me` sem sessão | JSON 401 (também com `Accept: text/html`) |
| Varredura de credenciais (código, histórico git, build, logs) | limpa |

Prova do roteamento: **sem** a regra `/api/*` no `netlify.toml`, `/api/auth/me` devolve a página HTML (200); **com** a regra, JSON 401. Um teste automático impede reordenar a regra.

## 9. Pendências e riscos conhecidos
1. **Servidor de desenvolvimento da Netlify** usa 50–130% de CPU em repouso e ~0,5 s por requisição; parece custo do middleware da ferramenta. Não afeta produção. Se travar, reinicie `npm run dev`.
2. **Produção ainda não funciona de ponta a ponta (de propósito):** falta provedor de SMS, `AUTH_SECRET`, chaves do Turnstile e `PRE_REGISTRATION_OPEN=true`.
3. **Verificar no primeiro deploy preview:** `GET /api/auth/me` deve devolver JSON 401 (a documentação da Netlify não confirma a precedência de função × redirecionamento em produção).
4. **Token da Meta** foi colado em conversa; recomenda-se renová-lo e regravar como secret por canal seguro.
5. Deploy previews copiam dados de produção (inclusive telefones) e o link é público: proteger com senha antes de compartilhar.
6. Revisão jurídica de `/termos` e `/privacidade` (a seção de cookies/Meta é rascunho) antes de coletar dados reais.
7. Primeiro admin em produção: migração de dados revisada, nunca por rota.
8. 2FA para admin antes do painel completo.
9. Limitações do ambiente local: banco embutido atende uma conexão por vez (acesso serializado só no local); TypeScript fixado em 5.9 (o empacotador da Netlify não suporta o 7); Edge Functions desligadas localmente.
