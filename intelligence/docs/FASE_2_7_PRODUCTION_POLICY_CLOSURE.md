# Fase 2.7 — Fechamento da Política Creditum v1

As decisões humanas aprovadas viraram fonte governada, validada e fail-closed.
Nenhum valor da Creditum ficou em constante de TypeScript.

## 1. Fonte governada

```
intelligence/governance/policy/creditum-policy.v1.json
```

O runtime **projeta** esse artefato em `DetectorConfig`. Não existe
`DEFAULT_CONFIG`; política ausente ou inválida recusa em bloco, listando tudo o
que está errado. `TEST_CONFIG` continua em `tests/` e não é alcançável do
caminho de produção — `production-policy.ts` não importa nada de teste, e um
teste afirma isso lendo as declarações de import.

A regra veio da Fase 2.6c: três aliases D13 viviam em TypeScript e o runtime os
enxertava depois do load. Duas fontes de governança, a segunda invisível. A
mesma trava vale agora para política de negócio.

## 2. Valores APROVADOS

| Item | Valor |
| --- | --- |
| Participação relevante | 10% (1000 bp) |
| Materialidade financeira | R$ 50.000 (5.000.000 centavos) — *approved initial / calibratable* |
| Quantidade relevante | 5 casos |
| População mínima | 10 contratos |
| Piso low-ticket | < R$ 1.499,99 (149.999 centavos, estritamente menor) |
| Severidade low-ticket | `medium` — **fixa**, não derivada das bandas |
| Bandas de severidade | `<10%` low · `10–25%` medium · `25–50%` high · `≥50%` critical |
| Cobertura degraded | ≥1 faltante com ausência < 10% |
| Cobertura insufficient | ausência ≥ 10% |
| Tolerância numérica entre fontes | 2% (200 bp) |
| Tolerância estrutural | **zero** |
| Janelas do Detector C | `same_day` + próximos 7 dias civis + mês como contexto |
| Agregadores do Detector D | `amount_sum_cents`, `amount_mean_cents`, `case_count` |
| Modelo de `expected_units` | period + dataset_id + unit_id |

**"Calibratable" não é autoajustável.** O estado está registrado como
`approved_initial_calibratable`; nada no runtime escreve no artefato, e um teste
afirma a ausência de escrita no módulo.

## 3. Validação fail-closed

A política é recusada quando: `schema_version` não suportada · dinheiro que não é
inteiro em centavos · participação fora de 0..10000 bp · contagem de casos não
inteira ou não positiva · população mínima inválida · semântica diferente de
`OR` · bandas sobrepostas, com buraco no piso, ou com ordem de severidade
incoerente · tolerância estrutural diferente de zero · lista estrutural vazia ·
`next_n_days` diferente de 7 · base de dias diferente de civil · agregador fora
dos três aprovados · severidade low-ticket diferente de `medium` · comparação
low-ticket diferente de estritamente menor · limiar de cobertura zero.

A recusa lista **todos** os problemas, não o primeiro.

## 4. Cobertura: uma representação só

A política é escrita em fração **ausente**, a linguagem em que foi aprovada. Os
detectores comparam `unit_coverage.ratio_bp`, que é a fração **presente**. A
tradução `ausente = 10000 − presente` vive num lugar só,
`coverageThresholdsFromPolicy`, e é testada nos limites. Gravar os números já
traduzidos no artefato criaria duas representações da mesma decisão — o defeito
da 2.6c.

Verificado: 20/0 → ok · 20/1 → degraded · 20/2 → insufficient · 10/1 →
insufficient · 11/1 → degraded · 9,99% → degraded · 10,00% → insufficient.
Aritmética inteira, sem float.

## 5. Low-ticket: o Event executivo saiu do bloqueio

A severidade `medium` foi aprovada, então `SEVERITY_POLICY_UNRESOLVED` deixou de
existir para o caminho válido. Um contrato abaixo do piso emite Event com
`severity: medium`, `event_id` estável, escopo do próprio contrato, evidência
própria e `deepFreeze`.

`not_emitted_reason` continua existindo para os motivos **factuais**:
`NOT_BELOW_FLOOR`, `TICKET_UNAVAILABLE`, `INVALID_TICKET`.

O Event afirma exatamente uma coisa: o ticket está abaixo do piso comercial
aprovado. Não há `reference_metric` — um contrato individual não tem
denominador, e inventar um (ticket médio da unidade, por exemplo) mudaria o
significado do alerta sem aprovação. Um teste varre a saída atrás de "fraude",
"prejuízo", "inadimplência" e "causa", e exige ausência.

Um teste separado prova que a severidade **não** deriva de participação: o mesmo
contrato de R$ 1.000 sai `medium` sozinho e `medium` num lote com três contratos
de R$ 50.000.

## 6. Auditoria de base de severidade por detector

| Detector | Base relativa governada | Situação |
| --- | --- | --- |
| A — installment_concentration | `share_count_bp` ou `share_amount_bp` | base existe; **falta decidir qual** |
| B — cross_source_conflict (numérico) | `share_of_total_bp`, senão `relative_difference_bp` | base existe |
| B — cross_source_conflict (estrutural) | **nenhuma** | data e identidade não têm denominador |
| C — first_due_concentration | `share_count_bp` ou `share_amount_bp` | base existe; **falta decidir qual** |
| D — material_single_case | `relative_delta_bp` ou `share_of_total_bp` | base existe; **falta decidir qual** |

Nenhuma fórmula de detector foi alterada para encaixar severidade.

### 6.1 Defeito encontrado: o Detector B fabricava a base

`cross-source-conflict.ts` calculava:

