import * as XLSX from "xlsx"
import { hashCpf } from "./cpf-hash"

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
  cpf_hash: string | null   // CPF nunca em texto — apenas HMAC-SHA256
  turma: string | null
  situacao: string | null
  descricao: string | null
  pendencia_financeira: string | null
  faltas_consecutivas: number | null
  data_vencimento: string | null  // ISO date
  precisa_higienizacao: boolean
  motivo_higienizacao: string | null
  // 'telefone_fixo' | 'sem_ddd' | 'numero_incompleto' | 'formato_invalido'
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
//
// Algoritmo:
//   1. Remove zeros à esquerda (strip leading zeros) — "0021..." → "21..."
//   2. Se sobrar 12-13 dígitos começando com "55" → DDI Brasil → remove "55"
//      12 = DDI(2) + DDD(2) + fixo(8) | 13 = DDI(2) + DDD(2) + celular(9)
//   3. 10-11 dígitos → válido (DDD + número)
//      8-9 dígitos   → sem DDD, mantém como está para revisão manual
//      outro         → mantém como está (malformado)
//
// Casos validados:
//   "0021993758014"  → strip zeros → "21993758014"  (11d) → válido      ✓
//   "021997224128"   → strip zeros → "21997224128"  (11d) → válido      ✓
//   "0055219963355"  → strip zeros → "55219963355"  (11d) → válido      ✓
//   "005521996335500"→ strip zeros → "5521996335500"(13d) → strip 55
//                                 → "21996335500"   (11d) → válido      ✓
//   "993758014"      → sem zeros   → "993758014"    (9d)  → sem DDD     ⚠️
//   "21993758014"    → sem zeros   → "21993758014"  (11d) → válido      ✓

function normalizePhone(raw: string | number | null | undefined): string | null {
  if (raw == null) return null
  let digits = String(raw).replace(/\D/g, "")
  if (!digits) return null

  // 1. Zeros à esquerda
  digits = digits.replace(/^0+/, "")
  if (!digits) return null

  // 2. DDI Brasil: "55" + DDD(2) + número(8 ou 9) = 12 ou 13 dígitos
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2)
  }

  // 3. Retorna como está — 10-11 válido, 8-9 sem DDD (para revisão), resto malformado
  return digits || null
}

// Classifica se o telefone normalizado precisa de higienização manual
// Regras:
//   null / < 8d         → formato_invalido / numero_incompleto
//   8–9d                → sem_ddd
//   10–11d, digits[2] !== "9" → telefone_fixo (ex: (21) 3xxx-xxxx)
//   11d, digits[2] === "9"   → válido
//   10d, digits[2] === "9"   → válido (formato antigo)
//   > 11d               → formato_invalido
function classifyPhone(digits: string | null): {
  precisa_higienizacao: boolean
  motivo_higienizacao: string | null
} {
  if (!digits) return { precisa_higienizacao: true, motivo_higienizacao: "formato_invalido" }
  if (digits.length < 8) return { precisa_higienizacao: true, motivo_higienizacao: "numero_incompleto" }
  if (digits.length <= 9) return { precisa_higienizacao: true, motivo_higienizacao: "sem_ddd" }
  if (digits.length > 11)  return { precisa_higienizacao: true, motivo_higienizacao: "formato_invalido" }
  // 10 ou 11 dígitos: se o 3º dígito não for "9" → fixo
  if (digits[2] !== "9") return { precisa_higienizacao: true, motivo_higienizacao: "telefone_fixo" }
  return { precisa_higienizacao: false, motivo_higienizacao: null }
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
  const tel = normalizePhone(findCol(row, "celular", "cel"))
  const { precisa_higienizacao, motivo_higienizacao } = classifyPhone(tel)
  // CPF: aplicar hash imediatamente — nunca salvar texto puro (LGPD)
  const cpfRaw = str(findCol(row, "cpf"))
  const cpf_hash = cpfRaw ? hashCpf(cpfRaw) : null
  return {
    nome:                str(findCol(row, "nome")) ?? "(sem nome)",
    telefone_principal:  tel,
    telefone_secundario: normalizePhone(findCol(row, "telefone 1", "telefone1", "fone")),
    matricula:           str(findCol(row, "matricula", "matrícula")),
    cpf_hash,
    turma:               str(findCol(row, "turma")),
    situacao:            str(findCol(row, "situação", "situacao")),
    descricao:           null,
    pendencia_financeira: null,
    faltas_consecutivas: null,
    data_vencimento:     dateStr(findCol(row, "data")),
    precisa_higienizacao,
    motivo_higienizacao,
  }
}

function extractFormatoB(row: Row): LeadInput {
  const tel = normalizePhone(findCol(row, "fone cel", "celular", "telefone", "fone"))
  const { precisa_higienizacao, motivo_higienizacao } = classifyPhone(tel)
  return {
    nome:                str(findCol(row, "nome")) ?? "(sem nome)",
    telefone_principal:  tel,
    telefone_secundario: null,
    matricula:           str(findCol(row, "pré-matrícula", "pre-matricula", "prematricula")),
    cpf_hash:            null,
    turma:               null,
    situacao:            str(findCol(row, "situação", "situacao")),
    descricao:           str(findCol(row, "descrição", "descricao")),
    pendencia_financeira: str(findCol(row, "pend. financ", "pendencia financ", "financ")),
    faltas_consecutivas: int(findCol(row, "faltas consecutivas", "faltas")),
    data_vencimento:     null,
    precisa_higienizacao,
    motivo_higienizacao,
  }
}

function extractFormatoC(row: Row): LeadInput {
  const tel = normalizePhone(findCol(row, "telefone", "fone", "celular"))
  const { precisa_higienizacao, motivo_higienizacao } = classifyPhone(tel)
  return {
    nome:                str(findCol(row, "nome")) ?? "(sem nome)",
    telefone_principal:  tel,
    telefone_secundario: null,
    matricula:           null,
    cpf_hash:            null,
    turma:               null,
    situacao:            null,
    descricao:           null,
    pendencia_financeira: null,
    faltas_consecutivas: null,
    data_vencimento:     null,
    precisa_higienizacao,
    motivo_higienizacao,
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
