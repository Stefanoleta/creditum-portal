# Fase 2.6 — Closure & Integration Gate

**Data:** 2026-08-17
**Estado:** fechamento da Fase 2. Hermes não instalada, Fase 3 não iniciada.

> **Atualizado pela Fase 2.6c.** Catálogo D13 **READY**: 49 unidades importadas de
> `UNIDADES.xlsx` (44 ativas, 5 inativas, 2 agrupamentos). Severidade do low-ticket
> removida — o fato é detectado, o Event fica bloqueado. Blockers: **4**.
>
> **Atualizado pela Fase 2.6b.** O catálogo D13 e a política de negócio avançaram —
> ver `FASE_2_6B_GOVERNED_CATALOG_AND_POLICY.md`. Em resumo: 18 unidades e 2
> agrupamentos governados, 5 políticas aprovadas, nova regra de ticket baixo, e os
> blockers da Fase 3 caíram de 7 para 5.

**Escopo:** inventário real do working tree, arquitetura end-to-end, contratos de
fonte, governança do catálogo D13, thresholds, provenance, matriz de falhas,
limite de confiança da Hermes e critérios de entrada da Fase 3.

> **Nada neste documento foi estimado de memória.** Cada linha do inventário
> corresponde a arquivo lido. Onde não há evidência no repositório, o status é
> `OPEN DECISION` — não uma suposição plausível.

---

## 1. Componentes entregues

### 1.1 Inventário

| Componente | Arquivo | Estado |
|---|---|---|
| Contratos JSON (6) | `contracts/*.schema.json` | **READY** |
| Gateway / egress / PII | `gateway/src/{gateway,egress,pii,allowlist}.ts` | **READY** |
| Store read-only + TOCTOU | `gateway/src/store.ts` | **READY** |
| Factory + validação semântica | `gateway/src/{factory,semantic,integrity}.ts` | **READY** |
| deepFreeze compartilhado | `gateway/src/immutability.ts` | **READY** |
| Motor (re-export puro) | `detectors/src/engine.ts` | **READY** |
| D13 canonicalização | `detectors/src/canonical-units.ts` | **READY** (catálogo é entrada) |
| Datas de negócio | `detectors/src/dates.ts` | **READY** |
| Data civil estrita | `detectors/src/civil-date.ts` | **READY** |
| Severidade | `detectors/src/severity.ts` | **READY** |
| Lattice de qualidade | `detectors/src/quality.ts` | **READY** |
| Parte-do-todo | `detectors/src/part-of-whole.ts` | **READY** |
| Identidade estrutural | `detectors/src/structural-id.ts` | **READY** |
| Identidade de conflito | `detectors/src/conflict-id.ts` | **READY** |
| Contrafactual | `detectors/src/counterfactual.ts` | **READY** |
| Provenance de evidência calculada | `detectors/src/counterfactual-provenance.ts` | **READY** |
| Materialidade / comparação | `detectors/src/{materiality,comparison}.ts` | **READY** |
| Config de detectores | `detectors/src/config.ts` | **PARTIAL** — ver §5 |
| **Detector A** installment_concentration | `detectors/src/installment-concentration.ts` | **READY** — SHIP |
| **Detector B** data_quality_conflict | `detectors/src/cross-source-conflict.ts` | **READY** — SHIP |
| **Detector C** first_due_date_concentration | `detectors/src/first-due-date-concentration.ts` | **READY** — SHIP |
| **Detector D** material_single_case | `detectors/src/material-single-case.ts` | **READY** — SHIP |
| Portas de ingestão | `integration/src/ports.ts` | **PARTIAL** — interfaces sem adaptador |
| Harness end-to-end | `integration/tests/end-to-end.test.ts` | **READY** — 43 testes (Fase 2.6b) |
| Catálogo D13 governado | `catalog/unidades.catalog.json` + `detectors/src/unit-catalog.ts` | **READY** (Fase 2.6c) — 49 unidades de `UNIDADES.xlsx` |
| Conversor XLSX → catálogo | `tools/xlsx_to_catalog.py` | **READY** — build step, stdlib |
| Regra de ticket baixo | `detectors/src/low-ticket.ts` | **PARTIAL** — piso APPROVED; severidade UNRESOLVED bloqueia o Event |
| `expected_units` por período | — | **NOT_IMPLEMENTED** — ver §4.4 |
| Adaptador Leonardo/Supabase | — | **NOT_IMPLEMENTED** — ver §3.1 |
| Adaptador Lucas/pasta mensal | — | **NOT_IMPLEMENTED** — ver §3.2 |
| Read-model da Hermes | — | **NOT_IMPLEMENTED** — ver §9.2 |
| Briefing Aros | `contracts/aros-briefing.schema.json` | **PARTIAL** — inadequado, ver §9.1 |

