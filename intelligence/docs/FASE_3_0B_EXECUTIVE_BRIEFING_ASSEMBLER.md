# Fase 3.0b — assembler determinístico do ExecutiveBriefingV1

```
DESCONHECIDO NUNCA É ZERO.
NÃO EXECUTADO NUNCA É SEM ACHADOS.
NÃO MEDIDO NUNCA É MEDIDO-E-INSUFICIENTE.
```

```
ASSEMBLER            assembleExecutiveBriefingV1
PURO                 sem I/O, sem relógio, sem sorteio, sem modelo
ESTADOS TRATADOS     os seis de produção do Lucas, switch exaustivo
PRAZO                transportado da 2.13, nunca recalculado
POPULAÇÕES           countPopulations da 2.12, chamada — não reescrita
SAÍDA                validada contra executive-briefing antes de retornar
TESTES               73 · 13 mutações executadas, 13 mortas
```

## 1. O que ele é, e o que ele não é

Uma função pura: mesma entrada, mesma saída, incluindo o `briefing_id`. Ela não
raciocina, não recomenda, não prioriza e não escreve narrativa — não existe campo para
"as vendas estão preocupantes". Isso é `HermesInsight` com `kind` declarado, e é fase
futura.

Ela também **não recalcula regra de negócio**:

```
populações comerciais   countPopulations  (Fase 2.12) — CHAMADA
fatos de prazo          já calculados     (Fase 2.13) — TRANSPORTADOS
qualidade e cobertura   já no snapshot    (Fase 2.11) — LIDAS
findings                eventos do Detector D         — TRANSPORTADOS
```

Recalcular criaria uma segunda resposta para a mesma pergunta, e a que estivesse
errada só apareceria no dia em que as duas discordassem. Teste varre o briefing
serializado afirmando a ausência de `deadline_offset_days`, `calendar_rule`,
`timezone`, `D-4` e `D-1`.

## 2. Onde vive, e por quê

```
integration/src/briefing/executive-briefing.ts   o assembler
integration/src/briefing/source-projection.ts    exposição do que a captura calculou
integration/tests/briefing/                      os testes
```

O assembler consome tipos de `integration` e produz um contrato validado por
`gateway`. A direção de dependência do repositório é **integration → gateway**, nunca o
contrário: pôr o assembler em `gateway/src` faria os contratos dependerem de quem os
consome. Não criei `hermes-runtime/` — não há runtime nenhum aqui.

## 3. A projeção que faltava — e por que não é regra nova

`ExecutiveBriefingV1` exige `quality_and_coverage` e `evidence_index`. Os dois valores
já existiam desde a 2.11, dentro da captura. O que faltava era **exposição**:
`LucasAnalysisOutcome` não os carregava.

Três caminhos, dois ruins:

| caminho | problema |
| --- | --- |
| input que ninguém em produção preenche | a peça órfã que quatro NO-SHIP me ensinaram a reconhecer |
| assembler recalcula qualidade/cobertura | segunda autoridade sobre o mesmo número |
| **expor o que já foi computado** | nenhum |

`projectLucasSource(capture)` lê campos governados e não decide nada. Em `analysis.ts`
entrou um campo `source` nos dois estados que têm captura — adição puramente aditiva,
sem tocar em como a captura decide. Os 372 testes do Lucas seguiram verdes sem
alteração.

`not_current` ficou de fora de propósito: a captura existe mas é de **outro período**, e
reportar a qualidade dela num briefing do mês corrente seria descrever a coisa errada.
Ele cai naturalmente em `not_measured` — não houve medição *deste* período.

Nos dois estados utilizáveis o campo é **obrigatório e não-nulo**. Ver §5c: era
anulável, e a anulabilidade era um estado impossível exposto como possível.

## 4. Os seis estados, um por um

`switch` exaustivo sobre `LucasAnalysisOutcome.status`. Estado novo a montante sem
tratamento aqui **não compila** — sem isso, um estado novo cairia num `default` e
apareceria como "fonte ok".

