"""
O guarda de compatibilidade. Falha fechada, e prova em vez de presumir.

─── Por que este módulo existe ─────────────────────────────────────────────────

O adaptador governado depende de UM método interno do Hermes,
`TelegramAdapter._enqueue_text_event`, porque é o último ponto onde a cardinalidade
da mensagem ainda existe. Dependência interna é frágil por natureza. O que este
módulo garante é que a fragilidade seja OBSERVÁVEL e recuse por padrão, em vez de
degradar em silêncio.

─── A prova que a a4-r1 exige, feita onde ela é possível ───────────────────────

O §3 manda provar a ordem: atualização → allowlist → `MessageEvent` →
`_enqueue_text_event`. Essa prova não pode ser feita na máquina de quem escreve o
código — o Hermes não está lá. Mas pode ser feita EM RUNTIME, por AST, sobre o
arquivo realmente instalado. É estritamente melhor do que alguém ler e concluir:

  * `_enqueue_text_event` só é chamado de dentro de `_handle_text_message`;
  * `_handle_text_message` chama `_is_user_authorized_from_message` ANTES;
  * e a chamada de autorização governa um retorno antecipado.

Se qualquer uma dessas três coisas deixar de valer numa versão futura, o registro é
recusado. Não existe queda para o lote nativo no caminho vivo governado.
"""
from __future__ import annotations

import ast
import inspect
from dataclasses import dataclass

#: A ÚNICA versão suportada. Não é mínimo, é igualdade: "funciona na 0.20.4" não é
#: afirmação sobre a 0.20.5, e tratar como se fosse é o defeito.
SUPPORTED_HERMES_VERSION = "0.20.4"

#: Caminho FIXO do adaptador nativo. Não é parâmetro — a d2b custou uma fase inteira
#: para aprender que caminho escolhido pelo chamador é autoridade escolhida pelo
#: chamador.
NATIVE_ADAPTER_MODULE = "plugins.platforms.telegram.adapter"
NATIVE_ADAPTER_CLASS = "TelegramAdapter"

#: Os nomes internos de que dependemos, e o papel de cada um.
METODO_ENFILEIRA = "_enqueue_text_event"
METODO_TRATA_TEXTO = "_handle_text_message"
METODO_AUTORIZA = "_is_user_authorized_from_message"

#: Campos do `MessageEvent` que a captura lê. Ausente é recusa de registro, não
#: `AttributeError` no meio de uma mensagem real.
CAMPOS_EVENTO = ("text", "message_id", "platform_update_id", "timestamp", "source")
CAMPOS_SOURCE = ("platform", "user_id", "chat_id")

#: Identidade da compatibilidade conferida. Entra na evidência de ingresso.
ADAPTER_COMPAT_ID = "creditum_telegram_adapter_compat/0.20.4/v1"


class CompatRefusal(Exception):
    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect


@dataclass(frozen=True)
class CompatibilityProof:
    hermes_version: str
    adapter_compat_id: str
    native_module: str
    native_class: str


def _versao_instalada() -> str:
    try:
        import hermes_cli  # type: ignore[import-not-found]
    except Exception as causa:  # noqa: BLE001
        raise CompatRefusal("HERMES_NOT_IMPORTABLE", type(causa).__name__) from None
    for nome in ("__version__", "VERSION", "version"):
        v = getattr(hermes_cli, nome, None)
        if isinstance(v, str) and v:
            return v
    raise CompatRefusal("HERMES_VERSION_UNKNOWN")


def _classe_nativa() -> type:
    import importlib

    try:
        mod = importlib.import_module(NATIVE_ADAPTER_MODULE)
    except Exception as causa:  # noqa: BLE001
        raise CompatRefusal("NATIVE_ADAPTER_NOT_IMPORTABLE", type(causa).__name__) from None
    cls = getattr(mod, NATIVE_ADAPTER_CLASS, None)
    if not isinstance(cls, type):
        raise CompatRefusal("NATIVE_ADAPTER_CLASS_MISSING", NATIVE_ADAPTER_CLASS)
    return cls


