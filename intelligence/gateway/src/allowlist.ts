/**
 * Allowlist do plano de consulta — negação por padrão.
 *
 * O briefing (§9) exige que o gateway recuse consulta a campos, fontes ou rotas
 * fora da allowlist. "Negar por padrão" só significa alguma coisa se a lista for
 * um dado explícito e revisável, não uma sequência de `if` espalhada pelo código.
 *
 * Uma capacidade ausente desta lista não existe. Não há caminho alternativo.
 */

import { GatewayError } from "./errors"
import type { SnapshotPayload, SourceSystem } from "./types"

/** As únicas operações que o Hermes pode invocar. Todas de leitura. */
export const CAPABILITIES = [
  "listSnapshots",
  "getSnapshot",
  "listEvents",
  "getEvidence",
  "getMaterialCases",
] as const

export type Capability = (typeof CAPABILITIES)[number]

/**
 * Verbos que nunca podem nomear uma capacidade.
 *
 * Isto não protege em runtime — protege na revisão: se alguém acrescentar
 * `createSnapshot` à lista acima, o teste de allowlist quebra antes do merge.
 */
export const FORBIDDEN_CAPABILITY_VERBS = [
  "create",
  "update",
  "delete",
  "insert",
  "upsert",
  "write",
  "patch",
  "put",
  "post",
  "send",
  "publish",
  "execute",
  "run",
  "approve",
  "pay",
] as const

export interface AllowlistConfig {
  readonly capabilities: readonly Capability[]
  readonly sources: readonly SourceSystem[]
  /** Campos do `payload` de snapshot que podem ser devolvidos. */
  readonly payloadFields: readonly string[]
}

/**
 * Configuração da POC.
 *
 * Omie e Omie Criteria estão de fora deliberadamente: decisão §4 do briefing —
 * o Hermes não acessa os ERPs, nem indiretamente por snapshot.
 */
export const POC_ALLOWLIST: AllowlistConfig = {
  capabilities: CAPABILITIES,
  sources: ["google_sheets", "supabase_ceo"],
  payloadFields: [
    "period_label",
    "sales_count",
    "leads_received",
    "leads_eligible",
    "volume_contracted_cents",
    "average_ticket_cents",
    "gross_conversion_bp",
    "eligible_conversion_bp",
    "installments_histogram",
    "first_due_date_histogram",
    "source_notes",
  ],
  // Dois campos do contrato de snapshot NÃO estão aqui, por motivos diferentes:
  //
  //   `internal_margin_bp`  — nunca foi para o agente. Mostra que schema (o que
  //                           pode ser armazenado) e allowlist (o que o agente
  //                           pode ver) são camadas distintas.
  //
  //   `unit_breakdown`      — retirado na Fase 1.1. Suas CHAVES são nomes livres
  //                           de unidade, e nome de pessoa numa chave não é
  //                           detectável sem heurística. Volta quando a Fase 2
  //                           canonicalizar as unidades (D13) e a chave virar
  //                           identificador fechado. Resíduo R1.
  //
  // `source_notes` está na lista, mas o gateway retém o `content` antes de
  // responder — ver `ModelFacingPayload`.
}

/**
 * Campos que NUNCA podem compor a resposta ao modelo, independentemente de
 * configuração.
 *
 * A allowlist é configurável de propósito — é ela que se ajusta por caso de uso.
 * Mas uma política de segurança que depende só de configuração é uma política
 * que a próxima configuração desliga. Enquanto R1 estiver aberto,
 * `unit_breakdown` tem chaves de texto livre e nome de pessoa ali não é
 * detectável sem heurística; então a proibição não pode ser um valor padrão que
 * alguém sobrescreve, tem que ser uma regra.
 *
 * Fecha com a canonicalização D13 da Fase 2, e não antes.
 */
export const MODEL_EGRESS_DENYLIST: readonly string[] = Object.freeze(["unit_breakdown"])

const SOURCE_SYSTEMS: readonly string[] = Object.freeze([
  "google_sheets",
  "bitrix24",
  "omie",
  "omie_criteria",
  "supabase_ceo",
  "manual_upload",
])

/**
 * Valida a configuração antes de virar política ativa.
 *
 * Falha fechado: uma configuração que tenta habilitar campo da denylist é
 * recusada, não ignorada em silêncio. Ignorar produziria a pior combinação —
 * quem configurou acredita que habilitou, e ninguém é avisado do contrário.
 */
export function validateAllowlistConfig(config: AllowlistConfig): void {
  const problemas: string[] = []

  for (const campo of config.payloadFields) {
    if (MODEL_EGRESS_DENYLIST.includes(campo)) {
      problemas.push(
        `campo "${campo}" está na denylist de egresso ao modelo e não pode ser habilitado por configuração`,
      )
    }
  }

  for (const cap of config.capabilities) {
    if (!CAPABILITIES.includes(cap)) problemas.push(`capacidade desconhecida: "${cap}"`)
  }

  for (const fonte of config.sources) {
    if (!SOURCE_SYSTEMS.includes(fonte)) problemas.push(`fonte desconhecida: "${fonte}"`)
  }

  if (problemas.length > 0) {
    throw new GatewayError("NOT_ALLOWED", "Configuração de allowlist recusada", problemas)
  }
}

export class Allowlist {
  private readonly capabilities: ReadonlySet<string>
  private readonly sources: ReadonlySet<string>
  private readonly payloadFields: ReadonlySet<string>

  constructor(config: AllowlistConfig = POC_ALLOWLIST) {
    validateAllowlistConfig(config)

    this.capabilities = new Set(config.capabilities)
    this.sources = new Set(config.sources)
    this.payloadFields = new Set(config.payloadFields)

    Object.freeze(this)
  }

  assertCapability(name: string): void {
    if (!this.capabilities.has(name)) {
      throw new GatewayError(
        "NOT_ALLOWED",
        `Capacidade "${name}" não está na allowlist do plano de consulta`,
        [name],
      )
    }
  }

  assertSource(source: string): void {
    if (!this.sources.has(source)) {
      throw new GatewayError(
        "SOURCE_NOT_ALLOWED",
        `Fonte "${source}" não é consultável pelo plano de consulta`,
        [source],
      )
    }
  }

  isSourceAllowed(source: string): boolean {
    return this.sources.has(source)
  }

  /**
   * Projeta o payload para os campos permitidos.
   *
   * Filtrar em vez de recusar é intencional aqui: um snapshot pode legitimamente
   * carregar mais campos do que o Hermes precisa ver, e recusar o snapshot
   * inteiro por causa disso tornaria a allowlist impossível de manter.
   */
  projectPayload(payload: SnapshotPayload): SnapshotPayload {
    const out: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(payload)) {
      if (this.payloadFields.has(field)) {
        out[field] = value
      }
    }
    // Projeção de um payload já validado: filtrar campos não pode produzir uma
    // forma inválida, porque todos os campos do contrato são opcionais.
    return out
  }

  droppedPayloadFields(payload: SnapshotPayload): readonly string[] {
    return Object.keys(payload).filter((f) => !this.payloadFields.has(f))
  }
}
