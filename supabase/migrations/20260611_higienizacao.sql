-- Higienização de contatos: sinaliza leads com telefone fixo, sem DDD ou formato inválido
-- Gancho futuro: webhook Argus marcará precisa_higienizacao = true, motivo = 'numero_inexistente_discador'

ALTER TABLE leads ADD COLUMN IF NOT EXISTS precisa_higienizacao boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_higienizacao  text;
  -- Valores possíveis: 'telefone_fixo' | 'sem_ddd' | 'numero_incompleto' | 'formato_invalido' | 'numero_inexistente_discador'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS higienizado_em       timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefone_corrigido   text;

CREATE INDEX IF NOT EXISTS idx_leads_higienizacao
  ON leads(precisa_higienizacao)
  WHERE precisa_higienizacao = true AND higienizado_em IS NULL;