```ts
severity: classifySeverity(cfg.severity_by_relative_bp, shareBp ?? relativaBp ?? 0)
```

O `?? 0` inventa a base quando nenhuma medida relativa é computável. Sob as
bandas aprovadas isso vira `low` — um número executivo saído do nada. A/C/D já
falhavam fechado nesse ponto; B era o único que preenchia o buraco.

Corrigido: `severity` passou a `Severity | null`, com `severity_gap` tipado.

**Reachability, medida e não presumida.** Para tipos numéricos, toda versão que
sobrevive à normalização tem `numeric`, e denominador zero implica versão única —
ou seja, sem conflito. O `?? 0` era **latente**, não vivo. Um mutante que o
restaura não mata nenhum teste, e isso está registrado aqui como resultado
honesto: a correção é endurecimento defensivo, não conserto de bug ativo.

### 6.2 O caminho estrutural, esse, é vivo

Conflito de data e de identidade não tem denominador. As bandas do §5 são
relativas e não se aplicam, e a Política v1 deliberadamente não decide um valor
próprio. `structural_severity` virou opcional na configuração; sem ela, o
conflito sai em `material_not_emitted` — bucket novo, com `severity: null` e
motivo explícito.

Ele **não** é rebaixado para `non_material`: a divergência é real e passou do
critério. O que falta é como graduá-la.

## 7. Testes

| Suíte | Antes | Depois |
| --- | --- | --- |
| `production-policy` (nova) | — | 52 |
| `low-ticket` | 82 | 84 |
| `cross-source-conflict` (B) | 74 | 80 |
| A / C / D | 164 / 196 / 147 | inalterados |
| integração | 45 | 47 |

**Mutação:**

| Mutante | Resultado |
| --- | --- |
| low-ticket `medium` → `low` | morto — o validador recusa no load, suíte vermelha |
| low-ticket `medium` → `high` | morto — idem |
| restaurar `?? 0` no Detector B | **sobrevive** — o caminho é inalcançável hoje; ver §6.1 |
| severidade estrutural com default `low` | morto (3 testes) |
| conflito sem severidade cai em `non_material` | morto (3 testes) |

## 8. Fragilidade corrigida no próprio teste

`catalog-import.test.ts` passava sozinho e estourava 5 s sob a suíte completa:
cada teste dispara `python3`, e com 26 arquivos em paralelo o subprocesso espera
na fila. Não era regressão de produto. O limite subiu para 60 s, com a razão
registrada no arquivo — o teste mede o conversor, não a contenção da máquina.

## 9. O que a política NÃO decide

`POLICY_DECISIONS_PENDING` nomeia os quatro campos, e
`assertProductionPolicyComplete` recusa a configuração de produção enquanto
existirem:

1. `installmentConcentration.severity_dimension` — graduar por participação em
   QUANTIDADE ou em VALOR. Muitos contratos pequenos e poucos grandes produzem
   leituras opostas.
2. `firstDueConcentration.severity_dimension` — mesma escolha.
3. `materialSingleCase.severity_dimension` — `relative_delta_bp` mede quanto o
   agregado MUDA se o caso sair; `share_of_total_bp` mede quanto o caso
   REPRESENTA. Um caso que dobra a média tem delta 10000 bp e participação
   pequena.
4. `crossSourceConflict.structural_severity` — ver §6.2.

O artefato lista os **candidatos** de cada um, nunca uma escolha. Um teste exige
que cada entrada tenha mais de um candidato, para que preencher um deles seja
decisão registrada e não um preenchimento silencioso.

## 10. Dados ainda ausentes

`expected_units`: o **modelo** está aprovado (period + dataset_id + unit_id). Os
**valores** não existem em fonte governada. Catálogo ativo não é `expected_units`
— um teste exige que o artefato não enumere unidade nenhuma. Sem os dados, a
avaliação de cobertura de produção falha fechado; nenhum denominador é inventado.

Isto não é threshold pendente. A política está fechada; a população é que não
existe.

## 11. Bloqueios externos remanescentes

| | Item |
| --- | --- |
| A | `expected_units` — fonte e dados governados reais |
| B | Leonardo → Supabase: tabela/view/schema e contrato de `as_of` |
| C | Lucas → contrato de armazenamento/provedor/arquivo mensal |
| D | Engenharia do briefing determinístico |
| E | Engenharia do read-model do Hermes |

Nenhum deles é decisão de política. Todos dependem de fonte externa ou de
engenharia ainda não iniciada.

## 12. Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓, **1436 testes / 26 arquivos**.
Portal `tsc --noEmit` limpo, 182 testes do motor CEO verdes. A/B/C/D sem
regressão em 164 / 80 / 196 / 147 — B subiu de 74 por testes novos, sem
alteração de lógica de negócio.

---

# 13. Fase 2.7b — as quatro decisões de severidade fecharam

Artefato: `governance/policy/creditum-policy.v1.json`
SHA-256 `05578f8bb90d36dd3563416b26b63e6563f37814e7680ee69f63c23644ff1a44`

## 13.1 A e C — `max_available_participation`

Nenhum dos dois escolhe permanentemente entre quantidade e valor. A severidade
sai da **maior participação governada válida** entre `share_count_bp` e
`share_amount_bp`, e o evento publica qual dimensão forneceu o máximo.

O motivo é que escolher uma esconderia metade dos casos: uma data com muitos
contratos pequenos e outra com poucos grandes produzem leituras opostas, e
nenhuma dimensão é "a certa" para todo evento.

**Desempate:** `share_amount_bp`, governado no artefato. No empate os dois
valores são numericamente iguais, então a severidade é a mesma — o desempate
decide apenas o rótulo publicado. A ordem de entrada nunca decide: a função
recebe os dois argumentos nomeados, não uma lista.

