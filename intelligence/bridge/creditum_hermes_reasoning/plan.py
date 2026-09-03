"""
Fase 3.1d-D2E-A2 — o PLANO CANÔNICO, derivado antes de qualquer autorização.

─── O problema que este módulo resolve ──────────────────────────────────────────

Stefano aprova hashes. Até a d2e-a1 eles não existiam antes da execução:

  * `read_model_fingerprint` e `runtime_binding_fingerprint` eram ENTRADAS da spec —
    a d1 conferia que eram texto e os copiava; nada os produzia;
  * `request_hash` e `user_payload_hash` nasciam DENTRO do `precall_probe`, e obtê-los
    exigia reservar e queimar um `execution_id`;
  * reimplementá-los em TypeScript criaria uma segunda verdade sobre os mesmos bytes.

As três coisas juntas eram insatisfazíveis: ou placeholder, ou execução gasta, ou
clone. Este módulo remove a terceira alternativa fazendo o cálculo onde os
produtores canônicos já vivem, e SEM tocar no livro-razão.

─── O que ele não faz, e por construção ─────────────────────────────────────────

Não constrói cliente, não chama provedor, não abre rede, não carrega ferramenta,
não instancia capacidade viva, não escreve no livro-razão. Ele monta o material
governado pela MESMA função que a execução usa — `construir_material_governado` — e
hasheia. Nada mais.

`live_authorization` não aparece aqui em nenhuma forma. Um planejador que pudesse
receber capacidade seria um segundo caminho para o vivo.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .codex import (
    POLICY_ID,
    POLICY_VERSION,
    read_model_fingerprint,
    request_fingerprint,
    runtime_binding_fingerprint,
    user_payload_hash,
)
from .contract import (
    CONSTITUTION_ID,
    CONSTITUTION_VERSION,
    RUNTIME_ID,
    RUNTIME_VERSION,
    SYSTEM_CONTRACT_ID,
    SYSTEM_CONTRACT_VERSION,
    SystemContract,
)
from .executor import PRODUCTION_SDK_VERSION, construir_material_governado
from .runtime import ApprovedRuntimeBinding

#: Escopo da primeira execução viva. Fechado, e não é bandeira: não existe outro valor
#: aceito, então não há o que selecionar.
OPERATION_REASONING_RESPONSE_ONLY = "REASONING_RESPONSE_ONLY"


@dataclass(frozen=True)
class CanonicalPlanMaterial:
    """
    O que o lado Python fixa. Estrutura FECHADA e congelada.

    Não inclui `execution_fingerprint` nem `subject_content_hash`: esses dois são da
    d1, e a função canônica que os produz — `liveExecutionFingerprint` — vive no
    TypeScript. Calculá-los aqui seria o clone que esta fase veio proibir, só que na
    direção contrária.
    """

    execution_id: str
    read_model_fingerprint: str
    request_fingerprint: str
    runtime_binding_fingerprint: str
    request_hash: str
    user_payload_hash: str
    provider: str
    model: str
    api_mode: str
    tool_count: int
    stream: bool
    constitution_id: str
    constitution_version: str
    constitution_hash: str
    system_contract_id: str
    system_contract_version: str
    system_contract_hash: str
    runtime_id: str
    runtime_version: str
    #: A política de extração da resposta (c6) e a versão do SDK selado. Campos da
    #: spec da d1 que também não tinham produtor: vêm das constantes governadas onde
    #: elas já vivem, não de literal reescrito no TypeScript.
    response_policy_id: str
    response_policy_version: str
    sdk_version: str
    operation: str


def build_canonical_plan_material(
    *,
    execution_id: str,
    contract: SystemContract,
    binding: ApprovedRuntimeBinding,
    read_model: Mapping[str, Any],
) -> CanonicalPlanMaterial:
    """
    Deriva tudo o que a d1 precisa para virar concreta. Puro e determinístico.

    `execution_id` chega PRONTO. O planejador não o gera, não o reserva e não o marca:
    quem escolhe a identidade da execução é quem vai pedir a aprovação, e reservar
    aqui queimaria a execução futura para calcular um hash.

    Nenhum hash entra por parâmetro. O chamador fornece MATERIAL — contrato, vínculo,
    read model — e recebe hashes calculados. Aceitar `request_hash=...` do chamador
    faria o planejador atestar o que não conferiu.
    """
    if not isinstance(execution_id, str) or not execution_id:
        raise ValueError("execution_id ausente")

    # A MESMA construção da execução. Se estas linhas divergissem do `_construir`, o
    # hash aprovado descreveria um pedido que nunca sai.
    request, payload = construir_material_governado(
        contract=contract, binding=binding, read_model=read_model
    )

    return CanonicalPlanMaterial(
        execution_id=execution_id,
        read_model_fingerprint=read_model_fingerprint(read_model),
        # O `request_fingerprint` da spec da d1 e o `request_hash` da evidência do
        # PRECALL são o MESMO compromisso sobre o MESMO pedido. Dois nomes para um
        # valor é ruído de vocabulário; dois valores seria defeito.
        request_fingerprint=request_fingerprint(request),
        runtime_binding_fingerprint=runtime_binding_fingerprint(binding),
        request_hash=request_fingerprint(request),
        user_payload_hash=user_payload_hash(payload),
        provider=binding.provider,
        model=binding.model,
        api_mode=binding.api_mode,
        tool_count=len(request["tools"]),
        stream=bool(request["stream"]),
        constitution_id=CONSTITUTION_ID,
        constitution_version=CONSTITUTION_VERSION,
        constitution_hash=contract.constitution_hash,
        system_contract_id=SYSTEM_CONTRACT_ID,
        system_contract_version=SYSTEM_CONTRACT_VERSION,
        system_contract_hash=contract.system_contract_hash,
        runtime_id=RUNTIME_ID,
        runtime_version=RUNTIME_VERSION,
        response_policy_id=POLICY_ID,
        response_policy_version=POLICY_VERSION,
        sdk_version=PRODUCTION_SDK_VERSION,
        operation=OPERATION_REASONING_RESPONSE_ONLY,
    )
