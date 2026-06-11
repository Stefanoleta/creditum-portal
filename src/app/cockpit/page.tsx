"use client"

import Image from "next/image"
import Link from "next/link"
import { useDashboard } from "@/hooks/useDashboard"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { SDRRanking } from "@/components/dashboard/SDRRanking"
import { LiveCalls } from "@/components/dashboard/LiveCalls"
import { OccurrencesBar } from "@/components/dashboard/OccurrencesBar"
import { StatusBar } from "@/components/dashboard/StatusBar"
import { MockDataBanner } from "@/components/ui-shared/MockDataBanner"
import { formatSeconds, formatPercent } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { AlertCircle, BarChart3, Microscope, List } from "lucide-react"

export default function CockpitPage() {
  const { data, isLoading, error, source, tabulacoesSource } = useDashboard()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-[#0D5C3A] rounded-full animate-spin" />
          <span className="text-xs text-gray-400">Carregando cockpit...</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#DC2626]">
          <AlertCircle className="w-7 h-7" />
          <span className="text-sm">{error ?? "Dados indisponíveis"}</span>
        </div>
      </div>
    )
  }

  const { metrics, sdrs, live_calls, top_objections, occurrences, last_updated } = data

  const taxaConvGood   = metrics.taxa_conversao >= 10
  const taxaContatoGood = metrics.taxa_contato >= 65

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 flex flex-col select-none">
      <MockDataBanner isDemo={source === "mock"} reason="Argus inacessível" />
      <StatusBar metrics={metrics} lastUpdated={last_updated} source={source} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-creditum.png"
            alt="Creditum"
            height={24}
            width={68}
            priority
            className="object-contain"
          />
          <span className="text-gray-200 select-none">|</span>
          <span className="text-sm font-medium text-gray-500">SDR Cockpit</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <Link href="/relatorios" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> Relatórios
          </Link>
          <Link href="/analise" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <Microscope className="w-3.5 h-3.5" /> Análise
          </Link>
          <Link href="/listas" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <List className="w-3.5 h-3.5" /> Listas
          </Link>
          <span className="text-gray-300">·</span>
          <span className="tabular-nums text-[11px]">
            {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-12 gap-3 p-4 content-start">

        {/* Row 1: KPI cards */}
        <div className="col-span-12 grid grid-cols-7 gap-3">
          <MetricCard
            label="TME"
            value={formatSeconds(metrics.tme_segundos)}
            sublabel="Meta: até 2:00"
            variant={metrics.tme_segundos <= 120 ? "success" : "danger"}
          />
          <MetricCard
            label="TMA"
            value={formatSeconds(metrics.tma_segundos)}
            sublabel="Meta: 3:00 – 6:00"
            variant={metrics.tma_segundos >= 180 && metrics.tma_segundos <= 360 ? "success" : "warning"}
          />
          <MetricCard
            label="Taxa de Contato"
            value={formatPercent(metrics.taxa_contato)}
            sublabel="Meta: ≥ 65%"
            variant={taxaContatoGood ? "success" : "danger"}
          />

          {/* Taxa de Conversão — destaque emerald */}
          <div className="relative bg-emerald-50 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">
            <div className={cn("h-1 w-full shrink-0", taxaConvGood ? "bg-emerald-500" : "bg-amber-400")} />
            <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
              <span className="text-[10px] font-medium text-emerald-700/60 leading-none">Taxa de Conversão</span>
              <div className={cn(
                "font-bold tabular-nums leading-none text-[2.5rem] tracking-[-0.03em]",
                taxaConvGood ? "text-emerald-700" : "text-amber-600"
              )}>
                {formatPercent(metrics.taxa_conversao)}
              </div>
              <div className="text-[11px] text-emerald-600/50">Meta: ≥ 10%</div>
            </div>
          </div>

          {/* Ligações Hoje — destaque slate com pulse */}
          <div className="relative bg-slate-50 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">
            <div className="h-1 w-full shrink-0 bg-slate-300" />
            <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-medium text-slate-500 leading-none">Ligações Hoje</span>
              </span>
              <div className="font-bold tabular-nums leading-none text-[2.5rem] tracking-[-0.03em] text-slate-800">
                {metrics.total_ligacoes.toString()}
              </div>
              <div className="text-[11px] text-slate-400">{metrics.total_conversoes} conversões</div>
            </div>
          </div>

          {/* Contatos Hoje (alôs) — destaque amber */}
          <div className="relative bg-amber-50 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">
            <div className={cn("h-1 w-full shrink-0", taxaContatoGood ? "bg-amber-400" : "bg-red-400")} />
            <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
              <span className="text-[10px] font-medium text-amber-700/60 leading-none">Contatos Hoje</span>
              <div className="font-bold tabular-nums leading-none text-[2.5rem] tracking-[-0.03em] text-amber-700">
                {metrics.total_contatos.toString()}
              </div>
              <div className={cn("text-[11px]", taxaContatoGood ? "text-amber-500/70" : "text-red-400")}>
                {formatPercent(metrics.taxa_contato)} contato
              </div>
            </div>
          </div>

          <MetricCard
            label="SDRs Ativos"
            value={`${sdrs.filter(s => s.status !== "offline").length}`}
            sublabel={`${metrics.sdrs_em_ligacao} em ligação agora`}
            variant={metrics.sdrs_em_ligacao > 0 ? "success" : "default"}
          />
        </div>

        {/* Row 2: Ranking | Ligações do Dia */}
        <div className="col-span-5 bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3 overflow-hidden min-h-[260px]">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-gray-600">Ranking SDRs</h2>
            <span className="text-[10px] text-gray-300">{sdrs.length} agentes</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SDRRanking sdrs={sdrs} />
          </div>
        </div>

        <div className="col-span-7 bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3 min-h-[260px]">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-gray-600">Ligações do Dia</h2>
            <span className="text-[10px] text-gray-300">{live_calls.length} registros</span>
          </div>
          <div className="flex-1">
            <LiveCalls calls={live_calls} />
          </div>
        </div>

        {/* Row 3: Ocorrências — valores exatos do Argus, largura total */}
        <div className="col-span-12 bg-white rounded-lg shadow-sm px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-gray-600">Ocorrências</h2>
            {tabulacoesSource === "mock" && source !== "mock" && (
              <span className="text-[9px] text-[#D97706] bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">demo</span>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <OccurrencesBar occurrences={occurrences} />
          </div>
        </div>

      </div>
    </div>
  )
}
