/**
 * Importador XLSX → catálogo governado: fail-closed ATÔMICO.
 *
 * O que o gate da Fase 2.6c encontrou: a versão anterior descartava linha inválida,
 * emitia aviso e escrevia o JSON com sucesso. Uma célula `Ativo` em branco fazia uma
 * unidade governada desaparecer do catálogo de runtime, onde virava `unknown` a cada
 * ingestão — e o validador de runtime não recupera o que o build step jogou fora.
 *
 * Estes testes exercitam o script REAL, num diretório temporário, com planilhas
 * sintéticas geradas por `tools/make_test_xlsx.py`. Não dependem do arquivo do
 * WhatsApp, que o app apaga.
 */

import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  chmodSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

// Cada teste aqui dispara `python3` como subprocesso. Sob a suíte completa, com
// 26 arquivos em paralelo, o processo espera na fila e o limite padrão de 5s
// estoura — sem que nada no produto tenha mudado. O limite maior mede o
// conversor, não a contenção da máquina.
vi.setConfig({ testTimeout: 60_000 })

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../..")
const CONVERSOR = join(RAIZ, "tools/xlsx_to_catalog.py")
const GERADOR = join(RAIZ, "tools/make_test_xlsx.py")

type Linha = readonly (string | null)[]

const CABECALHO: Linha = ["Unidade", "Apelido", "Ativo"]

function planilha(linhas: readonly Linha[]): string {
  const dir = mkdtempSync(join(tmpdir(), "cat-import-"))
  const caminho = join(dir, "teste.xlsx")
  execFileSync("python3", [GERADOR, caminho, JSON.stringify(linhas)], { encoding: "utf8" })
  return caminho
}

interface Resultado {
  readonly ok: boolean
  readonly stderr: string
  readonly destino: string
  readonly dir: string
}

/**
 * Overrides governados: a segunda fonte do build step. `null` na maioria dos casos
 * porque eles testam a planilha; quem testa override passa o documento.
 */
type Overrides = Record<string, unknown>

const SEM_OVERRIDES: Overrides = { schema_version: "1.0.0", aliases: [] }

/** Grava o documento de overrides num temporário. Aceita texto cru para testar JSON inválido. */
function arquivoDeOverrides(doc: Overrides | string): string {
  const dir = mkdtempSync(join(tmpdir(), "cat-ovr-"))
  const caminho = join(dir, "d13.alias-overrides.json")
  writeFileSync(caminho, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2))
  return caminho
}

/** Roda o conversor real. Nunca lança — o veredito é o código de saída. */
function converter(
  xlsx: string,
  destinoExistente?: string,
  overrides: Overrides | string = SEM_OVERRIDES,
): Resultado {
  const dir = mkdtempSync(join(tmpdir(), "cat-out-"))
  const destino = destinoExistente ?? join(dir, "unidades.catalog.json")
  const ovr = arquivoDeOverrides(overrides)
  try {
    execFileSync("python3", [CONVERSOR, xlsx, ovr, destino], { encoding: "utf8", stdio: "pipe" })
    return { ok: true, stderr: "", destino, dir }
  } catch (e) {
    const err = e as { stderr?: string }
    return { ok: false, stderr: err.stderr ?? "", destino, dir }
  }
}

const lerCatalogo = (
  destino: string,
): { units: { unit_id: string; canonical_name: string; aliases: string[]; status: string }[]; groups: { label: string; members: string[] }[]; warnings: string[] } =>
  JSON.parse(readFileSync(destino, "utf8")) as never

/** 48 linhas boas — o cenário do teste J. */
const QUARENTA_E_OITO: readonly Linha[] = Array.from({ length: 48 }, (_, i) => [
  `Unidade ${String(i + 1).padStart(2, "0")}`,
  null,
  i % 10 === 0 ? "Não" : "Sim",
])

// ═════════════════════════════════════════════════════════════════════════════

