/**
 * Detector C — concentração de primeira data de vencimento.
 *
 * Mede a DISTRIBUIÇÃO OBSERVADA das primeiras datas de vencimento e aponta o
 * alvo mais concentrado.
 *
 * ─── O que este detector NÃO faz ──────────────────────────────────────────────
 *
 * Não mede inadimplência futura. Não estima probabilidade de atraso. Não afirma
 * que uma data causará default, nem que os contratos daquele dia vão deixar de
 * pagar. Não produz `forecast`, `confidence_bp` nem faixa projetada.
 *
 * A distinção não é retórica. "Nove contratos vencem em 04/09, 75% da carteira
 * elegível" é verificável por contagem — qualquer pessoa reconta e confere.
 * "Esses contratos têm 12% de chance de atrasar" é um modelo, e não existe modelo
 * governado na Creditum. A fixture original do Caso C trazia uma
 * `inadimplencia_projetada_primeira_parcela`; era lacuna, então nenhum número
 * falso saiu, mas o nome afirmava uma projeção que o detector não sustenta.
 *
 * Concentração de vencimento é um fato de CAIXA e de OPERAÇÃO: no dia 04/09 a
 * régua de cobrança recebe nove contratos em vez de dois. Isso já é acionável sem
 * nenhuma previsão.
 *
 * ─── Quatro grandezas que não se substituem ───────────────────────────────────
 *
 *   contract_count      contratos vencendo no alvo                  (QUANTIDADE)
 *   share_count_bp      contratos no alvo ÷ elegíveis               (PARTE, qtd)
 *   amount_cents        valor exposto no alvo                       (VALOR)
 *   share_amount_bp     valor no alvo ÷ valor elegível              (PARTE, valor)
 *
 * Muitos contratos pequenos e poucos contratos grandes produzem leituras opostas
 * nas participações. Qual governa a severidade é decisão de configuração.
 *
 * Função pura: sem rede, disco, env, relógio implícito, aleatoriedade ou mutação.
 * Só `observed`, `calculated` e `gap` — nenhuma inferência, nenhuma previsão.
 */

import { GatewayError } from "../../gateway/src/errors"
import { toEvent } from "../../gateway/src/factory"
import { deepFreeze } from "../../gateway/src/immutability"
import type { Evidence, IntelligenceEvent, Snapshot } from "../../gateway/src/types"
import type { CanonicalUnitResult } from "./canonical-units"
import type { DetectorConfig, DueWindow, FirstDueSeverityDimension, Severity } from "./config"
import { indexCounterfactualProvenance } from "./counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "./counterfactual-provenance"
import { calendarMonthWindow, isWithinWindow, nextNDaysWindow } from "./dates"
import type { BusinessDate, DateWindow } from "./dates"
import { parseCivilDateStrict } from "./civil-date"
import { gap, isOk, observed, ratio, sumCents } from "./engine"
import type { Metric } from "./engine"
import { isPartOfWhole } from "./part-of-whole"
import { piorQualidade } from "./quality"
import type { Quality } from "./quality"
import { classifySeverity } from "./severity"
import { maxAvailableParticipation, participationGap } from "./participation-severity"
import { compareCodeUnits, structuralId } from "./structural-id"

export const DETECTOR_ID = "det.first_due_concentration"
/** SemVer. Muda quando a regra observável muda — nunca data nem hash. */
export const DETECTOR_VERSION = "1.0.0"

const EVENT_TYPE = "first_due_date_concentration"

// ─── Entrada ──────────────────────────────────────────────────────────────────

export interface DueContractRecord {
  /** Pseudônimo estável. NUNCA nome, CPF, telefone ou e-mail. */
  readonly subject_ref: string
  /** Já canonicalizada por D13. O detector não executa heurística própria. */
  readonly unit: CanonicalUnitResult
  /**
   * Primeira data de vencimento, como veio da fonte governada.
   *
   * `unknown` de propósito: `04/08/2026` e `2026-08-04` são a mesma data e as
   * duas formas existem na planilha real. A canonicalização é do detector, via
   * `parseCivilDateStrict` — casamento total, calendário real, sem
   * `new Date(string)` e sem timestamp.
   * Ausente = `null`, e ausência nunca vira hoje nem fim do mês.
   */
  readonly first_due_date_raw: unknown
  readonly amount_cents: number | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
}

export interface UnitCoverage {
  readonly expected_units: number
  readonly reporting_units: number
  readonly ratio_bp: number
}

export interface FirstDueDetectorInput {
  readonly detected_at: string
  readonly period_start: string
  readonly period_end: string
  readonly contracts: readonly DueContractRecord[]
  /** Conjunto governado que sustenta os refs. Não é o store inteiro. */
  readonly snapshots: readonly Snapshot[]
  readonly evidence: readonly Evidence[]
  /** Evidência `computed`/`aggregate` que sustenta os agregados. Obrigatória. */
  readonly aggregate_evidence_ref: string
  /**
   * Âncora GOVERNADA `evidence_ref → computation_id`.
   *
   * Mesmo contrato do Detector D, e pelo mesmo motivo: snapshot e dataset
   * corretos NÃO provam que a evidência foi calculada para ESTE alvo. Uma
   * evidência que agrega `2026-08-04` sustentava um evento cujo alvo era
   * `2026-08-05` — os dois vivem no mesmo dataset. Ver
   * `counterfactual-provenance.ts`.
   */
  readonly aggregate_provenance: readonly ComputedEvidenceProvenance[]
  /**
   * Data de referência das janelas relativas. EXPLÍCITA.
   *
   * Obrigatória para `calendar_month` e `next_n_days`; ignorada em `same_day`.
   * Sem ela, `Date.now` faria o mesmo dado produzir eventos diferentes conforme
   * a hora da execução — e o `event_id` deixaria de ser estável.
   */
  readonly reference_date?: BusinessDate
  readonly unit_coverage?: UnitCoverage
}

