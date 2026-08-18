/**
 * Regra de ticket baixo — piso APROVADO de R$ 1.499,99.
 *
 * Diferente de A/B/C/D: aqui o número É política aprovada, não `TEST_CONFIG`
 * sintética. `149_999` centavos vem da aprovação da Fase 2.6b, e a comparação é
 * estritamente menor.
 */

import { describe, expect, it } from "vitest"
import {
  FORMULA_LOW_TICKET,
  LOW_TICKET_FLOOR_CENTS,
  detectLowTicketContracts,
  isLowTicket,
} from "../src/low-ticket"
import type { LowTicketInput, TicketRecord } from "../src/low-ticket"
import { LOW_TICKET_SEVERITY } from "../src/low-ticket"
import { CREDITUM_POLICY_V1 } from "../src/production-policy"
import { APPROVED_THRESHOLDS } from "../src/config"
import { isOk } from "../src/engine"
import { GatewayError } from "../../gateway/src/errors"
import type { CanonicalUnitResult } from "../src/canonical-units"
import type { Evidence, Snapshot } from "../../gateway/src/types"
import { rawEvidence, rawSnapshot } from "../../gateway/tests/helpers"

const DETECTED_AT = "2026-08-16T09:05:00.000Z"

const snapshots = [
  rawSnapshot({ snapshot_id: "snap_vendas", source_system: "google_sheets", dataset_id: "ds_vendas" }),
] as unknown as Snapshot[]

const evidence = [
  rawEvidence({
    evidence_id: "ev_linha",
    snapshot_id: "snap_vendas",
    kind: "row",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "a".repeat(64) },
  }),
] as unknown as Evidence[]

const MATCHED: CanonicalUnitResult = {
  status: "matched",
  unit_id: "mogi_das_cruzes",
  display_name: "Mogi das Cruzes",
}
const UNKNOWN: CanonicalUnitResult = { status: "unknown", raw_fingerprint: "u".repeat(16) }
const AMBIGUO: CanonicalUnitResult = {
  status: "ambiguous",
  candidates: ["carpina", "limoeiro"],
  raw_fingerprint: "g".repeat(16),
  reason: "GROUP_LABEL",
}

let seq = 0
const subjectRef = (): string => {
  seq += 1
  return `subj_${seq.toString(16).padStart(16, "0")}`
}

function contrato(
  ticket_cents: number | null,
  unit: CanonicalUnitResult = MATCHED,
): TicketRecord {
  return {
    subject_ref: subjectRef(),
    unit,
    ticket_cents,
    evidence_refs: ["ev_linha"],
    snapshot_id: "snap_vendas",
  }
}

const entrada = (
  contracts: readonly TicketRecord[],
  extra: Partial<LowTicketInput> = {},
): LowTicketInput => ({
  detected_at: DETECTED_AT,
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  contracts,
  snapshots,
  evidence,
  ...extra,
})

const detectar = (
  contracts: readonly TicketRecord[],
  extra: Partial<LowTicketInput> = {},
): ReturnType<typeof detectLowTicketContracts> =>
  detectLowTicketContracts(entrada(contracts, extra))

// ═════════════════════════════════════════════════════════════════════════════

describe("o piso é R$ 1.499,99 e a comparação é ESTRITAMENTE menor", () => {
  it("o piso aprovado é 149_999 centavos", () => {
    expect(LOW_TICKET_FLOOR_CENTS).toBe(149_999)
    expect(APPROVED_THRESHOLDS.low_ticket_floor_cents).toBe(149_999)
  })

  // ── A / B / C ──
  it("A — 149_998 alerta", () => {
    expect(isLowTicket(149_998)).toBe(true)
    expect(detectar([contrato(149_998)]).summary.below_floor).toBe(1)
  })

  it("B — 149_999 NÃO alerta", () => {
    expect(isLowTicket(149_999)).toBe(false)
    expect(detectar([contrato(149_999)]).summary.below_floor).toBe(0)
  })

  it("C — 150_000 NÃO alerta", () => {
    expect(isLowTicket(150_000)).toBe(false)
    expect(detectar([contrato(150_000)]).summary.below_floor).toBe(0)
  })

  it("Q — exatamente R$ 1.499,99 não alerta", () => {
    const r = detectar([contrato(149_999)])
    expect(r.events).toHaveLength(0)
    expect(r.assessed[0]?.verdict).toBe("AT_OR_ABOVE_FLOOR")
  })

  it("boundary completo em volta do piso", () => {
    for (const [valor, esperado] of [
      [149_997, "BELOW_FLOOR"],
      [149_998, "BELOW_FLOOR"],
      [149_999, "AT_OR_ABOVE_FLOOR"],
      [150_000, "AT_OR_ABOVE_FLOOR"],
      [150_001, "AT_OR_ABOVE_FLOOR"],
    ] as const) {
      expect(detectar([contrato(valor)]).assessed[0]?.verdict, `${valor}`).toBe(esperado)
    }
  })

  it("cálculo e fórmula publicada leem a MESMA constante", () => {
    const match = /< (\d+)/.exec(FORMULA_LOW_TICKET)
    const publicado = Number(match?.[1])
    expect(publicado).toBe(LOW_TICKET_FLOOR_CENTS)
    expect(isLowTicket(publicado - 1)).toBe(true)
    expect(isLowTicket(publicado)).toBe(false)
  })
})

