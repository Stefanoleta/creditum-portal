/**
 * A fronteira EXTERNA do Google: token e HTTP. Nada mais.
 *
 * ─── Por que a costura de teste é AQUI, e não no `LucasDrivePort` ──────────────
 *
 * O gate final da Fase 2.11 encontrou o defeito exato: `productionLucasProvider`
 * validava credencial e exigia que o CHAMADOR fornecesse o `LucasDrivePort`. Não
 * havia implementação de produção — só `FakeDrive` de teste. O código validava
 * acesso ao Google e não conseguia falar com o Google.
 *
 * A correção não é só escrever o adaptador: é mover a costura de teste para baixo
 * dele. `LucasDrivePort` deixa de ser injetável no caminho de produção, e o que se
 * pode substituir num teste é o transporte HTTP e a fonte de token — a fronteira
 * onde o processo de fato sai da máquina.
 *
 * A consequência é a que interessa: `productionLucasProvider()` não tem parâmetro
 * onde caiba um `FakeDrive`. O defeito que o gate apontou não é mais expressável.
 *
 * ─── Duas interfaces minúsculas, de propósito ─────────────────────────────────
 *
 * `get` e `accessToken`. Nenhum método de escrita, nenhum `post`, `patch` ou
 * `delete`. O adaptador de produção não tem como escrever no Drive nem se quisesse:
 * não existe a operação. É a mesma disciplina do `LucasDrivePort`, um nível abaixo.
 */

/** Resposta HTTP já desserializada. `status` preservado para o mapeamento de erro. */
export interface GoogleHttpResponse {
  readonly status: number
  /** Corpo como JSON, ou `undefined` quando não havia corpo desserializável. */
  readonly json: unknown
}

/**
 * GET autenticado. Único verbo — a fronteira é somente leitura por FORMA.
 *
 * Quem implementa é responsável por LANÇAR em falha de transporte (DNS, socket,
 * timeout). Status não-2xx NÃO deve lançar: o adaptador precisa do código para
 * distinguir 401 de 403 de 404 de 429, e transformar todos num `Error` genérico
 * perderia essa informação.
 */
export interface GoogleHttp {
  get(url: string, headers: Readonly<Record<string, string>>): Promise<GoogleHttpResponse>
}

/** Fonte de access token. Quem implementa cuida de cache e renovação. */
export interface GoogleAccessTokenSource {
  accessToken(): Promise<string>
}

/**
 * Erro de uma chamada ao Google, com o suficiente para diagnosticar e nada mais.
 *
 * Carrega `status`, a operação e o recurso — nunca token, header de autorização,
 * chave privada ou corpo bruto da resposta. A mensagem de erro do Google pode
 * repetir credencial em alguns casos, então só a `reason` normalizada sai daqui.
 */
export class GoogleApiError extends Error {
  readonly status: number
  readonly operation: string
  readonly resource: string
  readonly reason: string

  constructor(operation: string, resource: string, status: number, reason: string) {
    super(`Google ${operation} falhou (${status}): ${reason} [${resource}]`)
    this.name = "GoogleApiError"
    this.status = status
    this.operation = operation
    this.resource = resource
    this.reason = reason
  }
}

/**
 * Classe do erro do Google, derivada do status. Legível por máquina.
 *
 * Existe para que o `detail` do `source_error` diga algo acionável — "permissão" é
 * uma conversa com quem administra a pasta; "quota" é uma conversa sobre volume.
 */
export function googleErrorClass(status: number): string {
  if (status === 401) return "UNAUTHENTICATED"
  if (status === 403) return "PERMISSION_DENIED_OR_QUOTA"
  if (status === 404) return "NOT_FOUND"
  if (status === 429) return "RATE_LIMITED"
  if (status >= 500) return "BACKEND_ERROR"
  return "REQUEST_REJECTED"
}

/**
 * Extrai a razão do corpo de erro do Google, sem propagar texto arbitrário.
 *
 * O corpo do Google traz `error.message`, que é útil e vem de fonte externa. Ele é
 * truncado e higienizado: `Authorization`, `Bearer` e qualquer coisa parecida com
 * chave privada nunca atravessam, porque este texto acaba num `detail` que pode ser
 * logado.
 */
export function googleErrorReason(status: number, body: unknown): string {
  const classe = googleErrorClass(status)
  const msg = extrairMensagem(body)
  if (msg === null) return classe
  const limpo = msg
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "[redigido]")
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/gu, "[redigido]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 200)
  return limpo === "" ? classe : `${classe}: ${limpo}`
}

function extrairMensagem(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const erro = (body as { readonly error?: unknown }).error
  if (typeof erro === "string") return erro
  if (typeof erro !== "object" || erro === null) return null
  const msg = (erro as { readonly message?: unknown }).message
  return typeof msg === "string" ? msg : null
}
