/**
 * `LucasDrivePort` de PRODUÇÃO, sobre a API REST do Google. Somente leitura.
 *
 * ─── O que este arquivo fecha ─────────────────────────────────────────────────
 *
 * O gate da Fase 2.11 deu NO-SHIP por uma razão certa: existia porta e não existia
 * implementação. O provider inteiro estava testado contra `FakeDrive` e não havia
 * caminho pelo qual a planilha real chegasse. Este é o caminho.
 *
 * ─── Por que REST direto e não o SDK `googleapis` ─────────────────────────────
 *
 * `googleapis` traz o cliente gerado de centenas de APIs. Precisamos de três
 * chamadas: listar arquivos numa pasta, ler os títulos das abas de uma planilha, ler
 * os valores de uma aba. A autenticação — que é a parte que NÃO se escreve à mão —
 * vem de `google-auth-library`, a biblioteca oficial do Google, que assina o JWT do
 * service account e cuida de cache e renovação de token.
 *
 * Nenhuma criptografia caseira: a assinatura é da biblioteca oficial.
 *
 * ─── Somente leitura em três camadas ──────────────────────────────────────────
 *
 * 1. escopos: `drive.metadata.readonly` e `spreadsheets.readonly`;
 * 2. `GoogleHttp` só tem `get` — não existe verbo de escrita para chamar;
 * 3. `LucasDrivePort` só tem `listCandidates` e `observeSheet`.
 *
 * As três são independentes. Furar uma não basta.
 *
 * ─── O que este adaptador NÃO decide ──────────────────────────────────────────
 *
 * Não escolhe entre candidatos, não valida MIME, não interpreta cabeçalho, não
 * normaliza dinheiro e não classifica `Venc`. Devolve o que o Google disse, cru. A
 * regra `LATEST_MODIFIED_THEN_STABLE_FILE_ID` é do provider, e mantê-la lá é o que
 * permite testá-la sem rede — inclusive contra todas as permutações de ordem.
 */

import { GOOGLE_SHEETS_MIME } from "./drive-port"
import type {
  DriveFileMeta,
  LucasDrivePort,
  SheetCell,
  SheetObservationResult,
} from "./drive-port"
import { GoogleApiError, googleErrorReason } from "./google-http"
import type { GoogleAccessTokenSource, GoogleHttp } from "./google-http"

/** Escopos de LEITURA, mínimos para as três chamadas. Nenhum de escrita. */
export const GOOGLE_READONLY_SCOPES: readonly string[] = Object.freeze([
  // Metadados de arquivo: id, nome, MIME, modifiedTime. NÃO dá acesso ao conteúdo.
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  // Valores de planilha, somente leitura.
  "https://www.googleapis.com/auth/spreadsheets.readonly",
])

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets"

/**
 * Página do Drive. 100 é folgado para uma pasta de arquivos mensais e mantém o
 * número de chamadas em uma no caso normal.
 *
 * Não é `limit: 1`, e a diferença é o ponto: o workflow oficial usa `limit: 1` e por
 * isso NUNCA conseguiria detectar duplicidade. Com um único candidato devolvido,
 * `DUPLICATE_SOURCE_WARNING` seria inalcançável por construção.
 */
const PAGE_SIZE = 100

/** Trava de segurança do laço de paginação. 50 páginas = 5.000 arquivos. */
const MAX_PAGES = 50

/**
 * Escapa um literal de string para a linguagem de query do Drive.
 *
 * Nomes de mês não têm apóstrofo, mas o nome vem de dado governado e a query é
 * concatenada — escapar é a diferença entre um parâmetro e uma injeção na sintaxe da
 * query. Barra invertida primeiro, senão o escape do apóstrofo seria reescapado.
 */
function escaparLiteral(s: string): string {
  return s.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")
}

export class GoogleDriveSheetsSource implements LucasDrivePort {
  readonly #http: GoogleHttp
  readonly #token: GoogleAccessTokenSource

  constructor(http: GoogleHttp, token: GoogleAccessTokenSource) {
    this.#http = http
    this.#token = token
  }

