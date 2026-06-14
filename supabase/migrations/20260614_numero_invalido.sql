-- Marca leads cujo número foi confirmado inválido pela higienizadora (ex: Lemitti).
-- Distinção: precisa_higienizacao = true → aguarda higienização (fila);
--             numero_invalido = true       → descartado definitivamente.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS numero_invalido boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_numero_invalido
  ON leads(numero_invalido)
  WHERE numero_invalido = true;
