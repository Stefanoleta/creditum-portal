# Fase 2.10 — Fonte oficial do Lucas: descoberta e contenção

Discovery + contenção. Nenhuma ingestão implementada, nenhum schema expandido,
nenhuma tabela populada.

## Resultado

```
PENDING RULE CONTAINMENT   CLOSED
  sale_policy              contido (active=false) — e a definição oficial FOI ENCONTRADA
  lead_eligibility         contido (active=false) — segue sem definição oficial

REAL LUCAS SOURCE          Google Sheets "Novos Alunos - {Mês}"
                           owner lucas.costa@creditum.com.br
                           Agosto: 1EnM--9j8i_fXphAkJQXF0BSTMLHbhUOjlAwe0Cx_1ew
OFFICIAL SOURCE            aba `Status Contratos`
SOURCE TYPE                Google Sheets — arquivo mensal, NÃO pasta
GRANULARITY                uma linha = UM CONTRATO
OFFICIAL SALE DEFINITION   CLOSED — contrato com status ≠ C
8 VS 14                    DIFFERENT SEMANTICS (provável) — ver §7
OFFICIAL KPIs              vendas · ticket médio · empréstimo liberado · churn ·
                           distribuição por parcelas · por unidade · por vendedor
INSTALLMENT_COUNT          PRESENT — `PARCELAS`
AMOUNT/TICKET              PRESENT — `TICKET`/`INGRESSO`, com fórmula exposta
FIRST_DUE_DATE             ABSENT
UNIT IDENTITY              `Unidade`, texto livre → precisa do D13
A                          DIRECTLY_COMPATIBLE
B                          DERIVABLE — depende da segunda fonte
C                          NOT_COMPATIBLE
D                          DERIVABLE_WITHOUT_SEMANTIC_CHANGE
LOW_TICKET                 DIRECTLY_COMPATIBLE
CEO CORE                   REVISE
DATASET_ID                 proponível: `lucas_status_contratos_mensal`
IMPLEMENTATION READINESS   PARTIAL
```

---

## 1. Parte A — contenção das regras pending

### 1.1 Consumidores: zero

| RULE | CONSUMER | OUTPUT AFFECTED | PRODUCTION-LIKE? | CURRENT BEHAVIOR |
| --- | --- | --- | --- | --- |
| `sale_policy` | **nenhum** | nenhum | não | dado inerte |
| `lead_eligibility` | **nenhum** | nenhum | não | dado inerte |

Verificado em três frentes: nenhum `.ts` de produção, nenhum teste, e nenhuma das
duas funções de `ceo` (`is_member`, `source_records_append_only`) leem
`business_rules`. O `minConfidence` que aparece em `src/lib/ceo/data-class.ts` é
outro conceito — propagação de confiança de métrica —, não o limiar da regra.

`active: true` descrevia **intenção**, não efeito. A contenção era preventiva.

### 1.2 O invariante

Aplicado como migration `pending_rule_not_authoritative`:

```sql
alter table ceo.business_rules
  add constraint pending_rule_not_active check (not (active and pending));
```

Genérico, não tratamento especial para `sale_policy`. Auditoria prévia confirmou
que as três regras são `pending` e que `churn` já usava `active = false` para dizer
"sem regra" — então o invariante **generaliza a semântica que já existia** em vez
de inventar uma.

No banco porque é onde as regras moram: um guard em TypeScript protegeria só quem
passasse por aquele caminho, e a constraint protege qualquer consumidor futuro,
inclusive n8n e SQL direto.

Estado pós-aplicação, verificado:

| rule_key | active | pending | invariante |
| --- | --- | --- | --- |
| `churn` | false | true | ok |
| `lead_eligibility` | false | true | ok |
| `sale_policy` | false | true | ok |

Teste do invariante: `update ... set active = true where rule_key='sale_policy'`
levanta `check_violation`. Confirmado.

`PENDING RULE CONTAINMENT = CLOSED.`

---

## 2. A fonte oficial

Descoberta pelo caminho certo: **quem já lê o dado do Lucas**. O workflow n8n
`Creditum - Copiloto de Vendas - Diretoria` (`V7RLeLrU4YZHscPf`, **ativo**,
atualizado 18/08) roda diariamente às 07:00 BRT e envia o relatório para a
diretoria — incluindo `lucas.costa@creditum.com.br`.

```
Cron 07:00 BRT
  └─ Gerar nome: `Novos Alunos - ${mês em português}`
       └─ Google Drive: buscar arquivo por nome
            └─ Google Sheets: ler aba `Status Contratos`
                 └─ Calcular indicadores (JS no workflow)
                      └─ Claude (interpretação em texto)
                           └─ Gmail → diretoria
```

Confirmação no Drive:

| arquivo | owner | modificado | id |
| --- | --- | --- | --- |
| **Novos Alunos - Agosto** | **lucas.costa@creditum.com.br** | **19/08 13:39** | `1EnM--9j8i…Cx_1ew` |
| Novos Alunos - Julho | nicole@creditum.com.br | 19/08 13:42 | `1DzSNUGHLc…EnGA` |
| Novos Alunos - Junho | nicole@creditum.com.br | 14/08 19:35 | `1jlRiYG79I…MSNk` |

Ativamente mantida — modificada hoje. A titularidade passou de Nicole para Lucas
em agosto; vale saber quem é o dono formal daqui para frente.

### 2.1 Correção de uma suposição anterior

O contrato conceitual das fases 2.6/2.7 assumia **pasta mensal** `vendas/YYYY-MM/`.
**Está errado.** O padrão real é **um arquivo por mês**, nomeado em português
(`Novos Alunos - Agosto`), localizado por **busca no Drive por nome**, sem pasta
fixa e sem `YYYY-MM`.

Consequências para o contrato de ingestão:

| suposto | real |
| --- | --- |
| pasta `vendas/YYYY-MM/` | arquivo `Novos Alunos - {Mês}` |
| `YYYY-MM` | nome do mês em português |
| extensão a definir | **Google Sheets nativo**, não XLSX |
| storage a definir | **Google Drive** |
| dois arquivos no mês = conflito | busca por nome com `limit: 1` — **hoje pega o primeiro em silêncio** |

O último item é um risco real: se existirem dois arquivos com "Novos Alunos -
Agosto" no nome, o workflow atual escolhe um sem avisar. É exactamente o caso que
a regra aprovada chamava de CONFLICT.

## 3. Campos da aba `Status Contratos`

Extraídos do normalizador do workflow, que faz NFD + remove acento + upper antes
de comparar — então a planilha tolera variação de acento e caixa.

| campo | alternativas aceitas | uso |
| --- | --- | --- |
| `ALUNO` | — | identidade do aluno (PII) |
| `CPF` | — | identidade (PII) |
| `Unidade` | — | dimensão de unidade |
| `Vendedor` | — | dimensão de vendedor; default `"Não informado"` |
| `DATA CONTRATAÇÃO` | `CONTRAÇÃO DE DADOS` *(typo tolerado)* | período de negócio |
| `PARCELAS` | — | **installment_count** |
| `VALOR REPASSE` | — | valor por parcela |
| `TICKET` | `INGRESSO`; fallback `VALOR REPASSE × PARCELAS` | **ticket do contrato** |
| `STATUS` | — | ciclo de vida |

### 3.1 Vocabulário de status — governado e explícito

Do próprio prompt do workflow, declarado como regra de negócio:

| status | significado | entra nos indicadores? |
| --- | --- | --- |
| `A` | Assinado | **sim** |
| `E` | Emitido | **sim** |
| `P` | Pendente | **sim** |
| `C` | Cancelado | **não** — exceto no churn |

## 4. KPIs oficiais — com fórmula exposta

Isto é o que o princípio source-first procura: a fonte **já publica** os
indicadores, e as fórmulas estão escritas.

| KPI | fórmula oficial | dimensões | período | CI pode consumir? |
| --- | --- | --- | --- | --- |
| **Vendas** | contagem de contratos com status ≠ C | unidade, vendedor | mês, acumulado até o dia | **sim** |
| **Ticket** | `VALOR REPASSE × PARCELAS` por contrato | contrato | — | **sim** |
| **Ticket médio** | empréstimo liberado ÷ vendas | unidade, vendedor | mês | **sim** |
| **Empréstimo liberado** | soma dos tickets dos contratos válidos | unidade, vendedor | mês | **sim** |
| **% Churn** | contratos C ÷ total incluindo C | mês | **fechado por mês** | **sim** |
| Distribuição por parcelas | contagem por valor de `PARCELAS` | — | mês | sim |
| Média de parcelas | média de `PARCELAS` | unidade, vendedor | mês | sim |
| Pendentes / Emitidas | contagem por status P / E | vendedor | mês | sim |

