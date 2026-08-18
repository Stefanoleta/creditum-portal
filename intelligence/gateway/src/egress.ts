/**
 * Fronteiras de PII.
 *
 * O scanner (`pii.ts`) detecta. Este módulo **aplica a política**, e aplica nos
 * quatro sentidos que o §12.1 exige — não só na saída do gateway:
 *
 *   to_model    conteúdo ENTRANDO no contexto do modelo (respostas do gateway,
 *               prompts, briefings). É aqui que PII vazaria para um provedor
 *               externo, então é o ponto mais crítico dos quatro.
 *   from_model  saída do modelo, antes de ser persistida ou apresentada.
 *   memory      escrita na memória do agente, que sobrevive à sessão.
 *   log         trilha, trace e telemetria.
 *
 * Os três primeiros são **fail-closed**: PII detectada aborta a operação.
 *
 * `log` é diferente de propósito. O briefing manda "redigir logs antes de
 * exportá-los", não "não logar". Então `guardEgress(x, "log")` também aborta —
 * para que ninguém logue conteúdo cru por acidente — e o caminho correto é
 * passar por `redactForLog()` primeiro. Redigir tem que ser um ato explícito.
 */

import { scanForPII } from "./pii"
import type { PIIFinding } from "./pii"

export type EgressChannel = "to_model" | "from_model" | "memory" | "log"

export class PIIEgressError extends Error {
  readonly channel: EgressChannel
  readonly findings: readonly PIIFinding[]

  constructor(channel: EgressChannel, findings: readonly PIIFinding[]) {
    const resumo = findings.map((f) => `${f.path} (${f.kind})`).join(", ")
    super(`PII bloqueada na fronteira "${channel}": ${resumo}`)
    this.name = "PIIEgressError"
    this.channel = channel
    this.findings = findings
  }
}

/**
 * Barreira obrigatória em toda fronteira de PII.
 *
 * Não devolve booleano de propósito: um resultado que dá para ignorar acaba
 * ignorado. Ou passa, ou levanta.
 */
export function guardEgress(payload: unknown, channel: EgressChannel): void {
  const findings = scanForPII(payload)
  if (findings.length > 0) {
    throw new PIIEgressError(channel, findings)
  }
}

/**
 * Versão que informa em vez de abortar.
 *
 * Existe para o plano de captura registrar no ledger QUE um bloqueio aconteceu,
 * sem precisar capturar exceção só para inspecioná-la.
 */
export function inspectEgress(
  payload: unknown,
  channel: EgressChannel,
): { readonly channel: EgressChannel; readonly blocked: boolean; readonly findings: readonly PIIFinding[] } {
  const findings = scanForPII(payload)
  return { channel, blocked: findings.length > 0, findings }
}

const REDACTED = "[REDIGIDO]"

/**
 * Devolve uma cópia segura para log.
 *
 * Duas formas de redação, conforme o que denuncia o dado:
 *
 *   - **Chave proibida** (`cpf`, `nome`, `telefone`…): o valor é descartado
 *     inteiro E a chave é renomeada com sufixo `_redacted`. Renomear é
 *     necessário, não cosmético: `scanForPII` acusa a chave independentemente do
 *     valor, então uma cópia que mantivesse a chave original jamais passaria
 *     pela própria barreira. O nome do campo permanece legível (`cpf_redacted`),
 *     que é o que a investigação precisa — saber que ali havia um CPF não é PII.
 *   - **Valor com PII embutida** em campo de nome inocente: só o trecho
 *     ofensivo é substituído, para a mensagem continuar útil.
 *
 * A saída passa por `guardEgress(..., "log")` antes de retornar. A barreira é a
 * mesma, sem exceção nem modo especial — se a redação deixou passar alguma
 * coisa, isso levanta aqui e não vira linha de log.
 */
export function redactForLog(payload: unknown): unknown {
  const redacted = redact(payload, null, new WeakMap())
  guardEgress(redacted, "log")
  return redacted
}

const EMAIL_G = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const CPF_G = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g
const PHONE_G = /(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}/g
const SHA256_RE = /^[a-f0-9]{64}$/
const SUBJECT_REF_RE = /^subj_[a-f0-9]{16}$/

/** Mesmas chaves de `pii.ts`. Duplicado por dependência de direção, não por descuido. */
const FORBIDDEN_KEYS = new Set([
  "cpf",
  "cpf_cnpj",
  "documento",
  "nome",
  "full_name",
  "nome_completo",
  "aluno",
  "student_name",
  "telefone",
  "phone",
  "celular",
  "whatsapp",
  "email",
  "e_mail",
  "mail",
  "endereco",
  "address",
  "rg",
  "birth_date",
  "data_nascimento",
])

