/**
 * MAX_AVAILABLE_PARTICIPATION — a regra de base de severidade de A e C.
 *
 * A Fase 2.7 deixou a escolha entre participação em QUANTIDADE e em VALOR aberta
 * porque nenhuma das duas é "a certa" para todo evento: muitos contratos
 * pequenos e poucos contratos grandes produzem leituras opostas. A 2.7b resolveu
 * graduando pela participação governada mais forte que estiver disponível.
 *
 * O que estes testes travam: nenhuma participação ausente vira zero, nenhuma R$
 * ou contagem absoluta substitui percentual, e a ordem de entrada nunca decide.
 */

import { describe, expect, it } from "vitest"
import {
  maxAvailableParticipation,
  participationGap,
} from "../src/participation-severity"
import { classifySeverity } from "../src/severity"
import { gap, observed } from "../src/engine"
import type { Metric } from "../src/engine"
import { CREDITUM_POLICY_V1 } from "../src/production-policy"

const bp = (n: number): Metric<number> => observed(n)
const ausente = (): Metric<number> => gap<number>("DATA_NOT_AVAILABLE", "calculated", "sem dado")
const ESCALA = CREDITUM_POLICY_V1.severity_scale
const DESEMPATE = CREDITUM_POLICY_V1.installment_severity.tie_break_dimension

const grau = (contagem: Metric<number>, valor: Metric<number>): string | null => {
  const b = maxAvailableParticipation(contagem, valor, DESEMPATE)
  return b === null ? null : classifySeverity(ESCALA, b.value)
}

describe("§13 — a maior participação válida gradua", () => {
  it("contagem 30%, valor 5% → high, base share_count_bp", () => {
    const b = maxAvailableParticipation(bp(3000), bp(500), DESEMPATE)
    expect(b?.dimension).toBe("share_count_bp")
    expect(grau(bp(3000), bp(500))).toBe("high")
  })

  it("contagem 5%, valor 30% → high, base share_amount_bp", () => {
    const b = maxAvailableParticipation(bp(500), bp(3000), DESEMPATE)
    expect(b?.dimension).toBe("share_amount_bp")
    expect(grau(bp(500), bp(3000))).toBe("high")
  })

  it("contagem 15%, valor 20% → medium, e o VALOR vence", () => {
    const b = maxAvailableParticipation(bp(1500), bp(2000), DESEMPATE)
    expect(b?.dimension).toBe("share_amount_bp")
    expect(b?.value).toBe(2000)
    expect(grau(bp(1500), bp(2000))).toBe("medium")
  })

  it("só a contagem disponível → classifica por ela", () => {
    const b = maxAvailableParticipation(bp(2600), ausente(), DESEMPATE)
    expect(b).toEqual({ dimension: "share_count_bp", value: 2600 })
    expect(grau(bp(2600), ausente())).toBe("high")
  })

  it("só o valor disponível → classifica por ele", () => {
    const b = maxAvailableParticipation(ausente(), bp(900), DESEMPATE)
    expect(b).toEqual({ dimension: "share_amount_bp", value: 900 })
    expect(grau(ausente(), bp(900))).toBe("low")
  })

  it("nenhuma disponível → null, nunca zero", () => {
    expect(maxAvailableParticipation(ausente(), ausente(), DESEMPATE)).toBeNull()
    expect(grau(ausente(), ausente())).toBeNull()
  })

  it("a lacuna é tipada e nomeia as duas dimensões", () => {
    const g = participationGap(ausente(), bp(100))
    expect(g).toContain("share_count_bp=DATA_NOT_AVAILABLE")
    expect(g).toContain("share_amount_bp=ok")
  })
})

describe("§14 — desempate determinístico, nunca por ordem de entrada", () => {
  it("empate resolve pela dimensão governada", () => {
    const b = maxAvailableParticipation(bp(2000), bp(2000), "share_amount_bp")
    expect(b).toEqual({ dimension: "share_amount_bp", value: 2000 })
  })

  it("o desempate é parâmetro, não posição", () => {
    expect(maxAvailableParticipation(bp(2000), bp(2000), "share_count_bp")?.dimension).toBe(
      "share_count_bp",
    )
    expect(maxAvailableParticipation(bp(2000), bp(2000), "share_amount_bp")?.dimension).toBe(
      "share_amount_bp",
    )
  })

  it("no empate a severidade é a mesma dos dois lados — só o rótulo muda", () => {
    const a = maxAvailableParticipation(bp(2600), bp(2600), "share_count_bp")
    const c = maxAvailableParticipation(bp(2600), bp(2600), "share_amount_bp")
    expect(a?.value).toBe(c?.value)
    expect(classifySeverity(ESCALA, a?.value ?? -1)).toBe(classifySeverity(ESCALA, c?.value ?? -1))
  })

  it("a função é pura: chamadas repetidas dão o mesmo resultado", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(maxAvailableParticipation(bp(1234), bp(1234), DESEMPATE)?.dimension).toBe(DESEMPATE)
    }
  })
})

describe("§3 — bandas aplicadas à base de participação", () => {
  it("fronteiras", () => {
    for (const [v, esperado] of [
      [0, "low"],
      [999, "low"],
      [1000, "medium"],
      [2499, "medium"],
      [2500, "high"],
      [4999, "high"],
      [5000, "critical"],
      [10000, "critical"],
    ] as const) {
      expect(grau(bp(v), ausente()), `${v} bp`).toBe(esperado)
    }
  })

  it("nenhum abs(): a função não transforma sinal", () => {
    // Participação governada é 0..10000 por construção. Se um negativo chegar,
    // ele NÃO é convertido — segue para a escala, que falha fechado.
    const b = maxAvailableParticipation(bp(-500), ausente(), DESEMPATE)
    expect(b?.value).toBe(-500)
  })

  it("R$ e contagem absoluta não substituem percentual", () => {
    // A função só aceita duas participações. Não há assinatura por onde um
    // valor em centavos ou uma contagem de contratos possa entrar.
    const fonte = maxAvailableParticipation.toString()
    expect(fonte).not.toContain("cents")
    expect(fonte).not.toContain("count_above")
  })
})
