/**
 * Fase 3.0a — as invariantes constitucionais, provadas pelo schema.
 *
 * Cada bloco aqui tenta VIOLAR uma regra e afirma que o contrato recusa. É a
 * diferença entre uma constituição escrita e uma constituição executável: a primeira
 * vale até alguém não ler.
 *
 *   HERMES RECOMENDA. STEFANO DECIDE.
 */

import { describe, expect, it } from "vitest"
import { CONTRACT_NAMES, validate } from "../src/contracts"
import {
  APPROVAL_STATUSES,
  AUDIENCES,
  DECISIONS,
  FINAL_APPROVER,
  INSIGHT_KINDS,
  MANDATORY_RESTRICTIONS,
  RECOVERY_SEMANTICS,
  authorizeSharedBriefing,
  isApprovedByStefano,
  insightVisibleTo,
  resolveEffectiveDecision,
  SHARED_BRIEFING_CONTENT_HASH_VERSION,
  sharedBriefingApprovalSubject,
  sharedBriefingContentHash,
  toApprovalRequest,
  toContentMission,
  toDashboardObservation,
  toDecisionRecord,
  toHermesInsight,
  toSharedBriefing,
  untrusted,
} from "../src/hermes"
import type { SharedBriefingV1 } from "../src/hermes"

const V = "1.0.0"
const TS = "2026-08-26T12:00:00.000Z"
const ok = (c: Parameters<typeof validate>[0], p: unknown): boolean => validate(c, p).ok

// ═══════════════════════════════════════════════════════════════════════════════
// §42 — a fronteira epistêmica
// ═══════════════════════════════════════════════════════════════════════════════

const insight = (over: Record<string, unknown>): Record<string, unknown> => ({
  insight_id: "ins_1",
  schema_version: V,
  generated_at: TS,
  statement: untrusted("enunciado"),
  audiences: ["EXECUTIVE_STEFANO"],
  requires_stefano_approval: false,
  ...over,
})

describe("§42 — FACT, INFERENCE, ALERT e RECOMMENDATION têm exigências diferentes", () => {
  it("FACT válido exige evidência governada", () => {
    expect(ok("hermes-insight", insight({ kind: "FACT", evidence_refs: ["ev_1"] }))).toBe(true)
    // FACT sem evidência: um fato sem referência é uma afirmação sem lastro.
    expect(ok("hermes-insight", insight({ kind: "FACT" }))).toBe(false)
    expect(ok("hermes-insight", insight({ kind: "FACT", evidence_refs: [] }))).toBe(false)
  })

  it("INFERENCE válida exige limitação declarada", () => {
    expect(
      ok("hermes-insight", insight({ kind: "INFERENCE", limitations: [untrusted("não mede causa")] })),
    ).toBe(true)
    // Inferência sem limite declarado é lida como fato por quem recebe.
    expect(ok("hermes-insight", insight({ kind: "INFERENCE" }))).toBe(false)
    expect(ok("hermes-insight", insight({ kind: "INFERENCE", limitations: [] }))).toBe(false)
  })

  it("INFERENCE não pode carregar severidade canônica", () => {
    expect(
      ok(
        "hermes-insight",
        insight({ kind: "INFERENCE", limitations: [untrusted("x")], severity: "critical" }),
      ),
    ).toBe(false)
    expect(
      ok("hermes-insight", insight({ kind: "INFERENCE", limitations: [untrusted("x")], severity: null })),
    ).toBe(true)
  })

  it("FACT não pode exigir aprovação — não é proposta", () => {
    expect(
      ok("hermes-insight", insight({ kind: "FACT", evidence_refs: ["ev_1"], requires_stefano_approval: true })),
    ).toBe(false)
  })

  it("uma INFERENCE não pode ser serializada como FACT por OMISSÃO do discriminador", () => {
    // O ponto do §42: sem `kind`, o objeto não vira "fato por padrão" — não valida.
    const semKind = insight({ limitations: [untrusted("não mede causa")] })
    delete (semKind)["kind"]
    expect(ok("hermes-insight", semKind)).toBe(false)
  })

  it("kind desconhecido é recusado", () => {
    for (const k of ["OPINION", "GUESS", "TRUTH", "fact", ""]) {
      expect(ok("hermes-insight", insight({ kind: k, evidence_refs: ["ev_1"] })), k).toBe(false)
    }
    expect(INSIGHT_KINDS).toEqual(["FACT", "INFERENCE", "ALERT", "RECOMMENDATION"])
  })

  it("statement precisa do envelope de texto não-confiável", () => {
    // Texto cru chegaria a jusante indistinguível de instrução do sistema.
    expect(ok("hermes-insight", insight({ kind: "FACT", evidence_refs: ["ev_1"], statement: "cru" }))).toBe(false)
    expect(
      ok(
        "hermes-insight",
        insight({ kind: "FACT", evidence_refs: ["ev_1"], statement: { untrusted: false, content: "x" } }),
      ),
    ).toBe(false)
  })
})

describe("§10 — ALERT governado × interpretativo", () => {
  it("ALERT exige declarar a base", () => {
    expect(ok("hermes-insight", insight({ kind: "ALERT" }))).toBe(false)
  })

  it("ALERT governado nomeia o fato que o sustenta", () => {
    expect(ok("hermes-insight", insight({ kind: "ALERT", alert_basis: "GOVERNED" }))).toBe(false)
    expect(
      ok(
        "hermes-insight",
        insight({
          kind: "ALERT",
          alert_basis: "GOVERNED",
          governed_fact_type: "P_SIGNATURE_DEADLINE_ATTENTION",
        }),
      ),
    ).toBe(true)
  })

  it("ALERT interpretativo NÃO inventa severidade canônica", () => {
    // O furo que a 2.12 fechou para A/P e que aqui não pode reabrir.
    expect(
      ok("hermes-insight", insight({ kind: "ALERT", alert_basis: "INTERPRETIVE", severity: "critical" })),
    ).toBe(false)
    expect(
      ok("hermes-insight", insight({ kind: "ALERT", alert_basis: "INTERPRETIVE", severity: null })),
    ).toBe(true)
  })
})

