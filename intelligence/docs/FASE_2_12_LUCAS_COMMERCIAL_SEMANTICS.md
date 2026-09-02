# Fase 2.12 — semântica comercial do Lucas + Detector D

```
CURRENT COMMERCIAL POTENTIAL      E + A + P
CURRENT COMMERCIALLY CONFIRMED    E + A
CURRENT EMITTED                   E
HISTORICAL REALIZED               E
FULLY COMPLETED                   DEFERRED — exige E + pagamento no Omie
A ALERT                           AWAITING_CREDITUM_SIGNATURE
P ALERT                           PENDING_STUDENT_SIGNATURE
DETECTOR D                        INTEGRATED
D POPULATION                      COMMERCIAL_POTENTIAL, mês corrente
DETECTOR B                        NOT INTEGRATED
DETECTOR C                        DEFERRED
TESTS                             2047 intelligence (+80) · 190 portal
```

## 1. Os quatro status, projetados

Cada contrato do mês corrente é projetado em **três eixos independentes**, não num
número:

| status | no funil | confirmado pelo cliente | emitido pela Creditum |
| --- | --- | --- | --- |
| `E` | sim | sim | **sim** |
| `A` | sim | **sim** | não |
| `P` | sim | não | não |
| `C` | não | não | não |

`A` é o único que separa os dois primeiros eixos do terceiro: aluno e garantidor
assinaram, e falta a Creditum emitir. É exatamente essa distinção que o alerta de `A`
carrega, e é por isso que ele não pode contar como emitido.

O `switch` que faz a projeção é exaustivo sobre `LucasStatus` — status novo no
vocabulário sem projeção não compila.

## 2. As três populações

```
COMMERCIAL_POTENTIAL     = E + A + P     quanto pode virar venda
COMMERCIALLY_CONFIRMED   = E + A         quanto o cliente já confirmou
EMITTED                  = E             quanto a Creditum já emitiu
```

### 2.1 Por que três, e não um número

A Fase 2.10 mediu agosto: 8 `E`, 1 `A`, 11 `P`. Qualquer resposta única para "quantas
vendas?" escolhe uma das três e esconde as outras duas — e as três são perguntas
comerciais legítimas e diferentes.

Projetar cada contrato nos três eixos torna a escolha do consumidor **explícita**. Um
campo chamado `sales` obrigaria a decidir no código, em silêncio. É a mesma razão pela
qual o payload do snapshot ficou sem `sales_count` na Fase 2.11: agregado sem
população declarada é o defeito.

### 2.2 Os nomes proibidos

Teste afirma que nenhuma chave de `PopulationCounts` se chama `sales`, `sales_count`,
`realized` ou `vendas`. Sobre a fixture governada (E=3, A=2, P=4, C=1):

```
COMMERCIAL_POTENTIAL   = 9    ← NÃO é "venda realizada"
COMMERCIALLY_CONFIRMED = 5    ← NÃO é "emitido"
EMITTED                = 3
```

O teste afirma as duas negativas diretamente, comparando 9 contra `realized` e 5
contra `EMITTED`.

### 2.3 O rótulo viaja no tipo

`readonly LucasContractRow[]` não diz qual população é. Uma lista de 9 contratos pode
ser `E+A+P` do mês corrente ou `E` de três meses, e quem a receber sem rótulo vai
chamá-la do que quiser.

```ts
export interface LabeledPopulation {
  readonly population: CommercialPopulation
  readonly stance: "current"        // fixo
  readonly rows: readonly LucasContractRow[]
  readonly count: number
}
```

Campo obrigatório: não existe como passar a população adiante sem dizer qual ela é.

## 3. Histórico — inalterado

```
historical realized sale = E
```

As três populações são semântica de **mês vigente**. Não existe função que as aplique
a `closed`, e é isso que impede a possibilidade retroativa: um `A` de mês fechado é
não-realizado, não "confirmado".

Teste reproduz julho real — 19 `E`, 5 `C`, zero `A`, zero `P` — e afirma que
`realized` continua 19 e que `awaiting_creditum` e `pending_unsigned` são zero em
mês fechado.

## 4. A dimensão que NÃO existe

```
FULLY_COMPLETED_SALE_STATUS = "DEFERRED_REQUIRES_OMIE_PAYMENT"
```

Venda 100% concluída exige `E` **mais** pagamento do aluno confirmado no Omie. O Omie
não é fonte observável nesta fase, então a dimensão é **declarada e não computada**.

Declarar tem função: impede que `EMITTED` ou `COMMERCIALLY_CONFIRMED` sejam lidos como
conclusão financeira. Chamar `E + A` de concluída somaria contratos que a Creditum
ainda não emitiu.

## 5. Detector D — integrado

### 5.1 A decisão que faltava

A Fase 2.11 deixou D deferido porque escolher entre `E`, `E+A` e `E+A+P` é decisão de
negócio, e integrar sob suposição produziria um denominador que ninguém aprovou. A
decisão chegou: **`COMMERCIAL_POTENTIAL`**.

Ela faz sentido para o que D mede. D pergunta "um único caso domina o agregado?" — e a
resposta interessa justamente sobre a possibilidade comercial do mês: um contrato de
R$ 60 mil concentrando o funil é o mesmo risco esteja ele emitido ou aguardando
assinatura.

O teste demonstra isso: onze contratos de R$ 1.000 e um de R$ 60.000, e o dominante é
um `A` — que **não** é venda emitida e ainda assim concentra o funil.

### 5.2 Mapeamento

```
cases[].amount_cents  ←  TICKET oficial
cases[].unit          ←  D13 (canonicalizeUnit)
cases[].subject_ref   ←  pseudônimo canônico, pessoa ou linha
metric                ←  amount_sum_cents (vocabulário governado do artefato)
period                ←  limites civis do período
evidence              ←  pipeline da Fase 2.11
```

**Nenhum detector foi alterado.** `material-single-case.ts` está intocado.

### 5.3 `P` entra como membro, não como probabilidade

Nenhum peso, nenhum fator de conversão, nenhum forecast. Um `P` conta um contrato, com
o `TICKET` que a fonte afirmou.

Ponderar por probabilidade de fechamento exigiria uma taxa de conversão governada que
não existe, e produziria um agregado que nenhuma fonte publicou. Teste varre a entrada
serializada e afirma a ausência de `forecast`, `probability`, `weight`, `conversion` e
`sales_count`.

### 5.4 Uma evidência contrafactual por candidato

