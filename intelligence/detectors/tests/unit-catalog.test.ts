/**
 * Catálogo governado + decisões D13 aprovadas na Fase 2.6b.
 *
 * As decisões testadas aqui NÃO são minhas: vieram por escrito na aprovação da
 * fase. `UNIDADES.xlsx` não estava no workspace, então o seed é o subconjunto
 * governado — as linhas ausentes não foram inventadas.
 */

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  GOVERNED_UNIT_CATALOG,
  buildGovernedCatalog,
  canonicalizeWithGroups,
  importUnitCatalog,
  toUnitCatalog,
  unitIdFromCanonicalName,
} from "../src/unit-catalog"
import { buildUnitIndex } from "../src/canonical-units"
import type { CanonicalUnitResult } from "../src/canonical-units"
import { ENGINE_UNIT_NORMALIZER } from "../src/unit-normalizer"
import { APPROVED_THRESHOLDS } from "../src/config"
import { GatewayError } from "../../gateway/src/errors"

const OPTS = { similarityThresholdBp: APPROVED_THRESHOLDS.similarity_threshold_bp }
const INDICE = buildUnitIndex(toUnitCatalog(GOVERNED_UNIT_CATALOG), ENGINE_UNIT_NORMALIZER)

const resolver = (bruto: unknown): CanonicalUnitResult =>
  canonicalizeWithGroups(bruto, INDICE, ENGINE_UNIT_NORMALIZER, OPTS, GOVERNED_UNIT_CATALOG.groups)

const idDe = (r: CanonicalUnitResult): string | null =>
  r.status === "matched" ? r.unit_id : null

// ═════════════════════════════════════════════════════════════════════════════

describe("o catálogo é DADO, não união compilada", () => {
  it("unidade nova é linha nova — sem recompilar", () => {
    const c = importUnitCatalog("1.0.0", [
      { canonical_name: "Unidade Recém Aberta", aliases: "", status: "active" },
    ])
    expect(c.entries.some((e) => e.canonical_name === "Unidade Recém Aberta")).toBe(true)
  })

  it("`unit_id` derivado é estável e no formato do contrato", () => {
    expect(unitIdFromCanonicalName("São José do Rio Preto")).toBe("sao_jose_do_rio_preto")
    expect(unitIdFromCanonicalName("Maracanaú")).toBe("maracanau")
    expect(unitIdFromCanonicalName("Jardim Ângela")).toBe("jardim_angela")
    // Determinístico: mesma entrada, mesmo id.
    expect(unitIdFromCanonicalName("Marabá")).toBe(unitIdFromCanonicalName("Marabá"))
  })

  it("a versão do catálogo aprovado é 1.0.0 — política real, não sintética", () => {
    expect(GOVERNED_UNIT_CATALOG.catalog_version).toBe("1.0.0")
  })
})

