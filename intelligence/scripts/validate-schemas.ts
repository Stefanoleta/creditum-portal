/**
 * Validação de contratos, independente do runner de testes.
 *
 * Existe separado de propósito: `npm test` prova que o CÓDIGO se comporta;
 * este script prova que os CONTRATOS e as FIXTURES estão íntegros. São coisas
 * distintas, e quem revisa um contrato precisa poder verificá-lo sem rodar a
 * suíte inteira.
 *
 * Sai com código 1 na primeira inconsistência acumulada. Não conserta nada.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { CONTRACT_NAMES } from "../gateway/src/contract-registry"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * A associação NÃO é declarada aqui.
 *
 * Até a r5-r1 este arquivo tinha a própria lista de contratos. Um regate mostrou o
 * buraco: acrescentar um nome canônico ao registro governado, registrar o hash
 * congelado dele e esquecer desta cópia fazia o portão de congelamento aprovar um
 * schema que este script nunca compilava.
 *
 * Agora todo nome canônico chega à compilação por construção — não por alguém ter
 * lembrado de editar dois arquivos.
 */
const CONTRACTS: readonly string[] = CONTRACT_NAMES

/** Mesmas opções de `gateway/src/contracts.ts` — divergir aqui esconderia bug. */
const ajv = new Ajv2020({
  strict: true,
  strictRequired: false,
  allErrors: true,
  allowUnionTypes: false,
})
addFormats(ajv)

const problems: string[] = []
const validators = new Map<string, ReturnType<Ajv2020["compile"]>>()

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"))
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
}

// 1. Todo contrato compila sob strict.
for (const name of CONTRACTS) {
  const path = join(ROOT, "contracts", `${name}.schema.json`)
  try {
    validators.set(name, ajv.compile(readJson(path)))
  } catch (err) {
    problems.push(`contrato ${name}: não compila — ${(err as Error).message}`)
  }
}

// 2. Toda fixture satisfaz seu contrato.
const FIXTURE_DIRS: readonly (readonly [string, string])[] = [
  ["snapshot", join(ROOT, "fixtures", "synthetic", "snapshots")],
  ["event", join(ROOT, "fixtures", "synthetic", "events")],
  ["evidence", join(ROOT, "fixtures", "synthetic", "evidence")],
]

let checked = 0

for (const [contract, dir] of FIXTURE_DIRS) {
  const validator = validators.get(contract)
  if (validator === undefined) continue

  for (const file of listJson(dir)) {
    checked++
    if (!validator(readJson(join(dir, file)))) {
      for (const e of validator.errors ?? []) {
        problems.push(`${contract}/${file}: ${e.instancePath || "$"} ${e.message}`)
      }
    }
  }
}

// 3. Conjunto dourado — o contrato é inferido do prefixo do arquivo.
const goldenDir = join(ROOT, "fixtures", "golden")
for (const file of listJson(goldenDir)) {
  const contract = CONTRACTS.find((c) => file.startsWith(c.replace("-", "_")) || file.startsWith(c))
  if (contract === undefined) {
    problems.push(`golden/${file}: nome não indica contrato — renomeie com o prefixo do contrato`)
    continue
  }
  const validator = validators.get(contract)
  if (validator === undefined) continue

  checked++
  if (!validator(readJson(join(goldenDir, file)))) {
    for (const e of validator.errors ?? []) {
      problems.push(`golden/${file}: ${e.instancePath || "$"} ${e.message}`)
    }
  }
}

if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} problema(s) de contrato:\n`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error("")
  process.exit(1)
}

console.log(`✓ ${CONTRACTS.length} contratos compilam · ${checked} fixtures válidas`)
