"""
D2E-A4-R6 — provas do adaptador Telegram governado.

O Hermes não existe nesta máquina, então os testes instalam um DUBLÊ sob o caminho de
módulo FIXO que a produção resolve. Isso é a mesma disciplina do `vi.mock` da d2c: a
produção não ganha parâmetro de módulo; o teste substitui o ambiente.

─── O que a r6 corrigiu no DUBLÊ ───────────────────────────────────────────────

O dublê da r5 codificava o contrato ERRADO, e por isso os testes passavam enquanto a
produção não carregava contra o Hermes genuíno. Medido contra o 0.20.4 real, o dublê
agora tem:

  * DOIS chamadores de `_enqueue_text_event` — `_handle_text_message` e
    `_handle_command`, este roteando comando longo pelo limiar;
  * manipuladores `async def (self, update, context)` — dois parâmetros;
  * `handle_message` ASSÍNCRONO;
  * `_SPLIT_THRESHOLD` como atributo de classe;
  * um `register()` de módulo com a chave e o rótulo que o embutido genuíno usa.

Um dublê que não é fiel não é um teste: é uma segunda opinião sobre a mesma suposição.
"""
from __future__ import annotations

import asyncio
import hashlib
import inspect
import functools
import itertools
import linecache
import sys
import types
import unittest
from dataclasses import dataclass
from typing import Any

from creditum_hermes_telegram import compat
from creditum_hermes_telegram.adapter import ADMISSION_EVIDENCE, register
from creditum_hermes_telegram.compat import CompatRefusal, verify_compatibility
from creditum_hermes_telegram.ingress import IngressRefusal, capture_ingress

TEXTO = "CREDITUM FIRST LIVE TEST"
_SEQ = itertools.count()
#: Nomes sintéticos vivos no `linecache`, para limpeza determinística.
_SINTETICOS: set[str] = set()

# ── o dublê: forma MEDIDA da 0.20.4 ─────────────────────────────────────────────
#
# As funções de módulo vêm antes da classe de propósito: os testes de mutação anexam
# um método indentado ao FIM da fonte, e isso só é sintaticamente válido se a classe
# for a última coisa do arquivo.
FONTE_NATIVA = '''
from telegram.ext import Application


def _resolve_notifications_mode():
    return "important"


TELEGRAM_AVAILABLE = True
INSTALACOES = []
#: Costura de teste no DUBLÊ (não em produção): deixa um teste rodar código de
#: dentro da task de entrega, que é onde o contexto copiado tem de estar limpo.
GANCHO_ENTREGA = None


def _deps_present():
    """O detector PASSIVO. Lê o flag; nunca instala."""
    return TELEGRAM_AVAILABLE


def _install_deps():
    """O instalador ATIVO do embutido — o que a r6a remove da entrada governada.

    No Hermes genuíno este é `check_telegram_requirements`, que chama
    `tools.lazy_deps.ensure("platform.telegram", prompt=False)`. Aqui ele só GRAVA
    que foi chamado: se aparecer uma gravação, a política vazou.
    """
    global TELEGRAM_AVAILABLE
    INSTALACOES.append("lazy_deps.ensure")
    TELEGRAM_AVAILABLE = True
    return True


def _build_adapter(config):
    adapter = TelegramAdapter(config)
    adapter._notifications_mode = _resolve_notifications_mode()
    return adapter


def register(ctx):
    """Ponto de entrada do plugin embutido."""
    ctx.register_platform(
        name="telegram",
        label="Telegram",
        adapter_factory=_build_adapter,
        check_fn=_deps_present,
        ensure_deps_fn=_install_deps,
        required_env=["TELEGRAM_BOT_TOKEN"],
        install_hint="Run `hermes setup` to install Telegram support.",
        emoji="x",
    )


class HandlerFalso:
    """A forma do handler do PTB que importa aqui: `.callback` atribuível."""

    def __init__(self, rotulo, callback):
        self.rotulo = rotulo
        self.callback = callback


class TelegramAdapter:
    _SPLIT_THRESHOLD = 4000

    def __init__(self, config):
        self.config = config
        self.allow = {"123456789"}
        self.enfileirados = []
        self.entregues = []
        self.outros = []
        self._app = None
        self.conectado = False

    def _is_user_authorized_from_message(self, msg):
        return msg.from_user_id in self.allow

    def _effective_update_message(self, update):
        return update

    def _build_message_event(self, msg):
        return msg.event

    async def _handle_text_message(self, update, context):
        msg = self._effective_update_message(update)
        if not self._is_user_authorized_from_message(msg):
            return None
        event = self._build_message_event(msg)
        return self._enqueue_text_event(event)

    async def _handle_command(self, update, context):
        msg = self._effective_update_message(update)
        if not self._is_user_authorized_from_message(msg):
            return None
        event = self._build_message_event(msg)
        if len(event.text or "") >= self._SPLIT_THRESHOLD:
            return self._enqueue_text_event(event)
        return await self.handle_message(event)

    def _enqueue_text_event(self, event):
        self.enfileirados.append(event)
        return None

    async def connect(self, *, is_reconnect=False):
        """O ciclo de vida que CONSTRÓI a Application e só então registra.

        Forma da 0.20.4: `builder = Application.builder()...`, encadeamento fluente,
        `self._app = builder.build()` e o registro em seguida."""
        builder = Application.builder().token("sintetico")
        builder = builder.base_url("https://nao.usado.invalido")
        self._app = builder.build()
        self._register_handlers(self._app)
        self.conectado = True
        return True

    def _register_handlers(self, app):
        """FONTE ÚNICA de registro, como na 0.20.4. Os dois manipuladores
        governados são referenciados aqui e em lugar nenhum mais."""
        app.add_handler(HandlerFalso("texto", self._handle_text_message))
        app.add_handler(HandlerFalso("comando", self._handle_command))
        # Um terceiro handler, NÃO governado: prova que o proxy o deixa passar.
        app.add_handler(HandlerFalso("outro", self._handle_outro), group=99)

    async def _handle_outro(self, update, context):
        self.outros.append(update)

    async def handle_message(self, event):
        self.entregues.append(event)
        if GANCHO_ENTREGA is not None:
            resultado = GANCHO_ENTREGA(self, event)
            if hasattr(resultado, "__await__"):
                await resultado
        return "entregue"
'''



class AplicacaoFalsa:
    """A `Application` que o `builder.build()` produz. O nativo é quem a cria."""

    def __init__(self):
        self.handlers = []

    def add_handler(self, handler, *a, **k):
        self.handlers.append((handler, a, k))


class ConstrutorFalso:
    """O builder fluente: cada método devolve ele mesmo, como o `ApplicationBuilder`."""

    def token(self, _t):
        return self

    def base_url(self, _u):
        return self

    def request(self, _r):
        return self

    def build(self):
        return AplicacaoFalsa()


class AplicacaoPTBFalsa:
    """
    O que mora em `telegram.ext` como `Application`.

    A prova de proveniência confere IDENTIDADE DE OBJETO entre o `Application` do
    módulo nativo e o de `telegram.ext`. Um dublê que só tivesse um nome parecido
    passaria pela grafia e não pela identidade — que é justamente o defeito que a
    r6g fecha.
    """

    @staticmethod
    def builder():
        return ConstrutorFalso()


def instala_telegram_ext() -> None:
    """Instala `telegram.ext` com a `Application` que o dublê vai importar."""
    tg = sys.modules.get("telegram") or types.ModuleType("telegram")
    ext = types.ModuleType("telegram.ext")
    ext.Application = AplicacaoPTBFalsa
    tg.ext = ext
    sys.modules["telegram"] = tg
    sys.modules["telegram.ext"] = ext


@dataclass
class SourceFalso:
    platform: Any
    user_id: str
    chat_id: str
    thread_id: str | None = None


@dataclass
class EventoFalso:
    text: str
    message_id: str
    platform_update_id: int
    timestamp: str
    source: SourceFalso


@dataclass
class MensagemFalsa:
    from_user_id: str
    event: EventoFalso


class PlataformaFalsa:
    value = "telegram"


def evento(texto: str = TEXTO, mid: str = "4242", uid: int = 987654321,
           user: str = "123456789", chat: str = "123456789") -> EventoFalso:
    return EventoFalso(text=texto, message_id=mid, platform_update_id=uid,
                       timestamp="2026-09-02T21:06:00Z",
                       source=SourceFalso(PlataformaFalsa(), user, chat))


#: O selo de produção, guardado para restauração. O dublê é OUTRO Hermes, então
#: tem outro selo — substituir o ambiente inclui substituir o dígito que descreve
#: esse ambiente. O selo genuíno é provado contra o runtime genuíno, onde nada é
#: substituído.
_SELO_DE_PRODUCAO = compat.SELO_DO_CONNECT


def instala_hermes(*, versao: str = "0.20.4", fonte: str = FONTE_NATIVA,
                   resela: bool = True) -> None:
    """
    Instala o dublê sob os nomes de módulo FIXOS que a produção resolve.

    `resela=True` (padrão) sela a fonte instalada: o arnês está declarando "este é o
    nativo aprovado desta bancada". Assim os testes de mutação semântica continuam
    recebendo o nome específico da prova que os viu, em vez de todos caírem no selo.

    `resela=False` instala uma fonte SEM reselar — é como se simula deriva do ciclo
    de vida contra um selo já emitido, que é o que o selo existe para pegar.
    """
    hc = types.ModuleType("hermes_cli")
    hc.__version__ = versao  # type: ignore[attr-defined]
    sys.modules["hermes_cli"] = hc
    for nome in ("plugins", "plugins.platforms", "plugins.platforms.telegram"):
        sys.modules.setdefault(nome, types.ModuleType(nome))
    # `telegram.ext` ANTES do exec: a fonte do dublê importa `Application` de lá, e a
    # prova de proveniência compara os dois por identidade.
    instala_telegram_ext()
    mod = types.ModuleType(compat.NATIVE_ADAPTER_MODULE)
    # ─── a fonte do dublê vive no `linecache`, não em disco ──────────────────
    #
    # Até aqui o dublê gravava em `/tmp/creditum_hermes_double_N.py` só para que
    # `inspect.getsource` conseguisse lê-lo. Isso amarrava a suíte inteira a poder
    # escrever em `/tmp`: num sandbox sem essa permissão, os 198 testes da a4 falham
    # com `PermissionError` — e falham TODOS, o que faz o arnês parecer um defeito
    # de produção. Foi exatamente o que aconteceu num regate.
    #
    # `inspect.getsource` já consulta o `linecache` antes do disco, então injetar a
    # fonte lá dispensa o arquivo. `mtime=None` marca a entrada como carregada por
    # loader, e `linecache.checkcache` a preserva em vez de tentar `os.stat`.
    #
    # Nome ÚNICO por dublê, na forma sintética canônica: reusar o mesmo nome
    # devolveria a fonte antiga, e o teste mediria o dublê errado.
    caminho = f"<creditum-hermes-double-{next(_SEQ)}>"
    linecache.cache[caminho] = (
        len(fonte), None, fonte.splitlines(keepends=True), caminho)
    _SINTETICOS.add(caminho)
    codigo = compile(fonte, caminho, "exec")
    # O namespace de execução É o `__dict__` do módulo, como num módulo de verdade.
    #
    # Executar num dicionário separado e depois COPIAR os nomes para o módulo parecia
    # equivalente e não é: o `__globals__` das funções continuaria sendo o dicionário
    # separado, então `mod.TELEGRAM_AVAILABLE = False` não mudaria o que o detector
    # passivo lê. O teste de dependência ausente mediria o flag errado e passaria
    # pelo motivo errado.
    #
    # `__name__` e `__file__` no namespace: `inspect.getsource` resolve o arquivo via
    # `cls.__module__` → `sys.modules[...]` → `__file__`. Sem eles, TypeError.
    ns: dict[str, Any] = mod.__dict__
    ns["__file__"] = caminho
    ns["__name__"] = compat.NATIVE_ADAPTER_MODULE
    sys.modules[compat.NATIVE_ADAPTER_MODULE] = mod
    exec(codigo, ns)  # noqa: S102
    if resela:
        # O arnês declara: "este é o nativo aprovado desta bancada". Sem isto,
        # toda mutação semântica cairia no selo e perderia seu nome específico.
        compat.SELO_DO_CONNECT = hashlib.sha256(
            compat.canoniza(inspect.getsource(mod.TelegramAdapter.connect))
            .encode("utf-8")).hexdigest()


def desinstala_hermes() -> None:
    for nome in ("hermes_cli", compat.NATIVE_ADAPTER_MODULE,
                 "plugins.platforms.telegram", "plugins.platforms", "plugins",
                 "telegram.ext", "telegram"):
        sys.modules.pop(nome, None)
    # A limpeza é DEPOIS do teste, nunca durante: consumidores de
    # `inspect.getsource` já terminaram, e nenhuma entrada sintética se acumula
    # entre testes. Um teste que instala vários dublês limpa todos.
    for sintetico in list(_SINTETICOS):
        linecache.cache.pop(sintetico, None)
    _SINTETICOS.clear()
    compat.SELO_DO_CONNECT = _SELO_DE_PRODUCAO


@dataclass
class RegistroFalso:
    """A forma do `PluginRegistration` que a 0.20.4 devolve. Medida, não inventada."""
    kind: str
    key: str
    active: bool = True


class ContextoFalso:
    """
    O `PluginContext` dublado, com a assinatura REAL de `register_platform`.

    `vencedor=False` reproduz a semântica que a r6 fechou: o Hermes devolve `None`
    quando a entrada submetida não passou a ser a registrada em vigor.
    """

    def __init__(self, *, vencedor: bool = True) -> None:
        self.entradas: list[dict[str, Any]] = []
        self.registrados: list[Any] = []
        self._vencedor = vencedor

    def register_platform(self, name: str, label: str, adapter_factory: Any,
                          check_fn: Any, **extra: Any) -> RegistroFalso | None:
        campos = {"name": name, "label": label, "adapter_factory": adapter_factory,
                  "check_fn": check_fn, **extra}
        self.entradas.append(campos)
        if not self._vencedor:
            return None
        self.registrados.append(adapter_factory)
        return RegistroFalso("platform", name)


def resela_connect() -> None:
    """
    Reemite o selo depois de trocar o `connect` do dublê em runtime.

    Trocar o ciclo de vida É deriva estrutural, e o selo a pega — que é o ponto
    dele. Um teste que troca o `connect` para exercitar OUTRA coisa precisa
    declarar o novo ciclo como aprovado, senão mede o selo em vez do que pretende.
    """
    nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]
    compat.SELO_DO_CONNECT = hashlib.sha256(
        compat.canoniza(inspect.getsource(nativo.TelegramAdapter.connect))
        .encode("utf-8")).hexdigest()


def despachantes(adaptador: Any) -> dict[str, Any]:
    """
    Os chamáveis que o PTB guardaria, obtidos pelo ciclo de vida GOVERNADO.

    A a4-r6d moveu a admissão para o callback registrado; a a4-r6e moveu o direito
    de REGISTRAR para dentro do `connect`. Então o teste conecta, e lê os callbacks
    da Application que o próprio adaptador construiu.

    Chamar `_register_handlers` com um app do teste é justamente o que a r6e
    desautoriza — dirigir daqui mediria o caminho que ela existe para fechar.
    """
    if getattr(adaptador, "_app", None) is None:
        asyncio.run(adaptador.connect())
    return {h.rotulo: h.callback for h, _a, _k in adaptador._app.handlers}


def entrega(adaptador: Any, mensagem: Any, *, comando: bool = False) -> Any:
    """
    Dirige o despacho como o python-telegram-bot o dirige: pelo callback registrado.

    Os manipuladores da 0.20.4 são `async def (self, update, context)`, e o despacho
    governado cria uma task no loop corrente. Então o teste precisa de um loop, e
    precisa deixar as tasks pendentes drenarem — medir a entrega antes de ela
    acontecer mediria o relógio, não o código.
    """
    metodo = despachantes(adaptador)["comando" if comando else "texto"]

    async def _corre() -> Any:
        resultado = await metodo(mensagem, None)
        pendentes = adaptador.__dict__.get("_creditum_pending_delivery")
        if pendentes:
            await asyncio.gather(*list(pendentes))
        return resultado

    return asyncio.run(_corre())


