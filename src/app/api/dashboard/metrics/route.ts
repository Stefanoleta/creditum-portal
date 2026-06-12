import { NextResponse, after } from "next/server"
import {
  adaptSDRs,
  adaptLiveCalls,
  adaptTabulacoes,
  buildMetrics,
  extractArray,
  getVendasAllowlist,
} from "@/lib/argus-adapter"
import { generateMockDashboard } from "@/lib/mock-data"
import { supabase, saveAnalysis } from "@/lib/supabase-server"
import { maskPhone } from "@/lib/call-analyzer"
import { normalizePhone } from "@/lib/lista-parser"
import { classifyRecontato, calcRecontatoEm } from "@/lib/recontato-classifier"
import type {
  ArgusDesempenhoItem,
  ArgusLigacaoItem,
  ArgusTabulacaoItem,
} from "@/types/argus"
import type { HourlyMetric, Objection, Occurrence } from "@/types/dashboard"
import type { CallAnalysis } from "@/types/calls"

const BASE_URL    = process.env.ARGUS_BASE_URL!
const TOKEN       = process.env.ARGUS_TOKEN!
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")
const VENDAS_LIST = getVendasAllowlist(process.env.ARGUS_SDR_ALLOWLIST)

async function argusPost<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Token-Signature": TOKEN,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Argus ${endpoint} → HTTP ${res.status}: ${body.slice(0, 400)}`)
  }

  const json = await res.json()

  if (json?.codStatus < 0) {
    throw new Error(`Argus ${endpoint} → ${json.descStatus ?? "erro desconhecido"}`)
  }

  return json as T
}

// tabulacoesdetalhadas requires idCampanha — degrade gracefully if unavailable.
async function fetchTabulacoes(campaignId: number): Promise<{
  objections: Objection[]
  occurrences: Occurrence[]
  total_conversoes: number
  tabulacoes_source: "argus" | "mock"
  rawItems: ArgusTabulacaoItem[]
}> {
  try {
    const raw = await argusPost("report/tabulacoesdetalhadas", {
      ultimosMinutos: 480,
      idCampanha: campaignId,
    })
    const items = extractArray<ArgusTabulacaoItem>(raw, [
      "itens", "data", "tabulacoes", "resultados", "tabulacoesDetalhadas",
    ])
    return { ...adaptTabulacoes(items), tabulacoes_source: "argus", rawItems: items }
  } catch {
    console.warn("[dashboard/metrics] tabulacoesdetalhadas indisponível — usando mock")
    const mock = generateMockDashboard()
    return {
      objections: mock.top_objections,
      occurrences: mock.occurrences,
      total_conversoes: mock.metrics.total_conversoes,
      tabulacoes_source: "mock",
      rawItems: [],
    }
  }
}

/**
 * Builds the hourly chart from real call timestamps.
 * Groups ligacoesItems by hour of dataHoraLigacao.
 * Uses tabulacaoItems.dataEvento to count per-hour conversions.
 * Returns source="empty" (all-zero chart) if no timestamps are found.
 */
function buildHourlyChartFromCalls(
  ligacoesItems: ArgusLigacaoItem[],
  tabulacaoItems: ArgusTabulacaoItem[] = []
): { chart: HourlyMetric[]; source: "from_calls" | "empty" } {
  const hourMap = new Map<number, { ligacoes: number; contatos: number; conversoes: number }>()

  for (const item of ligacoesItems) {
    const startStr = item.dataHoraLigacao ?? item.dataHora ?? item.horarioInicio ?? item.inicio
    if (!startStr) continue
    const date = new Date(startStr)
    if (isNaN(date.getTime())) continue
    const h = date.getHours()
    const entry = hourMap.get(h) ?? { ligacoes: 0, contatos: 0, conversoes: 0 }
    entry.ligacoes++
    if (item.resultadoLigacao?.toUpperCase() === "ATENDIMENTO") entry.contatos++
    hourMap.set(h, entry)
  }

  // Cross-reference tabulacoes with dataEvento for per-hour conversion counts
  for (const tab of tabulacaoItems) {
    if (!tab.dataEvento) continue
    const date = new Date(tab.dataEvento)
    if (isNaN(date.getTime())) continue
    const h = date.getHours()
    const entry = hourMap.get(h)
    if (!entry) continue
    const tabuladoUpper = (tab.tabulado ?? tab.tabulacao ?? "").toUpperCase()
    const categoriaUpper = (tab.categoriaTabulacao ?? "").toUpperCase()
    const isConversao =
      tabuladoUpper.startsWith("PROPOSTA ENVIADA") ||
      categoriaUpper === "SUCESSO"
    if (isConversao) entry.conversoes++
  }

  if (hourMap.size === 0) {
    return { chart: [], source: "empty" }
  }

  const hours = Array.from(hourMap.keys()).sort((a, b) => a - b)
  return {
    chart: hours.map((h) => ({
      hora: `${String(h).padStart(2, "0")}h`,
      ligacoes: hourMap.get(h)!.ligacoes,
      contatos: hourMap.get(h)!.contatos,
      conversoes: hourMap.get(h)!.conversoes,
    })),
    source: "from_calls",
  }
}

