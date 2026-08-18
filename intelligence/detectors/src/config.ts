/**
 * Configuração dos detectores — validada, fail-closed, sem default inventado.
 *
 * A regra que governa este arquivo: **não existe valor de produção que não tenha
 * lastro documentado no projeto**. Dois têm. Os demais não, e por isso não há
 * `DEFAULT_CONFIG` exportado — uma configuração incompleta não cai para um
 * padrão razoável, ela é recusada.
 *
 * O motivo é o de sempre: um threshold plausível inventado por engenheiro vira
 * política da Creditum no dia em que alguém o encontra num arquivo e assume que
 * foi aprovado. Fica sem padrão até o arquiteto decidir.
 */

import { GatewayError } from "../../gateway/src/errors"

// ─── Valores COM lastro no projeto ────────────────────────────────────────────

/**
 * Os números APROVADOS. Nada além destes é política da Creditum.
 *
 * Não são default: são referência. A configuração continua tendo que declará-los
 * explicitamente — para que a revisão veja o valor, não a ausência dele. A única
 * exceção é `low_ticket_floor_cents`, que é a regra em si e não parâmetro
 * configurável, como o `installment_threshold`.
 *
 * O que NÃO está aqui continua recusado: escala de severidade, dimensão de
 * severidade, patamares de cobertura, tolerância entre fontes, janela do Detector
 * C e agregadores do Detector D. Ver `FASE_2_6_BUSINESS_DECISIONS.md`.
 */
/**
 * Os valores aprovados da Creditum.
 *
 * **Reexportados**, não definidos aqui. Desde a Fase 2.7c.1 eles são derivados
 * de `governance/policy/creditum-policy.v1.json` por `governed-thresholds.ts`.
 * Escrevê-los como literais neste arquivo criava uma segunda fonte executável
 * para a mesma decisão: editar o artefato não movia o runtime, e a igualdade
 * entre os dois lugares era coincidência mantida por atenção humana.
 *
 * O reexport existe para os consumidores antigos. A autoridade é o artefato.
 */
export { APPROVED_THRESHOLDS, BUSINESS_TIMEZONE } from "./governed-thresholds"

import { APPROVED_THRESHOLDS } from "./governed-thresholds"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Severity = "info" | "low" | "medium" | "high" | "critical"

/** Faixa de severidade: a partir de `at_least`, vale `severity`. */
export interface SeverityBand {
  readonly at_least: number
  readonly severity: Severity
}

export type SeverityScale = readonly SeverityBand[]

/**
 * Dimensão sobre a qual a severidade do Detector A é classificada.
 *
 * Precisa ser explícita: participação em QUANTIDADE e participação em VALOR
 * respondem a perguntas diferentes, e misturá-las em silêncio faria "poucos
 * contratos grandes" e "muitos contratos pequenos" receberem a mesma leitura.
 */
export type ConcentrationSeverityDimension = "share_count_bp" | "share_amount_bp"

export interface InstallmentConcentrationConfig {
  /** Único threshold de negócio aprovado deste detector. Comparação é `> 19`. */
  readonly installment_threshold: number
  /** Abaixo disto a amostra é pequena demais para afirmar concentração. */
  readonly minimum_sample_size: number

  // ── Materialidade: três dimensões distintas, nenhuma serve de sinônimo ──
  /** Contagem ABSOLUTA de contratos acima do limiar. */
  readonly material_count_above: number
  /** Participação em QUANTIDADE: contratos acima ÷ contratos elegíveis. */
  readonly material_share_count_bp: number
  /** Participação em VALOR: volume da faixa ÷ volume elegível. */
  readonly material_share_amount_bp: number
  /** Volume ABSOLUTO da faixa, em centavos. */
  readonly material_amount_cents: number

  readonly contributing_case_rule: ContributingCaseRule

  /**
   * Como a base de severidade é escolhida. Ausente = dimensão fixa.
   *
   * `max_available_participation` (Fase 2.7b) gradua pela MAIOR participação
   * governada válida. Neste modo `severity_dimension` continua obrigatória e
   * passa a ser o critério de DESEMPATE — o campo não é ignorado em silêncio.
   */
  readonly severity_strategy?: "max_available_participation"
  /** Dimensão fixa, ou o desempate quando a estratégia é a de máximo. */
  readonly severity_dimension: ConcentrationSeverityDimension
  readonly severity_scale: SeverityScale