class Base(unittest.TestCase):
    def setUp(self) -> None:
        instala_hermes()
        self.capturados: list[Any] = []

    def tearDown(self) -> None:
        desinstala_hermes()

    def monta(self):
        ctx = ContextoFalso()
        cls = register(ctx, self.capturados.append)
        # Construído pela FÁBRICA governada, como o Hermes construiria. Montar a
        # instância à mão testaria a montagem do teste, não a de produção.
        inst = cls._creditum_adapter_factory(object())
        return ctx, inst


class Cardinalidade(Base):
    def test_A_uma_mensagem_um_ingresso(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento()))
        self.assertEqual(len(self.capturados), 1)
        i = self.capturados[0]
        self.assertEqual(i.source_message_count, 1)
        self.assertEqual(i.text, TEXTO)
        self.assertEqual(i.admission_evidence, ADMISSION_EVIDENCE)

    def test_B_duas_mensagens_rapidas_dao_DOIS_ingressos(self) -> None:
        # O defeito que motivou a fase: no nativo, B entraria em `A\nB`.
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento("A", mid="1", uid=1)))
        entrega(a, MensagemFalsa("123456789", evento("B", mid="2", uid=2)))
        self.assertEqual(len(self.capturados), 2)
        textos = [i.text for i in self.capturados]
        self.assertEqual(textos, ["A", "B"])
        for t in textos:
            self.assertNotIn("\n", t)
        self.assertEqual([i.message_id for i in self.capturados], ["1", "2"])

    def test_B2_o_lote_nativo_nunca_roda(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento()))
        # `enfileirados` é o acumulador do nativo. Vazio prova que não passamos por lá.
        self.assertEqual(a.enfileirados, [])
        self.assertEqual(len(a.entregues), 1)

    def test_C_message_id_distinto_permanece_distinto(self) -> None:
        _, a = self.monta()
        for m, u in (("10", 10), ("11", 11)):
            entrega(a, MensagemFalsa("123456789", evento(mid=m, uid=u)))
        self.assertEqual({i.message_id for i in self.capturados}, {"10", "11"})

    def test_D_chats_diferentes_nao_se_misturam(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento(mid="1", uid=1, chat="111")))
        entrega(a, MensagemFalsa("123456789", evento(mid="2", uid=2, chat="-1002")))
        self.assertEqual([i.destination_chat_id for i in self.capturados], ["111", "-1002"])

    def test_E_mutacao_depois_da_captura_nao_altera_o_ingresso(self) -> None:
        _, a = self.monta()
        ev = evento()
        entrega(a, MensagemFalsa("123456789", ev))
        i = self.capturados[0]
        ev.text = "TEXTO TROCADO"
        ev.source.chat_id = "999"
        ev.message_id = "0"
        self.assertEqual(i.text, TEXTO)
        self.assertEqual(i.destination_chat_id, "123456789")
        self.assertEqual(i.message_id, "4242")
        with self.assertRaises(Exception):
            i.text = "x"  # congelado

    def test_F_remetente_NAO_autorizado_nao_produz_ingresso(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("000000", evento()))
        self.assertEqual(self.capturados, [])
        self.assertEqual(a.entregues, [])

    def test_G_nao_existe_booleano_de_autorizacao_do_chamador(self) -> None:
        # A captura não tem parâmetro de autorização. O carimbo é nosso, não do evento.
        ev = evento()
        ev.authorized = True  # type: ignore[attr-defined]
        i = capture_ingress(ev, admission_evidence=ADMISSION_EVIDENCE,
                            hermes_version="0.20.4", adapter_compat_id="x")
        self.assertFalse(hasattr(i, "authorized"))
        self.assertEqual(i.admission_evidence, ADMISSION_EVIDENCE)

    def test_H_nenhum_segundo_consumidor_de_telegram(self) -> None:
        import ast, os
        raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        proibidos = {"start_polling", "get_updates", "Bot", "Application", "Updater"}
        for arq in ("adapter.py", "ingress.py", "compat.py"):
            caminho = os.path.join(raiz, "creditum_hermes_telegram", arq)
            with open(caminho, encoding="utf-8") as fh:
                fonte = fh.read()
            chamados = set()
            for n in ast.walk(ast.parse(fonte)):
                if isinstance(n, ast.Call):
                    f = n.func
                    nome = f.id if isinstance(f, ast.Name) else (
                        f.attr if isinstance(f, ast.Attribute) else None)
                    if nome:
                        chamados.add(nome)
            self.assertEqual(chamados & proibidos, set(), arq)
            for segredo in ("TELEGRAM_BOT_TOKEN", "bot_token", "TELEGRAM_ALLOWED_USERS"):
                self.assertNotIn(segredo, fonte, f"{arq} menciona {segredo}")

    def test_I_credencial_nao_entra_no_ingresso(self) -> None:
        _, a = self.monta()
        a.bot_token = "SEGREDO-NAO-DEVE-VAZAR"  # type: ignore[attr-defined]
        entrega(a, MensagemFalsa("123456789", evento()))
        self.assertNotIn("SEGREDO-NAO-DEVE-VAZAR", repr(self.capturados[0]))

    def test_J_o_destino_e_o_chat_admitido(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento(chat="55512345")))
        self.assertEqual(self.capturados[0].destination_chat_id, "55512345")


def muta(antigo: str, novo: str, *, fonte: str = FONTE_NATIVA,
         ocorrencias: int = 1) -> str:
    """
    Aplica UMA mutação e prova que ela pegou.

    Uma mutação que não casa é um teste que passa pelo motivo errado: `str.replace`
    devolve a fonte intacta em silêncio, o guarda aceita porque nada mudou, e o
    `assertRaises` passa a medir outra coisa — ou falha por um motivo que ninguém
    associa ao anchor quebrado. A r6 encontrou exatamente isso ao trocar o dublê,
    então contar as ocorrências virou parte do arnês.
    """
    achadas = fonte.count(antigo)
    if achadas != ocorrencias:
        raise AssertionError(
            f"mutação não aplicável: {achadas} ocorrência(s), esperado {ocorrencias}")
    return fonte.replace(antigo, novo)


#: Âncoras que identificam UM manipulador. O portão é textualmente idêntico nos dois,
#: então mutar "o portão" sem qualificar mutaria os dois — e o teste não diria qual.
PORTAO_TEXTO = ('        if not self._is_user_authorized_from_message(msg):\n'
                '            return None\n'
                '        event = self._build_message_event(msg)\n'
                '        return self._enqueue_text_event(event)')
PORTAO_COMANDO = ('        if not self._is_user_authorized_from_message(msg):\n'
                  '            return None\n'
                  '        event = self._build_message_event(msg)\n'
                  '        if len(event.text or ""):')
PORTAO_COMANDO_REAL = ('        if not self._is_user_authorized_from_message(msg):\n'
                       '            return None\n'
                       '        event = self._build_message_event(msg)\n'
                       '        if len(event.text or "") >= self._SPLIT_THRESHOLD:')


