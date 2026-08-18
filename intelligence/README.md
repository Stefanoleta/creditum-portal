# Centro de Inteligência da Creditum — POC (Bloco 1)

Prova de conceito para decidir se o **Hermes Agent** merece operar como runtime
analítico controlado da Creditum. Não é um app. É a estrutura mínima, isolada e
auditável para responder a essa pergunta com evidência.

**Estado:** Fase 1 concluída, revisada pelo CEO e ajustada. O Hermes **não está
instalado** e **nenhum provedor de modelo foi conectado**.

**Padrão de autonomia:** OBSERVAR → ANALISAR → ALERTAR → RECOMENDAR.
Nenhuma ação financeira, comercial, de relacionamento ou de publicação é
executada automaticamente.

---

## Comandos

Tudo roda a partir de `intelligence/`. Subprojeto npm próprio — ver
[ADR-001](docs/ADR-001-boundary-with-existing-app.md).

### Instalar

```bash
cd intelligence && npm install
```

Sem serviço externo, sem chave de API, sem rede em runtime. Só devDependencies.

### Verificar tudo

```bash
cd intelligence && npm run verify
```

Quatro etapas, nesta ordem — a primeira que falhar interrompe:

| Etapa | Comando | O que prova |
|---|---|---|
| 1. Contratos | `npm run validate:schemas` | 6 contratos compilam sob ajv strict, 13 fixtures válidas |
| 2. Lint | `npm run lint` | 18 arquivos, com informação de tipo |
| 3. Tipos | `npm run typecheck` | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| 4. Testes | `npm test` | 257 testes em 10 arquivos |

Saída esperada ao final:

```
✓ 6 contratos compilam · 13 fixtures válidas
Test Files  10 passed (10)
     Tests  257 passed (257)
```

A validação de contratos é um script separado de propósito: quem revisa um
contrato precisa poder verificá-lo sem rodar a suíte inteira.

### Conferir que o portal segue intacto

```bash
cd /Users/carolbrum/creditum-portal && npx tsc --noEmit && npx vitest run
```

Esperado: `tsc` sai 0 e **182 testes passam**. É a prova de que a fronteira do
ADR-001 funciona.

> `npm run verify` do portal também roda `eslint`, que falha com 16 erros
> **pré-existentes**. Verificado contra o estado anterior a esta entrega:
> idêntico. Ver [THREAT_MODEL P3](docs/THREAT_MODEL.md).

### Remover o ambiente local

```bash
rm -rf intelligence/node_modules
```

Para remover a POC inteira: apague `intelligence/` e reverta as duas linhas do
ADR-001 (`tsconfig.json` e `eslint.config.mjs` do portal).

---

## O que existe hoje

```
intelligence/
  contracts/          6 contratos JSON Schema (2020-12), negação por padrão
  gateway/src/
    contracts.ts      compilação e validação dos contratos
    semantic.ts       invariantes que JSON Schema não expressa
    factory.ts        caminho ÚNICO de construção validada
    integrity.ts      integridade referencial do conjunto
    store.ts          destacamento, congelamento profundo, registro privado
    allowlist.ts      capacidade, fonte e campo — negação por padrão
    gateway.ts        as cinco leituras; internos `#private`
    egress.ts         fronteiras de PII nos quatro canais
    pii.ts            detecção por chave, valor e contexto
  gateway/tests/      257 testes em 10 arquivos
  fixtures/           sintéticas (4 casos) + dourada + injeção real
  scripts/            validação de contratos, independente do runner
  docs/               ADR-001, THREAT_MODEL, DATA_FLOW
