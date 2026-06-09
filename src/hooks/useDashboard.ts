"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { DashboardData } from "@/types/dashboard"

const POLL_INTERVAL_MS = 30_000

type DataSource = "argus" | "mock" | null

export function useDashboard() {
  const [data, setData]         = useState<DashboardData | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [source, setSource]     = useState<DataSource>(null)
  const abortRef                = useRef<AbortController | null>(null)

  const fetchMetrics = useCallback(async (isFirst = false) => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/dashboard/metrics", {
        signal: controller.signal,
        cache: "no-store",
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()

      setData(json)
      setSource(json.source ?? "argus")
      setError(null)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      console.error("[useDashboard] fetch error:", msg)
      // Only surface error on first load; silent on background refresh
      if (isFirst) setError(msg)
    } finally {
      if (isFirst) setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchMetrics(true)
    return () => abortRef.current?.abort()
  }, [fetchMetrics])

  // Polling
  useEffect(() => {
    const id = setInterval(() => fetchMetrics(false), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchMetrics])

  return { data, isLoading, error, source, refresh: () => fetchMetrics(false) }
}
