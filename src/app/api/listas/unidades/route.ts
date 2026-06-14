import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { normalizePhone, normalizeUnidade } from "@/lib/lista-parser"
import { classifyRecontato, type RecontatoCategoria } from "@/lib/recontato-classifier"

// GET /api/listas/unidades
// Retorna métricas por unidade para o Termômetro de Unidades.
// Score = 100 − (contatos_definitivos / total_leads × 100)
// total_leads = contagem ao vivo da tabela leads (não o campo armazenado em listas)

export interface UnidadeMetrica {
  unidade:              string
  score:                number          // 0–100
  status:               "pronta" | "em_andamento" | "descanso"
  total_leads:          number
  contatos_definitivos: number
  qtd_listas:           number
  ultima_lista_em:      string
}

// Categorias que encerram definitivamente o potencial do lead (via tabulação real Argus)
const DEFINITIVE_CATS    = new Set<RecontatoCategoria>(["nao_gostou", "fora_politica"])
// Número inválido: lead deve ser desconsiderado, mas não penaliza o score
const IGNORED_CATS       = new Set<RecontatoCategoria>(["numero_invalido"])
// Legado: categorias AI para calls analisadas antes desta versão (sem tabulacaoDesc em pending_payload)
const AI_DEFINITIVE_CATS = new Set(["nao_gostou_proposta", "recusa_definitiva", "ja_resolveu"])

