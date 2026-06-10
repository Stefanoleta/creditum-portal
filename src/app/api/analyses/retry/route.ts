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
  supabase,
} from "@/lib/supabase-server"
import type { DbAnalysis } from "@/lib/supabase-server"

// POST /api/analyses/retry
// Body (optional): { call_id: string } — retry specific record; omit to retry all pending
export async function POST(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as { call_id?: string }

  let pending: DbAnalysis[]
  if (body.call_id) {
    const { data, error } = await supabase
      .from("call_analyses")
      .select("*")
      .eq("call_id", body.call_id)
      .eq("status", "pendente")
      .limit(1)
    if (error || !data?.length) {
      return NextResponse.json({ error: "Análise pendente não encontrada" }, { status: 404 })
    }
    pending = data as DbAnalysis[]
  } else {
    pending = await fetchPendingAnalyses()
  }

  if (pending.length === 0) {
    return NextResponse.json({ retried: 0, failed: 0, total: 0, message: "Nenhuma análise pendente" })
  }

  let retried = 0
  let failed  = 0
  const errors: string[] = []

  for (const p of pending) {
    // call_id format: "argus-{idLigacao}"
    const argusId = p.call_id.replace(/^argus-/, "")

    try {
      // Try to download audio now that (hopefully) Argus is available
      const base64Audio = await downloadAudioById(argusId)

      // Transcribe
      let transcript: string
      if (openaiClient) {
        transcript = await transcribeAudio(base64Audio)
      } else {
        transcript = `[OPENAI_API_KEY não configurado. SDR: ${p.sdr_name}, ${Math.round(p.duration_seconds / 60)}min]`
      }

      // Analyze with Claude
      const aiResult = await analyzeWithClaude({
        sdrName:         p.sdr_name,
        schoolName:      p.school_name,
        durationSeconds: p.duration_seconds,
        transcript,
      })

      // Update record: mark as completed with real data
      await updateAnalysis(p.call_id, {
        ...aiResult,
        transcript,
        source:          "ai",
        data_source:     "argus_real",
        status:          "completed",
        pending_payload: undefined,
      })

      retried++
      console.log(`[analyses/retry] ✓ ${p.call_id} reprocessado — score=${aiResult.score}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${p.call_id}: ${msg}`)
      failed++
      console.warn(`[analyses/retry] ✗ ${p.call_id} falhou novamente: ${msg}`)
    }
  }

  return NextResponse.json({
    retried,
    failed,
    total: pending.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}

// GET — list pending analyses
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }
  const pending = await fetchPendingAnalyses()
  return NextResponse.json({ pending, count: pending.length })
}
