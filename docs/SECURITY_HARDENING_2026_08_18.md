# Endurecimento de segurança — 18/08/2026

Auditoria disparada por dois achados da discovery da Fase 2.9. Nenhum segredo
aparece neste documento. Toda a inspeção de banco foi **somente leitura**.

> ## ⚠ O achado que precisa de decisão hoje
>
> A auditoria encontrou algo mais grave do que os dois itens do briefing:
> **`anon` tem leitura e escrita ativas sobre as tabelas de PII de aluno** no
> projeto do portal. Não é armadilha armada — é acesso efetivo, hoje.
>
> `anon` tem `USAGE` em `public`, tem `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` em
> todas as tabelas, e cinco delas têm policy `FOR ALL TO public USING (true)`.
> `public` em Postgres é **todo role**, `anon` incluído — então a policy chamada
> "service role full access" concede acesso total a qualquer portador da chave
> anônima.
>
> A chave `anon` é pública por construção (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, vai no
> bundle do browser), o deploy da Vercel é público, e não existe `middleware.ts`
> de autenticação.
>
> Alcance verificado: `leads` 18.400 linhas com nome e telefone;
> `resultados_discador` 158.241 linhas com `nome_cliente` e `telefone_discado`.
> Confirmado por `has_table_privilege('anon','public.leads','DELETE') = true`.
>
> **Não corrigi.** Revogar `anon` derruba o portal inteiro — §B explica por quê, e
> a sequência segura está em §B.6.
>
> **Atualização da Fase 2 (18/08, mais tarde):** exposição agora MEDIDA
> empiricamente com a role `anon`, não inferida de grants. Ver §E.

---

## A. GitHub

### A.1 Remote

| | |
| --- | --- |
| antes | `https://***REDACTED***@github.com/Stefanoleta/creditum-portal.git` |
| depois | `https://github.com/Stefanoleta/creditum-portal.git` |

Credencial removida da URL. `credential.helper=osxkeychain` configurado — nenhum
PAT novo foi criado.

### A.2 Autenticação

`git ls-remote origin` → **OK**. Mas o motivo importa: o repositório é
**público** (`visibility: public`, confirmado por requisição anônima à API do
GitHub), então leitura anônima funciona. Existe também entrada `github.com` no
keychain.

Consequência: `ls-remote` passar **não prova** que push está autenticado. Quando
você precisar de push, se falhar, o git pedirá credencial e o keychain a guardará.
Não recoloquei token na URL para fazer teste passar.

`GITHUB_AUTH_STATUS = READ_OK / PUSH_UNVERIFIED`

> O repositório ser público é uma decisão de negócio, não um defeito — mas vale
> saber que o código do portal, o artefato de política governada e o catálogo com
> as 49 unidades estão publicamente legíveis.

### A.3 Auditoria de vazamento — e uma correção ao que eu disse antes

**Retificação.** No relatório da Fase 2.9 eu afirmei que o commit `1228788`
introduziu um PAT no histórico público e classifiquei como crítico. **Estava
errado.** Varri os **561 blobs** do histórico com padrão estrito (prefixo + 20 ou
mais caracteres) e o resultado é **zero**. As ocorrências de `ghp_` são
placeholders de documentação (`ghp_xxx`, `ghp_XXXXX`), com sufixos de 5 e 8
caracteres — um PAT real tem 36.

| local | tipo | tracked? | histórico? | ação |
| --- | --- | --- | --- | --- |
| `.git/config` (URL do remote) | PAT do GitHub | **não** | **não** | **removido** |
| `skills/**` (4 arquivos, docs) | placeholder `ghp_xxx` | sim | sim | nenhuma — não é segredo |
| `~/.zsh_history`, `~/.bash_history` | — | — | — | zero ocorrências |
| patches e docs da fase | — | — | — | zero ocorrências |
| scratchpad da sessão | — | — | — | zero ocorrências |
| `~/.git-credentials` | — | — | — | arquivo não existe |