O contrato de D é explícito: cada agregado sem um item é um número **diferente**, que
nenhuma fonte publicou, e uma evidência só pode provar UMA dessas computações. A
versão que o gate da Fase 2.4 rejeitou reusava uma evidência global — uma prova cuja
fórmula dizia "soma sem X" sustentava também o evento de Y.

`evidenceForCounterfactual` recebe o `subject_ref` e o carrega na identidade. Teste
afirma **12 evidências distintas** para 12 candidatos, e que cada uma tem âncora.

O `computation_id` vem de `counterfactualComputationId`, o produtor canônico **do
detector**, sobre o binding estruturado. Este módulo não compõe identidade de
computação por conta própria: se compusesse, a âncora não ancoraria nada.

### 5.5 Somente mês corrente

`LabeledPopulation.stance` é `"current"` fixo no tipo. Estender a mesma população para
mês fechado transformaria `A` e `P` antigos em possibilidade retroativa, contra a regra
histórica.

## 6. Os dois alertas

```
A  →  AWAITING_CREDITUM_SIGNATURE     gargalo INTERNO — a Creditum emite
P  →  PENDING_STUDENT_SIGNATURE       gargalo EXTERNO — o aluno assina
```

Dois fatos e não um porque vão para **pessoas diferentes**. Um fato único chamado
"assinatura pendente" obrigaria quem recebe a descobrir de quem é a vez.

Os dois têm `severity: null` e `severity_status: "SEVERITY_POLICY_UNRESOLVED"`.
`creditum-policy.v1.json` não cobre este tipo de evento, e a Fase 2.7 fechou que
severidade sem lastro governado não sai. `null` não é campo a preencher depois — é a
afirmação de que nenhuma severidade foi atribuída.

### 6.1 Nenhum prazo

`CREDITUM_SIGNATURE_OVERDUE` **não** é produzido. Exigiria um prazo máximo governado,
e ele não existe. Um "atrasado" sem definição de atraso é um alerta que ninguém pode
conferir.

Teste varre os fatos serializados e afirma a ausência de `OVERDUE`, `deadline`,
`aging` e `days`.

Também sem aging para `P`: a fonte não traz de forma governada a data em que o
contrato foi gerado, e inventar um relógio produziria atraso sem base.

### 6.2 Evidência e PII

Ambos os fatos usam evidência do pipeline governado da Fase 2.11 — teste confere que
cada `evidence_ref` existe em `capture.evidence.all` e que o `snapshot_id` casa.
Nenhum CPF, pontuado ou em dígitos, aparece na serialização.

## 7. Detector B — não integrado, contrato futuro registrado

### 7.1 A semântica governada quando o Omie existir

O fluxo financeiro no Omie é criado **após a emissão**. Logo:

| status | fluxo Omie esperado | fluxo ausente | fluxo presente |
| --- | --- | --- | --- |
| `E` | **deve existir** após o grace period | divergência | reconciliado |
| `A` | não deve existir | esperado | **divergência** |
| `P` | não deve existir | esperado | **divergência** |

As duas divergências de `A` e `P` são interessantes: fluxo criado antes da emissão
significa que algo emitiu sem passar pelo status.

### 7.2 O grace period NÃO está governado

```
OMIE_FLOW_CREATION_GRACE_PERIOD = PENDING_GOVERNANCE
```

A criação do fluxo ocorre poucos minutos depois de `E`. O número exato de minutos não
foi decidido, então **nenhum alerta automático de `E_WITHOUT_OMIE_FLOW` foi
implementado**. Um threshold inventado transformaria latência normal de integração em
divergência reportada ao CEO.

### 7.3 Os três bloqueadores de B

1. fonte Omie observável;
2. identidade reconciliável entre contrato do Lucas e fluxo do Omie;
3. grace period governado.

O antigo **8 vs 14** continua **não** sendo conflito de dado: são populações
diferentes (realizado vs pipeline), e tratar diferença de definição como conflito
geraria alerta sobre um desacordo que não existe.

### 7.4 Fluxo existe ≠ aluno pagou

Duas dimensões separadas, e confundi-las seria afirmar receita:

```
OMIE_FLOW_EXISTS        o título financeiro foi criado
OMIE_PAYMENT_CONFIRMED  o aluno pagou
```

A segunda é a que `FULLY_COMPLETED_SALE` exige.

## 8. Detector C — deferido, com mudança de fonte aprovada

C continua deferido pela razão da Fase 2.11: `DueExclusionReason` tem 2 membros e a
fonte produz 5 estados de `Venc`.

### 8.1 A mudança operacional aprovada

A partir de agora, na fonte:

- o primeiro vencimento **permanece preservado**;
- `PG` vai para uma **coluna separada**.

### 8.2 Não codificar posição de coluna

**Não** foi codificado nada como "coluna B significa PG". O provider é
`HEADER-BASED` desde a Fase 2.11, e por medição: julho e agosto têm ordens
diferentes — `CPF` é a 4ª coluna em agosto e a 3ª em julho.

Quando a fonte atualizada for observada, o cabeçalho real dirá o nome da coluna nova.
Assumir posição agora seria reintroduzir o defeito que o mapeamento por cabeçalho
existe para impedir.

### 8.3 Quando a fonte atualizada chegar

Se o primeiro vencimento vier como data completa válida, `first_due_date` fica
preservado e a coluna separada pode representar status de pagamento. Depois disso, C
pode receber os contratos novos que tenham `first_due_date` válido, pelo contrato
existente dele.

### 8.4 O histórico antigo é irrecuperável

Linhas cujo `Venc` já foi sobrescrito por `PG` continuam
`FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE`. Em julho eram **13 de 24**.

Não inferir a data usando Omie, `period` ou outra coluna. O Omie pode futuramente
fornecer a **data de pagamento real** — e pagamento real não substitui o primeiro
vencimento contratual. São grandezas diferentes: uma é o que foi acordado, a outra é o
que aconteceu.

## 9. Futuro — reconciliação de pagamento

Capacidade futura, **não implementada**:

```
first_due_date contratual   vs   data de pagamento real do Omie
```

Fatos possíveis: `PAID_ON_TIME`, `PAID_EARLY`, `PAID_LATE`, `DUE_NOT_PAID`,
`PAYMENT_NOT_FOUND`.

Isso **não** altera a semântica do Detector C: C mede concentração de vencimento
contratual, e reconciliação de pagamento é outra pergunta.

## 10. Source-first / Omie