function scoreStatus(score: number): "pronta" | "em_andamento" | "descanso" {
  if (score >= 70) return "pronta"
  if (score >= 40) return "em_andamento"
  return "descanso"
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ unidades: [], warning: "Supabase não configurado" })
  }

  // ── 1. Busca listas (metadados de unidade) ─────────────────────────────────

  const { data: listas, error: listasErr } = await supabase
    .from("listas")
    .select("id, unidade, data_lista, uploaded_at")
    .order("data_lista", { ascending: false })

  if (listasErr) {
    return NextResponse.json({ error: listasErr.message }, { status: 500 })
  }

  if (!listas || listas.length === 0) {
    return NextResponse.json({ unidades: [] })
  }

  // ── 2. Constrói índices por unidade normalizada ────────────────────────────

  const listasById           = new Map<string, string>()  // lista_id → unidade normalizada
  const qtdListasByUnidade   = new Map<string, number>()
  const ultimaListaByUnidade = new Map<string, string>()

  for (const lista of listas) {
    const u = normalizeUnidade(lista.unidade) ?? "(sem unidade)"
    listasById.set(lista.id, u)
    qtdListasByUnidade.set(u, (qtdListasByUnidade.get(u) ?? 0) + 1)
    if (!ultimaListaByUnidade.has(u)) {
      ultimaListaByUnidade.set(u, lista.data_lista ?? lista.uploaded_at?.split("T")[0] ?? "")
    }
  }

  // ── 3. Contagem ao vivo de leads por lista_id ──────────────────────────────
  // Evita depender de listas.total_leads (armazenado no momento do import — pode ser 0
  // se todos os leads eram duplicatas ou higienização naquele momento).
  // Paginação obrigatória: PostgREST limita respostas a 1000 linhas por padrão;
  // sem paginação a contagem fica truncada silenciosamente.

  const liveLeadCount = new Map<string, number>()
  const LEAD_PAGE = 1000
  let leadOffset = 0
  let totalLeadsFromDB = 0

  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from("leads")
      .select("lista_id")
      .range(leadOffset, leadOffset + LEAD_PAGE - 1)

    if (pageErr) {
      console.error("[termometro] erro ao buscar leads:", pageErr.message, "| offset:", leadOffset)
      break
    }
    if (!page || page.length === 0) break

    for (const row of page) {
      if (!row.lista_id) continue
      liveLeadCount.set(row.lista_id, (liveLeadCount.get(row.lista_id) ?? 0) + 1)
    }

    totalLeadsFromDB += page.length
    if (page.length < LEAD_PAGE) break
    leadOffset += LEAD_PAGE
  }

  // Diagnóstico: ajuda a depurar leads: 0
  const top5 = [...liveLeadCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  console.log(
    `[termometro] leads em DB: ${totalLeadsFromDB} | listas com leads: ${liveLeadCount.size}` +
    ` | top-5: ${top5.map(([id, n]) => `${id.slice(-8)}:${n}`).join(", ") || "(nenhum)"}`
  )
  console.log(
    `[termometro] lista_ids conhecidas (${listasById.size}):`,
    [...listasById.keys()].map(id => id.slice(-8)).join(", ")
  )

  // Agrega total_leads por unidade
  const totalLeadsByUnidade = new Map<string, number>()
  for (const [listaId, unidade] of listasById.entries()) {
    const cnt = liveLeadCount.get(listaId) ?? 0
    totalLeadsByUnidade.set(unidade, (totalLeadsByUnidade.get(unidade) ?? 0) + cnt)
  }

  // ── 4. Análises com tabulação definitiva ──────────────────────────────────
  // Fonte primária: tabulacaoDesc do Argus em pending_payload (armazenado em todos os
  // calls a partir desta versão). Fallback: coaching_data.tabulacao_ia (calls históricas
  // analisadas antes desta versão que não têm tabulacaoDesc em pending_payload).

  const { data: analyses } = await supabase
    .from("call_analyses")
    .select("pending_payload, coaching_data")

  const definitivePhones = new Set<string>()
  for (const a of analyses ?? []) {
    let payload: Record<string, unknown> | null = null
    try { payload = a.pending_payload ? JSON.parse(a.pending_payload as string) : null } catch { /* ignore */ }

    const tabulado = (payload?.tabulacaoDesc ?? "") as string
    let isDefinitive = false

    if (tabulado) {
      // Nova forma: tabulação real do Argus
      const cat = classifyRecontato(tabulado, null)
      if (IGNORED_CATS.has(cat)) continue
      isDefinitive = DEFINITIVE_CATS.has(cat)
    } else {
      // Legado: análise IA para calls sem tabulacaoDesc
      const cd    = a.coaching_data as Record<string, unknown> | null
      const tabIa = cd?.tabulacao_ia as { categoria?: string } | null
      isDefinitive = !!(tabIa?.categoria && AI_DEFINITIVE_CATS.has(tabIa.categoria))
    }

    if (!isDefinitive) continue

    const rawPhone = (
      payload?.telefone ??
      (payload?.ligacaoRelevante as Record<string, unknown> | null)?.telefone ??
      null
    ) as string | null | undefined

    const normalized = normalizePhone(rawPhone)
    if (normalized) definitivePhones.add(normalized)
  }

  // ── 5. Mapeia phones → unidade via leads table ─────────────────────────────

  const definitivesByUnidade = new Map<string, number>()

  if (definitivePhones.size > 0) {
    const phonesArray = [...definitivePhones]
    const seenLeadIds = new Set<string>()
    const BATCH = 500

    for (let i = 0; i < phonesArray.length; i += BATCH) {
      const batch = phonesArray.slice(i, i + BATCH)
      const [{ data: byPrimary }, { data: bySecondary }] = await Promise.all([
        supabase.from("leads").select("id, lista_id").in("telefone_principal", batch),
        supabase.from("leads").select("id, lista_id").in("telefone_secundario", batch),
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

  // ── 6. Compõe métricas ─────────────────────────────────────────────────────

  const unidades: UnidadeMetrica[] = []

  for (const [unidade, totalLeads] of totalLeadsByUnidade.entries()) {
    const definitivos = definitivesByUnidade.get(unidade) ?? 0
    const score = totalLeads > 0
      ? Math.max(0, Math.round(100 - (definitivos / totalLeads * 100)))
      : 100

    if (unidade.toLowerCase().includes("alecrim")) {
      console.log("[termometro] alecrim final:", { unidade, totalLeads, definitivos, score })
    }

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

  unidades.sort((a, b) => b.score - a.score || a.unidade.localeCompare(b.unidade))

  return NextResponse.json({ unidades })
}
