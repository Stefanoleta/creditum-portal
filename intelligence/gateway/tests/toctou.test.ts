/**
 * O estado registrado é exatamente o estado validado.
 *
 * O furo que estes testes fecham era temporal, não estrutural: cada elemento era
 * validado sobre a referência ORIGINAL, e a cópia só acontecia depois que todos
 * tinham passado. Um elemento posterior com getter ou trap alterava um elemento
 * anterior — já aprovado — e a cópia final capturava o estado alterado.
 *
 * O resultado era um store congelado, íntegro segundo as checagens referenciais,
 * registrado em VALIDADOS, e contendo dado que nunca passou por validação
 * nenhuma. Congelar mais forte não resolvia: o congelamento acontecia depois do
 * estrago.
 *
 * A correção é destacar o grafo INTEIRO antes da primeira validação. Depois
 * disso, a entrada original está fora da fronteira de confiança.
 */

import { describe, expect, it } from "vitest"
import { createValidatedStore, isValidatedStore } from "../src/store"
import { FACTORY_OPTS, rawEvent, rawEvidence, rawSnapshot } from "./helpers"

/** Instala um getter enumerável que dispara um efeito colateral ao ser lido. */
function comArmadilha(
  objeto: Record<string, unknown>,
  campo: string,
  valor: unknown,
  efeito: () => void,
): Record<string, unknown> {
  Object.defineProperty(objeto, campo, {
    enumerable: true,
    configurable: true,
    get() {
      efeito()
      return valor
    },
  })
  return objeto
}

function salesCount(snapshot: Record<string, unknown>): unknown {
  return (snapshot["payload"] as Record<string, unknown>)["sales_count"]
}

function setSalesCount(snapshot: Record<string, unknown>, valor: unknown): void {
  ;(snapshot["payload"] as Record<string, unknown>)["sales_count"] = valor
}

describe("A — mutação reentrante dentro da mesma coleção, para valor INVÁLIDO", () => {
  it("o valor armazenado é o que passou pela validação, não o injetado", () => {
    const alvo = rawSnapshot({ snapshot_id: "snap_alvo", payload: { sales_count: 14 } })
    const atacante = comArmadilha(
      rawSnapshot({ snapshot_id: "snap_atacante" }),
      "dataset_id",
      "dataset-de-teste",
      () => {
        // Dispara enquanto o grafo é percorrido. Antes da correção, isto
        // acontecia DEPOIS de `alvo` ter sido aprovado e ANTES de ele ser
        // copiado — então `"texto-invalido"` ia parar no store.
        setSalesCount(alvo, "texto-invalido")
      },
    )

    const store = createValidatedStore({ snapshots: [alvo, atacante] }, FACTORY_OPTS)

    // A armadilha de fato disparou — o teste não passa por vacuidade.
    expect(salesCount(alvo)).toBe("texto-invalido")

    // E mesmo assim o store guarda o valor validado.
    const armazenado = store.allSnapshots().find((s) => s.snapshot_id === "snap_alvo")
    expect(armazenado?.payload.sales_count).toBe(14)
  })
})

describe("B — mutação reentrante para valor AINDA VÁLIDO", () => {
  it("o armazenado é o valor que a validação viu, não o substituído", () => {
    // Este é o caso que schema e integridade NÃO pegariam: 999 é um
    // `sales_count` perfeitamente legal. A única defesa é o estado armazenado
    // ser, por construção, o mesmo que foi validado.
    const alvo = rawSnapshot({ snapshot_id: "snap_alvo_b", payload: { sales_count: 14 } })
    const atacante = comArmadilha(
      rawSnapshot({ snapshot_id: "snap_atacante_b" }),
      "dataset_id",
      "dataset-de-teste",
      () => {
        setSalesCount(alvo, 999)
      },
    )

    const store = createValidatedStore({ snapshots: [alvo, atacante] }, FACTORY_OPTS)

    expect(salesCount(alvo)).toBe(999)
    expect(
      store.allSnapshots().find((s) => s.snapshot_id === "snap_alvo_b")?.payload.sales_count,
    ).toBe(14)
  })
})

