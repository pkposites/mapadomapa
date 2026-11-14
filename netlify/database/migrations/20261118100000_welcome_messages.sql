-- Boas-vindas pela caixa de mensagens interna: no máximo UMA por profissional (evita duplicidade por clique repetido).
ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('message', 'decision', 'change_request', 'welcome'));
CREATE UNIQUE INDEX messages_one_welcome_idx ON messages (user_id) WHERE kind = 'welcome';