class Compatibilidade(Base):
    def test_versao_correta_passa(self) -> None:
        p = verify_compatibility()
        self.assertEqual(p.hermes_version, "0.20.4")

    def test_versao_diferente_RECUSA_o_registro(self) -> None:
        instala_hermes(versao="0.20.5")
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "HERMES_VERSION_NOT_SUPPORTED")

    def test_metodo_ausente_RECUSA(self) -> None:
        fonte = muta("    def _enqueue_text_event(self, event):\n"
                     "        self.enfileirados.append(event)\n"
                     "        return None\n", "")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    def test_assinatura_diferente_RECUSA(self) -> None:
        fonte = muta("def _enqueue_text_event(self, event):",
                     "def _enqueue_text_event(self, event, extra=None):")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_SIGNATURE_UNEXPECTED")

    # ─── §16: o conjunto de chamadores é IGUALDADE, nos dois sentidos ─────────

    def test_R6_TERCEIRO_chamador_do_enfileirar_RECUSA(self) -> None:
        """Um caminho a mais até a interceptação, possivelmente sem allowlist."""
        fonte = FONTE_NATIVA + '''
    async def _handle_media_message(self, update, context):
        msg = self._effective_update_message(update)
        return self._enqueue_text_event(msg.event)
'''
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_CALLERS_UNEXPECTED")
        self.assertIn("_handle_media_message", str(c.exception))

    def test_R6_chamador_A_MENOS_RECUSA(self) -> None:
        """
        O outro sentido, e o que a r5 errou: contrato mudado para MENOS.

        Se uma versão futura deixar de rotear comando pelo enfileiramento, o
        conjunto muda e queremos revisão governada — não aceitação silenciosa por
        "só sobrou o que a gente já suportava".
        """
        fonte = muta("        if len(event.text or \"\") >= self._SPLIT_THRESHOLD:\n"
                     "            return self._enqueue_text_event(event)\n",
                     "")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_CALLERS_UNEXPECTED")
        self.assertEqual(str(c.exception).split(": ")[1], "_handle_text_message")

    def test_R6_o_conjunto_exato_ACEITA(self) -> None:
        p = verify_compatibility()
        self.assertEqual(p.native_enqueue_callers,
                         ("_handle_command", "_handle_text_message"))
        self.assertEqual(set(p.native_enqueue_callers),
                         set(compat.CHAMADORES_DO_ENFILEIRAMENTO))

    # ─── §2: DOMINÂNCIA provada para CADA chamador, separadamente ────────────

    def test_R6_dominancia_no_TEXTO_polaridade_invertida_recusa(self) -> None:
        fonte = muta(PORTAO_TEXTO,
                     PORTAO_TEXTO.replace("if not self._is_user", "if self._is_user"))
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")
        self.assertIn("_handle_text_message", str(c.exception))

    def test_R6_dominancia_no_COMANDO_polaridade_invertida_recusa(self) -> None:
        """
        O §2 proíbe inferir dominância de um chamador a partir do outro. Este teste
        é o que torna a proibição verificável: só o portão do COMANDO é invertido, e
        a recusa tem de nomear `_handle_command`.
        """
        fonte = muta(PORTAO_COMANDO_REAL,
                     PORTAO_COMANDO_REAL.replace("if not self._is_user", "if self._is_user"))
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")
        self.assertIn("_handle_command", str(c.exception))

    def test_R6_autorizacao_AUSENTE_no_comando_recusa(self) -> None:
        fonte = muta(PORTAO_COMANDO_REAL,
                     PORTAO_COMANDO_REAL.replace(
                         "        if not self._is_user_authorized_from_message(msg):\n"
                         "            return None\n", ""))
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertIn(c.exception.defect,
                      ("NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING",
                       "NATIVE_AUTHORIZATION_CALL_AMBIGUOUS"))

    def test_autorizacao_chamada_mas_IGNORADA_recusa(self) -> None:
        fonte = muta("        if not self._is_user_authorized_from_message(msg):\n"
                     "            return None\n",
                     "        self._is_user_authorized_from_message(msg)\n",
                     ocorrencias=2)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")

    def test_E_autorizacao_em_condicional_NAO_dominante_recusa(self) -> None:
        fonte = muta("        if not self._is_user_authorized_from_message(msg):\n"
                     "            return None\n",
                     "        if msg.event.text:\n"
                     "            if not self._is_user_authorized_from_message(msg):\n"
                     "                return None\n",
                     ocorrencias=2)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")

    def test_E2_portao_com_else_recusa(self) -> None:
        fonte = muta("        if not self._is_user_authorized_from_message(msg):\n"
                     "            return None\n",
                     "        if not self._is_user_authorized_from_message(msg):\n"
                     "            pass\n"
                     "        else:\n"
                     "            pass\n",
                     ocorrencias=2)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    def test_E3_enfileirar_DENTRO_do_ramo_nao_autorizado_recusa(self) -> None:
        fonte = muta("        if not self._is_user_authorized_from_message(msg):\n"
                     "            return None\n",
                     "        if not self._is_user_authorized_from_message(msg):\n"
                     "            self._enqueue_text_event(msg.event)\n"
                     "            return None\n",
                     ocorrencias=2)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_INSIDE_UNAUTHORIZED_BRANCH")

    def test_H_funcao_de_autorizacao_TROCADA_recusa(self) -> None:
        fonte = muta("_is_user_authorized_from_message", "_talvez_ok", ocorrencias=3)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_METHOD_MISSING")

    def test_H2_segunda_chamada_de_autorizacao_e_ambigua(self) -> None:
        fonte = muta("        event = self._build_message_event(msg)\n"
                     "        return self._enqueue_text_event(event)",
                     "        if self._is_user_authorized_from_message(msg):\n"
                     "            pass\n"
                     "        event = self._build_message_event(msg)\n"
                     "        return self._enqueue_text_event(event)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_CALL_AMBIGUOUS")

    def test_A_forma_esperada_ACEITA(self) -> None:
        p = verify_compatibility()
        self.assertEqual(p.hermes_version, "0.20.4")

    # ─── a aridade e a natureza assíncrona, medidas contra o genuíno ─────────

    def test_R6_manipulador_com_UM_parametro_recusa(self) -> None:
        """A forma que a r5 assumia. Contra o genuíno ela nem seria chamável."""
        fonte = muta("    async def _handle_text_message(self, update, context):\n"
                     "        msg = self._effective_update_message(update)\n",
                     "    async def _handle_text_message(self, update):\n"
                     "        msg = self._effective_update_message(update)\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_HANDLER_SIGNATURE_UNEXPECTED")

    def test_R6_manipulador_SINCRONO_recusa(self) -> None:
        fonte = muta("    async def _handle_command(self, update, context):",
                     "    def _handle_command(self, update, context):")
        # A mutação tem de ficar COMPILÁVEL: um `await` órfão faria o teste falhar
        # por SyntaxError do dublê, e não pela recusa que ele existe para provar.
        fonte = muta("        return await self.handle_message(event)",
                     "        return self.handle_message(event)", fonte=fonte)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_HANDLER_NOT_ASYNC")

    def test_R6_handle_message_SINCRONO_recusa(self) -> None:
        """
        O defeito silencioso da r5: `handle_message` é assíncrono, e devolver a
        corrotina de um método que o nativo chama sem `await` a descartava.
        """
        fonte = muta("    async def handle_message(self, event):",
                     "    def handle_message(self, event):")
        # A mutação tem de ficar COMPILÁVEL: o `await` do gancho é órfão num método
        # síncrono, e o teste falharia por SyntaxError do dublê em vez de pela
        # recusa que ele existe para provar.
        fonte = muta("            if hasattr(resultado, \"__await__\"):\n"
                     "                await resultado\n", "", fonte=fonte)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_DELIVERY_NOT_ASYNC")

    def test_R6_limiar_ausente_recusa(self) -> None:
        fonte = muta("    _SPLIT_THRESHOLD = 4000\n", "")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_SPLIT_THRESHOLD_MISSING")

    def test_R6_limiar_e_MEDIDO_nao_escrito(self) -> None:
        """§4: 4096 não é política da Creditum. O valor vem do nativo."""
        p = verify_compatibility()
        self.assertEqual(p.native_split_threshold, 4000)
        fonte = muta("    _SPLIT_THRESHOLD = 4000", "    _SPLIT_THRESHOLD = 777")
        instala_hermes(fonte=fonte)
        self.assertEqual(verify_compatibility().native_split_threshold, 777)
        raiz = __import__("os").path.dirname(
            __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
        for arq in ("adapter.py", "compat.py"):
            with open(f"{raiz}/creditum_hermes_telegram/{arq}",
                      encoding="utf-8") as fh:
                fonte_nossa = fh.read()
            arvore = __import__("ast").parse(fonte_nossa)
            numeros = {n.value for n in __import__("ast").walk(arvore)
                       if isinstance(n, __import__("ast").Constant)
                       and isinstance(n.value, int)}
            self.assertNotIn(4096, numeros, f"{arq} fixa 4096 como política")
            self.assertNotIn(4000, numeros, f"{arq} fixa o limiar nativo")

    # ─── §5/§11: a chave é ESCOLHIDA, e a escolha é conferida ────────────────

    def test_R6_chave_e_rotulo_conferidos_contra_o_EMBUTIDO(self) -> None:
        p = verify_compatibility()
        self.assertEqual(p.platform_name, "telegram")
        self.assertEqual(p.platform_label, "Telegram")

    def test_R6_chave_embutida_DIFERENTE_recusa(self) -> None:
        """
        Se o embutido registrar sob outra chave, registrar sob `telegram` deixaria de
        deslocá-lo: teríamos duas entradas e o "vencedor" seria coincidência.
        """
        fonte = muta('        name="telegram",', '        name="telegram-v2",')
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUNDLED_PLATFORM_NAME_UNEXPECTED")

    def test_R6_rotulo_embutido_DIFERENTE_recusa(self) -> None:
        fonte = muta('        label="Telegram",', '        label="Telegrama",')
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUNDLED_PLATFORM_LABEL_UNEXPECTED")

    def test_R6_register_embutido_com_EFEITO_COLATERAL_recusa(self) -> None:
        """
        O que torna seguro EXECUTAR o `register` embutido para herdar seus campos:
        o corpo dele é provado como exatamente uma chamada. Com mais do que isso,
        recusamos em vez de executar código nativo desconhecido.
        """
        fonte = muta('def register(ctx):\n    """Ponto de entrada do plugin embutido."""\n',
                     'def register(ctx):\n'
                     '    """Ponto de entrada do plugin embutido."""\n'
                     '    import os\n'
                     '    os.environ["EFEITO"] = "1"\n')
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUNDLED_REGISTER_NOT_SINGLE_CALL")

    def test_R6_compat_id_e_v2(self) -> None:
        """v1 certificava o contrato de UM chamador. Redefinir v1 faria a evidência
        antiga descrever um contrato que já não existe."""
        self.assertEqual(compat.ADAPTER_COMPAT_ID,
                         "creditum_telegram_adapter_compat/0.20.4/v2")
        self.assertEqual(verify_compatibility().adapter_compat_id,
                         compat.ADAPTER_COMPAT_ID)

    def test_campo_de_evento_ausente_RECUSA(self) -> None:
        @dataclass
        class EventoPobre:
            text: str
        with self.assertRaises(CompatRefusal) as c:
            verify_compatibility(event_type=EventoPobre)
        self.assertEqual(c.exception.defect, "EVENT_FIELD_MISSING")

    def test_contexto_sem_register_platform_RECUSA(self) -> None:
        with self.assertRaises(CompatRefusal):
            register(object(), self.capturados.append)

    def test_registro_acontece_DEPOIS_da_prova(self) -> None:
        instala_hermes(versao="0.20.9")
        ctx = ContextoFalso()
        with self.assertRaises(CompatRefusal):
            register(ctx, self.capturados.append)
        self.assertEqual(ctx.entradas, [], "registrou antes de provar")


class RegistroReal(Base):
    """§5–§9 e §15: a chamada de registro, contra o contrato MEDIDO."""

    def test_R6_F2_a_chamada_usa_a_API_genuina(self) -> None:
        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        self.assertEqual(len(ctx.entradas), 1)
        e = ctx.entradas[0]
        self.assertEqual(e["name"], "telegram")
        self.assertEqual(e["label"], "Telegram")
        self.assertTrue(callable(e["adapter_factory"]))
        self.assertTrue(callable(e["check_fn"]))
        # A classe NÃO é registrada como se fosse descritor de entrada.
        self.assertIsNot(e["adapter_factory"], governada)
        self.assertNotIsInstance(e["adapter_factory"], type)

    def test_R6_F2_a_fabrica_constroi_a_classe_GOVERNADA(self) -> None:
        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        fabrica = ctx.entradas[0]["adapter_factory"]
        instancia = fabrica(object())
        self.assertIsInstance(instancia, governada)
        self.assertEqual(type(instancia).__name__, "CreditumGovernedTelegramAdapter")
        # O passo pós-construção que a fábrica nativa garante.
        self.assertEqual(instancia._notifications_mode, "important")

    def test_R6_F2_a_fabrica_e_a_MESMA_ligada_a_classe(self) -> None:
        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        self.assertIs(ctx.entradas[0]["adapter_factory"],
                      governada._creditum_adapter_factory)

    def test_R6_check_fn_e_o_PASSIVO_do_embutido(self) -> None:
        """§7: delegar em vez de inventar uma segunda implementação."""
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        self.assertIs(ctx.entradas[0]["check_fn"], nativo._deps_present)

    def test_R6_campos_operacionais_do_embutido_sao_HERDADOS(self) -> None:
        """
        Registrar sob `telegram` desloca o embutido. Uma entrada com só os quatro
        obrigatórios derrubaria os campos operacionais — em silêncio.
        """
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        e = ctx.entradas[0]
        self.assertEqual(e["required_env"], ["TELEGRAM_BOT_TOKEN"])
        self.assertEqual(e["emoji"], "x")
        # `install_hint` NÃO está aqui: a r6a o substitui, e o teste dela cobre isso.

    def test_R6_assinatura_de_registro_DIFERENTE_recusa(self) -> None:
        """A r5 descobriria por `TypeError`; a r6 prova antes de chamar."""
        class ContextoAntigo:
            def __init__(self) -> None:
                self.chamadas: list[Any] = []

            def register_platform(self, cls: Any) -> None:
                self.chamadas.append(cls)

        ctx = ContextoAntigo()
        with self.assertRaises(CompatRefusal) as c:
            register(ctx, self.capturados.append)
        self.assertEqual(c.exception.defect, "PLUGIN_REGISTER_SIGNATURE_UNEXPECTED")
        self.assertEqual(ctx.chamadas, [], "chamou mesmo com contrato divergente")

    # ─── §15: F3, o não-vencedor silencioso ─────────────────────────────────

    def test_R6_F3_retorno_None_RECUSA(self) -> None:
        ctx = ContextoFalso(vencedor=False)
        with self.assertRaises(CompatRefusal) as c:
            register(ctx, self.capturados.append)
        self.assertEqual(c.exception.defect, "PLATFORM_REGISTRATION_NOT_WINNER")
        # A chamada ACONTECEU: o defeito não é não-registrar, é não-detectar.
        self.assertEqual(len(ctx.entradas), 1)

    def test_R6_F3_chave_do_retorno_DIVERGENTE_recusa(self) -> None:
        class ContextoTorto(ContextoFalso):
            def register_platform(self, name, label, adapter_factory, check_fn, **extra):
                super().register_platform(name, label, adapter_factory, check_fn, **extra)
                return RegistroFalso("platform", "whatsapp")

        with self.assertRaises(CompatRefusal) as c:
            register(ContextoTorto(), self.capturados.append)
        self.assertEqual(c.exception.defect, "PLATFORM_REGISTRATION_KEY_UNEXPECTED")

    def test_R6_F3_registro_INATIVO_recusa(self) -> None:
        class ContextoInativo(ContextoFalso):
            def register_platform(self, name, label, adapter_factory, check_fn, **extra):
                super().register_platform(name, label, adapter_factory, check_fn, **extra)
                return RegistroFalso("platform", name, active=False)

        with self.assertRaises(CompatRefusal) as c:
            register(ContextoInativo(), self.capturados.append)
        self.assertEqual(c.exception.defect, "PLATFORM_REGISTRATION_INACTIVE")

    def test_R6_F3_kind_DIVERGENTE_recusa(self) -> None:
        class ContextoOutroKind(ContextoFalso):
            def register_platform(self, name, label, adapter_factory, check_fn, **extra):
                super().register_platform(name, label, adapter_factory, check_fn, **extra)
                return RegistroFalso("tool", name)

        with self.assertRaises(CompatRefusal) as c:
            register(ContextoOutroKind(), self.capturados.append)
        self.assertEqual(c.exception.defect, "PLATFORM_REGISTRATION_KIND_UNEXPECTED")

    def test_R6_F3_retorno_VALIDO_aceita(self) -> None:
        """O controle negativo dos dois lados: o caminho bom tem de passar."""
        ctx = ContextoFalso(vencedor=True)
        governada = register(ctx, self.capturados.append)
        self.assertEqual(governada.__name__, "CreditumGovernedTelegramAdapter")


class PoliticaDeDependencia(Base):
    """
    A4-R6A — dependência é autoridade de IMPLANTAÇÃO, não de reparo em runtime.

    O runtime exato é construído e selado antes do deploy. Dependência faltando em
    runtime é evidência de imagem inválida, deriva ou implantação incompleta — e
    evidência disso tem de causar recusa, não autorreparo. Um contêiner que se
    conserta sozinho deixou de ser o contêiner que foi selado.

    A r6 herdava os campos operacionais do embutido para não derrubar entrega de cron,
    allowlist por env e config em yaml em silêncio. Herdava JUNTO o
    `ensure_deps_fn`, que no Hermes genuíno chama
    `tools.lazy_deps.ensure("platform.telegram", prompt=False)` — instalação de pacote
    no venv ativo, sem prompt. Medido: dos sete chamáveis herdados, é o único que
    alcança um instalador.
    """

    def _nativo(self):
        return sys.modules[compat.NATIVE_ADAPTER_MODULE]

    def _sem_dependencias(self) -> None:
        """Vira o flag que o detector passivo GENUÍNO lê.

        É o mesmo flag que o próprio código nativo alterna (`global
        TELEGRAM_AVAILABLE`), então é como o runtime representa ausência — não é um
        detector inventado para o teste.
        """
        self._nativo().TELEGRAM_AVAILABLE = False

    # ─── §3: a autoridade ativa foi REMOVIDA da entrada governada ───────────

    def test_R6A_ensure_deps_fn_e_None_na_entrada_governada(self) -> None:
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        e = ctx.entradas[0]
        self.assertIn("ensure_deps_fn", e, "o campo tem de existir, e ser None")
        self.assertIsNone(e["ensure_deps_fn"])

    def test_R6A_o_instalador_EMBUTIDO_nao_e_retido(self) -> None:
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        nativo = self._nativo()
        self.assertIsNot(ctx.entradas[0]["ensure_deps_fn"], nativo._install_deps)
        # E o embutido segue registrando o seu: não modificamos o plugin do Hermes.
        class G:
            def register_platform(self, **k):
                self.k = k
        g = G()
        nativo.register(g)
        self.assertIs(g.k["ensure_deps_fn"], nativo._install_deps)

    # ─── §2: o detector PASSIVO genuíno é preservado ─────────────────────────

    def test_R6A_check_fn_segue_sendo_o_passivo_do_embutido(self) -> None:
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        self.assertIs(ctx.entradas[0]["check_fn"], self._nativo()._deps_present)

    def test_R6A_nao_existe_segundo_detector_inventado(self) -> None:
        """
        Dois detectores dariam duas respostas possíveis, e a que valeria seria a
        última consultada. A fábrica usa o MESMO chamável que a entrada registra.
        """
        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        registrado = ctx.entradas[0]["check_fn"]
        self._sem_dependencias()
        with self.assertRaises(CompatRefusal):
            governada._creditum_adapter_factory(object())
        # A recusa veio do detector REGISTRADO, não de outro.
        self.assertFalse(registrado())

    # ─── §4: o caminho de dependência AUSENTE ───────────────────────────────

    def test_R6A_dependencia_ausente_RECUSA_sem_instalar(self) -> None:
        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        nativo = self._nativo()
        self._sem_dependencias()
        nativo.INSTALACOES.clear()
        with self.assertRaises(CompatRefusal) as c:
            governada._creditum_adapter_factory(object())
        self.assertEqual(c.exception.defect, "PLATFORM_DEPENDENCIES_MISSING")
        self.assertEqual(nativo.INSTALACOES, [], "instalou em runtime")
        self.assertFalse(nativo.TELEGRAM_AVAILABLE, "o instalador virou o flag")

    def test_R6A_check_fn_que_LEVANTA_tambem_recusa(self) -> None:
        """
        O Hermes trata `check_fn` que levanta como falso. Faço o mesmo: "não sei"
        nunca vira "pode seguir".

        O detector é trocado ANTES do registro, porque a fábrica captura o chamável
        no momento em que a entrada é montada — trocá-lo depois mediria outra coisa.
        """
        def explode():
            raise RuntimeError("detector quebrado")

        self._nativo()._deps_present = explode
        governada = register(ContextoFalso(), self.capturados.append)
        with self.assertRaises(CompatRefusal) as c:
            governada._creditum_adapter_factory(object())
        self.assertEqual(c.exception.defect, "PLATFORM_DEPENDENCIES_MISSING")

    # ─── a semântica GENUÍNA do create_adapter, reproduzida fielmente ───────

    @staticmethod
    def _create_adapter_genuino(entrada: dict, config: object):
        """
        O algoritmo EXATO da 0.20.4, lido de `gateway/platform_registry.py:618`.

        Reproduzido — não reimplementado por conta própria — para provar localmente
        o que só o staging genuíno prova de verdade. O staging roda em §8; aqui o
        ponto é que o ramo do instalador NÃO É ENTRADO quando o campo é `None`.
        """
        deps_ok = False
        try:
            deps_ok = bool(entrada["check_fn"]())
        except Exception:  # noqa: BLE001
            pass
        if not deps_ok and entrada.get("ensure_deps_fn") is not None:
            deps_ok = bool(entrada["ensure_deps_fn"]())
        if not deps_ok:
            return None
        try:
            return entrada["adapter_factory"](config)
        except Exception:  # noqa: BLE001
            return None

    def test_R6A_create_adapter_devolve_None_e_NAO_instala(self) -> None:
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        nativo = self._nativo()
        self._sem_dependencias()
        nativo.INSTALACOES.clear()
        self.assertIsNone(self._create_adapter_genuino(ctx.entradas[0], object()))
        self.assertEqual(nativo.INSTALACOES, [])
        self.assertFalse(nativo.TELEGRAM_AVAILABLE)

    def test_R6A_com_o_instalador_EMBUTIDO_ele_instalaria(self) -> None:
        """
        O controle negativo do outro lado: prova que a asserção acima depende da
        política, e não do arnês. Com a entrada EMBUTIDA — a que a r6 herdava — o
        mesmo algoritmo instala e devolve um adaptador.
        """
        nativo = self._nativo()
        class G:
            def register_platform(self, **k):
                self.k = k
        g = G()
        nativo.register(g)
        self._sem_dependencias()
        nativo.INSTALACOES.clear()
        resultado = self._create_adapter_genuino(g.k, object())
        self.assertEqual(nativo.INSTALACOES, ["lazy_deps.ensure"])
        self.assertIsNotNone(resultado)
        self.assertTrue(nativo.TELEGRAM_AVAILABLE)

    # ─── §5: o caminho normal ───────────────────────────────────────────────

    def test_R6A_dependencias_presentes_o_caminho_normal_segue(self) -> None:
        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        nativo = self._nativo()
        nativo.INSTALACOES.clear()
        instancia = self._create_adapter_genuino(ctx.entradas[0], object())
        self.assertIsInstance(instancia, governada)
        self.assertEqual(nativo.INSTALACOES, [], "instalador rodou no caminho bom")
        self.assertIs(ctx.entradas[0]["adapter_factory"],
                      governada._creditum_adapter_factory)
        self.assertEqual(self.capturados, [], "criar adaptador produziu ingresso")

    # ─── a dica impressa pelo Hermes não pode mandar instalar ───────────────

    def test_R6A_install_hint_governado_nao_manda_instalar(self) -> None:
        ctx = ContextoFalso()
        register(ctx, self.capturados.append)
        dica = ctx.entradas[0]["install_hint"]
        from creditum_hermes_telegram.adapter import INSTALL_HINT_GOVERNADO
        self.assertEqual(dica, INSTALL_HINT_GOVERNADO)
        baixo = dica.lower()
        for proibido in ("hermes setup", "pip install", "uv add", "uv sync"):
            self.assertNotIn(proibido, baixo, f"a dica sugere {proibido}")
        self.assertIn("não instale", baixo)

    # ─── §6/§3: campo NOVO carregando autoridade não é herdado em silêncio ──

    def test_R6A_campo_DESCONHECIDO_no_registro_embutido_RECUSA(self) -> None:
        """
        A lição da a6, aplicada aqui: enumerar o permitido. Se uma versão futura
        acrescentar um campo — digamos `repair_fn` — herdá-lo em silêncio traria de
        volta a autoridade que esta fase acabou de remover.
        """
        fonte = muta("        emoji=\"x\",\n",
                     "        emoji=\"x\",\n        repair_fn=_install_deps,\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "BUNDLED_REGISTRATION_FIELD_UNKNOWN")
        self.assertIn("repair_fn", str(c.exception))

    def test_R6A_os_campos_herdaveis_sao_uma_allowlist(self) -> None:
        self.assertIsInstance(compat.CAMPOS_HERDAVEIS, frozenset)
        self.assertIn("ensure_deps_fn", compat.CAMPOS_HERDAVEIS)
        self.assertEqual(compat.CAMPO_COM_AUTORIDADE_DE_INSTALACAO, "ensure_deps_fn")

    # ─── §7: zero instalação, medido por contador e não por busca de texto ──

    def test_R6A_zero_subprocesso_zero_instalador_na_falha(self) -> None:
        """
        Medido por interceptação de chamada, não por procurar "pip" em arquivo.
        `subprocess` e `os.system` levantam se alguém os tocar.
        """
        import os as _os
        import subprocess
        chamadas: list[str] = []

        def _proibido(nome):
            def _w(*_a, **_k):
                chamadas.append(nome)
                raise AssertionError(f"{nome} chamado")
            return _w

        originais = {}
        for mod, nome in ((subprocess, "run"), (subprocess, "Popen"),
                          (subprocess, "check_call"), (_os, "system")):
            originais[(mod, nome)] = getattr(mod, nome)
            setattr(mod, nome, _proibido(f"{mod.__name__}.{nome}"))
        self.addCleanup(lambda: [setattr(m, n, v) for (m, n), v in originais.items()])

        ctx = ContextoFalso()
        governada = register(ctx, self.capturados.append)
        nativo = self._nativo()
        self._sem_dependencias()
        nativo.INSTALACOES.clear()
        with self.assertRaises(CompatRefusal):
            governada._creditum_adapter_factory(object())
        self.assertIsNone(self._create_adapter_genuino(ctx.entradas[0], object()))
        self.assertEqual(chamadas, [], "processo externo foi criado")
        self.assertEqual(nativo.INSTALACOES, [])
        self.assertEqual(self.capturados, [])


class ComandoLongo(Base):
    """§4: a regressão do caminho de comando, que a r5 recusava."""

    def _limiar(self) -> int:
        return verify_compatibility().native_split_threshold

    def test_R6_F1_comando_LONGO_autorizado_produz_ingresso_governado(self) -> None:
        _, a = self.monta()
        texto = "C" * self._limiar()
        entrega(a, MensagemFalsa("123456789", evento(texto=texto)), comando=True)
        self.assertEqual(len(self.capturados), 1)
        self.assertEqual(self.capturados[0].text, texto)
        self.assertEqual(self.capturados[0].source_message_count, 1)
        # Entregue de verdade, e sem passar pelo lote nativo.
        self.assertEqual(len(a.entregues), 1)
        self.assertEqual(a.enfileirados, [])

    def test_R6_F1_o_comando_longo_FORA_do_registro_recusa(self) -> None:
        """
        A r5 recusava o comando longo porque a capacidade cobria só o manipulador de
        texto. A r6 corrigiu isso, e a r6d mudou de onde a capacidade nasce — então
        este teste passou a medir a fronteira NOVA: pela via registrada o comando
        longo emite (provado acima); chamando o método nomeado direto, recusa.
        """
        import asyncio as _asyncio
        _, a = self.monta()
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(a._handle_command(
                MensagemFalsa("123456789", evento(texto="C" * self._limiar())), None))
        self.assertEqual(str(c.exception).split(":")[0],
                         "INGRESS_OUTSIDE_NATIVE_ADMISSION")
        self.assertEqual(self.capturados, [])

    def test_R6_comando_CURTO_nao_passa_pelo_enfileiramento(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento(texto="/stop")), comando=True)
        # Comando curto vai direto para a entrega nativa: nenhum ingresso governado,
        # e nenhuma recusa. A capacidade estar ativa não FORÇA emissão.
        self.assertEqual(self.capturados, [])
        self.assertEqual(len(a.entregues), 1)

    def test_R6_comando_longo_NAO_autorizado_nao_produz_ingresso(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("000000", evento(texto="C" * self._limiar())),
                comando=True)
        self.assertEqual(self.capturados, [])
        self.assertEqual(a.entregues, [])

    def test_R6_enfileirar_DIRETO_segue_recusado(self) -> None:
        """A capacidade não vazou ao ser ampliada."""
        _, a = self.monta()
        with self.assertRaises(IngressRefusal):
            a._enqueue_text_event(evento(texto="FORJADO"))
        self.assertEqual(self.capturados, [])

    def test_R6_capacidade_nao_sobrevive_ao_manipulador(self) -> None:
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento()), comando=False)
        self.assertEqual(len(self.capturados), 1)
        with self.assertRaises(IngressRefusal):
            a._enqueue_text_event(evento(texto="DEPOIS"))
        self.assertEqual(len(self.capturados), 1)

    def test_R6_a_entrega_realmente_ACONTECE(self) -> None:
        """
        O defeito silencioso da r5, medido: a corrotina descartada nunca entregava.
        Aqui a task é criada, drenada e o evento chega.
        """
        _, a = self.monta()
        entrega(a, MensagemFalsa("123456789", evento()))
        self.assertEqual(len(a.entregues), 1)
        self.assertIs(a.entregues[0].text, TEXTO)
        # E nenhuma task pendente ficou pelo caminho.
        self.assertFalse(a.__dict__.get("_creditum_pending_delivery"))


