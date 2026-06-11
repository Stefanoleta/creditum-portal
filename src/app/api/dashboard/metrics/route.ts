import { NextResponse, after } from "next/server"
import {
  adaptSDRs,
  adaptLiveCalls,
  adaptTabulacoes,
  buildMetrics,
  extractArray,
  getVendasAllowlist,
} from "@/lib/argus-adapter"
import { generateMockDashboard } from "@/lib/mock-data"
import { supabase, saveAnalysis } from "@/lib/supabase-server"
import { maskPhone } from "@/lib/call-analyzer"
import type {
  ArgusDesempenhoItem,
  ArgusLigacaoItem,
  ArgusTabulacaoItem,
} from "@/types/argus"
import type { HourlyMetric, Objection, Occurrence } from "@/types/dashboard"
import type { CallAnalysis } from "@/types/calls"

const BASE_URL    = process.env.ARGUS_BASE_URL!
const TOKEN       = process.env.ARGUS_TOKEN!
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")
const VENDAS_LIST = getVendasAllowlist(process.env.ARGUS_SDR_ALLOWLIST)

async function argusPost<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Token-Signature": TOKEN,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Argus ${endpoint} → HTTP ${res.status}: ${body.slice(0, 400)}`)
  }

  const json = await res.json()

  if (json?.codStatus < 0) {
    throw new Error(`Argus ${endpoint} → ${json.descStatus ?? "erro desconhecido"}`)
  }

  return json as T
}

// tabulacoesdetalhadas requires idCampanha — degrade gracefully if unavailable.
async function fetchTabulacoes(campaignId: number): Promise<{
  objections: Objection[]
  occurrences: Occurrence[]
  total_conversoes: number
  tabulacoes_source: "argus" | "mock"
  rawItems: ArgusTabulacaoItem[]
}> {
  try {
    const raw = await argusPost("report/tabulacoesdetalhadas", {
      ultimosMinutos: 480,
      idCampanha: campaignId,
    })
    const items = extractArray<ArgusTabulacaoItem>(raw, [
      "itens", "data", "tabulacoes", "resultados", "tabulacoesDetalhadas",
    ])
    return { ...adaptTabulacoes(items), tabulacoes_source: "argus", rawItems: items }
  } catch {
    console.warn("[dashboard/metrics] tabulacoesdetalhadas indisponível — usando mock")
    const mock = generateMockDashboard()
    return {
      objections: mock.top_objections,
      occurrences: mock.occurrences,
      total_conversoes: mock.metrics.total_conversoes,
      tabulacoes_source: "mock",
      rawItems: [],
    }
  }
}

/**
 * Builds the hourly chart from real call timestamps.
 * Groups ligacoesItems by hour of dataHoraLigacao.
 * Uses tabulacaoItems.dataEvento to count per-hour conversions.
 * Returns source="empty" (all-zero chart) if no timestamps are found.
 */
function buildHourlyChartFromCalls(
  ligacoesItems: ArgusLigacaoItem[],
  tabulacaoItems: ArgusTabulacaoItem[] = []
): { chart: HourlyMetric[]; source: "from_calls" | "empty" } {
  const hourMap = new Map<number, { ligacoes: number; contatos: number; conversoes: number }>()

  for (const item of ligacoesItems) {
    const startStr = item.dataHoraLigacao ?? item.dataHora ?? item.horarioInicio ?? item.inicio
    if (!startStr) continue
    const date = new Date(startStr)
    if (isNaN(date.getTime())) continue
    const h = date.getHours()
    const entry = hourMap.get(h) ?? { ligacoes: 0, contatos: 0, conversoes: 0 }
    entry.ligacoes++
    if (item.resultadoLigacao?.toUpperCase() === "ATENDIMENTO") entry.contatos++
    hourMap.set(h, entry)
  }

  // Cross-reference tabulacoes with dataEvento for per-hour conversion counts
  for (const tab of tabulacaoItems) {
    if (!tab.dataEvento) continue
    const date = new Date(tab.dataEvento)
    if (isNaN(date.getTime())) continue
    const h = date.getHours()
    const entry = hourMap.get(h)
    if (!entry) continue
    const tabuladoUpper = (tab.tabulado ?? tab.tabulacao ?? "").toUpperCase()
    const categoriaUpper = (tab.categoriaTabulacao ?? "").toUpperCase()
    const isConversao =
      tabuladoUpper.startsWith("PROPOSTA ENVIADA") ||
      categoriaUpper === "SUCESSO"
    if (isConversao) entry.conversoes++
  }

  if (hourMap.size === 0) {
    return { chart: [], source: "empty" }
  }

  const hours = Array.from(hourMap.keys()).sort((a, b) => a - b)
  return {
    chart: hours.map((h) => ({
      hora: `${String(h).padStart(2, "0")}h`,
      ligacoes: hourMap.get(h)!.ligacoes,
      contatos: hourMap.get(h)!.contatos,
      conversoes: hourMap.get(h)!.conversoes,
    })),
    source: "from_calls",
  }
}

