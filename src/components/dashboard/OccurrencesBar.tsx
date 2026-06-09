"use client"

import type { Occurrence } from "@/types/dashboard"
import { cn } from "@/lib/utils"

interface OccurrencesBarProps {
  occurrences: Occurrence[]
}

export function OccurrencesBar({ occurrences }: OccurrencesBarProps) {
  const max = Math.max(...occurrences.map((o) => o.count), 1)

  return (
    <div className="flex flex-col gap-2.5">
      {occurrences.map((occ) => (
        <div key={occ.label} className="flex items-center gap-2">
          <div className="w-[52%] text-xs text-gray-700 font-medium truncate text-right leading-tight">
            {occ.label}
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
              <div
                className={cn("h-full rounded-full transition-all duration-700", occ.color)}
                style={{ width: occ.count === 0 ? "2px" : `${(occ.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-500 w-7 text-right tabular-nums shrink-0">
              {occ.count > 0 ? `${occ.percentage}%` : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
