/**
 * Política Creditum v1 — projeção governada, validação fail-closed.
 *
 * A Fase 2.6c terminou com um HIGH: três aliases D13 viviam em TypeScript e o
 * runtime os enxertava depois do load. Havia duas fontes de governança, e a
 * segunda era invisível para quem olhasse a fonte governada.
 *
 * Estes testes aplicam a mesma trava à política de negócio. Nenhum valor da
 * Creditum pode existir em constante de código; a projeção precisa vir do
 * artefato, e política incompleta precisa recusar em vez de completar sozinha.
 */

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { CreditumPolicy } from "../src/production-policy"
import {
  CREDITUM_POLICY_V1,
  POLICY_DECISIONS_PENDING,
  POLICY_V1_COMPLETE,
  PRODUCTION_CONFIG_FIELDS_PENDING,
  assertProductionConfigComplete,
  assertProductionPolicyComplete,
  buildProductionDetectorConfig,
  assertDistinctFiveFields,
  productionNextNDays,
  coverageThresholdsFromPolicy,
  productionFirstDueWindows,
  buildFirstDueExecutionConfig,
  productionFirstDueContext,
  validateCreditumPolicy,
} from "../src/production-policy"
import { classifySeverity } from "../src/severity"
import { APPROVED_THRESHOLDS, BUSINESS_TIMEZONE } from "../src/config"
import { GatewayError } from "../../gateway/src/errors"

const ARTEFATO = JSON.parse(
  readFileSync(new URL("../../governance/policy/creditum-policy.v1.json", import.meta.url), "utf8"),
) as Record<string, unknown>

/** Cópia profunda do artefato válido, para mutar um campo por vez. */
const comMudanca = (mut: (a: Record<string, never>) => void): unknown => {
  const copia = JSON.parse(JSON.stringify(ARTEFATO)) as Record<string, never>
  mut(copia)
  return copia
}

const recusa = (mut: (a: Record<string, never>) => void): string[] => {
  try {
    validateCreditumPolicy(comMudanca(mut))
  } catch (e) {
    if (e instanceof GatewayError) return [...(e.details ?? [])]
    throw e
  }
  throw new Error("esperava recusa, a política foi aceita")
}

// ═════════════════════════════════════════════════════════════════════════════

describe("§2 — os valores aprovados de materialidade", () => {
  it("participação relevante = 10%", () => {
    expect(CREDITUM_POLICY_V1.relevant_participation_bp).toBe(1000)
  })

  it("materialidade financeira = R$ 50.000 em centavos", () => {
    expect(CREDITUM_POLICY_V1.financial_materiality_cents).toBe(5_000_000)
  })

  it("quantidade relevante = 5 casos", () => {
    expect(CREDITUM_POLICY_V1.relevant_case_count).toBe(5)
  })

  it("população mínima = 10 contratos", () => {
    expect(CREDITUM_POLICY_V1.minimum_population_contracts).toBe(10)
  })

  it("`calibratable` está registrado como estado, não como comportamento", () => {
    // Calibrável significa que o CEO pode revisar. Não autoriza o sistema a
    // mudar o número sozinho — nada no runtime escreve no artefato.
    const m = ARTEFATO["materiality"] as Record<string, unknown>
    expect(m["financial_materiality_status"]).toBe("approved_initial_calibratable")
    const fonte = readFileSync(new URL("../src/production-policy.ts", import.meta.url), "utf8")
    expect(fonte).not.toContain("writeFileSync")
  })
})

describe("§21 — bandas de severidade aprovadas", () => {
  const escala = CREDITUM_POLICY_V1.severity_scale

  it("fronteiras exatas", () => {
    for (const [bp, esperado] of [
      [0, "low"],
      [999, "low"],
      [1000, "medium"],
      [2499, "medium"],
      [2500, "high"],
      [4999, "high"],
      [5000, "critical"],
    ] as const) {
      expect(classifySeverity(escala, bp), `${bp} bp`).toBe(esperado)
    }
  })

  it("acima de 10000 bp continua critical — sem clamp silencioso", () => {
    expect(classifySeverity(escala, 20000)).toBe("critical")
  })

  it("valor abaixo da primeira banda falha fechado, não vira `info`", () => {
    // A escala começa em 0. Um bp negativo não é classificado por acidente.
    expect(() => classifySeverity(escala, -1)).toThrow(GatewayError)
  })

  it("recusa bandas sobrepostas", () => {
    const d = recusa((a) => {
      ;(a["severity_bands"] as unknown as { at_least_bp: number }[])[2]!.at_least_bp = 1000
    })
    expect(d.join(" ")).toContain("sobreposição")
  })

  it("recusa buraco no piso do domínio", () => {
    const d = recusa((a) => {
      ;(a["severity_bands"] as unknown as { at_least_bp: number }[])[0]!.at_least_bp = 100
    })
    expect(d.join(" ")).toContain("começar em 0")
  })

  it("recusa ordem de severidade incoerente", () => {
    const d = recusa((a) => {
      ;(a["severity_bands"] as unknown as { severity: string }[])[2]!.severity = "low"
    })
    expect(d.join(" ")).toContain("ordem incoerente")
  })
})

describe("§7 — low-ticket: piso e severidade fixa", () => {
  it("piso R$ 1.499,99, comparação estritamente menor", () => {
    expect(CREDITUM_POLICY_V1.low_ticket_floor_cents).toBe(149_999)
  })

  it("severidade fixa medium", () => {
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe("medium")
  })

  it("§7 — a severidade vem do ARTEFATO: medium não é pinado em TypeScript", () => {
    // Este teste substitui o antigo, que afirmava que qualquer severidade diferente
    // de medium era recusada. Aquilo era pino de valor: `medium` é escolha entre
    // severidades todas implementáveis, e duplicá-la no código criava uma segunda
    // autoridade executável.
    //
    // Fixture de TESTE, não a Policy v1 real — o artefato de produção continua
    // declarando medium, e o teste acima afirma isso.
    for (const sev of ["low", "high", "critical"] as const) {
      const outra = validateCreditumPolicy(
        comMudanca((a) => {
          ;(a["low_ticket"] as unknown as { severity: string }).severity = sev
        }),
      )
      expect(outra.low_ticket_severity, sev).toBe(sev)
    }
  })

  it("severidade ausente ou fora do vocabulário continua recusada", () => {
    for (const ruim of [undefined, "", "urgente", "MEDIUM", 3, null]) {
      const d = recusa((a) => {
        ;(a["low_ticket"] as unknown as Record<string, unknown>)["severity"] = ruim
      })
      expect(d.join(" "), JSON.stringify(ruim)).toContain("low_ticket.severity")
    }
  })

  it("recusa comparação diferente de estritamente menor", () => {
    const d = recusa((a) => {
      ;(a["low_ticket"] as unknown as { comparison: string }).comparison = "less_or_equal"
    })
    expect(d.join(" ")).toContain("estritamente menor")
  })

  it("a severidade do low-ticket NÃO é derivada das bandas gerais", () => {
    // Se fosse, `medium` corresponderia a 1000..2499 bp de alguma base. A regra
    // é individual e não tem base percentual nenhuma.
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe("medium")
    expect(CREDITUM_POLICY_V1.low_ticket_floor_cents).not.toBe(
      CREDITUM_POLICY_V1.financial_materiality_cents,
    )
  })
})

describe("§9/§23 — cobertura", () => {
  const t = coverageThresholdsFromPolicy(CREDITUM_POLICY_V1)

  /** Reproduz a decisão do detector a partir dos limiares projetados. */
  const qualidade = (esperadas: number, faltantes: number): string => {
    const ratio = Math.floor(((esperadas - faltantes) * 10000) / esperadas)
    if (ratio < t.emit_event_below_bp) return "insufficient"
    if (ratio < t.degraded_below_bp) return "degraded"
    return "ok"
  }

  it("os exemplos governados", () => {
    for (const [esperadas, faltantes, esperado] of [
      [20, 0, "ok"],
      [20, 1, "degraded"],
      [20, 2, "insufficient"],
      [10, 1, "insufficient"],
      [11, 1, "degraded"],
    ] as const) {
      expect(qualidade(esperadas, faltantes), `${esperadas}/${faltantes}`).toBe(esperado)
    }
  })

  it("fronteira: 9,99% degrada, 10,00% é insuficiente", () => {
    expect(qualidade(1000, 99)).toBe("degraded")
    expect(qualidade(1000, 100)).toBe("insufficient")
  })

  it("aritmética inteira: nenhum float na projeção", () => {
    expect(Number.isSafeInteger(t.degraded_below_bp)).toBe(true)
    expect(Number.isSafeInteger(t.emit_event_below_bp)).toBe(true)
  })

  it("recusa limiar zero — apagaria a faixa degraded", () => {
    const d = recusa((a) => {
      ;(a["coverage"] as unknown as { missing_share_insufficient_at_bp: number }).missing_share_insufficient_at_bp = 0
    })
    expect(d.join(" ")).toContain("degraded")
  })
})

