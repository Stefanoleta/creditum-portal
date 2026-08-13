import { describe, it, expect } from "vitest"
import {
  canonicalSchoolKey,
  canonicalPersonKey,
  isUnassignedToken,
  similarity,
  resolveSchool,
  isBlankRow,
  SUGGESTION_THRESHOLD,
} from "../normalize"

// ─── Chave canônica de unidade ────────────────────────────────────────────────

describe("canonicalSchoolKey unifica o que é seguro unificar", () => {
  it("acento não distingue unidade", () => {
    expect(canonicalSchoolKey("Grau Sumaré")).toBe("sumare")
    expect(canonicalSchoolKey("Grau Sumare")).toBe("sumare")
    expect(canonicalSchoolKey("Grau Marabá")).toBe("maraba")
    expect(canonicalSchoolKey("Grau Maraba")).toBe("maraba")
  })

  it("caixa não distingue unidade", () => {
    expect(canonicalSchoolKey("Grau Alecrim")).toBe("alecrim")
    expect(canonicalSchoolKey("Grau alecrim")).toBe("alecrim")
  })

  it("prefixo institucional não distingue unidade", () => {
    // aba de pipeline usa "Grau X", aba financeira usa só "X"
    expect(canonicalSchoolKey("Grau Meriti")).toBe(canonicalSchoolKey("Meriti"))
    expect(canonicalSchoolKey("Grau Zona Norte")).toBe(canonicalSchoolKey("Zona Norte"))
    expect(canonicalSchoolKey("Grau Santo Amaro")).toBe(canonicalSchoolKey("Santo Amaro"))
  })

  it("abreviação regular vira correspondência EXATA, não semelhança", () => {
    // O caso que motivou a pergunta do CEO.
    expect(canonicalSchoolKey("Grau Sta Cruz")).toBe("santa cruz")
    expect(canonicalSchoolKey("Santa Cruz")).toBe("santa cruz")
    expect(canonicalSchoolKey("Grau Sta Cruz")).toBe(canonicalSchoolKey("Santa Cruz"))
  })

  it("espaço duplicado e vazio não criam unidade nova", () => {
    expect(canonicalSchoolKey("Grau  Mogi ")).toBe("mogi")
    expect(canonicalSchoolKey("")).toBeNull()
    expect(canonicalSchoolKey(null)).toBeNull()
  })

  it("não engole o nome quando ele É o prefixo", () => {
    expect(canonicalSchoolKey("Grau")).toBe("grau")
  })
})

// ─── A propriedade de segurança ───────────────────────────────────────────────

describe("unidades diferentes NUNCA colapsam", () => {
  // Estas duas existem de verdade na planilha e são cidades distintas.
  // Qualquer similaridade ingênua as fundiria, contaminando conversão,
  // ranking e ticket das duas ao mesmo tempo.
  it("Santos e Santo Amaro são unidades distintas", () => {
    const santos = canonicalSchoolKey("Grau Santos")!
    const santoAmaro = canonicalSchoolKey("Grau Santo Amaro")!

    expect(santos).not.toBe(santoAmaro)
    expect(similarity(santos, santoAmaro)).toBeLessThan(SUGGESTION_THRESHOLD)
  })

  it("resolveSchool não sugere fusão entre Santos e Santo Amaro", () => {
    const known = new Set([canonicalSchoolKey("Grau Santo Amaro")!])
    const r = resolveSchool("Grau Santos", new Map(), known)
    expect(r?.kind).toBe("new")
  })

  // Todos estes pares existem na planilha real e são unidades distintas.
  // Limeira/Limoeiro é o par mais próximo (0,75) — fica logo abaixo do
  // limiar de 0,80, e foi ele que calibrou o valor.
  it.each([
    ["Grau Santos", "Grau Santo Amaro"],
    ["Grau Limeira", "Grau Limoeiro"],
    ["Grau Meriti", "Grau Madureira"],
    ["Grau Teresina", "Grau Petrolina"],
    ["Grau Bezerra", "Grau Belford Roxo"],
    ["Grau Sumare", "Grau Santos"],
    ["Grau Mogi", "Grau Maraba"],
  ])("%s e %s ficam abaixo do limiar de sugestão", (a, b) => {
    const ka = canonicalSchoolKey(a)!
    const kb = canonicalSchoolKey(b)!
    expect(ka).not.toBe(kb)
    expect(similarity(ka, kb)).toBeLessThan(SUGGESTION_THRESHOLD)
  })
})

// ─── Resolução escalonada ─────────────────────────────────────────────────────