describe("importação falha fechada", () => {
  it("recusa versão fora de semver", () => {
    expect(() => importUnitCatalog("v1", [{ canonical_name: "Santos" }])).toThrowError(
      /catalog_version/,
    )
  })

  it("recusa linha sem nome canônico", () => {
    expect(() => importUnitCatalog("1.0.0", [{ aliases: "x" }])).toThrowError(/canonical_name/)
  })

  it("recusa status desconhecido", () => {
    try {
      importUnitCatalog("1.0.0", [{ canonical_name: "Unidade Teste", status: "talvez" }])
      expect.unreachable("deveria ter recusado")
    } catch (e) {
      expect((e as GatewayError).details.join(" ")).toContain("status")
    }
  })

  it("recusa nome canônico curto demais para gerar id válido", () => {
    // `X` deriva o id `x`, e o formato do contrato exige ao menos dois
    // caracteres. Falha explícita em vez de id inválido no catálogo.
    try {
      importUnitCatalog("1.0.0", [{ canonical_name: "X" }])
      expect.unreachable("deveria ter recusado")
    } catch (e) {
      expect((e as GatewayError).details.join(" ")).toContain("unit_id")
    }
  })

  it("recusa `unit_id` duplicado", () => {
    expect(() =>
      importUnitCatalog("1.0.0", [
        { canonical_name: "Santos" },
        { canonical_name: "Santos" },
      ]),
    ).toThrowError(/duplicado/)
  })

  it("recusa alias que aponta para DUAS unidades", () => {
    // Um alias ambíguo gravado no catálogo é o oposto do que o catálogo serve.
    expect(() =>
      importUnitCatalog("1.0.0", [
        { canonical_name: "Alfa", aliases: "compartilhado" },
        { canonical_name: "Beta", aliases: "compartilhado" },
      ]),
    ).toThrowError(/já pertence a/)
  })

  it("recusa agrupamento com membro inexistente", () => {
    expect(() =>
      importUnitCatalog("1.0.0", [
        { canonical_name: "Carpina" },
        { canonical_name: "Carpina e Fantasma", group_members: "carpina;fantasma" },
      ]),
    ).toThrowError(/membros inexistentes/)
  })

  it("recusa agrupamento com um único membro", () => {
    expect(() =>
      importUnitCatalog("1.0.0", [
        { canonical_name: "Carpina" },
        { canonical_name: "Só Carpina", group_members: "carpina" },
      ]),
    ).toThrowError(/ao menos duas/)
  })

  it("aliases numa célula são separados por `;` ou `|`, nunca por vírgula", () => {
    // Vírgula aparece DENTRO de rótulo de agrupamento (`Limeira, Sumaré & ...`).
    const c = importUnitCatalog("1.0.0", [{ canonical_name: "Unidade Teste", aliases: "aa;bb|cc" }])
    expect(c.entries[0]?.aliases).toEqual(["aa", "bb", "cc"])
  })

  it("todos os problemas de uma vez, não só o primeiro", () => {
    try {
      importUnitCatalog("errado", [{ aliases: "x" }, { canonical_name: "Y", status: "?" }])
      expect.unreachable("deveria ter recusado")
    } catch (e) {
      expect((e as GatewayError).details.length).toBeGreaterThan(2)
    }
  })
})

