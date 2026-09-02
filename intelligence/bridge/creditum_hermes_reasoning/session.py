"""
Fase 3.1d-b — sessão de USO ÚNICO, em memória, propriedade da Creditum.

Sem `SessionManager` de fábrica. Sem `SessionDB`. Sem restauração. Sem fork.

─── Por que uso único ───────────────────────────────────────────────────────

A 3.1d-a observou que o fluxo de fábrica persiste em `/data/state.db` e que
`get_session()` pode RESTAURAR uma sessão conhecida daquele banco. Uma sessão que
sobrevive é uma sessão que pode voltar com histórico que ninguém governou.

Uso único remove a pergunta: não há segundo turno, não há retomada, não há o que
restaurar.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field

from .runtime import APPROVED_HERMES_HOME, governed_cwd_ok, safe_type_name

#: Mantido como alias do nome governado. A autoridade mora em `runtime.py`, e uma
#: segunda constante aqui seria uma segunda regra sobre o mesmo caminho.
GOVERNED_CWD = APPROVED_HERMES_HOME

#: Único tipo de bloco aceito na 3.1d. Áudio e imagem são aceitos pelo ACP 0.9.0, e o
#: conversor de fábrica não tem ramo para áudio — aceitar seria confiar num caminho
#: que ninguém observou.
ALLOWED_CONTENT_BLOCK = "text"

STATES = ("NEW", "RUNNING", "PROBED", "SUCCEEDED", "FAILED", "CANCELLED")


class SessionDefect:
    SESSION_NOT_NEW = "SESSION_NOT_NEW"
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
    SESSION_ALREADY_RUNNING = "SESSION_ALREADY_RUNNING"
    CWD_NOT_ALLOWED = "CWD_NOT_ALLOWED"
    MCP_NOT_ALLOWED = "MCP_NOT_ALLOWED"
    MULTIMODAL_NOT_ALLOWED = "MULTIMODAL_NOT_ALLOWED"
    PROMPT_SHAPE_NOT_ALLOWED = "PROMPT_SHAPE_NOT_ALLOWED"
    METHOD_NOT_AVAILABLE = "METHOD_NOT_AVAILABLE"
    SESSION_ID_NOT_GOVERNED = "SESSION_ID_NOT_GOVERNED"


class SessionRefusal(Exception):
    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect
        self.detail = detail


@dataclass
class CreditumSession:
    """Estado de sessão. Histórico sempre vazio: não existe segundo turno."""

    session_id: str
    state: str = "NEW"
    agent: object | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


def assert_no_mcp(mcp_servers: object) -> None:
    """`None` ou lista vazia canônica. Qualquer pedido de MCP é recusa."""
    if mcp_servers is None:
        return
    if type(mcp_servers) is list and len(mcp_servers) == 0:
        return
    raise SessionRefusal(SessionDefect.MCP_NOT_ALLOWED)


def single_text_prompt(blocos: object) -> str:
    """
    Exatamente UM bloco de texto. Qualquer outra forma é recusa.

    Não concatena vários blocos: dois blocos de texto seriam dois payloads, e juntá-los
    apagaria a diferença entre um pedido governado e dois pedidos empilhados.
    """
    if type(blocos) is not list or len(blocos) != 1:
        raise SessionRefusal(
            SessionDefect.PROMPT_SHAPE_NOT_ALLOWED,
            f"{0 if type(blocos) is not list else len(blocos)} blocos",
        )
    b = blocos[0]
    tipo = b.get("type") if type(b) is dict else getattr(b, "type", None)
    if tipo != ALLOWED_CONTENT_BLOCK:
        # `tipo` vem do bloco ACP do chamador. `str()` executaria o `__str__` dele.
        raise SessionRefusal(SessionDefect.MULTIMODAL_NOT_ALLOWED, safe_type_name(tipo))
    texto = b.get("text") if type(b) is dict else getattr(b, "text", None)
    if type(texto) is not str or not texto:
        raise SessionRefusal(SessionDefect.PROMPT_SHAPE_NOT_ALLOWED, "texto vazio")
    return texto


def governed_uuid_text(valor: object) -> str:
    """
    Texto de um UUID — depois de provar que é UM UUID.

    O formato hifenizado de 36 caracteres é GOVERNADO (há teste que o afirma), então
    `.hex` mudaria o identificador em silêncio. A conversão fica, mas deixa de valer
    por grafia: `type(valor) is uuid.UUID` é procedência, e um objeto de terceiro com
    um método chamado `uuid4` não a alcança.

    `type(...) is` e não `isinstance`: uma subclasse herdaria a permissão sem herdar a
    intenção, e o `__str__` dela é dela.
    """
    if type(valor) is not uuid.UUID:
        raise SessionRefusal(SessionDefect.SESSION_ID_NOT_GOVERNED)
    return str(valor)


class CreditumSessionStore:
    """Mapa em memória. Nada persiste, nada é restaurado."""

    def __init__(self) -> None:
        self._sessions: dict[str, CreditumSession] = {}
        self._lock = threading.Lock()

    def create(self, cwd: object, mcp_servers: object = None) -> CreditumSession:
        if not governed_cwd_ok(cwd):
            raise SessionRefusal(SessionDefect.CWD_NOT_ALLOWED)
        assert_no_mcp(mcp_servers)
        # UUID novo sempre. Nunca uma id derivada de pedido, que poderia colidir com
        # uma sessão anterior e trazer estado que ninguém governou.
        s = CreditumSession(session_id=governed_uuid_text(uuid.uuid4()))
        with self._lock:
            self._sessions[s.session_id] = s
        return s

    def get(self, session_id: object) -> CreditumSession:
        if type(session_id) is not str:
            raise SessionRefusal(SessionDefect.SESSION_NOT_FOUND)
        with self._lock:
            s = self._sessions.get(session_id)
        if s is None:
            raise SessionRefusal(SessionDefect.SESSION_NOT_FOUND)
        return s

    def begin_prompt(self, session_id: object) -> CreditumSession:
        """
        `NEW → RUNNING`, e mais nada.

        Segundo prompt na mesma sessão é recusa, inclusive depois de sucesso. É o que
        torna a sessão de uso único uma propriedade e não uma intenção.
        """
        s = self.get(session_id)
        with s.lock:
            if s.state == "RUNNING":
                raise SessionRefusal(SessionDefect.SESSION_ALREADY_RUNNING)
            if s.state != "NEW":
                raise SessionRefusal(SessionDefect.SESSION_NOT_NEW, s.state)
            s.state = "RUNNING"
        return s

    def settle(self, session_id: str, state: str) -> None:
        if state not in STATES:  # pragma: no cover
            raise SessionRefusal(SessionDefect.SESSION_NOT_FOUND, state)
        s = self.get(session_id)
        with s.lock:
            s.state = state

    def cancel(self, session_id: object) -> CreditumSession:
        """Cancelar só faz sentido para sessão EM EXECUÇÃO. Estado terminal, sem retomada."""
        s = self.get(session_id)
        with s.lock:
            if s.state != "RUNNING":
                raise SessionRefusal(SessionDefect.SESSION_NOT_NEW, s.state)
            s.state = "CANCELLED"
        return s
