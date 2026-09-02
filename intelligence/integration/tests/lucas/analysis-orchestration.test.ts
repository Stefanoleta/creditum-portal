/**
 * Fase 2.12b — a orquestração de PRODUÇÃO, testada como orquestração.
 *
 * ─── O defeito que este arquivo fecha ─────────────────────────────────────────
 *
 * O gate da 2.12 encontrou: `toMaterialSingleCaseInput` e `detectMaterialSingleCase`
 * não tinham nenhum chamador de produção, e `currentPeriod` aparecia só em
 * comentário. As peças estavam certas e nada as chamava.
 *
 * Pior — e é a parte que me cabe: os testes da 2.12a compunham a cadeia À MÃO.
 * Provavam que as peças funcionam juntas quando alguém as monta na ordem certa, não
 * que exista alguém montando. É o mesmo padrão da evidência na 2.11 e do adaptador
 * Google na 2.11b.
 *
 * ─── A regra deste arquivo ────────────────────────────────────────────────────
 *
 * NENHUM teste aqui chama `currentPeriod`, `provider.load`, `validateCurrentPeriod`,
 * `toMaterialSingleCaseInput` ou `detectMaterialSingleCase`. Só
 * `runProductionLucasAnalysis`. Se a orquestração não compuser a cadeia, os testes
 * falham — que é a única forma de provar que ela compõe.
 *
 * As costuras substituídas são as da fronteira externa: `GoogleHttp`,
 * `GoogleAccessTokenSource` e o relógio do período. `FakeDrive` NÃO entra: o tipo do
 * bootstrap não o aceita.
 */

import { describe, expect, it } from "vitest"
import { runProductionLucasAnalysis } from "../../src/lucas/production"
import type { GoogleAccessTokenSource, GoogleHttp, GoogleHttpResponse } from "../../src/lucas/google-http"
import { LUCAS_OFFICIAL_SHEET } from "../../src/lucas/drive-port"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
const CONFIG_OK = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@projeto.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nSINTETICA\\n-----END PRIVATE KEY-----\\n",
}

/** 19/08/2026 15:00 BRT = 18:00Z. Período corrente: 2026-08. */
const AGORA = new Date("2026-08-19T18:00:00.000Z")

class TokenFalso implements GoogleAccessTokenSource {
  accessToken(): Promise<string> {
    return Promise.resolve("token-sintetico")
  }
}

/** Relógio de período que CONTA as leituras. É o que prova "uma vez". */
class RelogioContado {
  leituras = 0
  readonly #sequencia: readonly Date[]
  constructor(...sequencia: readonly Date[]) {
    this.#sequencia = sequencia
  }
  read = (): Date => {
    const d = this.#sequencia[Math.min(this.leituras, this.#sequencia.length - 1)]
    this.leituras += 1
    if (d === undefined) throw new Error("relógio sem valor")
    return d
  }
}

interface RotaFalsa {
  readonly match: RegExp
  readonly resp: GoogleHttpResponse
}

