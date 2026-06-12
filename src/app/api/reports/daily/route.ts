import { NextResponse } from "next/server"
import { generateMockReports } from "@/lib/mock-reports"
import type { HojeData, HojeOntem, OperatorRow, HourlyRow, DailyRow } from "@/lib/mock-reports"
import { adaptSDRs, adaptTabulacoes, extractArray, getVendasAllowlist } from "@/lib/argus-adapter"
import type { ArgusDesempenhoItem, ArgusTabulacaoItem, ArgusLigacaoItem } from "@/types/argus"
import { supabase } from "@/lib/supabase-server"

const BASE_URL    = process.env.ARGUS_BASE_URL
const TOKEN       = process.env.ARGUS_TOKEN
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")

const MIN_ATENDIDAS_HORA = 10

// ─── helpers ──────────────────────────────────────────────────────────────────

function dateRange(date: Date) {
  const d = date.toISOString().split("T")[0]
  return { periodoInicial: `${d}T00:00:00`, periodoFinal: `${d}T23:59:00` }
}

function withCampaign(extra: Record<string, unknown>) {
  return { IdCampanha: CAMPAIGN_ID, ...extra }
}

function getDur(item: ArgusLigacaoItem): number {
  return item.tempoSegundos ?? item.duracao ?? item.tempoDuracao ?? item.tempoDecorrido ?? 0
}

async function argusPost<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Token-Signature": TOKEN!,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Argus ${endpoint} → HTTP ${res.status}: ${text.slice(0, 400)}`)
  }

  const json = await res.json() as Record<string, unknown>
  if (typeof json?.codStatus === "number" && json.codStatus < 0) {
    throw new Error(`Argus ${endpoint} → ${json.descStatus ?? "erro"}`)
  }

  return json as T
}

// ─── historical data from Argus ───────────────────────────────────────────────

const PT_DAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function getWorkingDays(count: number): Date[] {
  const days: Date[] = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() - 1) // começa em ontem
  while (days.length < count) {
    const dow = cursor.getDay()
    if (dow > 0 && dow < 6) days.unshift(new Date(cursor))
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}

async function fetchDayMetrics(day: Date): Promise<DailyRow> {
  const range   = withCampaign(dateRange(day))
  const dateStr = day.toISOString().split("T")[0]
  const dow  = PT_DAY[day.getDay()]
  const mm   = String(day.getMonth() + 1).padStart(2, "0")
  const dd   = String(day.getDate()).padStart(2, "0")
  const dia  = `${dow} ${dd}/${mm}`

  const zero: DailyRow = { date: dateStr, dia, ligacoes: 0, atendidas: 0, conversoes: 0, tma_segundos: 0, taxa_contato: 0, taxa_conversao: 0 }

  try {
    const [rawLig, rawTab] = await Promise.allSettled([
      argusPost("report/ligacoesdetalhadas",   range),
      argusPost("report/tabulacoesdetalhadas", range),
    ])

    const ligItems = rawLig.status === "fulfilled"
      ? extractArray<ArgusLigacaoItem>(rawLig.value as Record<string, unknown>, ["ligacoesDetalhadas", "itens", "data", "ligacoes"])
      : []
    const tabItems = rawTab.status === "fulfilled"
      ? extractArray<ArgusTabulacaoItem>(rawTab.value as Record<string, unknown>, ["itens", "data", "tabulacoes"])
      : []

    const atendItems    = ligItems.filter(i => (i.resultadoLigacao ?? "").toUpperCase() === "ATENDIMENTO")
    const ligacoes      = ligItems.length
    const atendidas     = atendItems.length
    const tma_soma      = atendItems.reduce((s, i) => s + getDur(i), 0)
    const tma_segundos  = atendidas > 0 ? Math.round(tma_soma / atendidas) : 0

    // Qualificações: contém "QUALIFICA" na tabulação ou categoria "SUCESSO"
    const conversoes = tabItems.filter(t =>
      (t.tabulado ?? t.tabulacao ?? "").toUpperCase().includes("QUALIFICA") ||
      (t.categoriaTabulacao ?? "").toUpperCase() === "SUCESSO"
    ).length

    return {
      date: dateStr,
      dia,
      ligacoes,
      atendidas,
      conversoes,
      tma_segundos,
      taxa_contato:   ligacoes  > 0 ? Math.round((atendidas  / ligacoes)  * 1000) / 10 : 0,
      taxa_conversao: atendidas > 0 ? Math.round((conversoes / atendidas) * 1000) / 10 : 0,
    }
  } catch {
    return zero
  }
}