### 1.2 Contagem de testes

| Suíte | Testes |
|---|---|
| `intelligence/` total | **1.123** (22 arquivos) |
| Gateway | 257 |
| Detector A | 164 |
| Detector B | 74 |
| Detector C | 196 |
| Detector D | 147 |
| Config | 66 |
| **Integração end-to-end (novo)** | **31** |
| Portal | 182 |
| Motor `src/lib/ceo` | 182 |

---

## 2. Arquitetura end-to-end

```
  FONTE                    │ Google Sheets (Lucas) · Supabase (Leonardo) · Omie · Bitrix
    ↓                      │
  SourceAdapter            │ PLANO DE INGESTÃO — escreve
    ↓                      │ produz: RawBatch (observed_at, collected_at, content_hash)
  DETACH / NORMALIZE       │ motor: parse.ts, normalize.ts
    ↓                      │
  D13 canonicalizeUnit     │ catálogo é ENTRADA governada, nunca inferência
    ↓                      │ produz: matched | unknown | ambiguous
  SNAPSHOT                 │ único produtor de snapshot_id
    ↓                      │ valida: schema + semântica (factory.ts)
  EVIDENCE                 │ observação → row/cell
    │                      │ cálculo    → computed + ComputedEvidenceProvenance
    ↓                      │
  InMemoryStore            │ PLANO DE CONSULTA — somente leitura
    ↓                      │ valida integridade referencial, congela o grafo
  DETECTORES A B C D       │ funções PURAS. Verificam provenance; nunca a criam.
    ↓                      │ produzem: IntelligenceEvent validado + summary auditável
  READ-MODEL               │ projeção fechada — §9.2
    ↓                      │
  HERMES (futuro)          │ OBSERVAR · ANALISAR · ALERTAR · RECOMENDAR
```

### 2.1 Quem produz cada fato governado

| Fato | Produtor | Hermes pode produzir? |
|---|---|---|
| `snapshot_id` | `DatasetSnapshotBuilder` (ingestão) | **NÃO** |
| `evidence_id` de observação | `EvidenceBuilder` (ingestão) | **NÃO** |
| `evidence_id` de cálculo | `ComputedProvenanceBuilder` (plano de cálculo) | **NÃO** |
| `computation_id` | quem executa o cálculo, antes do detector | **NÃO** |
| `ComputedEvidenceProvenance` | quem calculou a evidência | **NÃO** |
| Resolução D13 | `canonicalizeUnit` sobre catálogo governado | **NÃO** |
| Catálogo de unidades | decisão humana → `ceo.schools`/`school_aliases` | **NÃO** |
| `expected_units` | governança do período — **OPEN** | **NÃO** |
| Thresholds aprovados | CEO | **NÃO** |
| `detected_at` | orquestrador da execução, explícito | **NÃO** |
| `event_id` | detector, a partir do fato governado | **NÃO** |
| Escrita em qualquer plano | ingestão | **NÃO** |
| Leitura do read-model | — | **SIM**, e só isso |

**Nenhuma linha da coluna direita é `SIM` exceto leitura.** Isto é estrutural, não
política: o detector é o único plano que não escreve, e a Hermes fica um passo
depois dele.

---

## 3. Fontes reais

### 3.1 Leonardo — migração API → Supabase

A migração é troca de **adaptador**, não mudança de detector. A `SourceAdapter`
existe exatamente para que essa troca não atravesse o `dataset_id` lógico.

