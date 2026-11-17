CREATE TABLE request_access_settings (
  id smallint PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO request_access_settings(id,enabled) VALUES (1,false);
CREATE TABLE request_recharge_cycles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
  revoked_at timestamptz,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX recharge_user_idx ON request_recharge_cycles(user_id,id DESC);
ALTER TABLE service_request_interests ADD COLUMN recharge_cycle_id bigint REFERENCES request_recharge_cycles(id) ON DELETE SET NULL, ADD COLUMN contact_delivered_at timestamptz;
CREATE TABLE post_images (
  post_id bigint PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 1000000),
  mime text NOT NULL CHECK(mime='image/jpeg')
);
