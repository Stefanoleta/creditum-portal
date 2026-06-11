import { NextResponse, type NextRequest } from "next/server"
import { after } from "next/server"
import {
  downloadAudioById,
  transcribeAudio,
  analyzeWithClaude,
  maskPhone,
  openaiClient,
} from "@/lib/call-analyzer"
import { saveAnalysis, updateAnalysis, supabase } from "@/lib/supabase-server"
import type { CallAnalysis } from "@/types/calls"
import type { ArgusTabulacaoItem } from "@/types/argus"

const BASE_URL    = process.env.ARGUS_BASE_URL
const TOKEN       = process.env.ARGUS_TOKEN
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")

async function fetchTabulacoes(ultimosMinutos: number): Promise<ArgusTabulacaoItem[]> {
  const res = await fetch(`${BASE_URL}/report/tabulacoesdetalhadas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Token-Signature": TOKEN! },
    body: JSON.stringify({ ultimosMinutos, idCampanha: CAMPAIGN_ID }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`tabulacoesdetalhadas HTTP ${res.status}`)
  const json = await res.json() as Record<string, unknown>
  const arr = json.itens ?? json.data ?? json.tabulacoes ?? []
  return arr as ArgusTabulacaoItem[]
}

async function processCallFromTab(tab: ArgusTabulacaoItem, idLigacao: string): Promise<"skip" | "ok" | "pending" | "failed"> {
  if (!supabase) return "skip"

  const call_id = `argus-${idLigacao}`
  const ligRel      = tab.ligacaoRelevante
  const leadDesligou = ligRel?.byeRecebido !== undefined && ligRel.byeRecebido !== ""
    ? true
    : ligRel?.byeEnviado !== undefined && ligRel.byeEnviado !== ""
    ? false
    : undefined

  const sdrName    = tab.usuarioOperador ?? "SDR"
  const phone      = maskPhone(tab.telefone)
  const durationSec = ligRel?.tempoSegundos ?? 0
  const startedAt  = tab.dataEvento
    ? new Date(tab.dataEvento).toISOString()
    : new Date().toISOString()
  const schoolName = `Campanha ${CAMPAIGN_ID}`

  // Check existing record
  const { data: existing } = await supabase
    .from("call_analyses")
    .select("call_id, status")
    .eq("call_id", call_id)
    .maybeSingle()

  if (existing?.status === "completed") return "skip"

  // ── Try to download audio ──────────────────────────────────────────────────
  let base64Audio: string
  let audioContentType = ""
  try {
    const dl = await downloadAudioById(idLigacao)
    base64Audio = dl.base64
    audioContentType = dl.contentType
  } catch {
    if (!existing) {
      // Save as pending so it can be retried later
      const pending: CallAnalysis = {
        call_id,
        sdr_name:    sdrName,
        sdr_id:      "",
        phone,
        school_name: schoolName,
        started_at:  startedAt,
        duration_seconds: durationSec,
        transcript:  "[Pendente — download do áudio falhou]",
        score: 0, tom: "neutro", resultado: "outros",
        tempo_resposta_inicial_segundos: 0,
        palavras_conversao: [], palavras_perda: [], objecoes: [],
        como_tratou_objecoes: "",
        pontos_positivos: [], pontos_negativos: ["Áudio indisponível"],
        analisado_em: new Date().toISOString(),
        source: "mock", data_source: "pending", status: "pendente",
        pending_payload: JSON.stringify(tab),
      }
      await saveAnalysis(pending)
    }
    return "pending"
  }

  // ── Transcribe ─────────────────────────────────────────────────────────────
  let transcript: string
  if (openaiClient) {
    try {
      transcript = await transcribeAudio(base64Audio, audioContentType)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      transcript = `[Transcrição falhou: ${msg}]`
    }
  } else {
    transcript = `[OPENAI_API_KEY não configurado. SDR: ${sdrName}]`
  }

  // ── Analyze with Claude ────────────────────────────────────────────────────
  try {
    const aiResult = await analyzeWithClaude({
      sdrName,
      schoolName,
      durationSeconds: durationSec,
      transcript,
      leadDesligou,
    })

    if (existing?.status === "pendente") {
      await updateAnalysis(call_id, {
        ...aiResult,
        transcript,
        source:          "ai",
        data_source:     "argus_real",
        status:          "completed",
        pending_payload: undefined,
      })
    } else {
      await saveAnalysis({
        call_id,
        sdr_name: sdrName, sdr_id: "",
        phone, school_name: schoolName,
        started_at: startedAt, duration_seconds: durationSec,
        transcript,
        ...aiResult,
        analisado_em: new Date().toISOString(),
        source:      "ai",
        data_source: "argus_real",
        status:      "completed",
      })
    }

    console.log(`[poll] ✓ ${call_id} score=${aiResult.score} lead_desligou=${leadDesligou}`)
    return "ok"
  } catch (err) {
    console.error(`[poll] ✗ ${call_id} análise falhou:`, err)
    return "failed"
  }
}

async function runPoll(ultimosMinutos: number) {
  if (!BASE_URL || !TOKEN) throw new Error("ARGUS não configurado")

  const tabs = await fetchTabulacoes(ultimosMinutos)

  // Deduplicate by idLigacao — keep last tabulação per call
  const byLigacao = new Map<string, ArgusTabulacaoItem>()
  for (const tab of tabs) {
    const idLigacao = String(tab.ligacaoRelevante?.idLigacao ?? "")
    if (idLigacao) byLigacao.set(idLigacao, tab)
  }

  let ok = 0, skipped = 0, pending = 0, failed = 0

  for (const [idLigacao, tab] of byLigacao) {
    const result = await processCallFromTab(tab, idLigacao)
    if      (result === "ok")      ok++
    else if (result === "skip")    skipped++
    else if (result === "pending") pending++
    else                           failed++
  }

  return { total: byLigacao.size, ok, skipped, pending, failed }
}

// POST /api/analyses/poll
// Body (optional): { ultimosMinutos?: number } — default 60
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { ultimosMinutos?: number }
  const ultimosMinutos = body.ultimosMinutos ?? 60

  after(async () => {
    try {
      const summary = await runPoll(ultimosMinutos)
      console.log("[poll] concluído:", summary)
    } catch (err) {
      console.error("[poll] erro inesperado:", err)
    }
  })

  return NextResponse.json({ ok: true, queued: true, ultimosMinutos }, { status: 202 })
}

// GET /api/analyses/poll?minutos=60 — runs synchronously and returns summary
export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const minutos = Number(new URL(req.url).searchParams.get("minutos") ?? "60")

  try {
    const summary = await runPoll(minutos)
    return NextResponse.json({ ...summary, updated_at: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 503 })
  }
}
