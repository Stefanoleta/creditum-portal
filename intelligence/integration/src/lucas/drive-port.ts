/**
 * Fronteira Google Drive/Sheets. SOMENTE LEITURA.
 *
 * ─── Por que uma porta, e por que ela é estreita ───────────────────────────────
 *
 * Duas razões, e a segunda é a que importa mais:
 *
 * 1. Testabilidade. Nenhum teste desta fase toca a rede.
 * 2. **Capacidade.** A porta não tem método para criar, renomear, mover, excluir,
 *    compartilhar ou escrever. Não é que o provider evite chamar — é que não existe
 *    o que chamar. Uma porta somente-leitura por FORMA é mais forte que uma revisão
 *    de código dizendo "não escreva", porque a revisão vale até o próximo commit.
 *
 * Os detectores nunca importam este arquivo, e este arquivo nunca importa detector.
 * A cadeia é: Drive → captura canônica → normalização/snapshot → detector.
 *
 * ─── O que a porta NÃO decide ─────────────────────────────────────────────────
 *
 * Ela não escolhe arquivo entre candidatos, não valida MIME, não interpreta
 * cabeçalho e não classifica qualidade. Devolve o que o Drive disse, cru. Toda
 * decisão governada acontece acima dela, onde é testável sem rede.
 */

/** Metadado de um objeto do Drive, como a API o reporta. Nada normalizado. */
export interface DriveFileMeta {
  readonly file_id: string
  readonly name: string
  /** `application/vnd.google-apps.spreadsheet` para Sheets nativo. */
  readonly mime_type: string
  /** ISO-8601 UTC, como a API do Drive devolve em `modifiedTime`. */
  readonly modified_time: string
}

/**
 * Grade crua de uma aba: cabeçalho e linhas, na ordem em que a fonte as tem.
 *
 * `unknown` nas células é deliberado. A célula do Sheets pode chegar como número,
 * string ou vazio, e tipar como `string` aqui obrigaria a converter antes de
 * validar — que é o ponto em que `Number("R$ 410,00")` vira `NaN` e depois `0`.
 */
export interface SheetGrid {
  readonly headers: readonly unknown[]
  readonly rows: readonly (readonly unknown[])[]
}

/**
 * UMA célula, com as três faces que a fonte expõe na mesma resposta.
 *
 * ─── Por que as três, e não só a exibida ──────────────────────────────────────
 *
 * `formatted` é o que a planilha MOSTRA, e é contra ela que o contrato comercial
 * inteiro foi medido: `R$ 8.151,60`, `25%`, `087.731.554-03`. Nenhum parser legado
 * muda de fonte.
 *
 * `number_value` e `number_format_type` existem porque `Desembolso` é uma data real
 * exibida como `dd/mm`: o ano está no valor efetivo e NÃO está no texto. E o tipo é
 * o que separa uma data de um número qualquer — sem ele, `46260` digitado por
 * engano numa célula de contagem viraria `2026-08-26`, um prazo plausível e falso.
 *
 * `null` em `number_value` significa "a célula não tem valor numérico efetivo", e
 * `null` em `number_format_type` significa "a resposta não declarou tipo". Nenhum
 * dos dois é zero e nenhum é adivinhado.
 */
export interface SheetCell {
  /** `formattedValue`. `""` quando ausente — a fonte mostra vazio. */
  readonly formatted: string
  /** `effectiveValue.numberValue`, se numérico. */
  readonly number_value: number | null
  /** `effectiveFormat.numberFormat.type`: `DATE`, `NUMBER`, `CURRENCY`, … */
  readonly number_format_type: string | null
}

/**
 * Grade observada: cabeçalho e linhas de CÉLULAS, de uma única resposta.
 *
 * A garantia que o tipo carrega: toda célula desta estrutura veio do mesmo
 * `spreadsheets.get`. Duas células em linhas diferentes descrevem o mesmo estado da
 * planilha, e é isso que torna a associação linha↔prazo confiável.
 */
export interface SheetObservation {
  readonly headers: readonly SheetCell[]
  readonly rows: readonly (readonly SheetCell[])[]
}

export type SheetObservationResult =
  | { readonly status: "ok"; readonly observation: SheetObservation }
  | { readonly status: "sheet_not_found"; readonly available_sheets: readonly string[] }

/**
 * Projeção FORMATADA de uma observação, para os consumidores legados.
 *
 * Mesma forma de antes — `unknown[][]` de valores exibidos — derivada da MESMA
 * observação que carrega os valores tipados. Continua sendo a autoridade de
 * dinheiro, percentual, CPF e `Venc`; o que mudou é apenas de onde ela vem.
 */
