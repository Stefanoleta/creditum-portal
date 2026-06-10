"use client"

import { ScoreBadge } from "./ScoreBadge"
import { cn } from "@/lib/utils"
import { DataTimestamp } from "@/components/ui-shared/DataTimestamp"
import {
  CheckCircle2,
  XCircle,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
  Mic,
  Clock3,
  Clock,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react"
import type { CallAnalysis, CallResultado, CallTom, DataSource } from "@/types/calls"
import { useState } from "react"

const RESULTADO_LABELS: Record<CallResultado, string> = {
  conversao:    "Conversão",
  agendamento:  "Agendamento",
  callback:     "Callback",
  sem_interesse:"Sem Interesse",
  nao_atendeu:  "Não Atendeu",
  outros:       "Outros",
}
const RESULTADO_COLORS: Record<CallResultado, string> = {
  conversao:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  agendamento:  "bg-blue-100 text-blue-700 border-blue-200",
  callback:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  sem_interesse:"bg-orange-100 text-orange-700 border-orange-200",
  nao_atendeu:  "bg-gray-100 text-gray-500 border-gray-200",
  outros:       "bg-gray-100 text-gray-500 border-gray-200",
}
const TOM_LABELS: Record<CallTom, string> = {
  positivo: "Tom Positivo",
  neutro:   "Tom Neutro",
  negativo: "Tom Negativo",
}
const TOM_COLORS: Record<CallTom, string> = {
  positivo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  neutro:   "bg-gray-100 text-gray-600 border-gray-200",
  negativo: "bg-red-100 text-red-600 border-red-200",
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m${String(s).padStart(2, "0")}s`
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ dataSource }: { dataSource: DataSource | undefined }) {
  const ds = dataSource ?? "mock"

  if (ds === "argus_real") {
    return (
      <span className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
        <ShieldCheck className="w-3 h-3" />
        Fonte: Argus + IA ✓
      </span>
    )
  }
  if (ds === "pending") {
    return (
      <span className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium bg-gray-100 text-gray-500 border-gray-200">
        <Clock className="w-3 h-3" />
        Pendente — aguardando áudio
      </span>
    )
  }
  if (ds === "metadata_only") {
    return (
      <span className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium bg-amber-50 text-amber-700 border-amber-200">
        <ShieldAlert className="w-3 h-3" />
        Fonte: Metadados ⚠️
      </span>
    )
  }
  // "mock" or unknown
  return (
    <span className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-semibold bg-red-50 text-red-700 border-red-200">
      <ShieldX className="w-3 h-3" />
      Fonte: DEMO ⚠️
    </span>
  )
}

// ─── Pending state ────────────────────────────────────────────────────────────

function PendingDetail({
  analysis,
  onRetry,
  retrying,
}: {
  analysis: CallAnalysis
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-gray-900 text-base">{analysis.sdr_name}</h2>
            <span className="text-gray-400 text-sm">·</span>
            <span className="text-sm text-gray-600">{analysis.school_name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>{new Date(analysis.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            <span>·</span>
            <span>{formatDuration(analysis.duration_seconds)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SourceBadge dataSource={analysis.data_source} />
        <DataTimestamp updatedAt={analysis.analisado_em} label="Registrado em" />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-amber-800">
          Análise em espera
        </p>
        <p className="text-xs text-amber-700">
          O áudio desta ligação não pôde ser baixado do Argus. Nenhuma análise foi gerada —
          dados reais exigem o áudio original. Quando o Argus estiver acessível, clique em
          "Tentar novamente" para reprocessar.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="self-start flex items-center gap-1.5 bg-amber-700 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-amber-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} />
            {retrying ? "Tentando..." : "Tentar novamente"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CallDetailProps {
  analysis: CallAnalysis
  onRetry?: () => void
  retrying?: boolean
}

export function CallDetail({ analysis, onRetry, retrying }: CallDetailProps) {
  const [showTranscript, setShowTranscript] = useState(false)

  const time = new Date(analysis.started_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  if (analysis.status === "pendente" || analysis.data_source === "pending") {
    return <PendingDetail analysis={analysis} onRetry={onRetry} retrying={retrying} />
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-gray-900 text-base">{analysis.sdr_name}</h2>
            <span className="text-gray-400 text-sm">·</span>
            <span className="text-sm text-gray-600">{analysis.school_name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>{time}</span>
            <span>·</span>
            <span>{formatDuration(analysis.duration_seconds)}</span>
            <span>·</span>
            <DataTimestamp updatedAt={analysis.analisado_em} label="Analisado" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ScoreBadge score={analysis.score} size="lg" />
          <span className="text-xs text-gray-400">/10</span>
        </div>
      </div>

      {/* Badges — source comes first, always visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <SourceBadge dataSource={analysis.data_source} />
        <span className={cn("text-xs border rounded-full px-2.5 py-1 font-medium", RESULTADO_COLORS[analysis.resultado])}>
          {RESULTADO_LABELS[analysis.resultado]}
        </span>
        <span className={cn("text-xs border rounded-full px-2.5 py-1 font-medium", TOM_COLORS[analysis.tom])}>
          {TOM_LABELS[analysis.tom]}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-full px-2.5 py-1">
          <Clock3 className="w-3 h-3" />
          Resposta: {analysis.tempo_resposta_inicial_segundos}s
        </span>
      </div>

      {/* Palavras */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
          <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">
            Palavras de conversão
          </p>
          {analysis.palavras_conversao.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {analysis.palavras_conversao.map((w) => (
                <span key={w} className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-2 py-0.5">
                  {w}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-600 opacity-60">Nenhuma identificada</p>
          )}
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">
            Palavras de perda
          </p>
          {analysis.palavras_perda.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {analysis.palavras_perda.map((w) => (
                <span key={w} className="bg-red-100 text-red-600 text-xs rounded-full px-2 py-0.5">
                  {w}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-red-500 opacity-60">Nenhuma</p>
          )}
        </div>
      </div>

      {/* Objeções */}
      {analysis.objecoes.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide flex items-center gap-1">
            <MessageSquareQuote className="w-3 h-3" />
            Objeções levantadas
          </p>
          <ul className="flex flex-col gap-1.5">
            {analysis.objecoes.map((o) => (
              <li key={o} className="text-xs text-amber-800 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">•</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700 italic border-t border-amber-200 pt-2">
            {analysis.como_tratou_objecoes}
          </p>
        </div>
      )}

      {/* Pontos positivos + negativos */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Pontos positivos
          </p>
          <ul className="flex flex-col gap-1.5">
            {analysis.pontos_positivos.map((p) => (
              <li key={p} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
            <XCircle className="w-3 h-3 text-red-400" />
            Melhorias
          </p>
          <ul className="flex flex-col gap-1.5">
            {analysis.pontos_negativos.map((p) => (
              <li key={p} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Transcript toggle */}
      {analysis.transcript && !analysis.transcript.startsWith("[") && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-600"
          >
            <span className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" />
              Transcrição completa
            </span>
            {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showTranscript && (
            <div className="p-3 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto bg-white">
              {analysis.transcript}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
