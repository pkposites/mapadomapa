# Ambiente de HOMOLOGAÇÃO (somente testes) — plano e salvaguardas

**Status: preparado no código e testado localmente. NADA foi criado na Netlify, nada foi enviado ao GitHub e nada foi contratado.**
Decisão do cliente: **sem provedor real de SMS ou WhatsApp nesta fase**; sem contratar serviços externos.

## 1. O que a homologação é (e o que nunca é)
Um site separado do oficial, com banco próprio, protegido por senha, onde se testa cadastro, login, profissões, regiões e questionários **com dados fictícios**.
Nunca: SMS real, OpenAI paga, eventos reais da Meta, CAPTCHA real, credenciais de produção, indexação por buscadores.

## 2. Como o código garante isso (`server/lib/env.ts`)
O "modo homologação" só liga se **todas** as condições forem verdadeiras; qualquer falha = comporta-se como **produção** (falha fechada):
1. `APP_ENV=staging`;
2. `STAGING_HOSTNAME` definido e **igual** ao endereço pelo qual a requisição chegou (o site oficial nunca coincide);
3. **nenhuma** credencial/serviço real no ambiente: `META_CAPI_ACCESS_TOKEN`, `OPENAI_API_KEY`, `TURNSTILE_SECRET_KEY`, `SMS_PROVIDER` (≠ `dev`), `AI_PROVIDER=openai`, `CAPTCHA_PROVIDER=turnstile`.

Quando ligado, libera **apenas** os simuladores que já existem localmente (SMS que grava no banco, CAPTCHA simulado, IA simulada, Meta simulado) e a rota `/api/dev/*`. Respostas levam `X-Robots-Tag: noindex`; o site mostra a faixa **"AMBIENTE DE TESTES"**; cookies são `Secure`. O pré-cadastro só abre com `PRE_REGISTRATION_OPEN=true` explícito.
Testes automatizados: 15 (cada salvaguarda é derrubada individualmente e o sistema volta a recusar SMS/painel).

Limite conhecido: o código **não consegue verificar** se a senha do site está ativa (é configuração da Netlify). Por isso o item 4 do checklist abaixo é manual.

## 3. Variáveis do site de homologação (nomes; valores são definidos no painel da Netlify)
| Definir | Tipo | Escopo | Observação |
|---|---|---|---|
| `APP_ENV` = `staging` | texto | Functions | |
| `STAGING_HOSTNAME` | texto | Functions | endereço do site de homologação (sem https://) |
| `AUTH_SECRET` | **secreta** | Functions | **novo**, diferente do de produção, ≥ 32 caracteres |
| `PRE_REGISTRATION_OPEN` = `true` | texto | Functions | só vale atrás da senha do site |
| `VITE_STAGING_SIM` = `true` | texto | Builds | liga faixa, painel de SMS e simuladores no navegador |

**NÃO definir** nesse site: `META_CAPI_ACCESS_TOKEN`, `VITE_META_PIXEL_ID`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_PROVIDER`, `TURNSTILE_*`, `VITE_TURNSTILE_SITE_KEY`, `CAPTCHA_PROVIDER`, `SMS_PROVIDER`.
As variáveis atuais do site oficial (`VITE_META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`) pertencem **àquele** site e ao contexto de produção; um site novo **não as herda**.

## 4. Isolamento do banco
Cada site da Netlify tem o seu próprio banco. A homologação é um **site novo**, logo com banco novo e vazio, e as migrações rodam só nele. Nunca copiar a string de conexão de um site para outro. (Preview de deploy copia dados do próprio site; aqui não há dados reais.)

## 5. Proteção de acesso
Senha de acesso ao site inteiro (controle de visitantes da Netlify), **definida por você no painel** — assim nenhuma senha passa por chat. O cadastro de teste usa telefone e senha **fictícios criados dentro do app** (ex.: (11) 90000-0001), então não há credenciais pré-criadas a entregar.

## 6. Publicação (ainda NÃO feita)
- Branch própria `homologacao/etapa-3`, que é a branch de produção **do site de homologação**.
- Risco: se o site oficial estiver com "branch deploys: todas", essa branch também faria um deploy no oficial. Mitigação a aplicar na própria branch: `ignore` de build condicionado ao nome do site (o oficial pula). **Não testável sem publicar** — por isso exige aprovação e conferência.
- Backup do código: branch `backup/etapa-3-...` com `[skip netlify]`, como na Etapa 2.

## 7. Custos e alternativas (nada contratado; valores NÃO verificados)
| Opção | Serviço externo | Custo | Observação |
|---|---|---|---|
| **A. Testar pelo celular via pré-visualização da sessão** | nenhum | R$ 0 | Depende do aplicativo exibir a porta do servidor de desenvolvimento; efêmero; sem link próprio. Não confirmei que funciona no seu aparelho |
| **B. Site de homologação na Netlify + Netlify Database** | Netlify (já usada) | **Créditos da Netlify; valor a confirmar por você.** O banco exige plano baseado em créditos (não consigo ver o seu); a documentação informa que o armazenamento era gratuito só até 01/07/2026 e que compute e tráfego consomem créditos | Único caminho online isolado e completo. **Requer aprovação do custo antes de provisionar** |
| **C. Netlify + banco PostgreSQL de terceiros** | novo fornecedor | desconhecido (alguns têm plano gratuito; limites e preços não verificados) | Contraria "sem serviços externos"; só se você pedir |
| D. Sem banco online | — | — | Inviável: o app exige PostgreSQL |

## 8. Roteiro de teste pelo celular (quando houver link)
1. Abra o link e digite a **senha do site** (a que você definiu). Confira a faixa verde **AMBIENTE DE TESTES**.
2. **Criar conta:** "Quero me cadastrar" → celular fictício `(11) 90000-0001` + senha (≥ 8) → marque os termos e **"Não sou um robô (simulado)"** → Continuar.
3. **Código:** toque no botão **SMS** (canto inferior direito), leia o código e digite. Nenhum SMS chega ao aparelho — é o esperado.
4. **Cadastro profissional:** Minha conta → "Começar cadastro profissional": escolha **2** profissões (confira que a 3ª fica bloqueada) → **2** regiões → dados de trabalho → 10 perguntas (uma por tela).
5. **Continuidade:** no meio das perguntas, feche o navegador, abra de novo, entre e veja se continua de onde parou.
6. **Enviar:** revise e envie. Deve aparecer "Cadastro enviado" e o status "em análise" (nada é aprovado automaticamente).
7. **Login/logout:** saia, entre de novo. Erre a senha 5 vezes e veja o bloqueio temporário.
8. **Recuperar senha:** "Esqueci minha senha" → código pelo botão SMS → nova senha → entre.
9. Verifique: nenhum SMS/ligação no seu celular, nada indexado, e o site oficial intacto.

## 9. Checklist antes de publicar (manual)
1. Custo do banco confirmado e aprovado por escrito.
2. Site criado, ligado só à branch `homologacao/etapa-3`; variáveis da seção 3 conferidas (e as proibidas ausentes).
3. `STAGING_HOSTNAME` = endereço real do site.
4. **Senha do site ativa** (abrir em janela anônima e confirmar que pede senha).
5. Site oficial: nenhum deploy novo após o push.

## 10. Pendências para o lançamento público (fora desta fase)
- Provedor real de **SMS ou WhatsApp** (decisão e contrato do cliente).
- CAPTCHA real (Turnstile), OpenAI real e Meta real, com chaves e limites próprios.
- Revisão jurídica dos termos e da privacidade; revisão do conteúdo do questionário por especialistas.
