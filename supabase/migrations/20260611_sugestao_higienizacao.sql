-- Sugestão de substituição de telefone: quando um lead com telefone inválido
-- recebe uma sugestão de novo número vinda de uma importação posterior.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sugestao_substituicao     boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefone_sugerido         text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sugestao_origem_lista_id  uuid REFERENCES listas(id);

CREATE INDEX IF NOT EXISTS idx_leads_sugestao
  ON leads(sugestao_substituicao)
  WHERE sugestao_substituicao = true AND higienizado_em IS NULL;
