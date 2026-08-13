import { describe, it, expect } from "vitest"
import {
  parseBRLToCents,
  formatCentsBRL,
  parsePercentToBps,
  formatBpsPercent,
  parseCount,
  parseDateISO,
  parseText,
  toComparableKey,
  parseCpf,
  isValidCpf,
  multiplyCents,
  sumCents,
  CENTS_SANITY_CEILING,
} from "../parse"

// ─── Dinheiro ─────────────────────────────────────────────────────────────────

describe("parseBRLToCents", () => {
  it("aceita os formatos observados na fonte real", () => {
    expect(parseBRLToCents("R$ 578,70")).toBe(57870)
    expect(parseBRLToCents("R$410,00")).toBe(41000) // sem espaço após R$
    expect(parseBRLToCents("607,13")).toBe(60713) // sem símbolo
    expect(parseBRLToCents("578.7")).toBe(57870) // ponto decimal
    expect(parseBRLToCents("R$ 8.151,60")).toBe(815160) // ponto = milhar
    expect(parseBRLToCents("R$ 10.200,00")).toBe(1020000)
  })

  it("trata zero como dado, não como ausência", () => {
    expect(parseBRLToCents("R$ 0,00")).toBe(0)
    expect(parseBRLToCents(0)).toBe(0)
  })

  it("devolve null para ausência — nunca zero", () => {
    expect(parseBRLToCents("")).toBeNull()
    expect(parseBRLToCents("   ")).toBeNull()
    expect(parseBRLToCents(null)).toBeNull()
    expect(parseBRLToCents(undefined)).toBeNull()
  })

  it("devolve null para lixo em vez de adivinhar", () => {
    expect(parseBRLToCents("abc")).toBeNull()
    expect(parseBRLToCents("R$ ---")).toBeNull()
    expect(parseBRLToCents(NaN)).toBeNull()
    expect(parseBRLToCents(Infinity)).toBeNull()
  })

  it("recusa mais de 2 casas decimais em vez de arredondar em silêncio", () => {
    expect(parseBRLToCents("578,705")).toBeNull()
  })

  it("resolve ponto como milhar quando o último grupo tem 3 dígitos", () => {
    expect(parseBRLToCents("1.234")).toBe(123400) // R$ 1.234,00
    expect(parseBRLToCents("578.7")).toBe(57870) // R$ 578,70
  })

  it("aceita célula numérica", () => {
    expect(parseBRLToCents(578.7)).toBe(57870)
    expect(parseBRLToCents(421.76)).toBe(42176)
  })

  it("aceita negativo", () => {
    expect(parseBRLToCents("-R$ 100,00")).toBe(-10000)
  })
})

describe("formatCentsBRL", () => {
  it("formata no padrão brasileiro", () => {
    expect(formatCentsBRL(57870)).toBe("R$ 578,70")
    expect(formatCentsBRL(815160)).toBe("R$ 8.151,60")
    expect(formatCentsBRL(1020000)).toBe("R$ 10.200,00")
    expect(formatCentsBRL(0)).toBe("R$ 0,00")
  })

  it("propaga ausência", () => {
    expect(formatCentsBRL(null)).toBeNull()
  })
})

// ─── Invariante de negócio: ticket = repasse × parcelas ───────────────────────
//
// As 14 vendas reais da aba financeira de agosto/2026 (sem PII — apenas valores).
// Se este teste quebrar, o ticket do sistema parou de bater com a fonte.

