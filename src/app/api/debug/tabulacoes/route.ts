import { NextResponse } from "next/server"

const BASE_URL    = process.env.ARGUS_BASE_URL!
const TOKEN       = process.env.ARGUS_TOKEN!
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")

// GET /api/debug/tabulacoes
// Retorna todos os valores únicos de `tabulado` dos últimos 30 dias.
// Uso temporário — deletar após coleta dos dados reais.
export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: "ARGUS_BASE_URL ou ARGUS_TOKEN não configurados" }, { status: 503 })
  }

  const res = await fetch(`${BASE_URL}/report/tabulacoesdetalhadas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Token-Signature": TOKEN },
    body: JSON.stringify({ ultimosMinutos: 43200, idCampanha: CAMPAIGN_ID }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Argus HTTP ${res.status}` }, { status: 502 })
  }

  const json = await res.json() as Record<string, unknown>

  if (typeof json?.codStatus === "number" && json.codStatus < 0) {
    return NextResponse.json({ error: json.descStatus, codStatus: json.codStatus }, { status: 502 })
  }

  const items = (
    json.itens ?? json.data ?? json.tabulacoes ?? json.resultados ?? []
  ) as Record<string, unknown>[]

  const unique = [...new Set(
    items
      .map(x => (x.tabulado ?? x.tabulacao ?? x.tabulacaoDesc ?? "") as string)
      .filter(Boolean)
  )].sort()

  return NextResponse.json({
    total_items: items.length,
    unique_count: unique.length,
    tabulado_values: unique,
    response_keys: Object.keys(json),
    sample_item: items[0] ?? null,
  })
}
