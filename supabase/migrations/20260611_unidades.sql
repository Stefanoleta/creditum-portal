-- Migration: criar tabela unidades e inserir unidades ativas do Grau Técnico
-- Rodar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  parceiro text NOT NULL DEFAULT 'Grau Técnico',
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON unidades FOR ALL USING (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_unidades_nome ON unidades(nome);
CREATE INDEX IF NOT EXISTS idx_unidades_ativa ON unidades(ativa) WHERE ativa = true;

-- Inserir unidades ativas
INSERT INTO unidades (nome) VALUES
  ('São João de Meriti'),
  ('Carpina'),
  ('Parnamirim'),
  ('Divinópolis'),
  ('Joinville'),
  ('São José do Rio Preto'),
  ('Alecrim'),
  ('Duque de Caxias'),
  ('São Gonçalo'),
  ('Sumaré'),
  ('Santos'),
  ('Rio Centro'),
  ('Limoeiro'),
  ('Maracanau'),
  ('Zona Norte'),
  ('BelfordRoxo'),
  ('Bezerra'),
  ('Fortaleza'),
  ('Guarulhos'),
  ('Jardim Angela'),
  ('João Pessoa'),
  ('Limeira'),
  ('Madureira'),
  ('Mogi das Cruzes'),
  ('Presidente P.'),
  ('Santa Cruz'),
  ('Santo Amaro')
ON CONFLICT (nome) DO NOTHING;
