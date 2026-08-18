/**
 * Regra de ticket baixo — contrato individual abaixo do piso comercial.
 *
 * ─── O que a regra afirma, e só isso ──────────────────────────────────────────
 *
 *   "o ticket deste contrato está abaixo do piso aprovado"
 *
 * Não afirma fraude. Não afirma erro de digitação. Não afirma prejuízo. Não afirma
 * mau negócio. Não afirma risco de inadimplência. Não afirma causa. Não recomenda
 * nada. É alerta OPERACIONAL FACTUAL: alguém conferiu um número e ele está abaixo
 * de um piso que o CEO definiu.
 *
 * A disciplina é a mesma dos outros quatro detectores, e por um motivo prático: um
 * alerta que diz "possível fraude" muda o comportamento de quem lê antes de
 * qualquer verificação. Um alerta que diz "ticket abaixo do piso" faz a pessoa ir
 * olhar.
 *
 * ─── O piso é regra, não parâmetro ────────────────────────────────────────────
 *
 * `R$ 1.499,99` = `149_999` centavos, comparação **estritamente menor**:
 *
 *   149_998  → alerta
 *   149_999  → NÃO alerta
 *   150_000  → NÃO alerta
 *
 * Vive em `APPROVED_THRESHOLDS`, ao lado do `installment_threshold`, e o predicado
 * e o texto da fórmula derivam da MESMA constante — a lição do gate da Fase 2.3.
 *
 * ─── Independência dos R$ 50.000 ──────────────────────────────────────────────
 *
 * `material_amount_cents` (R$ 50.000) e `low_ticket_floor_cents` (R$ 1.499,99) são
 * as duas dinheiro, as duas em centavos, e respondem a perguntas opostas:
 *
 *   R$ 50.000     um AGREGADO é grande o bastante para merecer atenção?
 *   R$ 1.499,99   um CONTRATO é pequeno o bastante para merecer conferência?
 *
 * Trocar uma pela outra faria um contrato de R$ 40.000 virar alerta de ticket
 * baixo. Há teste dedicado a isso.
 *
 * Função pura: sem rede, disco, env, relógio implícito, aleatoriedade ou mutação.
 * Só `observed` e `gap` — nenhum cálculo agregado, nenhuma inferência.
 */

import { GatewayError } from "../../gateway/src/errors"
import { deepFreeze } from "../../gateway/src/immutability"
import type { Evidence, IntelligenceEvent, Snapshot } from "../../gateway/src/types"
import type { CanonicalUnitResult } from "./canonical-units"
import { APPROVED_THRESHOLDS } from "./config"
import type { Severity } from "./config"
import { CREDITUM_POLICY_V1 } from "./production-policy"
import { toEvent } from "../../gateway/src/factory"
import { gap, isOk, observed } from "./engine"
import type { Metric } from "./engine"
import { piorQualidade } from "./quality"
import type { Quality } from "./quality"
import { structuralId } from "./structural-id"

export const RULE_ID = "rule.low_ticket_contract"
/** SemVer. Muda quando a regra observável muda — nunca data nem hash. */
export const RULE_VERSION = "1.0.0"

const EVENT_TYPE = "low_ticket_contract"

/** O piso aprovado. Uma fonte só para o predicado e para a fórmula publicada. */
export const LOW_TICKET_FLOOR_CENTS = APPROVED_THRESHOLDS.low_ticket_floor_cents

/**
 * Severidade do alerta de ticket baixo. FIXA para a regra v1.
 *
 * Vem da Política Creditum v1, não das bandas percentuais gerais. É decisão
 * própria desta regra e não deriva de R$ 50.000, de 10%, de 5 casos nem de
 * população mínima — um contrato individual abaixo do piso não tem participação
 * num todo para graduar.
 *
 * Projetada da política governada, nunca escrita aqui: o valor da Creditum tem
 * uma fonte só.
 */
export const LOW_TICKET_SEVERITY: Severity = CREDITUM_POLICY_V1.low_ticket_severity

