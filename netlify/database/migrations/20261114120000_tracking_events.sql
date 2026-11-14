-- Etapa 2 — rastreamento (Meta Conversions API): registro dos eventos enviados pelo servidor.
-- Guarda só dados já protegidos: telefone e id do usuário aparecem apenas como hash SHA-256;
-- IP e user agent NUNCA são gravados aqui. O token de acesso jamais é gravado.
CREATE TABLE tracking_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name  text NOT NULL,
  event_id    text NOT NULL,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  -- sim: simulado (local, nada é enviado) · live: enviado à Meta
  mode        text NOT NULL CHECK (mode IN ('sim', 'live')),
  -- pending → sent | failed (live) · simulated (sim)
  status      text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'simulated')),
  http_status integer,
  error       text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Deduplicação: um mesmo (event_name, event_id) nunca é enviado duas vezes.
CREATE UNIQUE INDEX tracking_events_dedup_key ON tracking_events (event_name, event_id);
CREATE INDEX tracking_events_user_idx ON tracking_events (user_id);
