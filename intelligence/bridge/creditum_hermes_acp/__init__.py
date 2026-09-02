"""Ponte de compatibilidade ACP da Creditum para Hermes Agent 0.20.4 (fase 3.1b-r3)."""

from .capability import (
    BRIDGE_VERSION,
    GOVERNED_ACP_PROTOCOL_VERSION,
    GOVERNED_HERMES_VERSION,
    GOVERNED_TOOL_COUNT,
    CapabilityReport,
    CapabilityVerdict,
)

__all__ = [
    "BRIDGE_VERSION",
    "GOVERNED_ACP_PROTOCOL_VERSION",
    "GOVERNED_HERMES_VERSION",
    "GOVERNED_TOOL_COUNT",
    "CapabilityReport",
    "CapabilityVerdict",
]