async function createPendingRecords(
  tabulacaoItems: ArgusTabulacaoItem[],
  campaignId: number
): Promise<void> {
  if (!supabase) return

  // Deduplicate by idLigacao — keep last tabulação per call
  const byLigacao = new Map<string, ArgusTabulacaoItem>()
  for (const tab of tabulacaoItems) {
    const id = String(tab.ligacaoRelevante?.idLigacao ?? "")
    if (id) byLigacao.set(id, tab)
  }
  if (byLigacao.size === 0) return

  const callIds = Array.from(byLigacao.keys()).map((id) => `argus-${id}`)

  // Batch-check which already exist in Supabase
  const { data: existing } = await supabase
    .from("call_analyses")
    .select("call_id")
    .in("call_id", callIds)
  const existingSet = new Set((existing ?? []).map((r) => r.call_id as string))

  for (const [idLigacao, tab] of byLigacao) {
    const call_id = `argus-${idLigacao}`
    if (existingSet.has(call_id)) continue

    const pending: CallAnalysis = {
      call_id,
      sdr_name:         tab.usuarioOperador ?? "SDR",
      sdr_id:           String(tab.idUsuario ?? ""),
      phone:            maskPhone(tab.telefone ?? tab.ligacaoRelevante?.telefone),
      school_name:      `Campanha ${campaignId}`,
      started_at:       tab.dataEvento
        ? new Date(tab.dataEvento).toISOString()
        : new Date().toISOString(),
      duration_seconds: tab.ligacaoRelevante?.tempoSegundos ?? 0,
      transcript:       "[Pendente — aguardando processamento]",
      score: 0, tom: "neutro", resultado: "outros",
      tempo_resposta_inicial_segundos: 0,
      palavras_conversao: [], palavras_perda: [], objecoes: [],
      como_tratou_objecoes: "",
      pontos_positivos: [], pontos_negativos: [],
      analisado_em:    new Date().toISOString(),
      source:          "mock",
      data_source:     "pending",
      status:          "pendente",
      pending_payload: JSON.stringify(tab),
    }

    await saveAnalysis(pending)
    console.log(`[metrics] pending criado: ${call_id}`)
  }
}

