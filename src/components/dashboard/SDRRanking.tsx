"use client"

import { cn, formatSeconds } from "@/lib/utils"
import type { SDR } from "@/types/dashboard"

interface SDRRankingProps {
  sdrs: SDR[]
}

const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"]

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function statusDotClass(status: SDR["status"]) {
  if (status === "offline") return "bg-gray-300"
  if (status === "pausado") return "bg-[#D97706]"
  return "bg-[#0D5C3A]"
}

function statusLabel(status: SDR["status"]) {
  if (status === "em_ligacao") return "Em ligação"
  if (status === "pausado")    return "Pausado"
  if (status === "offline")    return "Offline"
  return "Disponível"
}

export function SDRRanking({ sdrs }: SDRRankingProps) {
  const sorted = [...sdrs].sort((a, b) => b.conversoes - a.conversoes)

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300 py-6">
        <span className="text-2xl">—</span>
        <span className="text-xs text-gray-400">Nenhum SDR ativo</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {sorted.map((sdr, index) => {
        const pct = Math.min(100, Math.round((sdr.ligacoes_realizadas / sdr.meta_dia) * 100))
        const isOffline = sdr.status === "offline"
        const barColor = pct >= 100 ? "bg-[#0D5C3A]" : pct >= 60 ? "bg-[#D97706]" : "bg-[#DC2626]"

        return (
          <div key={sdr.id}>
            {index > 0 && <div className="h-px bg-gray-100 mx-1" />}

            <div className={cn(
              "flex items-center gap-3 px-2 py-2.5 rounded-md transition-colors",
              isOffline ? "opacity-40" : "hover:bg-gray-50"
            )}>
              {/* Rank */}
              <span className={cn(
                "w-4 text-center text-xs font-bold shrink-0",
                index < 3 ? medalColors[index] : "text-gray-300"
              )}>
                {index + 1}
              </span>

              {/* Avatar + online dot */}
              <div className="relative shrink-0">
                <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600">
                  {getInitials(sdr.name)}
                </div>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white",
                  statusDotClass(sdr.status)
                )} />
              </div>

              {/* Name + progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-800 truncate leading-none">
                    {sdr.name}
                  </span>
                  <span className="text-xs font-bold text-[#0D5C3A] ml-2 shrink-0 tabular-nums">
                    {sdr.conversoes}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 tabular-nums w-10 text-right">
                    {sdr.ligacoes_realizadas}/{sdr.meta_dia}
                  </span>
                </div>
              </div>

              {/* Status + TMA */}
              <div className="shrink-0 text-right hidden sm:block">
                <div className="text-[10px] text-gray-400 leading-none">{statusLabel(sdr.status)}</div>
                {sdr.tma_segundos > 0 && (
                  <div className="text-[10px] text-gray-300 mt-0.5">TMA {formatSeconds(sdr.tma_segundos)}</div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