| estado | `view_state` | métricas | qualidade | Detector D |
| --- | --- | --- | --- | --- |
| `source_not_available` | `data_not_available` | **ausentes** | `not_measured` | `unavailable` |
| `source_error` | `source_error` | **ausentes** | `not_measured` | `unavailable` |
| `source_invalid` | `invalid_source` | **ausentes** | `not_measured` | `unavailable` |
| `not_current` | `data_not_available` | **ausentes** | `not_measured` | `unavailable` |
| `d_not_executed` | da projeção | presentes | medida | `not_executed` + razão |
| `d_executed` | da projeção | presentes | medida | `executed_*` |

Nos dois últimos o `view_state` é `available` ou `available_empty` conforme a captura —
**transportado**, não redecidido aqui (§5d), e o MESMO valor em `source_health` e em
`commercial_state` (§5e).

**Ausentes, não zero.** O schema proíbe métrica nos estados sem captura, e o assembler
não tenta. Mutação que injeta `commercial_potential: 0` nesse ramo mata cinco testes.

`not_current` recebe `data_not_available`: `available` seria enganoso num briefing do
mês corrente, e `source_error` culparia a fonte por uma condição temporal.

**`not_executed` nunca é `executed_no_findings`.** A razão governada viaja com o
estado — `NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION` quando é ela. E os fatos
comerciais **sobrevivem**: um sujeito repetido impede D e não tem relação com
assinatura pendente. Mutação que troca um pelo outro mata teste.

**Zero achados com D executado é ZERO CONHECIDO**: rodou e não encontrou.
`executed_no_findings`, distinto de `unavailable`.

## 5. Qualidade: medido não é não-medido

A primeira versão desta fase escrevia `insufficient` nos quatro estados sem captura, e
o teste que a cobria afirmava exatamente isso. Os dois estavam errados, e a revisão
adversarial provou por quê: o vocabulário governado define

```
insufficient   cobertura baixa demais para afirmar
```

que é um **resultado de medição**. Escolher um resultado medido para representar a
ausência de medição é inventar veredito — a mesma família de defeito que
"desconhecido virou zero", só numa casa diferente.

São três situações, e a terceira não é a segunda:

| situação | vocabulário |
| --- | --- |
| medido e suficiente | `ok` · `degraded` |
| medido e insuficiente | `insufficient` · `conflicted` |
| **NÃO medido** | **`not_measured`** |

`not_measured` não existia. A emenda ao contrato (§ abaixo) o criou como ramo
discriminado, e no ramo não-medido **não existe onde escrever** `expected_units`:
`additionalProperties: false` fecha a estrutura. Ausência de medição não tem como
virar medição de zero, e a proteção não depende de ninguém lembrar.

`insufficient` não foi banido — foi devolvido ao seu significado. Um teste constrói
projeção com medição real `insufficient` e afirma que o briefing a transporta; outro
faz o mesmo com `conflicted`. E os dois estados medidos que o pipeline produz hoje,
`ok` e `degraded`, chegam pelo caminho real.

### Estado da fonte e estado da medição são dimensões diferentes

```
source_health = source_error        como foi a AQUISIÇÃO da fonte
quality       = not_measured        houve MEDIÇÃO de qualidade?
```

Colapsar os dois perderia informação: `source_error` continua dizendo que a leitura
falhou, e `not_measured` diz que ninguém mediu. Um não substitui o outro.

## 5b. A emenda de contrato, e por que ela foi necessária

A 3.0a foi aprovada. Reabri-la exige justificativa, e aqui ela é estrutural: o
`ExecutiveBriefingV1` que zarpou **não sabia dizer "não medi"**. Todo valor do
vocabulário era um resultado de medição, então qualquer escolha seria uma afirmação
falsa. Não é preferência de nomenclatura — é uma incompatibilidade entre o contrato e
um estado real que a produção alcança nos quatro caminhos sem captura.

```
EMENDA DE COMPATIBILIDADE — exigida pelo estado real dos dados
alcance:   executive-briefing.schema.json → quality_and_coverage, e só
intocado:  ApprovalRequest · DecisionRecord · SharedBriefing · HermesInsight
           DashboardObservation · MarketObservation · ContentMission
           ContentPackage · HermesReadModel · toda a autoridade da 3.0a
```

Nenhum outro contrato referencia `quality_and_coverage` — verifiquei antes de editar,
e é o que mantém a emenda pequena de verdade em vez de pequena no discurso.

