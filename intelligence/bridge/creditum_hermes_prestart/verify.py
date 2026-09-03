"""
O verificador pré-partida. SOMENTE LEITURA, rede zero, escrita zero.

    /opt/venv/bin/python3 -B -m creditum_hermes_prestart.verify \
        --manifest /data/creditum_hermes_runtime/telegram_plugin/MANIFEST.json

Sai 0 se a implantação governada do plugin é EXATAMENTE a aprovada. Sai != 0, com os
defeitos nomeados, em qualquer outra circunstância — inclusive quando não consegue
verificar. "Não pude conferir" e "está errado" levam ao mesmo lugar: o gateway não
sobe. Um portão que passa quando não sabe não é portão.

─── Puras e impuras, separadas de propósito ────────────────────────────────────

As funções `confere_*` são PURAS: recebem dado já lido e só RECUSAM. Nenhuma entrada
as faz conceder algo, e por isso podem ser chamadas direto pelos testes — a distinção
que a d2e-a4-r5 obrigou a nomear, depois de eu ter aberto um furo passando um
verificador de procedência por parâmetro. Quem lê disco é o verificador, e o que ele
lê não é escolhido pelo chamador: vem do manifesto aprovado.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import pathlib
import sys
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

MANIFEST_ID = "creditum_hermes_telegram_plugin_deployment/v1"

#: Campos que o manifesto DEVE trazer. Conjunto fechado: falta um, recusa.
CAMPOS_MANIFESTO = (
    "manifest_id", "artifact_version", "source_commit",
    "hermes_version_required", "plugin_root", "plugin_key", "plugin_kind",
    "plugin_version", "runtime_platform", "adapter_compat_id",
    "compat_module_relative_path", "closed_package", "config_path",
    "config_enabled_list_path", "precedence_paths_to_inspect", "plugin_files",
)

DEFEITOS = (
    "MANIFEST_MISSING", "MANIFEST_UNPARSEABLE", "MANIFEST_HASH_MISMATCH",
    "MANIFEST_ID_UNSUPPORTED", "MANIFEST_FIELD_MISSING", "MANIFEST_FILE_LIST_EMPTY",
    "PLUGIN_ROOT_NOT_ABSOLUTE", "PLUGIN_ROOT_MISSING", "PLUGIN_ROOT_NOT_DIRECTORY",
    "PLUGIN_ROOT_IS_SYMLINK", "PLUGIN_ROOT_NOT_CANONICAL",
    "PLUGIN_FILE_MISSING", "PLUGIN_FILE_IS_SYMLINK", "PLUGIN_FILE_HASH_MISMATCH",
    "PLUGIN_FILE_SIZE_MISMATCH", "PLUGIN_UNEXPECTED_FILE",
    "PLUGIN_YAML_NOT_DECLARED", "PLUGIN_INIT_NOT_DECLARED",
    "YAML_PARSER_UNAVAILABLE", "PLUGIN_YAML_UNPARSEABLE",
    "PLUGIN_KEY_UNEXPECTED", "PLUGIN_KIND_UNEXPECTED", "PLUGIN_VERSION_UNEXPECTED",
    "RUNTIME_PLATFORM_UNEXPECTED",
    "COMPAT_MODULE_UNREADABLE", "ADAPTER_COMPAT_ID_UNEXPECTED",
    "HERMES_VERSION_UNKNOWN", "HERMES_VERSION_UNSUPPORTED",
    "CONFIG_MISSING", "CONFIG_UNPARSEABLE", "CONFIG_ENABLED_LIST_ABSENT",
    "PLUGIN_NOT_ENABLED",
    "PRECEDENCE_SOURCES_UNDECLARED", "PRECEDENCE_OVERRIDE_PRESENT",
    "ENTRYPOINT_OVERRIDE_PRESENT", "DUPLICATE_PLUGIN_LOCATION",
)

#: Nomes de arquivo obrigatórios pelo contrato de plugin do Hermes 0.20.4 (a5).
CONTRATO_PLUGIN = ("plugin.yaml", "__init__.py")

#: FIXO, e não parâmetro de `verifica`. Deixar o chamador escolher onde procurar a
#: versão é deixá-lo escolher qual versão é encontrada — a lição que a d2e-a4-r5
#: custou uma rodada inteira. Aqui não há o que selecionar.
DISTRIBUICOES_DO_HERMES = ("hermes-agent", "hermes_agent", "hermes", "hermes-cli")


class PrestartRefusal(Exception):
    """Recusa nomeada. Nunca silenciosa, nunca 'aviso e segue'."""

    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect
        self.detail = detail


@dataclass
class Relatorio:
    """O que foi observado e o que reprovou. Sem segredo, por construção."""

    defeitos: list[tuple[str, str]] = field(default_factory=list)
    observado: dict[str, Any] = field(default_factory=dict)

    def recusa(self, defect: str, detail: str = "") -> None:
        self.defeitos.append((defect, detail))

    @property
    def aprovado(self) -> bool:
        return not self.defeitos


# ═════════════════════════════════════════════════════════════════════════════
# PURAS — dado entra, recusa sai. Nenhuma delas concede nada.
# ═════════════════════════════════════════════════════════════════════════════


def confere_identidade_do_manifesto(dados: Mapping[str, Any]) -> None:
    if dados.get("manifest_id") != MANIFEST_ID:
        raise PrestartRefusal("MANIFEST_ID_UNSUPPORTED", str(dados.get("manifest_id"))[:64])
    for campo in CAMPOS_MANIFESTO:
        if campo not in dados:
            raise PrestartRefusal("MANIFEST_FIELD_MISSING", campo)
    arquivos = dados["plugin_files"]
    if type(arquivos) is not list or not arquivos:
        raise PrestartRefusal("MANIFEST_FILE_LIST_EMPTY")
    declarados = {a.get("relative_path") for a in arquivos}
    for exigido, defeito in (("plugin.yaml", "PLUGIN_YAML_NOT_DECLARED"),
                             ("__init__.py", "PLUGIN_INIT_NOT_DECLARED")):
        if exigido not in declarados:
            raise PrestartRefusal(defeito, exigido)
    raiz = dados["plugin_root"]
    if type(raiz) is not str or not raiz.startswith("/"):
        raise PrestartRefusal("PLUGIN_ROOT_NOT_ABSOLUTE", str(raiz)[:80])


def confere_plugin_yaml(
    dados: Mapping[str, Any], *, chave: str, tipo: str, versao: str, plataforma: str
) -> None:
    """
    O `plugin.yaml` implantado diz o que o manifesto aprovado diz que ele diz?

    O hash já fixa os BYTES do arquivo. Esta conferência existe porque o manifesto e o
    yaml são escritos por mãos diferentes em momentos diferentes: eu poderia declarar
    `telegram-platform` no manifesto e ter deixado outra chave no yaml, e os dois
    estariam internamente coerentes. Coerência mútua não é acordo com o aprovado.
    """
    if dados.get("name") != chave and dados.get("key") != chave:
        raise PrestartRefusal("PLUGIN_KEY_UNEXPECTED",
                              str(dados.get("name") or dados.get("key"))[:64])
    if dados.get("kind") != tipo:
        raise PrestartRefusal("PLUGIN_KIND_UNEXPECTED", str(dados.get("kind"))[:64])
    if str(dados.get("version")) != versao:
        raise PrestartRefusal("PLUGIN_VERSION_UNEXPECTED", str(dados.get("version"))[:64])
    # A plataforma de runtime é o alvo do `register_platform`. Declarada no yaml para
    # ser verificável SEM importar o plugin — o gateway ainda não subiu.
    declarada = (dados.get("creditum") or {}).get("runtime_platform")
    if declarada != plataforma:
        raise PrestartRefusal("RUNTIME_PLATFORM_UNEXPECTED", str(declarada)[:64])


def confere_versao_do_hermes(lida: object, *, exigida: str) -> None:
    if lida is None:
        raise PrestartRefusal("HERMES_VERSION_UNKNOWN")
    if lida != exigida:
        raise PrestartRefusal("HERMES_VERSION_UNSUPPORTED", f"{lida} != {exigida}")


def confere_config(dados: Mapping[str, Any], *, chave: str, caminho_lista: str) -> None:
    """
    A configuração HABILITA o plugin governado?

    Presença do arquivo no disco não é habilitação. O Hermes só carrega o que está na
    lista, e um plugin perfeito não habilitado deixa o nativo assumir — exatamente o
    modo de falha que esta fase existe para fechar.
    """
    no = dados
    for parte in caminho_lista.split("."):
        if not isinstance(no, Mapping) or parte not in no:
            raise PrestartRefusal("CONFIG_ENABLED_LIST_ABSENT", caminho_lista)
        no = no[parte]
    if not isinstance(no, (list, tuple)):
        raise PrestartRefusal("CONFIG_ENABLED_LIST_ABSENT", f"{caminho_lista} não é lista")
    if chave not in no:
        raise PrestartRefusal("PLUGIN_NOT_ENABLED", chave)


def confere_precedencia(
    *, chave: str, nomes_de_entrypoint: Iterable[str], plugins_de_projeto: Iterable[str],
    fontes_declaradas: object,
) -> None:
    """
    Alguém de precedência MAIOR reivindica a mesma chave?

    A a5 provou a ordem: embutido < usuário < projeto < entrypoint. O plugin governado
    é de USUÁRIO, então plugin de projeto e entry point o superam. Existir o arquivo em
    `/data/plugins` não é prova de que ele vence.

    Fontes não declaradas é RECUSA, não "nenhuma encontrada". Se o caminho de plugin de
    projeto da 0.20.4 ainda não foi descoberto, o portão não pode afirmar que não há
    concorrente — ele só pode dizer que não olhou.
    """
    if type(fontes_declaradas) is not list or not fontes_declaradas:
        raise PrestartRefusal("PRECEDENCE_SOURCES_UNDECLARED")
    concorrentes = [n for n in nomes_de_entrypoint if n == chave]
    if concorrentes:
        raise PrestartRefusal("ENTRYPOINT_OVERRIDE_PRESENT", chave)
    achados = list(plugins_de_projeto)
    if achados:
        raise PrestartRefusal("PRECEDENCE_OVERRIDE_PRESENT", achados[0][:120])


# ═════════════════════════════════════════════════════════════════════════════
# IMPURAS — leitura de disco e de metadados. Nada é escolhido pelo chamador.
# ═════════════════════════════════════════════════════════════════════════════


def _sha256(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def _le_yaml(caminho: pathlib.Path) -> Mapping[str, Any]:
    try:
        import yaml  # noqa: PLC0415
    except ImportError:
        # Falha FECHADA. Sem parser, o portão não consegue afirmar nada sobre o
        # conteúdo — e não afirmar é motivo para não subir, não para subir.
        raise PrestartRefusal("YAML_PARSER_UNAVAILABLE", str(caminho)) from None
    try:
        with open(caminho, "rb") as fh:
            dados = yaml.safe_load(fh)
    except Exception as causa:  # noqa: BLE001
        raise PrestartRefusal("PLUGIN_YAML_UNPARSEABLE",
                              f"{caminho.name}: {type(causa).__name__}") from None
    if not isinstance(dados, Mapping):
        raise PrestartRefusal("PLUGIN_YAML_UNPARSEABLE", f"{caminho.name}: não é mapa")
    return dados


def compat_id_por_ast(fonte: str) -> str:
    """
    Lê `ADAPTER_COMPAT_ID` do módulo implantado SEM importá-lo.

    Importar executaria código do plugin antes de o portão decidir se ele é aprovado —
    e a decisão viria depois da execução. AST lê a atribuição literal e nada roda.
    """
    for no in ast.walk(ast.parse(fonte)):
        if isinstance(no, ast.Assign):
            for alvo in no.targets:
                if (isinstance(alvo, ast.Name) and alvo.id == "ADAPTER_COMPAT_ID"
                        and isinstance(no.value, ast.Constant)
                        and type(no.value.value) is str):
                    return no.value.value
    raise PrestartRefusal("COMPAT_MODULE_UNREADABLE", "ADAPTER_COMPAT_ID não é literal")


def versao_do_hermes_instalado(distribuicoes: Iterable[str]) -> str | None:
    from importlib import metadata  # noqa: PLC0415

    for nome in distribuicoes:
        try:
            return metadata.version(nome)
        except Exception:  # noqa: BLE001, S112
            continue
    return None


def nomes_de_entrypoint() -> list[str]:
    """
    Todo nome de entry point instalado, em TODOS os grupos.

    Varrer todos os grupos em vez do grupo exato do Hermes é deliberado: o nome do
    grupo da 0.20.4 não está descoberto, e um concorrente registrado num grupo que eu
    não soube nomear passaria. Nome igual à chave governada é recusa em qualquer grupo.
    """
    from importlib import metadata  # noqa: PLC0415

    try:
        eps = metadata.entry_points()
    except Exception:  # noqa: BLE001
        return []
    nomes: list[str] = []
    if hasattr(eps, "groups"):  # Python >= 3.10
        for grupo in eps.groups:
            nomes.extend(ep.name for ep in eps.select(group=grupo))
    else:  # Python 3.9
        for lista in eps.values():
            nomes.extend(ep.name for ep in lista)
    return nomes


def plugins_de_projeto_com_a_chave(fontes: Iterable[str], chave: str) -> list[str]:
    """Diretórios de precedência maior que declaram a MESMA chave."""
    achados: list[str] = []
    for fonte in fontes:
        base = pathlib.Path(fonte)
        if not base.is_dir():
            continue
        for candidato in sorted(base.iterdir()):
            yaml_do_candidato = candidato / "plugin.yaml"
            if not yaml_do_candidato.is_file():
                continue
            try:
                dados = _le_yaml(yaml_do_candidato)
            except PrestartRefusal:
                # Um plugin de precedência maior que não consigo ler é concorrente
                # POSSÍVEL. Ilegível conta como presente: falha fechada.
                achados.append(str(candidato))
                continue
            if dados.get("name") == chave or dados.get("key") == chave:
                achados.append(str(candidato))
    return achados


def entradas_reais(raiz: pathlib.Path) -> list[str]:
    """
    TODA entrada do sistema de arquivos sob a raiz. Arquivos, diretórios, o que houver.

    ─── O que a a6 deixou aberto ────────────────────────────────────────────────

    A primeira versão pulava `__pycache__` e `*.pyc`, tratando-os como sujeira de
    ferramenta. E havia teste — `test_I3` — afirmando que não contavam. Aquele teste
    não media higiene: ele codificava o defeito como regra.

    `-B` e `PYTHONDONTWRITEBYTECODE=1` impedem ESCREVER bytecode. Não impedem LER.
    Um `.pyc` já presente é carregável, e eu havia fechado o pacote contra
    código-fonte enquanto o deixava aberto contra o código que o interpretador de
    fato executa.

    ─── Por que diretórios também ──────────────────────────────────────────────

    Enumerar só arquivos deixaria um `__pycache__/` VAZIO passar — e o invariante é
    sobre entradas do sistema de arquivos, não sobre conteúdo executável. Diretório
    não declarado é entrada não declarada.
    """
    saida: list[str] = []
    for pai, dirs, arquivos in os.walk(raiz):
        for nome in list(dirs) + list(arquivos):
            saida.append(str(pathlib.Path(pai, nome).relative_to(raiz)))
    return sorted(saida)


def entradas_declaradas(caminhos: Iterable[str]) -> set[str]:
    """Os arquivos declarados MAIS os diretórios que eles implicam."""
    declaradas: set[str] = set()
    for rel in caminhos:
        declaradas.add(rel)
        pai = pathlib.PurePosixPath(rel).parent
        while str(pai) not in (".", "/", ""):
            declaradas.add(str(pai))
            pai = pai.parent
    return declaradas


def verifica(caminho_do_manifesto: str, *,
             sha_esperado_do_manifesto: str | None = None) -> Relatorio:
    """
    O portão inteiro. Coleta TODOS os defeitos — ver um por execução esconde os outros.

    O caminho do manifesto é o único parâmetro externo, e ele é fixado pelo envelope
    que invoca este verificador. Tudo o mais — raiz do plugin, chave, versão exigida,
    caminho da config, fontes de precedência — vem do manifesto APROVADO, não do
    chamador.
    """
    r = Relatorio()
    man = pathlib.Path(caminho_do_manifesto)

    if not man.is_file():
        r.recusa("MANIFEST_MISSING", str(man))
        return r
    if sha_esperado_do_manifesto is not None:
        visto = _sha256(man)
        r.observado["manifest_sha256"] = visto
        if visto != sha_esperado_do_manifesto:
            r.recusa("MANIFEST_HASH_MISMATCH", visto)
            return r
    try:
        with open(man, "rb") as fh:
            dados = json.load(fh)
    except Exception as causa:  # noqa: BLE001
        r.recusa("MANIFEST_UNPARSEABLE", type(causa).__name__)
        return r
    try:
        confere_identidade_do_manifesto(dados)
    except PrestartRefusal as recusa:
        r.recusa(recusa.defect, recusa.detail)
        return r

    r.observado.update({
        "artifact_version": dados["artifact_version"],
        "source_commit": dados["source_commit"][:12],
        "plugin_root": dados["plugin_root"],
        "plugin_key": dados["plugin_key"],
        "runtime_platform": dados["runtime_platform"],
        "hermes_version_required": dados["hermes_version_required"],
        "closed_package": bool(dados["closed_package"]),
    })

    # ─── a raiz do plugin ────────────────────────────────────────────────────
    raiz = pathlib.Path(dados["plugin_root"])
    if not raiz.exists():
        r.recusa("PLUGIN_ROOT_MISSING", str(raiz))
        return r
    if raiz.is_symlink():
        # Symlink move o alvo sem mudar o caminho. O que foi aprovado é um diretório
        # real, e "aponta para o aprovado agora" não é "é o aprovado".
        r.recusa("PLUGIN_ROOT_IS_SYMLINK", str(raiz))
        return r
    if not raiz.is_dir():
        r.recusa("PLUGIN_ROOT_NOT_DIRECTORY", str(raiz))
        return r
    if os.path.realpath(raiz) != str(raiz):
        # Ancestral pode ser symlink mesmo quando a folha não é.
        r.recusa("PLUGIN_ROOT_NOT_CANONICAL", os.path.realpath(raiz))
        return r

    # ─── arquivo por arquivo, contra o manifesto EXTERNO ─────────────────────
    declarados: set[str] = set()
    for entrada in dados["plugin_files"]:
        rel = entrada["relative_path"]
        declarados.add(rel)
        alvo = raiz / rel
        if alvo.is_symlink():
            r.recusa("PLUGIN_FILE_IS_SYMLINK", rel)
            continue
        if not alvo.is_file():
            r.recusa("PLUGIN_FILE_MISSING", rel)
            continue
        # O HASH sempre roda. A primeira versão conferia o tamanho e fazia `continue`,
        # então só arquivo de tamanho idêntico chegava à conferência que importa — e o
        # relatório dizia "tamanho divergente" onde o fato era "conteúdo divergente".
        # Recusava nos dois casos, mas descrevia o defeito errado, e um portão que
        # nomeia mal o que viu é um portão que se depura mal.
        if _sha256(alvo) != entrada["sha256"]:
            r.recusa("PLUGIN_FILE_HASH_MISMATCH", rel)
        tamanho = alvo.stat().st_size
        if "size_bytes" in entrada and tamanho != entrada["size_bytes"]:
            r.recusa("PLUGIN_FILE_SIZE_MISMATCH", f"{rel}: {tamanho}")

    for exigido in CONTRATO_PLUGIN:
        if not (raiz / exigido).is_file():
            r.recusa("PLUGIN_FILE_MISSING", exigido)

    # ─── nenhum symlink em NENHUMA profundidade ──────────────────────────────
    #
    # Encontrado ao revisar a enumeração pelo §11 da r1. A raiz era conferida, e cada
    # arquivo declarado também — mas um DIRETÓRIO intermediário symlinkado escapava:
    # `creditum_hermes_telegram/compat.py` não é symlink quando o symlink é a pasta
    # que o contém. O hash ainda era conferido através do link, então o conteúdo
    # seguia preso; o que ficava solto era ONDE aquele conteúdo mora.
    for entrada in entradas_reais(raiz):
        if (raiz / entrada).is_symlink():
            r.recusa("PLUGIN_FILE_IS_SYMLINK", entrada)

    if bool(dados["closed_package"]):
        # Pacote FECHADO: sobrar QUALQUER entrada é defeito. Um `.py` extra é código
        # que o Hermes pode importar e que a revisão nunca viu; um `.pyc` extra é
        # código que ele pode importar SEM nem ler fonte.
        esperadas = entradas_declaradas(declarados)
        for encontrado in entradas_reais(raiz):
            if encontrado not in esperadas:
                r.recusa("PLUGIN_UNEXPECTED_FILE", encontrado)

    # ─── o que o plugin implantado DIZ ───────────────────────────────────────
    try:
        confere_plugin_yaml(
            _le_yaml(raiz / "plugin.yaml"),
            chave=dados["plugin_key"], tipo=dados["plugin_kind"],
            versao=str(dados["plugin_version"]), plataforma=dados["runtime_platform"])
    except PrestartRefusal as recusa:
        r.recusa(recusa.defect, recusa.detail)

    # ─── identidade de compatibilidade da a4, lida sem importar ──────────────
    compat = raiz / dados["compat_module_relative_path"]
    try:
        if not compat.is_file():
            raise PrestartRefusal("COMPAT_MODULE_UNREADABLE",
                                  dados["compat_module_relative_path"])
        with open(compat, encoding="utf-8") as fh:
            lido = compat_id_por_ast(fh.read())
        r.observado["adapter_compat_id"] = lido
        if lido != dados["adapter_compat_id"]:
            r.recusa("ADAPTER_COMPAT_ID_UNEXPECTED", lido[:80])
    except PrestartRefusal as recusa:
        r.recusa(recusa.defect, recusa.detail)
    except Exception as causa:  # noqa: BLE001
        r.recusa("COMPAT_MODULE_UNREADABLE", type(causa).__name__)

    # ─── o Hermes instalado ──────────────────────────────────────────────────
    lida = versao_do_hermes_instalado(DISTRIBUICOES_DO_HERMES)
    r.observado["hermes_version_observed"] = lida
    try:
        confere_versao_do_hermes(lida, exigida=dados["hermes_version_required"])
    except PrestartRefusal as recusa:
        r.recusa(recusa.defect, recusa.detail)

    # ─── a configuração habilita? ────────────────────────────────────────────
    cfg = pathlib.Path(dados["config_path"])
    if not cfg.is_file():
        r.recusa("CONFIG_MISSING", str(cfg))
    else:
        try:
            confere_config(_le_yaml(cfg), chave=dados["plugin_key"],
                           caminho_lista=dados["config_enabled_list_path"])
        except PrestartRefusal as recusa:
            defeito = ("CONFIG_UNPARSEABLE"
                       if recusa.defect == "PLUGIN_YAML_UNPARSEABLE" else recusa.defect)
            r.recusa(defeito, recusa.detail)

    # ─── quem venceria a descoberta? ─────────────────────────────────────────
    fontes = dados["precedence_paths_to_inspect"]
    try:
        confere_precedencia(
            chave=dados["plugin_key"],
            nomes_de_entrypoint=nomes_de_entrypoint(),
            plugins_de_projeto=(
                plugins_de_projeto_com_a_chave(fontes, dados["plugin_key"])
                if type(fontes) is list else []),
            fontes_declaradas=fontes)
    except PrestartRefusal as recusa:
        r.recusa(recusa.defect, recusa.detail)

    # ─── duplicata sob a MESMA raiz de usuário ───────────────────────────────
    pai = raiz.parent
    if pai.is_dir():
        for irmao in sorted(pai.iterdir()):
            if irmao == raiz or not (irmao / "plugin.yaml").is_file():
                continue
            try:
                if _le_yaml(irmao / "plugin.yaml").get("name") == dados["plugin_key"]:
                    r.recusa("DUPLICATE_PLUGIN_LOCATION", str(irmao))
            except PrestartRefusal:
                r.recusa("DUPLICATE_PLUGIN_LOCATION", f"{irmao} (ilegível)")
    return r


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(add_help=True, description=__doc__)
    p.add_argument("--manifest", required=True)
    p.add_argument("--manifest-sha256", default=None)
    a = p.parse_args(argv)

    r = verifica(a.manifest, sha_esperado_do_manifesto=a.manifest_sha256)
    print("=== portão pré-partida do plugin Telegram governado ===")
    for chave, valor in r.observado.items():
        print(f"  {chave:<28}{valor}")
    if r.aprovado:
        print("\n  APROVADO — o gateway pode subir.")
        return 0
    print()
    for defeito, detalhe in r.defeitos:
        print(f"  RECUSA   {defeito}" + (f": {detalhe}" if detalhe else ""))
    print(f"\n  {len(r.defeitos)} recusa(s). O GATEWAY NÃO DEVE SUBIR.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
