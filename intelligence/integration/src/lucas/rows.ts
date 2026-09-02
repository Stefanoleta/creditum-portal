/**
 * Uma linha da fonte do Lucas normalizada para contrato canônico.
 *
 * ─── O que este módulo NÃO faz ────────────────────────────────────────────────
 *
 * Não calcula KPI, não define "vendas", não agrega e não decide severidade. Ele
 * traduz uma linha da planilha para os tipos que os detectores já aprovados
 * consomem, e registra o que não deu para traduzir. Toda decisão comercial fica
 * na fonte oficial; toda decisão de política fica no artefato governado.
 *
 * ─── Ausente nunca é zero ─────────────────────────────────────────────────────
 *
 * Todo campo numérico é `number | null`. Os parsers reutilizados
 * (`parseBRLToCents`, `parseCpf`) já devolvem `null` para ausente e para inválido,
 * e este módulo separa as duas coisas com um fato de qualidade — porque
 * "célula vazia" e `R$ --` exigem conversas diferentes com o Lucas.
 *
 * O anti-padrão que isto substitui está no workflow atual: `Number("R$ 410,00")`
 * devolve `NaN`, e `NaN || 0` devolve `0`. Um contrato de R$ 410 vira R$ 0 e entra
 * no ticket médio.
 *
 * ─── PII ──────────────────────────────────────────────────────────────────────
 *
 * O CPF entra, produz `subject_ref` e NÃO sai. Nenhum campo do resultado carrega
 * CPF, nome, telefone ou e-mail. `subject_ref` é derivado por `structuralId`, o
 * mecanismo determinístico que os detectores já usam para identidade estrutural —
 * não há hash caseiro aqui.
 */

import { deepFreeze } from "../../../gateway/src/immutability"
import { structuralId } from "../../../detectors/src/structural-id"
import { canonicalizeUnit } from "../../../detectors/src/canonical-units"
import type { CanonicalUnitResult, UnitIndex, UnitNormalizerPort } from "../../../detectors/src/canonical-units"
import { parseBRLToCents, parseCount, parseCpf } from "../../../detectors/src/engine"
import { classifyVenc, vencQualityFact } from "./venc"
import type { VencClassification } from "./venc"
import { cell } from "./header-mapping"
import type { HeaderMap } from "./header-mapping"
import type { RowQualityFact } from "./source-quality"
import { resolveDeadline } from "./deadline"
import type { DeadlineResolution } from "./deadline"
import type { SheetCell } from "./drive-port"

/** Vocabulário oficial de status. Fechado — a legenda está na própria aba. */
export type LucasStatus = "E" | "A" | "P" | "C"

const STATUS: Readonly<Record<LucasStatus, true>> = Object.freeze({
  E: true,
  A: true,
  P: true,
  C: true,
})

export const LUCAS_STATUSES: readonly LucasStatus[] = Object.freeze(
  Object.keys(STATUS).sort() as LucasStatus[],
)

/**
 * Identidade operacional. `CPF + período`, provada na Fase 2.10.
 *
 * O ramo ausente não tem `subject_ref`: sem CPF não há identidade, e um
 * `subject_ref` derivado de linha vazia seria um pseudônimo que não identifica
 * ninguém e colidiria com todas as outras linhas vazias.
 */
export type RowIdentity =
  | {
      readonly status: "identified"
      readonly subject_ref: string
      /** `exact` quando os 11 dígitos vieram; `recovered` quando o zero foi reposto. */
      readonly confidence: "exact" | "recovered"
    }
  | { readonly status: "identity_missing" }

/**
 * Desconto governado, em basis points.
 *
 * A fonte grafa percentual inteiro (`15`, `20`, `25`, `30`). `15 → 1500 bp`. Um
 * valor fracionário como `15,5` é aceito e converte exato (1550) porque bp tem
 * resolução para isso; o que não passa é fração menor que 1 bp, que indicaria outra
 * unidade na célula.
 */
export type DiscountResult =
  | { readonly status: "available"; readonly discount_bp: number }
  | { readonly status: "missing" }
  | { readonly status: "invalid" }

