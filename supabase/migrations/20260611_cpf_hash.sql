-- Substitui CPF em texto por hash HMAC-SHA256 — LGPD: dado pessoal nunca persiste em claro
-- O hash permite matching futuro (busca por CPF hasheado) sem expor o CPF original.
-- CPF_HASH_SECRET deve ser uma variável de ambiente no servidor; nunca commitada.

ALTER TABLE leads DROP COLUMN IF EXISTS cpf;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cpf_hash text;

CREATE INDEX IF NOT EXISTS idx_leads_cpf_hash ON leads(cpf_hash) WHERE cpf_hash IS NOT NULL;
