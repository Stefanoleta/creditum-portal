/**
 * Política Creditum v1 — projeção do artefato governado em configuração de produção.
 *
 * ─── Por que projeção, e não constantes ───────────────────────────────────────
 *
 * A Fase 2.6c terminou com um HIGH que vale relembrar aqui: três aliases D13
 * viviam numa tabela TypeScript e eram enxertados no catálogo depois do load.
 * Havia duas fontes de governança e a segunda era invisível para quem olhasse a
 * fonte governada. A lição foi direta — valor aprovado da Creditum tem **uma**
 * fonte efetiva, e o runtime projeta, não enriquece.
 *
 * Este módulo aplica a mesma regra à política de negócio. Nenhum threshold da
 * Creditum é escrito aqui. Os números vêm de
 * `governance/policy/creditum-policy.v1.json`; este arquivo sabe validá-los e
 * montar `DetectorConfig`, e recusar quando falta decisão.
 *
 * ─── Não existe DEFAULT_CONFIG ────────────────────────────────────────────────
 *
 * Política ausente ou inválida não cai para um padrão razoável: falha fechado.
 * `TEST_CONFIG` continua em `tests/` e não é alcançável daqui — não há import,
 * nem fallback, nem "se produção falhar use o de teste".
 */

import ARTEFATO from "../../governance/policy/creditum-policy.v1.json"
import { GatewayError } from "../../gateway/src/errors"
import {
  FIRST_DUE_CONTEXT_MODES,
  FIRST_DUE_EVENT_WINDOW_MODES,
  isValidTimezone,
  validateDetectorConfig,
} from "./config"
import type {
  ContributingCaseRule,
  FirstDueEventWindowMode,
  DetectorConfig,
  DueWindow,
  Severity,
  SeverityBand,
  SeverityScale,
} from "./config"

// ─── O artefato ───────────────────────────────────────────────────────────────

export interface PolicyArtifact {
  readonly schema_version: string
  readonly policy_version: string
  readonly materiality: {
    readonly relevant_participation_bp: number
    readonly financial_materiality_cents: number
    readonly financial_materiality_status: string
    readonly relevant_case_count: number
    readonly minimum_population_contracts: number
    readonly semantics: string
  }
  readonly severity_bands: readonly { readonly at_least_bp: number; readonly severity: string }[]
  readonly low_ticket: {
    readonly floor_cents: number
    readonly comparison: string
    readonly severity: string
  }
  readonly coverage: { readonly missing_share_insufficient_at_bp: number }
  readonly source_disagreement: {
    readonly numeric_tolerance_bp: number
    readonly structural_tolerance_bp: number
    readonly structural_fields: readonly string[]
  }
  readonly first_due_windows: {
    readonly approved_event_windows: readonly Record<string, unknown>[]
    readonly context: readonly string[]
    readonly day_basis: string
  }
  readonly single_case_aggregators: readonly string[]
  readonly expected_units: { readonly model: readonly string[]; readonly values_source: string }
  readonly detector_severity: Record<string, Record<string, unknown>>
  readonly detector_config: Record<string, Record<string, unknown>>
}

/**
 * Estratégia de base de severidade. Conjunto FECHADO.
 *
 * `max_available_participation` — usa a MAIOR participação governada válida
 * entre as candidatas. Existe porque escolher permanentemente entre quantidade e
 * valor esconderia metade dos casos: uma data com muitos contratos pequenos e
 * outra com poucos grandes produzem leituras opostas, e nenhuma das duas é
 * "a certa" para todo evento.
 *
 * `share_of_total_when_applicable` — usa `share_of_total_bp` só quando ela tem
 * semântica real de parte-do-todo. Sem base aplicável, o fato sobrevive e o
 * Event não sai.
 */
export type SeverityStrategy = "max_available_participation" | "share_of_total_when_applicable"

export type ParticipationDimension = "share_count_bp" | "share_amount_bp"

export interface ParticipationSeverityPolicy {
  readonly severity_strategy: "max_available_participation"
  readonly candidates: readonly ParticipationDimension[]
  /**
   * Desempate DETERMINÍSTICO e governado.
   *
   * No empate as duas participações são numericamente iguais, então a severidade
   * é a mesma — o que muda é só qual dimensão o evento declara ter graduado.
   * A ordem de entrada nunca decide.
   */
  readonly tie_break_dimension: ParticipationDimension
}

const SCHEMAS_SUPORTADOS = new Set(["1.0.0"])
const SEVERIDADES = new Set(["info", "low", "medium", "high", "critical"])

/**
 * Agregadores aprovados para o Detector D. Conjunto FECHADO.
 *
 * `median`, `max`, `min`, `percentile` e `stddev` NÃO estão aqui e não entram
 * sem nova decisão humana — cada um traz semântica de contrafactual própria.
 */
/**
 * VOCABULÁRIO de agregadores — protocolo, não política.
 *
 * São os nomes que `SingleCaseMetric` fecha e que o Detector D sabe calcular. Um
 * nome fora daqui não tem implementação: recusar é checagem de capacidade, não
 * decisão de negócio.
 *
 * O SUBCONJUNTO habilitado para a Creditum vem do artefato
 * (`single_case_aggregators`) e é projetado em `supported_metrics`. Se o artefato
 * deixar de aprovar `amount_mean_cents`, nada aqui o reintroduz — o detector
 * passa a recusar aquela métrica, e existe teste para isso.
 */
const VOCABULARIO_DE_METRICAS = new Set<string>([
  "amount_sum_cents",
  "amount_mean_cents",
  "case_count",
])

/** Base civil obrigatória: dia útil exige calendário de feriados governado, que não existe. */
/**
 * A base de dias que o runtime IMPLEMENTA. Capacidade, não preferência.
 *
 * `next_n_days` conta dias corridos porque é o único cálculo que existe: dia útil
 * exigiria calendário de feriados governado, que não existe em lugar nenhum do
 * sistema. Uma política pedindo outra base não seria "outra decisão da Creditum"
 * — seria um pedido sem código para atender, e recusar é fail-closed.
 *
 * Os valores de NEGÓCIO das janelas — quantos dias, quais modos, qual contexto —
 * saíram deste arquivo na Fase 2.7 final. Vêm do artefato.
 */
