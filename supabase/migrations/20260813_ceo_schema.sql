-- Creditum CEO Intelligence — Fase 1
--
-- Schema isolado `ceo`. NÃO toca em nenhuma tabela existente do portal
-- (leads, listas, qualificacoes, call_analyses seguem intactas).
--
-- Princípios que o schema impõe:
--   1. dinheiro é BIGINT em centavos — nunca float, nunca string formatada
--   2. percentual é INTEGER em basis points (2500 = 25%)
--   3. o RAW nunca é sobrescrito: alteração na fonte cria NOVA versão
--   4. regra de negócio é LINHA EM TABELA, não constante em código (D3)
--   5. CPF nunca em texto — apenas HMAC (LGPD)

create schema if not exists ceo;

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMADA RAW + OBSERVABILIDADE
-- ═══════════════════════════════════════════════════════════════════════════

-- Papel da aba/recurso dentro da fonte.
-- `reference_only` existe para a aba de conversão que o time monta à mão:
-- ela é guardada e usada para RECONCILIAÇÃO, mas nunca alimenta métrica.
create type ceo.source_role as enum ('pipeline', 'sales', 'reference_only');

create type ceo.sync_status as enum ('running', 'ok', 'partial', 'error');

create table ceo.source_syncs (
  id                uuid primary key default gen_random_uuid(),
  source            text        not null,
  tab_key           text        not null,
  tab_role          ceo.source_role not null,

  -- Idempotência: o mesmo lote nunca é processado duas vezes.
  idempotency_key   text        not null unique,
  content_hash      text,

  status            ceo.sync_status not null default 'running',
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  latency_ms        integer,

  rows_received     integer     not null default 0,
  rows_ingested     integer     not null default 0,
  -- Linhas-fantasma rejeitadas (sem aluno E sem contato E total 0).
  -- Contadas explicitamente: descarte silencioso é invisível na auditoria.
  rows_skipped      integer     not null default 0,
  rows_changed      integer     not null default 0,
  conflicts_found   integer     not null default 0,

  error_message     text,
  created_at        timestamptz not null default now()
);

create index on ceo.source_syncs (source, tab_key, started_at desc);
create index on ceo.source_syncs (status) where status <> 'ok';

comment on table ceo.source_syncs is
  'Uma linha por tentativa de coleta. Alimenta a tela System Health (§34).';

-- Registro bruto, imutável.
--
-- `row_key` identifica a MESMA linha lógica da fonte ao longo do tempo.
-- `source_record_id` identifica um CONTEÚDO específico dessa linha (D6):
-- se a linha muda, nasce um novo registro e o anterior é marcado como
-- superseded. O histórico completo permanece auditável.
create table ceo.source_records (
  id                uuid primary key default gen_random_uuid(),

  source            text        not null,
  tab_key           text        not null,
  tab_role          ceo.source_role not null,

  -- sha256(source | tab | conteúdo normalizado da linha)
  source_record_id  text        not null unique,
  -- sha256(source | tab | localizador estável) — a "mesma linha" ao longo do tempo
  row_key           text        not null,

  -- Pista de localização para o humano achar a linha. NUNCA identidade:
  -- inserir uma linha no meio da planilha desloca todas as seguintes.
  locator           jsonb       not null default '{}'::jsonb,

  -- Conteúdo original, exatamente como recebido. Nunca sobrescrito.
  payload           jsonb       not null,
  content_hash      text        not null,

  sync_id           uuid        not null references ceo.source_syncs (id),
  collected_at      timestamptz not null,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  superseded_at     timestamptz,
  superseded_by     uuid        references ceo.source_records (id)
);

create index on ceo.source_records (row_key, first_seen_at desc);
create index on ceo.source_records (sync_id);
create index on ceo.source_records (source, tab_key) where superseded_at is null;

comment on column ceo.source_records.payload is
  'Dado cru, sem normalização. Toda métrica é reconstruível a partir daqui.';

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFIGURAÇÃO — o que muda quando a fonte muda, sem tocar em código
-- ═══════════════════════════════════════════════════════════════════════════