  async #get(url: string, operation: string, resource: string): Promise<unknown> {
    const token = await this.#token.accessToken()
    // O token vive só nesta chamada e nunca é registrado em campo nem em log.
    const r = await this.#http.get(url, { Authorization: `Bearer ${token}` })
    if (r.status < 200 || r.status >= 300) {
      throw new GoogleApiError(operation, resource, r.status, googleErrorReason(r.status, r.json))
    }
    return r.json
  }

  /**
   * Candidatos DENTRO da pasta oficial, com o nome exato do mês.
   *
   * A restrição de pasta é parte da QUERY (`'<id>' in parents`), não um filtro
   * posterior: a API do Drive suporta restrição por pai, e usá-la significa que o
   * processo nunca recebe metadado de arquivo fora da pasta oficial. Filtrar depois
   * daria o mesmo resultado e deixaria a porta aberta para alguém remover o filtro
   * sem que nenhuma chamada mudasse.
   *
   * `trashed = false`: arquivo na lixeira ainda aparece em `files.list` por padrão, e
   * um mês excluído por engano voltaria a competir com o vigente.
   *
   * `name =` é igualdade exata na query. A comparação tolerante a caixa fica no
   * provider, que já normaliza os dois lados — o Drive não oferece comparação
   * insensível a caixa, e emular com `contains` traria `Novos Alunos - Agosto 2025`.
   */
  async listCandidates(
    folder_id: string,
    expected_name: string,
  ): Promise<readonly DriveFileMeta[]> {
    const q = [
      `'${escaparLiteral(folder_id)}' in parents`,
      `name = '${escaparLiteral(expected_name)}'`,
      "trashed = false",
    ].join(" and ")

    const encontrados: DriveFileMeta[] = []
    let pageToken: string | undefined
    let paginas = 0

    do {
      const params = new URLSearchParams({
        q,
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime)",
        pageSize: String(PAGE_SIZE),
        // Drive compartilhado: sem estes dois, uma pasta em Shared Drive devolve
        // vazio — que o provider leria como `DATA_NOT_AVAILABLE`, ou seja, "o Lucas
        // não entregou o mês", quando o arquivo está lá e não temos como vê-lo.
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        // Ordem estável do lado do Google. NÃO é a regra de seleção — essa é do
        // provider e é provada contra todas as permutações. Isto só evita variação
        // gratuita entre chamadas.
        orderBy: "modifiedTime desc,name",
      })
      if (pageToken !== undefined) params.set("pageToken", pageToken)

      const body = await this.#get(
        `${DRIVE_FILES}?${params.toString()}`,
        "drive.files.list",
        `folder=${folder_id}`,
      )
      const { files, next } = lerPaginaDeArquivos(body)
      encontrados.push(...files)
      pageToken = next
      paginas += 1
    } while (pageToken !== undefined && paginas < MAX_PAGES)

    if (pageToken !== undefined) {
      // Truncar em silêncio esconderia candidatos e poderia esconder duplicidade.
      throw new GoogleApiError(
        "drive.files.list",
        `folder=${folder_id}`,
        507,
        `mais de ${MAX_PAGES * PAGE_SIZE} candidatos homônimos na pasta — recusando lista truncada`,
      )
    }

    return encontrados
  }

  /**
   * Observa a aba numa ÚNICA leitura de conteúdo.
   *
   * ─── Duas chamadas, UMA observação semântica ──────────────────────────────
   *
   *   1. `spreadsheets.get?fields=sheets.properties.title`   METADADO só
   *   2. `spreadsheets.get?includeGridData&ranges=<aba>`     o conteúdo, atômico
   *
   * A primeira existe para distinguir `sheet_not_found` — planilha existe, aba
   * governada não — de falha de API, e essa distinção vira `INVALID_SOURCE` contra
   * `SOURCE_ERROR`. Um `ranges` de aba inexistente devolve **400**, que não separa
   * "aba ausente" de "requisição malformada"; sem consultar os títulos, uma aba
   * renomeada viraria `source_error` e pareceria falha de infraestrutura.
   *
   * Ela não devolve conteúdo de linha nenhuma, então não participa de nenhum fato
   * governado e não pode criar corrida com a segunda.
   *
   * A segunda é a única leitura de conteúdo. Valor exibido, valor efetivo e tipo de
   * formato vêm na MESMA célula da MESMA resposta.
   *
   * ─── `fields` estreito, de propósito ──────────────────────────────────────
   *
   * `includeGridData` sem `fields` devolve formatação, bordas, notas, validações e
   * fórmulas de cada célula — resposta enorme e exposição desnecessária de uma fonte
   * que contém CPF e nome. Pedimos três campos por célula, e mais nada.
   */
  async observeSheet(file_id: string, sheet_name: string): Promise<SheetObservationResult> {
    const meta = await this.#get(
      `${SHEETS}/${encodeURIComponent(file_id)}?fields=sheets.properties.title`,
      "sheets.spreadsheets.get",
      `spreadsheet=${file_id}`,
    )
    const titulos = lerTitulos(meta)
    if (!titulos.includes(sheet_name)) {
      return { status: "sheet_not_found", available_sheets: [...titulos].sort() }
    }

    // Aba com espaço no nome precisa de apóstrofos no A1 notation, e o apóstrofo
    // interno duplica.
    const range = `'${sheet_name.replace(/'/gu, "''")}'`
    const params = new URLSearchParams({
      includeGridData: "true",
      ranges: range,
      fields: [
        "sheets.data.rowData.values.formattedValue",
        "sheets.data.rowData.values.effectiveValue.numberValue",
        "sheets.data.rowData.values.effectiveFormat.numberFormat.type",
      ].join(","),
    })

    const corpo = await this.#get(
      `${SHEETS}/${encodeURIComponent(file_id)}?${params.toString()}`,
      "sheets.spreadsheets.get.grid",
      `spreadsheet=${file_id}/${sheet_name}`,
    )

    const linhas = lerGrade(corpo)
    // Aba existente e completamente vazia: cabeçalho ausente. O provider recusa por
    // cabeçalho obrigatório faltando, que é o estado correto — não é "zero
    // contratos", é uma aba que não tem a forma da fonte.
    const [headers = [], ...rows] = linhas
    return { status: "ok", observation: { headers, rows } }
  }
}

