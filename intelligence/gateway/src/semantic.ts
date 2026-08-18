/**
 * Validações que JSON Schema não expressa.
 *
 * JSON Schema valida cada campo isoladamente. Ele não sabe dizer que
 * `period_start` precisa vir antes de `period_end`, que a cobertura declarada
 * precisa bater com a contagem de unidades, ou que um dado "observado" no futuro
 * é sinal de pipeline quebrado — não de dado fresquíssimo.
 *
 * Estas são exatamente as inconsistências que passam pelo contrato e chegam ao
 * modelo como se fossem verdade.
 */

import type { Evidence, IntelligenceEvent, Snapshot } from "./types"

export interface SemanticIssue {
  readonly path: string
  readonly message: string
}

/**
 * Tolerância para relógio adiantado.
 *
 * Cinco minutos cobre desvio de NTP entre máquinas. Além disso não é desvio de
 * relógio — é dado com timestamp errado, e tratar isso como "fresco" faria o
 * `data_age_hours` mentir para quem decide.
 */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/** Rounding de meio para cima, como o resto do sistema faz com basis points. */
function expectedRatioBp(reporting: number, expected: number): number {
  return Math.round((reporting / expected) * 10000)
}

function parseInstant(value: string, path: string, out: SemanticIssue[]): number | null {
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) {
    out.push({ path, message: `timestamp não parseável: ${value}` })
    return null
  }
  return t
}

function checkNotFuture(
  value: string,
  path: string,
  now: Date,
  out: SemanticIssue[],
): void {
  const t = parseInstant(value, path, out)
  if (t === null) return
  if (t > now.getTime() + FUTURE_TOLERANCE_MS) {
    out.push({
      path,
      message: `timestamp no futuro além da tolerância de ${FUTURE_TOLERANCE_MS / 60000} min`,
    })
  }
}

export function checkSnapshotSemantics(snapshot: Snapshot, now: Date): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const id = snapshot.snapshot_id

  const start = parseInstant(snapshot.period_start, `${id}.period_start`, issues)
  const end = parseInstant(snapshot.period_end, `${id}.period_end`, issues)
  if (start !== null && end !== null && start > end) {
    issues.push({
      path: `${id}.period_start`,
      message: `período invertido: ${snapshot.period_start} > ${snapshot.period_end}`,
    })
  }

  const observed = parseInstant(snapshot.observed_at, `${id}.observed_at`, issues)
  const ingested = parseInstant(snapshot.ingested_at, `${id}.ingested_at`, issues)
  if (observed !== null && ingested !== null && observed > ingested) {
    issues.push({
      path: `${id}.observed_at`,
      message: "fonte não pode ter sido lida depois de ter sido ingerida",
    })
  }

  checkNotFuture(snapshot.observed_at, `${id}.observed_at`, now, issues)
  checkNotFuture(snapshot.ingested_at, `${id}.ingested_at`, now, issues)

  const { expected_units, reporting_units, ratio_bp } = snapshot.coverage
  if (reporting_units > expected_units) {
    issues.push({
      path: `${id}.coverage`,
      message: `reportaram ${reporting_units} unidades de ${expected_units} esperadas`,
    })
  }

  if (expected_units > 0) {
    const esperado = expectedRatioBp(reporting_units, expected_units)
    // ±1 bp absorve o arredondamento; mais que isso é cobertura declarada que
    // não corresponde à contagem, e é o número declarado que vai ao modelo.
    if (Math.abs(esperado - ratio_bp) > 1) {
      issues.push({
        path: `${id}.coverage.ratio_bp`,
        message: `ratio_bp ${ratio_bp} incoerente com ${reporting_units}/${expected_units} (esperado ~${esperado})`,
      })
    }
  } else if (ratio_bp !== 0) {
    issues.push({
      path: `${id}.coverage.ratio_bp`,
      message: "sem unidades esperadas, a cobertura não pode ser diferente de zero",
    })
  }

  return issues
}

export function checkEventSemantics(event: IntelligenceEvent, now: Date): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const id = event.event_id

  const start = parseInstant(event.period_start, `${id}.period_start`, issues)
  const end = parseInstant(event.period_end, `${id}.period_end`, issues)
  if (start !== null && end !== null && start > end) {
    issues.push({
      path: `${id}.period_start`,
      message: `período invertido: ${event.period_start} > ${event.period_end}`,
    })
  }

  checkNotFuture(event.detected_at, `${id}.detected_at`, now, issues)

  return issues
}

export function checkEvidenceSemantics(evidence: Evidence, now: Date): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  checkNotFuture(evidence.observed_at, `${evidence.evidence_id}.observed_at`, now, issues)
  return issues
}
