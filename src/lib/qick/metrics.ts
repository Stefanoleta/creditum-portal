// Pure function: QickNormalizedCall[] → SamanthaMetrics.
// No side effects, no I/O — trivially testable.

import type { QickNormalizedCall, QickFonte } from "./client"

export interface TabulacaoMetric {
  codigo: string
  nome: string
  quantidade: number
  percentual: number
}

export interface SamanthaMetrics {
  totalLigacoes: number
  ligacoesAtendidas: number   // answered (not muda/caiu)
  taxaContato: number         // atendidas / total * 100
  taxaConversao: number       // 5445 / total * 100
  taxaNaoPerturbe: number     // 5446 / total * 100
  tma: string                 // "M:SS" average duration of answered calls
  tabulacoes: TabulacaoMetric[]
  fonte: QickFonte
}

const TABBING_LABELS: Record<string, string> = {
  "5445": "Demonstra Intenção em Resolver",
  "5447": "Confirmou que Já Resolveu",
  "5446": "Pediu para Não ser Contatado",
  "116":  "Ligação Muda",
  "199":  "Ligação Caiu",
}

const NOT_ANSWERED = new Set(["116", "199"])

function formatTma(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

function pct(num: number, total: number): number {
  if (total === 0) return 0
  return Math.round((num / total) * 1000) / 10  // 1 decimal
}

export function computeSamanthaMetrics(
  calls: QickNormalizedCall[],
  fonte: QickFonte,
): SamanthaMetrics {
  const total = calls.length

  // Count per tabbing code
  const countByCode: Record<string, number> = {}
  let durationSum = 0
  let durationCount = 0

  for (const call of calls) {
    const code = call.tabbingCode || "unknown"
    countByCode[code] = (countByCode[code] ?? 0) + 1

    if (!NOT_ANSWERED.has(code) && call.durationSeconds !== null && call.durationSeconds > 0) {
      durationSum += call.durationSeconds
      durationCount++
    }
  }

  const engajados   = countByCode["5445"] ?? 0
  const naoPerturbe = countByCode["5446"] ?? 0
  const muda        = countByCode["116"]  ?? 0
  const caiu        = countByCode["199"]  ?? 0
  const atendidas   = total - muda - caiu

  const tmaSeconds  = durationCount > 0 ? durationSum / durationCount : 0

  // Build tabulacoes array in display order
  const ORDER = ["5445", "5447", "5446", "199", "116"]
  const seen = new Set(ORDER)
  const allCodes = [...ORDER, ...Object.keys(countByCode).filter(c => !seen.has(c))]

  const tabulacoes: TabulacaoMetric[] = allCodes
    .filter(code => (countByCode[code] ?? 0) > 0)
    .map(code => ({
      codigo:      code,
      nome:        TABBING_LABELS[code] ?? code,
      quantidade:  countByCode[code] ?? 0,
      percentual:  pct(countByCode[code] ?? 0, total),
    }))

  return {
    totalLigacoes:    total,
    ligacoesAtendidas: atendidas,
    taxaContato:      pct(atendidas, total),
    taxaConversao:    pct(engajados, total),
    taxaNaoPerturbe:  pct(naoPerturbe, total),
    tma:              tmaSeconds > 0 ? formatTma(tmaSeconds) : "—",
    tabulacoes,
    fonte,
  }
}
