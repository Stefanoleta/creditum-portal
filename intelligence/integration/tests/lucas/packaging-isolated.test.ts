/**
 * Fase 2.12e — a instalação de produção, provada FORA do repositório.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * A 2.12d corrigiu as declarações de dependência e eu verifiquei o fecho com uma
 * instalação isolada — **à mão, no terminal**. O teste automatizado continuou rodando
 * com `cwd` no diretório real do pacote, onde a resolução de módulos pode subir para o
 * `node_modules` da raiz e onde há um `node_modules` de desenvolvimento completo.
 *
 * O gate apontou o que isso significa: aquele teste não podia pegar o defeito que a
 * fase existe para impedir. E é o meu padrão recorrente — verificação manual não é
 * contrato; o que não está automatizado não vale.
 *
 * ─── O que este arquivo faz que nenhum outro faz ──────────────────────────────
 *
 *   1. copia o pacote para um diretório temporário FORA da árvore do repositório;
 *   2. afirma que nenhum `node_modules` foi herdado;
 *   3. roda `npm ci --omit=dev` usando o lockfile COMMITADO;
 *   4. afirma que as quatro dependências de produção resolvem;
 *   5. prova, por resolução real, que elas vêm do `node_modules` TEMPORÁRIO;
 *   6. roda `npm run --silent lucas:analyze` sem credencial;
 *   7. afirma exit 1, `bootstrap_failure`, e zero erro de resolução.
 *
 * O `node_modules` da raiz do repositório é irrelevante para esta prova — por
 * construção, não por convenção.
 *
 * ─── Por que a cópia recria a árvore do portal ────────────────────────────────
 *
 * O pacote importa `../../../src/lib/ceo/*` — `engine.ts` é o ponto único de
 * acoplamento com o portal, documentado desde a Fase 2.1a. A cópia recria
 * `<temp>/repo/src/lib` ao lado de `<temp>/repo/intelligence` porque é a forma real do
 * repositório. Nenhum `node_modules` é criado em `<temp>/repo`, então não há de onde
 * subir.
 *
 * ─── Custo ────────────────────────────────────────────────────────────────────
 *
 * Este teste roda `npm ci` de verdade e leva alguns segundos. Está na suíte padrão
 * — e portanto em `npm run verify` — de propósito: a alternativa é uma prova que só
 * roda quando alguém se lembra, e foi exatamente assim que o defeito passou.
 *
 * Depende do registry ou do cache local do npm.
 */

import { afterAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

/** `intelligence/` de verdade. Origem da cópia, nunca o alvo da execução. */
const PACOTE = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
/** A raiz do repositório. NADA nesta prova pode resolver a partir dela. */
const REPO = resolve(PACOTE, "..")

/**
 * Caminho canônico, sem symlink.
 *
 * No macOS `os.tmpdir()` devolve `/var/folders/…`, que é symlink para
 * `/private/var/folders/…`. A resolução de módulo do Node reporta o caminho REAL, e
 * comparar as duas formas como string faz a asserção falhar sobre uma instalação que
 * está no lugar certo. Comparar caminho canônico com caminho canônico é o que
 * responde à pergunta de verdade: de qual árvore veio o pacote.
 */
function canonico(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** As quatro dependências externas do grafo de PRODUÇÃO. */
const PRODUCAO = ["google-auth-library", "ajv", "ajv-formats", "tsx"] as const

/**
 * O que NÃO é copiado.
 *
 * `node_modules` é o item que importa: copiá-lo tornaria a prova vazia, porque a
 * instalação limpa herdaria exatamente o que ela existe para não herdar.
 */
const EXCLUIDOS = new Set(["node_modules", "coverage", "dist", ".git", ".turbo", ".next"])

let temp: string | undefined

afterAll(() => {
  // `afterAll` roda mesmo com asserção falhando, então uma falha não deixa
  // instalações acumuladas em /tmp.
  if (temp !== undefined) rmSync(temp, { recursive: true, force: true })
})

/**
 * Ambiente do filho sem nada que altere resolução de módulo.
 *
 * `NODE_PATH` é removido porque aponta diretórios extras de busca — com ele, um
 * pacote não declarado poderia resolver e a prova passaria por engano. As credenciais
 * são REMOVIDAS, não sobrescritas: numa máquina configurada, sobrescrever com valor
 * falso faria o comando tentar falar com o Google de verdade.
 */
function ambienteLimpo(): Record<string, string> {
  const env: Record<string, string> = {}
  const proibidas = new Set([
    "NODE_PATH",
    "NODE_OPTIONS",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ])
  for (const [k, v] of Object.entries(process.env)) {
    if (proibidas.has(k) || v === undefined) continue
    env[k] = v
  }
  return env
}

interface Saida {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

function rodar(cmd: string, args: readonly string[], cwd: string): Saida {
  try {
    const stdout = execFileSync(cmd, [...args], {
      cwd,
      env: ambienteLimpo(),
      encoding: "utf8",
      timeout: 240_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, stdout, stderr: "" }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message?: string }
    return {
      code: typeof err.status === "number" ? err.status : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    }
  }
}

describe("§1–§10 — instalação de produção isolada, fora do repositório", () => {
  it(
    "npm ci --omit=dev + npm run lucas:analyze, sem herdar nada",
    () => {
      // ─── 1. Diretório temporário, FORA da árvore do repositório ──────────
      temp = mkdtempSync(join(tmpdir(), "creditum-pkg-"))
      const repoIsolado = join(temp, "repo")
      const pacoteIsolado = join(repoIsolado, "intelligence")

      // §1 — a prova só vale se o caminho não descende do repositório real.
      const tempReal = canonico(temp)
      const repoReal = canonico(REPO)
      expect(tempReal.startsWith(repoReal + sep)).toBe(false)
      expect(canonico(dirname(pacoteIsolado)).startsWith(repoReal + sep)).toBe(false)

      // ─── 2. Cópia com filtro explícito ──────────────────────────────────
      cpSync(PACOTE, pacoteIsolado, {
        recursive: true,
        filter: (origem) => {
          const partes = origem.slice(PACOTE.length).split(sep)
          return !partes.some((p) => EXCLUIDOS.has(p))
        },
      })
      // `engine.ts` acopla com o portal por caminho relativo — a cópia recria a
      // forma real do repositório, e `<temp>/repo` fica SEM `node_modules`.
      cpSync(join(REPO, "src", "lib"), join(repoIsolado, "src", "lib"), {
        recursive: true,
        filter: (origem) => !origem.split(sep).some((p) => EXCLUIDOS.has(p)),
      })

      // ─── 3. Nada herdado ────────────────────────────────────────────────
      expect(existsSync(join(pacoteIsolado, "node_modules"))).toBe(false)
      expect(existsSync(join(repoIsolado, "node_modules"))).toBe(false)
      expect(existsSync(join(temp, "node_modules"))).toBe(false)
      // E o lockfile COMMITADO veio junto: é ele que a instalação precisa consumir.
      expect(existsSync(join(pacoteIsolado, "package-lock.json"))).toBe(true)

      // ─── 4. Instalação só de produção ───────────────────────────────────
      const ci = rodar("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], pacoteIsolado)
      expect(
        ci.code,
        `npm ci falhou:\n${ci.stderr.slice(0, 1200)}`,
      ).toBe(0)

      // ─── 5. Coleta TODAS as observações antes de afirmar ────────────────
      //
      // A ordem importa por um motivo de prova. Se as asserções de `npm ls` viessem
      // antes da execução, um fecho quebrado morreria ali e o comando real nunca
      // rodaria — e o teste não demonstraria que o SUBPROCESSO pega o defeito, que é
      // exatamente o que a fase exige. Coletar primeiro, afirmar depois, faz a
      // asserção de resolução do comando real ser a primeira a disparar.
      const ls = rodar("npm", ["ls", "--depth=0", "--omit=dev", "--json"], pacoteIsolado)
      const resolucao = rodar(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const r = {};
           for (const m of ${JSON.stringify(PRODUCAO)}) r[m] = import.meta.resolve(m);
           process.stdout.write(JSON.stringify(r));`,
        ],
        pacoteIsolado,
      )
      // ─── 6. O comando REAL, sem credencial ──────────────────────────────
      const cmd = rodar("npm", ["run", "--silent", "lucas:analyze"], pacoteIsolado)
      const tudo = `${cmd.stdout}\n${cmd.stderr}`

      // ─── 7. A asserção que prova o SUBPROCESSO ──────────────────────────
      //
      // Primeira asserção depois da coleta, de propósito: é ela que dispara quando o
      // fecho do pacote está quebrado. Sem esta ordem, a prova de que o comando real
      // pega o defeito nunca sairia da hipótese.
      expect(tudo).not.toContain("ERR_MODULE_NOT_FOUND")
      expect(tudo).not.toContain("Cannot find package")
      expect(tudo).not.toContain("Cannot find module")

      // ─── 8. E as quatro dependências, do node_modules TEMPORÁRIO ────────
      const arvore = JSON.parse(ls.stdout || "{}") as {
        dependencies?: Record<string, { version?: string }>
      }
      for (const m of PRODUCAO) {
        expect(arvore.dependencies?.[m]?.version, `${m} não resolveu na instalação isolada`).toBeDefined()
      }

      expect(resolucao.code, resolucao.stderr.slice(0, 800)).toBe(0)
      const caminhos = JSON.parse(resolucao.stdout || "{}") as Record<string, string>
      for (const m of PRODUCAO) {
        const url = caminhos[m]
        expect(url, `sem resolução para ${m}`).toBeDefined()
        const caminho = canonico(fileURLToPath(url ?? "file:///"))
        // Vem de dentro do temporário…
        expect(caminho.startsWith(tempReal), `${m} resolveu fora do temp: ${caminho}`).toBe(true)
        // …e do `node_modules` do PRÓPRIO pacote isolado, não de um pai dentro do temp.
        expect(
          caminho.startsWith(canonico(join(pacoteIsolado, "node_modules")) + sep),
          `${m} não veio do node_modules do pacote isolado: ${caminho}`,
        ).toBe(true)
        // …e NÃO do repositório real. Este é o hoisting que o gate apontou.
        expect(caminho.startsWith(repoReal + sep), `${m} resolveu do repositório: ${caminho}`).toBe(false)
      }

      // ─── 9. O resultado governado do comando ────────────────────────────
      // Exit 1: falha de BOOTSTRAP, o único ponto de parada esperado.
      expect(cmd.code, `stderr: ${cmd.stderr.slice(0, 1200)}`).toBe(1)

      const linha = /\{"status":"bootstrap_failure".*\}/u.exec(cmd.stderr)
      expect(linha, `stderr: ${cmd.stderr.slice(0, 1200)}`).not.toBeNull()
      const j = JSON.parse(linha?.[0] ?? "{}") as Record<string, unknown>
      expect(j["status"]).toBe("bootstrap_failure")
      expect(j["dataset_id"]).toBe("lucas_status_contratos_mensal")
      expect(JSON.stringify(j)).toContain("GOOGLE_SERVICE_ACCOUNT_EMAIL")

      // Nenhum resultado de análise fabricado em stdout.
      expect(cmd.stdout).not.toContain('"d_executed"')
      expect(cmd.stdout).not.toContain('"source_not_available"')

      // §11 — nenhum segredo nem PII, mesmo pelo caminho isolado.
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
      expect(tudo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
    },
    600_000,
  )
})
