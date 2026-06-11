"use client"

import type { DailyPatterns } from "@/types/calls"
import { TrendingUp, AlertTriangle, Award, Target } from "lucide-react"
import { cn } from "@/lib/utils"

interface DailyPatternsProps {
  patterns: DailyPatterns
}

const scoreColor = (s: number) =>
  s >= 80 ? "text-emerald-600" : s >= 60 ? "text-yellow-600" : "text-red-500"

export function DailyPatternsPanel({ patterns }: DailyPatternsProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-xs text-blue-600 font-medium">Score Médio</p>
          <p className={cn("text-2xl font-extrabold mt-0.5", scoreColor(patterns.score_medio))}>
            {Math.round(patterns.score_medio)}
          </p>
          <p className="text-xs text-blue-400">/100</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-600 font-medium">Taxa Conversão</p>
          <p className="text-2xl font-extrabold mt-0.5 text-emerald-700">{patterns.taxa_conversao}%</p>
          <p className="text-xs text-emerald-400">das analisadas</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 font-medium">Analisadas</p>
          <p className="text-2xl font-extrabold mt-0.5 text-gray-700">{patterns.total_analisadas}</p>
          <p className="text-xs text-gray-400">ligações</p>
        </div>
      </div>

      {/* Top palavras */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            Top conversão
          </p>
          <div className="flex flex-wrap gap-1">
            {patterns.top_palavras_conversao.map((w) => (
              <span key={w} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2 py-0.5">
                {w}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            Top perda
          </p>
          <div className="flex flex-wrap gap-1">
            {patterns.top_palavras_perda.length > 0 ? (
              patterns.top_palavras_perda.map((w) => (
                <span key={w} className="text-xs bg-orange-50 border border-orange-200 text-orange-600 rounded-full px-2 py-0.5">
                  {w}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400">Nenhuma</span>
            )}
          </div>
        </div>
      </div>

      {/* Principal objeção */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5">
        <p className="text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Principal objeção do dia
        </p>
        <p className="text-sm text-amber-800 font-medium">{patterns.principal_objecao}</p>
      </div>

      {/* Ranking SDRs */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
          <Award className="w-3 h-3 text-yellow-500" />
          Ranking SDRs
        </p>
        <div className="flex flex-col gap-1.5">
          {patterns.ranking_sdrs.map((sdr, i) => (
            <div key={sdr.sdr_name} className="flex items-center gap-2">
              <span className={cn(
                "text-xs font-bold w-5 text-center",
                i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : "text-gray-400"
              )}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
              </span>
              <span className="text-xs text-gray-700 font-medium flex-1 truncate">{sdr.sdr_name}</span>
              <span className="text-xs text-gray-400">{sdr.total_analisadas} lig.</span>
              <span className={cn("text-xs font-bold", scoreColor(sdr.score_medio))}>
                {Math.round(sdr.score_medio)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuição de resultados */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
          <Target className="w-3 h-3 text-blue-500" />
          Distribuição de resultados
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(patterns.distribuicao_resultados)
            .sort((a, b) => b[1] - a[1])
            .map(([result, count]) => {
              const labels: Record<string, string> = {
                conversao: "Conversão",
                agendamento: "Agendamento",
                callback: "Callback",
                sem_interesse: "Sem Interesse",
                nao_atendeu: "Não Atendeu",
                outros: "Outros",
                converteu: "Converteu",
                recontato: "Recontato",
                fora_politica: "Fora da Política",
              }
              const colors: Record<string, string> = {
                conversao: "bg-emerald-50 border-emerald-200 text-emerald-700",
                agendamento: "bg-blue-50 border-blue-200 text-blue-700",
                callback: "bg-yellow-50 border-yellow-200 text-yellow-700",
                sem_interesse: "bg-orange-50 border-orange-200 text-orange-600",
                nao_atendeu: "bg-gray-50 border-gray-200 text-gray-500",
                outros: "bg-gray-50 border-gray-200 text-gray-500",
                converteu: "bg-emerald-50 border-emerald-200 text-emerald-700",
                recontato: "bg-blue-50 border-blue-200 text-blue-700",
                fora_politica: "bg-purple-50 border-purple-200 text-purple-600",
              }
              return (
                <span key={result} className={cn("text-xs border rounded-full px-2 py-0.5", colors[result] ?? "bg-gray-50 border-gray-200 text-gray-500")}>
                  {labels[result] ?? result}: <strong>{count}</strong>
                </span>
              )
            })}
        </div>
      </div>
    </div>
  )
}