describe("A — planilha válida gera catálogo completo", () => {
  const r = converter(
    planilha([
      CABECALHO,
      ["Santos", null, "Sim"],
      ["Santo Amaro", null, "Sim"],
      ["Vila Maria", null, "Não"],
      ["Santa Cruz", "STA Cruz", "Sim"],
      ["Carpina", "Carpina e Limoeiro", "Sim"],
      ["Limoeiro", "Carpina e Limoeiro", "Sim"],
    ]),
  )

  it("sai com sucesso", () => {
    expect(r.ok).toBe(true)
  })

  it("todas as unidades entram — nenhuma descartada", () => {
    const c = lerCatalogo(r.destino)
    expect(c.units).toHaveLength(6)
  })

  it("ativo/inativo preservado", () => {
    const c = lerCatalogo(r.destino)
    expect(c.units.filter((u) => u.status === "active")).toHaveLength(5)
    expect(c.units.filter((u) => u.status === "inactive")).toHaveLength(1)
    expect(c.units.find((u) => u.unit_id === "vila_maria")?.status).toBe("inactive")
  })

  it("Unicode preservado no nome canônico", () => {
    const c = converter(
      planilha([CABECALHO, ["Maracanaú", null, "Sim"], ["Sumaré", null, "Sim"]]),
    )
    const cat = lerCatalogo(c.destino)
    expect(cat.units.map((u) => u.canonical_name)).toEqual(["Maracanaú", "Sumaré"])
  })

  it("apelido em UMA unidade é alias", () => {
    const c = lerCatalogo(r.destino)
    expect(c.units.find((u) => u.unit_id === "santa_cruz")?.aliases).toEqual(["STA Cruz"])
  })

  it("apelido em DUAS unidades é agrupamento, não alias", () => {
    const c = lerCatalogo(r.destino)
    expect(c.groups).toEqual([{ label: "Carpina e Limoeiro", members: ["carpina", "limoeiro"] }])
    expect(c.units.find((u) => u.unit_id === "carpina")?.aliases).toEqual([])
    expect(c.units.find((u) => u.unit_id === "limoeiro")?.aliases).toEqual([])
  })

  it("linha completamente vazia no fim não é dado", () => {
    const c = converter(planilha([CABECALHO, ["Santos", null, "Sim"], [null, null, null]]))
    expect(c.ok).toBe(true)
    expect(lerCatalogo(c.destino).units).toHaveLength(1)
  })
})

describe("B/C/D — célula obrigatória ausente ou desconhecida é FATAL", () => {
  const naoEscreveu = (r: Resultado): boolean =>
    !r.ok && !existsSync(r.destino) && readdirSync(r.dir).length === 0

  it("B — `Unidade` vazia: falha e nada é escrito", () => {
    const r = converter(planilha([CABECALHO, ["Santos", null, "Sim"], [null, "Apelido Órfão", "Sim"]]))
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("`Unidade` vazia")
    expect(naoEscreveu(r)).toBe(true)
  })

  it("C — `Ativo` vazia: falha — status não é presumido", () => {
    const r = converter(planilha([CABECALHO, ["Santos", null, null]]))
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("`Ativo` vazia")
    expect(naoEscreveu(r)).toBe(true)
  })

  it("D — `Ativo` fora do vocabulário: falha, sem converter para true/false", () => {
    for (const ruim of ["S", "sim", "1", "Ativo", "TRUE", "Talvez"]) {
      const r = converter(planilha([CABECALHO, ["Santos", null, ruim]]))
      expect(r.ok, ruim).toBe(false)
      expect(r.stderr, ruim).toContain("fora do vocabulário")
    }
  })

  it("linha PARCIALMENTE preenchida é fatal, não ignorada", () => {
    // Alguém escreveu algo e a conversão não sabe o quê. Ignorar perderia dado.
    const r = converter(planilha([CABECALHO, ["Santos", null, "Sim"], [null, null, "Sim"]]))
    expect(r.ok).toBe(false)
  })

  it("nome curto demais para gerar id válido é fatal", () => {
    const r = converter(planilha([CABECALHO, ["X", null, "Sim"]]))
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("unit_id")
  })
})

describe("E — cabeçalho ausente ou divergente é FATAL", () => {
  it("sem cabeçalho", () => {
    const r = converter(planilha([["Santos", null, "Sim"]]))
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("cabeçalho")
  })

  it("coluna renomeada — sem adivinhar nome alternativo", () => {
    const r = converter(planilha([["Escola", "Apelido", "Ativo"], ["Santos", null, "Sim"]]))
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("Unidade")
  })

  it("coluna faltando", () => {
    const r = converter(planilha([["Unidade", "Apelido"], ["Santos", null, "Sim"]]))
    expect(r.ok).toBe(false)
  })

  it("colunas fora de posição", () => {
    const r = converter(planilha([["Ativo", "Apelido", "Unidade"], ["Sim", null, "Santos"]]))
    expect(r.ok).toBe(false)
  })

  it("planilha vazia", () => {
    const r = converter(planilha([]))
    expect(r.ok).toBe(false)
  })

  it("arquivo inexistente falha limpo, sem traceback", () => {
    const r = converter(join(tmpdir(), "nao-existe-xyz.xlsx"))
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("não encontrada")
    expect(r.stderr).not.toContain("Traceback")
  })
})

