# Fase 2.9 — Dashboard do Leonardo: descoberta da fonte oficial

> **SUPERSEDIDO EM PARTE PELA §18 (Fase 2.9b, 18/08 21:00 UTC).** As conclusões
> de contrato abaixo continuam válidas; o que a 2.9b acrescenta é a verificação
> pós-deploy, o mapeamento completo dos indicadores e a lacuna de 8 colunas entre
> o que o dashboard lê e o que o espelho tem. Ler a §18 primeiro.

**Discovery. Nenhum adapter implementado, nenhuma migration, nenhuma escrita em
banco.** `REAL_SUPABASE_INTROSPECTION = AVAILABLE` — somente leitura.

## Resultado direto

```
DASHBOARD URL        https://creditum-financas.vercel.app/  → "Creditum · Cockpit Financeiro"
DASHBOARD CODE       NÃO ENCONTRADO neste workspace
VERCEL PROJECT       NÃO está nesta conta Vercel
SUPABASE PROJECT     a versão publicada NÃO usa Supabase.
                     O espelho equivalente vive em `Creditum n8n CFO` (ftumfypxpzimhqhmlcun)
OFFICIAL SOURCE      publicado: Omie ERP via proxy `/api/omie`
                     candidata da nova versão: `public.espelho_titulos_creditum`
GRANULARITY          uma linha por TÍTULO/PARCELA do Omie
BUSINESS PERIOD      `data_vencimento` (emissão: `data_emissao`)
AS_OF/FRESHNESS      `ultima_alteracao` (origem) + `sync_em` (coleta) — sync 21 dias parado
FULL/INCREMENTAL     espelho 1:1 por `codigo_lancamento_omie`
UNIT IDENTITY        AUSENTE — nenhuma coluna de escola/unidade
FRONTEND TRANSFORMS  SUBSTANCIAIS — a definição de inadimplência mora no frontend
DATASET_ID           PENDING
SOURCEADAPTER        requires change
DEPLOY STATUS        pending
IMPLEMENTATION READINESS  BLOCKED
```

---

## 1. Onde está o código

Não está aqui. O workspace tem só `creditum-portal` e `smart-connections-mcp`.

A conta Vercel autenticada nesta sessão (`stefanoleta-2733's projects`,
`team_AneIUMOZA2Atv4dy6t3gnYEZ`) tem **um único projeto**: `creditum-portal`
(`prj_yP3Io6…`). `creditum-financas` **não está nela** — foi publicado de outra
conta, provavelmente a do próprio Leonardo.

Consequência prática: **não consigo ler o código da nova versão.** Tudo abaixo
sobre a versão publicada vem de inspeção do artefato servido; tudo sobre a nova
vem de inferência declarada como tal.

## 2. O que está publicado hoje

`HTTP 200`, `x-vercel-cache: HIT`, `age: 621267 s` ≈ **7,2 dias** de cache.

Uma página HTML única de 91 KB:

| peça | o que é |
| --- | --- |
| Chart.js 4.4.1 + plugin datalabels | CDN cloudflare |
| um `<script>` inline de **57,8 KB** | toda a lógica |
| `fetch("/api/omie?" + qs)` | proxy para o **Omie ERP**, paginado 100/página, 1200 ms entre páginas |

Recursos Omie consumidos: `projetos`, `clientes`, `contacorrente`, e o contas a
receber.

**Zero referências a Supabase.** Sem `createClient`, sem `*.supabase.co`, sem
bundle `/_next/static/`.

## 3. Deploy status

```
PUBLIC_URL                https://creditum-financas.vercel.app/   responde 200
NEW_VERSION_DEPLOY_STATUS pending
```

A afirmação do Leonardo — "a nova versão já está conectada ao Supabase" — é
**consistente com o que vejo**, e o que vejo é que ela **ainda não está no ar**. O
artefato público lê Omie direto. Não interpretei "URL responde" como "nova versão
em produção", e a divergência é exatamente esta.

## 4. A cadeia real, hoje

