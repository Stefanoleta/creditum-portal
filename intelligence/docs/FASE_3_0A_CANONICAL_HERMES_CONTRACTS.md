# Fase 3.0a — contratos canônicos do Hermes

```
HERMES RECOMENDA. STEFANO DECIDE.
```

Não é slogan: está no schema. `DecisionRecord.decided_by` é `const "STEFANO"`,
`ContentMission.publication_authorized` é `const false`,
`DashboardObservation.interaction_mode` é `const "OBSERVE_ONLY"`, e
`ApprovalRequest.status` **não tem `APPROVED` no vocabulário**. Nenhuma dessas
proibições depende de revisão de código ou de prompt — revisão vale até o próximo
commit, prompt vale até alguém reescrevê-lo.

```
CONTRATOS                 10
APROVADOR FINAL           STEFANO (const)
APROVAÇÃO IMPLÍCITA       impossível por construção
PUBLICAÇÃO POR HERMES     impossível por construção
ESCRITA EM DASHBOARD      impossível por construção
AUDIÊNCIA — DEFAULT       DENY (allowlist)
RUNTIME HERMES/AROS       nenhum
CHAMADA DE MODELO         nenhuma
CONTRATOS LEGADOS         3 RETIRADOS (decision · recommendation · aros-briefing)
CAMINHO DE AUTORIDADE     um só: DecisionRecordV1(STEFANO)
TESTES                    167 (mutações mortas em todas as remediações)
```

## 1. Onde os contratos vivem, e por quê

Inspecionei antes de criar. A convenção do repositório é:

```
contracts/<nome>.schema.json     o artefato governado, versionado, revisável só
gateway/src/contracts.ts         tuple FECHADO que registra e compila cada um
gateway/src/hermes.ts            a face tipada + builders VALIDATE → FREEZE
```

**Não criei pasta `hermes/`.** Contrato canônico neste repositório é arquivo em
`contracts/` registrado naquele tuple; uma árvore paralela seria um segundo sistema
de schemas, e o §2 proíbe exatamente isso. Os dez entraram no mesmo registro dos seis
que já existiam, e portanto sob o mesmo `Ajv` com `strict: true` — schema com keyword
desconhecida ou `additionalProperties` esquecido falha ao **compilar**, não ao validar
de menos.

Os builders seguem `factory.ts`: `assertValid` contra o schema, depois `deepFreeze`.
Nenhum aceita opção que relaxe validação — um `skipValidation` seria a porta que este
desenho existe para não ter.

## 2. A fronteira epistêmica é estrutural

`HermesInsightV1` tem `kind` obrigatório e fechado, e cada tipo carrega exigência
diferente:

| kind | exige | proíbe |
| --- | --- | --- |
| `FACT` | `evidence_refs` não-vazio | `requires_stefano_approval: true` |
| `INFERENCE` | `limitations` não-vazio | `severity` canônica |
| `ALERT` | `alert_basis` | severidade quando `INTERPRETIVE` |
| `RECOMMENDATION` | `proposed_action` | `requires_stefano_approval: false` |

Três consequências que valem nomear:

**Um fato sem lastro não existe.** `FACT` sem `evidence_refs` não valida. Não há
mecanismo novo de *truth scoring* — a referência governada é o lastro.

**Uma inferência sem limite declarado não existe.** Inferência sem dizer o que não
sustenta é lida como fato por quem recebe. `limitations` não-vazio é obrigatório.

**Omitir o discriminador não produz um fato por padrão.** `kind` é obrigatório: um
objeto sem ele simplesmente não valida. Era o furo do §42 — INFERENCE virando FACT por
omissão — e ele não tem onde morar.

**Alerta interpretativo não inventa severidade.** É o mesmo furo que a Fase 2.12 fechou
para `A`/`P`: severidade sem lastro governado não sai. Aqui `severity` só é aceita em
`ALERT` com `alert_basis: GOVERNED`, e esse ramo exige nomear o fato que a sustenta.

## 3. Aprovação: pedir e decidir são objetos diferentes

```
ApprovalRequestV1     status ∈ { AWAITING_STEFANO_APPROVAL, DECIDED, WITHDRAWN }
DecisionRecordV1      decision ∈ { APPROVED, REJECTED, APPROVED_WITH_CHANGES }
```

