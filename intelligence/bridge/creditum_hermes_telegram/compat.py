"""
O guarda de compatibilidade. Falha fechada, e prova em vez de presumir.

─── Por que este módulo existe ─────────────────────────────────────────────────

O adaptador governado depende de UM método interno do Hermes,
`TelegramAdapter._enqueue_text_event`, porque é o último ponto onde a cardinalidade
da mensagem ainda existe. Dependência interna é frágil por natureza. O que este
módulo garante é que a fragilidade seja OBSERVÁVEL e recuse por padrão, em vez de
degradar em silêncio.

─── O que a r6 mudou, e por quê ────────────────────────────────────────────────

Até a r5 este arquivo afirmava que `_enqueue_text_event` tinha UM chamador nativo,
`_handle_text_message`. Contra o Hermes 0.20.4 GENUÍNO isso é falso: há DOIS.
`_handle_command` roteia colagens de comando longas pelo mesmo pipeline de lote,
para não órfãos as continuações que o Telegram divide.

O guarda estava certo em recusar — ele recusou, em vez de registrar e descobrir
depois. Errado estava o CONTRATO que ele certificava. A r6 corrige o contrato para
o conjunto medido, e continua exigindo IGUALDADE: um terceiro chamador numa versão
futura recusa, e a remoção de um dos dois também.

Junto vieram duas outras divergências medidas contra o genuíno:

  * os manipuladores nativos são `async def (self, update, context)` — dois
    parâmetros, não um. A sobrescrita da r5 declarava `(self, message)`, e o
    python-telegram-bot a chamaria com dois;
  * o limiar de divisão é `_SPLIT_THRESHOLD = 4000`, atributo da classe nativa.
    Não é 4096, e não é política da Creditum: é evidência de compatibilidade.

─── A prova, feita onde ela é possível ─────────────────────────────────────────

A prova de ordem não pode ser feita na máquina de quem escreve o código — o Hermes
não está lá. Mas pode ser feita EM RUNTIME, por AST, sobre o arquivo realmente
instalado. É estritamente melhor do que alguém ler e concluir:

  * `_enqueue_text_event` é chamado por EXATAMENTE os dois manipuladores conhecidos;
  * CADA um deles chama `_is_user_authorized_from_message` num portão DOMINANTE;
  * e o enfileiramento só existe na continuação autorizada.

A fonte do módulo é lida UMA vez e a árvore é derivada UMA vez. Ler duas vezes o
que se deve ler uma foi o defeito da d1-r1 e da a6-r3; não o repito aqui.
"""
from __future__ import annotations

import ast
import hashlib
import inspect
import sys
import textwrap
from dataclasses import dataclass

#: A ÚNICA versão suportada. Não é mínimo, é igualdade: "funciona na 0.20.4" não é
#: afirmação sobre a 0.20.5, e tratar como se fosse é o defeito.
SUPPORTED_HERMES_VERSION = "0.20.4"

#: Caminho FIXO do adaptador nativo. Não é parâmetro — a d2b custou uma fase inteira
#: para aprender que caminho escolhido pelo chamador é autoridade escolhida pelo
#: chamador. É também o módulo que carrega o `register()` do plugin embutido.
NATIVE_ADAPTER_MODULE = "plugins.platforms.telegram.adapter"
NATIVE_ADAPTER_CLASS = "TelegramAdapter"
NATIVE_BUNDLED_REGISTER = "register"
NATIVE_REGISTER_PLATFORM = "register_platform"

#: Os nomes internos de que dependemos, e o papel de cada um.
METODO_ENFILEIRA = "_enqueue_text_event"
METODO_TRATA_TEXTO = "_handle_text_message"
METODO_TRATA_COMANDO = "_handle_command"
METODO_AUTORIZA = "_is_user_authorized_from_message"
METODO_ENTREGA = "handle_message"

#: A FONTE ÚNICA de registro de handlers no python-telegram-bot. É por aqui que a
#: admissão governada nasce (a4-r6d), e é o que torna a origem uma fronteira: se os
#: manipuladores pudessem ser alcançados por outro caminho, um método nomeado
#: voltaria a ser a porta.
METODO_REGISTRA_HANDLERS = "_register_handlers"
PARAMETROS_DO_REGISTRO_DE_HANDLERS = ("self", "app")

#: O ciclo de vida que CONSTRÓI a Application genuína e só então registra. É o único
#: lugar de onde a capacidade de registro pode nascer — medido: as duas chamadas a
#: `_register_handlers` na 0.20.4 estão aqui dentro, e as duas passam `self._app`,
#: o objeto que o `builder.build()` acabou de produzir.
METODO_CONECTA = "connect"
ATRIBUTO_APLICACAO = "_app"

#: O método que PRODUZ a Application. `self._app = <builder>.build()` é a única forma
#: de atribuição aceita dentro do `connect`, e é o que liga o objeto registrado ao
#: construtor nativo em vez de a qualquer coisa que alguém tenha deixado no atributo.
METODO_CONSTROI_APP = "build"

#: A PROVENIÊNCIA do construtor. Medido na 0.20.4: o símbolo nasce de
#: `Application.builder()` e é reatribuído quatro vezes por encadeamento fluente
#: (`builder = builder.base_url(...)` etc.). Proibir reatribuição rejeitaria o
#: genuíno; o que vale é o ENRAIZAMENTO.
#: ─── O SELO ESTRUTURAL do `connect` nativo (a4-r6h) ─────────────────────────
#:
#: As rodadas r6d–r6g fecharam derivas do ciclo de vida uma a uma, por análise
#: semântica: quem chama, com que argumento, de onde veio o valor. Cada rodada
#: fechou a forma que a anterior deixou passar, e a última caiu num `AnnAssign` —
#: `builder: object = self.app_do_chamador` — porque o parser só olhava `ast.Assign`.
#:
#: Enumerar formas de ligação do Python é um jogo que não se ganha: `AugAssign`,
#: walrus, alvo de `for`, `with ... as`, desempacotamento de tupla, e o que a
#: linguagem acrescentar depois. Cada construto novo é um furo esperando.
#:
#: O runtime aprovado é FECHADO e fixado por versão. Então a fronteira deixa de ser
#: "reconheço todo programa equivalente" e passa a ser "esta é EXATAMENTE a função
#: que auditei". Qualquer mudança executável muda o dígito, e o dígito recusa.
#:
#: O selo é ligado ao interpretador: a representação de AST muda entre versões do
#: Python, então a versão entra no texto canônico. Rodar noutra versão diverge e
#: recusa — o que é correto, porque o runtime é fixado em 3.13.15.
#: Obtido com a função `canoniza` DESTE arquivo, aplicada à `connect` da 0.20.4
#: genuína em CPython 3.13.15, e reproduzido três vezes de forma independente. Na
#: primeira tentativa eu o computei com uma canonicalização ligeiramente diferente
#: da que embarquei, e a prova genuína recusou — o que é o guarda funcionando
#: contra o próprio autor. O único validador real deste literal é a prova contra o
#: runtime genuíno; o teste local que o fixa é tripwire contra edição acidental,
#: não prova.
SELO_DO_CONNECT = "378631d531a782c5e8aacbc85e9fdac02a4cd0275611b916d50830cfc2a24f7b"

