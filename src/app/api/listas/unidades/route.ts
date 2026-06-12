import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { normalizePhone } from "@/lib/lista-parser"

// GET /api/listas/unidades
// Retorna métricas por unidade para o Termômetro de Unidades.
// Score = 100 - (contatos_definitivos / total_leads * 100)
// Score 100 = nenhuma ligação definitiva; decresce à medida que contatos definitivos se acumulam.

export interface UnidadeMetrica {
  unidade:              string
  score:                number          // 0-100
  status:               "pronta" | "em_andamento" | "descanso"
  total_leads:          number
  contatos_definitivos: number
  qtd_listas:           number
  ultima_lista_em:      string
}

// Categorias de tabulacao_ia que encerram definitivamente o potencial do lead
// "não gostou" → nao_gostou_proposta
// "não tem interesse" → recusa_definitiva
// "já é aluno" → ja_resolveu
const DEFINITIVE_CATS = new Set(["nao_gostou_proposta", "recusa_definitiva", "ja_resolveu"])

function scoreStatus(score: number): "pronta" | "em_andamento" | "descanso" {
  if (score >= 70) return "pronta"
  if (score >= 40) return "em_andamento"
  return "descanso"
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ unidades: [], warning: "Supabase não configurado" })
  }

  // Busca todas as listas ordenadas por data (desc)
  const { data: listas, error: listasErr } = await supabase
    .from("listas")
    .select("id, unidade, data_lista, total_leads, uploaded_at")
    .order("data_lista", { ascending: false })

  if (listasErr) {
    return NextResponse.json({ error: listasErr.message }, { status: 500 })
  }

  if (!listas || listas.length === 0) {
    return NextResponse.json({ unidades: [] })
  }

  // Constrói índices por unidade
  const listasById          = new Map<string, string>()   // lista_id → unidade
  const totalLeadsByUnidade = new Map<string, number>()
  const qtdListasByUnidade  = new Map<string, number>()
  const ultimaListaByUnidade = new Map<string, string>()

  for (const lista of listas) {
    const u = lista.unidade ?? "(sem unidade)"
    listasById.set(lista.id, u)
    totalLeadsByUnidade.set(u, (totalLeadsByUnidade.get(u) ?? 0) + (lista.total_leads ?? 0))
    qtdListasByUnidade.set(u, (qtdListasByUnidade.get(u) ?? 0) + 1)
    if (!ultimaListaByUnidade.has(u)) {
      ultimaListaByUnidade.set(u, lista.data_lista ?? lista.uploaded_at?.split("T")[0] ?? "")
    }
  }

  // Busca análises com coaching_data (onde tabulacao_ia é armazenada)
  const { data: analyses } = await supabase
    .from("call_analyses")
    .select("coaching_data, pending_payload")
    .not("coaching_data", "is", null)

  // Extrai phones normalizados de análises definitivas (1 phone por Set = sem duplicatas por chamada)
  const definitivePhones = new Set<string>()

  for (const a of analyses ?? []) {
    const cd    = a.coaching_data as Record<string, unknown> | null
    const tabIa = cd?.tabulacao_ia as { categoria?: string } | null
    if (!tabIa?.categoria || !DEFINITIVE_CATS.has(tabIa.categoria)) continue

    let payload: Record<string, unknown> | null = null
    try { payload = a.pending_payload ? JSON.parse(a.pending_payload as string) : null } catch { continue }

    const rawPhone = (
      payload?.telefone ??
      (payload?.ligacaoRelevante as Record<string, unknown> | null)?.telefone ??
      null
    ) as string | null | undefined

    const normalized = normalizePhone(rawPhone)
    if (normalized) definitivePhones.add(normalized)
  }

  // Mapeia phones → unidade via leads table (deduplicado por lead_id)
  const definitivesByUnidade = new Map<string, number>()

  if (definitivePhones.size > 0) {
    const phonesArray = [...definitivePhones]
    const seenLeadIds = new Set<string>()
    const BATCH = 500

    for (let i = 0; i < phonesArray.length; i += BATCH) {
      const batch = phonesArray.slice(i, i + BATCH)

      const [{ data: byPrimary }, { data: bySecondary }] = await Promise.all([
        supabase
          .from("leads")
          .select("id, lista_id")
          .in("telefone_principal", batch),
        supabase
          .from("leads")
          .select("id, lista_id")
          .in("telefone_secundario", batch),
      ])

      for (const lead of [...(byPrimary ?? []), ...(bySecondary ?? [])]) {
        if (seenLeadIds.has(lead.id)) continue
        seenLeadIds.add(lead.id)
        const u = listasById.get(lead.lista_id)
        if (!u) continue
        definitivesByUnidade.set(u, (definitivesByUnidade.get(u) ?? 0) + 1)
      }
    }
  }

  // Compõe métricas por unidade
  const unidades: UnidadeMetrica[] = []

  for (const [unidade, totalLeads] of totalLeadsByUnidade.entries()) {
    const definitivos = definitivesByUnidade.get(unidade) ?? 0
    const score = totalLeads > 0
      ? Math.max(0, Math.round(100 - (definitivos / totalLeads * 100)))
      : 100

    unidades.push({
      unidade,
      score,
      status: scoreStatus(score),
      total_leads: totalLeads,
      contatos_definitivos: definitivos,
      qtd_listas: qtdListasByUnidade.get(unidade) ?? 0,
      ultima_lista_em: ultimaListaByUnidade.get(unidade) ?? "",
    })
  }

  // Ordena por score desc, desempate por nome
  unidades.sort((a, b) => b.score - a.score || a.unidade.localeCompare(b.unidade))

  return NextResponse.json({ unidades })
}
