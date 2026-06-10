import { NextResponse } from "next/server"
import {
  adaptSDRs,
  adaptLiveCalls,
  adaptTabulacoes,
  buildMetrics,
  extractArray,
  getVendasAllowlist,
} from "@/lib/argus-adapter"
import { generateMockDashboard } from "@/lib/mock-data"
import type {
  ArgusDesempenhoItem,
  ArgusLigacaoItem,
  ArgusTabulacaoItem,
} from "@/types/argus"
import type { HourlyMetric, Objection, Occurrence } from "@/types/dashboard"

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
    throw new Error(`Argus ${endpoint} → HTTP ${res.status}`)
  }

  const json = await res.json()

  if (json?.codStatus < 0) {
    throw new Error(`Argus ${endpoint} → ${json.descStatus ?? "erro desconhecido"}`)
  }

  return json as T
}

// Try tabulacoesdetalhadas with idCampanha=1 fallback, then give up gracefully.
async function fetchTabulacoes(): Promise<{
  objections: Objection[]
  occurrences: Occurrence[]
  total_conversoes: number
  tabulacoes_source: "argus" | "mock"
}> {
  const mock = generateMockDashboard()

  // Attempt 1: standard payload
  // Attempt 2: with idCampanha=CAMPAIGN_ID (some Argus configs require campaign scope)
  // Attempt 3: broader window
  const attempts = [
    { ultimosMinutos: 480 },
    { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID },
    { ultimosMinutos: 480, idCampanha: 1 },
  ]

  for (const body of attempts) {
    try {
      const raw = await argusPost("report/tabulacoesdetalhadas", body)
      // Diagnostic log: show top-level keys and sample of first item
      const keys = Object.keys(raw as object)
      const anyArray = keys.find((k) => Array.isArray((raw as Record<string, unknown>)[k]))
      const firstItem = anyArray ? ((raw as Record<string, unknown>)[anyArray] as unknown[])[0] : null
      console.log("[tabulacoes] payload keys:", keys, "| array key:", anyArray ?? "none", "| first item:", JSON.stringify(firstItem ?? raw).slice(0, 300))

      const items = extractArray<ArgusTabulacaoItem>(raw, [
        "itens", "data", "tabulacoes", "resultados", "tabulacoesDetalhadas",
      ])
      if (items.length === 0) {
        console.warn("[tabulacoes] attempt", JSON.stringify(body), "→ 0 items — tentando próximo")
        continue
      }
      const result = adaptTabulacoes(items)
      return { ...result, tabulacoes_source: "argus" }
    } catch (err) {
      console.warn("[tabulacoes] attempt", JSON.stringify(body), "→ erro:", err instanceof Error ? err.message : err)
    }
  }

  console.warn("[dashboard/metrics] tabulacoesdetalhadas indisponível — usando mock para objeções/ocorrências")
  return {
    objections: mock.top_objections,
    occurrences: mock.occurrences,
    total_conversoes: mock.metrics.total_conversoes,
    tabulacoes_source: "mock",
  }
}

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
    const hours = currentHour - startHour + 1

    return {
      hora: `${String(h).padStart(2, "0")}h`,
      ligacoes:   isCurrentHour ? Math.round((totalLigacoes   / hours) * fraction) : Math.round(totalLigacoes   / hours),
      contatos:   isCurrentHour ? Math.round((totalAtendidas  / hours) * fraction) : Math.round(totalAtendidas  / hours),
      conversoes: isCurrentHour ? Math.round((totalConversoes / hours) * fraction) : Math.round(totalConversoes / hours),
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
    // desempenhoresumido + ligacoesdetalhadas are required — if either fails, full mock fallback.
    // tabulacoesdetalhadas is optional — degrades gracefully to mock objections/occurrences.
    const [rawDesempenho, rawLigacoes] = await Promise.all([
      argusPost("report/desempenhoresumido", { ultimosMinutos: 480 }),
      // 480 min window: needed for accurate taxa de contato (total dialed / attended)
      argusPost("report/ligacoesdetalhadas", { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
    ])

    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const ligacoesItems = extractArray<ArgusLigacaoItem>(rawLigacoes, [
      "ligacoesDetalhadas", "itens", "data", "ligacoes", "chamadas",
    ])

    // Total dialed = all records; attended = resultadoLigacao "ATENDIMENTO" (case-insensitive)
    const totalDiscadas  = ligacoesItems.length
    const totalAtendidas = ligacoesItems.filter((i) => i.resultadoLigacao?.toUpperCase() === "ATENDIMENTO").length

    // Try tabulações independently — won't throw even if both attempts fail
    const { objections, occurrences, total_conversoes, tabulacoes_source } =
      await fetchTabulacoes()

    const sdrs      = adaptSDRs(desempenhoItems, VENDAS_LIST)
    const liveCalls = adaptLiveCalls(ligacoesItems, VENDAS_LIST)  // filtered to Vendas SDRs only
    const metrics   = buildMetrics(sdrs, liveCalls, total_conversoes, totalDiscadas, totalAtendidas)

    const hourlyChart = buildHourlyChart(
      totalDiscadas,
      metrics.total_conversoes,
      totalAtendidas
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