const BASE_DE_DIAS_IMPLEMENTADA = "civil_calendar_days"

/** Vocabulários do protocolo, não da política. Ver `config.ts`. */
const VOCABULARIO_DE_JANELAS = new Set<string>(FIRST_DUE_EVENT_WINDOW_MODES)
const VOCABULARIO_DE_CONTEXTO = new Set<string>(FIRST_DUE_CONTEXT_MODES)

class Recusas {
  readonly list: string[] = []
  add(campo: string, motivo: string): void {
    this.list.push(`${campo}: ${motivo}`)
  }
}

function inteiroExato(v: unknown, campo: string, r: Recusas, min = 0): number | null {
  if (typeof v !== "number" || !Number.isSafeInteger(v)) {
    r.add(campo, "precisa ser inteiro exato")
    return null
  }
  if (v < min) {
    r.add(campo, `precisa ser >= ${min}`)
    return null
  }
  return v
}

function bp(v: unknown, campo: string, r: Recusas): number | null {
  const n = inteiroExato(v, campo, r)
  if (n === null) return null
  if (n > 10000) {
    r.add(campo, "basis points não passam de 10000")
    return null
  }
  return n
}

/**
 * Valida as bandas de severidade da política.
 *
 * Recusa sobreposição, buraco e ordem incoerente. As três seriam ambiguidade
 * executiva: um mesmo valor classificado de duas formas, ou de nenhuma.
 */
function validarBandas(raw: unknown, r: Recusas): SeverityScale | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    r.add("severity_bands", "obrigatória e não vazia")
    return null
  }

  const bandas: SeverityBand[] = []
  let anterior: number | null = null
  let rankAnterior = -1

  for (const [i, banda] of (raw as readonly unknown[]).entries()) {
    const p = `severity_bands[${i}]`
    if (typeof banda !== "object" || banda === null) {
      r.add(p, "precisa ser objeto")
      continue
    }
    const b = banda as Record<string, unknown>
    const at = inteiroExato(b["at_least_bp"], `${p}.at_least_bp`, r)
    const sev = b["severity"]

    if (typeof sev !== "string" || !SEVERIDADES.has(sev)) {
      r.add(`${p}.severity`, `precisa ser uma de ${[...SEVERIDADES].join(", ")}`)
      continue
    }
    if (at === null) continue

    // Buraco: a primeira banda precisa cobrir o piso do domínio.
    if (i === 0 && at !== 0) {
      r.add(`${p}.at_least_bp`, "a primeira banda precisa começar em 0 — senão há valor sem classificação")
    }
    // Sobreposição: duas bandas com o mesmo piso classificam o mesmo valor de
    // duas formas, e o resultado passa a depender da ordem de avaliação.
    if (anterior !== null && at <= anterior) {
      r.add(p, `at_least_bp ${at} não é maior que o da banda anterior (${anterior}) — sobreposição`)
    }
    // Ordem incoerente: severidade que cai enquanto a base sobe inverte a leitura.
    const rank = ["info", "low", "medium", "high", "critical"].indexOf(sev)
    if (rank <= rankAnterior) {
      r.add(p, `severidade ${sev} não é mais grave que a banda anterior — ordem incoerente`)
    }

    anterior = at
    rankAnterior = rank
    bandas.push({ at_least: at, severity: sev as Severity })
  }

  return bandas.length === raw.length ? bandas : null
}

/**
 * Regra de contribuintes: qual estratégia, e o parâmetro que ela exige.
 *
 * `until_share_bp` e `min_individual_share_bp` são estruturalmente aceitas pelo
 * tipo `ContributingCaseRule`, mas **não** são política de produção da Creditum:
 * a decisão de 2.7c §2 recusou `until_share_bp = 8000` explicitamente, e não
 * existe regra Pareto/80% aprovada. Recusar aqui é o que impede um artefato
 * editado de reintroduzi-la por baixo.
 */
function validarRegraDeContribuintes(
  raw: unknown,
  campo: string,
  r: Recusas,
): ContributingCaseRule | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    regraRecusada(campo, "objeto obrigatório", r)
    return null
  }
  const o = raw as Record<string, unknown>
  if (o["strategy"] !== "top_n") {
    regraRecusada(campo, `estratégia não aprovada: ${JSON.stringify(o["strategy"])}`, r)
    return null
  }
  const n = inteiroExato(o["top_n"], `${campo}.top_n`, r, 1)
  if (n === null) return null
  return Object.freeze({ mode: "top_n" as const, n })
}

function regraRecusada(campo: string, motivo: string, r: Recusas): void {
  r.add(campo, `${motivo} — a única estratégia aprovada na v1 é top_n`)
}

/**
 * As janelas EXECUTIVAS do Detector C — validadas como CONJUNTO COMPLETO.
 *
 * ─── O que o gate final encontrou ─────────────────────────────────────────────
 *
 * A versão anterior iterava os membros fornecidos e dizia "cada um é válido".
 * Isso deixava passar um artefato com `same_day` só: a política validava,
 * `POLICY_V1_COMPLETE` continuava `true`, a configuração era montável, e uma
 * análise de produção obrigatória desaparecia em silêncio. Pior, o antigo
 * `diasDaJanelaCorrida` devolvia 7 quando a janela não existia — fabricando o
 * parâmetro de uma janela que a política não aprovava.
 *
 * ─── Como a integridade do conjunto é verificada sem criar segunda fonte ──────
 *
 * A exigência é de TOTALIDADE sobre o vocabulário do protocolo: cada modo que o
 * Detector C sabe executar precisa aparecer no conjunto governado exatamente uma
 * vez. `FIRST_DUE_EVENT_WINDOW_MODES` é vocabulário de contrato — não diz nada
 * sobre o que a Creditum quer, nem carrega parâmetro nenhum. Não existe lista de
 * "janelas requeridas" escrita aqui.
 *
 * O que é NEGÓCIO continua vindo do artefato: `days` é lido, nunca pinado. Um
 * artefato com `days: 6` descreve uma política diferente e o runtime a executa
 * como 6 — o que nenhum código pode fazer é dizer "se não for 7, uso 7".
 *
 * Ordem não significa nada: o conjunto é o conjunto. Duplicata é erro, porque
 * repetir sugeriria um peso que não existe.
 */