describe("§11 — expected_units: modelo aprovado, valores não", () => {
  it("o modelo é period + dataset_id + unit_id", () => {
    expect(CREDITUM_POLICY_V1.expected_units_model).toEqual(["period", "dataset_id", "unit_id"])
  })

  it("os VALORES continuam sem fonte governada", () => {
    expect(CREDITUM_POLICY_V1.expected_units_values_source).toBe("UNRESOLVED")
  })

  it("a política NÃO enumera unidades esperadas", () => {
    // O erro que isto previne: usar o catálogo ativo — hoje 49 unidades — como
    // denominador de cobertura. Catálogo ativo não é expected_units.
    const eu = ARTEFATO["expected_units"] as Record<string, unknown>
    expect(eu["values"]).toBeUndefined()
    expect(eu["units"]).toBeUndefined()
    for (const v of Object.values(eu)) {
      if (Array.isArray(v)) expect(v).toEqual(["period", "dataset_id", "unit_id"])
    }
  })
})

describe("§12/§13 — discordância entre fontes", () => {
  it("tolerância numérica de 2% = 200 bp", () => {
    expect(CREDITUM_POLICY_V1.numeric_tolerance_bp).toBe(200)
  })

  it("tolerância estrutural é ZERO", () => {
    expect(CREDITUM_POLICY_V1.structural_tolerance_bp).toBe(0)
  })

  it("recusa tolerância estrutural diferente de zero", () => {
    const d = recusa((a) => {
      ;(a["source_disagreement"] as unknown as { structural_tolerance_bp: number }).structural_tolerance_bp = 1
    })
    expect(d.join(" ")).toContain("ZERO")
  })

  it("datas e identidades estão na lista estrutural", () => {
    for (const campo of ["sale_date", "first_due_date", "unit_id", "contract_id"]) {
      expect(CREDITUM_POLICY_V1.structural_fields, campo).toContain(campo)
    }
  })

  it("recusa lista estrutural vazia", () => {
    const d = recusa((a) => {
      ;(a["source_disagreement"] as unknown as { structural_fields: unknown[] }).structural_fields = []
    })
    expect(d.join(" ")).toContain("structural_fields")
  })
})

describe("§14/§25 — janelas do Detector C", () => {
  it("a janela aprovada é de 7 dias", () => {
    expect(productionNextNDays()).toBe(7)
  })

  it("o N vem do ARTEFATO — nenhum código o pina em 7", () => {
    // Antes do gate final, `days !== 7` era recusado por uma constante
    // TypeScript. Isso era uma segunda autoridade executável: o artefato dizia 7
    // e o código também, e a igualdade era coincidência mantida à mão.
    //
    // Agora `days` é lido. Um artefato com 6 descreve uma política DIFERENTE, e o
    // runtime a executa como 6 — nunca "corrige" para 7.
    for (const n of [1, 5, 6, 8, 10, 30]) {
      const outro = validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as { first_due_windows: { approved_event_windows: { days: number }[] } }
          ).first_due_windows.approved_event_windows[1]!.days = n
        }),
      )
      expect(productionNextNDays(outro), String(n)).toBe(n)
      const cfg = buildFirstDueExecutionConfig(outro, {
        window: "next_n_days",
        reference_date: "2026-09-01",
      })
      expect(cfg.firstDueConcentration.window, String(n)).toEqual({ mode: "next_n_days", days: n })
    }
  })

  it("N inválido continua falhando fechado — sem cair para 7", () => {
    for (const ruim of [0, -1, 7.5, "7", null]) {
      const d = recusa((a) => {
        ;(
          a["first_due_windows"] as unknown as { approved_event_windows: { days: unknown }[] }
        ).approved_event_windows[1]!.days = ruim
      })
      expect(d.join(" "), JSON.stringify(ruim)).toContain("days")
    }
  })

  it("dias são CIVIS — dia útil é recusado", () => {
    const d = recusa((a) => {
      ;(a["first_due_windows"] as unknown as { day_basis: string }).day_basis = "business_days"
    })
    expect(d.join(" ")).toContain("civil_calendar_days")
  })

  it("nenhuma dependência de feriado ou calendário externo", () => {
    // A palavra "feriados" aparece na nota do artefato — para PROIBI-los. O que
    // não pode existir é campo configurável de calendário.
    const w = ARTEFATO["first_due_windows"] as Record<string, unknown>
    for (const chave of ["holidays", "holiday_calendar", "business_days", "calendar_source"]) {
      expect(w[chave], chave).toBeUndefined()
    }
    expect(w["day_basis"]).toBe("civil_calendar_days")
  })

  it("nenhuma linguagem de previsão", () => {
    const texto = readFileSync(
      new URL("../../governance/policy/creditum-policy.v1.json", import.meta.url),
      "utf8",
    ).toLowerCase()
    for (const proibido of ["forecast", "previs", "probabil", "inadimpl"]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })
})

describe("§16/§26 — agregadores do Detector D", () => {
  it("exatamente sum, mean e count", () => {
    expect([...CREDITUM_POLICY_V1.single_case_aggregators].sort()).toEqual([
      "amount_mean_cents",
      "amount_sum_cents",
      "case_count",
    ])
  })

  it("recusa agregador não aprovado", () => {
    for (const ag of ["median", "max", "min", "percentile_95", "stddev"]) {
      const d = recusa((a) => {
        ;(a["single_case_aggregators"] as unknown as string[]).push(ag)
      })
      expect(d.join(" "), ag).toContain("não aprovado")
    }
  })
})

describe("§17 — validação recusa política incompatível", () => {
  it("schema_version não suportada", () => {
    expect(recusa((a) => ((a as Record<string, unknown>)["schema_version"] = "9.9.9")).join(" ")).toContain(
      "schema_version",
    )
  })

  it("dinheiro que não é inteiro em centavos", () => {
    for (const v of [50000.5, "5000000", null]) {
      const d = recusa((a) => {
        ;(a["materiality"] as unknown as Record<string, unknown>)["financial_materiality_cents"] = v
      })
      expect(d.join(" "), String(v)).toContain("financial_materiality_cents")
    }
  })

  it("participação fora da faixa de basis points", () => {
    const d = recusa((a) => {
      ;(a["materiality"] as unknown as Record<string, unknown>)["relevant_participation_bp"] = 10001
    })
    expect(d.join(" ")).toContain("10000")
  })

  it("contagem de casos não inteira ou não positiva", () => {
    for (const v of [0, -1, 2.5]) {
      const d = recusa((a) => {
        ;(a["materiality"] as unknown as Record<string, unknown>)["relevant_case_count"] = v
      })
      expect(d.join(" "), String(v)).toContain("relevant_case_count")
    }
  })

  it("população mínima inválida", () => {
    const d = recusa((a) => {
      ;(a["materiality"] as unknown as Record<string, unknown>)["minimum_population_contracts"] = 0
    })
    expect(d.join(" ")).toContain("minimum_population_contracts")
  })

  it("semântica de materialidade diferente de OR", () => {
    const d = recusa((a) => {
      ;(a["materiality"] as unknown as Record<string, unknown>)["semantics"] = "AND"
    })
    expect(d.join(" ")).toContain("OR")
  })

  it("a recusa lista TODOS os problemas, não só o primeiro", () => {
    const d = recusa((a) => {
      ;(a["materiality"] as unknown as Record<string, unknown>)["relevant_case_count"] = 0
      ;(a["materiality"] as unknown as Record<string, unknown>)["semantics"] = "AND"
      // `severity = "high"` deixou de ser recusa no gate final: o valor vem do
      // artefato. Uma comparação inválida continua sendo erro estrutural.
      ;(a["low_ticket"] as unknown as Record<string, unknown>)["comparison"] = "less_or_equal"
    })
    expect(d.length).toBeGreaterThanOrEqual(3)
  })

  it("raiz que não é objeto", () => {
    for (const v of [[], "texto", 42, null]) {
      expect(() => validateCreditumPolicy(v)).toThrow(GatewayError)
    }
  })
})

