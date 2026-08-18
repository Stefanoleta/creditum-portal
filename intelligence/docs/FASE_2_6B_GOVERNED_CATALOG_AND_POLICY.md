# Fase 2.6b — Catálogo governado, política aprovada e regra de ticket baixo

**Data:** 2026-08-17
**Estado:** D13 parcialmente desbloqueado. Hermes não instalada, Fase 3 não iniciada.

---

> **ATUALIZADO PELA FASE 2.6c.** `UNIDADES.xlsx` chegou e o catálogo COMPLETO foi
> importado: 49 unidades (44 ativas, 5 inativas), 5 aliases, 2 agrupamentos. O seed
> parcial de 18 unidades foi **removido**. A severidade `info` do low-ticket foi
> **removida** — não era política aprovada. Ver §13 no fim deste documento.

## 1. `UNIDADES.xlsx` não estava disponível *(resolvido na 2.6c)*

Procurei em `~/Desktop`, `~/Downloads`, `~/Documents`, `~/Desktop/claude` e no
repositório. O único resultado foi `supabase/migrations/20260611_unidades.sql`, que
já era conhecido.

Conforme §1 do briefing: **não inventei as linhas ausentes.** O que foi entregue:

| Entregue | Estado |
|---|---|
| Estrutura do catálogo governado (`UnitCatalogEntry`, `UnitGroupLabel`) | **READY** |
| Importador validado (`importUnitCatalog`) | **READY** |
| Projeção para o índice de canonicalização (`toUnitCatalog`) | **READY** |
| Resolução com agrupamentos (`canonicalizeWithGroups`) | **READY** |
| Seed das decisões aprovadas por escrito | **READY** — 18 unidades, 2 agrupamentos |
| Seed COMPLETO (~40 unidades com status) | **BLOCKED** — depende do arquivo |

O importador aceita linhas na forma `UnitCatalogRow`. Ele **não** abre `.xlsx`: quem
extrai entrega linhas, e a validação acontece no importador. Isso evita escolher
biblioteca de planilha e adivinhar nome de coluna antes de ver o arquivo.

---

## 2. `UnitId` é dado, não código — decisão registrada

`UnitId` permanece `string` validada por `/^[a-z][a-z0-9_]{1,63}$/`. O catálogo entra
como dado.

### Documentos superseded

| Documento | O que dizia | Estado |
|---|---|---|
| `FASE_2_1_SCHEMA_V2_PROPOSAL.md` §6 | `unit_id` como união literal compilada | **SUPERSEDED** pela Fase 2.6b |
| `D13_CATALOG_VALIDATION.md` §8 | *"o `UnitId` passa a ser união literal em vez de `string` validada"* | **SUPERSEDED** pela Fase 2.6b |

**Motivo:** com ~40 unidades e crescendo, a união literal faria a abertura de uma
escola virar deploy de TypeScript. O dia em que a operação abre uma unidade não pode
ser o dia em que alguém compila o POC.

O histórico não foi apagado — os documentos seguem no repositório e esta seção
registra a substituição.

**Consequência para o bloqueio B1:** deixa de depender de enum compilado. Passa a
depender só do **conteúdo** governado do catálogo.

---

## 3. Decisões D13 aplicadas

Todas vieram por escrito na aprovação da fase. Nenhum nome canônico foi escolhido
por mim.

### 3.1 Grafias

| A fonte escreve | Canônico | Teste |
|---|---|---|
| `BelfordRoxo` | **Belford Roxo** | ✓ |
| `Maracanau` | **Maracanaú** | ✓ |

### 3.2 Jardim Ângela — uma unidade, três grafias

`Jd Angela` · `Jardim Angela` · `Jardim Ângela` → **`jd_angela`** *(id corrigido na 2.6c: o canônico da planilha é `Jd Angela`)*

Confirmado por teste: as três resolvem para **a mesma** identidade, e existe **uma**
entrada no catálogo, não três. A unidade está **inativa** conforme a planilha atual.

### 3.3 Abreviação

| A fonte escreve | Canônico | Como |
|---|---|---|
| `Presidente P.` | **Prudente** | alias **governado** no catálogo — não escolha de similaridade em runtime |

Teste dedicado verifica que o alias está na entrada, não que a similaridade acertou.

### 3.4 Unidades próprias

`Rio Centro` · `Bezerra` · `Santa Cruz` · `Zona Norte - RN` · `Madureira` — cinco
unidades **distintas**. *(2.6c: a planilha grafa `Zona Norte - RN`; ver §13.5.)* `STA Cruz` é alias governado de Santa Cruz.

`Rio Centro` ≠ `Zona Norte` ≠ `Madureira`: testado, três `unit_id` diferentes.

### 3.5 Marabá

`Grau Marabá` / `Grau Maraba` → **`maraba`**, uma única unidade. Não foi criada
unidade extra para a forma com prefixo.

Era o achado mais importante do `D13_CATALOG_VALIDATION.md`: a fonte reportava e o
catálogo não conhecia. **Resolvido.**

---

## 4. Agrupamentos comerciais — o achado desta fase

Dois textos que a fonte escreve **não são unidades e não são aliases**:

| Rótulo | Membros |
|---|---|
| `Carpina e Limoeiro` | `carpina`, `limoeiro` |
| `Limeira, Sumaré & JD Ângela` | `jd_angela`, `limeira`, `sumare` |

### 4.1 O que o sistema faz

Resultado: `ambiguous` com `reason: "GROUP_LABEL"` e `candidates` = exatamente os
membros.

- **Não** escolhe um membro.
- **Não** duplica o valor para todos.
- **Não** divide o valor entre eles.
- **Não** vaza o texto cru do rótulo.

Testado explicitamente que `Carpina e Limoeiro` ≠ `Carpina` e ≠ `Limoeiro`, e que
`Limeira, Sumaré & JD Ângela` não resolve para nenhum dos três.

### 4.2 A ordem importa

O rótulo é conferido **antes** da similaridade, por igualdade de chave comparável.
`Carpina e Limoeiro` contém `Carpina`, e qualquer caminho de similaridade poderia se
agarrar a um membro.

### 4.3 Compromisso registrado: por que `ambiguous` e não um status novo

