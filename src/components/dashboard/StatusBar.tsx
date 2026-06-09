"use client"

import type { DashboardMetrics } from "@/types/dashboard"
import { Phone, UserCheck, UserX, Wifi } from "lucide-react"

interface StatusBarProps {
  metrics: DashboardMetrics
  lastUpdated: string
}

export function StatusBar({ metrics, lastUpdated }: StatusBarProps) {
  const time = new Date(lastUpdated).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-gray-200 text-xs text-gray-500 shadow-sm">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-medium text-emerald-600">Ao vivo</span>
        </span>
        <span className="flex items-center gap-1">
          <Phone className="w-3 h-3" />
          {metrics.ligacoes_ativas} ligações ativas
        </span>
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <UserCheck className="w-3 h-3" />
          {metrics.sdrs_disponiveis} SDRs disponíveis
        </span>
        <span className="flex items-center gap-1 text-blue-600 font-medium">
          <Wifi className="w-3 h-3" />
          {metrics.sdrs_em_ligacao} em ligação
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <UserX className="w-3 h-3" />
          {metrics.sdrs_offline} offline
        </span>
      </div>
      <div className="flex items-center gap-4 text-gray-400">
        <span>Creditum Portal — SDR Cockpit</span>
        <span className="tabular-nums font-mono font-medium text-gray-600">{time}</span>
      </div>
    </div>
  )
}
