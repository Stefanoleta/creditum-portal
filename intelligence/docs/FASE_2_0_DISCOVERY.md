# FASE 2.0 — Inventário do motor + design de D13

**Data:** 2026-08-16
**Escopo:** descoberta e design. **Nenhuma lógica de produção foi alterada.**
**Estado:** aguardando revisão arquitetural antes da Fase 2.1

> **Três bloqueios impedem implementar D13 como especificado.** Estão na seção 8,
> em formato `BLOCKED DECISION`. Não inventei nada para contorná-los.

---

## 1. REUSE INVENTORY

`src/lib/ceo/` — 2.720 linhas, 135 testes. **Pureza reconfirmada:** zero `next/`,
zero `@supabase`, zero `process.env`, zero alias `@/`, zero API de browser. Os
únicos imports externos são `node:crypto` e relativos. Importação relativa a
partir de `intelligence/` é viável sem puxar nada do Next.

### Reutilizar diretamente

| Símbolo | Módulo | Por quê |
|---|---|---|
| `parseBRLToCents`, `multiplyCents`, `sumCents` | `parse.ts` | Dinheiro em centavos inteiros com guarda de `isSafeInteger` e teto de sanidade. `sumCents` é o que a Fase 2 precisa em toda materialidade `amount_cents`. |
| `parsePercentToBps` | `parse.ts` | Basis points inteiros |
| `parseCount` | `parse.ts` | Contagens; zero é dado válido, vazio é `null` |
| `parseDateISO` | `parse.ts` | Valida calendário real (31/02 é recusado), aceita serial do Sheets, sem timezone implícito |
| `parseText`, `toComparableKey` | `parse.ts` | Remove zero-width, NBSP, espaço duplo; chave sem acento/caixa. **É a base de D13.** |
| `canonicalSchoolKey` | `normalize.ts` | Prefixo `Grau`, abreviação regular, acento, caixa → chave comparável |
| `similarity`, `SUGGESTION_THRESHOLD` | `normalize.ts` | Veto estrutural que separa `santos` de `santo amaro`. **É a base de `ambiguous`.** |
| `resolveSchool` | `normalize.ts` | Já devolve `canonical / alias / suggestion / new` — é quase exatamente o `CanonicalUnitResult` pedido |
| `Metric<T>`, `observed/calculated/inferred/forecast/gap` | `data-class.ts` | Invariantes de classe no discriminante |
| `ratio` | `data-class.ts` | `EMPTY_DENOMINATOR` explícito; bps por `Math.round(n/d × 10000)` |
| `meanCents` | `data-class.ts` | Média em centavos, arredondamento documentado |
| `aggregate`, `sumMetrics`, `Aggregated<T>`, `PARTIAL/STRICT` | `data-class.ts` | Modelo de cobertura de D10, com ramo incompleto que não chama seu conteúdo de `value` |
| `combine2`, `combine3` | `data-class.ts` | Combinação estrita com propagação de classe e procedência |
| `stableContent`, `computeIdentity` | `adapters/identity.ts` | sha256 determinístico — **é o padrão para os IDs determinísticos do §14** |
| `classifyRow` | `normalize.ts` | `material / blank / orphan_material` para o plano de ingestão |
| `isUnassignedToken`, `canonicalPersonKey` | `normalize.ts` | Sentinela `Ninguém` fora de ranking e denominador |

**Descoberta que vale registrar:** `data-class.ts` já implementa `oldestAsOf` —
*"a métrica é tão fresca quanto sua fonte mais velha"*. É exatamente a regra que
o gateway da POC implementou de forma independente na Fase 1.1. As duas camadas
concordam sem terem sido coordenadas.

### Adaptar sem duplicar

| O quê | Adaptação necessária |
|---|---|
| `Metric.confidence` | Motor usa `number` 0..1; contrato usa `confidence_bp` inteiro 0..10000. Ponte de uma linha: `Math.round(c * 10000)`. Não reimplementar confiança. |
| `DataClass` | Motor tem 4 classes e representa lacuna como `ok: false`. Contrato tem 5 (`gap` é classe). Ponte: `!m.ok` → `data_class: "gap"` + `gap_reason` do `Gap`. Os enums de `Gap` são **idênticos** nos dois lados. |
| `Coverage` do motor | `{observed, expected, missing[]}` vs contrato `{expected_units, reporting_units, ratio_bp}`. Ponte de projeção, não nova álgebra. |
| `resolveSchool` | Devolve `SchoolMatch` com `kind: "new"`. D13 exige que desconhecido **não** vire unidade nova automaticamente — o mapeamento é `new` → `unknown`, e `suggestion` → `ambiguous`. Adaptar o consumo, não a função. |
| `Provenance` | `{sources?, asOf?}` é mais pobre que `evidence_refs` + locator. A evidência da POC é camada adicional, não substituição. |