/** Estritamente menor. `149_999` não alerta. */
export function isLowTicket(ticket_cents: number): boolean {
  return ticket_cents < LOW_TICKET_FLOOR_CENTS
}

/** O texto que descreve `isLowTicket`, gerado da mesma constante. */
export const FORMULA_LOW_TICKET = `ticket_cents < ${LOW_TICKET_FLOOR_CENTS}`

// ─── Entrada ──────────────────────────────────────────────────────────────────

export interface TicketRecord {
  /** Pseudônimo estável. NUNCA nome, CPF, telefone ou e-mail. */
  readonly subject_ref: string
  /** Já canonicalizada por D13. A regra não executa heurística própria. */
  readonly unit: CanonicalUnitResult
  /**
   * Ticket em centavos INTEIROS. Ausente = `null`, nunca zero por omissão.
   *
   * No schema `ceo`, `ticket_cents` é coluna gerada:
   * `transfer_cents * installments_grau`, com `transfer_cents >= 0` e
   * `installments_grau > 0`. Logo o domínio governado admite `0` (transferência
   * zero) e **não** admite negativo.
   */
  readonly ticket_cents: number | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
}

export interface LowTicketInput {
  readonly detected_at: string
  readonly period_start: string
  readonly period_end: string
  readonly contracts: readonly TicketRecord[]
  /** Conjunto governado que sustenta os refs. Não é o store inteiro. */
  readonly snapshots: readonly Snapshot[]
  readonly evidence: readonly Evidence[]
}

// ─── Saída ────────────────────────────────────────────────────────────────────

/**
 * Veredito de um contrato. Conjunto FECHADO.
 *
 * `INVALID_TICKET` é separado de `BELOW_FLOOR` de propósito. Ver `avaliar`.
 */
export type TicketVerdict =
  | "BELOW_FLOOR"
  | "AT_OR_ABOVE_FLOOR"
  | "TICKET_UNAVAILABLE"
  | "INVALID_TICKET"

/**
 * Por que o fato não virou Event executivo.
 *
 * `SEVERITY_POLICY_UNRESOLVED` é o único motivo hoje, e é decisão registrada: o
 * contrato do evento exige `severity` obrigatória, e não existe política aprovada
 * de severidade para `low_ticket_contract`. Ver §9 abaixo.
 */
/**
 * Por que um contrato avaliado não virou Event.
 *
 * `SEVERITY_POLICY_UNRESOLVED` foi removida na Fase 2.7: a severidade `medium`
 * passou a ser política aprovada, então um fato válido abaixo do piso emite.
 * O que resta são motivos factuais — o ticket não está abaixo do piso, ou não há
 * ticket com que decidir.
 */
export type LowTicketNotEmittedReason =
  | "NOT_BELOW_FLOOR"
  | "TICKET_UNAVAILABLE"
  | "INVALID_TICKET"

export interface TicketAssessment {
  readonly subject_ref: string
  /** Nome de exibição do CATÁLOGO. Omitido quando D13 não resolveu. */
  readonly unit?: string
  readonly ticket_cents: Metric<number>
  readonly verdict: TicketVerdict
  /** Presente quando o veredito não permite decidir. */
  readonly detail?: string
  readonly evidence_refs: readonly string[]
  /**
   * O FATO: o ticket está abaixo do piso aprovado.
   *
   * Independente da emissão do Event. Um fato detectado não se perde porque a
   * política de severidade ainda não existe.
   */
  readonly matched: boolean
  /** O piso contra o qual foi comparado. */
  readonly threshold_cents: number
  /**
   * Identidade lógica do fato, quando `matched`.
   *
   * Calculada mesmo sem Event: é o que permite correlacionar o mesmo fato entre
   * execuções quando a política de severidade for aprovada.
   */
  readonly event_id: string | null
  readonly emitted: boolean
  readonly not_emitted_reason?: LowTicketNotEmittedReason
}