const VENDAS_AGOSTO_2026: Array<{ repasse: string; parcelas: string; ticket: string }> = [
  { repasse: "R$ 407,58", parcelas: "20", ticket: "R$ 8.151,60" },
  { repasse: "R$ 429,10", parcelas: "21", ticket: "R$ 9.011,10" },
  { repasse: "R$ 392,57", parcelas: "20", ticket: "R$ 7.851,40" },
  { repasse: "R$ 311,25", parcelas: "7", ticket: "R$ 2.178,75" },
  { repasse: "R$ 377,50", parcelas: "18", ticket: "R$ 6.795,00" },
  { repasse: "R$ 422,40", parcelas: "21", ticket: "R$ 8.870,40" },
  { repasse: "R$ 307,50", parcelas: "14", ticket: "R$ 4.305,00" },
  { repasse: "R$ 464,69", parcelas: "10", ticket: "R$ 4.646,90" },
  { repasse: "R$ 425,00", parcelas: "24", ticket: "R$ 10.200,00" },
  { repasse: "R$ 297,50", parcelas: "6", ticket: "R$ 1.785,00" },
  { repasse: "R$ 327,57", parcelas: "10", ticket: "R$ 3.275,70" },
  { repasse: "R$ 452,82", parcelas: "15", ticket: "R$ 6.792,30" },
  { repasse: "R$ 377,50", parcelas: "5", ticket: "R$ 1.887,50" },
  { repasse: "R$ 421,76", parcelas: "17", ticket: "R$ 7.169,92" },
]

describe("ticket = valor_repasse × parcelas_grau (D5)", () => {
  it.each(VENDAS_AGOSTO_2026)(
    "reproduz exatamente $repasse × $parcelas = $ticket",
    ({ repasse, parcelas, ticket }) => {
      const repasseCents = parseBRLToCents(repasse)
      const n = parseCount(parcelas)
      expect(repasseCents).not.toBeNull()
      expect(n).not.toBeNull()
      expect(formatCentsBRL(multiplyCents(repasseCents, n))).toBe(ticket)
    },
  )

  it("soma das 14 vendas é exata em centavos", () => {
    const tickets = VENDAS_AGOSTO_2026.map(
      (v) => multiplyCents(parseBRLToCents(v.repasse), parseCount(v.parcelas))!,
    )
    const total = sumCents(tickets)
    expect(total).toBe(8_292_057)
    expect(formatCentsBRL(total)).toBe("R$ 82.920,57")
  })

  it("centavos inteiros evitam a deriva de float", () => {
    // A primeira venda da planilha já deriva: R$ 407,58 × 20 parcelas.
    expect(407.58 * 20).toBe(8151.599999999999)
    expect(407.58 * 20).not.toBe(8151.6)

    // Em centavos o mesmo cálculo é exato.
    expect(40758 * 20).toBe(815160)
    expect(formatCentsBRL(40758 * 20)).toBe("R$ 8.151,60")
  })
})

// ─── Percentual ───────────────────────────────────────────────────────────────

describe("parsePercentToBps", () => {
  it("aceita os percentuais da fonte", () => {
    expect(parsePercentToBps("20%")).toBe(2000)
    expect(parsePercentToBps("29%")).toBe(2900)
    expect(parsePercentToBps("11%")).toBe(1100)
    expect(parsePercentToBps("10%")).toBe(1000)
    expect(parsePercentToBps("30%")).toBe(3000)
  })

  it("aceita percentual fracionado", () => {
    expect(parsePercentToBps("20,5%")).toBe(2050)
  })

  it("aceita número sem símbolo quando > 1", () => {
    expect(parsePercentToBps("25")).toBe(2500)
  })

  it("recusa fração ambígua em texto em vez de adivinhar", () => {
    // "0,25" pode ser 25% ou 0,25% — sem o símbolo não há como saber
    expect(parsePercentToBps("0,25")).toBeNull()
  })

  it("aceita fração quando vem como número da API do Sheets", () => {
    // célula formatada como porcentagem: a API devolve 0.25 para 25%
    expect(parsePercentToBps(0.25)).toBe(2500)
    expect(parsePercentToBps(25)).toBe(2500)
  })

  it("devolve null para ausência", () => {
    expect(parsePercentToBps("")).toBeNull()
    expect(parsePercentToBps(null)).toBeNull()
    expect(parsePercentToBps("%")).toBeNull()
  })
})

