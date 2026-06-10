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

    // qtdeAtendimentoTotal = calls Rafaella received from the dialer and handled (= atendidas)
    const atendidas  = pickNum(item.qtdeAtendimentoTotal, item.qtdeAtendimentoAutomatico, item.qtdAtendidas, item.ligacoesAtendidas, item.totalAtendidas)
    const realizadas = atendidas
    const conversoes = pickNum(item.conversoes, item.qtdConversoes)
    const tma        = pickNum(item.tempoMedioAtendimento, item.tma)
    const tme        = pickNum(item.tempoMedioEspera, item.tme)

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
      tme_segundos: tme,
    } satisfies SDR
  })
}

// ─── ligacoesdetalhadas → LiveCall[] ────────────────────────────────────────
// ligacoesdetalhadas returns historical completed calls, not truly active ones.
// We keep only the last 30 min to avoid stale entries driving the CallTimer wild.

const LIVE_WINDOW_MS = 30 * 60 * 1000

export function adaptLiveCalls(items: ArgusLigacaoItem[]): LiveCall[] {
  const now = Date.now()
  const sdrCalls = items.filter((item) => {
    const op = (item.usuarioOperador ?? "").toUpperCase().trim()
    if (!op || op === "DISCADOR") return false
    const startStr = item.dataHoraLigacao ?? item.dataHora ?? item.horarioInicio ?? item.inicio
    if (!startStr) return true
    return (now - new Date(startStr).getTime()) <= LIVE_WINDOW_MS
  })

  // Dedup: keep only the most recent call per SDR name
  const latestBySdr = new Map<string, ArgusLigacaoItem>()
  for (const item of sdrCalls) {
    const sdrName = ((item.usuarioOperador ?? item.nomeAgente ?? item.nome ?? item.agente ?? "")).trim()
    const existing = latestBySdr.get(sdrName)
    if (!existing) {
      latestBySdr.set(sdrName, item)
    } else {
      const existingTime = new Date(existing.dataHoraLigacao ?? existing.dataHora ?? existing.horarioInicio ?? existing.inicio ?? 0).getTime()
      const currentTime  = new Date(item.dataHoraLigacao   ?? item.dataHora   ?? item.horarioInicio   ?? item.inicio   ?? 0).getTime()
      if (currentTime > existingTime) latestBySdr.set(sdrName, item)
    }
  }
  const dedupedCalls = Array.from(latestBySdr.values())

  return dedupedCalls.map((item, idx) => {
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
// Confirmed Argus field names: tabulado (tabulação text), categoriaTabulacao (category).
// Each record = 1 call; no `quantidade` field exists in this Argus configuration.

// Direct mapping from Argus categoriaTabulacao values to display labels + colors.
// Includes both accented and unaccented variants for Argus installations that strip diacritics.
const CATEGORIA_MAP: { key: string; label: string; color: string }[] = [
  { key: "SUCESSO",                  label: "Contrato Fechado",        color: "bg-emerald-500" },
  { key: "AGENDAMENTO GRUPO",        label: "Agendamento Grupo",        color: "bg-blue-500"    },
  { key: "AGENDAMENTO INDIVIDUAL",   label: "Agendamento Individual",   color: "bg-sky-400"     },
  { key: "AGENDAMENTO",              label: "Agendamento",              color: "bg-blue-400"    },
  { key: "QUALIFICAÇÃO",             label: "Qualificação",             color: "bg-indigo-500"  },
  { key: "QUALIFICACAO",             label: "Qualificação",             color: "bg-indigo-500"  },
  { key: "RETORNAR",                 label: "Retornar Ligação",         color: "bg-yellow-500"  },
  { key: "RETORNO",                  label: "Retornar Ligação",         color: "bg-yellow-500"  },
  { key: "CAIXA POSTAL",             label: "Caixa Postal",             color: "bg-gray-300"    },
  { key: "CLIENTE DESLIGOU",         label: "Cliente Desligou",         color: "bg-red-500"     },
  { key: "NÃO ATENDEU",              label: "Não Atendeu",              color: "bg-gray-400"    },
  { key: "NAO ATENDEU",              label: "Não Atendeu",              color: "bg-gray-400"    },
  { key: "SEM INTERESSE",            label: "Sem Interesse",            color: "bg-orange-500"  },
  { key: "RECUSA",                   label: "Recusa",                   color: "bg-orange-400"  },
  { key: "NÃO TABULADO",             label: "Não Tabulado",             color: "bg-gray-200"    },
  { key: "NAO TABULADO",             label: "Não Tabulado",             color: "bg-gray-200"    },
]

const EXTRA_COLORS = ["bg-purple-400", "bg-teal-500", "bg-cyan-500", "bg-pink-400", "bg-lime-500"]

export function adaptTabulacoes(items: ArgusTabulacaoItem[]): {
  objections: Objection[]
  occurrences: Occurrence[]
  total_conversoes: number
} {
  let total_conversoes = 0
  // Count by categoriaTabulacao for occurrences panel
  const categoriaCount = new Map<string, number>()
  // Count by tabulado text for objections panel
  const tabuladoCount  = new Map<string, number>()

  for (const item of items) {
    const categoria = pickStr(item.categoriaTabulacao, "NÃO TABULADO")
    // tabulado is the confirmed field name; fall back to legacy alternatives
    const tabulado  = pickStr(
      item.tabulado,
      (item as Record<string, unknown>).tabulacaoDesc as string | undefined,
      item.tabulacao,
      item.descricao,
      "Sem tabulação"
    )
    // Each record = 1 call (quantidade is null in this Argus config)
    const count = pickNum(item.quantidade, item.qtd, item.total) || 1

    categoriaCount.set(categoria, (categoriaCount.get(categoria) ?? 0) + count)
    if (tabulado && tabulado !== "Sem tabulação") {
      tabuladoCount.set(tabulado, (tabuladoCount.get(tabulado) ?? 0) + count)
    }

    if (categoria === "SUCESSO") total_conversoes += count
  }

  // Occurrences — all categories found in actual data; known ones use CATEGORIA_MAP labels/colors.
  // Unknown categories (campaign-specific) fall through with raw key as label.
  const occTotal = Array.from(categoriaCount.values()).reduce((a, b) => a + b, 0) || 1
  let extraColorIdx = 0
  const occurrences: Occurrence[] = Array.from(categoriaCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const mapped = CATEGORIA_MAP.find((m) => m.key === key.toUpperCase().trim())
      return {
        label: mapped?.label ?? key,
        count,
        percentage: Math.round((count / occTotal) * 100),
        color: mapped?.color ?? EXTRA_COLORS[extraColorIdx++ % EXTRA_COLORS.length],
      }
    })

  // Objections — top 5 tabulado texts
  const objTotal = Array.from(tabuladoCount.values()).reduce((a, b) => a + b, 0) || 1
  const objections: Objection[] = Array.from(tabuladoCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / objTotal) * 100),
    }))

  return { objections, occurrences, total_conversoes }
}