Nenhuma lógica financeira paralela foi integrada. Quando chegar o momento do Omie,
preferir a fonte/dashboard financeiro oficial exposto pelo responsável do domínio.

Se o dado necessário não estiver exposto: registrar **GAP para o Leonardo / fonte
financeira**, em vez de construir uma leitura própria do Omie.

## 11. Nada de relatório

Nenhum dashboard, card, página, gráfico ou relatório executivo. As três populações são
contratos e fatos de read-model, não um produto visual paralelo ao do Lucas.
Verificado: zero arquivos de UI no diff.

## 12. Verificação

```
intelligence   1994 passed (40 arquivos)   +27
portal          190 passed
typecheck       intelligence OK · portal OK
lint            intelligence OK
```

Lint do portal: 16 erros pré-existentes, baseline inalterado, zero em arquivo desta
fase.

**Arquivos:** `status-semantics.ts` (projeção, populações, fato de `P`),
`detector-input.ts` (`selectPopulation`, `toMaterialSingleCaseInput`,
`pendingStudentSignatureFacts`), `evidence.ts` (`evidenceForCounterfactual`),
`tests/lucas/commercial-semantics.test.ts` (novo, 27 testes).

**Intocados:** adaptador Google, `source-time.ts`, `venc.ts`, `rows.ts`,
`header-mapping.ts`, `file-selection.ts`, `provider.ts`, `content-hash.ts`,
detectores A/B/C/D, policy, D13, `expected_units`.

## 13. Gaps

**Bloqueando B:** fonte Omie observável · identidade reconciliável ·
`OMIE_FLOW_CREATION_GRACE_PERIOD`.

**Bloqueando C:** fonte atualizada com primeiro vencimento preservado e coluna de
pagamento separada — e o cabeçalho real precisa ser observado, não presumido.

**Bloqueando `FULLY_COMPLETED_SALE`:** confirmação de pagamento no Omie.

**Sem severidade governada:** `AWAITING_CREDITUM_SIGNATURE` e
`PENDING_STUDENT_SIGNATURE` existem como fatos; a política executiva não.

**Ainda em aberto da 2.11:** credencial Google de produção,
`FIRST_DUE_DATE_ORIGINAL`, memberships de `expected_units`, vocabulário de `Canal`,
aliases de `Vendedor`, CPF vazio de agosto.

Sem commit, sem push, nada ingerido.

---

# 14. Fase 2.12a — fronteira de período e identidade de candidato

O gate apontou dois HIGH, e os dois eram meus.

## 14.1 HIGH 1 — o período corrente era AFIRMADO, não provado

`toMaterialSingleCaseInput` aceitava qualquer captura e **estampava**
`stance: "current"`. Um chamador podia carregar um mês fechado e passá-lo direto,
tratando `A` e `P` históricos como `COMMERCIAL_POTENTIAL` — exatamente o vazamento que
a regra histórica proíbe. Meu teste conferia o rótulo fabricado, não a recusa.

### A correção

```ts
const PERIODO_VALIDADO: unique symbol = Symbol("lucas/current_period_validated")

export interface CurrentPeriodCapture {
  readonly [PERIODO_VALIDADO]: true
  readonly capture: …
  readonly current_period: string
}
```

Símbolo **não exportado**: nenhum código fora do módulo consegue produzir a chave, e
`validateCurrentPeriod` é o único produtor. `selectPopulation` e
`toMaterialSingleCaseInput` só aceitam `CurrentPeriodCapture`.

O `stance: "current"` do resultado deixou de ser estampado sobre o que aparecesse —
ele existe porque o **tipo de entrada** prova que o período foi validado.

A prova de que funcionou: o compilador quebrou 15 testes desta suíte quando a
assinatura mudou. Eles passavam a captura crua, e passaram a não compilar.

### Fechado e futuro são razões diferentes

```
capture.period <  current_period   →  CLOSED_PERIOD
capture.period >  current_period   →  FUTURE_PERIOD
```

Fechado é característica do dado: existe e a semântica corrente não se aplica. Futuro
é defeito de chamada: pedimos um mês que não aconteceu.

A comparação de `AAAA-MM` como string é segura aqui — largura fixa, zero-padded, ordem
lexical coincide com a cronológica. Diferente do caso RFC3339 da Fase 2.11c, em que a
precisão fracionária variava.

### Quem resolve o período corrente

**Não** `validateCurrentPeriod`. O valor chega por parâmetro, resolvido **uma vez** na
fronteira de orquestração por `currentPeriod()`, que usa `America/Sao_Paulo`.

Se cada função de mapeamento chamasse o relógio, duas na mesma execução poderiam
discordar sobre o mês — e a que estivesse do lado errado da meia-noite trataria o mês
vigente como fechado. Teste cobre os dois lados da virada: `01/09 00:30 UTC` é agosto
em São Paulo.

### Mês fechado → nenhuma execução

O ramo `not_current` **não tem** `validated`. Não existe o que passar adiante, e
nenhum `stance` é produzido. Teste afirma a ausência de `validated` e de `stance` na
serialização.

Historical realized continua `E` — mas isso **não** significa que o mapeamento
corrente possa rodar D histórico automaticamente com `E`. Seria outra decisão de
integração governada.

## 14.2 HIGH 2 — sujeito repetido bloquearia D por dentro

### O que verifiquei antes de decidir

Inspecionei o contrato canônico de D, como §7 pede. Ele associa o contrafactual ao
candidato por `subject_ref` em **dois** pontos:

```ts
// precondição: recusa se um subject_ref tem mais de um binding
if (candidatos.length > 1) problemas.push("N bindings para o mesmo candidato…")

// medição de impacto: Map POR SUJEITO
const bindingPorSujeito = new Map(bindings.map((b) => [b.subject_ref, b]))
```

O segundo é pior que a recusa. Verifiquei em runtime: dois bindings com o mesmo
`subject_ref` produzem um `Map` de **uma** entrada, e o primeiro caso receberia o
contrafactual do **segundo**.

E `counterfactualComputationId` compõe a identidade com `subject_ref` e **nenhuma**
identidade de linha. A operação declarada é `exclude_subject` — literalmente "excluir
o sujeito". "O agregado sem X" só é número bem definido se X aparecer uma vez.

Procurei `candidate_id`, `candidate_ref`, `case_ref` e `row_key` no contrato de D:
**não existem**. D não tem identidade de candidato separada do sujeito.

### Por que não contornei