PRODUTOR_DA_APLICACAO = "Application"
METODO_PRODUTOR = "builder"
MODULO_DO_PRODUTOR = "telegram.ext"

#: A fábrica nativa aplica o modo de notificação DEPOIS de construir o adaptador.
#: `_notifications_mode` não tem default na classe, então omitir esse passo deixaria
#: o atributo ausente. Herdamos o passo em vez de reimplementá-lo.
RESOLVEDOR_DE_NOTIFICACAO = "_resolve_notifications_mode"

#: Os chamadores nativos PERMITIDOS do enfileiramento. Igualdade, não contenção:
#: um a mais é caminho não revisado, um a menos é contrato mudado. Os dois recusam.
CHAMADORES_DO_ENFILEIRAMENTO = frozenset({METODO_TRATA_TEXTO, METODO_TRATA_COMANDO})

#: A FORMA DE ENTREGA de cada manipulador governado, medida na 0.20.4 genuína:
#: (chamadas a `_enqueue_text_event`, chamadas a `handle_message`).
#:
#: O `_handle_command` tem DUAS formas de entrega — enfileira o comando longo e
#: entrega o curto direto. A a4-r6b só cobria a primeira, e a admissão não usada
#: seguia ativa durante a entrega direta. Fixar a forma aqui é o que faz uma via de
#: entrega nova pedir revisão em vez de herdar autoridade em silêncio.
FORMAS_DE_ENTREGA = {
    "_handle_text_message": (1, 0),
    "_handle_command": (1, 1),
}

#: Assinatura dos manipuladores, como o python-telegram-bot os invoca.
PARAMETROS_DO_MANIPULADOR = ("self", "update", "context")

#: O limiar nativo que roteia comando longo para o pipeline de lote. Lido da classe
#: instalada; nunca escrito como número aqui.
ATRIBUTO_LIMITE_DE_DIVISAO = "_SPLIT_THRESHOLD"

#: A chave do registro de plataformas e seu rótulo. A a8-r3 mediu que o Hermes NÃO
#: deriva a chave de nada: `entries[entry.name] = entry`, verbatim. Então a chave é
#: ESCOLHIDA, e estas constantes são a escolha governada. O guarda confere a escolha
#: contra o que o plugin embutido registra, e recusa na divergência — é isso que
#: torna "vencer o registro" uma afirmação medida em vez de uma esperança.
PLATFORM_NAME = "telegram"
PLATFORM_LABEL = "Telegram"

#: Os campos que a entrada governada aceita HERDAR do registro embutido.
#:
#: Allowlist positiva, e a a6 custou quatro rodadas para aprender por que: uma lista
#: do que é proibido deixa passar o que ninguém listou. Herdar campos operacionais é
#: certo — sem eles a entrada governada derrubaria entrega de cron, allowlist por env,
#: config em yaml e envio autônomo, em silêncio. Mas herdar um campo NOVO, que uma
#: versão futura acrescente carregando autoridade que ninguém revisou, é o mesmo
#: defeito com outra roupa. Campo desconhecido RECUSA e pede revisão.
CAMPOS_HERDAVEIS = frozenset({
    "name", "label", "adapter_factory", "check_fn", "validate_config",
    "ensure_deps_fn", "is_connected", "required_env", "install_hint", "setup_fn",
    "apply_yaml_config_fn", "allowed_users_env", "allow_all_env",
    "cron_deliver_env_var", "standalone_sender_fn", "max_message_length",
    "emoji", "allow_update_command",
})

#: Medido na a4-r6a contra o `create_adapter` genuíno: destes campos, `ensure_deps_fn`
#: é o ÚNICO que alcança `tools.lazy_deps.ensure(..., prompt=False)`, ou seja, o único
#: que instala pacotes no venv ativo em runtime. Os outros seis chamáveis estão limpos.
CAMPO_COM_AUTORIDADE_DE_INSTALACAO = "ensure_deps_fn"

#: Campos do `MessageEvent` que a captura lê. Ausente é recusa de registro, não
#: `AttributeError` no meio de uma mensagem real.
CAMPOS_EVENTO = ("text", "message_id", "platform_update_id", "timestamp", "source")
CAMPOS_SOURCE = ("platform", "user_id", "chat_id")

#: Identidade da compatibilidade conferida. Entra na evidência de ingresso.
#:
#: v1 certificava o contrato de UM chamador nativo, que o runtime genuíno refutou.
#: Redefinir v1 em silêncio faria a evidência antiga descrever um contrato que já não
#: existe, e todo artefato selado com v1 passaria a mentir. v2 é contrato novo.
ADAPTER_COMPAT_ID = "creditum_telegram_adapter_compat/0.20.4/v2"


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
    #: Os chamadores medidos, em ordem estável. Evidência, não configuração.
    native_enqueue_callers: tuple[str, ...]
    #: O limiar nativo, medido. O teste de comando longo usa ESTE valor.
    native_split_threshold: int
    #: A chave e o rótulo conferidos contra o registro embutido.
    platform_name: str
    platform_label: str


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


def _modulo_nativo():
    import importlib

    try:
        return importlib.import_module(NATIVE_ADAPTER_MODULE)
    except Exception as causa:  # noqa: BLE001
        raise CompatRefusal("NATIVE_ADAPTER_NOT_IMPORTABLE", type(causa).__name__) from None


def _classe_nativa() -> type:
    mod = _modulo_nativo()
    cls = getattr(mod, NATIVE_ADAPTER_CLASS, None)
    if not isinstance(cls, type):
        raise CompatRefusal("NATIVE_ADAPTER_CLASS_MISSING", NATIVE_ADAPTER_CLASS)
    return cls


# ─── uma leitura, uma árvore ─────────────────────────────────────────────────────


def _arvore_do_modulo_nativo() -> ast.Module:
    """
    Lê a fonte do módulo nativo UMA vez e devolve UMA árvore.

    Tanto a prova de ordem (dentro da classe) quanto a prova do registro embutido
    (função de módulo) saem desta árvore. Duas leituras seriam duas verdades
    possíveis, e a que vale seria a última — o defeito que a a6-r3 fechou.
    """
    mod = _modulo_nativo()
    try:
        fonte = inspect.getsource(mod)
    except (OSError, TypeError) as causa:
        raise CompatRefusal("NATIVE_SOURCE_UNAVAILABLE", type(causa).__name__) from None
    try:
        return ast.parse(fonte)
    except SyntaxError as causa:  # noqa: BLE001
        raise CompatRefusal("NATIVE_SOURCE_UNPARSEABLE", type(causa).__name__) from None


