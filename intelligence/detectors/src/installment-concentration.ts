/**
 * Detector A — concentração de parcelamento.
 *
 * Detecta concentração material de contratos acima do limiar de parcelas.
 *
 * ─── O único threshold de negócio aprovado ────────────────────────────────────
 *
 * `installment_threshold = 19`, do briefing do Bloco 1 §14 Caso A: *"contratos
 * com mais de 19 parcelas"*. A comparação é **estritamente maior**: 19 parcelas
 * NÃO entra na faixa, 20 entra. Todos os demais limiares — materialidade,
 * severidade, seleção de caso, cobertura mínima — vêm da configuração e não têm
 * padrão de produção.
 *
 * ─── Elegibilidade ────────────────────────────────────────────────────────────
 *
 * `installment_count` ausente **não vira zero parcelas**. Zero ou negativo é
 * inválido no domínio — o schema `ceo` já impõe
 * `check (installments_grau is null or installments_grau > 0)`, e as ~55
 * linhas-fantasma da planilha real carregam justamente `Total de parcelas = 0`.
 * Contrato inelegível sai do denominador e aparece na contagem de exclusões.
 *
 * ─── Duas participações que não se misturam ───────────────────────────────────
 *
 *   share_count_bp   contratos acima ÷ contratos elegíveis      (QUANTIDADE)
 *   share_amount_bp  volume da faixa ÷ volume elegível          (VALOR)
 *
 * Poucos contratos grandes e muitos contratos pequenos produzem leituras opostas
 * nas duas. Qual delas governa a severidade é decisão de configuração explícita.
 *
 * Função pura: sem rede, disco, env, relógio implícito, aleatoriedade ou mutação.
 * Não produz inferência nem previsão — só `observed`, `calculated` e `gap`.
 */

import { GatewayError } from "../../gateway/src/errors"
import { deepFreeze } from "../../gateway/src/immutability"
import { toEvent } from "../../gateway/src/factory"
import type { Evidence, IntelligenceEvent, Snapshot } from "../../gateway/src/types"
import type { CanonicalUnitResult } from "./canonical-units"
import { APPROVED_THRESHOLDS } from "./config"
import type { DetectorConfig, Severity } from "./config"
import { gap, isOk, observed, ratio, sumCents } from "./engine"
import type { Metric } from "./engine"
import { isPartOfWhole } from "./part-of-whole"
import { piorQualidade } from "./quality"
import type { Quality } from "./quality"
import { classifySeverity } from "./severity"
import { maxAvailableParticipation, participationGap } from "./participation-severity"
import { compareCodeUnits, structuralId } from "./structural-id"

export const DETECTOR_ID = "det.installment_concentration"
/** SemVer. Muda quando a regra observável muda — nunca data nem hash. */
export const DETECTOR_VERSION = "1.0.0"

// ─── Entrada ──────────────────────────────────────────────────────────────────

export interface ContractRecord {
  /** Pseudônimo estável. NUNCA nome, CPF, telefone ou e-mail. */
  readonly subject_ref: string
  /** Já canonicalizada por D13. O detector não executa heurística própria. */
  readonly unit: CanonicalUnitResult
  /** Ausente = `null`. Nunca zero por omissão. */
  readonly installment_count: number | null
  readonly amount_cents: number | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
}

/** Referência governada. O detector não inventa baseline. */
export interface Baseline {
  readonly share_count_bp: number
  /** De onde veio: período anterior, meta, histórico. Precisa ser identificável. */
  readonly source: string
  readonly evidence_ref: string
}

export interface UnitCoverage {
  readonly expected_units: number
  readonly reporting_units: number
  readonly ratio_bp: number
}

export interface InstallmentDetectorInput {
  readonly detected_at: string
  readonly period_start: string
  readonly period_end: string
  readonly contracts: readonly ContractRecord[]
  /** Conjunto governado que sustenta os refs. Não é o store inteiro. */
  readonly snapshots: readonly Snapshot[]
  readonly evidence: readonly Evidence[]
  /** Evidência `computed` que sustenta os agregados. Obrigatória. */
  readonly aggregate_evidence_ref: string
  readonly baseline?: Baseline
  /** Cobertura de UNIDADES — dimensão diferente da elegibilidade de contratos. */
  readonly unit_coverage?: UnitCoverage
}

// ─── Saída ────────────────────────────────────────────────────────────────────

/** Por que um contrato saiu do denominador. Nenhum vira zero. */
export type ExclusionReason = "MISSING_INSTALLMENT_COUNT" | "NON_POSITIVE_INSTALLMENT_COUNT"

export interface Population {
  readonly total_records: number
  readonly eligible_contracts: number
  readonly contracts_above_threshold: number
  readonly excluded: Readonly<Record<ExclusionReason, number>>
  /** Elegíveis ÷ total, em basis points. Dimensão distinta da cobertura de unidades. */
  readonly eligibility_ratio_bp: Metric<number>
}

