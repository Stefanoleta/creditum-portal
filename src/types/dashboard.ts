export type SDRStatus = "em_ligacao" | "disponivel" | "pausado" | "offline"

export interface SDR {
  id: string
  name: string
  avatar?: string
  status: SDRStatus
  extension: string
  meta_dia: number
  ligacoes_realizadas: number
  ligacoes_atendidas: number
  conversoes: number
  tma_segundos: number
  tme_segundos?: number                  // from desempenhoresumido.tempoMedioEspera
  score_ia?: number
  tempo_logado_segundos?: number         // tempoLogadoPermanenteSegundos
  tempo_atendimento_segundos?: number    // tempoAtendimentoSegundos
  pos_chamada_segundos?: number          // tempoPosChamadaSegundos
  pausa_segundos?: number                // tempoPausaSegundos
  taxa_ocupacao?: number                 // (atendimento + pos_chamada) / logado * 100
}

export interface LiveCall {
  id: string
  sdr_id: string
  sdr_name: string
  school_name: string
  phone: string
  started_at: string
  duration_seconds: number
  status: "em_andamento" | "tocando" | "em_espera"
}

export interface DashboardMetrics {
  tme_segundos: number
  tma_segundos: number
  taxa_contato: number
  taxa_conversao: number
  total_ligacoes: number
  total_contatos: number   // calls actually answered (lead said "alô")
  total_conversoes: number
  ligacoes_ativas: number
  sdrs_disponiveis: number
  sdrs_em_ligacao: number
  sdrs_offline: number
}

export interface Objection {
  label: string
  count: number
  percentage: number
}

export interface Occurrence {
  label: string
  count: number
  percentage: number
  color: string // Tailwind bg-* class
}

export interface HourlyMetric {
  hora: string
  ligacoes: number
  conversoes: number
  contatos: number
}

export interface DashboardData {
  metrics: DashboardMetrics
  sdrs: SDR[]
  live_calls: LiveCall[]
  top_objections: Objection[]
  occurrences: Occurrence[]
  hourly_chart: HourlyMetric[]
  hourly_source?: "from_calls" | "empty"  // "empty" = no timestamps found, all zeros
  last_updated: string
  tabulacoes_source?: "argus" | "mock"
}