Comparação mensal usa corte **no mesmo dia do mês** para ser justa — decisão de
apresentação já tomada.

### 4.1 O que é derivado no workflow, não na fonte

| item | classificação |
| --- | --- |
| `HISTORICO` de março a julho | **WORKFLOW_DERIVED** — pré-calculado e **hardcoded**, "atualizar manualmente quando um novo mês fechar" |
| `CHURN_FECHADO` por mês | **WORKFLOW_DERIVED** — hardcoded |
| heatmap, cores, HTML | VISUAL_ONLY |
| narrativa do Claude | VISUAL_ONLY — interpretação, com instrução explícita de "não recalcule nada" |

O histórico hardcoded é o análogo do que a 2.9 encontrou no Leonardo: número
oficial vivendo em código de workflow, não em fonte. Se o CI quiser série
histórica, ela não está na planilha — está congelada no JS.

### 4.2 Um defeito no filtro de período

```js
const linhasAteHoje = linhasValidas.filter(l => l.dataContratacao.getDate() <= diaCorte);
```

`getDate()` devolve **o dia do mês**, não a data. O filtro aceita contrato de
qualquer mês cujo dia seja ≤ hoje. É benigno enquanto a planilha de agosto contiver
só agosto — e silenciosamente errado se contiver qualquer linha de outro mês.

Registro como observação; corrigir é do dono do workflow, não meu.

## 5. Granularidade

**Uma linha = UM CONTRATO.** Não é inferência: o prompt do workflow declara
`"Vendas = contagem de contratos (cada linha é uma venda)"`.

Não é parcela, não é aluno, não é oportunidade. Um aluno pode aparecer em mais de
uma linha se tiver mais de um contrato — e `CPF` permite detectar isso.

## 6. Campos que o intelligence precisa

| campo | situação | evidência |
| --- | --- | --- |
| logical sale/contract id | **ABSENT** | não há coluna de ID. Identidade seria `CPF + DATA CONTRATAÇÃO + …` — composta e frágil |
| business period | **PRESENT** | `DATA CONTRATAÇÃO` |
| unit identity | **PRESENT, texto livre** | `Unidade` — precisa atravessar o D13 |
| amount / ticket | **PRESENT** | `TICKET`, com fórmula publicada |
| installment_count | **PRESENT** | `PARCELAS` |
| first_due_date | **ABSENT** | nenhuma coluna de vencimento |
| seller | **PRESENT** | `Vendedor` |
| loss reason | **ABSENT** | `STATUS = C` diz que cancelou, não por quê |
| status | **PRESENT** | vocabulário fechado A/E/P/C |

## 7. A definição oficial de venda — e o 8 vs 14

**`OFFICIAL SALE DEFINITION = CLOSED`.**

> Venda = contrato na aba `Status Contratos` com status ≠ `C`.

Isto resolve o GAP 1 da fase anterior, e **sem o CI ter decidido nada**: a
definição estava na fonte, exposta como regra de negócio no workflow que a
diretoria já usa.

Sobre o 8 vs 14 registrado em `ceo.business_rules.sale_policy` — *"Pipeline diz 8
vendas, financeiro diz 14"*: com a definição oficial em mãos, o mais provável é
**DIFFERENT SEMANTICS**, não conflito:

| número | provável significado |
| --- | --- |
| 8 | contratos no pipeline naquele momento — população comercial |
| 14 | títulos/CCBs no financeiro — população financeira, e um contrato de N parcelas gera N títulos |

Se for isso, **não é caso de Detector B**: são métricas diferentes com o mesmo
nome informal, e §19 é explícito que divergência de definição não é conflito.

Classifico como **provável**, não fechado, porque não inspecionei a planilha de
pipeline nem casei os dois conjuntos linha a linha. É o gap 1 abaixo.

## 8. Elegibilidade de lead

**Segue sem definição oficial.** A aba `Status Contratos` é de contratos, não de
leads — não tem denominador de conversão, não tem motivo de perda, não tem
`CREDIT_POLICY`.

`lead_eligibility` permanece `pending`, agora também `active: false`. Métricas de
conversão devem retornar `BUSINESS_RULE_PENDING`.

## 9. Ticket — GAP resolvido

**`ticket` É KPI oficial**, com fórmula publicada: `VALOR REPASSE × PARCELAS`.

E a fórmula é **idêntica** à coluna gerada de `ceo.sales`:

```sql
ticket_cents bigint generated always as (transfer_cents * installments_grau) stored
```

Isso é bom e ruim ao mesmo tempo. Bom: a semântica coincide, ninguém divergiu. Ruim
sob o princípio: a fonte publica a coluna `TICKET` **diretamente** quando ela
existe, e só cai no produto quando falta. O CI deve **consumir `TICKET`** e derivar
apenas no fallback — exatamente como o workflow faz. Recalcular sempre seria
duplicar KPI (regra 4).

## 10. Compatibilidade com os detectores

| detector | veredito | por quê |
| --- | --- | --- |
| **A** — concentração de parcelamento | **DIRECTLY_COMPATIBLE** | `PARCELAS` é o parcelamento contratado, `TICKET` é o valor, `Unidade` a dimensão. É exatamente o contrato do detector — e a fonte até publica "distribuição por parcelas" e "média de parcelas", o que confirma que a dimensão é de interesse do negócio |
| **B** — conflito entre fontes | **DERIVABLE** | precisa da segunda fonte comparável. O 8 vs 14 provavelmente não serve (§7); comparar `Status Contratos` contra o financeiro exigiria casar contrato→títulos primeiro |
| **C** — concentração de primeiro vencimento | **NOT_COMPATIBLE** | `first_due_date` não existe na fonte. Sem gap fechado, o detector não roda |
| **D** — caso único material | **DERIVABLE_WITHOUT_SEMANTIC_CHANGE** | soma de `TICKET` por período tem semântica parte-do-todo real; contrafactual "sem este contrato" é aritmético e legítimo |
| **LOW_TICKET** | **DIRECTLY_COMPATIBLE** | `TICKET` por contrato é exatamente o que a regra compara contra R$ 1.499,99 |

Nenhum detector foi alterado para encaixar a fonte.

## 11. `dataset_id`

Proponível agora, porque granularidade e semântica estão fechadas:

```
lucas_status_contratos_mensal
```

Reflete: dono da fonte, aba de origem, granularidade de contrato, periodicidade
mensal. Não usa "vendas" porque a aba contém também os cancelados, que não são
vendas.

Para `expected_units`, a chave futura seria `period` + `lucas_status_contratos_mensal`.
**Nenhuma membership criada.**

## 12. PII

| campo | classificação |
| --- | --- |
| `ALUNO` | **MUST_NOT_LEAVE_SOURCE_BOUNDARY** |
| `CPF` | **MUST_NOT_LEAVE_SOURCE_BOUNDARY** |
| `Vendedor` | REQUIRED — colaborador, não cliente |
| `Unidade`, `DATA CONTRATAÇÃO`, `PARCELAS`, `VALOR REPASSE`, `TICKET`, `STATUS` | REQUIRED |

`CPF` é o único candidato razoável a identidade lógica, e é justamente o que não
deve viajar. O caminho é `subject_ref` pseudonimizado — `ceo.students.cpf_hash`
(HMAC) já existe e é o ponto de partida.

## 13. Dinheiro

A fonte é planilha: `VALOR REPASSE` e `TICKET` chegam como número de célula, e o
workflow usa `Number()` — **float**.

Para o intelligence, conversão determinística obrigatória: `round(valor * 100)`
para centavos inteiros, feita na fronteira de ingestão, sem `parseFloat` no caminho
do domínio. Célula vazia é **ausência**, não zero — o workflow atual usa `|| 0`, o
que o CI não pode copiar.

## 14. `ceo` core — classificação

Revisão conceitual apenas. Nada populado, nada expandido.

