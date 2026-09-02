# Fase 2.13 — prazo de assinatura/emissão do contrato

```
FONTE                     Novos Alunos - {Mês} · aba "Status Contratos"
CAMPO SEMÂNTICO           contract_signature_deadline
HEADER REAL               Desembolso
TIPO SUBJACENTE           data real do Google Sheets (serial), tipo DATE exigido
LEITURA                   UMA observação atômica (includeGridData)
EXIBIÇÃO                  dd/mm  — sem ano
ANO                       DA FONTE. Nunca inferido.
CALENDÁRIO                dias corridos, America/Sao_Paulo
P  D-4                    P_SIGNATURE_DEADLINE_ATTENTION
A  D-1                    A_EMISSION_DEADLINE_ALERT
D0                        CONTRACT_DEADLINE_MISSED
D+1 em diante             AUTO_CANCELLED_BY_DEADLINE → recuperação a investigar
SOURCE STATUS             NUNCA reescrito
RUNTIME                   npm run lucas:analyze --prefix intelligence
```

## 1. Os dois `Status`, e o incidente que precedeu a fase

A fonte real passou a ter **duas colunas chamadas `Status`**: uma com datas e `PG`,
outra com `A`/`C`/`E`/`P`. `buildHeaderMap` recusou mapear o campo — corretamente, é o
que ele existe para fazer — e o Lucas inteiro virou:

```
invalid_source / DUPLICATED_HEADER_FIELD
```

Zero contratos, em produção, silenciosamente. Nenhuma fixture tinha a forma real, então
nenhum teste viu.

O dono da fonte renomeou a primeira para **`Status Pagamento`**. Esta fase declara o
nome como campo conhecido (`KNOWN_EXTRA`), e `comparableHeader("Status Pagamento")` é
distinto de `"status"` — então `contract_status` volta a mapear por header único.

**`Status Pagamento` NÃO é alias de `contract_status`.** Nenhuma semântica de negócio
lhe foi atribuída nesta fase. Um teste prova a negativa por mutação: uma grade que só
tenha `Status Pagamento` deixa `status` em `required_missing`. Se fosse alias, o
A/C/E/P viria da coluna de pagamento e a população comercial seria montada a partir de
datas e `PG`.

A proteção global contra header duplicado **não foi enfraquecida**: duas colunas com o
mesmo nome continuam recusadas, e há teste afirmando isso.

## 2. `Desembolso` é o prazo — e a legenda não manda

A célula, inspecionada diretamente:

```
formattedValue        "26/08"
userEnteredValue      numberValue = 46260
effectiveValue        numberValue = 46260
numberFormat          type = DATE, pattern = dd/mm
```

**O ano existe na célula. Não existe no texto exibido.** É a fase inteira.

A planilha traz uma legenda: *"Cancelado (1 dia antes a data do primeiro vencimento se
não estiver assinado)"* — isto é, `Venc − 1`. Em 29 das 30 linhas observadas
`Desembolso` é exatamente `Venc − 1`.

**Em uma linha não é:** `Venc 15/08`, `Desembolso 13/08`.

A decisão governada é **C1 — vale o valor explícito da LINHA**. A legenda é texto geral
e não sobrepõe um campo que a fonte preencheu contrato por contrato. Aquela linha vale
13/08, e reescrevê-la para 14/08 seria corrigir a fonte.

**Não existe fallback para `Venc`**, e o caminho não foi escrito: `resolveDeadline` não
tem parâmetro por onde `Venc`, `first_due_date`, data de pagamento ou `modifiedTime`
possam entrar.

## 3. O ano vem do serial, e o texto não tem caminho

`resolveDeadline` recebe a **célula observada** — valor efetivo e tipo, juntos — e nunca
o texto exibido. Recusa, por decisão:

| entrada | motivo |
| --- | --- |
| célula sem valor efetivo | é texto; o ano viria de uma invenção |
| valor efetivo fracionário | carrega hora, e prazo é data — truncar escolheria o dia |
| serial < 61 | região do bug de 29/02/1900 do sistema 1900 |
| tipo diferente de `DATE` | ver §4a |