class ConsumoDaCapacidade(Base):
    """
    A4-R6B — a admissão é um direito de USO ÚNICO, não autoridade ambiente.

    O defeito que o Codex reproduziu: a capacidade seguia ativa enquanto o sink
    rodava e enquanto a task de entrega era criada. O sink podia reentrar no
    enfileiramento com um evento forjado e receber procedência genuína. Na
    reprodução local ele emitiu até estourar a pilha de recursão —
    `ISSUED ['LEGIT','FORJADO','FORJADO', ...]`.

    "Está dentro de um manipulador nativo" e "esta é a mensagem admitida" não são a
    mesma afirmação. Tratá-las como uma só foi o defeito, e a correção é consumir a
    admissão na entrada, antes de qualquer callback.
    """

    def _nativo(self):
        return sys.modules[compat.NATIVE_ADAPTER_MODULE]

    def tearDown(self) -> None:
        self._nativo().GANCHO_ENTREGA = None
        super().tearDown()

    def _monta_com_sink(self, sink):
        cls = register(ContextoFalso(), sink)
        return cls._creditum_adapter_factory(object())

    # ─── A: reentrância SÍNCRONA pelo sink ──────────────────────────────────

    def test_R6B_A_sink_reentrante_e_RECUSADO(self) -> None:
        emitidos, recusas = [], []

        def sink(ingresso):
            emitidos.append(ingresso.text)
            try:
                adaptador._enqueue_text_event(evento(texto="FORJADO", mid="99", uid=99))
            except IngressRefusal as e:
                recusas.append(str(e))

        adaptador = self._monta_com_sink(sink)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))

        self.assertEqual(emitidos, ["LEGIT"], "o sink cunhou procedência")
        self.assertEqual(len(recusas), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", recusas[0])
        self.assertEqual([e.text for e in adaptador.entregues], ["LEGIT"])

    # ─── B: reentrância de dentro da TASK de entrega ────────────────────────

    def test_R6B_B_reentrancia_de_dentro_da_task_e_RECUSADA(self) -> None:
        """
        A task COPIA o contexto no momento da criação. Criá-la antes do consumo
        daria à entrega a autoridade que acabamos de tirar do sink — então o teste
        roda DENTRO da task, e não só confere o contexto do pai depois.
        """
        recusas = []

        def gancho(adaptador_self, _event):
            try:
                adaptador_self._enqueue_text_event(
                    evento(texto="FORJADO-NA-TASK", mid="98", uid=98))
            except IngressRefusal as e:
                recusas.append(str(e))

        adaptador = self._monta_com_sink(self.capturados.append)
        self._nativo().GANCHO_ENTREGA = gancho
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))

        self.assertEqual(len(recusas), 1, "a task herdou direito de admissão")
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", recusas[0])
        self.assertEqual([i.text for i in self.capturados], ["LEGIT"])

    # ─── C: exatamente UMA emissão por admissão legítima ────────────────────

    def test_R6B_C_uma_mensagem_legitima_UMA_emissao(self) -> None:
        adaptador = self._monta_com_sink(self.capturados.append)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))
        self.assertEqual(len(self.capturados), 1)
        self.assertEqual(self.capturados[0].text, "LEGIT")
        self.assertEqual(self.capturados[0].source_message_count, 1)
        self.assertEqual(len(adaptador.entregues), 1)

    # ─── D: segunda chamada DENTRO da mesma admissão ────────────────────────

    def test_R6B_D_segundo_enfileiramento_na_MESMA_admissao_recusa(self) -> None:
        """
        Prova o §2: o consumo não é desfeito por nenhum `reset` intermediário. A
        segunda tentativa acontece ainda dentro do manipulador nativo.
        """
        resultados = []

        def sink(_i):
            for _ in range(2):
                try:
                    adaptador._enqueue_text_event(evento(texto="SEGUNDO"))
                    resultados.append("ACEITO")
                except IngressRefusal:
                    resultados.append("RECUSADO")

        adaptador = self._monta_com_sink(sink)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))
        self.assertEqual(resultados, ["RECUSADO", "RECUSADO"])

    # ─── E: exceção não deixa a capacidade presa ATIVA ──────────────────────

    def test_R6B_E_excecao_no_sink_nao_deixa_capacidade_ativa(self) -> None:
        def sink(_i):
            raise RuntimeError("sink quebrado")

        adaptador = self._monta_com_sink(sink)
        with self.assertRaises(RuntimeError):
            entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))
        with self.assertRaises(IngressRefusal):
            adaptador._enqueue_text_event(evento(texto="DEPOIS-DA-EXCECAO"))

    def test_R6B_E2_excecao_na_captura_nao_deixa_capacidade_ativa(self) -> None:
        """A captura recusa evento sem `message_id`; a admissão já foi consumida."""
        adaptador = self._monta_com_sink(self.capturados.append)
        ruim = evento()
        ruim.message_id = ""
        with self.assertRaises(IngressRefusal):
            entrega(adaptador, MensagemFalsa("123456789", ruim))
        self.assertEqual(self.capturados, [])
        with self.assertRaises(IngressRefusal):
            adaptador._enqueue_text_event(evento(texto="DEPOIS"))

    # ─── F e G: os dois caminhos nativos legítimos seguem passando ──────────

    def test_R6B_F_caminho_de_TEXTO_segue_passando(self) -> None:
        adaptador = self._monta_com_sink(self.capturados.append)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="TEXTO")))
        self.assertEqual([i.text for i in self.capturados], ["TEXTO"])
        self.assertEqual(adaptador.enfileirados, [])

    def test_R6B_G_caminho_de_COMANDO_LONGO_segue_passando(self) -> None:
        limiar = verify_compatibility().native_split_threshold
        adaptador = self._monta_com_sink(self.capturados.append)
        texto = "C" * limiar
        entrega(adaptador, MensagemFalsa("123456789", evento(texto=texto)), comando=True)
        self.assertEqual(len(self.capturados), 1)
        self.assertEqual(self.capturados[0].text, texto)
        self.assertEqual(len(adaptador.entregues), 1)

    def test_R6B_G2_o_consumo_vale_para_o_COMANDO_tambem(self) -> None:
        recusas = []

        def sink(_i):
            try:
                adaptador._enqueue_text_event(evento(texto="FORJADO"))
            except IngressRefusal as e:
                recusas.append(str(e))

        limiar = verify_compatibility().native_split_threshold
        adaptador = self._monta_com_sink(sink)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="C" * limiar)),
                comando=True)
        self.assertEqual(len(recusas), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", recusas[0])

    # ─── a precondição do consumo, MEDIDA no nativo ─────────────────────────

    def test_R6B_nativo_enfileira_UMA_vez_por_manipulador(self) -> None:
        """
        O consumo só é seguro se o nativo enfileirar no máximo uma vez por invocação.
        Se uma versão futura enfileirar duas, o consumo derrubaria a segunda EM
        SILÊNCIO — então o guarda recusa em vez de deixar acontecer.
        """
        verify_compatibility()   # a forma medida passa
        # Âncora no bloco ÚNICO do manipulador de texto: a linha isolada é
        # substring da linha indentada do comando, e mutaria os dois.
        fonte = muta("        event = self._build_message_event(msg)\n"
                     "        return self._enqueue_text_event(event)",
                     "        event = self._build_message_event(msg)\n"
                     "        self._enqueue_text_event(event)\n"
                     "        return self._enqueue_text_event(event)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_NOT_SINGLE_PER_HANDLER")
        self.assertIn("_handle_text_message", str(c.exception))

    # ─── a capacidade não é pública nem alcançável por atributo ─────────────

    def test_R6B_nenhuma_capacidade_publica(self) -> None:
        import creditum_hermes_telegram.adapter as mod
        for nome in dir(mod):
            valor = getattr(mod, nome)
            self.assertNotIsInstance(valor, __import__("contextvars").ContextVar,
                                     f"{nome} expõe o ContextVar")
        adaptador = self._monta_com_sink(self.capturados.append)
        for nome in dir(adaptador):
            if "capacid" in nome.lower() or "capabil" in nome.lower():
                self.fail(f"capacidade exposta em {nome}")


class AdmissaoNaoUsada(Base):
    """
    A4-R6C — a admissão também termina onde deixa de ser NECESSÁRIA.

    A r6b consumia a capacidade dentro do enfileiramento, o que cobre o caminho de
    texto e o de comando LONGO. O `_handle_command` genuíno tem duas formas de
    entrega, e a curta não passa pelo enfileiramento:

        if len(event.text or "") >= self._SPLIT_THRESHOLD:
            return self._enqueue_text_event(event)   # longa  → consome
        return await self.handle_message(event)      # curta  → NÃO passava por lá

    Num `/stop` a admissão seguia ativa durante toda a entrega. Reproduzido antes de
    corrigir: `REENTRY ['ACCEPT']`, `ISSUED ['FORGED-FROM-SHORT-COMMAND']`.

    O erro de modelo: supor que a admissão só termina onde é GASTA. Ela também
    termina onde deixa de ser necessária, e entregar é isso.
    """

    def _nativo(self):
        return sys.modules[compat.NATIVE_ADAPTER_MODULE]

    def tearDown(self) -> None:
        self._nativo().GANCHO_ENTREGA = None
        super().tearDown()

    def _monta(self, sink=None):
        cls = register(ContextoFalso(), sink or self.capturados.append)
        return cls._creditum_adapter_factory(object())

    def _gancho_reentrante(self, registro, texto="FORJADO-NA-ENTREGA"):
        def gancho(adaptador_self, _ev):
            try:
                adaptador_self._enqueue_text_event(evento(texto=texto, mid="97", uid=97))
                registro.append("ACEITO")
            except IngressRefusal as e:
                registro.append(f"RECUSADO:{e}")
        return gancho

    def _limiar(self) -> int:
        return verify_compatibility().native_split_threshold

    # ─── A/B/C: o achado exato, e os três números que ele exige ─────────────

    def test_R6C_A_comando_CURTO_com_gancho_reentrante_RECUSA(self) -> None:
        reentrancia = []
        adaptador = self._monta()
        self._nativo().GANCHO_ENTREGA = self._gancho_reentrante(reentrancia)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="/stop")),
                comando=True)

        self.assertEqual(len(reentrancia), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", reentrancia[0])
        # B: nenhuma emissão forjada. C: a entrega legítima aconteceu.
        self.assertEqual(self.capturados, [], "emissão forjada a partir do curto")
        self.assertEqual([e.text for e in adaptador.entregues], ["/stop"])

    def test_R6C_B_comando_curto_nao_produz_emissao_governada(self) -> None:
        """
        O curto entrega direto, sem enfileirar — então não há ingresso governado, e
        isso é a semântica nativa, não uma perda. O invariante é outro: a entrega
        direta não pode carregar autoridade não usada.
        """
        adaptador = self._monta()
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="/stop")),
                comando=True)
        self.assertEqual(self.capturados, [])
        self.assertEqual(len(adaptador.entregues), 1)

    # ─── D/E: a fronteira de entrega começa e PERMANECE limpa ───────────────

    def test_R6C_D_handle_message_comeca_LIMPO(self) -> None:
        vistos = []

        def gancho(adaptador_self, _ev):
            try:
                adaptador_self._enqueue_text_event(evento(texto="X"))
                vistos.append("ATIVO")
            except IngressRefusal:
                vistos.append("LIMPO")

        adaptador = self._monta()
        self._nativo().GANCHO_ENTREGA = gancho
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="/curto")),
                comando=True)
        self.assertEqual(vistos, ["LIMPO"])

    def test_R6C_E_permanece_limpo_DEPOIS_de_um_await(self) -> None:
        """
        `await` não restaura ContextVar; provo em vez de assumir.

        O gancho é AGUARDADO pela entrega, então a verificação roda na mesma task,
        depois de uma suspensão real. Agendar uma task à parte não serviria: ela não
        seria drenada, a lista ficaria vazia e o teste mediria o nada.
        """
        import asyncio as _asyncio
        vistos = []

        async def gancho(adaptador_self, _ev):
            await _asyncio.sleep(0)
            try:
                adaptador_self._enqueue_text_event(evento(texto="X"))
                vistos.append("ATIVO")
            except IngressRefusal:
                vistos.append("LIMPO")

        adaptador = self._monta()
        self._nativo().GANCHO_ENTREGA = gancho
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="/curto")),
                comando=True)
        self.assertEqual(vistos, ["LIMPO"])

    # ─── F: exceção na entrega direta não deixa autoridade presa ────────────

    def test_R6C_F_excecao_na_entrega_curta_deixa_LIMPO(self) -> None:
        def gancho(_self, _ev):
            raise RuntimeError("gancho quebrado")

        adaptador = self._monta()
        self._nativo().GANCHO_ENTREGA = gancho
        with self.assertRaises(RuntimeError):
            entrega(adaptador, MensagemFalsa("123456789", evento(texto="/stop")),
                    comando=True)
        with self.assertRaises(IngressRefusal):
            adaptador._enqueue_text_event(evento(texto="DEPOIS"))

    # ─── G/H: as duas vias que já funcionavam seguem funcionando ────────────

    def test_R6C_G_comando_LONGO_segue_passando(self) -> None:
        adaptador = self._monta()
        texto = "C" * self._limiar()
        entrega(adaptador, MensagemFalsa("123456789", evento(texto=texto)), comando=True)
        self.assertEqual([i.text for i in self.capturados], [texto])
        self.assertEqual(len(adaptador.entregues), 1)

    def test_R6C_G2_o_descarte_em_contexto_LIMPO_e_inofensivo(self) -> None:
        """O longo consome no enfileiramento; a entrega depois descarta o nada."""
        reentrancia = []
        adaptador = self._monta()
        self._nativo().GANCHO_ENTREGA = self._gancho_reentrante(reentrancia)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="C" * self._limiar())),
                comando=True)
        self.assertEqual(len(self.capturados), 1, "a emissão legítima sumiu")
        self.assertEqual(len(reentrancia), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", reentrancia[0])

    def test_R6C_H_caminho_de_TEXTO_segue_passando(self) -> None:
        reentrancia = []
        adaptador = self._monta()
        self._nativo().GANCHO_ENTREGA = self._gancho_reentrante(reentrancia)
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="TEXTO")))
        self.assertEqual([i.text for i in self.capturados], ["TEXTO"])
        self.assertEqual(len(reentrancia), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", reentrancia[0])

    # ─── I: divergência estrutural da forma de entrega RECUSA ───────────────

    def test_R6C_I_entrega_direta_A_MAIS_no_comando_recusa(self) -> None:
        fonte = muta("        return await self.handle_message(event)",
                     "        await self.handle_message(event)\n"
                     "        return await self.handle_message(event)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_DELIVERY_SHAPE_UNEXPECTED")
        self.assertIn("_handle_command", str(c.exception))

    def test_R6C_I2_entrega_direta_APARECENDO_no_texto_recusa(self) -> None:
        """O texto não entrega direto na 0.20.4. Se passar a entregar, revisão."""
        fonte = muta("        event = self._build_message_event(msg)\n"
                     "        return self._enqueue_text_event(event)",
                     "        event = self._build_message_event(msg)\n"
                     "        await self.handle_message(event)\n"
                     "        return self._enqueue_text_event(event)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_DELIVERY_SHAPE_UNEXPECTED")
        self.assertIn("_handle_text_message", str(c.exception))

    def test_R6C_I3_a_forma_medida_e_a_da_0_20_4(self) -> None:
        self.assertEqual(compat.FORMAS_DE_ENTREGA["_handle_text_message"], (1, 0))
        self.assertEqual(compat.FORMAS_DE_ENTREGA["_handle_command"], (1, 1))
        verify_compatibility()   # a forma real passa

    # ─── §11: admissão aninhada falha FECHADA ───────────────────────────────

    # ─── §1: o teste inválido, substituído ──────────────────────────────────
    #
    # O anterior chamava `run_until_complete` de DENTRO de um loop já rodando.
    # Isso levanta `RuntimeError` antes de exercitar a reentrância, e ele capturava
    # `Exception` amplo — então passava sem medir nada. Um teste que não pode falhar
    # pelo motivo certo não é um teste.
    #
    # O substituto é assíncrono no MESMO loop, conta a tentativa explicitamente, e
    # falha se a reentrância não tiver sido de fato executada.

    async def _reentra_pelo_wrapper(self, adaptador, *, comando, registro):
        """Chama o wrapper nativo de dentro da entrega. Sem loop novo."""
        alvo = (adaptador._handle_command if comando
                else adaptador._handle_text_message)
        try:
            await alvo(MensagemFalsa("123456789",
                                     evento(texto="FORJADO-VIA-WRAPPER",
                                            mid="96", uid=96)), None)
            registro["resultado"] = "RETORNOU"
        except IngressRefusal as e:
            registro["resultado"] = f"IngressRefusal:{e}"
        except Exception as e:  # noqa: BLE001
            registro["resultado"] = f"{type(e).__name__}:{e}"

    def _mede_reentrada(self, *, comando_na_reentrada, comando_na_origem=True):
        """
        Mede a reentrada pelo wrapper a partir do callback de ENTREGA.

        UMA tentativa, com trava: sem ela a reentrância recursa — medido, a primeira
        versão deste teste chegou a cinco níveis antes de parar, porque cada
        reentrada entrega e a entrega dispara o gancho de novo.

        Nada é inferido. `tentou` prova que a chamada ocorreu; a autorização nativa é
        contada no próprio dublê; e a ausência de qualquer um reprova o teste.
        """
        registro: dict = {"tentou": 0, "auth_chamada": 0, "auth_passou": 0}
        adaptador = self._monta()
        nativo = self._nativo()

        autoriza_original = nativo.TelegramAdapter._is_user_authorized_from_message

        def conta_auth(self_ad, msg):
            registro["auth_chamada"] += 1
            resultado = autoriza_original(self_ad, msg)
            registro["auth_passou"] += 1 if resultado else 0
            return resultado

        nativo.TelegramAdapter._is_user_authorized_from_message = conta_auth
        self.addCleanup(lambda: setattr(
            nativo.TelegramAdapter, "_is_user_authorized_from_message",
            autoriza_original))

        async def gancho(adaptador_self, _ev):
            if registro["tentou"]:
                return                      # trava: uma tentativa só
            registro["tentou"] = 1
            await self._reentra_pelo_wrapper(
                adaptador_self, comando=comando_na_reentrada, registro=registro)

        nativo.GANCHO_ENTREGA = gancho
        texto = "/stop" if comando_na_origem else "MENSAGEM"
        entrega(adaptador, MensagemFalsa("123456789", evento(texto=texto)),
                comando=comando_na_origem)
        registro["emitidos"] = [i.text for i in self.capturados]
        registro["entregues"] = [e.text for e in adaptador.entregues]
        registro["forjados"] = sum(1 for t in registro["emitidos"]
                                   if t == "FORJADO-VIA-WRAPPER")
        return registro

    def test_R6D_reentrada_pelo_wrapper_de_TEXTO_e_RECUSADA(self) -> None:
        """
        O achado que a r6c-inv mediu, agora fechado pela r6d.

        Antes: o callback de entrega reentrava por `_handle_text_message`, a
        autorização nativa rodava e PASSAVA — porque ela confere a identidade que o
        objeto DECLARA, não a origem — e um ingresso governado forjado saía.

        Agora o método nomeado não abre admissão nenhuma. A autorização nativa
        continua rodando (medida abaixo), o caminho chega ao enfileiramento, e ali
        recusa por falta de admissão.
        """
        r = self._mede_reentrada(comando_na_reentrada=False)
        self.assertEqual(r["tentou"], 1, "a reentrância NÃO foi executada")
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", r["resultado"])
        self.assertGreaterEqual(r["auth_chamada"], 2,
                                "a autorização nativa deixou de rodar")
        self.assertGreaterEqual(r["auth_passou"], 2,
                                "a recusa veio da allowlist, não da admissão")
        self.assertEqual(r["forjados"], 0, "ingresso forjado foi emitido")

    def test_R6D_reentrada_pelo_wrapper_de_COMANDO_nao_emite(self) -> None:
        r = self._mede_reentrada(comando_na_reentrada=True)
        self.assertEqual(r["tentou"], 1, "a reentrância NÃO foi executada")
        self.assertGreaterEqual(r["auth_chamada"], 2)
        self.assertEqual(r["forjados"], 0)

    def test_R6D_chamador_COMUM_tambem_e_recusado(self) -> None:
        """
        O enquadramento que importa: o callback de entrega nunca foi privilegiado —
        era a superfície de chamada direta, aberta a qualquer código do processo.
        Fechá-la para o callback sem fechá-la para o chamador comum não teria
        fechado nada.
        """
        import asyncio as _asyncio
        adaptador = self._monta()

        async def direto():
            await adaptador._handle_text_message(
                MensagemFalsa("123456789", evento(texto="CHAMADOR-COMUM")), None)

        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(direto())
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", str(c.exception))
        self.assertEqual(self.capturados, [])

    def test_R6D_a_via_REGISTRADA_continua_emitindo(self) -> None:
        """O outro lado do controle: fechar a porta errada não pode fechar a certa."""
        adaptador = self._monta()
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGITIMO")))
        self.assertEqual([i.text for i in self.capturados], ["LEGITIMO"])

    def test_R6D_o_metodo_nomeado_NAO_e_mais_sobrescrito(self) -> None:
        """
        Sobrescrever só para repassar daria a impressão de que o método ainda é a
        porta. A classe governada não os declara.
        """
        adaptador = self._monta()
        for nome in sorted(compat.CHAMADORES_DO_ENFILEIRAMENTO):
            self.assertNotIn(nome, type(adaptador).__dict__,
                             f"{nome} ainda é sobrescrito")
        self.assertIn(compat.METODO_REGISTRA_HANDLERS, type(adaptador).__dict__)

    def test_R6D_handlers_nao_governados_passam_INTACTOS(self) -> None:
        """O proxy troca dois callbacks; os outros seguem como o nativo registrou."""
        adaptador = self._monta()
        despachantes(adaptador)          # conecta pelo ciclo de vida governado
        rotulos = {h.rotulo: (h, a, k) for h, a, k in adaptador._app.handlers}
        self.assertEqual(set(rotulos), {"texto", "comando", "outro"})
        outro, _a, kwargs = rotulos["outro"]
        self.assertIs(outro.callback.__func__,
                      type(adaptador)._handle_outro)
        self.assertEqual(kwargs, {"group": 99}, "o grupo do handler se perdeu")
        for rotulo in ("texto", "comando"):
            self.assertTrue(rotulos[rotulo][0].callback.__name__
                            .startswith("creditum_admissao_"))

    def test_R6D_registro_que_NAO_intercepta_falha_fechado(self) -> None:
        """
        Se uma versão futura deixar de registrar um dos dois por aqui, nenhuma
        admissão nasceria para ele e o ingresso sumiria em SILÊNCIO.
        """
        fonte = muta('        app.add_handler(HandlerFalso("comando", self._handle_command))\n',
                     "")
        instala_hermes(fonte=fonte)
        # A prova de origem já recusa antes, na compatibilidade.
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertIn(c.exception.defect,
                      ("NATIVE_HANDLER_NOT_REGISTERED_HERE",
                       "NATIVE_HANDLER_REFERENCED_ELSEWHERE"))

    def test_R6C_INV_identidade_NAO_autorizada_nao_emite(self) -> None:
        """A fronteira que de fato governa: a allowlist nativa."""
        registro: dict = {}
        adaptador = self._monta()

        async def gancho(adaptador_self, _ev):
            if registro.get("tentou"):
                return
            registro["tentou"] = 1
            await adaptador_self._handle_text_message(
                MensagemFalsa("000000", evento(texto="NAO-AUTORIZADO")), None)

        self._nativo().GANCHO_ENTREGA = gancho
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="/stop")),
                comando=True)
        self.assertEqual(registro.get("tentou"), 1)
        self.assertEqual(self.capturados, [], "identidade não autorizada emitiu")

    def test_R6C_INV_admissao_ANINHADA_de_verdade_RECUSA(self) -> None:
        """
        O invariante que o teste quebrado queria provar, agora exercitado de fato:
        chamar o wrapper enquanto a admissão AINDA está ativa recusa.

        A janela existe dentro do manipulador nativo, antes do enfileiramento —
        então uso o sink? Não: o sink roda depois do consumo. A janela real é o
        próprio corpo nativo, e o dublê a expõe pelo `_build_message_event`.
        """
        registro: dict = {}
        adaptador = self._monta()
        nativo = self._nativo()
        original = nativo.TelegramAdapter._build_message_event

        def constroi_e_reentra(self_ad, msg):
            if not registro.get("tentou"):
                registro["tentou"] = 1
                # Aqui a admissão AINDA está ativa: o enfileiramento não ocorreu.
                import asyncio as _a
                tarefa = _a.ensure_future(
                    self._reentra_pelo_wrapper(self_ad, comando=False,
                                               registro=registro))
                registro["tarefa"] = tarefa
            return original(self_ad, msg)

        nativo.TelegramAdapter._build_message_event = constroi_e_reentra
        self.addCleanup(
            lambda: setattr(nativo.TelegramAdapter, "_build_message_event", original))
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))
        self.assertEqual(registro.get("tentou"), 1, "a reentrância não rodou")