| estrutura | classificação | justificativa |
| --- | --- | --- |
| `ceo.source_records`, `source_syncs`, `source_mappings` | **INTELLIGENCE-DOMAIN** | procedência, idempotência e auditoria são do CI, não do Lucas |
| `ceo.sales` | **SOURCE-PROJECTION CANDIDATE** | mapeia bem: `sold_on`←`DATA CONTRATAÇÃO`, `installments_grau`←`PARCELAS`, `transfer_cents`←`VALOR REPASSE`, `ticket_cents`←`TICKET`, `school_id`←`Unidade` via D13, `seller_id`←`Vendedor`. Ressalva: `ticket_cents` deve **consumir** e não recalcular |
| `ceo.students` | **SOURCE-PROJECTION CANDIDATE** | `ALUNO` + `CPF` existem; `cpf_hash` é o tratamento correto |
| `ceo.schools`, `sellers` + aliases | **SOURCE-PROJECTION CANDIDATE** | `Unidade` e `Vendedor` são texto livre, então precisam de alias governado |
| `ceo.opportunities` | **UNJUSTIFIED pela fonte atual** | `Status Contratos` não tem oportunidade — tem contrato. `opened_on`, `installments_open/due` e `discount_bps` não têm origem |
| `ceo.loss_reasons` | **UNJUSTIFIED pela fonte atual** | `STATUS = C` não traz motivo |
| `ceo.lead_events` | **UNJUSTIFIED pela fonte atual** | sem eventos de lead na aba |
| `ceo.data_conflicts` | **INTELLIGENCE-DOMAIN** | detectar conflito é papel do CI |
| `ceo.notifications`, `app_users` | **INTELLIGENCE-DOMAIN** | |

**`CEO CORE = REVISE`.** Três estruturas não têm origem na fonte oficial e foram
desenhadas a partir da spec, não do dado. Não precisam ser removidas — precisam
ficar **explicitamente sem fonte** até que uma exista, como `contract_value_cents`
já está.

## 15. Gaps de fonte oficial

### GAP 1 — o 8 vs 14 é conflito ou definição?

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: o que exatamente cada número conta
Por que é necessária: define se é caso de Detector B ou apenas duas métricas
  homônimas. §19 é explícito: divergência de definição não é conflito
Impacta: Detector B, sale_policy, credibilidade de qualquer número de vendas
Existe na fonte oficial: PARCIALMENTE — `Status Contratos` define venda; falta
  saber o que o "pipeline" e o "financeiro" contavam
Recomendação: pedir ao Lucas as duas listas do mesmo período para casar linha a linha
Criar internamente: NÃO
```

### GAP 2 — identidade lógica do contrato

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: um ID estável por contrato
Por que é necessária: sem ele a identidade é composta (`CPF + DATA CONTRATAÇÃO`),
  quebra se a data for corrigida, e força PII na chave
Impacta: idempotência de ingestão, `row_key`, evidência, reingestão
Existe na fonte oficial: NÃO
Recomendação: solicitar coluna de ID de contrato/CCB na aba
Criar internamente: NÃO — um ID sintético nosso não sobrevive a reimportação
```

### GAP 3 — `first_due_date`

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: data do primeiro vencimento por contrato
Por que é necessária: é o campo de origem do Detector C, que está SHIP e sem fonte
Impacta: Detector C — hoje NOT_COMPATIBLE
Existe na fonte oficial: NÃO
Recomendação: solicitar inclusão. O dado existe no Omie; a pergunta é se entra na
  aba ou se o CI cruza contrato→título
Criar internamente: NÃO
```

### GAP 4 — motivo de cancelamento

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: por que o contrato foi cancelado (status C)
Por que é necessária: churn sem causa não gera recomendação; `ceo.loss_reasons`
  existe e não tem origem
Impacta: churn qualitativo, ceo.loss_reasons, recomendações
Existe na fonte oficial: NÃO — só o status C
Recomendação: solicitar coluna de motivo, com vocabulário fechado
Criar internamente: NÃO
```

### GAP 5 — elegibilidade de lead / denominador de conversão

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: população de leads e quais saem do denominador
Por que é necessária: sem denominador não existe taxa de conversão governada
Impacta: lead_eligibility, qualquer KPI de conversão
Existe na fonte oficial: NÃO — `Status Contratos` é de contratos
Recomendação: identificar se existe fonte de pipeline oficial; até então manter
  BUSINESS_RULE_PENDING
Criar internamente: NÃO
```

### GAP 6 — `expected_units` para este dataset

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: quais unidades eram esperadas em cada mês
Por que é necessária: denominador da cobertura. As unidades que aparecem na aba são
  as que VENDERAM, não as esperadas — usar isso seria `expected = observed`,
  proibido por teste desde a 2.8
Impacta: cobertura de A, C, D
Existe na fonte oficial: NÃO
Recomendação: aba adicional, ou declaração por período
Criar internamente: NÃO
```

### GAP 7 — série histórica

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: histórico de março a julho como DADO
Por que é necessária: hoje está hardcoded no JS do workflow e atualizado à mão.
  Qualquer comparação histórica do CI dependeria de copiar aquele bloco — segunda
  fonte da mesma verdade
Impacta: comparativo mensal, tendência, baseline
Existe na fonte oficial: NÃO — as planilhas mensais existem, o consolidado não
Recomendação: o CI pode ler as planilhas mensais anteriores (Junho, Julho existem
  no Drive) e produzir a série a partir delas. Isso é cruzamento, domínio do CI —
  não recálculo de KPI
Criar internamente: SIM, com ressalva — derivar da fonte oficial de cada mês, nunca
  copiar o bloco hardcoded
