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

// Envoltório monetário aceito, validado sobre a string INTEIRA.
//
// A versão anterior detectava o negativo ANTES de limpar "R$" e espaços, e
// depois removia o sinal. Resultado: "R$ -100,00" virava +R$ 100,00 — inversão
// de sinal silenciosa num estorno. A mesma limpeza cega aceitava lixo como
// "$100$", furando a promessa de validar a string inteira.
// Grupos numerados, não nomeados: o tsconfig do app mira ES2017 e capture
// groups nomeados exigem ES2018. Mudar o target por causa de um regex seria
// alterar o build de toda a aplicação por conveniência local.
//   1 = parêntese de abertura   2 = sinal antes do R$   3 = sinal depois
//   4 = número                  5 = parêntese de fechamento
const MONEY_WRAPPER = /^(\()?\s*(-)?\s*(?:R\$)?\s*(-)?\s*([\d.,]+)\s*(\))?$/i

export function parseBRLToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null

  // Célula numérica do Sheets. Passa pelas MESMAS guardas do caminho textual —
  // senão a mesma quantia seria aceita como número e recusada como texto.
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null
    const cents = Math.round(raw * 100)
    if (!Number.isSafeInteger(cents)) return null
    if (Math.abs(cents) > CENTS_SANITY_CEILING) return null
    return cents
  }

  const s = String(raw).trim()
  if (!s) return null

  const m = s.match(MONEY_WRAPPER)
  if (!m) return null
  const [, open, sign1, sign2, num, close] = m

  // O grupo do número não é opcional na gramática, mas `RegExpMatchArray` não
  // expressa isso. O narrowing mantém a promessa do módulo — nada adivinhado —
  // sem asserção. Inalcançável em runtime: se casou, o grupo existe.
  if (num === undefined) return null

  // Parênteses precisam abrir E fechar
  if (Boolean(open) !== Boolean(close)) return null
  // Sinal duplicado ("- R$ -100") é entrada corrompida, não valor
  if (sign1 && sign2) return null
  // Parêntese já significa negativo; combinar com "-" é ambíguo
  if (open && (sign1 || sign2)) return null

  const negative = Boolean(open) || Boolean(sign1) || Boolean(sign2)

  const cents = toCents(num)
  if (cents === null) return null
  return negative ? -cents : cents
}

// Teto de sanidade: acima disso o valor não é dinheiro deste negócio, é célula
// corrompida. R$ 10 trilhões — cinco ordens de grandeza acima do FIDC de R$ 90M.
// Não é regra de negócio, é guarda de qualidade de dado.
export const CENTS_SANITY_CEILING = 1_000_000_000_000_000

// GRAMÁTICA, não heurística.
//
// A versão anterior desmontava a string por posição de separador e removia o
// resto. Isso aceitava lixo como valor plausível: "1,2,3" virava R$ 12,30 e
// "12.34,56" virava R$ 1.234,56 — exatamente o tipo de dado inventado que este
// módulo existe para impedir. Uma célula corrompida entrava no ticket e no
// volume contratado sem nunca acionar DATA_NOT_AVAILABLE.
//
// Agora a string inteira precisa casar com uma forma monetária conhecida:
//
//   1234           inteiro puro
//   1234,56        decimal BR (1 ou 2 casas)
//   1.234.567      milhar BR, grupos de exatamente 3
//   1.234.567,89   milhar BR + decimal
//   578.7          decimal com ponto (export/CSV) — 1 ou 2 casas
//
// "1.234" é ambíguo entre milhar e decimal. Resolvido pela regra: exatamente 3
// dígitos após o ponto = milhar. Por isso GROUPED é testado antes de DOT_DEC, e
// DOT_DEC aceita só 1–2 casas — as duas formas não se sobrepõem.

const PLAIN = /^\d+$/
const DEC_COMMA = /^(\d+),(\d{1,2})$/
const GROUPED = /^\d{1,3}(?:\.\d{3})+$/
const GROUPED_DEC = /^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/
const DEC_DOT = /^(\d+)\.(\d{1,2})$/

/**
 * Extrai os dois primeiros grupos de captura com narrowing real.
 *
 * As três gramáticas com grupos (`GROUPED_DEC`, `DEC_COMMA`, `DEC_DOT`) sempre
 * produzem os dois quando casam — mas `RegExpMatchArray` tipa todo índice como
 * possivelmente ausente. Devolver `null` em vez de assertar preserva a regra do
 * módulo: quando não dá para ler com segurança, devolve-se ausência.
 */
function twoGroups(m: RegExpMatchArray): readonly [string, string] | null {
  const a = m[1]
  const b = m[2]
  if (a === undefined || b === undefined) return null
  return [a, b]
}

