-- Mural em posts separados: tema + título. Texto maior permitido (a equipe não tem o limite de 600; o limite dos demais é aplicado pela API).
ALTER TABLE posts
  ADD COLUMN title text CHECK (title IS NULL OR char_length(title) BETWEEN 3 AND 80),
  ADD COLUMN topic text NOT NULL DEFAULT 'outro' CHECK (topic IN ('duvida', 'servico', 'dica', 'novidade', 'indicacao', 'outro'));
ALTER TABLE posts DROP CONSTRAINT posts_body_check;
ALTER TABLE posts ADD CONSTRAINT posts_body_check CHECK (char_length(body) BETWEEN 3 AND 3000);
ALTER TABLE post_comments DROP CONSTRAINT post_comments_body_check;
ALTER TABLE post_comments ADD CONSTRAINT post_comments_body_check CHECK (char_length(body) BETWEEN 2 AND 1000);
