import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { normalizePhone } from "@/lib/lista-parser"

// POST /api/listas/sdr-ia/match-leads
// Cruza telefones de leads engajados (Samantha/Qick) com a tabela `leads`
// do Portal, para indicar na aba SDR I.A. se o lead já está em alguma lista
// importada ou é "novo" (fora das listas).
//
// Body:  { telefones: string[] }
// Reply: { matches: Record<string, boolean> }   — chave = telefone original recebido

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
  const suffixes = [...new Set(normalizedList.map(n => n.slice(-8)).filter(s => s.length === 8))]
  const orParts = [
    `telefone_principal.in.(${normalizedList.join(",")})`,
    ...suffixes.map(s => `telefone_principal.like.%${s}`),
  ]

  const { data: rows, error } = await supabase
    .from("leads")
    .select("telefone_principal")
    .or(orParts.join(","))

  if (error) {
    console.error("[sdr-ia/match-leads] supabase error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Index matched leads by exact number and by suffix, then resolve each
  // input phone: exact match first, suffix match as fallback.
  const exactSet   = new Set<string>()
  const suffixSet  = new Set<string>()
  for (const row of rows ?? []) {
    const norm = normalizePhone(row.telefone_principal)
    if (!norm) continue
    exactSet.add(norm)
    suffixSet.add(norm.slice(-8))
  }

  const matches: Record<string, boolean> = {}
  for (const [norm, original] of normalizedToOriginal) {
    matches[original] = exactSet.has(norm) || suffixSet.has(norm.slice(-8))
  }

  return NextResponse.json({ matches })
}
