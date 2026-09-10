"""
D2E-A4 — provas do vínculo governado do Telegram.

O texto admitido passa a determinar os hashes que Stefano aprova. Zero rede, zero
modelo, zero livro-razão, zero fixture no caminho vivo.
"""
from __future__ import annotations

import ast
import os
import unittest

from creditum_hermes_reasoning.codex import CodexRefusal, governed_user_payload
from creditum_hermes_reasoning.contract import build_system_contract
from creditum_hermes_reasoning.plan import build_canonical_plan_material
from creditum_hermes_reasoning.telegram_live import (
    ADMITTED_PROVENANCE,
    TELEGRAM_LIVE_SCHEMA_VERSION,
    AdmittedTelegramMessage,
    build_telegram_live_read_model,
    telegram_execution_id,
)

from .support import approved_binding_for_tests

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTO = "CREDITUM FIRST LIVE TEST"


def admitida(**over) -> AdmittedTelegramMessage:
    base = dict(
        provenance=ADMITTED_PROVENANCE, transport="TELEGRAM",
        sender_user_id="123456789", destination_chat_id="123456789",
        message_id="4242", update_id="987654321",
        normalized_text=TEXTO, telegram_timestamp="2026-09-02T21:06:00Z",
        source_message_count=1, thread_id=None,
    )
    base.update(over)
    return AdmittedTelegramMessage(**base)


def plano(rm):
    return build_canonical_plan_material(
        execution_id=telegram_execution_id(rm), contract=build_system_contract(),
        binding=approved_binding_for_tests(), read_model=rm)


class ReadModelGovernado(unittest.TestCase):
    def test_1_mensagem_admitida_produz_read_model_canonico(self) -> None:
        rm = build_telegram_live_read_model(admitida())
        self.assertEqual(rm["schema_version"], TELEGRAM_LIVE_SCHEMA_VERSION)
        self.assertEqual(set(rm), {
            "schema_version", "transport", "sender_user_id", "destination_chat_id",
            "destination_thread_id", "message_id", "update_id", "normalized_text",
            "telegram_timestamp"})

    def test_2_o_texto_EXATO_entra_no_user_payload_hash(self) -> None:
        rm = build_telegram_live_read_model(admitida())
        # O payload governado é a serialização do read model — e o texto está lá,
        # sem `lower()`, sem segundo `strip()`, sem reinterpretação.
        self.assertIn(TEXTO, governed_user_payload(rm))
        p = plano(rm)
        self.assertRegex(p.user_payload_hash, r"^[0-9a-f]{64}$")

    def test_3_texto_diferente_muda_o_user_payload_hash(self) -> None:
        a = plano(build_telegram_live_read_model(admitida()))
        b = plano(build_telegram_live_read_model(admitida(normalized_text=TEXTO + "!")))
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)
        self.assertNotEqual(a.request_hash, b.request_hash)
        self.assertNotEqual(a.read_model_fingerprint, b.read_model_fingerprint)

    def test_4a_message_id_diferente_muda_o_candidato(self) -> None:
        a = plano(build_telegram_live_read_model(admitida()))
        b = plano(build_telegram_live_read_model(admitida(message_id="4243")))
        self.assertNotEqual(a.execution_id, b.execution_id)
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)

    def test_5_update_id_diferente_muda_o_candidato(self) -> None:
        a = plano(build_telegram_live_read_model(admitida()))
        b = plano(build_telegram_live_read_model(admitida(update_id="987654322")))
        self.assertNotEqual(a.execution_id, b.execution_id)
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)

    def test_6_sender_diferente_muda_o_candidato(self) -> None:
        a = plano(build_telegram_live_read_model(admitida()))
        b = plano(build_telegram_live_read_model(admitida(sender_user_id="999")))
        self.assertNotEqual(a.execution_id, b.execution_id)
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)

    def test_7_destino_diferente_muda_o_candidato(self) -> None:
        a = plano(build_telegram_live_read_model(admitida()))
        b = plano(build_telegram_live_read_model(admitida(destination_chat_id="-1001")))
        self.assertNotEqual(a.execution_id, b.execution_id)
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)

    def test_8_evento_em_LOTE_e_recusado(self) -> None:
        # A a3 expôs isto: o adaptador junta mensagens rápidas com `\n`, mas
        # `MessageEvent.message_id` é um valor único. Sem a cardinalidade vinda de
        # quem fez o lote, "exatamente uma mensagem" não é verificável.
        for n in (0, 2, 7):
            with self.assertRaises(CodexRefusal):
                build_telegram_live_read_model(admitida(source_message_count=n))

    def test_9_identidade_ausente_ou_ambigua_e_recusada(self) -> None:
        for campo in ("sender_user_id", "destination_chat_id", "message_id", "update_id"):
            with self.assertRaises(CodexRefusal, msg=campo):
                build_telegram_live_read_model(admitida(**{campo: ""}))
        # E o que não é identificador nativo do Telegram também não passa.
        for campo, valor in (("sender_user_id", "abc"), ("message_id", "12a"),
                             ("update_id", "-1"), ("destination_chat_id", "x")):
            with self.assertRaises(CodexRefusal, msg=campo):
                build_telegram_live_read_model(admitida(**{campo: valor}))

    def test_9b_texto_vazio_e_recusado(self) -> None:
        with self.assertRaises(CodexRefusal):
            build_telegram_live_read_model(admitida(normalized_text=""))

    def test_10_flag_de_autorizacao_do_chamador_nao_existe(self) -> None:
        # Não há campo `authorized`. Passar um é TypeError, não "campo ignorado".
        with self.assertRaises(TypeError):
            admitida(authorized=True)
        # E proveniência errada é recusa, não aviso.
        with self.assertRaises(CodexRefusal):
            build_telegram_live_read_model(admitida(provenance="eu-que-digo"))
        with self.assertRaises(CodexRefusal):
            build_telegram_live_read_model(admitida(transport="WHATSAPP"))

    def test_11_o_FIXTURE_nao_entra_no_caminho_vivo(self) -> None:
        # Estrutural: o módulo do read model não conhece fixture nem probe.
        with open(os.path.join(RAIZ, "creditum_hermes_reasoning/telegram_live.py"),
                  encoding="utf-8") as fh:
            fonte = fh.read()
        arv = ast.parse(fonte)
        importados = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.ImportFrom) and n.module:
                importados.add(n.module)
            elif isinstance(n, ast.Import):
                for a in n.names:
                    importados.add(a.name)
        self.assertNotIn(".probe", importados)
        self.assertNotIn("creditum_hermes_reasoning.probe", importados)
        chamados = {c.func.id for c in ast.walk(arv)
                    if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)}
        self.assertNotIn("load_fixture", chamados)
        # E o read model produzido não carrega nada do fixture.
        rm = build_telegram_live_read_model(admitida())
        self.assertNotIn("read_model", rm)

    def test_12_determinismo_do_plano_reconstruido(self) -> None:
        rm1 = build_telegram_live_read_model(admitida())
        rm2 = build_telegram_live_read_model(admitida())
        self.assertEqual(rm1, rm2)
        self.assertEqual(plano(rm1), plano(rm2))

    def test_13_destino_congelado_no_read_model(self) -> None:
        rm = build_telegram_live_read_model(admitida(thread_id="55"))
        self.assertEqual(rm["destination_chat_id"], "123456789")
        self.assertEqual(rm["destination_thread_id"], "55")
        # Trocar o destino muda o compromisso — não é substituível em silêncio.
        outro = build_telegram_live_read_model(admitida(thread_id="56"))
        self.assertNotEqual(plano(rm).user_payload_hash, plano(outro).user_payload_hash)

    def test_14_repeticao_da_MESMA_identidade_da_o_mesmo_execution_id(self) -> None:
        # Proteção contra repetição DURÁVEL, delegada ao livro-razão da d2b: a mesma
        # mensagem produz o mesmo id, e o `mkdir` atômico recusa a segunda reserva.
        # Um registro em memória sumiria no reinício.
        a = telegram_execution_id(build_telegram_live_read_model(admitida()))
        b = telegram_execution_id(build_telegram_live_read_model(admitida()))
        self.assertEqual(a, b)
        c = telegram_execution_id(build_telegram_live_read_model(admitida(update_id="1")))
        self.assertNotEqual(a, c)

    def test_14b_o_execution_id_casa_com_o_contrato_de_aprovacao(self) -> None:
        # `subject_ref` usa o `identifier` do schema: ^[a-z0-9][a-z0-9_.:-]{2,127}$
        eid = telegram_execution_id(build_telegram_live_read_model(admitida()))
        self.assertRegex(eid, r"^[a-z0-9][a-z0-9_.:-]{2,127}$")
        self.assertTrue(eid.startswith("tg-"))

    def test_15_o_modulo_nao_fala_com_telegram_nem_com_modelo(self) -> None:
        with open(os.path.join(RAIZ, "creditum_hermes_reasoning/telegram_live.py"),
                  encoding="utf-8") as fh:
            fonte = fh.read()
        arv = ast.parse(fonte)
        chamados = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name):
                    chamados.add(f.id)
                elif isinstance(f, ast.Attribute):
                    chamados.add(f.attr)
        for proibido in ("create", "post", "request", "urlopen", "get_updates",
                         "send_message", "start_polling", "execute_live"):
            self.assertNotIn(proibido, chamados, f"o módulo chama {proibido}")
        # Nem token, nem allowlist reimplementada.
        for proibido in ("TELEGRAM_ALLOWED_USERS", "bot_token", "TELEGRAM_BOT_TOKEN"):
            self.assertNotIn(proibido, fonte)


