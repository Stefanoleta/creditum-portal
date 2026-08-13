# Creditum CEO Intelligence — Design

**Data:** 2026-08-13
**Autor:** Claude (Principal Engineer) com Stefano Chinaglia Leta (CEO)
**Status:** aprovado em conversa · Fase 1 em implementação
**Branch:** `feature/ceo-intelligence`

---

## 1. Objetivo

Sistema privado de inteligência operacional do fundador da Creditum. Não é CRM,
não é ferramenta de vendedor, não exige alimentação manual da equipe.

Critério de sucesso: **o CEO abre o app por 30 segundos e entende como a operação
está hoje, o que mudou, onde tem problema e o que merece atenção dele.**

O sistema opera por *management by exception*: se está tudo normal, ele diz que
está normal. Se tem problema, ele acha o problema — o CEO não procura.

---

## 2. Decisões aprovadas

| # | Decisão | Escolha |
|---|---|---|
| D1 | Onde vive | Repo `creditum-portal`, route group `/ceo`, schema `ceo` no Supabase `creditum-portal` (`ucizwcfzkycsbhkvyivd`) |
| D2 | Portal atual | **Sai da vista do CEO, encanamento continua vivo.** CEO App vira a raiz. Nenhum link para as telas da equipe. `/api/webhooks/argus` e `/api/cron/analyze` preservados |
| D3 | Fonte de verdade de venda | **Indefinida por ora** — a planilha atual não é a fonte oficial; a oficial está em desenvolvimento. Regra fica como registro configurável, não como código |
| D4 | Coleta | n8n Cloud lê o Sheets e faz POST em `/api/ceo/ingest/google-sheets`. Desenhado, **não construído** |
| D5 | Ticket | `ticket = valor_repasse × parcelas_grau` · `TKM = média do ticket do vendedor no período` |
| D6 | Auditoria final | Revisão com Codex ao término, para maximizar assertividade |

---

## 3. Achados da auditoria (fatos, não hipóteses)

Auditoria da planilha `Vendas - Agosto` (`1Q7Loki…`, dona `lucas.costa@`) em
2026-08-13. **Estes achados são o motivo de várias decisões de arquitetura.**

### 3.1 A planilha tem 3 abas, não 1

| Aba | Papel | Conteúdo |
|---|---|---|
| Indicações | `pipeline` | 13 colunas · **132 linhas reais + ~55 linhas-fantasma** |
| Vendas | `sales` | 12 colunas · 14 vendas · tem CPF, repasse e ticket |
| Conversão | `reference_only` | conversão consolidada montada à mão |

### 3.2 As abas se contradizem

- Aba `pipeline` tem **8** linhas com `Status = Venda`.
- Aba `sales` tem **14** vendas.
- **6 vendas da aba financeira não constam como venda no pipeline** — 3 não
  existem no pipeline, 3 estão lá como `Novo`.
- Uma venda tem data `04/08` no pipeline e `05/08` na financeira.

→ Hoje o número de vendas de agosto depende de qual aba se abre.
→ Origem de **D3** e do `DATA_CONFLICT` visível no painel.

### 3.3 Linhas-fantasma

~55 linhas vazias na aba pipeline carregam `Status = "Novo"` e
`Total de parcelas = 0`. Ingestão ingênua criaria 55 leads inexistentes e
afundaria a conversão.

→ Regra `is_blank_row`: sem aluno **e** sem contato **e** total = 0 → rejeitada,
contada como `rows_skipped` no sync. Visível, nunca silenciosa.

### 3.4 Entidades não normalizam

- Unidade: `Grau Sumaré` / `Grau Sumare`, `Grau Alecrim` / `Grau alecrim`,
  `Grau Marabá` / `Grau Maraba`
- A aba `sales` **não usa o prefixo "Grau"**: `Meriti`, `Mogi`, `Zona Norte`
- Canal: `Indicação` / `indicação`
- `Ninguem` / `Ninguém` aparecem como Vendedor e SDR — sentinela de não-atribuído

→ Resolução por **tabela de alias em dados**, não por regex em código.
→ `Ninguem` mapeia para `UNASSIGNED` e fica fora do ranking.

### 3.5 Status além do previsto

Observados: `Novo`, `Venda`, `Fora de politica` (sem acento),
`Parou de responder`, `Nunca respondeu`, `Sem interesse`, `Em negociação`,
**`Não tem Garantidor`**, **`Procurando garantidor`**.

Os dois últimos não constavam na especificação inicial e são perda por
`GUARANTOR`.

### 3.6 Duplicidade e identidade

- **Duplicata real:** um aluno de Prudente com mesmo nome, telefone e data em
  duas linhas, com `(%)` divergente (20% vs 25%) → `DATA_CONFLICT`, nunca merge.
- **Mesmo telefone, duas jornadas:** um aluno de Mogi aparece 03/08 como
  `Qualificação / Fora de politica` e 10/08 como `Indicação / Venda`.
  Dedup por telefone colapsaria os dois e **apagaria uma venda**.
  → Mesmo `student`, **duas `opportunities`**.

