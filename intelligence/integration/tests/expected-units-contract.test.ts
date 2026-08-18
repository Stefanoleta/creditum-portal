/**
 * `expected_units` tem UMA definição pública. Este arquivo prova isso.
 *
 * ─── O defeito que ele impede ─────────────────────────────────────────────────
 *
 * `integration/src/ports.ts` declarava a própria `ExpectedUnitsProvider`:
 *
 *   forPeriod(period_start: string, period_end: string): Promise<number | null>
 *
 * Consulta por faixa de datas, sem `dataset_id`, devolvendo um contador, com
 * `null` para indisponível. Quatro divergências do contrato governado, cada uma
 * capaz de produzir um denominador que ninguém consegue auditar.
 *
 * A interface não tinha implementação nem consumidor — e era isso que a tornava
 * perigosa. Nenhum teste a exercitava, então a divergência era invisível. Um
 * adaptador futuro poderia satisfazê-la inteira e entregar exatamente o que a Fase
 * 2.8 existe para proibir.
 *
 * ─── Por que as provas aqui são de TIPO ───────────────────────────────────────
 *
 * Um teste que procura o nome no fonte não resolve: o problema não era o nome, era
 * a forma. Duas interfaces com o mesmo nome e semânticas diferentes passariam por
 * qualquer grep. O que precisa ser provado é identidade de tipo, e isso o
 * compilador faz.
 *
 * As asserções de tipo abaixo falham em `tsc`, não em runtime. Os `it()` existem
 * para que a suíte registre a intenção e para as verificações que só o runtime
 * alcança.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { FileExpectedUnitsProvider } from "../../detectors/src/expected-units-file-provider"
import { GOVERNED_UNIT_CATALOG } from "../../detectors/src/unit-catalog"
import type {
  ExpectedUnitsLookup as LookupCanonico,
  ExpectedUnitsProvider as ProviderCanonico,
  ExpectedUnitsQuery as QueryCanonica,
} from "../../detectors/src/expected-units"
import type {
  ExpectedUnitsLookup as LookupDaIntegracao,
  ExpectedUnitsProvider as ProviderDaIntegracao,
  ExpectedUnitsQuery as QueryDaIntegracao,
} from "../src/ports"

// ═════════════════════════════════════════════════════════════════════════════
// §8 — identidade de tipo, nos DOIS sentidos
//
// Atribuição mútua é o que distingue "reexport do mesmo tipo" de "dois tipos
// estruturalmente compatíveis". Um provider que devolvesse `number | null` falharia
// na primeira direção; um que aceitasse query sem `dataset_id` falharia na segunda.
// ═════════════════════════════════════════════════════════════════════════════

/** Aceita `never` só para provar mútua assinabilidade sem construir valor. */
type Identico<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

const PROVIDER_E_O_MESMO: Identico<ProviderCanonico, ProviderDaIntegracao> = true
const QUERY_E_A_MESMA: Identico<QueryCanonica, QueryDaIntegracao> = true
const LOOKUP_E_O_MESMO: Identico<LookupCanonico, LookupDaIntegracao> = true

