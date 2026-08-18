# Fase 2.9 — Dashboard do Leonardo: descoberta da fonte oficial

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