export interface LowTicketSummary {
  readonly floor_cents: number
  readonly total_records: number
  readonly below_floor: number
  /**
   * Fatos detectados que NÃO viraram Event.
   *
   * Hoje é igual a `below_floor`: nenhum Event sai enquanto a severidade não for
   * política aprovada.
   */
  readonly facts_not_emitted: number
  readonly at_or_above_floor: number
  readonly ticket_unavailable: number
  readonly invalid_ticket: number
  readonly quality_status: Quality
}

export interface LowTicketResult {
  readonly events: readonly IntelligenceEvent[]
  /** TODOS os contratos avaliados. Nada descartado em silêncio. */
  readonly assessed: readonly TicketAssessment[]
  readonly summary: LowTicketSummary
}

// ─── Precondições ─────────────────────────────────────────────────────────────

interface EscopoGovernado {
  readonly source_system: string
  readonly dataset_id: string
}

/**
 * Lastro por CONTRATO, não por lote.
 *
 * Cada alerta fala de um contrato específico, então cada um precisa de evidência
 * sua: existir, pertencer ao snapshot declarado e localizar o dataset daquele
 * snapshot. Aceitar evidência de outro contrato faria o alerta de A carregar a
 * prova de B — o mesmo furo que os gates das Fases 2.4 e 2.5 encontraram.
 *
 * ─── Limitação declarada ──────────────────────────────────────────────────────
 *
 * `Evidence.locator` chega até `row_key`, e é isso que liga a evidência à LINHA.
 * O contrato de evidência **não** carrega `subject_ref`, então a associação
 * evidência↔pessoa não é verificável aqui — apenas evidência↔linha↔dataset. Não
 * afirmo propriedade que o contrato não sustenta. Registrado em
 * `FASE_2_6B_GOVERNED_CATALOG_AND_POLICY.md`.
 */
function assertPrecondicoes(input: LowTicketInput): Map<string, EscopoGovernado> {
  const problemas: string[] = []
  const snapshotPorId = new Map(input.snapshots.map((s) => [s.snapshot_id, s]))
  const evidencePorId = new Map(input.evidence.map((e) => [e.evidence_id, e]))
  const escopos = new Map<string, EscopoGovernado>()

  for (const c of input.contracts) {
    const onde = `contrato ${c.subject_ref}`

    if (!/^subj_[a-f0-9]{16}$/.test(c.subject_ref)) {
      problemas.push(`${onde}: subject_ref precisa ser pseudônimo estável`)
    }

    const snap = snapshotPorId.get(c.snapshot_id)
    if (snap === undefined) {
      problemas.push(`${onde}: snapshot inexistente no conjunto governado: ${c.snapshot_id}`)
      continue
    }

    if (c.evidence_refs.length === 0) {
      problemas.push(`${onde}: sem evidência — nenhum alerta individual sem lastro`)
    }
    for (const ref of c.evidence_refs) {
      const ev = evidencePorId.get(ref)
      if (ev === undefined) {
        problemas.push(`${onde}: evidência inexistente: ${ref}`)
        continue
      }
      if (ev.snapshot_id !== c.snapshot_id) {
        problemas.push(
          `${onde}: evidência ${ref} pertence ao snapshot ${ev.snapshot_id}, não a ${c.snapshot_id}`,
        )
        continue
      }
      if (ev.locator.dataset_id !== snap.dataset_id) {
        problemas.push(
          `${onde}: evidência ${ref} localiza o dataset "${ev.locator.dataset_id}" mas o snapshot é do dataset "${snap.dataset_id}"`,
        )
      }
    }

    escopos.set(c.snapshot_id, {
      source_system: snap.source_system,
      dataset_id: snap.dataset_id,
    })
  }

  if (problemas.length > 0) {
    throw new GatewayError("SCHEMA_INVALID", "Lastro insuficiente para alertar ticket baixo", problemas)
  }

  return escopos
}

// ─── Avaliação ────────────────────────────────────────────────────────────────

