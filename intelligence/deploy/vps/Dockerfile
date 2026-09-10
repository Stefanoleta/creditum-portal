# syntax=docker/dockerfile:1
#
# D2E-A8 — o runtime Hermes governado, reconstruído do commit EXATO.
#
# ─── Por que esta migração existe ─────────────────────────────────────────────
#
# A a7-r1 provou que o portão da a6 não pode ser imposto no container Managed: o
# gateway (PID 13) é lançado direto por `/app/u4s-hermes-agent` (PID 7), um ELF UPX
# que é componente da Hostinger e não se modifica. Sem systemd, sem supervisord, sem
# s6, sem variável de lançamento, sem chave de comando em `config.yaml`, sem gancho.
#
# A propriedade da a6 — portão recusa, gateway NUNCA sobe — não tem mecanismo local
# suportado lá. Aqui o `ENTRYPOINT` é o portão.
#
# ─── Rede de CONSTRUÇÃO não é rede de execução ────────────────────────────────
#
# Este build clona e instala, então usa rede. A d2d-a-r1 já estabeleceu a distinção:
# download de gerenciador de pacote é rede de IMPLANTAÇÃO, e nunca conta como prova
# de que o runtime é rede-zero. O portão da a6, que roda no arranque, é offline por
# construção — não importa `urllib`, `socket`, `http`, `requests` nem `subprocess`.

# ─── base: por DÍGITO, e a versão AINDA conferida por medição ────────────────
#
# Até a a8-r4f a base vinha de um argumento de build com a TAG como padrão, e o
# comentário dizia que a tag serviria "enquanto o dígito não for conhecido".
# O dígito é conhecido desde a r4f, resolvido no registro e AUTOVERIFICADO: ele é
# o sha256 dos bytes do próprio índice OCI.
#
#   python:3.13.15-slim-bookworm
#   → índice OCI, 5 plataformas (linux/amd64, arm, arm64, 386, ppc64le)
#
# Tag fixa a VERSÃO; dígito fixa os BYTES. `3.13.15-slim-bookworm` é reconstruída
# a cada correção de segurança do Debian, então duas builds da mesma tag não são a
# mesma imagem — e um build que existe para ser reprodutível não pode depender
# disso. E não há ARG: a base não é escolha de quem chama, pelo mesmo motivo que a
# ferramenta de build deixou de ser na r4c.
#
# A conferência de `sys.version_info` continua, e continua valendo: o dígito prova
# QUE imagem é, a medição prova QUE Python ela traz. As duas juntas, não uma.
FROM python@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e AS fonte

ARG HERMES_REPO=https://github.com/NousResearch/hermes-agent
ARG HERMES_COMMIT
ARG HERMES_LOCK_SHA256

# Autoridade MÓVEL é recusada por forma, antes de qualquer rede: 40 hex, nada mais.
RUN set -eu; \
    case "${HERMES_COMMIT:-}" in \
      "") echo "HERMES_COMMIT_REQUIRED" >&2; exit 2 ;; \
      latest|main|master|HEAD) echo "HERMES_COMMIT_MUTABLE: ${HERMES_COMMIT}" >&2; exit 2 ;; \
    esac; \
    printf '%s' "${HERMES_COMMIT}" | grep -Eq '^[0-9a-f]{40}$' \
      || { echo "HERMES_COMMIT_NOT_FULL_SHA: ${HERMES_COMMIT}" >&2; exit 2; }; \
    [ -n "${HERMES_LOCK_SHA256:-}" ] \
      || { echo "HERMES_LOCK_SHA256_REQUIRED" >&2; exit 2; }

RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends git ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# `fetch` do commit exato em vez de `clone` de branch: não há ref móvel envolvida.
RUN set -eu; \
    mkdir -p /opt/hermes-agent; \
    cd /opt/hermes-agent; \
    git init -q; \
    git remote add origin "${HERMES_REPO}"; \
    git fetch -q --depth 1 origin "${HERMES_COMMIT}"; \
    git checkout -q FETCH_HEAD; \
    real="$(git rev-parse HEAD)"; \
    [ "$real" = "${HERMES_COMMIT}" ] \
      || { echo "HERMES_COMMIT_MISMATCH: $real != ${HERMES_COMMIT}" >&2; exit 2; }; \
    lock="$(sha256sum uv.lock | cut -d' ' -f1)"; \
    [ "$lock" = "${HERMES_LOCK_SHA256}" ] \
      || { echo "HERMES_LOCK_SHA256_MISMATCH: $lock != ${HERMES_LOCK_SHA256}" >&2; exit 2; }; \
    printf '%s\n' "${HERMES_COMMIT}" > /opt/hermes-agent/.hermes_build_sha; \
    rm -rf /opt/hermes-agent/.git

