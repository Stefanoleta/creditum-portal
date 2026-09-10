#!/usr/bin/env python3
"""
D2E-A8-R1 §4 — migração do LIVRO-RAZÃO de execução. Origem somente leitura.

    python3 -B deploy/vps/migrate-execution-ledger.py \
        --source /data/creditum_hermes_runtime/execution-ledger/v1 \
        --dest   /migracao/execution-ledger/v1

─── Por que isto é estado de SEGURANÇA, e não backup de conveniência ───────────

O livro-razão guarda a prova durável de uso único: `<raiz>/attempts/<chave>/` é criado
com `mkdir` SEM `recursive`, e é essa chamada que faz a reserva ser atômica entre
processos. A d2e-a4 deriva o `execution_id` da identidade imutável da mensagem do
Telegram justamente para reusar esse mecanismo.

Consequência: **subir a VPS sem o livro-razão migrado permitiria reservar de novo um
`execution_id` já consumido no Managed** — ou seja, executar de novo uma mensagem que
já executou. Não é continuidade que se perde; é a proteção contra repetição.

─── Por que instantâneo comparado basta, e não precisa travar a origem ─────────

A semântica do livro-razão é CREATE/APPEND: `reservation.json` é escrito uma vez, e os
recibos de commit e terminal são arquivos NOVOS no mesmo diretório. Nenhuma entrada
muda de bytes depois de escrita. Então:

    S1 (origem antes)  ==  S2 (origem depois)  ==  D (destino)

Se a origem ganhou atividade durante a cópia, S1 != S2 e a migração RECUSA — e recusar
é o desfecho certo, porque a cópia parcial descreveria um livro-razão que nunca
existiu. Travar a origem seria pior: travaria o Hermes de produção.

Na prática a migração roda com o poller do Managed já parado, então deriva não deve
acontecer. A comparação é conferência, não substituto da ordem das etapas.

─── Restrições que a implementação da d2b impõe, e que esta ferramenta respeita ─

`execution-ledger.ts` valida com `lstat` NO-FOLLOW: a raiz e o `attempts` têm de ser
diretórios REAIS, nunca symlink. E `realpath(attempts)` relativo à `realpath(raiz)`
tem de ser exatamente `attempts`. Então esta ferramenta recusa symlink em qualquer
profundidade e recria diretórios reais — um destino com link no lugar de `attempts`
faria o gateway recusar toda reserva.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import sys

ATTEMPTS = "attempts"


class MigracaoRecusada(Exception):
    def __init__(self, motivos: list[str]) -> None:
        super().__init__(f"{len(motivos)} recusa(s)")
        self.motivos = motivos


def _sha256_fd(caminho: pathlib.Path) -> tuple[str, int]:
    """Hash e tamanho do MESMO descritor, sem seguir link."""
    fd = os.open(str(caminho), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        st = os.fstat(fd)
        h = hashlib.sha256()
        while True:
            bloco = os.read(fd, 65536)
            if not bloco:
                break
            h.update(bloco)
        return h.hexdigest(), st.st_size
    finally:
        os.close(fd)


def manifesto(raiz: pathlib.Path) -> dict[str, tuple[str, str, int]]:
    """
    `caminho relativo → (tipo, sha256, tamanho)`. Diretórios entram como entrada.

    Diretório entra porque `attempts/<chave>/` VAZIO já é uma reserva: o `mkdir` é a
    reserva, e o `reservation.json` vem depois. Um instantâneo que só listasse
    arquivos perderia exatamente as reservas em voo.
    """
    saida: dict[str, tuple[str, str, int]] = {}
    for pai, dirs, arquivos in os.walk(raiz):
        for nome in list(dirs) + list(arquivos):
            alvo = pathlib.Path(pai, nome)
            rel = str(alvo.relative_to(raiz))
            if alvo.is_symlink():
                saida[rel] = ("symlink", "", 0)
            elif alvo.is_dir():
                saida[rel] = ("dir", "", 0)
            else:
                sha, tam = _sha256_fd(alvo)
                saida[rel] = ("file", sha, tam)
    return saida


def valida_origem(raiz: pathlib.Path, m: dict[str, tuple[str, str, int]]) -> list[str]:
    recusas: list[str] = []
    if not raiz.is_dir():
        return [f"{raiz}: raiz do livro-razão ausente"]
    if raiz.is_symlink():
        return [f"{raiz}: raiz é symlink — a d2b recusa com lstat no-follow"]
    if os.path.realpath(raiz) != str(raiz):
        recusas.append(f"{raiz}: caminho não canônico (ancestral é symlink)")
    for rel, (tipo, _, _) in sorted(m.items()):
        if tipo == "symlink":
            recusas.append(f"{rel}: symlink — a d2b recusa e o destino não pode ter")
    if ATTEMPTS not in m:
        # Livro-razão sem `attempts` é livro-razão sem nenhuma reserva. Não é erro
        # por si, mas migrar o vazio no lugar do cheio seria — então é recusa
        # explícita, e o operador confirma que a origem é mesmo esta.
        recusas.append(f"{ATTEMPTS}/ ausente na origem — confirme a raiz")
    elif m[ATTEMPTS][0] != "dir":
        recusas.append(f"{ATTEMPTS}: não é diretório real")
    return recusas


def copia(origem: pathlib.Path, destino: pathlib.Path,
          m: dict[str, tuple[str, str, int]]) -> None:
    """Recria a árvore com diretórios REAIS. Nada de symlink, nada de `..`."""
    destino.mkdir(parents=True, exist_ok=False)
    for rel in sorted(m, key=lambda r: (r.count(os.sep), r)):
        tipo = m[rel][0]
        alvo = destino / rel
        if os.path.isabs(rel) or ".." in pathlib.PurePath(rel).parts:
            raise MigracaoRecusada([f"{rel}: caminho relativo inseguro"])
        if tipo == "dir":
            alvo.mkdir(parents=True, exist_ok=True)
        elif tipo == "file":
            alvo.parent.mkdir(parents=True, exist_ok=True)
            fd_o = os.open(str(origem / rel), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            try:
                fd_d = os.open(str(alvo), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                try:
                    while True:
                        bloco = os.read(fd_o, 65536)
                        if not bloco:
                            break
                        os.write(fd_d, bloco)
                    # Durabilidade: a reserva do livro-razão só vale se sobreviver a
                    # queda de energia, e é o `fsync` que faz isso valer.
                    os.fsync(fd_d)
                finally:
                    os.close(fd_d)
            finally:
                os.close(fd_o)


def migra(origem: pathlib.Path, destino: pathlib.Path) -> dict[str, object]:
    if destino.exists():
        raise MigracaoRecusada([f"{destino}: destino já existe — nunca sobrescrever"])

    s1 = manifesto(origem)
    recusas = valida_origem(origem, s1)
    if recusas:
        raise MigracaoRecusada(recusas)

    copia(origem, destino, s1)

    s2 = manifesto(origem)
    d = manifesto(destino)

    problemas: list[str] = []
    for rel in sorted(set(s1) | set(s2)):
        if s1.get(rel) != s2.get(rel):
            problemas.append(f"{rel}: a ORIGEM mudou durante a cópia "
                             f"({s1.get(rel, ('ausente',))[0]} → "
                             f"{s2.get(rel, ('ausente',))[0]})")
    for rel in sorted(set(s1) | set(d)):
        if s1.get(rel) != d.get(rel):
            problemas.append(f"{rel}: destino divergente da origem")

    if problemas:
        # Destino descartado: uma árvore parcial com aparência de válida é pior que
        # nenhuma árvore. O operador tenta de novo, com o poller já parado.
        _descarta(destino)
        raise MigracaoRecusada(problemas)

    return {
        "entries": len(s1),
        "attempt_dirs": sum(1 for r, (t, _, _) in s1.items()
                            if t == "dir" and r.startswith(ATTEMPTS + os.sep)),
        "files": sum(1 for _, (t, _, _) in s1.items() if t == "file"),
        "bytes": sum(tam for _, (t, _, tam) in s1.items() if t == "file"),
    }


def _descarta(destino: pathlib.Path) -> None:
    """Remove só o que ESTE processo criou, de baixo para cima. Sem `rmtree`."""
    for pai, dirs, arquivos in os.walk(destino, topdown=False):
        for nome in arquivos:
            try:
                os.unlink(os.path.join(pai, nome))
            except OSError:
                pass
        for nome in dirs:
            try:
                os.rmdir(os.path.join(pai, nome))
            except OSError:
                pass
    try:
        os.rmdir(destino)
    except OSError:
        pass


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True)
    p.add_argument("--dest", required=True)
    a = p.parse_args(argv)

    try:
        r = migra(pathlib.Path(a.source), pathlib.Path(a.dest))
    except MigracaoRecusada as recusa:
        print("RECUSA — nenhum livro-razão migrado:", file=sys.stderr)
        for m in recusa.motivos[:30]:
            print(f"  {m}", file=sys.stderr)
        return 2

    print("=== livro-razão migrado · S1 == S2 == D ===")
    for chave in ("entries", "attempt_dirs", "files", "bytes"):
        print(f"  {chave:<16}{r[chave]}")
    print("\n  A VPS tem de começar com este livro-razão no caminho governado exato:")
    print("  /data/creditum_hermes_runtime/execution-ledger/v1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