```

## 16. Riscos operacionais registrados

| risco | evidência |
| --- | --- |
| dois arquivos com o mesmo nome do mês | busca no Drive com `limit: 1` escolhe um em silêncio |
| filtro de período por dia do mês | `getDate() <= diaCorte` aceita outros meses |
| titularidade mudou | Junho/Julho de Nicole, Agosto de Lucas |
| lista de 31 unidades hardcoded | no workflow `Sync Base Geral`, competindo com o catálogo D13 de 49 |
| histórico e churn fechados hardcoded | atualização manual mensal |

## 17. `base_geral_creditum` — outra fonte, outro domínio

O workflow `Creditum - Sync Base Geral Creditum` lê `ConsolidadoUnidades.xlsx`
(Drive `1dgzziXqurp3ZhSd…`), 31 abas, uma por unidade, e faz upsert em
`public.base_geral_creditum` diariamente às 05:00.

Campos: `nome`, `unidade`, `data_recebimento`, `status`, `telefone`, `ddd`,
`match_key`. Granularidade: **uma linha por (aluno × telefone)** — o workflow
explode as colunas de telefone.

**Não é fonte de vendas.** É base de contato/lead. Sem dinheiro, sem parcelas, sem
contrato. Não alimenta A/C/D e não substitui `Status Contratos`.

## 18. Prontidão e próximos passos

`IMPLEMENTATION READINESS = PARTIAL`

O que já está fechado: fonte oficial, granularidade, definição de venda,
vocabulário de status, KPIs com fórmula, `PARCELAS`, `TICKET`, período, vendedor,
unidade (via D13), `dataset_id` proponível, e compatibilidade de A, D e low-ticket.

O que falta antes de qualquer adapter:

1. **ID lógico de contrato** (GAP 2) — sem ele a ingestão não é idempotente.
2. **Resolver o 8 vs 14** (GAP 1) — antes de publicar qualquer número de vendas.
3. **Mapear as unidades da aba contra o D13** — `Unidade` é texto livre e o
   catálogo tem 49 entradas com aliases governados; a aba pode usar formas novas.
4. Decidir se `first_due_date` entra na aba ou vem de cruzamento com o Omie.
5. Confirmar que a extensão é sempre Google Sheets nativo — o contrato de allowlist
   muda se aparecer XLSX.

Nada implementado. Nenhuma membership de `expected_units`. Nenhum schema alterado.

---

# 19. Fase 2.10c — fechamento contra o dado real

Auditei as planilhas de **agosto** (20 contratos) e **julho** (24 contratos). Nenhum
CPF e nenhum nome aparecem neste documento.

## Resultado

```
SOURCE CONTRACT        PARTIAL
CPF IDENTITY           SUFFICIENT com CPF + período — 1 nulo observado (§19.3)
FIRST_DUE_DATE         COLUNA CONFIRMADA, VALORES NÃO (§19.4) ← divergência a levar ao Lucas
CURRENT MONTH E        venda realizada — agosto: 8
CURRENT MONTH A        aguardando assinatura Creditum — agosto: 1 · alerta
CURRENT MONTH P        possível venda pendente — agosto: 11 · não conta
HISTORICAL REALIZED    E apenas — julho: 19
A ALERT                fato definido · severidade PENDING
DATASET_ID             lucas_status_contratos_mensal — CLOSED
IMPLEMENTATION READINESS  PARTIAL
```

## 19.1 As decisões do Lucas validadas contra o dado

Duas confirmações fortes, por reconciliação numérica:

**Definição de venda.** Julho tem exatamente **19 contratos com status E** e 5 com
`C`. O `HISTORICO` do workflow registra `Julho/31: vendas: 19`. A definição bate
com o número publicado.

**Churn.** 5 cancelados ÷ 24 total = **0,2083**. O `CHURN_FECHADO.Julho` do
workflow é **0.2083**. Bate exatamente.

**Ticket.** `TICKET = VALOR REPASSE × PARCELAS` confere em **100% das 44 linhas**
observadas. Consumir `TICKET` e usar o produto como reconciliação é o caminho
certo — e hoje os dois concordam.

## 19.2 A consequência mais importante das novas regras

Julho **não tem nenhum `A` nem `P`** — 19 `E` e 5 `C`. Agosto, mês vigente, tem:

| status | agosto | significado sob a nova regra |
| --- | --- | --- |
| `E` | **8** | venda realizada |
| `P` | **11** | possível venda — aluno não assinou |
| `A` | **1** | aguardando assinatura da Creditum — alerta |
| `C` | 0 | — |

O workflow atual calcula `vendas = contratos com status ≠ C`, o que para agosto dá
**20**. Sob a decisão de hoje, realizado é **8**.

Isso não é defeito do workflow: para meses fechados as duas contas coincidem,
porque `A` e `P` se resolvem antes do fechamento — julho prova. Mas **no mês
vigente elas divergem por um fator de 2,5×**, e a métrica publicada hoje mistura
realizado com pendente sem rótulo.

É exactamente o que a semântica canônica de período proíbe. Registro como a
consequência prática número um das decisões desta fase.

## 19.3 Identidade por CPF

| verificação | agosto | julho |
| --- | --- | --- |
| linhas | 20 | 24 |
| CPF preenchido | 19 | 24 |
| **CPF nulo** | **1** | 0 |
| CPF distintos | 19 | 24 |
| **duplicado no mesmo período** | **nenhum** | **nenhum** |
| formato | `NNN.NNN.NNN-NN` — pontuado | idem |

**Mesmo CPF em períodos diferentes: SIM, um caso.** Um CPF aparece em julho com
status `C` e em agosto com status `E`, mesma unidade, mesmas 18 parcelas, mesmo
ticket. É recontratação legítima após cancelamento — não duplicata.

Conclusão: **`CPF + período` é suficiente na amostra observada**. `CPF` sozinho não
é, porque o caso acima mapearia para dois contratos.

Ressalvas que impedem declarar `SUFFICIENT` sem qualificação:

1. **1 CPF nulo em 20** (5%) — sem CPF, aquela linha não tem identidade nenhuma;
2. amostra de 44 linhas em 2 meses — ausência de duplicata observada não é garantia
   estrutural; planilha não tem constraint;
3. o CPF vem **pontuado**, e a normalização para dígitos é obrigatória antes de
   qualquer comparação ou hash.

`native_contract_id` segue **DATA_NOT_AVAILABLE**. Não inventei discriminator.

## 19.4 Primeiro vencimento — a coluna confere, os valores não

Lucas indicou **Coluna A**. Confirmado: em **ambos** os meses a coluna A é `Venc`.
A posição é estável mesmo com o resto do schema mudando (§19.5).

Mas os **valores** não são datas em todos os contratos:

| valor | agosto | julho | o que é |
| --- | --- | --- | --- |
| `DD/MM` | 16 | 6 | data, **sem ano** |
| `PG` | 4 | 13 | pago — a data foi **substituída** |
| `-` | 0 | 5 | vazio; correlaciona 1:1 com status `C` |

Duas consequências:

**Sem ano.** `27/08` não é data completa. `parseCivilDateStrict`, o parser que o
Detector C usa, exige `dd/MM/yyyy` ou `yyyy-MM-dd` em correspondência total — e
**rejeita** `27/08`. Inferir o ano do mês da planilha funciona para o caso comum e
quebra na virada de ano: um contrato de dezembro com vencimento `05/01` é do ano
seguinte.

**A data é sobrescrita quando paga.** Em julho, **13 de 24 (54%)** já são `PG`, e a
data original **não é recuperável** dessa coluna. Ou seja: `Venc` é *situação do
primeiro vencimento*, não *data do primeiro vencimento*.

Isso divergindo do que o Lucas afirmou — "vale para TODOS os contratos" — é o
achado que precisa voltar para ele. A coluna existe para todos; a **data** não
sobrevive em todos.

Não tratei os `PG` e `-` como data-quality issue de linha, porque não são: são
outra semântica na mesma coluna. E não procurei substituto: `Desembolso`,
`Repasse` e `Inicio Grau` são outras datas, e escolher uma delas como primeiro
vencimento seria invenção.

## 19.5 O schema muda entre meses

| | agosto | julho |
| --- | --- | --- |
| col A | `Venc` | `Venc` |
| ordem das demais | **diferente** | **diferente** |
| só em agosto | `Parcela Cheia`, `%`, `Curso`, `Repasse` | — |
| só em julho | — | `Sistema` (=`Bitrix`), `Data Repasse`, `Valor` |

O relatório oficial sobrevive porque procura coluna **por nome normalizado com
fallbacks**, nunca por posição. Qualquer adapter do CI precisa fazer o mesmo:
posição fixa quebra no mês seguinte.

Campos novos que a fase anterior não conhecia, com valor para o CI:

| campo | conteúdo | relevância |
| --- | --- | --- |
| `%` | 25%, 30%, 20%, 15% | **é a origem de `discount_bps`**, que estava sem fonte |
| `Canal` | Indicação, Qualificação, **Inboud** *(typo)*, Follow Up, `indicação` *(minúscula)* | dimensão de origem do lead — precisa vocabulário governado |
| `Sistema` | `Bitrix` | **a origem do pipeline** — pista para o 8 vs 14 |
| `Curso` | Enfermagem, Eletrotécnica, Pacote Office… | dimensão de produto |
| `Inicio Grau`, `Repasse`, `Desembolso` | datas `DD/MM` | ciclo operacional |

`Vendedor` divide-se entre meses: julho traz `Carlos Brito` e `Lucas Costa`; agosto
traz `Carlos`, `Lucas Z` e `Lavinia`. `Carlos Brito` e `Carlos` são provavelmente a
mesma pessoa em formas diferentes — é justamente o que `ceo.seller_aliases`
(hoje vazia) existe para resolver, e é gap para o Lucas, não decisão minha.

## 19.6 Unidade — 5 de 25 não resolvem no D13

Testei as 25 unidades observadas contra o catálogo governado, aplicando a
normalização real (NFD, sem acento, prefixo `grau`) mais os aliases e overrides:

| planilha | catálogo | lacuna |
| --- | --- | --- |
| `Meriti` | `sao_joao_de_meriti` "São João de Meriti", alias `S.J de Meriti` | forma curta não governada — **e é a unidade mais frequente de agosto** |
| `Duque Caxias` | `duque_de_caxias` "Duque de Caxias" | falta o "de"; normalização não insere palavra |
| `Fortaleza` | `fortaleza_centro` "Fortaleza - Centro", alias `Centro FZA` | forma curta não governada |
| `Jardim Ângela` | `jd_angela` "Jd Angela", **aliases vazios** | `jardim angela` ≠ `jd angela` por normalização |
| `Zona Norte` | `zona_norte_rn` "Zona Norte - RN", alias `Natal Zona Norte` | **AMBÍGUO** — "Zona Norte" sem qualificador |

**20% de falha.** Sem resolver, um em cada cinco contratos entra como `unknown` e
não agrega por unidade.

Dois achados de segunda ordem:

**A decisão da 2.6c não foi materializada.** A doc da Fase 2.6c registra que
`Jd Angela` / `Jardim Angela` / `Jardim Ângela` são a mesma unidade lógica. No
artefato, `jd_angela` tem `aliases: []` e o override governado não a inclui. A
decisão foi aprovada e não chegou ao dado.

**Duas unidades `inactive` no catálogo têm contrato.** `duque_de_caxias` e
`jd_angela` estão marcadas `inactive`, e vendem: julho tem 1 contrato de cada, R$
5.538 e R$ 9.405. Ou o status está desatualizado, ou são unidades distintas com
nome parecido. Isso é conflito entre fontes governadas — o CI deve **reportar**,
não resolver.

E confirmando a orientação desta fase: unidade que não aparece no mês
simplesmente não vendeu. Não inferi inatividade de ausência.

## 19.7 Retratação — o filtro `getDate()`

Na passada anterior classifiquei `l.dataContratacao.getDate() <= diaCorte` como
defeito. **Estava errado, e a orientação desta fase está certa.**

O workflow lê **um arquivo por mês**, então a população já está restrita ao mês
antes da comparação. Verifiquei no dado: agosto contém só datas de agosto, julho só
de julho. Dentro desse contexto, comparar dia-do-mês é precisamente a intenção
oficial — comparar o mês vigente até o dia N com meses anteriores até o dia N.

Registro como **intenção oficial**, não defeito.

## 19.8 O alerta de status `A`

Fato determinístico, sem severidade:

```
fato:        contrato aguardando assinatura da Creditum
evidência:   STATUS = 'A' na aba Status Contratos
significado: aluno e garantidor assinaram; falta a Creditum
população:   mês vigente
agosto:      1 contrato, ticket R$ 7.169,92, unidade Alecrim
```

É acionável por natureza — o gargalo está **dentro** da Creditum. Mas
`creditum-policy.v1.json` não cobre este tipo de evento, e a Fase 2.7 fechou que
severidade sem lastro governado não sai.

`A ALERT = contrato definido · policy PENDING.`

Nenhum Event executivo, nenhuma severidade atribuída. O fato sobrevive e fica
disponível; o alerta executivo espera decisão de política — mesmo padrão do
low-ticket antes de a severidade `medium` ser aprovada.

## 19.9 Compatibilidade final

| detector | veredito | base |
| --- | --- | --- |
| **A** — concentração de parcelamento | **DIRECTLY_COMPATIBLE** | `PARCELAS` inteiro em 100% das linhas, `TICKET` presente, unidade resolvível após os 5 aliases |
| **B** — conflito entre fontes | **DEPENDE DE SEGUNDA FONTE** | `Sistema = Bitrix` em julho é a pista: a fonte de pipeline existe. Não a inspecionei |
| **C** — concentração de primeiro vencimento | **NOT_COMPATIBLE hoje** | a coluna existe; a data não sobrevive ao pagamento (54% de `PG` em julho) e não tem ano. Vira `DERIVABLE` se a fonte passar a preservar a data completa |
| **D** — caso único material | **DERIVABLE_WITHOUT_SEMANTIC_CHANGE** | soma de `TICKET` por período é parte-do-todo real |
| **LOW_TICKET** | **DIRECTLY_COMPATIBLE** | `TICKET` por contrato. Observado: menor ticket de agosto R$ 1.660,00 — acima do piso de R$ 1.499,99, então nenhum disparo no mês |

Divergi da expectativa em **um** ponto: C não é `DIRECTLY_COMPATIBLE`, e a razão é
o dado, não o detector. Nenhum detector foi alterado.

## 19.10 Gaps atualizados

Resolvidos nesta passada: **GAP 2** (identidade — CPF + período serve, com
ressalvas), **GAP 5** parcialmente (`Sistema = Bitrix` aponta a fonte de pipeline).

Abertos, em ordem de bloqueio:

### GAP 8 — os 5 aliases de unidade

```
GAP DE FONTE OFICIAL
Responsável: Lucas (grafia) + Stefano (decisão D13)
Informação ausente: aliases governados para Meriti, Duque Caxias, Fortaleza,
  Jardim Ângela e o desambiguador de Zona Norte
