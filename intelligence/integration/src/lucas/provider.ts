/**
 * `LucasMonthlyContractsProvider` — a fonte mensal oficial do Lucas, somente leitura.
 *
 * ─── Por que NÃO implementa `SourceAdapter` ───────────────────────────────────
 *
 * `integration/src/ports.ts` declara:
 *
 *   read(period_start: string, period_end: string): Promise<RawBatch>
 *
 * O tipo de retorno é `RawBatch` — sempre. Ele não tem ramo para "não existe
 * arquivo do mês", "a API falhou", "há dois arquivos", "a aba não existe" nem
 * "existe e está vazio". O próprio comentário daquele arquivo diz que essas
 * situações precisam ser distinguidas, e a única forma de expressá-las por ali é
 * `throw` — o que obrigaria o chamador a inspecionar mensagem de exceção para
 * decidir. Mensagem de exceção não é contrato.
 *
 * `RawBatch` também não tem onde guardar a seleção de arquivo entre candidatos, e
 * essa metadado é a prova de POR QUE lemos esta planilha e não a outra.
 *
 * Então, conforme §55: contrato canônico próprio, com os estados FECHADOS e
 * explícitos. Não é um segundo protocolo — é o mesmo protocolo da Fase 1 no que
 * importa (o `Snapshot` governado é reusado sem alteração, produzido por
 * `toSnapshot`); o que é novo é a CAPTURA, que precede o snapshot e existe
 * justamente nos casos em que snapshot nenhum deve existir.
 *
 * ─── Cinco estados, e o que cada um proíbe ────────────────────────────────────
 *
 *   `available`            arquivo, aba, schema e pelo menos uma linha
 *   `available_empty`      tudo válido, ZERO contratos — não é ausência de dado
 *   `data_not_available`   nenhum candidato no mês
 *   `invalid_source`       arquivo existe, mas não é a fonte que o contrato descreve
 *   `source_error`         não sabemos o que a fonte tem
 *
 * A distinção que mais importa é `available_empty` × `data_not_available`. As duas
 * produziriam "0" num relatório, e significam coisas opostas: a primeira é
 * "o Lucas não vendeu"; a segunda é "não sabemos se o Lucas vendeu". Só a primeira
 * pode virar zero num número executivo.
 *
 * E `source_error` nunca degrada para nenhuma das duas: erro de permissão virando
 * "zero contratos" é como um outage se transforma em queda de vendas no relatório.
 */

import { GatewayError } from "../../../gateway/src/errors"
import { deepFreeze } from "../../../gateway/src/immutability"
import { toSnapshot } from "../../../gateway/src/factory"
import type { Snapshot } from "../../../gateway/src/types"
import { structuralId } from "../../../detectors/src/structural-id"
import { buildUnitIndex } from "../../../detectors/src/canonical-units"
import type { UnitIndex, UnitNormalizerPort } from "../../../detectors/src/canonical-units"
import { GOVERNED_UNIT_CATALOG, toUnitCatalog } from "../../../detectors/src/unit-catalog"
import { ENGINE_UNIT_NORMALIZER } from "../../../detectors/src/unit-normalizer"
import { APPROVED_THRESHOLDS } from "../../../detectors/src/config"
import {
  LUCAS_DATASET_ID,
  LUCAS_OFFICIAL_FOLDER_ID,
  LUCAS_OFFICIAL_SHEET,
  LUCAS_SOURCE_SYSTEM,
} from "./drive-port"
import type { LucasDrivePort, SheetCell } from "./drive-port"
import { expectedFileName, monthNamePtBr, parsePeriod, periodBounds } from "./month-names"
import { selectMonthlyFile } from "./file-selection"
import type { FileSelection } from "./file-selection"
import { buildHeaderMap } from "./header-mapping"
import type { HeaderMap } from "./header-mapping"
import { normalizeRow } from "./rows"
import type { LucasContractRow } from "./rows"
import { sheetContentHash } from "./content-hash"
import { compareSourceInstant, instantFromDate } from "./source-time"
import { buildEvidenceSet } from "./evidence"
import type { LucasEvidenceSet } from "./evidence"
import type { RowQualityFact, SourceQualityFact } from "./source-quality"

/**
 * A computação que os agregados dos detectores sustentam.
 *
 * Nomeada e constante: `formula` entra na identidade da computação
 * (`computation_id`), então um texto variável faria a mesma computação ter
 * identidades diferentes entre execuções.
 */
