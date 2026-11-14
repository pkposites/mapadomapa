-- Etapa 4 — painel administrativo: decisões humanas, suspensão, verificação do celular e
-- visão PÚBLICA que só enxerga profissionais aprovados.

-- Novo estado: suspenso. Toda decisão (aprovar, rejeitar, pedir ajustes, suspender) exige revisor humano identificado.
ALTER TABLE professional_profiles DROP CONSTRAINT professional_profiles_review_status_check;
ALTER TABLE professional_profiles ADD CONSTRAINT professional_profiles_review_status_check
  CHECK (review_status IN ('not_submitted', 'pending_review', 'needs_changes', 'approved', 'rejected', 'suspended'));
ALTER TABLE professional_profiles DROP CONSTRAINT decision_requires_human_reviewer;
ALTER TABLE professional_profiles ADD CONSTRAINT decision_requires_human_reviewer
  CHECK (review_status NOT IN ('approved', 'rejected', 'suspended', 'needs_changes')
         OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL));

-- Quem verificou o celular (MVP: verificação administrativa, sem SMS).
ALTER TABLE phones ADD COLUMN verified_by uuid REFERENCES users (id);

-- Histórico imutável de decisões.
CREATE TABLE review_events (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- o profissional
  admin_id    uuid NOT NULL REFERENCES users (id),                     -- quem decidiu
  action      text NOT NULL CHECK (action IN ('approve', 'reject', 'request_changes', 'suspend', 'reinstate', 'verify_phone', 'unverify_phone')),
  from_status text,
  to_status   text,
  notes       text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_events_user_idx ON review_events (user_id, created_at DESC);

-- ÚNICA porta de dados do público: só aprovados e ativos, sem telefone, sem identificador.
CREATE VIEW public_professionals AS
SELECT
  (SELECT array_agg(p.name ORDER BY p.sort_order)
     FROM profile_professions x JOIN professions p ON p.id = x.profession_id WHERE x.user_id = pr.user_id) AS professions,
  (SELECT array_agg(r.name ORDER BY r.sort_order)
     FROM professional_regions y JOIN service_regions r ON r.id = y.region_id WHERE y.user_id = pr.user_id) AS regions,
  (SELECT max(z.experience_years) FROM profile_professions z WHERE z.user_id = pr.user_id) AS experience_years
FROM professional_profiles pr
JOIN users u ON u.id = pr.user_id
WHERE pr.review_status = 'approved' AND u.status = 'active';
