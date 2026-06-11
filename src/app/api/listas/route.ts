import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ listas: [], warning: "Supabase não configurado" })
  }

  const { data, error } = await supabase
    .from("listas")
    .select("id, nome_arquivo, unidade, tipo_lista, data_lista, total_leads, formato, uploaded_at, status")
    .order("uploaded_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[listas] GET:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listas: data ?? [] })
}
