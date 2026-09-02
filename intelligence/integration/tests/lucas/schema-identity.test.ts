/**
 * Mapeamento por cabeçalho, identidade, unidade, dinheiro e desconto.
 *
 * A prova mais valiosa aqui é a de drift: a MESMA linha lógica, montada nas posições
 * de julho e nas de agosto — que são diferentes — produz o MESMO contrato
 * normalizado. Um adaptador por posição falharia num dos dois, e falharia
 * silenciosamente, lendo CPF na coluna do nome.
 */

import { describe, expect, it } from "vitest"
import { buildHeaderMap, comparableHeader } from "../../src/lucas/header-mapping"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { FakeDrive, arquivo } from "./fake-drive"
import {
  HEADER_AGOSTO,
  HEADER_JULHO,
  cpfSintetico,
  linhaAgosto,
  linhaJulho,
} from "./fixtures"

const prov = (drive: FakeDrive): LucasMonthlyContractsProvider =>
  new LucasMonthlyContractsProvider({ drive, now: () => new Date("2026-08-19T18:00:00.000Z") })

const capturar = async (
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
  period = "2026-08",
): Promise<ReturnType<LucasMonthlyContractsProvider["load"]>> => {
  const nome = period === "2026-07" ? "Novos Alunos - Julho" : "Novos Alunos - Agosto"
  const drive = new FakeDrive({ files: [arquivo("f1", nome, "2026-08-19T13:39:00Z", { headers, rows })] })
  return prov(drive).load({ period })
}

// ═════════════════════════════════════════════════════════════════════════════
// §12/§38 — cabeçalho é a autoridade semântica
// ═════════════════════════════════════════════════════════════════════════════

describe("§12 — mapeamento por cabeçalho, nunca por posição", () => {
  it("os dois meses reais têm ordens DIFERENTES — a premissa do teste", () => {
    expect(HEADER_AGOSTO.indexOf("CPF")).toBe(3)
    expect(HEADER_JULHO.indexOf("CPF")).toBe(2)
    expect(HEADER_AGOSTO.indexOf("Unidade")).toBe(4)
    expect(HEADER_JULHO.indexOf("Unidade")).toBe(5)
  })

  it("a MESMA linha lógica em ordens diferentes produz o MESMO contrato", async () => {
    const cpf = cpfSintetico(7)
    const comum = { cpf, unidade: "Meriti", parcelas: 20, ticket: "R$ 8.151,60", status: "E" as const }

    const ago = await capturar(HEADER_AGOSTO, [linhaAgosto({ venc: "27/08/2026", ...comum })], "2026-08")
    const jul = await capturar(HEADER_JULHO, [linhaJulho({ venc: "27/08/2026", ...comum })], "2026-07")

    if (ago.status !== "available" || jul.status !== "available") throw new Error("estado errado")
    const a = ago.rows[0]
    const j = jul.rows[0]

    expect(a?.status).toBe("E")
    expect(j?.status).toBe("E")
    expect(a?.installment_count).toBe(20)
    expect(j?.installment_count).toBe(20)
    expect(a?.ticket_cents).toBe(815160)
    expect(j?.ticket_cents).toBe(815160)
    expect(a?.unit).toEqual(j?.unit)
    // A identidade difere porque o PERÍODO difere — e isso é o contrato aprovado,
    // não um efeito da ordem das colunas.
    expect(a?.identity.status).toBe("identified")
    expect(j?.identity.status).toBe("identified")
  })

  it("normalização de cabeçalho é fechada: caixa, acento e espaço", () => {
    expect(comparableHeader("Data Contratação")).toBe("data contratacao")
    expect(comparableHeader("  UNIDADE  ")).toBe("unidade")
    expect(comparableHeader("Valor  Repasse")).toBe("valor repasse")
    // `%` sobrevive: é o nome literal da coluna de desconto.
    expect(comparableHeader("%")).toBe("%")
  })

  it("§12 — sem fuzzy matching: `Parcela Cheia` não casa com `Parcelas`", () => {
    const m = buildHeaderMap(["Parcela Cheia", "CPF", "Unidade", "Status", "Ticket", "Venc"])
    // `Parcelas` fica ausente, e `Parcela Cheia` vira cabeçalho desconhecido.
    expect(m.required_missing).toContain("parcelas")
    expect(m.unknown_headers).toContain("Parcela Cheia")
    // Casar aproximado trocaria uma CONTAGEM por um VALOR EM REAIS.
    expect(m.index["parcelas"]).toBeUndefined()
  })
})