/** Uma linha normalizada, pronta para virar entrada de detector. */
export interface LucasContractRow {
  /** Localizador dentro do arquivo. Instável entre coletas, útil dentro de um. */
  readonly row_number: number
  readonly identity: RowIdentity
  readonly status: LucasStatus | null
  readonly raw_status: string | null
  /** Preservado sempre — a fonte manda, mesmo quando não resolve. */
  readonly raw_unit_label: string | null
  /** Resolvida por D13 de produção. Nunca por heurística local. */
  readonly unit: CanonicalUnitResult
  readonly installment_count: number | null
  readonly ticket_cents: number | null
  readonly transfer_cents: number | null
  readonly discount: DiscountResult
  readonly venc: VencClassification
  /**
   * Fase 2.13 — prazo de assinatura/emissão, do valor SUBJACENTE de `Desembolso`.
   *
   * Nunca derivado de `venc`, e nunca do texto exibido. `not_evaluable` carrega a
   * razão, porque "sem alerta" e "não deu para avaliar" exigem ações diferentes.
   */
  readonly deadline: DeadlineResolution
  readonly quality: readonly RowQualityFact[]
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/\s+/gu, " ").trim()
  return s === "" ? null : s
}

/**
 * Reconciliação `TICKET` × (`VALOR REPASSE` × `PARCELAS`).
 *
 * Conferiu em 100% das 44 linhas auditadas na Fase 2.10. Serve para DETECTAR
 * divergência, nunca para substituir: se `TICKET` faltar, o resultado é `null` com
 * fato de qualidade, e não o produto calculado. Substituir silenciosamente
 * transformaria uma célula esquecida num número que ninguém sabe que foi inventado.
 */
function reconciliar(
  ticket_cents: number | null,
  transfer_cents: number | null,
  parcelas: number | null,
): boolean {
  if (ticket_cents === null || transfer_cents === null || parcelas === null) return true
  return ticket_cents === transfer_cents * parcelas
}

function classificarDesconto(bruto: unknown): DiscountResult {
  if (bruto === null || bruto === undefined || String(bruto).trim() === "") {
    return { status: "missing" }
  }

  const s = String(bruto).trim().replace("%", "").replace(",", ".").trim()
  if (s === "") return { status: "missing" }

  const n = Number(s)
  if (!Number.isFinite(n)) return { status: "invalid" }
  // Percentual de desconto fora de [0, 100] não é desconto.
  if (n < 0 || n > 100) return { status: "invalid" }

  const bp = Math.round(n * 100)
  // Resolução: `0,001%` arredondaria para 0 bp e viraria "sem desconto".
  if (n > 0 && bp === 0) return { status: "invalid" }
  return { status: "available", discount_bp: bp }
}

export interface NormalizeRowContext {
  readonly period: string
  readonly headerMap: HeaderMap
  readonly unitIndex: UnitIndex
  readonly normalizer: UnitNormalizerPort
  readonly similarityThresholdBp: number
}

/**
 * Normaliza uma linha. NUNCA descarta: linha ruim vira linha com fatos.
 *
 * `row_number` é 1-based sobre as linhas de dados, não sobre a planilha inteira —
 * quem precisa do endereço da célula soma o offset do cabeçalho, e isso é
 * responsabilidade de quem monta a evidência.
 */
