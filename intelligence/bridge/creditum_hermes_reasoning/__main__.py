"""
Fase 3.1d-b-r3 — a CLI de deploy. Só PRECALL.

─── O que ela faz ───────────────────────────────────────────────────────────

Percorre a construção governada inteira — vínculo, contrato, read model próprio,
payload determinístico, requisição fechada, portão final — e PARA. Sem cliente, sem
requisição ao provider, sem rede.

─── O que ela NÃO oferece ───────────────────────────────────────────────────

    --live            não existe. Não há emissor de capacidade.
    --provider        não existe. A identidade vem do resolvedor.
    --model           não existe.
    --api-mode        não existe.
    --base-url        não existe.
    --api-key         não existe. Segredo não entra por linha de comando.
    --cwd             não existe. A raiz aprovada é constante.

Nenhuma variável de ambiente vira autoridade. O resolvedor confiável é a única fonte
do vínculo, e enquanto ele não estiver instalado a CLI recusa com
`RUNTIME_NOT_RESOLVED` — que é a resposta certa, não uma limitação a contornar.

─── Nada de `run_agent` ─────────────────────────────────────────────────────

A versão anterior importava `run_agent` para pegar o `AIAgent`. Importar esse módulo
EXECUTA `load_hermes_dotenv()`, então o import lia segredo do disco antes de qualquer
decisão. Este arquivo não o importa.
"""

from __future__ import annotations

import sys

from .codex import PrecallProbeComplete, resolve_production_governed_response_types
from .contract import (
    RUNTIME_ID,
    RUNTIME_VERSION,
    ContractError,
    build_system_contract,
)
from .executor import (
    MODE_PRECALL_PROBE,
    PRODUCTION_CLIENT,
    PRODUCTION_SDK_VERSION,
    PRODUCTION_RESPONSES,
    CreditumCodexReasoningExecutor,
    ExecutorRefusal,
    GovernedReasoningRun,
    TrustedSdkProvider,
    resolve_production_trusted_sdk_provider,
)
from .codex import CodexRefusal
from .probe import (
    PrecallProbeReport,
    PrecallRefusalReport,
    load_fixture,
    serialize_safe_public_report,
)
from .runtime import (
    APPROVED_API_MODE,
    safe_label,
    RuntimeDefect,
    safe_exception_type,
    APPROVED_MODEL,
    APPROVED_PROVIDER,
    RuntimeRefusal,
    resolve_approved_runtime_binding,
)

EXECUTOR_NAME = "CreditumCodexReasoningExecutor"

#: O único id de fixture aprovado desta fase.
APPROVED_FIXTURE_ID = "creditum_hermes_synthetic_direct_fact/v1"


def _log(msg: str) -> None:
    sys.stderr.write(f"{msg}\n")


