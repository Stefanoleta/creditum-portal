/**
 * Fase 3.0c — o assembler determinístico do `HermesReadModelV1`.
 *
 * ─── O que este objeto É ──────────────────────────────────────────────────────
 *
 *   WHAT HERMES MAY SEE
 *
 * E o que ele explicitamente NÃO é:
 *
 *   WHAT HERMES SHOULD THINK
 *
 * É a fronteira de PERCEPÇÃO. Dado estruturado, não prompt: não existe aqui system
 * prompt, template, concatenação de instrução ou frase dirigida a modelo. O runtime da
 * 3.1 vai consumir este objeto; transformá-lo em texto de instrução seria já ter
 * começado a fase seguinte, e com a parte errada dela.
 *
 * ─── O que ele não faz ────────────────────────────────────────────────────────
 *
 * Não raciocina, não infere, não recomenda, não alerta, não prioriza, não rankeia.
 * Não navega dashboard, não pesquisa mercado, não chama modelo, não publica, não
 * agenda. Não recalcula nada do briefing: populações, prazos e detectores chegam
 * prontos da Fase 3.0b, e recalculá-los criaria uma segunda autoridade sobre números
 * que já têm dono.
 *
 * ─── Onde vive, e por quê ─────────────────────────────────────────────────────
 *
 * `integration/src/briefing/`, ao lado do assembler do briefing executivo. O motivo é
 * o mesmo da 3.0b: consome tipos de `integration` e produz contrato validado por
 * `gateway`, e a direção de dependência do repositório é integration → gateway. Pôr
 * isto em `gateway/src` faria os contratos dependerem de quem os consome. Não criei
 * árvore de runtime agêntico — não há runtime nenhum nesta fase.
 *
 * ─── A separação epistêmica que o objeto preserva ─────────────────────────────
 *
 *   1  fato interno governado          o briefing, por referência + hash
 *   2  observação de dashboard oficial  refs de DashboardObservation
 *   3  observação externa de mercado    refs de MarketObservation
 *   4  decisão humana anterior          refs de DecisionRecord
 *   5  capacidade e restrição           vocabulário fechado do contrato
 *
 * Cinco domínios, cinco campos. O assembler não os colapsa: "competidor publicou X"
 * nunca vira "isto funciona para a Creditum", e observação nunca vira fato da
 * Creditum. A separação é estrutural, não recomendada.
 */

import { createHash } from "node:crypto"
import { assertValid } from "../../../gateway/src/contracts"
import { deepFreeze } from "../../../gateway/src/immutability"
import {
  HERMES_CAPABILITIES,
  HERMES_RESTRICTIONS,
  dashboardObservationContentHash,
  executiveBriefingContentHash,
  marketObservationContentHash,
  toOwnedDashboardObservation,
  toOwnedDecisionRecord,
  toOwnedExecutiveBriefing,
  toOwnedMarketObservation,
} from "../../../gateway/src/hermes"
import { snapshotPlainData } from "../../../gateway/src/immutability"
import type {
  ExecutiveBriefingV1,
  HermesCapability,
  HermesReadModelV1,
  ObservationBinding,
} from "../../../gateway/src/hermes"

/** Versão do material de identidade do read model. Muda o `read_model_id` de propósito. */
export const READ_MODEL_ID_VERSION = "1.0.0" as const

/**
 * Entrada canônica e ESTREITA.
 *
 * Campos nomeados, nenhum saco genérico. Os slots que carregam objeto de contrato são
 * `unknown` de propósito: é o tipo honesto para dado que ainda não foi validado, e diz
 * ao chamador que a validação acontece aqui dentro. É o mesmo desenho da fronteira de
 * autorização da 3.0a.
 *
 * Repare no que NÃO entra: cliente Google, navegador, provider, cliente de modelo,
 * handle de arquivo. O assembler recebe percepção pronta, nunca a capacidade de ir
 * buscá-la.
 *
 * ─── Ausente NÃO é vazio ──────────────────────────────────────────────────────
 *
 * `dashboard_observations` e `market_observations` são opcionais, e a distinção entre
 * ausente e `[]` é a coisa mais importante desta interface:
 *
 *   ausente   ninguém observou — a capacidade não está integrada nesta fase
 *   `[]`      observamos e não havia nada
 *
 * As duas afirmações são diferentes, e `[]` para esconder incapacidade seria
 * exatamente "desconhecido virou zero" numa casa nova. Quem sabe se olhou é o
 * chamador, e é dele que a distinção tem de vir.
 */
