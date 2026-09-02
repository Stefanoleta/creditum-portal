/**
 * Ponte para o motor determinístico do portal.
 *
 * Camada mínima e deliberadamente burra: **re-export puro**, nenhuma linha de
 * lógica. Existe por duas razões e nenhuma a mais:
 *
 *   1. deixar em UM lugar a lista do que a POC reutiliza — quem revisa vê o
 *      acoplamento inteiro num arquivo, em vez de caçar imports relativos;
 *   2. isolar o caminho `../../../src/lib/ceo/*`, para que uma eventual
 *      extração do motor para pacote versionado mude só este arquivo.
 *
 * O que este arquivo NÃO faz: reimplementar, adaptar ou "melhorar" qualquer
 * função. Soma de centavos, razão com denominador vazio, álgebra de `Metric<T>`
 * e cobertura têm exatamente uma implementação no repositório, e é a do motor —
 * com os 182 testes que a protegem.
 *
 * A importação direta só é possível porque a Fase 2.1a alinhou o motor a
 * `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` sem afrouxar o
 * tsconfig da POC.
 */

// ─── Aritmética exata ─────────────────────────────────────────────────────────
export { sumCents, multiplyCents, parseCount, parseDateISO, parseText, toComparableKey } from "../../../src/lib/ceo/parse"
export { CENTS_SANITY_CEILING } from "../../../src/lib/ceo/parse"

// Dinheiro e CPF vindos de célula de planilha. Acrescentados na Fase 2.11, para a
// fonte mensal do Lucas, e reexportados AQUI em vez de importados direto: este
// arquivo é o único ponto de acoplamento com `src/lib/ceo`, e um import relativo
// profundo em `integration/` reabriria a caça a acoplamento que ele existe para
// evitar.
//
// `parseBRLToCents` devolve `null` para ausente E para inválido — nunca `0`. É o
// que substitui o `Number("R$ 410,00") || 0` do workflow, que transforma um
// contrato de R$ 410 em R$ 0 e o soma ao ticket médio.
export { parseBRLToCents, parseCpf, isValidCpf } from "../../../src/lib/ceo/parse"
export type { CpfResult, CpfConfidence } from "../../../src/lib/ceo/parse"

// ─── Álgebra de métricas ──────────────────────────────────────────────────────
export {
  observed,
  calculated,
  inferred,
  gap,
  notAvailable,
  conflict,
  rulePending,
  isOk,
  mapMetric,
  unwrapOr,
  combine2,
  combine3,
  aggregate,
  sumMetrics,
  meanCents,
  ratio,
  aggregatedNumber,
  isPartial,
  STRICT,
  PARTIAL,
} from "../../../src/lib/ceo/data-class"

export type {
  Metric,
  MetricOk,
  MetricGap,
  DataClass,
  Gap,
  Provenance,
  Aggregated,
  AggregationPolicy,
  Coverage as EngineCoverage,
  Ratio,
} from "../../../src/lib/ceo/data-class"

// ─── Identidade de unidade e vendedor ─────────────────────────────────────────
export {
  canonicalSchoolKey,
  similarity,
  SUGGESTION_THRESHOLD,
  resolveSchool,
  isUnassignedToken,
  canonicalPersonKey,
  classifyRow,
} from "../../../src/lib/ceo/normalize"

export type { SchoolMatch, RowCheck, RowVerdict } from "../../../src/lib/ceo/normalize"

// ─── Identidade determinística de registro ────────────────────────────────────
export { stableContent, computeIdentity, findDuplicateContent } from "../../../src/lib/ceo/adapters/identity"
export type { RecordIdentity } from "../../../src/lib/ceo/adapters/identity"
