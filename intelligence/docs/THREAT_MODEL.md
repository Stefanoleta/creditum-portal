# THREAT_MODEL — POC do Centro de Inteligência

**Versão:** 0.6 (Fase 1.1 — correção TOCTOU)
**Data:** 2026-08-16
**Cobertura da suíte:** 257 testes em 10 arquivos
**Escopo:** plano de consulta somente leitura + contratos. O Hermes **não está
instalado** e nenhum provedor de modelo foi conectado.

> **Como ler este documento.** Cada controle é classificado em um de quatro
> níveis, e a distinção não é burocracia — é a diferença entre proteção e
> suposição de proteção:
>
> | Nível | Significa |
> |---|---|
> | **D — Documentado** | Consta na documentação oficial do Hermes. **Não foi testado por nós.** |
> | **T — Testado** | Exercitado por teste automatizado neste repositório, com evidência reproduzível |
> | **L — Limitação por modo de execução** | Existe, mas é ignorado ou pulado em certos modos (ACP, contêiner, cron) |
> | **C — Externo Creditum** | Implementado por nós porque o Hermes não oferece ou não é confiável o bastante |
>
> Declarar D como se fosse T é exatamente a falha que o §21 chama de bloqueante.

---

## 1. O que estamos protegendo

| Ativo | Por que importa |
|---|---|
| PII de aluno (CPF, nome, telefone, e-mail) | LGPD. A base real tem os quatro. |
| Números que sustentam decisão do CEO | Número errado com aparência de certo é pior que número ausente |
| Credenciais do portal | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ARGUS_TOKEN`, `BITRIX24_WEBHOOK_URL` |
| Integridade do ledger | Se a trilha for editável, a auditoria não vale nada |
| Capacidade de agir da empresa | Nenhuma ação comercial, financeira ou de relacionamento pode sair de um agente |

## 2. Fronteiras de confiança

```
[ingestão]  grava snapshots · credencial de ESCRITA · Hermes NÃO alcança
     │
     ▼
[consulta]  ReadOnlyGateway · allowlist · guardEgress(to_model)   ← única superfície
     │                                                              do agente
     ▼
[runtime]   Hermes Agent · toolset mcp-creditum apenas
     │
     ▼