O briefing §4 preferia um status fechado `GROUPED_SOURCE_IDENTITY`, com permissão de
usar `unresolved` + reason se a alteração fosse excessiva.

Escolhi `ambiguous` + `reason`. **Motivo técnico concreto:** os Detectores A, C e D
ramificam com `if (status === "unknown") ... else if (status === "ambiguous")`, sem
exaustividade que o compilador cubra. Um quarto valor passaria silenciosamente por
esses `else if` e **a qualidade deixaria de degradar** — o pior resultado possível
num código já aprovado, e o TypeScript não apontaria.

Reaproveitar `ambiguous` herda o comportamento já testado nos quatro detectores:
nunca promovido a identidade, qualidade vai a `conflicted`, nome cru não atravessa. O
`reason` preserva a distinção entre *"não sei qual das duas"* (`SIMILARITY`) e *"sei
exatamente o que é, e não é uma escola"* (`GROUP_LABEL`).

O campo é opcional e aditivo: nenhum código existente mudou.

### 4.4 Separador de aliases: `;` e `|`, nunca vírgula

`Limeira, Sumaré & JD Ângela` contém vírgula. Usá-la como separador de aliases
partiria o rótulo ao meio. Testado.

---

## 5. Unidade inativa ≠ desconhecida

| Situação | Comportamento |
|---|---|
| Unidade inativa aparece na fonte | identidade **resolvida**, status `inactive` preservado |
| Nome fora do catálogo | `unknown` |

Uma unidade desativada continua tendo identidade canônica conhecida. O que ela
deixou de ser é *esperada* — e isso é cobertura, não canonicalização. Confundir os
dois faria toda linha histórica de uma unidade fechada virar `unknown`
retroativamente.

`Jardim Ângela` é o caso real: inativa, e `Jd Angela` resolve.

### 5.1 Limitação registrada: sem vigência temporal

`UnitCatalogEntry` não tem `effective_from` / `effective_to`, porque `ceo.schools`
hoje só tem `active` booleano. Consequência: o status é o de **hoje**, e um período
anterior a uma desativação não é reconstituível. Decisão de governança pendente.

---

## 6. Catálogo ≠ `expected_units`

Preservado sem alteração:

```
unidades ativas no catálogo   ≠   unidades esperadas no período
```

O port `ExpectedUnitsProvider` (`integration/src/ports.ts`) devolve
`number | null`; `null` é **lacuna de governança**, nunca 100%. Nenhuma unidade ativa
foi promovida automaticamente a denominador de cobertura.

**`expected_units` continua OPEN GOVERNANCE DECISION.**

---

## 7. Política aprovada

Registrada em `APPROVED_THRESHOLDS`:

| Política | Valor | Nota |
|---|---|---|
| Participação relevante | **10%** = `1000` bp | número único; refinamento por detector é possível depois |
| Valor financeiro relevante | **R$ 50.000** = `5_000_000` cents | **approved initial / calibratable** |
| Quantidade relevante | **5 casos** | |
| População mínima | **10 contratos** | abaixo disto o detector não afirma concentração |
| Piso de ticket | **R$ 1.499,99** = `149_999` cents | comparação estritamente menor |

Mais os dois anteriores: `installment_threshold = 19` e similaridade `0,80`.

**"Calibratable" não autoriza o sistema a alterar nada.** Calibragem é decisão humana
registrada, como esta.

---

## 8. O que permanece UNRESOLVED

| Grupo | Campos | Consequência |
|---|---|---|
| Dimensão de severidade | `severity_dimension` em A, C, D | **config recusada** |
| Escala de severidade | `severity_scale` em A, C, D; `severity_by_relative_bp` e `structural_severity` em B | **config recusada** |
| Cobertura | `minimum_coverage_bp`, `coverage.degraded_below_bp`, `coverage.emit_event_below_bp` | **config recusada** |
| Tolerância entre fontes | `material_relative_difference_bp`, `material_absolute_basis_points`, `structural_fields` (B) | **config recusada** |
| Janela do Detector C | `window` | **config recusada** |
| Agregadores do Detector D | `supported_metrics` | **config recusada** |
| Seleção de caso contribuinte | `contributing_case_rule` (A) | **config recusada** |

Os valores aprovados na §7 **não foram propagados automaticamente** para os campos de
`DetectorConfig`. Eles vivem em `APPROVED_THRESHOLDS` como referência; a configuração
de produção continua tendo de declará-los explicitamente, e continua **FAIL CLOSED**
enquanto os campos acima faltarem.

`TEST_CONFIG` segue em `tests/` com `config_version: "0.0.0"`. Nenhum
`DEFAULT_CONFIG` foi criado — há teste que verifica a ausência.

---

## 9. Regra de ticket baixo

### 9.1 O que ela afirma

```
"o ticket deste contrato está abaixo do piso aprovado"
```

E nada além. Não afirma fraude, erro, prejuízo, mau negócio, risco de inadimplência,
causa, nem recomenda ação. Severidade `info` **fixa**: graduar exigiria uma escala
sobre "quão abaixo do piso", e essa escala não foi aprovada.

Um teste varre a saída contra `fraud`, `erro`, `prejuízo`, `risco`, `inadimpl`,
`suspeit`, `irregular`, `caus` e `recomend`.

### 9.2 O boundary

| Ticket | Resultado |
|---|---|
| `149_997` | alerta |
| `149_998` | **alerta** |
| `149_999` | **não alerta** |
| `150_000` | **não alerta** |
| `150_001` | não alerta |

Predicado e fórmula publicada leem a **mesma** constante, e há teste que extrai o
número da fórmula e confere o boundary — a lição do gate da Fase 2.3.

### 9.3 Independência dos R$ 50.000

As duas são dinheiro, as duas em centavos, e é exatamente por isso que o risco de
trocá-las existe:

| Política | Pergunta |
|---|---|
| R$ 50.000 | um **agregado** é grande o bastante para merecer atenção? |
| R$ 1.499,99 | um **contrato** é pequeno o bastante para merecer conferência? |

Testes dedicados: um contrato de **R$ 40.000 não é** ticket baixo; um de **R$ 1.000
é**, mesmo longe dos R$ 50 mil. O mutante que troca uma constante pela outra mata
**12 testes**.

