"use client"

import { cn, formatSeconds } from "@/lib/utils"
import type { LiveCall } from "@/types/dashboard"
import { PhoneCall, PhoneIncoming } from "lucide-react"

interface LiveCallsProps {
  calls: LiveCall[]
}

// Shows duration_seconds statically — ligacoesdetalhadas returns completed calls,
// so a live counting timer would inflate to hours from the historical started_at.
function CallDuration({ durationSeconds }: { durationSeconds: number }) {
  const isLong = durationSeconds > 600
  return (
    <span className={cn(
      "tabular-nums font-mono text-sm font-bold",
      isLong ? "text-[#D97706]" : "text-[#0D5C3A]"
    )}>
      {formatSeconds(durationSeconds)}
    </span>
  )
}

export function LiveCalls({ calls }: LiveCallsProps) {
  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-6 text-gray-300">
        <PhoneCall className="w-8 h-8" />
        <span className="text-xs text-gray-400">Nenhuma ligação ativa no momento</span>
      </div>
    )
  }

  // Max 2 cards — one per active SDR (already deduped upstream)
  const visible = calls.slice(0, 2)

  return (
    <div className="flex flex-col gap-2">
      {visible.map((call) => {
        const isRinging = call.status === "tocando"
        return (
          <div
            key={call.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 border transition-colors",
              isRinging
                ? "border-amber-200 bg-amber-50"
                : "border-gray-100 bg-white"
            )}
          >
            <div className={cn(
              "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              isRinging ? "bg-amber-100 text-[#D97706]" : "bg-emerald-50 text-[#0D5C3A]"
            )}>
              {isRinging
                ? <PhoneIncoming className="w-3.5 h-3.5" />
                : <PhoneCall className="w-3.5 h-3.5" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate leading-tight">
                {call.sdr_name}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{call.school_name}</div>
            </div>

            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <CallDuration durationSeconds={call.duration_seconds} />
              <div className="text-[10px] text-gray-400">
                {isRinging ? "Chamando..." : "Em andamento"}
              </div>
            </div>
          </div>
        )
      })}

      {calls.length > 2 && (
        <p className="text-[10px] text-gray-400 text-center pt-1">
          +{calls.length - 2} outras ligações
        </p>
      )}
    </div>
  )
}
