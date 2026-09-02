/**
 * O portão de congelamento tem de FALHAR. Um portão que só passa é uma frase.
 *
 * Estes casos existem porque a conferência anterior — `find -newermt` — respondia
 * "zero arquivos alterados" mesmo com três contratos deletados. Ela não podia falhar
 * na direção que importava, e por isso passou por cinco relatórios sem acusar nada.
 */

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { contractNames, verifyFrozenContracts } from "../../scripts/verify-frozen-contracts"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const CONTRATOS = join(RAIZ, "contracts")
const MANIFESTO = join(CONTRATOS, "FROZEN.manifest.json")

/** Cópia isolada da árvore de contratos. Nenhum teste mexe no repositório real. */
function arvore(): { dir: string; limpar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "congelados-"))
  mkdirSync(join(dir, "contracts"), { recursive: true })
  cpSync(CONTRATOS, join(dir, "contracts"), { recursive: true })
  return { dir: join(dir, "contracts"), limpar: () => rmSync(dir, { recursive: true, force: true }) }
}

function conferir(dir: string) {
  return verifyFrozenContracts({ dir, manifest: MANIFESTO })
}

describe("portão de congelamento dos contratos canônicos", () => {
  it("A  árvore íntegra PASSA", () => {
    const { dir, limpar } = arvore()
    try {
      expect(conferir(dir)).toEqual([])
    } finally {
      limpar()
    }
  })

  it("B  um contrato canônico DELETADO falha — o caso que a conferência antiga não via", () => {
    const { dir, limpar } = arvore()
    try {
      rmSync(join(dir, "hermes-insight.schema.json"))
      const problemas = conferir(dir)
      expect(problemas.join(" ")).toContain("hermes-insight: AUSENTE")
    } finally {
      limpar()
    }
  })

  it("C  UM BYTE alterado falha", () => {
    const { dir, limpar } = arvore()
    try {
      const alvo = join(dir, "hermes-read-model.schema.json")
      writeFileSync(alvo, `${readFileSync(alvo, "utf8")} `)
      expect(conferir(dir).join(" ")).toContain("hermes-read-model: bytes ALTERADOS")
    } finally {
      limpar()
    }
  })

  it("D  cada um dos 13 canônicos é conferido, não só uma amostra", () => {
    const { canonicos } = contractNames()
    expect(canonicos).toHaveLength(13)
    for (const nome of canonicos) {
      const { dir, limpar } = arvore()
      try {
        rmSync(join(dir, `${nome}.schema.json`))
        expect(conferir(dir).join(" "), nome).toContain(`${nome}: AUSENTE`)
      } finally {
        limpar()
      }
    }
  })

  it("E  contrato RETIRADO que reaparece falha", () => {
    // `decision` aceitava `decided_by_role: "HERMES"`. Ressuscitá-lo reabriria o
    // segundo caminho de autoridade que a 3.0a fechou.
    const { dir, limpar } = arvore()
    try {
      writeFileSync(join(dir, "decision.schema.json"), '{"$id":"decision"}')
      expect(conferir(dir).join(" ")).toContain("decision: RETIRADO")
    } finally {
      limpar()
    }
  })

  it("F  os três retirados da 3.0a estão nomeados e ausentes", () => {
    const { retirados } = contractNames()
    expect([...retirados].sort()).toEqual(["aros-briefing", "decision", "recommendation"])
    expect(conferir(CONTRATOS)).toEqual([])
  })

  it("F2 entrada canônica SOBRANDO no manifesto falha", () => {
    // O manifesto liga nome a hash. Ele NÃO decide quem é canônico — se pudesse
    // acrescentar um nome, seria uma segunda autoridade de associação, e a que
    // valeria seria a que ninguém olhou.
    const { dir, limpar } = arvore()
    try {
      const base = JSON.parse(readFileSync(MANIFESTO, "utf8")) as {
        withdrawn: string[]
        canonical: Record<string, string>
      }
      base.canonical["intruso"] = "0".repeat(64)
      const tmp = join(dir, "FROZEN.intruso.json")
      writeFileSync(tmp, JSON.stringify(base))
      expect(verifyFrozenContracts({ dir, manifest: tmp }).join(" ")).toContain(
        "intruso: na linha de base mas fora de CONTRACT_NAMES",
      )
    } finally {
      limpar()
    }
  })

  it("F3 hash de contrato RETIRADO no manifesto não o torna canônico", () => {
    const { dir, limpar } = arvore()
    try {
      const base = JSON.parse(readFileSync(MANIFESTO, "utf8")) as {
        withdrawn: string[]
        canonical: Record<string, string>
      }
      base.canonical["decision"] = "0".repeat(64)
      const tmp = join(dir, "FROZEN.retirado.json")
      writeFileSync(tmp, JSON.stringify(base))
      expect(verifyFrozenContracts({ dir, manifest: tmp }).join(" ")).toContain("decision")
    } finally {
      limpar()
    }
  })

  it("G  linha de base ausente é RECUSA, não aprovação silenciosa", () => {
    // Sem linha de base não se sabe nada — e não saber nunca é estar íntegro.
    expect(verifyFrozenContracts({ dir: CONTRATOS, manifest: "/inexistente.json" }).join(" ")).toContain(
      "linha de base ausente",
    )
  })

  it("H  um nome novo na autoridade é imediatamente exigido pelo portão", () => {
    const real = contractNames()
    const comNovo = { canonicos: [...real.canonicos, "inventado"], retirados: real.retirados }
    expect(
      verifyFrozenContracts({ dir: CONTRATOS, manifest: MANIFESTO, membership: comNovo }).join(" "),
    ).toContain("inventado")
  })

  it("I  o repositório real está íntegro AGORA", () => {
    expect(verifyFrozenContracts()).toEqual([])
  })
})