describe("formatBpsPercent", () => {
  it("formata percentual", () => {
    expect(formatBpsPercent(2000)).toBe("20%")
    expect(formatBpsPercent(1279)).toBe("12,79%")
    expect(formatBpsPercent(1061)).toBe("10,61%")
    expect(formatBpsPercent(null)).toBeNull()
  })
})

// ─── Contagem ─────────────────────────────────────────────────────────────────

describe("parseCount", () => {
  it("aceita inteiros, incluindo zero", () => {
    expect(parseCount("0")).toBe(0)
    expect(parseCount("14")).toBe(14)
    expect(parseCount(0)).toBe(0)
    expect(parseCount(24)).toBe(24)
  })

  it("devolve null para ausência e para não-inteiro", () => {
    expect(parseCount("")).toBeNull()
    expect(parseCount(null)).toBeNull()
    expect(parseCount("abc")).toBeNull()
    expect(parseCount(1.5)).toBeNull()
  })
})

// ─── Data ─────────────────────────────────────────────────────────────────────

describe("parseDateISO", () => {
  it("converte dd/MM/yyyy da fonte", () => {
    expect(parseDateISO("01/08/2026")).toBe("2026-08-01")
    expect(parseDateISO("13/08/2026")).toBe("2026-08-13")
    expect(parseDateISO("3/8/2026")).toBe("2026-08-03")
  })

  it("aceita ISO já pronto", () => {
    expect(parseDateISO("2026-08-13")).toBe("2026-08-13")
    expect(parseDateISO("2026-08-13T14:42:00Z")).toBe("2026-08-13")
  })

  it("rejeita data que não existe no calendário", () => {
    expect(parseDateISO("31/02/2026")).toBeNull()
    expect(parseDateISO("32/01/2026")).toBeNull()
    expect(parseDateISO("01/13/2026")).toBeNull()
  })

  it("converte serial do Excel/Sheets", () => {
    // âncora conhecida: 2000-01-01 é o serial 36526
    expect(parseDateISO(36526)).toBe("2000-01-01")
    expect(parseDateISO(1)).toBe("1899-12-31")
  })

  it("devolve null para ausência e lixo", () => {
    expect(parseDateISO("")).toBeNull()
    expect(parseDateISO(null)).toBeNull()
    expect(parseDateISO("ontem")).toBeNull()
    expect(parseDateISO(0)).toBeNull()
  })
})

// ─── Texto ────────────────────────────────────────────────────────────────────

describe("parseText", () => {
  it("colapsa espaço duplicado da fonte", () => {
    expect(parseText("Sheila Aparecida  Lotito ")).toBe("Sheila Aparecida Lotito")
    expect(parseText(" Vitória Ferrer")).toBe("Vitória Ferrer")
  })

  it("remove zero-width e NBSP", () => {
    expect(parseText("Grau\u00A0Meriti")).toBe("Grau Meriti")
    expect(parseText("Carlos\u200B")).toBe("Carlos")
    expect(parseText("\uFEFFLucas Z")).toBe("Lucas Z")
  })

  it("devolve null para vazio", () => {
    expect(parseText("")).toBeNull()
    expect(parseText("   ")).toBeNull()
    expect(parseText(null)).toBeNull()
  })
})

describe("toComparableKey", () => {
  it("normaliza as variações de unidade encontradas na fonte", () => {
    expect(toComparableKey("Grau Sumaré")).toBe("grau sumare")
    expect(toComparableKey("Grau Sumare")).toBe("grau sumare")
    expect(toComparableKey("Grau Alecrim")).toBe("grau alecrim")
    expect(toComparableKey("Grau alecrim")).toBe("grau alecrim")
    expect(toComparableKey("Grau Marabá")).toBe("grau maraba")
    expect(toComparableKey("Grau Maraba")).toBe("grau maraba")
  })

  it("normaliza as variações de canal", () => {
    expect(toComparableKey("Indicação")).toBe("indicacao")
    expect(toComparableKey("indicação")).toBe("indicacao")
  })

  it("normaliza a sentinela de não-atribuído", () => {
    expect(toComparableKey("Ninguem")).toBe("ninguem")
    expect(toComparableKey("Ninguém")).toBe("ninguem")
  })
})

