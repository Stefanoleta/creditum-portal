import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import * as XLSX from "xlsx"
import { CATEGORIA_LABEL, type RecontatoCategoria } from "@/lib/recontato-classifier"

// GET /api/leads/recontatos/export
// Excel com todos os leads da fila do dia + horário sugerido por unidade.
// Columns: Nome, Telefone, Unidade, Tipo de Lista, Categoria Recontato, Agendado Para,
//          Melhor Dia Sugerido, Melhor Horário Sugerido
// Filename: recontatos-YYYY-MM-DD.xlsx

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const hoje = new Date().toISOString().split("T")[0]

  // ── Busca inteligência de horários ────────────────────────────────────────
  let inteligencia: Record<string, { melhor_dia: string; melhor_horario: string } | null> = {}
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const resp = await fetch(`${baseUrl}/api/listas/inteligencia-horarios`)
    if (resp.ok) inteligencia = await resp.json()
  } catch {
    // Se falhar, exporta sem sugestão de horário
  }

  // ── Busca todos os leads da fila do dia (sem paginação — exporta tudo) ───
  const PAGE = 1000
  let offset = 0
  const rows: Array<{
    nome: string
    telefone_principal: string | null
    recontato_em: string | null
    recontato_categoria: string | null
    listas: { unidade: string; tipo_lista: string } | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("leads")
      .select("nome, telefone_principal, recontato_em, recontato_categoria, listas!leads_lista_id_fkey(unidade, tipo_lista)")
      .eq("bloqueado", false)
      .lte("recontato_em", hoje)
      .not("recontato_em", "is", null)
      .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`)
      .order("recontato_em", { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error || !data || data.length === 0) break
    rows.push(...(data as unknown as typeof rows))
    if (data.length < PAGE) break
    offset += PAGE
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhum lead na fila do dia" }, { status: 404 })
  }

  // ── Monta Excel ────────────────────────────────────────────────────────────
  const header = [
    "Nome", "Telefone", "Unidade", "Tipo de Lista",
    "Categoria Recontato", "Agendado Para",
    "Melhor Dia Sugerido", "Melhor Horário Sugerido",
  ]
  const wsData = [
    header,
    ...rows.map(r => {
      const lista    = r.listas as { unidade?: string; tipo_lista?: string } | null
      const unidade  = lista?.unidade ?? ""
      const hint     = inteligencia[unidade]
      const catLabel = r.recontato_categoria
        ? (CATEGORIA_LABEL[r.recontato_categoria as RecontatoCategoria] ?? r.recontato_categoria)
        : ""
      return [
        r.nome,
        r.telefone_principal ?? "",
        unidade,
        lista?.tipo_lista ?? "",
        catLabel,
        r.recontato_em ?? "",
        hint?.melhor_dia ?? "—",
        hint?.melhor_horario ?? "—",
      ]
    }),
  ]

  const wb  = XLSX.utils.book_new()
  const ws  = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, "Recontatos")

  const buffer   = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const filename = `recontatos-${hoje}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