Por que é necessária: 20% dos contratos não resolvem unidade
Impacta: A, C, D, cobertura, qualquer visão por unidade
Existe na fonte oficial: a grafia existe; o alias governado NÃO
Recomendação: aprovar os 4 aliases diretos; para `Zona Norte`, perguntar ao Lucas
  se é a de Natal (`zona_norte_rn`) ou outra
Criar internamente: NÃO — alias é decisão D13, e a 2.6c já provou o custo de
  inventar
```

### GAP 9 — `Venc` perde a data quando paga

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: data do primeiro vencimento que sobreviva ao pagamento, com ano
Por que é necessária: é a origem do Detector C, que está SHIP e sem fonte utilizável
Impacta: Detector C
Existe na fonte oficial: PARCIALMENTE — coluna A existe; 54% dos contratos de julho
  já a substituíram por `PG`, e nenhuma linha traz o ano
Recomendação: coluna separada de data, preservada; ou confirmar que o CI deve
  cruzar contrato→título no Omie para obter o vencimento
Criar internamente: NÃO
```

### GAP 10 — `inactive` no catálogo com contrato

```
GAP DE FONTE OFICIAL
Responsável: Stefano (D13)
Informação ausente: `duque_de_caxias` e `jd_angela` estão inactive e têm contrato
  em julho — o status está errado ou são unidades distintas?
Por que é necessária: status de catálogo é dimensão governada e está contradito
  pelo dado
Impacta: D13, cobertura, expected_units
Existe na fonte oficial: o contrato existe; a reconciliação não
Recomendação: reconciliar antes de qualquer ingestão
Criar internamente: NÃO
```

### GAP 11 — vocabulário de `Canal` e aliases de `Vendedor`

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: vocabulário fechado de Canal (hoje `Inboud`, `indicação`
  minúsculo) e formas canônicas de Vendedor (`Carlos Brito` vs `Carlos`)
Por que é necessária: sem isso o CI agrega a mesma pessoa e o mesmo canal em
  buckets diferentes
Impacta: dimensões de vendedor e canal
Existe na fonte oficial: os valores existem; o vocabulário governado NÃO
Recomendação: allowlist de Canal; alias de Vendedor em ceo.seller_aliases
Criar internamente: NÃO
```

### GAP 12 — CPF nulo

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: o CPF de 1 contrato de agosto
Por que é necessária: CPF é a identidade operacional aprovada; sem ele a linha não
  tem identidade
Impacta: idempotência da ingestão
Existe na fonte oficial: a coluna existe, a célula está vazia
Recomendação: preencher; e tratar CPF vazio como erro de linha, não como opcional
Criar internamente: NÃO
```

## 19.11 Estado

`SOURCE CONTRACT = PARTIAL`

Fechado: fonte oficial, granularidade, definição de venda validada por
reconciliação, semântica de período por status, vocabulário A/E/P/C, KPIs com
fórmula, `PARCELAS`, `TICKET` reconciliado em 100%, `%` como origem de desconto,
`dataset_id`, identidade por CPF + período, e compatibilidade de A, D e low-ticket.

Bloqueando implementação: os 5 aliases de unidade (GAP 8) e a data de vencimento
(GAP 9). O primeiro é resolvível numa conversa; o segundo pode exigir mudança na
planilha ou cruzamento com o Omie.

Nada implementado, nada ingerido, nenhuma membership de `expected_units`.

---

# 20. Fase 2.10d — fechamento dos blockers

## 20.0 Retratação — `Jardim Ângela` JÁ ESTÁ GOVERNADO

Na §19.6 afirmei que a decisão da Fase 2.6c sobre `Jardim Ângela` não tinha sido
materializada, porque `jd_angela` tem `aliases: []` no artefato. **Estava errado.**

Auditei o runtime de produção em vez de reimplementar a normalização, e o
resultado é inequívoco:

```
raw "Jardim Ângela"  →  key "jardim angela"
unit "Jd Angela"     →  key "jardim angela"
similarity 10000 bp  →  status "matched", unit_id "jd_angela"
```

A cadeia governada é `canonicalSchoolKey`, que expande abreviações regulares do
português — `jd → jardim`, junto com `sta`, `sto`, `zn`, `pres`, `gov`, `vl`, `pq`.
As três formas casam por **regra derivável**, que é exatamente o que a doc da 2.6b
registrou na linha "a regra `jd → jardim` faz as três formas casarem". O alias
explícito é desnecessário — e adicioná-lo criaria a segunda regra que o §1 desta
fase proíbe.

O erro foi meu método: escrevi um normalizador python próprio para a auditoria, sem
a tabela de abreviações. Reproduzir a regra em vez de chamá-la é o erro que o
próprio `unit-normalizer.ts` documenta que existe para evitar. A partir daqui a
auditoria de D13 usa `canonicalizeUnit` de produção.

**São 4 nomes não resolvidos, não 5.**

## 20.1 D13 — as 5 identidades reconciliadas

Medido com `canonicalizeUnit` + `GOVERNED_UNIT_CATALOG` + `ENGINE_UNIT_NORMALIZER`,
limiar governado 8000 bp:

| planilha | chave | alvo | sim. | status runtime | classificação |
| --- | --- | --- | --- | --- | --- |
| `Jardim Ângela` | `jardim angela` | `jd_angela` | **10000** | **matched** | **ALREADY_GOVERNED** |
| `Meriti` | `meriti` | `sao_joao_de_meriti` | 3333 | unknown | **MISSING_GOVERNED_ALIAS** |
| `Fortaleza` | `fortaleza` | `fortaleza_centro` | 5000 | unknown | **MISSING_GOVERNED_ALIAS** |
| `Duque Caxias` | `duque caxias` | `duque_de_caxias` | **8000** | unknown | **MISSING_GOVERNED_ALIAS** |
| `Zona Norte` | `zona norte` | `zona_norte_rn`? | 6667 | unknown | **AMBIGUOUS** |

