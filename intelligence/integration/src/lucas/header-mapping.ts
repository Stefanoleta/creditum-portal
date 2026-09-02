/**
 * Mapeamento por CABEÇALHO. Posição de coluna nunca é semântica.
 *
 * ─── Por que isto é obrigatório, com medição ───────────────────────────────────
 *
 * A Fase 2.10 comparou os dois meses reais:
 *
 *   agosto  Venc | Data Contratação | Aluno | CPF | Unidade | Canal | Parcela Cheia | …
 *   julho   Venc | Aluno | CPF | Sistema | Canal | Unidade | Data Contratação | …
 *
 * `CPF` é a 4ª coluna em agosto e a 3ª em julho. `Unidade` é a 5ª e a 6ª. Julho tem
 * `Sistema`, `Data Repasse` e `Valor`; agosto tem `Parcela Cheia`, `%`, `Curso` e
 * `Repasse`. Um adaptador por posição calibrado em agosto leria o CPF na coluna do
 * nome em julho — e não falharia: produziria identidades erradas que parecem CPFs
 * ausentes.
 *
 * Coluna A é a única exceção estável (`Venc` nos dois meses), e mesmo ela é
 * localizada por nome aqui. Confiar na posição de uma coluna porque ela coincidiu
 * duas vezes é como o defeito acima começa.
 *
 * ─── Sem fuzzy matching ───────────────────────────────────────────────────────
 *
 * A normalização é fechada e declarada: NFD sem acento, caixa baixa, espaço
 * colapsado. Nada de distância de edição. `Parcelas` e `Parcela Cheia` estão a uma
 * palavra de distância e significam coisas diferentes — número de parcelas contra
 * valor da parcela integral. Um casamento aproximado que confundisse os dois
 * trocaria uma contagem por um valor em reais, e o detector de parcelamento passaria
 * a agrupar contratos por preço.
 *
 * ─── Três classes de cabeçalho ────────────────────────────────────────────────
 *
 * `REQUIRED`  sem ele a semântica dependente não existe → falha fechada
 * `OPTIONAL`  varia entre meses e é legítimo faltar → fato de qualidade
 * `KNOWN_EXTRA` observado e sem uso hoje → registrado, não quebra
 *
 * Cabeçalho desconhecido não quebra a ingestão: a fonte é uma planilha viva e o
 * Lucas pode acrescentar coluna sem nos avisar. Mas ele é REPORTADO, porque coluna
 * nova pode ser justamente a dimensão que faltava.
 */

/** Campos que a ingestão consome. Chaves internas, estáveis, nunca da fonte. */
export type LucasField =
  | "venc"
  | "aluno"
  | "cpf"
  | "unidade"
  | "canal"
  | "vendedor"
  | "status"
  | "parcelas"
  | "ticket"
  | "valor_repasse"
  | "desconto_pct"
  | "data_contratacao"
  | "curso"
  | "sistema"
  | "status_pagamento"
  | "desembolso"

export type HeaderClass = "REQUIRED" | "OPTIONAL" | "KNOWN_EXTRA"

interface HeaderSpec {
  readonly field: LucasField
  readonly klass: HeaderClass
  /** Grafias aceitas, já em forma comparável. Fechado — sem aproximação. */
  readonly accepts: readonly string[]
}

/**
 * Especificação governada dos cabeçalhos.
 *
 * `REQUIRED` é o mínimo para produzir um contrato canônico: identidade (`cpf`),
 * unidade, status, e os dois números que os detectores aprovados consomem
 * (`parcelas`, `ticket`). `venc` também é required — não porque a data seja
 * utilizável, mas porque a AUSÊNCIA da coluna e a ausência da data são coisas
 * diferentes, e sem a coluna não conseguiríamos distingui-las.
 *
 * `aluno` é `KNOWN_EXTRA` de propósito: existe na fonte, é PII, e não é consumido.
 * Declará-lo aqui evita que apareça como cabeçalho desconhecido a cada mês.
 */
