#!/usr/bin/env bash
#
# Sonda de compatibilidade do runtime Hermes — SOMENTE LEITURA.
#
# ─── O que ela É ──────────────────────────────────────────────────────────────
#
# A resposta para a pergunta que o ambiente de desenvolvimento NÃO consegue responder:
# o runtime de produção roda na Hostinger, e a Fase 3.1b se recusa a escolher transporte
# a partir de documentação. Isto aqui produz a evidência.
#
# ─── O que ela NÃO faz ────────────────────────────────────────────────────────
#
#   não chama modelo          não envia prompt          não envia dado da Creditum
#   não muda configuração     não liga/desliga ferramenta
#   não reinicia gateway      não atualiza o Hermes     não lê o .env
#
# Todos os comandos abaixo são de leitura: `--version`, `--help`, `--summary`,
# `config get`, `config path`, e testes de existência de arquivo. Nenhum escreve.
#
# ─── Uso ──────────────────────────────────────────────────────────────────────
#
#   bash hermes-production-probe.sh
#
# A saída é UM objeto JSON em stdout, sanitizado, pronto para colar de volta no gate.
# Diagnóstico humano vai para stderr e não contamina a saída.
#
# ─── Sanitização ──────────────────────────────────────────────────────────────
#
# Toda saída de comando passa por um redator antes de entrar no JSON. Qualquer coisa
# que se pareça com chave, token, segredo ou senha vira `<redigido>`. O redator é
# conservador de propósito: preferimos apagar um valor inocente a vazar um segredo.
#
set -u

HERMES_BIN="${HERMES_BIN:-hermes}"
ESPERADO_VERSAO="0.20.4"
ESPERADO_HOME="/data"
ESPERADO_INSTALL="/opt/hermes-agent"

log() { printf '%s\n' "$*" >&2; }

# ── Redator ──────────────────────────────────────────────────────────────────
# Apaga valores que sigam padrão de segredo, e trunca para não despejar arquivos.
# Sem `\b`: a âncora de palavra NÃO é portável em ERE (BSD sed a ignora, GNU aceita).
# Um redator que só funciona num dos dois é um redator que não funciona — e o alvo é
# Linux, mas isto tem de ser conferível também num Mac de desenvolvimento.
redigir() {
  sed -E \
    -e 's/[Bb][Ee][Aa][Rr][Ee][Rr][[:space:]]+[^[:space:]]+/Bearer <redigido>/g' \
    -e 's/(sk|pk|api|key|token|secret|passwd|password|bearer|auth)[-_a-zA-Z0-9]*[[:space:]]*[:=][[:space:]]*[^[:space:]]+/\1=<redigido>/Ig' \
    -e 's/[A-Za-z0-9_-]{32,}/<redigido-longo>/g' |
    head -c 4000
}

