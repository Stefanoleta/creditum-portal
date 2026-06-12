-- Adiciona coluna coaching_data (jsonb) para bundlar campos de coaching
-- que o schema cache do PostgREST não reconhece individualmente.
-- Resolve erros de "column X does not exist" após ADD COLUMN sem restart do PostgREST.
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS coaching_data jsonb;
