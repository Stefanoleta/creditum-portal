/**
 * Guard de segredos — impede que credencial volte a entrar no repositório.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────
 *
 * A discovery da Fase 2.9 encontrou um Personal Access Token do GitHub em texto
 * claro no `.git/config` deste repositório. Ele não estava em arquivo versionado —
 * estava na URL do remote, que é local. Foi removido e o token revogado.
 *
 * O risco que sobra é o de sempre: alguém colar um token num `.env` versionado,
 * num script, num doc de onboarding. Este arquivo roda no `verify` e falha antes
 * do commit chegar a qualquer lugar.
 *
 * ─── Por que a varredura é sobre arquivos VERSIONADOS ─────────────────────────
 *
 * `git ls-files` em vez de andar no filesystem: `node_modules` tem milhares de
 * fixtures com strings que casam com qualquer heurística de segredo, e um guard
 * que grita sem motivo é desligado na primeira semana. O que importa é o que sai
 * desta máquina — e o que sai é o que está versionado.
 *
 * ─── Placeholders são permitidos, e é isso que torna o guard usável ───────────
 *
 * A documentação legitimamente escreve `ghp_xxx` para ensinar o formato. Um PAT
 * real do GitHub tem 36 caracteres depois do prefixo; um placeholder tem 3 a 8.
 * O limite de 20 separa os dois sem depender de lista de exceções.
 *
 * O guard NUNCA imprime o valor encontrado — só arquivo, linha e tipo. Um teste
 * que vaza o segredo no output do CI troca um vazamento por outro.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = join(import.meta.dirname, "../../..")

/**
 * Padrões de credencial. Cada um exige comprimento REAL, não só o prefixo.
 *
 * Fontes dos comprimentos: PAT clássico do GitHub tem 36 caracteres após `ghp_`;
 * os fine-grained (`github_pat_`) são mais longos; chaves da OpenAI e da
 * Anthropic têm prefixo próprio e corpo longo.
 */
