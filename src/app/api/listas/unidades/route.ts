import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

// GET /api/listas/unidades
// Retorna métricas por unidade para o Termômetro de Unidades.
// Score 0-100: quanto maior, mais pronta a unidade está para nova abordagem.

export interface UnidadeMetrica {
  unidade: string
  score: number | null       // null = dados insuficientes (< 2 listas)
  status: "pronta" | "em_andamento" | "descanso" | "insuficiente"
  total_leads: number
  ultima_lista_em: string    // ISO date da lista mais recente
  dias_sem_nova_lista: number
  taxa_conversao: number | null  // qualificacoes / leads_abordados últimos 90d, ou null
  qtd_listas: number
}

const TODAY_MS = Date.now()

function daysSince(isoDate: string): number {
  return Math.floor((TODAY_MS - new Date(isoDate + "T00:00:00").getTime()) / 86_400_000)
}

function scoreStatus(score: number): "pronta" | "em_andamento" | "descanso" {
  if (score >= 70) return "pronta"
  if (score >= 40) return "em_andamento"
  return "descanso"
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ unidades: [], warning: "Supabase não configurado" })
  }

  // Busca todas as listas agrupando por unidade
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

  // Agrupa por unidade
  const porUnidade = new Map<string, typeof listas>()
  for (const lista of listas) {
    const u = lista.unidade ?? "(sem unidade)"
    if (!porUnidade.has(u)) porUnidade.set(u, [])
    porUnidade.get(u)!.push(lista)
  }

  // Total de leads por unidade nos últimos 30 dias (para velocidade de esgotamento)
  const hoje = new Date()
  const limite30 = new Date(hoje); limite30.setDate(hoje.getDate() - 30)
  const limite90 = new Date(hoje); limite90.setDate(hoje.getDate() - 90)

  // Busca leads abordados e qualificados (quando resultados_discador estiver populado)
  // Por ora, resultados_discador está vazio — taxa_conversao = null enquanto não há dados.
  // Usa total_leads das listas como proxy de "leads disponíveis".

  const unidades: UnidadeMetrica[] = []

  for (const [unidade, listasDaUnidade] of porUnidade.entries()) {
    const qtd_listas = listasDaUnidade.length
    const total_leads = listasDaUnidade.reduce((s, l) => s + (l.total_leads ?? 0), 0)

    // Data mais recente (listas já vêm ordenadas desc, primeira da unidade = mais recente)
    const ultima_lista_em = listasDaUnidade[0].data_lista ?? listasDaUnidade[0].uploaded_at?.split("T")[0] ?? ""
    const dias_sem_nova_lista = ultima_lista_em ? daysSince(ultima_lista_em) : 0

    // Dados insuficientes: menos de 2 listas da mesma unidade
    if (qtd_listas < 2) {
      unidades.push({
        unidade,
        score: null,
        status: "insuficiente",
        total_leads,
        ultima_lista_em,
        dias_sem_nova_lista,
        taxa_conversao: null,
        qtd_listas,
      })
      continue
    }

    // Velocidade de esgotamento = leads nos últimos 30 dias / total geral
    const leadsUlt30 = listasDaUnidade
      .filter(l => {
        const d = l.data_lista ?? l.uploaded_at?.split("T")[0] ?? ""
        return d >= limite30.toISOString().split("T")[0]
      })
      .reduce((s, l) => s + (l.total_leads ?? 0), 0)
    const velocidade_esgotamento = total_leads > 0 ? Math.min(1, leadsUlt30 / total_leads) : 0

    // Normaliza dias_descanso: 0 = ontem, 90+ = máximo
    const dias_norm = Math.min(1, dias_sem_nova_lista / 90)

    // Taxa de conversão: ainda sem dados reais → null
    const taxa_conversao: number | null = null
    const taxa_norm = taxa_conversao ?? 0

    // Leads disponíveis norm: total_leads normalizado contra max global (calculado abaixo)
    // Passamos o valor bruto; normalização global acontece após o loop.
    const score_raw = (dias_norm * 0.4) + (taxa_norm * 0.3) + (velocidade_esgotamento > 0 ? (1 - velocidade_esgotamento) : 0.5) * 0.1

    unidades.push({
      unidade,
      score: score_raw,   // temporário; normalizado abaixo
      status: "pronta",   // temporário
      total_leads,
      ultima_lista_em,
      dias_sem_nova_lista,
      taxa_conversao,
      qtd_listas,
    })
  }

  // Normaliza scores 0-100 entre as unidades com dados suficientes
  const comScore = unidades.filter(u => u.score !== null)
  if (comScore.length > 0) {
    const maxRaw = Math.max(...comScore.map(u => u.score as number))
    const minRaw = Math.min(...comScore.map(u => u.score as number))
    const range = maxRaw - minRaw || 1

    for (const u of comScore) {
      const s = u.score as number
      // leads_disponiveis_norm relativo ao máximo da unidade
      const leadsNorm = u.total_leads > 0
        ? (u.total_leads - Math.min(...comScore.map(x => x.total_leads))) /
          (Math.max(...comScore.map(x => x.total_leads)) - Math.min(...comScore.map(x => x.total_leads)) || 1)
        : 0

      const scoreComLeads = s + leadsNorm * 0.2
      const scoreNorm = Math.round(((scoreComLeads - minRaw) / (range + 0.2)) * 100)
      u.score = Math.max(0, Math.min(100, scoreNorm))
      u.status = scoreStatus(u.score)
    }
  }

  // Ordena: primeiro por score desc (insuficientes no final), depois por unidade
  unidades.sort((a, b) => {
    if (a.score === null && b.score === null) return a.unidade.localeCompare(b.unidade)
    if (a.score === null) return 1
    if (b.score === null) return -1
    return b.score - a.score
  })

  return NextResponse.json({ unidades })
}