// ── P ──
describe("P — o piso de R$ 50 mil NÃO interfere no alerta de ticket baixo", () => {
  it("são políticas independentes, com valores diferentes", () => {
    expect(APPROVED_THRESHOLDS.material_amount_cents).toBe(5_000_000)
    expect(APPROVED_THRESHOLDS.low_ticket_floor_cents).toBe(149_999)
    expect(APPROVED_THRESHOLDS.material_amount_cents).not.toBe(
      APPROVED_THRESHOLDS.low_ticket_floor_cents,
    )
  })

  it("um contrato de R$ 40.000 NÃO é ticket baixo", () => {
    // Está abaixo dos R$ 50 mil de materialidade agregada e muito acima do piso
    // comercial. Se as duas políticas fossem trocadas, isto viraria alerta.
    const r = detectar([contrato(4_000_000)])
    expect(r.summary.below_floor).toBe(0)
    expect(r.events).toHaveLength(0)
  })

  it("um contrato de R$ 1.000 É ticket baixo, mesmo longe dos R$ 50 mil", () => {
    const r = detectar([contrato(100_000)])
    expect(r.summary.below_floor).toBe(1)
    expect(r.assessed[0]?.matched).toBe(true)
  })

  it("nenhum limiar de materialidade agregada aparece na saída", () => {
    const texto = JSON.stringify(detectar([contrato(100_000)]))
    expect(texto).not.toContain("5000000")
  })
})

