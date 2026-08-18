/**
 * `expected_units` — o denominador governado da cobertura.
 *
 * ─── Por que isto é DADO, e não configuração ──────────────────────────────────
 *
 * A Política Creditum v1 decide **como** a cobertura é avaliada: a partir de que
 * fração ausente a qualidade cai para `degraded`, e a partir de qual vira
 * `insufficient`. Ela não sabe, nem pode saber, **quais** unidades eram esperadas
 * num dataset específico num período específico — isso muda todo mês, por fonte,
 * e é fato operacional.
 *
 * Duas autoridades distintas, dois artefatos distintos:
 *
 *   `creditum-policy.v1.json`   limiares e semântica
 *   `expected-units/*.json`     membership operacional
 *
 * Enfiar membership na política faria o arquivo de decisões de negócio mudar
 * mensalmente, e o hash da política deixaria de significar "as decisões da
 * Creditum" para significar "as decisões mais o mês corrente".
 *
 * ─── O que NÃO é expected_units ───────────────────────────────────────────────
 *
 * **Catálogo ativo não é expected_units.** 44 unidades ativas com 37 esperadas num
 * relatório significa cobertura sobre 37. Usar o tamanho do catálogo como
 * denominador produz degradação permanente e falsa — a unidade que não vende
 * naquele dataset viraria "ausente" para sempre.
 *
 * **Unidades observadas não são expected_units.** `expected = observed` faz a
 * cobertura ser sempre 100% e transforma a métrica em tautologia: ela deixaria de
 * poder detectar o que ela existe para detectar.
 *
 * Há teste de fonte para as duas proibições.
 *
 * ─── Ausência não é zero ──────────────────────────────────────────────────────
 *
 * Sem dado governado para `period + dataset_id`, a resposta é
 * `DATA_NOT_AVAILABLE` — nunca lista vazia. Lista vazia afirmaria "nenhuma
 * unidade era esperada", que é uma afirmação sobre o negócio; ausência de arquivo
 * é uma afirmação sobre o sistema. Confundir as duas produziria cobertura `ok`
 * sobre denominador inexistente.
 */

import { createHash } from "node:crypto"
import { GatewayError } from "../../gateway/src/errors"
import { deepFreeze } from "../../gateway/src/immutability"
import { structuralId } from "./structural-id"
import type { GovernedUnitCatalog } from "./unit-catalog"
import type { UnitId } from "./canonical-units"

export const EXPECTED_UNITS_SCHEMA_VERSION = "1.0.0"

/**
 * Período de operação: `AAAA-MM`, estritamente.
 *
 * Fechado de propósito. `"agosto"`, `"08/2026"`, um timestamp ou um `Date` do JS
 * exigiriam normalização, e normalização de data é onde nascem os fusos errados.
 * O período aqui é uma etiqueta civil, não um instante.
 */
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/** Mesma forma que o D13 valida. Repetida aqui como guarda de fronteira. */
const UNIT_ID_FORM = /^[a-z][a-z0-9_]{1,63}$/

const IDENTIFICADOR = /^[a-z0-9][a-z0-9_.:-]{2,127}$/
const SHA256_HEX = /^[a-f0-9]{64}$/
const SEMVER = /^\d+\.\d+\.\d+$/

// ─── Contratos ────────────────────────────────────────────────────────────────

/**
 * Procedência do dataset de membership.
 *
 * Existe para auditoria: sem ela, uma cobertura `degraded` não teria como
 * responder "esperado segundo quem, e segundo qual versão".
 *
 * `content_hash` cobre o MATERIAL DA MEMBERSHIP — período, dataset e a lista
 * ordenada de unidades — não os bytes do arquivo.
 *
 * A distinção não é detalhe: um hash dos bytes do arquivo incluiria o próprio
 * campo `content_hash`, e um hash que contém a si mesmo não tem ponto fixo. Além
 * disso, o que precisa ser imutável é a decisão, não a formatação: reindentar o
 * JSON ou reordenar a lista não muda a membership e não pode invalidar o
 * artefato. Trocar uma unidade muda, e invalida.
 *
 * SHA-256 padrão. Não é identidade de unidade — `unit_id` é governado pelo D13 e
 * nunca derivado de hash.
 */
