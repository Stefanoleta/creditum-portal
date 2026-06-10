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
            borderRadius: "6px",
            fontSize: 12,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
          labelStyle={{ color: "#374151", fontWeight: 600 }}
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#9ca3af", paddingTop: 6 }}
        />
        <Bar dataKey="ligacoes"   name="Ligações"   fill="#6B7280" radius={[3, 3, 0, 0]} maxBarSize={20} />
        <Bar dataKey="contatos"   name="Contatos"   fill="#D97706" radius={[3, 3, 0, 0]} maxBarSize={20} />
        <Bar dataKey="conversoes" name="Conversões" fill="#0D5C3A" radius={[3, 3, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}