if __name__ == "__main__":
    unittest.main()


class PonteIngressoParaPlano(unittest.TestCase):
    """§16 — do ingresso governado ao plano canônico, sem redigitar campo."""

    def _ingresso(self, **over):
        from creditum_hermes_telegram.ingress import GovernedTelegramIngressV1
        base = dict(
            protocol_version="creditum_telegram_ingress/1.0.0", transport="TELEGRAM",
            sender_user_id="123456789", destination_chat_id="123456789",
            destination_thread_id=None, message_id="4242", update_id="987654321",
            text=TEXTO, telegram_timestamp="2026-09-02T21:06:00Z",
            admission_evidence="hermes_telegram_registered_dispatch_post_allowlist_intercept/v2",
            hermes_version="0.20.4", adapter_compat_id="x", source_message_count=1)
        base.update(over)
        return GovernedTelegramIngressV1(**base)

    def test_16_ingresso_governado_vira_plano_canonico(self) -> None:
        from creditum_hermes_reasoning.telegram_live import admitted_from_governed_ingress
        rm = build_telegram_live_read_model(
            admitted_from_governed_ingress(self._ingresso()))
        p = plano(rm)
        self.assertEqual(rm["normalized_text"], TEXTO)
        self.assertRegex(p.user_payload_hash, r"^[0-9a-f]{64}$")
        self.assertTrue(p.execution_id.startswith("tg-"))

    def test_16b_ingresso_em_lote_e_recusado_na_ponte(self) -> None:
        from creditum_hermes_reasoning.telegram_live import admitted_from_governed_ingress
        with self.assertRaises(CodexRefusal):
            build_telegram_live_read_model(
                admitted_from_governed_ingress(self._ingresso(source_message_count=2)))