describe("C — mutação entre coleções diferentes", () => {
  it("armadilha em Event não altera o Snapshot armazenado", () => {
    const snapshot = rawSnapshot({ snapshot_id: "snap_c", payload: { sales_count: 14 } })
    const evento = comArmadilha(
      rawEvent({ event_id: "evt_c", snapshot_ids: ["snap_c"], evidence_refs: ["ev_c"] }),
      "detector_id",
      "det.teste",
      () => {
        setSalesCount(snapshot, 777)
      },
    )
    const evidencia = rawEvidence({ evidence_id: "ev_c", snapshot_id: "snap_c" })

    const store = createValidatedStore(
      { snapshots: [snapshot], events: [evento], evidence: [evidencia] },
      FACTORY_OPTS,
    )

    expect(salesCount(snapshot)).toBe(777)
    expect(store.allSnapshots()[0]?.payload.sales_count).toBe(14)
  })

  it("armadilha em Evidence não altera o Snapshot armazenado", () => {
    const snapshot = rawSnapshot({ snapshot_id: "snap_c2", payload: { sales_count: 14 } })
    const evidencia = comArmadilha(
      rawEvidence({ evidence_id: "ev_c2", snapshot_id: "snap_c2" }),
      "kind",
      "aggregate",
      () => {
        setSalesCount(snapshot, 555)
      },
    )

    const store = createValidatedStore(
      { snapshots: [snapshot], evidence: [evidencia] },
      FACTORY_OPTS,
    )

    expect(salesCount(snapshot)).toBe(555)
    expect(store.allSnapshots()[0]?.payload.sales_count).toBe(14)
  })
})

describe("D — entrada não destacável falha fechado", () => {
  it("Proxy na raiz de um elemento é recusado", () => {
    const proxied = new Proxy(rawSnapshot(), {})
    expect(() => createValidatedStore({ snapshots: [proxied] }, FACTORY_OPTS)).toThrowError(
      /não pôde ser destacada antes da validação/,
    )
  })

  it("Proxy aninhado dentro do payload é recusado", () => {
    const comProxyDentro = rawSnapshot({
      payload: new Proxy({ sales_count: 14 }, {}),
    })
    expect(() => createValidatedStore({ snapshots: [comProxyDentro] }, FACTORY_OPTS)).toThrowError(
      /DataCloneError/,
    )
  })

  it("função na entrada é recusada", () => {
    const comFuncao = rawSnapshot({ payload: { sales_count: 14, truque: () => 1 } })
    expect(() => createValidatedStore({ snapshots: [comFuncao] }, FACTORY_OPTS)).toThrowError(
      /não pôde ser destacada/,
    )
  })

  it("nenhum store chega a existir — nada é registrado", () => {
    let store: unknown = "nao-construido"
    try {
      store = createValidatedStore({ snapshots: [new Proxy(rawSnapshot(), {})] }, FACTORY_OPTS)
    } catch {
      // esperado
    }
    expect(store).toBe("nao-construido")
    expect(isValidatedStore(store as never)).toBe(false)
  })
})

describe("E — a entrada original sai da fronteira de confiança", () => {
  it("mutar a entrada DEPOIS da construção não alcança o store", () => {
    const entrada = rawSnapshot({ snapshot_id: "snap_e", payload: { sales_count: 14 } })
    const store = createValidatedStore({ snapshots: [entrada] }, FACTORY_OPTS)

    setSalesCount(entrada, 42)

    expect(salesCount(entrada)).toBe(42)
    expect(store.allSnapshots()[0]?.payload.sales_count).toBe(14)
  })

  it("o store validado continua registrado e congelado", () => {
    const store = createValidatedStore(
      { snapshots: [rawSnapshot({ snapshot_id: "snap_e2" })] },
      FACTORY_OPTS,
    )
    expect(isValidatedStore(store)).toBe(true)
    expect(Object.isFrozen(store)).toBe(true)
    expect(Object.isFrozen(store.allSnapshots()[0])).toBe(true)
  })
})
