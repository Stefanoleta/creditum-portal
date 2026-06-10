"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface DataTimestampProps {
  updatedAt: string | Date | null
  className?: string
  label?: string
}

export function DataTimestamp({
  updatedAt,
  className,
  label = "Atualizado em",
}: DataTimestampProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!updatedAt) {
    return (
      <span className={cn("text-xs text-gray-400 tabular-nums", className)}>
        {label}: —
      </span>
    )
  }

  const dt = new Date(updatedAt)
  const ageMs = now.getTime() - dt.getTime()
  const ageSec = Math.floor(ageMs / 1000)

  const color =
    ageSec > 1800
      ? "text-red-600 font-semibold"
      : ageSec > 600
      ? "text-amber-600 font-medium"
      : "text-gray-400"

  const ageLabel =
    ageSec > 1800
      ? ` · ${Math.floor(ageSec / 60)} min atrás`
      : ageSec > 600
      ? ` · ${Math.floor(ageSec / 60)} min atrás`
      : ""

  return (
    <span className={cn("text-xs tabular-nums", color, className)}>
      {label}:{" "}
      {dt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
      {ageLabel}
    </span>
  )
}