# ═════════════════════════════════════════════════════════════════════════════
# `uv` é o instalador observado no Managed, e o `--frozen` obriga o lock: sem
# resolução nova, sem versão flutuante.
#
# ─── a8-r4c: por DIGEST, não por tag e não por argumento ─────────────────────
#
# A primeira versão desta linha era `ghcr.io/astral-sh/uv:latest` — autoridade
# MÓVEL, exatamente o que o §1 proíbe, no arquivo que existe para proibi-la.
# A segunda foi `ARG UV_VERSION` sem padrão: falhava fechada, o que é melhor,
# mas deixava a ferramenta de build como ESCOLHA DE QUEM CHAMA. Dois builds do
# mesmo estado do repositório podiam usar dois `uv` diferentes, e nada notava.
#
# Agora é o dígito do índice OCI, literal. Não há ARG para escolher: o mesmo
# estado do repositório usa a mesma ferramenta, sempre.
#
# O dígito é AUTOVERIFICÁVEL — ele é o sha256 dos bytes do próprio índice, então
# não é preciso confiar no mapeamento de tag do registro. Conferido buscando por
# dígito e rehasheando o corpo recebido.
#
#   uv 0.11.19  ·  ghcr.io/astral-sh/uv  ·  linux/amd64 + linux/arm64
#
# A versão semântica e a procedência dessa escolha estão em
# `deploy/vps/runtime-manifest.json`, em `build_toolchain`, e há teste que exige
# que o dígito daqui seja o dígito de lá.
FROM ghcr.io/astral-sh/uv@sha256:b46b03ddfcfbf8f547af7e9eaefdf8a39c8cebcba7c98858d3162bd28cf536f6 AS ferramenta_uv

# ─── a8-r4g: o envelope de arranque, LIGADO à autoridade da a6 ───────────────
#
# A imagem copiava `scripts/prestart-gate.sh` INTACTO e o instalava como
# ENTRYPOINT. O template traz um sentinela de propósito e recusa com `exit 3`
# enquanto ele estiver lá — então todo arranque normal morria ANTES da
# verificação da a6. E nenhuma evidência via, porque toda execução de CI
# sobrepunha o ENTRYPOINT. O selo dava PASS sobre uma autoridade que não estava
# ligada ao caminho executável.
#
# Este estágio reconstrói os sete arquivos do plugin, reconstrói o manifesto da
# a6, exige que o SHA bata com o governado e só então substitui a ATRIBUIÇÃO do
# sentinela. Uma substituição, provada: a comparação do guarda permanece intacta.
#
# Estágio separado de propósito: as fontes de construção não entram na imagem
# final. O runtime recebe só o arquivo resultante.
FROM python@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e AS envelope
COPY deploy/vps /build/deploy/vps
COPY scripts /build/scripts
COPY bridge/creditum_hermes_telegram /build/bridge/creditum_hermes_telegram
COPY bridge/creditum_hermes_prestart /build/bridge/creditum_hermes_prestart
RUN set -eu; \
    python3 -B /build/deploy/vps/bind-prestart-envelope.py \
      --repo /build --out /out/prestart-gate.sh

FROM python@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e AS runtime
ARG HERMES_COMMIT
ARG HERMES_VERSION_ESPERADA=0.20.4
ARG PYTHON_VERSION_ESPERADA=3.13.15
ARG OPENAI_SDK_VERSION_ESPERADA=2.24.0
COPY --from=fonte /opt/hermes-agent /opt/hermes-agent
COPY --from=ferramenta_uv /uv /usr/local/bin/uv

# ─── a8-r4e: o interpretador é o GOVERNADO, e o uv não escolhe outro ──────────
#
# O `uv` sabe baixar e gerenciar Python por conta própria. Num build que existe
# para fixar a versão, isso é uma porta aberta: `requires-python` do Hermes é
# `>=3.11,<3.14`, então qualquer 3.11/3.12/3.13 satisfaz o projeto e NÃO satisfaz
# este runtime. Medido na a8-r4d: sem estas variáveis o uv criou um ambiente com
# CPython 3.11.15 gerenciado por ele mesmo.
ENV UV_PYTHON_DOWNLOADS=never \
    UV_NO_MANAGED_PYTHON=1