describe("§11 — RECOMMENDATION sempre exige Stefano", () => {
  it("requires_stefano_approval false é INVÁLIDO numa recomendação", () => {
    const base = { kind: "RECOMMENDATION", proposed_action: untrusted("fazer X") }
    expect(ok("hermes-insight", insight({ ...base, requires_stefano_approval: true }))).toBe(true)
    expect(ok("hermes-insight", insight({ ...base, requires_stefano_approval: false }))).toBe(false)
  })

  it("recomendação sem ação proposta é incompleta", () => {
    expect(ok("hermes-insight", insight({ kind: "RECOMMENDATION", requires_stefano_approval: true }))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §43 §44 — autoridade de Stefano e ausência de aprovação implícita
// ═══════════════════════════════════════════════════════════════════════════════

const pedido = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  approval_id: "apr_1",
  schema_version: V,
  requested_at: TS,
  requested_by: "HERMES",
  approver: "STEFANO",
  subject_type: "CONTENT_MISSION",
  subject_ref: "mis_1",
  proposed_action: untrusted("publicar após aprovação"),
  rationale: untrusted("porque X"),
  supporting_refs: ["obs_1"],
  risk_and_uncertainty: [untrusted("pode não engajar")],
  status: "AWAITING_STEFANO_APPROVAL",
  ...over,
})

const decisao = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  decision_id: "dec_1",
  schema_version: V,
  approval_id: "apr_1",
  decided_by: "STEFANO",
  decision: "APPROVED",
  decided_at: TS,
  ...over,
})

describe("§43 — só Stefano aprova", () => {
  it("approver STEFANO é válido; qualquer outro é recusado", () => {
    expect(ok("approval-request", pedido())).toBe(true)
    for (const a of ["HERMES", "AROS", "LUCAS", "LEONARDO", "SYSTEM", "stefano"]) {
      expect(ok("approval-request", pedido({ approver: a })), a).toBe(false)
    }
  })

  it("decided_by STEFANO é válido; qualquer outro é recusado", () => {
    expect(ok("decision-record", decisao())).toBe(true)
    for (const d of ["HERMES", "AROS", "LUCAS", "LEONARDO", "SYSTEM"]) {
      expect(ok("decision-record", decisao({ decided_by: d })), d).toBe(false)
    }
    expect(FINAL_APPROVER).toBe("STEFANO")
  })

  it("dono de fonte NÃO é aprovador — §51", () => {
    // Lucas e Leonardo são donos de fonte no briefing, e o vocabulário de aprovação
    // simplesmente não os contém. Curadoria e autoridade são eixos diferentes.
    expect(ok("decision-record", decisao({ decided_by: "LUCAS" }))).toBe(false)
    expect(ok("decision-record", decisao({ decided_by: "LEONARDO" }))).toBe(false)
  })

  it("pedido sem risco declarado é incompleto", () => {
    expect(ok("approval-request", pedido({ risk_and_uncertainty: [] }))).toBe(false)
  })
})

describe("§44 — nenhum caminho para aprovação implícita", () => {
  it("APPROVED não existe no vocabulário de status do pedido", () => {
    expect(APPROVAL_STATUSES).not.toContain("APPROVED")
    for (const s of [
      "APPROVED",
      "AUTO_APPROVED",
      "TIMEOUT_APPROVED",
      "ASSUMED_APPROVED",
      "HERMES_APPROVED",
      "AROS_READY",
    ]) {
      expect(ok("approval-request", pedido({ status: s })), s).toBe(false)
    }
  })

  it("APPROVED só existe em DecisionRecord", () => {
    expect(DECISIONS).toEqual(["APPROVED", "REJECTED", "APPROVED_WITH_CHANGES"])
  })

  it("`DECIDED` sem apontar a decisão é recusado", () => {
    // O estado não pode afirmar que houve decisão sem exibir qual registro a contém.
    expect(ok("approval-request", pedido({ status: "DECIDED" }))).toBe(false)
    expect(ok("approval-request", pedido({ status: "DECIDED", decision_ref: "dec_1" }))).toBe(true)
  })

  it("aguardando aprovação NÃO pode carregar decisão", () => {
    expect(
      ok("approval-request", pedido({ status: "AWAITING_STEFANO_APPROVAL", decision_ref: "dec_1" })),
    ).toBe(false)
  })

  it("silêncio, timeout e confiança do Hermes não aprovam nada", () => {
    const req = toApprovalRequest(pedido())
    // Sem NENHUM DecisionRecord: não aprovado. É o caso do silêncio.
    expect(isApprovedByStefano(req, [])).toBe(false)
    // Decisão de outro pedido não vale para este.
    const outra = toDecisionRecord(decisao({ approval_id: "apr_outro" }))
    expect(isApprovedByStefano(req, [outra])).toBe(false)
    // Rejeição não é aprovação.
    const neg = toDecisionRecord(decisao({ decision_id: "dec_2", decision: "REJECTED" }))
    expect(isApprovedByStefano(req, [neg])).toBe(false)
    // Só o registro explícito de Stefano aprova.
    expect(isApprovedByStefano(req, [toDecisionRecord(decisao())])).toBe(true)
  })

  it("APPROVED_WITH_CHANGES exige dizer QUAIS mudanças", () => {
    expect(ok("decision-record", decisao({ decision: "APPROVED_WITH_CHANGES" }))).toBe(false)
    expect(
      ok("decision-record", decisao({ decision: "APPROVED_WITH_CHANGES", changes: [untrusted("trocar o hook")] })),
    ).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §45 — publicação
// ═══════════════════════════════════════════════════════════════════════════════

const missao = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  mission_id: "mis_1",
  schema_version: V,
  created_at: TS,
  created_by: "HERMES",
  primary_objective: "FOLLOWER_GROWTH",
  format: "REEL",
  audience: "COMMERCIAL_LUCAS",
  theme: untrusted("tema"),
  message: untrusted("mensagem"),
  publication_authorized: false,
  ...over,
})

describe("§45 — Hermes não autoriza publicação", () => {
  it("publication_authorized true é INVÁLIDO", () => {
    expect(ok("content-mission", missao())).toBe(true)
    expect(ok("content-mission", missao({ publication_authorized: true }))).toBe(false)
  })

  it("o builder congela a missão com a autorização em false", () => {
    const m = toContentMission(missao())
    expect(m.publication_authorized).toBe(false)
    expect(() => {
      ;(m as { publication_authorized: boolean }).publication_authorized = true
    }).toThrow()
    expect(m.publication_authorized).toBe(false)
  })

  it("a missão é criada por HERMES, nunca por Stefano ou Aros", () => {
    for (const c of ["AROS", "STEFANO", "LUCAS"]) {
      expect(ok("content-mission", missao({ created_by: c })), c).toBe(false)
    }
  })

  it("o pacote do Aros não tem campo que conceda publicação", () => {
    const pacote = {
      package_id: "pkg_1",
      schema_version: V,
      mission_id: "mis_1",
      created_by: "AROS",
      created_at: TS,
      format: "REEL",
      concept: untrusted("conceito"),
      caption: untrusted("legenda"),
      status: "READY_FOR_HERMES_REVIEW",
    }
    expect(ok("content-package", pacote)).toBe(true)
    // Nenhuma variação de "publicar" entra.
    for (const campo of ["publication_authorized", "publish_now", "published", "auto_publish"]) {
      expect(ok("content-package", { ...pacote, [campo]: true }), campo).toBe(false)
    }
    // E `status` não tem APPROVED: Aros encaminha, não aprova.
    expect(ok("content-package", { ...pacote, status: "APPROVED" })).toBe(false)
    expect(
      ok("content-package", { ...pacote, status: "ACCEPTED_FOR_APPROVAL", approval_request_ref: "apr_1" }),
    ).toBe(true)
    // Encaminhar sem apontar o pedido é estado incompleto.
    expect(ok("content-package", { ...pacote, status: "ACCEPTED_FOR_APPROVAL" })).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §46 §47 — audiência fail-closed e projeção positiva
// ═══════════════════════════════════════════════════════════════════════════════

const compartilhado = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  shared_briefing_id: "shb_1",
  schema_version: V,
  generated_from: "brf_1",
  generated_at: TS,
  audience: "COMMERCIAL_LUCAS",
  permitted_insights: ["ins_1"],
  permitted_evidence_refs: ["ev_1"],
  // Autoridade é REFERÊNCIA desde a remediação: `authorized_by` saiu do contrato.
  authorization_ref: "dec_1",
  ...over,
})

describe("§46 — audiência é allowlist, e o default é negar", () => {
  it("as três audiências governadas valem", () => {
    for (const a of AUDIENCES) {
      expect(ok("shared-briefing", compartilhado({ audience: a })), a).toBe(true)
    }
  })

  it("ALL, EVERYONE e PUBLIC não existem", () => {
    for (const a of ["ALL", "EVERYONE", "PUBLIC", "MARKETING", "", "*"]) {
      expect(ok("shared-briefing", compartilhado({ audience: a })), a).toBe(false)
    }
  })

  it("insight sem audiência não é visível para ninguém", () => {
    const ins = toHermesInsight(insight({ kind: "FACT", evidence_refs: ["ev_1"], audiences: [] }))
    for (const a of AUDIENCES) expect(insightVisibleTo(ins, a)).toBe(false)
  })

  it("insight é visível SÓ para quem está na allowlist", () => {
    const ins = toHermesInsight(
      insight({ kind: "FACT", evidence_refs: ["ev_1"], audiences: ["COMMERCIAL_LUCAS"] }),
    )
    expect(insightVisibleTo(ins, "COMMERCIAL_LUCAS")).toBe(true)
    expect(insightVisibleTo(ins, "FINANCE_LEONARDO")).toBe(false)
    expect(insightVisibleTo(ins, "EXECUTIVE_STEFANO")).toBe(false)
  })
})

describe("§47 — projeção POSITIVA, não filtro", () => {
  it("um SharedBriefing mínimo NÃO contém o ExecutiveBriefing", () => {
    const shb = toSharedBriefing(compartilhado())
    const chaves = Object.keys(shb)
    // `generated_from` é uma referência, não o conteúdo.
    expect(shb.generated_from).toBe("brf_1")
    for (const proibida of [
      "executive_briefing",
      "commercial_state",
      "operational_facts",
      "detector_results",
      "source_health",
      "hidden_sections",
    ]) {
      expect(chaves, proibida).not.toContain(proibida)
    }
  })

  it("não existe campo para esconder — esconder pressupõe ter gerado", () => {
    expect(ok("shared-briefing", compartilhado({ hidden_sections: ["commercial"] }))).toBe(false)
    expect(ok("shared-briefing", compartilhado({ executive_briefing: { period: "2026-08" } }))).toBe(false)
  })

  it("nenhum ator pode se declarar autorizador", () => {
    // `authorized_by` não existe mais: qualquer tentativa de afirmar autoridade dentro
    // do objeto é recusada por `additionalProperties: false`, inclusive "STEFANO".
    for (const a of ["HERMES", "AROS", "LUCAS", "STEFANO"]) {
      expect(ok("shared-briefing", { ...compartilhado(), authorized_by: a }), a).toBe(false)
    }
  })

  it("nada permitido é resultado legítimo — não um erro", () => {
    expect(
      ok("shared-briefing", compartilhado({ permitted_insights: [], permitted_evidence_refs: [] })),
    ).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §48 — dashboard somente leitura
// ═══════════════════════════════════════════════════════════════════════════════

const observacao = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  observation_id: "dob_1",
  schema_version: V,
  source: "portal.contratos",
  owner: "LUCAS",
  observed_at: TS,
  interaction_mode: "OBSERVE_ONLY",
  view_state: { period: "2026-08", unit: "Meriti" },
  observations: [untrusted("11 contratos em P")],
  ...over,
})

describe("§48 — OBSERVE_ONLY é o único modo", () => {
  it("OBSERVE_ONLY vale; WRITE, EDIT, UPDATE e ADMIN não", () => {
    expect(ok("dashboard-observation", observacao())).toBe(true)
    for (const m of ["WRITE", "EDIT", "UPDATE", "ADMIN", "READ_WRITE", "observe_only"]) {
      expect(ok("dashboard-observation", observacao({ interaction_mode: m })), m).toBe(false)
    }
  })

  it("nenhum campo de permissão pode ser adicionado por fora", () => {
    // §53 — `additionalProperties: false` fecha a porta lateral.
    for (const campo of [
      "write_access",
      "can_edit",
      "permissions",
      "override_source",
      "allow_update",
      "auto_approve",
    ]) {
      expect(ok("dashboard-observation", observacao({ [campo]: true })), campo).toBe(false)
    }
  })

  it("view_state preserva contexto sem exigir campo que não foi observado", () => {
    // Um dashboard sem filtro de unidade não deve ser forçado a inventar um.
    expect(ok("dashboard-observation", observacao({ view_state: {} }))).toBe(true)
    expect(
      ok("dashboard-observation", observacao({ view_state: { filters: [{ field: "unidade", value: "Meriti" }] } })),
    ).toBe(true)
  })

  it("o dono do dashboard não vira aprovador", () => {
    const obs = toDashboardObservation(observacao({ owner: "LEONARDO" }))
    expect(obs.owner).toBe("LEONARDO")
    expect(Object.keys(obs)).not.toContain("approver")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §24 — observação de mercado ≠ inferência
// ═══════════════════════════════════════════════════════════════════════════════

describe("§24 — o contrato de mercado não tem onde guardar interpretação", () => {
  const base = {
    observation_id: "mob_1",
    schema_version: V,
    observed_at: TS,
    source_type: "COMPETITOR",
    subject: untrusted("Concorrente Y"),
    observed_fact: untrusted("publicou 6 Reels sobre X"),
    capture_time: TS,
  }

  it("fato observável vale", () => {
    expect(ok("market-observation", base)).toBe(true)
  })

  it("campos de interpretação são recusados", () => {
    // "Parece aumentar aposta em X" é INFERENCE e mora em HermesInsight.
    for (const campo of ["interpretation", "hypothesis", "trend", "conclusion", "inference", "meaning"]) {
      expect(ok("market-observation", { ...base, [campo]: "parece apostar em X" }), campo).toBe(false)
    }
  })

  it("source_type é fechado", () => {
    for (const t of ["RUMOR", "GUESS", "competitor", ""]) {
      expect(ok("market-observation", { ...base, source_type: t }), t).toBe(false)
    }
  })

  it("ausência de métrica não é zero — o item simplesmente não existe", () => {
    // Sem `metrics_if_available` o objeto é válido, e nada afirma zero alcance.
    expect(ok("market-observation", base)).toBe(true)
    expect(Object.keys(base)).not.toContain("metrics_if_available")
    // Uma métrica declarada exige valor: não existe métrica sem número.
    expect(ok("market-observation", { ...base, metrics_if_available: [{ metric: "reels" }] })).toBe(false)
    expect(ok("market-observation", { ...base, metrics_if_available: [{ metric: "reels", value: 6 }] })).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §49 §50 — ausência × zero, e transporte dos fatos de prazo
// ═══════════════════════════════════════════════════════════════════════════════

const briefing = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  briefing_id: "brf_1",
  schema_version: V,
  generated_at: TS,
  period: "2026-08",
  scope: ["COMMERCIAL"],
  source_health: [
    { dataset_id: "lucas_status_contratos_mensal", owner: "LUCAS", view_state: "available" },
  ],
  commercial_state: { view_state: "available", commercial_potential: 20, commercially_confirmed: 9, emitted: 8 },
  detector_results: [{ detector: "D", execution_state: "executed_no_findings" }],
  quality_and_coverage: { quality_status: "ok" },
  evidence_index: ["ev_1"],
  ...over,
})

describe("§49 — ausência nunca é zero", () => {
  it("available_empty admite contagem zero; data_not_available NÃO admite contagem", () => {
    // "Sabemos que é zero" e "não sabemos" são estados diferentes, e o schema os separa.
    expect(
      ok("executive-briefing", briefing({ commercial_state: { view_state: "available_empty", commercial_potential: 0, emitted: 0 } })),
    ).toBe(true)
    expect(
      ok("executive-briefing", briefing({ commercial_state: { view_state: "data_not_available", commercial_potential: 0 } })),
    ).toBe(false)
    expect(
      ok("executive-briefing", briefing({ commercial_state: { view_state: "data_not_available" } })),
    ).toBe(true)
  })

  it("source_error e invalid_source também não carregam número", () => {
    for (const st of ["source_error", "invalid_source"]) {
      expect(
        ok("executive-briefing", briefing({ commercial_state: { view_state: st, emitted: 0 } })),
        st,
      ).toBe(false)
    }
  })

  it("not_executed exige razão e é DIFERENTE de executed_no_findings", () => {
    expect(
      ok("executive-briefing", briefing({ detector_results: [{ detector: "D", execution_state: "not_executed" }] })),
    ).toBe(false)
    expect(
      ok(
        "executive-briefing",
        briefing({
          detector_results: [
            {
              detector: "D",
              execution_state: "not_executed",
              not_executed_reason: "NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION",
            },
          ],
        }),
      ),
    ).toBe(true)
    // E o estado com resultado não exige razão: ele É a resposta.
    expect(
      ok("executive-briefing", briefing({ detector_results: [{ detector: "D", execution_state: "executed_no_findings" }] })),
    ).toBe(true)
  })

  it("SOURCE_VIEW_GAP declara a dimensão que pertence ao owner", () => {
    expect(
      ok(
        "executive-briefing",
        briefing({
          source_view_gaps: [
            { gap: "SOURCE_VIEW_GAP", owner: "LEONARDO", dimension: "inadimplência por unidade" },
          ],
        }),
      ),
    ).toBe(true)
  })
})

describe("§50 — os fatos de prazo viajam prontos", () => {
  it("os quatro fatos da Fase 2.13 são transportáveis, com a data JÁ resolvida", () => {
    const facts = [
      { fact_type: "P_SIGNATURE_DEADLINE_ATTENTION", subject_ref: "subj_0123456789abcdef", source_status: "P", derived_deadline_state: "p_signature_deadline_attention", deadline: "2026-08-30", evaluation_date: "2026-08-26", offset_days: -4, recovery_candidate: false, recovery_semantics: null, severity: null, severity_status: "SEVERITY_POLICY_UNRESOLVED" },
      { fact_type: "A_EMISSION_DEADLINE_ALERT", subject_ref: "subj_00112233445566aa", source_status: "A", derived_deadline_state: "a_emission_deadline_alert", deadline: "2026-08-27", offset_days: -1 },
      { fact_type: "CONTRACT_DEADLINE_MISSED", subject_ref: "subj_00112233445566bb", source_status: "P", derived_deadline_state: "contract_deadline_missed", deadline: "2026-08-26", offset_days: 0 },
      { fact_type: "AUTO_CANCELLED_BY_DEADLINE", subject_ref: "subj_00112233445566cc", source_status: "P", derived_deadline_state: "auto_cancelled_by_deadline", deadline: "2026-08-24", offset_days: 2, recovery_candidate: true, recovery_semantics: RECOVERY_SEMANTICS },
    ]
    expect(ok("executive-briefing", briefing({ operational_facts: facts }))).toBe(true)
  })

  it("§26 — source_status P coexiste com auto-cancelamento derivado, sem virar C", () => {
    const f = {
      fact_type: "AUTO_CANCELLED_BY_DEADLINE",
      subject_ref: "subj_0123456789abcdef",
      source_status: "P",
      derived_deadline_state: "auto_cancelled_by_deadline",
      deadline: "2026-08-24",
      offset_days: 2,
    }
    expect(ok("executive-briefing", briefing({ operational_facts: [f] }))).toBe(true)
    // Os dois campos são separados por construção; não há campo único que force escolher.
    expect(Object.keys(f)).toContain("source_status")
    expect(Object.keys(f)).toContain("derived_deadline_state")
  })

  it("o briefing NÃO tem campo a partir do qual recalcular o prazo", () => {
    // Nada de offsets configuráveis, regra de dias ou fuso: a Fase 2.13 já decidiu.
    for (const campo of ["deadline_offset_days", "calendar_rule", "timezone", "p_attention_offset"]) {
      expect(ok("executive-briefing", briefing({ [campo]: -4 })), campo).toBe(false)
    }
  })

  it("subject_ref é pseudônimo governado — CPF e nome não passam", () => {
    for (const ref of ["087.731.554-03", "08773155403", "TATIANE", "subj_xyz"]) {
      expect(
        ok(
          "executive-briefing",
          briefing({ operational_facts: [{ fact_type: "PENDING_STUDENT_SIGNATURE", subject_ref: ref, source_status: "P" }] }),
        ),
        ref,
      ).toBe(false)
    }
  })

  it("fully_completed é declarada e NÃO computada", () => {
    expect(
      ok("executive-briefing", briefing({ commercial_state: { view_state: "available", fully_completed: { status: "DEFERRED_REQUIRES_OMIE_PAYMENT" } } })),
    ).toBe(true)
    // Não existe contagem para ela: o Omie não é fonte observável nesta fase.
    expect(
      ok("executive-briefing", briefing({ commercial_state: { view_state: "available", fully_completed: { status: "DEFERRED_REQUIRES_OMIE_PAYMENT", count: 3 } } })),
    ).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §6 — o read model não pode alterar fato governado
// ═══════════════════════════════════════════════════════════════════════════════

const readModel = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  read_model_id: "rdm_1",
  schema_version: V,
  generated_at: TS,
  executive_briefing_ref: "brf_1",
  executive_briefing_hash: "a".repeat(64),
  capabilities: ["OBSERVE_SOURCES", "PRODUCE_INSIGHTS"],
  restrictions: [...MANDATORY_RESTRICTIONS],
  ...over,
})

describe("§6 — read model referencia o briefing, não o copia", () => {
  it("referência + hash valem; briefing embutido é recusado", () => {
    expect(ok("hermes-read-model", readModel())).toBe(true)
    // Uma cópia do briefing dentro do read model seria uma segunda autoridade,
    // capaz de divergir do original sem que nada falhasse.
    expect(ok("hermes-read-model", readModel({ executive_briefing: briefing() }))).toBe(false)
  })

  it("as três proibições constitucionais são OBRIGATÓRIAS", () => {
    for (const faltando of MANDATORY_RESTRICTIONS) {
      const restantes = MANDATORY_RESTRICTIONS.filter((r) => r !== faltando)
      expect(
        ok("hermes-read-model", readModel({ restrictions: [...restantes, "NO_DASHBOARD_WRITE"] })),
        faltando,
      ).toBe(false)
    }
  })

  it("capacidade de aprovar ou publicar não existe no vocabulário", () => {
    for (const c of ["APPROVE", "PUBLISH", "WRITE_SOURCE", "MUTATE_SOURCE"]) {
      expect(ok("hermes-read-model", readModel({ capabilities: [c] })), c).toBe(false)
    }
  })

  it("crescimento: métrica ausente não é zero, e não há atribuição afirmada", () => {
    expect(
      ok(
        "hermes-read-model",
        readModel({
          growth_context: {
            primary_objective: "FOLLOWER_GROWTH",
            attribution: "NO_GOVERNED_ATTRIBUTION_CHAIN",
            observed: [{ metric: "new_followers", value: 128, captured_at: TS }],
          },
        }),
      ),
    ).toBe(true)
    // Objetivo primário é fechado.
    expect(
      ok("hermes-read-model", readModel({ growth_context: { primary_objective: "REVENUE", observed: [] } })),
    ).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §52 §53 — imutabilidade e propriedades extras
// ═══════════════════════════════════════════════════════════════════════════════

describe("§52 — objetos de autoridade são imutáveis", () => {
  it("mutação pós-construção não altera o objeto canônico", () => {
    const d = toDecisionRecord(decisao())
    expect(() => {
      ;(d as { decision: string }).decision = "REJECTED"
    }).toThrow()
    expect(d.decision).toBe("APPROVED")

    const r = toApprovalRequest(pedido())
    expect(() => {
      ;(r as { approver: string }).approver = "HERMES"
    }).toThrow()
    expect(r.approver).toBe("STEFANO")
  })

  it("congelamento é PROFUNDO — o texto aninhado também", () => {
    const ins = toHermesInsight(insight({ kind: "FACT", evidence_refs: ["ev_1"] }))
    expect(Object.isFrozen(ins.statement)).toBe(true)
    expect(Object.isFrozen(ins.audiences)).toBe(true)
    const shb = toSharedBriefing(compartilhado())
    expect(Object.isFrozen(shb.permitted_insights)).toBe(true)
  })
})

describe("§53 — a porta lateral está fechada em todos os contratos", () => {
  const casos: readonly [Parameters<typeof validate>[0], Record<string, unknown>][] = [
    ["hermes-insight", insight({ kind: "FACT", evidence_refs: ["ev_1"] })],
    ["approval-request", pedido()],
    ["decision-record", decisao()],
    ["executive-briefing", briefing()],
    ["hermes-read-model", readModel()],
    ["shared-briefing", compartilhado()],
    ["dashboard-observation", observacao()],
    ["content-mission", missao()],
  ]

  for (const [contrato, base] of casos) {
    it(`${contrato} recusa campo de escape`, () => {
      for (const campo of ["auto_approve", "write_access", "publish_now", "override_source"]) {
        expect(ok(contrato, { ...base, [campo]: true }), `${contrato}.${campo}`).toBe(false)
      }
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// §12 §13 §16 — a retirada dos contratos legados
// ═══════════════════════════════════════════════════════════════════════════════

describe("§12 — os três legados não são mais contratos ativos", () => {
  const RETIRADOS = ["recommendation", "decision", "aros-briefing"] as const

  it("a enumeração canônica não os anuncia", () => {
    // Testa o registro de verdade, não o texto-fonte: `CONTRACT_NAMES` é o que torna
    // um schema canônico neste repositório.
    for (const n of RETIRADOS) {
      expect(CONTRACT_NAMES as readonly string[], n).not.toContain(n)
    }
    expect(CONTRACT_NAMES).toContain("decision-record")
    expect(CONTRACT_NAMES).toContain("hermes-insight")
    expect(CONTRACT_NAMES).toContain("content-package")
  })

  it("os dez canônicos estão registrados, e nada a mais do Hermes", () => {
    const hermes = [
      "executive-briefing", "hermes-read-model", "hermes-insight",
      "dashboard-observation", "market-observation", "content-mission",
      "content-package", "approval-request", "decision-record", "shared-briefing",
    ]
    for (const n of hermes) expect(CONTRACT_NAMES as readonly string[], n).toContain(n)
    expect(CONTRACT_NAMES).toHaveLength(13)
  })
})

describe("§13 — o caminho de validação legado está FECHADO", () => {
  const RETIRADOS = ["recommendation", "decision", "aros-briefing"] as const

  it("validar contra um contrato retirado falha — não cai em fallback", () => {
    for (const n of RETIRADOS) {
      // O cast existe porque o tipo já não admite o nome; o teste prova o RUNTIME.
      expect(() => validate(n as unknown as Parameters<typeof validate>[0], {}), n).toThrow()
    }
  })

  it("um payload que era válido no contrato legado não valida em lugar nenhum", () => {
    // Payload no formato antigo de `decision`: `decided_by_role` como string livre.
    // Era aceito; hoje não existe contrato ativo que o aceite.
    const legado = {
      decision_id: "dec_legado",
      schema_version: "1.0.0",
      recommendation_id: "rec_1",
      run_id: "run_1",
      decided_at: "2026-08-26T12:00:00.000Z",
      decided_by_role: "HERMES",
      outcome: "approved",
    }
    for (const n of CONTRACT_NAMES) {
      expect(validate(n, legado).ok, n).toBe(false)
    }
  })

  it("o atalho booleano de aprovação do Aros não vale em contrato ativo — §15", () => {
    // `approved_by_human: true` era aprovação sem DecisionRecord. Nenhum contrato
    // ativo o aceita, e o `additionalProperties: false` dos dez o recusa por forma.
    const atalho = { briefing_id: "brf_legado", schema_version: "1.0.0", approved_by_human: true }
    for (const n of CONTRACT_NAMES) {
      expect(validate(n, atalho).ok, n).toBe(false)
    }
  })
})

describe("§16 — um único objeto pode declarar decisão final", () => {
  it("só `decision-record` tem o vocabulário de veredito", () => {
    // Percorre os contratos ATIVOS e conta quantos aceitam `decision: "APPROVED"`.
    // Mais de um seria um segundo caminho de autoridade.
    const comVeredito = CONTRACT_NAMES.filter((n) => {
      const base: Record<string, unknown> = {
        decision_id: "dec_1", schema_version: V, approval_id: "apr_1",
        decided_by: "STEFANO", decision: "APPROVED", decided_at: TS,
      }
      return validate(n, base).ok
    })
    expect(comVeredito).toEqual(["decision-record"])
  })

  it("`requires_stefano_approval` EXIGE aprovação, não a concede", () => {
    // A distinção que separa este campo de `approved_by_human`: o nome e a semântica
    // pedem a decisão. Um insight com ele `true` continua sem aprovação nenhuma.
    const rec = toHermesInsight(
      insight({
        kind: "RECOMMENDATION",
        proposed_action: untrusted("fazer X"),
        requires_stefano_approval: true,
      }),
    )
    expect(rec.requires_stefano_approval).toBe(true)
    // E não existe DecisionRecord: portanto não há aprovação.
    const req = toApprovalRequest(pedido({ subject_type: "HERMES_INSIGHT", subject_ref: "ins_1" }))
    expect(isApprovedByStefano(req, [])).toBe(false)
  })

  it("cada contrato ativo tem UM papel — nenhum acumula autoridade", () => {
    // ApprovalRequest pede; DecisionRecord decide. Trocar os papéis não valida.
    expect(validate("approval-request", decisao()).ok).toBe(false)
    expect(validate("decision-record", pedido()).ok).toBe(false)
    // HermesInsight não decide, e ContentPackage não decide.
    expect(validate("hermes-insight", decisao()).ok).toBe(false)
    expect(validate("content-package", decisao()).ok).toBe(false)
    expect(validate("shared-briefing", decisao()).ok).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remediação — HIGH #1: a decisão EFETIVA
// ═══════════════════════════════════════════════════════════════════════════════

const dec = (id: string, decision: string, supersedes?: string, approval = "apr_1") =>
  toDecisionRecord({
    decision_id: id,
    schema_version: V,
    approval_id: approval,
    decided_by: "STEFANO",
    decision,
    decided_at: TS,
    ...(decision === "APPROVED_WITH_CHANGES" ? { changes: [untrusted("x")] } : {}),
    ...(supersedes === undefined ? {} : { supersedes }),
  })

describe("HIGH #1 — aprovação revogada deixa de valer", () => {
  const req = toApprovalRequest(pedido())

  it("D1 APPROVED, D2 supersedes D1 REJECTED → NÃO aprovado", () => {
    // O achado do gate, direto. `some(APPROVED)` respondia `true` aqui.
    const chain = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    const r = resolveEffectiveDecision("apr_1", chain)
    expect(r.status).toBe("effective")
    if (r.status === "effective") expect(r.decision.decision_id).toBe("dec_2")
    expect(isApprovedByStefano(req, chain)).toBe(false)
  })

  it("D1 REJECTED, D2 supersedes D1 APPROVED → aprovado", () => {
    const chain = [dec("dec_1", "REJECTED"), dec("dec_2", "APPROVED", "dec_1")]
    expect(isApprovedByStefano(req, chain)).toBe(true)
  })

  it("cadeia de três: só o terminal manda", () => {
    const chain = [
      dec("dec_1", "APPROVED"),
      dec("dec_2", "REJECTED", "dec_1"),
      dec("dec_3", "APPROVED", "dec_2"),
    ]
    const r = resolveEffectiveDecision("apr_1", chain)
    expect(r.status === "effective" && r.decision.decision_id).toBe("dec_3")
    expect(isApprovedByStefano(req, chain)).toBe(true)
    // E o histórico permanece: append-only não apaga, só deixa de valer.
    expect(chain).toHaveLength(3)
    expect(Object.isFrozen(chain[0])).toBe(true)
  })

  it("APPROVED_WITH_CHANGES autoriza, e revogado não", () => {
    expect(isApprovedByStefano(req, [dec("dec_1", "APPROVED_WITH_CHANGES")])).toBe(true)
    expect(
      isApprovedByStefano(req, [
        dec("dec_1", "APPROVED_WITH_CHANGES"),
        dec("dec_2", "REJECTED", "dec_1"),
      ]),
    ).toBe(false)
  })

  it("ordem no array e relógio NÃO são autoridade", () => {
    // Mesma cadeia, ordem invertida no array: resultado idêntico.
    const a = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    const b = [dec("dec_2", "REJECTED", "dec_1"), dec("dec_1", "APPROVED")]
    expect(isApprovedByStefano(req, a)).toBe(isApprovedByStefano(req, b))
    expect(isApprovedByStefano(req, b)).toBe(false)
  })

  it("sem decisão é `no_decision`, e NÃO é cadeia malformada", () => {
    // Aguardar decisão é o estado ordinário. Chamá-lo de defeito mandaria alguém
    // procurar bug onde só falta o Stefano decidir.
    expect(resolveEffectiveDecision("apr_1", [])).toEqual({ status: "no_decision" })
    expect(isApprovedByStefano(req, [])).toBe(false)
  })

  it("decisão de OUTRO pedido não vale para este", () => {
    expect(isApprovedByStefano(req, [dec("dec_x", "APPROVED", undefined, "apr_outro")])).toBe(false)
    expect(resolveEffectiveDecision("apr_1", [dec("dec_x", "APPROVED", undefined, "apr_outro")]))
      .toEqual({ status: "no_decision" })
  })
})

describe("HIGH #1 — cadeias malformadas falham FECHADAS", () => {
  const req = toApprovalRequest(pedido())
  const malformada = (chain: readonly unknown[], defeito: string) => {
    const r = resolveEffectiveDecision("apr_1", chain)
    expect(r.status).toBe("malformed_chain")
    if (r.status === "malformed_chain") expect(r.defect).toBe(defeito)
    expect(isApprovedByStefano(req, chain as never)).toBe(false)
  }

  it("id duplicado", () => {
    malformada([dec("dec_1", "APPROVED"), dec("dec_1", "REJECTED")], "DUPLICATE_DECISION_ID")
  })

  it("supersessão pendurada", () => {
    malformada([dec("dec_2", "APPROVED", "dec_999")], "DANGLING_SUPERSESSION")
  })

  it("ciclo", () => {
    malformada(
      [dec("dec_1", "APPROVED", "dec_2"), dec("dec_2", "REJECTED", "dec_1")],
      "CYCLIC_CHAIN",
    )
  })

  it("bifurcação: dois sucessores do mesmo antecessor", () => {
    malformada(
      [
        dec("dec_1", "APPROVED"),
        dec("dec_2", "REJECTED", "dec_1"),
        dec("dec_3", "APPROVED", "dec_1"),
      ],
      "FORKED_CHAIN",
    )
  })

  it("raízes múltiplas: nenhuma é 'a mais recente'", () => {
    malformada([dec("dec_1", "APPROVED"), dec("dec_2", "APPROVED")], "MULTIPLE_ROOTS")
  })

  it("supersessão cruzando pedidos", () => {
    malformada(
      [dec("dec_a", "APPROVED", undefined, "apr_outro"), dec("dec_b", "REJECTED", "dec_a")],
      "CROSS_APPROVAL_SUPERSESSION",
    )
  })

  it("cadeia malformada NUNCA é lida como aprovação", () => {
    // Todas as formas acima, com APPROVED em algum lugar: nenhuma aprova.
    const comAprovado = [
      [dec("dec_1", "APPROVED"), dec("dec_1", "APPROVED")],
      [dec("dec_2", "APPROVED", "dec_999")],
      [dec("dec_1", "APPROVED"), dec("dec_2", "APPROVED")],
    ]
    for (const c of comAprovado) expect(isApprovedByStefano(req, c)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remediação — HIGH #2: SharedBriefing não se autoriza
// ═══════════════════════════════════════════════════════════════════════════════

const shb = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  shared_briefing_id: "shb_1",
  schema_version: V,
  generated_from: "brf_1",
  generated_at: TS,
  audience: "COMMERCIAL_LUCAS",
  permitted_insights: ["ins_1"],
  permitted_evidence_refs: ["ev_1"],
  authorization_ref: "dec_1",
  ...over,
})

/**
 * Pedido de divulgação, com o vínculo de conteúdo DERIVADO do briefing.
 *
 * Passou a derivar na remediação do replay: montar `subject_ref` e
 * `subject_content_hash` à mão é onde os dois divergem.
 */
/**
 * Pedido de divulgação DECIDIDO, apontando a MESMA decisão que o briefing.
 *
 * `status: "DECIDED"` e `decision_ref` são obrigatórios desde a remediação de ciclo de
 * vida: um pedido que ainda aguarda, ou que foi retirado, não autoriza nem com um
 * `APPROVED` em mãos. Os três objetos têm de concordar.
 */
const pedidoDeShare = (over: Record<string, unknown> = {}) =>
  toApprovalRequest({
    ...pedido(),
    ...sharedBriefingApprovalSubject(toSharedBriefing(shb())),
    status: "DECIDED",
    decision_ref: shb()["authorization_ref"],
    ...over,
  })

describe("HIGH #2 — autoridade de divulgação é referência, não afirmação", () => {
  it("`authorized_by` não existe mais no contrato", () => {
    // Um nome dentro do próprio objeto não é prova. O campo saiu em vez de virar
    // metadado: um campo que PARECE autoridade é lido como autoridade.
    expect(ok("shared-briefing", { ...shb(), authorized_by: "STEFANO" })).toBe(false)
    const s = toSharedBriefing(shb())
    expect(Object.keys(s)).not.toContain("authorized_by")
  })

  it("sem `authorization_ref` não valida", () => {
    const semRef = shb()
    delete (semRef)["authorization_ref"]
    expect(ok("shared-briefing", semRef)).toBe(false)
  })

  it("nenhum booleano de aprovação foi introduzido no lugar", () => {
    for (const campo of ["is_authorized", "approved", "stefano_approved", "authorized"]) {
      expect(ok("shared-briefing", { ...shb(), [campo]: true }), campo).toBe(false)
    }
  })

  it("cadeia válida com APPROVED terminal → autorizado", () => {
    const r = authorizeSharedBriefing(toSharedBriefing(shb()), pedidoDeShare(), [
      dec("dec_1", "APPROVED"),
    ])
    expect(r).toEqual({ status: "authorized", decision_id: "dec_1" })
  })

  it("aprovação SUPERSEDIDA deixa de autorizar — liga HIGH #1 e #2", () => {
    // O briefing continua apontando dec_1 e não muda. A autoridade dele muda, porque
    // autoridade é da cadeia, não do objeto.
    const chain = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    const r = authorizeSharedBriefing(toSharedBriefing(shb()), pedidoDeShare(), chain)
    expect(r).toEqual({ status: "not_authorized", defect: "SUPERSEDED_DECISION" })
  })

  it("referência inexistente, rejeitada e sem decisão", () => {
    const b = toSharedBriefing(shb())
    expect(authorizeSharedBriefing(b, pedidoDeShare(), [])).toEqual({
      status: "not_authorized", defect: "AUTHORIZATION_REF_NOT_FOUND",
    })
    expect(authorizeSharedBriefing(b, pedidoDeShare(), [dec("dec_1", "REJECTED")])).toEqual({
      status: "not_authorized", defect: "DECISION_DOES_NOT_AUTHORIZE",
    })
  })

  it("'Stefano aprovou alguma coisa em algum lugar' NÃO autoriza", () => {
    // Pedido sobre outro assunto, ou sobre outro briefing.
    const b = toSharedBriefing(shb())
    expect(
      authorizeSharedBriefing(b, pedidoDeShare({ subject_type: "CONTENT_MISSION" }), [
        dec("dec_1", "APPROVED"),
      ]),
    ).toEqual({ status: "not_authorized", defect: "APPROVAL_SUBJECT_MISMATCH" })
    expect(
      authorizeSharedBriefing(b, pedidoDeShare({ subject_ref: "shb_outro" }), [
        dec("dec_1", "APPROVED"),
      ]),
    ).toEqual({ status: "not_authorized", defect: "APPROVAL_SUBJECT_MISMATCH" })
  })

  it("decisão de outro pedido de aprovação não autoriza", () => {
    const r = authorizeSharedBriefing(toSharedBriefing(shb()), pedidoDeShare(), [
      dec("dec_1", "APPROVED", undefined, "apr_outro"),
    ])
    expect(r).toEqual({ status: "not_authorized", defect: "DECISION_FOR_DIFFERENT_APPROVAL" })
  })

  it("cadeia malformada não autoriza", () => {
    const r = authorizeSharedBriefing(toSharedBriefing(shb()), pedidoDeShare(), [
      dec("dec_1", "APPROVED"),
      dec("dec_9", "APPROVED"),
    ])
    expect(r).toEqual({ status: "not_authorized", defect: "MALFORMED_DECISION_CHAIN" })
  })

  it("nenhuma razão de recusa carrega conteúdo de objeto ou PII", () => {
    const razoes = [
      authorizeSharedBriefing(toSharedBriefing(shb()), pedidoDeShare(), []),
      authorizeSharedBriefing(toSharedBriefing(shb()), pedidoDeShare(), [dec("dec_1", "REJECTED")]),
    ]
    for (const r of razoes) {
      const s = JSON.stringify(r)
      expect(s).not.toContain("untrusted")
      expect(s).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
      expect(s.length).toBeLessThan(120)
    }
  })

  it("a projeção positiva continua intacta", () => {
    // A remediação não pode afrouxar o que já valia.
    expect(ok("shared-briefing", { ...shb(), hidden_sections: ["x"] })).toBe(false)
    expect(ok("shared-briefing", { ...shb(), executive_briefing: briefing() })).toBe(false)
    for (const a of ["ALL", "EVERYONE", "PUBLIC"]) {
      expect(ok("shared-briefing", shb({ audience: a })), a).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remediação — HIGH #3: indisponível não carrega métrica NENHUMA
// ═══════════════════════════════════════════════════════════════════════════════

describe("HIGH #3 — nenhuma métrica comercial em estado indisponível", () => {
  const METRICAS = [
    "commercial_potential",
    "commercially_confirmed",
    "emitted",
    "historical_realized",
  ] as const
  const INDISPONIVEIS = ["data_not_available", "source_error", "invalid_source"] as const

  for (const st of INDISPONIVEIS) {
    for (const m of METRICAS) {
      it(`${st} + ${m}=0 é INVÁLIDO`, () => {
        expect(
          ok("executive-briefing", briefing({ commercial_state: { view_state: st, [m]: 0 } })),
        ).toBe(false)
      })
    }
    it(`${st} sem métrica é válido`, () => {
      expect(ok("executive-briefing", briefing({ commercial_state: { view_state: st } }))).toBe(true)
    })
  }

  it("`historical_realized` era o esquecido — o gate estava certo", () => {
    // A versão anterior enumerava três proibições e deixava esta passar.
    expect(
      ok(
        "executive-briefing",
        briefing({ commercial_state: { view_state: "data_not_available", historical_realized: 0 } }),
      ),
    ).toBe(false)
  })

  it("a proibição é por ALLOWLIST — métrica futura nasce proibida", () => {
    // Não é lista de proibições que alguém precisa lembrar de atualizar: o ramo
    // declara o permitido e fecha o resto.
    expect(
      ok(
        "executive-briefing",
        briefing({ commercial_state: { view_state: "source_error", metrica_futura_qualquer: 0 } }),
      ),
    ).toBe(false)
  })

  it("`fully_completed` continua declarável — não tem número", () => {
    expect(
      ok(
        "executive-briefing",
        briefing({
          commercial_state: {
            view_state: "data_not_available",
            fully_completed: { status: "DEFERRED_REQUIRES_OMIE_PAYMENT" },
          },
        }),
      ),
    ).toBe(true)
  })

  it("available_empty com zero continua VÁLIDO — a distinção não colapsou", () => {
    // "Sabemos que é zero" segue representável. A regra é sobre desconhecido.
    expect(
      ok(
        "executive-briefing",
        briefing({
          commercial_state: {
            view_state: "available_empty",
            commercial_potential: 0,
            commercially_confirmed: 0,
            emitted: 0,
            historical_realized: 0,
          },
        }),
      ),
    ).toBe(true)
  })

  it("available com zero legítimo continua válido", () => {
    expect(
      ok("executive-briefing", briefing({ commercial_state: { view_state: "available", emitted: 0 } })),
    ).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remediação — replay de autoridade: a aprovação é vinculada ao CONTEÚDO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Briefing + pedido derivado DELE. É assim que a coordenação deixa de ser manual.
 *
 * O pedido nasce `DECIDED` e apontando o `authorization_ref` do briefing: sem isso a
 * autorização recusa por ciclo de vida, e o teste de vínculo de conteúdo passaria a
 * medir a coisa errada.
 */
const projecaoAprovada = (over: Record<string, unknown> = {}) => {
  const b = toSharedBriefing(shb(over))
  const req = toApprovalRequest({
    ...pedido(),
    ...sharedBriefingApprovalSubject(b),
    status: "DECIDED",
    decision_ref: b.authorization_ref,
  })
  return { b, req, decisao: dec("dec_1", "APPROVED") }
}

describe("replay — a id sozinha NÃO é autorização", () => {
  it("conteúdo idêntico ao aprovado → autorizado", () => {
    const { b, req, decisao: d } = projecaoAprovada()
    expect(authorizeSharedBriefing(b, req, [d])).toEqual({
      status: "authorized",
      decision_id: "dec_1",
    })
  })

  it("MESMA id, audiência diferente → NÃO autorizado", () => {
    // O achado do gate. Aprovar divulgação para Lucas não autoriza a mesma id
    // redirecionada para Leonardo: é outra divulgação.
    const { req, decisao: d } = projecaoAprovada({ audience: "COMMERCIAL_LUCAS" })
    const outra = toSharedBriefing(shb({ audience: "FINANCE_LEONARDO" }))
    expect(outra.shared_briefing_id).toBe("shb_1")
    expect(authorizeSharedBriefing(outra, req, [d])).toEqual({
      status: "not_authorized",
      defect: "CONTENT_HASH_MISMATCH",
    })
  })

  const DIMENSOES: readonly [string, Record<string, unknown>][] = [
    ["permitted_insights", { permitted_insights: ["ins_outro"] }],
    ["permitted_evidence_refs", { permitted_evidence_refs: ["ev_outro"] }],
    ["generated_from", { generated_from: "brf_outro" }],
    ["contextual_cross_domain_insights", { contextual_cross_domain_insights: ["ins_x"] }],
    ["audience", { audience: "EXECUTIVE_STEFANO" }],
  ]

  for (const [nome, mudanca] of DIMENSOES) {
    it(`MESMA id, ${nome} diferente → NÃO autorizado`, () => {
      const { req, decisao: d } = projecaoAprovada()
      const alterada = toSharedBriefing(shb(mudanca))
      expect(authorizeSharedBriefing(alterada, req, [d])).toEqual({
        status: "not_authorized",
        defect: "CONTENT_HASH_MISMATCH",
      })
    })
  }

  it("v1 aprovada não herda autoridade para v2 — exige nova aprovação", () => {
    const v1 = projecaoAprovada({ permitted_insights: ["ins_1"] })
    // `authorization_ref` aponta a decisão de v2 — e fica FORA do hash, então trocá-lo
    // não altera a identidade de conteúdo. É a diferença em `permitted_insights` que
    // separa v1 de v2.
    const v2 = toSharedBriefing(
      shb({ permitted_insights: ["ins_1", "ins_2"], authorization_ref: "dec_v2" }),
    )
    // Reusar a decisão de v1: recusado.
    expect(authorizeSharedBriefing(v2, v1.req, [v1.decisao]).status).toBe("not_authorized")
    // Com pedido e decisão PRÓPRIOS de v2: autorizado.
    const reqV2 = toApprovalRequest({
      ...pedido({ approval_id: "apr_v2" }),
      ...sharedBriefingApprovalSubject(v2),
      status: "DECIDED",
      decision_ref: "dec_v2",
    })
    expect(
      authorizeSharedBriefing(v2, reqV2, [dec("dec_v2", "APPROVED", undefined, "apr_v2")]),
    ).toEqual({ status: "authorized", decision_id: "dec_v2" })
  })

  it("pedido de divulgação SEM vínculo de conteúdo não valida no schema", () => {
    const semVinculo = pedido({ subject_type: "SHARED_BRIEFING", subject_ref: "shb_1" })
    expect(ok("approval-request", semVinculo)).toBe(false)
    // Outros assuntos preservam a semântica: não inventamos exigência nova.
    expect(ok("approval-request", pedido({ subject_type: "CONTENT_MISSION" }))).toBe(true)
  })

  it("APPROVED_WITH_CHANGES também é vinculado ao conteúdo", () => {
    // "Aprovado com mudanças" não significa "qualquer payload futuro com esta id".
    const { b, req } = projecaoAprovada()
    const comMudancas = dec("dec_1", "APPROVED_WITH_CHANGES")
    expect(authorizeSharedBriefing(b, req, [comMudancas]).status).toBe("authorized")
    const outra = toSharedBriefing(shb({ audience: "FINANCE_LEONARDO" }))
    expect(authorizeSharedBriefing(outra, req, [comMudancas])).toEqual({
      status: "not_authorized",
      defect: "CONTENT_HASH_MISMATCH",
    })
  })

  it("supersessão continua valendo mesmo com conteúdo idêntico", () => {
    // Vínculo de conteúdo NÃO substitui resolução de cadeia.
    const { b, req } = projecaoAprovada()
    const chain = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "SUPERSEDED_DECISION",
    })
  })
})

describe("o hash de conteúdo é determinístico e cobre o que importa", () => {
  it("versão dedicada, não a do Lucas", () => {
    expect(SHARED_BRIEFING_CONTENT_HASH_VERSION).toBe("1.0.0")
  })

  it("objetos construídos independentemente com o mesmo conteúdo → mesmo hash", () => {
    const a = toSharedBriefing(shb())
    const b = toSharedBriefing(shb())
    expect(sharedBriefingContentHash(a)).toBe(sharedBriefingContentHash(b))
    expect(sharedBriefingContentHash(a)).toMatch(/^[a-f0-9]{64}$/u)
  })

  it("ordem de inserção das chaves NÃO altera o hash", () => {
    // Material montado em ordem fixa de campos, nunca por iteração de chaves.
    const normal = toSharedBriefing(shb())
    const invertido = toSharedBriefing({
      authorization_ref: "dec_1",
      permitted_evidence_refs: ["ev_1"],
      permitted_insights: ["ins_1"],
      audience: "COMMERCIAL_LUCAS",
      generated_at: TS,
      generated_from: "brf_1",
      schema_version: V,
      shared_briefing_id: "shb_1",
    })
    expect(sharedBriefingContentHash(normal)).toBe(sharedBriefingContentHash(invertido))
  })

  it("allowlist é CONJUNTO: ordem e duplicata não mudam a divulgação", () => {
    const base = toSharedBriefing(shb({ permitted_insights: ["ins_a", "ins_b"] }))
    const trocado = toSharedBriefing(shb({ permitted_insights: ["ins_b", "ins_a"] }))
    const duplicado = toSharedBriefing(shb({ permitted_insights: ["ins_a", "ins_b", "ins_a"] }))
    expect(sharedBriefingContentHash(trocado)).toBe(sharedBriefingContentHash(base))
    expect(sharedBriefingContentHash(duplicado)).toBe(sharedBriefingContentHash(base))
    // Mas conteúdo DIFERENTE muda.
    const outro = toSharedBriefing(shb({ permitted_insights: ["ins_a"] }))
    expect(sharedBriefingContentHash(outro)).not.toBe(sharedBriefingContentHash(base))
  })

  it("generated_at NÃO entra: regerar a mesma divulgação não exige nova aprovação", () => {
    const antes = toSharedBriefing(shb({ generated_at: "2026-08-26T12:00:00.000Z" }))
    const depois = toSharedBriefing(shb({ generated_at: "2026-09-01T08:30:00.000Z" }))
    expect(sharedBriefingContentHash(depois)).toBe(sharedBriefingContentHash(antes))
  })

  it("cada dimensão material muda o hash", () => {
    const base = sharedBriefingContentHash(toSharedBriefing(shb()))
    for (const [nome, mudanca] of [
      ["audience", { audience: "FINANCE_LEONARDO" }],
      ["generated_from", { generated_from: "brf_outro" }],
      ["shared_briefing_id", { shared_briefing_id: "shb_outro" }],
      ["permitted_insights", { permitted_insights: ["ins_z"] }],
      ["permitted_evidence_refs", { permitted_evidence_refs: ["ev_z"] }],
      ["contextual_cross_domain_insights", { contextual_cross_domain_insights: ["ins_c"] }],
    ] as const) {
      expect(sharedBriefingContentHash(toSharedBriefing(shb(mudanca))), nome).not.toBe(base)
    }
  })

  it("o hash não é armazenado no objeto — não há o que falsificar", () => {
    // Um hash guardado poderia discordar do próprio payload. Derivado sob demanda,
    // ele é sempre do conteúdo que está ali.
    const b = toSharedBriefing(shb())
    expect(Object.keys(b)).not.toContain("content_hash")
    // E declarar um no payload é recusado por `additionalProperties: false`.
    expect(ok("shared-briefing", { ...shb(), content_hash: "a".repeat(64) })).toBe(false)
  })

  it("mutação pós-construção não altera o conteúdo nem o hash", () => {
    const b = toSharedBriefing(shb())
    const antes = sharedBriefingContentHash(b)
    expect(() => {
      ;(b as { audience: string }).audience = "FINANCE_LEONARDO"
    }).toThrow()
    expect(() => {
      ;(b.permitted_insights as string[]).push("ins_intruso")
    }).toThrow()
    expect(sharedBriefingContentHash(b)).toBe(antes)
  })

  it("`sharedBriefingApprovalSubject` deriva os dois campos do objeto real", () => {
    const b = toSharedBriefing(shb())
    const subj = sharedBriefingApprovalSubject(b)
    expect(subj.subject_type).toBe("SHARED_BRIEFING")
    expect(subj.subject_ref).toBe(b.shared_briefing_id)
    expect(subj.subject_content_hash).toBe(sharedBriefingContentHash(b))
    expect(Object.isFrozen(subj)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remediação — a fronteira de autoridade é fronteira de VALIDAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
//
// O gate encontrou que `authorizeSharedBriefing` confiava no tipo TypeScript. Tipo
// desaparece na compilação: um `as`, um `JSON.parse` ou um chamador em JavaScript
// entregam qualquer objeto. Estes testes chamam a fronteira DIRETAMENTE com payload
// cru — é o único jeito de provar que ela pergunta em vez de confiar.

describe("fronteira de autoridade — payload não-canônico falha FECHADO", () => {
  /** Briefing canônico aprovado, e a cadeia que o autoriza. */
  const canonicoAprovado = () => {
    const b = toSharedBriefing(shb())
    const subject = sharedBriefingApprovalSubject(b)
    const req = toApprovalRequest(
      pedido({ ...subject, status: "DECIDED", decision_ref: b.authorization_ref }),
    )
    const chain = [dec("dec_1", "APPROVED")]
    return { b, req, chain }
  }

  it("o fluxo canônico continua autorizado — a base da comparação", () => {
    const { b, req, chain } = canonicoAprovado()
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "authorized",
      decision_id: "dec_1",
    })
  })

  it("§4 — campo EXTRA de divulgação no topo é recusado, com o hash aprovado", () => {
    // O achado exato. Todos os campos canônicos idênticos ao aprovado, então o
    // material do hash é o MESMO — e o objeto carrega conteúdo a mais por fora.
    const { b, req, chain } = canonicoAprovado()
    const vazando = { ...b, leaked_finance_details: "inadimplência por unidade" }
    // O hash do material canônico realmente coincide: é o que tornava o ataque viável.
    expect(sharedBriefingContentHash(shb())).toBe(req.subject_content_hash)
    // E ainda assim a autorização recusa, porque o OBJETO não é canônico.
    expect(authorizeSharedBriefing(vazando, req, chain)).toEqual({
      status: "not_authorized",
      defect: "INVALID_SHARED_BRIEFING",
    })
  })

  it("§11 — o campo extra NÃO é descartado para depois validar", () => {
    // Se a fronteira "limpasse" o objeto antes de validar, o ataque passaria e a
    // proteção de `additionalProperties: false` seria formalidade.
    const { req, chain } = canonicoAprovado()
    const r = authorizeSharedBriefing({ ...shb(), extra: 1 }, req, chain)
    expect(r.status).toBe("not_authorized")
    if (r.status === "not_authorized") expect(r.defect).toBe("INVALID_SHARED_BRIEFING")
  })

  it("§5 — campo extra em objeto ANINHADO também é recusado", () => {
    // Não basta olhar o topo: o schema fecha os aninhados também.
    const { chain } = canonicoAprovado()
    const reqAninhado = {
      ...pedido(),
      ...sharedBriefingApprovalSubject(toSharedBriefing(shb())),
      rationale: { untrusted: true, content: "porque X", vazamento: "cpf" },
    }
    expect(authorizeSharedBriefing(shb(), reqAninhado, chain)).toEqual({
      status: "not_authorized",
      defect: "INVALID_APPROVAL_REQUEST",
    })
  })

  it("§6 — campo extra no PEDIDO é recusado", () => {
    const { b, chain } = canonicoAprovado()
    const req = {
      ...pedido({ ...sharedBriefingApprovalSubject(b) }),
      auto_approve: true,
    }
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "INVALID_APPROVAL_REQUEST",
    })
  })

  it("§7 — campo extra na DECISÃO é recusado", () => {
    const { b, req } = canonicoAprovado()
    const chain = [{ ...decisao(), stefano_approved: true }]
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "INVALID_DECISION_RECORD",
    })
  })

  it("§8 — enum e const inválidos não passam por cast", () => {
    const { b, req, chain } = canonicoAprovado()
    // Audiência desconhecida no briefing.
    expect(
      authorizeSharedBriefing({ ...shb(), audience: "EVERYONE" }, req, chain).status,
    ).toBe("not_authorized")
    // Aprovador que não é Stefano no pedido.
    expect(
      authorizeSharedBriefing(b, { ...(req as object), approver: "HERMES" }, chain).status,
    ).toBe("not_authorized")
    // Decisor que não é Stefano na decisão.
    expect(
      authorizeSharedBriefing(b, req, [{ ...decisao(), decided_by: "HERMES" }]).status,
    ).toBe("not_authorized")
  })

  it("§17 — `as SharedBriefingV1` NÃO contorna a validação", () => {
    // A prova de que TypeScript não está sendo tratado como segurança.
    const { req, chain } = canonicoAprovado()
    const forjado = { ...shb(), write_access: true } as unknown as SharedBriefingV1
    expect(authorizeSharedBriefing(forjado, req, chain).status).toBe("not_authorized")
  })

  it("§9 — authorization_ref de forma inválida falha antes da resolução", () => {
    const { req, chain } = canonicoAprovado()
    expect(
      authorizeSharedBriefing({ ...shb(), authorization_ref: "!!!" }, req, chain),
    ).toEqual({ status: "not_authorized", defect: "INVALID_SHARED_BRIEFING" })
  })

  it("decisões que não são lista, ou lista com entrada não-objeto", () => {
    const { b, req } = canonicoAprovado()
    for (const ruim of [null, undefined, "dec_1", 42, {}]) {
      // `String({})` daria "[object Object]" para toda entrada de objeto — um rótulo
      // que não distingue os casos quando um deles falha. `JSON.stringify` mostra qual.
      expect(authorizeSharedBriefing(b, req, ruim), JSON.stringify(ruim)).toEqual({
        status: "not_authorized",
        defect: "INVALID_DECISION_RECORD",
      })
    }
    expect(authorizeSharedBriefing(b, req, [null])).toEqual({
      status: "not_authorized",
      defect: "INVALID_DECISION_RECORD",
    })
  })

  it("§13 — uma decisão inválida invalida o conjunto, não é descartada", () => {
    // Descartar a inválida e seguir seria pior: a descartada pode ser a que revoga.
    const { b, req } = canonicoAprovado()
    const chain = [decisao(), { ...decisao({ decision_id: "dec_2" }), lixo: 1 }]
    expect(authorizeSharedBriefing(b, req, chain).status).toBe("not_authorized")
  })

  it("§21 — o vínculo de conteúdo continua valendo sobre entrada canônica", () => {
    // Sem regressão: mesmo ID, audiência diferente, objeto perfeitamente canônico.
    const { req, chain } = canonicoAprovado()
    const outraAudiencia = toSharedBriefing(shb({ audience: "FINANCE_LEONARDO" }))
    expect(authorizeSharedBriefing(outraAudiencia, req, chain)).toEqual({
      status: "not_authorized",
      defect: "CONTENT_HASH_MISMATCH",
    })
  })

  it("§21 — a cadeia de decisão continua valendo: revogação revoga", () => {
    const { b, req } = canonicoAprovado()
    const chain = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "SUPERSEDED_DECISION",
    })
  })

  it("§15 — razões de recusa não vazam o objeto nem PII", () => {
    const { req, chain } = canonicoAprovado()
    const r = authorizeSharedBriefing(
      { ...shb(), aluno: "TATIANE", cpf: "087.731.554-03" },
      req,
      chain,
    )
    const s = JSON.stringify(r)
    expect(s).not.toContain("TATIANE")
    expect(s).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
    expect(s).not.toContain("untrusted")
    expect(s.length).toBeLessThan(120)
  })

  it("isApprovedByStefano também valida a entrada", () => {
    // A mesma classe de furo com outro nome seria a mesma falha.
    expect(isApprovedByStefano({ ...pedido(), auto_approve: true }, [decisao()])).toBe(false)
    expect(isApprovedByStefano(pedido(), [{ ...decisao(), lixo: 1 }])).toBe(false)
    expect(isApprovedByStefano(pedido(), "não é lista")).toBe(false)
    // E o caminho canônico continua respondendo.
    expect(isApprovedByStefano(pedido(), [decisao()])).toBe(true)
  })

  it("resolveEffectiveDecision recusa entrada não-canônica", () => {
    const r = resolveEffectiveDecision("apr_1", [{ ...decisao(), lixo: 1 }])
    expect(r).toEqual({ status: "malformed_chain", defect: "INVALID_DECISION_RECORD" })
    expect(resolveEffectiveDecision("apr_1", "x")).toEqual({
      status: "malformed_chain",
      defect: "INVALID_DECISION_RECORD",
    })
  })

  it("§10 — o hash nunca é calculado sobre objeto não validado", () => {
    // Chamada direta com campo extra: lança em vez de devolver um hash que afirma
    // cobrir um conteúdo que não cobre.
    expect(() => sharedBriefingContentHash({ ...shb(), extra: 1 })).toThrow()
    expect(() => sharedBriefingApprovalSubject({ ...shb(), extra: 1 })).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remediação — o CICLO DE VIDA do pedido faz parte da autoridade
// ═══════════════════════════════════════════════════════════════════════════════
//
// O gate encontrou que a autoridade era montada a partir do DecisionRecord e do
// `approval_id`, sem nunca perguntar em que estado o pedido está. Um pedido RETIRADO,
// ou um que ainda AGUARDA Stefano, autorizava divulgação desde que alguém fornecesse
// um `APPROVED` de mesmo `approval_id`.
//
// Retirada que não retira é pior que não existir: quem a usou acredita ter fechado a
// porta.

describe("ciclo de vida do pedido — os três objetos têm de concordar", () => {
  /** Briefing canônico, pedido derivado dele, decisão APPROVED efetiva. */
  const cenario = (reqOver: Record<string, unknown> = {}) => {
    const b = toSharedBriefing(shb())
    const req = {
      ...pedido(),
      ...sharedBriefingApprovalSubject(b),
      status: "DECIDED",
      decision_ref: "dec_1",
      ...reqOver,
    }
    return { b, req, chain: [dec("dec_1", "APPROVED")] }
  }

  it("§22 — DECIDED apontando a decisão efetiva APPROVED → autorizado", () => {
    // A linha de base: sem ela, os negativos abaixo poderiam passar por outro motivo.
    const { b, req, chain } = cenario()
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "authorized",
      decision_id: "dec_1",
    })
  })

  it("§20 — pedido RETIRADO não autoriza, mesmo com APPROVED em mãos", () => {
    // O achado, metade um. `WITHDRAWN` pode reter `decision_ref` pelo schema atual —
    // e ainda assim nunca autoriza.
    const { b, req, chain } = cenario({ status: "WITHDRAWN" })
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "REQUEST_WITHDRAWN",
    })
  })

  it("§21 — pedido AGUARDANDO não autoriza, mesmo com APPROVED em mãos", () => {
    // A outra metade. `AWAITING` não pode carregar `decision_ref` (o schema proíbe),
    // então o pedido nem tem como apontar a decisão — e o estado já basta para recusar.
    const { b, chain } = cenario()
    const aguardando = {
      ...pedido(),
      ...sharedBriefingApprovalSubject(toSharedBriefing(shb())),
      status: "AWAITING_STEFANO_APPROVAL",
    }
    expect(authorizeSharedBriefing(b, aguardando, chain)).toEqual({
      status: "not_authorized",
      defect: "REQUEST_NOT_DECIDED",
    })
  })

  it("§3 — 'existe APPROVED, logo o pedido está decidido' é inferência proibida", () => {
    // A decisão NÃO ativa o pedido. Quem afirma o vínculo é o estado canônico dele.
    const { b, chain } = cenario()
    for (const st of ["AWAITING_STEFANO_APPROVAL", "WITHDRAWN"]) {
      const r = authorizeSharedBriefing(
        b,
        {
          ...pedido(),
          ...sharedBriefingApprovalSubject(toSharedBriefing(shb())),
          status: st,
          ...(st === "WITHDRAWN" ? { decision_ref: "dec_1" } : {}),
        },
        chain,
      )
      expect(r.status, st).toBe("not_authorized")
    }
  })

  it("§23 — pedido e briefing apontando decisões DIFERENTES não autoriza", () => {
    // Mesmo `approval_id` nas duas; casar só por ele deixaria o código escolher a que
    // aprova entre as duas.
    const { b } = cenario()
    const req = {
      ...pedido(),
      ...sharedBriefingApprovalSubject(b),
      status: "DECIDED",
      decision_ref: "dec_2",
    }
    const chain = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "DECISION_REF_MISMATCH",
    })
  })

  it("§24 — pedido apontando decisão SUPERSEDIDA não autoriza", () => {
    // Pedido e briefing concordam em `dec_1`, mas `dec_1` foi revogada.
    const { b, req } = cenario()
    const chain = [dec("dec_1", "APPROVED"), dec("dec_2", "REJECTED", "dec_1")]
    expect(authorizeSharedBriefing(b, req, chain)).toEqual({
      status: "not_authorized",
      defect: "SUPERSEDED_DECISION",
    })
  })

  it("§25 — DECIDED apontando decisão efetiva REJECTED não autoriza", () => {
    const { b, req } = cenario()
    expect(authorizeSharedBriefing(b, req, [dec("dec_1", "REJECTED")])).toEqual({
      status: "not_authorized",
      defect: "DECISION_DOES_NOT_AUTHORIZE",
    })
  })

  it("§16 — DECIDED apontando decisão AUSENTE não cai para outra do mesmo pedido", () => {
    // Existe uma decisão APPROVED do mesmo `approval_id`, mas NÃO é a apontada.
    const { b } = cenario()
    const req = {
      ...pedido(),
      ...sharedBriefingApprovalSubject(b),
      status: "DECIDED",
      decision_ref: b.authorization_ref,
    }
    // A cadeia tem `dec_9` APPROVED — mesmo pedido, id diferente da apontada.
    const r = authorizeSharedBriefing(b, req, [dec("dec_9", "APPROVED")])
    expect(r).toEqual({ status: "not_authorized", defect: "AUTHORIZATION_REF_NOT_FOUND" })
  })

  it("§26 — status desconhecido é recusado na validação de schema", () => {
    const { b, chain } = cenario()
    const r = authorizeSharedBriefing(
      b,
      { ...pedido(), ...sharedBriefingApprovalSubject(b), status: "AUTO_APPROVED" },
      chain,
    )
    expect(r).toEqual({ status: "not_authorized", defect: "INVALID_APPROVAL_REQUEST" })
  })

  it("§27 — o schema já garante os invariantes de estado; não os enfraqueci", () => {
    // `DECIDED` exige `decision_ref`; `AWAITING` não pode carregá-lo.
    const base = { ...pedido(), ...sharedBriefingApprovalSubject(toSharedBriefing(shb())) }
    expect(ok("approval-request", { ...base, status: "DECIDED" })).toBe(false)
    expect(ok("approval-request", { ...base, status: "DECIDED", decision_ref: "dec_1" })).toBe(true)
    expect(
      ok("approval-request", {
        ...base,
        status: "AWAITING_STEFANO_APPROVAL",
        decision_ref: "dec_1",
      }),
    ).toBe(false)
  })

  it("§34 — nenhum booleano de atalho apareceu no pedido", () => {
    const base = { ...pedido(), ...sharedBriefingApprovalSubject(toSharedBriefing(shb())) }
    for (const campo of ["is_approved", "authorized", "human_approved", "auto_approve"]) {
      expect(ok("approval-request", { ...base, [campo]: true }), campo).toBe(false)
    }
  })

  it("§35 — razões de recusa de ciclo de vida não vazam objeto nem PII", () => {
    const { b, chain } = cenario()
    const r = authorizeSharedBriefing(
      b,
      { ...pedido(), ...sharedBriefingApprovalSubject(b), status: "WITHDRAWN" },
      chain,
    )
    const s = JSON.stringify(r)
    expect(s).not.toContain("untrusted")
    expect(s).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
    expect(s.length).toBeLessThan(80)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MICRO-REMEDIAÇÃO — a AUTORIZAÇÃO é leitura, e leitura não muta o chamador
//
// `Object.freeze` é mutação: não altera valor, altera `writable`, `extensible` e
// `frozen`, e isso é observável de fora. A fronteira de autoridade entregava o objeto
// do chamador às factories canônicas, que fazem `deepFreeze` no que recebem — então
// PERGUNTAR se algo está autorizado congelava o grafo de quem perguntou.
//
// A regra já estava escrita em `immutability.ts` desde a Fase 1: ownership antes de
// congelar. A fronteira passava por cima dela.
//
// Estes testes medem METADADOS de ownership, não valores: um objeto congelado continua
// deepEqual a si mesmo, então comparar valores nunca detectaria a mutação.
// ═══════════════════════════════════════════════════════════════════════════════

/** Estado de ownership de um grafo, para comparação antes/depois. */
const ownership = (raiz: unknown): readonly string[] => {
  const linhas: string[] = []
  const visita = (v: unknown, caminho: string): void => {
    if (v === null || typeof v !== "object") return
    linhas.push(
      `${caminho}: frozen=${String(Object.isFrozen(v))} sealed=${String(
        Object.isSealed(v),
      )} extensible=${String(Object.isExtensible(v))}`,
    )
    for (const [k, filho] of Object.entries(v as Record<string, unknown>)) {
      visita(filho, `${caminho}.${k}`)
    }
  }
  visita(raiz, "$")
  return linhas
}

describe("ownership do chamador na fronteira de autoridade", () => {
  /** Pedido e decisão como DADO MUTÁVEL do chamador, não como objeto já canônico. */
  const pedidoCru = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(pedidoDeShare())) as Record<string, unknown>
  const decisaoCrua = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(dec("dec_1", "APPROVED"))) as Record<string, unknown>

  it("authorizeSharedBriefing não congela briefing, pedido nem decisões", () => {
    const briefing = shb()
    const req = pedidoCru()
    const decisoes = [decisaoCrua()]

    const antes = [...ownership(briefing), ...ownership(req), ...ownership(decisoes)]
    // A fixture precisa começar mutável — teste sobre grafo já congelado passaria sem
    // provar nada.
    expect(antes.every((l) => l.includes("frozen=false"))).toBe(true)

    const r = authorizeSharedBriefing(briefing, req, decisoes)
    expect(r.status).toBe("authorized")

    // Nenhum metadado de ownership mudou.
    expect([...ownership(briefing), ...ownership(req), ...ownership(decisoes)]).toEqual(antes)
  })

  it("o chamador continua podendo mutar o que é dele, e o veredito não muda", () => {
    const briefing = shb()
    const req = pedidoCru()
    const decisoes = [decisaoCrua()]
    const r = authorizeSharedBriefing(briefing, req, decisoes)
    expect(r.status).toBe("authorized")

    // Mutação real, não tentativa: raiz, aninhado e array.
    expect(Object.isFrozen(briefing)).toBe(false)
    briefing["audience"] = "FINANCE_LEONARDO"
    ;(briefing["permitted_insights"] as string[]).push("ins_injetado")
    decisoes[0]!["decision"] = "REJECTED"
    decisoes.push(decisaoCrua())
    req["status"] = "WITHDRAWN"

    // O resultado JÁ produzido não se move: ele foi calculado sobre grafo próprio.
    expect(r.status).toBe("authorized")
    // E a mesma pergunta com os objetos agora alterados dá a resposta das alterações —
    // que é o comportamento correto, não um alias.
    const depois = authorizeSharedBriefing(briefing, req, decisoes)
    expect(depois.status).toBe("not_authorized")
  })

  it("o array de decisões não é ordenado, congelado nem deduplicado no lugar", () => {
    const decisoes = [
      JSON.parse(JSON.stringify(dec("dec_2", "REJECTED", "dec_1"))) as Record<string, unknown>,
      decisaoCrua(),
    ]
    const ordemAntes = decisoes.map((d) => d["decision_id"])
    resolveEffectiveDecision("apr_1", decisoes)
    expect(decisoes.map((d) => d["decision_id"])).toEqual(ordemAntes)
    expect(Object.isFrozen(decisoes)).toBe(false)
    expect(decisoes.length).toBe(2)
  })

  it("resolveEffectiveDecision e isApprovedByStefano também não congelam", () => {
    const decisoes = [decisaoCrua()]
    const req = pedidoCru()
    const antes = [...ownership(decisoes), ...ownership(req)]
    resolveEffectiveDecision("apr_1", decisoes)
    isApprovedByStefano(req, decisoes)
    expect([...ownership(decisoes), ...ownership(req)]).toEqual(antes)
  })

  it("sharedBriefingContentHash e ApprovalSubject não congelam — e o hash não muda", () => {
    const briefing = shb()
    const antes = ownership(briefing)
    const h = sharedBriefingContentHash(briefing)
    sharedBriefingApprovalSubject(briefing)
    expect(ownership(briefing)).toEqual(antes)
    expect(Object.isFrozen(briefing)).toBe(false)

    // §6 — ownership NÃO é conteúdo: mutável e congelado dão o mesmo hash.
    const congelado = JSON.parse(JSON.stringify(shb())) as Record<string, unknown>
    const congela = (v: unknown): void => {
      if (v === null || typeof v !== "object") return
      Object.freeze(v)
      for (const f of Object.values(v as Record<string, unknown>)) congela(f)
    }
    congela(congelado)
    expect(Object.isFrozen(congelado)).toBe(true)
    expect(sharedBriefingContentHash(congelado)).toBe(h)
  })

  it("entrada INVÁLIDA também não é tocada antes de falhar", () => {
    const invalido = { ...shb(), campo_extra_de_divulgacao: "vazado" }
    const antes = ownership(invalido)
    const r = authorizeSharedBriefing(invalido, pedidoCru(), [decisaoCrua()])
    expect(r).toEqual({ status: "not_authorized", defect: "INVALID_SHARED_BRIEFING" })
    expect(ownership(invalido)).toEqual(antes)
    expect(Object.isFrozen(invalido)).toBe(false)
  })

  it("§13 — campo desconhecido continua RECUSADO, nunca removido em silêncio", () => {
    // A cópia própria não pode ter virado saneamento: se o campo extra desaparecesse
    // antes do schema, `additionalProperties: false` ficaria sem o que recusar.
    for (const extra of ["campo_extra", "authorized_by", "publication_authorized"]) {
      const r = authorizeSharedBriefing({ ...shb(), [extra]: true }, pedidoCru(), [decisaoCrua()])
      expect(r, extra).toEqual({ status: "not_authorized", defect: "INVALID_SHARED_BRIEFING" })
    }
  })

  it("§14 — acessor e Proxy na fronteira de autoridade falham FECHADOS", () => {
    // Mesma disciplina da Fase 3.0c: objeto externo não é dado estável.
    let leituras = 0
    const base = shb()
    delete base["audience"]
    const atacante = Object.defineProperty(base, "audience", {
      get() {
        leituras += 1
        return leituras === 1 ? "COMMERCIAL_LUCAS" : "FINANCE_LEONARDO"
      },
      enumerable: true,
      configurable: true,
    })
    expect(authorizeSharedBriefing(atacante, pedidoCru(), [decisaoCrua()])).toEqual({
      status: "not_authorized",
      defect: "INVALID_SHARED_BRIEFING",
    })
    expect(leituras).toBe(0)

    expect(authorizeSharedBriefing(new Proxy(shb(), {}), pedidoCru(), [decisaoCrua()])).toEqual({
      status: "not_authorized",
      defect: "INVALID_SHARED_BRIEFING",
    })
    // Coleção de decisões como Proxy: recusada antes de qualquer trap.
    let traps = 0
    const colecao = new Proxy([decisaoCrua()], {
      get(t, k) {
        traps += 1
        return (t as unknown as Record<string | symbol, unknown>)[k]
      },
      ownKeys(t) {
        traps += 1
        return Reflect.ownKeys(t)
      },
    })
    expect(authorizeSharedBriefing(shb(), pedidoCru(), colecao)).toEqual({
      status: "not_authorized",
      defect: "INVALID_DECISION_RECORD",
    })
    expect(traps).toBe(0)
  })

  it("§15 — a SAÍDA canônica continua profundamente imutável", () => {
    const assunto = sharedBriefingApprovalSubject(shb())
    expect(Object.isFrozen(assunto)).toBe(true)
    // E as factories que CONSTROEM seguem congelando o que possuem — não mudei isso.
    const canonico = toSharedBriefing(shb())
    expect(Object.isFrozen(canonico)).toBe(true)
  })
})
