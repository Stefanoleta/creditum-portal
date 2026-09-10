#!/usr/bin/env python3
"""
D2E-A8-R4F — a evidência DENTRO da imagem final. Somente leitura.

    /opt/venv/bin/python -B deploy/vps/verify-final-image.py \
        --runtime-root /opt/hermes-agent --manifest /opt/creditum/runtime-manifest.json

Roda dentro do contêiner, com `--network none` e com o `ENTRYPOINT` sobreposto.
Não sobe gateway, não fala com o Telegram, não chama provedor, não escreve nada.

─── Por que isto é um arquivo do repositório, e não YAML ─────────────────────

A primeira versão destes testes vivia embutida no workflow, como programa dentro
de string dentro de YAML. Três problemas, e nenhum deles é estético:

  1. YAML quebrou — indentação de bloco escalar contra indentação de Python;
  2. bytes que só existem no CI não são revisáveis nem testáveis localmente, e a
     a8 passou rodadas inteiras estabelecendo que entrada de build tem de ser
     fonte governada;
  3. a lógica de evidência é exatamente o tipo de coisa que precisa de teste — e
     não se testa um trecho de YAML.

Então a evidência é código governado, e o workflow só a executa.

─── O que ela NÃO faz ────────────────────────────────────────────────────────

Não recomputa o inventário nem o selo: esses já têm suas próprias ferramentas
governadas (`runtime-inventory.py`, `seal-runtime-manifest.py`), e reimplementá-los
aqui criaria uma segunda verdade sobre a mesma coisa — o defeito que a a6 passou
quatro rodadas fechando.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

MARCADOR = ".hermes_build_sha"

#: O ENTRYPOINT que a imagem instala. A a8-r4g existe porque ele era o template
#: CRU, com o sentinela, e recusava com `exit 3` em todo arranque normal — e
#: nenhuma evidência via, porque toda execução de CI sobrepunha o ENTRYPOINT.
ENVELOPE = "/opt/creditum/prestart-gate.sh"
SENTINELA = "__PREENCHER_NO_ARTEFATO__"
import re as _re  # noqa: E402 — usado só na leitura da atribuição
ATRIBUICAO = _re.compile(r'^MANIFESTO_SHA="([0-9a-f]{64})"$', _re.MULTILINE)


class Divergencia(Exception):
    """Um fato observado que não é o esperado."""


def sha256(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def forma_do_sistema_de_arquivos(raiz: pathlib.Path, venv: pathlib.Path,
                                 fatos: dict, ruins: list) -> None:
    """A forma do estágio final: marcador presente, `.git` e `.venv` ausentes."""
    fatos["git_ausente"] = not (raiz / ".git").exists()
    if not fatos["git_ausente"]:
        ruins.append(".git presente na imagem final")

    fatos["venv_do_projeto_ausente"] = not (raiz / ".venv").exists()
    if not fatos["venv_do_projeto_ausente"]:
        ruins.append(".venv do projeto presente — o ambiente autoritativo é o outro")

    marcador = raiz / MARCADOR
    fatos["marcador_presente"] = marcador.is_file()
    if not fatos["marcador_presente"]:
        ruins.append(f"{MARCADOR} ausente")
        return
    bruto = marcador.read_bytes()
    fatos["marcador_bytes"] = len(bruto)
    fatos["marcador_valor"] = bruto[:40].decode("ascii", "replace")
    # 40 hex minúsculos e UMA quebra. O mesmo formato que o produtor escreve.
    fatos["marcador_forma_valida"] = (
        len(bruto) == 41 and bruto.endswith(b"\n")
        and all(c in b"0123456789abcdef" for c in bruto[:40]))
    if not fatos["marcador_forma_valida"]:
        ruins.append(f"{MARCADOR} fora da forma (40 hex + 1 LF)")

    for nome in ("python", "hermes"):
        alvo = venv / "bin" / nome
        chave = f"venv_tem_{nome}"
        fatos[chave] = alvo.is_file()
        if not fatos[chave]:
            ruins.append(f"{alvo} ausente")


def envelope_instalado(caminho: pathlib.Path, a6_governado: str,
                       fatos: dict, ruins: list) -> None:
    """
    O ENTRYPOINT instalado carrega a autoridade da a6, e o guarda continua lá.

    Duas coisas distintas, e a distinção importa: o TEMPLATE do repositório tem
    de conter o sentinela (é envelope reutilizável); o INSTALADO tem de conter o
    SHA concreto. Exigir que os dois tenham o mesmo hash de arquivo seria exigir
    que a ligação não tivesse acontecido.
    """
    fatos["envelope_presente"] = caminho.is_file()
    if not fatos["envelope_presente"]:
        ruins.append(f"{caminho} ausente — não há ENTRYPOINT instalado")
        return
    texto = caminho.read_text(encoding="utf-8")

    achado = ATRIBUICAO.search(texto)
    fatos["envelope_sha_embutido"] = achado.group(1) if achado else None
    if achado is None:
        ruins.append("o ENTRYPOINT instalado não atribui um SHA de 64 hex")
    elif achado.group(1) != a6_governado:
        ruins.append(f"ENTRYPOINT ligado a {achado.group(1)[:16]}… != a6 governado "
                     f"{a6_governado[:16]}…")

    # A ATRIBUIÇÃO não pode ter sobrado com o sentinela; a COMPARAÇÃO tem de ter.
    fatos["envelope_atribuicao_com_sentinela"] = (
        f'MANIFESTO_SHA="{SENTINELA}"' in texto)
    if fatos["envelope_atribuicao_com_sentinela"]:
        ruins.append("o ENTRYPOINT instalado ainda é o template cru")
    fatos["envelope_guarda_presente"] = (
        f'= "{SENTINELA}" ]' in texto)
    if not fatos["envelope_guarda_presente"]:
        ruins.append("o guarda do envelope foi destruído pela ligação")
    fatos["envelope_executavel"] = caminho.stat().st_mode & 0o111 != 0
    if not fatos["envelope_executavel"]:
        ruins.append(f"{caminho} não é executável")


def versoes(esperado: dict, fatos: dict, ruins: list) -> None:
    """As versões INSTALADAS no interpretador que está executando isto."""
    from importlib import metadata  # noqa: PLC0415

    observadas: dict[str, str] = {}
    for nome, alvo in sorted(esperado.items()):
        try:
            visto = metadata.version(nome)
        except metadata.PackageNotFoundError:
            observadas[nome] = None
            ruins.append(f"{nome}: AUSENTE, esperado {alvo}")
            continue
        observadas[nome] = visto
        if visto != alvo:
            ruins.append(f"{nome}: {visto} != {alvo}")
    fatos["pacotes"] = observadas


def rede_esta_desligada() -> tuple[bool, str]:
    """
    A prova de que nada aqui poderia falar com o Telegram — lida do KERNEL.

    A primeira versão disto resolvia um nome (`getaddrinfo`) e concluía "sem rede"
    quando falhava. Duas coisas erradas:

      1. importava `socket` num diretório cujo invariante governado é "nenhum
         script aqui contata Telegram nem sobe gateway" — e o teste da a8-r1
         acusou, com razão. Um import de `socket` está a uma linha de uma
         conexão, e guarda de G3 não se negocia;

      2. resolução que falha também falha por DNS quebrado. Provava menos do que
         parecia.

    Ler `/sys/class/net` é mais forte e não toca em rede nenhuma: um contêiner com
    `--network none` tem SÓ `lo`. Se houver qualquer outra interface, há rede — e
    a evidência não está rodando isolada.
    """
    interfaces = pathlib.Path("/sys/class/net")
    if interfaces.is_dir():
        nomes = sorted(i.name for i in interfaces.iterdir())
        return nomes == ["lo"], ",".join(nomes)
    # Sem `/sys` (fora do Linux) não há como afirmar isolamento. Falha fechada.
    return False, "sem /sys/class/net"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="evidência dentro da imagem final")
    p.add_argument("--runtime-root", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--venv", default="/opt/venv")
    p.add_argument("--envelope", default=ENVELOPE)
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)

    raiz = pathlib.Path(a.runtime_root)
    venv = pathlib.Path(a.venv)
    doc = json.loads(pathlib.Path(a.manifest).read_text(encoding="utf-8"))
    fonte, versoes_gov = doc["hermes_source"], doc["runtime_versions"]

    fatos: dict = {}
    ruins: list[str] = []

    forma_do_sistema_de_arquivos(raiz, venv, fatos, ruins)

    fatos["python"] = ".".join(map(str, sys.version_info[:3]))
    fatos["python_implementation"] = sys.implementation.name
    fatos["python_prefix"] = sys.prefix
    if fatos["python"] != versoes_gov["python"]:
        ruins.append(f"python: {fatos['python']} != {versoes_gov['python']}")
    if fatos["python_implementation"] != "cpython":
        ruins.append(f"implementação: {fatos['python_implementation']} != cpython")
    if fatos["python_prefix"] != str(venv):
        ruins.append(f"prefix: {fatos['python_prefix']} != {venv}")

    esperado = dict(doc["critical_packages"])
    esperado["openai"] = versoes_gov["openai"]
    esperado["hermes-agent"] = versoes_gov["hermes_agent"]
    versoes(esperado, fatos, ruins)

    lock = raiz / "uv.lock"
    fatos["uv_lock_presente"] = lock.is_file()
    if not fatos["uv_lock_presente"]:
        ruins.append("uv.lock ausente")
    else:
        fatos["uv_lock_sha256"] = sha256(lock)
        if fatos["uv_lock_sha256"] != fonte["lock_sha256"]:
            ruins.append("uv.lock divergente do governado")

    if fatos.get("marcador_forma_valida"):
        if fatos["marcador_valor"] != fonte["commit"]:
            ruins.append("marcador != commit governado")

    envelope_instalado(pathlib.Path(a.envelope),
                       doc["plugin_artifact"]["a6_manifest_sha256"], fatos, ruins)

    fatos["rede_desligada"], fatos["interfaces"] = rede_esta_desligada()
    if not fatos["rede_desligada"]:
        ruins.append(f"há rede (interfaces: {fatos['interfaces']}): a evidência "
                     "tem de rodar com --network none")

    fatos["gateway_started"] = False
    fatos["telegram_contact"] = 0
    fatos["model_calls"] = 0

    if a.json:
        print(json.dumps({"facts": fatos, "divergences": ruins},
                         indent=2, ensure_ascii=False, sort_keys=True))
    else:
        print("=== evidência da imagem final ===")
        for chave in ("git_ausente", "venv_do_projeto_ausente", "marcador_presente",
                      "marcador_bytes", "marcador_valor", "marcador_forma_valida",
                      "venv_tem_python", "venv_tem_hermes", "envelope_presente",
                      "envelope_sha_embutido", "envelope_atribuicao_com_sentinela",
                      "envelope_guarda_presente", "envelope_executavel", "python",
                      "python_implementation", "python_prefix", "uv_lock_sha256",
                      "rede_desligada", "interfaces"):
            if chave in fatos:
                print(f"  {chave:26} {fatos[chave]}")
        for nome, visto in sorted((fatos.get("pacotes") or {}).items()):
            print(f"  {nome:26} {visto}")
    if ruins:
        print("\nEVIDENCIA_FALHOU", file=sys.stderr)
        for r in ruins:
            print(f"  {r}", file=sys.stderr)
        return 2
    print("\n  EVIDENCIA DA IMAGEM FINAL: CONFIRMADA")
    return 0


if __name__ == "__main__":
    sys.exit(main())
