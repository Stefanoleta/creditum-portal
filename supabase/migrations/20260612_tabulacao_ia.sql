-- Adiciona coluna tabulacao_ia (jsonb) em call_analyses.
-- Armazena a tabulação automática gerada pela IA após análise da ligação.
-- Campos: categoria, confianca, recontato_em_dias, justificativa.
--
-- Enquanto o PostgREST não recarrega o schema cache, o campo é armazenado
-- dentro de coaching_data jsonb via toDbRow(). Esta coluna é para consultas diretas futuras.
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS tabulacao_ia jsonb;
