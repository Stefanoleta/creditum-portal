"use client"

import { cn } from "@/lib/utils"

interface ScoreBadgeProps {
  score: number
  size?: "sm" | "md" | "lg"
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const color =
    score >= 8 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    score >= 6 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                 "bg-red-100 text-red-700 border-red-200"

  const sizeClass =
    size === "sm" ? "text-xs px-1.5 py-0.5" :
    size === "lg" ? "text-2xl px-3 py-1 font-extrabold" :
                   "text-sm px-2 py-0.5 font-bold"

  return (
    <span className={cn("inline-flex items-center rounded-full border", color, sizeClass)}>
      {score.toFixed(1)}
    </span>
  )
}

export function scoreColor(score: number) {
  if (score >= 8) return "text-emerald-600"
  if (score >= 6) return "text-yellow-600"
  return "text-red-500"
}