const PADROES: readonly { readonly tipo: string; readonly re: RegExp }[] = [
  { tipo: "github_pat_classic", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { tipo: "github_pat_fine_grained", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { tipo: "openai_key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { tipo: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { tipo: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { tipo: "supabase_service_jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { tipo: "credencial_em_url", re: /https:\/\/[A-Za-z0-9._~-]{8,}(:[^@\s/]+)?@[A-Za-z0-9.-]+\// },
]

/** Extensões que não fazem sentido varrer: binário não carrega segredo em texto. */
const IGNORAR = /\.(png|jpg|jpeg|gif|webp|ico|svg|pdf|woff2?|ttf|eot|mp3|mp4|zip|xlsx)$/i

interface Achado {
  readonly arquivo: string
  readonly linha: number
  readonly tipo: string
}

function versionados(): readonly string[] {
  const saida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" })
  return saida.split("\0").filter((f) => f.length > 0 && !IGNORAR.test(f))
}

function varrer(): readonly Achado[] {
  const achados: Achado[] = []

  for (const arquivo of versionados()) {
    let conteudo: string
    try {
      conteudo = readFileSync(join(RAIZ, arquivo), "utf8")
    } catch {
      continue // arquivo removido entre o ls-files e a leitura
    }

    // NÃO existe auto-exclusão. Os padrões deste arquivo são regexes, e os
    // exemplos são montados em runtime — então ele se varre a si mesmo e passa.
    // Excluir-se seria o único ponto cego do guard, e ponto cego em guard de
    // segredo é onde o segredo vai parar.

    const linhas = conteudo.split("\n")
    for (const [i, linha] of linhas.entries()) {
      for (const { tipo, re } of PADROES) {
        if (re.test(linha)) achados.push({ arquivo, linha: i + 1, tipo })
      }
    }
  }

  return achados
}

describe("nenhuma credencial em arquivo versionado", () => {
  const achados = varrer()

  it("a varredura cobre os arquivos versionados", () => {
    // Guard do guard: se `git ls-files` falhasse e devolvesse vazio, o teste
    // passaria sem ter olhado nada — e um guard que passa por vacuidade é pior
    // que nenhum, porque dá confiança falsa.
    expect(versionados().length).toBeGreaterThan(50)
  })

  it("nenhum padrão de credencial aparece", () => {
    // Mensagem com arquivo, linha e tipo. NUNCA o valor.
    const relatorio = achados.map((a) => `${a.arquivo}:${a.linha} → ${a.tipo}`).join("\n")
    expect(achados, relatorio).toEqual([])
  })

  it("placeholders de documentação continuam permitidos", () => {
    // `ghp_xxx` ensina o formato e não é segredo. Se o limite de comprimento
    // regredisse para o prefixo, a documentação viraria falso positivo e alguém
    // desligaria o guard.
    const placeholders = ["ghp_xxx", "ghp_XXXXX", "sk-xxx", "GITHUB_TOKEN=ghp_xxx"]
    for (const p of placeholders) {
      const casou = PADROES.some(({ re }) => re.test(p))
      expect(casou, p).toBe(false)
    }
  })

  it("credencial real É detectada — o guard não passa por vacuidade", () => {
    // Montados em RUNTIME, nunca como literal.
    //
    // A primeira versão deste teste escrevia os exemplos inteiros no fonte. Eles
    // eram sintéticos, mas tinham FORMA de token — e passariam a disparar o
    // secret scanning do GitHub, o CI, e o próprio guard se ele não se
    // excluísse da varredura. Um arquivo que precisa de exceção para não se
    // acusar é um arquivo que ensina a criar exceções.
    const corpo = (n: number): string => "aA1".repeat(n).slice(0, n)
    const reais = [
      `${"ghp"}_${corpo(36)}`,
      `${"github"}_${"pat"}_${corpo(30)}`,
      `https://${"ghp"}_${corpo(36)}@github.com/org/repo.git`,
      `${"AKIA"}${"ABCDEFGH1234IJKL"}`,
    ]
    for (const r of reais) {
      const casou = PADROES.some(({ re }) => re.test(r))
      // Sem imprimir o valor sintético inteiro na falha.
      expect(casou, `padrão não detectado: ${r.slice(0, 12)}…`).toBe(true)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Guard de exposição: nenhuma rota nova pode nascer sem barreira de autenticação
//
// Contexto (18/08/2026): não existe autenticação neste portal. `auth.users` = 0,
// nenhum `middleware.ts`, `@supabase/ssr` instalado e nunca importado. As 18
// rotas de `/api` respondem a qualquer requisição, e 12 delas tocam PII.
//
// Este bloco NÃO conserta isso — consertar exige decidir provider e quem tem
// conta, e isso é decisão de negócio. O que ele faz é impedir que o inventário
// mude sem alguém perceber: se uma rota é criada ou removida, o teste falha e
// obriga a reclassificar.
//
// Quando o guard de autenticação existir, a asserção de `SEM_BARREIRA` inverte:
// passa a exigir que toda rota de PII esteja coberta.
// ═════════════════════════════════════════════════════════════════════════════

/** Rotas que tocam PII, medidas em 18/08/2026. Ver docs/SECURITY_HARDENING_*.md */
const ROTAS_COM_PII: readonly string[] = [
  "analyses/poll",
  "analyses/recent",
  "analyses/retry",
  "calls/analyze",
  "cron/analyze",
  "dashboard/metrics",
  "health",
  "leads/higienizacao",
  "leads/recontatos",
  "listas/[id]/leads",
  "listas/backfill",
  "listas/upload",
  "reports/daily",
  "webhooks/argus",
]

describe("inventário de rotas /api não muda em silêncio", () => {
  const rotas = execFileSync("git", ["ls-files", "src/app/api"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith("/route.ts"))
    .map((f) => f.replace("src/app/api/", "").replace("/route.ts", ""))
    .sort()

  it("existem 18 rotas — o número medido na auditoria", () => {
    // Se este número mudar, a matriz de segurança precisa ser refeita antes de
    // o deploy sair. Um `expect` desconfortável é o ponto.
    expect(rotas).toHaveLength(18)
  })

  it("toda rota classificada como PII ainda existe", () => {
    const ausentes = ROTAS_COM_PII.filter((r) => !rotas.includes(r))
    expect(ausentes, `rotas de PII que sumiram: ${ausentes.join(", ")}`).toEqual([])
  })

  it("nenhuma rota NOVA apareceu sem classificação", () => {
    const semPII = [
      "calls/list",
      "debug/sdr-quality",
      "listas",
      "listas/unidades",
    ]
    const classificadas = new Set([...ROTAS_COM_PII, ...semPII])
    const naoClassificadas = rotas.filter((r) => !classificadas.has(r))
    expect(
      naoClassificadas,
      `rota sem classificação de PII — reclassificar antes de deploy: ${naoClassificadas.join(", ")}`,
    ).toEqual([])
  })

  it("AUTH_FOUNDATION_MISSING continua sendo o estado conhecido", () => {
    // Documenta o estado em vez de afirmar que ele é aceitável. No dia em que
    // `middleware.ts` existir, este teste falha e obriga a atualizar o guard —
    // que é exatamente quando queremos revisitar o inventário.
    const temMiddleware = execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8" })
      .split("\n")
      .some((f) => f === "src/middleware.ts" || f === "middleware.ts")
    expect(
      temMiddleware,
      "middleware.ts apareceu: reveja ROTAS_COM_PII e troque este teste pela " +
        "asserção de cobertura de autenticação",
    ).toBe(false)
  })
})
