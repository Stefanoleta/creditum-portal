"use client"

import { cn } from "@/lib/utils"
import type { DashboardMetrics } from "@/types/dashboard"
import { FlaskConical } from "lucide-react"

interface StatusBarProps {
  metrics: DashboardMetrics
  lastUpdated: string
  source?: "argus" | "mock" | null
}

export function StatusBar({ metrics, lastUpdated, source }: StatusBarProps) {
  const time = new Date(lastUpdated).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return (
    <div className="flex items-center justify-between px-5 py-1 bg-[#0D5C3A] text-xs text-emerald-100">
      <div className="flex items-center gap-4">
        {source === "mock" ? (
          <span className="flex items-center gap-1 text-amber-300 font-medium">
            <FlaskConical className="w-3 h-3" />
            Dados simulados
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-medium text-emerald-200">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-300" />
            </span>
            Argus ao vivo
          </span>
        )}

        <span className="text-emerald-300 select-none">·</span>

        <span className={cn(
          "font-medium",
          metrics.sdrs_em_ligacao > 0 ? "text-emerald-200" : "text-emerald-400"
        )}>
          {metrics.sdrs_em_ligacao} em ligação
        </span>

        <span className="text-emerald-400">
          {metrics.sdrs_disponiveis} disponíveis
        </span>

        <span className="text-emerald-500">
          {metrics.sdrs_offline} offline
        </span>
      </div>

      <span className="tabular-nums font-mono text-emerald-300 text-[11px]">
        {time}
      </span>
    </div>
  )
}
