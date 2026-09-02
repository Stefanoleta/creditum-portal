/**
 * Fase 3.1b — a fronteira de integração Creditum ↔ Hermes.
 *
 * ─── A regra que dá razão a este arquivo existir ──────────────────────────────
 *
 *   NENHUM componente da Creditum chama comando arbitrário do Hermes.
 *
 * Todo contato com o runtime passa por aqui. A alternativa — cada chamador
 * montando a sua invocação — significaria cada chamador com a sua própria ideia de
 * quais ferramentas o modelo pode chamar, qual versão é aceitável e o que fazer
 * quando algo não bate. A pergunta "o Hermes pode agir?" tem de ter UM lugar onde é
 * respondida.
 *
 * ─── O que este objeto NÃO tem ────────────────────────────────────────────────
 *
 * Não existe aqui `executeHermes(args: string[])`, nem string de comando, nem shell,
 * nem interpolação de conteúdo em linha de comando. Não há superfície onde injeção de
 * comando caiba: o transporte é uma PORTA tipada, e dado viaja como dado.
 *
 * ─── O que ele também não faz ─────────────────────────────────────────────────
 *
 * Não calcula métrica comercial, não recalcula prazo, não infere achado, não atribui
 * severidade e não recomenda ação. Ele transporta percepção governada e valida o que
 * volta. Qualquer cálculo aqui seria uma segunda autoridade sobre número que já tem
 * dono nas Fases 2 e 3.0b.
 *
 * ─── O que a 3.1b NÃO decidiu ─────────────────────────────────────────────────
 *
 * O TRANSPORTE. O runtime de produção roda na Hostinger, fora do alcance deste
 * ambiente, e escolher ACP, servidor HTTP ou subprocesso de CLI a partir de
 * documentação seria adotar por leitura o que só a instalação prova. Por isso o
 * transporte é uma porta injetada e NÃO existe implementação de produção neste
 * commit — ver `scripts/hermes-production-probe.sh` e a doc da fase.
 *
 * Uma peça correta sem chamador é uma peça que não roda; uma peça ligada a um
 * transporte não verificado é pior, porque parece que roda.
 */

import { createHash } from "node:crypto"
import { types } from "node:util"
import { assertValid } from "../../../gateway/src/contracts"
import { deepFreeze, snapshotPlainData } from "../../../gateway/src/immutability"
import { toOwnedHermesReadModel } from "../../../gateway/src/hermes"
import { validateInsightsAgainstReadModel } from "./reasoning"
import type { HermesInsightV1, HermesReadModelV1 } from "../../../gateway/src/hermes"

/** Versão do protocolo DESTE adapter. Independe da versão do Hermes. */
export const ADAPTER_PROTOCOL_VERSION = "1.0.0" as const

/** Versão do material de identidade de execução. Muda o `run_id` de propósito. */
export const RUN_ID_VERSION = "1.0.0" as const

// ─────────────────────────────────────────────────────────────────────────────
// A expectativa governada de runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O runtime que a Creditum testou, e SOMENTE ele.
 *
 * ─── Versão exata, nunca faixa ────────────────────────────────────────────────
 *
 * Não `latest`, não `>=0.20.4`, não `0.20.x`. O upstream tem histórico documentado
 * de migração de config reescrevendo nomes de toolset em SILÊNCIO — sem erro, sem
 * aviso, sem log. Uma faixa de versão aceitaria justamente a atualização que muda a
 * superfície de capacidade sem avisar ninguém.
 *
 * Subir de versão é um gate novo, com sonda nova. Não é configuração.
 */
export const GOVERNED_RUNTIME = Object.freeze({
  /** Evidência de produção da Fase 3.1a. */
  hermes_version: "0.20.4",
  hermes_home: "/data",
  install_dir: "/opt/hermes-agent",
  /**
   * O caminho de execução APROVADO, por inteiro.
   *
   * ─── Por que não basta o que o runtime diz de si ─────────────────────────
   *
   * Um processo qualquer pode relatar Hermes 0.20.4, perfil `/data` e contagem zero.
   * Nada nesses três campos prova QUEM está relatando. E o caminho ACP de fábrica —
   * o mesmo que em produção entregou 15 ferramentas ao modelo — é justamente um
   * processo capaz de produzir esse relato.
   *
   * O que separou 15 de 0 não foi o Hermes: foi a ponte governada da Creditum. Então
   * a identidade dela faz parte da precondição, e não do log.
   *
   * A contagem zero da prova de produção pertence a ESTE artefato. Aceitá-la de outro
   * transporte seria transferir uma prova para quem não a produziu.
   */
  transport: "acp",
  bridge_version: "1.1.0",
  acp_protocol_version: "0.9.0",
  capability_verdict: "OK",
  /**
   * ZERO. Não "poucas", não "só as seguras".
   *
   * Hermes raciocina apenas sobre o que lhe é entregue. Sem terminal, sem arquivo,
   * sem browser, sem web, sem mensagem, sem cron, sem delegação, sem execução de
   * código. A postura não é uma preferência de configuração: é a precondição que
   * torna seguro entregar percepção da Creditum a um modelo.
   */
  model_callable_tool_count: 0,
} as const)

