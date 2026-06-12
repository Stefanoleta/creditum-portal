import { NextResponse, type NextRequest } from "next/server"
import {
  downloadAudioById,
  transcribeAudio,
  analyzeWithClaude,
  openaiClient,
} from "@/lib/call-analyzer"
import {
  fetchPendingAnalyses,
  updateAnalysis,
  applyTabulacaoIaToLead,
  supabase,
} from "@/lib/supabase-server"

const CRON_SECRET  = process.env.CRON_SECRET
const MAX_PER_RUN  = 10

export async function GET(req: NextRequest) {
  // Security: require Authorization: Bearer <CRON_SECRET>
  if (!CRON_SECRET) {
    console.error("[cron/analyze] CRON_SECRET não configurado")
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 401 })
  }

  const authHeader = req.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const startedAt = Date.now()

  // Fetch oldest pending first, cap at MAX_PER_RUN
  const { data: pendingRows, error: fetchError } = await supabase
    .from("call_analyses")
    .select("*")
    .eq("status", "pendente")
    .order("started_at", { ascending: true })
    .limit(MAX_PER_RUN)

  if (fetchError) {
    console.error("[cron/analyze] Erro ao buscar pendentes:", fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const pending = pendingRows ?? []

  if (pending.length === 0) {
    return NextResponse.json({
      processed: 0,
      failed: 0,
      duration_ms: Date.now() - startedAt,
      message: "Nenhuma análise pendente",
    })
  }

  console.log(`[cron/analyze] ${pending.length} análise(s) pendente(s) — processando...`)

  let processed = 0
  let failed    = 0

  for (const p of pending) {
    const argusId = String(p.call_id).replace(/^argus-/, "")
    const label   = `${p.call_id} (${p.sdr_name ?? "?"})`

    try {
      // Download audio from Argus
      const { base64, contentType } = await downloadAudioById(argusId)

      // Transcribe with Whisper (or stub if key missing)
      let transcript: string
      if (openaiClient) {
        transcript = await transcribeAudio(base64, contentType)
      } else {
        transcript = `[OPENAI_API_KEY não configurado. SDR: ${p.sdr_name}, ${Math.round((p.duration_seconds ?? 0) / 60)}min]`
      }

      // Analyze with Claude
      const aiResult = await analyzeWithClaude({
        sdrName:         p.sdr_name   ?? "SDR",
        schoolName:      p.school_name ?? "Escola",
        durationSeconds: p.duration_seconds ?? 0,
        transcript,
      })

      await updateAnalysis(p.call_id, {
        ...aiResult,
        transcript,
        source:          "ai",
        data_source:     "argus_real",
        status:          "completed",
        pending_payload: undefined,
      })

      // Sync tabulacao_ia to the leads table (fire-and-forget; silent failure)
      if (aiResult.tabulacao_ia) {
        try {
          const payload = p.pending_payload ? JSON.parse(p.pending_payload as string) : null
          const rawPhone = payload?.telefone ?? payload?.ligacaoRelevante?.telefone ?? null
          await applyTabulacaoIaToLead(rawPhone, aiResult.tabulacao_ia)
        } catch (e) {
          console.warn("[cron/analyze] applyTabulacaoIaToLead falhou:", e instanceof Error ? e.message : e)
        }
      }

      processed++
      console.log(`[cron/analyze] ✓ ${label} — score=${aiResult.score} tab=${aiResult.tabulacao_ia?.categoria ?? "—"}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[cron/analyze] ✗ ${label} — ${msg}`)

      // Mark as failed so it doesn't block the queue indefinitely
      try {
        await updateAnalysis(p.call_id, {
          transcript:      `[Erro: ${msg.slice(0, 200)}]`,
          source:          "ai",
          data_source:     "pending",
          status:          "pendente",
          pending_payload: msg.slice(0, 500),
          score:           0,
          resultado:       "nao_atendeu",
          tom:             "neutro",
          tempo_resposta_inicial_segundos: 0,
          palavras_conversao: [],
          palavras_perda:     [],
          objecoes:           [],
          como_tratou_objecoes: "Não foi possível analisar",
          pontos_positivos: [],
          pontos_negativos: [`Erro: ${msg.slice(0, 100)}`],
        })
      } catch { /* ignore secondary failure */ }

      failed++
    }
  }

  const duration_ms = Date.now() - startedAt
  console.log(`[cron/analyze] Concluído — ${processed} OK / ${failed} falha(s) em ${duration_ms}ms`)

  return NextResponse.json({ processed, failed, duration_ms })
}
