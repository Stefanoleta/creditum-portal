import { createClient } from "@supabase/supabase-js"
import type { CallAnalysis, DataSource, AnalysisStatus, TabulacaoIa } from "@/types/calls"
import { normalizePhone } from "@/lib/lista-parser"

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// null when env vars are placeholder / not configured
export const supabase =
  url && key && !url.startsWith("your_") && !key.startsWith("your_")
    ? createClient(url, key)
    : null

export type DbAnalysis = CallAnalysis

// ─── DB serialization helpers ─────────────────────────────────────────────────
// PostgREST schema cache only knows about columns that existed at service startup.
// Any column added afterwards (via ALTER TABLE) won't appear until PostgREST restarts.
// Fix: bundle all "new" coaching fields into a single `coaching_data` jsonb column
// so the upsert payload only touches columns the cache knows about.

const SAFE_COLUMNS = new Set([
  "call_id", "sdr_name", "sdr_id", "phone", "school_name",
  "started_at", "duration_seconds", "transcript",
  "score", "tom", "resultado", "tempo_resposta_inicial_segundos",
  "palavras_chave", "palavras_conversao", "palavras_perda",
  "source", "data_source", "status", "pending_payload",
  "coaching_data",  // the jsonb bucket itself is safe
])

function toDbRow(obj: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  const coaching: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (SAFE_COLUMNS.has(k)) safe[k] = v
    else coaching[k] = v
  }
  if (Object.keys(coaching).length > 0) safe.coaching_data = coaching
  return safe
}

function fromDbRow(row: Record<string, unknown>): CallAnalysis {
  const { coaching_data, ...rest } = row
  return {
    ...rest,
    ...(coaching_data && typeof coaching_data === "object" ? coaching_data : {}),
  } as unknown as CallAnalysis
}

// ─── Save or overwrite an analysis ───────────────────────────────────────────

export async function saveAnalysis(analysis: CallAnalysis): Promise<void> {
  if (!supabase) return
  const row = toDbRow(analysis as unknown as Record<string, unknown>)
  const { error } = await supabase
    .from("call_analyses")
    .upsert(row, { onConflict: "call_id" })
  if (error) console.error("[supabase] saveAnalysis error:", error.message)
}

// ─── Update specific fields on an existing analysis (used by retry) ──────────

export async function updateAnalysis(
  call_id: string,
  patch: Partial<CallAnalysis> & { data_source: DataSource; status: AnalysisStatus }
): Promise<void> {
  if (!supabase) return
  const row = toDbRow(patch as unknown as Record<string, unknown>)
  const { error } = await supabase
    .from("call_analyses")
    .update(row)
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
    .gte("started_at", `${targetDate}T00:00:00`)
    .lte("started_at", `${targetDate}T23:59:59`)
    .neq("status", "pendente")
    .order("started_at", { ascending: false })
    .limit(50)
  if (error) {
    console.error("[supabase] fetchRecentAnalyses error:", error.message)
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromDbRow)
}

// ─── Apply tabulacao_ia to the corresponding lead ────────────────────────────
// Called after a successful analysis to keep the leads table in sync.
// rawPhone: the original (unmasked) phone number from the Argus payload.

export async function applyTabulacaoIaToLead(
  rawPhone: string | null | undefined,
  tabulacao: TabulacaoIa
): Promise<void> {
  if (!supabase || !rawPhone) return
  const phone = normalizePhone(rawPhone)
  if (!phone) return

  const { data: found } = await supabase
    .from("leads")
    .select("id")
    .or(`telefone_principal.eq.${phone},telefone_secundario.eq.${phone}`)
    .limit(1)

  const lead = found?.[0] as { id: string } | undefined
  if (!lead) return

  const updates: Record<string, unknown> = {}

  if (tabulacao.categoria === "numero_invalido") {
    updates.precisa_higienizacao = true
    updates.motivo_higienizacao  = "numero_invalido_discador"
  } else if (tabulacao.categoria === "qualificado") {
    updates.observacao = "qualificado"
  } else if (tabulacao.recontato_em_dias !== null) {
    const d = new Date()
    d.setDate(d.getDate() + tabulacao.recontato_em_dias)
    updates.recontato_em = d.toISOString().split("T")[0]
    updates.observacao   = `recontato:${tabulacao.categoria}`
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await supabase.from("leads").update(updates).eq("id", lead.id)
  if (error) console.error("[supabase] applyTabulacaoIaToLead error:", error.message)
  else console.log(`[supabase] lead ${lead.id} atualizado via tabulacao_ia:`, tabulacao.categoria)
}

// ─── Fetch pending analyses (audio download failed, awaiting retry) ───────────

export async function fetchPendingAnalyses(): Promise<DbAnalysis[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("call_analyses")
    .select("*")
    .eq("status", "pendente")
    .order("started_at", { ascending: false })
    .limit(20)
  if (error) {
    console.error("[supabase] fetchPendingAnalyses error:", error.message)
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromDbRow)
}
