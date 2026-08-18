/**
 * Provider de `expected_units` sobre artefato governado versionado.
 *
 * Existe para provar o contrato com dado que dá para revisar num diff, antes de
 * qualquer decisão sobre storage. Trocar por Supabase, Drive ou outra fonte é
 * trocar esta classe — a lógica de cobertura não sabe de onde o dado veio.
 *
 * ─── O diretório de produção está VAZIO, e isso é o estado correto ────────────
 *
 * `governance/expected-units/` não contém membership nenhuma. Não temos os dados
 * reais, e inventá-los seria pior que não tê-los: uma cobertura calculada sobre
 * denominador fabricado é um número executivo falso que ninguém tem como
 * questionar.
 *
 * Enquanto o diretório estiver vazio, produção responde `DATA_NOT_AVAILABLE` para
 * todo período e dataset. É fail-closed, e é visível.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { GatewayError } from "../../gateway/src/errors"
import { validateExpectedUnits } from "./expected-units"
import type {
  ExpectedUnitsLookup,
  ExpectedUnitsProvider,
  ExpectedUnitsQuery,
} from "./expected-units"
import { GOVERNED_UNIT_CATALOG } from "./unit-catalog"
import type { GovernedUnitCatalog } from "./unit-catalog"

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/
const IDENTIFICADOR = /^[a-z0-9][a-z0-9_.:-]{2,127}$/

/**
 * Nome de arquivo derivado de `period` e `dataset_id`.
 *
 * Separador `__` porque `dataset_id` admite `-`, `.` e `:` — um separador de um
 * caractere criaria ambiguidade entre `2026-08` e um dataset que comece com
 * dígito. E os dois componentes são validados antes de virarem caminho: um
 * `dataset_id` com `/` ou `..` seria travessia de diretório.
 */
function nomeDoArquivo(q: ExpectedUnitsQuery): string {
  if (!PERIODO.test(q.period)) {
    throw new GatewayError("SCHEMA_INVALID", "Consulta de expected_units inválida", [
      `period: AAAA-MM obrigatório, recebido ${JSON.stringify(q.period)}`,
    ])
  }
  if (!IDENTIFICADOR.test(q.dataset_id)) {
    throw new GatewayError("SCHEMA_INVALID", "Consulta de expected_units inválida", [
      `dataset_id: identificador governado obrigatório, recebido ${JSON.stringify(q.dataset_id)}`,
    ])
  }
  return `${q.period}__${q.dataset_id}.json`
}

export class FileExpectedUnitsProvider implements ExpectedUnitsProvider {
  readonly #raiz: string
  readonly #catalogo: GovernedUnitCatalog

  constructor(raiz: string, catalogo: GovernedUnitCatalog = GOVERNED_UNIT_CATALOG) {
    this.#raiz = raiz
    this.#catalogo = catalogo
  }

  getExpectedUnits(query: ExpectedUnitsQuery): ExpectedUnitsLookup {
    const caminho = join(this.#raiz, nomeDoArquivo(query))

    // Arquivo ausente é ausência de DADO. Não é lista vazia, e não é erro de
    // programa: é a resposta governada para "não existe membership para isto".
    if (!existsSync(caminho)) {
      return Object.freeze({
        status: "DATA_NOT_AVAILABLE" as const,
        period: query.period,
        dataset_id: query.dataset_id,
        detail: "nenhum dataset governado de expected_units para este período e dataset",
      })
    }

    const bytes = readFileSync(caminho, "utf8")

    let bruto: unknown
    try {
      bruto = JSON.parse(bytes)
    } catch {
      // Arquivo corrompido NÃO vira ausência: ausência é uma afirmação sobre o
      // negócio, corrupção é um defeito. Tratá-los igual esconderia o defeito.
      throw new GatewayError("SCHEMA_INVALID", "Dataset de expected_units ilegível", [
        `${caminho}: JSON inválido`,
      ])
    }

    // A verificação de `content_hash` contra o material da membership vive no
    // validador, onde o material canônico existe. Aqui só resta a coerência entre
    // o que o arquivo declara e o que foi consultado.
    const membership = validateExpectedUnits(bruto, this.#catalogo)

    // Coerência entre a consulta e o que o arquivo declara. Um arquivo nomeado
    // para agosto declarando setembro atenderia a consulta errada em silêncio.
    if (membership.period !== query.period || membership.dataset_id !== query.dataset_id) {
      throw new GatewayError("SCHEMA_INVALID", "Dataset de expected_units incoerente", [
        `${caminho}: declara ${membership.period}/${membership.dataset_id}, ` +
          `consultado ${query.period}/${query.dataset_id}`,
      ])
    }

    return Object.freeze({ status: "available" as const, membership })
  }
}

/**
 * O diretório governado de produção.
 *
 * Relativo a este módulo para não depender do diretório de trabalho do processo.
 */
export const PRODUCTION_EXPECTED_UNITS_DIR = new URL(
  "../../governance/expected-units/",
  import.meta.url,
).pathname

/**
 * O provider de PRODUÇÃO. Hoje responde `DATA_NOT_AVAILABLE` para tudo.
 *
 * Não é um stub: é o provider real apontando para o diretório governado real, que
 * está vazio porque os dados não existem. Quando existirem, eles entram lá e este
 * objeto passa a servi-los sem nenhuma mudança de código.
 */
export const PRODUCTION_EXPECTED_UNITS_PROVIDER = new FileExpectedUnitsProvider(
  PRODUCTION_EXPECTED_UNITS_DIR,
)