const ALLOWED_NAME_CONTEXTS = new Set(["observed_metric", "reference_metric", "metric", "metrics"])
const TECHNICAL_IDENTIFIER_RE = /^[a-z][a-z0-9_]{0,127}$/

function redactString(value: string): string {
  if (SHA256_RE.test(value) || SUBJECT_REF_RE.test(value)) return value
  return value
    .replace(EMAIL_G, REDACTED)
    .replace(CPF_G, REDACTED)
    .replace(PHONE_G, REDACTED)
}

const SHA256_KEY_RE = /^[a-f0-9]{64}$/
const SUBJECT_KEY_RE = /^subj_[a-f0-9]{16}$/

/**
 * Cópias SEM a flag `g`.
 *
 * `RegExp.test` em regex global é stateful: avança `lastIndex` e a chamada
 * seguinte com a mesma string devolve `false`. Reaproveitar `EMAIL_G` aqui faria
 * a redação alternar entre pegar e não pegar a mesma chave.
 */
const EMAIL_T = new RegExp(EMAIL_G.source, "i")
const CPF_T = new RegExp(CPF_G.source)
const PHONE_T = new RegExp(PHONE_G.source)

/** A chave carrega PII determinística? Espelha `scanKey` de `pii.ts`. */
function chaveTemPII(key: string): boolean {
  if (SHA256_KEY_RE.test(key) || SUBJECT_KEY_RE.test(key)) return false
  return EMAIL_T.test(key) || CPF_T.test(key) || PHONE_T.test(key)
}

/**
 * Alocador de nomes de chave à prova de colisão.
 *
 * Nome gerado (`cpf_redacted`, `[REDIGIDO-chave]`) podia sobrescrever chave
 * original, chave já emitida, ou outro nome de redação — e o resultado passava
 * pelo guard, porque o valor que sobrescreve é benigno. O log perdia uma
 * entrada em silêncio, que é o pior tipo de falha numa trilha de auditoria.
 *
 * O conjunto é semeado com TODAS as chaves originais do objeto, então o
 * resultado não depende da ordem de enumeração: `cpf` antes de `cpf_redacted`
 * ou depois produz o mesmo par de chaves distintas.
 */
function criarAlocador(chavesOriginais: readonly string[]): (base: string) => string {
  const usadas = new Set(chavesOriginais)

  return (base: string): string => {
    if (!usadas.has(base)) {
      usadas.add(base)
      return base
    }
    let n = 1
    while (usadas.has(`${base}~${n}`)) n += 1
    const nome = `${base}~${n}`
    usadas.add(nome)
    return nome
  }
}

function redact(value: unknown, contextKey: string | null, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return redactString(value)
  if (value === null || typeof value !== "object") return value

  const cached = seen.get(value)
  if (cached !== undefined) return cached

  if (Array.isArray(value)) {
    const out: unknown[] = []
    seen.set(value, out)
    for (const item of value) out.push(redact(item, contextKey, seen))
    return out
  }

  // Sem protótipo: as chaves aqui vêm de dado não confiável, e num objeto comum
  // `out["__proto__"] = x` mexe na cadeia de protótipos em vez de criar
  // propriedade. Com protótipo nulo, `__proto__` é uma chave como outra
  // qualquer — e continua sendo redigida se carregar PII.
  const out = Object.create(null) as Record<string, unknown>
  seen.set(value, out)

  const chaves = Object.keys(value)
  const alocar = criarAlocador(chaves)

  for (const key of chaves) {
    const child = (value as Record<string, unknown>)[key]
    const lowered = key.toLowerCase()

    if (FORBIDDEN_KEYS.has(lowered)) {
      out[alocar(`${key}_redacted`)] = REDACTED
      continue
    }

    if (chaveTemPII(key)) {
      out[alocar("[REDIGIDO-chave]")] = redact(child, key, seen)
      continue
    }

    if (lowered === "name") {
      const contextoOk = contextKey !== null && ALLOWED_NAME_CONTEXTS.has(contextKey)
      const valorOk = typeof child === "string" && TECHNICAL_IDENTIFIER_RE.test(child)
      if (contextoOk && valorOk) {
        out[key] = child
      } else {
        out[alocar(`${key}_redacted`)] = REDACTED
      }
      continue
    }

    out[key] = redact(child, key, seen)
  }

  return out
}
