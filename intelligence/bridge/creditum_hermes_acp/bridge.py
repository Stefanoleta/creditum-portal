"""
Fase 3.1b-r1 — a ponte ACP: protocolo oficial, invariante da Creditum.

─── O que ela preserva ───────────────────────────────────────────────────────

    JSON-RPC 2.0 · UTF-8 · uma mensagem por linha · stdio
    stdout   SÓ protocolo
    stderr   SÓ diagnóstico

Nenhum banner humano em stdout. Contaminação de stdout é falha de transporte, não
ruído tolerável: o adapter da 3.1b trata a linha que não é protocolo como erro, e
misturar as duas coisas destruiria a única fronteira que separa dado de apresentação.

─── O que ela acrescenta ─────────────────────────────────────────────────────

Um portão. Antes de `session/prompt` chegar ao modelo, a ponte confere de novo — não
só na inicialização.

A recheca por prompt existe por causa de TOCTOU: entre a pré-checagem e o pedido, o
runtime pode ter injetado ferramenta tarde (MCP, memória, plugin, skill, contexto).
Medir uma vez no começo responderia sobre um estado que já passou.

─── O que ela NÃO faz ────────────────────────────────────────────────────────

Não instala prompt constitucional, não define persona, não escreve regra de negócio —
isso é 3.1c. Não cai para HTTP, não cai para CLI, não cai para `hermes -z`. Fallback
silencioso destrói a auditabilidade: se o ACP não serve, a resposta é recusa, não
outro caminho.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Callable, TextIO

from .capability import BRIDGE_VERSION, CapabilityReport, CapabilityVerdict
from .runtime import preflight

#: Métodos ACP que esta ponte atende. Fechado: método desconhecido é erro JSON-RPC.
#:
#: `session/fork` e `session/resume` NÃO estão aqui de propósito. Se um dia existirem,
#: caem em `METHOD_NOT_FOUND` — que é recusa — em vez de num ramo genérico que
#: reconstruiria um agente sem passar pelo portão.
ACP_METHODS = (
    "initialize",
    "session/new",
    "session/load",
    "session/prompt",
    "session/cancel",
)

#: Operações que criam ou RECONSTROEM um agente. Todas passam pelo mesmo portão, com a
#: mesma autoridade de construção: `enabled_toolsets` explicitamente `[]`.
#:
#: Uma sessão restaurada é um agente novo. Tratar `load` como leitura de estado — e não
#: como construção — deixaria uma sessão salva voltar com as ferramentas do padrão, que
#: é exatamente o caminho pelo qual a postura de zero se perde sem ninguém notar.
SESSION_LIFECYCLE_METHODS = ("session/new", "session/load")

#: Códigos JSON-RPC. `-32000` é a faixa de erro de servidor, e é onde a recusa de
#: capacidade vive: não é erro de protocolo (o pedido estava bem formado), e não é
#: erro do modelo (nenhum modelo foi chamado).
JSONRPC_PARSE_ERROR = -32700
JSONRPC_INVALID_REQUEST = -32600
JSONRPC_METHOD_NOT_FOUND = -32601
JSONRPC_CAPABILITY_REFUSED = -32000


class CreditumAcpBridge:
    """
    Servidor ACP com invariante de capacidade.

    `preflight_fn` é injetável para teste — em produção fica no padrão e a descoberta
    é real. Nenhum teste desta ponte chama modelo.
    """

    def __init__(
        self,
        *,
        stdin: TextIO | None = None,
        stdout: TextIO | None = None,
        stderr: TextIO | None = None,
        preflight_fn: Callable[[], CapabilityReport] | None = None,
    ) -> None:
        self._in = stdin if stdin is not None else sys.stdin
        self._out = stdout if stdout is not None else sys.stdout
        self._err = stderr if stderr is not None else sys.stderr
        self._preflight = preflight_fn if preflight_fn is not None else preflight
        self._cancelled: set[str] = set()

    # ── stdout é sagrado ────────────────────────────────────────────────────

    def _emitir(self, mensagem: dict[str, Any]) -> None:
        """Uma mensagem JSON por linha, e nada mais em stdout. Nunca."""
        self._out.write(json.dumps(mensagem, ensure_ascii=False, separators=(",", ":")))
        self._out.write("\n")
        self._out.flush()

    def _log(self, texto: str) -> None:
        """Diagnóstico vai para stderr. Sempre."""
        self._err.write(f"{texto}\n")
        self._err.flush()

    def _erro(self, ident: Any, codigo: int, mensagem: str, dados: Any = None) -> None:
        corpo: dict[str, Any] = {"code": codigo, "message": mensagem}
        if dados is not None:
            corpo["data"] = dados
        self._emitir({"jsonrpc": "2.0", "id": ident, "error": corpo})

    # ── o portão ────────────────────────────────────────────────────────────

    def _portao(self) -> CapabilityReport:
        """
        A pré-checagem, executada de novo.

        Chamada na inicialização E antes de cada prompt. A segunda chamada é a que
        importa: ela é a diferença entre "estava zero quando começamos" e "está zero
        agora, antes de o modelo ver qualquer coisa".
        """
        return self._preflight()

    # ── despacho ────────────────────────────────────────────────────────────

    def handle(self, mensagem: dict[str, Any]) -> None:
        ident = mensagem.get("id")
        metodo = mensagem.get("method")

        if mensagem.get("jsonrpc") != "2.0" or not isinstance(metodo, str):
            self._erro(ident, JSONRPC_INVALID_REQUEST, "requisição JSON-RPC inválida")
            return

        if metodo == "initialize":
            self._initialize(ident)
            return
        if metodo in SESSION_LIFECYCLE_METHODS:
            self._session_lifecycle(ident, metodo)
            return
        if metodo == "session/cancel":
            self._session_cancel(ident, mensagem.get("params"))
            return
        if metodo == "session/prompt":
            self._session_prompt(ident, mensagem.get("params"))
            return

        self._erro(ident, JSONRPC_METHOD_NOT_FOUND, f"método não atendido: {metodo}")

    def _initialize(self, ident: Any) -> None:
        relatorio = self._portao()
        if not relatorio.compatible:
            # Falha já no `initialize`: a sessão nem chega a existir.
            self._log(f"capacidade recusada: {relatorio.verdict} — {relatorio.detail}")
            self._erro(
                ident,
                JSONRPC_CAPABILITY_REFUSED,
                "runtime incompatível com a postura de zero ferramentas",
                relatorio.to_public_dict(),
            )
            return
        self._emitir(
            {
                "jsonrpc": "2.0",
                "id": ident,
                "result": {
                    "protocolVersion": relatorio.acp_protocol_version,
                    "bridge": {
                        "name": "creditum-hermes-acp",
                        "version": BRIDGE_VERSION,
                        "capability": relatorio.to_public_dict(),
                    },
                    # Nenhuma ferramenta anunciada. A ausência aqui é a afirmação.
                    "agentCapabilities": {"tools": []},
                },
            }
        )

    def _session_lifecycle(self, ident: Any, metodo: str) -> None:
        """
        `session/new` e `session/load`, com o MESMO portão.

        A recusa não distingue as duas: criar e restaurar produzem um agente, e um
        agente que não provou zero ferramentas não existe para esta ponte.
        """
        relatorio = self._portao()
        if not relatorio.compatible:
            self._log(f"{metodo} recusado: {relatorio.verdict} — {relatorio.detail}")
            self._erro(
                ident,
                JSONRPC_CAPABILITY_REFUSED,
                "sessão recusada: postura de zero ferramentas não provada",
                relatorio.to_public_dict(),
            )
            return
        # A id da sessão é derivada do pedido, não sorteada: sorteio tornaria a sessão
        # irreprodutível, e este projeto não sorteia identidade.
        self._emitir(
            {"jsonrpc": "2.0", "id": ident, "result": {"sessionId": f"cred_{ident}"}}
        )

    def _session_cancel(self, ident: Any, params: Any) -> None:
        sessao = params.get("sessionId") if isinstance(params, dict) else None
        if isinstance(sessao, str):
            self._cancelled.add(sessao)
        self._emitir({"jsonrpc": "2.0", "id": ident, "result": {"cancelled": True}})

    def _session_prompt(self, ident: Any, params: Any) -> None:
        sessao = params.get("sessionId") if isinstance(params, dict) else None

        if isinstance(sessao, str) and sessao in self._cancelled:
            self._erro(ident, JSONRPC_CAPABILITY_REFUSED, "sessão cancelada")
            return

        # O portão, DE NOVO. Entre a inicialização e agora, o runtime pode ter ganhado
        # ferramenta. Confiar na medição anterior seria responder sobre um estado que
        # já passou.
        relatorio = self._portao()
        if not relatorio.compatible:
            self._log(f"prompt recusado: {relatorio.verdict} — {relatorio.detail}")
            self._erro(
                ident,
                JSONRPC_CAPABILITY_REFUSED,
                "prompt recusado: superfície de ferramentas mudou",
                relatorio.to_public_dict(),
            )
            return

        # A 3.1b-r1 para aqui de propósito.
        #
        # O contrato de raciocínio é da 3.1c, e chamar o modelo sem ele significaria
        # perguntar sem saber o que se está pedindo. A recusa é explícita e governada —
        # não é um caminho esquecido.
        self._erro(
            ident,
            JSONRPC_CAPABILITY_REFUSED,
            "contrato de raciocínio ausente: Fase 3.1c ainda não instalada",
            {
                **relatorio.to_public_dict(),
                "reason": "REASONING_CONTRACT_NOT_INSTALLED",
            },
        )

    # ── laço ────────────────────────────────────────────────────────────────

    def serve(self) -> int:
        """
        Lê uma mensagem por linha até EOF.

        Linha em branco é ignorada; JSON malformado vira erro de parse SEM derrubar o
        processo, porque derrubar transformaria um pedido ruim numa queda de serviço.
        """
        for linha in self._in:
            texto = linha.strip()
            if not texto:
                continue
            try:
                mensagem = json.loads(texto)
            except json.JSONDecodeError:
                self._erro(None, JSONRPC_PARSE_ERROR, "JSON malformado")
                continue
            if not isinstance(mensagem, dict):
                self._erro(None, JSONRPC_INVALID_REQUEST, "mensagem não é objeto")
                continue
            self.handle(mensagem)
        return 0
