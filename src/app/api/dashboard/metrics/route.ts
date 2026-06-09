import { NextResponse } from "next/server"
import {
  adaptSDRs,
  adaptLiveCalls,
  adaptTabulacoes,
  buildMetrics,
  extractArray,
} from "@/lib/argus-adapter"
import { generateMockDashboard } from "@/lib/mock-data"
import type {
  ArgusDesempenhoItem,
  ArgusLigacaoItem,
  ArgusTabulacaoItem,
} from "@/types/argus"
import type { HourlyMetric } from "@/types/dashboard"

const BASE_URL = process.env.ARGUS_BASE_URL!
const TOKEN    = process.env.ARGUS_TOKEN!

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
    // Never cache — always fresh
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Argus ${endpoint} → HTTP ${res.status}`)
  }

  const json = await res.json()

  if (json?.codStatus < 0) {
    throw new Error(`Argus ${endpoint} → ${json.descStatus ?? "erro desconhecido"}`)
  }

  return json as T
}

// Build hourly buckets from the SDR performance data.
// Argus desempenhoresumido doesn't include per-hour breakdowns, so we derive
// the current hour's numbers from totals and fill prior hours with zeros.
// When a proper hourly endpoint becomes available, replace this.
function buildHourlyChart(
  totalLigacoes: number,
  totalConversoes: number,
  totalAtendidas: number
): HourlyMetric[] {
  const now = new Date()
  const currentHour = now.getHours()
  const startHour = Math.max(8, currentHour - 8)

  return Array.from({ length: currentHour - startHour + 1 }, (_, i) => {
    const h = startHour + i
    const isCurrentHour = h === currentHour
    const minutesElapsed = isCurrentHour ? now.getMinutes() + 1 : 60
    const fraction = minutesElapsed / 60

    // Distribute totals evenly as rough estimate across elapsed hours
    const hours = currentHour - startHour + 1
    const perHourLig  = Math.round((totalLigacoes / hours) * fraction)
    const perHourAtd  = Math.round((totalAtendidas / hours) * fraction)
    const perHourConv = Math.round((totalConversoes / hours) * fraction)

    return {
      hora: `${String(h).padStart(2, "0")}h`,
      ligacoes:   isCurrentHour ? perHourLig  : Math.round(totalLigacoes / hours),
      contatos:   isCurrentHour ? perHourAtd  : Math.round(totalAtendidas / hours),
      conversoes: isCurrentHour ? perHourConv : Math.round(totalConversoes / hours),
    }
  })
}

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(
      { error: "ARGUS_BASE_URL ou ARGUS_TOKEN não configurados" },
      { status: 500 }
    )
  }

  try {
    // Fire all three Argus calls in parallel
    const [rawDesempenho, rawLigacoes, rawTabulacoes] = await Promise.all([
      argusPost("report/desempenhoresumido",  { ultimosMinutos: 480 }),
      argusPost("report/ligacoesdetalhadas",  { ultimosMinutos: 5   }),
      argusPost("report/tabulacoesdetalhadas", { ultimosMinutos: 480 }),
    ])

    // Extract arrays regardless of response envelope shape
    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const ligacoesItems = extractArray<ArgusLigacaoItem>(rawLigacoes, [
      "itens", "data", "ligacoes", "chamadas",
    ])
    const tabulacoesItems = extractArray<ArgusTabulacaoItem>(rawTabulacoes, [
      "itens", "data", "tabulacoes", "resultados",
    ])

    // Adapt to our types
    const sdrs      = adaptSDRs(desempenhoItems)
    const liveCalls = adaptLiveCalls(ligacoesItems)
    const { objections, occurrences, total_conversoes } = adaptTabulacoes(tabulacoesItems)
    const metrics   = buildMetrics(sdrs, liveCalls, total_conversoes)

    const hourlyChart = buildHourlyChart(
      metrics.total_ligacoes,
      metrics.total_conversoes,
      metrics.total_ligacoes > 0 ? Math.round(metrics.total_ligacoes * metrics.taxa_contato / 100) : 0
    )

    return NextResponse.json({
      metrics,
      sdrs,
      live_calls: liveCalls,
      top_objections: objections,
      occurrences,
      hourly_chart: hourlyChart,
      last_updated: new Date().toISOString(),
      source: "argus",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Log server-side; never expose token or internal paths to client
    console.error("[dashboard/metrics] Argus error — falling back to mock:", message)

    const mock = generateMockDashboard()
    return NextResponse.json(
      { ...mock, source: "mock", fallback_reason: message },
      // 200 so the client renders without error
      { status: 200 }
    )
  }
}
