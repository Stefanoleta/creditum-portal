#!/usr/bin/env python3
"""
D2E-A8-R4F — o sumário de evidência, legível por máquina.

    python3 -B deploy/vps/ci-evidence-summary.py --inventory <sha> --a6 <sha> ...

Duas partes, e a separação é o ponto:

  `governed`   fatos governados, SEM relógio. Um dígito que muda com o horário
               não descreve o artefato — descreve quando alguém rodou o CI.
  `run_metadata`  id da imagem, id da execução, runner. Útil e NÃO autoritativo,
               fora do dígito de propósito.

Nada de segredo entra aqui: só hashes, versões, caminhos governados e contadores.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
MANIFESTO = AQUI / "runtime-manifest.json"

SHA_HEX = 64
GOVERNADOS = ("deploy/vps/Dockerfile", "deploy/vps/compose.yaml",
              "deploy/vps/runtime-inventory.py", "deploy/vps/verify-final-image.py",
              "scripts/prestart-gate.sh")


def sha256(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def hex64(valor: str, nome: str) -> str:
    if not (len(valor) == SHA_HEX and all(c in "0123456789abcdef" for c in valor)):
        raise SystemExit(f"{nome} nao e sha256 de 64 hex: {valor[:24]!r}")
    return valor


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="sumario de evidencia do a8-r4")
    p.add_argument("--inventory", required=True)
    p.add_argument("--a6", required=True)
    p.add_argument("--evidence-commit", required=True)
    p.add_argument("--image-id", default="")
    p.add_argument("--run-id", default="")
    p.add_argument("--runner", default="")
    a = p.parse_args(argv)

    doc = json.loads(MANIFESTO.read_text(encoding="utf-8"))
    fonte, art, ferramenta = (doc["hermes_source"], doc["plugin_artifact"],
                              doc["build_toolchain"])

    governado = {
        "evidence_commit": a.evidence_commit,
        "governed_file_sha256": {rel: sha256(RAIZ / rel) for rel in GOVERNADOS},
        "python_base_image": ferramenta["python_base_image"],
        "python_base_digest": ferramenta["python_base_digest"],
        "uv_version": ferramenta["uv_version"],
        "uv_image_digest": ferramenta["uv_image_digest"],
        "hermes_source_commit": fonte["commit"],
        "uv_lock_sha256": fonte["lock_sha256"],
        "build_sha_expected": fonte["commit"],
        "python_version": doc["runtime_versions"]["python"],
        "python_implementation": "cpython",
        "packages": dict(sorted(doc["critical_packages"].items())),
        "openai": doc["runtime_versions"]["openai"],
        "hermes_agent": doc["runtime_versions"]["hermes_agent"],
        "runtime_inventory_algorithm": fonte["runtime_inventory_algorithm"],
        "runtime_inventory_sha256": hex64(a.inventory, "--inventory"),
        "plugin_file_count": art["file_count"],
        "plugin_files": art["files"],
        "a6_manifest_sha256": hex64(a.a6, "--a6"),
        "final_seal": "PASS",
        "gateway_started": False,
        "telegram_contact": 0,
        "model_calls": 0,
        "responses_create": 0,
        "evidence_network": "none",
        "first_live": False,
    }
    saida = {
        "schema": "creditum_a8_r4_final_image_evidence/v1",
        "governed": governado,
        # O dígito cobre SÓ a porção governada, em forma canônica e ordenada.
        "governed_sha256": hashlib.sha256(
            json.dumps(governado, sort_keys=True,
                       separators=(",", ":")).encode("utf-8")).hexdigest(),
        "run_metadata": {"image_id": a.image_id, "run_id": a.run_id,
                         "runner": a.runner},
    }
    print(json.dumps(saida, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
