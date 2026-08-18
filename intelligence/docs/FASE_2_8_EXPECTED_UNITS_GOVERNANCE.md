# Fase 2.8 — `expected_units` governado

Fecha o modelo do **denominador** da cobertura. A política já sabia como avaliar
cobertura; faltava de onde vem a lista de unidades esperadas.

A Política Creditum v1 **não mudou**. SHA-256 continua
`db7a880b1d9ab357b2c2d46ddedf712699cfd351488e24482b1cd03832167a73`.

## 1. Estado

| | estado |
| --- | --- |
| Política Creditum v1 | **COMPLETA / SHIP** |
| Modelo de `expected_units` | **`period` + `dataset_id` + `unit_id`** |
| Dados reais de `expected_units` | **AINDA NÃO DISPONÍVEIS** |
| Execução factual dos detectores | **PERMITIDA** mesmo sem membership |
| Avaliação de cobertura sem membership | **EXPLICITAMENTE INDISPONÍVEL** — nunca "ok" |
| Catálogo ativo | **NÃO é denominador** |
| Unidades observadas | **NÃO são denominador** |

## 2. Duas autoridades, dois artefatos

`expected_units` é **dado**, não configuração.

| artefato | decide |
| --- | --- |
| `governance/policy/creditum-policy.v1.json` | limiares e semântica de cobertura |
| `governance/expected-units/{period}__{dataset_id}.json` | membership operacional |

Enfiar membership na política faria o arquivo de decisões de negócio mudar todo
mês, e o hash da política deixaria de significar "as decisões da Creditum" para
significar "as decisões mais o mês corrente".

## 3. O schema

```json
{
  "schema_version": "1.0.0",
  "period": "2026-08",
  "dataset_id": "ds_vendas_mensal",
  "expected_units": [{ "unit_id": "mogi" }, { "unit_id": "santos" }],
  "provenance": {
    "source_system": "nome_governado",
    "source_version": "1.0.0",
    "content_hash": "<sha256 do material da membership>"
  }
}
```

`period` é `AAAA-MM` estrito. `"agosto"`, `"08/2026"`, `2026-8`, `2026-13`, um
timestamp — todos recusados. Normalização de data é onde nascem os fusos errados, e
o período aqui é etiqueta civil, não instante.

`dataset_id` é **obrigatório**. Não existe membership global: Leonardo e Lucas
podem ter expectativas diferentes no mesmo mês, e um denominador compartilhado
misturaria universos.

`unit_id` usa a `UnitId` governada do D13. Nome cru de fonte não entra — `"Grau
Mogi"` e `mogi` não são comparáveis, e comparar ingenuamente contaria a mesma
unidade como ausente.

## 4. Regras fail-closed

| condição | resultado |
| --- | --- |
| `unit_id` fora do catálogo governado | recusa |
| `unit_id` duplicado em `period + dataset_id` | recusa — **nunca deduplicado** |
| `expected_units` vazio | recusa |
| `period` / `dataset_id` / `schema_version` inválidos | recusa |
| procedência incompleta | recusa |
| `content_hash` divergente da membership | recusa |
| arquivo do provider ausente | `DATA_NOT_AVAILABLE` |
| JSON corrompido | recusa — **corrupção é defeito, não ausência** |

Duplicata não é deduplicada porque deduplicar esconderia um erro de origem que
alguém precisa corrigir — e infla o denominador silenciosamente.

Lista vazia é recusada porque **ausência de dado não é "zero unidades
esperadas"**. Uma é afirmação sobre o sistema, a outra sobre o negócio. A v1 não
tem forma governada de declarar zero expectativa, e inferi-la de uma lista vazia
produziria `EMPTY_DENOMINATOR` disfarçado de `ok`.

## 5. `content_hash` cobre a membership, não os bytes

Primeira tentativa: hash do arquivo inteiro. Não funciona — o arquivo contém o
campo `content_hash`, e um hash que contém a si mesmo não tem ponto fixo.

O hash cobre o **material canônico**: `schema_version`, `period`, `dataset_id` e a
lista **ordenada**. Consequências desejadas: reindentar o JSON ou reordenar a lista
não invalida o artefato, porque não mudam a membership; trocar uma unidade
invalida, porque muda.