  /** Abaixo desta cobertura de unidades, a amostra não sustenta o consolidado. */
  readonly minimum_coverage_bp: number
}

export type ContributingCaseRule =
  | { readonly mode: "top_n"; readonly n: number }
  | { readonly mode: "until_share_bp"; readonly share_bp: number }
  | { readonly mode: "min_individual_share_bp"; readonly share_bp: number }

/**
 * Materialidade de conflito — três dimensões DISTINTAS.
 *
 * A versão anterior usava um único `material_share_bp` para duas grandezas
 * diferentes, e isso é erro dimensional, não de nomenclatura:
 *
 *   `1000 bp` vs `2500 bp` tem **diferença absoluta** de 1500 bp e **divergência
 *   relativa** de 6000 bp. Comparar a primeira contra um limiar pensado para a
 *   segunda esconde o conflito; comparar `0` vs `2000` contra o mesmo limiar o
 *   torna material por coincidência numérica.
 *
 * Cada dimensão tem agora seu campo, e nenhum serve de sinônimo do outro.
 */
export interface CrossSourceConflictConfig {
  /** (A) Diferença ABSOLUTA, na unidade da métrica. */
  readonly material_absolute_count: number
  readonly material_amount_cents: number
  /** Diferença absoluta entre métricas cuja UNIDADE já é basis points. */
  readonly material_absolute_basis_points: number

  /**
   * (B) Divergência RELATIVA entre as versões: amplitude ÷ maior versão.
   * Mede "quanto as fontes discordam entre si".
   */
  readonly material_relative_difference_bp: number

  /**
   * (C) Participação da amplitude num TOTAL real do período.
   * Só existe quando a disputa declara `total_for_share`. Mede "quanto a
   * divergência pesa no consolidado" — pergunta diferente de (B).
   */
  readonly material_share_bp: number

  /**
   * Campos onde qualquer divergência é material, independentemente do tamanho.
   * Data de venda e identidade não têm "diferença pequena": ou batem ou não.
   */
  readonly structural_fields: readonly string[]

  /**
   * Escala de severidade sobre uma medida RELATIVA em basis points.
   *
   * Classifica `share_of_total_bp` quando existe total real, senão
   * `relative_difference_bp`. As duas são relativas e em bp — mesma dimensão,
   * então a mesma escala é legítima. Diferença absoluta NÃO entra aqui.
   */
  readonly severity_by_relative_bp: SeverityScale

  /**
   * Severidade de conflito estrutural (data, identidade).
   *
   * Existe porque a escala acima é relativa, e divergência de data não tem
   * denominador — a diferença é em dias, não em proporção. Sem este campo o
   * detector teria que inventar uma conversão.
   */
  /**
   * Ausente enquanto a política não decidir.
   *
   * Fase 2.7: as bandas aprovadas são relativas, e conflito estrutural não tem
   * denominador. Sem valor governado, o caminho estrutural emite sem severidade
   * em vez de receber uma fabricada.
   */
  readonly structural_severity?: Severity
}

/**
 * Alvo de concentração. Conjunto FECHADO — nenhuma heurística de "semana crítica".
 *
 * `same_day`      o dia isolado mais concentrado. Não precisa de referência.
 * `calendar_month` o mês calendário deslocado a partir da data de referência.
 * `next_n_days`   os próximos N dias corridos, referência inclusive.
 *
 * As duas últimas exigem `reference_date` explícita na entrada: `Date.now` faria
 * o mesmo dado produzir eventos diferentes conforme a hora da execução.
 *
 * Dias ÚTEIS não estão aqui de propósito: exigiriam calendário de feriados
 * governado, que não existe.
 */
/**
 * Vocabulário das janelas EXECUTIVAS do Detector C — protocolo, não política.
 *
 * Define os modos que o detector sabe executar como alvo de Event. É vocabulário
 * de contrato: `same_day` e `next_n_days` são os dois modos implementados, e um
 * terceiro nome não teria código para rodar.
 *
 * Não confundir com a POLÍTICA. Quais janelas a Creditum aprova, e com qual
 * parâmetro, vem de `governance/policy/creditum-policy.v1.json`. Aqui não há
 * número nenhum, e não há afirmação sobre o que a Creditum quer.
 */
export type FirstDueEventWindowMode = "same_day" | "next_n_days"

