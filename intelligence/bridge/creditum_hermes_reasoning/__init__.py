"""
Runtime de raciocínio governado da Creditum — fase 3.1d-b.

Estratégia C: ACP mínimo, propriedade da Creditum. Não usa `acp_adapter.entry`,
`HermesACPAgent`, `SessionManager` de fábrica, banco de sessão, registro MCP nem
load/resume/fork.

Nada aqui chama modelo. O modo padrão é `PRECALL_PROBE`.
"""

from .contract import (
    APPROVED_CONSTITUTION_HASH,
    CONSTITUTION_ID,
    CONSTITUTION_VERSION,
    RUNTIME_ID,
    RUNTIME_VERSION,
    SYSTEM_CONTRACT_ID,
    SYSTEM_CONTRACT_VERSION,
    build_system_contract,
)

__all__ = [
    "APPROVED_CONSTITUTION_HASH",
    "CONSTITUTION_ID",
    "CONSTITUTION_VERSION",
    "RUNTIME_ID",
    "RUNTIME_VERSION",
    "SYSTEM_CONTRACT_ID",
    "SYSTEM_CONTRACT_VERSION",
    "build_system_contract",
]
