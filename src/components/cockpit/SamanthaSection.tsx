"use client"

import { useEffect, useRef, useState } from "react"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SamanthaMetrics, TabulacaoMetric } from "@/lib/qick/metrics"

const REFRESH_MS = 5 * 60 * 1000

// ─── Metric card (violet palette) ────────────────────────────────────────────

function IAMetricCard({
  label,
  value,
  sublabel,
  highlight = false,
}: {
  label: string
  value: string
  sublabel?: string
  highlight?: boolean
}) {
  return (
    <div className={cn(
      "relative rounded-lg overflow-hidden flex flex-col",
      "shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
      highlight ? "bg-violet-50" : "bg-white border border-gray-100"
    )}>
      <div className={cn("h-1 w-full shrink-0", highlight ? "bg-violet-500" : "bg-violet-200")} />
      <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
        <span className="text-[10px] font-medium text-violet-600/60 uppercase tracking-widest leading-none">
          {label}
        </span>
        <div className={cn(
          "font-bold tabular-nums leading-none text-[2.5rem] tracking-[-0.02em]",
          highlight ? "text-violet-700" : "text-violet-800"
        )}>
          {value}
        </div>
        {sublabel && (
          <div className="text-[11px] text-violet-500/60">{sublabel}</div>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded animate-pulse bg-gray-100", className)} />
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden border border-gray-100">
            <div className="h-1 bg-violet-100" />
            <div className="px-4 pt-3 pb-4 flex flex-col gap-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-2 w-14" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-2.5 w-[44%]" />
            <Skeleton className="h-1.5 flex-1" />
            <Skeleton className="h-2.5 w-7" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tabulações bar chart (violet palette) ────────────────────────────────────

function TabulacoesBar({ tabulacoes }: { tabulacoes: TabulacaoMetric[] }) {
  if (tabulacoes.length === 0) return (
    <p className="text-[11px] text-gray-400 text-center py-4">Nenhuma tabulação registrada.</p>
  )

  const max = Math.max(...tabulacoes.map(t => t.quantidade), 1)

  const COLORS: Record<string, string> = {
    "5445": "bg-violet-500",
    "5447": "bg-emerald-400",
    "5446": "bg-red-400",
    "199":  "bg-amber-400",
    "116":  "bg-gray-300",
  }

  return (
    <div className="flex flex-col gap-2.5 py-1">
      {tabulacoes.map(tab => (
        <div key={tab.codigo} className="flex items-center gap-2">
          <div className="w-[44%] text-[11px] text-gray-600 font-medium truncate text-right leading-tight">
            {tab.nome}
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  COLORS[tab.codigo] ?? "bg-violet-300"
                )}
                style={{ width: tab.quantidade === 0 ? "2px" : `${(tab.quantidade / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-500 w-7 text-right tabular-nums shrink-0">
              {tab.quantidade > 0 ? `${tab.percentual}%` : "—"}
            </span>
            <span className="text-[10px] text-gray-400 w-6 text-right tabular-nums shrink-0">
              {tab.quantidade > 0 ? tab.quantidade : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export const SamanthaSection = () => {
  const [data, setData]       = useState<SamanthaMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = async () => {
    try {
      const resp = await fetch("/api/quick/calls")
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json() as SamanthaMetrics & { error?: string }
      if (json.error) throw new Error(json.error)
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    timerRef.current = setInterval(() => { void fetchData() }, REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="col-span-12 bg-white rounded-lg shadow-sm px-6 py-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-violet-100 text-violet-700 rounded-full px-2.5 py-1">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold tracking-wide uppercase">I.A</span>
          </div>
          <h2 className="text-sm font-semibold text-gray-600">
            SDR I.A — ANA + Maria
            <span className="text-violet-400 ml-1">✦</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {data?.fonte === "mock" && (
            <span className="text-[9px] font-semibold text-violet-400 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
              SIMULADO
            </span>
          )}
          <span className="text-[10px] text-gray-300">
            {data?.fonte === "live" ? "qick.ai · ao vivo" : "dados simulados"}
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="flex items-center justify-center py-6 text-[11px] text-red-400">
          {error}
        </div>
      ) : data && data.totalLigacoes === 0 ? (
        <div className="flex items-center justify-center py-6 text-[11px] text-gray-400">
          Nenhuma ligação registrada hoje.
        </div>
      ) : data ? (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-5 gap-3">
            <IAMetricCard
              label="Ligações Hoje"
              value={data.totalLigacoes.toString()}
              sublabel={`${data.ligacoesAtendidas} atendidas`}
            />
            <IAMetricCard
              label="Taxa de Contato"
              value={`${data.taxaContato}%`}
              sublabel="atendidas / total"
            />
            <IAMetricCard
              label="Taxa de Conversão"
              value={`${data.taxaConversao}%`}
              sublabel="demonstrou intenção"
              highlight
            />
            <IAMetricCard
              label="TMA"
              value={data.tma}
              sublabel="tempo médio atendidas"
            />
            <IAMetricCard
              label="Não Perturbe"
              value={`${data.taxaNaoPerturbe}%`}
              sublabel="pediu para não contatar"
            />
          </div>

          {/* Tabulações */}
          <TabulacoesBar tabulacoes={data.tabulacoes} />
        </>
      ) : null}
    </div>
  )
}
