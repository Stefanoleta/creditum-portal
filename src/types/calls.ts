export interface CallRecording {
  id: string
  arquivo: string
  sdr_name: string
  sdr_id: string
  phone: string
  school_name: string
  started_at: string
  duration_seconds: number
}

export type CallTom = "positivo" | "neutro" | "negativo"

// Legacy values kept for stored analyses; new prompt returns: converteu, nao_atendeu,
// sem_interesse, recontato, fora_politica
export type CallResultado =
  | "conversao"      // legacy
  | "agendamento"    // legacy
  | "callback"       // legacy
  | "sem_interesse"
  | "nao_atendeu"
  | "outros"         // legacy
  | "converteu"      // new
  | "recontato"      // new
  | "fora_politica"  // new

/**
 * data_source: audit field stored in Supabase
 *   "argus_real"     — audio downloaded + Whisper transcribed + Claude analyzed
 *   "metadata_only"  — (deprecated) Claude analyzed from metadata, no real audio
 *   "mock"           — demo/fallback data, not from a real call
 *   "pending"        — audio download failed; awaiting retry when Argus is available
 */
export type DataSource = "argus_real" | "metadata_only" | "mock" | "pending"

export type AnalysisStatus = "completed" | "pendente"

// ─── Rich coaching types (new prompt) ─────────────────────────────────────────

export interface ScoreBreakdown {
  abertura: number           // 0-25
  engajamento_lead: number   // 0-25
  tratamento_objecao: number // 0-25
  proposta_beneficio: number // 0-25
  tempo_resposta?: number    // 0-25: velocidade e qualidade de resposta do SDR (novo)
}

export interface MomentoCritico {
  tempo: string
  descricao: string
  alternativa: string
}

export interface AnaliseAbertura {
  avaliacao: "forte" | "media" | "fraca"
  descricao: string
  sugestao: string
}

export interface ObjecaoIdentificada {
  objecao: string
  como_foi_tratada: string
  sugestao_de_resposta: string
}

export interface SugestaoRecontato {
  vale_recontato: boolean
  motivo: string
  melhor_horario: string
  abertura_sugerida: string
}

// ─── Main analysis type ───────────────────────────────────────────────────────

export interface CallAnalysis {
  call_id: string
  sdr_name: string
  sdr_id: string
  phone: string
  school_name: string
  started_at: string
  duration_seconds: number
  transcript: string
  // Score: 0-100 (new scale — old stored values 0-10 will display as low scores)
  score: number
  resultado: CallResultado
  analisado_em: string
  source: "ai" | "mock"
  data_source: DataSource
  status?: AnalysisStatus
  pending_payload?: string

  // ── Legacy fields (required for backward compat; filled with defaults on new analyses) ──
  tom: CallTom
  tempo_resposta_inicial_segundos: number
  palavras_conversao: string[]
  palavras_perda: string[]
  objecoes: string[]
  como_tratou_objecoes: string
  pontos_positivos: string[]
  pontos_negativos: string[]

  // ── Rich coaching fields (new prompt; absent on legacy stored analyses) ────
  score_breakdown?: ScoreBreakdown
  resumo?: string
  momento_critico?: MomentoCritico | null
  analise_abertura?: AnaliseAbertura | null
  objecoes_identificadas?: ObjecaoIdentificada[]
  pontos_fortes?: string[]
  pontos_melhoria?: string[]
  sugestao_recontato?: SugestaoRecontato | null
  insight_gestor?: string
  tabulacao_ia?: TabulacaoIa | null
}

// ─── Tabulação IA ─────────────────────────────────────────────────────────────

export type TabulacaoIaCategoria =
  | "qualificado"
  | "ocupado_recontatar"
  | "interessado_sem_fechar"
  | "mae_familiar_atendeu"
  | "nao_reconhece_aguardar"
  | "objecao_financeira"
  | "objecao_prazo"
  | "nao_gostou_proposta"
  | "ja_resolveu"
  | "fora_politica"
  | "numero_invalido"
  | "recusa_definitiva"
  | "nao_atendeu_multiplas"

export interface TabulacaoIa {
  categoria:          TabulacaoIaCategoria
  confianca:          "alta" | "media" | "baixa"
  recontato_em_dias:  number | null
  justificativa:      string
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
