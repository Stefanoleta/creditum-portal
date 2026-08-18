/**
 * Único caminho de construção de objetos de domínio.
 *
 * O furo que isto fecha: `JSON.parse(...) as Snapshot` compila, roda e produz um
 * objeto que o TypeScript trata como válido sem nada ter sido verificado. O cast
 * é uma afirmação do programador, não uma checagem — e o dado vem de fora.
 *
 * Aqui todo objeto externo passa por duas barreiras antes de existir como tipo:
 *   1. o contrato JSON Schema (forma)
 *   2. as validações semânticas (coerência entre campos)
 *
 * Não há exportação que devolva `Snapshot` sem passar por isso.
 */

import { assertValid } from "./contracts"
import { GatewayError } from "./errors"
import {
  checkEvidenceSemantics,
  checkEventSemantics,
  checkSnapshotSemantics,
} from "./semantic"
import type { SemanticIssue } from "./semantic"
import type { Evidence, IntelligenceEvent, Snapshot } from "./types"

export interface FactoryOptions {
  /** Injetável para teste; por padrão, o relógio real. */
  readonly now?: Date
}

function raiseSemantic(kind: string, issues: readonly SemanticIssue[]): never {
  throw new GatewayError(
    "SCHEMA_INVALID",
    `${kind} viola invariante semântica`,
    issues.map((i) => `${i.path}: ${i.message}`),
  )
}

export function toSnapshot(raw: unknown, options: FactoryOptions = {}): Snapshot {
  assertValid("snapshot", raw)
  const snapshot = raw as Snapshot
  const issues = checkSnapshotSemantics(snapshot, options.now ?? new Date())
  if (issues.length > 0) raiseSemantic("snapshot", issues)
  return snapshot
}

export function toEvent(raw: unknown, options: FactoryOptions = {}): IntelligenceEvent {
  assertValid("event", raw)
  const event = raw as IntelligenceEvent
  const issues = checkEventSemantics(event, options.now ?? new Date())
  if (issues.length > 0) raiseSemantic("event", issues)
  return event
}

export function toEvidence(raw: unknown, options: FactoryOptions = {}): Evidence {
  assertValid("evidence", raw)
  const evidence = raw as Evidence
  const issues = checkEvidenceSemantics(evidence, options.now ?? new Date())
  if (issues.length > 0) raiseSemantic("evidence", issues)
  return evidence
}
