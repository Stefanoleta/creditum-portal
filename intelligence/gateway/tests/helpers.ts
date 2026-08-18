/**
 * Construtores de dado cru para teste.
 *
 * Devolvem `Record<string, unknown>` de propósito, não os tipos de domínio: o
 * store recebe dado externo e o valida. Um helper que já devolvesse `Snapshot`
 * estaria contornando exatamente a barreira que os testes precisam exercitar.
 */

/** Relógio fixo usado por toda a suíte. */
export const NOW = new Date("2026-08-16T15:00:00.000Z")
export const CLOCK = (): Date => NOW

export const FACTORY_OPTS = { now: NOW }

export function rawSnapshot(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    snapshot_id: "snap_teste",
    schema_version: "1.0.0",
    source_system: "google_sheets",
    dataset_id: "dataset-de-teste",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    observed_at: "2026-08-16T09:00:00.000Z",
    ingested_at: "2026-08-16T09:05:00.000Z",
    content_hash: "f".repeat(64),
    record_count: 1,
    rows_skipped: 0,
    coverage: { expected_units: 4, reporting_units: 4, ratio_bp: 10000 },
    quality_status: "ok",
    conflicts: [],
    missing_fields: [],
    evidence_refs: [],
    payload: { sales_count: 14 },
    ...over,
  }
}

export function rawEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: "evt_teste",
    event_type: "coverage_degraded",
    detector_id: "det.teste",
    detector_version: "1.0.0",
    snapshot_ids: ["snap_teste"],
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    detected_at: "2026-08-16T09:30:00.000Z",
    severity: "medium",
    materiality: { basis: "count", count: 1 },
    evidence_refs: ["ev_teste"],
    data_quality: { quality_status: "ok" },
    ...over,
  }
}

export function rawEvidence(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidence_id: "ev_teste",
    snapshot_id: "snap_teste",
    kind: "aggregate",
    locator: { dataset_id: "dataset-de-teste", sheet: "Vendas" },
    observed_at: "2026-08-16T09:00:00.000Z",
    ...over,
  }
}

/** Conjunto mínimo coerente: um snapshot, uma evidência dele, um evento sobre ele. */
export function rawTrio(): {
  snapshots: Record<string, unknown>[]
  events: Record<string, unknown>[]
  evidence: Record<string, unknown>[]
} {
  return {
    snapshots: [rawSnapshot({ evidence_refs: ["ev_teste"] })],
    events: [rawEvent()],
    evidence: [rawEvidence()],
  }
}
