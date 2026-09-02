/**
 * O portão de congelamento dos contratos canônicos.
 *
 * ─── O defeito que ele existe para fechar ─────────────────────────────────────
 *
 * A verificação anterior era `find contracts -newermt <T>`: "nenhum arquivo mais novo
 * que T". Um arquivo DELETADO nunca é mais novo que T — ele não existe. A conferência
 * respondia sempre "zero" e não podia falhar na direção que importava.
 *
 * Uma conferência que não pode falhar não é uma conferência. É uma frase.
 *
 * ─── Duas perguntas, e só duas ────────────────────────────────────────────────
 *
 *   1. cada contrato CANÔNICO existe e tem os bytes congelados?
 *   2. cada contrato RETIRADO continua ausente?
 *
 * A segunda importa tanto quanto a primeira: `decision` aceitava
 * `decided_by_role: "HERMES"`, e `aros-briefing` tinha `approved_by_human` sem
 * DecisionRecord. Ressuscitá-los reabre o segundo caminho de autoridade que a 3.0a
 * fechou — e "HERMES RECOMENDA, STEFANO DECIDE" deixaria de ser verdade no schema.
 *
 * ─── Autoridade única ─────────────────────────────────────────────────────────
 *
 * A lista de nomes NÃO é declarada aqui. Ela vem de `gateway/src/contracts.ts`, que já
 * é o que torna um contrato canônico. Uma segunda lista divergiria, e a que valeria
 * seria a que ninguém olhou.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { CONTRACT_NAMES, WITHDRAWN_CONTRACT_NAMES } from "../gateway/src/contract-registry"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const CONTRACTS_DIR = join(ROOT, "contracts")
const MANIFEST = join(CONTRACTS_DIR, "FROZEN.manifest.json")

export interface Membership {
  readonly canonicos: readonly string[]
  readonly retirados: readonly string[]
}

/**
 * A associação vem do registro governado — por IMPORT, não por leitura de fonte.
 *
 * A r5-r1 extraía os nomes com regex sobre o texto de `contracts.ts`. Funcionava, e
 * era frágil pela mesma razão que qualquer derivação de segunda mão: uma mudança de
 * formatação no arquivo lido poderia mudar o resultado sem mudar a autoridade.
 */
export function contractNames(): Membership {
  return { canonicos: [...CONTRACT_NAMES], retirados: [...WITHDRAWN_CONTRACT_NAMES] }
}

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/**
 * Confere a árvore contra a linha de base. Devolve a lista de problemas; vazia é
 * aprovação. Nunca lança por conta própria — quem chama decide o que fazer.
 */
export interface VerifyOptions {
  readonly dir?: string
  readonly manifest?: string
  /** SOMENTE TESTE: associação sintética, para provar que um nome novo é exigido. */
  readonly membership?: Membership
}

export function verifyFrozenContracts({
  dir = CONTRACTS_DIR,
  manifest = MANIFEST,
  membership,
}: VerifyOptions = {}): string[] {
  const problemas: string[] = []
  const { canonicos, retirados } = membership ?? contractNames()

  if (!existsSync(manifest)) return [`linha de base ausente: ${manifest}`]
  const base = JSON.parse(readFileSync(manifest, "utf8")) as {
    readonly canonical?: Record<string, string>
    readonly withdrawn?: readonly string[]
  }

  for (const nome of canonicos) {
    const caminho = join(dir, `${nome}.schema.json`)
    const esperado = base.canonical?.[nome]
    if (esperado === undefined) {
      problemas.push(`${nome}: canônico sem linha de base`)
      continue
    }
    if (!existsSync(caminho)) {
      // AUSENTE é o caso que a conferência antiga não via.
      problemas.push(`${nome}: AUSENTE`)
      continue
    }
    const atual = sha256(readFileSync(caminho))
    if (atual !== esperado) problemas.push(`${nome}: bytes ALTERADOS`)
  }

  for (const nome of base.canonical === undefined ? [] : Object.keys(base.canonical)) {
    if (!canonicos.includes(nome)) problemas.push(`${nome}: na linha de base mas fora de CONTRACT_NAMES`)
  }

  for (const nome of retirados) {
    if (existsSync(join(dir, `${nome}.schema.json`))) {
      problemas.push(`${nome}: RETIRADO na 3.0a e presente de novo`)
    }
    if (canonicos.includes(nome)) problemas.push(`${nome}: retirado e canônico ao mesmo tempo`)
  }
  return problemas
}

/** `--write` grava a linha de base a partir da árvore atual. Uso deliberado, nunca automático. */
function main(): void {
  if (process.argv.includes("--write")) {
    const { canonicos, retirados } = contractNames()
    const canonical: Record<string, string> = {}
    for (const nome of canonicos) {
      canonical[nome] = sha256(readFileSync(join(CONTRACTS_DIR, `${nome}.schema.json`)))
    }
    writeFileSync(MANIFEST, `${JSON.stringify({ withdrawn: retirados, canonical }, null, 2)}\n`)
    process.stdout.write(`linha de base gravada: ${canonicos.length} canônicos, ${retirados.length} retirados\n`)
    return
  }
  const problemas = verifyFrozenContracts()
  if (problemas.length > 0) {
    process.stderr.write(`✗ contratos congelados:\n${problemas.map((p) => `  - ${p}`).join("\n")}\n`)
    process.exit(1)
  }
  const { canonicos, retirados } = contractNames()
  process.stdout.write(`✓ ${canonicos.length} contratos canônicos íntegros · ${retirados.length} retirados ausentes\n`)
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) main()
