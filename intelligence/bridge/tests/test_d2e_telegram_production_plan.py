"""
D2E-A4-R2 — a via de PRODUÇÃO do Telegram, testada na fronteira real.

Não chamo `admitted_from_governed_ingress` direto: o caminho exercitado é
adaptador → sink → `plan_from_admitted_ingress` → plano canônico, com o Hermes
inteiro dublado (versão, adaptador nativo, resolvedor de runtime e config).

Zero rede, zero modelo, zero livro-razão, zero fixture.
"""
from __future__ import annotations

import ast
import os
import sys
import types
import unittest
from dataclasses import dataclass
from typing import Any, Mapping

from creditum_hermes_telegram import compat
from creditum_hermes_telegram.adapter import register
from creditum_hermes_telegram.ingress import GovernedTelegramIngressV1  # noqa: F401
from creditum_hermes_telegram.planning import PlanningRefusal, plan_from_admitted_ingress

from .test_d2e_telegram_adapter import (
    ContextoFalso, MensagemFalsa, desinstala_hermes, entrega, evento, instala_hermes,
)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTO = "CREDITUM FIRST LIVE TEST"


def instala_runtime_hermes() -> None:
    """`hermes_cli.runtime_provider` e `.config`, como a produção os exige."""
    from creditum_hermes_reasoning.runtime import (
        APPROVED_API_MODE, APPROVED_MODEL, APPROVED_PROVIDER,
    )

    cfg = types.ModuleType("hermes_cli.config")
    cfg.load_config = lambda: {"model": {"default": APPROVED_MODEL}}  # type: ignore[attr-defined]
    prov = types.ModuleType("hermes_cli.runtime_provider")
    prov.resolve_runtime_provider = lambda **_: {  # type: ignore[attr-defined]
        "provider": APPROVED_PROVIDER, "api_mode": APPROVED_API_MODE,
        "base_url": "https://sintetico.invalido/v1", "api_key": "CHAVE-SINTETICA",
        "hermes_version": "0.20.4", "acp_version": "0.9.0",
    }
    hc = sys.modules["hermes_cli"]
    hc.config = cfg           # type: ignore[attr-defined]
    hc.runtime_provider = prov  # type: ignore[attr-defined]
    sys.modules["hermes_cli.config"] = cfg
    sys.modules["hermes_cli.runtime_provider"] = prov


