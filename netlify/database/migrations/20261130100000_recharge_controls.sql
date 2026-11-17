ALTER TABLE request_access_settings ADD COLUMN pix_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE request_access_pauses (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 paused_by uuid REFERENCES users(id) ON DELETE SET NULL,
 paused_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE request_recharge_payment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 payment_id uuid NOT NULL REFERENCES request_recharge_payments(id) ON DELETE CASCADE,
 previous_status text NOT NULL,
 new_status text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recharge_payment_events_by_payment ON request_recharge_payment_events(payment_id,occurred_at DESC);
