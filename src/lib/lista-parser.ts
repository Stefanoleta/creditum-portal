import * as XLSX from "xlsx"
import { hashCpf } from "./cpf-hash"

// ─── Types ────────────────────────────────────────────────────────────────────

export type Formato = "A" | "B" | "C"

export interface ListaMeta {
  nome_arquivo: string
  unidade:    string | null
  tipo_lista: string | null
  segmento:   string | null   // "T" | "P" | null
  data_lista: string | null
  formato:    Formato
  total:      number
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
  observacao?: string | null    // nota automática de duplicata cross-lista (preenchida pelo upload API)
}

export interface ParseResult {
  meta: ListaMeta
  leads: LeadInput[]
}

// ─── Unit name normalization ──────────────────────────────────────────────────

const LOWER_WORDS = new Set(["de", "do", "da", "dos", "das", "e", "em", "a", "o", "para", "com", "por"])

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) =>
      i === 0 || !LOWER_WORDS.has(word)
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word
    )
    .join(" ")
}

// Normalização para lookup: remove acentos, lowercase, remove espaços.
// "São João de Meriti" → "saojoaodomeriti"   "ALECRIM" → "alecrim"
// Garante que variações com/sem acento e com/sem espaço acham o mesmo alias.
function normKey(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
}

// Separa palavras coladas com CamelCase: "DuqueDeCaxias" → "Duque De Caxias"
function splitCamelCase(s: string): string {
  return s.replace(/([a-zà-ü])([A-ZÀ-Ü])/g, "$1 $2")
}

// Alias map — chave = normKey do nome/apelido, valor = nome canônico com acentos
const UNIDADE_ALIASES: Record<string, string> = {
  // São João de Meriti — normKey("São João de Meriti") = "saojoaodemeriti"
  "meriti":           "São João de Meriti",
  "saojoaodemeriti":  "São João de Meriti",
  // Duque de Caxias
  "duquedecaxias":    "Duque de Caxias",
  // Belford Roxo
  "belfordroxo":      "Belford Roxo",
  // Jardim Angela
  "jardimangela":     "Jardim Angela",
  // Joinville
  "joinville":        "Joinville",
}

// Normaliza nome de unidade:
//  1. Separa CamelCase ("DuqueDeCaxias" → "Duque De Caxias")
//  2. Colapsa espaços e remove bordas
//  3. Lookup no alias map via normKey (strip acentos + lowercase + sem espaços)
//  4. Fallback: title case com preposições PT-BR em minúsculo
// Exportada para reutilização no upload route, filename parser e Termômetro.
export function normalizeUnidade(raw: string | null | undefined): string | null {
  if (!raw) return null
  const split = splitCamelCase(raw.trim())
  const collapsed = split.replace(/\s+/g, " ").trim()
  if (!collapsed) return null
  const key = normKey(collapsed)
  if (key in UNIDADE_ALIASES) return UNIDADE_ALIASES[key]
  return toTitleCase(collapsed)
}

// ─── Filename parser ──────────────────────────────────────────────────────────
//
// Convenção: Unidade-[Segmento]-Tipo-DD-MM.xlsx  (segmento opcional)
// Ex: Alecrim-NF-01-06.xlsx             → segment: null, type: NF
// Ex: Alecrim-T-NF-01-06.xlsx           → segment: T (Técnico), type: NF
// Ex: Carpina-P-LFI-14-05.xlsx          → segment: P (Profissionalizante), type: LFI
// Ex: Jardim Angela-INADIMPLENTE-01-06   → unit: "Jardim Angela", type: INADIMPLENTE
// Tipo ou padrão inválido → todos os campos null.

export const VALID_TIPOS: Record<string, string> = {
  NF:           "Não Formado",
  INADIMPLENTE: "Inadimplente",
  INATIVO:      "Inativo",
  LFR:          "Limpeza de Frequência",
  LFI:          "Limpeza Financeira",
}

export const VALID_SEGMENTOS: Record<string, string> = {
  T: "Técnico",
  P: "Profissionalizante",
}

export function parseFilename(filename: string): {
  unidade:    string | null
  tipo_lista: string | null
  segmento:   string | null
  data_lista: string | null
} {
  const NONE = { unidade: null, tipo_lista: null, segmento: null, data_lista: null }
  const base  = filename.replace(/\.[^.]+$/, "")
  const parts = base.split("-")

  // Mínimo: Unidade, Tipo, DD, MM → 4 parts
  if (parts.length < 4) return NONE

  const ddStr = parts[parts.length - 2]
  const mmStr = parts[parts.length - 1]

  if (!/^\d{1,2}$/.test(ddStr) || !/^\d{1,2}$/.test(mmStr)) return NONE

  const dd = parseInt(ddStr, 10)
  const mm = parseInt(mmStr, 10)
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return NONE

  // Tokens do meio (entre o primeiro e os dois últimos)
  const middle = parts.slice(1, parts.length - 2).map(p => p.trim().toUpperCase())

  let segmento:   string | null = null
  let tipo_lista: string | null = null

  if (middle.length === 1) {
    // Sem segmento: middle[0] deve ser tipo válido
    if (!VALID_TIPOS[middle[0]]) return NONE
    tipo_lista = middle[0]
  } else if (middle.length === 2) {
    // Com segmento: middle[0] = segmento, middle[1] = tipo
    if (!VALID_SEGMENTOS[middle[0]] || !VALID_TIPOS[middle[1]]) return NONE
    segmento   = middle[0]
    tipo_lista = middle[1]
  } else {
    return NONE
  }

  const unidade    = normalizeUnidade(parts[0])
  const year       = new Date().getFullYear()
  const data_lista = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`

  return { unidade, tipo_lista, segmento, data_lista }
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

export function normalizePhone(raw: string | number | null | undefined): string | null {
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