A regra vive em `participation-severity.ts`, compartilhada. Uma cópia em cada
detector divergiria — foi assim que a Fase 2.5 descobriu que o Detector C tinha
esquecido de ler `snapshot.quality_status`.

**Sem participação válida → `severity: null`** e lacuna tipada. Nunca zero,
nunca `info`, nunca a outra dimensão, nunca R$ ou contagem absoluta como
substituto de percentual.

`severity_dimension` continua obrigatória na configuração e passa a ser o
desempate — o campo não é ignorado em silêncio quando a estratégia está ativa.

## 13.2 D — participação de verdade, ou nenhuma

Base aprovada: `share_of_total_bp`, **somente** quando tem semântica real de
parte-do-todo.

`relative_delta_bp` não entra. Ela é mudança contrafactual: pode ser negativa e
passar de 10000 bp. Classificá-la pelas bandas de participação conflagraria duas
grandezas diferentes — um caso que dobra a média teria 10000 bp e seria
`critical` por uma medida que não é participação.

**Média:** `share_of_total_bp` não é aplicável. O fato factual/contrafactual
continua calculado e auditável; o Event executivo não sai, com razão tipada
`SEVERITY_BASIS_NOT_APPLICABLE`. Isto **não** é `non_material` — o fato pode ser
material por delta absoluto. O que falta é a semântica executiva de gravidade.

## 13.3 B — severidade estrutural fixa

Conflito estrutural de tolerância zero (data civil, ID canônico, identidade de
unidade) tem severidade **`medium`**, fixa e qualitativa.

Não é calculada da tolerância numérica de 2%, não cria basis point sintético,
não fabrica denominador. Tolerância zero **não** é reinterpretada como
`critical`: uma data divergente precisa ser olhada, não tratada como incêndio.

Conflito numérico não muda: mantém a base relativa existente e os 200 bp.

A entrada é **independente** da severidade do low-ticket. As duas são `medium`
por coincidência de decisão, não por origem comum — um teste muda uma e exige
que a recusa não mencione a outra.

## 13.4 `POLICY_DECISIONS_PENDING` está vazia

As quatro decisões entraram no artefato e a validação ficou **mais** estrita, não
menos: quatro blocos novos e obrigatórios, cada um com conjunto fechado.
`assertProductionPolicyComplete` passa porque as decisões existem, não porque a
asserção foi contornada. Um teste prova isso removendo `detector_severity` do
artefato e exigindo recusa.

`POLICY_V1_COMPLETE === true`.

## 13.5 A configuração de produção ainda NÃO é montável

Construir a projeção real expôs três campos que as quatro decisões de severidade
não cobriam — e que eu não havia auditado ao reportar a Fase 2.7:

| Campo | Por que não é derivável |
| --- | --- |
| `installmentConcentration.contributing_case_rule` | `top_n: 5` e `until_share_bp: 8000` produzem eventos diferentes para o mesmo dado |
| `crossSourceConflict.material_absolute_basis_points` | diferença ABSOLUTA entre métricas que já são bp; não é a tolerância relativa de 200 bp — `0` vs `2000` e `1000` vs `2500` têm a mesma diferença absoluta e divergências relativas opostas |
| `materialSingleCase.material_relative_delta_bp` | mudança relativa, não participação; reusar os 1000 bp seria a conflação que a política de severidade acabou de proibir para este detector |

`buildProductionDetectorConfig` recusa nomeando os três. Nenhum foi inventado.

Três estados distintos, que continuam separados:

- **Política v1: COMPLETA** — toda decisão de negócio aprovada está no artefato.
- **Configuração de produção: NÃO montável** — três campos sem decisão.
- **Fonte de dados: indisponível** — `expected_units` sem dados governados.

> **SUPERSEDIDO pela Fase 2.7c.** Os três campos foram aprovados e a configuração
> de produção passou a ser montável. O parágrafo acima fica como registro do
> estado em que a 2.7b terminou; o estado corrente está na §14.

## 13.6 Testes

| Suíte | Antes | Depois |
| --- | --- | --- |
| `participation-severity` (nova) | — | 14 |
| `production-policy` | 52 | 71 |
| A / B / C / D | 164 / 80 / 196 / 147 | inalterados |
| low-ticket | 84 | 84 |
| integração | 47 | 47 |

**Mutação:**

| Mutante | Mortos |
| --- | --- |
| `max` vira "primeira disponível" (ordem decide) | 5 |
| participação ausente vira 0 | 1 |
| D cai para `relative_delta_bp` na média | 5 |
| severidade estrutural do B para `critical` | recusa no load da política |

## 13.7 Projeção exata

A prova principal deixou de ser a varredura de números literais: agora um teste
compara campo a campo o artefato contra a política projetada — materialidade,
bandas, low-ticket, tolerâncias, desempates e severidade estrutural. A varredura
literal continua como defesa secundária, restrita ao **código** com comentários
removidos: explicar por que 1000 e 2500 são dimensões diferentes é documentação,
não política embutida.

## 13.8 Verificação

`npm run verify`: **1469 testes / 27 arquivos**. Portal `tsc` limpo, motor CEO
182. A/B/C/D em 164 / 80 / 196 / 147, sem regressão.

---

# 14. Fase 2.7c — fechamento da configuração de produção

As três decisões que faltavam foram aprovadas como Política Creditum v1. A
`ProductionDetectorConfig` passou a ser montável — e não por afrouxamento: a
validação do artefato ganhou um bloco novo e obrigatório, e a projeção continua
passando por `validateDetectorConfig`.

## 14.1 As três decisões

### Detector A — regra de contribuintes: `top_n = 5`