async function buildHistorico(): Promise<DailyRow[]> {
  const days  = getWorkingDays(15)
  const rows: DailyRow[] = []
  // Lotes de 5 dias (10 chamadas simultâneas) para não sobrecarregar o Argus
  const BATCH = 5
  for (let i = 0; i < days.length; i += BATCH) {
    const lote = await Promise.all(days.slice(i, i + BATCH).map(fetchDayMetrics))
    rows.push(...lote)
  }
  return rows
}

// ─── intraday builder (real data from ligacoesdetalhadas) ─────────────────────

function buildIntradayFromLigacoes(items: ArgusLigacaoItem[]): HourlyRow[] {
  interface Bucket { ligacoes: number; atendidas: number; conversoes: number }
  const buckets = new Map<string, Bucket>()

  for (const item of items) {
    const raw = item.dataHoraLigacao ?? item.dataHora ?? item.horarioInicio ?? item.inicio
    if (!raw) continue
    const hour = parseInt(raw.substring(11, 13), 10)
    if (isNaN(hour)) continue
    const key = `${String(hour).padStart(2, "0")}h`

    if (!buckets.has(key)) buckets.set(key, { ligacoes: 0, atendidas: 0, conversoes: 0 })
    const b = buckets.get(key)!
    b.ligacoes++
    if ((item.resultadoLigacao ?? "").toUpperCase() === "ATENDIMENTO") b.atendidas++

    const tab = (item.tabulacao ?? "").toUpperCase()
    const cat = (item.categoriaTabulacao ?? "").toUpperCase()
    if (tab.startsWith("PROPOSTA ENVIADA") || cat === "SUCESSO") b.conversoes++
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hora, b]) => ({
      hora,
      ligacoes:       b.ligacoes,
      atendidas:      b.atendidas,
      conversoes:     b.conversoes,
      taxa_contato:   b.ligacoes  > 0 ? Math.round((b.atendidas  / b.ligacoes)  * 1000) / 10 : 0,
      taxa_conversao: b.atendidas > 0 ? Math.round((b.conversoes / b.atendidas) * 1000) / 10 : 0,
    }))
}

// ─── metrics builders ─────────────────────────────────────────────────────────

function buildHojeFromItems(
  ligacoesItems: ArgusLigacaoItem[],
  tabulacaoItems: ArgusTabulacaoItem[],
  tentativasOverride: number
): Omit<HojeData, "ontem" | "melhor_hora" | "pior_hora"> {
  const atendidas_items = ligacoesItems.filter(i =>
    (i.resultadoLigacao ?? "").toUpperCase() === "ATENDIMENTO"
  )

  const atendidas = atendidas_items.length || 0
  const tentativas = tentativasOverride || ligacoesItems.length

  const tma_soma = atendidas_items.reduce((s, i) => s + getDur(i), 0)
  const tma_segundos = atendidas > 0 ? Math.round(tma_soma / atendidas) : 0

  const ligacoes_curtas = atendidas_items.filter(i => getDur(i) < 30).length
  const ligacoes_curtas_pct = atendidas > 0
    ? Math.round((ligacoes_curtas / atendidas) * 1000) / 10 : 0

  const { total_conversoes: qualificacoes, occurrences } = adaptTabulacoes(tabulacaoItems)
  const totalTab = occurrences.reduce((s, o) => s + o.count, 0)
  const naoTabuladoItem = occurrences.find(o => {
    const u = o.label.toUpperCase()
    return u.includes("NÃO TABULADO") || u.includes("NAO TABULADO")
  })
  const pct_nao_tabulado = naoTabuladoItem && totalTab > 0
    ? Math.round((naoTabuladoItem.count / totalTab) * 1000) / 10 : 0

  const taxa_aproveitamento = tentativas > 0
    ? Math.round((atendidas / tentativas) * 1000) / 10 : 0
  const taxa_qualificacao = atendidas > 0
    ? Math.round((qualificacoes / atendidas) * 1000) / 10 : 0

  return {
    tentativas,
    atendidas,
    taxa_aproveitamento,
    qualificacoes,
    tma_segundos,
    taxa_qualificacao,
    pct_nao_tabulado,
    ligacoes_curtas,
    ligacoes_curtas_pct,
  }
}

