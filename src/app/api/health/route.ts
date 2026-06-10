import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"

const OPENAI_KEY     = process.env.OPENAI_API_KEY
const ARGUS_BASE_URL = process.env.ARGUS_BASE_URL
const ARGUS_TOKEN    = process.env.ARGUS_TOKEN

export type OpenAIStatus  = "ok" | "low" | "critical" | "error" | "unconfigured"
export type ServiceStatus = "ok" | "error" | "unconfigured"

export interface HealthPayload {
  openai:      { balance: number | null; status: OpenAIStatus }
  argus:       { status: ServiceStatus; latencyMs?: number }
  supabase:    { pendingCount: number; status: ServiceStatus }
  lastWebhook: { receivedAt: string | null }
}

export async function GET() {
  const [openaiResult, argusResult, supabaseResult] = await Promise.allSettled([
    checkOpenAI(),
    checkArgus(),
    checkSupabase(),
  ])

  const openai = openaiResult.status === "fulfilled"   ? openaiResult.value   : { balance: null, status: "error" as const }
  const argus  = argusResult.status === "fulfilled"    ? argusResult.value    : { status: "error" as const }
  const sbData = supabaseResult.status === "fulfilled" ? supabaseResult.value : { pendingCount: 0, lastWebhook: null }

  return NextResponse.json<HealthPayload>({
    openai,
    argus,
    supabase: {
      pendingCount: sbData.pendingCount,
      status: supabaseResult.status === "fulfilled" ? "ok" : "error",
    },
    lastWebhook: { receivedAt: sbData.lastWebhook },
  })
}

async function checkOpenAI(): Promise<{ balance: number | null; status: OpenAIStatus }> {
  if (!OPENAI_KEY) return { balance: null, status: "unconfigured" }

  try {
    const res = await fetch("https://api.openai.com/v1/organization/balance", {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })

    if (!res.ok) return { balance: null, status: "error" }

    const json = await res.json() as Record<string, unknown>
    // Response: { object: "balance", available: [{ currency: "usd", amount: 10.5 }] }
    const available = Array.isArray(json?.available)
      ? (json.available as Array<{ currency: string; amount: number }>)
      : []
    const usd = available.find((a) => a.currency === "usd")
    const balance = usd?.amount ?? null

    let status: OpenAIStatus = "ok"
    if (balance !== null) {
      if (balance < 2)      status = "critical"
      else if (balance < 5) status = "low"
    }

    return { balance, status }
  } catch {
    return { balance: null, status: "error" }
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

async function checkSupabase(): Promise<{ pendingCount: number; lastWebhook: string | null }> {
  if (!supabase) return { pendingCount: 0, lastWebhook: null }

  const [pendingRes, lastRes] = await Promise.all([
    supabase
      .from("call_analyses")
      .select("*", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase
      .from("call_analyses")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ])

  return {
    pendingCount: pendingRes.count ?? 0,
    lastWebhook:  (lastRes.data?.[0]?.created_at as string | undefined) ?? null,
  }
}