/**
 * O que a sonda de produção OBSERVOU. Nada aqui é presumido.
 *
 * Campo ausente significa NÃO OBSERVADO — e não observado falha fechado. É a mesma
 * regra da 3.0b: ausência nunca é zero, e aqui zero seria a resposta perigosa, porque
 * zero é exatamente o que queremos ver.
 */
export interface ObservedRuntimeFingerprint {
  // `| undefined` explícito, e não apenas opcional: com `exactOptionalPropertyTypes`
  // as duas coisas diferem, e aqui a sonda precisa poder DIZER "não consegui observar
  // isto" — que é diferente de não ter falado no assunto.
  readonly hermes_version?: string | undefined
  readonly hermes_home?: string | undefined
  readonly model_callable_tool_count?: number | undefined
  /** Identificador do transporte efetivamente disponível. */
  readonly transport?: string | undefined
  /** Provider/modelo resolvidos. Identificadores, NUNCA credencial. */
  readonly provider?: string | undefined
  readonly model?: string | undefined
  /** Protocolo ACP medido pela ponte. Ausente NÃO autoriza. */
  readonly acp_protocol_version?: string | undefined
  /**
   * Veredito da ponte de compatibilidade.
   *
   * `"OK"` é o único valor que autoriza. Ausente NÃO significa "não se aplica":
   * significa que ninguém provou a postura de zero ferramentas, e isso é recusa.
   */
  readonly capability_verdict?: string | undefined
  /** Versão da ponte governada. Ausente NÃO autoriza. */
  readonly bridge_version?: string | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelopes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O pedido. Percepção governada mais a expectativa de runtime — e nada de instrução.
 *
 * `read_model` é `unknown` de propósito: é o tipo honesto para dado que ainda não foi
 * validado, e a validação acontece aqui dentro. Não duplico `HermesReadModelV1`: o
 * objeto canônico atravessa inteiro, e a sua identidade de conteúdo é derivada, nunca
 * fornecida.
 *
 * Não existe campo de prompt, de persona, de regra ou de instrução. O contrato de
 * raciocínio é da 3.1c, e criar o slot antes da regra seria convidar alguém a
 * preenchê-lo sem governança.
 */
export interface HermesReasoningRequestV1 {
  /** Instante do pedido, JÁ capturado pelo chamador. O adapter não lê relógio. */
  readonly requested_at: string
  /** `HermesReadModelV1`. Validado aqui contra o contrato canônico. */
  readonly read_model: unknown
  /**
   * Versão do contrato de raciocínio da 3.1c, quando existir.
   *
   * Opcional NESTA fase e obrigatório na próxima: sem contrato de raciocínio não há o
   * que pedir ao modelo, e a 3.1b deliberadamente não pede nada.
   */
  readonly reasoning_contract_version?: string
}

/**
 * Estados FECHADOS do resultado.
 *
 * Nenhum deles é "sucesso vazio". A distinção que este projeto persegue desde a Fase 2
 * — ausência não é zero, não-executado não é sem-achados — vale igual aqui: um
 * timeout não é "Hermes não encontrou nada", e um transporte quebrado não é
 * "nenhum insight".
 */
export const REASONING_STATES = [
  "SUCCESS",
  /** Nenhum runtime alcançável. Não é ausência de achado. */
  "RUNTIME_NOT_AVAILABLE",
  /** Versão observada difere da governada, para mais ou para menos. */
  "RUNTIME_VERSION_MISMATCH",
  /**
   * Contagem de ferramentas diferente de zero, OU não determinável.
   *
   * Os dois casos são o mesmo estado de propósito: "não sei quantas ferramentas o
   * modelo pode chamar" é tão inaceitável quanto "sei que são três".
   */
  "TOOL_SURFACE_MISMATCH",
  /** Perfil, provider ou modelo divergentes do governado. */
  "RUNTIME_PROFILE_MISMATCH",
  /**
   * A ponte de compatibilidade recusou o runtime.
   *
   * Estado PRÓPRIO, e nunca `MODEL_ERROR`: nenhum modelo foi chamado. Mapear
   * incompatibilidade de runtime para erro de modelo diria que o Hermes respondeu mal
   * quando ele nem foi perguntado — e mandaria quem investiga para o lugar errado.
   *
   * É o que a ponte ACP devolve quando a postura de zero ferramentas não sobrevive à
   * inicialização do agente: em 0.20.4 o caminho ACP de fábrica injeta
   * `enabled_toolsets=["hermes-acp"]` e a contagem efetiva observada foi 15.
   */
  "RUNTIME_CAPABILITY_MISMATCH",
  /** Falha ao iniciar, escrever ou ler o transporte. */
  "TRANSPORT_ERROR",
  /** Limite de tempo estourado. Estado próprio, jamais confundido com vazio. */
  "TIMEOUT",
  /** Enquadramento/protocolo inválido — stdout contaminado, JSON-RPC malformado. */
  "PROTOCOL_ERROR",
  /** O modelo respondeu com erro. Distinto de protocolo e de transporte. */
  "MODEL_ERROR",
  /** A saída não satisfez o contrato canônico. Defeito de conformidade, não vazio. */
  "OUTPUT_NOT_VALIDATED",
  /**
   * Um insight citou referência que ESTA execução não autorizou.
   *
   * Estado PRÓPRIO, e não `OUTPUT_NOT_VALIDATED`: o objeto satisfaz o schema. O que
   * falha é a integridade referencial — o modelo inventou lastro. Colapsar os dois
   * mandaria quem investiga procurar erro de forma onde houve invenção de evidência.
   */
  "REFERENTIAL_VALIDATION_FAILED",
  /** O `read_model` recebido não satisfaz `hermes-read-model`. Hermes não é chamado. */
  "INVALID_READ_MODEL",
  /** O envelope do pedido não é dado canônico simples, ou traz campo desconhecido. */
  "INVALID_REQUEST",
] as const
export type ReasoningState = (typeof REASONING_STATES)[number]

/**
 * Registro de auditoria. Metadado seguro, e só.
 *
 * Sem PII, sem credencial, sem `.env`, sem conteúdo bruto — e sem cadeia de raciocínio
 * privada do modelo. Guardar o pensamento interno seria guardar algo que ninguém
 * governou e que não se pode auditar; o que fica é o que foi validado.
 */
export interface HermesInvocationAudit {
  readonly run_id: string
  readonly requested_at: string
  /** Fornecido pelo transporte, que é a borda impura. Ausente se não informado. */
  readonly completed_at?: string
  /** Derivada dos dois instantes. AUSENTE quando não dá para calcular — nunca zero. */
  readonly duration_ms?: number
  readonly adapter_protocol_version: string
  readonly transport?: string
  readonly bridge_version?: string
  readonly acp_protocol_version?: string
  readonly provider?: string
  readonly model?: string
  readonly expected_tool_count: number
  /** Observado. Ausente significa NÃO OBSERVADO. */
  readonly observed_tool_count?: number
  readonly expected_hermes_version: string
  readonly observed_hermes_version?: string
  /** Identidade de conteúdo do read model enviado. */
  readonly read_model_ref?: string
  readonly input_content_hash?: string
  /** Identidade de conteúdo da saída validada. Ausente quando não houve saída válida. */
  readonly output_content_hash?: string
  readonly status: ReasoningState
}

/**
 * O que se sabe até o momento da montagem da auditoria.
 *
 * Tipo próprio em vez de `Partial<HermesInvocationAudit>`: com
 * `exactOptionalPropertyTypes`, "campo opcional" e "campo que pode valer `undefined`"
 * são coisas diferentes, e aqui o segundo é o que descreve a realidade — a sonda pode
 * ter observado o transporte e não o modelo. O envelope FINAL omite o ausente; este
 * intermediário o carrega como desconhecido explícito.
 */
interface AuditoriaParcial {
  readonly requested_at: string
  readonly completed_at?: string | undefined
  readonly transport?: string | undefined
  readonly bridge_version?: string | undefined
  readonly acp_protocol_version?: string | undefined
  readonly provider?: string | undefined
  readonly model?: string | undefined
  readonly observed_tool_count?: number | undefined
  readonly observed_hermes_version?: string | undefined
  readonly read_model_ref?: string | undefined
  readonly input_content_hash?: string | undefined
  readonly output_content_hash?: string | undefined
}

export type HermesReasoningResultV1 =
  | {
      readonly status: "SUCCESS"
      readonly insights: readonly HermesInsightV1[]
      readonly audit: HermesInvocationAudit
    }
  | {
      readonly status: Exclude<ReasoningState, "SUCCESS">
      readonly audit: HermesInvocationAudit
    }

// ─────────────────────────────────────────────────────────────────────────────
// A porta de transporte
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que o transporte devolve. Dado, nunca texto de banner para parsear.
 *
 * ─── Por que união discriminada, e não um campo opcional ──────────────────────
 *
 * `insights` era opcional, e `undefined ?? []` transformava uma resposta TRUNCADA em
 * zero achados com status de sucesso. Um transporte que esquecesse o payload —
 * ou que fosse cortado no meio — passaria por "o Hermes olhou e não viu nada".
 *
 * É a mesma família de defeito que este projeto persegue desde a Fase 2: ausência
 * virando zero. Aqui o custo é maior, porque o zero fabricado é um relatório de
 * inteligência dizendo que está tudo bem.
 *
 * Com a união, o ramo `responded` NÃO tem como omitir `insights`, e os outros ramos
 * não têm como carregá-lo. A verificação em tempo de execução continua existindo: o
 * transporte é a borda impura, e tipo não vale como prova do lado de lá.
 */
export type TransportResponse =
  | {
      readonly outcome: "responded"
      /** Candidatos a `HermesInsightV1`. Validados pelo adapter, nunca confiados. */
      readonly insights: readonly unknown[]
      /** Instante de conclusão, do lado impuro. */
      readonly completed_at?: string
    }
  | {
      readonly outcome: "timeout" | "protocol_error" | "model_error" | "transport_error"
      readonly completed_at?: string
    }

/**
 * A borda impura, isolada atrás de uma interface.
 *
 * `probe()` existe separado de `send()` de propósito: a pré-checagem tem de acontecer
 * ANTES de qualquer envio, e um transporte que só soubesse enviar tornaria impossível
 * perguntar "posso?" sem já ter perguntado ao modelo.
 *
 * NÃO existe implementação de produção nesta fase. Ver a doc: o transporte só é
 * escolhido depois que a sonda read-only rodar na Hostinger.
 */
export interface HermesTransport {
  /** Identidade observada do runtime. `null` quando não determinável. */
  probe(): Promise<ObservedRuntimeFingerprint | null>
  send(request: {
    readonly read_model: HermesReadModelV1
    readonly requested_at: string
    readonly reasoning_contract_version?: string
  }): Promise<TransportResponse>
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers determinísticos
// ─────────────────────────────────────────────────────────────────────────────

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/** Campos aceitos no envelope. FECHADO, como toda entrada deste projeto. */
const CAMPOS_DE_PEDIDO = new Set<string>([
  "requested_at",
  "read_model",
  "reasoning_contract_version",
])

/**
 * Os desfechos que o transporte pode declarar. FECHADO.
 *
 * `cancelled`, `interrupted`, `partial` e qualquer outro NÃO pertencem a este
 * vocabulário — e é justamente o desfecho fora do vocabulário que precisa ser
 * recusado, porque ele é o único que ninguém previu.
 */
const DESFECHOS_DE_TRANSPORTE = new Set<string>([
  "responded",
  "timeout",
  "protocol_error",
  "model_error",
  "transport_error",
])

/**
 * Campos aceitos por desfecho. FECHADO, como o envelope de pedido.
 *
 * O tipo já diz que `insights` só existe em `responded`; isto é a mesma afirmação do
 * lado de fora do compilador, onde ela pode ser desmentida. Um `insights` chegando
 * junto de `timeout` não é um extra inofensivo: é um transporte com outra ideia do
 * contrato, e a próxima versão dele pode ter ideias piores.
 */
const CAMPOS_POR_DESFECHO: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  responded: new Set(["outcome", "insights", "completed_at"]),
  timeout: new Set(["outcome", "completed_at"]),
  protocol_error: new Set(["outcome", "completed_at"]),
  model_error: new Set(["outcome", "completed_at"]),
  transport_error: new Set(["outcome", "completed_at"]),
})