`D13 ARTIFACT CONSISTENCY = OK.` As duas fontes governadas estão registradas no
artefato (`workbook` + `alias_overrides`, com sha256 de cada), os 8 aliases
efetivos são exatamente 5 da planilha + 3 humanos, e o teste que afirma essa
projeção está verde. Nenhuma correção de cadeia é necessária.

### O caso `Duque Caxias` — 8000 bp exatos e por que ainda dá `unknown`

`duque caxias` × `duque de caxias` dá **exatamente 8000 bp**, no limiar. Mesmo
assim o runtime devolve `unknown`, e a razão é estrutural: `canonicalizeUnit`
compara similaridade **somente contra `activeKeys`**, e `duque_de_caxias` está
`inactive`. Nenhum candidato entra, então não há nem `ambiguous`.

Isso importa para o futuro: no dia em que a unidade for marcada `active`, este
nome passa de `unknown` para **`ambiguous`** — nunca para `matched`, porque
similaridade não auto-aplica por projeto. Os dois estados falham fechado, então
não há risco de fusão errada em nenhum cenário. Mas nenhum dos dois agrega o
contrato à unidade. O alias explícito é o que torna determinístico.

### Os 3 aliases propostos — aguardando assinatura

Os três são **contrações de nome composto**, não abreviação regular: a normalização
não insere palavra (`de`, `Centro`) nem expande `Meriti` para o nome completo. Caem
na mesma categoria que `Rio Preto → São José do Rio Preto`, que o arquivo de
overrides descreve como "Decisao D13 anterior, confirmada pelo CEO".

Por isso **não apliquei**. Proposta pronta, no formato do artefato governado:

```json
{ "alias": "Meriti", "target_unit_id": "sao_joao_de_meriti",
  "rationale": "Forma curta usada nas planilhas de venda do Lucas. Contracao de nome composto: a normalizacao nao expande 'meriti' para 'sao joao de meriti' (3333 bp). Unidade mais frequente de agosto.",
  "approved_in": "FASE_2_10D" }

{ "alias": "Fortaleza", "target_unit_id": "fortaleza_centro",
  "rationale": "Forma curta. O canonico traz o qualificador '- Centro', que a normalizacao nao remove (5000 bp). Nao ha segunda unidade de Fortaleza no catalogo, entao nao ha ambiguidade.",
  "approved_in": "FASE_2_10D" }

{ "alias": "Duque Caxias", "target_unit_id": "duque_de_caxias",
  "rationale": "Falta a preposicao 'de'. A normalizacao colapsa espaco mas nao insere palavra. Similaridade 8000 bp no limiar exato, e a unidade esta inactive, entao nao entra em activeKeys e o resultado e unknown.",
  "approved_in": "FASE_2_10D" }
```

Precisam da sua assinatura antes de entrar no artefato. Alias é decisão D13, e a
2.6c já mostrou o custo de inventar identidade.

## 20.2 `Zona Norte` — AMBIGUOUS, e o engine já falha fechado

Não resolvi, e verifiquei que o engine também não resolve sozinho: 6667 bp está
abaixo do limiar de 8000, então o resultado é `unknown` com fingerprint estável —
nunca `matched` para `zona_norte_rn`.

O motivo de não decidir por texto é geográfico, não estatístico. O catálogo tem
`Zona Norte - RN` (Natal), com alias `Natal Zona Norte`. A planilha do Lucas é
majoritariamente São Paulo e Rio, e "Zona Norte" sem qualificador é um nome de
região usado nas duas cidades. Escolher por proximidade textual entregaria os
contratos de uma unidade para outra sem nada parecer errado.

`ZONA NORTE = AMBIGUOUS`, source-quality gap, não gap de código. A pergunta para o
Lucas é de uma linha: **"Zona Norte" é a de Natal/RN, ou é outra unidade?**

Enquanto não houver resposta, o comportamento correto é o atual: `unknown`, o
contrato ingere, e a agregação por unidade registra o não-resolvido como qualidade
de ingestão — nunca como ausência de unidade.

## 20.3 `inactive` NÃO é conflito — correção arquitetural aceita

Retiro o GAP 10 da §19.10. Eu havia classificado "unidade `inactive` com contrato"
como conflito entre fontes governadas; a correção da §3 desta fase está certa e é
mais precisa: **`inactive` é dimensão de cadastro, não de atividade comercial.**

E o dado mostra que o escopo era maior do que eu reportei. As 5 inativas do
catálogo são `duque_de_caxias`, `guarulhos`, `jd_angela`, `sao_goncalo`,
`vila_maria` — e **quatro delas têm contrato em julho**: São Gonçalo, Guarulhos,
Duque Caxias, Jardim Ângela. Se `inactive` bloqueasse qualquer coisa, o efeito não
seria uma anomalia pontual: seria descartar quatro unidades de dezoito.

O runtime já se comporta corretamente, e isso é invariante da 2.6b, não novidade
desta fase: `buildUnitIndex` indexa **todas** as unidades em `byKey`,
independentemente de status, e só filtra por `active` em `activeKeys`, que serve
exclusivamente à busca por similaridade. Consequência: `Guarulhos`, `São Gonçalo` e
`Jardim Ângela` dão `matched` mesmo inativas — como deve ser.

Nenhuma linha é excluída por status de catálogo. D13 permanece autoridade de
**identidade** e nada mais.

## 20.4 `commercial_activity_status` — registrado, não implementado

Conceito separado de D13, puramente observacional:

```
commercial_activity_status
  ACTIVE                  vendendo
  ATTENTION               luz amarela
  COMMERCIALLY_INACTIVE   sem venda sustentada
```

Regra **candidata**, ainda NÃO governada:

| condição | estado |
| --- | --- |
| ~2 meses consecutivos sem `E` | `ATTENTION` |
| ~3 meses consecutivos sem `E` | `COMMERCIALLY_INACTIVE` |

Não implementei os thresholds. O "~" no seu enunciado é a razão explícita: a Fase
2.7 fechou que valor governado vem do artefato e é exato, e um limiar aproximado não
tem forma de entrar em `creditum-policy.v1.json`. Precisa de número assinado.

Três invariantes que registro junto, porque são o que impede este conceito de
virar bloqueio disfarçado:

1. nunca bloqueia ingestão, contrato, detector, denominador ou venda;
2. nunca invalida a unidade — a identidade D13 sobrevive intacta;
3. unidade que volta a ter `E` é **retomada comercial**, não conflito cadastral.

Com 2 meses de dado observado não há série suficiente para avaliar a regra nem para
propor o número. Precisa de histórico.

## 20.5 `FIRST_DUE_DATE` — fechado como indisponível

```
FIRST_DUE_DATE = DATA_NOT_AVAILABLE_FOR_HISTORICAL_ANALYSIS
DETECTOR C     = NOT_COMPATIBLE
```

Evidência, já medida na §19.4: coluna A é `Venc` nos dois meses; os valores são
`DD/MM` **sem ano**, `PG` e `-`; em julho **13 de 24 (54%)** já são `PG` e a data
original não é recuperável da fonte.

A coluna carrega informação **ligada** ao primeiro vencimento, mas não a preserva
historicamente. Não derivei de `Desembolso`, `Repasse` nem `Inicio Grau`, e não
consultei o Omie como fallback — as duas coisas produziriam uma data que a fonte
oficial não afirma, que é precisamente o gap que o Detector C existe para medir.

O Detector C continua SHIP e intocado. O que falta é fonte, não código.

## 20.6 GAP source-first para o Lucas — `FIRST_DUE_DATE_ORIGINAL`

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: coluna imutável com a data original do primeiro vencimento

Recomendação:
  nome        FIRST_DUE_DATE_ORIGINAL
  semântica   data original do primeiro vencimento do contrato
  formato     YYYY-MM-DD (ano explícito, obrigatório)
  invariante  NUNCA sobrescrita por `PG`, por status, nem por texto livre

Por que separada: `Venc` hoje acumula data e situação na mesma célula. Enquanto
  acumular, o pagamento apaga a data — e nenhum parser conserta apagamento.
  O ano explícito também resolve a virada de ano, onde um contrato de dezembro
  com vencimento `05/01` pertence ao ano seguinte e a inferência erra.

