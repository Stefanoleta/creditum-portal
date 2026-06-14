import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { classifyRecontato } from "@/lib/recontato-classifier"

// GET /api/listas/inteligencia-horarios
// Analisa últimos 90 dias de ligações para identificar melhores horários por unidade.
// Requer mínimo de 20 ligações por unidade para gerar sugestão.

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const MIN_LIGACOES = 20

export interface InteligenciaHorario {
  melhor_dia:       string
  melhor_horario:   string
  taxa_atendimento: number
  baseado_em:       number
}

export type InteligenciaResponse = Record<string, InteligenciaHorario | null>

export async function GET() {
  if (!supabase) {
    return NextResponse.json({}, { status: 200 })
  }

  const noventa_dias_atras = new Date()
  noventa_dias_atras.setDate(noventa_dias_atras.getDate() - 90)

  const PAGE = 1000
  let offset = 0
  const allRows: Array<{
    data_ligacao: string
    hora_ligacao: number | null
    tabulacao:    string | null
    resultado_ligacao: string | null
    listas: { unidade: string } | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("resultados_discador")
      .select("data_ligacao, hora_ligacao, tabulacao, resultado_ligacao, listas!resultados_discador_lista_id_fkey(unidade)")
      .gte("data_ligacao", noventa_dias_atras.toISOString())
      .not("lista_id", "is", null)
      .range(offset, offset + PAGE - 1)

    if (error || !data || data.length === 0) break
    allRows.push(...(data as unknown as typeof allRows))
    if (data.length < PAGE) break
    offset += PAGE
  }

  if (allRows.length === 0) {
    return NextResponse.json({})
  }

  type BucketKey = `${number}-${number}`
  type Bucket = { total: number; atendidas: number }
  const byUnidade = new Map<string, Map<BucketKey, Bucket>>()

  for (const row of allRows) {
    const unidade = (row.listas as { unidade?: string } | null)?.unidade
    if (!unidade || !row.data_ligacao) continue

    const dt   = new Date(row.data_ligacao)
    const dow  = dt.getUTCDay()
    const hora = row.hora_ligacao ?? dt.getUTCHours()
    if (hora < 8 || hora > 18) continue

    const key: BucketKey = `${dow}-${hora}`
    if (!byUnidade.has(unidade)) byUnidade.set(unidade, new Map())
    const buckets = byUnidade.get(unidade)!
    const b = buckets.get(key) ?? { total: 0, atendidas: 0 }
    b.total++
    const categoria = classifyRecontato(row.tabulacao, row.resultado_ligacao)
    if (categoria !== "nao_atendeu" && categoria !== "nao_atendeu_multiplas") {
      b.atendidas++
    }
    buckets.set(key, b)
  }

  const result: InteligenciaResponse = {}

  for (const [unidade, buckets] of byUnidade) {
    let totalUnidade = 0
    for (const b of buckets.values()) totalUnidade += b.total

    if (totalUnidade < MIN_LIGACOES) {
      result[unidade] = null
      continue
    }

    const sorted = [...buckets.entries()]
      .map(([key, b]) => {
        const [dow, hora] = key.split("-").map(Number)
        return { dow, hora, taxa: b.atendidas / b.total, total: b.total }
      })
      .filter(b => b.total >= 5)
      .sort((a, b) => b.taxa - a.taxa)

    if (sorted.length === 0) {
      result[unidade] = null
      continue
    }

    const best = sorted[0]
    const sameDow = sorted.filter(b => b.dow === best.dow && b.taxa >= best.taxa * 0.8)
    const hours   = sameDow.map(b => b.hora).sort((a, b) => a - b)
    const horaInicio = hours[0]
    const horaFim    = hours[hours.length - 1] + 1

    result[unidade] = {
      melhor_dia:       DIAS_SEMANA[best.dow],
      melhor_horario:   `${horaInicio}h–${horaFim}h`,
      taxa_atendimento: Math.round(best.taxa * 100) / 100,
      baseado_em:       totalUnidade,
    }
  }

  return NextResponse.json(result)
}