# Escapa para string JSON sem depender de python/jq estarem presentes.
json_str() {
  local s
  s=$(cat)
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/\\t}
  s=${s//$'\r'/}
  s=${s//$'\n'/\\n}
  printf '"%s"' "$s"
}

# Roda um comando de leitura e devolve saída redigida + código de saída.
SAIDA=""
CODIGO=0
executar() {
  SAIDA=$("$@" 2>&1 | redigir)
  CODIGO=${PIPESTATUS[0]}
}

# ── 1. Identidade do executável ──────────────────────────────────────────────
log "→ localizando o executável"
CAMINHO=$(command -v "$HERMES_BIN" 2>/dev/null || printf '')
if [ -z "$CAMINHO" ]; then
  printf '{"probe_version":"1.0.0","status":"HERMES_NOT_FOUND","hermes_bin":%s}\n' \
    "$(printf '%s' "$HERMES_BIN" | json_str)"
  exit 0
fi
CAMINHO_REAL=$(readlink -f "$CAMINHO" 2>/dev/null || printf '%s' "$CAMINHO")

# ── 2. Versão ────────────────────────────────────────────────────────────────
log "→ versão"
executar "$HERMES_BIN" --version
VERSAO_BRUTA="$SAIDA"
VERSAO_CODIGO=$CODIGO
# Extrai o primeiro x.y.z, sem inventar formato.
VERSAO=$(printf '%s' "$VERSAO_BRUTA" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)

# ── 3. Perfil ────────────────────────────────────────────────────────────────
log "→ perfil"
HOME_EFETIVO="${HERMES_HOME:-<nao-definido-no-ambiente>}"
executar "$HERMES_BIN" config path
CONFIG_PATH="$SAIDA"
CONFIG_PATH_CODIGO=$CODIGO
CONFIG_EXISTE="nao"
[ -f "${ESPERADO_HOME}/config.yaml" ] && CONFIG_EXISTE="sim"
INSTALL_EXISTE="nao"
[ -d "$ESPERADO_INSTALL" ] && INSTALL_EXISTE="sim"

# NUNCA imprimimos o conteúdo do config: ele pode conter credencial de provider.
# Só afirmamos que o arquivo existe, e onde.

# ── 4. Superfície de ferramentas ─────────────────────────────────────────────
#
# A pergunta canônica é "quantas DEFINIÇÕES DE FERRAMENTA vão ao modelo?", e o banner
# do CLI não é autoridade para isso. `hermes tools --summary` é a superfície documentada
# de status; a contagem final tem de ser conferida contra ela E contra a config.
log "→ superfície de ferramentas"
executar "$HERMES_BIN" tools --summary
TOOLS_SUMMARY="$SAIDA"
TOOLS_CODIGO=$CODIGO

# Consulta dirigida às chaves de toolset. Só nomes de toolset saem daqui — não é
# despejo de config.
executar "$HERMES_BIN" config get platform_toolsets
TOOLSETS_PLATAFORMA="$SAIDA"
TOOLSETS_CODIGO=$CODIGO

executar "$HERMES_BIN" config get enabled_toolsets
TOOLSETS_HABILITADOS="$SAIDA"
TOOLSETS_HAB_CODIGO=$CODIGO

# ── 5. Transportes candidatos ────────────────────────────────────────────────
#
# `--help` de subcomando é leitura pura: não inicia servidor, não abre porta, não
# muda estado. O que interessa é EXISTIR e qual protocolo declara.
log "→ transportes candidatos"
executar "$HERMES_BIN" acp --help
ACP_HELP="$SAIDA"
ACP_CODIGO=$CODIGO

executar "$HERMES_BIN" serve --help
SERVE_HELP="$SAIDA"
SERVE_CODIGO=$CODIGO

executar "$HERMES_BIN" chat --help
CHAT_HELP="$SAIDA"
CHAT_CODIGO=$CODIGO

# ── 6. Diagnóstico ───────────────────────────────────────────────────────────
#
# `doctor` sem `--fix`: diagnostica e não conserta. Credencial ausente NÃO é falha
# nesta fase.
log "→ doctor (sem --fix)"
executar "$HERMES_BIN" doctor
DOCTOR="$SAIDA"
DOCTOR_CODIGO=$CODIGO

# ── 7. Veredito ──────────────────────────────────────────────────────────────
VERSAO_OK="nao"
[ "$VERSAO" = "$ESPERADO_VERSAO" ] && VERSAO_OK="sim"
HOME_OK="nao"
[ "${HERMES_HOME:-}" = "$ESPERADO_HOME" ] && HOME_OK="sim"

log ""
log "resumo: versao=${VERSAO:-<nao-lida>} (esperada ${ESPERADO_VERSAO}) · HERMES_HOME=${HOME_EFETIVO}"
log "A CONTAGEM DE FERRAMENTAS NÃO É DECIDIDA POR ESTA SONDA."
log "Ela captura a evidência; quem conclui é o gate de desenvolvimento."
log ""

cat <<JSON
{
  "probe_version": "1.0.0",
  "status": "COLLECTED",
  "expected": {
    "hermes_version": "${ESPERADO_VERSAO}",
    "hermes_home": "${ESPERADO_HOME}",
    "install_dir": "${ESPERADO_INSTALL}",
    "model_callable_tool_count": 0
  },
  "observed": {
    "executable_path": $(printf '%s' "$CAMINHO_REAL" | json_str),
    "version_raw": $(printf '%s' "$VERSAO_BRUTA" | json_str),
    "version_parsed": $(printf '%s' "${VERSAO:-}" | json_str),
    "version_exit_code": ${VERSAO_CODIGO},
    "version_matches_governed": $(printf '%s' "$VERSAO_OK" | json_str),
    "hermes_home_env": $(printf '%s' "$HOME_EFETIVO" | json_str),
    "hermes_home_matches_governed": $(printf '%s' "$HOME_OK" | json_str),
    "config_path_output": $(printf '%s' "$CONFIG_PATH" | json_str),
    "config_path_exit_code": ${CONFIG_PATH_CODIGO},
    "governed_config_file_exists": $(printf '%s' "$CONFIG_EXISTE" | json_str),
    "install_dir_exists": $(printf '%s' "$INSTALL_EXISTE" | json_str),
    "tools_summary_output": $(printf '%s' "$TOOLS_SUMMARY" | json_str),
    "tools_summary_exit_code": ${TOOLS_CODIGO},
    "platform_toolsets_output": $(printf '%s' "$TOOLSETS_PLATAFORMA" | json_str),
    "platform_toolsets_exit_code": ${TOOLSETS_CODIGO},
    "enabled_toolsets_output": $(printf '%s' "$TOOLSETS_HABILITADOS" | json_str),
    "enabled_toolsets_exit_code": ${TOOLSETS_HAB_CODIGO},
    "acp_help_output": $(printf '%s' "$ACP_HELP" | json_str),
    "acp_exit_code": ${ACP_CODIGO},
    "serve_help_output": $(printf '%s' "$SERVE_HELP" | json_str),
    "serve_exit_code": ${SERVE_CODIGO},
    "chat_help_output": $(printf '%s' "$CHAT_HELP" | json_str),
    "chat_exit_code": ${CHAT_CODIGO},
    "doctor_output": $(printf '%s' "$DOCTOR" | json_str),
    "doctor_exit_code": ${DOCTOR_CODIGO}
  },
  "not_performed": [
    "llm_call",
    "prompt_submission",
    "creditum_business_data",
    "config_mutation",
    "tool_enable_disable",
    "gateway_restart",
    "hermes_update",
    "env_file_read",
    "network_listener"
  ]
}
JSON
