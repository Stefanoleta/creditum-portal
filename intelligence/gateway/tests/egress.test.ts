/**
 * Fronteiras de PII nos quatro sentidos.
 *
 * O ponto do §12.1 que uma verificação só de saída não cobre: PII precisa ser
 * barrada ANTES de entrar no contexto do modelo, não só depois que ele responde.
 */

import { describe, expect, it } from "vitest"
import { PIIEgressError, guardEgress, inspectEgress, redactForLog } from "../src/egress"
import type { EgressChannel } from "../src/egress"

const CANAIS: EgressChannel[] = ["to_model", "from_model", "memory", "log"]

describe("guardEgress — os quatro canais falham fechado", () => {
  for (const canal of CANAIS) {
    it(`bloqueia CPF no canal "${canal}"`, () => {
      expect(() => {
        guardEgress({ obs: "123.456.789-09" }, canal)
      }).toThrowError(PIIEgressError)
    })
  }

  it("bloqueia conteúdo ENTRANDO no modelo, não só saindo", () => {
    const promptMontado = {
      contexto: "análise de agosto",
      casos: [{ detalhe: "aluno joao@escola.com.br pediu renegociação" }],
    }
    expect(() => {
      guardEgress(promptMontado, "to_model")
    }).toThrowError(/to_model/)
  })

  it("bloqueia escrita de memória que reteria PII entre sessões", () => {
    expect(() => {
      guardEgress({ aprendizado: "cliente do telefone (11) 98765-4321 sempre atrasa" }, "memory")
    }).toThrowError(/memory/)
  })

  it("o erro nomeia canal e caminho, nunca o valor", () => {
    try {
      guardEgress({ dados: { obs: "111.222.333-96" } }, "to_model")
      expect.unreachable("deveria ter levantado")
    } catch (e) {
      const err = e as PIIEgressError
      expect(err.channel).toBe("to_model")
      expect(err.findings[0]?.path).toBe("$.dados.obs")
      expect(err.message).not.toContain("111")
    }
  })

  it("deixa passar carga limpa", () => {
    expect(() => {
      guardEgress({ sales_count: 14, subject_ref: "subj_9f2a4c6e8b0d1357" }, "to_model")
    }).not.toThrow()
  })
})

describe("inspectEgress — para o ledger registrar o bloqueio", () => {
  it("relata sem levantar", () => {
    const r = inspectEgress({ email: "x@y.com" }, "from_model")
    expect(r.blocked).toBe(true)
    expect(r.channel).toBe("from_model")
    expect(r.findings.length).toBeGreaterThan(0)
  })

  it("carga limpa não é bloqueada", () => {
    expect(inspectEgress({ sales_count: 14 }, "log").blocked).toBe(false)
  })
})

describe("redactForLog", () => {
  it("redige CPF, telefone e e-mail preservando o resto da mensagem", () => {
    const saida = redactForLog({
      obs: "contato 123.456.789-09 via joao@escola.com.br em agosto",
    }) as { obs: string }

    expect(saida.obs).toContain("em agosto")
    expect(saida.obs).not.toContain("123.456.789-09")
    expect(saida.obs).not.toContain("joao@escola.com.br")
  })

  it("descarta o valor e renomeia a chave proibida, para a cópia passar pela própria barreira", () => {
    const saida = redactForLog({ cpf: "qualquer coisa", nome: "Maria" }) as Record<string, string>

    expect(saida["cpf"]).toBeUndefined()
    expect(saida["nome"]).toBeUndefined()
    expect(saida["cpf_redacted"]).toBe("[REDIGIDO]")
    expect(saida["nome_redacted"]).toBe("[REDIGIDO]")
  })

  it("preserva `name` técnico e redige nome de pessoa em caminho técnico", () => {
    const saida = redactForLog({
      observed_metric: { name: "ticket_medio" },
      reference_metric: { name: "Maria da Silva" },
    }) as Record<string, Record<string, string>>

    expect(saida["observed_metric"]?.["name"]).toBe("ticket_medio")
    expect(saida["reference_metric"]?.["name"]).toBeUndefined()
    expect(saida["reference_metric"]?.["name_redacted"]).toBe("[REDIGIDO]")
  })

  it("preserva hash e pseudônimo", () => {
    const hash = "a".repeat(64)
    const saida = redactForLog({ content_hash: hash, subject_ref: "subj_9f2a4c6e8b0d1357" }) as Record<
      string,
      string
    >
    expect(saida["content_hash"]).toBe(hash)
    expect(saida["subject_ref"]).toBe("subj_9f2a4c6e8b0d1357")
  })

  it("a saída redigida passa pela própria barreira — redação com furo não vira log", () => {
    expect(() => redactForLog({ a: "123.456.789-09", b: { c: "x@y.com" } })).not.toThrow()
  })

  it("aguenta referência circular sem estourar a pilha", () => {
    const circular: Record<string, unknown> = { sales_count: 14 }
    circular["self"] = circular
    expect(() => redactForLog(circular)).not.toThrow()
  })
})