def _no_da_classe(arvore: ast.Module) -> ast.ClassDef:
    for no in arvore.body:
        if isinstance(no, ast.ClassDef) and no.name == NATIVE_ADAPTER_CLASS:
            return no
    raise CompatRefusal("NATIVE_ADAPTER_CLASS_MISSING", NATIVE_ADAPTER_CLASS)


def _metodos(classe: ast.ClassDef) -> dict[str, ast.AST]:
    metodos: dict[str, ast.AST] = {}
    for no in classe.body:
        if isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef)):
            metodos.setdefault(no.name, no)
    return metodos


def _alvo(chamada: ast.Call) -> str | None:
    f = chamada.func
    if isinstance(f, ast.Attribute):
        return f.attr
    return f.id if isinstance(f, ast.Name) else None


def _chamadas(no: ast.AST) -> set[str]:
    nomes: set[str] = set()
    for x in ast.walk(no):
        if isinstance(x, ast.Call):
            alvo = _alvo(x)
            if alvo is not None:
                nomes.add(alvo)
    return nomes


# ─── F1: o conjunto EXATO de chamadores ──────────────────────────────────────────


def _prova_conjunto_de_chamadores(metodos: dict[str, ast.AST]) -> tuple[str, ...]:
    chamadores: set[str] = set()
    for nome, no in metodos.items():
        if METODO_ENFILEIRA in _chamadas(no) and nome != METODO_ENFILEIRA:
            chamadores.add(nome)
    if chamadores != set(CHAMADORES_DO_ENFILEIRAMENTO):
        raise CompatRefusal(
            "NATIVE_ENQUEUE_CALLERS_UNEXPECTED", ",".join(sorted(chamadores)) or "nenhum")
    return tuple(sorted(chamadores))


# ─── F1/§2: DOMINÂNCIA, provada para CADA chamador ───────────────────────────────


def _prova_dominancia(nome_do_metodo: str, no: ast.AST) -> None:
    """
    O portão dominante, provado para UM manipulador.

    A r1 conferia "a autorização aparece antes" e "existe um `if` com `return`".
    As duas coisas são verdade na forma INVERTIDA, que é o oposto do que se quer:

        if self._is_user_authorized_from_message(message):
            return
        self._enqueue_text_event(event)     # ← o NÃO autorizado cai aqui

    Ordem textual não é semântica. O que precisa ser provado é DOMINAÇÃO: todo
    caminho até o enfileiramento passa pelo ramo AUTORIZADO.

    Isto roda para `_handle_text_message` E para `_handle_command`. Não infiro
    dominância de um a partir do outro só porque os dois são nativos — o §2 do
    brief proíbe exatamente essa inferência, e ela seria o mesmo erro da r5 numa
    roupa nova.
    """
    corpo = list(getattr(no, "body", []))

    def _e_chamada_de_autorizacao(x: ast.AST) -> bool:
        """`auth(...)`, `await auth(...)` — e nada mais."""
        alvo = x.value if isinstance(x, ast.Await) else x
        if not isinstance(alvo, ast.Call):
            return False
        return _alvo(alvo) == METODO_AUTORIZA

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
            raise CompatRefusal("NATIVE_ENQUEUE_INSIDE_UNAUTHORIZED_BRANCH", nome_do_metodo)
        indice_portao = i
        break

    if indice_portao < 0:
        # Ou não há portão, ou ele é da forma invertida / não dominante. As três
        # merecem o mesmo desfecho, e o nome diz o que se procurava.
        raise CompatRefusal("NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING", nome_do_metodo)

    # A autorização não pode aparecer em MAIS lugar nenhum dentro do método: uma
    # segunda chamada com outra polaridade reabriria o buraco que este bloco fecha.
    ocorrencias = sum(
        1 for x in ast.walk(no)
        if isinstance(x, ast.Call) and _alvo(x) == METODO_AUTORIZA)
    if ocorrencias != 1:
        raise CompatRefusal("NATIVE_AUTHORIZATION_CALL_AMBIGUOUS",
                            f"{nome_do_metodo}:{ocorrencias}")

    # ─── a precondição do CONSUMO (a4-r6b) ───────────────────────────────────
    #
    # A capacidade de admissão é consumida no primeiro enfileiramento governado, o
    # que torna uma segunda chamada dentro da MESMA invocação nativa uma recusa. Isso
    # só é seguro se o nativo enfileirar no máximo uma vez por invocação.
    #
    # Medido na 0.20.4: `_handle_text_message` e `_handle_command` chamam exatamente
    # uma vez cada. Não presumo — se uma versão futura passar a enfileirar duas
    # vezes, o consumo derrubaria a segunda EM SILÊNCIO, e silêncio é o que esta fase
    # persegue. Então recusa e pede revisão.
    esperado_enfileira, esperado_entrega = FORMAS_DE_ENTREGA[nome_do_metodo]

    vezes = sum(1 for x in ast.walk(no)
                if isinstance(x, ast.Call) and _alvo(x) == METODO_ENFILEIRA)
    if vezes != esperado_enfileira:
        raise CompatRefusal("NATIVE_ENQUEUE_NOT_SINGLE_PER_HANDLER",
                            f"{nome_do_metodo}:{vezes}")

    # ─── a4-r6c: a segunda forma de entrega, fixada ──────────────────────────
    #
    # Entregar direto é uma saída legítima do `_handle_command`, e é onde a admissão
    # não usada precisa ser descartada. Uma chamada de entrega A MAIS, ou uma que
    # apareça onde não havia, muda o conjunto de fronteiras que o adaptador governado
    # limpa — e mudar isso sem revisão foi exatamente o defeito da r6b.
    entregas = sum(1 for x in ast.walk(no)
                   if isinstance(x, ast.Call) and _alvo(x) == METODO_ENTREGA)
    if entregas != esperado_entrega:
        raise CompatRefusal(
            "NATIVE_DELIVERY_SHAPE_UNEXPECTED",
            f"{nome_do_metodo}: {METODO_ENTREGA}={entregas}, esperado {esperado_entrega}")

    # Nada de enfileiramento ANTES do portão.
    for comando in corpo[:indice_portao]:
        if METODO_ENFILEIRA in _chamadas(comando):
            raise CompatRefusal("NATIVE_ENQUEUE_BEFORE_AUTHORIZATION", nome_do_metodo)

    # E o enfileiramento tem de existir DEPOIS dele, na continuação autorizada.
    # `_handle_command` o tem aninhado sob o teste de limiar; `ast.walk` alcança.
    depois = any(METODO_ENFILEIRA in _chamadas(c) for c in corpo[indice_portao + 1:])
    if not depois:
        raise CompatRefusal("NATIVE_ENQUEUE_NOT_ON_AUTHORIZED_PATH", nome_do_metodo)


