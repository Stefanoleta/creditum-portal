/**
 * `snapshotPlainData` — a fronteira que trata objeto externo como dado instável.
 *
 * Estes testes existem em separado de propósito. A guarda é usada pela Fase 3.0c, e
 * se ela só fosse coberta através do assembler, relaxá-la aqui passaria pelos testes de
 * lá enquanto o `assembler` ainda parecesse seguro — e o furo de TOCTOU voltaria a
 * ser explorável sem que nada acusasse.
 *
 * A garantia é mais forte que "leia uma vez": é NÃO LEIA. Acessor é recusado pelo
 * descritor, e zero execuções de getter é estritamente melhor que uma.
 */

import { describe, expect, it } from "vitest"
import { snapshotPlainData } from "../src/immutability"

describe("dado canônico simples é capturado fielmente", () => {
  it("captura completa, inclusive propriedade desconhecida", () => {
    const original = {
      observation_id: "dob_1",
      view_state: { period: "2026-08", filters: [{ field: "unidade", value: "Meriti" }] },
      observations: [{ untrusted: true, content: "11 contratos" }],
      // Desconhecida DE PROPÓSITO: capturar só o conhecido transformaria objeto
      // inválido em válido, e o schema perderia a chance de recusar.
      extra_authority_field: "aprovado",
    }
    const snap = snapshotPlainData<typeof original>(original)
    expect(snap).not.toBeNull()
    expect(JSON.stringify(snap)).toBe(JSON.stringify(original))
    expect(Object.keys(snap ?? {})).toContain("extra_authority_field")
  })

  it("é um grafo NOVO em todos os níveis — nenhum alias retido", () => {
    const aninhado = { period: "2026-08" }
    const lista = [{ untrusted: true, content: "x" }]
    const original = { view_state: aninhado, observations: lista }
    const snap = snapshotPlainData<typeof original>(original)
    expect(snap).not.toBe(original)
    expect(snap?.view_state).not.toBe(aninhado)
    expect(snap?.observations).not.toBe(lista)
    expect(snap?.observations[0]).not.toBe(lista[0])
  })

  it("não toca no ownership do original", () => {
    const original = { a: [1, 2], b: { c: "d" } }
    snapshotPlainData(original)
    for (const v of [original, original.a, original.b]) {
      expect(Object.isFrozen(v)).toBe(false)
      expect(Object.isSealed(v)).toBe(false)
      expect(Object.isExtensible(v)).toBe(true)
    }
  })

  it("objeto já congelado é capturado normalmente, e continua congelado", () => {
    const original = Object.freeze({ a: Object.freeze(["x"]) })
    expect(snapshotPlainData(original)).toEqual({ a: ["x"] })
    expect(Object.isFrozen(original)).toBe(true)
  })

  it("prototype null é aceito; classe não", () => {
    const semProto = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 })
    expect(snapshotPlainData(semProto)).toEqual({ a: 1 })
    class Painel {
      readonly a = 1
    }
    expect(snapshotPlainData(new Painel())).toBeNull()
  })
})

describe("ACESSOR é recusado pelo descritor — o getter não roda", () => {
  it("getter na raiz", () => {
    let leituras = 0
    const alvo = {}
    Object.defineProperty(alvo, "observation_id", {
      get() {
        leituras += 1
        return "dob_1"
      },
      enumerable: true,
      configurable: true,
    })
    expect(snapshotPlainData(alvo)).toBeNull()
    expect(leituras).toBe(0)
  })

  it("getter aninhado", () => {
    let leituras = 0
    const interno = {}
    Object.defineProperty(interno, "content", {
      get() {
        leituras += 1
        return "x"
      },
      enumerable: true,
      configurable: true,
    })
    expect(snapshotPlainData({ observations: [interno] })).toBeNull()
    expect(leituras).toBe(0)
  })

  it("getter em índice de array", () => {
    let leituras = 0
    const lista: unknown[] = [undefined]
    Object.defineProperty(lista, "0", {
      get() {
        leituras += 1
        return "x"
      },
      enumerable: true,
      configurable: true,
    })
    expect(snapshotPlainData(lista)).toBeNull()
    expect(leituras).toBe(0)
  })

  it("setter sem getter também é acessor", () => {
    const alvo = {}
    Object.defineProperty(alvo, "x", { set: () => undefined, enumerable: true })
    expect(snapshotPlainData(alvo)).toBeNull()
  })
})

