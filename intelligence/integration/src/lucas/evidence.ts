/**
 * Evidência de linha e de agregado para a captura do Lucas.
 *
 * ─── Por que este módulo existe ───────────────────────────────────────────────
 *
 * `integration/src/ports.ts` declara `EvidenceBuilder` e `ComputedProvenanceBuilder`
 * e nunca os implementou — não havia fonte real. Sem eles a integração dos
 * detectores é apenas nominal: `low-ticket.ts` recusa qualquer contrato com
 * `evidence_refs` vazio, com a mensagem "nenhum alerta individual sem lastro".
 *
 * Descobri isso rodando a regra governada de verdade em vez de reimplementá-la no
 * teste. Um teste que checasse `ticket_cents < 149999` por conta própria teria
 * passado e escondido que a integração não funcionava.
 *
 * ─── A separação que os ports exigem ──────────────────────────────────────────
 *
 *   observação crua        → `Evidence` kind `row`
 *   cálculo determinístico → `Evidence` kind `computed` + provenance
 *   detector               → VERIFICA; nunca cria
 *
 * Quem calcula grava a identidade da computação. O detector é o único plano que não
 * escreve nada — se ele pudesse produzir a própria prova, a prova não provaria nada.
 *
 * ─── PII ──────────────────────────────────────────────────────────────────────
 *
 * `locator.row_key` é um SHA-256, exigido pelo schema governado
 * (`^[a-f0-9]{64}$`). Descobri o requisito porque o contrato recusou o número de
 * linha cru — e a exigência é deliberada: um localizador em claro num objeto que
 * pode chegar ao modelo é um ponteiro para a linha de uma pessoa.
 *
 * O hash vem de `computeIdentity`, o produtor canônico do portal, não de um
 * `sha256` escrito aqui. Ele já resolve o problema que importa: o escopo inclui o
 * `file_id`, então a linha 42 de agosto e a linha 42 de setembro NÃO produzem o
 * mesmo `row_key` — sem isso o sistema concluiria que uma é edição da outra.
 *
 * `untrusted_excerpt` não é preenchido: a única coisa que valeria citar da linha é o
 * rótulo de unidade, e ele já viaja canonicalizado no contrato. Texto de fonte no
 * caminho do modelo é superfície de injeção, e aqui não há necessidade que a
 * justifique.
 */

import { toEvidence } from "../../../gateway/src/factory"
import type { Evidence, Snapshot } from "../../../gateway/src/types"
import { structuralId } from "../../../detectors/src/structural-id"
import { computeIdentity } from "../../../detectors/src/engine"
import { COUNTERFACTUAL_PROVENANCE_VERSION } from "../../../detectors/src/counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "../../../detectors/src/counterfactual-provenance"
import { counterfactualComputationId } from "../../../detectors/src/material-single-case"
import type { CounterfactualBinding } from "../../../detectors/src/material-single-case"
import type { LucasContractRow } from "./rows"

/**
 * Pseudônimo estável de uma linha SEM identidade de pessoa.
 *
 * O contrato dos detectores exige `subject_ref` casando `^subj_[a-f0-9]{16}$` — a
 * primeira versão deste código produzia `subj_missing_row_1`, que o detector
 * recusava. A forma correta é `structuralId`, o mesmo mecanismo do caso
 * identificado, num DOMÍNIO diferente.
 *
 * O domínio separado é o que importa: um pseudônimo de linha e um de pessoa nunca
 * colidem, e nunca se confundem. Este identifica "a linha 7 desta captura" — serve
 * para rastrear dentro do período e deliberadamente NÃO serve para reconhecer a
 * mesma pessoa em outro mês, que é a propriedade certa para uma linha sem CPF.
 */
export function rowSubjectRef(dataset_id: string, period: string, row_number: number): string {
  return structuralId(
    "lucas_status_contratos_mensal/row_without_identity",
    { dataset_id, period, row_number },
    "subj",
  )
}

/** O `subject_ref` de uma linha: da pessoa quando há CPF, da linha quando não há. */
export function subjectRefOf(l: LucasContractRow, dataset_id: string, period: string): string {
  return l.identity.status === "identified"
    ? l.identity.subject_ref
    : rowSubjectRef(dataset_id, period, l.row_number)
}

/**
 * Evidência de OBSERVAÇÃO de uma linha. Único produtor de `evidence_id` de linha.
 *
 * `observed_at` é o `observed_at` do snapshot — quando a FONTE foi observada, não
 * quando nós lemos. Usar o relógio da coleta aqui faria a evidência afirmar que
 * observou a planilha no instante da ingestão, o que é falso: a planilha foi
 * modificada antes.
 */
export function rowKeyFor(file_id: string, sheet: string, row_number: number): string {
  return computeIdentity(
    "google_sheets",
    file_id,
    sheet,
    { row: row_number },
    // `values` vazio de propósito: aqui queremos a identidade da POSIÇÃO, não do
    // conteúdo. `contentHash` e `sourceRecordId` respondem outras perguntas, e
    // misturá-las faria o `row_key` mudar quando alguém corrigisse uma célula —
    // quebrando o vínculo entre o contrato e a prova dele.
    {},
  ).rowKey
}

export function evidenceForRow(
  snapshot: Snapshot,
  row_number: number,
  file_id: string,
  sheet: string,
): Evidence {
  return toEvidence(
    {
      evidence_id: structuralId(
        "lucas/evidence_row",
        { snapshot_id: snapshot.snapshot_id, row_number },
        "ev",
      ),
      snapshot_id: snapshot.snapshot_id,
      kind: "row",
      locator: {
        dataset_id: snapshot.dataset_id,
        sheet,
        row_key: rowKeyFor(file_id, sheet, row_number),
      },
      observed_at: snapshot.observed_at,
    },
    { now: new Date(snapshot.ingested_at) },
  )
}

