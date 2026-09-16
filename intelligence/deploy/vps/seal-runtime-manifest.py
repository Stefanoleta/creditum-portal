#!/usr/bin/env python3
"""
D2E-A8-R1 §2 · D2E-A8-R4 §9–§10 — sela e CONFERE o manifesto de construção.

    python3 -B deploy/vps/seal-runtime-manifest.py --seal
    python3 -B deploy/vps/seal-runtime-manifest.py --check
    python3 -B deploy/vps/seal-runtime-manifest.py --check --runtime-root /opt/hermes-agent

─── O que mudou na a8-r4 ─────────────────────────────────────────────────────

O `--check` antigo conferia PRESENÇA: campo não-nulo passava. Presença não é
autoridade — um número escrito à mão num JSON passava igual a um número medido.

Agora o `--check` RECOMPUTA:

    hashes dos governados   relê os arquivos e rehasheia
    artefato do plugin      remonta os 8 arquivos e compara byte a byte
    manifesto da a6         reconstrói com as ENTRADAS GOVERNADAS e compara o SHA
    inventário do runtime   observa o runtime vivo e compara o dígito

O inventário só pode ser observado DE DENTRO do runtime que descreve, então ele
exige `--runtime-root`. Sem a raiz, o `--check` recusa em vez de pular: pular
seria voltar a conferir presença.

Não há SELADO parcial. Qualquer componente irresolvido derruba o resultado
inteiro, porque um manifesto meio selado é usado como se fosse selado.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import shutil
import sys
import tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MANIFESTO = AQUI / "runtime-manifest.json"

#: Arquivo governado → caminho relativo à raiz do `intelligence/`.
GOVERNADOS = {
    "Dockerfile": "deploy/vps/Dockerfile",
    "prestart-gate.sh": "scripts/prestart-gate.sh",
    "compose.yaml": "deploy/vps/compose.yaml",
}

SHA_HEX = 64

#: O artefato de plugin, exatamente como o formato de diretório da 0.20.4 exige.
ARTEFATO_ESPERADO = (
    "__init__.py",
    "creditum_hermes_telegram/__init__.py",
    "creditum_hermes_telegram/adapter.py",
    "creditum_hermes_telegram/compat.py",
    "creditum_hermes_telegram/ingress.py",
    "creditum_hermes_telegram/planning.py",
    "creditum_hermes_telegram/telemetry.py",
    "plugin.yaml",
)

ALGORITMO_INVENTARIO = "creditum_hermes_runtime_inventory/v1"

#: Prefixos de caminho que a implantação governada usa. O manifesto revisado na
#: a4-r6i carregava `/private/tmp/claude-501/…/scratchpad/…` porque veio dos
#: argumentos de quem o montou: válido contra aqueles bytes, irreprodutível em
#: qualquer outra máquina. Caminho de estação de trabalho não é autoridade.
PREFIXOS_GOVERNADOS = ("/data/", "/opt/")

#: Referências móveis. Uma tag pode mover; um dígito não.
REFERENCIAS_MOVEIS = ("latest", "main", "master", "HEAD")

#: O `FROM` que traz a ferramenta de build.
ESTAGIO_DO_UV = "AS ferramenta_uv"

#: O ENTRYPOINT instalado na imagem. A cadeia de autoridade só fecha quando ele
#: carrega o SHA da a6 que ESTE selo acabou de recomputar.
ENVELOPE_INSTALADO = "/opt/creditum/prestart-gate.sh"
SENTINELA_DO_ENVELOPE = "__PREENCHER_NO_ARTEFATO__"
MONTADOR = "deploy/vps/assemble-plugin-artifact.py"
CONSTRUTOR_A6 = "scripts/build-telegram-plugin-manifest.py"
INVENTARIO = "deploy/vps/runtime-inventory.py"


def _modulo(nome: str, caminho: pathlib.Path):
    """Carrega um script governado como módulo, sem instalá-lo em lugar nenhum."""
    spec = importlib.util.spec_from_file_location(nome, caminho)
    if spec is None or spec.loader is None:
        raise FileNotFoundError(caminho)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


def reproduz_artefato(raiz: pathlib.Path, destino: pathlib.Path) -> dict[str, str]:
    """Remonta o artefato a partir das fontes governadas e devolve rel → sha256."""
    montador = _modulo("_a8_montador", raiz / MONTADOR)
    if montador.main(["--out", str(destino)]) != 0:
        raise RuntimeError("montador recusou")
    achados: dict[str, str] = {}
    for arquivo in sorted(destino.rglob("*")):
        if arquivo.is_file():
            rel = str(arquivo.relative_to(destino)).replace("\\", "/")
            achados[rel] = sha256(arquivo)
    return achados


def reproduz_manifesto_a6(raiz: pathlib.Path, arvore: pathlib.Path,
                          entradas: dict, saida: pathlib.Path) -> str:
    """Reconstrói o manifesto da a6 com as ENTRADAS GOVERNADAS e devolve seu SHA."""
    construtor = _modulo("_a8_construtor_a6", raiz / CONSTRUTOR_A6)
    argv = [
        "--plugin-tree", str(arvore),
        "--source-commit", entradas["source_commit"],
        "--plugin-root", entradas["plugin_root"],
        "--plugin-version", entradas["plugin_version"],
        "--artifact-version", entradas["artifact_version"],
        "--config-path", entradas["config_path"],
        "--config-enabled-list-path", entradas["config_enabled_list_path"],
        "--out", str(saida),
    ]
    for caminho in entradas["precedence_paths"]:
        argv += ["--precedence-path", caminho]
    if construtor.main(argv) != 0:
        raise RuntimeError("construtor do manifesto da a6 recusou")
    return sha256(saida)


def sha256(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def carrega() -> dict:
    with open(MANIFESTO, "rb") as fh:
        return json.load(fh)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--seal", action="store_true")
    g.add_argument("--check", action="store_true")
    p.add_argument("--installed-entrypoint", default=None,
                   help="o ENTRYPOINT instalado na imagem. Obrigatório no --check: "
                        "sem ele a autoridade da a6 não é ligada ao caminho "
                        "executável, e foi exatamente esse o defeito da a8-r4g.")
    p.add_argument("--runtime-root", default=None,
                   help="raiz da árvore de fonte do Hermes, DENTRO do runtime a "
                        "descrever. Obrigatória no --check: sem ela o inventário "
                        "não é observável e o resultado é recusa.")
    a = p.parse_args(argv)

    raiz = AQUI.parent.parent
    doc = carrega()

    if a.seal:
        for nome, rel in GOVERNADOS.items():
            alvo = raiz / rel
            if not alvo.is_file():
                print(f"governado ausente: {rel}", file=sys.stderr)
                return 2
            doc["governed_artifact_hashes"][nome] = sha256(alvo)

        # O artefato e o manifesto da a6 são REPRODUZIDOS para serem selados. Selar
        # números que alguém digitou seria o defeito que este arquivo existe para
        # não cometer.
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="a8r4-seal-"))
        try:
            arvore = tmp / "creditum-telegram-governed"
            arquivos = reproduz_artefato(raiz, arvore)
            sha_a6 = reproduz_manifesto_a6(
                raiz, arvore, doc["plugin_artifact"]["a6_manifest_inputs"],
                tmp / "MANIFEST.json")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        doc["plugin_artifact"]["file_count"] = len(arquivos)
        doc["plugin_artifact"]["files"] = arquivos
        doc["plugin_artifact"]["a6_manifest_sha256"] = sha_a6

        with open(MANIFESTO, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print(f"{MANIFESTO.name} selado · {len(GOVERNADOS)} hashes governados · "
              f"{len(arquivos)} arquivos de plugin · manifesto a6 {sha_a6[:16]}…")
        inv_selado = doc["hermes_source"].get("runtime_inventory_sha256")
        # O inventário NÃO é escrito aqui. Ele só é observável de dentro do runtime
        # que descreve, e adotá-lo foi decisão de fase, não efeito de `--seal`.
        print("  runtime_inventory_sha256  "
              + (f"{inv_selado[:16]}… (declarado; confira com --check --runtime-root)"
                 if inv_selado else "NULO — ver a nota no manifesto."))
        return 0

    # ─── --check ─────────────────────────────────────────────────────────────
    recusas: list[str] = []
    fonte = doc["hermes_source"]

    commit = fonte.get("commit")
    if type(commit) is not str or len(commit) != 40 or not all(
            c in "0123456789abcdef" for c in commit):
        recusas.append("hermes_source.commit não é SHA-1 completo de 40 hex")
    for proibido in fonte["branch_authority_forbidden"]:
        if commit == proibido:
            recusas.append(f"commit é autoridade móvel: {proibido}")

    if fonte.get("lock_sha256") is None:
        recusas.append("hermes_source.lock_sha256 nulo — cadeia de suprimento não selada")
    elif not (type(fonte["lock_sha256"]) is str and len(fonte["lock_sha256"]) == 64
              and all(c in "0123456789abcdef" for c in fonte["lock_sha256"])):
        recusas.append("hermes_source.lock_sha256 não é SHA-256 de 64 hex")

    # ─── inventário do runtime: OBSERVA, depois compara ─────────────────────
    #
    # O algoritmo existe desde a a8-r4 e tem nome. O que ele não pode é ser
    # observado daqui: as versões instaladas vêm do interpretador em execução, e
    # este é o do desenvolvimento. Por isso a raiz é obrigatória — e sem ela a
    # resposta é recusa, não "não deu para conferir".
    esperado_inv = fonte.get("runtime_inventory_sha256")
    if fonte.get("runtime_inventory_algorithm") != ALGORITMO_INVENTARIO:
        recusas.append("hermes_source.runtime_inventory_algorithm não é "
                       f"{ALGORITMO_INVENTARIO}")
    if a.runtime_root is None:
        recusas.append("--runtime-root ausente — o inventário não foi observado; "
                       "presença de campo não é autoridade")
    else:
        try:
            inv = _modulo("_a8_inventario", raiz / INVENTARIO)
            campos = inv.observa(pathlib.Path(a.runtime_root))
            observado_inv = inv.digest(campos)
            print(f"  inventário       {observado_inv}")
            # Os FATOS conferem com o que o manifesto declara?
            declarado = dict(doc["critical_packages"])
            declarado["openai"] = doc["runtime_versions"]["openai"]
            for bruto, versao in sorted(declarado.items()):
                chave = f"package.{inv.normaliza_pacote(bruto)}"
                if campos.get(chave) != versao:
                    recusas.append(f"{chave} observado {campos.get(chave)!r} != "
                                   f"declarado {versao!r}")
            for chave, valor in (
                    ("python.version", doc["runtime_versions"]["python"]),
                    ("hermes.version", doc["runtime_versions"]["hermes_agent"]),
                    ("hermes.source_commit", commit),
                    ("hermes.lock_sha256", fonte.get("lock_sha256"))):
                if campos.get(chave) != valor:
                    recusas.append(f"{chave} observado {campos.get(chave)!r} != "
                                   f"declarado {valor!r}")
            if esperado_inv is None:
                recusas.append("hermes_source.runtime_inventory_sha256 nulo — "
                               f"observado {observado_inv[:16]}…; adotar exige "
                               "decisão explícita, não escrita automática")
            elif observado_inv != esperado_inv:
                recusas.append("runtime_inventory_sha256 divergente: observado "
                               f"{observado_inv[:16]}… != selado {esperado_inv[:16]}…")
        except Exception as causa:  # noqa: BLE001 — observar falhou: recusa.
            recusas.append(f"inventário não observável: {type(causa).__name__}: {causa}")

    for nome, valor in doc["governed_artifact_hashes"].items():
        if nome == "note":
            continue
        if valor is None:
            recusas.append(f"governed_artifact_hashes.{nome} nulo — rode --seal")
            continue
        alvo = raiz / GOVERNADOS[nome]
        if not alvo.is_file():
            recusas.append(f"{nome}: arquivo governado ausente")
        elif sha256(alvo) != valor:
            recusas.append(f"{nome}: hash divergente do selado")

    # ─── artefato de plugin e manifesto da a6: REPRODUZ, depois compara ─────
    art = doc.get("plugin_artifact") or {}
    if not art:
        recusas.append("plugin_artifact ausente — artefato não governado")
    else:
        # As ENTRADAS antes do produto: um caminho de estação de trabalho aqui
        # produz um manifesto que só existe naquela máquina, e nada avisa —
        # o construtor registra o caminho sem nunca abri-lo.
        entradas = art.get("a6_manifest_inputs") or {}
        caminhos = [entradas.get("config_path"), entradas.get("plugin_root"),
                    *(entradas.get("precedence_paths") or [])]
        for caminho in caminhos:
            if not isinstance(caminho, str) or not caminho.startswith(PREFIXOS_GOVERNADOS):
                recusas.append(f"a6_manifest_inputs: caminho não governado {caminho!r}")
        # `source_commit` é o checkpoint CONGELADO da a4, não o commit que contém
        # este manifesto. Apontá-lo para si mesmo seria proveniência circular.
        sc = entradas.get("source_commit")
        if not (isinstance(sc, str) and len(sc) == 40
                and all(c in "0123456789abcdef" for c in sc)):
            recusas.append("a6_manifest_inputs.source_commit não é SHA-1 de 40 hex")
        elif sc.endswith("0" * 12):
            recusas.append("a6_manifest_inputs.source_commit parece preenchido com zeros")
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="a8r4-check-"))
        try:
            arvore = tmp / "creditum-telegram-governed"
            arquivos = reproduz_artefato(raiz, arvore)
            faltando = set(ARTEFATO_ESPERADO) - set(arquivos)
            sobrando = set(arquivos) - set(ARTEFATO_ESPERADO)
            for rel in sorted(faltando):
                recusas.append(f"artefato: arquivo esperado ausente {rel}")
            for rel in sorted(sobrando):
                recusas.append(f"artefato: arquivo inesperado {rel}")
            selados = art.get("files") or {}
            if not selados:
                recusas.append("plugin_artifact.files vazio — rode --seal")
            for rel, sha in sorted(arquivos.items()):
                if selados.get(rel) != sha:
                    recusas.append(f"artefato: {rel} {sha[:16]}… != selado "
                                   f"{str(selados.get(rel))[:16]}…")
            if art.get("file_count") != len(arquivos):
                recusas.append(f"plugin_artifact.file_count != {len(arquivos)}")
            sha_a6 = reproduz_manifesto_a6(
                raiz, arvore, art["a6_manifest_inputs"], tmp / "MANIFEST.json")
            print(f"  manifesto a6     {sha_a6}")
            if art.get("a6_manifest_sha256") is None:
                recusas.append("plugin_artifact.a6_manifest_sha256 nulo — rode --seal")
            elif sha_a6 != art["a6_manifest_sha256"]:
                recusas.append(f"manifesto a6 reproduzido {sha_a6[:16]}… != selado "
                               f"{str(art['a6_manifest_sha256'])[:16]}…")

            # ─── o último elo: o ENTRYPOINT que de fato executa ─────────────
            #
            # fonte → artefato → manifesto → SHA → envelope instalado → ENTRYPOINT.
            # Sem este elo o selo dava PASS sobre uma autoridade que o arranque
            # normal nunca consultava, porque o envelope instalado era o template
            # cru e recusava antes com `exit 3`.
            if a.installed_entrypoint is None:
                recusas.append("--installed-entrypoint ausente — a autoridade da a6 "
                               "não foi ligada ao caminho executável")
            else:
                envelope = pathlib.Path(a.installed_entrypoint)
                if not envelope.is_file():
                    recusas.append(f"ENTRYPOINT instalado ausente: {envelope}")
                else:
                    texto = envelope.read_text(encoding="utf-8")
                    achado = re.search(r'^MANIFESTO_SHA="([0-9a-f]{64})"$', texto,
                                       re.MULTILINE)
                    ligado = achado.group(1) if achado else None
                    print(f"  entrypoint a6    {ligado}")
                    if ligado is None:
                        recusas.append("ENTRYPOINT instalado sem SHA de 64 hex")
                    elif ligado != sha_a6:
                        recusas.append(f"ENTRYPOINT ligado a {ligado[:16]}… != "
                                       f"manifesto recomputado {sha_a6[:16]}…")
                    if f'MANIFESTO_SHA="{SENTINELA_DO_ENVELOPE}"' in texto:
                        recusas.append("ENTRYPOINT instalado é o template cru")
                    if f'= "{SENTINELA_DO_ENVELOPE}" ]' not in texto:
                        recusas.append("o guarda do envelope instalado sumiu")
        except Exception as causa:  # noqa: BLE001 — reproduzir falhou: recusa.
            recusas.append(f"artefato não reproduzível: {type(causa).__name__}: {causa}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ─── ferramenta de build: o Dockerfile consome o dígito GOVERNADO ───────
    #
    # Presença do campo não basta, como sempre: o que vale é o Dockerfile
    # apontar para o mesmo dígito. Declarar um e construir com outro seria o
    # mesmo desalinhamento que a r6i fechou no `connect`.
    ferramenta = doc.get("build_toolchain") or {}
    if not ferramenta:
        recusas.append("build_toolchain ausente — ferramenta de build não governada")
    else:
        digesto = ferramenta.get("uv_image_digest")
        if not (isinstance(digesto, str) and digesto.startswith("sha256:")
                and len(digesto) == 71
                and all(c in "0123456789abcdef" for c in digesto[7:])):
            recusas.append("build_toolchain.uv_image_digest não é sha256:<64 hex>")
        if ferramenta.get("build_arg") is not None:
            recusas.append("build_toolchain.build_arg não é nulo — a ferramenta "
                           "voltou a ser escolha de quem chama")
        dockerfile = (raiz / GOVERNADOS["Dockerfile"]).read_text(encoding="utf-8")
        linhas_do_uv = [l for l in dockerfile.splitlines()
                        if l.startswith("FROM") and ESTAGIO_DO_UV in l]
        if len(linhas_do_uv) != 1:
            recusas.append(f"Dockerfile: {len(linhas_do_uv)} estágios de ferramenta "
                           "de build; esperado exatamente 1")
        else:
            linha = linhas_do_uv[0]
            if digesto and f"@{digesto}" not in linha:
                recusas.append("Dockerfile: o estágio do uv não usa o dígito governado")
            if "${" in linha or "$UV" in linha:
                recusas.append("Dockerfile: o estágio do uv aceita argumento de build")
            for movel in REFERENCIAS_MOVEIS:
                if f":{movel}" in linha:
                    recusas.append(f"Dockerfile: referência móvel :{movel} no uv")
        # Só DIRETIVA conta. A prosa deste arquivo explica o que saiu, e um
        # guarda que confunde comentário com diretiva grita à toa — e guarda que
        # grita à toa é desligado.
        if any(l.strip().startswith("ARG UV_VERSION")
               for l in dockerfile.splitlines()):
            recusas.append("Dockerfile: ARG UV_VERSION ressurgiu")
        # ─── base do Python: por digito, e nada de ARG ──────────────────────
        #
        # `3.13.15-slim-bookworm` e reconstruida a cada correcao do Debian: a tag
        # fixa a versao, nao os bytes. Duas builds da mesma tag nao sao a mesma
        # imagem, e um build que existe para ser reprodutivel nao pode depender
        # disso.
        base = ferramenta.get("python_base_digest")
        if not (isinstance(base, str) and base.startswith("sha256:")
                and len(base) == 71
                and all(c in "0123456789abcdef" for c in base[7:])):
            recusas.append("build_toolchain.python_base_digest nao e sha256:<64 hex>")
        if ferramenta.get("python_base_build_arg") is not None:
            recusas.append("build_toolchain.python_base_build_arg nao e nulo — a base "
                           "voltou a ser escolha de quem chama")
        froms = [l for l in dockerfile.splitlines() if l.startswith("FROM")]
        de_python = [l for l in froms if l.startswith("FROM python")]
        # A a8-r4g acrescentou o estagio `envelope`, que tambem parte da base
        # governada. O invariante nunca foi a CONTAGEM — e que todo estagio de
        # base use o mesmo digito. Fixar o numero so obrigaria a mexer no guarda
        # a cada estagio novo, e guarda que se mexe por rotina para de guardar.
        if len(de_python) < 2:
            recusas.append(f"Dockerfile: {len(de_python)} estagios de base do "
                           "Python; esperado ao menos 2 (fonte e runtime)")
        for linha in de_python:
            if base and f"@{base}" not in linha:
                recusas.append("Dockerfile: estagio de base sem o digito governado")
            if "${" in linha:
                recusas.append("Dockerfile: estagio de base aceita argumento de build")
            for movel in REFERENCIAS_MOVEIS:
                if f":{movel}" in linha:
                    recusas.append(f"Dockerfile: referencia movel :{movel} na base")
        # Nenhum FROM pode escapar do modelo: ou digito, ou recusa.
        for linha in froms:
            if "@sha256:" not in linha:
                recusas.append(f"Dockerfile: FROM sem digito — {linha[:60]}")
        if any(l.strip().startswith("ARG PYTHON_BASE=") for l in dockerfile.splitlines()):
            recusas.append("Dockerfile: ARG PYTHON_BASE ressurgiu")

        compose = (raiz / GOVERNADOS["compose.yaml"]).read_text(encoding="utf-8")
        for linha in compose.splitlines():
            if "UV_VERSION:" in linha and not linha.lstrip().startswith("#"):
                recusas.append("compose.yaml: UV_VERSION voltou como argumento de build")

    for chave, esperado in (("hermes_agent", "0.20.4"), ("python", "3.13.15"),
                            ("openai", "2.24.0")):
        if doc["runtime_versions"].get(chave) != esperado:
            recusas.append(f"runtime_versions.{chave} != {esperado}")

    if doc.get("contains_secrets") is not False:
        recusas.append("contains_secrets tem de ser false")

    print(f"=== {doc['manifest_id']} ===")
    print(f"  commit           {commit}")
    print(f"  hermes           {doc['runtime_versions']['hermes_agent']}")
    print(f"  python           {doc['runtime_versions']['python']}")
    print(f"  algoritmo inv.   {fonte.get('runtime_inventory_algorithm')}")
    if not recusas:
        print("\n  SELADO — o build pode conferir contra este manifesto.")
        return 0
    print()
    for r in recusas:
        print(f"  RECUSA   {r}")
    print(f"\n  {len(recusas)} recusa(s). O BUILD NÃO DEVE PROSSEGUIR.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