```
https://creditum-financas.vercel.app/
  └─ HTML estático + script inline
       └─ GET /api/omie?resource={projetos|clientes|contacorrente|…}&pagina=N
            └─ Omie ERP  (o proxy /api/omie está no código que não tenho)
                 └─ agregação, classificação e formatação: TODAS no frontend
                      └─ cards e tabelas do cockpit
```

| camada | onde mora a lógica |
| --- | --- |
| **A. backend/Supabase** | **nenhuma** na versão publicada |
| **B. frontend** | classificação de inadimplência, buckets de atraso, exclusão de renegociados, mapas de cliente e projeto, formatação |
| **C. visual** | Chart.js, cores, `fmtMoneyK` |

## 5. As regras validadas estão no FRONTEND — o achado que importa

Extraídas do script servido:

```js
const CORTE_INADIMPLENCIA_DIAS = 21;
const OFFSET_ENTRADA_INADIMPLENCIA_DIAS = 22;

function isAtrasado(row)     { return !isRecebido(row) && diasAtraso(row) > CORTE_INADIMPLENCIA_DIAS; }
function isInadimplente(row) { return isAtrasado(row) && !isReneg(row)
                                      && !clientesRenegSetGlobal.has(row.codigoCliente); }

const BUCKETS = [
  { id: "BKT1", label: "21-30 dias",  min: 21,  max: 30 },
  { id: "BKT2", label: "31-60 dias",  min: 31,  max: 60 },
  { id: "BKT3", label: "61-90 dias",  min: 61,  max: 90 },
  { id: "BKT4", label: "91-120 dias", min: 91,  max: 120 },
  { id: "BKT5", label: ">121 dias",   min: 121, max: Infinity },
];
```

E a regra mais consequente, no comentário do próprio código:

> "Cliente que renegociou (qualquer título RENEG/ACORDO) sai INTEIRO do índice de
> inadimplência — suas pendências passam a ser acompanhadas no painel de
> Renegociações."

Isso é **exclusão em nível de CLIENTE a partir de um fato em nível de TÍTULO**. Não
é filtro de linha: é um `Set` de clientes construído numa passada e aplicado na
outra.

### Paridade por indicador

| indicador | classificação |
| --- | --- |
| valor do título, vencimento, emissão, status | `DIRECT_FROM_SOURCE` |
| nome do cliente, nome do projeto | `FRONTEND_DERIVED` (mapas montados de `clientes` e `projetos`) |
| `diasAtraso` | `FRONTEND_DERIVED` |
| **inadimplente / atrasado / renegociado** | **`FRONTEND_DERIVED`** |
| **bucket de aging** | **`FRONTEND_DERIVED`** |
| exclusão de contas correntes canceladas | `FRONTEND_DERIVED` |
| formatação monetária, gráficos | `VISUAL_ONLY` |
| corte de 21 dias e offset de 22 | `FRONTEND_DERIVED` — **sem lastro governado** |

**Resposta à pergunta do §7:** consumir a mesma tabela **não reproduz** o número
oficial. A definição validada de inadimplência não existe em nenhum objeto de
banco — ela existe em 57 KB de JavaScript servido de um deploy de 7 dias atrás, num
repositório que não tenho.

## 6. A fonte Supabase equivalente

Projeto `Creditum n8n CFO` (`ftumfypxpzimhqhmlcun`, us-west-2, PG 17.6). Sem views;
5 funções (`fn_baixa_mes_vigente`, `fn_conciliacao_shadow`, `fn_repasse_grau_hoje`,
`relatorio_email_diario`, `rls_auto_enable`). **Nenhuma view ou RPC final que um
dashboard consumiria** — mais uma confirmação de que a nova versão ainda não fixou
sua camada de leitura.

Candidata principal: **`public.espelho_titulos_creditum`**, 17.275 linhas.

| coluna | tipo | nulos |
| --- | --- | --- |
| `codigo_lancamento_omie` | `bigint` | **0** — 17.275 distintos, 1:1 |
| `codigo_cliente_fornecedor` | `bigint` | 0 |
| `numero_documento` | `text` | — |
| `numero_parcela` | `text` | **0** |
| `valor_documento` | **`numeric`** | **0** |
| `data_vencimento` | `date` | **0** |
| `data_emissao` | `date` | — |
| `status_titulo` | `text` | 5 valores |
| `ultima_alteracao` | `date` | — |
| `sync_em` | `timestamptz` | — |

