/**
 * Comparação de versões do mesmo fato, por tipo.
 *
 * Duas regras que este módulo existe para impor:
 *
 *   1. **Normalização antes da comparação.** `"R$ 1.000,00"` e `"100000"` são o
 *      mesmo valor e comparar as strings diretamente produziria um conflito
 *      falso. Cada tipo tem sua normalização, e ela é a do motor — não uma
 *      segunda implementação.
 *
 *   2. **Ausência e lacuna não são números.** Um campo vazio comparado como zero
 *      inventa uma divergência de tamanho igual ao valor da outra fonte. Um
 *      `gap` já declarado não é "um valor diferente": é a ausência de valor, e
 *      compará-lo seria transformar "não sei" em "discordo".
 *
 * O resultado é estrutura, não booleano: quem consome precisa distinguir
 * "igual", "diferente" e "não dá para comparar" — e a terceira NÃO vira conflito
 * automaticamente.
 */

import { parseDateISO, parseCount, ratio, observed, isOk } from "./engine"
import type { Metric } from "./engine"
import { daysBetween } from "./dates"

export type ComparableKind = "count" | "cents" | "basis_points" | "date" | "canonical_id"

const NUMERIC_KINDS: readonly ComparableKind[] = ["count", "cents", "basis_points"]

/** Por que uma versão não entra na comparação. Nenhuma vira zero. */
export type AbsenceReason =
  /** o campo não veio na fonte */
  | "MISSING_VALUE"
  /** a fonte declarou lacuna — "não sei" não é "discordo" */
  | "DECLARED_GAP"
  /** o valor veio mas não é interpretável no tipo declarado */
  | "UNPARSEABLE"
  /** a identidade da unidade não foi resolvida (D13 unknown/ambiguous) */
  | "UNRESOLVED_IDENTITY"

export type VersionValue =
  | { readonly status: "present"; readonly raw: unknown }
  | { readonly status: "absent"; readonly reason: AbsenceReason }

export interface SourceVersion {
  /** Ex.: `google_sheets:pipeline`. */
  readonly source_system: string
  readonly snapshot_id: string
  /** Obrigatório: uma versão sem lastro não sustenta conflito executivo. */
  readonly evidence_ref: string
  readonly value: VersionValue
}

export interface NormalizedVersion {
  readonly source_system: string
  readonly snapshot_id: string
  readonly evidence_ref: string
  /** Forma canônica usada na comparação e no ID. */
  readonly value_repr: string
  /** Presente apenas para os tipos numéricos. */
  readonly numeric?: number
}

export type NotComparableReason =
  | AbsenceReason
  /** menos de duas versões — não há disputa */
  | "INSUFFICIENT_VERSIONS"

export type ComparisonResult =
  | {
      readonly status: "equal"
      readonly kind: ComparableKind
      readonly versions: readonly NormalizedVersion[]
      readonly value_repr: string
    }
  | {
      readonly status: "conflict"
      readonly kind: ComparableKind
      /** TODAS as versões, inclusive as que concordam entre si. */
      readonly versions: readonly NormalizedVersion[]
      readonly distinct_reprs: readonly string[]
      /** Amplitude, para tipos numéricos e para data (em dias). */
      readonly difference_absolute?: number
      /**
       * Divergência RELATIVA entre as versões: amplitude ÷ maior versão em
       * valor absoluto. NÃO é participação num total — são dimensões distintas.
       */
      readonly relative_difference_bp?: Metric<number>
    }
  | {
      readonly status: "not_comparable"
      readonly kind: ComparableKind
      readonly reason: NotComparableReason
      /** Qual fonte inviabilizou a comparação, quando aplicável. */
      readonly source_system?: string
    }

const UNIT_ID_FORM = /^[a-z][a-z0-9_]{1,63}$/

interface Normalizado {
  readonly value_repr: string
  readonly numeric?: number
}

/**
 * Normaliza um valor bruto para a forma comparável do tipo.
 *
 * Datas passam por `parseDateISO` do motor, que aceita `dd/MM/yyyy`, serial de
 * planilha e ISO — então `04/08/2026` e `2026-08-04` convergem para a mesma
 * representação e NÃO produzem conflito falso. Data inexistente no calendário é
 * recusada, não corrigida.
 */
