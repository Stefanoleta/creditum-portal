import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import * as XLSX from "xlsx"

// GET /api/leads/higienizacao/export
// Retorna Excel com todos os leads pendentes de higienização.
// Colunas: Telefone, Nome, Unidade, Tipo de Lista, Data da Lista

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  // Coleta todos os pendentes (sem paginação — é para exportar tudo)
  const PAGE = 1000
  let offset = 0
  const rows: Array<{
    telefone: string
    nome: string
    unidade: string
    tipo_lista: string
    data_lista: string
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "nome, telefone_principal, listas!leads_lista_id_fkey(unidade, tipo_lista, data_lista)",
        { count: "planned" }
      )
      .eq("precisa_higienizacao", true)
      .is("higienizado_em", null)
      .not("sugestao_substituicao", "is", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break

    for (const lead of data) {
      const lista = lead.listas as { unidade?: string; tipo_lista?: string; data_lista?: string } | null
      rows.push({
        telefone:   lead.telefone_principal ?? "",
        nome:       lead.nome ?? "",
        unidade:    lista?.unidade    ?? "",
        tipo_lista: lista?.tipo_lista ?? "",
        data_lista: lista?.data_lista ?? "",
      })
    }

    if (data.length < PAGE) break
    offset += PAGE
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhum lead pendente de higienização" }, { status: 404 })
  }

  // Monta Excel
  const wsData = [
    ["Telefone", "Nome", "Unidade", "Tipo de Lista", "Data da Lista"],
    ...rows.map(r => [r.telefone, r.nome, r.unidade, r.tipo_lista, r.data_lista]),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, "Higienização")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const today  = new Date().toISOString().split("T")[0]
  const filename = `higienizacao-${today}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