// ─── Saída ────────────────────────────────────────────────────────────────────

/** Por que um contrato saiu do denominador. Nenhum vira hoje, zero ou fim do mês. */
export type DueExclusionReason = "MISSING_DUE_DATE" | "INVALID_DUE_DATE"

export interface DuePopulation {
  readonly total_records: number
  readonly eligible_contracts: number
  readonly excluded: Readonly<Record<DueExclusionReason, number>>
  /** Elegíveis ÷ total, em basis points. Dimensão distinta da cobertura de unidades. */
  readonly eligibility_ratio_bp: Metric<number>
}

/** Um dia canônico e o que vence nele. */
export interface DueBucket {
  readonly date: BusinessDate
  readonly contract_count: number
  readonly share_count_bp: Metric<number>
  readonly amount_cents: Metric<number>
  readonly share_amount_bp: Metric<number>
  readonly subject_refs: readonly string[]
  readonly evidence_refs: readonly string[]
}

/** O alvo de concentração — um dia ou uma janela de dias. */
export interface ConcentrationTarget
  extends Omit<DueBucket, "date"> {
  readonly window: DateWindow
  /** Os dias canônicos que o alvo cobre. Vazio quando nada vence na janela. */
  readonly dates: readonly BusinessDate[]
}

export type NotEmittedReason =
  | "NOT_MATERIAL"
  | "SEVERITY_DIMENSION_UNAVAILABLE"
  | "DATA_NOT_AVAILABLE"
  | "EMPTY_DENOMINATOR"
  | "INSUFFICIENT_SAMPLE"

export interface FirstDueSummary {
  readonly event_id: string
  readonly population: DuePopulation
  /** Todos os dias com vencimento, em ordem canônica. Nada descartado. */
  readonly buckets: readonly DueBucket[]
  /** O alvo escolhido pela janela configurada. `null` sem elegíveis. */
  readonly target: ConcentrationTarget | null
  /**
   * Como o empate foi resolvido, quando houve. Regra TÉCNICA de determinismo,
   * não política de materialidade.
   */
  readonly tie_break?: string
  readonly severity: Severity | null
  readonly severity_dimension: FirstDueSeverityDimension
  readonly severity_gap?: string
  readonly quality_status: Quality
  readonly material: boolean
  /**
   * QUAIS critérios cruzaram o limiar. Vazio quando não material.
   *
   * Vive no resultado auditável, não no Event — o contrato do evento resume a
   * materialidade numa base só, e resumo não é motivo para perder o registro de
   * quais razões decidiram a emissão.
   */
  readonly satisfied_dimensions: readonly MaterialityDimension[]
  readonly non_material_reason?: string
  readonly emitted: boolean
  readonly not_emitted_reason?: NotEmittedReason
}

export interface FirstDueResult {
  readonly event: IntelligenceEvent | null
  readonly summary: FirstDueSummary
}

// ─── Fórmulas ─────────────────────────────────────────────────────────────────
//
// Descrevem a operação executada, e nada além. Sem linguagem causal ou futura.

const FORMULA_SHARE_COUNT =
  "count(elegiveis where first_due_date in target) / count(elegiveis)"
const FORMULA_COUNT = "count(elegiveis where first_due_date in target)"
const FORMULA_AMOUNT = "sum(amount_cents where first_due_date in target)"
const FORMULA_SHARE_AMOUNT =
  "sum(amount_cents where first_due_date in target) / sum(amount_cents elegiveis)"
const FORMULA_ELIGIBILITY = "count(elegiveis) / count(registros)"

// ─── Precondições ─────────────────────────────────────────────────────────────

interface EscopoGovernado {
  readonly source_system: string
  readonly dataset_id: string
}

function assertPrecondicoes(
  input: FirstDueDetectorInput,
  janela: DueWindow,
): Map<string, EscopoGovernado> {
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
      problemas.push(`${onde}: sem evidência — nenhum número individual sem lastro`)
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

  conferirEvidenciaAgregada(input.aggregate_evidence_ref, evidencePorId, escopos, problemas)

  // Janela relativa sem referência explícita é recusa, não `Date.now`.
  if (janela.mode !== "same_day" && input.reference_date === undefined) {
    problemas.push(
      "janela: reference_date obrigatória para janelas relativas — o relógio do processo não é entrada governada",
    )
  }

  if (problemas.length > 0) {
    throw new GatewayError(
      "SCHEMA_INVALID",
      "Lastro insuficiente para medir concentração de vencimento",
      problemas,
    )
  }

  return escopos
}

function conferirEvidenciaAgregada(
  ref: string,
  evidencePorId: ReadonlyMap<string, Evidence>,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  problemas: string[],
): void {
  const ev = evidencePorId.get(ref)
  if (ev === undefined) {
    problemas.push(`agregados: evidência inexistente: ${ref}`)
    return
  }
  if (ev.kind !== "computed" && ev.kind !== "aggregate") {
    problemas.push(
      `agregados: evidência ${ref} é do tipo "${ev.kind}"; agregado exige computed ou aggregate`,
    )
    return
  }
  if (ev.kind === "computed" && ev.formula === undefined) {
    problemas.push(`agregados: evidência computed sem fórmula`)
    return
  }

  const alvos = [...escopos.entries()]
  if (alvos.length > 1) {
    // FALHA FECHADA, e não escolha arbitrária — mesma lição de A e D.
    //
    // `Evidence.locator` carrega UM `dataset_id`. Um agregado que atravessa dois
    // datasets não é sustentado por uma evidência que aponta para um deles.
    //
    // LIMITAÇÃO REGISTRADA: agregação multi-dataset exige contrato de evidência
    // com escopo composto. Decisão de arquitetura pendente.
    const legivel = alvos
      .map(([snap, e]) => `${snap}/${e.dataset_id}`)
      .sort(compareCodeUnits)
      .join(", ")
    problemas.push(
      `agregados: os contratos cobrem ${alvos.length} escopos governados (${legivel}), ` +
        `mas o localizador de evidência expressa um único dataset_id. Falha fechada.`,
    )
    return
  }

  const [unico] = alvos
  if (unico === undefined) return // sem contratos: nenhum agregado é afirmado

  const [snapshotDaAgregacao, escopo] = unico
  if (ev.snapshot_id !== snapshotDaAgregacao) {
    problemas.push(
      `agregados: evidência ${ref} pertence ao snapshot ${ev.snapshot_id}, mas o agregado é do snapshot ${snapshotDaAgregacao}`,
    )
  }
  if (ev.locator.dataset_id !== escopo.dataset_id) {
    problemas.push(
      `agregados: evidência ${ref} localiza o dataset "${ev.locator.dataset_id}", mas o agregado é do dataset "${escopo.dataset_id}"`,
    )
  }
}

