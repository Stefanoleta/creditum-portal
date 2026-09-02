/**
 * Fase 2.11d — `sourceInstant` valida componentes, não só a forma.
 *
 * ─── O defeito que o gate encontrou ───────────────────────────────────────────
 *
 * A 2.11c trocou comparação de string por comparação de instante, e deixou
 * `Date.parse` decidir se o timestamp era válido. `Date.parse` **normaliza**:
 *
 *   "2026-02-30T18:00:00Z"  →  2026-03-02T18:00:00Z
 *   "2026-08-19T24:00:00Z"  →  2026-08-20T00:00:00Z
 *
 * Um `modifiedTime` malformado entrava na cronologia com um instante inventado,
 * deslocado em DIAS, podia ganhar a seleção e gravar procedência falsa — a captura
 * afirmaria ter observado a fonte num instante que a fonte nunca reportou.
 *
 * O primeiro teste deste arquivo afirma o comportamento do `Date.parse` diretamente,
 * para que a razão da validação estrita não se perca.
 */

import { describe, expect, it } from "vitest"
import { compareSourceInstant, instantFromDate, sourceInstant } from "../../src/lucas/source-time"
import { diasNoMes } from "../../../detectors/src/civil-date"

describe("§1/§7 — `Date.parse` normaliza, e é por isso que não valida", () => {
  it("as formas que o runtime aceita e desloca", () => {
    // Premissa do arquivo. Se um dia o runtime passar a recusar, este teste falha e
    // avisa que a justificativa mudou — não que o código quebrou.
    for (const [entrada, virou] of [
      ["2026-02-30T18:00:00Z", "2026-03-02T18:00:00.000Z"],
      ["2026-04-31T18:00:00Z", "2026-05-01T18:00:00.000Z"],
      ["2026-02-29T18:00:00Z", "2026-03-01T18:00:00.000Z"],
      ["2026-08-19T24:00:00Z", "2026-08-20T00:00:00.000Z"],
    ] as const) {
      const t = Date.parse(entrada)
      expect(Number.isFinite(t), entrada).toBe(true)
      expect(new Date(t).toISOString(), entrada).toBe(virou)
      // E `sourceInstant` recusa cada uma delas.
      expect(sourceInstant(entrada), entrada).toBeNull()
    }
  })
})

describe("§3 — calendário gregoriano real", () => {
  it("datas que NÃO existem são recusadas, não deslocadas", () => {
    for (const ruim of [
      "2026-02-29T18:00:00Z",
      "2026-02-30T18:00:00Z",
      "2026-04-31T18:00:00Z",
      "2026-06-31T18:00:00Z",
      "2026-09-31T18:00:00Z",
      "2026-11-31T18:00:00Z",
      "2026-13-01T18:00:00Z",
      "2026-00-10T18:00:00Z",
      "2026-08-32T18:00:00Z",
      "2026-08-00T18:00:00Z",
    ]) {
      expect(sourceInstant(ruim), ruim).toBeNull()
    }
  })

  it("datas que existem passam", () => {
    for (const bom of [
      "2026-02-28T18:00:00Z",
      "2026-04-30T18:00:00Z",
      "2026-01-31T18:00:00Z",
      "2026-12-31T23:59:59Z",
      "2026-08-01T00:00:00Z",
    ]) {
      expect(sourceInstant(bom), bom).not.toBeNull()
    }
  })

  it("ano bissexto pela regra completa: /4, exceto /100, salvo /400", () => {
    // 2024 é bissexto; 2026 não é.
    expect(sourceInstant("2024-02-29T18:00:00Z")).not.toBeNull()
    expect(sourceInstant("2026-02-29T18:00:00Z")).toBeNull()
    // 1900 é divisível por 4 e por 100, e NÃO é bissexto.
    expect(sourceInstant("1900-02-29T18:00:00Z")).toBeNull()
    // 2000 é divisível por 400, e É bissexto. É o caso que uma regra só de `%4`
    // acerta por acidente e uma regra de `%4 && !%100` erra.
    expect(sourceInstant("2000-02-29T18:00:00Z")).not.toBeNull()
    expect(sourceInstant("2100-02-29T18:00:00Z")).toBeNull()
    expect(sourceInstant("2400-02-29T18:00:00Z")).not.toBeNull()
  })

  it("§14 — o contador de dias é o MESMO que valida `Venc`", () => {
    // Uma autoridade de calendário. Se houvesse duas, a errada só apareceria quando
    // uma delas aceitasse 30 de fevereiro.
    expect(diasNoMes(2026, 2)).toBe(28)
    expect(diasNoMes(2024, 2)).toBe(29)
    expect(diasNoMes(1900, 2)).toBe(28)
    expect(diasNoMes(2000, 2)).toBe(29)
    expect(diasNoMes(2026, 4)).toBe(30)
  })
})