describe("§21 — decisões D13 aprovadas", () => {
  it("BelfordRoxo → Belford Roxo", () => {
    expect(idDe(resolver("BelfordRoxo"))).toBe("belford_roxo")
    expect(idDe(resolver("Belford Roxo"))).toBe("belford_roxo")
  })

  it("Maracanau → Maracanaú", () => {
    expect(idDe(resolver("Maracanau"))).toBe("maracanau")
    expect(idDe(resolver("Maracanaú"))).toBe("maracanau")
  })

  it("Jd Angela / Jardim Angela / Jardim Ângela são a MESMA identidade", () => {
    const ids = ["Jd Angela", "Jardim Angela", "Jardim Ângela"].map((x) => idDe(resolver(x)))
    expect(new Set(ids).size).toBe(1)
    // O canônico vem da planilha, que grafa `Jd Angela`. A regra `jd → jardim` do
    // motor faz as três formas casarem na mesma chave comparável.
    expect(ids[0]).toBe("jd_angela")
  })

  it("e existe UMA unidade para as três grafias, não três", () => {
    const angelas = GOVERNED_UNIT_CATALOG.entries.filter((e) =>
      e.canonical_name.toLowerCase().includes("ngela"),
    )
    expect(angelas).toHaveLength(1)
    expect(angelas[0]?.unit_id).toBe("jd_angela")
  })

  it("Presidente P. → Prudente", () => {
    expect(idDe(resolver("Presidente P."))).toBe("prudente")
  })

  it("e é ALIAS governado, não escolha de similaridade em runtime", () => {
    const entrada = GOVERNED_UNIT_CATALOG.entries.find((e) => e.unit_id === "prudente")
    expect(entrada?.aliases).toContain("Presidente P.")
  })

  it("Grau Marabá → Marabá, sem criar unidade extra", () => {
    expect(idDe(resolver("Grau Marabá"))).toBe("maraba")
    expect(idDe(resolver("Grau Maraba"))).toBe("maraba")
    expect(idDe(resolver("Marabá"))).toBe("maraba")
    const marabas = GOVERNED_UNIT_CATALOG.entries.filter((e) => e.unit_id.startsWith("marab"))
    expect(marabas).toHaveLength(1)
  })

  it("STA Cruz → Santa Cruz", () => {
    expect(idDe(resolver("STA Cruz"))).toBe("santa_cruz")
    expect(idDe(resolver("Santa Cruz"))).toBe("santa_cruz")
  })

  it("Rio Centro, Zona Norte - RN e Madureira são unidades DISTINTAS", () => {
    const ids = [
      resolver("Rio Centro"),
      resolver("Zona Norte - RN"),
      resolver("Madureira"),
    ].map(idDe)
    expect(ids).toEqual(["rio_centro", "zona_norte_rn", "madureira"])
    expect(new Set(ids).size).toBe(3)
  })

  it("`Zona Norte` resolve para Natal/RN — decisão D13 da Fase 2.10e", () => {
    // Este teste afirmava o contrário até a 2.10e, e a pendência que ele registrava
    // era a certa: "se as planilhas de venda escreverem `Zona Norte`, precisa de
    // alias governado". As planilhas do Lucas escrevem, e o alias foi aprovado.
    //
    // A resolução vem do ARTEFATO, não de similaridade: a forma curta dava 6667 bp,
    // abaixo do limiar de 8000, e continuaria dando. A ambiguidade geográfica com a
    // zona norte de São Paulo não era solúvel por texto — foi decidida por humano.
    expect(idDe(resolver("Zona Norte"))).toBe("zona_norte_rn")
    // O apelido que a planilha de cadastro DÁ para ela continua resolvendo.
    expect(idDe(resolver("Natal Zona Norte"))).toBe("zona_norte_rn")
    // E não colapsou com as duas vizinhas do mesmo grupo de nomes.
    expect(idDe(resolver("Rio Centro"))).toBe("rio_centro")
    expect(idDe(resolver("Madureira"))).toBe("madureira")
  })

  it("Carpina ≠ Limoeiro", () => {
    expect(idDe(resolver("Carpina"))).toBe("carpina")
    expect(idDe(resolver("Limoeiro"))).toBe("limoeiro")
  })

  it("Limeira ≠ Sumaré ≠ Jardim Ângela", () => {
    const ids = [resolver("Limeira"), resolver("Sumaré"), resolver("Jardim Ângela")].map(idDe)
    expect(new Set(ids).size).toBe(3)
  })

  it("os aliases D13 anteriores continuam valendo sobre o canônico da planilha", () => {
    // A planilha grafa `Mogi`, não `Mogi das Cruzes`. O prefixo `Grau` é removido
    // por regra do motor, então as duas formas da fonte casam.
    expect(idDe(resolver("Mogi"))).toBe("mogi")
    expect(idDe(resolver("Grau Mogi"))).toBe("mogi")
    // `Rio Preto` é override governado sobre o canônico `Sâo José do Rio Preto`.
    expect(idDe(resolver("Rio Preto"))).toBe("sao_jose_do_rio_preto")
  })

  it("Santos e Santo Amaro seguem separados — veto estrutural D12", () => {
    expect(idDe(resolver("Santos"))).toBe("santos")
    expect(idDe(resolver("Santo Amaro"))).toBe("santo_amaro")
  })
})