function toCents(s: string): number | null {
  let intText: string
  let fracText: string

  let m: RegExpMatchArray | null
  if (PLAIN.test(s)) {
    intText = s
    fracText = ""
  } else if ((m = s.match(GROUPED_DEC))) {
    const g = twoGroups(m)
    if (g === null) return null
    intText = g[0].replace(/\./g, "")
    fracText = g[1]
  } else if (GROUPED.test(s)) {
    intText = s.replace(/\./g, "")
    fracText = ""
  } else if ((m = s.match(DEC_COMMA))) {
    const g = twoGroups(m)
    if (g === null) return null
    intText = g[0]
    fracText = g[1]
  } else if ((m = s.match(DEC_DOT))) {
    const g = twoGroups(m)
    if (g === null) return null
    intText = g[0]
    fracText = g[1]
  } else {
    // Não casou com nenhuma forma conhecida. Não tento salvar.
    return null
  }

  const reais = Number(intText)
  const centavos = fracText === "" ? 0 : Number(fracText.padEnd(2, "0"))
  if (!Number.isSafeInteger(reais)) return null

  const cents = reais * 100 + centavos
  // A guarda tem que ser no RESULTADO: `reais` pode ser safe e `reais * 100`
  // não ser.
  if (!Number.isSafeInteger(cents)) return null
  if (cents > CENTS_SANITY_CEILING) return null

  return cents
}

/**
 * Multiplica um valor em centavos por um fator inteiro (ex. ticket = repasse ×
 * parcelas), devolvendo null se o resultado sair da faixa exata.
 *
 * Existe para que nenhum cálculo financeiro produza silenciosamente um número
 * que o JSON já não representa com fidelidade.
 */
export function multiplyCents(cents: number | null, factor: number | null): number | null {
  if (cents === null || factor === null) return null
  if (!Number.isSafeInteger(cents) || !Number.isInteger(factor)) return null
  const result = cents * factor
  if (!Number.isSafeInteger(result)) return null
  if (Math.abs(result) > CENTS_SANITY_CEILING) return null
  return result
}

/** Soma centavos com a mesma garantia de exatidão. */
export function sumCents(values: readonly number[]): number | null {
  let total = 0
  for (const v of values) {
    if (!Number.isSafeInteger(v)) return null
    total += v
    if (!Number.isSafeInteger(total)) return null
  }
  if (Math.abs(total) > CENTS_SANITY_CEILING) return null
  return total
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

/**
 * Força do CPF como sinal de identidade para deduplicação.
 *
 * `exact`     — 11 dígitos vieram da fonte e o verificador confere
 * `recovered` — 10 dígitos + um zero reconstruído, verificador confere
 * `none`      — não utilizável como identidade
 */
export type CpfConfidence = "exact" | "recovered" | "none"

export interface CpfResult {
  /** 11 dígitos quando utilizável; null caso contrário */
  digits: string | null
  /** dígitos verificadores conferem */
  valid: boolean
  /** precisou reconstruir o zero à esquerda */
  recovered: boolean
  /** peso do sinal na deduplicação — `recovered` NUNCA vale o mesmo que `exact` */
  confidence: CpfConfidence
}

const CPF_NONE: CpfResult = { digits: null, valid: false, recovered: false, confidence: "none" }

export function parseCpf(raw: unknown): CpfResult {
  if (raw === null || raw === undefined) return CPF_NONE
  const digits = String(raw).replace(/\D/g, "")
  if (!digits) return CPF_NONE

  if (digits.length === 11) {
    const valid = isValidCpf(digits)
    return { digits, valid, recovered: false, confidence: valid ? "exact" : "none" }
  }

  // SOMENTE 10 dígitos. A versão anterior aceitava 8–10, e a medição mostrou por
  // que isso era errado:
  //
  //   entrada aleatória de 10 dígitos aceita pelo mod-11: ~1,0%
  //   entrada aleatória de  9 dígitos aceita pelo mod-11: ~1,0%
  //   entrada aleatória de  8 dígitos aceita pelo mod-11: ~1,0%
  //
  // A taxa de aceite falso é constante, mas a probabilidade a priori de a
  // recuperação ser legítima despenca: ~10% dos CPFs começam com um zero, ~1%
  // com dois, ~0,1% com três. Em 9 e 8 dígitos o filtro passa a admitir mais
  // lixo do que dado real, então esse caminho foi removido.
  //
  // Mesmo em 10 dígitos o verificador prova CONSISTÊNCIA, não IDENTIDADE: resta
  // ~1% de falso positivo. Por isso o resultado sai como `recovered` e a
  // deduplicação é obrigada a exigir um segundo sinal independente antes de
  // fundir registros — fundir duas pessoas é pior do que não fundir nenhuma.
  if (digits.length === 10) {
    const padded = "0" + digits
    if (isValidCpf(padded)) {
      return { digits: padded, valid: true, recovered: true, confidence: "recovered" }
    }
  }

  return CPF_NONE
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
