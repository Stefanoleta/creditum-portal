/**
 * D2B-EV2 — relatório. Roda a suíte do verificador e emite uma linha por invariante.
 * Sem contagem de mutação, sem oráculo, sem classificação. PASS/FAIL e onde está a prova.
 */
import { execFileSync } from "node:child_process"

const INVARIANTES = [
  ["01", "ordem da autoridade d1 — consumo síncrono antes da IO do livro-razão"],
  ["02", "unicidade global — um execution_id nunca rende duas capacidades"],
  ["03", "reserva atômica — mkdir não-recursivo do diretório da chave"],
  ["04", "semântica de queima — diretório existente inviabiliza o id para sempre"],
  ["05", "sem rollback — produção não tem caminho para liberar id queimado"],
  ["06", "ordem da cadeia de durabilidade"],
  ["07", "falha de durabilidade — nenhum recibo, nenhuma capacidade"],
  ["08", "segurança de caminho — raiz e attempts no-follow, sem fuga por symlink"],
  ["09", "fsync da raiz exigido em TODA reserva"],
  ["10", "capacidade local ao processo — não reconstruível de disco nem de forma"],
  ["11", "prazo monotônico nasce antes da IO e não reinicia"],
  ["12", "raiz de produção fixa, sem queda alternativa"],
  ["13", "nenhuma ativação de execução — worker, provedor, rede ou LIVE"],
]

let saida = ""
try {
  saida = execFileSync("npx", ["vitest", "run", "gateway/tests/d2b-ev2.test.ts",
                               "--reporter", "verbose"],
                       { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
} catch (e) {
  saida = (e.stdout ?? "") + (e.stderr ?? "")
}

console.log("D2B-EV2 RESULT\n")
let falhas = 0
for (const [id, desc] of INVARIANTES) {
  const linhas = saida.split("\n").filter((l) => l.includes(`EV2-${id}`))
  const testes = linhas.filter((l) => l.includes("✓") || l.includes("×"))
  const reprovou = testes.some((l) => l.includes("×"))
  const n = testes.length
  const veredito = n === 0 ? "SEM EVIDÊNCIA" : reprovou ? "FAIL" : "PASS"
  if (veredito !== "PASS") falhas++
  console.log(`  ${id}  ${veredito.padEnd(13)} ${desc}`)
  console.log(`      evidência: ${n} verificação(ões) diretas · gateway/tests/d2b-ev2.test.ts`)
}
const total = INVARIANTES.length
console.log(`\n  PASS: ${total - falhas}/${total}`)
process.exit(falhas ? 1 : 0)