describe("Proxy é recusado — leitura de Proxy é execução de código do chamador", () => {
  it("na raiz e aninhado", () => {
    expect(snapshotPlainData(new Proxy({ a: 1 }, {}))).toBeNull()
    expect(snapshotPlainData({ dentro: new Proxy({ a: 1 }, {}) })).toBeNull()
    expect(snapshotPlainData([new Proxy({ a: 1 }, {})])).toBeNull()
  })

  it("o trap `get` nunca é chamado", () => {
    let traps = 0
    const p = new Proxy(
      { a: 1 },
      {
        get(alvo, k) {
          traps += 1
          return (alvo as Record<string | symbol, unknown>)[k]
        },
      },
    )
    expect(snapshotPlainData(p)).toBeNull()
    expect(traps).toBe(0)
  })
})

describe("fora do domínio JSON: recusa, nunca conversão", () => {
  it("valores não-canônicos", () => {
    for (const v of [
      undefined,
      () => 1,
      Symbol("x"),
      10n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date(),
      new Map(),
      new Set(),
    ]) {
      expect(snapshotPlainData(v), String(typeof v)).toBeNull()
    }
  })

  it("os mesmos valores ANINHADOS", () => {
    for (const v of [undefined, () => 1, new Date(), new Map(), Number.NaN]) {
      expect(snapshotPlainData({ campo: v })).toBeNull()
      expect(snapshotPlainData({ lista: [v] })).toBeNull()
    }
  })

  it("ciclo", () => {
    const ciclico: Record<string, unknown> = { a: 1 }
    ciclico["eu"] = ciclico
    expect(snapshotPlainData(ciclico)).toBeNull()
    const viaLista: Record<string, unknown> = {}
    viaLista["l"] = [viaLista]
    expect(snapshotPlainData(viaLista)).toBeNull()
  })

  it("referência compartilhada SEM ciclo é legítima", () => {
    const compartilhado = { a: 1 }
    const snap = snapshotPlainData<{ x: unknown; y: unknown }>({
      x: compartilhado,
      y: compartilhado,
    })
    expect(snap).toEqual({ x: { a: 1 }, y: { a: 1 } })
    // Cópias independentes: JSON não tem aliasing.
    expect(snap?.x).not.toBe(snap?.y)
  })

  it("símbolo como chave", () => {
    const alvo: Record<string | symbol, unknown> = { a: 1 }
    alvo[Symbol("oculto")] = 2
    expect(snapshotPlainData(alvo)).toBeNull()
  })

  it("propriedade não-enumerável é estado escondido", () => {
    const alvo = { a: 1 }
    Object.defineProperty(alvo, "oculto", { value: 2, enumerable: false })
    expect(snapshotPlainData(alvo)).toBeNull()
  })
})

describe("arrays", () => {
  it("array simples é capturado, com `length` não-enumerável tratado corretamente", () => {
    expect(snapshotPlainData([1, "a", null, { b: [2] }])).toEqual([1, "a", null, { b: [2] }])
    expect(snapshotPlainData([])).toEqual([])
  })

  it("esparso é recusado — o buraco não tem representação canônica", () => {
    const esparso: unknown[] = []
    esparso.length = 3
    esparso[0] = 1
    expect(snapshotPlainData(esparso)).toBeNull()
  })

  it("propriedade extra num array é recusada", () => {
    const lista: unknown[] = [1]
    ;(lista as unknown as Record<string, unknown>)["escondido"] = "x"
    expect(snapshotPlainData(lista)).toBeNull()
  })
})