Quando um Event de concentração apresenta casos contribuintes, publica os **5
maiores** segundo a ordenação já governada do detector: valor decrescente, com
desempate por `subject_ref` em code units. Menos de 5 elegíveis publica os que
existem — nunca completa com caso inválido ou ausente.

Este 5 é parâmetro de **explicação** do evento. `relevant_case_count = 5` decide
se um fato é material. São perguntas diferentes, e a §14.2 prova que os campos
são independentes.

`until_share_bp = 8000` foi **recusado** como política de produção. Não existe
regra Pareto/80% aprovada na Creditum, e o validador rejeita qualquer estratégia
fora de `top_n` — um artefato editado não consegue reintroduzi-la por baixo.

### Detector B — `material_absolute_basis_points = 1000`

1000 bp = **10 pontos percentuais** de diferença absoluta, aplicável somente
quando a métrica comparada já é governadamente expressa em basis points.

Não é a tolerância de conflito. As duas escalas convivem e medem coisas
diferentes:

| | mede | valor | decide |
| --- | --- | --- | --- |
| `numeric_tolerance_bp` | divergência **relativa** | 200 bp | equal vs conflict |
| `material_absolute_basis_points` | diferença **absoluta** | 1000 bp | materialidade em métricas bp |

`1000` vs `1900` tem 900 bp de diferença absoluta e 4737 bp de divergência
relativa. Usar um limiar no lugar do outro esconde conflito num caso e o fabrica
no outro.

Dinheiro, contagem, data, ID e identidade de unidade **não** são convertidos em
bp para usar esta dimensão: cada unidade tem seu campo. Conflito estrutural
continua com tolerância zero e severidade `medium` fixa.

### Detector D — `material_relative_delta_bp = 1000`, em MAGNITUDE

Uma mudança contrafactual relativa de 10% ou mais **em magnitude** é material por
esta dimensão:

```
material_relative = abs(relative_delta_bp) >= 1000
```

O valor **assinado** continua no resultado e na evidência. `-1500` sai como
`-1500`; a magnitude é usada para decidir, não para publicar, e não existe campo
`relative_delta_magnitude_bp` na saída.

Antes desta decisão a comparação era `valor >= limiar` sobre o número assinado, e
`-1500 >= 1000` é falso: uma queda de 15% no agregado desaparecia da
materialidade sem deixar rastro.

**O `abs()` está autorizado só aqui.** Não vale para severidade, participação, A,
B, C, nem outra métrica de D. A severidade de D continua em `share_of_total_bp`
(decisão da 2.7b): uma média que fica material pelo delta relativo, sem
participação parte-do-todo válida, mantém o fato e o Event executivo bloqueado.

## 14.2 Os dois "5" são campos independentes

`materiality.relevant_case_count` e
`detector_config.installment_concentration.contributing_case_rule.top_n` valem 5
os dois na v1. É exatamente por isso que a independência precisa de prova: um
`top_n: cfg.material_count_above` passaria em todo teste de valor e amarraria os
dois para sempre.

Provado nos dois sentidos: mudar `relevant_case_count` para 7 mantém `top_n` em
5, e a configuração projetada leva a materialidade de contagem para 7 sem mover a
apresentação. O mutante que amarra os campos mata o teste.

## 14.3 A projeção

Cada valor de negócio vem do artefato. O TypeScript faz **tradução de forma**,
não decisão:

| artefato | vira |
| --- | --- |
| `relevant_participation_bp` | toda dimensão `*_share_*_bp` de A, B, C e D |
| `financial_materiality_cents` | toda dimensão em centavos |
| `relevant_case_count` | toda dimensão de contagem |
| `minimum_population_contracts` | amostra mínima de A e C, população após remoção de D |
| `coverage.missing_share_insufficient_at_bp` | os limiares de cobertura, via a primitive de tradução |
| `severity_bands` | as quatro escalas de severidade |

Uma dimensão receber o mesmo número que outra não as torna o mesmo campo: são
campos independentes que a v1 preencheu com o mesmo valor aprovado, e cada um
pode mudar sozinho.

### Valores RELOCADOS — nenhum redecidido

Três valores já aprovados viviam em TypeScript (`APPROVED_THRESHOLDS`,
`BUSINESS_TIMEZONE`) e a projeção os injetaria de lá, o que contradiz "nenhum
valor de negócio injetado por TypeScript". Passaram a viver no artefato:

| campo | valor | aprovado em |
| --- | --- | --- |
| `installment_threshold` | 19 | briefing do Bloco 1, §14 Caso A |
| `similarity_threshold_bp` | 8000 | Fase 2.6b |
| `business_timezone` | `America/Sao_Paulo` | constante de negócio do projeto |

Nenhum valor mudou, e um teste afirma a igualdade com as constantes originais. É
relocação de fonte, não decisão nova. O `installment_comparison` foi registrado
junto porque `>= 19` e `> 19` classificam o contrato de 19 parcelas de formas
opostas.

## 14.4 A janela do Detector C

> **SUPERSEDIDO pela Fase 2.7c.1 (§15).** A 2.7c derivava a janela base de "a
> única aprovada que dispensa `reference_date`". A regra foi removida: ausência
> de data de referência é característica de forma, não semântica de negócio.

## 14.5 Harness de produção

`integration/tests/production-config-e2e.test.ts` roda a cadeia inteira sob a
configuração **real**: artefato → `ProductionDetectorConfig` → lote bruto → D13
governado → snapshot/evidência → store → A → B → C → D → low-ticket.

