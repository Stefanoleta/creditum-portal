"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { HourlyMetric } from "@/types/dashboard"

interface HourlyChartProps {
  data: HourlyMetric[]
}

export function HourlyChart({ data }: HourlyChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="hora"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            fontSize: 12,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
          labelStyle={{ color: "#374151", fontWeight: 600 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#6b7280", paddingTop: 4 }}
        />
        <Bar dataKey="ligacoes"  name="Ligações"   fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={24} />
        <Bar dataKey="contatos"  name="Contatos"   fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={24} />
        <Bar dataKey="conversoes" name="Conversões" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