def _prova_ordem_de_autorizacao(arvore: ast.Module) -> tuple[str, ...]:
    classe = _no_da_classe(arvore)
    metodos = _metodos(classe)

    for nome in (METODO_ENFILEIRA, METODO_TRATA_TEXTO, METODO_TRATA_COMANDO, METODO_AUTORIZA):
        if nome not in metodos:
            raise CompatRefusal("NATIVE_METHOD_MISSING", nome)

    chamadores = _prova_conjunto_de_chamadores(metodos)
    for nome in sorted(CHAMADORES_DO_ENFILEIRAMENTO):
        _prova_dominancia(nome, metodos[nome])
    return chamadores


# ─── forma em runtime: assinatura e natureza assíncrona ──────────────────────────


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


def _prova_forma_dos_manipuladores(cls: type) -> None:
    """
    A divergência que a r6 mediu: os manipuladores nativos recebem DOIS argumentos.

    O python-telegram-bot invoca `handler(update, context)`. A sobrescrita da r5
    declarava `(self, message)`, e teria dado `TypeError` na primeira mensagem real.
    Uma sobrescrita com aridade errada não é um detalhe de estilo: é o caminho
    governado quebrando exatamente onde ninguém estava olhando.

    Assíncrono também é contrato. Provo em vez de detectar: um manipulador síncrono
    numa versão futura recusa e pede revisão, em lugar de silenciosamente escolher
    outro ramo de código.
    """
    for nome in sorted(CHAMADORES_DO_ENFILEIRAMENTO):
        metodo = getattr(cls, nome, None)
        if not callable(metodo):
            raise CompatRefusal("NATIVE_HANDLER_MISSING", nome)
        if not inspect.iscoroutinefunction(metodo):
            raise CompatRefusal("NATIVE_HANDLER_NOT_ASYNC", nome)
        try:
            parametros = tuple(inspect.signature(metodo).parameters)
        except (TypeError, ValueError) as causa:
            raise CompatRefusal("NATIVE_SIGNATURE_UNAVAILABLE", type(causa).__name__) from None
        if parametros != PARAMETROS_DO_MANIPULADOR:
            raise CompatRefusal("NATIVE_HANDLER_SIGNATURE_UNEXPECTED",
                                f"{nome}({','.join(parametros)})")


def _prova_origem_do_despacho(arvore: ast.Module) -> None:
    """
    Prova que os manipuladores governados só são alcançáveis pelo REGISTRO.

    ─── Por que isto é a prova mais importante da a4 ────────────────────────────

    Até a r6c, `_handle_text_message` e `_handle_command` eram sobrescritos e ELES
    abriam a admissão. Um método nomeado era a porta: qualquer código do processo
    que o chamasse com um `update` forjado abria uma admissão nova, e a autorização
    nativa PASSAVA — porque ela confere a identidade que o objeto declara, não a
    origem. Medido: `getattr(message, "from_user").id` contra uma allowlist de env,
    e o parâmetro `context` do PTB nem é lido.

    A r6d move a admissão para o chamável que o PTB guarda. Isso só é uma fronteira
    se o registro for de fato o único caminho até esses métodos. Então:

      * `_register_handlers` existe e tem a forma esperada;
      * cada manipulador governado é referenciado EXATAMENTE UMA vez na classe;
      * e essa referência está DENTRO de `_register_handlers`.

    Uma versão futura que chame um deles de outro lugar recusa aqui, em vez de
    reabrir a porta em silêncio.
    """
    classe = _no_da_classe(arvore)
    metodos = _metodos(classe)
    if METODO_REGISTRA_HANDLERS not in metodos:
        raise CompatRefusal("NATIVE_REGISTER_HANDLERS_MISSING", METODO_REGISTRA_HANDLERS)
    registro = metodos[METODO_REGISTRA_HANDLERS]

    def referencias(no: ast.AST, nome: str) -> int:
        """Quantas vezes o NOME aparece como atributo lido, em qualquer forma."""
        return sum(1 for x in ast.walk(no)
                   if isinstance(x, ast.Attribute) and x.attr == nome)

    for nome in sorted(CHAMADORES_DO_ENFILEIRAMENTO):
        na_classe = referencias(classe, nome)
        no_registro = referencias(registro, nome)
        if na_classe != 1:
            raise CompatRefusal("NATIVE_HANDLER_REFERENCED_ELSEWHERE",
                                f"{nome}:{na_classe}")
        if no_registro != 1:
            raise CompatRefusal("NATIVE_HANDLER_NOT_REGISTERED_HERE",
                                f"{nome}:{no_registro}")


def _prova_origem_do_registro(arvore: ast.Module) -> None:
    """
    Prova que o REGISTRO só acontece de dentro do ciclo de vida que constrói o app.

    ─── O que isto fecha ────────────────────────────────────────────────────────

    A r6d moveu a admissão para o chamável que o PTB guarda. Mas `_register_handlers`
    continuava público o bastante para que qualquer código do processo o chamasse com
    um objeto próprio que só precisasse ter `add_handler` — e recebesse o chamável
    governado de presente. A porta tinha deixado de ter nome e ganhado uma chave sob
    o tapete.

    A r6e exige uma capacidade de REGISTRO, emitida pelo `connect` governado. Isso só
    é fronteira se o registro for de fato inalcançável fora do `connect`, e se o app
    registrado for o que o nativo acabou de construir. Então:

      * `connect` existe e é assíncrono;
      * TODAS as referências a `_register_handlers` na classe estão dentro de
        `connect` — a 0.20.4 tem duas, o caminho normal e o de reconstrução;
      * e cada uma delas passa EXATAMENTE `self._app`.

    Se uma versão futura registrar de outro lugar, ou passar outro objeto, recusa.
    """
    classe = _no_da_classe(arvore)
    metodos = _metodos(classe)
    if METODO_CONECTA not in metodos:
        raise CompatRefusal("NATIVE_CONNECT_MISSING", METODO_CONECTA)
    conecta = metodos[METODO_CONECTA]

    def chamadas_de_registro(no: ast.AST) -> list[ast.Call]:
        return [x for x in ast.walk(no)
                if isinstance(x, ast.Call) and _alvo(x) == METODO_REGISTRA_HANDLERS]

    na_classe = chamadas_de_registro(classe)
    no_connect = chamadas_de_registro(conecta)
    if not na_classe:
        raise CompatRefusal("NATIVE_REGISTER_HANDLERS_NEVER_CALLED", METODO_REGISTRA_HANDLERS)
    if len(na_classe) != len(no_connect):
        raise CompatRefusal(
            "NATIVE_REGISTRATION_OUTSIDE_CONNECT",
            f"{len(na_classe)} chamada(s), {len(no_connect)} em {METODO_CONECTA}")

    for chamada in no_connect:
        argumentos = list(chamada.args)
        if len(argumentos) != 1:
            raise CompatRefusal("NATIVE_REGISTRATION_ARGUMENT_UNEXPECTED",
                                f"{len(argumentos)} argumento(s)")
        alvo = argumentos[0]
        proprio = (isinstance(alvo, ast.Attribute)
                   and alvo.attr == ATRIBUTO_APLICACAO
                   and isinstance(alvo.value, ast.Name)
                   and alvo.value.id == "self")
        if not proprio:
            raise CompatRefusal("NATIVE_REGISTRATION_ARGUMENT_UNEXPECTED",
                                ast.dump(alvo)[:60])

    _prova_origem_da_aplicacao(conecta)


