import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSeconds(seconds: number): string {
  if (seconds === 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function getProgressColor(value: number, meta: number): string {
  const pct = value / meta
  if (pct >= 1) return "bg-emerald-500"
  if (pct >= 0.7) return "bg-yellow-500"
  return "bg-red-500"
}
