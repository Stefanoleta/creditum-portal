"use client"

import Image from "next/image"
import Link from "next/link"
import { useDashboard } from "@/hooks/useDashboard"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { SDRRanking } from "@/components/dashboard/SDRRanking"
import { LiveCalls } from "@/components/dashboard/LiveCalls"
import { ObjectionsBar } from "@/components/dashboard/ObjectionsBar"
import { OccurrencesBar } from "@/components/dashboard/OccurrencesBar"
import { HourlyChart } from "@/components/dashboard/HourlyChart"
import { StatusBar } from "@/components/dashboard/StatusBar"
import { MockDataBanner } from "@/components/ui-shared/MockDataBanner"
import { formatSeconds, formatPercent } from "@/lib/utils"
import {
  Clock,
  PhoneCall,
  Users,
  TrendingUp,
  Phone,
  Target,
  AlertCircle,
  BarChart3,
  Microscope,
} from "lucide-react"

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

  const { metrics, sdrs, live_calls, top_objections, occurrences, hourly_chart, last_updated } = data

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 flex flex-col select-none">
      <MockDataBanner isDemo={source === "mock"} reason="Argus inacessível" />

      {/* Thin status bar (dark green) */}
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
          <div className="w-px h-5 bg-gray-150" />
          <span className="text-xs text-gray-400 font-medium tracking-wide">SDR Cockpit</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-gray-400">
          <Link href="/relatorios" className="flex items-center gap-1 hover:text-gray-600 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> Relatórios
          </Link>
          <Link href="/analise" className="flex items-center gap-1 hover:text-gray-600 transition-colors">
            <Microscope className="w-3.5 h-3.5" /> Análise
          </Link>
          <span className="text-gray-300 select-none">·</span>
          <span className="tabular-nums">
            {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-12 grid-rows-[auto_1fr_1fr] gap-3 p-4">

        {/* KPI Row — 6 cards */}
        <div className="col-span-12 grid grid-cols-6 gap-3">
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
            variant={metrics.taxa_contato >= 65 ? "success" : "danger"}
          />
          <MetricCard
            label="Taxa de Conversão"
            value={formatPercent(metrics.taxa_conversao)}
            sublabel="Meta: ≥ 10%"
            variant={metrics.taxa_conversao >= 10 ? "success" : "warning"}
          />
          <MetricCard
            label="Ligações Hoje"
            value={metrics.total_ligacoes.toString()}
            sublabel={`${metrics.total_conversoes} conversões`}
            variant="info"
            pulse
          />
          <MetricCard
            label="SDRs Ativos"
            value={`${sdrs.filter(s => s.status !== "offline").length}`}
            sublabel={`${metrics.sdrs_em_ligacao} em ligação agora`}
            variant={metrics.sdrs_em_ligacao > 0 ? "success" : "default"}
          />
        </div>

        {/* Row 2: Ranking | Live Calls | Objeções + Ocorrências */}
        <div className="col-span-4 bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Ranking SDRs
            </h2>
            <span className="text-[10px] text-gray-300">{sdrs.length} agentes</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SDRRanking sdrs={sdrs} />
          </div>
        </div>

        <div className="col-span-4 bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Ligações do Dia
            </h2>
            <span className="text-[10px] text-gray-300">{live_calls.length} registros</span>
          </div>
          <div className="flex-1">
            <LiveCalls calls={live_calls} />
          </div>
        </div>

        {/* Objeções + Ocorrências side by side */}
        <div className="col-span-4 grid grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                Objeções
              </h2>
              {tabulacoesSource === "mock" && source !== "mock" && (
                <span className="text-[9px] text-[#D97706] bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">demo</span>
              )}
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <ObjectionsBar objections={top_objections} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                Ocorrências
              </h2>
              {tabulacoesSource === "mock" && source !== "mock" && (
                <span className="text-[9px] text-[#D97706] bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">demo</span>
              )}
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <OccurrencesBar occurrences={occurrences} />
            </div>
          </div>
        </div>

        {/* Row 3: Hourly Chart */}
        <div className="col-span-12 bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest shrink-0">
            Produção por Hora
          </h2>
          <div className="flex-1 min-h-[120px]">
            <HourlyChart data={hourly_chart} />
          </div>
        </div>
      </div>
    </div>
  )
}
