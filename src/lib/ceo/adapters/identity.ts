import { createHash } from "crypto"
import { parseText } from "../parse"

// Identidade de registro externo (D6, endurecido na 3ª revisão).
//
// A planilha não tem IDs. Precisamos responder a duas perguntas DIFERENTES, e
// confundi-las custa caro nos dois sentidos:
//
//   "é a mesma OCORRÊNCIA?"  → sourceRecordId   (evita gravar duas vezes)
//   "o CONTEÚDO mudou?"      → contentHash      (detecta edição na fonte)
//
// Uma primeira versão usava só o conteúdo para as duas. O efeito: duas linhas
// distintas com conteúdo idêntico colidiam, a segunda não entrava, e a
// duplicata da fonte — que é justamente um DATA_CONFLICT a reportar — ficava
// invisível. Pior que perder o dado é perder o sinal de que ele estava errado.

/**
 * Serializa os valores de forma estável.
 *
 * Chaves ordenadas e texto normalizado: reordenar colunas na planilha ou
 * acrescentar espaço não pode parecer mudança de conteúdo.
 */
export function stableContent(values: Record<string, unknown>): string {
  const keys = Object.keys(values).sort()
  const parts: string[] = []
  for (const k of keys) {
    const v = values[k]
    const norm = v === null || v === undefined ? "" : (parseText(v) ?? "")
    parts.push(`${k}=${norm}`)
  }
  return parts.join("")
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

export interface RecordIdentity {
  sourceRecordId: string
  rowKey: string
  contentHash: string
}

/**
 * `locator` deve identificar a POSIÇÃO da linha na fonte (ex. `{ row: 42 }`).
 *
 * O número da linha é instável — inserir uma linha no meio desloca todas as
 * seguintes — e por isso ele não serve como identidade da linha ao longo do
 * tempo. Mas ele é indispensável para separar duas ocorrências distintas
 * DENTRO de um mesmo snapshot, que é o que o `sourceRecordId` precisa fazer.
 *
 * O pareamento entre snapshots usa `contentHash`, não o localizador.
 */
export function computeIdentity(
  source: string,
  tabKey: string,
  locator: Record<string, unknown>,
  values: Record<string, unknown>,
): RecordIdentity {
  const content = stableContent(values)
  const contentHash = sha256(content)

  const locatorKeys = Object.keys(locator).sort()
  const locatorText = locatorKeys.map((k) => `${k}=${String(locator[k])}`).join("|")

  return {
    contentHash,
    rowKey: sha256(`${source}|${tabKey}|${locatorText}`),
    sourceRecordId: sha256(`${source}|${tabKey}|${locatorText}|${contentHash}`),
  }
}

/**
 * Duplicata DENTRO de um mesmo lote: mesmo conteúdo em posições diferentes.
 *
 * Isso não é retry técnico — é a fonte tendo a mesma linha duas vezes, e o CEO
 * precisa saber. Devolve os grupos com mais de uma ocorrência.
 */
export function findDuplicateContent(
  records: readonly { sourceRecordId: string; contentHash: string; locator: Record<string, unknown> }[],
): Array<{ contentHash: string; occurrences: Array<Record<string, unknown>> }> {
  const byContent = new Map<string, Array<Record<string, unknown>>>()
  for (const r of records) {
    const list = byContent.get(r.contentHash) ?? []
    list.push(r.locator)
    byContent.set(r.contentHash, list)
  }
  return [...byContent.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([contentHash, occurrences]) => ({ contentHash, occurrences }))
}
