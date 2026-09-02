"""
Fase 3.1d-D2C — WORKER PRECALL. Filho privado do supervisor TypeScript.

─── O que este processo é ────────────────────────────────────────────────────

Um detalhe de implementação do supervisor. Não é CLI, não é serviço, não é agente. Lê
UM documento fechado do stdin, prova a construção do pedido governado até o ponto de
parada PRECALL, e escreve UM documento fechado no stdout.

─── O que ele NÃO faz, e por que ────────────────────────────────────────────

Não decide se a execução foi autorizada. Essa autoridade é do TypeScript, e duplicá-la
aqui criaria uma segunda definição, mais fraca, de "aprovado" — o defeito que a d1 e a
d2b pagaram para fechar. O que chega pelo stdin é MATERIAL DE EXECUÇÃO, não autoridade.

Não chama modelo, provedor nem rede. `precall_probe` do executor congelado levanta
`PrecallProbeComplete` ANTES de qualquer cliente existir — e este worker não tem outro
caminho para `execute_live`, que exige capacidade que ninguém aqui pode emitir.

Não inicializa AIAgent, plugin, memória, relay nem middleware do Hermes.
"""
from __future__ import annotations

import json
import sys
from typing import Any

PROTOCOLO_PEDIDO = "creditum_precall_request/1.0.0"
PROTOCOLO_RESULTADO = "creditum_precall_result/1.0.0"

#: Limite do pedido. O envelope governado carrega identificador, fingerprints e um
#: nonce — centenas de bytes. 64 KiB é folga de duas ordens de grandeza e ainda impede
#: material não limitado no stdin.
LIMITE_PEDIDO_BYTES = 64 * 1024

CAMPOS_PEDIDO = {
    "protocol_version", "execution_id", "execution_fingerprint",
    "request_nonce", "committed_at_utc",
}


def _resultado(**campos: Any) -> dict:
    base = {
        "protocol_version": PROTOCOLO_RESULTADO,
        "execution_id": campos.pop("execution_id", ""),
        "execution_fingerprint": campos.pop("execution_fingerprint", ""),
        "request_nonce": campos.pop("request_nonce", ""),
        "outcome": campos.pop("outcome"),
    }
    base.update(campos)
    return base


def _emite(doc: dict) -> int:
    # UM documento, sem log humano. stdout é protocolo.
    sys.stdout.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()
    return 0


def _le_pedido() -> tuple[dict | None, str]:
    bruto = sys.stdin.buffer.read(LIMITE_PEDIDO_BYTES + 1)
    if len(bruto) > LIMITE_PEDIDO_BYTES:
        return None, "REQUEST_TOO_LARGE"
    try:
        texto = bruto.decode("utf-8")
    except UnicodeDecodeError:
        return None, "REQUEST_NOT_UTF8"
    try:
        doc = json.loads(texto)
    except json.JSONDecodeError:
        return None, "REQUEST_NOT_JSON"
    if not isinstance(doc, dict):
        return None, "REQUEST_NOT_OBJECT"
    if doc.get("protocol_version") != PROTOCOLO_PEDIDO:
        return None, "REQUEST_VERSION_UNSUPPORTED"
    if set(doc) != CAMPOS_PEDIDO:
        # Conjunto FECHADO: campo desconhecido é erro, campo ausente também.
        return None, "REQUEST_FIELDS_INVALID"
    for c in CAMPOS_PEDIDO:
        if not isinstance(doc[c], str) or not doc[c]:
            return None, "REQUEST_FIELDS_INVALID"
    return doc, ""


def main() -> int:
    pedido, defeito = _le_pedido()
    if pedido is None:
        return _emite(_resultado(outcome="PROTOCOL_REJECTED", defect=defeito))

    ident = {
        "execution_id": pedido["execution_id"],
        "execution_fingerprint": pedido["execution_fingerprint"],
        "request_nonce": pedido["request_nonce"],
    }

    # ─── O runtime CONGELADO, importado tarde ─────────────────────────────
    # Import dentro da função: uma falha de ambiente vira resultado fechado em vez de
    # traceback no stderr antes de qualquer protocolo existir.
    try:
        from creditum_hermes_reasoning.codex import PrecallProbeComplete
        from creditum_hermes_reasoning.contract import build_system_contract
        from creditum_hermes_reasoning.executor import (
            CreditumCodexReasoningExecutor, ExecutorRefusal, GovernedReasoningRun,
            resolve_production_trusted_sdk_provider,
        )
        from creditum_hermes_reasoning.probe import load_fixture
        from creditum_hermes_reasoning.runtime import (
            RuntimeRefusal, resolve_approved_runtime_binding, safe_exception_type,
        )
    except Exception as causa:  # noqa: BLE001
        return _emite(_resultado(
            **ident, outcome="PRECALL_FAILED",
            defect="RUNTIME_IMPORT_FAILED", detail_type=type(causa).__name__))

    try:
        contrato = build_system_contract()
        binding = resolve_approved_runtime_binding()
        fixture, _ = load_fixture()
        provedor = resolve_production_trusted_sdk_provider()
        run = GovernedReasoningRun(
            contract=contrato, binding=binding, read_model=fixture["read_model"],
            # Sem autorização: o worker não tem emissor de capacidade, e por isso o
            # caminho vivo é inalcançável daqui por construção.
            live_authorization=None,
        )
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor)
    except (ExecutorRefusal, RuntimeRefusal) as r:
        return _emite(_resultado(**ident, outcome="PRECALL_FAILED", defect=r.defect))
    except Exception as causa:  # noqa: BLE001
        # O TIPO, nunca a mensagem: mensagem de terceiro pode carregar valor.
        return _emite(_resultado(
            **ident, outcome="PRECALL_FAILED", defect="PRECALL_SETUP_FAILED",
            detail_type=safe_exception_type(causa)))

    try:
        executor.precall_probe(run)
        # `precall_probe` DEVE levantar. Chegar aqui é vazamento.
        return _emite(_resultado(**ident, outcome="PRECALL_FAILED",
                                 defect="PRECALL_PROBE_LEAKED"))
    except PrecallProbeComplete:
        pass
    except (ExecutorRefusal, RuntimeRefusal) as r:
        return _emite(_resultado(**ident, outcome="PRECALL_FAILED", defect=r.defect))
    except Exception as causa:  # noqa: BLE001
        return _emite(_resultado(
            **ident, outcome="PRECALL_FAILED", defect="PRECALL_PROBE_FAILED",
            detail_type=safe_exception_type(causa)))

    e = executor.evidence
    if e is None:
        return _emite(_resultado(**ident, outcome="PRECALL_FAILED",
                                 defect="PRECALL_EVIDENCE_MISSING"))

    # Só contagem e hash. Nunca prompt, saída, segredo ou PII.
    return _emite(_resultado(
        **ident, outcome="PRECALL_SUCCEEDED",
        mode=e.mode, request_hash=e.request_hash,
        user_payload_hash=e.user_payload_hash, tool_count=e.tool_count,
        client_constructions=e.client_constructions, provider_calls=e.provider_calls,
        model_call_completed=e.model_call_completed, verdict=e.verdict))


if __name__ == "__main__":
    sys.exit(main())