export const FORMULA_AGREGADO =
  "contagem de contratos e soma de ticket por parcelamento, sobre a população estrutural do período"

/** Procedência da captura. Responde "de onde veio este número?". */
export interface LucasProvenance {
  readonly source_system: typeof LUCAS_SOURCE_SYSTEM
  readonly dataset_id: typeof LUCAS_DATASET_ID
  readonly folder_id: string
  readonly file_id: string
  readonly file_name: string
  readonly sheet_name: string
  readonly period: string
  /** `modifiedTime` do Drive. Metadado da fonte, fora do `content_hash`. */
  readonly source_modified_time: string
  /** Quando NÓS lemos. Fora do `content_hash` de propósito. */
  readonly collected_at: string
  readonly content_hash: string
}

/** Contagem por fato de qualidade. Chave ausente = zero ocorrências. */
export type RowQualityCounts = Readonly<Partial<Record<RowQualityFact, number>>>

export interface LucasCaptureBody {
  readonly period: string
  readonly provenance: LucasProvenance
  readonly selection: FileSelection
  readonly header_map: HeaderMap
  readonly rows: readonly LucasContractRow[]
  readonly row_count: number
  readonly source_quality: readonly SourceQualityFact[]
  readonly row_quality_counts: RowQualityCounts
  /** `Snapshot` governado da Fase 1, produzido por `toSnapshot`. Reuso, não cópia. */
  readonly snapshot: Snapshot
  /**
   * Evidência da captura, produzida PELO PIPELINE. Campo obrigatório.
   *
   * Estava fora antes, e quem montava a entrada dos detectores chamava
   * `buildEvidenceSet` por fora. Funcionava e provava pouco: nada impedia um
   * chamador — ou um teste — de fabricar `Evidence` que satisfizesse o schema sem
   * ter passado pela fonte. A prova de que "o mesmo pipeline que recebe a planilha
   * produz evidência aceita pelos detectores" precisa ser estrutural.
   *
   * Sendo obrigatório aqui, `toInstallmentInput` e `toLowTicketInput` leem a
   * evidência DA CAPTURA. Não existe assinatura que aceite outra.
   */
  readonly evidence: LucasEvidenceSet
}

/**
 * Resultado da captura. União FECHADA.
 *
 * Repare no que os ramos não-disponíveis NÃO têm: `rows`, `row_count`, `snapshot`.
 * Não existe onde escrever uma lista vazia fingindo disponibilidade.
 */
export type LucasCapture =
  | ({ readonly status: "available" } & LucasCaptureBody)
  | ({ readonly status: "available_empty" } & LucasCaptureBody)
  | {
      readonly status: "data_not_available"
      readonly period: string
      readonly expected_file_name: string
      readonly folder_id: string
      readonly detail: string
      /** Candidatos considerados e recusados, quando houve algum. */
      readonly candidates: readonly { readonly file_id: string; readonly name: string; readonly mime_type: string }[]
      readonly source_quality: readonly SourceQualityFact[]
    }
  | {
      readonly status: "invalid_source"
      readonly period: string
      readonly folder_id: string
      readonly file_id: string
      readonly file_name: string
      readonly reason: InvalidSourceReason
      readonly detail: string
    }
  | {
      readonly status: "source_error"
      readonly period: string
      readonly folder_id: string
      readonly detail: string
    }

/** Por que a planilha encontrada não é a fonte governada. Conjunto FECHADO. */
export type InvalidSourceReason =
  | "SHEET_NOT_FOUND"
  | "REQUIRED_HEADER_MISSING"
  | "DUPLICATED_HEADER_FIELD"
  | "SOURCE_TIME_INCONSISTENT"
  | "SOURCE_TIME_UNPARSEABLE"
  | "GOVERNED_CONTRACT_REJECTED"
  /**
   * Fase 2.13 — as duas leituras da mesma aba não alinharam.
   *
   * A leitura formatada e a subjacente pedem o MESMO range. Se voltarem com número
   * de linhas diferente, alguma coisa mudou entre as duas chamadas — edição
   * concorrente, ou resposta truncada. Anexar a data de uma linha ao contrato de
   * outra produziria prazo errado com aparência de prazo certo, e é a única falha
   * desta fase que geraria alerta sobre o aluno errado.
   */
  | "UNDERLYING_GRID_MISALIGNED"