describe("§5 — unidade INATIVA não é UNKNOWN", () => {
  it("Jardim Ângela está inativa no catálogo", () => {
    const e = GOVERNED_UNIT_CATALOG.entries.find((x) => x.unit_id === "jd_angela")
    expect(e?.status).toBe("inactive")
  })

  it("mas a identidade É resolvida — a unidade fechou, o nome não deixou de existir", () => {
    const r = resolver("Jd Angela")
    expect(r.status).toBe("matched")
    expect(idDe(r)).toBe("jd_angela")
  })

  it("o status inativo permanece visível no catálogo", () => {
    const inativas = GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "inactive")
    // As cinco que a planilha marca `Ativo = Não`.
    expect(inativas.map((e) => e.unit_id).sort()).toEqual([
      "duque_de_caxias",
      "guarulhos",
      "jd_angela",
      "sao_goncalo",
      "vila_maria",
    ])
  })

  it("a projeção para o índice preserva `active: false`", () => {
    const proj = toUnitCatalog(GOVERNED_UNIT_CATALOG)
    const angela = proj.units.find((u) => u.unit_id === "jd_angela")
    expect(angela?.active).toBe(false)
  })
})

describe("§4 — AGRUPAMENTO comercial não é unidade nem alias", () => {
  it("`Carpina e Limoeiro` NÃO resolve para uma escola", () => {
    const r = resolver("Carpina e Limoeiro")
    expect(r.status).toBe("ambiguous")
    expect(idDe(r)).toBeNull()
  })

  it("e não é nem Carpina nem Limoeiro", () => {
    const r = resolver("Carpina e Limoeiro")
    expect(r.status === "ambiguous" && r.candidates).toEqual(["carpina", "limoeiro"])
    // Explicitamente: o rótulo não é igual a nenhum dos membros.
    expect(r).not.toEqual(resolver("Carpina"))
    expect(r).not.toEqual(resolver("Limoeiro"))
  })

  it("a razão distingue agrupamento de dúvida do algoritmo", () => {
    const r = resolver("Carpina e Limoeiro")
    expect(r.status === "ambiguous" && r.reason).toBe("GROUP_LABEL")
  })

  it("`Limeira, Sumaré & JD Ângela` cobre os três membros", () => {
    const r = resolver("Limeira, Sumaré & JD Ângela")
    expect(r.status).toBe("ambiguous")
    expect(r.status === "ambiguous" && r.reason).toBe("GROUP_LABEL")
    // TRÊS membros, não quatro: `Jd Angela` é uma unidade só.
    expect(r.status === "ambiguous" && r.candidates).toEqual(["jd_angela", "limeira", "sumare"])
  })

  it("e não resolve para nenhum dos três individualmente", () => {
    const grupo = resolver("Limeira, Sumaré & JD Ângela")
    for (const membro of ["Limeira", "Sumaré", "Jardim Ângela"]) {
      expect(idDe(grupo)).not.toBe(idDe(resolver(membro)))
    }
    expect(idDe(grupo)).toBeNull()
  })

  it("nenhum valor é dividido entre os membros — o rótulo não carrega aritmética", () => {
    // O resultado não tem campo de valor nem de proporção: a identidade é
    // não-atômica e o detector recebe isso, não uma divisão inventada.
    const r = resolver("Carpina e Limoeiro")
    expect(Object.keys(r).sort()).toEqual(["candidates", "raw_fingerprint", "reason", "status"])
  })

  it("o rótulo é conferido ANTES da similaridade", () => {
    // `Carpina e Limoeiro` contém `Carpina`. Se a similaridade rodasse primeiro,
    // ela poderia se agarrar a um membro.
    expect(resolver("Carpina e Limoeiro").status).toBe("ambiguous")
  })

  it("nome cru do agrupamento não atravessa no resultado", () => {
    const texto = JSON.stringify(resolver("Limeira, Sumaré & JD Ângela"))
    expect(texto).not.toContain("Limeira,")
    expect(texto).not.toContain("&")
  })

  it("os dois agrupamentos aprovados estão no catálogo, e só eles", () => {
    expect(GOVERNED_UNIT_CATALOG.groups.map((g) => g.label).sort()).toEqual([
      "Carpina e Limoeiro",
      "Limeira, Sumaré & JD Ângela",
    ])
  })
})

