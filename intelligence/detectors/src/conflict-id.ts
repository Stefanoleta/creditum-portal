/**
 * Identidade determinística de conflito.
 *
 * A mesma disputa lógica precisa receber o mesmo `conflict_id` toda vez — senão
 * o ledger não consegue ligar a resolução humana de amanhã ao conflito detectado
 * hoje, e o mesmo conflito reaparece como novo a cada execução.
 *
 * O que compõe a identidade lógica:
 *
 *   campo · tipo · período · conjunto {fonte, DATASET, valor}
 *
 * ─── Por que o dataset entra ──────────────────────────────────────────────────
 *
 * Sem ele, duas planilhas diferentes do mesmo mês, ambas com
 * `sales_count: google_sheets=8 / bitrix24=14`, produziam o MESMO id — duas
 * disputas distintas colapsadas numa só. A consequência prática é grave: a
 * resolução humana de uma se anexaria ao histórico da outra.
 *
 * O `dataset_id` NÃO é string livre do consumidor: vem do snapshot governado,
 * resolvido pelo detector a partir do `snapshot_id` declarado. O par
 * (`source_system`, `dataset_id`) é a identidade lógica do participante.
 *
 * ─── O que continua fora, e por quê ───────────────────────────────────────────
 *
 *   `evidence_ref`  — a mesma disputa pode ser ancorada por evidências
 *                     diferentes conforme o recorte; a disputa é a mesma.
 *   `snapshot_id`   — é identidade de EXECUÇÃO. Reingerir o mesmo dataset no
 *                     mesmo período produz outro snapshot e o mesmo conflito.
 *   ordem de entrada — ordenar antes de codificar é o que faz `A vs B` e
 *                     `B vs A` produzirem o mesmo id.
 *
 * Nada de PII entra: fonte, dataset e valor são consolidados governados.
 */

import { createHash } from "node:crypto"
import type { ComparableKind } from "./comparison"

/** Participante da disputa, com identidade lógica governada. */
export interface DisputeParticipant {
  /** Do snapshot, não do rótulo do chamador. */
  readonly source_system: string
  /** Do snapshot. É o que distingue duas planilhas do mesmo período. */
  readonly dataset_id: string
  readonly value_repr: string
}

export interface ConflictIdentityInput {
  readonly field: string
  readonly kind: ComparableKind
  readonly period_start: string
  readonly period_end: string
  readonly versions: readonly DisputeParticipant[]
}

/**
 * Comparação por unidade de código, não por locale.
 *
 * `localeCompare` depende do locale do runtime — o mesmo conflito receberia ids
 * diferentes em máquinas diferentes, e o ledger perderia a correlação.
 */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compararParticipante(a: DisputeParticipant, b: DisputeParticipant): number {
  return (
    cmp(a.source_system, b.source_system) ||
    cmp(a.dataset_id, b.dataset_id) ||
    cmp(a.value_repr, b.value_repr)
  )
}

/**
 * Material canônico da disputa.
 *
 * Exposto para teste: quem revisa precisa poder ver exatamente o que entra no
 * hash, sem depender do valor opaco que sai.
 *
 * ─── Por que a estrutura chega inteira ao codificador ─────────────────────────
 *
 * Qualquer gramática de delimitador permite que duas estruturas diferentes
 * produzam a mesma string, desde que o conteúdo possa conter o delimitador.
 * Trocar o separador não resolve — só muda qual caractere é o problema. Uma
 * versão anterior juntava `fonte SEP dataset SEP valor` e depois os
 * participantes com outro separador; bastava um `dataset_id` carregando esses
 * caracteres para duas disputas distintas colidirem.
 *
 * ─── Por que NÃO `stableContent` ──────────────────────────────────────────────
 *
 * `stableContent` existe para conteúdo PLANO de linha de planilha. Internamente
 * monta `${chave}=${valor}` e passa cada valor por `parseText`, que aplica
 * `String(v)`. Um array de objetos vira `"[object Object]"`, e TODAS as disputas
 * com o mesmo número de participantes colidiriam — pior que o bug original. Ele
 * também colapsa espaços em branco, o que é correto para conteúdo de planilha e
 * lossy para identidade. Há teste registrando os três comportamentos em
 * `tests/conflict-id.test.ts`.
 *
 * `JSON.stringify` não é codificação caseira: é serialização padrão que escapa
 * caractere de controle, aspas e barra invertida, e delimita string e array.
 * Duas estruturas distintas não produzem a mesma saída. A ordem das chaves é a
 * do literal abaixo, fixa no código.
 */
export function conflictIdentityMaterial(input: ConflictIdentityInput): string {
  // Ordenação canônica. A deduplicação vem depois, comparando campo a campo —
  // nunca por string concatenada.
  const ordenados = [...input.versions].sort(compararParticipante)

  const participants: DisputeParticipant[] = []
  for (const p of ordenados) {
    const anterior = participants[participants.length - 1]
    if (anterior !== undefined && compararParticipante(anterior, p) === 0) continue
    participants.push({
      source_system: p.source_system,
      dataset_id: p.dataset_id,
      value_repr: p.value_repr,
    })
  }

  return JSON.stringify({
    field: input.field,
    kind: input.kind,
    period_start: input.period_start,
    period_end: input.period_end,
    participants,
  })
}

/** `conf_` + 16 hex — casa com o padrão de identificador dos contratos. */
export function conflictId(input: ConflictIdentityInput): string {
  const hash = createHash("sha256")
    .update(`creditum:conflict:v1:${conflictIdentityMaterial(input)}`, "utf8")
    .digest("hex")
    .slice(0, 16)
  return `conf_${hash}`
}

/**
 * Id do evento derivado do conflito.
 *
 * Deriva do `conflict_id` de propósito: um evento por disputa lógica. Reexecutar
 * o detector sobre a mesma entrada não cria um segundo evento para o mesmo fato.
 */
export function conflictEventId(conflict: string): string {
  return `evt_${conflict.replace(/^conf_/, "conflict_")}`
}