## 5c. Resultado utilizável exige a fonte que o sustenta

O segundo achado: `d_executed` e `d_not_executed` declaravam `source` como anulável.
Em runtime nunca era nulo — a orquestração só chega lá depois de estreitar a captura —
mas o `| null` viajava no tipo público e chegava ao assembler como se *"resultado
utilizável sem projeção"* fosse um estado possível. Com um objeto desserializado ou um
`as`, o briefing publicaria `available` com índice de evidência vazio e qualidade
fabricada.

Duas correções, e as duas eram necessárias:

```
TIPO      projectLucasSource passou a aceitar a captura UTILIZÁVEL e devolver
          projeção — não `projeção | null`. A saída impossível morreu na origem,
          e a não-nulidade passou a ser garantida pela ESTRUTURA do fluxo.

RUNTIME   o assembler confere a projeção antes de montar qualquer métrica.
          Tipo não roda em produção — é o mesmo furo que a 3.0a fechou.
```

A conferência de runtime olha só o que o briefing consome: `dataset_id`, `view_state`,
`quality_status` medido, `evidence_ids`, `source_quality`, `row_quality_counts`,
`coverage`. Endurecer campos que ninguém lê transformaria qualquer bug interno em
`INVALID_INPUT` e afogaria o sinal.

E a classificação importa:

```
MISSING_REQUIRED_SOURCE_PROJECTION    invariante violada — defeito NOSSO
source_not_available                  estado de negócio — a fonte não estava lá
```

Chamar o primeiro de segundo esconderia um bug de integração atrás de uma resposta
plausível sobre a planilha do Lucas. Vazio **válido** continua sendo vazio válido:
planilha lida com zero contratos dá `available_empty` com projeção completa, e é
distinguível de fonte perdida.

## 5d. Uma autoridade para `available` × `available_empty`

O assembler derivava esse estado de `row_count === 0`. O provider já o decide ao
construir a captura. Duas autoridades sobre a mesma distinção — hoje concordantes, e
por isso mesmo perigosas: a divergência só apareceria em produção, no dia em que
discordassem. A projeção passou a transportar `view_state`, e o assembler a repeti-lo.

## 5e. Um estado de fonte, duas dimensões

A 5d transportou o `view_state` para `commercial_state` e **esqueceu** o
`source_health`, que seguia com `available` fixo para os dois estados utilizáveis. Com
captura vazia legítima o briefing passou a afirmar as duas coisas ao mesmo tempo:

```
source_health.view_state    = available
commercial_state.view_state = available_empty
```

Contraditório, e **válido pelo schema** — que permite os cinco estados nas duas
dimensões e não tem como saber que descrevem a mesma fonte. O teste de vazio afirmava
só a dimensão comercial, então a contradição passou.

Corrigido pela estrutura, não pela disciplina: os dois estados utilizáveis **saíram**
da função que decide estado de fonte, que agora cobre apenas os quatro sem captura. O
valor é calculado uma vez e usado nas duas dimensões. Duas leituras independentes da
mesma verdade é como a contradição nasceu.

## 5f. Forma de tipo não é valor governado

A guarda de runtime da 5c perguntava *"é string?"* e seguia. Isso deixava passar:

```
dataset_id: "fabricated_dataset"          identidade de fonte inventada
source_quality: ["FABRICATED_STATE"]      fato de qualidade inventado
row_quality_counts: { FABRICATED: 12 }    contagem sobre fato inexistente
```

Os três produziam briefing **válido pelo schema**, porque o schema tipa `string` e não
distingue rótulo governado de rótulo fabricado. Numa nota model-facing isso é pior que
texto livre: parece medição determinística.

Agora todo campo que representa identidade, vocabulário ou fato governado é conferido
contra a lista canônica, **importada de onde ela vive** — `LUCAS_DATASET_ID`,
`SOURCE_QUALITY_FACTS`, `ROW_QUALITY_FACTS`. Sem lista paralela.

```
dataset_id            === LUCAS_DATASET_ID, exato
view_state            ∈ { available, available_empty }
quality_status        ∈ os quatro MEDIDOS
source_quality        cada entrada ∈ SOURCE_QUALITY_FACTS
row_quality_counts    chave PRÓPRIA ∈ ROW_QUALITY_FACTS · valor inteiro seguro ≥ 0
coverage              inteiros seguros ≥ 0
```