export interface ExpectedUnitsProvenance {
  readonly source_system: string
  /** Versão governada DESTA membership. Membership diferente exige versão nova. */
  readonly source_version: string
  readonly content_hash: string
}

/** Uma entrada do dataset. Objeto, não string, para caber campo governado futuro. */
export interface ExpectedUnitEntry {
  readonly unit_id: UnitId
}

/** O artefato bruto, como sai do arquivo ou da fonte. Ainda não validado. */
export interface ExpectedUnitsArtifact {
  readonly schema_version: string
  readonly period: string
  readonly dataset_id: string
  readonly expected_units: readonly ExpectedUnitEntry[]
  readonly provenance: ExpectedUnitsProvenance
}

/**
 * Membership validada e congelada.
 *
 * `unit_ids` sai em ordem determinística (code units), independente da ordem do
 * arquivo: a cobertura não pode depender de como alguém digitou a lista.
 */
export interface GovernedExpectedUnits {
  readonly period: string
  readonly dataset_id: string
  readonly unit_ids: readonly UnitId[]
  readonly provenance: ExpectedUnitsProvenance
  /**
   * Identidade estrutural desta membership.
   *
   * Muda quando a lista muda. É o que torna uma substituição silenciosa visível:
   * mesma `source_version` com `membership_id` diferente é troca sem procedência.
   */
  readonly membership_id: string
}

/**
 * Resposta do provider. União discriminada — ausência tem ramo próprio.
 *
 * Nunca `[]` para significar "não encontrei". Ver a nota de topo do arquivo.
 */
export type ExpectedUnitsLookup =
  | { readonly status: "available"; readonly membership: GovernedExpectedUnits }
  | {
      readonly status: "DATA_NOT_AVAILABLE"
      readonly period: string
      readonly dataset_id: string
      readonly detail: string
    }

export interface ExpectedUnitsQuery {
  readonly period: string
  readonly dataset_id: string
}

/**
 * A porta. Não conhece storage.
 *
 * Síncrona porque o único provider que existe hoje lê arquivo versionado, e uma
 * `Promise` obrigaria todo consumidor a ser assíncrono por causa de um storage
 * que ainda não foi decidido. Trocar por Supabase depois é trocar a
 * implementação, não a lógica de cobertura.
 */
export interface ExpectedUnitsProvider {
  getExpectedUnits(query: ExpectedUnitsQuery): ExpectedUnitsLookup
}

// ─── Validação ────────────────────────────────────────────────────────────────

class Recusas {
  readonly list: string[] = []
  add(campo: string, motivo: string): void {
    this.list.push(`${campo}: ${motivo}`)
  }
}

function texto(v: unknown, campo: string, forma: RegExp, r: Recusas): string | null {
  if (typeof v !== "string" || !forma.test(v)) {
    r.add(campo, `formato inválido: ${JSON.stringify(v)}`)
    return null
  }
  return v
}

/**
 * Valida a membership contra o catálogo governado. Fecha fechado, e congela.
 *
 * O catálogo entra como parâmetro para que a validação seja testável contra um
 * catálogo sintético sem tocar o governado — e para que a dependência seja
 * visível em vez de importada por baixo.
 */
