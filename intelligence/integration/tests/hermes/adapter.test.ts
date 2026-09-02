/**
 * Fase 3.1b — a fronteira de integração, provada sem runtime instalado.
 *
 * O que é mockado: o TRANSPORTE, e só ele. O §40 autoriza exatamente isso, e a razão
 * é boa — o runtime de produção roda na Hostinger, e mockar o raciocínio do Hermes
 * provaria que o adapter funciona sobre uma resposta que inventamos.
 *
 * O que NÃO é mockado: validação de contrato, pré-checagem de runtime, classificação
 * de falha, identidade determinística e auditoria. Tudo isso é o adapter de verdade.
 */

import { describe, expect, it } from "vitest"
import {
  ADAPTER_PROTOCOL_VERSION,
  CreditumHermesAdapter,
  GOVERNED_RUNTIME,
} from "../../src/hermes/adapter"
import type {
  HermesReasoningRequestV1,
  HermesTransport,
  ObservedRuntimeFingerprint,
  TransportResponse,
} from "../../src/hermes/adapter"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { runLucasCurrentPeriodAnalysis } from "../../src/lucas/analysis"
import { LUCAS_OFFICIAL_SHEET } from "../../src/lucas/drive-port"
import { assembleExecutiveBriefingV1 } from "../../src/briefing/executive-briefing"
import { assembleHermesReadModelV1 } from "../../src/briefing/hermes-read-model"
import type { HermesReadModelV1 } from "../../../gateway/src/hermes"
import { FakeDrive } from "../lucas/fake-drive"
import type { ArquivoFalso } from "../lucas/fake-drive"
import { HEADER_AGOSTO_REAL, cpfSintetico, linhaAgostoReal, observacao, sheetsSerial } from "../lucas/fixtures"

const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
const AGORA = new Date("2026-08-19T18:00:00.000Z")
const T0 = "2026-08-19T18:00:00.000Z"
const T1 = "2026-08-19T18:00:02.500Z"
const PERIODO = "2026-08"
const HOJE = "2026-08-19"

/**
 * Read model REAL, pelo pipeline inteiro.
 *
 * `FakeDrive` → provider → análise → briefing executivo → read model. Nenhum objeto
 * montado à mão: o adapter tem de funcionar sobre o que a produção realmente monta.
 */
const readModelReal = async (): Promise<unknown> => {
  const formatadas: unknown[][] = [
    [
      ...linhaAgostoReal({
        venc: "27/08",
        cpf: cpfSintetico(1),
        unidade: "Meriti",
        parcelas: 10,
        ticket: "R$ 5.000,00",
        status: "P",
        desembolso: `${HOJE.slice(8)}/${HOJE.slice(5, 7)}`,
      }),
    ],
  ]
  const arquivo: ArquivoFalso = {
    meta: {
      file_id: "f1",
      name: "Novos Alunos - Agosto",
      mime_type: SHEETS_MIME,
      modified_time: "2026-08-19T13:39:00Z",
    },
    sheets: { [LUCAS_OFFICIAL_SHEET]: { headers: HEADER_AGOSTO_REAL, rows: formatadas } },
    observations: {
      [LUCAS_OFFICIAL_SHEET]: observacao(HEADER_AGOSTO_REAL, formatadas, [
        { serial: sheetsSerial(HOJE) },
      ]),
    },
  }
  const provider = new LucasMonthlyContractsProvider({
    drive: new FakeDrive({ files: [arquivo] }),
    now: () => AGORA,
  })
  const lucas = await runLucasCurrentPeriodAnalysis(
    { provider, detected_at: AGORA.toISOString(), metric: "amount_sum_cents", aggregator: "sum" },
    { periodClock: () => AGORA },
  )
  const b = assembleExecutiveBriefingV1({ generated_at: T0, period: PERIODO, lucas })
  if (b.status !== "assembled") throw new Error("briefing não montou")
  const rm = assembleHermesReadModelV1({
    generated_at: T0,
    executive_briefing: b.briefing,
    capabilities: ["OBSERVE_SOURCES", "PRODUCE_INSIGHTS"],
  })
  if (rm.status !== "assembled") throw new Error(`read model não montou: ${JSON.stringify(rm)}`)
  return rm.read_model
}

/**
 * A identidade do caminho aprovado, POR INTEIRO.
 *
 * A versão anterior desta constante omitia `bridge_version`, `acp_protocol_version` e
 * `capability_verdict` — e passava. Era o buraco: os três campos que provam QUEM
 * mediu a contagem zero estavam fora da precondição.
 */
const RUNTIME_OK: ObservedRuntimeFingerprint = {
  hermes_version: GOVERNED_RUNTIME.hermes_version,
  hermes_home: GOVERNED_RUNTIME.hermes_home,
  model_callable_tool_count: 0,
  transport: GOVERNED_RUNTIME.transport,
  bridge_version: GOVERNED_RUNTIME.bridge_version,
  acp_protocol_version: GOVERNED_RUNTIME.acp_protocol_version,
  capability_verdict: GOVERNED_RUNTIME.capability_verdict,
  provider: "provider-registrado",
  model: "modelo-registrado",
}

interface Registro {
  probes: number
  sends: number
  ultimoEnvio: unknown
}

/** Transporte falso, com contador. Só a borda impura é substituída. */
const transporte = (
  cfg: {
    readonly runtime?: ObservedRuntimeFingerprint | null
    readonly probeThrows?: boolean
    readonly sendThrows?: boolean
    readonly resposta?: TransportResponse
    /**
     * Valor BRUTO devolvido pelo transporte, sem passar por `??`.
     *
     * Existe porque `null` e `undefined` são casos de teste legítimos da borda impura,
     * e o padrão com `??` os substituiria pela resposta boa — o teste passaria medindo
     * outra coisa.
     */
    readonly respostaBruta?: unknown
  } = {},
): { readonly t: HermesTransport; readonly r: Registro } => {
  const r: Registro = { probes: 0, sends: 0, ultimoEnvio: undefined }
  const t: HermesTransport = {
    probe: async () => {
      r.probes += 1
      if (cfg.probeThrows === true) throw new Error("sonda falhou")
      return cfg.runtime === undefined ? RUNTIME_OK : cfg.runtime
    },
    send: async (req) => {
      r.sends += 1
      r.ultimoEnvio = req
      if (cfg.sendThrows === true) throw new Error("transporte falhou")
      if (Object.prototype.hasOwnProperty.call(cfg, "respostaBruta")) {
        return cfg.respostaBruta as TransportResponse
      }
      return cfg.resposta ?? { outcome: "responded", insights: [], completed_at: T1 }
    },
  }
  return { t, r }
}

const pedido = async (
  over: Partial<HermesReasoningRequestV1> = {},
): Promise<HermesReasoningRequestV1> => ({
  requested_at: T0,
  read_model: await readModelReal(),
  ...over,
})

