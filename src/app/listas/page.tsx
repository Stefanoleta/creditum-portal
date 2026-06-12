"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { BarChart3, Microscope, LayoutList, List, Upload, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, PhoneOff, Check, ArrowRightLeft, Thermometer, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { type ListaMeta, type LeadInput } from "@/lib/lista-parser"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lista {
  id: string
  nome_arquivo: string
  unidade: string
  tipo_lista: string
  data_lista: string
  total_leads: number
  formato: string
  uploaded_at: string
  status: string
}

interface Lead {
  id: string
  lista_id: string
  nome: string
  telefone_principal: string | null
  telefone_secundario: string | null
  matricula: string | null
  situacao: string | null
  descricao: string | null
  pendencia_financeira: string | null
  faltas_consecutivas: number | null
  parcelas_totais: number | null
  fora_politica: boolean
  recontato_em: string | null
  whatsapp_enviado_em: string | null
}

interface LeadHigienizacao {
  id: string
  nome: string
  telefone_principal: string | null
  motivo_higienizacao: string | null
  listas: { nome_arquivo: string; unidade: string } | null
}

interface LeadSugestao {
  id: string
  nome: string
  telefone_principal: string | null
  motivo_higienizacao: string | null
  telefone_sugerido: string | null
  listas: { nome_arquivo: string; unidade: string } | null
}

const MOTIVO_LABEL: Record<string, string> = {
  telefone_fixo:               "Telefone fixo",
  sem_ddd:                     "Sem DDD",
  numero_incompleto:           "Número incompleto",
  formato_invalido:            "Formato inválido",
  numero_inexistente_discador: "Inexistente (Argus)",
}

interface DuplicataSummary {
  novos_leads:             number
  duplicatas_mesma_lista:  number
  duplicatas_ignoradas:    number
  possiveis_higienizacoes: Array<{ nome: string; telefone_novo: string; telefone_antigo: string; lista_origem: string }>
  leads_higienizacao:      number
}

type RecontatoCategoria =
  | "nao_atendeu" | "mae_atendeu" | "nao_podia_falar" | "nao_gostou"
  | "terceiro_nao_conhece" | "fora_politica" | "qualificado" | "convertido" | "outros"
  // Categorias IA (tabulacao_ia automática)
  | "ocupado_recontatar" | "interessado_sem_fechar" | "mae_familiar_atendeu"
  | "nao_reconhece_aguardar" | "objecao_financeira" | "objecao_prazo"
  | "nao_gostou_proposta" | "ja_resolveu" | "numero_invalido"
  | "recusa_definitiva" | "nao_atendeu_multiplas"

interface RecontatoGrupo {
  categoria:  RecontatoCategoria
  label:      string
  count:      number
  proxima_em: string | null
}

interface RecontatoLead {
  id:                 string
  nome:               string
  telefone_principal: string | null
  recontato_em:       string | null
  observacao:         string | null
  listas:             { nome_arquivo: string; unidade: string } | null
}

interface UnidadeMetrica {
  unidade:             string
  score:               number | null
  status:              "pronta" | "em_andamento" | "descanso" | "insuficiente"
  total_leads:         number
  ultima_lista_em:     string
  dias_sem_nova_lista: number
  taxa_conversao:      number | null
  qtd_listas:          number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function daysFromNow(iso: string): number {
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(iso + "T00:00:00")
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function recontato7dias(leads: Lead[]) {
  return leads.filter(l => {
    if (!l.recontato_em) return false
    const d = daysFromNow(l.recontato_em)
    return d >= 0 && d <= 7
  })
}

function suggestRecontato(parcelasStr: string): string {
  const p = parseInt(parcelasStr, 10)
  if (isNaN(p) || p <= 19) return ""
  const d = new Date()
  d.setDate(d.getDate() + (p - 19) * 30)
  return d.toISOString().split("T")[0]
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (f: File | null | undefined) => {
    if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) onFile(f)
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 py-12",
        dragging ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-gray-300 bg-white"
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className={cn("w-8 h-8", dragging ? "text-emerald-500" : "text-gray-300")} />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-600">Arraste um arquivo Excel aqui</p>
        <p className="text-xs text-gray-400 mt-0.5">ou clique para selecionar — .xlsx / .xls</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => handle(e.target.files?.[0])}
      />
    </div>
  )
}

// ─── Preview table ─────────────────────────────────────────────────────────────