### 9.4 Materialidade individual

A regra **não exige** 10%, R$ 50 mil, 5 casos nem população de 10. O fato individual
basta: um contrato só, abaixo do piso, gera alerta. Testado.

Se depois houver agregação (*"quantos tickets baixos existem?"*), a materialidade
desse agregado é decisão separada. Não inventada.

### 9.5 Ticket não positivo — decisão pendente

Lastro governado encontrado: `ceo.sales.ticket_cents` é coluna gerada de
`transfer_cents * installments_grau`, com `transfer_cents >= 0` e
`installments_grau > 0`. Logo:

| Valor | No domínio | Tratamento |
|---|---|---|
| negativo | **impossível** | `INVALID_TICKET` — corrupção de dado |
| zero | representável | `INVALID_TICKET` — **decisão pendente** |

Aritmeticamente `0 < 149_999`, então zero passaria pelo predicado. Mas nenhuma regra
governada declara venda de valor zero como venda. Um contrato de R$ 0,00
provavelmente é linha incompleta, e alertar "ticket abaixo do piso" mandaria o
comercial olhar o preço quando o problema é de ingestão.

Então: `INVALID_TICKET`, contado, visível na qualidade, com lacuna
`BUSINESS_RULE_PENDING`. **Se o CEO decidir que ticket zero é alerta comercial, isso
vira regra explícita.**

### 9.6 Ausente e inseguro

| Situação | Tratamento |
|---|---|
| `null` | `TICKET_UNAVAILABLE`, lacuna `DATA_NOT_AVAILABLE` — **nunca zero** |
| float (`1499.99`) | `INVALID_TICKET` — dinheiro é inteiro em centavos |
| `NaN` / `Infinity` / fora da faixa | `INVALID_TICKET` |

### 9.7 Evidência — limitação declarada

Validado por contrato: snapshot existe, evidência existe, `evidence.snapshot_id`
corresponde, `evidence.locator.dataset_id` corresponde ao dataset do snapshot.

**Limitação:** `Evidence.locator` chega até `row_key`, o que liga a evidência à
**linha**. O contrato **não** carrega `subject_ref`, então a associação
evidência↔pessoa não é verificável — apenas evidência↔linha↔dataset. Não afirmo
propriedade que o contrato não sustenta.

### 9.8 Identidade

`structuralId` sobre `{ event_type, rule_id, rule_version, floor_cents, período,
subject_ref, datasets }`. `snapshot_id` fica **fora** — reingerir o mesmo dataset
lógico não cria alerta novo. `rule_version` entra porque mudar a regra observável
muda o fato.

### 9.9 Extensão de contrato

`event.schema.json`: `event_type` ganhou **`low_ticket_contract`**. Extensão fechada
e mínima — o enum continua allowlist, nenhuma string arbitrária é aceita. Nenhum
outro campo do schema mudou.

---

## 10. Testes

| Suíte | Testes |
|---|---|
| `intelligence/` total | **1.238** (24 arquivos) |
| Catálogo governado + D13 (novo) | **41** |
| Ticket baixo (novo) | **62** |
| Harness end-to-end | **43** (era 31) |
| Detector A | 164 |
| Detector B | 74 |
| Detector C | 196 |
| Detector D | 147 |
| Portal / Motor | 182 cada |

### 10.1 Mutation tests

| Mutante | Falhas |
|---|---|
| piso vira `<=` em vez de `<` | **4** |
| reutiliza R$ 50 mil no lugar do piso de ticket | **12** |
| ticket não positivo vira "ticket baixo" normal | **6** |
| agrupamento resolve por similaridade | **6** |

Nenhum mutante permanece no código.

### 10.2 O harness provou algo novo

Com o catálogo **governado** (não o sintético), `Grau Marabá` passou a resolver e o
Detector A deixou de degradar por identidade desconhecida — `quality_status` vai a
`ok`. É a demonstração direta de que fechar D13 melhora a qualidade dos quatro
detectores.

---

## 11. Blockers restantes para a Fase 3

| # | Critério | Antes | Agora |
|---|---|---|---|
| 1 | Catálogo D13 governado | BLOCKED | **PARTIAL** — 18 unidades + 2 agrupamentos aprovados; seed completo depende de `UNIDADES.xlsx` |
| 2 | Fonte de `expected_units` | BLOCKED | **BLOCKED** |
| 3 | Thresholds aprovados | BLOCKED | **PARTIAL** — 5 políticas aprovadas; 7 grupos seguem unresolved |
| 4 | Contrato Leonardo/Supabase | BLOCKED | **BLOCKED** |
| 5 | Contrato pasta do Lucas | BLOCKED | **BLOCKED** |
| 6 | Provenance ownership | READY | READY |
| 7 | Harness de integração | READY | READY — 43 testes |
| 8 | Briefing determinístico | BLOCKED | BLOCKED |
| 9 | Read-model da Hermes | BLOCKED | BLOCKED |
| 10 | Separação de credenciais | READY | READY |
| 11 | Sem PII / nome cru | READY | READY |
| 12 | A/B/C/D SHIP | READY | READY |
| 13 | Gate adversarial | PENDING | PENDING |

**De 7 blockers para 5**, com dois convertidos em PARTIAL.

### 11.1 O que falta em cada PARTIAL

**#1 catálogo:** `UNIDADES.xlsx` no workspace. O importador está pronto — é ler as
linhas e chamar `importUnitCatalog`. As decisões já aprovadas não precisam ser
revisitadas.

**#3 thresholds:** os 7 grupos de `FASE_2_6_BUSINESS_DECISIONS.md` §3 que sobraram —
dimensão de severidade, escala de severidade, cobertura, tolerância entre fontes,
janela do C, agregadores do D, seleção de caso contribuinte.

---

## 12. O que esta fase não fez

- Não instalou Hermes, não iniciou a Fase 3.
- Não conectou Supabase nem acessou pasta.
- Não inventou nenhuma linha ausente de `UNIDADES.xlsx`.
- Não inventou `expected_units`.
- Não preencheu nenhum threshold não aprovado.
- Não propagou os valores aprovados para `DetectorConfig` — eles são referência, e a
  config de produção continua fail-closed.
- Nada commitado, nada empurrado.

---