/**
 * Vocabulário dos modos de CONTEXTO. Também protocolo.
 *
 * `calendar_month` é leitura de contexto: o Detector C não emite Event por mês
 * calendário, e promovê-lo a janela executiva exigiria comportamento que não
 * existe.
 */
export type FirstDueContextMode = "calendar_month"

/**
 * Companheiros de runtime dos dois vocabulários acima.
 *
 * `Record<Modo, true>` é o que impede deriva: se um modo entrar no tipo e não
 * aqui, o TypeScript reclama de propriedade faltando; se entrar aqui e não no
 * tipo, reclama de propriedade excedente. Uma lista literal solta poderia
 * divergir do tipo em silêncio.
 */
const MODOS_DE_JANELA: Readonly<Record<FirstDueEventWindowMode, true>> = Object.freeze({
  same_day: true,
  next_n_days: true,
})

const MODOS_DE_CONTEXTO: Readonly<Record<FirstDueContextMode, true>> = Object.freeze({
  calendar_month: true,
})

export const FIRST_DUE_EVENT_WINDOW_MODES: readonly FirstDueEventWindowMode[] = Object.freeze(
  Object.keys(MODOS_DE_JANELA) as FirstDueEventWindowMode[],
)

export const FIRST_DUE_CONTEXT_MODES: readonly FirstDueContextMode[] = Object.freeze(
  Object.keys(MODOS_DE_CONTEXTO) as FirstDueContextMode[],
)

export type DueWindow =
  | { readonly mode: "same_day" }
  | { readonly mode: "calendar_month"; readonly months_ahead: number }
  | { readonly mode: "next_n_days"; readonly days: number }

/**
 * Dimensão sobre a qual a severidade do Detector C é classificada.
 *
 * Participação em QUANTIDADE e em VALOR respondem a perguntas diferentes: uma
 * data com muitos contratos pequenos e uma data com poucos contratos grandes
 * produzem leituras opostas. Escolher em silêncio faria uma se passar pela outra.
 */
export type FirstDueSeverityDimension = "share_count_bp" | "share_amount_bp"

export interface FirstDueConcentrationConfig {
  /**
   * A janela avaliada nesta EXECUÇÃO. Opcional na configuração, obrigatória para
   * rodar.
   *
   * A Política Creditum v1 aprova DUAS janelas executivas — `same_day` e
   * `next_n_days: 7` — e nenhuma delas é padrão. Carregar uma delas aqui como
   * valor fixo faria a forma do tipo escolher qual análise a Creditum executa,
   * que é decisão de negócio, não de estrutura de dado.
   *
   * Quem monta a execução é `buildFirstDueExecutionConfig`. Configuração sem
   * janela chegando ao Detector C é recusa, nunca queda para uma janela padrão.
   */
  readonly window?: DueWindow

  // ── Materialidade: quatro dimensões distintas, nenhuma é sinônimo ──
  /** Contagem ABSOLUTA de contratos vencendo no alvo. */
  readonly material_count: number
  /** Participação em QUANTIDADE: contratos no alvo ÷ elegíveis. */
  readonly material_share_count_bp: number
  /** Valor ABSOLUTO exposto no alvo, em centavos. */
  readonly material_amount_cents: number
  /** Participação em VALOR: valor no alvo ÷ valor elegível. */
  readonly material_share_amount_bp: number

  /**
   * Como a base de severidade é escolhida. Ausente = dimensão fixa.
   *
   * `max_available_participation` (Fase 2.7b) gradua pela MAIOR participação
   * governada válida; `severity_dimension` vira o critério de DESEMPATE.
   */
  readonly severity_strategy?: "max_available_participation"
  /** Dimensão fixa, ou o desempate quando a estratégia é a de máximo. */
  readonly severity_dimension: FirstDueSeverityDimension
  readonly severity_scale: SeverityScale

  /** Abaixo disto a amostra é pequena demais para afirmar concentração. */
  readonly minimum_sample_size: number
}

/**
 * Métrica agregada sobre a qual o impacto de um caso é medido. Conjunto FECHADO.
 *
 * Não existe mecanismo genérico por nome de campo: cada métrica traz uma
 * semântica própria de participação e de qualidade, e um `Record<string,
 * unknown>` esconderia justamente isso.
 */
export type SingleCaseMetric = "amount_sum_cents" | "amount_mean_cents" | "case_count"