`subject_ref` é a identidade da **pessoa**, e uma pessoa pode legitimamente ter dois
contratos no mês — a fonte é uma linha por contrato e não tem constraint. A Fase 2.10
não observou o caso em 44 linhas, mas eu mesmo documentei que ausência observada não é
garantia estrutural.

Tornar `subject_ref` único por linha resolveria a precondição e quebraria a semântica:
o evento de D sairia sobre um "sujeito" que é meia pessoa. As outras saídas são
piores — descartar perde dado, somar cria um pseudocontrato que a fonte não afirmou,
deduplicar por CPF contradiz a granularidade.

### A decisão: não-execução governada, antes de D

```
status  not_executed
reason  NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION
```

O ramo de não-execução **não tem** `input`: não existe o que mandar a D. A população
fica auditável e os sujeitos repetidos são nomeados por pseudônimo, com a contagem de
contratos de cada um.

Deixar D recusar sozinho faria **uma** linha repetida bloquear a avaliação do mês
inteiro, com uma mensagem sobre binding — que não é o problema que o operador precisa
ler.

`MATERIAL_SINGLE_CASE_CANDIDATE_IDENTITY_GAP` registra o gap medido no contrato de D,
e um teste afirma cada campo dele: `binds_by: "subject_ref"`,
`has_candidate_identity: false`, `operation: "exclude_subject"`,
`available_row_identity: "row_key"`.

### Nada é descartado

Teste afirma que as duas linhas permanecem na população com os dois tickets
(R$ 5.000 e R$ 7.000), que o `subject_ref` é o **mesmo** — é a mesma pessoa, e isso
está certo — e que os `row_key` são **distintos**, então a evidência continua por
contrato.

### CPF ausente não colide

`IDENTITY_MISSING` usa pseudônimo de **linha**, que já é único por linha. Duas linhas
sem CPF não produzem colisão de sujeito, e D roda normalmente — teste com 12
candidatos, dois deles sem CPF, e 12 `subject_ref` distintos.

## 14.3 Entrega

```
CURRENT PERIOD BOUNDARY           validateCurrentPeriod → CurrentPeriodCapture
                                  (símbolo privado não exportado)
CURRENT PERIOD TIMEZONE           America/Sao_Paulo, via currentPeriod() na orquestração
CLOSED PERIOD D                   NOT EXECUTED — o ramo não tem `validated`
CALLER CAN FAKE stance=current     NO — o tipo não é construível fora do módulo
D BUSINESS POPULATION             E+A+P (inalterado)
SUBJECT IDENTITY                  a PESSOA (CPF + período), ou a linha quando sem CPF
CONTRACT/CANDIDATE IDENTITY       row_key (SHA-256 canônico da Fase 2.11) —
                                  mas D NÃO tem campo para recebê-la
ROW_KEY USED                      YES na Evidence; D não aceita
SAME CPF + SAME PERIOD            ambos os contratos preservados; D não executado
D UNEXPECTED REJECTION            NO — a recusa é nossa, antes de invocá-lo
IF D CANNOT REPRESENT             not_executed /
                                  NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION
DETECTOR D MATH                   UNCHANGED
A/P FACTS                         UNCHANGED
TESTS                             2006 intelligence (40 arquivos, +12) · 190 portal
```

**Arquivos:** `detector-input.ts` (fronteira de período, não-execução governada, gap
documentado), `tests/lucas/commercial-semantics.test.ts` (+12).

**Intocados:** `material-single-case.ts` e todos os detectores, policy, D13,
evidência, `venc.ts`, provider, adaptador Google, B e C.

## 14.4 Gap novo

**`MATERIAL_SINGLE_CASE_CANDIDATE_IDENTITY_GAP`** — o contrato de D só distingue
candidatos por `subject_ref`. Para que dois contratos do mesmo sujeito sejam
avaliados, D precisaria de identidade de candidato própria (`row_key` já existe do
lado da ingestão). É decisão de contrato de detector, não de integração — e enquanto
não existir, a não-execução governada é a resposta honesta.

---

# 15. Fase 2.12b — PRODUCTION D ORCHESTRATION

O gate deu NO-SHIP com um achado que eu deveria ter previsto, porque é o **terceiro**
da mesma família nesta fase:

> A integração do Detector D existe apenas como mapeador não chamado.

Verifiquei antes de corrigir: zero chamadores de produção para
`toMaterialSingleCaseInput` e `detectMaterialSingleCase`, e `currentPeriod` aparecia
**só em comentário**.

## 15.1 O padrão que se repetiu

| fase | peça correta | e nada a chamava |
| --- | --- | --- |
| 2.11 | `EvidenceBuilder` declarado em `ports.ts` | nunca implementado |
| 2.11b | `LucasDrivePort` | nenhuma implementação de produção |
| 2.12 | mapeador de D, validação de período, não-execução | **nenhum chamador** |

E a agravante em todos: os testes **compunham a cadeia à mão**. Provavam que as peças
funcionam juntas quando alguém as monta na ordem certa — não que exista alguém
montando.

## 15.2 A cadeia, num lugar só

```
currentPeriod(America/Sao_Paulo)          UMA vez
  └─ provider.load({ period })            o MESMO período
      └─ validateCurrentPeriod(capture, period)
          └─ toMaterialSingleCaseInput(validated, …)
              ├─ not_executed  →  para aqui, com a razão
              └─ mapped        →  detectMaterialSingleCase(input, PROD)
```

Enquanto o chamador tinha de montar isso, cada chamador podia montar diferente —
resolver o período duas vezes, pular a validação, ou invocar D com input que a
precondição dele recusaria. **A composição é a parte que precisa ser única.**

## 15.3 Entrypoint

```
integration/src/lucas/analysis.ts
  runLucasCurrentPeriodAnalysis(request, seams) → LucasAnalysisOutcome

integration/src/lucas/production.ts
  runProductionLucasAnalysis(request, env, seams) → LucasAnalysisOutcome
```

O segundo é o de produção: constrói o provider real (adaptador Google, credencial) e
roda a análise. Credencial ausente continua lançando como **bootstrap**, antes de
qualquer requisição — teste afirma zero chamadas HTTP nesse caso.

**Não agenda nada.** Sem cron, fila ou background. É um ponto de entrada chamável;
quando chamar é decisão do runtime, fase posterior.

## 15.4 Seis estados discriminados

| estado | quando | D invocado? |
| --- | --- | --- |
| `source_not_available` | nenhum arquivo do mês | não |
| `source_error` | Google falhou (401/403/quota/rede) | não |
| `source_invalid` | aba ausente, cabeçalho faltando, tempo inconsistente | não |
| `not_current` | período da captura ≠ corrente | não |
| `d_not_executed` | `NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION` | **não** |
| `d_executed` | input válido | sim |

