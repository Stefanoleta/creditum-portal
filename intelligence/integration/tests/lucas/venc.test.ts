/**
 * `Venc` — cinco estados, e nenhum deles inventa data.
 *
 * O teste central é o de `27/08`: ele afirma que o ano NÃO foi inferido. É a
 * asserção mais importante do arquivo, porque inferir o ano é a coisa mais natural
 * do mundo para quem lê `27/08` num arquivo chamado "Agosto" — e produz uma data que
 * parece perfeitamente válida e está errada na virada de ano.
 */

import { describe, expect, it } from "vitest"
import { classifyVenc, vencQualityFact } from "../../src/lucas/venc"

describe("§30 — data COMPLETA é preservada", () => {
  it("as duas formas completas suportadas resolvem para ISO canônico", () => {
    for (const [entrada, esperado] of [
      ["2026-08-27", "2026-08-27"],
      ["27/08/2026", "2026-08-27"],
      ["27-08-2026", "2026-08-27"],
      ["1/9/2026", "2026-09-01"],
    ] as const) {
      const c = classifyVenc(entrada)
      expect(c.state, entrada).toBe("available")
      if (c.state !== "available") throw new Error("estado errado")
      expect(c.first_due_date, entrada).toBe(esperado)
      // O bruto sobrevive intacto — não é substituído pela forma canônica.
      expect(c.raw_venc, entrada).toBe(entrada)
      expect(vencQualityFact(c)).toBeNull()
    }
  })

  it("espaço em volta não impede o reconhecimento, e o bruto mantém o espaço", () => {
    const c = classifyVenc("  27/08/2026  ")
    expect(c.state).toBe("available")
    if (c.state !== "available") throw new Error("estado errado")
    expect(c.first_due_date).toBe("2026-08-27")
    expect(c.raw_venc).toBe("  27/08/2026  ")
  })
})

describe("§31 — data INCOMPLETA acusa, nunca completa", () => {
  it("`27/08` é incompleta e NENHUM ano é inventado", () => {
    const c = classifyVenc("27/08")
    expect(c.state).toBe("incomplete")
    expect(c.raw_venc).toBe("27/08")
    expect(vencQualityFact(c)).toBe("FIRST_DUE_DATE_INCOMPLETE")
    // Prova estrutural: o ramo `incomplete` não TEM campo de data. Não é
    // convenção — é o tipo. Nenhum ano do período, do arquivo ou do relógio pode
    // ser escrito, porque não existe onde.
    expect(Object.keys(c).sort()).toEqual(["raw_venc", "state"])
    expect(JSON.stringify(c)).not.toContain("2026")
  })

  it("as formas sem ano observadas na fonte", () => {
    for (const s of ["08/09", "1/9", "27-08", "9/12"]) {
      const c = classifyVenc(s)
      expect(c.state, s).toBe("incomplete")
      expect(JSON.stringify(c), s).not.toMatch(/\d{4}/)
    }
  })

  it("ano de DOIS dígitos é inválido, não incompleto nem completado", () => {
    // `27/08/26` é ambíguo entre 1926 e 2026. Aceitar exigiria uma regra de
    // janela de século, que é adivinhação com aparência de norma.
    const c = classifyVenc("27/08/26")
    expect(c.state).toBe("invalid")
    expect(c.raw_venc).toBe("27/08/26")
  })
})

