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

export async function downloadAudioById(idLigacao: string | number): Promise<string> {
  if (!BASE_URL || !TOKEN) throw new Error("ARGUS não configurado")

  const controller = new AbortController()
  // Audio files can be large — allow 30s
  const timer = setTimeout(() => controller.abort(), 30_000)

  const res = await fetch(`${BASE_URL}/cmd/downloadgravacao`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Token-Signature": TOKEN },
    body: JSON.stringify({ idLigacao: String(idLigacao), idCampanha: CAMPAIGN_ID }),
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))

  if (!res.ok) throw new Error(`Argus downloadgravacao HTTP ${res.status}`)

  // Response is raw binary audio — check Content-Type to handle JSON error responses
  const ct = res.headers.get("content-type") ?? ""
  if (ct.includes("application/json") || ct.includes("text/")) {
    const json = await res.json() as Record<string, unknown>
    if (typeof json?.codStatus === "number" && json.codStatus < 0) {
      throw new Error(String(json.descStatus ?? "download falhou"))
    }
  }

  const buffer = await res.arrayBuffer()
  if (buffer.byteLength === 0) throw new Error("Arquivo de áudio vazio")
  return Buffer.from(buffer).toString("base64")
}

// downloadAudio: accepts idLigacao (numeric string) or legacy arquivo name.
// Since calls/list now uses idLigacao as the arquivo field, this delegates correctly.
export async function downloadAudio(arquivo: string): Promise<string> {
  // All recordings from calls/list now use idLigacao (pure numeric) as the arquivo field
  return downloadAudioById(arquivo)
}

// ─── Transcribe with OpenAI Whisper ─────────────────────────────────────────

export async function transcribeAudio(base64Audio: string): Promise<string> {
  if (!openaiClient) throw new Error("OPENAI_API_KEY não configurado")
  const buffer = Buffer.from(base64Audio, "base64")
  const file = new File([buffer], "gravacao.mp3", { type: "audio/mpeg" })
  const result = await openaiClient.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "pt",
    response_format: "text",
  })
  return typeof result === "string" ? result : (result as { text?: string }).text ?? ""
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
