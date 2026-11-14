# Etapa 3 — Cadastro profissional

Status: desenvolvido e testado **somente em ambiente local**, na branch de desenvolvimento. Nada publicado.

## Fluxo do usuário (celular)
`/conta` → "Começar cadastro profissional" → `/profissional` (5 passos, salva a cada etapa; pode sair e continuar):
1. **Profissões** — até 2, entre as 9 oficiais.
2. **Regiões** — até 2 de São Paulo (Centro, Zona Norte, Sul, Leste, Oeste — **lista provisória**).
3. **Trabalho** — por profissão: anos de experiência e nível (iniciante a especialista); disponibilidade (dias, períodos, urgência); ferramentas; veículo; estrutura de trabalho.
4. **Questionário técnico** — 5 perguntas por profissão (4 situacionais objetivas + 1 aberta), **uma por tela**, salvas automaticamente.
5. **Revisão e envio** — após enviar fica "em análise" e a edição é bloqueada.

## Regras
- **Máx. 2 profissões e 2 regiões** na API, na tela e no **banco** (gatilhos que valem até com requisições simultâneas).
- **Nada é aprovado automaticamente.** O envio só leva a `pending_review`. No banco, `approved/rejected` exige `reviewed_by` + `reviewed_at` (revisor humano); `requires_human_review` não pode ser `false`.
- **Três conceitos separados** (tabelas distintas):
  - *Pontuação técnica* (`technical_assessments`): 70% questões objetivas + 30% resposta aberta (pesos provisórios), por profissão, com alertas de risco para o revisor.
  - *Reputação* (`professional_reputation`): futura, avaliações de clientes. Não é criada nem alterada pelo cadastro.
  - *Classificação comercial* (`commercial_classification`): futura; a linha só existe se um humano atribuir (`assigned_by` obrigatório).
- Os **pontos, riscos e palavras-chave** do questionário ficam só no servidor; o navegador nunca os recebe. O usuário não vê a própria nota.
- Trocar de profissão apaga respostas e pontuação da que saiu.

## IA (OpenAI) — preparada, simulada localmente
- Avalia **apenas a resposta aberta**; sugere nota (0–100), resumo e alertas para o revisor. **Nunca aprova nem reprova.**
- Local: sempre **simulação** determinística, sem rede e sem custo — mesmo com chave configurada.
- Produção: só com `AI_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_MODEL` (sem valor padrão no código). Usa a Responses API com `json_schema` estrito e `store:false`, timeout 15 s, remoção de telefone/e-mail/CPF antes de enviar, texto do candidato tratado como dado não confiável (defesa contra injeção de prompt), saída validada e limitada a 0–100.
- Falha da IA (HTTP, recusa, formato) não impede o envio: fica "em análise" com alerta `avaliacao_ia_falhou` e só a nota objetiva.

## Banco (migração `20261115100000_professional_profile`)
`service_regions`, `professional_regions`, `professional_profiles`, `assessment_answers`, `technical_assessments`, `ai_evaluations`, `professional_reputation`, `commercial_classification` + colunas `experience_years`/`self_level` em `profile_professions`.

## API (exige login)
`GET /api/pro/catalog` · `GET /api/pro/profile` · `PUT /api/pro/professions|regions|work|answers` · `POST /api/pro/submit`

## Testes feitos
- Servidor: 20/20 (acesso, limites incl. concorrência no banco, validações, continuidade, envio, não-aprovação, separação, OpenAI com rede simulada e falhas).
- Navegador (390×844 e 320 px): 18/18 (limites na tela, continuidade após recarregar, sem rolagem horizontal, alvos ≥ 44 px, envio e bloqueio).
- Não repetida nesta etapa a suíte completa anterior (118) nem o PostgreSQL real.

## Pendências
1. **Conteúdo do questionário** é proposta inicial: precisa de revisão por especialistas de cada área.
2. **Regiões** e **pesos** da pontuação: confirmar com o negócio.
3. OpenAI real: nunca testada com chamada de verdade (por decisão); validar em homologação com limite de gasto.
4. Revisão administrativa (painel) fica para a Etapa 4 — não iniciada.

## Homologação (preparação)
Ver `docs/HOMOLOGACAO.md`: modo homologação implementado e testado localmente (15 testes), com salvaguardas de host, ausência de credenciais reais, `noindex` e faixa de "ambiente de testes". **Nada publicado.**
Decisão do cliente: **sem SMS/WhatsApp real nesta fase** (pendência do lançamento público).
