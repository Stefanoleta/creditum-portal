/**
 * Fase 3.0b — o assembler determinístico do `ExecutiveBriefingV1`.
 *
 * ─── O que ele é ──────────────────────────────────────────────────────────────
 *
 * Uma função PURA que transforma resultados governados num pacote canônico. Não lê
 * relógio, não sorteia, não abre socket, não chama modelo. Mesma entrada, mesma
 * saída — incluindo o `briefing_id`.
 *
 * ─── O que ele NÃO é ──────────────────────────────────────────────────────────
 *
 * Ele não raciocina, não recomenda, não prioriza e não escreve narrativa. Não existe
 * campo aqui para "as vendas estão preocupantes" — isso é `HermesInsight` com `kind`
 * declarado, e é fase futura.
 *
 * Ele também não recalcula regra de negócio. As populações comerciais vêm de
 * `countPopulations`, que é a regra da Fase 2.12 sendo CHAMADA; os fatos de prazo vêm
 * prontos da Fase 2.13, e não existe aritmética de D-4/D-1 neste arquivo. Recalcular
 * criaria uma segunda resposta para a mesma pergunta, e a que estivesse errada só
 * apareceria quando as duas discordassem.
 *
 * ─── Onde ele vive, e por quê ─────────────────────────────────────────────────
 *
 * `integration/src/briefing/`. O assembler consome tipos de `integration` (o
 * resultado do Lucas) e produz um contrato validado por `gateway` — e a direção de
 * dependência do repositório é integration → gateway, nunca o contrário. Colocá-lo em
 * `gateway/src` inverteria a camada: os contratos passariam a depender de quem os
 * consome. Não criei `hermes-runtime/`: não há runtime nenhum aqui.
 *
 * ─── A regra que atravessa tudo ───────────────────────────────────────────────
 *
 *   DESCONHECIDO NUNCA É ZERO.
 *   NÃO EXECUTADO NUNCA É SEM ACHADOS.
 *
 * Os seis estados de produção do Lucas são tratados um por um, com `switch`
 * exaustivo. Estado novo no contrato a montante sem tratamento aqui não compila.
 */

import { createHash } from "node:crypto"
import { assertValid } from "../../../gateway/src/contracts"
import { deepFreeze } from "../../../gateway/src/immutability"
import type { ExecutiveBriefingV1 } from "../../../gateway/src/hermes"
import type { LucasAnalysisOutcome } from "../lucas/analysis"
import { countPopulations } from "../lucas/status-semantics"
import { LUCAS_DATASET_ID } from "../lucas/drive-port"
import { ROW_QUALITY_FACTS, SOURCE_QUALITY_FACTS } from "../lucas/source-quality"
import type { LucasSourceProjection } from "./source-projection"

/** Versão do material de identidade. Muda o `briefing_id` de propósito. */
export const BRIEFING_ID_VERSION = "1.0.0" as const

/**
 * Entrada canônica e ESTREITA.
 *
 * Sem `Record<string, unknown>` e sem cliente Google: o assembler recebe resultado
 * governado, nunca a capacidade de ir buscá-lo. Aquisição de fonte e montagem de
 * briefing são responsabilidades diferentes, e misturá-las tornaria impossível testar
 * a montagem sem rede.
 */
export interface ExecutiveBriefingAssemblyInput {
  /**
   * Instante da geração, JÁ capturado pelo chamador.
   *
   * O assembler não lê relógio — se lesse, duas montagens da mesma entrada
   * produziriam briefings diferentes e a determinística deixaria de ser verificável.
   */
  readonly generated_at: string
  /**
   * Período canônico do briefing.
   *
   * Vem explícito e é CONFERIDO contra o período do resultado. Divergência falha
   * fechada: um briefing rotulado agosto sobre dados de julho é pior que briefing
   * nenhum, porque parece confiável.
   */
  readonly period: string
  /** O resultado de produção do Lucas, tal como a orquestração o devolveu. */
  readonly lucas: LucasAnalysisOutcome
}

