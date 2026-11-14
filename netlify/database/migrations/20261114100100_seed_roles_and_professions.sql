-- Dados de referência (idênticos em todos os ambientes).
-- Nenhum administrador é criado aqui: o primeiro admin é concedido de forma controlada.

INSERT INTO roles (name, description) VALUES
  ('user',  'Profissional cadastrado'),
  ('admin', 'Acesso às funções administrativas');

INSERT INTO professions (slug, name, sort_order) VALUES
  ('encanadores',          'Encanadores',          1),
  ('eletricistas',         'Eletricistas',         2),
  ('instaladores',         'Instaladores',         3),
  ('pintores',             'Pintores',             4),
  ('faxineiras',           'Faxineiras',           5),
  ('montadores-de-moveis', 'Montadores de móveis', 6),
  ('dedetizacao',          'Dedetização',          7),
  ('guincho',              'Guincho',              8),
  ('chaveiros',            'Chaveiros',            9);
