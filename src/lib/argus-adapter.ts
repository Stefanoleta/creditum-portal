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
    const status = parseStatus(pick(item.statusAgente, item.status))

    const realizadas = pickNum(item.qtdeAtendimentoTotal, item.qtdDiscadas, item.ligacoesRealizadas, item.totalLigacoes)
    const atendidas  = pickNum(item.qtdeAtendimentoAutomatico, item.qtdAtendidas, item.ligacoesAtendidas, item.totalAtendidas)
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

export function adaptLiveCalls(items: ArgusLigacaoItem[]): LiveCall[] {
  return items.map((item, idx) => {
    const sdrName   = pickStr(item.nomeAgente, item.nome, item.agente, "SDR")
    const phone     = maskPhone(pickStr(item.numero, item.telefone, item.numeroDiscado, ""))
    const durSec    = pickNum(item.duracao, item.tempoDuracao, item.tempoDecorrido)
    const statusRaw = pickStr(item.status, item.statusLigacao, "em_andamento")
    const school    = pickStr(item.escola, item.campanha, item.fila, "—")

    const startedAt = pick(item.dataHora, item.horarioInicio, item.inicio)
      ?? new Date(Date.now() - durSec * 1000).toISOString()

    const statusMap: Record<string, LiveCall["status"]> = {
      "em andamento": "em_andamento",
      "em_andamento": "em_andamento",
      "atendida":     "em_andamento",
      "tocando":      "tocando",
      "chamando":     "tocando",
      "em espera":    "em_espera",
      "em_espera":    "em_espera",
    }
    const status = statusMap[statusRaw.toLowerCase()] ?? "em_andamento"

    return {
      id: `${idx}-${sdrName}`,
      sdr_id: `${idx}`,
      sdr_name: sdrName,
      school_name: school,
      phone,
      started_at: startedAt,
      duration_seconds: durSec,
      status,
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
  total_conversoes: number
): DashboardMetrics {
  const active = sdrs.filter((s) => s.status !== "offline")
  const inCall = sdrs.filter((s) => s.status === "em_ligacao")
  const available = sdrs.filter((s) => s.status === "disponivel")
  const offline = sdrs.filter((s) => s.status === "offline")

  const totalLigacoes = sdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0)
  const totalAtendidas = sdrs.reduce((s, r) => s + r.ligacoes_atendidas, 0)

  const tmaValues = active.filter((s) => s.tma_segundos > 0).map((s) => s.tma_segundos)
  const tma = tmaValues.length ? Math.round(tmaValues.reduce((a, b) => a + b, 0) / tmaValues.length) : 0

  // TME: average duration of currently ringing calls as proxy
  const ringing = liveCalls.filter((c) => c.status === "tocando")
  const tme = ringing.length
    ? Math.round(ringing.reduce((s, c) => s + c.duration_seconds, 0) / ringing.length)
    : 0

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