// ─── População ────────────────────────────────────────────────────────────────

interface Elegivel {
  readonly contrato: DueContractRecord
  readonly date: BusinessDate
}

interface Particao {
  readonly elegiveis: readonly Elegivel[]
  readonly population: DuePopulation
}

/**
 * Canonicaliza e particiona.
 *
 * `parseCivilDateStrict` exige a representação INTEIRA e valida o calendário de
 * verdade: `31/02/2026` é inválido, não `03/03`, e `2026-08-04T23:30:00-03:00` é
 * um instante, não um dia civil — recusado, porque aceitar o prefixo escolheria
 * um fuso em silêncio. Ver `civil-date.ts`.
 *
 * Data ausente e data inválida são exclusões DIFERENTES — a primeira é dado que
 * não veio, a segunda é dado que veio errado, e confundi-las esconderia um
 * problema de ingestão atrás de um problema de cobertura.
 */
function particionar(input: FirstDueDetectorInput): Particao {
  const elegiveis: Elegivel[] = []
  let ausente = 0
  let invalida = 0

  for (const c of input.contracts) {
    if (c.first_due_date_raw === null || c.first_due_date_raw === undefined) {
      ausente += 1
      continue
    }
    const canonica = parseCivilDateStrict(c.first_due_date_raw)
    if (canonica === null) {
      // NUNCA corrigir heuristicamente. Sem "provavelmente era isto".
      invalida += 1
      continue
    }
    elegiveis.push({ contrato: c, date: canonica })
  }

  const total = input.contracts.length
  const eligibilityRatio =
    total === 0
      ? gap<number>("EMPTY_DENOMINATOR", "calculated", "nenhum registro para avaliar")
      : toBp(ratio(observed(elegiveis.length), observed(total), FORMULA_ELIGIBILITY))

  return {
    elegiveis,
    population: {
      total_records: total,
      eligible_contracts: elegiveis.length,
      excluded: { MISSING_DUE_DATE: ausente, INVALID_DUE_DATE: invalida },
      eligibility_ratio_bp: eligibilityRatio,
    },
  }
}

function toBp(m: Metric<{ bps: number }>): Metric<number> {
  return isOk(m) ? observed(m.value.bps) : m
}

/** Soma exata; ausência em QUALQUER parcela torna o total lacuna, não zero. */
function somarValores(itens: readonly Elegivel[], detalhe: string): Metric<number> {
  if (itens.some((i) => i.contrato.amount_cents === null)) {
    return gap<number>("DATA_NOT_AVAILABLE", "calculated", detalhe)
  }
  const total = sumCents(itens.map((i) => i.contrato.amount_cents ?? 0))
  return total === null
    ? gap<number>("DATA_NOT_AVAILABLE", "calculated", "soma fora da faixa exata")
    : observed(total)
}

// ─── Buckets ──────────────────────────────────────────────────────────────────

/**
 * Um bucket por dia canônico, em ordem de data.
 *
 * A ordenação é por unidade de código sobre ISO normalizado — `localeCompare`
 * dependeria do locale do runtime e tornaria a saída dependente da máquina.
 */
function agrupar(p: Particao): DueBucket[] {
  const porData = new Map<BusinessDate, Elegivel[]>()
  for (const e of p.elegiveis) {
    const lista = porData.get(e.date) ?? []
    lista.push(e)
    porData.set(e.date, lista)
  }

  const totalElegivel = somarValores(p.elegiveis, "valor ausente em ao menos um elegível")

  return [...porData.entries()]
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(([date, itens]) => ({ date, ...medir(itens, p, totalElegivel) }))
}

/** As quatro grandezas de um conjunto de elegíveis. */
function medir(
  itens: readonly Elegivel[],
  p: Particao,
  totalElegivel: Metric<number>,
): Omit<DueBucket, "date"> {
  const shareCount =
    p.elegiveis.length === 0
      ? gap<number>("EMPTY_DENOMINATOR", "calculated", "nenhum contrato elegível")
      : toBp(ratio(observed(itens.length), observed(p.elegiveis.length), FORMULA_SHARE_COUNT))

  const valor = somarValores(itens, "valor ausente em ao menos um contrato do alvo")

  return {
    contract_count: itens.length,
    share_count_bp: shareCount,
    amount_cents: valor,
    share_amount_bp: participacaoEmValor(valor, totalElegivel),
    subject_refs: itens.map((i) => i.contrato.subject_ref).sort(compareCodeUnits),
    evidence_refs: [...new Set(itens.flatMap((i) => [...i.contrato.evidence_refs]))].sort(
      compareCodeUnits,
    ),
  }
}

