import { describe, it, expect } from "vitest"
import { computeIdentity, stableContent, findDuplicateContent } from "../adapters/identity"

const SRC = "google_sheets"
const AGOSTO = "sheet-agosto-2026"
const SETEMBRO = "sheet-setembro-2026"
const TAB = "pipeline"

const linha = (nome: string, valor: string) => ({
  Aluno: nome,
  "Valor parcela": valor,
  Unidade: "Grau Mogi",
})

describe("stableContent é insensível ao que não é conteúdo", () => {
  it("ordem das colunas não muda o conteúdo", () => {
    const a = { Aluno: "X", Unidade: "Y" }
    const b = { Unidade: "Y", Aluno: "X" }
    expect(stableContent(a)).toBe(stableContent(b))
  })

  it("espaço redundante não muda o conteúdo", () => {
    expect(stableContent({ Aluno: "Fulano  Silva " })).toBe(stableContent({ Aluno: "Fulano Silva" }))
  })

  it("null e string vazia são o mesmo vazio", () => {
    expect(stableContent({ Aluno: null })).toBe(stableContent({ Aluno: "" }))
  })
})

describe("identidade de ocorrência vs. identidade de conteúdo", () => {
  it("a mesma linha re-sincronizada é idempotente", () => {
    const a = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, linha("Fulano", "R$ 500,00"))
    const b = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, linha("Fulano", "R$ 500,00"))
    expect(a.sourceRecordId).toBe(b.sourceRecordId)
    expect(a.contentHash).toBe(b.contentHash)
  })

  // A propriedade que a 3ª revisão do Codex expôs: sem o localizador no hash,
  // duas linhas DISTINTAS de conteúdo idêntico colidiriam. A segunda não
  // entraria, e a duplicata da fonte viraria invisível.
  it("duas linhas distintas com conteúdo idêntico NÃO colidem", () => {
    const l42 = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, linha("Fulano", "R$ 500,00"))
    const l91 = computeIdentity(SRC, AGOSTO, TAB, { row: 91 }, linha("Fulano", "R$ 500,00"))

    expect(l42.sourceRecordId).not.toBe(l91.sourceRecordId)
    // mas o conteúdo é reconhecidamente o mesmo — é isso que denuncia a duplicata
    expect(l42.contentHash).toBe(l91.contentHash)
  })

  it("edição na linha muda o conteúdo e a ocorrência, preservando a linha", () => {
    const antes = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, linha("Fulano", "R$ 500,00"))
    const depois = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, linha("Fulano", "R$ 600,00"))

    expect(depois.contentHash).not.toBe(antes.contentHash)
    expect(depois.sourceRecordId).not.toBe(antes.sourceRecordId)
    // rowKey é a MESMA linha ao longo do tempo — é o que permite versionar
    expect(depois.rowKey).toBe(antes.rowKey)
  })

  it("abas diferentes nunca compartilham identidade", () => {
    const pipeline = computeIdentity(SRC, AGOSTO, "pipeline", { row: 1 }, linha("Fulano", "R$ 500,00"))
    const sales = computeIdentity(SRC, AGOSTO, "sales", { row: 1 }, linha("Fulano", "R$ 500,00"))
    expect(pipeline.sourceRecordId).not.toBe(sales.sourceRecordId)
    expect(pipeline.rowKey).not.toBe(sales.rowKey)
  })

  it("reordenar colunas não simula mudança de conteúdo", () => {
    const a = computeIdentity(SRC, AGOSTO, TAB, { row: 7 }, { Aluno: "X", Unidade: "Y" })
    const b = computeIdentity(SRC, AGOSTO, TAB, { row: 7 }, { Unidade: "Y", Aluno: "X" })
    expect(a.sourceRecordId).toBe(b.sourceRecordId)
  })
})

describe("duplicata na fonte é reportada, não silenciada", () => {
  it("encontra conteúdo repetido em posições diferentes", () => {
    const registros = [42, 91, 7].map((row) => ({
      locator: { row },
      ...computeIdentity(SRC, AGOSTO, TAB, { row }, linha("Fulano", "R$ 500,00")),
    }))
    // o de row 7 tem conteúdo diferente
    registros[2] = {
      locator: { row: 7 },
      ...computeIdentity(SRC, AGOSTO, TAB, { row: 7 }, linha("Beltrano", "R$ 500,00")),
    }

    const dups = findDuplicateContent(registros)
    expect(dups).toHaveLength(1)
    expect(dups[0].occurrences).toEqual([{ row: 42 }, { row: 91 }])
  })

  it("lote sem repetição não reporta nada", () => {
    const registros = [1, 2].map((row) => ({
      locator: { row },
      ...computeIdentity(SRC, AGOSTO, TAB, { row }, linha(`Aluno ${row}`, "R$ 500,00")),
    }))
    expect(findDuplicateContent(registros)).toHaveLength(0)
  })
})

// ─── A planilha muda todo mês ─────────────────────────────────────────────────
//
// A operação cria um arquivo novo por mês ("Vendas - Agosto", "Vendas -
// Setembro", ...). Sem o dataset na identidade, a linha 42 de agosto e a linha
// 42 de setembro geram a mesma chave, e o sistema versiona uma por cima da
// outra — destruindo as duas.

describe("planilha mensal não colide com a do mês anterior", () => {
  const mesma = { Aluno: "Fulano", "Valor parcela": "R$ 500,00" }

  it("mesma posição em meses diferentes são linhas DIFERENTES", () => {
    const ago = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, mesma)
    const set = computeIdentity(SRC, SETEMBRO, TAB, { row: 42 }, mesma)

    expect(set.rowKey).not.toBe(ago.rowKey)
    expect(set.sourceRecordId).not.toBe(ago.sourceRecordId)
  })

  it("mas o conteúdo continua reconhecidamente igual", () => {
    // permite detectar o mesmo aluno reaparecendo no mês seguinte
    const ago = computeIdentity(SRC, AGOSTO, TAB, { row: 42 }, mesma)
    const set = computeIdentity(SRC, SETEMBRO, TAB, { row: 7 }, mesma)
    expect(set.contentHash).toBe(ago.contentHash)
  })

  it("dataset ausente é erro de programação, não degradação silenciosa", () => {
    expect(() => computeIdentity(SRC, "", TAB, { row: 1 }, mesma)).toThrow(/dataset/)
  })
})
