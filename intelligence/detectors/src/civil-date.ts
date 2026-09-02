/**
 * Data CIVIL estrita — um dia no calendário, não um instante na linha do tempo.
 *
 * ─── Por que `parseDateISO` do motor não serve aqui ────────────────────────────
 *
 * Ele casa PREFIXO ISO e descarta o resto:
 *
 *   "2026-08-04garbage"          → 2026-08-04
 *   "2026-08-04T23:30:00-03:00"  → 2026-08-04
 *
 * Para uma planilha de vendas isso é tolerância útil. Para primeira data de
 * vencimento é falso: o primeiro caso é lixo que virou elegibilidade, e o segundo
 * é um INSTANTE, cuja data civil depende do fuso em que se interpreta. Um
 * timestamp `2026-08-04T23:30:00-03:00` é `2026-08-05` em UTC. Aceitar o prefixo
 * é escolher um fuso em silêncio — e o dia do vencimento passaria a depender de
 * qual metade da string alguém leu.
 *
 * `parseDateISO` NÃO foi alterado: ele tem consumidores já aprovados no motor, e
 * mudá-lo silenciosamente trocaria um defeito localizado por uma regressão
 * espalhada. Esta primitiva é adicional e mais restritiva.
 *
 * ─── O que é aceito ───────────────────────────────────────────────────────────
 *
 *   YYYY-MM-DD      2026-08-04
 *   D/M/YYYY        4/8/2026
 *   DD/MM/YYYY      04/08/2026
 *   D-M-YYYY        4-8-2026
 *   DD-MM-YYYY      04-08-2026
 *
 * Dia e mês antes do ano são lidos como dd/MM — convenção brasileira, a mesma do
 * motor. `04/13/2026` não é março de 2026 nem abril: mês 13 não existe, e é
 * recusado em vez de reinterpretado como formato americano.
 *
 * ─── O que é recusado, e por quê ──────────────────────────────────────────────
 *
 *   timestamp ISO       é instante, não dia civil
 *   prefixo/sufixo      "2026-08-04x" é lixo, não data
 *   serial Excel        número não declara qual epoch usa
 *   ano de 2 dígitos    "04/08/26" exige assumir o século
 *   separador misto     "04/08-2026" não é nenhum dos formatos suportados
 *   espaço em branco    aparar seria aceitar algo não documentado
 *   formato americano   MM/DD/YYYY é ambíguo com DD/MM/YYYY
 *
 * Nada é corrigido heuristicamente: `31/02/2026` é recusado, não convertido em
 * 03/03. `new Date(string)` nunca é usado — é justamente ele que "conserta"
 * entrada inválida.
 *
 * O resultado é uma string `YYYY-MM-DD`, sem fuso e sem hora. Comparação e
 * ordenação lexicográficas são seguras, e o bucket de um contrato não depende do
 * fuso do processo que rodou o detector.
 */

/** `YYYY-MM-DD` completo — sem prefixo, sem sufixo, sem hora. */
const ISO_COMPLETO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `D/M/YYYY` ou `D-M-YYYY`, com o MESMO separador nas duas posições.
 *
 * A retrorreferência `\2` é o que recusa `04/08-2026`: um separador misto não é
 * nenhum dos formatos suportados, e aceitá-lo seria inventar um sexto formato.
 */
const BR_COMPLETO = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/

/**
 * Dias por mês, com fevereiro resolvido pela regra real de ano bissexto.
 *
 * EXPORTADO na Fase 2.11d. Era interno, e a validação de `modifiedTime` da fonte do
 * Lucas precisava da mesma resposta para "esta data existe?". Escrever um segundo
 * contador de dias seria criar duas autoridades de calendário no repositório — e a
 * que estivesse errada só apareceria quando uma delas aceitasse 30 de fevereiro.
 *
 * Nenhuma linha de lógica mudou: só a visibilidade.
 */
export function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
    return bissexto ? 29 : 28
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 0
}

function montar(ano: number, mes: number, dia: number): string | null {
  if (!Number.isSafeInteger(ano) || !Number.isSafeInteger(mes) || !Number.isSafeInteger(dia)) {
    return null
  }
  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > diasNoMes(ano, mes)) return null
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

/**
 * Canonicaliza uma data civil, ou devolve `null`.
 *
 * `null` significa "não é uma data civil suportada" — nunca "provavelmente era
 * isto". Quem chama distingue ausência de invalidez pelo próprio valor de
 * entrada, não por este retorno.
 */
export function parseCivilDateStrict(raw: unknown): string | null {
  // Somente string. Número seria serial de planilha, e serial não declara epoch.
  if (typeof raw !== "string") return null

  const iso = ISO_COMPLETO.exec(raw)
  if (iso !== null) {
    const [, y, m, d] = iso
    return montar(Number(y), Number(m), Number(d))
  }

  const br = BR_COMPLETO.exec(raw)
  if (br !== null) {
    const [, d, , m, y] = br
    return montar(Number(y), Number(m), Number(d))
  }

  return null
}

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.13 — aritmética de calendário civil e o serial do Google Sheets
// ═════════════════════════════════════════════════════════════════════════════
//
// Adicionado AQUI, e não num módulo novo, por decisão explícita da fase: este é o
// módulo de calendário do repositório. Um segundo lugar que soubesse somar dias
// civis seria uma segunda autoridade de calendário — e a que estivesse errada só
// apareceria no dia em que as duas discordassem sobre 29 de fevereiro.
//
// Nada aqui usa `Date`, `Date.parse`, milissegundos ou duração de 24h. Deslocamento
// de prazo é distância em DIAS DE CALENDÁRIO, e horário de verão faz um "dia" ter
// 23 ou 25 horas — dividir milissegundos por 86.400.000 erra o dia na virada.

