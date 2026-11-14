-- Etapa 3 — cadastro profissional: profissões (máx. 2), regiões (máx. 2), perfil de trabalho,
-- questionário técnico, avaliação por IA (simulada/real) e a SEPARAÇÃO entre
-- pontuação técnica × reputação × classificação comercial.
-- Regra de ouro: NADA aqui é aprovado automaticamente. Aprovação/reprovação exige um revisor humano.

-- ---- Regiões de atendimento (dados de referência; lista provisória, a confirmar) ----
CREATE TABLE service_regions (
  id         smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order smallint NOT NULL,
  active     boolean NOT NULL DEFAULT true
);
INSERT INTO service_regions (slug, name, sort_order) VALUES
  ('centro',     'Centro',      1),
  ('zona-norte', 'Zona Norte',  2),
  ('zona-sul',   'Zona Sul',    3),
  ('zona-leste', 'Zona Leste',  4),
  ('zona-oeste', 'Zona Oeste',  5);

CREATE TABLE professional_regions (
  user_id    uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  region_id  smallint NOT NULL REFERENCES service_regions (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, region_id)
);

-- ---- Experiência e nível por profissão (a tabela já existia na Etapa 2) ----
ALTER TABLE profile_professions
  ADD COLUMN experience_years smallint CHECK (experience_years BETWEEN 0 AND 60),
  ADD COLUMN self_level text CHECK (self_level IN ('beginner', 'intermediate', 'advanced', 'expert'));

-- ---- Limite de 2 profissões e 2 regiões garantido PELO BANCO (vale mesmo com requisições simultâneas) ----
CREATE FUNCTION enforce_max_two_professions() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE user_id = NEW.user_id FOR UPDATE; -- serializa inserções do mesmo usuário
  IF (SELECT count(*) FROM profile_professions WHERE user_id = NEW.user_id) >= 2 THEN
    RAISE EXCEPTION 'max_two_professions' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER profile_professions_max_two BEFORE INSERT ON profile_professions
  FOR EACH ROW EXECUTE FUNCTION enforce_max_two_professions();

CREATE FUNCTION enforce_max_two_regions() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE user_id = NEW.user_id FOR UPDATE;
  IF (SELECT count(*) FROM professional_regions WHERE user_id = NEW.user_id) >= 2 THEN
    RAISE EXCEPTION 'max_two_regions' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER professional_regions_max_two BEFORE INSERT ON professional_regions
  FOR EACH ROW EXECUTE FUNCTION enforce_max_two_regions();

-- ---- Perfil profissional e andamento do cadastro ----
CREATE TABLE professional_profiles (
  user_id        uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  availability   jsonb,
  own_tools      text CHECK (own_tools IN ('none', 'basic', 'complete')),
  vehicle        text CHECK (vehicle IN ('none', 'moto', 'car', 'van', 'pickup')),
  work_structure text CHECK (work_structure IN ('solo', 'helper', 'team', 'company')),
  -- passo em que o usuário parou (permite continuar depois)
  current_step   smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 5),
  review_status  text NOT NULL DEFAULT 'not_submitted'
                   CHECK (review_status IN ('not_submitted', 'pending_review', 'needs_changes', 'approved', 'rejected')),
  submitted_at   timestamptz,
  -- Preenchidos SOMENTE por um administrador (painel futuro). Nunca pela IA.
  reviewed_by    uuid REFERENCES users (id),
  reviewed_at    timestamptz,
  review_notes   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Aprovar ou reprovar exige revisor humano identificado.
  CONSTRAINT decision_requires_human_reviewer
    CHECK (review_status NOT IN ('approved', 'rejected') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

-- ---- Respostas do questionário técnico ----
CREATE TABLE assessment_answers (
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  profession_id smallint NOT NULL REFERENCES professions (id),
  question_id   text NOT NULL,
  choice        text,
  text_answer   text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profession_id, question_id),
  CHECK (choice IS NOT NULL OR text_answer IS NOT NULL),
  CHECK (text_answer IS NULL OR char_length(text_answer) <= 800)
);

-- ---- PONTUAÇÃO TÉCNICA (só conhecimento técnico, por profissão) ----
CREATE TABLE technical_assessments (
  user_id               uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  profession_id         smallint NOT NULL REFERENCES professions (id),
  questionnaire_version text NOT NULL,
  rule_score            smallint NOT NULL CHECK (rule_score BETWEEN 0 AND 100), -- questões objetivas
  ai_score              smallint CHECK (ai_score BETWEEN 0 AND 100),            -- resposta aberta (IA/simulação)
  technical_score       smallint NOT NULL CHECK (technical_score BETWEEN 0 AND 100),
  flags                 jsonb NOT NULL DEFAULT '[]'::jsonb,                      -- alertas para o revisor
  -- A pontuação NUNCA dispensa revisão humana (a constraint impede mudar isso).
  requires_human_review boolean NOT NULL DEFAULT true CHECK (requires_human_review),
  evaluated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profession_id)
);

-- Histórico das avaliações por IA (auditoria; não guarda o texto enviado nem a resposta bruta).
CREATE TABLE ai_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  profession_id smallint NOT NULL REFERENCES professions (id),
  provider      text NOT NULL CHECK (provider IN ('sim', 'openai')),
  model         text,
  status        text NOT NULL CHECK (status IN ('ok', 'failed')),
  score         smallint CHECK (score BETWEEN 0 AND 100),
  summary       text CHECK (summary IS NULL OR char_length(summary) <= 500),
  flags         jsonb NOT NULL DEFAULT '[]'::jsonb,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_evaluations_user_idx ON ai_evaluations (user_id, created_at DESC);

-- ---- REPUTAÇÃO (futuro: avaliações de CLIENTES). Totalmente separada da pontuação técnica. ----
CREATE TABLE professional_reputation (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  rating_avg   numeric(3, 2) CHECK (rating_avg BETWEEN 1 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- CLASSIFICAÇÃO COMERCIAL (futuro). A linha só existe se um humano atribuiu. ----
CREATE TABLE commercial_classification (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  tier        text NOT NULL,
  assigned_by uuid NOT NULL REFERENCES users (id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);