// ── D / E / F ──
describe("D/E/F — dinheiro: ausente, inseguro e não positivo", () => {
  it("D — ticket ausente é LACUNA, nunca zero", () => {
    const r = detectar([contrato(null)])
    expect(r.assessed[0]?.verdict).toBe("TICKET_UNAVAILABLE")
    const t = r.assessed[0]?.ticket_cents
    expect(t !== undefined && isOk(t)).toBe(false)
    if (t !== undefined && !isOk(t)) expect(t.gap).toBe("DATA_NOT_AVAILABLE")
    // E não vira alerta: zero passaria pelo predicado, ausência não.
    expect(r.summary.below_floor).toBe(0)
    expect(r.events).toHaveLength(0)
  })

  it("D — a ausência é contada e degrada a qualidade", () => {
    const r = detectar([contrato(null), contrato(200_000)])
    expect(r.summary.ticket_unavailable).toBe(1)
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("E — inteiro inseguro falha fechado, sem número aproximado", () => {
    for (const ruim of [Number.MAX_SAFE_INTEGER + 2, 1499.99, NaN, Infinity]) {
      const r = detectar([contrato(ruim)])
      expect(r.assessed[0]?.verdict, `${ruim}`).toBe("INVALID_TICKET")
      expect(r.events, `${ruim}`).toHaveLength(0)
    }
  })

  it("E — float em centavos é recusado: dinheiro é inteiro", () => {
    const r = detectar([contrato(149_998.5)])
    expect(r.assessed[0]?.verdict).toBe("INVALID_TICKET")
  })

  describe("F — ticket não positivo NÃO é 'ticket baixo'", () => {
    /**
     * Lastro governado: `ceo.sales.ticket_cents` é coluna gerada de
     * `transfer_cents * installments_grau`, com `transfer_cents >= 0` e
     * `installments_grau > 0`. Zero é representável; negativo é impossível.
     * Nenhuma regra declara venda de valor zero como venda.
     */
    it("zero é INVALID_TICKET, não alerta comercial", () => {
      const r = detectar([contrato(0)])
      expect(r.assessed[0]?.verdict).toBe("INVALID_TICKET")
      expect(r.summary.below_floor).toBe(0)
      expect(r.events).toHaveLength(0)
    })

    it("negativo também", () => {
      const r = detectar([contrato(-500_000)])
      expect(r.assessed[0]?.verdict).toBe("INVALID_TICKET")
      expect(r.events).toHaveLength(0)
    })

    it("a lacuna declara regra de negócio PENDENTE, não dado ausente", () => {
      const t = detectar([contrato(0)]).assessed[0]?.ticket_cents
      expect(t !== undefined && isOk(t)).toBe(false)
      if (t !== undefined && !isOk(t)) expect(t.gap).toBe("BUSINESS_RULE_PENDING")
    })

    it("e o motivo é explícito e auditável", () => {
      const d = detectar([contrato(0)]).assessed[0]?.detail
      expect(d).toContain("não é 'ticket baixo'")
      expect(d).toContain("pendente")
    })

    it("contado separadamente de ausente", () => {
      const r = detectar([contrato(0), contrato(null), contrato(100_000)])
      expect(r.summary.invalid_ticket).toBe(1)
      expect(r.summary.ticket_unavailable).toBe(1)
      expect(r.summary.below_floor).toBe(1)
    })
  })
})

// ── G / H / I ──
describe("G/H/I — lastro falha fechado", () => {
  it("G — evidência pendurada", () => {
    const orfao: TicketRecord = { ...contrato(100_000), evidence_refs: ["ev_nada"] }
    expect(() => detectar([orfao])).toThrowError(/evidência inexistente/)
  })

  it("G — contrato sem nenhuma evidência", () => {
    const semLastro: TicketRecord = { ...contrato(100_000), evidence_refs: [] }
    expect(() => detectar([semLastro])).toThrowError(/sem evidência/)
  })

  it("H — evidência de outro snapshot", () => {
    const outro = rawSnapshot({
      snapshot_id: "snap_outro",
      source_system: "bitrix24",
      dataset_id: "ds_outro",
    }) as unknown as Snapshot
    const ev = rawEvidence({
      evidence_id: "ev_outro",
      snapshot_id: "snap_outro",
      kind: "row",
      locator: { dataset_id: "ds_outro", sheet: "V", row_key: "b".repeat(64) },
    }) as unknown as Evidence
    const c: TicketRecord = { ...contrato(100_000), evidence_refs: ["ev_outro"] }
    expect(() =>
      detectar([c], { snapshots: [...snapshots, outro], evidence: [...evidence, ev] }),
    ).toThrowError(/pertence ao snapshot/)
  })

  it("I — evidência localiza outro dataset", () => {
    const ev = rawEvidence({
      evidence_id: "ev_ds_errado",
      snapshot_id: "snap_vendas",
      kind: "row",
      locator: { dataset_id: "ds_nao_usado", sheet: "V", row_key: "c".repeat(64) },
    }) as unknown as Evidence
    const c: TicketRecord = { ...contrato(100_000), evidence_refs: ["ev_ds_errado"] }
    expect(() => detectar([c], { evidence: [...evidence, ev] })).toThrowError(/localiza o dataset/)
  })

  it("snapshot inexistente", () => {
    const c: TicketRecord = { ...contrato(100_000), snapshot_id: "snap_fantasma" }
    expect(() => detectar([c])).toThrowError(GatewayError)
  })

  it("subject_ref que não é pseudônimo", () => {
    const c: TicketRecord = { ...contrato(100_000), subject_ref: "Maria Silva" }
    expect(() => detectar([c])).toThrowError(/pseudônimo/)
  })
})

// ── J / K ──
describe("J/K — D13 e privacidade", () => {
  it("J — unidade unknown não inventa identidade", () => {
    const r = detectar([contrato(100_000, UNKNOWN)])
    expect(r.assessed[0]?.unit).toBeUndefined()
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("K — rótulo de agrupamento não escolhe um membro", () => {
    const r = detectar([contrato(100_000, AMBIGUO)])
    expect(r.assessed[0]?.unit).toBeUndefined()
    const texto = JSON.stringify(r)
    expect(texto).not.toContain("carpina")
    expect(texto).not.toContain("limoeiro")
  })

  it("K — e a qualidade vai a conflicted", () => {
    expect(detectar([contrato(100_000, AMBIGUO)]).summary.quality_status).toBe("conflicted")
  })

  it("unidade resolvida traz o display_name do CATÁLOGO", () => {
    expect(detectar([contrato(100_000)]).assessed[0]?.unit).toBe("Mogi das Cruzes")
  })

  it("o output só carrega pseudônimo", () => {
    const r = detectar([contrato(100_000)])
    const texto = JSON.stringify(r)
    expect(texto).not.toContain("Maria")
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
    expect(r.assessed[0]?.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
  })
})

describe("§22 — a severidade foi aprovada: o fato vira Event executivo", () => {
  // A Fase 2.6c terminou com este caminho bloqueado: o fato era detectado mas
  // nenhum Event saía, porque a severidade não era política aprovada. A Fase 2.7
  // aprovou `medium` para esta regra, e a emissão foi liberada — só ela.
  const r = detectar([contrato(100_000)])

  it("matched implica Event emitido", () => {
    expect(r.assessed[0]?.matched).toBe(true)
    expect(r.assessed[0]?.emitted).toBe(true)
    expect(r.events).toHaveLength(1)
  })

  it("a severidade é EXATAMENTE medium", () => {
    expect(r.events[0]?.severity).toBe("medium")
    expect(LOW_TICKET_SEVERITY).toBe("medium")
  })

  it("`SEVERITY_POLICY_UNRESOLVED` não existe mais no caminho aprovado", () => {
    expect(r.assessed[0]?.not_emitted_reason).toBeUndefined()
    const serializado = JSON.stringify(r)
    expect(serializado).not.toContain("SEVERITY_POLICY_UNRESOLVED")
  })

  it("a severidade vem da política governada, não de constante local", () => {
    expect(LOW_TICKET_SEVERITY).toBe(CREDITUM_POLICY_V1.low_ticket_severity)
  })

  it("a severidade NÃO deriva das bandas percentuais gerais", () => {
    // Um contrato de R$1.000 num lote qualquer continua medium. Se a severidade
    // fosse calculada por participação, o mesmo contrato mudaria de faixa
    // conforme o tamanho do lote.
    const sozinho = detectar([contrato(100_000)])
    const acompanhado = detectar([
      contrato(100_000),
      contrato(5_000_000),
      contrato(5_000_000),
      contrato(5_000_000),
    ])
    expect(sozinho.events[0]?.severity).toBe("medium")
    expect(acompanhado.events[0]?.severity).toBe("medium")
  })

  it("o Event é válido contra o contrato fechado", () => {
    const e = r.events[0]
    expect(e?.event_type).toBe("low_ticket_contract")
    expect(e?.event_id).toMatch(/^evt_[a-f0-9]{16}$/)
    expect(e?.materiality).toEqual({ basis: "amount_cents", amount_cents: 100_000 })
    expect(e?.evidence_refs).toEqual(["ev_linha"])
  })

  it("o Event carrega o snapshot DESTE contrato, não o do lote", () => {
    expect(r.events[0]?.snapshot_ids).toEqual(["snap_vendas"])
  })

  it("não afirma fraude, erro, prejuízo, inadimplência nem causalidade", () => {
    const texto = JSON.stringify(r).toLowerCase()
    for (const proibido of [
      "fraude",
      "fraud",
      "prejuízo",
      "prejuizo",
      "inadimpl",
      "erro de",
      "causa",
      "risco de perda",
    ]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })

  it("a métrica publicada é o próprio ticket, sem denominador inventado", () => {
    const e = r.events[0]
    expect(e?.observed_metric?.name).toBe("ticket_cents")
    expect(e?.observed_metric?.unit).toBe("cents")
    // Contrato individual não tem todo. Nenhuma referência foi fabricada.
    expect(e?.reference_metric).toBeUndefined()
  })

  // ── Fronteira, agora com Event ──
  it("149_998 → matched, emitido, medium", () => {
    const r2 = detectar([contrato(149_998)])
    expect(r2.assessed[0]?.matched).toBe(true)
    expect(r2.events).toHaveLength(1)
    expect(r2.events[0]?.severity).toBe("medium")
  })

  it("149_999 → não matched, nenhum Event", () => {
    const r2 = detectar([contrato(149_999)])
    expect(r2.assessed[0]?.matched).toBe(false)
    expect(r2.assessed[0]?.not_emitted_reason).toBe("NOT_BELOW_FLOOR")
    expect(r2.events).toHaveLength(0)
  })

  it("150_000 → não matched, nenhum Event", () => {
    const r2 = detectar([contrato(150_000)])
    expect(r2.assessed[0]?.matched).toBe(false)
    expect(r2.events).toHaveLength(0)
  })

  it("ticket <= 0 → INVALID_TICKET, nenhum Event", () => {
    for (const t of [0, -1, -100_000]) {
      const r2 = detectar([contrato(t)])
      expect(r2.assessed[0]?.verdict, String(t)).toBe("INVALID_TICKET")
      expect(r2.assessed[0]?.matched, String(t)).toBe(false)
      expect(r2.assessed[0]?.not_emitted_reason, String(t)).toBe("INVALID_TICKET")
      expect(r2.events, String(t)).toHaveLength(0)
    }
  })

  it("ticket ausente → nenhum Event, e o motivo é distinguível", () => {
    const r2 = detectar([contrato(null)])
    expect(r2.assessed[0]?.verdict).toBe("TICKET_UNAVAILABLE")
    expect(r2.assessed[0]?.not_emitted_reason).toBe("TICKET_UNAVAILABLE")
    expect(r2.events).toHaveLength(0)
  })

  it("R$ 50.000 de materialidade não interfere no piso", () => {
    // 5_000_000 centavos é o limiar de materialidade financeira. Um contrato
    // desse valor está MUITO acima do piso de ticket e não pode alertar.
    const r2 = detectar([contrato(APPROVED_THRESHOLDS.material_amount_cents)])
    expect(r2.assessed[0]?.matched).toBe(false)
    expect(r2.events).toHaveLength(0)
  })

  it("o fato continua contado e auditável", () => {
    expect(r.summary.below_floor).toBe(1)
    expect(r.assessed).toHaveLength(1)
  })

  it("um lote misto emite um Event por contrato abaixo do piso", () => {
    const r2 = detectar([contrato(100_000), contrato(900_000), contrato(80_000)])
    expect(r2.events).toHaveLength(2)
    expect(new Set(r2.events.map((e) => e.event_id)).size).toBe(2)
    for (const e of r2.events) expect(e.severity).toBe("medium")
  })
})

// ── L / M ──
describe("L/M — determinismo e identidade", () => {
  it("L — mesma entrada, config e detected_at: deep-equal", () => {
    const c = [contrato(100_000), contrato(200_000)]
    expect(structuredClone(detectar(c))).toEqual(structuredClone(detectar(c)))
  })

  it("M — ordem da coleção não altera a identidade de cada fato", () => {
    const c = [contrato(100_000), contrato(50_000), contrato(300_000)]
    const ids = (r: ReturnType<typeof detectar>): string[] =>
      r.assessed.map((a) => a.event_id ?? "").sort()
    expect(ids(detectar([...c].reverse()))).toEqual(ids(detectar(c)))
  })

  it("reingestão com outro snapshot_id mantém a identidade do alerta", () => {
    const c = contrato(100_000)
    const a = detectar([c]).assessed[0]?.event_id

    const outro = rawSnapshot({
      snapshot_id: "snap_reingerido",
      source_system: "google_sheets",
      dataset_id: "ds_vendas",
    }) as unknown as Snapshot
    const ev = rawEvidence({
      evidence_id: "ev_linha",
      snapshot_id: "snap_reingerido",
      kind: "row",
      locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "a".repeat(64) },
    }) as unknown as Evidence
    const b = detectar([{ ...c, snapshot_id: "snap_reingerido" }], {
      snapshots: [outro],
      evidence: [ev],
    }).assessed[0]?.event_id

    expect(b).toBe(a)
  })

  it("dataset lógico diferente muda a identidade", () => {
    const c = contrato(100_000)
    const a = detectar([c]).assessed[0]?.event_id

    const outro = rawSnapshot({
      snapshot_id: "snap_outro_ds",
      source_system: "google_sheets",
      dataset_id: "ds_outro",
    }) as unknown as Snapshot
    const ev = rawEvidence({
      evidence_id: "ev_linha",
      snapshot_id: "snap_outro_ds",
      kind: "row",
      locator: { dataset_id: "ds_outro", sheet: "Vendas", row_key: "a".repeat(64) },
    }) as unknown as Evidence
    const b = detectar([{ ...c, snapshot_id: "snap_outro_ds" }], {
      snapshots: [outro],
      evidence: [ev],
    }).assessed[0]?.event_id

    expect(b).not.toBe(a)
  })

  it("sujeitos diferentes produzem fatos com identidades diferentes", () => {
    const r = detectar([contrato(100_000), contrato(90_000)])
    expect(new Set(r.assessed.map((a) => a.event_id)).size).toBe(2)
  })

  it("o id casa com o padrão do contrato", () => {
    expect(detectar([contrato(100_000)]).assessed[0]?.event_id).toMatch(/^evt_[a-f0-9]{16}$/)
  })

  it("contrato acima do piso não recebe event_id", () => {
    expect(detectar([contrato(200_000)]).assessed[0]?.event_id).toBeNull()
  })
})

describe("qualidade: a fonte atravessa até o alerta", () => {
  const comSnapshot = (campos: Record<string, unknown>): Snapshot[] =>
    [{ ...(snapshots[0] as unknown as Record<string, unknown>), ...campos }] as unknown as Snapshot[]

  it("snapshot conflicted: o resultado nunca é ok", () => {
    const r = detectar([contrato(100_000)], { snapshots: comSnapshot({ quality_status: "conflicted" }) })
    expect(r.summary.quality_status).toBe("conflicted")
  })

  it("snapshot degraded também propaga", () => {
    const r = detectar([contrato(100_000)], { snapshots: comSnapshot({ quality_status: "degraded" }) })
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("rows_skipped degradam", () => {
    const r = detectar([contrato(100_000)], { snapshots: comSnapshot({ rows_skipped: 2 }) })
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("com fonte limpa e ticket presente, ok é alcançável", () => {
    expect(detectar([contrato(100_000)]).summary.quality_status).toBe("ok")
  })
})

// ── N / O ──
describe("N/O — imutabilidade e ownership", () => {
  const inputMutavel = (): LowTicketInput => {
    const contracts: TicketRecord[] = [100_000, 200_000].map((t) => ({
      subject_ref: subjectRef(),
      unit: MATCHED,
      ticket_cents: t,
      evidence_refs: ["ev_linha"],
      snapshot_id: "snap_vendas",
    }))
    return {
      detected_at: DETECTED_AT,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      contracts,
      snapshots,
      evidence,
    }
  }

  it("O — evidence_refs do output não é a referência do input", () => {
    const input = inputMutavel()
    const r = detectLowTicketContracts(input)
    for (const a of r.assessed) {
      for (const c of input.contracts) {
        expect(a.evidence_refs).not.toBe(c.evidence_refs)
      }
    }
  })

  it("O — nenhum objeto do input é alcançável a partir do output", () => {
    const input = inputMutavel()
    const r = detectLowTicketContracts(input)
    const doInput = new Set<unknown>([
      input.contracts,
      ...input.contracts,
      ...input.contracts.map((c) => c.evidence_refs),
      ...input.contracts.map((c) => c.unit),
      input.snapshots,
      input.evidence,
    ])
    const visto = new WeakSet<object>()
    const percorrer = (v: unknown): void => {
      if (v === null || typeof v !== "object") return
      if (visto.has(v)) return
      visto.add(v)
      expect(doInput.has(v)).toBe(false)
      for (const filho of Object.values(v)) percorrer(filho)
    }
    percorrer(r)
  })

  describe("O — mutar o input depois não altera o resultado", () => {
    const input = inputMutavel()
    const r1 = detectLowTicketContracts(input)
    const antes = structuredClone(r1) as unknown

    it("o input É mutável e recebe a forja", () => {
      ;(input.contracts[0]?.evidence_refs as string[]).push("forged")
      expect(input.contracts[0]?.evidence_refs).toContain("forged")
    })

    it("e o resultado anterior segue idêntico", () => {
      expect(structuredClone(r1)).toEqual(antes)
      expect(JSON.stringify(r1)).not.toContain("forged")
    })
  })

  it("O — o input não é congelado como efeito colateral", () => {
    const input = inputMutavel()
    detectLowTicketContracts(input)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.contracts)).toBe(false)
    expect(Object.isFrozen(input.contracts[0]?.evidence_refs)).toBe(false)
  })

  const r = detectar([contrato(100_000), contrato(200_000)])

  it("N — Object.isFrozen em cada nível", () => {
    const alvos: readonly [string, unknown][] = [
      ["result", r],
      ["events", r.events],
      ["assessed", r.assessed],
      ["assessed[0]", r.assessed[0]],
      ["assessed[0].ticket_cents", r.assessed[0]?.ticket_cents],
      ["assessed[0].evidence_refs", r.assessed[0]?.evidence_refs],
      ["summary", r.summary],
    ]
    for (const [nome, alvo] of alvos) {
      expect(alvo, `${nome} deveria existir`).toBeDefined()
      expect(Object.isFrozen(alvo), `${nome} deveria estar congelado`).toBe(true)
    }
  })

  it("N — cada mutação aninhada lança e o estado não muda", () => {
    const antes = structuredClone(r) as unknown
    const tentativas: readonly [string, () => void][] = [
      ["summary.below_floor", () => ((r.summary as { below_floor: number }).below_floor = 99)],
      ["assessed[0].verdict", () => ((r.assessed[0] as { verdict: string }).verdict = "x")],
      ["ticket value", () => ((r.assessed[0]?.ticket_cents as { value: number }).value = 0)],
      ["events.push", () => (r.events as unknown[]).push({ forged: true })],
      ["assessed.push", () => (r.assessed as unknown[]).push({ forged: true })],
      ["assessed evidence_refs.push", () => (r.assessed[0]?.evidence_refs as string[]).push("forged")],
      ["matched", () => ((r.assessed[0] as { matched: boolean }).matched = false)],
      ["root", () => ((r as unknown as { events: null }).events = null)],
    ]
    for (const [nome, mutar] of tentativas) {
      expect(mutar, nome).toThrowError(TypeError)
    }
    expect(structuredClone(r)).toEqual(antes)
  })

  it("N — resultado sem fato também é congelado por inteiro", () => {
    const r0 = detectar([contrato(500_000)])
    expect(r0.summary.below_floor).toBe(0)
    expect(Object.isFrozen(r0)).toBe(true)
    expect(Object.isFrozen(r0.assessed)).toBe(true)
    expect(() => ((r0.summary as { below_floor: number }).below_floor = 1)).toThrowError(TypeError)
  })
})

describe("resultado auditável: nada descartado", () => {
  it("todos os contratos aparecem, alertados ou não", () => {
    const r = detectar([contrato(100_000), contrato(200_000), contrato(null), contrato(0)])
    expect(r.assessed).toHaveLength(4)
    expect(r.summary.total_records).toBe(4)
  })

  it("os quatro vereditos são distinguíveis", () => {
    const r = detectar([contrato(100_000), contrato(200_000), contrato(null), contrato(0)])
    expect(new Set(r.assessed.map((a) => a.verdict))).toEqual(
      new Set(["BELOW_FLOOR", "AT_OR_ABOVE_FLOOR", "TICKET_UNAVAILABLE", "INVALID_TICKET"]),
    )
  })

  it("o piso usado fica registrado no resumo", () => {
    expect(detectar([contrato(100_000)]).summary.floor_cents).toBe(149_999)
  })

  it("população vazia não é erro nem alerta", () => {
    const r = detectar([])
    expect(r.summary.total_records).toBe(0)
    expect(r.events).toHaveLength(0)
    expect(r.summary.quality_status).toBe("ok")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §11/§12 — a identidade do alerta pertence ao CONTRATO, não ao lote
//
// O gate encontrou isto: `identidadeDoAlerta` hasheava o conjunto de TODOS os
// escopos governados do lote. Um contrato low-ticket idêntico recebia `event_id`
// diferente só porque outro registro, sem relação alguma, veio de outro dataset
// no mesmo lote — e a deduplicação por identidade quebrava com isso.
//
// Lote misto é legítimo aqui porque cada fato low-ticket é individual. Não
// confundir com A/C/D, onde agregação multi-dataset continua fail-closed.

const snapshotsMistos = [
  rawSnapshot({ snapshot_id: "snap_vendas", source_system: "google_sheets", dataset_id: "ds_vendas" }),
  rawSnapshot({ snapshot_id: "snap_crm", source_system: "bitrix", dataset_id: "ds_crm" }),
] as unknown as Snapshot[]

const evidenciaMista = [
  rawEvidence({
    evidence_id: "ev_linha",
    snapshot_id: "snap_vendas",
    kind: "row",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "a".repeat(64) },
  }),
  rawEvidence({
    evidence_id: "ev_crm",
    snapshot_id: "snap_crm",
    kind: "row",
    locator: { dataset_id: "ds_crm", sheet: "Negocios", row_key: "b".repeat(64) },
  }),
] as unknown as Evidence[]

/** Mesmo contrato em toda invocação — `subjectRef()` incrementa, então é fixo aqui. */
const ALVO: TicketRecord = {
  subject_ref: "subj_00000000000000ff",
  unit: MATCHED,
  ticket_cents: 100_000,
  evidence_refs: ["ev_linha"],
  snapshot_id: "snap_vendas",
}

const NAO_RELACIONADO_CRM: TicketRecord = {
  subject_ref: "subj_00000000000000ee",
  unit: MATCHED,
  ticket_cents: 900_000, // acima do piso: nem sequer é low-ticket
  evidence_refs: ["ev_crm"],
  snapshot_id: "snap_crm",
}

const NAO_RELACIONADO_VENDAS: TicketRecord = {
  subject_ref: "subj_00000000000000dd",
  unit: MATCHED,
  ticket_cents: 80_000,
  evidence_refs: ["ev_linha"],
  snapshot_id: "snap_vendas",
}

const misto = (
  contracts: readonly TicketRecord[],
  extra: Partial<LowTicketInput> = {},
): ReturnType<typeof detectLowTicketContracts> =>
  detectLowTicketContracts(
    entrada(contracts, { snapshots: snapshotsMistos, evidence: evidenciaMista, ...extra }),
  )

const idDoAlvo = (r: ReturnType<typeof detectLowTicketContracts>): string => {
  const alvo = r.assessed.find((a) => a.subject_ref === ALVO.subject_ref)
  if (alvo === undefined) throw new Error("alvo ausente do resultado")
  // `event_id` é nulo quando o ticket não está abaixo do piso. ALVO está.
  if (alvo.event_id === null) throw new Error("alvo deveria ter identidade de alerta")
  return alvo.event_id
}

describe("§11 — registro não relacionado no lote não muda o event_id", () => {
  const sozinho = idDoAlvo(misto([ALVO]))

  it("A — lote 2 acrescenta registro de OUTRO dataset: identidade preservada", () => {
    expect(idDoAlvo(misto([ALVO, NAO_RELACIONADO_CRM]))).toBe(sozinho)
  })

  it("B — registro não relacionado no MESMO dataset: identidade preservada", () => {
    expect(idDoAlvo(misto([ALVO, NAO_RELACIONADO_VENDAS]))).toBe(sozinho)
  })

  it("C — ordem dos registros no lote não importa", () => {
    expect(idDoAlvo(misto([NAO_RELACIONADO_CRM, ALVO, NAO_RELACIONADO_VENDAS]))).toBe(sozinho)
  })

  it("reingestão: outro snapshot_id do MESMO dataset lógico preserva a identidade", () => {
    const reingerido = [
      ...snapshotsMistos,
      rawSnapshot({
        snapshot_id: "snap_vendas_v2",
        source_system: "google_sheets",
        dataset_id: "ds_vendas",
      }),
    ] as unknown as Snapshot[]
    const comEvidencia = [
      ...evidenciaMista,
      rawEvidence({
        evidence_id: "ev_linha_v2",
        snapshot_id: "snap_vendas_v2",
        kind: "row",
        locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "c".repeat(64) },
      }),
    ] as unknown as Evidence[]

    const r = misto(
      [{ ...ALVO, snapshot_id: "snap_vendas_v2", evidence_refs: ["ev_linha_v2"] }],
      { snapshots: reingerido, evidence: comEvidencia },
    )
    expect(idDoAlvo(r)).toBe(sozinho)
  })

  it("cada contrato do lote tem identidade própria", () => {
    const r = misto([ALVO, NAO_RELACIONADO_VENDAS])
    const ids = r.assessed.map((a) => a.event_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("§12 — o que É do contrato muda o event_id", () => {
  const sozinho = idDoAlvo(misto([ALVO]))

  it("D — subject_ref diferente", () => {
    const outro = misto([{ ...ALVO, subject_ref: "subj_00000000000000aa" }])
    expect(outro.assessed[0]?.event_id).not.toBe(sozinho)
  })

  it("E — dataset lógico DO PRÓPRIO contrato diferente", () => {
    const r = misto([{ ...ALVO, snapshot_id: "snap_crm", evidence_refs: ["ev_crm"] }])
    expect(idDoAlvo(r)).not.toBe(sozinho)
  })

  it("E — mesmo dataset_id em outro source_system é outra identidade lógica", () => {
    const outraFonte = [
      rawSnapshot({ snapshot_id: "snap_x", source_system: "omie", dataset_id: "ds_vendas" }),
    ] as unknown as Snapshot[]
    const ev = [
      rawEvidence({
        evidence_id: "ev_x",
        snapshot_id: "snap_x",
        kind: "row",
        locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "d".repeat(64) },
      }),
    ] as unknown as Evidence[]
    const r = misto([{ ...ALVO, snapshot_id: "snap_x", evidence_refs: ["ev_x"] }], {
      snapshots: outraFonte,
      evidence: ev,
    })
    expect(idDoAlvo(r)).not.toBe(sozinho)
  })

  it("F — período diferente", () => {
    const r = misto([ALVO], { period_start: "2026-09-01", period_end: "2026-09-30" })
    expect(idDoAlvo(r)).not.toBe(sozinho)
  })

  it("G — a identidade é estrutural, não gramática de delimitador", () => {
    expect(sozinho).toMatch(/^evt_[a-f0-9]{16}$/)
    expect(sozinho).not.toContain(ALVO.subject_ref)
    expect(sozinho).not.toContain("ds_vendas")
    expect(sozinho).not.toContain(String(APPROVED_THRESHOLDS.low_ticket_floor_cents))
  })

  it("G — o piso declarado no resultado é o aprovado, e entra na identidade", () => {
    const r = misto([ALVO])
    expect(r.assessed[0]?.threshold_cents).toBe(APPROVED_THRESHOLDS.low_ticket_floor_cents)
  })

  it("detected_at não entra na identidade — o fato é o mesmo", () => {
    const r = misto([ALVO], { detected_at: "2026-08-16T23:59:59.000Z" })
    expect(idDoAlvo(r)).toBe(sozinho)
  })

  it("contrato sem escopo governado falha fechado, sem identidade inventada", () => {
    expect(() => misto([{ ...ALVO, snapshot_id: "snap_inexistente" }])).toThrow(GatewayError)
  })
})