describe("§38 — classes de cabeçalho e drift", () => {
  it("cabeçalho obrigatório ausente → INVALID_SOURCE, falha fechada", async () => {
    const semStatus = HEADER_AGOSTO.filter((h) => h !== "Status")
    const r = await capturar(semStatus, [])
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("REQUIRED_HEADER_MISSING")
    expect(r.detail).toContain("status")
  })

  it("opcional ausente NÃO bloqueia — julho não tem `%` nem `Curso`", async () => {
    const r = await capturar(HEADER_JULHO, [
      linhaJulho({ venc: "PG", cpf: cpfSintetico(3), unidade: "Zona Norte", parcelas: 15, ticket: "R$ 6.385,50", status: "E" }),
    ], "2026-07")
    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.header_map.optional_missing).toContain("desconto_pct")
    expect(r.source_quality).toContain("OPTIONAL_HEADER_MISSING")
    // A linha ingeriu inteira, apesar da coluna ausente.
    expect(r.rows[0]?.ticket_cents).toBe(638550)
    expect(r.rows[0]?.discount.status).toBe("missing")
  })

  it("coluna EXTRA desconhecida não quebra, mas é reportada", async () => {
    const r = await capturar([...HEADER_AGOSTO, "Coluna Nova Do Lucas"], [
      [...linhaAgosto({ venc: "PG", cpf: cpfSintetico(4), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }), "algo"],
    ])
    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.header_map.unknown_headers).toContain("Coluna Nova Do Lucas")
    expect(r.source_quality).toContain("UNKNOWN_HEADER_PRESENT")
  })

  it("mesmo campo em DUAS colunas → INVALID_SOURCE, sem escolher uma", async () => {
    // Escolher a primeira ou a última seria a decisão incidental que o
    // mapeamento por cabeçalho existe para não tomar.
    const r = await capturar([...HEADER_AGOSTO, "Ticket"], [])
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("DUPLICATED_HEADER_FIELD")
    expect(r.detail).toContain("ticket")
  })

  it("`Aluno` é KNOWN_EXTRA: existe, é PII, não é consumido nem reportado", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(5), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E", aluno: "Nome Sintetico" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.header_map.unknown_headers).not.toContain("Aluno")
    // E o nome não sobrevive à normalização.
    expect(JSON.stringify(r.rows)).not.toContain("Nome Sintetico")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §18/§19/§20 — identidade e PII
// ═════════════════════════════════════════════════════════════════════════════

describe("§18/§19 — identidade por CPF + período", () => {
  it("mesmo CPF no mesmo período → mesmo subject_ref", async () => {
    const cpf = cpfSintetico(11)
    const linha = { cpf, unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E" as const }
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", ...linha }),
      linhaAgosto({ venc: "PG", ...linha }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    const [a, b] = r.rows
    if (a?.identity.status !== "identified" || b?.identity.status !== "identified") {
      throw new Error("esperava identificado")
    }
    expect(a.identity.subject_ref).toBe(b.identity.subject_ref)
  })

  it("mesmo CPF em períodos DIFERENTES → subject_ref diferente, sem colisão", async () => {
    const cpf = cpfSintetico(12)
    const ago = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf, unidade: "Zona Norte", parcelas: 18, ticket: "R$ 6.795,00", status: "E" }),
    ], "2026-08")
    const jul = await capturar(HEADER_JULHO, [
      linhaJulho({ venc: "-", cpf, unidade: "Zona Norte", parcelas: 18, ticket: "R$ 6.795,00", status: "C" }),
    ], "2026-07")

    if (ago.status !== "available" || jul.status !== "available") throw new Error("estado errado")
    const a = ago.rows[0]?.identity
    const j = jul.rows[0]?.identity
    if (a?.status !== "identified" || j?.status !== "identified") throw new Error("esperava identificado")
    // É o caso REAL medido na Fase 2.10: cancelado em julho, emitido em agosto.
    // Recontratação legítima, dois contratos, dois pseudônimos.
    expect(a.subject_ref).not.toBe(j.subject_ref)
  })

  it("§19 — CPF vazio → IDENTITY_MISSING, e a linha NÃO é descartada", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: "", unidade: "Carpina", parcelas: 12, ticket: "R$ 1.660,00", status: "P", aluno: "Nome Sintetico" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.row_count).toBe(1)
    const l = r.rows[0]
    expect(l?.identity.status).toBe("identity_missing")
    expect(l?.quality).toContain("IDENTITY_MISSING")
    // O resto da linha sobreviveu: o contrato existe, só não tem pessoa.
    expect(l?.ticket_cents).toBe(166000)
    expect(l?.status).toBe("P")
    // §19 — nome NUNCA vira identidade de reserva.
    expect(JSON.stringify(l)).not.toContain("Nome Sintetico")
    expect(JSON.stringify(l)).not.toContain("subject_ref")
  })

  it("CPF com dígito verificador inválido é IDENTITY_MISSING, não aceito", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: "111.111.111-11", unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.rows[0]?.identity.status).toBe("identity_missing")
  })

  it("§20 — nenhum CPF aparece na captura inteira, em nenhuma forma", async () => {
    const cpf = cpfSintetico(13)
    const digitos = cpf.replace(/\D/gu, "")
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf, unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    // Serializa a captura INTEIRA — linhas, snapshot, procedência, seleção.
    const tudo = JSON.stringify(r)
    expect(tudo).not.toContain(cpf)
    expect(tudo).not.toContain(digitos)
    // Nem os 9 primeiros dígitos, que já identificariam a pessoa.
    expect(tudo).not.toContain(digitos.slice(0, 9))
    // E o pseudônimo existe.
    expect(tudo).toContain("subj_")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §21/§22/§23/§24 — unidade
// ═════════════════════════════════════════════════════════════════════════════

describe("§21/§22 — unidade resolvida por D13 de produção", () => {
  it("as formas governadas resolvem, e o rótulo bruto é preservado", async () => {
    const casos: readonly [string, string][] = [
      ["Duque Caxias", "duque_de_caxias"],
      ["Meriti", "sao_joao_de_meriti"],
      ["Fortaleza", "fortaleza_centro"],
      ["Zona Norte", "zona_norte_rn"],
      ["Jardim Ângela", "jd_angela"],
      ["Alecrim", "alecrim"],
      ["Alecrim RN", "alecrim"],
      ["Alecrin RN", "alecrim"],
      ["Natal Centro", "alecrim"],
    ]
    const r = await capturar(
      HEADER_AGOSTO,
      casos.map(([nome], i) =>
        linhaAgosto({ venc: "PG", cpf: cpfSintetico(100 + i), unidade: nome, parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
      ),
    )
    if (r.status !== "available") throw new Error("estado errado")
    for (const [i, [nome, id]] of casos.entries()) {
      const l = r.rows[i]
      expect(l?.raw_unit_label, nome).toBe(nome)
      expect(l?.unit.status, nome).toBe("matched")
      if (l?.unit.status === "matched") expect(l.unit.unit_id, nome).toBe(id)
      expect(l?.quality, nome).not.toContain("UNIT_IDENTITY_UNRESOLVED")
    }
  })

  it("§21 — o UnitId interno NÃO precisa aparecer na fonte", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(21), unidade: "Duque Caxias", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    const l = r.rows[0]
    // Fonte legível, id técnico, display do catálogo — três coisas distintas.
    expect(l?.raw_unit_label).toBe("Duque Caxias")
    if (l?.unit.status !== "matched") throw new Error("esperava matched")
    expect(l.unit.unit_id).toBe("duque_de_caxias")
    expect(l.unit.display_name).toBe("Duque de Caxias")
  })

  it("§23 — unidade nova → UNIT_IDENTITY_UNRESOLVED, sem inventar id nem descartar", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(22), unidade: "Unidade Que Nao Existe", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.row_count).toBe(1)
    const l = r.rows[0]
    expect(l?.unit.status).not.toBe("matched")
    expect(l?.quality).toContain("UNIT_IDENTITY_UNRESOLVED")
    // Rótulo bruto preservado para a conversa com o Lucas; nenhum id inventado.
    expect(l?.raw_unit_label).toBe("Unidade Que Nao Existe")
    expect(JSON.stringify(l?.unit)).not.toContain("unit_id")
    // E o contrato sobreviveu.
    expect(l?.ticket_cents).toBe(500000)
  })

  it("§24 — unidade `inactive` no catálogo NÃO bloqueia o contrato", async () => {
    // `duque_de_caxias` e `jd_angela` são `inactive` e tiveram contrato em julho.
    // `Venc` COMPLETA de propósito: isola a variável. Com `PG` a linha teria um
    // fato legítimo de vencimento e o teste não conseguiria distinguir "fato por
    // ser inativa" de "fato por causa da data".
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "27/08/2026", cpf: cpfSintetico(23), unidade: "Duque Caxias", parcelas: 10, ticket: "R$ 5.538,00", status: "E" }),
      linhaAgosto({ venc: "28/08/2026", cpf: cpfSintetico(24), unidade: "Jardim Ângela", parcelas: 10, ticket: "R$ 9.405,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.row_count).toBe(2)
    for (const l of r.rows) {
      expect(l.unit.status).toBe("matched")
      // NENHUM fato: status de cadastro não gera fato de qualidade nem exclusão.
      expect(l.quality).toEqual([])
    }
    expect(r.snapshot.quality_status).toBe("ok")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §25/§26/§27/§28/§37 — números
// ═════════════════════════════════════════════════════════════════════════════

describe("§25/§37 — dinheiro em centavos inteiros, ausente nunca é zero", () => {
  it("as formas reais da planilha, incluindo a malformada sem espaço", async () => {
    const casos: readonly [unknown, number | null][] = [
      ["R$ 8.151,60", 815160],
      ["R$410,00", 41000], // observada na fonte real — sem espaço
      ["R$426,30", 42630],
      [523.43, 52343],
      ["1660", 166000],
    ]
    const r = await capturar(
      HEADER_AGOSTO,
      casos.map(([t], i) =>
        linhaAgosto({ venc: "PG", cpf: cpfSintetico(200 + i), unidade: "Santos", parcelas: 10, ticket: t, status: "E" }),
      ),
    )
    if (r.status !== "available") throw new Error("estado errado")
    for (const [i, [entrada, esperado]] of casos.entries()) {
      expect(r.rows[i]?.ticket_cents, String(entrada)).toBe(esperado)
    }
  })

  it("ticket ausente → null e SEM fato de inválido; ticket corrompido → null COM fato", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(31), unidade: "Santos", parcelas: 10, ticket: "", status: "E" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(32), unidade: "Santos", parcelas: 10, ticket: "R$ --", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    // Vazio: ausência, não corrupção. Nenhum dos dois virou `0`.
    expect(r.rows[0]?.ticket_cents).toBeNull()
    expect(r.rows[0]?.quality).not.toContain("INVALID_TICKET")
    expect(r.rows[1]?.ticket_cents).toBeNull()
    expect(r.rows[1]?.quality).toContain("INVALID_TICKET")
  })

  it("§26 — parcelas não inteira ou não positiva é INVALID_INSTALLMENT_COUNT", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(41), unidade: "Santos", parcelas: "20,5", ticket: "R$ 5.000,00", status: "E" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(42), unidade: "Santos", parcelas: 0, ticket: "R$ 5.000,00", status: "E" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(43), unidade: "Santos", parcelas: -3, ticket: "R$ 5.000,00", status: "E" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(44), unidade: "Santos", parcelas: "", ticket: "R$ 5.000,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    for (const i of [0, 1, 2]) {
      expect(r.rows[i]?.installment_count, `linha ${i}`).toBeNull()
      expect(r.rows[i]?.quality, `linha ${i}`).toContain("INVALID_INSTALLMENT_COUNT")
    }
    // Vazio é ausência, não invalidez.
    expect(r.rows[3]?.installment_count).toBeNull()
    expect(r.rows[3]?.quality).not.toContain("INVALID_INSTALLMENT_COUNT")
  })

  it("§28 — `%` vira basis points exatos", async () => {
    const casos: readonly [unknown, number][] = [
      [15, 1500],
      [20, 2000],
      [25, 2500],
      [30, 3000],
      ["15%", 1500],
      ["15,5", 1550],
    ]
    const r = await capturar(
      HEADER_AGOSTO,
      casos.map(([p], i) =>
        linhaAgosto({ venc: "PG", cpf: cpfSintetico(300 + i), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E", pct: p }),
      ),
    )
    if (r.status !== "available") throw new Error("estado errado")
    for (const [i, [entrada, bp]] of casos.entries()) {
      const d = r.rows[i]?.discount
      expect(d?.status, String(entrada)).toBe("available")
      if (d?.status === "available") expect(d.discount_bp, String(entrada)).toBe(bp)
    }
  })

  it("§28 — desconto ausente NÃO vira 0 bp; inválido acusa", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(51), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E", pct: "" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(52), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E", pct: "abc" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(53), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E", pct: 150 }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.rows[0]?.discount.status).toBe("missing")
    expect(JSON.stringify(r.rows[0]?.discount)).not.toContain("discount_bp")
    expect(r.rows[1]?.discount.status).toBe("invalid")
    expect(r.rows[1]?.quality).toContain("INVALID_DISCOUNT")
    // 150% não é desconto.
    expect(r.rows[2]?.discount.status).toBe("invalid")
  })

  it("§25 — reconciliação DETECTA divergência e não substitui o TICKET", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      // Coerente: 407,58 × 20 = 8.151,60
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(61), unidade: "Santos", parcelas: 20, ticket: "R$ 8.151,60", repasse: "R$ 407,58", status: "E" }),
      // Divergente: 400,00 × 20 = 8.000,00 ≠ 8.151,60
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(62), unidade: "Santos", parcelas: 20, ticket: "R$ 8.151,60", repasse: "R$ 400,00", status: "E" }),
      // TICKET ausente com repasse presente: NÃO calcula o produto.
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(63), unidade: "Santos", parcelas: 20, ticket: "", repasse: "R$ 407,58", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.rows[0]?.quality).not.toContain("TICKET_RECONCILIATION_MISMATCH")
    expect(r.rows[1]?.quality).toContain("TICKET_RECONCILIATION_MISMATCH")
    // O ticket oficial permanece o da fonte, não o produto.
    expect(r.rows[1]?.ticket_cents).toBe(815160)
    // E ausente continua ausente: 407,58 × 20 NÃO foi escrito.
    expect(r.rows[2]?.ticket_cents).toBeNull()
    expect(r.rows[2]?.transfer_cents).toBe(40758)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §14/§39/§54 — status bruto, vocabulário observado e contagem de qualidade
// ═════════════════════════════════════════════════════════════════════════════

describe("§14/§39/§54 — status bruto, canal bruto e contagens", () => {
  it("§14 — status bruto é preservado, inclusive quando inválido", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(71), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "e" }),
      linhaAgosto({ venc: "PG", cpf: cpfSintetico(72), unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "X" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    // Caixa baixa é tolerada; o bruto continua `e`.
    expect(r.rows[0]?.status).toBe("E")
    expect(r.rows[0]?.raw_status).toBe("e")
    // Fora do vocabulário: `null` + fato, com o bruto à vista.
    expect(r.rows[1]?.status).toBeNull()
    expect(r.rows[1]?.raw_status).toBe("X")
    expect(r.rows[1]?.quality).toContain("INVALID_STATUS")
  })

  it("§54 — fatos de qualidade são CONTADOS por tipo", async () => {
    const r = await capturar(HEADER_AGOSTO, [
      linhaAgosto({ venc: "27/08", cpf: "", unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
      linhaAgosto({ venc: "PG", cpf: "", unidade: "Santos", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
      linhaAgosto({ venc: "-", cpf: cpfSintetico(81), unidade: "Nao Existe", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.row_quality_counts.IDENTITY_MISSING).toBe(2)
    expect(r.row_quality_counts.FIRST_DUE_DATE_INCOMPLETE).toBe(1)
    expect(r.row_quality_counts.FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE).toBe(1)
    expect(r.row_quality_counts.FIRST_DUE_DATE_MISSING).toBe(1)
    expect(r.row_quality_counts.UNIT_IDENTITY_UNRESOLVED).toBe(1)
    // Fato ausente é chave ausente, não zero — não há fato que não ocorreu.
    expect(r.row_quality_counts.INVALID_TICKET).toBeUndefined()
    // Fato de linha degrada; não conflita.
    expect(r.snapshot.quality_status).toBe("degraded")
  })
})