# Fase 2.6c — Catálogo completo e severidade removida

**Data:** 2026-08-17

## 13.1 O arquivo

| Item | Valor |
|---|---|
| Caminho | `~/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/CC55DF75-8B8C-4351-ACD8-053E0875D91F/UNIDADES.xlsx` |
| Aba | `Planilha1` (única) |
| Colunas REAIS | `Unidade` · `Apelido` · `Ativo` |
| Linhas | 50 (1 cabeçalho + **49 de dados**) |

Nenhuma outra coluna existe. Nada foi inferido.

## 13.2 Totais derivados do arquivo

| Métrica | Valor |
|---|---|
| Unidades | **49** |
| Ativas (`Ativo = Sim`) | **44** |
| Inativas (`Ativo = Não`) | **5** |
| Aliases | **5** |
| Agrupamentos | **2** |

As cinco inativas: `Duque de Caxias`, `Guarulhos`, `Jd Angela`, `São Gonçalo`,
`Vila Maria`.

Os cinco aliases da planilha:

- `Curitiba` ← 'Curitiba/Centro'
- `Fortaleza - Centro` ← 'Centro FZA'
- `Santa Cruz` ← 'STA Cruz'
- `São João de Meriti` ← 'S.J de Meriti'
- `Zona Norte - RN` ← 'Natal Zona Norte'

## 13.3 A regra que a planilha codifica

Um `Apelido` em **uma** unidade é alias dela. Um `Apelido` em **duas ou mais** é
AGRUPAMENTO comercial.

Não é interpretação minha:

| Apelido | Aparece em |
|---|---|
| `Carpina e Limoeiro` | `Carpina`, `Limoeiro` |
| `Limeira, Sumaré & JD Ângela` | `Jd Angela`, `Limeira`, `Sumaré` |

A planilha e a decisão do CEO dizem a mesma coisa. O segundo tem **3** membros, não
quatro — `Jd Angela` é uma unidade só.

Tratá-los como alias faria um texto apontar para duas unidades, que é exatamente o
que o importador recusa.

## 13.4 Pipeline: build step, não runtime

```
UNIDADES.xlsx
  → tools/xlsx_to_catalog.py     (build step, stdlib: zipfile + xml.etree)
  → catalog/unidades.catalog.json (artefato governado, versionado)
  → detectors/src/unit-catalog.ts (runtime: importa JSON, zero dependência de Excel)
```

`openpyxl` não foi adicionado — um `.xlsx` é zip com XML, e a stdlib basta para
converter 10 KB uma vez por mudança de catálogo.

## 13.5 Achados de qualidade — reportados, não corrigidos

A planilha é a autoridade. Não silenciei nada:

| Achado | Observação |
|---|---|
| `Sâo José do Rio Preto` | grafia com circunflexo em vez de til. A normalização remove acento, então a identidade funciona; o `display_name` sai como está no arquivo |
| `Jd Angela` como canônico | abreviação usada como nome canônico. A regra `jd → jardim` faz as três formas casarem |
| `Divinopólis` | acento em posição incomum (`Divinópolis` seria o usual) |
| `Zona Norte - RN` | **`Zona Norte` sozinho NÃO resolve.** Se as planilhas de venda escreverem a forma curta, precisa de alias governado. Teste dedicado registra isso |
| `Prudente` com Apelido `Prudente` | alias igual ao canônico; descartado como redundância |
| `Mogi` como canônico | não `Mogi das Cruzes`. Os aliases `Mogi`/`Grau Mogi` casam por regra de prefixo |

## 13.6 Overrides governados

Três formas que as planilhas de venda usam e o catálogo de unidades não lista:

| Alias | Unidade | Lastro |
|---|---|---|
| `Presidente P.` | `prudente` | decisão da Fase 2.6b — `P.` não é expansível |
| `BelfordRoxo` | `belford_roxo` | decisão da Fase 2.6b — normalização não insere espaço |
| `Rio Preto` | `sao_jose_do_rio_preto` | decisão D13 anterior |

`Grau Marabá` e `STA Cruz` **não** precisaram de override: o primeiro resolve pela
regra de remoção do prefixo `Grau`, o segundo já está no Apelido da planilha.

## 13.7 Duplicidades: nenhuma

Verificado por teste: nenhum `canonical_name` duplicado, nenhum `unit_id` duplicado,
nenhum alias apontando para duas unidades, nenhum alias colidindo com o canônico de
outra unidade, nenhum status contraditório.

## 13.8 Seed parcial removido

`APPROVED_UNIT_CATALOG` e `APPROVED_UNIT_ROWS` **não existem mais** — há teste que
verifica a ausência dos dois nos exports. Fonte única: `GOVERNED_UNIT_CATALOG`,
construído do artefato.

## 13.9 Severidade `info` removida

`severity = "info"` **não era política aprovada** — foi escolhida por mim na 2.6b.

Agora:

| Antes | Agora |
|---|---|
| Event com `severity: "info"` | **nenhum Event** |
| — | `matched: true`, `threshold_cents`, `event_id`, evidência, qualidade |
| — | `emitted: false`, `not_emitted_reason: "SEVERITY_POLICY_UNRESOLVED"` |

O **fato** continua detectado, contado e auditável, com identidade lógica calculada.
`construirEvento` foi removido — nenhum código morto.

Testado: nenhum `"info"`, `"low"`, `"medium"`, `"high"` ou `"critical"` aparece na
saída, e o campo `severity` não existe no resultado.

`low_ticket_contract` permanece no enum de `event.schema.json` para quando a política
existir — a única mudança será passar a emitir.

## 13.10 Estado dos dois itens

| Item | Estado |
|---|---|
| Piso de ticket R$ 1.499,99 | **APPROVED** |
| Severidade do low-ticket | **UNRESOLVED** — bloqueia emissão |
| Catálogo D13 | **READY** — 49 unidades carregadas e validadas |

**O Event executivo de low-ticket NÃO está production-ready** enquanto a severidade
não for definida.

## 13.11 Testes

| Suíte | Testes |
|---|---|
| `intelligence/` total | **1.282** (24 arquivos) |
| Catálogo governado + D13 | **76** (era 41) |
| Ticket baixo | **69** (era 62) |
| Harness end-to-end | **45** (era 43) |

