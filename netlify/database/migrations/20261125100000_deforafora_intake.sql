-- Entrada privada de pedidos reais do De fora a fora. Nenhum dado de demonstração.
CREATE TABLE deforafora_intake (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 10 AND 100),
  client_name text NOT NULL,
  client_phone text NOT NULL,
  service text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,
  urgency text NOT NULL,
  contact_preference text NOT NULL,
  photo_reference text,
  received_at timestamptz NOT NULL DEFAULT now(),
  converted_request_id bigint UNIQUE REFERENCES service_requests(id) ON DELETE SET NULL
);
CREATE INDEX deforafora_intake_pending ON deforafora_intake (received_at DESC) WHERE converted_request_id IS NULL;
ALTER TABLE service_request_interests ADD COLUMN selected_at timestamptz;
