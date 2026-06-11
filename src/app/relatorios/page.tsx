"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Monitor,
  Phone,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react"
import { cn, formatSeconds } from "@/lib/utils"
import { MockDataBanner } from "@/components/ui-shared/MockDataBanner"
import type { ReportsPayload, HojeData, DailyRow, HourlyRow, OperatorRow } from "@/lib/mock-reports"

const TABS = ["Hoje", "Intraday", "Por Hora", "Operadores", "Histórico"] as const
type Tab = typeof TABS[number]
const REFRESH_MS = 5 * 60 * 1000
const HEALTH_MS  = 60 * 1000

// ─── System Health types ──────────────────────────────────────────────────────

interface HealthPayload {
  openai:      { balance: null; status: "ok" | "low" | "critical" | "error" | "unconfigured"; message?: string }
  argus:       { status: "ok" | "error" | "unconfigured"; latencyMs?: number }
  supabase:    { pendingCount: number; status: "ok" | "error" | "unconfigured"; configured?: boolean }
  lastWebhook: { receivedAt: string | null }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "agora"
  if (mins < 60) return `há ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `há ${hrs}h`
  return `há ${Math.floor(hrs / 24)}d`
}

// ─── System Health Panel ──────────────────────────────────────────────────────

function Dot({ color }: { color: "green" | "amber" | "red" | "gray" }) {
  const cls = { green: "bg-emerald-400", amber: "bg-amber-400", red: "bg-red-400", gray: "bg-gray-300" }[color]
  return <span className={cn("w-2 h-2 rounded-full shrink-0", cls)} />
}

function SystemHealthPanel() {
  const [health, setHealth] = useState<HealthPayload | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" })
      if (res.ok) setHealth(await res.json() as HealthPayload)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, HEALTH_MS)
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (!health) return null

  const { openai, argus, supabase: sb, lastWebhook } = health

  const argusColor = argus.status === "ok" ? "green" : argus.status === "unconfigured" ? "gray" : "red"
  const openaiColor = openai.status === "ok" ? "green" : openai.status === "low" ? "amber" : openai.status === "unconfigured" ? "gray" : "red"
  const sbColor = sb.status === "unconfigured" ? "gray" : sb.pendingCount > 0 ? "amber" : "green"

  return (
    <div className="bg-slate-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-4 flex-wrap">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Saúde do Sistema</span>

        {/* Argus */}
        <div className="flex items-center gap-1.5 text-xs">
          <Dot color={argusColor} />
          <span className={cn(
            "font-medium",
            argus.status === "ok" ? "text-emerald-700" : argus.status === "unconfigured" ? "text-gray-400" : "text-red-600"
          )}>
            Argus {argus.status === "ok" ? "Online" : argus.status === "unconfigured" ? "—" : "Offline"}
          </span>
          {argus.latencyMs !== undefined && argus.status === "ok" && (
            <span className="text-[10px] text-gray-400">{argus.latencyMs}ms</span>
          )}
        </div>

        <span className="text-gray-200 select-none">|</span>

        {/* OpenAI */}
        <div className="flex items-center gap-1.5 text-xs">
          <Dot color={openaiColor} />
          <span className={cn(
            "font-medium",
            openai.status === "ok"          ? "text-emerald-700" :
            openai.status === "low"         ? "text-amber-700"   :
            openai.status === "critical"    ? "text-red-600"     :
            openai.status === "unconfigured"? "text-gray-400"    : "text-red-600"
          )}>
            OpenAI {openai.status === "ok" ? "Online" : openai.status === "unconfigured" ? "—" : "Erro"}
          </span>
          {openai.status === "error" && openai.message && (
            <span className="text-[10px] text-red-400" title={openai.message}>
              · {openai.message.slice(0, 50)}{openai.message.length > 50 ? "…" : ""}
            </span>
          )}
        </div>

        <span className="text-gray-200 select-none">|</span>

        {/* Supabase pending */}
        <div className="flex items-center gap-1.5 text-xs">
          <Dot color={sbColor} />
          <span className={cn(
            "font-medium",
            sb.status === "unconfigured" ? "text-gray-400" : sb.pendingCount > 0 ? "text-amber-700" : "text-emerald-700"
          )}>
            {sb.status === "unconfigured"
              ? "Supabase —"
              : sb.pendingCount > 0
                ? `${sb.pendingCount} pendente${sb.pendingCount !== 1 ? "s" : ""}`
                : "Análises OK"}
          </span>
        </div>

        <span className="text-gray-200 select-none">|</span>

        {/* Last webhook */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3 shrink-0" />
          <span>
            Último webhook:{" "}
            <span className="font-medium text-gray-700">
              {lastWebhook.receivedAt
                ? relativeTime(lastWebhook.receivedAt)
                : sb.configured === false
                  ? "Supabase não configurado"
                  : "—"}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function brl(n: number) {
  return `R$ ${n.toLocaleString("pt-BR")}`
}

function convRowBg(taxa: number) {
  if (taxa >= 15) return "bg-emerald-50"
  if (taxa >= 10) return "bg-amber-50"
  return ""
}

function convText(taxa: number) {
  if (taxa >= 15) return "text-emerald-700 font-semibold"
  if (taxa >= 10) return "text-amber-700 font-semibold"
  return "text-red-600"
}

function scoreText(score: number) {
  if (score >= 85) return "text-emerald-700 font-semibold"
  if (score >= 70) return "text-amber-700"
  return "text-red-600"
}

function scoreDot(score: number) {
  if (score >= 85) return "bg-emerald-400"
  if (score >= 70) return "bg-amber-400"
  return "bg-red-400"
}

function fmtCountdown(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  accent: string
  valueClass?: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className={cn("h-1.5", accent)} />
      <div className="p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className={cn("text-3xl font-bold text-slate-800 mt-2 tabular-nums", valueClass)}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Tab: Hoje ────────────────────────────────────────────────────────────────

function TabHoje({ hoje, isDemo }: { hoje: HojeData; isDemo: boolean }) {
  const horaAtual = new Date().getHours()

  const alerts = [
    hoje.pct_nao_tabulado > 20 && {
      level: "red" as const,
      text: "NÃO TABULADO acima de 20% — revisar disciplina de tabulação",
    },
    horaAtual > 11 && hoje.qualificacoes === 0 && {
      level: "red" as const,
      text: "Nenhuma qualificação até 11h — dia em risco",
    },
    hoje.tma_segundos > 0 && hoje.tma_segundos < 30 && {
      level: "amber" as const,
      text: "TMA abaixo de 30s — possível problema de conexão ou lista fria",
    },
    hoje.taxa_aproveitamento > 0 && hoje.taxa_aproveitamento < 3 && {
      level: "amber" as const,
      text: "Taxa de aproveitamento abaixo de 3% — revisar lista ou horário",
    },
  ].filter(Boolean) as Array<{ level: "red" | "amber"; text: string }>

  const ontem = hoje.ontem

  return (
    <div className="space-y-6">

      {/* Block 1 — Volume */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Volume</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Tentativas"
            value={hoje.tentativas > 0 ? hoje.tentativas.toLocaleString("pt-BR") : isDemo ? "347" : "Aguardando"}
            sub="discadas hoje"
            accent="bg-slate-400"
          />
          <KpiCard
            label="Total Atendidas"
            value={hoje.atendidas > 0 ? hoje.atendidas.toLocaleString("pt-BR") : isDemo ? "221" : "Aguardando"}
            sub={hoje.tentativas > 0 ? `de ${hoje.tentativas.toLocaleString("pt-BR")} tentativas` : "alôs"}
            accent="bg-teal-500"
          />
          <KpiCard
            label="Taxa Aproveitamento"
            value={hoje.taxa_aproveitamento > 0 ? pct(hoje.taxa_aproveitamento) : "—"}
            sub="atendidas / tentativas"
            accent={hoje.taxa_aproveitamento >= 65 ? "bg-emerald-500" : hoje.taxa_aproveitamento >= 50 ? "bg-amber-400" : "bg-red-400"}
            valueClass={hoje.taxa_aproveitamento >= 65 ? "text-emerald-700" : hoje.taxa_aproveitamento >= 50 ? "text-amber-700" : hoje.taxa_aproveitamento > 0 ? "text-red-600" : undefined}
          />
          <KpiCard
            label="Qualificações Hoje"
            value={hoje.qualificacoes > 0 ? hoje.qualificacoes.toString() : isDemo ? "41" : "Aguardando"}
            sub="leads para closer"
            accent="bg-emerald-500"
            valueClass="text-emerald-700"
          />
        </div>
      </div>

      {/* Block 2 — Qualidade */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Qualidade</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="TMA Médio"
            value={hoje.tma_segundos > 0 ? formatSeconds(hoje.tma_segundos) : "—"}
            sub="meta: 3:00 – 6:00"
            accent="bg-amber-400"
            valueClass={hoje.tma_segundos >= 180 && hoje.tma_segundos <= 360 ? "text-emerald-700" : hoje.tma_segundos > 0 ? "text-amber-700" : undefined}
          />
          <KpiCard
            label="Taxa Qualificação"
            value={hoje.taxa_qualificacao > 0 ? pct(hoje.taxa_qualificacao) : "—"}
            sub="qualificações / atendidas"
            accent={hoje.taxa_qualificacao >= 15 ? "bg-emerald-400" : hoje.taxa_qualificacao >= 10 ? "bg-amber-400" : "bg-red-400"}
            valueClass={convText(hoje.taxa_qualificacao)}
          />
          <KpiCard
            label="% Não Tabulado"
            value={hoje.pct_nao_tabulado > 0 ? pct(hoje.pct_nao_tabulado) : "—"}
            sub={hoje.pct_nao_tabulado > 20 ? "acima do limite!" : "meta: ≤ 20%"}
            accent={hoje.pct_nao_tabulado > 20 ? "bg-red-500" : "bg-emerald-400"}
            valueClass={hoje.pct_nao_tabulado > 20 ? "text-red-600" : "text-emerald-700"}
          />
          <KpiCard
            label="Ligações < 30s"
            value={hoje.ligacoes_curtas > 0 ? hoje.ligacoes_curtas.toString() : "0"}
            sub={hoje.ligacoes_curtas_pct > 0 ? `${pct(hoje.ligacoes_curtas_pct)} das atendidas` : "das atendidas"}
            accent={hoje.ligacoes_curtas_pct > 20 ? "bg-amber-400" : "bg-slate-200"}
            valueClass={hoje.ligacoes_curtas_pct > 20 ? "text-amber-700" : undefined}
          />
        </div>
      </div>

      {/* Block 3 — Comparativo hoje vs. ontem */}
      {ontem && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Comparativo</p>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Hoje vs. ontem ({ontem.dia})
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {([
                { label: "Tentativas",          hj: hoje.tentativas,          on: ontem.tentativas,          fmt: (n: number) => n.toString() },
                { label: "Atendidas",            hj: hoje.atendidas,           on: ontem.atendidas,           fmt: (n: number) => n.toString() },
                { label: "Qualificações",        hj: hoje.qualificacoes,       on: ontem.qualificacoes,       fmt: (n: number) => n.toString() },
                { label: "Taxa Aproveitamento",  hj: hoje.taxa_aproveitamento, on: ontem.taxa_aproveitamento, fmt: pct },
                { label: "Taxa Qualificação",    hj: hoje.taxa_qualificacao,   on: ontem.taxa_qualificacao,   fmt: pct },
                { label: "TMA",                  hj: hoje.tma_segundos,        on: ontem.tma_segundos,        fmt: formatSeconds, invertDelta: true },
              ] as Array<{ label: string; hj: number; on: number; fmt: (n: number) => string; invertDelta?: boolean }>)
                .map((row) => {
                  const delta = row.hj - row.on
                  const up = delta > 0
                  const neutral = Math.abs(delta) < 0.01
                  const positive = row.invertDelta ? !up : up
                  return (
                    <div key={row.label} className="flex items-center px-5 py-2.5 gap-4">
                      <span className="w-40 text-sm text-gray-600">{row.label}</span>
                      <span className="w-20 text-sm font-semibold text-slate-800 tabular-nums">{row.fmt(row.hj)}</span>
                      <span className="w-20 text-sm text-gray-400 tabular-nums">{row.fmt(row.on)}</span>
                      {!neutral && (
                        <span className={cn("text-xs font-medium tabular-nums", positive ? "text-emerald-600" : "text-red-500")}>
                          {up ? "▲" : "▼"} {row.fmt(Math.abs(delta))}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* Block 4 — Alertas */}
      {alerts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Alertas</p>
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium",
                  alert.level === "red"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                )}
              >
                <span className="shrink-0 text-base">{alert.level === "red" ? "🔴" : "🟡"}</span>
                {alert.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block 5 — Destaques do dia */}
      {(hoje.melhor_hora || hoje.pior_hora) && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Destaques do Dia</p>
          <div className="grid grid-cols-2 gap-4">
            {hoje.melhor_hora && (
              <div className="bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden">
                <div className="h-1.5 bg-emerald-400" />
                <div className="p-5">
                  <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Melhor hora</p>
                  <p className="text-4xl font-bold text-slate-800 mt-2 tabular-nums">{hoje.melhor_hora.hora}</p>
                  <p className="text-sm font-semibold text-emerald-700 mt-1">
                    {pct(hoje.melhor_hora.taxa_qualificacao)} qualificação
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {hoje.melhor_hora.qualificacoes} qualif. em {hoje.melhor_hora.atendidas} atendidas
                  </p>
                </div>
              </div>
            )}
            {hoje.pior_hora && (
              <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
                <div className="h-1.5 bg-red-300" />
                <div className="p-5">
                  <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider">Pior hora</p>
                  <p className="text-4xl font-bold text-slate-800 mt-2 tabular-nums">{hoje.pior_hora.hora}</p>
                  <p className="text-sm font-semibold text-red-600 mt-1">
                    {pct(hoje.pior_hora.taxa_qualificacao)} qualificação
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {hoje.pior_hora.qualificacoes} qualif. em {hoje.pior_hora.atendidas} atendidas
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Tab: Intraday ────────────────────────────────────────────────────────────

function UnavailableState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Dados indisponíveis</p>
      <p className="text-xs text-gray-300 mt-1">Argus não respondeu. Tente novamente em instantes.</p>
    </div>
  )
}

function TabIntraday({ rows }: { rows: HourlyRow[] }) {
  if (rows.length === 0) return <UnavailableState />
  const maxLig = Math.max(...rows.map((r) => r.ligacoes), 1)
  const totalLig = rows.reduce((s, r) => s + r.ligacoes, 0)
  const totalConv = rows.reduce((s, r) => s + r.conversoes, 0)
  const peakHora = rows.reduce((best, r) => (r.ligacoes > best.ligacoes ? r : best), rows[0])

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total hoje</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totalLig}</p>
          <p className="text-xs text-gray-400">ligações</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total conversões</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totalConv}</p>
          <p className="text-xs text-gray-400">conversões</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Hora pico</p>
          <p className="text-2xl font-bold text-teal-600 mt-1">{peakHora?.hora ?? "—"}</p>
          <p className="text-xs text-gray-400">{peakHora?.ligacoes} ligações</p>
        </div>
      </div>

      {/* Horizontal bars */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Distribuição por hora</p>
        </div>
        <div className="p-5 space-y-3">
          {rows.map((r) => {
            const barPct = (r.ligacoes / maxLig) * 100
            const isPeak = r.hora === peakHora?.hora
            return (
              <div key={r.hora} className="flex items-center gap-3">
                <span className="w-9 text-xs font-mono font-semibold text-gray-500 text-right">{r.hora}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
                  <div
                    className={cn("h-full rounded-full transition-all", isPeak ? "bg-teal-500" : "bg-teal-400/70")}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className="w-16 text-xs text-gray-600 tabular-nums text-right font-medium">
                  {r.ligacoes} lig
                </span>
                <span className={cn("w-16 text-xs tabular-nums text-right", r.conversoes > 0 ? "text-emerald-600 font-semibold" : "text-gray-300")}>
                  {r.conversoes > 0 ? `${r.conversoes} conv` : "—"}
                </span>
                <span className={cn("w-14 text-xs tabular-nums text-right", convText(r.taxa_conversao))}>
                  {r.taxa_conversao > 0 ? pct(r.taxa_conversao) : "—"}
                </span>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex gap-6">
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-full bg-teal-500 inline-block" /> hora pico
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-full bg-teal-400/70 inline-block" /> demais horas
          </span>
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" /> conversões
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Por Hora ────────────────────────────────────────────────────────────

function TabPorHora({ rows }: { rows: HourlyRow[] }) {
  if (rows.length === 0) return <UnavailableState />
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Detalhamento por hora — cores por taxa de conversão
          <span className="ml-4 font-normal normal-case text-gray-400">
            <span className="text-emerald-600">≥ 15%</span>  ·  <span className="text-amber-600">10–14%</span>  ·  <span className="text-red-500">&lt; 10%</span>
          </span>
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {["Hora", "Ligações", "Atendidas", "Conversões", "Taxa Contato", "Taxa Conv"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => (
            <tr key={r.hora} className={cn("hover:bg-gray-50/80", convRowBg(r.taxa_conversao))}>
              <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">{r.hora}</td>
              <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.ligacoes}</td>
              <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.atendidas}</td>
              <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.conversoes}</td>
              <td className="px-4 py-2.5 tabular-nums text-gray-600">{pct(r.taxa_contato)}</td>
              <td className={cn("px-4 py-2.5 tabular-nums", convText(r.taxa_conversao))}>
                {pct(r.taxa_conversao)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
            <td className="px-4 py-2.5 text-gray-600">Total</td>
            <td className="px-4 py-2.5 tabular-nums text-gray-700">
              {rows.reduce((s, r) => s + r.ligacoes, 0)}
            </td>
            <td className="px-4 py-2.5 tabular-nums text-gray-700">
              {rows.reduce((s, r) => s + r.atendidas, 0)}
            </td>
            <td className="px-4 py-2.5 tabular-nums text-emerald-700">
              {rows.reduce((s, r) => s + r.conversoes, 0)}
            </td>
            <td className="px-4 py-2.5" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Tab: Operadores ──────────────────────────────────────────────────────────

function TabOperadores({ rows }: { rows: OperatorRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Ranking de operadores — ordenado por qualificações
          <span className="ml-4 font-normal normal-case text-gray-400">
            Score IA: <span className="text-emerald-600">≥ 85</span>  ·  <span className="text-amber-600">70–84</span>  ·  <span className="text-red-500">&lt; 70</span>
          </span>
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {["#", "Operador", "Ligações", "Atendidas", "Qualif", "Taxa Cont", "Taxa Qualif", "TMA", "Score IA"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide first:px-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <tr key={r.id} className="hover:bg-gray-50/80">
              <td className="pl-5 pr-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", r.score_ia !== null ? scoreDot(r.score_ia) : "bg-gray-300")} />
                  <span className="font-medium text-slate-800">{r.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 tabular-nums text-gray-700">{r.ligacoes_realizadas}</td>
              <td className="px-4 py-3 tabular-nums text-gray-700">{r.ligacoes_atendidas}</td>
              <td className="px-4 py-3 tabular-nums font-semibold text-emerald-700">{r.conversoes}</td>
              <td className="px-4 py-3 tabular-nums text-gray-600">{pct(r.taxa_contato)}</td>
              <td className={cn("px-4 py-3 tabular-nums", convText(r.taxa_conversao))}>
                {pct(r.taxa_conversao)}
              </td>
              <td className={cn("px-4 py-3 tabular-nums", r.tma_segundos <= 240 ? "text-gray-600" : "text-amber-700")}>
                {r.tma_segundos > 0 ? formatSeconds(r.tma_segundos) : "—"}
              </td>
              <td className={cn("px-4 py-3 tabular-nums", r.score_ia !== null ? scoreText(r.score_ia) : "text-gray-400")}>
                {r.score_ia !== null ? r.score_ia : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
            <td className="pl-5 pr-4 py-2.5 text-gray-400 text-xs">Total</td>
            <td className="px-4 py-2.5 text-gray-400 text-xs">
              {rows.length} operadores
            </td>
            <td className="px-4 py-2.5 tabular-nums text-gray-700">
              {rows.reduce((s, r) => s + r.ligacoes_realizadas, 0)}
            </td>
            <td className="px-4 py-2.5 tabular-nums text-gray-700">
              {rows.reduce((s, r) => s + r.ligacoes_atendidas, 0)}
            </td>
            <td className="px-4 py-2.5 tabular-nums text-emerald-700">
              {rows.reduce((s, r) => s + r.conversoes, 0)}
            </td>
            <td className="px-4 py-2.5" colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Tab: Histórico ───────────────────────────────────────────────────────────

function TabHistorico({ rows }: { rows: DailyRow[] }) {
  const maxConv = Math.max(...rows.map((r) => r.conversoes), 1)
  const avgConv = rows.reduce((s, r) => s + r.conversoes, 0) / rows.length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Melhor dia</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {rows.find((r) => r.conversoes === maxConv)?.dia ?? "—"}
          </p>
          <p className="text-xs text-gray-400">{maxConv} conversões</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Média diária</p>
          <p className="text-xl font-bold text-teal-600 mt-1">{avgConv.toFixed(1)}</p>
          <p className="text-xs text-gray-400">conversões / dia</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Receita 15 dias</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {brl(rows.reduce((s, r) => s + r.receita, 0))}
          </p>
          <p className="text-xs text-gray-400">estimado</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Histórico — últimos 15 dias úteis
            <span className="ml-4 font-normal normal-case text-gray-400">
              Taxa conv: <span className="text-emerald-600">≥ 15%</span>  ·  <span className="text-amber-600">10–14%</span>
            </span>
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["Data", "Ligações", "Atendidas", "Conv", "Taxa Contato", "Taxa Conv", "TMA", "Receita"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...rows].reverse().map((r) => (
              <tr
                key={r.date}
                className={cn("hover:bg-gray-50/80", convRowBg(r.taxa_conversao))}
              >
                <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{r.dia}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.ligacoes}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.atendidas}</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold text-emerald-700">{r.conversoes}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-600">{pct(r.taxa_contato)}</td>
                <td className={cn("px-4 py-2.5 tabular-nums", convText(r.taxa_conversao))}>
                  {pct(r.taxa_conversao)}
                </td>
                <td className={cn("px-4 py-2.5 tabular-nums", r.tma_segundos <= 240 ? "text-gray-600" : "text-amber-700")}>
                  {formatSeconds(r.tma_segundos)}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-gray-600">{brl(r.receita)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
              <td className="px-4 py-2.5 text-gray-600">15 dias</td>
              <td className="px-4 py-2.5 tabular-nums text-gray-700">
                {rows.reduce((s, r) => s + r.ligacoes, 0).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-gray-700">
                {rows.reduce((s, r) => s + r.atendidas, 0).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-emerald-700">
                {rows.reduce((s, r) => s + r.conversoes, 0)}
              </td>
              <td className="px-4 py-2.5" colSpan={3} />
              <td className="px-4 py-2.5 tabular-nums text-emerald-700">
                {brl(rows.reduce((s, r) => s + r.receita, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>("Hoje")
  const [data, setData] = useState<ReportsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/daily")
      const json = (await res.json()) as ReportsPayload
      setData(json)
      setLastUpdate(new Date())
      setCountdown(REFRESH_MS / 1000)
    } catch {
      // keep existing data
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => (c > 1 ? c - 1 : REFRESH_MS / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const tabIcons: Record<Tab, React.ReactNode> = {
    Hoje:       <TrendingUp className="w-3.5 h-3.5" />,
    Intraday:   <BarChart3  className="w-3.5 h-3.5" />,
    "Por Hora": <Clock      className="w-3.5 h-3.5" />,
    Operadores: <Users      className="w-3.5 h-3.5" />,
    Histórico:  <BarChart3  className="w-3.5 h-3.5" />,
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Demo banner */}
      <MockDataBanner isDemo={!data || data.source === "mock"} reason="Argus indisponível" />

      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href="/cockpit" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-sm font-medium">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Cockpit</span>
            </Link>
            <Link href="/">
              <Image src="/logo-creditum.png" alt="Creditum" height={26} width={74} priority className="object-contain" />
            </Link>
            <div className="hidden sm:flex items-center gap-1">
              <Link href="/cockpit" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                <Monitor className="w-3.5 h-3.5" /> SDR Cockpit
              </Link>
              <Link href="/analise" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                <Phone className="w-3.5 h-3.5" /> Análise de Ligações
              </Link>
              <Link href="/relatorios" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                <BarChart3 className="w-3.5 h-3.5" /> Relatórios
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {data && (
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                data.source === "argus" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              )}>
                {data.source === "argus" ? "Argus" : "Demo"}
              </span>
            )}
            <span className="hidden sm:inline">
              {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
        </div>
      </header>

      {/* Sub-header: title + refresh info */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-800">Relatórios SDR</h1>
            <p className="text-xs text-gray-400">Creditum — Equipe de vendas educacional</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {lastUpdate && (
              <span>
                Atualizado: {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchData}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-teal-600 transition-colors"
              title={`Próxima atualização em ${fmtCountdown(countdown)}`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{fmtCountdown(countdown)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* System Health Panel */}
      <SystemHealthPanel />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1" aria-label="Tabs">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap",
                  tab === t
                    ? "border-teal-500 text-teal-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                {tabIcons[t]}
                {t}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-teal-500 rounded-full animate-spin" />
              <span className="text-sm">Carregando relatórios...</span>
            </div>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            Dados indisponíveis — verifique a conexão
          </div>
        ) : (
          <>
            {tab === "Hoje"       && <TabHoje       hoje={data.hoje} isDemo={data.source === "mock"} />}
            {tab === "Intraday"   && <TabIntraday   rows={data.intraday} />}
            {tab === "Por Hora"   && <TabPorHora    rows={data.por_hora} />}
            {tab === "Operadores" && <TabOperadores rows={data.operadores} />}
            {tab === "Histórico"  && <TabHistorico  rows={data.historico} />}
          </>
        )}
      </main>

      <footer className="py-3 text-center text-[10px] text-gray-300">
        Creditum Portal · Módulo 3 — Relatórios · Dados atualizados a cada 5 min
      </footer>
    </div>
  )
}
