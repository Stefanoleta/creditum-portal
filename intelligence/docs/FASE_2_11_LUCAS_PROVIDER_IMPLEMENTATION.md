# Fase 2.11 — provider da fonte mensal do Lucas

```
PROVIDER                    implemented
OFFICIAL FOLDER             16e7ABSA6SQnBAkgMtSOFYhPK171For2v
SOURCE                      Novos Alunos - {Mês} / Status Contratos
PERIOD SELECTION            explícito, AAAA-MM
DRIVE AUTH MODE             service account (porta injetada; fail closed sem credencial)
NO FILE                     DATA_NOT_AVAILABLE
DUPLICATE FILE              seleção determinística + DUPLICATE_SOURCE_WARNING
SELECTION RULE              LATEST_MODIFIED_THEN_STABLE_FILE_ID
SCHEMA                      HEADER-BASED
DATASET_ID                  lucas_status_contratos_mensal
IDENTITY                    CPF + period
MISSING CPF                 IDENTITY_MISSING
UNIT                        raw label preservado + UnitId interno
TICKET                      coluna oficial da fonte
DISCOUNT_BPS                coluna `%`
VENC                        raw preservado, 5 estados
DETECTOR A                  integrated
LOW_TICKET                  integrated
DETECTOR C                  deferred — EXCLUSION_VOCABULARY_LOSSY
DETECTOR D                  deferred — decisão de população pendente
DETECTOR B                  não integrado
EXPECTED_UNITS              DATA_NOT_AVAILABLE
SNAPSHOT                    modelo canônico da Fase 1, reusado
TESTS                       1967 intelligence (+205) · 190 portal
```

## 1. Pasta oficial

```
folder_id   16e7ABSA6SQnBAkgMtSOFYhPK171For2v
arquivo     Novos Alunos - {Mês}   (mês em português, capitalizado)
aba         Status Contratos
dataset     lucas_status_contratos_mensal
grão        1 linha = 1 contrato
```

A busca é **restrita à pasta**. O workflow oficial faz busca global por nome, e um
teste afirma que o provider consulta `16e7ABSA…` e nada mais — porque a
implementação real poderia esquecer o filtro e o resultado seria idêntico em
qualquer teste que só olhasse o retorno.

## 2. Contrato do provider

```ts
class LucasMonthlyContractsProvider {
  load(query: { period: string }): Promise<LucasCapture>
}
```

Período **explícito**, `AAAA-MM`. O provider não consulta relógio para decidir o que
ler. Quem quer o mês corrente chama `currentPeriod()`, que usa
`America/Sao_Paulo` — às 21:00 do dia 31 de agosto em São Paulo, `new Date()` em UTC
já é 1º de setembro e a ingestão leria o arquivo errado. Há teste para os dois lados
da virada.

### 2.1 Por que NÃO implementa `SourceAdapter`

`integration/src/ports.ts` declara:

```ts
read(period_start: string, period_end: string): Promise<RawBatch>
```

O retorno é `RawBatch` — sempre. Não há ramo para "não existe arquivo do mês", "a
API falhou", "há dois arquivos", "a aba não existe" nem "existe e está vazio". O
comentário daquele arquivo diz que essas situações **precisam** ser distinguidas, e
a única forma de expressá-las por ali é `throw`, obrigando o chamador a inspecionar
mensagem de exceção. Mensagem de exceção não é contrato.

`RawBatch` também não tem onde guardar a seleção entre candidatos — que é a prova de
POR QUE lemos esta planilha e não a outra.

Conforme §55: contrato canônico próprio com estados fechados. **Não é um segundo
protocolo.** O `Snapshot` governado da Fase 1 é reusado sem alteração, produzido por
`toSnapshot`; o que é novo é a CAPTURA, que precede o snapshot e existe justamente
nos casos em que snapshot nenhum deve existir.

## 3. Período → arquivo

Tabela literal indexada por número do mês. Não usa `Intl` nem locale do SO:
`toLocaleString("pt-BR")` devolve "agosto" nesta máquina e pode devolver "August"
noutra, dependendo do ICU compilado no runtime. Nome de arquivo é identidade da
fonte — se varia com o ambiente, a ingestão não encontra a planilha em produção e
encontra no laptop de quem escreveu o código.

`Março` mantém o acento. Tolerar acento na comparação casaria
`Novos Alunos - Marco`, que se existir é um arquivo criado por engano.

Fora de `AAAA-MM` → `source_error`, não `data_not_available`: período mal formado é
defeito **nosso**, e culpar a fonte por um bug de chamada esconde o bug.

## 4. Duplicidade — política e regra

```
source_status   AVAILABLE
quality         DUPLICATE_SOURCE_WARNING
selection_rule  LATEST_MODIFIED_THEN_STABLE_FILE_ID
```

Duplicidade **não bloqueia**. Recusar transformaria "há dois arquivos" em "não há
dado" — a confusão que este subsistema existe para não cometer.

### 4.1 Não havia regra pré-existente para reutilizar

Verifiquei antes de definir a minha, como §9 exige. O workflow oficial
(`V7RLeLrU4YZHscPf`) faz busca global por nome com `limit: 1`. Isso não é regra
governada: é ordem incidental da API, exactamente o que §9 proíbe. Como não havia o
que reutilizar, esta fase define:

1. maior `modifiedTime`, **comparado por instante parseado**;
2. instantes exatamente iguais → menor `file_id` em ordenação lexical por code unit.

O `file_id` é único por construção no Drive, então a regra é total.

A palavra "instante" no item 1 é o que a Fase 2.11c corrigiu — ver §25.

### 4.2 A prova de que é regra e não acidente

Um teste percorre **todas as 6 permutações** de três candidatos e afirma a mesma
escolha em todas. O duplo de teste inverte a ordem por padrão, para que nenhum teste
passe por acidente de ordenação.

A lista auditável também é ordenada deterministicamente — não só a escolha. Sem
isso, o hash de um relatório de duplicidade mudaria sem nada mudar na fonte.

### 4.3 O que fica preservado

`period`, `candidate_count`, `eligible_count`, todos os `file_id`, `name`,
`mime_type` e `modified_time`, `selected_file_id`, `selected_file_name`,
`selection_rule`.

### 4.4 Duplicidade NÃO é `Conflict` — corrigido na 2.11a

A primeira versão registrava duplicidade como `Conflict` com `resolved: false` e
`quality_status: conflicted`. Estava errado, e o custo era concreto:

```ts
// low-ticket.ts:506 e first-due-date-concentration.ts:982
if (s.conflicts.length > 0) candidatas.push("conflicted")
```

`conflicted` é o **pior** estado do lattice — ordem 3, acima de `insufficient`. O
docstring de `quality.ts` diz o que ele significa: *"duas fontes governadas afirmam
coisas diferentes: o número não está apenas incompleto, está em disputa, e nenhuma
agregação resolve isso sem decisão humana."*

Não é o nosso caso. **Existe** decisão humana, ela está governada, tem nome
(`LATEST_MODIFIED_THEN_STABLE_FILE_ID`) e foi aplicada. O arquivo operacional está
escolhido. Marcar como conflito não resolvido faria todo Event de um mês com dois
arquivos carregar a qualidade de um número em disputa — quando o que houve foi uma
regra funcionando.

Agora:

```
snapshot.conflicts    []
quality_status        degraded
source_quality        DUPLICATE_SOURCE_WARNING
```

`degraded` é o estado não-bloqueante que o lattice **já tinha**. Nenhum estado novo
foi criado, o lattice não foi alterado, e nenhuma severidade executiva foi inventada.

`Conflict` continua existindo e continua certo para conflito real — é o que
`cross-source-conflict.ts` usa quando duas fontes discordam de um valor.

### 4.5 Continuidade provada

Teste com dois candidatos válidos e população **acima** do mínimo governado de
contratos, para isolar a variável — com 2 linhas o Detector A devolveria
`insufficient` por população pequena e o teste não distinguiria isso do efeito da
duplicidade:

```
status                          available
selected_file_id                aaa            (maior modifiedTime)
source_quality                  DUPLICATE_SOURCE_WARNING
snapshot.conflicts              []
snapshot.quality_status         degraded
Detector A  → roda              13 registros, quality degraded
low-ticket  → roda              13 registros, 1 below_floor, quality degraded
```

Detector A roda com `buildProductionDetectorConfig()`, a configuração derivada do
artefato governado — não um objeto de teste. E o aviso é serializável: quem lê a
captura meses adiante encontra `DUPLICATE_SOURCE_WARNING`, a regra pelo nome e o
`file_id` do candidato preterido.

## 5. Acesso ao Drive

Porta **somente leitura**, injetada:

```ts
interface LucasDrivePort {
  listCandidates(folder_id: string, expected_name: string): Promise<readonly DriveFileMeta[]>
  readSheet(file_id: string, sheet_name: string): Promise<SheetReadResult>
}
```

Não existe método para criar, renomear, mover, excluir, compartilhar ou escrever.
Não é que o provider evite chamar — é que não há o que chamar. Uma porta
somente-leitura por FORMA é mais forte que uma revisão dizendo "não escreva", porque
a revisão vale até o próximo commit.

Nenhum detector importa este arquivo, e este arquivo não importa detector.

### 5.1 Estado da credencial — medido

O repositório **não tem** `googleapis` nem qualquer SDK do Google, não há variável de
credencial Google em `.env.example`, e nenhum arquivo em `src/` importa cliente do
Drive ou do Sheets. O acesso que a operação usa hoje vive no n8n, com credencial
gerenciada lá.

