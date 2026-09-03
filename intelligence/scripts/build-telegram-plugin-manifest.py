#!/usr/bin/env python3
"""
D2E-A6 — gera o MANIFESTO DE IMPLANTAÇÃO do plugin Telegram governado.

    python3 -B scripts/build-telegram-plugin-manifest.py \
        --plugin-tree <dir> --source-commit <sha> --out <manifest.json>

─── Por que fora do plugin ─────────────────────────────────────────────────────

O §7 da fase: o objeto verificado não pode ser sua própria autoridade. Se o
`plugin.yaml` declarasse os hashes de confiança, quem alterasse o plugin alteraria
junto a lista que o valida, e a conferência viraria uma tautologia — arquivo confere
consigo mesmo.

Então a autoridade nasce AQUI, a partir da árvore aprovada, e o verificador compara a
árvore em produção contra este documento. O documento, por sua vez, é fixado pelo
SHA-256 gravado no envelope de partida.

─── Uma travessia, e por que ───────────────────────────────────────────────────

A r2 validava numa passada de `os.walk` e hasheava em OUTRA. Um arquivo que aparecesse
entre as duas entrava em `plugin_files` com hash de aprovado sem `arquivo_aprovado`
nunca ter sido chamado sobre ele — o Codex provou executando, fazendo `package.json`
aparecer só na segunda passada.

É a família de defeito que a d1-r1 já havia estabelecido e que está escrita no
`ingress.py`: **ler duas vezes o que precisa ser lido uma vez**. Lá era campo de
evento; aqui é a árvore de arquivos. Validar e usar têm de ser a MESMA leitura, ou o
que foi validado não é o que foi usado.

Agora há uma travessia AUTORITATIVA que valida, captura e hasheia o mesmo descritor de
arquivo, e uma conferência de DERIVA que só compara — nunca inclui.

Não escreve nada além do arquivo de saída. Rede zero.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import stat
import sys
from dataclasses import dataclass

MANIFEST_ID = "creditum_hermes_telegram_plugin_deployment/v1"
PLUGIN_KEY = "telegram-platform"
PLUGIN_KIND = "platform"
RUNTIME_PLATFORM = "telegram"
HERMES_VERSION = "0.20.4"
COMPAT_RELATIVE = "creditum_hermes_telegram/compat.py"

#: O manifesto EXATO do contrato de plugin do Hermes 0.20.4. Nome fixo, só na raiz.
MANIFESTO_DO_PLUGIN = "plugin.yaml"

#: Os pacotes Python que o artefato governado carrega. `creditum_hermes_reasoning` e
#: `creditum_hermes_precall` NÃO entram: a d2d os instala no interpretador de produção,
#: e duplicá-los aqui criaria uma segunda cópia com hash próprio.
PACOTES_APROVADOS = ("creditum_hermes_telegram",)

POLITICA_APROVADA = (
    "plugin.yaml na raiz; arquivos .py com nome de identificador Python na raiz ou "
    f"diretamente dentro de {'/, '.join(PACOTES_APROVADOS)}/. Nada mais."
)


def diretorio_aprovado(pai: pathlib.PurePosixPath, nome: str) -> bool:
    """Só os pacotes governados, e só no primeiro nível. Sem aninhamento."""
    return str(pai) == "." and nome in PACOTES_APROVADOS


def arquivo_aprovado(pai: pathlib.PurePosixPath, nome: str) -> bool:
    """
    Forma POSITIVA: casa uma das classes aprovadas, ou recusa.

    Nada de `if sufixo not in RUINS: permite` — isso continua sendo lista de negação
    com outra cara, e foi o que a r1 fez.

    O nome do `.py` tem de ser identificador Python. `payload.so.py` termina em `.py`
    e passaria por sufixo; `payload.so` não é identificador, então não passa. Um `.py`
    que não pode ser importado não tem o que fazer dentro de um pacote.
    """
    na_raiz = str(pai) == "."
    if nome == MANIFESTO_DO_PLUGIN:
        return na_raiz
    if nome.endswith(".py") and nome[:-3].isidentifier():
        return na_raiz or str(pai) in PACOTES_APROVADOS
    return False


def sha256(caminho: pathlib.Path) -> str:
    """Hash por CAMINHO. Usado só para o manifesto final, que este script escreveu."""
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


class ArtefatoRecusado(Exception):
    """Recusa nomeada. O construtor não conserta, não limpa, não tenta de novo."""

    def __init__(self, motivos: list[str]) -> None:
        super().__init__(f"{len(motivos)} recusa(s)")
        self.motivos = motivos


@dataclass(frozen=True)
class ArquivoAprovado:
    """
    Um arquivo que passou a política, com o hash lido do MESMO descritor.

    Não guarda `pathlib.Path` para reabrir depois: reabrir por nome é o que permite
    substituir o arquivo entre a aprovação e o uso. O que se guarda é o resultado.
    """

    relative_path: str
    sha256: str
    size_bytes: int
    inode: int
    mtime_ns: int
    #: Os bytes APROVADOS, retidos só para o arquivo cujo conteúdo o manifesto usa
    #: depois. Manter a árvore inteira em memória seria transformar o registro num
    #: arquivo morto sem necessidade — o §2 do brief pede o mínimo.
    conteudo: bytes | None = None


def _abre_sem_seguir(caminho: pathlib.Path) -> int:
    """
    Abre para leitura RECUSANDO symlink, no próprio `open`.

    `O_NOFOLLOW` faz o kernel recusar se o último componente for link simbólico. Isso
    fecha "arquivo trocado por symlink durante a construção" no ponto onde importa —
    conferir com `is_symlink()` e abrir depois seriam duas leituras outra vez.
    """
    return os.open(str(caminho), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))


def le_e_hasheia(caminho: pathlib.Path, rel: str) -> ArquivoAprovado:
    """Lê UMA vez, do mesmo descritor de onde vem o `fstat`."""
    fd = _abre_sem_seguir(caminho)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise ArtefatoRecusado([f"{rel}  (não é arquivo comum)"])
        # Retenção decidida por CONSTANTE, não por parâmetro: quem chama não escolhe
        # de qual arquivo os bytes ficam guardados.
        reter = rel == COMPAT_RELATIVE
        h = hashlib.sha256()
        partes: list[bytes] = []
        while True:
            bloco = os.read(fd, 65536)
            if not bloco:
                break
            h.update(bloco)
            if reter:
                partes.append(bloco)
        return ArquivoAprovado(relative_path=rel, sha256=h.hexdigest(),
                               size_bytes=st.st_size, inode=st.st_ino,
                               mtime_ns=st.st_mtime_ns,
                               conteudo=b"".join(partes) if reter else None)
    finally:
        os.close(fd)


def percorre_e_aprova(arvore: pathlib.Path) -> list[ArquivoAprovado]:
    """
    A travessia AUTORITATIVA: valida, captura e hasheia na mesma passada.

    `plugin_files` nasce SÓ daqui, e só de dentro do ramo que a política aprovou. Não
    existe caminho `arquivo comum → hash → lista` sem `arquivo_aprovado` no meio.
    """
    aprovados: list[ArquivoAprovado] = []
    recusas: list[str] = []
    for pai, dirs, nomes in os.walk(arvore):
        rel_pai = pathlib.PurePosixPath(pathlib.Path(pai).relative_to(arvore).as_posix())
        for nome in dirs:
            alvo = pathlib.Path(pai, nome)
            rel = str(alvo.relative_to(arvore))
            if alvo.is_symlink():
                recusas.append(f"{rel}  (symlink)")
            elif not diretorio_aprovado(rel_pai, nome):
                recusas.append(f"{rel}  (diretório fora da estrutura aprovada)")
        for nome in nomes:
            alvo = pathlib.Path(pai, nome)
            rel = str(alvo.relative_to(arvore))
            if alvo.is_symlink():
                recusas.append(f"{rel}  (symlink)")
                continue
            if not arquivo_aprovado(rel_pai, nome):
                recusas.append(f"{rel}  (classe de arquivo não aprovada)")
                continue
            # APROVADO — e é aqui, dentro deste ramo, que o arquivo é lido.
            try:
                aprovados.append(le_e_hasheia(alvo, rel))
            except ArtefatoRecusado as recusa:
                recusas.extend(recusa.motivos)
            except OSError as causa:
                recusas.append(f"{rel}  (ilegível: {causa.__class__.__name__})")
    if recusas:
        raise ArtefatoRecusado(recusas)
    aprovados.sort(key=lambda a: a.relative_path)
    return aprovados


def entradas_atuais(arvore: pathlib.Path) -> set[tuple[str, str]]:
    """Nomes e TIPOS do que está na árvore agora. Não decide nada, só descreve."""
    atuais: set[tuple[str, str]] = set()
    for pai, dirs, nomes in os.walk(arvore):
        for nome in dirs:
            alvo = pathlib.Path(pai, nome)
            atuais.add((str(alvo.relative_to(arvore)),
                        "symlink" if alvo.is_symlink() else "dir"))
        for nome in nomes:
            alvo = pathlib.Path(pai, nome)
            atuais.add((str(alvo.relative_to(arvore)),
                        "symlink" if alvo.is_symlink() else "file"))
    return atuais


def confere_deriva(arvore: pathlib.Path, aprovados: list[ArquivoAprovado]) -> None:
    """
    A árvore de AGORA é a mesma que foi aprovada? Conferência, nunca inclusão.

    ─── Por que ela existe, além da travessia única ─────────────────────────────

    Travessia única resolve "arquivo novo é aprovado sem passar pela política". Não
    resolve "arquivo novo fica na árvore e o manifesto sai dizendo que descreve a
    árvore inteira". Consertar o primeiro criando o segundo seria trocar um defeito
    por outro mais silencioso — o §7 do brief nomeia exatamente isso.

    Então antes de escrever: a árvore atual tem de ter exatamente as entradas
    aprovadas, e cada arquivo aprovado tem de continuar com o mesmo conteúdo. Esta
    função **não** alimenta `plugin_files`; ela só levanta recusa.
    """
    esperadas: set[tuple[str, str]] = set()
    for a in aprovados:
        esperadas.add((a.relative_path, "file"))
        pai = pathlib.PurePosixPath(a.relative_path).parent
        while str(pai) not in (".", "/", ""):
            esperadas.add((str(pai), "dir"))
            pai = pai.parent

    recusas: list[str] = []
    atuais = entradas_atuais(arvore)
    for rel, tipo in sorted(atuais - esperadas):
        recusas.append(f"{rel}  (apareceu durante a construção, como {tipo})")
    for rel, tipo in sorted(esperadas - atuais):
        recusas.append(f"{rel}  (desapareceu durante a construção, era {tipo})")

    # Conteúdo: reconferido pelo hash, não por metadado. `mtime` igual com bytes
    # diferentes é possível; hash igual com bytes diferentes, não.
    for a in aprovados:
        if (a.relative_path, "file") not in atuais:
            continue
        try:
            agora = le_e_hasheia(arvore / a.relative_path, a.relative_path)
        except (ArtefatoRecusado, OSError) as causa:
            recusas.append(f"{a.relative_path}  (ilegível na reconferência: "
                           f"{causa.__class__.__name__})")
            continue
        if agora.sha256 != a.sha256:
            recusas.append(f"{a.relative_path}  (conteúdo mudou durante a construção)")
        elif agora.inode != a.inode:
            recusas.append(f"{a.relative_path}  (arquivo substituído: inode diferente)")
    if recusas:
        raise ArtefatoRecusado(recusas)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--plugin-tree", required=True)
    p.add_argument("--source-commit", required=True)
    p.add_argument("--plugin-root", required=True,
                   help="caminho ABSOLUTO de produção, ex. /data/plugins/<dir>")
    p.add_argument("--plugin-version", required=True)
    p.add_argument("--artifact-version", required=True)
    p.add_argument("--config-path", default="/data/config.yaml")
    p.add_argument("--config-enabled-list-path", default="plugins.enabled")
    p.add_argument("--precedence-path", action="append", default=[],
                   help="diretório de precedência MAIOR a inspecionar; repetível")
    p.add_argument("--out", required=True)
    a = p.parse_args(argv)

    arvore = pathlib.Path(a.plugin_tree)
    if not arvore.is_dir():
        print(f"árvore inexistente: {arvore}", file=sys.stderr)
        return 2
    if not a.plugin_root.startswith("/"):
        print("--plugin-root tem de ser absoluto", file=sys.stderr)
        return 2
    if not a.precedence_path:
        # Recusa deliberada: um manifesto sem fontes de precedência produz um portão
        # que não consegue afirmar quem vence a descoberta. Melhor não gerar.
        print("--precedence-path é obrigatório (ao menos um)", file=sys.stderr)
        return 2

    # UMA travessia autoritativa: valida, captura e hasheia o mesmo descritor.
    try:
        aprovados = percorre_e_aprova(arvore)
    except ArtefatoRecusado as recusa:
        print("árvore contém entrada que a política NÃO aprova:", file=sys.stderr)
        for m in sorted(set(recusa.motivos))[:30]:
            print(f"  {m}", file=sys.stderr)
        print("", file=sys.stderr)
        print(f"política aprovada: {POLITICA_APROVADA}", file=sys.stderr)
        print("remova antes de gerar o manifesto (o construtor não limpa por você)",
              file=sys.stderr)
        return 2
    if not aprovados:
        print("árvore aprovada está vazia", file=sys.stderr)
        return 2

    arquivos = [{"relative_path": a.relative_path, "sha256": a.sha256,
                 "size_bytes": a.size_bytes} for a in aprovados]

    manifesto = {
        "manifest_id": MANIFEST_ID,
        "artifact_version": a.artifact_version,
        "source_commit": a.source_commit,
        "hermes_version_required": HERMES_VERSION,
        "plugin_root": a.plugin_root,
        "plugin_key": PLUGIN_KEY,
        "plugin_kind": PLUGIN_KIND,
        "plugin_version": a.plugin_version,
        "runtime_platform": RUNTIME_PLATFORM,
        "adapter_compat_id": None,
        "compat_module_relative_path": COMPAT_RELATIVE,
        "closed_package": True,
        "config_path": a.config_path,
        "config_enabled_list_path": a.config_enabled_list_path,
        "precedence_paths_to_inspect": list(a.precedence_path),
        "plugin_files": arquivos,
        "file_count": len(arquivos),
        "network_used": "nenhuma",
        "contains_secrets": False,
    }

    # ─── a identidade de compatibilidade, dos MESMOS bytes aprovados ─────────
    #
    # A r3 fechou a releitura por caminho em `percorre_e_aprova` e deixou esta intacta,
    # trinta linhas abaixo:
    #
    #     with open(compat, encoding="utf-8") as fh:
    #         manifesto["adapter_compat_id"] = compat_id_por_ast(fh.read())
    #
    # `open` por nome, depois da aprovação. Trocar o arquivo entre o hash e esta
    # leitura, e restaurar antes da conferência de deriva, produzia um manifesto com
    # `plugin_files` descrevendo A e `adapter_compat_id` derivado de B — e a deriva
    # comparava com o estado restaurado, então não via nada.
    #
    # Eu havia escrito, na rodada anterior, que tinha o princípio documentado e não o
    # apliquei no arquivo ao lado. Aqui eu o apliquei na função e não no módulo.
    aprovado_compat = next(
        (x for x in aprovados if x.relative_path == COMPAT_RELATIVE), None)
    if aprovado_compat is None or aprovado_compat.conteudo is None:
        print(f"{COMPAT_RELATIVE} ausente na árvore aprovada", file=sys.stderr)
        return 2
    try:
        # UTF-8 estrito e explícito. Decodificação de plataforma faria o mesmo byte
        # produzir identidades diferentes em máquinas diferentes.
        fonte_aprovada = aprovado_compat.conteudo.decode("utf-8")
    except UnicodeDecodeError:
        print(f"{COMPAT_RELATIVE} não é UTF-8 válido", file=sys.stderr)
        return 2
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bridge"))
    from creditum_hermes_prestart.verify import compat_id_por_ast  # noqa: PLC0415

    try:
        manifesto["adapter_compat_id"] = compat_id_por_ast(fonte_aprovada)
    except Exception as causa:  # noqa: BLE001
        print(f"{COMPAT_RELATIVE}: {causa}", file=sys.stderr)
        return 2

    # A árvore de agora ainda é a aprovada? Conferência, nunca inclusão.
    try:
        confere_deriva(arvore, aprovados)
    except ArtefatoRecusado as recusa:
        print("a árvore MUDOU durante a construção:", file=sys.stderr)
        for m in sorted(set(recusa.motivos))[:30]:
            print(f"  {m}", file=sys.stderr)
        print("nenhum manifesto foi escrito", file=sys.stderr)
        return 2

    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(manifesto, fh, indent=2, ensure_ascii=False, sort_keys=False)
        fh.write("\n")
    print(f"{a.out}  {len(arquivos)} arquivos  sha256={sha256(pathlib.Path(a.out))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
