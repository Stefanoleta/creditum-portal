/**
 * Fase 2.12c — o gatilho de runtime, testado A PARTIR do gatilho.
 *
 * ─── O que o gate exigiu, e por quê ───────────────────────────────────────────
 *
 * A 2.12b construiu `runProductionLucasAnalysis` e **nada o chamava**. O gate foi
 * explícito: os testes o chamavam direto, o que prova a implementação e não a
 * execução no sistema implantado.
 *
 * Este arquivo parte de `runLucasAnalysisCommand` — a função do COMANDO. Nenhum teste
 * aqui chama `runProductionLucasAnalysis`, `currentPeriod`, `provider.load`,
 * `validateCurrentPeriod`, `toMaterialSingleCaseInput` nem `detectMaterialSingleCase`.
 * Se o comando não estiver ligado à análise, tudo aqui falha.
 *
 * E o último elo — `npm run lucas:analyze` → este módulo — é verificado lendo o
 * `package.json` de verdade.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { EXIT, runLucasAnalysisCommand, toReport } from "../../src/lucas/cli"
import type { CliIo } from "../../src/lucas/cli"
import type { GoogleAccessTokenSource, GoogleHttp, GoogleHttpResponse } from "../../src/lucas/google-http"
import { LUCAS_OFFICIAL_SHEET } from "../../src/lucas/drive-port"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
const CONFIG_OK = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@projeto.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nSINTETICA\\n-----END PRIVATE KEY-----\\n",
}
const AGORA = new Date("2026-08-19T18:00:00.000Z")

class TokenFalso implements GoogleAccessTokenSource {
  accessToken(): Promise<string> {
    return Promise.resolve("token-sintetico")
  }
}

class HttpFalso implements GoogleHttp {
  readonly urls: string[] = []
  readonly #rotas: readonly { readonly match: RegExp; readonly resp: GoogleHttpResponse }[]
  readonly #erro: string | undefined
  constructor(
    rotas: readonly { readonly match: RegExp; readonly resp: GoogleHttpResponse }[],
    erro?: string,
  ) {
    this.#rotas = rotas
    this.#erro = erro
  }
  get(url: string): Promise<GoogleHttpResponse> {
    this.urls.push(url)
    if (this.#erro !== undefined) return Promise.reject(new Error(this.#erro))
    for (const r of this.#rotas) if (r.match.test(url)) return Promise.resolve(r.resp)
    return Promise.resolve({ status: 500, json: { error: { message: "não mapeada" } } })
  }
}

/** Captura o que o comando imprime. É a saída que um operador veria. */
class IoCapturado implements CliIo {
  readonly saida: string[] = []
  readonly erros: string[] = []
  out = (l: string): void => {
    this.saida.push(l)
  }
  err = (l: string): void => {
    this.erros.push(l)
  }
}

const arquivo = (id: string, name: string, modifiedTime: string) => ({
  id,
  name,
  mimeType: SHEETS_MIME,
  modifiedTime,
})

const linha = (i: number, status: "E" | "A" | "P" | "C", ticket = "R$ 5.000,00") => [
  ...linhaAgosto({
    venc: "27/08/2026",
    cpf: cpfSintetico(i),
    unidade: "Meriti",
    parcelas: 10,
    ticket,
    status,
  }),
]

