/**
 * Fixtures da fonte do Lucas. Schema real, dados sintéticos.
 *
 * ─── Zero PII ─────────────────────────────────────────────────────────────────
 *
 * Nenhum CPF, nome, telefone ou e-mail real aparece aqui. Os CPFs são construídos
 * em runtime por `cpfSintetico`, que calcula os dígitos verificadores de verdade —
 * porque `parseCpf` os confere, e um CPF de fachada seria recusado, fazendo o teste
 * medir o caminho de erro sem querer.
 *
 * Os nomes são `Aluno 01`, `Aluno 02`. A coluna existe porque o schema real a tem, e
 * omiti-la deixaria de exercitar o mapeamento por cabeçalho na presença de uma
 * coluna de PII que a ingestão precisa ignorar.
 *
 * ─── Os dois cabeçalhos são os REAIS ──────────────────────────────────────────
 *
 * Copiados da medição da Fase 2.10, incluindo a ordem diferente, as colunas que só
 * existem em um dos meses, e a coluna chamada literalmente `%`. É essa divergência
 * que prova que o mapeamento por posição quebraria.
 */

import { createHash } from "node:crypto"
import type { SheetCell } from "../../src/lucas/drive-port"

/** Dígitos verificadores reais, para que `parseCpf` aceite. */
export function cpfSintetico(semente: number): string {
  const base = createHash("sha256")
    .update(`fixture-lucas:${semente}`, "utf8")
    .digest("hex")
    .replace(/\D/gu, "")
    .padEnd(9, "0")
    .slice(0, 9)

  const dv = (parcial: string): number => {
    const peso = parcial.length + 1
    let soma = 0
    for (const [i, ch] of [...parcial].entries()) soma += Number(ch) * (peso - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }

  const d1 = dv(base)
  const d2 = dv(`${base}${d1}`)
  const digitos = `${base}${d1}${d2}`
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
}

/** Cabeçalho REAL de agosto/2026. Ordem preservada. */
export const HEADER_AGOSTO: readonly string[] = Object.freeze([
  "Venc",
  "Data Contratação",
  "Aluno",
  "CPF",
  "Unidade",
  "Canal",
  "Parcela Cheia",
  "Valor Repasse",
  "%",
  "Parcelas",
  "Ticket",
  "Vendedor",
  "Curso",
  "Repasse",
  "Inicio Grau",
  "Status",
  "Desembolso",
  "Valor para Desembolso",
])

/**
 * Cabeçalho REAL de julho/2026. Ordem DIFERENTE e colunas diferentes.
 *
 * `CPF` é a 3ª coluna aqui e a 4ª em agosto. `Unidade` é a 6ª aqui e a 5ª lá. Julho
 * tem `Sistema` e `Data Repasse`; não tem `%` nem `Curso`.
 */
export const HEADER_JULHO: readonly string[] = Object.freeze([
  "Venc",
  "Aluno",
  "CPF",
  "Sistema",
  "Canal",
  "Unidade",
  "Data Contratação",
  "Vendedor",
  "Data Repasse",
  "Parcelas",
  "Inicio Grau",
  "Valor",
  "Valor Repasse",
  "Ticket",
  "Status",
  "Desembolso",
  "Valor para Desembolso",
])

interface LinhaAgosto {
  readonly venc: unknown
  readonly cpf: unknown
  readonly unidade: unknown
  readonly canal?: unknown
  readonly repasse?: unknown
  readonly pct?: unknown
  readonly parcelas: unknown
  readonly ticket: unknown
  readonly vendedor?: unknown
  readonly status: unknown
  readonly aluno?: unknown
  /** Fase 2.13 — o TEXTO exibido de `Desembolso`, como `"26/08"`. */
  readonly desembolso?: unknown
}

/** Monta uma linha de agosto nas POSIÇÕES do cabeçalho de agosto. */
export function linhaAgosto(l: LinhaAgosto): readonly unknown[] {
  const r: unknown[] = new Array(HEADER_AGOSTO.length).fill("")
  r[0] = l.venc
  r[1] = "03/08/2026"
  r[2] = l.aluno ?? "Aluno Sintetico"
  r[3] = l.cpf
  r[4] = l.unidade
  r[5] = l.canal ?? "Indicação"
  r[6] = ""
  r[7] = l.repasse ?? ""
  r[8] = l.pct ?? ""
  r[9] = l.parcelas
  r[10] = l.ticket
  r[11] = l.vendedor ?? "Vendedor A"
  r[15] = l.status
  r[16] = l.desembolso ?? ""
  return Object.freeze(r)
}

interface LinhaJulho {
  readonly venc: unknown
  readonly cpf: unknown
  readonly unidade: unknown
  readonly parcelas: unknown
  readonly ticket: unknown
  readonly repasse?: unknown
  readonly status: unknown
}

/** Monta uma linha de julho nas POSIÇÕES do cabeçalho de julho — diferentes. */
export function linhaJulho(l: LinhaJulho): readonly unknown[] {
  const r: unknown[] = new Array(HEADER_JULHO.length).fill("")
  r[0] = l.venc
  r[1] = "Aluno Sintetico"
  r[2] = l.cpf
  r[3] = "Bitrix"
  r[4] = "Qualificação"
  r[5] = l.unidade
  r[6] = "10/07/2026"
  r[7] = "Vendedor B"
  r[9] = l.parcelas
  r[12] = l.repasse ?? ""
  r[13] = l.ticket
  r[14] = l.status
  return Object.freeze(r)
}


// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.13 — serial do Sheets, grade subjacente e o cabeçalho REAL de hoje
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Data civil → serial de data do Google Sheets.
 *
 * Independente do código de produção de propósito: se o teste usasse
 * `civilDateFromSheetsSerial` invertido, ele afirmaria que a conversão é consistente
 * consigo mesma, não que ela acerta. A âncora aritmética é o serial REAL observado na
 * fonte oficial — 46260 para 2026-08-26 — e um teste afirma isso diretamente.
 */
export function sheetsSerial(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m === null) throw new Error(`data inválida na fixture: ${iso}`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // 46260 = 2026-08-26. Conta os dias a partir dessa âncora, sem biblioteca.
  const dias = (ano: number, mes: number, dia: number): number => {
    const yy = ano - (mes <= 2 ? 1 : 0)
    const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
    const yoe = yy - era * 400
    const doy = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
    return era * 146097 + doe - 719468
  }
  return 46260 + (dias(y, mo, d) - dias(2026, 8, 26))
}

/**
 * Especificação de UMA célula de prazo, como a fonte a expõe.
 *
 * `serial` é o valor efetivo; `type` é o tipo de formato. Os dois separados de
 * propósito, porque a Fase 2.13a existe para provar que os dois são exigidos: um
 * serial válido com tipo `NUMBER` NÃO é prazo.
 */
export interface PrazoSpec {
  readonly serial: number | null
  readonly type?: string | null
}

/**
 * Observação COMPLETA de uma grade: formatado + valor efetivo + tipo, por célula.
 *
 * ─── Por que a fixture modela a observação inteira ───────────────────────────
 *
 * A fonte real entrega as três faces na MESMA resposta, e a Fase 2.13a existe porque
 * juntá-las de duas respostas permitia anexar o prazo de um contrato a outro. Uma
 * fixture que ainda modelasse duas grades separadas testaria a arquitetura antiga.
 *
 * Só a coluna de `Desembolso` recebe valor numérico e tipo — é a única que o provider
 * lê como data. As demais ficam como texto, fiel ao que o código exercita.
 */
export function observacao(
  headers: readonly string[],
  formatadas: readonly (readonly unknown[])[],
  prazos: readonly (PrazoSpec | null)[],
): { headers: readonly SheetCell[]; rows: readonly (readonly SheetCell[])[] } {
  const col = headers.indexOf("Desembolso")
  if (col < 0) throw new Error("cabeçalho da fixture não tem Desembolso")

  const texto = (v: unknown): SheetCell => ({
    formatted: v === null || v === undefined ? "" : String(v),
    number_value: null,
    number_format_type: null,
  })

  return {
    headers: headers.map(texto),
    rows: formatadas.map((linha, i) => {
      const celulas = linha.map(texto)
      const p = prazos[i]
      if (p !== null && p !== undefined && p.serial !== null) {
        celulas[col] = {
          formatted: String(linha[col] ?? ""),
          number_value: p.serial,
          // `DATE` por padrão porque é o que a fonte real usa; um teste passa
          // `NUMBER` explicitamente para provar a recusa.
          number_format_type: p.type === undefined ? "DATE" : p.type,
        }
      }
      return celulas
    }),
  }
}

/** Célula de prazo isolada, para testar `resolveDeadline` sem montar grade. */
export function celulaDePrazo(serial: number | null, type: string | null = "DATE"): SheetCell {
  return {
    formatted: serial === null ? "" : "26/08",
    number_value: serial,
    number_format_type: type,
  }
}

/**
 * Cabeçalho REAL da fonte oficial hoje. 19 colunas, `Status Pagamento` em B.
 *
 * ─── O incidente que esta fixture impede de voltar ────────────────────────────
 *
 * A fonte passou a ter duas colunas `Status`. `buildHeaderMap` recusou mapear o campo,
 * e o Lucas inteiro virou `invalid_source / DUPLICATED_HEADER_FIELD` — em produção,
 * silenciosamente, porque nenhuma fixture tinha a forma real.
 *
 * O dono da fonte renomeou a primeira para `Status Pagamento`. Esta fixture congela a
 * forma corrigida, e o teste de regressão afirma que `status` mapeia para a coluna do
 * A/C/E/P e que `status_pagamento` NÃO colide com ela.
 */
export const HEADER_AGOSTO_REAL: readonly string[] = Object.freeze([
  "Venc",
  "Status Pagamento",
  "Data Contratação",
  "Aluno",
  "CPF ",
  "Unidade",
  "Canal",
  "Parcela Cheia",
  "Valor Repasse",
  "%",
  "Parcelas",
  "Ticket",
  "Vendedor",
  "Curso",
  "Repasse",
  "Inicio Grau",
  "Status",
  "Desembolso",
  "Valor para Desembolso",
])

/** Linha nas POSIÇÕES do cabeçalho real de hoje. */
export function linhaAgostoReal(l: {
  readonly venc: unknown
  readonly cpf: unknown
  readonly unidade: unknown
  readonly parcelas: unknown
  readonly ticket: unknown
  readonly status: unknown
  readonly desembolso?: unknown
  readonly statusPagamento?: unknown
}): readonly unknown[] {
  const r: unknown[] = new Array(HEADER_AGOSTO_REAL.length).fill("")
  r[0] = l.venc
  r[1] = l.statusPagamento ?? "PG"
  r[2] = "03/08/2026"
  r[3] = "Aluno Sintetico"
  r[4] = l.cpf
  r[5] = l.unidade
  r[6] = "Indicação"
  r[10] = l.parcelas
  r[11] = l.ticket
  r[12] = "Vendedor A"
  r[16] = l.status
  r[17] = l.desembolso ?? ""
  return Object.freeze(r)
}
