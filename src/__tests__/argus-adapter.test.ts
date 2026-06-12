import { describe, it, expect } from "vitest"
import { matchesAllowlist, getVendasAllowlist } from "@/lib/argus-adapter"

describe("matchesAllowlist", () => {
  it("retorna true para qualquer nome quando allowlist está vazia", () => {
    expect(matchesAllowlist("RAFAELLA GOMES", [])).toBe(true)
    expect(matchesAllowlist("QUALQUER NOME", [])).toBe(true)
  })

  it("retorna false para nome vazio com allowlist preenchida", () => {
    expect(matchesAllowlist("", ["RAFAELLA GOMES"])).toBe(false)
  })

  it("match por primeiro nome completo", () => {
    expect(matchesAllowlist("RAFAELLA GOMES", ["RAFAELLA GOMES"])).toBe(true)
  })

  it("match por primeiro nome (parcial — robusto a truncamentos do Argus)", () => {
    expect(matchesAllowlist("RAFAELLA GOMES DOS SANTOS", ["RAFAELLA GOMES"])).toBe(true)
    expect(matchesAllowlist("RAFAELLA G.", ["RAFAELLA GOMES"])).toBe(true)
  })

  it("match case-insensitive", () => {
    expect(matchesAllowlist("Rafaella Gomes", ["RAFAELLA GOMES"])).toBe(true)
  })

  it("retorna false para nome fora da allowlist", () => {
    expect(matchesAllowlist("MARCELA SAMPAIO", ["RAFAELLA GOMES"])).toBe(false)
  })

  it("match com múltiplos SDRs na allowlist", () => {
    const list = ["RAFAELLA GOMES", "MARCELA SAMPAIO"]
    expect(matchesAllowlist("MARCELA SAMPAIO", list)).toBe(true)
    expect(matchesAllowlist("OUTRO SDR", list)).toBe(false)
  })

  it("não faz match por nome de 2 chars ou menos (evita falsos positivos)", () => {
    // "JO" seria muito curto para match seguro
    expect(matchesAllowlist("JONAS FERREIRA", ["JO SILVA"])).toBe(false)
  })
})

describe("getVendasAllowlist", () => {
  it("retorna lista padrão quando env não está definida", () => {
    const list = getVendasAllowlist(undefined)
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  it("parseia env var corretamente", () => {
    const list = getVendasAllowlist("RAFAELLA GOMES,MARCELA SAMPAIO")
    expect(list).toContain("RAFAELLA GOMES")
    expect(list).toContain("MARCELA SAMPAIO")
    expect(list).toHaveLength(2)
  })

  it("normaliza para maiúsculas e remove espaços extras", () => {
    const list = getVendasAllowlist("  rafaella gomes , marcela sampaio  ")
    expect(list).toContain("RAFAELLA GOMES")
    expect(list).toContain("MARCELA SAMPAIO")
  })

  it("cai na lista padrão quando env é string vazia", () => {
    const list = getVendasAllowlist("")
    expect(list.length).toBeGreaterThan(0)
  })
})