| Item | Estado |
|---|---|
| Tabela/view de origem | **OPEN INTEGRATION DECISION** — o repositório menciona Leonardo apenas como coordenador (`CLAUDE.md:35`). Nenhum nome de tabela tem lastro. |
| `dataset_id` lógico | Recomendado estável, ex. `ds_residencia_mensal`. Nunca conter versão nem data. |
| Campos exigidos | Depende da tabela. Definir junto com a decisão acima. |
| Incremental vs full | **OPEN** — `ceo.source_records` já suporta `superseded_at`/`superseded_by`, então incremental é viável sem mudança de schema. |
| Freshness / `as_of` | `observed_at` da origem ≠ `collected_at` da ingestão. Ver §7. |
| Ownership de evidência | Uma `Evidence` por linha lida, `locator.dataset_id` = dataset lógico. |
| Schema drift | Campo ausente → `null` → lacuna. **Nunca zero.** Provado no harness. |
| Tabela vazia | Lote com `rows: []` → `EMPTY_DENOMINATOR`, sem evento. Provado no harness. |
| Indisponibilidade | Erro do adaptador, **não** lote vazio. Distinguir é obrigatório. |

**Infraestrutura já existente que serve:** `ceo.source_syncs` (idempotency_key,
content_hash, rows_skipped, conflicts_found) e `ceo.source_records` (row_key,
locator, payload, content_hash, collected_at). O schema de ingestão já foi
desenhado; falta só ligar a origem.

### 3.2 Lucas — pasta mensal

| Item | Recomendação / estado |
|---|---|
| Padrão de pasta | `YYYY-MM`, ex. `vendas/2026-08/` |
| Mês de negócio | Derivado com `businessDateOf(instante, "America/Sao_Paulo")` + `monthKeyOf`. **Nunca** o locale do processo. |
| Mês ≠ execução | `businessMonth` é do dado; `collected_at` é da leitura. Dois campos distintos no `RawBatch`. |
| Descoberta de arquivos | **OPEN** — depende de o storage ser Drive, S3 ou filesystem. |
| Extensões permitidas | **OPEN** — allowlist fechada, nunca "qualquer planilha". |
| Ordenação | Determinística por nome; nunca por `mtime` (muda em cópia). |
| Dois arquivos | **Conflito**, não "o mais recente ganha". Detector B existe para isso. |
| Arquivo faltando | Lacuna de cobertura do período, não zero. |
| Atrasado do mês anterior | Pertence ao mês do DADO, não ao da pasta. Precisa de regra: **OPEN**. |
| Arquivo futuro | Recusar: `period_end > businessMonth` corrente falha fechado. |
| Schema mismatch | Falha fechada por arquivo, não silenciosa. |
| Arquivo vazio | `EMPTY_DENOMINATOR`. |
| Identidade | `content_hash` sobre o conteúdo → idempotência (§6). |

**Não implementei acesso a filesystem/cloud.** As duas decisões abertas acima
(storage e regra de arquivo atrasado) determinariam o código, e escrever antes
delas seria inventar.

---

## 4. Governança do catálogo D13

### 4.1 Decisão desta fase: catálogo é DADO, não união compilada

`UnitId` permanece `string` validada por `/^[a-z][a-z0-9_]{1,63}$/`, e o catálogo
entra como `UnitCatalog { catalog_version, units[] }`.

**Isto supersede** a proposta de `FASE_2_1_SCHEMA_V2_PROPOSAL.md` §6 e a
recomendação final de `D13_CATALOG_VALIDATION.md` §8, que previam transformar
`UnitId` em união literal. Com ~40 escolas e crescendo, a união literal exigiria
recompilar o POC a cada abertura de unidade — e faria a abertura de uma escola
virar deploy de código.

**Consequência para o bloqueio B1:** ele deixa de depender de enum compilado.
Passa a depender só do **conteúdo** governado do catálogo.

### 4.2 Forma do catálogo vs. tabelas existentes

| Campo pedido no briefing | `ceo.schools` / `school_aliases` | Estado |
|---|---|---|
| `unit_id` | `schools.id` (uuid) | mapeável |
| `canonical_name` | `schools.name` (unique) | **READY** |
| `aliases` | `school_aliases.alias_key` → `school_id` | **READY** |
| `status` | `schools.active` (boolean) | **PARTIAL** — booleano, não estado |
| `effective_from` / `effective_to` | **ausente** | **NOT_IMPLEMENTED** |

**Lacuna real:** sem `effective_from/to`, uma escola inativada perde a história —
um período anterior à inativação passaria a ter cobertura errada retroativamente.
Registrado como decisão de governança, não implementado.

### 4.3 Decisões D13 realmente pendentes

