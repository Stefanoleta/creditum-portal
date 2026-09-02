#!/usr/bin/env python3
"""
Portão de higiene de saída do runtime de raciocínio governado.

─── Por que ele existe ───────────────────────────────────────────────────────

Quatro achados HIGH seguidos foram manifestações de UM defeito: material externo
atravessando uma fronteira de texto própria. A regra estava escrita e o sanitizador
existia; o que faltava era a regra ser CONFERIDA em vez de lembrada.

Corrigir cada achado tratava a amostra. Este arquivo trata a classe.

─── O que ele é, dito sem exagero ────────────────────────────────────────────

Análise SINTÁTICA por AST. NÃO é verificação de fluxo de informação: ele não sabe de
onde um valor veio, e não prova que nenhum segredo vaza.

O que ele faz é recusar os padrões que já vazaram — `str(exc)`, `repr(exc)`,
`exc.args`, `type(x).__name__` cru, `!r` em f-string, `.format`, `%`, `json.dumps`
fora das funções governadas. As provas semânticas continuam nos testes adversariais;
os dois se complementam e nenhum substitui o outro.

─── r6-r5: fora a confiança por grafia e por container ───────────────────────

  1. `str(qualquer.resolve())` era isento porque o método se chamava `resolve`.
     Qualquer objeto de terceiro com um método de mesmo nome herdava a isenção.
  2. `json.dumps({...})` era isento porque o argumento era um `ast.Dict`.

As duas caíram. A conferência que precisa de informação de runtime foi movida PARA o
runtime: `governed_uuid_text` confere `type(x) is uuid.UUID`, e
`serialize_safe_public_report` confere um tipo fechado campo a campo.

─── r6-r6: fora a confiança por NOME CURTO ───────────────────────────────────

A r6-r5 identificava o módulo por `Path.stem`. Então `probe.py` e
`anything/probe.py` eram os DOIS o módulo `"probe"`, e um módulo aninhado com o
basename certo e o nome de função certo herdava a autoridade do serializador real.

Era o mesmo defeito das duas rodadas anteriores num terceiro eixo: autoridade por
NOME em vez de IDENTIDADE. Agora toda exceção é autorizada por

    identidade completa do módulo relativa ao pacote governado
  + qualname lexical exato da função

e não existe atalho para nome curto. Um arquivo que não seja filho da raiz governada
FALHA FECHADO: sem identidade, sem exceção.

Sai 0 quando limpo, 1 na primeira violação acumulada.
"""

from __future__ import annotations

import ast
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PACOTE = RAIZ / "bridge" / "creditum_hermes_reasoning"

#: Os sanitizadores GOVERNADOS. Lista explícita: qualquer função começando com
#: `safe_` não serve — o nome não é a garantia.
SANITIZADORES = frozenset({"safe_exception_type", "safe_type_name", "safe_label"})

#: As ÚNICAS funções que podem converter material em texto sem sanitizador acima
#: delas — porque cada uma CONFERE a procedência antes de converter.
#:
#: A chave é (identidade completa do módulo, qualname lexical). Nem basename, nem
#: nome de função solto, nem arquivo:linha — linhas andam e nomes se repetem.
CONVERSORES_GOVERNADOS = frozenset({
    ("creditum_hermes_reasoning.runtime", "safe_type_name"),
    ("creditum_hermes_reasoning.runtime", "safe_exception_type"),
    ("creditum_hermes_reasoning.session", "governed_uuid_text"),
})

#: As ÚNICAS funções que podem chamar `json.dumps`.
#:
#: As três primeiras NÃO são saída: canonicalizam material para hash. A quarta é a
#: única fronteira de saída pública, e é ela que confere o tipo fechado.
SERIALIZADORES_GOVERNADOS = frozenset({
    ("creditum_hermes_reasoning.probe", "serialize_safe_public_report"),
    ("creditum_hermes_reasoning.codex", "governed_user_payload"),
    ("creditum_hermes_reasoning.codex", "request_fingerprint"),
    ("creditum_hermes_reasoning.contract", "_material"),
})

