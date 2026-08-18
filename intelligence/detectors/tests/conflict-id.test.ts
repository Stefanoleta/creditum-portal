/**
 * Identidade de conflito — codificação sem ambiguidade estrutural.
 *
 * O ataque que estes testes fecham: qualquer gramática de delimitador permite
 * que duas estruturas diferentes produzam a mesma string, desde que o valor
 * possa conter o delimitador. Trocar o separador não resolve — só muda qual
 * caractere é o problema.
 *
 * A correção é não serializar à mão: a estrutura chega inteira ao codificador.
 */

import { describe, expect, it } from "vitest"
import { conflictId, conflictIdentityMaterial } from "../src/conflict-id"
import type { ConflictIdentityInput, DisputeParticipant } from "../src/conflict-id"
import { stableContent } from "../src/engine"

/** Construídos por código: caractere de controle literal some em editor e diff. */
const NUL = String.fromCharCode(0)
const SOH = String.fromCharCode(1)

/** Reprodução do algoritmo ANTIGO, só para provar que o ataque existia. */
function materialAntigo(versions: readonly DisputeParticipant[]): string {
  return [
    ...new Set(versions.map((v) => [v.source_system, v.dataset_id, v.value_repr].join(NUL))),
  ]
    .sort()
    .join(SOH)
}

const BASE = {
  field: "sales_count",
  kind: "count",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
} as const

function disputa(participants: readonly DisputeParticipant[]): ConflictIdentityInput {
  return { ...BASE, versions: participants }
}

const p = (dataset_id: string, value_repr: string, source_system = "google_sheets"): DisputeParticipant => ({
  source_system,
  dataset_id,
  value_repr,
})

// ─────────────────────────────────────────────────────────────────────────────

describe("por que `stableContent` NÃO serve para esta identidade", () => {
  it("ele achata objeto aninhado em `[object Object]`", () => {
    // `stableContent` chama `parseText`, que faz `String(v)`. Para um array de
    // objetos isso vira "[object Object]" — TODAS as disputas com o mesmo número
    // de participantes colidiriam. Seria muito pior que o bug original.
    const a = stableContent({ participants: [{ dataset_id: "x", value_repr: "1" }] })
    const b = stableContent({ participants: [{ dataset_id: "y", value_repr: "9" }] })
    expect(a).toBe(b)
    expect(a).toContain("[object Object]")
  })

  it("ele é ele próprio uma gramática de delimitador", () => {
    // `${chave}=${valor}` — um `=` no conteúdo já cria ambiguidade.
    expect(stableContent({ a: "x" })).toContain("=")
  })

  it("ele normaliza espaço, o que é lossy para identidade", () => {
    // `parseText` colapsa `\s+`. Para conteúdo de planilha isso é correto; para
    // identidade, faz dois datasets distintos colidirem.
    expect(stableContent({ d: "a b" })).toBe(stableContent({ d: "a  b" }))
  })
})

describe("o ataque do gate final — colisão por caractere de controle", () => {
  const gs = "google_sheets"
  const TRES = [p("x", "1"), p("y", "3"), p("z", "2")]
  const DOIS = [p("x", "1"), p(`y${NUL}3${SOH}${gs}${NUL}z`, "2")]

  it("sob o algoritmo ANTIGO estas duas disputas COLIDIAM", () => {
    // Prova de que o teste tem dente: sem isto, o caso abaixo passaria por
    // vacuidade e não estaria testando a correção.
    expect(materialAntigo(TRES)).toBe(materialAntigo(DOIS))
  })

  it("sob o algoritmo NOVO não colidem — material diferente", () => {
    expect(conflictIdentityMaterial(disputa(TRES))).not.toBe(
      conflictIdentityMaterial(disputa(DOIS)),
    )
  })

  it("e produzem conflict_id diferente", () => {
    expect(conflictId(disputa(TRES))).not.toBe(conflictId(disputa(DOIS)))
  })

  it("contagem diferente de participantes produz identidade diferente", () => {
    const dois = disputa([p("x", "1"), p("y", "2")])
    const tres = disputa([p("x", "1"), p("y", "2"), p("z", "3")])
    expect(conflictId(dois)).not.toBe(conflictId(tres))
  })
})

describe("caracteres hostis não criam ambiguidade estrutural", () => {
  const hostis = [
    ["NUL", NUL],
    ["U+0001", SOH],
    ["pipe", "|"],
    ["igual", "="],
    ["dois-pontos", ":"],
    ["nova linha", "\n"],
    ["tab", "\t"],
    ["barra invertida", "\\"],
    ["aspas", '"'],
    ["unicode", "Ünïcödé 🎓"],
  ] as const

  for (const [rotulo, ch] of hostis) {
    it(`${rotulo} no dataset_id: mover o caractere de campo muda a identidade`, () => {
      const a = disputa([p(`x${ch}y`, "1")])
      const b = disputa([p("x", `${ch}y1`)])
      expect(conflictIdentityMaterial(a)).not.toBe(conflictIdentityMaterial(b))
    })

    it(`${rotulo}: dois datasets distintos continuam distintos`, () => {
      const a = disputa([p(`ds${ch}a`, "1"), p("outro", "2")])
      const b = disputa([p(`ds${ch}b`, "1"), p("outro", "2")])
      expect(conflictId(a)).not.toBe(conflictId(b))
    })
  }

  it("o caractere hostil não é apagado nem normalizado", () => {
    const material = conflictIdentityMaterial(disputa([p("a\tb", "1")]))
    // JSON escapa o tab; o conteúdo continua distinguível de "a b" e de "ab".
    expect(material).not.toBe(conflictIdentityMaterial(disputa([p("a b", "1")])))
    expect(material).not.toBe(conflictIdentityMaterial(disputa([p("ab", "1")])))
  })
})

