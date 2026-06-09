"use client"

import { useState, useEffect, useCallback } from "react"
import type { DashboardData } from "@/types/dashboard"
import { generateMockDashboard, simulateLiveUpdate } from "@/lib/mock-data"

const REFRESH_INTERVAL_MS = 5000

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      // When Argus API is connected, replace this with:
      // const res = await fetch("/api/dashboard/metrics")
      // const json = await res.json()
      // setData(json)
      setData((prev) => (prev ? simulateLiveUpdate(prev) : generateMockDashboard()))
      setError(null)
    } catch (e) {
      setError("Falha ao atualizar dados")
      console.error(e)
    }
  }, [])

  useEffect(() => {
    setData(generateMockDashboard())
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { data, isLoading, error, refresh }
}
