import { NextResponse, type NextRequest, after } from "next/server"
import {
  downloadAudio,
  downloadAudioById,
  transcribeAudio,
  analyzeWithClaude,
  openaiClient,
  type AudioDownload,
} from "@/lib/call-analyzer"
import {
  saveAnalysis,
  fetchPendingAnalyses,
  updateAnalysis,
} from "@/lib/supabase-server"
import { generateMockAnalyses } from "@/lib/mock-calls"
import type { CallAnalysis } from "@/types/calls"

const BASE_URL = process.env.ARGUS_BASE_URL!
const TOKEN    = process.env.ARGUS_TOKEN!

async function processPending(): Promise<void> {
  const pending = await fetchPendingAnalyses()
  for (const p of pending) {
    const argusId = p.call_id.replace(/^argus-/, "")
    try {
      const { base64, contentType } = await downloadAudioById(argusId)

      const transcript = openaiClient
        ? await transcribeAudio(base64, contentType)
        : `[OPENAI_API_KEY não configurado. SDR: ${p.sdr_name}]`

      const aiResult = await analyzeWithClaude({
        sdrName:         p.sdr_name,
        schoolName:      p.school_name,
        durationSeconds: p.duration_seconds,
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
      console.log(`[analyze/pending] ✓ ${p.call_id} score=${aiResult.score}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[analyze/pending] ✗ ${p.call_id}: ${msg}`)
      await updateAnalysis(p.call_id, {
        data_source: "pending",
        status:      "pendente",
      }).catch(() => undefined)
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    id: rawId,
    call_id: rawCallId,
    arquivo,
    sdr_name,
    sdr_id,
    phone,
    school_name,
    started_at,
    duration_seconds,
  } = body as {
    id?: string
    call_id?: string
    arquivo: string
    sdr_name: string
    sdr_id: string
    phone: string
    school_name: string
    started_at: string
    duration_seconds: number
  }

  const call_id = rawCallId ?? rawId

  if (!call_id || !arquivo) {
    return NextResponse.json({ error: "call_id e arquivo são obrigatórios" }, { status: 400 })
  }

  // If Argus not configured, return matching mock analysis (UI shows "DEMO")
  if (!BASE_URL || !TOKEN) {
    const mocks = generateMockAnalyses()
    const mock = mocks.find((a) => a.call_id === call_id) ?? { ...mocks[0], call_id }
    return NextResponse.json({ analysis: { ...mock, data_source: "mock" } })
  }

  // Step 1 — Download audio from Argus (REQUIRED — no fallback to metadata analysis)
  let audioDownload: AudioDownload
  try {
    audioDownload = await downloadAudio(arquivo)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[calls/analyze] download falhou para ${call_id}: ${message}`)
    return NextResponse.json(
      {
        error: "Áudio indisponível",
        detail: message,
        blocked: true,
        message:
          "Análise bloqueada: o áudio desta ligação não pôde ser baixado do Argus. " +
          "Verifique se o IP da Vercel está na whitelist e tente novamente.",
      },
      { status: 503 }
    )
  }

  try {
    // Step 2 — Transcribe with Whisper (if OpenAI key set)
    let transcript: string
    if (openaiClient) {
      transcript = await transcribeAudio(audioDownload.base64, audioDownload.contentType)
    } else {
      transcript = `[OPENAI_API_KEY não configurado. SDR: ${sdr_name}, ${Math.round(duration_seconds / 60)}min]`
    }

    // Step 3 — Analyze with Claude
    const aiResult = await analyzeWithClaude({
      sdrName:         sdr_name,
      schoolName:      school_name,
      durationSeconds: duration_seconds,
      transcript,
    })

    const analysis: CallAnalysis = {
      call_id,
      sdr_name,
      sdr_id,
      phone,
      school_name,
      started_at,
      duration_seconds,
      transcript,
      ...aiResult,
      analisado_em: new Date().toISOString(),
      source:      "ai",
      data_source: "argus_real",
      status:      "completed",
    }

    // Step 4 — Persist to Supabase (non-blocking)
    saveAnalysis(analysis).catch((err) =>
      console.warn("[analyze] Supabase save failed:", err)
    )

    // Step 5 — Process other pending records in the background
    after(() => processPending().catch((err) =>
      console.warn("[analyze] processPending error:", err)
    ))

    return NextResponse.json({ analysis })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[calls/analyze] Claude/Whisper error:", message)
    return NextResponse.json(
      { error: "Análise falhou", detail: message },
      { status: 500 }
    )
  }
}