### Não serve para a Fase 2

| O quê | Por quê |
|---|---|
| `parseCpf`, `isValidCpf`, `CpfResult` | Pertence à ingestão/pseudonimização. O plano de consulta nunca vê CPF. |
| `formatCentsBRL`, `formatBpsPercent` | Formatação de UI. Detector emite inteiro, não string formatada. |
| `adapters/types.ts` (`DataSourceAdapter`, `TabMapping`…) | Contrato de leitura de fonte — insumo do **plano** de ingestão (§19), não dos detectores. |
| `forecast()` / `Forecast` | Existe e funciona, mas exige `modelVersion` e faixa coerente. **Não há modelo aprovado** para projetar inadimplência (ver bloqueio B3). |

### Funcionalidade faltante — a construir na Fase 2

1. **Catálogo canônico de unidades** — não existe como dado governado (bloqueio B1)
2. **Agregado contrafactual** (`com item` / `sem item` / `delta` / `delta_bp`) — §9.1
3. **Janelas de data** (mês calendário, próximos N dias) com timezone explícito — §8.2
4. **Política de severidade** centralizada — §10
5. **Helpers de materialidade** sobre os quatro `basis` do contrato — §11
6. **Ponte `Metric<T>` → `event.schema.json`** com evidência `computed` + fórmula
7. **Config validada fail-closed** dos quatro detectores — §22

**Nenhum item acima duplica código existente.** Os itens 2–6 são composição sobre
as primitives do motor.

---

## 2. Unidades canônicas encontradas no projeto

Existem **três fontes**, e elas não concordam.

### Fonte 1 — `supabase/migrations/20260611_unidades.sql` (aplicada)

Tabela `public.unidades`, 27 unidades ativas do Grau Técnico:

```
São João de Meriti · Carpina · Parnamirim · Divinópolis · Joinville
São José do Rio Preto · Alecrim · Duque de Caxias · São Gonçalo · Sumaré
Santos · Rio Centro · Limoeiro · Maracanau · Zona Norte · BelfordRoxo
Bezerra · Fortaleza · Guarulhos · Jardim Angela · João Pessoa · Limeira
Madureira · Mogi das Cruzes · Presidente P. · Santa Cruz · Santo Amaro
```

### Fonte 2 — `ceo.schools` + `ceo.school_aliases` (schema `ceo`)

Tabelas criadas em `20260813_ceo_schema.sql`. **Nenhum INSERT em nenhuma
migration — estão vazias.** É onde D13 diz que os nomes canônicos deveriam viver.

### Fonte 3 — a planilha real, via `docs/BRIEFING.md` §3.5

Formas observadas: `Grau Sumaré`/`Grau Sumare`, `Grau Alecrim`/`Grau alecrim`,
**`Grau Marabá`/`Grau Maraba`**, `Grau Santos` **e** `Grau Santo Amaro`,
`Limeira`/`Limoeiro`. A aba financeira não usa o prefixo `Grau`.

---

## 3. Aliases existentes

Apenas **dois**, e só na decisão D13 e na memória do projeto — nunca gravados:

| Planilha escreve | Nome canônico | Origem |
|---|---|---|
| `Rio Preto` | São José do Rio Preto | CEO confirmou |
| `Mogi` / `Grau Mogi` | Mogi das Cruzes | CEO confirmou |

D13 é explícito sobre o resto: *"as demais unidades da base ainda não tiveram
nome canônico confirmado. Assumir o nome completo sem confirmar já me custou dois
erros."*

Abreviações **regulares** que já são regra em código (`normalize.ts`), e que
**não** precisam de alias: `sta→santa`, `sto→santo`, `jd→jardim`, `zn→zona`,
`pres→presidente`, `gov→governador`, `vl→vila`, `pq→parque`.

---

## 4. Proposta de `UnitId`