class OrigemDoRegistro(Base):
    """
    A4-R6E — o direito de REGISTRAR também é autoridade, e também tem origem.

    A r6d tirou o nome da porta: a admissão passou a nascer no chamável que o PTB
    guarda, e chamar `_handle_text_message` direto deixou de conceder autoridade.

    Mas `_register_handlers` continuava aceitando QUALQUER objeto com `add_handler`.
    Chamar `adapter._register_handlers(coletor)` devolvia o chamável privilegiado de
    bandeja — sem introspecção nenhuma, só uma chamada de método. A porta tinha
    perdido o nome e ganhado uma chave sob o tapete.

    Agora o registro exige a capacidade emitida pelo `connect` governado, exige que o
    app seja o que o nativo acabou de construir, e é de uso único por aplicação.
    """

    def _monta(self):
        cls = register(ContextoFalso(), self.capturados.append)
        return cls._creditum_adapter_factory(object())

    def _monta_com_connect(self, conecta):
        """
        Troca o `connect` NATIVO e só então monta a classe governada.

        A ordem importa e me custou uma rodada: `conecta_governada` captura o
        `connect` nativo no momento em que a classe é construída — captura léxica,
        que é o comportamento certo em produção. Trocar depois não muda nada, e o
        teste mediria o `connect` original achando que media o dublê.
        """
        nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        original = nativo.TelegramAdapter.connect
        nativo.TelegramAdapter.connect = conecta
        resela_connect()
        self.addCleanup(lambda: setattr(nativo.TelegramAdapter, "connect", original))
        return self._monta(), nativo

    def _coletor(self):
        class Coletor:
            def __init__(self):
                self.handlers = []

            def add_handler(self, handler, *a, **k):
                self.handlers.append(handler)
        return Coletor()

    # ─── o achado exato, fechado ────────────────────────────────────────────

    def test_R6E_registro_com_APP_DO_CHAMADOR_recusa(self) -> None:
        adaptador = self._monta()
        coletor = self._coletor()
        with self.assertRaises(IngressRefusal) as c:
            adaptador._register_handlers(coletor)
        self.assertIn("REGISTRATION_OUTSIDE_NATIVE_CONNECT", str(c.exception))
        self.assertEqual(coletor.handlers, [], "o chamável governado vazou")

    def test_R6E_o_chamavel_governado_NAO_chega_ao_coletor(self) -> None:
        """
        A prova que importa não é a exceção: é que nada privilegiado foi entregue.
        """
        adaptador = self._monta()
        coletor = self._coletor()
        with self.assertRaises(IngressRefusal):
            adaptador._register_handlers(coletor)
        for h in coletor.handlers:
            self.assertFalse(getattr(h.callback, "__name__", "")
                             .startswith("creditum_admissao_"))
        self.assertEqual(self.capturados, [])

    def test_R6E_registro_ISOLADO_mesmo_com_o_app_proprio_recusa(self) -> None:
        """Ter o app certo não basta: fora do `connect` não há direito de registrar."""
        adaptador = self._monta()
        despachantes(adaptador)                      # conecta uma vez
        proprio = adaptador._app
        with self.assertRaises(IngressRefusal) as c:
            adaptador._register_handlers(proprio)
        self.assertIn("REGISTRATION_OUTSIDE_NATIVE_CONNECT", str(c.exception))

    def test_R6E_segundo_registro_do_MESMO_app_recusa(self) -> None:
        """
        Uso único POR APLICAÇÃO. Simulo o `connect` nativo chamando o registro duas
        vezes com o mesmo objeto — o segundo tem de recusar.
        """
        import asyncio as _asyncio

        async def conecta_duas_vezes(self_ad, *, is_reconnect=False):
            self_ad._app = sys.modules[
                compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
            self_ad._register_handlers(self_ad._app)
            self_ad._register_handlers(self_ad._app)      # ← o mesmo app
            return True

        adaptador, _nativo = self._monta_com_connect(conecta_duas_vezes)
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_ALREADY_DONE_FOR_APP", str(c.exception))

    def test_R6E_app_que_nao_e_o_proprio_recusa_mesmo_dentro_do_connect(self) -> None:
        """Plantar `_app` não adianta: o nativo o sobrescreve antes de registrar."""
        import asyncio as _asyncio
        intruso = self._coletor()

        async def conecta_com_intruso(self_ad, *, is_reconnect=False):
            self_ad._app = sys.modules[
                compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
            self_ad._register_handlers(intruso)           # ← não é o self._app
            return True

        adaptador, _nativo = self._monta_com_connect(conecta_com_intruso)
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_APP_NOT_OWNED", str(c.exception))
        self.assertEqual(intruso.handlers, [])

    # ─── o caminho legítimo, e a reconstrução ───────────────────────────────

    def test_R6E_o_ciclo_de_vida_legitimo_registra(self) -> None:
        cbs = despachantes(self._monta())
        self.assertEqual(set(cbs), {"texto", "comando", "outro"})
        for rotulo in ("texto", "comando"):
            self.assertTrue(cbs[rotulo].__name__.startswith("creditum_admissao_"))

    def test_R6E_reconstrucao_no_mesmo_connect_registra_o_app_NOVO(self) -> None:
        """
        O `connect` genuíno reconstrói o app num caminho de retry e registra de novo.
        Uso único por APLICAÇÃO, não por `connect` — senão a reconstrução quebraria.
        """
        import asyncio as _asyncio
        vistos = []

        async def conecta_com_retry(self_ad, *, is_reconnect=False):
            for _ in range(2):
                self_ad._app = sys.modules[
                    compat.NATIVE_ADAPTER_MODULE].Application.builder().build()  # NOVO
                self_ad._register_handlers(self_ad._app)
                vistos.append(self_ad._app)
            return True

        adaptador, _nativo = self._monta_com_connect(conecta_com_retry)
        _asyncio.run(adaptador.connect())
        self.assertEqual(len(vistos), 2)
        self.assertIsNot(vistos[0], vistos[1])
        for app in vistos:
            nomes = [h.callback.__name__ for h, _a, _k in app.handlers]
            self.assertEqual(sum(1 for n in nomes
                                 if n.startswith("creditum_admissao_")), 2)

    def test_R6E_a_capacidade_de_registro_nao_sobrevive_ao_connect(self) -> None:
        adaptador = self._monta()
        despachantes(adaptador)
        with self.assertRaises(IngressRefusal) as c:
            adaptador._register_handlers(adaptador._app)
        self.assertIn("REGISTRATION_OUTSIDE_NATIVE_CONNECT", str(c.exception))

    def test_R6E_a_via_legitima_segue_emitindo_UM_ingresso(self) -> None:
        adaptador = self._monta()
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGITIMO")))
        self.assertEqual([i.text for i in self.capturados], ["LEGITIMO"])

    # ─── as duas capacidades são DISTINTAS ──────────────────────────────────

    def test_R6E_capacidade_de_registro_NAO_e_a_de_admissao(self) -> None:
        """
        Se fossem a mesma, estar dentro do `connect` bastaria para emitir ingresso —
        e o `connect` roda muito código nativo.
        """
        import asyncio as _asyncio
        resultado = {}

        async def conecta_e_tenta_emitir(self_ad, *, is_reconnect=False):
            self_ad._app = sys.modules[
                compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
            self_ad._register_handlers(self_ad._app)
            try:
                self_ad._enqueue_text_event(evento(texto="DE-DENTRO-DO-CONNECT"))
                resultado["r"] = "ACEITO"
            except IngressRefusal as e:
                resultado["r"] = str(e)
            return True

        adaptador, _nativo = self._monta_com_connect(conecta_e_tenta_emitir)
        _asyncio.run(adaptador.connect())
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", resultado["r"])
        self.assertEqual(self.capturados, [])

    # ─── a prova estrutural que sustenta o portão ───────────────────────────

    def test_R6E_registro_FORA_do_connect_no_nativo_recusa(self) -> None:
        fonte = muta("    async def connect(self, *, is_reconnect=False):\n"
                     '        """O ciclo de vida que CONSTRÓI a Application e só então registra.\n',
                     "    def _registra_por_fora(self):\n"
                     "        self._register_handlers(self._app)\n"
                     "\n"
                     "    async def connect(self, *, is_reconnect=False):\n"
                     '        """O ciclo de vida que CONSTRÓI a Application e só então registra.\n')
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_REGISTRATION_OUTSIDE_CONNECT")

    def test_R6E_registrar_OUTRO_objeto_no_nativo_recusa(self) -> None:
        fonte = muta("        self._register_handlers(self._app)",
                     "        self._register_handlers(AplicacaoFalsa())")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect,
                         "NATIVE_REGISTRATION_ARGUMENT_UNEXPECTED")

    def test_R6E_connect_SINCRONO_recusa(self) -> None:
        fonte = muta("    async def connect(self, *, is_reconnect=False):",
                     "    def connect(self, *, is_reconnect=False):")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_CONNECT_NOT_ASYNC")


class HistoricoDeRegistro(Base):
    """
    A4-R6F — dois achados independentes, e os dois sobre PROCEDÊNCIA.

    **A origem do app.** A r6e provava de onde o registro é chamado e como o
    argumento é escrito, e não o que estava no atributo. `self._app = app_do_chamador`
    seguido de `self._register_handlers(self._app)` satisfazia tudo. Conferir a grafia
    do argumento não é conferir a procedência do valor.

    **O histórico.** O uso único guardava só o ÚLTIMO app, então A→B→A aceitava a
    terceira: A já não era o último. É o padrão A→B→A que a a6-r4 me ensinou e que eu
    não generalizei.
    """

    def _monta(self):
        cls = register(ContextoFalso(), self.capturados.append)
        return cls._creditum_adapter_factory(object())

    def _monta_com_connect(self, conecta):
        nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        original = nativo.TelegramAdapter.connect
        nativo.TelegramAdapter.connect = conecta
        resela_connect()
        self.addCleanup(lambda: setattr(nativo.TelegramAdapter, "connect", original))
        return self._monta(), nativo

    def _governados(self, app) -> int:
        return sum(1 for h, _a, _k in app.handlers
                   if getattr(h.callback, "__name__", "").startswith("creditum_admissao_"))

    # ─── A/B/C: a origem do app, provada estruturalmente ────────────────────

    def test_R6F_A_a_construcao_DOMINA_o_registro(self) -> None:
        """A forma medida na 0.20.4 passa: `builder.build()` e o registro em seguida."""
        p = verify_compatibility()
        self.assertEqual(p.platform_name, "telegram")

    def test_R6F_B_atribuir_APP_DO_CHAMADOR_recusa(self) -> None:
        """
        A mutação exata do achado da r6f.

        Desde a r6g a recusa vem ANTES na cadeia: a mutação apaga o produtor, e a
        prova de proveniência do construtor recusa antes de chegar ao `self._app`.
        Recusar mais cedo é mais forte, não mais fraco.
        """
        fonte = muta('        builder = Application.builder().token("sintetico")\n'
                     '        builder = builder.base_url("https://nao.usado.invalido")\n'
                     "        self._app = builder.build()\n",
                     "        self._app = self.app_do_chamador\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_ORIGIN_UNPROVEN")
        self.assertEqual(self.capturados, [])

    def test_R6F_C_atribuicao_ALTERNATIVA_alcancavel_recusa(self) -> None:
        """
        Construir e depois sobrescrever com outra coisa antes de registrar: a
        construção deixa de dominar, e o comando anterior mais próximo não é build.
        """
        fonte = muta("        self._app = builder.build()\n"
                     "        self._register_handlers(self._app)",
                     "        self._app = builder.build()\n"
                     "        self._app = self.app_do_chamador\n"
                     "        self._register_handlers(self._app)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertIn(c.exception.defect,
                      ("NATIVE_APP_ASSIGNMENT_UNEXPECTED",
                       "NATIVE_APP_ORIGIN_NOT_PROVEN"))

    def test_R6F_C2_registro_SEM_construcao_no_bloco_recusa(self) -> None:
        fonte = muta('        builder = Application.builder().token("sintetico")\n'
                     '        builder = builder.base_url("https://nao.usado.invalido")\n'
                     "        self._app = builder.build()\n"
                     "        self._register_handlers(self._app)",
                     "        self._register_handlers(self._app)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        # Sem produtor no bloco não há construtor a provar: a recusa é a da r6g.
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_ORIGIN_UNPROVEN")

    # ─── D/E/F: o histórico de identidades ──────────────────────────────────

    def test_R6F_D_retry_genuino_A_para_B_PASSA(self) -> None:
        """A forma real da 0.20.4: constrói um app novo e registra de novo."""
        import asyncio as _asyncio
        vistos = []

        async def conecta_a_e_b(self_ad, *, is_reconnect=False):
            for _ in range(2):
                self_ad._app = sys.modules[
                    compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
                self_ad._register_handlers(self_ad._app)
                vistos.append(self_ad._app)
            return True

        adaptador, _n = self._monta_com_connect(conecta_a_e_b)
        _asyncio.run(adaptador.connect())
        self.assertEqual(len(vistos), 2)
        self.assertIsNot(vistos[0], vistos[1])
        self.assertEqual([self._governados(a) for a in vistos], [2, 2])

    def test_R6F_E_A_B_A_a_TERCEIRA_recusa(self) -> None:
        """O achado exato: A já não é o último, e voltava a ser elegível."""
        import asyncio as _asyncio
        estado = {}

        async def conecta_a_b_a(self_ad, *, is_reconnect=False):
            nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
            a = nat.Application.builder().build()
            b = nat.Application.builder().build()
            estado["a"], estado["b"] = a, b
            self_ad._app = a
            self_ad._register_handlers(self_ad._app)
            self_ad._app = b
            self_ad._register_handlers(self_ad._app)
            self_ad._app = a                      # ← volta para A
            self_ad._register_handlers(self_ad._app)
            return True

        adaptador, _n = self._monta_com_connect(conecta_a_b_a)
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_ALREADY_DONE_FOR_APP", str(c.exception))
        self.assertEqual(self._governados(estado["a"]), 2, "A recebeu callbacks a mais")
        self.assertEqual(self._governados(estado["b"]), 2)

    def test_R6F_F_mesmo_app_IMEDIATAMENTE_de_novo_recusa(self) -> None:
        import asyncio as _asyncio
        estado = {}

        async def conecta_duas_vezes(self_ad, *, is_reconnect=False):
            self_ad._app = sys.modules[
                compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
            estado["a"] = self_ad._app
            self_ad._register_handlers(self_ad._app)
            self_ad._register_handlers(self_ad._app)
            return True

        adaptador, _n = self._monta_com_connect(conecta_duas_vezes)
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_ALREADY_DONE_FOR_APP", str(c.exception))
        self.assertEqual(self._governados(estado["a"]), 2)

    # ─── J/K: id não é autoridade ───────────────────────────────────────────

    def test_R6F_J_id_reusado_NAO_conta_como_ja_registrado(self) -> None:
        """
        O CPython reusa ids de objetos coletados. Se o id sozinho fosse autoridade,
        um app novo herdaria o "já registrado" de um morto e seria recusado —
        indisponibilidade silenciosa em vez de segurança.
        """
        import weakref as _weakref
        adaptador = self._monta()
        historico = adaptador.__dict__.setdefault("_creditum_registered_apps", {})

        class Qualquer:
            pass

        morto = Qualquer()
        chave = id(morto)
        historico[chave] = _weakref.ref(morto)
        del morto
        import gc; gc.collect()
        self.assertIsNone(historico[chave]())        # referência morta

        novo = sys.modules[compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
        anterior = historico.get(id(novo))
        # A regra do produto: só conta se a referência resolver para ESTE objeto.
        self.assertFalse(anterior is not None and anterior() is novo)

    def test_R6F_K_referencias_mortas_sao_expurgadas(self) -> None:
        import asyncio as _asyncio
        import gc

        async def conecta(self_ad, *, is_reconnect=False):
            self_ad._app = sys.modules[
                compat.NATIVE_ADAPTER_MODULE].Application.builder().build()
            self_ad._register_handlers(self_ad._app)
            return True

        adaptador, _n = self._monta_com_connect(conecta)
        _asyncio.run(adaptador.connect())
        historico = adaptador.__dict__["_creditum_registered_apps"]
        self.assertEqual(len(historico), 1)
        adaptador._app = None
        gc.collect()
        # O expurgo acontece no próximo registro; aqui provo que a entrada morreu.
        self.assertTrue(all(r() is None for r in historico.values()))

    def test_R6F_L_registro_que_FALHA_nao_queima_o_app_seguinte(self) -> None:
        """
        Um registro que recusa não instalou nada e não pode inviabilizar a tentativa
        correta seguinte. E não deixa handler pela metade no app que falhou.
        """
        import asyncio as _asyncio
        estado = {}

        async def conecta(self_ad, *, is_reconnect=False):
            nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
            ruim = nat.Application.builder().build()
            estado["ruim"] = ruim
            self_ad._app = ruim
            try:
                self_ad._register_handlers(nat.Application.builder().build())  # não é o próprio
            except IngressRefusal as e:
                estado["recusa"] = str(e)
            bom = nat.Application.builder().build()
            estado["bom"] = bom
            self_ad._app = bom
            self_ad._register_handlers(self_ad._app)
            return True

        adaptador, _n = self._monta_com_connect(conecta)
        _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_APP_NOT_OWNED", estado["recusa"])
        self.assertEqual(self._governados(estado["bom"]), 2, "o app bom foi queimado")
        self.assertEqual(estado["ruim"].handlers, [], "o app que falhou ficou sujo")

    def test_R6F_atomicidade_nada_chega_ao_app_antes_da_conferencia(self) -> None:
        """
        Se a topologia divergir, o app não recebe handler NENHUM — nem os quatro
        nativos. Retenho as instalações até saber que o conjunto está certo.
        """
        import asyncio as _asyncio
        fonte = muta('        app.add_handler(HandlerFalso("comando", self._handle_command))\n',
                     "")
        instala_hermes(fonte=fonte)
        # A prova de origem do despacho recusa antes; se um dia não recusar, a
        # atomicidade é o que impede o app de ficar meio registrado.
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    # ─── G/H/I: o que a r6e já garantia, reconferido ────────────────────────

    def test_R6F_G_app_do_chamador_recebe_ZERO_callbacks(self) -> None:
        class Coletor:
            def __init__(self): self.handlers = []
            def add_handler(self, h, *a, **k): self.handlers.append(h)

        adaptador = self._monta()
        c = Coletor()
        with self.assertRaises(IngressRefusal):
            adaptador._register_handlers(c)
        self.assertEqual(c.handlers, [])

    def test_R6F_H_app_ERRADO_dentro_do_connect_recusa(self) -> None:
        import asyncio as _asyncio

        async def conecta_com_intruso(self_ad, *, is_reconnect=False):
            nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
            self_ad._app = nat.Application.builder().build()
            self_ad._register_handlers(nat.Application.builder().build())
            return True

        adaptador, _n = self._monta_com_connect(conecta_com_intruso)
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_APP_NOT_OWNED", str(c.exception))

    def test_R6F_I_app_novo_do_ciclo_de_vida_PASSA(self) -> None:
        cbs = despachantes(self._monta())
        self.assertEqual(set(cbs), {"texto", "comando", "outro"})

    # ─── M/N: nada do que já estava fechado regrediu ────────────────────────

    def test_R6F_M_metodos_nomeados_seguem_sem_autoridade(self) -> None:
        import asyncio as _asyncio
        adaptador = self._monta()
        with self.assertRaises(IngressRefusal):
            _asyncio.run(adaptador._handle_text_message(
                MensagemFalsa("123456789", evento(texto="DIRETO")), None))
        self.assertEqual(self.capturados, [])

    def test_R6F_N_admissao_de_uso_unico_preservada(self) -> None:
        reentrancia = []

        def sink(_i):
            try:
                adaptador._enqueue_text_event(evento(texto="FORJADO"))
            except IngressRefusal as e:
                reentrancia.append(str(e))

        cls = register(ContextoFalso(), sink)
        adaptador = cls._creditum_adapter_factory(object())
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))
        self.assertEqual(len(reentrancia), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", reentrancia[0])


class ProvenienciaDoConstrutor(Base):
    """
    A4-R6G — proveniência do CONSTRUTOR, não a grafia do receptor.

    A r6f exigia `<algo>.build()`. Qualquer receptor com um método chamado `build`
    servia, então uma deriva podia fazer

        builder = self.app_do_chamador
        self._app = builder.build()

    e passar. Reduzir proveniência a uma grafia foi o mesmo erro da r6f uma camada
    acima — e desta vez a forma que eu confundi com autoridade era a do receptor.

    Medido na 0.20.4: o símbolo nasce em `Application.builder().token(...)` e é
    reatribuído QUATRO vezes por encadeamento fluente. Proibir reatribuição
    rejeitaria o genuíno; o que vale é o enraizamento.
    """

    CONSTRUTOR = ('        builder = Application.builder().token("sintetico")\n'
                  '        builder = builder.base_url("https://nao.usado.invalido")\n')

    def _governados(self, app) -> int:
        return sum(1 for h, _a, _k in app.handlers
                   if getattr(h.callback, "__name__", "").startswith("creditum_admissao_"))

    # ─── A: a forma genuína passa ───────────────────────────────────────────

    def test_R6G_A_produtor_genuino_ACEITO(self) -> None:
        p = verify_compatibility()
        self.assertEqual(p.adapter_compat_id, compat.ADAPTER_COMPAT_ID)
        self.assertEqual(compat.PRODUTOR_DA_APLICACAO, "Application")
        self.assertEqual(compat.MODULO_DO_PRODUTOR, "telegram.ext")

    def test_R6G_A2_encadeamento_fluente_e_ACEITO(self) -> None:
        """Quatro reatribuições no genuíno. Proibi-las rejeitaria produção válida."""
        fonte = muta(self.CONSTRUTOR,
                     self.CONSTRUTOR
                     + '        builder = builder.request("r")\n')
        instala_hermes(fonte=fonte)
        verify_compatibility()          # não levanta

    # ─── B: a mutação exata do achado ───────────────────────────────────────

    def test_R6G_B_construtor_DO_CHAMADOR_recusa(self) -> None:
        fonte = muta(self.CONSTRUTOR, "        builder = self.app_do_chamador\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_ORIGIN_UNPROVEN")
        self.assertEqual(self.capturados, [])

    # ─── C: reatribuição ALTERNATIVA, distinta de trocar o produtor ─────────

    def test_R6G_C_reatribuicao_alternativa_do_construtor_recusa(self) -> None:
        """
        A raiz continua genuína; o que muda é o valor logo antes do build. Este é o
        caso que uma checagem só da primeira atribuição deixaria passar.
        """
        fonte = muta(self.CONSTRUTOR + "        self._app = builder.build()",
                     self.CONSTRUTOR
                     + "        builder = self.app_do_chamador\n"
                     + "        self._app = builder.build()")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_REBOUND")

    # ─── D: receptor arbitrário com um método chamado build ─────────────────

    def test_R6G_D_receptor_ARBITRARIO_com_build_recusa(self) -> None:
        fonte = muta("        self._app = builder.build()",
                     "        self._app = self.app_do_chamador.build()")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertIn(c.exception.defect,
                      ("NATIVE_APP_ASSIGNMENT_UNEXPECTED",
                       "NATIVE_APP_ORIGIN_NOT_PROVEN"))

    def test_R6G_D2_produtor_com_NOME_parecido_recusa(self) -> None:
        """
        `Impostor.builder()` tem a mesma forma. O que o separa é identidade de
        objeto contra `telegram.ext.Application` — não a grafia do nome.
        """
        fonte = muta("        builder = Application.builder().token(\"sintetico\")",
                     "        builder = Impostor.builder().token(\"sintetico\")")
        fonte = muta("from telegram.ext import Application\n",
                     "from telegram.ext import Application\n"
                     "Impostor = Application\n", fonte=fonte)
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_ORIGIN_UNPROVEN")

    def test_R6G_D3_Application_que_nao_e_o_de_telegram_ext_recusa(self) -> None:
        """A identidade é de OBJETO. Um `Application` local que se escreve igual não passa."""
        fonte = muta("from telegram.ext import Application\n",
                     "class Application:\n"
                     "    @staticmethod\n"
                     "    def builder():\n"
                     "        return _CONSTRUTOR_LOCAL()\n"
                     "\n"
                     "class _CONSTRUTOR_LOCAL:\n"
                     "    def token(self, t):\n"
                     "        return self\n"
                     "    def base_url(self, u):\n"
                     "        return self\n"
                     "    def build(self):\n"
                     "        return AplicacaoLocal()\n"
                     "\n"
                     "class AplicacaoLocal:\n"
                     "    def __init__(self):\n"
                     "        self.handlers = []\n"
                     "    def add_handler(self, h, *a, **k):\n"
                     "        self.handlers.append((h, a, k))\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_PRODUCER_NOT_GENUINE")

    # ─── E/F/G: o que a r6f garantia, reconferido sobre a raiz nova ─────────

    def test_R6G_E_retry_genuino_A_para_B_PASSA(self) -> None:
        import asyncio as _asyncio
        vistos = []

        async def conecta(self_ad, *, is_reconnect=False):
            nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
            for _ in range(2):
                self_ad._app = nat.Application.builder().build()
                self_ad._register_handlers(self_ad._app)
                vistos.append(self_ad._app)
            return True

        nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        original = nat.TelegramAdapter.connect
        nat.TelegramAdapter.connect = conecta
        resela_connect()
        self.addCleanup(lambda: setattr(nat.TelegramAdapter, "connect", original))
        cls = register(ContextoFalso(), self.capturados.append)
        adaptador = cls._creditum_adapter_factory(object())
        _asyncio.run(adaptador.connect())
        self.assertEqual([self._governados(a) for a in vistos], [2, 2])
        self.assertIsNot(vistos[0], vistos[1])

    def test_R6G_F_A_B_A_terceira_segue_recusada(self) -> None:
        import asyncio as _asyncio
        estado = {}

        async def conecta(self_ad, *, is_reconnect=False):
            nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
            a = nat.Application.builder().build()
            b = nat.Application.builder().build()
            estado["a"], estado["b"] = a, b
            for app in (a, b, a):
                self_ad._app = app
                self_ad._register_handlers(self_ad._app)
            return True

        nat = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        original = nat.TelegramAdapter.connect
        nat.TelegramAdapter.connect = conecta
        resela_connect()
        self.addCleanup(lambda: setattr(nat.TelegramAdapter, "connect", original))
        cls = register(ContextoFalso(), self.capturados.append)
        adaptador = cls._creditum_adapter_factory(object())
        with self.assertRaises(IngressRefusal) as c:
            _asyncio.run(adaptador.connect())
        self.assertIn("REGISTRATION_ALREADY_DONE_FOR_APP", str(c.exception))
        self.assertEqual(self._governados(estado["a"]), 2)

    def test_R6G_G_atribuicao_alternativa_de_self_app_segue_recusada(self) -> None:
        fonte = muta("        self._app = builder.build()\n"
                     "        self._register_handlers(self._app)",
                     "        self._app = builder.build()\n"
                     "        self._app = self.app_do_chamador\n"
                     "        self._register_handlers(self._app)")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    # ─── H/I/J: nada do que já estava fechado regrediu ──────────────────────

    def test_R6G_H_app_do_chamador_recebe_ZERO_callbacks(self) -> None:
        class Coletor:
            def __init__(self): self.handlers = []
            def add_handler(self, h, *a, **k): self.handlers.append(h)

        cls = register(ContextoFalso(), self.capturados.append)
        adaptador = cls._creditum_adapter_factory(object())
        c = Coletor()
        with self.assertRaises(IngressRefusal):
            adaptador._register_handlers(c)
        self.assertEqual(c.handlers, [])

    def test_R6G_I_metodos_nomeados_seguem_sem_autoridade(self) -> None:
        import asyncio as _asyncio
        cls = register(ContextoFalso(), self.capturados.append)
        adaptador = cls._creditum_adapter_factory(object())
        with self.assertRaises(IngressRefusal):
            _asyncio.run(adaptador._handle_text_message(
                MensagemFalsa("123456789", evento(texto="DIRETO")), None))
        self.assertEqual(self.capturados, [])

    def test_R6G_J_admissao_de_uso_unico_preservada(self) -> None:
        reentrancia = []

        def sink(_i):
            try:
                adaptador._enqueue_text_event(evento(texto="FORJADO"))
            except IngressRefusal as e:
                reentrancia.append(str(e))

        cls = register(ContextoFalso(), sink)
        adaptador = cls._creditum_adapter_factory(object())
        entrega(adaptador, MensagemFalsa("123456789", evento(texto="LEGIT")))
        self.assertEqual(len(reentrancia), 1)
        self.assertIn("INGRESS_OUTSIDE_NATIVE_ADMISSION", reentrancia[0])


class SeloEstrutural(Base):
    """
    A4-R6H — mundo FECHADO para o ciclo de vida nativo.

    As rodadas r6d–r6g fecharam derivas uma a uma, por análise semântica. Cada uma
    fechou a forma que a anterior deixou passar, e a r6g caiu num `AnnAssign`:

        builder: object = self.app_do_chamador

    porque o parser só olhava `ast.Assign`. Enumerar formas de ligação do Python é
    um jogo que não se ganha — `AugAssign`, walrus, alvo de `for`, `with ... as`,
    desempacotamento, e o que a linguagem acrescentar depois.

    O runtime aprovado é fechado e fixado. Então a fronteira deixa de ser
    "reconheço todo programa equivalente" e passa a ser "esta é EXATAMENTE a função
    que auditei". O dígito fecha a categoria por construção.

    As provas semânticas continuam: elas dão nomes inteligíveis para as derivas
    prováveis, e nome bom vale muito quando algo quebra. O selo é a rede.
    """

    def _instala_derivado(self, fonte_mutada: str) -> None:
        """Sela a forma genuína e DEPOIS instala a derivada, sem reselar."""
        instala_hermes()                      # sela a forma boa
        instala_hermes(fonte=fonte_mutada, resela=False)

    def _recusa(self, fonte_mutada: str) -> str:
        self._instala_derivado(fonte_mutada)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(self.capturados, [], "houve emissão apesar da recusa")
        return c.exception.defect

    # ─── §5: a mutação EXATA do achado ──────────────────────────────────────

    def test_R6H_AnnAssign_no_construtor_RECUSA(self) -> None:
        """
        `builder: object = self.app_do_chamador` — a forma que passou pela r6g,
        porque o parser dela só olhava `ast.Assign`.
        """
        fonte = muta("        self._app = builder.build()",
                     "        builder: object = self.app_do_chamador\n"
                     "        self._app = builder.build()")
        self.assertEqual(self._recusa(fonte), "NATIVE_CONNECT_STRUCTURE_MISMATCH")

    # ─── §6: matriz representativa de formas de ligação ─────────────────────

    def test_R6H_walrus_RECUSA(self) -> None:
        fonte = muta("        self._app = builder.build()",
                     "        _ = (builder := self.app_do_chamador)\n"
                     "        self._app = builder.build()")
        self.assertEqual(self._recusa(fonte), "NATIVE_CONNECT_STRUCTURE_MISMATCH")

    def test_R6H_alvo_de_for_RECUSA(self) -> None:
        fonte = muta("        self._app = builder.build()",
                     "        for builder in [self.app_do_chamador]:\n"
                     "            pass\n"
                     "        self._app = builder.build()")
        self.assertEqual(self._recusa(fonte), "NATIVE_CONNECT_STRUCTURE_MISMATCH")

    def test_R6H_desempacotamento_de_tupla_RECUSA(self) -> None:
        fonte = muta("        self._app = builder.build()",
                     "        builder, _extra = self.app_do_chamador, None\n"
                     "        self._app = builder.build()")
        self.assertEqual(self._recusa(fonte), "NATIVE_CONNECT_STRUCTURE_MISMATCH")

    def test_R6H_ramo_ACRESCENTADO_RECUSA(self) -> None:
        """Nem toda deriva rebinda: acrescentar caminho executável também muda tudo."""
        fonte = muta("        self._register_handlers(self._app)",
                     "        if self.conectado:\n"
                     "            pass\n"
                     "        self._register_handlers(self._app)")
        self.assertEqual(self._recusa(fonte), "NATIVE_CONNECT_STRUCTURE_MISMATCH")

    def test_R6H_augassign_RECUSA(self) -> None:
        fonte = muta("        self._app = builder.build()",
                     "        self.conectado += 1\n"
                     "        self._app = builder.build()")
        self.assertEqual(self._recusa(fonte), "NATIVE_CONNECT_STRUCTURE_MISMATCH")

    # ─── o outro lado: diferença que NÃO é executável não conta ─────────────

    def test_R6H_comentario_e_espaco_NAO_mudam_o_selo(self) -> None:
        """
        Se o selo reagisse a comentário, ele viraria um freio em manutenção legítima
        e alguém acabaria desligando-o. Um guarda que atrapalha demais é desligado.
        """
        instala_hermes()
        antes = compat.SELO_DO_CONNECT
        fonte = muta("    async def connect(self, *, is_reconnect=False):",
                     "    # comentário que não muda nada\n"
                     "    async def connect(self, *, is_reconnect=False):")
        instala_hermes(fonte=fonte, resela=False)
        nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        depois = compat.selo_observado_do_connect(nativo.TelegramAdapter)
        self.assertEqual(antes, depois, "comentário mudou o selo")
        verify_compatibility()                # e a compatibilidade passa

    # ─── §8: fonte indisponível falha FECHADA ───────────────────────────────

    def test_R6H_fonte_indisponivel_RECUSA(self) -> None:
        instala_hermes()
        nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]

        async def sem_fonte(self_ad, *, is_reconnect=False):
            return True

        # Sem entrada no linecache e sem arquivo: `getsource` não resolve.
        sem_fonte.__code__ = sem_fonte.__code__.replace(
            co_filename="<inexistente-e-nao-cacheado>")
        nativo.TelegramAdapter.connect = sem_fonte
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_CONNECT_SOURCE_UNAVAILABLE")

    # ─── o selo não é dado do chamador ──────────────────────────────────────

    def test_R6H_o_selo_de_producao_e_um_LITERAL(self) -> None:
        """
        Não vem de env, de argumento, de config nem de entrada. É autoridade de
        compatibilidade deste runtime exato, escrita no código.
        """
        import ast as _ast
        raiz = __import__("os").path.dirname(__import__("os").path.dirname(
            __import__("os").path.abspath(__file__)))
        with open(f"{raiz}/creditum_hermes_telegram/compat.py", encoding="utf-8") as fh:
            arvore = _ast.parse(fh.read())
        literais = [n for n in _ast.walk(arvore)
                    if isinstance(n, _ast.Assign)
                    and any(isinstance(t, _ast.Name) and t.id == "SELO_DO_CONNECT"
                            for t in n.targets)]
        self.assertEqual(len(literais), 1)
        self.assertIsInstance(literais[0].value, _ast.Constant)
        self.assertRegex(literais[0].value.value, r"^[0-9a-f]{64}$")

    def test_R6H_o_selo_de_producao_e_o_do_hermes_genuino(self) -> None:
        """O dígito medido na 0.20.4 genuína, em CPython 3.13.15."""
        self.assertEqual(
            _SELO_DE_PRODUCAO,
            "378631d531a782c5e8aacbc85e9fdac02a4cd0275611b916d50830cfc2a24f7b")

    # ─── as provas semânticas seguem dando o nome específico ───────────────

    def test_R6H_derivas_reconheciveis_mantem_o_nome_especifico(self) -> None:
        """
        O selo é a rede, não o substituto. Uma deriva que a prova semântica
        reconhece continua recebendo o nome dela — e nome bom importa.
        """
        fonte = muta('        builder = Application.builder().token("sintetico")\n'
                     '        builder = builder.base_url("https://nao.usado.invalido")\n',
                     "        builder = self.app_do_chamador\n")
        instala_hermes(fonte=fonte)          # sela a derivada: só a semântica pega
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_BUILDER_ORIGIN_UNPROVEN")


class IdentidadeDoCarregado(Base):
    """
    A4-R6I — o selo tem de descrever o objeto que EXECUTA.

    A r6h selou a estrutura da `connect` carregada e presumiu que
    `inspect.getsource` mostraria a função carregada. Não mostra: `getsource`
    chama `inspect.unwrap` por dentro. Um invólucro que carregue `__wrapped__`
    — o que `functools.wraps` põe de graça — é trocado em silêncio pela função
    de baixo ANTES da canonicalização. O selo descrevia a aprovada enquanto o
    runtime executava a de cima, e a compatibilidade passava.

    A regra é sobre IDENTIDADE do objeto carregado, não sobre um decorador
    específico: qualquer coisa que redirecione a resolução da fonte para outro
    objeto recusa, com ou sem `functools`.
    """

    def _nativo(self):
        return sys.modules[compat.NATIVE_ADAPTER_MODULE]

    def _instala_connect(self, conecta) -> None:
        self._nativo().TelegramAdapter.connect = conecta

    def _recusa(self, conecta) -> str:
        self._instala_connect(conecta)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(self.capturados, [], "houve emissão apesar da recusa")
        return c.exception.defect

    # ─── §1/§7: o carregado genuíno não é invólucro, e passa ────────────────

    def test_R6I_carregado_genuino_nao_e_involucro_e_PASSA(self) -> None:
        cls = self._nativo().TelegramAdapter
        bruto = compat.connect_bruto(cls)
        self.assertIs(bruto, cls.__dict__["connect"],
                      "o bruto não é o objeto do __dict__ da classe")
        self.assertIs(inspect.unwrap(bruto), bruto, "o genuíno está embrulhado")
        verify_compatibility()

    # ─── §10: o bruto é a função sob o método ligado normal ────────────────

    def test_R6I_metodo_ligado_tem_o_bruto_como___func__(self) -> None:
        """
        Não há segunda fonte de autoridade: o objeto selado é exatamente o que a
        ligação normal de método executa.
        """
        cls = self._nativo().TelegramAdapter
        bruto = compat.connect_bruto(cls)
        instancia = cls.__new__(cls)          # sem __init__: nada de efeito
        self.assertIs(instancia.connect.__func__, bruto)
        self.assertIs(getattr(cls, compat.METODO_CONECTA), bruto)

    # ─── §4: o caso EXATO do achado ────────────────────────────────────────

    def test_R6I_involucro_functools_wraps_RECUSA(self) -> None:
        original = self._nativo().TelegramAdapter.connect

        @functools.wraps(original)
        async def involucro(self_ad, *, is_reconnect=False):
            self_ad.marca_do_involucro = True     # comportamento a mais, executável
            return await original(self_ad, is_reconnect=is_reconnect)

        # O que o defeito media, antes de recusar: a fonte inspecionada era a de
        # baixo, e a estrutura do invólucro nunca entrava no dígito.
        self.assertIs(inspect.unwrap(involucro), original, "LOADED IS WRAPPER")
        self.assertEqual(inspect.getsource(involucro), inspect.getsource(original),
                         "GETSOURCE deveria seguir __wrapped__ (é o defeito)")
        self.assertEqual(self._recusa(involucro), "NATIVE_CONNECT_WRAPPED")

    def test_R6I_involucro_functools_wraps_nao_chega_ao_selo(self) -> None:
        """
        A recusa é de identidade, não de estrutura: se caísse no selo, o dígito do
        invólucro teria sido comparado — e ele é o dígito da função de baixo.
        """
        original = self._nativo().TelegramAdapter.connect

        @functools.wraps(original)
        async def involucro(self_ad, *, is_reconnect=False):
            return await original(self_ad, is_reconnect=is_reconnect)

        self._instala_connect(involucro)
        with self.assertRaises(CompatRefusal) as c:
            compat.selo_observado_do_connect(self._nativo().TelegramAdapter)
        self.assertEqual(c.exception.defect, "NATIVE_CONNECT_WRAPPED")

    # ─── §5: sem `functools` nenhum — a regra é identidade ─────────────────

    def test_R6I_wrapped_posto_a_mao_RECUSA(self) -> None:
        original = self._nativo().TelegramAdapter.connect

        async def outro(self_ad, *, is_reconnect=False):
            self_ad.conectado = True
            return True

        outro.__wrapped__ = original          # nada de decorador: só o atributo
        self.assertEqual(self._recusa(outro), "NATIVE_CONNECT_WRAPPED")

    # ─── §6: falha ao desembrulhar não cai na canonicalização ──────────────

    def test_R6I_cadeia_ciclica_de_wrapped_FALHA_FECHADA(self) -> None:
        async def ciclico(self_ad, *, is_reconnect=False):
            return True

        ciclico.__wrapped__ = ciclico         # `inspect.unwrap` levanta ValueError
        self.assertEqual(self._recusa(ciclico), "NATIVE_CONNECT_UNWRAP_FAILED")

    def test_R6I_ciclo_de_dois_saltos_FALHA_FECHADA(self) -> None:
        async def a(self_ad, *, is_reconnect=False):
            return True

        async def b(self_ad, *, is_reconnect=False):
            return True

        a.__wrapped__ = b
        b.__wrapped__ = a
        self.assertEqual(self._recusa(a), "NATIVE_CONNECT_UNWRAP_FAILED")

    # ─── o estático e o dinâmico têm de chegar no MESMO objeto ─────────────

    def test_R6I_divergencia_entre_estatico_e_dinamico_RECUSA(self) -> None:
        """
        Selar por `getattr_static` sozinho abriria o simétrico do defeito: selar um
        objeto e executar outro. Então o caminho normal de atributo tem de chegar
        no mesmo objeto — aqui um descritor de dado na metaclasse desvia.
        """
        aprovado = self._nativo().TelegramAdapter.connect

        class Meta(type):
            @property
            def connect(cls):                 # noqa: N805 — descritor de metaclasse
                return aprovado

        class Desviada(metaclass=Meta):
            async def connect(self, *, is_reconnect=False):
                return True

        self.assertIsNot(inspect.getattr_static(Desviada, "connect"),
                         getattr(Desviada, "connect"))
        with self.assertRaises(CompatRefusal) as c:
            compat.connect_bruto(Desviada)
        self.assertEqual(c.exception.defect, "NATIVE_CONNECT_BINDING_DIVERGES")

    # ─── ausência continua sendo ausência ──────────────────────────────────

    def test_R6I_connect_ausente_RECUSA(self) -> None:
        class SemConnect:
            pass

        with self.assertRaises(CompatRefusal) as c:
            compat.connect_bruto(SemConnect)
        self.assertEqual(c.exception.defect, "NATIVE_CONNECT_MISSING")

    def test_R6I_connect_nao_chamavel_RECUSA(self) -> None:
        class ConnectDeDado:
            connect = 42

        with self.assertRaises(CompatRefusal) as c:
            compat.connect_bruto(ConnectDeDado)
        self.assertEqual(c.exception.defect, "NATIVE_CONNECT_MISSING")

    # ─── §8: o selo da r6h continua valendo por cima ───────────────────────

    def test_R6I_substituicao_sem_wrapped_ainda_cai_no_SELO(self) -> None:
        """
        A identidade fecha o desvio de resolução de fonte; a estrutura continua
        fechando o resto. Uma troca honesta, sem `__wrapped__`, é vista pelo selo.
        """
        async def honesta(self_ad, *, is_reconnect=False):
            self_ad.conectado = True
            return True

        self.assertEqual(self._recusa(honesta), "NATIVE_CONNECT_STRUCTURE_MISMATCH")


class ArnesSemDisco(unittest.TestCase):
    """
    O dublê não escreve em disco — provado por interceptação, não por leitura.

    O arnês gravava a fonte em `/tmp` só para `inspect.getsource` alcançá-la. Num
    sandbox sem escrita em `/tmp`, os 198 testes da a4 falhavam com `PermissionError`
    — todos — e um arnês que falha inteiro parece defeito de produção. Aconteceu num
    regate, e custou uma rodada para separar as duas coisas.

    Estes testes bloqueiam `open`, `os.open` e o módulo `tempfile` inteiro, e exigem
    que o dublê continue montável e inspecionável.
    """

    def tearDown(self) -> None:
        desinstala_hermes()

    def _bloqueia_escrita(self):
        """Levanta em qualquer criação de arquivo. Devolve a lista de tentativas."""
        import builtins
        import os as _os
        import tempfile as _tempfile

        tentativas: list[str] = []
        originais: list[tuple] = []

        def _proibido(rotulo, original=None):
            def _w(*a, **k):
                # Leitura é permitida; o que se proíbe é CRIAR arquivo.
                if original is not None and rotulo == "open":
                    modo = k.get("mode", a[1] if len(a) > 1 else "r")
                    if "w" not in modo and "a" not in modo and "x" not in modo \
                            and "+" not in modo:
                        return original(*a, **k)
                tentativas.append(rotulo)
                raise PermissionError(f"{rotulo} bloqueado pelo teste")
            return _w

        alvos = [(builtins, "open"), (_os, "open")]
        for nome in ("mkstemp", "mkdtemp", "NamedTemporaryFile", "TemporaryFile",
                     "TemporaryDirectory", "mktemp"):
            if hasattr(_tempfile, nome):
                alvos.append((_tempfile, nome))
        for mod, nome in alvos:
            original = getattr(mod, nome)
            originais.append((mod, nome, original))
            setattr(mod, nome, _proibido(nome, original if nome == "open" else None))
        self.addCleanup(
            lambda: [setattr(m, n, v) for m, n, v in originais])
        return tentativas

    def test_ARNES_montar_o_duble_NAO_cria_arquivo(self) -> None:
        tentativas = self._bloqueia_escrita()
        instala_hermes()
        self.assertEqual(tentativas, [], "o dublê tentou criar arquivo")

    def test_ARNES_inspect_getsource_funciona_sem_arquivo(self) -> None:
        import inspect
        tentativas = self._bloqueia_escrita()
        instala_hermes()
        nativo = sys.modules[compat.NATIVE_ADAPTER_MODULE]
        # módulo, classe e método: os três caminhos que o compat usa.
        self.assertIn("class TelegramAdapter", inspect.getsource(nativo))
        self.assertIn("_enqueue_text_event",
                      inspect.getsource(nativo.TelegramAdapter))
        self.assertIn("_is_user_authorized_from_message",
                      inspect.getsource(nativo.TelegramAdapter._handle_command))
        self.assertEqual(tentativas, [])

    def test_ARNES_a_prova_de_compatibilidade_roda_sem_disco(self) -> None:
        """A prova estrutural inteira depende de `getsource`. Ela tem de passar."""
        tentativas = self._bloqueia_escrita()
        instala_hermes()
        p = verify_compatibility()
        self.assertEqual(p.native_enqueue_callers,
                         ("_handle_command", "_handle_text_message"))
        self.assertEqual(p.native_split_threshold, 4000)
        self.assertEqual(tentativas, [])

    def test_ARNES_o_registro_governado_roda_sem_disco(self) -> None:
        tentativas = self._bloqueia_escrita()
        instala_hermes()
        ctx = ContextoFalso()
        governada = register(ctx, lambda _i: None)
        self.assertEqual(ctx.entradas[0]["name"], "telegram")
        self.assertEqual(governada.__module__, "creditum_hermes_telegram.adapter")
        self.assertEqual(tentativas, [])

    def test_ARNES_nenhum_caminho_real_e_usado_como_fonte(self) -> None:
        """O nome é sintético; se fosse um caminho, alguém poderia criá-lo."""
        import os
        instala_hermes()
        caminho = sys.modules[compat.NATIVE_ADAPTER_MODULE].__file__
        self.assertTrue(caminho.startswith("<") and caminho.endswith(">"), caminho)
        self.assertFalse(os.path.exists(caminho))
        self.assertNotIn("/tmp", caminho)
        self.assertIn(caminho, linecache.cache)

    def test_ARNES_a_limpeza_nao_deixa_entradas_acumuladas(self) -> None:
        antes = set(linecache.cache)
        for _ in range(3):
            instala_hermes()
        self.assertEqual(len(_SINTETICOS), 3)
        desinstala_hermes()
        self.assertEqual(_SINTETICOS, set())
        self.assertEqual(set(linecache.cache) - antes, set(),
                         "entradas sintéticas ficaram no linecache")

    def test_ARNES_dublês_sucessivos_nao_devolvem_a_fonte_antiga(self) -> None:
        """Nome único por dublê: reusar mediria o dublê errado."""
        import inspect
        instala_hermes()
        primeiro = sys.modules[compat.NATIVE_ADAPTER_MODULE].__file__
        fonte_mutada = muta("    _SPLIT_THRESHOLD = 4000", "    _SPLIT_THRESHOLD = 123")
        instala_hermes(fonte=fonte_mutada)
        segundo = sys.modules[compat.NATIVE_ADAPTER_MODULE].__file__
        self.assertNotEqual(primeiro, segundo)
        self.assertIn("_SPLIT_THRESHOLD = 123",
                      inspect.getsource(sys.modules[compat.NATIVE_ADAPTER_MODULE]))
        self.assertEqual(verify_compatibility().native_split_threshold, 123)


class CampoFaltando(Base):
    def test_ingresso_recusa_campo_nativo_ausente(self) -> None:
        for campo, valor in (("message_id", ""), ("text", ""),
                             ("platform_update_id", 0)):
            ev = evento()
            setattr(ev, campo, valor)
            with self.assertRaises(IngressRefusal, msg=campo):
                capture_ingress(ev, admission_evidence=ADMISSION_EVIDENCE,
                                hermes_version="0.20.4", adapter_compat_id="x")

    def test_transporte_nao_telegram_recusa(self) -> None:
        ev = evento()
        ev.source.platform = type("P", (), {"value": "whatsapp"})()
        with self.assertRaises(IngressRefusal):
            capture_ingress(ev, admission_evidence=ADMISSION_EVIDENCE,
                            hermes_version="0.20.4", adapter_compat_id="x")


if __name__ == "__main__":
    unittest.main()
