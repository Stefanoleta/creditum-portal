"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { BarChart3, Microscope, List, Upload, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, PhoneOff, Check } from "lucide-react"
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
  lista_id: string
  listas: { id: string; unidade: string; tipo_lista: string; nome_arquivo: string } | null
}

const MOTIVO_LABEL: Record<string, string> = {
  telefone_fixo:              "Telefone fixo",
  sem_ddd:                    "Sem DDD",
  numero_incompleto:          "Número incompleto",
  formato_invalido:           "Formato inválido",
  numero_inexistente_discador:"Inexistente (Argus)",
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

// Sugestão de recontato: hoje + (parcelas_totais - 19) * 30 dias
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

  // Auto-regras quando parcelas_totais muda
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
        {/* Parcelas totais */}
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
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
        <div>
          <div className="text-sm font-semibold text-gray-800">{lista.unidade} — {lista.tipo_lista}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{lista.nome_arquivo} · {total} leads · {fmtDate(lista.data_lista)}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Banner recontato próximo */}
      {proximos.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span><strong>{proximos.length} lead{proximos.length > 1 ? "s" : ""}</strong> com recontato nos próximos 7 dias</span>
        </div>
      )}

      {/* Tabela */}
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

      {/* Paginação */}
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
  const [leads, setLeads] = useState<LeadHigienizacao[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const LIMIT = 50

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/leads/higienizacao?page=${page}&limit=${LIMIT}`)
      .then(r => r.json())
      .then(d => { setLeads(d.leads ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  async function resolve(lead_id: string, telefone_corrigido: string | null) {
    setSaving(s => ({ ...s, [lead_id]: true }))
    await fetch("/api/leads/higienizacao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id, telefone_corrigido }),
    })
    setLeads(prev => prev.filter(l => l.id !== lead_id))
    setTotal(t => t - 1)
    setSaving(s => ({ ...s, [lead_id]: false }))
    onResolved()
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-600">Higienização de Contatos</h2>
        {total > 0 && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
            {total} pendente{total > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-8 justify-center text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
          Carregando...
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <Check className="w-8 h-8 text-emerald-200" />
          <p className="text-sm">Todos os contatos estão higienizados</p>
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
                {leads.map(l => (
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

          {total > LIMIT && (
            <div className="flex items-center justify-between pt-1">
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
        </>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ListasPage() {
  // ── Tab
  const [activeTab, setActiveTab] = useState<"listas" | "higienizacao">("listas")
  const [higienizacaoCount, setHigienizacaoCount] = useState(0)

  // ── Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<{ meta: ListaMeta; leads: LeadInput[] } | null>(null)
  const [totalHigienizacao, setTotalHigienizacao] = useState(0)
  const [metaOverride, setMetaOverride] = useState({ unidade: "", tipo_lista: "", data_lista: "" })
  const [importing, setImporting] = useState(false)
  const [importOk, setImportOk] = useState<{ lista_id: string; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

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

  // ── Carregar contagem global de higienização
  const loadHigienizacaoCount = useCallback(() => {
    fetch("/api/leads/higienizacao?limit=1")
      .then(r => r.json())
      .then(d => setHigienizacaoCount(d.total ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => { loadHigienizacaoCount() }, [loadHigienizacaoCount])

  // ── Parsear arquivo no cliente via API de parse-only (sem salvar)
  async function handleFile(f: File) {
    setUploadFile(f)
    setImportOk(null)
    setUploadError(null)
    setParseResult(null)
    setTotalHigienizacao(0)
    setParsing(true)

    const form = new FormData()
    form.append("arquivo", f)

    try {
      const res = await fetch("/api/listas/upload", { method: "POST", body: form })
      const json = await res.json()

      if (!res.ok) {
        // 422 = meta incompleta mas com preview
        if (res.status === 422 && json.preview) {
          setParseResult({ meta: json.meta, leads: json.preview })
          setTotalHigienizacao(json.total_higienizacao ?? 0)
          setMetaOverride({
            unidade:    json.meta.unidade    ?? "",
            tipo_lista: json.meta.tipo_lista ?? "",
            data_lista: json.meta.data_lista ?? "",
          })
        } else {
          setUploadError(json.error ?? "Erro ao processar arquivo")
        }
        return
      }

      // warning = supabase não configurado, mas temos preview
      if (json.warning) {
        setParseResult({ meta: json.meta, leads: json.preview })
        setTotalHigienizacao(json.total_higienizacao ?? 0)
        setMetaOverride({
          unidade:    json.meta.unidade    ?? "",
          tipo_lista: json.meta.tipo_lista ?? "",
          data_lista: json.meta.data_lista ?? "",
        })
        if (json.lista_id) {
          setImportOk({ lista_id: json.lista_id, total: json.total_leads })
          loadListas()
          loadHigienizacaoCount()
        }
        return
      }

      // Sucesso completo
      setParseResult({ meta: json.meta, leads: json.preview })
      setTotalHigienizacao(json.total_higienizacao ?? 0)
      setMetaOverride({
        unidade:    json.meta.unidade    ?? "",
        tipo_lista: json.meta.tipo_lista ?? "",
        data_lista: json.meta.data_lista ?? "",
      })
      setImportOk({ lista_id: json.lista_id, total: json.total_leads })
      loadListas()
      loadHigienizacaoCount()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setParsing(false)
    }
  }

  // ── Confirmar importação quando meta estava incompleta
  async function handleConfirmar() {
    if (!uploadFile || !parseResult) return
    setImporting(true)
    setUploadError(null)

    const form = new FormData()
    form.append("arquivo", uploadFile)
    form.append("unidade",    metaOverride.unidade)
    form.append("tipo_lista", metaOverride.tipo_lista)
    form.append("data_lista", metaOverride.data_lista)

    try {
      const res = await fetch("/api/listas/upload", { method: "POST", body: form })
      const json = await res.json()

      if (!res.ok) {
        setUploadError(json.error ?? "Erro ao importar")
        return
      }

      setImportOk({ lista_id: json.lista_id, total: json.total_leads })
      loadListas()
      loadHigienizacaoCount()
      setParseResult(null)
      setUploadFile(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setImporting(false)
    }
  }

  const metaNeedsInput = parseResult && (!parseResult.meta.unidade || !parseResult.meta.tipo_lista || !parseResult.meta.data_lista)

  // Campos faltando — checa metaOverride atual, independente do nome do arquivo
  const missingFields: string[] = [
    metaOverride.unidade.trim()    === "" && "Unidade",
    metaOverride.tipo_lista.trim() === "" && "Tipo de Lista",
    metaOverride.data_lista        === "" && "Data da Lista",
  ].filter((f): f is string => typeof f === "string")

  const canConfirm = missingFields.length === 0

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
        </div>

        {activeTab === "higienizacao" && (
          <HigienizacaoTab onResolved={() => setHigienizacaoCount(c => Math.max(0, c - 1))} />
        )}

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
              <button className="ml-auto text-xs underline" onClick={() => { setImportOk(null); setUploadFile(null); setParseResult(null); setMetaOverride({ unidade: "", tipo_lista: "", data_lista: "" }) }}>
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

              {totalHigienizacao > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <PhoneOff className="w-3.5 h-3.5 shrink-0" />
                  <strong>{totalHigienizacao} contato{totalHigienizacao > 1 ? "s" : ""}</strong>&nbsp;precisam de higienização (telefone fixo, sem DDD ou formato inválido).
                </div>
              )}

              {/* Preview */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Preview — primeiros {parseResult.leads.length} leads</p>
                <PreviewTable leads={parseResult.leads} />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <button
                    disabled={!canConfirm || importing}
                    onClick={handleConfirmar}
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
                    onClick={() => { setParseResult(null); setUploadFile(null); setUploadError(null); setMetaOverride({ unidade: "", tipo_lista: "", data_lista: "" }) }}
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

        {/* ── Seção 2: Listas importadas (aba Listas) ──────────────────────── */}
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
