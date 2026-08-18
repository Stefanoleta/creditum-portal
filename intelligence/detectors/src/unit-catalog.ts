/**
 * Catálogo governado de unidades — DADO, nunca código.
 *
 * ─── A decisão que este arquivo materializa ────────────────────────────────────
 *
 * `UnitId` permanece `string` validada. O catálogo entra como dado.
 *
 * Isto **supersede** `FASE_2_1_SCHEMA_V2_PROPOSAL.md` §6 e
 * `D13_CATALOG_VALIDATION.md` §8, que previam transformar `UnitId` numa união
 * literal com todas as escolas. Com ~40 unidades e crescendo, a união literal
 * faria a abertura de uma escola virar deploy de TypeScript — e o dia em que a
 * operação abre uma unidade não pode ser o dia em que alguém compila o POC.
 *
 * Unidade nova é linha nova. Nunca recompilação.
 *
 * ─── Três coisas que este arquivo mantém separadas ────────────────────────────
 *
 *   UNIDADE          identidade canônica, com status ativo/inativo
 *   ALIAS            forma que a fonte escreve e aponta para UMA unidade
 *   AGRUPAMENTO      rótulo comercial que cobre VÁRIAS unidades
 *
 * O terceiro é o achado desta fase. `Carpina e Limoeiro` não é escola, não é
 * apelido de escola e não é dúvida do algoritmo: é uma linha cuja identidade não
 * é atômica. Tratá-lo como alias escolheria um membro; dividir o valor entre os
 * membros inventaria aritmética que a fonte não forneceu.
 */

import { GatewayError } from "../../gateway/src/errors"
import ARTEFATO from "../../catalog/unidades.catalog.json"
import type { CanonicalUnitResult, UnitCatalog, UnitId, UnitIndex, UnitNormalizerPort } from "./canonical-units"
import { canonicalizeUnit, unitFingerprint } from "./canonical-units"
import type { CanonicalizeOptions } from "./canonical-units"

/**
 * Estado de uma unidade no catálogo.
 *
 * `inactive` NÃO é `unknown`. Uma unidade desativada continua tendo identidade
 * canônica conhecida: se a fonte a reporta, o sistema sabe exatamente qual é. O
 * que ela deixou de ser é *esperada* — e isso é cobertura, não canonicalização.
 *
 * Confundir os dois faria toda linha histórica de uma unidade fechada virar
 * `unknown` retroativamente.
 */
export type UnitStatus = "active" | "inactive"

/**
 * Entrada do catálogo governado.
 *
 * `effective_from` / `effective_to` estão AUSENTES de propósito: `ceo.schools`
 * hoje só tem `active` booleano, e adicionar vigência temporal é decisão de
 * governança pendente (`FASE_2_6_CLOSURE_AND_INTEGRATION.md` §4.2). Sem eles, o
 * status é o de HOJE — e um período anterior a uma desativação não é
 * reconstituível. Limitação registrada, não escondida.
 */
export interface UnitCatalogEntry {
  readonly unit_id: UnitId
  /** Nome canônico aprovado. Nunca o texto da fonte. */
  readonly canonical_name: string
  /** Formas aprovadas que apontam para esta unidade. */
  readonly aliases: readonly string[]
  readonly status: UnitStatus
}

/**
 * Rótulo comercial que cobre mais de uma unidade.
 *
 * `members` são `unit_id`s do próprio catálogo — validado na importação. Um
 * agrupamento que aponta para uma unidade inexistente é recusado, não ignorado.
 */
export interface UnitGroupLabel {
  /** O texto como a fonte escreve. */
  readonly label: string
  readonly members: readonly UnitId[]
}

export interface GovernedUnitCatalog {
  readonly catalog_version: string
  readonly entries: readonly UnitCatalogEntry[]
  readonly groups: readonly UnitGroupLabel[]
}

// ─── Importação ───────────────────────────────────────────────────────────────

/**
 * Linha crua de uma planilha de unidades, já lida por quem sabe ler planilha.
 *
 * Deliberadamente NÃO é um leitor de `.xlsx`: este módulo não abre arquivo, não
 * escolhe biblioteca e não adivinha nome de coluna. Quem extrai entrega linhas
 * nesta forma, e a validação acontece aqui.
 */
export interface UnitCatalogRow {
  readonly unit_id?: unknown
  readonly canonical_name?: unknown
  readonly aliases?: unknown
  readonly status?: unknown
  /** Membros, quando a linha é um agrupamento em vez de uma unidade. */
  readonly group_members?: unknown
}

const UNIT_ID_FORM = /^[a-z][a-z0-9_]{1,63}$/