function validarJanelasAprovadas(raw: unknown, r: Recusas): readonly DueWindow[] | null {
  const campo = "first_due_windows.approved_event_windows"
  if (!Array.isArray(raw) || raw.length === 0) {
    r.add(campo, "lista não vazia obrigatória")
    return null
  }

  const porModo = new Map<string, DueWindow>()
  let falhou = false

  for (const [i, bruto] of (raw as readonly unknown[]).entries()) {
    const p = `${campo}[${i}]`
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
      r.add(p, "janela precisa ser objeto")
      falhou = true
      continue
    }
    const o = bruto as Record<string, unknown>
    const modo = o["mode"]

    if (typeof modo !== "string" || !VOCABULARIO_DE_JANELAS.has(modo)) {
      // `calendar_month` cai aqui: é modo de CONTEXTO, e promovê-lo a janela
      // executiva criaria um Event que não existe.
      r.add(
        `${p}.mode`,
        `modo não executável: ${JSON.stringify(modo)} — o Detector C executa ` +
          `${FIRST_DUE_EVENT_WINDOW_MODES.join(", ")}`,
      )
      falhou = true
      continue
    }

    if (porModo.has(modo)) {
      r.add(p, `modo ${modo} duplicado — approved_event_windows é um conjunto`)
      falhou = true
      continue
    }

    const janela = construirJanela(modo as FirstDueEventWindowMode, o, p, r)
    if (janela === null) {
      falhou = true
      continue
    }
    porModo.set(modo, janela)
  }

  // TOTALIDADE: cada modo executável tem de estar governado. Ausência é recusa —
  // não "política menor", porque o Detector C teria capacidade sem autorização e
  // ninguém saberia qual análise deixou de rodar.
  for (const modo of FIRST_DUE_EVENT_WINDOW_MODES) {
    if (!porModo.has(modo)) {
      r.add(`${campo}.${modo}`, "janela executável ausente do conjunto governado")
      falhou = true
    }
  }

  if (falhou) return null

  // Ordem estável na projeção, derivada do vocabulário — não da ordem em que o
  // artefato listou. Reordenar o JSON não muda a política nem a saída.
  return Object.freeze(
    FIRST_DUE_EVENT_WINDOW_MODES.map((m) => porModo.get(m)).filter(
      (j): j is DueWindow => j !== undefined,
    ),
  )
}

/** Monta uma janela lendo os parâmetros que o modo exige. Nenhum é presumido. */
function construirJanela(
  modo: FirstDueEventWindowMode,
  o: Record<string, unknown>,
  p: string,
  r: Recusas,
): DueWindow | null {
  if (modo === "same_day") {
    // Não tem parâmetro. Um `days` aqui seria dado sem significado.
    if (o["days"] !== undefined) {
      r.add(`${p}.days`, "same_day não tem parâmetro de dias")
      return null
    }
    return Object.freeze({ mode: "same_day" as const })
  }

  // `days` vem do artefato. Sem pino: 7 é o valor governado hoje, e é o artefato
  // que diz isso — não este arquivo.
  const dias = inteiroExato(o["days"], `${p}.days`, r, 1)
  if (dias === null) return null
  return Object.freeze({ mode: "next_n_days" as const, days: dias })
}

/**
 * Os modos de CONTEXTO — mesmo critério de totalidade.
 *
 * Ausente, vazio, duplicado ou com membro extra é recusa. `calendar_month` nunca
 * é fabricado em runtime: se o artefato não o declarar, a política não carrega.
 */
function validarContexto(raw: unknown, r: Recusas): readonly string[] | null {
  const campo = "first_due_windows.context"
  if (!Array.isArray(raw) || raw.length === 0) {
    r.add(campo, "lista não vazia obrigatória")
    return null
  }

  const vistos = new Set<string>()
  let falhou = false

  for (const [i, v] of (raw as readonly unknown[]).entries()) {
    if (typeof v !== "string" || !VOCABULARIO_DE_CONTEXTO.has(v)) {
      r.add(`${campo}[${i}]`, `contexto não reconhecido: ${JSON.stringify(v)}`)
      falhou = true
      continue
    }
    if (vistos.has(v)) {
      r.add(`${campo}[${i}]`, `contexto ${v} duplicado — context é um conjunto`)
      falhou = true
      continue
    }
    vistos.add(v)
  }

  for (const modo of FIRST_DUE_CONTEXT_MODES) {
    if (!vistos.has(modo)) {
      r.add(`${campo}.${modo}`, "contexto reconhecido ausente do conjunto governado")
      falhou = true
    }
  }

  // PROJEÇÃO dos valores declarados, não reconstrução a partir do vocabulário.
  // Hoje o contexto tem um membro só e as duas formas dão o mesmo resultado; a
  // diferença aparece no dia em que ganhar um segundo, e aí reconstruir do
  // vocabulário deixaria de refletir o artefato.
  return falhou ? null : Object.freeze([...(raw as readonly string[])])
}

// ─── Política validada ────────────────────────────────────────────────────────

export interface CreditumPolicy {
  readonly policy_version: string
  readonly relevant_participation_bp: number
  readonly financial_materiality_cents: number
  readonly relevant_case_count: number
  readonly minimum_population_contracts: number
  readonly severity_scale: SeverityScale
  readonly low_ticket_floor_cents: number
  readonly low_ticket_severity: Severity
  readonly coverage_missing_share_insufficient_at_bp: number
  readonly numeric_tolerance_bp: number
  readonly structural_tolerance_bp: number
  readonly structural_fields: readonly string[]
  readonly single_case_aggregators: readonly string[]
  readonly expected_units_model: readonly string[]
  /** `"UNRESOLVED"` enquanto não houver fonte governada dos valores. */
  readonly expected_units_values_source: string
  readonly installment_severity: ParticipationSeverityPolicy
  readonly first_due_severity: ParticipationSeverityPolicy
  readonly single_case_severity_basis: "share_of_total_bp"
  readonly structural_severity: Severity