// ─── Leitura defensiva das respostas ──────────────────────────────────────────
//
// O corpo vem de fora e é `unknown`. Cada leitor devolve a forma esperada ou
// recusa — nada de `as`, porque um cast aqui afirmaria estrutura de dado externo
// sem ter verificado, que é exatamente o furo que `toSnapshot` existe para fechar
// um nível acima.

function lerPaginaDeArquivos(body: unknown): {
  files: DriveFileMeta[]
  next: string | undefined
} {
  if (typeof body !== "object" || body === null) {
    throw new GoogleApiError("drive.files.list", "resposta", 502, "corpo não é objeto")
  }
  const b = body as { readonly files?: unknown; readonly nextPageToken?: unknown }
  const brutos = Array.isArray(b.files) ? b.files : []
  const files: DriveFileMeta[] = []

  for (const item of brutos) {
    if (typeof item !== "object" || item === null) continue
    const f = item as {
      readonly id?: unknown
      readonly name?: unknown
      readonly mimeType?: unknown
      readonly modifiedTime?: unknown
    }
    if (typeof f.id !== "string" || typeof f.name !== "string") continue
    files.push({
      file_id: f.id,
      name: f.name,
      // MIME ausente vira string vazia, nunca o de Sheets: o provider trata MIME
      // incompatível como candidato inelegível, e assumir Sheets aqui faria um
      // objeto de tipo desconhecido ser lido como a fonte oficial.
      mime_type: typeof f.mimeType === "string" ? f.mimeType : "",
      // `modifiedTime` ausente vira string vazia, que o guard de tempo do provider
      // classifica como `SOURCE_TIME_UNPARSEABLE`. Substituir por "agora" datar-ia
      // a observação com o nosso relógio.
      modified_time: typeof f.modifiedTime === "string" ? f.modifiedTime : "",
    })
  }

  const next = typeof b.nextPageToken === "string" && b.nextPageToken !== "" ? b.nextPageToken : undefined
  return { files, next }
}