/**
 * O envelope do transporte, conferido antes de significar qualquer coisa.
 *
 * ─── Por que tipo não basta aqui ─────────────────────────────────────────────
 *
 * `TransportResponse` é uma união discriminada, e isso vale para quem COMPILA contra
 * ela. O transporte é a borda impura: do lado de lá o valor pode ser `null`, um array,
 * uma string, um objeto sem `outcome`, ou um `outcome` que ninguém nunca previu.
 *
 * ─── E por que acesso normal a propriedade também não basta ──────────────────
 *
 *     Object.create({ outcome: "responded", insights: [] })
 *
 * Esse objeto não tem UMA propriedade própria. `Object.keys` devolve `[]` — então uma
 * conferência de campos fechados passa no vazio — e `objeto["outcome"]` devolve
 * `"responded"`, porque a leitura sobe a cadeia de protótipos. Resultado: SUCESSO com
 * zero achados a partir de um envelope que não continha resposta nenhuma.
 *
 * Estado herdado não é estado do protocolo. `outcome` herdado é `outcome` AUSENTE.
 *
 * ─── Descritores, nunca leitura ──────────────────────────────────────────────
 *
 * Toda a conferência é feita sobre `getOwnPropertyDescriptors`, que NÃO executa
 * getters. Ler `objeto.outcome` para descobrir se `outcome` é confiável já teria
 * executado o código de terceiro que estávamos tentando avaliar — a garantia é *não
 * ler*, e não *ler uma vez*. Mesma disciplina da 3.0c.
 *
 * A ordem é obrigatória: Proxy antes de qualquer operação que dispare trap; protótipo
 * antes dos descritores; descritores antes de qualquer `.value`.
 *
 * ─── Política de protótipo ───────────────────────────────────────────────────
 *
 * `Object.prototype` ou `null`, e nada mais — a MESMA regra de `snapshotPlainData` na
 * 3.0c. Manter duas políticas de protótipo no projeto seria manter duas ideias do que
 * é dado canônico, e a que vale seria a que ninguém olhou.
 *
 * `Object.create(null)` é aceito porque é MAIS restrito que um literal, não menos: sem
 * cadeia de protótipos, não há de onde herdar nada.
 *
 * ─── Rasa de propósito ───────────────────────────────────────────────────────
 *
 * Estrutural e de um nível só. `snapshotPlainData` continua sendo aplicado a cada
 * insight, onde ele é a defesa certa. Capturar o envelope inteiro em profundidade
 * reclassificaria um insight não-canônico como falha de PROTOCOLO — e o enquadramento
 * estava correto; quem estava errado era o payload. Perder essa distinção mandaria
 * quem investiga para a camada errada.
 *
 * Devolve `null` quando o envelope não pertence ao protocolo.
 */