#: Devolvido quando o arquivo não é filho da raiz governada. Nenhuma exceção casa com
#: ele — a ausência de identidade é recusa, não convite.
IDENTIDADE_INDETERMINADA = "<fora-do-pacote-governado>"

REGRAS = {
    "OH001": "str() de valor externo fora de conversor governado",
    "OH002": "repr() de valor externo fora de conversor governado",
    "OH003": "acesso a .args de exceção capturada",
    "OH004": "leitura crua de type(x).__name__ / x.__class__.__name__",
    "OH005": "conversão !r / !s / !a em f-string",
    "OH006": "formatação por .format() ou % com valor externo",
    "OH007": "json.dumps fora das funções de serialização governadas",
}


def module_identity(raiz: pathlib.Path, caminho: pathlib.Path) -> str:
    """
    A ÚNICA autoridade de identidade de módulo do portão.

    `creditum_hermes_reasoning/probe.py`          → creditum_hermes_reasoning.probe
    `creditum_hermes_reasoning/a/probe.py`        → creditum_hermes_reasoning.a.probe
    `creditum_hermes_reasoning/__init__.py`       → creditum_hermes_reasoning
    `creditum_hermes_reasoning/a/__init__.py`     → creditum_hermes_reasoning.a

    O prefixo vem do NOME DA RAIZ VARRIDA, que é um fato do sistema de arquivos —
    quem acrescenta um arquivo ao pacote não escolhe onde o pacote está. Um caminho
    que não seja filho da raiz não recebe identidade nenhuma.
    """
    try:
        rel = caminho.resolve().relative_to(raiz.resolve())
    except ValueError:
        return IDENTIDADE_INDETERMINADA
    partes = list(rel.parts)
    if not partes or not partes[-1].endswith(".py"):
        return IDENTIDADE_INDETERMINADA
    ultimo = partes.pop()[: -len(".py")]
    if ultimo != "__init__":
        partes.append(ultimo)
    return ".".join([raiz.name, *partes])


class Achado:
    __slots__ = ("modulo", "linha", "regra", "onde")

    def __init__(self, modulo: str, linha: int, regra: str, onde: str) -> None:
        self.modulo, self.linha, self.regra, self.onde = modulo, linha, regra, onde

    def __str__(self) -> str:
        # Só localização e identificador de regra. O conteúdo do literal ofensivo NÃO
        # é impresso: um portão de higiene de saída que ecoa o material suspeito
        # criaria o problema que existe para impedir.
        return f"  {self.regra}  {self.modulo}:{self.linha}  em {self.onde}  — {REGRAS[self.regra]}"