export function formattedGrid(o: SheetObservation): SheetGrid {
  return {
    headers: o.headers.map((c) => c.formatted),
    rows: o.rows.map((r) => r.map((c) => c.formatted)),
  }
}

/**
 * Resultado da leitura de uma aba. Aba ausente é ESTADO, não exceção.
 *
 * A distinção existe porque as duas situações têm respostas governadas
 * diferentes: aba ausente é `INVALID_SOURCE` (a planilha existe mas não é a fonte
 * que o contrato descreve), e falha de API é `SOURCE_ERROR` (não sabemos o que a
 * fonte tem). Colapsar as duas num `throw` obrigaria a inspecionar mensagem de
 * erro para distinguir — e mensagem de erro não é contrato.
 */
export type SheetReadResult =
  | { readonly status: "ok"; readonly grid: SheetGrid }
  | { readonly status: "sheet_not_found"; readonly available_sheets: readonly string[] }

/**
 * Acesso de leitura ao Drive e ao Sheets.
 *
 * ERROS: qualquer falha de transporte, permissão, quota ou indisponibilidade deve
 * ser LANÇADA. O provider a converte em `SOURCE_ERROR`. O que uma implementação
 * desta porta nunca pode fazer é devolver lista vazia ou grade vazia para
 * disfarçar falha — seria indisponibilidade virando "não houve contrato".
 */
export interface LucasDrivePort {
  /**
   * Objetos dentro de `folder_id` cujo nome corresponde ao mês pedido.
   *
   * `folder_id` é obrigatório e a busca é RESTRITA a ele. Uma implementação que
   * caia para busca global no Drive viola o §6: existe mais de um lugar na conta
   * com arquivo chamado `Novos Alunos - Agosto`, e pegar o de outra pasta é ler a
   * fonte errada sem nenhum sinal de que isso aconteceu.
   *
   * A porta pode devolver candidatos com MIME incompatível — a validação é acima.
   * Devolver só os Sheets nativos esconderia o homônimo, e o homônimo é uma
   * condição de qualidade que precisa aparecer.
   */
  listCandidates(folder_id: string, expected_name: string): Promise<readonly DriveFileMeta[]>

  /**
   * Observa uma aba por NOME, numa ÚNICA resposta da API.
   *
   * ─── O defeito que a Fase 2.13a corrige ───────────────────────────────────
   *
   * A 2.13 lia a aba duas vezes: `readSheet` para os valores exibidos e
   * `readSheetUnderlying` para os subjacentes. O gate encontrou o furo, e ele é o
   * pior tipo — silencioso e sobre a pessoa errada:
   *
   *   leitura 1 (formatada) conclui
   *   alguém reordena a planilha
   *   leitura 2 (subjacente) conclui
   *   contagem de linhas coincide
   *   → o prazo de um contrato é anexado a OUTRO aluno
   *
   * Conferir o número de linhas não fecha isso: uma reordenação, ou uma inserção
   * compensada por uma remoção, preserva a contagem. O resultado seria alerta de
   * prazo perdido, ou auto-cancelamento, sobre o contrato errado.
   *
   * ─── Por que uma observação só ────────────────────────────────────────────
   *
   * `spreadsheets.get` com `includeGridData` devolve, na MESMA resposta e na MESMA
   * célula, o valor exibido, o valor efetivo e o tipo de formato. A associação
   * linha↔prazo passa a ser intrínseca ao dado, não uma junção que nós fazemos —
   * e a corrida deixa de ser expressável, não apenas de estar improvável.
   *
   * NÃO existe mais método que devolva metade da célula. É a mesma escolha da porta
   * somente-leitura: capacidade ausente vale mais que revisão de código.
   */
  observeSheet(file_id: string, sheet_name: string): Promise<SheetObservationResult>
}

/** MIME do Google Sheets nativo. A fonte oficial do Lucas é sempre este. */
export const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet"

/** Pasta oficial da fonte mensal do Lucas. Decisão governada da Fase 2.11. */
export const LUCAS_OFFICIAL_FOLDER_ID = "16e7ABSA6SQnBAkgMtSOFYhPK171For2v"

/** Aba oficial. Ler outra aba seria ler outra fonte. */
export const LUCAS_OFFICIAL_SHEET = "Status Contratos"

/** Dataset governado, fechado na Fase 2.10. */
export const LUCAS_DATASET_ID = "lucas_status_contratos_mensal"

/** `SourceSystem` do protocolo da Fase 1. A fonte é Sheets nativo. */
export const LUCAS_SOURCE_SYSTEM = "google_sheets" as const