describe("§18/§19 — fonte única e isolamento do TEST_CONFIG", () => {
  /** Código do módulo, sem comentários: prosa explicando a regra não é a regra. */
  const codigoDaPolitica = (): string =>
    readFileSync(new URL("../src/production-policy.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")

  it("o módulo de política não IMPORTA nada de tests/", () => {
    const imports = [...codigoDaPolitica().matchAll(/^import[^\n]*from\s+"([^"]+)"/gm)].map(
      (m) => m[1] ?? "",
    )
    expect(imports.length).toBeGreaterThan(0)
    for (const i of imports) expect(i, i).not.toContain("test")
  })

  it("nenhuma referência executável a TEST_CONFIG", () => {
    expect(codigoDaPolitica()).not.toContain("TEST_CONFIG")
  })


  it("não existe DEFAULT_CONFIG exportado", async () => {
    const cfg: Record<string, unknown> = await import("../src/config")
    const pol: Record<string, unknown> = await import("../src/production-policy")
    for (const nome of [...Object.keys(cfg), ...Object.keys(pol)]) {
      expect(nome).not.toMatch(/DEFAULT_CONFIG/)
    }
  })

  it("os valores aprovados não estão escritos no CÓDIGO — vêm do artefato", () => {
    // Defesa secundária. A prova principal é a projeção exata, mais acima: esta
    // varredura pega o caso grosseiro de alguém colar um número no módulo.
    // Comentários ficam de fora — explicar por que 1000 e 2500 são dimensões
    // diferentes é documentação, não política embutida.
    const codigo = codigoDaPolitica()
    for (const numero of ["5000000", "5_000_000", "149999", "149_999"]) {
      expect(codigo, numero).not.toContain(numero)
    }
  })


  it("política de produção ausente falha fechado, sem cair para teste", () => {
    expect(() => validateCreditumPolicy(undefined)).toThrow(GatewayError)
    expect(() => validateCreditumPolicy({})).toThrow(GatewayError)
  })
})

describe("§1/§2 — estratégia de base de severidade para A e C", () => {
  for (const [rotulo, pol] of [
    ["A", CREDITUM_POLICY_V1.installment_severity],
    ["C", CREDITUM_POLICY_V1.first_due_severity],
  ] as const) {
    it(`${rotulo} — a estratégia é max_available_participation`, () => {
      expect(pol.severity_strategy).toBe("max_available_participation")
    })

    it(`${rotulo} — as candidatas são as duas participações governadas`, () => {
      expect([...pol.candidates].sort()).toEqual(["share_amount_bp", "share_count_bp"])
    })

    it(`${rotulo} — o desempate é fechado e é uma das candidatas`, () => {
      expect(pol.candidates).toContain(pol.tie_break_dimension)
    })
  }

  it("recusa estratégia desconhecida", () => {
    const d = recusa((a) => {
      ;(
        (a["detector_severity"] as unknown as Record<string, Record<string, unknown>>)[
          "installment_concentration"
        ] as Record<string, unknown>
      )["severity_strategy"] = "first_available"
    })
    expect(d.join(" ")).toContain("max_available_participation")
  })

  it("recusa desempate fora das candidatas", () => {
    const d = recusa((a) => {
      ;(
        (a["detector_severity"] as unknown as Record<string, Record<string, unknown>>)[
          "first_due_concentration"
        ] as Record<string, unknown>
      )["tie_break_dimension"] = "relative_delta_bp"
    })
    expect(d.join(" ")).toContain("tie_break_dimension")
  })
})

describe("§4/§5 — Detector D não usa relative_delta como participação", () => {
  it("a base aprovada é share_of_total_bp", () => {
    expect(CREDITUM_POLICY_V1.single_case_severity_basis).toBe("share_of_total_bp")
  })

  it("recusa relative_delta_bp como base", () => {
    const d = recusa((a) => {
      ;(
        (a["detector_severity"] as unknown as Record<string, Record<string, unknown>>)[
          "material_single_case"
        ] as Record<string, unknown>
      )["basis"] = "relative_delta_bp"
    })
    expect(d.join(" ")).toContain("não é participação")
  })

  it("recusa estratégia diferente da aprovada", () => {
    const d = recusa((a) => {
      ;(
        (a["detector_severity"] as unknown as Record<string, Record<string, unknown>>)[
          "material_single_case"
        ] as Record<string, unknown>
      )["severity_strategy"] = "max_available_participation"
    })
    expect(d.join(" ")).toContain("share_of_total_when_applicable")
  })
})

describe("§7/§9 — severidade estrutural do Detector B", () => {
  it("é medium, fixa e qualitativa", () => {
    expect(CREDITUM_POLICY_V1.structural_severity).toBe("medium")
  })

  const mudarEstrutural = (valor: unknown): unknown =>
    comMudanca((a) => {
      ;(
        (a["detector_severity"] as unknown as Record<string, Record<string, unknown>>)[
          "cross_source_conflict"
        ] as Record<string, unknown>
      )["structural_severity"] = valor
    })

  it("§8 — a severidade vem do ARTEFATO: medium não é pinado em TypeScript", () => {
    // Fixture de TESTE. O artefato real continua declarando medium.
    for (const sev of ["low", "high", "critical"] as const) {
      expect(validateCreditumPolicy(mudarEstrutural(sev)).structural_severity, sev).toBe(sev)
    }
  })

  it("ausente ou fora do vocabulário continua recusada", () => {
    for (const ruim of [undefined, "", "urgente", 3, null]) {
      expect(() => validateCreditumPolicy(mudarEstrutural(ruim)), JSON.stringify(ruim)).toThrow(
        GatewayError,
      )
    }
  })

  it("a regra continua QUALITATIVA: não é calculada da tolerância", () => {
    // Conflito de data não tem denominador. A severidade é declarada, não derivada
    // — e nenhuma banda percentual participa dela.
    expect(CREDITUM_POLICY_V1.structural_tolerance_bp).toBe(0)
    expect(CREDITUM_POLICY_V1.structural_severity).toBe("medium")
    const bandaEm1000 = CREDITUM_POLICY_V1.severity_scale.find((b) => b.at_least === 1000)
    // Coincidirem em `medium` é coincidência numérica, não derivação: a estrutural
    // segue o artefato mesmo quando as bandas ficam iguais.
    expect(bandaEm1000?.severity).toBe("medium")
    expect(validateCreditumPolicy(mudarEstrutural("critical")).structural_severity).toBe("critical")
  })

  it("tolerância zero NÃO é reinterpretada como critical", () => {
    expect(CREDITUM_POLICY_V1.structural_tolerance_bp).toBe(0)
    expect(CREDITUM_POLICY_V1.structural_severity).not.toBe("critical")
  })

  it("não vaza para o conflito numérico, que mantém a base relativa", () => {
    expect(CREDITUM_POLICY_V1.numeric_tolerance_bp).toBe(200)
  })

  it("§17 — é entrada de política INDEPENDENTE do low-ticket", () => {
    // As duas valem `medium` por coincidência de decisão, não por compartilharem
    // origem. Agora que nenhuma é pinada, a independência tem prova direta: mexer
    // numa não move a outra.
    const soLowTicket = validateCreditumPolicy(
      comMudanca((a) => {
        ;(a["low_ticket"] as unknown as Record<string, unknown>)["severity"] = "high"
      }),
    )
    expect(soLowTicket.low_ticket_severity).toBe("high")
    expect(soLowTicket.structural_severity).toBe("medium")

    const soEstrutural = validateCreditumPolicy(mudarEstrutural("critical"))
    expect(soEstrutural.structural_severity).toBe("critical")
    expect(soEstrutural.low_ticket_severity).toBe("medium")
  })
})

describe("§11/§12/§20 — política completa vs configuração montável", () => {
  it("as quatro decisões de severidade fecharam: nada pendente", () => {
    expect(POLICY_DECISIONS_PENDING).toEqual([])
    expect(POLICY_V1_COMPLETE).toBe(true)
  })

  it("a asserção de política completa passa — sem ter sido enfraquecida", () => {
    expect(() => assertProductionPolicyComplete(POLICY_DECISIONS_PENDING)).not.toThrow()
    // A validação ficou mais estrita, não menos: quatro blocos novos e
    // obrigatórios entraram no artefato.
    expect(() => validateCreditumPolicy({ ...ARTEFATO, detector_severity: {} })).toThrow(
      GatewayError,
    )
  })

  it("§14 — a configuração de produção agora é MONTÁVEL: nada pendente", () => {
    // Os três campos que bloqueavam a projeção foram aprovados na Fase 2.7c.
    // A lista esvaziou porque o artefato passou a decidi-los, não porque a
    // validação afrouxou — `validateDetectorConfig` continua no caminho.
    expect(PRODUCTION_CONFIG_FIELDS_PENDING).toEqual([])
    expect(() => buildProductionDetectorConfig()).not.toThrow()
  })

  it("§14 — o mecanismo de recusa continua vivo para a próxima lacuna", () => {
    try {
      assertProductionConfigComplete(["algumCampo.pendente"])
    } catch (e) {
      expect((e as GatewayError).details).toEqual(["algumCampo.pendente"])
      return
    }
    throw new Error("esperava recusa")
  })

  it("política completa e dado disponível são perguntas separadas", () => {
    // `expected_units` sem fonte não é lacuna de política.
    expect(POLICY_V1_COMPLETE).toBe(true)
    expect(CREDITUM_POLICY_V1.expected_units_values_source).toBe("UNRESOLVED")
  })
})

