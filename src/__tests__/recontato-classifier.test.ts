import { describe, it, expect } from "vitest"
import { classifyRecontato, calcRecontatoEm } from "@/lib/recontato-classifier"

describe("classifyRecontato", () => {
  it("identifica convertido por CONTRATO", () => {
    expect(classifyRecontato("CONTRATO ASSINADO", "ATENDIMENTO")).toBe("convertido")
  })

  it("identifica convertido por FECHAMENTO (antes de qualificado)", () => {
    expect(classifyRecontato("FECHAMENTO DE NEGÓCIO", "ATENDIMENTO")).toBe("convertido")
  })

  it("identifica qualificado", () => {
    expect(classifyRecontato("QUALIFICADO - APTO", "ATENDIMENTO")).toBe("qualificado")
  })

  it("identifica fora_politica", () => {
    expect(classifyRecontato("FORA DA POLÍTICA", "ATENDIMENTO")).toBe("fora_politica")
    expect(classifyRecontato("FORA DA POLITICA", "ATENDIMENTO")).toBe("fora_politica")
  })

  it("identifica nao_gostou por recusa", () => {
    expect(classifyRecontato("RECUSA TOTAL", "ATENDIMENTO")).toBe("nao_gostou")
    expect(classifyRecontato("NÃO TEM INTERESSE", "ATENDIMENTO")).toBe("nao_gostou")
    expect(classifyRecontato("SEM INTERESSE", "ATENDIMENTO")).toBe("nao_gostou")
  })

  it("identifica terceiro_nao_conhece", () => {
    expect(classifyRecontato("NÃO RECONHECE O ALUNO", "ATENDIMENTO")).toBe("terceiro_nao_conhece")
    expect(classifyRecontato("TERCEIRO ATENDEU", "ATENDIMENTO")).toBe("terceiro_nao_conhece")
  })

  it("identifica mae_atendeu", () => {
    expect(classifyRecontato("MÃE ATENDEU", "ATENDIMENTO")).toBe("mae_atendeu")
    expect(classifyRecontato("RESPONSÁVEL INFORMOU", "ATENDIMENTO")).toBe("mae_atendeu")
    expect(classifyRecontato("FAMILIAR ATENDEU", "ATENDIMENTO")).toBe("mae_atendeu")
  })

  it("identifica nao_podia_falar", () => {
    expect(classifyRecontato("NÃO PODIA FALAR AGORA", "ATENDIMENTO")).toBe("nao_podia_falar")
    expect(classifyRecontato("OCUPADO", "ATENDIMENTO")).toBe("nao_podia_falar")
    expect(classifyRecontato("EM AULA", "ATENDIMENTO")).toBe("nao_podia_falar")
  })

  it("identifica nao_atendeu por resultado CANCELADO", () => {
    expect(classifyRecontato("", "CANCELADO")).toBe("nao_atendeu")
    expect(classifyRecontato(null, "NÃO ATENDE")).toBe("nao_atendeu")
  })

  it("identifica nao_atendeu por tabulação vazia", () => {
    expect(classifyRecontato("", "ATENDIMENTO")).toBe("nao_atendeu")
  })

  it("retorna outros para tabulação desconhecida", () => {
    expect(classifyRecontato("OUTRO MOTIVO", "ATENDIMENTO")).toBe("outros")
  })

  it("trata null/undefined sem lançar erro", () => {
    expect(() => classifyRecontato(null, null)).not.toThrow()
    expect(() => classifyRecontato(undefined, undefined)).not.toThrow()
  })
})

describe("calcRecontatoEm", () => {
  it("retorna null para qualificado", () => {
    expect(calcRecontatoEm("qualificado")).toBeNull()
  })

  it("retorna null para convertido", () => {
    expect(calcRecontatoEm("convertido")).toBeNull()
  })

  it("retorna null para fora_politica", () => {
    expect(calcRecontatoEm("fora_politica")).toBeNull()
  })

  it("retorna data futura para nao_atendeu (2 dias)", () => {
    const result = calcRecontatoEm("nao_atendeu")
    expect(result).not.toBeNull()
    const days = Math.round(
      (new Date(result!).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    )
    expect(days).toBe(2)
  })

  it("retorna data futura para mae_atendeu (7 dias)", () => {
    const result = calcRecontatoEm("mae_atendeu")
    const days = Math.round(
      (new Date(result!).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    )
    expect(days).toBe(7)
  })

  it("retorna data futura para nao_gostou (25 dias)", () => {
    const result = calcRecontatoEm("nao_gostou")
    const days = Math.round(
      (new Date(result!).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    )
    expect(days).toBe(25)
  })

  it("retorna data no formato YYYY-MM-DD", () => {
    const result = calcRecontatoEm("nao_atendeu")
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
