import { describe, it, expect } from "vitest"
import { classifyRecontato, calcRecontatoEm, type RecontatoCategoria } from "@/lib/recontato-classifier"

// ── Exact Argus tabulado values (fetched 2026-06-14, campanha Vendas) ──────────

const ARGUS_CASES: [string, RecontatoCategoria][] = [
  ["CAIXA POSTAL / MENSAGEM OPERADORA",        "nao_atendeu"],
  ["CLIENTE DESLIGOU",                          "nao_atendeu"],
  ["CLIENTE NÃO TEM INTERESSE",                 "nao_gostou"],
  ["CONTRATO FECHADO",                          "convertido"],
  ["FALECIDO",                                  "fora_politica"],
  ["FORA DA POLITICA",                          "fora_politica"],
  ["LIGAÇÃO MUDA",                              "nao_atendeu"],
  ["NÃO RECONHECE CONTATO (DESCONHECIDO)",      "terceiro_nao_conhece"],
  ["NÃO TABULADO",                              "outros"],
  ["PROPOSTA ENVIADA",                          "qualificado"],
  ["QUALIFICAÇÃO",                              "qualificado"],
  ["QUESTÃO FINANCEIRA (SEM CONDIÇÕES)",        "objecao_financeira"],
  ["RECADO",                                    "nao_podia_falar"],
  ["RECLAMAÇÃO GRAU",                           "outros"],
  ["RETORNAR CONTATO - PRIVADO",                "nao_podia_falar"],
  ["SEM GARANTIDOR",                            "fora_politica"],
  ["TEL. NÃO É DO CLIENTE - *FINALIZAR LEAD*", "numero_invalido"],
  ["TELEFONE BLOQUEADO - BLOCK LIST",           "numero_invalido"],
  ["TEMPO POS CHAMADA EXCEDIDO",                "outros"],
]

describe("classifyRecontato — valores exatos do Argus", () => {
  it.each(ARGUS_CASES)('classifica "%s" como %s', (tab, expected) => {
    expect(classifyRecontato(tab, "ATENDIMENTO")).toBe(expected)
  })
})

// ── Fallback substring matching (legado / valores IA) ─────────────────────────

describe("classifyRecontato — fallback substring", () => {
  it("convertido por substring CONTRATO", () => {
    expect(classifyRecontato("CONTRATO ASSINADO", "ATENDIMENTO")).toBe("convertido")
  })

  it("convertido por substring FECHAMENTO", () => {
    expect(classifyRecontato("FECHAMENTO DE NEGÓCIO", "ATENDIMENTO")).toBe("convertido")
  })

  it("qualificado por substring QUALIFICA", () => {
    expect(classifyRecontato("QUALIFICADO - APTO", "ATENDIMENTO")).toBe("qualificado")
  })

  it("fora_politica por FORA DA POLÍTICA (com acento)", () => {
    expect(classifyRecontato("FORA DA POLÍTICA", "ATENDIMENTO")).toBe("fora_politica")
  })

  it("nao_gostou por RECUSA", () => {
    expect(classifyRecontato("RECUSA TOTAL", "ATENDIMENTO")).toBe("nao_gostou")
  })

  it("nao_gostou por NÃO TEM INTERESSE (substring)", () => {
    expect(classifyRecontato("NÃO TEM INTERESSE", "ATENDIMENTO")).toBe("nao_gostou")
  })

  it("terceiro_nao_conhece por TERCEIRO", () => {
    expect(classifyRecontato("TERCEIRO ATENDEU", "ATENDIMENTO")).toBe("terceiro_nao_conhece")
  })

  it("mae_atendeu por MÃE", () => {
    expect(classifyRecontato("MÃE ATENDEU", "ATENDIMENTO")).toBe("mae_atendeu")
  })

  it("mae_atendeu por FAMILIAR", () => {
    expect(classifyRecontato("FAMILIAR ATENDEU", "ATENDIMENTO")).toBe("mae_atendeu")
  })

  it("nao_podia_falar por OCUPADO", () => {
    expect(classifyRecontato("OCUPADO", "ATENDIMENTO")).toBe("nao_podia_falar")
  })

  it("nao_podia_falar por EM AULA", () => {
    expect(classifyRecontato("EM AULA", "ATENDIMENTO")).toBe("nao_podia_falar")
  })

  it("numero_invalido por BLOQUEADO", () => {
    expect(classifyRecontato("NÚMERO BLOQUEADO", "ATENDIMENTO")).toBe("numero_invalido")
  })

  it("nao_atendeu por resultado CANCELADO", () => {
    expect(classifyRecontato("", "CANCELADO")).toBe("nao_atendeu")
  })

  it("nao_atendeu por resultado NÃO ATENDE", () => {
    expect(classifyRecontato(null, "NÃO ATENDE")).toBe("nao_atendeu")
  })

  it("nao_atendeu por tabulação vazia", () => {
    expect(classifyRecontato("", "ATENDIMENTO")).toBe("nao_atendeu")
  })

  it("outros para tabulação desconhecida", () => {
    expect(classifyRecontato("OUTRO MOTIVO QUALQUER", "ATENDIMENTO")).toBe("outros")
  })
})

// ── Robustez ──────────────────────────────────────────────────────────────────

describe("classifyRecontato — null/undefined", () => {
  it("não lança erro para null/null", () => {
    expect(() => classifyRecontato(null, null)).not.toThrow()
  })

  it("não lança erro para undefined/undefined", () => {
    expect(() => classifyRecontato(undefined, undefined)).not.toThrow()
  })
})

// ── calcRecontatoEm ───────────────────────────────────────────────────────────

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

  it("retorna null para numero_invalido", () => {
    expect(calcRecontatoEm("numero_invalido")).toBeNull()
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
