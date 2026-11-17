-- Cada Pix corresponde a uma tentativa idempotente. Dados de CPF/e-mail não são armazenados.
CREATE TABLE request_recharge_payments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id text UNIQUE,
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','pending','approved','cancelled','rejected','refunded','charged_back')),
  expires_at timestamptz NOT NULL,
  qr_code text,
  qr_image text,
  cycle_id bigint UNIQUE REFERENCES request_recharge_cycles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_recharge_payments_user ON request_recharge_payments(user_id,created_at DESC);
CREATE UNIQUE INDEX request_recharge_one_pending ON request_recharge_payments(user_id) WHERE status IN ('creating','pending');
