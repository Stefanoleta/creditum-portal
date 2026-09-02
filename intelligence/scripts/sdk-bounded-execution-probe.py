#!/usr/bin/env python3
"""
3.1d-D1 — SONDA DA SUPERFÍCIE DE EXECUÇÃO LIMITADA DO SDK. SOMENTE LEITURA.

─── Por que ela existe ───────────────────────────────────────────────────────

A D1 exige provar que uma chamada LIVE tem prazo finito, zero retry automático e
nenhuma execução em segundo plano. A fase é explícita: `Do not assume SDK defaults`.

A máquina de desenvolvimento não tem o `openai`. Esta sonda produz, em produção, os
fatos que só produção pode produzir — do mesmo jeito que a 3.1d-c5 produziu a forma
de `Response.output`.

─── O que ela NÃO faz ────────────────────────────────────────────────────────

  não constrói cliente OpenAI       não chama responses.create
  não faz rede                      não chama modelo
  não lê .env                       não imprime segredo, api_key nem base_url
  não escreve nada                  não muda configuração

Só `import`, `inspect.signature` e leitura de constantes de módulo.

─── Uso ──────────────────────────────────────────────────────────────────────

  /opt/venv/bin/python3 sdk-bounded-execution-probe.py

Saída: UM objeto JSON em stdout, pronto para colar de volta no gate.
"""

from __future__ import annotations

import inspect
import json
import sys


def _texto(valor: object, limite: int = 200) -> str:
    """Repr CONTROLADO de objeto do SDK: só o que descreve forma, truncado."""
    try:
        t = repr(valor)
    except Exception:  # noqa: BLE001
        return f"<repr indisponível: {type(valor).__name__}>"
    return t[:limite]


def _assinatura(fn: object) -> dict:
    try:
        sig = inspect.signature(fn)  # type: ignore[arg-type]
    except (TypeError, ValueError) as causa:
        return {"erro": type(causa).__name__}
    params = {}
    for nome, p in sig.parameters.items():
        params[nome] = {
            "kind": str(p.kind),
            "has_default": p.default is not inspect.Parameter.empty,
            "default": _texto(p.default, 80) if p.default is not inspect.Parameter.empty else None,
            "annotation": _texto(p.annotation, 160)
            if p.annotation is not inspect.Parameter.empty
            else None,
        }
    return {"parameters": params, "count": len(params)}


def main() -> int:
    fora: dict = {"probe": "3.1d-D1 bounded execution surface", "read_only": True}
    try:
        import openai
    except Exception as causa:  # noqa: BLE001
        fora["status"] = "SDK_NOT_AVAILABLE"
        fora["error_type"] = type(causa).__name__
        sys.stdout.write(json.dumps(fora, indent=2, ensure_ascii=False) + "\n")
        return 1

    fora["status"] = "OK"
    fora["openai_version"] = getattr(openai, "__version__", None)
    fora["python_version"] = sys.version.split()[0]

    # ── cliente: timeout e max_retries são parâmetros de construção? ─────────
    cliente = getattr(openai, "OpenAI", None)
    fora["client_class"] = f"{getattr(cliente, '__module__', '?')}.{getattr(cliente, '__qualname__', '?')}"
    fora["client_init_signature"] = _assinatura(getattr(cliente, "__init__", None))
    fora["client_has_with_options"] = hasattr(cliente, "with_options")
    if hasattr(cliente, "with_options"):
        fora["client_with_options_signature"] = _assinatura(cliente.with_options)

    # ── constantes de default do SDK: o que vale se ninguém disser nada ─────
    defaults = {}
    for nome in ("DEFAULT_TIMEOUT", "DEFAULT_MAX_RETRIES", "DEFAULT_CONNECTION_LIMITS"):
        for mod in (openai, getattr(openai, "_constants", None)):
            if mod is not None and hasattr(mod, nome):
                defaults[nome] = _texto(getattr(mod, nome))
                break
    fora["sdk_defaults"] = defaults
    fora["NOT_GIVEN"] = _texto(getattr(openai, "NOT_GIVEN", None), 80)

    # ── Responses.create: timeout, background, stream ────────────────────────
    try:
        import importlib

        resp_mod = importlib.import_module("openai.resources.responses.responses")
        Responses = getattr(resp_mod, "Responses", None)
        create = getattr(Responses, "create", None)
        fora["responses_class"] = f"{getattr(Responses, '__module__', '?')}.{getattr(Responses, '__qualname__', '?')}"
        assinatura = _assinatura(create)
        fora["responses_create_signature"] = assinatura
        p = assinatura.get("parameters", {})
        fora["create_supports_timeout"] = "timeout" in p
        fora["create_supports_background"] = "background" in p
        fora["create_supports_stream"] = "stream" in p
        fora["create_timeout_annotation"] = (p.get("timeout") or {}).get("annotation")
        fora["create_timeout_default"] = (p.get("timeout") or {}).get("default")
        fora["create_background_annotation"] = (p.get("background") or {}).get("annotation")
        fora["create_background_default"] = (p.get("background") or {}).get("default")
    except Exception as causa:  # noqa: BLE001
        fora["responses_error_type"] = type(causa).__name__

    # ── httpx: o tipo de timeout que o SDK realmente aceita ─────────────────
    try:
        import httpx

        fora["httpx_version"] = getattr(httpx, "__version__", None)
        fora["httpx_timeout_init"] = _assinatura(httpx.Timeout.__init__)
    except Exception as causa:  # noqa: BLE001
        fora["httpx_error_type"] = type(causa).__name__

    # ── a pergunta que decide o desenho: existe cancelamento REMOTO? ────────
    #
    # Um timeout local prova que a Creditum PARA DE ESPERAR. Ele não prova que o
    # servidor parou de computar. Se houver API de cancelamento, ela aparece aqui.
    cancelamento = {}
    try:
        import importlib

        resp_mod = importlib.import_module("openai.resources.responses.responses")
        Responses = getattr(resp_mod, "Responses", None)
        for nome in ("cancel", "retrieve", "delete"):
            cancelamento[nome] = hasattr(Responses, nome)
            if hasattr(Responses, nome):
                cancelamento[f"{nome}_signature"] = _assinatura(getattr(Responses, nome))
    except Exception as causa:  # noqa: BLE001
        cancelamento["erro"] = type(causa).__name__
    fora["remote_cancellation_surface"] = cancelamento

    # ── prova de que nada foi construído nem chamado ────────────────────────
    fora["openai_client_constructions"] = 0
    fora["responses_create_calls"] = 0
    fora["provider_calls"] = 0
    fora["model_calls"] = 0
    fora["network_requests"] = 0

    sys.stdout.write(json.dumps(fora, indent=2, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
