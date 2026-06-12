import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { CATEGORIA_LABEL, type RecontatoCategoria } from "@/lib/recontato-classifier"

// GET /api/leads/recontatos
// Retorna leads agrupados por categoria de recontato para a aba Recontatos.
// Só inclui leads com observacao like 'recontato:%' e recontato_em >= hoje.

// GET /api/leads/recontatos?categoria=nao_atendeu&page=1&per_page=50
// Retorna leads de uma categoria específica (para exibição/exportação).

export interface RecontatoGrupo {
  categoria:   RecontatoCategoria
  label:       string
  count:       number
  proxima_em:  string | null  // menor recontato_em do grupo
}

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ grupos: [], warning: "Supabase não configurado" })
  }

  const { searchParams } = new URL(req.url)
  const categoria = searchParams.get("categoria") as RecontatoCategoria | null
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const per_page  = Math.min(200, parseInt(searchParams.get("per_page") ?? "50", 10))
  const from      = (page - 1) * per_page
  const to        = from + per_page - 1

  const hoje = new Date().toISOString().split("T")[0]

  // ── Retorna lista de leads de uma categoria específica ─────────────────────
  if (categoria) {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, recontato_em, observacao, listas!leads_lista_id_fkey(nome_arquivo, unidade)",
        { count: "exact" }
      )
      .eq("observacao", `recontato:${categoria}`)
      .not("recontato_em", "is", null)
      .order("recontato_em", { ascending: true })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── Retorna agrupamento por categoria ──────────────────────────────────────
  const CATEGORIAS: RecontatoCategoria[] = [
    "nao_atendeu",
    "nao_podia_falar",
    "mae_atendeu",
    "nao_gostou",
    "terceiro_nao_conhece",
    "fora_politica",
    "qualificado",
    "convertido",
    "outros",
  ]

  const grupos: RecontatoGrupo[] = []

  for (const cat of CATEGORIAS) {
    const { count, data: primeiros } = await supabase
      .from("leads")
      .select("recontato_em", { count: "exact" })
      .eq("observacao", `recontato:${cat}`)
      .not("recontato_em", "is", null)
      .order("recontato_em", { ascending: true })
      .limit(1)

    if (!count || count === 0) continue

    grupos.push({
      categoria:  cat,
      label:      CATEGORIA_LABEL[cat],
      count,
      proxima_em: primeiros?.[0]?.recontato_em ?? null,
    })
  }

  // Conta também leads com recontato_em definido mas sem categoria (legado)
  const { count: legadoCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("recontato_em", "is", null)
    .is("observacao", null)

  if (legadoCount && legadoCount > 0) {
    grupos.push({
      categoria:  "outros",
      label:      `${CATEGORIA_LABEL["outros"]} (sem categoria)`,
      count:      legadoCount,
      proxima_em: hoje,
    })
  }

  return NextResponse.json({ grupos })
}
