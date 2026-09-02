/**
 * A coluna `Venc` da fonte do Lucas, classificada sem nunca completar informação.
 *
 * ─── O que a coluna realmente é ───────────────────────────────────────────────
 *
 * A Fase 2.10 mediu os dois meses reais. `Venc` acumula **data e situação na mesma
 * célula**:
 *
 *   `08/09`  data sem ano
 *   `PG`     pago — a data original foi SUBSTITUÍDA
 *   `-`      vazio; em julho correlaciona 1:1 com status `C`
 *
 * Em julho, 13 de 24 linhas (54%) já eram `PG`. A data original não é recuperável
 * dessas linhas: não está escondida, foi sobrescrita.
 *
 * ─── Por que cinco estados e não "data ou nulo" ───────────────────────────────
 *
 * Porque as quatro ausências têm causas diferentes e respostas diferentes:
 *
 *   `27/08`  a fonte deu a informação, incompleta        → pedir o ano
 *   `PG`     a fonte deu OUTRA informação, deliberada    → pedir coluna separada
 *   `-`      a fonte não tem                             → pode ser legítimo (cancelado)
 *   `13/13`  a fonte tentou dar e errou                  → corrigir a célula
 *
 * Colapsar as quatro em `null` produz um contador de "faltando" que mistura
 * "precisamos de uma coluna nova" com "alguém digitou errado". São conversas
 * diferentes com o Lucas.
 *
 * ─── A regra que nenhum ramo viola ────────────────────────────────────────────
 *
 * `raw_venc` é preservado sempre que existe, e nenhum ramo inventa data. Em
 * particular, `incomplete` NÃO recebe o ano do período: um contrato de dezembro com
 * vencimento `05/01` é do ano seguinte, e inferir pelo período o colocaria onze
 * meses no passado. O erro seria invisível — a data pareceria perfeitamente válida.
 */

import { parseCivilDateStrict } from "../../../detectors/src/civil-date"

/**
 * Sentinelas observados na fonte que NÃO são tentativas de escrever data.
 *
 * `PG` significa "pago" e é informação de negócio legítima ocupando a coluna
 * errada. Comparação por forma normalizada (sem espaço, caixa alta) porque a
 * planilha é digitada à mão.
 *
 * Este conjunto é FECHADO e governado. Um sentinela novo que apareça na fonte cai
 * em `invalid`, que é o comportamento certo: alguém precisa olhar e decidir, em vez
 * de o código adivinhar que é mais um jeito de dizer "pago".
 */
const SENTINELA_PAGO: Readonly<Record<string, true>> = Object.freeze({ PG: true })

/** Formas que significam "a célula está vazia". Traço isolado é uma delas. */
const SENTINELA_VAZIO: Readonly<Record<string, true>> = Object.freeze({
  "-": true,
  "--": true,
  "—": true,
  "–": true,
})

/** `DD/MM` ou `D/M`, sem ano. Separador `/` ou `-`, consistente nos dois lados. */
const SEM_ANO = /^(\d{1,2})([/-])(\d{1,2})$/

/**
 * Estado do primeiro vencimento de uma linha. União FECHADA.
 *
 * Só o ramo `available` tem `first_due_date`. Não é convenção — é o tipo: não
 * existe onde escrever uma data nos outros quatro ramos, então "completar
 * silenciosamente" não é uma escolha ruim disponível, é erro de compilação.
 */
export type VencClassification =
  | {
      readonly state: "available"
      readonly raw_venc: string
      /** Canônica `AAAA-MM-DD`, produzida por `parseCivilDateStrict`. */
      readonly first_due_date: string
    }
  | { readonly state: "incomplete"; readonly raw_venc: string }
  | { readonly state: "not_available_as_date"; readonly raw_venc: string }
  | { readonly state: "missing"; readonly raw_venc: string | null }
  | { readonly state: "invalid"; readonly raw_venc: string }

/** Normaliza só para COMPARAR sentinela. O valor bruto devolvido nunca é este. */
const paraComparar = (s: string): string => s.replace(/\s+/gu, " ").trim().toUpperCase()

/**
 * Classifica o valor de `Venc` exatamente como a fonte o entregou.
 *
 * Ordem das checagens, e por que:
 *
 *   1. ausência real       antes de tudo — não há string para preservar
 *   2. sentinela de vazio  `-` não é data inválida, é célula vazia
 *   3. sentinela de pago   `PG` é outra semântica, não data errada
 *   4. data COMPLETA       o caminho bom; usa o parser governado
 *   5. sem ano             a fonte deu, incompleta
 *   6. resto               inválido
 *
 * Trocar 4 e 5 não muda nada — `27/08` não casa com data completa e `27/08/2026`
 * não casa com `SEM_ANO`. Mas trocar 2/3 com 6 mudaria: `-` e `PG` passariam a ser
 * reportados como dado corrompido, e não são.
 */
export function classifyVenc(raw: unknown): VencClassification {
  if (raw === null || raw === undefined) return { state: "missing", raw_venc: null }

  // Número aqui seria serial de planilha, e serial não declara epoch: o mesmo
  // 45900 é uma data diferente no Sheets e no Excel de 1900 vs 1904. Preservamos
  // a representação e recusamos interpretar.
  const bruto = typeof raw === "string" ? raw : String(raw)
  if (bruto.trim() === "") return { state: "missing", raw_venc: bruto === "" ? null : bruto }

  const chave = paraComparar(bruto)

  if (chave in SENTINELA_VAZIO) return { state: "missing", raw_venc: bruto }
  if (chave in SENTINELA_PAGO) return { state: "not_available_as_date", raw_venc: bruto }

  // Parser governado: casamento TOTAL, calendário real, sem `new Date(string)`.
  // Aceita `AAAA-MM-DD` e `DD/MM/AAAA` — as duas formas completas que a operação
  // usa. Ano de dois dígitos não passa, e é isso que se quer: `27/08/26` é
  // ambíguo entre 1926 e 2026 e cai em `invalid`, não em data.
  const canonica = parseCivilDateStrict(bruto.trim())
  if (canonica !== null) {
    return { state: "available", raw_venc: bruto, first_due_date: canonica }
  }

  if (SEM_ANO.test(bruto.trim())) return { state: "incomplete", raw_venc: bruto }

  return { state: "invalid", raw_venc: bruto }
}

/** O fato de qualidade correspondente, ou `null` quando a data está disponível. */
export function vencQualityFact(
  c: VencClassification,
):
  | "FIRST_DUE_DATE_INCOMPLETE"
  | "FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE"
  | "FIRST_DUE_DATE_MISSING"
  | "FIRST_DUE_DATE_INVALID"
  | null {
  switch (c.state) {
    case "available":
      return null
    case "incomplete":
      return "FIRST_DUE_DATE_INCOMPLETE"
    case "not_available_as_date":
      return "FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE"
    case "missing":
      return "FIRST_DUE_DATE_MISSING"
    case "invalid":
      return "FIRST_DUE_DATE_INVALID"
  }
}