O epoch é `serial 0 = 1899-12-30`, **derivado e não digitado**: a constante é calculada
pela mesma álgebra de calendário, e um teste afirma que ela reproduz os seriais REAIS
da fonte — `46260 → 2026-08-26`, `46261 → 2026-08-27`, `46247 → 2026-08-13`.

### O caso que a inferência erraria

Prazo `05/01` num arquivo de agosto. Inferindo o ano pelo período: `2026-01-05`, onze
meses no passado, e o contrato apareceria como cancelado há muito. Pelo serial:
`2027-01-05`. Há teste.

## 4. Uma observação atômica

O adaptador lia com `FORMATTED_VALUE`, e o contrato comercial inteiro foi medido contra
essa representação: `R$ 8.151,60`, `25%`, `087.731.554-03`. Trocar a leitura global
quebraria dinheiro, percentual, CPF e `Venc` de uma vez.

A primeira tentativa foi uma segunda leitura com `UNFORMATTED_VALUE`. **O gate a
recusou, com razão**, e o motivo é o pior tipo de defeito — silencioso e sobre a pessoa
errada:

```
leitura 1 (formatada) conclui
alguém reordena a planilha
leitura 2 (subjacente) conclui
a contagem de linhas coincide
→ o prazo de um contrato é anexado a OUTRO aluno
```

Conferir o número de linhas não fecha isso: uma reordenação, ou uma inserção compensada
por uma remoção, preserva a contagem. O resultado seria alerta de prazo perdido, ou
auto-cancelamento, sobre o contrato errado.

### A correção

```
spreadsheets.get?fields=sheets.properties.title       METADADO só
spreadsheets.get?includeGridData&ranges=<aba>         o CONTEÚDO, atômico
```

`includeGridData` devolve, **na mesma célula da mesma resposta**, o valor exibido, o
valor efetivo e o tipo de formato:

```
formattedValue                       "26/08"
effectiveValue.numberValue           46260
effectiveFormat.numberFormat.type    DATE
```

A associação linha↔prazo passou a ser **intrínseca ao dado**, não uma junção que nós
fazemos. A corrida deixou de ser expressável, não apenas de estar improvável.

A primeira chamada é metadado puro — existe para distinguir `sheet_not_found` de falha
de API, não devolve conteúdo de linha nenhuma e por isso não pode dessincronizar com a
segunda. Total: **3 chamadas**, uma delas de conteúdo.

`fields` é estreito de propósito: três campos por célula. `includeGridData` sem `fields`
traria formatação, bordas, notas, validações e fórmulas — resposta enorme e exposição
desnecessária de uma fonte que contém CPF e nome.

### A porta não expõe metade da célula

`readSheet` e `readSheetUnderlying` **não existem mais**. `LucasDrivePort` tem
`listCandidates` e `observeSheet`, e nada que devolva só os valores exibidos ou só os
subjacentes. É a mesma escolha da porta somente-leitura: capacidade ausente vale mais
que revisão de código, porque revisão vale até o próximo commit.

Os parsers legados consomem a **projeção formatada** da mesma observação —
`formattedGrid(obs)`. O que mudou é de onde ela vem, não o que ela contém.

### Alinhamento de linha

O filtro de linha vazia (o rodapé em branco que toda planilha tem) roda sobre as
**células**, então formatado e tipado saem juntos: não há índice para um lado reindexar
sem o outro. A mutação que emparelhava depois do filtro, na arquitetura anterior,
produzia `['2026-08-21', null, '2026-08-22']` — o segundo perdia o prazo, o terceiro
herdava o do vizinho. Hoje o defeito não tem onde morar.

O `content_hash` é calculado sobre as linhas formatadas **mais** o compromisso de prazo
(§4b).

## 4a. Só célula tipada `DATE` é prazo