/**
 * Participação em VALOR — quando ela existe.
 *
 * Estorno é dado legítimo e quebra parte-do-todo: um alvo com valor líquido
 * negativo, ou maior que o total elegível, não tem participação. `isPartOfWhole`
 * é a mesma regra que os Detectores A e D usam.
 *
 * Não clampar: 10000 bp num alvo que vale três vezes o total seria um número
 * inventado. Omitida a participação, o valor absoluto continua exato.
 */
function participacaoEmValor(alvo: Metric<number>, total: Metric<number>): Metric<number> {
  if (!isOk(alvo) || !isOk(total)) {
    return gap<number>("DATA_NOT_AVAILABLE", "calculated", "volume indisponível")
  }
  if (total.value === 0) {
    return gap<number>("EMPTY_DENOMINATOR", "calculated", "volume elegível zero")
  }
  if (!isPartOfWhole(alvo.value, total.value)) {
    return gap<number>(
      "BUSINESS_RULE_PENDING",
      "calculated",
      "volume com sinal misto (estorno): participação em valor exige regra do CEO",
    )
  }
  return toBp(ratio(observed(alvo.value), observed(total.value), FORMULA_SHARE_AMOUNT))
}

// ─── Alvo de concentração ─────────────────────────────────────────────────────

interface AlvoEscolhido {
  readonly target: ConcentrationTarget
  readonly tie_break?: string
}

/**
 * Escolhe o alvo de forma determinística.
 *
 * Para `same_day`, compara os dias entre si. Para janelas relativas, o alvo é a
 * janela inteira — não há o que comparar, então não há empate.
 *
 * ─── O desempate é técnico, não política ──────────────────────────────────────
 *
 * Empate de concentração é comum: duas datas com o mesmo número de contratos.
 * Alguma regra precisa existir, senão a saída dependeria da ordem de entrada e o
 * `event_id` mudaria a cada execução com os mesmos dados.
 *
 * A ordem usada é: maior participação em quantidade → maior valor absoluto → data
 * canônica ascendente. A última é pura convenção de determinismo. NENHUMA delas é
 * política de materialidade da Creditum: qual data "merece atenção primeiro"
 * quando duas empatam é decisão do CEO, e o campo `tie_break` registra que a
 * escolha foi mecânica.
 */
function escolherAlvo(
  buckets: readonly DueBucket[],
  p: Particao,
  janela: DueWindow,
  referencia: BusinessDate | undefined,
): AlvoEscolhido | null {
  if (p.elegiveis.length === 0) return null

  if (janela.mode !== "same_day") {
    const window =
      janela.mode === "calendar_month"
        ? calendarMonthWindow(exigirReferencia(referencia), janela.months_ahead)
        : nextNDaysWindow(exigirReferencia(referencia), janela.days)

    const dentro = p.elegiveis.filter((e) => isWithinWindow(e.date, window))
    const totalElegivel = somarValores(p.elegiveis, "valor ausente em ao menos um elegível")
    return {
      target: {
        window,
        dates: [...new Set(dentro.map((e) => e.date))].sort(compareCodeUnits),
        ...medir(dentro, p, totalElegivel),
      },
    }
  }

  const ordenados = [...buckets].sort(compararConcentracao)

  const vencedor = ordenados[0]
  if (vencedor === undefined) return null

  const empatados = ordenados.filter(
    (b) =>
      b.contract_count === vencedor.contract_count &&
      valorComparavel(b) === valorComparavel(vencedor),
  )

  const { date, ...resto } = vencedor
  return {
    target: { window: { start: date, end: date }, dates: [date], ...resto },
    ...(empatados.length > 1
      ? {
          tie_break:
            `${empatados.length} datas empatadas em contagem e valor; ` +
            `escolhida a data canônica mais antiga (${date}). ` +
            `Regra técnica de determinismo, não política de materialidade.`,
        }
      : {}),
  }
}

/**
 * Ordem de concentração — TOTAL, nunca dependente da ordem de entrada.
 *
 * Exportada porque a garantia precisa ser testável diretamente. Os buckets
 * chegam ordenados por data e `Array.prototype.sort` é estável no V8, então a
 * data mais antiga venceria um empate mesmo sem a última comparação — por
 * acidente do runtime, não por regra. Um comparador exportado permite provar a
 * ordem contra entrada embaralhada, sem depender de detalhe de implementação do
 * motor JS.
 *
 * A ordem é: maior participação em quantidade → maior valor absoluto → data
 * canônica ascendente. As três são regras TÉCNICAS de determinismo. Nenhuma é
 * política de materialidade: qual data merece atenção primeiro quando duas
 * empatam é decisão do CEO.
 */
export function compararConcentracao(a: DueBucket, b: DueBucket): number {
  const sa = isOk(a.share_count_bp) ? a.share_count_bp.value : -1
  const sb = isOk(b.share_count_bp) ? b.share_count_bp.value : -1
  if (sa !== sb) return sb - sa
  const va = isOk(a.amount_cents) ? a.amount_cents.value : Number.NEGATIVE_INFINITY
  const vb = isOk(b.amount_cents) ? b.amount_cents.value : Number.NEGATIVE_INFINITY
  if (va !== vb) return vb - va
  return compareCodeUnits(a.date, b.date)
}

function valorComparavel(b: DueBucket): number | null {
  return isOk(b.amount_cents) ? b.amount_cents.value : null
}

function exigirReferencia(referencia: BusinessDate | undefined): BusinessDate {
  if (referencia === undefined) {
    // `assertPrecondicoes` já recusou. Se chegou aqui, a garantia foi
    // contornada: falha fechada, nunca `?? hoje`.
    throw new GatewayError("SCHEMA_INVALID", "Janela relativa sem reference_date", [
      "reference_date",
    ])
  }
  return referencia
}