Tabela fechada, derivada de `docs/D13_CATALOG_VALIDATION.md` (fontes citadas lá).
**Nenhum nome canônico foi escolhido por mim.**

| # | Nome observado | Candidato | Fonte | Status | Decisão humana? |
|---|---|---|---|---|---|
| 1 | `BelfordRoxo` | Belford Roxo | `public.unidades` | `ambiguous` | **SIM** — grafia do `display_name` |
| 2 | `Maracanau` | Maracanaú | `public.unidades` | `ambiguous` | **SIM** — grafia |
| 3 | `Jardim Angela` | Jardim Ângela | `public.unidades` | `ambiguous` | **SIM** — grafia |
| 4 | `Presidente P.` | Prudente **(?)** | `public.unidades` + BRIEFING §3.5 | `ambiguous` | **SIM** — `P.` não é expansível |
| 5 | `Rio Centro` | — | `public.unidades` | `unknown` | **SIM** |
| 6 | `Bezerra` | — | `public.unidades` | `unknown` | **SIM** |
| 7 | `Santa Cruz` | — | `public.unidades` | `unknown` | **SIM** |
| 8 | `Grau Marabá` | Marabá **(?)** | BRIEFING §3.5, **ausente** das 27 | `unknown` | **SIM** — a fonte reporta, o catálogo não conhece |
| — | `Rio Preto` → São José do Rio Preto | — | D13, confirmado pelo CEO | `confirmed` | não |
| — | `Mogi` / `Grau Mogi` → Mogi das Cruzes | — | D13, confirmado pelo CEO | `confirmed` | não |
| — | `Santos` ≠ `Santo Amaro` | — | veto estrutural D12 + teste | `confirmed` | não |
| — | `Limeira` ≠ `Limoeiro` | — | similaridade 0,75 < 0,80 + teste | `confirmed` | não |

Itens 1–3 são de **exibição** (a normalização já os une); 4–8 são de
**identidade**. Suspeitas de duplicidade (`Rio Centro`/`Zona Norte`/`Madureira`)
seguem sem evidência — registradas, não resolvidas.

### 4.4 `expected_units` ≠ unidades ativas

Formalizado: **duas dimensões distintas.**

```
catálogo ativo:       40 unidades
esperadas no período: 37  ← denominador da cobertura
```

Usar 40 produziria degradação permanente e falsa. `ExpectedUnitsProvider.forPeriod`
devolve `number | null`; `null` significa **lacuna de governança**, não 100%.

**Fonte de `expected_units`: OPEN GOVERNANCE DECISION.** O `20` da fixture da
Fase 1 nunca foi política e não foi promovido.

---

## 5. Thresholds

| Threshold | Detector | Unidade | Estado |
|---|---|---|---|
| `installment_threshold = 19` | A | parcelas | **APPROVED** — Bloco 1 §14 Caso A |
| `similarity_threshold_bp = 8000` | D13 | bp | **APPROVED** — calibrado (alecrim 8600 / limeira 7500) |
| `minimum_sample_size` | A | contagem | **UNRESOLVED** |
| `material_count_above` | A | contagem | **UNRESOLVED** |
| `material_share_count_bp` | A | bp | **UNRESOLVED** |
| `material_share_amount_bp` | A | bp | **UNRESOLVED** |
| `material_amount_cents` | A | centavos | **UNRESOLVED** |
| `contributing_case_rule` | A | política | **UNRESOLVED** |
| `severity_dimension` + `severity_scale` | A | política | **UNRESOLVED** |
| `minimum_coverage_bp` | A | bp | **UNRESOLVED** |
| `material_absolute_count` / `_amount_cents` / `_basis_points` | B | 3 unidades | **UNRESOLVED** |
| `material_relative_difference_bp` | B | bp | **UNRESOLVED** |
| `material_share_bp` | B | bp | **UNRESOLVED** |
| `structural_fields` | B | lista | **UNRESOLVED** |
| `severity_by_relative_bp` / `structural_severity` | B | política | **UNRESOLVED** |
| `window` | C | modo | **UNRESOLVED** |
| `material_count` / `_share_count_bp` / `_amount_cents` / `_share_amount_bp` | C | 4 unidades | **UNRESOLVED** |
| `severity_dimension` + `severity_scale` | C | política | **UNRESOLVED** |
| `minimum_sample_size` | C | contagem | **UNRESOLVED** |
| `supported_metrics` | D | lista | **UNRESOLVED** |
| `min_population_after_removal` | D | contagem | **UNRESOLVED** |
| `material_absolute_delta_cents` | D | centavos | **UNRESOLVED** |
| `material_count_delta` | D | contagem | **UNRESOLVED** |
| `material_relative_delta_bp` | D | bp | **UNRESOLVED** |
| `material_share_of_total_bp` | D | bp | **UNRESOLVED** |
| `severity_dimension` + `severity_scale` | D | política | **UNRESOLVED** |
| `coverage.degraded_below_bp` / `emit_event_below_bp` | todos | bp | **UNRESOLVED** |