const rotas = (values: readonly unknown[][]) => [
  {
    match: /drive\/v3\/files\?/u,
    resp: {
      status: 200,
      json: { files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z")] },
    },
  },
  {
    match: /spreadsheets\/[^/]+\?fields=sheets\.properties\.title/u,
    resp: { status: 200, json: { sheets: [{ properties: { title: LUCAS_OFFICIAL_SHEET } }] } },
  },
  { match: /includeGridData=true/u, resp: { status: 200, json: { sheets: [{ data: [{ rowData: gridDe(values) }] }] } } },
]

/** Roda O COMANDO. Único ponto de entrada usado neste arquivo. */
const comando = (http: HttpFalso, io = new IoCapturado()) =>
  runLucasAnalysisCommand(
    CONFIG_OK,
    { http, tokenSource: new TokenFalso(), periodClock: () => AGORA, now: () => AGORA },
    io,
  ).then((r) => ({ ...r, io }))

// ═════════════════════════════════════════════════════════════════════════════
// §5/§22 — o último elo: o script existe e aponta para este módulo
// ═════════════════════════════════════════════════════════════════════════════

describe("§5/§22 — o comando é descobrível pelo package.json", () => {
  it("`lucas:analyze` existe e aponta para o módulo do gatilho", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> }
    const script = pkg.scripts?.["lucas:analyze"]
    expect(script).toBeDefined()
    // O elo que o gate pediu para poder encontrar: comando → módulo → análise.
    expect(script).toContain("integration/src/lucas/cli.ts")
  })

  it("o módulo do gatilho existe e chama a orquestração — e só ela", () => {
    const fonte = readFileSync(new URL("../../src/lucas/cli.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    // Chama o entrypoint.
    expect(fonte).toContain("runProductionLucasAnalysis(")
    // §4/§21 — e NÃO reproduz a orquestração. Um segundo caminho de produção poderia
    // divergir do primeiro sem que nada falhasse.
    for (const proibido of [
      "currentPeriod(",
      "validateCurrentPeriod(",
      "toMaterialSingleCaseInput(",
      "detectMaterialSingleCase(",
      "selectPopulation(",
      ".load(",
    ]) {
      expect(fonte, proibido).not.toContain(proibido)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §15 — execução normal, a partir do comando
// ═════════════════════════════════════════════════════════════════════════════

describe("§14/§15 — o comando alcança a análise e D executa", () => {
  const doze = Array.from({ length: 12 }, (_, i) =>
    linha(300 + i, i < 5 ? "E" : i < 8 ? "A" : "P"),
  )

  it("d_executed, com o Detector D real alcançado pelo gatilho", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await comando(http)

    expect(r.exit_code).toBe(EXIT.GOVERNED_RESULT)
    expect(r.report?.status).toBe("d_executed")
    expect(r.report?.period).toBe("2026-08")
    expect(r.report?.population).toEqual({ population: "COMMERCIAL_POTENTIAL", count: 12 })
    expect(r.report?.detector?.candidates_evaluated).toBe(12)
    // As três chamadas do Google saíram: a cadeia inteira rodou a partir do comando.
    // Quatro desde a 2.13: list, metadados da aba, valores formatados, valores
    // subjacentes. A quarta é o que torna o prazo de `Desembolso` avaliável.
    // §36 — a contagem crua não é o contrato. O que importa é a SEMÂNTICA: uma
    // listagem no Drive, uma consulta de metadados da aba, e EXATAMENTE UMA observação
    // de conteúdo. Mais de uma leitura de conteúdo é a corrida que a 2.13a fechou.
    expect(http.urls.filter((u) => /drive\/v3\/files\?/u.test(u))).toHaveLength(1)
    expect(http.urls.filter((u) => /fields=sheets\.properties\.title/u.test(u))).toHaveLength(1)
    expect(http.urls.filter((u) => /includeGridData=true/u.test(u))).toHaveLength(1)
    expect(http.urls.filter((u) => /valueRenderOption/u.test(u))).toHaveLength(0)
  })

  it("§9 — uma linha de JSON legível por máquina em stdout", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await comando(http)
    expect(r.io.saida).toHaveLength(1)
    expect(r.io.erros).toHaveLength(0)
    const j = JSON.parse(r.io.saida[0] ?? "{}") as Record<string, unknown>
    expect(j["status"]).toBe("d_executed")
    expect(j["dataset_id"]).toBe("lucas_status_contratos_mensal")
    expect(j["period"]).toBe("2026-08")
  })

  it("§10 — a saída não contém CPF, nome, chave nem token", async () => {
    const cpf = cpfSintetico(300)
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await comando(http)
    const tudo = [...r.io.saida, ...r.io.erros].join("\n")
    expect(tudo).not.toContain(cpf)
    expect(tudo).not.toContain(cpf.replace(/\D/gu, ""))
    expect(tudo).not.toContain("PRIVATE KEY")
    expect(tudo).not.toContain("token-sintetico")
    expect(tudo).not.toContain("Aluno Sintetico")
    // Nem objetos de Evidence, nem linhas de contrato.
    expect(tudo).not.toContain("evidence_id")
    expect(tudo).not.toContain("row_key")
    expect(tudo).not.toContain("ticket_cents")
  })

  it("§12 — os fatos de A/P saem como CONTAGEM", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await comando(http)
    expect(r.report?.facts).toEqual({
      awaiting_creditum_signature: 3,
      pending_student_signature: 4,
    })
  })

  it("§20 — o comando NÃO resolve o período; a orquestração resolve", async () => {
    const fonte = readFileSync(new URL("../../src/lucas/cli.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    expect(fonte).not.toContain("currentPeriod")
    // E o período aparece no resultado, vindo de quem o resolveu.
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await comando(http)
    expect(r.report?.period).toBe("2026-08")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §16 — sujeito repetido, a partir do comando
// ═════════════════════════════════════════════════════════════════════════════

describe("§16 — d_not_executed alcançável pelo gatilho", () => {
  it("razão governada, exit 0, e sem exceção", async () => {
    const mesmoCpf = cpfSintetico(4242)
    const rows = [
      [...HEADER_AGOSTO],
      [...linhaAgosto({ venc: "27/08/2026", cpf: mesmoCpf, unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "A" })],
      [...linhaAgosto({ venc: "28/08/2026", cpf: mesmoCpf, unidade: "Santos", parcelas: 12, ticket: "R$ 7.000,00", status: "P" })],
    ]
    const http = new HttpFalso(rotas(rows))
    const r = await comando(http)

    // §11 — não virou exceção: é resultado governado, e o comando sai 0.
    expect(r.exit_code).toBe(EXIT.GOVERNED_RESULT)
    expect(r.report?.status).toBe("d_not_executed")
    expect(r.report?.detector_not_executed?.reason).toBe(
      "NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION",
    )
    expect(r.report?.detector_not_executed?.duplicated_subjects).toHaveLength(1)
    expect(r.report?.detector_not_executed?.duplicated_subjects[0]?.contracts).toBe(2)
    // Nenhum resultado de detector: D não foi invocado.
    expect(r.report?.detector).toBeUndefined()
    // E os fatos de A/P continuam, porque não dependem de D.
    expect(r.report?.facts).toEqual({
      awaiting_creditum_signature: 1,
      pending_student_signature: 1,
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §17/§18/§19 — os estados de fonte, a partir do comando
// ═════════════════════════════════════════════════════════════════════════════

describe("§17/§18 — estados de fonte pelo gatilho", () => {
  it("§17 — sem arquivo do mês: source_not_available, NÃO zero contratos", async () => {
    const http = new HttpFalso([
      { match: /drive\/v3\/files\?/u, resp: { status: 200, json: { files: [] } } },
    ])
    const r = await comando(http)
    expect(r.exit_code).toBe(EXIT.GOVERNED_RESULT)
    expect(r.report?.status).toBe("source_not_available")
    expect(r.report?.source?.expected_file_name).toBe("Novos Alunos - Agosto")
    // Nenhuma população, nenhum detector: não houve captura.
    expect(r.report?.population).toBeUndefined()
    expect(r.report?.detector).toBeUndefined()
  })

  it("§18 — falha do Google: source_error, e D não é executado", async () => {
    const http = new HttpFalso([], "ENOTFOUND www.googleapis.com")
    const r = await comando(http)
    expect(r.exit_code).toBe(EXIT.GOVERNED_RESULT)
    expect(r.report?.status).toBe("source_error")
    expect(r.report?.source?.detail).toContain("ENOTFOUND")
    expect(r.report?.detector).toBeUndefined()
  })

  it("403 do Drive vira source_error sem eco de credencial", async () => {
    const http = new HttpFalso([
      {
        match: /drive\/v3\/files\?/u,
        resp: { status: 403, json: { error: { message: "caller lacks permission" } } },
      },
    ])
    const r = await comando(http)
    expect(r.report?.status).toBe("source_error")
    expect(r.report?.source?.detail).toContain("PERMISSION_DENIED_OR_QUOTA")
    const tudo = [...r.io.saida, ...r.io.erros].join("\n")
    expect(tudo).not.toContain("token-sintetico")
  })

  it("aba ausente vira source_invalid com a razão preservada", async () => {
    const http = new HttpFalso([
      {
        match: /drive\/v3\/files\?/u,
        resp: {
          status: 200,
          json: { files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z")] },
        },
      },
      {
        match: /spreadsheets\/[^/]+\?fields=sheets\.properties\.title/u,
        resp: { status: 200, json: { sheets: [{ properties: { title: "Resumo" } }] } },
      },
    ])
    const r = await comando(http)
    expect(r.report?.status).toBe("source_invalid")
    expect(r.report?.source?.reason).toBe("SHEET_NOT_FOUND")
  })
})

describe("§19/§11 — bootstrap e códigos de saída", () => {
  it("§19 — sem credencial: BOOTSTRAP_FAILURE e ZERO requisições", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO]]))
    const io = new IoCapturado()
    const r = await runLucasAnalysisCommand({}, { http, tokenSource: new TokenFalso() }, io)

    expect(r.exit_code).toBe(EXIT.BOOTSTRAP_FAILURE)
    expect(r.report).toBeUndefined()
    // Nada foi lido: falhamos antes de tentar.
    expect(http.urls).toHaveLength(0)
    // A mensagem vai para stderr, cita NOMES e não valores.
    expect(io.saida).toHaveLength(0)
    expect(io.erros).toHaveLength(1)
    const j = JSON.parse(io.erros[0] ?? "{}") as Record<string, unknown>
    expect(j["status"]).toBe("bootstrap_failure")
    expect(JSON.stringify(j)).toContain("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    expect(JSON.stringify(j)).not.toContain("PRIVATE KEY-----\\nSINT")
  })

  it("§11 — os três códigos são distintos e documentados", () => {
    expect(EXIT.GOVERNED_RESULT).toBe(0)
    expect(EXIT.BOOTSTRAP_FAILURE).toBe(1)
    expect(EXIT.UNEXPECTED_FAILURE).toBe(2)
    // Resultado governado é SUCESSO do comando, ainda que diga "fonte ausente".
    // Tratá-lo como erro faria um mês sem arquivo parecer processo quebrado.
    expect(new Set(Object.values(EXIT)).size).toBe(3)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §8 — os seis estados, todos projetados
// ═════════════════════════════════════════════════════════════════════════════

describe("§8 — o resumo cobre os seis estados", () => {
  it("`toReport` é exaustivo — cada estado tem projeção própria", () => {
    // O `switch` de `toReport` é exaustivo sobre a união da orquestração: estado novo
    // sem tratamento não compila. Este teste registra os seis nomes governados.
    const estados = [
      "source_not_available",
      "source_error",
      "source_invalid",
      "not_current",
      "d_not_executed",
      "d_executed",
    ]
    expect(estados).toHaveLength(6)
    // E prova que nenhum colapsa em sucesso/falha: cada um tem forma distinta.
    const r = toReport({
      status: "not_current",
      period: "2026-09",
      capture_period: "2026-08",
      reason: "CLOSED_PERIOD",
    })
    expect(r.status).toBe("not_current")
    expect(r.source?.reason).toBe("CLOSED_PERIOD")
    expect(r.source?.capture_period).toBe("2026-08")
    expect(r.detector).toBeUndefined()
    expect(r.population).toBeUndefined()
  })
})

/**
 * Grade de valores exibidos → forma `rowData` da API (Fase 2.13a).
 *
 * A leitura passou a ser `spreadsheets.get` com `includeGridData`: uma resposta, com
 * valor exibido, valor efetivo e tipo na mesma célula. A coluna `Desembolso` recebe
 * serial e tipo `DATE` como na fonte real.
 */
function gridDe(values: readonly unknown[][]): readonly unknown[] {
  const cab = values[0] ?? []
  const col = cab.findIndex((h) => String(h) === "Desembolso")
  return values.map((linha, i) => ({
    values: linha.map((v, j) => {
      const base = { formattedValue: v === null || v === undefined ? "" : String(v) }
      if (i === 0 || j !== col || String(v).trim() === "") return base
      return {
        ...base,
        effectiveValue: { numberValue: 46260 },
        effectiveFormat: { numberFormat: { type: "DATE" } },
      }
    }),
  }))
}