// ─── CPF ──────────────────────────────────────────────────────────────────────

describe("parseCpf", () => {
  it("aceita CPF de 11 dígitos válido", () => {
    const r = parseCpf("13300596700")
    expect(r.digits).toBe("13300596700")
    expect(r.valid).toBe(true)
    expect(r.recovered).toBe(false)
  })

  it("aceita CPF mascarado", () => {
    const r = parseCpf("034.642.844-09")
    expect(r.digits).toBe("03464284409")
    expect(r.valid).toBe(true)
    expect(r.recovered).toBe(false)
  })

  // Os 3 CPFs de 10 dígitos da aba financeira: o Sheets comeu o zero à esquerda.
  // O padding só é aceito porque os dígitos verificadores conferem depois dele.
  it.each([
    ["2175980723", "02175980723"],
    ["3446230254", "03446230254"],
    ["8773155403", "08773155403"],
  ])("recupera o zero à esquerda de %s quando o dígito verificador confirma", (raw, expected) => {
    const r = parseCpf(raw)
    expect(r.digits).toBe(expected)
    expect(r.valid).toBe(true)
    expect(r.recovered).toBe(true)
  })

  it("recusa o padding quando o resultado não é um CPF válido", () => {
    // "1111111112" + zero à esquerda = "01111111112" → verificador não confere.
    // Aqui o padding seria invenção, não recuperação.
    const r = parseCpf("1111111112")
    expect(r.digits).toBeNull()
    expect(r.valid).toBe(false)
    expect(r.recovered).toBe(false)
  })

  it("recupera 10 dígitos, mas como sinal FRACO — nunca equivalente a exato", () => {
    // "1234567890" → "01234567890" passa no mod-11. Isso prova consistência,
    // não identidade: resta ~1% de falso positivo. Por isso sai como
    // "recovered", e a dedup precisa de um segundo sinal antes de fundir.
    const r = parseCpf("1234567890")
    expect(r.digits).toBe("01234567890")
    expect(r.valid).toBe(true)
    expect(r.recovered).toBe(true)
    expect(r.confidence).toBe("recovered")
  })

  it("devolve null para ausência e lixo", () => {
    expect(parseCpf("").digits).toBeNull()
    expect(parseCpf(null).digits).toBeNull()
    expect(parseCpf("abc").digits).toBeNull()
  })

  it("marca CPF de 11 dígitos com verificador errado como inválido", () => {
    const r = parseCpf("12345678900")
    expect(r.digits).toBe("12345678900")
    expect(r.valid).toBe(false)
  })
})

describe("isValidCpf", () => {
  it("valida pelo módulo 11", () => {
    expect(isValidCpf("12345678909")).toBe(true)
    expect(isValidCpf("13300596700")).toBe(true)
    expect(isValidCpf("12345678900")).toBe(false)
  })

  it("rejeita sequência repetida", () => {
    expect(isValidCpf("11111111111")).toBe(false)
    expect(isValidCpf("00000000000")).toBe(false)
  })

  it("rejeita formato errado", () => {
    expect(isValidCpf("123")).toBe(false)
    expect(isValidCpf("123456789012")).toBe(false)
    expect(isValidCpf("1234567890a")).toBe(false)
  })
})

// ─── Regressões da revisão adversarial (Codex, 2026-08-13) ────────────────────