export const ASSEMBLY_DEFECTS = [
  /** `period` do input não bate com o do resultado governado. */
  "PERIOD_MISMATCH",
  /** `generated_at` não é timestamp válido. */
  "INVALID_GENERATED_AT",
  /** Um fato cita evidência que não está no índice autoritativo. */
  "DANGLING_EVIDENCE_REF",
  /**
   * Estado governado a montante que este assembler não sabe representar.
   *
   * Acontece se um `DeadlineFact` chegar com estado derivado fora dos quatro que
   * emitem fato. O tipo a montante é mais largo que a realidade — e assumir que a
   * realidade se comporta é como o furo de tipo-como-validação da 3.0a.
   */
  "UNSUPPORTED_GOVERNED_STATE",
  /**
   * Resultado utilizável chegou SEM a projeção governada da fonte.
   *
   * `d_executed` e `d_not_executed` exigem projeção não-nula: é dela que saem o
   * índice autoritativo de evidência, a medição de qualidade e o estado de visão da
   * fonte. Sem ela não se pode afirmar `available`, nem `available_empty`, nem
   * qualidade alguma.
   *
   * Isto NÃO é `source_not_available`. Fonte ausente é estado de negócio, e tem os
   * seus próprios quatro estados. Resultado utilizável sem a fonte que o sustenta é
   * defeito de programação/integração — provavelmente um objeto desserializado ou
   * `as`-cast que atravessou a fronteira. Classificar um como o outro esconderia um
   * bug nosso atrás de uma resposta plausível sobre a planilha do Lucas.
   *
   * O tipo já proíbe isto. O tipo não roda em produção: TypeScript não é validação de
   * runtime, e foi exatamente esse furo que a 3.0a fechou na fronteira de autoridade.
   */
  "MISSING_REQUIRED_SOURCE_PROJECTION",
  /**
   * A saída não satisfez `executive-briefing`.
   *
   * Isto NÃO é estado de fonte: é defeito nosso. Mascará-lo como
   * "fonte indisponível" esconderia um bug atrás de uma resposta plausível.
   */
  "OUTPUT_CONTRACT_VIOLATION",
] as const
export type AssemblyDefect = (typeof ASSEMBLY_DEFECTS)[number]

export type ExecutiveBriefingAssembly =
  | { readonly status: "assembled"; readonly briefing: ExecutiveBriefingV1 }
  | { readonly status: "not_assembled"; readonly defect: AssemblyDefect }

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const PERIODO = /^\d{4}-\d{2}$/

/** Os quatro estados derivados que o briefing sabe transportar. */
const ESTADOS_DE_PRAZO = [
  "p_signature_deadline_attention",
  "a_emission_deadline_alert",
  "contract_deadline_missed",
  "auto_cancelled_by_deadline",
] as const
type EstadoDePrazo = (typeof ESTADOS_DE_PRAZO)[number]

/** Estreita o estado derivado, ou devolve `null`. Não presume, confere. */
function estadoDePrazo(s: string): EstadoDePrazo | null {
  return (ESTADOS_DE_PRAZO as readonly string[]).includes(s) ? (s as EstadoDePrazo) : null
}

/** Os dois estados em que existe captura utilizável — e portanto projeção obrigatória. */
type ResultadoUtilizavel = Extract<LucasAnalysisOutcome, { readonly status: "d_executed" | "d_not_executed" }>

/** Os quatro resultados MEDIDOS. `not_measured` não é um deles — é a ausência deles. */
const QUALIDADE_MEDIDA = ["ok", "degraded", "conflicted", "insufficient"] as const

const ehTexto = (x: unknown): x is string => typeof x === "string"

