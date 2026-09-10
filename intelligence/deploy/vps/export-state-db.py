#!/usr/bin/env python3
"""
D2E-A8-R1 §3 — exportação SEGURA de `/data/state.db`. Origem intocada.

    /opt/venv/bin/python3 -B deploy/vps/export-state-db.py \
        --source /data/state.db --dest /migracao/state.db

─── Por que a API de backup e não `cp` ─────────────────────────────────────────

A a8-d1 mediu: SQLite 3, `journal_mode=delete`, `quick_check=ok`, e o Hermes escreve
ali enquanto roda. `cp` sobre banco vivo copia páginas de momentos diferentes — o
arquivo resultante parece um banco e pode não ser um. A API de backup do SQLite
copia página por página tomando as travas necessárias, e é o único mecanismo que dá
cópia consistente com escritor ativo.

─── O que este script NÃO faz ──────────────────────────────────────────────────

Não lê linha de aplicação. Não imprime mensagem, prompt, sessão nem conteúdo de
conversa — nem por acidente, porque nunca faz `SELECT` em tabela de dados. O que ele
emite é: nomes de tabela, contagem de tabelas, tamanho e SHA-256. Nada mais.

Não modifica a origem: abre em modo somente leitura por URI (`mode=ro`).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import sqlite3
import sys

#: Só metadado de esquema. Nenhuma consulta a tabela de aplicação.
SQL_TABELAS = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"


class ExportacaoRecusada(Exception):
    def __init__(self, defeito: str, detalhe: str = "") -> None:
        super().__init__(defeito if not detalhe else f"{defeito}: {detalhe}")
        self.defeito = defeito


def sha256(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def abre_somente_leitura(caminho: pathlib.Path) -> sqlite3.Connection:
    """
    URI `mode=ro`: o SQLite recusa qualquer escrita nesta conexão.

    Abrir normal e "só não escrever" depende de eu não escrever. `mode=ro` faz o
    banco recusar — a diferença entre disciplina e garantia.
    """
    return sqlite3.connect(f"file:{caminho}?mode=ro", uri=True)


def exporta(origem: pathlib.Path, destino: pathlib.Path) -> dict[str, object]:
    if not origem.is_file():
        raise ExportacaoRecusada("SOURCE_MISSING", str(origem))
    if origem.is_symlink():
        raise ExportacaoRecusada("SOURCE_IS_SYMLINK", str(origem))
    if destino.exists():
        # Nunca sobrescrever: destino existente é conflito a relatar, não lixo.
        raise ExportacaoRecusada("DEST_EXISTS", str(destino))

    sha_antes = sha256(origem)
    tam_antes = origem.stat().st_size

    src = abre_somente_leitura(origem)
    try:
        tabelas = [r[0] for r in src.execute(SQL_TABELAS)]
        dst = sqlite3.connect(str(destino))
        try:
            # A API de backup. Página por página, com as travas do SQLite.
            src.backup(dst)
        finally:
            dst.close()
    except sqlite3.Error as causa:
        destino.unlink(missing_ok=True)
        raise ExportacaoRecusada("BACKUP_FAILED", type(causa).__name__) from None
    finally:
        src.close()

    # ─── integridade do BACKUP, não da origem ────────────────────────────────
    chk = abre_somente_leitura(destino)
    try:
        resultado = [r[0] for r in chk.execute("PRAGMA quick_check")]
        tabelas_destino = [r[0] for r in chk.execute(SQL_TABELAS)]
    except sqlite3.Error as causa:
        chk.close()
        destino.unlink(missing_ok=True)
        raise ExportacaoRecusada("BACKUP_UNREADABLE", type(causa).__name__) from None
    finally:
        try:
            chk.close()
        except sqlite3.Error:
            pass

    if resultado != ["ok"]:
        destino.unlink(missing_ok=True)
        raise ExportacaoRecusada("BACKUP_QUICK_CHECK_FAILED", str(resultado)[:80])
    if tabelas_destino != tabelas:
        destino.unlink(missing_ok=True)
        raise ExportacaoRecusada("BACKUP_SCHEMA_MISMATCH",
                                 f"{len(tabelas_destino)} != {len(tabelas)}")

    # ─── a origem não foi tocada ─────────────────────────────────────────────
    #
    # Conferido, não presumido. `mode=ro` faz o SQLite recusar escrita, e este hash
    # prova que a recusa valeu — se a origem mudou, foi o Hermes escrevendo, e o
    # operador precisa saber disso antes de confiar no backup.
    if sha256(origem) != sha_antes:
        raise ExportacaoRecusada("SOURCE_CHANGED_DURING_EXPORT",
                                 "o Hermes escreveu enquanto o backup rodava")

    return {
        "source_size_bytes": tam_antes,
        "source_sha256": sha_antes,
        "dest_size_bytes": destino.stat().st_size,
        "dest_sha256": sha256(destino),
        "table_count": len(tabelas),
        "tables": tabelas,
        "quick_check": "ok",
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True)
    p.add_argument("--dest", required=True)
    a = p.parse_args(argv)

    try:
        r = exporta(pathlib.Path(a.source), pathlib.Path(a.dest))
    except ExportacaoRecusada as recusa:
        print(f"RECUSA   {recusa}", file=sys.stderr)
        return 2

    print("=== exportação de state.db ===")
    for chave in ("source_size_bytes", "source_sha256", "dest_size_bytes",
                  "dest_sha256", "table_count", "quick_check"):
        print(f"  {chave:<22}{r[chave]}")
    print(f"  {'tables':<22}{', '.join(r['tables'])}")  # type: ignore[arg-type]
    print("\n  O tamanho do destino PODE diferir da origem: a API de backup"
          "\n  recompacta páginas. O que prova o backup é o quick_check e o esquema.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