`APPROVED` **não existe** no vocabulário do pedido. `DECIDED` afirma que existe um
registro — e não diz qual foi a decisão; ler o veredito exige ir ao registro assinado.
E o schema fecha as duas pontas: `DECIDED` sem `decision_ref` é inválido, e
`AWAITING_STEFANO_APPROVAL` **com** `decision_ref` também.

Por isso não há caminho para:

```
silêncio          → não existe estado de silêncio; ausência de registro é ausência
timeout           → não existe campo de prazo de aprovação
confiança alta    → confidence não é campo deste objeto
AROS_READY        → status do pacote para em ACCEPTED_FOR_APPROVAL
HERMES_REVIEWED   → revisão do Hermes não é estado de aprovação
```

### A decisão EFETIVA — remediação

A primeira versão perguntava se **algum** registro histórico dizia `APPROVED`. O gate
encontrou a consequência, e ela é grave:

```
D1  APPROVED
D2  supersedes D1  →  REJECTED
resultado anterior:  aprovado  ✗
```

Uma aprovação seguida de revogação explícita continuava valendo para sempre. O modelo
append-only existe para que a revisão não apague o histórico — mas "não apagar" não é
"continuar valendo": o histórico é **auditoria**, e a **autoridade** é o único registro
terminal da cadeia.

`resolveEffectiveDecision(approval_id, decisions)` devolve três estados:

```
no_decision       ORDINÁRIO — aguardando Stefano, não é defeito
effective         exatamente um terminal, e é ele que manda
malformed_chain   história de autoridade contraditória
```

Autoridade vem de `supersedes`, **e de nada mais**. `decided_at` é auditoria: um
relógio adiantado não revoga nem aprova. Posição no array e ordem lexicográfica de id
têm o mesmo problema com menos aparência de razão — há teste afirmando que inverter a
ordem do array não muda o resultado.

Seis formas de história contraditória, todas **falha fechada**:

| defeito | por que não se escolhe um lado |
| --- | --- |
| `DUPLICATE_DECISION_ID` | dois registros com o mesmo id |
| `DANGLING_SUPERSESSION` | tratar ausente como raiz faria um órfão virar autoridade |
| `CYCLIC_CHAIN` | nunca laçar, nunca escolher |
| `FORKED_CHAIN` | dois terminais competindo não é "pegue o mais novo" |
| `MULTIPLE_ROOTS` | nenhuma é "a mais recente" |
| `CROSS_APPROVAL_SUPERSESSION` | supersessão atravessando pedidos é contraditória |

`isApprovedByStefano` consome o resolvedor. Silêncio e história malformada devolvem
`false` pelo mesmo caminho — nenhum é aprovação —, mas são estados **distintos** no
resolvedor, para quem precisa da diferença.

**Limitação registrada:** a v1 não vincula `APPROVED_WITH_CHANGES` a uma versão do
conteúdo. Aprovar com mudanças autoriza o assunto do pedido, e a semântica de
`Decision` foi preservada como estava. Vincular decisão a versão de conteúdo é decisão
de governança para uma fase futura — não a inventei aqui.

`APPROVED_WITH_CHANGES` exige `changes` não-vazio: "com mudanças" sem dizer quais não é
decisão.

**Imutável.** Mudar de opinião cria um novo registro apontando o anterior em
`supersedes`. O histórico permanece — decisão sobrescrita é decisão que ninguém pode
auditar.

## 4. Dono de fonte ≠ aprovador

```
LUCAS       dono da fonte comercial
LEONARDO    dono da fonte financeiro/cobrança
HERMES      inteligência transversal — observa, nunca altera
STEFANO     autoridade decisória final
```

Os dois eixos são vocabulários **separados**: `SourceOwner` aparece em
`source_health`, `source_view_gaps` e `DashboardObservation.owner`; o vocabulário de
aprovação contém só `STEFANO`. Um teste afirma que `decided_by: "LUCAS"` é recusado —
ser dono da fonte não confere autoridade sobre a decisão.

E quando o briefing não tem uma dimensão porque ela pertence ao dashboard do owner, ele
**declara o gap**:

```
SOURCE_VIEW_GAP · owner · dimension
```

Declarar é a alternativa a reconstruir a métrica do owner por fora, que é como duas
verdades sobre o mesmo número nascem.

## 5. Compartilhamento é projeção positiva

`SharedBriefingV1` não tem campo para o `ExecutiveBriefing`, e **não tem
`hidden_sections`**. Esconder pressupõe gerar tudo e filtrar depois, e um filtro
esquecido vaza. Aqui o objeto é construído a partir do permitido:

```
generated_from            REFERÊNCIA ao briefing, nunca o conteúdo
permitted_insights        allowlist de insight_id
permitted_evidence_refs   allowlist de evidência
audience                  UMA, do vocabulário fechado
authorization_ref         DecisionRecord que autoriza — OBRIGATÓRIO
```

### A autoridade é referência — remediação

A primeira versão tinha `authorized_by: const "STEFANO"` com `authorization_ref`
**opcional**. O gate apontou o furo: um produtor criava briefing schema-válido
afirmando que Stefano autorizou, sem que decisão alguma existisse. Um nome dentro do
próprio objeto não é prova de autoridade — é a autoridade se autoproclamando.

`authorized_by` foi **removido**, não rebaixado a metadado: um campo que parece
autoridade é lido como autoridade na primeira leitura apressada. E nenhum booleano
entrou no lugar (`is_authorized`, `approved`, `stefano_approved` são todos recusados) —
isso recriaria o mesmo furo com outro nome.

Schema valida **um** objeto; não consegue afirmar que um id aponta um registro que
existe, pertence ao pedido certo e é o terminal da cadeia. Isso é relação entre
objetos, e o lugar honesto de verificá-la é a fronteira de construção:
`authorizeSharedBriefing(briefing, request, decisions)`.

```
AUTHORIZATION_REF_NOT_FOUND        o registro apontado não existe
DECISION_FOR_DIFFERENT_APPROVAL    pertence a outro pedido
APPROVAL_SUBJECT_MISMATCH          o pedido não é sobre compartilhar ESTE briefing
SUPERSEDED_DECISION                a aprovação foi revogada depois
DECISION_DOES_NOT_AUTHORIZE        o veredito efetivo não autoriza
MALFORMED_DECISION_CHAIN           história contraditória
NO_DECISION                        não há decisão
```

`APPROVAL_SUBJECT_MISMATCH` fecha o caso mais escorregadio: *"Stefano aprovou alguma
coisa em algum lugar"* não autoriza divulgar este briefing.

`SUPERSEDED_DECISION` liga os dois achados. O briefing continua apontando `dec_1` e não
muda; **a autoridade dele muda**, porque autoridade é da cadeia, não do objeto.

As razões são vocabulário fechado e não carregam conteúdo de objeto nem PII — um motivo
de recusa que vazasse a linha do aluno trocaria um problema de autoridade por um
vazamento. Há teste afirmando o tamanho e a ausência.

### A aprovação é vinculada ao CONTEÚDO — segunda remediação

Vincular só a id ainda deixava um replay de autoridade, e o gate o demonstrou:

```
A   id=shb_1  audience=COMMERCIAL_LUCAS   → aprovado por Stefano
B   id=shb_1  audience=FINANCE_LEONARDO   → autorizado pela decisão de A   ✗
```

Reusar o identificador fazia a decisão antiga autorizar uma divulgação
**materialmente diferente**. Stefano aprova UMA divulgação, não um identificador.

`ApprovalRequestV1` ganhou `subject_content_hash`, **obrigatório** quando
`subject_type` é `SHARED_BRIEFING` (outros assuntos preservam a semântica — não
inventamos exigência onde a governança não pediu). `authorizeSharedBriefing` exige que
ele case com `sharedBriefingContentHash(briefing)`.

```
SHARED_BRIEFING_CONTENT_HASH_VERSION = 1.0.0    dedicada, não a do Lucas

cobre:  shared_briefing_id · generated_from · audience
        permitted_insights · contextual_cross_domain_insights
        permitted_evidence_refs
```

Versão dedicada de propósito: compartilhar a do Lucas faria uma mudança na regra de
ingestão invalidar aprovações de divulgação que ninguém tocou.

