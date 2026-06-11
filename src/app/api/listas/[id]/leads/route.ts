import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

// GET /api/listas/[id]/leads?page=0&limit=50
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ leads: [], total: 0, warning: "Supabase não configurado" })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const page  = Math.max(0, parseInt(searchParams.get("page")  ?? "0", 10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)))
  const from  = page * limit
  const to    = from + limit - 1

  const { data, error, count } = await supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("lista_id", id)
    .order("created_at", { ascending: true })
    .range(from, to)

  if (error) {
    console.error("[leads] GET:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data ?? [], total: count ?? 0 })
}

// PATCH /api/listas/[id]/leads  — body: { lead_id, patch: { parcelas_totais?, fora_politica?, recontato_em?, whatsapp_enviado_em? } }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const { id: lista_id } = await params

  let body: { lead_id: string; patch: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { lead_id, patch } = body

  if (!lead_id || !patch) {
    return NextResponse.json({ error: "lead_id e patch são obrigatórios" }, { status: 400 })
  }

  // Whitelist de campos editáveis
  const allowed: Record<string, boolean> = {
    parcelas_totais:     true,
    fora_politica:       true,
    recontato_em:        true,
    whatsapp_enviado_em: true,
    whatsapp_template:   true,
  }

  const safePatch: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) {
    if (allowed[key]) safePatch[key] = patch[key]
  }

  if (Object.keys(safePatch).length === 0) {
    return NextResponse.json({ error: "Nenhum campo editável fornecido" }, { status: 400 })
  }

  const { error } = await supabase
    .from("leads")
    .update(safePatch)
    .eq("id", lead_id)
    .eq("lista_id", lista_id)

  if (error) {
    console.error("[leads] PATCH:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