function buildHourlyDestaques(
  ligacoesItems: ArgusLigacaoItem[],
  tabulacaoItems: ArgusTabulacaoItem[]
): { melhor_hora?: HojeData["melhor_hora"]; pior_hora?: HojeData["pior_hora"] } {
  const hourlyAtendidas = new Map<string, number>()
  const hourlyQualif    = new Map<string, number>()

  for (const item of ligacoesItems) {
    if ((item.resultadoLigacao ?? "").toUpperCase() !== "ATENDIMENTO") continue
    const ts = item.dataHoraLigacao ?? item.dataHora ?? item.horarioInicio ?? ""
    if (!ts) continue
    const hora = `${String(new Date(ts).getHours()).padStart(2, "0")}h`
    hourlyAtendidas.set(hora, (hourlyAtendidas.get(hora) ?? 0) + 1)
  }

  for (const tab of tabulacaoItems) {
    const u = (tab.tabulado ?? tab.tabulacao ?? "").toUpperCase()
    if (!u.includes("QUALIFICA")) continue
    const ts = tab.dataEvento ?? ""
    if (!ts) continue
    const hora = `${String(new Date(ts).getHours()).padStart(2, "0")}h`
    hourlyQualif.set(hora, (hourlyQualif.get(hora) ?? 0) + 1)
  }

  const validas = Array.from(hourlyAtendidas.entries())
    .filter(([, count]) => count >= MIN_ATENDIDAS_HORA)
    .map(([hora, atend]) => {
      const qual = hourlyQualif.get(hora) ?? 0
      return {
        hora,
        atendidas: atend,
        qualificacoes: qual,
        taxa_qualificacao: Math.round((qual / atend) * 1000) / 10,
      }
    })

  if (validas.length === 0) return {}

  const melhor_hora = validas.reduce((best, h) => h.taxa_qualificacao > best.taxa_qualificacao ? h : best)
  const restantes = validas.filter(h => h.hora !== melhor_hora.hora)
  const pior_hora = restantes.length > 0
    ? restantes.reduce((worst, h) => h.taxa_qualificacao < worst.taxa_qualificacao ? h : worst)
    : undefined

  return { melhor_hora, pior_hora }
}

// ─── per-operator helpers ─────────────────────────────────────────────────────

function buildQualifByOperator(items: ArgusTabulacaoItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    const op = (item.usuarioOperador ?? "").toUpperCase().trim()
    if (!op) continue
    const label = (item.tabulado ?? item.tabulacao ?? "").toUpperCase()
    if (label.includes("QUALIFICA")) {
      map.set(op, (map.get(op) ?? 0) + 1)
    }
  }
  return map
}


function findInOpMap(name: string, map: Map<string, number>): number {
  const upper = name.toUpperCase().trim()
  if (map.has(upper)) return map.get(upper)!
  const firstName = upper.split(" ")[0]
  if (firstName.length > 2) {
    for (const [key, val] of map) {
      if (key.includes(firstName)) return val
    }
  }
  return 0
}

function findScore(name: string, map: Map<string, number>): number | null {
  if (map.size === 0) return null
  const upper = name.toUpperCase().trim()
  if (map.has(upper)) return map.get(upper)!
  const firstName = upper.split(" ")[0]
  if (firstName.length > 2) {
    for (const [key, val] of map) {
      if (key.includes(firstName)) return val
    }
  }
  return null
}