Consequência: a fronteira de rede desta fase **não pode ser exercida em produção
ainda**. `productionLucasProvider` lança quando
`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`..._PRIVATE_KEY` faltam, citando **nomes** de
variável e nunca valores.

**Não existe fallback para fixture**, e o caminho nem foi escrito. A tentação é
óbvia — sem credencial, ler um arquivo local e "pelo menos rodar" — e o resultado
seria um número executivo derivado de dado de teste, indistinguível de um derivado da
fonte oficial, porque o `content_hash` e a procedência pareceriam legítimos.

Quando a credencial existir, muda **um** arquivo: o adaptador da porta. Nada do que
já está testado se move.

### 5.2 Três fronteiras que nunca se misturam

| situação | onde acontece | resultado |
| --- | --- | --- |
| **CONFIGURATION ERROR** | antes de `load()` | exceção de **bootstrap** — `productionLucasProvider` lança |
| **SOURCE_ERROR** | dentro de `load()` | `status: "source_error"` |
| **DATA_NOT_AVAILABLE** | dentro de `load()` | `status: "data_not_available"` |

**Configuração ausente é bootstrap, e é legítimo ser exceção.** Sem credencial não
existe provider — não houve leitura, não há período sobre o qual afirmar nada, e não
há captura para carregar um estado. Devolver `source_error` aqui afirmaria que
tentamos ler e a fonte falhou, o que é falso: nunca chegamos a tentar.

**`SOURCE_ERROR` é o Google respondendo com erro** — permissão, quota, outage,
falha de transporte. Coberto na listagem **e** na leitura da aba.

**`DATA_NOT_AVAILABLE` é o Google respondendo bem** e não existir arquivo do
período.

Nunca degradam entre si. Um outage virando "zero contratos" e depois "as vendas
caíram" é o modo de falha que este subsistema inteiro existe para impedir.

### 5.3 O contrato de `load()` é FECHADO

Auditei os caminhos de escape e fechei os que restavam. Um teste percorre quatro
cenários **sem `try/catch`** — se qualquer um lançar, o teste falha:

```
relógio da fonte adiantado   →  invalid_source / SOURCE_TIME_INCONSISTENT
modifiedTime ilegível        →  invalid_source / SOURCE_TIME_UNPARSEABLE
API lançou                   →  source_error
período fora do domínio      →  source_error
```

O último `catch` é **deliberadamente estreito**: só `GatewayError` da construção do
snapshot vira `invalid_source / GOVERNED_CONTRACT_REJECTED`. Uma recusa dessas é
afirmação sobre o DADO — "o que a fonte entregou não satisfaz o contrato governado".
Qualquer outra exceção é defeito nosso e **continua propagando**, porque engolir um
`TypeError` transformaria bug em "fonte inválida" e o esconderia atrás de uma
mensagem plausível sobre o Lucas.

**Nenhum fallback foi criado** em nenhuma das três fronteiras.

## 6. Schema — mapeamento por cabeçalho

Obrigatório, e a medição da Fase 2.10 mostra por quê:

| | agosto | julho |
| --- | --- | --- |
| `CPF` | 4ª coluna | **3ª** |
| `Unidade` | 5ª | **6ª** |
| só em agosto | `Parcela Cheia`, `%`, `Curso`, `Repasse` | — |
| só em julho | — | `Sistema`, `Data Repasse`, `Valor` |

Um adaptador por posição calibrado em agosto leria o CPF na coluna do nome em julho —
e não falharia: produziria identidades erradas que parecem CPFs ausentes. Um teste
monta a **mesma linha lógica** nas duas ordens e afirma o mesmo contrato normalizado.

Coluna A é a única estável (`Venc` nos dois meses) e mesmo ela é localizada por nome.

**Sem fuzzy matching.** `Parcela Cheia` e `Parcelas` estão a uma palavra de distância
e significam contagem contra valor em reais; casar aproximado trocaria uma contagem
por dinheiro e o detector de parcelamento passaria a agrupar contratos por preço.

### 6.1 Três classes

| classe | campos | comportamento |
| --- | --- | --- |
| `REQUIRED` | `venc`, `cpf`, `unidade`, `status`, `parcelas`, `ticket` | ausente → `INVALID_SOURCE` |
| `OPTIONAL` | `valor_repasse`, `desconto_pct`, `canal`, `vendedor`, `data_contratacao` | ausente → `OPTIONAL_HEADER_MISSING` |
| `KNOWN_EXTRA` | `curso`, `sistema`, `aluno` | observados, não consumidos |

`venc` é required não porque a data seja utilizável, mas porque a ausência da
**coluna** e a ausência da **data** são coisas diferentes — sem a coluna não
conseguiríamos distingui-las.

`aluno` é `KNOWN_EXTRA` de propósito: existe, é PII, não é consumido. Declará-lo
evita que apareça como desconhecido a cada mês.

Coluna extra desconhecida **não quebra** — a planilha é viva — mas é reportada,
porque coluna nova pode ser a dimensão que faltava.

Mesmo campo em duas colunas → `INVALID_SOURCE`. Escolher a primeira ou a última seria
a decisão incidental que o mapeamento por cabeçalho existe para não tomar.

## 7. Status oficial

Preservado exatamente, com o bruto sempre à vista:

```
E  Emitido
A  aluno + garantidor assinaram; falta assinatura da Creditum
P  contrato gerado; aluno ainda não assinou
C  Cancelado
```

### 7.1 A mesma população, duas leituras

| status | mês vigente | mês fechado |
| --- | --- | --- |
| `E` | realizado | realizado |
| `A` | **aguardando Creditum** | não realizado |
| `P` | pendente, não assinado | não realizado |
| `C` | cancelado | cancelado |

Reproduzido em teste contra os números reais:

```
julho  (fechado)   19 E,  5 C,  0 A,  0 P    →  realizado 19
agosto (vigente)    8 E,  0 C,  1 A, 11 P    →  realizado  8
```

Julho não tem pendentes porque pendente se **resolve** antes do mês fechar. É o que
faz `status != C` = 19 = `E` em retrospecto, e divergir 2,5× no presente: a conta do
relatório dá 20 para agosto, realizado é 8.

`decomposeStatuses` **não expõe campo chamado `vendas`**, e há teste afirmando isso.
Um campo com esse nome seria consumido como o KPI oficial, e o KPI oficial é do
relatório do Lucas.

### 7.2 O fato `A`

```
AWAITING_CREDITUM_SIGNATURE
  severity         null
  severity_status  SEVERITY_POLICY_UNRESOLVED
