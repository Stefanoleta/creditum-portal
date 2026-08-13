// Álgebra de métricas — a regra absoluta de confiabilidade (§3), no tipo.
//
// O objetivo deste módulo é tornar IMPOSSÍVEL, por tipagem, os erros que
// destroem a confiança num painel executivo:
//
//   1. ausência virar zero
//   2. dado observado se misturar com previsão
//   3. divisão por denominador vazio produzir 0% em vez de "não sei"
//   4. um número aparecer sem que se possa dizer de onde veio
//   5. um agregado incompleto se passar por completo
//
// Nada aqui é opinião de UI: é o contrato que a UI é obrigada a respeitar,
// porque `Metric<T>` não expõe `.value` sem antes passar por `ok`.

import { sumCents } from "./parse"

// ─── Classificação ────────────────────────────────────────────────────────────

export type DataClass =
  /** veio da fonte, sem transformação de significado */
  | "observed"
  /** derivado por código determinístico e testado */
  | "calculated"
  /** classificação semântica (ex. motivo de perda por IA) */
  | "inferred"
  /** projeção — nunca apresentada como fato */
  | "forecast"

/** Por que um número não está disponível. Nunca substituído por zero. */
export type Gap =
  | "DATA_NOT_AVAILABLE"
  | "DATA_CONFLICT"
  | "LOW_CONFIDENCE"
  | "EMPTY_DENOMINATOR"
  /** cobertura insuficiente para publicar o agregado */
  | "INSUFFICIENT_COVERAGE"
  /** a regra de negócio oficial ainda não foi definida pelo CEO (§46) */
  | "BUSINESS_RULE_PENDING"

export interface Provenance {
  /** fontes que sustentam o valor (ex. ["google_sheets:sales"]) */
  sources?: string[]
  /** momento da coleta do dado que originou a métrica (ISO) */
  asOf?: string
}

// As invariantes de cada classe vivem no DISCRIMINANTE, não em comentário nem
// só na validação do construtor.
//
// Motivo: `Metric<T>` é um tipo estrutural que vai atravessar banco, API e UI.
// Se a obrigatoriedade existisse apenas dentro dos construtores, um objeto
// desserializado de JSON — a fronteira mais provável — poderia declarar-se
// `inferred` sem confiança ou `calculated` sem fórmula e continuar sendo um
// `Metric` válido para o compilador. Aí a garantia que este módulo promete
// deixaria de existir exatamente onde ela é mais necessária.
//
//   observed   → nada além de procedência
//   calculated → fórmula OBRIGATÓRIA (é a promessa de auditabilidade)
//   inferred   → confiança OBRIGATÓRIA (senão é indistinguível de observação)
//   forecast   → confiança OBRIGATÓRIA e payload é sempre uma faixa

export type MetricOk<T> = Provenance &
  { ok: true; value: T } & (
    | { dataClass: "observed"; formula?: string; confidence?: number }
    | { dataClass: "calculated"; formula: string; confidence?: number }
    | { dataClass: "inferred"; confidence: number; formula?: string }
    | { dataClass: "forecast"; confidence: number; formula?: string }
  )

export interface MetricGap extends Provenance {
  ok: false
  dataClass: DataClass
  gap: Gap
  /** explicação curta, exibível ao CEO */
  detail?: string
  formula?: string
  confidence?: number
}

export type Metric<T> = MetricOk<T> | MetricGap

// ─── Construtores ─────────────────────────────────────────────────────────────

export function observed<T>(value: T, p: Provenance = {}): Metric<T> {
  return { ok: true, dataClass: "observed", value, ...p }
}

export function calculated<T>(value: T, formula: string, p: Provenance = {}): Metric<T> {
  return makeOk<T>("calculated", value, formula, p)
}

export function inferred<T>(value: T, confidence: number, p: Provenance = {}): Metric<T> {
  if (!isConfidence(confidence)) {
    return gap<T>("LOW_CONFIDENCE", "inferred", "confiança inválida", p)
  }
  return { ok: true, dataClass: "inferred", value, confidence, ...p }
}