[captura]   EXTERNO · guardEgress(from_model) · ledger · custo · decisão
```

**A regra que sustenta tudo:** o Hermes nunca recebe credencial de escrita. Se a
saída dele precisa ser persistida, quem persiste é o plano de captura, que o
agente não controla e não enxerga.

---

## 3. Correção registrada — permissões do Hermes

> **A versão 0.1 deste documento afirmou que o Hermes só controla ferramentas por
> _toolset_ e que restrição individual "não é documentada". Isso estava errado.**
>
> A afirmação veio da página `/docs/user-guide/features/tools`, que agrupa as
> ferramentas em categorias de apresentação ("Terminal & Files") e diz
> literalmente "Individual tool-level restrictions: Not stated". A página
> `/docs/reference/toolsets-reference/` — que eu não havia lido — contradiz isso.
>
> Correção apontada pelo CEO na revisão, verificada na fonte e aceita.

### 3.1 O que a referência oficial de fato diz

| Fato | Consequência |
|---|---|
| `file` e `terminal` são **toolsets separados**. `file` = `patch`, `read_file`, `search_files`, `write_file`. `terminal` = `terminal`, `process` | Dá para ter leitura de arquivo sem terminal |
| `hermes tools` (TUI) e `/tools disable <x>` operam **no nível da ferramenta**, "finer than toolsets", e "disabled tools are filtered out even if their toolset is enabled" | **Dá para remover `write_file` e `patch` individualmente** |
| Cada servidor MCP gera um toolset dinâmico `mcp-<servidor>` | O gateway da Creditum vira `mcp-creditum` |
| A estrutura exata da chave em `config.yaml` para desabilitação por ferramenta **não é documentada** | Precisa ser verificada na versão fixada; nenhum nome de chave foi assumido aqui |

### 3.2 Por que MCP-only continua sendo a recomendação

Não porque configurar ferramenta individual seja impossível — **é possível**. Por
três outras razões:

1. **Superfície menor.** Com um único toolset `mcp-creditum`, o conjunto de
   capacidades é enumerável em uma linha. Com `file` parcialmente habilitado, a
   revisão precisa acompanhar cada mudança de agrupamento a cada versão.
2. **Ausência de escrita fica demonstrável.** Provar "não há ferramenta de
   escrita" é mais fácil que provar "a de escrita está desligada" — a primeira é
   propriedade da configuração, a segunda depende de a filtragem funcionar.
3. **Há evidência de que a filtragem falha em pelo menos um modo.** Ver 3.4.

### 3.3 Controles documentados (nível **D**)

Nenhum destes foi testado por nós. Todos são da documentação oficial.

| Controle | Chave | Padrão |
|---|---|---|
| Modo de aprovação | `approvals.mode` | `smart` (também `manual`, `off`) |
| Aprovação em cron | `approvals.cron_mode` | **`deny`** |
| Aprovação em query única | `approvals.single_query_mode` | **`deny`** |
| Timeout de aprovação | `approvals.timeout` | 300s, **fail-closed** |
| Deny incondicional | `approvals.deny` | vazio — avaliado **antes** de `--yolo` e `mode: off` |
| Raiz de escrita permitida | `HERMES_WRITE_SAFE_ROOT` | não definido |
| Backend de terminal | `terminal.backend` | `docker` etc. |
| Passagem de env | `terminal.env_passthrough`, `docker_forward_env`, `credential_files` | vazios |
| URLs privadas | `security.allow_private_urls` | `false` |
| Scanner tirith | `security.tirith_enabled` | `true` |
| Env do MCP | só `PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL`, `TMPDIR`, `XDG_*` | — |
| Autorização de gateway | sem allowlist configurada ⇒ **todos negados** | deny-by-default |
| Blocklist hardline | 8 padrões catastróficos, não sobrescrevíveis por `--yolo` nem `mode: off` | — |

### 3.4 Limitações por modo de execução (nível **L**)

Estas são as mais perigosas, porque cada uma **desliga um controle que a seção
anterior lista como existente**.

**L1 — ACP ignora toda restrição de toolset.**
[Issue #79516](https://github.com/NousResearch/hermes-agent/issues/79516) —
verificada: **aberta**, `type/bug`, `comp/acp`, `area/config`, P4, criada em
2026-08-05. Título: *"ACP sessions ignore platform_toolsets.acp /
agent.disabled_toolsets — terminal/execute_code always enabled regardless of
profile config"*. O toolset da sessão ACP é literal fixo `["hermes-acp"]`, que
sempre inclui `terminal`, `process` e `execute_code`.
→ **ACP proibido na POC.** Condição já imposta pelo CEO.

**L2 — Backends de contêiner pulam a pilha de guardas.**
Documentação, textual: *"When running in `docker`, `singularity`, `modal`,
`daytona`, or `vercel_sandbox` backends, dangerous command checks are **skipped**
because the container itself is the security boundary"*, e *"Isolated container
backends skip the guard stack entirely"*.
→ Justamente a configuração que planejávamos. Aprovação e `approvals.deny` **não
valem** ali. O contêiner é a única fronteira — então ele precisa ser endurecido
de verdade, não decorado com guardas que não rodam.

**L3 — `terminal` contorna as proteções de escrita.**
Documentação, textual: *"Write guards apply to `write_file` and `patch` only. The
`terminal` tool runs as the same OS user and can still `cat` or overwrite denied
paths via shell commands"*.
→ `HERMES_WRITE_SAFE_ROOT` e a desabilitação de `write_file`/`patch` **não são
sandbox** enquanto `terminal` existir. Reforça desligar o toolset `terminal`
inteiro, não só as ferramentas de escrita.

**L4 — O scanner de segurança falha aberto.**
`security.tirith_fail_open` é `true` por padrão: comandos seguem se o tirith não
estiver instalado ou der timeout.
→ Não pode ser contado como controle.

**L5 — Aprovação interativa não existe em job 24/7.**
`cron_mode: deny` é o padrão correto, mas a defesa é a **negação**, não a
aprovação. Nenhum fluxo da POC pode depender de alguém clicar.

### 3.5 Controles externos da Creditum (nível **C**)

O que o Hermes não oferece, ou oferece de forma que L1–L5 tornam pouco confiável.

| Exigência | Onde vive | Estado |
|---|---|---|
| Saída estruturada obrigatória | `contracts.ts` — `assertValid` aborta | **T** |
| PII barrada entrando no modelo | `egress.ts` — `guardEgress(to_model)` | **T** |
| PII barrada saindo do modelo | `guardEgress(from_model)` | **T** (função), **C** (fiação na Fase 3) |
| PII barrada na memória | `guardEgress(memory)` | **T** (função) |
| Log redigido | `redactForLog` — verifica a própria saída | **T** |
| Ausência de rota de escrita | `ReadOnlyGateway` | **T** |
| Allowlist de fonte e campo | `allowlist.ts` | **T** |
| Ledger append-only | plano de captura, fora do agente | ⬜ Fase 3 |
| Teto de custo por execução | medidor externo | ⬜ Fase 3 |
| Kill switch | parar contêiner + revogar credencial do gateway | ⬜ Fase 3 |
| Segredo por provedor | `.env` próprio, sem chave do portal | ⬜ Fase 3 (P0) |
| Garantia de não-troca de modelo | `provenance` obrigatória, preenchida pelo capturador | ⬜ Fase 3 |

---

## 4. Ameaças e estado real

| # | Ameaça | Mitigação | Nível |
|---|---|---|---|
| T1 | Agente executa ação (pagamento, CRM, publicação) | Nenhuma rota de escrita no gateway; superfície pública == allowlist | **T** |
| T2 | Prompt injection em célula da planilha | Texto da fonte só em `untrusted_excerpt` com `untrusted: true` | **T** |
| T3 | PII vaza para provedor externo | `guardEgress` + contratos exigem `subject_ref`; scanner cobre valores **e chaves dinâmicas** | ver 4.1 — a claim é dividida |
| T4 | Agente escolhe um lado de fonte conflitante | `resolved` é `const false`; conflito contamina a qualidade | **T** |
| T5 | Nome de pessoa entra por campo técnico | `name` só em contexto de métrica **e** só com valor snake_case | **T** |
| T6 | Ausência de dado vira zero | `data_class: "gap"` proíbe `value` por schema | **T** |
| T7 | Enumeração de rota de escrita | Snapshot bloqueado e inexistente devolvem o mesmo código | **T** |
| T8 | Consulta a fonte proibida (Omie) | Allowlist; evento com lastro bloqueado some junto | **T** |
| T9 | Dado velho tratado como atual | `data_age_hours` obrigatório; vazio é `insufficient` | **T** |
| T10 | Saída fora do schema apresentada como recomendação | `assertValid` aborta | **T** |
| T11 | Conflito fechado sem rastro | Resolução humana é evento novo no ledger, vinculado por `conflict_id`; o original segue `resolved: false` | **T** |
| T17 | Instrução injetada em campo ESTRUTURADO do payload | Payload fechado: recusa na **construção do store** | **T** |
| T17b | Instrução no único campo de texto livre (`source_notes`, `untrusted_excerpt`) | Conteúdo **retido** da resposta ao modelo; só origem, tamanho e sha256 atravessam. Texto preservado no store para auditoria | **T** |
| T18 | Resposta parece fresca por causa do snapshot mais novo | `as_of` é o `observed_at` mais **velho** do conjunto | **T** |
| T19 | Timestamp com fuso reordena a comparação | Comparação por instante, não por string | **T** |
| T20 | Dado com relógio adiantado passa por fresco | Além de 5 min de tolerância: `insufficient` + `clock_anomaly` | **T** |
| T21 | Objeto externo vira tipo de domínio por cast | `factory.ts` é o caminho único: contrato + semântica | **T** |
| T21e | Estado armazenado diverge do estado validado (TOCTOU) | O grafo de entrada inteiro é **destacado antes da primeira validação**; schema, semântica, integridade e congelamento operam sobre esse mesmo grafo destacado, sem cópia intermediária | **T** — armadilha reentrante para valor inválido e para valor ainda válido, dentro da coleção e entre coleções; entrada não destacável (Proxy, função) falha fechado |
| T21b | Store estruturalmente compatível mas não validado é aceito pelo gateway | Registro privado (`WeakSet`, não exportável) + identidade de protótipo exato + `Object.isFrozen` | **T** — recusados: objeto literal, subclasse com override, protótipo emprestado e `Proxy` sobre store válido |
| T21c | Store válido é adulterado DEPOIS de validado | `Object.freeze(this)` antes do registro: instância não-extensível, accessors não-graváveis, `[[Prototype]]` imutável | **T** — `defineProperty` nos três accessors, atribuição direta, propriedade nova e `setPrototypeOf` falham; ataque antes e depois de construir o gateway não altera a resposta |
| T21d | Política de egresso substituída pelo consumidor | O gateway recebe **configuração**, não instância de `Allowlist`, e constrói a implementação concreta | **T** — não há `projectPayload` para sobrescrever na fronteira |
| T22 | Incoerência entre campos passa pelo contrato | `semantic.ts`: período, ordem de leitura, cobertura, futuro | **T** |
| T23 | Referência pendurada com aparência de rastreabilidade | `validateStoreIntegrity` falha fechado na construção | **T** |
| T23b | Referência VÁLIDA mas de outro dono | Snapshot e conflito só citam evidência própria; `locator.dataset_id` tem que bater com o dataset do snapshot dono | **T** |
| T23c | Subclasse envenena a própria validação | A verificação recebe os arrays privados, não o store — não há despacho virtual no caminho | **T** |
| T24 | Superfície interna do gateway enumerável | Internos `#private`; teste compara a lista real de métodos sem pré-filtro | **T** |
| T25 | Store mutado por referência devolvida | Cópia profunda + congelamento profundo dos dados, **e da própria instância** | **T** — testado em payload, histograma, conflicts, versions e contributing_cases aninhados; a garantia vale para todo store que o gateway aceita, porque só o caminho validado passa (T21b/T21c) |
| T27 | `unit_breakdown` chega ao modelo | Denylist de egresso **não configurável** (`MODEL_EGRESS_DENYLIST`) + projeção fechada campo a campo | **T** — configuração que tenta habilitá-lo é **recusada** (`NOT_ALLOWED`), não ignorada; e o campo não existe na projeção, então nem a configuração padrão o alcança. Vale **independentemente da configuração do gateway** enquanto D13 estiver pendente |
| T28 | Nome de redação sobrescreve entrada de log | Alocador de chaves à prova de colisão, semeado com todas as chaves originais | **T** — `cpf`+`cpf_redacted` nas duas ordens, `[REDIGIDO-chave]` preexistente, múltiplas chaves dinâmicas |
| T29 | `__proto__` em chave não confiável polui protótipo | Objeto intermediário com protótipo nulo na redação | **T** |
| T26 | Briefing sai para o Aros com sanitização parcial | Os cinco checks obrigatórios, sem repetição | **T** |
| T12 | Restrição de ferramenta ignorada pelo runtime | ACP proibido; MCP-only; contêiner como fronteira real | **L1/L2** — mitigado por proibição, **não testado** |
| T13 | Troca silenciosa de modelo | `provenance` obrigatória | **D/C** — não exercitado |
| T14 | Estouro de custo | Medidor externo | ⬜ não implementado |
| T15 | Reinício/backup corrompe ledger | Ledger fora do agente | ⬜ não implementado |
| T16 | Credencial do portal alcançável pela POC | `.env` separado | ⬜ P0, Fase 3 |

