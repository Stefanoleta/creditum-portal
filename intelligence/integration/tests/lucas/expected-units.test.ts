/**
 * `expected_units` para o dataset do Lucas.
 *
 * A afirmação central: sem membership governada para
 * `lucas_status_contratos_mensal`, a cobertura é `DATA_NOT_AVAILABLE` — e nenhum
 * denominador é inventado a partir do que foi observado.
 *
 * Esse é o erro mais fácil de cometer aqui: a captura sabe quantas unidades
 * apareceram no mês, e usar esse número como denominador daria uma cobertura de
 * 100% sempre. Seria um número perfeito medindo nada.
 */

import { describe, expect, it } from "vitest"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { LUCAS_DATASET_ID } from "../../src/lucas/drive-port"
import { toInstallmentInput } from "../../src/lucas/detector-input"
import { evaluateCoverage, coverageForDetector } from "../../../detectors/src/coverage-evaluation"
import { PRODUCTION_EXPECTED_UNITS_PROVIDER } from "../../../detectors/src/expected-units-file-provider"
import { CREDITUM_POLICY_V1 } from "../../../detectors/src/production-policy"
import { FakeDrive, arquivo } from "./fake-drive"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const LIMIAR_BP = CREDITUM_POLICY_V1.coverage_missing_share_insufficient_at_bp

const capturar = async (): ReturnType<LucasMonthlyContractsProvider["load"]> => {
  const drive = new FakeDrive({
    files: [
      arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", {
        headers: HEADER_AGOSTO,
        rows: [
          linhaAgosto({ venc: "27/08/2026", cpf: cpfSintetico(1), unidade: "Meriti", parcelas: 20, ticket: "R$ 8.151,60", status: "E" }),
          linhaAgosto({ venc: "28/08/2026", cpf: cpfSintetico(2), unidade: "Santos", parcelas: 12, ticket: "R$ 4.000,00", status: "E" }),
        ],
      }),
    ],
  })
  return new LucasMonthlyContractsProvider({ drive, now: () => new Date("2026-08-19T18:00:00.000Z") }).load({
    period: "2026-08",
  })
}

describe("§47/§65 — cobertura sem membership é DATA_NOT_AVAILABLE", () => {
  it("a consulta canônica usa period + dataset_id", async () => {
    const r = await capturar()
    if (r.status !== "available") throw new Error("estado errado")
    const observadas = r.rows.flatMap((l) => (l.unit.status === "matched" ? [l.unit.unit_id] : []))
    expect(observadas).toHaveLength(2)

    const ev = evaluateCoverage(
      PRODUCTION_EXPECTED_UNITS_PROVIDER,
      { period: r.period, dataset_id: LUCAS_DATASET_ID },
      observadas,
      LIMIAR_BP,
    )
    // Não existe membership governada para este dataset. A resposta é ausência.
    expect(ev.status).toBe("data_not_available")
    if (ev.status !== "data_not_available") throw new Error("estado errado")
    expect(ev.reason).toBe("EXPECTED_UNITS_DATA_NOT_AVAILABLE")
    expect(ev.dataset_id).toBe(LUCAS_DATASET_ID)
    expect(ev.period).toBe("2026-08")
  })

  it("nenhum ratio é inventado — o ramo ausente não tem onde escrevê-lo", async () => {
    const r = await capturar()
    if (r.status !== "available") throw new Error("estado errado")
    const observadas = r.rows.flatMap((l) => (l.unit.status === "matched" ? [l.unit.unit_id] : []))
    const ev = evaluateCoverage(
      PRODUCTION_EXPECTED_UNITS_PROVIDER,
      { period: r.period, dataset_id: LUCAS_DATASET_ID },
      observadas,
      LIMIAR_BP,
    )
    const serial = JSON.stringify(ev)
    expect(serial).not.toContain("ratio_bp")
    expect(serial).not.toContain("expected_count")
    expect(serial).not.toContain("missing_share_bp")
    // E o que seria a tentação: usar as 2 observadas como denominador daria
    // 100% de cobertura sempre — um número perfeito que não mede nada.
    expect(serial).not.toContain("10000")
  })

  it("o detector recebe cobertura AUSENTE, não zerada", async () => {
    const r = await capturar()
    if (r.status !== "available") throw new Error("estado errado")
    const observadas = r.rows.flatMap((l) => (l.unit.status === "matched" ? [l.unit.unit_id] : []))
    const ev = evaluateCoverage(
      PRODUCTION_EXPECTED_UNITS_PROVIDER,
      { period: r.period, dataset_id: LUCAS_DATASET_ID },
      observadas,
      LIMIAR_BP,
    )
    const paraDetector = coverageForDetector(ev)
    expect(paraDetector).toBeUndefined()

    const input = toInstallmentInput({
      capture: r,
      stance: "current",
      detected_at: "2026-08-19T18:00:00.000Z",
      ...(paraDetector === undefined ? {} : { unit_coverage: paraDetector }),
    })
    // A evidência vem da CAPTURA, não deste teste — o tipo não aceita outra.
    expect(input.evidence).toBe(r.evidence.all)
    // `expected_units: 0` diria "esperávamos zero unidades", que é falso.
    // A ausência do campo, com o estado explícito ao lado, diz "não sabemos".
    expect("unit_coverage" in input).toBe(false)
  })

  it("os fatos suportados continuam funcionando sem cobertura", async () => {
    const r = await capturar()
    if (r.status !== "available") throw new Error("estado errado")
    // A captura inteira é válida: cobertura indisponível não interrompe a
    // observação factual, que é a invariante da Fase 2.8a.
    expect(r.row_count).toBe(2)
    expect(r.snapshot.record_count).toBe(2)
    expect(r.rows.every((l) => l.unit.status === "matched")).toBe(true)
    expect(r.rows.every((l) => l.ticket_cents !== null)).toBe(true)
  })
})
