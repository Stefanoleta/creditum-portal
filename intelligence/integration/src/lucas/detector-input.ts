/**
 * Da captura do Lucas para a entrada dos detectores aprovados.
 *
 * ─── Nenhum detector foi alterado ─────────────────────────────────────────────
 *
 * Este módulo só monta as entradas que `installment-concentration.ts` e
 * `low-ticket.ts` já declaram. Se um mapeamento não couber no contrato existente, a
 * resposta é NÃO integrar aquele detector e documentar — nunca afrouxar o detector
 * para a fonte caber. Foi o que aconteceu com o Detector C (ver `deferC` abaixo).
 *
 * ─── Por que a população é `E` + `A` + `P`, e não só `E` ───────────────────────
 *
 * A e low-ticket medem ESTRUTURA do que foi contratado — como o parcelamento se
 * distribui, se o ticket está abaixo do piso. Um contrato pendente já tem
 * parcelamento e ticket definidos: o aluno não assinou, mas o produto vendido é
 * aquele. Excluir os pendentes mediria a estrutura de uma amostra enviesada.
 *
 * `C` sai: contrato cancelado não é produto vendido.
 *
 * Isso é diferente de CONTAR vendas, onde só `E` conta — e a diferença é o motivo de
 * `status-semantics.ts` existir separado deste arquivo.
 */

import type { Evidence, Snapshot } from "../../../gateway/src/types"
import type { ContractRecord, InstallmentDetectorInput } from "../../../detectors/src/installment-concentration"
import type { LowTicketInput, TicketRecord } from "../../../detectors/src/low-ticket"
import type { UnitCoverage } from "../../../detectors/src/installment-concentration"
import type { LucasContractRow } from "./rows"
import { evidenceForCounterfactual, rowKeyFor, subjectRefOf } from "./evidence"
import {
  RECOVERY_SEMANTICS,
  deadlineFactType,
  evaluateDeadline,
  isRecoveryCandidate,
} from "./deadline"
import type { LucasStatus } from "./rows"
import type {
  DeadlineFactType,
  DeadlineNotEvaluableReason,
  DeadlineState,
} from "./deadline"
import type {
  CaseRecord,
  CounterfactualBinding,
  MaterialSingleCaseInput,
  SingleCaseAggregator,
} from "../../../detectors/src/material-single-case"
import type { SingleCaseMetric } from "../../../detectors/src/config"
import type { LucasCapture } from "./provider"
import {
  AWAITING_CREDITUM_SIGNATURE,
  PENDING_STUDENT_SIGNATURE,
  belongsToPopulation,
  classifyOutcome,
} from "./status-semantics"
import type {
  AwaitingSignatureFact,
  CommercialPopulation,
  PendingStudentSignatureFact,
  PeriodStance,
} from "./status-semantics"


/**
 * Contratos que contam como produto vendido: tudo menos cancelado e status inválido.
 *
 * Status inválido sai porque não sabemos o que a linha é — e incluí-la seria decidir
 * por ela. Fica contada em `invalid_status` na decomposição.
 */
