/**
 * Âncora GOVERNADA entre uma evidência calculada e a computação que ela documenta.
 *
 * ─── O limite de confiança que este módulo existe para marcar ──────────────────
 *
 * Três coisas diferentes, e nenhuma delas basta sozinha:
 *
 *   CounterfactualBinding      PEDIDO do chamador: "valide a computação C, e ela
 *                              está documentada em E". É afirmação, não prova.
 *
 *   ComputedEvidenceProvenance ÂNCORA governada: "a evidência E documenta a
 *                              computação C". Produzida por quem CRIOU a
 *                              evidência calculada, não por quem a consome.
 *
 *   Evidence                   REGISTRO/localizador do dado calculado.
 *
 * O gate da Fase 2.4 encontrou o furo exato que a ausência da segunda deixava.
 * Com um único candidato Y na execução, o chamador montava um binding
 * perfeitamente coerente para Y — sujeito, métrica, agregador, período e escopo
 * todos corretos — apontando para a evidência do contrafactual de X. As checagens
 * de unicidade entre candidatos não viam nada, porque X não estava na execução. O
 * evento executivo de Y saía carregando a prova de outro caso.
 *
 * Validar o binding contra a computação que o detector executa não fecha isso: as
 * duas pontas vêm do mesmo lado. Falta um dado que o consumidor não escreve.
 *
 * ─── Onde isso vai viver ──────────────────────────────────────────────────────
 *
 * No plano de INGESTÃO. Quem calcula "a soma sem o caso X" grava, junto da
 * evidência `computed`, a identidade da computação que produziu aquele número.
 * O plano de consulta apenas confere.
 *
 * Nesta POC a coleção chega como entrada governada e é validada em runtime aqui —
 * `evidence.schema.json` NÃO muda, porque `Evidence` é contrato de localização de
 * dado, compartilhado por todos os consumidores, e não precisa carregar semântica
 * de contrafactual para todos eles. Quando a ingestão existir, esta estrutura é o
 * formato do registro persistido, e a validação abaixo é a mesma.
 *
 * ─── Cardinalidade ────────────────────────────────────────────────────────────
 *
 * Uma `evidence_ref` documenta UMA `computation_id`. O inverso é permitido: a
 * mesma computação lógica pode ter várias evidências ao longo do tempo, porque
 * reingerir o mesmo dataset lógico recalcula o mesmo número e grava um registro
 * novo. Isso NÃO é uma evidência provando duas computações — é a mesma computação
 * documentada duas vezes.
 */

import { GatewayError } from "../../gateway/src/errors"

/** Versão do contrato de provenance. Versão desconhecida é recusa, não tentativa. */
export const COUNTERFACTUAL_PROVENANCE_VERSION = "1.0.0"

/** Padrão de `counterfactualComputationId`. Conferido, nunca presumido. */
const COMPUTATION_ID = /^cfc_[a-f0-9]{16}$/
const IDENTIFIER = /^[a-z0-9][a-z0-9_.:-]{2,127}$/

export interface ComputedEvidenceProvenance {
  /** A evidência `computed` cuja procedência este registro declara. */
  readonly evidence_ref: string
  /** A computação que aquela evidência documenta. */
  readonly computation_id: string
  readonly provenance_version: string
}

/**
 * Valida a coleção e devolve o índice `evidence_ref → computation_id`.
 *
 * Aceitar a estrutura sem validar seria trocar um dado forjável por outro: o
 * chamador passaria um registro inventado e a âncora não ancoraria nada. Falha
 * fechada com TODOS os problemas de uma vez, como o resto do POC.
 */
export function indexCounterfactualProvenance(
  registros: readonly ComputedEvidenceProvenance[],
): ReadonlyMap<string, string> {
  const problemas: string[] = []
  const indice = new Map<string, string>()

  for (const [i, r] of registros.entries()) {
    const onde = `counterfactual_provenance[${i}]`

    if (typeof r.provenance_version !== "string") {
      problemas.push(`${onde}: provenance_version obrigatória`)
      continue
    }
    if (r.provenance_version !== COUNTERFACTUAL_PROVENANCE_VERSION) {
      problemas.push(
        `${onde}: versão "${r.provenance_version}" desconhecida; suportada: ${COUNTERFACTUAL_PROVENANCE_VERSION}`,
      )
      continue
    }
    if (typeof r.evidence_ref !== "string" || !IDENTIFIER.test(r.evidence_ref)) {
      problemas.push(`${onde}: evidence_ref inválida`)
      continue
    }
    if (typeof r.computation_id !== "string" || !COMPUTATION_ID.test(r.computation_id)) {
      problemas.push(`${onde}: computation_id fora do formato cfc_<16 hex>`)
      continue
    }

    const existente = indice.get(r.evidence_ref)
    if (existente !== undefined && existente !== r.computation_id) {
      // Uma evidência calculada registra UM número. Dois registros discordando
      // sobre qual computação ela documenta significa que ao menos um é falso —
      // e não há como escolher entre eles.
      problemas.push(
        `${onde}: evidência ${r.evidence_ref} já ancorada em ${existente}; conflito com ${r.computation_id}`,
      )
      continue
    }
    // Registro idêntico repetido é inofensivo: a mesma afirmação duas vezes.
    indice.set(r.evidence_ref, r.computation_id)
  }

  if (problemas.length > 0) {
    throw new GatewayError("SCHEMA_INVALID", "Provenance de evidência calculada inválida", problemas)
  }

  return indice
}