// ─── compose full metrics ────────────────────────────────────────────────────

export function buildMetrics(
  sdrs: SDR[],
  liveCalls: LiveCall[],
  total_conversoes: number,
  /** Total calls dialed by the system (all agents + auto-dialer), from ligacoesdetalhadas */
  totalDiscadasOverride?: number,
  /** Total calls answered (resultadoLigacao=ATENDIMENTO), from ligacoesdetalhadas filter */
  totalAtendidasOverride?: number
): DashboardMetrics {
  const active = sdrs.filter((s) => s.status !== "offline")
  const inCall = sdrs.filter((s) => s.status === "em_ligacao")
  const available = sdrs.filter((s) => s.status === "disponivel")
  const offline = sdrs.filter((s) => s.status === "offline")

  // Prefer totalAtendidasOverride (from ligacoesdetalhadas ATENDIMENTO filter) over SDR aggregate
  const totalAtendidas = totalAtendidasOverride ?? sdrs.reduce((s, r) => s + r.ligacoes_atendidas, 0)
  const totalLigacoes  = totalDiscadasOverride ?? totalAtendidas

  const tmaValues = active.filter((s) => s.tma_segundos > 0).map((s) => s.tma_segundos)
  const tma = tmaValues.length ? Math.round(tmaValues.reduce((a, b) => a + b, 0) / tmaValues.length) : 0

  // TME from desempenhoresumido.tempoMedioEspera (stored in SDR.tme_segundos)
  const tmeValues = active.filter((s) => s.tme_segundos && s.tme_segundos > 0).map((s) => s.tme_segundos!)
  const tme = tmeValues.length ? Math.round(tmeValues.reduce((a, b) => a + b, 0) / tmeValues.length) : 0

  // Taxa de contato = SDR atendimentos / total discadas (DISCADOR + SDR) from ligacoesdetalhadas
  const taxa_contato = totalDiscadasOverride && totalDiscadasOverride > 0
    ? (totalAtendidas / totalDiscadasOverride) * 100
    : 0
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