def _prova_ordem_de_autorizacao(cls: type) -> None:
    """
    A prova do §3, por AST sobre a fonte instalada.

    Não movo autorização para código da Creditum — apenas verifico que o ponto de
    interceptação é alcançável somente depois dela.
    """
    try:
        fonte = inspect.getsource(cls)
    except (OSError, TypeError) as causa:
        raise CompatRefusal("NATIVE_SOURCE_UNAVAILABLE", type(causa).__name__) from None

    try:
        arvore = ast.parse(inspect.cleandoc(fonte)) if fonte.startswith(" ") else ast.parse(fonte)
    except SyntaxError as causa:  # noqa: BLE001
        raise CompatRefusal("NATIVE_SOURCE_UNPARSEABLE", type(causa).__name__) from None

    metodos: dict[str, ast.AST] = {}
    for no in ast.walk(arvore):
        if isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef)):
            metodos.setdefault(no.name, no)

    for nome in (METODO_ENFILEIRA, METODO_TRATA_TEXTO, METODO_AUTORIZA):
        if nome not in metodos:
            raise CompatRefusal("NATIVE_METHOD_MISSING", nome)

    # (1) `_enqueue_text_event` é chamado SOMENTE de dentro de `_handle_text_message`.
    #     Outro chamador seria outro caminho — possivelmente sem allowlist.
    chamadores: set[str] = set()
    for nome, no in metodos.items():
        for x in ast.walk(no):
            if isinstance(x, ast.Call):
                f = x.func
                alvo = f.attr if isinstance(f, ast.Attribute) else (
                    f.id if isinstance(f, ast.Name) else None)
                if alvo == METODO_ENFILEIRA:
                    chamadores.add(nome)
    if chamadores != {METODO_TRATA_TEXTO}:
        raise CompatRefusal(
            "NATIVE_ENQUEUE_CALLERS_UNEXPECTED", ",".join(sorted(chamadores)) or "nenhum")

    # ─── (2) e (3) o PORTÃO DOMINANTE ────────────────────────────────────────
    #
    # A r1 conferia "a autorização aparece antes" e "existe um `if` com `return`".
    # As duas coisas são verdade na forma INVERTIDA, que é o oposto do que se quer:
    #
    #     if self._is_user_authorized_from_message(message):
    #         return
    #     self._enqueue_text_event(event)     # ← o NÃO autorizado cai aqui
    #
    # Ordem textual não é semântica. O que precisa ser provado é DOMINAÇÃO: todo
    # caminho até o enfileiramento passa pelo ramo AUTORIZADO. Com a versão fixada em
    # 0.20.4, cabe prova estrutural exata em vez de heurística.
    trata = metodos[METODO_TRATA_TEXTO]
    corpo = list(getattr(trata, "body", []))

    def _chamadas(no: ast.AST) -> set[str]:
        nomes: set[str] = set()
        for x in ast.walk(no):
            if isinstance(x, ast.Call):
                f = x.func
                alvo = f.attr if isinstance(f, ast.Attribute) else (
                    f.id if isinstance(f, ast.Name) else None)
                if alvo is not None:
                    nomes.add(alvo)
        return nomes

    def _e_chamada_de_autorizacao(no: ast.AST) -> bool:
        """`auth(...)`, `await auth(...)` — e nada mais."""
        alvo = no.value if isinstance(no, ast.Await) else no
        if not isinstance(alvo, ast.Call):
            return False
        f = alvo.func
        nome = f.attr if isinstance(f, ast.Attribute) else (
            f.id if isinstance(f, ast.Name) else None)
        return nome == METODO_AUTORIZA

    def _termina_incondicionalmente(bloco: list[ast.stmt]) -> bool:
        """O bloco SEMPRE sai: último comando é `return` ou `raise`."""
        return bool(bloco) and isinstance(bloco[-1], (ast.Return, ast.Raise))

    # O portão tem de ser um comando de PRIMEIRO NÍVEL do método. Aninhado noutra
    # condicional, ele deixaria de dominar os caminhos irmãos.
    indice_portao = -1
    for i, comando in enumerate(corpo):
        if not isinstance(comando, ast.If):
            continue
        teste = comando.test
        # EXATAMENTE `not <chamada de autorização>`. A forma positiva é recusada.
        if not (isinstance(teste, ast.UnaryOp) and isinstance(teste.op, ast.Not)
                and _e_chamada_de_autorizacao(teste.operand)):
            continue
        if comando.orelse:
            # Um `else` significa que o não autorizado tem continuação. Recusa.
            continue
        if not _termina_incondicionalmente(comando.body):
            continue
        if METODO_ENFILEIRA in _chamadas(comando):
            # Enfileirar dentro do ramo NÃO autorizado é o defeito ao contrário.
            raise CompatRefusal("NATIVE_ENQUEUE_INSIDE_UNAUTHORIZED_BRANCH")
        indice_portao = i
        break

    if indice_portao < 0:
        # Ou não há portão, ou ele é da forma invertida / não dominante. As três
        # merecem o mesmo desfecho, e o nome diz o que se procurava.
        raise CompatRefusal("NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")

    # A autorização não pode aparecer em MAIS lugar nenhum: uma segunda chamada com
    # outra polaridade reabriria exatamente o buraco que este bloco fecha.
    ocorrencias = 0
    for x in ast.walk(trata):
        if isinstance(x, ast.Call):
            f = x.func
            alvo = f.attr if isinstance(f, ast.Attribute) else (
                f.id if isinstance(f, ast.Name) else None)
            if alvo == METODO_AUTORIZA:
                ocorrencias += 1
    if ocorrencias != 1:
        raise CompatRefusal("NATIVE_AUTHORIZATION_CALL_AMBIGUOUS", str(ocorrencias))

    # Nada de enfileiramento ANTES do portão.
    for comando in corpo[:indice_portao]:
        if METODO_ENFILEIRA in _chamadas(comando):
            raise CompatRefusal("NATIVE_ENQUEUE_BEFORE_AUTHORIZATION")

    # E o enfileiramento tem de existir DEPOIS dele, na continuação autorizada.
    depois = any(METODO_ENFILEIRA in _chamadas(c) for c in corpo[indice_portao + 1:])
    if not depois:
        raise CompatRefusal("NATIVE_ENQUEUE_NOT_ON_AUTHORIZED_PATH")


