/**
 * `expected_units` — o denominador governado da cobertura.
 *
 * Os limiares de qualidade vêm da Política Creditum v1: ausente >= 10% é
 * `insufficient`, qualquer ausência abaixo disso é `degraded`. Os limiares NÃO são
 * repetidos aqui — vêm de `CREDITUM_POLICY_V1`.
 *
 * As memberships são FIXTURES de teste, em `tests/fixtures/expected-units/`. A
 * fonte de produção (`governance/expected-units/`) está vazia porque os dados
 * reais não existem, e há teste que afirma isso.
 *
 * As duas regressões que esta suíte existe para impedir:
 *
 *   `expected = catálogo ativo`   degradação permanente e falsa
 *   `expected = observado`        cobertura sempre 100%, métrica tautológica
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  EXPECTED_UNITS_SCHEMA_VERSION,
  assessCoverage,
  coverageQuality,
  expectedUnitsContentHash,
  toUnitCoverage,
  validateExpectedUnits,
} from "../src/expected-units"
import type { GovernedExpectedUnits } from "../src/expected-units"
import {
  FileExpectedUnitsProvider,
  PRODUCTION_EXPECTED_UNITS_PROVIDER,
} from "../src/expected-units-file-provider"
import { CREDITUM_POLICY_V1 } from "../src/production-policy"
import { GOVERNED_UNIT_CATALOG } from "../src/unit-catalog"
import { GatewayError } from "../../gateway/src/errors"

const LIMIAR = CREDITUM_POLICY_V1.coverage_missing_share_insufficient_at_bp

const FIXTURES = new URL("./fixtures/expected-units/", import.meta.url).pathname
const PROVIDER = new FileExpectedUnitsProvider(FIXTURES, GOVERNED_UNIT_CATALOG)

const ATIVAS = GOVERNED_UNIT_CATALOG.entries
  .filter((e) => e.status === "active")
  .map((e) => e.unit_id)
const INATIVAS = GOVERNED_UNIT_CATALOG.entries
  .filter((e) => e.status === "inactive")
  .map((e) => e.unit_id)

/** Carrega uma fixture, exigindo que ela exista — teste quebrado não é DATA_NOT_AVAILABLE. */
function membership(period: string, dataset_id: string): GovernedExpectedUnits {
  const r = PROVIDER.getExpectedUnits({ period, dataset_id })
  if (r.status !== "available") throw new Error(`fixture ausente: ${period}/${dataset_id}`)
  return r.membership
}

/**
 * Artefato bruto válido, para mutar um campo por vez.
 *
 * O `content_hash` é calculado sobre os valores EFETIVOS — inclusive os do
 * `over`. A primeira versão deste helper hashava o período padrão e o override
 * mudava o período depois, produzindo um artefato inconsistente que o validador
 * corretamente recusava por outro motivo, mascarando o teste.
 */
function artefato(ids: readonly string[], over: Record<string, unknown> = {}): unknown {
  const period = typeof over["period"] === "string" ? over["period"] : "2026-08"
  const dataset_id = typeof over["dataset_id"] === "string" ? over["dataset_id"] : "ds_sintetico"
  return {
    schema_version: EXPECTED_UNITS_SCHEMA_VERSION,
    period,
    dataset_id,
    expected_units: ids.map((unit_id) => ({ unit_id })),
    provenance: {
      source_system: "fixture_teste",
      source_version: "1.0.0",
      content_hash: expectedUnitsContentHash(period, dataset_id, ids),
    },
    ...over,
  }
}

const qualidade = (m: GovernedExpectedUnits, observadas: readonly string[]): string =>
  coverageQuality(assessCoverage(m, observadas), LIMIAR)

// ═════════════════════════════════════════════════════════════════════════════
// §21 A–E — as fronteiras de qualidade, com aritmética inteira
// ═════════════════════════════════════════════════════════════════════════════