class Visitante(ast.NodeVisitor):
    def __init__(self, identidade: str) -> None:
        self.modulo = identidade
        self.achados: list[Achado] = []
        self.pilha: list[str] = []
        self.excecoes: set[str] = set()

    # ── contexto ────────────────────────────────────────────────────────────

    def _onde(self) -> str:
        """
        Qualname LEXICAL, não o nome da função.

        `serialize_safe_public_report` no topo do módulo é uma coisa;
        `wrapper.serialize_safe_public_report` e `Algo.serialize_safe_public_report`
        são outras duas, e nenhuma das duas herda autoridade.
        """
        return ".".join(self.pilha) if self.pilha else "<módulo>"

    def _autorizado(self, allowlist: frozenset) -> bool:
        return (self.modulo, self._onde()) in allowlist

    def _em_conversor(self) -> bool:
        return self._autorizado(CONVERSORES_GOVERNADOS)

    def _em_serializador(self) -> bool:
        return self._autorizado(SERIALIZADORES_GOVERNADOS)

    def _visitar_corpo(self, node, nome: str) -> None:
        self.pilha.append(nome)
        self.generic_visit(node)
        self.pilha.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visitar_corpo(node, node.name)

    def visit_AsyncFunctionDef(self, node) -> None:
        self._visitar_corpo(node, node.name)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        # A classe entra na pilha: um método com o nome de uma função governada tem
        # qualname `Classe.metodo`, que não está em nenhuma allowlist.
        self._visitar_corpo(node, node.name)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        if node.name:
            self.excecoes.add(node.name)
        self.generic_visit(node)

    def _flag(self, node, regra: str) -> None:
        self.achados.append(Achado(self.modulo, node.lineno, regra, self._onde()))

    # ── regras ──────────────────────────────────────────────────────────────

    def visit_Call(self, node: ast.Call) -> None:
        f = node.func
        nome = f.id if isinstance(f, ast.Name) else (f.attr if isinstance(f, ast.Attribute) else "")

        # Sem isenção pela forma do argumento: `str(x)` é `str(x)`, seja x o que for.
        # Quem precisa converter confere a procedência primeiro, e essa conferência é
        # runtime — não cabe numa forma de AST.
        if nome in ("str", "repr") and isinstance(f, ast.Name) and not self._em_conversor():
            self._flag(node, "OH001" if nome == "str" else "OH002")

        if nome == "format" and isinstance(f, ast.Attribute):
            self._flag(node, "OH006")

        # `json.dumps` fora das funções governadas — independentemente do argumento.
        # Inspecionar o argumento seria ensinar um sistema de tipos ao scanner; a
        # fronteira fechada resolve no runtime, que é onde há informação para isso.
        if nome == "dumps" and not self._em_serializador():
            self._flag(node, "OH007")

        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr == "args" and isinstance(node.value, ast.Name) and node.value.id in self.excecoes:
            self._flag(node, "OH003")

        if node.attr == "__name__" and not self._em_conversor():
            base = node.value
            cru = (isinstance(base, ast.Call) and isinstance(base.func, ast.Name) and base.func.id == "type") or (
                isinstance(base, ast.Attribute) and base.attr == "__class__"
            )
            if cru:
                self._flag(node, "OH004")

        self.generic_visit(node)

    def visit_FormattedValue(self, node: ast.FormattedValue) -> None:
        # -1 é "sem conversão". `!r`, `!s` e `!a` executam código do objeto.
        if node.conversion is not None and node.conversion != -1:
            self._flag(node, "OH005")
        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp) -> None:
        if isinstance(node.op, ast.Mod) and isinstance(node.left, (ast.Constant, ast.JoinedStr)):
            if isinstance(node.left, ast.JoinedStr) or type(getattr(node.left, "value", None)) is str:
                self._flag(node, "OH006")
        self.generic_visit(node)


def modulos_de_producao(pacote: pathlib.Path = PACOTE) -> list[pathlib.Path]:
    """
    Descoberta por diretório, e não lista fixa.

    Uma lista fixa não cobre o arquivo que alguém acrescentar amanhã — e é exatamente
    o arquivo novo que ninguém revisa com o mesmo cuidado. `rglob` também alcança
    submódulos aninhados, que passam a receber identidade própria.

    `.py` aqui é DESCOBERTA, não autorização: decide o que é lido, nunca o que é
    isento.
    """
    return sorted(p for p in pacote.rglob("*.py") if "__pycache__" not in p.parts)


def auditar(pacote: pathlib.Path = PACOTE) -> tuple[list[Achado], list[pathlib.Path]]:
    arquivos = modulos_de_producao(pacote)
    achados: list[Achado] = []
    for caminho in arquivos:
        v = Visitante(module_identity(pacote, caminho))
        v.visit(ast.parse(caminho.read_text(encoding="utf-8")))
        achados.extend(v.achados)
    return achados, arquivos


def main() -> int:
    achados, arquivos = auditar()
    if achados:
        sys.stderr.write(f"\n✖ higiene de saída: {len(achados)} violação(ões)\n")
        for a in achados:
            sys.stderr.write(f"{a}\n")
        sys.stderr.write("\n")
        return 1
    sys.stdout.write(
        f"✓ higiene de saída: {len(arquivos)} módulos de produção, nenhum sink inseguro\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
