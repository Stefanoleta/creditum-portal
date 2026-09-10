#!/usr/bin/env python3
"""
D2E-A8 §7 — classifica `/data` para migração. NÃO copia, NÃO lê segredo, NÃO escreve.

    /opt/venv/bin/python3 -B deploy/vps/classify-data-inventory.py --root /data

Emite um inventário com classe por caminho. Nada é movido, e o que é segredo é
classificado pelo NOME — o conteúdo nunca é aberto.

─── Por que classificar em vez de copiar a árvore ──────────────────────────────

Migrar `/data` inteiro parece a escolha segura e é a arriscada: leva estado que
ninguém governou, leva log com valor sensível dentro, e leva banco copiado a quente.
O §7 do brief pede método, e método significa que cada caminho tem de ter uma razão
declarada para vir ou ficar.

─── O que este script NÃO decide ───────────────────────────────────────────────

`DESCOBERTA` não é "provavelmente pode vir". É recusa de opinar: quando o
repositório não tem evidência do que um caminho contém ou de quem depende dele, o
script diz isso e para. Classificar por palpite seria pior que não classificar.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

OBRIGATORIO = "OBRIGATORIO"
OPCIONAL = "OPCIONAL"
NAO_MIGRAR = "NAO_MIGRAR"
DESCOBERTA = "DESCOBERTA_NECESSARIA"

#: Regras por caminho relativo à raiz. Ordem: a primeira que casa vence, então o
#: específico vem antes do genérico.
REGRAS: tuple[tuple[str, str, str], ...] = (
    ("config.yaml", OBRIGATORIO,
     "config do gateway. Vai por CÓPIA CONTROLADA com hash na origem e no destino, "
     "mais o remendo mínimo `plugins.enabled: [telegram-platform]`. Nada mais é "
     "reconstruído."),

    (".env", OBRIGATORIO,
     "credenciais. Classificado pelo NOME; o conteúdo não é lido por este script e "
     "não entra em git, artefato, log nem terminal. Transferência por env_file "
     "protegido na VPS, 0600, provisionado à mão pelo operador."),

    ("plugins", OBRIGATORIO,
     "raiz de plugin de USUÁRIO. O plugin governado do Telegram é instalado aqui, e "
     "o diretório exato vem do manifesto de implantação aprovado — não deste script."),

    ("state.db", DESCOBERTA,
     "é o store do SessionManager DE FÁBRICA (`load_session`/`resume_session`/"
     "`fork_session`), lazy em `_get_db()`. A via governada da Creditum NÃO o usa: "
     "`session.py` é uso único, em memória, sem SessionDB e sem restauração. Mas se "
     "o GATEWAY degrada sem ele, isso não está observado. E cópia a quente de SQLite "
     "com escritor ativo é inconsistente — exigiria `VACUUM INTO` ou a API de backup, "
     "com o Managed parado. Não resolvido: não copiar agora."),

    ("creditum_hermes_runtime/r6_r6", NAO_MIGRAR,
     "runtime histórico CONGELADO. Não é modificado e não é levado: ele é evidência "
     "de uma implantação que aconteceu, e evidência se arquiva, não se replica."),

    ("creditum_hermes_runtime", DESCOBERTA,
     "contém as implantações d2d e o livro-razão de execução da d2b. O livro-razão "
     "guarda `execution_id` consumidos, e proteção contra repetição DURÁVEL depende "
     "dele: migrar sem levá-lo permitiria reexecutar uma mensagem já executada. "
     "Quais subdiretórios são livro-razão ativo e quais são histórico precisa ser "
     "enumerado no ato da migração, não presumido aqui."),

    ("cron", DESCOBERTA,
     "nunca observado. Tarefa agendada que sobrevive à migração pode virar segundo "
     "produtor de efeito, e segundo produtor é exatamente o que a cutover proíbe."),

    ("logs", OPCIONAL,
     "histórico operacional. Pode conter valor sensível em texto, então não vai por "
     "cópia cega: se for levado, é por decisão explícita e para fora do container."),

    ("gateway-starts.log", OPCIONAL,
     "evidência de arranque que a a7-r1 usou para provar persistência. Útil como "
     "histórico, irrelevante para o funcionamento."),

    ("hooks", NAO_MIGRAR,
     "existe e está VAZIO no Managed, e nada o referencia. Levar diretório inerte "
     "sugere um mecanismo de gancho que não existe."),
)


def classifica(rel: str) -> tuple[str, str]:
    for prefixo, classe, razao in REGRAS:
        if rel == prefixo or rel.startswith(prefixo + os.sep):
            return classe, razao
    return DESCOBERTA, "não previsto por nenhuma regra: enumerar antes de decidir"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", default="/data")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)

    raiz = pathlib.Path(a.root)
    if not raiz.is_dir():
        print(f"raiz inexistente: {raiz}", file=sys.stderr)
        return 2

    itens: list[dict[str, object]] = []
    for entrada in sorted(raiz.iterdir()):
        rel = entrada.name
        classe, razao = classifica(rel)
        tipo = ("symlink" if entrada.is_symlink()
                else "dir" if entrada.is_dir() else "file")
        # Tamanho apenas; nada é aberto. `.env` e `state.db` não são lidos.
        try:
            tamanho = entrada.stat().st_size if tipo == "file" else None
        except OSError:
            tamanho = None
        itens.append({"path": rel, "type": tipo, "size_bytes": tamanho,
                      "class": classe, "reason": razao})

    if a.json:
        print(json.dumps({"root": str(raiz), "items": itens}, indent=2,
                         ensure_ascii=False))
        return 0

    print(f"=== inventário de {raiz} — SOMENTE LEITURA, nada copiado ===")
    for i in itens:
        print(f"\n  {i['path']}  [{i['type']}]  {i['class']}")
        print(f"    {i['reason']}")
    pendentes = [i for i in itens if i["class"] == DESCOBERTA]
    print(f"\n  {len(itens)} entradas · {len(pendentes)} exigem descoberta")
    if pendentes:
        print("  A migração NÃO pode ser executada enquanto houver pendência:")
        for i in pendentes:
            print(f"    {i['path']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
