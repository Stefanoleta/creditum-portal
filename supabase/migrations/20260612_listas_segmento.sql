-- Adiciona coluna segmento (text, opcional) em listas.
-- Valores: 'T' (Técnico), 'P' (Profissionalizante), ou NULL.
ALTER TABLE listas ADD COLUMN IF NOT EXISTS segmento text;