Impacta: Detector C e qualquer análise de concentração de vencimento.
NÃO impacta: ingestão, Detector A, Detector D, low-ticket, KPIs oficiais.
```

Confirmando explicitamente: **a ausência de `first_due_date` não bloqueia a
ingestão.** Ela bloqueia o Detector C e nada mais.

## 20.7 `CPF + período` — SUFFICIENT

```
CPF + PERIOD  = SUFFICIENT
CPF EMPTY     = 1 linha em agosto (5%) → IDENTITY_MISSING
```

| verificação | resultado |
| --- | --- |
| duplicado dentro do mesmo período | **nenhum** — 19 distintos em agosto, 24 em julho |
| mesmo CPF entre períodos | **1 caso** — julho `C`, agosto `E`, mesma unidade, mesmo ticket |
| CPF vazio | 1 em agosto |
| formato | `NNN.NNN.NNN-NN` pontuado — normalizar para dígitos antes de comparar |

O caso entre meses é recontratação legítima após cancelamento. É também a prova de
que **CPF sozinho não é identidade de contrato**: sem o período, aquele CPF mapeia
para dois contratos distintos.

CPF vazio permanece `IDENTITY_MISSING`, explicitamente representável. Sem fallback
por nome — o risco de erro de digitação que você levantou é real e a planilha já o
exibe em outra dimensão (`Inboud`, `indicação`, `Carlos` vs `Carlos Brito`).
Nenhum `contract_id` inventado.

## 20.8 Vocabulário observado — `Canal` e `Vendedor`

`OBSERVED VOCABULARY`, não enum governado.

**Canal**

| valor | observação |
| --- | --- |
| `Indicação` | |
| `indicação` | **variação de caixa** do anterior |
| `Qualificação` | |
| `Inboud` | **erro de digitação** de "Inbound" |
| `Follow Up` | |

**Vendedor**

| julho | agosto | observação |
| --- | --- | --- |
| `Carlos Brito` | `Carlos` | provavelmente a mesma pessoa |
| `Lucas Costa` | `Lucas Z` | **sobrenomes diferentes** — provavelmente pessoas diferentes |
| — | `Lavinia` | só em agosto |

Não resolvi nenhum dos dois. `Carlos`/`Carlos Brito` é plausível mas não
verificável na fonte, e `Lucas Costa`/`Lucas Z` mostra por que o palpite é
perigoso: sobrenome diferente sugere duas pessoas, e fundir vendedores troca
ranking e comissão. `ceo.seller_aliases` existe para isso e está vazia.

**Não bloqueia o provider**, com uma condição: o valor bruto precisa ser preservado
de forma auditável, para que a canonicalização futura seja recalculável sem
reingestão.

## 20.9 Compatibilidade final

| detector | veredito | base medida |
| --- | --- | --- |
| **A** | **DIRECTLY_COMPATIBLE** | contrato = linha; `PARCELAS` inteiro em 100% das 44 linhas; `TICKET` presente em 100%; unidade resolvível para todos os nomes não ambíguos após os 3 aliases |
| **LOW_TICKET** | **DIRECTLY_COMPATIBLE** | `TICKET` por contrato. Menor de agosto R$ 1.660,00, acima do piso de R$ 1.499,99 — nenhum disparo no mês |
| **D** | **DERIVABLE** | soma de `TICKET` por período é parte-do-todo real, sem mudança semântica |
| **C** | **NOT_COMPATIBLE** | §20.5 |
| **B** | **AGUARDA SEGUNDA FONTE** | `Sistema = Bitrix` em julho indica que a fonte de pipeline existe; não a inspecionei |

Sobre o Detector B: **não usei 8 vs 14 como conflito de fontes.** Aquele par não é
claim semanticamente comparável — são populações diferentes (realizado vs
pipeline), e tratar diferença de definição como conflito de dado produziria alerta
sobre um desacordo que não existe. B só entra quando houver duas fontes afirmando
a mesma grandeza.

## 20.10 `DATASET_ID`

```
DATASET_ID = lucas_status_contratos_mensal   (CLOSED)
```

| componente | justificativa |
| --- | --- |
| `lucas` | owner da fonte oficial — `lucas.costa@creditum.com.br` é dono do arquivo de agosto |
| `status_contratos` | a aba governada, não a planilha inteira |
| `mensal` | competência mensal: um arquivo por mês, `Novos Alunos - {Mês}` |
| granularidade | 1 linha = 1 contrato, já fechada |

Julho é propriedade de `nicole@creditum.com.br`, e isso **não** muda o
`dataset_id`: o dataset é definido pela fonte oficial e pela aba, não pela conta que
detém o arquivo naquele mês. Registro como observação de procedência — vale a pena
o Lucas consolidar a propriedade, mas não é gap bloqueante.

## 20.11 Implementation gate

Contra os 7 critérios da §11:

| critério | estado |
| --- | --- |
| unit identity governada para todos os nomes não ambíguos | ⚠ **3 aliases aguardando assinatura** |
| ambiguidade de `Zona Norte` representável / fail-closed | ✅ `unknown` com fingerprint estável, medido |
| CPF vazio explicitamente representável | ✅ `IDENTITY_MISSING` |
| schema lido por header | ✅ contrato registrado — schema varia entre meses, posição proibida |
| `dataset_id` fechado | ✅ `lucas_status_contratos_mensal` |
| provenance preservável | ✅ arquivo, aba, owner, período, hash de conteúdo |
| ausência de `first_due_date` não vira data inventada | ✅ `DATA_NOT_AVAILABLE_FOR_HISTORICAL_ANALYSIS` |

`IMPLEMENTATION READINESS = PARTIAL` — e falta uma coisa só: sua assinatura nos 3
aliases. Não é trabalho de engenharia; é decisão D13.

Aplicando o princípio da §11 — "não exigir perfeição de todos os detectores para
ingerir fatos válidos" — o Detector C indisponível **não** rebaixa o gate. A/D e
low-ticket operam sobre a fonte como ela está.

## 20.12 Source-first

Nenhum relatório novo do Lucas foi criado, e nenhum KPI paralelo. O que esta fase
produziu: leitura da fonte oficial, reconciliação dos números publicados (vendas
19, churn 0,2083, ticket 100%), classificação de compatibilidade, e gaps
registrados de volta para o dono da fonte.

O único ponto onde o CI diverge do relatório atual é o mês vigente, e não por
cálculo próprio: é a semântica de status que você governou nesta fase aplicada à
população — realizado `E` = 8, separado de `P` = 11 e `A` = 1, em vez de um único
número de 20 que mistura os três. Preservar o KPI oficial e rotular a população não
são coisas em conflito.

## 20.13 Resultado

```
D13
  Meriti          →  ALREADY? NÃO. MISSING_GOVERNED_ALIAS  → sao_joao_de_meriti (proposto)
  Duque Caxias    →  MISSING_GOVERNED_ALIAS               → duque_de_caxias (proposto)
  Fortaleza       →  MISSING_GOVERNED_ALIAS               → fortaleza_centro (proposto)
  Jardim Ângela   →  ALREADY_GOVERNED                     → jd_angela (matched, 10000 bp)
  Zona Norte      →  AMBIGUOUS                            → sem alvo; fail-closed