/**
 * Confere que a projeção da fonte é a estrutura governada que este assembler consome.
 *
 * Não é validação decorativa: cada campo aqui sustenta uma afirmação do briefing. Sem
 * `evidence_ids` não há índice autoritativo e a integridade referencial passaria a ser
 * verdadeira por construção; sem `view_state` não se sabe se a fonte está vazia ou
 * cheia; sem `quality_status` medido não há medição a transportar.
 *
 * Confere SÓ o que é consumido. Endurecer campos que ninguém lê transformaria
 * qualquer bug interno em `INVALID_INPUT` e afogaria o sinal.
 *
 * ─── FORMA DE TIPO NÃO É VALOR GOVERNADO ──────────────────────────────────────
 *
 * A primeira versão desta guarda perguntava "é string?" e seguia. A revisão
 * adversarial mostrou o que isso permite:
 *
 *   dataset_id: "fabricated_dataset"          identidade de fonte inventada
 *   source_quality: ["FABRICATED_STATE"]      fato de qualidade inventado
 *   row_quality_counts: { FABRICATED: 12 }    contagem sobre fato inexistente
 *
 * Os três atravessariam a guarda, entrariam no briefing e sairiam válidos pelo
 * schema — porque o schema tipa `string`, e não sabe distinguir rótulo governado de
 * rótulo inventado. Todo campo que representa IDENTIDADE, VOCABULÁRIO ou FATO
 * governado é conferido contra a lista canônica, importada de onde ela vive.
 */
const FATOS_DE_FONTE = new Set<string>(SOURCE_QUALITY_FACTS)
const FATOS_DE_LINHA = new Set<string>(ROW_QUALITY_FACTS)

/** Contagem governada: inteiro seguro e não-negativo. Recusa NaN, ∞, fração e negativo. */
const ehContagem = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0

function projecaoGovernada(x: unknown): LucasSourceProjection | null {
  if (typeof x !== "object" || x === null) return null
  const p = x as Record<string, unknown>

  // Identidade de fonte: UMA, a canônica. Nome de arquivo externo, id de planilha ou
  // qualquer outra string não é identidade de dataset.
  if (p["dataset_id"] !== LUCAS_DATASET_ID) return null

  if (p["view_state"] !== "available" && p["view_state"] !== "available_empty") return null
  if (!(QUALIDADE_MEDIDA as readonly unknown[]).includes(p["quality_status"])) return null
  if (!Array.isArray(p["evidence_ids"]) || !p["evidence_ids"].every(ehTexto)) return null

  // Cada fato de fonte tem de EXISTIR no vocabulário. Texto livre disfarçado de fato
  // determinístico é a pior forma de nota model-facing: parece medição.
  const fonte = p["source_quality"]
  if (!Array.isArray(fonte)) return null
  if (!fonte.every((f) => ehTexto(f) && FATOS_DE_FONTE.has(f))) return null

  // Chaves PRÓPRIAS e enumeráveis, contra a lista canônica — `Set.has` em vez de
  // `in`, que também acharia `toString` no protótipo.
  const contagens = p["row_quality_counts"]
  if (typeof contagens !== "object" || contagens === null) return null
  for (const [chave, valor] of Object.entries(contagens as Record<string, unknown>)) {
    // Chave desconhecida é estado governado inventado. NÃO se descarta em silêncio:
    // descartar deixaria passar uma projeção que já provou não ser governada.
    if (!FATOS_DE_LINHA.has(chave)) return null
    if (!ehContagem(valor)) return null
  }

  const cob = p["coverage"]
  if (cob !== null && cob !== undefined) {
    if (typeof cob !== "object") return null
    const c = cob as Record<string, unknown>
    if (!ehContagem(c["expected_units"]) || !ehContagem(c["reporting_units"])) return null
  }
  return x as LucasSourceProjection
}

/**
 * Capacidades que este briefing NÃO cobre, e por quê.
 *
 * ─── `deferred` não é `unavailable` ───────────────────────────────────────────
 *
 * `deferred` diz "existe decisão de não fazer ainda". `unavailable` diria "deveria
 * funcionar e não está". Detector B e C estão adiados por decisão governada, não
 * quebrados — e o dashboard do Leonardo menos ainda: ele funciona, apenas não é
 * consumido por este assembler.
 *
 * É a distinção do §21/§22: SOURCE HEALTH não é INTEGRATION CAPABILITY. Declarar o
 * financeiro em `source_health` como indisponível diria que a fonte do Leonardo está
 * com problema, o que é falso e injusto com o dono dela.
 */