# ─── a8-r4e: /opt/venv É o ambiente, e o extra `messaging` é obrigatório ──────
#
# Duas coisas que a a8-r4d mediu e que esta linha conserta.
#
# 1. `VIRTUAL_ENV=/opt/venv uv sync` NÃO instala em /opt/venv. O uv 0.11.19 avisa
#    "does not match the project environment path `.venv` and will be ignored;
#    use --active" e instala em /opt/hermes-agent/.venv. O `/opt/venv` ficava
#    vazio, e o check de `/opt/venv/bin/hermes` mais abaixo recusava — falha
#    fechada, mas a imagem não se construía. `--active` é a forma suportada.
#
# 2. `--no-dev` sozinho NÃO traz `aiohttp` nem `python-telegram-bot`: os dois
#    vivem no extra `messaging` do Hermes, não nas dependências base. Sem o
#    extra, o inventário governado recusaria dentro da imagem com
#    RUNTIME_PACKAGE_MISSING — o adaptador do Telegram sem a biblioteca do
#    Telegram. Os dois chegam pelo LOCK, pelo grafo do extra; nada de pip à mão.
#
# O `--frozen` continua proibindo resolução nova, e o lock não é regenerado.
RUN set -eu; \
    cd /opt/hermes-agent; \
    base="$(command -v python3)"; \
    visto="$("$base" -c 'import sys;print(".".join(map(str,sys.version_info[:3])))')"; \
    [ "$visto" = "${PYTHON_VERSION_ESPERADA}" ] \
      || { echo "PYTHON_BASE_VERSION_UNEXPECTED: $visto != ${PYTHON_VERSION_ESPERADA}" >&2; exit 2; }; \
    uv venv --no-python-downloads --python "$base" /opt/venv; \
    VIRTUAL_ENV=/opt/venv PATH="/opt/venv/bin:${PATH}" \
      uv sync --frozen --no-dev --extra messaging --active \
              --no-python-downloads --python /opt/venv/bin/python; \
    [ ! -e /opt/hermes-agent/.venv ] \
      || { echo "PROJECT_VENV_APPEARED: o sync não foi para /opt/venv" >&2; exit 2; }; \
    [ -x /opt/venv/bin/python ] || { echo "GOVERNED_VENV_MISSING_PYTHON" >&2; exit 2; }

# ─── o portão da a6, e o pacote que ele usa ───────────────────────────────────
#
# Copiado ANTES da conferência de versão: a conferência reusa
# `versao_do_hermes_instalado`, que já existe e já é testada. Um `python -c` próprio
# aqui seria uma SEGUNDA implementação da mesma leitura — o defeito que a a6 passou
# quatro rodadas fechando.
COPY bridge/creditum_hermes_prestart /opt/creditum/creditum_hermes_prestart
# O ENTRYPOINT vem do estágio `envelope`, já ligado ao SHA da a6. Copiar o
# template cru aqui foi o defeito que a a8-r4g fechou.
COPY --from=envelope /out/prestart-gate.sh /opt/creditum/prestart-gate.sh
COPY deploy/vps/runtime-manifest.json /opt/creditum/runtime-manifest.json
RUN set -eu; \
    chmod 0755 /opt/creditum/prestart-gate.sh; \
    grep -q '^MANIFESTO_SHA="[0-9a-f]\{64\}"$' /opt/creditum/prestart-gate.sh \
      || { echo "ENTRYPOINT_NAO_LIGADO: atribuicao sem SHA de 64 hex" >&2; exit 2; }; \
    if grep -q '^MANIFESTO_SHA="__PREENCHER_NO_ARTEFATO__"$' \
         /opt/creditum/prestart-gate.sh; then \
      echo "ENTRYPOINT_COM_SENTINELA: o template cru foi instalado" >&2; exit 2; \
    fi; \
    grep -q 'if \[ "${MANIFESTO_SHA}" = "__PREENCHER_NO_ARTEFATO__" \]' \
      /opt/creditum/prestart-gate.sh \
      || { echo "ENTRYPOINT_SEM_GUARDA: a ligacao destruiu o guarda" >&2; exit 2; }

ENV PYTHONPATH=/opt/creditum