describe("veto estrutural do nome", () => {
  it("contagem de palavras diferente sem palavra em comum = lugares diferentes", () => {
    // Santos é quase prefixo de Santo Amaro; distância pura os fundiria.
    expect(similarity("santos", "santo amaro")).toBe(0)
    expect(similarity("bezerra", "belford roxo")).toBe(0)
  })

  it("palavra em comum desarma o veto e a proximidade volta a valer", () => {
    expect(similarity("zona norte", "zona norte sul")).toBeGreaterThan(0)
  })

  it("erro de digitação em palavra única continua detectável", () => {
    expect(similarity("alecrim", "alecrin")).toBeGreaterThanOrEqual(SUGGESTION_THRESHOLD)
  })
})

describe("resolveSchool: da certeza para a suspeita", () => {
  // Nomes canônicos confirmados pelo CEO. A planilha escreve as formas curtas.
  const known = new Set(["sao jose do rio preto", "mogi das cruzes", "meriti", "alecrim"])

  // Contração de nome composto NÃO é derivável por regra: nenhum algoritmo tira
  // "Mogi das Cruzes" de "Mogi". Só entra por alias que o CEO aprovou.
  const aliases = new Map([
    ["rio preto", "school-sjrp"],
    ["mogi", "school-mogi"],
  ])

  it("alias aprovado resolve direto", () => {
    const r = resolveSchool("Rio Preto", aliases, known)
    expect(r?.kind).toBe("alias")
    expect(r?.schoolId).toBe("school-sjrp")
  })

  it("forma curta da planilha resolve pelo alias do CEO", () => {
    const r = resolveSchool("Grau Mogi", aliases, known)
    expect(r?.kind).toBe("alias")
    expect(r?.schoolId).toBe("school-mogi")
  })

  it("nome canônico resolve sem alias", () => {
    expect(resolveSchool("São José do Rio Preto", aliases, known)?.kind).toBe("canonical")
    expect(resolveSchool("Mogi das Cruzes", aliases, known)?.kind).toBe("canonical")
    expect(resolveSchool("Grau Meriti", aliases, known)?.kind).toBe("canonical")
  })

  it("parecido vira SUGESTÃO, nunca fusão automática", () => {
    const r = resolveSchool("Grau Alecrin", aliases, known) // erro de digitação
    expect(r?.kind).toBe("suggestion")
    expect(r?.candidateKey).toBe("alecrim")
    expect(r?.score).toBeGreaterThanOrEqual(SUGGESTION_THRESHOLD)
  })

  it("contração NÃO é inferida por semelhança — sem alias, vira unidade nova", () => {
    // "Mogi" contra "mogi das cruzes": 1 palavra vs 3, nenhuma em comum.
    // O veto estrutural age, e é isso que torna o alias do CEO indispensável.
    expect(resolveSchool("Grau Mogi", new Map(), known)?.kind).toBe("new")
  })

  it("desconhecido vira unidade nova, não fusão com o mais parecido", () => {
    expect(resolveSchool("Grau Joinville", aliases, known)?.kind).toBe("new")
  })
})

// ─── Vendedor / SDR ───────────────────────────────────────────────────────────

describe("sentinela de não-atribuído", () => {
  it("reconhece as formas observadas na fonte", () => {
    expect(isUnassignedToken("Ninguem")).toBe(true)
    expect(isUnassignedToken("Ninguém")).toBe(true)
    expect(isUnassignedToken("")).toBe(true)
    expect(isUnassignedToken(null)).toBe(true)
  })

  it("não confunde pessoa com sentinela", () => {
    expect(isUnassignedToken("Carlos")).toBe(false)
    expect(isUnassignedToken("Lucas Z")).toBe(false)
  })

  it("sentinela não vira vendedor", () => {
    expect(canonicalPersonKey("Ninguém")).toBeNull()
    expect(canonicalPersonKey("Carlos")).toBe("carlos")
    expect(canonicalPersonKey("Lucas Z")).toBe("lucas z")
  })
})

// ─── Linha-fantasma ───────────────────────────────────────────────────────────

describe("linha-fantasma é rejeitada, não ingerida", () => {
  it("linha sem aluno e sem contato é fantasma", () => {
    // as ~55 linhas de gabarito da planilha: vazias, Status "Novo", total 0
    expect(isBlankRow({ studentName: "", contact: "", installmentsTotal: "0" })).toBe(true)
    expect(isBlankRow({})).toBe(true)
    expect(isBlankRow({ studentName: "   ", contact: null })).toBe(true)
  })

  it("linha com aluno OU contato é registro real", () => {
    expect(isBlankRow({ studentName: "Fulano", contact: "" })).toBe(false)
    expect(isBlankRow({ studentName: "", contact: "11999999999" })).toBe(false)
  })

  it("total zerado sozinho não torna a linha fantasma", () => {
    // um lead real pode ter 0 parcelas em aberto
    expect(isBlankRow({ studentName: "Fulano", contact: "11999999999", installmentsTotal: "0" }))
      .toBe(false)
  })
})