function envelopeDeTransporte(bruta: unknown): TransportResponse | null {
  if (bruta === null || typeof bruta !== "object" || Array.isArray(bruta)) return null

  // Proxy PRIMEIRO. `getPrototypeOf`, `getOwnPropertySymbols` e
  // `getOwnPropertyDescriptors` são todas interceptáveis: perguntar qualquer coisa a um
  // Proxy antes de saber que é um Proxy é rodar o código dele.
  if (types.isProxy(bruta)) return null

  const proto = Object.getPrototypeOf(bruta) as unknown
  if (proto !== Object.prototype && proto !== null) return null

  // Chave de símbolo em envelope JSON é estado escondido, não campo de protocolo.
  if (Object.getOwnPropertySymbols(bruta).length > 0) return null

  const descritores = Object.getOwnPropertyDescriptors(bruta)

  // Toda propriedade PRÓPRIA tem de ser dado enumerável. Acessor não é dado — e um
  // `outcome` não-enumerável é um discriminador escondido, que é pior que um ausente.
  for (const d of Object.values(descritores)) {
    if (!("value" in d)) return null
    if (!d.enumerable) return null
  }

  const dDesfecho = descritores["outcome"]
  if (dDesfecho === undefined) return null
  const desfecho: unknown = dDesfecho.value
  // Ausente, herdado e desconhecido são o MESMO estado: nos três casos ninguém sabe o
  // que o transporte quis dizer, e "não sei" não vira desfecho por omissão.
  if (typeof desfecho !== "string" || !DESFECHOS_DE_TRANSPORTE.has(desfecho)) return null

  const permitidos = CAMPOS_POR_DESFECHO[desfecho]
  if (permitidos === undefined) return null
  for (const chave of Object.keys(descritores)) {
    if (!permitidos.has(chave)) return null
  }

  // Só o descritor PRÓPRIO conta. Um `completed_at` no protótipo é invisível aqui, que
  // é exatamente o comportamento desejado: ele nunca é consumido.
  const dTempo = descritores["completed_at"]
  const concluido: unknown = dTempo === undefined ? undefined : dTempo.value
  if (concluido !== undefined && typeof concluido !== "string") return null
  const tempo = concluido === undefined ? {} : { completed_at: concluido }

  if (desfecho === "responded") {
    // `insights` NÃO é validado aqui — só capturado do descritor próprio. Se estiver
    // ausente ou herdado, chega adiante como `undefined` e vira `OUTPUT_NOT_VALIDATED`:
    // o enquadramento chegou, o payload não.
    const dInsights = descritores["insights"]
    return {
      outcome: "responded",
      insights: (dInsights === undefined ? undefined : dInsights.value) as readonly unknown[],
      ...tempo,
    }
  }
  return {
    outcome: desfecho as Exclude<TransportResponse["outcome"], "responded">,
    ...tempo,
  }
}

