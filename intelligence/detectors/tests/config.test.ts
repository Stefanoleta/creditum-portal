/**
 * Configuração fail-closed.
 *
 * O que estes testes protegem: um threshold ausente não pode cair para um valor
 * "razoável". Se caísse, o número escolhido pelo engenheiro viraria política da
 * Creditum no dia em que alguém o encontrasse num arquivo e assumisse aprovação.
 */

import { describe, expect, it } from "vitest"
import { APPROVED_THRESHOLDS, BUSINESS_TIMEZONE, isValidTimezone, validateDetectorConfig } from "../src/config"
import { GatewayError } from "../../gateway/src/errors"
import { TEST_CONFIG } from "./test-config"

function semCampo(caminho: readonly string[]): unknown {
  const copia = structuredClone(TEST_CONFIG) as unknown as Record<string, unknown>
  let alvo: Record<string, unknown> = copia
  for (const parte of caminho.slice(0, -1)) {
    alvo = alvo[parte] as Record<string, unknown>
  }
  delete alvo[caminho[caminho.length - 1] as string]
  return copia
}

describe("valores com lastro", () => {
  it("installment_threshold aprovado é 19 — briefing do Bloco 1, §14 Caso A", () => {
    expect(APPROVED_THRESHOLDS.installment_threshold).toBe(19)
  })

  it("limiar de similaridade é o do motor, em basis points", () => {
    expect(APPROVED_THRESHOLDS.similarity_threshold_bp).toBe(8000)
  })

  it("os aprovados são congelados — não viram default mutável", () => {
    expect(Object.isFrozen(APPROVED_THRESHOLDS)).toBe(true)
  })

  it("o fuso da operação é explícito, não o da máquina", () => {
    expect(BUSINESS_TIMEZONE).toBe("America/Sao_Paulo")
  })
})

describe("não existe configuração de produção neste repositório", () => {
  it("a config sintética usa versão 0.0.0 — nunca uma versão publicável", () => {
    // Se algum dia um `PRODUCTION_CONFIG` aparecer, ele terá passado por
    // aprovação de threshold. Hoje não há: o único conjunto completo de valores
    // no repositório é o sintético, e ele se declara 0.0.0.
    expect(TEST_CONFIG.config_version).toBe("0.0.0")
  })

  it("`src/config.ts` não exporta nenhum conjunto pronto de thresholds", async () => {
    const modulo = (await import("../src/config")) as Record<string, unknown>
    const exportados = Object.keys(modulo)
    expect(exportados).not.toContain("DEFAULT_CONFIG")
    expect(exportados).not.toContain("PRODUCTION_CONFIG")
    expect(exportados).not.toContain("CREDITUM_CONFIG")
  })
})

describe("config válida", () => {
  it("aceita a configuração sintética completa", () => {
    expect(() => validateDetectorConfig(TEST_CONFIG)).not.toThrow()
  })

  it("devolve o objeto congelado", () => {
    expect(Object.isFrozen(validateDetectorConfig(TEST_CONFIG))).toBe(true)
  })
})