Duas provas de que não há queda para configuração de teste: o arquivo não importa
`TEST_CONFIG`, verificado lendo as próprias linhas de `import`; e não importa nada
de dentro de `tests/` de outro pacote além de `gateway/tests/helpers`, que
constrói objetos brutos e não carrega política.

O fixture tem **15 vendas**, não 7. A população mínima aprovada é 10 contratos:
com 7 o Detector A recusaria por amostra pequena, o que é o comportamento certo e
não provaria nada sobre a política.

O harness sintético (`end-to-end.test.ts`) continua existindo e continua usando
`TEST_CONFIG`. Ele não foi convertido: os casos fail-closed dele são calibrados
para limiares sintéticos, e convertê-los apagaria cobertura em vez de movê-la. Os
dois provam coisas diferentes — aquele prova composição e encanamento, este prova
que a política governada produz eventos executivos.

## 14.6 Estado final

| | estado |
| --- | --- |
| Política Creditum v1 | **COMPLETA** |
| `ProductionDetectorConfig` | **MONTÁVEL / READY** |
| Dados operacionais de `expected_units` | **INDISPONÍVEIS — blocker de dado externo** |

Configuração montável **não** significa que os dados de cobertura existem.
`expected_units` tem modelo aprovado (`period`, `dataset_id`, `unit_id`) e
`values_source: "UNRESOLVED"`. Catálogo ativo não é `expected_units`, e cobertura
que dependa dos memberships reais continua falhando fechado.

## 14.7 Testes

| Suíte | Antes | Depois |
| --- | --- | --- |
| A `installment-concentration` | 164 | **173** |
| B `cross-source-conflict` | 74 | **91** |
| C `first-due-date-concentration` | 196 | 196 |
| D `material-single-case` | 147 | **157** |
| `production-policy` | 71 | **96** |
| `production-config-e2e` (novo) | — | **29** |

**Mutação — cinco mutantes, todos mortos:**

| Mutante | Resultado |
| --- | --- |
| A: `top_n` → `until_share_bp: 8000` | recusa no load da política; 3 arquivos não carregam |
| B: `material_absolute_basis_points` 1000 → 900 | 5 testes |
| D: magnitude removida (volta ao assinado) | 3 testes |
| D: `basis` → `relative_delta_bp` (severidade) | recusa no load da política |
| Os dois "5" amarrados na projeção | 1 teste |

## 14.8 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓, **1553 testes / 28 arquivos**.
Portal `tsc --noEmit` limpo, portal 182, motor CEO 182. A/B/C/D sem regressão.

## 14.9 Blockers restantes — todos externos ou de engenharia

Nenhum threshold, severidade ou campo de configuração continua pendente.

1. **`expected_units`** — dados reais governados. Modelo aprovado, valores sem fonte.
2. **Leonardo → Supabase** — tabela/view/schema/`as_of` reais.
3. **Lucas → arquivo mensal** — contrato de arquivo, storage, provider.
4. **Briefing determinístico** — engenharia, dependente da decisão de read-model.
5. **Hermes read-model** — não iniciado, por decisão.

---

# 15. Fase 2.7c.1 — execução do Detector C e fonte única

Duas correções de engenharia. Nenhum threshold mudou, nenhum detector SHIP teve
matemática alterada.

## 15.1 Não existe janela implícita

A 2.7c escolhia `same_day` porque era a única janela aprovada que dispensa
`reference_date`. O problema não é o resultado — é o critério: **ausência de
`reference_date` é característica de FORMA, não semântica de negócio**. Uma
limitação do tipo `DetectorConfig`, que comporta uma janela só, estava decidindo
qual análise a Creditum executa.

A regra foi removida. `janelaBase()` não existe mais, e um teste lê o fonte para
garantir que não volte.

### O artefato expressa o conjunto aprovado

```json
"first_due_windows": {
  "approved_event_windows": [
    { "mode": "same_day" },
    { "mode": "next_n_days", "days": 7 }
  ],
  "context": ["calendar_month"],
  "day_basis": "civil_calendar_days"
}
```

`approved_event_windows` é um **conjunto**: a ordem não carrega significado,
nenhuma janela é padrão, e duplicata é recusa. `calendar_month` fica em
`context` — promovê-lo a janela executiva criaria um Event que ninguém aprovou,
e o validador recusa se ele aparecer no conjunto executivo.

Dias úteis e feriados continuam proibidos: exigiriam calendário governado.

### A configuração não carrega janela

`buildProductionDetectorConfig()` devolve `firstDueConcentration.window`
**ausente**. O campo virou opcional em `DetectorConfig`, e a obrigatoriedade
**mudou de lugar** — não foi afrouxada: o Detector C recusa quando recebe
configuração sem janela, nomeando o campo e apontando o construtor de execução.

### A execução escolhe

```ts
buildFirstDueExecutionConfig(policy, { window: "same_day" })
buildFirstDueExecutionConfig(policy, { window: "next_n_days", reference_date: "2026-09-20" })
```

`FirstDueExecution` é união discriminada de propósito: `reference_date` só existe
no ramo em que significa alguma coisa. Com um campo opcional solto,
`{ window: "same_day", reference_date }` compilaria e a data seria ignorada em
silêncio, e `{ window: "next_n_days" }` sem data também compilaria — deixando a
falta para runtime.

**A política define "7 dias corridos". A execução informa "a partir de quando".**
`reference_date` não aparece na política nem na configuração projetada; um teste
do harness afirma isso serializando as duas.

Janela não aprovada é recusa. `next_n_days` com 6 ou 8 dias é recusado no load da
política — o N é decisão de negócio, e a execução só escolhe qual janela e a
partir de quando.

## 15.2 Fonte única dos valores de negócio