describe("redactForLog — nenhum nome gerado sobrescreve outro", () => {
  // Nome gerado sobrescrevendo chave existente fazia o log perder uma entrada em
  // silêncio, e o guard não reclamava porque o valor que sobrescreve é benigno.
  // Numa trilha de auditoria, perder entrada sem aviso é a pior falha possível.

  it("`cpf` + `cpf_redacted` preexistente: as duas entradas sobrevivem", () => {
    const saida = redactForLog({ cpf: "123.456.789-09", cpf_redacted: "valor legítimo" }) as Record<
      string,
      unknown
    >

    expect(saida["cpf_redacted"]).toBe("valor legítimo")
    expect(saida["cpf_redacted~1"]).toBe("[REDIGIDO]")
    expect(Object.keys(saida)).toHaveLength(2)
  })

  it("a ordem de enumeração não muda o resultado", () => {
    const saida = redactForLog({ cpf_redacted: "valor legítimo", cpf: "123.456.789-09" }) as Record<
      string,
      unknown
    >

    expect(saida["cpf_redacted"]).toBe("valor legítimo")
    expect(saida["cpf_redacted~1"]).toBe("[REDIGIDO]")
    expect(Object.keys(saida)).toHaveLength(2)
  })

  it("chave PII dinâmica com `[REDIGIDO-chave]` preexistente não colide", () => {
    const saida = redactForLog({
      "[REDIGIDO-chave]": "campo inocente",
      "123.456.789-09": 7,
    }) as Record<string, unknown>

    expect(saida["[REDIGIDO-chave]"]).toBe("campo inocente")
    expect(saida["[REDIGIDO-chave~1]"] ?? saida["[REDIGIDO-chave]~1"]).toBe(7)
    expect(Object.keys(saida)).toHaveLength(2)
  })

  it("várias chaves dinâmicas com PII geram nomes distintos", () => {
    const saida = redactForLog({
      "123.456.789-09": 1,
      "111.222.333-96": 2,
      "joao@escola.com.br": 3,
    }) as Record<string, unknown>

    const valores = Object.values(saida).sort()
    expect(Object.keys(saida)).toHaveLength(3)
    expect(valores).toEqual([1, 2, 3])
  })

  it("duas chaves proibidas com o mesmo nome-base não colapsam", () => {
    const saida = redactForLog({ cpf: "x", CPF: "y" }) as Record<string, unknown>
    expect(Object.keys(saida)).toHaveLength(2)
  })

  it("`__proto__` como chave vira propriedade própria, não mexe no protótipo", () => {
    // Num objeto comum, `out["__proto__"] = v` altera a cadeia de protótipos em
    // vez de criar propriedade. O objeto intermediário tem protótipo nulo.
    const saida = redactForLog({ __proto__: { poluido: true }, sales_count: 14 }) as Record<
      string,
      unknown
    >

    expect(Object.getPrototypeOf(saida)).toBeNull()
    expect(saida["sales_count"]).toBe(14)
    expect((({}) as Record<string, unknown>)["poluido"]).toBeUndefined()
  })

  it("a saída com colisões continua passando pelo guard de PII", () => {
    expect(() =>
      redactForLog({ cpf: "123.456.789-09", cpf_redacted: "ok", "111.222.333-96": 1 }),
    ).not.toThrow()
  })
})
