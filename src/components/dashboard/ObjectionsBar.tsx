"use client"

import type { Objection } from "@/types/dashboard"
import { cn } from "@/lib/utils"
import { MessageSquareOff } from "lucide-react"

interface ObjectionsBarProps {
  objections: Objection[]
}

const barColors = [
  "bg-[#DC2626]",
  "bg-[#D97706]",
  "bg-amber-400",
  "bg-orange-400",
  "bg-rose-400",
]

export function ObjectionsBar({ objections }: ObjectionsBarProps) {
  if (objections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4 text-gray-300">
        <MessageSquareOff className="w-6 h-6" />
        <span className="text-[11px] text-gray-400 text-center leading-tight">
          Aguardando tabulações<br />do Argus...
        </span>
      </div>
    )
  }

  const max = objections[0]?.count ?? 1

  return (
    <div className="flex flex-col gap-2.5">
      {objections.map((obj, i) => (
        <div key={obj.label} className="flex items-center gap-2">
          <div className="w-[48%] text-[11px] text-gray-600 font-medium truncate text-right leading-tight">
            {obj.label}
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", barColors[i % barColors.length])}
                style={{ width: `${(obj.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-400 w-7 text-right tabular-nums shrink-0">
              {obj.percentage}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
