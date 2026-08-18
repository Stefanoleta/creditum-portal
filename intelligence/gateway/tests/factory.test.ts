/**
 * Caminho único de construção.
 *
 * O que estes testes protegem: `JSON.parse(x) as Snapshot` compila e roda sem
 * verificar nada. Se existir qualquer rota que produza um objeto de domínio sem
 * passar por contrato + semântica, todo o resto do sistema passa a confiar em
 * dado não verificado.
 */

import { describe, expect, it } from "vitest"
import { toEvent, toEvidence, toSnapshot } from "../src/factory"
import { InMemoryStore, createValidatedStore, loadSyntheticStore } from "../src/store"
import { GatewayError } from "../src/errors"
import { FACTORY_OPTS, rawEvent, rawEvidence, rawSnapshot, rawTrio } from "./helpers"

describe("toSnapshot", () => {
  it("aceita snapshot válido", () => {
    expect(toSnapshot(rawSnapshot(), FACTORY_OPTS).snapshot_id).toBe("snap_teste")
  })

  it("recusa forma inválida — campo obrigatório ausente", () => {
    const sem = rawSnapshot()
    delete sem["rows_skipped"]
    expect(() => toSnapshot(sem, FACTORY_OPTS)).toThrowError(GatewayError)
  })

  it("recusa campo desconhecido no payload — payload é fechado", () => {
    expect(() =>
      toSnapshot(rawSnapshot({ payload: { sales_count: 1, campo_livre: "texto" } }), FACTORY_OPTS),
    ).toThrowError(/não satisfaz o contrato/)
  })

  it("recusa violação semântica — período invertido", () => {
    expect(() =>
      toSnapshot(rawSnapshot({ period_start: "2026-08-31", period_end: "2026-08-01" }), FACTORY_OPTS),
    ).toThrowError(/invariante semântica/)
  })
})

describe("toEvent e toEvidence", () => {
  it("aceitam objetos válidos", () => {
    expect(toEvent(rawEvent(), FACTORY_OPTS).event_id).toBe("evt_teste")
    expect(toEvidence(rawEvidence(), FACTORY_OPTS).evidence_id).toBe("ev_teste")
  })

  it("recusam materialidade sem o campo que o basis declara", () => {
    expect(() =>
      toEvent(rawEvent({ materiality: { basis: "amount_cents" } }), FACTORY_OPTS),
    ).toThrowError(GatewayError)
  })

  it("recusam evidência `cell` sem localização completa", () => {
    expect(() =>
      toEvidence(
        rawEvidence({ kind: "cell", locator: { dataset_id: "x", sheet: "Vendas" } }),
        FACTORY_OPTS,
      ),
    ).toThrowError(GatewayError)
  })
})

describe("store — não existe construção sem validação", () => {
  it("o construtor valida; não há caminho que aceite objeto cru", () => {
    const store = new InMemoryStore(rawTrio(), FACTORY_OPTS)
    expect(store.allSnapshots()).toHaveLength(1)
  })

  it("recusa fixture malformada no próprio carregamento", () => {
    const quebrado = rawTrio()
    quebrado.snapshots = [rawSnapshot({ evidence_refs: ["ev_teste"], content_hash: "curto" })]

    expect(() => createValidatedStore(quebrado, FACTORY_OPTS)).toThrowError(/não satisfaz o contrato/)
  })

  it("recusa snapshot com timestamp no futuro", () => {
    const futuro = rawTrio()
    futuro.snapshots = [
      rawSnapshot({
        evidence_refs: ["ev_teste"],
        observed_at: "2026-08-17T09:00:00.000Z",
        ingested_at: "2026-08-17T09:05:00.000Z",
      }),
    ]

    expect(() => createValidatedStore(futuro, FACTORY_OPTS)).toThrowError(/futuro/)
  })

  it("as fixtures sintéticas do disco passam pelo mesmo caminho validado", () => {
    const store = loadSyntheticStore(FACTORY_OPTS)
    expect(store.allSnapshots()).toHaveLength(3)
    expect(store.allEvents()).toHaveLength(4)
    expect(store.allEvidence()).toHaveLength(5)
  })
})
