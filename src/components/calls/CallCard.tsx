"use client"

import { cn } from "@/lib/utils"
import { ScoreBadge } from "./ScoreBadge"
import { Loader2, Sparkles, Clock, Building2, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react"
import type { CallRecording, CallAnalysis, CallResultado, DataSource, TabulacaoIaCategoria } from "@/types/calls"

const RESULTADO_LABELS: Record<CallResultado, string> = {
  conversao:    "Conversão",
  agendamento:  "Agendamento",
  callback:     "Callback",
  sem_interesse:"Sem Interesse",
  nao_atendeu:  "Não Atendeu",
  outros:       "Outros",
  converteu:    "Converteu",
  recontato:    "Recontato",
  fora_politica:"Fora da Política",
}

const RESULTADO_COLORS: Record<CallResultado, string> = {
  conversao:    "bg-emerald-100 text-emerald-700",
  agendamento:  "bg-blue-100 text-blue-700",
  callback:     "bg-yellow-100 text-yellow-700",
  sem_interesse:"bg-orange-100 text-orange-700",
  nao_atendeu:  "bg-gray-100 text-gray-500",
  outros:       "bg-gray-100 text-gray-500",
  converteu:    "bg-emerald-100 text-emerald-700",
  recontato:    "bg-blue-100 text-blue-700",
  fora_politica:"bg-purple-100 text-purple-700",
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m${String(s).padStart(2, "0")}s`
}

const TAB_IA_LABEL: Partial<Record<TabulacaoIaCategoria, string>> = {
  qualificado:           "Qualificado",
  interessado_sem_fechar:"Interessado",
  ocupado_recontatar:    "Ocupado",
  mae_familiar_atendeu:  "Mãe/Familiar",
  nao_reconhece_aguardar:"Não Reconhece",
  objecao_financeira:    "Obj. Financeira",
  objecao_prazo:         "Obj. Prazo",
  nao_atendeu_multiplas: "N. Atendeu",
  nao_gostou_proposta:   "Não Gostou",
  recusa_definitiva:     "Recusa",
  fora_politica:         "Fora Política",
  ja_resolveu:           "Já Resolveu",
  numero_invalido:       "Nº Inválido",
}

const TAB_IA_COLOR: Partial<Record<TabulacaoIaCategoria, string>> = {
  qualificado:           "bg-emerald-100 text-emerald-700 border-emerald-200",
  interessado_sem_fechar:"bg-emerald-100 text-emerald-700 border-emerald-200",
  ocupado_recontatar:    "bg-amber-100 text-amber-700 border-amber-200",
  mae_familiar_atendeu:  "bg-amber-100 text-amber-700 border-amber-200",
  nao_reconhece_aguardar:"bg-amber-100 text-amber-700 border-amber-200",
  objecao_financeira:    "bg-amber-100 text-amber-700 border-amber-200",
  objecao_prazo:         "bg-amber-100 text-amber-700 border-amber-200",
  nao_atendeu_multiplas: "bg-amber-100 text-amber-700 border-amber-200",
  nao_gostou_proposta:   "bg-red-100 text-red-700 border-red-200",
  recusa_definitiva:     "bg-red-100 text-red-700 border-red-200",
  fora_politica:         "bg-red-100 text-red-700 border-red-200",
  ja_resolveu:           "bg-gray-100 text-gray-500 border-gray-200",
  numero_invalido:       "bg-gray-100 text-gray-500 border-gray-200",
}

function TabulacaoIaBadge({ analysis }: { analysis: CallAnalysis }) {
  const tab = analysis.tabulacao_ia
  if (!tab) return null
  const label = TAB_IA_LABEL[tab.categoria] ?? tab.categoria
  const color = TAB_IA_COLOR[tab.categoria] ?? "bg-gray-100 text-gray-500 border-gray-200"
  return (
    <div className="flex flex-col items-end gap-0.5 mt-0.5">
      <span className={cn("text-[9px] font-medium rounded-full border px-1.5 py-0.5 leading-tight", color)}>
        IA: {label}
      </span>
      {tab.recontato_em_dias !== null && (
        <span className="text-[9px] text-gray-400">Rec. em {tab.recontato_em_dias}d</span>
      )}
    </div>
  )
}

function SourceMicro({ ds }: { ds: DataSource | undefined }) {
  const source = ds ?? "mock"
  if (source === "argus_real") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 font-medium">
        <ShieldCheck className="w-2.5 h-2.5" /> Argus + IA ✓
      </span>
    )
  }
  if (source === "pending") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-gray-400 font-medium">
        <Clock className="w-2.5 h-2.5" /> Pendente
      </span>
    )
  }
  if (source === "metadata_only") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-medium">
        <ShieldAlert className="w-2.5 h-2.5" /> Metadados ⚠️
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-red-600 font-semibold">
      <ShieldX className="w-2.5 h-2.5" /> DEMO ⚠️
    </span>
  )
}

interface CallCardProps {
  recording: CallRecording
  analysis?: CallAnalysis
  isAnalyzing: boolean
  isSelected: boolean
  onSelect: () => void
  onAnalyze: () => void
}

export function CallCard({
  recording,
  analysis,
  isAnalyzing,
  isSelected,
  onSelect,
  onAnalyze,
}: CallCardProps) {
  const time = new Date(recording.started_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const isPending = analysis?.status === "pendente" || analysis?.data_source === "pending"

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group cursor-pointer rounded-xl border p-3.5 transition-all",
        isSelected
          ? "border-blue-300 bg-blue-50 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-gray-900 truncate">{recording.sdr_name}</p>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{recording.school_name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {time} · {formatDuration(recording.duration_seconds)}
            </span>
          </div>
          {analysis && (
            <div className="mt-1">
              <SourceMicro ds={analysis.data_source} />
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {analysis ? (
            isPending ? (
              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                Pendente
              </span>
            ) : (
              <>
                <ScoreBadge score={analysis.score} size="sm" />
                <span className={cn("text-xs rounded-full px-2 py-0.5", RESULTADO_COLORS[analysis.resultado])}>
                  {RESULTADO_LABELS[analysis.resultado]}
                </span>
                <TabulacaoIaBadge analysis={analysis} />
              </>
            )
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onAnalyze() }}
              disabled={isAnalyzing}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                isAnalyzing
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isAnalyzing ? (
                <><Loader2 className="w-3 h-3 animate-spin" />Analisando...</>
              ) : (
                <><Sparkles className="w-3 h-3" />Analisar</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
