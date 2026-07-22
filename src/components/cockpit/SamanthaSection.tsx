"use client"

import { useEffect, useRef, useState } from "react"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SamanthaMetrics, TabulacaoMetric } from "@/lib/qick/metrics"
import type { QickNormalizedCall } from "@/lib/qick/client"
import { computeSamanthaMetrics } from "@/lib/qick/metrics"

const REFRESH_MS = 5 * 60 * 1000

const AGENT_MAP: Record<string, string> = {
  "01KV5T37PTNV6N6QN0H7SCP38Q": "ANA",
  "01KX6KGRPA720KEJJTNMK2HKVY": "Maria",
}

function resolveAgent(call: QickNormalizedCall): string {
  if (call.agentId && AGENT_MAP[call.agentId]) return AGENT_MAP[call.agentId]
  return "Outro"
}

function IAMetricCard({ label, value, sublabel, highlight = false }: {
  label: string; value: string; sublabel?: string; highlight?: boolean
}) {
  return (
    <div className={cn("relative rounded-lg overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.06)]", highlight ? "bg-violet-50" : "bg-white border border-gray-100")}>
      <div className={cn("h-1 w-full shrink-0", highlight ? "bg-violet-500" : "bg-violet-200")} />
      <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
        <span className="text-[10px] font-medium text-violet-600/60 uppercase tracking-widest leading-none">{label}</span>
        <div className={cn("font-bold tabular-nums leading-none text-[2rem] tracking-[-0.02em]", highlight ? "text-violet-700" : "text-violet-800")}>{value}</div>
        {sublabel && <div className="text-[11px] text-violet-500/60">{sublabel}</div>}
      </div>
    </div>
  )
}

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
    </div>
  )
}

function TabulacoesBar({ tabulacoes }: { tabulacoes: TabulacaoMetric[] }) {
  if (tabulacoes.length === 0) return (
    <p className="text-[11px] text-gray-400 text-center py-4">Nenhuma tabulação registrada.</p>
  )
  const max = Math.max(...tabulacoes.map(t => t.quantidade), 1)
  const COLORS: Record<string, string> = {
    "5445": "bg-violet-500", "5447": "bg-emerald-400",
    "5446": "bg-red-400", "199": "bg-amber-400", "116": "bg-gray-300",
  }
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {tabulacoes.map(tab => (
        <div key={tab.codigo} className="flex items-center gap-2">
          <div className="w-[44%] text-[11px] text-gray-600 font-medium truncate text-right leading-tight">{tab.nome}</div>
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-700", COLORS[tab.codigo] ?? "bg-violet-300")}
                style={{ width: tab.quantidade === 0 ? "2px" : `${(tab.quantidade / max) * 100}%` }} />
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

function AgentPanel({ name, color, data, loading, error }: {
  name: string; color: "violet" | "teal"
  data: SamanthaMetrics | null; loading: boolean; error: string | null
}) {
  const border = color === "violet" ? "border-t-violet-400" : "border-t-teal-400"
  const badge  = color === "violet" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"
  return (
    <div className={cn("flex-1 bg-white rounded-lg shadow-sm px-5 py-4 flex flex-col gap-3 border-t-2", border)}>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("text-[11px] font-bold tracking-wide uppercase rounded-full px-2.5 py-1", badge)}>
          <Bot className="inline w-3 h-3 mr-1" />{name}
        </span>
        {data?.fonte === "mock" && (
          <span className="text-[9px] font-semibold text-violet-400 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 uppercase tracking-wide">SIMULADO</span>
        )}
      </div>
      {loading ? <LoadingSkeleton /> : error ? (
        <div className="text-[11px] text-red-400 py-4 text-center">{error}</div>
      ) : !data || data.totalLigacoes === 0 ? (
        <div className="text-[11px] text-gray-400 py-4 text-center">Nenhuma ligação hoje.</div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-2">
            <IAMetricCard label="Ligações" value={data.totalLigacoes.toString()} sublabel={`${data.ligacoesAtendidas} atendidas`} />
            <IAMetricCard label="Contato" value={`${data.taxaContato}%`} sublabel="atendidas / total" />
            <IAMetricCard label="Conversão" value={`${data.taxaConversao}%`} sublabel="demonstrou intenção" highlight />
            <IAMetricCard label="TMA" value={data.tma} sublabel="tempo médio" />
            <IAMetricCard label="Não Perturbe" value={`${data.taxaNaoPerturbe}%`} sublabel="não contatar" />
          </div>
          <TabulacoesBar tabulacoes={data.tabulacoes} />
        </>
      )}
    </div>
  )
}

export const SamanthaSection = () => {
  const [dataANA,   setDataANA]   = useState<SamanthaMetrics | null>(null)
  const [dataMaria, setDataMaria] = useState<SamanthaMetrics | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = async () => {
    try {
      const resp = await fetch("/api/quick/calls")
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json() as { calls?: QickNormalizedCall[]; fonte?: string; error?: string }
      if (json.error) throw new Error(json.error)
      const calls = json.calls ?? []
      const fonte = (json.fonte ?? "live") as "live" | "mock"
      setDataANA(computeSamanthaMetrics(calls.filter(c => resolveAgent(c) === "ANA"), fonte))
      setDataMaria(computeSamanthaMetrics(calls.filter(c => resolveAgent(c) === "Maria"), fonte))
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
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5 bg-violet-100 text-violet-700 rounded-full px-2.5 py-1">
          <Bot className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold tracking-wide uppercase">SDR I.A</span>
        </div>
        <h2 className="text-sm font-semibold text-gray-600">ANA + Maria — análise separada</h2>
      </div>
      <div className="flex gap-4">
        <AgentPanel name="ANA"   color="violet" data={dataANA}   loading={loading} error={error} />
        <AgentPanel name="Maria" color="teal"   data={dataMaria} loading={loading} error={error} />
      </div>
    </div>
  )
}
