/**
 * Detecção de PII.
 *
 * Regra do briefing (§12.1): nunca registrar CPF, nome, telefone ou e-mail em
 * prompt, memória, trace ou log externo. Este módulo é o detector; quem aplica a
 * política nas fronteiras é `egress.ts`.
 *
 * Três checagens independentes, porque cada uma pega o que as outras deixam:
 *   - por CHAVE     — o nome do campo denuncia a intenção mesmo com valor vazio
 *   - por VALOR     — o conteúdo denuncia mesmo com chave inocente (`ref`, `obs`)
 *   - por CONTEXTO  — `name` é legítimo em `metric.name` e suspeito em qualquer
 *                     outro lugar; ver "A regra do `name`" abaixo
 *
 * Falso positivo custa uma exceção; falso negativo custa LGPD.
 */

export type PIIKind =
  | "cpf"
  | "phone"
  | "email"
  | "pii_field_name"
  /** `name` fora dos caminhos técnicos previstos pelos contratos. */
  | "name_out_of_context"
  /** `name` em caminho técnico, mas com valor que não é identificador técnico. */
  | "name_not_technical"

export interface PIIFinding {
  readonly kind: PIIKind
  readonly path: string
  /** Nunca contém o valor detectado — registrar o achado não pode vazar o dado. */
  readonly hint: string
}

/** Chaves que não podem existir em nenhum caminho, em qualquer profundidade. */
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

/**
 * A regra do `name`.
 *
 * `name` não é liberado globalmente e não é proibido globalmente. Ele é aceito
 * **apenas** nos caminhos onde os contratos preveem um identificador de métrica
 * — e, mesmo ali, apenas se o valor for um identificador técnico.
 *
 * Isso fecha o furo de `{"observed_metric": {"name": "Maria da Silva"}}`, que uma
 * liberação por nome de chave deixaria passar direto para o modelo.
 */
const ALLOWED_NAME_CONTEXTS = new Set(["observed_metric", "reference_metric", "metric", "metrics"])

/** snake_case minúsculo — a forma que os contratos usam para nome de métrica. */
const TECHNICAL_IDENTIFIER_RE = /^[a-z][a-z0-9_]{0,127}$/

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i

/** sha256 e pseudônimos são hex longo — isentos das checagens numéricas. */
const SHA256_RE = /^[a-f0-9]{64}$/
const SUBJECT_REF_RE = /^subj_[a-f0-9]{16}$/

/**
 * CPF: 11 dígitos, com ou sem pontuação, delimitado.
 * O delimitador impede que um trecho de hash vire "CPF".
 */
const CPF_RE = /(?:^|[^\dA-Za-z])(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?:[^\dA-Za-z]|$)/

/** Telefone BR: DDD + 8 ou 9 dígitos, com ou sem +55 e pontuação. */
const PHONE_RE =
  /(?:^|[^\dA-Za-z])(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?:[^\dA-Za-z]|$)/

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "")
}

function isExemptToken(value: string): boolean {
  return SHA256_RE.test(value) || SUBJECT_REF_RE.test(value)
}

function looksLikeCPF(value: string): boolean {
  const m = CPF_RE.exec(value)
  if (m === null) return false
  const captured = m[1]
  if (captured === undefined) return false
  return digitsOnly(captured).length === 11
}

function looksLikePhone(value: string): boolean {
  if (!PHONE_RE.test(value)) return false
  const n = digitsOnly(value).length
  // 10 = fixo com DDD, 11 = móvel com DDD, 12/13 = com +55.
  return n >= 10 && n <= 13
}

function scanString(value: string, path: string, out: PIIFinding[]): void {
  if (isExemptToken(value)) return

  if (EMAIL_RE.test(value)) {
    out.push({ kind: "email", path, hint: "valor parece um endereço de e-mail" })
  }
  if (looksLikeCPF(value)) {
    out.push({ kind: "cpf", path, hint: "valor tem 11 dígitos no formato de CPF" })
  } else if (looksLikePhone(value)) {
    // else-if: um CPF sem pontuação também casa com telefone; reportar o mais grave.
    out.push({ kind: "phone", path, hint: "valor tem formato de telefone brasileiro" })
  }
}

