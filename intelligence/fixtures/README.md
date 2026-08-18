# Fixtures

**Nenhum dado real entra aqui.** Tudo é sintético, construído para reproduzir as
formas de problema que a fonte real apresenta — sem carregar um único dado de
pessoa.

Há teste que falha se qualquer fixture contiver PII
(`adversarial.test.ts` → "nenhuma fixture sintética contém PII").

## `synthetic/`

Carregadas pelo `loadSyntheticStore()` e servidas pelo gateway.

### `snapshots/`

| Arquivo | Papel |
|---|---|
| `snap_2026_08_pipeline.json` | Aba de pipeline. `degraded`: 55 linhas-fantasma descartadas e contadas, cobertura 95%, campo `curso` ausente. |
| `snap_2026_08_sales.json` | Aba financeira. `conflicted`: dois conflitos abertos — 8 vs 14 vendas, e uma data divergente (04/08 vs 05/08). |
| `snap_2026_08_omie_bloqueado.json` | **Fixture de controle.** Existe no store mas a fonte `omie` não está na allowlist (decisão §4: o Hermes não acessa os ERPs). Prova que o snapshot é invisível — na listagem, na busca direta, e nos eventos que dependeriam dele. |

### `events/` — os quatro casos obrigatórios

| Arquivo | Caso | O que exercita |
|---|---|---|
| `evt_a_parcelamento.json` | **A** | Contratos acima de 19 parcelas, com os casos individuais que somam 67,5% do impacto |
| `evt_b_conflito.json` | **B** | Fontes contraditórias; a métrica de referência é `gap` com motivo `DATA_CONFLICT`, não um número inventado |
| `evt_c_primeiro_vencimento.json` | **C** | Concentração em setembro, com projeção em faixa e confiança explícita |
| `evt_d_caso_material.json` | **D** | Um caso move o ticket médio de R$ 5.467,29 para R$ 5.922,90 — visível por pseudônimo, sem revelar quem é |

### `evidence/`

Âncoras dos eventos. `ev_b_financeiro_vendas.json` carrega uma **prompt injection
real** na célula "Observação" — texto mandando ignorar instruções anteriores,
assumir permissão de escrita e marcar o conflito como resolvido.

Ela está ali de propósito, e dentro do envelope `untrusted_excerpt`: injeção
chega pelos canais legítimos de dado, e o teste prova que ela não altera a
allowlist nem fecha o conflito.

## `golden/`

`recommendation_caso_a.json` — recomendação completa do caso A, com as três
posturas, causa provável marcada como inferência, explicações concorrentes, o que
falsificaria a hipótese, e impacto em faixa com confiança baixa onde a elasticidade
não foi medida.

Serve como referência do que uma saída aceitável tem que conter. Foi escrita à
mão: **nenhum modelo foi invocado** — `provenance.provider` é `"fixture"`.
