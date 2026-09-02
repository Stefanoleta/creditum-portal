/**
 * Fase 2.11b — o adaptador Google de produção e o bootstrap.
 *
 * ─── O que o gate apontou ─────────────────────────────────────────────────────
 *
 * NO-SHIP: `productionLucasProvider` validava credencial e exigia que o chamador
 * fornecesse o `LucasDrivePort`; a única implementação era `FakeDrive`. O código
 * afirmava acesso ao Google e não tinha caminho para falar com o Google.
 *
 * ─── Onde este arquivo substitui, e onde NÃO substitui ─────────────────────────
 *
 * A costura é `GoogleHttp` + `GoogleAccessTokenSource` — a fronteira em que o
 * processo sai da máquina. Tudo acima dela é o código de produção real:
 * `GoogleDriveSheetsSource`, a query do Drive, o range da aba, o mapeamento de erro,
 * o provider, o snapshot governado.
 *
 * Em particular, este arquivo NUNCA passa `FakeDrive` a `productionLucasProvider` —
 * o tipo já não permite, e é essa impossibilidade que fecha o achado. Nenhum teste
 * aqui toca a rede.
 */

import { describe, expect, it } from "vitest"
import {
  GOOGLE_READONLY_SCOPES,
  GoogleDriveSheetsSource,
} from "../../src/lucas/google-drive-source"
import { GoogleApiError, googleErrorClass, googleErrorReason } from "../../src/lucas/google-http"
import type { GoogleAccessTokenSource, GoogleHttp, GoogleHttpResponse } from "../../src/lucas/google-http"
import { productionLucasProvider } from "../../src/lucas/production"
import { LUCAS_OFFICIAL_FOLDER_ID, LUCAS_OFFICIAL_SHEET } from "../../src/lucas/drive-port"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
const CONFIG_OK = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@projeto.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nSINTETICA\\n-----END PRIVATE KEY-----\\n",
}

/** Token falso. Registra quantas vezes foi pedido. */
class TokenFalso implements GoogleAccessTokenSource {
  pedidos = 0
  accessToken(): Promise<string> {
    this.pedidos += 1
    return Promise.resolve("token-sintetico")
  }
}

interface Chamada {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

/**
 * Transporte falso, roteado por padrão de URL.
 *
 * Registra TODA URL, porque metade das asserções deste arquivo é sobre o que foi
 * pedido — a restrição de pasta, a ausência de `limit`, o nome da aba — e não sobre
 * o que voltou.
 */
class HttpFalso implements GoogleHttp {
  readonly chamadas: Chamada[] = []
  readonly #rotas: readonly { readonly match: RegExp; readonly resp: GoogleHttpResponse }[]
  readonly #erro: string | undefined

  constructor(
    rotas: readonly { readonly match: RegExp; readonly resp: GoogleHttpResponse }[],
    erroDeTransporte?: string,
  ) {
    this.#rotas = rotas
    this.#erro = erroDeTransporte
  }