describe("F/G/H/I — integridade global antes de escrever", () => {
  it("F — alias conflitante entre duas unidades", () => {
    // Não é agrupamento: são dois apelidos DIFERENTES que normalizam igual.
    const r = converter(
      planilha([
        CABECALHO,
        ["Unidade Alfa", "Compartilhado", "Sim"],
        ["Unidade Beta", "compartilhado", "Sim"],
      ]),
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("aponta para")
  })

  it("F — alias colidindo com o canônico de outra unidade", () => {
    const r = converter(
      planilha([CABECALHO, ["Santos", null, "Sim"], ["Santo Amaro", "Santos", "Sim"]]),
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("colide")
  })

  it("G — canônico duplicado", () => {
    const r = converter(planilha([CABECALHO, ["Santos", null, "Sim"], ["Santos", null, "Sim"]]))
    expect(r.ok).toBe(false)
    expect(r.stderr).toMatch(/duplicad/)
  })

  it("H — unit_id duplicado por normalização", () => {
    // `Maracanaú` e `Maracanau` derivam o mesmo id.
    const r = converter(
      planilha([CABECALHO, ["Maracanaú", null, "Sim"], ["Maracanau", null, "Sim"]]),
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("duplicado")
  })

  it("G — status contraditório para a mesma unidade é pego como duplicidade", () => {
    const r = converter(planilha([CABECALHO, ["Santos", null, "Sim"], ["Santos", null, "Não"]]))
    expect(r.ok).toBe(false)
  })

  it("todos os problemas são reportados, não só o primeiro", () => {
    const r = converter(
      planilha([CABECALHO, [null, null, "Sim"], ["Santos", null, "?"], ["Outra", null, null]]),
    )
    expect(r.ok).toBe(false)
    const linhas = r.stderr.split("\n").filter((l) => l.trim().startsWith("- "))
    expect(linhas.length).toBeGreaterThanOrEqual(3)
  })
})

describe("J — uma linha ruim entre 48 boas invalida TUDO", () => {
  it("48 boas sozinhas convertem", () => {
    const r = converter(planilha([CABECALHO, ...QUARENTA_E_OITO]))
    expect(r.ok).toBe(true)
    expect(lerCatalogo(r.destino).units).toHaveLength(48)
  })

  it("48 boas + 1 ruim: falha, e NÃO produz catálogo de 48", () => {
    const r = converter(
      planilha([CABECALHO, ...QUARENTA_E_OITO, ["Unidade Ruim", null, "Talvez"]]),
    )
    expect(r.ok).toBe(false)
    expect(existsSync(r.destino)).toBe(false)
  })

  it("a linha ruim no MEIO também invalida tudo", () => {
    const metade = Math.floor(QUARENTA_E_OITO.length / 2)
    const r = converter(
      planilha([
        CABECALHO,
        ...QUARENTA_E_OITO.slice(0, metade),
        ["Unidade Ruim", null, null],
        ...QUARENTA_E_OITO.slice(metade),
      ]),
    )
    expect(r.ok).toBe(false)
    expect(existsSync(r.destino)).toBe(false)
  })
})

describe("K — artefato anterior permanece intacto numa conversão inválida", () => {
  it("byte-identical após falha", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-prev-"))
    const destino = join(dir, "unidades.catalog.json")

    // Artefato válido pré-existente.
    const bom = converter(planilha([CABECALHO, ["Santos", null, "Sim"]]), destino)
    expect(bom.ok).toBe(true)
    const antes = readFileSync(destino)

    // Conversão inválida sobre o MESMO destino.
    const ruim = converter(planilha([CABECALHO, ["Outra", null, "Talvez"]]), destino)
    expect(ruim.ok).toBe(false)

    expect(readFileSync(destino).equals(antes)).toBe(true)
  })

  it("nenhum temporário fica para trás", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-tmp-"))
    const destino = join(dir, "unidades.catalog.json")
    converter(planilha([CABECALHO, ["Santos", null, "Sim"]]), destino)
    converter(planilha([CABECALHO, ["Outra", null, "?"]]), destino)
    expect(readdirSync(dir).filter((f) => f.includes(".tmp"))).toEqual([])
  })

  it("um artefato corrompido não é 'consertado' por conversão inválida", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-corr-"))
    const destino = join(dir, "unidades.catalog.json")
    writeFileSync(destino, "{ nao é json valido")
    const r = converter(planilha([CABECALHO, ["Santos", null, "Talvez"]]), destino)
    expect(r.ok).toBe(false)
    // Continua corrompido — a conversão não tocou nele.
    expect(readFileSync(destino, "utf8")).toBe("{ nao é json valido")
  })
})