### 3.7 Parsing

- Moeda: `R$ 578,70` e `R$410,00` (sem espaço)
- CPF em 3 formatos; **3 CPFs com 10 dígitos** — zero à esquerda perdido pelo Sheets
- Data: `dd/MM/yyyy`
- Percentual: `20%`, `29%`, `11%`

### 3.8 Ticket descoberto e confirmado

`ticket = valor_repasse × parcelas_grau` — confere nas 14 linhas da aba `sales`.
Confirmado pelo CEO. `TKM` é a **média** desse ticket por vendedor no período.

---

## 4. Lacunas do repo atual (encontradas, não introduzidas)

| Lacuna | Impacto | Ação |
|---|---|---|
| Sem autenticação — nenhum `middleware.ts`, nenhum login | Portal público na Vercel com nomes e telefones de alunos; `/api/*` aberto | Fase 1 adiciona auth em `/ceo/*` e `/api/ceo/*`. Exposição das rotas antigas fica registrada como item separado |
| Sem `typecheck`, sem test runner | §39 exige testes | Fase 1 adiciona script `typecheck` e Vitest |
| `package.json` name = `temp-init` | cosmético | corrigir |
| `CLAUDE.md` com stack `[definir]` | contexto errado para quem chega | atualizar |
| `vercel.json` pede cron `*/5` — plano Hobby roda 1×/dia | sync não roda na frequência esperada | **motivo de D4**: n8n empurra, não depende do cron da Vercel |

---

## 5. Arquitetura

```
n8n Cloud (lê Google Sheets)
   │
   └─ POST /api/ceo/ingest/google-sheets      HMAC + Idempotency-Key
        │
        ├─ RAW         ceo.source_records      imutável · sha256 · payload jsonb
        ├─ NORMALIZE   ceo.source_mappings     config em DADOS, não em código
        ├─ AUDIT       ceo.data_conflicts      + checks de qualidade
        ├─ CORE        students · leads · opportunities · sales
        │              sellers · schools · lead_events · loss_reasons
        ├─ METRICS     determinístico · fórmulas em METRICS.md
        └─ EVENTS      → notificações
                            │
                            └─ /ceo  (Home mobile-first)
```

**Invariante:** raw nunca é sobrescrito. Toda métrica é reconstruível a partir
dele. Auditoria posterior é sempre possível.

### 5.1 Source Adapter — contrato

```ts
interface DataSourceAdapter {
  sourceName: string
  testConnection(): Promise<ConnectionResult>
  fetchChanges(cursor?: string): Promise<SourceBatch>
  normalize(record: RawSourceRecord): Promise<NormalizedRecord>
}
```

`GoogleSheetsAdapter` é a primeira implementação, não a única. Previstos:
`BitrixAdapter`, `ContractAdapter`, `PaymentAdapter`, `WebhookAdapter`.

**O coletor não interpreta** (§22). O n8n manda string crua — não converte
moeda, não parseia data, não tira espaço. Toda conversão acontece no app, onde
tem teste. Se o n8n "ajudasse", cada bug de parsing seria invisível e
não-testável.

### 5.2 Identidade de registro externo

A planilha não tem IDs. O número da linha **não serve** como identidade: inserir
uma linha no meio deslocaria tudo e o sistema acharia que centenas de registros
mudaram.

```
source_record_id = sha256(spreadsheet_id | tab_gid | conteúdo normalizado da linha)
_row             = guardado apenas como pista de localização
```

### 5.3 Detecção de venda — política configurável

```ts
type SaleEvidence = {
  source: string
  recordId: string
  kind: 'status_transition' | 'financial_record'
  confidence: number
}

type SalePolicy = {
  requires: 'any' | 'all' | 'primary'
  primarySource?: string
  minConfidence: number
}
```

Guardada em `ceo.business_rules`, versionada. Default enquanto a fonte oficial
não chega: `requires: 'any'` — **e todo desacordo entre fontes vira
`DATA_CONFLICT` visível no painel.**

Hoje isso significa: painel mostra 14 vendas, com 6 marcadas para auditoria.
Quando a fonte definitiva entrar, muda-se o registro — não o código.

Idempotência: a mesma venda nunca gera duas notificações.

### 5.4 Os quatro tipos de dado nunca se misturam

Toda métrica carrega `data_class`:

| Classe | Significado | Tratamento na UI |
|---|---|---|
| `observed` | veio da fonte | número direto |
| `calculated` | derivado por código determinístico | número + fórmula acessível |
| `inferred` | classificação semântica (ex. motivo de perda por IA) | rótulo + confiança |
| `forecast` | projeção | faixa + rótulo, **nunca como fato** |

Ausência é `DATA_NOT_AVAILABLE` — **nunca zero**. Conflito é `DATA_CONFLICT`.
Baixa confiança é `LOW_CONFIDENCE`.

### 5.5 Deduplicação por score

