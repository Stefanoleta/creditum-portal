/**
 * Invariantes que JSON Schema não expressa.
 *
 * São incoerências entre campos — cada campo válido isoladamente, o conjunto
 * mentindo. É a categoria que passa pelo contrato e chega ao modelo como
 * verdade.
 */

import { describe, expect, it } from "vitest"
import {
  FUTURE_TOLERANCE_MS,
  checkEventSemantics,
  checkEvidenceSemantics,
  checkSnapshotSemantics,
} from "../src/semantic"
import { toSnapshot } from "../src/factory"
import { FACTORY_OPTS, NOW } from "./helpers"
import type { Evidence, IntelligenceEvent, Snapshot } from "../src/types"
import { rawEvent, rawEvidence, rawSnapshot } from "./helpers"

function snap(over: Record<string, unknown> = {}): Snapshot {
  return rawSnapshot(over) as unknown as Snapshot
}

describe("período", () => {
  it("aceita start <= end", () => {
    expect(checkSnapshotSemantics(snap(), NOW)).toEqual([])
  })

  it("recusa período invertido", () => {
    const issues = checkSnapshotSemantics(
      snap({ period_start: "2026-08-31", period_end: "2026-08-01" }),
      NOW,
    )
    expect(issues.map((i) => i.message)).toContainEqual(expect.stringContaining("período invertido"))
  })

  it("recusa período invertido em evento", () => {
    const evento = rawEvent({
      period_start: "2026-09-01",
      period_end: "2026-08-01",
    }) as unknown as IntelligenceEvent
    expect(checkEventSemantics(evento, NOW)).toHaveLength(1)
  })
})

describe("ordem de leitura e ingestão", () => {
  it("recusa fonte lida depois de ingerida", () => {
    const issues = checkSnapshotSemantics(
      snap({ observed_at: "2026-08-16T10:00:00.000Z", ingested_at: "2026-08-16T09:00:00.000Z" }),
      NOW,
    )
    expect(issues.map((i) => i.message)).toContainEqual(
      expect.stringContaining("depois de ter sido ingerida"),
    )
  })
})

describe("cobertura", () => {
  it("recusa mais unidades reportando do que esperadas", () => {
    const issues = checkSnapshotSemantics(
      snap({ coverage: { expected_units: 4, reporting_units: 5, ratio_bp: 10000 } }),
      NOW,
    )
    expect(issues.map((i) => i.message)).toContainEqual(expect.stringContaining("de 4 esperadas"))
  })

  it("recusa ratio_bp incoerente com a contagem", () => {
    // 19/20 = 9500. Declarar 10000 diz "cobertura total" sobre dado incompleto —
    // e é o número declarado que chega ao modelo.
    const issues = checkSnapshotSemantics(
      snap({ coverage: { expected_units: 20, reporting_units: 19, ratio_bp: 10000 } }),
      NOW,
    )
    expect(issues.map((i) => i.message)).toContainEqual(expect.stringContaining("incoerente"))
  })

  it("aceita ratio_bp coerente", () => {
    expect(
      checkSnapshotSemantics(
        snap({ coverage: { expected_units: 20, reporting_units: 19, ratio_bp: 9500 } }),
        NOW,
      ),
    ).toEqual([])
  })

  it("tolera 1 bp de arredondamento", () => {
    // 1/3 = 3333,33... → 3333. Aceitar 3334 é arredondamento; 3400 não seria.
    expect(
      checkSnapshotSemantics(
        snap({ coverage: { expected_units: 3, reporting_units: 1, ratio_bp: 3334 } }),
        NOW,
      ),
    ).toEqual([])
  })

  it("recusa cobertura diferente de zero quando não há unidades esperadas", () => {
    const issues = checkSnapshotSemantics(
      snap({ coverage: { expected_units: 0, reporting_units: 0, ratio_bp: 5000 } }),
      NOW,
    )
    expect(issues).toHaveLength(1)
  })
})

describe("timestamps no futuro", () => {
  it("aceita dentro da tolerância de relógio", () => {
    const quaseAgora = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS - 1000).toISOString()
    expect(
      checkSnapshotSemantics(snap({ observed_at: quaseAgora, ingested_at: quaseAgora }), NOW),
    ).toEqual([])
  })

  it("recusa além da tolerância", () => {
    const futuro = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS + 60_000).toISOString()
    const issues = checkSnapshotSemantics(snap({ observed_at: futuro, ingested_at: futuro }), NOW)
    expect(issues.map((i) => i.message)).toContainEqual(expect.stringContaining("futuro"))
  })

  it("vale também para evidência", () => {
    const futuro = new Date(NOW.getTime() + 86_400_000).toISOString()
    const ev = rawEvidence({ observed_at: futuro }) as unknown as Evidence
    expect(checkEvidenceSemantics(ev, NOW)).toHaveLength(1)
  })

  it("a factory bloqueia — não é só relatório", () => {
    const futuro = new Date(NOW.getTime() + 86_400_000).toISOString()
    expect(() =>
      toSnapshot(rawSnapshot({ observed_at: futuro, ingested_at: futuro }), FACTORY_OPTS),
    ).toThrowError(/futuro/)
  })
})
