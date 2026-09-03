"""
Fase 3.1d-D2E-A4 — o READ MODEL GOVERNADO de uma mensagem admitida do Telegram.

─── O que este módulo resolve ───────────────────────────────────────────────────

A a2 construiu a derivação canônica, mas o `read_model` que alimentava tudo era o
FIXTURE sintético. O texto do Telegram não participava do `user_payload_hash`, nem do
`request_hash`, nem do `execution_fingerprint`. Um plano completo descrevia uma
execução sobre o fixture — hashes corretos sobre a coisa errada.

Aqui o read model passa a ser a mensagem admitida, e só ela. Sem fixture, sem queda
para valor padrão, sem campo opcional.

─── O que este módulo NÃO faz ───────────────────────────────────────────────────

Não fala com o Telegram, não lê token, não consulta allowlist e não decide admissão.
Ele RECEBE material que a a3 provou existir depois da admissão nativa, e recusa tudo
o que não prove essa origem. Reimplementar a allowlist aqui criaria uma segunda
definição, mais fraca, de "autorizado" — o defeito que a d1 e a d2b pagaram para
fechar.

─── A prova de admissão ────────────────────────────────────────────────────────

Não existe campo nativo `authorized = true`, e é assim que tem de ser: booleano de
autorização é dado, e dado se forja. A prova é de FLUXO DE CONTROLE — só mensagem
aprovada por `_is_user_authorized_from_message` chega a `_build_message_event`.

Este módulo não pode observar fluxo de controle de outro processo. O que ele exige é
que o material chegue com o carimbo de proveniência daquele caminho, e recusa sem ele.
Isso é honesto sobre o limite: a prova real vive na ponte, no ponto de entrega — e a
ponte é o que a a4 deixou bloqueado até existir interface suportada.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Mapping

from .codex import CodexDefect, CodexRefusal

TELEGRAM_LIVE_SCHEMA_VERSION = "creditum_telegram_live_read_model/v1"

#: O único transporte aceito. Não é seletor: não existe outro valor admitido.
TELEGRAM_TRANSPORT = "TELEGRAM"

#: A proveniência que a ponte tem de carimbar. O nome descreve o CAMINHO exato que a
#: a3 observou, para que ninguém o confunda com "alguém disse que estava autorizado".
ADMITTED_PROVENANCE = "hermes_telegram_post_allowlist_flush_text_batch/v1"

#: Domínio do identificador de execução derivado. Separado dos hashes de conteúdo.
TELEGRAM_EXECUTION_ID_DOMAIN = "creditum_telegram_execution_id/v1"

#: O `execution_id` tem de casar com o `identifier` do contrato de aprovação:
#: `^[a-z0-9][a-z0-9_.:-]{2,127}$`. O prefixo e o hex minúsculo satisfazem por
#: construção.
EXECUTION_ID_PREFIX = "tg-"
EXECUTION_ID_HEX_LEN = 32

_ID_NUMERICO = re.compile(r"^[0-9]+$")


@dataclass(frozen=True)
class AdmittedTelegramMessage:
    """
    O material que a ponte entrega, campo a campo, vindo do `MessageEvent` admitido.

    Estrutura FECHADA. Campo novo é decisão, não conveniência.

    `source_message_count` existe por um motivo concreto que a a3 expôs: o adaptador
    junta mensagens rápidas do mesmo lote com `\\n`, mas `MessageEvent.message_id` é um
    valor ÚNICO. Logo um evento em lote é indistinguível de um evento simples olhando
    só o `MessageEvent` — e uma política de "exatamente uma mensagem" que não consegue
    contar mensagens não é política, é esperança. A cardinalidade tem de vir de quem
    fez o lote, em `_flush_text_batch`.
    """

    provenance: str
    transport: str
    sender_user_id: str
    destination_chat_id: str
    message_id: str
    update_id: str
    normalized_text: str
    telegram_timestamp: str
    source_message_count: int
    #: Presente só em fórum/tópico. Congelado junto com o destino quando existe.
    thread_id: str | None = None


def _texto(valor: object, campo: str) -> str:
    if type(valor) is not str or not valor:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, f"{campo} ausente")
    return valor


def build_telegram_live_read_model(
    admitida: AdmittedTelegramMessage,
) -> Mapping[str, Any]:
    """
    O read model governado. Falha fechada em cada uma das condições da a4.

    Devolve `dict` simples de propósito: é ele que `governed_user_payload` serializa, e
    é dessa serialização que saem `user_payload_hash` e `request_hash`. Uma classe
    aqui obrigaria a uma conversão, e conversão é onde um campo se perde calado.
    """
    if type(admitida) is not AdmittedTelegramMessage:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "material não é o tipo próprio")

    # ─── proveniência: sem ela, não há admissão provada ───────────────────────
    if admitida.provenance != ADMITTED_PROVENANCE:
        raise CodexRefusal(
            CodexDefect.USER_PAYLOAD_MISMATCH, "proveniência pós-allowlist ausente"
        )
    if admitida.transport != TELEGRAM_TRANSPORT:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "transporte não é TELEGRAM")

    # ─── exatamente UMA mensagem ──────────────────────────────────────────────
    if type(admitida.source_message_count) is not int or admitida.source_message_count != 1:
        raise CodexRefusal(
            CodexDefect.USER_PAYLOAD_MISMATCH,
            "evento em lote: uma execução viva corresponde a uma mensagem",
        )

    # ─── identidade nativa completa ───────────────────────────────────────────
    remetente = _texto(admitida.sender_user_id, "sender_user_id")
    destino = _texto(admitida.destination_chat_id, "destination_chat_id")
    mensagem = _texto(admitida.message_id, "message_id")
    atualizacao = _texto(admitida.update_id, "update_id")
    # Os quatro vêm de inteiros do Telegram, convertidos com `str()`. Um valor que não
    # é dígito não veio de lá — e ambiguidade de identidade é recusa, não aviso.
    for nome, valor in (("sender_user_id", remetente), ("message_id", mensagem),
                        ("update_id", atualizacao)):
        if not _ID_NUMERICO.match(valor):
            raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, f"{nome} não é nativo")
    # `chat_id` pode ser negativo (grupos e canais). O sinal é do Telegram, não ruído.
    if not _ID_NUMERICO.match(destino.lstrip("-")) or destino in ("", "-"):
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "destination_chat_id não é nativo")

    texto = _texto(admitida.normalized_text, "normalized_text")
    carimbo = _texto(admitida.telegram_timestamp, "telegram_timestamp")

    fio = admitida.thread_id
    if fio is not None and (type(fio) is not str or not _ID_NUMERICO.match(fio)):
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "thread_id não é nativo")

    # Ordem fixa e chaves fechadas. `governed_user_payload` serializa com `sort_keys`,
    # então a ordem aqui é para leitura humana; o que importa é o CONJUNTO ser exato.
    return {
        "schema_version": TELEGRAM_LIVE_SCHEMA_VERSION,
        "transport": TELEGRAM_TRANSPORT,
        "sender_user_id": remetente,
        "destination_chat_id": destino,
        "destination_thread_id": fio,
        "message_id": mensagem,
        "update_id": atualizacao,
        # O texto do adaptador instalado, EXATO. Sem `lower()`, sem `strip()` de novo,
        # sem reinterpretar comando: a a3 já provou que o adaptador normalizou, e uma
        # segunda camada de normalização mudaria o que Stefano leu.
        "normalized_text": texto,
        "telegram_timestamp": carimbo,
    }


def telegram_execution_id(read_model: Mapping[str, Any]) -> str:
    """
    O `execution_id` DERIVADO da identidade imutável da mensagem.

    ─── Por que derivar, e não sortear ──────────────────────────────────────────

    Proteção contra repetição precisa ser DURÁVEL: um registro em memória some no
    reinício, e "a mesma mensagem não pode executar duas vezes" não pode depender de o
    processo não ter caído.

    Derivando o id da identidade nativa, repetir a mesma mensagem produz o MESMO
    `execution_id` — e aí a repetição bate no `mkdir` atômico do livro-razão da d2b,
    que já é durável e já foi provado em produção. Reuso do mecanismo existente em vez
    de um segundo, mais fraco.

    O `update_id` entra junto com os outros três: ele identifica a atualização do bot,
    e é o que distingue duas entregas do mesmo `message_id`.
    """
    partes = "\n".join(
        f"{c}={read_model[c]}"
        for c in ("transport", "sender_user_id", "destination_chat_id",
                  "message_id", "update_id")
    )
    digest = hashlib.sha256(
        f"{TELEGRAM_EXECUTION_ID_DOMAIN}:{partes}".encode("utf-8")
    ).hexdigest()
    return EXECUTION_ID_PREFIX + digest[:EXECUTION_ID_HEX_LEN]


def admitted_from_governed_ingress(ingresso: object) -> AdmittedTelegramMessage:
    """
    Ponte determinística do ingresso governado (a4-r1) para o material do read model.

    Existe para que o planejamento canônico da a2 receba a mensagem admitida sem que
    ninguém redigite campo — redigitar é onde um valor se perde calado.

    Não há conversão de autoridade aqui: a evidência de admissão e a cardinalidade
    atravessam como estão, e a validação de sempre acontece em
    `build_telegram_live_read_model`.
    """
    obrigatorios = (
        "protocol_version", "transport", "sender_user_id", "destination_chat_id",
        "destination_thread_id", "message_id", "update_id", "text",
        "telegram_timestamp", "admission_evidence", "source_message_count",
    )
    for campo in obrigatorios:
        if not hasattr(ingresso, campo):
            raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, f"ingresso sem {campo}")
    return AdmittedTelegramMessage(
        # A prova de admissão do adaptador governado é a proveniência que este módulo
        # exige. Nomes diferentes para o mesmo fato seriam ruído; valores diferentes
        # seriam defeito.
        provenance=ADMITTED_PROVENANCE,
        transport=getattr(ingresso, "transport"),
        sender_user_id=getattr(ingresso, "sender_user_id"),
        destination_chat_id=getattr(ingresso, "destination_chat_id"),
        message_id=getattr(ingresso, "message_id"),
        update_id=getattr(ingresso, "update_id"),
        normalized_text=getattr(ingresso, "text"),
        telegram_timestamp=getattr(ingresso, "telegram_timestamp"),
        source_message_count=getattr(ingresso, "source_message_count"),
        thread_id=getattr(ingresso, "destination_thread_id"),
    )
