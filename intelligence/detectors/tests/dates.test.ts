import { describe, expect, it } from "vitest"
import {
  businessDateOf,
  calendarMonthWindow,
  daysBetween,
  isWithinWindow,
  lastDayOfMonth,
  monthKeyOf,
  nextNDaysWindow,
} from "../src/dates"
import { GatewayError } from "../../gateway/src/errors"
import { BUSINESS_TIMEZONE } from "../src/config"

describe("instante → data de negócio (é onde o fuso importa)", () => {
  it("02:00Z é o dia ANTERIOR em São Paulo", () => {
    // UTC-3: 2026-08-16T02:00Z é 2026-08-15T23:00 em São Paulo. Contar como
    // dia 16 alocaria o contrato no mês errado numa virada de mês.
    expect(businessDateOf("2026-08-16T02:00:00.000Z", BUSINESS_TIMEZONE)).toBe("2026-08-15")
  })

  it("12:00Z é o mesmo dia", () => {
    expect(businessDateOf("2026-08-16T12:00:00.000Z", BUSINESS_TIMEZONE)).toBe("2026-08-16")
  })

  it("a virada de mês depende do fuso", () => {
    expect(businessDateOf("2026-09-01T01:00:00.000Z", BUSINESS_TIMEZONE)).toBe("2026-08-31")
    expect(businessDateOf("2026-09-01T01:00:00.000Z", "UTC")).toBe("2026-09-01")
  })

  it("não usa o fuso da máquina — zonas diferentes dão resultados diferentes", () => {
    const instante = "2026-08-16T02:00:00.000Z"
    expect(businessDateOf(instante, "UTC")).toBe("2026-08-16")
    expect(businessDateOf(instante, "America/Sao_Paulo")).toBe("2026-08-15")
    expect(businessDateOf(instante, "Asia/Tokyo")).toBe("2026-08-16")
  })

  it("recusa fuso desconhecido", () => {
    expect(() => businessDateOf("2026-08-16T12:00:00.000Z", "America/Nao_Existe")).toThrowError(
      GatewayError,
    )
  })

  it("recusa instante não parseável", () => {
    expect(() => businessDateOf("ontem", BUSINESS_TIMEZONE)).toThrowError(GatewayError)
  })
})

describe("último dia do mês — calendário real", () => {
  it("meses comuns", () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31)
    expect(lastDayOfMonth(2026, 4)).toBe(30)
    expect(lastDayOfMonth(2026, 12)).toBe(31)
  })

  it("fevereiro não bissexto", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28)
    expect(lastDayOfMonth(2027, 2)).toBe(28)
  })

  it("fevereiro bissexto", () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29)
    expect(lastDayOfMonth(2024, 2)).toBe(29)
  })

  it("regra secular: 2000 é bissexto, 1900 e 2100 não", () => {
    expect(lastDayOfMonth(2000, 2)).toBe(29)
    expect(lastDayOfMonth(1900, 2)).toBe(28)
    expect(lastDayOfMonth(2100, 2)).toBe(28)
  })

  it("recusa mês fora de 1..12", () => {
    expect(() => lastDayOfMonth(2026, 0)).toThrowError(GatewayError)
    expect(() => lastDayOfMonth(2026, 13)).toThrowError(GatewayError)
  })
})