## 6. Provider

```ts
interface ExpectedUnitsProvider {
  getExpectedUnits(q: { period: string; dataset_id: string }): ExpectedUnitsLookup
}

type ExpectedUnitsLookup =
  | { status: "available"; membership: GovernedExpectedUnits }
  | { status: "DATA_NOT_AVAILABLE"; period; dataset_id; detail }
```

União discriminada: ausência tem ramo próprio e **nunca** é `[]`.

Síncrona porque o único provider que existe lê arquivo versionado. Uma `Promise`
obrigaria todo consumidor a ser assíncrono por causa de um storage que ainda não
foi decidido — trocar por Supabase depois é trocar a implementação, não a lógica
de cobertura.

`FileExpectedUnitsProvider` valida `period` e `dataset_id` **antes** de montar
caminho: um `dataset_id` com `/` ou `..` seria travessia de diretório.

### O diretório de produção está vazio, e isso é o estado correto

`governance/expected-units/` contém só o README do formato.
`PRODUCTION_EXPECTED_UNITS_PROVIDER` aponta para ele e responde
`DATA_NOT_AVAILABLE` para todo período e dataset. Não é stub: é o provider real
sobre a fonte real, que está vazia porque os dados não existem.

As fixtures de teste vivem em `detectors/tests/fixtures/` e
`integration/tests/fixtures/`. São TEST_ONLY.

## 7. Cobertura

```
expected_count             tamanho da membership
observed_expected_count    esperadas que reportaram
missing_unit_ids           esperadas que não reportaram, NOMEADAS
missing_count              quantas
missing_share_bp           piso da divisão exata, em bp inteiros
ratio_bp                   complemento exato: as duas somam 10000 sempre
unexpected_observed_unit_ids   observadas sem serem esperadas
```

Aritmética inteira. `missing_share_bp` e `ratio_bp` são complementos exatos, sem
arredondamento independente que pudesse discordar de si mesmo no limite.

A qualidade segue a política já aprovada, com o limiar vindo dela por parâmetro:

```
ausente = 0                      → ok
ausente >= 1 e share < limiar    → degraded
share >= limiar                  → insufficient
```

`conflicted` continua prevalecendo no lattice; a precedência é do chamador.

### Observadas extras não entram no denominador

Uma unidade que reportou sem ser esperada é fato de governança — talvez a
expectativa esteja desatualizada, talvez o dado esteja errado — e decidir isso não
é papel de um cálculo. Ela é preservada em `unexpected_observed_unit_ids`, sem
juízo de severidade ou materialidade.

Somá-la ao denominador diluiria a ausência de quem faltou: 2 ausentes de 20 é 1000
bp e `insufficient`; contando uma extra, 2 de 21 daria 952 bp e viraria `degraded`.
Há teste para exatamente isso.

## 8. As duas dimensões que não se sobrepõem

**Ativa fora da lista não entra no denominador.** 20 esperadas com 44 ativas: se o
denominador fossem as ativas, 20 de 44 daria 5455 bp de ausência e todo período
pareceria catastrófico para sempre.

**Inativa explicitamente esperada ENTRA no denominador.** Status de catálogo e
expectativa do período são dimensões separadas. Se o dado governado declara que a
unidade era esperada, ela conta — e se não reportou, é ausente. O código não
sobrescreve o dado governado usando `active = false`.

## 9. Reingestão e versão

`membership_id` é identidade estrutural sobre `period`, `dataset_id` e a lista
ordenada. Mesma membership em ordem diferente tem o mesmo id; membership diferente
tem id diferente. É o que torna uma substituição silenciosa detectável, junto com
o `content_hash`.

Membership diferente exige `source_version` nova. Trocar a lista sem atualizar a
procedência é recusa.

## 10. Testes

| suíte | testes |
| --- | --- |
| `expected-units` (nova) | **64** |
| `production-config-e2e` | 40 → **48** |
| A / B / C / D / low-ticket / production-policy | 173 / 91 / 200 / 157 / 84 / 160 — inalterados |