describe("gramática monetária: sintaxe malformada vira null, não valor plausível", () => {
  // Antes da correção, 9 destas 11 entradas viravam um valor de aparência
  // legítima — "1,2,3" chegava a R$ 12,30 — e alimentavam ticket e volume
  // contratado sem nunca acionar DATA_NOT_AVAILABLE.
  const malformados = [
    "1,2,3",
    "12.34,56",
    "1.2.345,00",
    "1..234,00",
    "1,,2",
    ",",
    ".",
    "1.234.5",
    "1,234,56",
    "1.23.456,78",
    "12345.678,90",
  ]

  it.each(malformados)("recusa %s", (entrada) => {
    expect(parseBRLToCents(entrada)).toBeNull()
  })

  it("continua aceitando as formas monetárias legítimas", () => {
    expect(parseBRLToCents("1234")).toBe(123400)
    expect(parseBRLToCents("1234,56")).toBe(123456)
    expect(parseBRLToCents("1.234.567")).toBe(123456700)
    expect(parseBRLToCents("1.234.567,89")).toBe(123456789)
    expect(parseBRLToCents("12.345,67")).toBe(1234567)
    expect(parseBRLToCents("12345.67")).toBe(1234567) // export US sem agrupamento
    expect(parseBRLToCents("578.7")).toBe(57870)
  })
})

describe("exatidão: nenhum cálculo escapa da faixa segura", () => {
  it("recusa valor que estoura o inteiro seguro", () => {
    expect(parseBRLToCents("99999999999999,99")).toBeNull()
    expect(parseBRLToCents("999999999999999999,99")).toBeNull()
  })

  it("recusa valor acima do teto de sanidade do domínio", () => {
    const acimaDoTeto = String(CENTS_SANITY_CEILING / 100 + 1)
    expect(parseBRLToCents(acimaDoTeto)).toBeNull()
  })

  it("multiplyCents devolve null em vez de número inexato", () => {
    expect(multiplyCents(40758, 20)).toBe(815160)
    expect(multiplyCents(42176, 17)).toBe(716992)
    expect(multiplyCents(Number.MAX_SAFE_INTEGER, 2)).toBeNull()
    expect(multiplyCents(null, 20)).toBeNull()
    expect(multiplyCents(40758, null)).toBeNull()
    expect(multiplyCents(40758, 1.5)).toBeNull()
  })

  it("sumCents devolve null em vez de total inexato", () => {
    expect(sumCents([815160, 901110])).toBe(1716270)
    expect(sumCents([])).toBe(0)
    expect(sumCents([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toBeNull()
  })
})

describe("CPF: recuperação restrita a 10 dígitos e rebaixada a sinal fraco", () => {
  it("CPF exato de 11 dígitos é sinal forte", () => {
    expect(parseCpf("13300596700").confidence).toBe("exact")
    expect(parseCpf("034.642.844-09").confidence).toBe("exact")
  })

  it.each([["2175980723"], ["3446230254"], ["8773155403"]])(
    "%s recupera, mas como sinal fraco",
    (raw) => {
      const r = parseCpf(raw)
      expect(r.valid).toBe(true)
      expect(r.confidence).toBe("recovered")
    },
  )

  // "00123456797" é um CPF matematicamente VÁLIDO que começa com dois zeros.
  // Se o Sheets comesse os dois, sobraria "123456797" (9 dígitos) e o padding
  // reconstruiria um CPF válido. Ainda assim rejeitamos: a taxa de aceite falso
  // é ~1% em qualquer comprimento, mas só ~1% dos CPFs começam com "00" — logo
  // em 9 dígitos o filtro admitiria mais lixo do que dado real.
  it("rejeita 9 dígitos mesmo quando o padding produziria CPF válido", () => {
    expect(isValidCpf("00123456797")).toBe(true)
    const r = parseCpf("123456797")
    expect(r.digits).toBeNull()
    expect(r.confidence).toBe("none")
  })

  it("rejeita 8 dígitos", () => {
    expect(parseCpf("12345678").confidence).toBe("none")
  })

  it("CPF de 11 dígitos com verificador errado não é identidade", () => {
    expect(parseCpf("12345678900").confidence).toBe("none")
  })
})
