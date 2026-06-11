import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

// GET /api/leads/higienizacao?tipo=pendentes|sugestoes&page=1&per_page=20
// PATCH /api/leads/higienizacao  body: { lead_id, acao, telefone_corrigido? }
//
//  Ações disponíveis:
//    resolver              — higieniza pendente (telefone_corrigido obrigatório)
//    confirmar_sugestao    — aceita telefone sugerido como principal do lead antigo
//    ignorar_sugestao      — descarta sugestão; mantém lead antigo como estava

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ leads: [], total: 0, warning: "Supabase não configurado" })
  }

  const { searchParams } = new URL(req.url)
  const tipo     = searchParams.get("tipo")     ?? "pendentes"
  const page     = Math.max(1, parseInt(searchParams.get("page")     ?? "1", 10))
  const per_page = Math.min(100, parseInt(searchParams.get("per_page") ?? "20", 10))
  const from     = (page - 1) * per_page
  const to       = from + per_page - 1

  if (tipo === "sugestoes") {
    // Leads antigos com telefone problemático que receberam sugestão de substituição
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, motivo_higienizacao, telefone_sugerido, sugestao_origem_lista_id, listas(nome_arquivo, unidade, data_lista)",
        { count: "exact" }
      )
      .eq("sugestao_substituicao", true)
      .is("higienizado_em", null)
      .order("created_at", { ascending: false })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      tipo:     "sugestoes",
      leads:    data ?? [],
      total:    count ?? 0,
      page,
      per_page,
    })
  }

  // tipo === "pendentes" (default): leads com telefone problemático, sem correção e sem sugestão
  // Usa not.is.true em vez de eq.false para cobrir tanto false quanto null
  // (leads inseridos antes da migration ter DEFAULT false podem ter sugestao_substituicao = null)
  const { data, error, count } = await supabase
    .from("leads")
    .select(
      "id, nome, telefone_principal, motivo_higienizacao, listas(nome_arquivo, unidade, data_lista)",
      { count: "exact" }
    )
    .eq("precisa_higienizacao", true)
    .is("higienizado_em", null)
    .not("sugestao_substituicao", "is", true)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    tipo:     "pendentes",
    leads:    data ?? [],
    total:    count ?? 0,
    page,
    per_page,
  })
}

export async function PATCH(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  let body: { lead_id: string; acao: string; telefone_corrigido?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { lead_id, acao, telefone_corrigido } = body

  if (!lead_id || !acao) {
    return NextResponse.json({ error: "lead_id e acao são obrigatórios" }, { status: 400 })
  }

  // ── Resolver pendente ──────────────────────────────────────────────────────
  if (acao === "resolver") {
    if (!telefone_corrigido?.trim()) {
      return NextResponse.json({ error: "telefone_corrigido é obrigatório para ação 'resolver'" }, { status: 400 })
    }
    const { error } = await supabase
      .from("leads")
      .update({
        telefone_corrigido:   telefone_corrigido.trim(),
        telefone_principal:   telefone_corrigido.trim(),
        precisa_higienizacao: false,
        higienizado_em:       new Date().toISOString(),
      })
      .eq("id", lead_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, acao })
  }

  // ── Confirmar sugestão — atualiza telefone do lead antigo ─────────────────
  if (acao === "confirmar_sugestao") {
    const { data: lead, error: fetchErr } = await supabase
      .from("leads")
      .select("telefone_sugerido")
      .eq("id", lead_id)
      .single()

    if (fetchErr || !lead) {
      return NextResponse.json({ error: fetchErr?.message ?? "Lead não encontrado" }, { status: 404 })
    }
    if (!lead.telefone_sugerido) {
      return NextResponse.json({ error: "Lead não possui telefone_sugerido" }, { status: 400 })
    }

    const { error } = await supabase
      .from("leads")
      .update({
        telefone_corrigido:      lead.telefone_sugerido,
        telefone_principal:      lead.telefone_sugerido,
        precisa_higienizacao:    false,
        sugestao_substituicao:   false,
        higienizado_em:          new Date().toISOString(),
      })
      .eq("id", lead_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, acao })
  }

  // ── Ignorar sugestão — descarta a sugestão sem alterar telefone ──────────
  if (acao === "ignorar_sugestao") {
    const { error } = await supabase
      .from("leads")
      .update({
        sugestao_substituicao:    false,
        telefone_sugerido:        null,
        sugestao_origem_lista_id: null,
      })
      .eq("id", lead_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, acao })
  }

  return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 })
}
