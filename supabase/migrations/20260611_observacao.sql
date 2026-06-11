-- observacao: nota automática quando lead já existe em outra lista (duplicata cross-lista)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS observacao text;

-- Índice em telefone_principal para tornar a verificação de duplicatas eficiente em listas grandes
CREATE INDEX IF NOT EXISTS idx_leads_telefone
  ON leads(telefone_principal)
  WHERE telefone_principal IS NOT NULL;
