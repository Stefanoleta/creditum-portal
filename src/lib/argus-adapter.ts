import type {
  ArgusDesempenhoItem,
  ArgusLigacaoItem,
  ArgusTabulacaoItem,
} from "@/types/argus"
import type { SDR, SDRStatus, LiveCall, Objection, Occurrence, DashboardMetrics } from "@/types/dashboard"

// ─── helpers ────────────────────────────────────────────────────────────────

function pick<T>(...candidates: (T | undefined)[]): T | undefined {
  return candidates.find((v) => v !== undefined && v !== null)
}

function pickStr(...candidates: (string | undefined)[]): string {
  return candidates.find((v) => typeof v === "string" && v.trim() !== "") ?? ""
}

function pickNum(...candidates: (number | undefined)[]): number {
  return candidates.find((v) => typeof v === "number" && !isNaN(v)) ?? 0
}

function parseStatus(raw: string | undefined): SDRStatus {
  const s = (raw ?? "").toLowerCase()
  if (s.includes("ligaç") || s.includes("ligac") || s.includes("chamada") || s === "falando") return "em_ligacao"
  if (s.includes("dispon") || s === "livre" || s === "logado") return "disponivel"
  if (s.includes("pausa") || s.includes("break") || s === "ausente") return "pausado"
  return "offline"
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}****-${digits.slice(-4)}`
  }
  return phone.replace(/\d(?=\d{4})/g, "*")
}

// ─── desempenhoresumido → SDR[] ─────────────────────────────────────────────

export function adaptSDRs(items: ArgusDesempenhoItem[]): SDR[] {
  return items.map((item, idx) => {
    const name = pickStr(item.nomeUsuario, item.nomeAgente, item.nome, `SDR ${idx + 1}`)
    const ramal = pickStr(item.ramal, item.ramalAgente, `300${idx + 1}`)

    // dataHoraLogout = "1899-12-30..." is Argus's sentinel for "not yet logged out"
    const logoutStr = item.dataHoraLogout ?? ""
    const isLoggedIn = !logoutStr || new Date(logoutStr).getFullYear() < 1900
    // desempenhoresumido is a day-summary, not real-time — can't distinguish em_ligacao vs disponivel
    const status: SDRStatus = isLoggedIn ? "disponivel" : "offline"

    // qtdeAtendimentoTotal = calls answered by this SDR (i.e., atendidas, not total dialed)
    // true realizadas (total dialed) comes from ligacoesdetalhadas; use atendimentos here for SDR-level stats
    const atendidas  = pickNum(item.qtdeAtendimentoTotal, item.qtdeAtendimentoAutomatico, item.qtdAtendidas, item.ligacoesAtendidas, item.totalAtendidas)
    const realizadas = atendidas  // overridden at route level with real discadas count
    const conversoes = pickNum(item.conversoes, item.qtdConversoes)
    const tma        = pickNum(item.tempoMedioAtendimento, item.tma)

    return {
      id: `${ramal}-${name}`,
      name,
      status,
      extension: ramal,
      meta_dia: 50,
      ligacoes_realizadas: realizadas,
      ligacoes_atendidas: atendidas,
      conversoes,
      tma_segundos: tma,
    } satisfies SDR
  })
}

// ─── ligacoesdetalhadas → LiveCall[] ────────────────────────────────────────
// ligacoesdetalhadas returns historical completed calls, not truly active ones.
// Filter to human SDR calls only (exclude DISCADOR = auto-dialer) and show as
// "recent calls" — the closest proxy for live activity the Argus API provides.

export function adaptLiveCalls(items: ArgusLigacaoItem[]): LiveCall[] {
  const sdrCalls = items.filter((item) => {
    const op = (item.usuarioOperador ?? "").toUpperCase().trim()
    return op && op !== "DISCADOR"
  })

  return sdrCalls.map((item, idx) => {
    // usuarioOperador is the confirmed field name for the agent
    const sdrName = pickStr(item.usuarioOperador, item.nomeAgente, item.nome, item.agente, "SDR")
    const phone   = maskPhone(pickStr(item.telefone, item.numero, item.numeroDiscado, ""))
    const durSec  = pickNum(item.tempoSegundos, item.duracao, item.tempoDuracao, item.tempoDecorrido)
    // nomeCliente = lead name; lote = campaign batch
    const school  = pickStr(item.nomeCliente, item.escola, item.campanha, item.lote, item.fila, "—")

    const startedAt = pickStr(item.dataHoraLigacao, item.dataHora, item.horarioInicio, item.inicio)
      || new Date(Date.now() - durSec * 1000).toISOString()

    // All calls in ligacoesdetalhadas are completed — mark as em_andamento for UI display
    return {
      id: `${item.idStatusLigacao ?? idx}-${sdrName}-${idx}`,
      sdr_id: String(item.idUsuario ?? idx),
      sdr_name: sdrName,
      school_name: school,
      phone,
      started_at: startedAt,
      duration_seconds: durSec,
      status: "em_andamento" as LiveCall["status"],
    } satisfies LiveCall
  })
}

// ─── tabulacoesdetalhadas → Objection[] + Occurrence[] + conversão total ────

// The 8 predefined occurrence categories with keyword matchers and colors.
// Matched against tabulacaoDesc (or tabulacao/descricao) from the Argus response.
const OCCURRENCE_CATEGORIES: {
  label: string
  color: string
  keywords: string[]
}[] = [
  { label: "Contrato Fechado",       color: "bg-emerald-500", keywords: ["contrato", "fechado", "venda", "matric", "acordo"] },
  { label: "Qualificação",           color: "bg-blue-500",    keywords: ["qualif"] },
  { label: "Agendamento Confirmado", color: "bg-sky-400",     keywords: ["agend"] },
  { label: "Cliente Desligou",       color: "bg-red-500",     keywords: ["desligou", "desconect", "ocupado", "congestion"] },
  { label: "Não Atendeu",            color: "bg-gray-400",    keywords: ["nao atendeu", "não atendeu", "no answer", "nao atende", "não atende", "nao aten"] },
  { label: "Caixa Postal",           color: "bg-gray-300",    keywords: ["caixa postal", "voicemail", "correio de voz", "caixa"] },
  { label: "Retornar Ligação",       color: "bg-yellow-500",  keywords: ["retornar", "callback", "ligar depois", "retorno", "religar"] },
  { label: "Sem Interesse",          color: "bg-orange-500",  keywords: ["sem interesse", "nao quer", "não quer", "nao tem interesse"] },
]

function matchOccurrenceCategory(label: string): typeof OCCURRENCE_CATEGORIES[number] | null {
  const l = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  for (const cat of OCCURRENCE_CATEGORIES) {
    if (cat.keywords.some((k) => l.includes(k.normalize("NFD").replace(/[̀-ͯ]/g, "")))) {
      return cat
    }
  }
  return null
}

export function adaptTabulacoes(items: ArgusTabulacaoItem[]): {
  objections: Objection[]
  occurrences: Occurrence[]
  total_conversoes: number
} {
  let total_conversoes = 0
  const objectionItems: { label: string; count: number }[] = []
  // Accumulate counts per predefined occurrence category
  const occurrenceMap = new Map<string, number>(
    OCCURRENCE_CATEGORIES.map((c) => [c.label, 0])
  )

  for (const item of items) {
    // tabulacaoDesc is the primary field name used by the Argus API
    const label = pickStr(
      (item as Record<string, unknown>).tabulacaoDesc as string,
      item.tabulacao,
      item.descricao,
      item.tipo,
      item.nome,
      "Sem tabulação"
    )
    const count = pickNum(item.quantidade, item.qtd, item.total)

    const cat = matchOccurrenceCategory(label)
    if (cat) {
      if (cat.label === "Contrato Fechado") total_conversoes += count
      occurrenceMap.set(cat.label, (occurrenceMap.get(cat.label) ?? 0) + count)
    } else {
      // Unmatched tabulações fall into the objections list
      objectionItems.push({ label, count })
    }
  }

  // Build Objection[]
  const objectionTotal = objectionItems.reduce((s, i) => s + i.count, 0) || 1
  const objections: Objection[] = objectionItems
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((o) => ({
      label: o.label,
      count: o.count,
      percentage: Math.round((o.count / objectionTotal) * 100),
    }))

  // Build Occurrence[] — show all 8 categories, sort by count desc
  const occurrenceTotal = Array.from(occurrenceMap.values()).reduce((a, b) => a + b, 0) || 1
  const occurrences: Occurrence[] = OCCURRENCE_CATEGORIES.map((cat) => {
    const count = occurrenceMap.get(cat.label) ?? 0
    return {
      label: cat.label,
      count,
      percentage: Math.round((count / occurrenceTotal) * 100),
      color: cat.color,
    }
  }).sort((a, b) => b.count - a.count)

  return { objections, occurrences, total_conversoes }
}

// ─── compose full metrics ────────────────────────────────────────────────────

export function buildMetrics(
  sdrs: SDR[],
  liveCalls: LiveCall[],
  total_conversoes: number,
  /** Total calls dialed by the system (all agents + auto-dialer), from ligacoesdetalhadas */
  totalDiscadasOverride?: number
): DashboardMetrics {
  const active = sdrs.filter((s) => s.status !== "offline")
  const inCall = sdrs.filter((s) => s.status === "em_ligacao")
  const available = sdrs.filter((s) => s.status === "disponivel")
  const offline = sdrs.filter((s) => s.status === "offline")

  // totalDiscadasOverride = all calls dialed (DISCADOR + SDR) from ligacoesdetalhadas
  // Falls back to summing SDR-level realizadas if not provided (less accurate)
  const totalLigacoes = totalDiscadasOverride ?? sdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0)
  const totalAtendidas = sdrs.reduce((s, r) => s + r.ligacoes_atendidas, 0)

  const tmaValues = active.filter((s) => s.tma_segundos > 0).map((s) => s.tma_segundos)
  const tma = tmaValues.length ? Math.round(tmaValues.reduce((a, b) => a + b, 0) / tmaValues.length) : 0

  const tme = 0  // ligacoesdetalhadas has no live ringing calls; TME not available from this API

  const taxa_contato = totalLigacoes > 0 ? (totalAtendidas / totalLigacoes) * 100 : 0
  const taxa_conversao = totalAtendidas > 0 ? (total_conversoes / totalAtendidas) * 100 : 0

  return {
    tme_segundos: tme,
    tma_segundos: tma,
    taxa_contato: Math.round(taxa_contato * 10) / 10,
    taxa_conversao: Math.round(taxa_conversao * 10) / 10,
    total_ligacoes: totalLigacoes,
    total_conversoes,
    ligacoes_ativas: liveCalls.length,
    sdrs_disponiveis: available.length,
    sdrs_em_ligacao: inCall.length,
    sdrs_offline: offline.length,
  }
}

// ─── extract array from any Argus response shape ────────────────────────────

export function extractArray<T>(raw: Record<string, unknown>, keys: string[]): T[] {
  // Some responses return the array directly at root
  if (Array.isArray(raw)) return raw as T[]

  for (const key of keys) {
    const val = raw[key]
    if (Array.isArray(val) && val.length > 0) return val as T[]
  }

  // Last resort: find any array value in the response
  for (const val of Object.values(raw)) {
    if (Array.isArray(val)) return val as T[]
  }

  return []
}
