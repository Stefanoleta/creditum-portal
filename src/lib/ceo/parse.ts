// Parsing determinístico de dados brutos de fonte externa.
//
// REGRA: nada aqui adivinha. Toda função devolve `null` quando não consegue
// interpretar com segurança — nunca zero, nunca string vazia, nunca um chute.
// Quem chama decide o que fazer com o `null` (DATA_NOT_AVAILABLE).
//
// Nenhuma dependência externa: este módulo é puro e 100% testável.

// ─── Dinheiro ─────────────────────────────────────────────────────────────────
//
// Valores financeiros são SEMPRE inteiros em centavos. Nunca float.
//
// Por quê: `ticket = repasse × parcelas` precisa bater exatamente com a
// planilha. Em centavos, R$ 421,76 × 17 = 42176 × 17 = 716992 = R$ 7.169,92 —
// exato. Em float, 421.76 * 17 = 7169.919999999999 e o ticket do vendedor passa
// a divergir da fonte por arredondamento invisível.
//
// Formatos observados na fonte real:
//   "R$ 578,70"    → 57870   (padrão BR)
//   "R$410,00"     → 41000   (sem espaço após R$)
//   "607,13"       → 60713   (sem símbolo)
//   "578.7"        → 57870   (ponto decimal — vem de export/CSV)
//   "R$ 8.151,60"  → 815160  (ponto como separador de milhar)
//   "R$ 0,00"      → 0       (zero explícito é dado, não ausência)
//   ""             → null    (ausência)

export function parseBRLToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null

  // Número puro já vem em reais (ex. célula numérica do Sheets)
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null
    return Math.round(raw * 100)
  }

  let s = String(raw).trim()
  if (!s) return null

  const negative = /^-|^\(.*\)$/.test(s)
  s = s.replace(/[R$\s()]/gi, "").replace(/^-/, "")
  if (!s) return null

  // Só pode sobrar dígito, ponto e vírgula
  if (!/^[\d.,]+$/.test(s)) return null

  const cents = toCents(s)
  if (cents === null) return null
  return negative ? -cents : cents
}

// Resolve a ambiguidade de separador decimal vs. milhar.
//
//   tem "," → a última "," é o decimal; todo "." é milhar
//   só "."  → se o grupo após o último "." tiver exatamente 3 dígitos, todo "."
//             é milhar ("1.234" = 1234); senão o último "." é decimal
//             ("578.7" = 578,70)
function toCents(s: string): number | null {
  const hasComma = s.includes(",")
  const hasDot = s.includes(".")

  let intPart: string
  let fracPart: string

  if (hasComma) {
    const lastComma = s.lastIndexOf(",")
    intPart = s.slice(0, lastComma).replace(/[.,]/g, "")
    fracPart = s.slice(lastComma + 1).replace(/[.,]/g, "")
  } else if (hasDot) {
    const lastDot = s.lastIndexOf(".")
    const tail = s.slice(lastDot + 1)
    if (tail.length === 3) {
      // separador de milhar em todos os pontos
      intPart = s.replace(/\./g, "")
      fracPart = ""
    } else {
      intPart = s.slice(0, lastDot).replace(/\./g, "")
      fracPart = tail
    }
  } else {
    intPart = s
    fracPart = ""
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null
  if (intPart === "" && fracPart === "") return null

  // Mais de 2 casas decimais não é dinheiro — não arredondo em silêncio
  if (fracPart.length > 2) return null

  const reais = intPart === "" ? 0 : Number(intPart)
  const centavos = fracPart === "" ? 0 : Number(fracPart.padEnd(2, "0"))
  if (!Number.isSafeInteger(reais)) return null

  return reais * 100 + centavos
}

export function formatCentsBRL(cents: number | null): string | null {
  if (cents === null) return null
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const reais = Math.floor(abs / 100)
  const centavos = String(abs % 100).padStart(2, "0")
  return `${sign}R$ ${reais.toLocaleString("pt-BR")},${centavos}`
}

// ─── Percentual ───────────────────────────────────────────────────────────────
//
// Guardado em basis points inteiros: 2500 = 25%. Mesma razão do dinheiro —
// exatidão. Observados na fonte: "20%", "29%", "11%", "10%".

export function parsePercentToBps(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null

  // Célula NUMÉRICA formatada como porcentagem: o Sheets devolve 0.25 para 25%.
  // Aqui a fração é a representação real da API, não um chute.
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null
    const asPercent = raw > 0 && raw <= 1 ? raw * 100 : raw
    return Math.round(asPercent * 100)
  }

  const s = String(raw).trim()
  if (!s) return null

  const hadSymbol = s.includes("%")
  const body = s.replace(/%/g, "").trim()
  if (!body) return null
  if (!/^-?[\d.,]+$/.test(body)) return null

  const negative = body.startsWith("-")
  const bps = toCents(body.replace(/^-/, ""))
  if (bps === null) return null

  // TEXTO é diferente de número: "0,25" escrito à mão pode ser 25% (fração) ou
  // 0,25% (percentual pequeno). Sem o símbolo "%" não há como saber, e adivinhar
  // aqui produziria um número errado com cara de certo. Devolvo null → o campo
  // vira DATA_NOT_AVAILABLE e aparece no auditor.
  if (!hadSymbol && bps > 0 && bps < 100) return null

  return negative ? -bps : bps
}