class ViaDeProducao(unittest.TestCase):
    def setUp(self) -> None:
        instala_hermes()
        instala_runtime_hermes()
        self.capturados: list[GovernedTelegramIngressV1] = []

    def tearDown(self) -> None:
        for m in ("hermes_cli.config", "hermes_cli.runtime_provider"):
            sys.modules.pop(m, None)
        desinstala_hermes()

    def _adaptador(self):
        cls = register(ContextoFalso(), self.capturados.append)
        return cls._creditum_adapter_factory(object())

    def _planeja(self, **ev):
        a = self._adaptador()
        entrega(a, MensagemFalsa("123456789", evento(**ev)))
        self.assertEqual(len(self.capturados), 1)
        return plan_from_admitted_ingress(self.capturados[-1])

    # ─── 12: a fronteira real ────────────────────────────────────────────────
    def test_12_telegram_admitido_vira_plano_canonico(self) -> None:
        rm, p = self._planeja()
        self.assertEqual(rm["normalized_text"], TEXTO)
        self.assertEqual(rm["sender_user_id"], "123456789")
        self.assertEqual(rm["message_id"], "4242")
        self.assertEqual(rm["update_id"], "987654321")
        for campo in ("read_model_fingerprint", "request_fingerprint",
                      "runtime_binding_fingerprint", "request_hash", "user_payload_hash"):
            self.assertRegex(getattr(p, campo), r"^[0-9a-f]{64}$")
        self.assertTrue(p.execution_id.startswith("tg-"))

    def test_12b_mensagem_A_e_B_dao_candidatos_DIFERENTES(self) -> None:
        _, a = self._planeja(texto="MENSAGEM A", mid="1", uid=1)
        self.capturados.clear()
        _, b = self._planeja(texto="MENSAGEM B", mid="2", uid=2)
        self.assertNotEqual(a.execution_id, b.execution_id)
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)
        self.assertNotEqual(a.request_hash, b.request_hash)

    def test_9_cada_campo_de_transporte_muda_o_candidato(self) -> None:
        base = self._planeja()[1]
        variacoes = {
            "texto": {"texto": "OUTRO TEXTO"},
            "sender": {"user": "555"},
            "chat": {"chat": "-1009"},
            "message_id": {"mid": "9999"},
            "update_id": {"uid": 11111},
        }
        for nome, over in variacoes.items():
            self.capturados.clear()
            _, outro = self._planeja(**over)
            self.assertNotEqual(base.user_payload_hash, outro.user_payload_hash, nome)

    # ─── 10: o texto exato da primeira execução viva ─────────────────────────
    def test_10_o_texto_exato_atravessa_sem_substituicao(self) -> None:
        rm, _ = self._planeja()
        self.assertEqual(rm["normalized_text"], "CREDITUM FIRST LIVE TEST")

    # ─── 11: sem queda para fixture, em nenhuma condição ─────────────────────
    def test_11_ingresso_invalido_RECUSA_em_vez_de_usar_fixture(self) -> None:
        for ruim in (None, {}, "texto", 42,
                     {"protocol_version": "creditum_telegram_ingress/1.0.0",
                      "transport": "TELEGRAM", "text": TEXTO, "authorized": True}):
            with self.assertRaises(PlanningRefusal, msg=repr(ruim)[:40]) as c:
                plan_from_admitted_ingress(ruim)
            self.assertEqual(c.exception.defect, "INGRESS_NOT_OWNED")

    def test_11b_ingresso_forjado_com_os_mesmos_campos_e_recusado(self) -> None:
        # Mesma FORMA, mas não construído pelo adaptador. `type(...) is not` recusa.
        @dataclass(frozen=True)
        class Impostor:
            protocol_version: str = "creditum_telegram_ingress/1.0.0"
            transport: str = "TELEGRAM"
            sender_user_id: str = "123456789"
            destination_chat_id: str = "123456789"
            destination_thread_id: str | None = None
            message_id: str = "1"
            update_id: str = "1"
            text: str = TEXTO
            telegram_timestamp: str = "2026-09-02T21:06:00Z"
            admission_evidence: str = "hermes_telegram_registered_dispatch_post_allowlist_intercept/v2"
            hermes_version: str = "0.20.4"
            adapter_compat_id: str = compat.ADAPTER_COMPAT_ID
            source_message_count: int = 1
        with self.assertRaises(PlanningRefusal) as c:
            plan_from_admitted_ingress(Impostor())
        self.assertEqual(c.exception.defect, "INGRESS_NOT_OWNED")

    def test_11c_qualquer_variacao_do_real_perde_a_emissao(self) -> None:
        """
        Antes da r3 este teste variava campos com `dataclasses.replace` e conferia o
        defeito de cada campo. Agora a recusa vem ANTES, e mais forte: o clone não foi
        emitido. As checagens de campo continuam no código como coerência, mas deixaram
        de ser a linha de defesa — e é bom que tenham deixado.
        """
        from dataclasses import replace
        a = self._adaptador()
        entrega(a, MensagemFalsa("123456789", evento()))
        real = self.capturados[-1]
        for campo, valor in (("admission_evidence", "eu-que-digo"),
                             ("hermes_version", "0.20.5"),
                             ("adapter_compat_id", "outro"),
                             ("source_message_count", 2),
                             ("protocol_version", "creditum_telegram_ingress/9.9.9"),
                             ("text", "FORJADO"),
                             ("sender_user_id", "999")):
            with self.assertRaises(PlanningRefusal, msg=campo) as c:
                plan_from_admitted_ingress(replace(real, **{campo: valor}))
            self.assertEqual(c.exception.defect, "INGRESS_NOT_ISSUED_BY_ADAPTER", campo)
        # E o original segue válido: variar o clone não invalida a emissão real.
        self.assertTrue(plan_from_admitted_ingress(real)[1].execution_id.startswith("tg-"))

    # ─── 4 e 11: o fixture é estruturalmente inalcançável daqui ──────────────
    def test_4_a_via_de_producao_NAO_alcanca_o_fixture(self) -> None:
        caminho = os.path.join(RAIZ, "creditum_hermes_telegram/planning.py")
        with open(caminho, encoding="utf-8") as fh:
            fonte = fh.read()
        arv = ast.parse(fonte)
        importados: set[str] = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.ImportFrom) and n.module:
                importados.add(n.module)
            elif isinstance(n, ast.Import):
                for al in n.names:
                    importados.add(al.name)
        for proibido in ("creditum_hermes_reasoning.probe",
                         "creditum_hermes_planner.worker", "tests.support"):
            self.assertNotIn(proibido, importados)
        chamados = {c.func.id for c in ast.walk(arv)
                    if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)}
        for proibido in ("load_fixture", "approved_binding_for_tests"):
            self.assertNotIn(proibido, chamados, f"a via de produção chama {proibido}")

    def test_4b_o_modulo_de_producao_nao_hasheia_por_conta_propria(self) -> None:
        caminho = os.path.join(RAIZ, "creditum_hermes_telegram/planning.py")
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
        for proibido in ("sha256", "_hash", "hexdigest", "md5"):
            self.assertNotIn(proibido, chamados)
        self.assertIn("build_canonical_plan_material", chamados)

    # ─── 15: nada de vivo, nada de livro-razão ──────────────────────────────
    def test_15_planejar_nao_executa_nem_reserva(self) -> None:
        caminho = os.path.join(RAIZ, "creditum_hermes_telegram/planning.py")
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
        for proibido in ("create", "post", "urlopen", "execute_live", "precall_probe",
                         "reserve", "mkdir", "open", "write"):
            self.assertNotIn(proibido, chamados, f"a via de produção chama {proibido}")

    def test_16_planejar_nao_e_aprovar(self) -> None:
        """
        Nenhuma função DEFINIDA aqui cria decisão ou capacidade.

        A primeira versão olhava `vars(módulo)` e acusou `resolve_approved_runtime_binding`
        — um nome IMPORTADO, e legítimo. Nome em namespace não é função definida; a
        distinção só aparece pela AST.
        """
        caminho = os.path.join(RAIZ, "creditum_hermes_telegram/planning.py")
        with open(caminho, encoding="utf-8") as fh:
            arv = ast.parse(fh.read())
        definidas = [n.name for n in ast.walk(arv)
                     if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        self.assertIn("plan_from_admitted_ingress", definidas)
        for nome in definidas:
            self.assertNotRegex(
                nome, r"(?i)approve|authorize|decision|issue|execute|live|mint")

    def test_8_replanejar_a_mesma_mensagem_da_o_mesmo_execution_id(self) -> None:
        _, a = self._planeja()
        self.capturados.clear()
        _, b = self._planeja()
        self.assertEqual(a.execution_id, b.execution_id)
        self.assertEqual(a, b)

    def test_F_remetente_nao_autorizado_nao_chega_ao_planejamento(self) -> None:
        a = self._adaptador()
        entrega(a, MensagemFalsa("000000", evento()))
        self.assertEqual(self.capturados, [])


if __name__ == "__main__":
    unittest.main()


class Proveniencia(ViaDeProducao):
    """
    §16 — o achado central do regate: FORMA não é PROCEDÊNCIA.

    Cada teste aqui constrói material que passaria em qualquer checagem de tipo,
    campo ou constante — e nenhum deles é uma mensagem admitida.
    """

    def _real(self) -> GovernedTelegramIngressV1:
        a = self._adaptador()
        entrega(a, MensagemFalsa("123456789", evento()))
        return self.capturados[-1]

    def test_A_dataclass_GENUINO_construido_a_mao_e_recusado(self) -> None:
        real = self._real()
        from dataclasses import asdict
        forjado = GovernedTelegramIngressV1(**{**asdict(real), "text": "FORJADO"})
        self.assertIs(type(forjado), GovernedTelegramIngressV1)  # genuíno
        with self.assertRaises(PlanningRefusal) as c:
            plan_from_admitted_ingress(forjado)
        self.assertEqual(c.exception.defect, "INGRESS_NOT_ISSUED_BY_ADAPTER")

    def test_B_dataclasses_replace_do_REAL_e_recusado(self) -> None:
        from dataclasses import replace
        real = self._real()
        clone = replace(real, text="FORJADO")
        self.assertIs(type(clone), GovernedTelegramIngressV1)
        with self.assertRaises(PlanningRefusal) as c:
            plan_from_admitted_ingress(clone)
        self.assertEqual(c.exception.defect, "INGRESS_NOT_ISSUED_BY_ADAPTER")

    def test_C_copia_com_os_MESMOS_valores_e_recusada(self) -> None:
        # O caso mais sutil: `__eq__` do dataclass diz que é igual, e um registro
        # chaveado por valor o aceitaria. Identidade, não igualdade.
        from dataclasses import replace
        import copy
        real = self._real()
        for clone in (replace(real), copy.deepcopy(real), copy.copy(real)):
            if clone is real:
                continue
            self.assertEqual(clone, real, "os valores são idênticos")
            with self.assertRaises(PlanningRefusal, msg=repr(type(clone))) as c:
                plan_from_admitted_ingress(clone)
            self.assertEqual(c.exception.defect, "INGRESS_NOT_ISSUED_BY_ADAPTER")

    def test_D_chamada_direta_ao_enfileirar_NAO_emite(self) -> None:
        from creditum_hermes_telegram.ingress import IngressRefusal
        a = self._adaptador()
        with self.assertRaises(IngressRefusal) as c:
            a._enqueue_text_event(evento(texto="FORJADO"))
        self.assertEqual(c.exception.defect, "INGRESS_OUTSIDE_NATIVE_ADMISSION")
        self.assertEqual(self.capturados, [], "emitiu fora do fluxo nativo")

    def test_F_remetente_nao_autorizado_pelo_manipulador_real_nao_emite(self) -> None:
        # Chamar `_handle_text_message` é permitido: ele atravessa a autorização
        # NATIVA, que o guarda provou dominante.
        a = self._adaptador()
        entrega(a, MensagemFalsa("000000", evento()))
        self.assertEqual(self.capturados, [])

    def test_G_remetente_autorizado_emite_exatamente_um(self) -> None:
        a = self._adaptador()
        entrega(a, MensagemFalsa("123456789", evento()))
        self.assertEqual(len(self.capturados), 1)
        _, p = plan_from_admitted_ingress(self.capturados[0])
        self.assertTrue(p.execution_id.startswith("tg-"))

    def test_17_duas_rapidas_dao_DUAS_emissoes_e_dois_candidatos(self) -> None:
        a = self._adaptador()
        entrega(a, MensagemFalsa("123456789", evento("A", mid="1", uid=1)))
        entrega(a, MensagemFalsa("123456789", evento("B", mid="2", uid=2)))
        self.assertEqual(len(self.capturados), 2)
        pa = plan_from_admitted_ingress(self.capturados[0])[1]
        pb = plan_from_admitted_ingress(self.capturados[1])[1]
        self.assertNotEqual(pa.execution_id, pb.execution_id)
        self.assertNotEqual(pa.user_payload_hash, pb.user_payload_hash)

    def test_6_nao_existe_emissor_publico(self) -> None:
        """§6 — nenhum export cria autoridade a partir de campos escolhidos."""
        import creditum_hermes_telegram.adapter as mod
        for nome in dir(mod):
            if nome.startswith("__"):
                continue
            self.assertNotRegex(
                nome, r"(?i)^(issue|seal|mark|trust|authorize|grant)")
        # `verify_issued` é somente-leitura: responder sim/não não cria autoridade.
        self.assertIs(mod.verify_issued(object()), False)

    def test_6b_o_estado_de_emissao_nao_tem_nome_de_modulo(self) -> None:
        import creditum_hermes_telegram.adapter as mod
        for proibido in ("_CONTEXTO", "_CAPACIDADE", "_EMITIDOS", "contexto",
                         "capacidade", "emitidos", "registra"):
            self.assertFalse(hasattr(mod, proibido), f"{proibido} é alcançável")

    def test_6c_montar_uma_emissao_NOVA_nao_concede_nada(self) -> None:
        # `_monta_emissao()` é alcançável, e devolve estado VAZIO e independente.
        import creditum_hermes_telegram.adapter as mod
        _, verifica_novo = mod._monta_emissao()
        real = self._real()
        self.assertTrue(mod.verify_issued(real))
        self.assertFalse(verifica_novo(real), "um registro novo não herda emissões")


class PonteAteOTypeScript(ViaDeProducao):
    """
    §15 — a ponte de ponta a ponta, pelo caminho REAL do repositório.

    adaptador → emissão → planejamento Python → CLI fixo do TypeScript →
    CanonicalLivePlanV1 → ProductionTelegramCandidateV1.

    Sem atalho por função interna.
    """

    def _candidato(self, **ev):
        from creditum_hermes_telegram.planning import build_production_candidate
        a = self._adaptador()
        entrega(a, MensagemFalsa("123456789", evento(**ev)))
        return build_production_candidate(self.capturados[-1])

    def test_15_ponta_a_ponta_produz_o_plano_REAL(self) -> None:
        c = self._candidato()
        self.assertEqual(c.candidate_version,
                         "creditum_production_telegram_candidate/1.0.0")
        # O plano veio do construtor canônico do TypeScript, não de reconstrução.
        self.assertEqual(c.plan["plan_version"], "creditum_canonical_live_plan/1.0.0")
        # A d1 exige esta relação, e quem a calcula é o TS.
        self.assertEqual(c.plan["subject_content_hash"], c.plan["execution_fingerprint"])
        self.assertRegex(c.plan["execution_fingerprint"], r"^[0-9a-f]{64}$")
        # E o texto admitido é o que originou tudo.
        self.assertEqual(c.read_model["normalized_text"], TEXTO)
        self.assertEqual(c.execution_id, c.plan["execution_id"])

    def test_12_a_mensagem_admitida_E_o_plano_exibido(self) -> None:
        c = self._candidato()
        # Os hashes do plano do TS descrevem o material derivado da mensagem.
        self.assertEqual(c.plan["user_payload_hash"],
                         plan_from_admitted_ingress(c.ingress)[1].user_payload_hash)
        self.assertEqual(c.plan["request_hash"],
                         plan_from_admitted_ingress(c.ingress)[1].request_hash)

    def test_19_texto_diferente_muda_o_plano_do_TS(self) -> None:
        a = self._candidato(texto="MENSAGEM A", mid="1", uid=1)
        self.capturados.clear()
        b = self._candidato(texto="MENSAGEM B", mid="2", uid=2)
        self.assertNotEqual(a.plan["user_payload_hash"], b.plan["user_payload_hash"])
        self.assertNotEqual(a.plan["execution_fingerprint"], b.plan["execution_fingerprint"])
        self.assertNotEqual(a.plan["subject_content_hash"], b.plan["subject_content_hash"])
        self.assertNotEqual(a.execution_id, b.execution_id)

    def test_19b_identidade_diferente_muda_o_compromisso(self) -> None:
        base = self._candidato()
        for over in ({"user": "555"}, {"chat": "-1009"}, {"mid": "9"}, {"uid": 9}):
            self.capturados.clear()
            outro = self._candidato(**over)
            self.assertNotEqual(base.plan["execution_fingerprint"],
                                outro.plan["execution_fingerprint"], str(over))

    def test_19c_o_worker_do_FIXTURE_nao_e_invocado(self) -> None:
        """
        ESTRUTURAL. A primeira versão procurava `creditum_hermes_planner` no TEXTO e
        acusou a PROSA que explica por que ele não é usado — o mesmo falso positivo
        que esta fase já pagou onze vezes. Imports e chamadas, nunca menção.
        """
        import ast
        for arq in ("planning.py", "adapter.py", "ingress.py"):
            caminho = os.path.join(RAIZ, "creditum_hermes_telegram", arq)
            with open(caminho, encoding="utf-8") as fh:
                arv = ast.parse(fh.read())
            importados: set[str] = set()
            for n in ast.walk(arv):
                if isinstance(n, ast.ImportFrom) and n.module:
                    importados.add(n.module)
                elif isinstance(n, ast.Import):
                    for al in n.names:
                        importados.add(al.name)
            for proibido in importados:
                self.assertNotIn("creditum_hermes_planner", proibido, arq)
                self.assertNotIn("probe", proibido, arq)
            chamados = {c.func.id for c in ast.walk(arv)
                        if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)}
            for proibido in ("load_fixture", "approved_binding_for_tests"):
                self.assertNotIn(proibido, chamados, f"{arq} chama {proibido}")
        # E o CLI fixo não conhece o worker do fixture.
        cli = os.path.join(os.path.dirname(RAIZ), "gateway", "src", "canonical-plan-cli.ts")
        with open(cli, encoding="utf-8") as fh:
            fonte_cli = fh.read()
        self.assertNotIn("PLAN_WORKER_MODULE", fonte_cli)
        self.assertNotIn("creditum_hermes_planner", fonte_cli)

    def test_9_NENHUMA_autoridade_atravessa_a_fronteira(self) -> None:
        from creditum_hermes_telegram.planning import CAMPOS_MATERIAL
        for proibido in ("authorized", "admission_evidence", "issuer", "token",
                         "capability", "trusted", "provenance", "hermes_version",
                         "adapter_compat_id", "sender_user_id", "destination_chat_id"):
            self.assertNotIn(proibido, CAMPOS_MATERIAL, proibido)
        # O que atravessa é material canônico já derivado — hashes e identificadores
        # de política. A identidade do Telegram vive DENTRO dos hashes, não ao lado.
        self.assertIn("user_payload_hash", CAMPOS_MATERIAL)
        self.assertIn("execution_id", CAMPOS_MATERIAL)

    def test_11_o_candidato_reconfere_a_procedencia(self) -> None:
        c = self._candidato()
        self.assertTrue(c.provenance_valid())
        # Um candidato montado à mão sobre um ingresso não emitido não valida.
        from dataclasses import replace
        from creditum_hermes_telegram.planning import ProductionTelegramCandidateV1
        falso = ProductionTelegramCandidateV1(
            candidate_version=c.candidate_version,
            ingress=replace(c.ingress, text="FORJADO"),
            read_model=c.read_model, plan=c.plan, execution_id=c.execution_id)
        self.assertFalse(falso.provenance_valid())

    def test_18_variar_depois_nao_altera_o_candidato_existente(self) -> None:
        c = self._candidato()
        antes = dict(c.plan)
        self.capturados.clear()
        self._candidato(texto="OUTRA COISA", mid="77", uid=77)
        self.assertEqual(dict(c.plan), antes)
        self.assertTrue(c.provenance_valid())

    def test_21_criar_candidato_nao_executa_nada(self) -> None:
        import ast
        caminho = os.path.join(RAIZ, "creditum_hermes_telegram/planning.py")
        with open(caminho, encoding="utf-8") as fh:
            arv = ast.parse(fh.read())
        chamados = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.Call):
                f = n.func
                nome = f.id if isinstance(f, ast.Name) else (
                    f.attr if isinstance(f, ast.Attribute) else None)
                if nome:
                    chamados.add(nome)
        for proibido in ("create", "urlopen", "execute_live", "precall_probe",
                         "reserveExecutionAttempt", "issueLiveExecutionAuthorization"):
            self.assertNotIn(proibido, chamados, proibido)


