import { describe, expect, it } from "vitest"
import { assertNoPII, scanForPII } from "../src/pii"

describe("scanForPII — detecção por valor", () => {
  it("detecta CPF pontuado", () => {
    const found = scanForPII({ obs: "documento 123.456.789-09 conferido" })
    expect(found.map((f) => f.kind)).toContain("cpf")
  })

  it("detecta CPF sem pontuação", () => {
    const found = scanForPII({ ref: "12345678909" })
    expect(found.map((f) => f.kind)).toContain("cpf")
  })

  it("detecta telefone brasileiro com DDD", () => {
    const found = scanForPII({ contato: "(11) 98765-4321" })
    expect(found.map((f) => f.kind)).toContain("phone")
  })

  it("detecta e-mail", () => {
    const found = scanForPII({ nota: "falar com stefano.leta@creditum.com.br" })
    expect(found.map((f) => f.kind)).toContain("email")
  })

  it("varre dentro de arrays e objetos aninhados", () => {
    const found = scanForPII({ casos: [{ detalhe: { obs: "111.222.333-96" } }] })
    expect(found).toHaveLength(1)
    expect(found[0]?.path).toBe("$.casos[0].detalhe.obs")
  })
})

describe("scanForPII — detecção por chave", () => {
  it("recusa campos proibidos mesmo com valor vazio", () => {
    const found = scanForPII({ nome: "", telefone: null, cpf: undefined })
    expect(found.filter((f) => f.kind === "pii_field_name")).toHaveLength(3)
  })

  it("é insensível a caixa no nome do campo", () => {
    const found = scanForPII({ Nome: "x", EMAIL: "y" })
    expect(found.filter((f) => f.kind === "pii_field_name")).toHaveLength(2)
  })
})

describe("scanForPII — falsos positivos que quebrariam o sistema", () => {
  it("NÃO acusa content_hash sha256, mesmo com 11 dígitos seguidos", () => {
    // Este hash contém "12345678909" embutido. Sem a isenção de sha256 o
    // gateway recusaria todo snapshot legítimo.
    const hash = "ab12345678909cdefab12345678909cdefab12345678909cdefab1234567890c"
    expect(hash).toHaveLength(64)
    expect(scanForPII({ content_hash: hash })).toHaveLength(0)
  })

  it("NÃO acusa subject_ref pseudônimo", () => {
    expect(scanForPII({ subject_ref: "subj_9f2a4c6e8b0d1357" })).toHaveLength(0)
  })

  it("NÃO acusa valores monetários em centavos", () => {
    expect(scanForPII({ amount_cents: 8292057, ticket_cents: 592290 })).toHaveLength(0)
  })

  it("NÃO acusa datas ISO", () => {
    expect(scanForPII({ observed_at: "2026-08-16T09:00:00.000Z" })).toHaveLength(0)
  })

  it("NÃO acusa nome canônico de unidade", () => {
    expect(scanForPII({ unit: "São José do Rio Preto" })).toHaveLength(0)
  })

  it("continua acusando as variantes que só existem para pessoa", () => {
    const found = scanForPII({ nome: "x", full_name: "y", student_name: "z", aluno: "w" })
    expect(found.filter((f) => f.kind === "pii_field_name")).toHaveLength(4)
  })
})

describe("a regra do `name` — permissão por contexto, não por nome de chave", () => {
  it("aceita `name` técnico dentro de observed_metric", () => {
    const found = scanForPII({
      observed_metric: { name: "share_contratos_acima_19_parcelas", data_class: "calculated" },
    })
    expect(found).toEqual([])
  })

  it("aceita `name` técnico dentro de metrics[], preservando o contexto pelo array", () => {
    const found = scanForPII({ fact: { metrics: [{ name: "volume_contratado" }] } })
    expect(found).toEqual([])
  })

  it("BLOQUEIA nome de pessoa mesmo em caminho técnico", () => {
    // Este é o furo que uma liberação global da chave `name` deixaria passar
    // direto para o modelo.
    const found = scanForPII({ observed_metric: { name: "Maria da Silva" } })
    expect(found.map((f) => f.kind)).toEqual(["name_not_technical"])
  })

  it("BLOQUEIA `name` em contexto não previsto pelos contratos", () => {
    const found = scanForPII({ cliente: { name: "algum_valor_tecnico" } })
    expect(found.map((f) => f.kind)).toEqual(["name_out_of_context"])
  })

  it("BLOQUEIA `name` solto na raiz", () => {
    const found = scanForPII({ name: "share_contratos" })
    expect(found.map((f) => f.kind)).toEqual(["name_out_of_context"])
  })

  it("BLOQUEIA valor com espaço, acento ou maiúscula em caminho técnico", () => {
    for (const valor of ["Maria da Silva", "João", "Share Contratos", "nome com espaço"]) {
      const found = scanForPII({ metric: { name: valor } })
      expect(found.map((f) => f.kind), valor).toEqual(["name_not_technical"])
    }
  })
})

describe("scanForPII — o achado não pode vazar o dado", () => {
  it("nunca inclui o valor detectado no relatório", () => {
    const cpf = "123.456.789-09"
    const found = scanForPII({ obs: cpf })
    for (const f of found) {
      expect(f.hint).not.toContain(cpf)
      expect(f.hint).not.toContain("123")
      expect(f.path).not.toContain("123")
    }
  })
})

describe("assertNoPII", () => {
  it("passa em estrutura limpa", () => {
    expect(() => assertNoPII({ sales_count: 14 }, "teste")).not.toThrow()
  })

  it("aborta e nomeia o caminho", () => {
    expect(() => assertNoPII({ dados: { email: "a@b.com" } }, "teste")).toThrow(
      /\$\.dados\.email/,
    )
  })
})
