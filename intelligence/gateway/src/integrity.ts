/**
 * Integridade referencial do store.
 *
 * Cada objeto pode ser individualmente válido e o conjunto ainda estar quebrado:
 * um evento apontando para snapshot que não existe, uma evidência órfã, um
 * conflito citando evidência de outro dataset.
 *
 * Referência pendurada é pior do que ausência de referência. Ausência o sistema
 * declara como `gap`; referência pendurada vira afirmação com lastro aparente —
 * o número chega ao humano parecendo rastreável, e a trilha morre no vazio.
 *
 * Por isso **falha fechado**: o store não é construído.
 */

import { GatewayError } from "./errors"
import type { Evidence, IntelligenceEvent, Snapshot } from "./types"

/**
 * Entrada da verificação: os dados, não o store.
 *
 * Receber `ReadOnlyStore` era um furo sutil — a verificação chamava
 * `store.allSnapshots()`, que é método virtual. Uma subclasse que sobrescrevesse
 * o método fazia a própria validação rodar sobre os dados falsificados. Agora o
 * construtor passa seus arrays privados direto, e não há despacho no caminho.
 */
export interface IntegrityInput {
  readonly snapshots: readonly Snapshot[]
  readonly events: readonly IntelligenceEvent[]
  readonly evidence: readonly Evidence[]
}

export interface IntegrityIssue {
  readonly kind:
    | "duplicate_id"
    | "dangling_snapshot_ref"
    | "dangling_evidence_ref"
    | "evidence_snapshot_mismatch"
    | "evidence_ownership_mismatch"
    | "dataset_mismatch"
  readonly path: string
  readonly message: string
}

function findDuplicates(ids: readonly string[]): string[] {
  const vistos = new Set<string>()
  const duplicados = new Set<string>()
  for (const id of ids) {
    if (vistos.has(id)) duplicados.add(id)
    vistos.add(id)
  }
  return [...duplicados]
}

/** Relata sem abortar. Útil para diagnóstico e para o ledger. */
export function checkStoreIntegrity(input: IntegrityInput): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []

  const { snapshots, events, evidence } = input

  const snapshotIds = new Set(snapshots.map((s) => s.snapshot_id))
  const evidenceIds = new Set(evidence.map((e) => e.evidence_id))
  const evidenceBySnapshot = new Map(evidence.map((e) => [e.evidence_id, e.snapshot_id]))
  const datasetBySnapshot = new Map(snapshots.map((s) => [s.snapshot_id, s.dataset_id]))

  // --- unicidade -----------------------------------------------------------

  for (const [rotulo, ids] of [
    ["snapshot_id", snapshots.map((s) => s.snapshot_id)],
    ["event_id", events.map((e) => e.event_id)],
    ["evidence_id", evidence.map((e) => e.evidence_id)],
  ] as const) {
    for (const dup of findDuplicates(ids)) {
      issues.push({
        kind: "duplicate_id",
        path: `${rotulo}=${dup}`,
        message: `${rotulo} repetido — o segundo registro tornaria o primeiro inalcançável`,
      })
    }
  }

  // --- evidência aponta para snapshot existente ----------------------------

  for (const ev of evidence) {
    if (!snapshotIds.has(ev.snapshot_id)) {
      issues.push({
        kind: "dangling_snapshot_ref",
        path: `evidence/${ev.evidence_id}.snapshot_id`,
        message: `snapshot inexistente: ${ev.snapshot_id}`,
      })
      continue
    }

    // O localizador tem que apontar para o mesmo dataset do snapshot dono.
    // Sem isso, uma evidência do dataset de agosto pode ancorar afirmação do
    // snapshot de setembro — e a trilha parece íntegra.
    const datasetDono = datasetBySnapshot.get(ev.snapshot_id)
    if (datasetDono !== undefined && ev.locator.dataset_id !== datasetDono) {
      issues.push({
        kind: "dataset_mismatch",
        path: `evidence/${ev.evidence_id}.locator.dataset_id`,
        message: `localizador aponta para "${ev.locator.dataset_id}" mas o snapshot dono é do dataset "${datasetDono}"`,
      })
    }
  }

  // --- snapshot aponta para evidência existente E PRÓPRIA -------------------

  for (const snap of snapshots) {
    // Um snapshot só pode citar evidência que ele mesmo carrega. Citar a
    // evidência de outro snapshot produz rastreabilidade falsa: o número
    // aparece ancorado, mas em dado que este recorte não observou.
    const daProprioSnapshot = (ref: string, path: string): void => {
      if (!evidenceIds.has(ref)) {
        issues.push({
          kind: "dangling_evidence_ref",
          path,
          message: `evidência inexistente: ${ref}`,
        })
        return
      }

      const dono = evidenceBySnapshot.get(ref)
      if (dono !== undefined && dono !== snap.snapshot_id) {
        issues.push({
          kind: "evidence_ownership_mismatch",
          path,
          message: `evidência ${ref} pertence ao snapshot ${dono}, não a ${snap.snapshot_id}`,
        })
      }
    }

    for (const ref of snap.evidence_refs) {
      daProprioSnapshot(ref, `snapshot/${snap.snapshot_id}.evidence_refs`)
    }

    // --- evidência citada por conflito ------------------------------------

    for (const conflito of snap.conflicts) {
      for (const versao of conflito.versions) {
        if (versao.evidence_ref === undefined) continue
        daProprioSnapshot(
          versao.evidence_ref,
          `snapshot/${snap.snapshot_id}/conflicts/${conflito.conflict_id}`,
        )
      }
    }
  }

  // --- evento: snapshots, evidências e coerência entre os dois -------------

  for (const ev of events) {
    for (const sid of ev.snapshot_ids) {
      if (!snapshotIds.has(sid)) {
        issues.push({
          kind: "dangling_snapshot_ref",
          path: `event/${ev.event_id}.snapshot_ids`,
          message: `snapshot inexistente: ${sid}`,
        })
      }
    }

    const lastro = new Set(ev.snapshot_ids)

    const refsDoEvento: [string, readonly string[]][] = [
      [`event/${ev.event_id}.evidence_refs`, ev.evidence_refs],
      ...(ev.contributing_cases ?? []).map(
        (c): [string, readonly string[]] => [
          `event/${ev.event_id}/case/${c.subject_ref}.evidence_refs`,
          c.evidence_refs ?? [],
        ],
      ),
    ]

    for (const [path, refs] of refsDoEvento) {
      for (const ref of refs) {
        if (!evidenceIds.has(ref)) {
          issues.push({
            kind: "dangling_evidence_ref",
            path,
            message: `evidência inexistente: ${ref}`,
          })
          continue
        }

        // Coerência: a evidência que sustenta um evento tem que pertencer a um
        // dos snapshots que o evento declara como lastro. Sem isso, um evento
        // poderia se ancorar em dado de período ou fonte que ele não citou.
        const dono = evidenceBySnapshot.get(ref)
        if (dono !== undefined && !lastro.has(dono)) {
          issues.push({
            kind: "evidence_snapshot_mismatch",
            path,
            message: `evidência ${ref} pertence ao snapshot ${dono}, fora do lastro declarado pelo evento`,
          })
        }
      }
    }
  }

  return issues
}

/**
 * Falha fechado. É a forma usada na construção do store.
 */
export function validateStoreIntegrity(input: IntegrityInput): void {
  const issues = checkStoreIntegrity(input)
  if (issues.length > 0) {
    throw new GatewayError(
      "SCHEMA_INVALID",
      `Integridade referencial violada (${issues.length} problema(s))`,
      issues.map((i) => `${i.path}: ${i.message}`),
    )
  }
}
