/**
 * Carga e validação dos contratos de dados.
 *
 * Os schemas são lidos de `contracts/` em tempo de execução, e não importados
 * como módulo, de propósito: o contrato é um artefato versionado e revisável por
 * si só, não um detalhe de build. Trocar um contrato não exige recompilar nada.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { GatewayError } from "./errors"

export const CONTRACT_NAMES = [
  "snapshot",
  "event",
  "evidence",
  "recommendation",
  "decision",
  "aros-briefing",
] as const

export type ContractName = (typeof CONTRACT_NAMES)[number]

const CONTRACTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts")

export interface ValidationIssue {
  readonly path: string
  readonly message: string
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] }

function loadSchema(name: ContractName): object {
  const raw = readFileSync(join(CONTRACTS_DIR, `${name}.schema.json`), "utf8")
  return JSON.parse(raw) as object
}

/**
 * `strict: true` é intencional: um schema com palavra-chave desconhecida ou
 * `additionalProperties` esquecido falha ao compilar em vez de validar de menos.
 * Um contrato que valida menos do que aparenta é pior que nenhum contrato.
 *
 * `strictRequired` é a única exceção, e não por conveniência: ele exige que toda
 * propriedade citada em `required` esteja declarada no MESMO objeto de schema.
 * Isso é incompatível com `if/then`, que é justamente como as invariantes de
 * classe de dado são expressas ("calculated exige formula", "forecast exige
 * faixa") — as propriedades vivem no schema pai. Mantê-lo ligado obrigaria a
 * duplicar declarações dentro de cada `then`, o que aumenta a chance de as duas
 * cópias divergirem. Trocaríamos um lint por um risco real.
 */
function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    strictRequired: false,
    allErrors: true,
    allowUnionTypes: false,
  })
  addFormats(ajv)
  return ajv
}

const ajv = buildAjv()
const validators = new Map<ContractName, ReturnType<Ajv2020["compile"]>>()

for (const name of CONTRACT_NAMES) {
  validators.set(name, ajv.compile(loadSchema(name)))
}

export function validate(contract: ContractName, payload: unknown): ValidationResult {
  const validator = validators.get(contract)
  if (validator === undefined) {
    throw new GatewayError("SCHEMA_INVALID", `Contrato desconhecido: ${contract}`)
  }

  if (validator(payload)) return { ok: true }

  const issues: ValidationIssue[] = (validator.errors ?? []).map((e) => ({
    path: e.instancePath === "" ? "$" : `$${e.instancePath}`,
    message: e.message ?? "inválido",
  }))

  return { ok: false, issues }
}

/**
 * Validação que aborta.
 *
 * É o que o §8.3 exige da saída do Hermes: falha de schema IMPEDE a resposta de
 * ser apresentada como recomendação. Não existe caminho "válido o suficiente".
 */
export function assertValid(contract: ContractName, payload: unknown): void {
  const result = validate(contract, payload)
  if (!result.ok) {
    throw new GatewayError(
      "SCHEMA_INVALID",
      `Payload não satisfaz o contrato "${contract}"`,
      result.issues.map((i) => `${i.path}: ${i.message}`),
    )
  }
}

/** Exposto para os testes verificarem que todo contrato compila. */
export function loadedContracts(): readonly ContractName[] {
  return [...validators.keys()]
}
