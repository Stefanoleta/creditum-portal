# Creditum CEO Intelligence — Briefing completo

**Última atualização:** 2026-08-13
**Branch:** `feature/ceo-intelligence`
**Estado:** Fase 1 em construção · 182 testes · typecheck e lint limpos

> **Para quem revisa este projeto:** este documento é autocontido. Ele reúne o
> contexto de negócio, os fatos apurados na fonte real, todas as decisões
> tomadas com sua justificativa, os 15 achados de três rodadas de revisão
> adversarial e o que foi deliberadamente **recusado**. Leia a seção 9 antes de
> propor mudanças — várias sugestões óbvias já foram avaliadas e descartadas com
> medição.

---

## 1. Negócio

Creditum é uma fintech brasileira de crédito educacional que opera como
**corban** via **FIDC** (R$ 90M, parceiro Criteria Capital). Intermedia
originação e gestão de carteira entre o parceiro financeiro e uma rede de
escolas — principalmente Grau Técnico, além de cursinhos de residência médica.

Receita: spread sobre crédito originado + gestão do FIDC.
Inadimplência de referência: ~11%.
Dados de aluno (nome, telefone, CPF) são **PII sob LGPD**.

Stack: Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase/Postgres 17 ·
Vercel (região `gru1`) · n8n Cloud · Bitrix24 · Omie.

---

## 2. O produto

Sistema **privado** de inteligência operacional do fundador. Não é CRM, não é
ferramenta de vendedor, não exige alimentação manual da equipe.

**Critério de sucesso:** o CEO abre o app por 30 segundos e entende como a
operação está hoje, o que mudou, onde tem problema e o que merece atenção dele.

Opera por *management by exception*: se está tudo normal, diz que está normal;
se tem problema, **acha o problema** — o CEO não procura.

### A diferença entre isto e um dashboard

Não é visual. É epistêmica.

Um dashboard é espelho da fonte: se a fonte está errada, ele mostra o erro com
aparência de verdade. Este sistema **desconfia da fonte** e informa quando ela
não merece confiança. Exemplos concretos, todos extraídos da fonte real:

| Situação | Dashboard | Este sistema |
|---|---|---|
| Duas abas discordam (8 vs 14 vendas) | mostra uma delas, limpa | mostra 14 **e** sinaliza 6 sem contrapartida |
| Vendedor com 0 leads | `0,00%` de conversão | `EMPTY_DENOMINATOR` — não é 0% |
| 55 linhas vazias na planilha | vira 55 leads; conversão cai de 10,6% p/ 7,5% sem aviso | rejeitadas e **contadas** em `rows_skipped` |
| Fonte fora do ar | painel bonito com dado velho | fonte marcada como degradada |

---

## 3. Fatos apurados na fonte real

Auditoria da planilha `Vendas - Agosto` (2026-08-13). **Estes fatos motivaram
boa parte das decisões.**

### 3.1 A planilha tem 3 abas, não 1

| Aba | Papel | Conteúdo |
|---|---|---|
| Indicações | `pipeline` | 13 colunas · **132 linhas reais + ~55 linhas-fantasma** |
| Vendas | `sales` | 12 colunas · 14 vendas · CPF, repasse, ticket |
| Conversão | `reference_only` | consolidado montado à mão |

### 3.2 As abas se contradizem

- aba `pipeline`: **8** linhas com `Status = Venda`
- aba `sales`: **14** vendas
- **6 vendas da aba financeira não constam como venda no pipeline** — 3 não
  existem lá, 3 estão como `Novo`
- uma venda é `04/08` no pipeline e `05/08` na financeira

### 3.3 Um terceiro artefato discorda dos dois

Existe um relatório publicado
(`relatorio-vendas-agosto-…vercel.app`) que consolida os mesmos dados:

| Métrica | Aba consolidada | Relatório publicado |
|---|---|---|
| Conversão Indicação | **36,36%** (8/22) | **29,6%** (8/27) |

Mesmo numerador, **denominadores diferentes**. Não resolvido — ver seção 11.