  // ── Fase 2.7c: os campos que a configuração de produção exigia ──

  /** Fuso de negócio. Relocado da constante `BUSINESS_TIMEZONE`, valor inalterado. */
  readonly business_timezone: string
  /** Relocado de `APPROVED_THRESHOLDS.similarity_threshold_bp`, valor inalterado. */
  readonly similarity_threshold_bp: number
  /** Relocado do briefing do Bloco 1 §14 Caso A. Comparação é `> 19`. */
  readonly installment_threshold: number

  /**
   * Quantos contribuintes o Event do Detector A publica, e por qual critério.
   *
   * Parâmetro de EXPLICAÇÃO do evento. Não é `relevant_case_count`: ver
   * `assertDistinctFiveFields`.
   */
  readonly contributing_case_rule: ContributingCaseRule

  /**
   * Diferença ABSOLUTA material entre métricas cuja unidade já é basis points.
   *
   * 1000 bp = 10 pontos percentuais. Não é `numeric_tolerance_bp`: aquela é
   * divergência RELATIVA e decide equal/conflict. Ver §5 do briefing 2.7c.
   */
  readonly conflict_material_absolute_bp: number

  /** Mudança contrafactual relativa material, em basis points, avaliada em MAGNITUDE. */
  readonly single_case_material_relative_delta_bp: number
  /** Sempre `true` na v1: a avaliação usa `abs()`, o resultado preserva o sinal. */
  readonly single_case_relative_delta_uses_magnitude: boolean

  /**
   * As janelas EXECUTIVAS aprovadas do Detector C. Conjunto, não sequência.
   *
   * Nenhuma é padrão. A ordem no artefato não carrega significado e não elege
   * uma "primeira". Quem escolhe é a execução, via
   * `buildFirstDueExecutionConfig`.
   */
  readonly first_due_event_windows: readonly DueWindow[]

  /**
   * Leituras aprovadas como CONTEXTO — não geram Event próprio.
   *
   * `calendar_month` está aqui: a semântica fechada do Detector C o trata como
   * contexto de leitura, e promovê-lo a janela executiva criaria um evento que
   * ninguém aprovou.
   */
  readonly first_due_context: readonly string[]
}

const DIMENSOES_DE_PARTICIPACAO = new Set<string>(["share_count_bp", "share_amount_bp"])

/** Valida um bloco de severidade por participação (A e C usam o mesmo formato). */
function validarParticipacao(
  raw: unknown,
  caminho: string,
  r: Recusas,
): ParticipationSeverityPolicy | null {
  if (typeof raw !== "object" || raw === null) {
    r.add(caminho, "obrigatório")
    return null
  }
  const b = raw as Record<string, unknown>

  if (b["severity_strategy"] !== "max_available_participation") {
    r.add(`${caminho}.severity_strategy`, "a estratégia aprovada é max_available_participation")
  }

  const cand = b["candidates"]
  if (!Array.isArray(cand) || cand.length !== 2) {
    r.add(`${caminho}.candidates`, "precisa listar as duas participações governadas")
    return null
  }
  for (const [i, c] of (cand as readonly unknown[]).entries()) {
    if (typeof c !== "string" || !DIMENSOES_DE_PARTICIPACAO.has(c)) {
      r.add(`${caminho}.candidates[${i}]`, `dimensão não governada: ${JSON.stringify(c)}`)
    }
  }

  const desempate = b["tie_break_dimension"]
  if (typeof desempate !== "string" || !DIMENSOES_DE_PARTICIPACAO.has(desempate)) {
    r.add(`${caminho}.tie_break_dimension`, "desempate obrigatório e governado")
    return null
  }
  // Desempatar por uma dimensão que não é candidata seria escolher fora do
  // conjunto — e o empate ficaria sem regra fechada.
  if (!(cand as readonly unknown[]).includes(desempate)) {
    r.add(`${caminho}.tie_break_dimension`, "o desempate precisa ser uma das candidatas")
  }

  return {
    severity_strategy: "max_available_participation",
    candidates: Object.freeze([...(cand as readonly ParticipationDimension[])]),
    tie_break_dimension: desempate as ParticipationDimension,
  }
}

/**
 * Valida o artefato e devolve a política. Recusa em bloco, listando tudo.
 *
 * Não há caminho parcial: política com metade dos campos não roda com a outra
 * metade em default.
 */