function isConfidence(c: number): boolean {
  return Number.isFinite(c) && c >= 0 && c <= 1
}

/**
 * Constrói um `MetricOk` a partir de uma classe calculada em tempo de execução,
 * respeitando as obrigatoriedades de cada variante.
 */
function hasFormula(f: string | undefined): f is string {
  return typeof f === "string" && f.trim().length > 0
}

function makeOk<T>(
  dataClass: DataClass,
  value: T,
  formula: string | undefined,
  p: Provenance,
  confidence?: number,
): Metric<T> {
  // Fórmula vazia é PIOR que ausente: promete auditabilidade que não existe.
  // O tipo exige `string` para `calculated`, e `""` é uma string — então a
  // invariante precisa ser imposta aqui também. Um número calculado que não
  // sabe dizer como foi calculado não é um número confiável: vira lacuna.
  const f = hasFormula(formula) ? { formula } : {}
  switch (dataClass) {
    case "calculated":
      if (!hasFormula(formula)) {
        return gap<T>("DATA_NOT_AVAILABLE", "calculated", "métrica calculada sem fórmula", p)
      }
      return { ok: true, dataClass: "calculated", value, formula, ...p }
    case "inferred":
      return { ok: true, dataClass: "inferred", value, confidence: confidence ?? 0, ...f, ...p }
    case "forecast":
      return { ok: true, dataClass: "forecast", value, confidence: confidence ?? 0, ...f, ...p }
    default:
      return { ok: true, dataClass: "observed", value, ...f, ...p }
  }
}

// Os construtores de lacuna são genéricos com default `never`.
//
// Uma lacuna não carrega valor algum, então `never` é literalmente o tipo certo.
// Na prática isso resolve um problema real: sem o parâmetro,
// `combine2(observed(14), notAvailable(...), fn)` não tem de onde inferir o
// segundo tipo e degrada os argumentos de `fn` para `unknown` — desligando em
// silêncio a checagem exatamente onde ela mais importa.

export function gap<T = never>(
  reason: Gap,
  dataClass: DataClass = "calculated",
  detail?: string,
  p: Provenance = {},
): Metric<T> {
  return { ok: false, dataClass, gap: reason, detail, ...p }
}

export function notAvailable<T = never>(detail?: string, p: Provenance = {}): Metric<T> {
  return gap<T>("DATA_NOT_AVAILABLE", "observed", detail, p)
}

export function conflict<T = never>(
  detail: string,
  sources: string[] = [],
  p: Provenance = {},
): Metric<T> {
  return gap<T>("DATA_CONFLICT", "observed", detail, { ...p, sources })
}

export function rulePending<T = never>(detail: string, p: Provenance = {}): Metric<T> {
  return gap<T>("BUSINESS_RULE_PENDING", "calculated", detail, p)
}

// ─── Previsão (§29) ───────────────────────────────────────────────────────────

export interface Forecast {
  expectedValue: number
  lowerBound: number
  upperBound: number
  confidence: number
  modelVersion: string
}

export function forecast(f: Forecast, p: Provenance = {}): Metric<Forecast> {
  if (f.lowerBound > f.expectedValue || f.upperBound < f.expectedValue) {
    return gap<Forecast>("LOW_CONFIDENCE", "forecast", "faixa incoerente com o valor esperado", p)
  }
  if (!isConfidence(f.confidence)) {
    return gap<Forecast>("LOW_CONFIDENCE", "forecast", "confiança inválida", p)
  }
  return { ok: true, dataClass: "forecast", value: f, confidence: f.confidence, ...p }
}

// ─── Operações ────────────────────────────────────────────────────────────────

export function isOk<T>(m: Metric<T>): m is MetricOk<T> {
  return m.ok
}

