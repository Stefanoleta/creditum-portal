/**
 * Armazenamento somente leitura.
 *
 * A interface não tem método de escrita — essa é a fronteira entre o plano de
 * ingestão e o plano de consulta (§6.1). Mas "não ter setter" é garantia fraca:
 * `readonly` do TypeScript some na compilação, e devolver a referência interna
 * deixa qualquer consumidor mutar o store por dentro.
 *
 * Três garantias, todas em runtime:
 *
 *   1. **Caminho único.** O construtor recebe `unknown` e valida. Não existe
 *      forma de colocar um objeto no store sem passar por contrato + semântica.
 *   2. **Cópia profunda.** O store não compartilha referência com quem o
 *      construiu, então mutar o objeto de origem depois não o afeta.
 *   3. **Congelamento profundo.** Nem o conteúdo aninhado (payload, conflicts,
 *      contributing_cases) aceita mutação.
 *
 * Ao final da construção a integridade referencial é verificada, e falha fechado.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { GatewayError } from "./errors"
import { toEvent, toEvidence, toSnapshot } from "./factory"
import type { FactoryOptions } from "./factory"
import { validateStoreIntegrity } from "./integrity"
import type { Evidence, IntelligenceEvent, Snapshot } from "./types"
import { deepFreeze } from "./immutability"

export interface ReadOnlyStore {
  allSnapshots(): readonly Snapshot[]
  allEvents(): readonly IntelligenceEvent[]
  allEvidence(): readonly Evidence[]
}

/** Entrada crua: `unknown` de propósito — é dado externo até ser validado. */
export interface RawStoreContents {
  readonly snapshots?: readonly unknown[]
  readonly events?: readonly unknown[]
  readonly evidence?: readonly unknown[]
}

/**
 * Congela EXATAMENTE os objetos recebidos. Não copia.
 *
 * Copiar aqui recriaria o furo que este módulo fecha: o que fosse armazenado
 * seria uma cópia feita DEPOIS da validação, e não o grafo que a validação viu.
 */
function freezeAll<T>(items: T[]): readonly T[] {
  const seen = new WeakSet<object>()
  return deepFreeze(Object.freeze(items), seen)
}

interface DetachedInput {
  readonly snapshots: readonly unknown[]
  readonly events: readonly unknown[]
  readonly evidence: readonly unknown[]
}

/**
 * Destaca o grafo de entrada INTEIRO antes da primeira validação.
 *
 * O furo que isto fecha é um TOCTOU: antes, cada elemento era validado sobre a
 * referência original e a cópia só acontecia no fim. Um elemento posterior com
 * getter ou trap podia então alterar um elemento anterior — já aprovado — e a
 * cópia final capturava o estado alterado. O resultado era um store congelado e
 * registrado contendo dado que nunca passou por validação nenhuma.
 *
 * Depois desta linha, a entrada original está FORA da fronteira de confiança.
 * Qualquer getter que ela dispare já disparou aqui, e o que ficou no grafo
 * destacado é exatamente o que vai ser validado, congelado e armazenado.
 *
 * Falha fechado: `structuredClone` recusa Proxy e função com `DataCloneError`,
 * e nesse caso o store não chega a existir.
 */
function detach(raw: RawStoreContents): DetachedInput {
  try {
    return structuredClone({
      snapshots: raw.snapshots ?? [],
      events: raw.events ?? [],
      evidence: raw.evidence ?? [],
    })
  } catch (causa) {
    throw new GatewayError(
      "SCHEMA_INVALID",
      "Entrada não pôde ser destacada antes da validação",
      [causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa)],
    )
  }
}

/**
 * Registro de stores que completaram o caminho validado.
 *
 * NÃO é exportado, e não existe função exportada que acrescente a ele. Uma
 * "brand" no tipo, ou um símbolo exportado, seria forjável — bastaria o
 * consumidor anexá-la ao próprio objeto. Aqui a única forma de entrar é o
 * construtor abaixo chegar ao fim, o que significa, nesta ordem:
 * destacamento do grafo → schema → semântica → integridade referencial →
 * congelamento dos dados → congelamento da instância.
 */
const VALIDADOS = new WeakSet<object>()

export class InMemoryStore implements ReadOnlyStore {
  readonly #snapshots: readonly Snapshot[]
  readonly #events: readonly IntelligenceEvent[]
  readonly #evidence: readonly Evidence[]