## 13.12 Blockers restantes

| # | Critério | Estado |
|---|---|---|
| 1 | Catálogo D13 | **READY** ✅ |
| 2 | `expected_units` | BLOCKED |
| 3 | Thresholds | **PARTIAL** — 5 aprovados; 7 grupos + severidade do low-ticket |
| 4 | Leonardo/Supabase | BLOCKED |
| 5 | Pasta do Lucas | BLOCKED |
| 8 | Briefing determinístico | BLOCKED |
| 9 | Read-model da Hermes | BLOCKED |

**4 blockers** (era 5). O catálogo saiu da lista.

---

# 14. Fase 2.6c — correção dos dois HIGH do gate adversarial

O gate de 2.6c saiu **NO-SHIP** com dois HIGH. Ambos corrigidos aqui. Nenhum
threshold novo foi inventado, nenhuma política de severidade foi decidida.

## 14.1 HIGH 1 — o importador perdia dado em silêncio

**O defeito.** O conversor tratava linha inválida como aviso: registrava a
mensagem, descartava a linha com `continue` e escrevia o JSON com código de
saída zero. Uma célula `Ativo` em branco fazia uma unidade governada sumir do
catálogo de runtime. Lá ela virava `unknown` a cada ingestão — e o validador de
runtime não recupera o que o build step jogou fora. Um catálogo de 48 unidades
saído de uma planilha de 49 é indistinguível, no artefato, de um catálogo
correto de 48.

**A correção.** O pipeline agora é atômico e fecha fechado:

```
ler zip  →  validar cabeçalho  →  validar TODAS as linhas
         →  validar integridade global  →  montar em memória
         →  só então escrever, atomicamente
```

Nada é escrito antes de o conjunto inteiro estar válido. Em erro: cada problema
vai para `stderr`, o processo sai com código 1, e **o artefato governado
anterior não é tocado**.

### Condições FATAIS (a conversão inteira é recusada)

| Condição | Por quê |
| --- | --- |
| Cabeçalho ausente, renomeado, incompleto ou fora de posição | Nomes alternativos não são adivinhados |
| `Unidade` vazia | Não há identidade a governar |
| `Ativo` vazia | Status não é presumido |
| `Ativo` fora de `{Sim, Não}` | Sem conversão implícita para booleano |
| Linha parcialmente preenchida | Alguém escreveu algo e a conversão não sabe o quê |
| Nome curto demais para gerar `unit_id` válido | O id não pode ser sintetizado |
| `unit_id` duplicado (inclusive por normalização) | Escolher o primeiro ou o último é decisão de negócio |
| Identidade canônica duplicada | idem |
| Status contraditório para a mesma unidade | idem |
| Apelido apontando para unidades diferentes | Ambiguidade de origem |
| Apelido colidindo com o canônico de outra unidade | Ambiguidade de origem |
| Membro de agrupamento inexistente | Referência quebrada |
| Agrupamento com menos de duas unidades | Não é agrupamento |
| Arquivo inexistente ou zip inválido | Falha limpa, sem traceback |

Uma linha completamente em branco no fim **não é dado** e é ignorada. Uma linha
parcialmente preenchida é fatal.

### O único aviso que sobrou

`Apelido` idêntico ao nome canônico: descartar essa redundância não perde forma
nenhuma. É a definição operacional do critério — **avisa-se só o que não é
lossy**. Toda condição que descartaria linha, status ou apelido é erro.

### Escrita atômica

`tempfile.mkstemp` no mesmo diretório do destino, `flush` + `fsync`, e
`os.replace`. Como o temporário nasce no mesmo sistema de arquivos, o
`os.replace` é uma troca atômica: o leitor vê o artefato antigo inteiro ou o
novo inteiro, nunca um JSON truncado. Em erro o temporário é removido e o
destino permanece byte a byte igual.

Isso foi observado na prática nesta sessão: uma execução falha contra um caminho
inexistente deixou `catalog/unidades.catalog.json` **byte-identical**.

### O que o importador NÃO faz

Não corrige grafia. `Sâo José do Rio Preto`, `Divinopólis`, `Mogi` e `Jd Angela`
entram no artefato exatamente como estão na planilha. A planilha continua sendo
autoridade de display até decisão humana. Os testes afirmam isso explicitamente,
para que uma "limpeza" futura quebre o build em vez de passar despercebida.

## 14.2 HIGH 2 — a identidade low-ticket dependia do lote

**O defeito.** `identidadeDoAlerta` hasheava o conjunto de **todos** os escopos
governados presentes no lote. Um contrato low-ticket idêntico recebia `event_id`
diferente só porque outro registro, sem relação nenhuma com ele, veio de outro
dataset na mesma execução. Deduplicação por identidade quebra com isso.

**A correção.** A identidade usa apenas o escopo do próprio contrato:

```ts
identidadeDoAlerta(input, escopoDoContrato(escopos, c), c.subject_ref)
```

Material da identidade, sem gramática de delimitador:

```
event_type, rule_id, rule_version,
floor_cents,
period_start, period_end,
subject_ref,
logical_dataset: { source_system, dataset_id }   ← do contrato, e só dele
```

`snapshot_id` fica **fora**: reingerir o mesmo dataset lógico não cria fato novo.
`detected_at` também fica fora, pelo mesmo motivo. Um contrato sem escopo
governado no lote levanta `GatewayError`; nenhuma identidade é inventada.

**Por que lote misto é legítimo aqui.** Cada fato low-ticket é individual: o
alerta descreve um contrato, não uma agregação. Não confundir com A/C/D, onde
agregação sobre múltiplos datasets continua fail-closed — lá o denominador
misturaria universos diferentes.

## 14.3 Testes

| Suíte | Antes | Depois |
| --- | --- | --- |
| `catalog-import.test.ts` (novo) | — | 36 |
| `low-ticket.test.ts` | 69 | 82 |
| A / B / C / D | 164 / 74 / 196 / 147 | inalterados |

Os testes do importador usam planilhas `.xlsx` sintéticas geradas em memória por
`tools/make_test_xlsx.py`. Não dependem do arquivo original — que veio por
WhatsApp e já foi apagado pelo app. O artefato governado em uso continua sendo o
derivado dele, e um teste afirma sua forma (49 unidades, 44 ativas, 5 inativas,
2 agrupamentos) e as grafias originais.