export interface ConcentrationMetrics {
  readonly share_count_bp: Metric<number>
  readonly amount_above_cents: Metric<number>
  readonly amount_eligible_cents: Metric<number>
  readonly share_amount_bp: Metric<number>
}

/**
 * Por que o evento executivo não saiu. Tipada — não string livre.
 *
 * `NOT_MATERIAL`  o fato não atingiu nenhum limiar configurado.
 * `SEVERITY_DIMENSION_UNAVAILABLE` o fato é material, mas a dimensão que a
 *   configuração escolheu para graduar severidade não existe. Sem ela não há
 *   severidade — e severidade fabricada é pior que evento ausente.
 */
export type NotEmittedReason = "NOT_MATERIAL" | "SEVERITY_DIMENSION_UNAVAILABLE"

/**
 * Por que a seleção de casos contribuintes não pôde rodar.
 *
 * Nomeia QUAL estratégia ficou sem base, porque as duas dependem de
 * participação por caminhos diferentes: a cumulativa soma participações até
 * cobrir uma meta, a individual compara cada participação contra um piso.
 */
export type CaseSelectionUnavailableReason =
  | "CUMULATIVE_SHARE_UNAVAILABLE"
  | "INDIVIDUAL_SHARE_UNAVAILABLE"

/**
 * Resultado da seleção de casos contribuintes.
 *
 * `selected` com lista vazia significa "nenhum caso qualificou" — um fato.
 * `unavailable` significa "a estratégia não tinha como decidir" — uma lacuna.
 * Os dois eram indistinguíveis quando a ausência de participação virava `0`:
 * a cumulativa então selecionava TODOS os casos, e a individual NENHUM.
 */
export type CaseSelection =
  | { readonly status: "selected"; readonly cases: readonly CasoContribuinte[] }
  | {
      readonly status: "unavailable"
      readonly reason: CaseSelectionUnavailableReason
      /** A lacuna subjacente: `BUSINESS_RULE_PENDING`, `EMPTY_DENOMINATOR`, … */
      readonly gap_reason: string
      readonly detail: string
    }

/** O que vai para o `summary` — compacto, sem duplicar os casos. */
export type CaseSelectionOutcome =
  | { readonly status: "selected"; readonly count: number }
  | {
      readonly status: "unavailable"
      readonly reason: CaseSelectionUnavailableReason
      readonly gap_reason: string
      readonly detail: string
    }

export interface ConcentrationSummary {
  readonly event_id: string
  readonly population: Population
  readonly metrics: ConcentrationMetrics
  /**
   * `null` quando a dimensão configurada é lacuna. NUNCA um grau de conveniência.
   *
   * Antes isto era `classifySeverity(escala, isOk(d) ? d.value : 0)`: uma
   * participação inexistente entrava na escala como 0 bp e saía classificada
   * como se fosse um fato financeiro medido em zero.
   */
  readonly severity: Severity | null
  /** Qual participação a configuração escolheu para graduar. Sempre explícita. */
  readonly severity_dimension: "share_count_bp" | "share_amount_bp"
  /** Presente quando `severity` é `null`: a lacuna exata que impediu graduar. */
  readonly severity_gap?: string
  readonly quality_status: "ok" | "degraded" | "conflicted" | "insufficient"
  /** O fato é material? Independe de severidade ser graduável. */
  readonly material: boolean
  /** Por que não foi material, quando não foi. */
  readonly non_material_reason?: string
  readonly emitted: boolean
  /** Presente quando `emitted` é falso. */
  readonly not_emitted_reason?: NotEmittedReason
  /**
   * Presente quando a seleção foi TENTADA — isto é, quando o evento seria
   * emitido. Casos contribuintes são enriquecimento: a indisponibilidade deles
   * não invalida o fato, a materialidade nem a severidade, então o evento sai
   * sem `contributing_cases` e a lacuna fica registrada aqui.
   */
  readonly contributing_cases_selection?: CaseSelectionOutcome
}

export interface ConcentrationResult {
  /**
   * Emitido quando o fato é material **e** a severidade é graduável. Já
   * validado contra o contrato. Quando `null`, `summary` continua auditável:
   * população, métricas calculáveis, materialidade, lacunas e o motivo tipado.
   */
  readonly event: IntelligenceEvent | null
  readonly summary: ConcentrationSummary
}

// ─── Precondições ─────────────────────────────────────────────────────────────

interface EscopoGovernado {
  readonly source_system: string
  readonly dataset_id: string
}

