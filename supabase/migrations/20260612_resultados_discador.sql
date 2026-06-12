-- Migration: campos de cruzamento Argus × leads + chave única por ligação

ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS id_ligacao_argus text;
ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS nome_cliente       text;
ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS nr_lead_argus      int;
ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS lote_argus         text;
ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS resultado_ligacao  text;
ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS telefone_discado   text;
ALTER TABLE resultados_discador ADD COLUMN IF NOT EXISTS usuario_operador   text;

-- Índice único para evitar duplicatas por ligação
CREATE UNIQUE INDEX IF NOT EXISTS idx_res_id_ligacao
  ON resultados_discador(id_ligacao_argus)
  WHERE id_ligacao_argus IS NOT NULL;

-- Índice para cruzamento por telefone
CREATE INDEX IF NOT EXISTS idx_res_telefone_discado
  ON resultados_discador(telefone_discado)
  WHERE telefone_discado IS NOT NULL;