export function formatBpsPercent(bps: number | null): string | null {
  if (bps === null) return null
  const whole = Math.floor(Math.abs(bps) / 100)
  const frac = Math.abs(bps) % 100
  const sign = bps < 0 ? "-" : ""
  return frac === 0
    ? `${sign}${whole}%`
    : `${sign}${whole},${String(frac).padStart(2, "0")}%`
}

// ─── Inteiro ──────────────────────────────────────────────────────────────────
//
// Contagens (parcelas em aberto, a vencer, total). Zero é dado válido.

export function parseCount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? raw : null
  }
  const s = String(raw).trim()
  if (!s) return null
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

// ─── Data ─────────────────────────────────────────────────────────────────────
//
// Fonte usa dd/MM/yyyy. Devolve ISO date (yyyy-MM-dd) — sem hora, sem timezone,
// porque a fonte não tem hora e inventar 00:00 UTC desloca o dia no Brasil.

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)

export function parseDateISO(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null

  // Serial do Excel/Sheets
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null
    const ms = EXCEL_EPOCH_UTC + Math.floor(raw) * 86_400_000
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }

  const s = String(raw).trim()
  if (!s) return null

  // dd/MM/yyyy  ou  d/M/yyyy  ou  dd-MM-yyyy
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (br) {
    const [, d, m, y] = br
    return buildISO(Number(y), Number(m), Number(d))
  }

  // dd/MM/yy → assume século 2000
  const br2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (br2) {
    const [, d, m, y] = br2
    return buildISO(2000 + Number(y), Number(m), Number(d))
  }

  // ISO já pronto (aceita sufixo de hora, descarta)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, y, m, d] = iso
    return buildISO(Number(y), Number(m), Number(d))
  }

  return null
}

// Valida o calendário de verdade: 31/02/2026 é inválido, não 03/03.
function buildISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

// ─── Texto ────────────────────────────────────────────────────────────────────

export function parseText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  // Escapes explícitos, nunca o caractere literal: zero-width é invisível no
  // editor e um `git diff` inocente pode apagá-lo sem ninguém notar.
  const s = String(raw)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "") // zero-width space / joiner / BOM
    .replace(/\u00A0/g, " ") // NBSP — o Sheets produz ao colar
    .replace(/\s+/g, " ") // "Sheila  Lotito" → "Sheila Lotito"
    .trim()
  return s || null
}

// Chave de comparação: sem acento, minúsculo, sem espaço redundante.
// Usada para alias de unidade/vendedor e para hash de conteúdo de linha.
export function toComparableKey(raw: unknown): string | null {
  const s = parseText(raw)
  if (!s) return null
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
}

// ─── CPF ──────────────────────────────────────────────────────────────────────
//
// O Google Sheets trata CPF como número e come o zero à esquerda:
// "02175980723" chega como "2175980723" (10 dígitos).
//
// Não basta preencher com zero e seguir. Este módulo preenche E confere os
// dígitos verificadores. Se o CPF resultante é matematicamente válido, a
// recuperação é confiável; se não, o registro fica marcado e nunca vira sinal
// forte de deduplicação.
//
// Verificado na fonte real: os 3 CPFs de 10 dígitos da aba financeira se tornam
// CPFs válidos com um zero à esquerda. A aritmética confirma a hipótese.
//
// LGPD: este módulo NÃO persiste CPF. Ele normaliza para que `hashCpf` possa
// gerar o HMAC. O dígito nunca vai para banco nem para log.

export interface CpfResult {
  /** 11 dígitos quando confiável; null quando não recuperável */
  digits: string | null
  /** dígitos verificadores conferem */
  valid: boolean
  /** precisou recuperar zero(s) à esquerda */
  recovered: boolean
}

const CPF_INVALID: CpfResult = { digits: null, valid: false, recovered: false }

export function parseCpf(raw: unknown): CpfResult {
  if (raw === null || raw === undefined) return CPF_INVALID
  const digits = String(raw).replace(/\D/g, "")
  if (!digits) return CPF_INVALID

  if (digits.length === 11) {
    return { digits, valid: isValidCpf(digits), recovered: false }
  }

  // 8–10 dígitos: possível perda de zero à esquerda pelo Sheets.
  // Só aceito se o padding produzir um CPF válido — senão não é recuperação,
  // é invenção.
  if (digits.length >= 8 && digits.length < 11) {
    const padded = digits.padStart(11, "0")
    if (isValidCpf(padded)) {
      return { digits: padded, valid: true, recovered: true }
    }
    return { digits: null, valid: false, recovered: false }
  }

  return CPF_INVALID
}

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  // Sequências repetidas passam o mod-11 mas não são CPF
  if (/^(\d)\1{10}$/.test(digits)) return false

  for (const [len, pos] of [[9, 9], [10, 10]] as const) {
    let sum = 0
    for (let i = 0; i < len; i++) {
      sum += Number(digits[i]) * (len + 1 - i)
    }
    const rest = (sum * 10) % 11
    const expected = rest >= 10 ? 0 : rest
    if (Number(digits[pos]) !== expected) return false
  }
  return true
}
