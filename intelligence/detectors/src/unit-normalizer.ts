/**
 * `UnitNormalizerPort` de PRODUÇÃO, sobre o motor do portal.
 *
 * Adaptador de assinatura, não de comportamento: `canonicalSchoolKey` e
 * `similarity` são chamadas diretamente, sem envolver nenhuma regra nova.
 *
 * O que vem de graça, e é o motivo de reutilizar em vez de reescrever:
 *
 *   · prefixo institucional `Grau` removido
 *   · abreviações regulares expandidas (`Sta`→`Santa`, `Jd`→`Jardim`…)
 *   · acento, caixa, espaço duplo, zero-width e NBSP normalizados
 *   · veto estrutural de D12 — contagem de palavras diferente e nenhuma palavra
 *     em comum devolve 0, que é o que separa `santos` de `santo amaro`
 *   · limiar de 0,80 calibrado contra `alecrim/alecrin` e `limeira/limoeiro`
 *
 * Nenhuma dessas regras é reimplementada aqui. Se fossem, existiriam duas
 * verdades sobre identidade de unidade no repositório — e a que estivesse errada
 * seria descoberta por uma unidade recebendo os números de outra.
 */

import { canonicalSchoolKey, similarity } from "./engine"
import type { UnitNormalizerPort } from "./canonical-units"

export const ENGINE_UNIT_NORMALIZER: UnitNormalizerPort = {
  comparableKey: canonicalSchoolKey,
  similarity,
}
