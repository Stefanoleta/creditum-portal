#!/usr/bin/env python3
"""
D2E-A8-R4F — as autoridades governadas, em forma de `KEY=valor` para o CI.

    python3 -B deploy/vps/ci-evidence-env.py >> "$GITHUB_ENV"

Existe para que o workflow NÃO reescreva nenhum valor. Todo dígito, commit e
versão sai do `runtime-manifest.json`; duas listas da mesma verdade divergem, e a
que ninguém confere é a que mente.

Recusa se qualquer autoridade estiver nula: um CI que sobe com campo vazio prova
menos do que parece.
"""
from __future__ import annotations

import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
MANIFESTO = AQUI / "runtime-manifest.json"

#: `KEY` do ambiente → caminho no manifesto.
EXPORTADAS = (
    ("HERMES_COMMIT", ("hermes_source", "commit")),
    ("HERMES_LOCK_SHA256", ("hermes_source", "lock_sha256")),
    ("INVENTARIO_ESPERADO", ("hermes_source", "runtime_inventory_sha256")),
    ("A6_ESPERADO", ("plugin_artifact", "a6_manifest_sha256")),
    ("UV_DIGESTO", ("build_toolchain", "uv_image_digest")),
    ("PYTHON_BASE_DIGESTO", ("build_toolchain", "python_base_digest")),
    ("PYTHON_ESPERADO", ("runtime_versions", "python")),
)


def main() -> int:
    doc = json.loads(MANIFESTO.read_text(encoding="utf-8"))
    linhas = []
    for chave, caminho in EXPORTADAS:
        alvo = doc
        for parte in caminho:
            alvo = alvo[parte]
        if not isinstance(alvo, str) or not alvo:
            print(f"AUTORIDADE_NULA {chave} ({'.'.join(caminho)})", file=sys.stderr)
            return 2
        if "\n" in alvo or "=" in alvo:
            print(f"AUTORIDADE_NAO_CANONICA {chave}", file=sys.stderr)
            return 2
        linhas.append(f"{chave}={alvo}")
    print("\n".join(linhas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
