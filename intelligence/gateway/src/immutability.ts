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
 *
 * `defensiveCopy` é a etapa que este parágrafo pedia e que faltava existir.
 */

import { types } from "node:util"

/**
 * Detecção de `Proxy` pelo caminho canônico do runtime.
 *
 * `util.types.isProxy` é a única forma confiável — heurística inventada erraria nos dois
 * sentidos. Um `Proxy` não é dado canônico: qualquer leitura dele pode executar código
 * do chamador, que é exatamente o que este módulo existe para não fazer.
 */
const isProxy = (v: object): boolean => types.isProxy(v)

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

/**
 * Cópia defensiva de um grafo de dados de contrato. Resolve OWNERSHIP.
 *
 * ─── Por que ela existe ───────────────────────────────────────────────────────
 *
 * O parágrafo acima já dizia a regra: ownership antes de congelar. Faltava a peça que
 * a cumpre. Sem ela, quem quisesse um objeto validado e imutável só tinha `deepFreeze`,
 * que congela EXATAMENTE o que recebe — e recebendo objeto do chamador, congela o
 * chamador. `Object.freeze` é mutação: não muda valor, muda `writable`, `extensible` e
 * `frozen`, e isso é observável de fora.
 *
 * Foi assim que a Fase 3.0c passou a congelar as observações que recebia. A defesa é
 * copiar primeiro.
 *
 * ─── O que ela copia ─────────────────────────────────────────────────────────
 *
 * Objetos simples e arrays, recursivamente. É o suficiente e o correto para dado de
 * contrato: o que atravessa os schemas é JSON, e nada mais. `Map`, `Set`, `Date`,
 * `RegExp` e classe não são dado de contrato — copiá-los "quase certo" produziria um
 * grafo que parece igual e não é. Se um dia aparecerem, o lugar de tratá-los é aqui, de
 * propósito.
 *
 * O `Map` de visitados preserva compartilhamento e fecha ciclos: duas referências ao
 * mesmo objeto continuam sendo duas referências ao mesmo objeto na cópia. Sem ele, um
 * grafo cíclico causaria recursão infinita — o mesmo motivo do `WeakSet` de `deepFreeze`.
 */
export function defensiveCopy<T>(value: T, seen: Map<object, unknown> = new Map()): T {
  if (value === null || typeof value !== "object") return value
  const existente = seen.get(value)
  if (existente !== undefined) return existente as T
  if (Array.isArray(value)) {
    const copia: unknown[] = []
    seen.set(value, copia)
    for (const item of value) copia.push(defensiveCopy(item, seen))
    return copia as unknown as T
  }
  const copia: Record<string, unknown> = {}
  seen.set(value, copia)
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    copia[k] = defensiveCopy(v, seen)
  }
  return copia as unknown as T
}

/**
 * Recusa. Símbolo próprio porque `null` é valor VÁLIDO de dado canônico — usar `null`
 * como sinal de erro confundiria "recusei" com "capturei um null".
 */
const RECUSA = Symbol("snapshot_recusado")

/**
 * Instantâneo PRÓPRIO de dado canônico, sem executar acessor algum.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * Validar e depois reler o objeto do chamador supõe que ele seja dado estável. Um
 * objeto JS não é. Com um getter:
 *
 *   1ª leitura de observation_id  →  "obs_a"
 *   2ª leitura de observation_id  →  "obs_b"
 *
 * O vínculo sairia com a referência de um conteúdo e o hash de outro — e a mesma
 * manobra em `evidence_refs` passaria por cima da allowlist de evidência. Nenhuma
 * quantidade de validação resolve isso: o problema é RELER, não validar mal.
 *
 * A resposta é capturar UMA vez, e nunca mais tocar no original.
 *
 * ─── Por que descritor, e não leitura ────────────────────────────────────────
 *
 * `Object.getOwnPropertyDescriptors` NÃO invoca getter: devolve o descritor. Uma
 * propriedade de acessor é recusada sem que o getter rode — recusar depois de executá-lo
 * já teria dado ao objeto do chamador a chance de rodar código nosso.
 *
 * ─── Por que não `structuredClone`, como o `detach` do store ──────────────────
 *
 * A Fase 1 resolveu este mesmo TOCTOU em `store.ts` com `structuredClone`, e a decisão
 * era correta lá: o grafo é destacado numa passada, e o que se valida é o destacado.
 * Mas `structuredClone` LÊ as propriedades — o próprio comentário de lá assume isso
 * ("qualquer getter que ela dispare já disparou aqui").
 *
 * Para a fronteira de percepção isso não serve: executar o getter uma vez já é executar
 * código do chamador dentro da montagem, e `structuredClone` ainda aceitaria `Date`,
 * `Map` e `Set`, que não são dado de contrato. Garantia diferente, ferramenta diferente
 * — não é uma segunda implementação da mesma coisa.
 *
 * ─── O domínio aceito ────────────────────────────────────────────────────────
 *
 * Só o que os schemas realmente carregam: `null`, booleano, string, número FINITO,
 * array e objeto simples. Fora disso é recusa — função, símbolo, `bigint`, `undefined`,
 * `Date`, `Map`, `Set`, instância de classe, `Proxy`, ciclo, array esparso, propriedade
 * não-enumerável, chave de símbolo. Nenhum deles é dado de contrato, e aceitá-los
 * "quase certo" produziria um grafo que parece igual e não é.
 *
 * ─── Construção segura da cópia ──────────────────────────────────────────────
 *
 * Toda chave é instalada com `Object.defineProperty`, nunca com atribuição. Atribuir a
 * chave `__proto__` invocaria o setter de `Object.prototype` — a propriedade não seria
 * criada e o prototype da cópia viraria o valor escolhido pelo chamador. Nome de chave
 * não pode ter poder sobre a estrutura da cópia.
 *
 * ─── Captura COMPLETA, nunca subconjunto ─────────────────────────────────────
 *
 * Toda propriedade de dado própria e enumerável entra, inclusive a desconhecida. É o
 * que mantém `additionalProperties: false` funcionando: copiar só os campos conhecidos
 * transformaria objeto inválido em válido — silenciosamente, que é a pior forma.
 *
 * Devolve `null` em caso de recusa. O chamador traduz para o defeito do seu domínio,
 * sem ecoar valor algum do objeto rejeitado.
 */