```

`severity: null` não é campo a preencher depois — é a afirmação de que nenhuma
severidade foi atribuída, visível para quem consome. `creditum-policy.v1.json` não
cobre este tipo de evento e a Fase 2.7 fechou que severidade sem lastro não sai.
Mesmo padrão do low-ticket antes de `medium` ser aprovada.

Só existe no mês vigente: em mês fechado, um `A` que ficou `A` é não realizado, e o
gargalo já não é acionável.

## 8. Identidade

```
identidade operacional   CPF normalizado + period
native contract_id       DATA_NOT_AVAILABLE
CPF vazio                IDENTITY_MISSING
```

`subject_ref` vem de `structuralId` sobre `{cpf_digits, period}` — o mecanismo
determinístico que os detectores já usam, não hash caseiro. O CPF entra, produz o
pseudônimo e **não sai**: um teste serializa a captura inteira e afirma que nem o CPF
pontuado, nem os 11 dígitos, nem os 9 primeiros aparecem.

Mesmo CPF em períodos diferentes produz pseudônimos diferentes — é o caso real de
julho (`C`) → agosto (`E`), recontratação legítima, dois contratos.

CPF com dígito verificador inválido é `IDENTITY_MISSING`, não aceito.

### 8.1 Linha sem CPF entra nos detectores

Descartar tiraria o contrato do denominador de concentração. Ela entra com um
pseudônimo de **linha**, em domínio `structuralId` separado do de pessoa: identifica
"a linha 7 desta captura", serve para rastrear dentro do período e deliberadamente
**não** serve para reconhecer a mesma pessoa em outro mês — a propriedade certa para
uma linha sem CPF.

Nome nunca é identidade de reserva.

## 9. Unidade e D13

`raw_unit_label` preservado sempre. Resolução por `canonicalizeUnit` de produção —
nenhum alias é reimplementado em código.

O `UnitId` é **chave técnica interna**, não nome de fonte nem de exibição:

```
fonte    "Duque Caxias"
display  "Duque de Caxias"
UnitId   duque_de_caxias
```

Teste cobre as nove formas governadas: `Duque Caxias`, `Meriti`, `Fortaleza`,
`Zona Norte`, `Jardim Ângela`, `Alecrim`, `Alecrim RN`, `Alecrin RN`,
`Natal Centro`.

Unidade não resolvida → `UNIT_IDENTITY_UNRESOLVED`, rótulo bruto preservado, nenhum
id inventado, **linha não descartada**.

`inactive` no catálogo não bloqueia nada. Teste com `Duque Caxias` e
`Jardim Ângela` — as duas inativas com contrato real em julho — afirma zero fatos de
qualidade e `quality_status: ok`.

## 10. Números

| campo | fonte | regra |
| --- | --- | --- |
| `ticket_cents` | `TICKET` | autoridade; `parseBRLToCents`, inteiro |
| `installment_count` | `PARCELAS` | inteiro positivo; não-inteiro ou ≤0 → `INVALID_INSTALLMENT_COUNT` |
| `transfer_cents` | `VALOR REPASSE` | só reconciliação |
| `discount_bp` | `%` | `15 → 1500 bp` |

**Ausente nunca é zero.** `parseBRLToCents` devolve `null` para ausente e para
inválido, e a linha separa os dois com fato de qualidade — porque célula vazia e
`R$ --` são conversas diferentes com o Lucas.

O anti-padrão que isto substitui está no workflow: `Number("R$ 410,00")` é `NaN`, e
`NaN || 0` é `0`. Um contrato de R$ 410 vira R$ 0 e entra no ticket médio. Teste
cobre `R$410,00` sem espaço, forma observada na fonte real.

`TICKET_RECONCILIATION_MISMATCH` **detecta** divergência e não substitui: se `TICKET`
falta, chega `null` mesmo com repasse presente. Teste prova que
`R$ 100,00 × 10` **não** foi escrito no lugar do ticket ausente — substituir faria um
contrato sem ticket atravessar o piso de R$ 1.499,99 com um número que a fonte não
afirmou.

Desconto ausente não vira 0 bp; `150%` é `INVALID_DISCOUNT`.

## 11. `Venc` — cinco estados, nenhum inventa data

| valor | estado | fato |
| --- | --- | --- |
| `27/08/2026`, `2026-08-27` | `available` | — |
| `27/08` | `incomplete` | `FIRST_DUE_DATE_INCOMPLETE` |
| `PG` | `not_available_as_date` | `FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE` |
| `-`, vazio | `missing` | `FIRST_DUE_DATE_MISSING` |
| `32/08/2026`, `27/08/26` | `invalid` | `FIRST_DUE_DATE_INVALID` |

`raw_venc` preservado sempre que existe. **Só o ramo `available` tem
`first_due_date`** — não é convenção, é o tipo: não existe onde escrever uma data nos
outros quatro. Um teste varre a união e afirma que a chave não aparece.

`27/08` **não** recebe o ano do período. Um contrato de dezembro com vencimento
`05/01` é do ano seguinte, e inferir pelo período o colocaria onze meses no passado —
com aparência de data perfeitamente válida. Teste afirma que `"2026"` não aparece no
resultado.

`PG` é classificado como outra semântica, **não** como inválido. Em julho são 13 de
24 linhas: chamá-las de inválidas reportaria corrupção em 54% da planilha quando a
fonte deu informação correta numa coluna sobrecarregada.

Sentinela desconhecido (`PAGO`, `OK`, `QUITADO`) cai em `invalid` — o código não
adivinha que é mais um jeito de dizer "pago".

Ano de dois dígitos é `invalid`: `27/08/26` é ambíguo entre 1926 e 2026, e aceitar
exigiria uma janela de século, que é adivinhação com aparência de norma.

Serial de planilha é `invalid`: 46261 é uma data no Sheets e outra no Excel de 1904.

Nenhum substituto de `Desembolso`, `Repasse`, `Inicio Grau`, data de contratação,
`period` ou `modifiedTime`. Nada de `Date.parse` permissivo — `Aug 27 2026` e
`2026/08/27` são recusados.

## 12. Procedência e content hash

```
source_system, dataset_id, folder_id, file_id, file_name,
sheet_name, period, source_modified_time, collected_at, content_hash
```

O hash é **lógico**, não de bytes: Sheets nativo não tem arquivo estável, e a mesma
célula chega como `410` ou `"410"` entre chamadas. Hash sobre a resposta crua mudaria
sem nada mudar na planilha, destruindo a idempotência que ele existe para dar.

Material: cabeçalhos e células na ordem da fonte, com normalização puramente
representacional. **Nenhuma transformação de negócio** — sem `parseBRLToCents`, sem
D13, sem classificação de `Venc`. Se o hash dependesse do nosso parser, mudar uma
regra nossa mudaria a identidade de um dado que a fonte não tocou, e reingeriríamos
meses inteiros por causa de um refactor.

Fora do hash, com teste: `collected_at` e `modifiedTime`. Duas leituras do mesmo mês
são o mesmo conteúdo; alguém abrir e salvar sem editar muda `modifiedTime`.

**A ordem das linhas é material** — decisão explícita, não omissão. A posição é o
localizador de evidência de cada linha. Se reordenar não mudasse o hash, duas
capturas com o mesmo hash teriam localizadores diferentes para o mesmo contrato e a
auditoria apontaria para a célula errada. O custo é assumido: inserir uma linha no
meio muda o hash de tudo abaixo.

## 13. Snapshot governado

Produzido por `toSnapshot` — schema JSON + invariantes semânticas. Não há cast para
`Snapshot` em nenhum ponto.

`rows_skipped` é 0 por construção: nenhuma linha de dado é descartada. Linha em
branco de rodapé não conta como contrato nem como descarte.

### 13.1 O payload só tem `period_label`

O payload governado admite `sales_count`, `average_ticket_cents` e
`installments_histogram`. Nenhum é preenchido, por dois motivos distintos:

`sales_count` é o KPI do Lucas, e escrever um número obrigaria a escolher a
população — `E` = 8 ou `status != C` = 20 em agosto. Essa escolha é do relatório
dele.

`installments_histogram` e `average_ticket_cents` são agregados sobre uma população
que o payload não tem como declarar. Agregado sem rótulo de população é o defeito que
`status-semantics.ts` existe para impedir, e o snapshot não tem campo para o rótulo.
Cada detector calcula o seu e declara a população que usou.

`record_count` é contagem de LINHAS ingeridas — não é métrica de negócio.

### 13.2 Dois requisitos do contrato que eu não conhecia

Ambos apareceram porque o contrato governado recusou o payload, e ambos estão certos:

**`period_label` é `^[a-zç]{3,12}/[0-9]{4}$`** — `agosto/2026`, não `2026-08`. O
rótulo é gerado pela ingestão, nunca copiado da fonte.

**`observed_at <= ingested_at`.** `observed_at` é o `modifiedTime` do Drive, do
relógio do Google. Relógio de terceiro pode estar adiantado, e sem guard
`toSnapshot` lançaria e a exceção **escaparia de `load()`**, furando a promessa de
estados fechados. Agora é `invalid_source / SOURCE_TIME_INCONSISTENT`, com os dois
tempos à vista e nenhum ajustado.

**A comparação era por STRING — defeito corrigido na 2.11a.** As precisões ISO
diferem: o Drive devolve `2026-08-19T18:00:00Z` e `Date.toISOString()` produz
`2026-08-19T18:00:00.000Z`. Na posição 19 a comparação de string encontra `Z`
(0x5A) contra `.` (0x2E) e conclui que o primeiro é maior:

```
"2026-08-19T18:00:00Z" > "2026-08-19T18:00:00.000Z"                      →  true
Date.parse("...T18:00:00Z") > Date.parse("...T18:00:00.000Z")            →  false
```

Dois tempos que são o **mesmo instante** viravam divergência de relógio. Agora a
comparação é por instante, e há teste com o próprio par acima.

**`modifiedTime` ilegível é estado próprio**: `SOURCE_TIME_UNPARSEABLE`. Sem poder
ler o tempo da fonte não há `observed_at`, e datar com o nosso relógio afirmaria que
observamos a planilha no instante da ingestão.

`toSnapshot` também recebe o relógio injetado: sem isso o provider seria
determinístico nos próprios timestamps e não na validação deles, e um teste com
relógio fixo passaria ou falharia segundo a data real de execução.

## 14. Imutabilidade

`deepFreeze` na captura inteira. Teste afirma congelamento de `rows`, de cada linha,
de `provenance`, de `selection` e de `candidates`, e que `push` numa linha lança.
Nenhuma referência mutável escapa.

## 15. Evidência — o furo que a integração revelou

`ports.ts` declara `EvidenceBuilder` e `ComputedProvenanceBuilder` e **nunca os
implementou**. Sem eles a integração dos detectores é apenas nominal:
`low-ticket.ts` recusa contrato com `evidence_refs` vazio, com a mensagem "nenhum
alerta individual sem lastro".

Descobri rodando a regra governada de verdade. Um teste que checasse
`ticket_cents < 149999` por conta própria teria passado e escondido que a integração
não funcionava.

### 15.1 O caminho real, documentado

```
Google Sheets (aba Status Contratos, arquivo selecionado)
  └─ grade crua: headers + rows                       LucasDrivePort
      └─ mapeamento por cabeçalho                     buildHeaderMap
          └─ normalização de linha                    normalizeRow
              └─ content hash lógico                  sheetContentHash
                  └─ Snapshot governado               toSnapshot   (Fase 1)
                      └─ Evidence row + computed      buildEvidenceSet
                          └─ ContractRecord/TicketRecord
                              └─ Detector A · low-ticket