```

### Contratos

`snapshot` · `event` · `evidence` · `recommendation` · `decision` · `aros-briefing`

Todos com `additionalProperties: false`. As invariantes de classe de dado estão
**no schema**: `calculated` exige fórmula, `inferred` exige confiança, `forecast`
exige faixa, `gap` **proíbe** valor — ausência não vira zero por construção.

`human_decision_required` é `const true`. `resolved` de conflito é **obrigatório**
e `const false` — omitir o campo era um furo que deixava a recomendação passar
sem afirmar nada.

**O payload do snapshot é fechado.** Não é `Record<string, unknown>`: cada campo
tem forma explícita, valores de histograma e de unidade são inteiros, e nomes de
unidade seguem padrão restrito. Nenhum campo aceita texto livre — texto de fonte
só existe em `source_notes`, dentro do envelope `untrusted_text`.

É o que torna a defesa contra prompt injection **estrutural** em vez de
heurística: não há detector de "texto malicioso", há ausência de lugar onde a
instrução caiba. Injeção em `period_label`, como chave ou valor de
`unit_breakdown`, em campo inventado, ou solta em `source_notes` sem envelope —
todas recusadas **na construção do store**, antes de existir resposta.

**Resolução de conflito é evento humano, não edição.** O conflito original
permanece `resolved: false` para sempre no snapshot e na recomendação. Fechá-lo é
um `conflict_resolutions` no contrato de decisão, vinculado por `conflict_id`,
com justificativa e autor. Quem lê o histórico continua enxergando que houve
divergência.

### Gateway

Cinco capacidades, todas de leitura: `listSnapshots`, `getSnapshot`, `listEvents`,
`getEvidence`, `getMaterialCases`. Os internos são `#private` — não existem no
protótipo, então o teste compara a lista **real** de métodos com a allowlist, sem
filtrar nada antes. Um método novo quebra o teste.

**Frescor é o da dependência mais velha.** Uma resposta que mistura um snapshot
de hoje com um de junho vale o que vale a de junho. A comparação é por instante,
não por ordenação de string — um `-05:00` no meio de uma lista de `Z` reordena
tudo em silêncio, e há teste com exatamente essa armadilha.

Timestamp no futuro além de 5 minutos de tolerância degrada a resposta para
`insufficient` e marca `clock_anomaly`: idade desconhecida não é frescor.

O gateway **não calcula nada**. Soma, média, percentual, ranking, conversão e
ticket pertencem aos detectores em código testado (Fase 2).

### Construção validada

Não existe `JSON.parse(x) as Snapshot`. Todo objeto externo passa por
`factory.ts` — contrato **e** invariantes semânticas (`period_start <=
period_end`, `observed_at <= ingested_at`, `reporting_units <= expected_units`,
`ratio_bp` coerente com a contagem, timestamps não futuros).

**Todo o grafo de entrada é destacado antes da primeira validação.** Schema,
semântica, integridade e congelamento operam sobre esse mesmo grafo destacado,
que é o que será armazenado — não há cópia entre a validação e o congelamento.

Isso fecha um TOCTOU: antes, cada elemento era validado sobre a referência
original e a cópia só acontecia no fim, então um elemento posterior com getter ou
trap podia alterar um elemento anterior já aprovado, e a cópia final capturava o
estado alterado. Depois do destacamento, a entrada original está fora da
fronteira de confiança. Entrada não destacável — `Proxy`, função — falha fechado
com `DataCloneError` e o store não chega a existir.

O construtor do store é o único caminho: destaca, valida, verifica integridade
referencial e congela em profundidade. Referência pendurada —
evento apontando para snapshot inexistente, evidência órfã, evidência fora do
lastro declarado — **impede a construção**. Referência *válida mas de outro dono*
também: um snapshot só cita evidência própria, e o `locator.dataset_id` da
evidência tem que bater com o dataset do snapshot dono.

### Fronteira de runtime do store

`ReadOnlyStore` é interface **estrutural**: qualquer objeto com os três métodos a
satisfaz, e o compilador não roda em produção. O gateway exige, em runtime, que o
store tenha vindo do caminho validado.

Duas checagens, porque cada uma sozinha tem furo: um **registro privado**
(`WeakSet` no módulo do store, sem função exportada que acrescente a ele) e a
**identidade de protótipo**. O registro sozinho não pega uma subclasse — o
construtor da base roda, registra `this`, e só então o override troca o que é
devolvido. O protótipo está congelado, então também não dá para trocar
`allSnapshots` depois.

A verificação de integridade recebe os arrays privados, não o store: passar o
store faria a validação chamar `allSnapshots()`, que é virtual, e uma subclasse
validaria os próprios dados falsificados.

A **instância** também é congelada, antes de entrar no registro. Sem isso um
store legítimo seguia extensível, e `Object.defineProperty(store, "allSnapshots",
…)` instalava um método próprio que sombreava o do protótipo — com o registro
intacto e o protótipo idêntico. `Object.freeze` fecha os três vetores de uma vez:
nada de propriedade nova, nada de sobrescrever accessor, e `[[Prototype]]` vira
imutável. Como o congelamento acontece antes do registro, não há janela: um store
aceito não muda de comportamento depois.

Um `Proxy` sobre um store válido também é recusado — ele repassa o protótipo do
alvo, mas é outro objeto, e o `WeakSet` indexa por identidade.