Não reduzi a `resultado | null` porque um briefing futuro precisa distinguir "D rodou
e não achou nada" de "a fonte não estava lá" de "dois contratos são da mesma pessoa".
As três viram a mesma ausência de evento e exigem três conversas diferentes.

`d_not_executed` preserva a população, os sujeitos repetidos com a contagem de
contratos de cada um, e o `detail` que nomeia `exclude_subject`.

## 15.5 Uma resolução de período

O período é resolvido no topo e desce por parâmetro. `periodClock` é seam separado do
relógio do provider: o do provider é para `collected_at`, este decide **qual mês**.

Se fosse resolvido de novo na validação, uma execução iniciada às 23:59:59 do dia 31
carregaria agosto e validaria contra setembro — a captura seria recusada como
`CLOSED_PERIOD` por corrida de relógio, não por característica do dado.

O teste é adversarial: o relógio devolve agosto na primeira leitura e **setembro** na
segunda, e afirma `leituras === 1` e `period === "2026-08"`.

E o fuso: `01/09 00:30 UTC` é `31/08 21:30` em São Paulo → período **agosto**, com o
arquivo `Novos Alunos - Agosto` pedido ao Drive.

## 15.6 A/P independentes de D

Os fatos são calculados **antes** do mapeamento de D e viajam nos dois estados que têm
captura válida. Um sujeito repetido impede D e **não** esconde os alertas de
assinatura — que não têm relação com identidade de candidato.

Teste: fixture com sujeito repetido em `A` e `P` → `d_not_executed` com um fato de cada.

## 15.7 Aba vazia

Zero candidatos: D roda pelo contrato dele e responde sem evento. Nenhum número é
inventado, e a população é honestamente zero — `population.count === 0`,
`detector.events === []`.

## 15.8 A prova de que a cadeia é composta

Os testes chamam **apenas** `runProductionLucasAnalysis`. Nenhum deles chama
`currentPeriod`, `provider.load`, `validateCurrentPeriod`,
`toMaterialSingleCaseInput` ou `detectMaterialSingleCase`.

Rodei três **mutações** na orquestração:

| mutação | testes mortos |
| --- | --- |
| resolver o período duas vezes | 1 (§17) |
| invocar D mesmo com sujeito repetido | 3 |
| gatear os fatos de A/P no sucesso de D | 1 (§12) |

Restaurado: 19 passam. E `FakeDrive` não entra — o tipo do bootstrap não o aceita; as
costuras são `http`, `tokenSource`, `now`, `periodClock` e `config`.

## 15.9 Entrega

```
PRODUCTION D ORCHESTRATION        IMPLEMENTED
ENTRYPOINT                        runProductionLucasAnalysis (production.ts)
                                  → runLucasCurrentPeriodAnalysis (analysis.ts)
CURRENT PERIOD RESOLUTION         ONCE — teste conta as leituras do relógio
TIMEZONE                          America/Sao_Paulo
LOAD PERIOD                       o mesmo período resolvido
VALIDATION                        validateCurrentPeriod, com o mesmo valor
CURRENT CAPTURE REQUIRED          YES — o tipo não aceita outra
D MAPPER                          o canônico da 2.12a, reusado
REPEATED SUBJECT                  d_not_executed /
                                  NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION
D INVOKED ONLY WHEN INPUT VALID   YES
DATA_NOT_AVAILABLE                source_not_available, com o nome do arquivo esperado
SOURCE_ERROR                      source_error, com a classe do erro do Google
INVALID_SOURCE                    source_invalid, com a razão preservada
A/P FACTS                         independentes de D — presentes nos dois estados
D MATH                            UNCHANGED
TESTS                             2025 intelligence (41 arquivos, +19) · 190 portal
                                  3 mutações mortas · typecheck OK · lint OK
```

**Arquivos:** `analysis.ts` (novo), `production.ts` (entrypoint de produção),
`tests/lucas/analysis-orchestration.test.ts` (novo, 19 testes).

**Intocados:** `material-single-case.ts` e todos os detectores, mapeador da 2.12a,
`validateCurrentPeriod`, semântica E/A/P/C, as três populações, policy, D13,
evidência, `venc.ts`, adaptador Google, B e C.

---

# 16. Fase 2.12c — PRODUCTION RUNTIME TRIGGER

O gate deu NO-SHIP: `runProductionLucasAnalysis` estava correto e **nada o chamava**.
A busca o achava só na definição e nos testes.

É o **quarto** achado da mesma família nesta linha de fases:

| fase | peça correta | a distância que faltava |
| --- | --- | --- |
| 2.11 | `EvidenceBuilder` em `ports.ts` | nunca implementado |
| 2.11b | `LucasDrivePort` | nenhuma implementação de produção |
| 2.12b | mapeador de D, validação | nenhum chamador |
| 2.12c | `runProductionLucasAnalysis` | **nenhum gatilho de runtime** |

O padrão: uma peça correta a mais de distância do runtime do que eu supunha, e testes
que chamavam a peça diretamente em vez de partir de onde a execução começa.

## 16.1 O comando

```bash
npm run lucas:analyze --prefix intelligence
```

Módulo: `integration/src/lucas/cli.ts`, função `runLucasAnalysisCommand`.

Cadeia real:

```
npm run lucas:analyze
  └─ tsx integration/src/lucas/cli.ts
      └─ runLucasAnalysisCommand
          └─ runProductionLucasAnalysis
              └─ productionLucasProvider   (adaptador Google real)
              └─ currentPeriod             UMA vez, America/Sao_Paulo
              └─ load(period) → validate → fatos A/P → mapeia D
                  ├─ not_executed
                  └─ detectMaterialSingleCase
```

Verifiquei o comando de ponta a ponta: sem credencial ele imprime
`bootstrap_failure` em stderr e sai com **código 1**.

## 16.2 Por que `tsx`, e o que eu descartei

Inventariei as convenções antes de adicionar nada. O `intelligence` roda
`node scripts/*.mjs` — não há runner de TypeScript, e não havia `tsx`, `ts-node` nem
`vite-node`.

Testei o Node direto: falha com `ERR_MODULE_NOT_FOUND`. O `tsconfig` usa
`moduleResolution: bundler` e **todo** o pacote escreve imports sem extensão, então o
resolvedor ESM do Node não os encontra.