**Mutação (obrigatória no briefing).** Ambos os mutantes morreram:

| Mutante | Testes que falharam |
| --- | --- |
| `invalid row -> warning + continue` | 15 |
| identity com todos os escopos do lote | 2 (§11-A e §11-C) |

## 14.4 O que continua sem decisão

A correção é de engenharia. Nada aqui aprova política:

- **severidade low-ticket:** UNRESOLVED. `event = null`, `emitted = false`,
  `not_emitted_reason = "SEVERITY_POLICY_UNRESOLVED"`. O fato sobrevive; o Event
  executivo não. Low-ticket **não** é production-ready como alerta executivo.
- **piso low-ticket:** APPROVED em 149.999 centavos, estritamente menor,
  independente do piso de materialidade de R$ 50.000.
- **`expected_units`:** ainda sem fonte.

---

# 15. Proveniência do catálogo e prova de reprodutibilidade

## 15.1 Localização durável

O source do catálogo governado passa a viver dentro do repositório:

```
intelligence/governance/source/UNIDADES.xlsx
```

Antes ele estava numa pasta temporária do WhatsApp, que o app apagou. Um
artefato governado cujo source não pode ser reapresentado não é auditável.

| | |
| --- | --- |
| Arquivo | `intelligence/governance/source/UNIDADES.xlsx` |
| Tamanho | 10.400 bytes |
| Planilha | `Planilha1` (única) |
| Colunas | `Unidade`, `Apelido`, `Ativo` |
| SHA-256 | `fd8c7e001ea2b36da41bd071923df1fb50ef0a7fc69de2c5e19cebc6118a1409` |

Hash calculado com `shasum -a 256`, primitiva do sistema. Nenhum mecanismo
criptográfico próprio foi construído.

## 15.2 O que a reprodução prova — e o que não prova

**Afirmação permitida:** este source durável, SHA-256 `fd8c7e00…a1409`,
reproduz o catálogo governado atual.

**Afirmação NÃO permitida:** que este arquivo é o mesmo binário que chegou pelo
WhatsApp. O original foi apagado antes que qualquer hash fosse registrado, então
não existe evidência de identidade binária histórica. O que existe é evidência
de **equivalência para o pipeline governado atual** — mais fraca, e suficiente
para reprodutibilidade daqui em diante.

## 15.3 Reconversão executada

```
python3 tools/xlsx_to_catalog.py \
  governance/source/UNIDADES.xlsx \
  <destino temporário>
```

Exit code `0`. O destino foi um diretório temporário: o artefato governado não
foi substituído antes da comparação, e permaneceu com SHA-256
`3ee286aea264ad0180acdea1c9f518a2170a9457fe1f5c8a74702c073cfafc9d` do início ao
fim do procedimento.

Valores **derivados do arquivo** pelo importador — não fornecidos a ele:

```
unidades: 49 (ativas 44, inativas 5)
aliases:  5
grupos:   2
  'Carpina e Limoeiro'          → ['carpina', 'limoeiro']
  'Limeira, Sumaré & JD Ângela' → ['jd_angela', 'limeira', 'sumare']
AVISO (não lossy): linha 32 (Prudente): Apelido igual ao canônico — redundante
```

## 15.4 Comparação: **SEMANTICALLY_IDENTICAL**

**A. Contagens** — idênticas: 49 unidades, 44 ativas, 5 inativas, 5 aliases,
2 agrupamentos, dos dois lados.

**B. Conteúdo semântico** — idêntico. Comparando a tupla governada de cada
unidade (`unit_id`, `canonical_name`, `status`, `aliases` ordenados) e de cada
agrupamento (`label`, `members` ordenados): nenhuma unidade, status, alias,
identidade ou associação de grupo diferiu. `catalog_version`, `columns` e
`source_file` também iguais.

**C. Bytes** — diferem em 72 bytes, num único campo:

```diff
-  "warnings": []
+  "warnings": [
+    "linha 32 (Prudente): Apelido igual ao canônico — redundante"
+  ]
```

### Por que essa diferença não é divergência

A causa é uma mudança **no conversor**, não no source. O artefato atual foi
gerado pela versão anterior do importador, cujos avisos cobriam apenas as duas
condições *lossy* — linha descartada e `Ativo` não reconhecido — que a correção
do HIGH 1 transformou em erros fatais. Aquela versão não tinha aviso algum para
apelido redundante, então produziu `warnings: []`. A versão atual emite
exatamente um aviso, e é o único aviso não-lossy que sobrou.

Dois pontos que isso estabelece de passagem:

1. `warnings: []` na geração original é evidência de que **nenhuma linha foi
   descartada em silêncio** naquela execução — o defeito do HIGH 1 existia, mas
   não chegou a corromper este artefato. É por isso que o dado governado bate.
2. `warnings` é diagnóstico, não dado governado. `buildGovernedCatalog` lê
   apenas `units` (`unit_id`, `canonical_name`, `aliases`, `status`), `groups`
   (`label`, `members`) e `catalog_version`. Nunca lê `warnings`, `columns` ou
   `source_file`. O catálogo efetivo em runtime é bit a bit o mesmo dos dois
   artefatos.

## 15.5 Testes

219 testes verdes em `catalog-import` (36), `unit-catalog` (76),
`canonical-units` e `integration` (45). O catálogo governado permaneceu intacto
durante toda a comparação.

## 15.6 Regeneração — autorizada e realizada

A substituição foi autorizada pelo arquiteto após a comparação
**SEMANTICALLY_IDENTICAL** da §15.4, e executada. O artefato governado em
`catalog/unidades.catalog.json` **passa a ser produto do importador fail-closed**,
gerado a partir de `governance/source/UNIDADES.xlsx`.

A afirmação de proveniência continua sendo a da §15.2: este source durável
reproduz e gera o catálogo governado atual. Nada aqui afirma identidade binária
com o arquivo temporário do WhatsApp.

### Portão aplicado antes da escrita

