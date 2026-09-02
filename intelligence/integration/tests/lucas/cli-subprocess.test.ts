/**
 * Fase 2.12d — o comando `npm` REAL, como subprocesso.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * A 2.12c testou `runLucasAnalysisCommand` importando-a. Isso prova a lógica do
 * comando e **não** prova que o comando roda: o teste importa dentro do Vitest, que
 * já resolveu todo o grafo de módulos com o `node_modules` da árvore de
 * desenvolvimento.
 *
 * O gate encontrou o custo: `google-auth-library` estava declarada no pacote RAIZ, não
 * em `intelligence/`. O comando funcionava no meu terminal por hoisting do pai, e uma
 * instalação limpa do subprojeto falharia com `ERR_MODULE_NOT_FOUND` antes de chegar
 * ao contrato de bootstrap.
 *
 * E a verificação isolada encontrou um segundo caso, mais fundo: `ajv` e `ajv-formats`
 * estavam em `devDependencies`, e `gateway/src/contracts.ts` as importa no caminho de
 * produção — `toSnapshot` → `assertValid`. Nenhum teste que importe módulos teria
 * visto isso.
 *
 * ─── O que este arquivo cobre e os outros não ─────────────────────────────────
 *
 * A fronteira aqui inclui o que só existe fora do processo de teste:
 *
 *   npm script  →  loader tsx  →  resolução de módulos  →  guarda de execução
 *                direta  →  CLI  →  bootstrap  →  código de saída do processo
 *
 * Nenhum mock, nenhum import do módulo sob teste.
 *
 * ─── O que este arquivo NÃO prova ─────────────────────────────────────────────
 *
 * Ele roda com `cwd` no diretório REAL do pacote. A resolução de módulos pode usar o
 * `node_modules` de desenvolvimento local e subir para o do repositório pai — então
 * uma dependência de produção mal declarada pode passar por aqui. O gate da 2.12d
 * apontou exatamente isso, e a versão anterior deste comentário afirmava o contrário.
 *
 * A prova do fecho standalone é `packaging-isolated.test.ts`: cópia para fora da
 * árvore do repositório, `npm ci --omit=dev`, e o mesmo comando sobre uma instalação
 * que não tem de onde herdar nada.
 *
 * Os dois testes ficam, porque provam coisas diferentes e a barata pega defeito antes:
 *
 *   guarda de grafo de imports   →  import externo não declarado, sem instalar nada
 *   este arquivo                 →  o comando existe e responde na árvore de trabalho
 *   packaging-isolated           →  o manifesto+lock instalam e executam sozinhos
 */

import { describe, expect, it } from "vitest"
import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const RAIZ_PKG = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

interface Execucao {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * Roda `npm run <script>` de verdade, com o ambiente controlado.
 *
 * As variáveis de credencial são REMOVIDAS do ambiente do filho — não sobrescritas
 * com vazio — para que o teste não dependa de a máquina não tê-las. Numa máquina
 * configurada, sobrescrever seria a diferença entre o teste medir o que quer e o
 * comando tentar ler o Drive de verdade.
 */
function rodarNpm(script: string, timeoutMs = 120_000): Promise<Execucao> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "GOOGLE_SERVICE_ACCOUNT_EMAIL" || k === "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") continue
    if (v !== undefined) env[k] = v
  }
  return new Promise((ok) => {
    execFile(
      "npm",
      ["run", "--silent", script],
      { cwd: RAIZ_PKG, env, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (erro, stdout, stderr) => {
        const code =
          erro === null ? 0 : typeof (erro as { code?: unknown }).code === "number" ? (erro as { code: number }).code : 1
        ok({ code, stdout, stderr })
      },
    )
  })
}