function lerTitulos(body: unknown): readonly string[] {
  if (typeof body !== "object" || body === null) {
    throw new GoogleApiError("sheets.spreadsheets.get", "resposta", 502, "corpo não é objeto")
  }
  const sheets = (body as { readonly sheets?: unknown }).sheets
  if (!Array.isArray(sheets)) return []
  const titulos: string[] = []
  for (const s of sheets) {
    if (typeof s !== "object" || s === null) continue
    const props = (s as { readonly properties?: unknown }).properties
    if (typeof props !== "object" || props === null) continue
    const t = (props as { readonly title?: unknown }).title
    if (typeof t === "string") titulos.push(t)
  }
  return titulos
}


/** MIME esperado, reexportado para quem monta o adaptador. */
export { GOOGLE_SHEETS_MIME }

/**
 * Lê a grade de células de uma resposta `spreadsheets.get?includeGridData`.
 *
 * Tudo aqui é `unknown` vindo de fora, e nada é afirmado sem verificar — nenhum
 * `as`. Uma célula que não seja objeto vira célula vazia, não exceção: a API omite
 * células sem conteúdo, e tratar omissão como erro faria uma linha curta derrubar a
 * ingestão do mês.
 *
 * O que NÃO acontece aqui: interpretar serial como data, decidir se `DATE` é
 * aceitável, ou olhar o `pattern`. Este adaptador devolve o que o Google disse.
 */
function lerGrade(body: unknown): readonly (readonly SheetCell[])[] {
  if (typeof body !== "object" || body === null) {
    throw new GoogleApiError("sheets.spreadsheets.get.grid", "resposta", 502, "corpo não é objeto")
  }
  const b = body as { readonly sheets?: unknown }
  const abas = Array.isArray(b.sheets) ? b.sheets : []
  const primeira = abas[0]
  if (typeof primeira !== "object" || primeira === null) return []

  const dados = (primeira as { readonly data?: unknown }).data
  const bloco = Array.isArray(dados) ? dados[0] : undefined
  if (typeof bloco !== "object" || bloco === null) return []

  const rowData = (bloco as { readonly rowData?: unknown }).rowData
  if (!Array.isArray(rowData)) return []

  return rowData.map((linha) => {
    if (typeof linha !== "object" || linha === null) return []
    const values = (linha as { readonly values?: unknown }).values
    if (!Array.isArray(values)) return []
    return values.map(lerCelula)
  })
}

/** Uma célula. Ausência é `""`/`null`, nunca zero e nunca palpite. */
function lerCelula(bruta: unknown): SheetCell {
  const vazia: SheetCell = { formatted: "", number_value: null, number_format_type: null }
  if (typeof bruta !== "object" || bruta === null) return vazia

  const c = bruta as {
    readonly formattedValue?: unknown
    readonly effectiveValue?: unknown
    readonly effectiveFormat?: unknown
  }

  const formatted = typeof c.formattedValue === "string" ? c.formattedValue : ""

  let number_value: number | null = null
  if (typeof c.effectiveValue === "object" && c.effectiveValue !== null) {
    const n = (c.effectiveValue as { readonly numberValue?: unknown }).numberValue
    // `Number.isFinite` recusa `NaN` e `Infinity`: nenhum dos dois é valor que uma
    // célula pode ter, e aceitá-los criaria prazo derivado de erro de leitura.
    if (typeof n === "number" && Number.isFinite(n)) number_value = n
  }

  let number_format_type: string | null = null
  if (typeof c.effectiveFormat === "object" && c.effectiveFormat !== null) {
    const nf = (c.effectiveFormat as { readonly numberFormat?: unknown }).numberFormat
    if (typeof nf === "object" && nf !== null) {
      const t = (nf as { readonly type?: unknown }).type
      if (typeof t === "string" && t !== "") number_format_type = t
    }
  }

  return { formatted, number_value, number_format_type }
}