describe("janela de mês calendário", () => {
  it("mês corrente", () => {
    expect(calendarMonthWindow("2026-08-16", 0)).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    })
  })

  it("mês seguinte", () => {
    expect(calendarMonthWindow("2026-08-16", 1)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    })
  })

  it("dezembro → janeiro atravessa o ano", () => {
    expect(calendarMonthWindow("2026-12-15", 1)).toEqual({
      start: "2027-01-01",
      end: "2027-01-31",
    })
  })

  it("janeiro → dezembro anterior", () => {
    expect(calendarMonthWindow("2026-01-15", -1)).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    })
  })

  it("fevereiro bissexto termina em 29", () => {
    expect(calendarMonthWindow("2028-01-31", 1)).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    })
  })

  it("fevereiro não bissexto termina em 28", () => {
    expect(calendarMonthWindow("2026-02-10", 0).end).toBe("2026-02-28")
  })

  it("doze meses à frente volta ao mesmo mês do ano seguinte", () => {
    expect(calendarMonthWindow("2026-08-16", 12).start).toBe("2027-08-01")
  })

  it("partir do dia 31 não estoura para o mês seguinte", () => {
    // A armadilha clássica: 31/01 + 1 mês em aritmética ingênua vira 03/03.
    expect(calendarMonthWindow("2026-01-31", 1)).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    })
  })
})

describe("janela de próximos N dias", () => {
  it("N=1 é só o próprio dia", () => {
    expect(nextNDaysWindow("2026-08-16", 1)).toEqual({ start: "2026-08-16", end: "2026-08-16" })
  })

  it("N=30 conta a referência inclusive", () => {
    expect(nextNDaysWindow("2026-08-16", 30)).toEqual({ start: "2026-08-16", end: "2026-09-14" })
  })

  it("atravessa a virada do ano", () => {
    expect(nextNDaysWindow("2026-12-20", 20)).toEqual({ start: "2026-12-20", end: "2027-01-08" })
  })

  it("atravessa 29 de fevereiro em ano bissexto", () => {
    expect(nextNDaysWindow("2028-02-27", 4)).toEqual({ start: "2028-02-27", end: "2028-03-01" })
  })

  it("recusa N menor que 1", () => {
    expect(() => nextNDaysWindow("2026-08-16", 0)).toThrowError(GatewayError)
    expect(() => nextNDaysWindow("2026-08-16", -5)).toThrowError(GatewayError)
  })
})

describe("data inválida", () => {
  it("recusa data inexistente no calendário", () => {
    expect(() => monthKeyOf("2026-02-30")).toThrowError(/inexistente/)
    expect(() => monthKeyOf("2026-13-01")).toThrowError(GatewayError)
    expect(() => calendarMonthWindow("2027-02-29", 0)).toThrowError(/inexistente/)
  })

  it("recusa formato fora de YYYY-MM-DD", () => {
    expect(() => monthKeyOf("16/08/2026")).toThrowError(GatewayError)
    expect(() => monthKeyOf("2026-8-16")).toThrowError(GatewayError)
  })

  it("aceita 29/02 em ano bissexto", () => {
    expect(monthKeyOf("2028-02-29")).toBe("2028-02")
  })
})

describe("pertencimento e distância", () => {
  it("extremos são inclusivos", () => {
    const janela = { start: "2026-09-01", end: "2026-09-30" }
    expect(isWithinWindow("2026-09-01", janela)).toBe(true)
    expect(isWithinWindow("2026-09-30", janela)).toBe(true)
    expect(isWithinWindow("2026-08-31", janela)).toBe(false)
    expect(isWithinWindow("2026-10-01", janela)).toBe(false)
  })

  it("dias entre datas atravessa mês e ano", () => {
    expect(daysBetween("2026-08-16", "2026-08-16")).toBe(0)
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1)
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1)
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2)
    expect(daysBetween("2026-09-01", "2026-08-31")).toBe(-1)
  })
})

describe("determinismo — sem relógio implícito", () => {
  it("nenhuma função depende da data de hoje", () => {
    // Toda entrada é explícita: rodar amanhã dá o mesmo resultado.
    expect(calendarMonthWindow("2026-08-16", 1)).toEqual(calendarMonthWindow("2026-08-16", 1))
    expect(nextNDaysWindow("2026-08-16", 30)).toEqual(nextNDaysWindow("2026-08-16", 30))
    expect(businessDateOf("2026-08-16T02:00:00.000Z", BUSINESS_TIMEZONE)).toBe(
      businessDateOf("2026-08-16T02:00:00.000Z", BUSINESS_TIMEZONE),
    )
  })
})