**2 APPROVED, 0 TEST_ONLY em produção, ~30 UNRESOLVED.**

Consequência de cada UNRESOLVED: `validateDetectorConfig` **recusa a config**. Não
há `DEFAULT_CONFIG` — um teste verifica que o módulo não exporta `DEFAULT_CONFIG`,
`PRODUCTION_CONFIG` nem `CREDITUM_CONFIG`. `TEST_CONFIG` vive em `tests/` e declara
`config_version: "0.0.0"`.

**Não propus nenhum número.** Cada UNRESOLVED é uma decisão de negócio: "a partir
de quanto isto merece o tempo do CEO?".

---

## 6. Provenance e idempotência

### 6.1 Cadeia de confiança

```
observação crua        → Evidence (row/cell)
cálculo determinístico → Evidence (computed) + ComputedEvidenceProvenance
detector               → VERIFICA; nunca cria
```

Três computation identities, todas estruturais (sem gramática de delimitador):

| Identidade | Detector | Composta por |
|---|---|---|
| `conflictId` | B | field, kind, período, participantes (fonte+dataset+valor) |
| `counterfactualComputationId` | D | detector, métrica, agregador, operação, `subject_ref`, período, escopo |
| `firstDueComputationId` | C | detector, dimensão de agrupamento, modo de janela, referência, alvo, período, escopo, **claim_set** |

`evidence_ref` fica **fora** de todas as três: a identidade é da computação, não do
registro que a documenta.

### 6.2 Quais IDs mudam em reingestão

| Identidade | Reingestão do mesmo dataset lógico | Dataset diferente |
|---|---|---|
| `content_hash` da fonte | **igual** (se o conteúdo é igual) | diferente |
| `dataset_id` lógico | **igual** | diferente |
| `snapshot_id` (execução) | **muda** | muda |
| `evidence_id` | pode mudar | muda |
| `computation_id` | **igual** | diferente |
| `event_id` (fato lógico) | **igual** | **diferente** |

Provado no harness: dois `snapshot_id` distintos sobre o mesmo dataset lógico
produzem o **mesmo** `event_id`; trocar o `dataset_id` produz outro.

---

## 7. Freshness

Quatro tempos, nomeados de propósito:

| Campo | Significado |
|---|---|
| `observed_at` | quando o dado foi observado **na origem** |
| `collected_at` / `ingested_at` | quando a ingestão leu |
| `period_start` / `period_end` | a que período de negócio se refere |
| `detected_at` | quando o detector rodou — **sempre entrada explícita** |

Regra da Fase 1 preservada: a freshness do resultado é a da dependência **mais
antiga** relevante. Nenhum `Date.now()` dentro de detector — verificado por
inspeção e pelo harness, que passa `now` explícito até ao `InMemoryStore`.

---

## 8. Multi-dataset

`Evidence.locator` expressa **um** `dataset_id`. A, C e D falham fechado quando os
registros atravessam mais de um escopo governado.

| Cenário provável | Classificação |
|---|---|
| Vendas do mês, um arquivo, um dataset | **SAFE FOR CURRENT INGESTION** |
| Vendas do mês, dois arquivos na pasta | **SAFE** se cada um for dataset próprio e o detector rodar por dataset |
| Conflito Sheets × Omie (Detector B) | **SAFE** — B compara *entre* datasets por desenho |
| Consolidado somando Sheets + Supabase num agregado só | **PHASE 3 BLOCKER** |
| Cobertura de unidades sobre múltiplas fontes | **PHASE 3 BLOCKER** se o agregado for único |

**Recomendação:** rodar A/C/D **por dataset** na Fase 3. Compound evidence só se
aparecer necessidade demonstrada — não implementar por antecipação.