A 2.7c relocou `installment_threshold`, `similarity_threshold_bp` e
`business_timezone` para o artefato, mas deixou os literais em `config.ts` vivos
ao lado. Duas fontes executáveis para a mesma decisão: editar o JSON não movia o
runtime, e a igualdade entre os dois lugares era coincidência mantida por atenção
humana — o mesmo defeito D13 da Fase 2.6c.

`detectors/src/governed-thresholds.ts` passou a derivar **todo** o
`APPROVED_THRESHOLDS` e o `BUSINESS_TIMEZONE` do artefato. Não há número escrito
lá. `config.ts` reexporta para os consumidores antigos; a autoridade é o JSON.

O módulo é separado de `production-policy.ts` para não fechar ciclo — aquele
importa `config.ts`, e constantes de topo de módulo num ciclo ESM podem ser lidas
como `undefined`. `governed-thresholds.ts` não importa nenhum dos dois.

### Como isso é provado

Igualdade entre duas constantes independentes não prova nada: se ambas forem
literais iguais, o teste passa e o problema continua. As provas são de derivação:

1. O runtime é comparado com o arquivo **lido do disco na execução do teste** —
   um literal divergente quebra.
2. O fonte de `config.ts` e `governed-thresholds.ts`, com comentários removidos,
   não pode conter `America/Sao_Paulo` nem atribuições numéricas dos campos.
3. Mudar o artefato move a configuração projetada.

### Um acoplamento que vale registrar

`validateDetectorConfig` fixa `installment_threshold` contra o valor governado e
recusa divergência. Isso torna impossível projetar uma política hipotética com
outro limiar — e é intencional: 19 é regra do briefing, não parâmetro
configurável. Fixar contra o artefato carregado é seguro **porque não existe
segunda fonte**: o valor pinado e o projetado saem do mesmo arquivo.

## 15.3 Os dois harnesses, e por quê

| harness | usa | prova |
| --- | --- | --- |
| `end-to-end.test.ts` | `TEST_CONFIG` — **TEST_ONLY** | composição dos detectores, casos adversariais, fail-closed |
| `production-config-e2e.test.ts` | `ProductionDetectorConfig` | a projeção exata da Política Creditum v1 |

Os dois ficam. Os 14 casos sintéticos não foram migrados: eles são calibrados
para limiares sintéticos, e convertê-los apagaria cobertura em vez de movê-la.
Uniformizar aparência não é motivo para perder teste.

O harness de produção prova ausência de queda para configuração de teste lendo as
próprias linhas de `import`: nada de `TEST_CONFIG`, e nada de dentro de `tests/`
além de `gateway/tests/helpers`, que constrói objetos brutos e não carrega
política.

## 15.4 Estado

| | estado |
| --- | --- |
| Política Creditum v1 | **COMPLETA** |
| `ProductionDetectorConfig` | **MONTÁVEL** |
| Execução de produção do Detector C | **as DUAS janelas aprovadas, explicitamente** |
| `TEST_CONFIG` | **TEST_ONLY** |
| Dados de `expected_units` | **blocker de dado externo** |

## 15.5 Testes

| Suíte | 2.7c | 2.7c.1 |
| --- | --- | --- |
| A `installment-concentration` | 173 | 173 |
| B `cross-source-conflict` | 91 | 91 |
| C `first-due-date-concentration` | 196 | **200** |
| D `material-single-case` | 157 | 157 |
| `production-policy` | 96 | **113** |
| `config` | 66 | **67** |
| `production-config-e2e` | 29 | **40** |
| `end-to-end` (sintético) | 47 | 47 |

**Mutação — quatro mutantes, todos mortos:**

| Mutante | Resultado |
| --- | --- |
| C cai para `same_day` quando a janela falta | 4 testes |
| A projeção volta a eleger uma janela | 3 testes |
| Literal `America/Sao_Paulo` volta ao fonte | 1 teste |
| A ordem do artefato passa a decidir a janela | 3 testes |

## 15.6 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓, **1586 testes / 28 arquivos**.
Portal `tsc --noEmit` limpo, portal 182, motor CEO 182. Todos os detectores SHIP
preservados.

---

# 16. Gate final — autoridade única e conjunto exato do Detector C

O gate adversarial encontrou um HIGH válido: era possível remover `next_n_days` do
artefato e a política **continuava válida**, `POLICY_V1_COMPLETE` continuava
`true`, a configuração continuava montável, e `diasDaJanelaCorrida` **fabricava
7** para uma janela que a política não aprovava. Uma análise obrigatória de
produção desaparecia em silêncio.

O artefato não mudou. SHA-256 continua
`db7a880b1d9ab357b2c2d46ddedf712699cfd351488e24482b1cd03832167a73`.

## 16.1 A linha entre vocabulário e valor governado

A correção depende de separar duas coisas que estavam misturadas no validador:

**Vocabulário / capacidade — pode viver em TypeScript.** Diz o que o runtime
*sabe executar*. Uma política fora disso não é "outra decisão da Creditum": é um
pedido sem código para atender, e recusar é checagem de capacidade.

| permaneceu | por quê |
| --- | --- |
| `FirstDueEventWindowMode` = `same_day \| next_n_days` | os dois modos que o Detector C implementa como alvo de Event |
| `FirstDueContextMode` = `calendar_month` | leitura de contexto; não existe Event por mês calendário |
| `VOCABULARIO_DE_METRICAS` | os nomes que `SingleCaseMetric` fecha e D sabe calcular |
| `BASE_DE_DIAS_IMPLEMENTADA` | dia útil exigiria calendário de feriados governado, que não existe |
| `SEVERIDADES`, `DIMENSOES_DE_PARTICIPACAO`, `SCHEMAS_SUPORTADOS` | vocabulário de tipos e de schema |