/**
 * O que a evidência agregada precisa sustentar. Conjunto FECHADO.
 *
 * As RAZÕES entram como claims próprias, não como consequência dos numeradores.
 * A versão anterior tinha só `contract_count` e `amount_cents`, e o gate mostrou
 * o furo: uma evidência que declarava contagem e valor absoluto sustentava um
 * evento cuja SEVERIDADE vinha de `share_amount_bp`. Evidência do numerador não
 * prova a razão derivada — ela não conhece o denominador, que é a população
 * elegível daquele período e escopo. Quem calculou `900.000` não afirmou, por
 * isso, que `900.000 ÷ 1.200.000 = 7500 bp`.
 */
export type FirstDueClaim =
  | "contract_count"
  | "share_count_bp"
  | "amount_cents"
  | "share_amount_bp"

/**
 * Identidade determinística da COMPUTAÇÃO do alvo.
 *
 * Derivada do alvo que o detector REALMENTE calculou — nunca de string livre do
 * chamador, nunca de texto de fórmula. `evidence_ref` fica fora de propósito: a
 * identidade é da computação, não do registro que a documenta, então reingerir o
 * mesmo dataset lógico preserva a identidade.
 *
 * Estruturada, sem gramática de delimitador.
 */
export function firstDueComputationId(entrada: {
  readonly grouping_dimension: "first_due_date"
  readonly window_mode: DueWindow["mode"]
  readonly reference_date: BusinessDate | null
  readonly target_start: BusinessDate
  readonly target_end: BusinessDate
  readonly period_start: string
  readonly period_end: string
  readonly scope: readonly EscopoGovernado[]
  readonly claim_set: readonly FirstDueClaim[]
}): string {
  return structuralId(
    "creditum:first_due_date_concentration:aggregate:v1",
    {
      detector: DETECTOR_ID,
      grouping_dimension: entrada.grouping_dimension,
      window_mode: entrada.window_mode,
      reference_date: entrada.reference_date,
      target_start: entrada.target_start,
      target_end: entrada.target_end,
      period_start: entrada.period_start,
      period_end: entrada.period_end,
      scope: [...entrada.scope]
        .map((e) => ({ source_system: e.source_system, dataset_id: e.dataset_id }))
        .sort(
          (a, b) =>
            compareCodeUnits(a.source_system, b.source_system) ||
            compareCodeUnits(a.dataset_id, b.dataset_id),
        ),
      // Dedup + ordem estável: `claim_set` é um CONJUNTO, e a ordem em que o
      // chamador o escreveu não é parte do fato.
      claim_set: [...new Set(entrada.claim_set)].sort(compareCodeUnits),
    },
    "cfc",
  )
}

/**
 * O que o evento vai DE FATO afirmar. Derivado, nunca constante.
 *
 * A regra é publicação/uso, não possibilidade: uma métrica que o detector tentou
 * calcular e obteve lacuna não é reivindicada, porque o evento não a afirma.
 *
 *   contract_count      sempre — `observed_metric` e `materiality.count`
 *   share_count_bp      quando existe: vai em `materiality.share_of_total_bp`
 *   amount_cents        quando existe: vai em `materiality.amount_cents`
 *   severity_dimension  SEMPRE — a razão que graduou o evento é afirmada por ele
 *   satisfied_dimensions TODAS — as razões que fizeram o evento EXISTIR
 *
 * A última é a que o gate cobrou. Uma métrica pode não ser publicada nem governar
 * severidade e ainda assim ser decisiva: com severidade por contagem e limiares
 * arranjados de modo que só `share_amount_bp` cruze, é ELA que faz o evento
 * existir. Sem prova dela, o evento existe por um número não provado.
 *
 * A dimensão de severidade entra ainda que o numerador correspondente já esteja
 * na lista. `amount_cents` presente não dispensa `share_amount_bp`: são duas
 * afirmações, e a segunda depende de um denominador que a primeira não conhece.
 *
 * O inverso também vale: uma métrica meramente CALCULÁVEL, que não é publicada,
 * não gradua e não cruzou limiar, NÃO entra. `claim_set` é o que o evento afirma,
 * não o superset do que era possível calcular.
 */
function claimsDoAlvo(
  t: ConcentrationTarget,
  severityDimension: FirstDueSeverityDimension,
  avaliacao: MaterialityEvaluation,
): FirstDueClaim[] {
  const claims = new Set<FirstDueClaim>(["contract_count"])
  if (isOk(t.share_count_bp)) claims.add("share_count_bp")
  if (isOk(t.amount_cents)) claims.add("amount_cents")
  claims.add(severityDimension)
  for (const d of avaliacao.satisfied_dimensions) claims.add(CLAIM_DA_DIMENSAO[d])
  return [...claims].sort(compareCodeUnits)
}

/**
 * A evidência agregada sustenta ESTE alvo?
 *
 * A comparação abaixo é a única que usa um dado que o chamador não escreveu. Tudo
 * o mais — kind, fórmula, snapshot, dataset — confere o formato e a localização,
 * e nada disso distingue `2026-08-04` de `2026-08-05` no mesmo dataset.
 */