// ── Salva ligacoesdetalhadas em resultados_discador (fire-and-forget) ──────────
// Chamado via after() para não bloquear a resposta ao cliente.
// Idempotente: ligações já salvas são ignoradas por ON CONFLICT.
async function saveResultadosDiscador(ligacoesItems: ArgusLigacaoItem[]) {
  if (!supabase || ligacoesItems.length === 0) return

  try {
    // Coleta telefones para buscar leads em batch
    const telefonesSet = new Set<string>()
    for (const item of ligacoesItems) {
      const tel = normalizePhone(item.telefone ?? item.numero ?? item.numeroDiscado)
      if (tel) telefonesSet.add(tel)
    }

    const leadByTelefone = new Map<string, string>()
    if (telefonesSet.size > 0) {
      const { data: leadsRows } = await supabase
        .from("leads")
        .select("id, telefone_principal")
        .in("telefone_principal", Array.from(telefonesSet))
      for (const row of leadsRows ?? []) {
        if (row.telefone_principal && !leadByTelefone.has(row.telefone_principal)) {
          leadByTelefone.set(row.telefone_principal, row.id)
        }
      }
    }

    // Monta os registros — usa upsert com ignoreSomethingConflict não disponível nesta versão,
    // então insere individualmente ignorando erros de duplicata por id_ligacao_argus.
    const rows = ligacoesItems
      .filter(item => item.idLigacao || item.nrLead)  // só processa itens com ID identificável
      .map((item, i) => {
        const idLig     = item.idLigacao ? String(item.idLigacao) : `nrlead-${item.nrLead}`
        const telefone  = normalizePhone(item.telefone ?? item.numero ?? item.numeroDiscado)
        const lead_id   = telefone ? (leadByTelefone.get(telefone) ?? null) : null
        return {
          id_ligacao_argus:  idLig,
          lead_id,
          campanha_argus:    item.lote ?? item.campanha ?? null,
          data_ligacao:      item.dataHoraLigacao ?? item.dataHora ?? null,
          hora_ligacao:      item.dataHoraLigacao ? new Date(item.dataHoraLigacao).getHours() : null,
          duracao_segundos:  item.tempoSegundos ?? item.duracao ?? null,
          tabulacao:         item.tabulacao ?? null,
          sdr_nome:          item.usuarioOperador ?? item.nomeAgente ?? null,
          converteu:         false,
          nome_cliente:      item.nomeCliente ?? null,
          nr_lead_argus:     item.nrLead ?? null,
          lote_argus:        item.lote ?? null,
          resultado_ligacao: item.resultadoLigacao ?? null,
          telefone_discado:  telefone,
          usuario_operador:  item.usuarioOperador ?? null,
          _i: i, // descartado abaixo
        }
      })
      .map(({ _i: _, ...r }) => r)

    if (rows.length === 0) return

    const BATCH = 50
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from("resultados_discador")
        .upsert(rows.slice(i, i + BATCH), { onConflict: "id_ligacao_argus" })
      if (error) console.error("[metrics/saveResultados] upsert:", error.message)
    }

    // Atualiza recontato nos leads cruzados com base na tabulação mais recente
    const comLead = rows.filter(r => r.lead_id)
    for (const r of comLead) {
      const categoria    = classifyRecontato(r.tabulacao, r.resultado_ligacao)
      const recontato_em = calcRecontatoEm(categoria)
      await supabase
        .from("leads")
        .update({ recontato_em, observacao: `recontato:${categoria}` })
        .eq("id", r.lead_id!)
    }

    if (rows.length > 0) {
      console.log(`[metrics/saveResultados] ${rows.length} registros upserted — ${comLead.length} leads cruzados`)
    }
  } catch (err) {
    console.error("[metrics/saveResultados] erro:", err instanceof Error ? err.message : err)
  }
}

// ── Per-SDR quality metrics from tabulacoesdetalhadas ────────────────────────

function buildSdrQuality(items: ArgusTabulacaoItem[]) {
  type Entry = { tabulou: number; cliente_desligou: number }
  const map = new Map<string, Entry>()
  for (const item of items) {
    if ((item.origemTabulacao ?? "").toUpperCase().includes("DISCADOR")) continue
    const op = (item.usuarioOperador ?? "").toUpperCase().trim()
    if (!op || op === "DISCADOR") continue
    if (!map.has(op)) map.set(op, { tabulou: 0, cliente_desligou: 0 })
    const e = map.get(op)!
    e.tabulou++
    if ((item.tabulado ?? "").toUpperCase().includes("CLIENTE DESLIGOU")) e.cliente_desligou++
  }
  return map
}