---

## 9. Briefing e read-model

### 9.1 O briefing Aros NÃO serve para a Hermes

Achado desta fase, por leitura do schema:

| Campo do Aros | Problema como read-model |
|---|---|
| `context.summary` (4000 chars livres) | prosa; um detector determinístico não a produz honestamente |
| `hypotheses[].is_inference: true` (const) | os detectores **não** produzem inferência |
| `hypotheses[].confidence_bp` | exigiria confiança que não existe |
| — | sem `event_id`, sem `evidence_refs`, sem `coverage`, sem `freshness`, sem conflito |

O Aros é artefato para **consultor externo**, com sanitização de saída da empresa.
A Hermes é consumidora **interna** de fatos validados. São audiências diferentes.

**Proposta (não implementada):** contrato novo, fechado e versionado —
`hermes-read-model.schema.json` — em vez de dobrar o Aros.

### 9.2 Read-model proposto

Projeção fechada, derivada de Events já validados. **Não** acesso ao Store.

```
read_model_version
generated_at
period_start / period_end
detected_at
events[]:
  event_id · event_type · detector_id · detector_version
  severity · materiality (basis + valor)
  observed_metric / reference_metric (com data_class e formula)
  evidence_refs[] · snapshot_ids[]
  data_quality (quality_status, missing_fields[], conflict_ids[], coverage_ratio_bp)
gaps[]:        metric_name · gap_reason
conflicts[]:   conflict_id · field · resolution_state (nunca resolvido pelo sistema)
coverage:      expected_units · reporting_units · ratio_bp   (ou lacuna)
freshness:     oldest_relevant_observed_at
approved_by_human: false
```

Garantias exigidas: sem texto cru da fonte, sem nome cru de unidade, sem PII, sem
token de escrita, sem credencial de ingestão, sem service role, sem forecast.

---

## 10. Limite de confiança da Hermes

| PODE | NÃO PODE |
|---|---|
| OBSERVAR o read-model | escrever no Supabase operacional |
| ANALISAR fatos validados | alterar CRM / Bitrix / Omie |
| ALERTAR sobre eventos materiais | alterar qualquer valor |
| RECOMENDAR com `approved_by_human: false` | resolver conflito |
| — | aprovar recomendação |
| — | criar Evidence ou Provenance |
| — | canonicalizar unidade por conta própria |
| — | executar ação financeira ou comercial |
| — | publicar automaticamente |

### 10.1 Matriz de credenciais

| Componente | Credencial | Modo | Escopo | Dono futuro |
|---|---|---|---|---|
| Ingestão Supabase | service role ou key dedicada | **escrita** | tabelas `ceo.*` | plano de ingestão |
| Ingestão pasta Lucas | acesso ao storage | **leitura** | pasta `vendas/` | plano de ingestão |
| Plano de consulta | key read-only | leitura | views do read-model | gateway |
| Hermes | **nenhuma credencial de dado** | — | recebe projeção | runtime da Hermes |
| Provedor de modelo | key do provedor | — | apenas inferência | runtime da Hermes |

**A Hermes nunca recebe credencial de ingestão.** Nenhum secret foi criado.

---

## 11. Matriz de falhas

| Falha | Comportamento | Evento? | Briefing? | Ação humana? |
|---|---|---|---|---|
| Leonardo/Supabase indisponível | **FAIL CLOSED** no adaptador | não | bloqueia o dataset | sim |
| Pasta mensal ausente | lacuna de cobertura | não | com lacuna | sim |
| Arquivo duplicado | **CONFLITO** (Detector B) | sim, conflito | com conflito | **sim — resolução é humana** |
| Arquivo corrompido | **FAIL CLOSED** por arquivo | não | com lacuna | sim |
| Schema drift | campo → `null` → **GAP** | métricas independentes seguem | com lacuna | sim |
| Escola desconhecida | `unknown` → qualidade `degraded` | sim, degradado | sim, degradado | sim — D13 |
| Escola ambígua | `ambiguous` → `conflicted` | sim, conflitado | sim, conflitado | **sim** |
| `expected_units` ausente | **GAP** de cobertura, nunca 100% | conforme limiar | com lacuna | sim |
| Threshold obrigatório ausente | **FAIL CLOSED** na config | não roda | bloqueia | sim |
| Provenance ausente | **FAIL CLOSED** no detector | não | bloqueia | sim |
| Snapshot `conflicted` | lineage propaga → evento `conflicted` | sim, conflitado | sim | **sim** |
| Freshness vencida | dependência mais antiga governa | conforme política | com aviso | sim |
| Multi-dataset sem evidência composta | **FAIL CLOSED** | não | bloqueia agregado | sim — §8 |

