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

// ── applyTabulacaoRules ────────────────────────────────────────────────────────

import { applyTabulacaoRules, type LeadRecontatoState } from "@/lib/recontato-classifier"

const emptyState: LeadRecontatoState = { recontato_tentativas: 0, recontato_tentativas_seguidas: 0 }

describe("applyTabulacaoRules — nao_atendeu", () => {
  it("incrementa tentativas e seguidas na primeira tentativa", () => {
    const update = applyTabulacaoRules("nao_atendeu", emptyState)
    expect(update.recontato_tentativas).toBe(1)
    expect(update.recontato_tentativas_seguidas).toBe(1)
    expect(update.recontato_em).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(update.pausado_ate).toBeUndefined()
    expect(update.precisa_higienizacao).toBeUndefined()
  })

  it("define pausado_ate quando seguidas chegam a 3", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 2, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.recontato_tentativas_seguidas).toBe(3)
    expect(update.pausado_ate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("não pausa com seguidas = 2 (antes de atingir 3)", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 1, recontato_tentativas_seguidas: 1 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.recontato_tentativas_seguidas).toBe(2)
    expect(update.pausado_ate).toBeUndefined()
  })

  it("define precisa_higienizacao quando tentativas totais chegam a 5", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 4, recontato_tentativas_seguidas: 1 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.precisa_higienizacao).toBe(true)
  })

  it("não marca higienização antes de 5 tentativas totais", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 3, recontato_tentativas_seguidas: 0 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.precisa_higienizacao).toBeUndefined()
  })

  it("nao_atendeu_multiplas tratado igual a nao_atendeu", () => {
    const update = applyTabulacaoRules("nao_atendeu_multiplas", emptyState)
    expect(update.recontato_tentativas).toBe(1)
    expect(update.recontato_tentativas_seguidas).toBe(1)
  })
})

describe("applyTabulacaoRules — recontato_pendente", () => {
  it("nao_podia_falar → reseta seguidas, agenda +1 dia", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 2, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("nao_podia_falar", state)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    const diasAte = Math.round(
      (new Date(update.recontato_em!).getTime() - new Date().setUTCHours(0, 0, 0, 0)) / 86400000
    )
    expect(diasAte).toBe(1)
  })

  it("mae_atendeu → reseta seguidas, agenda +2 dias", () => {
    const update = applyTabulacaoRules("mae_atendeu", emptyState)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    const diasAte = Math.round(
      (new Date(update.recontato_em!).getTime() - new Date().setUTCHours(0, 0, 0, 0)) / 86400000
    )
    expect(diasAte).toBe(2)
  })

  it("terceiro_nao_conhece → reseta seguidas, agenda +1 dia", () => {
    const update = applyTabulacaoRules("terceiro_nao_conhece", emptyState)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    const diasAte = Math.round(
      (new Date(update.recontato_em!).getTime() - new Date().setUTCHours(0, 0, 0, 0)) / 86400000
    )
    expect(diasAte).toBe(1)
  })

  it("não incrementa tentativas totais para recontato_pendente", () => {
    const update = applyTabulacaoRules("nao_podia_falar", emptyState)
    expect(update.recontato_tentativas).toBeUndefined()
  })
})

describe("applyTabulacaoRules — bloqueio permanente", () => {
  it("nao_gostou → bloqueado = true, bloqueado_motivo, recontato_em null", () => {
    const update = applyTabulacaoRules("nao_gostou", emptyState)
    expect(update.bloqueado).toBe(true)
    expect(update.bloqueado_motivo).toBe("nao_gostou")
    expect(update.recontato_em).toBeNull()
    expect(update.bloqueado_em).toBeTruthy()
  })

  it("recusa_definitiva → bloqueado = true", () => {
    const update = applyTabulacaoRules("recusa_definitiva", emptyState)
    expect(update.bloqueado).toBe(true)
    expect(update.recontato_em).toBeNull()
  })

  it("convertido → bloqueado = true (sai da fila)", () => {
    const update = applyTabulacaoRules("convertido", emptyState)
    expect(update.bloqueado).toBe(true)
    expect(update.recontato_em).toBeNull()
  })
})

describe("applyTabulacaoRules — numero_invalido", () => {
  it("numero_invalido → numero_invalido = true, precisa_higienizacao = true, recontato_em null", () => {
    const update = applyTabulacaoRules("numero_invalido", emptyState)
    expect(update.numero_invalido).toBe(true)
    expect(update.precisa_higienizacao).toBe(true)
    expect(update.recontato_em).toBeNull()
  })
})

describe("applyTabulacaoRules — sucesso/outros", () => {
  it("qualificado → reseta seguidas, recontato_em null", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 3, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("qualificado", state)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    expect(update.recontato_em).toBeNull()
    expect(update.bloqueado).toBeUndefined()
  })

  it("outros → reseta seguidas, agenda recontato (5 dias)", () => {
    const update = applyTabulacaoRules("outros", emptyState)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    expect(update.recontato_em).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