const CAPACIDADES_AUSENTES: ExecutiveBriefingV1["unavailable_capabilities"] = Object.freeze([
  Object.freeze({
    capability: "FINANCE_DOMAIN",
    status: "deferred" as const,
    reason: Object.freeze({
      untrusted: true as const,
      content:
        "Dashboard financeiro/cobrança segue sob ownership do Leonardo e NÃO é consumido " +
        "por este assembler. Ausência aqui é integração pendente, não falha de fonte.",
    }),
  }),
  Object.freeze({
    capability: "DETECTOR_B_FINANCE_RECONCILIATION",
    status: "deferred" as const,
    reason: Object.freeze({
      untrusted: true as const,
      content: "Exige segunda fonte governada e período de graça aprovado. Nenhum dos dois existe.",
    }),
  }),
  Object.freeze({
    capability: "DETECTOR_C_FIRST_DUE_DATE",
    status: "deferred" as const,
    reason: Object.freeze({
      untrusted: true as const,
      content:
        "FIRST_DUE_DATE_ORIGINAL segue ausente. Desembolso NÃO é substituto de Venc: " +
        "são campos e conceitos diferentes.",
    }),
  }),
  Object.freeze({
    capability: "FULLY_COMPLETED_SALE",
    status: "deferred" as const,
    reason: Object.freeze({
      untrusted: true as const,
      content: "Exige confirmação de pagamento no Omie, que não é fonte observável nesta fase.",
    }),
  }),
])

/** Texto governado, no envelope obrigatório. Nunca instrução, sempre dado. */
const nota = (content: string): { readonly untrusted: true; readonly content: string } =>
  Object.freeze({ untrusted: true as const, content })

/**
 * Identidade do briefing, determinística.
 *
 * ─── O que a determina ────────────────────────────────────────────────────────
 *
 *   versão do material · generated_at · period · scope
 *   estado do resultado do Lucas · o corpo montado
 *
 * Nada de `Math.random`, `Date.now` ou contador. O material é a estrutura tipada
 * serializada em ordem FIXA de campos, nunca iteração sobre chaves do objeto: ordem
 * de inserção de propriedade não pode influenciar identidade.
 *
 * `generated_at` ENTRA de propósito: dois briefings do mesmo conteúdo gerados em
 * momentos distintos são dois briefings, e um `briefing_id` que os colapsasse
 * impediria referenciar a montagem específica que alguém leu.
 */
function briefingId(material: unknown): string {
  const hash = createHash("sha256")
    .update(`executive_briefing/v1:${JSON.stringify(material)}`, "utf8")
    .digest("hex")
    .slice(0, 32)
  return `brf_${hash}`
}

/** Conjunto canônico: ordenado e sem repetição. Ordem de entrada não é semântica. */
const conjunto = (xs: readonly string[]): readonly string[] => [...new Set(xs)].sort()

type EstadoDeFonte = ExecutiveBriefingV1["source_health"][number]["view_state"]

/** Os resultados SEM captura utilizável. */
type ResultadoSemCaptura = Exclude<LucasAnalysisOutcome, ResultadoUtilizavel>

/**
 * Estado de fonte para os resultados SEM captura.
 *
 * Os dois estados utilizáveis NÃO estão aqui de propósito. A versão anterior os
 * cobria devolvendo `available` fixo — e a revisão adversarial mostrou o que isso
 * produzia: com captura vazia legítima, o briefing dizia `source_health = available` e
 * `commercial_state = available_empty` ao mesmo tempo. Duas afirmações contraditórias
 * sobre a mesma fonte, ambas válidas pelo schema.
 *
 * A distinção `available` × `available_empty` tem UMA autoridade: o provider, que a
 * decide ao construir a captura. Retirar os dois estados desta função é o que impede
 * que ela volte a ser uma segunda autoridade.
 *
 * `switch` exaustivo sobre os quatro restantes: um estado novo sem captura não
 * compila. Sem isso, cairia num `default` e apareceria como "fonte ok".
 */
