ALTER TABLE users ADD COLUMN email text;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email IS NOT NULL;
CREATE TABLE email_verifications (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE email_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key text NOT NULL, subject text NOT NULL, body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,event_key)
);
CREATE INDEX email_outbox_pending ON email_outbox(next_attempt_at) WHERE sent_at IS NULL;
CREATE TABLE email_password_resets (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL
);