function normalizar(kind: ComparableKind, raw: unknown): Normalizado | AbsenceReason {
  if (raw === null || raw === undefined) return "MISSING_VALUE"

  if (NUMERIC_KINDS.includes(kind)) {
    // `parseCount` recusa float, string não numérica e valor fora da faixa
    // exata. Dinheiro chega aqui JÁ em centavos inteiros — a conversão de
    // `"R$ 1.000,00"` pertence à ingestão, não à comparação.
    const n = typeof raw === "number" ? (Number.isSafeInteger(raw) ? raw : null) : parseCount(raw)
    if (n === null) return "UNPARSEABLE"
    if (kind === "basis_points" && (n < 0 || n > 10000)) return "UNPARSEABLE"
    return { value_repr: String(n), numeric: n }
  }

  if (kind === "date") {
    const iso = parseDateISO(raw)
    if (iso === null) return "UNPARSEABLE"
    return { value_repr: iso }
  }

  // canonical_id
  if (typeof raw !== "string" || !UNIT_ID_FORM.test(raw)) return "UNRESOLVED_IDENTITY"
  return { value_repr: raw }
}

/**
 * Compara versões do mesmo campo.
 *
 * Basta uma versão não comparável para a disputa inteira ficar não comparável:
 * declarar conflito entre duas fontes ignorando que a terceira não pôde ser lida
 * afirmaria mais do que se sabe.
 */
export function compareVersions(
  kind: ComparableKind,
  versions: readonly SourceVersion[],
): ComparisonResult {
  if (versions.length < 2) {
    return { status: "not_comparable", kind, reason: "INSUFFICIENT_VERSIONS" }
  }

  const normalizadas: NormalizedVersion[] = []

  for (const v of versions) {
    if (v.value.status === "absent") {
      return {
        status: "not_comparable",
        kind,
        reason: v.value.reason,
        source_system: v.source_system,
      }
    }

    const n = normalizar(kind, v.value.raw)
    if (typeof n === "string") {
      return { status: "not_comparable", kind, reason: n, source_system: v.source_system }
    }

    normalizadas.push({
      source_system: v.source_system,
      snapshot_id: v.snapshot_id,
      evidence_ref: v.evidence_ref,
      value_repr: n.value_repr,
      ...(n.numeric === undefined ? {} : { numeric: n.numeric }),
    })
  }

  const distintos = [...new Set(normalizadas.map((n) => n.value_repr))].sort()

  if (distintos.length === 1) {
    const unico = distintos[0]
    if (unico === undefined) {
      return { status: "not_comparable", kind, reason: "MISSING_VALUE" }
    }
    return { status: "equal", kind, versions: normalizadas, value_repr: unico }
  }

  return {
    status: "conflict",
    kind,
    // TODAS as versões, não as distintas. Três fontes com 10/10/14 preservam as
    // três: o fato de duas concordarem não elege a maioria como verdade.
    versions: normalizadas,
    distinct_reprs: distintos,
    ...diferenca(kind, normalizadas),
  }
}

function diferenca(
  kind: ComparableKind,
  versoes: readonly NormalizedVersion[],
): { difference_absolute?: number; relative_difference_bp?: Metric<number> } {
  if (kind === "date") {
    const dias = versoes.map((v) => v.value_repr).sort()
    const menor = dias[0]
    const maior = dias[dias.length - 1]
    if (menor === undefined || maior === undefined) return {}
    return { difference_absolute: Math.abs(daysBetween(menor, maior)) }
  }

  const numeros = versoes
    .map((v) => v.numeric)
    .filter((n): n is number => typeof n === "number")

  if (numeros.length !== versoes.length || numeros.length === 0) return {}

  const min = Math.min(...numeros)
  const max = Math.max(...numeros)
  const amplitude = max - min

  // Denominador: a MAIOR MAGNITUDE, não o maior valor com sinal.
  //
  // `Math.abs(max)` era errado com negativos, porque o maior valor com sinal é o
  // menos negativo — ou seja, a MENOR magnitude. Três consequências reais:
  //
  //   -1 vs -100000  → denominador 1     → 999.990 bp, fora de qualquer faixa
  //   -100 vs 0      → denominador 0     → medida ausente, escondendo divergência total
  //   -100 vs -50    → denominador 50    → 10000 bp para uma diferença de metade
  //
  // Com a maior magnitude os três viram 10000, 10000 e 5000 bp. O denominador só
  // é zero quando TODAS as versões são zero — e aí não há conflito nenhum.
  //
  // A medida pode passar de 10000 bp quando os sinais divergem (-100 vs 100 =
  // 20000 bp). Isso é correto e proposital: é razão, não campo de contrato. Ela
  // nunca é gravada como `basis_points` no evento.
  const denominador = Math.max(...numeros.map((n) => Math.abs(n)))
  const bp =
    denominador === 0
      ? undefined
      : toBp(ratio(observed(amplitude), observed(denominador), "amplitude / maior_magnitude"))

  return {
    difference_absolute: amplitude,
    ...(bp === undefined ? {} : { relative_difference_bp: bp }),
  }
}

function toBp(m: Metric<{ bps: number }>): Metric<number> {
  return isOk(m) ? observed(m.value.bps) : m
}
