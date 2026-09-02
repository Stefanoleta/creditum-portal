/**
 * Provador ESTRUTURAL 3.1d-D2B-R9.
 *
 * A r8 "provava" inalcançabilidade procurando substring. O regate quebrou isso com duas
 * fontes sintéticas: um helper EXPORTADO que captura o selo privado e forja o objeto
 * passou como "selo privado"; e tokens de contenção em função MORTA passaram como
 * "no-follow". Presença de token não é inalcançabilidade governada.
 *
 * Aqui: AST do TypeScript, exports reais e GRAFO DE CHAMADAS a partir dos entrypoints
 * governados. Código morto não prova nada porque não é alcançado.
 *
 * Uso:  node d2b-structural-prover.mjs <proof_id> <arquivo...>
 * Saída: JSON { ok, verified[], failures[], declarative_assumptions[] }
 */
import ts from "typescript"
import { readFileSync } from "node:fs"

const [, , proofId, ...arquivos] = process.argv

function parse(caminho) {
  return ts.createSourceFile(caminho, readFileSync(caminho, "utf8"), ts.ScriptTarget.ES2022, true)
}

/** Nome chamado num CallExpression, sem inventar: identificador ou propriedade. */
function nomeChamado(e) {
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return null
}

/** Declarações de função/classe de topo, com marca de export. */
function declaracoes(src) {
  const m = new Map()
  for (const st of src.statements) {
    const exportado = !!(ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Export)
    if (ts.isFunctionDeclaration(st) && st.name) m.set(st.name.text, { no: st, exportado })
    if (ts.isClassDeclaration(st) && st.name) m.set(st.name.text, { no: st, exportado })
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) m.set(d.name.text, { no: d, exportado })
      }
    }
  }
  return m
}

function identificadores(no) {
  const s = new Set()
  const anda = (n) => { if (ts.isIdentifier(n)) s.add(n.text); ts.forEachChild(n, anda) }
  anda(no)
  return s
}

function chamadas(no) {
  const s = new Set()
  const anda = (n) => {
    if (ts.isCallExpression(n)) { const x = nomeChamado(n.expression); if (x) s.add(x) }
    if (ts.isNewExpression(n)) { const x = nomeChamado(n.expression); if (x) s.add("new " + x) }
    ts.forEachChild(n, anda)
  }
  anda(no)
  return s
}

/** Fecho transitivo a partir de um entrypoint: só o que é REALMENTE alcançado. */
function alcancavel(decls, entrada) {
  const vistos = new Set(), fila = [entrada], chamadasTotais = new Set()
  while (fila.length) {
    const nome = fila.pop()
    if (vistos.has(nome)) continue
    vistos.add(nome)
    const d = decls.get(nome)
    if (!d) continue
    for (const c of chamadas(d.no)) {
      chamadasTotais.add(c)
      const alvo = c.startsWith("new ") ? c.slice(4) : c
      if (decls.has(alvo) && !vistos.has(alvo)) fila.push(alvo)
    }
  }
  return { funcoes: vistos, chamadas: chamadasTotais }
}

/** Texto do corpo das funções ALCANÇADAS — nunca do arquivo inteiro. */
function textoAlcancado(src, decls, entrada) {
  const { funcoes } = alcancavel(decls, entrada)
  let t = ""
  for (const nome of funcoes) { const d = decls.get(nome); if (d) t += d.no.getText(src) + "\n" }
  return t
}

