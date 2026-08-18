# Fase 2.6a — Decisões de negócio pendentes

**Para:** Stefano
**Data:** 2026-08-17
**O que é:** só o que depende de você. Nada aqui é engenharia pendente.

> Não sugeri nenhum número, nenhum nome canônico e nenhuma tabela. Onde não há
> evidência no repositório, está escrito que não há.

---

## 1. D13 — oito nomes de unidade

`ceo.schools` e `ceo.school_aliases` estão **vazias**. Sem elas, cada ingestão real
degrada a qualidade: `Grau Marabá` viraria `unknown` todo mês.

### 1.1 Grafia — a normalização já une, falta escolher o que aparece no relatório

| # | A fonte escreve | Candidato | Evidência | Status |
|---|---|---|---|---|
| 1 | `BelfordRoxo` | Belford Roxo | Município do RJ; nome oficial tem espaço | `AMBIGUOUS` |
| 2 | `Maracanau` | Maracanaú | Município do CE; nome oficial é acentuado | `AMBIGUOUS` |
| 3 | `Jardim Angela` | Jardim Ângela | Distrito de SP; nome oficial é acentuado | `AMBIGUOUS` |

**Decisão:** qual grafia vira o `display_name` do catálogo? (A identidade já casa
sozinha — isto é só exibição.)

### 1.2 Abreviação que nenhum algoritmo resolve

| # | A fonte escreve | Candidato | Evidência | Status |
|---|---|---|---|---|
| 4 | `Presidente P.` | Presidente Prudente **(?)** | `BRIEFING.md` §3.5 menciona *"um aluno de Prudente"*. `P.` poderia ser Prudente, Penha, Piedade… | `AMBIGUOUS` |

**Decisão:** qual unidade é? É o mesmo padrão de `Mogi` e `Rio Preto`, que você já
corrigiu — contração que só quem conhece a operação resolve.

### 1.3 Não identificadas

| # | A fonte escreve | Candidato | Evidência | Status |
|---|---|---|---|---|
| 5 | `Rio Centro` | — | Nenhuma no repositório. Pode ser Riocentro (RJ) ou nome próprio da unidade | `UNKNOWN` |
| 6 | `Bezerra` | — | Nenhuma no repositório | `UNKNOWN` |
| 7 | `Santa Cruz` | — | Existe Santa Cruz no RJ e em outros estados. O catálogo tem outras do RJ, mas isso é sugestão, não evidência | `UNKNOWN` |

**Decisão:** que unidades são essas?

### 1.4 A fonte reporta, o catálogo não conhece

| # | A fonte escreve | Candidato | Evidência | Status |
|---|---|---|---|---|
| 8 | `Grau Marabá` / `Grau Maraba` | Marabá **(?)** | Aparece em `BRIEFING.md` §3.5 como caso real. **Não está nas 27 unidades de `public.unidades`** | `UNKNOWN` — ausência |

**Decisão:** está ativa? Deve entrar no catálogo? Ou a lista de 27 está
desatualizada?

### 1.5 Duas perguntas extra

- **Duplicidade:** `Rio Centro`, `Zona Norte` e `Madureira` são todas designações do
  RJ. Alguma é a mesma unidade sob nomes diferentes? *(sem evidência — só registro)*
- **Outros aliases:** a planilha escreve alguma outra unidade de forma curta, como
  faz com `Mogi` e `Rio Preto`?

---

## 2. `expected_units` — unidades esperadas por período

### 2.1 O problema

```
catálogo ativo:        40 unidades
esperadas em agosto:   37   ← este é o denominador da cobertura
```

Se o sistema usar 40, a cobertura fica permanentemente abaixo de 100% e todo evento
sai degradado — um alarme que nunca desliga. Se usar 37, ele precisa saber que são
37.

### 2.2 Contrato mínimo proposto

Não é tabela, é a forma da informação:

| Campo | Para quê |
|---|---|
| `period` | mês de competência (ex. `2026-08`) |
| `dataset_id` | qual relatório — vendas e residência podem esperar conjuntos diferentes |
| `unit_id` | a unidade |
| `expected` | booleano: era esperada neste período, neste relatório? |

Uma linha por unidade × período × relatório. Sem isso, o número de esperadas fica
sendo uma **lacuna declarada** — nunca 100% presumido.

### 2.3 Decisão

**De onde vem essa informação?** As opções que consigo enxergar sem inventar:

1. Você declara por período (planilha ou tela).
2. Deriva-se do catálogo com data de abertura/fechamento — o que exigiria adicionar
   `effective_from`/`effective_to` em `ceo.schools`, que hoje só tem `active`
   booleano e por isso perde a história.