Derivada de `public.unidades` — a única lista concreta que existe. Formato:
`toComparableKey` + espaço → `_`.

```ts
type UnitId =
  | "sao_joao_de_meriti" | "carpina"       | "parnamirim"   | "divinopolis"
  | "joinville"          | "sao_jose_do_rio_preto"          | "alecrim"
  | "duque_de_caxias"    | "sao_goncalo"   | "sumare"       | "santos"
  | "rio_centro"         | "limoeiro"      | "maracanau"    | "zona_norte"
  | "belford_roxo"       | "bezerra"       | "fortaleza"    | "guarulhos"
  | "jardim_angela"      | "joao_pessoa"   | "limeira"      | "madureira"
  | "mogi_das_cruzes"    | "presidente_p"  | "santa_cruz"   | "santo_amaro"
```

**Não proponho adotar esta lista como está** — quatro entradas não são nomes
canônicos e uma unidade real está faltando. Ver bloqueio B1.

Catálogo como dado versionado, não literal espalhado:

```ts
interface CanonicalUnit {
  readonly unit_id: UnitId
  readonly display_name: string      // do catálogo, nunca da fonte
  readonly aliases: readonly string[] // chaves comparáveis aprovadas
  readonly active: boolean
}
```

---

## 5. Regra `matched / unknown / ambiguous`

Composição sobre `resolveSchool`, sem reimplementar similaridade:

```
raw
 └─ toComparableKey            (acento, caixa, zero-width, NBSP, espaço duplo)
 └─ canonicalSchoolKey         (prefixo "Grau", abreviação regular)
      ├─ chave ∈ aliases do catálogo        → matched
      ├─ chave ∈ ids canônicos              → matched
      ├─ similarity ≥ 0,80 com ≥ 1 candidato → ambiguous  (candidates[])
      └─ nenhum candidato                    → unknown
```

```ts
type CanonicalUnitResult =
  | { status: "matched";   unit_id: UnitId; display_name: string }
  | { status: "unknown";   raw_fingerprint: string }
  | { status: "ambiguous"; candidates: readonly UnitId[]; raw_fingerprint: string }
```

`raw_fingerprint` = `sha256(chave comparável)` truncado, via `stableContent` de
`adapters/identity.ts`. **O `raw` nunca sai** — é o que fecha R1: o fingerprint
permite ao humano rastrear na auditoria e não carrega nome nenhum ao modelo.

**Contaminação de qualidade (§5.4):**

| Situação | Efeito |
|---|---|
| `unknown` | `quality_status: degraded`, unidade entra em `missing_unit_ids` como não resolvida, candidata a `coverage_degraded` |
| `ambiguous` | `quality_status: conflicted`, candidata a `data_quality_conflict` — é divergência de identidade, e o sistema não escolhe |

Desconhecido **não** cria unidade. Ambíguo **não** é resolvido. `resolveSchool`
já se recusa a fundir; o mapeamento apenas honra isso.

---

## 6. Alteração de schema proposta para fechar R1

Mudança **incompatível** → `schema_version` **2.0.0**, com teste que rejeita o
formato 1.x nos campos afetados.

| Contrato | Hoje (texto livre) | Proposta |
|---|---|---|
| `snapshot.coverage.missing_units[]` | `unit_name` (pattern de letras) | `missing_unit_ids[]` — enum `UnitId` |
| `snapshot.payload.unit_breakdown` | chaves = nome livre | chaves = `UnitId` (`propertyNames` enum) |
| `event.contributing_case.unit` | string livre | `unit_id` + `unit_display_name` opcional, do catálogo |

Consequência direta: **`unit_breakdown` volta ao caminho `to_model`** e sai da
`MODEL_EGRESS_DENYLIST`, porque a chave deixa de ser texto de fonte. É a condição
que o GATE D13 exige.

Fixtures e testes acompanham a mudança. Nada vira `Record<string, unknown>`.

---

## 7. Configuração proposta dos quatro detectores

