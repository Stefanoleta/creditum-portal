"use client"

import Image from "next/image"
import { useDashboard } from "@/hooks/useDashboard"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { SDRRanking } from "@/components/dashboard/SDRRanking"
import { LiveCalls } from "@/components/dashboard/LiveCalls"
import { ObjectionsBar } from "@/components/dashboard/ObjectionsBar"
import { OccurrencesBar } from "@/components/dashboard/OccurrencesBar"
import { HourlyChart } from "@/components/dashboard/HourlyChart"
import { StatusBar } from "@/components/dashboard/StatusBar"
import { MockDataBanner } from "@/components/ui-shared/MockDataBanner"
import { DataTimestamp } from "@/components/ui-shared/DataTimestamp"
import { formatSeconds, formatPercent } from "@/lib/utils"
import {
  Clock,
  PhoneCall,
  Users,
  TrendingUp,
  Phone,
  Target,
  AlertCircle,
} from "lucide-react"

export default function CockpitPage() {
  const { data, isLoading, error, source } = useDashboard()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Carregando cockpit...</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-red-500">
          <AlertCircle className="w-8 h-8" />
          <span>{error ?? "Dados indisponíveis"}</span>
        </div>
      </div>
    )
  }

  const { metrics, sdrs, live_calls, top_objections, occurrences, hourly_chart, last_updated } = data

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-gray-900 flex flex-col select-none">
      <MockDataBanner isDemo={source === "mock"} reason="Argus inacessível" />
      <StatusBar metrics={metrics} lastUpdated={last_updated} source={source} />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Image
            src="/logo-creditum.png"
            alt="Creditum"
            height={28}
            width={79}
            priority
            className="object-contain"
          />
          <div className="w-px h-6 bg-gray-200" />
          <p className="text-xs text-gray-400">SDR Cockpit — Dashboard em tempo real</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <DataTimestamp updatedAt={last_updated} label="Atualizado em" />
          <span>
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-12 grid-rows-[auto_1fr_1fr] gap-3 p-4 overflow-hidden">

        {/* KPI Row */}
        <div className="col-span-12 grid grid-cols-6 gap-3">
          <MetricCard
            label="TME — Tempo Médio de Espera"
            value={formatSeconds(metrics.tme_segundos)}
            sublabel="Meta: até 2:00"
            icon={Clock}
            variant={metrics.tme_segundos <= 120 ? "success" : "danger"}
          />
          <MetricCard
            label="TMA — Tempo Médio de Atendimento"
            value={formatSeconds(metrics.tma_segundos)}
            sublabel="Meta: 3:00 – 6:00"
            icon={PhoneCall}
            variant={
              metrics.tma_segundos >= 180 && metrics.tma_segundos <= 360
                ? "success"
                : "warning"
            }
          />
          <MetricCard
            label="Taxa de Contato"
            value={formatPercent(metrics.taxa_contato)}
            sublabel="Meta: ≥ 65%"
            icon={Users}
            variant={metrics.taxa_contato >= 65 ? "success" : "danger"}
          />
          <MetricCard
            label="Taxa de Conversão"
            value={formatPercent(metrics.taxa_conversao)}
            sublabel="Meta: ≥ 10%"
            icon={TrendingUp}
            variant={metrics.taxa_conversao >= 10 ? "success" : "warning"}
          />
          <MetricCard
            label="Total de Ligações"
            value={metrics.total_ligacoes.toString()}
            sublabel={`${metrics.total_conversoes} conversões hoje`}
            icon={Phone}
            variant="info"
            pulse
          />
          <MetricCard
            label="SDRs em Ligação"
            value="—"
            sublabel={`${metrics.sdrs_disponiveis} disponíveis · tempo real indisponível`}
            icon={Target}
            variant="default"
          />
        </div>

        {/* Row 2: Ranking | Live Calls | Objections */}
        <div className="col-span-4 row-span-1 bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Ranking SDRs
            </h2>
            <span className="text-xs text-gray-400">{sdrs.length} SDRs</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <SDRRanking sdrs={sdrs} />
          </div>
        </div>

        <div className="col-span-4 row-span-1 bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Ligações do Dia
            </h2>
            <span className="text-xs text-gray-400">
              {live_calls.length} hoje
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <LiveCalls calls={live_calls} />
          </div>
        </div>

        {/* Objeções + Ocorrências lado a lado dentro do mesmo col-span-4 */}
        <div className="col-span-4 row-span-1 grid grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
            <div className="shrink-0">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                Objeções
              </h2>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <ObjectionsBar objections={top_objections} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
            <div className="shrink-0">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                Ocorrências
              </h2>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <OccurrencesBar occurrences={occurrences} />
            </div>
          </div>
        </div>

        {/* Row 3: Hourly Chart full width */}
        <div className="col-span-12 bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider shrink-0">
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