export interface HermesReadModelAssemblyInput {
  /**
   * Instante da geração, JÁ capturado pelo chamador.
   *
   * O assembler não lê relógio. Se lesse, duas montagens da mesma percepção
   * produziriam read models diferentes e o determinismo deixaria de ser verificável.
   */
  readonly generated_at: string
  /** O `ExecutiveBriefingV1` da Fase 3.0b. Validado aqui, nunca presumido. */
  readonly executive_briefing: unknown
  /** Capacidades GOVERNADAS. Decisão de governança, não escolha do assembler. */
  readonly capabilities: readonly string[]
  /** `DashboardObservationV1[]` já coletadas. Ausente ≠ `[]` — ver acima. */
  readonly dashboard_observations?: readonly unknown[]
  /** `MarketObservationV1[]` já coletadas. Ausente ≠ `[]` — ver acima. */
  readonly market_observations?: readonly unknown[]
  /** `DecisionRecordV1[]` de contexto histórico. Ausente ≠ `[]`. */
  readonly prior_decisions?: readonly unknown[]
}

export const READ_MODEL_DEFECTS = [
  /**
   * O ENVELOPE de entrada não é dado canônico simples.
   *
   * `Proxy`, acessor num campo de topo, valor não-JSON, ciclo. É o primeiro defeito
   * conferido porque é o único que pode fazer todos os outros mentirem: um envelope
   * instável devolveria briefing de um estado e capacidades de outro.
   */
  "NON_CANONICAL_ASSEMBLY_INPUT",
  /**
   * Campo de topo fora dos seis governados.
   *
   * A entrada é FECHADA. Sem isto, um chamador poderia acrescentar
   * `executive_briefing_hash` e alguém, algum dia, decidir honrá-lo — e a fronteira
   * inteira dependeria de ninguém ter essa ideia. Campo desconhecido é recusa, nunca
   * descarte silencioso: descartar é como `__proto__` desaparecia antes do schema.
   */
  "UNKNOWN_ASSEMBLY_INPUT_FIELD",
  /** `generated_at` não é timestamp válido. Não substituído por relógio. */
  "INVALID_GENERATED_AT",
  /** O briefing recebido não satisfaz `executive-briefing`. */
  "INVALID_EXECUTIVE_BRIEFING",
  /** Capacidade fora do enum fechado do contrato. */
  "INVALID_CAPABILITY",
  /**
   * O read model SEMPRE carrega um briefing derivado de observação de fonte, então
   * `OBSERVE_SOURCES` é exercida por construção. Entregar a percepção das fontes
   * dizendo que Hermes não pode observar fontes seria contradizer-se no mesmo objeto —
   * a mesma família de defeito que a 3.0b teve entre `source_health` e
   * `commercial_state`.
   */
  "MISSING_OBSERVE_SOURCES_CAPABILITY",
  /**
   * Capacidade de observação concedida sem a coleção correspondente.
   *
   * Declararia "Hermes pode observar dashboards" sem dizer o que foi observado — e
   * downstream não teria como saber se a observação rodou e veio vazia ou se nunca
   * rodou.
   */
  "CAPABILITY_WITHOUT_OBSERVATIONS",
  /**
   * Coleção de observações sem a capacidade correspondente.
   *
   * O inverso, e igualmente incoerente: apresentaria observação que o próprio read
   * model diz que Hermes não pode ter.
   */
  "OBSERVATIONS_WITHOUT_CAPABILITY",
  /** Observação de dashboard fora do contrato — `interaction_mode` incluído. */
  "INVALID_DASHBOARD_OBSERVATION",
  /** Observação de mercado fora do contrato. */
  "INVALID_MARKET_OBSERVATION",
  /** `DecisionRecord` fora do contrato — `decided_by` incluído. */
  "INVALID_DECISION_RECORD",
  /** Mesma `observation_id` com conteúdo divergente. Último-a-escrever não decide. */
  "DUPLICATE_OBSERVATION_ID",
  /** Mesma `decision_id` com conteúdo divergente. */
  "DUPLICATE_DECISION_ID",
  /**
   * Observação cita evidência fora do índice do briefing.
   *
   * Nesta fase a ÚNICA autoridade de evidência é o `evidence_index` do briefing.
   * Colocar na allowlist uma referência que não se pode conferir concederia acesso a
   * evidência de existência não verificada; descartá-la em silêncio esconderia a
   * inconsistência. A fase que coletar observações precisa trazer a própria autoridade
   * de evidência — até lá, isto falha fechado.
   */
  "EVIDENCE_REF_OUTSIDE_BRIEFING_INDEX",
  /** A saída não satisfez `hermes-read-model`. Defeito NOSSO, não da entrada. */
  "OUTPUT_CONTRACT_VIOLATION",
] as const
export type ReadModelDefect = (typeof READ_MODEL_DEFECTS)[number]

