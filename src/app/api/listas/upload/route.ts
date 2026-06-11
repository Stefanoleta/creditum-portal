import { NextRequest, NextResponse } from "next/server"
import { parseLista } from "@/lib/lista-parser"
import { supabase } from "@/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const arquivo = form.get("arquivo")

    if (!arquivo || typeof arquivo === "string") {
      return NextResponse.json({ error: "Campo 'arquivo' obrigatório" }, { status: 400 })
    }

    const bytes = await arquivo.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = arquivo.name

    const { meta, leads } = parseLista(buffer, filename)

    if (!supabase) {
      // Sem Supabase configurado: retorna apenas o preview
      return NextResponse.json({
        lista_id: null,
        total_leads: meta.total,
        total_higienizacao: leads.filter(l => l.precisa_higienizacao).length,
        meta,
        preview: leads.slice(0, 5),
        warning: "Supabase não configurado — dados não foram salvos",
      })
    }

    // Valida que os campos obrigatórios foram fornecidos ou detectados
    const unidade    = (form.get("unidade")    as string | null) ?? meta.unidade
    const tipo_lista = (form.get("tipo_lista") as string | null) ?? meta.tipo_lista
    const data_lista = (form.get("data_lista") as string | null) ?? meta.data_lista

    if (!unidade || !tipo_lista || !data_lista) {
      return NextResponse.json({
        error: "Não foi possível detectar unidade, tipo_lista ou data_lista no nome do arquivo. Envie esses campos no form.",
        meta,
        preview: leads.slice(0, 10),
        total_higienizacao: leads.filter(l => l.precisa_higienizacao).length,
      }, { status: 422 })
    }

    // Insere a lista
    const { data: listaRow, error: listaErr } = await supabase
      .from("listas")
      .insert({
        nome_arquivo: filename,
        unidade,
        tipo_lista,
        data_lista,
        total_leads: meta.total,
        formato: meta.formato,
      })
      .select("id")
      .single()

    if (listaErr || !listaRow) {
      console.error("[listas/upload] insert lista:", listaErr?.message)
      return NextResponse.json({ error: "Erro ao salvar lista", detail: listaErr?.message }, { status: 500 })
    }

    const lista_id = listaRow.id

    // Insere leads em lotes de 200 para evitar timeout
    const BATCH = 200
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH).map(l => ({ ...l, lista_id }))
      const { error: leadsErr } = await supabase.from("leads").insert(batch)
      if (leadsErr) {
        console.error("[listas/upload] insert leads batch:", leadsErr.message)
        return NextResponse.json({ error: "Erro ao salvar leads", detail: leadsErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      lista_id,
      total_leads: meta.total,
      total_higienizacao: leads.filter(l => l.precisa_higienizacao).length,
      meta,
      preview: leads.slice(0, 5),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[listas/upload]", msg)
    return NextResponse.json({ error: "Erro interno", detail: msg }, { status: 500 })
  }
}
