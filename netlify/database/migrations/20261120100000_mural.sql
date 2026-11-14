-- Mural dos profissionais: postagens de TEXTO visíveis (nome, profissões, texto) só para profissionais aprovados.
CREATE TABLE posts (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body          text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 600),
  hidden        boolean NOT NULL DEFAULT false,
  hidden_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  hidden_at     timestamptz,
  hidden_reason text CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 300),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed_idx ON posts (id DESC) WHERE NOT hidden;
CREATE INDEX posts_user_idx ON posts (user_id);

CREATE TABLE post_reports (
  post_id    bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