Distribuição de `status_titulo`: `A VENCER` 12.280 · `RECEBIDO` 3.403 ·
`ATRASADO` 1.319 · `CANCELADO` 271 · `VENCE HOJE` 2.

Existe `config_status_abertos` (3 linhas) com whitelist de status "aberto",
documentada como fonte única consumida por SQL e por nodes n8n — precedente de
governança que vale reusar em vez de duplicar.

Complementos: `espelho_titulos_criteria` 11.332 (FIDC), `espelho_contas_pagar_creditum`
6.242, `movimentos_creditum` 1.500, `depara_clientes` 628, `baixa_mes_vigente_decisoes`
543, `alertas_baixa_mes_vigente` 503.

## 7. Granularidade

**Uma linha por título do Omie = uma PARCELA.** `numero_documento` +
`numero_parcela`, 0 nulos nos dois, e `codigo_lancamento_omie` 1:1.

Não é contrato, não é venda, não é aluno. Se um indicador do dashboard fala em
"contrato", ele agrega — e a agregação é frontend.

## 8. Período e freshness

| campo | papel | valores |
| --- | --- | --- |
| `data_vencimento` | **período de negócio** | 2024-09-13 → 2031-06-10 |
| `data_emissao` | emissão | 2024-09-12 → 2026-07-24 |
| `ultima_alteracao` | **`source_updated_at` — existe** | máx. 2026-07-24 |
| `sync_em` | coleta | 2026-07-13 → **2026-07-28** |

Diferente do que eu esperava, esta fonte **tem** `as_of` de origem
(`ultima_alteracao`) — o que faltava no dataset do discador.

**Mas `sync_em` parou em 28/07.** Hoje é 18/08: o espelho está **21 dias sem
sincronizar**. Uma leitura de intelligence hoje devolveria julho como se fosse
agosto. Blocker de freshness, não de contrato.

`data_vencimento` chega a 2031: a tabela contém o **futuro contratado**, então
qualquer janela mensal precisa filtrar explicitamente — sem filtro, uma soma pega
sete anos.

## 9. Full vs incremental

Espelho com identidade 1:1 por `codigo_lancamento_omie`. `ultima_alteracao`
permite incremental de verdade — ao contrário do dataset do discador, que só tinha
`created_at`.

Não há histórico de versões da linha: uma alteração no Omie sobrescreve. Se
auditoria exigir "o que a fonte dizia antes", isso não existe aqui.

## 10. Identidade de unidade / D13 — AUSENTE

`espelho_titulos_creditum` **não tem coluna de escola ou unidade**. Nenhuma.

`depara_clientes` (628 linhas) mapeia clientes entre Omie Creditum e Omie Criteria
— é de-para entre instâncias, não cliente→unidade. Os `projetos` do Omie são
carregados pelo dashboard e podem carregar a unidade, mas isso está no Omie, não no
espelho.

Não criei segunda canonicalização. Quando o campo existir, ele vem como nome bruto
e atravessa o D13 canônico.

## 11. PII

| campo | classificação |
| --- | --- |
| `codigo_cliente_fornecedor` | REQUIRED — código, não identifica pessoa por si |
| `numero_documento`, `numero_parcela` | REQUIRED |
| `valor_documento`, datas, `status_titulo` | REQUIRED |
| razão social / nome fantasia (via `clientes` do Omie) | **MUST_NOT_LEAVE_SOURCE_BOUNDARY** |
| CPF | **ausente do espelho** |

O espelho é notavelmente limpo de PII: os nomes entram só quando o dashboard
resolve `clientesMap` contra o Omie. `intelligence` deve usar `subject_ref`
pseudonimizado sobre `codigo_lancamento_omie`.

## 12. Dinheiro

`valor_documento` é **`numeric`**, e o domínio determinístico exige inteiro em
centavos. Conversão exata obrigatória:

