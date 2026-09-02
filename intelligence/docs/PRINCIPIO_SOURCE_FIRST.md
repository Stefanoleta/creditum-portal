# Princípio arquitetural — SOURCE/DASHBOARD-FIRST

**Status: GOVERNADO.** Aprovado por Stefano em 18/08/2026. Vale para toda fase
futura que toque dados do Lucas, e a auditoria retroativa da §3 mostra que ele
tem consequência sobre o que já existe.

## 1. A regra

Antes de criar qualquer relatório, métrica, cálculo, agregação ou transformação
nova para o Lucas:

1. identificar se o Lucas já possui uma fonte oficial validada;
2. reutilizar essa fonte como autoridade sempre que possível;
3. não criar relatório paralelo no Centro de Inteligência;
4. não duplicar KPI já existente;
5. transformar dados somente no mínimo necessário para o contrato canônico;
6. se faltar métrica ou dimensão relevante: **reportar como GAP**, nunca inventar
   em silêncio.

## 2. A fronteira — o que o CI acrescenta, e o que ele não é

| O CI acrescenta | O CI **não** é |
| --- | --- |
| cruzamentos entre fontes | um segundo sistema comercial |
| evidências e procedência | um segundo sistema operacional |
| alertas | uma segunda fonte de KPI |
| materialidade | quem decide o que é uma venda |
| contexto | quem define churn |
| recomendações | quem publica o número oficial |

A distinção operacional: **o CI detecta e explica; a fonte oficial afirma.** Quando
o CI precisa afirmar algo que a fonte não afirma, isso é um gap — não uma
oportunidade de cálculo.

### Por que isto não é burocracia

O projeto já produziu a prova do custo de ignorar isso. O gate da Fase 2.9
encontrou o dashboard financeiro do Leonardo com a regra de inadimplência —
corte de 21 dias, offset de 22, cinco buckets de aging, exclusão de cliente
renegociado — vivendo em 57 KB de JavaScript de frontend, sem lastro em nenhum
objeto de banco.

Consequência medida: **consumir a mesma tabela não reproduz o número oficial.**
Se o CI tivesse recalculado inadimplência a partir do espelho, teríamos dois
números divergentes com a mesma etiqueta, e nenhum dos dois auditável contra o
outro. O princípio existe para não repetir isso com o Lucas.

## 3. Auditoria retroativa — o que já viola, e o que já respeita

Aplicado ao que existe hoje, sem mudar nada.

### 3.1 Já respeita o princípio

| item | por quê |
| --- | --- |
| `ceo.business_rules.churn` | `active: false`, `pending: true`, regra vazia. Nota: *"SEM REGRA. A definição oficial de churn da Creditum não foi fornecida. Métricas de churn devem retornar BUSINESS_RULE_PENDING até que exista."* — é exatamente a disciplina de gap |
| `ceo.sales.contract_value_cents`, `revenue_value_cents` | existem vazios com nota *"Campos previstos pela spec §19 que a fonte atual ainda não fornece. Existem vazios de propósito: BUSINESS_RULE_PENDING, não invenção."* |
| detectores A/B/C/D | produzem materialidade, conflito, concentração e contrafactual — cruzamento e alerta, não KPI comercial |
| `expected_units` | modelo governado, dados declarados `DATA_NOT_AVAILABLE` em vez de inferidos do catálogo ativo ou do observado |
| Política Creditum v1 | limiares de **detecção**, não de operação comercial |

O padrão `BUSINESS_RULE_PENDING` já é a materialização deste princípio. Ele
existia antes de o princípio ser nomeado.

### 3.2 Conflita com o princípio — precisa de decisão

| item | conflito |
| --- | --- |
| `ceo.business_rules.sale_policy` | `active: true` **e** `pending: true`. Regra aplicada: `{"requires": "any", "minConfidence": 0.5}`. Nota: *"a planilha atual não é a fonte oficial. Pipeline diz 8 vendas, financeiro diz 14."* |
| `ceo.business_rules.lead_eligibility` | `active: true` **e** `pending: true`. Regra: `{"excludeLossCategories": ["CREDIT_POLICY"]}`, marcada PROVISÓRIO |
| `ceo.sales.ticket_cents` | coluna gerada: `transfer_cents * installments_grau` (D5) |

**`sale_policy` é o caso mais grave.** Com `minConfidence: 0.5` e `requires:
"any"`, o CI está **decidindo o que conta como uma venda** quando pipeline diz 8 e
financeiro diz 14. Isso é decisão de sistema comercial, não cruzamento.

Sob este princípio, o papel correto do CI naquele caso é o Detector B: **reportar
o conflito 8 vs 14 como fato material com evidência das duas fontes**, e deixar a
resolução para a fonte oficial. Resolver com um limiar de confiança produz um
terceiro número que não é nem o do pipeline nem o do financeiro — e ninguém
consegue auditar de onde veio.