**Conclusão: a exposição do PAT era LOCAL apenas.** Nunca foi versionada, nunca
entrou no histórico, nunca saiu desta máquina por via do repositório. Revogar
continua sendo a decisão certa, e o histórico não precisa ser reescrito.

### A.4 Prevenção

`src/lib/__tests__/no-secrets.test.ts`, dentro do `npm run verify` existente.

Varre arquivos **versionados** (`git ls-files`), não o filesystem — `node_modules`
tem milhares de fixtures que casam com qualquer heurística, e um guard que grita
sem motivo é desligado na primeira semana.

Detecta PAT clássico e fine-grained do GitHub, chaves OpenAI e Anthropic, chave
AWS, JWT de service_role e credencial embutida em URL. Exige **20+ caracteres**
após o prefixo: é o que separa `ghp_xxx` da documentação de um token real de 36.

Reporta arquivo, linha e tipo. **Nunca o valor** — um teste que vaza o segredo no
output do CI troca um vazamento por outro.

Quatro testes, e dois deles existem para o guard não passar por vacuidade: um
afirma que a varredura viu mais de 50 arquivos, outro que credenciais sintéticas
**são** detectadas.

---

## B. Supabase

### B.1 A descoberta que muda a correção

`src/lib/supabase-server.ts` — apesar do nome — usa
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Todo o backend do portal opera como `anon`**,
nas 16 rotas de API que o importam.

`SUPABASE_SERVICE_ROLE_KEY` existe no ambiente e é referenciado em **um** lugar:
`src/app/api/health/route.ts:33`, apenas para checar presença. Nenhum cliente é
criado com ela.

É por isso que as policies `USING (true)` existem: sem elas o portal não
funciona. Elas são load-bearing enquanto o backend usar a chave anônima.

### B.2 Matriz de acesso — `catalogo_dados`

| CONSUMER | ROLE | SELECT | INSERT | UPDATE | DELETE | SERVER/BROWSER | EVIDENCE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nenhum em código | — | — | — | — | — | — | `grep -rn catalogo_dados src intelligence` → **0 resultados** |
| `docs/BRIEFING.md:156` | — | — | — | — | — | — | menção documental |
| mantido à mão | humano | sim | sim | sim | — | Dashboard | comentário da própria tabela |

`ANON SELECT: not_required` · `ANON INSERT: not_required` ·
`ANON UPDATE: not_required` · `ANON DELETE: not_required`
`AUTHENTICATED`: idêntico — `not_required` nos quatro.

Nenhum `unknown`. É o único objeto em que least privilege não custa
disponibilidade.

### B.3 Estado atual — projeto do portal

| objeto | linhas | RLS | policies | anon | risco |
| --- | --- | --- | --- | --- | --- |
| `leads` | 18.400 | on | 1 × `ALL/public/true` | CRUD+TRUNCATE | **CRÍTICO** — PII |
| `resultados_discador` | 158.241 | on | 1 × `ALL/public/true` | CRUD+TRUNCATE | **CRÍTICO** — PII |
| `vw_discador_unificado` | 158.241 | n/a | — | SELECT | **CRÍTICO** — `security_invoker=false`, roda como `postgres` e ignora RLS das bases |
| `listas` | 77 | on | 1 × `ALL/public/true` | CRUD+TRUNCATE | ALTO |
| `unidades` | 27 | on | 1 × `ALL/public/true` | CRUD+TRUNCATE | ALTO |
| `qualificacoes` | 0 | on | 1 × `ALL/public/true` | CRUD+TRUNCATE | MÉDIO |
| `catalogo_dados` | 32 | **off** | 0 | CRUD+TRUNCATE | **ALTO** — sem PII, mas totalmente aberta |
| `qick_notificados` | 890 | on | `anon_select` + `anon_insert` | CRUD+TRUNCATE | MÉDIO — anônimo deliberado, confirmar intenção |
| `call_analyses` | 691 | on | **0** | CRUD | BAIXO — RLS sem policy nega por padrão |
| `quick_calls` | 0 | on | **0** | CRUD | BAIXO — idem |
| schema `ceo` (19 objetos) | ~0 | on | por identidade | **sem USAGE** | OK — hardening da Fase 1 |