A regeneração não foi feita direto sobre o destino. Primeiro o candidato foi
gerado num temporário e comparado contra o artefato vigente, com uma única
diferença autorizada — o warning de apelido redundante. Qualquer outra diferença
abortaria sem tocar no destino. O portão passou; só então o importador rodou
contra o destino real, usando o mesmo caminho atômico
(`validar tudo → montar em memória → temp → fsync → os.replace`). Nenhum JSON foi
editado à mão.

| | SHA-256 |
| --- | --- |
| Source `UNIDADES.xlsx` | `fd8c7e001ea2b36da41bd071923df1fb50ef0a7fc69de2c5e19cebc6118a1409` |
| Catálogo anterior | `3ee286aea264ad0180acdea1c9f518a2170a9457fe1f5c8a74702c073cfafc9d` |
| Catálogo novo | `5dbd1382fc29251cd5a5f9729f017b4c7f4a8284f7fdba900079344f43fae6ad` |

A mudança de hash do JSON decorre **exclusivamente** do warning diagnóstico
acrescentado — foi a única diferença, verificada campo a campo antes e por `diff`
depois. O dado governado é bit a bit o mesmo.

## 15.7 Defeito encontrado pela própria regeneração: modo do arquivo

A primeira regeneração deixou o artefato com modo `0600` em vez de `0644`.

Causa: `tempfile.mkstemp` cria com `0600` por segurança, e `os.replace` leva o
modo do temporário junto para o destino. Ou seja — a escrita atômica que a
correção do HIGH 1 introduziu trocava, em silêncio, a permissão de um artefato
versionado. Um catálogo `0600` some do build de qualquer outro usuário ou
processo de CI, e some com erro de I/O, não com erro de validação.

Corrigido em `escrever_atomico`: o temporário recebe o modo do destino quando ele
já existe, e o padrão do `umask` quando é arquivo novo. Verificado nos três
casos — destino pré-existente `0644`, segunda regeneração seguida, e destino
inexistente. Todos `0644`.

Vale registrar como o defeito apareceu: não foi um teste que o pegou, foi o `ls`
da verificação pós-escrita. A suíte do importador afirmava conteúdo e
atomicidade, não metadados do sistema de arquivos. Essa lacuna foi fechada:

| Caso | Afirma |
| --- | --- |
| A | destino `0644` continua `0644` depois do replace |
| B | o modo herdado é o do destino — testado com `0640`, `0600` e `0664` |
| C | destino novo respeita o padrão do processo, não o `0600` do `mkstemp` |
| C′ | guarda contra umask restritivo, para o caso C não passar vazio |
| D | conversão que falha não muda bytes **nem** modo, e não deixa temporário |
| — | regenerações consecutivas preservam o modo |
| — | o artefato governado em uso não está `0600` |

O caso C compara contra um arquivo de controle escrito no mesmo diretório e no
mesmo processo, em vez de fixar um número. É o próprio padrão do umask, então o
teste vale em qualquer ambiente sem depender de API de umask.

**Mutação.** Remover a herança de modo e voltar ao `mkstemp` + `replace` puro
mata 5 desses testes. Um segundo mutante — trocar a herança por `0644` fixo —
mata exatamente um: o caso B, que é o único que alega distinguir herança de
constante. O caso D sobrevive aos dois, como deve: ele cobre o caminho de falha,
que nunca chega ao `replace`.

## 15.8 Verificação pós-substituição

O `GOVERNED_UNIT_CATALOG` foi carregado pelo runtime a partir do novo artefato e
confirmou, lendo o próprio objeto em memória:

- SHA-256 do arquivo que o runtime abre: `5dbd1382…fae6ad`
- 49 unidades · 44 ativas · 5 inativas · 5 aliases · 2 agrupamentos
- D13: `BelfordRoxo`→`belford_roxo`, `Maracanau`→`maracanau`,
  `Presidente P.`→`prudente`, `STA Cruz`→`santa_cruz`,
  `Rio Preto`→`sao_jose_do_rio_preto`, `Jardim Ângela`→`jd_angela`,
  `Grau Marabá`→`maraba`
- `Jd Angela` **resolve** para `jd_angela` com `status: inactive` — inativa não
  vira `unknown`
- `Carpina e Limoeiro` → `ambiguous` / `GROUP_LABEL` com `[carpina, limoeiro]`;
  `Limeira, Sumaré & JD Ângela` → `ambiguous` / `GROUP_LABEL` com
  `[jd_angela, limeira, sumare]` — agrupamento continua não atômico
- `carpina`, `limoeiro`, `limeira`, `sumare`, `jd_angela` seguem distintas

`npm run verify` completo: schemas, lint, typecheck e **1331 testes em 25
arquivos**, todos verdes.

---

# 16. A segunda fonte de governança escondida em TypeScript

O gate final da 2.6c saiu NO-SHIP com um HIGH que os anteriores não pegaram.

## 16.1 O defeito

`buildGovernedCatalog` acrescentava aliases de um `ALIASES_GOVERNADOS` escrito em
TypeScript, **depois** de carregar o artefato:

```ts
const extras = ALIASES_GOVERNADOS[u.unit_id] ?? []
aliases: [...u.aliases, ...extras]
```

O artefato tinha 5 aliases; o runtime expunha 8. Três decisões humanas —
`Presidente P.`, `BelfordRoxo`, `Rio Preto` — viviam só em código.

Consequências:

- `UNIDADES.xlsx → catálogo` **não reproduzia** o comportamento efetivo. Toda a
  prova de reprodutibilidade da §15 valia para o artefato, não para o runtime.
- As três decisões não podiam ser auditadas, revisadas ou removidas pelo caminho
  governado: quem as mudasse editaria TypeScript, sem hash e sem versão de fonte.
- A afirmação "fonte única de verdade para D13" era falsa. Eram duas, e a segunda
  era invisível para quem olhasse a planilha.

Vale notar como escapou: os testes verificavam que `BelfordRoxo` resolve para
`belford_roxo`. Resolvia. O que ninguém afirmava é **de onde** o alias vinha.

## 16.2 Duas fontes governadas, explícitas

| Fonte | Papel |
| --- | --- |
| `governance/source/UNIDADES.xlsx` | catálogo operacional; autoridade de nome canônico e status |
| `governance/d13.alias-overrides.json` | decisões humanas de canonicalização aprovadas |