Um build com `tsc` emitiria os mesmos imports sem extensão e exigiria reescrever cada
import do pacote — mudança massiva em arquivos que esta fase não pode tocar. `tsx` é
um loader, não framework: `npm audit` reporta **zero** vulnerabilidades para ele.

## 16.3 O comando NÃO orquestra

Ele chama `runProductionLucasAnalysis` e formata. Um teste lê o **fonte** do módulo e
afirma a ausência de `currentPeriod(`, `validateCurrentPeriod(`,
`toMaterialSingleCaseInput(`, `detectMaterialSingleCase(`, `selectPopulation(` e
`.load(`.

Se orquestrasse, haveria dois caminhos de produção — e o segundo poderia divergir do
primeiro sem que nada falhasse.

## 16.4 Os seis estados, projetados

`toReport` tem `switch` **exaustivo** sobre a união da orquestração: estado novo sem
tratamento não compila. Sem isso, um estado novo cairia num `default` e apareceria no
log como "desconhecido" — a pior forma de descobrir um estado.

| estado | no relatório |
| --- | --- |
| `source_not_available` | `source.expected_file_name` — o que ir olhar no Drive |
| `source_error` | `source.detail` com a classe do erro do Google |
| `source_invalid` | `source.reason` |
| `not_current` | `source.reason` + `capture_period` |
| `d_not_executed` | população, razão, sujeitos repetidos, fatos A/P |
| `d_executed` | população, `candidates_evaluated`, `events`, qualidade, fatos A/P |

## 16.5 Códigos de saída

```
0  GOVERNED_RESULT      um dos seis estados foi emitido
1  BOOTSTRAP_FAILURE    configuração ausente; nada foi lido
2  UNEXPECTED_FAILURE   defeito nosso
```

Não havia convenção no repositório, então documentei uma. A distinção que importa: um
**resultado governado é sucesso do comando**, ainda que diga "a fonte não estava lá" —
o sistema respondeu, e a resposta é a informação.

Tratar `source_not_available` como erro faria um mês sem arquivo parecer processo
quebrado, e um operador investigaria infraestrutura em vez de olhar a pasta.
`d_not_executed` sai 0 e **não** vira exceção.

## 16.6 Saída segura

Uma linha de JSON em stdout, para um agendador futuro consumir. Teste afirma a
ausência de CPF (pontuado e em dígitos), nome, `PRIVATE KEY`, token, `evidence_id`,
`row_key` e `ticket_cents`.

Fatos de `A` e `P` saem como **contagem**. O detalhe individual existe no objeto
devolvido, para quem consome programaticamente; o log não precisa dele.

`subject_ref` aparece — e só ele — nos sujeitos repetidos. É pseudônimo governado
`subj_<16 hex>`, projetado desde a 2.11 para ser seguro fora do domínio, e é a única
forma de um operador rastrear qual caso travou D.

## 16.7 Server-side

Vive em `integration/src/lucas`, fora de `src/app`, e importa `google-auth-library`.
Verifiquei: **nenhuma** referência a `lucas/cli`, `lucas/production` ou
`lucas/analysis` em `src/`. Nenhum bundle de browser o alcança.

Guarda de execução direta: `main` só roda quando o módulo É o script invocado — sem
ela, importá-lo para testar disparia a análise real.

## 16.8 O teste parte do gatilho

Nenhum teste do arquivo chama `runProductionLucasAnalysis`, `currentPeriod`,
`provider.load`, `validateCurrentPeriod`, `toMaterialSingleCaseInput` nem
`detectMaterialSingleCase`. Todos partem de `runLucasAnalysisCommand`.

E o último elo — `npm run lucas:analyze` → o módulo — é verificado lendo o
`package.json` **de verdade**.

Três mutações, todas mortas:

| mutação | testes mortos |
| --- | --- |
| script do `package.json` apontando para outro lugar | 1 |
| comando devolvendo resultado fabricado em vez de chamar a orquestração | **8** |
| comando reproduzindo a orquestração (segundo caminho) | 1 |

## 16.9 O que esta fase NÃO estabelece

```
CALLABLE PRODUCTION RUNTIME     YES
SCHEDULED AUTOMATIC EXECUTION   NO
```

Sem cron, fila, agendador ou notificação automática ao CEO. Publicar a árvore **não**
agenda a análise — ela cria um gatilho operacional chamável.

Um agendador futuro deve invocar **este comando**, não reconstruir a análise. É
exatamente o erro que as quatro fases anteriores documentam.

E a ativação em produção ainda exige o que a 2.11b registrou: service account real,
pasta oficial compartilhada em leitura com ela, variáveis no ambiente do servidor, e um
smoke test somente-leitura antes de habilitar operacionalmente.

## 16.10 Entrega

```
PRODUCTION RUNTIME TRIGGER    IMPLEMENTED
TRIGGER TYPE                  CLI / comando server-side
EXACT COMMAND                 npm run lucas:analyze --prefix intelligence
RUNTIME MODULE                integration/src/lucas/cli.ts
                              runLucasAnalysisCommand
CALLS                         runProductionLucasAnalysis
REAL PRODUCTION CALLER        YES — cli.ts:196, fora de testes e docs
SCHEDULED                     NO
CURRENT PERIOD                resolvido pela orquestração, uma vez
GOOGLE PROVIDER               adaptador de produção
D EXECUTION                   alcançável do gatilho
D NON-EXECUTION               alcançável do gatilho
SIX STATES                     switch exaustivo em `toReport`
PII IN COMMAND OUTPUT         NO
BOOTSTRAP CONFIG FAILURE      stderr + exit 1, zero requisições, sem fallback
RUNTIME-BOUNDARY TEST         PASS — 15 testes, 3 mutações mortas
TESTS                         2040 intelligence (42 arquivos, +15) · 190 portal
```

**Arquivos:** `cli.ts` (novo), `package.json` (script `lucas:analyze` + `tsx`),
`tests/lucas/cli-runtime.test.ts` (novo, 15 testes).

**Intocados:** `analysis.ts`, `production.ts`, mapeador de D, `CurrentPeriodCapture`,
semântica E/A/P/C, fatos A/P, adaptador Google, evidência, policy, D13, `venc.ts`,
detectores, B e C.

---

# 17. Fase 2.12d — fecho de dependências do subprojeto

O gate deu NO-SHIP: `intelligence/package.json` não declarava
`google-auth-library`, embora `production.ts` a importe estaticamente. Eu a instalei
no pacote **raiz** na 2.11b, e o comando funcionava por *hoisting* do pai.