def _atribui_aplicacao(comando: ast.stmt) -> ast.Assign | None:
    """O comando é `self._app = <algo>`? Devolve o nó, ou None."""
    if not isinstance(comando, ast.Assign):
        return None
    for alvo in comando.targets:
        if (isinstance(alvo, ast.Attribute) and alvo.attr == ATRIBUTO_APLICACAO
                and isinstance(alvo.value, ast.Name) and alvo.value.id == "self"):
            return comando
    return None


def _raiz_da_cadeia(no: ast.expr) -> ast.expr:
    """A expressão mais à esquerda de uma cadeia de chamadas/atributos."""
    atual: ast.expr = no
    while True:
        if isinstance(atual, ast.Call):
            atual = atual.func
        elif isinstance(atual, ast.Attribute):
            atual = atual.value
        else:
            return atual


def _chamada_mais_interna(no: ast.expr) -> ast.Call | None:
    """A primeira chamada da cadeia — `Application.builder()` em `...().token()`."""
    ultima: ast.Call | None = None
    atual: ast.expr = no
    while True:
        if isinstance(atual, ast.Call):
            ultima = atual
            atual = atual.func
        elif isinstance(atual, ast.Attribute):
            atual = atual.value
        else:
            return ultima


def _e_producao_nativa(valor: ast.expr) -> bool:
    """A cadeia começa em `Application.builder()`? É a raiz de proveniência."""
    interna = _chamada_mais_interna(valor)
    if interna is None or not isinstance(interna.func, ast.Attribute):
        return False
    return (interna.func.attr == METODO_PRODUTOR
            and isinstance(interna.func.value, ast.Name)
            and interna.func.value.id == PRODUTOR_DA_APLICACAO)


def _e_construcao(valor: ast.expr, simbolo: str) -> bool:
    """
    O valor é `<simbolo>.build()`, com o símbolo EXATO do construtor revisado?

    A r6f aceitava qualquer receptor com um método chamado `build`. Isso é conferir
    a GRAFIA do receptor, não a procedência dele: `builder = self.app_do_chamador`
    seguido de `self._app = builder.build()` passava. Agora o receptor tem de ser o
    símbolo cuja raiz foi provada.
    """
    if not (isinstance(valor, ast.Call) and isinstance(valor.func, ast.Attribute)
            and valor.func.attr == METODO_CONSTROI_APP):
        return False
    return isinstance(valor.func.value, ast.Name) and valor.func.value.id == simbolo


def _sub_comandos(comando: ast.stmt) -> list[ast.stmt]:
    saida: list[ast.stmt] = []
    for campo in ("body", "orelse", "finalbody"):
        saida += [x for x in (getattr(comando, campo, None) or [])
                  if isinstance(x, ast.stmt)]
    for tratador in getattr(comando, "handlers", None) or []:
        saida += [x for x in (getattr(tratador, "body", None) or [])
                  if isinstance(x, ast.stmt)]
    return saida


def _blocos_de(no: ast.AST) -> list[list[ast.stmt]]:
    """Todas as LISTAS de comandos dentro de `no`. Um bloco é um escopo sequencial."""
    saida: list[list[ast.stmt]] = []
    for x in ast.walk(no):
        for campo in ("body", "orelse", "finalbody"):
            bloco = getattr(x, campo, None)
            if isinstance(bloco, list) and any(isinstance(s, ast.stmt) for s in bloco):
                saida.append([s for s in bloco if isinstance(s, ast.stmt)])
        for tratador in getattr(x, "handlers", None) or []:
            corpo = getattr(tratador, "body", None)
            if isinstance(corpo, list) and corpo:
                saida.append([s for s in corpo if isinstance(s, ast.stmt)])
    return saida


def _prova_origem_do_construtor(conecta: ast.AST) -> str:
    """
    Prova que o construtor usado veio de `Application.builder()`, e devolve o símbolo.

    ─── O que isto fecha ────────────────────────────────────────────────────────

    A r6f exigia `<algo>.build()`. Qualquer receptor com um método chamado `build`
    servia, então uma deriva podia fazer

        builder = self.app_do_chamador
        self._app = builder.build()

    e passar. Reduzir proveniência a uma grafia foi o mesmo erro da r6f numa camada
    acima — e desta vez a forma que eu confundi com autoridade era a do receptor.

    ─── A regra, medida na 0.20.4 ───────────────────────────────────────────────

    O símbolo nasce em `Application.builder().token(...)` e é reatribuído QUATRO
    vezes por encadeamento fluente. Proibir reatribuição rejeitaria o genuíno, então
    o que se exige é enraizamento:

      * existe EXATAMENTE UMA atribuição cuja cadeia começa em `Application.builder()`
        — o alvo dela é o símbolo revisado;
      * toda outra atribuição a esse símbolo tem cadeia enraizada NO PRÓPRIO símbolo;
      * e o `Application` do módulo nativo É, por identidade de objeto, a classe de
        `telegram.ext` — não um nome que por acaso se escreve igual.

    A última é o que impede `Impostor.builder()` de passar renomeando o import.
    """
    producoes: list[tuple[ast.Assign, str]] = []
    for x in ast.walk(conecta):
        if not isinstance(x, ast.Assign) or len(x.targets) != 1:
            continue
        alvo = x.targets[0]
        if isinstance(alvo, ast.Name) and _e_producao_nativa(x.value):
            producoes.append((x, alvo.id))
    if len(producoes) != 1:
        raise CompatRefusal(
            "NATIVE_BUILDER_ORIGIN_UNPROVEN",
            f"{len(producoes)} produção(ões) de {PRODUTOR_DA_APLICACAO}.{METODO_PRODUTOR}()")
    raiz, simbolo = producoes[0]

    for x in ast.walk(conecta):
        if not isinstance(x, ast.Assign) or x is raiz:
            continue
        if not any(isinstance(t, ast.Name) and t.id == simbolo for t in x.targets):
            continue
        origem = _raiz_da_cadeia(x.value)
        if not (isinstance(origem, ast.Name) and origem.id == simbolo):
            raise CompatRefusal(
                "NATIVE_BUILDER_REBOUND",
                f"linha {x.lineno}: {simbolo} = {ast.unparse(x.value)[:44]}")

    # ─── identidade de OBJETO, não de nome ───────────────────────────────────
    import importlib  # noqa: PLC0415

    modulo = _modulo_nativo()
    local = getattr(modulo, PRODUTOR_DA_APLICACAO, None)
    if local is None:
        raise CompatRefusal("NATIVE_BUILDER_PRODUCER_MISSING", PRODUTOR_DA_APLICACAO)
    try:
        genuino = getattr(importlib.import_module(MODULO_DO_PRODUTOR),
                          PRODUTOR_DA_APLICACAO, None)
    except Exception as causa:  # noqa: BLE001
        raise CompatRefusal("NATIVE_BUILDER_PRODUCER_UNRESOLVABLE",
                            type(causa).__name__) from None
    if genuino is None or local is not genuino:
        raise CompatRefusal("NATIVE_BUILDER_PRODUCER_NOT_GENUINE",
                            f"{PRODUTOR_DA_APLICACAO} != {MODULO_DO_PRODUTOR}.{PRODUTOR_DA_APLICACAO}")
    return simbolo


