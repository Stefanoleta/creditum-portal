/**
 * Fase 3.1d-D2E-A4-R3 — a fronteira FIXA que constrói o `CanonicalLivePlanV1`.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * O regate encontrou que a única via até um `CanonicalLivePlanV1` passava pelo worker
 * do fixture. O material derivado da mensagem admitida ficava no Python e nunca virava
 * o plano que Stefano veria — então usar o construtor existente descrevia o fixture, e
 * não usá-lo deixava o Telegram sem plano.
 *
 * Esta entrada fecha a lacuna: lê UM documento de material canônico no stdin, chama o
 * construtor puro, escreve UM plano no stdout.
 *
 * ─── O que ela NÃO é ────────────────────────────────────────────────────────
 *
 * Não é prova de admissão. Um plano válido não diz nada sobre o Telegram ter admitido
 * a mensagem. A procedência é verificada no Python ANTES de qualquer serialização, e
 * NADA de autoridade atravessa: não há `authorized`, token de emissor, alça de
 * registro nem capacidade neste protocolo. O que atravessa é material já derivado.
 *
 * Sem seletor: nenhum `--fixture`, `--live`, `mode=` ou módulo escolhido pelo chamador.
 */

import { PLAN_MATERIAL_TEXT_FIELDS, canonicalLivePlanFromMaterial } from "./live-plan"

const PROTOCOLO_ENTRADA = "creditum_plan_material/1.0.0"
const PROTOCOLO_SAIDA = "creditum_canonical_live_plan_result/1.0.0"
const LIMITE_BYTES = 64 * 1024

/** As chaves EXATAS do material. Nem uma a mais, nem uma a menos. */
const PERMITIDOS = new Set<string>([
  "protocol_version", "execution_id", ...PLAN_MATERIAL_TEXT_FIELDS,
  "tool_count", "stream", "operation",
])

function emite(doc: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(doc) + "\n")
}

async function leEntrada(): Promise<string> {
  const partes: Buffer[] = []
  let total = 0
  for await (const p of process.stdin) {
    const b = p as Buffer
    total += b.length
    if (total > LIMITE_BYTES) throw new Error("MATERIAL_TOO_LARGE")
    partes.push(b)
  }
  return Buffer.concat(partes).toString("utf8")
}

async function main(): Promise<void> {
  let doc: Record<string, unknown>
  try {
    const bruto = await leEntrada()
    const linhas = bruto.split("\n").filter((l) => l.trim() !== "")
    if (linhas.length !== 1) {
      emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
              defect: "MATERIAL_NOT_SINGLE_DOCUMENT" })
      return
    }
    const analisado: unknown = JSON.parse(linhas[0] ?? "")
    if (analisado === null || typeof analisado !== "object" || Array.isArray(analisado)) {
      emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
              defect: "MATERIAL_NOT_OBJECT" })
      return
    }
    doc = analisado as Record<string, unknown>
  } catch (causa) {
    emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
            defect: (causa as Error).message === "MATERIAL_TOO_LARGE"
              ? "MATERIAL_TOO_LARGE" : "MATERIAL_NOT_JSON" })
    return
  }

  if (doc.protocol_version !== PROTOCOLO_ENTRADA) {
    emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
            defect: "MATERIAL_VERSION_UNSUPPORTED" })
    return
  }
  // Nenhum campo de autoridade atravessa. Se algum aparecer, é recusa — não é
  // "ignorado": um campo que o protocolo não conhece é protocolo violado.
  for (const proibido of ["authorized", "admission_evidence", "issuer", "token",
                          "capability", "trusted"]) {
    if (proibido in doc) {
      emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
              defect: "MATERIAL_CARRIES_AUTHORITY" })
      return
    }
  }
  // Contrato FECHADO nas duas direções: falta um campo, recusa; sobra um, recusa.
  //
  // A r4 encontrou que só a metade da frente estava fechada. Uma chave desconhecida
  // era simplesmente ignorada, e "ignorada" é como um campo de autoridade com nome
  // novo entraria sem ser notado — a lista de proibidos acima só nomeia os seis que
  // eu soube imaginar. Fechar o conjunto não depende de eu adivinhar o sétimo.
  for (const c of Object.keys(doc)) {
    if (!PERMITIDOS.has(c)) {
      emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
              defect: "MATERIAL_FIELD_UNKNOWN" })
      return
    }
  }
  for (const c of PERMITIDOS) {
    if (!(c in doc)) {
      emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
              defect: "MATERIAL_FIELD_MISSING" })
      return
    }
  }

  const executionId = doc.execution_id
  if (typeof executionId !== "string" || executionId === "") {
    emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED",
            defect: "MATERIAL_EXECUTION_ID_INVALID" })
    return
  }

  // O construtor canônico da a2. Nenhum hash é recalculado aqui além do da d1.
  const r = canonicalLivePlanFromMaterial(executionId, doc)
  if (r.status !== "planned") {
    emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "REJECTED", defect: r.defect })
    return
  }
  emite({ protocol_version: PROTOCOLO_SAIDA, outcome: "PLAN_BUILT", plan: r.plan })
}

void main()