describe("§7/§8 — o comando npm REAL, sem credencial", () => {
  it(
    "sai 1 com bootstrap_failure, e NENHUM erro de resolução de módulo",
    async () => {
      const r = await rodarNpm("lucas:analyze")

      // ─── O que o gate pediu para provar ──────────────────────────────────
      //
      // Se alguma dependência de produção estiver mal declarada, o processo morre
      // aqui, antes do CLI, e este `expect` falha com a mensagem do Node.
      const tudo = `${r.stdout}\n${r.stderr}`
      expect(tudo).not.toContain("ERR_MODULE_NOT_FOUND")
      expect(tudo).not.toContain("Cannot find package")
      expect(tudo).not.toContain("Cannot find module")

      // §8 — exit 1: falha de BOOTSTRAP, não resultado governado.
      expect(r.code).toBe(1)

      // O resultado estruturado saiu em stderr, e é o do contrato.
      const linha = /\{"status":"bootstrap_failure".*\}/u.exec(r.stderr)
      expect(linha, `stderr: ${r.stderr.slice(0, 400)}`).not.toBeNull()
      const j = JSON.parse(linha?.[0] ?? "{}") as Record<string, unknown>
      expect(j["status"]).toBe("bootstrap_failure")
      expect(j["dataset_id"]).toBe("lucas_status_contratos_mensal")
      expect(JSON.stringify(j)).toContain("GOOGLE_SERVICE_ACCOUNT_EMAIL")

      // §8 — stdout NÃO tem resultado de análise fabricado.
      expect(r.stdout).not.toContain('"d_executed"')
      expect(r.stdout).not.toContain('"source_not_available"')
    },
    180_000,
  )

  it(
    "§9 — a guarda de execução direta funciona sob o `tsx` real",
    async () => {
      // O comando de fato RODOU: produziu o JSON de bootstrap. Se a guarda
      // `import.meta.url === argv[1]` não valesse sob o loader do tsx, o processo
      // sairia 0 sem imprimir nada.
      const r = await rodarNpm("lucas:analyze")
      expect(r.stderr).toContain("bootstrap_failure")
      expect(r.code).not.toBe(0)
    },
    180_000,
  )

  it(
    "§15 — nenhum segredo nem PII na saída do processo",
    async () => {
      const r = await rodarNpm("lucas:analyze")
      const tudo = `${r.stdout}\n${r.stderr}`
      for (const proibido of [
        "PRIVATE KEY",
        "Bearer ",
        "Authorization",
        "row_key",
        "ticket_cents",
        "evidence_id",
      ]) {
        expect(tudo, proibido).not.toContain(proibido)
      }
      // Nenhum CPF: 11 dígitos seguidos ou a forma pontuada.
      expect(tudo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
      expect(tudo).not.toMatch(/\b\d{11}\b/u)
    },
    180_000,
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// §1/§2/§3 — o fecho de dependências do subprojeto
// ═════════════════════════════════════════════════════════════════════════════

describe("§1/§2/§3 — `intelligence` declara o próprio fecho de produção", () => {
  const pkg = JSON.parse(readFileSync(resolve(RAIZ_PKG, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }
  const lock = JSON.parse(readFileSync(resolve(RAIZ_PKG, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { version?: string }>
  }

  /**
   * Os pacotes externos que o grafo de PRODUÇÃO importa.
   *
   * Levantados dos `import` de `gateway/src`, `detectors/src` e `integration/src`,
   * não de memória: `ajv` (via `ajv/dist/2020.js`), `ajv-formats` e
   * `google-auth-library`. `tsx` entra porque é o loader que executa o comando.
   */
  const PRODUCAO = ["ajv", "ajv-formats", "google-auth-library", "tsx"] as const

  it("cada dependência de runtime está em `dependencies`, não em `devDependencies`", () => {
    for (const m of PRODUCAO) {
      expect(pkg.dependencies?.[m], `${m} deve estar em dependencies`).toBeDefined()
      expect(pkg.devDependencies?.[m], `${m} NÃO pode estar em devDependencies`).toBeUndefined()
    }
  })

  it("o lockfile do próprio subprojeto resolve todas elas", () => {
    // Sem isto, `npm ci` do subprojeto instalaria um fecho diferente do declarado.
    for (const m of PRODUCAO) {
      expect(lock.packages?.[`node_modules/${m}`]?.version, m).toBeDefined()
    }
  })

  it("nenhum import de produção ficou fora da declaração", () => {
    // Varre o grafo de produção e afirma que todo pacote externo importado está
    // declarado. É o guard que impede o defeito de voltar: um import novo de
    // pacote não declarado falha aqui, antes de falhar numa instalação limpa.
    const fontes: string[] = []
    const dirs = ["gateway/src", "detectors/src", "integration/src"]
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
    const andar = (d: string): void => {
      for (const e of readdirSync(resolve(RAIZ_PKG, d))) {
        const p = `${d}/${e}`
        const st = statSync(resolve(RAIZ_PKG, p))
        if (st.isDirectory()) andar(p)
        else if (e.endsWith(".ts")) fontes.push(readFileSync(resolve(RAIZ_PKG, p), "utf8"))
      }
    }
    for (const d of dirs) andar(d)

    const externos = new Set<string>()
    for (const src of fontes) {
      for (const m of src.matchAll(/^\s*(?:import|export)[^"']*from\s+["']([^"']+)["']/gmu)) {
        const spec = m[1]
        if (spec === undefined) continue
        if (spec.startsWith(".") || spec.startsWith("node:")) continue
        // `ajv/dist/2020.js` → pacote `ajv`.
        const nome = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
        if (nome !== undefined) externos.add(nome)
      }
    }

    const naoDeclarados = [...externos].filter((m) => pkg.dependencies?.[m] === undefined).sort()
    expect(
      naoDeclarados,
      `pacotes importados no grafo de produção e ausentes de dependencies: ${naoDeclarados.join(", ")}`,
    ).toEqual([])
  })

  it("§16 — o comando de produção continua sendo `lucas:analyze`", () => {
    expect(pkg.scripts?.["lucas:analyze"]).toContain("integration/src/lucas/cli.ts")
  })
})