def _prova_origem_da_aplicacao(conecta: ast.AST) -> None:
    """
    Prova que o app REGISTRADO é o que o construtor nativo acabou de produzir.

    ─── O que isto fecha ────────────────────────────────────────────────────────

    A r6e provava DE ONDE o registro é chamado e COMO o argumento é escrito. Não
    provava o que estava no atributo. Uma deriva como

        self._app = self.app_do_chamador
        self._register_handlers(self._app)

    satisfazia tudo: a chamada está no `connect`, o argumento é `self._app`. E o
    portão de identidade em runtime aceitava, porque o app REALMENTE era o
    `self._app` — envenenado. Conferir a grafia do argumento não é conferir a
    procedência do valor.

    ─── A regra, e por que ela não precisa de motor de fluxo ────────────────────

    Medido na 0.20.4: as duas atribuições são `self._app = builder.build()`, e cada
    registro é um comando IRMÃO no mesmo bloco, logo depois. Então duas exigências
    locais bastam:

      1. TODA atribuição a `self._app` dentro do `connect` é `<algo>.build()`;
      2. para cada registro, o comando anterior mais próximo que atribui `self._app`
         no MESMO bloco existe e é uma construção.

    A primeira elimina a deriva do achado; a segunda garante que a construção domina
    o registro. Não construí analisador de fluxo genérico: o §15 proíbe, e um
    analisador que eu mesmo escrevesse seria mais uma coisa para estar errada.
    """
    simbolo = _prova_origem_do_construtor(conecta)

    atribuicoes = [a for x in ast.walk(conecta)
                   if isinstance(x, ast.stmt) and (a := _atribui_aplicacao(x))]
    if not atribuicoes:
        raise CompatRefusal("NATIVE_APP_ORIGIN_NOT_PROVEN",
                            f"nenhuma atribuição a self.{ATRIBUTO_APLICACAO}")
    for atribuicao in atribuicoes:
        if not _e_construcao(atribuicao.value, simbolo):
            raise CompatRefusal(
                "NATIVE_APP_ASSIGNMENT_UNEXPECTED",
                f"linha {atribuicao.lineno}: {ast.unparse(atribuicao.value)[:48]}")

    def contem_registro(comando: ast.stmt) -> bool:
        return any(isinstance(x, ast.Call) and _alvo(x) == METODO_REGISTRA_HANDLERS
                   for x in ast.walk(comando))

    vistos = 0
    for bloco in _blocos_de(conecta):
        for i, comando in enumerate(bloco):
            # O comando MAIS INTERNO que contém o registro: se um sub-comando o
            # contém, o bloco dele é que manda, e ele é visitado à parte.
            if not contem_registro(comando):
                continue
            if any(contem_registro(s) for s in _sub_comandos(comando)):
                continue
            vistos += 1
            anterior = None
            for j in range(i - 1, -1, -1):
                anterior = _atribui_aplicacao(bloco[j])
                if anterior is not None:
                    break
            if anterior is None:
                raise CompatRefusal(
                    "NATIVE_APP_ORIGIN_NOT_PROVEN",
                    f"linha {comando.lineno}: sem construção precedente no bloco")
            if not _e_construcao(anterior.value, simbolo):
                raise CompatRefusal(
                    "NATIVE_APP_ORIGIN_NOT_PROVEN",
                    f"linha {anterior.lineno}: {ast.unparse(anterior.value)[:48]}")
    if not vistos:
        raise CompatRefusal("NATIVE_APP_ORIGIN_NOT_PROVEN", "nenhum registro localizado")


def canoniza(fonte: str) -> str:
    """
    A forma canônica de uma fonte: AST sem posições, sem espaços, sem comentários.

    `include_attributes=False` descarta `lineno`/`col_offset`, então reindentar ou
    comentar não muda nada. O que sobra é a estrutura executável inteira — e é
    exatamente o que precisa ser selado.

    A versão do interpretador entra no texto porque a representação de AST muda
    entre versões do Python; sem ela o mesmo dígito descreveria árvores diferentes.
    """
    arvore = ast.parse(textwrap.dedent(fonte))
    corpo = ast.dump(arvore, annotate_fields=True, include_attributes=False)
    return f"python={sys.version_info[0]}.{sys.version_info[1]}\n{corpo}"


def connect_bruto(cls: type) -> object:
    """
    O objeto que REALMENTE define `connect` na classe nativa — e mais nada.

    A r6h selou a ESTRUTURA da `connect` carregada, e presumiu que
    `inspect.getsource` mostraria a função carregada. Não mostra:
    `getsource` chama `inspect.unwrap` por dentro, então um invólucro que
    carregue `__wrapped__` — o que `functools.wraps` põe de graça — é
    silenciosamente trocado pela função aprovada ANTES da canonicalização. O
    selo então descrevia a função de baixo enquanto o runtime executava a de
    cima. Um invólucro em volta da função aprovada NÃO é a função aprovada.

    Por isso a resolução aqui é estática e a identidade vem antes da fonte:

    1. `getattr_static` pega o objeto do `__dict__` da classe sem acionar
       descritor nenhum — nada de `__getattr__`, `property` ou metaclasse
       decidindo o que mostrar;
    2. desembrulhar não pode mudar a identidade — se muda, há um invólucro,
       e recusa. Falha ao desembrulhar (cadeia cíclica) também recusa;
    3. o caminho normal de atributo tem que chegar NO MESMO objeto, senão o
       runtime executaria um e nós selaríamos outro.

    Só depois disso o objeto vira fonte. É o mesmo objeto do começo ao fim.
    """
    try:
        bruto = inspect.getattr_static(cls, METODO_CONECTA)
    except AttributeError:
        raise CompatRefusal("NATIVE_CONNECT_MISSING", METODO_CONECTA) from None
    if not callable(bruto):
        raise CompatRefusal("NATIVE_CONNECT_MISSING", METODO_CONECTA)
    try:
        desembrulhado = inspect.unwrap(bruto)
    except Exception as causa:  # noqa: BLE001 — desembrulhar falhou: recusa.
        raise CompatRefusal("NATIVE_CONNECT_UNWRAP_FAILED",
                            type(causa).__name__) from None
    if desembrulhado is not bruto:
        alvo = getattr(desembrulhado, "__qualname__", type(desembrulhado).__name__)
        raise CompatRefusal("NATIVE_CONNECT_WRAPPED", str(alvo)[:64])
    # O que o runtime chama de fato: `cls.connect` (função) ou, num objeto já
    # ligado, o `__func__` dele. Tem que ser este mesmo objeto.
    vinculado = getattr(cls, METODO_CONECTA, None)
    if getattr(vinculado, "__func__", vinculado) is not bruto:
        raise CompatRefusal("NATIVE_CONNECT_BINDING_DIVERGES", METODO_CONECTA)
    return bruto


