import { describe, it, expect } from "vitest"
import { normalizePhone, parseFilename } from "@/lib/lista-parser"

// ─── normalizePhone ────────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  it("retorna null para valores vazios", () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("   ")).toBeNull()
  })

  it("remove DDI Brasil (55) com 13 dígitos", () => {
    expect(normalizePhone("5511987654321")).toBe("11987654321")
  })

  it("remove DDI Brasil (55) com 12 dígitos", () => {
    expect(normalizePhone("551198765432")).toBe("1198765432")
  })

  it("mantém número de 11 dígitos sem DDI", () => {
    expect(normalizePhone("11987654321")).toBe("11987654321")
  })

  it("mantém número de 10 dígitos sem DDI", () => {
    expect(normalizePhone("1198765432")).toBe("1198765432")
  })

  it("remove caracteres não-numéricos", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("11987654321")
    expect(normalizePhone("+55 11 98765-4321")).toBe("11987654321")
  })

  it("remove zeros à esquerda", () => {
    expect(normalizePhone("011987654321")).toBe("11987654321")
  })

  it("aceita número como number", () => {
    expect(normalizePhone(11987654321)).toBe("11987654321")
  })

  it("retorna null para string só com caracteres não-numéricos", () => {
    expect(normalizePhone("---")).toBeNull()
  })
})

// ─── parseFilename ─────────────────────────────────────────────────────────────

describe("parseFilename", () => {
  const year = new Date().getFullYear()

  // ── Tipos válidos ────────────────────────────────────────────────────────────

  it("parseia NF corretamente", () => {
    const r = parseFilename("Maracanau-NF-14-05.xlsx")
    expect(r.unidade).toBe("Maracanau")
    expect(r.tipo_lista).toBe("NF")
    expect(r.data_lista).toBe(`${year}-05-14`)
  })

  it("parseia INADIMPLENTE corretamente", () => {
    const r = parseFilename("Bangu-INADIMPLENTE-01-06.xlsx")
    expect(r.unidade).toBe("Bangu")
    expect(r.tipo_lista).toBe("INADIMPLENTE")
    expect(r.data_lista).toBe(`${year}-06-01`)
  })

  it("parseia INATIVO corretamente", () => {
    const r = parseFilename("Madureira-INATIVO-31-12.xlsx")
    expect(r.unidade).toBe("Madureira")
    expect(r.tipo_lista).toBe("INATIVO")
    expect(r.data_lista).toBe(`${year}-12-31`)
  })

  it("parseia LFR corretamente", () => {
    const r = parseFilename("Centro-LFR-07-03.xlsx")
    expect(r.unidade).toBe("Centro")
    expect(r.tipo_lista).toBe("LFR")
    expect(r.data_lista).toBe(`${year}-03-07`)
  })

  it("parseia LFI corretamente", () => {
    const r = parseFilename("Campo Grande-LFI-20-11.xlsx")
    expect(r.unidade).toBe("Campo Grande")
    expect(r.tipo_lista).toBe("LFI")
    expect(r.data_lista).toBe(`${year}-11-20`)
  })

  // ── Nome de unidade com espaços ──────────────────────────────────────────────

  it("aceita unidade com espaço (ex: Jardim Angela)", () => {
    const r = parseFilename("Jardim Angela-INADIMPLENTE-01-06.xlsx")
    expect(r.unidade).toBe("Jardim Angela")
    expect(r.tipo_lista).toBe("INADIMPLENTE")
    expect(r.data_lista).toBe(`${year}-06-01`)
  })

  it("aceita unidade com múltiplas palavras", () => {
    const r = parseFilename("Vila Nova Conceicao-NF-10-04.xlsx")
    expect(r.unidade).toBe("Vila Nova Conceicao")
    expect(r.tipo_lista).toBe("NF")
  })

  // ── Case-insensitive ─────────────────────────────────────────────────────────

  it("aceita tipo em caixa baixa (case-insensitive)", () => {
    expect(parseFilename("Bangu-lfi-10-04.xlsx").tipo_lista).toBe("LFI")
    expect(parseFilename("Bangu-nf-10-04.xlsx").tipo_lista).toBe("NF")
  })

  it("aceita tipo em caixa mista", () => {
    expect(parseFilename("Bangu-Inativo-10-04.xlsx").tipo_lista).toBe("INATIVO")
  })

  // ── Padrão inválido → todos null ─────────────────────────────────────────────

  it("retorna null para tipo desconhecido", () => {
    const r = parseFilename("Bangu-LFX-10-04.xlsx")
    expect(r.unidade).toBeNull()
    expect(r.tipo_lista).toBeNull()
    expect(r.data_lista).toBeNull()
  })

  it("retorna null para nome sem padrão (separador errado)", () => {
    const r = parseFilename("lista_alunos_2026.xlsx")
    expect(r.unidade).toBeNull()
    expect(r.tipo_lista).toBeNull()
    expect(r.data_lista).toBeNull()
  })

  it("retorna null quando faltam segmentos (menos de 4 partes)", () => {
    expect(parseFilename("Bangu-LFI.xlsx").unidade).toBeNull()
    expect(parseFilename("Bangu-LFI-10.xlsx").unidade).toBeNull()
  })

  it("retorna null para mês inválido (> 12)", () => {
    expect(parseFilename("Bangu-LFI-10-13.xlsx").unidade).toBeNull()
  })

  it("retorna null para dia inválido (0)", () => {
    expect(parseFilename("Bangu-LFI-00-06.xlsx").unidade).toBeNull()
  })

  it("retorna null quando DD/MM não são numéricos", () => {
    expect(parseFilename("Bangu-LFI-AA-BB.xlsx").unidade).toBeNull()
  })

  // ── Formato de data correto ──────────────────────────────────────────────────

  it("zero-pada DD e MM com 1 dígito", () => {
    const r = parseFilename("Bangu-LFI-5-6.xlsx")
    expect(r.data_lista).toBe(`${year}-06-05`)
  })

  it("usa o ano corrente", () => {
    const r = parseFilename("Bangu-NF-01-01.xlsx")
    expect(r.data_lista?.startsWith(String(year))).toBe(true)
  })
})