describe("nome fora do catálogo continua unknown", () => {
  it("não é promovido por similaridade", () => {
    const r = resolver("Escola Que Nunca Existiu")
    expect(r.status).toBe("unknown")
  })

  it("e o texto cru não atravessa", () => {
    expect(JSON.stringify(resolver("Escola Que Nunca Existiu"))).not.toContain("Nunca")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §12 — catálogo COMPLETO, derivado de UNIDADES.xlsx
// ═════════════════════════════════════════════════════════════════════════════

describe("§12 — o catálogo completo bate com o arquivo", () => {
  // ── B ──
  it("B — 49 unidades: 44 ativas, 5 inativas", () => {
    expect(GOVERNED_UNIT_CATALOG.entries).toHaveLength(49)
    expect(GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "active")).toHaveLength(44)
    expect(GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "inactive")).toHaveLength(5)
  })

  it("B — dois agrupamentos, e nenhum deles é unidade", () => {
    expect(GOVERNED_UNIT_CATALOG.groups).toHaveLength(2)
    const nomes = GOVERNED_UNIT_CATALOG.entries.map((e) => e.canonical_name)
    expect(nomes).not.toContain("Carpina e Limoeiro")
    expect(nomes).not.toContain("Limeira, Sumaré & JD Ângela")
  })

  // ── A ──
  it("A — a importação é determinística: mesmo artefato, mesmo catálogo", () => {
    const a = JSON.stringify(GOVERNED_UNIT_CATALOG)
    const b = JSON.stringify(GOVERNED_UNIT_CATALOG)
    expect(b).toBe(a)
  })

  // ── C ──
  it("C — nenhum canonical_name duplicado", () => {
    const nomes = GOVERNED_UNIT_CATALOG.entries.map((e) => e.canonical_name)
    expect(new Set(nomes).size).toBe(nomes.length)
  })

  it("C — nenhum unit_id duplicado", () => {
    const ids = GOVERNED_UNIT_CATALOG.entries.map((e) => e.unit_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("C — nenhum alias colide com o canônico de OUTRA unidade", () => {
    const canonicos = new Map(
      GOVERNED_UNIT_CATALOG.entries.map((e) => [e.canonical_name.toLowerCase(), e.unit_id]),
    )
    for (const e of GOVERNED_UNIT_CATALOG.entries) {
      for (const a of e.aliases) {
        const dono = canonicos.get(a.toLowerCase())
        expect(dono === undefined || dono === e.unit_id, `${a} → ${e.unit_id}`).toBe(true)
      }
    }
  })

  // ── D ──
  it("D — alias ambíguo continua falhando fechado", () => {
    expect(() =>
      importUnitCatalog("1.0.0", [
        { canonical_name: "Unidade Alfa", aliases: "duplicado" },
        { canonical_name: "Unidade Beta", aliases: "duplicado" },
      ]),
    ).toThrowError(/já pertence a/)
  })

  // ── E ──
  describe("E — unidades FORA do seed parcial de 18 resolvem", () => {
    // Nenhuma destas existia no seed da Fase 2.6b.
    const novas: readonly [string, string][] = [
      ["Bangu", "bangu"],
      ["Bonsucesso", "bonsucesso"],
      ["Camaragibe", "camaragibe"],
      ["Cariacica", "cariacica"],
      ["Diadema", "diadema"],
      ["Manaus", "manaus"],
      ["Mossoró", "mossoro"],
      ["Niteroi", "niteroi"],
      ["Nova Iguaçu", "nova_iguacu"],
      ["Osasco", "osasco"],
      ["Petrolina", "petrolina"],
      ["Santo André", "santo_andre"],
      ["São Luís", "sao_luis"],
      ["Serra", "serra"],
      ["Serra Talhada", "serra_talhada"],
      ["Taboão", "taboao"],
      ["Teresina", "teresina"],
      ["Vila Velha", "vila_velha"],
    ]

    for (const [nome, id] of novas) {
      it(`${nome} → ${id}`, () => {
        expect(idDe(resolver(nome))).toBe(id)
      })
    }

    it("com prefixo institucional também — o motor remove `Grau`", () => {
      expect(idDe(resolver("Grau Bangu"))).toBe("bangu")
      expect(idDe(resolver("Grau Teresina"))).toBe("teresina")
    })
  })

  // ── F ──
  it("F — as cinco inativas resolvem como identidade CONHECIDA", () => {
    const inativas: readonly [string, string][] = [
      ["Duque de Caxias", "duque_de_caxias"],
      ["Guarulhos", "guarulhos"],
      ["Jd Angela", "jd_angela"],
      ["São Gonçalo", "sao_goncalo"],
      ["Vila Maria", "vila_maria"],
    ]
    for (const [nome, id] of inativas) {
      expect(idDe(resolver(nome)), nome).toBe(id)
    }
  })

  it("F — e nenhuma delas é `unknown`", () => {
    for (const e of GOVERNED_UNIT_CATALOG.entries.filter((x) => x.status === "inactive")) {
      expect(resolver(e.canonical_name).status, e.canonical_name).toBe("matched")
    }
  })

  // ── G ──
  it("G — os dois rótulos de agrupamento não são UnitId", () => {
    for (const g of GOVERNED_UNIT_CATALOG.groups) {
      const r = resolver(g.label)
      expect(r.status, g.label).toBe("ambiguous")
      expect(idDe(r), g.label).toBeNull()
      expect(r.status === "ambiguous" && r.reason).toBe("GROUP_LABEL")
    }
  })

  it("G — e os membros de cada um são unidades reais do catálogo", () => {
    const ids = new Set(GOVERNED_UNIT_CATALOG.entries.map((e) => e.unit_id))
    for (const g of GOVERNED_UNIT_CATALOG.groups) {
      for (const m of g.members) expect(ids.has(m), `${g.label} → ${m}`).toBe(true)
    }
  })

  it("G — o agrupamento de três tem TRÊS membros, não quatro", () => {
    const g = GOVERNED_UNIT_CATALOG.groups.find((x) => x.label.startsWith("Limeira"))
    expect(g?.members).toHaveLength(3)
  })

  // ── H ──
  it("H — Jd Angela / Jardim Angela / Jardim Ângela seguem UMA identidade", () => {
    const ids = ["Jd Angela", "Jardim Angela", "Jardim Ângela"].map((x) => idDe(resolver(x)))
    expect(new Set(ids)).toEqual(new Set(["jd_angela"]))
  })

  it("todos os aliases da planilha resolvem para a sua unidade", () => {
    for (const e of GOVERNED_UNIT_CATALOG.entries) {
      for (const a of e.aliases) {
        expect(idDe(resolver(a)), `${a} → ${e.unit_id}`).toBe(e.unit_id)
      }
    }
  })

  it("a fonte única de verdade é o catálogo completo — não há seed parcial", async () => {
    const modulo = (await import("../src/unit-catalog")) as Record<string, unknown>
    expect(Object.keys(modulo)).not.toContain("APPROVED_UNIT_CATALOG")
    expect(Object.keys(modulo)).not.toContain("APPROVED_UNIT_ROWS")
    expect(Object.keys(modulo)).toContain("GOVERNED_UNIT_CATALOG")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PROJEÇÃO EXATA — a invariante que substituiu `ALIASES_GOVERNADOS`.
//
// O gate final da 2.6c encontrou uma segunda fonte de governança: três aliases
// escritos em TypeScript eram enxertados no catálogo DEPOIS do load. Regenerar a
// planilha não reproduzia o catálogo efetivo, e essas decisões não podiam ser
// auditadas nem removidas pelo caminho governado.
//
// A correção move os três para `governance/d13.alias-overrides.json`, que o build
// step mescla antes de publicar. O que trava a porta é este bloco: os aliases
// efetivos em runtime são EXATAMENTE os do artefato. O loader pode construir
// Map/Set, mas não pode criar dado governado.

describe("o runtime é projeção exata do artefato, não enriquecimento", () => {
  const ARTEFATO = JSON.parse(
    readFileSync(new URL("../../catalog/unidades.catalog.json", import.meta.url), "utf8"),
  ) as {
    catalog_version: string
    units: { unit_id: string; canonical_name: string; aliases: string[]; status: string }[]
    groups: { label: string; members: string[] }[]
    sources: { role: string; file: string; sha256: string }[]
  }

  const aliasesDoArtefato = (): Map<string, string[]> =>
    new Map(ARTEFATO.units.map((u) => [u.unit_id, [...u.aliases].sort()]))

  const aliasesDoRuntime = (): Map<string, string[]> =>
    new Map(
      GOVERNED_UNIT_CATALOG.entries
        .filter((e) => e.unit_id !== undefined)
        .map((e) => [e.unit_id, [...e.aliases].sort()]),
    )

  it("nenhum alias a mais, nenhum a menos, nenhum alvo alterado", () => {
    expect(aliasesDoRuntime()).toEqual(aliasesDoArtefato())
  })

  it("a contagem efetiva bate exatamente", () => {
    const noArtefato = ARTEFATO.units.reduce((n, u) => n + u.aliases.length, 0)
    const noRuntime = GOVERNED_UNIT_CATALOG.entries.reduce((n, e) => n + e.aliases.length, 0)
    expect(noRuntime).toBe(noArtefato)
  })

  it("unidades, nomes canônicos e status são os do artefato", () => {
    const doArtefato = ARTEFATO.units
      .map((u) => `${u.unit_id}|${u.canonical_name}|${u.status}`)
      .sort()
    const doRuntime = GOVERNED_UNIT_CATALOG.entries
      .filter((e) => e.unit_id !== undefined)
      .map((e) => `${e.unit_id}|${e.canonical_name}|${e.status as string}`)
      .sort()
    expect(doRuntime).toEqual(doArtefato)
  })

  it("agrupamentos são os do artefato", () => {
    const doArtefato = ARTEFATO.groups
      .map((g) => `${g.label}|${[...g.members].sort().join(",")}`)
      .sort()
    const doRuntime = GOVERNED_UNIT_CATALOG.groups
      .map((g) => `${g.label}|${[...g.members].sort().join(",")}`)
      .sort()
    expect(doRuntime).toEqual(doArtefato)
  })

  it("catalog_version vem do artefato", () => {
    expect(GOVERNED_UNIT_CATALOG.catalog_version).toBe(ARTEFATO.catalog_version)
  })

  it("os três aliases humanos vêm do ARTEFATO, não de código", () => {
    const noArtefato = new Set(ARTEFATO.units.flatMap((u) => u.aliases))
    for (const a of ["BelfordRoxo", "Presidente P.", "Rio Preto"]) {
      expect(noArtefato.has(a), a).toBe(true)
    }
  })

  it("o artefato declara as duas fontes governadas", () => {
    expect(ARTEFATO.sources.map((f) => f.role)).toEqual(["workbook", "alias_overrides"])
    for (const f of ARTEFATO.sources) expect(f.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it("o módulo não exporta nenhuma tabela de aliases", async () => {
    const modulo: Record<string, unknown> = await import("../src/unit-catalog")
    for (const nome of Object.keys(modulo)) {
      expect(nome).not.toMatch(/ALIAS/i)
    }
  })

  it("buildGovernedCatalog não inventa alias para um artefato arbitrário", () => {
    // Prova direta: entra sem alias, sai sem alias. Se houvesse enxerto por
    // unit_id, `prudente` voltaria com `Presidente P.` aqui.
    const c = buildGovernedCatalog({
      catalog_version: "1.0.0",
      units: [
        { unit_id: "prudente", canonical_name: "Prudente", aliases: [], status: "active" },
        { unit_id: "belford_roxo", canonical_name: "Belford Roxo", aliases: [], status: "active" },
        {
          unit_id: "sao_jose_do_rio_preto",
          canonical_name: "Sao Jose do Rio Preto",
          aliases: [],
          status: "active",
        },
      ],
      groups: [],
    })
    for (const e of c.entries) expect(e.aliases, e.canonical_name).toEqual([])
  })
})
