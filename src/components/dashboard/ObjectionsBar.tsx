"use client"

import type { Objection } from "@/types/dashboard"
import { cn } from "@/lib/utils"

interface ObjectionsBarProps {
  objections: Objection[]
}

const barColors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-amber-400",
  "bg-rose-400",
]

export function ObjectionsBar({ objections }: ObjectionsBarProps) {
  const max = objections[0]?.count ?? 1

  return (
    <div className="flex flex-col gap-3">
      {objections.map((obj, i) => (
        <div key={obj.label} className="flex items-center gap-3">
          <div className="w-[50%] text-xs text-gray-700 font-medium truncate text-right">{obj.label}</div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
              <div
                className={cn("h-full rounded-full transition-all duration-700", barColors[i % barColors.length])}
                style={{ width: `${(obj.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-500 w-8 text-right tabular-nums">
              {obj.percentage}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