**Valor governado — só no artefato.** Removidos deste arquivo:

| removido | era |
| --- | --- |
| `DIAS_CORRIDOS_APROVADOS = 7` | pino numérico: `days !== 7` recusava |
| `CONTEXTOS_APROVADOS = {calendar_month}` | lista de contexto aprovado |
| `AGREGADORES_APROVADOS` | renomeado para vocabulário; o subconjunto habilitado vem do artefato |
| `diasDaJanelaCorrida()` | **deletada** — devolvia 7 por fallback |
| `CreditumPolicy.first_due_next_n_days` | **deletado** — cópia derivada do parâmetro |

Os vocabulários têm companheiro de runtime à prova de deriva:
`Readonly<Record<Modo, true>>`. Se um modo entrar no tipo e não no companheiro, o
TypeScript reclama de propriedade faltando; se entrar no companheiro e não no
tipo, de propriedade excedente. Uma lista literal solta poderia divergir em
silêncio.

## 16.2 Conjunto exato, sem criar segunda fonte

A exigência é de **totalidade sobre o vocabulário do protocolo**: cada modo que o
Detector C sabe executar precisa aparecer no conjunto governado exatamente uma
vez. Não existe lista de "janelas requeridas" escrita em TypeScript — a
obrigatoriedade é estrutural, derivada do vocabulário, e não carrega parâmetro
nenhum.

Recusas:

| condição | resultado |
| --- | --- |
| `same_day` ausente | política inválida |
| `next_n_days` ausente | política inválida — **o HIGH** |
| modo duplicado (mesmo com `days` diferente) | inválida |
| membro fora do vocabulário (`calendar_month`, `business_days`, …) | inválida |
| lista vazia | inválida |
| `days` ausente, zero, negativo ou não inteiro | inválida |
| `same_day` com `days` | inválida — o modo não tem parâmetro |
| `context` ausente, vazio, duplicado ou com membro extra | inválida |
| ordem invertida | **válida**, projeção idêntica |

## 16.3 O `days` deixou de ser pinado

`days` é lido do artefato. Um artefato com `days: 6` descreve uma política
**diferente**, e o runtime a executa como 6 — o que nenhum código pode fazer é
dizer "se não for 7, uso 7".

Isto é uma mudança de comportamento em relação à 2.7c.1, que recusava 6 e 8 por
uma constante TypeScript. Aquela constante era a segunda autoridade que o gate
apontou: o artefato dizia 7 e o código também, e a igualdade era coincidência
mantida à mão. O controle compensatório é o próprio artefato — versionado, com
hash conhecido — e um teste que afirma que o valor **em disco** é 7.

## 16.4 O fallback morreu por deleção

`first_due_next_n_days` era uma cópia derivada do parâmetro, alimentada pela
função que fabricava 7. Os dois foram deletados. Quem precisa do número chama
`productionNextNDays(policy)`, que **lê a janela governada** e devolve
`undefined` se ela não existir — nunca um número inventado.

Deletar foi melhor que corrigir: um `throw` no lugar do fallback seria código
inalcançável (a totalidade garante a janela), e código inalcançável não pode ser
provado por teste nenhum.

## 16.5 Projeção exata

Teste de projeção compara, campo a campo, o artefato **lido do disco** contra a
política em runtime: mesmas janelas, mesmo contexto, mesma cardinalidade, e o
`days` da execução igual ao do arquivo. A varredura de literais no fonte continua
como defesa secundária, não como prova principal.

## 16.6 Mutação

Duas fraquezas apareceram na primeira rodada e foram corrigidas: as asserções
diziam só "ausente", e uma segunda defesa a jusante mascarava a falta da
totalidade. As mensagens agora são específicas.

| Mutante | Resultado |
| --- | --- |
| Validador volta a checar só os membros fornecidos | **4 testes** |
| Fallback de 7 reintroduzido no acessor | **1 teste** |
| Runtime reintroduz `amount_mean_cents` fora do artefato | **1 teste** |
| Runtime devolve o vocabulário de contexto em vez do declarado | **sobreviveu — equivalente** |

O último é honestamente um **mutante equivalente**: `context` tem um membro só, e
sob a totalidade reconstruir do vocabulário e projetar o artefato dão o mesmo
resultado. Nenhum teste pode distingui-los sem uma política que a validação
proíbe. O código foi trocado para projeção de qualquer forma, para que a diferença
apareça no dia em que o contexto ganhar um segundo membro. A variante do mesmo
mutante que **pode** divergir — agregadores, que têm três membros — é morta.

## 16.7 Auditoria dos demais pinos

Continuam pinando valor, e ficaram fora deste escopo por instrução explícita:
`low_ticket.severity !== "medium"`, `structural_severity !== "medium"`,
`structural_tolerance_bp !== 0`, `semantics !== "OR"`,
`installment_comparison`, `comparison !== "strictly_less_than"`, e as três
estratégias (`top_n`, `max_available_participation`,
`share_of_total_when_applicable`).

As estratégias e comparações são vocabulário de capacidade — só existe uma
implementação de cada. As **severidades** `medium` são escolha entre opções
implementáveis, e portanto são pinos de valor da mesma natureza do `days !== 7`
que acabou de sair. Ficam registradas aqui como dívida conhecida, não como
resolvidas.

## 16.8 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓, **1612 testes / 28 arquivos**.
Portal `tsc --noEmit` limpo, portal 182, motor CEO 182.

A 173 · B 91 · C 200 · D 157 · low-ticket 84 · `production-policy` **139** ·
`config` 67 · `production-config-e2e` 40 · `end-to-end` 47.

---