Nenhuma linha esconde erro. Nenhuma resolve conflito automaticamente.

---

## 12. Harness de integração

`integration/tests/end-to-end.test.ts` — **31 testes**, nenhum serviço externo.

Cobre: cadeia governada completa · A/B/C/D sobre **um** snapshot e **um** catálogo ·
D13 com alias real, unidade fora do catálogo e nome cru não vazando · datas civis
nas duas grafias · idempotência de reingestão · e a matriz de falhas (snapshot
conflitado, provenance ausente, evidência pendurada, lote vazio, schema drift, data
inválida).

**O que ele prova e nada provava antes:** que os quatro detectores compõem. Cada um
tinha fixture própria; nada garantia que um único snapshot, catálogo e conjunto de
evidências servisse aos quatro. Serve.

Dois defeitos meus que ele encontrou na primeira execução: o `InMemoryStore`
revalidava com o relógio real do processo (o harness passaria hoje e falharia
amanhã) e a forma de `SourceVersion` do Detector B era união discriminada, não
número nu. Ambos corrigidos no harness, nenhum no código de produção.

---

## 13. Critérios de entrada da Fase 3

| # | Critério | Estado | Evidência |
|---|---|---|---|
| 1 | Catálogo D13 governado suficiente | **BLOCKED** | `ceo.schools`/`school_aliases` vazias; 8 decisões pendentes (§4.3) |
| 2 | Fonte de `expected_units` definida | **BLOCKED** | OPEN GOVERNANCE DECISION (§4.4) |
| 3 | Thresholds aprovados **ou** detectores desabilitados | **BLOCKED** | 2 approved, ~30 unresolved (§5) |
| 4 | Contrato Leonardo/Supabase definido | **BLOCKED** | tabela/view sem lastro (§3.1) |
| 5 | Contrato pasta mensal do Lucas definido | **BLOCKED** | storage e regra de atrasado abertos (§3.2) |
| 6 | Responsabilidade de criação de provenance definida | **READY** | §6.1, estrutural nos quatro detectores |
| 7 | Harness de integração verde | **READY** | 31 testes |
| 8 | Briefing determinístico fechado | **BLOCKED** | Aros inadequado; read-model proposto, não implementado (§9) |
| 9 | Read-model da Hermes fechado | **BLOCKED** | §9.2 é proposta |
| 10 | Separação de credenciais definida | **READY** | matriz §10.1; nenhum secret criado |
| 11 | Sem PII / nome cru / conteúdo não confiável | **READY** | barreira de egress + PII + testes de varredura |
| 12 | A/B/C/D permanecem SHIP | **READY** | 164 + 74 + 196 + 147 verdes |
| 13 | Gate adversarial de integração aprovado | **PENDING** | esta fase |

**7 blockers.** A Fase 3 não pode começar.

### 13.1 Os blockers em ordem de dependência

1. **Catálogo D13** (#1) — desbloqueia #2, e sem ele toda ingestão real degrada
   qualidade todo mês (`Grau Marabá` seria `unknown` a cada rodada).
2. **Thresholds** (#3) — sem eles nenhum detector roda: a config é recusada.
3. **Contratos de fonte** (#4, #5) — sem eles não há adaptador.
4. **Read-model** (#8, #9) — depende de decidir que a Hermes lê projeção, não Store.

Os itens 1–5 são **decisões suas**, não engenharia pendente.

---

## 14. O que esta fase deliberadamente não fez

- Não instalou Hermes, não escolheu provedor de modelo, não chamou LLM.
- Não conectou Supabase, não acessou a pasta do Lucas, não criou secret.
- Não inventou lista de escolas nem nome canônico.
- Não propôs nenhum threshold.
- Não resolveu nenhuma ambiguidade de D13.
- Não implementou o read-model — ele depende da decisão de §9.1.
- Não implementou adaptador de fonte — dependeria de inventar nomes de tabela e
  caminhos de pasta.
- Nada commitado, nada empurrado.