describe("§4 — hora, minuto e segundo em faixa", () => {
  it("fora de faixa é recusado", () => {
    for (const ruim of [
      "2026-08-19T24:00:00Z",
      "2026-08-19T25:00:00Z",
      "2026-08-19T99:00:00Z",
      "2026-08-19T23:60:00Z",
      "2026-08-19T23:99:00Z",
      "2026-08-19T23:59:60Z",
      "2026-08-19T23:59:61Z",
    ]) {
      expect(sourceInstant(ruim), ruim).toBeNull()
    }
  })

  it("os extremos válidos passam", () => {
    expect(sourceInstant("2026-08-19T00:00:00Z")).not.toBeNull()
    expect(sourceInstant("2026-08-19T23:59:59Z")).not.toBeNull()
  })

  it("segundo 60 é recusado por decisão, não por descuido", () => {
    // RFC3339 admite segundo intercalar. O runtime não o representa — `Date` não tem
    // 23:59:60 — e aceitá-lo obrigaria a mapeá-lo para 00:00:00 do dia seguinte, que
    // é a normalização silenciosa que este módulo existe para recusar.
    expect(sourceInstant("2026-12-31T23:59:60Z")).toBeNull()
  })
})

describe("§5 — fuso validado e aplicado como instante", () => {
  it("fuso inválido é recusado", () => {
    for (const ruim of [
      "2026-08-19T18:00:00+24:00",
      "2026-08-19T18:00:00-24:00",
      "2026-08-19T18:00:00+01:60",
      "2026-08-19T18:00:00+99:00",
      "2026-08-19T18:00:00+1:00",
      "2026-08-19T18:00:00+0100",
    ]) {
      expect(sourceInstant(ruim), ruim).toBeNull()
    }
  })

  it("`+HH:MM` e `-HH:MM` deslocam na direção certa", () => {
    const z = sourceInstant("2026-08-19T18:00:00Z")
    // `+01:00`: local 1h à frente de UTC → o instante é 17:00Z.
    expect(sourceInstant("2026-08-19T18:00:00+01:00")).toEqual(
      sourceInstant("2026-08-19T17:00:00Z"),
    )
    // `-03:00`: horário de Brasília → 18:00 local é 21:00Z.
    expect(sourceInstant("2026-08-19T18:00:00-03:00")).toEqual(
      sourceInstant("2026-08-19T21:00:00Z"),
    )
    // O caso do gate: `17:30-01:00` é 18:30Z, POSTERIOR a 18:00Z, embora a string
    // comece com "17".
    const comOffset = sourceInstant("2026-08-19T17:30:00-01:00")
    expect(comOffset).not.toBeNull()
    if (z === null || comOffset === null) throw new Error("esperava instantes")
    expect(compareSourceInstant(comOffset, z)).toBe(1)
    expect(comOffset).toEqual(sourceInstant("2026-08-19T18:30:00Z"))
  })

  it("§11 — fuso desloca segundos e NÃO perde a fração", () => {
    // `17:30:00.100900000-01:00` é o mesmo instante que `18:30:00.100900000Z`.
    const comOffset = sourceInstant("2026-08-19T17:30:00.100900000-01:00")
    const emZ = sourceInstant("2026-08-19T18:30:00.100900000Z")
    expect(comOffset).toEqual(emZ)
    if (comOffset === null) throw new Error("esperava instante")
    expect(comOffset.nanos).toBe(100_900_000)
  })

  it("offset com minuto não-zero é aplicado", () => {
    // `+05:30`, fuso da Índia.
    expect(sourceInstant("2026-08-19T18:00:00+05:30")).toEqual(
      sourceInstant("2026-08-19T12:30:00Z"),
    )
  })

  it("offset que atravessa a meia-noite não é normalizado errado", () => {
    // 00:30 com `+01:00` é 23:30Z do dia ANTERIOR. A aritmética é sobre o instante,
    // então o dia recua corretamente — o que uma validação de "round-trip" ingênua
    // sobre a representação civil deslocada teria reprovado por engano.
    expect(sourceInstant("2026-08-19T00:30:00+01:00")).toEqual(
      sourceInstant("2026-08-18T23:30:00Z"),
    )
    // E 23:30 com `-01:00` é 00:30Z do dia SEGUINTE.
    expect(sourceInstant("2026-08-19T23:30:00-01:00")).toEqual(
      sourceInstant("2026-08-20T00:30:00Z"),
    )
  })
})

