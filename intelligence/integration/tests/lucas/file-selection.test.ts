/**
 * Seleção de arquivo, mapeamento de mês e os cinco estados de captura.
 *
 * O caso que mais importa aqui é o de duplicidade: ele prova que a escolha não
 * depende da ordem em que a API devolveu os candidatos. O duplo inverte a ordem por
 * padrão e há um teste que percorre TODAS as permutações — porque "funcionou com a
 * ordem que veio" é exactamente o defeito do workflow atual.
 */

import { describe, expect, it } from "vitest"
import {
  expectedFileName,
  monthNamePtBr,
  parsePeriod,
  periodBounds,
} from "../../src/lucas/month-names"
import { SELECTION_RULE, selectMonthlyFile } from "../../src/lucas/file-selection"
import { LucasMonthlyContractsProvider, currentPeriod } from "../../src/lucas/provider"
import { LUCAS_OFFICIAL_FOLDER_ID } from "../../src/lucas/drive-port"
import { detectInstallmentConcentration } from "../../../detectors/src/installment-concentration"
import { detectLowTicketContracts } from "../../../detectors/src/low-ticket"
import { toInstallmentInput, toLowTicketInput } from "../../src/lucas/detector-input"
import { buildProductionDetectorConfig } from "../../../detectors/src/production-policy"
import { rowKeyFor } from "../../src/lucas/evidence"
import { FakeDrive, SHEETS_MIME, XLSX_MIME, arquivo } from "./fake-drive"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const GRADE_OK = {
  headers: HEADER_AGOSTO,
  rows: [
    linhaAgosto({
      venc: "27/08/2026",
      cpf: cpfSintetico(1),
      unidade: "Meriti",
      parcelas: 20,
      ticket: "R$ 8.151,60",
      status: "E",
    }),
  ],
}

const provider = (drive: FakeDrive): LucasMonthlyContractsProvider =>
  new LucasMonthlyContractsProvider({ drive, now: () => new Date("2026-08-19T18:00:00.000Z") })

// ═════════════════════════════════════════════════════════════════════════════
// §5 — nome do mês, determinístico
// ═════════════════════════════════════════════════════════════════════════════

describe("§5 — mapeamento de mês sem depender de locale", () => {
  it("os doze meses em português", () => {
    const esperado = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ]
    for (const [i, nome] of esperado.entries()) {
      expect(monthNamePtBr(i + 1), String(i + 1)).toBe(nome)
      const p = `2026-${String(i + 1).padStart(2, "0")}`
      expect(expectedFileName(p), p).toBe(`Novos Alunos - ${nome}`)
    }
  })

  it("`Março` mantém o acento — grafia da fonte", () => {
    // Remover acento aqui faria a busca casar `Novos Alunos - Marco`, que se
    // existir é outro arquivo, criado por engano.
    expect(expectedFileName("2026-03")).toBe("Novos Alunos - Março")
  })

  it("fora do domínio AAAA-MM devolve null, não um chute", () => {
    for (const ruim of ["2026-8", "2026/08", "08-2026", "2026-13", "2026-00", "", "hoje"]) {
      expect(parsePeriod(ruim), ruim).toBeNull()
      expect(expectedFileName(ruim), ruim).toBeNull()
    }
    expect(monthNamePtBr(0)).toBeNull()
    expect(monthNamePtBr(13)).toBeNull()
    expect(monthNamePtBr(1.5)).toBeNull()
  })

  it("limites do período seguem calendário real, fevereiro incluído", () => {
    expect(periodBounds("2026-08")).toEqual({ start: "2026-08-01", end: "2026-08-31" })
    expect(periodBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" })
    // 2028 é bissexto: 29 dias. Prova que não há tabela fixa de 28.
    expect(periodBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" })
  })

  it("§4 — período corrente usa America/Sao_Paulo, não UTC", () => {
    // 01/09/2026 00:30 UTC é 31/08/2026 21:30 em São Paulo. O período correto é
    // agosto: em UTC a ingestão leria o arquivo de setembro, que talvez não exista.
    expect(currentPeriod(new Date("2026-09-01T00:30:00.000Z"))).toBe("2026-08")
    // E 01/09 03:30 UTC já é 1º de setembro em São Paulo.
    expect(currentPeriod(new Date("2026-09-01T03:30:00.000Z"))).toBe("2026-09")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §7/§8/§9 — candidatos
// ═════════════════════════════════════════════════════════════════════════════

describe("§6/§7 — pasta oficial e ausência de arquivo", () => {
  it("zero candidatos → DATA_NOT_AVAILABLE, nunca zero contratos", async () => {
    const drive = new FakeDrive({ files: [] })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("data_not_available")
    if (r.status !== "data_not_available") throw new Error("estado errado")
    expect(r.expected_file_name).toBe("Novos Alunos - Agosto")
    expect(r.detail).toContain("NÃO significa zero contratos")
    // O ramo indisponível não TEM onde escrever linhas — prova estrutural.
    expect(JSON.stringify(r)).not.toContain('"rows"')
    expect(JSON.stringify(r)).not.toContain('"row_count"')
    expect(JSON.stringify(r)).not.toContain('"snapshot"')
  })

  it("a busca é restrita à pasta oficial, e só a ela", async () => {
    const drive = new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK)] })
    await provider(drive).load({ period: "2026-08" })
    expect(drive.foldersConsultados).toEqual([LUCAS_OFFICIAL_FOLDER_ID])
    expect(drive.nomesConsultados).toEqual(["Novos Alunos - Agosto"])
  })

  it("arquivo de outro mês na mesma pasta não é selecionado", async () => {
    const drive = new FakeDrive({
      files: [arquivo("f_jul", "Novos Alunos - Julho", "2026-08-19T23:59:00Z", GRADE_OK)],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    // Mesmo sendo o mais recente da pasta: nome diferente, não disputa.
    expect(r.status).toBe("data_not_available")
  })

  it("um candidato → AVAILABLE sem aviso de duplicidade", async () => {
    const drive = new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK)] })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.selection.duplicate).toBe(false)
    expect(r.source_quality).not.toContain("DUPLICATE_SOURCE_WARNING")
  })
})

