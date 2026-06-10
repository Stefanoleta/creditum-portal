"use client"

import type { Occurrence } from "@/types/dashboard"
import { cn } from "@/lib/utils"
import { LayoutList } from "lucide-react"

interface OccurrencesBarProps {
  occurrences: Occurrence[]
}

export function OccurrencesBar({ occurrences }: OccurrencesBarProps) {
  if (occurrences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4 text-gray-300">
        <LayoutList className="w-6 h-6" />
        <span className="text-[11px] text-gray-400 text-center leading-tight">
          Aguardando tabulações<br />do Argus...
        </span>
      </div>
    )
  }

  const max = Math.max(...occurrences.map((o) => o.count), 1)

  return (
    <div className="flex flex-col gap-2">
      {occurrences.map((occ) => (
        <div key={occ.label} className="flex items-center gap-2">
          <div className="w-[48%] text-[11px] text-gray-600 font-medium truncate text-right leading-tight">
            {occ.label}
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", occ.color)}
                style={{ width: occ.count === 0 ? "2px" : `${(occ.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-400 w-7 text-right tabular-nums shrink-0">
              {occ.count > 0 ? `${occ.percentage}%` : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