describe("propriedades preservadas", () => {
  it("ordem dos participantes não muda o id", () => {
    const ab = disputa([p("ds_a", "8"), p("ds_b", "14", "bitrix24")])
    const ba = disputa([p("ds_b", "14", "bitrix24"), p("ds_a", "8")])
    expect(conflictId(ab)).toBe(conflictId(ba))
  })

  it("todas as permutações de três participantes dão o mesmo id", () => {
    const x = p("ds_x", "10")
    const y = p("ds_y", "11", "bitrix24")
    const z = p("ds_z", "12", "omie")
    const permutacoes = [
      [x, y, z],
      [x, z, y],
      [y, x, z],
      [y, z, x],
      [z, x, y],
      [z, y, x],
    ]
    const ids = new Set(permutacoes.map((perm) => conflictId(disputa(perm))))
    expect(ids.size).toBe(1)
  })

  it("participante duplicado idêntico não muda o id", () => {
    const um = disputa([p("ds_a", "8"), p("ds_b", "14")])
    const duplicado = disputa([p("ds_a", "8"), p("ds_b", "14"), p("ds_a", "8")])
    expect(conflictId(um)).toBe(conflictId(duplicado))
  })

  it("dataset diferente produz id diferente", () => {
    expect(conflictId(disputa([p("ds_x", "8"), p("ds_x_b", "14")]))).not.toBe(
      conflictId(disputa([p("ds_y", "8"), p("ds_y_b", "14")])),
    )
  })

  it("fonte diferente produz id diferente", () => {
    expect(conflictId(disputa([p("ds_a", "8", "google_sheets")]))).not.toBe(
      conflictId(disputa([p("ds_a", "8", "bitrix24")])),
    )
  })

  it("período diferente produz id diferente", () => {
    const agosto = conflictId(disputa([p("ds_a", "8")]))
    const setembro = conflictId({
      ...BASE,
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      versions: [p("ds_a", "8")],
    })
    expect(agosto).not.toBe(setembro)
  })

  it("campo diferente produz id diferente", () => {
    expect(conflictId(disputa([p("ds_a", "8")]))).not.toBe(
      conflictId({ ...BASE, field: "leads_received", versions: [p("ds_a", "8")] }),
    )
  })

  it("tipo diferente produz id diferente", () => {
    expect(conflictId(disputa([p("ds_a", "8")]))).not.toBe(
      conflictId({ ...BASE, kind: "cents", versions: [p("ds_a", "8")] }),
    )
  })

  it("valores negativos e datas são distinguidos", () => {
    expect(conflictId(disputa([p("ds_a", "-100")]))).not.toBe(
      conflictId(disputa([p("ds_a", "100")])),
    )
    expect(conflictId(disputa([p("ds_a", "2026-08-04")]))).not.toBe(
      conflictId(disputa([p("ds_a", "2026-08-05")])),
    )
  })

  it("o id casa com o padrão de identificador do contrato", () => {
    expect(conflictId(disputa([p("ds_a", "8")]))).toMatch(/^conf_[a-f0-9]{16}$/)
  })

  it("determinismo: mesma entrada, mesmo id", () => {
    const d = disputa([p("ds_a", "8"), p("ds_b", "14", "bitrix24")])
    expect(conflictId(d)).toBe(conflictId(d))
  })
})

describe("ordenação determinística, sem depender de locale", () => {
  it("não usa localeCompare — a ordem é por unidade de código", () => {
    // `localeCompare` varia com o locale do runtime e tornaria o id dependente
    // do ambiente. A ordenação aqui é por comparação direta de string.
    const comAcento = disputa([p("ds_á", "1"), p("ds_z", "2")])
    const invertido = disputa([p("ds_z", "2"), p("ds_á", "1")])
    expect(conflictId(comAcento)).toBe(conflictId(invertido))
  })

  it("desempata por dataset quando a fonte é igual", () => {
    const a = disputa([p("ds_1", "9"), p("ds_2", "9")])
    const b = disputa([p("ds_2", "9"), p("ds_1", "9")])
    expect(conflictIdentityMaterial(a)).toBe(conflictIdentityMaterial(b))
  })

  it("desempata por valor quando fonte e dataset são iguais", () => {
    const a = disputa([p("ds_1", "8"), p("ds_1", "14")])
    const b = disputa([p("ds_1", "14"), p("ds_1", "8")])
    expect(conflictIdentityMaterial(a)).toBe(conflictIdentityMaterial(b))
  })
})
