#!/bin/sh
#
# D2E-A6 — o ENVELOPE de partida. Verifica, e só então entrega o processo.
#
# ─── Contrato ─────────────────────────────────────────────────────────────────
#
#   verificador sai 0     →  exec do comando FIXO do gateway
#   verificador sai != 0  →  sai != 0 e o gateway NÃO é invocado
#
# Não há terceira saída. Sem aviso-e-segue, sem retentativa, sem reparo, sem
# reinstalação, sem download, sem queda para o plugin nativo.
#
# ─── Por que envelope separado do verificador ─────────────────────────────────
#
# O verificador responde uma pergunta e sai. O envelope decide o que fazer com a
# resposta. Juntar os dois num programa só faria a autoridade de decidir morar no
# mesmo lugar que a lógica de conferir, e a d2e-a4-r5 custou uma rodada inteira
# exatamente por eu ter posto uma dependência de autoridade onde não devia.
#
# ─── Nada é escolhido por quem chama ──────────────────────────────────────────
#
# Sem `$@`, sem `eval`, sem interpolação, sem variável de ambiente que troque
# caminho. Os quatro caminhos abaixo são literais. Argumento passado a este script é
# IGNORADO de propósito: um envelope que aceita argumento é um seletor de comando.
#
# ─── Integração ───────────────────────────────────────────────────────────────
#
# Este script substitui a invocação direta de `hermes gateway run` no lançador da
# Hostinger. O ponto exato onde isso acontece NÃO está descoberto — ver o relatório
# da fase. Enquanto não estiver, este arquivo é contrato, não implantação.
#
set -eu

PYTHON="/opt/venv/bin/python3"
MANIFESTO="/data/creditum_hermes_runtime/telegram_plugin/MANIFEST.json"
#: Fixado no envelope, não no manifesto: o objeto verificado não é sua própria
#: autoridade. Preenchido pela etapa de artefato governado.
MANIFESTO_SHA="__PREENCHER_NO_ARTEFATO__"
HERMES="/opt/venv/bin/hermes"

if [ "${MANIFESTO_SHA}" = "__PREENCHER_NO_ARTEFATO__" ]; then
    echo "RECUSA PRESTART_MANIFEST_SHA_NOT_PINNED" >&2
    echo "  O envelope não foi selado por um artefato governado." >&2
    exit 3
fi

PYTHONDONTWRITEBYTECODE=1 \
"${PYTHON}" -B -m creditum_hermes_prestart.verify \
    --manifest "${MANIFESTO}" \
    --manifest-sha256 "${MANIFESTO_SHA}" || {
        echo "RECUSA PRESTART_GATE_FAILED — gateway NÃO iniciado" >&2
        exit 2
    }

# Só aqui, e com argv literal.
exec "${PYTHON}" "${HERMES}" gateway run