**Fora do hash, com razão:** `generated_at` é observacional — incluí-lo faria regerar a
mesma divulgação exigir nova aprovação, sem que nada do que Stefano avaliou tivesse
mudado (é a mesma razão pela qual `collected_at` está fora do hash do Lucas).
`authorization_ref` fica fora por circularidade: a aprovação vincula o hash, então o
hash não pode vincular a aprovação.

**As allowlists são conjuntos.** `[I1, I2]` e `[I2, I1]` liberam a mesma coisa, e
duplicata não libera nada a mais — são ordenadas e deduplicadas. Sem isso, reordenar a
lista exigiria nova aprovação para a mesma divulgação, e a governança viraria ruído. É
o **oposto** da decisão do hash do Lucas, onde a ordem das linhas é material porque
localiza evidência: domínios diferentes, escolhas diferentes, ambas explícitas.

**O hash não é armazenado no objeto.** Um hash guardado pode discordar do próprio
payload, e então seria preciso verificar essa discordância também. Derivado sob
demanda, não existe o que falsificar: ele é sempre do conteúdo que está ali. E declarar
um `content_hash` no payload é recusado por `additionalProperties: false`.

`sharedBriefingApprovalSubject(briefing)` deriva `subject_ref` e
`subject_content_hash` do objeto real — coordenação manual entre dois campos é onde os
dois divergem.

**Consequência governada:** conteúdo alterado exige **nova aprovação**. v1 aprovada não
herda autoridade para v2, e `APPROVED_WITH_CHANGES` não significa "qualquer payload
futuro com esta id". Isso fecha, para divulgação, a limitação que eu havia registrado
como débito — sem generalizar regra de versão de conteúdo para os outros assuntos, que
não têm governança para isso.

Vínculo de conteúdo **não substitui** a cadeia: com conteúdo idêntico e decisão
superseded, o resultado segue `SUPERSEDED_DECISION`.


`audience` não tem `ALL`, `EVERYONE` nem `PUBLIC`. Insight com `audiences: []` não é
visível para ninguém — o default é negar, e negar é o caminho barato.

Lista permitida vazia é **resultado legítimo**, não erro: significa que nada foi
liberado para aquela audiência.

As vistas de `COMMERCIAL_LUCAS` e `FINANCE_LEONARDO` estão definidas como audiência e
mais nada. Nenhum assembler foi construído (§54).

### A fronteira de autoridade é fronteira de VALIDAÇÃO

**Tipo TypeScript não é segurança.** O gate encontrou que `authorizeSharedBriefing`
recebia parâmetros tipados e nunca validava em runtime. Tipo desaparece na compilação:
um `as`, um `JSON.parse` ou um chamador em JavaScript entregam qualquer objeto.

O ataque concreto:

```
briefing canônico aprovado          hash(A) vinculado no ApprovalRequest
briefing + leaked_finance_details   MESMOS campos canônicos → MESMO hash
                                    → o hash aprovado autorizava o objeto vazando
```

O material do hash cobre os campos canônicos, então o campo extra viajava **por fora**
do compromisso. `additionalProperties: false` já dizia que tal objeto é inválido —
faltava a fronteira de autoridade **perguntar**.

Agora `authorizeSharedBriefing(briefingRaw, requestRaw, decisionsRaw)` aceita
`unknown` e valida os três antes de qualquer hash, resolução ou comparação:

```
1. toSharedBriefing    → INVALID_SHARED_BRIEFING
2. toApprovalRequest   → INVALID_APPROVAL_REQUEST
3. toDecisionRecord[]  → INVALID_DECISION_RECORD
4. só então: hash · resolução de cadeia · comparação de assunto
```

**Não há limpeza de campo extra.** Remover a propriedade estranha e revalidar
transformaria `additionalProperties: false` em formalidade — o objeto é
não-canônico e é recusado. Uma mutação que implementa esse atalho mata três testes.

`sharedBriefingContentHash` e `sharedBriefingApprovalSubject` também validam: nunca
se calcula identidade de conteúdo sobre objeto não validado, ou o hash afirmaria
cobrir um conteúdo que não cobre.

Uma decisão inválida **invalida o conjunto** em vez de ser descartada — a descartada
pode ser justamente a que revoga, e a cadeia restante pareceria íntegra.

