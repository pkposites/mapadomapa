-- Preserve existing published routing; new requests require an explicit admin choice.
ALTER TABLE service_requests ADD COLUMN routing_mode text NOT NULL DEFAULT 'automatic' CHECK (routing_mode IN ('automatic','manual'));
ALTER TABLE service_requests ALTER COLUMN routing_mode SET DEFAULT 'manual';
CREATE TABLE service_request_invites (
 request_id bigint NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,user_id)
);
CREATE INDEX service_request_invites_user ON service_request_invites(user_id);