/** Transforma o valor mantendo procedência e classe. Lacuna passa intacta. */
export function mapMetric<A, B>(m: Metric<A>, fn: (a: A) => B): Metric<B> {
  if (!m.ok) return m
  return makeOk<B>(m.dataClass, fn(m.value), m.formula ?? "", pick(m), m.confidence)
}

/**
 * Escape hatch explícito. Exige que quem chama NOMEIE o fallback, para que a
 * substituição fique visível na revisão de código em vez de escondida num `?? 0`.
 */
export function unwrapOr<T>(m: Metric<T>, fallback: T): T {
  return m.ok ? m.value : fallback
}

function pick(m: Metric<unknown>): Provenance {
  return { sources: m.sources, asOf: m.asOf }
}

const CLASS_RANK: Record<DataClass, number> = {
  observed: 0,
  calculated: 1,
  inferred: 2,
  forecast: 3,
}

function weakestClass(list: readonly Metric<unknown>[]): DataClass {
  let worst: DataClass = "observed"
  for (const m of list) {
    if (CLASS_RANK[m.dataClass] > CLASS_RANK[worst]) worst = m.dataClass
  }
  return worst
}

function mergeSources(list: readonly Metric<unknown>[]): string[] | undefined {
  const all = new Set<string>()
  for (const m of list) for (const s of m.sources ?? []) all.add(s)
  return all.size ? [...all].sort() : undefined
}

/** A métrica é tão fresca quanto sua fonte mais velha. */
function oldestAsOf(list: readonly Metric<unknown>[]): string | undefined {
  const stamps = list.map((m) => m.asOf).filter((s): s is string => Boolean(s))
  return stamps.length ? stamps.sort()[0] : undefined
}

function minConfidence(list: readonly Metric<unknown>[]): number | undefined {
  const cs = list.map((m) => m.confidence).filter((c): c is number => typeof c === "number")
  return cs.length ? Math.min(...cs) : undefined
}

// ─── Combinação estrita (aridade fixa) ────────────────────────────────────────
//
// Para combinações de poucos operandos conhecidos — conversão, ticket, razão —
// a regra estrita é a correta: se falta um operando, o resultado não existe.
// Não há "meia conversão".
//
// A API é deliberadamente explícita (combine2/combine3) em vez de um combinador
// sobre tuplas: a inferência de tupla sobre um tipo união como `Metric<T>` falha
// em silêncio e degrada os valores para `unknown` (§52 — confiabilidade acima de
// elegância).

function resolveStrict<R>(
  inputs: readonly Metric<unknown>[],
  compute: () => R,
  formula: string,
): Metric<R> {
  const firstGap = inputs.find((m): m is MetricGap => !m.ok)
  const prov: Provenance = { sources: mergeSources(inputs), asOf: oldestAsOf(inputs) }
  if (firstGap) {
    return gap<R>(firstGap.gap, resultClass(inputs), firstGap.detail, prov)
  }
  return makeOk<R>(resultClass(inputs), compute(), formula, prov, minConfidence(inputs))
}

/**
 * Combinar dois valores observados produz um valor CALCULADO, não observado —
 * ninguém observou a soma. Classes mais fracas (inferido, previsão) prevalecem.
 */
function resultClass(inputs: readonly Metric<unknown>[]): DataClass {
  const base = weakestClass(inputs)
  return base === "observed" ? "calculated" : base
}

export function combine2<A, B, R>(
  a: Metric<A>,
  b: Metric<B>,
  fn: (a: A, b: B) => R,
  formula: string,
): Metric<R> {
  return resolveStrict([a, b], () => fn((a as MetricOk<A>).value, (b as MetricOk<B>).value), formula)
}

export function combine3<A, B, C, R>(
  a: Metric<A>,
  b: Metric<B>,
  c: Metric<C>,
  fn: (a: A, b: B, c: C) => R,
  formula: string,
): Metric<R> {
  return resolveStrict(
    [a, b, c],
    () => fn((a as MetricOk<A>).value, (b as MetricOk<B>).value, (c as MetricOk<C>).value),
    formula,
  )
}

