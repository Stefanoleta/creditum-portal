/**
 * Imutabilidade em RUNTIME.
 *
 * `readonly` do TypeScript desaparece na compilação: não protege nada em
 * execução. Um consumidor com uma referência ao resultado validado pode
 * reescrever qualquer campo aninhado, e a auditoria passa a descrever algo que o
 * detector nunca produziu.
 *
 * Extraído de `store.ts`, onde já era o mecanismo do hardening da Fase 1. Vive
 * aqui porque agora tem dois consumidores — o store e os detectores — e duplicar
 * um helper provado é como as duas cópias divergem.
 *
 * ─── deepFreeze NÃO é cópia defensiva ─────────────────────────────────────────
 *
 * São duas etapas distintas, e confundi-las quebra as duas:
 *
 *   cópia defensiva  resolve OWNERSHIP: o grafo é do produtor, não do chamador
 *   deepFreeze       resolve MUTABILIDADE: o grafo não muda depois de validado
 *
 * `deepFreeze` congela exatamente o que recebe e devolve a MESMA referência —
 * não copia. Se copiasse, o grafo congelado não seria o grafo que a validação
 * examinou, e a prova valeria para um objeto que ninguém recebe.
 *
 * A consequência é que ownership precisa estar resolvido ANTES: congelar um
 * grafo que ainda referencia estado do chamador congelaria estado do chamador —
 * efeito colateral sobre quem só pediu uma leitura.
 */

/**
 * Congela recursivamente objetos e arrays alcançáveis. Devolve a mesma referência.
 *
 * O `WeakSet` fecha ciclos e evita reprocessar referência compartilhada — sem
 * ele, um grafo cíclico causaria recursão infinita.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return value
}