def _recusa(defeito: str) -> int:
    # Nem aqui um dicionário literal: a estrutura fechada é a conferência, e um
    # literal só parece seguro enquanto todos os seus valores forem constantes.
    sys.stdout.write(
        serialize_safe_public_report(
            PrecallRefusalReport(
                runtime_id=RUNTIME_ID,
                runtime_version=RUNTIME_VERSION,
                mode=MODE_PRECALL_PROBE,
                executor=EXECUTOR_NAME,
                verdict=defeito,
                aiagent_used=False,
                sdk_call_attempted=False,
                provider_call_count=0,
            )
        )
        + "\n"
    )
    return 1


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if "--precall-probe" not in args:
        _log("uso: python3 -m creditum_hermes_reasoning --precall-probe")
        return 2
    # Qualquer outra flag é recusa: aceitar silenciosamente o que não se entende deixa
    # um operador achar que configurou algo.
    desconhecidas = [a for a in args if a != "--precall-probe"]
    if desconhecidas:
        _log(f"flags não suportadas: {desconhecidas}")
        return 2

    try:
        contrato = build_system_contract()
    except ContractError as e:
        _log(f"contrato de sistema recusado: {e.defect} — {e.detail}")
        return _recusa(e.defect)

    fixture, fixture_hash = load_fixture()

    try:
        binding = resolve_approved_runtime_binding()
    except RuntimeRefusal as r:
        _log(f"vínculo de runtime não resolvido: {r.defect} — {r.detail}")
        return _recusa(r.defect)
    except Exception as causa:  # noqa: BLE001
        # Defesa em profundidade. A fronteira selada do resolvedor já converte exceção
        # de terceiro em recusa própria; isto existe para que NENHUM caminho novo possa
        # imprimir um traceback com mensagem de fora. Só o nome do tipo sai.
        # `type(causa).__name__` é texto de TERCEIRO: construir classe com nome
        # arbitrário é Python legal. O mesmo sanitizador do resolvedor, e não outro.
        _log(f"falha não classificada ao resolver runtime: {safe_exception_type(causa)}")
        return _recusa(RuntimeDefect.HERMES_RUNTIME_RESOLUTION_FAILED)

    # ─── O SDK de produção é SELADO aqui, e nada é construído ───────────────
    #
    # Selar exige importar `openai` e inspecionar classes e descritor. Não exige — e
    # não faz — instanciar cliente: a sonda prova semântica de requisição, e um objeto
    # capaz de rede não ajuda nisso.
    provedor: TrustedSdkProvider | None = None
    try:
        provedor = resolve_production_trusted_sdk_provider()
    except (ExecutorRefusal, CodexRefusal) as r:
        _log(f"SDK de produção não selado: {r.defect} — {r.detail}")
        return _recusa(r.defect)

    # A política de resposta só é declarada pronta quando as seis classes EXATAS do
    # SDK instalado também foram seladas. Esta leitura não constrói cliente nem chama
    # o provedor.
    try:
        response_types = resolve_production_governed_response_types()
    except CodexRefusal as r:
        _log(f"tipos de resposta não selados: {r.defect} — {r.detail}")
        return _recusa(r.defect)

    run = GovernedReasoningRun(
        contract=contrato,
        binding=binding,
        read_model=fixture["read_model"],
        # Sem autorização: a CLI não tem como pedir VIVO. Não existe flag, não existe
        # variável de ambiente, não existe emissor de produção.
        live_authorization=None,
    )

    executor = CreditumCodexReasoningExecutor(
        sdk_provider=provedor, response_types=response_types
    )
    veredito = "PRECALL_PROBE_REFUSED"
    try:
        executor.precall_probe(run)
        veredito = "PRECALL_PROBE_LEAKED"  # `precall_probe` deveria ter levantado
    except PrecallProbeComplete:
        veredito = "PRECALL_PROBE_COMPLETE"
    except (ExecutorRefusal, RuntimeRefusal) as r:
        _log(f"recusa governada: {r.defect} — {r.detail}")
        veredito = r.defect
    except Exception as causa:  # noqa: BLE001
        # O tipo, nunca a mensagem: mensagem de exceção de terceiro pode carregar valor.
        _log(f"falha estruturada: {safe_exception_type(causa)}")
        veredito = "REQUEST_NOT_CANONICAL"

    ev = executor.evidence
    ok = veredito == "PRECALL_PROBE_COMPLETE"
    relatorio = PrecallProbeReport(
        runtime_id=RUNTIME_ID,
        runtime_version=RUNTIME_VERSION,
        mode=MODE_PRECALL_PROBE,
        executor=EXECUTOR_NAME,
        constitution_id=contrato.constitution_id,
        constitution_version=contrato.constitution_version,
        constitution_hash=contrato.constitution_hash,
        system_contract_id=contrato.system_contract_id,
        system_contract_version=contrato.system_contract_version,
        system_contract_hash=contrato.system_contract_hash,
        # O id do fixture é constante GOVERNADA. `str()` sobre o valor lido do JSON
        # coagiria o que viesse; a allowlist afirma qual é o valor esperado.
        fixture_id=safe_label(fixture.get("fixture_id"), (APPROVED_FIXTURE_ID,)),
        fixture_hash=fixture_hash,
        provider=APPROVED_PROVIDER,
        model=APPROVED_MODEL,
        api_mode=APPROVED_API_MODE,
        base_url_structurally_valid=True,
        base_url_scheme="https",
        base_url_fingerprint=binding.base_url_fingerprint(),
        # Constante NOSSA. `verify_sdk_surface` já provou a igualdade; `str()` sobre o
        # objeto do SDK executaria o `__str__` dele para dizer o que já sabemos.
        sdk_version=PRODUCTION_SDK_VERSION,
        sdk_client_class=".".join(PRODUCTION_CLIENT),
        sdk_responses_class=".".join(PRODUCTION_RESPONSES),
        sdk_create_descriptor=".".join(PRODUCTION_RESPONSES) + ".create",
        sdk_constructor_surface_verified=True,
        sdk_create_surface_verified=True,
        live_response_policy=provedor.response_policy,
        secret_material_present=binding.has_secret_material(),
        secret_material_type="str" if binding.has_secret_material() else "",
        secret_material_nonempty=binding.has_secret_material(),
        secret_material_exposed=False,
        system_contract_exact=ok,
        user_payload_exact=ok,
        user_payload_hash=ev.user_payload_hash if ev else "",
        request_hash=ev.request_hash if ev else "",
        tool_count=ev.tool_count if ev else -1,
        aiagent_used=False,
        plugin_discovery_used=False,
        hermes_relay_used=False,
        client_constructions=ev.client_constructions if ev else 0,
        sdk_call_attempted=False,
        provider_call_count=ev.provider_calls if ev else 0,
        model_call_completed=False,
        verdict=veredito,
    )
    sys.stdout.write(serialize_safe_public_report(relatorio) + "\n")
    sys.stdout.flush()
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