### 4.1 T3 dividida — o que exatamente está provado

A revisão adversarial apontou que "PII vaza para provedor externo" era uma claim
larga demais para um único **T**. Ela vale três coisas diferentes, e só uma delas
é uma propriedade ponta a ponta:

| | Estado |
|---|---|
| **Propriedade testada ponta a ponta** | Nada sai de `ReadOnlyGateway` sem passar por `guardEgress(to_model)`. Testado com PII em valor, em campo que atravessa (`missing_fields`) e em chave dinâmica de mapa. |
| **Função testada, fiação ainda não** | `guardEgress(from_model)`, `guardEgress(memory)` e `redactForLog` têm teste unitário completo, mas **não há runtime para ligá-los**. Continuam ⬜ até a Fase 3. |
| **Não coberto, e declarado** | Nome de pessoa em valor ou chave livre. Não há detecção determinística, e heurística de nome está fora de escopo. É o resíduo R1. |

Só a primeira linha justifica **T**. As outras duas aparecem aqui para não serem
lidas como cobertas.

---

## 5. Achados abertos

### P0 — `.env.example` do portal concentra credenciais de alto privilégio

`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ARGUS_TOKEN` e
`BITRIX24_WEBHOOK_URL` no mesmo arquivo. O `service_role` ignora RLS e abre o
banco inteiro. A POC **não pode** compartilhar essa superfície.
*Ação:* `intelligence/.env.example` próprio, contêiner recebendo só a credencial
do provedor de modelo. Fase 3.