describe("§8/§9 — duplicidade não bloqueia e a escolha é auditável", () => {
  const dois = [
    arquivo("bbb", "Novos Alunos - Agosto", "2026-08-19T10:00:00Z", GRADE_OK),
    arquivo("aaa", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK),
  ]

  it("dois candidatos → AVAILABLE + DUPLICATE_SOURCE_WARNING", async () => {
    const drive = new FakeDrive({ files: dois })
    const r = await provider(drive).load({ period: "2026-08" })
    // Não bloqueou: duplicidade é qualidade, não ausência.
    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
    expect(r.selection.duplicate).toBe(true)
    expect(r.selection.eligible_count).toBe(2)
  })

  it("escolhe o de maior modifiedTime, e registra a regra pelo nome", async () => {
    const drive = new FakeDrive({ files: dois })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.selection.selected_file_id).toBe("aaa")
    expect(r.selection.selected_modified_time).toBe("2026-08-19T13:39:00Z")
    expect(r.selection.selection_rule).toBe(SELECTION_RULE)
    expect(SELECTION_RULE).toBe("LATEST_MODIFIED_THEN_STABLE_FILE_ID")
  })

  it("empate exato de modifiedTime → menor file_id lexical", () => {
    const empate = [
      { file_id: "zzz", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-19T13:39:00Z" },
      { file_id: "aaa", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-19T13:39:00Z" },
      { file_id: "mmm", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-19T13:39:00Z" },
    ]
    const r = selectMonthlyFile(empate, "Novos Alunos - Agosto")
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    expect(r.selection.selected_file_id).toBe("aaa")
  })

  it("TODAS as permutações da ordem da API produzem a MESMA escolha", () => {
    // Este é o teste que separa uma regra de um acidente. O workflow atual usa
    // `limit: 1` e passaria com uma ordem e falharia com outra.
    const base = [
      { file_id: "ccc", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-01T00:00:00Z" },
      { file_id: "aaa", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-19T13:39:00Z" },
      { file_id: "bbb", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-19T13:39:00Z" },
    ]
    const permutar = <T>(xs: readonly T[]): T[][] =>
      xs.length <= 1
        ? [[...xs]]
        : xs.flatMap((x, i) =>
            permutar([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
          )

    const permutacoes = permutar(base)
    expect(permutacoes).toHaveLength(6)
    for (const p of permutacoes) {
      const r = selectMonthlyFile(p, "Novos Alunos - Agosto")
      if (r.outcome !== "selected") throw new Error("esperava seleção")
      expect(r.selection.selected_file_id, JSON.stringify(p.map((x) => x.file_id))).toBe("aaa")
      // A lista auditável também é estável, senão o hash de um relatório de
      // duplicidade mudaria sem nada mudar na fonte.
      expect(r.selection.candidates.map((c) => c.file_id)).toEqual(["aaa", "bbb", "ccc"])
    }
  })

  it("todos os candidatos ficam preservados para auditoria", async () => {
    const drive = new FakeDrive({ files: dois })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.selection.candidate_count).toBe(2)
    expect(r.selection.candidates.map((c) => c.file_id).sort()).toEqual(["aaa", "bbb"])
    for (const c of r.selection.candidates) {
      expect(c.modified_time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(c.name).toBe("Novos Alunos - Agosto")
    }
  })

  it("duplicidade NÃO é Conflict não resolvido — há decisão governada", async () => {
    // Esta asserção era o inverso, e estava errada. `low-ticket.ts` e
    // `first-due-date-concentration.ts` fazem `if (s.conflicts.length > 0)
    // candidatas.push("conflicted")`, e `conflicted` é o PIOR estado do lattice.
    // O docstring de `quality.ts` diz o que ele significa: duas fontes governadas
    // afirmam coisas diferentes e nenhuma agregação resolve sem decisão humana.
    //
    // Aqui existe decisão humana, ela tem nome, e foi aplicada. O arquivo
    // operacional está escolhido.
    const drive = new FakeDrive({ files: dois })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.snapshot.conflicts).toEqual([])
    // `degraded`: condição auditável, não número em disputa. Estado que o lattice
    // já tinha — nenhum estado novo foi criado e o lattice não foi alterado.
    expect(r.snapshot.quality_status).toBe("degraded")
    // O aviso sobrevive, e é ELE que carrega a informação.
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §10/§11 — MIME e aba
// ═════════════════════════════════════════════════════════════════════════════

describe("§10 — MIME incompatível não é aceito nem escondido", () => {
  it("só XLSX homônimo → DATA_NOT_AVAILABLE com o candidato registrado", async () => {
    const drive = new FakeDrive({
      files: [arquivo("x1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK, XLSX_MIME)],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("data_not_available")
    if (r.status !== "data_not_available") throw new Error("estado errado")
    expect(r.source_quality).toContain("CANDIDATE_WITH_INCOMPATIBLE_MIME")
    // Registrado, não descartado em silêncio: alguém exportou e devolveu.
    expect(r.candidates.map((c) => c.mime_type)).toEqual([XLSX_MIME])
  })

  it("Sheets + XLSX homônimos → usa o Sheets e registra o outro", async () => {
    const drive = new FakeDrive({
      files: [
        arquivo("x1", "Novos Alunos - Agosto", "2026-08-19T23:00:00Z", GRADE_OK, XLSX_MIME),
        arquivo("s1", "Novos Alunos - Agosto", "2026-08-19T10:00:00Z", GRADE_OK),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    // O XLSX é mais recente e NÃO ganha: não é a fonte.
    expect(r.selection.selected_file_id).toBe("s1")
    expect(r.source_quality).toContain("CANDIDATE_WITH_INCOMPATIBLE_MIME")
    // E não conta como duplicidade: só um disputou de fato.
    expect(r.selection.duplicate).toBe(false)
    expect(r.selection.eligible_count).toBe(1)
  })
})

describe("§11 — a aba oficial, nunca a primeira", () => {
  it("aba ausente → INVALID_SOURCE, sem cair para outra aba", async () => {
    const drive = new FakeDrive({
      files: [
        {
          meta: { file_id: "f1", name: "Novos Alunos - Agosto", mime_type: SHEETS_MIME, modified_time: "2026-08-19T13:39:00Z" },
          sheets: { Resumo: GRADE_OK, Outra: GRADE_OK },
        },
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SHEET_NOT_FOUND")
    expect(r.detail).toContain("Resumo")
  })

  it("a aba é sempre pedida por nome", async () => {
    const drive = new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK)] })
    await provider(drive).load({ period: "2026-08" })
    expect(drive.abasConsultadas).toEqual([{ file_id: "f1", sheet: "Status Contratos" }])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §44/§46 — vazio disponível × indisponível × erro
// ═════════════════════════════════════════════════════════════════════════════

describe("§44/§46 — os três zeros são coisas diferentes", () => {
  it("§44 — aba válida com zero contratos → AVAILABLE_EMPTY", async () => {
    const drive = new FakeDrive({
      files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", { headers: HEADER_AGOSTO, rows: [] })],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("available_empty")
    if (r.status !== "available_empty") throw new Error("estado errado")
    // Disponível: tem snapshot, procedência e hash. É "não vendeu", não "não sei".
    expect(r.row_count).toBe(0)
    expect(r.snapshot.record_count).toBe(0)
    expect(r.provenance.content_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("linha em branco no rodapé não conta como contrato", async () => {
    const vazia = new Array(HEADER_AGOSTO.length).fill("")
    const drive = new FakeDrive({
      files: [
        arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", {
          headers: HEADER_AGOSTO,
          rows: [...GRADE_OK.rows, vazia, vazia],
        }),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.row_count).toBe(1)
    // E não vira `rows_skipped`: não foi uma linha que falhamos em ler.
    expect(r.snapshot.rows_skipped).toBe(0)
  })

  it("§46 — falha de API → SOURCE_ERROR, nunca DATA_NOT_AVAILABLE", async () => {
    const drive = new FakeDrive({ files: [], listThrows: "quota exceeded" })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("source_error")
    if (r.status !== "source_error") throw new Error("estado errado")
    expect(r.detail).toContain("quota exceeded")
    expect(JSON.stringify(r)).not.toContain('"rows"')
  })

  it("§46 — falha ao ler a aba também é SOURCE_ERROR", async () => {
    const drive = new FakeDrive({
      files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK)],
      readThrows: "permission denied",
    })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("source_error")
  })

  it("período inválido é erro NOSSO, não ausência de dado do Lucas", async () => {
    const drive = new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE_OK)] })
    const r = await provider(drive).load({ period: "2026-8" })
    // `data_not_available` aqui culparia a fonte por um bug de chamada.
    expect(r.status).toBe("source_error")
    if (r.status !== "source_error") throw new Error("estado errado")
    expect(r.detail).toContain("domínio governado")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §5 — continuidade sob duplicidade: o processamento inteiro roda
// ═════════════════════════════════════════════════════════════════════════════

describe("§5 — duplicidade não bloqueia NADA a jusante", () => {
  // População acima do mínimo governado de contratos, para ISOLAR a variável: com 2
  // linhas o Detector A devolve `insufficient` por população pequena, e o teste não
  // conseguiria distinguir isso do efeito da duplicidade.
  const doze = Array.from({ length: 12 }, (_, i) =>
    linhaAgosto({
      venc: "27/08/2026",
      cpf: cpfSintetico(500 + i),
      unidade: "Meriti",
      parcelas: 20,
      ticket: "R$ 8.151,60",
      status: "E",
    }),
  )
  // Uma abaixo do piso governado de R$ 1.499,99, para o low-ticket ter o que achar.
  const comBaixo = [
    ...doze,
    linhaAgosto({ venc: "28/08/2026", cpf: cpfSintetico(600), unidade: "Meriti", parcelas: 3, ticket: "R$ 1.200,00", status: "P" }),
  ]

  const dois = [
    arquivo("bbb", "Novos Alunos - Agosto", "2026-08-19T10:00:00Z", {
      headers: HEADER_AGOSTO,
      rows: doze,
    }),
    arquivo("aaa", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", {
      headers: HEADER_AGOSTO,
      rows: comBaixo,
    }),
  ]

  it("snapshot é produzido, A roda, low-ticket roda, e o aviso sobrevive", async () => {
    const r = await provider(new FakeDrive({ files: dois })).load({ period: "2026-08" })

    // 1. AVAILABLE, não bloqueado.
    expect(r.status).toBe("available")
    if (r.status !== "available") throw new Error("estado errado")

    // 2. Seleção determinística: o de `modifiedTime` maior, que tem 2 linhas.
    expect(r.selection.selected_file_id).toBe("aaa")
    expect(r.selection.selection_rule).toBe("LATEST_MODIFIED_THEN_STABLE_FILE_ID")
    expect(r.row_count).toBe(13)

    // 3. O aviso está presente e os candidatos ficam auditáveis.
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
    expect(r.selection.candidate_count).toBe(2)
    expect(r.selection.candidates.map((c) => c.file_id).sort()).toEqual(["aaa", "bbb"])

    // 4. Snapshot produzido, sem Conflict, degradado e não conflitado.
    expect(r.snapshot.snapshot_id).toMatch(/^snap_[a-f0-9]{16}$/)
    expect(r.snapshot.conflicts).toEqual([])
    expect(r.snapshot.quality_status).toBe("degraded")

    const entrada = { capture: r, stance: "current" as const, detected_at: "2026-08-19T18:00:00.000Z" }

    // 5. Detector A roda de verdade e produz população.
    // Config de PRODUÇÃO, derivada do artefato governado — não um objeto de teste.
    const a = detectInstallmentConcentration(
      toInstallmentInput(entrada),
      buildProductionDetectorConfig(),
    )
    expect(a.summary.population.total_records).toBe(13)
    // E a qualidade do detector é `degraded`, não `conflicted`: com o Conflict
    // antigo, `if (s.conflicts.length > 0)` a empurraria para o pior estado do
    // lattice e todo Event do mês herdaria "número em disputa".
    expect(a.summary.quality_status).toBe("degraded")

    // 6. Low-ticket roda de verdade e encontra o contrato abaixo do piso.
    const lt = detectLowTicketContracts(toLowTicketInput(entrada))
    expect(lt.summary.total_records).toBe(13)
    expect(lt.summary.below_floor).toBe(1)
    expect(lt.summary.quality_status).toBe("degraded")
  })

  it("o aviso viaja na captura, não só num log", async () => {
    const r = await provider(new FakeDrive({ files: dois })).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    // Serializável e auditável depois: quem lê a captura meses adiante descobre
    // que houve duplicidade e qual arquivo foi usado.
    const serial = JSON.stringify(r)
    expect(serial).toContain("DUPLICATE_SOURCE_WARNING")
    expect(serial).toContain("LATEST_MODIFIED_THEN_STABLE_FILE_ID")
    expect(serial).toContain("bbb")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.11c — o instante manda, nunca a string
//
// O gate final encontrou o defeito: o comparador ordenava `modified_time`
// lexicograficamente. A Fase 2.11a já havia corrigido a MESMA classe de erro no
// guard de `observed_at` do provider e deixou este passar — dois caminhos com a
// mesma pergunta e respostas diferentes.
//
// Estes testes existem para que a correção não regrida, e o primeiro deles afirma
// o defeito diretamente: se alguém voltar a comparar string, ele falha.
// ═════════════════════════════════════════════════════════════════════════════

describe("2.11c — comparação por instante parseado", () => {
  const meta = (file_id: string, modified_time: string) => ({
    file_id,
    name: "Novos Alunos - Agosto",
    mime_type: SHEETS_MIME,
    modified_time,
  })

  const escolher = (cs: readonly ReturnType<typeof meta>[]) =>
    selectMonthlyFile(cs, "Novos Alunos - Agosto")

  it("a comparação de STRING é de fato errada — o defeito, demonstrado", () => {
    // A premissa dos dois testes seguintes. Na posição 19 a comparação encontra
    // `Z` (0x5A) contra `.` (0x2E).
    expect("2026-08-19T18:00:00Z" > "2026-08-19T18:00:00.100Z").toBe(true)
    expect(Date.parse("2026-08-19T18:00:00Z") > Date.parse("2026-08-19T18:00:00.100Z")).toBe(false)
    // E o mesmo instante com precisão diferente NÃO é textualmente igual, então
    // nunca chegava ao desempate governado por `file_id`. Por variáveis porque o
    // compilador — com razão — recusa comparar dois literais distintos.
    const semFracao: string = "2026-08-19T18:00:00Z"
    const comFracao: string = "2026-08-19T18:00:00.000Z"
    expect(semFracao === comFracao).toBe(false)
    expect(Date.parse(semFracao) === Date.parse(comFracao)).toBe(true)
  })

  it("B — fração POSTERIOR vence, independente do file_id", () => {
    // Com comparação de string, `...00Z` venceria e a ingestão leria o arquivo
    // ANTIGO — silenciosamente, porque o guard do provider só valida o já escolhido.
    //
    // `file_id` escolhido de propósito nas duas direções: se o desempate estivesse
    // decidindo, um dos dois casos daria o vencedor errado.
    const a = escolher([meta("aaa", "2026-08-19T18:00:00Z"), meta("zzz", "2026-08-19T18:00:00.100Z")])
    if (a.outcome !== "selected") throw new Error("esperava seleção")
    expect(a.selection.selected_file_id).toBe("zzz")
    expect(a.selection.selected_modified_time).toBe("2026-08-19T18:00:00.100Z")

    const b = escolher([meta("zzz", "2026-08-19T18:00:00Z"), meta("aaa", "2026-08-19T18:00:00.100Z")])
    if (b.outcome !== "selected") throw new Error("esperava seleção")
    expect(b.selection.selected_file_id).toBe("aaa")
  })

  it("A — instante EQUIVALENTE com precisão diferente cai no desempate por file_id", () => {
    // `...00Z` e `...00.000Z` são o mesmo instante. A direção governada é o MENOR
    // `file_id` em ordem de code unit, e ela é preservada exatamente.
    const r = escolher([meta("zzz", "2026-08-19T18:00:00Z"), meta("aaa", "2026-08-19T18:00:00.000Z")])
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    expect(r.selection.selected_file_id).toBe("aaa")

    // Invertendo o texto entre os ids: o vencedor continua sendo `aaa`, o que prova
    // que quem decidiu foi o `file_id` e não a forma do timestamp.
    const inv = escolher([meta("zzz", "2026-08-19T18:00:00.000Z"), meta("aaa", "2026-08-19T18:00:00Z")])
    if (inv.outcome !== "selected") throw new Error("esperava seleção")
    expect(inv.selection.selected_file_id).toBe("aaa")
  })

  it("C — diferença cronológica normal continua funcionando", () => {
    const r = escolher([meta("aaa", "2026-08-19T18:00:00Z"), meta("bbb", "2026-08-19T18:01:00Z")])
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    expect(r.selection.selected_file_id).toBe("bbb")
  })

  it("fuso explícito é comparado como instante, não como texto", () => {
    // `17:30-01:00` é 18:30Z — POSTERIOR a 18:00Z, embora a string comece com "17".
    const r = escolher([meta("aaa", "2026-08-19T18:00:00Z"), meta("bbb", "2026-08-19T17:30:00-01:00")])
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    expect(r.selection.selected_file_id).toBe("bbb")
  })

  it("o instante EXATO viaja no resultado, para não ser reparseado", () => {
    const r = escolher([meta("aaa", "2026-08-19T18:00:00.1004Z")])
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    // Segundos + nanos, não milissegundos: os 400 microssegundos sobrevivem.
    expect(r.selection.selected_modified_instant).toEqual({
      epoch_seconds: 1_787_162_400,
      nanos: 100_400_000,
    })
    // E cada candidato carrega o seu, que é o valor que a REGRA usou.
    expect(r.selection.candidates[0]?.modified_instant).toEqual({
      epoch_seconds: 1_787_162_400,
      nanos: 100_400_000,
    })
  })

  it("D — candidato elegível com tempo ILEGÍVEL recusa, sem escolher vencedor", () => {
    const r = escolher([meta("bom", "2026-08-19T18:00:00Z"), meta("ruim", "ontem à tarde")])
    expect(r.outcome).toBe("time_unparseable")
    if (r.outcome !== "time_unparseable") throw new Error("estado errado")
    // Nenhum vencedor: escolher o legível seria decidir a partir de conjunto
    // incompleto, sem que nada no resultado dissesse isso.
    expect(JSON.stringify(r)).not.toContain("selected_file_id")
    expect(r.detail.offending).toEqual([{ file_id: "ruim", modified_time: "ontem à tarde" }])
    // Os candidatos ficam auditáveis, inclusive o bom.
    expect(r.detail.candidate_count).toBe(2)
  })

  it("D — formas que `Date.parse` aceitaria e RFC3339 não", () => {
    // `Date.parse("2026-08-19")` devolve meia-noite UTC: um `modifiedTime` truncado
    // a data viraria instante plausível e o arquivo pareceria mais antigo do que é.
    for (const ruim of ["2026-08-19", "Aug 19 2026", "2026-08-19T18:00Z", "2026-08-19 18:00:00", ""]) {
      const r = escolher([meta("x", ruim)])
      expect(r.outcome, ruim).toBe("time_unparseable")
    }
  })

  it("MIME incompatível com tempo ilegível NÃO recusa — não disputa", () => {
    // Ele não participa da regra, então não pode inviabilizá-la.
    const r = selectMonthlyFile(
      [
        meta("bom", "2026-08-19T18:00:00Z"),
        { file_id: "x", name: "Novos Alunos - Agosto", mime_type: XLSX_MIME, modified_time: "lixo" },
      ],
      "Novos Alunos - Agosto",
    )
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    expect(r.selection.selected_file_id).toBe("bom")
    expect(r.selection.incompatible_mime_present).toBe(true)
  })

  it("E — TODAS as permutações com variantes de precisão escolhem o mesmo", () => {
    const base = [
      meta("ccc", "2026-08-19T18:00:00Z"),
      meta("aaa", "2026-08-19T18:00:00.000Z"),
      meta("bbb", "2026-08-19T17:59:59.999Z"),
    ]
    const permutar = <T>(xs: readonly T[]): T[][] =>
      xs.length <= 1
        ? [[...xs]]
        : xs.flatMap((x, i) => permutar([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))

    const ps = permutar(base)
    expect(ps).toHaveLength(6)
    for (const p of ps) {
      const r = escolher(p)
      if (r.outcome !== "selected") throw new Error("esperava seleção")
      // `ccc` e `aaa` empatam no instante; `aaa` ganha por file_id. `bbb` é 1 ms
      // mais antigo e perde por instante.
      expect(r.selection.selected_file_id, JSON.stringify(p.map((x) => x.file_id))).toBe("aaa")
      // A lista auditável também é estável.
      expect(r.selection.candidates.map((c) => c.file_id)).toEqual(["aaa", "ccc", "bbb"])
    }
  })

  it("§10 — a captura de produção usa ESTE comparador, não um do teste", async () => {
    // Prova de que a correção está no caminho de produção: dois arquivos em que a
    // comparação de string escolheria o errado, atravessando o provider inteiro.
    const drive = new FakeDrive({
      files: [
        arquivo("aaa", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z", { headers: HEADER_AGOSTO, rows: [] }),
        arquivo("zzz", "Novos Alunos - Agosto", "2026-08-19T13:00:00.100Z", { headers: HEADER_AGOSTO, rows: GRADE_OK.rows }),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    // Com string, `aaa` (vazio) venceria e a captura sairia AVAILABLE_EMPTY — o mês
    // pareceria sem contratos.
    expect(r.selection.selected_file_id).toBe("zzz")
    expect(r.row_count).toBe(1)
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
    expect(r.snapshot.quality_status).toBe("degraded")
    expect(r.snapshot.conflicts).toEqual([])
  })

  it("tempo ilegível pelo provider → invalid_source / SOURCE_TIME_UNPARSEABLE", async () => {
    const drive = new FakeDrive({
      files: [arquivo("f1", "Novos Alunos - Agosto", "ontem à tarde", GRADE_OK)],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SOURCE_TIME_UNPARSEABLE")
    expect(r.detail).toContain("LATEST_MODIFIED indeterminado")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.11d — timestamp malformado não entra na cronologia
//
// A 2.11c passou a comparar instantes e deixou `Date.parse` decidir a validade.
// `Date.parse` normaliza: `2026-02-30` virava 2 de março. Um candidato malformado
// entrava na comparação com um instante inventado, deslocado em DIAS, e podia ganhar
// a seleção gravando procedência falsa.
// ═════════════════════════════════════════════════════════════════════════════

describe("2.11d — validação estrita antes da seleção", () => {
  const meta = (file_id: string, modified_time: string) => ({
    file_id,
    name: "Novos Alunos - Agosto",
    mime_type: SHEETS_MIME,
    modified_time,
  })

  const escolher = (cs: readonly ReturnType<typeof meta>[]) =>
    selectMonthlyFile(cs, "Novos Alunos - Agosto")

  it("calendário inválido em candidato elegível → nenhum vencedor", () => {
    for (const ruim of [
      "2026-02-30T18:00:00Z",
      "2026-04-31T18:00:00Z",
      "2026-02-29T18:00:00Z",
      "2026-13-01T18:00:00Z",
    ]) {
      const r = escolher([meta("bom", "2026-08-19T18:00:00Z"), meta("ruim", ruim)])
      expect(r.outcome, ruim).toBe("time_unparseable")
      if (r.outcome !== "time_unparseable") throw new Error("estado errado")
      expect(r.detail.offending.map((c) => c.file_id), ruim).toEqual(["ruim"])
      expect(JSON.stringify(r), ruim).not.toContain("selected_file_id")
    }
  })

  it("hora e fuso inválidos também recusam", () => {
    for (const ruim of [
      "2026-08-19T24:00:00Z",
      "2026-08-19T23:60:00Z",
      "2026-08-19T23:59:60Z",
      "2026-08-19T18:00:00+24:00",
      "2026-08-19T18:00:00+01:60",
    ]) {
      const r = escolher([meta("bom", "2026-08-19T18:00:00Z"), meta("ruim", ruim)])
      expect(r.outcome, ruim).toBe("time_unparseable")
    }
  })

  it("o malformado NÃO ganha por normalização — o cenário do gate", () => {
    // `2026-02-30T18:00:00Z` normalizaria para 2 de março, DOIS DIAS depois do
    // candidato bom. Sob a versão anterior ele venceria, e a captura afirmaria ter
    // observado a fonte num instante que ela nunca reportou.
    const r = escolher([
      meta("bom", "2026-02-28T18:00:00Z"),
      meta("malformado", "2026-02-30T18:00:00Z"),
    ])
    expect(r.outcome).toBe("time_unparseable")
    // Não ganhou, e também não perdeu: não houve escolha nenhuma.
    expect(JSON.stringify(r)).not.toContain("selected_modified_instant_ms")
  })

  it("§13 — MIME incompatível com tempo malformado NÃO recusa", () => {
    // Preserva a decisão anterior: quem não disputa não pode inviabilizar a regra.
    const r = selectMonthlyFile(
      [
        meta("bom", "2026-08-19T18:00:00Z"),
        { file_id: "x", name: "Novos Alunos - Agosto", mime_type: XLSX_MIME, modified_time: "2026-02-30T18:00:00Z" },
      ],
      "Novos Alunos - Agosto",
    )
    if (r.outcome !== "selected") throw new Error("esperava seleção")
    expect(r.selection.selected_file_id).toBe("bom")
    expect(r.selection.incompatible_mime_present).toBe(true)
  })

  it("bissexto: 29/02 válido em 2024, inválido em 2026", () => {
    const bom = escolher([meta("a", "2024-02-29T18:00:00Z")])
    expect(bom.outcome).toBe("selected")
    const ruim = escolher([meta("a", "2026-02-29T18:00:00Z")])
    expect(ruim.outcome).toBe("time_unparseable")
  })

  it("§12 — pelo provider: malformado não produz snapshot nem evidência", async () => {
    const drive = new FakeDrive({
      files: [
        arquivo("bom", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z", GRADE_OK),
        arquivo("malformado", "Novos Alunos - Agosto", "2026-02-30T18:00:00Z", GRADE_OK),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })

    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SOURCE_TIME_UNPARSEABLE")
    expect(r.detail).toContain("malformado")
    expect(r.detail).toContain("2026-02-30T18:00:00Z")

    // Nada a jusante existe: sem snapshot, sem evidência, sem entrada de detector.
    // Procedência malformada não pode virar fonte de produção selecionada.
    const serial = JSON.stringify(r)
    expect(serial).not.toContain('"snapshot"')
    expect(serial).not.toContain('"evidence"')
    expect(serial).not.toContain('"rows"')
    expect(serial).not.toContain('"selected_file_id"')
  })

  it("§14/§20 — sub-milissegundo decide, e o file_id favorece o ERRADO", async () => {
    // O cenário exato do gate. `aaa` é cronologicamente MAIS ANTIGO (.1004) e o
    // desempate por menor `file_id` o escolheria; `zzz` é mais recente (.1009) e
    // perderia o desempate. Se a cronologia colapsar em milissegundo outra vez, os
    // dois empatam, `aaa` ganha, e a captura sai VAZIA — o mês pareceria sem
    // contratos a partir de conteúdo velho.
    const drive = new FakeDrive({
      files: [
        arquivo("aaa", "Novos Alunos - Agosto", "2026-08-19T13:00:00.1004Z", { headers: HEADER_AGOSTO, rows: [] }),
        arquivo("zzz", "Novos Alunos - Agosto", "2026-08-19T13:00:00.1009Z", GRADE_OK),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")

    // Os nanos decidiram, não o file_id.
    expect(r.selection.selected_file_id).toBe("zzz")
    expect(r.selection.selected_modified_instant.nanos).toBe(100_900_000)

    // E todo o pipeline a jusante veio de `zzz`.
    expect(r.provenance.file_id).toBe("zzz")
    expect(r.row_count).toBe(1)
    expect(r.snapshot.record_count).toBe(1)
    expect(r.evidence.rowEvidence).toHaveLength(1)
    expect(r.evidence.rowEvidence[0]?.locator.row_key).toBe(
      rowKeyFor("zzz", "Status Contratos", 1),
    )

    const entrada = { capture: r, stance: "current" as const, detected_at: "2026-08-19T18:00:00.000Z" }
    const a = detectInstallmentConcentration(toInstallmentInput(entrada), buildProductionDetectorConfig())
    expect(a.summary.population.total_records).toBe(1)
    const lt = detectLowTicketContracts(toLowTicketInput(entrada))
    expect(lt.summary.total_records).toBe(1)

    // Duplicidade preservada.
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
    expect(r.snapshot.quality_status).toBe("degraded")
    expect(r.snapshot.conflicts).toEqual([])
  })

  it("§27 F — 10 dígitos de fração recusam a captura, sem truncar", async () => {
    const drive = new FakeDrive({
      files: [
        arquivo("bom", "Novos Alunos - Agosto", "2026-08-19T13:00:00.100Z", GRADE_OK),
        arquivo("preciso", "Novos Alunos - Agosto", "2026-08-19T13:00:00.1234567891Z", GRADE_OK),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SOURCE_TIME_UNPARSEABLE")
    expect(r.detail).toContain("preciso")
  })

  it("§21 — permutações com variantes de sub-milissegundo", () => {
    const base = [
      meta("aaa", "2026-08-19T18:00:00.1004Z"),
      meta("bbb", "2026-08-19T18:00:00.1009Z"),
      meta("ccc", "2026-08-19T18:00:00.100900000Z"),
    ]
    const permutar = <T>(xs: readonly T[]): T[][] =>
      xs.length <= 1
        ? [[...xs]]
        : xs.flatMap((x, i) => permutar([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
    const ps = permutar(base)
    expect(ps).toHaveLength(6)
    for (const p of ps) {
      const r = escolher(p)
      if (r.outcome !== "selected") throw new Error("esperava seleção")
      // `bbb` e `ccc` são o MESMO instante (.1009 == .100900000); `bbb` ganha por
      // file_id. `aaa` é anterior e perde por nanos.
      expect(r.selection.selected_file_id, JSON.stringify(p.map((x) => x.file_id))).toBe("bbb")
      expect(r.selection.candidates.map((c) => c.file_id)).toEqual(["bbb", "ccc", "aaa"])
    }
  })

  it("§11 — a correção da 2.11c segue válida: fração posterior ganha", async () => {
    // Regressão cruzada: a validação estrita não pode ter quebrado a comparação por
    // instante que a 2.11c introduziu.
    const drive = new FakeDrive({
      files: [
        arquivo("aaa", "Novos Alunos - Agosto", "2026-08-19T13:00:00Z", { headers: HEADER_AGOSTO, rows: [] }),
        arquivo("zzz", "Novos Alunos - Agosto", "2026-08-19T13:00:00.100Z", GRADE_OK),
      ],
    })
    const r = await provider(drive).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    expect(r.selection.selected_file_id).toBe("zzz")
    expect(r.row_count).toBe(1)
    expect(r.source_quality).toContain("DUPLICATE_SOURCE_WARNING")
    expect(r.snapshot.quality_status).toBe("degraded")
    expect(r.snapshot.conflicts).toEqual([])
  })
})
