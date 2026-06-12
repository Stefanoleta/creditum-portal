import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { normalizePhone } from "@/lib/lista-parser"
import { classifyRecontato, calcRecontatoEm } from "@/lib/recontato-classifier"
import { extractArray } from "@/lib/argus-adapter"
import type { ArgusLigacaoItem } from "@/types/argus"

// POST /api/listas/backfill
// Busca ligacoesdetalhadas dos últimos 30 dias e cruza com leads no banco.
// Idempotente: usa id_ligacao_argus como chave única (ON CONFLICT DO NOTHING).
// Retorna: { total, cruzados, nao_cruzados, ignorados }

const BASE_URL    = process.env.ARGUS_BASE_URL!
const TOKEN       = process.env.ARGUS_TOKEN!
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")

async function argusPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Token-Signature": TOKEN },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Argus ${endpoint} → HTTP ${res.status}`)
  const json = await res.json()
  if (json?.codStatus < 0) throw new Error(`Argus ${endpoint} → ${json.descStatus}`)
  return json as T
}

function buildIdLigacao(item: ArgusLigacaoItem, fallbackIdx: number): string {
  if (item.idLigacao) return String(item.idLigacao)
  if (item.nrLead)    return `nrlead-${item.nrLead}`
  // Fallback composto: telefone + timestamp para evitar colisões
  const tel = normalizePhone(item.telefone) ?? "semtel"
  const ts  = item.dataHoraLigacao ?? item.dataHora ?? `idx-${fallbackIdx}`
  return `comp-${tel}-${ts}`
}

export async function POST(req: NextRequest) {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: "ARGUS_BASE_URL ou ARGUS_TOKEN não configurados" }, { status: 500 })
  }
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  // Opcionalmente aceita { dias: 30 } no body para controlar janela
  let dias = 30
  try {
    const body = await req.json().catch(() => ({}))
    if (body.dias && typeof body.dias === "number") dias = Math.min(90, Math.max(1, body.dias))
  } catch { /* usa default */ }

  // Monta período sem timezone (Argus rejeita "Z" no final)
  // Formato esperado: "YYYY-MM-DDTHH:mm:ss"
  function toArgusDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const fim    = new Date()
  const inicio = new Date(fim)
  inicio.setDate(inicio.getDate() - dias)
  inicio.setHours(0, 0, 0, 0)

  let ligacoesItems: ArgusLigacaoItem[] = []

  try {
    const raw = await argusPost("report/ligacoesdetalhadas", {
      IdCampanha:     CAMPAIGN_ID,
      periodoInicial: toArgusDate(inicio),
      periodoFinal:   toArgusDate(fim),
    })
    ligacoesItems = extractArray<ArgusLigacaoItem>(raw as Record<string, unknown>, [
      "ligacoesDetalhadas", "itens", "data", "ligacoes", "chamadas",
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Argus inacessível: ${msg}` }, { status: 502 })
  }

  if (ligacoesItems.length === 0) {
    return NextResponse.json({ total: 0, cruzados: 0, nao_cruzados: 0, ignorados: 0 })
  }

  // Coleta todos os telefones normalizados para busca em batch
  const telefonesSet = new Set<string>()
  for (const item of ligacoesItems) {
    const tel = normalizePhone(item.telefone ?? item.numero ?? item.numeroDiscado)
    if (tel) telefonesSet.add(tel)
  }

  // Busca leads no banco pelos telefones
  const telefones = Array.from(telefonesSet)
  const leadByTelefone = new Map<string, string>() // telefone → lead_id

  if (telefones.length > 0) {
    const { data: leadsRows } = await supabase
      .from("leads")
      .select("id, telefone_principal")
      .in("telefone_principal", telefones)

    for (const row of leadsRows ?? []) {
      if (row.telefone_principal && !leadByTelefone.has(row.telefone_principal)) {
        leadByTelefone.set(row.telefone_principal, row.id)
      }
    }
  }

  // Busca IDs já existentes para ignorar duplicatas
  const idsNovos = ligacoesItems.map((item, i) => buildIdLigacao(item, i))
  const { data: existentes } = await supabase
    .from("resultados_discador")
    .select("id_ligacao_argus")
    .in("id_ligacao_argus", idsNovos)

  const existentesSet = new Set((existentes ?? []).map(r => r.id_ligacao_argus))

  let cruzados     = 0
  let nao_cruzados = 0
  let ignorados    = 0

  const BATCH = 100

  // Processa em lotes para não ultrapassar limites
  for (let start = 0; start < ligacoesItems.length; start += BATCH) {
    const slice = ligacoesItems.slice(start, start + BATCH)
    const rows = []

    for (let i = 0; i < slice.length; i++) {
      const item  = slice[i]
      const idLig = buildIdLigacao(item, start + i)

      if (existentesSet.has(idLig)) { ignorados++; continue }

      const telefone = normalizePhone(item.telefone ?? item.numero ?? item.numeroDiscado)
      const lead_id  = telefone ? (leadByTelefone.get(telefone) ?? null) : null

      const tabulacao        = item.tabulacao ?? null
      const resultadoLigacao = item.resultadoLigacao ?? null

      rows.push({
        id_ligacao_argus:  idLig,
        lead_id,
        campanha_argus:    item.lote ?? item.campanha ?? null,
        data_ligacao:      item.dataHoraLigacao ?? item.dataHora ?? null,
        hora_ligacao:      item.dataHoraLigacao
          ? new Date(item.dataHoraLigacao).getHours()
          : null,
        duracao_segundos:  item.tempoSegundos ?? item.duracao ?? null,
        tabulacao,
        sdr_nome:          item.usuarioOperador ?? item.nomeAgente ?? null,
        converteu:         false,
        nome_cliente:      item.nomeCliente ?? null,
        nr_lead_argus:     item.nrLead ?? null,
        lote_argus:        item.lote ?? null,
        resultado_ligacao: resultadoLigacao,
        telefone_discado:  telefone,
        usuario_operador:  item.usuarioOperador ?? null,
      })

      if (lead_id) cruzados++; else nao_cruzados++
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("resultados_discador")
        .insert(rows)

      if (error) {
        console.error("[backfill] insert error:", error.message)
      }
    }

    // Atualiza leads cruzados com categoria de recontato
    const paraAtualizar = rows.filter(r => r.lead_id)
    for (const r of paraAtualizar) {
      const categoria    = classifyRecontato(r.tabulacao, r.resultado_ligacao)
      const recontato_em = calcRecontatoEm(categoria)

      await supabase
        .from("leads")
        .update({
          recontato_em,
          observacao: `recontato:${categoria}`,
        })
        .eq("id", r.lead_id!)
    }
  }

  const total = cruzados + nao_cruzados + ignorados

  console.log(`[backfill] total=${total} cruzados=${cruzados} nao_cruzados=${nao_cruzados} ignorados=${ignorados}`)

  return NextResponse.json({ total, cruzados, nao_cruzados, ignorados })
}