Confirmei antes de corrigir:

```
raiz  dependencies.google-auth-library   ^11.0.2
intel dependencies.google-auth-library   AUSENTE
intelligence/node_modules/…              NÃO estava lá
```

Uma instalação limpa do subprojeto falharia com `ERR_MODULE_NOT_FOUND` **antes** de o
CLI emitir o JSON de bootstrap ou o código de saída.

## 17.1 O segundo caso, um nível mais fundo

A verificação isolada encontrou o que nenhum teste anterior podia ver: `ajv` e
`ajv-formats` estavam em `devDependencies`, e `gateway/src/contracts.ts` as importa no
caminho de **produção** — `toSnapshot` → `assertValid`.

Corrigir só `google-auth-library` deixaria o comando quebrado numa instalação de
produção. Foi a instalação isolada que provou isso, não a leitura do código.

Levantei o fecho por varredura em vez de memória — todos os `import` de pacote externo
em `gateway/src`, `detectors/src` e `integration/src`:

```
ajv/dist/2020.js  →  ajv
ajv-formats
google-auth-library
```

Mais `tsx`, que é o loader que executa o comando. **Quatro**, todas agora em
`dependencies`.

## 17.2 A declaração no lugar errado, removida

`google-auth-library` foi retirada do pacote raiz: o portal não a importa, e enquanto
ela estivesse lá a árvore de desenvolvimento continuaria resolvendo por hoisting —
mascarando o contrato que esta fase precisa garantir.

Depois da remoção, o comando roda na árvore de dev com a dependência do **próprio**
subprojeto, sem hoisting.

## 17.3 A verificação que fecha o achado

Instalação isolada, fora da árvore do pai, só com manifesto e fonte:

```
node_modules herdado?              NÃO — limpo
npm ci --omit=dev                  27 pacotes, 0 vulnerabilidades
npm ls google-auth-library         google-auth-library@11.0.2
npm ls ajv                         ajv@8.20.0
npm ls ajv-formats                 ajv-formats@3.0.1
npm ls tsx                         tsx@4.23.12

npm run lucas:analyze  (sem credencial)
  exit code                        1
  ERR_MODULE_NOT_FOUND             0 ocorrências
  stderr                           {"status":"bootstrap_failure", …}
```

O grafo de módulos carrega inteiro e o comando chega ao contrato de bootstrap — que é
exatamente o que faltava.

## 17.4 O teste de subprocesso

`tests/lucas/cli-subprocess.test.ts` roda `npm run --silent lucas:analyze` como
processo filho. A fronteira inclui o que só existe fora do processo de teste:

```
npm script → loader tsx → resolução de módulos → guarda de execução direta
           → CLI → bootstrap → código de saída do processo
```

Nenhum mock, nenhum import do módulo sob teste. As credenciais são **removidas** do
ambiente do filho — não sobrescritas com vazio — para que numa máquina configurada o
teste não passe a ler o Drive de verdade.

Afirmações: ausência de `ERR_MODULE_NOT_FOUND`/`Cannot find package`, exit 1, JSON de
`bootstrap_failure` em stderr, stdout sem resultado de análise fabricado, e nenhum
segredo ou PII (incluindo regex de CPF pontuado e de 11 dígitos).

E um guard que impede o defeito de voltar: um teste **varre** o grafo de produção e
afirma que todo pacote externo importado está em `dependencies`. Um import novo de
pacote não declarado falha ali, antes de falhar numa instalação limpa.

Duas mutações, ambas mortas — cada uma devolvendo uma dependência para
`devDependencies`, incluindo o defeito exato do gate:

| mutação | testes mortos |
| --- | --- |
| `google-auth-library` → devDependencies | 2 |
| `ajv` → devDependencies | 2 |

## 17.5 Auditoria

```
intelligence   0 vulnerabilidades  (0 relacionadas às deps desta fase)
raiz          11 vulnerabilidades  pré-existentes: next, postcss, hono,
                                   body-parser, js-yaml, brace-expansion,
                                   fast-uri, ip-address
```

Nenhum upgrade não relacionado foi feito.

## 17.6 Entrega

```
GOOGLE AUTH DEPENDENCY            DECLARED
PACKAGE                           intelligence
DEPENDENCY                        google-auth-library 11.0.2
DEPENDENCY TYPE                   production dependency
TAMBÉM CORRIGIDAS                 ajv 8.20.0 · ajv-formats 3.0.1
                                  (estavam em devDependencies e são runtime)
LOCKFILE                          intelligence/package-lock.json regenerado
TSX AVAILABLE WITH --omit=dev     YES — tsx@4.23.12
CLEAN ISOLATED npm ci --omit=dev  PASS — 27 pacotes (MANUAL; automatizado na 2.12e)
CLEAN npm ls                      as quatro presentes
REAL npm SCRIPT SUBPROCESS        PASS — 7 testes, 2 mutações mortas
NO-CREDENTIAL EXIT CODE           1
NO-CREDENTIAL RESULT              bootstrap_failure
ERR_MODULE_NOT_FOUND              NO
ROOT/PARENT NODE_MODULES REQUIRED NO — declaração da raiz removida
CLI CONTRACT                      UNCHANGED — 0/1/2 e os seis estados
TESTS                             2047 intelligence (43 arquivos, +7) · 190 portal
```

**Arquivos:** `intelligence/package.json` (quatro deps de produção),
`intelligence/package-lock.json`, `package.json` + lock da raiz (declaração
equivocada removida), `tests/lucas/cli-subprocess.test.ts` (novo, 7 testes).

**Intocados:** `cli.ts`, `analysis.ts`, `production.ts`, adaptador Google,
implementação de auth, mapeador de D, detectores, evidência, policy, D13, `venc.ts`,
B e C.


# 18. Fase 2.12e — a instalação isolada, automatizada

```
TEMP FORA DO REPOSITÓRIO          YES
NODE_MODULES COPIADO              NO
NODE_PATH LIMPO                   YES
ISOLATED npm ci --omit=dev        PASS
QUATRO DEPS DE PRODUÇÃO           RESOLVED
RESOLUÇÃO VEM DO TEMP             YES — import.meta.resolve
REAL npm run lucas:analyze        PASS — exit 1, bootstrap_failure
ERR_MODULE_NOT_FOUND              NO
HOISTING DO PAI POSSÍVEL          NO
MUTAÇÕES MORTAS                   2
```