describe("threshold ausente falha fechado", () => {
  const obrigatorios: readonly (readonly string[])[] = [
    ["installmentConcentration", "installment_threshold"],
    ["installmentConcentration", "minimum_sample_size"],
    ["installmentConcentration", "material_share_count_bp"],
    ["installmentConcentration", "material_share_amount_bp"],
    ["installmentConcentration", "material_amount_cents"],
    ["installmentConcentration", "material_count_above"],
    ["installmentConcentration", "contributing_case_rule"],
    ["installmentConcentration", "severity_dimension"],
    ["installmentConcentration", "severity_scale"],
    ["installmentConcentration", "minimum_coverage_bp"],
    ["crossSourceConflict", "material_absolute_count"],
    ["crossSourceConflict", "material_share_bp"],
    ["crossSourceConflict", "material_amount_cents"],
    ["crossSourceConflict", "structural_fields"],
    ["firstDueConcentration", "material_count"],
    ["firstDueConcentration", "material_share_count_bp"],
    ["firstDueConcentration", "material_amount_cents"],
    ["firstDueConcentration", "material_share_amount_bp"],
    ["firstDueConcentration", "severity_dimension"],
    ["firstDueConcentration", "severity_scale"],
    ["firstDueConcentration", "minimum_sample_size"],
    ["materialSingleCase", "supported_metrics"],
    ["materialSingleCase", "material_absolute_delta_cents"],
    ["materialSingleCase", "material_count_delta"],
    ["materialSingleCase", "material_relative_delta_bp"],
    ["materialSingleCase", "material_share_of_total_bp"],
    ["materialSingleCase", "severity_dimension"],
    ["materialSingleCase", "severity_scale"],
    ["materialSingleCase", "min_population_after_removal"],
    ["coverage", "degraded_below_bp"],
    ["coverage", "emit_event_below_bp"],
    ["similarity_threshold_bp"],
    ["businessTimezone"],
    ["config_version"],
  ]

  for (const caminho of obrigatorios) {
    it(`recusa sem ${caminho.join(".")}`, () => {
      expect(() => validateDetectorConfig(semCampo(caminho))).toThrowError(GatewayError)
    })
  }

  /**
   * `firstDueConcentration.window` saiu da lista acima na Fase 2.7c.1.
   *
   * Não porque a obrigatoriedade tenha sido afrouxada — ela MUDOU DE LUGAR. A
   * Política Creditum v1 aprova duas janelas executivas e não elege nenhuma,
   * então carregar uma na configuração faria a forma do tipo escolher qual
   * análise a Creditum executa. A janela virou parâmetro de EXECUÇÃO, e quem
   * exige é o Detector C: configuração sem janela chegando nele é recusa.
   */
  it("window ausente é aceito na CONFIGURAÇÃO — é parâmetro de execução", () => {
    expect(() =>
      validateDetectorConfig(semCampo(["firstDueConcentration", "window"])),
    ).not.toThrow()
  })

  it("window presente mas malformada continua sendo erro de configuração", () => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["firstDueConcentration"] = {
      ...c["firstDueConcentration"],
      window: { mode: "next_n_business_days", days: 7 },
    }
    expect(() => validateDetectorConfig(c)).toThrowError(GatewayError)
  })

  it("recusa seção inteira ausente", () => {
    const copia = structuredClone(TEST_CONFIG) as unknown as Record<string, unknown>
    delete copia["materialSingleCase"]
    expect(() => validateDetectorConfig(copia)).toThrowError(/materialSingleCase/)
  })

  it("recusa entrada que não é objeto", () => {
    for (const entrada of [null, undefined, 42, "config", []]) {
      expect(() => validateDetectorConfig(entrada)).toThrowError(GatewayError)
    }
  })

  it("a mensagem nomeia TODOS os campos faltantes, não só o primeiro", () => {
    try {
      validateDetectorConfig({ config_version: "1.0.0" })
      expect.unreachable("deveria ter recusado")
    } catch (e) {
      expect((e as GatewayError).details.length).toBeGreaterThan(4)
    }
  })
})

describe("timezone", () => {
  it("aceita zona IANA real", () => {
    expect(isValidTimezone("America/Sao_Paulo")).toBe(true)
    expect(isValidTimezone("UTC")).toBe(true)
  })

  it("recusa zona inventada", () => {
    expect(isValidTimezone("America/Nao_Existe")).toBe(false)
    expect(isValidTimezone("BRT")).toBe(false)
    expect(isValidTimezone("")).toBe(false)
    expect(isValidTimezone(null)).toBe(false)
    expect(isValidTimezone(-3)).toBe(false)
  })

  it("config com timezone inválido é recusada", () => {
    expect(() =>
      validateDetectorConfig({ ...TEST_CONFIG, businessTimezone: "America/Nao_Existe" }),
    ).toThrowError(/businessTimezone/)
  })
})

describe("valores fora de faixa", () => {
  it("recusa basis points acima de 10000", () => {
    expect(() =>
      validateDetectorConfig({ ...TEST_CONFIG, similarity_threshold_bp: 10001 }),
    ).toThrowError(/similarity_threshold_bp/)
  })

  it("recusa inteiro não exato", () => {
    expect(() =>
      validateDetectorConfig({ ...TEST_CONFIG, similarity_threshold_bp: 8000.5 }),
    ).toThrowError(/similarity_threshold_bp/)
  })

  it("recusa threshold de parcelas menor que 1", () => {
    const c = structuredClone(TEST_CONFIG)
    ;(c.installmentConcentration as { installment_threshold: number }).installment_threshold = 0
    expect(() => validateDetectorConfig(c)).toThrowError(/installment_threshold/)
  })
})

