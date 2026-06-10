import { createClient } from "@supabase/supabase-js"
import type { CallAnalysis, DataSource, AnalysisStatus } from "@/types/calls"

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// null when env vars are placeholder / not configured
export const supabase =
  url && key && !url.startsWith("your_") && !key.startsWith("your_")
    ? createClient(url, key)
    : null

export type DbAnalysis = CallAnalysis & { created_at?: string }

// ─── Save or overwrite an analysis ───────────────────────────────────────────

export async function saveAnalysis(analysis: CallAnalysis): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from("call_analyses")
    .upsert(
      { ...analysis, created_at: new Date().toISOString() },
      { onConflict: "call_id" }
    )
  if (error) console.error("[supabase] saveAnalysis error:", error.message)
}

// ─── Update specific fields on an existing analysis (used by retry) ──────────

export async function updateAnalysis(
  call_id: string,
  patch: Partial<CallAnalysis> & { data_source: DataSource; status: AnalysisStatus }
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from("call_analyses")
    .update({ ...patch, analisado_em: new Date().toISOString() })
    .eq("call_id", call_id)
  if (error) console.error("[supabase] updateAnalysis error:", error.message)
}

// ─── Fetch today's (or given date's) completed analyses ──────────────────────

export async function fetchRecentAnalyses(date?: string): Promise<DbAnalysis[]> {
  if (!supabase) return []
  const targetDate = date ?? new Date().toISOString().split("T")[0]
  const { data, error } = await supabase
    .from("call_analyses")
    .select("*")
    .gte("created_at", `${targetDate}T00:00:00`)
    .lte("created_at", `${targetDate}T23:59:59`)
    .neq("status", "pendente")          // exclude pending from main list
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) {
    console.error("[supabase] fetchRecentAnalyses error:", error.message)
    return []
  }
  return (data ?? []) as DbAnalysis[]
}

// ─── Fetch pending analyses (audio download failed, awaiting retry) ───────────

export async function fetchPendingAnalyses(): Promise<DbAnalysis[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("call_analyses")
    .select("*")
    .eq("status", "pendente")
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) {
    console.error("[supabase] fetchPendingAnalyses error:", error.message)
    return []
  }
  return (data ?? []) as DbAnalysis[]
}