`ticket_cents` é caso mais leve e depende de uma resposta: se `ticket` já é KPI
publicado na fonte do Lucas, recalculá-lo é duplicação (regra 4). Se a fonte só
publica `transfer` e `installments`, derivar é transformação mínima para o
contrato canônico (regra 5). **Não sei qual dos dois, e é gap.**

## 4. Gaps de fonte oficial

Formato governado. Nenhum destes deve ser resolvido internamente.

### GAP 1 — definição oficial de venda

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: definição oficial de "venda" quando pipeline e financeiro divergem
Por que é necessária: hoje o CI aplica `minConfidence: 0.5` e escolhe. Com pipeline
  em 8 e financeiro em 14, essa escolha produz um número que não existe em
  nenhuma das duas fontes e que ninguém consegue auditar.
Existe na fonte oficial: NÃO
Recomendação: solicitar que a fonte do Lucas publique o número oficial de vendas
  do período. O CI passa a consumi-lo e a reportar a divergência como Detector B,
  em vez de resolvê-la.
Criar internamente: NÃO
```

### GAP 2 — definição oficial de churn

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: definição de churn (janela, critério de saída, base)
Por que é necessária: qualquer métrica de retenção depende dela
Existe na fonte oficial: NÃO
Recomendação: solicitar definição; manter `BUSINESS_RULE_PENDING` até existir
Criar internamente: NÃO
```

Já tratado corretamente: `active: false`, retorna `BUSINESS_RULE_PENDING`.

### GAP 3 — elegibilidade de lead

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: quais perdas saem do denominador de conversão
Por que é necessária: o CI hoje exclui `CREDIT_POLICY` provisoriamente, o que
  altera toda taxa de conversão calculada
Existe na fonte oficial: NÃO
Recomendação: solicitar a regra oficial; até então a taxa deveria ser
  `BUSINESS_RULE_PENDING` em vez de calculada com regra provisória ativa
Criar internamente: NÃO
```

### GAP 4 — `ticket` é KPI da fonte ou derivação?

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: se a fonte publica `ticket` como KPI validado
Por que é necessária: se publica, `ceo.sales.ticket_cents` é duplicação de KPI
  (regra 4). Se não publica, a derivação `transfer × installments` é transformação
  mínima legítima (regra 5). Os dois caminhos são válidos; o errado é escolher sem
  saber.
Existe na fonte oficial: DESCONHECIDO
Recomendação: perguntar antes de qualquer ingestão
Criar internamente: NÃO até a resposta
```

### GAP 5 — `contract_value` e `revenue_value`

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: valor de contrato e valor de receita por venda
Por que é necessária: previstos pela spec §19 e hoje vazios
Existe na fonte oficial: NÃO
Recomendação: solicitar inclusão
Criar internamente: NÃO
```

Já tratado corretamente: colunas existem vazias, sem invenção.

### GAP 6 — `expected_units`

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: quais unidades eram esperadas por período e dataset
Por que é necessária: é o DENOMINADOR da cobertura. Sem ele, cobertura falha
  fechada — e catálogo ativo não substitui (Fase 2.8)
Existe na fonte oficial: NÃO
Recomendação: solicitar declaração por período, ou aba na própria pasta mensal
Criar internamente: NÃO — proibido por teste desde a Fase 2.8
```

### GAP 7 — contrato da pasta mensal

```
GAP DE FONTE OFICIAL
Responsável: Lucas
Informação ausente: qual storage contém `vendas/YYYY-MM/` e quais extensões são
  permitidas
Por que é necessária: determina adaptador e credencial; sem allowlist fechada de
  extensão, "qualquer planilha" entra
Existe na fonte oficial: N/A — é contrato de entrega, não dado
Recomendação: fechar storage + allowlist antes do adaptador
Criar internamente: NÃO
```

## 5. Consequência para as próximas fases

Quando a fase do Lucas começar, a ordem passa a ser:

1. **descobrir a fonte oficial dele primeiro** — como foi feito com o dashboard do
   Leonardo na 2.9, e antes de qualquer schema;
2. mapear que KPIs ela **já publica**;
3. para cada indicador do CI, decidir explicitamente: consumir, derivar
   minimamente, ou reportar gap;
4. só então adaptador e ingestão.

O que **não** deve acontecer: projetar o schema primeiro e descobrir depois que
ele reconstrói o sistema comercial dele. O `ceo` core — `students`,
`opportunities`, `sales`, `loss_reasons`, `sellers` — foi desenhado antes desta
descoberta, está vazio, e é o lugar onde esse risco se materializaria. Vale
revisitá-lo contra a fonte real antes de ingerir a primeira linha.

## 6. Ressalva honesta

Este documento **não** fez discovery da fonte do Lucas — a fase anterior instruiu
`não tocar Lucas`, e eu não toquei. O que está aqui é o princípio registrado mais
a auditoria do que já existe no repositório e no banco.

Portanto os gaps 1–7 são derivados de evidência interna (notas nas próprias
`business_rules`, colunas vazias declaradas, blockers já documentados), não de
inspeção da planilha. Quando a fonte for inspecionada, a lista pode encurtar —
alguns desses dados podem já existir lá.