describe("§18 — projeção exata: nenhum valor injetado por TypeScript", () => {
  it("cada valor da política vem do artefato", () => {
    const m = ARTEFATO["materiality"] as Record<string, number>
    expect(CREDITUM_POLICY_V1.relevant_participation_bp).toBe(m["relevant_participation_bp"])
    expect(CREDITUM_POLICY_V1.financial_materiality_cents).toBe(m["financial_materiality_cents"])
    expect(CREDITUM_POLICY_V1.relevant_case_count).toBe(m["relevant_case_count"])
    expect(CREDITUM_POLICY_V1.minimum_population_contracts).toBe(m["minimum_population_contracts"])

    const lt = ARTEFATO["low_ticket"] as Record<string, unknown>
    expect(CREDITUM_POLICY_V1.low_ticket_floor_cents).toBe(lt["floor_cents"])
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe(lt["severity"])

    const sd = ARTEFATO["source_disagreement"] as Record<string, unknown>
    expect(CREDITUM_POLICY_V1.numeric_tolerance_bp).toBe(sd["numeric_tolerance_bp"])
    expect(CREDITUM_POLICY_V1.structural_fields).toEqual(sd["structural_fields"])

    const ds = ARTEFATO["detector_severity"] as Record<string, Record<string, unknown>>
    expect(CREDITUM_POLICY_V1.structural_severity).toBe(
      ds["cross_source_conflict"]?.["structural_severity"],
    )
    expect(CREDITUM_POLICY_V1.installment_severity.tie_break_dimension).toBe(
      ds["installment_concentration"]?.["tie_break_dimension"],
    )
    expect(CREDITUM_POLICY_V1.first_due_severity.tie_break_dimension).toBe(
      ds["first_due_concentration"]?.["tie_break_dimension"],
    )
  })

  it("as bandas projetadas são exatamente as do artefato", () => {
    const bandas = ARTEFATO["severity_bands"] as { at_least_bp: number; severity: string }[]
    expect(CREDITUM_POLICY_V1.severity_scale.map((b) => [b.at_least, b.severity])).toEqual(
      bandas.map((b) => [b.at_least_bp, b.severity]),
    )
  })

  it("a projeção não acrescenta nem remove campo de severidade", () => {
    expect(CREDITUM_POLICY_V1.severity_scale).toHaveLength(
      (ARTEFATO["severity_bands"] as unknown[]).length,
    )
  })
})


// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.7c — projeção exata e independência dos dois "5"
// ═════════════════════════════════════════════════════════════════════════════

describe("§13 — os dois \"5\" são campos independentes", () => {
  const PROD = buildProductionDetectorConfig()

  it("hoje os dois valem 5", () => {
    expect(CREDITUM_POLICY_V1.relevant_case_count).toBe(5)
    const regra = PROD.installmentConcentration.contributing_case_rule
    expect(regra.mode === "top_n" && regra.n).toBe(5)
  })

  it("mexer em relevant_case_count NÃO move o top_n", () => {
    const outro = validateCreditumPolicy(
      comMudanca((a) => {
        ;(a as unknown as { materiality: { relevant_case_count: number } }).materiality.relevant_case_count = 7
      }),
    )
    expect(outro.relevant_case_count).toBe(7)
    const regra = outro.contributing_case_rule
    expect(regra.mode === "top_n" && regra.n).toBe(5)
  })

  it("mexer no top_n NÃO move relevant_case_count", () => {
    const outro = validateCreditumPolicy(
      comMudanca((a) => {
        ;(
          a as unknown as {
            detector_config: { installment_concentration: { contributing_case_rule: { top_n: number } } }
          }
        ).detector_config.installment_concentration.contributing_case_rule.top_n = 9
      }),
    )
    expect(outro.relevant_case_count).toBe(5)
    const regra = outro.contributing_case_rule
    expect(regra.mode === "top_n" && regra.n).toBe(9)
  })

  it("a configuração projetada também mantém os dois separados", () => {
    const outro = validateCreditumPolicy(
      comMudanca((a) => {
        ;(a as unknown as { materiality: { relevant_case_count: number } }).materiality.relevant_case_count = 7
      }),
    )
    const cfg = buildProductionDetectorConfig(outro)
    // A materialidade de contagem seguiu para 7...
    expect(cfg.installmentConcentration.material_count_above).toBe(7)
    // ...e a apresentação continuou em 5.
    const regra = cfg.installmentConcentration.contributing_case_rule
    expect(regra.mode === "top_n" && regra.n).toBe(5)
  })

  it("a invariante é do módulo, não da suíte", () => {
    expect(assertDistinctFiveFields(CREDITUM_POLICY_V1)).toBe(true)
  })
})

describe("§2 — until_share_bp = 8000 não é política de produção", () => {
  it("estratégia fora de top_n é recusada pelo validador", () => {
    expect(() =>
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as {
              detector_config: { installment_concentration: { contributing_case_rule: unknown } }
            }
          ).detector_config.installment_concentration.contributing_case_rule = {
            strategy: "until_share_bp",
            share_bp: 8000,
          }
        }),
      ),
    ).toThrow(GatewayError)
  })

  it("a recusa nomeia o campo e a única estratégia aprovada", () => {
    try {
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as {
              detector_config: { installment_concentration: { contributing_case_rule: unknown } }
            }
          ).detector_config.installment_concentration.contributing_case_rule = {
            strategy: "until_share_bp",
            share_bp: 8000,
          }
        }),
      )
    } catch (e) {
      const d = (e as GatewayError).details ?? []
      expect(d.some((x) => x.includes("contributing_case_rule") && x.includes("top_n"))).toBe(true)
      return
    }
    throw new Error("esperava recusa")
  })

  it("nenhum 8000 bp entra na configuração de produção", () => {
    const cfg = buildProductionDetectorConfig()
    // `similarity_threshold_bp` é 8000 e é aprovado — não é limiar de Pareto.
    // A asserção é sobre a regra de contribuintes.
    expect(JSON.stringify(cfg.installmentConcentration.contributing_case_rule)).not.toContain("8000")
  })
})

