-- Módulo 5 — Inteligência de Listas
-- Run this migration in the Supabase SQL editor

-- ─── Listas recebidas ────────────────────────────────────────────────────────

CREATE TABLE listas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo text        NOT NULL,
  unidade      text        NOT NULL,
  tipo_lista   text        NOT NULL, -- LFI, LFR, INADIMPLENCIA, etc
  data_lista   date        NOT NULL,
  total_leads  int         DEFAULT 0,
  formato      text        NOT NULL, -- 'A', 'B', 'C'
  uploaded_at  timestamptz DEFAULT now(),
  uploaded_by  text,
  status       text        DEFAULT 'ativa' -- ativa | arquivada
);

-- ─── Leads individuais ────────────────────────────────────────────────────────

CREATE TABLE leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id             uuid REFERENCES listas(id) ON DELETE CASCADE,
  nome                 text        NOT NULL,
  telefone_principal   text,
  telefone_secundario  text,
  matricula            text,
  cpf                  text,
  turma                text,
  situacao             text,
  descricao            text,
  pendencia_financeira text,
  faltas_consecutivas  int,
  data_vencimento      date,
  parcelas_totais      int,
  fora_politica        boolean     DEFAULT false,
  recontato_em         date,
  whatsapp_enviado_em  timestamptz,
  whatsapp_template    text,
  created_at           timestamptz DEFAULT now()
);

-- ─── Resultados do discador ───────────────────────────────────────────────────

CREATE TABLE resultados_discador (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid REFERENCES leads(id) ON DELETE CASCADE,
  lista_id         uuid REFERENCES listas(id),
  campanha_argus   text,
  data_ligacao     timestamptz,
  hora_ligacao     int,  -- hora cheia: 9, 10, 11... para análise por faixa
  duracao_segundos int,
  tabulacao        text,
  sdr_nome         text,
  converteu        boolean     DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

-- ─── Qualificações IA (Módulo 4 hook) ────────────────────────────────────────

CREATE TABLE qualificacoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid REFERENCES leads(id) ON DELETE CASCADE,
  score_oportunidade  int,   -- 0–100
  motivo              text,
  acao_recomendada    text,  -- recontato | whatsapp | descartar | escalar_closer
  confianca           text,  -- alta | media | baixa
  gerado_em           timestamptz DEFAULT now(),
  gancho_modulo4      jsonb  -- payload para régua de WhatsApp (Módulo 4)
);

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_leads_lista_id     ON leads(lista_id);
CREATE INDEX idx_leads_fora_pol     ON leads(fora_politica) WHERE fora_politica = true;
CREATE INDEX idx_leads_recontato    ON leads(recontato_em)  WHERE recontato_em IS NOT NULL;
CREATE INDEX idx_res_lista_id       ON resultados_discador(lista_id);
CREATE INDEX idx_res_data           ON resultados_discador(data_ligacao);
CREATE INDEX idx_res_tabulacao      ON resultados_discador(tabulacao);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE listas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados_discador ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualificacoes       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON listas              FOR ALL USING (true);
CREATE POLICY "service role full access" ON leads               FOR ALL USING (true);
CREATE POLICY "service role full access" ON resultados_discador FOR ALL USING (true);
CREATE POLICY "service role full access" ON qualificacoes       FOR ALL USING (true);