export function validateExpectedUnits(
  raw: unknown,
  catalog: GovernedUnitCatalog,
): GovernedExpectedUnits {
  const r = new Recusas()

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new GatewayError("SCHEMA_INVALID", "Dataset de expected_units recusado", [
      "$: precisa ser objeto",
    ])
  }
  const a = raw as Record<string, unknown>

  if (a["schema_version"] !== EXPECTED_UNITS_SCHEMA_VERSION) {
    r.add(
      "schema_version",
      `não suportada; suportada: ${EXPECTED_UNITS_SCHEMA_VERSION}`,
    )
  }

  const period = texto(a["period"], "period", PERIODO, r)
  const dataset_id = texto(a["dataset_id"], "dataset_id", IDENTIFICADOR, r)

  // ── Procedência ──
  const prov = (a["provenance"] ?? {}) as Record<string, unknown>
  const source_system = texto(prov["source_system"], "provenance.source_system", IDENTIFICADOR, r)
  const source_version = texto(prov["source_version"], "provenance.source_version", SEMVER, r)
  const content_hash = texto(prov["content_hash"], "provenance.content_hash", SHA256_HEX, r)

  // ── Membership ──
  const lista = a["expected_units"]
  const ids: UnitId[] = []

  if (!Array.isArray(lista)) {
    r.add("expected_units", "lista obrigatória")
  } else if (lista.length === 0) {
    // Lista vazia NÃO é "nenhuma unidade esperada". A v1 não tem forma governada
    // de declarar zero expectativa, e inferi-la de uma lista vazia produziria
    // cobertura sobre denominador zero — `EMPTY_DENOMINATOR` disfarçado de `ok`.
    r.add(
      "expected_units",
      "lista vazia não é forma governada de declarar zero expectativa — " +
        "ausência de dado é DATA_NOT_AVAILABLE, não lista vazia",
    )
  } else {
    const conhecidas = new Set(catalog.entries.map((e) => e.unit_id))
    const vistos = new Set<string>()

    for (const [i, bruto] of (lista as readonly unknown[]).entries()) {
      const p = `expected_units[${i}]`
      if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
        r.add(p, "entrada precisa ser objeto")
        continue
      }
      const id = (bruto as Record<string, unknown>)["unit_id"]
      if (typeof id !== "string" || !UNIT_ID_FORM.test(id)) {
        r.add(`${p}.unit_id`, `forma inválida: ${JSON.stringify(id)}`)
        continue
      }
      // Fora do catálogo governado é recusa: uma expectativa sobre unidade que
      // não existe não tem como ser satisfeita nem auditada.
      if (!conhecidas.has(id)) {
        r.add(`${p}.unit_id`, `fora do catálogo governado: ${id}`)
        continue
      }
      // Duplicata NUNCA é deduplicada em silêncio: ela infla o denominador, e
      // deduplicar esconderia um erro de origem que alguém precisa corrigir.
      if (vistos.has(id)) {
        r.add(`${p}.unit_id`, `duplicado em period+dataset_id: ${id}`)
        continue
      }
      vistos.add(id)
      ids.push(id)
    }
  }

  if (r.list.length > 0) {
    throw new GatewayError("SCHEMA_INVALID", "Dataset de expected_units recusado", r.list)
  }

  // Ordem determinística por code units. A do arquivo não decide nada.
  const ordenados = [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))

  // A procedência tem de descrever ESTA membership. Um `content_hash` que não bate
  // significa que a lista mudou sem a procedência acompanhar — a substituição
  // silenciosa que §20 proíbe. Só é verificável depois da validação, porque antes
  // dela a lista pode conter entrada inválida.
  const hashEsperado = expectedUnitsContentHash(
    period as string,
    dataset_id as string,
    ordenados,
  )
  if (content_hash !== hashEsperado) {
    throw new GatewayError("SCHEMA_INVALID", "Procedência não corresponde à membership", [
      `provenance.content_hash: declarado ${content_hash}, membership é ${hashEsperado}`,
    ])
  }

  const membership_id = structuralId(
    "creditum:expected_units:v1",
    {
      schema_version: EXPECTED_UNITS_SCHEMA_VERSION,
      period,
      dataset_id,
      unit_ids: ordenados,
    },
    "exp",
  )

  return deepFreeze({
    period: period as string,
    dataset_id: dataset_id as string,
    unit_ids: ordenados,
    provenance: {
      source_system: source_system as string,
      source_version: source_version as string,
      content_hash,
    },
    membership_id,
  })
}

/**
 * SHA-256 do material da membership. Primitive padrão, resultado determinístico.
 *
 * O material é canônico: período, dataset e a lista JÁ ORDENADA. Duas listas com
 * as mesmas unidades em ordens diferentes têm o mesmo hash, porque descrevem a
 * mesma membership — e é a membership que a procedência precisa fixar.
 */
