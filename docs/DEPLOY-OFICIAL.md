# Implantação das Etapas 2 e 3 no site OFICIAL — preparada, NÃO executada

Site: `tangerine-creponne-82936e` (hoje: Etapa 1 estática, deploy `6af7f225…`). Branch de produção: `claude/mapa-do-mapa-stage-1-i7yp10`.
Código candidato: branch local `dev/etapa-2` (Etapas 2 e 3). **Pré-cadastro público fechado por padrão** (`PRE_REGISTRATION_OPEN` não definido).

## O que muda para o público ao implantar
- Entram a API (Functions) e o **banco Netlify do site oficial** (provisionado automaticamente no 1º deploy; consumo de créditos).
- `/cadastro` mostra **"O pré-cadastro abre em breve"** (com a data dos pedidos). `/entrar` e `/recuperar-senha` existem, mas ninguém tem conta.
- Aviso de privacidade (Meta) aparece na landing; com consentimento, o Pixel real carrega (`VITE_META_PIXEL_ID` já definido em produção). Sem contas, a Conversions API fica ociosa.
- Sem provedor de SMS, **mesmo se o pré-cadastro fosse aberto, o cadastro falharia fechado (503)**. Abrir só depois do SMS/WhatsApp real.

## Antes do deploy (variáveis do site oficial, valores definidos no painel)
| Variável | Ação |
|---|---|
| `AUTH_SECRET` (secreta, Functions, ≥ 32 car.) | **definir (nova, só do oficial)** — sem ela a API recusa gerar códigos |
| `PRE_REGISTRATION_OPEN` | **NÃO definir** (fechado) |
| `APP_ENV`, `STAGING_HOSTNAME`, `VITE_STAGING_SIM` | **NÃO definir** (são da homologação; no oficial ligariam simuladores indevidamente — o servidor também recusa pelo host) |
| `VITE_META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` | já existem (produção) — **renovar o token** (foi colado em chat) |
| `SMS_PROVIDER`, `CAPTCHA_PROVIDER`, `TURNSTILE_*`, `OPENAI_*` | não definir ainda |

## Passos (≈ 10 min) — aguardam sua autorização
1. Definir `AUTH_SECRET` no site oficial.
2. Levar o código ao oficial **fazendo push de `dev/etapa-2` para `claude/mapa-do-mapa-stage-1-i7yp10`** (o site oficial é ligado ao Git; o push dispara o deploy). **Não** incluir `[skip netlify]`.
3. Conferir no deploy: 1 função, 4 migrações aplicadas, varredura de segredos limpa.
4. Verificar (site público): `GET /api/auth/me` → **JSON 401** (não HTML); `/cadastro` → "abre em breve"; `GET /api/status` → `{"preRegistrationOpen":false}`; `/api/dev/sms` → 404.
5. Se algo falhar: **corrigir adiante** (reverter o commit e deixar o CI reimplantar). Para segurar um deploy ruim: travar a publicação na lista de Deploys.

## Pendências/decisões antes de abrir ao público
1. **Textos incoerentes com o pré-cadastro fechado:** a landing diz "cadastre-se agora" e "Quero me cadastrar"; hoje isso leva a "abre em breve". Ajustar ou aceitar.
2. **Páginas legais são rascunho** e exibem o aviso "pendente de revisão jurídica" ao público.
3. Provedor real de SMS/WhatsApp (decisão e contrato), Turnstile, OpenAI e revisão do questionário por especialistas.
4. Créditos: 1º deploy do oficial (15) + banco novo; recarga automática continua desligada.