/** Chaves ordenadas, ordem de array preservada. Mesma canonicalização do resto. */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (typeof v === "object" && v !== null) {
    const entrada = v as Record<string, unknown>
    const saida: Record<string, unknown> = {}
    for (const k of Object.keys(entrada).sort()) {
      Object.defineProperty(saida, k, {
        value: canonico(entrada[k]),
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return saida
  }
  return v
}

const sha = (dominio: string, material: unknown): string =>
  createHash("sha256").update(`${dominio}:${JSON.stringify(material)}`, "utf8").digest("hex")

/**
 * Identidade determinística da execução.
 *
 * Derivada do conteúdo do pedido. Sem `Date.now`, sem `Math.random`, sem UUID: dois
 * pedidos idênticos têm o mesmo `run_id`, e é isso que permite reconhecer repetição em
 * vez de contá-la duas vezes.
 */
function runId(material: unknown): string {
  return `hrun_${sha("hermes_run/v1", material).slice(0, 32)}`
}

/** Diferença entre dois instantes. `undefined` quando não dá para calcular. */
function duracaoMs(inicio: string, fim: string | undefined): number | undefined {
  if (fim === undefined || !RFC3339.test(fim)) return undefined
  const a = Date.parse(inicio)
  const b = Date.parse(fim)
  // Não é leitura de relógio: são dois instantes FORNECIDOS sendo subtraídos.
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined
  const d = b - a
  return d >= 0 ? d : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// O adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fronteira. Uma operação, e uma só.
 *
 * A ordem não é estilo — é a garantia:
 *
 *   1  envelope canônico          objeto externo não é dado estável (Fase 3.0c)
 *   2  read model validado        contrato canônico, antes de qualquer transporte
 *   3  PRÉ-CHECAGEM de runtime    versão, perfil e superfície de ferramentas
 *   4  só então                   o transporte é acionado
 *   5  saída validada             `hermes-insight`, nunca confiada
 *
 * Inverter 3 e 4 seria perguntar ao modelo antes de saber se ele pode agir.
 */
export class CreditumHermesAdapter {
  readonly #transport: HermesTransport

  constructor(transport: HermesTransport) {
    this.#transport = transport
  }

  async reason(request: HermesReasoningRequestV1): Promise<HermesReasoningResultV1> {
    // ─── 1. O envelope, capturado UMA vez ───────────────────────────────────
    //
    // Mesma disciplina da 3.0c: `Proxy` e acessor recusados sem executar, e o objeto
    // do chamador nunca é relido nem congelado.
    const envelope = snapshotPlainData<Record<string, unknown>>(request)
    if (envelope === null || Array.isArray(envelope) || typeof envelope !== "object") {
      return this.#falha("INVALID_REQUEST", { requested_at: "" })
    }
    for (const chave of Object.keys(envelope)) {
      if (!CAMPOS_DE_PEDIDO.has(chave)) {
        return this.#falha("INVALID_REQUEST", { requested_at: "" })
      }
    }

    const requested_at = envelope["requested_at"]
    if (typeof requested_at !== "string" || !RFC3339.test(requested_at)) {
      return this.#falha("INVALID_REQUEST", { requested_at: "" })
    }
    const contrato = envelope["reasoning_contract_version"]
    if (contrato !== undefined && typeof contrato !== "string") {
      return this.#falha("INVALID_REQUEST", { requested_at })
    }

    // ─── 2. O read model, validado ANTES de qualquer transporte ─────────────
    let read_model: HermesReadModelV1
    try {
      read_model = toOwnedHermesReadModel(envelope["read_model"])
    } catch {
      // Hermes não é chamado. Entrada inválida não vira pergunta ao modelo.
      return this.#falha("INVALID_READ_MODEL", { requested_at })
    }

    const input_content_hash = sha("hermes_request/v1", canonico(read_model))
    const base = {
      requested_at,
      read_model_ref: read_model.read_model_id,
      input_content_hash,
    }

    // ─── 3. PRÉ-CHECAGEM: o Hermes pode ser chamado? ───────────────────────
    let observado: ObservedRuntimeFingerprint | null
    try {
      observado = await this.#transport.probe()
    } catch {
      return this.#falha("RUNTIME_NOT_AVAILABLE", base)
    }
    if (observado === null) {
      // Runtime não determinável. Não é "sem ferramentas": é "não sei".
      return this.#falha("RUNTIME_NOT_AVAILABLE", base)
    }

    const comRuntime = {
      ...base,
      transport: observado.transport,
      bridge_version: observado.bridge_version,
      acp_protocol_version: observado.acp_protocol_version,
      provider: observado.provider,
      model: observado.model,
      observed_tool_count: observado.model_callable_tool_count,
      observed_hermes_version: observado.hermes_version,
    }

    if (observado.hermes_version !== GOVERNED_RUNTIME.hermes_version) {
      // Deriva de versão em QUALQUER direção. Uma versão nova não testada é tão
      // desconhecida quanto uma antiga: o upstream já quebrou resolução de toolset
      // numa migração de config, em silêncio.
      return this.#falha("RUNTIME_VERSION_MISMATCH", comRuntime)
    }

    if (observado.hermes_home !== GOVERNED_RUNTIME.hermes_home) {
      // Perfil diferente é memória, sessões, skills e cron diferentes.
      return this.#falha("RUNTIME_PROFILE_MISMATCH", comRuntime)
    }

    // Contagem ausente e contagem não-zero são o MESMO estado: nos dois casos não se
    // pode afirmar que o modelo não age.
    if (observado.model_callable_tool_count !== GOVERNED_RUNTIME.model_callable_tool_count) {
      return this.#falha("TOOL_SURFACE_MISMATCH", comRuntime)
    }

    // ─── A identidade do caminho aprovado, por inteiro ────────────────────
    //
    // Os quatro campos são OBRIGATÓRIOS e exatos. Ausente falha igual a divergente:
    // "nenhuma ponte se identificou" não é uma dispensa da prova, é a falta dela.
    //
    // A ordem — versão, perfil e contagem ANTES disto — é deliberada. Quando o Hermes
    // sobe de versão, a ponte recusa e o veredito deixa de ser `OK`; conferir a
    // identidade primeiro reportaria `RUNTIME_CAPABILITY_MISMATCH` e esconderia o
    // fato mais específico, que é a deriva de versão. Nenhum envio escapa em nenhuma
    // das ordens; o que muda é a qualidade do diagnóstico.
    //
    // `RUNTIME_CAPABILITY_MISMATCH` e nunca `MODEL_ERROR`: nenhum modelo foi chamado.
    if (
      observado.transport !== GOVERNED_RUNTIME.transport ||
      observado.bridge_version !== GOVERNED_RUNTIME.bridge_version ||
      observado.acp_protocol_version !== GOVERNED_RUNTIME.acp_protocol_version ||
      observado.capability_verdict !== GOVERNED_RUNTIME.capability_verdict
    ) {
      return this.#falha("RUNTIME_CAPABILITY_MISMATCH", comRuntime)
    }

    // ─── 4. Só agora o transporte é acionado ───────────────────────────────
    let bruta: unknown
    try {
      bruta = await this.#transport.send({
        read_model,
        requested_at,
        ...(typeof contrato === "string" ? { reasoning_contract_version: contrato } : {}),
      })
    } catch {
      return this.#falha("TRANSPORT_ERROR", comRuntime)
    }

    // ─── 4.1. O envelope INTEIRO, conferido antes de significar algo ───────
    //
    // Nada é lido do objeto do transporte antes disto — nem `completed_at`. Ler antes
    // seria confiar na forma para descobrir se a forma é confiável, e um `null` ali
    // viraria exceção escapando por fora do envelope de falha governado.
    const resposta = envelopeDeTransporte(bruta)
    if (resposta === null) {
      // Desfecho fora do vocabulário, ausente, ou envelope que não é objeto de
      // protocolo. `PROTOCOL_ERROR`: o enquadramento é que está errado, e nenhuma
      // afirmação sobre achados pode ser extraída daqui.
      return this.#falha("PROTOCOL_ERROR", comRuntime)
    }

    const comTempo = { ...comRuntime, completed_at: resposta.completed_at }

    switch (resposta.outcome) {
      case "timeout":
        // Estado próprio. Um Hermes travado NÃO é um Hermes sem achados.
        return this.#falha("TIMEOUT", comTempo)
      case "protocol_error":
        return this.#falha("PROTOCOL_ERROR", comTempo)
      case "model_error":
        return this.#falha("MODEL_ERROR", comTempo)
      case "transport_error":
        return this.#falha("TRANSPORT_ERROR", comTempo)
      case "responded":
        break
      default: {
        // Segunda defesa, em tempo de COMPILAÇÃO. Se um desfecho novo entrar na união
        // e ninguém o tratar, `nunca` deixa de ser `never` e o typecheck quebra —
        // aqui, e não em produção com o modelo do outro lado.
        const nunca: never = resposta
        void nunca
        return this.#falha("PROTOCOL_ERROR", comTempo)
      }
    }

    // ─── 5. A saída é validada, nunca confiada ─────────────────────────────
    //
    // Cada insight tem de satisfazer `hermes-insight` — o contrato canônico da 3.0a,
    // não um schema novo inventado aqui. A 3.1c define QUAIS insights se espera; a
    // 3.1b só afirma que o que voltar tem a forma governada.
    // A resposta chegou inteira? `insights` PRECISA existir e ser um array.
    //
    //     { outcome: "responded", insights: [] }   olhou e não viu nada    VÁLIDO
    //     { outcome: "responded" }                 chegou pela metade      INVÁLIDO
    //
    // A versão anterior usava `brutos ?? []` e colapsava as duas em sucesso vazio.
    // `null`, objeto e string caem aqui pelo mesmo motivo: enquadramento correto com
    // payload que não é o payload.
    const brutos = resposta.insights
    if (!Array.isArray(brutos)) {
      return this.#falha("OUTPUT_NOT_VALIDATED", comTempo)
    }
    const insights: HermesInsightV1[] = []
    for (const bruto of brutos) {
      const proprio = snapshotPlainData<unknown>(bruto)
      if (proprio === null) return this.#falha("OUTPUT_NOT_VALIDATED", comTempo)
      try {
        assertValid("hermes-insight", proprio)
      } catch {
        // Um insight fora do contrato invalida a resposta INTEIRA. Descartar o
        // inválido e seguir com os demais entregaria um conjunto que parece íntegro —
        // e o descartado pode ser justamente o que continha a ressalva.
        return this.#falha("OUTPUT_NOT_VALIDATED", comTempo)
      }
      insights.push(deepFreeze(proprio as HermesInsightV1))
    }

    // ─── 5.1. As referências citadas EXISTEM nesta execução? ───────────────
    //
    // Contra o MESMO read model próprio capturado no passo 2 — nunca uma recaptura do
    // grafo do chamador depois do transporte. Duas capturas em momentos diferentes
    // poderiam ver dois estados: o pedido vinculado a um, a saída conferida contra o
    // outro.
    //
    // Referência pendurada invalida a resposta INTEIRA. Se o modelo citou evidência que
    // não existe, o problema não é aquele enunciado — é que a resposta veio de um
    // processo disposto a inventar lastro.
    const referencial = validateInsightsAgainstReadModel(read_model, insights)
    if (referencial.status !== "accepted") {
      return this.#falha("REFERENTIAL_VALIDATION_FAILED", comTempo)
    }

    const output_content_hash = sha("hermes_output/v1", canonico(insights))
    return deepFreeze({
      status: "SUCCESS" as const,
      insights: Object.freeze(insights) as readonly HermesInsightV1[],
      audit: this.#audit("SUCCESS", { ...comTempo, output_content_hash }),
    })
  }

  #falha(
    status: Exclude<ReasoningState, "SUCCESS">,
    parcial: AuditoriaParcial,
  ): HermesReasoningResultV1 {
    return deepFreeze({ status, audit: this.#audit(status, parcial) })
  }

  #audit(
    status: ReasoningState,
    parcial: AuditoriaParcial,
  ): HermesInvocationAudit {
    const material = {
      v: RUN_ID_VERSION,
      protocol: ADAPTER_PROTOCOL_VERSION,
      requested_at: parcial.requested_at,
      input: parcial.input_content_hash ?? null,
      ref: parcial.read_model_ref ?? null,
    }
    const duration_ms = duracaoMs(parcial.requested_at, parcial.completed_at)
    // Campo ausente quando não há valor. `?? 0` diria "levou zero", e desconhecido
    // nunca é zero — a regra que atravessa este projeto desde a Fase 2.
    return deepFreeze({
      run_id: runId(material),
      requested_at: parcial.requested_at,
      ...(parcial.completed_at === undefined ? {} : { completed_at: parcial.completed_at }),
      ...(duration_ms === undefined ? {} : { duration_ms }),
      adapter_protocol_version: ADAPTER_PROTOCOL_VERSION,
      ...(parcial.transport === undefined ? {} : { transport: parcial.transport }),
      ...(parcial.bridge_version === undefined
        ? {}
        : { bridge_version: parcial.bridge_version }),
      ...(parcial.acp_protocol_version === undefined
        ? {}
        : { acp_protocol_version: parcial.acp_protocol_version }),
      ...(parcial.provider === undefined ? {} : { provider: parcial.provider }),
      ...(parcial.model === undefined ? {} : { model: parcial.model }),
      expected_tool_count: GOVERNED_RUNTIME.model_callable_tool_count,
      ...(parcial.observed_tool_count === undefined
        ? {}
        : { observed_tool_count: parcial.observed_tool_count }),
      expected_hermes_version: GOVERNED_RUNTIME.hermes_version,
      ...(parcial.observed_hermes_version === undefined
        ? {}
        : { observed_hermes_version: parcial.observed_hermes_version }),
      ...(parcial.read_model_ref === undefined ? {} : { read_model_ref: parcial.read_model_ref }),
      ...(parcial.input_content_hash === undefined
        ? {}
        : { input_content_hash: parcial.input_content_hash }),
      ...(parcial.output_content_hash === undefined
        ? {}
        : { output_content_hash: parcial.output_content_hash }),
      status,
    })
  }
}