`anon_usage(public) = true`, `anon_usage(ceo) = false`. É exatamente a distinção
que a migration `20260813b_ceo_hardening` fez: em `ceo` as policies permissivas
eram armadilha armada porque faltava `USAGE`. Em `public` o `USAGE` existe.

### B.4 Estado atual — projeto `Creditum n8n CFO`

Situação **melhor**. RLS habilitado em todas as 24 tabelas, e a maioria com
**zero policies** → nega por padrão para `anon`, mesmo com grants amplos.

Duas exceções com `ALL/public/true`:

| objeto | linhas | risco |
| --- | --- | --- |
| `cfo_aprendizado` | 8 | MÉDIO |
| `repasses_semana` | 4 | MÉDIO — repasses a escolas parceiras |

### B.5 Correção aplicável agora

`supabase/migrations/20260818_public_hardening_catalogo.sql` — **NÃO APLICADA**.

```sql
revoke all on table public.catalogo_dados from anon;
revoke all on table public.catalogo_dados from authenticated;
alter table public.catalogo_dados enable row level security;
-- nenhuma policy: RLS ligado sem policy = negar por padrão
```

Grants e RLS coerentes: o grant define o que o role pode tentar, o RLS define
quais linhas a tentativa alcança. `service_role` ignora RLS por construção e
segue com acesso — e continua sendo credencial de servidor.

~~`SECURITY_FIX_READY_FOR_APPLY`~~ → **APLICADA em 18/08/2026** sob autorização
explícita. Verificação pós-aplicação em §E.

### B.6 A correção que NÃO pode ser aplicada ainda

`SECURITY_FIX_BLOCKED_BY_ACCESS_CONTRACT` para `leads`, `resultados_discador`,
`listas`, `unidades`, `qualificacoes` e a view.

Revogar `anon` hoje derruba as 16 rotas de API. A sequência segura, na ordem:

1. **Criar cliente server-side com `service_role`** — `supabase-server.ts` passa a
   usar `SUPABASE_SERVICE_ROLE_KEY`, que já está no ambiente e hoje é só checada.
   Nada muda para o browser porque nada no browser usa esse módulo (verificado:
   os 16 importadores são rotas de API, nenhum com `"use client"`).
2. **Adicionar autenticação** — não existe `middleware.ts`. Enquanto não existir,
   `/api/*` responde a qualquer um, e a chave nem é necessária para chegar aos
   dados.
3. **Trocar as policies** `ALL/public/true` por autorização real. O precedente
   está no próprio repositório: `ceo.app_users` + `ceo.is_member()` da
   `20260813b_ceo_hardening`.
4. **`security_invoker=true`** em `vw_discador_unificado`, para a view respeitar o
   RLS das tabelas base em vez de rodar como `postgres`.
5. **Revogar** os grants de `anon`/`authenticated`.

Não escrevi essa migration. Um arquivo que derruba produção se aplicado fora de
ordem é pior que nenhum arquivo — a sequência acima é a entrega.

### B.7 Testes de RLS

Não criei testes de RLS nesta fase, e a razão é a que o §16 pediria para eu
verificar: **não há como testar o estado desejado sem primeiro aplicá-lo**, e o
estado atual só produziria testes que afirmam a vulnerabilidade.

O que o `verify` cobre hoje: o guard de segredos (4 testes) e a suíte existente.

Quando `catalogo_dados` for aplicada, o teste correto é uma consulta com a chave
`anon` esperando recusa — e ele precisa de uma chave `anon` em ambiente de teste,
que hoje não existe separada da de produção.

