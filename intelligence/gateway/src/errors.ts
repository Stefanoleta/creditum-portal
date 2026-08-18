/**
 * Erros do plano de consulta.
 *
 * Todos carregam um `code` estável porque o ledger registra o motivo do bloqueio,
 * não a mensagem. Mensagem é para humano; código é para auditoria (§13).
 */

export type GatewayErrorCode =
  | "NOT_ALLOWED"
  | "UNKNOWN_CAPABILITY"
  | "UNKNOWN_SNAPSHOT"
  | "UNKNOWN_EVENT"
  | "FIELD_NOT_ALLOWED"
  | "SOURCE_NOT_ALLOWED"
  | "PII_DETECTED"
  | "SCHEMA_INVALID"
  | "WRITE_ATTEMPTED"

export class GatewayError extends Error {
  readonly code: GatewayErrorCode
  readonly details: readonly string[]

  constructor(code: GatewayErrorCode, message: string, details: readonly string[] = []) {
    // Os detalhes entram na mensagem, não só em `details`. Um erro de contrato
    // ou de integridade só é acionável se disser QUAL campo e QUAL referência —
    // e `message` é o que aparece em stack trace, log e falha de teste.
    super(details.length > 0 ? `${message}: ${details.join("; ")}` : message)
    this.name = "GatewayError"
    this.code = code
    this.details = details
  }
}

/**
 * Levantado quando algo tenta alcançar uma rota de escrita a partir do plano de
 * consulta. Não deveria ser alcançável por construção — existe para que a
 * tentativa apareça no ledger em vez de falhar em silêncio (§15).
 */
export class WriteAttemptedError extends GatewayError {
  constructor(attempted: string) {
    super(
      "WRITE_ATTEMPTED",
      `Tentativa de escrita a partir do plano de consulta: ${attempted}`,
      [attempted],
    )
    this.name = "WriteAttemptedError"
  }
}