describe("§5/§6 — fração EXATA até o nanossegundo", () => {
  const nanosDe = (s: string): number => {
    const i = sourceInstant(s)
    if (i === null) throw new Error(`esperava instante: ${s}`)
    return i.nanos
  }

  it("cada nível de precisão vira os nanos certos", () => {
    expect(nanosDe("2026-08-19T18:00:00Z")).toBe(0)
    expect(nanosDe("2026-08-19T18:00:00.1Z")).toBe(100_000_000)
    expect(nanosDe("2026-08-19T18:00:00.100Z")).toBe(100_000_000)
    expect(nanosDe("2026-08-19T18:00:00.1004Z")).toBe(100_400_000)
    expect(nanosDe("2026-08-19T18:00:00.1009Z")).toBe(100_900_000)
    expect(nanosDe("2026-08-19T18:00:00.123456Z")).toBe(123_456_000)
    expect(nanosDe("2026-08-19T18:00:00.123456789Z")).toBe(123_456_789)
  })

  it("§7 — os níveis que o Google emite: 0, 3, 6 e 9 dígitos", () => {
    // Assumir que produção sempre manda 3 foi o que levou ao truncamento.
    for (const [s, nanos] of [
      ["2026-08-19T18:00:00Z", 0],
      ["2026-08-19T18:00:00.123Z", 123_000_000],
      ["2026-08-19T18:00:00.123456Z", 123_456_000],
      ["2026-08-19T18:00:00.123456789Z", 123_456_789],
    ] as const) {
      expect(nanosDe(s), s).toBe(nanos)
    }
  })

  it("§15 — representações EQUIVALENTES são o mesmo instante", () => {
    const a = sourceInstant("2026-08-19T18:00:00.1Z")
    const b = sourceInstant("2026-08-19T18:00:00.100Z")
    const c = sourceInstant("2026-08-19T18:00:00.100000000Z")
    if (a === null || b === null || c === null) throw new Error("esperava instantes")
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(compareSourceInstant(a, c)).toBe(0)
  })

  it("§16 — UM nanossegundo de diferença é preservado", () => {
    const zero = sourceInstant("2026-08-19T18:00:00Z")
    const umNano = sourceInstant("2026-08-19T18:00:00.000000001Z")
    if (zero === null || umNano === null) throw new Error("esperava instantes")
    // Com milissegundos, os dois eram iguais. Aqui o segundo é POSTERIOR.
    expect(compareSourceInstant(umNano, zero)).toBe(1)
    expect(umNano.nanos).toBe(1)
  })

  it("§17/§18 — micro e nanossegundo distinguem", () => {
    const micro = [
      sourceInstant("2026-08-19T18:00:00.123455Z"),
      sourceInstant("2026-08-19T18:00:00.123456Z"),
    ]
    const nano = [
      sourceInstant("2026-08-19T18:00:00.123456788Z"),
      sourceInstant("2026-08-19T18:00:00.123456789Z"),
    ]
    for (const [antes, depois] of [micro, nano]) {
      if (antes === undefined || depois === undefined || antes === null || depois === null) {
        throw new Error("esperava instantes")
      }
      expect(compareSourceInstant(depois, antes)).toBe(1)
    }
  })

  it("§19 — mais de 9 dígitos é RECUSADO, nunca truncado", () => {
    // Truncar seria repetir o defeito com outro número de dígitos. A fonte enviou
    // precisão que este contrato não representa; recusar é honesto.
    for (const ruim of [
      "2026-08-19T18:00:00.1234567891Z",
      "2026-08-19T18:00:00.0000000001Z",
      "2026-08-19T18:00:00.1234567891234Z",
    ]) {
      expect(sourceInstant(ruim), ruim).toBeNull()
    }
    // Exatamente 9 passa.
    expect(sourceInstant("2026-08-19T18:00:00.123456789Z")).not.toBeNull()
  })

  it("o comparador é total e antissimétrico", () => {
    const a = sourceInstant("2026-08-19T18:00:00.1004Z")
    const b = sourceInstant("2026-08-19T18:00:00.1009Z")
    if (a === null || b === null) throw new Error("esperava instantes")
    expect(compareSourceInstant(a, b)).toBe(-1)
    expect(compareSourceInstant(b, a)).toBe(1)
    expect(compareSourceInstant(a, a)).toBe(0)
  })
})