# 17. Limpeza final — os três últimos valores governados

Saíram os três últimos pinos executáveis de valor de negócio. O artefato de
produção **não mudou**: SHA-256 continua
`db7a880b1d9ab357b2c2d46ddedf712699cfd351488e24482b1cd03832167a73`, e ele segue
declarando `days: 7`, `low_ticket.severity: "medium"` e
`structural_severity: "medium"`.

## 17.1 A regra de autoridade, agora aplicada sem exceção

| TypeScript valida | Artefato decide |
| --- | --- |
| estrutura e tipo | valores Creditum |
| vocabulário / capacidade implementada | thresholds |
| campo obrigatório | severidades escolhidas |
| relações semânticas genéricas | dias |
| totalidade de conjunto | estratégias habilitadas e subconjuntos de capacidade |

## 17.2 Pinos removidos

| pino | onde | era |
| --- | --- | --- |
| `days !== 7` | validação das janelas de C | escolha numérica governada |
| `low_ticket.severity !== "medium"` | validação de low-ticket | escolha entre severidades implementáveis |
| `structural_severity !== "medium"` | validação de severidade do B | idem |

Em cada caso o que ficou é: **campo obrigatório**, **dentro do vocabulário**,
**valor projetado do artefato sem transformação**.

O `!== "medium"` era o caso mais insidioso dos três, porque parecia um invariante
de negócio legítimo. Não era: `medium` é uma escolha entre quatro severidades que
o motor executa igualmente bem. O artefato dizia `medium`, o código também, e a
igualdade era coincidência mantida por atenção humana — a mesma forma do defeito
D13 da Fase 2.6c e do `days !== 7` do gate anterior.

## 17.3 O que ficou como vocabulário / capacidade

Nada disso é escolha de negócio; é o que existe implementação para executar.

| permanece | significa |
| --- | --- |
| `SEVERIDADES` | as severidades que o motor sabe emitir |
| `FirstDueEventWindowMode`, `FirstDueContextMode` | os modos de janela e de contexto que C implementa |
| `VOCABULARIO_DE_METRICAS` | as métricas que D sabe calcular |
| `BASE_DE_DIAS_IMPLEMENTADA` | dia útil exigiria calendário de feriados governado |
| `DIMENSOES_DE_PARTICIPACAO`, `SCHEMAS_SUPORTADOS` | vocabulário de tipo e de schema |
| estratégias (`top_n`, `max_available_participation`, `share_of_total_when_applicable`) e comparações (`strictly_less_than`, `strictly_greater_than`) | existe uma implementação de cada |

`SEVERIDADES` inclui `info`. Isso significa que o motor sabe emitir `info`, não que
a Creditum a aprove para alguma regra — e agora que os pinos saíram, um artefato
poderia selecioná-la. Fica registrado: é decisão de governança, e apareceria no
diff e no hash como qualquer outra.

## 17.4 Projeção exata

Testes comparam o artefato **lido do disco** contra o runtime, campo a campo, sem
transformação de valor:

```
artefato.low_ticket.severity                     === runtime.low_ticket_severity
artefato.detector_severity.…structural_severity   === runtime.structural_severity
artefato.…next_n_days.days                        === productionNextNDays()
                                                  === execução.window.days
```

E um teste afirma que os três valores **em disco** continuam 7 / medium / medium.

## 17.5 As fixtures que provam a autoridade

Nenhuma altera a Policy v1 real — são cópias em memória.

| fixture | resultado |
| --- | --- |
| `days: 7 → 6` | política carrega; `productionNextNDays()` devolve 6; a execução usa 6; nenhuma reescrita para 7 |
| `low_ticket.severity: medium → high` | política carrega; runtime projeta `high`; piso e comparação não se movem |
| `structural_severity: medium → high` | política carrega; a configuração leva `high` ao Detector B; escala relativa e tolerância intactas |

A independência das duas severidades ganhou prova direta, que o pino antes tornava
impossível: mudar a do low-ticket deixa a estrutural em `medium`, e vice-versa.

Ausente, vazio, fora do vocabulário, tipo errado — tudo continua recusado.

## 17.6 Mudar política não é configuração técnica

Trocar `7` por `6`, ou `medium` por `high`, é **mudança de política Creditum**. As
consequências são de processo, não de código:

- diff no artefato governado;
- SHA-256 novo;
- revisão e aprovação humanas;
- testes de produção contra o novo valor.

O schema não substitui esse processo com hard-code, e não é papel dele esconder ou
reverter a mudança. O controle é o artefato ser versionado e ter hash conhecido.

## 17.7 Auditoria §12

Busca por `!== "medium"`, `=== "medium"`, `days === 7`, `days !== 7`, `?? 7`,
`return 7` e subconjuntos Creditum hard-coded em `production-policy.ts`,
`config.ts` e `governed-thresholds.ts`:

- **A — expectativa de teste sobre o artefato atual:** aceitável, e é o que
  restou nos testes.
- **B — vocabulário de protocolo:** aceitável, listado em §17.3.
- **C — autoridade de produção:** **zero ocorrências.** Há teste que varre os três
  fontes, com comentários removidos, e falha se qualquer uma voltar.

`TEST_CONFIG` continua sintético e TEST_ONLY; produção não cai nele, provado no
harness de produção pelas linhas de `import`.

## 17.8 Verificação

`npm run verify`: schemas ✓, lint ✓, typecheck ✓, **1633 testes / 28 arquivos**.
Portal `tsc --noEmit` limpo, portal 182, motor CEO 182.

A 173 · B 91 · C 200 · D 157 · low-ticket 84 · `production-policy` **160** ·
`config` 67 · integração 87 (40 produção + 47 sintético).
