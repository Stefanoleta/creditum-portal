/**
 * `LucasDrivePort` de teste. Nenhum teste desta fase toca a rede.
 *
 * ─── O que este duplo prova, além de conveniência ─────────────────────────────
 *
 * Ele permite exercitar exatamente os cenários que a rede não deixa reproduzir sob
 * demanda: pasta vazia, dois arquivos com o mesmo nome, `modifiedTime` idêntico,
 * MIME errado, aba ausente, e falha de API. São seis caminhos governados, e cinco
 * deles são impossíveis de testar contra o Drive real sem sujar a pasta oficial.
 *
 * ─── `escopoRespeitado` ───────────────────────────────────────────────────────
 *
 * O duplo registra qual `folder_id` recebeu. Um teste afirma que o provider sempre
 * passa a pasta oficial — porque a implementação real poderia esquecer o filtro e o
 * resultado seria idêntico em qualquer teste que só olhasse o retorno.
 */

import type {
  DriveFileMeta,
  LucasDrivePort,
  SheetCell,
  SheetGrid,
  SheetObservation,
  SheetObservationResult,
} from "../../src/lucas/drive-port"

export interface ArquivoFalso {
  readonly meta: DriveFileMeta
  /** Abas por nome. Aba ausente é a chave não existir. */
  readonly sheets: Readonly<Record<string, SheetGrid>>
  /**
   * Fase 2.13a — observação COMPLETA, com valor efetivo e tipo por célula.
   *
   * Quando presente, é ela que o duplo devolve. Quando ausente, o duplo sintetiza uma
   * observação a partir de `sheets`: toda célula fica só com o valor exibido, sem
   * valor numérico efetivo e sem tipo — que é o estado de uma célula de texto.
   *
   * A síntese existe para que os testes que não falam de prazo continuem escritos com
   * a grade formatada simples. Ela NÃO é um atalho para os testes de prazo: uma célula
   * sintetizada não tem tipo `DATE`, então nenhum prazo resolve por acidente.
   */
  readonly observations?: Readonly<Record<string, SheetObservation>>
}

export interface FakeDriveConfig {
  readonly files: readonly ArquivoFalso[]
  /** Quando definido, `listCandidates` lança — simula quota/permissão/outage. */
  readonly listThrows?: string
  readonly readThrows?: string

  /** Devolve os candidatos nesta ordem exata, para provar independência de ordem. */
  readonly preserveOrder?: boolean
}

export class FakeDrive implements LucasDrivePort {
  readonly #config: FakeDriveConfig
  /** Pastas consultadas, em ordem. Um teste afirma que só a oficial aparece. */
  readonly foldersConsultados: string[] = []
  readonly nomesConsultados: string[] = []
  readonly abasConsultadas: { file_id: string; sheet: string }[] = []


  constructor(config: FakeDriveConfig) {
    this.#config = config
  }

  listCandidates(folder_id: string, expected_name: string): Promise<readonly DriveFileMeta[]> {
    this.foldersConsultados.push(folder_id)
    this.nomesConsultados.push(expected_name)
    if (this.#config.listThrows !== undefined) {
      return Promise.reject(new Error(this.#config.listThrows))
    }
    // O duplo devolve TODOS os arquivos da pasta, inclusive MIME incompatível: o
    // filtro por nome e a validação de MIME são responsabilidade do código
    // governado, e um duplo que já filtrasse tornaria o teste vacuoso.
    const metas = this.#config.files.map((f) => f.meta)
    return Promise.resolve(this.#config.preserveOrder === true ? metas : [...metas].reverse())
  }

  /**
   * A ÚNICA leitura de conteúdo. Registrada para que um teste possa afirmar que o
   * provider observa a aba uma vez, e não duas.
   */
  observeSheet(file_id: string, sheet_name: string): Promise<SheetObservationResult> {
    this.abasConsultadas.push({ file_id, sheet: sheet_name })
    if (this.#config.readThrows !== undefined) {
      return Promise.reject(new Error(this.#config.readThrows))
    }
    const arquivo = this.#config.files.find((f) => f.meta.file_id === file_id)
    if (arquivo === undefined) {
      return Promise.reject(new Error(`arquivo inexistente no duplo: ${file_id}`))
    }

    const declarada = arquivo.observations?.[sheet_name]
    if (declarada !== undefined) {
      return Promise.resolve({ status: "ok", observation: declarada })
    }

    const grid = arquivo.sheets[sheet_name]
    if (grid === undefined) {
      return Promise.resolve({
        status: "sheet_not_found",
        available_sheets: Object.keys({ ...arquivo.sheets, ...(arquivo.observations ?? {}) }).sort(),
      })
    }
    return Promise.resolve({ status: "ok", observation: sintetizar(grid) })
  }

}

export const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function arquivo(
  file_id: string,
  name: string,
  modified_time: string,
  grid: SheetGrid,
  mime_type: string = SHEETS_MIME,
  sheetName = "Status Contratos",
): ArquivoFalso {
  return {
    meta: { file_id, name, mime_type, modified_time },
    sheets: { [sheetName]: grid },
  }
}


/**
 * Observação sintetizada de uma grade FORMATADA.
 *
 * Toda célula fica sem valor numérico efetivo e sem tipo — o estado de uma célula de
 * texto. Deliberado: um teste de prazo que use esta síntese NÃO consegue resolver
 * prazo, porque nenhuma célula é tipada como `DATE`. Quem testa prazo declara a
 * observação, e a declaração é a parte que importa.
 */
function sintetizar(grid: SheetGrid): SheetObservation {
  const texto = (v: unknown): SheetCell => ({
    formatted: v === null || v === undefined ? "" : String(v),
    number_value: null,
    number_format_type: null,
  })
  return {
    headers: grid.headers.map(texto),
    rows: grid.rows.map((r) => r.map(texto)),
  }
}
