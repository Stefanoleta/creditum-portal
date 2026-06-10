"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface MetricCardProps {
  label: string
  value: string
  sublabel?: string
  icon?: LucideIcon
  variant?: "default" | "success" | "warning" | "danger" | "info"
  pulse?: boolean
}

const topBar: Record<NonNullable<MetricCardProps["variant"]>, string> = {
  default: "bg-gray-300",
  success: "bg-[#0D5C3A]",
  warning: "bg-[#D97706]",
  danger:  "bg-[#DC2626]",
  info:    "bg-gray-400",
}

const valueColor: Record<NonNullable<MetricCardProps["variant"]>, string> = {
  default: "text-gray-900",
  success: "text-[#0D5C3A]",
  warning: "text-[#D97706]",
  danger:  "text-[#DC2626]",
  info:    "text-gray-800",
}

export function MetricCard({
  label,
  value,
  sublabel,
  variant = "default",
  pulse = false,
}: MetricCardProps) {
  return (
    <div className="relative bg-white rounded-lg border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
      {/* 4px status bar */}
      <div className={cn("h-1 w-full shrink-0", topBar[variant])} />

      <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
        {pulse && (
          <span className="absolute top-[18px] right-3 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}

        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest leading-none pr-4">
          {label}
        </span>

        <div
          className={cn(
            "font-bold tabular-nums leading-none",
            "text-[2.5rem]",
            "tracking-[-0.02em]",
            valueColor[variant]
          )}
        >
          {value}
        </div>

        {sublabel && (
          <div className="text-[11px] text-gray-400">{sublabel}</div>
        )}
      </div>
    </div>
  )
}