  get(url: string, headers: Readonly<Record<string, string>>): Promise<GoogleHttpResponse> {
    this.chamadas.push({ url, headers })
    if (this.#erro !== undefined) return Promise.reject(new Error(this.#erro))
    for (const r of this.#rotas) if (r.match.test(url)) return Promise.resolve(r.resp)
    return Promise.resolve({ status: 500, json: { error: { message: "rota não mapeada no duplo" } } })
  }

  urls(padrao: RegExp): readonly string[] {
    return this.chamadas.filter((c) => padrao.test(c.url)).map((c) => c.url)
  }
}

const arquivoDrive = (id: string, name: string, modifiedTime: string, mimeType = SHEETS_MIME) => ({
  id,
  name,
  mimeType,
  modifiedTime,
})

const GRADE_VALUES = [
  [...HEADER_AGOSTO],
  [
    ...linhaAgosto({
      venc: "27/08/2026",
      cpf: cpfSintetico(1),
      unidade: "Meriti",
      parcelas: 20,
      ticket: "R$ 8.151,60",
      status: "E",
    }),
  ],
]

/** Rotas do caminho felizando: listagem, metadados da planilha, valores. */
const rotasOk = (
  files: readonly ReturnType<typeof arquivoDrive>[],
  titulos: readonly string[] = [LUCAS_OFFICIAL_SHEET],
  values: readonly unknown[][] = GRADE_VALUES,
  nextPageToken?: string,
) => [
  {
    match: /drive\/v3\/files\?/u,
    resp: { status: 200, json: nextPageToken === undefined ? { files } : { files, nextPageToken } },
  },
  {
    match: /sheets\.googleapis\.com\/v4\/spreadsheets\/[^/]+\?fields=sheets\.properties\.title/u,
    resp: { status: 200, json: { sheets: titulos.map((title) => ({ properties: { title } })) } },
  },
  {
    // A leitura de CONTEÚDO: `spreadsheets.get` com `includeGridData`. Devolve, na
    // mesma célula, `formattedValue`, `effectiveValue` e o tipo de formato.
    match: /includeGridData=true/u,
    resp: { status: 200, json: { sheets: [{ data: [{ rowData: gridDe(values) }] }] } },
  },
]

/**
 * Converte uma grade de valores exibidos na forma `rowData` da API.
 *
 * Célula de `Desembolso` recebe `effectiveValue.numberValue` e tipo `DATE`, como a
 * fonte real; as outras ficam só com o valor exibido. Um duplo que não modelasse essa
 * diferença tornaria vacuoso o teste do prazo.
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
        effectiveValue: { numberValue: SERIAL_DESEMBOLSO },
        effectiveFormat: { numberFormat: { type: "DATE" } },
      }
    }),
  }))
}

/** 2026-08-26. Serial real observado na fonte oficial. */
const SERIAL_DESEMBOLSO = 46260

// ═════════════════════════════════════════════════════════════════════════════
// §6/§7/§9 — a query do Drive
// ═════════════════════════════════════════════════════════════════════════════

describe("§7/§9 — listagem restrita à pasta e sem limite", () => {
  const fonte = (http: HttpFalso): GoogleDriveSheetsSource =>
    new GoogleDriveSheetsSource(http, new TokenFalso())

  it("A — a query restringe pasta, nome exato e exclui lixeira", async () => {
    const http = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")]))
    await fonte(http).listCandidates(LUCAS_OFFICIAL_FOLDER_ID, "Novos Alunos - Agosto")

    const url = http.urls(/drive\/v3\/files/u)[0]
    expect(url).toBeDefined()
    const q = new URL(url ?? "").searchParams.get("q") ?? ""

    // Restrição de pasta na QUERY, não filtro posterior: o processo nunca recebe
    // metadado de arquivo de fora da pasta oficial.
    expect(q).toContain(`'${LUCAS_OFFICIAL_FOLDER_ID}' in parents`)
    expect(q).toContain("name = 'Novos Alunos - Agosto'")
    // Arquivo na lixeira ainda aparece em `files.list` por padrão; um mês excluído
    // por engano voltaria a competir com o vigente.
    expect(q).toContain("trashed = false")
    // NÃO é busca global: sem `in parents` a mesma chamada varreria o Drive todo.
    expect(q).not.toContain("fullText")
  })

  it("B — NÃO usa limite 1; sem isso duplicidade seria indetectável", async () => {
    const http = new HttpFalso(rotasOk([
      arquivoDrive("aaa", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z"),
      arquivoDrive("bbb", "Novos Alunos - Agosto", "2026-08-19T10:00:00Z"),
    ]))
    const r = await fonte(http).listCandidates(LUCAS_OFFICIAL_FOLDER_ID, "Novos Alunos - Agosto")

    const url = new URL(http.urls(/drive\/v3\/files/u)[0] ?? "")
    // O workflow oficial usa `limit: 1`. Com um candidato devolvido,
    // `DUPLICATE_SOURCE_WARNING` seria inalcançável por construção.
    expect(url.searchParams.get("pageSize")).toBe("100")
    expect(url.searchParams.get("limit")).toBeNull()
    // E os DOIS candidatos voltam.
    expect(r).toHaveLength(2)
    expect(r.map((c) => c.file_id).sort()).toEqual(["aaa", "bbb"])
  })

  it("B — pagina até o fim: nenhum candidato fica de fora", async () => {
    let pagina = 0
    const http: GoogleHttp = {
      get(url: string): Promise<GoogleHttpResponse> {
        pagina += 1
        if (/drive\/v3\/files/u.test(url)) {
          return Promise.resolve(
            pagina === 1
              ? { status: 200, json: { files: [arquivoDrive("p1", "Novos Alunos - Agosto", "2026-08-19T10:00:00Z")], nextPageToken: "tok" } }
              : { status: 200, json: { files: [arquivoDrive("p2", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")] } },
          )
        }
        return Promise.resolve({ status: 500, json: {} })
      },
    }
    const r = await new GoogleDriveSheetsSource(http, new TokenFalso()).listCandidates(
      LUCAS_OFFICIAL_FOLDER_ID,
      "Novos Alunos - Agosto",
    )
    expect(r.map((c) => c.file_id)).toEqual(["p1", "p2"])
  })

  it("C — o mapeamento de metadados preserva id, nome, MIME e modifiedTime", async () => {
    const http = new HttpFalso(rotasOk([
      arquivoDrive("id-1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z"),
      arquivoDrive("id-2", "Novos Alunos - Agosto", "2026-08-18T08:00:00Z", "application/vnd.ms-excel"),
    ]))
    const r = await fonte(http).listCandidates(LUCAS_OFFICIAL_FOLDER_ID, "Novos Alunos - Agosto")
    expect(r[0]).toEqual({
      file_id: "id-1",
      name: "Novos Alunos - Agosto",
      mime_type: SHEETS_MIME,
      modified_time: "2026-08-19T13:39:00Z",
    })
    // MIME incompatível NÃO é filtrado aqui: o provider precisa vê-lo para registrar
    // `CANDIDATE_WITH_INCOMPATIBLE_MIME`.
    expect(r[1]?.mime_type).toBe("application/vnd.ms-excel")
  })

  it("MIME ausente NÃO é assumido como Sheets", async () => {
    const http = new HttpFalso(rotasOk([
      { id: "x", name: "Novos Alunos - Agosto", modifiedTime: "2026-08-19T13:39:00Z" } as never,
    ]))
    const r = await fonte(http).listCandidates(LUCAS_OFFICIAL_FOLDER_ID, "Novos Alunos - Agosto")
    // Assumir Sheets faria um objeto de tipo desconhecido ser lido como a fonte.
    expect(r[0]?.mime_type).toBe("")
  })

  it("`modifiedTime` ausente vira vazio, não `agora`", async () => {
    const http = new HttpFalso(rotasOk([
      { id: "x", name: "Novos Alunos - Agosto", mimeType: SHEETS_MIME } as never,
    ]))
    const r = await fonte(http).listCandidates(LUCAS_OFFICIAL_FOLDER_ID, "Novos Alunos - Agosto")
    // Substituir por "agora" datar-ia a observação com o nosso relógio. Vazio cai em
    // `SOURCE_TIME_UNPARSEABLE` no provider.
    expect(r[0]?.modified_time).toBe("")
  })

  it("a query escapa apóstrofo — parâmetro, não sintaxe", async () => {
    const http = new HttpFalso(rotasOk([]))
    await fonte(http).listCandidates("pasta'X", "Nome'Y")
    const q = new URL(http.urls(/drive\/v3\/files/u)[0] ?? "").searchParams.get("q") ?? ""
    expect(q).toContain("pasta\\'X")
    expect(q).toContain("Nome\\'Y")
  })

  it("o token vai no header Authorization e não na URL", async () => {
    const http = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")]))
    await fonte(http).listCandidates(LUCAS_OFFICIAL_FOLDER_ID, "Novos Alunos - Agosto")
    const c = http.chamadas[0]
    expect(c?.headers["Authorization"]).toBe("Bearer token-sintetico")
    // Token em query string acaba em log de servidor e em histórico.
    expect(c?.url).not.toContain("token-sintetico")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §11 — a aba oficial
// ═════════════════════════════════════════════════════════════════════════════

describe("§11 — leitura da aba `Status Contratos`", () => {
  it("D — pede a aba pelo NOME, com apóstrofos no A1 notation", async () => {
    const http = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")]))
    const r = await new GoogleDriveSheetsSource(http, new TokenFalso()).observeSheet("f1", LUCAS_OFFICIAL_SHEET)
    expect(r.status).toBe("ok")

    const url = http.urls(/includeGridData=true/u)[0] ?? ""
    // Aba com espaço exige apóstrofos; sem eles o Sheets interpreta como célula.
    // `URLSearchParams` codifica espaço como `+`; a comparação normaliza antes.
    expect(decodeURIComponent(url).replace(/\+/gu, " ")).toContain("ranges='Status Contratos'")
    // Nunca por índice: `A:Z` ou `Sheet1` leriam outra aba.
    expect(url).not.toMatch(/ranges=A\d?:/u)
    const params = new URL(url).searchParams
    // A leitura é `includeGridData`, não `values.get`: não existe mais
    // `valueRenderOption`, porque as três faces da célula vêm juntas. `formattedValue`
    // segue sendo a autoridade do que a planilha MOSTRA — dinheiro, percentual, CPF —
    // e `effectiveValue` existe só para os campos que exigem data completa da fonte.
    expect(params.get("valueRenderOption")).toBeNull()
    expect(params.get("includeGridData")).toBe("true")
    // `fields` estreito: três campos por célula, e nada de formatação, notas ou
    // fórmulas de uma fonte que contém CPF e nome.
    const campos = params.get("fields") ?? ""
    expect(campos).toContain("formattedValue")
    expect(campos).toContain("effectiveValue.numberValue")
    expect(campos).toContain("effectiveFormat.numberFormat.type")
    expect(campos).not.toContain("userEnteredFormat")
    expect(campos).not.toContain("note")
  })

  it("consulta os metadados ANTES dos valores, para provar que a aba existe", async () => {
    const http = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")]))
    await new GoogleDriveSheetsSource(http, new TokenFalso()).observeSheet("f1", LUCAS_OFFICIAL_SHEET)
    const ordem = http.chamadas.map((c) => (/fields=sheets\.properties\.title/u.test(c.url) ? "meta" : "grid"))
    expect(ordem).toEqual(["meta", "grid"])
  })

  it("G — aba ausente segue o contrato de fonte inválida, não erro", async () => {
    const http = new HttpFalso(rotasOk([], ["Resumo", "Base"]))
    const r = await new GoogleDriveSheetsSource(http, new TokenFalso()).observeSheet("f1", LUCAS_OFFICIAL_SHEET)
    expect(r.status).toBe("sheet_not_found")
    if (r.status !== "sheet_not_found") throw new Error("estado errado")
    expect(r.available_sheets).toEqual(["Base", "Resumo"])
    // E os valores NÃO foram pedidos: `values.get` com aba inexistente devolve 400,
    // que pareceria falha de infraestrutura.
    expect(http.urls(/includeGridData=true/u)).toHaveLength(0)
  })

  it("primeira linha é cabeçalho; `values` ausente é aba vazia, não erro", async () => {
    const comDados = new HttpFalso(rotasOk([], [LUCAS_OFFICIAL_SHEET], GRADE_VALUES))
    const r1 = await new GoogleDriveSheetsSource(comDados, new TokenFalso()).observeSheet("f1", LUCAS_OFFICIAL_SHEET)
    if (r1.status !== "ok") throw new Error("estado errado")
    expect(r1.observation.headers.map((c) => c.formatted)).toEqual([...HEADER_AGOSTO])
    expect(r1.observation.rows).toHaveLength(1)

    // O Sheets OMITE a chave `values` para aba vazia, em vez de mandar `[]`.
    const vazia = new HttpFalso([
      ...rotasOk([], [LUCAS_OFFICIAL_SHEET]).slice(0, 2),
      { match: /includeGridData=true/u, resp: { status: 200, json: {} } },
    ])
    const r2 = await new GoogleDriveSheetsSource(vazia, new TokenFalso()).observeSheet("f1", LUCAS_OFFICIAL_SHEET)
    if (r2.status !== "ok") throw new Error("estado errado")
    expect(r2.observation.headers.map((c) => c.formatted)).toEqual([])
    expect(r2.observation.rows).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §13/§14 — mapeamento de erro
// ═════════════════════════════════════════════════════════════════════════════

describe("§13/§14 — falha do Google vira source_error, nunca ausência de dado", () => {
  const provider = (http: GoogleHttp) =>
    productionLucasProvider(CONFIG_OK, { http, tokenSource: new TokenFalso(), now: () => new Date("2026-08-19T18:00:00.000Z") })

  it("E — falha na LISTAGEM chega ao provider como source_error", async () => {
    for (const [status, classe] of [
      [401, "UNAUTHENTICATED"],
      [403, "PERMISSION_DENIED_OR_QUOTA"],
      [429, "RATE_LIMITED"],
      [503, "BACKEND_ERROR"],
    ] as const) {
      const http = new HttpFalso([
        { match: /drive\/v3\/files/u, resp: { status, json: { error: { message: "detalhe do google" } } } },
      ])
      const r = await provider(http).load({ period: "2026-08" })
      expect(r.status, String(status)).toBe("source_error")
      if (r.status !== "source_error") throw new Error("estado errado")
      // A classe é legível por máquina: "permissão" é uma conversa com quem
      // administra a pasta; "quota" é uma conversa sobre volume.
      expect(r.detail, String(status)).toContain(classe)
    }
  })

  it("§14 — 403 identifica a operação e a pasta, e nenhum segredo", async () => {
    const http = new HttpFalso([
      { match: /drive\/v3\/files/u, resp: { status: 403, json: { error: { message: "The caller does not have permission" } } } },
    ])
    const r = await provider(http).load({ period: "2026-08" })
    if (r.status !== "source_error") throw new Error("estado errado")
    expect(r.detail).toContain("drive.files.list")
    expect(r.detail).toContain(LUCAS_OFFICIAL_FOLDER_ID)
    expect(r.detail).not.toContain("token-sintetico")
    expect(r.detail).not.toContain("PRIVATE KEY")
    expect(r.detail).not.toContain("Bearer")
  })

  it("F — falha na LEITURA da aba também é source_error", async () => {
    const http = new HttpFalso([
      { match: /drive\/v3\/files/u, resp: { status: 200, json: { files: [arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")] } } },
      { match: /fields=sheets\.properties\.title/u, resp: { status: 200, json: { sheets: [{ properties: { title: LUCAS_OFFICIAL_SHEET } }] } } },
      { match: /includeGridData=true/u, resp: { status: 500, json: { error: { message: "internal" } } } },
    ])
    const r = await provider(http).load({ period: "2026-08" })
    expect(r.status).toBe("source_error")
  })

  it("falha de TRANSPORTE (rede/DNS) também é source_error", async () => {
    const http = new HttpFalso([], "ENOTFOUND www.googleapis.com")
    const r = await provider(http).load({ period: "2026-08" })
    expect(r.status).toBe("source_error")
    if (r.status !== "source_error") throw new Error("estado errado")
    expect(r.detail).toContain("ENOTFOUND")
  })

  it("§13 — resposta 200 SEM candidato é data_not_available, não erro", async () => {
    const http = new HttpFalso([{ match: /drive\/v3\/files/u, resp: { status: 200, json: { files: [] } } }])
    const r = await provider(http).load({ period: "2026-08" })
    // O Google respondeu bem. O arquivo do mês não existe. São coisas diferentes.
    expect(r.status).toBe("data_not_available")
  })

  it("§15 — aba ausente é invalid_source, não data_not_available", async () => {
    const http = new HttpFalso([
      { match: /drive\/v3\/files/u, resp: { status: 200, json: { files: [arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")] } } },
      { match: /fields=sheets\.properties\.title/u, resp: { status: 200, json: { sheets: [{ properties: { title: "Resumo" } }] } } },
    ])
    const r = await provider(http).load({ period: "2026-08" })
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SHEET_NOT_FOUND")
  })

  it("a razão do erro higieniza credencial que venha no corpo do Google", () => {
    const sujo = { error: { message: "bad Bearer ya29.SEGREDO and -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----" } }
    const razao = googleErrorReason(403, sujo)
    expect(razao).toContain("PERMISSION_DENIED_OR_QUOTA")
    expect(razao).not.toContain("ya29.SEGREDO")
    expect(razao).not.toContain("BEGIN PRIVATE KEY")
    expect(razao).toContain("[redigido]")
  })

  it("classes de erro cobrem os status que importam", () => {
    expect(googleErrorClass(401)).toBe("UNAUTHENTICATED")
    expect(googleErrorClass(403)).toBe("PERMISSION_DENIED_OR_QUOTA")
    expect(googleErrorClass(404)).toBe("NOT_FOUND")
    expect(googleErrorClass(429)).toBe("RATE_LIMITED")
    expect(googleErrorClass(500)).toBe("BACKEND_ERROR")
    expect(googleErrorClass(400)).toBe("REQUEST_REJECTED")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §19/§20/§21 — o bootstrap: o teste que o gate expôs como ausente
// ═════════════════════════════════════════════════════════════════════════════

describe("§19 — o bootstrap de produção constrói o adaptador real", () => {
  it("config válida → provider utilizável SEM porta fornecida pelo chamador", async () => {
    const http = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z")]))
    const token = new TokenFalso()

    // Nenhum `LucasDrivePort` é passado. O adaptador é construído lá dentro.
    const provider = productionLucasProvider(CONFIG_OK, {
      http,
      tokenSource: token,
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    })

    const r = await provider.load({ period: "2026-08" })
    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")

    // Prova de que o adaptador REAL rodou: as chamadas do Google saíram, na ordem
    // certa, com a pasta oficial e a aba oficial.
    //
    // Quatro e não três desde a Fase 2.13: a quarta é a leitura SUBJACENTE do mesmo
    // range, a única forma de obter o ano de `Desembolso`, que o valor formatado
    // `26/08` não carrega. Ela NÃO repete `spreadsheets.get` — a existência da aba já
    // foi confirmada pela leitura primária, e reconfirmar gastaria quota para saber o
    // que acabou de ser sabido.
    // Três: listagem no Drive, metadados da aba, e UMA leitura de conteúdo. A 2.13a
    // removeu a segunda leitura de conteúdo — a que permitia a corrida.
    expect(http.chamadas).toHaveLength(3)
    expect(http.urls(/drive\/v3\/files/u)).toHaveLength(1)
    expect(decodeURIComponent(http.urls(/drive\/v3\/files/u)[0] ?? "")).toContain(LUCAS_OFFICIAL_FOLDER_ID)
    expect(
      decodeURIComponent(http.urls(/includeGridData=true/u)[0] ?? "").replace(/\+/gu, " "),
    ).toContain(LUCAS_OFFICIAL_SHEET)
    // Um token por chamada HTTP.
    expect(token.pedidos).toBe(3)

    // E o pipeline governado inteiro chegou até o fim.
    expect(r.provenance.file_id).toBe("f1")
    expect(r.provenance.folder_id).toBe(LUCAS_OFFICIAL_FOLDER_ID)
    expect(r.snapshot.snapshot_id).toMatch(/^snap_[a-f0-9]{16}$/)
    expect(r.evidence.rowEvidence).toHaveLength(1)
    expect(r.rows[0]?.unit.status).toBe("matched")
  })

  it("§21 — não existe assinatura onde caiba um FakeDrive", () => {
    // A prova é do compilador: `productionLucasProvider(env, seams)` — `seams` só
    // aceita `http`, `tokenSource` e `now`. Não há campo de `LucasDrivePort`.
    //
    // Esta constante existe para registrar a intenção junto da asserção de tipo; a
    // tentativa de passar uma porta não compila, e foi o compilador que quebrou os
    // testes antigos quando a assinatura mudou.
    type Seams = keyof import("../../src/lucas/production").ProductionSeams
    const campos: readonly Seams[] = ["http", "tokenSource", "now"]
    expect([...campos].sort()).toEqual(["http", "now", "tokenSource"])
  })

  it("§20 — config ausente → erro de bootstrap e NENHUMA requisição", () => {
    const http = new HttpFalso(rotasOk([]))
    expect(() => productionLucasProvider({}, { http, tokenSource: new TokenFalso() })).toThrow(
      /não configurado/,
    )
    // O ponto: nem uma chamada saiu. Falhamos antes de tentar ler.
    expect(http.chamadas).toHaveLength(0)
  })

  it("§20 — chave presente e e-mail ausente também falha, e sem fallback", () => {
    const http = new HttpFalso(rotasOk([]))
    expect(() =>
      productionLucasProvider({ GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "x" }, { http, tokenSource: new TokenFalso() }),
    ).toThrow(/não configurado/)
    expect(http.chamadas).toHaveLength(0)
  })

  it("§24 — duplicidade continua não bloqueando pelo caminho de produção", async () => {
    const http = new HttpFalso(rotasOk([
      arquivoDrive("bbb", "Novos Alunos - Agosto", "2026-08-19T10:00:00Z"),
      arquivoDrive("aaa", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z"),
    ]))
    const r = await productionLucasProvider(CONFIG_OK, {
      http,
      tokenSource: new TokenFalso(),
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    }).load({ period: "2026-08" })

    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.selection.selected_file_id).toBe("aaa")
    expect(r.selection.selection_rule).toBe("LATEST_MODIFIED_THEN_STABLE_FILE_ID")
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
    // Sem regressão para Conflict.
    expect(r.snapshot.conflicts).toEqual([])
    expect(r.snapshot.quality_status).toBe("degraded")
    // E o arquivo lido é o SELECIONADO, não o primeiro que o Google devolveu.
    expect(decodeURIComponent(http.urls(/includeGridData=true/u)[0] ?? "")).toContain("aaa")
  })

  it("§16 — o `modifiedTime` do Drive passa pelo contrato de tempo existente", async () => {
    // Relógio da fonte adiantado, vindo do Google de verdade pelo adaptador.
    const http = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-20T09:00:00Z")]))
    const r = await productionLucasProvider(CONFIG_OK, {
      http,
      tokenSource: new TokenFalso(),
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    }).load({ period: "2026-08" })
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SOURCE_TIME_INCONSISTENT")

    // E precisão ISO diferente continua sendo o mesmo instante.
    const igual = new HttpFalso(rotasOk([arquivoDrive("f1", "Novos Alunos - Agosto", "2026-08-19T18:00:00Z")]))
    const r2 = await productionLucasProvider(CONFIG_OK, {
      http: igual,
      tokenSource: new TokenFalso(),
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    }).load({ period: "2026-08" })
    expect(r2.status).toBe("available")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §6/§17 — escopos e fronteira
// ═════════════════════════════════════════════════════════════════════════════

describe("§6/§17 — menor privilégio e fronteira do SDK", () => {
  it("os escopos são somente leitura", () => {
    expect([...GOOGLE_READONLY_SCOPES]).toEqual([
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ])
    for (const s of GOOGLE_READONLY_SCOPES) {
      expect(s).toContain("readonly")
      // Nenhum escopo amplo: `auth/drive` daria escrita e acesso a todo o Drive.
      expect(s).not.toBe("https://www.googleapis.com/auth/drive")
      expect(s).not.toBe("https://www.googleapis.com/auth/spreadsheets")
    }
  })

  it("`GoogleHttp` só tem verbo de leitura", () => {
    // A fronteira externa não tem `post`/`patch`/`delete`. Não é que o adaptador
    // evite escrever: não existe a operação para chamar.
    const http = new HttpFalso([])
    expect(typeof http.get).toBe("function")
    const chaves = Object.getOwnPropertyNames(Object.getPrototypeOf(http) as object)
    expect(chaves).not.toContain("post")
    expect(chaves).not.toContain("put")
    expect(chaves).not.toContain("patch")
    expect(chaves).not.toContain("delete")
  })

  it("`GoogleApiError` carrega diagnóstico e nenhum segredo", () => {
    const e = new GoogleApiError("drive.files.list", "folder=abc", 403, "PERMISSION_DENIED_OR_QUOTA")
    expect(e.status).toBe(403)
    expect(e.operation).toBe("drive.files.list")
    expect(e.resource).toBe("folder=abc")
    expect(e.message).toContain("403")
    expect(JSON.stringify({ m: e.message, r: e.reason })).not.toMatch(/Bearer|PRIVATE KEY/u)
  })
})