export function validateCreditumPolicy(raw: unknown): CreditumPolicy {
  const r = new Recusas()

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new GatewayError("NOT_ALLOWED", "Política Creditum recusada", ["$: precisa ser objeto"])
  }
  const a = raw as Record<string, unknown>

  if (typeof a["schema_version"] !== "string" || !SCHEMAS_SUPORTADOS.has(a["schema_version"])) {
    r.add("schema_version", `não suportada; suportadas: ${[...SCHEMAS_SUPORTADOS].join(", ")}`)
  }
  if (typeof a["policy_version"] !== "string" || !/^\d+\.\d+\.\d+$/.test(a["policy_version"])) {
    r.add("policy_version", "obrigatória, formato x.y.z")
  }

  // ── Materialidade ──
  const m = (a["materiality"] ?? {}) as Record<string, unknown>
  const participacao = bp(m["relevant_participation_bp"], "materiality.relevant_participation_bp", r)
  const financeiro = inteiroExato(
    m["financial_materiality_cents"],
    "materiality.financial_materiality_cents",
    r,
    1,
  )
  const casos = inteiroExato(m["relevant_case_count"], "materiality.relevant_case_count", r, 1)
  const populacao = inteiroExato(
    m["minimum_population_contracts"],
    "materiality.minimum_population_contracts",
    r,
    1,
  )
  // Semântica OR é a decisão aprovada. Outro valor mudaria o significado de
  // "material" sem que ninguém revisasse o código dos detectores.
  if (m["semantics"] !== "OR") {
    r.add("materiality.semantics", "a semântica aprovada é OR")
  }

  // ── Severidade ──
  const escala = validarBandas(a["severity_bands"], r)

  // ── Low-ticket ──
  const lt = (a["low_ticket"] ?? {}) as Record<string, unknown>
  const piso = inteiroExato(lt["floor_cents"], "low_ticket.floor_cents", r, 1)
  if (lt["comparison"] !== "strictly_less_than") {
    r.add("low_ticket.comparison", "a regra aprovada é estritamente menor")
  }
  /**
   * Severidade da regra low-ticket: obrigatória, dentro do vocabulário, e o valor
   * é do ARTEFATO.
   *
   * Até o gate final aqui havia `!== "medium"`. Era pino de valor: `medium` é uma
   * escolha entre severidades todas implementáveis, então duplicá-la no código
   * criava uma segunda autoridade executável — o artefato dizia `medium` e o
   * TypeScript também, e a igualdade era coincidência mantida à mão.
   *
   * A regra continua FIXA no sentido que importa: não deriva das bandas
   * percentuais, nem de participação, nem de valor agregado. Ela é declarada, e
   * quem declara é a política governada.
   */
  const sevLowTicket = lt["severity"]
  if (typeof sevLowTicket !== "string" || !SEVERIDADES.has(sevLowTicket)) {
    r.add(
      "low_ticket.severity",
      `severidade obrigatória, dentro do vocabulário: ${[...SEVERIDADES].join(", ")}`,
    )
  }

  // ── Cobertura ──
  const cov = (a["coverage"] ?? {}) as Record<string, unknown>
  const faltanteInsuficiente = bp(
    cov["missing_share_insufficient_at_bp"],
    "coverage.missing_share_insufficient_at_bp",
    r,
  )
  if (faltanteInsuficiente !== null && faltanteInsuficiente === 0) {
    r.add(
      "coverage.missing_share_insufficient_at_bp",
      "zero tornaria qualquer ausência insuficiente e apagaria a faixa degraded",
    )
  }

  // ── Discordância entre fontes ──
  const sd = (a["source_disagreement"] ?? {}) as Record<string, unknown>
  const tolerancia = bp(sd["numeric_tolerance_bp"], "source_disagreement.numeric_tolerance_bp", r)
  const tolEstrutural = inteiroExato(
    sd["structural_tolerance_bp"],
    "source_disagreement.structural_tolerance_bp",
    r,
  )
  // Tolerância estrutural diferente de zero contradiz a decisão aprovada: data e
  // identidade não têm "diferença pequena".
  if (tolEstrutural !== null && tolEstrutural !== 0) {
    r.add("source_disagreement.structural_tolerance_bp", "campos estruturais têm tolerância ZERO")
  }
  const estruturais = sd["structural_fields"]
  if (!Array.isArray(estruturais) || estruturais.length === 0) {
    r.add("source_disagreement.structural_fields", "lista não vazia obrigatória")
  }

  // ── Janelas do Detector C ──
  const w = (a["first_due_windows"] ?? {}) as Record<string, unknown>
  const janelas = validarJanelasAprovadas(w["approved_event_windows"], r)
  const contexto = validarContexto(w["context"], r)
  if (w["day_basis"] !== BASE_DE_DIAS_IMPLEMENTADA) {
    r.add(
      "first_due_windows.day_basis",
      `precisa ser ${BASE_DE_DIAS_IMPLEMENTADA} — dia útil exigiria calendário de feriados governado`,
    )
  }

  // ── Agregadores do Detector D ──
  const ags = a["single_case_aggregators"]
  if (!Array.isArray(ags) || ags.length === 0) {
    r.add("single_case_aggregators", "lista não vazia obrigatória")
  } else {
    for (const [i, ag] of (ags as readonly unknown[]).entries()) {
      if (typeof ag !== "string" || !VOCABULARIO_DE_METRICAS.has(ag)) {
        r.add(`single_case_aggregators[${i}]`, `agregador não aprovado: ${JSON.stringify(ag)}`)
      }
    }
  }

  // ── expected_units: modelo aprovado, valores não ──
  const eu = (a["expected_units"] ?? {}) as Record<string, unknown>
  const modelo = eu["model"]
  if (!Array.isArray(modelo) || modelo.length === 0) {
    r.add("expected_units.model", "modelo obrigatório")
  }
  if (typeof eu["values_source"] !== "string") {
    r.add("expected_units.values_source", "obrigatório — `UNRESOLVED` é resposta válida")
  }

  // ── Severidade por detector: as quatro decisões fechadas na Fase 2.7b ──
  const ds = (a["detector_severity"] ?? {}) as Record<string, unknown>

  const instSev = validarParticipacao(
    ds["installment_concentration"],
    "detector_severity.installment_concentration",
    r,
  )
  const dueSev = validarParticipacao(
    ds["first_due_concentration"],
    "detector_severity.first_due_concentration",
    r,
  )

  const single = (ds["material_single_case"] ?? {}) as Record<string, unknown>
  if (single["severity_strategy"] !== "share_of_total_when_applicable") {
    r.add(
      "detector_severity.material_single_case.severity_strategy",
      "a estratégia aprovada é share_of_total_when_applicable",
    )
  }
  // `relative_delta_bp` é mudança contrafactual, não participação: pode ser
  // negativa e passar de 10000 bp. Classificá-la pelas bandas de participação
  // seria conflagrar duas grandezas diferentes.
  if (single["basis"] !== "share_of_total_bp") {
    r.add(
      "detector_severity.material_single_case.basis",
      "a base aprovada é share_of_total_bp — relative_delta_bp não é participação",
    )
  }

  const csc = (ds["cross_source_conflict"] ?? {}) as Record<string, unknown>
  /**
   * Severidade de conflito ESTRUTURAL: obrigatória, no vocabulário, valor do
   * artefato.
   *
   * O `!== "medium"` que existia aqui saiu pelo mesmo motivo do low-ticket. O que
   * permanece é a natureza da regra: ela é QUALITATIVA — conflito de data ou de
   * identidade não tem denominador, então a severidade é declarada em vez de
   * calculada. Qual severidade é decisão de negócio, e ela mora no JSON.
   *
   * Tolerância zero continua não significando gravidade máxima; hoje a política
   * declara `medium`. Se um dia declarar outra coisa, isso aparece no diff do
   * artefato e no hash, não numa constante escondida.
   */
  const estrutural = csc["structural_severity"]
  if (typeof estrutural !== "string" || !SEVERIDADES.has(estrutural)) {
    r.add(
      "detector_severity.cross_source_conflict.structural_severity",
      `severidade obrigatória, dentro do vocabulário: ${[...SEVERIDADES].join(", ")}`,
    )
  }

  // ── Configuração por detector: as três decisões fechadas na Fase 2.7c ──
  const dc = (a["detector_config"] ?? {}) as Record<string, unknown>

  const eng = (dc["engine"] ?? {}) as Record<string, unknown>
  if (!isValidTimezone(eng["business_timezone"])) {
    r.add("detector_config.engine.business_timezone", "fuso IANA obrigatório")
  }
  const similaridade = bp(
    eng["similarity_threshold_bp"],
    "detector_config.engine.similarity_threshold_bp",
    r,
  )

  const ic = (dc["installment_concentration"] ?? {}) as Record<string, unknown>
  const parcelas = inteiroExato(
    ic["installment_threshold"],
    "detector_config.installment_concentration.installment_threshold",
    r,
    1,
  )
  // A comparação é parte da regra: `>= 19` e `> 19` classificam o contrato de 19
  // parcelas de formas opostas, e o briefing aprovou "mais de 19".
  if (ic["installment_comparison"] !== "strictly_greater_than") {
    r.add(
      "detector_config.installment_concentration.installment_comparison",
      "a comparação aprovada é strictly_greater_than",
    )
  }
  const regra = validarRegraDeContribuintes(
    ic["contributing_case_rule"],
    "detector_config.installment_concentration.contributing_case_rule",
    r,
  )

  const cc = (dc["cross_source_conflict"] ?? {}) as Record<string, unknown>
  const absolutoBp = bp(
    cc["material_absolute_basis_points"],
    "detector_config.cross_source_conflict.material_absolute_basis_points",
    r,
  )

  const sc = (dc["material_single_case"] ?? {}) as Record<string, unknown>
  // Sem teto de 10000: mudança relativa pode passar de 100%. `bp()` não serve.
  const deltaRelativo = inteiroExato(
    sc["material_relative_delta_bp"],
    "detector_config.material_single_case.material_relative_delta_bp",
    r,
    1,
  )
  if (sc["relative_delta_materiality_uses_magnitude"] !== true) {
    // Sem magnitude, uma queda de 15% no agregado não seria material e um
    // contrafactual negativo relevante desapareceria em silêncio.
    r.add(
      "detector_config.material_single_case.relative_delta_materiality_uses_magnitude",
      "a v1 avalia materialidade relativa em MAGNITUDE",
    )
  }

  if (r.list.length > 0) {
    throw new GatewayError("NOT_ALLOWED", "Política Creditum recusada", r.list)
  }

  return Object.freeze({
    policy_version: a["policy_version"] as string,
    relevant_participation_bp: participacao as number,
    financial_materiality_cents: financeiro as number,
    relevant_case_count: casos as number,
    minimum_population_contracts: populacao as number,
    severity_scale: Object.freeze(escala as SeverityScale),
    low_ticket_floor_cents: piso as number,
    low_ticket_severity: lt["severity"] as Severity,
    coverage_missing_share_insufficient_at_bp: faltanteInsuficiente as number,
    numeric_tolerance_bp: tolerancia as number,
    structural_tolerance_bp: tolEstrutural as number,
    structural_fields: Object.freeze([...(estruturais as readonly string[])]),
    single_case_aggregators: Object.freeze([...(ags as readonly string[])]),
    expected_units_model: Object.freeze([...(modelo as readonly string[])]),
    expected_units_values_source: eu["values_source"] as string,
    installment_severity: instSev as ParticipationSeverityPolicy,
    first_due_severity: dueSev as ParticipationSeverityPolicy,
    single_case_severity_basis: "share_of_total_bp",
    structural_severity: estrutural as Severity,
    business_timezone: eng["business_timezone"] as string,
    similarity_threshold_bp: similaridade as number,
    installment_threshold: parcelas as number,
    contributing_case_rule: regra as ContributingCaseRule,
    conflict_material_absolute_bp: absolutoBp as number,
    single_case_material_relative_delta_bp: deltaRelativo as number,
    single_case_relative_delta_uses_magnitude: true,
    first_due_event_windows: Object.freeze([...(janelas ?? [])]),
    first_due_context: Object.freeze([...(contexto ?? [])]),
  })
}

