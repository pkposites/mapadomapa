-- Mural social: curtidas e comentários (só texto).
CREATE TABLE post_likes (
  post_id    bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE post_comments (
  id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  post_id    bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 300),
  hidden     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_comments_post_idx ON post_comments (post_id, id);