`UNFORMATTED_VALUE` devolvia o número e **não o tipo**. Qualquer inteiro na faixa de
serial válido virava data — então `46260` digitado por engano numa coluna de contagem
produziria o prazo `2026-08-26`, plausível e falso, com alerta ou auto-cancelamento
sobre um contrato real.

A inspeção que provou que hoje as células são `DATE` **não é contrato**: ela não diz
nada sobre a célula que alguém vai preencher no mês que vem.

O runtime agora exige, célula por célula:

```
effectiveValue.numberValue          presente e finito
effectiveFormat.numberFormat.type   === "DATE"
```

| célula | resultado |
| --- | --- |
| `46260` tipado `DATE` | `2026-08-26` |
| `46260` tipado `NUMBER` | `DEADLINE_NOT_DATE_TYPED` |
| `46260` sem tipo na resposta | `DEADLINE_NOT_DATE_TYPED` |
| texto `"26/08"`, sem valor efetivo | `DEADLINE_NOT_A_SOURCE_DATE` |
| `46260.5` tipado `DATE` | `DEADLINE_NOT_A_SOURCE_DATE` |

`DEADLINE_NOT_DATE_TYPED` é razão própria, não colapsada em `NOT_A_SOURCE_DATE`, porque
a ação é diferente: aqui alguém digitou um número numa coluna de data, e a correção é na
planilha.

O `pattern` **não** é exigido. `DATE` mais valor numérico é a prova semântica; uma
mudança de formato visual de `dd/mm` para `dd/mm/yyyy` não invalida um prazo válido.

## 4b. O compromisso de conteúdo inclui o prazo

`content_hash` é o compromisso semântico da captura — é o que dá idempotência de
ingestão, e é dele que `snapshot_id` deriva, e do snapshot derivam as evidências.

Ele cobria só os valores **exibidos**. O prazo governado vem do valor efetivo. Logo:

```
planilha A    exibe "26/08"    serial 46260   → prazo 2026-08-26
planilha B    exibe "26/08"    serial 46625   → prazo 2027-08-26

mesmo content_hash · mesmo snapshot_id · mesmas evidências
```

Um único snapshot sustentando fatos de prazo incompatíveis. Isso quebra replay,
auditabilidade e a própria noção de identidade de captura.

O material canônico agora carrega, por linha, a face de prazo da célula:

```
kind               absent | non_numeric | numeric
number_value       o serial
number_format_type DATE, NUMBER, …
```

O valor **exibido** não entra aqui — já está no material das linhas formatadas, e
duplicá-lo tornaria o hash sensível a uma mudança de formato visual que não altera fato
nenhum. `kind` existe para que "coluna ausente no mês" e "célula sem valor numérico" não
colapsem na mesma string: são estados de fonte diferentes.

`CONTENT_HASH_VERSION` foi para **2.0.0**. A consequência é assumida e é o motivo do
major: todo `content_hash` anterior muda, uma releitura reingere uma vez, e passa a
comprometer o que de fato determina os fatos.

Testes afirmam as três direções: mesma exibição com ano diferente → hash diferente;
mesmo serial com tipo `DATE` vs `NUMBER` → hash diferente; conteúdo idêntico → hash
idêntico, para que a idempotência não seja o preço da correção.

## 5. A regra, em dias corridos

```
D = Desembolso da linha

P   antes de D-4        só PENDING_STUDENT_SIGNATURE
P   D-4 até D-1         + P_SIGNATURE_DEADLINE_ATTENTION      atenção total
A   antes de D-1        só AWAITING_CREDITUM_SIGNATURE
A   D-1                 + A_EMISSION_DEADLINE_ALERT
P/A D0                  CONTRACT_DEADLINE_MISSED               "o contrato caiu"
P/A D+1 em diante       AUTO_CANCELLED_BY_DEADLINE             → recuperação
E   qualquer            nenhum fato de prazo
C   da fonte            nenhum fato de prazo, proveniência própria
```

