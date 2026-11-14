-- Etapa 5: área do profissional (perfil editável, foto, comunicados, mensagens, histórico de alterações).
-- Só estrutura (+ um comunicado de boas-vindas real). Nenhum dado de profissional é criado ou alterado.

ALTER TABLE professional_profiles
  ADD COLUMN full_name  text CHECK (full_name  IS NULL OR char_length(full_name)  BETWEEN 3 AND 80),
  ADD COLUMN bio        text CHECK (bio        IS NULL OR char_length(bio)        <= 600),
  ADD COLUMN services   text CHECK (services   IS NULL OR char_length(services)   <= 600),
  ADD COLUMN extra_info text CHECK (extra_info IS NULL OR char_length(extra_info) <= 600);

-- Foto de perfil: PRIVADA (só o próprio profissional e administradores). Nada aqui é público.
CREATE TABLE profile_photos (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data         bytea NOT NULL CHECK (octet_length(data) BETWEEN 100 AND 400000),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Caixa de mensagens interna: um histórico por profissional (user_id = o profissional).
-- read_at = quando o DESTINATÁRIO leu (mensagem do admin lida pelo profissional; do profissional lida pelo admin).
CREATE TABLE messages (
  id             bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sender         text NOT NULL CHECK (sender IN ('admin', 'professional')),
  sender_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  kind           text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'decision', 'change_request')),
  body           text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  read_at        timestamptz
);
CREATE INDEX messages_user_idx ON messages (user_id, created_at, id);
CREATE INDEX messages_unread_idx ON messages (sender, read_at) WHERE read_at IS NULL;

CREATE TABLE announcements (
  id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 2000),
  published  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE announcement_reads (
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  announcement_id bigint NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

-- Alterações feitas pelo próprio profissional (para o administrador acompanhar).
CREATE TABLE profile_events (
  id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('profile_updated', 'work_updated', 'photo_updated', 'regions_changed', 'resubmitted')),
  details    text CHECK (details IS NULL OR char_length(details) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_events_user_idx ON profile_events (user_id, created_at DESC);

-- Comunicado institucional real (texto da plataforma, não é dado de usuário).
INSERT INTO announcements (title, body) VALUES
  ('Bem-vindo ao Mapa do Mapa!',
   'Seu pré-cadastro está aberto. Complete o perfil, escolha até 2 profissões e 2 regiões e responda às perguntas rápidas. A equipe analisa cada cadastro: nenhum perfil aparece ao público sem aprovação. Os pedidos reais de orçamento estão previstos para começar em 25/11/2026.');