describe("§15 — projeção exata: nenhum valor de negócio injetado por TypeScript", () => {
  const PROD = buildProductionDetectorConfig()
  const dc = ARTEFATO["detector_config"] as Record<string, Record<string, unknown>>
  const m = ARTEFATO["materiality"] as Record<string, number>

  it("os três campos novos vêm do artefato", () => {
    expect(PROD.installmentConcentration.contributing_case_rule).toEqual({
      mode: "top_n",
      n: (dc["installment_concentration"]?.["contributing_case_rule"] as { top_n: number }).top_n,
    })
    expect(PROD.crossSourceConflict.material_absolute_basis_points).toBe(
      dc["cross_source_conflict"]?.["material_absolute_basis_points"],
    )
    expect(PROD.materialSingleCase.material_relative_delta_bp).toBe(
      dc["material_single_case"]?.["material_relative_delta_bp"],
    )
  })

  it("os valores RELOCADOS são idênticos aos aprovados antes — nada foi redecidido", () => {
    const eng = dc["engine"] as Record<string, unknown>
    expect(eng["business_timezone"]).toBe(BUSINESS_TIMEZONE)
    expect(eng["similarity_threshold_bp"]).toBe(APPROVED_THRESHOLDS.similarity_threshold_bp)
    expect(dc["installment_concentration"]?.["installment_threshold"]).toBe(
      APPROVED_THRESHOLDS.installment_threshold,
    )
    // E a configuração projetada usa exatamente esses.
    expect(PROD.businessTimezone).toBe(BUSINESS_TIMEZONE)
    expect(PROD.similarity_threshold_bp).toBe(APPROVED_THRESHOLDS.similarity_threshold_bp)
    expect(PROD.installmentConcentration.installment_threshold).toBe(
      APPROVED_THRESHOLDS.installment_threshold,
    )
  })

  it("cada dimensão de participação vem de relevant_participation_bp", () => {
    const p = m["relevant_participation_bp"]
    expect(PROD.installmentConcentration.material_share_count_bp).toBe(p)
    expect(PROD.installmentConcentration.material_share_amount_bp).toBe(p)
    expect(PROD.crossSourceConflict.material_relative_difference_bp).toBe(p)
    expect(PROD.crossSourceConflict.material_share_bp).toBe(p)
    expect(PROD.firstDueConcentration.material_share_count_bp).toBe(p)
    expect(PROD.firstDueConcentration.material_share_amount_bp).toBe(p)
    expect(PROD.materialSingleCase.material_share_of_total_bp).toBe(p)
  })

  it("cada dimensão monetária vem de financial_materiality_cents", () => {
    const c = m["financial_materiality_cents"]
    expect(PROD.installmentConcentration.material_amount_cents).toBe(c)
    expect(PROD.crossSourceConflict.material_amount_cents).toBe(c)
    expect(PROD.firstDueConcentration.material_amount_cents).toBe(c)
    expect(PROD.materialSingleCase.material_absolute_delta_cents).toBe(c)
  })

  it("cada dimensão de contagem vem de relevant_case_count", () => {
    const n = m["relevant_case_count"]
    expect(PROD.installmentConcentration.material_count_above).toBe(n)
    expect(PROD.crossSourceConflict.material_absolute_count).toBe(n)
    expect(PROD.firstDueConcentration.material_count).toBe(n)
    expect(PROD.materialSingleCase.material_count_delta).toBe(n)
  })

  it("amostra mínima e população após remoção vêm de minimum_population_contracts", () => {
    const n = m["minimum_population_contracts"]
    expect(PROD.installmentConcentration.minimum_sample_size).toBe(n)
    expect(PROD.firstDueConcentration.minimum_sample_size).toBe(n)
    expect(PROD.materialSingleCase.min_population_after_removal).toBe(n)
  })

  it("as escalas de severidade são a mesma projeção das bandas aprovadas", () => {
    expect(PROD.installmentConcentration.severity_scale).toEqual(CREDITUM_POLICY_V1.severity_scale)
    expect(PROD.firstDueConcentration.severity_scale).toEqual(CREDITUM_POLICY_V1.severity_scale)
    expect(PROD.materialSingleCase.severity_scale).toEqual(CREDITUM_POLICY_V1.severity_scale)
    expect(PROD.crossSourceConflict.severity_by_relative_bp).toEqual(CREDITUM_POLICY_V1.severity_scale)
    // Nenhuma banda `info`: a política aprovada começa em `low`.
    expect(PROD.installmentConcentration.severity_scale.map((b) => b.severity)).not.toContain("info")
  })

  it("cobertura vem da primitive de tradução, não de números duplicados", () => {
    expect(PROD.coverage).toEqual(coverageThresholdsFromPolicy(CREDITUM_POLICY_V1))
    expect(PROD.installmentConcentration.minimum_coverage_bp).toBe(PROD.coverage.emit_event_below_bp)
  })

  it("a configuração projetada é a MESMA a cada montagem", () => {
    expect(buildProductionDetectorConfig()).toEqual(buildProductionDetectorConfig())
  })

  it("config_version é a versão da política, não um número novo", () => {
    expect(PROD.config_version).toBe(CREDITUM_POLICY_V1.policy_version)
    expect(PROD.config_version).toBe(ARTEFATO["policy_version"])
  })
})