/**
 * O veredito de um contrato.
 *
 * ─── Por que ticket não positivo NÃO é "ticket baixo" ─────────────────────────
 *
 * Aritmeticamente `0 < 149_999`, então zero passaria pelo predicado. Mas o schema
 * `ceo` define `ticket_cents` como coluna gerada de `transfer_cents *
 * installments_grau`, com `transfer_cents >= 0` e `installments_grau > 0`:
 *
 *   negativo  → **impossível** no domínio governado. É corrupção de dado.
 *   zero      → representável, mas nenhuma regra governada diz que uma venda de
 *               valor zero é venda.
 *
 * Não existe lastro que autorize chamar qualquer dos dois de "contrato barato".
 * Um contrato de R$ 0,00 provavelmente é linha incompleta, e alertar "ticket
 * abaixo do piso" mandaria o time comercial olhar o preço quando o problema é de
 * ingestão.
 *
 * Então: `INVALID_TICKET`, contado, visível na qualidade, e **decisão pendente**.
 * Se o CEO decidir que ticket zero é alerta comercial, isso vira regra explícita.
 */
function avaliar(c: TicketRecord): {
  readonly ticket: Metric<number>
  readonly verdict: TicketVerdict
  readonly detail?: string
} {
  if (c.ticket_cents === null) {
    return {
      ticket: gap<number>("DATA_NOT_AVAILABLE", "observed", "ticket ausente na fonte"),
      verdict: "TICKET_UNAVAILABLE",
      detail: "ticket ausente: nunca tratado como zero",
    }
  }

  if (!Number.isSafeInteger(c.ticket_cents)) {
    // Float ou fora da faixa exata. Dinheiro é inteiro em centavos, sempre.
    return {
      ticket: gap<number>("DATA_NOT_AVAILABLE", "observed", "ticket fora da faixa inteira exata"),
      verdict: "INVALID_TICKET",
      detail: "ticket não é inteiro seguro em centavos",
    }
  }

  if (c.ticket_cents <= 0) {
    return {
      ticket: gap<number>(
        "BUSINESS_RULE_PENDING",
        "observed",
        "ticket não positivo: o domínio governado não define venda de valor zero ou negativo",
      ),
      verdict: "INVALID_TICKET",
      detail:
        "ticket <= 0 não é 'ticket baixo': o schema ceo admite zero mas nenhuma regra o " +
        "declara venda válida, e negativo é impossível. Decisão do CEO pendente.",
    }
  }

  return {
    ticket: observed(c.ticket_cents),
    verdict: isLowTicket(c.ticket_cents) ? "BELOW_FLOOR" : "AT_OR_ABOVE_FLOOR",
  }
}

// ─── Regra ────────────────────────────────────────────────────────────────────

export function detectLowTicketContracts(input: LowTicketInput): LowTicketResult {
  const escopos = assertPrecondicoes(input)

  const assessed: TicketAssessment[] = input.contracts.map((c) => {
    const { ticket, verdict, detail } = avaliar(c)
    const abaixo = verdict === "BELOW_FLOOR"
    return {
      subject_ref: c.subject_ref,
      ...(c.unit.status === "matched" ? { unit: c.unit.display_name } : {}),
      ticket_cents: ticket,
      verdict,
      ...(detail === undefined ? {} : { detail }),
      // CÓPIA. A referência do chamador não sobrevive no resultado congelado.
      evidence_refs: [...c.evidence_refs],
      matched: abaixo,
      threshold_cents: LOW_TICKET_FLOOR_CENTS,
      event_id: abaixo ? identidadeDoAlerta(input, escopoDoContrato(escopos, c), c.subject_ref) : null,
      emitted: abaixo,
      ...(abaixo
        ? {}
        : {
            not_emitted_reason:
              verdict === "TICKET_UNAVAILABLE"
                ? ("TICKET_UNAVAILABLE" as const)
                : verdict === "INVALID_TICKET"
                  ? ("INVALID_TICKET" as const)
                  : ("NOT_BELOW_FLOOR" as const),
          }),
    }
  })

  const quality = resolverQualidade(input, assessed)

  // Um Event por contrato abaixo do piso. Cada fato é individual: não há
  // agregação, então não há denominador que possa misturar datasets.
  // Pareamento por ÍNDICE: `assessed` foi construído com `map` sobre
  // `input.contracts`, então as posições correspondem. Procurar por
  // `subject_ref` abriria a porta para o contrato errado se o lote repetisse um.
  const events: readonly IntelligenceEvent[] = input.contracts.flatMap((c, i) => {
    const a = assessed[i]
    if (a === undefined || !a.matched) return []
    // Chamada mantida pelo efeito de guarda: contrato sem escopo governado
    // falha fechado antes de virar Event.
    escopoDoContrato(escopos, c)
    return [construirEvento(input, c.snapshot_id, a, quality)]
  })

  return deepFreeze({
    events,
    assessed,
    summary: {
      floor_cents: LOW_TICKET_FLOOR_CENTS,
      total_records: input.contracts.length,
      below_floor: assessed.filter((a) => a.matched).length,
      facts_not_emitted: assessed.filter((a) => a.matched && !a.emitted).length,
      at_or_above_floor: assessed.filter((a) => a.verdict === "AT_OR_ABOVE_FLOOR").length,
      ticket_unavailable: assessed.filter((a) => a.verdict === "TICKET_UNAVAILABLE").length,
      invalid_ticket: assessed.filter((a) => a.verdict === "INVALID_TICKET").length,
      quality_status: quality,
    },
  })
}

