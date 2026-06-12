-- Adiciona coluna analisado_em em call_analyses (era gravada pelo código mas não existia na tabela)
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS analisado_em timestamptz;
UPDATE call_analyses SET analisado_em = updated_at WHERE analisado_em IS NULL;
