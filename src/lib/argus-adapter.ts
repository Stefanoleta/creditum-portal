import type {
  ArgusDesempenhoItem,
  ArgusLigacaoItem,
  ArgusTabulacaoItem,
} from "@/types/argus"
import type { SDR, SDRStatus, LiveCall, Objection, DashboardMetrics } from "@/types/dashboard"

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
    const name = pickStr(item.nomeAgente, item.nome, `SDR ${idx + 1}`)
    const ramal = pickStr(item.ramal, item.ramalAgente, `300${idx + 1}`)
    const status = parseStatus(pick(item.statusAgente, item.status))

    const realizadas = pickNum(item.qtdDiscadas, item.ligacoesRealizadas, item.totalLigacoes)
    const atendidas  = pickNum(item.qtdAtendidas, item.ligacoesAtendidas, item.totalAtendidas)
    const conversoes = pickNum(item.conversoes, item.qtdConversoes)
    const tma        = pickNum(item.tma, item.tempoMedioAtendimento)

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

// ─── tabulacoesdetalhadas → Objection[] + conversão total ──────────────────

// Labels que indicam conversão (venda/matrícula efetivada)
const CONVERSION_LABELS = [
  "venda", "conversao", "conversão", "matricula", "matrícula",
  "interesse", "fechamento", "acordo", "contrato",
]

function isConversion(label: string): boolean {
  const l = label.toLowerCase()
  return CONVERSION_LABELS.some((k) => l.includes(k))
}

export function adaptTabulacoes(items: ArgusTabulacaoItem[]): {
  objections: Objection[]
  total_conversoes: number
} {
  const totalAll = items.reduce(
    (s, i) => s + pickNum(i.quantidade, i.qtd, i.total), 0
  )

  let total_conversoes = 0
  const objectionItems: { label: string; count: number }[] = []

  for (const item of items) {
    const label = pickStr(item.tabulacao, item.descricao, item.tipo, item.nome, "Sem tabulação")
    const count = pickNum(item.quantidade, item.qtd, item.total)
    if (isConversion(label)) {
      total_conversoes += count
    } else {
      objectionItems.push({ label, count })
    }
  }

  const objectionTotal = objectionItems.reduce((s, i) => s + i.count, 0) || 1
  const objections: Objection[] = objectionItems
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((o) => ({
      label: o.label,
      count: o.count,
      percentage: Math.round((o.count / objectionTotal) * 100),
    }))

  return { objections, total_conversoes }
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
