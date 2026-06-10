import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import type { CallAnalysis, CallTom, CallResultado } from "@/types/calls"

const BASE_URL    = process.env.ARGUS_BASE_URL!
const TOKEN       = process.env.ARGUS_TOKEN!
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")

const anthropicKey = process.env.ANTHROPIC_API_KEY
const openaiKey    = process.env.OPENAI_API_KEY

export const anthropic     = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null
export const openaiClient  = openaiKey    ? new OpenAI({ apiKey: openaiKey })        : null

// ─── Download recording from Argus as base64 ────────────────────────────────
// Confirmed: POST /cmd/downloadgravacao with {idLigacao, idCampanha} returns raw binary audio.

export type AudioDownload = { base64: string; contentType: string }

function hasKnownHeader(buf: Buffer): boolean {
  if (buf.length < 4) return false
  const isRiff = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
  const isMp3Sync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0
  const isId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33
  const isOgg = buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53
  const isFlac = buf[0] === 0x66 && buf[1] === 0x4C && buf[2] === 0x61 && buf[3] === 0x43
  return isRiff || isMp3Sync || isId3 || isOgg || isFlac
}

async function fetchArgusAudio(
  idLigacao: string,
  extraBody: Record<string, unknown> = {},
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${BASE_URL}/cmd/downloadgravacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Token-Signature": TOKEN },
      body: JSON.stringify({ idLigacao, idCampanha: CAMPAIGN_ID, ...extraBody }),
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) return null
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json") || ct.includes("text/")) {
      const json = await res.json() as Record<string, unknown>
      if (typeof json?.codStatus === "number" && json.codStatus < 0) {
        throw new Error(String(json.descStatus ?? "download falhou"))
      }
      return null
    }
    const ab = await res.arrayBuffer()
    if (ab.byteLength === 0) return null
    return { buffer: Buffer.from(ab), contentType: ct }
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadAudioById(idLigacao: string | number): Promise<AudioDownload> {
  if (!BASE_URL || !TOKEN) throw new Error("ARGUS não configurado")

  const raw = await fetchArgusAudio(String(idLigacao))
  if (!raw) throw new Error("Argus downloadgravacao: resposta vazia ou erro HTTP")

  // If Argus returned a recognized audio container, use it directly
  if (hasKnownHeader(raw.buffer)) {
    return { base64: raw.buffer.toString("base64"), contentType: raw.contentType }
  }

  // Raw G.711 detected (bytes like ac 80 88 9f — no RIFF/MP3 header).
  // Some Argus versions accept a "formato" body field to transcode before sending.
  const withFormat = await fetchArgusAudio(String(idLigacao), { formato: "mp3" }).catch(() => null)
  if (withFormat && hasKnownHeader(withFormat.buffer)) {
    return { base64: withFormat.buffer.toString("base64"), contentType: withFormat.contentType || "audio/mpeg" }
  }

  // Still raw G.711 — return as-is; transcribeAudio handles G.711 wrapping
  return { base64: raw.buffer.toString("base64"), contentType: raw.contentType }
}

export async function downloadAudio(arquivo: string): Promise<AudioDownload> {
  return downloadAudioById(arquivo)
}

// Detect actual audio format from magic bytes, falling back to Content-Type header.
// Sending the wrong MIME type to Whisper (e.g. "audio/mpeg" for a WAV file) causes
// HTTP 400 "could not be decoded" — Argus dialers typically return WAV, not MP3.
function detectAudioFormat(buffer: Buffer, contentTypeHint: string): { filename: string; mimeType: string } {
  if (buffer.length >= 4) {
    // WAV: RIFF....WAVE
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return { filename: "gravacao.wav", mimeType: "audio/wav" }
    }
    // MP3: sync word 0xFF 0xEx or ID3 tag
    if ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) ||
        (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)) {
      return { filename: "gravacao.mp3", mimeType: "audio/mpeg" }
    }
    // OGG / Opus
    if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return { filename: "gravacao.ogg", mimeType: "audio/ogg" }
    }
    // FLAC
    if (buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43) {
      return { filename: "gravacao.flac", mimeType: "audio/flac" }
    }
  }
  // Fall back to Content-Type header from Argus
  if (contentTypeHint.includes("mpeg") || contentTypeHint.includes("mp3")) {
    return { filename: "gravacao.mp3", mimeType: "audio/mpeg" }
  }
  if (contentTypeHint.includes("ogg"))  return { filename: "gravacao.ogg",  mimeType: "audio/ogg"  }
  if (contentTypeHint.includes("flac")) return { filename: "gravacao.flac", mimeType: "audio/flac" }
  // Default: WAV — most common format for VoIP/PBX dialers (Argus)
  return { filename: "gravacao.wav", mimeType: "audio/wav" }
}

