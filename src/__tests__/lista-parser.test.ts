import { describe, it, expect } from "vitest"
import { normalizePhone, normalizeUnidade, parseFilename } from "@/lib/lista-parser"

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

// ─── normalizeUnidade ──────────────────────────────────────────────────────────

describe("normalizeUnidade", () => {
  it("aplica title case", () => {
    expect(normalizeUnidade("ALECRIM")).toBe("Alecrim")
    expect(normalizeUnidade("bangu")).toBe("Bangu")
    expect(normalizeUnidade("CAMPO GRANDE")).toBe("Campo Grande")
  })

  it("colapsa múltiplos espaços", () => {
    expect(normalizeUnidade("Jardim   Angela")).toBe("Jardim Angela")
    expect(normalizeUnidade("  Bangu  ")).toBe("Bangu")
  })

  it("preposições permanecem em minúsculo (exceto início)", () => {
    expect(normalizeUnidade("SAO JOAO DE MERITI")).toBe("São João de Meriti")
  })

  it("alias 'meriti' → nome canônico", () => {
    expect(normalizeUnidade("meriti")).toBe("São João de Meriti")
    expect(normalizeUnidade("MERITI")).toBe("São João de Meriti")
    expect(normalizeUnidade("  Meriti  ")).toBe("São João de Meriti")
  })

  it("retorna null para entrada vazia", () => {
    expect(normalizeUnidade(null)).toBeNull()
    expect(normalizeUnidade(undefined)).toBeNull()
    expect(normalizeUnidade("")).toBeNull()
    expect(normalizeUnidade("   ")).toBeNull()
  })
})

// ─── parseFilename ─────────────────────────────────────────────────────────────

describe("parseFilename", () => {
  const year = new Date().getFullYear()

  // ── Sem segmento — todos os 5 tipos ──────────────────────────────────────────

  it("parseia NF sem segmento", () => {
    const r = parseFilename("Maracanau-NF-14-05.xlsx")
    expect(r).toMatchObject({ unidade: "Maracanau", tipo_lista: "NF", segmento: null, data_lista: `${year}-05-14` })
  })

  it("parseia INADIMPLENTE sem segmento", () => {
    const r = parseFilename("Bangu-INADIMPLENTE-01-06.xlsx")
    expect(r).toMatchObject({ unidade: "Bangu", tipo_lista: "INADIMPLENTE", segmento: null, data_lista: `${year}-06-01` })
  })

  it("parseia INATIVO sem segmento", () => {
    const r = parseFilename("Madureira-INATIVO-31-12.xlsx")
    expect(r).toMatchObject({ unidade: "Madureira", tipo_lista: "INATIVO", segmento: null })
  })

  it("parseia LFR sem segmento", () => {
    const r = parseFilename("Centro-LFR-07-03.xlsx")
    expect(r).toMatchObject({ unidade: "Centro", tipo_lista: "LFR", segmento: null })
  })

  it("parseia LFI sem segmento", () => {
    const r = parseFilename("Campo Grande-LFI-20-11.xlsx")
    expect(r).toMatchObject({ unidade: "Campo Grande", tipo_lista: "LFI", segmento: null })
  })

  // ── Com segmento T (Técnico) ─────────────────────────────────────────────────

  it("parseia segmento T com NF", () => {
    const r = parseFilename("Alecrim-T-NF-01-06.xlsx")
    expect(r).toMatchObject({ unidade: "Alecrim", segmento: "T", tipo_lista: "NF", data_lista: `${year}-06-01` })
  })

  it("parseia segmento T com LFI", () => {
    const r = parseFilename("Carpina-T-LFI-14-05.xlsx")
    expect(r).toMatchObject({ unidade: "Carpina", segmento: "T", tipo_lista: "LFI" })
  })

  // ── Com segmento P (Profissionalizante) ──────────────────────────────────────

  it("parseia segmento P com LFI", () => {
    const r = parseFilename("Carpina-P-LFI-14-05.xlsx")
    expect(r).toMatchObject({ unidade: "Carpina", segmento: "P", tipo_lista: "LFI" })
  })

  it("parseia segmento P com INADIMPLENTE", () => {
    const r = parseFilename("Recife-P-INADIMPLENTE-10-04.xlsx")
    expect(r).toMatchObject({ unidade: "Recife", segmento: "P", tipo_lista: "INADIMPLENTE" })
  })

  // ── Normalização de unidade no parse ─────────────────────────────────────────

  it("normaliza unidade para title case", () => {
    expect(parseFilename("ALECRIM-NF-01-06.xlsx").unidade).toBe("Alecrim")
    expect(parseFilename("campo grande-LFI-01-06.xlsx").unidade).toBe("Campo Grande")
  })

  it("unidade com espaço é preservada corretamente", () => {
    const r = parseFilename("Jardim Angela-INADIMPLENTE-01-06.xlsx")
    expect(r.unidade).toBe("Jardim Angela")
  })

  it("alias meriti é resolvido no parse", () => {
    expect(parseFilename("meriti-NF-01-06.xlsx").unidade).toBe("São João de Meriti")
  })

  // ── Case-insensitive ─────────────────────────────────────────────────────────

  it("aceita tipo em caixa baixa", () => {
    expect(parseFilename("Bangu-lfi-10-04.xlsx").tipo_lista).toBe("LFI")
  })

  it("aceita segmento em caixa baixa", () => {
    const r = parseFilename("Alecrim-t-NF-01-06.xlsx")
    expect(r).toMatchObject({ segmento: "T", tipo_lista: "NF" })
  })

  // ── Padrão inválido → todos null ─────────────────────────────────────────────

  it("retorna null para tipo desconhecido", () => {
    const r = parseFilename("Bangu-LFX-10-04.xlsx")
    expect(r).toEqual({ unidade: null, tipo_lista: null, segmento: null, data_lista: null })
  })

  it("retorna null para segmento desconhecido (token ambíguo)", () => {
    const r = parseFilename("Bangu-X-LFI-10-04.xlsx")
    expect(r).toEqual({ unidade: null, tipo_lista: null, segmento: null, data_lista: null })
  })

  it("retorna null quando segmento existe mas tipo é inválido", () => {
    expect(parseFilename("Bangu-T-LFX-10-04.xlsx").tipo_lista).toBeNull()
  })

  it("retorna null para nome sem padrão", () => {
    const r = parseFilename("lista_alunos_2026.xlsx")
    expect(r).toEqual({ unidade: null, tipo_lista: null, segmento: null, data_lista: null })
  })

  it("retorna null com menos de 4 segmentos", () => {
    expect(parseFilename("Bangu-LFI.xlsx").unidade).toBeNull()
  })

  it("retorna null para mês inválido", () => {
    expect(parseFilename("Bangu-LFI-10-13.xlsx").unidade).toBeNull()
  })

  it("retorna null para dia inválido (0)", () => {
    expect(parseFilename("Bangu-LFI-00-06.xlsx").unidade).toBeNull()
  })

  // ── Formato de data ──────────────────────────────────────────────────────────

  it("zero-pada DD e MM com 1 dígito", () => {
    expect(parseFilename("Bangu-LFI-5-6.xlsx").data_lista).toBe(`${year}-06-05`)
  })

  it("usa o ano corrente", () => {
    const r = parseFilename("Bangu-NF-01-01.xlsx")
    expect(r.data_lista?.startsWith(String(year))).toBe(true)
  })
})
