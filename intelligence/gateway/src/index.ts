/**
 * Superfície pública do plano de consulta.
 *
 * O que está exportado aqui é o que existe. Não há export de escrita porque não
 * há escrita — ver `docs/THREAT_MODEL.md`, seção "Fronteira de escrita".
 *
 * Também não há como construir um store sem validação: `InMemoryStore` valida
 * no próprio construtor, e não existe caminho alternativo.
 */

export { ReadOnlyGateway, CONTRACT_VERSION } from "./gateway"
export type { Clock, EventQuery, SnapshotQuery } from "./gateway"

export {
  Allowlist,
  POC_ALLOWLIST,
  CAPABILITIES,
  FORBIDDEN_CAPABILITY_VERBS,
  MODEL_EGRESS_DENYLIST,
  validateAllowlistConfig,
} from "./allowlist"
export type { AllowlistConfig, Capability } from "./allowlist"

export {
  InMemoryStore,
  createValidatedStore,
  loadSyntheticStore,
  assertValidatedStore,
  isValidatedStore,
} from "./store"
export type { ReadOnlyStore, RawStoreContents } from "./store"

export { toSnapshot, toEvent, toEvidence } from "./factory"
export type { FactoryOptions } from "./factory"

export { checkStoreIntegrity, validateStoreIntegrity } from "./integrity"
export type { IntegrityIssue } from "./integrity"

export {
  checkSnapshotSemantics,
  checkEventSemantics,
  checkEvidenceSemantics,
  FUTURE_TOLERANCE_MS,
} from "./semantic"
export type { SemanticIssue } from "./semantic"

export { validate, assertValid, loadedContracts, CONTRACT_NAMES } from "./contracts"
export type { ContractName, ValidationIssue, ValidationResult } from "./contracts"

export { scanForPII, assertNoPII } from "./pii"
export type { PIIFinding, PIIKind } from "./pii"

export { guardEgress, inspectEgress, redactForLog, PIIEgressError } from "./egress"
export type { EgressChannel } from "./egress"

export { GatewayError, WriteAttemptedError } from "./errors"
export type { GatewayErrorCode } from "./errors"

export type * from "./types"