describe("§21 A/B/C — 20 esperadas", () => {
  const m = membership("2026-08", "ds_vinte")

  it("a fixture tem 20 unidades", () => {
    expect(m.unit_ids).toHaveLength(20)
  })

  it("A — 20 observadas: ok", () => {
    const a = assessCoverage(m, m.unit_ids)
    expect(a.missing_count).toBe(0)
    expect(a.missing_share_bp).toBe(0)
    expect(a.ratio_bp).toBe(10000)
    expect(coverageQuality(a, LIMIAR)).toBe("ok")
  })

  it("B — 1 ausente de 20 = 500 bp: degraded", () => {
    const a = assessCoverage(m, m.unit_ids.slice(1))
    expect(a.missing_count).toBe(1)
    expect(a.missing_share_bp).toBe(500)
    expect(coverageQuality(a, LIMIAR)).toBe("degraded")
  })

  it("C — 2 ausentes de 20 = 1000 bp: insufficient, fronteira inclusiva", () => {
    const a = assessCoverage(m, m.unit_ids.slice(2))
    expect(a.missing_count).toBe(2)
    expect(a.missing_share_bp).toBe(1000)
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })

  it("as unidades ausentes são NOMEADAS, não só contadas", () => {
    const a = assessCoverage(m, m.unit_ids.slice(2))
    expect(a.missing_unit_ids).toEqual([m.unit_ids[0], m.unit_ids[1]])
  })
})

