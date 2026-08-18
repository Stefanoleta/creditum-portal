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

/** Dias por mês, com fevereiro resolvido pela regra real de ano bissexto. */
function diasNoMes(ano: number, mes: number): number {
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
