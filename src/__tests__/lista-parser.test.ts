import { describe, it, expect } from "vitest"
import { normalizePhone } from "@/lib/lista-parser"

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
