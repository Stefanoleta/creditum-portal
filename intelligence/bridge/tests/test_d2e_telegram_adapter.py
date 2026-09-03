"""
D2E-A4-R1 — provas do adaptador Telegram governado.

O Hermes não existe nesta máquina, então os testes instalam um DUBLÊ sob o caminho de
módulo FIXO que a produção resolve. Isso é a mesma disciplina do `vi.mock` da d2c: a
produção não ganha parâmetro de módulo; o teste substitui o ambiente.
"""
from __future__ import annotations

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

# ── o dublê: forma da 0.20.4, com a ordem de autorização que a a3 descreveu ──────
FONTE_NATIVA = '''
class TelegramAdapter:
    def _is_user_authorized_from_message(self, message):
        return message.from_user_id in self.allow

    def _build_message_event(self, message):
        return message.event

    def _handle_text_message(self, message):
        if not self._is_user_authorized_from_message(message):
            return None
        event = self._build_message_event(message)
        return self._enqueue_text_event(event)

    def _enqueue_text_event(self, event):
        self.enfileirados.append(event)
        return None

    def handle_message(self, event):
        self.entregues.append(event)
        return "entregue"
'''


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


def instala_hermes(*, versao: str = "0.20.4", fonte: str = FONTE_NATIVA) -> None:
    """Instala o dublê sob os nomes de módulo FIXOS que a produção resolve."""
    hc = types.ModuleType("hermes_cli")
    hc.__version__ = versao  # type: ignore[attr-defined]
    sys.modules["hermes_cli"] = hc
    for nome in ("plugins", "plugins.platforms", "plugins.platforms.telegram"):
        sys.modules.setdefault(nome, types.ModuleType(nome))
    mod = types.ModuleType(compat.NATIVE_ADAPTER_MODULE)
    # Nome ÚNICO por dublê: `inspect.getsource` passa pelo `linecache`, e reescrever o
    # mesmo caminho devolveria a fonte antiga — o teste mediria o dublê errado.
    caminho = f"/tmp/creditum_hermes_double_{next(_SEQ)}.py"
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write(fonte)
    codigo = compile(fonte, caminho, "exec")
    # `__name__` e `__file__` no namespace: `inspect.getsource` resolve o arquivo via
    # `cls.__module__` → `sys.modules[...]` → `__file__`. Sem eles, TypeError.
    ns: dict[str, Any] = {"__file__": caminho, "__name__": compat.NATIVE_ADAPTER_MODULE}
    mod.__file__ = caminho  # type: ignore[attr-defined]
    sys.modules[compat.NATIVE_ADAPTER_MODULE] = mod
    exec(codigo, ns)  # noqa: S102
    mod.TelegramAdapter = ns["TelegramAdapter"]  # type: ignore[attr-defined]
    linecache.checkcache(caminho)


def desinstala_hermes() -> None:
    for nome in ("hermes_cli", compat.NATIVE_ADAPTER_MODULE,
                 "plugins.platforms.telegram", "plugins.platforms", "plugins"):
        sys.modules.pop(nome, None)


class ContextoFalso:
    def __init__(self) -> None:
        self.registrados: list[type] = []

    def register_platform(self, cls: type) -> None:
        self.registrados.append(cls)


class Base(unittest.TestCase):
    def setUp(self) -> None:
        instala_hermes()
        self.capturados: list[Any] = []

    def tearDown(self) -> None:
        desinstala_hermes()

    def monta(self):
        ctx = ContextoFalso()
        cls = register(ctx, self.capturados.append)
        inst = cls.__new__(cls)
        inst.allow = {"123456789"}
        inst.enfileirados = []
        inst.entregues = []
        return ctx, inst