describe("§10 — nenhum `Date` na conversão civil→época", () => {
  it("ano de dois dígitos no texto NÃO é remapeado para 19xx", () => {
    // `Date.UTC(99, ...)` devolveria 1999. A aritmética de calendário explícita não
    // tem esse caso especial.
    const i = sourceInstant("0099-08-19T18:00:00Z")
    if (i === null) throw new Error("esperava instante")
    // 0099 é MUITO antes da época: segundos negativos.
    expect(i.epoch_seconds).toBeLessThan(0)
    const noveNove = sourceInstant("1999-08-19T18:00:00Z")
    if (noveNove === null) throw new Error("esperava instante")
    expect(i.epoch_seconds).not.toBe(noveNove.epoch_seconds)
  })

  it("a época e datas conhecidas conferem", () => {
    expect(sourceInstant("1970-01-01T00:00:00Z")).toEqual({ epoch_seconds: 0, nanos: 0 })
    expect(sourceInstant("2000-01-01T00:00:00Z")).toEqual({ epoch_seconds: 946_684_800, nanos: 0 })
    expect(sourceInstant("2024-02-29T00:00:00Z")).toEqual({ epoch_seconds: 1_709_164_800, nanos: 0 })
    // Antes da época.
    expect(sourceInstant("1969-12-31T23:59:59Z")).toEqual({ epoch_seconds: -1, nanos: 0 })
  })

  it("§24 — o nosso relógio sobe para a mesma representação", () => {
    const i = instantFromDate(new Date("2026-08-19T18:00:00.100Z"))
    expect(i).toEqual({ epoch_seconds: 1_787_162_400, nanos: 100_000_000 })
    // E `.1009` da fonte NÃO compara igual a `.100` do nosso relógio.
    const fonte = sourceInstant("2026-08-19T18:00:00.1009Z")
    if (fonte === null || i === null) throw new Error("esperava instantes")
    expect(compareSourceInstant(fonte, i)).toBe(1)
  })

  it("instante antes da época mantém nanos em 0..999_999_999", () => {
    const i = instantFromDate(new Date("1969-12-31T23:59:59.500Z"))
    if (i === null) throw new Error("esperava instante")
    // `%` manteria o sinal do dividendo e daria nanos negativo.
    expect(i.nanos).toBeGreaterThanOrEqual(0)
    expect(i.nanos).toBe(500_000_000)
    expect(i.epoch_seconds).toBe(-1)
  })
})

describe("§2 — forma, antes de qualquer componente", () => {
  it("formas que não são RFC3339 completo são recusadas", () => {
    for (const ruim of [
      "2026-08-19",
      "Aug 27 2026",
      "2026-08-19T18:00Z",
      "2026-08-19 18:00:00Z",
      "2026-08-19T18:00:00",
      "2026-8-19T18:00:00Z",
      "26-08-19T18:00:00Z",
      "",
      "   ",
      "ontem à tarde",
    ]) {
      expect(sourceInstant(ruim), ruim).toBeNull()
    }
  })

  it("não-string é recusado sem lançar", () => {
    for (const v of [null, undefined, 0, 1755619140000, {}, [], new Date()]) {
      expect(sourceInstant(v), String(v)).toBeNull()
    }
  })

  it("espaço em volta é tolerado; dentro, não", () => {
    expect(sourceInstant("  2026-08-19T18:00:00Z  ")).not.toBeNull()
    expect(sourceInstant("2026-08-19T18: 00:00Z")).toBeNull()
  })
})
