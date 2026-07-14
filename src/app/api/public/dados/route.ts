import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type RpcRow = {
  id_ligacao?: number | string | null
  data_hora_ligacao?: string | null
  atendida?: boolean | null
  invalida?: boolean | null
  alo?: string | boolean | null
  cpc?: boolean | null
  sub_status?: string | null
  hora?: number | null
  dia_semana?: string | null
  faixa_hora?: string | null
  uf?: string | null
  unidade?: string | null
  tabulacao?: string | null
  grupo_origem?: string | null
}

type Bucket = {
  total: number
  atendidas: number
  invalidas: number
  aloSim: number
  aloNao: number
  cpc: number
  tabuladas: number
  semTabulacao: number
}

const DEFAULT_PAGE_SIZE = 1000
const MAX_PAGES = 200

function emptyBucket(): Bucket {
  return { total: 0, atendidas: 0, invalidas: 0, aloSim: 0, aloNao: 0, cpc: 0, tabuladas: 0, semTabulacao: 0 }
}

function addToBucket(bucket: Bucket, row: RpcRow): void {
  const tab = String(row.tabulacao ?? "").trim()
  const alo = String(row.alo ?? "").trim().toLowerCase()
  const sub = String(row.sub_status ?? "").trim().toLowerCase()

  bucket.total += 1
  if (row.atendida === true) bucket.atendidas += 1
  if (row.invalida === true) bucket.invalidas += 1
  if (row.cpc === true) bucket.cpc += 1
  if (tab) bucket.tabuladas += 1
  else bucket.semTabulacao += 1

  if (alo === "sim" || sub === "alo_sim" || row.atendida === true) bucket.aloSim += 1
  else if (alo === "nao" || alo === "não" || sub === "alo_nao") bucket.aloNao += 1
}

function pct(n: number, d: number): number {
  return d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0
}

function serializeBucket(bucket: Bucket) {
  return {
    ...bucket,
    taxaAtendida: pct(bucket.atendidas, bucket.total),
    taxaAlo: pct(bucket.aloSim, bucket.total),
    taxaCpcTotal: pct(bucket.cpc, bucket.total),
    taxaCpcAlo: pct(bucket.cpc, bucket.aloSim),
    taxaInvalidas: pct(bucket.invalidas, bucket.total),
    taxaSemTabulacao: pct(bucket.semTabulacao, bucket.total),
  }
}

function addMap(map: Map<string, Bucket>, key: string | null | undefined, row: RpcRow): void {
  const safeKey = String(key || "NA")
  const bucket = map.get(safeKey) ?? emptyBucket()
  addToBucket(bucket, row)
  map.set(safeKey, bucket)
}

function topMap(map: Map<string, Bucket>, limit = 20) {
  return Array.from(map.entries())
    .map(([key, bucket]) => ({ key, ...serializeBucket(bucket) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const discadorToken = process.env.DISCADOR_TOKEN

  const missing: string[] = []
  if (!supabaseUrl || supabaseUrl.startsWith("your_")) missing.push("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL")
  if (!anonKey || anonKey.startsWith("your_")) missing.push("SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY")
  if (!discadorToken || discadorToken.startsWith("your_")) missing.push("DISCADOR_TOKEN")

  return { supabaseUrl, anonKey, discadorToken, missing }
}

async function fetchPage(params: {
  supabaseUrl: string
  anonKey: string
  discadorToken: string
  inicio: string
  fim: string
  pageSize: number
  pageOffset: number
}): Promise<RpcRow[]> {
  const url = `${params.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/dashboard_chamadas_public`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: params.anonKey,
      authorization: `Bearer ${params.anonKey}`,
      "x-discador-token": params.discadorToken,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      inicio: params.inicio,
      fim: params.fim,
      page_size: params.pageSize,
      page_offset: params.pageOffset,
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Supabase RPC dashboard_chamadas_public failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 500)}` : ""}`)
  }

  const data: unknown = await res.json()
  if (!Array.isArray(data)) throw new Error("Supabase RPC returned unexpected payload")
  return data as RpcRow[]
}

function defaultFim(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultInicio(fim: string): string {
  const d = new Date(`${fim}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 6)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fim = searchParams.get("fim") || defaultFim()
  const inicio = searchParams.get("inicio") || defaultInicio(fim)
  const pageSizeParam = Number(searchParams.get("page_size") || DEFAULT_PAGE_SIZE)
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0
    ? Math.min(Math.floor(pageSizeParam), 5000)
    : DEFAULT_PAGE_SIZE

  const config = getConfig()
  if (config.missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Supabase/Discador não configurado", missing: config.missing },
      { status: 503 },
    )
  }

  const byUf = new Map<string, Bucket>()
  const byHora = new Map<string, Bucket>()
  const byUfHora = new Map<string, Bucket>()
  const byDiaSemana = new Map<string, Bucket>()
  const total = emptyBucket()

  let pageOffset = 0
  let pages = 0
  let truncated = false

  try {
    while (pages < MAX_PAGES) {
      const rows = await fetchPage({
        supabaseUrl: config.supabaseUrl as string,
        anonKey: config.anonKey as string,
        discadorToken: config.discadorToken as string,
        inicio,
        fim,
        pageSize,
        pageOffset,
      })

      if (rows.length === 0) break

      for (const row of rows) {
        addToBucket(total, row)
        addMap(byUf, row.uf, row)
        addMap(byHora, row.faixa_hora || (typeof row.hora === "number" ? `${String(row.hora).padStart(2, "0")}:00` : "NA"), row)
        addMap(byUfHora, `${row.uf || "NA"}|${row.faixa_hora || row.hora || "NA"}`, row)
        addMap(byDiaSemana, row.dia_semana, row)
      }

      pages += 1
      pageOffset += rows.length
      // The Supabase RPC may apply a server-side cap lower than requested pageSize.
      // Continue until an empty page instead of assuming rows.length < pageSize means EOF.
    }

    if (pages >= MAX_PAGES) truncated = true

    return NextResponse.json({
      ok: true,
      inicio,
      fim,
      generatedAt: new Date().toISOString(),
      source: "supabase.rpc.dashboard_chamadas_public",
      pagination: { pageSize, pages, rowsFetched: total.total, truncated },
      kpis: serializeBucket(total),
      porUf: topMap(byUf, 50),
      porHora: topMap(byHora, 24),
      porUfHora: topMap(byUfHora, 100),
      porDiaSemana: topMap(byDiaSemana, 10),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/public/dados]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
