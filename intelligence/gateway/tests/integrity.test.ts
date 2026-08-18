/**
 * Integridade referencial.
 *
 * Cada objeto pode ser válido e o conjunto ainda estar quebrado. Referência
 * pendurada é pior que ausência: ausência o sistema declara como `gap`;
 * referência pendurada chega ao humano parecendo rastreável e a trilha morre no
 * vazio.
 */

import { describe, expect, it } from "vitest"
import { checkStoreIntegrity } from "../src/integrity"
import { createValidatedStore, loadSyntheticStore } from "../src/store"
import { FACTORY_OPTS, rawEvent, rawEvidence, rawSnapshot, rawTrio } from "./helpers"

describe("conjunto íntegro", () => {
  it("as fixtures sintéticas não têm nenhuma pendência", () => {
    const store = loadSyntheticStore(FACTORY_OPTS)
    expect(
      checkStoreIntegrity({
        snapshots: store.allSnapshots(),
        events: store.allEvents(),
        evidence: store.allEvidence(),
      }),
    ).toEqual([])
  })
})

describe("falha fechado — o store não é construído", () => {
  it("evento apontando para snapshot inexistente", () => {
    const quebrado = rawTrio()
    quebrado.events = [rawEvent({ snapshot_ids: ["snap_que_nao_existe"] })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /snapshot inexistente: snap_que_nao_existe/,
    )
  })

  it("evidência apontando para snapshot inexistente", () => {
    const quebrado = rawTrio()
    quebrado.evidence = [rawEvidence({ snapshot_id: "snap_fantasma" })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /snapshot inexistente: snap_fantasma/,
    )
  })

  it("evento citando evidência inexistente", () => {
    const quebrado = rawTrio()
    quebrado.events = [rawEvent({ evidence_refs: ["ev_fantasma"] })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /evidência inexistente: ev_fantasma/,
    )
  })

  it("snapshot citando evidência inexistente", () => {
    const quebrado = rawTrio()
    quebrado.snapshots = [rawSnapshot({ evidence_refs: ["ev_teste", "ev_fantasma"] })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /evidência inexistente: ev_fantasma/,
    )
  })

  it("conflito citando evidência inexistente", () => {
    const quebrado = rawTrio()
    quebrado.snapshots = [
      rawSnapshot({
        evidence_refs: ["ev_teste"],
        quality_status: "conflicted",
        conflicts: [
          {
            conflict_id: "conf_teste",
            field: "sales_count",
            resolved: false,
            versions: [
              { source_system: "a", value_repr: "8", evidence_ref: "ev_teste" },
              { source_system: "b", value_repr: "14", evidence_ref: "ev_nao_existe" },
            ],
          },
        ],
      }),
    ]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /evidência inexistente: ev_nao_existe/,
    )
  })

  it("caso contribuinte citando evidência inexistente", () => {
    const quebrado = rawTrio()
    quebrado.events = [
      rawEvent({
        contributing_cases: [
          {
            subject_ref: "subj_9f2a4c6e8b0d1357",
            contribution: { count: 1 },
            evidence_refs: ["ev_fantasma"],
          },
        ],
      }),
    ]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /evidência inexistente: ev_fantasma/,
    )
  })

  it("id de snapshot repetido", () => {
    const quebrado = rawTrio()
    quebrado.snapshots = [
      rawSnapshot({ evidence_refs: ["ev_teste"] }),
      rawSnapshot({ evidence_refs: ["ev_teste"], dataset_id: "outro" }),
    ]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(/snapshot_id repetido/)
  })

  it("id de evidência repetido", () => {
    const quebrado = rawTrio()
    quebrado.evidence = [rawEvidence(), rawEvidence({ kind: "absence" })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(/evidence_id repetido/)
  })

  it("id de evento repetido", () => {
    const quebrado = rawTrio()
    quebrado.events = [rawEvent(), rawEvent({ severity: "low" })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(/event_id repetido/)
  })
})

