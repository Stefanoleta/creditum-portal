/**
 * Os valores de negócio, DERIVADOS do artefato governado.
 *
 * ─── Por que este módulo existe ───────────────────────────────────────────────
 *
 * Até a Fase 2.7c, `APPROVED_THRESHOLDS` e `BUSINESS_TIMEZONE` eram literais em
 * `config.ts`. O artefato governado tinha os mesmos números, e a igualdade entre
 * as duas fontes era coincidência mantida por atenção humana: nada impedia que
 * alguém editasse o JSON e o runtime continuasse rodando com o literal antigo,
 * ou o contrário. Dois valores executáveis concorrentes para a mesma decisão é
 * exatamente o defeito que a Fase 2.6c encontrou nos aliases D13.
 *
 * Aqui não há número escrito. Cada constante é uma leitura de
 * `governance/policy/creditum-policy.v1.json`. Editar o artefato move o runtime;
 * não existe segundo lugar para editar.
 *
 * ─── Por que separado de `production-policy.ts` ───────────────────────────────
 *
 * `production-policy.ts` importa `config.ts` (tipos, `validateDetectorConfig`,
 * `isValidTimezone`). Se `config.ts` importasse `production-policy.ts` de volta,
 * o ciclo faria a inicialização de módulo depender da ordem de resolução — e
 * constantes de topo de módulo num ciclo ESM podem ser lidas como `undefined`.
 *
 * Este módulo não importa nem `config.ts` nem `production-policy.ts`. É a raiz
 * da leitura, e os dois pendem dele.
 *
 * ─── O que ele NÃO é ──────────────────────────────────────────────────────────
 *
 * Não é o validador da política. A validação completa — bandas monotônicas,
 * estratégias fechadas, janelas aprovadas, coerência entre blocos — vive em
 * `production-policy.ts` e continua sendo a autoridade. Aqui só existe o mínimo
 * que impede um artefato corrompido de virar `NaN` silencioso no runtime.
 */

import ARTEFATO from "../../governance/policy/creditum-policy.v1.json"
import { GatewayError } from "../../gateway/src/errors"

type Doc = Record<string, unknown>

const doc = ARTEFATO as unknown as Doc

function objeto(pai: Doc, campo: string, caminho: string): Doc {
  const v = pai[campo]
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new GatewayError("NOT_ALLOWED", "Artefato de política ilegível", [
      `${caminho}: bloco obrigatório ausente ou malformado`,
    ])
  }
  return v as Doc
}

/** Inteiro exato, positivo. Fecha fechado — nenhum valor é presumido. */
function inteiro(pai: Doc, campo: string, caminho: string): number {
  const v = pai[campo]
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) {
    throw new GatewayError("NOT_ALLOWED", "Artefato de política ilegível", [
      `${caminho}: inteiro exato positivo obrigatório`,
    ])
  }
  return v
}

function texto(pai: Doc, campo: string, caminho: string): string {
  const v = pai[campo]
  if (typeof v !== "string" || v.length === 0) {
    throw new GatewayError("NOT_ALLOWED", "Artefato de política ilegível", [
      `${caminho}: string não vazia obrigatória`,
    ])
  }
  return v
}

const materialidade = objeto(doc, "materiality", "materiality")
const lowTicket = objeto(doc, "low_ticket", "low_ticket")
const configDeDetectores = objeto(doc, "detector_config", "detector_config")
const motor = objeto(configDeDetectores, "engine", "detector_config.engine")
const parcelamento = objeto(
  configDeDetectores,
  "installment_concentration",
  "detector_config.installment_concentration",
)

/**
 * Os valores aprovados da Creditum, projetados do artefato.
 *
 * O nome e a forma são os de sempre — os consumidores não mudaram. O que mudou é
 * de onde os números vêm: nenhum está escrito aqui.
 */
export const APPROVED_THRESHOLDS = Object.freeze({
  /** Briefing do Bloco 1, §14 Caso A: "contratos com mais de 19 parcelas". */
  installment_threshold: inteiro(
    parcelamento,
    "installment_threshold",
    "detector_config.installment_concentration.installment_threshold",
  ),

  /** Participação relevante. */
  material_share_bp: inteiro(
    materialidade,
    "relevant_participation_bp",
    "materiality.relevant_participation_bp",
  ),

  /** Valor financeiro relevante. Aprovado como inicial/calibrável. */
  material_amount_cents: inteiro(
    materialidade,
    "financial_materiality_cents",
    "materiality.financial_materiality_cents",
  ),

  /** Quantidade relevante de casos. */
  material_count: inteiro(materialidade, "relevant_case_count", "materiality.relevant_case_count"),

  /** População mínima para o detector afirmar concentração. */
  minimum_sample_size: inteiro(
    materialidade,
    "minimum_population_contracts",
    "materiality.minimum_population_contracts",
  ),

  /** Piso de ticket baixo. A comparação é ESTRITAMENTE menor. */
  low_ticket_floor_cents: inteiro(lowTicket, "floor_cents", "low_ticket.floor_cents"),

  /** Limiar de similaridade do D13. */
  similarity_threshold_bp: inteiro(
    motor,
    "similarity_threshold_bp",
    "detector_config.engine.similarity_threshold_bp",
  ),
})

/** Fuso de negócio. Nunca o fuso da máquina. */
export const BUSINESS_TIMEZONE = texto(
  motor,
  "business_timezone",
  "detector_config.engine.business_timezone",
)
