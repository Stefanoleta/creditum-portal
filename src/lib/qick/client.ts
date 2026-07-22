// Qick API client — server-side only (QUICK_API_KEY must never reach the browser).
// TODO: validate actual tabbing codes with the Qick team before removing the mock.

import { getMockCalls, type QickRawCall } from "./mock"
import { normalizeUnidade } from "@/lib/lista-parser"

const QICK_API = "https://api.qick.ai/call"
const PAGE_LIMIT = 100
const MAX_RETRIES = 2

export interface QickNormalizedCall {
  id: string
  nome: string | null
  phone: string | null
  unidade: string | null
  tabbingCode: string
  tabbingName: string
  createdAt: string      // ISO UTC
  durationSeconds: number | null
  agentId: string | null
  agentName: string | null
}

export type QickFonte = "live" | "mock"

export interface QickFetchResult {
  calls: QickNormalizedCall[]
  fonte: QickFonte
}

// ─── Normalisation ─────────────────────────────────────────────────────────────

// Olos table name convention: CREDITUM_DISCADOR_<UNIDADE>_<TIPO>_<DDMM>
// e.g. "CREDITUM_DISCADOR_CARPINA_INADI_1106" → unidade "Carpina".
// Tables that don't follow the convention (e.g. "CREDITUM_TESTE_v2") yield null.
function extractUnidadeFromTableName(tableName: unknown): string | null {
  if (typeof tableName !== "string") return null
  const parts = tableName.split("_")
  if (parts.length < 5) return null
  if (parts[0] !== "CREDITUM" || parts[1] !== "DISCADOR") return null
  return normalizeUnidade(parts[2])
}

function normalizeCall(raw: Record<string, unknown>): QickNormalizedCall {
  const id = String(raw.id ?? raw.call_id ?? raw.callId ?? "")

  // Customer phone/name live inside dynamicVariables (Olos discador fields), not top-level.
  const dynVars = (raw.dynamicVariables as Record<string, unknown> | null | undefined) ?? {}
  const phone =
    typeof dynVars.olos_OriginalPhoneNumber === "string" ? dynVars.olos_OriginalPhoneNumber
    : typeof raw.phone === "string"       ? raw.phone
    : typeof raw.number === "string"      ? raw.number
    : typeof raw.destination === "string" ? raw.destination
    : null
  const nome =
    typeof dynVars.olos_primeiro_nome === "string" && dynVars.olos_primeiro_nome ? dynVars.olos_primeiro_nome
    : typeof dynVars.olos_nome === "string" && dynVars.olos_nome ? dynVars.olos_nome
    : null
  const unidade = extractUnidadeFromTableName(dynVars.olos_TableName)

  // Tabbing only exists once the call has been classified — absent (null) otherwise.
  const callTabbing = raw.callTabbing as Record<string, unknown> | null | undefined
  const tabDv = (callTabbing?.dynamicVariables as Record<string, unknown> | null | undefined) ?? {}
  const tabbingArray = Array.isArray(callTabbing?.tabbing) ? (callTabbing!.tabbing as unknown[]) : []
  const tabbingCode = String(
    tabDv.dispositionId ?? tabbingArray[0] ?? raw.tabbingCode ?? raw.tabbing_code ?? ""
  )
  const tabbingName = String(
    tabDv.motivo ?? raw.tabbingName ?? raw.tabbing_name ?? tabbingCode
  )

  const createdAt = String(
    raw.startTime ?? raw.created_at ?? raw.createdAt ?? raw.date ?? new Date().toISOString()
  )

  const duration =
    typeof raw.duration === "number"          ? raw.duration
    : typeof raw.duration_seconds === "number"  ? raw.duration_seconds
    : typeof raw.durationSeconds === "number"   ? raw.durationSeconds
    : null

  const agentRaw = raw.agent as Record<string,unknown> | null | undefined
  const agentId = typeof raw.agentId === 'string' ? raw.agentId
    : typeof agentRaw?.id === 'string' ? String(agentRaw.id) : null
  const agentName = typeof agentRaw?.name === 'string' ? agentRaw.name : null
  return { id, nome, phone, unidade, tabbingCode, tabbingName, createdAt, durationSeconds: duration, agentId, agentName }
}

function normalizeMockCall(raw: QickRawCall): QickNormalizedCall {
  return {
    id: raw.id,
    nome: raw.nome,
    phone: raw.phone,
    unidade: raw.unidade,
    tabbingCode: raw.tabbing.code,
    tabbingName: raw.tabbing.name,
    createdAt: raw.created_at,
    durationSeconds: raw.duration,
    agentId: null,
    agentName: null,
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// "Hoje" = calendar day in Brazil time (America/Sao_Paulo, UTC-3), not a
// rolling window. A 48h rolling window was tried before to dodge Samantha's
// tabbing lag (calls placed "today" often have callTabbing: null for hours),
// but it silently mixed in a full extra calendar day — "Ligações Hoje" ended
// up ~2x Qick's own dashboard count (720 vs. their 339). Scoping to the real
// calendar day fixes the count; the trade-off is that "unknown" tabbing stays
// high until Samantha catches up on today's calls — that's expected, not a bug.
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000

function todayBrazilBounds(): { startDate: string; endDate: string } {
  const nowUtc = Date.now()
  const brazilNow      = new Date(nowUtc + BRAZIL_OFFSET_MS)
  const brazilMidnight = new Date(brazilNow)
  brazilMidnight.setHours(0, 0, 0, 0)
  const startUtc = new Date(brazilMidnight.getTime() - BRAZIL_OFFSET_MS)

  return {
    startDate: startUtc.toISOString(),
    endDate:   new Date(nowUtc).toISOString(),
  }
}

// ─── Single page fetch with retry ─────────────────────────────────────────────

async function fetchPage(
  apiKey: string,
  params: URLSearchParams,
  attempt = 0,
): Promise<unknown[]> {
  const resp = await fetch(`${QICK_API}?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 0 }, // always fresh per sync request
  })

  if (!resp.ok) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      return fetchPage(apiKey, params, attempt + 1)
    }
    throw new Error(`Qick API ${resp.status}`)
  }

  const json: unknown = await resp.json()

  // Handle multiple possible response shapes
  if (Array.isArray(json)) return json as unknown[]
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>
    const payload = obj.data ?? obj.calls ?? obj.results ?? obj.items
    if (Array.isArray(payload)) return payload as unknown[]
  }
  return []
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchQickCalls(): Promise<QickFetchResult> {
  const apiKey = process.env.QUICK_API_KEY ?? ""

  // TODO: remove this fallback once the Creditum API key is configured in Vercel.
  if (!apiKey) {
    return { calls: getMockCalls().map(normalizeMockCall), fonte: "mock" }
  }

  try {
    const { startDate, endDate } = todayBrazilBounds()
    const allRaw: unknown[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
        startDate,
        endDate,
      })

      const rows = await fetchPage(apiKey, params)

      if (rows.length === 0) {
        hasMore = false
      } else {
        allRaw.push(...rows)
        hasMore = rows.length === PAGE_LIMIT
        page++
      }
    }

    const calls = allRaw.map(r => normalizeCall(r as Record<string, unknown>))
    return { calls, fonte: "live" }
  } catch {
    // API unreachable — fall back to mock so the cockpit never shows empty.
    return { calls: getMockCalls().map(normalizeMockCall), fonte: "mock" }
  }
}
