/**
 * `AAAA-MM` → nome do arquivo mensal do Lucas.
 *
 * ─── Por que uma tabela e não `Intl` ──────────────────────────────────────────
 *
 * `toLocaleString("pt-BR", { month: "long" })` devolveria "agosto" nesta máquina e
 * pode devolver "August" noutra, porque depende do ICU compilado no runtime e da
 * locale do processo. O nome do arquivo é IDENTIDADE da fonte: se ele varia com o
 * ambiente, a ingestão passa a não encontrar a planilha em produção e a encontrar
 * no laptop de quem escreveu o código.
 *
 * A tabela é literal, ordenada por mês, e o índice é o próprio número do mês.
 * Nada aqui consulta o sistema.
 *
 * ─── Capitalização ────────────────────────────────────────────────────────────
 *
 * A fonte real grafa `Novos Alunos - Agosto` e `Novos Alunos - Julho` — mês
 * capitalizado. Foi verificado nos dois arquivos observados na Fase 2.10. A
 * comparação de nome NÃO usa esta forma diretamente: quem compara normaliza os
 * dois lados (ver `file-selection.ts`), porque exigir caixa exata deixaria a
 * ingestão à mercê de alguém renomear para "novos alunos - agosto".
 */

/** Nome do mês em português, indexado por número do mês. Índice 0 não existe. */
const MESES: readonly string[] = Object.freeze([
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
])

/** `AAAA-MM` estrito. O mesmo domínio de `period` que `expected_units` governa. */
const PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Prefixo governado do nome do arquivo mensal. */
export const LUCAS_FILE_PREFIX = "Novos Alunos - "

export interface PeriodParts {
  readonly year: number
  readonly month: number
}

/**
 * Valida e decompõe o período. `null` para qualquer coisa fora do domínio.
 *
 * Não aceita `2026-8`, `2026/08` nem `08-2026`. Um período mal formado que
 * passasse daqui viraria nome de arquivo errado, e nome errado vira
 * `DATA_NOT_AVAILABLE` — ou seja, "o Lucas não entregou o mês" quando o defeito
 * era nosso.
 */
export function parsePeriod(period: string): PeriodParts | null {
  const m = PERIODO.exec(period)
  if (m === null) return null
  const [, y, mm] = m
  if (y === undefined || mm === undefined) return null
  return { year: Number(y), month: Number(mm) }
}

/** Nome do mês em português para um mês 1..12. Fora da faixa devolve `null`. */
export function monthNamePtBr(month: number): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return MESES[month] ?? null
}

/**
 * Nome esperado do arquivo oficial para o período.
 *
 * `2026-08` → `Novos Alunos - Agosto`
 */
export function expectedFileName(period: string): string | null {
  const parts = parsePeriod(period)
  if (parts === null) return null
  const nome = monthNamePtBr(parts.month)
  if (nome === null) return null
  return `${LUCAS_FILE_PREFIX}${nome}`
}

/**
 * Limites civis do período, no formato que o Snapshot governado exige.
 *
 * Fim do mês pela regra real de calendário — `Date.UTC(y, m, 0)` devolve o último
 * dia do mês anterior ao índice, que com `m` já 1-based é o último dia de `m`.
 * Fevereiro bissexto sai correto sem tabela própria.
 */
export function periodBounds(period: string): { start: string; end: string } | null {
  const parts = parsePeriod(period)
  if (parts === null) return null
  const { year, month } = parts
  const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, "0")
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(ultimo).padStart(2, "0")}`,
  }
}