# ─── conferência do que foi ASSADO ────────────────────────────────────────────
#
# Dois portões, medindo coisas diferentes: este mede a imagem, o da a6 mede o que
# está rodando. Imagem que sobe e só então descobre estar errada custa um ciclo de
# deploy; imagem que não se constrói custa nada.
# A a8-r4e ampliou este portão: ele conferia TRÊS fatos (hermes, python, openai) e
# agora confere os NOVE que o inventário governado sela. Foi justamente um pacote
# não conferido aqui — `python-telegram-bot` — que passou rodadas ausente do passo
# de instalação sem que nada percebesse. Portão que mede menos que o selo deixa
# exatamente essa fenda.
#
# O esperado vem do `runtime-manifest.json` COPIADO para dentro da imagem, não de
# uma segunda lista escrita aqui: duas listas da mesma verdade divergem, e a que
# ninguém confere é a que mente.
RUN PYTHONDONTWRITEBYTECODE=1 /opt/venv/bin/python3 -B <<'VERIFICA'
import json, sys
from importlib import metadata
from creditum_hermes_prestart.verify import (
    DISTRIBUICOES_DO_HERMES, versao_do_hermes_instalado)

doc = json.load(open("/opt/creditum/runtime-manifest.json", encoding="utf-8"))
versoes = doc["runtime_versions"]

esperado = dict(doc["critical_packages"])
esperado["openai"] = versoes["openai"]

ruins = []
for nome, alvo in sorted(esperado.items()):
    try:
        visto = metadata.version(nome)
    except metadata.PackageNotFoundError:
        ruins.append(f"{nome}: AUSENTE, esperado {alvo!r}")
        continue
    if visto != alvo:
        ruins.append(f"{nome}: {visto!r} != {alvo!r}")

# A leitura do Hermes pode FALHAR (nao instalado), e falha nao pode virar
# traceback: um portao que estoura com pilha em vez de recusar com nome custa
# meia hora de leitura de log as tres da manha. O build cai nos dois casos --
# a diferenca e saber por que.
try:
    hermes_visto = versao_do_hermes_instalado(DISTRIBUICOES_DO_HERMES)
except Exception as causa:                                    # noqa: BLE001
    hermes_visto = f"ILEGIVEL({type(causa).__name__})"

for nome, visto, alvo in (
        ("python", ".".join(map(str, sys.version_info[:3])), versoes["python"]),
        ("python.implementation", sys.implementation.name, "cpython"),
        ("hermes", hermes_visto, versoes["hermes_agent"])):
    if visto != alvo:
        ruins.append(f"{nome}: {visto!r} != {alvo!r}")

if ruins:
    print("VERSION_UNSUPPORTED " + "; ".join(ruins), file=sys.stderr)
    sys.exit(2)
print(f"imagem conferida contra o manifesto: {len(esperado) + 3} fatos")
VERIFICA

RUN set -eu; \
    [ -x /opt/venv/bin/hermes ] || { echo "HERMES_CLI_MISSING" >&2; exit 2; }; \
    [ -f /opt/hermes-agent/.hermes_build_sha ] \
      || { echo "HERMES_BUILD_SHA_MISSING" >&2; exit 2; }; \
    [ "$(cat /opt/hermes-agent/.hermes_build_sha)" = "${HERMES_COMMIT}" ] \
      || { echo "HERMES_BUILD_SHA_MISMATCH" >&2; exit 2; }

# ─── §4 da a8: HERMES_HOME e WORKDIR governados, nunca por padrão ─────────────
#
# `WORKDIR` não é cosmético: o caminho de plugin de PROJETO é
# `WORKDIR/.hermes/plugins`, e a precedência é `embutido < usuário < projeto <
# entrypoint`. WORKDIR ao acaso move o diretório que pode sobrepor o plugin
# governado — e é aquele caminho que o portão da a6 confere.
ENV HERMES_HOME=/data \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /opt/hermes-agent

# ─── o portão É a fronteira normal de arranque ────────────────────────────────
#
# Sem `CMD`: `CMD` seria argumento, e argumento é seletor. O envelope ignora `$@` e
# faz `exec` de argv literal.
#
# LIMITE DE CONFIANÇA, sem eufemismo: `docker run --entrypoint ...` de um operador com
# acesso ao daemon contorna isto. Docker não impede root hostil, e eu não afirmo que
# impede. O que a imagem garante é o invariante da IMPLANTAÇÃO NORMAL.
ENTRYPOINT ["/opt/creditum/prestart-gate.sh"]
