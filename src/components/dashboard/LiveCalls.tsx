"use client"

import { cn, formatSeconds } from "@/lib/utils"
import type { LiveCall } from "@/types/dashboard"
import { PhoneCall, PhoneIncoming, Clock } from "lucide-react"

interface LiveCallsProps {
  calls: LiveCall[]
}

// ligacoesdetalhadas returns completed calls — show duration_seconds statically.
// A live counting timer would inflate to hours because started_at is in the past.
function CallDuration({ durationSeconds }: { durationSeconds: number }) {
  const isLong = durationSeconds > 300
  return (
    <span className={cn("tabular-nums font-mono text-sm font-bold", isLong ? "text-red-600" : "text-emerald-600")}>
      {formatSeconds(durationSeconds)}
    </span>
  )
}

export function LiveCalls({ calls }: LiveCallsProps) {
  if (calls.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Nenhuma ligação ativa no momento
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {calls.map((call) => {
        const isRinging = call.status === "tocando"
        return (
          <div
            key={call.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 border",
              isRinging
                ? "border-yellow-200 bg-yellow-50 animate-pulse"
                : "border-gray-100 bg-white"
            )}
          >
            <div className={cn("shrink-0", isRinging ? "text-yellow-600" : "text-emerald-600")}>
              {isRinging ? (
                <PhoneIncoming className="w-4 h-4" />
              ) : (
                <PhoneCall className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{call.sdr_name}</div>
              <div className="text-xs text-gray-500 truncate">{call.school_name}</div>
            </div>

            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <CallDuration durationSeconds={call.duration_seconds} />
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-2.5 h-2.5" />
                {isRinging ? "Chamando..." : "Em andamento"}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