export type HermesReadModelAssembly =
  | { readonly status: "assembled"; readonly read_model: HermesReadModelV1 }
  | { readonly status: "not_assembled"; readonly defect: ReadModelDefect }

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const CAPACIDADES = new Set<string>(HERMES_CAPABILITIES)

/**
 * Os SEIS campos que a entrada aceita. Fechada, como todo vocabulário deste projeto.
 *
 * Vem de `HermesReadModelAssemblyInput`, e existe em runtime porque tipo não roda.
 */
const CAMPOS_DE_ENTRADA = new Set<string>([
  "generated_at",
  "executive_briefing",
  "capabilities",
  "dashboard_observations",
  "market_observations",
  "prior_decisions",
])

/** Conjunto canônico: ordenado e sem repetição. Ordem de entrada não é semântica. */
const conjunto = (xs: readonly string[]): readonly string[] => [...new Set(xs)].sort()

/**
 * Canonicalização para comparar conteúdo: chaves ordenadas, ordem de array preservada.
 *
 * Serve para responder "duas entradas com a mesma id dizem a mesma coisa?" sem
 * inventar um domínio de hash público para isso.
 */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (typeof v === "object" && v !== null) {
    const saida: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      saida[k] = canonico((v as Record<string, unknown>)[k])
    }
    return saida
  }
  return v
}

/**
 * Valida decisões e extrai as referências, falhando fechado em id divergente.
 *
 * O contrato guarda `prior_decisions` como lista de referências simples, e aqui isso é
 * suficiente: a 3.0a já garante que `decision_id` é único e que registro de decisão é
 * imutável — duplicidade divergente falha na própria resolução de cadeia. Não
 * acrescento hash onde o contrato não pede e a autoridade a montante já protege.
 */
function refsDeDecisao(brutas: ColecaoPropria): readonly string[] | null {
  const porId = new Map<string, string>()
  for (const bruta of brutas) {
    let decisao: { readonly decision_id: string }
    try {
      // Instantâneo próprio: a id e a comparação de conteúdo saem do MESMO grafo.
      decisao = toOwnedDecisionRecord(bruta)
    } catch {
      return null
    }
    const id = decisao.decision_id
    const serializado = JSON.stringify(canonico(decisao))
    const anterior = porId.get(id)
    if (anterior !== undefined && anterior !== serializado) return null
    porId.set(id, serializado)
  }
  return conjunto([...porId.keys()])
}

/**
 * Identidade do read model, determinística.
 *
 * SHA-256 sobre material tipado em ordem FIXA de campos, com domínio e versão. Nada de
 * `Math.random`, `Date.now`, UUID ou contador — e nunca iteração sobre chaves do
 * objeto montado: ordem de inserção de propriedade não pode influenciar identidade.
 *
 * Compromete-se com TUDO que compõe a percepção, inclusive `generated_at` e o hash do
 * briefing. Duas percepções materialmente diferentes não podem compartilhar id: o
 * runtime futuro vai referenciar "o read model que eu li", e uma id que representasse
 * duas percepções incompatíveis tornaria essa referência inútil.
 */
