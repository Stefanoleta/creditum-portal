import { NextResponse } from "next/server"
import { generateMockReports } from "@/lib/mock-reports"
import type { OperatorRow, HourlyRow } from "@/lib/mock-reports"
import { adaptSDRs, adaptTabulacoes, extractArray, getVendasAllowlist } from "@/lib/argus-adapter"
import type { ArgusDesempenhoItem, ArgusTabulacaoItem } from "@/types/argus"
import { HR_BASE, DAILY_BASE } from "@/lib/mock-reports"

const BASE_URL   = process.env.ARGUS_BASE_URL
const TOKEN      = process.env.ARGUS_TOKEN
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")

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

  if (!res.ok) throw new Error(`Argus ${endpoint} → HTTP ${res.status}`)

  const json = await res.json() as Record<string, unknown>
  if (typeof json?.codStatus === "number" && json.codStatus < 0) {
    throw new Error(`Argus ${endpoint} → ${json.descStatus ?? "erro"}`)
  }

  return json as T
}

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(generateMockReports())
  }

  try {
    const [rawDesempenho, rawTabulacoes, rawLigacoes] = await Promise.all([
      argusPost("report/desempenhoresumido", { ultimosMinutos: 480 }),
      argusPost("report/tabulacoesdetalhadas", { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
      argusPost("report/ligacoesdetalhadas",   { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
    ])

    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const tabulacaoItems = extractArray<ArgusTabulacaoItem>(rawTabulacoes, [
      "itens", "data", "tabulacoes",
    ])

    // Vendas allowlist: hardcoded default, optional env-var override.
    // Do NOT detect group IDs dynamically — group numbering varies by Argus installation.
    const vendasList = getVendasAllowlist(process.env.ARGUS_SDR_ALLOWLIST)

    // Log raw agent names once per request so Vercel logs can confirm exact format.
    const rawNames = extractArray<{ nomeUsuario?: string; nome?: string }>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ]).map((i) => i.nomeUsuario ?? i.nome ?? "?")
    console.log("[reports/daily] agentes brutos do Argus:", rawNames)
    console.log("[reports/daily] allowlist Vendas:", vendasList)

    const sdrs = adaptSDRs(desempenhoItems, vendasList)
    const { total_conversoes } = adaptTabulacoes(tabulacaoItems)

    const ligacoes    = sdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0)
    const atendidas   = sdrs.reduce((s, r) => s + r.ligacoes_atendidas, 0)
    const conversoes  = total_conversoes
    const tmaSoma     = sdrs.filter((s) => s.tma_segundos > 0).reduce((s, r) => s + r.tma_segundos, 0)
    const tmaCount    = sdrs.filter((s) => s.tma_segundos > 0).length
    const tma_segundos = tmaCount > 0 ? Math.round(tmaSoma / tmaCount) : 228
    const taxa_contato   = ligacoes  > 0 ? Math.round((atendidas  / ligacoes)  * 1000) / 10 : 0
    const taxa_conversao = atendidas > 0 ? Math.round((conversoes / atendidas) * 1000) / 10 : 0

    const hoje = {
      date: new Date().toISOString().split("T")[0],
      dia: new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }),
      ligacoes,
      atendidas,
      conversoes,
      tma_segundos,
      taxa_contato,
      taxa_conversao,
      receita: conversoes * 1600,
    }

    // Scale HR_BASE proportionally to today's actual totals
    const hrTotal = HR_BASE.reduce((s, r) => s + r.ligacoes, 0)
    const scale   = hrTotal > 0 ? ligacoes / hrTotal : 1
    const intraday: HourlyRow[] = HR_BASE.map((r) => {
      const l = Math.round(r.ligacoes * scale)
      const a = Math.round(r.atendidas * scale)
      const c = Math.round(r.conversoes * scale)
      return {
        hora: r.hora,
        ligacoes: l,
        atendidas: a,
        conversoes: c,
        taxa_contato:   l > 0 ? Math.round((a / l) * 1000) / 10 : 0,
        taxa_conversao: a > 0 ? Math.round((c / a) * 1000) / 10 : 0,
      }
    })

    const operadores: OperatorRow[] = sdrs.map((s, i) => ({
      id: s.id,
      name: s.name,
      meta_dia: s.meta_dia,
      ligacoes_realizadas: s.ligacoes_realizadas,
      ligacoes_atendidas: s.ligacoes_atendidas,
      conversoes: s.conversoes,
      tma_segundos: s.tma_segundos,
      score_ia: s.score_ia ?? 75,
      taxa_contato: s.ligacoes_realizadas > 0
        ? Math.round((s.ligacoes_atendidas / s.ligacoes_realizadas) * 1000) / 10
        : 0,
      taxa_conversao: s.ligacoes_atendidas > 0
        ? Math.round((s.conversoes / s.ligacoes_atendidas) * 1000) / 10
        : 0,
    })).sort((a, b) => b.conversoes - a.conversoes)

    return NextResponse.json({
      hoje,
      intraday,
      por_hora: intraday,
      operadores,
      historico: DAILY_BASE,
      source: "argus",
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn("[reports/daily] Argus indisponível — usando mock:", reason)

    return NextResponse.json({
      ...generateMockReports(),
      fallback_reason: reason,
    })
  }
}