describe("ownership — um snapshot só cita evidência PRÓPRIA", () => {
  const doisSnapshots = (): {
    snapshots: Record<string, unknown>[]
    evidence: Record<string, unknown>[]
    events: Record<string, unknown>[]
  } => ({
    snapshots: [
      rawSnapshot({ snapshot_id: "snap_a", evidence_refs: ["ev_de_a"] }),
      rawSnapshot({ snapshot_id: "snap_b", evidence_refs: ["ev_de_b"] }),
    ],
    evidence: [
      rawEvidence({ evidence_id: "ev_de_a", snapshot_id: "snap_a" }),
      rawEvidence({ evidence_id: "ev_de_b", snapshot_id: "snap_b" }),
    ],
    events: [],
  })

  it("recusa snapshot citando evidência de outro snapshot", () => {
    // A evidência existe e é válida — o erro é que ela pertence a outro recorte.
    // Sem esta checagem, o número aparece ancorado em dado que este snapshot
    // nunca observou: rastreabilidade falsa, que é pior que ausência de âncora.
    const quebrado = doisSnapshots()
    quebrado.snapshots = [
      rawSnapshot({ snapshot_id: "snap_a", evidence_refs: ["ev_de_a", "ev_de_b"] }),
      rawSnapshot({ snapshot_id: "snap_b", evidence_refs: ["ev_de_b"] }),
    ]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /evidência ev_de_b pertence ao snapshot snap_b, não a snap_a/,
    )
  })

  it("recusa conflito citando evidência de outro snapshot", () => {
    const quebrado = doisSnapshots()
    quebrado.snapshots = [
      rawSnapshot({
        snapshot_id: "snap_a",
        evidence_refs: ["ev_de_a"],
        quality_status: "conflicted",
        conflicts: [
          {
            conflict_id: "conf_cruzado",
            field: "sales_count",
            resolved: false,
            versions: [
              { source_system: "a", value_repr: "8", evidence_ref: "ev_de_a" },
              { source_system: "b", value_repr: "14", evidence_ref: "ev_de_b" },
            ],
          },
        ],
      }),
      rawSnapshot({ snapshot_id: "snap_b", evidence_refs: ["ev_de_b"] }),
    ]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /evidência ev_de_b pertence ao snapshot snap_b, não a snap_a/,
    )
  })

  it("aceita conflito que cita apenas evidência própria", () => {
    const ok = doisSnapshots()
    ok.snapshots = [
      rawSnapshot({
        snapshot_id: "snap_a",
        evidence_refs: ["ev_de_a"],
        quality_status: "conflicted",
        conflicts: [
          {
            conflict_id: "conf_proprio",
            field: "sales_count",
            resolved: false,
            versions: [
              { source_system: "a", value_repr: "8" },
              { source_system: "b", value_repr: "14", evidence_ref: "ev_de_a" },
            ],
          },
        ],
      }),
      rawSnapshot({ snapshot_id: "snap_b", evidence_refs: ["ev_de_b"] }),
    ]

    expect(() => createValidatedStore(ok, FACTORY_OPTS)).not.toThrow()
  })
})

describe("dataset — o localizador tem que apontar para o dataset do snapshot dono", () => {
  it("recusa evidência cujo locator é de outro dataset", () => {
    const quebrado = {
      snapshots: [
        rawSnapshot({
          snapshot_id: "snap_agosto",
          dataset_id: "vendas-agosto",
          evidence_refs: ["ev_x"],
        }),
      ],
      evidence: [
        rawEvidence({
          evidence_id: "ev_x",
          snapshot_id: "snap_agosto",
          locator: { dataset_id: "vendas-setembro", sheet: "Vendas" },
        }),
      ],
      events: [],
    }

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /aponta para "vendas-setembro" mas o snapshot dono é do dataset "vendas-agosto"/,
    )
  })

  it("aceita quando os datasets coincidem", () => {
    const ok = {
      snapshots: [
        rawSnapshot({
          snapshot_id: "snap_agosto",
          dataset_id: "vendas-agosto",
          evidence_refs: ["ev_x"],
        }),
      ],
      evidence: [
        rawEvidence({
          evidence_id: "ev_x",
          snapshot_id: "snap_agosto",
          locator: { dataset_id: "vendas-agosto", sheet: "Vendas" },
        }),
      ],
      events: [],
    }

    expect(() => createValidatedStore(ok, FACTORY_OPTS)).not.toThrow()
  })
})

describe("coerência entre evidência e lastro do evento", () => {
  it("recusa evento ancorado em evidência de snapshot que ele não declarou", () => {
    // Os dois snapshots existem e a evidência existe. O erro é sutil: o evento
    // declara lastro em `snap_a` mas se ancora em evidência de `snap_b`. Sem
    // esta checagem, um evento poderia citar dado de período ou fonte que ele
    // não assumiu — com aparência de rastreabilidade completa.
    const quebrado = {
      snapshots: [
        rawSnapshot({ snapshot_id: "snap_a", evidence_refs: ["ev_de_a"] }),
        rawSnapshot({ snapshot_id: "snap_b", evidence_refs: ["ev_de_b"] }),
      ],
      evidence: [
        rawEvidence({ evidence_id: "ev_de_a", snapshot_id: "snap_a" }),
        rawEvidence({ evidence_id: "ev_de_b", snapshot_id: "snap_b" }),
      ],
      events: [rawEvent({ snapshot_ids: ["snap_a"], evidence_refs: ["ev_de_b"] })],
    }

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(
      /fora do lastro declarado pelo evento/,
    )
  })

  it("aceita quando a evidência pertence a um dos snapshots do lastro", () => {
    const ok = {
      snapshots: [
        rawSnapshot({ snapshot_id: "snap_a", evidence_refs: ["ev_de_a"] }),
        rawSnapshot({ snapshot_id: "snap_b", evidence_refs: ["ev_de_b"] }),
      ],
      evidence: [
        rawEvidence({ evidence_id: "ev_de_a", snapshot_id: "snap_a" }),
        rawEvidence({ evidence_id: "ev_de_b", snapshot_id: "snap_b" }),
      ],
      events: [rawEvent({ snapshot_ids: ["snap_a", "snap_b"], evidence_refs: ["ev_de_b"] })],
    }

    expect(() => createValidatedStore(ok, FACTORY_OPTS)).not.toThrow()
  })
})
