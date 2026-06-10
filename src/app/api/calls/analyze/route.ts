import { NextResponse, type NextRequest } from "next/server"
import {
  downloadAudio,
  transcribeAudio,
  analyzeWithClaude,
  openaiClient,
} from "@/lib/call-analyzer"
import { saveAnalysis } from "@/lib/supabase-server"
import { generateMockAnalyses } from "@/lib/mock-calls"
import type { CallAnalysis } from "@/types/calls"

const BASE_URL = process.env.ARGUS_BASE_URL!
const TOKEN    = process.env.ARGUS_TOKEN!

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
  let base64Audio: string
  try {
    base64Audio = await downloadAudio(arquivo)
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
      transcript = await transcribeAudio(base64Audio)
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