describe("§8/§10 A — a integração reexporta o contrato canônico", () => {
  it("provider, query e lookup são o MESMO tipo, não tipos parecidos", () => {
    // Se qualquer um divergisse, a constante acima não compilaria: `Identico`
    // devolveria `false` e `true` não é assinável a `false`.
    expect(PROVIDER_E_O_MESMO).toBe(true)
    expect(QUERY_E_A_MESMA).toBe(true)
    expect(LOOKUP_E_O_MESMO).toBe(true)
  })

  it("um provider canônico satisfaz a porta da integração", () => {
    const canonico = new FileExpectedUnitsProvider(
      new URL("./fixtures/expected-units/", import.meta.url).pathname,
      GOVERNED_UNIT_CATALOG,
    )
    // Prova de tipo: atribuição direta, sem cast.
    const comoPorta: ProviderDaIntegracao = canonico
    const comoCanonico: ProviderCanonico = comoPorta
    expect(typeof comoCanonico.getExpectedUnits).toBe("function")
  })

  it("`integration/src/ports.ts` NÃO declara a própria interface", () => {
    const fonte = readFileSync(new URL("../src/ports.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    // Com comentários removidos: só o reexport sobrevive, nunca uma declaração.
    expect(fonte).not.toMatch(/interface\s+ExpectedUnits\w*/)
    expect(fonte).not.toMatch(/type\s+ExpectedUnits\w*\s*=/)
    expect(fonte).toMatch(/export type \{[\s\S]*?\} from "\.\.\/\.\.\/detectors\/src\/expected-units"/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §4/§10 B — `dataset_id` é obrigatório
// ═════════════════════════════════════════════════════════════════════════════

describe("§4/§10 B — `dataset_id` é obrigatório na query pública", () => {
  it("a query exige os dois campos", () => {
    const completa: QueryDaIntegracao = { period: "2026-08", dataset_id: "ds_vendas_mensal" }
    expect(Object.keys(completa).sort()).toEqual(["dataset_id", "period"])
  })

  it("query sem `dataset_id` não satisfaz o tipo", () => {
    // A prova é do compilador. `Omit<Q, "dataset_id">` não é assinável a `Q`, e
    // este teste registra a intenção junto da asserção de tipo abaixo.
    type SemDataset = Omit<QueryDaIntegracao, "dataset_id">
    const naoSatisfaz: Identico<SemDataset, QueryDaIntegracao> = false
    expect(naoSatisfaz).toBe(false)
  })

  it("não existe consulta de expected_units por FAIXA DE DATAS", () => {
    const fonte = readFileSync(new URL("../src/ports.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    // `period_start`/`period_end` são LEGÍTIMOS aqui — `RawBatch` os declara e o
    // `SourceAdapter` lê por faixa, que é o que uma fonte bruta de fato faz. O
    // que não pode existir é uma consulta de EXPECTATIVA por faixa.
    for (const proibido of ["forPeriod", "date_from", "date_to"]) {
      expect(fonte, proibido).not.toContain(proibido)
    }
    // E nenhum membro de expected_units aceita faixa.
    expect(fonte).not.toMatch(/Expected\w*[\s\S]{0,200}period_start/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §10 C/D — nem contador, nem `null`
// ═════════════════════════════════════════════════════════════════════════════

describe("§10 C/D — o provider não devolve contador nem `null`", () => {
  const provider = new FileExpectedUnitsProvider(
    new URL("./fixtures/expected-units/", import.meta.url).pathname,
    GOVERNED_UNIT_CATALOG,
  )

  it("C — `number` não satisfaz o retorno", () => {
    type Retorno = ReturnType<ProviderDaIntegracao["getExpectedUnits"]>
    const numeroNaoServe: Identico<Retorno, number> = false
    expect(numeroNaoServe).toBe(false)
  })

  it("D — `null` não satisfaz o retorno", () => {
    type Retorno = ReturnType<ProviderDaIntegracao["getExpectedUnits"]>
    const nuloNaoServe: Identico<Retorno, null> = false
    expect(nuloNaoServe).toBe(false)
    // Em runtime: nenhuma das duas respostas possíveis é nula.
    for (const q of [
      { period: "2026-08", dataset_id: "ds_vendas_mensal" },
      { period: "2027-01", dataset_id: "ds_inexistente" },
    ]) {
      const r = provider.getExpectedUnits(q)
      expect(r, JSON.stringify(q)).not.toBeNull()
      expect(typeof r).toBe("object")
    }
  })

  it("o retorno é sempre um dos dois estados FECHADOS", () => {
    const disponivel = provider.getExpectedUnits({
      period: "2026-08",
      dataset_id: "ds_vendas_mensal",
    })
    const ausente = provider.getExpectedUnits({
      period: "2027-01",
      dataset_id: "ds_vendas_mensal",
    })
    expect(["available", "DATA_NOT_AVAILABLE"]).toContain(disponivel.status)
    expect(["available", "DATA_NOT_AVAILABLE"]).toContain(ausente.status)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §10 E/F — o que cada ramo carrega
// ═════════════════════════════════════════════════════════════════════════════

describe("§10 E/F — membership e procedência no ramo disponível; discriminante no outro", () => {
  const provider = new FileExpectedUnitsProvider(
    new URL("./fixtures/expected-units/", import.meta.url).pathname,
    GOVERNED_UNIT_CATALOG,
  )

  it("E — AVAILABLE carrega membership por `unit_id` e procedência", () => {
    const r = provider.getExpectedUnits({ period: "2026-08", dataset_id: "ds_vendas_mensal" })
    if (r.status !== "available") throw new Error("fixture ausente")
    // Não é um contador: são identidades governadas.
    expect(r.membership.unit_ids.length).toBeGreaterThan(0)
    for (const id of r.membership.unit_ids) expect(id).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
    expect(r.membership.provenance.source_system.length).toBeGreaterThan(0)
    expect(r.membership.provenance.source_version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(r.membership.provenance.content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(r.membership.membership_id).toMatch(/^exp_[a-f0-9]{16}$/)
    // E period/dataset viajam com a membership.
    expect(r.membership.period).toBe("2026-08")
    expect(r.membership.dataset_id).toBe("ds_vendas_mensal")
  })

  it("F — DATA_NOT_AVAILABLE permanece discriminado, sem número", () => {
    const r = provider.getExpectedUnits({ period: "2027-01", dataset_id: "ds_vendas_mensal" })
    if (r.status !== "DATA_NOT_AVAILABLE") throw new Error("esperava ausência")
    // O ramo do PROVIDER carrega `detail`. A razão FECHADA
    // (`EXPECTED_UNITS_DATA_NOT_AVAILABLE`) é do `CoverageEvaluation`, um nível
    // acima — são camadas diferentes e cada uma diz o que lhe cabe.
    expect(r.detail.length).toBeGreaterThan(0)
    expect(Object.keys(r).sort()).toEqual(["dataset_id", "detail", "period", "status"])
    expect(JSON.stringify(r)).not.toContain("unit_ids")
    expect(JSON.stringify(r)).not.toContain("expected_count")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §10 G — o harness de produção usa o canônico
// ═════════════════════════════════════════════════════════════════════════════

describe("§10 G — o harness de produção consome o provider canônico", () => {
  it("importa de `detectors/src/expected-units-file-provider`, não de uma porta paralela", () => {
    const fonte = readFileSync(
      new URL("./production-config-e2e.test.ts", import.meta.url),
      "utf8",
    )
    expect(fonte).toContain('from "../../detectors/src/expected-units-file-provider"')
    // E não constrói provider a partir da porta da integração.
    expect(fonte).not.toMatch(/forPeriod\s*\(/)
  })

  it("§9 — não existe segundo contrato de denominador em nenhum fonte", () => {
    const fontes = [
      "../src/ports.ts",
      "../../detectors/src/expected-units.ts",
      "../../detectors/src/coverage-evaluation.ts",
    ] as const
    for (const f of fontes) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
      // Nenhum contrato devolvendo contador ou nulo para expectativa.
      expect(src, f).not.toMatch(/expected\w*\s*:\s*Promise<number/)
      expect(src, f).not.toMatch(/forPeriod/)
    }
  })
})
