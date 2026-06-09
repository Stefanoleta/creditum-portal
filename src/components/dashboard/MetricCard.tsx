"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface MetricCardProps {
  label: string
  value: string
  sublabel?: string
  icon: LucideIcon
  variant?: "default" | "success" | "warning" | "danger" | "info"
  pulse?: boolean
}

const variantStyles = {
  default:  { card: "border-gray-200",   iconBg: "bg-gray-100",    icon: "text-gray-500",   value: "text-gray-900" },
  success:  { card: "border-emerald-200", iconBg: "bg-emerald-50",  icon: "text-emerald-600", value: "text-emerald-700" },
  warning:  { card: "border-yellow-200",  iconBg: "bg-yellow-50",   icon: "text-yellow-600",  value: "text-yellow-700" },
  danger:   { card: "border-red-200",     iconBg: "bg-red-50",      icon: "text-red-600",     value: "text-red-700" },
  info:     { card: "border-blue-200",    iconBg: "bg-blue-50",     icon: "text-blue-600",    value: "text-blue-700" },
}

export function MetricCard({
  label,
  value,
  sublabel,
  icon: Icon,
  variant = "default",
  pulse = false,
}: MetricCardProps) {
  const s = variantStyles[variant]
  return (
    <div className={cn("relative bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-2", s.card)}>
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", s.iconBg)}>
          <Icon className={cn("w-3.5 h-3.5", s.icon)} />
        </div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight">
          {label}
        </span>
      </div>
      <div className={cn("text-4xl font-bold tabular-nums leading-none", s.value)}>
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-gray-400">{sublabel}</div>
      )}
    </div>
  )
}
