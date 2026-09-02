/**
 * O instante de um timestamp da fonte, EXATO. Uma definição, todos os consumidores.
 *
 * ─── Três defeitos, na mesma pergunta ─────────────────────────────────────────
 *
 * "Qual destes dois arquivos é mais recente?" errou três vezes seguidas, e cada
 * correção expôs a seguinte:
 *
 * **2.11a** corrigiu a comparação de `observed_at` no provider — string → instante —
 * e deixou o comparador de seleção comparando string. Dois caminhos, respostas
 * diferentes.
 *
 * **2.11c** unificou em instante e deixou `Date.parse` decidir a VALIDADE.
 * `Date.parse` normaliza: `2026-02-30` virava 2 de março, e um timestamp impossível
 * entrava na cronologia deslocado em dias.
 *
 * **2.11d** validou cada componente e truncou a fração em 3 dígitos. `.1004Z` e
 * `.1009Z` — instantes DIFERENTES — colapsavam no mesmo milissegundo, caíam no
 * desempate por `file_id`, e o arquivo mais antigo podia ganhar. Pior: o teste que
 * escrevi *documentava* essa perda como intencional, em vez de recusá-la.
 *
 * O padrão comum é o mesmo nas três: uma representação mais pobre que a fonte.
 * String não ordena cronologia; `number` de milissegundos não representa nanossegundo.
 * A correção é fazer a representação carregar tudo o que a fonte carrega.
 *
 * ─── Por que segundos + nanos, e não milissegundos ────────────────────────────
 *
 * O contrato de Timestamp do Google tem resolução de NANOSSEGUNDO, e o `modifiedTime`
 * do Drive é RFC3339 com fração de tamanho livre. Um `number` de milissegundos
 * descarta 6 dígitos decimais — e descartar informação de ordenação numa regra
 * chamada LATEST_MODIFIED é a definição do defeito.
 *
 * `epoch_seconds` inteiro + `nanos` em 0..999.999.999. Dois inteiros exatos, sem
 * ponto flutuante em nenhum ponto da comparação. `number` basta para os segundos: o
 * ano 9999 cabe folgado em inteiro seguro.
 *
 * ─── Por que nenhum `Date` participa ──────────────────────────────────────────
 *
 * `Date.UTC` remapeia anos 0–99 para 1900–1999 — `0099` viraria `1999`, com o
 * calendário do ano errado. E `Date.parse` normaliza valores impossíveis. Os dias
 * desde a época vêm de aritmética de calendário explícita, que não tem caso especial
 * nem depende do fuso da máquina.
 */

import { diasNoMes } from "../../../detectors/src/civil-date"

/**
 * Instante EXATO de um timestamp da fonte.
 *
 * Não existe campo de milissegundos, de propósito: enquanto houvesse um, um consumidor
 * futuro poderia comparar só ele e reintroduzir o defeito sem que nada falhasse.
 */
export interface SourceInstant {
  /** Segundos inteiros desde 1970-01-01T00:00:00Z. Negativo antes da época. */
  readonly epoch_seconds: number
  /** Fração em nanossegundos, 0..999_999_999. Sempre exata. */
  readonly nanos: number
}

/**
 * RFC3339 com hora e fuso obrigatórios, componentes CAPTURADOS.
 *
 * `AAAA-MM-DDTHH:MM:SS[.frac](Z|±HH:MM)`. Segundo é obrigatório: `18:00Z` é ISO-8601
 * válido e NÃO é RFC3339, e aceitá-lo abriria a porta para formas que o Drive não
 * emite.
 *
 * Os grupos existem para serem VALIDADOS. Um regex que só dizia "dois dígitos" foi o
 * que deixou `24:00:00` passar na 2.11c.
 */
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/

/** Resolução máxima suportada: nanossegundo. */
export const MAX_FRACTION_DIGITS = 9

const SEGUNDOS_POR_DIA = 86_400

/**
 * Dias desde 1970-01-01 para uma data civil já validada.
 *
 * Algoritmo `days_from_civil` de Howard Hinnant: aritmética inteira pura, correta
 * para todo o calendário gregoriano proléptico, sem `Date` e sem caso especial de
 * ano. É o que evita o remapeamento de anos 0–99 que `Date.UTC` faz.
 *
 * O deslocamento de 719468 dias é a distância de 0000-03-01 a 1970-01-01, e março
 * como início do ano é o truque que faz o dia bissexto cair no FIM, eliminando o
 * caso especial de fevereiro da aritmética.
 */
function diasDesdeEpoca(ano: number, mes: number, dia: number): number {
  const y = ano - (mes <= 2 ? 1 : 0)
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146_097 + doe - 719_468
}

/**
 * Nanossegundos a partir da fração textual, SEM perda.
 *
 * `null` quando a fração excede a resolução suportada. Truncar seria repetir o
 * defeito da 2.11d com outro número de dígitos; recusar é honesto — a fonte enviou
 * precisão que este contrato não representa, e o chamador falha fechado.
 *
 *   `.1`          → 100_000_000
 *   `.1004`       → 100_400_000
 *   `.123456789`  → 123_456_789
 *   `.1234567891` → null
 */