/**
 * Monta o Event executivo de um contrato abaixo do piso.
 *
 * ─── O que este Event afirma, e o que não afirma ──────────────────────────────
 *
 * Afirma exatamente uma coisa: o ticket deste contrato está abaixo do piso
 * comercial aprovado da Creditum. Não afirma fraude, erro, prejuízo,
 * inadimplência nem causalidade — nenhuma delas é observável a partir de um
 * valor de ticket, e nomear qualquer uma seria inferência sem lastro.
 *
 * Por isso a métrica publicada é `ticket_cents` com a fórmula do próprio
 * predicado. Não há `reference_metric`: um contrato individual não tem
 * denominador, e inventar um — ticket médio da unidade, por exemplo — mudaria o
 * significado do alerta sem que ninguém tivesse aprovado a mudança.
 *
 * A materialidade é `amount_cents` com o valor do próprio ticket. Não é
 * participação: participação exigiria um todo, e o fato é individual.
 */
function construirEvento(
  input: LowTicketInput,
  snapshot_id: string,
  a: TicketAssessment,
  quality: Quality,
): IntelligenceEvent {
  // Estreitado pelo chamador: só entra aqui contrato `matched`, e `matched`
  // implica ticket presente, positivo e abaixo do piso.
  const ticket = a.ticket_cents
  if (a.event_id === null || !isOk(ticket)) {
    throw new GatewayError("SCHEMA_INVALID", "Contrato abaixo do piso sem identidade ou ticket", [
      a.subject_ref,
    ])
  }

  const bruto: unknown = {
    event_id: a.event_id,
    event_type: EVENT_TYPE,
    detector_id: RULE_ID,
    detector_version: RULE_VERSION,
    // O snapshot DESTE contrato. O lote pode ser misto; o Event não é.
    snapshot_ids: [snapshot_id],
    period_start: input.period_start,
    period_end: input.period_end,
    detected_at: input.detected_at,
    severity: LOW_TICKET_SEVERITY,
    materiality: { basis: "amount_cents", amount_cents: ticket.value },
    observed_metric: {
      name: "ticket_cents",
      data_class: "observed" as const,
      unit: "cents",
      value: ticket.value,
      formula: FORMULA_LOW_TICKET,
    },
    contributing_cases: [
      {
        subject_ref: a.subject_ref,
        ...(a.unit === undefined ? {} : { unit: a.unit }),
        contribution: { amount_cents: ticket.value },
        evidence_refs: [...a.evidence_refs],
      },
    ],
    evidence_refs: [...a.evidence_refs],
    data_quality: { quality_status: quality },
  }

  return toEvent(bruto, { now: new Date(input.detected_at) })
}