def selo_observado_do_connect(cls: type) -> str:
    """O selo da função `connect` REALMENTE carregada. Falha fechada se não der."""
    metodo = connect_bruto(cls)
    try:
        fonte = inspect.getsource(metodo)
    except (OSError, TypeError) as causa:
        raise CompatRefusal("NATIVE_CONNECT_SOURCE_UNAVAILABLE",
                            type(causa).__name__) from None
    try:
        canonico = canoniza(fonte)
    except SyntaxError as causa:
        raise CompatRefusal("NATIVE_CONNECT_UNPARSEABLE", type(causa).__name__) from None
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def _prova_selo_do_connect(cls: type) -> None:
    """
    O ciclo de vida carregado é EXATAMENTE o auditado, ou recusa.

    Isto não substitui as provas semânticas — elas dão nomes inteligíveis para as
    derivas prováveis, e um nome bom vale muito quando algo quebra às três da manhã.
    O selo é o que fecha a CATEGORIA: qualquer mudança executável que as provas
    semânticas não reconheçam ainda muda o dígito.
    """
    observado = selo_observado_do_connect(cls)
    if observado != SELO_DO_CONNECT:
        raise CompatRefusal(
            "NATIVE_CONNECT_STRUCTURE_MISMATCH",
            f"{observado[:16]}… != {SELO_DO_CONNECT[:16]}… "
            f"(python {sys.version_info[0]}.{sys.version_info[1]})")


def _prova_forma_do_connect(cls: type) -> None:
    # A identidade do carregado vem PRIMEIRO, e cedo: antes de qualquer leitura de
    # fonte — a do módulo inclusive. Sem isso as provas semânticas leriam o módulo
    # aprovado enquanto um invólucro é o que executa.
    metodo = connect_bruto(cls)
    if not inspect.iscoroutinefunction(metodo):
        raise CompatRefusal("NATIVE_CONNECT_NOT_ASYNC", METODO_CONECTA)


def _prova_forma_do_registro(cls: type) -> None:
    metodo = getattr(cls, METODO_REGISTRA_HANDLERS, None)
    if not callable(metodo):
        raise CompatRefusal("NATIVE_REGISTER_HANDLERS_MISSING", METODO_REGISTRA_HANDLERS)
    if inspect.iscoroutinefunction(metodo):
        raise CompatRefusal("NATIVE_REGISTER_HANDLERS_ASYNC", METODO_REGISTRA_HANDLERS)
    try:
        parametros = tuple(inspect.signature(metodo).parameters)
    except (TypeError, ValueError) as causa:
        raise CompatRefusal("NATIVE_SIGNATURE_UNAVAILABLE", type(causa).__name__) from None
    if parametros != PARAMETROS_DO_REGISTRO_DE_HANDLERS:
        raise CompatRefusal("NATIVE_REGISTER_HANDLERS_SIGNATURE_UNEXPECTED",
                            ",".join(parametros))


def _prova_forma_da_entrega(cls: type) -> None:
    """
    `handle_message` é ASSÍNCRONO, e isso muda o corpo da interceptação.

    A r5 fazia `return self.handle_message(event)` de dentro de uma sobrescrita
    SÍNCRONA — e o nativo chama `_enqueue_text_event(event)` sem `await`. A corrotina
    era criada e descartada: o ingresso governado ficava registrado, o sink era
    chamado, e a mensagem NUNCA chegava ao agente. Sucesso silencioso, a família de
    defeito que esta fase persegue.

    A r6 despacha pelo MESMO mecanismo do nativo — uma task no loop corrente, que é
    o que `_enqueue_text_event` nativo faz com seu flush. Aqui provo o contrato que
    torna esse despacho correto.
    """
    metodo = getattr(cls, METODO_ENTREGA, None)
    if not callable(metodo):
        raise CompatRefusal("NATIVE_DELIVERY_MISSING", METODO_ENTREGA)
    if not inspect.iscoroutinefunction(metodo):
        raise CompatRefusal("NATIVE_DELIVERY_NOT_ASYNC", METODO_ENTREGA)
    try:
        parametros = tuple(inspect.signature(metodo).parameters)
    except (TypeError, ValueError) as causa:
        raise CompatRefusal("NATIVE_SIGNATURE_UNAVAILABLE", type(causa).__name__) from None
    if len(parametros) != 2:
        raise CompatRefusal("NATIVE_DELIVERY_SIGNATURE_UNEXPECTED", ",".join(parametros))


def resolvedor_de_notificacao():
    """
    O resolvedor nativo do modo de notificação, ou recusa.

    Provado no registro e usado na fábrica: ausência recusa em vez de deixar o
    adaptador sem o atributo que a fábrica nativa garante.
    """
    resolvedor = getattr(_modulo_nativo(), RESOLVEDOR_DE_NOTIFICACAO, None)
    if not callable(resolvedor):
        raise CompatRefusal("NATIVE_NOTIFICATIONS_RESOLVER_MISSING", RESOLVEDOR_DE_NOTIFICACAO)
    return resolvedor


def _prova_limite_de_divisao(cls: type) -> int:
    """
    O limiar que roteia comando longo para o lote — lido do nativo, nunca escrito.

    O §4 do brief é explícito: não fixar 4096 como política da Creditum. O valor
    genuíno é 4000, e o teste de regressão de comando longo deriva dele. Se o
    Hermes mudar o limiar, o teste acompanha; se remover o atributo, recusamos.
    """
    valor = getattr(cls, ATRIBUTO_LIMITE_DE_DIVISAO, None)
    if valor is None:
        raise CompatRefusal("NATIVE_SPLIT_THRESHOLD_MISSING", ATRIBUTO_LIMITE_DE_DIVISAO)
    if not isinstance(valor, int) or isinstance(valor, bool) or valor <= 0:
        raise CompatRefusal("NATIVE_SPLIT_THRESHOLD_INVALID", repr(valor)[:40])
    return valor


# ─── F2: o contrato REAL de `register_platform`, e a chave escolhida ─────────────

#: Os parâmetros que o `register_platform` genuíno exige. Medidos na 0.20.4.
PARAMETROS_OBRIGATORIOS_DO_REGISTRO = ("name", "label", "adapter_factory", "check_fn")