Cobrem §21 A–O: as cinco fronteiras de qualidade, ativa-não-esperada,
inativa-esperada, extras observadas, id desconhecido, duplicata,
`DATA_NOT_AVAILABLE`, ausência de fallback para catálogo e para observado,
determinismo de ordem e imutabilidade profunda.

**Mutação — quatro mutantes, todos mortos:**

| Mutante | Resultado |
| --- | --- |
| `expected` = todas as ativas do catálogo | suíte não carrega: `content_hash` recusa; e 14 testes de denominador |
| dado ausente vira `[]` | 6 testes |
| `expected` = observado | 14 testes |
| inativa esperada filtrada fora | suíte não carrega: `content_hash` recusa |

Dois mutantes morrem no `content_hash` antes de chegar à asserção, porque alterar
a membership derivada quebra a procedência. É defesa a mais, não a menos — e os
testes de denominador matam a variante que não toca o hash.

## 11. Storage futuro

Não decidido. A interface permite trocar o provider sem alterar a lógica de
cobertura, e é isso que a fase entrega. Supabase, arquivo governado ou outra fonte
é decisão para quando existir fonte real.

## 12. Blockers depois da 2.8

1. **Dados reais de `expected_units`** — o modelo, o schema, o validador, o
   provider e a cobertura existem. Falta a membership operacional, que é dado de
   negócio e ninguém pode inventar.
2. **Leonardo → Supabase** — tabela/view/schema/`as_of` reais.
3. **Lucas → arquivo mensal** — contrato de arquivo, storage, provider.
4. **Briefing determinístico** — engenharia, dependente da decisão de read-model.
5. **Hermes read-model** — não iniciado, por decisão.

## 13. Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓, **1705 testes / 29 arquivos**.
Portal `tsc --noEmit` limpo, portal 182, motor CEO 182. Fases 2.6c e 2.7
preservadas; A/B/C/D sem regressão.

---

# 14. Fase 2.8a — cobertura como estado explícito

A 2.8 deixou uma brecha: `unit_coverage` é campo **opcional** nos detectores, e sem
membership a produção simplesmente omitia. `undefined` passava a significar três
coisas ao mesmo tempo — "não pedi cobertura", "não avaliei" e "não tenho o dado" —
e um consumidor futuro não teria como distingui-las.

**Nenhum schema de contrato mudou.** `event.schema.json` continua com
`data_quality` idêntico: `quality_status`, `conflict_ids`, `missing_fields`,
`coverage_ratio_bp`. A Política v1 também não mudou.

## 14.1 A representação

```ts
type CoverageEvaluation =
  | { status: "available"
      period; dataset_id; membership_id
      expected_count; observed_expected_count
      missing_unit_ids; missing_count; missing_share_bp; ratio_bp
      unexpected_observed_unit_ids
      quality_status }
  | { status: "data_not_available"
      period; dataset_id
      reason: "EXPECTED_UNITS_DATA_NOT_AVAILABLE"
      detail }
```

Repare no que o ramo indisponível **não tem**: `ratio_bp`, `expected_count`,
`missing_count`, `quality_status`. Fabricar não é proibido por convenção — não
existe onde escrever. Um teste afirma o conjunto exato de chaves.

`reason` é conjunto FECHADO. Um motivo novo entra nomeado, nunca como string livre
que viraria mensagem em vez de estado auditável.

## 14.2 Por que a omissão é estruturalmente impossível

A orquestração de produção devolve um tipo em que `coverage` é campo
**obrigatório**:

```ts
interface ResultadoDeProducao {
  readonly coverage: CoverageEvaluation   // não opcional
  readonly installment: ...
}
```

Omitir o estado num resultado de produção é **erro de tipo**, não descuido que
alguém precisa lembrar de revisar. O mutante que devolve `undefined` para ausência
falha em `tsc` antes de falhar em teste.

### Um achado no caminho: `integration/` nunca era typecheckado

`tsconfig.json` incluía `gateway/**` e `detectors/**`, mas não `integration/**`. Os
dois harnesses nunca passaram pelo compilador — por isso erros ali só apareciam em
runtime. Incluí `integration/**/*.ts`, e quatro descuidos de tipo vieram à luz:

| erro | consequência real |
| --- | --- |
| `similarity_threshold_bp` em vez de `similarityThresholdBp` no harness sintético | **o limiar de similaridade nunca era aplicado lá** — a opção era ignorada em silêncio |
| `window_mode` tipado como `string` | aceitaria modo inexistente na fixture |
| `claim_set` tipado como `string[]` | aceitaria claim inexistente |
| spread de `T \| undefined` em campo opcional | escondia o problema que esta fase corrige |

Os quatro foram corrigidos. O primeiro é um defeito de teste que existia desde a
Fase 2.6 e passou por todos os gates anteriores.

## 14.3 Detectores continuam executando

Cobertura indisponível **não** interrompe a lógica factual. Provado no harness com
o provider de produção (sem dados):

- `eligible_contracts` = 15, `contracts_above_threshold` = 6 — cálculo intacto;
- Event **emitido**, com 5 contribuintes e severidade da escala aprovada;
- `data_quality.coverage_ratio_bp` **ausente** — nenhum percentual fabricado;
- `coverage.status = "data_not_available"` ao lado, dizendo por quê.

O `undefined` que o detector recebe deixou de ser a única informação disponível: o
estado explícito viaja junto.

## 14.4 Nada é fabricado

Com `DATA_NOT_AVAILABLE`, testes afirmam que a serialização do estado não contém
`ratio_bp`, `expected_count`, `missing_count`, `quality_status`, `"ok"`,
`degraded`, `insufficient`, nenhum `unit_id` observado e nenhuma das 44 ativas do
catálogo.

## 14.5 Um consumidor distingue sem olhar campo ausente

```ts
const decidir = (e: CoverageEvaluation): string =>
  e.status === "available" ? `cobertura ${e.quality_status}` : `cobertura ${e.reason}`
```

`status` é campo **presente** nos dois ramos. Ninguém precisa checar ausência de
nada.

## 14.6 Compatibilidade

`unit_coverage` continua opcional na entrada dos detectores — é o contrato interno
deles, exercitado por fixtures sintéticas, e mudá-lo obrigaria a alterar detectores
SHIP. O que passa a ser garantido é o caminho de **produção**, onde o tipo da
orquestração não admite omissão.

## 14.7 Mutação — três mutantes, todos mortos

| Mutante | Resultado |
| --- | --- |
| `DATA_NOT_AVAILABLE` → `undefined` | **2 erros de `tsc`** + suíte não carrega |
| `DATA_NOT_AVAILABLE` → disponível com lista vazia | 8 testes |
| `DATA_NOT_AVAILABLE` → catálogo ativo | 9 testes |

## 14.8 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓ (agora **incluindo
`integration/`**), **1723 testes / 29 arquivos**. Portal `tsc --noEmit` limpo,
portal 182, motor CEO 182.

`expected-units` 64 · `production-config-e2e` 48 → **66** · integração total
**113** · A 173 · B 91 · C 200 · D 157 · low-ticket 84 · `production-policy` 160 —
sem regressão.

---

# 15. Fase 2.8b — o caminho de produção nos três detectores

A 2.8a provou a garantia com o Detector A. Aqui C e D passam pela **mesma**
orquestração, e o contrato virou genérico.

## 15.1 Um contrato, três detectores

```ts
interface ResultadoDeProducao<T> {
  readonly coverage: CoverageEvaluation   // obrigatório
  readonly detector: T
}
```

Genérico de propósito. Três tipos separados permitiriam que um deles perdesse o
campo sem ninguém notar; três transformações de cobertura permitiriam que
divergissem.

A resolução de cobertura é **uma** — `evaluateCoverage` + `coverageForDetector`.
Não existem `coverageForA`, `coverageForC` nem `coverageForD`, e há teste que varre
o fonte com limite de palavra para garantir. (Asserção ingênua de substring falhava
contra o nome legítimo `coverageForDetector`, que contém `coverageForD`.)

Um teste afirma que o estado serializado é **byte a byte idêntico** nos três, nos
dois caminhos — é a prova de que a resolução é compartilhada e não replicada.

## 15.2 Detector C

