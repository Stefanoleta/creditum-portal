// Contrato de fonte de dados (§36).
//
// A planilha de hoje NÃO é a fonte oficial — a definitiva está em
// desenvolvimento (D3). Esse fato é o que torna este arquivo a peça central da
// arquitetura, e não uma abstração especulativa: o núcleo do sistema nunca pode
// conhecer o formato de nenhuma fonte específica.
//
// Regra de ouro do coletor (§22): ele NÃO interpreta.
// Nenhum adapter converte moeda, parseia data ou tira espaço. Todos entregam
// string crua. Toda conversão acontece na camada de parsing, que tem teste.
// Se um adapter "ajudasse", cada bug de conversão viraria invisível e
// não-testável, e cada fonte nova traria os seus próprios.

/** Papel de um recurso dentro de uma fonte. */
export type SourceRole =
  /** funil comercial — leads e oportunidades */
  | "pipeline"
  /** vendas de fato, com valores financeiros */
  | "sales"
  /**
   * Guardado para RECONCILIAÇÃO, nunca alimenta métrica.
   *
   * Existe por causa da aba de conversão que o time monta à mão: comparar o
   * número dela com o número calculado dá um verificador independente de graça.
   * Se divergirem, o auditor aponta em vez de escolher um lado.
   */
  | "reference_only"

export interface ConnectionResult {
  ok: boolean
  detail?: string
  /** momento em que a conexão foi testada */
  checkedAt: string
}

/**
 * Uma linha crua, exatamente como veio da fonte.
 *
 * `values` é `unknown` de propósito: a fonte manda o que quiser, e é a camada
 * de parsing — não o adapter — que decide o que aquilo significa.
 */
export interface RawSourceRecord {
  source: string
  tabKey: string
  tabRole: SourceRole

  /**
   * Identidade da OCORRÊNCIA.
   *
   * sha256(source | aba | localizador | conteúdo normalizado).
   *
   * O localizador é obrigatório. Sem ele, duas linhas DISTINTAS de conteúdo
   * idêntico colidem: a segunda não entra, e a duplicata da fonte — que é um
   * DATA_CONFLICT a reportar — vira invisível.
   */
  sourceRecordId: string

  /** Identidade da LINHA ao longo do tempo, para versionar mudanças. */
  rowKey: string

  /** Hash só do conteúdo. Detecta MUDANÇA, não identidade. */
  contentHash: string

  /** Pista para um humano achar a linha. Nunca identidade. */
  locator: Record<string, unknown>

  values: Record<string, unknown>
  collectedAt: string
}

export interface SourceBatch {
  source: string
  tabKey: string
  tabRole: SourceRole
  fetchedAt: string
  /** cabeçalhos como vieram, para diagnóstico de mapeamento */
  columns: string[]
  records: RawSourceRecord[]
  /** hash do lote inteiro — permite descartar sync sem mudança */
  contentHash: string
  /** cursor para a próxima coleta incremental, quando a fonte suportar */
  nextCursor?: string
}

/**
 * Resultado da normalização de um registro cru.
 *
 * Nunca lança exceção por dado ruim: dado ruim é informação, não acidente.
 * Problemas viram `issues`, e quem chama decide entre ingerir, pular ou abrir
 * conflito.
 */
export interface NormalizedRecord {
  sourceRecordId: string
  kind: "opportunity" | "sale" | "reference"
  /** campos já convertidos; `null` sempre que a fonte não permitiu concluir */
  fields: Record<string, unknown>
  issues: NormalizationIssue[]
}

export interface NormalizationIssue {
  code:
    | "BLANK_ROW"
    | "ORPHAN_MATERIAL"
    | "UNPARSEABLE_FIELD"
    | "UNKNOWN_SCHOOL"
    | "SCHOOL_SUGGESTION"
    | "UNASSIGNED_SELLER"
    | "MISSING_REQUIRED"
  field?: string
  detail: string
  /** quando a issue impede a ingestão do registro */
  blocking: boolean
}

export interface DataSourceAdapter {
  readonly sourceName: string

  testConnection(): Promise<ConnectionResult>

  /**
   * Busca mudanças desde `cursor`.
   *
   * Fontes que não suportam leitura incremental devolvem o snapshot completo —
   * a deduplicação por `sourceRecordId` torna isso idempotente.
   */
  fetchChanges(cursor?: string): Promise<SourceBatch[]>

  normalize(record: RawSourceRecord): Promise<NormalizedRecord>
}

/**
 * Mapeamento coluna-da-fonte → campo-do-domínio (§38).
 *
 * Vive em `ceo.source_mappings`, como DADO. Quando a fonte definitiva chegar
 * com outros cabeçalhos, cria-se uma versão nova da linha em vez de reescrever
 * o ingestor.
 */
export interface FieldMapping {
  [domainField: string]: string
}

export interface TabMapping {
  tabKey: string
  tabRole: SourceRole
  fields: FieldMapping
}
