#!/usr/bin/env python3
"""
D2E-A8-R4G — liga a autoridade da a6 ao ENTRYPOINT que de fato executa.

    python3 -B deploy/vps/bind-prestart-envelope.py --out /opt/creditum/prestart-gate.sh

─── O defeito que isto fecha ────────────────────────────────────────────────

A imagem copiava `scripts/prestart-gate.sh` INTACTO e o instalava como
`ENTRYPOINT`. O template traz, de propósito, um sentinela:

    MANIFESTO_SHA="__PREENCHER_NO_ARTEFATO__"

e recusa com `exit 3` enquanto ele estiver lá. Ou seja: todo arranque normal
da imagem morria antes da verificação da a6 — e nenhuma evidência via, porque
toda execução de CI sobrepunha o `ENTRYPOINT`.

O selo recomputava o manifesto da a6 e dava PASS. A autoridade existia; não
estava LIGADA ao caminho executável. É a família de defeito que a a4 fechou oito
vezes: *o que não é exercitado não é provado.*

─── Por que o template continua com sentinela ───────────────────────────────

`scripts/prestart-gate.sh` é o envelope FROZEN da a6 — reutilizável, e cego a
qual artefato concreto vai carregar. Ligar um SHA nele permanentemente faria o
template descrever uma implantação específica. A a8 é quem liga, na construção
da imagem, e o produto dessa ligação é OUTRO arquivo.

─── De onde vem o SHA ───────────────────────────────────────────────────────

Da mesma reconstrução governada que prova o manifesto da a6: monta os oito
arquivos das fontes do repositório, reconstrói o manifesto com as entradas
governadas e hasheia o resultado. Reusa `reproduz_artefato` e
`reproduz_manifesto_a6` do selador — nada de segundo algoritmo para a mesma
coisa, que é o defeito que a a6 passou quatro rodadas fechando.

NÃO vem de argumento de build, variável de ambiente, entrada de workflow,
segredo ou configuração. Não há valor que quem chama possa escolher.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import shutil
import sys
import tempfile

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
TEMPLATE = "scripts/prestart-gate.sh"
SELADOR = AQUI / "seal-runtime-manifest.py"

#: A linha EXATA que a ligação substitui. É a atribuição, não a comparação:
#: trocar as duas faria o guarda virar `[ "$X" = "$X" ]`, sempre verdadeiro, e a
#: imagem recusaria em todo arranque. Uma substituição, e ela é inequívoca —
#: esta string ocorre uma única vez no template.
ATRIBUICAO = 'MANIFESTO_SHA="__PREENCHER_NO_ARTEFATO__"'
SENTINELA = "__PREENCHER_NO_ARTEFATO__"

#: A comparação do guarda PERMANECE com o sentinela literal, e tem de permanecer:
#: é ela que faz o guarda funcionar. Depois da ligação o sentinela ainda aparece
#: uma vez, dentro dessa comparação, e é assim que tem de ser.
GUARDA = 'if [ "${MANIFESTO_SHA}" = "__PREENCHER_NO_ARTEFATO__" ]; then'


class LigacaoRecusada(Exception):
    """Falha fechada: o envelope instalado não pôde ser ligado com prova."""


def _modulo(nome: str, caminho: pathlib.Path):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    if spec is None or spec.loader is None:
        raise LigacaoRecusada(f"módulo ausente: {caminho}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


def sha_do_manifesto_a6(raiz: pathlib.Path) -> str:
    """Reconstrói artefato e manifesto pelas fontes governadas e devolve o SHA."""
    selador = _modulo("_a8r4g_selador", SELADOR)
    doc = json.loads((AQUI / "runtime-manifest.json").read_text(encoding="utf-8"))
    entradas = doc["plugin_artifact"]["a6_manifest_inputs"]
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="a8r4g-"))
    try:
        arvore = tmp / "creditum-telegram-governed"
        arquivos = selador.reproduz_artefato(raiz, arvore)
        if len(arquivos) != doc["plugin_artifact"]["file_count"]:
            raise LigacaoRecusada(
                f"artefato com {len(arquivos)} arquivos; esperado "
                f"{doc['plugin_artifact']['file_count']}")
        for rel, sha in sorted(arquivos.items()):
            if doc["plugin_artifact"]["files"].get(rel) != sha:
                raise LigacaoRecusada(f"arquivo de plugin divergente: {rel}")
        return selador.reproduz_manifesto_a6(raiz, arvore, entradas,
                                             tmp / "MANIFEST.json")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def liga(template: str, sha: str) -> str:
    """Substitui a ATRIBUIÇÃO, uma vez, e prova o que sobrou."""
    if template.count(ATRIBUICAO) != 1:
        raise LigacaoRecusada(
            f"a atribuição do sentinela ocorre {template.count(ATRIBUICAO)}x; esperado 1")
    if GUARDA not in template:
        raise LigacaoRecusada("o guarda do envelope não está no template")
    ligado = template.replace(ATRIBUICAO, f'MANIFESTO_SHA="{sha}"', 1)

    # ─── as provas do §3, medidas no resultado ──────────────────────────────
    if ATRIBUICAO in ligado:
        raise LigacaoRecusada("a atribuição do sentinela sobreviveu à ligação")
    if ligado.count(sha) != 1:
        raise LigacaoRecusada(f"o SHA aparece {ligado.count(sha)}x; esperado 1")
    if GUARDA not in ligado:
        raise LigacaoRecusada("a ligação destruiu o guarda")
    # O sentinela remanescente é o da COMPARAÇÃO, e só ele.
    if ligado.count(SENTINELA) != 1:
        raise LigacaoRecusada(
            f"sentinela remanescente {ligado.count(SENTINELA)}x; esperado 1 (o do guarda)")
    return ligado


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="liga o SHA da a6 ao envelope instalado")
    p.add_argument("--out", required=True)
    p.add_argument("--repo", default=str(RAIZ))
    p.add_argument("--expect", default=None,
                   help="apenas para teste negativo; sem isto o esperado vem do manifesto")
    a = p.parse_args(argv)

    raiz = pathlib.Path(a.repo)
    doc = json.loads((AQUI / "runtime-manifest.json").read_text(encoding="utf-8"))
    esperado = a.expect or doc["plugin_artifact"]["a6_manifest_sha256"]

    try:
        sha = sha_do_manifesto_a6(raiz)
    except Exception as causa:  # noqa: BLE001 — reconstruir falhou: recusa.
        print(f"RECUSA A6_MANIFEST_NAO_RECONSTRUIVEL {type(causa).__name__}: {causa}",
              file=sys.stderr)
        return 2
    if sha != esperado:
        print(f"RECUSA A6_MANIFEST_DIVERGENTE {sha[:16]}… != {str(esperado)[:16]}…",
              file=sys.stderr)
        return 2

    template = (raiz / TEMPLATE).read_text(encoding="utf-8")
    try:
        ligado = liga(template, sha)
    except LigacaoRecusada as causa:
        print(f"RECUSA ENVELOPE_NAO_LIGADO {causa}", file=sys.stderr)
        return 2

    destino = pathlib.Path(a.out)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(ligado, encoding="utf-8")
    destino.chmod(0o755)

    print("=== envelope de arranque LIGADO ===")
    print(f"  template            {raiz / TEMPLATE}")
    print(f"  template sha256     {hashlib.sha256(template.encode()).hexdigest()}")
    print(f"  sentinela no template  {template.count(SENTINELA)}")
    print(f"  a6 manifest sha256  {sha}")
    print(f"  instalado           {destino}")
    print(f"  instalado sha256    {hashlib.sha256(ligado.encode()).hexdigest()}")
    print(f"  atribuição ligada   1 · sentinela remanescente (guarda) "
          f"{ligado.count(SENTINELA)} · SHA embutido {ligado.count(sha)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