| caminho | resultado |
| --- | --- |
| `DATA_NOT_AVAILABLE` | concentração observada calculada (6 contratos no alvo 04/09), Event emitido, `coverage_ratio_bp` ausente, `reason = EXPECTED_UNITS_DATA_NOT_AVAILABLE` |
| `AVAILABLE` | `expected_count` 3, `missing_count` 0, `ratio_bp` 10000, `quality_status` ok, e `coverage_ratio_bp = 10000` no Event |

Claims e provenance SHIP de C inalterados: a conferência de provenance é contra o
alvo calculado, e ela passa — se a cobertura tivesse mexido no `claim_set`,
falharia.

## 15.3 Detector D

| caminho | resultado |
| --- | --- |
| `DATA_NOT_AVAILABLE` | 15 candidatos avaliados, o caso de R$ 60 mil material, Events emitidos, nenhum denominador inventado |
| `AVAILABLE` | cobertura avaliada e `coverage_ratio_bp = 10000` no Event |

Matemática contrafactual inalterada: teste afirma que o delta de cada caso é a
própria contribuição, para todas as 15 linhas.

## 15.4 Cobertura indisponível não é fail-stop

Reafirmado nos três: `DATA_NOT_AVAILABLE` ≠ "o detector não pode rodar". O fato
continua sendo calculado, a materialidade continua funcionando, o Event sai se os
outros requisitos SHIP estiverem satisfeitos. O que não sai é um número de
cobertura do nada.

## 15.5 `integration/**` typechecked é invariante

Dois testes protegem contra regressão, sobre a **configuração parseada** e não
sobre substring do arquivo:

1. `tsconfig.include` contém `integration/**/*.ts`;
2. o padrão é expandido e verificado contra caminhos reais — `production-config-e2e`,
   `end-to-end` e `integration/src/ports.ts`.

Mais um terceiro que nomeia o bug que ficou invisível: o harness sintético usa
`similarityThresholdBp`, e a forma errada `similarity_threshold_bp` não pode voltar.

Retirar `integration/**` do include quebra **2 testes**.

## 15.6 Mutação

| Mutante | Resultado |
| --- | --- |
| C pula a orquestração e devolve `{ detector }` sem `coverage` | **erro de `tsc`**: `Property 'coverage' is missing in type '{ detector: FirstDueResult; }' but required in type 'ResultadoDeProducao<FirstDueResult>'` |
| o mesmo, com `as` forçando o tipo | 8 testes em runtime |
| `integration/**` fora do typecheck | 2 testes |

Registrando com honestidade: o primeiro mutante só é pego pelo compilador quando
não há cast. Um `as` deliberado derrota qualquer garantia de tipo — o que a
estrutura impede é o **esquecimento**, não a subversão intencional. Os 8 testes de
runtime cobrem o caso com cast.

## 15.7 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓ (incluindo `integration/`),
**1749 testes / 29 arquivos**. Portal `tsc --noEmit` limpo, portal 182, motor CEO
182.

`production-config-e2e` 66 → **92** · `end-to-end` 47 · `expected-units` 64 ·
A 173 · B 91 · C 200 · D 157 · low-ticket 84 · `production-policy` 160 — sem
regressão. Política v1 com hash inalterado.

---

# 16. Correção do HIGH final — contrato público único

O gate encontrou uma segunda porta pública de `expected_units` em
`integration/src/ports.ts`:

```ts
export interface ExpectedUnitsProvider {
  forPeriod(period_start: string, period_end: string): Promise<number | null>
}
```

Quatro divergências do contrato governado, cada uma capaz de produzir um
denominador inauditável:

| divergência | consequência |
| --- | --- |
| consulta por FAIXA DE DATAS | `expected_units` é governado por `period` estrito `AAAA-MM`; o domínio mudaria para acomodar o formato de um storage |
| sem `dataset_id` | permitia membership GLOBAL do período — e Leonardo e Lucas podem esperar unidades diferentes no mesmo mês |
| devolvia `number` | um contador não tem `unit_id` nem procedência: ninguém audita QUAIS unidades eram esperadas, nem segundo quem |
| `null` para indisponível | reintroduzia a confusão entre "não tenho o dado" e "o valor é ausente" que a 2.8a fechou |

A interface não tinha implementação nem consumidor — **e era isso que a tornava
perigosa**. Nenhum teste a exercitava, então a divergência era invisível. Um
adaptador futuro poderia satisfazê-la inteira e entregar exatamente o que a Fase
2.8 existe para proibir.

