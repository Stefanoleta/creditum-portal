// Álgebra de métricas — a regra absoluta de confiabilidade (§3), no tipo.
//
// O objetivo deste módulo é tornar IMPOSSÍVEL, por tipagem, os quatro erros que
// destroem a confiança num painel executivo:
//
//   1. ausência virar zero
//   2. dado observado se misturar com previsão
//   3. divisão por denominador vazio produzir 0% em vez de "não sei"
//   4. um número aparecer sem que se possa dizer de onde veio
//
// Nada aqui é opinião de UI: é o contrato que a UI é obrigada a respeitar,
// porque `Metric<T>` não expõe `.value` sem antes passar por `ok`.

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
  /** a regra de negócio oficial ainda não foi definida pelo CEO (§46) */
  | "BUSINESS_RULE_PENDING"

export interface Provenance {
  /** fórmula legível, para o CEO poder auditar o número */
  formula?: string
  /** fontes que sustentam o valor (ex. ["google_sheets:sales"]) */
  sources?: string[]
  /** momento da coleta do dado que originou a métrica (ISO) */
  asOf?: string
  /** 0..1 — obrigatório em `inferred`, opcional no resto */
  confidence?: number
}

export interface MetricOk<T> extends Provenance {
  ok: true
  dataClass: DataClass
  value: T
}

export interface MetricGap extends Provenance {
  ok: false
  dataClass: DataClass
  gap: Gap
  /** explicação curta, exibível ao CEO */
  detail?: string
}

export type Metric<T> = MetricOk<T> | MetricGap

// ─── Construtores ─────────────────────────────────────────────────────────────

export function observed<T>(value: T, p: Provenance = {}): Metric<T> {
  return { ok: true, dataClass: "observed", value, ...p }
}

export function calculated<T>(value: T, formula: string, p: Provenance = {}): Metric<T> {
  return { ok: true, dataClass: "calculated", value, ...p, formula }
}

export function inferred<T>(value: T, confidence: number, p: Provenance = {}): Metric<T> {
  // Inferência sem confiança declarada é indistinguível de observação — e é
  // exatamente essa confusão que o §3 proíbe.
  if (!(confidence >= 0 && confidence <= 1)) {
    return gap<T>("LOW_CONFIDENCE", "inferred", "confiança inválida", p)
  }
  return { ok: true, dataClass: "inferred", value, ...p, confidence }
}

// Os construtores de lacuna são genéricos com default `never` — e isso não é
// cosmético de tipagem.
//
// Uma lacuna não carrega valor algum, então `never` é literalmente o tipo certo:
// não existe valor desse tipo. Na prática isso resolve um problema real: sem o
// parâmetro, `combine2(observed(14), notAvailable(...), fn)` não tem de onde
// inferir o segundo tipo e degrada os dois argumentos de `fn` para `unknown` —
// silenciosamente desligando a checagem exatamente onde ela mais importa.

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
//
// Previsão nunca é um número solto. Sempre faixa, confiança e versão do modelo,
// para que o CEO nunca confunda projeção com fato.

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
  if (!(f.confidence >= 0 && f.confidence <= 1)) {
    return gap<Forecast>("LOW_CONFIDENCE", "forecast", "confiança inválida", p)
  }
  return { ok: true, dataClass: "forecast", value: f, ...p, confidence: f.confidence }
}

// ─── Operações ────────────────────────────────────────────────────────────────

export function isOk<T>(m: Metric<T>): m is MetricOk<T> {
  return m.ok
}

/** Transforma o valor mantendo procedência. Lacuna passa intacta. */
export function mapMetric<A, B>(m: Metric<A>, fn: (a: A) => B): Metric<B> {
  if (!m.ok) return m
  return { ...m, value: fn(m.value) }
}

/**
 * Escape hatch explícito. Exige que quem chama NOMEIE o fallback, para que a
 * substituição fique visível na revisão de código em vez de escondida num `?? 0`.
 */