async function createPendingRecords(
  tabulacaoItems: ArgusTabulacaoItem[],
  campaignId: number
): Promise<void> {
  if (!supabase) return

  // Deduplicate by idLigacao — keep last tabulação per call
  const byLigacao = new Map<string, ArgusTabulacaoItem>()
  for (const tab of tabulacaoItems) {
    const id = String(tab.ligacaoRelevante?.idLigacao ?? "")
    if (id) byLigacao.set(id, tab)
  }
  if (byLigacao.size === 0) return

  const callIds = Array.from(byLigacao.keys()).map((id) => `argus-${id}`)

  // Batch-check which already exist in Supabase
  const { data: existing } = await supabase
    .from("call_analyses")
    .select("call_id")
    .in("call_id", callIds)
  const existingSet = new Set((existing ?? []).map((r) => r.call_id as string))

  for (const [idLigacao, tab] of byLigacao) {
    const call_id = `argus-${idLigacao}`
    if (existingSet.has(call_id)) continue

    const pending: CallAnalysis = {
      call_id,
      sdr_name:         tab.usuarioOperador ?? "SDR",
      sdr_id:           String(tab.idUsuario ?? ""),
      phone:            maskPhone(tab.telefone ?? tab.ligacaoRelevante?.telefone),
      school_name:      `Campanha ${campaignId}`,
      started_at:       tab.dataEvento
        ? new Date(tab.dataEvento).toISOString()
        : new Date().toISOString(),
      duration_seconds: tab.ligacaoRelevante?.tempoSegundos ?? 0,
      transcript:       "[Pendente — aguardando processamento]",
      score: 0, tom: "neutro", resultado: "outros",
      tempo_resposta_inicial_segundos: 0,
      palavras_conversao: [], palavras_perda: [], objecoes: [],
      como_tratou_objecoes: "",
      pontos_positivos: [], pontos_negativos: [],
      analisado_em:    new Date().toISOString(),
      source:          "mock",
      data_source:     "pending",
      status:          "pendente",
      pending_payload: JSON.stringify(tab),
    }

    await saveAnalysis(pending)
    console.log(`[metrics] pending criado: ${call_id}`)
  }
}

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(
      { error: "ARGUS_BASE_URL ou ARGUS_TOKEN não configurados" },
      { status: 500 }
    )
  }

  try {
    // desempenhoresumido + ligacoesdetalhadas are required — if either fails, full mock fallback.
    // tabulacoesdetalhadas is optional — degrades gracefully to mock objections/occurrences.
    const [rawDesempenho, rawLigacoes] = await Promise.all([
      argusPost("report/desempenhoresumido", { ultimosMinutos: 480 }),
      argusPost("report/ligacoesdetalhadas", { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
    ])

    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const ligacoesItems = extractArray<ArgusLigacaoItem>(rawLigacoes, [
      "ligacoesDetalhadas", "itens", "data", "ligacoes", "chamadas",
    ])

    // attended = calls where the lead picked up (resultadoLigacao "ATENDIMENTO")
    const totalAtendidas = ligacoesItems.filter((i) => i.resultadoLigacao?.toUpperCase() === "ATENDIMENTO").length

    // Try tabulações independently — won't throw even if unavailable
    const { objections, occurrences, total_conversoes, tabulacoes_source, rawItems: tabulacaoItems } =
      await fetchTabulacoes(CAMPAIGN_ID)

    const sdrs      = adaptSDRs(desempenhoItems, VENDAS_LIST)
    const liveCalls = adaptLiveCalls(ligacoesItems, VENDAS_LIST)

    // totalDiscadas: prefer SDR realizadas sum (desempenhoresumido includes unanswered calls).
    // ligacoesdetalhadas may only return attended calls in this Argus config,
    // which makes length === totalAtendidas and produces taxa_contato=100%.
    const totalDiscadasFromSDR = sdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0)
    const totalDiscadas = totalDiscadasFromSDR > totalAtendidas
      ? totalDiscadasFromSDR   // desempenho returned real discadas count
      : ligacoesItems.length   // fallback: count all ligacoes records

    const metrics = buildMetrics(sdrs, liveCalls, total_conversoes, totalDiscadas, totalAtendidas)

    // Build hourly chart from real call timestamps — no fake uniform distribution
    const { chart: hourlyChart, source: hourlySource } = buildHourlyChartFromCalls(
      ligacoesItems,
      tabulacaoItems
    )

    // Fire-and-forget: create pending records for calls seen in tabulacoesdetalhadas
    // that don't yet have an analysis in Supabase.
    after(() => createPendingRecords(tabulacaoItems, CAMPAIGN_ID))

    return NextResponse.json({
      metrics,
      sdrs,
      live_calls: liveCalls,
      top_objections: objections,
      occurrences,
      hourly_chart: hourlyChart,
      hourly_source: hourlySource,
      last_updated: new Date().toISOString(),
      source: "argus",
      tabulacoes_source,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[dashboard/metrics] Argus error — falling back to mock:", message)

    const mock = generateMockDashboard()
    return NextResponse.json(
      { ...mock, source: "mock", fallback_reason: message },
      { status: 200 }
    )
  }
}
