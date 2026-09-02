/**
 * Os nomes de unidade REAIS das planilhas do Lucas resolvem no runtime governado.
 *
 * ─── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * A auditoria da Fase 2.10c reportou 5 unidades não resolvidas e classificou uma
 * delas — `Jardim Ângela` — como decisão governada que não havia sido
 * materializada. Estava errado: eu havia reimplementado a normalização num script
 * próprio, sem a tabela de abreviações regulares, e `jd → jardim` já fazia as três
 * formas casarem.
 *
 * O erro não foi de leitura do artefato; foi de método. Reproduzir a regra em vez
 * de chamá-la é exactamente o que `unit-normalizer.ts` documenta que não se faz,
 * porque cria uma segunda verdade sobre identidade de unidade — e a que estiver
 * errada só aparece quando uma unidade recebe os números de outra.
 *
 * Este arquivo fecha aquele furo de processo: a auditoria de D13 passa a ser um
 * teste que chama `canonicalizeUnit` de produção contra os nomes observados na
 * fonte. Nenhuma normalização é reescrita aqui.
 *
 * ─── O que ele protege ────────────────────────────────────────────────────────
 *
 * Os últimos três casos existem porque alias errado é silencioso. Adicionar
 * `Natal Centro` a `alecrim` põe a chave no pool de similaridade das unidades
 * ativas, e alias que aponta para o alvo errado não falha: ele soma os contratos de
 * uma unidade na outra e o número continua parecendo certo.
 */

import { describe, expect, it } from "vitest"
import { GOVERNED_UNIT_CATALOG, toUnitCatalog } from "../../detectors/src/unit-catalog"
import { buildUnitIndex, canonicalizeUnit } from "../../detectors/src/canonical-units"
import { ENGINE_UNIT_NORMALIZER } from "../../detectors/src/unit-normalizer"
import { APPROVED_THRESHOLDS } from "../../detectors/src/config"

const IDX = buildUnitIndex(toUnitCatalog(GOVERNED_UNIT_CATALOG), ENGINE_UNIT_NORMALIZER)
const OPTS = { similarityThresholdBp: APPROVED_THRESHOLDS.similarity_threshold_bp }

describe("D13 — os nomes reais da fonte do Lucas resolvem", () => {
  it("os 5 nomes do gate resolvem", () => {
    const esperado: [string, string][] = [
      ["Duque Caxias", "duque_de_caxias"],
      ["Meriti", "sao_joao_de_meriti"],
      ["Fortaleza", "fortaleza_centro"],
      ["Zona Norte", "zona_norte_rn"],
      ["Jardim Ângela", "jd_angela"],
    ]
    for (const [raw, id] of esperado) {
      const r = canonicalizeUnit(raw, IDX, ENGINE_UNIT_NORMALIZER, OPTS)
      console.log(JSON.stringify({ raw, ...r }))
      expect(r.status, raw).toBe("matched")
      if (r.status === "matched") expect(r.unit_id, raw).toBe(id)
    }
  })

  it("Alecrim: as 4 formas caem no mesmo unit_id", () => {
    for (const raw of ["Alecrim", "Alecrim RN", "Alecrin RN", "Natal Centro"]) {
      const r = canonicalizeUnit(raw, IDX, ENGINE_UNIT_NORMALIZER, OPTS)
      console.log(JSON.stringify({ raw, ...r }))
      expect(r.status, raw).toBe("matched")
      if (r.status === "matched") expect(r.unit_id, raw).toBe("alecrim")
    }
  })

  it("as 25 unidades observadas nas planilhas do Lucas resolvem todas", () => {
    const observadas = [
      "Meriti","São José do Rio Preto","Santa Cruz","Zona Norte","Petrolina","Mogi",
      "Santo Amaro","Marabá","Diadema","Alecrim","Sumaré","Carpina",
      "São Gonçalo","Mossoró","Madureira","Divinopolis","Parnamirim","Rio Centro",
      "Guarulhos","Fortaleza","Joinville","Santos","Teresina","Duque Caxias","Jardim Ângela",
    ]
    const naoResolvem = observadas.filter(
      (u) => canonicalizeUnit(u, IDX, ENGINE_UNIT_NORMALIZER, OPTS).status !== "matched",
    )
    expect(naoResolvem, `não resolvem: ${naoResolvem.join(", ")}`).toEqual([])
  })

  it("Natal Zona Norte continua na unidade de Natal, não migrou para alecrim", () => {
    const r = canonicalizeUnit("Natal Zona Norte", IDX, ENGINE_UNIT_NORMALIZER, OPTS)
    expect(r.status).toBe("matched")
    if (r.status === "matched") expect(r.unit_id).toBe("zona_norte_rn")
  })

  it("as unidades que DEVEM permanecer distintas não colapsaram", () => {
    const distintas: [string, string][] = [
      ["Santos", "santos"],
      ["Santo Amaro", "santo_amaro"],
      ["Carpina", "carpina"],
      ["Limoeiro", "limoeiro"],
      ["Limeira", "limeira"],
      ["Sumaré", "sumare"],
      ["Rio Centro", "rio_centro"],
      ["Madureira", "madureira"],
      ["Curitiba", "curitiba"],
    ]
    for (const [raw, id] of distintas) {
      const r = canonicalizeUnit(raw, IDX, ENGINE_UNIT_NORMALIZER, OPTS)
      expect(r.status, raw).toBe("matched")
      if (r.status === "matched") expect(r.unit_id, raw).toBe(id)
    }
  })
})