**Dias corridos, nunca dias úteis.** Sem sábado, domingo ou feriado especial. A
asserção que discrimina: prazo na segunda 31/08, D-4 é a quinta 27/08. Contando dias
úteis seria a terça 25/08 — e o teste afirma que 25/08 está **fora** da janela.

A janela de `A` é **só D-1**. Em D-4 um `A` não alerta, ao contrário de `P` — o gargalo
é interno desde que virou `A`, mas o prazo só aperta na véspera.

Severidade: `null` com `SEVERITY_POLICY_UNRESOLVED`, como os fatos de `A`/`P` da 2.12.
"Atenção total" é o estado operacional que Stefano definiu, e **não** foi traduzido
para `severity: critical` — o vocabulário canônico de severidade representa outra coisa,
e nenhuma política governada cobre este tipo de evento.

## 6. Estado da fonte × estado derivado

Constitucional na fase:

```
source_status            P                              o que a fonte afirma
derived_deadline_state   AUTO_CANCELLED_BY_DEADLINE     o que a regra deriva
```

Os dois coexistem, sempre. `P`/`A` **nunca** é reescrito para `C`. A fonte pode estar
atrasada em relação à regra operacional, e essa divergência é auditável só porque os
dois campos viajam juntos. Um campo só obrigaria escolher entre "a planilha não foi
atualizada" e "o contrato caiu", e as duas são verdade.

`C` da fonte tem **proveniência diferente** e não passa por prazo: afirmar que caiu por
prazo, sem evidência histórica do caminho causal, seria inventar a causa.

## 7. Recuperação

```
AUTO_CANCELLED_BY_DEADLINE  →  RECOVERY_OPPORTUNITY_TO_INVESTIGATE
```

O repositório **não tinha** contrato de churn/recovery para reutilizar — verifiquei
antes de nomear, e a busca voltou vazia. O nome escolhido carrega a dúvida no próprio
identificador: candidato a **investigação** de recontratação.

Não afirma recuperável, não afirma que volta, não afirma venda. Um teste afirma que a
constante não contém `RECOVERABLE` nem `WILL`.

D0 ainda **não** é candidato: caiu hoje, não foi cancelado.

## 8. Ausente ou inválido não é ausência de urgência

Quatro razões distintas, e a distinção é o ponto:

```
DEADLINE_COLUMN_ABSENT            característica do MÊS
DEADLINE_MISSING                  característica do CONTRATO (célula vazia)
DEADLINE_NOT_A_SOURCE_DATE        conteúdo não é serial suportado
DEADLINE_UNDERLYING_UNAVAILABLE   a segunda leitura não respondeu
```

Nenhuma delas produz fato de prazo. E `not_evaluable` é **distinguível** de "sem
alerta" — o Hermes futuro precisa agir diferente: no primeiro caso não há nada a fazer,
no segundo alguém tem de olhar a planilha. O relatório do comando expõe
`not_evaluable_count` separado das contagens de fato exatamente por isso.

`Desembolso` é `OPTIONAL` no mapeamento, não `REQUIRED`: um mês sem a coluna continua
sendo a fonte do Lucas, com população comercial válida. Torná-la obrigatória faria o
arquivo virar `invalid_source` e apagaria os fatos de `A`/`P`.

## 9. Header, nunca posição

`Desembolso` é a coluna **R** no cabeçalho real de hoje (19 colunas) e **Q** na fixture
de agosto anterior (18). O mesmo código serve as duas, o que só é possível sem índice
fixo. Teste adversarial: inserir uma coluna antes de `Desembolso` desloca a posição
física e o mapeamento continua correto — e a coluna nova aparece em `unknown_headers`,
visível, não silenciosa.

## 10. Runtime

Integrado na orquestração existente. Nenhum segundo CLI, nenhum cron, nenhum scheduler.

```
npm run lucas:analyze --prefix intelligence
```

