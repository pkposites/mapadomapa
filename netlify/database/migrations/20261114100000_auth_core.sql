-- Etapa 2 — núcleo de autenticação: usuários, telefones, perfis, permissões,
-- sessões, códigos por SMS, limites de tentativas e trilha de auditoria.
-- Nunca edite esta migração depois de aplicada: crie uma nova.

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- pending: celular ainda não confirmado · active · disabled: bloqueado por um admin
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'disabled')),
  password_hash     text NOT NULL,
  terms_accepted_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz
);

-- Telefone em formato E.164 brasileiro de celular: +55 DDD 9 XXXXXXXX
CREATE TABLE phones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  e164        text NOT NULL CHECK (e164 ~ '^\+55[1-9][0-9]9[0-9]{8}$'),
  verified_at timestamptz,
  is_primary  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Proteção definitiva contra cadastro duplicado (vale mesmo com requisições simultâneas).
CREATE UNIQUE INDEX phones_e164_key ON phones (e164);
CREATE UNIQUE INDEX phones_one_primary_per_user ON phones (user_id) WHERE is_primary;

CREATE TABLE profiles (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  full_name  text,
  city       text NOT NULL DEFAULT 'São Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Profissões aprovadas (mesmos slugs da landing). O quiz usará estas tabelas.
CREATE TABLE professions (
  id         smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order smallint NOT NULL,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE profile_professions (
  user_id       uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  profession_id smallint NOT NULL REFERENCES professions (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profession_id)
);

-- Permissões (RBAC simples): um usuário pode ter vários papéis.
CREATE TABLE roles (
  id          smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name        text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id    smallint NOT NULL REFERENCES roles (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

-- Sessões: o navegador guarda um token aleatório; aqui só fica o hash dele.
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip           text,
  user_agent   text
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Códigos temporários enviados por SMS. Guardamos só o HMAC, nunca o código.
CREATE TABLE verification_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164   text NOT NULL,
  purpose      text NOT NULL CHECK (purpose IN ('signup', 'password_reset')),
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ip           text
);
CREATE INDEX verification_codes_lookup_idx
  ON verification_codes (phone_e164, purpose, created_at DESC);

-- Registro de SMS enviados. O corpo só é gravado pelo simulador local (body nulo em produção).
CREATE TABLE sms_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164  text NOT NULL,
  purpose     text NOT NULL,
  provider    text NOT NULL,
  body        text,
  status      text NOT NULL DEFAULT 'sent',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_messages_created_idx ON sms_messages (created_at DESC);

-- Contadores de tentativas por janela de tempo (anti-abuso).
CREATE TABLE rate_limits (
  key               text PRIMARY KEY,
  count             integer NOT NULL,
  window_expires_at timestamptz NOT NULL
);

-- Trilha de auditoria de eventos sensíveis (login, recuperação, acesso admin).
CREATE TABLE audit_log (
  id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  event      text NOT NULL,
  ip         text,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