Três decisões merecem registro:

**Chave desconhecida recusa, não descarta.** Colher as chaves conhecidas e jogar o
resto fora deixaria passar uma projeção que já provou não ser governada. É o mesmo
princípio de fronteira da 3.0a: não se conserta objeto inválido escolhendo as partes
que agradam.

**`Set.has`, não `in`.** `"toString" in obj` é verdadeiro em qualquer objeto comum —
`in` aceitaria chave de protótipo como fato governado. Os `Set` vêm das constantes
canônicas, então a lista continua tendo um dono só.

**Nada de normalizar.** `" unknown_header_present "` não é aparado até virar o vizinho
conhecido. Valor governado desconhecido é inválido, e adivinhar a intenção é inventar
fato.

E a guarda tem de ser satisfazível: um teste monta projeção governada válida à mão e
afirma que o briefing sai — a recusa que recusa tudo não protege, só esconde.

## 5g. Prazo não-avaliável não é segurança

A distinção do §15 vira nota explícita: quando o prazo não pôde ser avaliado, o
briefing declara `deadline_not_evaluable: N contrato(s)`. Sem ela, prazo sem fato
pareceria segurança. Mutação que remove a nota mata teste.

## 6. Evidência: índice autoritativo, não união das citações

`evidence_index` vem do conjunto de evidências da captura — **não** da união do que os
fatos citam. A diferença é o que torna o teste possível: com a união, integridade
referencial seria verdadeira por construção.

Referência pendurada → `DANGLING_EVIDENCE_REF`, falha fechada. Remover a referência em
silêncio esconderia a inconsistência; declarar sem lastro produziria fato inauditável.
Mutação que troca o retorno por `continue` mata teste.

O índice é ordenado e deduplicado: identidade não depende da ordem de montagem.

## 7. Determinismo

`briefing_id` = SHA-256 de material tipado em ordem **fixa** de campos, com domínio e
versão. Nunca iteração sobre chaves do objeto: ordem de inserção de propriedade não
pode influenciar identidade.

`generated_at` **entra** no material de propósito: dois briefings do mesmo conteúdo
gerados em momentos distintos são dois briefings, e um id que os colapsasse impediria
referenciar a montagem específica que alguém leu. Ele vem do **input** — o assembler
não lê relógio.

### O teste que passava pelo motivo errado

Comparar dois `briefing_id` seguidos **não** prova ausência de relógio: `Date.now()` no
mesmo milissegundo devolve o mesmo número, e a mutação que injetava um nonce
**sobreviveu** à primeira rodada. A prova real proíbe as duas fontes de
não-determinismo — `Date.now` e `Math.random` lançam durante a montagem — e exige que o
briefing saia normalmente. Com ela, a mutação mata três testes.

Vale registrar porque é o padrão que este projeto combate: teste que verifica o
sintoma em vez da propriedade.

## 8. Financeiro: capacidade adiada, não fonte quebrada

```
SOURCE HEALTH  ≠  INTEGRATION CAPABILITY
```

`source_health` contém **somente** a fonte efetivamente observada — o Lucas. Declarar
o financeiro ali como indisponível diria que a fonte do Leonardo está com problema, o
que é falso e injusto com o dono dela.

O que falta aparece em `unavailable_capabilities` com status **`deferred`**:

```
FINANCE_DOMAIN                     dashboard do Leonardo, não consumido aqui
DETECTOR_B_FINANCE_RECONCILIATION  exige segunda fonte e período de graça
DETECTOR_C_FIRST_DUE_DATE          FIRST_DUE_DATE_ORIGINAL segue ausente
FULLY_COMPLETED_SALE               exige pagamento confirmado no Omie
```

`deferred` diz "existe decisão de não fazer ainda". `unavailable` diria "deveria
funcionar e não está". Confundi-los culparia quem não tem culpa.

`Desembolso` **não** é substituto de `Venc`: são campos e conceitos diferentes, e o
Detector C segue deferido. A disponibilidade do valor subjacente de `Venc` continua
sendo `FUTURE_REVIEW` apenas.

## 9. Segurança model-facing