O prazo é calculado **antes de D e fora do caminho dele**, junto dos fatos de `A`/`P`.
Um sujeito repetido impede D e não tem relação com prazo de assinatura — se o prazo
morasse atrás do sucesso de D, um contrato caindo hoje ficaria invisível por causa de um
CPF duplicado em outra linha.

A data de avaliação é resolvida **uma vez** por execução, do mesmo relógio injetado que
resolve o período, e desce por parâmetro. Duas leituras de relógio na mesma análise
poriam contratos em lados diferentes da fronteira D0/D+1.

Fuso: `America/Sao_Paulo`. Às 22:00 de 31/08 em São Paulo já é 01/09 em UTC, e um prazo
em 31/08 apareceria como perdido por diferença de fuso. Há teste.

### Saída do comando

Contagens e a data de avaliação. Nada mais:

```
evaluation_date · p_deadline_attention_count · a_emission_deadline_alert_count
deadline_missed_count · auto_cancelled_by_deadline_count
recovery_candidate_count · not_evaluable_count
```

Nenhum `subject_ref`, nenhum prazo individual, nenhum `row_number`, nenhum
`ticket_cents`. O detalhe por contrato existe no objeto devolvido para quem consome
programaticamente; o log operacional não precisa dele, e um log é o lugar menos
protegido do sistema. Teste varre o relatório serializado afirmando as ausências.

## 11. Uma autoridade de calendário

A aritmética civil foi adicionada em `detectors/src/civil-date.ts`, que já é o módulo de
calendário do repositório. Um segundo lugar que soubesse somar dias civis seria uma
segunda autoridade, e a que estivesse errada só apareceria no dia em que as duas
discordassem sobre 29 de fevereiro.

`source-time.ts` tem uma cópia privada de `days_from_civil` para o `SourceInstant`, e é
área SHIP que esta fase não abre. Em vez de confiar, um teste **afirma que as duas
concordam** sobre 1970, 1999, 2000, 29/02/2000, 2026, 2028 e 2100. Unificá-las é
trabalho de uma fase futura, com o risco já contido.

Nada usa `Date.parse`, `new Date(serial)`, milissegundos ou duração de 24h.

## 12. Evidência

Cada fato de prazo carrega proveniência suficiente para reconstruir a computação, pelo
pipeline canônico da 2.11:

```
period · snapshot_id · evidence_refs · subject_ref (pseudônimo governado)
source_status · deadline · evaluation_date · offset_days
```

`ticket_cents` **não** está no fato, ao contrário dos de `A`/`P`: prazo é fato temporal,
e anexar valor convidaria a priorizar por dinheiro dentro desta camada. Priorização
executiva pertence ao briefing.

Nenhum nome, nenhum CPF. Nenhum `PriorityScore` novo, nenhum limiar monetário novo,
nenhuma severidade nova.

## 13. Fora de escopo, e o que ficou aberto

Não implementados nesta fase: Hermes, Aros, `ExecutiveBriefingV1`,
`HermesReadModelV1`, browser automation, publicação, scheduler, Detector B, Detector C.

Detector D **intocado** — matemática, identidade, população e semântica.

### `FUTURE_REVIEW: VENC_UNDERLYING_DATE_AVAILABLE`

A inspeção direta indica que as células de `Venc` **também** são datas reais do Sheets
formatadas como `dd/mm`. Se for o caso, `FIRST_DUE_DATE_INCOMPLETE` e o adiamento do
Detector C podem ser artefato do modo de leitura (`FORMATTED_VALUE`), não característica
da fonte.

**Não afirmo que são.** A semântica de `Venc` não foi alterada nesta fase e o Detector C
segue deferido. Fica registrado como revisão futura, separada, com o mesmo rigor: a
evidência que sustenta o gap tem a mesma origem que esta fase descobriu ser ambígua.

### Audiências futuras

Estes fatos pertencem naturalmente a `EXECUTIVE_STEFANO` e `COMMERCIAL_LUCAS`. Não a
`FINANCE_LEONARDO`, salvo contexto transversal que ainda não existe.