function assertPrecondicoes(input: InstallmentDetectorInput): Map<string, EscopoGovernado> {
  const problemas: string[] = []
  const snapshotPorId = new Map(input.snapshots.map((s) => [s.snapshot_id, s]))
  const evidencePorId = new Map(input.evidence.map((e) => [e.evidence_id, e]))
  const escopos = new Map<string, EscopoGovernado>()

  const conferirRef = (ref: string, snapshotId: string, onde: string): void => {
    const ev = evidencePorId.get(ref)
    if (ev === undefined) {
      problemas.push(`${onde}: evidência inexistente: ${ref}`)
      return
    }
    if (ev.snapshot_id !== snapshotId) {
      problemas.push(
        `${onde}: evidência ${ref} pertence ao snapshot ${ev.snapshot_id}, não a ${snapshotId}`,
      )
      return
    }
    const snap = snapshotPorId.get(snapshotId)
    if (snap !== undefined && ev.locator.dataset_id !== snap.dataset_id) {
      problemas.push(
        `${onde}: evidência ${ref} localiza o dataset "${ev.locator.dataset_id}" mas o snapshot é do dataset "${snap.dataset_id}"`,
      )
    }
  }

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
    for (const ref of c.evidence_refs) conferirRef(ref, c.snapshot_id, onde)

    escopos.set(c.snapshot_id, {
      source_system: snap.source_system,
      dataset_id: snap.dataset_id,
    })
  }

  // ── Evidência dos AGREGADOS ────────────────────────────────────────────────
  //
  // Existir e ter o tipo certo não basta: um número consolidado não pode se
  // ancorar numa célula individual, nem numa planilha que não participou do
  // cálculo. O escopo de agregação é o conjunto de pares
  // (snapshot_id, dataset_id) de onde os contratos vieram — `escopos`, montado
  // no laço acima. A evidência agregada precisa ser desse escopo.
  const agregada = evidencePorId.get(input.aggregate_evidence_ref)
  if (agregada === undefined) {
    problemas.push(`agregados: evidência inexistente: ${input.aggregate_evidence_ref}`)
  } else if (agregada.kind !== "computed" && agregada.kind !== "aggregate") {
    problemas.push(
      `agregados: evidência ${input.aggregate_evidence_ref} é do tipo "${agregada.kind}"; agregado exige computed ou aggregate`,
    )
  } else if (agregada.kind === "computed" && agregada.formula === undefined) {
    problemas.push(`agregados: evidência computed sem fórmula`)
  } else {
    const alvos = [...escopos.entries()]
    const [unico] = alvos

    if (alvos.length > 1) {
      // FALHA FECHADA, e não escolha arbitrária.
      //
      // `Evidence.locator` carrega UM `dataset_id`. Um agregado que atravessa
      // dois datasets não tem como ser sustentado honestamente por uma
      // evidência que aponta para um deles: o outro lado da soma ficaria sem
      // lastro, e o evento afirmaria um número mais amplo do que sua prova.
      // Aceitar a evidência de um dos datasets como se sustentasse o todo é
      // exatamente o que o gate proibiu.
      //
      // LIMITAÇÃO REGISTRADA: agregação multi-dataset exige que o contrato de
      // evidência expresse escopo composto. Decisão de arquitetura pendente.
      const escopoLegivel = alvos
        .map(([snap, e]) => `${snap}/${e.dataset_id}`)
        .sort(compareCodeUnits)
        .join(", ")
      problemas.push(
        `agregados: os contratos cobrem ${alvos.length} escopos governados (${escopoLegivel}), ` +
          `mas o localizador de evidência expressa um único dataset_id. ` +
          `Uma evidência de um dataset não sustenta um agregado multi-dataset — falha fechada.`,
      )
    } else if (unico !== undefined) {
      const [snapshotDaAgregacao, escopo] = unico
      if (agregada.snapshot_id !== snapshotDaAgregacao) {
        problemas.push(
          `agregados: evidência ${input.aggregate_evidence_ref} pertence ao snapshot ${agregada.snapshot_id}, ` +
            `mas o agregado é do snapshot ${snapshotDaAgregacao}`,
        )
      }
      if (agregada.locator.dataset_id !== escopo.dataset_id) {
        problemas.push(
          `agregados: evidência ${input.aggregate_evidence_ref} localiza o dataset "${agregada.locator.dataset_id}", ` +
            `mas o agregado é do dataset "${escopo.dataset_id}"`,
        )
      }
    }
    // `alvos.length === 0` significa nenhum contrato governado. Não há agregado
    // a sustentar: sem elegíveis, `motivoNaoMaterial` impede qualquer emissão,
    // então nenhum número executivo é afirmado sem lastro.
  }

  if (input.baseline !== undefined) {
    const evBase = evidencePorId.get(input.baseline.evidence_ref)
    if (evBase === undefined) {
      problemas.push(`baseline: evidência inexistente: ${input.baseline.evidence_ref}`)
    }
    if (input.baseline.source.trim() === "") {
      problemas.push(`baseline: a origem precisa ser identificável`)
    }
  }

  if (problemas.length > 0) {
    throw new GatewayError("SCHEMA_INVALID", "Lastro insuficiente para detectar concentração", problemas)
  }

  return escopos
}

// ─── População ────────────────────────────────────────────────────────────────

interface Particao {
  readonly elegiveis: readonly ContractRecord[]
  readonly acima: readonly ContractRecord[]
  readonly population: Population
}