### B.8 `service_role` — sem exposição encontrada

| verificação | resultado |
| --- | --- |
| variável com prefixo `NEXT_PUBLIC_*SERVICE*` ou `*ROLE*` | **nenhuma** |
| `supabase-server.ts` importado em componente `"use client"` | **nenhum** — 16 importadores, todos rotas de API |
| `service_role` referenciado no bundle | não — só checagem de presença em `health` |

`service_role` **não** está exposto ao browser. A ironia é que ele também não
está sendo usado: o backend usa a chave anônima.

---

## C. Lista priorizada

| # | severidade | objeto | achado |
| --- | --- | --- | --- |
| 1 | **CRÍTICO** | `leads`, `resultados_discador` | `anon` lê e apaga PII de aluno; exposição ativa |
| 2 | **CRÍTICO** | portal na Vercel | sem `middleware.ts`; `/api/*` aberto |
| 3 | **CRÍTICO** | `vw_discador_unificado` | `security_invoker=false` ignora RLS das bases |
| 4 | **ALTO** | `catalogo_dados` | RLS off + grants totais — **corrigível agora** |
| 5 | **ALTO** | `listas`, `unidades` | `ALL/public/true` |
| 6 | **MÉDIO** | `qick_notificados` | anônimo deliberado — confirmar intenção de negócio |
| 7 | **MÉDIO** | `cfo_aprendizado`, `repasses_semana` (CFO) | `ALL/public/true` |
| 8 | **MÉDIO** | `qualificacoes` | `ALL/public/true`, hoje vazia |
| 9 | **BAIXO** | todas as tabelas dos dois projetos | grants amplos a `anon`; neutralizados por RLS sem policy onde aplicável — revogar como defesa em profundidade |

---

## D. Arquivos modificados

| arquivo | mudança |
| --- | --- |
| `.git/config` | credencial removida do remote (local, não versionado) |
| `~/.gitconfig` | `credential.helper=osxkeychain` (local, não versionado) |
| `src/lib/__tests__/no-secrets.test.ts` | **novo** — guard de segredos |
| `supabase/migrations/20260818_public_hardening_catalogo.sql` | **novo** — não aplicada |
| `docs/SECURITY_HARDENING_2026_08_18.md` | **novo** — este documento |

Nenhuma mudança em detectores, política, D13, ou no banco.

---

# E. Fase 2 — contenção (18/08/2026, mais tarde)

## E.1 `catalogo_dados` — APLICADA

Precondições revalidadas imediatamente antes: zero consumidores em runtime,
4 statements DDL, uma única tabela, nenhum statement destrutivo.

Aplicada como migration `public_hardening_catalogo`. Verificação pós-aplicação:

| verificação | resultado |
| --- | --- |
| RLS habilitado | **true** |
| policies | **0** — negar por padrão |
| `anon` SELECT/INSERT/UPDATE/DELETE | **false** nos quatro |
| `authenticated` SELECT/DELETE | **false** |
| `service_role` SELECT | **true** |
| `postgres` SELECT | true |
| linhas preservadas | **32** |

Teste empírico com a role `anon`: `NEGADO no grant`.

## E.2 Exposição MEDIDA, não inferida

Executando `count(*)` sob `set role anon` — o que a chave anônima realmente
alcança hoje:

| objeto | como `anon` | policies |
| --- | --- | --- |
| `catalogo_dados` | **NEGADO no grant** ✓ corrigido | 0 |
| `leads` | **LÊ 18.400 LINHAS** | 1 |
| `resultados_discador` | **LÊ 158.241 LINHAS** | 1 |
| `vw_discador_unificado` | **LÊ 158.241 LINHAS** | 0 (view) |
| `qick_notificados` | LÊ 890 linhas | 2 (anônimo deliberado) |
| `listas` | LÊ 77 linhas | 1 |
| `unidades` | LÊ 27 linhas | 1 |
| `call_analyses` | **0 linhas (RLS filtrou)** | 0 |
| `quick_calls` | **0 linhas (RLS filtrou)** | 0 |