// ─── Transcribe with OpenAI Whisper ─────────────────────────────────────────

// Wrap raw G.711 bytes (no file header) into a RIFF/WAV container so Whisper's
// internal FFmpeg can identify and decode the codec (ulaw=7, alaw=6).
// VoIP dialers like Argus often stream raw G.711 without any container header.
// sampleRate: 8000 (narrowband, most common) or 16000 (wideband VoIP).
function wrapRawAsWav(data: Buffer, formatCode: 6 | 7, sampleRate: 8000 | 16000 = 8000): Buffer {
  const header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + data.length, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16)            // fmt chunk size
  header.writeUInt16LE(formatCode, 20)    // 6=alaw, 7=ulaw
  header.writeUInt16LE(1, 22)             // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate, 28)    // byte rate = sampleRate × 1ch × 1B/sample
  header.writeUInt16LE(1, 32)             // block align
  header.writeUInt16LE(8, 34)             // bits per sample
  header.write("data", 36, "ascii")
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

type AudioCandidate = { filename: string; mimeType: string; data: Buffer }

export async function transcribeAudio(base64Audio: string, contentTypeHint = ""): Promise<string> {
  if (!openaiClient) throw new Error("OPENAI_API_KEY não configurado")
  const buffer = Buffer.from(base64Audio, "base64")

  const primary = detectAudioFormat(buffer, contentTypeHint)

  // ── Phase 1: known container formats — retry on 400 (Whisper rejects unknown containers) ──
  const phase1: AudioCandidate[] = [
    { filename: primary.filename, mimeType: primary.mimeType, data: buffer },
    { filename: "gravacao.wav",   mimeType: "audio/wav",       data: buffer },
    { filename: "gravacao.mp3",   mimeType: "audio/mpeg",      data: buffer },
    { filename: "gravacao.webm",  mimeType: "audio/webm",      data: buffer },
  ].filter((f, i, arr) => arr.findIndex((x) => x.filename === f.filename) === i)

  for (const { filename, mimeType, data } of phase1) {
    try {
      const file = new File([new Uint8Array(data)], filename, { type: mimeType })
      const result = await openaiClient.audio.transcriptions.create({
        file, model: "whisper-1", language: "pt", response_format: "text",
      })
      return typeof result === "string" ? result : (result as { text?: string }).text ?? ""
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("could not be decoded") || msg.includes("format is not supported") || msg.includes("400")) {
        continue
      }
      throw err  // auth / rate-limit / network — don't retry
    }
  }

  // ── Phase 2: raw G.711 audio — try all 4 codec×rate combinations in parallel ──
  // Whisper returns HTTP 200 (not 400) even when G.711 codec params are wrong, but produces
  // garbled text (e.g. "encerramento de vídeo"). Running all 4 in parallel and picking the
  // transcription with the most words is the only reliable way to find the correct combination.
  const g711Variants = [
    { filename: "gravacao_ulaw_8k.wav",  data: wrapRawAsWav(buffer, 7, 8000)  },
    { filename: "gravacao_alaw_8k.wav",  data: wrapRawAsWav(buffer, 6, 8000)  },
    { filename: "gravacao_ulaw_16k.wav", data: wrapRawAsWav(buffer, 7, 16000) },
    { filename: "gravacao_alaw_16k.wav", data: wrapRawAsWav(buffer, 6, 16000) },
  ]

  const g711Results = await Promise.allSettled(
    g711Variants.map(async ({ filename, data }) => {
      const file = new File([new Uint8Array(data)], filename, { type: "audio/wav" })
      const result = await openaiClient!.audio.transcriptions.create({
        file, model: "whisper-1", language: "pt", response_format: "text",
      })
      const text = typeof result === "string" ? result : (result as { text?: string }).text ?? ""
      return { filename, text, words: text.trim().split(/\s+/).filter(Boolean).length }
    })
  )

  let best: { filename: string; text: string; words: number } | undefined
  for (const r of g711Results) {
    if (r.status === "fulfilled" && r.value.words > (best?.words ?? 0)) {
      best = r.value
    }
  }
  if (best?.text) return best.text

  const hexBytes = buffer.subarray(0, 16).toString("hex").replace(/(.{2})/g, "$1 ").trim()
  throw new Error(
    `Whisper rejeitou todos os formatos G.711 (ulaw/alaw × 8k/16k). ` +
    `Bytes iniciais: [${hexBytes}].`
  )
}