/**
 * PII na CHAVE, não no valor.
 *
 * O walker antigo só olhava valores. Mas há mapas cuja chave É dado — o
 * `unit_breakdown` do payload aceita chaves dinâmicas, então
 * `{"11987654321": 3}` passava pelo contrato, pela allowlist e pela fronteira
 * sem ninguém olhar.
 *
 * Toda chave é verificada, e não só as de uma lista de mapas conhecidos: manter
 * lista significaria esquecer o próximo mapa. Só detectores **determinísticos**
 * rodam aqui (CPF, telefone, e-mail) — nome de pessoa em chave é o resíduo R1,
 * que se fecha com o vocabulário canônico de unidades, não com heurística.
 *
 * Falso positivo é improvável: nome de campo de schema não tem 11 dígitos nem
 * arroba. `de_13_a_19` e `2026-08` têm dígitos demais de menos.
 */
function scanKey(key: string, path: string, out: PIIFinding[]): void {
  if (isExemptToken(key)) return

  if (EMAIL_RE.test(key)) {
    out.push({ kind: "email", path, hint: "a CHAVE do mapa parece um endereço de e-mail" })
  }
  if (looksLikeCPF(key)) {
    out.push({ kind: "cpf", path, hint: "a CHAVE do mapa tem 11 dígitos no formato de CPF" })
  } else if (looksLikePhone(key)) {
    out.push({ kind: "phone", path, hint: "a CHAVE do mapa tem formato de telefone brasileiro" })
  }
}

function checkNameField(value: unknown, path: string, contextKey: string | null, out: PIIFinding[]): void {
  if (contextKey === null || !ALLOWED_NAME_CONTEXTS.has(contextKey)) {
    out.push({
      kind: "name_out_of_context",
      path,
      hint: `campo "name" só é permitido em ${[...ALLOWED_NAME_CONTEXTS].join(", ")}`,
    })
    return
  }

  if (typeof value !== "string" || !TECHNICAL_IDENTIFIER_RE.test(value)) {
    out.push({
      kind: "name_not_technical",
      path,
      hint: "campo \"name\" em caminho técnico exige identificador snake_case minúsculo",
    })
  }
}

/**
 * Varre uma estrutura arbitrária em busca de PII.
 *
 * Retorna todos os achados em vez de parar no primeiro: quem for corrigir
 * precisa da lista inteira, não de uma descoberta por rodada.
 */
export function scanForPII(value: unknown, basePath = "$"): PIIFinding[] {
  const findings: PIIFinding[] = []
  walk(value, basePath, null, findings, new WeakSet())
  return findings
}

function walk(
  value: unknown,
  path: string,
  contextKey: string | null,
  out: PIIFinding[],
  seen: WeakSet<object>,
): void {
  if (typeof value === "string") {
    scanString(value, path, out)
    return
  }

  if (value === null || typeof value !== "object") return

  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    // Índice de array não muda o contexto: em `metrics[0].name`, o contexto
    // continua sendo `metrics`.
    value.forEach((item, i) => {
      walk(item, `${path}[${i}]`, contextKey, out, seen)
    })
    return
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    const lowered = key.toLowerCase()

    if (FORBIDDEN_KEYS.has(lowered)) {
      out.push({
        kind: "pii_field_name",
        path: childPath,
        hint: `campo "${key}" é proibido`,
      })
    } else if (lowered === "name") {
      checkNameField(child, childPath, contextKey, out)
    }

    scanKey(key, childPath, out)
    walk(child, childPath, key, out, seen)
  }
}

/** Conveniência para os pontos onde PII deve abortar a operação. */
export function assertNoPII(value: unknown, context: string): void {
  const findings = scanForPII(value)
  if (findings.length > 0) {
    const paths = findings.map((f) => `${f.path} (${f.kind})`)
    throw new Error(`PII detectada em ${context}: ${paths.join(", ")}`)
  }
}