| Sinal | Força |
|---|---|
| CPF normalizado (com recuperação do zero à esquerda) | forte |
| Telefone + unidade | média |
| Nome | **nunca sozinho** |

Registro ambíguo nunca é fundido em silêncio — vira `DATA_CONFLICT`.

---

## 6. Métricas (contrato — detalhe em METRICS.md)

```
ticket(venda)              = valor_repasse × parcelas_grau           [calculated]
tkm(vendedor, período)     = AVG(ticket) das vendas do período       [calculated]
volume_contratado(período) = SUM(ticket)                             [calculated]

gross_conversion    = sales / leads_received                         [calculated]
eligible_conversion = sales / leads_eligible                         [calculated]
leads_eligible      = leads_received − perdas por CREDIT_POLICY      [BUSINESS_RULE_PENDING]
```

As duas conversões aparecem **lado a lado**, nunca só uma. Hoje: 132 leads,
~40 fora de política — a conversão elegível fica bem acima dos 10,61% que a aba
`reference_only` mostra.

**Nunca** um LLM calcula. Soma, média, percentual, ranking, conversão, ticket e
agregação são código determinístico e testado.

### 6.1 Taxonomia de motivo de perda

`CREDIT_POLICY` · `GUARANTOR` · `COMMERCIAL` · `OPERATIONAL` · `OTHER`

Sempre preservados três campos: `raw_loss_reason`, `normalized_loss_reason`,
`classification_confidence`. IA pode sugerir classificação de texto livre; nunca
sobrescreve o texto original.

---

## 7. Regras de negócio pendentes

Marcadas no código como `BUSINESS_RULE_PENDING`. Não bloqueiam o
desenvolvimento — as abstrações e os campos opcionais existem.

| Regra | Estado |
|---|---|
| Fonte oficial de venda | em desenvolvimento pelo CEO (**D3**) |
| Elegibilidade comercial de lead | provisório: exclui `CREDIT_POLICY` |
| Churn | definição oficial não fornecida — **não inventar** |
| Curso | campo previsto, fonte ainda não disponível |
| `contract_value`, `revenue_value` | campos criados, vazios por ora |
| Garantidor, Serasa, pagamentos, contrato | abstrações preparadas |

---

## 8. Segurança

- Dados de aluno são sensíveis. PII mascarada em log — **nunca** CPF em log.
- Auth em `/ceo/*` e `/api/ceo/*`; RLS no schema `ceo`.
- Ingest protegido por HMAC. Segredos só em env var, nunca no frontend.
- Um usuário CEO agora; modelado para múltiplos depois.

---

## 9. Observabilidade

Tela `System Health` com, por fonte: último sync, status, linhas processadas,
novos, alterados, `rows_skipped`, conflitos, erros, latência.

Todo painel mostra `Atualizado às HH:mm`. Fonte atrasada mostra aviso explícito.

**Nunca** exibir painel aparentemente atual se a coleta está quebrada.

**Quem detecta silêncio é o app.** Se o n8n morrer, ele não consegue avisar —
então o app marca a fonte como degradada quando passa tempo demais sem sync, e o
n8n avisa quando consegue. Os dois juntos. Sem isso, a observabilidade falha
exatamente no caso que importa.

---

## 10. Testes

Vitest no núcleo determinístico:

- moeda BRL: `R$ 578,70` · `R$410,00` · `578.7` · `607,13` · `"R$ 607,13"`
- CPF de 10 dígitos (zero à esquerda) e com máscara
- data `dd/MM/yyyy`
- linha-fantasma
- alias de unidade e vendedor · sentinela `Ninguem`
- dedup e idempotência
- detecção de venda nova (transição `NOT_SALE → SALE`)
- conversão bruta e elegível
- ticket e TKM
- agregação por vendedor, unidade e período

---

## 11. Fases

| Fase | Entrega |
|---|---|
| **F1** | Fundação: schema, migrations, auth, contrato de adapter, raw ingestion, normalização, sync log, testes |
| **F2** | Google Sheets via n8n: ingestão, diff, idempotência, venda nova |
| **F3** | Home do CEO: hoje, ticket, ranking, feed, origem, status, filtros |
| **F4** | Alertas: notification engine, in-app, push/PWA |
| **F5** | Inteligência: histórico, comparativos, anomalias, Daily Brief |
| **F6** | IA: Executive Intelligence, chat com dados, ferramentas seguras |
| **F7** | Forecast — só com histórico suficiente |

`lint` + `typecheck` + `test` ao fim de cada fase. Auditoria com Codex ao final.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Fonte de dados vai mudar (**D3**) | Adapter + mapping em dados + política de venda configurável. O core não conhece a planilha |
| Vercel Hobby limita cron | n8n empurra; app detecta silêncio |
| Portal sem auth expõe PII hoje | Fase 1 protege `/ceo`; exposição antiga registrada para decisão do CEO |
| Ingestão ingênua criaria dados falsos | `is_blank_row`, dedup por score, conflito explícito |
| Métrica mudar de significado em silêncio | `METRICS.md` obrigatório com cada fórmula |