/** A política de produção em vigor. Projeção do artefato governado. */
export const CREDITUM_POLICY_V1: CreditumPolicy = validateCreditumPolicy(ARTEFATO)

// ─── Cobertura: da política para a primitive existente ────────────────────────

/**
 * Traduz a política de cobertura para os dois limiares que os detectores já usam.
 *
 * A política é escrita em **fração AUSENTE** — a linguagem em que foi aprovada.
 * Os detectores comparam `unit_coverage.ratio_bp`, que é a fração **presente**.
 * A tradução é `ausente = 10000 - presente`, e fica aqui, num lugar só, testada
 * nos limites. Duplicar os números já traduzidos no artefato criaria duas
 * representações da mesma decisão — exatamente o defeito da Fase 2.6c.
 *
 *   ausente = 0                       → cobertura 10000 → ok
 *   0 < ausente < limiar              → degraded
 *   ausente >= limiar                 → insufficient
 *
 * Com o limiar aprovado de 1000 bp: `degraded_below_bp = 10000` (qualquer
 * ausência degrada) e `emit_event_below_bp = 9001` (cobertura de 9000 bp, ou
 * seja 10% ausente, já é insuficiente — o `<` do detector exige o +1).
 */
export function coverageThresholdsFromPolicy(p: CreditumPolicy): {
  degraded_below_bp: number
  emit_event_below_bp: number
} {
  return {
    degraded_below_bp: 10000,
    emit_event_below_bp: 10000 - p.coverage_missing_share_insufficient_at_bp + 1,
  }
}