describe("o limiar de parcelas é invariante governada, não parâmetro", () => {
  // O gate adversarial da Fase 2.3 mostrou o custo de deixá-lo configurável:
  // uma config com 20 passava na validação, e aí um contrato de 20 parcelas
  // saía da faixa — a configuração suprimia concentração real, e o evento ainda
  // publicava uma fórmula dizendo "> 19". Enquanto não houver nova decisão de
  // negócio, o único valor aceito é 19.
  const comLimiar = (valor: unknown): unknown => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["installmentConcentration"]!["installment_threshold"] = valor
    return c
  }

  it("18 é recusado", () => {
    expect(() => validateDetectorConfig(comLimiar(18))).toThrowError(/installment_threshold/)
  })

  it("19 é aceito — é a regra aprovada", () => {
    expect(() => validateDetectorConfig(comLimiar(19))).not.toThrow()
    expect(validateDetectorConfig(comLimiar(19)).installmentConcentration.installment_threshold).toBe(19)
  })

  it("20 é recusado", () => {
    expect(() => validateDetectorConfig(comLimiar(20))).toThrowError(/installment_threshold/)
  })

  it("o campo ausente também é recusado — 19 não é fallback", () => {
    expect(() =>
      validateDetectorConfig(semCampo(["installmentConcentration", "installment_threshold"])),
    ).toThrowError(/installment_threshold/)
  })

  it("recusa o valor certo com o tipo errado", () => {
    for (const errado of ["19", 19.0000001, null, true]) {
      expect(() => validateDetectorConfig(comLimiar(errado)), `${String(errado)}`).toThrowError(
        /installment_threshold/,
      )
    }
  })

  it("recusa versão de config fora do formato semver", () => {
    expect(() => validateDetectorConfig({ ...TEST_CONFIG, config_version: "v1" })).toThrowError(
      /config_version/,
    )
  })
})

describe("escala de severidade", () => {
  const comEscala = (escala: unknown): unknown => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["installmentConcentration"]!["severity_scale"] = escala
    return c
  }

  it("recusa escala vazia", () => {
    expect(() => validateDetectorConfig(comEscala([]))).toThrowError(/severity_scale/)
  })

  it("recusa escala que não começa em 0 — deixaria valores sem classificação", () => {
    expect(() =>
      validateDetectorConfig(comEscala([{ at_least: 100, severity: "low" }])),
    ).toThrowError(/at_least/)
  })

  it("recusa escala não crescente — classificação dependeria da ordem de avaliação", () => {
    expect(() =>
      validateDetectorConfig(
        comEscala([
          { at_least: 0, severity: "info" },
          { at_least: 5000, severity: "high" },
          { at_least: 2500, severity: "medium" },
        ]),
      ),
    ).toThrowError(/crescentes/)
  })

  it("recusa banda repetida no mesmo limite", () => {
    expect(() =>
      validateDetectorConfig(
        comEscala([
          { at_least: 0, severity: "info" },
          { at_least: 0, severity: "high" },
        ]),
      ),
    ).toThrowError(/crescentes/)
  })

  it("recusa severidade inventada", () => {
    expect(() =>
      validateDetectorConfig(comEscala([{ at_least: 0, severity: "catastrofico" }])),
    ).toThrowError(/severity/)
  })
})

describe("coerência entre campos", () => {
  it("recusa emitir evento com cobertura maior do que a que já degrada", () => {
    const c = structuredClone(TEST_CONFIG)
    ;(c.coverage as { emit_event_below_bp: number }).emit_event_below_bp = 9800
    expect(() => validateDetectorConfig(c)).toThrowError(/incoerente/)
  })

  it("recusa regra de caso contribuinte com modo desconhecido", () => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["installmentConcentration"]!["contributing_case_rule"] = { mode: "aleatorio" }
    expect(() => validateDetectorConfig(c)).toThrowError(/contributing_case_rule/)
  })

  it("recusa janela com modo desconhecido", () => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["firstDueConcentration"]!["window"] = { mode: "trimestre" }
    expect(() => validateDetectorConfig(c)).toThrowError(/window/)
  })
})
