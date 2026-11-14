-- Notificações push (Web Push, opcionais): uma linha por aparelho/navegador que o profissional ativou.
CREATE TABLE push_subscriptions (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 600 AND endpoint LIKE 'https://%'),
  p256dh          text NOT NULL CHECK (char_length(p256dh) <= 200),
  auth            text NOT NULL CHECK (char_length(auth) <= 100),
  topic_messages  boolean NOT NULL DEFAULT true,
  topic_announcements boolean NOT NULL DEFAULT true,
  failures        smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