// ─── O que a política ainda NÃO decide ────────────────────────────────────────

/**
 * O que a Política v1 ainda não decide. **Vazio desde a Fase 2.7b.**
 *
 * A lista existia com quatro campos: as dimensões de severidade de A, C e D, e a
 * severidade estrutural de B. Todas foram decididas — não por afrouxar a
 * validação, mas porque o artefato governado passou a contê-las e a validação
 * ficou mais estrita, não menos.
 *
 * A constante permanece porque o mecanismo continua valendo: a próxima decisão
 * pendente entra aqui e volta a bloquear a configuração de produção.
 */
export const POLICY_DECISIONS_PENDING: readonly string[] = Object.freeze([])

/**
 * Erro de projeção: a política é válida, mas não cobre tudo que produção exige.
 *
 * Existe separado da recusa de política para que o relatório distinga "o
 * artefato está errado" de "o artefato está certo e ainda falta decisão humana".
 */
export function assertProductionPolicyComplete(pendentes: readonly string[]): void {
  if (pendentes.length > 0) {
    throw new GatewayError(
      "NOT_ALLOWED",
      "Configuração de produção incompleta: a Política Creditum v1 não decide estes campos",
      [...pendentes],
    )
  }
}

// ─── Projeção para configuração de produção ───────────────────────────────────

/**
 * Campos de `DetectorConfig` que a Política Creditum v1 **não** decide.
 *
 * **Vazio desde a Fase 2.7c.** A lista tinha três campos e todos foram
 * aprovados: `contributing_case_rule` (top_n 5), `material_absolute_basis_points`
 * (1000 bp) e `material_relative_delta_bp` (1000 bp em magnitude). Nenhum deles
 * saiu daqui por afrouxamento — o artefato governado passou a contê-los e a
 * validação ficou mais estrita.
 *
 * A constante permanece pelo mesmo motivo de `POLICY_DECISIONS_PENDING`: o
 * mecanismo continua valendo e a próxima lacuna volta a bloquear a projeção.
 */
export const PRODUCTION_CONFIG_FIELDS_PENDING: readonly string[] = Object.freeze([])

/**
 * Recusa a projeção enquanto houver campo de configuração sem decisão.
 *
 * Separada da recusa de política de propósito: distingue "o artefato está errado"
 * de "o artefato está certo e a configuração exige um campo que ele não cobre".
 */
export function assertProductionConfigComplete(pendentes: readonly string[]): void {
  if (pendentes.length > 0) {
    throw new GatewayError(
      "NOT_ALLOWED",
      "Configuração de produção incompleta: campos sem decisão governada",
      [...pendentes],
    )
  }
}

/**
 * A janela é escolhida pela EXECUÇÃO. Não existe janela base.
 *
 * A Fase 2.7c tinha uma regra aqui: "a janela base é a única aprovada que
 * dispensa `reference_date`". Foi removida na 2.7c.1, e a razão vale registrar —
 * ausência de `reference_date` é característica de FORMA, não semântica de
 * negócio. Uma limitação do tipo `DetectorConfig`, que comporta uma janela só,
 * estava decidindo qual análise a Creditum executa.
 *
 * A política aprova duas janelas executivas e não elege nenhuma. Quem escolhe é
 * quem executa, e a escolha é explícita.
 */

/** As janelas EXECUTIVAS aprovadas. Conjunto — a ordem não decide nada. */
export function productionFirstDueWindows(
  p: CreditumPolicy = CREDITUM_POLICY_V1,
): readonly DueWindow[] {
  return p.first_due_event_windows
}

/**
 * Os dias corridos da janela `next_n_days` governada.
 *
 * Não existe campo derivado guardando este número. A versão anterior tinha um
 * `first_due_next_n_days` na política validada, alimentado por uma função que
 * devolvia 7 quando a janela faltava — o fallback que o gate final encontrou.
 *
 * Deletar a cópia derivada foi a correção: o valor mora num lugar só, dentro da
 * janela governada, e a validação de totalidade garante que a janela exista.
 * `undefined` aqui só é alcançável com política montada à mão, e é `undefined` —
 * nunca um número inventado.
 */
export function productionNextNDays(p: CreditumPolicy = CREDITUM_POLICY_V1): number | undefined {
  const j = p.first_due_event_windows.find((x) => x.mode === "next_n_days")
  return j !== undefined && j.mode === "next_n_days" ? j.days : undefined
}

/** As leituras aprovadas como CONTEXTO. Não geram Event próprio. */
export function productionFirstDueContext(
  p: CreditumPolicy = CREDITUM_POLICY_V1,
): readonly string[] {
  return p.first_due_context
}

/**
 * A escolha de janela de uma execução do Detector C.
 *
 * União discriminada de propósito: `reference_date` só existe no ramo em que
 * significa alguma coisa. Com um campo opcional solto,
 * `{ window: "same_day", reference_date }` compilaria e a data seria ignorada em
 * silêncio; `{ window: "next_n_days" }` sem data também compilaria, deixando a
 * falta para ser descoberta em runtime.
 *
 * A política define "7 dias corridos". A execução informa "a partir de quando".
 */
export type FirstDueExecution =
  | { readonly window: "same_day" }
  | { readonly window: "next_n_days"; readonly reference_date: string }

const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/

/**
 * Monta a configuração de UMA execução do Detector C.
 *
 * Recusa janela que a política não aprova, e recusa `next_n_days` sem
 * `reference_date` válida. Não existe caminho que devolva configuração com
 * janela presumida: a alternativa a escolher explicitamente é falhar.
 */