/**
 * Insight canônico mínimo.
 *
 * `FACT` exige evidência governada e `requires_stefano_approval: false` — regra do
 * próprio contrato, não escolha deste teste. E a audiência é `EXECUTIVE_STEFANO`: o
 * vocabulário é fechado e não existe `ALL`.
 */
/**
 * Uma evidência que o read model REAL desta suíte autoriza.
 *
 * Não é decorativa: a partir da 3.1d-b o adapter confere `evidence_refs` contra
 * `permitted_evidence_refs` do read model daquela execução. Um fixture com ref
 * inventada passava antes — e era exatamente a lacuna que a 3.1c nomeou e a 3.1d
 * fechou.
 */
const refAutorizada = async (): Promise<string> => {
  const rm = (await readModelReal()) as HermesReadModelV1
  const refs = rm.permitted_evidence_refs ?? []
  if (refs.length === 0) throw new Error("read model real não autoriza evidência alguma")
  return refs[0] as string
}

const insightValido = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  insight_id: "ins_1",
  schema_version: "1.0.0",
  kind: "FACT",
  generated_at: T0,
  statement: { untrusted: true, content: "11 contratos em P" },
  evidence_refs: ["ev_1"],
  audiences: ["EXECUTIVE_STEFANO"],
  requires_stefano_approval: false,
  ...over,
})

// ═══════════════════════════════════════════════════════════════════════════════
// §1 §10 §23 — a fronteira não expõe execução arbitrária
// ═══════════════════════════════════════════════════════════════════════════════