describe("§32 — `PG` é outra semântica, não data errada", () => {
  it("`PG` → NOT_AVAILABLE_AS_DATE, bruto preservado", () => {
    const c = classifyVenc("PG")
    expect(c.state).toBe("not_available_as_date")
    expect(c.raw_venc).toBe("PG")
    expect(vencQualityFact(c)).toBe("FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE")
  })

  it("digitação real da planilha: caixa e espaço variam", () => {
    for (const s of ["pg", "Pg", " PG ", "pG"]) {
      const c = classifyVenc(s)
      expect(c.state, s).toBe("not_available_as_date")
      // A forma EXATA da fonte volta, não a normalizada.
      expect(c.raw_venc, s).toBe(s)
    }
  })

  it("`PG` NÃO é classificado como inválido — a distinção é o ponto", () => {
    // Em julho, 13 de 24 linhas são `PG`. Chamá-las de inválidas reportaria
    // corrupção em 54% da planilha, quando a fonte deu uma informação correta
    // numa coluna sobrecarregada.
    const c = classifyVenc("PG")
    expect(c.state).not.toBe("invalid")
    expect(c.state).not.toBe("missing")
  })

  it("sentinela desconhecido NÃO é adivinhado como `PG`", () => {
    // `PAGO`, `OK`, `QUITADO` podem significar o mesmo, e o código não decide isso.
    for (const s of ["PAGO", "OK", "QUITADO", "LIQUIDADO"]) {
      expect(classifyVenc(s).state, s).toBe("invalid")
    }
  })
})

describe("§33 — `-` e vazio são ausência", () => {
  it("traço e variantes → MISSING com o bruto preservado", () => {
    for (const s of ["-", "--", "—", "–", " - "]) {
      const c = classifyVenc(s)
      expect(c.state, s).toBe("missing")
      expect(c.raw_venc, s).toBe(s)
      expect(vencQualityFact(c), s).toBe("FIRST_DUE_DATE_MISSING")
    }
  })

  it("célula genuinamente ausente → MISSING com bruto null", () => {
    for (const v of [null, undefined, ""]) {
      const c = classifyVenc(v)
      expect(c.state).toBe("missing")
      if (c.state !== "missing") throw new Error("estado errado")
      // Não há string a preservar: `null` diz isso, e não é o mesmo que `"-"`.
      expect(c.raw_venc).toBeNull()
    }
  })

  it("só espaço preserva o bruto — a célula tem conteúdo, ainda que vazio", () => {
    const c = classifyVenc("   ")
    expect(c.state).toBe("missing")
    if (c.state !== "missing") throw new Error("estado errado")
    expect(c.raw_venc).toBe("   ")
  })
})

describe("§34/§35 — inválido acusa, e nada substitui a data", () => {
  it("data impossível é INVÁLIDA, não corrigida", () => {
    for (const s of ["32/08/2026", "27/13/2026", "31/02/2026", "00/08/2026", "2026-02-30"]) {
      const c = classifyVenc(s)
      expect(c.state, s).toBe("invalid")
      expect(c.raw_venc, s).toBe(s)
      expect(vencQualityFact(c), s).toBe("FIRST_DUE_DATE_INVALID")
    }
  })

  it("29/02 respeita ano bissexto real", () => {
    expect(classifyVenc("29/02/2026").state).toBe("invalid")
    expect(classifyVenc("29/02/2028").state).toBe("available")
  })

  it("`Date.parse` permissivo NÃO é usado", () => {
    // Todas estas o `new Date(...)` aceitaria, algumas com resultado surpreendente.
    for (const s of ["Aug 27 2026", "2026/08/27", "27 de agosto", "2026-08-27T00:00:00Z"]) {
      expect(classifyVenc(s).state, s).toBe("invalid")
    }
  })

  it("número de serial de planilha é INVÁLIDO — serial não declara epoch", () => {
    // 46261 é uma data no Sheets e outra no Excel de 1904. Interpretar exigiria
    // assumir a epoch, e a assunção errada desloca a data em quatro anos.
    const c = classifyVenc(46261)
    expect(c.state).toBe("invalid")
    expect(c.raw_venc).toBe("46261")
  })

  it("nenhum estado carrega data além de `available` — varredura da união", () => {
    const amostras: unknown[] = ["27/08", "PG", "-", "", null, "32/08/2026", "lixo", 46261]
    for (const v of amostras) {
      const c = classifyVenc(v)
      if (c.state === "available") continue
      // Prova por forma: `first_due_date` não existe fora do ramo disponível.
      expect(Object.keys(c), String(v)).not.toContain("first_due_date")
    }
  })
})
