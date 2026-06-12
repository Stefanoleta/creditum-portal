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

  // Login/logout — "1899-12-30..." means still online (Argus null sentinel)
  dataHoraLogin?: string
  dataHoraLogout?: string       // confirmed: year 1899 = not yet logged out

  // Status string: "Em Ligação", "Disponível", "Pausa", "Offline", etc.
  statusAgente?: string
  status?: string

  // Call counts — actual Argus fields
  qtdeAtendimentoTotal?: number      // confirmed: calls Rafaella received from dialer
  qtdeAtendimentoAutomatico?: number // confirmed: auto-dialer connected calls
  qtdeAtendimentoManual?: number     // confirmed: manual calls
  // legacy / alternative shapes
  qtdDiscadas?: number
  totalLigacoes?: number
  ligacoesRealizadas?: number
  qtdAtendidas?: number
  ligacoesAtendidas?: number
  totalAtendidas?: number

  // Time in seconds
  tempoMedioAtendimento?: number          // confirmed: TMA
  tempoMedioEspera?: number              // confirmed: TME
  tempoLivreSegundos?: number            // confirmed: seconds currently free
  tempoAtendimentoSegundos?: number      // confirmed: total seconds in calls today
  tempoLogadoPermanenteSegundos?: number // confirmed: total logged-in time
  tempoPosChamadaSegundos?: number       // confirmed: post-call wrap (ACW)
  tempoPausaSegundos?: number            // confirmed: total pause time
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
  // Agent — confirmed Argus field names
  usuarioOperador?: string      // confirmed: agent name or "DISCADOR" for auto-dialer
  idUsuario?: number
  nomeAgente?: string           // legacy
  nome?: string
  agente?: string

  // Lead / contact
  nomeCliente?: string          // confirmed: lead name
  nrLead?: number               // confirmed: Argus internal lead ID
  idLigacao?: string | number   // confirmed: call ID (top-level for ligacoesdetalhadas)
  telefone?: string             // confirmed
  numero?: string
  numeroDiscado?: string

  // Call result — confirmed Argus field names
  resultadoLigacao?: string     // confirmed: "ATENDIMENTO", "NÃO ATENDE", "CAIXA POSTAL / MSG", etc.
  idStatusLigacao?: number      // confirmed: 1=atendimento, 2=?, 3=número inexistente, etc.
  tabulacao?: string            // confirmed: agent tabulation after call
  categoriaTabulacao?: string

  // Timing
  tempoSegundos?: number        // confirmed: call duration in seconds
  duracao?: number
  tempoDuracao?: number
  tempoDecorrido?: number

  // Timestamps
  dataHoraLigacao?: string      // confirmed: call datetime
  dataHora?: string
  horarioInicio?: string
  inicio?: string

  // Group — confirmed from ligacoesdetalhadas (1=Cobrança, 2=Vendas-Creditum)
  idGrupoUsuario?: number | string
  grupoOrigem?: string

  escola?: string
  campanha?: string
  fila?: string
  lote?: string                 // confirmed: campaign batch name
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

export interface ArgusLigacaoRelevante {
  idLigacao?: string | number   // confirmed: call ID
  tempoSegundos?: number
  telefone?: string
  callID?: string
  byeEnviado?: string           // confirmed: BYE sent flag/text
  byeRecebido?: string          // confirmed: BYE received flag/text
  sipResponse?: string          // fallback: some Argus versions return sipText instead of byeEnviado/byeRecebido
  sipText?: string              // fallback: "Atendimento: BYE enviado." → SDR encerrou; "BYE recebido" → lead desligou
}

export interface ArgusTabulacaoItem {
  // Confirmed Argus field names from tabulacoesdetalhadas
  tabulado?: string             // confirmed: tabulação text ("CLIENTE DESLIGOU", etc.)
  categoriaTabulacao?: string   // confirmed: high-level category ("SUCESSO", "AGENDAMENTO GRUPO", "RECUSA", "NÃO TABULADO")
  origemTabulacao?: string      // "DISCADOR" = auto-registered by Argus (SDR didn't tabulate in time); "OPERADOR" = manual
  usuarioOperador?: string      // confirmed: agent name
  idUsuario?: number            // confirmed: agent user ID
  nomeCliente?: string          // confirmed: lead name
  telefone?: string             // confirmed: lead phone
  dataEvento?: string           // confirmed: tabulação timestamp
  idTabulacao?: number
  ligacaoRelevante?: ArgusLigacaoRelevante  // confirmed: linked call details
  // legacy / alternative field names
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