export function normalizeRow(
  row: readonly unknown[],
  /**
   * A célula de prazo DESTA linha, da mesma observação que produziu `row`.
   *
   * `undefined` quando a coluna `Desembolso` não existe no mês. Parâmetro OBRIGATÓRIO
   * de propósito, mesmo aceitando `undefined`: opcional faria um chamador esquecer de
   * passá-lo e todo prazo viraria não-avaliável em silêncio.
   *
   * Recebe a CÉLULA, não a linha: quem localiza a coluna por header é o provider, uma
   * vez, e assim não há segundo lugar capaz de localizá-la de outro jeito.
   */
  deadlineCell: SheetCell | undefined,
  row_number: number,
  ctx: NormalizeRowContext,
): LucasContractRow {
  const quality: RowQualityFact[] = []

  // ─── Identidade ───────────────────────────────────────────────────────────
  const cpf = parseCpf(cell(ctx.headerMap, row, "cpf"))
  let identity: RowIdentity
  if (cpf.digits === null || !cpf.valid) {
    identity = { status: "identity_missing" }
    quality.push("IDENTITY_MISSING")
  } else {
    // `structuralId` sobre dígitos + período: o mesmo CPF no mesmo mês produz o
    // mesmo pseudônimo, e em meses diferentes produz outro — que é exatamente a
    // semântica de `CPF + período` aprovada. O CPF não sobrevive ao retorno.
    identity = {
      status: "identified",
      subject_ref: structuralId(
        "lucas_status_contratos_mensal/subject",
        { cpf: cpf.digits, period: ctx.period },
        "subj",
      ),
      confidence: cpf.recovered ? "recovered" : "exact",
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  const rawStatus = texto(cell(ctx.headerMap, row, "status"))
  const chaveStatus = rawStatus === null ? null : rawStatus.toUpperCase()
  const status = chaveStatus !== null && chaveStatus in STATUS ? (chaveStatus as LucasStatus) : null
  if (status === null) quality.push("INVALID_STATUS")

  // ─── Unidade ──────────────────────────────────────────────────────────────
  const rawUnit = texto(cell(ctx.headerMap, row, "unidade"))
  const unit = canonicalizeUnit(rawUnit, ctx.unitIndex, ctx.normalizer, {
    similarityThresholdBp: ctx.similarityThresholdBp,
  })
  if (unit.status !== "matched") quality.push("UNIT_IDENTITY_UNRESOLVED")

  // ─── Parcelas ─────────────────────────────────────────────────────────────
  const parcelasBruto = cell(ctx.headerMap, row, "parcelas")
  const parcelas = parseCount(parcelasBruto)
  if (parcelas === null || parcelas <= 0) {
    if (parcelasBruto !== null && parcelasBruto !== undefined && String(parcelasBruto).trim() !== "") {
      quality.push("INVALID_INSTALLMENT_COUNT")
    }
  }

  // ─── Ticket e repasse ─────────────────────────────────────────────────────
  const ticketBruto = cell(ctx.headerMap, row, "ticket")
  const ticket_cents = parseBRLToCents(ticketBruto)
  if (
    ticket_cents === null &&
    ticketBruto !== null &&
    ticketBruto !== undefined &&
    String(ticketBruto).trim() !== ""
  ) {
    quality.push("INVALID_TICKET")
  }

  const transfer_cents = parseBRLToCents(cell(ctx.headerMap, row, "valor_repasse"))

  const parcelasValidas = parcelas !== null && parcelas > 0 ? parcelas : null
  if (!reconciliar(ticket_cents, transfer_cents, parcelasValidas)) {
    quality.push("TICKET_RECONCILIATION_MISMATCH")
  }

  // ─── Desconto ─────────────────────────────────────────────────────────────
  const discount = classificarDesconto(cell(ctx.headerMap, row, "desconto_pct"))
  if (discount.status === "invalid") quality.push("INVALID_DISCOUNT")

  // ─── Venc ─────────────────────────────────────────────────────────────────
  const venc = classifyVenc(cell(ctx.headerMap, row, "venc"))
  const fatoVenc = vencQualityFact(venc)
  if (fatoVenc !== null) quality.push(fatoVenc)

  // ─── Prazo (Fase 2.13, célula atômica desde a 2.13a) ──────────────────────
  //
  // A célula vem da MESMA observação que esta linha formatada, então não existe
  // junção entre duas leituras e não existe corrida a verificar. `desembolso` é
  // `OPTIONAL`: coluna ausente é característica do mês, célula vazia é característica
  // do contrato, e as duas produzem razões distintas.
  const colunaPrazo = ctx.headerMap.index["desembolso"]
  const deadline: DeadlineResolution = resolveDeadline(deadlineCell, colunaPrazo !== undefined)

  return deepFreeze({
    row_number,
    identity,
    status,
    raw_status: rawStatus,
    raw_unit_label: rawUnit,
    unit,
    installment_count: parcelasValidas,
    ticket_cents,
    transfer_cents,
    discount,
    venc,
    deadline,
    quality: [...quality].sort(),
  })
}
