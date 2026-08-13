// Resolução de identidade de entidades vindas de texto livre.
//
// A fonte escreve o nome da mesma unidade de várias formas. Unificar errado
// contamina conversão, ranking e ticket de DUAS unidades ao mesmo tempo — e o
// erro fica invisível, porque o número continua parecendo certo.
//
// Por isso a resolução é escalonada, da certeza para a suspeita:
//
//   1. CANÔNICO   acento, caixa, espaço, prefixo "Grau" e abreviação conhecida
//                 → correspondência EXATA depois de normalizar. Auto-aplica.
//   2. ALIAS      tabela que o CEO aprova. Auto-aplica.
//   3. SUGESTÃO   semelhança alta. NUNCA auto-aplica — vira pendência.
//   4. NOVA       não parece nada conhecido. Cria unidade nova.
//
// O passo 3 nunca funde sozinho de propósito. A própria planilha tem
// "Grau Santos" e "Grau Santo Amaro" — cidades diferentes que qualquer
// similaridade ingênua juntaria.

import { parseText, toComparableKey } from "./parse"

// ─── Abreviações ──────────────────────────────────────────────────────────────
//
// Só abreviações REGULARES do português, onde a expansão é determinística.
// "Sta Cruz" → "santa cruz" vira correspondência exata com a aba financeira,
// sem precisar de similaridade.
//
// Contrações de nome composto (ex. "Rio Preto" para "São José do Rio Preto")
// NÃO entram aqui: não são deriváveis por regra. Vão como alias explícito.

const ABBREVIATIONS: Record<string, string> = {
  sta: "santa",
  sto: "santo",
  jd: "jardim",
  zn: "zona",
  pres: "presidente",
  gov: "governador",
  vl: "vila",
  pq: "parque",
}

/** Prefixo institucional que não distingue unidades entre si. */
const UNIT_PREFIXES = ["grau"]

/**
 * Chave canônica de unidade.
 *
 * `Grau Sumaré`, `Grau Sumare` e `Sumaré` → `sumare`
 * `Grau Sta Cruz` e `Santa Cruz`          → `santa cruz`
 * `Grau Santos`                           → `santos`   (≠ `santo amaro`)
 */
export function canonicalSchoolKey(raw: unknown): string | null {
  const base = toComparableKey(raw)
  if (!base) return null

  let tokens = base.split(" ").filter(Boolean)
  if (tokens.length === 0) return null

  // Remove o prefixo institucional apenas se sobrar algo depois dele
  if (tokens.length > 1 && UNIT_PREFIXES.includes(tokens[0])) {
    tokens = tokens.slice(1)
  }

  tokens = tokens.map((t) => ABBREVIATIONS[t] ?? t)
  const key = tokens.join(" ")
  return key || null
}

// ─── Vendedor / SDR ───────────────────────────────────────────────────────────

// Sentinelas de não-atribuído observadas na fonte real. Não são pessoas: não
// entram em ranking nem em denominador de conversão.
const UNASSIGNED_TOKENS = new Set(["ninguem", "nao atribuido", "n/a", "na", "-", "sem vendedor"])

export function isUnassignedToken(raw: unknown): boolean {
  const key = toComparableKey(raw)
  return key === null || UNASSIGNED_TOKENS.has(key)
}

export function canonicalPersonKey(raw: unknown): string | null {
  const key = toComparableKey(raw)
  if (!key) return null
  return isUnassignedToken(raw) ? null : key
}

// ─── Semelhança — para SUGERIR, nunca para fundir ─────────────────────────────

/** Distância de Levenshtein, iterativa e sem alocar matriz completa. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = curr.slice()
  }
  return prev[b.length]
}

/**
 * Semelhança 0..1 entre nomes de lugar.
 *
 * A regra central é linguística, não estatística:
 *
 *   contagem de palavras diferente E nenhuma palavra em comum
 *   → são lugares diferentes, ponto.
 *
 * É isso que separa `santos` de `santo amaro`. Os dois têm altíssima
 * proximidade de caracteres — um é quase prefixo do outro — e uma métrica de
 * distância pura os fundiria. Mas "Santos" e "Santo Amaro" não são o mesmo
 * lugar, e a diferença de estrutura do nome é a evidência disso.
 *
 * Fora esse veto, vale a proximidade de caracteres, que é o que pega erro de
 * digitação (`mogii` → `mogi`).
 *
 * Uma tentativa anterior usava `min(jaccard, caracteres)`. Era seguro demais:
 * derrubava TODO score a zero sempre que não houvesse palavra em comum, o que
 * fazia a camada de sugestão nunca disparar. Uma rede de segurança que nunca
 * dispara é pior que nenhuma, porque parece que existe.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  const ta = a.split(" ").filter(Boolean)
  const tb = b.split(" ").filter(Boolean)
  const sa = new Set(ta)
  const sb = new Set(tb)

  let shared = 0
  for (const t of sa) if (sb.has(t)) shared++

  // Veto estrutural: número de palavras diferente e nenhuma em comum.
  if (shared === 0 && ta.length !== tb.length) return 0

  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 0 : 1 - levenshtein(a, b) / maxLen
}

/**
 * Acima disto vira SUGESTÃO para o CEO confirmar. Nunca fusão automática.
 *
 * Calibrado contra as unidades REAIS desta base:
 *   mogi / mogii        0,80  → sugere (erro de digitação)
 *   limeira / limoeiro  0,75  → não sugere (duas unidades reais e distintas)
 */
export const SUGGESTION_THRESHOLD = 0.8

export interface SchoolMatch {
  kind: "canonical" | "alias" | "suggestion" | "new"
  key: string
  schoolId?: string
  /** preenchido apenas em `suggestion` */
  candidateKey?: string
  score?: number
}

/**
 * Resolve uma unidade contra o que já é conhecido.
 *
 * `aliases` é a tabela aprovada pelo CEO (chave canônica → school_id).
 * `known` são as chaves canônicas já existentes.
 */
export function resolveSchool(
  raw: unknown,
  aliases: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
): SchoolMatch | null {
  const key = canonicalSchoolKey(raw)
  if (!key) return null

  const aliased = aliases.get(key)
  if (aliased) return { kind: "alias", key, schoolId: aliased }

  if (known.has(key)) return { kind: "canonical", key }

  // Não é conhecido. Existe algo parecido o bastante para valer uma pergunta?
  let best: { candidate: string; score: number } | null = null
  for (const candidate of known) {
    const score = similarity(key, candidate)
    if (score >= SUGGESTION_THRESHOLD && (!best || score > best.score)) {
      best = { candidate, score }
    }
  }

  if (best) {
    return { kind: "suggestion", key, candidateKey: best.candidate, score: best.score }
  }

  return { kind: "new", key }
}

// ─── Linha-fantasma ───────────────────────────────────────────────────────────
//
// A aba de pipeline tem ~55 linhas vazias que carregam Status "Novo" e
// Total de parcelas 0. Ingestão ingênua criaria 55 leads inexistentes e
// afundaria a conversão.
//
// A rejeição é contada em `rows_skipped`: descarte silencioso é invisível na
// auditoria e indistinguível de um bug de coleta.

export interface BlankRowCheck {
  studentName?: unknown
  contact?: unknown
  installmentsTotal?: unknown
}

export function isBlankRow(row: BlankRowCheck): boolean {
  const hasName = parseText(row.studentName) !== null
  const hasContact = parseText(row.contact) !== null
  if (hasName || hasContact) return false

  // Sem aluno E sem contato. O total zerado confirma que é linha de gabarito,
  // mas a ausência dos dois identificadores já basta: não há a quem se referir.
  return true
}
