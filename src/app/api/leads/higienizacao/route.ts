import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

// GET /api/leads/higienizacao?page=0&limit=50
// Retorna todos os leads pendentes de higienização, com dados da lista de origem.
//
// Gancho futuro: webhook Argus chamará PATCH com motivo='numero_inexistente_discador'
// quando uma tabulação de "número inexistente" for registrada.
export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ leads: [], total: 0, warning: "Supabase não configurado" })
  }

  const { searchParams } = new URL(req.url)
  const page  = Math.max(0, parseInt(searchParams.get("page")  ?? "0",  10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)))
  const from  = page * limit
  const to    = from + limit - 1

  const { data, error, count } = await supabase
    .from("leads")
    .select(
      "id, nome, telefone_principal, motivo_higienizacao, lista_id, created_at, listas(id, unidade, tipo_lista, nome_arquivo)",
      { count: "exact" }
    )
    .eq("precisa_higienizacao", true)
    .is("higienizado_em", null)
    .order("created_at", { ascending: true })
    .range(from, to)

  if (error) {
    console.error("[higienizacao] GET:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data ?? [], total: count ?? 0 })
}

// PATCH /api/leads/higienizacao
// Body: { lead_id: string; telefone_corrigido: string | null }
//   - telefone_corrigido = string → resolve com número correto
//   - telefone_corrigido = null   → "Sem contato possível"
export async function PATCH(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  let body: { lead_id: string; telefone_corrigido: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { lead_id, telefone_corrigido } = body

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id é obrigatório" }, { status: 400 })
  }

  const { error } = await supabase
    .from("leads")
    .update({
      telefone_corrigido:   telefone_corrigido ?? null,
      higienizado_em:       new Date().toISOString(),
      precisa_higienizacao: false,
    })
    .eq("id", lead_id)

  if (error) {
    console.error("[higienizacao] PATCH:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