```ts
interface DetectorConfig {
  installmentConcentration: {
    installment_threshold: number        // A1
    minimum_sample_size: number          // A2
    material_share_bp: number            // A3
    contributing_case_rule: ContributingCaseRule  // A4
    severity: SeverityBands              // A5
  }
  crossSourceConflict: {
    material_absolute_count: number      // B1
    material_share_bp: number            // B2
    material_amount_cents: number        // B3
    structural_fields: readonly string[] // B4
    severity: SeverityBands
  }
  firstDueConcentration: {
    window: "calendar_month" | "next_n_days"   // C1
    window_days?: number
    timezone: string                     // C2
    material_share_bp: number            // C3
    severity: SeverityBands
  }
  materialSingleCase: {
    min_delta_bp: number                 // D1
    min_share_of_total_bp: number        // D2
    min_population_after_removal: number // D3
    severity: SeverityBands
  }
  coverage: {
    degraded_below_bp: number            // E1
    emit_event_below_bp: number          // E2
  }
}
```

Config inválida → `fail closed`, mesmo padrão de `validateAllowlistConfig`.

---

## 8. Thresholds: o que tem lastro e o que não tem

### Com lastro no projeto

| Threshold | Valor | Origem |
|---|---|---|
| `installment_threshold` | **19** | Briefing do Bloco 1, §14 Caso A: *"contratos com mais de 19 parcelas"* |
| Limiar de similaridade | **0,80** | `SUGGESTION_THRESHOLD`, calibrado contra `alecrim/alecrin` (0,86) e `limeira/limoeiro` (0,75) |
| Dinheiro / percentual | centavos inteiros / basis points | D11, `parse.ts` |
| Cobertura parcial não apaga o todo | — | D10 |
| Timezone da operação | — | **não encontrei** regra de timezone no projeto — ver C2 abaixo |

### SEM lastro — exigem decisão do arquiteto

Nenhum destes existe em decisão, migration, código ou documento. **Os valores que
aparecem hoje nas fixtures da POC fui eu que escolhi na Fase 1, para exercitar os
contratos — não são regra de negócio e não devem ser promovidos a threshold.**

| # | Threshold | Valor na fixture (inventado por mim) | O que precisa ser decidido |
|---|---|---|---|
| A2 | `minimum_sample_size` | — | Abaixo de quantos contratos o evento não é emitido? |
| A3 | `material_share_bp` | 5208 bp apareceu como *resultado*, não como limiar | A partir de que participação a concentração é material? |
| A4 | Regra de caso contribuinte | 3 casos | Top N? Até X% do evento? Participação mínima individual? |
| A5/B/C/D | Bandas de severidade | `high`, `critical`, `medium` escolhidos à mão | Qual regra produz cada banda? |
| A-ref | Baseline de parcelamento | `2800 bp` como "referência" | **Inventado.** De onde vem o baseline: período anterior, meta, histórico? |
| B1–B4 | Materialidade de conflito | `critical` para 6 vendas divergentes | Diferença absoluta, relativa, financeira ou campo estrutural? |
| C1 | Janela de primeiro vencimento | "setembro" (mês seguinte) | Mês calendário ou próximos N dias? |
| C2 | Timezone | ausente | `America/Sao_Paulo` é o óbvio, mas não achei a regra escrita |
| C3 | Concentração material | 7500 bp apareceu como resultado | A partir de quanto concentrar é alerta? |
| D1–D3 | Caso individual material | delta de R$ 5.467,29 → R$ 5.922,90 | Que delta torna um caso material? |
| E1/E2 | Cobertura | 9500 bp nas fixtures | Abaixo de quanto degrada? Abaixo de quanto emite evento? |

---

## 9. BLOCKED DECISIONS

### B1 — O catálogo canônico de unidades não existe em estado utilizável

**Fato observado.** Existem 27 unidades em `public.unidades`, mas: (a) `ceo.schools`
e `ceo.school_aliases` — as tabelas que D13 designa como fonte canônica — estão
**vazias**, sem nenhum INSERT em nenhuma migration; (b) quatro entradas da lista
não são nomes canônicos: `Presidente P.` (abreviado), `BelfordRoxo` (sem espaço),
`Maracanau` (sem acento), `Jardim Angela` (sem acento); (c) **`Grau Marabá`
aparece na planilha real** (`BRIEFING.md` §3.5) e **não está na lista de 27**;
(d) D13 registra explicitamente que as demais unidades não tiveram nome canônico
confirmado pelo CEO.

**Impacto.** D13 é o gate bloqueante da Fase 3. Sem catálogo confiável, `UnitId`
seria um enum que eu inventei — exatamente o erro que D13 foi escrita para
impedir, e que já custou duas correções.