export interface LucasProviderConfig {
  readonly drive: LucasDrivePort
  readonly folder_id?: string
  readonly sheet_name?: string
  /** Injetável para teste. Nunca entra no `content_hash`. */
  readonly now?: () => Date
  readonly unitIndex?: UnitIndex
  readonly normalizer?: UnitNormalizerPort
}

export interface LucasQuery {
  /** `AAAA-MM`. O mesmo domínio de período que `expected_units` governa. */
  readonly period: string
}

export class LucasMonthlyContractsProvider {
  readonly #drive: LucasDrivePort
  readonly #folderId: string
  readonly #sheetName: string
  readonly #now: () => Date
  readonly #unitIndex: UnitIndex
  readonly #normalizer: UnitNormalizerPort

  constructor(config: LucasProviderConfig) {
    this.#drive = config.drive
    this.#folderId = config.folder_id ?? LUCAS_OFFICIAL_FOLDER_ID
    this.#sheetName = config.sheet_name ?? LUCAS_OFFICIAL_SHEET
    this.#now = config.now ?? ((): Date => new Date())
    this.#normalizer = config.normalizer ?? ENGINE_UNIT_NORMALIZER
    this.#unitIndex =
      config.unitIndex ?? buildUnitIndex(toUnitCatalog(GOVERNED_UNIT_CATALOG), this.#normalizer)
  }

  /**
   * Carrega o período pedido. O período é EXPLÍCITO — nunca "o mês de hoje".
   *
   * Quem quer o mês corrente resolve o período antes de chamar, em
   * `America/Sao_Paulo` (ver `currentPeriod`). O provider não consulta relógio para
   * decidir o que ler: se consultasse, uma execução às 21:00 BRT do dia 31 leria o
   * mês seguinte, porque em UTC já virou.
   */
  async load(query: LucasQuery): Promise<LucasCapture> {
    const period = query.period
    const esperado = expectedFileName(period)
    const limites = periodBounds(period)

    if (esperado === null || limites === null) {
      // Período fora do domínio é defeito NOSSO, não ausência de dado do Lucas.
      // Devolver `data_not_available` aqui culparia a fonte por um bug daqui.
      return deepFreeze({
        status: "source_error" as const,
        period,
        folder_id: this.#folderId,
        detail: `período fora do domínio governado AAAA-MM: ${JSON.stringify(period)}`,
      })
    }

    let candidatos
    try {
      candidatos = await this.#drive.listCandidates(this.#folderId, esperado)
    } catch (e) {
      return deepFreeze({
        status: "source_error" as const,
        period,
        folder_id: this.#folderId,
        detail: `falha ao listar candidatos: ${mensagem(e)}`,
      })
    }

    const selecao = selectMonthlyFile(candidatos, esperado)

    if (selecao.outcome === "none") {
      const fatos: SourceQualityFact[] = []
      if (selecao.detail.incompatible_mime_present) fatos.push("CANDIDATE_WITH_INCOMPATIBLE_MIME")
      return deepFreeze({
        status: "data_not_available" as const,
        period,
        expected_file_name: esperado,
        folder_id: this.#folderId,
        detail:
          selecao.detail.candidate_count === 0
            ? "nenhum candidato na pasta oficial — ausência de arquivo NÃO significa zero contratos"
            : "candidatos encontrados, nenhum com MIME de Google Sheets nativo",
        candidates: selecao.detail.candidates.map((c) => ({
          file_id: c.file_id,
          name: c.name,
          mime_type: c.mime_type,
        })),
        source_quality: [...fatos].sort(),
      })
    }

    if (selecao.outcome === "time_unparseable") {
      // A regra governada não consegue dizer qual é o mais recente. Reportado com os
      // candidatos ofensores à vista, e nenhum vencedor escolhido.
      const quais = selecao.detail.offending
        .map((c) => `${c.file_id}=${JSON.stringify(c.modified_time)}`)
        .join(", ")
      return deepFreeze({
        status: "invalid_source" as const,
        period,
        folder_id: this.#folderId,
        file_id: selecao.detail.offending[0]?.file_id ?? "",
        file_name: esperado,
        reason: "SOURCE_TIME_UNPARSEABLE" as const,
        detail:
          `modifiedTime ilegível em candidato elegível — LATEST_MODIFIED indeterminado: ${quais}`,
      })
    }

    const sel = selecao.selection

    let leitura
    try {
      leitura = await this.#drive.observeSheet(sel.selected_file_id, this.#sheetName)
    } catch (e) {
      return deepFreeze({
        status: "source_error" as const,
        period,
        folder_id: this.#folderId,
        detail: `falha ao ler a aba: ${mensagem(e)}`,
      })
    }

    if (leitura.status === "sheet_not_found") {
      // NÃO cai para a primeira aba. A planilha existe, mas a fonte governada é
      // uma aba específica — outra aba é outro dado.
      return deepFreeze({
        status: "invalid_source" as const,
        period,
        folder_id: this.#folderId,
        file_id: sel.selected_file_id,
        file_name: sel.selected_file_name,
        reason: "SHEET_NOT_FOUND" as const,
        detail: `aba ${JSON.stringify(this.#sheetName)} ausente; presentes: ${leitura.available_sheets.join(", ")}`,
      })
    }

    // Cabeçalho na projeção formatada — é por texto que o mapeamento acontece.
    const headers = leitura.observation.headers.map((c) => c.formatted)
    const headerMap = buildHeaderMap(headers)

    if (headerMap.duplicated_fields.length > 0) {
      return deepFreeze({
        status: "invalid_source" as const,
        period,
        folder_id: this.#folderId,
        file_id: sel.selected_file_id,
        file_name: sel.selected_file_name,
        reason: "DUPLICATED_HEADER_FIELD" as const,
        detail: `campo declarado em mais de uma coluna: ${headerMap.duplicated_fields.join(", ")} — qual vale é decisão humana`,
      })
    }

    if (headerMap.required_missing.length > 0) {
      return deepFreeze({
        status: "invalid_source" as const,
        period,
        folder_id: this.#folderId,
        file_id: sel.selected_file_id,
        file_name: sel.selected_file_name,
        reason: "REQUIRED_HEADER_MISSING" as const,
        detail: `cabeçalho obrigatório ausente: ${headerMap.required_missing.join(", ")}`,
      })
    }

    // Linha inteiramente vazia não é contrato — é o rodapé em branco que toda
    // planilha tem. Não conta como linha ingerida nem como linha descartada.
    // ─── Uma observação, duas projeções (Fase 2.13a) ────────────────────────
    //
    // Não existe mais alinhamento a verificar: as duas representações saem da MESMA
    // célula da MESMA resposta. A associação linha↔prazo é intrínseca ao dado, e a
    // corrida que o gate encontrou deixou de ser expressável.
    //
    // A projeção formatada continua sendo a autoridade de dinheiro, percentual, CPF e
    // `Venc` — o que mudou é de onde ela vem, não o que ela contém.
    const celulas = leitura.observation.rows

    // Linha inteiramente vazia não é contrato — é o rodapé em branco que toda
    // planilha tem. Filtra sobre as CÉLULAS, então formatado e tipado saem juntos:
    // não há como o filtro reindexar um lado e não o outro.
    const dados = celulas.filter((linha) => linha.some((c) => c.formatted.trim() !== ""))

    // As linhas formatadas, para os parsers legados e para o `content_hash`.
    const dadosFormatados = dados.map((linha) => linha.map((c) => c.formatted))

    // A célula de prazo de cada linha, localizada por HEADER. `undefined` quando a
    // coluna não existe neste mês.
    const colunaPrazo = headerMap.index["desembolso"]
    const celulasDePrazo: readonly (SheetCell | undefined)[] = dados.map((linha) =>
      colunaPrazo === undefined ? undefined : linha[colunaPrazo],
    )

    const normalizadas = dadosFormatados.map((linha, i) =>
      normalizeRow(linha, celulasDePrazo[i], i + 1, {
        period,
        headerMap,
        unitIndex: this.#unitIndex,
        normalizer: this.#normalizer,
        similarityThresholdBp: APPROVED_THRESHOLDS.similarity_threshold_bp,
      }),
    )

    const fatosDeFonte: SourceQualityFact[] = []
    if (sel.duplicate) fatosDeFonte.push("DUPLICATE_SOURCE_WARNING")
    if (sel.incompatible_mime_present) fatosDeFonte.push("CANDIDATE_WITH_INCOMPATIBLE_MIME")
    if (headerMap.optional_missing.length > 0) fatosDeFonte.push("OPTIONAL_HEADER_MISSING")
    if (headerMap.unknown_headers.length > 0) fatosDeFonte.push("UNKNOWN_HEADER_PRESENT")

    const contagens: Partial<Record<RowQualityFact, number>> = {}
    for (const linha of normalizadas) {
      for (const f of linha.quality) contagens[f] = (contagens[f] ?? 0) + 1
    }

    const agora = this.#now().toISOString()
    // ─── O compromisso de conteúdo inclui o prazo (Fase 2.13a §14) ──────────
    //
    // O gate encontrou o terceiro furo: `content_hash` cobria só os valores
    // EXIBIDOS, e o prazo governado vem do valor efetivo. Duas planilhas mostrando
    // `26/08` com seriais de 2026 e 2027 produziam o MESMO hash, o mesmo
    // `snapshot_id` e as mesmas evidências — sustentando fatos incompatíveis.
    //
    // Agora o material canônico carrega, por linha, o valor numérico efetivo e o tipo
    // de formato da célula de prazo. Mudar o ano subjacente muda a identidade; mudar
    // o TIPO de `DATE` para `NUMBER` também, porque muda o que é avaliável.
    const contentHash = sheetContentHash(headers, dadosFormatados, celulasDePrazo)

    // ─── Tempo da fonte, comparado como INSTANTE ─────────────────────────────
    //
    // A invariante semântica da Fase 1 exige `observed_at <= ingested_at`.
    // `observed_at` é o `modifiedTime` do Drive, do relógio do Google — relógio de
    // terceiro pode estar adiantado, e sem guard `toSnapshot` lançaria e a exceção
    // ESCAPARIA de `load()`, furando a promessa de estados fechados.
    //
    // O instante vem PARSEADO da seleção, e a legibilidade já foi garantida lá: a
    // Fase 2.11c passou a parsear todo candidato elegível ANTES de comparar. Reparsear
    // aqui criaria uma segunda oportunidade de divergir da regra de seleção — que foi
    // exatamente o defeito que o gate encontrou, em que a seleção comparava string e
    // este guard comparava instante.
    // §24: os DOIS lados na mesma representação exata. `observed_at` vem da fonte com
    // até nanossegundo; `ingested_at` vem de um `Date`, com milissegundo. Truncar o da
    // fonte de volta para milissegundo faria `.1009` e `.1000` compararem iguais — a
    // perda que a Fase 2.11e corrige, reintroduzida pela porta de trás.
    const tSource = sel.selected_modified_instant
    const tCollect = instantFromDate(new Date(agora))
    if (tCollect === null) {
      // Inalcançável: `agora` vem do nosso próprio `toISOString()`.
      throw new GatewayError("SCHEMA_INVALID", "relógio de coleta ilegível", [agora])
    }
    if (compareSourceInstant(tSource, tCollect) > 0) {
      // Nenhum dos dois tempos é ajustado: corrigir o relógio ou tomar o maior
      // inventaria um instante. Os dois valores ficam à vista.
      return deepFreeze({
        status: "invalid_source" as const,
        period,
        folder_id: this.#folderId,
        file_id: sel.selected_file_id,
        file_name: sel.selected_file_name,
        reason: "SOURCE_TIME_INCONSISTENT" as const,
        detail:
          `modifiedTime da fonte (${sel.selected_modified_time}) é posterior ao momento da coleta ` +
          `(${agora}) — provável divergência de relógio; nenhum dos dois tempos foi ajustado`,
      })
    }

    const provenance: LucasProvenance = {
      source_system: LUCAS_SOURCE_SYSTEM,
      dataset_id: LUCAS_DATASET_ID,
      folder_id: this.#folderId,
      file_id: sel.selected_file_id,
      file_name: sel.selected_file_name,
      sheet_name: this.#sheetName,
      period,
      source_modified_time: sel.selected_modified_time,
      collected_at: agora,
      content_hash: contentHash,
    }

    // ─── O contrato de `load()` é FECHADO ────────────────────────────────────
    //
    // `toSnapshot` aplica schema e invariantes semânticas, e recusa lançando
    // `GatewayError`. Uma recusa dessas é uma afirmação sobre o DADO: "o que a fonte
    // entregou não satisfaz o contrato governado" — que é exatamente
    // `invalid_source`, não uma exceção a vazar.
    //
    // O `catch` é DELIBERADAMENTE estreito. Só `GatewayError` é convertido; qualquer
    // outra exceção é defeito nosso e continua propagando, porque engolir um
    // `TypeError` transformaria bug em "fonte inválida" e esconderia o bug atrás de
    // uma mensagem plausível sobre o Lucas.
    let snapshot: Snapshot
    try {
      snapshot = this.#buildSnapshot(provenance, limites, normalizadas, sel)
    } catch (e) {
      if (!(e instanceof GatewayError)) throw e
      return deepFreeze({
        status: "invalid_source" as const,
        period,
        folder_id: this.#folderId,
        file_id: sel.selected_file_id,
        file_name: sel.selected_file_name,
        reason: "GOVERNED_CONTRACT_REJECTED" as const,
        detail: `contrato governado recusou o snapshot: ${e.message}`,
      })
    }

    // Evidência produzida AQUI, no caminho de produção, a partir do snapshot e das
    // linhas reais. A fórmula nomeia a computação que os agregados dos detectores
    // sustentam; ela viaja na evidência `computed` e na procedência dela.
    const evidence = buildEvidenceSet(
      snapshot,
      normalizadas,
      sel.selected_file_id,
      this.#sheetName,
      FORMULA_AGREGADO,
    )

    const corpo: LucasCaptureBody = {
      period,
      provenance,
      selection: sel,
      header_map: headerMap,
      rows: normalizadas,
      row_count: normalizadas.length,
      source_quality: [...fatosDeFonte].sort(),
      row_quality_counts: contagens,
      snapshot,
      evidence,
    }

    return deepFreeze(
      normalizadas.length === 0
        ? { status: "available_empty" as const, ...corpo }
        : { status: "available" as const, ...corpo },
    )
  }

  /**
   * Monta o `Snapshot` governado da Fase 1 via `toSnapshot`.
   *
   * `toSnapshot` aplica o JSON Schema e as invariantes semânticas — não há cast
   * para `Snapshot` em nenhum ponto desta classe.
   *
   * ─── Por que o `payload` só tem `period_label` ─────────────────────────────
   *
   * O payload governado admite `sales_count`, `average_ticket_cents` e
   * `installments_histogram`. Nenhum deles é preenchido, e por dois motivos
   * diferentes:
   *
   * `sales_count` é o KPI oficial do Lucas, e a Fase 2.10 mediu que ele vale 19 em
   * julho e é ambíguo em agosto — `E` = 8 contra `status != C` = 20. Escrever UM
   * número aqui obrigaria a escolher a população, e essa escolha é do relatório
   * dele, não nossa.
   *
   * `installments_histogram` e `average_ticket_cents` são agregados sobre uma
   * população que o payload não tem como declarar: contando `C` ou não, contando
   * `P` ou não. Um agregado sem rótulo de população é exatamente o defeito que
   * `status-semantics.ts` existe para impedir, e o snapshot não tem campo para o
   * rótulo. Os detectores calculam os seus próprios agregados e cada um declara a
   * população que usou.
   *
   * O que sobra é o que o snapshot deve ser nesta fase: identidade de conteúdo,
   * procedência e contagem de registros. `record_count` é a contagem de LINHAS
   * ingeridas — não é uma métrica de negócio e não afirma população comercial.
   */
  #buildSnapshot(
    p: LucasProvenance,
    limites: { start: string; end: string },
    linhas: readonly LucasContractRow[],
    sel: FileSelection,
  ): Snapshot {
    // ─── Duplicidade NÃO é `Conflict` ─────────────────────────────────────────
    //
    // A primeira versão registrava duplicidade como `Conflict` com
    // `resolved: false`. Estava errado, e o custo era concreto: `low-ticket.ts` e
    // `first-due-date-concentration.ts` fazem
    //
    //   if (s.conflicts.length > 0) candidatas.push("conflicted")
    //
    // e `conflicted` é o PIOR estado do lattice — acima de `insufficient`. O
    // docstring de `quality.ts` diz o que ele significa: "duas fontes governadas
    // afirmam coisas diferentes… nenhuma agregação resolve isso sem decisão
    // humana".
    //
    // Não é o nosso caso. Existe decisão humana, ela está governada, tem nome
    // (`LATEST_MODIFIED_THEN_STABLE_FILE_ID`) e foi aplicada. O arquivo operacional
    // está escolhido. Marcar como conflito não resolvido faria todo Event derivado
    // de um mês com dois arquivos carregar a qualidade de um número em disputa —
    // quando o que houve foi uma regra funcionando.
    //
    // `Conflict` continua existindo e continua certo para conflito real: é o que
    // `cross-source-conflict.ts` usa quando duas fontes discordam de um valor.
    // Duplicidade de arquivo não cai nesse estado.

    // `rows_skipped` é 0 por construção: nenhuma linha de dado é descartada. Linha
    // ruim entra com fato de qualidade, e é isso que impede "não consegui ler"
    // de virar "não existia".
    // `now` injetado também na VALIDAÇÃO: `toSnapshot` usa `options.now ?? new Date()`
    // para checar `ingested_at` contra a tolerância de futuro. Sem passar o mesmo
    // relógio, o provider seria determinístico nos próprios timestamps e não na
    // validação deles — e um teste com relógio fixo passaria ou falharia segundo a
    // data real de execução.
    return toSnapshot(
      {
        snapshot_id: structuralId(
          "lucas/snapshot",
          { dataset: p.dataset_id, period: p.period, content_hash: p.content_hash },
          "snap",
        ),
        schema_version: "1.0.0",
        source_system: p.source_system,
        dataset_id: p.dataset_id,
        period_start: limites.start,
        period_end: limites.end,
        observed_at: p.source_modified_time,
        ingested_at: p.collected_at,
        content_hash: p.content_hash,
        record_count: linhas.length,
        rows_skipped: 0,
        coverage: { expected_units: 0, reporting_units: 0, ratio_bp: 0 },
        quality_status: qualidade(linhas, sel),
        conflicts: [],
        missing_fields: [],
        evidence_refs: [],
        payload: { period_label: rotuloGovernado(p.period) },
      },
      { now: new Date(p.collected_at) },
    )
  }
}