`isApprovedByStefano` e `resolveEffectiveDecision` receberam o mesmo tratamento: a
mesma classe de furo com outro nome seria a mesma falha.

### O ciclo de vida do pedido faz parte da autoridade

Um `DecisionRecord` **não ativa** um `ApprovalRequest` por conta própria. O gate
encontrou que a autoridade era montada a partir da decisão e do `approval_id`, sem
nunca perguntar em que estado o pedido está:

```
request.status = WITHDRAWN                 + APPROVED de mesmo approval_id
request.status = AWAITING_STEFANO_APPROVAL + APPROVED de mesmo approval_id
resultado anterior: autorizado  ✗
```

Isso tornava a **retirada inócua** — e retirada que não retira é pior que não existir,
porque quem a usou acredita ter fechado a porta.

Autorizar exige acordo entre os **três** objetos:

```
pedido      status DECIDED, com decision_ref
briefing    authorization_ref IGUAL ao decision_ref do pedido
decisão     terminal efetivo da cadeia, de Stefano, que autoriza
```

| estado | resultado |
| --- | --- |
| `WITHDRAWN` | `REQUEST_WITHDRAWN` — final para aquele pedido |
| `AWAITING_STEFANO_APPROVAL` | `REQUEST_NOT_DECIDED` |
| `DECIDED`, refs divergentes | `DECISION_REF_MISMATCH` |
| `DECIDED`, decisão revogada | `SUPERSEDED_DECISION` |
| `DECIDED`, decisão efetiva `REJECTED` | `DECISION_DOES_NOT_AUTHORIZE` |

Retirado não é revivido apresentando um registro antigo: exige pedido novo, pela mesma
regra append-only do resto.

**Casar só por `approval_id` era o furo.** Com duas decisões do mesmo pedido, o código
escolheria a que aprova. `decision_ref` estabelece a decisão exata; a cadeia estabelece
qual é a vigente; `approval_id` estabelece apenas o parentesco. Os três conceitos são
diferentes e todos importam.

Os invariantes de estado já estavam no schema — `DECIDED` exige `decision_ref`,
`AWAITING` não pode carregá-lo. Faltava a fronteira **perguntar**, e as checagens
acontecem antes de qualquer hash: um pedido retirado nem chega a calcular identidade
de conteúdo.

## 6. Read model: referência, não cópia

`HermesReadModelV1` aponta o briefing por `executive_briefing_ref` **mais**
`executive_briefing_hash`, e não o embute. Uma cópia dentro do read model seria uma
segunda autoridade capaz de divergir do original sem que nada falhasse — e o objetivo é
justamente que Hermes não possa alterar fato governado. O hash o compromete com **um**
briefing: se o briefing mudar, o read model deixa de descrevê-lo.

`restrictions` é obrigatória e o schema exige três por `contains`:

```
NO_FINAL_APPROVAL      Hermes nunca aprova em nome de Stefano
NO_PUBLICATION         Hermes nunca autoriza publicação
NO_SOURCE_MUTATION     Lucas e Leonardo seguem donos das fontes
```

Um read model que não as declare não valida. E `capabilities` é fechada: `APPROVE`,
`PUBLISH` e `MUTATE_SOURCE` não estão no vocabulário.

## 7. Dashboards: observar, nunca escrever

`interaction_mode` é `const "OBSERVE_ONLY"`. `WRITE`, `EDIT`, `UPDATE` e `ADMIN` não
existem, e `additionalProperties: false` fecha a porta lateral —
`write_access`, `can_edit`, `permissions`, `override_source` e `allow_update` são todos
recusados. A restrição é **contratual**, não instrução de prompt.

`view_state` preserva o contexto sob o qual a observação vale, e **nenhum campo é
obrigatório**: um dashboard sem filtro de unidade não deve ser forçado a inventar um. O
que não foi observado fica ausente, não vazio.

## 8. Mercado: observar ≠ interpretar

`MarketObservationV1` guarda fato externo verificável e **não tem campo para
interpretação** — `interpretation`, `hypothesis`, `trend`, `conclusion`, `inference` e
`meaning` são todos recusados:

```
MarketObservation   "Concorrente Y publicou 6 Reels sobre X"     cabe
HermesInsight       "Y parece aumentar aposta em X"  kind=INFERENCE
```

A separação é obrigatória por construção, não por disciplina. `capture_time` é
obrigatório: observação externa sem tempo não é verificável.

Ausência de métrica não é zero — o item de `metrics_if_available` simplesmente não
existe. E métrica declarada exige valor.

## 9. Conteúdo: Hermes → Aros → Hermes → Stefano

```
ContentMissionV1    created_by = HERMES  ·  publication_authorized = const false
ContentPackageV1    created_by = AROS    ·  status sem APPROVED
```

A missão autoriza **preparação**. `publication_authorized` é `const false`, não um
booleano que alguém possa virar: Hermes autorizar publicação deixou de ser
expressável.

O pacote do Aros para em `ACCEPTED_FOR_APPROVAL`, que significa "encaminhado a
Stefano" — e exige apontar o `approval_request_ref`. Não existe `APPROVED` no
vocabulário, e nenhum campo de publicação: `publish_now`, `published` e `auto_publish`
são recusados.

Aros é especialista de execução de conteúdo. Não é autoridade sobre verdade comercial,
financeira, nem sobre aprovação — o vocabulário reflete isso.

Objetivo primário inicial: `FOLLOWER_GROWTH`. As métricas de crescimento existem como
capacidade **observada**, com `attribution: NO_GOVERNED_ATTRIBUTION_CHAIN` — sem cadeia
governada não se afirma post → contrato, e um número sem cadeia pareceria atribuição
sem ser.

## 10. Ausência nunca é zero

O briefing separa os cinco estados de fonte, e o schema impede o colapso:

```
available_empty        admite contagem 0     "sabemos que é zero"
data_not_available     PROIBIDO ter contagem "não sabemos"
source_error           PROIBIDO ter contagem
invalid_source         PROIBIDO ter contagem
```

Um `commercial_state` com `view_state: data_not_available` e `emitted: 0` **não
valida**. É a proibição central do projeto, agora estrutural.

### A métrica esquecida — remediação

O gate encontrou que a proibição listava três campos e **esquecia
`historical_realized`**: `data_not_available` com `historical_realized: 0` validava, e
ausência virava zero executivo.

Enumerar proibições é frágil — a próxima métrica adicionada nasce permitida. O ramo
indisponível agora declara o que **é** permitido e fecha o resto com
`additionalProperties: false`:

```
permitido no ramo indisponível:  view_state · fully_completed (sem número)
tudo o mais:                     recusado, inclusive métrica que ainda não existe
```

Teste cobre **cada** métrica × **cada** estado indisponível — doze casos — mais um que
inventa um campo numérico novo e afirma a recusa. `available_empty` com zero segue
válido: a regra é sobre o desconhecido, não sobre o zero.

Mesma regra para execução: `not_executed` exige `not_executed_reason`, e é distinto de
`executed_no_findings` — o primeiro exige alguém resolver algo, o segundo é uma
resposta. Detector D é representável nos dois estados, incluindo
`NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION`, sem alteração alguma no detector.

`fully_completed` é **declarada e não computada**: `DEFERRED_REQUIRES_OMIE_PAYMENT`, sem
campo de contagem. O Omie não é fonte observável nesta fase.

## 11. Os fatos de prazo viajam prontos

O briefing transporta os quatro fatos da Fase 2.13 com a data **já resolvida**:

```
fact_type · subject_ref · source_status · derived_deadline_state
deadline · evaluation_date · offset_days · recovery_candidate
```

E **não existe campo a partir do qual recalculá-los**: `deadline_offset_days`,
`calendar_rule`, `timezone` e `p_attention_offset` são recusados. Dias corridos e
`America/Sao_Paulo` foram decididos na 2.13; duplicar o motor aqui criaria duas
respostas para a mesma pergunta.

`source_status` e `derived_deadline_state` são campos **separados**. Um contrato que a
fonte ainda diz `P` e que a regra já considera auto-cancelado é representável como as
duas coisas ao mesmo tempo — não há campo único que force escolher.

`subject_ref` é pseudônimo governado (`^subj_[a-f0-9]{16}$`). CPF, CPF sem pontuação e
nome são recusados pelo padrão.