def _prova_forma_do_metodo(cls: type) -> None:
    metodo = getattr(cls, METODO_ENFILEIRA, None)
    if not callable(metodo):
        raise CompatRefusal("NATIVE_METHOD_NOT_CALLABLE", METODO_ENFILEIRA)
    try:
        parametros = list(inspect.signature(metodo).parameters)
    except (TypeError, ValueError) as causa:
        raise CompatRefusal("NATIVE_SIGNATURE_UNAVAILABLE", type(causa).__name__) from None
    # `self` mais o evento. Assinatura diferente é contrato diferente.
    if len(parametros) != 2:
        raise CompatRefusal("NATIVE_SIGNATURE_UNEXPECTED", ",".join(parametros))


def verify_compatibility(event_type: type | None = None) -> CompatibilityProof:
    """
    Prova tudo, ou recusa. Chamado ANTES de qualquer registro de plataforma.

    `event_type` é opcional apenas porque o tipo de evento pode ser resolvido pelo
    próprio Hermes; quando fornecido, seus campos são conferidos.
    """
    versao = _versao_instalada()
    if versao != SUPPORTED_HERMES_VERSION:
        raise CompatRefusal("HERMES_VERSION_NOT_SUPPORTED",
                            f"{versao} != {SUPPORTED_HERMES_VERSION}")
    cls = _classe_nativa()
    _prova_forma_do_metodo(cls)
    _prova_ordem_de_autorizacao(cls)

    if event_type is not None:
        for campo in CAMPOS_EVENTO:
            if not (hasattr(event_type, campo) or campo in getattr(
                    event_type, "__annotations__", {})):
                raise CompatRefusal("EVENT_FIELD_MISSING", campo)

    return CompatibilityProof(
        hermes_version=versao, adapter_compat_id=ADAPTER_COMPAT_ID,
        native_module=NATIVE_ADAPTER_MODULE, native_class=NATIVE_ADAPTER_CLASS,
    )