**Opções.**
1. CEO confirma a lista canônica completa (nomes + aliases), incluindo Marabá e
   os quatro nomes truncados. Vira migration de seed em `ceo.schools`/`school_aliases`.
2. Adotar `public.unidades` como está e tratar `Marabá` como `unknown`. Barato,
   mas grava quatro nomes errados no catálogo e degrada qualidade de toda unidade
   que a planilha escrever por extenso.
3. Catálogo mínimo só com as unidades que aparecem nas fixtures e nas duas
   confirmações do CEO. Fecha R1 para o conjunto de teste e adia o resto.

**Recomendação do engenheiro.** Opção 1. É a única que fecha R1 de verdade, e o
custo é uma conferência de lista — não engenharia. As opções 2 e 3 empurram para
a Fase 3 um catálogo que o gate D13 exige íntegro.

**Decisão necessária do arquiteto/CEO.** Confirmar os 27+1 nomes canônicos e seus
aliases, ou escolher 2 ou 3 assumindo o resíduo.

---

### B2 — `expected_units` das fixtures não bate com o catálogo

**Fato observado.** As três fixtures de snapshot declaram `expected_units: 20`. A
tabela tem **27** unidades ativas. O número 20 fui eu que escolhi na Fase 1.

**Impacto.** `coverage.ratio_bp` é insumo de qualidade em todos os quatro
detectores e do evento `coverage_degraded`. Denominador errado propaga para tudo.

**Opções.**
1. `expected_units` = unidades ativas do catálogo no período (27 hoje).
2. `expected_units` = unidades que a operação espera que reportem no período, que
   pode ser menor que o total ativo.
3. Derivar do próprio snapshot (unidades distintas observadas) — **não recomendo**:
   torna a cobertura auto-referente e sempre 100%.

**Recomendação do engenheiro.** Opção 2, com o conjunto esperado explícito no
snapshot. "Ativa no cadastro" e "esperada para reportar neste mês" são coisas
diferentes, e é a segunda que a cobertura mede.

**Decisão necessária do arquiteto.** Qual das duas definições, e de onde sai a
lista de esperadas.

---

### B3 — A fixture do Caso C pressupõe projeção que os dados não sustentam

**Fato observado.** `evt_c_primeiro_vencimento.json` carrega
`reference_metric: inadimplencia_projetada_primeira_parcela` como `forecast`,
faixa 800–1600 bp, confiança 4500 bp. **Eu inventei esses números na Fase 1.**
Não existe modelo de inadimplência determinístico aprovado no projeto, e §8.1
proíbe o detector de inventar inadimplência, probabilidade de default ou
elasticidade.

**Impacto.** Manter a fixture obriga o detector C a produzir falsa precisão. É o
oposto do que o sistema existe para fazer.

**Opções.**
1. Corrigir a fixture: a referência vira `gap` com `DATA_NOT_AVAILABLE`. O
   detector emite distribuição, contagem por janela e exposição financeira
   conhecida — que são fatos — e declara a projeção como ausente.
2. Definir modelo determinístico de projeção com lastro (ex.: inadimplência
   histórica por safra), o que exige dado histórico que não temos na POC.

**Recomendação do engenheiro.** Opção 1, e documentar. §8.1 já diz *"não criar
falsa precisão para manter fixture antiga"* — esta é exatamente essa fixture.

**Decisão necessária do arquiteto.** Autorizar a correção da fixture dourada.

---

## 10. O que não fiz, de propósito

- Não implementei nenhum detector
- Não criei `UnitId` como código — depende de B1
- Não alterei nenhum contrato — depende de B1 e B2
- Não escolhi nenhum threshold da tabela §8 sem lastro
- Não corrigi a fixture do Caso C — depende de B3
- Não movi, copiei nem alterei nada em `src/lib/ceo/`

Único arquivo criado: este relatório.

## 11. Verificação

Nada de produção mudou. Rodado para provar que nada quebrou por acidente:

| | Resultado |
|---|---|
| POC `npm run verify` | contratos ✓ · lint ✓ · typecheck ✓ · **257 testes** |
| Portal `npx tsc --noEmit` | exit 0 |
| Portal `npx vitest run` | **182 testes** |

## 12. Próximo passo

Aguardo decisão sobre **B1, B2 e B3** e aprovação dos thresholds da §8. Com isso,
sigo a ordem do §29 a partir de 2.1 (primitives + config), depois 2.2 (D13).