### P1 — herdado: identidade de ingestão ainda usa `service_role`

Registrado em `docs/BRIEFING.md` §11. Mitigação ativa: trigger append-only em
`ceo.source_records`, que vale inclusive contra `service_role`.

### P2 — Docker não instalado nesta máquina

Bloqueia Fases 3 e 5. **Não bloqueia a Fase 2** — decisão do CEO.

### P3 — lint do portal com 16 erros pré-existentes

`npm run verify` do portal falha no lint (16 erros, 6 warnings em
`src/hooks/useDashboard.ts` e `src/lib/argus-adapter.ts`). Verificado contra o
estado sem as mudanças desta entrega: **idêntico**. Fora do escopo da POC, mas
contradiz o "lint limpo" do `BRIEFING.md` de 2026-08-13.

### R1 — nomes livres de unidade (estado após a revisão adversarial)

**O que foi fechado.** `unit_breakdown` saiu da allowlist e **não atravessa mais
para o modelo**. O mapa continua no store, íntegro, para auditoria e para a
Fase 2. O scanner de PII passou a ler **chaves**, então CPF, telefone e e-mail
numa chave de mapa são detectados e bloqueiam a resposta.

**O que permanece aberto.** Nome de pessoa em texto livre não é detectável sem
heurística, e heurística de nome está fora de escopo. Isso deixa duas superfícies
ainda expostas ao modelo, ambas com nomes de unidade como **valores**:

- `coverage.missing_units[]`
- `contributing_cases[].unit`

As duas são varridas por PII determinística (CPF, telefone, e-mail). O que não é
detectável ali é nome de pessoa gravado como se fosse nome de unidade.

**Como fecha.** A Fase 2 canonicaliza unidades conforme D13. Com vocabulário
fechado, `unit_breakdown` volta ao `to_model` com chave de identificador, e
`missing_units`/`unit` passam a ser identificadores em vez de texto livre. **Até
lá, R1 permanece aberto e nenhuma dessas três superfícies deve ser tratada como
fechada.**

### GATE D13 — requisito bloqueante

> **A canonicalização D13 da Fase 2 é REQUISITO BLOQUEANTE. Enquanto ela não
> estiver implementada e verificada, é proibido:**
>
> 1. **instalar ou habilitar o Hermes**, em qualquer ambiente, inclusive VM
>    descartável para security spike;
> 2. **iniciar o runtime da Fase 3**, incluindo perfil `creditum-observer`,
>    servidor MCP, adapter de modelo ou job agendado;
> 3. **tratar `coverage.missing_units[]` ou `contributing_cases[].unit` como
>    identificadores confiáveis para o modelo** — hoje são texto livre, e nome de
>    pessoa gravado como unidade não é distinguível ali sem heurística;
> 4. **reabilitar `unit_breakdown` no caminho `to_model`** — a denylist
>    `MODEL_EGRESS_DENYLIST` é não configurável justamente para que a reabilitação
>    não possa acontecer por configuração.
>
> D13 não é recomendação nem melhoria futura: é pré-condição de liberação. Quem
> autorizar a Fase 3 sem ela está aceitando, explicitamente, que nome de pessoa
> pode atravessar para um provedor externo por essas três superfícies.
>
> O fechamento **não** se dá por regex, NER ou qualquer heurística de nome de
> pessoa — isso foi recusado e continua recusado. Fecha por vocabulário canônico
> fechado, aprovado pelo CEO, substituindo texto livre por identificador.

