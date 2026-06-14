import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { CATEGORIA_LABEL, type RecontatoCategoria } from "@/lib/recontato-classifier"

export interface RecontatoGrupo {
  categoria:   RecontatoCategoria
  label:       string
  count:       number
  proxima_em:  string | null
}

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ grupos: [], warning: "Supabase não configurado" })
  }

  const { searchParams } = new URL(req.url)
  const mode     = searchParams.get("mode")
  const categoria = searchParams.get("categoria") as RecontatoCategoria | null
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const per_page  = Math.min(200, parseInt(searchParams.get("per_page") ?? "50", 10))
  const from      = (page - 1) * per_page
  const to        = from + per_page - 1

  const hoje = new Date().toISOString().split("T")[0]

  // ── mode=resumo: contagens para os 5 blocos do painel ──────────────────────
  if (mode === "resumo") {
    const [
      { count: agendadoFuturo },
      { count: prontosHoje },
      { count: emPausa },
      { count: bloqueados },
      { count: higienizacao },
    ] = await Promise.all([
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("bloqueado", false)
        .gt("recontato_em", hoje)
        .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("bloqueado", false)
        .lte("recontato_em", hoje)
        .not("recontato_em", "is", null)
        .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .gt("pausado_ate", hoje),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("bloqueado", true),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("precisa_higienizacao", true)
        .is("higienizado_em", null),
    ])
    return NextResponse.json({
      resumo: {
        agendado_futuro: agendadoFuturo ?? 0,
        prontos_hoje:    prontosHoje ?? 0,
        em_pausa:        emPausa ?? 0,
        bloqueados:      bloqueados ?? 0,
        higienizacao:    higienizacao ?? 0,
      }
    })
  }

  // ── mode=fila_do_dia: leads prontos para ligar hoje ─────────────────────────
  if (mode === "fila_do_dia") {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, recontato_em, recontato_categoria, recontato_tentativas, listas!leads_lista_id_fkey(unidade, tipo_lista)",
        { count: "exact" }
      )
      .eq("bloqueado", false)
      .lte("recontato_em", hoje)
      .not("recontato_em", "is", null)
      .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`)
      .order("recontato_categoria", { ascending: true, nullsFirst: false })
      .order("recontato_em", { ascending: true })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── mode=bloqueados: auditoria de bloqueios permanentes ─────────────────────
  if (mode === "bloqueados") {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, bloqueado_motivo, bloqueado_em, listas!leads_lista_id_fkey(unidade)",
        { count: "exact" }
      )
      .eq("bloqueado", true)
      .order("bloqueado_em", { ascending: false, nullsFirst: false })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── categoria específica (legado + backcompat) ──────────────────────────────
  if (categoria) {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, recontato_em, observacao, recontato_categoria, listas!leads_lista_id_fkey(nome_arquivo, unidade)",
        { count: "exact" }
      )
      .or(`observacao.eq.recontato:${categoria},recontato_categoria.eq.${categoria}`)
      .not("recontato_em", "is", null)
      .eq("bloqueado", false)
      .order("recontato_em", { ascending: true })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── Agrupamento por categoria (legado — mantido para backcompat) ────────────
  const CATEGORIAS: RecontatoCategoria[] = [
    "nao_atendeu", "nao_podia_falar", "mae_atendeu", "nao_gostou",
    "terceiro_nao_conhece", "fora_politica", "qualificado", "convertido", "outros",
    "ocupado_recontatar", "interessado_sem_fechar", "mae_familiar_atendeu",
    "nao_reconhece_aguardar", "objecao_financeira", "objecao_prazo",
    "nao_gostou_proposta", "ja_resolveu", "nao_atendeu_multiplas",
  ]

  const grupos: RecontatoGrupo[] = []
  for (const cat of CATEGORIAS) {
    const { count, data: primeiros } = await supabase
      .from("leads")
      .select("recontato_em", { count: "exact" })
      .or(`observacao.eq.recontato:${cat},recontato_categoria.eq.${cat}`)
      .not("recontato_em", "is", null)
      .eq("bloqueado", false)
      .order("recontato_em", { ascending: true })
      .limit(1)

    if (!count || count === 0) continue
    grupos.push({ categoria: cat, label: CATEGORIA_LABEL[cat], count, proxima_em: primeiros?.[0]?.recontato_em ?? null })
  }

  return NextResponse.json({ grupos })
}
