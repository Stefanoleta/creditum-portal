// Mock data for Módulo 3 — Relatórios
// RAF = Rafael Costa (high performer), MARC = Marcos Pinto (low performer)

export interface DailyRow {
  date: string
  dia: string
  ligacoes: number
  atendidas: number
  conversoes: number
  tma_segundos: number
  taxa_contato: number
  taxa_conversao: number
  receita: number
}

export interface HourlyRow {
  hora: string
  ligacoes: number
  atendidas: number
  conversoes: number
  taxa_contato: number
  taxa_conversao: number
}

export interface OperatorRow {
  id: string
  name: string
  meta_dia: number
  ligacoes_realizadas: number
  ligacoes_atendidas: number
  conversoes: number
  tma_segundos: number
  score_ia: number
  taxa_contato: number
  taxa_conversao: number
}

export interface ReportsPayload {
  hoje: DailyRow
  intraday: HourlyRow[]
  por_hora: HourlyRow[]
  operadores: OperatorRow[]
  historico: DailyRow[]
  source: "argus" | "mock"
  updated_at: string
  fallback_reason?: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const PT_DAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function getRecentWorkingDays(count: number): Array<{ date: string; wd: string; dd: string }> {
  const days: Array<{ date: string; wd: string; dd: string }> = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() - 1) // start from yesterday