export function buildFirstDueExecutionConfig(
  p: CreditumPolicy,
  execution: FirstDueExecution,
): DetectorConfig {
  const base = buildProductionDetectorConfig(p)
  const aprovadas = productionFirstDueWindows(p)

  const janela = aprovadas.find((j) => j.mode === execution.window)
  if (janela === undefined) {
    throw new GatewayError("NOT_ALLOWED", "Janela não aprovada pela Política Creditum v1", [
      `firstDueConcentration.window: ${execution.window} não está nas janelas executivas aprovadas`,
    ])
  }

  if (execution.window === "next_n_days" && !DATA_CIVIL.test(execution.reference_date)) {
    // A política diz quantos dias; ela não sabe, nem pode saber, a partir de que
    // dia esta avaliação conta.
    throw new GatewayError("SCHEMA_INVALID", "reference_date inválida para next_n_days", [
      `reference_date: data civil AAAA-MM-DD obrigatória, recebido ${JSON.stringify(
        execution.reference_date,
      )}`,
    ])
  }

  // Reinjeta a janela e REVALIDA: a projeção não tem passe livre.
  return validateDetectorConfig({
    ...base,
    firstDueConcentration: { ...base.firstDueConcentration, window: janela },
  })
}


/**
 * Monta a configuração de produção a partir da política governada.
 *
 * Cada valor de negócio vem do artefato. O que este código contém é **tradução
 * de forma**, não decisão:
 *
 *   participação relevante   → toda dimensão `*_share_*_bp` dos quatro detectores
 *   materialidade financeira → toda dimensão em centavos
 *   quantidade relevante     → toda dimensão de contagem
 *   população mínima         → amostra mínima e população após remoção
 *   cobertura ausente        → os limiares de cobertura, via a primitive existente
 *
 * Uma dimensão receber o mesmo número que outra não as torna o mesmo campo: são
 * campos independentes que a v1 preencheu com o mesmo valor aprovado, e cada um
 * pode mudar sozinho. É a mesma separação que `assertDistinctFiveFields` prova
 * para os dois "5".
 *
 * O resultado passa por `validateDetectorConfig` — a projeção não tem passe
 * livre. Não existe queda para `TEST_CONFIG`: este módulo não conhece `tests/`.
 */
export function buildProductionDetectorConfig(
  p: CreditumPolicy = CREDITUM_POLICY_V1,
): DetectorConfig {
  assertProductionPolicyComplete(POLICY_DECISIONS_PENDING)
  assertProductionConfigComplete(PRODUCTION_CONFIG_FIELDS_PENDING)

  const cobertura = coverageThresholdsFromPolicy(p)

  return validateDetectorConfig({
    config_version: p.policy_version,
    businessTimezone: p.business_timezone,
    similarity_threshold_bp: p.similarity_threshold_bp,

    installmentConcentration: {
      installment_threshold: p.installment_threshold,
      minimum_sample_size: p.minimum_population_contracts,
      material_count_above: p.relevant_case_count,
      material_share_count_bp: p.relevant_participation_bp,
      material_share_amount_bp: p.relevant_participation_bp,
      material_amount_cents: p.financial_materiality_cents,
      contributing_case_rule: p.contributing_case_rule,
      severity_strategy: p.installment_severity.severity_strategy,
      severity_dimension: p.installment_severity.tie_break_dimension,
      severity_scale: p.severity_scale,
      // Mesma pergunta que `emit_event_below_bp`: abaixo desta cobertura a
      // amostra não sustenta o consolidado. Um segundo número aqui seria uma
      // segunda representação da mesma decisão.
      minimum_coverage_bp: cobertura.emit_event_below_bp,
    },

    crossSourceConflict: {
      material_absolute_count: p.relevant_case_count,
      material_amount_cents: p.financial_materiality_cents,
      material_absolute_basis_points: p.conflict_material_absolute_bp,
      material_relative_difference_bp: p.relevant_participation_bp,
      material_share_bp: p.relevant_participation_bp,
      structural_fields: p.structural_fields,
      severity_by_relative_bp: p.severity_scale,
      structural_severity: p.structural_severity,
    },

    firstDueConcentration: {
      // SEM janela. Ela é parâmetro de EXECUÇÃO: a política aprova duas e não
      // elege nenhuma. `buildFirstDueExecutionConfig` monta a execução; o
      // Detector C recusa se receber configuração sem janela.
      material_count: p.relevant_case_count,
      material_share_count_bp: p.relevant_participation_bp,
      material_amount_cents: p.financial_materiality_cents,
      material_share_amount_bp: p.relevant_participation_bp,
      severity_strategy: p.first_due_severity.severity_strategy,
      severity_dimension: p.first_due_severity.tie_break_dimension,
      severity_scale: p.severity_scale,
      minimum_sample_size: p.minimum_population_contracts,
    },

    materialSingleCase: {
      supported_metrics: p.single_case_aggregators,
      min_population_after_removal: p.minimum_population_contracts,
      material_absolute_delta_cents: p.financial_materiality_cents,
      material_count_delta: p.relevant_case_count,
      material_relative_delta_bp: p.single_case_material_relative_delta_bp,
      material_share_of_total_bp: p.relevant_participation_bp,
      severity_dimension: p.single_case_severity_basis,
      severity_scale: p.severity_scale,
    },

    coverage: cobertura,
  })
}

/**
 * Os dois "5" da Política v1 são campos INDEPENDENTES.
 *
 * `materiality.relevant_case_count` decide se um fato merece atenção;
 * `contributing_case_rule.top_n` decide quantos contribuintes o Event lista para
 * explicar o fato. Valem 5 os dois hoje, e é exatamente por isso que a
 * independência precisa de prova: um `top_n: cfg.material_count_above` passaria
 * em todo teste de valor e amarraria os dois para sempre.
 *
 * Devolve `true` quando mexer num não move o outro. Usada em teste; exportada
 * porque a invariante é do módulo, não da suíte.
 */
export function assertDistinctFiveFields(p: CreditumPolicy): boolean {
  const outro = validateCreditumPolicy({
    ...(ARTEFATO as object),
    materiality: { ...(ARTEFATO as { materiality: object }).materiality, relevant_case_count: 7 },
  })
  const regra = outro.contributing_case_rule
  return (
    outro.relevant_case_count === 7 &&
    regra.mode === "top_n" &&
    regra.n === (p.contributing_case_rule.mode === "top_n" ? p.contributing_case_rule.n : -1)
  )
}

export const POLICY_V1_COMPLETE = POLICY_DECISIONS_PENDING.length === 0