describe("§10 §23 — não existe superfície de comando", () => {
  it("o adapter expõe UMA operação, e nenhuma string de comando", async () => {
    const { t } = transporte()
    const a = new CreditumHermesAdapter(t)
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(a) as object).filter(
      (m) => m !== "constructor",
    )
    // `reason` e nada mais. Sem `executeHermes`, sem `run`, sem `exec`.
    expect(metodos).toEqual(["reason"])
    for (const proibido of ["executeHermes", "exec", "run", "spawn", "shell", "command"]) {
      expect(metodos, proibido).not.toContain(proibido)
    }
  })

  it("§23 — o pedido não tem onde caber argumento de linha de comando", async () => {
    const p = await pedido()
    // Campos nomeados, fechados. Conteúdo viaja como DADO pela porta tipada.
    expect(Object.keys(p).sort()).toEqual(["read_model", "requested_at"])
  })

  it("campo desconhecido no envelope falha FECHADO", async () => {
    const { t, r } = transporte()
    const a = new CreditumHermesAdapter(t)
    for (const campo of ["args", "command", "shell", "hermes_args", "debug"]) {
      const res = await a.reason({
        ...(await pedido()),
        [campo]: "qualquer",
      } as unknown as HermesReasoningRequestV1)
      expect(res.status, campo).toBe("INVALID_REQUEST")
    }
    // E nada chegou ao transporte.
    expect(r.probes).toBe(0)
    expect(r.sends).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §18 — o read model é validado ANTES do transporte
// ═══════════════════════════════════════════════════════════════════════════════

describe("§18 — entrada inválida não vira pergunta ao modelo", () => {
  it("read model fora do contrato é recusado, e o transporte não é tocado", async () => {
    const { t, r } = transporte()
    const a = new CreditumHermesAdapter(t)
    const b = (await readModelReal()) as Record<string, unknown>
    const invalidos: readonly unknown[] = [
      { ...b, campo_extra: "vazado" },
      { ...b, restrictions: ["NO_FINAL_APPROVAL"] },
      { ...b, capabilities: ["OBSERVE_TUDO"] },
      {},
      null,
      "texto",
    ]
    for (const rm of invalidos) {
      const res = await a.reason({ requested_at: T0, read_model: rm })
      expect(res.status, JSON.stringify(rm).slice(0, 40)).toBe("INVALID_READ_MODEL")
    }
    expect(r.probes).toBe(0)
    expect(r.sends).toBe(0)
  })

  it("read model VÁLIDO atravessa, e chega ao transporte já validado", async () => {
    const { t, r } = transporte()
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    expect(r.sends).toBe(1)
    const enviado = r.ultimoEnvio as { readonly read_model: { readonly read_model_id: string } }
    expect(enviado.read_model.read_model_id).toMatch(/^hrm_[a-f0-9]{32}$/)
  })

  it("§3.0c — o envelope do chamador não é congelado nem relido", async () => {
    const { t } = transporte()
    const p = { requested_at: T0, read_model: await readModelReal() }
    await new CreditumHermesAdapter(t).reason(p)
    expect(Object.isFrozen(p)).toBe(false)
    expect(Object.isExtensible(p)).toBe(true)
  })

  it("§3.0c — Proxy e acessor no envelope falham FECHADOS sem executar", async () => {
    const { t, r } = transporte()
    const a = new CreditumHermesAdapter(t)
    expect((await a.reason(new Proxy(await pedido(), {}))).status).toBe("INVALID_REQUEST")

    let leituras = 0
    const alvo: Record<string, unknown> = { requested_at: T0 }
    Object.defineProperty(alvo, "read_model", {
      get() {
        leituras += 1
        return {}
      },
      enumerable: true,
      configurable: true,
    })
    const res = await a.reason(alvo as unknown as HermesReasoningRequestV1)
    expect(res.status).toBe("INVALID_REQUEST")
    expect(leituras).toBe(0)
    expect(r.probes).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §2 §13 §14 §31 — a PRÉ-CHECAGEM, e o que ela recusa
// ═══════════════════════════════════════════════════════════════════════════════

describe("§13 — a pré-checagem acontece ANTES de qualquer envio", () => {
  it("a ordem é sondar, conferir, e só então enviar", async () => {
    const { t, r } = transporte()
    await new CreditumHermesAdapter(t).reason(await pedido())
    expect(r.probes).toBe(1)
    expect(r.sends).toBe(1)
  })

  it("§14 §31 — versão diferente da governada bloqueia, para MAIS ou para MENOS", async () => {
    const p = await pedido()
    for (const v of ["0.20.5", "0.20.3", "0.21.0", "1.0.0", ""]) {
      const { t, r } = transporte({ runtime: { ...RUNTIME_OK, hermes_version: v } })
      const res = await new CreditumHermesAdapter(t).reason(p)
      expect(res.status, v).toBe("RUNTIME_VERSION_MISMATCH")
      // Nada foi enviado ao modelo.
      expect(r.sends, v).toBe(0)
    }
    // A versão governada é EXATA — nem faixa, nem `latest`.
    expect(GOVERNED_RUNTIME.hermes_version).toBe("0.20.4")
  })

  it("versão AUSENTE bloqueia — desconhecido não é aceitável", async () => {
    const { t, r } = transporte({ runtime: { ...RUNTIME_OK, hermes_version: undefined } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("RUNTIME_VERSION_MISMATCH")
    expect(r.sends).toBe(0)
  })

  it("§16 — perfil diferente de /data bloqueia", async () => {
    for (const home of ["/home/u4s/.hermes", "/data2", "", undefined]) {
      const { t, r } = transporte({ runtime: { ...RUNTIME_OK, hermes_home: home } })
      const res = await new CreditumHermesAdapter(t).reason(await pedido())
      expect(res.status, String(home)).toBe("RUNTIME_PROFILE_MISMATCH")
      expect(r.sends).toBe(0)
    }
  })
})

describe("§2 §13 §29 — ZERO ferramentas é precondição, não preferência", () => {
  it("contagem diferente de zero bloqueia", async () => {
    const p = await pedido()
    for (const n of [1, 2, 18, 42]) {
      const { t, r } = transporte({
        runtime: { ...RUNTIME_OK, model_callable_tool_count: n },
      })
      const res = await new CreditumHermesAdapter(t).reason(p)
      expect(res.status, String(n)).toBe("TOOL_SURFACE_MISMATCH")
      expect(r.sends, String(n)).toBe(0)
    }
  })

  it("contagem DESCONHECIDA bloqueia igual — e é o caso que importa", async () => {
    // "Não sei quantas ferramentas o modelo pode chamar" é tão inaceitável quanto
    // "sei que são três". Aceitar o desconhecido aqui seria aceitar tudo.
    const { t, r } = transporte({
      runtime: { ...RUNTIME_OK, model_callable_tool_count: undefined },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("TOOL_SURFACE_MISMATCH")
    expect(r.sends).toBe(0)
    // E a auditoria registra que não foi observada — não registra zero.
    expect(Object.keys(res.audit)).not.toContain("observed_tool_count")
    expect(res.audit.expected_tool_count).toBe(0)
  })

  it("runtime NÃO DETERMINÁVEL bloqueia", async () => {
    for (const cfg of [{ runtime: null }, { probeThrows: true }]) {
      const { t, r } = transporte(cfg)
      const res = await new CreditumHermesAdapter(t).reason(await pedido())
      expect(res.status).toBe("RUNTIME_NOT_AVAILABLE")
      expect(r.sends).toBe(0)
    }
  })

  it("a expectativa governada é ZERO, literalmente", () => {
    expect(GOVERNED_RUNTIME.model_callable_tool_count).toBe(0)
    expect(GOVERNED_RUNTIME.hermes_home).toBe("/data")
    expect(Object.isFrozen(GOVERNED_RUNTIME)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §12 §24 §32 — falhas são estados próprios, nunca vazio
// ═══════════════════════════════════════════════════════════════════════════════

describe("§12 §24 — nenhuma falha vira sucesso vazio", () => {
  it("timeout, protocolo, modelo e transporte são estados DISTINTOS", async () => {
    const p = await pedido()
    const casos = [
      ["timeout", "TIMEOUT"],
      ["protocol_error", "PROTOCOL_ERROR"],
      ["model_error", "MODEL_ERROR"],
      ["transport_error", "TRANSPORT_ERROR"],
    ] as const
    for (const [outcome, esperado] of casos) {
      const { t } = transporte({ resposta: { outcome, completed_at: T1 } })
      const res = await new CreditumHermesAdapter(t).reason(p)
      expect(res.status, outcome).toBe(esperado)
      // O ponto: NENHUM deles devolve `insights`.
      expect(Object.keys(res), outcome).not.toContain("insights")
    }
  })

  it("um Hermes travado NÃO é um Hermes sem achados", async () => {
    const { t } = transporte({ resposta: { outcome: "timeout", completed_at: T1 } })
    const travado = await new CreditumHermesAdapter(t).reason(await pedido())
    const { t: t2 } = transporte({ resposta: { outcome: "responded", insights: [], completed_at: T1 } })
    const vazio = await new CreditumHermesAdapter(t2).reason(await pedido())

    expect(travado.status).toBe("TIMEOUT")
    expect(vazio.status).toBe("SUCCESS")
    // Zero achados COM resposta é zero conhecido. Timeout é ausência de resposta.
    expect(vazio.status === "SUCCESS" ? vazio.insights : null).toEqual([])
    expect(travado.status).not.toBe(vazio.status)
  })

  it("exceção do transporte é TRANSPORT_ERROR, não silêncio", async () => {
    const { t } = transporte({ sendThrows: true })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("TRANSPORT_ERROR")
  })

  it("§32 — não existe fallback automático", async () => {
    // Com o runtime fora do governado, o adapter recusa. Não tenta outro transporte,
    // outro provider ou outro modelo — trocar em silêncio destrói a auditabilidade.
    const { t, r } = transporte({ runtime: { ...RUNTIME_OK, hermes_version: "0.20.5" } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("RUNTIME_VERSION_MISMATCH")
    expect(r.probes).toBe(1)
    expect(r.sends).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §19 — a saída é validada contra o contrato CANÔNICO
// ═══════════════════════════════════════════════════════════════════════════════

describe("§19 — `hermes-insight` governa a saída; nenhum schema novo foi inventado", () => {
  it("insight canônico é aceito e congelado", async () => {
    // A evidência tem de ser uma que ESTE read model autoriza. Antes da 3.1d-b uma
    // ref inventada passava — era a lacuna que a 3.1c nomeou.
    const { t } = transporte({
      resposta: {
        outcome: "responded",
        insights: [insightValido({ evidence_refs: [await refAutorizada()] })],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    if (res.status !== "SUCCESS") throw new Error("estado")
    expect(res.insights).toHaveLength(1)
    expect(Object.isFrozen(res.insights[0])).toBe(true)
  })

  it("insight fora do contrato invalida a resposta INTEIRA", async () => {
    const invalidos: readonly Record<string, unknown>[] = [
      insightValido({ kind: "PALPITE" }),
      insightValido({ statement: "texto sem envelope" }),
      insightValido({ campo_extra: true }),
      insightValido({ requires_stefano_approval: "sim" }),
    ]
    for (const mau of invalidos) {
      const { t } = transporte({
        // Um válido e um inválido: descartar o inválido entregaria um conjunto que
        // PARECE íntegro, e o descartado pode ser o que trazia a ressalva.
        resposta: { outcome: "responded", insights: [insightValido(), mau], completed_at: T1 },
      })
      const res = await new CreditumHermesAdapter(t).reason(await pedido())
      expect(res.status, JSON.stringify(Object.keys(mau))).toBe("OUTPUT_NOT_VALIDATED")
      expect(Object.keys(res)).not.toContain("insights")
    }
  })

  it("saída não-canônica (Proxy/acessor) também é recusada", async () => {
    const { t } = transporte({
      resposta: {
        outcome: "responded",
        insights: [new Proxy(insightValido(), {})],
        completed_at: T1,
      },
    })
    expect((await new CreditumHermesAdapter(t).reason(await pedido())).status).toBe(
      "OUTPUT_NOT_VALIDATED",
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1b-r1 §25 — recusa da ponte é estado PRÓPRIO
// ═══════════════════════════════════════════════════════════════════════════════

describe("§25 — a ponte recusar não é o modelo errar", () => {
  it("veredito diferente de OK bloqueia, e não vira MODEL_ERROR", async () => {
    const p = await pedido()
    for (const v of [
      "TOOL_SURFACE_NOT_EMPTY",
      "TOOL_SURFACE_UNKNOWN",
      "RUNTIME_API_INCOMPATIBLE",
      "ACP_PROTOCOL_MISMATCH",
    ]) {
      const { t, r } = transporte({ runtime: { ...RUNTIME_OK, capability_verdict: v } })
      const res = await new CreditumHermesAdapter(t).reason(p)
      expect(res.status, v).toBe("RUNTIME_CAPABILITY_MISMATCH")
      // Nenhum modelo foi chamado. Dizer `MODEL_ERROR` mandaria quem investiga para o
      // lugar errado.
      expect(res.status, v).not.toBe("MODEL_ERROR")
      expect(r.sends, v).toBe(0)
    }
  })

  it("veredito OK segue, e a identidade da ponte entra na auditoria", async () => {
    const { t } = transporte()
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    expect(res.audit.bridge_version).toBe("1.1.0")
    expect(res.audit.acp_protocol_version).toBe("0.9.0")
    expect(res.audit.transport).toBe("acp")
  })

  it("transporte SEM ponte é RECUSADO, mesmo relatando contagem zero", async () => {
    // Esta era a asserção invertida: antes o teste afirmava que um transporte sem
    // ponte "não é afetado" e chegava a SUCCESS. Ele codificava o defeito.
    //
    // Um processo qualquer pode relatar 0.20.4, /data e contagem zero. Nada nesses
    // três campos prova QUEM relatou — e o ACP de fábrica, que em produção entregou 15
    // ferramentas ao modelo, é justamente um processo capaz de produzir esse relato.
    const { t, r } = transporte({
      runtime: {
        hermes_version: GOVERNED_RUNTIME.hermes_version,
        hermes_home: GOVERNED_RUNTIME.hermes_home,
        model_callable_tool_count: 0,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("RUNTIME_CAPABILITY_MISMATCH")
    expect(r.sends).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1b-r4 §1 — a identidade do caminho aprovado é EXATA e COMPLETA
// ═══════════════════════════════════════════════════════════════════════════════

describe("r4 §1 — nenhum campo de identidade governada é opcional", () => {
  const DESVIOS: ReadonlyArray<readonly [string, Partial<ObservedRuntimeFingerprint>]> = [
    ["A  transporte ausente", { transport: undefined }],
    ["B  transporte http", { transport: "http" }],
    ["C  transporte cli", { transport: "cli" }],
    ["D  versão da ponte ausente", { bridge_version: undefined }],
    ["E  ponte 1.0.0 (a anterior)", { bridge_version: "1.0.0" }],
    ["F  ponte 1.1.1 (a seguinte)", { bridge_version: "1.1.1" }],
    ["G  protocolo ACP ausente", { acp_protocol_version: undefined }],
    ["H  protocolo ACP 0.8.0", { acp_protocol_version: "0.8.0" }],
    ["I  protocolo ACP 0.9.1", { acp_protocol_version: "0.9.1" }],
    ["J  veredito ausente", { capability_verdict: undefined }],
    ["K  veredito TOOL_SURFACE_NOT_EMPTY", { capability_verdict: "TOOL_SURFACE_NOT_EMPTY" }],
    ["K2 veredito LATE_TOOL_INJECTION_DETECTED", { capability_verdict: "LATE_TOOL_INJECTION_DETECTED" }],
  ]

  it.each(DESVIOS)("%s → recusa, zero envios", async (rotulo, desvio) => {
    const { t, r } = transporte({ runtime: { ...RUNTIME_OK, ...desvio } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status, rotulo).toBe("RUNTIME_CAPABILITY_MISMATCH")
    // Nenhum modelo foi perguntado. Não é erro do modelo.
    expect(res.status, rotulo).not.toBe("MODEL_ERROR")
    expect(res.status, rotulo).not.toBe("SUCCESS")
    expect(r.sends, rotulo).toBe(0)
  })

  it("M  identidade governada exata → o transporte é acionado", async () => {
    const { t, r } = transporte()
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    expect(r.sends).toBe(1)
  })

  it("a expectativa governada nomeia o caminho inteiro, não só o Hermes", async () => {
    // Se algum destes deixar de ser exigido, o campo correspondente vira decorativo.
    expect(GOVERNED_RUNTIME.transport).toBe("acp")
    expect(GOVERNED_RUNTIME.bridge_version).toBe("1.1.0")
    expect(GOVERNED_RUNTIME.acp_protocol_version).toBe("0.9.0")
    expect(GOVERNED_RUNTIME.capability_verdict).toBe("OK")
    expect(GOVERNED_RUNTIME.hermes_version).toBe("0.20.4")
    expect(GOVERNED_RUNTIME.hermes_home).toBe("/data")
    expect(GOVERNED_RUNTIME.model_callable_tool_count).toBe(0)
  })

  it("a deriva de versão continua sendo reportada como deriva de VERSÃO", async () => {
    // A conferência de identidade vem DEPOIS da de versão de propósito: quando o
    // Hermes sobe, a ponte recusa e o veredito deixa de ser OK. Conferir identidade
    // primeiro esconderia o fato mais específico atrás do mais genérico.
    const { t, r } = transporte({
      runtime: { ...RUNTIME_OK, hermes_version: "0.20.5", capability_verdict: "HERMES_VERSION_MISMATCH" },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("RUNTIME_VERSION_MISMATCH")
    expect(r.sends).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1b-r4 §2 — resposta truncada NÃO é zero achados
// ═══════════════════════════════════════════════════════════════════════════════

describe("r4 §2 — `insights` tem de existir e ser um array", () => {
  const SEM_PAYLOAD: ReadonlyArray<readonly [string, unknown]> = [
    ["A  campo ausente", { outcome: "responded" }],
    ["B  undefined explícito", { outcome: "responded", insights: undefined }],
    ["C  null", { outcome: "responded", insights: null }],
    ["D  objeto", { outcome: "responded", insights: {} }],
    ["E  string", { outcome: "responded", insights: "[]" }],
    ["F  número", { outcome: "responded", insights: 0 }],
  ]

  it.each(SEM_PAYLOAD)("%s → OUTPUT_NOT_VALIDATED, nunca sucesso vazio", async (rotulo, bruta) => {
    // O tipo já proíbe estas formas; o cast existe porque o transporte é a borda
    // impura, e do lado de lá tipo não vale como prova.
    const { t } = transporte({ resposta: bruta as TransportResponse })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status, rotulo).toBe("OUTPUT_NOT_VALIDATED")
    expect(res.status, rotulo).not.toBe("SUCCESS")
    expect(res, rotulo).not.toHaveProperty("insights")
  })

  it("G  array vazio EXPLÍCITO é sucesso com zero achados", async () => {
    // A distinção inteira em duas linhas: o Hermes olhou e não viu nada é um
    // resultado. A resposta ter chegado pela metade não é.
    const { t } = transporte({ resposta: { outcome: "responded", insights: [], completed_at: T1 } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    if (res.status !== "SUCCESS") throw new Error("inalcançável")
    expect(res.insights).toHaveLength(0)
  })

  it("H  um inválido entre válidos invalida a resposta INTEIRA", async () => {
    const { t } = transporte({
      resposta: {
        outcome: "responded",
        insights: [insightValido(), { tipo: "não é um insight" }],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("OUTPUT_NOT_VALIDATED")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §17 §33 §34 — auditoria segura e determinística
// ═══════════════════════════════════════════════════════════════════════════════

describe("§33 — o registro de auditoria", () => {
  it("carrega o que a fase pede, e nada de sensível", async () => {
    const { t } = transporte({
      resposta: {
        outcome: "responded",
        insights: [insightValido({ evidence_refs: [await refAutorizada()] })],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    const a = res.audit
    expect(a.run_id).toMatch(/^hrun_[a-f0-9]{32}$/)
    expect(a.requested_at).toBe(T0)
    expect(a.completed_at).toBe(T1)
    expect(a.duration_ms).toBe(2500)
    expect(a.adapter_protocol_version).toBe(ADAPTER_PROTOCOL_VERSION)
    expect(a.transport).toBe("acp")
    expect(a.provider).toBe("provider-registrado")
    expect(a.model).toBe("modelo-registrado")
    expect(a.expected_tool_count).toBe(0)
    expect(a.observed_tool_count).toBe(0)
    expect(a.expected_hermes_version).toBe("0.20.4")
    expect(a.observed_hermes_version).toBe("0.20.4")
    expect(a.input_content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(a.output_content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(a.status).toBe("SUCCESS")
  })

  it("§17 §34 — nem PII, nem credencial, nem cadeia de raciocínio", async () => {
    const cpf = cpfSintetico(1)
    const { t } = transporte({
      resposta: { outcome: "responded", insights: [insightValido()], completed_at: T1 },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    const s = JSON.stringify(res.audit)
    for (const proibido of [
      cpf,
      cpf.replace(/\D/g, ""),
      "Bearer",
      "api_key",
      "token",
      "secret",
      ".env",
      "chain_of_thought",
      "reasoning_trace",
      "Meriti",
    ]) {
      expect(s, proibido).not.toContain(proibido)
    }
  })

  it("duração AUSENTE quando não dá para calcular — nunca zero", async () => {
    for (const completed of [undefined, "não é data", T0.replace("18:00", "17:00")]) {
      const { t } = transporte({
        resposta: {
          outcome: "responded",
          insights: [],
          ...(completed === undefined ? {} : { completed_at: completed }),
        },
      })
      const res = await new CreditumHermesAdapter(t).reason(await pedido())
      // Desconhecido não vira zero. É a regra que atravessa o projeto desde a Fase 2.
      expect(Object.keys(res.audit), String(completed)).not.toContain("duration_ms")
    }
  })

  it("mesmo pedido canônico dá o MESMO run_id e o mesmo hash de entrada", async () => {
    const p = await pedido()
    const { t: t1 } = transporte()
    const { t: t2 } = transporte()
    const a = await new CreditumHermesAdapter(t1).reason(p)
    const b = await new CreditumHermesAdapter(t2).reason(p)
    expect(b.audit.run_id).toBe(a.audit.run_id)
    expect(b.audit.input_content_hash).toBe(a.audit.input_content_hash)
  })

  it("read model diferente muda o hash de entrada e a identidade da execução", async () => {
    const { t: t1 } = transporte()
    const a = await new CreditumHermesAdapter(t1).reason(await pedido())
    const { t: t2 } = transporte()
    const b = await new CreditumHermesAdapter(t2).reason({
      requested_at: "2026-08-19T19:00:00.000Z",
      read_model: await readModelReal(),
    })
    expect(b.audit.input_content_hash).toBe(a.audit.input_content_hash)
    // Mesmo conteúdo, instante diferente: execução diferente.
    expect(b.audit.run_id).not.toBe(a.audit.run_id)
  })

  it("o adapter não lê relógio: sem `completed_at` não há tempo inventado", async () => {
    const now = Date.now
    const random = Math.random
    try {
      Date.now = () => {
        throw new Error("o adapter leu o relógio")
      }
      Math.random = () => {
        throw new Error("o adapter sorteou")
      }
      const { t } = transporte()
      const res = await new CreditumHermesAdapter(t).reason(await pedido())
      expect(res.status).toBe("SUCCESS")
      expect(res.audit.requested_at).toBe(T0)
    } finally {
      Date.now = now
      Math.random = random
    }
  })

  it("§41 — o adapter não calcula nada de negócio", async () => {
    const { t } = transporte()
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    const s = JSON.stringify(res)
    for (const proibido of [
      "commercial_potential",
      "emitted",
      "deadline",
      "severity",
      "recommend",
      "priority",
    ]) {
      expect(s.toLowerCase(), proibido).not.toContain(proibido)
    }
  })

  it("a saída do adapter é profundamente imutável", async () => {
    const { t } = transporte({
      resposta: { outcome: "responded", insights: [insightValido()], completed_at: T1 },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(Object.isFrozen(res)).toBe(true)
    expect(Object.isFrozen(res.audit)).toBe(true)
    if (res.status === "SUCCESS") expect(Object.isFrozen(res.insights)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1b-r5 — o envelope INTEIRO do transporte é conferido em tempo de execução
// ═══════════════════════════════════════════════════════════════════════════════

describe("r5 — desfecho fora do vocabulário nunca vira sucesso", () => {
  const FORA_DO_PROTOCOLO: ReadonlyArray<readonly [string, unknown]> = [
    ["A  desfecho desconhecido", { outcome: "unknown", insights: [] }],
    ["B  desfecho `cancelled` (não governado)", { outcome: "cancelled", insights: [] }],
    ["B2 desfecho impossível", { outcome: "__UNKNOWN_OUTCOME__", insights: [] }],
    ["C  envelope vazio", {}],
    ["D  sem desfecho, só payload", { insights: [] }],
    ["D2 desfecho não-string", { outcome: 1, insights: [] }],
    ["E  null", null],
    ["F  undefined", undefined],
    ["G  array", []],
    ["G2 array com cara de resposta", [{ outcome: "responded", insights: [] }]],
    ["H  string", "responded"],
    ["I  número", 0],
    ["J  booleano", true],
  ]

  it.each(FORA_DO_PROTOCOLO)("%s → PROTOCOL_ERROR, nunca sucesso", async (rotulo, bruta) => {
    const { t } = transporte({ respostaBruta: bruta })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    // O enquadramento é que está errado. Nenhuma afirmação sobre achados sai daqui.
    expect(res.status, rotulo).toBe("PROTOCOL_ERROR")
    expect(res.status, rotulo).not.toBe("SUCCESS")
    // E nenhum achado é fabricado — nem sequer a lista vazia.
    expect(res, rotulo).not.toHaveProperty("insights")
  })

  it("não-objeto CARREGANDO um desfecho válido também é recusado", async () => {
    // A mutação que troca a conferência de objeto por `!= null` sobreviveu ao primeiro
    // conjunto de testes: `"responded"`, `0` e `[]` não têm propriedade `outcome`, e a
    // conferência de vocabulário já os pegava. O caso que separa as duas defesas é o
    // não-objeto que CARREGA um desfecho válido — e ele existe.
    const arrayComCara = Object.assign([] as unknown[], {
      outcome: "responded",
      insights: [],
    })
    const funcaoComCara = Object.assign(() => undefined, { outcome: "responded", insights: [] })

    for (const [rotulo, bruta] of [
      ["array com propriedades de resposta", arrayComCara],
      ["função com propriedades de resposta", funcaoComCara],
    ] as const) {
      const { t } = transporte({ respostaBruta: bruta })
      const res = await new CreditumHermesAdapter(t).reason(await pedido())
      expect(res.status, rotulo).toBe("PROTOCOL_ERROR")
      expect(res, rotulo).not.toHaveProperty("insights")
    }
  })

  it("o `switch` semântico não tem por onde cair", async () => {
    // Antes da r5 não havia `default`: `{ outcome: "cancelled", insights: [] }` não
    // casava com caso nenhum, seguia adiante e saía como SUCESSO com zero achados —
    // indistinguível de "o Hermes olhou e não viu nada".
    const { t } = transporte({ respostaBruta: { outcome: "cancelled", insights: [] } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).not.toBe("SUCCESS")
  })
})

describe("r5 — campos por desfecho são fechados", () => {
  const ENVELOPES_SUJOS: ReadonlyArray<readonly [string, unknown]> = [
    ["insights junto de timeout", { outcome: "timeout", insights: [] }],
    ["insights junto de model_error", { outcome: "model_error", insights: [] }],
    ["campo extra em responded", { outcome: "responded", insights: [], extra: true }],
    ["campo extra em timeout", { outcome: "timeout", motivo: "travou" }],
    ["completed_at não-string", { outcome: "responded", insights: [], completed_at: 1 }],
    ["completed_at null", { outcome: "responded", insights: [], completed_at: null }],
  ]

  it.each(ENVELOPES_SUJOS)("%s → PROTOCOL_ERROR", async (rotulo, bruta) => {
    // O tipo já diz que `insights` só existe em `responded`; isto é a mesma afirmação
    // do lado de fora do compilador, onde ela pode ser desmentida. Um transporte com
    // outra ideia do contrato pode ter ideias piores na versão seguinte.
    const { t } = transporte({ respostaBruta: bruta })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status, rotulo).toBe("PROTOCOL_ERROR")
  })
})

describe("r5 — os desfechos governados continuam distintos e nenhum é sucesso", () => {
  const GOVERNADOS = [
    ["timeout", "TIMEOUT"],
    ["protocol_error", "PROTOCOL_ERROR"],
    ["model_error", "MODEL_ERROR"],
    ["transport_error", "TRANSPORT_ERROR"],
  ] as const

  it.each(GOVERNADOS)("%s → %s, jamais SUCCESS", async (desfecho, esperado) => {
    const { t } = transporte({ respostaBruta: { outcome: desfecho, completed_at: T1 } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status, desfecho).toBe(esperado)
    expect(res, desfecho).not.toHaveProperty("insights")
  })

  it("K  responded sem insights continua sendo OUTPUT_NOT_VALIDATED", async () => {
    // A distinção de camada importa: o enquadramento CHEGOU, o payload não. Classificar
    // isto como PROTOCOL_ERROR mandaria quem investiga para a camada errada.
    const { t } = transporte({ respostaBruta: { outcome: "responded" } })
    expect((await new CreditumHermesAdapter(t).reason(await pedido())).status).toBe(
      "OUTPUT_NOT_VALIDATED",
    )
  })

  it("L  responded com [] explícito é sucesso com zero achados", async () => {
    const { t } = transporte({ respostaBruta: { outcome: "responded", insights: [] } })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    if (res.status !== "SUCCESS") throw new Error("inalcançável")
    expect(res.insights).toHaveLength(0)
  })

  it("M  responded com insight válido é sucesso", async () => {
    const { t } = transporte({
      respostaBruta: {
        outcome: "responded",
        insights: [insightValido({ evidence_refs: [await refAutorizada()] })],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    if (res.status !== "SUCCESS") throw new Error("inalcançável")
    expect(res.insights).toHaveLength(1)
  })

  it("N  um inválido entre válidos rejeita a resposta INTEIRA", async () => {
    const { t } = transporte({
      respostaBruta: {
        outcome: "responded",
        insights: [insightValido(), { nada: "a ver" }],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("OUTPUT_NOT_VALIDATED")
    expect(res).not.toHaveProperty("insights")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1b-r6 — estado HERDADO não é estado de protocolo
// ═══════════════════════════════════════════════════════════════════════════════

describe("r6 — só propriedade própria, enumerável e de dados vale como protocolo", () => {
  const naoSucesso = async (bruta: unknown, rotulo: string) => {
    const { t } = transporte({ respostaBruta: bruta })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status, rotulo).not.toBe("SUCCESS")
    expect(res, rotulo).not.toHaveProperty("insights")
    return res
  }

  it("A  envelope inteiro herdado do protótipo é recusado", async () => {
    // O exploit: este objeto não tem UMA propriedade própria. `Object.keys` devolve
    // `[]` — a conferência de campos fechados passa no vazio — e a leitura sobe a
    // cadeia de protótipos. Antes da r6 isto saía como SUCESSO com zero achados.
    const res = await naoSucesso(
      Object.create({ outcome: "responded", insights: [] }),
      "envelope herdado",
    )
    expect(res.status).toBe("PROTOCOL_ERROR")
  })

  it("B  desfecho herdado + insights próprios é recusado", async () => {
    const bruta = Object.create({ outcome: "responded" }) as Record<string, unknown>
    bruta["insights"] = []
    // `outcome` herdado é `outcome` AUSENTE.
    expect((await naoSucesso(bruta, "desfecho herdado")).status).toBe("PROTOCOL_ERROR")
  })

  it("C  desfecho próprio + insights herdados não vira zero achados", async () => {
    const bruta = Object.create({ insights: [] }) as Record<string, unknown>
    bruta["outcome"] = "responded"
    // Herdar uma lista vazia do protótipo não é o Hermes ter olhado e não visto nada.
    //
    // A recusa vem antes até de olhar o payload: `Object.create({...})` produz um
    // protótipo que NÃO é `Object.prototype`, e a política de protótipo pega primeiro.
    // Mais estrito do que o mínimo exigido, e na camada mais externa.
    expect((await naoSucesso(bruta, "insights herdados")).status).toBe("PROTOCOL_ERROR")
  })

  it("D  getter no PROTÓTIPO não é executado", async () => {
    let chamadas = 0
    const proto = {}
    Object.defineProperty(proto, "outcome", {
      get() {
        chamadas += 1
        return "responded"
      },
    })
    const bruta = Object.create(proto) as Record<string, unknown>
    bruta["insights"] = []
    await naoSucesso(bruta, "getter herdado")
    // A garantia é NÃO LER, e não "ler uma vez".
    expect(chamadas).toBe(0)
  })

  it("E  getter PRÓPRIO em `outcome` não é executado", async () => {
    let chamadas = 0
    const bruta: Record<string, unknown> = {}
    Object.defineProperty(bruta, "outcome", {
      enumerable: true,
      configurable: true,
      get() {
        chamadas += 1
        return "responded"
      },
    })
    const res = await naoSucesso(bruta, "getter próprio em outcome")
    expect(res.status).toBe("PROTOCOL_ERROR")
    expect(chamadas).toBe(0)
  })

  it("F  getter PRÓPRIO em `insights` não é executado", async () => {
    let chamadas = 0
    const bruta: Record<string, unknown> = { outcome: "responded" }
    Object.defineProperty(bruta, "insights", {
      enumerable: true,
      configurable: true,
      get() {
        chamadas += 1
        return []
      },
    })
    const res = await naoSucesso(bruta, "getter próprio em insights")
    expect(res.status).toBe("PROTOCOL_ERROR")
    expect(chamadas).toBe(0)
  })

  it("G  `outcome` não-enumerável é recusado", async () => {
    // Discriminador escondido é pior que discriminador ausente.
    const bruta: Record<string, unknown> = {}
    Object.defineProperty(bruta, "outcome", { value: "responded", enumerable: false })
    Object.defineProperty(bruta, "insights", { value: [], enumerable: true })
    expect((await naoSucesso(bruta, "outcome oculto")).status).toBe("PROTOCOL_ERROR")
  })

  it("H  `insights` não-enumerável é recusado", async () => {
    const bruta: Record<string, unknown> = { outcome: "responded" }
    Object.defineProperty(bruta, "insights", { value: [], enumerable: false })
    expect((await naoSucesso(bruta, "insights oculto")).status).toBe("PROTOCOL_ERROR")
  })

  it("I  instância de classe com campos aparentemente válidos é recusada", async () => {
    class RespostaFalsa {
      outcome = "responded"
      insights: readonly unknown[] = []
    }
    // Os campos são próprios e enumeráveis; o PROTÓTIPO é que não é canônico. A regra
    // é a mesma de `snapshotPlainData` na 3.0c — uma política de protótipo só.
    expect((await naoSucesso(new RespostaFalsa(), "classe")).status).toBe("PROTOCOL_ERROR")
  })

  it("J  protótipo `null` com dados próprios é ACEITO", async () => {
    // Decisão registrada: `Object.create(null)` é MAIS restrito que um literal, não
    // menos — sem cadeia de protótipos, não há de onde herdar nada. Mesma política da
    // 3.0c, e não uma segunda ideia do que é dado canônico.
    const bruta = Object.create(null) as Record<string, unknown>
    bruta["outcome"] = "responded"
    bruta["insights"] = []
    const { t } = transporte({ respostaBruta: bruta })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    if (res.status !== "SUCCESS") throw new Error("inalcançável")
    expect(res.insights).toHaveLength(0)
  })

  it("K  `completed_at` herdado NUNCA é consumido", async () => {
    const bruta = Object.create({ completed_at: "2026-01-01T00:00:00Z" }) as Record<
      string,
      unknown
    >
    bruta["outcome"] = "responded"
    bruta["insights"] = []
    const res = await naoSucesso(bruta, "completed_at herdado")
    // O valor do protótipo nunca é consumido — e aqui a recusa é ainda mais forte que
    // "ignorado": o protótipo não canônico derruba o envelope inteiro. A auditoria não
    // ganha um instante que ninguém informou.
    expect(res.status).toBe("PROTOCOL_ERROR")
    expect(res.audit).not.toHaveProperty("completed_at")
    expect(res.audit).not.toHaveProperty("duration_ms")
  })

  it("L  Proxy no topo é recusado sem que o adapter LEIA nada dele", async () => {
    const traps = { ownKeys: 0, getOwnPropertyDescriptor: 0, getPrototypeOf: 0 }
    const lidas: string[] = []
    const bruta = new Proxy(
      { outcome: "responded", insights: [] },
      {
        get(alvo, chave, recebedor) {
          lidas.push(String(chave))
          return Reflect.get(alvo, chave, recebedor)
        },
        ownKeys(alvo) {
          traps.ownKeys += 1
          return Reflect.ownKeys(alvo)
        },
        getOwnPropertyDescriptor(alvo, chave) {
          traps.getOwnPropertyDescriptor += 1
          return Reflect.getOwnPropertyDescriptor(alvo, chave)
        },
        getPrototypeOf(alvo) {
          traps.getPrototypeOf += 1
          return Reflect.getPrototypeOf(alvo)
        },
      },
    )
    const res = await naoSucesso(bruta, "proxy")
    expect(res.status).toBe("PROTOCOL_ERROR")
    // Perguntar qualquer coisa a um Proxy antes de saber que é um Proxy é rodar o
    // código dele. Por isso a detecção vem antes de tudo: nenhuma trap ESTRUTURAL
    // dispara.
    expect(traps).toEqual({ ownKeys: 0, getOwnPropertyDescriptor: 0, getPrototypeOf: 0 })
    // A única leitura é `then`, e ela NÃO vem do adapter: `send()` é `async`, e a
    // resolução da promise pergunta a qualquer valor devolvido se ele é um thenable.
    // Acontece antes de o adapter ver o objeto, e nenhum código nosso pode evitá-la.
    // O que importa é que nenhum CAMPO DE PROTOCOLO foi lido.
    expect(lidas).toEqual(["then"])
    for (const campo of ["outcome", "insights", "completed_at"]) {
      expect(lidas, campo).not.toContain(campo)
    }
  })

  it("M  poluição de `Object.prototype` não fabrica um envelope", async () => {
    // O caso que separa "conferir o protótipo" de "ler só propriedade própria".
    //
    // Um literal `{}` TEM protótipo canônico — a política de protótipo passa. Mas se
    // alguém poluiu `Object.prototype`, `bruta.outcome` devolve "responded" e o
    // envelope vazio vira uma resposta. Só a leitura por descritor PRÓPRIO recusa isto.
    //
    // Não é hipótese acadêmica: poluição de protótipo é a mesma família de ataque que
    // a 3.0c trata em `__proto__`, e basta uma dependência descuidada.
    Object.defineProperty(Object.prototype, "outcome", {
      value: "responded",
      configurable: true,
      enumerable: false,
    })
    Object.defineProperty(Object.prototype, "insights", {
      value: [],
      configurable: true,
      enumerable: false,
    })
    // Enquanto a poluição está de pé, `toHaveProperty` sobe a cadeia e enxerga o que
    // ACABAMOS de instalar. Aqui a pergunta tem de ser sobre propriedade PRÓPRIA — o
    // mesmo erro que este teste existe para pegar.
    const temProprio = (o: object, k: string): boolean =>
      Object.prototype.hasOwnProperty.call(o, k)

    try {
      const { t: t1, r: r1 } = transporte({ respostaBruta: {} })
      const semNada = await new CreditumHermesAdapter(t1).reason(await pedido())
      // PROTOCOL_ERROR, e não OUTPUT_NOT_VALIDATED: nem o discriminador existe.
      expect(semNada.status).toBe("PROTOCOL_ERROR")
      expect(temProprio(semNada, "insights")).toBe(false)
      expect(r1.sends).toBe(1)

      // E com o desfecho PRÓPRIO, o payload continua tendo de ser próprio.
      const { t } = transporte({ respostaBruta: { outcome: "responded" } })
      const soDesfecho = await new CreditumHermesAdapter(t).reason(await pedido())
      expect(soDesfecho.status).toBe("OUTPUT_NOT_VALIDATED")
      expect(temProprio(soDesfecho, "insights")).toBe(false)
    } finally {
      delete (Object.prototype as Record<string, unknown>)["outcome"]
      delete (Object.prototype as Record<string, unknown>)["insights"]
    }
  })

  it("chave de símbolo no envelope é recusada", async () => {
    const bruta: Record<string, unknown> = { outcome: "responded", insights: [] }
    ;(bruta as Record<symbol, unknown>)[Symbol("escondido")] = "estado"
    expect((await naoSucesso(bruta, "símbolo")).status).toBe("PROTOCOL_ERROR")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1d-b §35 §36 — a validação referencial está no caminho VIVO
// ═══════════════════════════════════════════════════════════════════════════════

describe("3.1d-b — referência inventada não atravessa o adapter", () => {
  it("evidência que o read model não autoriza é REFERENTIAL_VALIDATION_FAILED", async () => {
    // A 3.1c deixou esta lacuna nomeada e aberta de propósito: o validador existia e
    // não estava ligado. Aqui ele está.
    const { t } = transporte({
      resposta: {
        outcome: "responded",
        insights: [insightValido({ evidence_refs: ["ev_inventada"] })],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("REFERENTIAL_VALIDATION_FAILED")
    // Estado PRÓPRIO: o objeto satisfaz o schema. O que falhou foi a integridade
    // referencial — colapsar em OUTPUT_NOT_VALIDATED mandaria quem investiga procurar
    // erro de forma onde houve invenção de lastro.
    expect(res.status).not.toBe("OUTPUT_NOT_VALIDATED")
    expect(res).not.toHaveProperty("insights")
  })

  it("um insight autorizado e um inventado rejeitam a resposta INTEIRA", async () => {
    const autorizada = await refAutorizada()
    const { t } = transporte({
      resposta: {
        outcome: "responded",
        insights: [
          insightValido({ evidence_refs: [autorizada] }),
          insightValido({ insight_id: "ins_2", evidence_refs: ["ev_inventada"] }),
        ],
        completed_at: T1,
      },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("REFERENTIAL_VALIDATION_FAILED")
  })

  it("a conferência usa o MESMO read model do passo 2, e a janela do await não muda isso", async () => {
    // §36 — o objeto validado no passo 2 é o que decide a autoridade no passo 5.
    //
    // A janela existe de verdade: `await transport.probe()` e `await transport.send()`
    // devolvem o controle ao laço de eventos ENTRE a captura e a validação referencial.
    // Um chamador com referência ao read model pode mutar exatamente ali.
    //
    // O read model do assembler vem congelado, então o teste usa uma cópia mutável —
    // é o que um chamador menos disciplinado entregaria.
    const congelado = await readModelReal()
    const mutavel = JSON.parse(JSON.stringify(congelado)) as Record<string, unknown>
    const refs = mutavel["permitted_evidence_refs"] as string[]
    expect(Object.isFrozen(refs)).toBe(false)
    expect(refs).not.toContain("ev_injetada_tarde")

    const r: { readonly mutou: boolean[] } = { mutou: [] }
    const t: HermesTransport = {
      probe: async () => RUNTIME_OK,
      send: async () => {
        // AQUI: entre a captura do passo 2 e a conferência do passo 5.
        refs.push("ev_injetada_tarde")
        r.mutou.push(true)
        return {
          outcome: "responded",
          insights: [insightValido({ evidence_refs: ["ev_injetada_tarde"] })],
          completed_at: T1,
        }
      },
    }

    const res = await new CreditumHermesAdapter(t).reason({
      requested_at: T0,
      read_model: mutavel,
    })
    // A mutação ACONTECEU — o fixture alcançou a condição pretendida.
    expect(r.mutou).toEqual([true])
    expect(refs).toContain("ev_injetada_tarde")
    // E não valeu: a autoridade é a do instantâneo capturado na entrada.
    expect(res.status).toBe("REFERENTIAL_VALIDATION_FAILED")
  })

  it("zero achados explícito segue passando", async () => {
    const { t } = transporte({
      resposta: { outcome: "responded", insights: [], completed_at: T1 },
    })
    const res = await new CreditumHermesAdapter(t).reason(await pedido())
    expect(res.status).toBe("SUCCESS")
    if (res.status !== "SUCCESS") throw new Error("inalcançável")
    expect(res.insights).toHaveLength(0)
  })
})