3. Deriva-se de quem tem meta comercial no período.

Não escolhi nenhuma.

---

## 3. Thresholds — 10 decisões, não 30

Existem ~30 campos de configuração sem valor aprovado. **Mas muitos são o mesmo
juízo de negócio aplicado em lugares diferentes.** Agrupei para você responder 10
perguntas, não 30.

Hoje **nenhum detector roda**: a configuração é recusada sem esses valores. Não é
degradação — é recusa explícita, por desenho.

### Grupo 1 — "a partir de que participação isso merece atenção?"

| Onde | Campo |
|---|---|
| A | `material_share_count_bp`, `material_share_amount_bp` |
| C | `material_share_count_bp`, `material_share_amount_bp` |
| D | `material_share_of_total_bp` |
| B | `material_share_bp` |

**Unidade:** percentual do consolidado do período.
**O que decide:** se o fato aparece como evento ou fica só no registro auditável.
**Se maior:** menos eventos, risco de perder concentração real.
**Se menor:** mais eventos, risco de ruído — e ruído treina o leitor a ignorar.
**Status:** UNRESOLVED. *Pode ser um número só para os quatro, ou refinado por
detector depois.*

### Grupo 2 — "a partir de que valor em reais isso merece atenção?"

| Onde | Campo |
|---|---|
| A | `material_amount_cents` |
| C | `material_amount_cents` |
| D | `material_absolute_delta_cents` |
| B | `material_amount_cents` |

**Unidade:** reais.
**O que decide:** materialidade por valor absoluto, independente de percentual.
**Por que existe separado do Grupo 1:** 2% de um mês grande pode ser mais dinheiro
que 30% de um mês pequeno.
**Status:** UNRESOLVED.

### Grupo 3 — "a partir de quantos casos isso merece atenção?"

| Onde | Campo |
|---|---|
| A | `material_count_above` |
| C | `material_count` |
| D | `material_count_delta` |
| B | `material_absolute_count` |

**Unidade:** contagem de contratos/casos.
**O que decide:** materialidade por quantidade absoluta.
**Status:** UNRESOLVED.

### Grupo 4 — "com quantos contratos já dá para afirmar algo?"

| Onde | Campo |
|---|---|
| A | `minimum_sample_size` |
| C | `minimum_sample_size` |
| D | `min_population_after_removal` |

**Unidade:** contagem.
**O que decide:** **bloqueia a emissão.** Abaixo disso o detector não afirma
concentração — 2 de 3 contratos é 67%, e isso não significa nada.
**Se menor:** eventos sobre amostras minúsculas.
**Status:** UNRESOLVED.

### Grupo 5 — "quando quantidade e valor discordam, qual manda?"

| Onde | Campo |
|---|---|
| A | `severity_dimension` |
| C | `severity_dimension` |
| D | `severity_dimension` |

**Opções:** participação em **quantidade** ou em **valor**.
**O que decide:** a severidade do evento.
**Por que importa:** muitos contratos pequenos e poucos contratos grandes produzem
leituras opostas. Sem escolha explícita, uma se passaria pela outra.
**Consequência hoje:** se a dimensão escolhida não existir (ex. valor com estorno),
**nenhum evento é emitido** — o registro auditável fica, o alerta não sai.
**Status:** UNRESOLVED.

### Grupo 6 — "a partir de que percentual é baixo, médio, alto, crítico?"

| Onde | Campo |
|---|---|
| A, C, D | `severity_scale` |
| B | `severity_by_relative_bp` |

**Unidade:** faixas em percentual, começando em 0.
**O que decide:** o grau (`info` → `crítico`) que o CEO vê primeiro.
**Status:** UNRESOLVED. *Pode ser uma escala só, reaproveitada.*

### Grupo 7 — "com quantas unidades faltando o número deixa de valer?"

| Onde | Campo |
|---|---|
| A | `minimum_coverage_bp` |
| todos | `coverage.degraded_below_bp` (marca como degradado) |
| todos | `coverage.emit_event_below_bp` (**bloqueia** a emissão) |

**Unidade:** percentual de unidades que reportaram.
**O que decide:** dois patamares — a partir de onde o número sai com aviso, e a
partir de onde não sai.
**Status:** UNRESOLVED. Depende de §2 (`expected_units`).

### Grupo 8 — "quanto duas fontes podem discordar antes de virar problema?" *(só B)*