```

A evidência nasce **depois** do snapshot e **antes** dos detectores, dentro do
`load()`. Não há etapa fora do provider.

### 15.2 A garantia é estrutural — corrigido na 2.11a

A versão anterior produzia a evidência **fora** do provider: quem montava a entrada
dos detectores chamava `buildEvidenceSet`. Funcionava e provava pouco — nada impedia
um chamador, ou um teste, de fabricar `Evidence` que satisfizesse o schema sem ter
vindo da fonte.

Agora `evidence` é campo **obrigatório** de `LucasCaptureBody`, produzido no `load()`,
e `DetectorMappingInput` **não tem onde recebê-la**:

```ts
export interface DetectorMappingInput {
  readonly capture: …
  readonly stance: PeriodStance
  readonly detected_at: string
  readonly unit_coverage?: UnitCoverage
}
```

Um chamador que tentasse injetar evidência não compila. Foi assim que os testes
antigos quebraram ao migrar — o compilador recusou `evidence:` e
`aggregate_evidence_ref:`, que é exatamente a prova pedida.

Teste afirma identidade de instância: `toInstallmentInput(...).evidence` **é**
`capture.evidence.all`, não uma cópia equivalente.

### 15.3 Propriedades provadas

| propriedade | prova |
| --- | --- |
| criada da fonte/snapshot real | `evidence.snapshot_id === capture.snapshot.snapshot_id` para todas |
| contratos canônicos da Fase 1 | `toEvidence` (schema + semântica); `kind` ∈ {`row`,`computed`} |
| `locator` válido | `dataset_id === "lucas_status_contratos_mensal"`, `sheet === "Status Contratos"` |
| `row_key` canônico SHA-256 | `^[a-f0-9]{64}$`, reproduzível por `rowKeyFor` = `computeIdentity` |
| `subject_ref` canônico | `^subj_[a-f0-9]{16}$`, com e sem CPF |
| sem CPF em claro | serialização não contém CPF pontuado, 11 dígitos, nem os 9 primeiros |
| vinculada ao snapshot certo | `observed_at` = o da FONTE, não o da coleta |
| determinística | mesma captura lógica → mesmos `evidence_id` e `computation_id` |
| protocolo único | nenhum `LucasEvidence`/`SalesEvidence`; `provenance_version` `1.0.0` |

`row_key` inclui o `file_id` no escopo: linha 1 de agosto ≠ linha 1 de setembro. Sem
isso o sistema concluiria que uma é edição da outra e versionaria uma por cima da
outra.

Captura vazia produz evidência de **agregado** e nenhuma de linha — "zero contratos"
é uma afirmação, e afirmação precisa de lastro tanto quanto um número diferente de
zero.

Três defeitos meus vieram no mesmo caminho, todos encontrados pelo contrato:

1. **`locator.row` não existe** — o campo governado é `row_key`. Meu filtro não casava
   nada e todo contrato saía sem evidência.
2. **`row_key` exige SHA-256** (`^[a-f0-9]{64}$`), não número de linha. A exigência é
   deliberada: localizador em claro num objeto que pode chegar ao modelo é um
   ponteiro para a linha de uma pessoa. Uso `computeIdentity`, o produtor canônico do
   portal, cujo escopo inclui o `file_id` — sem isso a linha 42 de agosto e a de
   setembro produziriam o mesmo `row_key` e o sistema concluiria que uma é edição da
   outra.
3. **`subject_ref` exige `^subj_[a-f0-9]{16}$`** — meu `subj_missing_row_1` era
   recusado pelo detector. Corrigido para `structuralId` em domínio próprio.

`untrusted_excerpt` não é preenchido: o único texto que valeria citar é o rótulo de
unidade, que já viaja canonicalizado. Texto de fonte no caminho do modelo é
superfície de injeção.

## 16. Integração com detectores

### Detector A — `integrated`

```
installment_count  ←  PARCELAS
amount_cents       ←  TICKET
unit               ←  D13 (canonicalizeUnit)
period             ←  limites civis do período
evidence           ←  EvidenceBuilder
```

### Low-ticket — `integrated`

`ticket_cents ← TICKET` oficial. A regra governada roda de verdade no teste, com o
piso do artefato: `149998` dispara `BELOW_FLOOR`, `149999` e `150000` não.

### População estrutural

A e low-ticket recebem `E` + `A` + `P`; `C` e status inválido saem.

A e low-ticket medem **estrutura** do contratado — como o parcelamento se distribui,
se o ticket está abaixo do piso. Um contrato pendente já tem parcelamento e ticket
definidos: o aluno não assinou, mas o produto vendido é aquele. Excluir os pendentes
mediria a estrutura de uma amostra enviesada.

Isso é diferente de **contar vendas**, onde só `E` conta — e é por isso que
`status-semantics.ts` existe separado de `detector-input.ts`.

### Detector C — `deferred`, razão medida

`DueExclusionReason` tem **dois** membros: `MISSING_DUE_DATE` e `INVALID_DUE_DATE`. A
fonte produz **cinco** estados. O mapeamento 5→2 não perde detalhe — afirma coisa
falsa:

```
27/08  →  INVALID_DUE_DATE   diz "a fonte errou". Não errou: faltou o ano.
PG     →  INVALID_DUE_DATE   diz "a fonte errou". Não errou: disse "pago".
```

A alternativa seria pré-filtrar e passar só as datas completas. Pior: C calcula
elegibilidade sobre `input.contracts.length`, então filtrar apagaria as exclusões e
o detector reportaria 100% de elegibilidade sobre uma população escolhida por nós.
A primeira opção mente; a segunda esconde.

C não foi alterado, continua SHIP, e a data completa **é preservada** em
`venc.first_due_date` para quando a fonte tiver a coluna imutável
(`FIRST_DUE_DATE_ORIGINAL`, Fase 2.10 §20.6). Não declarei a coluna inteira como
vazia só porque C não é chamado.

### Detector D — `deferred`

D é `DERIVABLE`, e derivar exige escolher a população da soma parte-do-todo: com
pendentes ou sem, com `A` ou sem. Essa é decisão de negócio, não de engenharia, e
integrar sob uma suposição produziria um denominador que ninguém aprovou. **Não
bloqueia A nem low-ticket.**

### Detector B — não integrado

Precisa de segunda fonte afirmando grandeza semanticamente comparável. `Sistema =
Bitrix` em julho indica onde procurar. O antigo 8 vs 14 **não** é conflito: são
populações diferentes (realizado vs pipeline), e tratar diferença de definição como
conflito de dado geraria alerta sobre um desacordo que não existe.

## 17. `expected_units`

Consulta canônica `period + dataset_id`. Não existe membership governada para
`lucas_status_contratos_mensal`, então:

```
CoverageEvaluation.status = data_not_available
reason = EXPECTED_UNITS_DATA_NOT_AVAILABLE
```

O detector recebe `unit_coverage` **ausente**, não zerada — `expected_units: 0` diria
"esperávamos zero unidades", que é falso.

Teste afirma que nenhum `ratio_bp` aparece na serialização, e explicitamente que
`10000` não aparece: usar as unidades observadas como denominador daria 100% de
cobertura sempre — um número perfeito medindo nada.

Cobertura indisponível **não interrompe** a observação factual, invariante da Fase
2.8a.

## 18. Vocabulário observado

Valor bruto preservado, nenhum enum criado, nenhum alias por aproximação.

| dimensão | valores observados |
| --- | --- |
| `Canal` | `Indicação`, `indicação`, `Qualificação`, `Inboud` *(typo)*, `Follow Up` |
| `Vendedor` | `Carlos Brito`/`Carlos`; `Lucas Costa`/`Lucas Z`; `Lavinia` |

`Lucas Costa` vs `Lucas Z` mostra por que o palpite é perigoso: sobrenome diferente
sugere duas pessoas, e fundir vendedores troca ranking e comissão.

## 19. Source-first

Nenhum dashboard, página, relatório paralelo ou KPI novo. O provider entrega fatos
oficiais por período, com procedência, e a comparação até o mesmo dia do mês
permanece **fora** dele — é semântica do relatório do Lucas, e o provider fornece a
população por período para quem a reproduzir.

## 20. Arquivos

**Novos** (`intelligence/integration/src/lucas/`):

| arquivo | responsabilidade |
| --- | --- |
| `month-names.ts` | `AAAA-MM` → nome do arquivo; limites civis |
| `drive-port.ts` | fronteira Drive/Sheets somente leitura; constantes governadas |
| `file-selection.ts` | seleção determinística + duplicidade |
| `source-quality.ts` | vocabulário fechado de fatos de qualidade |
| `venc.ts` | os cinco estados do primeiro vencimento |
| `header-mapping.ts` | mapeamento por cabeçalho, três classes |
| `rows.ts` | normalização de linha |
| `content-hash.ts` | identidade lógica de conteúdo |
| `evidence.ts` | `EvidenceBuilder` + `subject_ref` + `rowKeyFor` |
| `status-semantics.ts` | E/A/P/C por regime de período |
| `detector-input.ts` | entrada de A e low-ticket; deferimento de C |
| `provider.ts` | `LucasMonthlyContractsProvider` |
| `production.ts` | wiring que falha fechado sem credencial |

**Testes novos** (131): `file-selection` 26 · `venc` 17 · `schema-identity` 26 ·
`snapshot-detectors` 31 · `boundary-evidence` 21 · `expected-units` 4 · fixtures +
duplo de Drive.

**Modificado:** `detectors/src/engine.ts` — reexporta `parseBRLToCents`, `parseCpf`,
`isValidCpf`. Este arquivo é o único ponto de acoplamento com `src/lib/ceo`, e um
import relativo profundo em `integration/` reabriria a caça a acoplamento que ele
existe para evitar.

**Nenhum detector alterado.** `installment-concentration.ts`, `low-ticket.ts`,
`first-due-date-concentration.ts`, `cross-source-conflict.ts`,
`material-single-case.ts` e a política intocados.

## 21. Verificação

```
intelligence   1893 passed (37 arquivos)   +131
portal          190 passed (5 arquivos)
typecheck       intelligence OK · portal OK
lint            intelligence OK
```

`npm run lint` do portal reporta 16 erros e 6 avisos, todos **pré-existentes** e
todos em `src/app/**` e `src/lib/argus-adapter.ts` — nenhum arquivo tocado nesta
fase. Confirmado por inspeção: a lista de arquivos com erro não intersecta a lista de
arquivos modificados.

## 22. Gaps restantes

**BLOQUEANTE para leitura em produção**

1. **Credencial Google** — service account com leitura na pasta oficial, e o
   adaptador da porta. Sem isso o provider é exercitável só em teste. Nenhum
   fallback existe, por decisão.

**BLOQUEANTE para detector específico**

2. **`FIRST_DUE_DATE_ORIGINAL`** — coluna imutável, `AAAA-MM-DD`, nunca sobrescrita
   por `PG`. Libera o Detector C. Gap para o Lucas.
3. **Segunda fonte para o Detector B** — claim semanticamente comparável.
4. **População do Detector D** — decisão de negócio: a soma parte-do-todo inclui
   pendentes?

**NÃO BLOQUEANTE**

5. **`expected_units` do dataset** — membership governada por período.
6. **`Zona Norte`** — resolvido na 2.10e; nada pendente.
7. **CPF vazio de agosto** — 1 linha; `IDENTITY_MISSING` é representável.
8. **Vocabulário de `Canal`** — `Inboud`, `indicação`.
9. **Aliases de `Vendedor`** — `ceo.seller_aliases` vazia.
10. **Propriedade do arquivo varia** — julho Nicole, agosto Lucas. Procedência.
11. **Severidade de `AWAITING_CREDITUM_SIGNATURE`** — o fato existe; a política não.

Sem commit, sem push, nada ingerido.

---

# 23. Fase 2.11a — alinhamento de contrato

Três pontos, três correções. Os dois primeiros foram apontados por você; o terceiro
apareceu na auditoria que o ponto 3 pediu.

## 23.1 Duplicidade

`Conflict` removido, `quality_status` de `conflicted` para `degraded`. Detalhe em
§4.4; continuidade provada em §4.5.

O que me convenceu não foi a preferência mas o docstring de `quality.ts`:
`conflicted` significa "nenhuma agregação resolve isso sem decisão humana". Nós temos
decisão humana. A modelagem antiga contradizia a própria regra que a fase criou.

## 23.2 Evidência estrutural

Movida para dentro da captura, campo obrigatório, e `DetectorMappingInput` perdeu os
campos que a recebiam. Detalhe em §15.2/§15.3.

O sinal de que a mudança fez o que devia: os testes **não compilaram** depois dela. O
compilador recusou `evidence:` e `aggregate_evidence_ref:` nos objetos que os testes
montavam — exactamente a injeção que §8 proíbe.

## 23.3 Um defeito meu, encontrado na auditoria do ponto 3

O guard de `SOURCE_TIME_INCONSISTENT` comparava os dois timestamps ISO como
**string**. As precisões diferem — o Drive não emite milissegundos e
`Date.toISOString()` emite — e na posição 19 a comparação encontra `Z` (0x5A) contra
`.` (0x2E):

```
"2026-08-19T18:00:00Z" > "2026-08-19T18:00:00.000Z"   →  true
```

O mesmo instante era reportado como divergência de relógio, e uma captura
perfeitamente válida virava `invalid_source`. Corrigido para comparação por instante,
com teste sobre o par acima. `modifiedTime` ilegível ganhou estado próprio,
`SOURCE_TIME_UNPARSEABLE`.

## 23.4 Não alterado, deliberadamente

| item | estado |
| --- | --- |
| contrato de `Venc` | intocado — cinco estados, `raw_venc` preservado, ano nunca inferido |
| Detector C | deferido, `EXCLUSION_VOCABULARY_LOSSY` |
| Detector D | deferido, população é decisão de negócio |
| Detector B | não integrado |
| quality lattice | não alterado; `degraded` já existia |
| payload do snapshot | sem `sales_count`, sem agregado sem rótulo de população |
| policy governada | intocada |
| detectores A/B/C/D | intocados |

## 23.5 Entrega

```
DUPLICATE SOURCE                  AVAILABLE + DUPLICATE_SOURCE_WARNING
SELECTION                         LATEST_MODIFIED_THEN_STABLE_FILE_ID
DUPLICATE BLOCKS PROCESSING       NO
A RUNS WITH DUPLICATE WARNING     YES   (13 registros, quality degraded)
LOW-TICKET RUNS WITH WARNING      YES   (13 registros, 1 below_floor, degraded)

EVIDENCE PATH                     source → headerMap → normalizeRow → contentHash
                                  → toSnapshot → buildEvidenceSet → A / low-ticket
                                  (tudo dentro de load())
EVIDENCE CANONICAL                YES  — toEvidence da Fase 1; nenhum protocolo novo
ROW_KEY                           computeIdentity (canônico), SHA-256, escopo inclui file_id
PII IN EVIDENCE                   NO

CONFIG MISSING                    exceção de BOOTSTRAP em productionLucasProvider;
                                  cita nomes de variável, nunca valores; sem fallback
SOURCE FAILURE                    status "source_error" — listagem e leitura
DATA_NOT_AVAILABLE                status "data_not_available"; nunca confundido com os outros

DETECTOR A                        integrated
LOW-TICKET                        integrated
DETECTOR C                        deferred
DETECTOR D                        deferred

TESTS                             1893 intelligence (37 arquivos, +131) · 190 portal
                                  typecheck OK · lint intelligence OK
                                  lint portal: 16 erros PRÉ-EXISTENTES, 0 em arquivo tocado
```

Sem commit, sem push, nada ingerido.

---

# 24. Fase 2.11b — PRODUCTION GOOGLE ADAPTER

O gate final da 2.11 deu **NO-SHIP** com um achado HIGH, e o achado estava certo:

> `productionLucasProvider` validava credenciais do Google mas nunca construía um
> cliente Drive/Sheets; exigia que o chamador fornecesse o `LucasDrivePort`, e a
> única implementação era `FakeDrive`, de teste.

Era pior que um adaptador faltando. O código **afirmava** que o acesso estava
configurado e não existia caminho pelo qual a planilha real chegasse. Esta fase
corrige exclusivamente isso.

## 24.1 Implementação concreta

| módulo | papel |
| --- | --- |
| `integration/src/lucas/google-http.ts` | fronteira externa: `GoogleHttp` (só `get`), `GoogleAccessTokenSource`, `GoogleApiError`, higienização de razão |
| `integration/src/lucas/google-drive-source.ts` | **`GoogleDriveSheetsSource implements LucasDrivePort`** — REST do Drive v3 e Sheets v4 |
| `integration/src/lucas/production.ts` | bootstrap: constrói auth → adaptador → provider |

## 24.2 Por que a costura de teste desceu

O erro de projeto que produziu o achado não foi só o adaptador ausente: era
`LucasDrivePort` ser **injetável no caminho de produção**. Enquanto uma função
aceitava porta e era o entrypoint real, "aceitar porta de teste" e "ser produção"
eram a mesma coisa — e foi por isso que a lacuna passou pelos gates anteriores.

Agora:

```ts
productionLucasProvider(env?, seams?)   // seams = { http?, tokenSource?, now? }
createLucasMonthlyContractsProviderForTests(config)   // porta injetada, nome explícito
```

`ProductionSeams` **não tem campo de `LucasDrivePort`**. O defeito deixou de ser
expressável, não apenas de estar corrigido — e a prova é que o compilador quebrou os
testes antigos quando a assinatura mudou: eles passavam `FakeDrive` como primeiro
argumento e passaram a não compilar.

## 24.3 Autenticação

Service account, com os nomes **já governados na 2.11** — nenhum segundo formato de
credencial foi inventado:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

`google-auth-library` **11.0.2**, a biblioteca oficial do Google, assina o JWT do
service account e cuida de cache e renovação de token. Nenhuma assinatura escrita à
mão — a Fase 2.6c já havia fechado que não se cria mecanismo criptográfico caseiro.

**Escolha de dependência:** `googleapis` traz o cliente gerado de centenas de APIs, e
precisamos de três chamadas. `google-auth-library` cobre a parte que não se escreve à
mão (a autenticação) e as três chamadas vão por `fetch`. `npm audit` confirma **zero**
vulnerabilidades relacionadas à nova dependência; as 11 existentes são de `next`,
`postcss`, `hono`, `body-parser`, `js-yaml`, `brace-expansion`, `fast-uri` e
`ip-address` — todas pré-existentes.

A chave privada é desescapada (`\n` literal → newline) porque gerenciadores de
segredo guardam PEM em uma linha; sem isso a assinatura falha e o sintoma é um 401,
que manda quem investiga procurar permissão em vez de formato. O valor não é lido,
inspecionado nem logado.

## 24.4 Escopos — somente leitura em três camadas

```
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/spreadsheets.readonly
```

`drive.metadata.readonly` dá id, nome, MIME e `modifiedTime` — e **não** dá acesso ao
conteúdo dos arquivos. É o mínimo para a listagem.

As três camadas são independentes; furar uma não basta:

1. **escopos** — nenhum de escrita, e teste afirma que `auth/drive` e
   `auth/spreadsheets` (as formas amplas) não aparecem;
2. **`GoogleHttp` só tem `get`** — não existe verbo de escrita para chamar;
3. **`LucasDrivePort`** só tem `listCandidates` e `readSheet`.

## 24.5 Listagem do Drive — restrição na QUERY

```
GET https://www.googleapis.com/drive/v3/files
  q      = '<FOLDER_ID>' in parents and name = '<Novos Alunos - Mês>' and trashed = false
  fields = nextPageToken,files(id,name,mimeType,modifiedTime)
  pageSize = 100
  supportsAllDrives = true
  includeItemsFromAllDrives = true
  orderBy = modifiedTime desc,name
```

**A restrição de pasta é parte da query, não filtro posterior.** A API suporta
restrição por pai, e usá-la significa que o processo nunca recebe metadado de arquivo
fora da pasta oficial. Filtrar depois daria o mesmo resultado e deixaria a porta
aberta para alguém remover o filtro sem que nenhuma chamada mudasse.

`trashed = false`: arquivo na lixeira ainda aparece em `files.list` por padrão, e um
mês excluído por engano voltaria a competir com o vigente.

`supportsAllDrives`/`includeItemsFromAllDrives`: sem os dois, uma pasta em Shared
Drive devolve vazio — que o provider leria como `DATA_NOT_AVAILABLE`, ou seja "o
Lucas não entregou o mês", quando o arquivo está lá.

### Sem `limit: 1` — e por que é decisivo

`pageSize=100` com paginação até o fim. O workflow oficial usa `limit: 1`; com um
único candidato devolvido, `DUPLICATE_SOURCE_WARNING` seria **inalcançável por
construção**. Teste afirma `pageSize=100`, ausência de `limit`, e que dois candidatos
homônimos voltam os dois. Outro teste percorre duas páginas.

Truncar em silêncio esconderia candidatos e poderia esconder duplicidade: acima de
5.000 homônimos o adaptador **recusa** em vez de devolver lista parcial.

`orderBy` é conveniência do Google, **não** a regra de seleção —
`LATEST_MODIFIED_THEN_STABLE_FILE_ID` continua no provider, testada contra todas as
permutações. O adaptador não escolhe nada.

## 24.6 Leitura da aba — duas chamadas, e a primeira tem motivo

```
GET .../v4/spreadsheets/{id}?fields=sheets.properties.title
GET .../v4/spreadsheets/{id}/values/'Status Contratos'?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS
```

`values.get` com nome de aba inexistente devolve **400** — não uma resposta que
distinga "aba ausente" de "requisição malformada". Consultar os títulos primeiro
transforma isso em estado governado: `sheet_not_found` com a lista de abas presentes,
que o provider mapeia para `invalid_source`. Sem esse passo, uma aba renomeada viraria
`source_error` e pareceria falha de infraestrutura. Teste afirma a ordem das duas
chamadas e que os valores **não** são pedidos quando a aba falta.

Aba pelo NOME, com apóstrofos no A1 notation (o nome tem espaço). Nunca por índice.

### `FORMATTED_VALUE`, e por que não `UNFORMATTED_VALUE`

`FORMATTED_VALUE` devolve o que a planilha **mostra**: `R$ 8.151,60`, `27/08/2026`,
`PG`. É contra essa representação que o contrato de `Venc` e o parser de dinheiro
foram medidos na Fase 2.10.

`UNFORMATTED_VALUE` seria tentador — números como número, sem parsing de moeda — e
quebraria `Venc`: célula tipada como data volta **serial**, e serial não declara
epoch. `27/08/2026` viraria `46261` e cairia em `FIRST_DUE_DATE_INVALID`. A data
existe e seria reportada como corrompida.

`values` **ausente** é aba vazia — o Sheets omite a chave em vez de mandar `[]`. Não
é erro, e tratar como erro faria um mês sem contratos parecer falha.

## 24.7 Transporte, não negócio

O adaptador não escolhe candidato, não valida MIME, não interpreta cabeçalho, não
normaliza dinheiro e não classifica `Venc`. Devolve o que o Google disse, cru. Duas
decisões que parecem detalhe e não são:

**MIME ausente vira string vazia**, nunca o de Sheets — assumir Sheets faria um objeto
de tipo desconhecido ser lido como a fonte oficial. MIME incompatível **não é
filtrado** aqui: o provider precisa vê-lo para registrar
`CANDIDATE_WITH_INCOMPATIBLE_MIME`.

**`modifiedTime` ausente vira string vazia**, que o guard de tempo classifica como
`SOURCE_TIME_UNPARSEABLE`. Substituir por "agora" datar-ia a observação com o nosso
relógio.

Leitura defensiva: todo corpo é `unknown` e cada leitor verifica a forma. Nenhum
`as` sobre resposta externa.

## 24.8 Mapeamento de erro — a fronteira da 2.11a preservada

| situação | resultado |
| --- | --- |
| config ausente | exceção de **bootstrap**, antes de qualquer requisição |
| 401 / 403 / 429 / 5xx do Drive | `source_error` com classe legível |
| falha de transporte (DNS, socket) | `source_error` |
| erro na leitura da aba | `source_error` |
| 200 sem candidato | `data_not_available` |
| aba `Status Contratos` ausente | `invalid_source / SHEET_NOT_FOUND` |

Classes: `UNAUTHENTICATED`, `PERMISSION_DENIED_OR_QUOTA`, `NOT_FOUND`,
`RATE_LIMITED`, `BACKEND_ERROR`, `REQUEST_REJECTED`. São legíveis por máquina porque
"permissão" é uma conversa com quem administra a pasta e "quota" é uma conversa sobre
volume.

**Permissão negada** identifica operação (`drive.files.list`) e pasta, e nada mais.
Teste afirma que o `detail` **não** contém token, `Bearer` nem `PRIVATE KEY`. A
mensagem de erro do Google é higienizada antes de sair: `Bearer <token>` e blocos PEM
viram `[redigido]`, e o texto é truncado em 200 caracteres — ele vem de fonte externa
e acaba num `detail` que pode ser logado.

O token vai no header `Authorization`, nunca na URL: query string acaba em log de
servidor e em histórico.

## 24.9 Fronteira do SDK preservada

`google-auth-library` é importada em **um** arquivo: `production.ts`. Verificado que
nenhum módulo de `detectors/` ou `gateway/` importa SDK do Google. A cadeia continua:

```
google-auth-library + fetch  →  GoogleDriveSheetsSource  →  LucasDrivePort
  →  LucasMonthlyContractsProvider  →  Snapshot  →  Evidence  →  A / low-ticket
```

`google-drive-source.ts` não importa a biblioteca — só conhece `GoogleHttp`.

## 24.10 Testes

`integration/tests/lucas/google-adapter.test.ts` — **29 testes**, nenhum toca a rede.

| # | prova |
| --- | --- |
| A | query restringe pasta, nome exato e exclui lixeira |
| B | `pageSize=100`, sem `limit`, dois candidatos voltam, paginação percorre tudo |
| C | metadados preservam id, nome, MIME e `modifiedTime`; ausentes não são inventados |
| D | valores pedidos para `'Status Contratos'`, `FORMATTED_VALUE`, metadados antes |
| E | falha na listagem (401/403/429/503) → `source_error` com classe |
| F | falha na leitura da aba → `source_error` |
| G | aba ausente → `invalid_source / SHEET_NOT_FOUND`, valores não pedidos |

Mais: escapamento de apóstrofo na query, token no header e não na URL, higienização de
credencial na razão do erro, escopos somente leitura, `GoogleHttp` sem verbo de
escrita.

### O teste de bootstrap que o gate expôs como ausente

```
config válida + costura de transporte
  → productionLucasProvider(env)          sem porta fornecida pelo chamador
  → 3 chamadas ao Google, na ordem certa
  → pasta oficial na URL da listagem
  → aba oficial na URL dos valores
  → 3 tokens pedidos
  → status available, snapshot governado, evidência de linha, unidade resolvida
```

E o negativo: config ausente → erro de bootstrap com **zero** requisições. Falhamos
antes de tentar ler.

Também pelo caminho de produção: duplicidade continua `available` + `degraded` +
`DUPLICATE_SOURCE_WARNING`, `snapshot.conflicts` vazio, arquivo lido é o
**selecionado** e não o primeiro que o Google devolveu; e o `modifiedTime` do Drive
passa pelo contrato de tempo — adiantado dá `SOURCE_TIME_INCONSISTENT`, precisão ISO
diferente continua sendo o mesmo instante.

## 24.11 Smoke test ao vivo

```
LIVE READ SMOKE: NOT_AVAILABLE
```

Verifiquei `.env.local`, `.env` e `process.env`: `GOOGLE_SERVICE_ACCOUNT_EMAIL` e
`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` **ausentes**. Não fabriquei credencial e não
tentei acesso. A suíte não depende de acesso ao vivo.

Para exercer contra a pasta real, basta a conta de serviço com leitura em
`16e7ABSA6SQnBAkgMtSOFYhPK171For2v` e as duas variáveis no ambiente do servidor.

## 24.12 Entrega

```
PRODUCTION LUCAS DRIVE PORT       implemented
IMPLEMENTATION                    GoogleDriveSheetsSource
                                  (integration/src/lucas/google-drive-source.ts)
PRODUCTION BOOTSTRAP              constrói o adaptador real: YES
CALLER MUST SUPPLY PORT           NO — não existe parâmetro para isso
AUTH                              service account (google-auth-library 11.0.2)
SCOPES                            drive.metadata.readonly · spreadsheets.readonly
OFFICIAL FOLDER ENFORCED          YES — na query (`'<id>' in parents`)
GLOBAL DRIVE SEARCH               NO
LIMIT 1                           NO — pageSize 100 + paginação completa
ALL DUPLICATE CANDIDATES          YES
STATUS CONTRATOS READ             YES — por nome, metadados verificados antes
GOOGLE LIST FAILURE               source_error
GOOGLE SHEETS FAILURE             source_error
NO FILE                           data_not_available
MISSING CONFIG                    erro de bootstrap, zero requisições, sem fallback
LIVE READ SMOKE                   NOT_AVAILABLE — credencial ausente no ambiente
DUPLICATE BEHAVIOR                inalterado e não bloqueante
A                                 integrated
LOW-TICKET                        integrated
C                                 deferred
D                                 deferred
TESTS                             1918 intelligence (38 arquivos, +25) · 190 portal
                                  typecheck OK · lint intelligence OK
                                  lint portal: 16 erros PRÉ-EXISTENTES, baseline
                                  inalterado, 0 em arquivo desta fase
```

### Arquivos

**Novos:** `google-http.ts`, `google-drive-source.ts`,
`tests/lucas/google-adapter.test.ts`.

**Modificados:** `production.ts` (reescrito — bootstrap constrói o adaptador),
`package.json` + lockfile (`google-auth-library ^11.0.2`),
`tests/lucas/boundary-evidence.test.ts` e `tests/lucas/snapshot-detectors.test.ts`
(assinatura do bootstrap).

**Intocados:** provider, `venc.ts`, `rows.ts`, `header-mapping.ts`,
`file-selection.ts`, `evidence.ts`, `status-semantics.ts`, `detector-input.ts`,
`content-hash.ts`, D13, policy, detectores A/B/C/D.

Sem commit, sem push, nada ingerido.

---

# 25. Fase 2.11c — seleção de duplicidade por instante

O gate deu **NO-SHIP** com um HIGH, e era um defeito meu:

> `LATEST_MODIFIED_THEN_STABLE_FILE_ID` comparava `modified_time` RFC3339
> lexicograficamente, e podia selecionar o arquivo mais antigo quando a precisão
> fracionária diferia.

O que torna este achado especialmente meu: a Fase 2.11a corrigiu **a mesma classe de
erro** no guard de `observed_at` do provider — e eu deixei o comparador de seleção
comparando string. Dois caminhos, a mesma pergunta, respostas diferentes.

## 25.1 O defeito, medido

```
"2026-08-19T18:00:00Z"  >  "2026-08-19T18:00:00.100Z"   →  true    (string)
Date.parse(a)           >  Date.parse(b)                →  false   (instante)
```

Na posição 19 a comparação encontra `Z` (0x5A) contra `.` (0x2E) e conclui que o
primeiro é maior. Duas consequências, e as duas silenciosas:

**Escolha do arquivo errado.** Com dois arquivos do mesmo mês, a ingestão pegaria o
**mais antigo**. O guard de tempo do provider não corrigiria — ele valida o candidato
**já escolhido**. Snapshot, evidência, Detector A e low-ticket sairiam todos de
conteúdo desatualizado, com procedência de aparência perfeita.

**Desempate inalcançável.** `"...00Z"` e `"...00.000Z"` são o mesmo instante e
**não** são a mesma string. A igualdade textual falhava antes, então o desempate
governado por `file_id` nunca era atingido.

## 25.2 A correção

Um módulo, `integration/src/lucas/source-time.ts`, com `sourceInstant()` — usado
pelos **dois** caminhos. Enquanto cada um tinha o seu, "usar instante" era uma
decisão que dava para esquecer num deles; foi o que aconteceu.

```ts
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
```

A forma é verificada **antes** de `Date.parse`, que é permissivo: aceita
`"Aug 27 2026"` e, pior, aceita `"2026-08-19"` como meia-noite UTC. Um `modifiedTime`
truncado a data viraria instante plausível e comparável, e o arquivo pareceria mais
antigo do que é. Segundo é obrigatório: `18:00Z` é ISO-8601 válido e não é RFC3339.

**Todo candidato elegível é parseado antes de qualquer ordenação**, e o instante fica
no `CandidateRecord` — porque é o valor que a regra usa, e guardar só o texto foi o
que permitiu comparar string sem ninguém notar. O escolhido carrega
`selected_modified_instant_ms`, e o provider **reusa** esse valor em vez de
reparsear: reparsear criaria uma segunda oportunidade de divergir, que é o defeito
original.

O comparador ordena por instante decrescente, e instantes iguais caem em
`compareCodeUnits(file_id)` — a direção governada, preservada exatamente.

## 25.3 Tempo ilegível falha fechada

Candidato **elegível** com `modified_time` ilegível torna `LATEST_MODIFIED`
indeterminado. Novo desfecho `time_unparseable`, que o provider mapeia para
`invalid_source / SOURCE_TIME_UNPARSEABLE`, com os candidatos ofensores à vista e o
valor bruto preservado.

Nenhum atalho: tratar como o mais antigo, como o mais novo, pulá-lo, ou cair no
`file_id` — todos escolhem um vencedor que a regra não sustenta, e nada no resultado
diria isso. O ramo de recusa **não tem** `selected_file_id`; um teste afirma a
ausência na serialização.

Candidato de MIME incompatível com tempo ilegível **não** recusa: ele não disputa,
então não pode inviabilizar a regra.

## 25.4 Testes

| # | prova |
| --- | --- |
| — | o defeito, demonstrado: string diz `true`, instante diz `false` |
| B | fração posterior vence, com `file_id` nas duas direções |
| A | instante equivalente com precisão diferente → desempate por `file_id` |
| C | diferença cronológica normal preservada |
| — | fuso explícito: `17:30-01:00` vence `18:00Z` (é 18:30Z) |
| D | tempo ilegível recusa, sem vencedor; e as formas que `Date.parse` aceitaria |
| E | todas as 6 permutações com variantes de precisão escolhem o mesmo |
| §10 | **o caminho de produção** usa este comparador |

O teste de produção é o que fecha o achado: dois arquivos em que a comparação de
string escolheria o vazio, atravessando o provider inteiro. Com o defeito, a captura
sairia `AVAILABLE_EMPTY` — o mês pareceria sem contratos.

O `file_id` nos casos A e B foi escolhido nas duas direções de propósito: se o
desempate estivesse decidindo o que o instante deveria decidir, um dos dois daria o
vencedor errado.

## 25.5 Entrega

```
SELECTION RULE                LATEST_MODIFIED_THEN_STABLE_FILE_ID  (inalterada)
TIMESTAMP COMPARISON          PARSED INSTANT
LEXICOGRAPHIC TIME COMPARISON REMOVED — nenhuma sobrou em integration/src/lucas
EQUIVALENT PRECISION TEST     PASS
LATER FRACTION TEST           PASS
UNPARSEABLE CANDIDATE         invalid_source / SOURCE_TIME_UNPARSEABLE,
                              candidatos ofensores preservados, nenhum vencedor
FILE_ID TIE BREAK             instantes iguais → menor file_id por code unit
                              (direção governada preservada)
API ORDER INDEPENDENT         YES — 6/6 permutações com variantes de precisão
DUPLICATE RESULT              available + degraded + DUPLICATE_SOURCE_WARNING
A WITH DUPLICATE              runs
LOW-TICKET WITH DUPLICATE     runs
TESTS                         1930 intelligence (38 arquivos, +12) · 190 portal
                              typecheck OK · lint intelligence OK
                              lint portal: 16 erros PRÉ-EXISTENTES, 0 em arquivo
                              desta fase
```

**Arquivos:** novo `source-time.ts`; modificados `file-selection.ts` (comparador,
`modified_instant_ms`, desfecho `time_unparseable`), `provider.ts` (consome o novo
desfecho e o instante já parseado), `tests/lucas/file-selection.test.ts` (+12).

**Intocados:** adaptador Google, escopos, restrição de pasta, paginação,
`FORMATTED_VALUE`, verificação de aba, higienização de erro, evidência, `row_key`,
`subject_ref`, `Venc`, C e D deferidos, B não integrado, A, low-ticket, policy, D13,
`expected_units`.

Sem commit, sem push, nada ingerido.

---

# 26. Fase 2.11d — validação estrita de RFC3339

O gate deu **NO-SHIP** com um HIGH, e era o resto do defeito anterior: a 2.11c trocou
comparação de string por comparação de instante e deixou `Date.parse` decidir se o
timestamp era **válido**.

## 26.1 O defeito, medido no runtime

`Date.parse` **normaliza** em vez de recusar:

```
"2026-02-30T18:00:00Z"  →  2026-03-02T18:00:00Z     (+2 dias)
"2026-04-31T18:00:00Z"  →  2026-05-01T18:00:00Z     (+1 dia)
"2026-02-29T18:00:00Z"  →  2026-03-01T18:00:00Z     (+1 dia)
"2026-08-19T24:00:00Z"  →  2026-08-20T00:00:00Z     (+1 dia)
```

Meu regex validava apenas a **forma** — "dois dígitos" — e era exatamente por isso
que `24:00:00` passava. Um `modifiedTime` malformado entrava na cronologia com um
instante inventado, **deslocado em dias**, podia ganhar a seleção e gravar
procedência falsa: a captura afirmaria ter observado a fonte num instante que a fonte
nunca reportou.

Sob a 2.11c, `2026-02-30T18:00:00Z` normalizaria para 2 de março e venceria um
candidato legítimo de 28 de fevereiro.

## 26.2 A correção

Componentes **capturados** e validados antes de qualquer conversão:

```ts
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/
```

| componente | validação |
| --- | --- |
| mês | `01`–`12` |
| dia | `1 <= dia <= diasNoMes(ano, mes)` — calendário gregoriano real |
| hora | `00`–`23` |
| minuto / segundo | `00`–`59` |
| fuso | `Z` ou `±HH:MM` com hora `00`–`23` e minuto `00`–`59` |

A conversão é **aritmética explícita** sobre valores já provados:
`Date.UTC(...)` menos o deslocamento do fuso. `Date.UTC` também normalizaria, mas não
pode — nenhum valor fora de faixa chega até ele. **`Date.parse` deixou de
participar.**

### Segundo 60 é recusado por decisão

RFC3339 admite segundo intercalar. O runtime não o representa — um `Date` não tem
`23:59:60` — e aceitá-lo obrigaria a mapeá-lo para `00:00:00` do dia seguinte, que é
precisamente a normalização silenciosa que este módulo existe para recusar. O Drive
não emite segundo intercalar.

### Uma autoridade de calendário

`diasNoMes` foi **exportado** de `detectors/src/civil-date.ts` — o mesmo contador que
`parseCivilDateStrict` usa para validar `Venc`. Nenhuma linha de lógica mudou, só a
visibilidade. Escrever um segundo contador aqui criaria duas respostas para "esta data
existe?", e a errada só apareceria quando uma delas aceitasse 30 de fevereiro.

A regra gregoriana completa já estava lá: `/4`, exceto `/100`, salvo `/400`. Teste
cobre 1900 (não bissexto), 2000 (bissexto), 2100 e 2400 — os casos que uma regra só
de `%4` erra e uma de `%4 && !%100` também erra.

### Fuso sem falso negativo

O deslocamento é aplicado ao **instante**, não a uma representação civil deslocada.
Teste cobre a travessia de meia-noite nas duas direções: `00:30+01:00` é `23:30Z` do
dia anterior, e `23:30-01:00` é `00:30Z` do dia seguinte. Uma validação de
round-trip ingênua sobre a data já deslocada reprovaria os dois por engano — é o
risco que §8 nomeia.

## 26.3 Fail-closed preservado

Candidato **elegível** com timestamp malformado → nenhum vencedor,
`invalid_source / SOURCE_TIME_UNPARSEABLE`, ofensores preservados. Teste afirma que
`selected_file_id` e `selected_modified_instant_ms` não aparecem na serialização.

MIME incompatível com timestamp malformado **não** recusa — quem não disputa não pode
inviabilizar a regra. Decisão da 2.11c, preservada.

## 26.4 Testes

`integration/tests/lucas/source-time.test.ts` — **17 novos**. O primeiro afirma o
comportamento de `Date.parse` diretamente, para que a razão da validação estrita não
se perca: se um dia o runtime passar a recusar, o teste falha e avisa que a
justificativa mudou, não que o código quebrou.

`file-selection.test.ts` — **7 novos**, incluindo o cenário exato do gate
(`2026-02-30` normalizaria para dois dias depois do candidato bom e venceria) e a
regressão de produção: malformado não produz snapshot, evidência, linhas nem seleção.

E a regressão cruzada: a validação estrita não quebrou a comparação por instante da
2.11c — fração posterior ainda ganha pelo caminho de produção.

## 26.5 Entrega

```
RFC3339 VALIDATION           STRICT COMPONENT + CALENDAR VALIDATION
DATE.PARSE AS VALIDATOR      NO — não participa; aritmética explícita
INVALID FEB 30               REJECTED
INVALID 24:00                REJECTED
LEAP YEAR                    TESTED — 2024/2026/1900/2000/2100/2400
INVALID OFFSET               REJECTED — +24:00, +01:60, +0100, +1:00
PRECISION VARIANTS           PASS
EQUAL INSTANT TIE-BREAK      PASS
LATER FRACTION               PASS
INVALID ELIGIBLE CANDIDATE   SOURCE_TIME_UNPARSEABLE / NO WINNER
                             sem snapshot, sem evidência, sem detector
PRODUCTION PATH              usa `sourceInstant` canônico
DUPLICATE NORMAL CASE        available + degraded + DUPLICATE_SOURCE_WARNING
TESTS                        1954 intelligence (39 arquivos, +24) · 190 portal
                             typecheck OK · lint intelligence OK
                             lint portal: 16 erros PRÉ-EXISTENTES, 0 nesta fase
```

**Arquivos:** `source-time.ts` (validação estrita), `detectors/src/civil-date.ts`
(`diasNoMes` exportado — só visibilidade), `tests/lucas/source-time.test.ts` (novo),
`tests/lucas/file-selection.test.ts` (+7).

**Intocados:** `LATEST_MODIFIED_THEN_STABLE_FILE_ID`, desempate por `file_id`,
duplicidade `available + degraded + warning`, adaptador Google, escopos, restrição de
pasta, paginação, `FORMATTED_VALUE`, evidência, `Venc`, A, low-ticket, B/C/D,
policy, D13, `expected_units`.

Sem commit, sem push, nada ingerido.

---

# 27. Fase 2.11e — instante exato, até o nanossegundo

O gate deu **NO-SHIP**, e o achado tem uma agravante: meu **teste** codificava a perda
como intencional em vez de recusá-la.

> `sourceInstant` aceita fração de qualquer tamanho mas trunca em 3 dígitos.
> `.1004Z` e `.1009Z` colapsam no mesmo milissegundo, a seleção cai no `file_id`, e o
> arquivo mais antigo pode ganhar.

## 27.1 Três defeitos, a mesma pergunta

"Qual destes dois arquivos é mais recente?" errou três vezes, e cada correção expôs a
seguinte:

| fase | o que corrigiu | o que deixou passar |
| --- | --- | --- |
| 2.11a | `observed_at` string → instante | o comparador de seleção seguia em string |
| 2.11c | seleção em instante | `Date.parse` decidia a **validade** e normalizava |
| 2.11d | validação estrita de componentes | truncava a fração em 3 dígitos |

O padrão é o mesmo nas três: **uma representação mais pobre que a fonte.** String não
ordena cronologia. `number` de milissegundos não representa nanossegundo. A correção
desta fase não é mais um remendo na comparação — é fazer a representação carregar
tudo o que a fonte carrega.

## 27.2 `SourceInstant`

```ts
export interface SourceInstant {
  readonly epoch_seconds: number   // inteiro, negativo antes da época
  readonly nanos: number           // 0..999_999_999, exato
}
```

O contrato de Timestamp do Google tem resolução de **nanossegundo**, e `modifiedTime`
é RFC3339 com fração de tamanho livre. Um `number` de milissegundos descarta 6 dígitos
decimais — e descartar informação de ordenação numa regra chamada LATEST_MODIFIED é a
definição do defeito.

**Não existe campo de milissegundos, de propósito.** Enquanto houvesse um, um
consumidor futuro poderia comparar só ele e reintroduzir o colapso sem que nada
falhasse. Por isso `selected_modified_instant_ms: number` virou
`selected_modified_instant: SourceInstant` — o nome e o tipo não permitem mais a
comparação errada.

## 27.3 Nenhum `Date` na conversão

`Date.UTC` remapeia anos 0–99 para 1900–1999: `0099` viraria `1999`, com o calendário
do ano errado. Codex sinalizou isso preventivamente, e a saída foi eliminar `Date` da
conversão.

Os dias desde a época vêm de `days_from_civil` (Howard Hinnant): aritmética inteira
pura, correta para todo o gregoriano proléptico, sem caso especial de ano e sem
dependência do fuso da máquina. Março como início do ano faz o dia bissexto cair no
fim, eliminando o caso especial de fevereiro.

```
epoch_seconds = diasDesdeEpoca(a,m,d) * 86400 + h*3600 + min*60 + s - offsetSegundos
nanos         = fração, padded a 9 dígitos, exata
```

O fuso desloca **segundos**, nunca nanos. Teste afirma que
`17:30:00.100900000-01:00` é o mesmo instante que `18:30:00.100900000Z`, com os nanos
intactos.

Época e datas conhecidas conferidas contra valores independentes: `1970-01-01` = 0,
`2000-01-01` = 946.684.800, `2024-02-29` = 1.709.164.800, `1969-12-31T23:59:59Z` = −1.

## 27.4 Precisão: 1 a 9 dígitos, e mais que isso recusa

```
sem fração     →           0
.1             → 100_000_000
.1004          → 100_400_000
.123456        → 123_456_000
.123456789     → 123_456_789
.1234567891    → null  →  SOURCE_TIME_UNPARSEABLE
```

Truncar 10 dígitos seria repetir o defeito com outro número. A fonte enviou precisão
que este contrato não representa, e recusar é honesto.

Teste cobre explicitamente os níveis que o Google emite — **0, 3, 6 e 9** — porque
assumir que produção sempre manda 3 foi exatamente o que levou ao truncamento.

## 27.5 Um comparador

`compareSourceInstant(a, b)` é o único comparador de cronologia de fonte. Segundos,
depois nanos, e `0` só quando iguais **até o nanossegundo** — é aí que o desempate
por `file_id` entra.

`Date.parse` desapareceu por completo dos módulos Lucas; verifiquei por grep. O
`ingested_at` também sobe para `SourceInstant` via `instantFromDate`, atendendo ao
§24: truncar a fonte de volta para milissegundo faria `.1009` e `.1000` compararem
iguais — a perda reintroduzida pela porta de trás. `instantFromDate` usa `floor` em
vez de `%` para que instantes antes da época não produzam nanos negativo.

## 27.6 A prova de que os testes pegam o defeito

Rodei uma **mutação**: revertendo `fracaoParaNanos` ao truncamento em 3 dígitos,
**12 testes falham** — 9 de `source-time` e 3 de seleção, incluindo o de produção.
Restaurado, 75 passam.

O teste que fecha o achado constrói o cenário adversário:

```
aaa  .1004Z  →  MAIS ANTIGO, mas o menor file_id o escolheria
zzz  .1009Z  →  mais recente, mas perderia o desempate
```

Se a cronologia colapsar outra vez, `aaa` ganha — e `aaa` tem zero linhas, então a
captura sairia **vazia**: o mês pareceria sem contratos a partir de conteúdo velho.
Com a correção, `zzz` é selecionado e o pipeline inteiro deriva dele: procedência,
snapshot, `row_key` da evidência, Detector A e low-ticket.

E as permutações incluem variantes de sub-milissegundo: `.1009` e `.100900000` são o
mesmo instante e empatam por `file_id`; `.1004` perde por nanos. 6/6 iguais.

## 27.7 Entrega

```
SOURCE INSTANT REPRESENTATION  { epoch_seconds: number, nanos: number }
MAX PRECISION                  NANOSECONDS / 9 dígitos
MILLISECOND TRUNCATION         REMOVED — nenhum campo `_ms` restante
DATE.PARSE SOURCE AUTHORITY    NO — ausente de todos os módulos Lucas
.1009 VS .1004                 .1009 vence, contra o desempate
1 NANOSSEGUNDO                 PRESERVADO
MICROSSEGUNDO                  PRESERVADO
9 DÍGITOS                      PRESERVADO
>9 DÍGITOS                     SOURCE_TIME_UNPARSEABLE, sem truncar
FRAÇÕES EQUIVALENTES           .1 == .100 == .100000000 → file_id
INGESTED_AT                    mesma representação exata (instantFromDate)
RAW MODIFIED_TIME              PRESERVADO em `modified_time` e na procedência
API ORDER INDEPENDENT          YES — 6/6 com variantes de sub-ms
DUPLICATE NORMAL RESULT        available + degraded + DUPLICATE_SOURCE_WARNING
A                              runs
LOW-TICKET                     runs
TESTS                          1967 intelligence (39 arquivos, +13) · 190 portal
                               mutação: 12 testes matam o truncamento
                               typecheck OK · lint intelligence OK
                               lint portal: 16 PRÉ-EXISTENTES, 0 nesta fase
```

**Arquivos:** `source-time.ts` (reescrito), `file-selection.ts`
(`modified_instant`/`selected_modified_instant`, comparador canônico), `provider.ts`
(§24), `tests/lucas/source-time.test.ts` e `tests/lucas/file-selection.test.ts`.

**Intocados:** adaptador Google, auth, escopos, pasta, paginação,
`FORMATTED_VALUE`, `Status Contratos`, semântica de duplicidade, `degraded`,
`conflicts: []`, evidência, `row_key`, `subject_ref`, `Venc`, A, low-ticket, B/C/D,
policy, D13, `expected_units`.

Sem commit, sem push, nada ingerido.
