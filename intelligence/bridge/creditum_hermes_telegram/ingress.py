"""
`GovernedTelegramIngressV1` — evidência de admissão de transporte. E só isso.

─── DADO, e não autoridade ─────────────────────────────────────────────────────

Este dataclass é uma REPRESENTAÇÃO IMUTÁVEL. Seu construtor não é autoridade, e isso é
deliberado depois do regate da r2: eu tinha escrito `type(x) is GovernedTelegramIngressV1`
e chamado aquilo de prova de admissão. Não é. Qualquer chamador constrói a classe
genuína, e `dataclasses.replace(real, text="FORJADO")` clona mantendo todos os
marcadores que eu conferia.

Forma de dado não é procedência. Construir isto à mão continua permitido e continua
inofensivo: a autoridade vive no registro de EMISSÃO do adaptador, fora deste objeto,
e é lá que `planning.py` pergunta.

─── O que este objeto é, e o que ele não é ──────────────────────────────────────

É a prova de que UMA mensagem específica atravessou a admissão nativa do Hermes. Não
é aprovação de Stefano, não emite capacidade, não reserva livro-razão, não planeja e
não executa. O fluxo continua sendo:

    admissão nativa → GovernedTelegramIngressV1 → CanonicalLivePlanV1
    → hashes exatos mostrados a Stefano → DecisionRecord explícito
    → LiveExecutionAuthorization de uso único → execução

─── Propriedade ────────────────────────────────────────────────────────────────

Os valores são capturados do evento admitido, campo a campo, e congelados. Depois da
captura, o chamador pode mutar o `MessageEvent` original à vontade: este objeto já não
o lê. É a mesma disciplina de instantâneo próprio que a d1-R1 estabeleceu.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

#: Versão do contrato de ingresso. Campo novo é decisão, não conveniência.
TELEGRAM_INGRESS_PROTOCOL = "creditum_telegram_ingress/1.0.0"

TELEGRAM_TRANSPORT = "TELEGRAM"

_DIGITOS = re.compile(r"^-?[0-9]+$")


class IngressRefusal(Exception):
    """Recusa governada de captura. Nomeada, nunca silenciosa."""

    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect


@dataclass(frozen=True)
class GovernedTelegramIngressV1:
    """Fechado e congelado. Uma mensagem admitida, uma instância."""

    protocol_version: str
    transport: str
    sender_user_id: str
    destination_chat_id: str
    destination_thread_id: str | None
    message_id: str
    update_id: str
    text: str
    telegram_timestamp: str
    #: Prova de admissão: o caminho nativo por onde este evento passou.
    admission_evidence: str
    #: Identidade de compatibilidade do runtime em que a captura aconteceu.
    hermes_version: str
    adapter_compat_id: str
    #: Sempre 1, por construção. O adaptador governado captura ANTES do lote.
    source_message_count: int


def _texto(v: object, campo: str) -> str:
    if type(v) is not str or not v:
        raise IngressRefusal("INGRESS_FIELD_MISSING", campo)
    return v


def _nativo(v: str, campo: str, *, sinal: bool = False) -> str:
    if not _DIGITOS.match(v) or (not sinal and v.startswith("-")):
        raise IngressRefusal("INGRESS_FIELD_NOT_NATIVE", campo)
    return v


def capture_ingress(
    event: Any, *, admission_evidence: str, hermes_version: str, adapter_compat_id: str
) -> GovernedTelegramIngressV1:
    """
    Captura UM `MessageEvent` admitido. Cada campo é lido exatamente uma vez.

    Ler duas vezes uma propriedade que pode ser um `property` do chamador devolveria
    valores diferentes entre a validação e o armazenamento — a janela que a d1-R1
    fechou. Aqui a leitura acontece uma vez e o que se guarda é o que foi validado.

    Não existe parâmetro de autorização. Não há `authorized=True` a aceitar: a admissão
    é provada pelo CAMINHO, e quem carimba o caminho é o adaptador governado, depois de
    o guarda de compatibilidade ter provado que aquele caminho passa pela allowlist.
    """
    source = getattr(event, "source", None)
    if source is None:
        raise IngressRefusal("INGRESS_SOURCE_MISSING")

    plataforma = getattr(source, "platform", None)
    # `Platform.TELEGRAM` é um enum no Hermes; comparo pelo `value`/nome, sem importar
    # o enum — importar o tipo do terceiro para comparar seria acoplamento sem ganho.
    nome_plataforma = getattr(plataforma, "value", None) or getattr(plataforma, "name", None)
    if str(nome_plataforma).upper() != TELEGRAM_TRANSPORT:
        raise IngressRefusal("INGRESS_TRANSPORT_NOT_TELEGRAM", str(nome_plataforma))

    remetente = _nativo(_texto(getattr(source, "user_id", None), "sender_user_id"),
                        "sender_user_id")
    destino = _nativo(_texto(getattr(source, "chat_id", None), "destination_chat_id"),
                      "destination_chat_id", sinal=True)
    mensagem = _nativo(_texto(getattr(event, "message_id", None), "message_id"),
                       "message_id")
    atualizacao = _nativo(
        _texto(str(getattr(event, "platform_update_id", "") or ""), "update_id"),
        "update_id")
    texto = _texto(getattr(event, "text", None), "text")

    carimbo = getattr(event, "timestamp", None)
    if carimbo is None:
        raise IngressRefusal("INGRESS_FIELD_MISSING", "telegram_timestamp")
    # `isoformat` quando for datetime; `str` quando já vier normalizado. Uma leitura.
    momento = carimbo.isoformat() if hasattr(carimbo, "isoformat") else str(carimbo)
    if not momento:
        raise IngressRefusal("INGRESS_FIELD_MISSING", "telegram_timestamp")

    fio = getattr(source, "thread_id", None)
    if fio is not None:
        fio = _nativo(_texto(str(fio), "destination_thread_id"), "destination_thread_id")

    return GovernedTelegramIngressV1(
        protocol_version=TELEGRAM_INGRESS_PROTOCOL,
        transport=TELEGRAM_TRANSPORT,
        sender_user_id=remetente,
        destination_chat_id=destino,
        destination_thread_id=fio,
        message_id=mensagem,
        update_id=atualizacao,
        text=texto,
        telegram_timestamp=momento,
        admission_evidence=_texto(admission_evidence, "admission_evidence"),
        hermes_version=_texto(hermes_version, "hermes_version"),
        adapter_compat_id=_texto(adapter_compat_id, "adapter_compat_id"),
        source_message_count=1,
    )