  while (days.length < count) {
    const dow = cursor.getDay()
    if (dow > 0 && dow < 6) {
      const mm = String(cursor.getMonth() + 1).padStart(2, "0")
      const dd = String(cursor.getDate()).padStart(2, "0")
      days.unshift({
        date: cursor.toISOString().split("T")[0],
        wd: PT_DAY[dow],
        dd: `${dd}/${mm}`,
      })
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}

// ─── base datasets ────────────────────────────────────────────────────────────

const RAW_METRICS = [
  { l: 348, a: 224, c: 31, tma: 231 },
  { l: 337, a: 217, c: 28, tma: 244 },
  { l: 361, a: 235, c: 35, tma: 226 },
  { l: 329, a: 209, c: 27, tma: 238 },
  { l: 294, a: 183, c: 21, tma: 252 },
  { l: 356, a: 228, c: 33, tma: 229 },
  { l: 343, a: 221, c: 30, tma: 241 },
  { l: 371, a: 242, c: 38, tma: 219 },
  { l: 338, a: 213, c: 29, tma: 237 },
  { l: 301, a: 188, c: 23, tma: 248 },
  { l: 362, a: 233, c: 34, tma: 223 },
  { l: 349, a: 226, c: 32, tma: 235 },
  { l: 375, a: 248, c: 41, tma: 217 },
  { l: 321, a: 204, c: 26, tma: 243 },
  { l: 308, a: 191, c: 22, tma: 251 },
]

const RAW_HOURLY = [
  { h: "09h", l: 28, a: 18, c: 2 },
  { h: "10h", l: 45, a: 30, c: 5 },
  { h: "11h", l: 52, a: 35, c: 6 },
  { h: "12h", l: 22, a: 14, c: 2 },
  { h: "13h", l: 38, a: 25, c: 4 },
  { h: "14h", l: 58, a: 39, c: 7 },
  { h: "15h", l: 55, a: 37, c: 6 },
  { h: "16h", l: 48, a: 31, c: 5 },
  { h: "17h", l: 35, a: 22, c: 3 },
  { h: "18h", l: 19, a: 11, c: 1 },
]

// ─── exported bases ───────────────────────────────────────────────────────────

type RawMetric = typeof RAW_METRICS[0]
type DayInfo   = ReturnType<typeof getRecentWorkingDays>[0]

function makeDailyRow(r: RawMetric, day: DayInfo): DailyRow {
  const taxa_contato   = Math.round((r.a / r.l) * 1000) / 10
  const taxa_conversao = Math.round((r.c / r.a) * 1000) / 10
  return {
    date: day.date,
    dia: `${day.wd} ${day.dd}`,
    ligacoes: r.l,
    atendidas: r.a,
    conversoes: r.c,
    tma_segundos: r.tma,
    taxa_contato,
    taxa_conversao,
    receita: r.c * 1600,
  }
}

function makeHourlyRow(r: typeof RAW_HOURLY[0]): HourlyRow {
  return {
    hora: r.h,
    ligacoes: r.l,
    atendidas: r.a,
    conversoes: r.c,
    taxa_contato: Math.round((r.a / r.l) * 1000) / 10,
    taxa_conversao: r.a > 0 ? Math.round((r.c / r.a) * 1000) / 10 : 0,
  }
}

export const DAILY_BASE: DailyRow[] = getRecentWorkingDays(15).map((day, i) =>
  makeDailyRow(RAW_METRICS[i], day)
)

export const HR_BASE: HourlyRow[] = RAW_HOURLY.map(makeHourlyRow)

export const RAF_BASE: OperatorRow = {
  id: "raf-001",
  name: "Rafael Costa",
  meta_dia: 50,
  ligacoes_realizadas: 58,
  ligacoes_atendidas: 41,
  conversoes: 9,
  tma_segundos: 198,
  score_ia: 91,
  taxa_contato: 70.7,
  taxa_conversao: 22.0,
}

export const MARC_BASE: OperatorRow = {
  id: "marc-001",
  name: "Marcos Pinto",
  meta_dia: 50,
  ligacoes_realizadas: 42,
  ligacoes_atendidas: 27,
  conversoes: 4,
  tma_segundos: 284,
  score_ia: 71,
  taxa_contato: 64.3,
  taxa_conversao: 14.8,
}

// ─── full mock payload ────────────────────────────────────────────────────────

export function generateMockReports(): ReportsPayload {
  const todayDate = new Date()
  const todayDay  = getRecentWorkingDays(1)[0] ?? {
    date: todayDate.toISOString().split("T")[0],
    wd: PT_DAY[todayDate.getDay()],
    dd: `${String(todayDate.getDate()).padStart(2, "0")}/${String(todayDate.getMonth() + 1).padStart(2, "0")}`,
  }
  const hoje = makeDailyRow({ l: 347, a: 221, c: 41, tma: 228 }, todayDay)

  const allOperators: OperatorRow[] = [
    { id: "ana-001",   name: "Ana Beatriz",   meta_dia: 50, ligacoes_realizadas: 52, ligacoes_atendidas: 36, conversoes: 8, tma_segundos: 210, score_ia: 91, taxa_contato: 69.2, taxa_conversao: 22.2 },
    RAF_BASE,
    { id: "jul-001",   name: "Julia Souza",   meta_dia: 50, ligacoes_realizadas: 44, ligacoes_atendidas: 30, conversoes: 6, tma_segundos: 230, score_ia: 82, taxa_contato: 68.2, taxa_conversao: 20.0 },
    { id: "lar-001",   name: "Larissa Neves", meta_dia: 50, ligacoes_realizadas: 50, ligacoes_atendidas: 34, conversoes: 5, tma_segundos: 220, score_ia: 86, taxa_contato: 68.0, taxa_conversao: 14.7 },
    { id: "car-001",   name: "Carlos Mendes", meta_dia: 50, ligacoes_realizadas: 48, ligacoes_atendidas: 31, conversoes: 6, tma_segundos: 255, score_ia: 84, taxa_contato: 64.6, taxa_conversao: 19.4 },
    { id: "fer-001",   name: "Fernanda Lima", meta_dia: 50, ligacoes_realizadas: 41, ligacoes_atendidas: 28, conversoes: 5, tma_segundos: 198, score_ia: 78, taxa_contato: 68.3, taxa_conversao: 17.9 },
    MARC_BASE,
    { id: "die-001",   name: "Diego Rocha",   meta_dia: 50, ligacoes_realizadas: 38, ligacoes_atendidas: 24, conversoes: 2, tma_segundos: 312, score_ia: 75, taxa_contato: 63.2, taxa_conversao:  8.3 },
  ].sort((a, b) => b.conversoes - a.conversoes)

  return {
    hoje,
    intraday: HR_BASE,
    por_hora: HR_BASE,
    operadores: allOperators,
    historico: DAILY_BASE,
    source: "mock",
    updated_at: new Date().toISOString(),
  }
}