const provas = {
  /**
   * B6b — o ramo mutado exige recibo NÃO autêntico E o selo privado do módulo.
   * Nenhum caminho exportado produz essa combinação.
   */
  "receipt-seal-unreachable"() {
    const [supPath, ledPath] = arquivos
    const sup = parse(supPath), led = parse(ledPath)
    const dSup = declaracoes(sup), dLed = declaracoes(led)
    const ver = [], fal = []

    const selo = dSup.get("SELO_TENTATIVA")
    if (!selo) fal.push("SELO_TENTATIVA não declarado no supervisor")
    else if (selo.exportado) fal.push("SELO_TENTATIVA está EXPORTADO")
    else ver.push("SELO_TENTATIVA declarado e não exportado")

    // ─── O que realmente importa ──────────────────────────────────────────
    // Mencionar o selo não é vazamento: o consumidor governado precisa dele. O que
    // não pode existir é um export que CONSTRÓI o objeto guardado, ou que devolve o
    // selo para fora. O helper-forjador do regate cai na primeira regra.
    const forjadores = []
    for (const [nome, d] of dSup) {
      if (!d.exportado || nome === "ReservedExecutionAttempt") continue
      if (chamadas(d.no).has("new ReservedExecutionAttempt")) forjadores.push(nome)
    }
    if (forjadores.length) fal.push(`export(s) CONSTROEM a capacidade: ${forjadores.join(", ")}`)
    else ver.push("nenhum export constrói ReservedExecutionAttempt")

    const devolvemSelo = []
    for (const [nome, d] of dSup) {
      if (!d.exportado) continue
      const anda = (n) => {
        if (ts.isReturnStatement(n) && n.expression &&
            identificadores(n.expression).has("SELO_TENTATIVA")) devolvemSelo.push(nome)
        ts.forEachChild(n, anda)
      }
      anda(d.no)
    }
    if (devolvemSelo.length) fal.push(`export(s) devolvem o selo: ${devolvemSelo.join(", ")}`)
    else ver.push("nenhum export devolve o selo")

    // A classe exportada não pode expor o selo por método/campo público.
    const cls = dSup.get("ReservedExecutionAttempt")
    if (cls) {
      for (const m of cls.no.members ?? []) {
        const nome = m.name && ts.isIdentifier(m.name) ? m.name.text : ""
        if (!nome || nome === "constructor" || nome === "_consumeOnce") continue
        const priv = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Private)
        if (!priv && identificadores(m).has("SELO_TENTATIVA")) {
          fal.push(`membro público ${nome} referencia o selo`)
        }
      }
      const ctor = (cls.no.members ?? []).find((m) => ts.isConstructorDeclaration(m))
      if (!ctor) fal.push("construtor não encontrado")
      else {
        const ids = identificadores(ctor)
        if (!ids.has("SELO_TENTATIVA")) fal.push("o construtor não confere o selo")
        else ver.push("o construtor exige o selo")
        if (!chamadas(ctor).has("isDurableReservationReceipt")) {
          fal.push("o construtor não exige recibo autêntico")
        } else ver.push("o construtor exige recibo autêntico")
      }
    } else fal.push("ReservedExecutionAttempt não declarada")

    // O recibo autêntico só nasce dentro do livro-razão, em ponto não exportado.
    const seloR = dLed.get("SELO_RECIBO")
    if (!seloR) fal.push("SELO_RECIBO não declarado")
    else if (seloR.exportado) fal.push("SELO_RECIBO está EXPORTADO")
    else ver.push("SELO_RECIBO declarado e não exportado")

    let cunhagens = 0
    const andaLed = (n) => {
      if (ts.isNewExpression(n) && nomeChamado(n.expression) === "DurableReservationReceipt") cunhagens++
      ts.forEachChild(n, andaLed)
    }
    andaLed(led)
    if (cunhagens !== 1) fal.push(`recibo cunhado em ${cunhagens} pontos (esperado 1)`)
    else ver.push("recibo cunhado num único ponto do livro-razão")

    // A cunhagem tem de estar DENTRO do entrypoint governado de reserva, e nenhum
    // outro export pode construir recibo.
    const cunhadores = []
    for (const [nome, d] of dLed) {
      if (chamadas(d.no).has("new DurableReservationReceipt")) cunhadores.push(nome)
    }
    if (cunhadores.length !== 1 || cunhadores[0] !== "reserveExecutionAttempt") {
      fal.push(`recibo construído em: ${cunhadores.join(", ") || "nenhum"} (esperado só reserveExecutionAttempt)`)
    } else ver.push("recibo construído apenas dentro de reserveExecutionAttempt")

    return { ok: fal.length === 0, verified: ver, failures: fal, declarative_assumptions: [] }
  },

  /**
   * CONTAIN1 — as validações têm de estar no CAMINHO ALCANÇADO a partir do
   * entrypoint governado. Token em função morta não prova nada.
   */
  "canonical-containment-by-construction"() {
    const [ledPath] = arquivos
    const led = parse(ledPath)
    const decls = declaracoes(led)
    const ver = [], fal = []
    const ENTRADA = "reserveExecutionAttempt"

    if (!decls.has(ENTRADA)) return { ok: false, verified: [], failures: [`${ENTRADA} não declarada`], declarative_assumptions: [] }
    if (!decls.get(ENTRADA).exportado) fal.push(`${ENTRADA} não é o entrypoint exportado`)

    const { funcoes, chamadas: chs } = alcancavel(decls, ENTRADA)
    const texto = textoAlcancado(led, decls, ENTRADA)

    const exigidas = [
      ["raizUtilizavel", "validação da raiz no caminho alcançado"],
      ["attemptsRealNaoLink", "validação no-follow de `attempts` no caminho alcançado"],
      ["contidoNaRaiz", "contenção canônica no caminho alcançado"],
      ["lstat", "lstat no caminho alcançado"],
    ]
    for (const [fn, desc] of exigidas) {
      if (chs.has(fn)) ver.push(desc)
      else fal.push(`ausente no caminho alcançado: ${fn}`)
    }
    if (!funcoes.has("diretorioRealNaoLink")) fal.push("diretorioRealNaoLink não é alcançada")
    else ver.push("diretorioRealNaoLink alcançada a partir do entrypoint")

    if (/join\(\s*ledgerRoot\s*,\s*"attempts"\s*\)/.test(texto)) {
      ver.push("`attempts` é filho LITERAL de join(ledgerRoot, \"attempts\") no caminho alcançado")
    } else fal.push("`attempts` não é filho literal no caminho alcançado")

    if (/isSymbolicLink\(\)/.test(texto)) ver.push("symlink recusado no caminho alcançado")
    else fal.push("recusa de symlink ausente no caminho alcançado")

    if (/relative\(/.test(texto)) ver.push("contenção por caminho relativo exato, não prefixo")
    else fal.push("contenção não usa comparação relativa exata")

    return {
      ok: fal.length === 0, verified: ver, failures: fal,
      declarative_assumptions: [
        "adversário de mesma credencial em corrida no sistema de arquivos está FORA do modelo de ameaça (r5) — premissa declarativa, NÃO verificada mecanicamente",
        "o SO recusa hardlink de diretório no alvo — medido fora deste provador",
      ],
    }
  },
}

const fn = provas[proofId]
if (!fn) {
  console.log(JSON.stringify({ ok: false, verified: [], failures: [`proof_id desconhecido: ${proofId}`], declarative_assumptions: [] }))
  process.exit(0)
}
console.log(JSON.stringify(fn()))