## 12. Texto livre é sempre dado, nunca instrução

Todo texto livre destes contratos usa o envelope `untrusted_text` que o repositório já
governava — **inclusive o texto que o próprio Hermes escreve**. Uma frase gerada por
modelo é dado; sem o rótulo ela chegaria a um consumidor a jusante indistinguível de
uma diretiva do sistema, que é a porta de injeção mais óbvia deste desenho.

`statement: "texto cru"` não valida. `{ untrusted: false, ... }` também não.

## 13. Retirada dos contratos legados

Ao inspecionar `contracts/` encontrei três schemas anteriores sobrepostos aos desta
fase. Reportei como bloqueio de governança; Stefano decidiu **retirar os três**.

```
LEGADO decision.schema.json
  → ApprovalRequestV1 + DecisionRecordV1

LEGADO recommendation.schema.json
  → HermesInsightV1(kind = RECOMMENDATION)

LEGADO aros-briefing.schema.json
  → ContentPackageV1 + ApprovalRequestV1 + DecisionRecordV1
```

### Por que não era arrumação

Os três abriam um **segundo caminho de autoridade**, e dois deles exatamente o furo
que esta fase existe para fechar:

| legado | furo concreto |
| --- | --- |
| `decision` | `decided_by_role: type "string"` — aceitava `"HERMES"` |
| `aros-briefing` | `approved_by_human: boolean` — aprovação sem `DecisionRecord` |
| `recommendation` | `human_decision_required` fora do contrato epistêmico |

Uma constituição que declara "só Stefano decide" enquanto o mesmo repositório registra
um contrato onde qualquer string decide não é uma constituição.

### Verificação antes de remover

Busca em todo o repositório — `.ts`, `.tsx`, `.json`, `.md`, `.mjs` — por nome de
arquivo, `$id`, tipo e função de fábrica:

```
produtor de produção     NENHUM   (não existia toRecommendation/toDecision/toArosBriefing)
consumidor de produção   NENHUM
registry                 gateway/src/contracts.ts  +  scripts/validate-schemas.mjs
testes                   contracts.test.ts (6 describes) · adversarial.test.ts (1)
fixture                  fixtures/golden/recommendation_caso_a.json
documentação              README · DATA_FLOW · FASE_2_1 · FASE_2_6
```

A **segunda lista** em `scripts/validate-schemas.mjs` não estava no meu relatório
anterior e teria deixado os três compilando por fora do gateway. Achei porque a busca
foi por nome, não por importação.

### O que foi feito

Removidos dos dois registros; arquivos apagados da árvore ativa. **Nenhum diretório
`deprecated/`** e **nenhum alias de compatibilidade**: não havia produtor a migrar, e
um alias para contrato morto criaria dois vocabulários canônicos para a mesma coisa. O
histórico está no git.

A fixture dourada de `recommendation` saiu junto — um golden que não valida contra nada
é artefato órfão. A varredura de PII sobre fixtures continua, sobre o que restou.

Os seis blocos de teste legados foram removidos, mas **uma invariante foi preservada e
redirecionada**: o `§15` de `adversarial.test.ts` afirmava que saída fora do schema não
é apresentável. A regra continua valendo — apagá-la junto com o contrato perderia a
proteção sem que ninguém notasse. Hoje ela aponta `hermes-insight`, e ganhou um segundo
caso: recomendação que dispensa Stefano também não é apresentável.

`DATA_FLOW.md` afirmava que a saída do Hermes é validada contra
`recommendation.schema.json`. Passou a ser falso no momento da retirada, e doc de
arquitetura que mente é o achado que a Fase 2.12e me ensinou a corrigir junto.

### Um único caminho de autoridade

Auditei os contratos que FICAM procurando `approved`, `approval`, `decided_by`,
`decision`, `approved_by`, `auto_approve` e `human_decision_required`:

```
snapshot     "decision" aparece em DESCRIÇÃO sobre conflito não resolvido — não é autoridade
event        nada
evidence     nada
os dez       decided_by/decision só em decision-record
```

Um teste percorre `CONTRACT_NAMES` e afirma que **exatamente um** contrato aceita
`decision: "APPROVED"`:

