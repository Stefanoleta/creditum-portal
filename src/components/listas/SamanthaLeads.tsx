"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, RefreshCw, PhoneOff, CheckCircle2, VoicemailIcon } from "lucide-react"
import { cn, formatSeconds } from "@/lib/utils"
import type { QickNormalizedCall, QickFonte } from "@/lib/qick/client"
import type { LeadMatch } from "@/app/api/listas/sdr-ia/match-leads/route"

// Tabbing codes handled by this tab — kept local since this is the only
// consumer that needs to bucket individual calls by code (the cockpit only
// reads pre-aggregated metrics).
const COD_ENGAJADO     = "5445"
const COD_NAO_PERTURBE = "5446"
const COD_JA_RESOLVEU  = "5447"
const COD_LIGACAO_MUDA = "116"

interface QuickCallsResponse {
  calls?: QickNormalizedCall[]
  fonte?: QickFonte
  error?: string
}

function fmtDataHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

function SummaryCard({
  emoji, label, value, colorClass,
}: { emoji: string; label: string; value: number; colorClass: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 border rounded-lg p-3", colorClass)}>
      <span className="text-[10px] font-medium uppercase tracking-wide">{emoji} {label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
    </div>
  )
}

export function SamanthaLeads() {
  const [calls, setCalls]     = useState<QickNormalizedCall[]>([])
  const [fonte, setFonte]     = useState<QickFonte | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Cruzamento com a tabela `leads` do Portal — telefone -> encontrado + unidade
  // REAL (via join com listas). Ausência de chave = ainda resolvendo.
  const [matchMap, setMatchMap] = useState<Map<string, LeadMatch>>(new Map())

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/quick/calls")
      .then(r => r.json())
      .then((d: QuickCallsResponse) => {
        if (d.error) { setError(d.error); return }
        setCalls(d.calls ?? [])
        setFonte(d.fonte ?? null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro de rede"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const engajados   = useMemo(
    () => calls.filter(c => c.tabbingCode === COD_ENGAJADO).slice(0, 100),
    [calls]
  )
  const naoPerturbe = calls.filter(c => c.tabbingCode === COD_NAO_PERTURBE)
  const jaResolveu  = calls.filter(c => c.tabbingCode === COD_JA_RESOLVEU)
  const ligacaoMuda = calls.filter(c => c.tabbingCode === COD_LIGACAO_MUDA)

  // Cruza os engajados com a base de leads do Portal — não bloqueia a tabela:
  // enquanto resolve, cada linha mostra só o badge "Aguardando follow-up".
  useEffect(() => {
    setMatchMap(new Map())
    const telefones = engajados.map(c => c.phone).filter((p): p is string => !!p)
    if (telefones.length === 0) return

    fetch("/api/listas/sdr-ia/match-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefones }),
    })
      .then(r => r.json())
      .then((d: { matches?: Record<string, LeadMatch> }) => {
        if (!d.matches) return
        setMatchMap(new Map(Object.entries(d.matches)))
      })
      .catch(() => {
        // Best-effort — segundo badge simplesmente não aparece, sem travar a UI.
      })
  }, [engajados])

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-violet-100 text-violet-700 rounded-full px-2.5 py-1">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold tracking-wide uppercase">SDR I.A</span>
          </div>
          <h2 className="text-sm font-semibold text-gray-700">Leads classificados pela Samantha</h2>
          {fonte === "mock" && (
            <span className="text-[9px] font-semibold text-violet-400 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
              SIMULADO
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          emoji="🟣" label="Engajados" value={engajados.length}
          colorClass="border-violet-100 bg-violet-50/40 text-violet-700"
        />
        <SummaryCard
          emoji="🔴" label="Não Perturbe" value={naoPerturbe.length}
          colorClass="border-red-100 bg-red-50/40 text-red-700"
        />
        <SummaryCard
          emoji="✅" label="Já Resolveu" value={jaResolveu.length}
          colorClass="border-emerald-100 bg-emerald-50/40 text-emerald-700"
        />
        <SummaryCard
          emoji="📵" label="Ligação Muda" value={ligacaoMuda.length}
          colorClass="border-gray-200 bg-gray-50 text-gray-600"
        />
      </div>

      {/* ── Tabela: Engajados (5445) ────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Engajados — prontos para follow-up</h3>
          <span className="text-[10px] text-gray-300">{engajados.length} de até 100</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-gray-200 border-t-violet-500 rounded-full animate-spin" />
            Carregando...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-red-300">
            <PhoneOff className="w-8 h-8" />
            <p className="text-sm text-red-500 font-medium">Erro ao carregar leads da Samantha</p>
            <p className="text-xs text-red-400 max-w-sm text-center">{error}</p>
          </div>
        ) : engajados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-300">
            <VoicemailIcon className="w-8 h-8" />
            <p className="text-sm text-gray-400 text-center max-w-sm">
              Nenhum lead engajado no período — a Samantha ainda está classificando as ligações recentes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-400 font-medium">
                  <th className="px-3 py-2.5 text-left">Nome</th>
                  <th className="px-3 py-2.5 text-left">Telefone</th>
                  <th className="px-3 py-2.5 text-left">Unidade</th>
                  <th className="px-3 py-2.5 text-left">Data da ligação</th>
                  <th className="px-3 py-2.5 text-right">Duração</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {engajados.map(c => {
                  const match = c.phone ? matchMap.get(c.phone) : undefined
                  // unidade REAL só conta quando o lead foi de fato encontrado
                  // nas listas (join Supabase) — senão é só o nome da campanha
                  // do discador (Qick), não confirmado.
                  const unidadeReal = match?.encontrado ? match.unidade : undefined

                  return (
                    <tr key={c.id} className="bg-white hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium text-gray-800">{c.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500 tabular-nums">{c.phone ?? "—"}</td>
                      <td className="px-3 py-2">
                        {unidadeReal ? (
                          <span className="text-gray-700 font-medium">{unidadeReal}</span>
                        ) : (
                          <span
                            className="text-gray-400"
                            title="Unidade da campanha Qick — não confirmada nas listas"
                          >
                            {c.unidade ? `${c.unidade} *` : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 tabular-nums">{fmtDataHora(c.createdAt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                        {c.durationSeconds !== null ? formatSeconds(c.durationSeconds) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            Aguardando follow-up
                          </span>
                          {match && (
                            match.encontrado ? (
                              <span className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-full px-2 py-0.5 w-fit">
                                ✓ Na lista
                              </span>
                            ) : (
                              <span
                                className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-full px-2 py-0.5 w-fit"
                                title="Fora das listas do Portal"
                              >
                                ★ Lead novo
                              </span>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