/**
 * Dimensão sobre a qual a severidade do Detector D é classificada.
 *
 * `relative_delta_bp` e `share_of_total_bp` são coisas diferentes, ainda que as
 * duas se expressem em basis points:
 *
 *   relative_delta_bp   quanto o agregado MUDA se o caso sair (base: sem o caso)
 *   share_of_total_bp   quanto o caso REPRESENTA do total (base: com o caso)
 *
 * Um caso que dobra a média tem `relative_delta_bp = 10000` e pode ter
 * participação pequena. Um caso que é metade do volume tem
 * `share_of_total_bp = 5000` e pode mover pouco o agregado se o resto for
 * homogêneo. Escolher em silêncio faria as duas leituras se passarem uma pela
 * outra.
 */
export type SingleCaseSeverityDimension = "relative_delta_bp" | "share_of_total_bp"

export interface MaterialSingleCaseConfig {
  /**
   * Métricas que este detector aceita analisar. Precisa ser não-vazia, e a
   * métrica pedida na entrada tem de estar aqui — pedir uma métrica fora da
   * lista é recusa, não escolha silenciosa de outra.
   */
  readonly supported_metrics: readonly SingleCaseMetric[]

  /**
   * Mínimo de casos que a população precisa manter DEPOIS da remoção.
   *
   * Remover o único caso deixa população vazia: média de nada não é zero, é
   * `EMPTY_DENOMINATOR`. A primitive contrafactual já impõe isso; este número
   * define quão pequena a população pode ficar e ainda sustentar a afirmação.
   */
  readonly min_population_after_removal: number

  // ── Materialidade: três dimensões distintas, nenhuma é sinônimo da outra ──
  /**
   * Delta ABSOLUTO das métricas MONETÁRIAS, em centavos.
   *
   * Não serve para contagem: comparar "1 caso" contra um limiar em centavos
   * trataria um caso como um centavo, e a política monetária decidiria se um
   * evento de contagem sai. Unidades diferentes, limiares diferentes.
   */
  readonly material_absolute_delta_cents: number
  /** Delta ABSOLUTO da métrica de CONTAGEM, em casos. Nunca convertido em dinheiro. */
  readonly material_count_delta: number
  /** Mudança RELATIVA do agregado, em basis points. Pode ser negativa ou >10000. */
  readonly material_relative_delta_bp: number
  /** PARTICIPAÇÃO do caso no total, em basis points. Só existe se for parte-do-todo. */
  readonly material_share_of_total_bp: number

  /** Qual das duas dimensões governa a severidade. Sem default. */
  readonly severity_dimension: SingleCaseSeverityDimension
  readonly severity_scale: SeverityScale
}

export interface CoverageConfig {
  readonly degraded_below_bp: number
  readonly emit_event_below_bp: number
}

export interface DetectorConfig {
  readonly config_version: string
  /** IANA. Nunca o fuso da máquina. */
  readonly businessTimezone: string
  readonly similarity_threshold_bp: number
  readonly installmentConcentration: InstallmentConcentrationConfig
  readonly crossSourceConflict: CrossSourceConflictConfig
  readonly firstDueConcentration: FirstDueConcentrationConfig
  readonly materialSingleCase: MaterialSingleCaseConfig
  readonly coverage: CoverageConfig
}

// ─── Validação ────────────────────────────────────────────────────────────────

const SEVERITIES: readonly Severity[] = ["info", "low", "medium", "high", "critical"]
const SEMVER = /^\d+\.\d+\.\d+$/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

class ConfigIssues {
  readonly list: string[] = []

  add(path: string, message: string): void {
    this.list.push(`${path}: ${message}`)
  }

  requirePositiveInt(value: unknown, path: string, min = 0): number | null {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      this.add(path, "obrigatório e precisa ser inteiro exato")
      return null
    }
    if (value < min) {
      this.add(path, `precisa ser >= ${min}`)
      return null
    }
    return value
  }

  requireBp(value: unknown, path: string): number | null {
    const n = this.requirePositiveInt(value, path)
    if (n === null) return null
    if (n > 10000) {
      this.add(path, "basis points não podem passar de 10000")
      return null
    }
    return n
  }
}