function fracaoParaNanos(frac: string | undefined): number | null {
  if (frac === undefined) return 0
  if (frac.length > MAX_FRACTION_DIGITS) return null
  return Number(frac.padEnd(MAX_FRACTION_DIGITS, "0"))
}

/**
 * Instante exato, ou `null` quando não é um timestamp de fonte legível.
 *
 * `null` significa "não consigo representar este tempo" — nunca "é antigo" nem "é
 * agora". Nada é normalizado: data que não existe, hora fora de faixa, fuso inválido
 * e precisão acima de nanossegundo são recusados, não ajustados para o vizinho.
 */
export function sourceInstant(raw: unknown): SourceInstant | null {
  if (typeof raw !== "string") return null
  const m = RFC3339.exec(raw.trim())
  if (m === null) return null

  const [, y, mo, d, h, mi, sec, frac, sinal, oh, om] = m
  if (
    y === undefined ||
    mo === undefined ||
    d === undefined ||
    h === undefined ||
    mi === undefined ||
    sec === undefined
  ) {
    return null
  }

  const ano = Number(y)
  const mes = Number(mo)
  const dia = Number(d)
  const hora = Number(h)
  const minuto = Number(mi)
  const segundo = Number(sec)

  // ─── Calendário ─────────────────────────────────────────────────────────────
  if (mes < 1 || mes > 12) return null
  // A prova de que a data EXISTE, pela regra gregoriana real. É isto que recusa
  // 30/02, 31/04 e 29/02 em ano não bissexto, em vez de deslocá-los.
  if (dia < 1 || dia > diasNoMes(ano, mes)) return null

  // ─── Hora ───────────────────────────────────────────────────────────────────
  if (hora > 23 || minuto > 59) return null
  // Segundo 60 é o segundo intercalar do RFC3339. Este contrato não o representa, e
  // aceitá-lo obrigaria a mapeá-lo para 00:00:00 do dia seguinte — a normalização
  // silenciosa que este módulo existe para recusar. O Drive não o emite.
  if (segundo > 59) return null

  // ─── Fração ─────────────────────────────────────────────────────────────────
  const nanos = fracaoParaNanos(frac)
  if (nanos === null) return null

  // ─── Fuso ───────────────────────────────────────────────────────────────────
  let deslocamentoSegundos = 0
  if (sinal !== undefined) {
    if (oh === undefined || om === undefined) return null
    const offsetHora = Number(oh)
    const offsetMinuto = Number(om)
    if (offsetHora > 23 || offsetMinuto > 59) return null
    const total = offsetHora * 3600 + offsetMinuto * 60
    deslocamentoSegundos = sinal === "-" ? -total : total
  }

  // Aritmética inteira sobre componentes JÁ validados. `+01:00` significa que o
  // horário local está 1h à frente de UTC, então o instante é o civil MENOS o
  // deslocamento. A fração NÃO participa: fuso desloca segundos, nunca nanos.
  const civil =
    diasDesdeEpoca(ano, mes, dia) * SEGUNDOS_POR_DIA + hora * 3600 + minuto * 60 + segundo

  return { epoch_seconds: civil - deslocamentoSegundos, nanos }
}

/**
 * Ordem cronológica de dois instantes exatos. `-1`, `0`, `1`.
 *
 * O ÚNICO comparador de cronologia de fonte do subsistema. Consumidor que comparasse
 * milissegundos, string ou `Date` por conta própria reintroduziria um dos três
 * defeitos anteriores — e é por isso que `SourceInstant` não tem campo de
 * milissegundos para tentar.
 *
 * `0` significa mesmo instante ATÉ O NANOSSEGUNDO. Só aí o desempate governado por
 * `file_id` entra.
 */
export function compareSourceInstant(a: SourceInstant, b: SourceInstant): number {
  if (a.epoch_seconds !== b.epoch_seconds) return a.epoch_seconds < b.epoch_seconds ? -1 : 1
  if (a.nanos !== b.nanos) return a.nanos < b.nanos ? -1 : 1
  return 0
}

/**
 * Instante exato de um `Date` do nosso próprio relógio.
 *
 * Existe para o §24: comparar `observed_at <= ingested_at`. `observed_at` vem da fonte
 * com até nanossegundo; `ingested_at` vem de um `Date`, com milissegundo. Truncar o
 * da fonte de volta para milissegundo faria `.1009` e `.1000` compararem IGUAIS —
 * exatamente a perda que esta fase corrige, reintroduzida pela porta de trás.
 *
 * Elevar o nosso relógio à mesma representação preserva a comparação: o `Date` tem
 * menos precisão, e isso é uma propriedade dele, não uma razão para rebaixar a fonte.
 */
export function instantFromDate(d: Date): SourceInstant | null {
  const ms = d.getTime()
  if (!Number.isFinite(ms)) return null
  const epoch_seconds = Math.floor(ms / 1000)
  // `%` em JS mantém o sinal do dividendo; para instantes antes da época isso daria
  // nanos negativo. `ms - epoch_seconds*1000` com `floor` acima é sempre 0..999.
  const nanos = (ms - epoch_seconds * 1000) * 1_000_000
  return { epoch_seconds, nanos }
}

/** Ordenação lexical por code unit, estável e independente de locale. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