function conferirProvenanceDoAlvo(
  input: FirstDueDetectorInput,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  janela: DueWindow,
  t: ConcentrationTarget,
  severityDimension: FirstDueSeverityDimension,
  avaliacao: MaterialityEvaluation,
): void {
  const ancora = indexCounterfactualProvenance(input.aggregate_provenance)
  const esperada = firstDueComputationId({
    grouping_dimension: "first_due_date",
    window_mode: janela.mode,
    reference_date: janela.mode === "same_day" ? null : (input.reference_date ?? null),
    target_start: t.window.start,
    target_end: t.window.end,
    period_start: input.period_start,
    period_end: input.period_end,
    scope: [...escopos.values()],
    claim_set: claimsDoAlvo(t, severityDimension, avaliacao),
  })

  const ancorada = ancora.get(input.aggregate_evidence_ref)
  if (ancorada === undefined) {
    throw new GatewayError("SCHEMA_INVALID", "Agregado sem provenance governada", [
      `agregados: evidência ${input.aggregate_evidence_ref} sem provenance — ` +
        `snapshot e dataset corretos não provam que ela foi calculada para este alvo`,
    ])
  }
  if (ancorada !== esperada) {
    throw new GatewayError("SCHEMA_INVALID", "Provenance não corresponde ao alvo calculado", [
      `agregados: a evidência ${input.aggregate_evidence_ref} documenta a computação ${ancorada}, ` +
        `mas o alvo calculado (${t.window.start}..${t.window.end}, ` +
        `claims: ${claimsDoAlvo(t, severityDimension, avaliacao).join("+")}) ` +
        `é ${esperada}`,
    ])
  }
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export function detectFirstDueDateConcentration(
  input: FirstDueDetectorInput,
  config: DetectorConfig,
): FirstDueResult {
  const cfg = config.firstDueConcentration

  // A janela é parâmetro de EXECUÇÃO e não tem padrão. A Política Creditum v1
  // aprova duas janelas executivas e não elege nenhuma: escolher aqui — a
  // primeira da lista, a que dispensa `reference_date`, a mais barata — faria o
  // detector decidir qual análise a Creditum executa. Recusa é a única saída
  // honesta. `buildFirstDueExecutionConfig` monta a configuração com a janela.
  const janela = cfg.window
  if (janela === undefined) {
    throw new GatewayError(
      "NOT_ALLOWED",
      "Detector C exige janela de execução explícita",
      [
        "firstDueConcentration.window: ausente — a política aprova mais de uma " +
          "janela executiva e nenhuma é padrão. Use buildFirstDueExecutionConfig.",
      ],
    )
  }

  const escopos = assertPrecondicoes(input, janela)

  const particao = particionar(input)
  const buckets = agrupar(particao)
  const escolhido = escolherAlvo(buckets, particao, janela, input.reference_date)
  const target = escolhido?.target ?? null

  const quality = resolverQualidade(input, particao, target, config)

  // ── Severidade ─────────────────────────────────────────────────────────────
  //
  // Sobre a dimensão que a CONFIGURAÇÃO escolheu. Se ela é lacuna,
  // `classifySeverity` NÃO é chamada: nem 0, nem `info`, nem o valor da outra
  // dimensão. Participação inexistente não tem grau.
  // Fase 2.7b: mesma estratégia do Detector A — a MAIOR participação governada
  // válida gradua, e `severity_dimension` é o desempate. Materialidade não muda:
  // um fato pode ser material por dimensão ABSOLUTA e ainda assim graduar pela
  // participação relativa mais forte. São perguntas diferentes.
  const base =
    target === null
      ? null
      : cfg.severity_strategy === "max_available_participation"
        ? maxAvailableParticipation(
            target.share_count_bp,
            target.share_amount_bp,
            cfg.severity_dimension,
          )
        : (() => {
            const d =
              cfg.severity_dimension === "share_count_bp"
                ? target.share_count_bp
                : target.share_amount_bp
            return isOk(d) ? { dimension: cfg.severity_dimension, value: d.value } : null
          })()

  const dimensaoDaSeveridade = base?.dimension ?? cfg.severity_dimension
  const graduavel = base !== null && escalaCobre(cfg, base.value)
  const severity = graduavel && base !== null ? classifySeverity(cfg.severity_scale, base.value) : null
  const severityGap = graduavel
    ? undefined
    : target === null
      ? `${dimensaoDaSeveridade}: sem alvo`
      : base !== null
        ? `${dimensaoDaSeveridade}: ${base.value} bp fora do domínio da escala configurada`
        : participationGap(target.share_count_bp, target.share_amount_bp)

  const naoMaterial = motivoNaoMaterial(particao, target, cfg.minimum_sample_size)
  const avaliacao: MaterialityEvaluation =
    target === null
      ? { material: false, satisfied_dimensions: [] }
      : avaliarMaterialidade(target, cfg)
  const material = naoMaterial === undefined && avaliacao.material

  const emitted = material && severity !== null
  const notEmitted: NotEmittedReason | undefined = emitted
    ? undefined
    : particao.elegiveis.length === 0
      ? "EMPTY_DENOMINATOR"
      : material
        ? "SEVERITY_DIMENSION_UNAVAILABLE"
        : naoMaterial === MOTIVO_AMOSTRA
          ? "INSUFFICIENT_SAMPLE"
          : "NOT_MATERIAL"

  const summary: FirstDueSummary = {
    event_id: identidadeDoEvento(input, escopos, janela, target),
    population: particao.population,
    buckets,
    target,
    ...(escolhido?.tie_break === undefined ? {} : { tie_break: escolhido.tie_break }),
    severity,
    severity_dimension: dimensaoDaSeveridade,
    ...(severityGap === undefined ? {} : { severity_gap: severityGap }),
    quality_status: quality,
    material,
    satisfied_dimensions: avaliacao.satisfied_dimensions,
    ...(material ? {} : { non_material_reason: naoMaterial ?? "abaixo de todos os limiares configurados" }),
    emitted,
    ...(notEmitted === undefined ? {} : { not_emitted_reason: notEmitted }),
  }

  // BUILD → VALIDATE → FREEZE → RETURN. `toEvent` valida e devolve a MESMA
  // referência, então o grafo congelado é o grafo validado.
  // Só quando o evento vai sair: a provenance prova o ALVO, e sem alvo material
  // não há alvo a provar. Falha fechada — nunca evento com prova de outro dia.
  if (emitted && target !== null) {
    conferirProvenanceDoAlvo(input, escopos, janela, target, dimensaoDaSeveridade, avaliacao)
  }

  const event =
    emitted && severity !== null && target !== null
      ? construirEvento(input, escopos, summary, target, severity, quality)
      : null

  return deepFreeze({ event, summary })
}

const MOTIVO_AMOSTRA = "amostra abaixo do mínimo configurado"

function motivoNaoMaterial(
  p: Particao,
  target: ConcentrationTarget | null,
  minimo: number,
): string | undefined {
  if (p.elegiveis.length === 0) return "nenhum contrato elegível"
  if (p.elegiveis.length < minimo) return MOTIVO_AMOSTRA
  if (target === null) return "nenhum alvo de concentração"
  if (target.contract_count === 0) return "nenhum contrato vencendo no alvo"
  return undefined
}

/** Dimensão que pode tornar o alvo material. Conjunto FECHADO. */
export type MaterialityDimension =
  | "count"
  | "share_count_bp"
  | "amount_cents"
  | "share_amount_bp"

/**
 * Resultado ESTRUTURADO da materialidade.
 *
 * `satisfied_dimensions` não é enfeite de auditoria: é o que diz QUAIS razões
 * fizeram o evento existir. O gate encontrou o custo de esconder isso atrás de um
 * booleano — `share_amount_bp` podia ser o único critério a cruzar o limiar, o
 * evento saía por causa dela, e a provenance não a exigia. A razão decisiva
 * ficava sem prova.
 *
 * Uma fonte de verdade dirige três coisas: a decisão de emitir, a materialidade
 * publicada e o `claim_set`. Recalcular a materialidade dentro da derivação de
 * claims permitiria as duas divergirem em silêncio.
 */
export interface MaterialityEvaluation {
  readonly material: boolean
  readonly satisfied_dimensions: readonly MaterialityDimension[]
}

/** Qualquer uma das quatro dimensões basta — cada uma compara o que é dela. */
function avaliarMaterialidade(
  t: ConcentrationTarget,
  cfg: DetectorConfig["firstDueConcentration"],
): MaterialityEvaluation {
  const satisfeitas: MaterialityDimension[] = []

  if (t.contract_count >= cfg.material_count) satisfeitas.push("count")
  if (isOk(t.share_count_bp) && t.share_count_bp.value >= cfg.material_share_count_bp) {
    satisfeitas.push("share_count_bp")
  }
  if (isOk(t.amount_cents) && t.amount_cents.value >= cfg.material_amount_cents) {
    satisfeitas.push("amount_cents")
  }
  if (isOk(t.share_amount_bp) && t.share_amount_bp.value >= cfg.material_share_amount_bp) {
    satisfeitas.push("share_amount_bp")
  }

  // TODAS as dimensões que cruzaram entram — não só "a primeira". Cada uma
  // contribuiu para a decisão, e cada uma precisa de prova.
  return { material: satisfeitas.length > 0, satisfied_dimensions: satisfeitas }
}

/** Dimensão de materialidade → claim que a evidência precisa sustentar. */
const CLAIM_DA_DIMENSAO: Readonly<Record<MaterialityDimension, FirstDueClaim>> = {
  count: "contract_count",
  share_count_bp: "share_count_bp",
  amount_cents: "amount_cents",
  share_amount_bp: "share_amount_bp",
}

/**
 * A escala cobre este valor?
 *
 * `classifySeverity` lança abaixo da primeira banda — correto para ela, mas aqui
 * abortaria a análise inteira. Valor fora do domínio da escala é política
 * ausente, não erro e não `info`.
 */
function escalaCobre(cfg: DetectorConfig["firstDueConcentration"], valor: number): boolean {
  const primeira = cfg.severity_scale[0]
  if (primeira === undefined) return false
  return valor >= primeira.at_least
}

/**
 * A qualidade é a dependência RELEVANTE mais fraca.
 *
 * Relevante importa: uma lacuna de participação em VALOR não invalida a
 * concentração em QUANTIDADE, que continua exata. O que degrada é data ausente,
 * data inválida, identidade não resolvida e cobertura insuficiente.
 */
function resolverQualidade(
  input: FirstDueDetectorInput,
  p: Particao,
  target: ConcentrationTarget | null,
  config: DetectorConfig,
): Quality {
  const cfg = config.firstDueConcentration
  const candidatas: Quality[] = ["ok"]

  // LINEAGE. O evento não pode ser melhor que a fonte: um snapshot `conflicted`
  // significa duas fontes governadas afirmando coisas diferentes, e nenhuma
  // agregação resolve isso. Faltava exatamente esta leitura.
  for (const s of input.snapshots) {
    candidatas.push(s.quality_status)
    if (s.conflicts.length > 0) candidatas.push("conflicted")
    if (s.missing_fields.length > 0) candidatas.push("degraded")
    if (s.rows_skipped > 0) candidatas.push("degraded")
  }

  if (p.elegiveis.length === 0) candidatas.push("insufficient")
  if (p.population.excluded.INVALID_DUE_DATE > 0) candidatas.push("degraded")
  if (p.population.excluded.MISSING_DUE_DATE > 0) candidatas.push("degraded")

  // Identidade não resolvida é falha de qualidade, não de cobertura — mesma
  // gradação do Detector A.
  for (const c of input.contracts) {
    if (c.unit.status === "unknown") candidatas.push("degraded")
    else if (c.unit.status === "ambiguous") candidatas.push("conflicted")
  }

  if (target !== null) {
    if (!isOk(target.share_count_bp)) candidatas.push("insufficient")
    // A dimensão financeira falhou. A contagem segue exata — métricas são
    // independentes —, mas o evento NÃO pode sair `ok`, senão pareceria
    // financeiramente completo para quem só vê o evento.
    if (!isOk(target.amount_cents) || !isOk(target.share_amount_bp)) candidatas.push("degraded")
  }

  if (input.unit_coverage !== undefined) {
    if (input.unit_coverage.ratio_bp < config.coverage.emit_event_below_bp) {
      candidatas.push("insufficient")
    } else if (input.unit_coverage.ratio_bp < config.coverage.degraded_below_bp) {
      candidatas.push("degraded")
    }
  }

  if (p.elegiveis.length > 0 && p.elegiveis.length < cfg.minimum_sample_size) {
    candidatas.push("insufficient")
  }

  return piorQualidade(candidatas)
}

/**
 * Dimensões declaradas indisponíveis, para `data_quality.missing_fields`.
 *
 * O contrato do evento não tem campo para a razão detalhada da lacuna — ela fica
 * no `summary`, com o `Gap` exato. O que o evento carrega é o NOME da dimensão
 * ausente, e é isso que impede um consumidor de ler ausência de `amount_cents`
 * como "não havia valor a reportar".
 */
function dimensoesAusentes(t: ConcentrationTarget): string[] {
  const ausentes: string[] = []
  if (!isOk(t.amount_cents)) ausentes.push("target_amount_cents")
  if (!isOk(t.share_amount_bp)) ausentes.push("target_share_amount_bp")
  if (!isOk(t.share_count_bp)) ausentes.push("target_share_count_bp")
  return ausentes
}

/**
 * Identidade lógica do evento.
 *
 * Composta pelo FATO governado, não pela execução: reingerir os mesmos datasets
 * no mesmo período produz o mesmo evento, ainda que os `snapshot_id` mudem. A
 * janela e o alvo entram porque "concentração em 04/09" e "concentração em
 * setembro" são fatos distintos. Estruturada, nunca por gramática de delimitador.
 */
function identidadeDoEvento(
  input: FirstDueDetectorInput,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  janela: DueWindow,
  target: ConcentrationTarget | null,
): string {
  const datasets = [...escopos.values()]
    .map((e) => ({ source_system: e.source_system, dataset_id: e.dataset_id }))
    .sort(
      (a, b) =>
        compareCodeUnits(a.source_system, b.source_system) ||
        compareCodeUnits(a.dataset_id, b.dataset_id),
    )

  return structuralId(
    "creditum:first_due_date_concentration:v1",
    {
      event_type: EVENT_TYPE,
      period_start: input.period_start,
      period_end: input.period_end,
      window_mode: janela.mode,
      target_start: target?.window.start ?? null,
      target_end: target?.window.end ?? null,
      datasets,
    },
    "evt",
  )
}

function construirEvento(
  input: FirstDueDetectorInput,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  s: FirstDueSummary,
  t: ConcentrationTarget,
  severity: Severity,
  quality: Quality,
): IntelligenceEvent {
  const snapshotIds = [...escopos.keys()].sort(compareCodeUnits)
  const evidenceRefs = [...new Set([input.aggregate_evidence_ref, ...t.evidence_refs])].sort(
    compareCodeUnits,
  )

  const ausentes = dimensoesAusentes(t)
  const conflictIds = [
    ...new Set(input.snapshots.flatMap((s2) => s2.conflicts.map((k) => k.conflict_id))),
  ].sort(compareCodeUnits)

  const bruto: unknown = {
    event_id: s.event_id,
    event_type: EVENT_TYPE,
    detector_id: DETECTOR_ID,
    detector_version: DETECTOR_VERSION,
    snapshot_ids: snapshotIds,
    period_start: input.period_start,
    period_end: input.period_end,
    detected_at: input.detected_at,
    severity,
    materiality: materialidade(t),
    observed_metric: {
      name: "contratos_com_primeiro_vencimento_no_alvo",
      data_class: "calculated" as const,
      unit: "count" as const,
      value: t.contract_count,
      formula: FORMULA_COUNT,
    },
    /**
     * Sem baseline governado, LACUNA — e nomeada por observação.
     *
     * A fixture original trazia `inadimplencia_projetada_primeira_parcela`. Era
     * lacuna, então nenhum número falso saiu, mas o nome afirmava uma projeção
     * que este detector não sustenta e não pode sustentar sem modelo governado.
     */
    reference_metric: {
      name: "contratos_com_primeiro_vencimento_no_alvo_referencia",
      data_class: "gap" as const,
      gap_reason: "DATA_NOT_AVAILABLE" as const,
    },
    evidence_refs: evidenceRefs,
    data_quality: {
      quality_status: quality,
      ...(ausentes.length === 0 ? {} : { missing_fields: ausentes }),
      ...(conflictIds.length === 0 ? {} : { conflict_ids: conflictIds }),
      ...(input.unit_coverage === undefined
        ? {}
        : { coverage_ratio_bp: input.unit_coverage.ratio_bp }),
    },
  }

  return toEvent(bruto, { now: new Date(input.detected_at) })
}

/**
 * Base da materialidade.
 *
 * `share_of_total_bp` é `basis_points` (0..10000) no contrato, então só entra
 * quando a participação existe de fato. A base é `amount_cents` quando o volume
 * existe, senão `count` — nunca declarar uma base sem o campo correspondente.
 */
function materialidade(t: ConcentrationTarget): unknown {
  const parte = isOk(t.share_count_bp) ? { share_of_total_bp: t.share_count_bp.value } : {}

  if (isOk(t.amount_cents)) {
    return {
      basis: "amount_cents",
      amount_cents: t.amount_cents.value,
      count: t.contract_count,
      ...parte,
    }
  }
  return { basis: "count", count: t.contract_count, ...parte }
}

export { FORMULA_COUNT, FORMULA_SHARE_COUNT, FORMULA_AMOUNT, FORMULA_SHARE_AMOUNT, FORMULA_ELIGIBILITY }