```
cents = round(valor_documento * 100)    -- em SQL, sobre numeric, nunca via float
```

Sem `::float` e sem `parseFloat` em nenhum ponto do caminho.

## 13. `SourceAdapter` — requires change

```ts
read(period_start: string, period_end: string): Promise<RawBatch>
```

O comentário da própria porta exige distinguir "origem indisponível", "schema
divergente" e "tabela vazia". **A assinatura não permite**: só devolve `RawBatch`
ou lança. As três colapsam em duas.

É a mesma classe de defeito que o gate da 2.8 encontrou em
`ExpectedUnitsProvider` — lá o sentinela errado, aqui um ramo ausente. A correção
natural é resultado discriminado, como `ExpectedUnitsLookup`.

Contra o que a fonte entrega:

| `RawBatch` exige | espelho entrega? |
| --- | --- |
| `row_key` estável | **sim** — `codigo_lancamento_omie` |
| `observed_at` | **sim** — `ultima_alteracao` |
| `collected_at` | **sim** — `sync_em` |
| `period_start/end` | sim — `data_vencimento` |
| `content_hash` | não existe; calculável na leitura |
| `rows_skipped` | não rastreável |

Melhor situação que o dataset do discador em três das seis linhas. Não implementei
nada.

## 14. `dataset_id`

**`DATASET_ID_PENDING`.**

A granularidade é parcela, mas os indicadores oficiais são de inadimplência em
nível de cliente. Nomear antes de saber qual das duas o intelligence publica seria
o erro que a 2.7c.1 já corrigiu uma vez.

## 15. Blockers

1. **Código da nova versão inacessível** — outra conta Vercel, fora do workspace.
   Sem ele não há como confirmar qual objeto ela lê nem se a lógica migrou.
2. **A lógica validada está no frontend** — corte de 21 dias, offset de 22, buckets
   e exclusão de cliente renegociado. Consumir a tabela não reproduz o número
   oficial.
3. **`sync_em` parado há 21 dias** — o espelho não reflete o presente.
4. **Sem identidade de unidade** — nenhuma coluna de escola.
5. **`valor_documento` é `numeric`** — conversão exata a definir e testar.
6. **`SourceAdapter` perde semântica** — não distingue vazio de indisponível.
7. `expected_units` segue blocker externo (Fase 2.8).

## 16. Recomendação

Não implementar adapter. O que precisa acontecer antes, em ordem:

1. **Obter o repositório da nova versão.** É o item que destrava todos os outros:
   sem ele estou inferindo a fonte oficial a partir de um deploy antigo.
2. **Decidir onde a regra validada vai morar.** Hoje ela é JavaScript de frontend
   sem lastro governado. Para o intelligence consumir "a mesma verdade", ela precisa
   virar objeto de banco (view/função) ou política governada — o precedente
   `config_status_abertos` mostra que o time já sabe fazer isso.
3. **Retomar o sync do espelho.** 21 dias de defasagem invalidam qualquer leitura.
4. **Resolver a unidade**, se algum indicador do intelligence for por escola.
5. Só então `dataset_id`, contrato de adapter e implementação.

## 17. Nota de escopo

Esta fonte é **financeira** (títulos, vencimento, inadimplência), não comercial
(vendas, parcelamento de contrato). Ela não alimenta os detectores A/C/D como eles
estão especificados — `installment_count`, `amount_cents` de venda e
`first_due_date` de contrato são de outro dataset (`ceo.sales`/`ceo.opportunities`,
deployados e **vazios**, alimentados pela planilha do Lucas).

Um Centro de Inteligência sobre inadimplência é um produto legítimo e provavelmente
mais valioso — mas é um conjunto de detectores diferente do que está SHIP hoje.
Registro como decisão sua, não como conclusão minha.

---

# 18. Fase 2.9b — verificação pós-deploy (18/08/2026, 21:00 UTC)

## 18.1 Resultado

