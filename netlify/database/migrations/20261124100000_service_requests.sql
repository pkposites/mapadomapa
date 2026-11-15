-- Pedidos de serviço cadastrados manualmente pela administração (antes do lançamento oficial).
-- Dados do cliente ficam SÓ aqui e só a administração os lê; profissionais veem apenas o que é público do pedido.
CREATE TABLE service_requests (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  client_name     text NOT NULL CHECK (char_length(client_name) BETWEEN 2 AND 100),
  client_phone    text NOT NULL CHECK (client_phone ~ '^\+55[1-9][0-9]9[0-9]{8}$'),
  profession_id   smallint NOT NULL REFERENCES professions (id),
  region_id       smallint NOT NULL REFERENCES service_regions (id),
  neighborhood    text NOT NULL CHECK (char_length(neighborhood) BETWEEN 2 AND 80),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 100),
  description     text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1500),
  urgency         text NOT NULL CHECK (urgency IN ('urgent', 'this_week', 'flexible')),
  period_note     text CHECK (period_note IS NULL OR char_length(period_note) <= 100),
  consent         boolean NOT NULL DEFAULT false,
  consent_at      timestamptz,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  published_at    timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Só se publica com a autorização do cliente confirmada.
  CONSTRAINT published_requires_consent CHECK (status = 'draft' OR (consent AND consent_at IS NOT NULL))
);
CREATE INDEX service_requests_status_idx ON service_requests (status, published_at DESC);

-- Um profissional só pode manifestar interesse UMA vez por pedido (chave primária composta).
CREATE TABLE service_request_interests (
  request_id bigint NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);