class RenderizacaoDeProducao(PonteAteOTypeScript):
    """
    D2E-A4-R4 — a fronteira de RENDERIZAÇÃO de produção.

    O regate anterior encontrou três coisas com a mesma forma: a peça certa existia e
    não estava ligada. O renderizador aceitava qualquer plano, o candidato guardava
    dicionários vivos, e `provenance_valid()` não era exigida em lugar nenhum.

    Aqui cada uma dessas três é medida pelo comportamento, não pela existência.
    """

    def _material_valido(self) -> dict[str, Any]:
        """Material canônico bem-formado, com valores que EU escolhi."""
        from creditum_hermes_telegram.planning import (
            CAMPOS_MATERIAL, PLAN_MATERIAL_PROTOCOL,
        )
        hexes = ("read_model_fingerprint", "request_fingerprint",
                 "runtime_binding_fingerprint", "request_hash", "user_payload_hash",
                 "constitution_hash", "system_contract_hash")
        doc: dict[str, Any] = {"protocol_version": PLAN_MATERIAL_PROTOCOL}
        for i, campo in enumerate(CAMPOS_MATERIAL):
            if campo in hexes:
                doc[campo] = f"{i:x}".rjust(64, "a")
            elif campo == "tool_count":
                doc[campo] = 0
            elif campo == "stream":
                doc[campo] = False
            elif campo == "operation":
                doc[campo] = "REASONING_RESPONSE_ONLY"
            elif campo == "execution_id":
                doc[campo] = "tg-material-que-eu-escolhi"
            else:
                doc[campo] = f"valor-{campo}"
        return doc

    def _pelo_cli(self, doc: object) -> dict[str, Any]:
        """Chama o construtor FIXO do TypeScript e devolve o resultado bruto."""
        import json
        import subprocess
        from creditum_hermes_telegram.planning import CANONICAL_PLAN_CLI, NODE_RUNTIME
        raiz = os.path.dirname(RAIZ)
        p = subprocess.run(
            [os.path.join(raiz, NODE_RUNTIME), os.path.join(raiz, CANONICAL_PLAN_CLI)],
            input=json.dumps(doc), capture_output=True, text=True, cwd=raiz, timeout=120)
        self.assertEqual(p.returncode, 0, p.stderr[:400])
        return json.loads([l for l in p.stdout.split("\n") if l.strip()][-1])

    def _plano_pelo_cli(self, doc: object) -> dict[str, Any]:
        r = self._pelo_cli(doc)
        self.assertEqual(r.get("outcome"), "PLAN_BUILT", str(r)[:200])
        return r["plan"]

    def _render(self, candidato: object) -> str:
        from creditum_hermes_telegram.planning import (
            render_production_telegram_authorization,
        )
        return render_production_telegram_authorization(candidato)

    def _recusa(self, candidato: object) -> str:
        with self.assertRaises(PlanningRefusal) as c:
            self._render(candidato)
        return c.exception.defect

    # ─── §14: o texto positivo, pela via real ────────────────────────────────
    def test_R4_1_o_texto_de_producao_traz_os_valores_exigidos(self) -> None:
        c = self._candidato()
        t = self._render(c)
        # Identidade e compromissos: os cinco hashes que Stefano assina.
        for v in (c.plan["execution_id"], c.plan["subject_content_hash"],
                  c.plan["execution_fingerprint"], c.plan["request_hash"],
                  c.plan["user_payload_hash"], c.plan["read_model_fingerprint"],
                  c.plan["request_fingerprint"], c.plan["runtime_binding_fingerprint"]):
            self.assertIn(v, t)
        # Provedor e modelo: o que de fato vai rodar.
        self.assertIn(c.plan["provider"], t)
        self.assertIn(c.plan["model"], t)
        # Controles do escopo aprovado, com os valores concretos.
        for rotulo, valor in (("tools", "0"), ("max_retries", "0"),
                              ("stream", "false"), ("background", "false")):
            self.assertRegex(t, rf"{rotulo}\s+{valor}\b")
        # O vínculo de transporte — o que a a2 não podia imprimir e agora existe.
        self.assertIn("TRANSPORTE", t)
        self.assertNotIn("NOT YET BOUND", t)
        for v in (c.ingress.sender_user_id, c.ingress.destination_chat_id,
                  c.ingress.message_id, c.ingress.update_id):
            self.assertIn(v, t)
        self.assertIn(TEXTO, t)
        self.assertIn("REASONING_RESPONSE_ONLY", t)
        # E ele diz o que NÃO é.
        self.assertIn("NÃO é aprovação", t)

    def test_R4_2_o_texto_e_deterministico(self) -> None:
        c = self._candidato()
        self.assertEqual(self._render(c), self._render(c))

    # ─── §13.A: plano cru não renderiza ──────────────────────────────────────
    def test_R4_A_plano_canonico_cru_e_recusado(self) -> None:
        c = self._candidato()
        # O plano REAL, vindo do TypeScript, do candidato genuíno. Ainda assim: um
        # plano não é um candidato, e "descreve uma execução possível" não é
        # "uma mensagem foi admitida".
        self.assertEqual(self._recusa(dict(c.plan)), "CANDIDATE_NOT_OWNED")

    # ─── §13.B: plano do construtor puro não renderiza ───────────────────────
    def test_R4_B_plano_do_construtor_puro_e_recusado(self) -> None:
        plano = self._plano_pelo_cli(self._material_valido())
        self.assertEqual(plano["plan_version"], "creditum_canonical_live_plan/1.0.0")
        self.assertRegex(plano["execution_fingerprint"], r"^[0-9a-f]{64}$")
        # Plano legítimo, construído pelo construtor fixo, a partir de material que
        # eu escolhi. Era exatamente esta a composição de três passos que a r3 deixou
        # aberta: material arbitrário → plano → texto com cara de autorização.
        self.assertEqual(self._recusa(plano), "CANDIDATE_NOT_OWNED")

    # ─── §13.C: material canônico cru não renderiza ──────────────────────────
    def test_R4_C_material_canonico_cru_e_recusado(self) -> None:
        self.assertEqual(self._recusa(self._material_valido()), "CANDIDATE_NOT_OWNED")
        for ruim in (None, {}, "texto", 42, [], object()):
            self.assertEqual(self._recusa(ruim), "CANDIDATE_NOT_OWNED", repr(ruim)[:30])

    # ─── §13.D: candidato construído à mão não renderiza ─────────────────────
    def test_R4_D_candidato_montado_a_mao_e_recusado(self) -> None:
        from creditum_hermes_telegram.planning import ProductionTelegramCandidateV1
        real = self._candidato()
        # Classe GENUÍNA, ingresso GENUÍNO e EMITIDO, plano GENUÍNO. Tudo verdadeiro
        # menos uma coisa: este objeto não foi emitido pela via de produção.
        forjado = ProductionTelegramCandidateV1(
            candidate_version=real.candidate_version, ingress=real.ingress,
            read_model=real.read_model, plan=real.plan,
            execution_id=real.execution_id)
        self.assertIs(type(forjado), ProductionTelegramCandidateV1)
        self.assertEqual(forjado, real, "os valores são idênticos")
        self.assertEqual(self._recusa(forjado), "CANDIDATE_NOT_ISSUED")
        self.assertFalse(forjado.provenance_valid())
        self.assertTrue(real.provenance_valid())

    def test_R4_D2_candidato_a_mao_com_plano_TROCADO_e_recusado(self) -> None:
        from creditum_hermes_telegram.planning import ProductionTelegramCandidateV1
        real = self._candidato()
        outro = dict(real.plan)
        outro["model"] = "modelo-que-eu-escolhi"
        forjado = ProductionTelegramCandidateV1(
            candidate_version=real.candidate_version, ingress=real.ingress,
            read_model=real.read_model, plan=outro, execution_id=real.execution_id)
        self.assertEqual(self._recusa(forjado), "CANDIDATE_NOT_ISSUED")

    # ─── §13.E: procedência que deixou de valer NÃO renderiza ────────────────
    def test_R4_E_procedencia_do_ingresso_invalidada_para_de_renderizar(self) -> None:
        """
        A prova de que a procedência do INGRESSO é exigida no render — sem porta.

        ─── O que a r4 fazia, e por que era o defeito ───────────────────────────

        Eu montava uma via de produção com um verificador que eu podia desligar. Isso
        provava a exigência e, ao mesmo tempo, ERA o furo: quem escolhe o verificador
        escolhe a resposta. O Codex achou justamente isso.

        Aqui o mecanismo é o REAL. O que eu invalido é a emissão, não o verificador:
        `object.__setattr__` fura o `frozen` do dataclass e altera o ingresso EMITIDO,
        então o instantâneo guardado pelo adaptador deixa de bater e `verify_issued`
        passa a responder False por conta própria.

        Note que mutação faz o sistema FALHAR FECHADO: mexer no ingresso não forja
        nada, tira a procedência.
        """
        from creditum_hermes_telegram.adapter import verify_issued
        c = self._candidato()
        self.assertIn("AUTORIZAÇÃO DE EXECUÇÃO VIVA", self._render(c))
        self.assertTrue(verify_issued(c.ingress))
        self.assertTrue(c.provenance_valid())

        original = c.ingress.text
        object.__setattr__(c.ingress, "text", "TEXTO TROCADO DEPOIS DA EMISSÃO")
        self.assertFalse(verify_issued(c.ingress), "o adaptador ainda reconhece")
        self.assertEqual(self._recusa(c), "CANDIDATE_PROVENANCE_INVALID")
        self.assertFalse(c.provenance_valid())

        # E restaurar devolve a procedência: o instantâneo é de CONTEÚDO, exato.
        object.__setattr__(c.ingress, "text", original)
        self.assertTrue(verify_issued(c.ingress))
        self.assertIn("AUTORIZAÇÃO DE EXECUÇÃO VIVA", self._render(c))

    def test_R4_E2_os_dois_portoes_sao_observaveis_separadamente(self) -> None:
        """
        Portão A (candidato emitido) e portão B (ingresso ainda emitido), cada um só.

        Na r4 o portão B era inalcançável na prática: o instantâneo do candidato
        inclui o conteúdo do ingresso, então alterar o ingresso quebrava os dois e a
        recusa sempre vinha do A. Defesa em profundidade que nenhum teste podia
        demonstrar é defesa que ninguém sabe se existe.
        """
        from creditum_hermes_telegram.adapter import verify_issued
        from creditum_hermes_telegram.planning import ProductionTelegramCandidateV1
        real = self._candidato()

        # Só o A falha: ingresso genuíno e emitido, candidato montado à mão.
        so_A = ProductionTelegramCandidateV1(
            candidate_version=real.candidate_version, ingress=real.ingress,
            read_model=real.read_model, plan=real.plan,
            execution_id=real.execution_id)
        self.assertTrue(verify_issued(so_A.ingress), "o portão B passa")
        self.assertEqual(self._recusa(so_A), "CANDIDATE_NOT_ISSUED")

        # Só o B falha: candidato emitido, procedência do ingresso perdida.
        object.__setattr__(real.ingress, "sender_user_id", "000000")
        self.assertEqual(self._recusa(real), "CANDIDATE_PROVENANCE_INVALID")

    # ─── §13.F: clone e cópia não renderizam ─────────────────────────────────
    def test_R4_F_clone_e_copia_do_candidato_sao_recusados(self) -> None:
        import copy
        from dataclasses import replace
        real = self._candidato()
        for clone in (replace(real), copy.copy(real)):
            self.assertIsNot(clone, real)
            # `__eq__` diz que é igual. Um registro chaveado por valor aceitaria.
            self.assertEqual(clone, real, repr(type(clone)))
            self.assertEqual(self._recusa(clone), "CANDIDATE_NOT_ISSUED",
                             repr(type(clone)))
        self.assertTrue(real.provenance_valid(), "o original segue válido")

    def test_R4_F2_deepcopy_do_candidato_nem_acontece(self) -> None:
        """
        Resultado mais forte do que recusa, e não foi projetado: `deepcopy` do
        candidato levanta `TypeError`, porque `mappingproxy` não é serializável.

        Registro isto como MEDIÇÃO, não como defesa. A defesa é o registro de emissão
        — se uma versão futura do Python passar a copiar proxies, o clone continua
        recusado por identidade, e é esse teste que importa.
        """
        import copy
        real = self._candidato()
        with self.assertRaises(TypeError):
            copy.deepcopy(real)

    # ─── §13.G / §6: o conteúdo do candidato NÃO é mutável ───────────────────
    def test_R4_G_o_plano_e_o_read_model_do_candidato_sao_imutaveis(self) -> None:
        c = self._candidato()
        # Casca: o dataclass é congelado.
        with self.assertRaises(Exception):
            c.plan = {}  # type: ignore[misc]
        # Fundo: e o que está DENTRO também. Era aqui que a r3 parava — congelar o
        # dataclass e deixar `dict` vivo lá dentro é imutabilidade na casca.
        for alvo in (c.plan, c.read_model):
            with self.assertRaises(TypeError):
                alvo["model"] = "outro"  # type: ignore[index]
            with self.assertRaises(TypeError):
                del alvo["provider"]  # type: ignore[attr-defined]
        # Aninhado: `spec` é dicionário dentro do plano.
        self.assertIsInstance(c.plan["spec"], type(c.plan))
        with self.assertRaises(TypeError):
            c.plan["spec"]["model"] = "outro"  # type: ignore[index]

    def test_R4_G2_nenhum_dict_ou_list_vivo_sobra_no_candidato(self) -> None:
        """Varredura ESTRUTURAL: nada mutável em nenhuma profundidade."""
        c = self._candidato()

        def varre(v: object, caminho: str) -> None:
            self.assertNotIsInstance(v, (dict, list, set, bytearray), caminho)
            if isinstance(v, Mapping):
                for k in v:
                    varre(v[k], f"{caminho}.{k}")
            elif type(v) is tuple:
                for i, item in enumerate(v):
                    varre(item, f"{caminho}[{i}]")

        varre(c.plan, "plan")
        varre(c.read_model, "read_model")

    # ─── §13.H: o plano de evidência não renderiza ───────────────────────────
    def test_R4_H_a_via_de_evidencia_nao_produz_texto_de_producao(self) -> None:
        """
        Três medições, porque a via de evidência não roda nesta máquina.

        `buildEvidenceCanonicalLivePlan` chama `/opt/venv/bin/python3`, que só existe
        na Hostinger. Em vez de pular o caso, meço o que É verificável aqui: que a via
        de evidência não produz plano nenhum localmente, que um plano com a forma dela
        é recusado, e que o TEXTO de evidência também não entra.
        """
        import json
        import subprocess
        raiz = os.path.dirname(RAIZ)

        # 1. localmente a via de evidência recusa — não há plano de evidência a
        #    contrabandear, e o defeito nomeia o motivo.
        r = json.loads(subprocess.run(
            [os.path.join(raiz, "node_modules/.bin/tsx"), "-e",
             'import { buildEvidenceCanonicalLivePlan } from "./gateway/src/live-plan";'
             'buildEvidenceCanonicalLivePlan("d2e-r4-evidencia").then('
             '(r) => console.log(JSON.stringify(r)))'],
            capture_output=True, text=True, cwd=raiz, timeout=120,
        ).stdout.strip().split("\n")[-1])
        self.assertEqual(r["status"], "refused")
        self.assertIn(r["defect"], ("PLAN_SPAWN_FAILED", "PLAN_WORKER_EXIT_NONZERO"))

        # 2. um plano com a forma da evidência, construído pelo construtor puro, é
        #    recusado como qualquer outro plano: plano não é candidato.
        plano = self._plano_pelo_cli(self._material_valido())
        self.assertEqual(self._recusa(plano), "CANDIDATE_NOT_OWNED")

        # 3. e o texto de evidência, que é `str`, também não entra por ali.
        texto = subprocess.run(
            [os.path.join(raiz, "node_modules/.bin/tsx"), "-e",
             'import { renderEvidenceAuthorizationText } from "./gateway/src/live-plan";'
             f"console.log(renderEvidenceAuthorizationText({json.dumps(plano)} as never))"],
            capture_output=True, text=True, cwd=raiz, timeout=120).stdout
        self.assertIn("EVIDÊNCIA", texto)
        self.assertIn("NOT YET BOUND", texto)
        self.assertNotIn("PRODUÇÃO TELEGRAM", texto)
        self.assertEqual(self._recusa(texto), "CANDIDATE_NOT_OWNED")

    # ─── §10: filho substituído não troca compromisso em silêncio ────────────
    def test_R4_6_plano_com_QUALQUER_campo_trocado_e_recusado(self) -> None:
        """
        Os 23 campos, um a um, mais a relação da d1.

        A r4 provava isto montando uma via apontada para um filho meu — e a fábrica
        que permitia apontar era o defeito. A conferência foi extraída para
        `confere_plano_contra_material`, que **só recusa**: não existe entrada que a
        faça conceder algo, então chamá-la direto é inócuo e cobre os 23 casos em vez
        dos quatro que o filho falso cobria.
        """
        from creditum_hermes_telegram.planning import (
            CAMPOS_MATERIAL, confere_plano_contra_material,
        )
        c = self._candidato()
        _, material = plan_from_admitted_ingress(c.ingress)
        plano = dict(c.plan)

        # O plano genuíno passa.
        confere_plano_contra_material(plano, material)

        for campo in CAMPOS_MATERIAL:
            atual = plano[campo]
            trocado = ("x" + str(atual)) if type(atual) is str else (
                not atual if type(atual) is bool else 99)
            with self.assertRaises(PlanningRefusal, msg=campo) as erro:
                confere_plano_contra_material({**plano, campo: trocado}, material)
            self.assertEqual(erro.exception.defect, "PLAN_RESULT_BINDING_MISMATCH", campo)
            self.assertEqual(str(erro.exception).split(": ")[-1], campo)

        # Campo ausente também é divergência, não omissão tolerada.
        for campo in ("provider", "model", "request_hash"):
            faltando = {k: v for k, v in plano.items() if k != campo}
            with self.assertRaises(PlanningRefusal, msg=campo) as erro:
                confere_plano_contra_material(faltando, material)
            self.assertEqual(erro.exception.defect, "PLAN_RESULT_BINDING_MISMATCH", campo)

        # A relação da d1: impressão hexadecimal, e `subject_content_hash` igual a ela.
        for ruim in ("", "nao-hex", "A" * 64, "a" * 63, None):
            with self.assertRaises(PlanningRefusal, msg=repr(ruim)) as erro:
                confere_plano_contra_material(
                    {**plano, "execution_fingerprint": ruim}, material)
            self.assertEqual(erro.exception.defect, "PLAN_FINGERPRINT_INVALID", repr(ruim))
        with self.assertRaises(PlanningRefusal) as erro:
            confere_plano_contra_material(
                {**plano, "subject_content_hash": "d" * 64}, material)
        self.assertEqual(erro.exception.defect, "PLAN_SUBJECT_BINDING_INVALID")

    # ─── §9: o contrato do material é FECHADO nas duas direções ──────────────
    def test_R4_7_o_CLI_fecha_o_contrato_do_material(self) -> None:
        base = self._material_valido()
        # Bem-formado passa.
        self.assertEqual(self._pelo_cli(base)["outcome"], "PLAN_BUILT")

        # Campo desconhecido: RECUSA, não "ignorado". A lista de proibidos nomeia seis
        # campos de autoridade que eu soube imaginar; fechar o conjunto não depende de
        # eu adivinhar o sétimo.
        self.assertEqual(
            self._pelo_cli({**base, "campo_novo_qualquer": "x"})["defect"],
            "MATERIAL_FIELD_UNKNOWN")
        for autoridade in ("authorized", "admission_evidence", "issuer", "token",
                           "capability", "trusted"):
            self.assertEqual(self._pelo_cli({**base, autoridade: True})["defect"],
                             "MATERIAL_CARRIES_AUTHORITY", autoridade)

        # Campo faltando: RECUSA. Antes da r4, ausência virava `undefined` impresso.
        for campo in ("provider", "model", "request_hash", "operation", "tool_count"):
            faltando = {k: v for k, v in base.items() if k != campo}
            self.assertEqual(self._pelo_cli(faltando)["defect"],
                             "MATERIAL_FIELD_MISSING", campo)

        # Valor fora do escopo aprovado: RECUSA, nunca substituição silenciosa.
        for campo, valor in (("tool_count", 3), ("stream", True),
                             ("operation", "QUALQUER_OUTRA")):
            self.assertEqual(self._pelo_cli({**base, campo: valor})["defect"],
                             "PLAN_MATERIAL_INVALID", campo)
        # Hash que não é hexadecimal de 64: RECUSA.
        self.assertEqual(
            self._pelo_cli({**base, "request_hash": "nao-e-hex"})["defect"],
            "PLAN_MATERIAL_INVALID")

    # ─── §14: não existe fábrica pública de candidato ────────────────────────
    def test_R4_8_nenhum_export_transforma_ingresso_e_plano_em_candidato(self) -> None:
        from creditum_hermes_telegram import planning
        for nome in dir(planning):
            if nome.startswith("__"):
                continue
            self.assertNotRegex(nome, r"(?i)^(issue|seal|mark|trust|grant|forge)")
        # O estado de emissão do candidato não tem nome de módulo.
        for proibido in ("emitidos", "registra", "instantaneo", "_EMITIDOS",
                         "verifica_candidato"):
            self.assertFalse(hasattr(planning, proibido), f"{proibido} é alcançável")
        # `verify_candidate_issued` é somente-leitura, como no adaptador.
        self.assertIs(planning.verify_candidate_issued(object()), False)

    # ─── R5 §13: a reprodução exata do defeito da r4 ─────────────────────────
    def test_R5_1_nao_existe_fabrica_de_producao_alcancavel(self) -> None:
        """
        A regressão do defeito reproduzido: NENHUMA API de produção aceita
        verificador escolhido pelo chamador.

        Antes da r5 isto funcionava, em três linhas de API pública de módulo:

            _, _, constroi, _, renderiza = planning._monta_producao(
                lambda _: True, planning.NODE_RUNTIME, planning.CANONICAL_PLAN_CLI)
            renderiza(constroi(ingresso_construido_a_mao))

        E saía o texto de autorização de produção com transporte "vinculado" a uma
        mensagem que nunca chegou pelo Telegram.
        """
        import inspect
        from creditum_hermes_telegram import planning

        # 1. a fábrica não existe mais no namespace, sob nome nenhum.
        for nome in ("_monta_producao", "_liga_producao", "_monta_emissao_de_candidato",
                     "_fabrica", "monta_producao"):
            self.assertFalse(hasattr(planning, nome), f"{nome} é alcançável")

        # 2. nenhuma callable alcançável do módulo tem parâmetro que se pareça com
        #    verificador, emissor ou validador. Estrutural, não por nome de função.
        suspeitos = ("verif", "verify", "valida", "validator", "provenance",
                     "issuer", "issuance", "trusted", "callback", "check", "authoriz")
        for nome in dir(planning):
            if nome.startswith("__"):
                continue
            obj = getattr(planning, nome)
            if not (inspect.isfunction(obj) or inspect.isclass(obj)):
                continue
            if getattr(obj, "__module__", "") != planning.__name__:
                continue  # importado de outro módulo: não é superfície desta fase
            alvo = obj.__init__ if inspect.isclass(obj) else obj
            try:
                params = list(inspect.signature(alvo).parameters)
            except (TypeError, ValueError):
                continue
            for param in params:
                for s_ in suspeitos:
                    self.assertNotIn(
                        s_, param.lower(),
                        f"{nome}({param}) deixa o chamador escolher autoridade")

        # 3. e cada callable de produção recebe EXATAMENTE um objeto — o ingresso ou
        #    o candidato. Nenhum segundo parâmetro por onde entrar dependência.
        for nome, esperado in (("build_production_candidate", 1),
                               ("plan_from_admitted_ingress", 1),
                               ("render_production_telegram_authorization", 1),
                               ("verify_candidate_issued", 1)):
            params = list(inspect.signature(getattr(planning, nome)).parameters)
            self.assertEqual(len(params), esperado, f"{nome}{tuple(params)}")

    def test_R5_2_ingresso_a_mao_nao_vira_autorizacao_por_via_nenhuma(self) -> None:
        """O mesmo ingresso forjado da reprodução, contra TODA a superfície."""
        from creditum_hermes_telegram import compat, planning
        from creditum_hermes_telegram.adapter import ADMISSION_EVIDENCE, verify_issued
        from creditum_hermes_telegram.ingress import (
            TELEGRAM_INGRESS_PROTOCOL, TELEGRAM_TRANSPORT,
        )
        forjado = GovernedTelegramIngressV1(
            protocol_version=TELEGRAM_INGRESS_PROTOCOL, transport=TELEGRAM_TRANSPORT,
            sender_user_id="999999999", destination_chat_id="999999999",
            destination_thread_id=None, message_id="1", update_id="1",
            text="TEXTO QUE EU ESCOLHI, SEM PASSAR PELO TELEGRAM",
            telegram_timestamp="2026-09-03T00:00:00Z",
            admission_evidence=ADMISSION_EVIDENCE, hermes_version="0.20.4",
            adapter_compat_id=compat.ADAPTER_COMPAT_ID, source_message_count=1)

        self.assertIs(type(forjado), GovernedTelegramIngressV1, "classe genuína")
        self.assertFalse(verify_issued(forjado))

        for via in (planning.build_production_candidate,
                    planning.plan_from_admitted_ingress):
            with self.assertRaises(PlanningRefusal, msg=via.__name__) as c:
                via(forjado)
            self.assertEqual(c.exception.defect, "INGRESS_NOT_ISSUED_BY_ADAPTER",
                             via.__name__)
        # E ele não renderiza por si nem embrulhado num candidato de fachada.
        self.assertEqual(self._recusa(forjado), "CANDIDATE_NOT_OWNED")
        fachada = planning.ProductionTelegramCandidateV1(
            candidate_version="creditum_production_telegram_candidate/1.0.0",
            ingress=forjado, read_model={}, plan={}, execution_id="tg-forjado")
        self.assertEqual(self._recusa(fachada), "CANDIDATE_PROVENANCE_INVALID")

    def test_R5_3_o_adaptador_continua_com_fabrica_e_continua_inofensivo(self) -> None:
        """
        A distinção que a r5 obrigou a nomear.

        `_monta_emissao()` do adaptador segue alcançável e é inofensivo: ele NÃO
        recebe verificador. Uma emissão nova nasce com registro vazio, e a classe que
        ela devolve continua exigindo a autorização nativa para emitir. A diferença
        entre as duas fábricas era exatamente o parâmetro que eu havia acrescentido.
        """
        import inspect
        import creditum_hermes_telegram.adapter as mod
        self.assertEqual(list(inspect.signature(mod._monta_emissao).parameters), [])
        _, verifica_novo = mod._monta_emissao()
        real = self._candidato().ingress
        self.assertTrue(mod.verify_issued(real))
        self.assertFalse(verifica_novo(real), "um registro novo não herda emissões")

    # ─── §14: reatribuir atributo de módulo não redireciona autoridade ───────
    def test_R4_10_reatribuir_atributos_de_modulo_nao_redireciona_nada(self) -> None:
        """
        Quatro atributos reatribuídos de uma vez: verificador do ingresso (nos dois
        módulos), verificador do candidato, caminho do CLI e a conferência de plano.

        Tudo o que a via de produção usa está preso em célula desde o import, então o
        namespace sujo é documentação do que foi ligado, não o que executa.
        """
        from creditum_hermes_telegram import adapter, compat, planning
        from creditum_hermes_telegram.ingress import (
            TELEGRAM_INGRESS_PROTOCOL, TELEGRAM_TRANSPORT,
        )
        guardados = {
            (adapter, "verify_issued"): adapter.verify_issued,
            (planning, "verify_issued"): planning.verify_issued,
            (planning, "verify_candidate_issued"): planning.verify_candidate_issued,
            (planning, "CANONICAL_PLAN_CLI"): planning.CANONICAL_PLAN_CLI,
            (planning, "NODE_RUNTIME"): planning.NODE_RUNTIME,
            (planning, "confere_plano_contra_material"):
                planning.confere_plano_contra_material,
        }
        try:
            adapter.verify_issued = lambda _: True
            planning.verify_issued = lambda _: True
            planning.verify_candidate_issued = lambda _: True
            planning.CANONICAL_PLAN_CLI = "/tmp/nao-existe-e-nao-deve-ser-usado.ts"
            planning.NODE_RUNTIME = "/tmp/nao-existe-tampouco"
            planning.confere_plano_contra_material = lambda *a, **k: None

            # 1. o ingresso à mão continua recusado, apesar do verificador permissivo.
            forjado = GovernedTelegramIngressV1(
                protocol_version=TELEGRAM_INGRESS_PROTOCOL, transport=TELEGRAM_TRANSPORT,
                sender_user_id="999999999", destination_chat_id="999999999",
                destination_thread_id=None, message_id="1", update_id="1",
                text="SEM TELEGRAM", telegram_timestamp="2026-09-03T00:00:00Z",
                admission_evidence=adapter.ADMISSION_EVIDENCE, hermes_version="0.20.4",
                adapter_compat_id=compat.ADAPTER_COMPAT_ID, source_message_count=1)
            with self.assertRaises(PlanningRefusal) as c:
                planning.build_production_candidate(forjado)
            self.assertEqual(c.exception.defect, "INGRESS_NOT_ISSUED_BY_ADAPTER")
            with self.assertRaises(PlanningRefusal) as c:
                self._render(planning.ProductionTelegramCandidateV1(
                    candidate_version="creditum_production_telegram_candidate/1.0.0",
                    ingress=forjado, read_model={}, plan={}, execution_id="tg-x"))
            self.assertEqual(c.exception.defect, "CANDIDATE_PROVENANCE_INVALID")

            # 2. e a via legítima continua funcionando, com o filho CERTO.
            candidato = self._candidato()
            self.assertEqual(candidato.plan["plan_version"],
                             "creditum_canonical_live_plan/1.0.0")
            self.assertTrue(candidato.provenance_valid())
            self.assertIn("PRODUÇÃO TELEGRAM", self._render(candidato))
        finally:
            for (mod, nome), valor in guardados.items():
                setattr(mod, nome, valor)