describe("§13 §14 §47 — construção da cópia é segura para QUALQUER nome de chave", () => {
  const comChave = (chave: string, valor: unknown): Record<string, unknown> => {
    const alvo: Record<string, unknown> = { a: 1 }
    Object.defineProperty(alvo, chave, {
      value: valor,
      enumerable: true,
      writable: true,
      configurable: true,
    })
    return alvo
  }

  it("`__proto__` própria vira propriedade PRÓPRIA na cópia, e o prototype não muda", () => {
    const original = comChave("__proto__", { atacanteControla: true })
    const snap = snapshotPlainData<Record<string, unknown>>(original)
    expect(snap).not.toBeNull()
    // A propriedade SOBREVIVE — é isso que dá ao schema a chance de recusá-la.
    expect(Object.prototype.hasOwnProperty.call(snap, "__proto__")).toBe(true)
    expect(Object.keys(snap ?? {})).toContain("__proto__")
    // E o prototype da cópia continua o canônico.
    expect(Object.getPrototypeOf(snap)).toBe(Object.prototype)
    // O valor viaja como dado próprio, copiado.
    expect((snap as Record<string, unknown>)["__proto__"]).toEqual({ atacanteControla: true })
    expect((snap as Record<string, unknown>)["__proto__"]).not.toBe(original["__proto__"])
    // E o original não foi tocado.
    expect(Object.getPrototypeOf(original)).toBe(Object.prototype)
  })

  it("`__proto__` aninhada também", () => {
    const original = { dentro: comChave("__proto__", { atacanteControla: true }) }
    const snap = snapshotPlainData<{ dentro: Record<string, unknown> }>(original)
    expect(snap).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(snap?.dentro, "__proto__")).toBe(true)
    expect(Object.getPrototypeOf(snap?.dentro)).toBe(Object.prototype)
  })

  it("`__proto__` com valor primitivo também sobrevive", () => {
    // Atribuição comum aqui seria um no-op TOTALMENTE silencioso: o setter ignora
    // primitivo, e a propriedade simplesmente não existiria.
    const snap = snapshotPlainData<Record<string, unknown>>(comChave("__proto__", "texto"))
    expect(Object.prototype.hasOwnProperty.call(snap, "__proto__")).toBe(true)
    expect((snap as Record<string, unknown>)["__proto__"]).toBe("texto")
  })

  it("`constructor` e `prototype` são dado comum", () => {
    for (const chave of ["constructor", "prototype", "hasOwnProperty", "toString"]) {
      const snap = snapshotPlainData<Record<string, unknown>>(comChave(chave, "x"))
      expect(Object.prototype.hasOwnProperty.call(snap, chave), chave).toBe(true)
      expect((snap as Record<string, unknown>)[chave], chave).toBe("x")
    }
    // E o prototype global segue intacto.
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })

  it("`__proto__` com acessor é recusada pelo descritor, sem executar", () => {
    let leituras = 0
    const alvo: Record<string, unknown> = { a: 1 }
    Object.defineProperty(alvo, "__proto__", {
      get() {
        leituras += 1
        return { atacanteControla: true }
      },
      enumerable: true,
      configurable: true,
    })
    expect(snapshotPlainData(alvo)).toBeNull()
    expect(leituras).toBe(0)
  })
})

describe("coleções: o container é fronteira", () => {
  it("Proxy de array é recusado sem executar trap algum", () => {
    let traps = 0
    const conta = () => {
      traps += 1
    }
    const espiao = new Proxy([{ a: 1 }], {
      get(t, k) {
        conta()
        return (t as unknown as Record<string | symbol, unknown>)[k]
      },
      ownKeys(t) {
        conta()
        return Reflect.ownKeys(t)
      },
      getOwnPropertyDescriptor(t, k) {
        conta()
        return Reflect.getOwnPropertyDescriptor(t, k)
      },
      getPrototypeOf(t) {
        conta()
        return Reflect.getPrototypeOf(t)
      },
      has(t, k) {
        conta()
        return k in t
      },
    })
    expect(snapshotPlainData(espiao)).toBeNull()
    expect(traps).toBe(0)
  })

  it("iterador customizado não é invocado", () => {
    const lista: unknown[] = [{ a: 1 }]
    let iterou = 0
    Object.defineProperty(lista, Symbol.iterator, {
      value: function* () {
        iterou += 1
        yield { a: 2 }
      },
      configurable: true,
    })
    // Chave de símbolo já está fora do domínio canônico.
    expect(snapshotPlainData(lista)).toBeNull()
    expect(iterou).toBe(0)
  })

  it("array de objetos simples é capturado inteiro, com membros próprios", () => {
    const m1 = { id: "a" }
    const m2 = { id: "b" }
    const snap = snapshotPlainData<{ id: string }[]>([m1, m2])
    expect(snap).toEqual([{ id: "a" }, { id: "b" }])
    expect(snap?.[0]).not.toBe(m1)
    expect(snap?.[1]).not.toBe(m2)
  })
})
