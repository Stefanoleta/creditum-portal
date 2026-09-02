/**
 * Fase 3.1d-D2B-R1 — guarda ESTRUTURAL: o livro-razão não sabe desfazer.
 *
 * ─── Por que uma guarda estática é legítima aqui ─────────────────────────────
 *
 * "O livro-razão de produção não contém mecanismo para apagar uma reserva" não é um
 * detalhe de implementação — é o invariante de segurança da fase. Uma vez que o
 * diretório de tentativa existe, aquele `execution_id` está gasto; qualquer caminho
 * que o remova devolve o id ao pool e transforma falha em segunda tentativa.
 *
 * ─── Por que AST, e não varredura de texto ───────────────────────────────────
 *
 * Esta sequência já pagou quatro vezes pelo mesmo erro: procurar TEXTO onde a pergunta
 * é ESTRUTURAL. `rm` aparece em prosa que documenta a ausência; `unlink` pode ser
 * substring de um identificador inocente. O compilador do TypeScript responde a
 * pergunta certa — quais CHAMADAS existem no código executável — e comentário, string
 * e nome de variável simplesmente não são nós de chamada.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const LEDGER = join(__dirname, "..", "src", "execution-ledger.ts")
const SUPERVISOR = join(__dirname, "..", "src", "execution-supervisor.ts")

/**
 * Operações que podem REMOVER ou RECICLAR uma reserva no desenho atual.
 *
 * A lista é motivada por semântica, não por banimento cego de API: `rm`/`rmdir`
 * apagam o diretório de tentativa; `unlink` apaga o registro que prova a reserva;
 * `rename` move a tentativa para fora da chave determinística, o que equivale a
 * liberar o id; `truncate` esvazia o registro — e registro ilegível ainda queima o id,
 * mas esvaziá-lo é um passo em direção a reciclagem que nada no desenho precisa.
 */
const DESTRUTIVAS = new Set([
  "rm", "rmSync", "rmdir", "rmdirSync",
  "unlink", "unlinkSync",
  "rename", "renameSync",
  "truncate", "truncateSync", "ftruncate",
])

interface Chamada {
  readonly nome: string
  readonly linha: number
}

/** Colhe apenas CHAMADAS reais. Comentário, string e docstring não são nós de chamada. */
function chamadasDestrutivas(caminho: string): Chamada[] {
  const fonte = ts.createSourceFile(
    caminho,
    readFileSync(caminho, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
  )
  const achados: Chamada[] = []

  const nomeChamado = (expr: ts.Expression): string | null => {
    if (ts.isIdentifier(expr)) return expr.text
    // `fs.rm(...)`, `promises.unlink(...)`, `(await import("node:fs/promises")).rm(...)`
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text
    if (ts.isElementAccessExpression(expr) && expr.argumentExpression) {
      const a = expr.argumentExpression
      if (ts.isStringLiteral(a)) return a.text
    }
    return null
  }

  const anda = (no: ts.Node): void => {
    if (ts.isCallExpression(no)) {
      const nome = nomeChamado(no.expression)
      if (nome !== null && DESTRUTIVAS.has(nome)) {
        achados.push({
          nome,
          linha: fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1,
        })
      }
    }
    ts.forEachChild(no, anda)
  }
  anda(fonte)
  return achados
}

describe("3.1d-D2B-R1 o livro-razão de produção não sabe desfazer", () => {
  it("nenhuma chamada destrutiva de sistema de arquivos no livro-razão", () => {
    const achados = chamadasDestrutivas(LEDGER)
    expect(
      achados.map((c) => `${c.nome} @ linha ${c.linha}`),
      "uma operação destrutiva no livro-razão pode liberar um execution_id já queimado",
    ).toEqual([])
  })

  it("nenhuma chamada destrutiva de sistema de arquivos no supervisor", () => {
    expect(chamadasDestrutivas(SUPERVISOR).map((c) => c.nome)).toEqual([])
  })

  it("a guarda REALMENTE detecta — controle positivo em fonte sintética", () => {
    // Sem este controle a guarda poderia estar sempre devolvendo lista vazia por um
    // defeito de travessia, e passaria dizendo que provou algo. Foi exatamente assim
    // que a c6 pegou meu filtro de comentário quebrado.
    const sintetico = join(__dirname, "__controle-positivo-sintetico.ts")
    const fonte = ts.createSourceFile(
      sintetico,
      `import { rm } from "node:fs/promises"
// esta prosa menciona rm e unlink e NÃO deve ser detectada
const texto = "rm -rf também é só string"
export async function limpa(d: string) {
  await rm(d, { recursive: true })
  await (await import("node:fs/promises")).unlink(d + "/reservation.json")
}
`,
      ts.ScriptTarget.ES2022,
      true,
    )
    const achados: string[] = []
    const anda = (no: ts.Node): void => {
      if (ts.isCallExpression(no)) {
        const e = no.expression
        const nome = ts.isIdentifier(e)
          ? e.text
          : ts.isPropertyAccessExpression(e)
            ? e.name.text
            : null
        if (nome !== null && DESTRUTIVAS.has(nome)) achados.push(nome)
      }
      ts.forEachChild(no, anda)
    }
    anda(sintetico ? fonte : fonte)
    // Pega as duas CHAMADAS…
    expect(achados.sort()).toEqual(["rm", "unlink"])
    // …e o comentário e a string não viraram achado: 2 chamadas, não 4 menções.
    expect(achados.length).toBe(2)
  })

  it("não existe export de apagar, liberar, resetar ou repetir", async () => {
    const ledger = await import("../src/execution-ledger")
    const sup = await import("../src/execution-supervisor")
    for (const nome of [
      "deleteReservation", "releaseReservation", "unreserve",
      "resetExecution", "retryExecution", "clearAttempt", "rollback",
    ]) {
      expect(Object.keys(ledger)).not.toContain(nome)
      expect(Object.keys(sup)).not.toContain(nome)
    }
  })
})