function readModelId(material: unknown): string {
  const hash = createHash("sha256")
    .update(`hermes_read_model/v1:${JSON.stringify(material)}`, "utf8")
    .digest("hex")
    .slice(0, 32)
  return `hrm_${hash}`
}

/** Vínculos canonicalizados — ou a ausência da coleção. Ausente ≠ vazio. */
type Vinculos = readonly ObservationBinding[] | undefined

/**
 * Valida cada observação e monta o VÍNCULO: referência mais hash de conteúdo.
 *
 * ─── Por que o hash, e não só a referência ────────────────────────────────────
 *
 * A versão anterior guardava só a id, e o gate mostrou o que isso permite: duas
 * montagens com a mesma id e conteúdos diferentes produziam o MESMO read model. Uma id
 * é um nome; nome pode ser reusado. Sem compromisso de conteúdo o vínculo é ponteiro
 * mutável, e a percepção registrada deixa de ser a percepção que alguém leu.
 *
 * O hash é derivado do objeto validado, aqui. Nunca aceito de quem chamou — a entrada
 * recebe OBSERVAÇÕES, não vínculos prontos, e é isso que torna a falsificação
 * estruturalmente impossível em vez de proibida por convenção.
 *
 * `null` sinaliza recusa; o chamador traduz para o defeito do seu domínio.
 *
 * Id repetida com o MESMO conteúdo é deduplicada — a coleção é conjunto, e vínculo
 * repetido não vincula nada a mais. Id repetida com conteúdo DIVERGENTE falha fechada:
 * escolher uma das duas seria last-write-wins implícito, decidir sem autoridade.
 */
interface ColecaoDeVinculos {
  readonly bindings: readonly ObservationBinding[]
  /** Refs de evidência citadas, colhidas dos MESMOS instantâneos. */
  readonly evidence_refs: readonly string[]
}

/**
 * Coleção JÁ capturada — array próprio, sem acessor, sem Proxy.
 *
 * Tipo nominal em vez de `readonly unknown[]` para que `vinculosCanonicos` não possa
 * receber coleção do chamador por descuido: quem quiser chamá-la precisa passar pela
 * captura, e o compilador cobra.
 */
type ColecaoPropria = readonly unknown[] & { readonly __propria?: unique symbol }

/**
 * Captura a COLEÇÃO inteira antes de qualquer iteração.
 *
 * Proteger cada observação não bastava: o `for...of` rodava sobre o container do
 * chamador. Um `Proxy` no lugar do array executaria `Symbol.iterator`, `get`,
 * `ownKeys` e `getOwnPropertyDescriptor` — código arbitrário do chamador — ANTES de
 * qualquer observação chegar à captura. E um array comum com getter no índice
 * executaria esse getter pelo mesmo caminho, podendo devolver membros diferentes em
 * leituras diferentes.
 *
 * Container é parte da fronteira de confiança. Comprimento, ordem, identidade e
 * conteúdo dos membros passam a vir todos de um único grafo próprio.
 */
function colecaoPropria(bruta: unknown): ColecaoPropria | null {
  const capturada = snapshotPlainData<unknown>(bruta)
  if (!Array.isArray(capturada)) return null
  return capturada as ColecaoPropria
}

