/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  CONFIGURAÇÃO SINTÉTICA — NÃO É POLÍTICA DA CREDITUM                      │
 * │                                                                           │
 * │  Os números aqui existem para exercitar limites em teste. NENHUM deles foi │
 * │  aprovado pelo CEO ou pelo arquiteto, e nenhum tem lastro no projeto —     │
 * │  exceto `installment_threshold` e `similarity_threshold_bp`, que vêm de    │
 * │  `APPROVED_THRESHOLDS`.                                                    │
 * │                                                                           │
 * │  Este arquivo vive em `tests/`, fora de `src/`, justamente para que código │
 * │  de produção não consiga importá-lo por engano.                            │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import { APPROVED_THRESHOLDS, BUSINESS_TIMEZONE } from "../src/config"
import type { DetectorConfig, SeverityScale } from "../src/config"
import type { CanonicalUnit, UnitCatalog, UnitNormalizerPort } from "../src/canonical-units"

const ESCALA_SINTETICA: SeverityScale = [
  { at_least: 0, severity: "info" },
  { at_least: 1000, severity: "low" },
  { at_least: 2500, severity: "medium" },
  { at_least: 5000, severity: "high" },
  { at_least: 7500, severity: "critical" },
]

/** Sintética. Ver aviso no topo do arquivo. */
export const TEST_CONFIG: DetectorConfig = {
  config_version: "0.0.0",
  businessTimezone: BUSINESS_TIMEZONE,
  similarity_threshold_bp: APPROVED_THRESHOLDS.similarity_threshold_bp,
  installmentConcentration: {
    installment_threshold: APPROVED_THRESHOLDS.installment_threshold,
    minimum_sample_size: 4,
    material_count_above: 3,
    material_share_count_bp: 3000,
    material_share_amount_bp: 4000,
    material_amount_cents: 1_000_000,
    contributing_case_rule: { mode: "top_n", n: 3 },
    severity_dimension: "share_count_bp",
    severity_scale: ESCALA_SINTETICA,
    minimum_coverage_bp: 9000,
  },
  crossSourceConflict: {
    material_absolute_count: 3,
    material_amount_cents: 100_000,
    material_absolute_basis_points: 1500,
    material_relative_difference_bp: 4000,
    material_share_bp: 2000,
    structural_fields: ["sales_count", "sale_date"],
    structural_severity: "high",
    severity_by_relative_bp: ESCALA_SINTETICA,
  },
  firstDueConcentration: {
    window: { mode: "same_day" },
    material_count: 5,
    material_share_count_bp: 3000,
    material_amount_cents: 500_000,
    material_share_amount_bp: 3000,
    severity_dimension: "share_count_bp",
    severity_scale: ESCALA_SINTETICA,
    minimum_sample_size: 3,
  },
  materialSingleCase: {
    supported_metrics: ["amount_sum_cents", "amount_mean_cents", "case_count"],
    min_population_after_removal: 2,
    material_absolute_delta_cents: 200_000,
    material_count_delta: 1,
    material_relative_delta_bp: 2000,
    material_share_of_total_bp: 1000,
    severity_dimension: "share_of_total_bp",
    severity_scale: ESCALA_SINTETICA,
  },
  coverage: {
    degraded_below_bp: 9500,
    emit_event_below_bp: 8000,
  },
}

export { ESCALA_SINTETICA }

// Escapes, nunca o caractere literal: zero-width é invisível no editor e um
// `git diff` inocente pode apagá-lo sem ninguém notar. Mesma razão documentada
// em `src/lib/ceo/parse.ts`.
const ZERO_WIDTH = new RegExp("\\u200B|\\u200C|\\u200D|\\uFEFF", "gu")
const NBSP = new RegExp("\\u00A0", "gu")
const DIACRITICOS = new RegExp("[\\u0300-\\u036F]", "gu")

/**
 * Normalizador de TESTE.
 *
 * Mínimo deliberado: acento, caixa, espaço, prefixo `grau`. **Não** é a
 * implementação de produção — essa é `canonicalSchoolKey`/`similarity` de
 * `src/lib/ceo/normalize.ts`, cuja fiação está bloqueada (ver relatório da
 * Fase 2.1). O motor recebe a porta justamente para não depender de qual das
 * duas está do outro lado.
 */
export const TEST_NORMALIZER: UnitNormalizerPort = {
  comparableKey(raw: unknown): string | null {
    // Só string e número entram. Um objeto viraria "[object Object]" e
    // produziria chave sem significado que ainda assim pareceria válida.
    if (typeof raw !== "string" && typeof raw !== "number") return null

    const s = String(raw)
      .replace(ZERO_WIDTH, "")
      .replace(NBSP, " ")
      .normalize("NFD")
      .replace(DIACRITICOS, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()

    if (!s) return null
    const tokens = s.split(" ").filter(Boolean)
    if (tokens.length === 0) return null
    const semPrefixo = tokens.length > 1 && tokens[0] === "grau" ? tokens.slice(1) : tokens
    return semPrefixo.join(" ")
  },

  similarity(a: string, b: string): number {
    if (!a || !b) return 0
    if (a === b) return 1
    const ta = a.split(" ").filter(Boolean)
    const tb = b.split(" ").filter(Boolean)
    const sa = new Set(ta)
    let comuns = 0
    for (const t of new Set(tb)) if (sa.has(t)) comuns++
    // Mesmo veto estrutural de D12: contagem de palavras diferente e nenhuma
    // palavra em comum são lugares diferentes.
    if (comuns === 0 && ta.length !== tb.length) return 0
    const maior = Math.max(a.length, b.length)
    return maior === 0 ? 0 : 1 - levenshtein(a, b) / maior
  },
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + custo)
    }
    const troca = prev
    prev = curr
    curr = troca
  }
  return prev[b.length] ?? 0
}

/**
 * Catálogo de TESTE — subconjunto pequeno, escolhido para exercitar o motor.
 *
 * **Não é o catálogo canônico da Creditum.** Aquele depende da validação em
 * `docs/D13_CATALOG_VALIDATION.md` e da decisão do CEO (bloqueio B1).
 * As unidades abaixo cobrem os casos difíceis reais: `santos` vs `santo amaro`
 * (armadilha de fusão) e `alecrim` (erro de digitação).
 */
export function testCatalog(overrides: readonly CanonicalUnit[] = []): UnitCatalog {
  return {
    catalog_version: "0.0.0",
    units: [
      { unit_id: "sumare", display_name: "Sumaré", aliases: ["Grau Sumaré"], active: true },
      { unit_id: "santos", display_name: "Santos", aliases: [], active: true },
      { unit_id: "santo_amaro", display_name: "Santo Amaro", aliases: [], active: true },
      { unit_id: "alecrim", display_name: "Alecrim", aliases: [], active: true },
      {
        unit_id: "mogi_das_cruzes",
        display_name: "Mogi das Cruzes",
        aliases: ["Mogi", "Grau Mogi"],
        active: true,
      },
      { unit_id: "limeira", display_name: "Limeira", aliases: [], active: false },
      ...overrides,
    ],
  }
}