export function expectedUnitsContentHash(
  period: string,
  dataset_id: string,
  unit_ids: readonly UnitId[],
): string {
  const ordenados = [...unit_ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
  const material = JSON.stringify({
    schema_version: EXPECTED_UNITS_SCHEMA_VERSION,
    period,
    dataset_id,
    unit_ids: ordenados,
  })
  return createHash("sha256").update(material, "utf8").digest("hex")
}

// ─── Cobertura ────────────────────────────────────────────────────────────────

/**
 * O que a cobertura mede, com cada número separado do outro.
 *
 * `unexpected_observed_unit_ids` existe e NÃO entra no denominador. Uma unidade
 * que reportou sem ser esperada é um fato de governança — talvez a expectativa
 * esteja desatualizada, talvez o dado esteja errado — e decidir isso não é papel
 * de um cálculo. Somá-la ao denominador diluiria a ausência das que faltaram.
 */
export interface CoverageAssessment {
  readonly expected_count: number
  readonly observed_expected_count: number
  readonly missing_unit_ids: readonly UnitId[]
  readonly missing_count: number
  /** Fração AUSENTE, em basis points inteiros. `floor` da divisão exata. */
  readonly missing_share_bp: number
  /** Fração PRESENTE. Complemento exato do acima — é o que os detectores leem. */
  readonly ratio_bp: number
  readonly unexpected_observed_unit_ids: readonly UnitId[]
}

/**
 * Compara membership governada com o que foi observado.
 *
 * Aritmética inteira. `missing_share_bp` é o piso da divisão exata e `ratio_bp` é
 * o complemento — as duas somam 10000 sempre, sem arredondamento independente que
 * pudesse discordar de si mesmo no limite.
 *
 * `observed` recebe apenas `unit_id` já canonicalizado pelo D13. Texto cru de
 * fonte não entra: `"Grau Mogi"` e `mogi` não são comparáveis, e comparar
 * ingenuamente contaria a mesma unidade como ausente.
 */
export function assessCoverage(
  membership: GovernedExpectedUnits,
  observed: readonly UnitId[],
): CoverageAssessment {
  const esperadas = new Set(membership.unit_ids)
  const observadas = new Set(observed)

  const presentes = membership.unit_ids.filter((id) => observadas.has(id))
  const faltantes = membership.unit_ids.filter((id) => !observadas.has(id))
  const inesperadas = [...observadas]
    .filter((id) => !esperadas.has(id))
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))

  const expected_count = membership.unit_ids.length
  const missing_count = faltantes.length

  // Denominador zero é impossível: a validação recusa membership vazia.
  const missing_share_bp = Math.floor((missing_count * 10000) / expected_count)

  return deepFreeze({
    expected_count,
    observed_expected_count: presentes.length,
    missing_unit_ids: faltantes,
    missing_count,
    missing_share_bp,
    ratio_bp: 10000 - missing_share_bp,
    unexpected_observed_unit_ids: inesperadas,
  })
}

/** A forma que os detectores já consomem. Projeção, sem número novo. */
export function toUnitCoverage(a: CoverageAssessment): {
  readonly expected_units: number
  readonly reporting_units: number
  readonly ratio_bp: number
} {
  return deepFreeze({
    expected_units: a.expected_count,
    reporting_units: a.observed_expected_count,
    ratio_bp: a.ratio_bp,
  })
}

export type CoverageQuality = "ok" | "degraded" | "insufficient"

/**
 * A qualidade da cobertura, segundo a política já aprovada.
 *
 *   ausente = 0                        → ok
 *   ausente >= 1 e share < limiar      → degraded
 *   share >= limiar                    → insufficient
 *
 * O limiar vem da política governada (`missing_share_insufficient_at_bp`), não
 * daqui. Esta função não decide onde fica a fronteira; decide como aplicá-la.
 *
 * `ok` aqui significa "a cobertura não degrada" — não "o resultado é ok". A
 * precedência do lattice `ok < degraded < insufficient < conflicted` continua
 * sendo do chamador, e `conflicted` continua prevalecendo.
 */
export function coverageQuality(
  a: CoverageAssessment,
  missing_share_insufficient_at_bp: number,
): CoverageQuality {
  if (a.missing_share_bp >= missing_share_insufficient_at_bp) return "insufficient"
  if (a.missing_count >= 1) return "degraded"
  return "ok"
}