function lookupSdrQuality(name: string, map: ReturnType<typeof buildSdrQuality>) {
  const upper = name.toUpperCase().trim()
  if (map.has(upper)) return map.get(upper)!
  const firstName = upper.split(" ")[0]
  if (firstName.length > 2) {
    for (const [key, val] of map) {
      if (key.includes(firstName)) return val
    }
  }
  return { tabulou: 0, cliente_desligou: 0 }
}

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(
      { error: "ARGUS_BASE_URL ou ARGUS_TOKEN não configurados" },
      { status: 500 }
    )
  }

  try {
    // desempenhoresumido + ligacoesdetalhadas are required — if either fails, full mock fallback.
    // tabulacoesdetalhadas is optional — degrades gracefully to mock objections/occurrences.
    const [rawDesempenho, rawLigacoes] = await Promise.all([
      argusPost("report/desempenhoresumido", { ultimosMinutos: 480 }),
      argusPost("report/ligacoesdetalhadas", { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
    ])

    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const ligacoesItems = extractArray<ArgusLigacaoItem>(rawLigacoes, [
      "ligacoesDetalhadas", "itens", "data", "ligacoes", "chamadas",
    ])

    // attended = calls where the lead picked up (resultadoLigacao "ATENDIMENTO")
    const totalAtendidas = ligacoesItems.filter((i) => i.resultadoLigacao?.toUpperCase() === "ATENDIMENTO").length

    // Try tabulações independently — won't throw even if unavailable
    const { objections, occurrences, total_conversoes, tabulacoes_source, rawItems: tabulacaoItems } =
      await fetchTabulacoes(CAMPAIGN_ID)

    const sdrs      = adaptSDRs(desempenhoItems, VENDAS_LIST)
    const liveCalls = adaptLiveCalls(ligacoesItems, VENDAS_LIST)

    // totalDiscadas: prefer SDR realizadas sum (desempenhoresumido includes unanswered calls).
    // ligacoesdetalhadas may only return attended calls in this Argus config,
    // which makes length === totalAtendidas and produces taxa_contato=100%.
    const totalDiscadasFromSDR = sdrs.reduce((s, r) => s + r.ligacoes_realizadas, 0)
    const totalDiscadas = totalDiscadasFromSDR > totalAtendidas
      ? totalDiscadasFromSDR   // desempenho returned real discadas count
      : ligacoesItems.length   // fallback: count all ligacoes records

    const metrics = buildMetrics(sdrs, liveCalls, total_conversoes, totalDiscadas, totalAtendidas)

    // Enrich SDRs with per-operator quality metrics from tabulacoesdetalhadas
    // nao_tabulou = ligacoes_atendidas (desempenho) - tabulacoes do operador (tabulacoesdetalhadas)
    // origemTabulacao=DISCADOR registros não têm SDR identificável, por isso usamos a diferença
    const sdrQualityMap = buildSdrQuality(tabulacaoItems)

    // [DEBUG] log temporário — remover após confirmar match de nomes
    const tabOps = [...new Set(tabulacaoItems.map(t => (t.usuarioOperador ?? "").trim()).filter(Boolean))]
    console.log("[metrics/debug] usuarioOperador em tabulacoes:", tabOps)
    console.log("[metrics/debug] origemTabulacao valores:", [...new Set(tabulacaoItems.map(t => t.origemTabulacao ?? "(undefined)"))])
    console.log("[metrics/debug] SDRs do desempenho:", sdrs.map(s => s.name))
    console.log("[metrics/debug] sdrQualityMap:", Object.fromEntries(sdrQualityMap))

    const enrichedSdrs = sdrs.map(sdr => {
      const q          = lookupSdrQuality(sdr.name, sdrQualityMap)
      const atendidas  = sdr.ligacoes_atendidas
      const nao_tabulou = Math.max(0, atendidas - q.tabulou)
      const total       = nao_tabulou + q.tabulou
      return {
        ...sdr,
        pct_nao_tabulou:      total     > 0 ? Math.round((nao_tabulou        / total)     * 1000) / 10 : 0,
        pct_cliente_desligou: q.tabulou > 0 ? Math.round((q.cliente_desligou / q.tabulou) * 1000) / 10 : 0,
      }
    })

    // Build hourly chart from real call timestamps — no fake uniform distribution
    const { chart: hourlyChart, source: hourlySource } = buildHourlyChartFromCalls(
      ligacoesItems,
      tabulacaoItems
    )

    // Fire-and-forget: create pending records for calls seen in tabulacoesdetalhadas
    // that don't yet have an analysis in Supabase.
    after(() => createPendingRecords(tabulacaoItems, CAMPAIGN_ID))
    after(() => saveResultadosDiscador(ligacoesItems))

    return NextResponse.json({
      metrics,
      sdrs: enrichedSdrs,
      live_calls: liveCalls,
      top_objections: objections,
      occurrences,
      hourly_chart: hourlyChart,
      hourly_source: hourlySource,
      last_updated: new Date().toISOString(),
      source: "argus",
      tabulacoes_source,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[dashboard/metrics] Argus error — falling back to mock:", message)

    const mock = generateMockDashboard()
    return NextResponse.json(
      { ...mock, source: "mock", fallback_reason: message },
      { status: 200 }
    )
  }
}