## 18.1 O achado, e por que ele estava certo

A 2.12d corrigiu as declarações e eu verifiquei o fecho com uma instalação isolada de
verdade — **no terminal, à mão**. O teste automatizado continuou rodando `npm run` com
`cwd` no diretório real do pacote, onde há um `node_modules` de desenvolvimento
completo e onde a resolução pode subir para o do repositório pai.

O gate apontou a consequência exata: aquele teste não podia pegar o defeito que a fase
existe para impedir. Pior, o comentário no topo dele afirmava o contrário — "se uma
dependência de produção estiver mal declarada, isto falha". A afirmação era falsa, e
uma prova que se descreve errado é pior que prova ausente.

É a mesma família de defeito das quatro fases anteriores, num registro novo:
verificação manual não é contrato.

## 18.2 O que o teste faz

`integration/tests/lucas/packaging-isolated.test.ts`:

```
mkdtemp(os.tmpdir())                    fora da árvore do repositório
  ├─ cpSync com filtro                  sem node_modules, coverage, dist, .git
  ├─ assert !exists(node_modules)       nos três níveis do temporário
  ├─ npm ci --omit=dev                  lockfile COMMITADO, exit 0
  ├─ npm ls --depth=0 --omit=dev        as quatro dependências diretas
  ├─ import.meta.resolve                de ONDE cada uma veio
  └─ npm run --silent lucas:analyze     credenciais REMOVIDAS do ambiente
```

Três asserções de caminho fecham o achado, e a diferença entre elas importa: a primeira
diz que a resolução vem de dentro do temporário, a segunda que vem do `node_modules` do
próprio pacote isolado, a terceira que **não** vem do repositório real. "Resolveu" sem
dizer de onde é exatamente o que passou pelo gate anterior.

`NODE_PATH` e `NODE_OPTIONS` são removidos do ambiente do filho. Com `NODE_PATH`
apontando diretórios extras, um pacote não declarado resolveria e a prova passaria por
engano.

### A cópia recria a árvore do portal

O pacote importa `../../../src/lib/ceo/*` — `engine.ts` é o ponto único de acoplamento
com o portal. A cópia monta `<temp>/repo/src/lib` ao lado de `<temp>/repo/intelligence`,
que é a forma real do repositório. Nenhum `node_modules` é criado em `<temp>/repo`,
então não há de onde subir.

## 18.3 Um erro meu na primeira execução

A primeira rodada falhou, e não pelo motivo certo: no macOS `os.tmpdir()` devolve
`/var/folders/…`, symlink para `/private/var/folders/…`. A resolução do Node reporta o
caminho real, e comparar as duas formas como string reprova uma instalação que está no
lugar correto. A comparação agora é entre caminhos canônicos — `realpathSync` nos dois
lados.

Vale registrar porque é a mesma classe do defeito de comparar RFC3339 como string, na
2.11a: duas representações da mesma coisa, comparadas na forma textual.

## 18.4 A mutação provou mais do que eu esperava

Duas mutações, e as duas morrem — mas em pontos diferentes, e a diferença é
informativa:

```
google-auth-library → devDependencies
  o SUBPROCESSO falha       ERR_MODULE_NOT_FOUND

ajv → devDependencies
  o subprocesso PASSA
  npm ls --depth=0 falha    ajv não é dependência direta
```

`ajv` continua resolvendo em tempo de execução porque `ajv-formats` o puxa como
dependência própria. `gateway/src/contracts.ts` importa `ajv` direto no caminho de
produção; sem a declaração, ele funcionava emprestado da árvore de outro pacote — e
uma mudança de range em `ajv-formats` quebraria a produção sem que nada aqui mudasse.

Só a asserção de dependência DIRETA pega isso. As duas camadas ficam.

A ordem das asserções foi escolhida para isso: a coleta acontece toda antes de qualquer
`expect`, e a asserção de resolução do comando real vem primeiro. Com a ordem ingênua,
um fecho quebrado morria no `npm ls` e o comando real nunca rodava — o teste nunca
demonstraria que o subprocesso pega o defeito.

## 18.5 Os três testes, e o que cada um prova

```
guarda de grafo de imports   import externo não declarado       sem instalar nada
cli-subprocess               o comando responde na árvore       segundos
packaging-isolated           manifesto+lock instalam sozinhos   ~11s, npm ci real
```

Nenhum substitui o outro. O primeiro é barato e pega a classe mais comum; o terceiro é
o único que prova o contrato standalone. `packaging-isolated` está na suíte padrão — e
portanto em `npm run verify` — de propósito: a alternativa é uma prova que só roda
quando alguém se lembra, e foi assim que o defeito passou.

## 18.6 A raiz é irrelevante

O teste não lê nada do `node_modules` do repositório. A raiz pode não ter
`node_modules`, ter dependências diferentes, ou não ter `google-auth-library` — a prova
não muda, por construção.

## 18.7 Entrega

```
TRUE TEMP ISOLATION               YES
TEMP PATH OUTSIDE REPO            YES — os.tmpdir(), canônico verificado
NODE_MODULES COPIED               NO — filtro explícito
NODE_PATH CLEARED                 YES — e NODE_OPTIONS
ISOLATED npm ci --omit=dev        PASS — lockfile commitado, exit 0
ISOLATED google-auth-library      RESOLVED — 11.0.2
ISOLATED ajv                      RESOLVED — 8.20.0
ISOLATED ajv-formats              RESOLVED — 3.0.1
ISOLATED tsx                      RESOLVED — 4.23.12
DEPS RESOLVE FROM TEMP            YES — import.meta.resolve, 3 asserções
REAL ISOLATED npm SCRIPT          PASS
EXIT CODE                         1
RESULT                            bootstrap_failure
ERR_MODULE_NOT_FOUND              NO
PARENT HOISTING POSSIBLE          NO
TEMP CLEANUP                      YES — afterAll, roda após falha
IMPORT-GRAPH GUARD                MANTIDA
MUTATION PROOF                    2 mortas, em pontos distintos
```

**Arquivos:** `tests/lucas/packaging-isolated.test.ts` (novo),
`tests/lucas/cli-subprocess.test.ts` (cabeçalho: afirmação falsa corrigida),
este documento.

**Intocados:** runtime de produção, `cli.ts`, `runProductionLucasAnalysis`, adaptador
Google, Detector D, fatos de A/P, semântica de fonte, evidência, policy, D13, `venc.ts`,
B e C. Nenhuma dependência foi alterada nesta fase.
