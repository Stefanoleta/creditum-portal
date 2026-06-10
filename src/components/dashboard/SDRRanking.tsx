"use client"

import { cn, formatSeconds, getProgressColor } from "@/lib/utils"
import type { SDR } from "@/types/dashboard"
import { Phone, PhoneOff, Pause, Wifi } from "lucide-react"

interface SDRRankingProps {
  sdrs: SDR[]
}

const statusConfig = {
  em_ligacao: { label: "Em ligação",  icon: Phone,    color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  disponivel: { label: "Disponível",  icon: Wifi,     color: "text-blue-700 bg-blue-50 border-blue-200" },
  pausado:    { label: "Pausado",     icon: Pause,    color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  offline:    { label: "Offline",     icon: PhoneOff, color: "text-gray-400 bg-gray-100 border-gray-200" },
}

const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"]

const progressColorLight = {
  "bg-emerald-500": "bg-emerald-500",
  "bg-yellow-500": "bg-yellow-500",
  "bg-red-500": "bg-red-500",
}

function getProgressColorLight(value: number, meta: number): string {
  const pct = value / meta
  if (pct >= 1) return "bg-emerald-500"
  if (pct >= 0.7) return "bg-yellow-500"
  return "bg-red-500"
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("")
}

export function SDRRanking({ sdrs }: SDRRankingProps) {
  const sorted = [...sdrs].sort((a, b) => b.conversoes - a.conversoes)

  return (
    <div className="flex flex-col gap-1.5 h-full">
      {sorted.map((sdr, index) => {
        const { label, icon: StatusIcon, color } = statusConfig[sdr.status]
        const pctMeta = Math.min(100, Math.round((sdr.ligacoes_realizadas / sdr.meta_dia) * 100))
        const progressColor = getProgressColorLight(sdr.ligacoes_realizadas, sdr.meta_dia)

        return (
          <div
            key={sdr.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all",
              sdr.status === "offline"
                ? "border-gray-100 bg-gray-50 opacity-50"
                : "border-gray-100 bg-white hover:border-gray-200"
            )}
          >
            <span
              className={cn(
                "w-5 text-center text-sm font-bold shrink-0",
                index < 3 ? medalColors[index] : "text-gray-400"
              )}
            >
              {index + 1}
            </span>

            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-700">
                {getInitials(sdr.name)}
              </div>
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                sdr.status === "offline" ? "bg-gray-300" : sdr.status === "pausado" ? "bg-yellow-400" : "bg-emerald-400"
              )} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-gray-800 truncate">{sdr.name}</span>
                <span className="text-sm font-bold text-emerald-600 ml-2 shrink-0">
                  {sdr.conversoes} conv.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", progressColor)}
                    style={{ width: `${pctMeta}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                  {sdr.ligacoes_realizadas}/{sdr.meta_dia}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", color)}>
                <StatusIcon className="w-3 h-3" />
                {label}
              </span>
              {sdr.tma_segundos > 0 && (
                <span className="text-xs text-gray-400">TMA {formatSeconds(sdr.tma_segundos)}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