export function snapshotPlainData<T = unknown>(value: unknown): T | null {
  const r = captura(value, new Set<object>())
  return r === RECUSA ? null : (r as T)
}

function captura(v: unknown, ancestrais: Set<object>): unknown {
  if (v === null) return null
  const tipo = typeof v
  if (tipo === "string" || tipo === "boolean") return v
  if (tipo === "number") return Number.isFinite(v) ? v : RECUSA
  // function, symbol, bigint, undefined
  if (tipo !== "object") return RECUSA

  const obj = v as object
  if (isProxy(obj)) return RECUSA
  // Ancestral, não "já visto": referência compartilhada sem ciclo é legítima em JSON.
  if (ancestrais.has(obj)) return RECUSA
  if (Object.getOwnPropertySymbols(obj).length > 0) return RECUSA

  const descritores = Object.getOwnPropertyDescriptors(obj)
  const proto = Object.getPrototypeOf(obj) as unknown
  ancestrais.add(obj)
  try {
    if (Array.isArray(obj)) {
      if (proto !== Array.prototype) return RECUSA
      const tamanho = descritores["length"]?.value as unknown
      if (typeof tamanho !== "number" || !Number.isSafeInteger(tamanho) || tamanho < 0) {
        return RECUSA
      }
      // Índices + `length`, e mais nada: propriedade extra num array é estado escondido.
      if (Object.keys(descritores).length !== tamanho + 1) return RECUSA
      const saida: unknown[] = []
      for (let i = 0; i < tamanho; i += 1) {
        const d = descritores[String(i)]
        // Ausente = array esparso. Acessor = getter no índice.
        if (d === undefined || !("value" in d)) return RECUSA
        const filho = captura(d.value, ancestrais)
        if (filho === RECUSA) return RECUSA
        saida.push(filho)
      }
      return saida
    }

    if (proto !== Object.prototype && proto !== null) return RECUSA
    const saida: Record<string, unknown> = {}
    for (const [chave, d] of Object.entries(descritores)) {
      if (!("value" in d)) return RECUSA
      if (!d.enumerable) return RECUSA
      const filho = captura(d.value, ancestrais)
      if (filho === RECUSA) return RECUSA
      // `saida[chave] = filho` NÃO serve. Para a chave `__proto__`, atribuição invoca o
      // SETTER de `Object.prototype`: nenhuma propriedade própria é criada, e o
      // prototype da cópia passa a ser o valor que o chamador escolheu.
      //
      // As duas consequências são graves e silenciosas: a propriedade desaparece antes
      // de o schema poder recusá-la — matando `additionalProperties: false` — e o grafo
      // que chamamos de canônico fica com prototype de terceiro. `JSON.parse` cria
      // `__proto__` como propriedade PRÓPRIA, então isto não é hipótese: é o caminho
      // de qualquer observação desserializada.
      //
      // `defineProperty` sempre cria propriedade de dados própria, para qualquer nome
      // de chave. `constructor` e `prototype` também deixam de ter tratamento especial:
      // viram dado, e o schema decide.
      Object.defineProperty(saida, chave, {
        value: filho,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return saida
  } finally {
    ancestrais.delete(obj)
  }
}