Uma correção de método: meu primeiro teste usava `select 1 ... limit 1` e
concluiu "PERMITIDO" para `call_analyses`. Estava medindo a coisa errada — RLS
não levanta erro, **filtra linhas**. Com `count(*)` a distinção aparece:
negação de grant dá erro, RLS sem policy dá zero linhas. As duas protegem; só a
segunda passa pelo `select`.

Isso confirma o que a Fase 1 concluiu: `call_analyses` e `quick_calls` estão
seguras, e as cinco tabelas com `USING (true)` estão ativamente expostas.

## E.3 A RAIZ do problema — default privileges

`pg_default_acl` no schema `public`, tipo `r` (tabela):

```
anon=arwdDxtm/postgres   authenticated=arwdDxtm/postgres
```

`arwdDxtm` = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
MAINTAIN. Dois concedentes: `postgres` e `supabase_admin`.

**Toda tabela nova em `public` nasce com CRUD completo para `anon`.** Os grants
amplos não foram concedidos um a um — são o default. Corrigir tabela por tabela
é enxugar gelo: a próxima nasce aberta.

Isto é o item que impede reincidência, e está no SQL candidato.

## E.4 Autenticação — `AUTH_FOUNDATION_MISSING`

| dimensão | estado |
| --- | --- |
| USER LOGIN | **não existe** |
| SESSION | **não existe** — `auth.sessions` = 0 |
| AUTHENTICATION | **não existe** — `auth.users` = 0, `auth.identities` = 0, zero providers |
| AUTHORIZATION | **não existe** — sem roles, sem `ceo.app_users` (0 linhas) |
| ROLES | só as do Postgres/Supabase |
| `@supabase/ssr` | instalado (`^0.12.0`), **nunca importado** |
| `middleware.ts` | **não existe** |
| `signIn`/`getUser`/`getSession` | **zero ocorrências** no código |

**Não implementei.** §F proíbe middleware cego, senha compartilhada e token
improvisado — e o que falta aqui não é código, é decisão: qual provider, quem
tem conta, quem aprova conta. Um `middleware.ts` hoje, com `auth.users = 0`,
bloquearia 100% do acesso, inclusive o seu.

## E.5 Matriz das rotas — 18, não 16

O número 16 da Fase 1 era de *importadores* de `supabase-server`. Rotas de API
são **18**, e 14 tocam PII.

