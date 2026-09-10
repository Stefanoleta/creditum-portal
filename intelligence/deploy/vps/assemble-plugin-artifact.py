#!/usr/bin/env python3
"""
D2E-A8-R1 §6 — monta o artefato de plugin de produção a partir da fonte EMBARCADA.

    python3 -B deploy/vps/assemble-plugin-artifact.py --out /staging/creditum-telegram-governed

Não há segunda cópia da a4 em git: a casca e o `plugin.yaml` vivem em
`deploy/vps/plugin-src/`, e o pacote governado vem de `bridge/creditum_hermes_telegram/`
por cópia byte a byte no momento da montagem.

A estrutura resultante é a que o formato de diretório do Hermes 0.20.4 exige, e é
exatamente a que a allowlist positiva da a6 aprova:

    <artefato>/plugin.yaml
    <artefato>/__init__.py
    <artefato>/creditum_hermes_telegram/*.py
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
CASCA = AQUI / "plugin-src"
PACOTE = RAIZ / "bridge" / "creditum_hermes_telegram"
NOME_PACOTE = "creditum_hermes_telegram"


def sha256(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(65536), b""):
            h.update(b)
    return h.hexdigest()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", required=True)
    a = p.parse_args(argv)

    destino = pathlib.Path(a.out)
    if destino.exists():
        print(f"destino já existe: {destino}", file=sys.stderr)
        return 2
    for origem in (CASCA / "plugin.yaml", CASCA / "__init__.py"):
        if not origem.is_file():
            print(f"casca ausente: {origem}", file=sys.stderr)
            return 2
    if not PACOTE.is_dir():
        print(f"pacote governado ausente: {PACOTE}", file=sys.stderr)
        return 2

    destino.mkdir(parents=True)
    (destino / NOME_PACOTE).mkdir()

    escritos: list[tuple[str, str]] = []
    for origem, rel in (
        (CASCA / "plugin.yaml", "plugin.yaml"),
        (CASCA / "__init__.py", "__init__.py"),
    ):
        alvo = destino / rel
        alvo.write_bytes(origem.read_bytes())
        escritos.append((rel, sha256(alvo)))

    for origem in sorted(PACOTE.iterdir()):
        if origem.is_dir() or origem.suffix != ".py":
            # A allowlist da a6 aprova só `.py` com nome de identificador, direto
            # dentro do pacote. Qualquer outra coisa aqui é recusa, não filtro.
            if origem.name != "__pycache__":
                print(f"entrada não aprovável no pacote: {origem.name}",
                      file=sys.stderr)
                return 2
            continue
        if not origem.stem.isidentifier():
            print(f"nome não é identificador Python: {origem.name}", file=sys.stderr)
            return 2
        rel = f"{NOME_PACOTE}/{origem.name}"
        alvo = destino / rel
        alvo.write_bytes(origem.read_bytes())
        escritos.append((rel, sha256(alvo)))

    print(f"=== artefato montado em {destino} ===")
    for rel, sha in escritos:
        print(f"  {rel:<44}{sha[:16]}…")
    print(f"\n  {len(escritos)} arquivos. Próximo passo: gerar o manifesto de")
    print("  implantação com scripts/build-telegram-plugin-manifest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