function vinculosCanonicos(
  brutas: ColecaoPropria,
  proprio: (raw: unknown) => { readonly observation_id: string },
  hashDeConteudo: (proprio: unknown) => string,
  citadas: (proprio: unknown) => readonly string[],
): ColecaoDeVinculos | null {
  const porId = new Map<string, string>()
  const evidencias: string[] = []
  for (const bruta of brutas) {
    let observacao: { readonly observation_id: string }
    try {
      // UM instantâneo próprio por observação. Daqui para baixo o objeto do chamador
      // não é mais consultado: id, hash, evidência, deduplicação e ordenação saem
      // TODOS deste mesmo grafo. Reler o original permitiria que um getter devolvesse
      // uma id na primeira leitura e outra na segunda.
      observacao = proprio(bruta)
    } catch {
      return null
    }
    const id = observacao.observation_id
    const hash = hashDeConteudo(observacao)
    for (const r of citadas(observacao)) evidencias.push(r)
    const anterior = porId.get(id)
    if (anterior !== undefined && anterior !== hash) return null
    porId.set(id, hash)
  }
  // Ordem canônica por referência. Nunca por conteúdo, relevância ou severidade —
  // ordenar por importância seria priorização, e priorização é raciocínio.
  return {
    bindings: [...porId.entries()]
      .map(([observation_ref, observation_hash]) => ({ observation_ref, observation_hash }))
      .sort((a, b) => a.observation_ref.localeCompare(b.observation_ref)),
    evidence_refs: evidencias,
  }
}

/**
 * Monta o read model. PURA, determinística, falha fechada.
 *
 * A ordem importa: as conferências de coerência acontecem antes de qualquer montagem, e
 * a validação de schema antes de qualquer retorno. Um read model fora do contrato nunca
 * sai desta função — tipo TypeScript não é validação, e a 3.0a fechou exatamente esse
 * furo na fronteira de autoridade.
 */
