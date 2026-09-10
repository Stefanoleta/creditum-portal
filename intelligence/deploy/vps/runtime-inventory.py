#!/usr/bin/env python3
"""
D2E-A8-R4 §1–§3 — o INVENTÁRIO GOVERNADO do runtime executável aprovado.

    python3 -B deploy/vps/runtime-inventory.py --hermes-root /opt/hermes-agent
    python3 -B deploy/vps/runtime-inventory.py --hermes-root <árvore> --json

Roda DENTRO do runtime que descreve: as versões dos pacotes vêm de
`importlib.metadata` do interpretador em execução, não de um arquivo que alguém
escreveu. Rodar isto na máquina de desenvolvimento descreveria a máquina de
desenvolvimento — e por isso o `--check` do selador exige a raiz explícita.

─── O que o inventário certifica, e por que só isso ──────────────────────────

O manifesto de construção já fixa a CADEIA DE SUPRIMENTO: o commit oficial e o
dígito do `uv.lock`. O que faltava era a outra ponta: o que de fato ficou
INSTALADO depois de resolver aquele lock com aquele interpretador.

São coisas diferentes. O lock diz o que foi pedido; o inventário diz o que
respondeu. Um lock íntegro com um interpretador diferente produz outro runtime,
e nenhum dos dois valores sozinho percebe isso.

Os campos:

    python.implementation   cpython — outra implementação é outro runtime
    python.version          3.13.15 — a AST, o GC e o asyncio mudam entre minors
    hermes.distribution     hermes-agent
    hermes.version          0.20.4
    hermes.source_commit    revisão oficial de onde o código veio
    hermes.lock_sha256      o lock imutável daquela revisão
    package.<nome>          versão instalada de cada pacote governado

E nada além disso. Hashear a árvore inteira do runtime seria mais forte e
inútil: `__pycache__`, `.dist-info/RECORD` e caminhos absolutos entram no
dígito, o valor muda a cada instalação legítima, e um guarda que grita a cada
build é desligado. O inventário é MÍNIMO por decisão, não por preguiça — ele
identifica o runtime aprovado, não o disco.

─── Por que os pacotes são um conjunto FIXO no código ────────────────────────

`PACOTES_GOVERNADOS` é uma constante deste módulo. Não vem do manifesto, não vem
de argumento, não vem do ambiente. Se o conjunto viesse do manifesto, quem
mudasse o manifesto mudaria junto o que o inventário mede — e a conferência
viraria tautologia, o mesmo defeito que a a6 fechou no `plugin.yaml`.

O manifesto DECLARA versões esperadas; este módulo OBSERVA as instaladas; o
selador compara. Três papéis, três lugares.

─── Determinismo ─────────────────────────────────────────────────────────────

Sem relógio, sem caminho de máquina, sem rede, sem ordem de dicionário: os
campos saem numa ordem fixa, os pacotes em ordem de nome normalizado (PEP 503),
o texto é UTF-8 com `\\n` e termina em `\\n`. O dígito é o SHA-256 desses bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys

#: A identidade do algoritmo entra no texto canônico. Mudar o algoritmo sem mudar
#: este identificador faria dois dígitos incomparáveis parecerem comparáveis.
ALGORITMO = "creditum_hermes_runtime_inventory/v1"

#: A distribuição que carrega o Hermes. Medida na 0.20.4 genuína.
DISTRIBUICAO_HERMES = "hermes-agent"

#: Os pacotes cuja versão muda o comportamento do runtime governado. Conjunto
#: FECHADO e fixado aqui — ver o cabeçalho.
PACOTES_GOVERNADOS = (
    "aiohttp",
    "fastapi",
    "httpx",
    "openai",
    "pydantic",
    "python-telegram-bot",
    "PyYAML",
    "uvicorn",
)

#: A evidência do commit no runtime IMPLANTÁVEL. O build verifica o checkout,
#: persiste o commit conferido aqui e APAGA o `.git` antes de copiar a árvore
#: para o estágio final. Então `.git` não existe onde isto roda de verdade, e
#: exigi-lo fazia o inventário funcionar só na bancada de reconstrução.
MARCADOR_DO_BUILD = ".hermes_build_sha"

#: O formato EXATO que o Dockerfile produz:
#:
#:     printf '%s\n' "${HERMES_COMMIT}" > /opt/hermes-agent/.hermes_build_sha
#:
#: 40 hex minúsculos e UM `\n` terminal. 41 bytes, nada mais. Nada de `.strip()`
#: permissivo: um arquivo com espaço à esquerda, CRLF, segunda linha ou sem quebra
#: NÃO é o que o produtor escreve, e aceitar isso seria aceitar um arquivo que não
#: veio dele.
#: `\\Z`, não `$`: em Python `$` casa TAMBÉM logo antes de uma quebra final, e
#: `<commit>\\n\\n` passaria — um arquivo com linha a mais seria aceito como se
#: fosse o do produtor. Foi o teste de forma malformada que pegou isto.
FORMATO_DO_MARCADOR = re.compile(rb"^[0-9a-f]{40}\n\Z")

#: Um valor de campo é uma linha. Quebra de linha ou `=` quebrariam a leitura do
#: texto canônico, então valor que os contenha é recusa, não escape.
VALOR_ACEITO = re.compile(r"^[!-~][ -~]*$")


class InventarioRecusado(Exception):
    """Falha fechada: o inventário não pôde ser estabelecido."""

    def __init__(self, defeito: str, detalhe: str = "") -> None:
        super().__init__(f"{defeito}: {detalhe}" if detalhe else defeito)
        self.defeito = defeito
        self.detalhe = detalhe


def normaliza_pacote(nome: str) -> str:
    """PEP 503: minúsculas e qualquer corrida de `-_.` vira um único `-`."""
    return re.sub(r"[-_.]+", "-", nome).lower()


def sha256_de_arquivo(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def commit_do_marcador(raiz: pathlib.Path) -> str:
    """
    O commit lido do marcador de build. Esta é a evidência do runtime implantável.

    O produtor é uma linha só do Dockerfile, e a conferência aqui é do formato
    dele, byte a byte. `.strip()` genérico aceitaria `\r\n`, espaço em volta,
    linha extra e arquivo vazio-com-quebra — quatro coisas que o produtor nunca
    escreve. Um arquivo que não veio do produtor não é evidência do produtor.
    """
    marcador = raiz / MARCADOR_DO_BUILD
    if not marcador.is_file():
        raise InventarioRecusado("RUNTIME_BUILD_SHA_MISSING", MARCADOR_DO_BUILD)
    bruto = marcador.read_bytes()
    if not FORMATO_DO_MARCADOR.match(bruto):
        raise InventarioRecusado("RUNTIME_BUILD_SHA_MALFORMED",
                                 f"{len(bruto)} bytes")
    return bruto[:40].decode("ascii")


def commit_do_git(raiz: pathlib.Path) -> str | None:
    """
    O commit lido do `.git`, quando ele existe. CONFERÊNCIA CRUZADA, não autoridade.

    Devolve `None` quando não há `.git` — que é o caso normal no estágio final da
    imagem. Quando há, o valor tem de bater com o marcador: uma árvore de
    reconstrução cujo `.git` aponta para outro commit está mentindo em algum dos
    dois lugares, e não dá para saber qual.

    Sem subprocesso e sem rede.

    `git rev-parse` daria o mesmo valor e traria um binário externo para dentro
    de um algoritmo que precisa ser determinístico e auditável linha a linha.
    Aqui são três casos e nada mais: HEAD destacado, HEAD apontando para ref
    solto, e ref empacotado.
    """
    git = raiz / ".git"
    if not git.exists():
        return None
    if git.is_file():
        # Worktree: `.git` é um arquivo `gitdir: <caminho>`.
        texto = git.read_text(encoding="utf-8").strip()
        if not texto.startswith("gitdir:"):
            raise InventarioRecusado("RUNTIME_COMMIT_UNAVAILABLE", ".git ilegível")
        git = pathlib.Path(texto.split(":", 1)[1].strip())
        if not git.is_absolute():
            git = (raiz / git).resolve()
    if not git.is_dir():
        raise InventarioRecusado("RUNTIME_COMMIT_UNAVAILABLE", "gitdir inválido")
    cabeca = git / "HEAD"
    if not cabeca.is_file():
        raise InventarioRecusado("RUNTIME_COMMIT_UNAVAILABLE", "sem HEAD")
    conteudo = cabeca.read_text(encoding="utf-8").strip()
    if not conteudo.startswith("ref:"):
        return conteudo                                  # HEAD destacado
    ref = conteudo.split(":", 1)[1].strip()
    solto = git / ref
    if solto.is_file():
        return solto.read_text(encoding="utf-8").strip()
    empacotado = git / "packed-refs"
    if empacotado.is_file():
        for linha in empacotado.read_text(encoding="utf-8").splitlines():
            if linha.startswith("#") or linha.startswith("^") or not linha.strip():
                continue
            partes = linha.split()
            if len(partes) == 2 and partes[1] == ref:
                return partes[0]
    raise InventarioRecusado("RUNTIME_COMMIT_UNAVAILABLE", ref)


def versao_instalada(nome: str) -> str:
    """A versão do pacote NO INTERPRETADOR EM EXECUÇÃO."""
    import importlib.metadata as md  # noqa: PLC0415

    try:
        return md.version(nome)
    except md.PackageNotFoundError:
        raise InventarioRecusado("RUNTIME_PACKAGE_MISSING", nome) from None


def observa(raiz_hermes: pathlib.Path) -> dict[str, str]:
    """
    Os campos do inventário, OBSERVADOS. Nada é lido de manifesto.

    A ordem de inserção é a ordem canônica: os campos fixos primeiro, na ordem
    escrita aqui, e os pacotes depois, por nome normalizado.
    """
    raiz = pathlib.Path(raiz_hermes)
    if not raiz.is_dir():
        raise InventarioRecusado("RUNTIME_HERMES_ROOT_UNAVAILABLE", str(raiz))
    lock = raiz / "uv.lock"
    if not lock.is_file():
        raise InventarioRecusado("RUNTIME_LOCK_UNAVAILABLE", "uv.lock")

    # A autoridade é o marcador; o `.git`, quando existe, só confere.
    commit = commit_do_marcador(raiz)
    cruzado = commit_do_git(raiz)
    if cruzado is not None:
        if not re.fullmatch(r"[0-9a-f]{40}", cruzado):
            raise InventarioRecusado("RUNTIME_COMMIT_NOT_FULL_SHA", cruzado[:48])
        if cruzado != commit:
            raise InventarioRecusado(
                "RUNTIME_COMMIT_EVIDENCE_CONFLICT",
                f"marcador {commit[:12]}… != .git {cruzado[:12]}…")

    campos: dict[str, str] = {
        "python.implementation": sys.implementation.name,
        "python.version": "{}.{}.{}".format(*sys.version_info[:3]),
        "hermes.distribution": DISTRIBUICAO_HERMES,
        "hermes.version": versao_instalada(DISTRIBUICAO_HERMES),
        "hermes.source_commit": commit,
        "hermes.lock_sha256": sha256_de_arquivo(lock),
    }

    vistos: dict[str, str] = {}
    for bruto in PACOTES_GOVERNADOS:
        nome = normaliza_pacote(bruto)
        if nome in vistos:
            raise InventarioRecusado("RUNTIME_PACKAGE_AMBIGUOUS", nome)
        vistos[nome] = versao_instalada(bruto)
    for nome in sorted(vistos):
        campos[f"package.{nome}"] = vistos[nome]

    for chave, valor in campos.items():
        if not isinstance(valor, str) or not VALOR_ACEITO.match(valor) or "=" in valor:
            raise InventarioRecusado("RUNTIME_VALUE_NOT_CANONICAL", chave)
    return campos


def canoniza(campos: dict[str, str]) -> str:
    """`<algoritmo>\\n` seguido de uma linha `chave=valor` por campo, na ordem dada."""
    linhas = [ALGORITMO]
    linhas.extend(f"{chave}={valor}" for chave, valor in campos.items())
    return "\n".join(linhas) + "\n"


def digest(campos: dict[str, str]) -> str:
    return hashlib.sha256(canoniza(campos).encode("utf-8")).hexdigest()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="inventário governado do runtime")
    p.add_argument("--hermes-root", required=True,
                   help="raiz da árvore de fonte do Hermes (com .git e uv.lock)")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)

    try:
        campos = observa(pathlib.Path(a.hermes_root))
    except InventarioRecusado as recusa:
        print(f"RECUSA {recusa.defeito} {recusa.detalhe}".rstrip(), file=sys.stderr)
        return 2

    sha = digest(campos)
    if a.json:
        print(json.dumps({"algorithm": ALGORITMO, "fields": campos, "sha256": sha},
                         indent=2, ensure_ascii=False, sort_keys=False))
        return 0
    print(f"=== {ALGORITMO} ===")
    for chave, valor in campos.items():
        print(f"  {chave:<28} {valor}")
    print(f"\n  RUNTIME_INVENTORY_SHA256  {sha}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