/**
 * Deriva um `unit_id` estável a partir do nome canônico.
 *
 * Existe para que quem preenche a planilha não precise inventar identificadores —
 * e para que o mesmo nome canônico produza sempre o mesmo id. Não substitui um id
 * explícito quando a planilha o fornecer.
 */
export function unitIdFromCanonicalName(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 64)
}

const textos = (v: unknown): readonly string[] => {
  if (v === null || v === undefined || v === "") return []
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
  if (typeof v === "string") {
    // Uma célula com múltiplos aliases separados por `;` ou `|`. NUNCA por vírgula:
    // vírgula aparece dentro de rótulo de agrupamento (`Limeira, Sumaré & ...`) e
    // usá-la como separador partiria o rótulo ao meio.
    return v
      .split(/[;|]/u)
      .map((x) => x.trim())
      .filter((x) => x !== "")
  }
  return []
}

/**
 * Valida e monta o catálogo governado. Falha fechada, com todos os problemas.
 *
 * Nada é inferido: linha sem nome canônico é recusada, status desconhecido é
 * recusado, e agrupamento apontando para unidade inexistente é recusado.
 */
export function importUnitCatalog(
  catalog_version: string,
  rows: readonly UnitCatalogRow[],
): GovernedUnitCatalog {
  const problemas: string[] = []
  const entries: UnitCatalogEntry[] = []
  const gruposCrus: { label: string; members: readonly string[] }[] = []
  const idsVistos = new Set<string>()
  const aliasesVistos = new Map<string, UnitId>()

  if (!/^\d+\.\d+\.\d+$/.test(catalog_version)) {
    problemas.push("catalog_version: formato x.y.z obrigatório")
  }

  for (const [i, row] of rows.entries()) {
    const onde = `rows[${i}]`

    const membros = textos(row.group_members)
    if (membros.length > 0) {
      // É um AGRUPAMENTO, não uma unidade.
      const label = typeof row.canonical_name === "string" ? row.canonical_name.trim() : ""
      if (label === "") {
        problemas.push(`${onde}: agrupamento sem rótulo`)
        continue
      }
      gruposCrus.push({ label, members: membros })
      continue
    }

    if (typeof row.canonical_name !== "string" || row.canonical_name.trim() === "") {
      problemas.push(`${onde}: canonical_name obrigatório`)
      continue
    }
    const canonical_name = row.canonical_name.trim()

    const id =
      typeof row.unit_id === "string" && row.unit_id.trim() !== ""
        ? row.unit_id.trim()
        : unitIdFromCanonicalName(canonical_name)

    if (!UNIT_ID_FORM.test(id)) {
      problemas.push(`${onde}: unit_id "${id}" fora do formato`)
      continue
    }
    if (idsVistos.has(id)) {
      problemas.push(`${onde}: unit_id "${id}" duplicado`)
      continue
    }

    const status = row.status === undefined || row.status === null ? "active" : row.status
    if (status !== "active" && status !== "inactive") {
      // `JSON.stringify` e não `String`: um objeto viraria `[object Object]` e a
      // mensagem de recusa esconderia o que a planilha realmente trouxe.
      problemas.push(`${onde}: status ${JSON.stringify(status)} desconhecido`)
      continue
    }

    const aliases = textos(row.aliases)
    for (const a of aliases) {
      const chave = a.toLowerCase()
      const dono = aliasesVistos.get(chave)
      if (dono !== undefined && dono !== id) {
        // Um alias que aponta para duas unidades não é alias: é ambiguidade
        // gravada no catálogo, e o catálogo é justamente o que deveria resolvê-la.
        problemas.push(`${onde}: alias "${a}" já pertence a "${dono}"`)
        continue
      }
      aliasesVistos.set(chave, id)
    }

    idsVistos.add(id)
    entries.push({ unit_id: id, canonical_name, aliases, status })
  }

  const groups: UnitGroupLabel[] = []
  for (const g of gruposCrus) {
    const desconhecidos = g.members.filter((m) => !idsVistos.has(m))
    if (desconhecidos.length > 0) {
      problemas.push(
        `agrupamento "${g.label}": membros inexistentes no catálogo: ${desconhecidos.join(", ")}`,
      )
      continue
    }
    if (g.members.length < 2) {
      problemas.push(`agrupamento "${g.label}": precisa de ao menos duas unidades`)
      continue
    }
    groups.push({ label: g.label, members: [...g.members] })
  }

  if (problemas.length > 0) {
    throw new GatewayError("NOT_ALLOWED", "Catálogo governado de unidades recusado", problemas)
  }

  return { catalog_version, entries, groups }
}

