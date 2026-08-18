/**
 * D13 — motor de canonicalização de unidades.
 *
 * O motor NÃO contém o catálogo. Nenhum `UnitId` está escrito aqui, e nem podia:
 * o catálogo governado ainda não foi validado pelo CEO (ver
 * `docs/D13_CATALOG_VALIDATION.md`). Este módulo sabe *resolver* uma unidade
 * contra um catálogo qualquer; o conteúdo do catálogo é dado, não código.
 *
 * A normalização de texto e a similaridade vêm por **porta injetada**, não
 * reimplementadas: `src/lib/ceo/normalize.ts` já tem `canonicalSchoolKey` e
 * `similarity`, com o veto estrutural que separa `santos` de `santo amaro` e o
 * limiar calibrado contra unidades reais. Duplicar isso seria criar uma segunda
 * verdade sobre identidade de unidade — exatamente o que D12/D13 proíbem.
 *
 * ─── Três resultados, e por que similaridade NUNCA casa ───────────────────────
 *
 *   matched    correspondência EXATA com id canônico ou alias aprovado
 *   ambiguous  parecido o bastante para perguntar, nunca o bastante para decidir
 *   unknown    não parece nada conhecido
 *
 * Similaridade alta produz `ambiguous`, jamais `matched`. Uma unidade nova não
 * é criada automaticamente e uma ambiguidade não é resolvida em silêncio — as
 * duas contaminam qualidade e viram trabalho humano.
 */

import { createHash } from "node:crypto"
import { GatewayError } from "../../gateway/src/errors"

/**
 * Identificador canônico.
 *
 * Deliberadamente `string` com validação de forma, e **não** um enum literal: um
 * enum aqui seria a lista de unidades escrita por engenheiro, que é o que o
 * bloqueio B1 impede. Vira união literal quando o catálogo for aprovado.
 */
export type UnitId = string

const UNIT_ID_FORM = /^[a-z][a-z0-9_]{1,63}$/

export interface CanonicalUnit {
  readonly unit_id: UnitId
  /** Nome de exibição do CATÁLOGO. Nunca o texto da fonte. */
  readonly display_name: string
  /** Formas aprovadas pelo CEO que apontam para esta unidade. */
  readonly aliases: readonly string[]
  readonly active: boolean
}

export interface UnitCatalog {
  readonly catalog_version: string
  readonly units: readonly CanonicalUnit[]
}

/**
 * Porta de normalização.
 *
 * Implementada por um adaptador sobre `src/lib/ceo/normalize.ts`. Fica como
 * porta para que este módulo não dependa daquele arquivo diretamente e para que
 * o teste possa exercitar o motor com um normalizador controlado.
 */
export interface UnitNormalizerPort {
  /** Chave comparável: sem acento, caixa baixa, espaço normalizado, prefixo institucional removido. */
  comparableKey(raw: unknown): string | null
  /** Similaridade 0..1 entre duas chaves comparáveis. */
  similarity(a: string, b: string): number
}

/**
 * Por que a identidade ficou ambígua. Conjunto FECHADO.
 *
 * `SIMILARITY`  duas ou mais unidades do catálogo parecem com o texto observado.
 *               "Não sei qual das duas."
 *
 * `GROUP_LABEL` o texto observado é um AGRUPAMENTO comercial, não uma unidade.
 *               "Sei exatamente o que é, e não é uma escola."
 *
 * As duas coisas são diferentes e o `reason` existe para não confundi-las. Um
 * rótulo como `Carpina e Limoeiro` não é uma dúvida do algoritmo — é uma linha
 * cuja identidade não é atômica.
 *
 * ─── Por que `ambiguous` e não um quarto status ───────────────────────────────
 *
 * Compromisso deliberado, registrado. Um `status: "grouped"` seria semanticamente
 * mais limpo, mas os detectores A, C e D ramificam com `if/else if` sobre os três
 * status existentes, sem exaustividade que o compilador cobre. Um quarto valor
 * passaria silenciosamente por esses `else if` e a qualidade **deixaria de
 * degradar** — o pior resultado possível, num código já aprovado.
 *
 * Reaproveitar `ambiguous` herda o comportamento já testado nos quatro
 * detectores: nunca promovido a identidade, qualidade vai a `conflicted`, nome
 * cru não atravessa. O `reason` preserva a distinção de forma legível por
 * máquina.
 */
export type AmbiguityReason = "SIMILARITY" | "GROUP_LABEL"