```ts
expect(comVeredito).toEqual(["decision-record"])
```

E outro afirma que trocar os papéis não valida: `ApprovalRequest` não aceita payload de
decisão, `DecisionRecord` não aceita payload de pedido, e nem `HermesInsight`,
`ContentPackage` ou `SharedBriefing` aceitam veredito.

`requires_stefano_approval` **exige** aprovação em vez de concedê-la — é o oposto de
`approved_by_human`. Teste afirma que um insight com o campo `true` continua sem
aprovação nenhuma enquanto não houver `DecisionRecord`.

### O caminho de validação legado está fechado

Validar contra os nomes retirados **lança** — não cai em fallback. E um payload no
formato antigo de `decision` (com `decided_by_role: "HERMES"`) não valida contra
nenhum dos treze contratos ativos. Mesma coisa para o atalho
`approved_by_human: true`.

## 14. Fora de escopo

Nenhum runtime. Nenhum assembler de `ExecutiveBriefing`, nenhum de `HermesReadModel`,
nenhum projetor de `SharedBriefing`. Nenhum prompt de Hermes ou Aros, nenhuma chamada
de modelo, nenhum browser, nenhuma pesquisa social, nenhuma publicação, nenhum
scheduler.

Fase 2.13, lógica de prazo, provider do Lucas, adaptador Google, Detector D, Policy,
D13, populações comerciais, semântica de Evidence e o CLI de produção: **intocados**.

## Micro-remediação: autorizar é LER, e ler não muta o chamador

Descoberto ao implementar a 3.0C, corrigido depois de a 3.0C zarpar. A semântica de
autoridade estava correta; o defeito era de propriedade.

A fronteira entregava o objeto do chamador às factories canônicas, e elas fazem
`deepFreeze` **no que recebem**. Consequência: *perguntar* se algo está autorizado
congelava o grafo de quem perguntou.

```
authorizeSharedBriefing(briefing, pedido, decisões)
        ↓  canonico(toSharedBriefing, briefing)
        ↓  deepFreeze(briefing DO CHAMADOR)     ✗
```

`Object.freeze` não altera valor — altera `writable`, `extensible` e `frozen`, e isso é
observável de fora. E a regra já estava escrita em `immutability.ts` desde a Fase 1:

> ownership precisa estar resolvido ANTES: congelar um grafo que ainda referencia estado
> do chamador congelaria estado do chamador — efeito colateral sobre quem só pediu uma
> leitura.

A fronteira de autoridade passava por cima dela.

### O que mudou, e o que NÃO mudou

```
canonico(construtor, raw)   →   canonico(contract, raw)
                                 instantâneo próprio → schema → congela a CÓPIA
```

As factories `toSharedBriefing`, `toApprovalRequest` e `toDecisionRecord` seguem
congelando no lugar — é o desenho correto para quem **constrói** o objeto, e não toquei
nelas. O que mudou é que a fronteira de LEITURA parou de usá-las sobre dado de fora.

Reusei a fronteira endurecida da 3.0C em vez de escrever outra: `canonicoProprio` e
`snapshotPlainData`. Isso trouxe de graça três proteções que a 3.0A não tinha:

```
acessor no objeto do chamador   recusado pelo descritor, getter não executa
Proxy                            recusado antes de qualquer trap
coleção de decisões              capturada antes de iterar — sem Symbol.iterator do chamador
```

Nada de saneamento: campo desconhecido continua **recusado** por
`additionalProperties: false`, e um teste afirma isso para `campo_extra`,
`authorized_by` e `publication_authorized`.

E o hash não mudou de semântica: o material é montado por campo nomeado, então
instantâneo do mesmo conteúdo dá o mesmo hash. Um teste compara objeto mutável com
objeto congelado — ownership não é conteúdo.

### Mutações

| mutação | resultado |
| --- | --- |
| A/B factory congela o grafo do chamador | ✗ mata 4 |
| C hash congela o briefing do chamador | ✗ mata 1 |
| D coleção de decisões iterada crua | ✗ mata 1 |

Restauração byte-exata verificada por hash em cada uma.

```
ENTRADA   do chamador, com o ownership que ela tinha
SAÍDA     nossa, profundamente congelada
```