```
DASHBOARD                 https://creditum-financas.vercel.app/
SUPABASE_USED             NO  (na versão publicada)
SUPABASE PROJECT          Creditum n8n CFO (ftumfypxpzimhqhmlcun) — alvo pretendido
OFFICIAL SOURCE           Omie ERP via proxy `/api/omie`   ← o que está no ar
                          public.espelho_titulos_creditum  ← o que o código já sabe ler
SOURCE TYPE               API (atual) / table (pretendida)
GRANULARITY               um título = uma PARCELA
LOGICAL ID                codigo_lancamento_omie
BUSINESS PERIOD           data_vencimento
SOURCE AS_OF              ultima_alteracao
COLLECTION AS_OF          sync_em — parado há 21 dias
FULL/INCREMENTAL          espelho com upsert 1:1
UNIT IDENTITY             Omie `projeto` — AUSENTE do espelho
MONEY                     numeric na fonte; parseFloat no dashboard
FRONTEND TRANSFORMS       substanciais (§18.6)
DATASET_ID                PENDING
A/B/C/D COMPATIBILITY     todos NOT_COMPATIBLE / NOT_APPLICABLE (§18.8)
SOURCEADAPTER             REQUIRES_CHANGE
PARITY WITH DASHBOARD     NOT_POSSIBLE_FROM_SOURCE_ALONE
IMPLEMENTATION READINESS  BLOCKED
```

## 18.2 O deploy: evidência

| verificação | resultado |
| --- | --- |
| HTTP | 200 |
| `last-modified` | **Tue, 11 Aug 2026 12:45:15 GMT** — 7 dias |
| `etag` | `b5248bdd5287be6ca255a56f4c28a398` |
| bytes | 90.946 — **idênticos** à coleta anterior |
| cache-busting (`?cb=`, `Cache-Control: no-cache`) | mesmo `etag`, mesmo conteúdo |
| scripts | 2 CDN (Chart.js) + 1 inline de 57,8 KB. **Nenhum bundle** |
| `*.supabase.co` no artefato | **zero** |
| `createClient` | **zero** |
| endpoint de dados | `/api/omie` |
| `/api/omie` ao vivo | **200**, `x-vercel-cache: MISS`, resposta real do Omie (`pagina`, `total_de_paginas`, `registros`, `total_de_registros`, `cadastro`) |
| rotas alternativas (`/v2`, `/dashboard`, `/cockpit`, `/novo`, `/inadimplencia`) | **404** |

**`SUPABASE_USED = NO`** para o que está publicado. Não é interpretação de cache:
o `last-modified` é de 11/08 e o conteúdo é byte-idêntico com o cache furado.

## 18.3 Mas o código JÁ sabe ler o Supabase

Aqui está a reconciliação, e é o achado central desta passada. O `normalizeRow`
do dashboard publicado aceita **duas** formas, e a primeira é a do espelho:

```js
codigoCliente:        r.codigo_cliente_fornecedor ?? r.cCodCliente ?? …
dataVencimento:       r.data_vencimento           ?? r.dDtVenc
valorDocumento:       parseFloat(r.valor_documento ?? r.nValorTitulo ?? 0)
numeroParcela:        (r.numero_parcela           ?? r.cNumParcela ?? "").toString()
numeroDocumento:      (r.numero_documento         ?? r.cNumTitulo  ?? "").toString()
statusTitulo:         (r.status_titulo            ?? r.cStatus     ?? "")…
codigoLancamentoOmie: r.codigo_lancamento_omie    ?? r.nCodTitulo  ?? r.nCodLanc
```

`codigo_cliente_fornecedor`, `data_vencimento`, `valor_documento`,
`numero_parcela`, `numero_documento`, `status_titulo`,
`codigo_lancamento_omie` — são **exatamente** os nomes das colunas de
`espelho_titulos_creditum`. O `??` coloca a forma do espelho em primeiro lugar e
o Omie nativo como fallback.

Leitura honesta: o trabalho de Supabase **foi feito** — o leitor está pronto e
prova a intenção. O que não está no artefato publicado é a **troca do fetch**.
Ele continua chamando `/api/omie`.

