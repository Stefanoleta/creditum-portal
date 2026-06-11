import * as XLSX from "xlsx"

// ─── Types ────────────────────────────────────────────────────────────────────

export type Formato = "A" | "B" | "C"

export interface ListaMeta {
  nome_arquivo: string
  unidade: string | null       // null quando não detectado no nome do arquivo
  tipo_lista: string | null    // null quando não detectado no nome do arquivo
  data_lista: string | null    // ISO date string, null quando não detectado
  formato: Formato
  total: number
}

export interface LeadInput {
  nome: string
  telefone_principal: string | null
  telefone_secundario: string | null
  matricula: string | null
  cpf: string | null
  turma: string | null
  situacao: string | null
  descricao: string | null
  pendencia_financeira: string | null
  faltas_consecutivas: number | null
  data_vencimento: string | null  // ISO date
}

export interface ParseResult {
  meta: ListaMeta
  leads: LeadInput[]
}

// ─── Filename parser ──────────────────────────────────────────────────────────

// Convenção: Unidade-TipoLista-DD/MM.xlsx  ou  Unidade-TipoLista-DD/MM (qualquer ext)
// Exemplos: Bangu-LFI-10/06.xlsx, LFI_GRAU_T_MADUREIRA_.xlsx (formato livre → null)
export function parseFilename(filename: string): {
  unidade: string | null
  tipo_lista: string | null
  data_lista: string | null
} {
  const base = filename.replace(/\.[^.]+$/, "") // remove extensão

  // Tenta Unidade-TipoLista-DD/MM
  const match = base.match(/^([^-]+)-([^-]+)-(\d{1,2})\/(\d{1,2})$/)
  if (match) {
    const [, unidade, tipo_lista, day, month] = match
    const year = new Date().getFullYear()
    const date = new Date(year, parseInt(month) - 1, parseInt(day))
    // Se a data já passou de 60 dias, provavelmente é do ano seguinte
    const today = new Date()
    if (date.getTime() - today.getTime() > 60 * 24 * 3600 * 1000) {
      date.setFullYear(year - 1)
    }
    const iso = date.toISOString().split("T")[0]
    return {
      unidade: unidade.trim(),
      tipo_lista: tipo_lista.trim().toUpperCase(),
      data_lista: iso,
    }
  }

  return { unidade: null, tipo_lista: null, data_lista: null }
}

// ─── Phone normalizer ─────────────────────────────────────────────────────────

// Remove prefixos internacionais e caracteres não numéricos
// Mantém DDD + número (10 ou 11 dígitos)
function normalizePhone(raw: string | number | null | undefined): string | null {
  if (raw == null) return null
  let digits = String(raw).replace(/\D/g, "")
  if (!digits) return null

  // Remove 0021 / 0055 (discagem internacional) ou 00 + 55
  if (digits.startsWith("0021")) digits = digits.slice(4)
  else if (digits.startsWith("0055")) digits = digits.slice(4)
  else if (digits.startsWith("55") && digits.length > 12) digits = digits.slice(2)
  else if (digits.startsWith("0")) digits = digits.slice(1)

  // Aceita 10 ou 11 dígitos (DDD 2 + número 8 ou 9)
  if (digits.length < 10 || digits.length > 11) return digits || null
  return digits
}

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function str(val: unknown): string | null {
  if (val == null || val === "") return null
  return String(val).trim() || null
}

function int(val: unknown): number | null {
  if (val == null || val === "") return null
  const n = parseInt(String(val), 10)
  return isNaN(n) ? null : n
}

// Converte data serial do Excel ou string para ISO date
function dateStr(val: unknown): string | null {
  if (val == null || val === "") return null
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val)
    if (!d) return null
    const mm = String(d.m).padStart(2, "0")
    const dd = String(d.d).padStart(2, "0")
    return `${d.y}-${mm}-${dd}`
  }
  const s = String(val).trim()
  // Tenta DD/MM/YYYY ou YYYY-MM-DD
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
  if (iso) return s.slice(0, 10)
  return null
}

// ─── Format detection ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function detectFormato(headers: string[]): Formato {
  const h = headers.map(s => s.toLowerCase().trim())
  const has = (sub: string) => h.some(c => c.includes(sub))

  if (has("matricula") || has("cpf")) return "A"
  if (has("pend") || has("faltas") || has("descri")) return "B"
  return "C"
}

// ─── Format-specific extractors ───────────────────────────────────────────────

function findCol(row: Row, ...candidates: string[]): string | number | null | undefined {
  for (const c of candidates) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().includes(c.toLowerCase())) {
        const v = row[key]
        if (v === null || v === undefined || typeof v === "string" || typeof v === "number") return v
        return String(v)
      }
    }
  }
  return undefined
}

function extractFormatoA(row: Row): LeadInput {
  return {
    nome:                str(findCol(row, "nome")) ?? "(sem nome)",
    telefone_principal:  normalizePhone(findCol(row, "celular", "cel")),
    telefone_secundario: normalizePhone(findCol(row, "telefone 1", "telefone1", "fone")),
    matricula:           str(findCol(row, "matricula", "matrícula")),
    cpf:                 str(findCol(row, "cpf")),
    turma:               str(findCol(row, "turma")),
    situacao:            str(findCol(row, "situação", "situacao")),
    descricao:           null,
    pendencia_financeira: null,
    faltas_consecutivas: null,
    data_vencimento:     dateStr(findCol(row, "data")),
  }
}

function extractFormatoB(row: Row): LeadInput {
  return {
    nome:                str(findCol(row, "nome")) ?? "(sem nome)",
    telefone_principal:  normalizePhone(findCol(row, "fone cel", "celular", "telefone", "fone")),
    telefone_secundario: null,
    matricula:           str(findCol(row, "pré-matrícula", "pre-matricula", "prematricula")),
    cpf:                 null,
    turma:               null,
    situacao:            str(findCol(row, "situação", "situacao")),
    descricao:           str(findCol(row, "descrição", "descricao")),
    pendencia_financeira: str(findCol(row, "pend. financ", "pendencia financ", "financ")),
    faltas_consecutivas: int(findCol(row, "faltas consecutivas", "faltas")),
    data_vencimento:     null,
  }
}

function extractFormatoC(row: Row): LeadInput {
  return {
    nome:                str(findCol(row, "nome")) ?? "(sem nome)",
    telefone_principal:  normalizePhone(findCol(row, "telefone", "fone", "celular")),
    telefone_secundario: null,
    matricula:           null,
    cpf:                 null,
    turma:               null,
    situacao:            null,
    descricao:           null,
    pendencia_financeira: null,
    faltas_consecutivas: null,
    data_vencimento:     null,
  }
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseLista(buffer: Buffer, filename: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: null })

  if (rows.length === 0) {
    const fileMeta = parseFilename(filename)
    return {
      meta: {
        nome_arquivo: filename,
        ...fileMeta,
        formato: "C",
        total: 0,
      },
      leads: [],
    }
  }

  const headers = Object.keys(rows[0])
  const formato = detectFormato(headers)

  const extractors: Record<Formato, (r: Row) => LeadInput> = {
    A: extractFormatoA,
    B: extractFormatoB,
    C: extractFormatoC,
  }

  const leads = rows
    .map(extractors[formato])
    .filter(l => l.nome !== "(sem nome)" || l.telefone_principal)

  const fileMeta = parseFilename(filename)

  return {
    meta: {
      nome_arquivo: filename,
      ...fileMeta,
      formato,
      total: leads.length,
    },
    leads,
  }
}