D13 ARTIFACT CONSISTENCY    OK
UNIT BLOCKERS               3 aliases aguardando assinatura + 1 pergunta ao Lucas
COMMERCIAL INACTIVITY       NON_BLOCKING / OBSERVATIONAL
CPF+PERIOD                  SUFFICIENT
CPF EMPTY                   1 linha (agosto, 5%) → IDENTITY_MISSING
FIRST_DUE_DATE              DATA_NOT_AVAILABLE_FOR_HISTORICAL_ANALYSIS
DETECTOR A                  DIRECTLY_COMPATIBLE
DETECTOR C                  NOT_COMPATIBLE
DETECTOR D                  DERIVABLE
DETECTOR B                  AGUARDA SEGUNDA FONTE
LOW_TICKET                  DIRECTLY_COMPATIBLE
DATASET_ID                  lucas_status_contratos_mensal
SOURCE CONTRACT             PARTIAL
IMPLEMENTATION READINESS    PARTIAL
```

### Gaps restantes

**BLOCKING**

1. **3 aliases D13** — `Meriti`, `Fortaleza`, `Duque Caxias`. Proposta pronta na
   §20.1, formato do artefato, aguardando sua assinatura. Sem eles, contratos
   dessas unidades entram como `unknown` e não agregam — `Meriti` é a unidade mais
   frequente de agosto.

**NON_BLOCKING**

2. **`Zona Norte` ambíguo** — pergunta de uma linha para o Lucas. O engine já falha
   fechado; o contrato ingere, a unidade fica não resolvida.
3. **CPF vazio** — 1 linha de agosto. `IDENTITY_MISSING` é representável; a linha
   ingere sem identidade de pessoa.
4. **Vocabulário `Canal`** — `Inboud`, `indicação`. Preservar bruto e normalizar
   depois.
5. **Aliases de `Vendedor`** — `Carlos`/`Carlos Brito`; `Lucas Costa`/`Lucas Z`
   provavelmente distintos. `ceo.seller_aliases` vazia.
6. **Propriedade do arquivo varia** — julho Nicole, agosto Lucas. Procedência, não
   identidade de dataset.
7. **Thresholds de `commercial_activity_status`** — 2 e 3 meses precisam de número
   exato assinado, e de série histórica maior que 2 meses.

**DETECTOR-SPECIFIC**

8. **`FIRST_DUE_DATE_ORIGINAL`** (§20.6) — bloqueia exclusivamente o Detector C.
9. **Segunda fonte para o Detector B** — claim semanticamente comparável.
   `Sistema = Bitrix` é a pista de onde procurar.

Nada implementado, nada ingerido, nenhum alias aplicado, A/B/C/D intocados, sem
commit.

---

# 21. Fase 2.10e — decisões D13 RN aplicadas

```
LUCAS UNIT IDENTITY BLOCKER = CLOSED
```

## 21.1 Alecrim / Natal Centro — inspeção ANTES de alterar

Inspecionei o catálogo antes de tocar em nada. Existe **um** registro canônico:

```
unit_id         alecrim
canonical_name  Alecrim
status          active
aliases         []  (antes desta fase)
provenance      UNIDADES.xlsx, sha256 fd8c7e00…  ·  linha da planilha operacional
usos            observado em agosto/2026 na fonte do Lucas, grafado "Alecrim"
```

**Não existe** `natal_centro`, nem qualquer segundo `unit_id` para a mesma unidade
física. Nenhum registro do catálogo tem "Natal Centro" como nome canônico ou alias.

Portanto: **caso 3, não `DUPLICATE_CANONICAL_ENTITY`.** Preservei `alecrim` e
adicionei as demais formas como aliases governados. Nenhum `UnitId` novo foi criado,
e não houve escolha de qual id sobreviver — porque só havia um.

Os únicos outros registros que contêm "Centro" são `fortaleza_centro`,
`rio_centro` e `curitiba` (alias `Curitiba/Centro`), todos unidades distintas de
outros estados. `zona_norte_rn` já trazia o alias `Natal Zona Norte`, então o padrão
"Natal + bairro" já existia no catálogo.

### As quatro variantes, medidas

| variante | similaridade vs `alecrim` | precisava de alias? |
| --- | --- | --- |
| `Alecrim` | 10000 bp — casamento exato | **não** |
| `Alecrim RN` | 7000 bp | sim |
| `Alecrin RN` | **0 bp** | sim |
| `Natal Centro` | 0 bp | sim |

`Alecrin RN` dá **zero**, não um valor baixo: o veto estrutural de D12 dispara
porque a contagem de palavras difere e nenhuma palavra é comum — `alecrin` não é
`alecrim`. O par `alecrim`/`alecrin` sozinho valia 0,86, mas o sufixo de estado
quebra o casamento estrutural. Não corrigi a grafia em código: virou alias
governado, como pedido.

## 21.2 Os 7 aliases aprovados

`governance/d13.alias-overrides.json` passou de 3 para **10** entradas, cada uma com
`rationale` e `approved_in`:

| alias | → unit_id | por que a normalização não bastava |
| --- | --- | --- |
| `Duque Caxias` | `duque_de_caxias` | falta a preposição `de`; 8000 bp no limiar exato, e a unidade `inactive` não entra em `activeKeys` |
| `Meriti` | `sao_joao_de_meriti` | contração de nome composto; 3333 bp |
| `Fortaleza` | `fortaleza_centro` | o canônico traz o qualificador `- Centro`; 5000 bp |
| `Zona Norte` | `zona_norte_rn` | 6667 bp; ambiguidade **geográfica**, insolúvel por texto |
| `Natal Centro` | `alecrim` | forma comercial da mesma unidade física |
| `Alecrim RN` | `alecrim` | sufixo de estado muda a contagem de palavras |
| `Alecrin RN` | `alecrim` | grafia com `n` final + sufixo; veto estrutural |

Rebuild pelo build step real, `tools/xlsx_to_catalog.py`, com a planilha preservada
em `governance/source/UNIDADES.xlsx`:

```
unidades: 49 (ativas 44, inativas 5)   ← inalterado
aliases:  15                            ← 8 antes
grupos:   2                             ← inalterado
workbook        sha256 fd8c7e00…        ← inalterado, mesma fonte
alias_overrides sha256 ef2897a2…        ← novo, alias_count 10
```

O sha256 do workbook não mudou, o que prova que nenhuma unidade foi inventada nem
perdida: a mudança está inteira na segunda fonte governada, que é onde decisão
humana deve viver.

`Zona Norte` deixa de ser `AMBIGUOUS`. Não é mais gap.

## 21.3 VERIFY — runtime, não script paralelo

A verificação virou teste permanente,
`integration/tests/lucas-unit-identity.test.ts`, chamando `canonicalizeUnit` de
produção. Isso fecha o furo de método da §20.0: a auditoria de D13 não é mais um
script que reimplementa a normalização.

```
Duque Caxias   → matched  duque_de_caxias     "Duque de Caxias"
Meriti         → matched  sao_joao_de_meriti  "São João de Meriti"
Fortaleza      → matched  fortaleza_centro    "Fortaleza - Centro"
Zona Norte     → matched  zona_norte_rn       "Zona Norte - RN"
Jardim Ângela  → matched  jd_angela           "Jd Angela"

Alecrim        → matched  alecrim
Alecrim RN     → matched  alecrim
Alecrin RN     → matched  alecrim
Natal Centro   → matched  alecrim
```

**As 25 unidades observadas nas planilhas de julho e agosto resolvem — 25 de 25.**
Eram 21 de 25 antes desta rodada.

O teste também trava o que alias errado quebraria em silêncio, porque adicionar
`Natal Centro` a `alecrim` põe a chave no pool de similaridade das unidades ativas:

- `Natal Zona Norte` continua em `zona_norte_rn`, não migrou para `alecrim`;
- `Santos` ≠ `Santo Amaro`, `Carpina` ≠ `Limoeiro`, `Limeira` ≠ `Sumaré`,
  `Rio Centro` ≠ `Madureira` ≠ `Zona Norte - RN`, `Curitiba` intacta.

## 21.4 Um teste da 2.6b foi corrigido

`unit-catalog.test.ts` afirmava:

> `ACHADO: `Zona Norte` sozinho NÃO resolve`
> *"Registrado como pendência de qualidade… Se as planilhas de venda escreverem
> `Zona Norte`, precisa de alias governado."*

A pendência que ele registrava era exatamente esta, e as planilhas do Lucas
escrevem. O teste agora afirma `zona_norte_rn` e mantém as três asserções de
não-colapso. Não removi a asserção: inverti-a com a razão registrada.

Os dois locks de contagem em `catalog-import.test.ts` foram atualizados de 3→10
overrides e 8→15 aliases efetivos, e ganharam duas asserções novas: toda entrada
declara `approved_in` (`FASE_2_6B` ou `FASE_2_10E`) e um `rationale` substantivo, e
as três formas de Alecrim apontam para o mesmo `unit_id` sem criar segundo registro.

## 21.5 Estado

```
D13
  Duque Caxias   →  duque_de_caxias      ALREADY_GOVERNED (2.10e)
  Meriti         →  sao_joao_de_meriti   ALREADY_GOVERNED (2.10e)
  Fortaleza      →  fortaleza_centro     ALREADY_GOVERNED (2.10e)
  Zona Norte     →  zona_norte_rn        ALREADY_GOVERNED (2.10e)
  Jardim Ângela  →  jd_angela            ALREADY_GOVERNED (2.6b, por regra jd→jardim)
  Alecrim / Alecrim RN / Alecrin RN / Natal Centro  →  alecrim

ALECRIM/NATAL CENTRO        registro único preservado — NÃO era DUPLICATE
D13 ARTIFACT CONSISTENCY    OK
UNIT BLOCKERS               nenhum
LUCAS UNIT IDENTITY         CLOSED
IMPLEMENTATION READINESS    READY
```

`IMPLEMENTATION READINESS` sai de `PARTIAL` para **`READY`**: o único critério
vermelho do gate da §20.11 era identidade de unidade, e ele fechou. Os outros seis
já estavam verdes.

`SOURCE CONTRACT` permanece **`PARTIAL`**, e por um motivo só: `FIRST_DUE_DATE`
não existe na fonte de forma recuperável. Isso não rebaixa o gate — bloqueia
exclusivamente o Detector C, pelo princípio da §11.

Gaps restantes, nenhum bloqueante: `FIRST_DUE_DATE_ORIGINAL` (Detector C), segunda
fonte para o Detector B, CPF vazio de agosto, vocabulário de `Canal`, aliases de
`Vendedor`, propriedade do arquivo entre meses, thresholds de
`commercial_activity_status`.

Nada implementado, nada ingerido, A/B/C/D intocados, sem commit.
