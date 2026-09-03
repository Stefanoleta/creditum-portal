"""
Fase 3.1d-D2E-A2 — WORKER DE PLANEJAMENTO POR FIXTURE. Evidência, não produção.

─── O que a a4-r2 mudou sobre este arquivo ─────────────────────────────────────

Este worker usa o fixture sintético, e por isso NÃO é a via de produção do Telegram.
O Codex encontrou exatamente isso: com ele, um plano completo descreveria uma
execução sobre o fixture, e os hashes aprovados não descreveriam a mensagem.

A correção não foi mandar a mensagem para cá. Mandar a admissão por stdin
transformaria a prova de fluxo de controle num campo JSON forjável — a armadilha que
o brief da a4-r2 nomeia no §6. A via de produção do Telegram é
`creditum_hermes_telegram.planning`, EM PROCESSO, onde o objeto de ingresso existe e
não precisa atravessar fronteira nenhuma.

Este arquivo permanece para evidência determinística com material sintético.

Lê UM documento fechado do stdin, deriva o material canônico do plano, e escreve UM
documento fechado no stdout. Não executa nada.

─── Por que não é um modo do worker PRECALL ─────────────────────────────────────

Porque `mode=` é um seletor, e seletor é superfície. A d1 pagou para fechar o defeito
de uma string mudar o comportamento; acrescentar um modo ao worker de execução seria
recriá-lo com outro nome. Dois entrypoints fixos não têm o que selecionar.

─── O que atravessa, e o que não ────────────────────────────────────────────────

Entra: `execution_id` e mais nada de autoridade. Nenhum hash entra — o planejador os
CALCULA. Aceitar `request_hash` do chamador faria este processo atestar o que não
conferiu.

Sai: hashes, identificadores e contagens. Nunca prompt, saída de modelo, credencial ou
material de execução do vínculo.
"""
from __future__ import annotations

import json
import sys
from typing import Any

PROTOCOLO_PEDIDO = "creditum_plan_request/1.0.0"
PROTOCOLO_RESULTADO = "creditum_plan_result/1.0.0"

#: O envelope é um identificador e a versão. Centenas de bytes; 64 KiB é folga com teto.
LIMITE_PEDIDO_BYTES = 64 * 1024

#: Conjunto FECHADO. Campo desconhecido é erro, campo ausente também. Em particular
#: NÃO existe campo de hash, de modelo, de provedor, de ferramenta ou de modo: nada
#: disso é escolha de quem chama.
CAMPOS_PEDIDO = {"protocol_version", "execution_id"}


def _emite(doc: dict) -> int:
    sys.stdout.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()
    return 0


def _resultado(**campos: Any) -> dict:
    base = {
        "protocol_version": PROTOCOLO_RESULTADO,
        "execution_id": campos.pop("execution_id", ""),
        "outcome": campos.pop("outcome"),
    }
    base.update(campos)
    return base


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
        return None, "REQUEST_FIELDS_INVALID"
    if not isinstance(doc["execution_id"], str) or not doc["execution_id"]:
        return None, "REQUEST_FIELDS_INVALID"
    return doc, ""


def main() -> int:
    pedido, defeito = _le_pedido()
    if pedido is None:
        return _emite(_resultado(outcome="PROTOCOL_REJECTED", defect=defeito))
    execution_id = pedido["execution_id"]

    # Import TARDIO: uma falha de ambiente vira resultado fechado em vez de traceback
    # antes de qualquer protocolo existir.
    try:
        from creditum_hermes_reasoning.contract import build_system_contract
        from creditum_hermes_reasoning.executor import ExecutorRefusal
        from creditum_hermes_reasoning.plan import build_canonical_plan_material
        from creditum_hermes_reasoning.probe import load_fixture
        from creditum_hermes_reasoning.runtime import (
            RuntimeRefusal,
            resolve_approved_runtime_binding,
            safe_exception_type,
        )
    except Exception as causa:  # noqa: BLE001
        return _emite(_resultado(
            execution_id=execution_id, outcome="PLAN_FAILED",
            defect="RUNTIME_IMPORT_FAILED", detail_type=type(causa).__name__))

    try:
        contrato = build_system_contract()
        binding = resolve_approved_runtime_binding()
        fixture, _ = load_fixture()
        plano = build_canonical_plan_material(
            execution_id=execution_id, contract=contrato, binding=binding,
            read_model=fixture["read_model"],
        )
    except (ExecutorRefusal, RuntimeRefusal) as r:
        return _emite(_resultado(
            execution_id=execution_id, outcome="PLAN_FAILED", defect=r.defect))
    except Exception as causa:  # noqa: BLE001
        # O TIPO, nunca a mensagem: mensagem de terceiro pode carregar valor.
        return _emite(_resultado(
            execution_id=execution_id, outcome="PLAN_FAILED",
            defect="PLAN_DERIVATION_FAILED", detail_type=safe_exception_type(causa)))

    return _emite(_resultado(
        execution_id=plano.execution_id, outcome="PLAN_DERIVED",
        read_model_fingerprint=plano.read_model_fingerprint,
        request_fingerprint=plano.request_fingerprint,
        runtime_binding_fingerprint=plano.runtime_binding_fingerprint,
        request_hash=plano.request_hash,
        user_payload_hash=plano.user_payload_hash,
        provider=plano.provider, model=plano.model, api_mode=plano.api_mode,
        tool_count=plano.tool_count, stream=plano.stream,
        constitution_id=plano.constitution_id,
        constitution_version=plano.constitution_version,
        constitution_hash=plano.constitution_hash,
        system_contract_id=plano.system_contract_id,
        system_contract_version=plano.system_contract_version,
        system_contract_hash=plano.system_contract_hash,
        runtime_id=plano.runtime_id, runtime_version=plano.runtime_version,
        response_policy_id=plano.response_policy_id,
        response_policy_version=plano.response_policy_version,
        sdk_version=plano.sdk_version,
        operation=plano.operation))


if __name__ == "__main__":
    sys.exit(main())