Explicações possíveis, nenhuma verificável de fora: o deploy foi para uma URL de
preview e o alias de produção não foi promovido; está em outro projeto/domínio;
ou a troca do fetch ainda não entrou. Não tenho acesso a essa conta Vercel — a
autenticada aqui tem só `creditum-portal`.

## 18.4 A lacuna de contrato — 8 de 16 colunas AUSENTES

O `normalizeRow` espera 16 campos. `espelho_titulos_creditum` tem 10 colunas.

| campo esperado | no espelho? | o que depende dele |
| --- | --- | --- |
| `codigo_cliente_fornecedor` | ✅ | agregação por cliente, exclusão de reneg |
| `codigo_lancamento_omie` | ✅ | identidade lógica |
| `data_vencimento` | ✅ | período, aging |
| `data_emissao` | ✅ | — |
| `numero_documento` | ✅ | `isReneg` |
| `numero_parcela` | ✅ | `isFPD` |
| `status_titulo` | ✅ | `isRecebido`, `isCancelado` |
| `valor_documento` | ✅ | todo valor |
| **`codigo_projeto`** | ❌ | **`renderInadimplenciaPorUnidade`, `renderMatrizUnidades`** |
| **`codigo_categoria`** | ❌ | **`renderConcentracaoPlano`** (campo `plano`) |
| **`data_pagamento`** | ❌ | **`isRecebido`, `isPagoCP`** |
| **`valor_pago`** | ❌ | `isRecebido`, ROI |
| **`valor_juros`** | ❌ | **`renderJurosMulta`** |
| **`valor_multa`** | ❌ | **`renderJurosMulta`** |
| **`valor_desconto`** | ❌ | ROI |
| **`id_conta_corrente`** | ❌ | exclusão de contas canceladas |

Oito ausentes, e não são periféricas: **a dimensão de unidade, o plano, e todo o
lado de pagamento**. `isRecebido` depende de `data_pagamento` e `valor_pago`
além do status — no espelho ele cairia para status apenas, o que muda a
classificação de inadimplência.

Trocar o fetch para o espelho hoje faria o dashboard perder unidade, plano,
juros/multa e metade do critério de recebimento — **em silêncio**, porque `??`
com campo ausente devolve `undefined` e `parseFloat(undefined ?? 0)` devolve 0.

## 18.5 A cadeia real

```
https://creditum-financas.vercel.app/          artefato de 11/08, HTML+inline JS
  └─ GET /api/omie?resource=…&pagina=N          proxy, 100/pág, 1200 ms entre páginas
       └─ Omie ERP                              projetos · clientes · contacorrente · contas a receber
            └─ normalizeRow                     mapeia 16 campos (aceita espelho OU Omie)
                 └─ classificação + agregação   TODA no frontend
                      └─ 14 render* → cards, tabelas, gráficos
```

| camada | conteúdo |
| --- | --- |
| **BACKEND/SOURCE** | apenas transporte. O proxy pagina; nenhuma regra de negócio |
| **FRONTEND BUSINESS** | classificação, aging, exclusão de reneg, FPD, agregações, plano, unidade |
| **VISUAL ONLY** | Chart.js, cores, `fmtMoney`/`fmtMoneyK`/`fmtPct`, `badgeClassPorTaxa` |

## 18.6 Transformações de frontend — as regras validadas

