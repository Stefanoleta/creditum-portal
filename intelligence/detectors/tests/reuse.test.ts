/**
 * Prova de reuso real do motor do portal.
 *
 * Não basta compilar: estes testes exercitam as funções ATRAVÉS da ponte, para
 * mostrar que o comportamento que chega em `intelligence/` é o do motor com seus
 * 182 testes — não uma segunda implementação parecida.
 */

import { describe, expect, it } from "vitest"
import {
  canonicalSchoolKey,
  meanCents,
  ratio,
  observed,
  isOk,
  similarity,
  stableContent,
  sumCents,
  SUGGESTION_THRESHOLD,
} from "../src/engine"
import { ENGINE_UNIT_NORMALIZER } from "../src/unit-normalizer"
import {
  buildUnitIndex,
  canonicalizeUnit,
  summarizeUnitResolution,
} from "../src/canonical-units"
import { APPROVED_THRESHOLDS } from "../src/config"
import { testCatalog } from "./test-config"

describe("a ponte importa o motor de verdade", () => {
  it("`sumCents` mantém a guarda de exatidão de D11", () => {
    expect(sumCents([100, 200, 300])).toBe(600)
    // Acima da faixa exata devolve null em vez de um número aproximado.
    expect(sumCents([Number.MAX_SAFE_INTEGER, 1])).toBeNull()
    expect(sumCents([1.5])).toBeNull()
  })

  it("`ratio` devolve EMPTY_DENOMINATOR, não 0%", () => {
    const r = ratio(observed(5), observed(0), "vendas / leads")
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("`ratio` calcula basis points inteiros", () => {
    const r = ratio(observed(8), observed(22), "vendas / leads")
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value.bps).toBe(3636)
  })

  it("`meanCents` recusa média de lista vazia", () => {
    const m = meanCents([], "média")
    expect(isOk(m)).toBe(false)
    if (!isOk(m)) expect(m.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("`stableContent` é determinístico", () => {
    expect(stableContent({ b: 2, a: 1 })).toBe(stableContent({ a: 1, b: 2 }))
  })

  it("o limiar do motor e o aprovado na config são o mesmo número", () => {
    expect(Math.round(SUGGESTION_THRESHOLD * 10000)).toBe(
      APPROVED_THRESHOLDS.similarity_threshold_bp,
    )
  })
})

describe("integração: motor → UnitNormalizerPort → canonicalização", () => {
  const index = buildUnitIndex(testCatalog(), ENGINE_UNIT_NORMALIZER)
  const OPTS = { similarityThresholdBp: APPROVED_THRESHOLDS.similarity_threshold_bp }

  const resolver = (raw: unknown): ReturnType<typeof canonicalizeUnit> =>
    canonicalizeUnit(raw, index, ENGINE_UNIT_NORMALIZER, OPTS)

  it("a porta é o motor, não um substituto", () => {
    // Inspeção deliberada como VALOR, não chamada: o que se afirma é identidade
    // de referência — a porta aponta para a função do motor, sem intermediário
    // que pudesse alterar comportamento.
    const porta = ENGINE_UNIT_NORMALIZER as unknown as Record<string, unknown>
    expect(porta["comparableKey"]).toBe(canonicalSchoolKey)
    expect(porta["similarity"]).toBe(similarity)
  })

  it("prefixo institucional removido pelo motor", () => {
    expect(resolver("Grau Sumaré")).toMatchObject({ unit_id: "sumare" })
    expect(resolver("Grau Santos")).toMatchObject({ unit_id: "santos" })
  })

  it("acento e caixa normalizados pelo motor", () => {
    expect(resolver("SUMARE")).toMatchObject({ unit_id: "sumare" })
    expect(resolver("sumaré")).toMatchObject({ unit_id: "sumare" })
  })

  it("alias aprovado pelo CEO resolve — D13", () => {
    expect(resolver("Mogi")).toMatchObject({ unit_id: "mogi_das_cruzes" })
    expect(resolver("Grau Mogi")).toMatchObject({ unit_id: "mogi_das_cruzes" })
  })

  it("`Santos` e `Santo Amaro` continuam separados — veto estrutural de D12", () => {
    expect(resolver("Santos")).toMatchObject({ unit_id: "santos" })
    expect(resolver("Santo Amaro")).toMatchObject({ unit_id: "santo_amaro" })
    // O veto do motor é o que impede a fusão: 1 palavra contra 2, nenhuma em
    // comum → similaridade 0.
    expect(similarity("santos", "santo amaro")).toBe(0)
  })

  it("similaridade ≥ 0,80 vira CANDIDATO, nunca match", () => {
    const r = resolver("Alecrin")
    expect(r.status).toBe("ambiguous")
    if (r.status === "ambiguous") expect(r.candidates).toContain("alecrim")
    // O par que calibrou o limiar continua abaixo dele.
    expect(similarity("limeira", "limoeiro")).toBeLessThan(SUGGESTION_THRESHOLD)
  })

  it("nome de pessoa não vira unidade nem candidato", () => {
    expect(resolver("Maria Silva").status).toBe("unknown")
  })

  it("unidade fora do catálogo é desconhecida, não nova", () => {
    expect(resolver("Marabá").status).toBe("unknown")
  })

  it("nenhum texto de origem atravessa o resultado", () => {
    for (const hostil of ["Maria Silva", "123.456.789-09", "maria@escola.com.br", "Marabá"]) {
      expect(JSON.stringify(resolver(hostil))).not.toContain(hostil.slice(0, 8))
    }
  })

  it("cobertura e falha de identidade seguem separadas com o motor real", () => {
    const resumo = summarizeUnitResolution(
      [resolver("Grau Sumaré"), resolver("Marabá"), resolver("Alecrin")],
      ["sumare", "santos"],
    )
    expect(resumo.coverage.reporting_unit_ids).toEqual(["sumare"])
    expect(resumo.coverage.missing_unit_ids).toEqual(["santos"])
    expect(resumo.unresolved.unknown_fingerprints).toHaveLength(1)
    expect(resumo.unresolved.ambiguous).toHaveLength(1)
  })

  it("determinismo através da ponte", () => {
    const entradas = ["Grau Sumaré", "Mogi", "Alecrin", "Marabá", ""]
    expect(entradas.map(resolver)).toEqual(entradas.map(resolver))
  })
})