// ─── Agregação sobre listas: cobertura explícita ──────────────────────────────
//
// Aqui a regra estrita seria destrutiva. Somar o volume contratado de 20
// unidades e descartar TUDO porque uma não reportou confunde completude com
// validade: apaga 19 valores bons e deixa o painel de 30 segundos sem número
// justamente durante uma degradação parcial — que é quando o CEO mais precisa
// olhar.
//
// A saída correta não é "R$ 0" nem "não sei". É:
//
//   R$ 82.920,57 · 19 de 20 unidades · 1 sem reporte
//
// Por isso a agregação devolve o subtotal conhecido JUNTO com a cobertura e a
// lista completa de lacunas — não só a primeira. Cada métrica declara em
// METRICS.md se publica parcial e com que cobertura mínima.

export interface Coverage {
  /** quantas contribuições entraram no valor */
  observed: number
  /** quantas eram esperadas */
  expected: number
  /** TODAS as lacunas encontradas, não apenas a primeira */
  missing: readonly MetricGap[]
}

/**
 * Resultado de uma agregação.
 *
 * É união discriminada de propósito, e o ramo parcial NÃO chama seu conteúdo de
 * `value`. Antes, parcialidade vivia só dentro de `coverage` e o consumidor
 * podia ler `.value` sem nunca perguntar se estava completo — publicando
 * subtotal como total. Agora ler o número de um agregado possivelmente
 * incompleto é erro de compilação até que se decida o que fazer com a lacuna.
 */
export type Aggregated<T> =
  | { complete: true; value: T; coverage: Coverage }
  | { complete: false; subtotal: T; coverage: Coverage }

/** Lê o número de qualquer agregado, assumindo explicitamente o subtotal. */
export function aggregatedNumber<T>(a: Aggregated<T>): T {
  return a.complete ? a.value : a.subtotal
}

export type AggregationPolicy =
  /** falta qualquer contribuição → o agregado não existe */
  | { mode: "strict" }
  /** publica o subtotal conhecido, exigindo cobertura mínima (0..1) */
  | { mode: "partial"; minCoverage?: number }

export const STRICT: AggregationPolicy = { mode: "strict" }
export const PARTIAL: AggregationPolicy = { mode: "partial" }

export function aggregate<T, R>(
  metrics: readonly Metric<T>[],
  // O redutor pode FALHAR devolvendo null (ex. soma que estoura a faixa exata).
  // Sem isso, a agregação executiva contornaria as guardas de exatidão.
  fn: (values: readonly T[]) => R | null,
  formula: string,
  policy: AggregationPolicy = STRICT,
): Metric<Aggregated<R>> {
  const prov: Provenance = { sources: mergeSources(metrics), asOf: oldestAsOf(metrics) }
  const missing = metrics.filter((m): m is MetricGap => !m.ok)
  const present = metrics.filter(isOk)
  const expected = metrics.length

  if (expected === 0) {
    return gap<Aggregated<R>>("EMPTY_DENOMINATOR", "calculated", "nada para agregar", prov)
  }

  if (policy.mode === "strict" && missing.length > 0) {
    const detalhe =
      missing.length === 1
        ? missing[0].detail
        : `${missing.length} de ${expected} contribuições indisponíveis`
    return gap<Aggregated<R>>(missing[0].gap, resultClass(metrics), detalhe, prov)
  }

  if (present.length === 0) {
    return gap<Aggregated<R>>(
      missing[0]?.gap ?? "DATA_NOT_AVAILABLE",
      resultClass(metrics),
      `nenhuma das ${expected} contribuições está disponível`,
      prov,
    )
  }

  if (policy.mode === "partial" && policy.minCoverage !== undefined) {
    const cobertura = present.length / expected
    if (cobertura < policy.minCoverage) {
      return gap<Aggregated<R>>(
        "INSUFFICIENT_COVERAGE",
        resultClass(metrics),
        `cobertura ${present.length}/${expected} abaixo do mínimo exigido`,
        prov,
      )
    }
  }

  const reduced = fn(present.map((m) => m.value))
  if (reduced === null) {
    return gap<Aggregated<R>>(
      "DATA_NOT_AVAILABLE",
      resultClass(metrics),
      "agregação fora da faixa exata",
      prov,
    )
  }

  const coverage: Coverage = { observed: present.length, expected, missing }
  const value: Aggregated<R> =
    present.length === expected
      ? { complete: true, value: reduced, coverage }
      : { complete: false, subtotal: reduced, coverage }

  return makeOk<Aggregated<R>>(
    resultClass(metrics),
    value,
    formula,
    prov,
    minConfidence(metrics),
  )
}