/**
 * Dias civis desde 1970-01-01, algoritmo de Howard Hinnant (`days_from_civil`).
 *
 * Álgebra pura sobre inteiros, sem tabela e sem laço: independe de fuso, de locale
 * e da implementação de `Intl`. É o mesmo algoritmo que `source-time.ts` usa para
 * `SourceInstant`; um teste desta fase afirma que as duas concordam sobre um
 * intervalo largo de datas, porque duplicação não provada é divergência esperando
 * acontecer.
 */
function diasDesdeEpoca(ano: number, mes: number, dia: number): number {
  const y = ano - (mes <= 2 ? 1 : 0)
  const era = Math.floor((y >= 0 ? y : y - 399) / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Inverso exato de `diasDesdeEpoca` (`civil_from_days`). */
function dataDesdeDias(dias: number): { ano: number; mes: number; dia: number } {
  const z = dias + 719468
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1
  const mes = mp + (mp < 10 ? 3 : -9)
  return { ano: yoe + era * 400 + (mes <= 2 ? 1 : 0), mes, dia }
}

/** `YYYY-MM-DD` → dias desde a epoch civil. `null` se não for data civil válida. */
export function civilDaysFromDate(raw: unknown): number | null {
  const iso = parseCivilDateStrict(raw)
  if (iso === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m === null) return null
  return diasDesdeEpoca(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** Dias desde a epoch civil → `YYYY-MM-DD`. */
export function civilDateFromDays(dias: number): string | null {
  if (!Number.isSafeInteger(dias)) return null
  const { ano, mes, dia } = dataDesdeDias(dias)
  if (ano < 1 || ano > 9999) return null
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

/**
 * Soma (ou subtrai) DIAS DE CALENDÁRIO a uma data civil.
 *
 * Sem pular fim de semana e sem feriado: a regra de prazo aprovada é dia corrido, e
 * D-4 de uma segunda-feira é a quinta anterior mesmo que ninguém trabalhe no sábado.
 */
export function addCivilDays(raw: unknown, delta: number): string | null {
  if (!Number.isSafeInteger(delta)) return null
  const base = civilDaysFromDate(raw)
  if (base === null) return null
  return civilDateFromDays(base + delta)
}

/** `to - from` em dias de calendário. `null` se qualquer lado não for data civil. */
export function diffCivilDays(from: unknown, to: unknown): number | null {
  const a = civilDaysFromDate(from)
  const b = civilDaysFromDate(to)
  if (a === null || b === null) return null
  return b - a
}

/**
 * Epoch do serial de data do Google Sheets, em dias civis desde 1970-01-01.
 *
 * Serial 0 é 1899-12-30 no sistema 1900 que o Sheets herdou do Lotus/Excel. O valor
 * é derivado, não digitado: um teste afirma que ele reproduz os seriais REAIS
 * observados na fonte oficial — `46260 → 2026-08-26`.
 */
export const SHEETS_SERIAL_EPOCH_DAYS: number = diasDesdeEpoca(1899, 12, 30)

/**
 * Menor serial aceito. 61 é 1900-03-01.
 *
 * Abaixo disso está a região do bug de ano bissexto de 1900 que o sistema 1900
 * carrega — o 29/02/1900 fictício —, e ali o mapeamento serial→data civil depende de
 * qual implementação reproduz o bug. Nenhum prazo de contrato de 2026 mora lá, e
 * recusar é honesto: preferir um palpite sobre 1900 a um estado de não-avaliável
 * seria inventar data.
 */
export const SHEETS_SERIAL_MIN = 61

/** Maior serial aceito: 9999-12-31. Acima disso não é prazo, é dado corrompido. */
export const SHEETS_SERIAL_MAX = 2958465

/**
 * Serial de data do Google Sheets → data civil canônica.
 *
 * Aceita SOMENTE inteiro dentro da janela governada. Recusa, por decisão:
 *
 *   string          `"46260"` não declara que é serial; poderia ser qualquer número
 *   fracionário     carrega hora do dia, e prazo é data — truncar escolheria o dia
 *   fora da janela  ver `SHEETS_SERIAL_MIN` / `SHEETS_SERIAL_MAX`
 *
 * `null` significa "não é serial de data suportado", nunca "provavelmente era isto".
 */
export function civilDateFromSheetsSerial(raw: unknown): string | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null
  if (!Number.isInteger(raw)) return null
  if (raw < SHEETS_SERIAL_MIN || raw > SHEETS_SERIAL_MAX) return null
  return civilDateFromDays(SHEETS_SERIAL_EPOCH_DAYS + raw)
}