function viewStateSemCaptura(o: ResultadoSemCaptura): EstadoDeFonte {
  switch (o.status) {
    case "source_not_available":
      return "data_not_available"
    case "source_error":
      return "source_error"
    case "source_invalid":
      return "invalid_source"
    case "not_current":
      // A fonte foi lida; o que não serve é o PERÍODO dela. `available` seria
      // enganoso num briefing do mês corrente, e `source_error` culparia a fonte por
      // uma condição temporal. `data_not_available` diz o que é verdade: o dado do
      // período pedido não está disponível aqui.
      return "data_not_available"
  }
}

/**
 * Monta o briefing. PURA, determinística, falha fechada.
 *
 * A ordem importa: as conferências de contrato acontecem antes de qualquer montagem,
 * e a validação de schema antes de qualquer retorno. Um briefing fora do contrato
 * nunca sai desta função — tipo TypeScript não é validação, e a Fase 3.0a fechou
 * exatamente esse furo na fronteira de autoridade.
 */
export function assembleExecutiveBriefingV1(
  input: ExecutiveBriefingAssemblyInput,
): ExecutiveBriefingAssembly {
  // ─── Conferências de entrada, antes de montar qualquer coisa ──────────────
  if (typeof input.generated_at !== "string" || !RFC3339.test(input.generated_at)) {
    return { status: "not_assembled", defect: "INVALID_GENERATED_AT" }
  }
  if (typeof input.period !== "string" || !PERIODO.test(input.period)) {
    return { status: "not_assembled", defect: "PERIOD_MISMATCH" }
  }
  // O período do briefing tem de ser o período que a análise afirma. Divergência
  // silenciosa produziria um rótulo confiável sobre dados de outro mês.
  if (input.period !== input.lucas.period) {
    return { status: "not_assembled", defect: "PERIOD_MISMATCH" }
  }

  const o = input.lucas

  // ─── A projeção da fonte, exigida onde o resultado é utilizável ───────────
  //
  // Nos quatro estados sem captura não existe projeção — e não deveria existir.
  // Nos dois utilizáveis ela é OBRIGATÓRIA, e a conferência é de runtime porque o
  // tipo não acompanha um objeto que veio de `JSON.parse` ou de um `as`.
  // O par (resultado utilizável, projeção) anda JUNTO de propósito: separá-los em duas
  // variáveis faria o compilador perder a correlação, e a reconferência que ele exigiria
  // seria um ramo inalcançável — código que nenhum teste pode matar.
  let utilizavel: { readonly o: ResultadoUtilizavel; readonly source: LucasSourceProjection } | null =
    null
  // UM estado de fonte para o briefing inteiro. Calculado aqui, onde a correlação
  // entre resultado e projeção existe, e usado nas DUAS dimensões que o contrato tem.
  let view_state: EstadoDeFonte
  if (o.status === "d_executed" || o.status === "d_not_executed") {
    const projecao = projecaoGovernada(o.source)
    if (projecao === null) {
      // Falha FECHADA, antes de montar qualquer métrica. Continuar com `null` faria
      // o briefing declarar `available` sem evidência e `not_measured` sem verdade:
      // a ausência seria de uma projeção perdida, não de uma medição inexistente.
      return { status: "not_assembled", defect: "MISSING_REQUIRED_SOURCE_PROJECTION" }
    }
    utilizavel = { o, source: projecao }
    view_state = projecao.view_state
  } else {
    view_state = viewStateSemCaptura(o)
  }
  const source: LucasSourceProjection | null = utilizavel === null ? null : utilizavel.source

  // ─── source_health ────────────────────────────────────────────────────────
  //
  // SOMENTE a fonte efetivamente observada nesta montagem. O financeiro não entra:
  // não foi observado, e declarar health de fonte não observada seria inventar.
  const source_health: ExecutiveBriefingV1["source_health"] = [
    {
      // Identidade canônica, uma só. A projeção é conferida contra esta MESMA
      // constante, então escolher entre as duas seria escolher entre iguais.
      dataset_id: LUCAS_DATASET_ID,
      owner: "LUCAS" as const,
      view_state,
      ...(o.status === "source_not_available"
        ? { detail: nota(`arquivo esperado ausente: ${o.expected_file_name}`) }
        : {}),
      ...(o.status === "source_error" ? { detail: nota("falha ao ler a fonte") } : {}),
      ...(o.status === "source_invalid" ? { detail: nota(`estrutura recusada: ${o.reason}`) } : {}),
      ...(o.status === "not_current"
        ? { detail: nota(`${o.reason}: captura é de ${o.capture_period}`) }
        : {}),
    },
  ]

  // ─── commercial_state ─────────────────────────────────────────────────────
  //
  // Métrica só existe onde houve leitura. Nos quatro estados sem captura o objeto
  // carrega o `view_state` e MAIS NADA — é a proibição estrutural que o schema
  // impõe, e ela existe porque `emitted: 0` sobre fonte ausente é ausência virando
  // zero executivo.
  let commercial_state: ExecutiveBriefingV1["commercial_state"]
  if (utilizavel !== null) {
    // `countPopulations` é a regra da Fase 2.12 sendo CHAMADA, não reescrita. Contar
    // sobre E+A+P dá os mesmos três números que contar sobre todas as linhas: `C`
    // contribui zero para as três populações.
    const c = countPopulations(utilizavel.o.population.rows)
    commercial_state = {
      // O MESMO valor que foi para `source_health`. Duas leituras independentes da
      // mesma verdade é como nasceu a contradição que a revisão encontrou.
      view_state,
      commercial_potential: c.COMMERCIAL_POTENTIAL,
      commercially_confirmed: c.COMMERCIALLY_CONFIRMED,
      emitted: c.EMITTED,
      fully_completed: { status: "DEFERRED_REQUIRES_OMIE_PAYMENT" as const },
    }
  } else {
    commercial_state = { view_state }
  }

  // ─── operational_facts ────────────────────────────────────────────────────
  //
  // Transporte. Nenhum fato é criado aqui, nenhuma severidade é atribuída, nenhuma
  // data de prazo é recalculada.
  const operational_facts: NonNullable<ExecutiveBriefingV1["operational_facts"]>[number][] = []
  if (o.status === "d_executed" || o.status === "d_not_executed") {
    for (const f of o.facts.awaiting_creditum_signature) {
      if (f.subject_ref === null) continue
      operational_facts.push({
        fact_type: "AWAITING_CREDITUM_SIGNATURE",
        subject_ref: f.subject_ref,
        source_status: "A",
        ...(f.unit_id === null ? {} : { unit_id: f.unit_id }),
        severity: f.severity,
        severity_status: f.severity_status,
        evidence_refs: conjunto(f.evidence_refs),
      })
    }
    for (const f of o.facts.pending_student_signature) {
      if (f.subject_ref === null) continue
      operational_facts.push({
        fact_type: "PENDING_STUDENT_SIGNATURE",
        subject_ref: f.subject_ref,
        source_status: "P",
        ...(f.unit_id === null ? {} : { unit_id: f.unit_id }),
        severity: f.severity,
        severity_status: f.severity_status,
        evidence_refs: conjunto(f.evidence_refs),
      })
    }
    for (const f of o.deadline.facts) {
      if (f.subject_ref === null) continue
      // O tipo a montante admite sete estados; só quatro emitem fato. Conferir em vez
      // de presumir — presumir é o furo de tipo-como-validação que a 3.0a fechou.
      const derivado = estadoDePrazo(f.derived_deadline_state)
      if (derivado === null) {
        return { status: "not_assembled", defect: "UNSUPPORTED_GOVERNED_STATE" }
      }
      operational_facts.push({
        fact_type: f.fact,
        subject_ref: f.subject_ref,
        // O que a FONTE afirma, preservado. O estado derivado viaja ao lado, e
        // nenhum dos dois sobrescreve o outro.
        source_status: f.source_status,
        derived_deadline_state: derivado,
        deadline: f.deadline,
        evaluation_date: f.evaluation_date,
        offset_days: f.offset_days,
        recovery_candidate: f.recovery_candidate,
        recovery_semantics: f.recovery_semantics,
        ...(f.unit_id === null ? {} : { unit_id: f.unit_id }),
        severity: f.severity,
        severity_status: f.severity_status,
        evidence_refs: conjunto(f.evidence_refs),
      })
    }
  }
  // Ordem canônica por (tipo, sujeito): a entrada é semanticamente um conjunto, e
  // ordenar por severidade introduziria prioridade que ninguém governou.
  operational_facts.sort((a, b) =>
    a.fact_type === b.fact_type
      ? a.subject_ref.localeCompare(b.subject_ref)
      : a.fact_type.localeCompare(b.fact_type),
  )

  // ─── detector_results ─────────────────────────────────────────────────────
  const detector_results: ExecutiveBriefingV1["detector_results"][number][] = []
  switch (o.status) {
    case "d_executed":
      detector_results.push({
        detector: "D",
        // Zero achados aqui é ZERO CONHECIDO: rodou e não encontrou.
        execution_state:
          o.detector.events.length > 0
            ? ("executed_with_findings" as const)
            : ("executed_no_findings" as const),
        events: o.detector.events.length,
        candidates_evaluated: o.detector.summary.candidates_evaluated,
        quality_status: o.detector.summary.quality_status,
        population: o.population.population,
      })
      break
    case "d_not_executed":
      // NUNCA `executed_no_findings`. A razão governada viaja com o estado.
      detector_results.push({
        detector: "D",
        execution_state: "not_executed" as const,
        not_executed_reason: o.reason,
        population: o.population.population,
      })
      break
    case "source_not_available":
    case "source_error":
    case "source_invalid":
    case "not_current":
      // Sem fonte utilizável o detector não ficou "sem achados": ele não teve entrada.
      detector_results.push({
        detector: "D",
        execution_state: "unavailable" as const,
      })
      break
  }

  // ─── material_findings ────────────────────────────────────────────────────
  //
  // Só o que detector governado produziu. Nenhum finding nasce aqui, e nenhum
  // ranking é aplicado.
  const material_findings =
    o.status === "d_executed" ? conjunto(o.detector.events.map((e) => e.event_id)) : []

  // ─── quality_and_coverage ─────────────────────────────────────────────────
  const notas: { readonly untrusted: true; readonly content: string }[] = []
  if (source !== null) {
    // `conjunto` porque a montante `source_quality` É um conjunto: o provider ordena
    // um `Set`. Repetição numa projeção crua não é fato adicional, e transformá-la em
    // duas notas daria a um mesmo fato o peso de dois.
    for (const q of conjunto(source.source_quality)) notas.push(nota(`source_quality: ${q}`))
    for (const [f, n] of Object.entries(source.row_quality_counts).sort()) {
      notas.push(nota(`row_quality: ${f}=${String(n)}`))
    }
  }
  if (o.status === "d_not_executed") {
    for (const d of [...o.duplicated_subjects].sort((a, b) =>
      a.subject_ref.localeCompare(b.subject_ref),
    )) {
      notas.push(nota(`duplicated_subject: ${d.subject_ref} (${String(d.contracts)} contratos)`))
    }
  }
  if (o.status === "d_executed" || o.status === "d_not_executed") {
    // A distinção do §15: "avaliado e não há casos" contra "não consegui avaliar".
    // Sem esta nota, `deadline` sem fato pareceria segurança.
    const n = o.deadline.not_evaluable.length
    if (n > 0) notas.push(nota(`deadline_not_evaluable: ${String(n)} contrato(s)`))
  }

  // ─── MEDIDO não é NÃO-MEDIDO ──────────────────────────────────────────────
  //
  // Três situações, e a terceira não é a segunda:
  //
  //   medido e suficiente      ok / degraded
  //   medido e insuficiente    insufficient / conflicted
  //   NÃO medido               not_measured
  //
  // `insufficient` significa "cobertura baixa demais para afirmar" — é RESULTADO de
  // medição. Usá-lo quando não houve captura convertia ausência de medição em
  // conclusão sobre a qualidade, que é a mesma família de defeito de
  // "desconhecido virou zero": uma resposta plausível onde não há resposta.
  //
  // No ramo não-medido o schema PROÍBE `expected_units` e `reporting_units`. A
  // proteção é estrutural: não existe onde escrever a medição de zero.
  const quality_and_coverage: ExecutiveBriefingV1["quality_and_coverage"] =
    source === null
      ? {
          quality_status: "not_measured" as const,
          ...(notas.length === 0 ? {} : { notes: notas }),
        }
      : {
          // Transporte do veredito governado. O assembler não julga qualidade.
          quality_status: source.quality_status,
          ...(source.coverage == null
            ? {}
            : {
                expected_units: source.coverage.expected_units,
                reporting_units: source.coverage.reporting_units,
              }),
          ...(notas.length === 0 ? {} : { notes: notas }),
        }

  // ─── evidence_index e integridade referencial ─────────────────────────────
  //
  // O índice é o AUTORITATIVO da captura, não a união do que os fatos citam. Com a
  // união, integridade seria verdadeira por construção e o teste dela seria vazio.
  // `[]` aqui é o índice de quem não observou nada — e só chega neste ponto quando
  // não houve captura. Resultado utilizável sem projeção já falhou fechado acima:
  // nunca se cai num índice vazio por perda da fonte.
  const evidence_index = conjunto(source === null ? [] : source.evidence_ids)
  const noIndice = new Set(evidence_index)
  for (const f of operational_facts) {
    for (const r of f.evidence_refs ?? []) {
      if (!noIndice.has(r)) {
        // Remover a referência em silêncio esconderia a inconsistência; declarar
        // sem lastro produziria um fato que não se pode auditar.
        return { status: "not_assembled", defect: "DANGLING_EVIDENCE_REF" }
      }
    }
  }

  // ─── scope ────────────────────────────────────────────────────────────────
  //
  // Os domínios que este assembler EFETIVAMENTE olhou. `FINANCIAL` fica fora porque
  // não foi olhado — declará-lo afirmaria cobertura inexistente.
  const scope: ExecutiveBriefingV1["scope"] = ["COMMERCIAL", "OPERATIONAL"]

  const corpo = {
    schema_version: "1.0.0" as const,
    generated_at: input.generated_at,
    period: input.period,
    scope,
    source_health,
    commercial_state,
    ...(operational_facts.length === 0 ? {} : { operational_facts }),
    detector_results,
    ...(material_findings.length === 0 ? {} : { material_findings }),
    quality_and_coverage,
    evidence_index,
    unavailable_capabilities: CAPACIDADES_AUSENTES,
  }

  const briefing = {
    briefing_id: briefingId({
      v: BRIEFING_ID_VERSION,
      lucas_status: o.status,
      body: corpo,
    }),
    ...corpo,
  }

  // ─── Validação de saída, antes de retornar ────────────────────────────────
  try {
    assertValid("executive-briefing", briefing)
  } catch {
    // Defeito NOSSO, não da fonte. Confundir os dois esconderia um bug atrás de uma
    // resposta plausível sobre a fonte do Lucas.
    return { status: "not_assembled", defect: "OUTPUT_CONTRACT_VIOLATION" }
  }

  return { status: "assembled", briefing: deepFreeze(briefing as ExecutiveBriefingV1) }
}