describe("§21 D/E — a fronteira depende do denominador, não da contagem", () => {
  it("D — 1 ausente de 10 = 1000 bp: insufficient", () => {
    const m = membership("2026-08", "ds_dez")
    expect(m.unit_ids).toHaveLength(10)
    const a = assessCoverage(m, m.unit_ids.slice(1))
    expect(a.missing_share_bp).toBe(1000)
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })

  it("E — 1 ausente de 11 = 909 bp: degraded", () => {
    const m = membership("2026-08", "ds_onze")
    expect(m.unit_ids).toHaveLength(11)
    const a = assessCoverage(m, m.unit_ids.slice(1))
    // 1/11 = 909,09… bp. Piso da divisão exata, sem float.
    expect(a.missing_share_bp).toBe(909)
    expect(coverageQuality(a, LIMIAR)).toBe("degraded")
  })

  it("a MESMA contagem de ausentes dá vereditos opostos conforme o denominador", () => {
    const dez = membership("2026-08", "ds_dez")
    const onze = membership("2026-08", "ds_onze")
    expect(qualidade(dez, dez.unit_ids.slice(1))).toBe("insufficient")
    expect(qualidade(onze, onze.unit_ids.slice(1))).toBe("degraded")
  })

  it("ausente e presente somam exatamente 10000 bp", () => {
    for (const ds of ["ds_dez", "ds_onze", "ds_vinte"]) {
      const m = membership("2026-08", ds)
      for (let k = 0; k <= m.unit_ids.length; k++) {
        const a = assessCoverage(m, m.unit_ids.slice(k))
        expect(a.missing_share_bp + a.ratio_bp, `${ds}/${k}`).toBe(10000)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21 F/G — catálogo e expectativa são dimensões SEPARADAS
// ═════════════════════════════════════════════════════════════════════════════

describe("§21 F — unidade ATIVA fora da lista não entra no denominador", () => {
  const m = membership("2026-08", "ds_vinte")

  it("o catálogo tem mais ativas do que a membership espera", () => {
    expect(ATIVAS.length).toBeGreaterThan(m.unit_ids.length)
  })

  it("o denominador é a MEMBERSHIP, não o catálogo ativo", () => {
    const a = assessCoverage(m, m.unit_ids)
    expect(a.expected_count).toBe(m.unit_ids.length)
    expect(a.expected_count).not.toBe(ATIVAS.length)
  })

  it("cobertura completa da membership é `ok`, mesmo com ativas de fora ausentes", () => {
    // Esta é a regressão crítica: se o denominador fosse o catálogo ativo, isto
    // seria `insufficient` para sempre — 20 de 44 é 5455 bp de ausência.
    expect(qualidade(m, m.unit_ids)).toBe("ok")
  })

  it("uma ativa fora da lista não aparece como ausente", () => {
    const foraDaLista = ATIVAS.find((id) => !m.unit_ids.includes(id))
    expect(foraDaLista).toBeDefined()
    const a = assessCoverage(m, m.unit_ids)
    expect(a.missing_unit_ids).not.toContain(foraDaLista)
  })
})

describe("§21 G — unidade INATIVA explicitamente esperada ENTRA no denominador", () => {
  const m = membership("2026-08", "ds_com_inativa")
  const inativa = INATIVAS[0] as string

  it("a fixture declara uma unidade inativa", () => {
    expect(m.unit_ids).toContain(inativa)
    expect(GOVERNED_UNIT_CATALOG.entries.find((e) => e.unit_id === inativa)?.status).toBe(
      "inactive",
    )
  })

  it("ela conta no denominador — status de catálogo não sobrescreve o dado governado", () => {
    const a = assessCoverage(m, m.unit_ids)
    expect(a.expected_count).toBe(m.unit_ids.length)
    expect(coverageQuality(a, LIMIAR)).toBe("ok")
  })

  it("se ela não reportou, é AUSENTE — não filtrada por ser inativa", () => {
    const semInativa = m.unit_ids.filter((id) => id !== inativa)
    const a = assessCoverage(m, semInativa)
    expect(a.missing_unit_ids).toEqual([inativa])
    expect(a.missing_count).toBe(1)
    // 1 de 3 = 3333 bp: bem acima do limiar.
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21 H — observadas extras
// ═════════════════════════════════════════════════════════════════════════════

describe("§21 H — unidade observada e NÃO esperada não muda o denominador", () => {
  const m = membership("2026-08", "ds_vinte")
  const extra = ATIVAS.find((id) => !m.unit_ids.includes(id)) as string

  it("o denominador não cresce com a extra", () => {
    const a = assessCoverage(m, [...m.unit_ids, extra])
    expect(a.expected_count).toBe(m.unit_ids.length)
  })

  it("a extra não é contada como ausente", () => {
    const a = assessCoverage(m, [...m.unit_ids, extra])
    expect(a.missing_count).toBe(0)
    expect(coverageQuality(a, LIMIAR)).toBe("ok")
  })

  it("a extra é PRESERVADA separadamente, como fato de governança", () => {
    const a = assessCoverage(m, [...m.unit_ids, extra])
    expect(a.unexpected_observed_unit_ids).toEqual([extra])
  })

  it("a extra não dilui a ausência de quem faltou", () => {
    // 2 ausentes de 20 continua 1000 bp com uma extra presente. Se o denominador
    // somasse a extra, 2 de 21 daria 952 bp e o veredito viraria `degraded`.
    const a = assessCoverage(m, [...m.unit_ids.slice(2), extra])
    expect(a.missing_share_bp).toBe(1000)
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })

  it("nenhum juízo automático sobre a extra: é fato, não severidade", () => {
    const a = assessCoverage(m, [...m.unit_ids, extra])
    expect(JSON.stringify(a)).not.toContain("severity")
    expect(JSON.stringify(a)).not.toContain("material")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21 I/J — validação fecha fechado
// ═════════════════════════════════════════════════════════════════════════════

describe("§21 I — UnitId desconhecido falha fechado", () => {
  it("id fora do catálogo governado é recusa", () => {
    expect(() => validateExpectedUnits(artefato(["nao_existe_no_catalogo"]), GOVERNED_UNIT_CATALOG))
      .toThrow(GatewayError)
  })

  it("a recusa nomeia o id e o campo", () => {
    try {
      validateExpectedUnits(artefato([ATIVAS[0] as string, "fantasma"]), GOVERNED_UNIT_CATALOG)
    } catch (e) {
      const d = ((e as GatewayError).details ?? []).join(" ")
      expect(d).toContain("fantasma")
      expect(d).toContain("fora do catálogo governado")
      return
    }
    throw new Error("esperava recusa")
  })

  it("forma inválida de unit_id é recusa antes do catálogo", () => {
    for (const ruim of ["Mogi", "mogi-das-cruzes", "1mogi", "", "a", "x".repeat(65)]) {
      expect(() => validateExpectedUnits(artefato([ruim]), GOVERNED_UNIT_CATALOG), ruim).toThrow(
        GatewayError,
      )
    }
  })

  it("entrada que não é objeto é recusa", () => {
    const bruto = artefato([ATIVAS[0] as string]) as Record<string, unknown>
    bruto["expected_units"] = ["mogi"]
    expect(() => validateExpectedUnits(bruto, GOVERNED_UNIT_CATALOG)).toThrow(GatewayError)
  })
})

describe("§21 J — UnitId duplicado falha fechado, nunca é deduplicado", () => {
  const dup = [ATIVAS[0] as string, ATIVAS[1] as string, ATIVAS[0] as string]

  it("duplicata é recusa", () => {
    expect(() => validateExpectedUnits(artefato(dup), GOVERNED_UNIT_CATALOG)).toThrow(GatewayError)
  })

  it("a recusa diz que é duplicata em period+dataset_id", () => {
    try {
      validateExpectedUnits(artefato(dup), GOVERNED_UNIT_CATALOG)
    } catch (e) {
      expect(((e as GatewayError).details ?? []).join(" ")).toContain(
        "duplicado em period+dataset_id",
      )
      return
    }
    throw new Error("esperava recusa")
  })

  it("NÃO existe caminho que aceite e deduplique", () => {
    // Se deduplicasse, o denominador viraria 2 e o erro de origem desapareceria.
    let saiu = "nada"
    try {
      validateExpectedUnits(artefato(dup), GOVERNED_UNIT_CATALOG)
    } catch {
      saiu = "recusou"
    }
    expect(saiu).toBe("recusou")
  })
})

describe("período, dataset e schema fecham fechado", () => {
  it("period fora de AAAA-MM é recusa", () => {
    for (const ruim of [
      "agosto",
      "08/2026",
      "2026-8",
      "2026-13",
      "2026-00",
      "2026-08-01",
      "2026",
      1_754_000_000,
      null,
    ]) {
      expect(
        () =>
          validateExpectedUnits(
            artefato([ATIVAS[0] as string], { period: ruim }),
            GOVERNED_UNIT_CATALOG,
          ),
        JSON.stringify(ruim),
      ).toThrow(GatewayError)
    }
  })

  it("dataset_id ausente ou malformado é recusa — não existe membership global", () => {
    for (const ruim of [undefined, "", "DS Vendas", "ds/vendas", "a"]) {
      expect(
        () =>
          validateExpectedUnits(
            artefato([ATIVAS[0] as string], { dataset_id: ruim }),
            GOVERNED_UNIT_CATALOG,
          ),
        JSON.stringify(ruim),
      ).toThrow(GatewayError)
    }
  })

  it("schema_version não suportada é recusa", () => {
    expect(() =>
      validateExpectedUnits(
        artefato([ATIVAS[0] as string], { schema_version: "2.0.0" }),
        GOVERNED_UNIT_CATALOG,
      ),
    ).toThrow(GatewayError)
  })

  it("§7 — lista VAZIA é recusa, não `nenhuma unidade esperada`", () => {
    try {
      validateExpectedUnits(artefato([]), GOVERNED_UNIT_CATALOG)
    } catch (e) {
      const d = ((e as GatewayError).details ?? []).join(" ")
      expect(d).toContain("lista vazia não é forma governada")
      expect(d).toContain("DATA_NOT_AVAILABLE")
      return
    }
    throw new Error("esperava recusa")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §19/§20 — procedência e versão
// ═════════════════════════════════════════════════════════════════════════════

describe("§19 — procedência suficiente para auditoria", () => {
  const m = membership("2026-08", "ds_vinte")

  it("carrega fonte, versão e hash do conteúdo", () => {
    expect(m.provenance.source_system).toBe("fixture_teste")
    expect(m.provenance.source_version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(m.provenance.content_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("procedência incompleta é recusa", () => {
    for (const campo of ["source_system", "source_version", "content_hash"]) {
      const bruto = artefato([ATIVAS[0] as string]) as Record<string, unknown>
      const prov = { ...(bruto["provenance"] as Record<string, unknown>) }
      delete prov[campo]
      bruto["provenance"] = prov
      expect(() => validateExpectedUnits(bruto, GOVERNED_UNIT_CATALOG), campo).toThrow(GatewayError)
    }
  })

  it("content_hash divergente da membership é recusa", () => {
    const bruto = artefato([ATIVAS[0] as string, ATIVAS[1] as string]) as Record<string, unknown>
    // Troca uma unidade sem atualizar a procedência: substituição silenciosa.
    bruto["expected_units"] = [{ unit_id: ATIVAS[0] }, { unit_id: ATIVAS[2] }]
    try {
      validateExpectedUnits(bruto, GOVERNED_UNIT_CATALOG)
    } catch (e) {
      expect(((e as GatewayError).details ?? []).join(" ")).toContain("content_hash")
      return
    }
    throw new Error("esperava recusa")
  })

  it("o hash NÃO é identidade de unidade", () => {
    // `unit_id` é governado pelo D13. Nenhum id no resultado parece hash.
    for (const id of m.unit_ids) {
      expect(id).not.toMatch(/^[a-f0-9]{64}$/)
      expect(id).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
    }
  })
})

describe("§20 — reingestão determinística e versão governada", () => {
  it("a mesma membership lida duas vezes dá o mesmo resultado", () => {
    const a = membership("2026-08", "ds_vinte")
    const b = membership("2026-08", "ds_vinte")
    expect(b).toEqual(a)
    expect(b.membership_id).toBe(a.membership_id)
  })

  it("§21 N — a ordem no arquivo não altera a saída", () => {
    // A fixture `ds_ordem` lista as unidades em ordem invertida.
    const m = membership("2026-08", "ds_ordem")
    expect(m.unit_ids).toEqual([...m.unit_ids].sort((x, y) => (x < y ? -1 : 1)))
  })

  it("mesma membership em ordem diferente tem o MESMO membership_id", () => {
    const invertida = validateExpectedUnits(
      artefato([...ATIVAS.slice(0, 5)].reverse()),
      GOVERNED_UNIT_CATALOG,
    )
    const direta = validateExpectedUnits(artefato(ATIVAS.slice(0, 5)), GOVERNED_UNIT_CATALOG)
    expect(invertida.membership_id).toBe(direta.membership_id)
    expect(invertida.unit_ids).toEqual(direta.unit_ids)
  })

  it("membership diferente tem membership_id diferente", () => {
    const a = validateExpectedUnits(artefato(ATIVAS.slice(0, 5)), GOVERNED_UNIT_CATALOG)
    const b = validateExpectedUnits(artefato(ATIVAS.slice(0, 6)), GOVERNED_UNIT_CATALOG)
    expect(b.membership_id).not.toBe(a.membership_id)
  })

  it("período ou dataset diferentes dão identidade diferente", () => {
    const base = validateExpectedUnits(artefato(ATIVAS.slice(0, 5)), GOVERNED_UNIT_CATALOG)
    const outroPeriodo = validateExpectedUnits(
      artefato(ATIVAS.slice(0, 5), { period: "2026-09" }),
      GOVERNED_UNIT_CATALOG,
    )
    expect(outroPeriodo.membership_id).not.toBe(base.membership_id)
  })

  it("a identidade é estrutural: não é gramática de delimitador", () => {
    const m = membership("2026-08", "ds_vinte")
    expect(m.membership_id).toMatch(/^exp_[a-f0-9]{16}$/)
    expect(m.membership_id).not.toContain("ds_vinte")
    expect(m.membership_id).not.toContain("2026-08")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21 K/L/M — ausência de dado, e as duas proibições
// ═════════════════════════════════════════════════════════════════════════════

describe("§21 K — sem dado governado é DATA_NOT_AVAILABLE", () => {
  it("período sem membership devolve DATA_NOT_AVAILABLE", () => {
    const r = PROVIDER.getExpectedUnits({ period: "2027-01", dataset_id: "ds_vinte" })
    expect(r.status).toBe("DATA_NOT_AVAILABLE")
  })

  it("dataset sem membership devolve DATA_NOT_AVAILABLE", () => {
    const r = PROVIDER.getExpectedUnits({ period: "2026-08", dataset_id: "ds_inexistente" })
    expect(r.status).toBe("DATA_NOT_AVAILABLE")
  })

  it("NUNCA devolve lista vazia para significar ausência", () => {
    const r = PROVIDER.getExpectedUnits({ period: "2027-01", dataset_id: "ds_vinte" })
    expect(r).not.toHaveProperty("membership")
    expect(JSON.stringify(r)).not.toContain("unit_ids")
  })

  it("a ausência nomeia o que foi pedido, para auditoria", () => {
    const r = PROVIDER.getExpectedUnits({ period: "2027-01", dataset_id: "ds_x" })
    if (r.status !== "DATA_NOT_AVAILABLE") throw new Error("esperava ausência")
    expect(r.period).toBe("2027-01")
    expect(r.dataset_id).toBe("ds_x")
    expect(r.detail.length).toBeGreaterThan(0)
  })

  it("o provider de PRODUÇÃO responde DATA_NOT_AVAILABLE — os dados não existem", () => {
    for (const period of ["2026-08", "2026-09", "2026-07"]) {
      for (const dataset_id of ["ds_vendas_mensal", "ds_financeiro_mensal", "ds_crm"]) {
        const r = PRODUCTION_EXPECTED_UNITS_PROVIDER.getExpectedUnits({ period, dataset_id })
        expect(r.status, `${period}/${dataset_id}`).toBe("DATA_NOT_AVAILABLE")
      }
    }
  })

  it("arquivo CORROMPIDO é erro, não ausência", () => {
    // Ausência é afirmação sobre o negócio; corrupção é defeito. Tratá-los igual
    // esconderia o defeito atrás de um DATA_NOT_AVAILABLE plausível.
    const dir = mkdtempSync(join(tmpdir(), "exp-corr-"))
    writeFileSync(join(dir, "2026-08__ds_x.json"), "{ nao é json")
    const p = new FileExpectedUnitsProvider(dir, GOVERNED_UNIT_CATALOG)
    expect(() => p.getExpectedUnits({ period: "2026-08", dataset_id: "ds_x" })).toThrow(
      GatewayError,
    )
  })

  it("consulta malformada é recusa, não ausência", () => {
    for (const q of [
      { period: "agosto", dataset_id: "ds_x" },
      { period: "2026-08", dataset_id: "../etc/passwd" },
      { period: "2026-08", dataset_id: "ds/x" },
    ]) {
      expect(() => PROVIDER.getExpectedUnits(q), JSON.stringify(q)).toThrow(GatewayError)
    }
  })
})

describe("§17/§21 L — NENHUM fallback para o catálogo ativo", () => {
  const semComentarios = (caminho: string): string =>
    readFileSync(new URL(caminho, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")

  const FONTES = ["../src/expected-units.ts", "../src/expected-units-file-provider.ts"] as const

  it("nenhum fonte filtra o catálogo por status para montar membership", () => {
    for (const f of FONTES) {
      const src = semComentarios(f)
      expect(src, f).not.toMatch(/status\s*===\s*"active"/)
      expect(src, f).not.toMatch(/\.filter\([^)]*active/)
      expect(src, f).not.toMatch(/active\s*[=!]==\s*true/)
    }
  })

  it("o catálogo é usado só para VALIDAR ids, nunca para produzi-los", () => {
    const src = semComentarios("../src/expected-units.ts")
    // A única leitura do catálogo é o conjunto de ids conhecidos, para checagem.
    expect(src).toMatch(/new Set\(catalog\.entries\.map\(\(e\) => e\.unit_id\)\)/)
  })

  it("provider sem dados NÃO devolve as ativas", () => {
    const r = PRODUCTION_EXPECTED_UNITS_PROVIDER.getExpectedUnits({
      period: "2026-08",
      dataset_id: "ds_vendas_mensal",
    })
    expect(r.status).toBe("DATA_NOT_AVAILABLE")
    // Nenhuma das 44 ativas aparece na resposta.
    const texto = JSON.stringify(r)
    for (const id of ATIVAS.slice(0, 5)) expect(texto).not.toContain(id)
  })
})

describe("§18/§21 M — NENHUM fallback para as unidades observadas", () => {
  it("cobertura sobre observadas != membership continua detectando ausência", () => {
    const m = membership("2026-08", "ds_vinte")
    const observadas = m.unit_ids.slice(3)
    const a = assessCoverage(m, observadas)
    // Se `expected = observed`, isto seria sempre 0 e a métrica não mediria nada.
    expect(a.missing_count).toBe(3)
    expect(a.expected_count).toBe(20)
    expect(a.expected_count).not.toBe(observadas.length)
  })

  it("`assessCoverage` nunca deriva o denominador do observado", () => {
    const m = membership("2026-08", "ds_vinte")
    // Observado vazio: o denominador continua 20, e tudo está ausente.
    const a = assessCoverage(m, [])
    expect(a.expected_count).toBe(20)
    expect(a.missing_count).toBe(20)
    expect(a.missing_share_bp).toBe(10000)
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })

  it("observado com unidades totalmente alheias não vira cobertura completa", () => {
    const m = membership("2026-08", "ds_vinte")
    const alheias = ATIVAS.filter((id) => !m.unit_ids.includes(id)).slice(0, 20)
    const a = assessCoverage(m, alheias)
    expect(a.missing_count).toBe(20)
    expect(a.unexpected_observed_unit_ids).toHaveLength(alheias.length)
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21 O — imutabilidade
// ═════════════════════════════════════════════════════════════════════════════

describe("§21 O — imutabilidade profunda", () => {
  it("a membership devolvida está congelada", () => {
    const m = membership("2026-08", "ds_vinte")
    expect(Object.isFrozen(m)).toBe(true)
    expect(Object.isFrozen(m.unit_ids)).toBe(true)
    expect(Object.isFrozen(m.provenance)).toBe(true)
  })

  it("o chamador não consegue mutar a lista", () => {
    const m = membership("2026-08", "ds_vinte")
    expect(() => {
      ;(m.unit_ids as string[]).push("mogi")
    }).toThrow(TypeError)
    expect(() => {
      ;(m.unit_ids as string[])[0] = "outro"
    }).toThrow(TypeError)
  })

  it("o chamador não consegue mutar a procedência", () => {
    const m = membership("2026-08", "ds_vinte")
    expect(() => {
      ;(m.provenance as { source_version: string }).source_version = "9.9.9"
    }).toThrow(TypeError)
  })

  it("a avaliação de cobertura também está congelada", () => {
    const a = assessCoverage(membership("2026-08", "ds_vinte"), [])
    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.isFrozen(a.missing_unit_ids)).toBe(true)
    expect(() => {
      ;(a.missing_unit_ids as string[]).pop()
    }).toThrow(TypeError)
  })

  it("mutar a entrada do chamador depois não altera a membership", () => {
    const ids = [ATIVAS[0] as string, ATIVAS[1] as string]
    const m = validateExpectedUnits(artefato(ids), GOVERNED_UNIT_CATALOG)
    ids.push(ATIVAS[2] as string)
    expect(m.unit_ids).toHaveLength(2)
  })

  it("a projeção para UnitCoverage também é congelada", () => {
    const uc = toUnitCoverage(assessCoverage(membership("2026-08", "ds_vinte"), []))
    expect(Object.isFrozen(uc)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §10 — a forma que os detectores já consomem
// ═════════════════════════════════════════════════════════════════════════════

describe("§10 — projeção para UnitCoverage, sem número novo", () => {
  const m = membership("2026-08", "ds_vinte")

  it("expected_units e reporting_units vêm da avaliação", () => {
    const a = assessCoverage(m, m.unit_ids.slice(2))
    const uc = toUnitCoverage(a)
    expect(uc.expected_units).toBe(a.expected_count)
    expect(uc.reporting_units).toBe(a.observed_expected_count)
    expect(uc.ratio_bp).toBe(a.ratio_bp)
  })

  it("o ratio_bp casa com o limiar que os detectores SHIP já usam", () => {
    // `emit_event_below_bp` da política é 9001: cobertura de 9000 bp (10% ausente)
    // já é insuficiente, e o `<` do detector exige o +1.
    const insuficiente = toUnitCoverage(assessCoverage(m, m.unit_ids.slice(2)))
    const degradado = toUnitCoverage(assessCoverage(m, m.unit_ids.slice(1)))
    expect(insuficiente.ratio_bp).toBe(9000)
    expect(degradado.ratio_bp).toBe(9500)
  })

  it("o limiar vem da política, não deste módulo", () => {
    expect(LIMIAR).toBe(CREDITUM_POLICY_V1.coverage_missing_share_insufficient_at_bp)
    const src = readFileSync(new URL("../src/expected-units.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    // Nenhum 1000 escrito como limiar: ele entra por parâmetro.
    expect(src).not.toMatch(/missing_share_insufficient_at_bp\s*=\s*\d/)
    expect(src).toMatch(/missing_share_insufficient_at_bp: number/)
  })
})