Nenhum CPF, nome, `row_key`, `ticket_cents` ou nome de unidade atravessa o briefing.
`subject_ref` é pseudônimo governado (`^subj_[a-f0-9]{16}$`). Todo texto livre usa o
envelope `untrusted_text`.

Detalhe cru de erro não viaja: um teste injeta `Bearer abc123 rejeitado em
/path/secreto` no erro da fonte e afirma que nada disso aparece no briefing.

A proteção é **projeção estrutural**, não regex de limpeza: o briefing só tem os campos
que o schema declara, e `additionalProperties: false` fecha o resto.

## 10. Falha fechada, e bug não é estado de fonte

```
PERIOD_MISMATCH             briefing rotulado agosto sobre dados de julho
INVALID_GENERATED_AT        timestamp inválido — não substituído por relógio
DANGLING_EVIDENCE_REF       citação sem lastro no índice
UNSUPPORTED_GOVERNED_STATE  estado derivado fora dos quatro que emitem fato
OUTPUT_CONTRACT_VIOLATION   defeito NOSSO — não mascarado como fonte indisponível
MISSING_REQUIRED_SOURCE_PROJECTION
                            resultado utilizável sem projeção governada, ou com
                            valor fora do vocabulário canônico — §5c e §5f
```

A última importa: confundir bug com `source_error` esconderia um defeito atrás de uma
resposta plausível sobre a fonte do Lucas.

`UNSUPPORTED_GOVERNED_STATE` existe porque o tipo a montante de
`derived_deadline_state` admite sete estados e só quatro emitem fato. Conferir em vez
de presumir é a lição da 3.0a: tipo TypeScript não é validação.

## 11. A saída é validada, não confiada

Todo briefing passa por `assertValid("executive-briefing", …)` **antes** de retornar, e
depois por `deepFreeze`. Tipo TypeScript não garante forma em runtime, e a Fase 3.0a
fechou exatamente esse furo na fronteira de autoridade.

Imutabilidade profunda testada em `source_health`, `commercial_state`, `evidence_index`
e `quality_and_coverage`. E o assembler não muta a entrada: mutar o array do chamador
depois da montagem não altera o briefing.

## 12. Fronteira com a 3.0c

O que 3.0c poderá compor, e que **não** foi implementado aqui:

```
ExecutiveBriefingV1  +  DashboardObservation[]  +  MarketObservation[]
                     +  growth_context  +  aros_context  +  prior_decisions
                     +  capabilities/restrictions        =  HermesReadModelV1
```

Teste afirma que o briefing **não** carrega `insights`, `prior_decisions`,
`dashboard_observations`, `market_observations`, `growth_context`, `aros_context`,
`capabilities` nem `restrictions`.

Nada de `SharedBriefing`, `ContentMission`, `ContentPackage`, browser, pesquisa social,
publicação, scheduler ou chamada de modelo. O comando de produção segue
`npm run lucas:analyze --prefix intelligence`, inalterado — o assembler é chamável de
biblioteca e teste, e não foi ligado a nenhum agendador.

## 13. Mutações executadas

| mutação | resultado |
| --- | --- |
| A `source_not_available` → métricas zeradas | ✗ mata 5 testes |
| B `d_not_executed` → `executed_no_findings` | ✗ mata 1 |
| C nota de prazo não-avaliável removida | ✗ mata 1 |
| D checagem de integridade referencial removida | ✗ mata 1 |
| E `Date.now()` na identidade | ✗ mata 3 (após corrigir o teste) |
| F `not_measured` → `insufficient` | ✗ mata 7 |
| G `source` anulável restaurado nos utilizáveis | ✗ 13 erros de typecheck |
| H assembler tolera projeção ausente e deriva de `row_count` | ✗ mata 6 |
| I `additionalProperties: false` do ramo não-medido | ✗ mata 1 |
| J `source_health.view_state` fixo em `available` | ✗ mata 3 |
| K `dataset_id` aceito como qualquer string | ✗ mata 1 |
| L `source_quality` aceito como qualquer string | ✗ mata 1 |
| M chave de `row_quality_counts` fora do vocabulário aceita | ✗ mata 1 |

Treze executadas, treze mortas. Restauração byte-exata verificada por hash em cada uma.