describe("§7 — janelas do Detector C: nenhuma é escolhida implicitamente", () => {
  const JANELAS = [{ mode: "same_day" }, { mode: "next_n_days", days: 7 }]

  it("H — a configuração de produção NÃO carrega janela", () => {
    // O defeito que a 2.7c.1 corrige: a projeção elegia `same_day` porque era a
    // única que dispensa `reference_date`. Ausência de data de referência é
    // característica de FORMA, não semântica de negócio — a forma do
    // `DetectorConfig` estava decidindo qual análise a Creditum executa.
    expect(buildProductionDetectorConfig().firstDueConcentration.window).toBeUndefined()
  })

  it("H — nem existe mais função que derive janela de reference_date", () => {
    const fonte = readFileSync(new URL("../src/production-policy.ts", import.meta.url), "utf8")
    // O nome da regra removida não pode voltar como código. Comentário histórico
    // é permitido; declaração, não.
    expect(fonte).not.toMatch(/function\s+janelaBase/)
    expect(fonte).not.toMatch(/dispensa.*reference_date.*\)\s*[:{]/)
  })

  it("o conjunto aprovado tem exatamente as duas janelas executivas", () => {
    expect(productionFirstDueWindows()).toEqual(JANELAS)
  })

  it("calendar_month é CONTEXTO, e não vira janela executiva", () => {
    expect(productionFirstDueContext()).toEqual(["calendar_month"])
    expect(productionFirstDueWindows().map((j) => j.mode)).not.toContain("calendar_month")
  })

  it("A — same_day aprovada constrói configuração de execução", () => {
    const cfg = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, { window: "same_day" })
    expect(cfg.firstDueConcentration.window).toEqual({ mode: "same_day" })
  })

  it("B — next_n_days com reference_date válida constrói", () => {
    const cfg = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, {
      window: "next_n_days",
      reference_date: "2026-09-01",
    })
    expect(cfg.firstDueConcentration.window).toEqual({ mode: "next_n_days", days: 7 })
  })

  it("C — next_n_days sem reference_date não compila, e vazia falha fechado", () => {
    // A união discriminada torna a omissão um erro de tipo. Em runtime, uma
    // string inválida vinda de fronteira não tipada também é recusa.
    for (const ruim of ["", "hoje", "01/09/2026", "2026-09-01T00:00:00Z", "2026-9-1"]) {
      expect(() =>
        buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, {
          window: "next_n_days",
          reference_date: ruim,
        }),
      ).toThrow(GatewayError)
    }
  })

  it("D — `days` ausente é recusado; 7 não é fabricado", () => {
    const d = recusa((a) => {
      delete (
        a["first_due_windows"] as unknown as { approved_event_windows: Record<string, unknown>[] }
      ).approved_event_windows[1]!["days"]
    })
    expect(d.join(" ")).toContain("days")
  })

  it("D — same_day com `days` é recusado: o modo não tem parâmetro", () => {
    const d = recusa((a) => {
      ;(
        a["first_due_windows"] as unknown as { approved_event_windows: Record<string, unknown>[] }
      ).approved_event_windows[0]!["days"] = 7
    })
    expect(d.join(" ")).toContain("same_day")
  })

  it("F — o construtor de execução também falha fechado sem a janela", () => {
    // Uma política VALIDADA nunca chega aqui incompleta: a totalidade garante as
    // duas janelas. O guarda existe para política montada à mão, e continua
    // recusando em vez de escolher a que sobrou.
    const mutilada = {
      ...CREDITUM_POLICY_V1,
      first_due_event_windows: [{ mode: "same_day" as const }],
    }
    expect(() =>
      buildFirstDueExecutionConfig(mutilada, {
        window: "next_n_days",
        reference_date: "2026-09-01",
      }),
    ).toThrow(GatewayError)
  })

  it("F — calendar_month no conjunto executivo é recusado no load", () => {
    expect(() =>
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as { first_due_windows: { approved_event_windows: unknown[] } }
          ).first_due_windows.approved_event_windows.push({ mode: "calendar_month" })
        }),
      ),
    ).toThrow(GatewayError)
  })

  it("F — modo inventado é recusado; business_days não entra por acidente", () => {
    for (const modo of ["business_days", "next_n_business_days", "week", "trimester"]) {
      expect(() =>
        validateCreditumPolicy(
          comMudanca((a) => {
            ;(
              a as unknown as { first_due_windows: { approved_event_windows: unknown[] } }
            ).first_due_windows.approved_event_windows.push({ mode: modo, days: 7 })
          }),
        ),
      ).toThrow(GatewayError)
    }
  })

  it("G — a ordem no artefato não altera o conjunto semântico", () => {
    const invertida = validateCreditumPolicy(
      comMudanca((a) => {
        const w = (
          a as unknown as { first_due_windows: { approved_event_windows: unknown[] } }
        ).first_due_windows
        w.approved_event_windows = [...w.approved_event_windows].reverse()
      }),
    )
    // Mesmo conjunto, independente da ordem de listagem.
    expect([...productionFirstDueWindows(invertida)].sort((x, y) => (x.mode < y.mode ? -1 : 1))).toEqual(
      [...JANELAS].sort((x, y) => (x.mode < y.mode ? -1 : 1)),
    )
    // E nenhuma das duas execuções muda de resultado.
    expect(
      buildFirstDueExecutionConfig(invertida, { window: "same_day" }).firstDueConcentration.window,
    ).toEqual({ mode: "same_day" })
    expect(
      buildFirstDueExecutionConfig(invertida, {
        window: "next_n_days",
        reference_date: "2026-09-01",
      }).firstDueConcentration.window,
    ).toEqual({ mode: "next_n_days", days: 7 })
  })

  it("G — janela duplicada é recusada: a lista é um conjunto", () => {
    expect(() =>
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as { first_due_windows: { approved_event_windows: unknown[] } }
          ).first_due_windows.approved_event_windows.push({ mode: "same_day" })
        }),
      ),
    ).toThrow(GatewayError)
  })

  it("lista vazia de janelas executivas é recusada", () => {
    expect(() =>
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as { first_due_windows: { approved_event_windows: unknown[] } }
          ).first_due_windows.approved_event_windows = []
        }),
      ),
    ).toThrow(GatewayError)
  })

  it("dias corridos continuam sendo a base — feriado exigiria calendário governado", () => {
    expect(() =>
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(a as unknown as { first_due_windows: { day_basis: string } }).first_due_windows.day_basis =
            "business_days"
        }),
      ),
    ).toThrow(GatewayError)
  })

  it("§17 — configuração montável NÃO significa que expected_units existe", () => {
    expect(() => buildProductionDetectorConfig()).not.toThrow()
    expect(CREDITUM_POLICY_V1.expected_units_values_source).toBe("UNRESOLVED")
    // O modelo está aprovado; os valores não existem.
    expect(CREDITUM_POLICY_V1.expected_units_model).toEqual(["period", "dataset_id", "unit_id"])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §8 — auditoria de fonte única dos valores relocados
//
// A 2.7c moveu `installment_threshold`, `similarity_threshold_bp` e
// `business_timezone` para o artefato, mas deixou os literais em `config.ts`
// vivos ao lado. Duas fontes executáveis para a mesma decisão: editar o JSON não
// movia o runtime, e a igualdade entre os dois lugares era coincidência mantida
// por atenção humana — exatamente o defeito D13 da Fase 2.6c.
//
// Provar por igualdade entre duas constantes independentes não vale: se ambas
// forem literais iguais, o teste passa e o problema continua. As provas abaixo
// são de DERIVAÇÃO — o valor de runtime tem de acompanhar o arquivo em disco, e
// o literal não pode existir no fonte.
// ═════════════════════════════════════════════════════════════════════════════

describe("§8 — os valores relocados vêm do artefato, não de literais", () => {
  const DISCO = JSON.parse(
    readFileSync(
      new URL("../../governance/policy/creditum-policy.v1.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, Record<string, Record<string, unknown>>>

  const engine = DISCO["detector_config"]?.["engine"] as Record<string, unknown>
  const parcelas = DISCO["detector_config"]?.["installment_concentration"] as Record<string, unknown>

  it("as constantes de runtime acompanham o arquivo EM DISCO", () => {
    // Lido do disco nesta execução, não do módulo importado. Se alguém voltasse
    // a escrever 19 em TypeScript e o artefato dissesse 21, isto quebraria.
    expect(APPROVED_THRESHOLDS.installment_threshold).toBe(parcelas["installment_threshold"])
    expect(APPROVED_THRESHOLDS.similarity_threshold_bp).toBe(engine["similarity_threshold_bp"])
    expect(BUSINESS_TIMEZONE).toBe(engine["business_timezone"])
  })

  it("o resto de APPROVED_THRESHOLDS também é derivado", () => {
    const m = DISCO["materiality"] as unknown as Record<string, number>
    const lt = DISCO["low_ticket"] as unknown as Record<string, number>
    expect(APPROVED_THRESHOLDS.material_share_bp).toBe(m["relevant_participation_bp"])
    expect(APPROVED_THRESHOLDS.material_amount_cents).toBe(m["financial_materiality_cents"])
    expect(APPROVED_THRESHOLDS.material_count).toBe(m["relevant_case_count"])
    expect(APPROVED_THRESHOLDS.minimum_sample_size).toBe(m["minimum_population_contracts"])
    expect(APPROVED_THRESHOLDS.low_ticket_floor_cents).toBe(lt["floor_cents"])
  })

  it("nenhum literal concorrente sobrou no fonte de configuração", () => {
    const semComentarios = (caminho: string): string =>
      readFileSync(new URL(caminho, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")

    const config = semComentarios("../src/config.ts")
    const derivados = semComentarios("../src/governed-thresholds.ts")

    // O fuso não pode estar escrito em lugar nenhum a não ser no artefato.
    expect(config).not.toContain("America/Sao_Paulo")
    expect(derivados).not.toContain("America/Sao_Paulo")

    // Nem os números aprovados como atribuição.
    for (const fonte of [config, derivados]) {
      expect(fonte).not.toMatch(/installment_threshold:\s*\d/)
      expect(fonte).not.toMatch(/similarity_threshold_bp:\s*\d/)
      expect(fonte).not.toMatch(/low_ticket_floor_cents:\s*\d/)
    }
  })

  it("a ProductionDetectorConfig obtém os três do artefato", () => {
    const PROD = buildProductionDetectorConfig()
    expect(PROD.installmentConcentration.installment_threshold).toBe(
      parcelas["installment_threshold"],
    )
    expect(PROD.similarity_threshold_bp).toBe(engine["similarity_threshold_bp"])
    expect(PROD.businessTimezone).toBe(engine["business_timezone"])
  })

  it("mudar o artefato move a configuração projetada", () => {
    const outro = validateCreditumPolicy(
      comMudanca((a) => {
        const dc = (a as unknown as { detector_config: Record<string, Record<string, unknown>> })
          .detector_config
        dc["engine"]!["similarity_threshold_bp"] = 7500
        dc["engine"]!["business_timezone"] = "America/Fortaleza"
      }),
    )
    const cfg = buildFirstDueExecutionConfig(outro, { window: "same_day" })
    expect(cfg.similarity_threshold_bp).toBe(7500)
    expect(cfg.businessTimezone).toBe("America/Fortaleza")
  })

  it("o limiar de parcelas é FIXADO pelo artefato — nem a projeção o contorna", () => {
    // `validateDetectorConfig` compara `installment_threshold` contra o valor
    // governado e recusa divergência. Isso torna impossível projetar uma política
    // hipotética com outro limiar, e é intencional: 19 é regra de negócio do
    // briefing, não parâmetro configurável. Fixar contra o artefato carregado é
    // seguro justamente porque não existe segunda fonte — o valor pinado e o
    // valor projetado saem do mesmo arquivo.
    const outro = validateCreditumPolicy(
      comMudanca((a) => {
        ;(
          a as unknown as {
            detector_config: { installment_concentration: { installment_threshold: number } }
          }
        ).detector_config.installment_concentration.installment_threshold = 21
      }),
    )
    // A política validada acompanha o artefato...
    expect(outro.installment_threshold).toBe(21)
    // ...e a projeção recusa, porque o artefato EM VIGOR diz 19.
    expect(() => buildProductionDetectorConfig(outro)).toThrow(GatewayError)
    expect(APPROVED_THRESHOLDS.installment_threshold).toBe(
      CREDITUM_POLICY_V1.installment_threshold,
    )
  })

  it("o artefato é a única autoridade: fuso inválido nele derruba a política", () => {
    expect(() =>
      validateCreditumPolicy(
        comMudanca((a) => {
          ;(
            a as unknown as { detector_config: { engine: { business_timezone: string } } }
          ).detector_config.engine.business_timezone = "Marte/Olympus"
        }),
      ),
    ).toThrow(GatewayError)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Gate final — o artefato é a ÚNICA autoridade, e o conjunto de C é exato
//
// O que o gate encontrou: `validarJanelasAprovadas` iterava os membros
// fornecidos e dizia "cada um é válido". Um artefato com `same_day` só validava,
// `POLICY_V1_COMPLETE` continuava `true`, a configuração era montável — e uma
// análise obrigatória de produção desaparecia em silêncio. Pior, o antigo
// `diasDaJanelaCorrida` devolvia 7 quando a janela não existia, fabricando o
// parâmetro de uma janela que a política não aprovava.
//
// A correção exige TOTALIDADE sobre o vocabulário do protocolo: cada modo que o
// Detector C sabe executar precisa estar governado exatamente uma vez. Não existe
// lista de "janelas requeridas" em TypeScript, e `days` é lido, nunca pinado.
// ═════════════════════════════════════════════════════════════════════════════

describe("§17 — conjunto exato das janelas de C", () => {
  /** Remove uma janela do artefato pelo modo. */
  const semJanela = (modo: string): string[] =>
    recusa((a) => {
      const w = a["first_due_windows"] as unknown as {
        approved_event_windows: { mode: string }[]
      }
      w.approved_event_windows = w.approved_event_windows.filter((j) => j.mode !== modo)
    })

  it("A — o artefato atual é válido, e projeta as duas janelas", () => {
    expect(() => validateCreditumPolicy(ARTEFATO)).not.toThrow()
    expect(CREDITUM_POLICY_V1.first_due_event_windows).toEqual([
      { mode: "same_day" },
      { mode: "next_n_days", days: 7 },
    ])
  })

  it("B — remover same_day INVALIDA a política", () => {
    const d = semJanela("same_day")
    // A mensagem tem de ser a da TOTALIDADE. Asserção genérica de "ausente"
    // deixaria uma segunda defesa a jusante mascarar a falta desta.
    expect(d.join(" ")).toContain("same_day: janela executável ausente do conjunto governado")
  })

  it("B — sem same_day nada é construível, e next_n_days não a substitui", () => {
    const artefato = comMudanca((a) => {
      const w = a["first_due_windows"] as unknown as {
        approved_event_windows: { mode: string }[]
      }
      w.approved_event_windows = w.approved_event_windows.filter((j) => j.mode !== "same_day")
    })
    expect(() => validateCreditumPolicy(artefato)).toThrow(GatewayError)
    // Sem política validada não existe configuração — nem parcial.
    expect(() => buildProductionDetectorConfig(validateCreditumPolicy(artefato))).toThrow(
      GatewayError,
    )
  })

  it("C — remover next_n_days INVALIDA a política (o HIGH do gate)", () => {
    const d = semJanela("next_n_days")
    expect(d.join(" ")).toContain("next_n_days: janela executável ausente do conjunto governado")
  })

  it("K — sem next_n_days NADA fabrica 7", () => {
    // Não existe mais campo derivado guardando os dias: `productionNextNDays`
    // lê a janela governada. Numa política mutilada à mão o resultado é
    // `undefined` — nunca 7.
    const mutilada = {
      ...CREDITUM_POLICY_V1,
      first_due_event_windows: [{ mode: "same_day" as const }],
    }
    expect(productionNextNDays(mutilada)).toBeUndefined()
    // E a política com a janela removida nem carrega.
    const artefato = comMudanca((a) => {
      const w = a["first_due_windows"] as unknown as {
        approved_event_windows: { mode: string }[]
      }
      w.approved_event_windows = w.approved_event_windows.filter((j) => j.mode !== "next_n_days")
    })
    expect(() => validateCreditumPolicy(artefato)).toThrow(GatewayError)
  })

  it("K — a função que fabricava 7 não existe mais", () => {
    const fonte = readFileSync(new URL("../src/production-policy.ts", import.meta.url), "utf8")
    expect(fonte).not.toMatch(/function\s+diasDaJanelaCorrida/)
    // E nenhum retorno de 7 por conveniência, em nenhuma forma.
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    expect(semComentarios).not.toMatch(/return\s+7\b/)
    expect(semComentarios).not.toMatch(/\?\?\s*7\b/)
  })

  it("E — same_day duplicado é recusado", () => {
    const d = recusa((a) => {
      ;(
        a["first_due_windows"] as unknown as { approved_event_windows: unknown[] }
      ).approved_event_windows.push({ mode: "same_day" })
    })
    expect(d.join(" ")).toContain("duplicado")
  })

  it("F — next_n_days duplicado é recusado", () => {
    const d = recusa((a) => {
      ;(
        a["first_due_windows"] as unknown as { approved_event_windows: unknown[] }
      ).approved_event_windows.push({ mode: "next_n_days", days: 7 })
    })
    expect(d.join(" ")).toContain("duplicado")
  })

  it("F — mesmo modo com days diferentes também é duplicata", () => {
    const d = recusa((a) => {
      ;(
        a["first_due_windows"] as unknown as { approved_event_windows: unknown[] }
      ).approved_event_windows.push({ mode: "next_n_days", days: 14 })
    })
    expect(d.join(" ")).toContain("duplicado")
  })

  it("membro extra fora do vocabulário é recusado", () => {
    for (const modo of ["calendar_month", "business_days", "week", "trimester"]) {
      const d = recusa((a) => {
        ;(
          a["first_due_windows"] as unknown as { approved_event_windows: unknown[] }
        ).approved_event_windows.push({ mode: modo, days: 7 })
      })
      expect(d.join(" "), modo).toContain("não executável")
    }
  })

  it("lista vazia é recusada", () => {
    const d = recusa((a) => {
      ;(
        a["first_due_windows"] as unknown as { approved_event_windows: unknown[] }
      ).approved_event_windows = []
    })
    expect(d.join(" ")).toContain("approved_event_windows")
  })

  it("I — ordem invertida é aceita e semanticamente idêntica", () => {
    const invertida = validateCreditumPolicy(
      comMudanca((a) => {
        const w = a["first_due_windows"] as unknown as { approved_event_windows: unknown[] }
        w.approved_event_windows = [...w.approved_event_windows].reverse()
      }),
    )
    // A projeção é estável: derivada do vocabulário, não da ordem do JSON.
    expect(invertida.first_due_event_windows).toEqual(CREDITUM_POLICY_V1.first_due_event_windows)
    expect(productionNextNDays(invertida)).toBe(productionNextNDays())
    // E nenhuma das duas se torna padrão.
    expect(buildProductionDetectorConfig(invertida).firstDueConcentration.window).toBeUndefined()
  })
})

describe("§10/§17 — conjunto exato do contexto", () => {
  it("G — remover calendar_month INVALIDA a política", () => {
    const d = recusa((a) => {
      ;(a["first_due_windows"] as unknown as { context: unknown[] }).context = []
    })
    expect(d.join(" ")).toContain("context")
  })

  it("G — contexto ausente é recusado; calendar_month não é fabricado", () => {
    const d = recusa((a) => {
      delete (a["first_due_windows"] as unknown as Record<string, unknown>)["context"]
    })
    expect(d.join(" ")).toContain("context")
  })

  it("H — contexto extra é recusado", () => {
    for (const extra of ["fiscal_quarter", "calendar_week", "same_day"]) {
      const d = recusa((a) => {
        ;(a["first_due_windows"] as unknown as { context: unknown[] }).context.push(extra)
      })
      expect(d.join(" "), extra).toContain("context")
    }
  })

  it("calendar_month duplicado é recusado", () => {
    const d = recusa((a) => {
      ;(a["first_due_windows"] as unknown as { context: string[] }).context.push("calendar_month")
    })
    expect(d.join(" ")).toContain("duplicado")
  })
})

describe("§11/§J — projeção exata do artefato para o runtime", () => {
  const DISCO = JSON.parse(
    readFileSync(
      new URL("../../governance/policy/creditum-policy.v1.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>

  const fdw = DISCO["first_due_windows"] as {
    approved_event_windows: { mode: string; days?: number }[]
    context: string[]
  }

  /** Normalização estrutural: ordena por modo. Nenhuma outra transformação. */
  const normalizar = (
    janelas: readonly { readonly mode: string; readonly days?: number }[],
  ): unknown[] =>
    [...janelas]
      .map((j) => (j.days === undefined ? { mode: j.mode } : { mode: j.mode, days: j.days }))
      .sort((a, b) => (a.mode < b.mode ? -1 : 1))

  it("J — as janelas do runtime são exatamente as do artefato", () => {
    expect(normalizar(CREDITUM_POLICY_V1.first_due_event_windows)).toEqual(
      normalizar(fdw.approved_event_windows),
    )
  })

  it("J — o contexto do runtime é exatamente o do artefato", () => {
    expect([...CREDITUM_POLICY_V1.first_due_context].sort()).toEqual([...fdw.context].sort())
  })

  it("J — nenhum valor intermediário novo entra na projeção", () => {
    // Cardinalidade igual: nada acrescentado, nada descartado.
    expect(CREDITUM_POLICY_V1.first_due_event_windows).toHaveLength(
      fdw.approved_event_windows.length,
    )
    expect(CREDITUM_POLICY_V1.first_due_context).toHaveLength(fdw.context.length)
    // E o parâmetro é o do arquivo, não um número deste código.
    const corrida = fdw.approved_event_windows.find((j) => j.mode === "next_n_days")
    expect(productionNextNDays()).toBe(corrida?.days)
  })

  it("a execução consome o `days` governado, não uma constante", () => {
    const cfg = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, {
      window: "next_n_days",
      reference_date: "2026-09-01",
    })
    expect(cfg.firstDueConcentration.window).toEqual({
      mode: "next_n_days",
      days: fdw.approved_event_windows.find((j) => j.mode === "next_n_days")?.days,
    })
  })
})

describe("§15 — agregadores de D: vocabulário no código, subconjunto no artefato", () => {
  it("o subconjunto habilitado vem do artefato", () => {
    const doDisco = (
      JSON.parse(
        readFileSync(
          new URL("../../governance/policy/creditum-policy.v1.json", import.meta.url),
          "utf8",
        ),
      ) as Record<string, string[]>
    )["single_case_aggregators"]
    expect(CREDITUM_POLICY_V1.single_case_aggregators).toEqual(doDisco)
    expect(buildProductionDetectorConfig().materialSingleCase.supported_metrics).toEqual(doDisco)
  })

  it("remover `amount_mean_cents` do artefato NÃO é reintroduzido pelo runtime", () => {
    const semMedia = validateCreditumPolicy(
      comMudanca((a) => {
        a["single_case_aggregators"] = (
          a["single_case_aggregators"] as unknown as string[]
        ).filter((x) => x !== "amount_mean_cents") as never
      }),
    )
    expect(semMedia.single_case_aggregators).toEqual(["amount_sum_cents", "case_count"])
    const cfg = buildProductionDetectorConfig(semMedia)
    expect(cfg.materialSingleCase.supported_metrics).not.toContain("amount_mean_cents")
    // O Detector D passa a recusar a métrica — não a recebe de volta por constante.
    expect(cfg.materialSingleCase.supported_metrics).toHaveLength(2)
  })

  it("nome fora do vocabulário implementado é recusado", () => {
    const d = recusa((a) => {
      ;(a["single_case_aggregators"] as unknown as string[]).push("amount_median_cents")
    })
    expect(d.join(" ")).toContain("single_case_aggregators")
  })

  it("lista vazia é recusada — não cai para os três", () => {
    const d = recusa((a) => {
      a["single_case_aggregators"] = [] as never
    })
    expect(d.join(" ")).toContain("single_case_aggregators")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §6/§7/§8/§9 — projeção exata e autoridade do artefato sobre os três valores
//
// Os três últimos pinos executáveis saíram: `days !== 7`,
// `low_ticket.severity !== "medium"` e `structural_severity !== "medium"`. Eram
// escolhas de negócio duplicadas em TypeScript — segunda autoridade executável
// para uma decisão que já vivia no artefato governado.
//
// O que o código valida hoje: estrutura, tipo, vocabulário implementado, campo
// obrigatório. O que o artefato decide: qual valor.
//
// As fixtures abaixo NÃO alteram a Policy v1 real. São cópias em memória, e o
// artefato de produção continua declarando 7 / medium / medium — provado no
// primeiro bloco, contra o arquivo em disco.
// ═════════════════════════════════════════════════════════════════════════════

describe("§6 — projeção exata: o runtime é o artefato, sem transformação de valor", () => {
  const DISCO = JSON.parse(
    readFileSync(
      new URL("../../governance/policy/creditum-policy.v1.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>

  const lowTicket = DISCO["low_ticket"] as Record<string, unknown>
  const csc = (DISCO["detector_severity"] as Record<string, Record<string, unknown>>)[
    "cross_source_conflict"
  ] as Record<string, unknown>
  const janelaCorrida = (
    DISCO["first_due_windows"] as { approved_event_windows: { mode: string; days?: number }[] }
  ).approved_event_windows.find((j) => j.mode === "next_n_days")

  it("low_ticket.severity: artefato === runtime", () => {
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe(lowTicket["severity"])
  })

  it("structural_severity: artefato === runtime", () => {
    expect(CREDITUM_POLICY_V1.structural_severity).toBe(csc["structural_severity"])
  })

  it("next_n_days.days: artefato === política de execução governada", () => {
    expect(productionNextNDays()).toBe(janelaCorrida?.days)
    const cfg = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, {
      window: "next_n_days",
      reference_date: "2026-09-01",
    })
    expect(cfg.firstDueConcentration.window).toEqual({
      mode: "next_n_days",
      days: janelaCorrida?.days,
    })
  })

  it("§10 — o artefato REAL continua com os três valores aprovados", () => {
    expect(janelaCorrida?.days).toBe(7)
    expect(lowTicket["severity"]).toBe("medium")
    expect(csc["structural_severity"]).toBe("medium")
  })

  it("a configuração de produção projeta a severidade estrutural do artefato", () => {
    expect(buildProductionDetectorConfig().crossSourceConflict.structural_severity).toBe(
      csc["structural_severity"],
    )
  })
})

describe("§9 — fixture 7→6 prova que o artefato manda nos dias", () => {
  const seisDias = (): CreditumPolicy =>
    validateCreditumPolicy(
      comMudanca((a) => {
        ;(
          a as unknown as { first_due_windows: { approved_event_windows: { days: number }[] } }
        ).first_due_windows.approved_event_windows[1]!.days = 6
      }),
    )

  it("a política carrega — 6 é inteiro positivo e o protocolo suporta next_n_days", () => {
    expect(() => seisDias()).not.toThrow()
    expect(productionNextNDays(seisDias())).toBe(6)
  })

  it("a execução usa 6 — nenhum reescrita para 7", () => {
    const cfg = buildFirstDueExecutionConfig(seisDias(), {
      window: "next_n_days",
      reference_date: "2026-09-01",
    })
    expect(cfg.firstDueConcentration.window).toEqual({ mode: "next_n_days", days: 6 })
  })

  it("e o artefato REAL não foi tocado", () => {
    expect(productionNextNDays()).toBe(7)
  })
})

describe("§7 — fixture medium→high prova que o artefato manda no low-ticket", () => {
  const alta = (): CreditumPolicy =>
    validateCreditumPolicy(
      comMudanca((a) => {
        ;(a["low_ticket"] as unknown as Record<string, unknown>)["severity"] = "high"
      }),
    )

  it("a política carrega e projeta high", () => {
    expect(alta().low_ticket_severity).toBe("high")
  })

  it("o piso e a comparação não se movem com a severidade", () => {
    expect(alta().low_ticket_floor_cents).toBe(CREDITUM_POLICY_V1.low_ticket_floor_cents)
  })

  it("e o artefato REAL continua medium", () => {
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe("medium")
  })
})

describe("§8 — fixture medium→high prova que o artefato manda no conflito estrutural", () => {
  const alta = (): CreditumPolicy =>
    validateCreditumPolicy(
      comMudanca((a) => {
        ;(
          (a["detector_severity"] as unknown as Record<string, Record<string, unknown>>)[
            "cross_source_conflict"
          ] as Record<string, unknown>
        )["structural_severity"] = "high"
      }),
    )

  it("a política carrega e projeta high", () => {
    expect(alta().structural_severity).toBe("high")
  })

  it("a configuração projetada leva high para o Detector B", () => {
    expect(buildProductionDetectorConfig(alta()).crossSourceConflict.structural_severity).toBe(
      "high",
    )
  })

  it("não contamina a escala relativa nem a tolerância", () => {
    const p = alta()
    expect(p.numeric_tolerance_bp).toBe(CREDITUM_POLICY_V1.numeric_tolerance_bp)
    expect(p.severity_scale).toEqual(CREDITUM_POLICY_V1.severity_scale)
  })

  it("e o artefato REAL continua medium", () => {
    expect(CREDITUM_POLICY_V1.structural_severity).toBe("medium")
  })
})

describe("§12 — auditoria: nenhum pino de valor de negócio sobrou no fonte", () => {
  const semComentarios = (caminho: string): string =>
    readFileSync(new URL(caminho, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")

  const FONTES = [
    "../src/production-policy.ts",
    "../src/config.ts",
    "../src/governed-thresholds.ts",
  ] as const

  it("nenhuma comparação com `medium` como autoridade", () => {
    for (const f of FONTES) {
      expect(semComentarios(f), f).not.toMatch(/[!=]==\s*"medium"/)
    }
  })

  it("nenhum pino nem fabricação de 7", () => {
    for (const f of FONTES) {
      const src = semComentarios(f)
      expect(src, f).not.toMatch(/days\s*[!=]==\s*7\b/)
      expect(src, f).not.toMatch(/\?\?\s*7\b/)
      expect(src, f).not.toMatch(/return\s+7\b/)
    }
  })

  it("o vocabulário de severidade permanece — é capacidade, não escolha", () => {
    // `SEVERIDADES` diz o que o motor sabe executar. Qual severidade cada regra
    // usa é do artefato, e os blocos acima provam isso.
    const src = semComentarios("../src/production-policy.ts")
    expect(src).toMatch(/SEVERIDADES/)
  })
})
