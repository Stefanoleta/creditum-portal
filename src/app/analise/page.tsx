"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertCircle,
  BarChart2,
  Radio,
  RefreshCw,
} from "lucide-react"
import { CallCard } from "@/components/calls/CallCard"
import { CallDetail } from "@/components/calls/CallDetail"
import { DailyPatternsPanel } from "@/components/calls/DailyPatterns"
import { MockDataBanner } from "@/components/ui-shared/MockDataBanner"
import { DataTimestamp } from "@/components/ui-shared/DataTimestamp"
import { computeMockPatterns } from "@/lib/mock-calls"
import type { CallRecording, CallAnalysis, DailyPatterns } from "@/types/calls"

export default function AnalisePage() {
  // Manual recordings list (from /api/calls/list)
  const [recordings, setRecordings] = useState<CallRecording[]>([])
  const [analyses, setAnalyses]     = useState<Map<string, CallAnalysis>>(new Map())
  const [analyzing, setAnalyzing]   = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterSdr, setFilterSdr]   = useState("todos")
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [source, setSource]         = useState<"argus" | "mock" | null>(null)

  // Webhook analyses (from /api/analyses/recent — polling every 10s)
  const [webhookAnalyses, setWebhookAnalyses]     = useState<CallAnalysis[]>([])
  const [supabaseOk, setSupabaseOk]               = useState<boolean | null>(null)
  const [newWebhookCount, setNewWebhookCount]     = useState(0)
  const [lastFetch, setLastFetch]                 = useState<Date | null>(null)
  const [retrying, setRetrying]                   = useState<Set<string>>(new Set())
  const prevWebhookIds = useRef<Set<string>>(new Set())

  // ─── Fetch recordings on mount ───────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/calls/list")
      .then((r) => r.json())
      .then((data) => {
        setRecordings(data.recordings ?? [])
        setSource(data.source ?? "mock")
        setLastFetch(new Date())
        if (data.recordings?.length > 0) setSelectedId(data.recordings[0].id)
      })
      .catch(() => setError("Não foi possível carregar as gravações."))
      .finally(() => setLoading(false))
  }, [])

  // ─── Poll /api/analyses/recent every 10s for webhook-triggered analyses ──────
  const pollWebhook = useCallback(() => {
    const today = new Date().toISOString().split("T")[0]
    fetch(`/api/analyses/recent?date=${today}`)
      .then((r) => r.json())
      .then((data) => {
        setSupabaseOk(!!data.supabase_configured)
        const fresh: CallAnalysis[] = data.analyses ?? []
        // Count newly arrived analyses since last poll
        const incoming = fresh.filter((a) => !prevWebhookIds.current.has(a.call_id))
        if (incoming.length > 0) {
          setNewWebhookCount((n) => n + incoming.length)
          incoming.forEach((a) => prevWebhookIds.current.add(a.call_id))
        }
        setWebhookAnalyses(fresh)
        // Also merge into the analyses map so CallDetail can show them
        setAnalyses((prev) => {
          const next = new Map(prev)
          for (const a of fresh) next.set(a.call_id, a)
          return next
        })
      })
      .catch(() => {/* silent — polling failure should not disrupt the UI */})
  }, [])

  useEffect(() => {
    pollWebhook()
    const id = setInterval(pollWebhook, 10_000)
    return () => clearInterval(id)
  }, [pollWebhook])

  // ─── Analyze a single call manually ─────────────────────────────────────────
  const analyzeCall = useCallback(
    async (rec: CallRecording) => {
      if (analyzing.has(rec.id)) return
      setAnalyzing((prev) => new Set(prev).add(rec.id))
      try {
        const res = await fetch("/api/calls/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rec),
        })
        const data = await res.json()
        if (data.analysis) {
          setAnalyses((prev) => new Map(prev).set(rec.id, data.analysis as CallAnalysis))
          setSelectedId(rec.id)
        }
      } catch (err) {
        console.error("analyze error:", err)
      } finally {
        setAnalyzing((prev) => {
          const next = new Set(prev)
          next.delete(rec.id)
          return next
        })
      }
    },
    [analyzing]
  )

  const analyzeAll = useCallback(async () => {
    const pending = filtered.filter((r) => !analyses.has(r.id) && !analyzing.has(r.id))
    for (const rec of pending) await analyzeCall(rec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordings, analyses, analyzing, filterSdr])

  // ─── SDR filter options ──────────────────────────────────────────────────────
  const sdrOptions = useMemo(() => {
    const fromRecordings = recordings.map((r) => r.sdr_name)
    const fromWebhook    = webhookAnalyses.map((a) => a.sdr_name)
    const names = Array.from(new Set([...fromRecordings, ...fromWebhook])).sort()
    return ["todos", ...names]
  }, [recordings, webhookAnalyses])

  const filtered = useMemo(() => {
    if (filterSdr === "todos") return recordings
    return recordings.filter((r) => r.sdr_name === filterSdr)
  }, [recordings, filterSdr])

  // Webhook analyses panel — only those not already in recordings
  const webhookOnly = useMemo(() => {
    const recordingIds = new Set(recordings.map((r) => r.id))
    return webhookAnalyses.filter(
      (a) =>
        !recordingIds.has(a.call_id) &&
        (filterSdr === "todos" || a.sdr_name === filterSdr)
    )
  }, [webhookAnalyses, recordings, filterSdr])

  const selectedRecording = recordings.find((r) => r.id === selectedId)
  const selectedAnalysis  = selectedId ? analyses.get(selectedId) : undefined

  // Combined analyses for patterns panel
  const allAnalyses = useMemo(() => Array.from(analyses.values()), [analyses])
  const patterns: DailyPatterns | null = useMemo(() => {
    if (allAnalyses.length === 0) return null
    return computeMockPatterns(allAnalyses)
  }, [allAnalyses])

  // ─── Retry a pending webhook analysis ──────────────────────────────────────
  const retryAnalysis = useCallback(async (call_id: string) => {
    if (retrying.has(call_id)) return
    setRetrying((prev) => new Set(prev).add(call_id))
    try {
      const res = await fetch("/api/analyses/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id }),
      })
      const data = await res.json()
      if (data.retried > 0) {
        // Re-poll to get updated analysis
        setTimeout(pollWebhook, 1500)
      }
    } catch (err) {
      console.error("retry error:", err)
    } finally {
      setRetrying((prev) => { const next = new Set(prev); next.delete(call_id); return next })
    }
  }, [retrying, pollWebhook])

  const pendingCount = filtered.filter((r) => !analyses.has(r.id)).length
  const anyAnalyzing = analyzing.size > 0

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Carregando gravações...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-red-500">
          <AlertCircle className="w-8 h-8" />
          <span>{error}</span>
          <Link href="/" className="text-sm text-blue-600 underline mt-2">Voltar ao início</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {/* Demo banner — shown when Argus unavailable */}
      <MockDataBanner isDemo={source === "mock"} reason="gravações indisponíveis" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Image src="/logo-creditum.png" alt="Creditum" height={28} width={79} priority className="object-contain" />
          <div className="w-px h-6 bg-gray-200" />
          <p className="text-xs text-gray-400">Análise Inteligente de Ligações</p>
          {source === "mock" && (
            <span className="text-[10px] bg-gray-100 text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">dados demo</span>
          )}
          {/* Live indicator when Supabase is active */}
          {supabaseOk && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium border border-emerald-200 bg-emerald-50 rounded-full px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              ao vivo
            </span>
          )}
          {supabaseOk === false && (
            <span className="text-[10px] text-amber-600 border border-amber-200 bg-amber-50 rounded-full px-2 py-0.5">
              webhook · Supabase não configurado
            </span>
          )}
        </div>
        <DataTimestamp updatedAt={lastFetch} label="Atualizado em" />

        <div className="flex items-center gap-3">
          {newWebhookCount > 0 && (
            <button
              onClick={() => { setNewWebhookCount(0); setSelectedId(webhookOnly[0]?.call_id ?? selectedId) }}
              className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors animate-pulse"
            >
              <Radio className="w-3.5 h-3.5" />
              {newWebhookCount} nova{newWebhookCount > 1 ? "s" : ""} análise{newWebhookCount > 1 ? "s" : ""}
            </button>
          )}
          <select
            value={filterSdr}
            onChange={(e) => setFilterSdr(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {sdrOptions.map((s) => (
              <option key={s} value={s}>{s === "todos" ? "Todos os SDRs" : s}</option>
            ))}
          </select>
          {pendingCount > 0 && (
            <button
              onClick={analyzeAll}
              disabled={anyAnalyzing}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {anyAnalyzing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analisando...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" />Analisar {pendingCount} ligaç{pendingCount === 1 ? "ão" : "ões"}</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: recording list + webhook analyses */}
        <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          {/* Webhook analyses — auto-arrived */}
          {webhookOnly.length > 0 && (
            <div className="shrink-0 border-b border-gray-100">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                <Radio className="w-3 h-3 text-emerald-600" />
                <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                  Ao vivo — Webhook ({webhookOnly.length})
                </h2>
              </div>
              <div className="flex flex-col gap-1.5 p-2 max-h-60 overflow-y-auto">
                {webhookOnly.map((analysis) => (
                  <div
                    key={analysis.call_id}
                    onClick={() => setSelectedId(analysis.call_id)}
                    className={`cursor-pointer rounded-xl border p-3 transition-all ${
                      selectedId === analysis.call_id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-100 hover:border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-gray-900 truncate">{analysis.sdr_name}</p>
                        <p className="text-xs text-gray-500 truncate">{analysis.school_name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(analysis.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${
                          analysis.score >= 8 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                          analysis.score >= 6 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                          "bg-red-100 text-red-600 border-red-200"
                        }`}>
                          {analysis.score.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-medium">webhook</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual recordings list */}
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Ligações do dia ({filtered.length})
              </h2>
              <button onClick={pollWebhook} className="text-gray-300 hover:text-gray-500 transition-colors" title="Atualizar">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center mt-8">Nenhuma gravação encontrada</p>
            ) : (
              filtered.map((rec) => (
                <CallCard
                  key={rec.id}
                  recording={rec}
                  analysis={analyses.get(rec.id)}
                  isAnalyzing={analyzing.has(rec.id)}
                  isSelected={selectedId === rec.id}
                  onSelect={() => setSelectedId(rec.id)}
                  onAnalyze={() => analyzeCall(rec)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: analysis detail + patterns */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Analysis detail panel */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            {selectedAnalysis ? (
              <CallDetail
                analysis={selectedAnalysis}
                onRetry={selectedAnalysis.data_source === "pending" ? () => retryAnalysis(selectedAnalysis.call_id) : undefined}
                retrying={retrying.has(selectedAnalysis.call_id)}
              />
            ) : selectedRecording ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                <Sparkles className="w-8 h-8 text-blue-400" />
                <p className="text-sm font-medium text-gray-500">
                  Pronto para analisar — {selectedRecording.sdr_name} / {selectedRecording.school_name}
                </p>
                <button
                  onClick={() => analyzeCall(selectedRecording)}
                  disabled={analyzing.has(selectedRecording.id)}
                  className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-xl px-5 py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {analyzing.has(selectedRecording.id) ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Analisando com IA...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Analisar com IA</>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                <p className="text-sm">Selecione uma ligação à esquerda</p>
              </div>
            )}
          </div>

          {/* Daily patterns panel */}
          {patterns ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Padrões do dia</h2>
              </div>
              <DailyPatternsPanel patterns={patterns} />
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl p-5 text-center">
              <BarChart2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Analise ao menos uma ligação para ver os padrões do dia</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