// ─── Analyze transcript with Claude Opus 4.8 ────────────────────────────────

type ClaudeResult = Omit<
  CallAnalysis,
  | "call_id" | "sdr_name" | "sdr_id" | "phone" | "school_name"
  | "started_at" | "duration_seconds" | "analisado_em" | "source" | "transcript"
>

export async function analyzeWithClaude(params: {
  sdrName: string
  schoolName: string
  durationSeconds: number
  transcript: string
}): Promise<ClaudeResult> {
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY não configurado")

  const { sdrName, schoolName, durationSeconds, transcript } = params
  const dur = `${Math.floor(durationSeconds / 60)}min${durationSeconds % 60}s`

  const prompt = `Você é um analista especializado em ligações de vendas de crédito educacional no Brasil.

Analise a transcrição abaixo de uma ligação do SDR ${sdrName} da Creditum (fintech de crédito educacional em SP) com cliente da escola/faculdade "${schoolName}". Duração total: ${dur}.

TRANSCRIÇÃO:
${transcript}

Retorne APENAS um JSON válido, sem markdown, com esta estrutura exata:
{
  "score": <número de 0.0 a 10.0 com 1 decimal>,
  "tom": <"positivo" | "neutro" | "negativo">,
  "resultado": <"conversao" | "agendamento" | "callback" | "sem_interesse" | "nao_atendeu" | "outros">,
  "tempo_resposta_inicial_segundos": <número estimado de segundos até o SDR apresentar a proposta/produto>,
  "palavras_conversao": [<até 5 palavras ou frases-chave que contribuíram para engajamento/conversão>],
  "palavras_perda": [<até 5 palavras ou frases que prejudicaram a ligação, array vazio se nenhuma>],
  "objecoes": [<lista de objeções levantadas pelo cliente, array vazio se nenhuma>],
  "como_tratou_objecoes": "<como o SDR respondeu às objeções — 'Sem objeções' se não houve>",
  "pontos_positivos": [<3 a 5 pontos positivos do desempenho do SDR>],
  "pontos_negativos": [<2 a 4 pontos negativos ou oportunidades de melhoria>]
}`

  const message = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  })

  const textBlock = message.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") throw new Error("Claude não retornou texto")

  let raw = textBlock.text.trim()
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  return JSON.parse(raw) as ClaudeResult
}

// ─── Parse tempoLigacao (may be "HH:MM:SS", seconds int, or ms) ─────────────

export function parseDuration(val: unknown): number {
  if (typeof val === "number") return val > 10000 ? Math.round(val / 1000) : val
  if (typeof val === "string") {
    if (val.includes(":")) {
      const parts = val.split(":").map(Number)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts[0] * 60 + parts[1]
    }
    return parseInt(val, 10) || 0
  }
  return 0
}

export function maskPhone(phone: string | undefined): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}****-${digits.slice(-4)}`
  }
  return phone.replace(/\d(?=\d{4})/g, "*")
}
