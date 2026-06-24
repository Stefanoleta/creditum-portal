-- Creditum Sales OS v2 — tabelas para SDR IA (Maria de Lourdes)
-- Executar no Supabase SQL editor antes de ativar WF6.

CREATE TABLE IF NOT EXISTS sdr_ia_conversations (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id          TEXT          NOT NULL,
  phone            TEXT          NOT NULL,
  message_in       TEXT,
  intent_code      TEXT,
  message_out      TEXT,
  subagent_used    TEXT,
  warm_count       INTEGER       DEFAULT 0,
  objection_count  INTEGER       DEFAULT 0,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdr_ia_conv_lead    ON sdr_ia_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_sdr_ia_conv_phone   ON sdr_ia_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_sdr_ia_conv_created ON sdr_ia_conversations(created_at DESC);

CREATE TABLE IF NOT EXISTS sdr_ia_handoffs (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             TEXT        NOT NULL,
  phone               TEXT        NOT NULL,
  closer_notified     BOOLEAN     DEFAULT FALSE,
  briefing_json       JSONB,
  warm_count_at_handoff INTEGER,
  parcela_atual       TEXT,
  instituicao         TEXT,
  prioridade          TEXT        CHECK (prioridade IN ('alta','media','baixa')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdr_ia_handoff_lead    ON sdr_ia_handoffs(lead_id);
CREATE INDEX IF NOT EXISTS idx_sdr_ia_handoff_closer  ON sdr_ia_handoffs(closer_notified);
CREATE INDEX IF NOT EXISTS idx_sdr_ia_handoff_created ON sdr_ia_handoffs(created_at DESC);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