## 16.1 A definição canônica, e onde ela vive

`detectors/src/expected-units.ts` — inalterada. Não foi movida: `integration`
importa `detectors`, e `detectors` não importa `integration`, então não há ciclo e
um módulo neutro novo seria refactor sem ganho.

```ts
interface ExpectedUnitsProvider {
  getExpectedUnits(query: { period; dataset_id }): ExpectedUnitsLookup
}
```

## 16.2 Como a integração referencia

Reexport de tipo, sem adaptação, sem wrapper, sem conversão:

```ts
export type {
  ExpectedUnitsLookup,
  ExpectedUnitsProvider,
  ExpectedUnitsQuery,
  GovernedExpectedUnits,
  ExpectedUnitsProvenance,
} from "../../detectors/src/expected-units"
```

É o **mesmo tipo**, não um tipo compatível.

## 16.3 As provas são de TIPO, não de nome

Um teste que procura o nome no fonte não resolveria: o problema não era o nome, era
a forma. Duas interfaces homônimas com semânticas diferentes passam por qualquer
grep.

`integration/tests/expected-units-contract.test.ts` prova identidade mútua:

```ts
type Identico<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

const PROVIDER_E_O_MESMO: Identico<ProviderCanonico, ProviderDaIntegracao> = true
const QUERY_E_A_MESMA:    Identico<QueryCanonica, QueryDaIntegracao> = true
const LOOKUP_E_O_MESMO:   Identico<LookupCanonico, LookupDaIntegracao> = true
```

Atribuição mútua é o que distingue "reexport do mesmo tipo" de "dois tipos
estruturalmente parecidos". Um provider devolvendo `number | null` falha numa
direção; uma query sem `dataset_id` falha na outra.

Mais: um `FileExpectedUnitsProvider` é atribuído à porta da integração e de volta
ao canônico, **sem cast**.

## 16.4 O que cada prova cobre

| § | prova |
| --- | --- |
| A | os três tipos são idênticos; `ports.ts` não declara interface própria |
| B | `dataset_id` obrigatório; nenhuma consulta de expectativa por faixa de datas |
| C | `number` não satisfaz o retorno |
| D | `null` não satisfaz o retorno, e em runtime nenhuma resposta é nula |
| E | AVAILABLE carrega `unit_id`s governados, procedência e `membership_id` |
| F | DATA_NOT_AVAILABLE permanece discriminado, com chaves exatas e sem contador |
| G | o harness importa o provider canônico; nenhum outro contrato de denominador existe |

`period_start`/`period_end` **continuam** legítimos em `ports.ts` — `RawBatch` os
declara e `SourceAdapter` lê por faixa, que é o que uma fonte bruta faz. A asserção
foi estreitada para proibir faixa apenas na consulta de **expectativa**; a primeira
versão era larga demais e falhava contra uso correto.

## 16.5 Mutação

| Mutante | Resultado |
| --- | --- |
| reintroduzir a interface incompatível em `integration` | **5 erros de `tsc`** + 3 testes |
| tornar `dataset_id` opcional na query canônica | **3 erros de `tsc`**, incluindo a asserção de identidade do próprio teste de contrato |

O segundo é pego só pelo compilador — os 13 testes de runtime passam. Registrado
como é: a obrigatoriedade de `dataset_id` é garantia de tipo, e é por isso que
`integration/**` precisa continuar no typecheck.

## 16.6 Nenhuma supressão

Zero `as any`, `unknown as`, `@ts-ignore` ou `@ts-expect-error` nos arquivos
tocados. As correções de tipo da 2.8a/2.8b foram feitas com os tipos reais, e esta
não introduziu exceção.

## 16.7 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓ (incluindo `integration/`),
**1762 testes / 30 arquivos**. Portal `tsc --noEmit` limpo, portal 182, motor CEO
182. Política v1 com hash inalterado.

`expected-units-contract` (novo) **13** · integração total **152** ·
`expected-units` 64 · A 173 · B 91 · C 200 · D 157 · low-ticket 84 ·
`production-policy` 160 — sem regressão.
