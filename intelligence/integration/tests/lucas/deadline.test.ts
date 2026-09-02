/**
 * Fase 2.13 — prazo de assinatura/emissão.
 *
 * A regra é curta e as fronteiras são onde ela erra. Este arquivo prova as fronteiras
 * uma por uma, e prova as três coisas que a fase existe para garantir:
 *
 *   1. o ano vem da FONTE (serial subjacente), nunca do período do arquivo;
 *   2. os deslocamentos são DIAS CORRIDOS, sem pular fim de semana;
 *   3. `source_status` NUNCA é reescrito pelo estado derivado.
 */

import { describe, expect, it } from "vitest"
import {
  civilDateFromSheetsSerial,
  SHEETS_SERIAL_MIN,
  addCivilDays,
  civilDaysFromDate,
  civilDateFromDays,
  diffCivilDays,
} from "../../../detectors/src/civil-date"
import { sourceInstant } from "../../src/lucas/source-time"
import {
  DEADLINE_SOURCE_HEADER,
  DEADLINE_SEMANTIC_FIELD,
  DEADLINE_REQUIRED_FORMAT_TYPE,
  RECOVERY_SEMANTICS,
  currentCivilDateSaoPaulo,
  deadlineFactType,
  evaluateDeadline,
  isRecoveryCandidate,
  resolveDeadline,
} from "../../src/lucas/deadline"
import type { DeadlineResolution } from "../../src/lucas/deadline"
import { buildHeaderMap } from "../../src/lucas/header-mapping"
import { HEADER_AGOSTO_REAL, celulaDePrazo, sheetsSerial } from "./fixtures"

const D = "2026-08-26"
const resolvido = (iso: string): DeadlineResolution => ({
  status: "resolved",
  deadline: iso,
  source_serial: sheetsSerial(iso),
})

// ═══════════════════════════════════════════════════════════════════════════════
// §8 — o serial do Google Sheets
// ═══════════════════════════════════════════════════════════════════════════════