describe("L — saída determinística", () => {
  const LINHAS_L: readonly Linha[] = [
    CABECALHO,
    ["Santos", null, "Sim"],
    ["Maracanaú", "Maracanau ", "Sim"],
    ["Carpina", "Carpina e Limoeiro", "Sim"],
    ["Limoeiro", "Carpina e Limoeiro", "Sim"],
    ["Vila Maria", null, "Não"],
  ]

  it("a MESMA fonte produz bytes idênticos", () => {
    // A mesma fonte, não duas cópias logicamente iguais: o artefato registra o
    // sha256 do arquivo, e um `.xlsx` é um zip — que embute timestamp. Dois
    // arquivos com o mesmo conteúdo lógico têm bytes diferentes, e é correto que
    // a proveniência os distinga.
    const fonte = planilha(LINHAS_L)
    const a = converter(fonte)
    const b = converter(fonte)
    expect(a.ok && b.ok).toBe(true)
    expect(readFileSync(b.destino, "utf8")).toBe(readFileSync(a.destino, "utf8"))
  })

  it("fontes distintas de mesmo conteúdo dão o MESMO dado governado", () => {
    // O que precisa ser determinístico é o dado, não o registro de proveniência.
    const semProveniencia = (destino: string): string => {
      const doc = JSON.parse(readFileSync(destino, "utf8")) as Record<string, unknown>
      delete doc["sources"]
      return JSON.stringify(doc)
    }
    const a = converter(planilha(LINHAS_L))
    const b = converter(planilha(LINHAS_L))
    expect(a.ok && b.ok).toBe(true)
    expect(semProveniencia(b.destino)).toBe(semProveniencia(a.destino))
  })

  it("fonte diferente muda o hash registrado — a proveniência não mente", () => {
    const a = converter(planilha(LINHAS_L))
    const b = converter(planilha([...LINHAS_L, ["Sumaré", null, "Sim"]]))
    const hashDe = (d: string): string =>
      (JSON.parse(readFileSync(d, "utf8")) as { sources: { role: string; sha256: string }[] })
        .sources.filter((f) => f.role === "workbook")[0]?.sha256 ?? ""
    expect(hashDe(b.destino)).not.toBe(hashDe(a.destino))
  })

  it("a ordem dos agrupamentos é estável", () => {
    const r = converter(
      planilha([
        CABECALHO,
        ["Zeta", "Zeta e Alfa", "Sim"],
        ["Alfa", "Zeta e Alfa", "Sim"],
        ["Beta", "Beta e Gama", "Sim"],
        ["Gama", "Beta e Gama", "Sim"],
      ]),
    )
    expect(lerCatalogo(r.destino).groups.map((g) => g.label)).toEqual([
      "Beta e Gama",
      "Zeta e Alfa",
    ])
  })
})

describe("avisos existem só para condição NÃO LOSSY", () => {
  it("apelido idêntico ao canônico gera AVISO e converte", () => {
    // Descartar essa redundância não perde forma nenhuma.
    const r = converter(planilha([CABECALHO, ["Prudente", "Prudente", "Sim"]]))
    expect(r.ok).toBe(true)
    const c = lerCatalogo(r.destino)
    expect(c.warnings).toHaveLength(1)
    expect(c.warnings[0]).toContain("redundante")
    expect(c.units[0]?.aliases).toEqual([])
  })

  it("nenhuma condição LOSSY vira aviso", () => {
    // Toda condição que descartaria linha, status ou alias é erro. Provado pelos
    // blocos B/C/D/F/G/H acima; aqui a asserção é que o caminho de sucesso não
    // acumula avisos sobre dado perdido.
    const r = converter(planilha([CABECALHO, ["Santos", null, "Sim"]]))
    expect(lerCatalogo(r.destino).warnings).toEqual([])
  })
})

