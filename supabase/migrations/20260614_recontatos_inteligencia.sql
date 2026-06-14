-- Recontatos inteligência: contadores anti-desgaste + bloqueio + pausa
-- Usar no Supabase SQL editor antes de usar as novas funcionalidades.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS recontato_tentativas         int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recontato_tentativas_seguidas int    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pausado_ate                   date,
  ADD COLUMN IF NOT EXISTS bloqueado                     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueado_motivo              text,
  ADD COLUMN IF NOT EXISTS bloqueado_em                  timestamptz,
  ADD COLUMN IF NOT EXISTS recontato_categoria           text;

-- Fila do dia: leads prontos para ligar
CREATE INDEX IF NOT EXISTS idx_leads_fila_do_dia
  ON leads(recontato_em, bloqueado, pausado_ate)
  WHERE bloqueado = false AND recontato_em IS NOT NULL;

-- Leads bloqueados (para auditoria)
CREATE INDEX IF NOT EXISTS idx_leads_bloqueados
  ON leads(bloqueado)
  WHERE bloqueado = true;

-- Leads pausados
CREATE INDEX IF NOT EXISTS idx_leads_pausados
  ON leads(pausado_ate)
  WHERE pausado_ate IS NOT NULL;