export function structuralPopulation(
  rows: readonly LucasContractRow[],
  stance: PeriodStance,
): readonly LucasContractRow[] {
  return rows.filter((l) => {
    if (l.status === null) return false
    return classifyOutcome(l.status, stance) !== "cancelled"
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.12a — o período CORRENTE tem de ser provado, não afirmado
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Marca privada. Impede construir `CurrentPeriodCapture` sem validar.
 *
 * `unique symbol` não exportado: nenhum código fora deste módulo consegue produzir a
 * chave, então o tipo só nasce de `validateCurrentPeriod`. A versão anterior aceitava
 * qualquer captura e ESTAMPAVA `stance: "current"` — o rótulo era afirmação do
 * chamador, e um mês fechado passava direto, tratando `A` e `P` históricos como
 * possibilidade comercial. É exatamente o vazamento que a regra histórica proíbe.
 */
const PERIODO_VALIDADO: unique symbol = Symbol("lucas/current_period_validated")

/** Captura cujo período foi PROVADO igual ao período corrente de negócio. */
export interface CurrentPeriodCapture {
  readonly [PERIODO_VALIDADO]: true
  readonly capture: Extract<LucasCapture, { status: "available" } | { status: "available_empty" }>
  readonly current_period: string
}

/** Por que a captura não é do período corrente. Conjunto FECHADO. */
export type NotCurrentPeriodReason = "CLOSED_PERIOD" | "FUTURE_PERIOD"

export type CurrentPeriodCheck =
  | { readonly status: "current"; readonly validated: CurrentPeriodCapture }
  | {
      readonly status: "not_current"
      readonly reason: NotCurrentPeriodReason
      readonly capture_period: string
      readonly current_period: string
    }

/**
 * Prova que a captura é do período corrente. Único produtor de `CurrentPeriodCapture`.
 *
 * ─── Quem resolve o período corrente ──────────────────────────────────────────
 *
 * NÃO esta função. `current_period` chega por parâmetro, resolvido UMA vez na
 * fronteira de orquestração por `currentPeriod()`, que usa `America/Sao_Paulo`.
 *
 * A razão é a mesma que fez o provider não consultar relógio: às 21:00 do dia 31 de
 * agosto em São Paulo, `new Date()` em UTC já é setembro. Se cada função de
 * mapeamento chamasse o relógio por conta própria, duas delas na mesma execução
 * poderiam discordar sobre qual é o mês corrente — e a que estivesse do lado errado
 * da meia-noite trataria o mês vigente como fechado.
 *
 * ─── Fechado e futuro são razões diferentes ───────────────────────────────────
 *
 * Período anterior é `CLOSED_PERIOD`: o dado existe e a semântica corrente não se
 * aplica. Período posterior é `FUTURE_PERIOD`: pedimos um mês que ainda não
 * aconteceu, o que é defeito de chamada, não característica do dado.
 */
export function validateCurrentPeriod(
  capture: Extract<LucasCapture, { status: "available" } | { status: "available_empty" }>,
  current_period: string,
): CurrentPeriodCheck {
  if (capture.period === current_period) {
    return {
      status: "current",
      validated: { [PERIODO_VALIDADO]: true, capture, current_period } as CurrentPeriodCapture,
    }
  }
  return {
    status: "not_current",
    // Comparação de `AAAA-MM` como string é segura: o formato é de largura fixa,
    // zero-padded, e a ordem lexical coincide com a cronológica. Diferente do caso
    // de RFC3339 da Fase 2.11c, em que a precisão fracionária variava.
    reason: capture.period < current_period ? "CLOSED_PERIOD" : "FUTURE_PERIOD",
    capture_period: capture.period,
    current_period,
  }
}

/**
 * Uma população comercial governada, COM o rótulo grudado.
 *
 * ─── Por que o rótulo viaja no tipo ───────────────────────────────────────────
 *
 * `readonly LucasContractRow[]` não diz qual população é. Uma lista de 9 contratos
 * pode ser `E+A+P` do mês corrente ou `E` de três meses — e o consumidor que a
 * receber sem rótulo vai chamá-la do que quiser. Foi por isso que o payload do
 * snapshot ficou sem `sales_count`: agregado sem população declarada é o defeito.
 *
 * Aqui o rótulo é campo obrigatório. Não existe como passar a população adiante sem
 * dizer qual ela é.
 */
export interface LabeledPopulation {
  readonly population: CommercialPopulation
  /** Sempre `current`: as três populações são semântica de mês vigente. */
  readonly stance: "current"
  readonly rows: readonly LucasContractRow[]
  readonly count: number
}

/**
 * Seleciona uma das três populações governadas do mês CORRENTE.
 *
 * Exige `CurrentPeriodCapture` — não uma lista de linhas e não uma captura qualquer.
 * O `stance: "current"` do resultado deixou de ser estampado sobre o que aparecesse:
 * ele agora só existe porque o tipo de entrada prova que o período foi validado.
 *
 * Status fora do vocabulário não entra em nenhuma população: não sabemos o que a
 * linha é.
 */
export function selectPopulation(
  validated: CurrentPeriodCapture,
  population: CommercialPopulation,
): LabeledPopulation {
  const selecionadas = validated.capture.rows.filter(
    (l) => l.status !== null && belongsToPopulation(l.status, population),
  )
  return Object.freeze({
    population,
    stance: "current" as const,
    rows: selecionadas,
    count: selecionadas.length,
  })
}

/**
 * Entrada do mapeamento.
 *
 * Repare no que NÃO está aqui: `evidence` e `aggregate_evidence_ref`. Eles vinham
 * por parâmetro, e isso permitia ao chamador fornecer evidência que nunca passou
 * pela fonte — inclusive um teste construindo um objeto válido à mão. Agora vêm de
 * `capture.evidence`, produzida pelo provider no caminho de produção.
 *
 * Não é conveniência: é a única forma de o tipo garantir que a evidência que chega ao
 * detector é a que nasceu da planilha.
 */
export interface DetectorMappingInput {
  readonly capture: Extract<LucasCapture, { status: "available" } | { status: "available_empty" }>
  readonly stance: PeriodStance
  readonly detected_at: string
  /** Cobertura de unidades quando `expected_units` existir. Ausente é ausente. */
  readonly unit_coverage?: UnitCoverage
}

/**
 * Refs de evidência de uma linha, casadas por `locator.row_key`.
 *
 * A primeira versão filtrava por `locator.row`, campo que NÃO existe no contrato de
 * `Evidence` — o localizador governado é `row_key`, string. O filtro não casava
 * nada, todo contrato saía com `evidence_refs: []`, e a precondição do detector
 * recusava a integração inteira. Só apareceu porque o teste roda a regra governada
 * de verdade.
 */
function refsDaLinha(
  evidence: readonly Evidence[],
  row_number: number,
  file_id: string,
  sheet: string,
): readonly string[] {
  const chave = rowKeyFor(file_id, sheet, row_number)
  return evidence
    .filter((e) => e.kind === "row" && e.locator.row_key === chave)
    .map((e) => e.evidence_id)
}

/** Entrada do Detector A. O detector não muda; só recebe. */
export function toInstallmentInput(input: DetectorMappingInput): InstallmentDetectorInput {
  const { capture } = input
  const snapshot: Snapshot = capture.snapshot
  const populacao = structuralPopulation(capture.rows, input.stance)

  const contracts: ContractRecord[] = populacao.map((l) => ({
    subject_ref: subjectRefOf(l, snapshot.dataset_id, capture.period),
    unit: l.unit,
    installment_count: l.installment_count,
    amount_cents: l.ticket_cents,
    evidence_refs: refsDaLinha(capture.evidence.all, l.row_number, capture.provenance.file_id, capture.provenance.sheet_name),
    snapshot_id: snapshot.snapshot_id,
  }))

  return {
    detected_at: input.detected_at,
    period_start: snapshot.period_start,
    period_end: snapshot.period_end,
    contracts,
    snapshots: [snapshot],
    evidence: capture.evidence.all,
    aggregate_evidence_ref: capture.evidence.aggregate.evidence_id,
    ...(input.unit_coverage === undefined ? {} : { unit_coverage: input.unit_coverage }),
  }
}

/**
 * Entrada da regra de low-ticket.
 *
 * `ticket_cents` vem SEMPRE de `TICKET`, a coluna oficial. `VALOR REPASSE ×
 * PARCELAS` reconciliou 100% das linhas auditadas e continua servindo apenas para
 * detectar divergência — se `TICKET` faltar, chega `null` e a regra o classifica
 * como `INVALID_TICKET`. Substituir pelo produto faria um contrato sem ticket
 * atravessar o piso de R$ 1.499,99 com um número que a fonte não afirmou.
 */
export function toLowTicketInput(input: DetectorMappingInput): LowTicketInput {
  const { capture } = input
  const snapshot: Snapshot = capture.snapshot
  const populacao = structuralPopulation(capture.rows, input.stance)

  const contracts: TicketRecord[] = populacao.map((l) => ({
    subject_ref: subjectRefOf(l, snapshot.dataset_id, capture.period),
    unit: l.unit,
    ticket_cents: l.ticket_cents,
    evidence_refs: refsDaLinha(capture.evidence.all, l.row_number, capture.provenance.file_id, capture.provenance.sheet_name),
    snapshot_id: snapshot.snapshot_id,
  }))

  return {
    detected_at: input.detected_at,
    period_start: snapshot.period_start,
    period_end: snapshot.period_end,
    contracts,
    snapshots: [snapshot],
    evidence: capture.evidence.all,
  }
}

/** Fatos `A` do mês vigente. Sem severidade, por decisão da Fase 2.7. */
export function awaitingSignatureFacts(
  input: DetectorMappingInput,
): readonly AwaitingSignatureFact[] {
  if (input.stance !== "current") return []
  const { capture } = input
  return capture.rows
    .filter((l) => l.status === "A")
    .map((l) => ({
      fact: AWAITING_CREDITUM_SIGNATURE,
      period: capture.period,
      subject_ref: l.identity.status === "identified" ? l.identity.subject_ref : null,
      unit_id: l.unit.status === "matched" ? l.unit.unit_id : null,
      ticket_cents: l.ticket_cents,
      evidence_refs: refsDaLinha(capture.evidence.all, l.row_number, capture.provenance.file_id, capture.provenance.sheet_name),
      snapshot_id: capture.snapshot.snapshot_id,
      severity: null,
      severity_status: "SEVERITY_POLICY_UNRESOLVED" as const,
    }))
}

/**
 * Fatos `P` do mês vigente. Sem severidade, mesmo padrão do de `A`.
 *
 * A diferença que justifica dois fatos e não um: em `A` a pendência é INTERNA — a
 * Creditum precisa emitir. Em `P` é EXTERNA — o aluno precisa assinar. Vão para
 * pessoas diferentes, e um fato único chamado "assinatura pendente" obrigaria quem
 * recebe a descobrir de quem é a vez.
 */
export function pendingStudentSignatureFacts(
  input: DetectorMappingInput,
): readonly PendingStudentSignatureFact[] {
  if (input.stance !== "current") return []
  const { capture } = input
  return capture.rows
    .filter((l) => l.status === "P")
    .map((l) => ({
      fact: PENDING_STUDENT_SIGNATURE,
      period: capture.period,
      subject_ref: l.identity.status === "identified" ? l.identity.subject_ref : null,
      unit_id: l.unit.status === "matched" ? l.unit.unit_id : null,
      ticket_cents: l.ticket_cents,
      evidence_refs: refsDaLinha(
        capture.evidence.all,
        l.row_number,
        capture.provenance.file_id,
        capture.provenance.sheet_name,
      ),
      snapshot_id: capture.snapshot.snapshot_id,
      severity: null,
      severity_status: "SEVERITY_POLICY_UNRESOLVED" as const,
    }))
}

// ═════════════════════════════════════════════════════════════════════════════
// Detector D — INTEGRADO na Fase 2.12, população E+A+P do mês corrente
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Entrada do Detector D sobre `COMMERCIAL_POTENTIAL`.
 *
 * ─── Por que E+A+P, e por que isso é uma decisão de negócio recebida ──────────
 *
 * A Fase 2.11 deixou D deferido exatamente porque escolher entre `E`, `E+A` e
 * `E+A+P` é decisão de negócio, e integrar sob suposição produziria um denominador
 * que ninguém aprovou. A decisão chegou: `COMMERCIAL_POTENTIAL`.
 *
 * Ela faz sentido para o que D mede. D pergunta "um único caso domina o agregado?" —
 * e a resposta é interessante justamente sobre a possibilidade comercial do mês: um
 * contrato de R$ 60 mil concentrando o funil é o mesmo risco esteja ele emitido ou
 * aguardando assinatura.
 *
 * ─── `P` entra como MEMBRO, não como probabilidade ────────────────────────────
 *
 * Nenhum peso, nenhum fator de conversão, nenhum forecast. Um `P` conta um contrato,
 * com o `TICKET` que a fonte afirmou. Ponderar por probabilidade de fechamento
 * exigiria uma taxa de conversão governada que não existe, e produziria um agregado
 * que nenhuma fonte publicou.
 *
 * ─── Somente mês corrente ─────────────────────────────────────────────────────
 *
 * `stance` do input é ignorado aqui de propósito: esta função só existe para o mês
 * vigente, e `LabeledPopulation` carrega `stance: "current"` fixo. Estender a mesma
 * população para mês fechado transformaria `A` e `P` antigos em possibilidade
 * retroativa, contra a regra histórica de que realizado é `E`.
 */
export interface MaterialSingleCaseMapping {
  readonly input: MaterialSingleCaseInput
  /** A população que o input carrega, para quem audita o resultado. */
  readonly population: LabeledPopulation
}

/**
 * Por que D não foi executado. Conjunto FECHADO.
 *
 * `NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION` — o contrato canônico de D não
 * consegue representar dois contratos do mesmo sujeito. Ver `MATERIAL_SINGLE_CASE_
 * CANDIDATE_IDENTITY_GAP`.
 */
export type DetectorDNotExecutedReason = "NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION"

/**
 * O que o contrato de D não representa, medido nele mesmo.
 *
 * ─── O que eu verifiquei antes de decidir ─────────────────────────────────────
 *
 * `material-single-case.ts` associa o binding contrafactual ao candidato por
 * `subject_ref`, em DOIS pontos:
 *
 *   · a precondição recusa se um `subject_ref` tem mais de um binding
 *     ("N bindings para o mesmo candidato; a associação precisa ser única");
 *   · `new Map(bindings.map((b) => [b.subject_ref, b]))` — um `Map` por sujeito. Com
 *     dois casos de mesmo `subject_ref`, ele guarda UM binding, e o primeiro caso
 *     receberia o contrafactual do segundo.
 *
 * E `counterfactualComputationId` compõe a identidade da computação com
 * `subject_ref` e nenhuma identidade de linha. A operação declarada é
 * `exclude_subject` — literalmente "excluir o sujeito". "O agregado sem X" só é um
 * número bem definido se X aparecer uma vez.
 *
 * D **não tem** campo de identidade de candidato separado do sujeito: procurei
 * `candidate_id`, `candidate_ref`, `case_ref` e `row_key` no contrato dele e não
 * existem.
 *
 * ─── Por que não contornei ────────────────────────────────────────────────────
 *
 * `subject_ref` é a identidade da PESSOA, e uma pessoa pode legitimamente ter dois
 * contratos no mês — a fonte é uma linha por contrato e não tem constraint. Tornar
 * `subject_ref` único por linha resolveria a precondição e quebraria a semântica: o
 * evento de D sairia sobre um "sujeito" que é meia pessoa.
 *
 * As alternativas são todas piores: descartar um contrato perde dado; somá-los cria
 * um pseudocontrato que a fonte não afirmou; deduplicar por CPF contradiz a
 * granularidade. E deixar D recusar sozinho faria UMA linha repetida bloquear a
 * avaliação do mês inteiro, com uma mensagem sobre binding — que não é o problema.
 *
 * Então: não-execução governada ANTES de invocar D, com a razão nomeada.
 */
export const MATERIAL_SINGLE_CASE_CANDIDATE_IDENTITY_GAP = Object.freeze({
  detector: "material_single_case",
  /** D associa binding e mede impacto por `subject_ref`, não por contrato. */
  binds_by: "subject_ref",
  /** Nenhum campo de identidade de candidato existe no contrato de D. */
  has_candidate_identity: false,
  /** A operação é declarada por sujeito, não por linha. */
  operation: "exclude_subject",
  /** A identidade canônica de linha que a Fase 2.11 já produz, e que D não aceita. */
  available_row_identity: "row_key",
} as const)

export type MaterialSingleCaseOutcome =
  | ({ readonly status: "mapped" } & MaterialSingleCaseMapping)
  | {
      readonly status: "not_executed"
      readonly reason: DetectorDNotExecutedReason
      readonly detail: string
      /** A população que teria ido a D, para auditoria. */
      readonly population: LabeledPopulation
      /** Quantos contratos cada sujeito repetido tem. Sem CPF, só pseudônimo. */
      readonly duplicated_subjects: readonly {
        readonly subject_ref: string
        readonly contracts: number
      }[]
    }

/**
 * Entrada de D, ou não-execução governada.
 *
 * Recebe `CurrentPeriodCapture` — não uma captura qualquer. Um mês fechado não chega
 * aqui: o tipo não permite.
 */
export function toMaterialSingleCaseInput(
  validated: CurrentPeriodCapture,
  detected_at: string,
  metric: SingleCaseMetric,
  aggregator: SingleCaseAggregator,
  unit_coverage?: UnitCoverage,
): MaterialSingleCaseOutcome {
  const capture = validated.capture
  const snapshot: Snapshot = capture.snapshot
  const populacao = selectPopulation(validated, "COMMERCIAL_POTENTIAL")

  // ─── Sujeito repetido: recusa ANTES de montar o input ──────────────────────
  //
  // Dois contratos do mesmo sujeito produzem o mesmo `subject_ref` — que é o certo,
  // porque é a mesma pessoa. Mas D indexa o contrafactual por `subject_ref`, então
  // enviar os dois faria a precondição dele recusar a captura inteira, ou pior,
  // associar o contrafactual errado.
  const porSujeito = new Map<string, number>()
  for (const l of populacao.rows) {
    const ref = subjectRefOf(l, snapshot.dataset_id, capture.period)
    porSujeito.set(ref, (porSujeito.get(ref) ?? 0) + 1)
  }
  const repetidos = [...porSujeito.entries()]
    .filter(([, n]) => n > 1)
    .map(([subject_ref, contracts]) => ({ subject_ref, contracts }))
    .sort((a, b) => (a.subject_ref < b.subject_ref ? -1 : 1))

  if (repetidos.length > 0) {
    return {
      status: "not_executed",
      reason: "NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION",
      detail:
        "o contrato canônico do Detector D associa o contrafactual por subject_ref e " +
        "declara a operação como exclude_subject; dois contratos do mesmo sujeito não " +
        "são representáveis sem inventar identidade de candidato. Nenhum contrato foi " +
        "descartado, somado nem deduplicado.",
      population: populacao,
      duplicated_subjects: Object.freeze(repetidos),
    }
  }

  const cases: CaseRecord[] = populacao.rows.map((l) => ({
    subject_ref: subjectRefOf(l, snapshot.dataset_id, capture.period),
    unit: l.unit,
    // `TICKET` oficial. Ausente chega `null`, e o detector o trata pelo contrato
    // dele — nunca zero, e nunca o produto repasse × parcelas.
    amount_cents: l.ticket_cents,
    evidence_refs: refsDaLinha(
      capture.evidence.all,
      l.row_number,
      capture.provenance.file_id,
      capture.provenance.sheet_name,
    ),
    snapshot_id: snapshot.snapshot_id,
  }))

  const scope = [{ source_system: snapshot.source_system, dataset_id: snapshot.dataset_id }]

  // Um binding POR candidato, e a evidência contrafactual de cada um nasce do
  // pipeline governado — não de um objeto montado pelo chamador.
  const bindings: CounterfactualBinding[] = cases.map((c) => ({
    // `evidence_ref` é preenchido logo abaixo, quando a evidência existir. O binding
    // é construído primeiro porque `counterfactualComputationId` depende dele.
    evidence_ref: "",
    subject_ref: c.subject_ref,
    metric,
    aggregator,
    operation: "exclude_subject" as const,
    period_start: snapshot.period_start,
    period_end: snapshot.period_end,
    scope,
  }))

  const contrafactuais = bindings.map((b) => evidenceForCounterfactual(snapshot, b))
  const bindingsComRef: CounterfactualBinding[] = bindings.map((b, i) => {
    const ev = contrafactuais[i]
    if (ev === undefined) throw new Error("contrafactual ausente para candidato")
    return { ...b, evidence_ref: ev.evidence.evidence_id }
  })

  return {
    status: "mapped" as const,
    population: populacao,
    input: {
      detected_at,
      period_start: snapshot.period_start,
      period_end: snapshot.period_end,
      metric,
      cases,
      snapshots: [snapshot],
      evidence: [...capture.evidence.all, ...contrafactuais.map((c) => c.evidence)],
      aggregate_evidence_ref: capture.evidence.aggregate.evidence_id,
      counterfactual_bindings: bindingsComRef,
      counterfactual_provenance: contrafactuais.map((c) => c.provenance),
      ...(unit_coverage === undefined ? {} : { unit_coverage }),
    },
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Detector C — DEFERIDO, com a razão exata
// ═════════════════════════════════════════════════════════════════════════════

/** Por que C não é chamado. Conjunto FECHADO, uma razão hoje. */
export type DetectorCDeferralReason = "EXCLUSION_VOCABULARY_LOSSY"

export interface DetectorCDeferral {
  readonly detector: "first_due_date_concentration"
  readonly integrated: false
  readonly reason: DetectorCDeferralReason
  readonly detail: string
  /** Os estados da fonte que o contrato de C não distingue. */
  readonly source_states: readonly string[]
  readonly detector_states: readonly string[]
}

/**
 * A razão, medida contra o contrato real de C.
 *
 * `DueExclusionReason` de C tem DOIS membros: `MISSING_DUE_DATE` e
 * `INVALID_DUE_DATE`. A fonte do Lucas produz QUATRO estados de ausência, e o
 * mapeamento 4→2 não é uma perda de detalhe — ele afirma coisa falsa:
 *
 *   `27/08`  →  `INVALID_DUE_DATE`   diz "a fonte errou". Não errou: faltou o ano.
 *   `PG`     →  `INVALID_DUE_DATE`   diz "a fonte errou". Não errou: disse "pago".
 *
 * `PG` é a metade dos casos de julho. Chamar 13 de 24 linhas de dado inválido
 * produziria um `eligibility_ratio_bp` que reporta corrupção onde há uma coluna
 * sobrecarregada — e é justamente esse número que alguém usaria para dizer que a
 * planilha do Lucas está mal preenchida.
 *
 * A alternativa seria filtrar antes: passar a C só as linhas com data completa. Mas
 * C calcula a elegibilidade sobre `input.contracts.length`, então filtrar apagaria
 * as exclusões — o detector reportaria 100% de elegibilidade sobre uma população
 * escolhida por nós. Pior que a primeira opção: esconde em vez de mentir.
 *
 * Então C fica de fora desta integração. Não foi alterado, continua SHIP, e a data
 * completa é preservada em `venc.first_due_date` para quando a fonte tiver a coluna
 * imutável (GAP `FIRST_DUE_DATE_ORIGINAL`, Fase 2.10 §20.6).
 */
export const DETECTOR_C_DEFERRAL: DetectorCDeferral = Object.freeze({
  detector: "first_due_date_concentration",
  integrated: false,
  reason: "EXCLUSION_VOCABULARY_LOSSY",
  detail:
    "DueExclusionReason tem 2 membros (MISSING_DUE_DATE, INVALID_DUE_DATE) e a fonte produz 4 estados. " +
    "Mapear PG e DD/MM para INVALID_DUE_DATE afirmaria dado corrompido onde a fonte deu outra informação. " +
    "Pré-filtrar por data completa apagaria as exclusões, porque C calcula elegibilidade sobre contracts.length. " +
    "Nenhuma das duas é aceitável, e alterar C para acomodar a fonte é proibido.",
  source_states: Object.freeze([
    "available",
    "incomplete",
    "not_available_as_date",
    "missing",
    "invalid",
  ]),
  detector_states: Object.freeze(["MISSING_DUE_DATE", "INVALID_DUE_DATE"]),
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.13 — fatos de PRAZO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Um fato de prazo. Mesma forma de proveniência dos fatos de `A` e `P`.
 *
 * ─── O campo que não pode faltar ──────────────────────────────────────────────
 *
 * `source_status` viaja junto com `derived_deadline_state`, sempre. É a invariante
 * constitucional da fase: um contrato que a fonte ainda diz `P` e que a regra
 * operacional já considera cancelado precisa ser representável como as duas coisas
 * ao mesmo tempo. Um campo só obrigaria escolher entre "a planilha está atrasada" e
 * "o contrato caiu", e as duas são verdade.
 *
 * ─── Sem PII e sem dinheiro ───────────────────────────────────────────────────
 *
 * `subject_ref` é o pseudônimo governado (`subj_<16 hex>`). Nenhum nome, nenhum CPF.
 *
 * `ticket_cents` NÃO está aqui, ao contrário dos fatos de `A`/`P`: prazo é fato
 * temporal, e anexar valor convidaria a priorizar por dinheiro dentro desta camada —
 * priorização executiva é do briefing, não daqui.
 */
export interface DeadlineFact {
  readonly fact: DeadlineFactType
  readonly period: string
  readonly subject_ref: string | null
  readonly unit_id: string | null
  /** O que a FONTE afirma. Nunca reescrito. */
  readonly source_status: LucasStatus
  /** O estado DERIVADO. Coexiste com o de cima, nunca o substitui. */
  readonly derived_deadline_state: DeadlineState["state"]
  /** Data civil completa, do serial subjacente. Nunca do texto `dd/mm`. */
  readonly deadline: string
  /** Data civil da avaliação, em `America/Sao_Paulo`. Uma por execução. */
  readonly evaluation_date: string
  /** `evaluation_date − deadline` em dias de calendário. Negativo = antes de D. */
  readonly offset_days: number
  /** Candidato a INVESTIGAÇÃO de recontratação. Não é promessa de recuperação. */
  readonly recovery_candidate: boolean
  readonly recovery_semantics: typeof RECOVERY_SEMANTICS | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
  readonly severity: null
  readonly severity_status: "SEVERITY_POLICY_UNRESOLVED"
}

/** Uma linha cujo prazo não pôde ser avaliado. Distinto de "sem alerta". */
export interface DeadlineNotEvaluable {
  readonly row_number: number
  readonly subject_ref: string | null
  readonly source_status: LucasStatus | null
  readonly reason: DeadlineNotEvaluableReason
}

export interface LucasDeadlineIntelligence {
  readonly evaluation_date: string
  readonly facts: readonly DeadlineFact[]
  readonly not_evaluable: readonly DeadlineNotEvaluable[]
}

/**
 * Avalia o prazo de todas as linhas do mês vigente.
 *
 * `evaluation_date` entra por parâmetro e é a mesma para todas as linhas. Consultar o
 * relógio por linha faria uma execução na virada da meia-noite avaliar parte dos
 * contratos contra hoje e parte contra amanhã — e é exatamente na fronteira D0/D+1
 * que "o contrato caiu" vira "cancelado automaticamente".
 *
 * `E` e `C` não geram fato: `E` não tem pendência de assinatura, e `C` da fonte tem
 * proveniência própria que não é cancelamento por prazo.
 */
export function deadlineIntelligence(
  input: DetectorMappingInput,
  evaluation_date: string,
): LucasDeadlineIntelligence {
  if (input.stance !== "current") {
    return { evaluation_date, facts: [], not_evaluable: [] }
  }
  const { capture } = input
  const facts: DeadlineFact[] = []
  const naoAvaliaveis: DeadlineNotEvaluable[] = []

  for (const l of capture.rows) {
    const estado = evaluateDeadline(l.status, l.deadline, evaluation_date)

    if (estado.state === "not_evaluable") {
      // Só interessa registrar não-avaliável onde HAVERIA pendência. Um `E` com
      // `Desembolso` ilegível não é trabalho para ninguém.
      if (l.status === "P" || l.status === "A") {
        naoAvaliaveis.push({
          row_number: l.row_number,
          subject_ref: l.identity.status === "identified" ? l.identity.subject_ref : null,
          source_status: l.status,
          reason: estado.reason,
        })
      }
      continue
    }

    // Estados que não emitem fato, excluídos ANTES de ler `deadline`/`offset_days`.
    // O compilador é quem garante que os campos existem no que sobra — sem `!` e sem
    // asserção de tipo, que aqui afirmariam uma forma sem tê-la verificado.
    if (estado.state === "outside_window" || estado.state === "not_applicable") continue

    const tipo = deadlineFactType(estado)
    if (tipo === null) continue
    // Só `P` e `A` chegam a produzir tipo de fato.
    if (l.status !== "P" && l.status !== "A") continue

    const recuperacao = isRecoveryCandidate(estado)
    facts.push({
      fact: tipo,
      period: capture.period,
      subject_ref: l.identity.status === "identified" ? l.identity.subject_ref : null,
      unit_id: l.unit.status === "matched" ? l.unit.unit_id : null,
      source_status: l.status,
      derived_deadline_state: estado.state,
      deadline: estado.deadline,
      evaluation_date,
      offset_days: estado.offset_days,
      recovery_candidate: recuperacao,
      recovery_semantics: recuperacao ? RECOVERY_SEMANTICS : null,
      evidence_refs: refsDaLinha(
        capture.evidence.all,
        l.row_number,
        capture.provenance.file_id,
        capture.provenance.sheet_name,
      ),
      snapshot_id: capture.snapshot.snapshot_id,
      severity: null,
      severity_status: "SEVERITY_POLICY_UNRESOLVED" as const,
    })
  }

  return { evaluation_date, facts, not_evaluable: naoAvaliaveis }
}