describe("o artefato governado em uso continua fiel ao arquivo real", () => {
  it("49 unidades, 44 ativas, 5 inativas, 2 agrupamentos", () => {
    const c = lerCatalogo(join(RAIZ, "catalog/unidades.catalog.json"))
    expect(c.units).toHaveLength(49)
    expect(c.units.filter((u) => u.status === "active")).toHaveLength(44)
    expect(c.units.filter((u) => u.status === "inactive")).toHaveLength(5)
    expect(c.groups).toHaveLength(2)
  })

  it("as grafias reais da planilha NÃO foram corrigidas editorialmente", () => {
    const c = lerCatalogo(join(RAIZ, "catalog/unidades.catalog.json"))
    const nomes = c.units.map((u) => u.canonical_name)
    // A planilha é autoridade de display até decisão humana.
    expect(nomes).toContain("Sâo José do Rio Preto")
    expect(nomes).toContain("Divinopólis")
    expect(nomes).toContain("Mogi")
    expect(nomes).toContain("Jd Angela")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Modo do arquivo: `mkstemp` cria 0600 e `os.replace` leva o modo do temporário
// junto para o destino. Sem cuidado explícito, regenerar o catálogo troca em
// silêncio a permissão de um artefato versionado — e um catálogo 0600 some do
// build de outro usuário com erro de I/O, não com erro de validação.
//
// Nenhum teste da suíte pegou isso quando aconteceu de verdade: quem pegou foi
// o `ls` da verificação pós-escrita. Estes testes fecham essa lacuna.

const modo = (caminho: string): number => statSync(caminho).mode & 0o777
const oct = (m: number): string => "0" + m.toString(8).padStart(3, "0")

const PLANILHA_BOA: readonly Linha[] = [CABECALHO, ["Santos", null, "Sim"]]

describe("escrever_atomico preserva o modo do destino", () => {
  it("A — destino 0644 continua 0644 depois do replace", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-mode-a-"))
    const destino = join(dir, "unidades.catalog.json")

    expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
    chmodSync(destino, 0o644)

    expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
    expect(oct(modo(destino))).toBe("0644")
  })

  it("B — o modo herdado é o do destino, não um 0644 fixo no código", () => {
    // Se a função forçasse 0644, este caso passaria por acidente no A e falharia aqui.
    for (const esperado of [0o640, 0o600, 0o664]) {
      const dir = mkdtempSync(join(tmpdir(), "cat-mode-b-"))
      const destino = join(dir, "unidades.catalog.json")

      expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
      chmodSync(destino, esperado)

      expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
      expect(oct(modo(destino)), oct(esperado)).toBe(oct(esperado))
    }
  })

  it("C — destino novo respeita o padrão do processo, não o 0600 do mkstemp", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-mode-c-"))

    // Controle: um arquivo escrito pelos meios normais, no mesmo diretório e no
    // mesmo processo. O modo dele É o padrão derivado do umask — comparar contra
    // ele torna o teste indiferente ao umask do ambiente.
    const controle = join(dir, "controle.json")
    writeFileSync(controle, "{}")

    const destino = join(dir, "unidades.catalog.json")
    expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)

    expect(oct(modo(destino))).toBe(oct(modo(controle)))
  })

  it("C — e o padrão não é 0600 num umask normal", () => {
    // Guarda separada: se o ambiente tiver umask 0077 o controle acima também
    // seria 0600 e o caso C passaria vazio. Aqui isso fica visível em vez de
    // silencioso.
    const dir = mkdtempSync(join(tmpdir(), "cat-mode-c2-"))
    const controle = join(dir, "controle.json")
    writeFileSync(controle, "{}")
    if (oct(modo(controle)) === "0600") {
      // umask restritivo: o caso C ainda vale, mas não distingue o defeito.
      expect(oct(modo(controle))).toBe("0600")
      return
    }
    const destino = join(dir, "unidades.catalog.json")
    expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
    expect(oct(modo(destino))).not.toBe("0600")
  })

  it("D — conversão que falha não muda bytes NEM modo do artefato existente", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-mode-d-"))
    const destino = join(dir, "unidades.catalog.json")

    expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
    chmodSync(destino, 0o640)
    const bytesAntes = readFileSync(destino)
    const modoAntes = modo(destino)

    const ruim = converter(planilha([CABECALHO, ["Outra", null, "Talvez"]]), destino)
    expect(ruim.ok).toBe(false)

    expect(readFileSync(destino).equals(bytesAntes)).toBe(true)
    expect(oct(modo(destino))).toBe(oct(modoAntes))
    expect(readdirSync(dir).filter((f) => f.includes(".tmp"))).toEqual([])
  })

  it("o modo sobrevive a regenerações consecutivas", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-mode-e-"))
    const destino = join(dir, "unidades.catalog.json")
    expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
    chmodSync(destino, 0o644)
    for (let i = 0; i < 3; i += 1) {
      expect(converter(planilha(PLANILHA_BOA), destino).ok).toBe(true)
      expect(oct(modo(destino)), `regeneração ${i + 1}`).toBe("0644")
    }
  })
})