def prova_assinatura_do_registro(registrar: object) -> None:
    """
    A r5 chamava `register_platform(classe)` — um posicional. O genuíno exige quatro.

    Provo a assinatura ANTES de chamar. Descobrir por `TypeError` no meio de um
    registro é descobrir depois, e esta fase inteira existe para não descobrir depois.
    """
    try:
        assinatura = inspect.signature(registrar)  # type: ignore[arg-type]
    except (TypeError, ValueError) as causa:
        raise CompatRefusal("PLUGIN_REGISTER_SIGNATURE_UNAVAILABLE",
                            type(causa).__name__) from None
    obrigatorios = tuple(
        nome for nome, p in assinatura.parameters.items()
        if p.default is inspect.Parameter.empty
        and p.kind in (p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY))
    if obrigatorios != PARAMETROS_OBRIGATORIOS_DO_REGISTRO:
        raise CompatRefusal("PLUGIN_REGISTER_SIGNATURE_UNEXPECTED", ",".join(obrigatorios))


def _no_do_registro_embutido(arvore: ast.Module) -> ast.FunctionDef:
    for no in arvore.body:
        if isinstance(no, ast.FunctionDef) and no.name == NATIVE_BUNDLED_REGISTER:
            return no
    raise CompatRefusal("NATIVE_BUNDLED_REGISTER_MISSING", NATIVE_BUNDLED_REGISTER)


def _prova_registro_embutido(arvore: ast.Module) -> tuple[str, str]:
    """
    Confere a chave e o rótulo governados contra o que o plugin EMBUTIDO registra.

    Por que isto importa: a a8-r3 mediu que o Hermes armazena `entries[entry.name]`
    verbatim — a chave não é derivada de nada. Quem escolhe `name` escolhe quem
    vence. Então nossa escolha é uma constante governada, e esta prova confirma que
    ela é a MESMA que o embutido usa. Sem isso, registraríamos ao lado do embutido
    em vez de no lugar dele, e o "vencedor" seria uma coincidência.

    A prova também estabelece que o corpo do `register` embutido é EXATAMENTE uma
    chamada a `register_platform` (docstring permitida). Isso é o que torna seguro
    executá-lo com um contexto gravador para herdar seus campos operacionais: um
    corpo com mais do que isso poderia ter efeito colateral, e aí recusamos.
    """
    no = _no_do_registro_embutido(arvore)
    corpo = [c for c in no.body
             if not (isinstance(c, ast.Expr) and isinstance(c.value, ast.Constant)
                     and isinstance(c.value.value, str))]
    if len(corpo) != 1 or not isinstance(corpo[0], ast.Expr):
        raise CompatRefusal("NATIVE_BUNDLED_REGISTER_NOT_SINGLE_CALL", str(len(corpo)))
    chamada = corpo[0].value
    if not isinstance(chamada, ast.Call) or _alvo(chamada) != NATIVE_REGISTER_PLATFORM:
        raise CompatRefusal("NATIVE_BUNDLED_REGISTER_NOT_SINGLE_CALL", "não é register_platform")

    literais: dict[str, object] = {}
    for kw in chamada.keywords:
        if kw.arg in ("name", "label") and isinstance(kw.value, ast.Constant):
            literais[kw.arg] = kw.value.value
    if literais.get("name") != PLATFORM_NAME:
        raise CompatRefusal("NATIVE_BUNDLED_PLATFORM_NAME_UNEXPECTED",
                            repr(literais.get("name"))[:40])
    if literais.get("label") != PLATFORM_LABEL:
        raise CompatRefusal("NATIVE_BUNDLED_PLATFORM_LABEL_UNEXPECTED",
                            repr(literais.get("label"))[:40])
    return PLATFORM_NAME, PLATFORM_LABEL


def campos_do_registro_embutido() -> dict[str, object]:
    """
    Colhe os campos operacionais que o plugin embutido passa a `register_platform`.

    Por que herdar em vez de reescrever: registrar sob a chave `telegram` DESLOCA a
    entrada embutida (o Hermes é last-writer-wins). Uma entrada nossa com só quatro
    campos derrubaria entrega de cron, fiação de allowlist por env, config em yaml,
    envio autônomo e limite de tamanho de mensagem — e derrubaria em SILÊNCIO, que é
    a família de defeito que esta fase persegue.

    Então o embutido é executado com um contexto que só GRAVA, e o resultado é a base
    da nossa entrada. Executá-lo é seguro porque `_prova_registro_embutido` já provou
    que o corpo dele é exatamente uma chamada a `register_platform`.

    O que NÃO é herdado é `adapter_factory`: essa é a única coisa que a a4 troca.
    """
    arvore = _arvore_do_modulo_nativo()
    _prova_registro_embutido(arvore)

    capturado: list[dict[str, object]] = []

    class _Gravador:
        def register_platform(self, **kwargs: object) -> None:
            capturado.append(dict(kwargs))

    registrar_embutido = getattr(_modulo_nativo(), NATIVE_BUNDLED_REGISTER, None)
    if not callable(registrar_embutido):
        raise CompatRefusal("NATIVE_BUNDLED_REGISTER_MISSING", NATIVE_BUNDLED_REGISTER)
    registrar_embutido(_Gravador())

    if len(capturado) != 1:
        raise CompatRefusal("NATIVE_BUNDLED_REGISTER_NOT_SINGLE_CALL", str(len(capturado)))
    campos = capturado[0]
    desconhecidos = set(campos) - CAMPOS_HERDAVEIS
    if desconhecidos:
        raise CompatRefusal("BUNDLED_REGISTRATION_FIELD_UNKNOWN",
                            ",".join(sorted(desconhecidos)))
    if campos.get("name") != PLATFORM_NAME or campos.get("label") != PLATFORM_LABEL:
        raise CompatRefusal("NATIVE_BUNDLED_PLATFORM_NAME_UNEXPECTED",
                            repr(campos.get("name"))[:40])
    return campos


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
    _prova_forma_dos_manipuladores(cls)
    _prova_forma_da_entrega(cls)
    _prova_forma_do_registro(cls)
    _prova_forma_do_connect(cls)
    resolvedor_de_notificacao()
    limiar = _prova_limite_de_divisao(cls)

    arvore = _arvore_do_modulo_nativo()
    chamadores = _prova_ordem_de_autorizacao(arvore)
    _prova_origem_do_despacho(arvore)
    _prova_origem_do_registro(arvore)
    nome, rotulo = _prova_registro_embutido(arvore)

    # O selo por ÚLTIMO, de propósito: uma deriva reconhecível recebe o nome
    # específico da prova semântica que a viu, e o selo pega tudo o mais.
    _prova_selo_do_connect(cls)

    if event_type is not None:
        for campo in CAMPOS_EVENTO:
            if not (hasattr(event_type, campo) or campo in getattr(
                    event_type, "__annotations__", {})):
                raise CompatRefusal("EVENT_FIELD_MISSING", campo)

    return CompatibilityProof(
        hermes_version=versao, adapter_compat_id=ADAPTER_COMPAT_ID,
        native_module=NATIVE_ADAPTER_MODULE, native_class=NATIVE_ADAPTER_CLASS,
        native_enqueue_callers=chamadores, native_split_threshold=limiar,
        platform_name=nome, platform_label=rotulo,
    )
