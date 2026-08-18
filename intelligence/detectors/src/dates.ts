/**
 * Datas e janelas — fuso explícito, calendário real, sem relógio implícito.
 *
 * Duas responsabilidades separadas de propósito:
 *
 *   1. **Converter instante → data de negócio.** É o único lugar onde o fuso
 *      importa. `2026-08-16T02:00:00Z` é dia 15 em São Paulo, e um detector que
 *      contasse isso como dia 16 alocaria o contrato no mês errado.
 *
 *   2. **Aritmética de calendário sobre datas.** Depois que a data de negócio
 *      existe, mês e janela são contagem pura — sem fuso, sem horário de verão,
 *      sem ambiguidade.
 *
 * Nenhuma função chama `new Date()` sem argumento. A data de referência é sempre
 * parâmetro, para que o mesmo teste dê o mesmo resultado em qualquer máquina e
 * em qualquer dia.
 *
 * Isto NÃO duplica `parseDateISO` de `src/lib/ceo/parse.ts`: aquele converte
 * `dd/MM/yyyy` e serial de planilha para ISO. Aqui a entrada já é ISO — o que se
 * faz é aritmética de janela, capacidade que não existe no motor.
 */

import { GatewayError } from "../../gateway/src/errors"

/** `YYYY-MM-DD` — data de negócio, sem hora e sem fuso. */
export type BusinessDate = string

/** `YYYY-MM` */
export type MonthKey = string

export interface DateWindow {
  readonly start: BusinessDate
  readonly end: BusinessDate
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

interface YMD {
  readonly y: number
  readonly m: number
  readonly d: number
}

function parseBusinessDate(date: BusinessDate, path: string): YMD {
  const m = ISO_DATE.exec(date)
  if (m === null) {
    throw new GatewayError("SCHEMA_INVALID", `${path}: data precisa ser YYYY-MM-DD`, [date])
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])

  // Calendário REAL: 2026-02-30 casa com o regex e não existe.
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new GatewayError("SCHEMA_INVALID", `${path}: data inexistente no calendário`, [date])
  }

  return { y, m: mo, d }
}

function format({ y, m, d }: YMD): BusinessDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/**
 * Último dia do mês, com ano bissexto pelo próprio calendário.
 *
 * `Date.UTC(y, m, 0)` é o dia 0 do mês seguinte, ou seja, o último do mês
 * pedido. Fevereiro de 2028 dá 29 sem nenhuma regra de bissexto escrita à mão.
 */
export function lastDayOfMonth(year: number, month: number): number {
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new GatewayError("SCHEMA_INVALID", "mês fora do intervalo 1..12", [
      `${year}-${month}`,
    ])
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Instante ISO → data de negócio no fuso informado.
 *
 * É aqui, e só aqui, que o fuso entra. `Intl.DateTimeFormat` faz a conversão
 * corretamente inclusive em mudança de horário de verão, sem tabela nossa.
 */
export function businessDateOf(instantISO: string, timezone: string): BusinessDate {
  const t = new Date(instantISO)
  if (Number.isNaN(t.getTime())) {
    throw new GatewayError("SCHEMA_INVALID", "instante não parseável", [instantISO])
  }

  let partes: Intl.DateTimeFormatPart[]
  try {
    partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(t)
  } catch {
    throw new GatewayError("SCHEMA_INVALID", "fuso horário desconhecido", [timezone])
  }

  const get = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? ""

  return `${get("year")}-${get("month")}-${get("day")}`
}

export function monthKeyOf(date: BusinessDate): MonthKey {
  const { y, m } = parseBusinessDate(date, "date")
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`
}

/**
 * Mês calendário deslocado a partir da data de referência.
 *
 * `monthsAhead: 0` é o mês da própria referência; `1` é o mês seguinte.
 * A virada de dezembro para janeiro sai da aritmética, não de um caso especial.
 */
export function calendarMonthWindow(
  reference: BusinessDate,
  monthsAhead: number,
): DateWindow {
  if (!Number.isSafeInteger(monthsAhead)) {
    throw new GatewayError("SCHEMA_INVALID", "monthsAhead precisa ser inteiro", [
      String(monthsAhead),
    ])
  }

  const { y, m } = parseBusinessDate(reference, "reference")

  // Índice absoluto de mês desde o ano 0 — dezembro→janeiro vira +1 sem `if`.
  const indice = y * 12 + (m - 1) + monthsAhead
  const alvoY = Math.floor(indice / 12)
  const alvoM = (indice % 12) + 1

  return {
    start: format({ y: alvoY, m: alvoM, d: 1 }),
    end: format({ y: alvoY, m: alvoM, d: lastDayOfMonth(alvoY, alvoM) }),
  }
}

/**
 * Janela dos próximos N dias, a referência INCLUSIVE.
 *
 * `days: 1` é só o dia da referência. Contar de outro jeito produziria janelas
 * com tamanho diferente do nome — e um detector de concentração que diz "30
 * dias" e mede 31 é um detector que mente.
 */
export function nextNDaysWindow(reference: BusinessDate, days: number): DateWindow {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new GatewayError("SCHEMA_INVALID", "days precisa ser inteiro >= 1", [String(days)])
  }

  const { y, m, d } = parseBusinessDate(reference, "reference")
  const fim = new Date(Date.UTC(y, m - 1, d + (days - 1)))

  return {
    start: reference,
    end: format({
      y: fim.getUTCFullYear(),
      m: fim.getUTCMonth() + 1,
      d: fim.getUTCDate(),
    }),
  }
}

/** Extremos inclusivos. Comparação lexicográfica é segura em ISO normalizado. */
export function isWithinWindow(date: BusinessDate, window: DateWindow): boolean {
  parseBusinessDate(date, "date")
  return date >= window.start && date <= window.end
}

/** Dias entre duas datas de negócio (fim − início). Pode ser negativo. */
export function daysBetween(from: BusinessDate, to: BusinessDate): number {
  const a = parseBusinessDate(from, "from")
  const b = parseBusinessDate(to, "to")
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)
  return Math.round(ms / 86_400_000)
}