  constructor(raw: RawStoreContents, options: FactoryOptions = {}) {
    // 1. DESTACAR o grafo inteiro, antes de qualquer validação.
    const destacado = detach(raw)

    // 2. Validar schema + semântica sobre o grafo destacado. As factories
    //    devolvem a MESMA referência que receberam — ou seja, o objeto validado
    //    é o objeto destacado, e será o objeto armazenado.
    const snapshots = destacado.snapshots.map((s) => toSnapshot(s, options))
    const events = destacado.events.map((e) => toEvent(e, options))
    const evidence = destacado.evidence.map((e) => toEvidence(e, options))

    // 3. Integridade referencial sobre esses mesmos objetos.
    //    Os arrays, não `this`: passar o store faria a verificação usar
    //    `allSnapshots()`, que é virtual, e uma subclasse validaria os próprios
    //    dados falsificados.
    validateStoreIntegrity({ snapshots, events, evidence })

    // 4. Congelar esses mesmos objetos. NÃO há cópia entre a validação e o
    //    congelamento — se houvesse, o armazenado poderia divergir do validado.
    this.#snapshots = freezeAll(snapshots)
    this.#events = freezeAll(events)
    this.#evidence = freezeAll(evidence)

    // Congelar a INSTÂNCIA, não só os dados.
    //
    // Sem isto, um store legitimamente validado seguia extensível: bastava
    // `Object.defineProperty(store, "allSnapshots", { value: () => hostil })`
    // para instalar um método próprio que sombreia o do protótipo. O registro
    // continuava válido e o protótipo continuava idêntico — as duas checagens
    // passavam, e o gateway chamava o método forjado.
    //
    // `Object.freeze` fecha os três vetores de uma vez: torna o objeto
    // não-extensível (nenhuma propriedade própria nova), torna as existentes
    // não-graváveis, e torna o [[Prototype]] imutável (freeze implica
    // preventExtensions), o que barra `Object.setPrototypeOf`.
    //
    // Campos `#private` não são propriedades — continuam legíveis normalmente.
    Object.freeze(this)

    // Registrado só aqui, e só depois de tudo passar: schema → semântica →
    // integridade → congelamento dos dados → congelamento da instância. Se
    // qualquer etapa acima lançar, o objeto nunca entra no registro.
    VALIDADOS.add(this)
  }

  allSnapshots(): readonly Snapshot[] {
    return this.#snapshots
  }

  allEvents(): readonly IntelligenceEvent[] {
    return this.#events
  }

  allEvidence(): readonly Evidence[] {
    return this.#evidence
  }
}

// Congelado para que ninguém troque `allSnapshots` depois da construção: sem
// isso, um store legitimamente validado poderia passar a devolver outra coisa.
Object.freeze(InMemoryStore.prototype)

/**
 * Entrada nomeada para construção do store.
 *
 * Mesmo caminho do construtor — existe para deixar explícito na chamada que o
 * conteúdo está sendo validado, e não apenas embrulhado.
 */
export function createValidatedStore(
  raw: RawStoreContents,
  options: FactoryOptions = {},
): InMemoryStore {
  return new InMemoryStore(raw, options)
}

/**
 * Fronteira de runtime do gateway.
 *
 * `ReadOnlyStore` é uma interface estrutural: qualquer objeto com os três
 * métodos a satisfaz, e o TypeScript aceita — mas o compilador não roda em
 * produção. Um adaptador hostil, ou apenas descuidado, entregaria dados sem
 * schema, sem semântica, sem integridade e mutáveis.
 *
 * Duas checagens, porque cada uma sozinha tem furo:
 *
 *   1. **Registro privado** — só o construtor completo registra. Um objeto
 *      literal com os três métodos nunca está lá. Um `Proxy` em volta de um
 *      store válido também não: o proxy é outro objeto, e `WeakSet` indexa por
 *      identidade (o protótipo, esse sim, o proxy repassa — por isso o registro
 *      é a checagem que pega esse caso).
 *   2. **Identidade de protótipo** — uma subclasse passaria pelo registro (o
 *      construtor da base roda e registra `this`) e depois sobrescreveria
 *      `allSnapshots` para devolver outra coisa. Exigir o protótipo exato
 *      fecha isso.
 *   3. **Instância congelada** — sem isto, um store válido podia receber
 *      `Object.defineProperty(store, "allSnapshots", …)` depois de registrado,
 *      e as duas checagens acima continuavam passando.
 *
 * A verificação é feita na construção do gateway. Como a instância é congelada
 * antes de entrar no registro, não existe janela posterior: um store aceito não
 * pode mudar de comportamento depois.
 */
export function assertValidatedStore(store: ReadOnlyStore): void {
  const motivos: string[] = []

  if (!VALIDADOS.has(store)) motivos.push("objeto não está no registro de stores validados")
  if (Object.getPrototypeOf(store) !== InMemoryStore.prototype) {
    motivos.push("protótipo não é exatamente o de InMemoryStore")
  }
  if (!Object.isFrozen(store)) motivos.push("instância não está congelada")

  if (motivos.length > 0) {
    throw new GatewayError(
      "NOT_ALLOWED",
      "Store não passou pelo caminho validado (schema → semântica → integridade → congelamento)",
      motivos,
    )
  }
}

/** Consulta sem abortar, para diagnóstico e para o ledger. */
export function isValidatedStore(store: ReadOnlyStore): boolean {
  return (
    VALIDADOS.has(store) &&
    Object.getPrototypeOf(store) === InMemoryStore.prototype &&
    Object.isFrozen(store)
  )
}

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "synthetic",
)

function readJsonDir(subdir: string): unknown[] {
  const dir = join(FIXTURES_DIR, subdir)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown)
}

/**
 * Carrega as fixtures sintéticas do disco.
 *
 * Passa pelo mesmo caminho validado que qualquer outra entrada: uma fixture
 * malformada é recusada aqui, não descoberta três camadas adiante.
 * Nenhum dado real entra — ver `fixtures/README.md`.
 */
export function loadSyntheticStore(options: FactoryOptions = {}): InMemoryStore {
  return createValidatedStore(
    {
      snapshots: readJsonDir("snapshots"),
      events: readJsonDir("events"),
      evidence: readJsonDir("evidence"),
    },
    options,
  )
}