O arquivo de overrides tem schema fechado e validável:

```json
{
  "schema_version": "1.0.0",
  "aliases": [
    { "alias": "Presidente P.", "target_unit_id": "prudente", "rationale": "...", "approved_in": "FASE_2_6B" }
  ]
}
```

`rationale` e `approved_in` carregam o rastro que antes vivia em comentário de
código. Nenhum alias novo foi inventado: são exatamente os três que existiam.

## 16.3 Pipeline

```
parse XLSX  →  validar todas as linhas  →  catálogo base
            →  parse overrides governados  →  validar contra o catálogo base
            →  mesclar EM MEMÓRIA
            →  integridade global
            →  artefato completo  →  publicação atômica
```

Os overrides entram **antes** da integridade global de propósito: alias apontando
para duas unidades e alias colidindo com canônico já eram checados ali, e um
alias humano precisa passar pelas mesmas guardas que um alias da planilha. Reusar
a guarda em vez de duplicá-la é o que garante que as duas fontes sejam tratadas
com o mesmo rigor.

### Condições fatais próprias dos overrides

`schema_version` não suportada ou ausente · `aliases` ausente ou de tipo errado ·
entrada que não é objeto · `alias` vazio/não textual · `target_unit_id`
vazio/não textual · alias declarado duas vezes (mesmo com alvos iguais) ·
`target_unit_id` inexistente no catálogo da planilha · alias que é rótulo de
agrupamento · `target_unit_id` que é rótulo de agrupamento · JSON malformado ·
arquivo ausente.

A recusa do rótulo de agrupamento compara por identidade normalizada, não por
texto: `carpina  e  limoeiro` é recusado igual a `Carpina e Limoeiro`. Decisão
humana não transforma agrupamento comercial em unidade.

## 16.4 O runtime virou projeção

`ALIASES_GOVERNADOS` foi removido. `buildGovernedCatalog` copia o artefato e não
acrescenta nada. A invariante que substituiu aquilo, afirmada diretamente por
teste:

> os aliases efetivos em runtime são exatamente os aliases do artefato — nenhum a
> mais, nenhum a menos, nenhum alvo alterado.

O loader pode construir `Map`/`Set`; não pode criar dado governado. Um teste
adicional passa um artefato sintético sem aliases por `buildGovernedCatalog` e
exige que ele saia sem aliases — se houvesse enxerto por `unit_id`, `prudente`
voltaria com `Presidente P.` ali.

## 16.5 Proveniência no artefato

```json
"importer_version": "2.0.0",
"sources": [
  { "role": "workbook", "file": "UNIDADES.xlsx",
    "sha256": "fd8c7e001ea2b36da41bd071923df1fb50ef0a7fc69de2c5e19cebc6118a1409" },
  { "role": "alias_overrides", "file": "d13.alias-overrides.json",
    "sha256": "b80a7d81e50aa94541f3ecd5ec8b1979f6a7eca53d06defcf7c2f72af4a67c4e",
    "alias_count": 3 }
]
```

O campo `source_file` foi substituído: havia duas fontes e uma só representação.
Hashes por `hashlib`, primitiva da stdlib. Nenhum hash é usado como `UnitId`.

## 16.6 Diff autorizado do artefato

`5dbd1382…fae6ad` → `0e518196…836f0f`. Exatamente três aliases e a proveniência:

```diff
-  "source_file": "UNIDADES.xlsx",
+  "importer_version": "2.0.0",
+  "sources": [ … workbook + alias_overrides com sha256 … ],
-      "aliases": [],            (belford_roxo)
+      "aliases": [ "BelfordRoxo" ],
-      "aliases": [],            (prudente)
+      "aliases": [ "Presidente P." ],
-      "aliases": [],            (sao_jose_do_rio_preto)
+      "aliases": [ "Rio Preto" ],
```

Nenhuma unidade, status, agrupamento ou nome canônico mudou. Estado derivado:
**49 unidades · 44 ativas · 5 inativas · 8 aliases efetivos · 2 agrupamentos**.
Os 8 são derivados — um teste calcula `daPlanilha + doOverride` e compara, em vez
de afirmar o número.

O `UNIDADES.xlsx` permanece com SHA-256 `fd8c7e00…a1409`. O importador nunca
escreve na fonte.

## 16.7 Mutação

| Mutante | Testes mortos |
| --- | --- |
| reintroduzir alias em runtime fora do artefato | 3 (projeção exata) |
| ignorar `d13.alias-overrides.json` no build | 8 no importador; e regenerando o artefato real, mais 5 em D13 — `BelfordRoxo`, `Presidente P.` e a origem dos três aliases |
| `target_unit_id` inexistente vira aviso | 2 (fail-closed + atomicidade) |

## 16.8 Um defeito no meu próprio teste

O teste de determinismo gerava **dois** `.xlsx` com o mesmo conteúdo lógico e
exigia artefatos byte-idênticos. Passava antes; passou a falhar quando a
proveniência entrou — um `.xlsx` é um zip, e o zip embute timestamp, então os
dois arquivos nunca tiveram os mesmos bytes.

A falha estava certa. O teste é que afirmava a coisa errada: "mesmo conteúdo
lógico" nunca foi a garantia, e agora que o artefato registra a identidade da
fonte, dois arquivos distintos **devem** produzir artefatos distintos. Foi
separado em três afirmações honestas — a mesma fonte dá bytes idênticos; fontes
distintas de mesmo conteúdo dão o mesmo dado governado (comparado sem `sources`);
e uma fonte diferente muda o hash registrado.

## 16.9 Estado

`npm run verify`: **1374 testes / 25 arquivos**. A/B/C/D em 164 / 74 / 196 / 147,
sem regressão. Portal `tsc` limpo, 182 testes do motor CEO verdes.

Não existe segunda fonte de governança em TypeScript. `grep` por
`ALIASES_GOVERNADOS`, `APPROVED_UNIT_CATALOG` e `APPROVED_UNIT_ROWS` só encontra
os testes que afirmam a ausência delas e o comentário que explica a remoção.

Low-ticket permanece intocado: severidade **UNRESOLVED**, `event = null`,
`not_emitted_reason = "SEVERITY_POLICY_UNRESOLVED"`.