### Política de egresso invariante à configuração

O gateway recebe **configuração**, não uma instância de `Allowlist`, e constrói a
implementação concreta internamente — não há `projectPayload` para uma subclasse
sobrescrever na fronteira.

`MODEL_EGRESS_DENYLIST` é **não configurável**: uma configuração que tenta
habilitar `unit_breakdown` é recusada com `NOT_ALLOWED`, não ignorada em
silêncio. E a projeção para `ModelFacingPayload` é fechada campo a campo, não um
laço sobre o que a allowlist deixou passar — campo que não está escrito lá não
existe para o modelo.

### Texto de fonte não entra no contexto do modelo

`untrusted: true` é rótulo, e rótulo não impede um modelo de seguir o texto.
Então o texto não vai: `source_notes[].content` e `untrusted_excerpt.content` são
**retidos** na resposta. O que atravessa é `origin`, `content_length` e
`content_sha256` — suficiente para o humano recuperar o original na auditoria.

O conteúdo permanece íntegro no store. A retenção é da resposta, não do registro.

### Fronteiras de PII

`egress.ts` aplica a política nos **quatro sentidos**, não só na saída:

| Canal | O que atravessa | Política |
|---|---|---|
| `to_model` | respostas do gateway, prompts, briefings | fail-closed |
| `from_model` | saída do modelo antes de persistir | fail-closed |
| `memory` | escrita na memória do agente | fail-closed |
| `log` | trilha, trace, telemetria | exige `redactForLog()` explícito |

A cópia redigida passa pela **mesma** barreira antes de ser devolvida — sem
exceção nem modo especial. Se a redação tiver furo, levanta ali e não vira log.

A chave `name` é **contextual**: aceita só em `observed_metric`,
`reference_metric`, `metric` e `metrics`, e mesmo ali só com valor snake_case.
`{"observed_metric": {"name": "Maria da Silva"}}` é bloqueado.

---

## O que falta, por fase

### Fase 2 — Detectores e contratos *(autorizada)*
- Importar o motor determinístico de `src/lib/ceo/`
- Implementar os quatro detectores; hoje os eventos são fixtures
- Plano de ingestão, com credencial separada do Hermes
- Briefing sanitizado do Aros
- Testes dourados e adversariais adicionais

### Fase 3 — Hermes isolado *(security spike aprovado, com condições)*
- Confirmar a chave de `config.yaml` para desabilitação **por ferramenta** —
  a granularidade existe ([THREAT_MODEL §3.1](docs/THREAT_MODEL.md)), mas o nome
  da chave não é documentado e não foi assumido aqui
- Fixar versão e commit; VM descartável; sem ACP; sem credencial de produção;
  apenas o toolset `mcp-creditum`; egress restrito
- Ledger externo, medidor de custo, kill switch
- `intelligence/.env.example` sem nenhuma chave do portal (P0)

### Fase 4 — Avaliação e Aros
### Fase 5 — Empacotamento
- Docker Compose endurecido, backup/restore, VPN/proxy, runbooks
- `SECURITY.md`, `OPERATIONS.md`, `TEST_PLAN.md`

> Esses três ainda **não existem**, de propósito: descreveriam operação que
> ninguém exercitou.

---

## GATE D13 — bloqueia a Fase 3

**A canonicalização D13 da Fase 2 é requisito bloqueante.** Enquanto não estiver
implementada e verificada, é proibido instalar ou habilitar o Hermes (inclusive
em VM descartável), iniciar o runtime da Fase 3, tratar
`coverage.missing_units[]` ou `contributing_cases[].unit` como identificadores
confiáveis para o modelo, ou reabilitar `unit_breakdown` no caminho `to_model`.

Texto completo e justificativa em [THREAT_MODEL — GATE D13](docs/THREAT_MODEL.md).

## Condições de parada ativas

1. **Docker não instalado** — bloqueia Fases 3 e 5, não a Fase 2
2. **Modelo de permissão do Hermes não verificado na prática.** A restrição por
   ferramenta **é documentada** e `file`/`terminal` são toolsets separados — mas
   a issue [#79516](https://github.com/NousResearch/hermes-agent/issues/79516)
   (aberta) mostra ACP ignorando toda restrição, e a documentação registra que
   backends de contêiner **pulam a pilha de guardas**. Nada disso pode ser
   declarado como proteção sem teste
3. **Nenhum provedor de modelo conectado**
4. **Implantação na Hostinger não autorizada**