// ─── GET /api/reports/daily ────────────────────────────────────────────────────

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(generateMockReports())
  }

  try {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const todayRange = withCampaign(dateRange(today))

    const [rawDesempenho, rawTabulacoes, rawLigacoes, historico] = await Promise.all([
      argusPost("report/desempenhoresumido",   todayRange),
      argusPost("report/tabulacoesdetalhadas", todayRange),
      argusPost("report/ligacoesdetalhadas",   todayRange),
      buildHistorico(),
    ])

    const vendasList = getVendasAllowlist(process.env.ARGUS_SDR_ALLOWLIST)

    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const tabulacaoItems = extractArray<ArgusTabulacaoItem>(rawTabulacoes, [
      "itens", "data", "tabulacoes",
    ])
    const ligacoesItems = extractArray<ArgusLigacaoItem>(rawLigacoes, [
      "ligacoesDetalhadas", "itens", "data", "ligacoes",
    ])

    const sdrs = adaptSDRs(desempenhoItems, vendasList)

    // Mirror cockpit logic: SDR discadas sum is reliable only when it exceeds atendidas.
    // ligacoesdetalhadas may include unanswered calls that desempenhoresumido doesn't expose
    // for the filtered vendas subset — so fall back to total ligacoes record count.
    const totalDiscadasFromSDR = sdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0)
    const totalAtendidasCount  = ligacoesItems.filter(i => (i.resultadoLigacao ?? "").toUpperCase() === "ATENDIMENTO").length
    const tentativas = totalDiscadasFromSDR > totalAtendidasCount
      ? totalDiscadasFromSDR
      : ligacoesItems.length

    const hojeBase = buildHojeFromItems(ligacoesItems, tabulacaoItems, tentativas)
    const { melhor_hora, pior_hora } = buildHourlyDestaques(ligacoesItems, tabulacaoItems)

    // ── Yesterday comparison ──────────────────────────────────────────────────
    let ontem: HojeOntem | undefined
    try {
      const ontemRange = withCampaign(dateRange(yesterday))
      const [rawOntemLig, rawOntemTab, rawOntemDesemp] = await Promise.all([
        argusPost("report/ligacoesdetalhadas",   ontemRange),
        argusPost("report/tabulacoesdetalhadas", ontemRange),
        argusPost("report/desempenhoresumido",   ontemRange),
      ])
      const ontemLigItems    = extractArray<ArgusLigacaoItem>(rawOntemLig, ["ligacoesDetalhadas", "itens", "data", "ligacoes"])
      const ontemTabItems    = extractArray<ArgusTabulacaoItem>(rawOntemTab, ["itens", "data", "tabulacoes"])
      const ontemDesempItems = extractArray<ArgusDesempenhoItem>(rawOntemDesemp, ["desempenhosResumidos", "itens", "data", "relatorio"])

      const ontemSdrs       = adaptSDRs(ontemDesempItems, vendasList)
      const ontemTentativas = ontemSdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0) || ontemLigItems.length
      const ontemAtendItems = ontemLigItems.filter(i => (i.resultadoLigacao ?? "").toUpperCase() === "ATENDIMENTO")
      const ontemAtendidas  = ontemAtendItems.length
      const { total_conversoes: ontemQualif } = adaptTabulacoes(ontemTabItems)
      const ontemTmaSoma    = ontemAtendItems.reduce((s, i) => s + getDur(i), 0)

      ontem = {
        tentativas:          ontemTentativas,
        atendidas:           ontemAtendidas,
        qualificacoes:       ontemQualif,
        taxa_aproveitamento: ontemTentativas > 0 ? Math.round((ontemAtendidas / ontemTentativas) * 1000) / 10 : 0,
        taxa_qualificacao:   ontemAtendidas  > 0 ? Math.round((ontemQualif / ontemAtendidas) * 1000) / 10 : 0,
        tma_segundos:        ontemAtendidas  > 0 ? Math.round(ontemTmaSoma / ontemAtendidas) : 0,
        dia: yesterday.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }),
      }
    } catch (err) {
      console.warn("[reports/daily] Sem dados de ontem:", err instanceof Error ? err.message : String(err))
    }

    const hoje: HojeData = { ...hojeBase, ontem, melhor_hora, pior_hora }
    const intraday = buildIntradayFromLigacoes(ligacoesItems)

    // ── Per-operator qualificações from tabulacoesdetalhadas ─────────────────
    const qualifByOp = buildQualifByOperator(tabulacaoItems)

    // ── Score IA from Supabase (silent failure) ──────────────────────────────
    const scoreByOp = new Map<string, number>()
    if (supabase) {
      try {
        const todayStr = today.toISOString().split("T")[0]
        const { data: analyses } = await supabase
          .from("call_analyses")
          .select("sdr_name, score")
          .gte("started_at", `${todayStr}T00:00:00`)
          .lte("started_at", `${todayStr}T23:59:59`)
          .neq("status", "pendente")
        const acc = new Map<string, { sum: number; count: number }>()
        for (const a of (analyses ?? [])) {
          const name = ((a as { sdr_name?: string }).sdr_name ?? "").toUpperCase().trim()
          const score = (a as { score?: number }).score
          if (!name || typeof score !== "number") continue
          if (!acc.has(name)) acc.set(name, { sum: 0, count: 0 })
          acc.get(name)!.sum += score
          acc.get(name)!.count++
        }
        for (const [name, { sum, count }] of acc) {
          scoreByOp.set(name, Math.round(sum / count))
        }
      } catch (err) {
        console.warn("[reports/daily] Score IA indisponível:", err instanceof Error ? err.message : String(err))
      }
    }

    // ── Operadores ────────────────────────────────────────────────────────────
    const operadores: OperatorRow[] = sdrs.map((s) => {
      const atendidas = s.ligacoes_atendidas
      const qualif = findInOpMap(s.name, qualifByOp)
      const score  = findScore(s.name, scoreByOp)
      return {
        id: s.id,
        name: s.name,
        meta_dia: s.meta_dia,
        ligacoes_atendidas: atendidas,
        conversoes: qualif,
        tma_segundos: s.tma_segundos,
        score_ia: score,
        taxa_conversao: atendidas > 0
          ? Math.round((qualif / atendidas) * 1000) / 10 : 0,
      }
    }).sort((a, b) => b.conversoes - a.conversoes)

    return NextResponse.json({
      hoje,
      intraday,
      por_hora: intraday,
      operadores,
      historico,
      source: "argus",
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn("[reports/daily] Argus indisponível:", reason)

    return NextResponse.json({
      ...generateMockReports(),
      intraday:  [],
      por_hora:  [],
      fallback_reason: reason,
    })
  }
}