describe("o artefato governado em uso tem modo legível", () => {
  it("não é 0600", () => {
    // O defeito real chegou a acontecer neste arquivo. Se voltar, falha aqui.
    const m = oct(modo(join(RAIZ, "catalog/unidades.catalog.json")))
    expect(m).not.toBe("0600")
    expect(m).toMatch(/^06[46][0-4]$/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Overrides governados — a SEGUNDA fonte do build step.
//
// O gate final da 2.6c encontrou isto: três aliases (`BelfordRoxo`,
// `Presidente P.`, `Rio Preto`) viviam num `ALIASES_GOVERNADOS` em TypeScript e
// eram enxertados no catálogo DEPOIS do load. Consequência: regenerar a planilha
// não reproduzia o catálogo efetivo, e nenhuma dessas decisões podia ser
// auditada ou removida pelo caminho governado. Eram governança escondida em código.
//
// Agora são dado governado, hasheado, mesclado no build step e presente no
// artefato. O runtime só projeta.

const OVERRIDES_D13: Overrides = {
  schema_version: "1.0.0",
  aliases: [
    { alias: "Presidente P.", target_unit_id: "prudente" },
    { alias: "BelfordRoxo", target_unit_id: "belford_roxo" },
  ],
}

const PLANILHA_D13: readonly Linha[] = [
  CABECALHO,
  ["Prudente", "Prudente", "Sim"],
  ["Belford Roxo", null, "Sim"],
  ["Santos", null, "Sim"],
]

const aliasesDe = (destino: string): Record<string, string[]> =>
  Object.fromEntries(lerCatalogo(destino).units.map((u) => [u.unit_id, u.aliases]))

describe("A/B — as duas fontes produzem um artefato com todos os aliases efetivos", () => {
  const r = converter(planilha(PLANILHA_D13), undefined, OVERRIDES_D13)

  it("A — conversão bem-sucedida com XLSX + overrides", () => {
    expect(r.ok).toBe(true)
  })

  it("B — os aliases do override chegam ao artefato", () => {
    const a = aliasesDe(r.destino)
    expect(a["prudente"]).toEqual(["Presidente P."])
    expect(a["belford_roxo"]).toEqual(["BelfordRoxo"])
    expect(a["santos"]).toEqual([])
  })

  it("B — a contagem efetiva é derivada das duas fontes, não fixada", () => {
    // 0 da planilha (o `Prudente` redundante é descartado como aviso) + 2 do override.
    const semOverride = converter(planilha(PLANILHA_D13))
    const daPlanilha = lerCatalogo(semOverride.destino).units.reduce(
      (n, u) => n + u.aliases.length,
      0,
    )
    const doOverride = (OVERRIDES_D13["aliases"] as unknown[]).length
    const efetivo = lerCatalogo(r.destino).units.reduce((n, u) => n + u.aliases.length, 0)
    expect(efetivo).toBe(daPlanilha + doOverride)
  })

  it("proveniência: as duas fontes ficam registradas com hash", () => {
    const a = JSON.parse(readFileSync(r.destino, "utf8")) as {
      sources: { role: string; file: string; sha256: string }[]
      importer_version: string
    }
    expect(a.sources.map((f) => f.role)).toEqual(["workbook", "alias_overrides"])
    for (const f of a.sources) expect(f.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(a.importer_version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("o hash registrado é o do arquivo de verdade, não um valor qualquer", () => {
    const a = JSON.parse(readFileSync(r.destino, "utf8")) as {
      sources: { role: string; sha256: string }[]
    }
    const doArtefato = a.sources.find((f) => f.role === "alias_overrides")?.sha256
    // Um override diferente precisa produzir hash diferente.
    const outro = converter(planilha(PLANILHA_D13), undefined, {
      schema_version: "1.0.0",
      aliases: [{ alias: "Presidente P.", target_unit_id: "prudente" }],
    })
    const doOutro = (
      JSON.parse(readFileSync(outro.destino, "utf8")) as {
        sources: { role: string; sha256: string }[]
      }
    ).sources.find((f) => f.role === "alias_overrides")?.sha256
    expect(doOutro).not.toBe(doArtefato)
  })
})

describe("E/F/G/H/I — override inválido é FATAL", () => {
  const comOverride = (doc: Overrides | string): Resultado =>
    converter(planilha(PLANILHA_D13), undefined, doc)

  it("E — target_unit_id inexistente no catálogo da planilha", () => {
    const r = comOverride({
      schema_version: "1.0.0",
      aliases: [{ alias: "Qualquer", target_unit_id: "unidade_fantasma" }],
    })
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("não existe no catálogo")
  })

  it("F — o mesmo alias apontando para duas UnitIds", () => {
    const r = comOverride({
      schema_version: "1.0.0",
      aliases: [
        { alias: "Ambíguo", target_unit_id: "prudente" },
        { alias: "Ambíguo", target_unit_id: "santos" },
      ],
    })
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("declarado em")
  })

  it("F — alias do override colidindo com alias da planilha de outra unidade", () => {
    const r = converter(
      planilha([CABECALHO, ["Santos", "Compartilhado", "Sim"], ["Prudente", null, "Sim"]]),
      undefined,
      {
        schema_version: "1.0.0",
        aliases: [{ alias: "Compartilhado", target_unit_id: "prudente" }],
      },
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("aponta para")
  })

  it("G — alias colidindo com o canônico de outra unidade", () => {
    const r = comOverride({
      schema_version: "1.0.0",
      aliases: [{ alias: "Santos", target_unit_id: "prudente" }],
    })
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("colide")
  })

  it("H — rótulo de agrupamento usado como alias humano", () => {
    // Decisão humana não transforma agrupamento comercial em unidade.
    const r = converter(
      planilha([
        CABECALHO,
        ["Carpina", "Carpina e Limoeiro", "Sim"],
        ["Limoeiro", "Carpina e Limoeiro", "Sim"],
      ]),
      undefined,
      {
        schema_version: "1.0.0",
        aliases: [{ alias: "Carpina e Limoeiro", target_unit_id: "carpina" }],
      },
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("rótulo de agrupamento")
  })

  it("H — variação de grafia do rótulo também é recusada", () => {
    const r = converter(
      planilha([
        CABECALHO,
        ["Carpina", "Carpina e Limoeiro", "Sim"],
        ["Limoeiro", "Carpina e Limoeiro", "Sim"],
      ]),
      undefined,
      {
        schema_version: "1.0.0",
        aliases: [{ alias: "carpina  e  limoeiro", target_unit_id: "limoeiro" }],
      },
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("rótulo de agrupamento")
  })

  it("H — rótulo de agrupamento como TARGET", () => {
    const r = converter(
      planilha([
        CABECALHO,
        ["Carpina", "Carpina e Limoeiro", "Sim"],
        ["Limoeiro", "Carpina e Limoeiro", "Sim"],
      ]),
      undefined,
      {
        schema_version: "1.0.0",
        aliases: [{ alias: "CL", target_unit_id: "carpina_e_limoeiro" }],
      },
    )
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("rótulo de agrupamento")
  })

  it("I — JSON malformado", () => {
    const r = comOverride("{ isso não é json")
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("JSON inválido")
  })

  it("I — schema_version não suportada", () => {
    const r = comOverride({ schema_version: "9.9.9", aliases: [] })
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("schema_version")
  })

  it("I — schema_version ausente", () => {
    const r = comOverride({ aliases: [] })
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain("schema_version")
  })

  it("I — `aliases` ausente ou de tipo errado", () => {
    for (const doc of [
      { schema_version: "1.0.0" },
      { schema_version: "1.0.0", aliases: {} },
      { schema_version: "1.0.0", aliases: "nenhum" },
    ]) {
      const r = comOverride(doc)
      expect(r.ok, JSON.stringify(doc)).toBe(false)
      expect(r.stderr).toContain("`aliases`")
    }
  })

  it("I — entrada sem alias, sem target, ou com tipo errado", () => {
    for (const entrada of [
      {},
      { alias: "X" },
      { target_unit_id: "prudente" },
      { alias: "", target_unit_id: "prudente" },
      { alias: "   ", target_unit_id: "prudente" },
      { alias: "X", target_unit_id: "" },
      { alias: 42, target_unit_id: "prudente" },
      { alias: "X", target_unit_id: null },
      "não é objeto",
    ]) {
      const r = comOverride({ schema_version: "1.0.0", aliases: [entrada] })
      expect(r.ok, JSON.stringify(entrada)).toBe(false)
    }
  })

  it("raiz que não é objeto", () => {
    expect(comOverride("[]").ok).toBe(false)
    expect(comOverride('"texto"').ok).toBe(false)
  })

  it("arquivo de overrides inexistente falha limpo", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-noovr-"))
    const destino = join(dir, "unidades.catalog.json")
    let stderr = ""
    try {
      execFileSync(
        "python3",
        [CONVERSOR, planilha(PLANILHA_D13), join(tmpdir(), "nao-existe-ovr.json"), destino],
        { encoding: "utf8", stdio: "pipe" },
      )
    } catch (e) {
      stderr = (e as { stderr?: string }).stderr ?? ""
    }
    expect(stderr).toContain("overrides não encontrada")
    expect(stderr).not.toContain("Traceback")
    expect(existsSync(destino)).toBe(false)
  })

  it("todos os problemas de override são reportados, não só o primeiro", () => {
    const r = comOverride({
      schema_version: "1.0.0",
      aliases: [{ alias: "" }, { alias: "A" }, { alias: 1, target_unit_id: "x" }],
    })
    expect(r.ok).toBe(false)
    const linhas = r.stderr.split("\n").filter((l) => l.trim().startsWith("- "))
    expect(linhas.length).toBeGreaterThanOrEqual(3)
  })
})

describe("J/K — override inválido não enfraquece a publicação atômica", () => {
  it("J — o artefato anterior permanece byte-identical", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-ovr-atom-"))
    const destino = join(dir, "unidades.catalog.json")

    expect(converter(planilha(PLANILHA_D13), destino, OVERRIDES_D13).ok).toBe(true)
    const antes = readFileSync(destino)

    const ruim = converter(planilha(PLANILHA_D13), destino, {
      schema_version: "1.0.0",
      aliases: [{ alias: "X", target_unit_id: "unidade_fantasma" }],
    })
    expect(ruim.ok).toBe(false)
    expect(readFileSync(destino).equals(antes)).toBe(true)
  })

  it("K — e preserva o modo do arquivo", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-ovr-mode-"))
    const destino = join(dir, "unidades.catalog.json")

    expect(converter(planilha(PLANILHA_D13), destino, OVERRIDES_D13).ok).toBe(true)
    chmodSync(destino, 0o640)

    const ruim = converter(planilha(PLANILHA_D13), destino, "{ json quebrado")
    expect(ruim.ok).toBe(false)
    expect(oct(modo(destino))).toBe("0640")
    expect(readdirSync(dir).filter((f) => f.includes(".tmp"))).toEqual([])
  })
})

describe("as duas fontes governadas reais", () => {
  const RAIZ_GOV = join(RAIZ, "governance")

  it("o arquivo de overrides existe e tem schema fechado", () => {
    const doc = JSON.parse(
      readFileSync(join(RAIZ_GOV, "d13.alias-overrides.json"), "utf8"),
    ) as {
      schema_version: string
      aliases: {
        alias: string
        target_unit_id: string
        rationale: string
        approved_in: string
      }[]
    }
    expect(doc.schema_version).toBe("1.0.0")
    // A lista é EXATA, não um mínimo. Alias humano entra por decisão D13 assinada,
    // e um alias que aparecesse sem passar por aqui seria identidade inventada.
    expect(doc.aliases).toHaveLength(10)
    expect(doc.aliases.map((a) => a.alias).sort()).toEqual([
      "Alecrim RN",
      "Alecrin RN",
      "BelfordRoxo",
      "Duque Caxias",
      "Fortaleza",
      "Meriti",
      "Natal Centro",
      "Presidente P.",
      "Rio Preto",
      "Zona Norte",
    ])
    // Toda entrada declara em que fase foi aprovada. Sem isso, o artefato não
    // distingue decisão governada de alias que alguém acrescentou de passagem.
    for (const a of doc.aliases) {
      expect(a.approved_in, a.alias).toMatch(/^FASE_2_(6B|10E)$/)
      expect(a.rationale.length, a.alias).toBeGreaterThan(40)
    }
  })

  it("o artefato em uso registra as duas fontes", () => {
    const a = JSON.parse(readFileSync(join(RAIZ, "catalog/unidades.catalog.json"), "utf8")) as {
      sources: { role: string; sha256: string }[]
    }
    expect(a.sources.map((f) => f.role)).toEqual(["workbook", "alias_overrides"])
  })

  it("o artefato em uso tem 15 aliases efetivos — 5 da planilha + 10 humanos", () => {
    const c = lerCatalogo(join(RAIZ, "catalog/unidades.catalog.json"))
    expect(c.units.reduce((n, u) => n + u.aliases.length, 0)).toBe(15)
  })

  it("as três formas de Alecrim/Natal Centro apontam para o MESMO unit_id", () => {
    // A decisão humana da 2.10e é de equivalência FÍSICA: Alecrim é o bairro,
    // Natal Centro a forma comercial. Nenhum unit_id novo foi criado — o
    // canônico `alecrim` já existia e foi preservado, que é o que impede a
    // duplicação de entidade canônica.
    const c = lerCatalogo(join(RAIZ, "catalog/unidades.catalog.json"))
    const alecrim = c.units.find((u) => u.unit_id === "alecrim")
    expect(alecrim?.aliases.sort()).toEqual(["Alecrim RN", "Alecrin RN", "Natal Centro"])
    // E não nasceu nenhum segundo registro para a mesma unidade física.
    expect(c.units.filter((u) => /natal.centro|alecri/i.test(u.canonical_name))).toHaveLength(1)
  })
})