-- Mapeamento coluna-da-fonte → campo-do-domínio (§38).
-- A fonte definitiva ainda está em desenvolvimento: quando chegar, cria-se uma
-- nova versão aqui em vez de reescrever o ingestor.
create table ceo.source_mappings (
  id          uuid primary key default gen_random_uuid(),
  source      text        not null,
  tab_key     text        not null,
  tab_role    ceo.source_role not null,
  version     integer     not null,
  mapping     jsonb       not null,
  active      boolean     not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  unique (source, tab_key, version)
);

create unique index one_active_mapping_per_tab
  on ceo.source_mappings (source, tab_key) where active;

-- Regras de negócio versionadas (D3, §46).
--
-- A regra de "o que conta como venda" mora AQUI, não no código. Hoje a planilha
-- de pipeline diz 8 vendas e a financeira diz 14; quando o CEO definir a fonte
-- oficial, troca-se a linha ativa — o core não muda.
create table ceo.business_rules (
  id          uuid primary key default gen_random_uuid(),
  rule_key    text        not null,
  version     integer     not null,
  rule        jsonb       not null,
  active      boolean     not null default false,
  -- true enquanto a regra oficial não foi fornecida pelo CEO
  pending     boolean     not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  unique (rule_key, version)
);

create unique index one_active_rule_per_key
  on ceo.business_rules (rule_key) where active;

-- ═══════════════════════════════════════════════════════════════════════════
-- ENTIDADES CANÔNICAS + ALIASES
-- ═══════════════════════════════════════════════════════════════════════════

create table ceo.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Resolve as variações observadas na fonte real:
--   "Grau Sumaré" / "Grau Sumare" / "Sumaré"  → uma escola
--   a aba financeira não usa o prefixo "Grau": "Meriti", "Mogi", "Zona Norte"
-- Alias em DADOS, não regex em código.
create table ceo.school_aliases (
  alias_key   text        primary key,
  school_id   uuid        not null references ceo.schools (id) on delete cascade,
  source      text,
  created_at  timestamptz not null default now()
);

create table ceo.sellers (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null unique,
  active        boolean     not null default true,
  -- Sentinela para "Ninguem"/"Ninguém": existe para não perder o registro,
  -- mas NUNCA entra em ranking nem em denominador de conversão.
  is_unassigned boolean     not null default false,
  created_at    timestamptz not null default now()
);