function particionar(input: InstallmentDetectorInput): Particao {
  const elegiveis: ContractRecord[] = []
  let semContagem = 0
  let naoPositivo = 0

  for (const c of input.contracts) {
    if (c.installment_count === null) {
      // Ausência NÃO é zero parcelas. O contrato sai do denominador e a exclusão
      // é contada — descarte silencioso é indistinguível de bug de coleta.
      semContagem += 1
      continue
    }
    if (!Number.isSafeInteger(c.installment_count) || c.installment_count <= 0) {
      // Regra governada: `installments_grau > 0` no schema `ceo`. Zero é a
      // assinatura das linhas-fantasma da planilha real.
      naoPositivo += 1
      continue
    }
    elegiveis.push(c)
  }

  // Mesmo predicado que gera o texto da fórmula. Divergência é impossível.
  const acima = elegiveis.filter((c) => acimaDoLimiar(c.installment_count ?? 0))

  const total = input.contracts.length
  const eligibilityRatio =
    total === 0
      ? gap<number>("EMPTY_DENOMINATOR", "calculated", "nenhum registro para avaliar")
      : toBp(ratio(observed(elegiveis.length), observed(total), "count(elegiveis) / count(registros)"))

  return {
    elegiveis,
    acima,
    population: {
      total_records: total,
      eligible_contracts: elegiveis.length,
      contracts_above_threshold: acima.length,
      excluded: {
        MISSING_INSTALLMENT_COUNT: semContagem,
        NON_POSITIVE_INSTALLMENT_COUNT: naoPositivo,
      },
      eligibility_ratio_bp: eligibilityRatio,
    },
  }
}

function toBp(m: Metric<{ bps: number }>): Metric<number> {
  return isOk(m) ? observed(m.value.bps) : m
}