O relatório também documenta regras de negócio que não estavam em lugar nenhum:
Wellington, Hayron e Rhenan são excluídos dos rankings por vendedor ("fora do
time de referência"); leads `Ninguém` saem do ranking mas contam nos totais;
existe uma segunda planilha `Novos Alunos - Agosto` nunca vista.

### 3.4 Validação cruzada bem-sucedida

O motor determinístico reproduz **exatamente** os números do relatório
publicado, partindo das strings cruas:

| | Relatório | Motor |
|---|---|---|
| Valor total | R$ 82.920,57 | R$ 82.920,57 |
| Ticket médio | R$ 5.922,90 | R$ 5.922,90 |
| Conversão Qualificação | 5,45% (6/110) | 5,45% |

### 3.5 Problemas de dado, por categoria

**Linhas-fantasma.** ~55 linhas vazias com `Status = "Novo"` e
`Total de parcelas = 0`.

**Entidades não normalizam.** `Grau Sumaré`/`Grau Sumare`,
`Grau Alecrim`/`Grau alecrim`, `Grau Marabá`/`Grau Maraba`. A aba financeira
não usa o prefixo `Grau`. Canal aparece como `Indicação` e `indicação`.
`Ninguem`/`Ninguém` aparecem como Vendedor e SDR — sentinela de não-atribuído.

**Armadilha de fusão.** A base tem `Grau Santos` **e** `Grau Santo Amaro`.
Cidades distintas, e "Santos" é quase prefixo de "Santo Amaro". Também
`Limeira`/`Limoeiro`.

**Status além do previsto.** `Não tem Garantidor` e `Procurando garantidor`
não constavam na especificação. `Fora de politica` vem sem acento.

**Duplicidade e identidade.** Um aluno de Prudente aparece 2× no mesmo dia com
`(%)` divergente (20% vs 25%). Um aluno de Mogi aparece 03/08 como
`Qualificação / Fora de politica` e 10/08 como `Indicação / Venda` — mesmo
telefone, jornadas distintas.

**Parsing.** Moeda como `R$ 578,70` e `R$410,00` (sem espaço). CPF em 3
formatos, **3 deles com 10 dígitos** — zero à esquerda comido pelo Sheets.

**Fórmula do ticket descoberta e confirmada.** `ticket = valor_repasse ×
parcelas_grau`, conferido nas 14 linhas.

### 3.6 A planilha muda todo mês

Arquivo novo por mês, padrão `Vendas - XXXXX`, em pasta compartilhada.
Busca no Drive revelou que **o padrão só vale de maio para cá** — março, abril
e dezembro usam outra convenção e pertencem a uma **conta pessoal
`@hotmail.com`** (exposição de PII sob LGPD, fora do escopo técnico deste
projeto mas reportada). **Julho não foi encontrado.**

Escopo definido pelo CEO: coleta vale **de hoje em diante**.

---

## 4. Lacunas do repositório (encontradas, não introduzidas)

| Lacuna | Impacto |
|---|---|
| **Sem autenticação** — nenhum `middleware.ts`, nenhum login | portal público na Vercel com PII de aluno; `/api/*` aberto |
| Sem `typecheck`, sem test runner | corrigido: scripts + Vitest adicionados |
| `shadcn` em `dependencies` | arrastava express/hono/ajv para o runtime; **era a origem das 11 vulnerabilidades**. Movido para dev → audit de produção caiu para 4 |
| `vercel.json` pede cron `*/5`; plano Hobby roda 1×/dia | motivo de D4 |
| 4 achados de segurança no schema `public` | `catalogo_dados` sem RLS exposta via PostgREST; `vw_discador_unificado` é `SECURITY DEFINER`; `call_analyses` e `quick_calls` com RLS sem policy |

---

## 5. Arquitetura

```
n8n Cloud (lê Google Sheets)
   │
   └─ POST /api/ceo/ingest/google-sheets      HMAC + Idempotency-Key
        │
        ├─ RAW         ceo.source_records      imutável (trigger) · sha256 · jsonb
        ├─ NORMALIZE   ceo.source_mappings     config em DADOS, não em código
        ├─ AUDIT       ceo.data_conflicts
        ├─ CORE        students · opportunities · sales · sellers · schools
        ├─ METRICS     determinístico · fórmulas em METRICS.md
        └─ EVENTS      → notificações
                            │
                            └─ /ceo  (Home mobile-first)
```

**Invariante:** raw nunca é sobrescrito. Toda métrica é reconstruível a partir
dele. O trigger `source_records_immutable` impõe isso no banco, inclusive
contra `service_role`.

### 5.1 Os quatro tipos de dado nunca se misturam

`Metric<T>` é união discriminada — não dá para ler `.value` sem checar `.ok`.

| Classe | Invariante imposta pelo tipo |
|---|---|
| `observed` | veio da fonte |
| `calculated` | **fórmula obrigatória** |
| `inferred` | **confiança obrigatória** |
| `forecast` | **confiança obrigatória** + faixa |

Lacunas: `DATA_NOT_AVAILABLE`, `DATA_CONFLICT`, `LOW_CONFIDENCE`,
`EMPTY_DENOMINATOR`, `INSUFFICIENT_COVERAGE`, `BUSINESS_RULE_PENDING`.

Ausência **nunca** vira zero. A classe do resultado é sempre a mais fraca das
entradas: um total que depende de previsão **é** previsão.

### 5.2 Resolução de identidade de unidade — quatro degraus

1. **canônico** — acento, caixa, espaço, prefixo `Grau`, abreviação regular
   (`sta`→`santa`). Auto-aplica.
2. **alias** — tabela aprovada pelo CEO. Auto-aplica.
3. **sugestão** — semelhança ≥ 0,80. **Nunca** auto-aplica.
4. **nova** — cria unidade.

A regra que impede fusão errada é **linguística**: contagem de palavras
diferente **e** nenhuma palavra em comum = lugares diferentes. É isso que separa
`santos` de `santo amaro`.

Limiar calibrado contra unidades reais: `alecrim`/`alecrin` = 0,86 (sugere);
`limeira`/`limoeiro` = 0,75 (não sugere).

### 5.3 Identidade de registro externo

```
rowKey          = sha256(fonte | dataset | aba | posição)
sourceRecordId  = sha256(fonte | dataset | aba | posição | conteúdo)
contentHash     = sha256(conteúdo)          ← atravessa datasets de propósito
```

`dataset` (id da planilha) é **obrigatório** — sem ele a linha 42 de agosto e a
linha 42 de setembro colidem. `contentHash` ignorar o dataset é intencional: é o
que permite reconhecer o mesmo aluno reaparecendo no mês seguinte.

---

## 6. Métricas

```
ticket(venda)              = valor_repasse × parcelas_grau           [calculated]
tkm(vendedor, período)     = AVG(ticket) das vendas do período       [calculated]
volume_contratado(período) = SUM(ticket)                             [calculated]

gross_conversion    = sales / leads_received                         [calculated]
eligible_conversion = sales / leads_eligible                         [calculated]
leads_eligible      = leads_received − perdas por CREDIT_POLICY      [PENDENTE]
```

As duas conversões aparecem **lado a lado**, nunca só uma.

Dinheiro é **inteiro em centavos**, sempre. Percentual é **basis points**.
Nenhum LLM calcula: soma, média, percentual, ranking, conversão, ticket e
agregação são código determinístico e testado.

Taxonomia de perda: `CREDIT_POLICY` · `GUARANTOR` · `COMMERCIAL` ·
`OPERATIONAL` · `OTHER`. Sempre preservados `raw_loss_reason`,
`normalized_loss_reason`, `classification_confidence`.

---

## 7. Decisões

| # | Decisão | Razão em uma linha |
|---|---|---|
| **D1** | CEO App no repo `creditum-portal`, rota `/ceo`, schema `ceo` | stack pronta, um deploy, zero infra nova |
| **D2** | Portal sai da vista do CEO; encanamento continua vivo | `/api/webhooks/argus` recebe ligações; matá-lo perderia dados |
| **D3** | Regra de "o que é venda" é **linha em tabela**, não código | a planilha atual não é a fonte oficial; a definitiva está em desenvolvimento |
| **D4** | n8n empurra; o app não puxa | Vercel Hobby limita cron; e o coletor não pode interpretar |
| **D5** | `ticket = repasse × parcelas`; `TKM` = média do ticket | validado nas 14 linhas e confirmado pelo CEO |
| **D6** | Identidade externa não usa número de linha sozinho | inserir linha no meio deslocaria tudo |
| **D7** | Dedup nunca por nome; mesmo telefone pode ser jornadas distintas | colapsar o caso de Mogi apagaria uma venda |
| **D8** | Parsing monetário por **gramática**, não heurística | 9 de 11 malformados viravam valor plausível |
| **D9** | CPF recuperado é sinal **fraco**, só com 10 dígitos | ~1% de falso positivo medido em 200k amostras |
| **D10** | Agregação publica **cobertura**, não tudo-ou-nada | uma unidade sem reporte não pode apagar as outras 19 |
| **D11** | Guardas de `isSafeInteger`; **`bigint` recusado** | teto do negócio é 6 ordens de grandeza abaixo de 2^53 |
| **D12** | Semelhança **sugere**, nunca funde | `Santos` vs `Santo Amaro` existem na base |
| **D13** | Nomes canônicos de unidade vêm do CEO, não de algoritmo | `Mogi` → `Mogi das Cruzes`; `Rio Preto` → `São José do Rio Preto` |
| **D14** | Identidade de linha exige o `dataset` | planilha nova por mês faria linha 42 colidir com linha 42 |

Detalhe completo com contexto e justificativa: [`docs/decisions/2026-08-13.md`](decisions/2026-08-13.md).

---

## 8. Regras de negócio pendentes

Marcadas no código como `BUSINESS_RULE_PENDING` e registradas em
`ceo.business_rules` com `pending = true`. **Não bloqueiam o desenvolvimento.**

| Regra | Estado |
|---|---|
| Fonte oficial de venda | em desenvolvimento pelo CEO |
| Elegibilidade comercial de lead | provisório: exclui `CREDIT_POLICY` |
| **Churn** | **sem regra — não inventar.** Métricas de churn devem devolver `BUSINESS_RULE_PENDING` |
| Curso | campo previsto, fonte indisponível |
| `contract_value`, `revenue_value` | campos criados, vazios |
| Exclusão de Wellington/Hayron/Rhenan dos rankings | descoberta no relatório publicado; não confirmada pelo CEO |

---

## 9. Três rodadas de revisão adversarial — 15 achados

Todos fechados. **Leia antes de propor mudanças.**

### Rodada 1 — fundação determinística

1. **CPF por padding aceitava 8–10 dígitos.** Medição sobre 200k amostras
   aleatórias: a taxa de aceite falso do mod-11 é **~1% em qualquer
   comprimento**, mas a probabilidade a priori de recuperação legítima despenca
   (~10% dos CPFs começam com um zero, ~1% com dois, ~0,1% com três). Restrito a
   10 dígitos e rebaixado a `confidence: "recovered"`.
2. **Uma lacuna invalidava agregado inteiro.** Virou modelo de cobertura (D10).
3. **Parser monetário aceitava sintaxe malformada.** 9 de 11 casos. Virou
   gramática (D8).
4. **Invariantes de `Metric<T>` não estavam no discriminante.** Migradas.
5. **Centavos em `number` podiam perder precisão.** Guardas adicionadas.

### Rodada 2 — o que a rodada 1 não viu

6. **Célula numérica ignorava todas as guardas** — a mesma quantia era aceita
   como número e recusada como texto.
7. **INVERSÃO DE SINAL.** `R$ -100,00` virava **+R$ 100,00**: o negativo era
   detectado antes de limpar o `R$`, e depois o sinal era apagado. Num estorno,
   troca o efeito financeiro de lado.
8. **`sumMetrics` contornava `sumCents`** — a guarda de exatidão era pulada
   justamente pelo agregador dos totais executivos.
9. **Fórmula vazia aceita em métrica calculada** — o estado que o comentário
   logo acima declarava inválido.
10. **Agregado parcial indistinguível de completo no tipo.** `Aggregated` virou
    união discriminada; o ramo incompleto **não** chama seu conteúdo de `value`.

### Rodada 3 — schema e identidade

11. **RLS com `using (true)` para `authenticated`** em 19 tabelas. Verificação
    antes de reportar: `authenticated` **nunca recebeu `USAGE`** no schema, então
    **não houve vazamento**. Mas era armadilha armada — o grant que a Home vai
    precisar abriria tudo de uma vez, incluindo `source_records.payload`.
    Trocado por `ceo.app_users` + `ceo.is_member()` `SECURITY DEFINER` com
    `search_path` fixo.
12. **Idempotência de venda tinha buraco.** O índice único cobria só
    `opportunity_id is not null` — deixando de fora justamente as vendas **sem**
    oportunidade, que na base real são **6 das 14**. Agora
    `unique(source_record_id)`.
13. **`source_records` era "imutável" só no comentário.** Trigger append-only
    instalado; vale inclusive contra `service_role`.
14. **Identidade colidia para linhas idênticas.** `sourceRecordId` passou a
    incluir o localizador.
15. **`isBlankRow` ignorava `installmentsTotal`** — que a própria interface
    recebia e nunca lia. Linha com dinheiro e sem identidade entrava em
    `rows_skipped`, apagando sinal financeiro. Virou `classifyRow` com
    `material` / `blank` / `orphan_material`.

---

## 10. Recomendações **recusadas** — não repropor sem evidência nova

| Sugestão | Por que foi recusada |
|---|---|
| **Migrar dinheiro para `bigint`** | O teto realista do negócio é o FIDC de R$ 90M = 9×10⁹ centavos — **seis ordens de grandeza abaixo de 2^53**. `bigint` traria complexidade de serialização em toda fronteira JSON sem resolver risco existente. Guardas de `isSafeInteger` cobrem o caso. |
| **`min(jaccard, caracteres)` na semelhança** | Seguro demais: zerava todo score sem palavra em comum, e a camada de sugestão **nunca disparava**. Rede de segurança que nunca dispara é pior que nenhuma, porque parece que existe. |
| **Combinador genérico sobre tuplas** | A inferência de tupla sobre união (`Metric<T>`) falha em silêncio e degrada os argumentos para `unknown`, desligando a checagem exatamente onde ela mais importa. Por isso a API é `combine2`/`combine3`/`combineAll`. |
| **Capture groups nomeados no regex** | Exigem ES2018; o `tsconfig` do app mira ES2017. Mudar o target por causa de um regex alteraria o build de toda a aplicação por conveniência local. |
| **Cache em RAM (Redis) para acelerar leitura** | O gargalo é **aquisição**, não armazenamento: 21.700 registros são triviais para Postgres. Cachear mantém os 5 minutos na primeira leitura e arrisca cachear dado parcial. A solução é coleta agendada + pré-agregação diária. |

---

## 11. Perguntas abertas

**Para o CEO:**

1. **Conversão de Indicação: 22 ou 27 leads no denominador?** Dois artefatos
   internos discordam.
2. **`Novos Alunos - Agosto`** — segunda planilha citada no relatório publicado,
   nunca vista. Provável origem dos 5 leads de diferença.
3. **Exclusão de Wellington/Hayron/Rhenan** dos rankings é permanente ou
   circunstancial? Muda denominador.
4. **Pasta compartilhada** ainda não existe; arquivos estão compartilhados
   individualmente.

**Pendências técnicas registradas (P1/P2):**

- **P1** — separar a identidade de ingestão do `service_role`. Hoje a ingestão
  usaria a chave que ignora RLS e abre o banco inteiro. Adiado porque definir
  privilégios antes da rota existir seria adivinhação. Mitigação ativa: trigger
  append-only.
- **P2** — testes de concorrência e retry contra Postgres descartável. As
  constraints de idempotência nunca foram exercitadas sob retry.

---

## 12. Estado do código

```
src/lib/ceo/
  parse.ts              moeda, percentual, data, CPF, texto — 100% puro
  data-class.ts         álgebra de Metric<T>, agregação com cobertura
  normalize.ts          identidade de unidade/vendedor, classificação de linha
  adapters/
    types.ts            contrato DataSourceAdapter
    identity.ts         identidade de registro externo
  __tests__/            182 testes

supabase/migrations/
  20260813_ceo_schema.sql       schema ceo (aplicado)
  20260813b_ceo_hardening.sql   correções da rodada 3 (aplicado)

docs/
  BRIEFING.md                                   este documento
  decisions/2026-08-13.md                       D1–D14 + P1/P2
  superpowers/specs/2026-08-13-…-design.md      design original
```

**Verificado no banco de produção:** 19 tabelas no schema `ceo`, 0 policies
permissivas, trigger append-only ativo, `ticket_cents` é coluna **gerada**
(`transfer_cents * installments_grau` — impossível gravar ticket que não siga a
fórmula), 9 tabelas do `public` intactas.

**Fases:** F1.1 parsing ✅ · F1.2 métricas ✅ · F1.3 schema ✅ ·
F1.4 identidade ✅ · F1.5 adapter + ingestão + auth ⬜ · F2–F7 pendentes.