create table ceo.seller_aliases (
  alias_key   text        primary key,
  seller_id   uuid        not null references ceo.sellers (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create type ceo.sdr_kind as enum ('ia', 'human', 'unassigned');

create table ceo.sdr_agents (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  kind        ceo.sdr_kind not null,
  created_at  timestamptz not null default now()
);

create table ceo.sdr_aliases (
  alias_key   text        primary key,
  sdr_id      uuid        not null references ceo.sdr_agents (id) on delete cascade
);

create table ceo.lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  created_at  timestamptz not null default now()
);

create table ceo.lead_source_aliases (
  alias_key       text primary key,
  lead_source_id  uuid not null references ceo.lead_sources (id) on delete cascade
);

-- ═══════════════════════════════════════════════════════════════════════════
-- NÚCLEO
-- ═══════════════════════════════════════════════════════════════════════════

-- Força do CPF como identidade (D9).
-- `recovered` = zero à esquerda reconstruído e validado por mod-11. NUNCA vale
-- o mesmo que `exact`: a taxa de falso positivo medida é ~1%.
create type ceo.cpf_confidence as enum ('exact', 'recovered', 'none');

create table ceo.students (
  id              uuid primary key default gen_random_uuid(),
  -- LGPD: CPF só como HMAC. O dígito nunca é persistido nem logado.
  cpf_hash        text,
  cpf_confidence  ceo.cpf_confidence not null default 'none',
  phone           text,
  display_name    text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Um CPF exato identifica no máximo um aluno. CPFs recuperados NÃO ganham
-- unicidade: com ~1% de falso positivo, uma constraint aqui fundiria pessoas.
create unique index students_cpf_exact
  on ceo.students (cpf_hash) where cpf_confidence = 'exact' and cpf_hash is not null;

create index on ceo.students (phone) where phone is not null;

create table ceo.opportunities (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid        not null references ceo.students (id),
  school_id             uuid        references ceo.schools (id),
  seller_id             uuid        references ceo.sellers (id),
  sdr_id                uuid        references ceo.sdr_agents (id),
  lead_source_id        uuid        references ceo.lead_sources (id),

  opened_on             date        not null,

  -- Status normalizado + o texto original, sempre os dois.
  status                text        not null,
  raw_status            text        not null,

  discount_bps          integer,
  installment_value_cents bigint,
  installments_open     integer,
  installments_due      integer,
  installments_total    integer,

  source_record_id      text        not null references ceo.source_records (source_record_id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint installment_non_negative check (installment_value_cents is null or installment_value_cents >= 0),
  constraint discount_sane check (discount_bps is null or (discount_bps >= 0 and discount_bps <= 10000))
);

create index on ceo.opportunities (opened_on desc);
create index on ceo.opportunities (seller_id, opened_on desc);
create index on ceo.opportunities (school_id, opened_on desc);
create index on ceo.opportunities (status);

comment on column ceo.opportunities.raw_status is
  'Texto original da fonte. Preservado para auditoria e reclassificação.';

create table ceo.sales (
  id                      uuid primary key default gen_random_uuid(),
  opportunity_id          uuid        references ceo.opportunities (id),
  student_id              uuid        not null references ceo.students (id),
  school_id               uuid        references ceo.schools (id),
  seller_id               uuid        references ceo.sellers (id),

  sold_on                 date        not null,

  installment_full_cents  bigint,
  transfer_cents          bigint,
  discount_bps            integer,
  installments_grau       integer,

  -- ticket = transfer_cents × installments_grau (D5).
  -- Coluna gerada: impossível divergir da fórmula por engano de escrita.
  ticket_cents            bigint generated always as (
    transfer_cents * installments_grau
  ) stored,

  -- Campos previstos pela spec §19 que a fonte atual ainda não fornece.
  -- Existem vazios de propósito: BUSINESS_RULE_PENDING, não invenção.
  contract_value_cents    bigint,
  revenue_value_cents     bigint,

  -- Evidências que sustentam a venda, por fonte. Alimenta a SalePolicy (D3).
  evidence                jsonb       not null default '[]'::jsonb,
  confidence              numeric(4,3),

  source_record_id        text        not null references ceo.source_records (source_record_id),
  created_at              timestamptz not null default now(),

  constraint transfer_non_negative check (transfer_cents is null or transfer_cents >= 0),
  constraint installments_positive check (installments_grau is null or installments_grau > 0)
);

create index on ceo.sales (sold_on desc);
create index on ceo.sales (seller_id, sold_on desc);
create index on ceo.sales (school_id, sold_on desc);

-- Uma venda por oportunidade. Garante idempotência da detecção (§12).
create unique index sales_one_per_opportunity
  on ceo.sales (opportunity_id) where opportunity_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- EVENTOS, PERDAS, CONFLITOS, NOTIFICAÇÕES
-- ═══════════════════════════════════════════════════════════════════════════

create table ceo.lead_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text        not null,
  entity_kind   text        not null,
  entity_id     uuid        not null,
  seller_id     uuid        references ceo.sellers (id),
  occurred_at   timestamptz not null,
  source        text        not null,
  payload       jsonb       not null default '{}'::jsonb,
  confidence    numeric(4,3),
  -- Impede o mesmo evento de nascer duas vezes (§12: idempotência).
  dedupe_key    text        not null unique,
  created_at    timestamptz not null default now()
);

create index on ceo.lead_events (entity_kind, entity_id, occurred_at desc);
create index on ceo.lead_events (event_type, occurred_at desc);

create type ceo.loss_category as enum (
  'CREDIT_POLICY', 'GUARANTOR', 'COMMERCIAL', 'OPERATIONAL', 'OTHER'
);

create table ceo.loss_reasons (
  id                        uuid primary key default gen_random_uuid(),
  opportunity_id            uuid not null references ceo.opportunities (id) on delete cascade,
  category                  ceo.loss_category not null,
  subcategory               text,
  -- Os três campos SEMPRE preservados juntos (§18).
  raw_loss_reason           text not null,
  normalized_loss_reason    text,
  classification_confidence numeric(4,3),
  classified_by             text not null default 'rule',
  created_at                timestamptz not null default now()
);

create index on ceo.loss_reasons (category);
create index on ceo.loss_reasons (opportunity_id);

create type ceo.conflict_status as enum ('open', 'acknowledged', 'resolved');

-- Divergência entre fontes. NUNCA resolvida em silêncio (§23).
create table ceo.data_conflicts (
  id            uuid primary key default gen_random_uuid(),
  kind          text        not null,
  entity_kind   text,
  entity_id     uuid,
  detail        text        not null,
  sources       jsonb       not null default '[]'::jsonb,
  values_seen   jsonb       not null default '{}'::jsonb,
  status        ceo.conflict_status not null default 'open',
  dedupe_key    text        not null unique,
  detected_at   timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_note text
);

create index on ceo.data_conflicts (status, detected_at desc);

create table ceo.notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text        not null,
  title       text        not null,
  body        text        not null,
  payload     jsonb       not null default '{}'::jsonb,
  -- A mesma venda nunca notifica duas vezes (§12).
  dedupe_key  text        not null unique,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index on ceo.notifications (created_at desc) where read_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURANÇA — RLS em tudo (§33)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hoje existe um único usuário CEO. O modelo já permite vários: a política é
-- por papel autenticado, não por id fixo.
--
-- A ingestão roda com service_role, que ignora RLS por definição — logo o
-- acesso do navegador fica restrito a leitura autenticada.

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'ceo'
  loop
    execute format('alter table ceo.%I enable row level security', t.tablename);
    execute format(
      'create policy ceo_read_authenticated on ceo.%I for select to authenticated using (true)',
      t.tablename
    );
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — apenas estrutura e regras pendentes. NENHUM dado de negócio inventado.
-- ═══════════════════════════════════════════════════════════════════════════

insert into ceo.sellers (name, is_unassigned) values ('(não atribuído)', true);

insert into ceo.sdr_agents (name, kind) values
  ('IA', 'ia'),
  ('(não atribuído)', 'unassigned');

insert into ceo.lead_sources (name) values ('Indicação'), ('Qualificação');

insert into ceo.lead_source_aliases (alias_key, lead_source_id)
select k, s.id from ceo.lead_sources s,
  lateral (values ('indicacao'), ('indicacao ')) as v(k)
where s.name = 'Indicação';

insert into ceo.lead_source_aliases (alias_key, lead_source_id)
select 'qualificacao', id from ceo.lead_sources where name = 'Qualificação';

-- Regra de venda: PENDENTE até o CEO definir a fonte oficial (D3).
-- `any` = qualquer fonte que registre a venda conta, e todo desacordo entre
-- fontes vira DATA_CONFLICT visível no painel.
insert into ceo.business_rules (rule_key, version, rule, active, pending, note) values (
  'sale_policy', 1,
  '{"requires":"any","minConfidence":0.5}'::jsonb,
  true, true,
  'PENDENTE: a planilha atual nao e a fonte oficial. Pipeline diz 8 vendas, financeiro diz 14. Trocar a linha ativa quando a fonte definitiva existir.'
);

-- Elegibilidade comercial: provisória (§17).
insert into ceo.business_rules (rule_key, version, rule, active, pending, note) values (
  'lead_eligibility', 1,
  '{"excludeLossCategories":["CREDIT_POLICY"]}'::jsonb,
  true, true,
  'PROVISORIO: exclui perdas por politica de credito do denominador. Definicao oficial pendente.'
);

-- Churn: sem regra. NÃO inventar (§20).
insert into ceo.business_rules (rule_key, version, rule, active, pending, note) values (
  'churn', 1,
  '{}'::jsonb,
  false, true,
  'SEM REGRA. A definicao oficial de churn da Creditum nao foi fornecida. Metricas de churn devem retornar BUSINESS_RULE_PENDING ate que exista.'
);
