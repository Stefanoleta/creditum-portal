-- Migration completa para call_analyses
-- Garante que todas as colunas usadas pelo código existam na tabela.
-- Seguro rodar mesmo se a tabela já existir — ADD COLUMN IF NOT EXISTS é idempotente.

-- ─── Tabela base (caso não exista) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS call_analyses (
  call_id      text PRIMARY KEY,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ─── Campos de identidade da ligação ─────────────────────────────────────────

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS sdr_name         text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS sdr_id           text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS phone            text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS school_name      text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS started_at       timestamptz;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS duration_seconds int;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS transcript       text;

-- ─── Resultado da análise IA ─────────────────────────────────────────────────

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS score                            numeric;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS resultado                        text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS analisado_em                    timestamptz;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS source                           text;   -- 'ai' | 'mock'
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS data_source                     text;   -- 'argus_real' | 'metadata_only' | 'mock' | 'pending'
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS status                           text;   -- 'completed' | 'pendente'
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS pending_payload                 text;

-- ─── Campos legados (backward compat) ────────────────────────────────────────

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS tom                             text;   -- 'positivo' | 'neutro' | 'negativo'
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS tempo_resposta_inicial_segundos int;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS palavras_conversao              text[];
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS palavras_perda                 text[];
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS objecoes                        text[];
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS como_tratou_objecoes           text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS pontos_positivos                text[];
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS pontos_negativos                text[];

-- ─── Campos de coaching rico (novo prompt) ────────────────────────────────────

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS score_breakdown        jsonb;  -- { abertura, engajamento_lead, tratamento_objecao, proposta_beneficio }
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS resumo                 text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS momento_critico        jsonb;  -- { tempo, descricao, alternativa }
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS analise_abertura       jsonb;  -- { avaliacao, descricao, sugestao }
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS objecoes_identificadas jsonb;  -- ObjecaoIdentificada[]
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS pontos_fortes          text[];
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS pontos_melhoria        text[];
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS sugestao_recontato     jsonb;  -- { vale_recontato, motivo, melhor_horario, abertura_sugerida }
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS insight_gestor         text;

-- ─── Backfill analisado_em para registros anteriores ─────────────────────────

UPDATE call_analyses SET analisado_em = updated_at WHERE analisado_em IS NULL;

-- ─── Índices úteis ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ca_started_at ON call_analyses(started_at);
CREATE INDEX IF NOT EXISTS idx_ca_sdr_name   ON call_analyses(sdr_name);
CREATE INDEX IF NOT EXISTS idx_ca_status     ON call_analyses(status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE call_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'call_analyses' AND policyname = 'service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON call_analyses FOR ALL USING (true);
  END IF;
END $$;