export type CanonicalUnitResult =
  | { readonly status: "matched"; readonly unit_id: UnitId; readonly display_name: string }
  | { readonly status: "unknown"; readonly raw_fingerprint: string }
  | {
      readonly status: "ambiguous"
      readonly candidates: readonly UnitId[]
      readonly raw_fingerprint: string
      /** Ausente = `SIMILARITY`, o comportamento histórico. */
      readonly reason?: AmbiguityReason
    }

/**
 * Impressão determinística do valor de origem.
 *
 * Serve para o humano correlacionar, na auditoria, um `unknown` de hoje com o
 * mesmo `unknown` de amanhã — sem que o texto da fonte atravesse para o modelo.
 *
 * LIMITE, declarado: é sha256 com separador de domínio, **não** anonimização.
 * Um valor curto e adivinhável continua adivinhável por dicionário. Se o
 * arquiteto quiser garantia real contra reversão, isso exige HMAC com segredo
 * mantido fora do plano do modelo — decisão registrada na proposta de schema v2.
 */
export function unitFingerprint(comparable: string): string {
  return createHash("sha256")
    .update(`creditum:unit:v1:${comparable}`, "utf8")
    .digest("hex")
    .slice(0, 16)
}

// ─── Índice validado ──────────────────────────────────────────────────────────

export interface UnitIndex {
  readonly catalog_version: string
  /** chave comparável → unit_id */
  readonly byKey: ReadonlyMap<string, UnitId>
  readonly byId: ReadonlyMap<UnitId, CanonicalUnit>
  /** chaves comparáveis das unidades ATIVAS, para busca por similaridade */
  readonly activeKeys: readonly string[]
}

/**
 * Constrói e VALIDA o índice. Falha fechado.
 *
 * O caso que mais importa aqui é o alias duplicado apontando para unidades
 * diferentes: seria uma contradição silenciosa no catálogo, e a resolução
 * passaria a depender da ordem de inserção. Duas unidades receberiam os números
 * uma da outra sem nada parecer errado.
 */
export function buildUnitIndex(catalog: UnitCatalog, port: UnitNormalizerPort): UnitIndex {
  const problemas: string[] = []
  const byKey = new Map<string, UnitId>()
  const byId = new Map<UnitId, CanonicalUnit>()
  const activeKeys: string[] = []

  if (typeof catalog.catalog_version !== "string" || !/^\d+\.\d+\.\d+$/.test(catalog.catalog_version)) {
    problemas.push("catalog_version: obrigatório, formato x.y.z")
  }

  for (const unidade of catalog.units) {
    const id = unidade.unit_id

    if (!UNIT_ID_FORM.test(id)) {
      problemas.push(`unit_id "${id}": precisa ser snake_case minúsculo`)
      continue
    }
    if (byId.has(id)) {
      problemas.push(`unit_id "${id}": repetido no catálogo`)
      continue
    }
    if (typeof unidade.display_name !== "string" || unidade.display_name.trim() === "") {
      problemas.push(`unit_id "${id}": display_name obrigatório`)
      continue
    }

    byId.set(id, unidade)

    // O próprio id e o display_name são formas de entrada legítimas, além dos
    // aliases explícitos.
    const formas = [id, unidade.display_name, ...unidade.aliases]

    for (const forma of formas) {
      const chave = port.comparableKey(forma)
      if (chave === null) {
        problemas.push(`unit_id "${id}": alias "${String(forma)}" não produz chave comparável`)
        continue
      }

      const jaExiste = byKey.get(chave)
      if (jaExiste !== undefined && jaExiste !== id) {
        problemas.push(
          `alias "${chave}" aponta para "${jaExiste}" e para "${id}" — catálogo contraditório`,
        )
        continue
      }

      byKey.set(chave, id)
      if (unidade.active && !activeKeys.includes(chave)) activeKeys.push(chave)
    }
  }

  if (problemas.length > 0) {
    throw new GatewayError("NOT_ALLOWED", "Catálogo de unidades recusado", problemas)
  }

  return {
    catalog_version: catalog.catalog_version,
    byKey,
    byId,
    activeKeys: [...activeKeys].sort(),
  }
}

// ─── Resolução ────────────────────────────────────────────────────────────────

export interface CanonicalizeOptions {
  /** Limiar de similaridade em basis points (8000 = 0,80). */
  readonly similarityThresholdBp: number
}

/**
 * Resolve um valor de origem contra o catálogo.
 *
 * Ordem: exato → ambíguo → desconhecido. Não há quarto caminho, e em nenhum
 * deles o `raw` sai.
 */