class Cardinalidade(Base):
    def test_A_uma_mensagem_um_ingresso(self) -> None:
        _, a = self.monta()
        a._handle_text_message(MensagemFalsa("123456789", evento()))
        self.assertEqual(len(self.capturados), 1)
        i = self.capturados[0]
        self.assertEqual(i.source_message_count, 1)
        self.assertEqual(i.text, TEXTO)
        self.assertEqual(i.admission_evidence, ADMISSION_EVIDENCE)

    def test_B_duas_mensagens_rapidas_dao_DOIS_ingressos(self) -> None:
        # O defeito que motivou a fase: no nativo, B entraria em `A\nB`.
        _, a = self.monta()
        a._handle_text_message(MensagemFalsa("123456789", evento("A", mid="1", uid=1)))
        a._handle_text_message(MensagemFalsa("123456789", evento("B", mid="2", uid=2)))
        self.assertEqual(len(self.capturados), 2)
        textos = [i.text for i in self.capturados]
        self.assertEqual(textos, ["A", "B"])
        for t in textos:
            self.assertNotIn("\n", t)
        self.assertEqual([i.message_id for i in self.capturados], ["1", "2"])

    def test_B2_o_lote_nativo_nunca_roda(self) -> None:
        _, a = self.monta()
        a._handle_text_message(MensagemFalsa("123456789", evento()))
        # `enfileirados` é o acumulador do nativo. Vazio prova que não passamos por lá.
        self.assertEqual(a.enfileirados, [])
        self.assertEqual(len(a.entregues), 1)

    def test_C_message_id_distinto_permanece_distinto(self) -> None:
        _, a = self.monta()
        for m, u in (("10", 10), ("11", 11)):
            a._handle_text_message(MensagemFalsa("123456789", evento(mid=m, uid=u)))
        self.assertEqual({i.message_id for i in self.capturados}, {"10", "11"})

    def test_D_chats_diferentes_nao_se_misturam(self) -> None:
        _, a = self.monta()
        a._handle_text_message(MensagemFalsa("123456789", evento(mid="1", uid=1, chat="111")))
        a._handle_text_message(MensagemFalsa("123456789", evento(mid="2", uid=2, chat="-1002")))
        self.assertEqual([i.destination_chat_id for i in self.capturados], ["111", "-1002"])

    def test_E_mutacao_depois_da_captura_nao_altera_o_ingresso(self) -> None:
        _, a = self.monta()
        ev = evento()
        a._handle_text_message(MensagemFalsa("123456789", ev))
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
        a._handle_text_message(MensagemFalsa("000000", evento()))
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
        a._handle_text_message(MensagemFalsa("123456789", evento()))
        self.assertNotIn("SEGREDO-NAO-DEVE-VAZAR", repr(self.capturados[0]))

    def test_J_o_destino_e_o_chat_admitido(self) -> None:
        _, a = self.monta()
        a._handle_text_message(MensagemFalsa("123456789", evento(chat="55512345")))
        self.assertEqual(self.capturados[0].destination_chat_id, "55512345")


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
        fonte = FONTE_NATIVA.replace("    def _enqueue_text_event(self, event):\n"
                                     "        self.enfileirados.append(event)\n"
                                     "        return None\n", "")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    def test_assinatura_diferente_RECUSA(self) -> None:
        fonte = FONTE_NATIVA.replace("def _enqueue_text_event(self, event):",
                                     "def _enqueue_text_event(self, event, extra=None):")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_SIGNATURE_UNEXPECTED")

    def test_OUTRO_chamador_do_enfileirar_RECUSA(self) -> None:
        # O risco que o §3 nomeia: um segundo caminho até o ponto de interceptação,
        # possivelmente sem allowlist. Prova por AST sobre a fonte instalada.
        fonte = FONTE_NATIVA + '''
    def _handle_media_message(self, message):
        return self._enqueue_text_event(message.event)
'''
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_CALLERS_UNEXPECTED")

    def test_ordem_invertida_RECUSA(self) -> None:
        fonte = FONTE_NATIVA.replace(
            '''    def _handle_text_message(self, message):
        if not self._is_user_authorized_from_message(message):
            return None
        event = self._build_message_event(message)
        return self._enqueue_text_event(event)''',
            '''    def _handle_text_message(self, message):
        event = self._build_message_event(message)
        resultado = self._enqueue_text_event(event)
        if not self._is_user_authorized_from_message(message):
            return None
        return resultado''')
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_BEFORE_AUTHORIZATION")

    def test_autorizacao_chamada_mas_IGNORADA_recusa(self) -> None:
        # Ordem certa e efeito nenhum: chamar sem governar um retorno antecipado.
        fonte = FONTE_NATIVA.replace(
            "        if not self._is_user_authorized_from_message(message):\n"
            "            return None\n",
            "        self._is_user_authorized_from_message(message)\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")

    def test_B_POLARIDADE_INVERTIDA_recusa(self) -> None:
        """
        O achado do Codex. `if autorizado: return` põe o NÃO autorizado na
        continuação — e a r1 aceitava, porque conferia ordem e não semântica.
        """
        fonte = FONTE_NATIVA.replace(
            "        if not self._is_user_authorized_from_message(message):\n"
            "            return None\n",
            "        if self._is_user_authorized_from_message(message):\n"
            "            return None\n")
        instala_hermes(fonte=fonte)
        ctx = ContextoFalso()
        with self.assertRaises(CompatRefusal) as c:
            register(ctx, self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")
        # E a prova que o regate pediu: nenhum ingresso governado sai daqui.
        self.assertEqual(self.capturados, [])
        self.assertEqual(ctx.registrados, [])

    def test_E_autorizacao_em_condicional_NAO_dominante_recusa(self) -> None:
        # Aninhada noutra condicional, ela não governa os caminhos irmãos.
        fonte = FONTE_NATIVA.replace(
            "        if not self._is_user_authorized_from_message(message):\n"
            "            return None\n",
            "        if message.event.text:\n"
            "            if not self._is_user_authorized_from_message(message):\n"
            "                return None\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_GUARD_NOT_DOMINATING")

    def test_E2_portao_com_else_recusa(self) -> None:
        # Um `else` dá continuação ao ramo não autorizado.
        fonte = FONTE_NATIVA.replace(
            "        if not self._is_user_authorized_from_message(message):\n"
            "            return None\n",
            "        if not self._is_user_authorized_from_message(message):\n"
            "            pass\n"
            "        else:\n"
            "            pass\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    def test_E3_enfileirar_DENTRO_do_ramo_nao_autorizado_recusa(self) -> None:
        fonte = FONTE_NATIVA.replace(
            "        if not self._is_user_authorized_from_message(message):\n"
            "            return None\n",
            "        if not self._is_user_authorized_from_message(message):\n"
            "            self._enqueue_text_event(message.event)\n"
            "            return None\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_ENQUEUE_INSIDE_UNAUTHORIZED_BRANCH")

    def test_G_autorizacao_AUSENTE_recusa(self) -> None:
        fonte = FONTE_NATIVA.replace(
            "        if not self._is_user_authorized_from_message(message):\n"
            "            return None\n", "")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal):
            register(ContextoFalso(), self.capturados.append)

    def test_H_funcao_de_autorizacao_TROCADA_recusa(self) -> None:
        fonte = FONTE_NATIVA.replace("_is_user_authorized_from_message", "_talvez_ok")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_METHOD_MISSING")

    def test_H2_segunda_chamada_de_autorizacao_e_ambigua(self) -> None:
        # Duas chamadas, polaridades possivelmente diferentes: recusa em vez de
        # escolher qual delas "vale".
        fonte = FONTE_NATIVA.replace(
            "        event = self._build_message_event(message)\n",
            "        if self._is_user_authorized_from_message(message):\n"
            "            pass\n"
            "        event = self._build_message_event(message)\n")
        instala_hermes(fonte=fonte)
        with self.assertRaises(CompatRefusal) as c:
            register(ContextoFalso(), self.capturados.append)
        self.assertEqual(c.exception.defect, "NATIVE_AUTHORIZATION_CALL_AMBIGUOUS")

    def test_A_forma_esperada_ACEITA(self) -> None:
        # A forma da 0.20.4 que a a3 descreveu. Se esta falhasse, o guarda estaria
        # estrito demais e recusaria produção válida.
        p = verify_compatibility()
        self.assertEqual(p.hermes_version, "0.20.4")

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
        self.assertEqual(ctx.registrados, [], "registrou antes de provar")


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