/** Soma exata; ausência em QUALQUER parcela torna o total uma lacuna, não zero. */
function somarValores(contratos: readonly ContractRecord[], detalhe: string): Metric<number> {
  if (contratos.some((c) => c.amount_cents === null)) {
    return gap<number>("DATA_NOT_AVAILABLE", "calculated", detalhe)
  }
  const total = sumCents(contratos.map((c) => c.amount_cents ?? 0))
  return total === null
    ? gap<number>("DATA_NOT_AVAILABLE", "calculated", "soma fora da faixa exata")
    : observed(total)
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

/**
 * A regra da faixa mora num lugar só.
 *
 * Antes o limiar vinha da config e as fórmulas traziam `19` escrito à mão. Duas
 * fontes para a mesma regra: bastava a config mudar para o evento publicar uma
 * fórmula que contradizia o próprio número. Agora o predicado e o texto que o
 * descreve derivam da mesma constante governada — divergir exigiria editar esta
 * linha, e `formula-e-calculo.test.ts` falha se alguém editar.
 *
 * `19` NÃO é default nem fallback: é a única regra aprovada, e
 * `validateDetectorConfig` recusa qualquer config que declare outro valor.
 */
export const LIMIAR_APROVADO = APPROVED_THRESHOLDS.installment_threshold

/** Estritamente maior. 19 parcelas não entra na faixa, 20 entra. */
export function acimaDoLimiar(installments: number): boolean {
  return installments > LIMIAR_APROVADO
}

/** O texto que descreve `acimaDoLimiar`, gerado da mesma constante. */
const REGRA_FAIXA = `installments > ${LIMIAR_APROVADO}`

export const FORMULA_SHARE_COUNT = `count(elegiveis where ${REGRA_FAIXA}) / count(elegiveis)`
export const FORMULA_AMOUNT_ABOVE = `sum(amount_cents where ${REGRA_FAIXA})`
export const FORMULA_SHARE_AMOUNT = `sum(amount_cents where ${REGRA_FAIXA}) / sum(amount_cents elegiveis)`

function calcular(p: Particao): ConcentrationMetrics {
  const shareCount =
    p.elegiveis.length === 0
      ? gap<number>("EMPTY_DENOMINATOR", "calculated", "nenhum contrato elegível")
      : toBp(
          ratio(
            observed(p.acima.length),
            observed(p.elegiveis.length),
            FORMULA_SHARE_COUNT,
          ),
        )

  const amountAbove = somarValores(
    p.acima,
    "valor ausente em ao menos um contrato da faixa",
  )
  const amountEligible = somarValores(
    p.elegiveis,
    "valor ausente em ao menos um contrato elegível",
  )

  /**
   * A participação em VALOR só é participação quando o volume se comporta como
   * um todo: denominador positivo e numerador dentro dele.
   *
   * Estorno é dado legítimo e quebra isso. Uma faixa com estorno líquido produz
   * numerador negativo; estornos fora da faixa podem fazer o volume da faixa
   * superar o volume elegível; e um período de estornos pode zerar ou inverter o
   * denominador. Aritmeticamente a divisão existe — como leitura executiva,
   * "a faixa acima de 19 parcelas representa -37% do volume" não significa nada.
   *
   * Como tratar concentração sob volume líquido negativo é regra de negócio que
   * o CEO ainda não definiu. Então é lacuna nomeada, não número. O volume da
   * faixa e o volume elegível continuam sendo publicados em cents, exatos e com
   * sinal — quem decidir a regra terá os dois lados à mão.
   */
  const shareAmount =
    !isOk(amountAbove) || !isOk(amountEligible)
      ? gap<number>("DATA_NOT_AVAILABLE", "calculated", "volume indisponível")
      : amountEligible.value === 0
        ? gap<number>("EMPTY_DENOMINATOR", "calculated", "volume elegível zero")
        : !isPartOfWhole(amountAbove.value, amountEligible.value)
          ? gap<number>(
              "BUSINESS_RULE_PENDING",
              "calculated",
              "volume com sinal misto (estorno): participação em valor exige regra do CEO",
            )
          : toBp(
              ratio(
                observed(amountAbove.value),
                observed(amountEligible.value),
                FORMULA_SHARE_AMOUNT,
              ),
            )

  return {
    share_count_bp: shareCount,
    amount_above_cents: amountAbove,
    amount_eligible_cents: amountEligible,
    share_amount_bp: shareAmount,
  }
}

// ─── Qualidade ────────────────────────────────────────────────────────────────

/**
 * A qualidade do agregado é a MAIS FRACA das dependências.
 *
 * O lattice mora em `quality.ts` e é compartilhado com o Detector C — cada
 * detector com a sua cópia foi exatamente como a versão do C esqueceu de ler
 * `snapshot.quality_status`.
 */
function resolverQualidade(
  input: InstallmentDetectorInput,
  p: Particao,
  m: ConcentrationMetrics,
  config: DetectorConfig,
): Quality {
  const cfg = config.installmentConcentration
  const candidatas: Quality[] = ["ok"]

  for (const s of input.snapshots) candidatas.push(s.quality_status)

  const excluidos =
    p.population.excluded.MISSING_INSTALLMENT_COUNT +
    p.population.excluded.NON_POSITIVE_INSTALLMENT_COUNT
  if (excluidos > 0) candidatas.push("degraded")

  if (!isOk(m.amount_above_cents) || !isOk(m.share_amount_bp)) candidatas.push("degraded")

  // Identidade não resolvida é falha de qualidade, não de cobertura.
  for (const c of input.contracts) {
    if (c.unit.status === "unknown") candidatas.push("degraded")
    else if (c.unit.status === "ambiguous") candidatas.push("conflicted")
  }

  if (input.unit_coverage !== undefined && input.unit_coverage.ratio_bp < cfg.minimum_coverage_bp) {
    candidatas.push("insufficient")
  }

  if (p.elegiveis.length < cfg.minimum_sample_size) candidatas.push("insufficient")

  return piorQualidade(candidatas)
}

// ─── Casos contribuintes ──────────────────────────────────────────────────────

interface CasoContribuinte {
  readonly subject_ref: string
  /**
   * Nome de exibição vindo do CATÁLOGO governado, nunca da fonte.
   *
   * O contrato v1 tem `unit` (nome), não `unit_id`. O rename está na proposta
   * de schema v2 e aguarda o bloqueio B1 — ativá-lo agora exigiria o enum de
   * `UnitId`, que depende do catálogo que o CEO ainda não confirmou. Enquanto
   * isso, o que atravessa é o `display_name` do catálogo: governado, e omitido
   * quando D13 não resolveu. É o resíduo R1 já registrado no THREAT_MODEL.
   */
  readonly unit?: string
  readonly contribution: { amount_cents?: number; count?: number; share_of_event_bp?: number }
  readonly evidence_refs: readonly string[]
}

/**
 * Seleção determinística dos casos que movem o número.
 *
 * Ordenação: valor decrescente, e `subject_ref` como desempate — sem ele, dois
 * contratos de mesmo valor poderiam trocar de posição conforme a ordem de
 * entrada, e a saída deixaria de ser determinística.
 *
 * `unit_id` só entra quando D13 resolveu. Unidade `unknown`/`ambiguous` é
 * OMITIDA — nunca o texto cru da fonte.
 */
function selecionarCasos(
  acima: readonly ContractRecord[],
  totalFaixa: Metric<number>,
  config: DetectorConfig,
): CaseSelection {
  const regra = config.installmentConcentration.contributing_case_rule

  const ordenados = [...acima].sort((a, b) => {
    const va = a.amount_cents ?? 0
    const vb = b.amount_cents ?? 0
    if (va !== vb) return vb - va
    return compareCodeUnits(a.subject_ref, b.subject_ref)
  })

  /**
   * Participação de um caso no volume da faixa — quando isso significa algo.
   *
   * "Parte de um todo" pressupõe que a parte tenha o mesmo sinal do todo e caiba
   * dentro dele. Estorno é dado legítimo e pode quebrar as duas condições: um
   * total de faixa negativo ou próximo de zero produz participação negativa ou
   * acima de 100%, e um estorno entre os contribuintes faz um caso positivo
   * ultrapassar o total. Nesses casos não existe participação — existe um valor.
   *
   * Não clampar: 10000 bp num caso que vale três vezes o total seria um número
   * inventado, e o consumidor não teria como saber. Omitida a participação, o
   * `amount_cents` continua ali, exato.
   */
  const shareDe = (valor: number | null): number | undefined => {
    if (valor === null || !isOk(totalFaixa)) return undefined
    if (!isPartOfWhole(valor, totalFaixa.value)) return undefined
    const r = ratio(observed(valor), observed(totalFaixa.value), "contribuicao / volume_da_faixa")
    return isOk(r) ? r.value.bps : undefined
  }

  const montar = (c: ContractRecord): CasoContribuinte => {
    const share = shareDe(c.amount_cents)
    return {
      subject_ref: c.subject_ref,
      ...(c.unit.status === "matched" ? { unit: c.unit.display_name } : {}),
      contribution: {
        ...(c.amount_cents === null ? { count: 1 } : { amount_cents: c.amount_cents }),
        ...(share === undefined ? {} : { share_of_event_bp: share }),
      },
      // CÓPIA, não a referência do chamador.
      //
      // `c.evidence_refs` pertence ao input. Guardá-la aqui criaria dois
      // problemas de uma vez: o chamador daria `push` nela depois da deteção e
      // alteraria um evento já validado; e o `deepFreeze` final congelaria um
      // array do chamador — efeito colateral sobre quem só pediu uma leitura.
      evidence_refs: [...c.evidence_refs],
    }
  }

  // `top_n` é definida em GRANDEZA ABSOLUTA: ordena por valor e corta em n.
  // Não pergunta participação a ninguém, então sinal misto não a afeta. Continua
  // determinística e não é bloqueada.
  if (regra.mode === "top_n") {
    return { status: "selected", cases: ordenados.slice(0, regra.n).map(montar) }
  }

  // As outras duas estratégias são definidas em PARTICIPAÇÃO. Se a participação
  // não existe, a estratégia não tem como rodar — e rodar com substituto é o
  // fail-open que o gate encontrou.
  const impedimento = participacaoImpedida(ordenados, totalFaixa, shareDe)
  if (impedimento !== undefined) {
    return {
      status: "unavailable",
      reason:
        regra.mode === "until_share_bp"
          ? "CUMULATIVE_SHARE_UNAVAILABLE"
          : "INDIVIDUAL_SHARE_UNAVAILABLE",
      ...impedimento,
    }
  }

  if (regra.mode === "min_individual_share_bp") {
    // Aqui toda participação existe: o filtro compara números reais.
    const escolhidos = ordenados.filter((c) => (shareDe(c.amount_cents) ?? 0) >= regra.share_bp)
    return { status: "selected", cases: escolhidos.map(montar) }
  }

  // until_share_bp: acumula até cobrir a participação pedida. Toda participação
  // desta faixa existe — verificado acima — então o acumulado é o acumulado.
  const escolhidos: ContractRecord[] = []
  let acumulado = 0
  for (const c of ordenados) {
    if (acumulado >= regra.share_bp) break
    escolhidos.push(c)
    acumulado += shareDe(c.amount_cents) ?? 0
  }
  return { status: "selected", cases: escolhidos.map(montar) }
}

/**
 * A participação existe para TODA a faixa? Se não, qual foi o impedimento.
 *
 * Uma participação faltando não é "zero a somar": é o acumulado deixando de ser
 * o acumulado. Por isso a checagem é sobre o conjunto inteiro, não caso a caso —
 * a estratégia cumulativa caminha pela ordem e qualquer buraco no caminho
 * corrompe o total corrente.
 */
function participacaoImpedida(
  casos: readonly ContractRecord[],
  totalFaixa: Metric<number>,
  shareDe: (valor: number | null) => number | undefined,
): { readonly gap_reason: string; readonly detail: string } | undefined {
  if (!isOk(totalFaixa)) {
    return { gap_reason: totalFaixa.gap, detail: "volume da faixa indisponível" }
  }
  if (totalFaixa.value === 0) {
    return { gap_reason: "EMPTY_DENOMINATOR", detail: "volume da faixa zero" }
  }
  if (totalFaixa.value < 0) {
    return {
      gap_reason: "BUSINESS_RULE_PENDING",
      detail: "volume da faixa negativo (estorno): participação exige regra do CEO",
    }
  }
  const semParticipacao = casos.filter((c) => shareDe(c.amount_cents) === undefined).length
  if (semParticipacao > 0) {
    return {
      gap_reason: "BUSINESS_RULE_PENDING",
      detail: `${semParticipacao} de ${casos.length} contratos da faixa sem participação (sinal misto): participação exige regra do CEO`,
    }
  }
  return undefined
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export function detectInstallmentConcentration(
  input: InstallmentDetectorInput,
  config: DetectorConfig,
): ConcentrationResult {
  const escopos = assertPrecondicoes(input)
  const cfg = config.installmentConcentration

  const particao = particionar(input)
  const metrics = calcular(particao)
  const quality = resolverQualidade(input, particao, metrics, config)

  // ── Severidade ─────────────────────────────────────────────────────────────
  //
  // Sobre a dimensão que a CONFIGURAÇÃO escolheu — sem dimensão declarada a
  // config é recusada, então não há caminho implícito.
  //
  // Se essa dimensão é lacuna, `classifySeverity` NÃO é chamada. A escala não
  // recebe substituto: nem 0, nem `info`, nem o valor da outra dimensão. Uma
  // participação que não existe não tem grau, e um grau inventado atravessaria
  // até o Hermes como se fosse medição.
  // Fase 2.7b: `max_available_participation` gradua pela MAIOR participação
  // governada válida, e `severity_dimension` vira o desempate. Sem a estratégia,
  // a dimensão declarada continua fixa — o comportamento anterior.
  const base =
    cfg.severity_strategy === "max_available_participation"
      ? maxAvailableParticipation(
          metrics.share_count_bp,
          metrics.share_amount_bp,
          cfg.severity_dimension,
        )
      : (() => {
          const d =
            cfg.severity_dimension === "share_count_bp"
              ? metrics.share_count_bp
              : metrics.share_amount_bp
          return isOk(d) ? { dimension: cfg.severity_dimension, value: d.value } : null
        })()

  const severity = base === null ? null : classifySeverity(cfg.severity_scale, base.value)
  const dimensaoDaSeveridade = base?.dimension ?? cfg.severity_dimension
  const dimensao =
    dimensaoDaSeveridade === "share_count_bp" ? metrics.share_count_bp : metrics.share_amount_bp

  const shareCount = isOk(metrics.share_count_bp) ? metrics.share_count_bp.value : undefined
  const shareAmount = isOk(metrics.share_amount_bp) ? metrics.share_amount_bp.value : undefined
  const volumeFaixa = isOk(metrics.amount_above_cents) ? metrics.amount_above_cents.value : undefined

  // Materialidade é independente de severidade ser graduável: um fato material
  // por CONTAGEM continua material mesmo sem participação em valor.
  const naoMaterial = motivoNaoMaterial(particao, cfg.minimum_sample_size)
  const material =
    naoMaterial === undefined &&
    (particao.acima.length >= cfg.material_count_above ||
      (shareCount !== undefined && shareCount >= cfg.material_share_count_bp) ||
      (shareAmount !== undefined && shareAmount >= cfg.material_share_amount_bp) ||
      (volumeFaixa !== undefined && volumeFaixa >= cfg.material_amount_cents))

  const emitted = material && severity !== null
  const notEmitted: NotEmittedReason | undefined = emitted
    ? undefined
    : material
      ? "SEVERITY_DIMENSION_UNAVAILABLE"
      : "NOT_MATERIAL"

  // Tentada só quando o evento sai: fora disso não houve seleção a relatar, e
  // inventar um "unavailable" para toda deteção não material seria ruído.
  const selecao = emitted
    ? selecionarCasos(particao.acima, metrics.amount_above_cents, config)
    : undefined

  const summary: ConcentrationSummary = {
    event_id: identidadeDoEvento(input, escopos),
    population: particao.population,
    metrics,
    severity,
    severity_dimension: dimensaoDaSeveridade,
    ...(isOk(dimensao)
      ? {}
      : { severity_gap: participationGap(metrics.share_count_bp, metrics.share_amount_bp) }),
    quality_status: quality,
    material,
    ...(material
      ? {}
      : { non_material_reason: naoMaterial ?? "abaixo de todos os limiares configurados" }),
    emitted,
    ...(notEmitted === undefined ? {} : { not_emitted_reason: notEmitted }),
    ...(selecao === undefined ? {} : { contributing_cases_selection: resumoDaSelecao(selecao) }),
  }

  // `construirEvento` chama `toEvent`, que valida schema + semântica e devolve a
  // MESMA referência. Então a validação acontece aqui, antes do congelamento.
  const event =
    emitted && summary.severity !== null && selecao !== undefined
      ? construirEvento(input, particao, metrics, summary, summary.severity, selecao)
      : null

  // BUILD → VALIDATE → FREEZE → RETURN, nesta ordem e sem cópia no meio.
  //
  // O grafo congelado é exatamente o grafo que a validação examinou. Um clone
  // aqui provaria imutabilidade de um objeto que ninguém recebe.
  //
  // Congelar é seguro porque ownership já está resolvido: tudo alcançável a
  // partir daqui foi construído pelo detector. `evidence_refs` dos casos é
  // cópia, e os demais campos vindos do input são primitivos. Nenhum array ou
  // objeto do chamador é alcançável, então nada do chamador é congelado.
  return deepFreeze({ event, summary })
}

function resumoDaSelecao(s: CaseSelection): CaseSelectionOutcome {
  return s.status === "selected"
    ? { status: "selected", count: s.cases.length }
    : { status: "unavailable", reason: s.reason, gap_reason: s.gap_reason, detail: s.detail }
}

function motivoNaoMaterial(p: Particao, minimo: number): string | undefined {
  if (p.elegiveis.length === 0) return "nenhum contrato elegível"
  if (p.elegiveis.length < minimo) {
    return `amostra de ${p.elegiveis.length} abaixo do mínimo de ${minimo}`
  }
  if (p.acima.length === 0) return "nenhum contrato acima do limiar"
  return undefined
}

/**
 * Identidade lógica do evento.
 *
 * Estruturada, nunca por gramática de delimitador — o gate da Fase 2.2 mostrou
 * o que essa gramática custa. Composta pelo fato, não pela execução: reingerir
 * os mesmos datasets no mesmo período produz o mesmo evento, ainda que os
 * `snapshot_id` mudem.
 */
function identidadeDoEvento(
  input: InstallmentDetectorInput,
  escopos: Map<string, EscopoGovernado>,
): string {
  const datasets = [...escopos.values()]
    .map((e) => ({ source_system: e.source_system, dataset_id: e.dataset_id }))
    .sort(
      (a, b) =>
        compareCodeUnits(a.source_system, b.source_system) ||
        compareCodeUnits(a.dataset_id, b.dataset_id),
    )

  return structuralId(
    "creditum:installment_concentration:v1",
    {
      event_type: "installment_concentration",
      installment_threshold: LIMIAR_APROVADO,
      period_start: input.period_start,
      period_end: input.period_end,
      datasets,
    },
    "evt",
  )
}

function construirEvento(
  input: InstallmentDetectorInput,
  p: Particao,
  m: ConcentrationMetrics,
  s: ConcentrationSummary,
  /** Passada já estreitada: o evento não existe sem grau, e o grau não é opcional. */
  severity: Severity,
  selecao: CaseSelection,
): IntelligenceEvent {
  const snapshotIds = [...new Set(p.elegiveis.map((c) => c.snapshot_id))].sort(compareCodeUnits)

  const refsIndividuais = p.acima.flatMap((c) => [...c.evidence_refs])
  const evidenceRefs = [...new Set([input.aggregate_evidence_ref, ...refsIndividuais])].sort(
    compareCodeUnits,
  )

  // Indisponível => o evento sai SEM casos. Nenhum caso incorreto entra só
  // para a apresentação ficar completa.
  const casos = selecao.status === "selected" ? selecao.cases : []

  const bruto: unknown = {
    event_id: s.event_id,
    event_type: "installment_concentration",
    detector_id: DETECTOR_ID,
    detector_version: DETECTOR_VERSION,
    snapshot_ids: snapshotIds,
    period_start: input.period_start,
    period_end: input.period_end,
    detected_at: input.detected_at,
    severity,
    materiality: materialidade(p, m),
    observed_metric: metricaDeContrato(m.share_count_bp),
    reference_metric: metricaDeBaseline(input.baseline),
    ...(casos.length === 0 ? {} : { contributing_cases: casos }),
    evidence_refs: evidenceRefs,
    data_quality: {
      quality_status: s.quality_status,
      ...(input.unit_coverage === undefined
        ? {}
        : { coverage_ratio_bp: input.unit_coverage.ratio_bp }),
    },
  }

  return toEvent(bruto, { now: new Date(input.detected_at) })
}

function materialidade(p: Particao, m: ConcentrationMetrics): unknown {
  const share = isOk(m.share_amount_bp) ? { share_of_total_bp: m.share_amount_bp.value } : {}

  // Base `amount_cents` quando o volume existe; senão `count`. Nunca declarar
  // uma base sem o campo correspondente.
  if (isOk(m.amount_above_cents)) {
    return {
      basis: "amount_cents",
      amount_cents: m.amount_above_cents.value,
      count: p.acima.length,
      ...share,
    }
  }
  return { basis: "count", count: p.acima.length, ...share }
}

function metricaDeContrato(share: Metric<number>): unknown {
  if (!isOk(share)) {
    return {
      name: "share_contratos_acima_do_limiar",
      data_class: "gap",
      gap_reason: share.gap === "EMPTY_DENOMINATOR" ? "EMPTY_DENOMINATOR" : "DATA_NOT_AVAILABLE",
    }
  }
  return {
    name: "share_contratos_acima_do_limiar",
    data_class: "calculated",
    unit: "basis_points",
    value: share.value,
    formula: FORMULA_SHARE_COUNT,
  }
}

/**
 * Baseline ausente vira LACUNA, nunca zero.
 *
 * O valor `2800 bp` que a fixture da Fase 1 trazia como referência não tem
 * lastro em política de produção. Não é default aqui nem em lugar nenhum.
 */
function metricaDeBaseline(baseline: Baseline | undefined): unknown {
  if (baseline === undefined) {
    return {
      name: "share_contratos_acima_do_limiar_referencia",
      data_class: "gap",
      gap_reason: "DATA_NOT_AVAILABLE",
    }
  }
  return {
    name: "share_contratos_acima_do_limiar_referencia",
    data_class: "observed",
    unit: "basis_points",
    value: baseline.share_count_bp,
  }
}
