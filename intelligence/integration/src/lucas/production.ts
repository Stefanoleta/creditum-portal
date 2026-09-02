/**
 * Bootstrap de produção. Constrói o adaptador Google de verdade.
 *
 * ─── O defeito que a Fase 2.11b corrige ───────────────────────────────────────
 *
 * O gate final da 2.11 deu NO-SHIP com um achado exato, e o achado estava certo:
 *
 *   productionLucasProvider(drive: LucasDrivePort, env) → LucasMonthlyContractsProvider
 *
 * A função validava `GOOGLE_SERVICE_ACCOUNT_*` e **nunca usava** as credenciais para
 * construir cliente nenhum. Exigia que o chamador entregasse o `LucasDrivePort`, e a
 * única implementação existente era `FakeDrive`, de teste. O resultado era pior que
 * um adaptador faltando: o código afirmava que o acesso estava configurado e não
 * havia caminho pelo qual a planilha real chegasse.
 *
 * ─── A correção, e por que a assinatura importa ────────────────────────────────
 *
 * `productionLucasProvider()` não tem mais parâmetro de porta. Ele lê a configuração,
 * constrói o cliente autenticado, constrói `GoogleDriveSheetsSource` e devolve o
 * provider. Não existe onde passar um `FakeDrive` — o defeito deixou de ser
 * expressável, não apenas de estar corrigido.
 *
 * A costura de teste desceu para a fronteira externa: `GoogleHttp` e
 * `GoogleAccessTokenSource`, o ponto em que o processo de fato sai da máquina. Um
 * teste do bootstrap substitui o transporte e continua exercitando o adaptador real —
 * a query do Drive, o range da aba, o mapeamento de erro.
 *
 * ─── A fronteira de configuração ──────────────────────────────────────────────
 *
 * Credencial ausente é falha de BOOTSTRAP, não `source_error`. A distinção não é
 * formal: `source_error` afirma que tentamos ler e a fonte falhou. Sem credencial
 * nunca chegamos a tentar, não há período sobre o qual afirmar nada, e não existe
 * captura para carregar um estado. Uma exceção aqui é a resposta honesta.
 *
 * **Não existe fallback**, e o caminho nem foi escrito. Ler uma fixture local sem
 * credencial produziria número executivo indistinguível de um derivado da fonte
 * oficial, porque `content_hash` e procedência pareceriam legítimos.
 */

import { GoogleAuth } from "google-auth-library"
import { GatewayError } from "../../../gateway/src/errors"
import { LucasMonthlyContractsProvider } from "./provider"
import type { LucasProviderConfig } from "./provider"
import { GOOGLE_READONLY_SCOPES, GoogleDriveSheetsSource } from "./google-drive-source"
import type { GoogleAccessTokenSource, GoogleHttp, GoogleHttpResponse } from "./google-http"
import { runLucasCurrentPeriodAnalysis } from "./analysis"
import type { LucasAnalysisOutcome, LucasAnalysisRequest, LucasAnalysisSeams } from "./analysis"

/**
 * Variáveis obrigatórias. NOMES apenas — valor nunca é registrado nem logado.
 *
 * Service account é a forma certa para esta fonte: a ingestão roda sem humano
 * presente, e OAuth de usuário exigiria alguém reautorizando. A conta recebe leitura
 * na pasta oficial e em nada mais — o escopo da permissão no Google é a garantia
 * externa que corresponde à porta somente-leitura aqui dentro.
 *
 * Os nomes são os já governados na 2.11. Não há segundo formato de credencial.
 */
export const REQUIRED_GOOGLE_ENV: readonly string[] = Object.freeze([
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
])

export type GoogleAccessStatus =
  | { readonly status: "configured" }
  | { readonly status: "not_configured"; readonly missing: readonly string[] }

/**
 * Estado da configuração. Verifica PRESENÇA — nunca lê nem loga o valor.
 *
 * Devolve estado em vez de lançar para que um health check possa perguntar "está
 * configurado?" sem provocar exceção, e sem que a resposta contenha segredo.
 *
 * Isto responde apenas se a configuração EXISTE. Se a credencial é válida e tem
 * acesso à pasta, só o Google responde — e a resposta é `source_error` no `load()`,
 * não aqui.
 */
export function googleAccessStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GoogleAccessStatus {
  const missing = REQUIRED_GOOGLE_ENV.filter((k) => {
    const v = env[k]
    return v === undefined || v.trim() === ""
  })
  return missing.length === 0 ? { status: "configured" } : { status: "not_configured", missing }
}

/**
 * Normaliza a chave privada vinda de variável de ambiente.
 *
 * Gerenciadores de segredo e arquivos `.env` guardam a chave PEM com `\n` literal de
 * duas letras, porque a variável é uma linha só. Sem desescapar, a
 * `google-auth-library` recebe uma chave de uma linha e falha na assinatura — um erro
 * que se manifesta como 401 e manda quem investiga procurar permissão em vez de
 * formato.
 *
 * A função NÃO valida nem inspeciona o conteúdo, e o valor não sai daqui.
 */
function normalizarChave(bruta: string): string {
  return bruta.includes("\\n") ? bruta.replace(/\\n/gu, "\n") : bruta
}

/** `fetch` como `GoogleHttp`. Único ponto do subsistema que abre socket. */
const FETCH_HTTP: GoogleHttp = {
  async get(url: string, headers: Readonly<Record<string, string>>): Promise<GoogleHttpResponse> {
    const r = await fetch(url, { method: "GET", headers: { ...headers } })
    // Corpo ilegível não é motivo para lançar aqui: o `status` já carrega o veredito,
    // e o adaptador precisa dele para classificar 401/403/404/429.
    let json: unknown
    try {
      json = await r.json()
    } catch {
      json = undefined
    }
    return { status: r.status, json }
  },
}