/** Projeção para o formato que `buildUnitIndex` consome. */
export function toUnitCatalog(governado: GovernedUnitCatalog): UnitCatalog {
  return {
    catalog_version: governado.catalog_version,
    units: governado.entries.map((e) => ({
      unit_id: e.unit_id,
      display_name: e.canonical_name,
      aliases: e.aliases,
      // `inactive` continua no índice: identidade conhecida não deixa de ser
      // conhecida porque a unidade fechou.
      active: e.status === "active",
    })),
  }
}

// ─── Resolução com agrupamentos ───────────────────────────────────────────────

/**
 * Canonicaliza reconhecendo AGRUPAMENTOS antes de tudo.
 *
 * A ordem importa: `Carpina e Limoeiro` contém `Carpina`, e qualquer caminho de
 * similaridade poderia se agarrar a um dos membros. O rótulo é conferido primeiro,
 * por igualdade de chave comparável — não por similaridade.
 *
 * Resultado de agrupamento: `ambiguous` com `reason: "GROUP_LABEL"` e os
 * `candidates` sendo exatamente os membros. NUNCA um membro escolhido, NUNCA um
 * valor dividido entre eles.
 */
export function canonicalizeWithGroups(
  raw: unknown,
  index: UnitIndex,
  port: UnitNormalizerPort,
  options: CanonicalizeOptions,
  groups: readonly UnitGroupLabel[],
): CanonicalUnitResult {
  const chave = port.comparableKey(raw)
  if (chave !== null && chave !== "") {
    for (const g of groups) {
      const chaveDoGrupo = port.comparableKey(g.label)
      if (chaveDoGrupo !== null && chaveDoGrupo === chave) {
        return {
          status: "ambiguous",
          candidates: [...g.members].sort(),
          raw_fingerprint: unitFingerprint(chave),
          reason: "GROUP_LABEL",
        }
      }
    }
  }
  return canonicalizeUnit(raw, index, port, options)
}

// ─── Catálogo completo, a partir de UNIDADES.xlsx ─────────────────────────────

interface ArtefatoCatalogo {
  readonly catalog_version: string
  /** Proveniência das fontes. O runtime não decide nada com isto — só o carrega. */
  readonly sources?: readonly {
    readonly role: string
    readonly file: string
    readonly sha256: string
  }[]
  readonly units: readonly {
    readonly unit_id: string
    readonly canonical_name: string
    readonly aliases: readonly string[]
    readonly status: string
  }[]
  readonly groups: readonly { readonly label: string; readonly members: readonly string[] }[]
}

/**
 * Projeta o artefato governado em catálogo de runtime. PROJEÇÃO, não enriquecimento.
 *
 * O artefato é DADO versionado (`catalog/unidades.catalog.json`), produzido pelo
 * build step `tools/xlsx_to_catalog.py` a partir de DUAS fontes governadas: a
 * planilha operacional e `governance/d13.alias-overrides.json`. Nada aqui abre
 * planilha, e nenhuma dependência de Excel existe em runtime.
 *
 * Até a Fase 2.6c esta função acrescentava aliases de um `ALIASES_GOVERNADOS`
 * escrito em TypeScript. Era uma segunda fonte de governança: regenerar a planilha
 * não reproduzia o catálogo efetivo, e nenhuma decisão humana podia ser auditada ou
 * removida pelo caminho governado. Os três aliases migraram para o arquivo de
 * overrides e o build step passou a mesclá-los antes de publicar.
 *
 * A invariante que substituiu aquilo: os aliases efetivos em runtime são
 * exatamente os aliases do artefato. Nenhum a mais, nenhum a menos, nenhum alvo
 * diferente. Um teste afirma essa projeção diretamente.
 */
export function buildGovernedCatalog(artefato: ArtefatoCatalogo): GovernedUnitCatalog {
  const rows: UnitCatalogRow[] = artefato.units.map((u) => ({
    unit_id: u.unit_id,
    canonical_name: u.canonical_name,
    // CÓPIA do artefato, não enriquecimento. Nenhum alias nasce aqui.
    aliases: [...u.aliases],
    status: u.status,
  }))

  const grupos: UnitCatalogRow[] = artefato.groups.map((g) => ({
    canonical_name: g.label,
    group_members: [...g.members],
  }))

  return importUnitCatalog(artefato.catalog_version, [...rows, ...grupos])
}

/**
 * O catálogo governado COMPLETO. Fonte única de verdade para D13.
 *
 * Substitui o seed parcial de 18 unidades da Fase 2.6b — ele existia porque
 * `UNIDADES.xlsx` não estava disponível, e manter os dois seria manter duas fontes
 * concorrentes.
 */
export const GOVERNED_UNIT_CATALOG: GovernedUnitCatalog = buildGovernedCatalog(
  ARTEFATO,
)
