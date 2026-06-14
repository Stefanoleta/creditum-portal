import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

// DELETE /api/listas/[id]
// Remove todos os leads da lista e depois a lista em si.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: "ID da lista ausente" }, { status: 400 })
  }

  // Remove leads primeiro (FK constraint)
  const { count: deletedLeads, error: leadsErr } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .eq("lista_id", id)

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 })
  }

  // Remove a lista
  const { error: listaErr } = await supabase
    .from("listas")
    .delete()
    .eq("id", id)

  if (listaErr) {
    return NextResponse.json({ error: listaErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted_leads: deletedLeads ?? 0 })
}