export function canonicalizeUnit(
  raw: unknown,
  index: UnitIndex,
  port: UnitNormalizerPort,
  options: CanonicalizeOptions,
): CanonicalUnitResult {
  const chave = port.comparableKey(raw)

  // Sem chave comparável não há nem o que comparar nem o que registrar como
  // impressão estável. Vira desconhecido com impressão do vazio.
  if (chave === null) {
    return { status: "unknown", raw_fingerprint: unitFingerprint("") }
  }

  const fingerprint = unitFingerprint(chave)

  const exato = index.byKey.get(chave)
  if (exato !== undefined) {
    const unidade = index.byId.get(exato)
    if (unidade === undefined) {
      throw new GatewayError("SCHEMA_INVALID", "Índice de unidades inconsistente", [exato])
    }
    return { status: "matched", unit_id: exato, display_name: unidade.display_name }
  }

  // TODOS os candidatos acima do limiar, não o melhor.
  //
  // Devolver só o melhor daria a impressão de que existe um vencedor, e o ponto
  // de `ambiguous` é exatamente que não existe. Quem decide é humano.
  const candidatos: UnitId[] = []
  for (const candidato of index.activeKeys) {
    const bp = Math.round(port.similarity(chave, candidato) * 10000)
    if (bp >= options.similarityThresholdBp) {
      const id = index.byKey.get(candidato)
      if (id !== undefined && !candidatos.includes(id)) candidatos.push(id)
    }
  }

  if (candidatos.length > 0) {
    return { status: "ambiguous", candidates: [...candidatos].sort(), raw_fingerprint: fingerprint }
  }

  return { status: "unknown", raw_fingerprint: fingerprint }
}

// ─── Dois conceitos que NÃO se misturam (§7) ──────────────────────────────────

/**
 * Unidades canônicas que eram esperadas no período e não reportaram.
 *
 * É **cobertura**: mede quanto do consolidado esperado chegou. Todas as
 * unidades aqui são canônicas e conhecidas — o problema é ausência de reporte.
 */
export interface CoverageUnits {
  readonly expected_unit_ids: readonly UnitId[]
  readonly reporting_unit_ids: readonly UnitId[]
  readonly missing_unit_ids: readonly UnitId[]
}

/**
 * Valores de origem que não puderam ser resolvidos a uma unidade canônica.
 *
 * É **qualidade de ingestão**, não cobertura. Uma unidade que reportou com o
 * nome escrito de forma irreconhecível não é uma unidade ausente — é um dado que
 * chegou e não foi entendido. Somar as duas coisas produziria uma cobertura que
 * mente nas duas direções: esconde falha de identidade e inventa ausência.
 */
export interface UnresolvedSourceUnits {
  readonly unknown_fingerprints: readonly string[]
  readonly ambiguous: readonly {
    readonly raw_fingerprint: string
    readonly candidates: readonly UnitId[]
  }[]
}

export interface UnitResolutionSummary {
  readonly coverage: CoverageUnits
  readonly unresolved: UnresolvedSourceUnits
}

/**
 * Separa os dois conceitos a partir de um lote de resoluções.
 *
 * `expectedUnitIds` é entrada GOVERNADA do período — nunca `catalog.units.length`
 * (decisão B2). Quantas unidades existem no cadastro e quantas se esperava que
 * reportassem no mês são perguntas diferentes.
 */
export function summarizeUnitResolution(
  results: readonly CanonicalUnitResult[],
  expectedUnitIds: readonly UnitId[],
): UnitResolutionSummary {
  const reportando = new Set<UnitId>()
  const desconhecidas = new Set<string>()
  const ambiguas: { raw_fingerprint: string; candidates: readonly UnitId[] }[] = []

  for (const r of results) {
    if (r.status === "matched") reportando.add(r.unit_id)
    else if (r.status === "unknown") desconhecidas.add(r.raw_fingerprint)
    else ambiguas.push({ raw_fingerprint: r.raw_fingerprint, candidates: r.candidates })
  }

  const esperadas = [...new Set(expectedUnitIds)].sort()
  const reportaram = [...reportando].sort()

  return {
    coverage: {
      expected_unit_ids: esperadas,
      reporting_unit_ids: reportaram,
      missing_unit_ids: esperadas.filter((id) => !reportando.has(id)),
    },
    unresolved: {
      unknown_fingerprints: [...desconhecidas].sort(),
      ambiguous: ambiguas.sort((a, b) => a.raw_fingerprint.localeCompare(b.raw_fingerprint)),
    },
  }
}
