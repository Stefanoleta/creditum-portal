"use client"

import { scoreColor } from "./ScoreBadge"
import { cn } from "@/lib/utils"
import { DataTimestamp } from "@/components/ui-shared/DataTimestamp"
import {
  CheckCircle2,
  XCircle,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
  Mic,
  Clock,
  Clock3,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Zap,
  Target,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  User,
} from "lucide-react"
import type { CallAnalysis, CallResultado, CallTom, DataSource, AnaliseAbertura } from "@/types/calls"
import { useState } from "react"

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
  conversao:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  agendamento:  "bg-blue-100 text-blue-700 border-blue-200",
  callback:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  sem_interesse:"bg-orange-100 text-orange-700 border-orange-200",
  nao_atendeu:  "bg-gray-100 text-gray-500 border-gray-200",
  outros:       "bg-gray-100 text-gray-500 border-gray-200",
  converteu:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  recontato:    "bg-blue-100 text-blue-700 border-blue-200",
  fora_politica:"bg-purple-100 text-purple-700 border-purple-200",
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

const ABERTURA_LABEL: Record<AnaliseAbertura["avaliacao"], string> = {
  forte: "Forte",
  media: "Média",
  fraca: "Fraca",
}
const ABERTURA_COLOR: Record<AnaliseAbertura["avaliacao"], string> = {
  forte: "text-emerald-600",
  media: "text-yellow-600",
  fraca: "text-red-500",
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m${String(s).padStart(2, "0")}s`
}

// ─── Score ring (0-100) ───────────────────────────────────────────────────────

function ScoreRing({ score, sdrAvg }: { score: number; sdrAvg?: number }) {
  const radius = 36
  const circ   = 2 * Math.PI * radius
  const fill   = circ * (score / 100)
  const color  =
    score >= 80 ? "#10b981" :
    score >= 60 ? "#f59e0b" : "#ef4444"

  const diff = sdrAvg !== undefined ? score - sdrAvg : null

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="44" cy="44" r={radius} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${fill} ${circ - fill}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-extrabold leading-none", scoreColor(score))}>
            {Math.round(score)}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">/100</span>
        </div>
      </div>
      {diff !== null && (
        <span className={cn(
          "text-xs font-medium",
          diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400"
        )}>
          {diff > 0 ? `+${Math.round(diff)}` : Math.round(diff) === 0 ? "= média" : `${Math.round(diff)}`} pts da média
        </span>
      )}
    </div>
  )
}

// ─── Score breakdown bars ─────────────────────────────────────────────────────

const BREAKDOWN_LABELS: Record<string, string> = {
  abertura:           "Abertura",
  engajamento_lead:   "Engajamento",
  tratamento_objecao: "Objeções",
  proposta_beneficio: "Proposta",
}

function ScoreBreakdownBars({ breakdown }: { breakdown: NonNullable<CallAnalysis["score_breakdown"]> }) {
  const keys = ["abertura", "engajamento_lead", "tratamento_objecao", "proposta_beneficio"] as const
  return (
    <div className="flex flex-col gap-2">
      {keys.map((k) => {
        const val = breakdown[k]
        const pct = (val / 25) * 100
        const bar = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-400" : "bg-red-400"
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 w-20 shrink-0">{BREAKDOWN_LABELS[k]}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-gray-600 w-8 text-right">{val}/25</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ dataSource }: { dataSource: DataSource | undefined }) {
  const ds = dataSource ?? "mock"
  if (ds === "argus_real") {
    return (
      <span className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
        <ShieldCheck className="w-3 h-3" />
        Argus + IA ✓
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
        Metadados ⚠️
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-semibold bg-red-50 text-red-700 border-red-200">
      <ShieldX className="w-3 h-3" />
      DEMO ⚠️
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
        <p className="text-sm font-semibold text-amber-800">Análise em espera</p>
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

// ─── Short-call warning ───────────────────────────────────────────────────────

function ShortCallWarning({ seconds }: { seconds: number }) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700">
        <strong>Ligação muito curta ({formatDuration(seconds)}).</strong>{" "}
        Dados insuficientes para coaching completo — análise parcial.
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CallDetailProps {
  analysis: CallAnalysis
  sdrAvg?: number
  onRetry?: () => void
  retrying?: boolean
}

export function CallDetail({ analysis, sdrAvg, onRetry, retrying }: CallDetailProps) {
  const [showTranscript, setShowTranscript] = useState(false)
  const [showObjecoesDetail, setShowObjecoesDetail] = useState(false)

  const time = new Date(analysis.started_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  if (analysis.status === "pendente" || analysis.data_source === "pending") {
    return <PendingDetail analysis={analysis} onRetry={onRetry} retrying={retrying} />
  }

  const isShort = analysis.duration_seconds < 30
  const hasCoaching = !!(analysis.score_breakdown || analysis.momento_critico || analysis.analise_abertura)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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

        {/* Score ring (coaching) or badge (legacy) */}
        {hasCoaching ? (
          <ScoreRing score={analysis.score} sdrAvg={sdrAvg} />
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn(
              "text-2xl font-extrabold rounded-full border px-3 py-1",
              analysis.score >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
              analysis.score >= 60 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                                     "bg-red-100 text-red-700 border-red-200"
            )}>
              {Math.round(analysis.score)}
            </span>
            <span className="text-xs text-gray-400">/100</span>
          </div>
        )}
      </div>

      {/* ── Badges ─────────────────────────────────────────────────────────── */}
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

      {/* ── Short call warning ──────────────────────────────────────────────── */}
      {isShort && <ShortCallWarning seconds={analysis.duration_seconds} />}

      {/* ── Score breakdown bars ────────────────────────────────────────────── */}
      {analysis.score_breakdown && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-blue-500" />
            Breakdown do Score
          </p>
          <ScoreBreakdownBars breakdown={analysis.score_breakdown} />
        </div>
      )}

      {/* ── Resumo ─────────────────────────────────────────────────────────── */}
      {analysis.resumo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
          <p className="text-xs font-semibold text-blue-600 mb-1.5 uppercase tracking-wide">Resumo</p>
          <p className="text-sm text-blue-900 leading-relaxed">{analysis.resumo}</p>
        </div>
      )}

      {/* ── Momento Crítico ─────────────────────────────────────────────────── */}
      {analysis.momento_critico && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
          <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Momento Crítico · {analysis.momento_critico.tempo}
          </p>
          <p className="text-sm text-amber-800 mb-3">{analysis.momento_critico.descricao}</p>
          <div className="flex items-start gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2.5">
            <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 italic leading-relaxed">
              <strong className="not-italic text-amber-800">Alternativa: </strong>
              {analysis.momento_critico.alternativa}
            </p>
          </div>
        </div>
      )}

      {/* ── Análise de Abertura ─────────────────────────────────────────────── */}
      {analysis.analise_abertura && (
        <div className="border border-gray-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Análise de Abertura</p>
            <span className={cn("text-xs font-bold", ABERTURA_COLOR[analysis.analise_abertura.avaliacao])}>
              {ABERTURA_LABEL[analysis.analise_abertura.avaliacao]}
            </span>
          </div>
          <p className="text-xs text-gray-600 mb-2 leading-relaxed">{analysis.analise_abertura.descricao}</p>
          {analysis.analise_abertura.sugestao && (
            <div className="flex items-start gap-1.5 bg-blue-50 rounded-lg px-2.5 py-2 border border-blue-100">
              <TrendingUp className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 italic leading-relaxed">{analysis.analise_abertura.sugestao}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Objeções identificadas (rich) ───────────────────────────────────── */}
      {analysis.objecoes_identificadas && analysis.objecoes_identificadas.length > 0 ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowObjecoesDetail((v) => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-orange-50 hover:bg-orange-100 transition-colors text-xs font-semibold text-orange-700 uppercase tracking-wide"
          >
            <span className="flex items-center gap-1.5">
              <MessageSquareQuote className="w-3.5 h-3.5" />
              Objeções ({analysis.objecoes_identificadas.length})
            </span>
            {showObjecoesDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showObjecoesDetail && (
            <div className="flex flex-col divide-y divide-gray-100">
              {analysis.objecoes_identificadas.map((obj, i) => (
                <div key={i} className="p-3.5 bg-white flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-700">
                    <span className="text-orange-500 mr-1">Lead:</span>"{obj.objecao}"
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    <span className="font-medium text-gray-600">Como foi tratada: </span>
                    {obj.como_foi_tratada}
                  </p>
                  <div className="flex items-start gap-1.5 bg-emerald-50 rounded-lg px-2.5 py-2 border border-emerald-100">
                    <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 italic leading-relaxed">
                      <strong className="not-italic text-emerald-800">Sugestão: </strong>
                      {obj.sugestao_de_resposta}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : analysis.objecoes.length > 0 && (
        /* Fallback for legacy analyses without objecoes_identificadas */
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

      {/* ── Coaching: pontos fortes / melhoria ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Pontos fortes
          </p>
          <ul className="flex flex-col gap-1.5">
            {(analysis.pontos_fortes ?? analysis.pontos_positivos).map((p, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
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
            {(analysis.pontos_melhoria ?? analysis.pontos_negativos).map((p, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Sugestão de Recontato ───────────────────────────────────────────── */}
      {analysis.sugestao_recontato && (
        <div className={cn(
          "border rounded-xl p-3.5",
          analysis.sugestao_recontato.vale_recontato
            ? "bg-emerald-50 border-emerald-200"
            : "bg-gray-50 border-gray-200"
        )}>
          <div className="flex items-center justify-between mb-2">
            <p className={cn(
              "text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5",
              analysis.sugestao_recontato.vale_recontato ? "text-emerald-700" : "text-gray-500"
            )}>
              <RefreshCw className="w-3.5 h-3.5" />
              Sugestão de Recontato
            </p>
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              analysis.sugestao_recontato.vale_recontato
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-200 text-gray-500"
            )}>
              {analysis.sugestao_recontato.vale_recontato ? "Vale recontato" : "Não recontatar"}
            </span>
          </div>
          <p className="text-xs text-gray-600 mb-2">{analysis.sugestao_recontato.motivo}</p>
          {analysis.sugestao_recontato.vale_recontato && (
            <>
              <p className="text-[11px] text-gray-500 mb-1.5">
                <span className="font-medium">Melhor horário:</span> {analysis.sugestao_recontato.melhor_horario}
              </p>
              <div className="flex items-start gap-1.5 bg-white rounded-lg border border-emerald-200 px-2.5 py-2">
                <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700 italic leading-relaxed">
                  {analysis.sugestao_recontato.abertura_sugerida}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Insight do Gestor ───────────────────────────────────────────────── */}
      {analysis.insight_gestor && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5">
          <p className="text-xs font-semibold text-violet-700 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Para o Gestor
          </p>
          <p className="text-sm text-violet-900 leading-relaxed">{analysis.insight_gestor}</p>
        </div>
      )}

      {/* ── Transcript toggle ───────────────────────────────────────────────── */}
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