/** true quando o agregado não cobre tudo que era esperado. */
export function isPartial<T>(a: Aggregated<T>): boolean {
  return !a.complete
}

/**
 * Soma métricas numéricas.
 *
 * O padrão é `STRICT`: um total de dinheiro incompleto apresentado como total
 * engana. Use `PARTIAL` explicitamente onde o subtotal com cobertura for mais
 * útil que a ausência — e rotule a cobertura na UI.
 */
export function sumMetrics(
  metrics: readonly Metric<number>[],
  formula: string,
  policy: AggregationPolicy = STRICT,
): Metric<Aggregated<number>> {
  // Usa `sumCents`, não `reduce`. A guarda de exatidão de D11 não pode ser
  // contornada justamente pelo agregador que produz os totais executivos:
  // parcelas individualmente válidas podem somar fora da faixa exata.
  return aggregate(metrics, (values) => sumCents(values), formula, policy)
}

// ─── Razão / conversão ────────────────────────────────────────────────────────
//
// O erro mais perigoso de um painel comercial: mostrar 0% de conversão porque
// não havia leads. Zero leads e zero conversão são fatos diferentes.

export interface Ratio {
  /** basis points inteiros: 1061 = 10,61% */
  bps: number
  numerator: number
  denominator: number
}

export function ratio(
  numerator: Metric<number>,
  denominator: Metric<number>,
  formula: string,
): Metric<Ratio> {
  const prov: Provenance = {
    sources: mergeSources([numerator, denominator]),
    asOf: oldestAsOf([numerator, denominator]),
  }

  if (!numerator.ok) return gap<Ratio>(numerator.gap, numerator.dataClass, numerator.detail, prov)
  if (!denominator.ok) {
    return gap<Ratio>(denominator.gap, denominator.dataClass, denominator.detail, prov)
  }

  if (denominator.value === 0) {
    return gap<Ratio>(
      "EMPTY_DENOMINATOR",
      "calculated",
      "denominador zero — sem base para calcular a razão",
      prov,
    )
  }

  return makeOk<Ratio>(
    resultClass([numerator, denominator]),
    {
      bps: Math.round((numerator.value / denominator.value) * 10_000),
      numerator: numerator.value,
      denominator: denominator.value,
    },
    formula,
    prov,
    minConfidence([numerator, denominator]),
  )
}

/**
 * Média em centavos inteiros. Arredonda ao centavo mais próximo.
 *
 * ATENÇÃO documentada: a soma de médias arredondadas não é igual à média do
 * total. TKM por vendedor somado não reconstrói o TKM geral — isso é esperado,
 * não bug, e está registrado no METRICS.md.
 */
export function meanCents(values: readonly number[], formula: string): Metric<number> {
  if (values.length === 0) {
    return gap<number>("EMPTY_DENOMINATOR", "calculated", "nenhum valor para média", {})
  }
  let total = 0
  for (const v of values) {
    if (!Number.isSafeInteger(v)) {
      return gap<number>("DATA_NOT_AVAILABLE", "calculated", "valor fora da faixa exata", {})
    }
    total += v
    if (!Number.isSafeInteger(total)) {
      return gap<number>("DATA_NOT_AVAILABLE", "calculated", "soma fora da faixa exata", {})
    }
  }
  return calculated(Math.round(total / values.length), formula)
}