/**
 * `period_label` no formato FECHADO que o schema governado exige.
 *
 * O padrão é `^[a-zç]{3,12}/[0-9]{4}$` — `agosto/2026`, não `2026-08`. Descobri isso
 * porque o schema recusou o payload: é o contrato da Fase 1 fazendo o trabalho dele,
 * e o rótulo é gerado pela ingestão, nunca copiado da fonte.
 *
 * Reusa `monthNamePtBr`, então continua sem consultar locale do sistema.
 */
function rotuloGovernado(period: string): string {
  const parts = parsePeriod(period)
  if (parts === null) {
    throw new GatewayError("SCHEMA_INVALID", "período inválido chegou ao rótulo", [period])
  }
  const nome = monthNamePtBr(parts.month)
  if (nome === null) {
    throw new GatewayError("SCHEMA_INVALID", "mês inválido chegou ao rótulo", [period])
  }
  return `${nome.toLowerCase()}/${parts.year}`
}

/**
 * Qualidade da captura pela pior condição presente.
 *
 * Duplicidade é `degraded`, não `conflicted`. A distinção é a mesma da §13.1: o
 * arquivo operacional está DECIDIDO por regra governada, então o número não está em
 * disputa. O que resta é uma condição auditável — vale a pena alguém olhar por que
 * há dois arquivos do mesmo mês na pasta — e `degraded` é exatamente o estado
 * não-bloqueante que o lattice já tem para isso.
 *
 * Fato de linha também degrada. O lattice não foi alterado, e nenhum estado novo
 * foi criado: `degraded` já existia e significa o que precisamos.
 */
function qualidade(
  linhas: readonly LucasContractRow[],
  sel: FileSelection,
): "ok" | "degraded" | "conflicted" | "insufficient" {
  if (sel.duplicate) return "degraded"
  if (linhas.some((l) => l.quality.length > 0)) return "degraded"
  return "ok"
}

/** Mensagem de erro sem vazar objeto de exceção (que pode carregar credencial). */
function mensagem(e: unknown): string {
  if (e instanceof Error) return e.message
  return "erro não identificado"
}

/**
 * Período corrente em `America/Sao_Paulo`.
 *
 * Não vive dentro do provider de propósito — o provider é orientado por `period`
 * explícito. Esta função existe para o CHAMADOR que quer "o mês de agora", e o
 * fuso é obrigatório: às 21:00 do dia 31 de agosto em São Paulo, `new Date()` em
 * UTC já é 1º de setembro, e a ingestão leria o arquivo errado.
 *
 * `en-CA` produz `AAAA-MM-DD` de forma estável — é o formato ISO daquela locale,
 * não uma coincidência de implementação.
 */
export function currentPeriod(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return fmt.format(now).slice(0, 7)
}