/**
 * O escopo governado DESTE contrato.
 *
 * `assertPrecondicoes` já recusou contrato cujo snapshot não existe. Se chegou aqui
 * sem escopo, a garantia foi contornada: falha fechada, nunca escopo de outro.
 */
function escopoDoContrato(
  escopos: ReadonlyMap<string, EscopoGovernado>,
  c: TicketRecord,
): EscopoGovernado {
  const e = escopos.get(c.snapshot_id)
  if (e === undefined) {
    throw new GatewayError("SCHEMA_INVALID", "Contrato sem escopo governado", [
      `contrato ${c.subject_ref}: snapshot ${c.snapshot_id}`,
    ])
  }
  return e
}

/** A qualidade é a dependência RELEVANTE mais fraca. Lattice compartilhado. */
function resolverQualidade(
  input: LowTicketInput,
  assessed: readonly TicketAssessment[],
): Quality {
  const candidatas: Quality[] = ["ok"]

  for (const s of input.snapshots) {
    candidatas.push(s.quality_status)
    if (s.conflicts.length > 0) candidatas.push("conflicted")
    if (s.missing_fields.length > 0) candidatas.push("degraded")
    if (s.rows_skipped > 0) candidatas.push("degraded")
  }

  // Ticket ausente ou inválido não pode ser escondido: sem ele a regra não
  // decidiu nada sobre aquele contrato.
  if (assessed.some((a) => a.verdict === "TICKET_UNAVAILABLE")) candidatas.push("degraded")
  if (assessed.some((a) => a.verdict === "INVALID_TICKET")) candidatas.push("degraded")

  for (const c of input.contracts) {
    if (c.unit.status === "unknown") candidatas.push("degraded")
    else if (c.unit.status === "ambiguous") candidatas.push("conflicted")
  }

  return piorQualidade(candidatas)
}

/**
 * Identidade lógica do alerta.
 *
 * Composta pelo FATO governado: tipo da regra, dataset lógico, sujeito, período e
 * versão da regra. `snapshot_id` fica FORA — reingerir o mesmo dataset lógico não
 * cria um alerta novo, princípio herdado de B/C/D.
 *
 * `rule_version` entra porque mudar a regra observável muda o fato: um alerta sob
 * piso diferente é outro alerta.
 *
 * Estruturada, nunca por gramática de delimitador.
 */
function identidadeDoAlerta(
  input: LowTicketInput,
  escopo: EscopoGovernado,
  subject_ref: string,
): string {
  return structuralId(
    "creditum:low_ticket_contract:v1",
    {
      event_type: EVENT_TYPE,
      rule_id: RULE_ID,
      rule_version: RULE_VERSION,
      floor_cents: LOW_TICKET_FLOOR_CENTS,
      period_start: input.period_start,
      period_end: input.period_end,
      subject_ref,
      // O dataset LÓGICO deste contrato, e só dele. `snapshot_id` fica fora:
      // reingerir o mesmo dataset lógico não cria fato novo.
      logical_dataset: {
        source_system: escopo.source_system,
        dataset_id: escopo.dataset_id,
      },
    },
    "evt",
  )
}

/**
 * ─── Por que NENHUM Event executivo é emitido hoje ─────────────────────────────
 *
 * O contrato do evento exige `severity` obrigatória, e não existe política
 * aprovada de severidade para `low_ticket_contract`. A versão anterior desta regra
 * usava `info` fixo — e `info` não foi aprovado: foi escolhido por mim.
 *
 * Um grau escolhido por engenheiro vira política da Creditum no dia em que alguém
 * o encontra no código e assume que passou por aprovação. É o mesmo erro dos
 * thresholds da Fase 2.1, e a resposta é a mesma: recusar em vez de preencher.
 *
 * Então: o FATO é detectado, contado, auditável e com identidade lógica calculada.
 * O Event fica bloqueado com motivo tipado. Nenhum fallback para `info`, `low`,
 * zero, nem severidade de outro detector.
 *
 * Quando a política existir, a única mudança é passar a emitir — o fato já está
 * modelado.
 */
