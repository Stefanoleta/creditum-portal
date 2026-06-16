// Qick API client — server-side only (QUICK_API_KEY must never reach the browser).
// TODO: validate actual tabbing codes with the Qick team before removing the mock.

import { getMockCalls, type QickRawCall } from "./mock"

const QICK_API = "https://api.qick.ai/call"
const PAGE_LIMIT = 100
const MAX_RETRIES = 2
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000 // UTC-3

export interface QickNormalizedCall {
  id: string
  phone: string | null
  tabbingCode: string
  tabbingName: string
  createdAt: string      // ISO UTC
  durationSeconds: number | null
}

export type QickFonte = "live" | "mock"

export interface QickFetchResult {
  calls: QickNormalizedCall[]
  fonte: QickFonte
}

// ─── Normalisation ─────────────────────────────────────────────────────────────

function normalizeCall(raw: Record<string, unknown>): QickNormalizedCall {
  const id = String(raw.id ?? raw.call_id ?? raw.callId ?? "")

  const phone =
    typeof raw.phone === "string"       ? raw.phone
    : typeof raw.number === "string"    ? raw.number
    : typeof raw.destination === "string" ? raw.destination
    : null

  const tab = raw.tabbing as Record<string, unknown> | null | undefined
  const tabbingCode = String(
    tab?.code ?? raw.tabbingCode ?? raw.tabbing_code ?? ""
  )
  const tabbingName = String(
    tab?.name ?? raw.tabbingName ?? raw.tabbing_name ?? tabbingCode
  )

  const createdAt = String(
    raw.created_at ?? raw.createdAt ?? raw.date ?? new Date().toISOString()
  )

  const duration =
    typeof raw.duration === "number"          ? raw.duration
    : typeof raw.duration_seconds === "number"  ? raw.duration_seconds
    : typeof raw.durationSeconds === "number"   ? raw.durationSeconds
    : null

  return { id, phone, tabbingCode, tabbingName, createdAt, durationSeconds: duration }
}

function normalizeMockCall(raw: QickRawCall): QickNormalizedCall {
  return {
    id: raw.id,
    phone: raw.phone,
    tabbingCode: raw.tabbing.code,
    tabbingName: raw.tabbing.name,
    createdAt: raw.created_at,
    durationSeconds: raw.duration,
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayBrazilBounds(): { startDate: string; endDate: string } {
  const nowUtc = Date.now()
  // Brazil midnight UTC = Brazil 00:00 local
  const brazilNow = new Date(nowUtc + BRAZIL_OFFSET_MS)
  const brazilMidnight = new Date(brazilNow)
  brazilMidnight.setHours(0, 0, 0, 0)

  // Convert back to UTC for the API
  const startUtc = new Date(brazilMidnight.getTime() - BRAZIL_OFFSET_MS)
  const endUtc   = new Date(nowUtc)

  return {
    startDate: startUtc.toISOString(),
    endDate:   endUtc.toISOString(),
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