/**
 * `GoogleAuth` como fonte de token.
 *
 * A biblioteca oficial assina o JWT do service account, troca por access token e
 * mantém cache com renovação. Nada de assinatura escrita à mão.
 */
class ServiceAccountTokenSource implements GoogleAccessTokenSource {
  readonly #auth: GoogleAuth

  constructor(client_email: string, private_key: string) {
    this.#auth = new GoogleAuth({
      credentials: { client_email, private_key },
      scopes: [...GOOGLE_READONLY_SCOPES],
    })
  }

  async accessToken(): Promise<string> {
    const token = await this.#auth.getAccessToken()
    if (typeof token !== "string" || token === "") {
      // Mensagem sem eco de credencial.
      throw new Error("google-auth-library não devolveu access token")
    }
    return token
  }
}

/**
 * Costuras da fronteira EXTERNA. Test-only.
 *
 * Repare no que NÃO está aqui: `LucasDrivePort`. Um teste pode substituir o
 * transporte HTTP e o token — e continua exercitando `GoogleDriveSheetsSource` real,
 * com a query do Drive e o range da aba de verdade. Não pode substituir o adaptador,
 * que é precisamente o que o gate apontou como ausente.
 */
export interface ProductionSeams {
  readonly http?: GoogleHttp
  readonly tokenSource?: GoogleAccessTokenSource
  /** Relógio, para que o teste do bootstrap seja determinístico. */
  readonly now?: () => Date
}

/**
 * Provider de PRODUÇÃO. Constrói o adaptador Google real.
 *
 * Lança `GatewayError` quando a configuração falta — antes de qualquer requisição.
 * A mensagem cita NOMES de variável, nunca valores: um erro de configuração que
 * imprimisse a chave privada trocaria um problema de acesso por um vazamento.
 */
export function productionLucasProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
  seams: ProductionSeams = {},
): LucasMonthlyContractsProvider {
  const acesso = googleAccessStatus(env)
  if (acesso.status === "not_configured") {
    throw new GatewayError(
      "NOT_ALLOWED",
      "Acesso ao Google Drive não configurado — a fonte do Lucas não pode ser lida",
      [
        `variáveis ausentes: ${acesso.missing.join(", ")}`,
        "erro de BOOTSTRAP, não source_error: nenhuma requisição foi tentada",
        "não existe fallback para fixture, por decisão da Fase 2.11 §67",
      ],
    )
  }

  const email = env["GOOGLE_SERVICE_ACCOUNT_EMAIL"]
  const chave = env["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"]
  if (email === undefined || chave === undefined) {
    // Inalcançável: `googleAccessStatus` já garantiu presença. O narrowing mantém a
    // promessa sem asserção — e um `!` aqui seria a afirmação que este subsistema
    // inteiro evita.
    throw new GatewayError("NOT_ALLOWED", "configuração do Google inconsistente", [
      "presença verificada e leitura falhou",
    ])
  }

  const tokenSource =
    seams.tokenSource ?? new ServiceAccountTokenSource(email, normalizarChave(chave))
  const http = seams.http ?? FETCH_HTTP

  // Aqui é o elo que faltava: a porta de produção, construída, nunca recebida.
  const drive = new GoogleDriveSheetsSource(http, tokenSource)

  const config: LucasProviderConfig = {
    drive,
    ...(seams.now === undefined ? {} : { now: seams.now }),
  }
  return new LucasMonthlyContractsProvider(config)
}

/**
 * Fábrica para TESTE determinístico, com porta injetada.
 *
 * Separada da de produção de propósito, e o nome diz para que serve. Enquanto as
 * duas eram a mesma função, "aceitar porta injetada" e "ser o caminho de produção"
 * eram a mesma coisa — que é como o defeito passou pelos gates anteriores.
 */
export function createLucasMonthlyContractsProviderForTests(
  config: LucasProviderConfig,
): LucasMonthlyContractsProvider {
  return new LucasMonthlyContractsProvider(config)
}

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.12b — o ponto de entrada de PRODUÇÃO da análise
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Constrói o provider de produção e roda a análise do mês corrente.
 *
 * ─── Por que isto existe além de `productionLucasProvider` ────────────────────
 *
 * O gate da 2.12 encontrou o defeito: o bootstrap parava depois de construir o
 * provider, e a análise ficava como peça sem chamador. `toMaterialSingleCaseInput` e
 * `detectMaterialSingleCase` não tinham nenhum chamador de produção, e
 * `currentPeriod` aparecia só em comentário.
 *
 * Este é o chamador. Um runtime que queira a análise chama UMA função e recebe um
 * estado discriminado — não monta a cadeia por conta própria. Montar a cadeia era
 * justamente o que permitia montá-la errado.
 *
 * ─── Não agenda nada ──────────────────────────────────────────────────────────
 *
 * Sem cron, sem fila, sem execução em background. É um ponto de entrada CHAMÁVEL.
 * Quem decide quando chamar é o runtime, e isso é fase posterior.
 */
export async function runProductionLucasAnalysis(
  request: Omit<LucasAnalysisRequest, "provider">,
  env: Readonly<Record<string, string | undefined>> = process.env,
  seams: ProductionSeams & LucasAnalysisSeams = {},
): Promise<LucasAnalysisOutcome> {
  // Credencial ausente continua lançando aqui, como bootstrap — antes de qualquer
  // requisição e antes de qualquer análise. Não há captura sobre a qual afirmar nada.
  const provider = productionLucasProvider(env, seams)
  return runLucasCurrentPeriodAnalysis({ ...request, provider }, seams)
}