/**
 * Fuso horário: precisa ser IANA reconhecido pelo runtime.
 *
 * `Intl.DateTimeFormat` lança `RangeError` para zona desconhecida — é a única
 * verificação confiável, e ela não depende do fuso da máquina.
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function validateSeverityScale(raw: unknown, path: string, issues: ConfigIssues): void {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add(path, "escala de severidade obrigatória e não vazia")
    return
  }

  // `Array.isArray` sobre `unknown` narrowa para `any[]`. Reafirmar como
  // `unknown[]` mantém a checagem ligada dentro do laço.
  const value: readonly unknown[] = raw

  let anterior: number | null = null
  value.forEach((banda, i) => {
    const p = `${path}[${i}]`
    if (!isPlainObject(banda)) {
      issues.add(p, "banda precisa ser objeto")
      return
    }
    const at = issues.requirePositiveInt(banda["at_least"], `${p}.at_least`)
    if (!SEVERITIES.includes(banda["severity"] as Severity)) {
      issues.add(`${p}.severity`, `precisa ser uma de ${SEVERITIES.join(", ")}`)
    }
    // Escala não monotônica é ambígua: dois valores poderiam classificar o mesmo
    // número de formas diferentes conforme a ordem de avaliação.
    if (at !== null && anterior !== null && at <= anterior) {
      issues.add(p, "as bandas precisam ser estritamente crescentes por at_least")
    }
    if (at !== null) anterior = at
  })

  const primeira = value[0]
  if (isPlainObject(primeira) && primeira["at_least"] !== 0) {
    issues.add(`${path}[0].at_least`, "a primeira banda precisa começar em 0 para cobrir todo o domínio")
  }
}

const SINGLE_CASE_METRICS: readonly SingleCaseMetric[] = [
  "amount_sum_cents",
  "amount_mean_cents",
  "case_count",
]

/** Lista fechada e não-vazia. Métrica fora dela é recusa, não fallback. */
function validateSupportedMetrics(value: unknown, path: string, issues: ConfigIssues): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.add(path, "lista não-vazia de métricas suportadas")
    return
  }
  for (const [i, m] of value.entries()) {
    if (!SINGLE_CASE_METRICS.includes(m as SingleCaseMetric)) {
      issues.add(`${path}[${i}]`, `métrica desconhecida: ${String(m)}`)
    }
  }
}

function validateContributingCaseRule(value: unknown, path: string, issues: ConfigIssues): void {
  if (!isPlainObject(value)) {
    issues.add(path, "regra de caso contribuinte obrigatória")
    return
  }
  const mode = value["mode"]
  if (mode === "top_n") {
    issues.requirePositiveInt(value["n"], `${path}.n`, 1)
  } else if (mode === "until_share_bp" || mode === "min_individual_share_bp") {
    issues.requireBp(value["share_bp"], `${path}.share_bp`)
  } else {
    issues.add(`${path}.mode`, "precisa ser top_n, until_share_bp ou min_individual_share_bp")
  }
}

function validateWindow(value: unknown, path: string, issues: ConfigIssues): void {
  if (!isPlainObject(value)) {
    issues.add(path, "janela obrigatória")
    return
  }
  const mode = value["mode"]
  if (mode === "same_day") {
    // Não tem parâmetro: o alvo é o dia isolado mais concentrado.
    return
  }
  if (mode === "calendar_month") {
    // `months_ahead: 0` é o mês da própria referência — legítimo, então o mínimo
    // é zero e não um.
    if (!Number.isSafeInteger(value["months_ahead"]) || (value["months_ahead"] as number) < 0) {
      issues.add(`${path}.months_ahead`, "inteiro exato >= 0")
    }
    return
  }
  if (mode === "next_n_days") {
    issues.requirePositiveInt(value["days"], `${path}.days`, 1)
    return
  }
  issues.add(`${path}.mode`, "precisa ser same_day, calendar_month ou next_n_days")
}

/**
 * Valida e devolve a configuração, ou aborta.
 *
 * Não há caminho parcial: uma configuração com metade dos campos não roda com a
 * outra metade em default.
 */