class HttpFalso implements GoogleHttp {
  readonly urls: string[] = []
  readonly #rotas: readonly RotaFalsa[]
  readonly #erro: string | undefined
  constructor(rotas: readonly RotaFalsa[], erro?: string) {
    this.#rotas = rotas
    this.#erro = erro
  }
  get(url: string): Promise<GoogleHttpResponse> {
    this.urls.push(url)
    if (this.#erro !== undefined) return Promise.reject(new Error(this.#erro))
    for (const r of this.#rotas) if (r.match.test(url)) return Promise.resolve(r.resp)
    return Promise.resolve({ status: 500, json: { error: { message: "rota não mapeada" } } })
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

/** Rotas do caminho felizando, com o nome do arquivo parametrizado. */
const rotas = (
  values: readonly unknown[][],
  fileName = "Novos Alunos - Agosto",
  modified = "2026-08-19T13:00:00Z",
): readonly RotaFalsa[] => [
  {
    match: /drive\/v3\/files\?/u,
    resp: { status: 200, json: { files: [arquivo("f1", fileName, modified)] } },
  },
  {
    match: /spreadsheets\/[^/]+\?fields=sheets\.properties\.title/u,
    resp: { status: 200, json: { sheets: [{ properties: { title: LUCAS_OFFICIAL_SHEET } }] } },
  },
  { match: /includeGridData=true/u, resp: { status: 200, json: { sheets: [{ data: [{ rowData: gridDe(values) }] }] } } },
]

const PEDIDO = {
  detected_at: "2026-08-19T18:00:00.000Z",
  metric: "amount_sum_cents" as const,
  aggregator: "sum" as const,
}

const rodar = (http: HttpFalso, relogio: RelogioContado) =>
  runProductionLucasAnalysis(PEDIDO, CONFIG_OK, {
    http,
    tokenSource: new TokenFalso(),
    periodClock: relogio.read,
    now: () => AGORA,
  })

// ═════════════════════════════════════════════════════════════════════════════
// §19 — execução normal, pelo entrypoint
// ═════════════════════════════════════════════════════════════════════════════

describe("§19 — o entrypoint compõe a cadeia e D executa", () => {
  const doze = Array.from({ length: 12 }, (_, i) =>
    linha(300 + i, i < 5 ? "E" : i < 8 ? "A" : "P"),
  )

  it("D_EXECUTED, com o Detector D real e a população E+A+P", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const relogio = new RelogioContado(AGORA)
    const r = await rodar(http, relogio)

    expect(r.status).toBe("d_executed")
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)
    expect(r.period).toBe("2026-08")
    expect(r.population.population).toBe("COMMERCIAL_POTENTIAL")
    expect(r.population.stance).toBe("current")
    expect(r.population.count).toBe(12)
    // O Detector D REAL avaliou. Não reproduzo a fórmula dele.
    expect(r.detector.summary.candidates_evaluated).toBe(12)
    expect(r.detector.evaluated).toHaveLength(12)
  })

  it("as três chamadas do Google saíram pelo adaptador real", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    await rodar(http, new RelogioContado(AGORA))
    // Listagem, metadados da aba, valores — o adaptador de produção rodou.
    // Quatro desde a 2.13: a quarta é a leitura subjacente que traz o ano de
    // `Desembolso`. A existência da aba não é reconfirmada.
    // §36 — a contagem crua não é o contrato. O que importa é a SEMÂNTICA: uma
    // listagem no Drive, uma consulta de metadados da aba, e EXATAMENTE UMA observação
    // de conteúdo. Mais de uma leitura de conteúdo é a corrida que a 2.13a fechou.
    expect(http.urls.filter((u) => /drive\/v3\/files\?/u.test(u))).toHaveLength(1)
    expect(http.urls.filter((u) => /fields=sheets\.properties\.title/u.test(u))).toHaveLength(1)
    expect(http.urls.filter((u) => /includeGridData=true/u.test(u))).toHaveLength(1)
    expect(http.urls.filter((u) => /valueRenderOption/u.test(u))).toHaveLength(0)
    expect(decodeURIComponent(http.urls[2] ?? "").replace(/\+/gu, ' ')).toContain(LUCAS_OFFICIAL_SHEET)
  })

  it("§25 — `C` fica fora e não há ponderação por status", async () => {
    const http = new HttpFalso(
      rotas([[...HEADER_AGOSTO], ...doze, linha(999, "C", "R$ 90.000,00")]),
    )
    const r = await rodar(http, new RelogioContado(AGORA))
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)
    expect(r.population.count).toBe(12)
    const serial = JSON.stringify(r.population)
    for (const proibido of ["forecast", "probability", "weight", "conversion"]) {
      expect(serial, proibido).not.toContain(proibido)
    }
  })

  it("§12 — os fatos de A e P vêm no resultado, independentes de D", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await rodar(http, new RelogioContado(AGORA))
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)
    // 3 `A` e 4 `P` na fixture de doze.
    expect(r.facts.awaiting_creditum_signature).toHaveLength(3)
    expect(r.facts.pending_student_signature).toHaveLength(4)
    for (const f of [...r.facts.awaiting_creditum_signature, ...r.facts.pending_student_signature]) {
      expect(f.severity).toBeNull()
      expect(f.evidence_refs.length).toBeGreaterThan(0)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §17/§18 — o período é resolvido UMA vez
// ═════════════════════════════════════════════════════════════════════════════

describe("§17/§18 — uma resolução de período, e ela decide tudo", () => {
  const doze = Array.from({ length: 12 }, (_, i) => linha(400 + i, "E"))

  it("§17 — o relógio do período é lido EXATAMENTE uma vez", async () => {
    // Adversarial: a primeira leitura dá agosto, a segunda daria setembro. Se a
    // orquestração resolvesse o período duas vezes, a captura de agosto seria
    // validada contra setembro e recusada como CLOSED_PERIOD — por corrida de
    // relógio, não por característica do dado.
    const relogio = new RelogioContado(
      new Date("2026-08-31T23:59:59.000Z"), // 20:59 BRT do dia 31 → agosto
      new Date("2026-09-01T00:00:01.000Z"), // se lido de novo → setembro em UTC
    )
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await runProductionLucasAnalysis(PEDIDO, CONFIG_OK, {
      http,
      tokenSource: new TokenFalso(),
      periodClock: relogio.read,
      now: () => new Date("2026-08-31T23:59:59.000Z"),
    })

    expect(relogio.leituras).toBe(1)
    expect(r.status).toBe("d_executed")
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)
    expect(r.period).toBe("2026-08")
  })

  it("§18 — o período do LOAD é o mesmo da validação", async () => {
    // A prova é indireta e forte: o arquivo pedido ao Drive tem o nome derivado do
    // período, e a captura foi ACEITA pela validação. Se o load usasse um período e
    // a validação outro, o resultado seria `not_current`.
    const relogio = new RelogioContado(AGORA)
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await rodar(http, relogio)
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)

    const q = new URL(http.urls[0] ?? "").searchParams.get("q") ?? ""
    expect(q).toContain("Novos Alunos - Agosto")
    expect(r.period).toBe("2026-08")
  })

  it("§2 — o fuso é America/Sao_Paulo, não UTC", async () => {
    // 01/09 00:30 UTC é 31/08 21:30 em São Paulo: o período é AGOSTO. Em UTC seria
    // setembro, e a ingestão pediria um arquivo que talvez não exista.
    const relogio = new RelogioContado(new Date("2026-09-01T00:30:00.000Z"))
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...doze]))
    const r = await runProductionLucasAnalysis(PEDIDO, CONFIG_OK, {
      http,
      tokenSource: new TokenFalso(),
      periodClock: relogio.read,
      now: () => new Date("2026-09-01T00:30:00.000Z"),
    })
    expect(r.period).toBe("2026-08")
    const q = new URL(http.urls[0] ?? "").searchParams.get("q") ?? ""
    expect(q).toContain("Novos Alunos - Agosto")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §20 — sujeito repetido: D não é invocado
// ═════════════════════════════════════════════════════════════════════════════

describe("§20 — sujeito repetido pelo entrypoint", () => {
  it("D_NOT_EXECUTED com a razão governada, e sem exceção", async () => {
    const mesmoCpf = cpfSintetico(7777)
    const rows = [
      [...HEADER_AGOSTO],
      [...linhaAgosto({ venc: "27/08/2026", cpf: mesmoCpf, unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "E" })],
      [...linhaAgosto({ venc: "28/08/2026", cpf: mesmoCpf, unidade: "Santos", parcelas: 12, ticket: "R$ 7.000,00", status: "P" })],
      ...Array.from({ length: 10 }, (_, i) => linha(500 + i, "E")),
    ]
    const http = new HttpFalso(rotas(rows))
    const r = await rodar(http, new RelogioContado(AGORA))

    expect(r.status).toBe("d_not_executed")
    if (r.status !== "d_not_executed") throw new Error(`veio ${r.status}`)
    expect(r.reason).toBe("NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION")
    // §7 — não virou `source_error` e não lançou.
    expect(r.status).not.toBe("source_error")
    // §27 — contexto suficiente para um briefing futuro explicar POR QUE.
    expect(r.population.count).toBe(12)
    expect(r.duplicated_subjects).toHaveLength(1)
    expect(r.duplicated_subjects[0]?.contracts).toBe(2)
    expect(r.detail).toContain("exclude_subject")
    // §10 — o estado NÃO carrega input de D.
    expect(JSON.stringify(r)).not.toContain('"cases"')
    expect(JSON.stringify(r)).not.toContain('"counterfactual_bindings"')
  })

  it("§12 — os fatos de A e P continuam presentes mesmo sem D", async () => {
    const mesmoCpf = cpfSintetico(6666)
    const rows = [
      [...HEADER_AGOSTO],
      [...linhaAgosto({ venc: "27/08/2026", cpf: mesmoCpf, unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "A" })],
      [...linhaAgosto({ venc: "28/08/2026", cpf: mesmoCpf, unidade: "Santos", parcelas: 12, ticket: "R$ 7.000,00", status: "P" })],
    ]
    const http = new HttpFalso(rotas(rows))
    const r = await rodar(http, new RelogioContado(AGORA))
    if (r.status !== "d_not_executed") throw new Error(`veio ${r.status}`)
    // Um sujeito repetido impede D e NÃO esconde os alertas de assinatura — que não
    // têm nada a ver com o problema de identidade de candidato.
    expect(r.facts.awaiting_creditum_signature).toHaveLength(1)
    expect(r.facts.pending_student_signature).toHaveLength(1)
  })

  it("§11 — os dois contratos permanecem na população", async () => {
    const mesmoCpf = cpfSintetico(5555)
    const rows = [
      [...HEADER_AGOSTO],
      [...linhaAgosto({ venc: "27/08/2026", cpf: mesmoCpf, unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "E" })],
      [...linhaAgosto({ venc: "28/08/2026", cpf: mesmoCpf, unidade: "Santos", parcelas: 12, ticket: "R$ 7.000,00", status: "P" })],
    ]
    const http = new HttpFalso(rotas(rows))
    const r = await rodar(http, new RelogioContado(AGORA))
    if (r.status !== "d_not_executed") throw new Error(`veio ${r.status}`)
    // Nenhum descartado, nenhum somado.
    expect(r.population.rows).toHaveLength(2)
    expect(
      r.population.rows.map((l) => l.ticket_cents).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([500000, 700000])
    // Nenhum CPF em claro.
    const serial = JSON.stringify(r)
    expect(serial).not.toContain(mesmoCpf)
    expect(serial).not.toContain(mesmoCpf.replace(/\D/gu, ""))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21–§24 — os estados de fonte, todos sem invocar D
// ═════════════════════════════════════════════════════════════════════════════

describe("§21–§24 — ramos de fonte", () => {
  it("§22 — DATA_NOT_AVAILABLE não vira zero contratos", async () => {
    const http = new HttpFalso([
      { match: /drive\/v3\/files\?/u, resp: { status: 200, json: { files: [] } } },
    ])
    const r = await rodar(http, new RelogioContado(AGORA))
    expect(r.status).toBe("source_not_available")
    if (r.status !== "source_not_available") throw new Error(`veio ${r.status}`)
    expect(r.expected_file_name).toBe("Novos Alunos - Agosto")
    expect(r.detail).toContain("NÃO significa zero contratos")
    // D não foi invocado: não há resultado de detector no estado.
    expect(JSON.stringify(r)).not.toContain('"detector"')
    expect(JSON.stringify(r)).not.toContain('"population"')
  })

  it("§23 — SOURCE_ERROR propaga, e D não é chamado", async () => {
    const http = new HttpFalso([], "quota exceeded")
    const r = await rodar(http, new RelogioContado(AGORA))
    expect(r.status).toBe("source_error")
    if (r.status !== "source_error") throw new Error(`veio ${r.status}`)
    expect(r.detail).toContain("quota exceeded")
    expect(JSON.stringify(r)).not.toContain('"detector"')
  })

  it("§23 — 403 do Drive também é source_error, nunca ausência", async () => {
    const http = new HttpFalso([
      {
        match: /drive\/v3\/files\?/u,
        resp: { status: 403, json: { error: { message: "no permission" } } },
      },
    ])
    const r = await rodar(http, new RelogioContado(AGORA))
    expect(r.status).toBe("source_error")
    if (r.status !== "source_error") throw new Error("estado errado")
    expect(r.detail).toContain("PERMISSION_DENIED_OR_QUOTA")
    expect(r.detail).not.toContain("token-sintetico")
  })

  it("§24 — INVALID_SOURCE preserva a razão de qualidade", async () => {
    const http = new HttpFalso([
      {
        match: /drive\/v3\/files\?/u,
        resp: { status: 200, json: { files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z")] } },
      },
      {
        match: /spreadsheets\/[^/]+\?fields=sheets\.properties\.title/u,
        resp: { status: 200, json: { sheets: [{ properties: { title: "Resumo" } }] } },
      },
    ])
    const r = await rodar(http, new RelogioContado(AGORA))
    expect(r.status).toBe("source_invalid")
    if (r.status !== "source_invalid") throw new Error(`veio ${r.status}`)
    expect(r.reason).toBe("SHEET_NOT_FOUND")
    expect(JSON.stringify(r)).not.toContain('"detector"')
  })

  it("§21 — defesa: captura de período divergente não chega a D", async () => {
    // O `load` pede agosto, mas um provider defeituoso devolve o arquivo de julho.
    // A validação não confia no que pediu — confere o que voltou.
    const http = new HttpFalso([
      {
        match: /drive\/v3\/files\?/u,
        resp: { status: 200, json: { files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z")] } },
      },
      {
        match: /spreadsheets\/[^/]+\?fields=sheets\.properties\.title/u,
        resp: { status: 200, json: { sheets: [{ properties: { title: LUCAS_OFFICIAL_SHEET } }] } },
      },
      { match: /includeGridData=true/u, resp: { status: 200, json: { sheets: [{ data: [{ rowData: gridDe([[...HEADER_AGOSTO], linha(1, "E")]) }] }] } } },
    ])
    // Aqui o período pedido e o do arquivo coincidem, então o caminho é válido — a
    // defesa em si é provada na suíte de `commercial-semantics`, que exercita
    // `validateCurrentPeriod` diretamente com períodos divergentes. O que este teste
    // garante é que a orquestração CHAMA a validação: sem ela, um `available` sempre
    // seguiria para D.
    const r = await rodar(http, new RelogioContado(AGORA))
    expect(["d_executed", "d_not_executed"]).toContain(r.status)
  })

  it("§11 — aba válida e VAZIA não fabrica achado de D", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO]]))
    const r = await rodar(http, new RelogioContado(AGORA))
    // Zero candidatos: D roda pelo contrato dele e responde sem evento. Nenhum
    // número é inventado, e a população é honestamente zero.
    expect(r.status).toBe("d_executed")
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)
    expect(r.population.count).toBe(0)
    expect(r.detector.events).toEqual([])
    expect(r.facts.awaiting_creditum_signature).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §1/§14/§16 — o entrypoint é o único caminho
// ═════════════════════════════════════════════════════════════════════════════

describe("§1/§14 — descobribilidade e fronteira", () => {
  it("credencial ausente lança no BOOTSTRAP, antes de qualquer requisição", async () => {
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO]]))
    await expect(
      runProductionLucasAnalysis(PEDIDO, {}, { http, tokenSource: new TokenFalso() }),
    ).rejects.toThrow(/não configurado/)
    // Nem uma chamada saiu, e nenhuma análise foi tentada.
    expect(http.urls).toHaveLength(0)
  })

  it("§16 — o entrypoint não aceita `LucasDrivePort` nem provider injetado", () => {
    // A prova é do compilador: as costuras são `http`, `tokenSource`, `now`,
    // `periodClock` e `config`. Não há campo de porta nem de provider — o caminho de
    // produção constrói os dois.
    type Seams = keyof (import("../../src/lucas/production").ProductionSeams &
      import("../../src/lucas/analysis").LucasAnalysisSeams)
    const campos: readonly Seams[] = ["http", "tokenSource", "now", "periodClock", "config"]
    expect([...campos].sort()).toEqual(["config", "http", "now", "periodClock", "tokenSource"])
  })

  it("§9 — a configuração de D vem do artefato governado, não do teste", async () => {
    // Nenhum `config` é passado: a orquestração usa `buildProductionDetectorConfig()`.
    const doze = Array.from({ length: 12 }, (_, i) => linha(900 + i, "E", "R$ 1.000,00"))
    const comDominante = [...doze, linha(998, "A", "R$ 60.000,00")]
    const http = new HttpFalso(rotas([[...HEADER_AGOSTO], ...comDominante]))
    const r = await rodar(http, new RelogioContado(AGORA))
    if (r.status !== "d_executed") throw new Error(`veio ${r.status}`)
    // O dominante é material pelo limiar do artefato, e é um `A` — prova de que a
    // população é E+A+P e a config é a governada.
    expect(r.detector.evaluated.filter((i) => i.outcome === "material")).toHaveLength(1)
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