/** Evidência de AGREGADO, que sustenta os números somados sobre a população. */
export function evidenceForAggregate(
  snapshot: Snapshot,
  formula: string,
): { readonly evidence: Evidence; readonly provenance: ComputedEvidenceProvenance } {
  const computation_id = structuralId(
    "lucas/computation",
    { snapshot_id: snapshot.snapshot_id, formula },
    "cmp",
  )
  const evidence = toEvidence(
    {
      evidence_id: structuralId(
        "lucas/evidence_aggregate",
        { snapshot_id: snapshot.snapshot_id, computation_id },
        "ev",
      ),
      snapshot_id: snapshot.snapshot_id,
      kind: "computed",
      locator: { dataset_id: snapshot.dataset_id },
      observed_at: snapshot.observed_at,
      formula,
    },
    { now: new Date(snapshot.ingested_at) },
  )
  return {
    evidence,
    provenance: {
      evidence_ref: evidence.evidence_id,
      computation_id,
      provenance_version: COUNTERFACTUAL_PROVENANCE_VERSION,
    },
  }
}

export interface LucasEvidenceSet {
  readonly rowEvidence: readonly Evidence[]
  readonly aggregate: Evidence
  readonly aggregateProvenance: ComputedEvidenceProvenance
  /** Todas juntas, que é o formato que a entrada dos detectores pede. */
  readonly all: readonly Evidence[]
  /** `row_number` → `evidence_id`, para casar contrato com a prova dele. */
  readonly byRow: ReadonlyMap<number, string>
}

/**
 * Constrói o conjunto completo de evidência de uma captura.
 *
 * Uma evidência de linha para CADA linha, inclusive as que têm fato de qualidade:
 * uma linha problemática precisa de prova mais do que uma boa, porque é sobre ela
 * que alguém vai perguntar.
 */
export function buildEvidenceSet(
  snapshot: Snapshot,
  rows: readonly LucasContractRow[],
  file_id: string,
  sheet: string,
  formula: string,
): LucasEvidenceSet {
  const rowEvidence = rows.map((l) => evidenceForRow(snapshot, l.row_number, file_id, sheet))
  const { evidence: aggregate, provenance } = evidenceForAggregate(snapshot, formula)
  const byRow = new Map<number, string>()
  for (const [i, l] of rows.entries()) {
    const ev = rowEvidence[i]
    if (ev !== undefined) byRow.set(l.row_number, ev.evidence_id)
  }
  return {
    rowEvidence,
    aggregate,
    aggregateProvenance: provenance,
    all: [...rowEvidence, aggregate],
    byRow,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.12 — evidência CONTRAFACTUAL, uma por candidato
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Evidência do agregado SEM um candidato específico.
 *
 * ─── Por que uma por candidato, e não uma reutilizável ────────────────────────
 *
 * O contrato do Detector D é explícito: cada agregado sem um item é um número
 * DIFERENTE, que nenhuma fonte publicou, e uma evidência só pode provar UMA dessas
 * computações. A versão que o gate da Fase 2.4 rejeitou reusava uma evidência global
 * para todos os candidatos — uma prova cuja fórmula dizia "soma sem X" sustentava
 * também o evento de Y, e o executivo leria um número calculado para outro caso.
 *
 * Por isso `evidenceForCounterfactual` recebe o `subject_ref` e o carrega na
 * identidade da evidência. Duas exclusões diferentes não podem colidir.
 *
 * ─── A âncora não é opcional ──────────────────────────────────────────────────
 *
 * `counterfactualComputationId` é do detector, e é ele que define a identidade da
 * COMPUTAÇÃO a partir do binding estruturado. Quem calcula grava a âncora
 * `evidence_ref → computation_id`; o detector apenas confere. Se este módulo
 * inventasse o `computation_id`, a âncora não ancoraria nada — foi o furo que a Fase
 * 2.4 fechou.
 */
export function evidenceForCounterfactual(
  snapshot: Snapshot,
  binding: CounterfactualBinding,
): { readonly evidence: Evidence; readonly provenance: ComputedEvidenceProvenance } {
  // O `computation_id` vem do PRODUTOR CANÔNICO do detector, sobre o binding
  // estruturado. Nada aqui compõe identidade de computação por conta própria.
  const computation_id = counterfactualComputationId(binding)
  const evidence = toEvidence(
    {
      evidence_id: structuralId(
        "lucas/evidence_counterfactual",
        { snapshot_id: snapshot.snapshot_id, computation_id },
        "ev",
      ),
      snapshot_id: snapshot.snapshot_id,
      kind: "computed",
      locator: { dataset_id: snapshot.dataset_id },
      observed_at: snapshot.observed_at,
      // A fórmula é PROSA descritiva, não autoridade de associação — o binding
      // estruturado é. Ela existe para quem lê a evidência entender o que foi feito.
      formula: `${binding.aggregator}(${binding.metric}) sobre a população, excluindo o sujeito`,
    },
    { now: new Date(snapshot.ingested_at) },
  )
  return {
    evidence,
    provenance: {
      evidence_ref: evidence.evidence_id,
      computation_id,
      provenance_version: COUNTERFACTUAL_PROVENANCE_VERSION,
    },
  }
}
