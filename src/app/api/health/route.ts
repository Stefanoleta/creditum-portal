import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

const OPENAI_KEY     = process.env.OPENAI_API_KEY
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY
const ARGUS_BASE_URL = process.env.ARGUS_BASE_URL
const ARGUS_TOKEN    = process.env.ARGUS_TOKEN

export type OpenAIStatus  = "ok" | "low" | "critical" | "error" | "unconfigured"
export type ServiceStatus = "ok" | "error" | "unconfigured"

export interface HealthPayload {
  openai:      { status: OpenAIStatus; balance: null; message?: string }
  anthropic:   { status: ServiceStatus }
  argus:       { status: ServiceStatus; latencyMs?: number }
  supabase:    { pendingCount: number; status: ServiceStatus; configured: boolean; error?: string; columns?: string[] }
  lastWebhook: { receivedAt: string | null }
}

export async function GET() {
  const [openaiResult, anthropicResult, argusResult, supabaseResult] = await Promise.allSettled([
    checkOpenAI(),
    checkAnthropic(),
    checkArgus(),
    checkSupabase(),
  ])

  const openai    = openaiResult.status === "fulfilled"    ? openaiResult.value    : { status: "error" as const, balance: null }
  const anthropic = anthropicResult.status === "fulfilled" ? anthropicResult.value : { status: "error" as const }
  const argus     = argusResult.status === "fulfilled"     ? argusResult.value     : { status: "error" as const }
  const sbData    = supabaseResult.status === "fulfilled"  ? supabaseResult.value  : { pendingCount: 0, lastWebhook: null }

  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  return NextResponse.json<HealthPayload>({
    openai,
    anthropic,
    argus,
    supabase: {
      pendingCount: sbData.pendingCount,
      status: supabaseConfigured
        ? (supabaseResult.status === "fulfilled" ? "ok" : "error")
        : "unconfigured",
      configured: supabaseConfigured,
      error:   sbData.error,
      columns: sbData.columns,
    },
    lastWebhook: { receivedAt: sbData.lastWebhook },
  })
}

async function checkOpenAI(): Promise<{ status: OpenAIStatus; balance: null; message?: string }> {
  if (!OPENAI_KEY) return { status: "unconfigured", balance: null }

  // Sanity-check the key format before making a network call
  const trimmed = OPENAI_KEY.trim()
  if (!trimmed.startsWith("sk-")) {
    return { status: "error", balance: null, message: "Chave inválida (não começa com sk-)" }
  }

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${trimmed}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })

    if (res.ok) return { status: "ok", balance: null }

    const body = await res.text().catch(() => "")
    const message = openAIErrorMessage(res.status, body)
    return { status: "error", balance: null, message }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const message = msg.includes("timeout") || msg.includes("abort")
      ? "Timeout (>8s)"
      : `Erro de rede: ${msg.slice(0, 80)}`
    return { status: "error", balance: null, message }
  }
}

function openAIErrorMessage(status: number, body: string): string {
  // Try to extract OpenAI's own error message from the JSON body
  try {
    const json = JSON.parse(body) as { error?: { message?: string; code?: string } }
    const apiMsg = json?.error?.message
    if (apiMsg) return apiMsg.slice(0, 120)
  } catch { /* not JSON */ }

  switch (status) {
    case 401: return "Chave inválida ou expirada (HTTP 401)"
    case 403: return "Chave revogada ou sem permissão (HTTP 403)"
    case 429: return "Rate limit atingido / saldo esgotado (HTTP 429)"
    default:  return `OpenAI indisponível (HTTP ${status})`
  }
}

async function checkAnthropic(): Promise<{ status: ServiceStatus }> {
  if (!ANTHROPIC_KEY) return { status: "unconfigured" }

  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    return { status: res.ok ? "ok" : "error" }
  } catch {
    return { status: "error" }
  }
}

async function checkArgus(): Promise<{ status: ServiceStatus; latencyMs?: number }> {
  if (!ARGUS_BASE_URL || !ARGUS_TOKEN) return { status: "unconfigured" }

  const start = Date.now()
  try {
    const res = await fetch(`${ARGUS_BASE_URL}/report/desempenhoresumido`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Token-Signature": ARGUS_TOKEN,
      },
      body: JSON.stringify({ ultimosMinutos: 1 }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    })
    const latencyMs = Date.now() - start
    return { status: res.ok ? "ok" : "error", latencyMs }
  } catch {
    return { status: "error", latencyMs: Date.now() - start }
  }
}

async function checkSupabase(): Promise<{
  pendingCount: number
  lastWebhook: string | null
  error?: string
  columns?: string[]
}> {
  if (!supabase) return { pendingCount: 0, lastWebhook: null }

  // Step 1: fetch one row with all columns — safe, no filtering by column name
  const schemaRes = await supabase
    .from("call_analyses")
    .select("*")
    .limit(1)

  const columns = schemaRes.data && schemaRes.data.length > 0
    ? Object.keys(schemaRes.data[0] as Record<string, unknown>).sort()
    : undefined

  if (schemaRes.error) {
    return {
      pendingCount: 0,
      lastWebhook: null,
      error: schemaRes.error.message,
      columns,
    }
  }

  // Step 2: count pending — uses .eq() which doesn't care about timestamp column
  const pendingRes = await supabase
    .from("call_analyses")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente")

  // Step 3: get last row ordered by started_at
  const lastRes = await supabase
    .from("call_analyses")
    .select("started_at")
    .order("started_at", { ascending: false })
    .limit(1)

  let lastWebhook: string | null = null
  let lastError: string | undefined

  if (!lastRes.error) {
    lastWebhook = (lastRes.data?.[0]?.started_at as string | undefined) ?? null
  } else {
    lastError = lastRes.error.message
  }

  return {
    pendingCount: pendingRes.count ?? 0,
    lastWebhook,
    error:   lastError ?? pendingRes.error?.message,
    columns,
  }
}
