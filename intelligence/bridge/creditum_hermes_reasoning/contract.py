"""
Fase 3.1d-b — o contrato de sistema governado pela Creditum.

─── A autoridade mora no TypeScript ─────────────────────────────────────────

A constituição foi escrita, revisada e CONGELADA em
`integration/src/hermes/constitution.ts`, com hash aprovado por gate adversarial.

Este módulo NÃO é uma segunda autoridade. Ele carrega os bytes exportados daquele
módulo e RECALCULA o hash com o mesmo domínio. Se um byte divergir, ele falha fechado.

Duplicar o texto em Python criaria duas fontes da mesma verdade, e a que valeria seria
a que ninguém olhou. Verificar em vez de repetir é o que mantém uma autoridade só.

─── O que este arquivo NUNCA faz ─────────────────────────────────────────────

Não importa Hermes. Não chama modelo. Não lê configuração. Não conhece dado de negócio.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from dataclasses import dataclass

from .runtime import safe_exception_type

# ─────────────────────────────────────────────────────────────────────────────
# Identidade governada — espelha a 3.1c, e é conferida contra ela
# ─────────────────────────────────────────────────────────────────────────────

CONSTITUTION_ID = "creditum_hermes_constitution/v1"
CONSTITUTION_VERSION = "1.0.0"
CONSTITUTION_HASH_DOMAIN = "hermes_constitution_content/v1"

#: O hash APROVADO. Não é derivado do arquivo — é a expectativa contra a qual o
#: arquivo é conferido. Derivá-lo do próprio arquivo tornaria a verificação circular.
APPROVED_CONSTITUTION_HASH = (
    "38a38edc0af169bdfffde8e196a6fe8ba9acc82ba5b0ae0cb5726db0d95a1b79"
)

REASONING_CONTRACT_VERSION = "1.0.0"

#: O contrato de SISTEMA é um artefato próprio: constituição + vínculo de contrato.
#: Hash em domínio separado, porque compromete com um conteúdo diferente.
SYSTEM_CONTRACT_ID = "creditum_hermes_reasoning_system/v1"
SYSTEM_CONTRACT_VERSION = "1.0.0"
SYSTEM_CONTRACT_HASH_DOMAIN = "hermes_reasoning_system_content/v1"

RUNTIME_ID = "creditum_hermes_reasoning_runtime/v1"
RUNTIME_VERSION = "1.0.0"

CONSTITUTION_FILE = (
    pathlib.Path(__file__).parent / "constitution" / "creditum_hermes_constitution.v1.txt"
)

#: Sentinelas do contexto de sistema DE FÁBRICA. Nenhuma pode aparecer no conteúdo
#: final. São nomes de constantes e trechos observados na 3.1d-a2, usados como prova de
#: ausência — não como filtro: o gate compara IGUALDADE EXATA, e estas existem para o
#: teste falhar alto se um dia a igualdade for afrouxada para "contém".
STOCK_SYSTEM_SENTINELS = (
    "DEFAULT_AGENT_IDENTITY",
    "HERMES_AGENT_HELP_GUIDANCE",
    "SOUL.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    ".hermes.md",
    "_CLAUDE_CODE_SYSTEM_PREFIX",
)


class ContractDefect:
    """Vocabulário FECHADO. Nenhum deles é 'siga com aviso'."""

    CONSTITUTION_FILE_MISSING = "CONSTITUTION_FILE_MISSING"
    CONSTITUTION_DRIFT = "CONSTITUTION_DRIFT"
    SYSTEM_CONTRACT_MISMATCH = "SYSTEM_CONTRACT_MISMATCH"


class ContractError(Exception):
    """Falha estruturada. Nunca vira texto de assistente."""

    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect
        self.detail = detail


def _material(dominio: str, payload: dict[str, object]) -> str:
    # `separators` e `ensure_ascii=False` reproduzem EXATAMENTE `JSON.stringify` do
    # lado TypeScript. A paridade foi medida, não suposta: o mesmo texto produz o
    # mesmo dígito nas duas linguagens.
    corpo = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"{dominio}:{corpo}"


def constitution_content_hash(texto: str) -> str:
    """O mesmo cálculo do módulo TypeScript, com o mesmo domínio e a mesma ordem."""
    return hashlib.sha256(
        _material(
            CONSTITUTION_HASH_DOMAIN,
            {"v": CONSTITUTION_VERSION, "id": CONSTITUTION_ID, "text": texto},
        ).encode("utf-8")
    ).hexdigest()


def load_constitution_text() -> str:
    """
    Os bytes aprovados, ou recusa.

    Sem normalização de nenhum tipo. Nenhum `strip()`, nenhuma troca de fim de linha,
    nenhuma reindentação: normalizar aqui produziria um texto que passa no hash e não é
    o que foi aprovado — ou, pior, um que falha por uma diferença que não é semântica.
    """
    try:
        bruto = CONSTITUTION_FILE.read_bytes()
    except OSError as causa:
        raise ContractError(
            ContractDefect.CONSTITUTION_FILE_MISSING, safe_exception_type(causa)
        ) from None
    texto = bruto.decode("utf-8")
    observado = constitution_content_hash(texto)
    if observado != APPROVED_CONSTITUTION_HASH:
        # Não ecoa o conteúdo: formatá-lo exigiria tratá-lo como confiável.
        raise ContractError(
            ContractDefect.CONSTITUTION_DRIFT,
            f"esperado {APPROVED_CONSTITUTION_HASH[:12]}…, obtido {observado[:12]}…",
        )
    return texto


# ─────────────────────────────────────────────────────────────────────────────
# O contrato de sistema
# ─────────────────────────────────────────────────────────────────────────────
#
# ─── Por que o rodapé é curto ────────────────────────────────────────────────
#
# A §17 da constituição JÁ carrega o contrato de saída — o envelope `{"insights": […]}`,
# a proibição de cerca de código, o `[]` explícito como resultado legítimo. Repetir isso
# aqui criaria duas redações da mesma regra, e divergência futura entre elas seria
# invisível até um modelo obedecer à errada.
#
# O rodapé, então, não RESTATE nada: ele só NOMEIA a identidade do contrato em vigor,
# para que o texto que o modelo recebe diga a que versão ele pertence.

_RODAPE = (
    "",
    "---",
    "",
    "## IDENTIDADE DESTE CONTRATO",
    "",
    f"constituição: {CONSTITUTION_ID} · {CONSTITUTION_VERSION}",
    f"contrato de raciocínio: {REASONING_CONTRACT_VERSION}",
    f"contrato de sistema: {SYSTEM_CONTRACT_ID} · {SYSTEM_CONTRACT_VERSION}",
    "",
    "As regras de formato de saída são as da seção 17 acima. Não existe outra.",
)


@dataclass(frozen=True)
class SystemContract:
    """O conteúdo de sistema exato, e sua identidade."""

    text: str
    system_contract_id: str
    system_contract_version: str
    system_contract_hash: str
    constitution_id: str
    constitution_version: str
    constitution_hash: str
    reasoning_contract_version: str


def system_contract_hash(texto: str) -> str:
    return hashlib.sha256(
        _material(
            SYSTEM_CONTRACT_HASH_DOMAIN,
            {
                "v": SYSTEM_CONTRACT_VERSION,
                "id": SYSTEM_CONTRACT_ID,
                "constitution": APPROVED_CONSTITUTION_HASH,
                "text": texto,
            },
        ).encode("utf-8")
    ).hexdigest()


def build_system_contract() -> SystemContract:
    """
    O conteúdo de sistema que o provider vai receber — inteiro, e só ele.

    Determinístico: sem relógio, sem hostname, sem ambiente, sem provider. Mesma
    entrada, mesmos bytes, mesmo hash, em qualquer máquina.
    """
    constituicao = load_constitution_text()
    texto = constituicao + "\n".join(_RODAPE)

    # A constituição tem de sobreviver INTEIRA e INTOCADA dentro do contrato.
    if constituicao not in texto:  # pragma: no cover — construção própria
        raise ContractError(ContractDefect.SYSTEM_CONTRACT_MISMATCH, "constituição ausente")
    # E nenhuma sentinela de fábrica pode ter entrado pelo rodapé.
    for s in STOCK_SYSTEM_SENTINELS:
        if s in texto:  # pragma: no cover
            raise ContractError(ContractDefect.SYSTEM_CONTRACT_MISMATCH, f"sentinela: {s}")

    return SystemContract(
        text=texto,
        system_contract_id=SYSTEM_CONTRACT_ID,
        system_contract_version=SYSTEM_CONTRACT_VERSION,
        system_contract_hash=system_contract_hash(texto),
        constitution_id=CONSTITUTION_ID,
        constitution_version=CONSTITUTION_VERSION,
        constitution_hash=APPROVED_CONSTITUTION_HASH,
        reasoning_contract_version=REASONING_CONTRACT_VERSION,
    )