Não foi fechado com regex de "detector de prompt injection" de propósito: um
detector desses cria a impressão de proteção sem ter cobertura definível, e é
justamente o tipo de controle que o §21 manda não declarar.

### P4 — `security.allow_private_urls` é uma armadilha futura

Padrão `false`, o que é correto. Mas se o gateway for exposto por HTTP em rede
privada, alguém vai ser tentado a ligar isso para o Hermes alcançá-lo — e a
documentação chama isso de *"deliberate trust boundary"*. **O gateway deve ser
alcançado por MCP local, não por URL privada**, justamente para essa tentação
nunca aparecer.

---

## 6. Limites conhecidos do scanner de PII

O que ele **não** faz:

- **Não detecta nome de pessoa por valor livre.** Não há heurística confiável
  para separar "João da Silva" de "Grau Santo Amaro". A defesa é estrutural:
  contratos exigem `subject_ref` e fecham `additionalProperties`.
- **A chave `name` é contextual, não liberada.** Aceita apenas em
  `observed_metric`, `reference_metric`, `metric` e `metrics`, e mesmo ali só com
  valor snake_case minúsculo. `{"observed_metric": {"name": "Maria da Silva"}}`
  é **bloqueado** — há teste para exatamente esse caso.
- **Isenta sha256 e `subj_*`.** Um hash de 64 hex pode conter 11 dígitos seguidos
  e viraria "CPF". Há teste de regressão.
- **Não detecta PII codificada** (base64, ofuscada, dividida entre campos).
- **É a última barreira, não a única.** Se ele for a única coisa entre PII e um
  provedor externo, o desenho já está errado.

---

## 7. A verificar antes de qualquer decisão de produção

Nenhum item pode ser marcado resolvido sem evidência executada:

1. Chave exata de `config.yaml` para desabilitação **por ferramenta**, na versão fixada
2. Que só o toolset `mcp-creditum` está ativo, verificado por `hermes tools` e por enumeração em sessão
3. Que ACP está de fato inacessível no empacotamento (L1)
4. Que o contêiner isola de verdade — já que ele é a **única** fronteira ali (L2)
5. Que `terminal` está ausente, não apenas restrito (L3)
6. Custo real por execução, medido
7. Kill switch acionado e comprovado
8. Backup e restauração com estado consistente
9. Que a memória do agente não retém PII entre sessões