export function assembleHermesReadModelV1(
  input: HermesReadModelAssemblyInput,
): HermesReadModelAssembly {
  // ─── UMA captura, do ENVELOPE INTEIRO ─────────────────────────────────────
  //
  // A versão anterior lia cada campo uma vez, para um local. Isso eliminava a
  // releitura de cada campo e não eliminava o problema: com o envelope sendo um
  // `Proxy`, seis traps executavam — um por campo — e nada impedia que devolvessem
  // estados diferentes.
  //
  //   briefing   do estado A
  //   capacidades  do estado B
  //   observações  do estado C
  //
  // Cada campo internamente coerente, e a PERCEPÇÃO um Frankenstein. Capturar seis
  // campos separadamente não é um instantâneo atômico, e afirmar "um grafo semântico"
  // com seis leituras independentes era contradição minha.
  //
  // Depois desta linha o objeto do chamador não é lido nem uma vez mais. Todo campo
  // sai de `envelope`, e a validação específica de cada um acontece sobre dado NOSSO —
  // então a diagnosticabilidade por campo continua inteira, sem custo de integridade.
  const envelope = snapshotPlainData<Record<string, unknown>>(input)
  if (envelope === null || Array.isArray(envelope) || typeof envelope !== "object") {
    return { status: "not_assembled", defect: "NON_CANONICAL_ASSEMBLY_INPUT" }
  }

  // Entrada FECHADA. `__proto__` de topo chega aqui como propriedade própria — a
  // captura o preserva de propósito — e é recusado como campo desconhecido.
  for (const chave of Object.keys(envelope)) {
    if (!CAMPOS_DE_ENTRADA.has(chave)) {
      return { status: "not_assembled", defect: "UNKNOWN_ASSEMBLY_INPUT_FIELD" }
    }
  }

  const generated_at: unknown = envelope["generated_at"]
  const brutasDashboard: unknown = envelope["dashboard_observations"]
  const brutasMercado: unknown = envelope["market_observations"]
  const brutasDecisoes: unknown = envelope["prior_decisions"]

  // ─── generated_at: explícito, nunca do relógio ────────────────────────────
  if (typeof generated_at !== "string" || !RFC3339.test(generated_at)) {
    return { status: "not_assembled", defect: "INVALID_GENERATED_AT" }
  }

  // ─── O briefing, validado ANTES de virar referência ───────────────────────
  //
  // Referenciar um briefing não validado produziria um compromisso sobre forma
  // desconhecida: a id e o hash afirmariam descrever algo que ninguém conferiu.
  let briefing: ExecutiveBriefingV1
  try {
    // Cópia PRÓPRIA, congelada. A factory canônica congelaria o briefing do chamador —
    // efeito colateral sobre quem só pediu uma montagem.
    briefing = toOwnedExecutiveBriefing(envelope["executive_briefing"])
  } catch {
    return { status: "not_assembled", defect: "INVALID_EXECUTIVE_BRIEFING" }
  }

  // Derivados do OBJETO, não do chamador. Não existe parâmetro de hash nem de ref
  // nesta interface, e é por isso que não existe o que falsificar: nenhum caminho
  // permite apresentar o hash de um briefing junto do conteúdo de outro.
  const executive_briefing_ref = briefing.briefing_id
  const executive_briefing_hash = executiveBriefingContentHash(briefing)

  // ─── Capacidades: vocabulário fechado, transporte governado ───────────────
  //
  // Instantâneo próprio antes de conferir: um array com getter no índice poderia
  // devolver `OBSERVE_SOURCES` na conferência e outra coisa na montagem.
  const capacidadesProprias = envelope["capabilities"]
  if (!Array.isArray(capacidadesProprias)) {
    return { status: "not_assembled", defect: "INVALID_CAPABILITY" }
  }
  for (const c of capacidadesProprias) {
    if (typeof c !== "string" || !CAPACIDADES.has(c)) {
      return { status: "not_assembled", defect: "INVALID_CAPABILITY" }
    }
  }
  const capabilities = conjunto(capacidadesProprias as readonly string[]) as readonly HermesCapability[]
  const concedida = new Set<string>(capabilities)

  if (!concedida.has("OBSERVE_SOURCES")) {
    return { status: "not_assembled", defect: "MISSING_OBSERVE_SOURCES_CAPABILITY" }
  }

  // ─── Capacidade ⟺ coleção: a bicondicional que impede a ambiguidade ───────
  //
  // É o que faz "não integrado" distinguível de "observado e vazio". Sem os dois
  // sentidos, `[]` viraria um estado que significa as duas coisas conforme quem lê.
  const pares = [
    ["OBSERVE_DASHBOARDS", brutasDashboard],
    ["OBSERVE_MARKET", brutasMercado],
  ] as const
  for (const [capacidade, colecao] of pares) {
    if (concedida.has(capacidade) && colecao === undefined) {
      return { status: "not_assembled", defect: "CAPABILITY_WITHOUT_OBSERVATIONS" }
    }
    if (!concedida.has(capacidade) && colecao !== undefined) {
      return { status: "not_assembled", defect: "OBSERVATIONS_WITHOUT_CAPABILITY" }
    }
  }

  // ─── Observações: validadas, transportadas por referência ─────────────────
  //
  // Observação continua observação. Nenhuma delas é promovida a fato da Creditum, e
  // nenhum texto delas é lido como instrução — o contrato as guarda em
  // `untrusted_text`, e o envelope não é removido em lugar nenhum deste arquivo.
  let dashboard_observations: Vinculos
  const citadas: string[] = []
  if (brutasDashboard !== undefined) {
    const propria = colecaoPropria(brutasDashboard)
    if (propria === null) {
      return { status: "not_assembled", defect: "INVALID_DASHBOARD_OBSERVATION" }
    }
    const colecao = vinculosCanonicos(
      propria,
      toOwnedDashboardObservation,
      dashboardObservationContentHash,
      (o) => (o as { readonly evidence_refs?: readonly string[] }).evidence_refs ?? [],
    )
    if (colecao === null) {
      return { status: "not_assembled", defect: "INVALID_DASHBOARD_OBSERVATION" }
    }
    dashboard_observations = colecao.bindings
    citadas.push(...colecao.evidence_refs)
  }

  let market_observations: Vinculos
  if (brutasMercado !== undefined) {
    const propria = colecaoPropria(brutasMercado)
    if (propria === null) {
      return { status: "not_assembled", defect: "INVALID_MARKET_OBSERVATION" }
    }
    const colecao = vinculosCanonicos(
      propria,
      toOwnedMarketObservation,
      marketObservationContentHash,
      (o) => {
        const r = (o as { readonly evidence_ref?: string }).evidence_ref
        return r === undefined ? [] : [r]
      },
    )
    if (colecao === null) {
      return { status: "not_assembled", defect: "INVALID_MARKET_OBSERVATION" }
    }
    market_observations = colecao.bindings
    citadas.push(...colecao.evidence_refs)
  }

  // ─── Decisões anteriores: contexto histórico, não regra permanente ────────
  //
  // O contrato guarda apenas refs, e o read model NÃO tem campo que expresse
  // efetividade, vigência ou autoridade. Por isso listar uma decisão aqui não a promove
  // a autorização: quem decide efetividade é o resolvedor canônico da 3.0a, e ele
  // continua sendo o único. Não reimplemento a cadeia, e não a chamo — este objeto não
  // faz afirmação de autoridade que precisasse dela.
  let prior_decisions: readonly string[] | undefined
  if (brutasDecisoes !== undefined) {
    const propria = colecaoPropria(brutasDecisoes)
    if (propria === null) {
      return { status: "not_assembled", defect: "INVALID_DECISION_RECORD" }
    }
    const refs = refsDeDecisao(propria)
    if (refs === null) {
      return { status: "not_assembled", defect: "INVALID_DECISION_RECORD" }
    }
    prior_decisions = refs
  }

  // ─── Evidência alcançável: o índice do briefing, e só ─────────────────────
  const permitted_evidence_refs = conjunto(briefing.evidence_index)
  const noIndice = new Set(permitted_evidence_refs)

  // Observação que cita evidência fora do índice: falha fechada. Ver o defeito.
  //
  // As refs vêm dos INSTANTÂNEOS montados acima, não do objeto do chamador. Reler
  // `evidence_refs` do original permitiria que um getter devolvesse refs permitidas na
  // primeira leitura e outras na segunda — a allowlist seria conferida contra uma lista
  // que não é a que foi hasheada.
  for (const r of citadas) {
    if (!noIndice.has(r)) {
      return { status: "not_assembled", defect: "EVIDENCE_REF_OUTSIDE_BRIEFING_INDEX" }
    }
  }

  // ─── Restrições: as seis, sempre, fixadas pelo assembler ──────────────────
  //
  // Não são input. Restrição que a entrada pode enfraquecer não é restrição — e as
  // seis são verdadeiras nesta fase: Hermes não aprova, não publica, não altera fonte,
  // não escreve em dashboard, não acessa PII e não agenda. Declarar menos do que é
  // verdade subdimensionaria os limites que o runtime futuro vai ler.
  //
  // Isto INFORMA. O enforcement continua na 3.0a, e não é duplicado aqui.
  const restrictions = [...HERMES_RESTRICTIONS]

  // `growth_context` e `aros_context` ficam FORA por não existir input governado para
  // eles nesta fase. Declarar `observed: []` afirmaria "medimos o crescimento e não
  // havia nada", e declarar `aros_context: []` afirmaria "olhamos as missões". Nenhuma
  // das duas aconteceu, e o campo ausente é a única forma honesta de dizer isso.
  const corpo = {
    schema_version: "1.0.0" as const,
    generated_at,
    executive_briefing_ref,
    executive_briefing_hash,
    ...(dashboard_observations === undefined ? {} : { dashboard_observations }),
    ...(market_observations === undefined ? {} : { market_observations }),
    ...(prior_decisions === undefined ? {} : { prior_decisions }),
    permitted_evidence_refs,
    capabilities,
    restrictions,
  }

  const read_model = {
    read_model_id: readModelId({ v: READ_MODEL_ID_VERSION, body: corpo }),
    ...corpo,
  }

  // ─── Validação de saída, antes de retornar ────────────────────────────────
  try {
    assertValid("hermes-read-model", read_model)
  } catch {
    // Defeito NOSSO. Confundi-lo com entrada inválida esconderia um bug atrás de uma
    // resposta plausível sobre o que o chamador mandou.
    return { status: "not_assembled", defect: "OUTPUT_CONTRACT_VIOLATION" }
  }

  return { status: "assembled", read_model: deepFreeze(read_model as HermesReadModelV1) }
}
