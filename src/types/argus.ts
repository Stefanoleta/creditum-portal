// Raw response shapes from the Argus API.
// Field names verified against /report/* endpoints.
// If a field comes back undefined, check the raw response logged by the API route.

export interface ArgusDesempenhoItem {
  // Agent identity — actual Argus fields
  nomeUsuario?: string          // confirmed: desempenhoresumido response
  idUsuario?: number
  nomeAgente?: string           // legacy / alternative shape
  nome?: string
  ramal?: string
  ramalAgente?: string

  // Status string: "Em Ligação", "Disponível", "Pausa", "Offline", etc.
  statusAgente?: string
  status?: string

  // Call counts — actual Argus fields
  qtdeAtendimentoTotal?: number      // confirmed: total calls handled
  qtdeAtendimentoAutomatico?: number // confirmed: auto-dialer calls
  qtdeAtendimentoManual?: number     // confirmed: manual calls
  // legacy / alternative shapes
  qtdDiscadas?: number
  totalLigacoes?: number
  ligacoesRealizadas?: number
  qtdAtendidas?: number
  ligacoesAtendidas?: number
  totalAtendidas?: number

  // Timing in seconds — actual Argus fields
  tempoMedioAtendimento?: number     // confirmed: TMA
  tempoMedioEspera?: number          // confirmed: TME
  tma?: number
  tme?: number

  // Conversions (come from tabulacoesdetalhadas, not desempenhoresumido)
  conversoes?: number
  qtdConversoes?: number
}

export interface ArgusDesempenhoResponse {
  codStatus?: number
  descStatus?: string
  desempenhosResumidos?: ArgusDesempenhoItem[]  // confirmed array key
  itens?: ArgusDesempenhoItem[]
  data?: ArgusDesempenhoItem[]
  relatorio?: ArgusDesempenhoItem[]
  [key: string]: unknown
}

export interface ArgusLigacaoItem {
  nomeAgente?: string
  nome?: string
  agente?: string

  numero?: string
  telefone?: string
  numeroDiscado?: string

  // Duration in seconds
  duracao?: number
  tempoDuracao?: number
  tempoDecorrido?: number

  // Status: "Em Andamento", "Tocando", "Em Espera"
  status?: string
  statusLigacao?: string

  dataHora?: string
  horarioInicio?: string
  inicio?: string

  escola?: string
  campanha?: string
  fila?: string
}

export interface ArgusLigacoesResponse {
  codStatus?: number
  descStatus?: string
  ligacoesDetalhadas?: ArgusLigacaoItem[]  // confirmed array key
  itens?: ArgusLigacaoItem[]
  data?: ArgusLigacaoItem[]
  ligacoes?: ArgusLigacaoItem[]
  [key: string]: unknown
}

export interface ArgusTabulacaoItem {
  tabulacao?: string
  descricao?: string
  tipo?: string
  nome?: string

  quantidade?: number
  qtd?: number
  total?: number
}

export interface ArgusTabulacoesResponse {
  codStatus?: number
  descStatus?: string
  itens?: ArgusTabulacaoItem[]
  data?: ArgusTabulacaoItem[]
  tabulacoes?: ArgusTabulacaoItem[]
  [key: string]: unknown
}