| Campo | O que decide |
|---|---|
| `material_relative_difference_bp` | divergência relativa entre as fontes (8 vs 14 vendas = 43%) |
| `material_absolute_basis_points` | diferença absoluta quando a própria métrica já é percentual |
| `structural_fields` | **quais campos não toleram divergência nenhuma** — data de venda e identidade ou batem ou não |
| `structural_severity` | grau de um conflito estrutural, que não tem denominador |

**Status:** UNRESOLVED.

### Grupo 9 — "qual janela de vencimento interessa?" *(só C)*

| Campo | Opções |
|---|---|
| `window` | **mesmo dia** · **mês calendário** · **próximos N dias** |

**O que decide:** o que conta como concentração — nove contratos no dia 04, ou nove
contratos em setembro.
**Status:** UNRESOLVED.

### Grupo 10 — "que agregados o impacto de um caso deve medir?" *(só D)*

| Campo | Opções |
|---|---|
| `supported_metrics` | soma de valor · ticket médio · contagem de casos |

**O que decide:** que agregados o Detector D pode analisar. Pedir um fora da lista é
recusado.
**Status:** UNRESOLVED.

### Fora da lista: os dois já aprovados

| Valor | Lastro |
|---|---|
| `installment_threshold = 19` | Briefing do Bloco 1 §14 Caso A — *"mais de 19 parcelas"* |
| similaridade `0,80` | Calibrado contra unidades reais (alecrim 0,86 sugere / limeira 0,75 não) |

---

## 4. Leonardo — o que precisamos quando a migração terminar

O repositório menciona Leonardo apenas como coordenador (`CLAUDE.md:35`). Nenhum
nome de tabela tem lastro, então não inventei nenhum.

| # | Informação | Por quê |
|---|---|---|
| 1 | **Tabela ou view** de origem no Supabase | é a origem do adaptador |
| 2 | **Campos** disponíveis e seus tipos | define o que o detector pode medir |
| 3 | **Chave lógica** da linha | vira o `row_key` da evidência; precisa ser estável entre execuções |
| 4 | **`as_of`** — que campo diz a que momento o dado se refere | freshness; é diferente da hora da leitura |
| 5 | **Full ou incremental** | `ceo.source_records` já suporta incremental (`superseded_at`), não precisa mudar schema |
| 6 | **Período** — como filtrar o mês de competência | o detector recebe período explícito |
| 7 | **Comportamento quando vazio** | tabela vazia e indisponibilidade são coisas diferentes e não podem virar a mesma resposta |

Sugestão de `dataset_id` lógico: algo estável como `ds_residencia_mensal` — **nunca**
com versão ou data no nome, senão cada mês vira um dataset diferente e a identidade
dos eventos quebra.

---

## 5. Lucas — pasta mensal

### 5.1 Proposta já recomendada

```
vendas/
  2026-08/
  2026-09/
```

| Item | Proposta |
|---|---|
| Padrão da pasta | `YYYY-MM` |
| Fuso de negócio | **America/Sao_Paulo**, explícito — nunca o fuso da máquina |
| Mês de negócio ≠ execução | o mês vem do dado; a hora da leitura é outro campo |
| **Arquivo atrasado** | fica no **mês de competência** e exige reprocessamento explícito daquele mês. **Não entra em silêncio no mês vigente** — isso mudaria um número já publicado sem ninguém saber |
| Dois arquivos no mesmo mês | **conflito**, não "o mais recente ganha". O Detector B existe para isso |
| Arquivo faltando | lacuna de cobertura, não zero |
| Arquivo com mês futuro | recusado |
| Arquivo vazio / corrompido | falha fechada por arquivo, com o motivo |
| Identidade | hash do conteúdo, para reprocessar sem duplicar evento |

### 5.2 Pergunta aberta

**Qual storage contém a pasta?** Isso determina o adaptador e as credenciais.

Exemplos apenas para orientar a resposta — **não assumi nenhum**: Google Drive,
OneDrive/SharePoint, S3 ou compatível, ou pasta em servidor próprio.

Junto com isso: **quais extensões** são permitidas? (allowlist fechada, nunca
"qualquer planilha").

---

## 6. Resumo do que preciso de você

| # | Assunto | Perguntas |
|---|---|---|
| 1 | D13 | 8 nomes + duplicidade + outros aliases |
| 2 | `expected_units` | de onde vem |
| 3 | Thresholds | 10 grupos de decisão |
| 4 | Leonardo | 7 informações da migração |
| 5 | Lucas | qual storage + extensões permitidas |

Enquanto o **item 1** e o **item 3** não estiverem resolvidos, nenhum detector roda
com dado real: sem catálogo, toda unidade degrada; sem thresholds, a configuração é
recusada.

Os itens 4 e 5 podem correr em paralelo — dependem de terceiros, não de você.