describe("§8 — serial de data do Sheets → data civil", () => {
  it("reproduz o serial REAL observado na fonte oficial", () => {
    // A âncora da fase. Veio da inspeção direta da célula: formattedValue "26/08",
    // effectiveValue.numberValue 46260, numberFormat DATE dd/mm.
    expect(civilDateFromSheetsSerial(46260)).toBe("2026-08-26")
    expect(civilDateFromSheetsSerial(46261)).toBe("2026-08-27")
    expect(civilDateFromSheetsSerial(46247)).toBe("2026-08-13")
  })

  it("recusa formas que não são serial de data — fail closed", () => {
    // String não declara que é serial. `"46260"` poderia ser qualquer número.
    expect(civilDateFromSheetsSerial("46260")).toBeNull()
    // Fracionário carrega hora do dia, e prazo é data. Truncar escolheria o dia.
    expect(civilDateFromSheetsSerial(46260.5)).toBeNull()
    expect(civilDateFromSheetsSerial(null)).toBeNull()
    expect(civilDateFromSheetsSerial(undefined)).toBeNull()
    expect(civilDateFromSheetsSerial("")).toBeNull()
    expect(civilDateFromSheetsSerial("26/08")).toBeNull()
    expect(civilDateFromSheetsSerial(Number.NaN)).toBeNull()
    expect(civilDateFromSheetsSerial(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("recusa a região do bug de ano bissexto de 1900", () => {
    // Abaixo de 61 (1900-03-01) o mapeamento depende de qual implementação reproduz o
    // 29/02/1900 fictício. Nenhum prazo de 2026 mora lá, e recusar é honesto.
    expect(civilDateFromSheetsSerial(SHEETS_SERIAL_MIN - 1)).toBeNull()
    expect(civilDateFromSheetsSerial(0)).toBeNull()
    expect(civilDateFromSheetsSerial(-1)).toBeNull()
    expect(civilDateFromSheetsSerial(SHEETS_SERIAL_MIN)).toBe("1900-03-01")
  })

  it("a fixture e a produção concordam sobre o serial", () => {
    // A fixture calcula o serial por conta própria, a partir da âncora 46260. Se as
    // duas divergissem, um teste de fronteira passaria pelo motivo errado.
    for (const iso of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31", "2027-01-01"]) {
      expect(civilDateFromSheetsSerial(sheetsSerial(iso))).toBe(iso)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §8 — uma autoridade de calendário, provada
// ═══════════════════════════════════════════════════════════════════════════════

describe("§8 — nenhuma segunda autoridade de calendário", () => {
  it("a aritmética civil concorda com a do SourceInstant", () => {
    // `source-time.ts` tem a própria cópia privada de `days_from_civil` para o
    // `SourceInstant`, e ela é área SHIP que esta fase não abre. Em vez de confiar,
    // afirmo que as duas concordam: `epoch_seconds` de meia-noite UTC dividido por
    // 86400 é o mesmo número de dias civis.
    for (const iso of [
      "1970-01-01", "1999-12-31", "2000-01-01", "2000-02-29",
      "2026-08-26", "2027-03-01", "2028-02-29", "2100-03-01",
    ]) {
      const inst = sourceInstant(`${iso}T00:00:00Z`)
      expect(inst, iso).not.toBeNull()
      expect(inst?.epoch_seconds ?? -1, iso).toBe((civilDaysFromDate(iso) ?? -1) * 86_400)
    }
  })

  it("addCivilDays e diffCivilDays são inversos exatos", () => {
    for (const iso of ["2026-08-26", "2026-01-01", "2028-02-28"]) {
      for (const delta of [-400, -31, -4, -1, 0, 1, 31, 400]) {
        const alvo = addCivilDays(iso, delta)
        expect(alvo, `${iso}${delta}`).not.toBeNull()
        expect(diffCivilDays(iso, alvo)).toBe(delta)
      }
    }
  })

  it("civilDateFromDays recusa entrada não-inteira e fora de faixa", () => {
    expect(civilDateFromDays(1.5)).toBeNull()
    expect(civilDateFromDays(Number.NaN)).toBeNull()
    expect(addCivilDays("2026-08-26", 1.5)).toBeNull()
    expect(addCivilDays("26/08", 1)).toBeNull()
    expect(addCivilDays("2026-02-30", 1)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §19 — as fronteiras de P e A
// ═══════════════════════════════════════════════════════════════════════════════

describe("§19 — fronteiras de P", () => {
  const casos: readonly [number, string][] = [
    [-6, "outside_window"],
    [-5, "outside_window"],
    [-4, "p_signature_deadline_attention"],
    [-3, "p_signature_deadline_attention"],
    [-2, "p_signature_deadline_attention"],
    [-1, "p_signature_deadline_attention"],
    [0, "contract_deadline_missed"],
    [1, "auto_cancelled_by_deadline"],
    [5, "auto_cancelled_by_deadline"],
  ]

  for (const [offset, esperado] of casos) {
    it(`P em D${offset >= 0 ? "+" : ""}${offset} → ${esperado}`, () => {
      const hoje = addCivilDays(D, offset)
      expect(hoje).not.toBeNull()
      const s = evaluateDeadline("P", resolvido(D), hoje ?? "")
      expect(s.state).toBe(esperado)
      if (s.state !== "not_evaluable" && s.state !== "not_applicable") {
        expect(s.offset_days).toBe(offset)
        expect(s.deadline).toBe(D)
      }
    })
  }
})

describe("§19 — fronteiras de A", () => {
  const casos: readonly [number, string][] = [
    [-4, "outside_window"],
    [-3, "outside_window"],
    [-2, "outside_window"],
    [-1, "a_emission_deadline_alert"],
    [0, "contract_deadline_missed"],
    [1, "auto_cancelled_by_deadline"],
  ]

  for (const [offset, esperado] of casos) {
    it(`A em D${offset >= 0 ? "+" : ""}${offset} → ${esperado}`, () => {
      const hoje = addCivilDays(D, offset)
      const s = evaluateDeadline("A", resolvido(D), hoje ?? "")
      expect(s.state).toBe(esperado)
    })
  }

  it("a janela de A é SÓ D-1 — D-4 não alerta, ao contrário de P", () => {
    const em = addCivilDays(D, -4) ?? ""
    expect(evaluateDeadline("P", resolvido(D), em).state).toBe("p_signature_deadline_attention")
    expect(evaluateDeadline("A", resolvido(D), em).state).toBe("outside_window")
  })
})

describe("§15 §16 — E e C não produzem fato de prazo", () => {
  for (const offset of [-4, -1, 0, 1]) {
    it(`E em D${offset >= 0 ? "+" : ""}${offset} → nenhum estado derivado`, () => {
      const hoje = addCivilDays(D, offset) ?? ""
      const s = evaluateDeadline("E", resolvido(D), hoje)
      expect(s.state).toBe("not_applicable")
      expect(deadlineFactType(s)).toBeNull()
    })
  }

  it("C da FONTE tem proveniência própria, distinta de auto-cancelamento", () => {
    const s = evaluateDeadline("C", resolvido(D), addCivilDays(D, 3) ?? "")
    expect(s.state).toBe("not_applicable")
    if (s.state === "not_applicable") expect(s.reason).toBe("SOURCE_CANCELLED")
    expect(deadlineFactType(s)).toBeNull()
    // E NÃO entra em recuperação: afirmar que caiu por prazo seria inventar a causa.
    expect(isRecoveryCandidate(s)).toBe(false)
  })

  it("E com prazo ILEGÍVEL continua sem pendência — não vira investigação", () => {
    // A ordem dos testes em `evaluateDeadline` importa: status antes de prazo. Um
    // `E` com `Desembolso` vazio não é trabalho para ninguém, e reportá-lo como
    // não-avaliável criaria uma pendência sobre contrato já resolvido.
    const s = evaluateDeadline("E", { status: "not_evaluable", reason: "DEADLINE_MISSING" }, D)
    expect(s.state).toBe("not_applicable")
  })

  it("status ausente ou fora do vocabulário não inventa comportamento", () => {
    const s = evaluateDeadline(null, resolvido(D), D)
    expect(s.state).toBe("not_applicable")
    if (s.state === "not_applicable") expect(s.reason).toBe("STATUS_NOT_GOVERNED")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §18 — DIAS CORRIDOS, provado contra o calendário de verdade
// ═══════════════════════════════════════════════════════════════════════════════

describe("§18 — dias corridos, nunca dias úteis", () => {
  it("prazo numa segunda: P entra em D-4 na QUINTA anterior", () => {
    // 2026-08-31 é segunda. D-4 = 2026-08-27, quinta.
    const segunda = "2026-08-31"
    const quinta = addCivilDays(segunda, -4)
    expect(quinta).toBe("2026-08-27")
    expect(evaluateDeadline("P", resolvido(segunda), quinta ?? "").state).toBe(
      "p_signature_deadline_attention",
    )

    // A asserção que DISCRIMINA dia corrido de dia útil. Contando dias úteis, quatro
    // dias antes da segunda 31/08 seria a terça 25/08, e a janela começaria ali.
    // Contando dias corridos, 25/08 é D-6 e está fora. É esta linha que falharia se
    // alguém trocasse a aritmética por dias úteis.
    expect(evaluateDeadline("P", resolvido(segunda), "2026-08-25").state).toBe("outside_window")
    expect(evaluateDeadline("P", resolvido(segunda), "2026-08-26").state).toBe("outside_window")
    expect(diffCivilDays(segunda, "2026-08-25")).toBe(-6)
  })

  it("prazo numa segunda: A alerta no DOMINGO", () => {
    const segunda = "2026-08-31"
    const domingo = addCivilDays(segunda, -1)
    expect(domingo).toBe("2026-08-30")
    expect(evaluateDeadline("A", resolvido(segunda), domingo ?? "").state).toBe(
      "a_emission_deadline_alert",
    )
  })

  it("prazo num domingo: P entra em D-4 na QUARTA", () => {
    // 2026-08-30 é domingo. D-4 = 2026-08-26, quarta.
    const domingo = "2026-08-30"
    const quarta = addCivilDays(domingo, -4)
    expect(quarta).toBe("2026-08-26")
    expect(evaluateDeadline("P", resolvido(domingo), quarta ?? "").state).toBe(
      "p_signature_deadline_attention",
    )
  })

  it("sábado e domingo contam: D-4 atravessa o fim de semana inteiro", () => {
    // Prazo na terça 2026-09-01; D-4 é a sexta 2026-08-28. Sábado e domingo estão
    // dentro da janela, e ambos são dias de atenção.
    const terca = "2026-09-01"
    expect(addCivilDays(terca, -4)).toBe("2026-08-28")
    for (const dia of ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"]) {
      expect(evaluateDeadline("P", resolvido(terca), dia).state, dia).toBe(
        "p_signature_deadline_attention",
      )
    }
    expect(evaluateDeadline("P", resolvido(terca), "2026-08-27").state).toBe("outside_window")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §20 — viradas de mês, de ano e ano bissexto
// ═══════════════════════════════════════════════════════════════════════════════

describe("§20 — fronteiras de calendário", () => {
  it("prazo 02/09 → D-4 em agosto", () => {
    expect(addCivilDays("2026-09-02", -4)).toBe("2026-08-29")
    expect(evaluateDeadline("P", resolvido("2026-09-02"), "2026-08-29").state).toBe(
      "p_signature_deadline_attention",
    )
  })

  it("prazo 01/01 → D-4 no ano ANTERIOR", () => {
    expect(addCivilDays("2027-01-01", -4)).toBe("2026-12-28")
    expect(evaluateDeadline("P", resolvido("2027-01-01"), "2026-12-28").state).toBe(
      "p_signature_deadline_attention",
    )
    // E é justamente este caso que a inferência de ano pelo período erraria: um
    // contrato de dezembro com prazo em janeiro cairia onze meses no passado.
    expect(diffCivilDays("2027-01-01", "2026-12-28")).toBe(-4)
  })

  it("fevereiro de ano comum: 01/03 → D-4 é 25/02", () => {
    expect(addCivilDays("2027-03-01", -4)).toBe("2027-02-25")
  })

  it("ano bissexto: 01/03 → D-4 é 26/02, e 29/02 está na janela", () => {
    expect(addCivilDays("2028-03-01", -4)).toBe("2028-02-26")
    expect(evaluateDeadline("P", resolvido("2028-03-01"), "2028-02-29").state).toBe(
      "p_signature_deadline_attention",
    )
  })

  it("29/02 é prazo válido em ano bissexto e inexistente em ano comum", () => {
    expect(civilDateFromSheetsSerial(sheetsSerial("2028-02-29"))).toBe("2028-02-29")
    // 2027 não é bissexto: a data não existe e nenhuma conversão pode produzi-la.
    expect(addCivilDays("2027-02-29", 0)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §14 — a invariante constitucional
// ═══════════════════════════════════════════════════════════════════════════════

describe("§14 — source_status NUNCA é reescrito", () => {
  it("fonte atrasada: P em D+2 permanece P, com estado derivado ao lado", () => {
    const hoje = addCivilDays(D, 2) ?? ""
    const s = evaluateDeadline("P", resolvido(D), hoje)
    expect(s.state).toBe("auto_cancelled_by_deadline")
    // O estado derivado NÃO é `C` e não é um status. É outro campo, e o teste afirma
    // a forma: nenhum lugar em `DeadlineState` carrega um `LucasStatus`.
    expect(JSON.stringify(s)).not.toContain('"C"')
    expect(JSON.stringify(s)).not.toContain("status")
    expect(deadlineFactType(s)).toBe("AUTO_CANCELLED_BY_DEADLINE")
  })

  it("A em D+2 também permanece A", () => {
    const s = evaluateDeadline("A", resolvido(D), addCivilDays(D, 2) ?? "")
    expect(s.state).toBe("auto_cancelled_by_deadline")
  })
})

describe("§13 — recuperação é investigação, não promessa", () => {
  it("só auto-cancelado por prazo entra como candidato", () => {
    expect(isRecoveryCandidate(evaluateDeadline("P", resolvido(D), addCivilDays(D, 1) ?? ""))).toBe(true)
    expect(isRecoveryCandidate(evaluateDeadline("P", resolvido(D), D))).toBe(false)
    expect(isRecoveryCandidate(evaluateDeadline("P", resolvido(D), addCivilDays(D, -1) ?? ""))).toBe(false)
    expect(isRecoveryCandidate(evaluateDeadline("C", resolvido(D), addCivilDays(D, 1) ?? ""))).toBe(false)
  })

  it("o vocabulário carrega a dúvida no próprio nome", () => {
    // Não afirmamos recuperabilidade. O identificador diz "a investigar".
    expect(RECOVERY_SEMANTICS).toBe("RECOVERY_OPPORTUNITY_TO_INVESTIGATE")
    expect(RECOVERY_SEMANTICS).not.toContain("RECOVERABLE")
    expect(RECOVERY_SEMANTICS).not.toContain("WILL")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §17 — ausente ou inválido não é ausência de urgência
// ═══════════════════════════════════════════════════════════════════════════════

describe("§17 — prazo ausente ou inválido", () => {
  it("coluna ausente e célula vazia têm razões DIFERENTES", () => {
    // A primeira é característica do MÊS, a segunda de um CONTRATO. Reportar as duas
    // como a mesma coisa mandaria alguém conferir a linha errada.
    expect(resolveDeadline(celulaDePrazo(46260), false)).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_COLUMN_ABSENT",
    })
    expect(resolveDeadline(undefined, true)).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_MISSING",
    })
    expect(resolveDeadline(celulaDePrazo(null), true)).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_MISSING",
    })
  })

  it("conteúdo que não é serial de data → não-avaliável, não zero e não hoje", () => {
    // Célula de texto: tem valor exibido e nenhum valor numérico efetivo.
    expect(
      resolveDeadline({ formatted: "abc", number_value: null, number_format_type: null }, true),
    ).toEqual({ status: "not_evaluable", reason: "DEADLINE_NOT_A_SOURCE_DATE" })
    // Serial fracionário, mesmo tipado como DATE: carrega hora, e prazo é data.
    expect(resolveDeadline(celulaDePrazo(46260.5), true)).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_NOT_A_SOURCE_DATE",
    })
    // Fora da janela governada de serial.
    expect(resolveDeadline(celulaDePrazo(0), true).status).toBe("not_evaluable")
  })

  it("nenhum dos quatro fatos é produzido quando o prazo não resolve", () => {
    for (const status of ["P", "A"] as const) {
      const s = evaluateDeadline(status, { status: "not_evaluable", reason: "DEADLINE_MISSING" }, D)
      expect(s.state).toBe("not_evaluable")
      expect(deadlineFactType(s)).toBeNull()
      expect(isRecoveryCandidate(s)).toBe(false)
    }
  })

  it("não-avaliável é DISTINGUÍVEL de sem-alerta", () => {
    const semAlerta = evaluateDeadline("P", resolvido(D), addCivilDays(D, -10) ?? "")
    const naoAvaliavel = evaluateDeadline("P", { status: "not_evaluable", reason: "DEADLINE_MISSING" }, D)
    // Os dois não emitem fato — e é por isso que o ESTADO tem de diferir. Um Hermes
    // futuro precisa agir diferente: no primeiro caso não há nada a fazer, no segundo
    // alguém tem de olhar a planilha.
    expect(deadlineFactType(semAlerta)).toBeNull()
    expect(deadlineFactType(naoAvaliavel)).toBeNull()
    expect(semAlerta.state).not.toBe(naoAvaliavel.state)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §4 — o ano vem da fonte, e o texto exibido não tem caminho até aqui
// ═══════════════════════════════════════════════════════════════════════════════

describe("§4 — nenhuma reconstrução de ano a partir do texto", () => {
  it("o texto exibido NUNCA vira prazo, mesmo com data completa visível", () => {
    // Célula cujo texto mostra a data inteira mas que não tem valor efetivo: é texto.
    // Se este caminho resolvesse, o prazo viria da exibição — e a exibição é o que a
    // fonte pode reformatar sem mudar fato nenhum.
    for (const visto of ["26/08", "26/08/2026", "2026-08-26"]) {
      expect(
        resolveDeadline({ formatted: visto, number_value: null, number_format_type: null }, true)
          .status,
        visto,
      ).toBe("not_evaluable")
    }
  })

  it("o serial carrega o ano, e anos diferentes dão prazos diferentes", () => {
    // Mesmo dia e mês, anos distintos: o serial distingue, o texto `26/08` não.
    const a = civilDateFromSheetsSerial(sheetsSerial("2026-08-26"))
    const b = civilDateFromSheetsSerial(sheetsSerial("2027-08-26"))
    expect(a).toBe("2026-08-26")
    expect(b).toBe("2027-08-26")
    expect(a).not.toBe(b)
  })

  it("o header REAL fica preservado no vocabulário, junto do campo semântico", () => {
    expect(DEADLINE_SOURCE_HEADER).toBe("Desembolso")
    expect(DEADLINE_SEMANTIC_FIELD).toBe("contract_signature_deadline")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §6 §22 — header, não posição
// ═══════════════════════════════════════════════════════════════════════════════

describe("§22 — regressão do incidente DUPLICATED_HEADER_FIELD", () => {
  it("o cabeçalho REAL de hoje mapeia status sem colisão", () => {
    const m = buildHeaderMap(HEADER_AGOSTO_REAL)
    expect(m.duplicated_fields).toEqual([])
    expect(m.required_missing).toEqual([])
    // `status` aponta para a coluna do A/C/E/P, não para a de pagamento.
    expect(m.index["status"]).toBe(HEADER_AGOSTO_REAL.indexOf("Status"))
    // E os dois campos são DISTINTOS, em colunas distintas.
    expect(m.index["status_pagamento"]).toBe(HEADER_AGOSTO_REAL.indexOf("Status Pagamento"))
    expect(m.index["status"]).not.toBe(m.index["status_pagamento"])
  })

  it("Status Pagamento NÃO é alias de contract_status", () => {
    // A prova por mutação: só com `Status Pagamento`, o campo obrigatório `status`
    // fica FALTANDO. Se fosse alias, ele mapearia — e o A/C/E/P viria da coluna de
    // pagamento, produzindo população comercial a partir de datas e `PG`.
    const m = buildHeaderMap(["Venc", "Status Pagamento", "CPF", "Unidade", "Parcelas", "Ticket"])
    expect(m.required_missing).toContain("status")
    expect(m.index["status"]).toBeUndefined()
  })

  it("a proteção global contra header duplicado continua intacta", () => {
    // Não enfraqueci a regra: duas colunas com o MESMO nome continuam recusadas.
    const m = buildHeaderMap([...HEADER_AGOSTO_REAL, "Status"])
    expect(m.duplicated_fields).toContain("status")
    expect(m.index["status"]).toBeUndefined()
  })

  it("Valor para Desembolso não colide com Desembolso", () => {
    const m = buildHeaderMap(HEADER_AGOSTO_REAL)
    expect(m.duplicated_fields).not.toContain("desembolso")
    expect(m.index["desembolso"]).toBe(HEADER_AGOSTO_REAL.indexOf("Desembolso"))
  })
})

describe("§6 — header shift: coluna nova antes de Desembolso", () => {
  it("o mapeamento segue o header, não o índice", () => {
    const antes = buildHeaderMap(HEADER_AGOSTO_REAL)
    const deslocado = [...HEADER_AGOSTO_REAL]
    deslocado.splice(deslocado.indexOf("Desembolso"), 0, "Coluna Nova Qualquer")
    const depois = buildHeaderMap(deslocado)

    // A posição física mudou…
    expect(depois.index["desembolso"]).toBe(antes.index["desembolso"]! + 1)
    // …e continua sendo a coluna certa.
    expect(deslocado[depois.index["desembolso"]!]).toBe("Desembolso")
    expect(depois.required_missing).toEqual([])
    expect(depois.duplicated_fields).toEqual([])
    // A coluna nova aparece como desconhecida — visível, não silenciosa.
    expect(depois.unknown_headers).toContain("Coluna Nova Qualquer")
  })

  it("nenhum índice fixo de Desembolso no código de produção", () => {
    // Em agosto real `Desembolso` é a coluna R (índice 17); na fixture antiga é Q
    // (16). O mesmo código serve os dois, o que só é possível sem índice fixo.
    expect(HEADER_AGOSTO_REAL.indexOf("Desembolso")).toBe(17)
    expect(buildHeaderMap(HEADER_AGOSTO_REAL).index["desembolso"]).toBe(17)
    const curto = HEADER_AGOSTO_REAL.filter((h) => h !== "Status Pagamento")
    expect(buildHeaderMap(curto).index["desembolso"]).toBe(16)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §9 — fuso e determinismo
// ═══════════════════════════════════════════════════════════════════════════════

describe("§9 — data de avaliação em America/Sao_Paulo", () => {
  it("22:00 de 31/08 em São Paulo ainda é 31/08, não 01/09", () => {
    // 2026-09-01T01:00:00Z é 2026-08-31T22:00 em São Paulo. Avaliar em UTC faria um
    // prazo de 31/08 aparecer como perdido por diferença de fuso.
    expect(currentCivilDateSaoPaulo(new Date("2026-09-01T01:00:00Z"))).toBe("2026-08-31")
    expect(currentCivilDateSaoPaulo(new Date("2026-09-01T04:00:00Z"))).toBe("2026-09-01")
  })

  it("é determinístico para o mesmo instante", () => {
    const d = new Date("2026-08-26T12:00:00Z")
    expect(currentCivilDateSaoPaulo(d)).toBe(currentCivilDateSaoPaulo(d))
    expect(currentCivilDateSaoPaulo(d)).toBe("2026-08-26")
  })

  it("data de avaliação corrompida não produz cancelamento", () => {
    // Defeito de programação não pode virar "o contrato caiu".
    for (const ruim of ["", "26/08", "2026-02-30", "hoje"]) {
      const s = evaluateDeadline("P", resolvido(D), ruim)
      expect(s.state, ruim).toBe("not_evaluable")
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// §6 §7 §34 (2.13a) — o tipo da célula é exigido, não presumido
// ═══════════════════════════════════════════════════════════════════════════════

describe("§6 §7 — só célula tipada DATE é prazo", () => {
  it("o tipo exigido é DATE", () => {
    expect(DEADLINE_REQUIRED_FORMAT_TYPE).toBe("DATE")
  })

  it("46260 tipado DATE resolve; o MESMO número tipado NUMBER não", () => {
    // O achado do gate, direto: `UNFORMATTED_VALUE` dava o número sem o tipo, e
    // qualquer inteiro na faixa virava data. Um `46260` digitado por engano numa
    // coluna de contagem produziria o prazo 2026-08-26 — plausível e falso, com
    // alerta ou auto-cancelamento sobre um contrato real.
    expect(resolveDeadline(celulaDePrazo(46260, "DATE"), true)).toEqual({
      status: "resolved",
      deadline: "2026-08-26",
      source_serial: 46260,
    })
    expect(resolveDeadline(celulaDePrazo(46260, "NUMBER"), true)).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_NOT_DATE_TYPED",
    })
  })

  it("nenhum outro tipo de formato é aceito", () => {
    for (const tipo of ["NUMBER", "CURRENCY", "PERCENT", "TEXT", "SCIENTIFIC", "DATE_TIME", "TIME"]) {
      const r = resolveDeadline(celulaDePrazo(46260, tipo), true)
      expect(r.status, tipo).toBe("not_evaluable")
      if (r.status === "not_evaluable") expect(r.reason, tipo).toBe("DEADLINE_NOT_DATE_TYPED")
    }
  })

  it("tipo AUSENTE na resposta é recusa, não permissão", () => {
    // Metadado que não veio não é metadado que autoriza.
    expect(resolveDeadline(celulaDePrazo(46260, null), true)).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_NOT_DATE_TYPED",
    })
  })

  it("a razão de tipo é DISTINTA da de serial inválido", () => {
    // Ações diferentes: uma é corrigir o formato da célula, a outra é corrigir o
    // valor. Colapsá-las mandaria alguém procurar a coisa errada.
    const tipo = resolveDeadline(celulaDePrazo(46260, "NUMBER"), true)
    const valor = resolveDeadline(celulaDePrazo(5, "DATE"), true)
    expect(tipo.status).toBe("not_evaluable")
    expect(valor.status).toBe("not_evaluable")
    if (tipo.status === "not_evaluable" && valor.status === "not_evaluable") {
      expect(tipo.reason).not.toBe(valor.reason)
    }
  })

  it("célula tipada DATE mas sem valor numérico não é prazo", () => {
    expect(
      resolveDeadline({ formatted: "26/08", number_value: null, number_format_type: "DATE" }, true)
        .status,
    ).toBe("not_evaluable")
  })
})