| rota | métodos | dados | PII | muta | classificação | proteção atual |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/leads/higienizacao` | GET, PATCH | `leads` | **sim** | update | `AUTHENTICATED_WRITE` | **nenhuma** |
| `/api/listas/[id]/leads` | GET, PATCH | `leads` | **sim** | update | `AUTHENTICATED_WRITE` | **nenhuma** |
| `/api/listas/upload` | POST | `leads`, `listas` | **sim** | insert, update | `AUTHENTICATED_WRITE` | **nenhuma** |
| `/api/listas/backfill` | POST | `leads`, `resultados_discador` | **sim** | insert, update | `ADMIN_ONLY` | **nenhuma** |
| `/api/dashboard/metrics` | GET | `call_analyses`, `leads`, `resultados_discador` | **sim** | update, upsert | `AUTHENTICATED_READ` + escrita lateral | **nenhuma** |
| `/api/leads/recontatos` | GET | `leads` | **sim** | — | `AUTHENTICATED_READ` | **nenhuma** |
| `/api/reports/daily` | GET | `call_analyses` + Argus | **sim** | — | `AUTHENTICATED_READ` | **nenhuma** |
| `/api/analyses/poll` | GET, POST | `call_analyses` | **sim** | via helper | `INTERNAL_ONLY` | **nenhuma** |
| `/api/analyses/retry` | GET, POST | `call_analyses` | **sim** | via helper | `ADMIN_ONLY` | **nenhuma** |
| `/api/analyses/recent` | GET | `call_analyses` (helper) | **sim** | — | `AUTHENTICATED_READ` | **nenhuma** |
| `/api/calls/analyze` | POST | `call_analyses` (helper) | **sim** | insert, update | `INTERNAL_ONLY` | **nenhuma** |
| `/api/cron/analyze` | GET | `call_analyses` | **sim** | — | `INTERNAL_ONLY` | **nenhuma** — deveria exigir segredo de cron |
| `/api/webhooks/argus` | GET, POST | `call_analyses` (helper) | **sim** | insert | `PUBLIC_INTENTIONAL` | **nenhuma** — deveria validar assinatura |
| `/api/health` | GET | `call_analyses` | **sim** | — | `AUTHENTICATED_READ` | **nenhuma** — vaza estado de config |
| `/api/listas` | GET | `listas` | não | — | `AUTHENTICATED_READ` | **nenhuma** |
| `/api/listas/unidades` | GET | `listas` | não | — | `AUTHENTICATED_READ` | **nenhuma** |
| `/api/calls/list` | GET | Argus + mock | não | — | `AUTHENTICATED_READ` | **nenhuma** |
| `/api/debug/sdr-quality` | GET | Argus | não | — | `ADMIN_ONLY` | **nenhuma** — rota de debug pública |

Nenhuma `UNKNOWN`: todas classificadas. Duas merecem destaque além do PII —
`/api/cron/analyze` aceita GET de qualquer origem, e `/api/webhooks/argus` aceita
POST sem validar assinatura, o que permite injetar análise de ligação falsa.

## E.6 Proposta exata de proteção de `/api/*`

Defesa em profundidade, na ordem:

1. **Fundação** — habilitar Supabase Auth com **um** provider (e-mail+senha ou
   Google Workspace da Creditum), criar as contas do time. Sem isso nada abaixo
   funciona. `@supabase/ssr` já está instalado.
2. **Barreira global** — `src/middleware.ts` cobrindo `/api/:path*` exceto
   `/api/webhooks/argus` (que precisa de validação de assinatura, não de sessão)
   e `/api/cron/*` (que precisa de `CRON_SECRET`, não de sessão).
3. **DAL compartilhada** — `requireSession()` chamada no topo de cada Route
   Handler. Middleware não substitui verificação no handler: um `matcher`
   escrito errado deixa a rota nua, e o handler é a última linha.
4. **Autorização por papel** — `ADMIN_ONLY` (`backfill`, `retry`,
   `debug/sdr-quality`) exige papel, não só sessão.
5. **Segredo de cron** — comparação em tempo constante do header contra
   `CRON_SECRET`.
6. **Assinatura de webhook** — HMAC do corpo, se o Argus suportar; se não,
   allowlist de IP e um segredo em path.

## E.7 Quais rotas realmente precisam de `service_role`

§H: nem toda rota server-side precisa. Depois da barreira:

| rota | precisa `service_role`? | por quê |
| --- | --- | --- |
| `listas/backfill` | **sim** | lote administrativo, escreve `leads` e `resultados_discador` em massa |
| `cron/analyze` | **sim** | roda sem usuário; não há sessão para escopar |
| `webhooks/argus` | **sim** | idem — chamada de máquina |
| `calls/analyze`, `analyses/poll`, `analyses/retry` | **sim** | pipeline interno de análise |
| `dashboard/metrics` | **parcial** | leitura pode ser `authenticated` + RLS; a escrita lateral em `resultados_discador` precisa de privilégio — e essa escrita provavelmente deveria sair da rota de leitura |
| `leads/higienizacao`, `listas/[id]/leads`, `listas/upload`, `leads/recontatos` | **não** | são user-scoped: sessão `authenticated` + RLS é o modelo correto |
| `listas`, `listas/unidades`, `calls/list`, `reports/daily`, `health`, `debug/sdr-quality` | **não** | leitura; sessão basta |

Sete de dezoito. `service_role` para as outras onze seria conveniência, não
necessidade — e cada uma delas atrás de rota pública multiplicaria o blast radius.

## E.8 Migrations candidatas — NÃO aplicadas

`docs/security/CANDIDATE_pii_lockdown.sql`.

**Deliberadamente fora de `supabase/migrations/`**: lá seria aplicada por
qualquer `supabase db push` ou passo de CI, e aplicá-la hoje derruba as 18 rotas.

Conteúdo: `drop` das 5 policies enganosas · `revoke` de `anon`/`authenticated`
nas 5 tabelas e na view · RLS mantido sem policy · `security_invoker=true` na
view · `revoke` dos default privileges. Rollback completo documentado no rodapé,
restaurando exatamente o estado medido.

Estado §M:

| condição | status |
| --- | --- |
| rotas consumidoras identificadas | **SIM** — §E.5 |
| auth guard ativo | **NÃO** ← bloqueia |
| cliente server correto funcionando | **NÃO** ← bloqueia |
| rollback documentado | **SIM** |
| testes pré e pós mudança | **parcial** — DB medido; HTTP impossível sem auth |

`SECURITY_FIX_BLOCKED_BY_ACCESS_CONTRACT`.

## E.9 Plano da view

`vw_discador_unificado`: sem `reloptions` → `security_invoker=false` → roda como
`postgres` → ignora o RLS de `leads`, `listas`, `unidades`. Medido: 158.241
linhas legíveis por `anon`.

Correção: `alter view ... set (security_invoker = true)`. Não muda a definição —
só de quem ela herda privilégio. Efeito colateral a testar antes: consultas que
hoje funcionam por herdar `postgres` passarão a depender do RLS das bases, então
a view precisa ser exercitada com a role real de cada consumidor. Hoje ela não
tem consumidor em código (`grep` = 0), o que torna a mudança de baixo risco.

## E.10 Testes

Adicionados a `src/lib/__tests__/no-secrets.test.ts` (8 testes, dentro do
`verify`):

- guard de segredos: 4, incluindo dois contra vacuidade;
- inventário de rotas: 4 — trava o número em 18, exige que toda rota de PII
  exista, falha se rota nova aparecer sem classificação, e falha no dia em que
  `middleware.ts` for criado, obrigando a revisitar o inventário.

Testes de HTTP não autenticado (§L) **não são escrevíveis hoje**: sem
autenticação, `401/403` não existe como resposta possível, e um teste que afirma
`200` estaria codificando a vulnerabilidade como contrato.

O teste de DB foi feito e está registrado em §E.2 — medição direta com `set role
anon`, não inferência de grants.

## E.11 O que pode ser aplicado com segurança AGORA

| item | estado |
| --- | --- |
| `catalogo_dados` hardening | **APLICADO** |
| guard de segredos + inventário de rotas | **aplicado** (código) |
| remote git sem credencial | **aplicado** |
| lockdown de PII, view, default privileges | **bloqueado** por autenticação |
| troca para `service_role` | **bloqueado** — e por decisão sua, correta: privilégio atrás de rota pública é pior |

## E.12 O que ainda precisa de gate

1. **Autenticação** — decisão de provider e de quem tem conta. É o gargalo de
   tudo.
2. Aplicar `CANDIDATE_pii_lockdown.sql` — só depois de 1, com as rotas
   exercitadas sob sessão real.
3. Cliente server-side com `service_role` para as sete rotas de §E.7.
4. `CRON_SECRET` e validação de assinatura do webhook.
5. Default privileges — verificar se algum workflow n8n depende de tabela nova
   nascer legível para `anon` antes de revogar.