export function validateDetectorConfig(raw: unknown): DetectorConfig {
  const issues = new ConfigIssues()

  if (!isPlainObject(raw)) {
    throw new GatewayError("NOT_ALLOWED", "Configuração de detectores recusada", [
      "$: configuração precisa ser um objeto",
    ])
  }

  if (typeof raw["config_version"] !== "string" || !SEMVER.test(raw["config_version"])) {
    issues.add("config_version", "obrigatório, formato x.y.z")
  }

  if (!isValidTimezone(raw["businessTimezone"])) {
    issues.add("businessTimezone", "fuso IANA obrigatório e reconhecido pelo runtime")
  }

  issues.requireBp(raw["similarity_threshold_bp"], "similarity_threshold_bp")

  // ── installmentConcentration ──
  const inst = raw["installmentConcentration"]
  if (!isPlainObject(inst)) {
    issues.add("installmentConcentration", "obrigatório")
  } else {
    // O limiar de parcelas é INVARIANTE GOVERNADA, não parâmetro.
    //
    // `19` vem do briefing do Bloco 1 §14 Caso A e é a única regra de faixa
    // aprovada. Aceitar 20 aqui deixaria a config suprimir concentração real —
    // e o detector publicaria uma fórmula contradizendo o próprio número.
    // Enquanto não houver nova decisão de negócio, qualquer outro valor é
    // recusado. Isto NÃO é default: config sem o campo também é recusada.
    if (inst["installment_threshold"] !== APPROVED_THRESHOLDS.installment_threshold) {
      issues.add(
        "installmentConcentration.installment_threshold",
        `precisa ser exatamente ${APPROVED_THRESHOLDS.installment_threshold} — regra de negócio aprovada, não parâmetro configurável`,
      )
    }
    issues.requirePositiveInt(inst["minimum_sample_size"], "installmentConcentration.minimum_sample_size", 1)
    issues.requirePositiveInt(inst["material_count_above"], "installmentConcentration.material_count_above")
    issues.requireBp(inst["material_share_count_bp"], "installmentConcentration.material_share_count_bp")
    issues.requireBp(inst["material_share_amount_bp"], "installmentConcentration.material_share_amount_bp")
    issues.requirePositiveInt(inst["material_amount_cents"], "installmentConcentration.material_amount_cents")
    issues.requireBp(inst["minimum_coverage_bp"], "installmentConcentration.minimum_coverage_bp")
    if (inst["severity_dimension"] !== "share_count_bp" && inst["severity_dimension"] !== "share_amount_bp") {
      issues.add(
        "installmentConcentration.severity_dimension",
        "precisa ser share_count_bp ou share_amount_bp — a política não pode ficar implícita",
      )
    }
    validateContributingCaseRule(
      inst["contributing_case_rule"],
      "installmentConcentration.contributing_case_rule",
      issues,
    )
    validateSeverityScale(
      inst["severity_scale"],
      "installmentConcentration.severity_scale",
      issues,
    )
    // Conjunto fechado: estratégia desconhecida é recusa, não escolha silenciosa.
    if (
      inst["severity_strategy"] !== undefined &&
      inst["severity_strategy"] !== "max_available_participation"
    ) {
      issues.add("installmentConcentration.severity_strategy", "única estratégia conhecida: max_available_participation")
    }
  }

  // ── crossSourceConflict ──
  const conf = raw["crossSourceConflict"]
  if (!isPlainObject(conf)) {
    issues.add("crossSourceConflict", "obrigatório")
  } else {
    issues.requirePositiveInt(conf["material_absolute_count"], "crossSourceConflict.material_absolute_count")
    issues.requirePositiveInt(conf["material_amount_cents"], "crossSourceConflict.material_amount_cents")
    issues.requireBp(
      conf["material_absolute_basis_points"],
      "crossSourceConflict.material_absolute_basis_points",
    )
    issues.requireBp(
      conf["material_relative_difference_bp"],
      "crossSourceConflict.material_relative_difference_bp",
    )
    issues.requireBp(conf["material_share_bp"], "crossSourceConflict.material_share_bp")
    if (!Array.isArray(conf["structural_fields"])) {
      issues.add("crossSourceConflict.structural_fields", "obrigatório (pode ser lista vazia)")
    }
    // Opcional por decisão de política: quando presente precisa ser válida;
    // quando ausente, o detector falha fechado naquele caminho.
    if (
      conf["structural_severity"] !== undefined &&
      !SEVERITIES.includes(conf["structural_severity"] as Severity)
    ) {
      issues.add("crossSourceConflict.structural_severity", `precisa ser uma de ${SEVERITIES.join(", ")}`)
    }
    validateSeverityScale(conf["severity_by_relative_bp"], "crossSourceConflict.severity_by_relative_bp", issues)
  }

  // ── firstDueConcentration ──
  const due = raw["firstDueConcentration"]
  if (!isPlainObject(due)) {
    issues.add("firstDueConcentration", "obrigatório")
  } else {
    // Ausente é legítimo: janela é parâmetro de EXECUÇÃO. Presente, é validada —
    // uma janela malformada continua sendo erro de configuração.
    if (due["window"] !== undefined) {
      validateWindow(due["window"], "firstDueConcentration.window", issues)
    }
    issues.requirePositiveInt(due["material_count"], "firstDueConcentration.material_count")
    issues.requireBp(due["material_share_count_bp"], "firstDueConcentration.material_share_count_bp")
    issues.requirePositiveInt(
      due["material_amount_cents"],
      "firstDueConcentration.material_amount_cents",
    )
    issues.requireBp(due["material_share_amount_bp"], "firstDueConcentration.material_share_amount_bp")
    issues.requirePositiveInt(due["minimum_sample_size"], "firstDueConcentration.minimum_sample_size", 1)
    if (
      due["severity_dimension"] !== "share_count_bp" &&
      due["severity_dimension"] !== "share_amount_bp"
    ) {
      issues.add(
        "firstDueConcentration.severity_dimension",
        "precisa ser share_count_bp ou share_amount_bp — a política não pode ficar implícita",
      )
    }
    validateSeverityScale(due["severity_scale"], "firstDueConcentration.severity_scale", issues)
    // Conjunto fechado: estratégia desconhecida é recusa, não escolha silenciosa.
    if (
      due["severity_strategy"] !== undefined &&
      due["severity_strategy"] !== "max_available_participation"
    ) {
      issues.add("firstDueConcentration.severity_strategy", "única estratégia conhecida: max_available_participation")
    }
  }

  // ── materialSingleCase ──
  const single = raw["materialSingleCase"]
  if (!isPlainObject(single)) {
    issues.add("materialSingleCase", "obrigatório")
  } else {
    issues.requirePositiveInt(
      single["min_population_after_removal"],
      "materialSingleCase.min_population_after_removal",
      1,
    )
    issues.requirePositiveInt(
      single["material_absolute_delta_cents"],
      "materialSingleCase.material_absolute_delta_cents",
    )
    // Obrigatório de forma independente: se `case_count` está habilitado e este
    // limiar falta, a config é recusada. Sem default, sem conversão de unidade.
    issues.requirePositiveInt(
      single["material_count_delta"],
      "materialSingleCase.material_count_delta",
      1,
    )
    // Mudança RELATIVA não é participação: pode ser negativa (remover um estorno
    // levanta o agregado) e pode passar de 10000 bp (um caso que triplica a
    // média). Validar como basis_points — 0..10000 — recusaria limiares
    // legítimos, que é o defeito dimensional que o stub da Fase 2.1 tinha.
    if (!Number.isSafeInteger(single["material_relative_delta_bp"])) {
      issues.add(
        "materialSingleCase.material_relative_delta_bp",
        "inteiro exato em basis points; pode ser negativo ou maior que 10000 — é mudança relativa, não participação",
      )
    }
    // Participação, por outro lado, é 0..10000 por construção.
    issues.requireBp(
      single["material_share_of_total_bp"],
      "materialSingleCase.material_share_of_total_bp",
    )
    validateSupportedMetrics(single["supported_metrics"], "materialSingleCase.supported_metrics", issues)
    if (
      single["severity_dimension"] !== "relative_delta_bp" &&
      single["severity_dimension"] !== "share_of_total_bp"
    ) {
      issues.add(
        "materialSingleCase.severity_dimension",
        "precisa ser relative_delta_bp ou share_of_total_bp — a política não pode ficar implícita",
      )
    }
    validateSeverityScale(single["severity_scale"], "materialSingleCase.severity_scale", issues)
  }

  // ── coverage ──
  const cov = raw["coverage"]
  if (!isPlainObject(cov)) {
    issues.add("coverage", "obrigatório")
  } else {
    const degraded = issues.requireBp(cov["degraded_below_bp"], "coverage.degraded_below_bp")
    const emit = issues.requireBp(cov["emit_event_below_bp"], "coverage.emit_event_below_bp")
    if (degraded !== null && emit !== null && emit > degraded) {
      issues.add(
        "coverage.emit_event_below_bp",
        "emitir evento com cobertura MAIOR do que a que já degrada é incoerente",
      )
    }
  }

  if (issues.list.length > 0) {
    throw new GatewayError("NOT_ALLOWED", "Configuração de detectores recusada", issues.list)
  }

  return Object.freeze(raw as unknown as DetectorConfig)
}
