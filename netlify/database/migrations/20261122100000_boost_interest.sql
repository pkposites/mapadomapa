-- Interesse no futuro plano de destaque (validação de demanda). Não é compra, não cobra nada.
CREATE TABLE boost_interests (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  budget     text NOT NULL CHECK (budget IN ('ate_50', '50_100', '100_200', 'acima_200', 'ver_valores')),
  priorities text[] NOT NULL DEFAULT '{}' CHECK (cardinality(priorities) <= 4),
  note       text CHECK (note IS NULL OR char_length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
