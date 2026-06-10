export interface CallRecording {
  id: string
  arquivo: string // filename/path used to download from Argus
  sdr_name: string
  sdr_id: string
  phone: string
  school_name: string
  started_at: string
  duration_seconds: number
}

export type CallTom = "positivo" | "neutro" | "negativo"
export type CallResultado =
  | "conversao"
  | "agendamento"
  | "callback"
  | "sem_interesse"
  | "nao_atendeu"
  | "outros"

/**
 * data_source: audit field stored in Supabase
 *   "argus_real"     — audio downloaded + Whisper transcribed + Claude analyzed
 *   "metadata_only"  — (deprecated) Claude analyzed from metadata, no real audio
 *   "mock"           — demo/fallback data, not from a real call
 *   "pending"        — audio download failed; awaiting retry when Argus is available
 */
export type DataSource = "argus_real" | "metadata_only" | "mock" | "pending"

export type AnalysisStatus = "completed" | "pendente"

export interface CallAnalysis {
  call_id: string
  sdr_name: string
  sdr_id: string
  phone: string
  school_name: string
  started_at: string
  duration_seconds: number
  transcript: string
  score: number
  tom: CallTom
  resultado: CallResultado
  tempo_resposta_inicial_segundos: number
  palavras_conversao: string[]
  palavras_perda: string[]
  objecoes: string[]
  como_tratou_objecoes: string
  pontos_positivos: string[]
  pontos_negativos: string[]
  analisado_em: string
  source: "ai" | "mock"           // legacy UI field — kept for backward compat
  data_source: DataSource         // authoritative audit field
  status?: AnalysisStatus         // undefined = "completed"
  pending_payload?: string        // JSON of original Argus webhook payload (for retry)
}

export interface SdrRanking {
  sdr_name: string
  score_medio: number
  total_analisadas: number
  conversoes: number
}

export interface DailyPatterns {
  data: string
  total_analisadas: number
  score_medio: number
  taxa_conversao: number
  top_palavras_conversao: string[]
  top_palavras_perda: string[]
  principal_objecao: string
  ranking_sdrs: SdrRanking[]
  distribuicao_resultados: Record<CallResultado, number>
}

export interface AnalysisListResponse {
  recordings: CallRecording[]
  source: "argus" | "mock"
}

export interface AnalyzeResponse {
  analysis: CallAnalysis
}
