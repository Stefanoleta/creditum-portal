"""
Andaime de TESTE. Não embarca no artefato de produção.

─── Por que fora do pacote ──────────────────────────────────────────────────

Estas fábricas existem porque provar a lógica do portão exige um vínculo válido e uma
capacidade válida, e o resolvedor de produção recusa por design.

Elas ficaram em `runtime.py` até a r3, e o empacotador da r3 as pegou: o artefato de
deploy levava o segredo sintético e duas fábricas de autoridade. Um segredo sintético
que embarca ensina que segredo embarca, e uma fábrica de capacidade no pacote de
produção é exatamente o emissor que a r1 garantiu não existir.

Agora o pacote de produção não tem como emitir capacidade, nem por descuido de import.
"""

from __future__ import annotations

from typing import Any, Mapping

from creditum_hermes_reasoning.runtime import (
    APPROVED_API_MODE,
    APPROVED_HERMES_HOME,
    APPROVED_MODEL,
    APPROVED_PROVIDER,
    ApprovedRuntimeBinding,
    LiveExecutionAuthorization,
    _EMISSOR,
)

#: Segredo SINTÉTICO. Nunca um segredo real, em nenhuma circunstância.
TEST_FAKE_SECRET = "test-secret-never-log"
TEST_FAKE_BASE_URL = "https://codex.fixture.invalid"

_MATERIAL_SINTETICO = {"base_url": TEST_FAKE_BASE_URL, "api_key": TEST_FAKE_SECRET}


def approved_binding_for_tests(
    *,
    provider: str = APPROVED_PROVIDER,
    model: str = APPROVED_MODEL,
    api_mode: str = APPROVED_API_MODE,
    hermes_version: str = "0.20.4",
    acp_version: str = "0.9.0",
    hermes_home: str = APPROVED_HERMES_HOME,
    execution_material: Mapping[str, Any] | None = _MATERIAL_SINTETICO,
) -> ApprovedRuntimeBinding:
    """SOMENTE TESTE. Não é caminho de produção e não é exportado pelo pacote."""
    return ApprovedRuntimeBinding(
        _issuer=_EMISSOR,
        hermes_version=hermes_version,
        acp_version=acp_version,
        provider=provider,
        model=model,
        api_mode=api_mode,
        hermes_home=hermes_home,
        # Sem cópia aqui de propósito: o snapshot acontece no `__post_init__`, e é ele
        # que tem de ser a autoridade. Copiar aqui esconderia o buraco de lá.
        _execution_material=(
            dict(execution_material) if type(execution_material) is dict else execution_material
        ),  # type: ignore[arg-type]
    )


def live_authorization_for_tests() -> LiveExecutionAuthorization:
    """SOMENTE TESTE. Não há equivalente de produção — é a garantia, não a limitação."""
    return LiveExecutionAuthorization(_issuer=_EMISSOR)


# ─── Emissão SELADA de provedor de SDK — SOMENTE TESTE ───────────────────────
#
# A r4 deixava `TrustedSdkProvider` publicamente construível, e a verificação conferia
# uma superfície declarada enquanto a fábrica devolvia outro cliente. A r5 selou a
# emissão; esta fábrica existe do lado dos TESTES para que o pacote de produção não
# ganhe um emissor por conveniência.

from creditum_hermes_reasoning.codex import (  # noqa: E402
    _TIPOS_ISSUER,
    GovernedResponseTypes,
)
from creditum_hermes_reasoning.executor import (  # noqa: E402
    RESPONSE_POLICY_SYNTHETIC,
    _SDK_ISSUER,
    TrustedSdkProvider,
)


def issue_trusted_sdk_provider_for_tests(
    *,
    version: Any,
    client_class: Any,
    responses_resource_class: Any,
    create_descriptor: Any,
    response_policy: str = RESPONSE_POLICY_SYNTHETIC,
) -> TrustedSdkProvider:
    """
    SOMENTE TESTE.

    A política SINTÉTICA é o que autoriza o caminho vivo falso: a resposta de teste
    tem forma declarada e um bloco textual só. Produção sela a política NÃO APROVADA,
    e por isso não alcança o provider nem com capacidade válida.
    """
    return TrustedSdkProvider(
        _issuer=_SDK_ISSUER,
        version=version,
        client_class=client_class,
        responses_resource_class=responses_resource_class,
        create_descriptor=create_descriptor,
        response_policy=response_policy,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 3.1d-c6 — os seis tipos de resposta, SOMENTE TESTE
# ═══════════════════════════════════════════════════════════════════════════════

def issue_governed_response_types_for_tests(
    *,
    response: Any,
    output_message: Any,
    output_text: Any,
    output_refusal: Any,
    reasoning_item: Any,
    compaction_item: Any,
) -> GovernedResponseTypes:
    """
    SOMENTE TESTE.

    A produção sela os seis tipos reais do `openai` 2.24.0 por
    `resolve_production_governed_response_types()`, sem argumento algum. Este emissor
    existe para que o teste use classes sintéticas — inclusive classes cujos campos
    EXPLODEM se lidos, que é como a opacidade de reasoning e compaction é medida em
    vez de prometida.
    """
    return GovernedResponseTypes(
        _issuer=_TIPOS_ISSUER,
        response=response,
        output_message=output_message,
        output_text=output_text,
        output_refusal=output_refusal,
        reasoning_item=reasoning_item,
        compaction_item=compaction_item,
    )