| regra | fórmula | classificação |
| --- | --- | --- |
| `diasAtraso` | `floor((new Date() − dataVencimento)/86400000)` | **FRONTEND_DERIVED** |
| `isAtrasado` | `!isRecebido && diasAtraso > 21` | FRONTEND_DERIVED |
| `isInadimplente` | `isAtrasado && !isReneg && !clientesRenegSet.has(cliente)` | FRONTEND_DERIVED |
| `isReneg` | `/RENEG\|R-\|ACORDO/i.test(numeroDocumento)` | FRONTEND_DERIVED |
| `isFPD` | `numeroParcela.startsWith("001/")` | FRONTEND_DERIVED |
| `isRecebido` | `status ∈ {RECEBIDO, LIQUIDADO}` **ou** `dataPagamento` **ou** `valorPago` | FRONTEND_DERIVED |
| `isCancelado` | `status === "CANCELADO"` | SOURCE_ALREADY_ENCODES |
| aging BKT1–BKT5 | 21-30, 31-60, 61-90, 91-120, >121 | FRONTEND_DERIVED |
| `CORTE_INADIMPLENCIA_DIAS` | 21 | FRONTEND_DERIVED — sem lastro governado |
| `OFFSET_ENTRADA_INADIMPLENCIA_DIAS` | 22 | FRONTEND_DERIVED — sem lastro governado |
| unidade | `projetosMap[codigoProjeto]` montado de Omie `projetos` | FRONTEND_DERIVED |
| plano | `codigo_categoria` | FRONTEND_DERIVED |
| exclusão de conta cancelada | via `contacorrente` do Omie | FRONTEND_DERIVED |

**`diasAtraso` usa `new Date()`.** O aging é calculado no instante do render, não
como-de uma data de referência. Duas pessoas abrindo o dashboard em dias
diferentes veem números diferentes dos mesmos dados. Para o intelligence, que
exige `detected_at` explícito e determinismo, isso precisa virar parâmetro.

## 18.7 Indicadores

| INDICADOR | OBJETO | CAMPOS | FILTROS | TRANSFORMAÇÃO | ONDE | REPRODUZ EXATO? |
| --- | --- | --- | --- | --- | --- | --- |
| Inadimplência total | contas a receber | venc, status, nº doc, cliente | > 21 dias, não reneg | `isInadimplente` | frontend | **não** — regra não está na fonte |
| Aging (5 buckets) | idem | `data_vencimento` | por faixa de dias | `bucketOf` | frontend | **não** |
| Inadimplência por unidade | idem + `projetos` | `codigo_projeto` | — | join + agregação | frontend | **não** — coluna ausente no espelho |
| Matriz de unidades | idem | `codigo_projeto` | — | pivot | frontend | **não** |
| Concentração por plano | idem | `codigo_categoria` | — | agregação | frontend | **não** — coluna ausente |
| FPD | idem | `numero_parcela` | `001/` | `isFPD` | frontend | parcial — campo existe |
| Juros e multa | idem | `valor_juros`, `valor_multa` | — | soma | frontend | **não** — colunas ausentes |
| Renegociações | idem | `numero_documento` | regex | `isReneg` + set por cliente | frontend | parcial |
| Fluxo mensal | idem | `data_vencimento`, valor | `monthKey` | agregação | frontend | parcial |
| Curva histórica | idem | venc, pagamento | — | série temporal | frontend | **não** — `data_pagamento` ausente |
| ROI | idem | pago, desconto, juros | — | razão | frontend | **não** — colunas ausentes |
| Tabela de alunos | idem + `clientes` | razão social | — | `agregarPorCliente` | frontend | **não** — exige `clientes` do Omie |
| Contas a pagar | `espelho_contas_pagar_creditum`? | — | — | `renderCP` | frontend | não verificado |
| Pós-curso dependente | idem | — | — | `renderPosCursoDependente` | frontend | não verificado |

## 18.8 Compatibilidade com A/B/C/D

| detector | veredito | por quê |
| --- | --- | --- |
| **A** — concentração de parcelamento | **NOT_COMPATIBLE** | exige `installment_count` do contrato. A fonte tem `numero_parcela` de título financeiro (`001/012`), que é posição na série, não o parcelamento contratado |
| **B** — conflito entre fontes | **DERIVABLE_WITHOUT_SEMANTIC_CHANGE** | `espelho_titulos_creditum` e `espelho_titulos_criteria` são duas versões do mesmo título (Creditum vs FIDC). É um caso legítimo de B — porém é comparação financeira, não de venda |
| **C** — concentração de vencimento | **NOT_COMPATIBLE** | `data_vencimento` existe, mas é vencimento de título, não `first_due_date` de contrato. Semanticamente diferente: o primeiro vencimento de um contrato é um fato comercial |
| **D** — caso único material | **NOT_APPLICABLE** | exige agregado com semântica parte-do-todo sobre venda. Aplicável a inadimplência exigiria redefinir a métrica |