const ESPEC: readonly HeaderSpec[] = Object.freeze([
  { field: "venc", klass: "REQUIRED", accepts: ["venc", "vencimento", "primeiro vencimento"] },
  { field: "cpf", klass: "REQUIRED", accepts: ["cpf"] },
  { field: "unidade", klass: "REQUIRED", accepts: ["unidade"] },
  { field: "status", klass: "REQUIRED", accepts: ["status"] },
  { field: "parcelas", klass: "REQUIRED", accepts: ["parcelas"] },
  { field: "ticket", klass: "REQUIRED", accepts: ["ticket"] },
  { field: "valor_repasse", klass: "OPTIONAL", accepts: ["valor repasse"] },
  { field: "desconto_pct", klass: "OPTIONAL", accepts: ["%", "desconto", "desconto %"] },
  { field: "canal", klass: "OPTIONAL", accepts: ["canal"] },
  { field: "vendedor", klass: "OPTIONAL", accepts: ["vendedor"] },
  { field: "data_contratacao", klass: "OPTIONAL", accepts: ["data contratacao"] },
  { field: "curso", klass: "KNOWN_EXTRA", accepts: ["curso"] },
  { field: "sistema", klass: "KNOWN_EXTRA", accepts: ["sistema"] },
  { field: "aluno", klass: "KNOWN_EXTRA", accepts: ["aluno"] },
  /**
   * Fase 2.13 — `Desembolso` é o PRAZO governado de assinatura/emissão.
   *
   * `OPTIONAL` e não `REQUIRED` por uma razão de contrato: um mês sem esta coluna
   * continua sendo a fonte do Lucas, com população comercial válida. Torná-la
   * obrigatória faria o arquivo inteiro virar `invalid_source` e apagaria os fatos de
   * `A`/`P` que não dependem de prazo. Ausência produz prazo NÃO-AVALIÁVEL por
   * linha, que é a distinção que a fase existe para preservar.
   *
   * `Valor para Desembolso` normaliza para `valor para desembolso` e NÃO colide.
   */
  { field: "desembolso", klass: "OPTIONAL", accepts: ["desembolso"] },
  /**
   * Fase 2.13 — o segundo `Status` da fonte, agora com nome próprio.
   *
   * ─── O incidente que isto fecha ────────────────────────────────────────────
   *
   * A fonte real passou a ter duas colunas chamadas `Status`: uma com datas e `PG`,
   * outra com `A`/`C`/`E`/`P`. `buildHeaderMap` recusou mapear o campo — corretamente
   * — e o Lucas inteiro virou `invalid_source / DUPLICATED_HEADER_FIELD`. O dono da
   * fonte renomeou a primeira para `Status Pagamento`.
   *
   * Declarar o nome aqui faz o campo ser CONHECIDO em vez de desconhecido, e o
   * `comparableHeader` de `status pagamento` é distinto de `status` — então
   * `contract_status` volta a mapear por header único.
   *
   * `KNOWN_EXTRA`: a fonte tem o campo, o repositório o reconhece, e NENHUMA
   * semântica de negócio é atribuída a ele nesta fase. Ele não é alias de `status`,
   * e tratá-lo como tal reintroduziria a colisão com outro nome.
   */
  { field: "status_pagamento", klass: "KNOWN_EXTRA", accepts: ["status pagamento"] },
])

/**
 * Forma comparável de um cabeçalho. Fechada e sem aproximação.
 *
 * `%` sobrevive: a coluna de desconto se chama literalmente `%` na fonte, então
 * remover não-alfanumérico apagaria o nome da coluna inteira.
 */
export function comparableHeader(raw: unknown): string {
  if (raw === null || raw === undefined) return ""
  return String(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase()
}

export interface HeaderMap {
  /** Campo → índice de coluna na grade. */
  readonly index: Readonly<Record<string, number>>
  readonly required_missing: readonly LucasField[]
  readonly optional_missing: readonly LucasField[]
  /** Cabeçalhos presentes que a especificação não conhece. Forma bruta. */
  readonly unknown_headers: readonly string[]
  /** Mesmo campo declarado em duas colunas. Ambiguidade, não conveniência. */
  readonly duplicated_fields: readonly LucasField[]
}

/**
 * Constrói o mapa de cabeçalhos da grade.
 *
 * Cabeçalho repetido para o mesmo campo é registrado como `duplicated_fields` e o
 * campo NÃO é mapeado. Escolher a primeira ou a última ocorrência seria a decisão
 * incidental que este módulo existe para não tomar — se a planilha tem duas colunas
 * `Ticket`, alguém precisa dizer qual vale.
 */
export function buildHeaderMap(headers: readonly unknown[]): HeaderMap {
  const porForma = new Map<string, LucasField>()
  for (const spec of ESPEC) {
    for (const forma of spec.accepts) porForma.set(forma, spec.field)
  }

  const encontrados = new Map<LucasField, number[]>()
  const desconhecidos: string[] = []

  for (const [i, bruto] of headers.entries()) {
    const forma = comparableHeader(bruto)
    if (forma === "") continue // coluna sem cabeçalho: não é campo nem desconhecido
    const campo = porForma.get(forma)
    if (campo === undefined) {
      desconhecidos.push(String(bruto))
      continue
    }
    const lista = encontrados.get(campo) ?? []
    lista.push(i)
    encontrados.set(campo, lista)
  }

  const index: Record<string, number> = {}
  const duplicados: LucasField[] = []
  for (const [campo, posicoes] of encontrados) {
    if (posicoes.length > 1) {
      duplicados.push(campo)
      continue
    }
    const p = posicoes[0]
    if (p !== undefined) index[campo] = p
  }

  const faltando = (k: HeaderClass): LucasField[] =>
    ESPEC.filter((s) => s.klass === k && index[s.field] === undefined).map((s) => s.field)

  return Object.freeze({
    index: Object.freeze(index),
    required_missing: Object.freeze(faltando("REQUIRED")),
    optional_missing: Object.freeze(faltando("OPTIONAL")),
    unknown_headers: Object.freeze([...desconhecidos].sort()),
    duplicated_fields: Object.freeze([...duplicados].sort()),
  })
}

/** Célula de um campo, ou `undefined` quando a coluna não existe na grade. */
export function cell(
  map: HeaderMap,
  row: readonly unknown[],
  field: LucasField,
): unknown | undefined {
  const i = map.index[field]
  if (i === undefined) return undefined
  return row[i]
}
