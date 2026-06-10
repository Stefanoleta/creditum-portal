import { NextResponse, type NextRequest } from "next/server"
import { after } from "next/server"
import {
  downloadAudioById,
  transcribeAudio,
  analyzeWithClaude,
  parseDuration,
  maskPhone,
  openaiClient,
} from "@/lib/call-analyzer"
import { saveAnalysis } from "@/lib/supabase-server"
import type { CallAnalysis } from "@/types/calls"

// Argus Webhook 7.2 — tabulação efetuada pelo operador
interface ArgusWebhook {
  idLigacao?: string | number
  idCampanha?: string | number
  nomeUsuario?: string
  codUsuarioIntegracao?: string | number
  tempoLigacao?: string | number
  tabulacaoDesc?: string
  historico?: string
  telefone?: string
  dataInicioLigacao?: string
  dataFimLigacao?: string
  // Some Argus versions use different field names
  id_ligacao?: string | number
  nome_usuario?: string
  tempo_ligacao?: string | number
  telefone_discado?: string
}

async function processWebhook(payload: ArgusWebhook): Promise<void> {
  const idLigacao = String(payload.idLigacao ?? payload.id_ligacao ?? "")
  if (!idLigacao) {
    console.warn("[webhook/argus] idLigacao ausente no payload")
    return
  }

  const call_id    = `argus-${idLigacao}`
  const sdrName    = payload.nomeUsuario ?? payload.nome_usuario ?? "SDR"
  const phone      = maskPhone(payload.telefone ?? payload.telefone_discado)
  const duration   = parseDuration(payload.tempoLigacao ?? payload.tempo_ligacao ?? 0)
  const startedAt  = payload.dataInicioLigacao
    ? new Date(payload.dataInicioLigacao).toISOString()
    : new Date().toISOString()
  const schoolHint = payload.idCampanha ? `Campanha ${payload.idCampanha}` : "—"

  // ── Step 1: Download audio — OBRIGATÓRIO ────────────────────────────────────
  // If audio is unavailable, save as "pendente" and abort. No Claude analysis
  // on metadata alone — that produces unreliable data that can be mistaken for real.
  let base64Audio: string
  try {
    base64Audio = await downloadAudioById(idLigacao)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[webhook/argus] áudio indisponível para ${call_id} (${msg}) — salvando como pendente`)

    const pending: CallAnalysis = {
      call_id,
      sdr_name:        sdrName,
      sdr_id:          String(payload.codUsuarioIntegracao ?? ""),
      phone,
      school_name:     schoolHint,
      started_at:      startedAt,
      duration_seconds: duration,
      transcript:      "[Pendente — download do áudio falhou]",
      score:           0,
      tom:             "neutro",
      resultado:       "outros",
      tempo_resposta_inicial_segundos: 0,
      palavras_conversao:  [],
      palavras_perda:      [],
      objecoes:            [],
      como_tratou_objecoes: "",
      pontos_positivos:    [],
      pontos_negativos:    ["Áudio indisponível — análise bloqueada até retry"],
      analisado_em:    new Date().toISOString(),
      source:          "mock",
      data_source:     "pending",
      status:          "pendente",
      pending_payload: JSON.stringify(payload),
    }

    await saveAnalysis(pending)
    return
  }

  // ── Step 2: Transcribe with Whisper ────────────────────────────────────────
  let transcript: string
  if (openaiClient) {
    try {
      transcript = await transcribeAudio(base64Audio)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[webhook/argus] Whisper falhou (${msg}) — placeholder de transcrição`)
      transcript = `[Transcrição falhou: ${msg}. SDR: ${sdrName}, ${Math.round(duration / 60)}min]`
    }
  } else {
    transcript = `[OPENAI_API_KEY não configurado. SDR: ${sdrName}, ${Math.round(duration / 60)}min]`
  }

  // ── Step 3: Analyze with Claude ────────────────────────────────────────────
  let analysis: CallAnalysis
  try {
    const aiResult = await analyzeWithClaude({
      sdrName,
      schoolName: schoolHint,
      durationSeconds: duration,
      transcript,
    })

    analysis = {
      call_id,
      sdr_name:    sdrName,
      sdr_id:      String(payload.codUsuarioIntegracao ?? ""),
      phone,
      school_name: schoolHint,
      started_at:  startedAt,
      duration_seconds: duration,
      transcript,
      ...aiResult,
      analisado_em: new Date().toISOString(),
      source:       "ai",
      data_source:  "argus_real",
      status:       "completed",
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[webhook/argus] análise Claude falhou: ${msg}`)
    analysis = {
      call_id,
      sdr_name:    sdrName,
      sdr_id:      String(payload.codUsuarioIntegracao ?? ""),
      phone,
      school_name: schoolHint,
      started_at:  startedAt,
      duration_seconds: duration,
      transcript,
      score:       0,
      tom:         "neutro",
      resultado:   "outros",
      tempo_resposta_inicial_segundos: 0,
      palavras_conversao:  [],
      palavras_perda:      [],
      objecoes:            [],
      como_tratou_objecoes: "Análise IA indisponível",
      pontos_positivos:    [],
      pontos_negativos:    ["Análise automática falhou — verifique ANTHROPIC_API_KEY"],
      analisado_em: new Date().toISOString(),
      source:       "mock",
      data_source:  "metadata_only",
      status:       "completed",
    }
  }

  await saveAnalysis(analysis)
  console.log(
    `[webhook/argus] ✓ ${call_id} sdr=${sdrName} score=${analysis.score} data_source=${analysis.data_source}`
  )
}

export async function POST(req: NextRequest) {
  let payload: ArgusWebhook
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: true, message: "ping recebido" }, { status: 200 })
  }

  after(async () => {
    try {
      await processWebhook(payload)
    } catch (err) {
      console.error("[webhook/argus] erro inesperado:", err)
    }
  })

  return NextResponse.json(
    { ok: true, received: true, idLigacao: payload.idLigacao ?? payload.id_ligacao },
    { status: 200 }
  )
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "Argus Webhook 7.2" }, { status: 200 })
}