function PreviewTable({ leads }: { leads: LeadInput[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-400 font-medium">
            <th className="px-3 py-2 text-left">Nome</th>
            <th className="px-3 py-2 text-left">Telefone</th>
            <th className="px-3 py-2 text-left">Situação</th>
            <th className="px-3 py-2 text-left">Pend. Financeira</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {leads.map((l, i) => (
            <tr key={i} className="bg-white hover:bg-gray-50/50">
              <td className="px-3 py-2 text-gray-800 font-medium">{l.nome}</td>
              <td className="px-3 py-2 tabular-nums">
                <span className="flex items-center gap-1.5">
                  <span className={l.precisa_higienizacao ? "text-amber-600" : "text-gray-500"}>
                    {l.telefone_principal ?? "—"}
                  </span>
                  {l.precisa_higienizacao && (
                    <span title={MOTIVO_LABEL[l.motivo_higienizacao ?? ""] ?? l.motivo_higienizacao ?? "Verificar"}>
                      <PhoneOff className="w-3 h-3 text-amber-500 shrink-0" />
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-500">{l.situacao ?? "—"}</td>
              <td className="px-3 py-2 text-gray-500">{l.pendencia_financeira ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Lead row with inline editing ─────────────────────────────────────────────

function LeadRow({
  lead,
  onPatch,
}: {
  lead: Lead
  onPatch: (id: string, patch: Partial<Lead>) => void
}) {
  const [parcelas, setParcelas] = useState(lead.parcelas_totais?.toString() ?? "")
  const [recontato, setRecontato] = useState(lead.recontato_em ?? "")
  const [fora, setFora] = useState(lead.fora_politica)
  const [saving, setSaving] = useState(false)

  function handleParcelas(val: string) {
    setParcelas(val)
    const p = parseInt(val, 10)
    if (!isNaN(p) && p > 19) {
      setFora(true)
      const sug = suggestRecontato(val)
      if (sug && !recontato) setRecontato(sug)
    }
  }

  async function save(field: string, value: unknown) {
    setSaving(true)
    await onPatch(lead.id, { [field]: value } as Partial<Lead>)
    setSaving(false)
  }

  const days = lead.recontato_em ? daysFromNow(lead.recontato_em) : null
  const recontatoProximo = days !== null && days >= 0 && days <= 7

  return (
    <tr className={cn("hover:bg-gray-50/50", fora && "bg-red-50/30")}>
      <td className="px-3 py-2">
        <div className="text-xs font-medium text-gray-800">{lead.nome}</div>
        {lead.situacao && <div className="text-[10px] text-gray-400">{lead.situacao}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">
        {lead.telefone_principal ?? "—"}
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          value={parcelas}
          onChange={e => handleParcelas(e.target.value)}
          onBlur={() => {
            const p = parseInt(parcelas, 10)
            if (!isNaN(p)) {
              save("parcelas_totais", p)
              if (fora !== lead.fora_politica) save("fora_politica", fora)
              if (recontato !== (lead.recontato_em ?? "")) save("recontato_em", recontato || null)
            }
          }}
          placeholder="—"
          className="w-16 text-xs text-center bg-transparent border-b border-gray-200 focus:border-emerald-400 focus:outline-none py-0.5 tabular-nums"
        />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => { const next = !fora; setFora(next); save("fora_politica", next) }}
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors",
            fora
              ? "bg-red-50 text-red-600 border-red-200"
              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
          )}
        >
          {fora ? "Fora da política" : "Dentro"}
        </button>
        {saving && <span className="ml-1 text-[9px] text-gray-300">...</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={recontato}
            onChange={e => setRecontato(e.target.value)}
            onBlur={() => save("recontato_em", recontato || null)}
            className="text-xs bg-transparent border-b border-gray-200 focus:border-emerald-400 focus:outline-none py-0.5"
          />
          {recontatoProximo && (
            <span className="text-[9px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
              {days === 0 ? "hoje" : `${days}d`}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Leads panel ──────────────────────────────────────────────────────────────

function LeadsPanel({
  lista,
  onClose,
}: {
  lista: Lista
  onClose: () => void
}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  useEffect(() => {
    setLoading(true)
    fetch(`/api/listas/${lista.id}/leads?page=${page}&limit=${LIMIT}`)
      .then(r => r.json())
      .then(d => { setLeads(d.leads ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [lista.id, page])

  async function patchLead(lead_id: string, patch: Partial<Lead>) {
    await fetch(`/api/listas/${lista.id}/leads`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id, patch }),
    })
    setLeads(prev => prev.map(l => l.id === lead_id ? { ...l, ...patch } : l))
  }

  const proximos = recontato7dias(leads)

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white shadow-2xl flex flex-col z-50">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
        <div>
          <div className="text-sm font-semibold text-gray-800">{lista.unidade} — {lista.tipo_lista}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{lista.nome_arquivo} · {total} leads · {fmtDate(lista.data_lista)}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {proximos.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span><strong>{proximos.length} lead{proximos.length > 1 ? "s" : ""}</strong> com recontato nos próximos 7 dias</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">Nenhum lead encontrado</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-gray-400 font-medium">
                <th className="px-3 py-2.5 text-left">Nome</th>
                <th className="px-3 py-2.5 text-left">Telefone</th>
                <th className="px-3 py-2.5 text-left">Parcelas</th>
                <th className="px-3 py-2.5 text-left">Política</th>
                <th className="px-3 py-2.5 text-left">Recontato Em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map(l => (
                <LeadRow key={l.id} lead={l} onPatch={patchLead} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">
            {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} de {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              disabled={(page + 1) * LIMIT >= total}
              onClick={() => setPage(p => p + 1)}
              className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Higienização tab ─────────────────────────────────────────────────────────

function HigienizacaoTab({ onResolved }: { onResolved: () => void }) {
  const [subTab, setSubTab] = useState<"pendentes" | "sugestoes">("pendentes")

  // Pendentes
  const [pendentes, setPendentes] = useState<LeadHigienizacao[]>([])
  const [totalPendentes, setTotalPendentes] = useState(0)
  const [pagePendentes, setPagePendentes] = useState(1)

  // Sugestões
  const [sugestoes, setSugestoes] = useState<LeadSugestao[]>([])
  const [totalSugestoes, setTotalSugestoes] = useState(0)
  const [pageSugestoes, setPageSugestoes] = useState(1)

  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const PER_PAGE = 20

  const loadPendentes = useCallback(() => {
    setLoading(true)
    setApiError(null)
    fetch(`/api/leads/higienizacao?tipo=pendentes&page=${pagePendentes}&per_page=${PER_PAGE}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) { setApiError(d.error ?? `Erro ${r.status}`); return }
        setPendentes(d.leads ?? [])
        setTotalPendentes(d.total ?? 0)
      })
      .catch(e => setApiError(e instanceof Error ? e.message : "Erro de rede"))
      .finally(() => setLoading(false))
  }, [pagePendentes])

  const loadSugestoes = useCallback(() => {
    setLoading(true)
    setApiError(null)
    fetch(`/api/leads/higienizacao?tipo=sugestoes&page=${pageSugestoes}&per_page=${PER_PAGE}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) { setApiError(d.error ?? `Erro ${r.status}`); return }
        setSugestoes(d.leads ?? [])
        setTotalSugestoes(d.total ?? 0)
      })
      .catch(e => setApiError(e instanceof Error ? e.message : "Erro de rede"))
      .finally(() => setLoading(false))
  }, [pageSugestoes])

  useEffect(() => { if (subTab === "pendentes") loadPendentes() }, [loadPendentes, subTab])
  useEffect(() => { if (subTab === "sugestoes") loadSugestoes() }, [loadSugestoes, subTab])

  async function resolve(lead_id: string, telefone_corrigido: string | null) {
    setSaving(s => ({ ...s, [lead_id]: true }))
    await fetch("/api/leads/higienizacao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id, acao: "resolver", telefone_corrigido }),
    })
    setPendentes(prev => prev.filter(l => l.id !== lead_id))
    setTotalPendentes(t => t - 1)
    setSaving(s => ({ ...s, [lead_id]: false }))
    onResolved()
  }

  async function handleSugestao(lead_id: string, acao: "confirmar_sugestao" | "ignorar_sugestao") {
    setSaving(s => ({ ...s, [lead_id]: true }))
    await fetch("/api/leads/higienizacao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id, acao }),
    })
    setSugestoes(prev => prev.filter(l => l.id !== lead_id))
    setTotalSugestoes(t => t - 1)
    setSaving(s => ({ ...s, [lead_id]: false }))
    onResolved()
  }

  return (
    <div className="bg-white rounded-lg shadow-sm flex flex-col">
      {/* Sub-tabs */}
      <div className="flex items-center gap-0 border-b border-gray-100 px-5 pt-5">
        <button
          onClick={() => setSubTab("pendentes")}
          className={cn(
            "text-xs font-medium px-3 py-2 border-b-2 transition-colors -mb-px mr-1",
            subTab === "pendentes"
              ? "border-amber-500 text-amber-700"
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          Pendentes
          {totalPendentes > 0 && (
            <span className="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5 py-px">
              {totalPendentes}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("sugestoes")}
          className={cn(
            "text-xs font-medium px-3 py-2 border-b-2 transition-colors -mb-px",
            subTab === "sugestoes"
              ? "border-teal-500 text-teal-700"
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          Sugestões de atualização
          {totalSugestoes > 0 && (
            <span className="ml-1.5 text-[10px] font-bold bg-teal-100 text-teal-700 rounded-full px-1.5 py-px">
              {totalSugestoes}
            </span>
          )}
        </button>
      </div>

      <div className="p-5">

        {/* ── Sub-tab: Pendentes ──────────────────────────────────────────── */}
        {subTab === "pendentes" && (
          <>
            {apiError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Erro ao carregar: {apiError}
                <button className="ml-auto text-xs underline" onClick={loadPendentes}>Tentar novamente</button>
              </div>
            )}
            {loading ? (
              <div className="flex items-center gap-3 py-8 justify-center text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
                Carregando...
              </div>
            ) : !apiError && pendentes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <Check className="w-8 h-8 text-emerald-200" />
                <p className="text-sm">Nenhum contato pendente de higienização</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 font-medium">
                        <th className="px-3 py-2.5 text-left">Nome</th>
                        <th className="px-3 py-2.5 text-left">Telefone original</th>
                        <th className="px-3 py-2.5 text-left">Motivo</th>
                        <th className="px-3 py-2.5 text-left">Lista</th>
                        <th className="px-3 py-2.5 text-left">Unidade</th>
                        <th className="px-3 py-2.5 text-left">Correção</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pendentes.map(l => (
                        <tr key={l.id} className="bg-white hover:bg-gray-50/30">
                          <td className="px-3 py-2.5 text-gray-800 font-medium max-w-[150px] truncate">{l.nome}</td>
                          <td className="px-3 py-2.5 text-amber-600 tabular-nums font-mono">
                            {l.telefone_principal ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                              {MOTIVO_LABEL[l.motivo_higienizacao ?? ""] ?? l.motivo_higienizacao ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 max-w-[130px] truncate">
                            {l.listas?.nome_arquivo ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{l.listas?.unidade ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <input
                              type="tel"
                              placeholder="DDD + número"
                              value={corrections[l.id] ?? ""}
                              onChange={e => setCorrections(c => ({ ...c, [l.id]: e.target.value }))}
                              className="w-32 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={saving[l.id] || !(corrections[l.id] ?? "").trim()}
                                onClick={() => resolve(l.id, corrections[l.id].trim())}
                                className="text-[10px] font-medium px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                Resolver
                              </button>
                              <button
                                disabled={saving[l.id]}
                                onClick={() => resolve(l.id, null)}
                                className="text-[10px] font-medium px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                                title="Sem contato possível"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPendentes > PER_PAGE && (
                  <div className="flex items-center justify-between pt-3">
                    <span className="text-xs text-gray-400">
                      {(pagePendentes - 1) * PER_PAGE + 1}–{Math.min(pagePendentes * PER_PAGE, totalPendentes)} de {totalPendentes}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={pagePendentes === 1}
                        onClick={() => setPagePendentes(p => p - 1)}
                        className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={pagePendentes * PER_PAGE >= totalPendentes}
                        onClick={() => setPagePendentes(p => p + 1)}
                        className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Sub-tab: Sugestões ──────────────────────────────────────────── */}
        {subTab === "sugestoes" && (
          <>
            {loading ? (
              <div className="flex items-center gap-3 py-8 justify-center text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
                Carregando...
              </div>
            ) : sugestoes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <ArrowRightLeft className="w-8 h-8 text-teal-100" />
                <p className="text-sm">Nenhuma sugestão de atualização pendente</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3">
                  Estes leads estão na fila de Higienização mas uma importação posterior trouxe um telefone válido para o mesmo nome. Confirme ou ignore a atualização.
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 font-medium">
                        <th className="px-3 py-2.5 text-left">Nome</th>
                        <th className="px-3 py-2.5 text-left">Telefone atual</th>
                        <th className="px-3 py-2.5 text-left">Motivo</th>
                        <th className="px-3 py-2.5 text-left">Telefone sugerido</th>
                        <th className="px-3 py-2.5 text-left">Lista</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sugestoes.map(l => (
                        <tr key={l.id} className="bg-white hover:bg-gray-50/30">
                          <td className="px-3 py-2.5 text-gray-800 font-medium max-w-[150px] truncate">{l.nome}</td>
                          <td className="px-3 py-2.5 text-amber-600 tabular-nums font-mono line-through opacity-60">
                            {l.telefone_principal ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                              {MOTIVO_LABEL[l.motivo_higienizacao ?? ""] ?? l.motivo_higienizacao ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-teal-700 tabular-nums font-mono font-semibold">
                            {l.telefone_sugerido ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 max-w-[130px] truncate">
                            {l.listas?.nome_arquivo ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={saving[l.id]}
                                onClick={() => handleSugestao(l.id, "confirmar_sugestao")}
                                className="text-[10px] font-medium px-2.5 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors"
                              >
                                Confirmar
                              </button>
                              <button
                                disabled={saving[l.id]}
                                onClick={() => handleSugestao(l.id, "ignorar_sugestao")}
                                className="text-[10px] font-medium px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                                title="Ignorar sugestão"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalSugestoes > PER_PAGE && (
                  <div className="flex items-center justify-between pt-3">
                    <span className="text-xs text-gray-400">
                      {(pageSugestoes - 1) * PER_PAGE + 1}–{Math.min(pageSugestoes * PER_PAGE, totalSugestoes)} de {totalSugestoes}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={pageSugestoes === 1}
                        onClick={() => setPageSugestoes(p => p - 1)}
                        className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={pageSugestoes * PER_PAGE >= totalSugestoes}
                        onClick={() => setPageSugestoes(p => p + 1)}
                        className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Recontatos ───────────────────────────────────────────────────────────────

const CAT_COLOR: Record<RecontatoCategoria, { dot: string; badge: string; ring: string }> = {
  // Originais
  nao_atendeu:           { dot: "bg-gray-400",    badge: "bg-gray-50 text-gray-500 border-gray-200",         ring: "ring-gray-100"   },
  nao_podia_falar:       { dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200",      ring: "ring-amber-100"  },
  mae_atendeu:           { dot: "bg-blue-400",    badge: "bg-blue-50 text-blue-700 border-blue-200",         ring: "ring-blue-100"   },
  nao_gostou:            { dot: "bg-red-400",     badge: "bg-red-50 text-red-600 border-red-200",            ring: "ring-red-100"    },
  terceiro_nao_conhece:  { dot: "bg-purple-400",  badge: "bg-purple-50 text-purple-700 border-purple-200",   ring: "ring-purple-100" },
  fora_politica:         { dot: "bg-red-600",     badge: "bg-red-100 text-red-700 border-red-300",           ring: "ring-red-200"    },
  qualificado:           { dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", ring: "ring-emerald-100"},
  convertido:            { dot: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", ring: "ring-emerald-200"},
  outros:                { dot: "bg-gray-300",    badge: "bg-gray-50 text-gray-400 border-gray-200",         ring: "ring-gray-100"   },
  // IA
  ocupado_recontatar:    { dot: "bg-amber-300",   badge: "bg-amber-50 text-amber-600 border-amber-200",      ring: "ring-amber-100"  },
  interessado_sem_fechar:{ dot: "bg-emerald-300", badge: "bg-emerald-50 text-emerald-600 border-emerald-200", ring: "ring-emerald-100"},
  mae_familiar_atendeu:  { dot: "bg-blue-300",    badge: "bg-blue-50 text-blue-600 border-blue-200",         ring: "ring-blue-100"   },
  nao_reconhece_aguardar:{ dot: "bg-purple-300",  badge: "bg-purple-50 text-purple-600 border-purple-200",   ring: "ring-purple-100" },
  objecao_financeira:    { dot: "bg-orange-400",  badge: "bg-orange-50 text-orange-700 border-orange-200",   ring: "ring-orange-100" },
  objecao_prazo:         { dot: "bg-orange-300",  badge: "bg-orange-50 text-orange-600 border-orange-200",   ring: "ring-orange-100" },
  nao_gostou_proposta:   { dot: "bg-red-400",     badge: "bg-red-50 text-red-600 border-red-200",            ring: "ring-red-100"    },
  ja_resolveu:           { dot: "bg-gray-400",    badge: "bg-gray-50 text-gray-500 border-gray-200",         ring: "ring-gray-100"   },
  numero_invalido:       { dot: "bg-gray-300",    badge: "bg-gray-50 text-gray-400 border-gray-200",         ring: "ring-gray-100"   },
  recusa_definitiva:     { dot: "bg-red-600",     badge: "bg-red-100 text-red-700 border-red-300",           ring: "ring-red-200"    },
  nao_atendeu_multiplas: { dot: "bg-gray-500",    badge: "bg-gray-50 text-gray-600 border-gray-200",         ring: "ring-gray-100"   },
}

function RecontatosTab() {
  const [grupos, setGrupos]                 = useState<RecontatoGrupo[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [expanded, setExpanded]             = useState<RecontatoCategoria | null>(null)
  const [leads, setLeads]                   = useState<RecontatoLead[]>([])
  const [leadsTotal, setLeadsTotal]         = useState(0)
  const [leadsPage, setLeadsPage]           = useState(1)
  const [leadsLoading, setLeadsLoading]     = useState(false)
  const [gerandoLista, setGerandoLista]     = useState<RecontatoCategoria | null>(null)
  const [listaGerada, setListaGerada]       = useState<string | null>(null)
  const PER_PAGE = 50

  const loadGrupos = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/leads/recontatos")
      .then(async r => {
        const d = await r.json()
        if (!r.ok) { setError(d.error ?? `Erro ${r.status}`); return }
        setGrupos(d.grupos ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : "Erro de rede"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadGrupos() }, [loadGrupos])

  const loadLeads = useCallback((cat: RecontatoCategoria, page: number) => {
    setLeadsLoading(true)
    fetch(`/api/leads/recontatos?categoria=${cat}&page=${page}&per_page=${PER_PAGE}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) return
        setLeads(d.leads ?? [])
        setLeadsTotal(d.total ?? 0)
      })
      .finally(() => setLeadsLoading(false))
  }, [])

  function toggleExpand(cat: RecontatoCategoria) {
    if (expanded === cat) { setExpanded(null); setLeads([]); return }
    setExpanded(cat)
    setLeadsPage(1)
    loadLeads(cat, 1)
  }

  useEffect(() => {
    if (expanded) loadLeads(expanded, leadsPage)
  }, [expanded, leadsPage, loadLeads])

  function gerarLista(cat: RecontatoCategoria, count: number) {
    setGerandoLista(cat)
    // Busca todos os leads da categoria para montar CSV
    fetch(`/api/leads/recontatos?categoria=${cat}&page=1&per_page=200`)
      .then(r => r.json())
      .then(d => {
        const rows: RecontatoLead[] = d.leads ?? []
        const linhas = ["Nome,Telefone,Unidade,Recontato Em"]
        for (const l of rows) {
          const unidade = (l.listas as { unidade?: string } | null)?.unidade ?? ""
          linhas.push(`"${l.nome}","${l.telefone_principal ?? ""}","${unidade}","${l.recontato_em ?? ""}"`)
        }
        const csv  = linhas.join("\n")
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement("a")
        a.href     = url
        a.download = `recontatos-${cat}-${new Date().toISOString().split("T")[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
        setListaGerada(`${count} leads exportados`)
        setTimeout(() => setListaGerada(null), 4000)
      })
      .finally(() => setGerandoLista(null))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
        Carregando recontatos...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Erro ao carregar: {error}
        <button className="ml-auto text-xs underline" onClick={loadGrupos}>Tentar novamente</button>
      </div>
    )
  }

  if (grupos.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <Clock className="w-8 h-8 text-gray-200" />
          <p className="text-sm">Nenhum lead com recontato agendado.</p>
          <p className="text-xs text-gray-300">Execute o backfill para cruzar ligações do Argus com as listas.</p>
        </div>
      </div>
    )
  }

  const totalLeads = grupos.reduce((s, g) => s + g.count, 0)

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Recontatos por Categoria</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalLeads} lead{totalLeads !== 1 ? "s" : ""} com recontato agendado
          </p>
        </div>
        <button onClick={loadGrupos} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {listaGerada && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {listaGerada}
        </div>
      )}

      <div className="flex flex-col divide-y divide-gray-50">
        {grupos.map(grupo => {
          const cfg   = CAT_COLOR[grupo.categoria]
          const isExp = expanded === grupo.categoria
          return (
            <div key={grupo.categoria} className="py-1">
              <button
                onClick={() => toggleExpand(grupo.categoria)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left",
                  isExp ? "bg-gray-50" : "hover:bg-gray-50/70"
                )}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", cfg.dot)} />
                <span className="text-sm font-medium text-gray-800 flex-1">{grupo.label}</span>
                <span className={cn("text-[11px] font-bold border rounded-full px-2 py-0.5 tabular-nums", cfg.badge)}>
                  {grupo.count}
                </span>
                {grupo.proxima_em && (
                  <span className="text-[11px] text-gray-400 tabular-nums hidden sm:inline">
                    próx. {fmtDate(grupo.proxima_em)}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); gerarLista(grupo.categoria, grupo.count) }}
                  disabled={gerandoLista === grupo.categoria}
                  className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 hover:bg-emerald-100 transition-colors disabled:opacity-50 hidden sm:block"
                >
                  {gerandoLista === grupo.categoria ? "..." : "Gerar Lista"}
                </button>
                <ChevronRight className={cn("w-3.5 h-3.5 text-gray-300 shrink-0 transition-transform", isExp && "rotate-90")} />
              </button>

              {isExp && (
                <div className="ml-5 mt-1 mb-2">
                  {leadsLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
                      <div className="w-3 h-3 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
                      Carregando...
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-400 font-medium">
                              <th className="px-3 py-2 text-left">Nome</th>
                              <th className="px-3 py-2 text-left">Telefone</th>
                              <th className="px-3 py-2 text-left">Unidade</th>
                              <th className="px-3 py-2 text-left">Recontato em</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {leads.map(l => (
                              <tr key={l.id} className="bg-white hover:bg-gray-50/50">
                                <td className="px-3 py-2 font-medium text-gray-800">{l.nome}</td>
                                <td className="px-3 py-2 text-gray-500 tabular-nums">{l.telefone_principal ?? "—"}</td>
                                <td className="px-3 py-2 text-gray-500">
                                  {(l.listas as { unidade?: string } | null)?.unidade ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-500 tabular-nums">{fmtDate(l.recontato_em)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {leadsTotal > PER_PAGE && (
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <span className="text-[11px] text-gray-400">{leadsTotal} total</span>
                          <button
                            disabled={leadsPage === 1}
                            onClick={() => setLeadsPage(p => p - 1)}
                            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30"
                          >Anterior</button>
                          <button
                            disabled={(leadsPage - 1) * PER_PAGE + leads.length >= leadsTotal}
                            onClick={() => setLeadsPage(p => p + 1)}
                            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-30"
                          >Próxima</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Termômetro de Unidades ───────────────────────────────────────────────────

const STATUS_CONFIG = {
  pronta:       { label: "Pronta para abordagem", dot: "bg-emerald-400",  ring: "ring-emerald-200",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200",  score: "text-emerald-700" },
  em_andamento: { label: "Em andamento",           dot: "bg-amber-400",   ring: "ring-amber-200",    badge: "bg-amber-50 text-amber-700 border-amber-200",         score: "text-amber-700"   },
  descanso:     { label: "Em descanso",            dot: "bg-red-300",     ring: "ring-red-100",      badge: "bg-red-50 text-red-500 border-red-200",               score: "text-red-400"     },
  insuficiente: { label: "Dados insuficientes",    dot: "bg-gray-300",    ring: "ring-gray-100",     badge: "bg-gray-50 text-gray-400 border-gray-200",            score: "text-gray-400"    },
}

function UnidadeCard({ u }: { u: UnidadeMetrica }) {
  const cfg = STATUS_CONFIG[u.status]
  return (
    <div className={cn(
      "bg-white rounded-lg border shadow-sm p-4 flex flex-col gap-2 ring-1",
      cfg.ring
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", cfg.dot)} />
          <span className="text-sm font-semibold text-gray-800 truncate">{u.unidade}</span>
        </div>
        {u.score !== null ? (
          <span className={cn("text-2xl font-bold tabular-nums shrink-0", cfg.score)}>{u.score}</span>
        ) : (
          <span className="text-xs text-gray-300 shrink-0 pt-1">—</span>
        )}
      </div>

      <span className={cn("self-start text-[10px] font-medium border rounded-full px-2 py-0.5", cfg.badge)}>
        {cfg.label}
      </span>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-500">
        <div>
          <span className="text-gray-400">Leads: </span>
          <span className="font-medium text-gray-700 tabular-nums">{u.total_leads}</span>
        </div>
        <div>
          <span className="text-gray-400">Listas: </span>
          <span className="font-medium text-gray-700 tabular-nums">{u.qtd_listas}</span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-400">Última lista: </span>
          <span className="font-medium text-gray-700">{u.ultima_lista_em ? fmtDate(u.ultima_lista_em) : "—"}</span>
          {u.dias_sem_nova_lista > 0 && (
            <span className="ml-1 text-gray-400">({u.dias_sem_nova_lista}d atrás)</span>
          )}
        </div>
        <div className="col-span-2">
          <span className="text-gray-400">Conversão 90d: </span>
          <span className="font-medium text-gray-500">{u.taxa_conversao !== null ? `${(u.taxa_conversao * 100).toFixed(1)}%` : "sem dados"}</span>
        </div>
      </div>
    </div>
  )
}

function TermometroTab() {
  const [unidades, setUnidades] = useState<UnidadeMetrica[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/listas/unidades")
      .then(async r => {
        const d = await r.json()
        if (!r.ok) { setError(d.error ?? `Erro ${r.status}`); return }
        setUnidades(d.unidades ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : "Erro de rede"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
        Calculando scores...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Erro ao carregar: {error}
        <button className="ml-auto text-xs underline" onClick={load}>Tentar novamente</button>
      </div>
    )
  }

  if (unidades.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
        <Thermometer className="w-8 h-8 text-gray-200" />
        <p className="text-sm">Nenhuma unidade encontrada. Importe listas para ver o termômetro.</p>
      </div>
    )
  }

  // Separa unidades com e sem score para a pirâmide invertida
  const comScore    = unidades.filter(u => u.score !== null)
  const semScore    = unidades.filter(u => u.score === null)

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Termômetro de Unidades</h2>
          <p className="text-xs text-gray-400 mt-0.5">Prioridade de abordagem — quanto maior o score, mais pronta a unidade está para contato</p>
        </div>
        <button onClick={load} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
        {(["pronta", "em_andamento", "descanso"] as const).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full", STATUS_CONFIG[s].dot)} />
            {STATUS_CONFIG[s].label}
          </div>
        ))}
      </div>

      {/* Pirâmide invertida: cards por score desc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {comScore.map(u => <UnidadeCard key={u.unidade} u={u} />)}
      </div>

      {/* Unidades com dados insuficientes */}
      {semScore.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Dados insuficientes (menos de 2 listas)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {semScore.map(u => <UnidadeCard key={u.unidade} u={u} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ListasPage() {
  // ── Tab
  const [activeTab, setActiveTab] = useState<"listas" | "higienizacao" | "termometro" | "recontatos">("listas")
  const [higienizacaoCount, setHigienizacaoCount] = useState(0)

  // ── Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<{ meta: ListaMeta; leads: LeadInput[] } | null>(null)
  const [metaOverride, setMetaOverride] = useState({ unidade: "", tipo_lista: "", data_lista: "" })
  const [importing, setImporting] = useState(false)
  const [importOk, setImportOk] = useState<{ lista_id: string; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [duplicataSummary, setDuplicataSummary] = useState<DuplicataSummary | null>(null)
  const [sugestoesExpanded, setSugestoesExpanded] = useState(false)

  // ── Listas state
  const [listas, setListas] = useState<Lista[]>([])
  const [listasLoading, setListasLoading] = useState(true)
  const [selectedLista, setSelectedLista] = useState<Lista | null>(null)

  // ── Carregar listas
  const loadListas = useCallback(() => {
    setListasLoading(true)
    fetch("/api/listas")
      .then(r => r.json())
      .then(d => setListas(d.listas ?? []))
      .finally(() => setListasLoading(false))
  }, [])

  useEffect(() => { loadListas() }, [loadListas])

  // ── Carregar contagem global de higienização (pendentes)
  const loadHigienizacaoCount = useCallback(() => {
    fetch("/api/leads/higienizacao?tipo=pendentes&per_page=1")
      .then(r => r.json())
      .then(d => setHigienizacaoCount(d.total ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => { loadHigienizacaoCount() }, [loadHigienizacaoCount])

  // ── Parsear arquivo — fase de preview (nunca salva automaticamente)
  async function handleFile(f: File) {
    setUploadFile(f)
    setImportOk(null)
    setUploadError(null)
    setParseResult(null)
    setDuplicataSummary(null)
    setSugestoesExpanded(false)
    setParsing(true)

    const form = new FormData()
    form.append("arquivo", f)

    try {
      const res = await fetch("/api/listas/upload", { method: "POST", body: form })
      const json = await res.json()

      if (json.preview && json.meta) {
        setParseResult({ meta: json.meta, leads: json.preview })
        setMetaOverride({
          unidade:    json.meta.unidade    ?? "",
          tipo_lista: json.meta.tipo_lista ?? "",
          data_lista: json.meta.data_lista ?? "",
        })
        setDuplicataSummary({
          novos_leads:             json.novos_leads             ?? 0,
          duplicatas_mesma_lista:  json.duplicatas_mesma_lista  ?? 0,
          duplicatas_ignoradas:    json.duplicatas_ignoradas    ?? 0,
          possiveis_higienizacoes: json.possiveis_higienizacoes ?? [],
          leads_higienizacao:      json.leads_higienizacao      ?? 0,
        })
        if (json.warning) setUploadError(json.warning)
      } else {
        setUploadError(json.error ?? "Erro ao processar arquivo")
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setParsing(false)
    }
  }

  // ── Confirmar importação
  async function handleConfirmar() {
    if (!uploadFile || !parseResult) return
    setImporting(true)
    setUploadError(null)

    const form = new FormData()
    form.append("arquivo",    uploadFile)
    form.append("unidade",    metaOverride.unidade)
    form.append("tipo_lista", metaOverride.tipo_lista)
    form.append("data_lista", metaOverride.data_lista)
    form.append("confirmar",  "true")

    try {
      const res = await fetch("/api/listas/upload", { method: "POST", body: form })
      const json = await res.json()

      if (!res.ok) {
        setUploadError(json.mensagem ?? json.error ?? "Erro ao importar")
        return
      }

      setImportOk({ lista_id: json.lista_id, total: json.total_leads })
      loadListas()
      loadHigienizacaoCount()
      setParseResult(null)
      setUploadFile(null)
      setDuplicataSummary(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setImporting(false)
    }
  }

  const metaNeedsInput = parseResult && (!parseResult.meta.unidade || !parseResult.meta.tipo_lista || !parseResult.meta.data_lista)

  const missingFields: string[] = [
    metaOverride.unidade.trim()    === "" && "Unidade",
    metaOverride.tipo_lista.trim() === "" && "Tipo de Lista",
    metaOverride.data_lista        === "" && "Data da Lista",
  ].filter((f): f is string => typeof f === "string")

  const canConfirm = missingFields.length === 0

  function resetUpload() {
    setParseResult(null)
    setUploadFile(null)
    setUploadError(null)
    setMetaOverride({ unidade: "", tipo_lista: "", data_lista: "" })
    setDuplicataSummary(null)
    setSugestoesExpanded(false)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Image src="/logo-creditum.png" alt="Creditum" height={24} width={68} priority className="object-contain" />
          <span className="text-gray-200 select-none">|</span>
          <span className="text-sm font-medium text-gray-500">Inteligência de Listas</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <Link href="/cockpit" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> Cockpit
          </Link>
          <Link href="/relatorios" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> Relatórios
          </Link>
          <Link href="/analise" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <Microscope className="w-3.5 h-3.5" /> Análise
          </Link>
          <span className="text-gray-300">·</span>
          <span className="tabular-nums text-[11px]">
            {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
          </span>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 max-w-6xl mx-auto w-full">

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-gray-100 pb-0">
          <button
            onClick={() => setActiveTab("listas")}
            className={cn(
              "text-xs font-medium px-4 py-2 border-b-2 transition-colors -mb-px",
              activeTab === "listas"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Listas
          </button>
          <button
            onClick={() => setActiveTab("higienizacao")}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-4 py-2 border-b-2 transition-colors -mb-px",
              activeTab === "higienizacao"
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Higienização
            {higienizacaoCount > 0 && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5 py-px">
                {higienizacaoCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("termometro")}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-4 py-2 border-b-2 transition-colors -mb-px",
              activeTab === "termometro"
                ? "border-orange-500 text-orange-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            <Thermometer className="w-3.5 h-3.5" />
            Termômetro
          </button>
          <button
            onClick={() => setActiveTab("recontatos")}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-4 py-2 border-b-2 transition-colors -mb-px",
              activeTab === "recontatos"
                ? "border-blue-500 text-blue-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            Recontatos
          </button>
        </div>

        {activeTab === "higienizacao" && (
          <HigienizacaoTab onResolved={() => setHigienizacaoCount(c => Math.max(0, c - 1))} />
        )}

        {activeTab === "termometro" && <TermometroTab />}

        {activeTab === "recontatos" && <RecontatosTab />}

        {activeTab === "listas" && <>

        {/* ── Seção 1: Upload ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-600">Importar Lista</h2>

          {!uploadFile && !importOk && (
            <UploadZone onFile={handleFile} />
          )}

          {parsing && (
            <div className="flex items-center gap-3 py-6 justify-center text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
              Processando arquivo...
            </div>
          )}

          {uploadError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {uploadError}
              <button className="ml-auto text-xs underline" onClick={() => { setUploadError(null); setUploadFile(null) }}>
                Tentar novamente
              </button>
            </div>
          )}

          {importOk && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {importOk.total} leads importados com sucesso
              <button className="ml-auto text-xs underline" onClick={() => { setImportOk(null); resetUpload() }}>
                Importar outra
              </button>
            </div>
          )}

          {parseResult && !importOk && (
            <>
              {/* Detalhes da lista */}
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Unidade</label>
                  <input
                    value={metaOverride.unidade}
                    onChange={e => setMetaOverride(m => ({ ...m, unidade: e.target.value }))}
                    placeholder="Ex: Bangu"
                    className={cn(
                      "text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1",
                      !metaOverride.unidade ? "border-amber-300 focus:ring-amber-400" : "border-gray-200 focus:ring-emerald-400"
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Tipo de Lista</label>
                  <input
                    value={metaOverride.tipo_lista}
                    onChange={e => setMetaOverride(m => ({ ...m, tipo_lista: e.target.value.toUpperCase() }))}
                    placeholder="Ex: LFI"
                    className={cn(
                      "text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1",
                      !metaOverride.tipo_lista ? "border-amber-300 focus:ring-amber-400" : "border-gray-200 focus:ring-emerald-400"
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Data da Lista</label>
                  <input
                    type="date"
                    value={metaOverride.data_lista}
                    onChange={e => setMetaOverride(m => ({ ...m, data_lista: e.target.value }))}
                    className={cn(
                      "text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1",
                      !metaOverride.data_lista ? "border-amber-300 focus:ring-amber-400" : "border-gray-200 focus:ring-emerald-400"
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Formato detectado</label>
                  <span className="text-sm font-mono text-gray-600 px-2.5 py-1.5 bg-gray-50 rounded-md border border-gray-100">
                    Formato {parseResult.meta.formato} · {parseResult.meta.total} leads
                  </span>
                </div>
              </div>

              {metaNeedsInput && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Nome do arquivo não segue a convenção Unidade-TipoLista-DD/MM.xlsx. Preencha os campos acima.
                </div>
              )}

              {/* Preview */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Preview — primeiros {parseResult.leads.length} leads</p>
                <PreviewTable leads={parseResult.leads} />
              </div>

              {/* ── Resumo de importação ── */}
              {duplicataSummary && (
                <div className="flex flex-col gap-2">

                  {/* Leads novos */}
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <strong>{duplicataSummary.novos_leads} lead{duplicataSummary.novos_leads !== 1 ? "s" : ""} novo{duplicataSummary.novos_leads !== 1 ? "s" : ""}</strong>
                    &nbsp;serão importados
                  </div>

                  {/* Duplicatas mesma planilha */}
                  {duplicataSummary.duplicatas_mesma_lista > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <span className="shrink-0 font-mono text-gray-300">↩</span>
                      {duplicataSummary.duplicatas_mesma_lista} duplicata{duplicataSummary.duplicatas_mesma_lista !== 1 ? "s" : ""} no mesmo arquivo — ignorada{duplicataSummary.duplicatas_mesma_lista !== 1 ? "s" : ""}
                    </div>
                  )}

                  {/* Já existem no banco */}
                  {duplicataSummary.duplicatas_ignoradas > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <span className="shrink-0 font-mono text-gray-400">🚫</span>
                      <strong>{duplicataSummary.duplicatas_ignoradas} lead{duplicataSummary.duplicatas_ignoradas !== 1 ? "s" : ""}</strong>
                      &nbsp;já exist{duplicataSummary.duplicatas_ignoradas !== 1 ? "em" : "e"} no banco — não serão importados
                    </div>
                  )}

                  {/* Sugestões de atualização (Caso 3) */}
                  {duplicataSummary.possiveis_higienizacoes.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setSugestoesExpanded(e => !e)}
                        className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 hover:bg-teal-100 transition-colors"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                        <strong>{duplicataSummary.possiveis_higienizacoes.length} lead{duplicataSummary.possiveis_higienizacoes.length !== 1 ? "s" : ""}</strong>
                        &nbsp;criarão sugestão de atualização de telefone
                        <ChevronRight className={cn("w-3 h-3 ml-auto transition-transform shrink-0", sugestoesExpanded && "rotate-90")} />
                      </button>
                      {sugestoesExpanded && (
                        <div className="overflow-x-auto rounded-lg border border-teal-100 ml-1 max-h-48 overflow-y-auto">
                          <table className="w-full text-[11px]">
                            <thead className="sticky top-0 bg-teal-50">
                              <tr className="text-teal-600">
                                <th className="px-3 py-1.5 text-left">Nome</th>
                                <th className="px-3 py-1.5 text-left">Telefone antigo</th>
                                <th className="px-3 py-1.5 text-left">Telefone novo</th>
                                <th className="px-3 py-1.5 text-left">Lista de origem</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-teal-50">
                              {duplicataSummary.possiveis_higienizacoes.slice(0, 30).map((d, i) => (
                                <tr key={i} className="bg-white">
                                  <td className="px-3 py-1.5 text-gray-700">{d.nome}</td>
                                  <td className="px-3 py-1.5 text-gray-400 tabular-nums font-mono line-through">{d.telefone_antigo || "—"}</td>
                                  <td className="px-3 py-1.5 text-teal-700 tabular-nums font-mono font-semibold">{d.telefone_novo}</td>
                                  <td className="px-3 py-1.5 text-gray-400 max-w-[160px] truncate">{d.lista_origem}</td>
                                </tr>
                              ))}
                              {duplicataSummary.possiveis_higienizacoes.length > 30 && (
                                <tr className="bg-white">
                                  <td colSpan={4} className="px-3 py-1.5 text-gray-400 text-center">
                                    +{duplicataSummary.possiveis_higienizacoes.length - 30} mais...
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Higienização */}
                  {duplicataSummary.leads_higienizacao > 0 && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <PhoneOff className="w-3.5 h-3.5 shrink-0" />
                      <strong>{duplicataSummary.leads_higienizacao} contato{duplicataSummary.leads_higienizacao !== 1 ? "s" : ""}</strong>
                      &nbsp;vão para a fila de Higienização (fixo, sem DDD ou inválido)
                    </div>
                  )}
                </div>
              )}

              {/* ── Botões ── */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <button
                    disabled={!canConfirm || importing}
                    onClick={() => handleConfirmar()}
                    className={cn(
                      "text-sm font-medium px-4 py-2 rounded-lg transition-colors",
                      canConfirm
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    {importing ? "Importando..." : "Confirmar e importar"}
                  </button>
                  <button
                    onClick={resetUpload}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
                {!canConfirm && missingFields.length > 0 && (
                  <p className="text-[11px] text-amber-600">
                    Preencha: {missingFields.join(", ")}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Seção 2: Listas importadas ───────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-600">Listas Importadas</h2>

          {listasLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
              Carregando...
            </div>
          ) : listas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
              <List className="w-8 h-8 text-gray-200" />
              <p className="text-sm">Nenhuma lista importada ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 font-medium">
                    <th className="px-3 py-2.5 text-left">Arquivo</th>
                    <th className="px-3 py-2.5 text-left">Unidade</th>
                    <th className="px-3 py-2.5 text-left">Tipo</th>
                    <th className="px-3 py-2.5 text-left">Data</th>
                    <th className="px-3 py-2.5 text-left">Leads</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-left">Importado em</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {listas.map(l => (
                    <tr
                      key={l.id}
                      className="bg-white hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setSelectedLista(l)}
                    >
                      <td className="px-3 py-2.5 text-gray-700 font-medium max-w-[180px] truncate">{l.nome_arquivo}</td>
                      <td className="px-3 py-2.5 text-gray-600">{l.unidade}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{l.tipo_lista}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 tabular-nums">{fmtDate(l.data_lista)}</td>
                      <td className="px-3 py-2.5 text-gray-700 tabular-nums font-medium">{l.total_leads}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "text-[10px] font-medium rounded-full px-2 py-0.5",
                          l.status === "ativa"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        )}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 tabular-nums">
                        {new Date(l.uploaded_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </>}
      </div>

      {/* Painel lateral de leads */}
      {selectedLista && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
            onClick={() => setSelectedLista(null)}
          />
          <LeadsPanel lista={selectedLista} onClose={() => setSelectedLista(null)} />
        </>
      )}
    </div>
  )
}
