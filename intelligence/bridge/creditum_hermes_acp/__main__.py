"""
Ponto de entrada da ponte ACP da Creditum.

    python3 -m creditum_hermes_acp --preflight    mede e sai. NÃO chama modelo.
    python3 -m creditum_hermes_acp                serve ACP por stdio.

O modo `--preflight` existe para o operador e para o adapter: ele responde a única
pergunta que decide tudo — QUANTAS definições de ferramenta chegariam ao modelo — sem
gastar um token e sem enviar nada.

A saída do preflight vai para stdout como UM objeto JSON sanitizado. Diagnóstico vai
para stderr. O código de saída é 0 quando compatível e 1 quando não, para que um
script possa decidir sem parsear.
"""

from __future__ import annotations

import json
import sys

from .bridge import CreditumAcpBridge
from .runtime import preflight


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv

    if "--preflight" in args:
        relatorio = preflight()
        sys.stdout.write(
            json.dumps(relatorio.to_public_dict(), ensure_ascii=False, indent=2)
        )
        sys.stdout.write("\n")
        sys.stdout.flush()
        # Compatível → 0. Qualquer outra coisa → 1. Falha fechada também no shell.
        return 0 if relatorio.compatible else 1

    return CreditumAcpBridge().serve()


if __name__ == "__main__":
    raise SystemExit(main())
