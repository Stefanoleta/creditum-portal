import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { normalizePhone } from "@/lib/lista-parser"

// POST /api/listas/sdr-ia/match-leads
// Cruza telefones de leads engajados (Samantha/Qick) com a tabela `leads`
// do Portal, trazendo a unidade REAL (via join com `listas`) quando o lead
// estiver cadastrado — não a unidade da campanha do discador (essa vem da
// própria Qick API e não é confirmada nas listas do Portal).
//
// Body:  { telefones: string[] }
// Reply: { matches: Record<string, LeadMatch> }   — chave = telefone original recebido

export interface LeadMatch {
  encontrado: boolean
  unidade?: string
  listaId?: string
}

interface MatchedInfo {
  listaId: string | null
  unidade: string | null
}

export async function POST(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ matches: {} })
  }

  const body = await req.json().catch(() => null) as { telefones?: unknown } | null
  const telefonesRaw = Array.isArray(body?.telefones) ? body.telefones : []
  if (telefonesRaw.length === 0) {
    return NextResponse.json({ matches: {} })
  }

  // original (as sent by the client) → normalized digits, for the response keys
  const normalizedToOriginal = new Map<string, string>()
  for (const raw of telefonesRaw) {
    if (typeof raw !== "string") continue
    const norm = normalizePhone(raw)
    if (norm) normalizedToOriginal.set(norm, raw)
  }

  const normalizedList = [...normalizedToOriginal.keys()]
  if (normalizedList.length === 0) {
    return NextResponse.json({ matches: {} })
  }

  // Single query: exact match OR last-8-digit suffix match, combined in one
  // .or() filter — avoids a second round trip for the suffix fallback.
  // listas!leads_lista_id_fkey!left(unidade) brings the REAL unidade from the
  // list the lead was imported into — leads.lista_id can be null, so !left
  // keeps those rows instead of excluding them.
  const suffixes = [...new Set(normalizedList.map(n => n.slice(-8)).filter(s => s.length === 8))]
  const orParts = [
    `telefone_principal.in.(${normalizedList.join(",")})`,
    ...suffixes.map(s => `telefone_principal.like.%${s}`),
  ]

  const { data: rowsRaw, error } = await supabase
    .from("leads")
    .select("telefone_principal, lista_id, listas!leads_lista_id_fkey!left(unidade)")
    .or(orParts.join(","))

  if (error) {
    console.error("[sdr-ia/match-leads] supabase error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // postgrest-js's type-level parser breaks on `!fkey!left(col)` as soon as a
  // property is accessed (works fine at runtime — Postgres/Postgrest receive
  // and resolve the query correctly). Same workaround already used in
  // export/route.ts: cast through `unknown` to the real shape.
  interface LeadRow {
    telefone_principal: string | null
    lista_id: string | null
    listas: { unidade?: string } | null
  }
  const rows = (rowsRaw ?? []) as unknown as LeadRow[]

  // Index matched leads by exact number and by suffix, carrying lista_id/unidade
  // alongside — first match wins if a phone appears in more than one lead.
  const exactMap  = new Map<string, MatchedInfo>()
  const suffixMap = new Map<string, MatchedInfo>()

  for (const row of rows) {
    const norm = normalizePhone(row.telefone_principal)
    if (!norm) continue
    const info: MatchedInfo = { listaId: row.lista_id ?? null, unidade: row.listas?.unidade ?? null }
    if (!exactMap.has(norm)) exactMap.set(norm, info)
    const suf = norm.slice(-8)
    if (!suffixMap.has(suf)) suffixMap.set(suf, info)
  }

  const matches: Record<string, LeadMatch> = {}
  for (const [norm, original] of normalizedToOriginal) {
    const hit = exactMap.get(norm) ?? suffixMap.get(norm.slice(-8))
    matches[original] = {
      encontrado: !!hit,
      unidade: hit?.unidade ?? undefined,
      listaId: hit?.listaId ?? undefined,
    }
  }

  return NextResponse.json({ matches })
}
