import { describe, expect, it } from "vitest"
import { classifySeverity, highestSeverity, severityRank } from "../src/severity"
import { GatewayError } from "../../gateway/src/errors"
import { ESCALA_SINTETICA } from "./test-config"

describe("classificação contra a escala", () => {
  it("classifica pela última banda alcançada", () => {
    expect(classifySeverity(ESCALA_SINTETICA, 0)).toBe("info")
    expect(classifySeverity(ESCALA_SINTETICA, 1000)).toBe("low")
    expect(classifySeverity(ESCALA_SINTETICA, 2500)).toBe("medium")
    expect(classifySeverity(ESCALA_SINTETICA, 5000)).toBe("high")
    expect(classifySeverity(ESCALA_SINTETICA, 7500)).toBe("critical")
    expect(classifySeverity(ESCALA_SINTETICA, 10000)).toBe("critical")
  })
})

describe("boundary — threshold−1, threshold, threshold+1", () => {
  const limites = [
    { at: 1000, abaixo: "info", exato: "low", acima: "low" },
    { at: 2500, abaixo: "low", exato: "medium", acima: "medium" },
    { at: 5000, abaixo: "medium", exato: "high", acima: "high" },
    { at: 7500, abaixo: "high", exato: "critical", acima: "critical" },
  ] as const

  for (const { at, abaixo, exato, acima } of limites) {
    it(`limite ${at}: ${at - 1} → ${abaixo}, ${at} → ${exato}, ${at + 1} → ${acima}`, () => {
      expect(classifySeverity(ESCALA_SINTETICA, at - 1)).toBe(abaixo)
      expect(classifySeverity(ESCALA_SINTETICA, at)).toBe(exato)
      expect(classifySeverity(ESCALA_SINTETICA, at + 1)).toBe(acima)
    })
  }
})

describe("fail closed", () => {
  it("recusa valor não inteiro — severidade não se deriva de float", () => {
    expect(() => classifySeverity(ESCALA_SINTETICA, 2500.5)).toThrowError(GatewayError)
    expect(() => classifySeverity(ESCALA_SINTETICA, NaN)).toThrowError(GatewayError)
    expect(() => classifySeverity(ESCALA_SINTETICA, Infinity)).toThrowError(GatewayError)
  })

  it("recusa escala vazia", () => {
    expect(() => classifySeverity([], 100)).toThrowError(GatewayError)
  })

  it("recusa valor abaixo da primeira banda", () => {
    expect(() => classifySeverity([{ at_least: 10, severity: "low" }], 5)).toThrowError(
      GatewayError,
    )
  })
})

describe("severidade NÃO é qualidade, confiança nem materialidade", () => {
  it("a assinatura não aceita qualidade nem confiança — não há como influenciarem", () => {
    // Prova estrutural: `classifySeverity` recebe escala e número, e nada mais.
    // Um impacto grande sobre dado conflitado continua grande — o conflito é
    // mais um motivo para olhar, não menos.
    expect(classifySeverity.length).toBe(2)
  })

  it("o mesmo valor produz a mesma severidade, qualquer que seja o contexto", () => {
    const impactoGrande = 9000
    expect(classifySeverity(ESCALA_SINTETICA, impactoGrande)).toBe("critical")
    // Não existe variante que receba `quality_status: "conflicted"` e rebaixe.
  })
})

describe("agregação de severidade", () => {
  it("devolve a mais grave", () => {
    expect(highestSeverity(["info", "critical", "low"])).toBe("critical")
    expect(highestSeverity(["info", "low"])).toBe("low")
    expect(highestSeverity([])).toBe("info")
  })

  it("a ordem é estável e total", () => {
    expect(severityRank("info")).toBeLessThan(severityRank("low"))
    expect(severityRank("low")).toBeLessThan(severityRank("medium"))
    expect(severityRank("medium")).toBeLessThan(severityRank("high"))
    expect(severityRank("high")).toBeLessThan(severityRank("critical"))
  })
})

describe("determinismo", () => {
  it("mesma entrada, mesma saída", () => {
    for (const v of [0, 999, 1000, 4999, 5000, 123456]) {
      expect(classifySeverity(ESCALA_SINTETICA, v)).toBe(classifySeverity(ESCALA_SINTETICA, v))
    }
  })
})