/**
 * A regressão que o regate r5-r1 exigiu.
 *
 * O defeito: `validate-schemas` tinha a PRÓPRIA lista de contratos. Acrescentar um
 * nome canônico ao registro governado, registrar o hash congelado dele e esquecer da
 * segunda lista fazia o portão de congelamento aprovar um schema que a validação
 * nunca compilava.
 *
 * Estes testes montam uma árvore sintética completa e rodam o PIPELINE DE VERDADE.
 * Asserção sobre `exitCode`, nunca sobre texto impresso: um script que imprime
 * "falhou" e sai com 0 é um script que passa.
 */
describe("associação canônica alcança a compilação de schema", () => {
  /**
   * Toda árvore sintética criada aqui fica registrada ANTES de qualquer outra
   * operação. Sem isto, uma falha no meio do próprio `bancada()` — um `cpSync`
   * que estoura, um schema que não serializa — deixava o diretório para trás
   * dentro da árvore de trabalho, sujando `git status`. O `finally` de cada
   * teste não alcança esse caso: naquele ponto o `bancada()` nem retornou.
   */
  const criados: string[] = []

  afterEach(() => {
    for (const dir of criados.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /** Árvore sintética DENTRO do repo — é o que resolve `node_modules`. */
  function bancada(nomeNovo: string, schemaNovo: unknown) {
    const dir = mkdtempSync(join(RAIZ, ".tmp-membership-"))
    criados.push(dir)
    mkdirSync(join(dir, "scripts"), { recursive: true })
    mkdirSync(join(dir, "gateway", "src"), { recursive: true })
    cpSync(CONTRATOS, join(dir, "contracts"), { recursive: true })
    cpSync(join(RAIZ, "fixtures"), join(dir, "fixtures"), { recursive: true })
    for (const s of ["validate-schemas.ts", "verify-frozen-contracts.ts"]) {
      cpSync(join(RAIZ, "scripts", s), join(dir, "scripts", s))
    }

    // O nome novo entra SÓ pelo registro governado. Em lugar nenhum mais.
    const registro = readFileSync(join(RAIZ, "gateway/src/contract-registry.ts"), "utf8")
    writeFileSync(
      join(dir, "gateway", "src", "contract-registry.ts"),
      registro.replace('  "shared-briefing",\n] as const', `  "shared-briefing",\n  "${nomeNovo}",\n] as const`),
    )

    // E o schema novo ganha o hash congelado correto — para que a falha NÃO venha
    // de linha de base ausente, e sim da compilação.
    const bytes = `${JSON.stringify(schemaNovo, null, 2)}\n`
    writeFileSync(join(dir, "contracts", `${nomeNovo}.schema.json`), bytes)
    const base = JSON.parse(readFileSync(MANIFESTO, "utf8")) as {
      withdrawn: string[]
      canonical: Record<string, string>
    }
    base.canonical[nomeNovo] = createHash("sha256").update(bytes).digest("hex")
    writeFileSync(join(dir, "contracts", "FROZEN.manifest.json"), `${JSON.stringify(base, null, 2)}\n`)

    return { dir, limpar: () => rmSync(dir, { recursive: true, force: true }) }
  }

  function rodar(dir: string, script: string) {
    return spawnSync("npx", ["tsx", join(dir, "scripts", script)], { cwd: RAIZ, encoding: "utf8" })
  }

  const VALIDO = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "sintetico-valido",
    type: "object",
    additionalProperties: false,
    properties: { id: { type: "string" } },
    required: ["id"],
  }

  it("nome canônico novo + hash correto + schema QUE NÃO COMPILA → pipeline falha", () => {
    // `palavraDesconhecida` derruba o Ajv em `strict: true`.
    const { dir, limpar } = bancada("sintetico-invalido", { ...VALIDO, palavraDesconhecida: 1 })
    try {
      // O congelamento passa: o arquivo existe e o hash bate. A falha tem de vir da
      // COMPILAÇÃO — é isso que prova que a associação chegou lá.
      const freeze = rodar(dir, "verify-frozen-contracts.ts")
      expect(freeze.status, freeze.stderr).toBe(0)

      const validate = rodar(dir, "validate-schemas.ts")
      expect(validate.status).not.toBe(0)
      expect(validate.stderr).toContain("sintetico-invalido")
    } finally {
      limpar()
    }
  }, 60_000)

  it("nome canônico novo + hash correto + schema VÁLIDO → pipeline passa", () => {
    // Sem isto, uma implementação que simplesmente recusa todo nome novo passaria
    // no teste acima sem nunca compilar nada.
    const { dir, limpar } = bancada("sintetico-valido", VALIDO)
    try {
      expect(rodar(dir, "verify-frozen-contracts.ts").status).toBe(0)
      const validate = rodar(dir, "validate-schemas.ts")
      expect(validate.status, validate.stderr).toBe(0)
      expect(validate.stdout).toContain("14 contratos compilam")
    } finally {
      limpar()
    }
  }, 60_000)

  it("nome canônico novo SEM linha de base congelada → portão falha antes", () => {
    const { dir, limpar } = bancada("sintetico-sem-base", VALIDO)
    try {
      const base = JSON.parse(readFileSync(join(dir, "contracts", "FROZEN.manifest.json"), "utf8")) as {
        canonical: Record<string, string>
      }
      delete base.canonical["sintetico-sem-base"]
      writeFileSync(join(dir, "contracts", "FROZEN.manifest.json"), `${JSON.stringify(base, null, 2)}\n`)
      const freeze = rodar(dir, "verify-frozen-contracts.ts")
      expect(freeze.status).not.toBe(0)
      expect(freeze.stderr).toContain("sem linha de base")
    } finally {
      limpar()
    }
  }, 60_000)

  it("validate-schemas NÃO lê o manifesto de hashes", () => {
    // Se a associação viesse de `Object.keys(FROZEN.manifest.json)`, o manifesto
    // viraria autoridade semântica. Hoje as duas listas coincidem — então só uma
    // conferência ESTRUTURAL distingue de qual delas o validador depende.
    const fonte = readFileSync(join(RAIZ, "scripts/validate-schemas.ts"), "utf8")
    expect(fonte).not.toContain("FROZEN.manifest")
    expect(fonte).not.toContain("canonical")
  })

  it("não sobrou lista de contratos própria em validate-schemas", () => {
    const fonte = readFileSync(join(RAIZ, "scripts/validate-schemas.ts"), "utf8")
    expect(fonte).toContain('import { CONTRACT_NAMES } from "../gateway/src/contract-registry"')

    // ─── O que este teste NÃO acusa, e por quê ─────────────────────────────
    //
    // `snapshot`, `event` e `evidence` continuam aparecendo como literais: eles
    // nomeiam DIRETÓRIOS de fixture, que é outra coisa. Acusá-los seria confundir
    // "mapa de fixture" com "lista de associação" e obrigar a contorcer código
    // correto para calar um teste.
    //
    // Os dez contratos da 3.0a não têm diretório de fixture próprio — se algum
    // aparecer literal aqui, é lista de associação renascendo.
    const executavel = fonte.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "")
    const semFixture = contractNames().canonicos.filter(
      (n) => !["snapshot", "event", "evidence"].includes(n),
    )
    expect(semFixture).toHaveLength(10)
    for (const nome of semFixture) {
      expect(executavel, nome).not.toContain(`"${nome}"`)
    }
  })
})