**A fonte é exclusivamente financeira** — títulos, vencimento, inadimplência. Não
alimenta os detectores como estão especificados. B é a única com caminho, e é o
caminho do FIDC, não do dashboard.

## 18.9 `SourceAdapter` — REQUIRES_CHANGE

Mesma conclusão da §13, agora com a fonte confirmada.

`read(period_start, period_end): Promise<RawBatch>` não distingue as três
situações que o comentário da própria porta exige: origem indisponível, schema
divergente, tabela vazia. Só devolve lote ou lança.

Semântica perdida hoje, especificamente para esta fonte:

| precisa | a porta suporta? |
| --- | --- |
| distinguir "espelho parado 21 dias" de "sem títulos no período" | **não** |
| carregar `observed_at` da origem (`ultima_alteracao`) separado de `collected_at` (`sync_em`) | sim — `RawBatch` tem os dois |
| declarar que 8 campos esperados não existem | **não** — não há canal para lacuna de schema |
| `rows_skipped` | **não rastreável** na fonte |

## 18.10 Paridade — `NOT_POSSIBLE_FROM_SOURCE_ALONE`

Consumir `espelho_titulos_creditum` **não reproduz** os números do dashboard, por
três razões independentes, cada uma suficiente:

1. **13 dos 14 indicadores são frontend-derived.** Corte de 21 dias, offset de
   22, buckets, exclusão de cliente renegociado, FPD — nada disso existe em
   objeto de banco. Não há view nem RPC no projeto CFO (verificado: 5 funções,
   nenhuma view).
2. **8 das 16 colunas necessárias não existem no espelho** — incluindo unidade,
   plano e todo o lado de pagamento.
3. **`diasAtraso` usa `new Date()`.** O número oficial é função do instante de
   render, não só dos dados.

## 18.11 Estado e blockers

`IMPLEMENTATION READINESS = BLOCKED`

1. **A versão Supabase não está publicada.** O artefato de 11/08 lê Omie. Sem o
   deploy correto — ou sem acesso ao repositório — não há fonte oficial Supabase
   para integrar.
2. **8 colunas ausentes no espelho** — `codigo_projeto`, `codigo_categoria`,
   `data_pagamento`, `valor_pago`, `valor_juros`, `valor_multa`,
   `valor_desconto`, `id_conta_corrente`.
3. **`sync_em` parado há 21 dias** (28/07). Os dois espelhos.
4. **A regra validada mora no frontend.** Para o intelligence consumir a mesma
   verdade, ela precisa virar view/função ou política governada. O precedente
   interno é `config_status_abertos`, documentada como fonte única.
5. **`diasAtraso` não é determinístico** — depende de `new Date()`.
6. **Unidade não é `UnitId` do D13** — é `codigo_projeto` do Omie, e o mapeamento
   projeto→unidade não existe em nenhum lugar governado.
7. **`dataset_id` PENDING** — a granularidade é parcela, mas os indicadores são
   por cliente e por unidade.
8. `valor_documento` é `numeric` e o dashboard usa `parseFloat` — o intelligence
   exige `round(valor * 100)` em SQL, sem float no caminho.

## 18.12 Recomendação

Nada a implementar. Duas perguntas para o Leonardo, na ordem:

1. **Onde está o deploy da versão Supabase?** O `creditum-financas.vercel.app`
   serve o artefato de 11/08 que lê Omie. Se existe URL de preview ou outro
   domínio, é ela que precisa ser inspecionada.
2. **Ele sabe das 8 colunas ausentes?** O `normalizeRow` já aceita a forma do
   espelho — o leitor está pronto —, mas o espelho não tem projeto, categoria,
   pagamento, juros, multa, desconto nem conta corrente. Com o fetch trocado, os
   cards de unidade, plano, juros/multa e ROI zeram sem erro.

A terceira, para você: se a regra de inadimplência vai virar objeto de banco,
essa é a decisão que destrava a integração do intelligence — e é decisão de
governança, não de código.