export function unwrapOr<T>(m: Metric<T>, fallback: T): T {
  return m.ok ? m.value : fallback
}

// Regra comum a todos os combinadores: se QUALQUER entrada é lacuna, o resultado
// é lacuna — a lacuna se propaga em vez de virar zero no meio de uma soma.
//
// A classe do resultado é a mais "fraca" das entradas:
// observed < calculated < inferred < forecast. Um total que depende de uma
// previsão é uma previsão, não um fato.
//
// A API é deliberadamente explícita (combine2/combine3/combineAll) em vez de um
// combinador genérico sobre tuplas: a inferência de tupla sobre um tipo união
// como `Metric<T>` falha em silêncio e degrada os valores para `unknown`, o que
// derrota justamente a garantia que este módulo existe para dar (§52 —
// confiabilidade acima de elegância).

function resolve<R>(
  inputs: readonly Metric<unknown>[],
  compute: () => R,
  formula: string,
): Metric<R> {
  const firstGap = inputs.find((m): m is MetricGap => !m.ok)
  if (firstGap) {
    return gap<R>(firstGap.gap, weakestClass(inputs), firstGap.detail, {
      formula,
      sources: mergeSources(inputs),
      asOf: oldestAsOf(inputs),
    })
  }
  return {
    ok: true,
    dataClass: weakestClass(inputs),
    value: compute(),
    formula,
    sources: mergeSources(inputs),
    asOf: oldestAsOf(inputs),
  }
}

export function combine2<A, B, R>(
  a: Metric<A>,
  b: Metric<B>,
  fn: (a: A, b: B) => R,
  formula: string,
): Metric<R> {
  return resolve([a, b], () => fn((a as MetricOk<A>).value, (b as MetricOk<B>).value), formula)
}

export function combine3<A, B, C, R>(
  a: Metric<A>,
  b: Metric<B>,
  c: Metric<C>,
  fn: (a: A, b: B, c: C) => R,
  formula: string,
): Metric<R> {
  return resolve(
    [a, b, c],
    () => fn((a as MetricOk<A>).value, (b as MetricOk<B>).value, (c as MetricOk<C>).value),
    formula,
  )
}

/** Combina uma lista homogênea — o caso de somas e agregações. */
export function combineAll<T, R>(
  metrics: readonly Metric<T>[],
  fn: (values: readonly T[]) => R,
  formula: string,
): Metric<R> {
  return resolve(metrics, () => fn(metrics.map((m) => (m as MetricOk<T>).value)), formula)
}

/** Soma métricas numéricas. Uma lacuna em qualquer parcela invalida o total. */
export function sumMetrics(metrics: readonly Metric<number>[], formula: string): Metric<number> {
  if (metrics.length === 0) {
    return gap<number>("DATA_NOT_AVAILABLE", "calculated", "nada para somar", { formula })
  }
  return combineAll(metrics, (values) => values.reduce((a, b) => a + b, 0), formula)
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
  if (!numerator.ok) return { ...numerator, formula }
  if (!denominator.ok) return { ...denominator, formula }

  if (denominator.value === 0) {
    return gap<Ratio>(
      "EMPTY_DENOMINATOR",
      "calculated",
      "denominador zero — sem base para calcular a razão",
      { formula, sources: mergeSources([numerator, denominator]) },
    )
  }

  return {
    ok: true,
    dataClass: weakestClass([numerator, denominator]) === "observed"
      ? "calculated"
      : weakestClass([numerator, denominator]),
    value: {
      bps: Math.round((numerator.value / denominator.value) * 10_000),
      numerator: numerator.value,
      denominator: denominator.value,
    },
    formula,
    sources: mergeSources([numerator, denominator]),
    asOf: oldestAsOf([numerator, denominator]),
  }
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
    return gap<number>("EMPTY_DENOMINATOR", "calculated", "nenhum valor para média", { formula })
  }
  const total = values.reduce((a, b) => a + b, 0)
  return calculated(Math.round(total / values.length), formula)
}
