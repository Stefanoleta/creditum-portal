"""
Fase 3.1d-b-r3 — o executor Codex governado, provado sem SDK e sem rede.

O que é FALSO aqui: o cliente do provider e os objetos de resposta.
O que é REAL: o vínculo, a construção da requisição, o portão final, o predicado de
resposta, o parser de envelope. É onde a governança mora.

Zero chamadas de modelo. Zero rede. Zero dado da Creditum. Segredo sempre sintético.

    python3 -B -m unittest discover -s bridge -t bridge
"""

from __future__ import annotations

import json
import sys
import traceback
import types
import unittest
from unittest import mock

from creditum_hermes_reasoning.codex import (
    CREATE_EXECUTION_CONTROL_FIELDS,
    FINAL_CREATE_FIELDS,
    EXPECTED_SDK_VERSION,
    GOVERNED_STREAM,
    REQUEST_FIELDS,
    CodexDefect,
    CodexRefusal,
    PrecallProbeComplete,
    extract_governed_response_text,
    build_governed_request,
    enforce_final_request,
    governed_user_payload,
    parse_reasoning_envelope,
    request_fingerprint,
    verify_sdk_surface,
)
from creditum_hermes_reasoning.contract import build_system_contract
from creditum_hermes_reasoning.executor import (  # noqa: F401
    _SDK_ISSUER,
    MODE_LIVE,
    MODE_PRECALL_PROBE,
    VERDICT_MODEL_OUTPUT_UNVALIDATED,
    CreditumCodexReasoningExecutor,
    ExecutorDefect,
    ExecutorRefusal,
    GovernedReasoningRun,
    RESPONSE_POLICY_APPROVED,
    TrustedSdkProvider,
    UntrustedReasoningEnvelope,
)
from creditum_hermes_reasoning.probe import load_fixture
from tests.support import (
    issue_governed_response_types_for_tests,
    TEST_FAKE_BASE_URL,
    TEST_FAKE_SECRET,
    approved_binding_for_tests,
    issue_trusted_sdk_provider_for_tests,
    live_authorization_for_tests,
)
from creditum_hermes_reasoning.runtime import (
    APPROVED_API_MODE,
    APPROVED_MODEL,
    APPROVED_PROVIDER,
    RuntimeRefusal,
)

CONTRATO = build_system_contract()
FIXTURE, FIXTURE_HASH = load_fixture()
READ_MODEL = FIXTURE["read_model"]

#: Saída de máquina válida. Sem prosa, sem cerca.
JSON_OK = '{"insights":[]}'


def run(**over) -> GovernedReasoningRun:
    return GovernedReasoningRun(
        contract=over.pop("contract", CONTRATO),
        binding=over.pop("binding", approved_binding_for_tests()),
        read_model=over.pop("read_model", dict(READ_MODEL)),
        live_authorization=over.pop("live_authorization", None),
        # 3.1d-D1: controles derivados do orçamento monotônico. No teste, o teto.
        execution_controls=over.pop(
            "execution_controls", {"background": False, "timeout": 180.0}
        ),
    )


def requisicao(**over) -> dict:
    b = over.pop("binding", approved_binding_for_tests())
    payload = over.pop("payload", governed_user_payload(dict(READ_MODEL)))
    r = dict(build_governed_request(binding=b, contract=CONTRATO, user_payload=payload))
    r.update(over)
    return r


# ─── objetos de resposta falsos, com a forma DECLARADA ───────────────────────


class Bloco:
    def __init__(self, texto, tipo="output_text"):
        self.type, self.text = tipo, texto


class Item:
    #: 3.1d-c6: a mensagem passou a declarar `role` e `status`, porque a política
    #: governada agora os confere — um `Response` concluído não desculpa uma mensagem
    #: não concluída.
    def __init__(self, blocos, tipo="message", papel="assistant", status="completed", phase=None):
        self.type, self.content, self.role, self.status, self.phase = tipo, blocos, papel, status, phase


class Recusa:
    def __init__(self, texto="recusa sintética"):
        self.type, self._refusal = "refusal", texto


class ItemOpaco:
    """Reasoning/compaction sintéticos: reconhecidos por CLASSE, nunca lidos."""


class ItemCompaction(ItemOpaco):
    pass


class Resposta:
    #: 3.1d-c6: `incomplete_details` entrou porque a política o exige.
    def __init__(self, *, status="completed", itens=None, erro=None, incompleto=None):
        self.status, self.output, self.error = status, itens if itens is not None else [], erro
        self.incomplete_details = incompleto


def tipos():
    """Os seis tipos selados, a partir das classes sintéticas DESTE módulo."""
    return issue_governed_response_types_for_tests(
        response=Resposta,
        output_message=Item,
        output_text=Bloco,
        output_refusal=Recusa,
        reasoning_item=ItemOpaco,
        compaction_item=ItemCompaction,
    )


def extrai(resposta):
    return extract_governed_response_text(resposta, types=tipos())


def resposta_com(texto: str, **over) -> Resposta:
    return Resposta(itens=[Item([Bloco(texto)])], **over)


class ClienteFalso:
    """Registra EXATAMENTE o que recebeu. Nunca faz rede."""

    def __init__(self, resposta):
        self.chamadas: list[dict] = []
        self.responses = types.SimpleNamespace(create=self._create)
        self._resposta = resposta

    def _create(self, **kwargs):
        self.chamadas.append(kwargs)
        return self._resposta


#: Registro das construções de cliente. O cliente falso é construído pelo EXECUTOR
#: agora — não há mais fábrica para espiar, então ele se registra sozinho.
CONSTRUCOES: list = []


class RecursoFalso:
    """O recurso `responses` aprovado."""

    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def create(self, *, model, instructions, input, tools, stream, background, timeout):
        return self._cliente._registrar(
            model=model, instructions=instructions, input=input, tools=tools,
            stream=stream, background=background, timeout=timeout,
        )


class ClienteFalso:
    """
    A classe de cliente aprovada. Assinatura COMPATÍVEL com o que o vínculo passa.

    O executor a constrói; o teste lê o que ela recebeu.
    """

    #: A resposta que a próxima instância vai devolver.
    proxima_resposta: Any = None

    def __init__(self, *, api_key: str, base_url: str, max_retries: int = 2) -> None:
        self.api_key, self.base_url, self.max_retries = api_key, base_url, max_retries
        self.chamadas: list[dict] = []
        self.responses = RecursoFalso(self)
        CONSTRUCOES.append({"api_key": api_key, "base_url": base_url, "max_retries": max_retries})
        # `ClienteFalso.ultima` e não `type(self).ultima`: uma subclasse gravaria no
        # próprio atributo e o teste leria o do pai, vazio — parecendo zero chamadas.
        ClienteFalso.ultima = self

    #: Chamado no início da chamada aprovada. Espiar de dentro é a única forma que
    #: sobrevive à conferência de procedência do recurso — e é a forma honesta.
    espiao: Any = None

    def _registrar(self, **kwargs):
        if ClienteFalso.espiao is not None:
            ClienteFalso.espiao()
        self.chamadas.append(kwargs)
        return ClienteFalso.proxima_resposta


def preparar(resposta=None):
    """Zera o estado dos fixtures e arma a resposta da PRÓXIMA instância de cliente."""
    CONSTRUCOES.clear()
    ClienteFalso.proxima_resposta = resposta
    ClienteFalso.ultima = None
    ClienteFalso.espiao = None


def chamadas() -> list:
    """As chamadas que o cliente construído PELO EXECUTOR recebeu."""
    ultima = getattr(ClienteFalso, "ultima", None)
    return [] if ultima is None else ultima.chamadas


def provedor(**over):
    """Provedor SELADO sintético. Superfície compatível por padrão."""
    return issue_trusted_sdk_provider_for_tests(
        version=over.pop("version", EXPECTED_SDK_VERSION),
        client_class=over.pop("client_class", ClienteFalso),
        responses_resource_class=over.pop("responses_resource_class", RecursoFalso),
        create_descriptor=over.pop("create_descriptor", RecursoFalso.create),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# O AIAgent SAIU — ausência PROVADA, não presumida
# ═══════════════════════════════════════════════════════════════════════════════


class ModuloExplosivo(types.ModuleType):
    """Qualquer acesso a atributo estoura. Prova que ninguém tocou."""

    def __getattr__(self, nome):
        raise AssertionError(f"o caminho governado tocou {self.__name__}.{nome}")


PROIBIDOS = (
    "run_agent",
    "model_tools",
    "acp_adapter",
    "agent",
    "plugins",
    "relay_llm",
    "hermes",
)


class AusenciaDoAIAgent(unittest.TestCase):
    def setUp(self) -> None:
        self._antes = {n: sys.modules.get(n) for n in PROIBIDOS}
        for n in PROIBIDOS:
            sys.modules[n] = ModuloExplosivo(n)

    def tearDown(self) -> None:
        for n, antigo in self._antes.items():
            if antigo is None:
                sys.modules.pop(n, None)
            else:
                sys.modules[n] = antigo

    def test_a_sonda_nao_toca_NENHUM_modulo_do_hermes(self) -> None:
        # Sentinelas explosivas instaladas: se a sonda tocar qualquer um, estoura.
        executor = CreditumCodexReasoningExecutor()
        with self.assertRaises(PrecallProbeComplete):
            executor.precall_probe(run())
        self.assertEqual(executor.evidence.verdict, "PRECALL_PROBE_COMPLETE")

    def test_o_caminho_VIVO_tambem_nao_toca(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(len(chamadas()), 1)

    def test_o_pacote_nao_importa_openai_nem_run_agent(self) -> None:
        # `run_agent` executa `load_hermes_dotenv()` no import: um import que lê segredo
        # do disco é efeito colateral que leitura de código não denuncia.
        import creditum_hermes_reasoning.codex  # noqa: F401
        import creditum_hermes_reasoning.executor  # noqa: F401

        executor = CreditumCodexReasoningExecutor()
        with self.assertRaises(PrecallProbeComplete):
            executor.precall_probe(run())
        self.assertNotIn("openai", sys.modules)

    def test_o_pacote_nao_declara_o_AIAgent_em_lugar_nenhum(self) -> None:
        import pathlib

        raiz = pathlib.Path(creditum_hermes_reasoning_dir())
        mortos = ("run_agent", "AIAgent", "run_conversation", "init_agent", "discover_plugins")
        achados = []
        for py in sorted(raiz.glob("*.py")):
            fonte = py.read_text(encoding="utf-8")
            # Comentário e docstring podem NOMEAR o que foi removido — é história. O que
            # não pode existir é código executável que os alcance.
            executavel = "\n".join(
                l for l in fonte.splitlines() if not l.lstrip().startswith("#")
            )
            for morto in mortos:
                if f"import {morto}" in executavel or f"{morto}(" in executavel:
                    achados.append(f"{py.name}:{morto}")
        self.assertEqual(achados, [])


def creditum_hermes_reasoning_dir() -> str:
    import creditum_hermes_reasoning
    import pathlib

    return str(pathlib.Path(creditum_hermes_reasoning.__file__).parent)


# ═══════════════════════════════════════════════════════════════════════════════
# A requisição FECHADA
# ═══════════════════════════════════════════════════════════════════════════════


class RequisicaoFechada(unittest.TestCase):
    def test_os_campos_sao_exatamente_estes(self) -> None:
        self.assertEqual(REQUEST_FIELDS, ("model", "instructions", "input", "tools", "stream"))
        self.assertEqual(set(requisicao().keys()), set(REQUEST_FIELDS))

    def test_o_modelo_vem_do_VINCULO(self) -> None:
        self.assertEqual(requisicao()["model"], APPROVED_MODEL)

    def test_instructions_e_o_contrato_EXATO(self) -> None:
        self.assertEqual(requisicao()["instructions"], CONTRATO.text)

    def test_tools_e_lista_VAZIA_explicita_nao_omissao(self) -> None:
        # Ausência nunca é zero: a 3.1b mediu `None` significando "use o padrão", e o
        # padrão eram 20 ferramentas. `[]` é a única forma que AFIRMA zero.
        r = requisicao()
        self.assertEqual(r["tools"], [])
        self.assertIs(type(r["tools"]), list)

    def test_stream_e_NAO_streaming(self) -> None:
        self.assertIs(requisicao()["stream"], False)
        self.assertIs(GOVERNED_STREAM, False)

    def test_nao_existe_reasoning_nem_bag_de_passagem(self) -> None:
        for proibido in (
            "reasoning",
            "extra_body",
            "extra_query",
            "extra_headers",
            "timeout",
            "metadata",
            "tool_choice",
            "service_tier",
            "parallel_tool_calls",
        ):
            self.assertNotIn(proibido, REQUEST_FIELDS, proibido)

    def test_a_requisicao_e_SOMENTE_LEITURA(self) -> None:
        r = build_governed_request(
            binding=approved_binding_for_tests(),
            contract=CONTRATO,
            user_payload=governed_user_payload(dict(READ_MODEL)),
        )
        with self.assertRaises(TypeError):
            r["model"] = "outro"  # type: ignore[index]

    def test_o_payload_e_DETERMINISTICO(self) -> None:
        a = governed_user_payload(dict(READ_MODEL))
        b = governed_user_payload(dict(READ_MODEL))
        self.assertEqual(a, b)
        self.assertEqual(request_fingerprint(requisicao()), request_fingerprint(requisicao()))

    def test_o_corpo_NAO_carrega_o_segredo(self) -> None:
        corpo = json.dumps(requisicao(), ensure_ascii=False)
        self.assertNotIn(TEST_FAKE_SECRET, corpo)
        self.assertNotIn(TEST_FAKE_BASE_URL, corpo)
        self.assertNotIn(TEST_FAKE_SECRET, request_fingerprint(requisicao()))


# ═══════════════════════════════════════════════════════════════════════════════
# O PORTÃO FINAL
# ═══════════════════════════════════════════════════════════════════════════════


class PortaoFinal(unittest.TestCase):
    def portao(self, request, **over):
        b = over.pop("binding", approved_binding_for_tests())
        enforce_final_request(
            request,
            binding=b,
            contract=over.pop("contract", CONTRATO),
            expected_user_payload=over.pop(
                "expected_user_payload", governed_user_payload(dict(READ_MODEL))
            ),
        )

    def recusa(self, request, defeito, **over):
        with self.assertRaises(CodexRefusal, msg=defeito) as ctx:
            self.portao(request, **over)
        self.assertEqual(ctx.exception.defect, defeito)

    def test_a_requisicao_governada_PASSA(self) -> None:
        self.portao(requisicao())

    def test_campo_a_MAIS_e_recusado(self) -> None:
        self.recusa(requisicao(extra_body={"x": 1}), CodexDefect.REQUEST_NOT_CANONICAL)
        self.recusa(requisicao(extra_headers={"a": "b"}), CodexDefect.REQUEST_NOT_CANONICAL)
        self.recusa(requisicao(timeout=1), CodexDefect.REQUEST_NOT_CANONICAL)

    def test_campo_a_MENOS_e_recusado(self) -> None:
        for faltando in REQUEST_FIELDS:
            r = requisicao()
            del r[faltando]
            self.recusa(r, CodexDefect.REQUEST_NOT_CANONICAL)

    def test_system_ACRESCENTADO_e_recusado(self) -> None:
        # Continência aceitaria autoridade que a Creditum não escreveu.
        for adulterado in (
            CONTRATO.text + "\n\nE mais uma regra.",
            "Prefixo.\n\n" + CONTRATO.text,
            CONTRATO.text[:-10],
            "",
        ):
            self.recusa(
                requisicao(instructions=adulterado), CodexDefect.SYSTEM_CONTRACT_MISMATCH
            )

    def test_payload_de_usuario_DIFERENTE_e_recusado(self) -> None:
        self.recusa(requisicao(input=JSON_OK), CodexDefect.USER_PAYLOAD_MISMATCH)

    def test_ferramenta_NAO_VAZIA_e_recusada(self) -> None:
        for tools in ([{"type": "function"}], None, (), "nenhuma", 0):
            self.recusa(requisicao(tools=tools), CodexDefect.TOOLS_NOT_ZERO)

    def test_stream_fora_da_politica_e_recusado(self) -> None:
        self.recusa(requisicao(stream=True), CodexDefect.REQUEST_NOT_CANONICAL)

    def test_modelo_DIFERENTE_do_vinculo_e_recusado(self) -> None:
        self.recusa(requisicao(model="gpt-outro"), CodexDefect.RUNTIME_IDENTITY_MISMATCH)

    def test_segredo_no_CORPO_e_recusado(self) -> None:
        self.recusa(
            requisicao(input=governed_user_payload(dict(READ_MODEL)) + TEST_FAKE_SECRET),
            CodexDefect.USER_PAYLOAD_MISMATCH,
        )

    def test_identidade_de_runtime_nao_aprovada_nem_CONSTROI(self) -> None:
        # O vínculo recusa na emissão: `gpt-outro` nunca chega ao portão.
        for campo, valor in (
            ("provider", "openai"),
            ("model", "gpt-4o"),
            ("api_mode", "openai_chat"),
        ):
            with self.assertRaises(RuntimeRefusal, msg=campo) as ctx:
                approved_binding_for_tests(**{campo: valor})
            self.assertEqual(ctx.exception.defect, "RUNTIME_IDENTITY_MISMATCH")


# ═══════════════════════════════════════════════════════════════════════════════
# base_url — estrutura, nunca reparo
# ═══════════════════════════════════════════════════════════════════════════════


class BaseUrlGovernada(unittest.TestCase):
    def recusa(self, url):
        with self.assertRaises(RuntimeRefusal, msg=repr(url)[:40]) as ctx:
            approved_binding_for_tests(
                execution_material={"base_url": url, "api_key": TEST_FAKE_SECRET}
            )
        self.assertIn(ctx.exception.defect, ("BASE_URL_NOT_APPROVED", "RUNTIME_NOT_RESOLVED"))
        return ctx.exception

    def test_http_e_recusado(self) -> None:
        self.recusa("http://example.test")

    def test_userinfo_e_recusado(self) -> None:
        e = self.recusa("https://user:pass@example.test")
        self.assertNotIn("pass", e.detail)

    def test_query_e_recusada_NAO_removida(self) -> None:
        # Remover em silêncio entregaria um endpoint que o resolvedor não pretendia.
        e = self.recusa("https://example.test/path?token=x")
        self.assertIn("query", e.detail)
        self.assertNotIn("token=x", e.detail)

    def test_fragmento_e_recusado(self) -> None:
        self.assertIn("fragment", self.recusa("https://example.test/path#f").detail)

    def test_host_ausente_e_recusado(self) -> None:
        for url in ("https://", "https:///path", "example.test"):
            self.recusa(url)

    def test_objeto_de_url_e_recusado(self) -> None:
        import pathlib

        for valor in ({"url": "https://x"}, ["https://x"], pathlib.Path("/x"), 42, None):
            self.recusa(valor)

    def test_path_e_ACEITO(self) -> None:
        b = approved_binding_for_tests(
            execution_material={"base_url": "https://a.invalid/v1", "api_key": TEST_FAKE_SECRET}
        )
        self.assertEqual(b.to_client_kwargs()["base_url"], "https://a.invalid/v1")


# ═══════════════════════════════════════════════════════════════════════════════
# api_key — material secreto imutável
# ═══════════════════════════════════════════════════════════════════════════════


class SegredoGovernado(unittest.TestCase):
    def test_objeto_de_credencial_e_recusado(self) -> None:
        class Provedor:
            def get(self):
                return "sk-x"

        for valor in (Provedor(), lambda: "sk-x", ["sk-x"], {"k": "sk-x"}, b"sk-x", 42, "", None):
            with self.assertRaises(RuntimeRefusal, msg=repr(valor)[:30]) as ctx:
                approved_binding_for_tests(
                    execution_material={"base_url": TEST_FAKE_BASE_URL, "api_key": valor}
                )
            self.assertIn(
                ctx.exception.defect, ("SECRET_MATERIAL_INVALID", "RUNTIME_NOT_RESOLVED")
            )

    def test_credencial_AUSENTE_e_nao_resolvido(self) -> None:
        with self.assertRaises(RuntimeRefusal) as ctx:
            approved_binding_for_tests(execution_material={"base_url": TEST_FAKE_BASE_URL})
        self.assertEqual(ctx.exception.defect, "RUNTIME_NOT_RESOLVED")

    def test_o_segredo_nao_aparece_em_LUGAR_algum(self) -> None:
        b = approved_binding_for_tests()
        executor = CreditumCodexReasoningExecutor()
        with self.assertRaises(PrecallProbeComplete):
            executor.precall_probe(run(binding=b))
        superficies = [
            repr(b),
            str(b),
            repr(executor),
            repr(executor.evidence),
            json.dumps(requisicao(binding=b), ensure_ascii=False),
            b.base_url_fingerprint(),
            executor.evidence.request_hash,
            executor.evidence.user_payload_hash,
        ]
        for s in superficies:
            self.assertNotIn(TEST_FAKE_SECRET, s)

    def test_o_segredo_aparece_APENAS_nos_kwargs_do_cliente(self) -> None:
        b = approved_binding_for_tests()
        self.assertEqual(b.to_client_kwargs()["api_key"], TEST_FAKE_SECRET)
        self.assertTrue(b.has_secret_material())


# ═══════════════════════════════════════════════════════════════════════════════
# PRECALL — zero cliente, zero requisição, zero rede
# ═══════════════════════════════════════════════════════════════════════════════


class SondaPrecall(unittest.TestCase):
    def test_a_sonda_prova_e_PARA(self) -> None:
        executor = CreditumCodexReasoningExecutor()
        with self.assertRaises(PrecallProbeComplete):
            executor.precall_probe(run())
        ev = executor.evidence
        self.assertEqual(ev.mode, MODE_PRECALL_PROBE)
        self.assertEqual(ev.client_constructions, 0)
        self.assertEqual(ev.provider_calls, 0)
        self.assertFalse(ev.model_call_completed)
        self.assertEqual(ev.tool_count, 0)
        self.assertEqual(ev.verdict, "PRECALL_PROBE_COMPLETE")

    def test_a_sonda_NAO_constroi_cliente_mesmo_havendo_PROVEDOR(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        with self.assertRaises(PrecallProbeComplete):
            executor.precall_probe(run())
        self.assertEqual(CONSTRUCOES, [])
        self.assertEqual(chamadas(), [])

    def test_o_modo_padrao_e_a_SONDA(self) -> None:
        self.assertEqual(run().mode, MODE_PRECALL_PROBE)

    def test_sem_capacidade_o_VIVO_recusa(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        with self.assertRaises(ExecutorRefusal) as ctx:
            executor.execute_live(run())
        self.assertEqual(ctx.exception.defect, "LIVE_NOT_AUTHORIZED")
        self.assertEqual(CONSTRUCOES, [])

    def test_capacidade_FORJADA_nao_autoriza(self) -> None:
        class Falsa:
            _issuer = object()

        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        for falsa in (Falsa(), "LIVE", True, 1, {"_issuer": 1}):
            with self.assertRaises(ExecutorRefusal, msg=repr(falsa)[:20]):
                executor.execute_live(run(live_authorization=falsa))
        self.assertEqual(CONSTRUCOES, [])

    def test_nao_existe_seletor_publico_de_LIVE(self) -> None:
        import dataclasses

        campos = [f.name for f in dataclasses.fields(GovernedReasoningRun)]
        for proibido in ("mode", "live", "provider", "model", "api_mode", "api_key", "base_url"):
            self.assertNotIn(proibido, campos, proibido)


# ═══════════════════════════════════════════════════════════════════════════════
# VIVO falso — o objeto validado é o objeto enviado
# ═══════════════════════════════════════════════════════════════════════════════


class VivoComClienteFalso(unittest.TestCase):
    def executa(self, resposta, **over):
        preparar(resposta)
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        r = run(live_authorization=live_authorization_for_tests(), **over)
        return executor, None, CONSTRUCOES, r

    def test_UMA_chamada_e_os_kwargs_sao_os_VALIDADOS(self) -> None:
        executor, _, registro, r = self.executa(resposta_com(JSON_OK))
        executor.execute_live(r)
        self.assertEqual(len(chamadas()), 1)
        enviado = chamadas()[0]
        # 3.1d-D1: a invocação final é pedido semântico UNIÃO controles, exata.
        self.assertEqual(set(enviado.keys()), set(FINAL_CREATE_FIELDS))
        self.assertIs(enviado["background"], False)
        self.assertEqual(enviado["timeout"], 180.0)
        self.assertEqual(enviado["instructions"], CONTRATO.text)
        self.assertEqual(enviado["input"], governed_user_payload(dict(READ_MODEL)))
        self.assertEqual(enviado["tools"], [])
        self.assertIs(enviado["stream"], False)
        self.assertEqual(enviado["model"], APPROVED_MODEL)
        # E o cliente recebeu credencial e endpoint — e SÓ isso.
        # 3.1d-D1: extensão DELIBERADA. Credencial, endpoint e o controle governado de
        # zero-retry — e nada além disso. Não é regressão da r5: é o vocabulário do
        # cliente crescendo por decisão, com o mesmo fechamento.
        self.assertEqual(set(registro[0].keys()), {"api_key", "base_url", "max_retries"})
        self.assertEqual(registro[0]["max_retries"], 0)

    def test_UMA_chamada_e_ZERO_auxiliares(self) -> None:
        executor, _, _, r = self.executa(resposta_com(JSON_OK))
        executor.execute_live(r)
        self.assertEqual(executor.evidence.provider_calls, 1)
        self.assertEqual(executor.evidence.client_constructions, 1)
        self.assertTrue(executor.evidence.model_call_completed)

    def test_mutar_a_fonte_do_read_model_DEPOIS_nao_afeta(self) -> None:
        fonte = dict(READ_MODEL)
        executor, _, _, r = self.executa(resposta_com(JSON_OK), read_model=fonte)
        esperado = governed_user_payload(dict(r.read_model))
        # A execução usa o read model do run, capturado uma vez.
        executor.execute_live(r)
        fonte["INJETADO"] = "atacante"
        self.assertEqual(chamadas()[0]["input"], esperado)
        self.assertNotIn("INJETADO", chamadas()[0]["input"])

    def test_mutar_o_dicionario_ENVIADO_nao_muda_a_evidencia(self) -> None:
        executor, _, _, r = self.executa(resposta_com(JSON_OK))
        executor.execute_live(r)
        antes = executor.evidence.request_hash
        chamadas()[0]["instructions"] = "adulterado"
        self.assertEqual(executor.evidence.request_hash, antes)

    # ── as respostas falsas, casos A a I ────────────────────────────────────

    def recebe(self, resposta):
        """RECEBE — não aceita. Quem aceita é o TypeScript."""
        executor, _, _, r = self.executa(resposta)
        return executor.execute_live(r)

    def rejeita_e_zera(self, resposta, defeito):
        executor, _, _, r = self.executa(resposta)
        with self.assertRaises(CodexRefusal, msg=defeito) as ctx:
            executor.execute_live(r)
        self.assertEqual(ctx.exception.defect, defeito)

    def test_A_json_de_maquina_valido_e_RECEBIDO_nao_aceito(self) -> None:
        env = self.recebe(resposta_com('{"insights":[{"insight_id":"i1"}]}'))
        self.assertIs(type(env), UntrustedReasoningEnvelope)
        self.assertEqual(env.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)
        self.assertEqual(len(env.insight_candidates), 1)

    def test_B_cerca_de_markdown_e_REJEITADA(self) -> None:
        self.rejeita_e_zera(
            resposta_com("```json\n" + JSON_OK + "\n```"), CodexDefect.OUTPUT_NOT_VALIDATED
        )

    def test_C_prefixo_de_prosa_e_REJEITADO(self) -> None:
        self.rejeita_e_zera(
            resposta_com("Claro! Aqui está:\n" + JSON_OK), CodexDefect.OUTPUT_NOT_VALIDATED
        )

    def test_D_sem_texto_final_e_REJEITADO(self) -> None:
        # 3.1d-c6: os dois casos deixaram de compartilhar um código. `output` vazio é
        # "não há saída"; mensagem sem bloco é "contagem de conteúdo inválida". Um
        # código por condição — o mesmo defeito para causas diferentes fazia dois
        # operadores lerem a mesma frase para dois fatos.
        self.rejeita_e_zera(Resposta(itens=[]), CodexDefect.RESPONSE_OUTPUT_NOT_AVAILABLE)
        self.rejeita_e_zera(Resposta(itens=[Item([])]), CodexDefect.RESPONSE_CONTENT_COUNT_INVALID)

    def test_E_duas_saidas_finais_sao_AMBIGUAS(self) -> None:
        # Duas respostas finais são duas respostas. Escolher uma seria escolher por nós.
        self.rejeita_e_zera(
            Resposta(itens=[Item([Bloco(JSON_OK), Bloco('{"insights":[1]}')])]),
            CodexDefect.RESPONSE_CONTENT_COUNT_INVALID,
        )
        self.rejeita_e_zera(
            Resposta(itens=[Item([Bloco(JSON_OK)]), Item([Bloco(JSON_OK)])]),
            CodexDefect.RESPONSE_MESSAGE_COUNT_INVALID,
        )

    def test_F_resposta_INCOMPLETA_e_rejeitada(self) -> None:
        for status in ("incomplete", "failed", "cancelled", "in_progress", None, ""):
            self.rejeita_e_zera(
                resposta_com(JSON_OK, status=status),
                CodexDefect.RESPONSE_STATUS_NOT_COMPLETED,
            )

    def test_F_texto_presente_NAO_e_sucesso(self) -> None:
        # Uma resposta interrompida pode carregar texto parcial válido.
        self.rejeita_e_zera(
            resposta_com(JSON_OK, status="incomplete"), CodexDefect.RESPONSE_STATUS_NOT_COMPLETED
        )
        # 3.1d-c6: e agora também pelo campo que a 3.1d-c5 provou existir.
        self.rejeita_e_zera(
            resposta_com(JSON_OK, incompleto=type("I", (), {"reason": "max_output_tokens"})()),
            CodexDefect.RESPONSE_INCOMPLETE,
        )

    def test_F_campo_error_presente_e_rejeitado(self) -> None:
        self.rejeita_e_zera(
            resposta_com(JSON_OK, erro={"code": "x"}), CodexDefect.RESPONSE_ERROR_PRESENT
        )

    def test_I_insights_vazio_e_ESTRUTURALMENTE_valido(self) -> None:
        # Zero achados é uma resposta. Não é falha, e não é "não sei". Mas continua
        # sendo o TypeScript quem decide se vale — daqui sai apenas "recebi".
        env = self.recebe(resposta_com(JSON_OK))
        self.assertEqual(env.insight_candidates, [])
        self.assertEqual(env.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)

    def test_G_H_o_python_NAO_filtra_item_nenhum(self) -> None:
        # A validação HermesInsightV1 e a REFERENCIAL são do lado TypeScript (3.1c-r2).
        # O que este lado não pode fazer é aceitar parcial: se ele descartasse item
        # inválido, a atomicidade de lá receberia uma coleção já mutilada.
        bruto = '{"insights":[{"insight_id":"bom"},{"lixo":true},{"evidence":["ref_inexistente"]}]}'
        env = self.recebe(resposta_com(bruto))
        self.assertEqual(len(env.insight_candidates), 3)
        self.assertEqual(env.insight_candidates, json.loads(bruto)["insights"])
        # E nada disso é sucesso.
        self.assertEqual(env.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)


# ═══════════════════════════════════════════════════════════════════════════════
# Estrutura desconhecida falha FECHADA
# ═══════════════════════════════════════════════════════════════════════════════


class EstruturaDesconhecida(unittest.TestCase):
    def test_fase_commentary_nao_e_resposta_final(self) -> None:
        for fase in ("commentary", "desconhecida", 7):
            with self.assertRaises(CodexRefusal) as ctx:
                extrai(Resposta(itens=[Item([Bloco(JSON_OK)], phase=fase)]))
            self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_MESSAGE_PHASE_INVALID)

    def test_fase_final_ou_ausente_com_uma_mensagem_concluida(self) -> None:
        for fase in ("final_answer", None):
            extraido = extrai(Resposta(itens=[Item([Bloco(JSON_OK)], phase=fase)]))
            self.assertEqual(extraido.text, JSON_OK)

    def test_tipo_de_item_desconhecido_e_recusado(self) -> None:
        with self.assertRaises(CodexRefusal) as ctx:
            # 3.1d-c6: a mensagem tem classe aprovada, mas DECLARA outro tipo. Classe
            # e discriminador têm de concordar.
            extrai(Resposta(itens=[Item([Bloco(JSON_OK)], tipo="reasoning")]))
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_MESSAGE_ROLE_INVALID)

    def test_tipo_de_bloco_desconhecido_e_recusado(self) -> None:
        with self.assertRaises(CodexRefusal) as ctx:
            # Classe `Bloco` (texto aprovado) declarando `refusal`: divergência.
            # A recusa DE VERDADE é a classe `Recusa`, e vira MODEL_REFUSED.
            extrai(Resposta(itens=[Item([Bloco(JSON_OK, tipo="refusal")])]))
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID)

    def test_campo_AUSENTE_e_desconhecido_nao_vazio(self) -> None:
        class Pelada:
            pass

        with self.assertRaises(CodexRefusal) as ctx:
            extrai(Pelada())
        # 3.1d-c6: a classe é conferida ANTES de qualquer campo, então um objeto pelado
        # nem chega à leitura de atributo.
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_TYPE_NOT_APPROVED)

    def test_nem_str_nem_repr_da_resposta(self) -> None:
        # A docstring NOMEIA `str(response)` para explicar por que não se usa. Escanear
        # a fonte crua acusaria a explicação como se fosse o defeito, então corta-se a
        # docstring e o comentário: sobra o que EXECUTA.
        import ast
        import inspect

        arvore = ast.parse(inspect.getsource(extract_governed_response_text).lstrip())
        funcao = arvore.body[0]
        assert isinstance(funcao, ast.FunctionDef)
        corpo = funcao.body[1:] if ast.get_docstring(funcao) else funcao.body
        executavel = "\n".join(ast.unparse(n) for n in corpo)
        self.assertNotIn("str(response)", executavel)
        self.assertNotIn("repr(response)", executavel)
        # E o teste tem de ser capaz de FALHAR: a âncora existe na fonte crua.
        self.assertIn("str(response)", inspect.getsource(extract_governed_response_text))

    def test_envelope_fora_do_formato_e_recusado(self) -> None:
        for texto in (
            "[]",
            '"texto"',
            "null",
            '{"insights":{}}',
            '{"insights":[],"extra":1}',
            '{"achados":[]}',
            "{}",
            "",
            "not json",
        ):
            with self.assertRaises(CodexRefusal, msg=texto[:20]):
                parse_reasoning_envelope(texto)


class SuperficieDoSDK(unittest.TestCase):
    """
    A r3 conferia versão e a EXISTÊNCIA de `OpenAI`. Isso prova que existe um símbolo
    com aquele nome — não que ele aceita o que vamos passar.
    """

    def recusa(self, **over):
        with self.assertRaises(CodexRefusal, msg=repr(over)[:50]) as ctx:
            p = provedor(**over)
            verify_sdk_surface(
                version=p.version, client_class=p.client_class, create_callable=p.create_descriptor
            )
        self.assertEqual(ctx.exception.defect, CodexDefect.SDK_SURFACE_INCOMPATIBLE)
        return ctx.exception

    def test_superficie_compativel_PASSA(self) -> None:
        p = provedor()
        verify_sdk_surface(
            version=p.version, client_class=p.client_class, create_callable=p.create_descriptor
        )

    def test_versao_diferente_e_INCOMPATIVEL(self) -> None:
        for v in ("2.25.0", "2.23.9", None, "", 224):
            self.recusa(version=v)

    def test_construtor_AUSENTE_e_incompativel(self) -> None:
        self.assertIn("cliente ausente", self.recusa(client_class=None).detail)

    def test_construtor_que_nao_aceita_api_key_ou_base_url(self) -> None:
        class SemApiKey:
            def __init__(self, *, base_url: str) -> None:
                pass

        class SemBaseUrl:
            def __init__(self, *, api_key: str) -> None:
                pass

        for classe in (SemApiKey, SemBaseUrl):
            self.assertIn("construtor", self.recusa(client_class=classe).detail)

    def test_construtor_POSICIONAL_APENAS_e_incompativel(self) -> None:
        # Nome certo, mas não passável por palavra chave. Conferir só o nome aprovaria
        # uma assinatura que estoura na chamada — com o cliente de rede já na mão.
        class Posicional:
            def __init__(self, api_key, base_url, /) -> None:
                pass

        self.assertIn("posicional-apenas", self.recusa(client_class=Posicional).detail)

    def test_create_AUSENTE_e_incompativel(self) -> None:
        self.assertIn("responses.create", self.recusa(create_descriptor=None).detail)

    def test_create_sem_um_dos_campos_governados(self) -> None:
        def sem_instructions(self, *, model, input, tools, stream):
            pass

        def sem_stream(self, *, model, instructions, input, tools):
            pass

        for c in (sem_instructions, sem_stream):
            self.assertIn("responses.create", self.recusa(create_descriptor=c).detail)

    def test_create_POSICIONAL_APENAS_e_incompativel(self) -> None:
        def posicional(self, model, instructions, input, tools, stream, /):
            pass

        self.assertIn("posicional-apenas", self.recusa(create_descriptor=posicional).detail)

    def test_kwargs_variadico_e_ACEITO_conscientemente(self) -> None:
        # É como um SDK legitimamente encaminha campos. Recusá-lo exigiria que o
        # fornecedor escrevesse a assinatura do nosso jeito.
        def variadico(self, **kwargs):
            pass

        class ClienteVariadico:
            def __init__(self, **kwargs) -> None:
                pass

        p = provedor(create_descriptor=variadico, client_class=ClienteVariadico)
        verify_sdk_surface(
            version=p.version, client_class=p.client_class, create_callable=p.create_descriptor
        )

    def test_assinatura_ILEGIVEL_e_desconhecida_nao_compativel(self) -> None:
        self.assertIn("responses.create", self.recusa(create_descriptor=print).detail)

    def test_a_lista_exigida_SAI_do_contrato_da_requisicao(self) -> None:
        # Uma lista própria aqui viraria uma segunda declaração do que enviamos, e no
        # dia em que divergissem a conferência provaria a lista errada.
        from creditum_hermes_reasoning.codex import REQUIRED_CREATE_PARAMS

        # 3.1d-D1: a lista exigida saiu do contrato da requisição para a UNIÃO dos
        # dois vocabulários governados — verificar cinco e enviar sete deixaria dois
        # parâmetros sem conferência de compatibilidade. Continua sendo identidade,
        # nunca cópia escrita à mão.
        self.assertIs(REQUIRED_CREATE_PARAMS, FINAL_CREATE_FIELDS)
        self.assertEqual(
            FINAL_CREATE_FIELDS, tuple(REQUEST_FIELDS) + CREATE_EXECUTION_CONTROL_FIELDS
        )
        # E o pedido SEMÂNTICO continua fechado em cinco.
        self.assertEqual(len(REQUEST_FIELDS), 5)


class PortaoDoSdkNoCaminhoVIVO(unittest.TestCase):
    """
    Codex HIGH 1: capacidade viva válida alcançava `responses.create` sem que a
    superfície do SDK fosse conferida.
    """

    def tenta(self, **over):
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(**over), response_types=tipos())
        r = run(live_authorization=live_authorization_for_tests())
        return executor, r

    def recusa_sem_tocar_em_nada(self, **over):
        executor, r = self.tenta(**over)
        with self.assertRaises(CodexRefusal, msg=repr(over)[:40]) as ctx:
            executor.execute_live(r)
        self.assertEqual(ctx.exception.defect, CodexDefect.SDK_SURFACE_INCOMPATIBLE)
        # A prova que importa: nem cliente, nem chamada.
        self.assertEqual(CONSTRUCOES, [], "construiu cliente com SDK não verificado")
        self.assertEqual(chamadas(), [], "chamou provider com SDK não verificado")
        self.assertIsNone(executor.evidence, "contabilizou execução antes de verificar")

    def test_A_construtor_ausente(self) -> None:
        self.recusa_sem_tocar_em_nada(client_class=None)

    def test_B_construtor_incompativel_com_api_key_base_url(self) -> None:
        class Incompativel:
            def __init__(self, *, token: str) -> None:
                pass

        self.recusa_sem_tocar_em_nada(client_class=Incompativel)

    def test_C_responses_create_ausente(self) -> None:
        self.recusa_sem_tocar_em_nada(create_descriptor=None)

    def test_D_create_sem_palavra_chave_governada(self) -> None:
        def incompativel(self, *, model, input):
            pass

        self.recusa_sem_tocar_em_nada(create_descriptor=incompativel)

    def test_E_versao_errada_com_superficie_compativel(self) -> None:
        self.recusa_sem_tocar_em_nada(version="2.25.0")

    def test_F_superficie_verificada_constroi_UMA_vez_e_chama_UMA_vez(self) -> None:
        executor, r = self.tenta()
        executor.execute_live(r)
        self.assertEqual(len(CONSTRUCOES), 1)
        # 3.1d-D1: extensão deliberada do vocabulário do cliente.
        self.assertEqual(set(CONSTRUCOES[0]), {"api_key", "base_url", "max_retries"})
        self.assertEqual(CONSTRUCOES[0]["max_retries"], 0)
        self.assertEqual(len(chamadas()), 1)
        self.assertTrue(executor.evidence.sdk_verified)
        self.assertEqual(executor.evidence.client_constructions, 1)
        self.assertEqual(executor.evidence.provider_calls, 1)

    def test_sem_provedor_nenhum_o_VIVO_recusa(self) -> None:
        executor = CreditumCodexReasoningExecutor(sdk_provider=None)
        with self.assertRaises(ExecutorRefusal) as ctx:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, "SDK_PROVIDER_NOT_TRUSTED")

    def test_provedor_FORJADO_nao_serve(self) -> None:
        import types as _t

        falso = _t.SimpleNamespace(
            version=EXPECTED_SDK_VERSION,
            client_class=ClienteFalso,
            responses_resource_class=RecursoFalso,
            create_descriptor=RecursoFalso.create,
        )
        executor = CreditumCodexReasoningExecutor(sdk_provider=falso, response_types=tipos())
        with self.assertRaises(ExecutorRefusal) as ctx:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, "SDK_PROVIDER_NOT_TRUSTED")


class UmaDerivacaoSo(unittest.TestCase):
    def test_o_payload_e_derivado_UMA_vez_por_execucao(self) -> None:
        # A regra: capturar uma vez e nunca reler. Uma segunda derivação depois da
        # resposta seria a porta por onde uma recaptura entraria — e recaptura é o
        # defeito que a 3.1c fechou do lado TypeScript.
        import ast
        import inspect

        from creditum_hermes_reasoning import executor as mod

        arvore = ast.parse(inspect.getsource(mod))
        chamadas = [
            n
            for n in ast.walk(arvore)
            if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Name)
            and n.func.id == "governed_user_payload"
        ]
        self.assertEqual(len(chamadas), 1, "o payload tem de ser derivado em um só lugar")

    def test_a_derivacao_fica_ANTES_do_portao_e_nao_se_repete(self) -> None:
        import inspect

        fonte = inspect.getsource(CreditumCodexReasoningExecutor.execute_live)
        self.assertNotIn("governed_user_payload", fonte)


class CliSemSuperficieDeChamador(unittest.TestCase):
    def cli(self, argv):
        import contextlib
        import io as _io

        from creditum_hermes_reasoning.__main__ import main

        out, err = _io.StringIO(), _io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            codigo = main(argv)
        return codigo, out.getvalue(), err.getvalue()

    def test_flag_desconhecida_e_RECUSADA(self) -> None:
        # Aceitar em silêncio o que não se entende deixa um operador achar que
        # configurou algo. E a flag que ele acha que ligou é justamente a perigosa.
        for extra in (
            "--live",
            "--provider=openai",
            "--model=gpt-4o",
            "--api-mode=openai_chat",
            "--base-url=https://x.invalid",
            "--api-key=sk-x",
            "--cwd=/tmp",
        ):
            codigo, saida, _ = self.cli(["--precall-probe", extra])
            self.assertEqual(codigo, 2, extra)
            self.assertEqual(saida, "", extra)

    def test_sem_flag_nenhuma_mostra_uso(self) -> None:
        codigo, saida, _ = self.cli([])
        self.assertEqual(codigo, 2)
        self.assertEqual(saida, "")

    def test_a_sonda_recusa_sem_o_RUNTIME_DE_PRODUCAO(self) -> None:
        # O resolvedor de produção existe desde a r6, mas o `hermes_cli` não está nesta
        # máquina. Ausência do runtime é recusa NOMEADA — nunca leitura de ambiente.
        codigo, saida, _ = self.cli(["--precall-probe"])
        self.assertEqual(codigo, 1)
        relatorio = json.loads(saida)
        self.assertIn(
            relatorio["verdict"], ("HERMES_RUNTIME_NOT_AVAILABLE", "RUNTIME_NOT_RESOLVED")
        )
        self.assertFalse(relatorio["aiagent_used"])
        self.assertFalse(relatorio["sdk_call_attempted"])
        self.assertEqual(relatorio["provider_call_count"], 0)
        self.assertNotIn(TEST_FAKE_SECRET, saida)


class AndaimeNaoEmbarca(unittest.TestCase):
    """
    O pacote de produção não pode emitir capacidade nem carregar segredo — nem por
    descuido de import.

    Isto virou teste porque o empacotador da r3 PEGOU o defeito: o artefato levava o
    segredo sintético e duas fábricas de autoridade, porque elas moravam em
    `runtime.py`. Uma fábrica de capacidade dentro do pacote de produção é exatamente o
    emissor que a r1 garantiu não existir.
    """

    def test_o_pacote_nao_expoe_fabrica_de_capacidade(self) -> None:
        import pathlib

        raiz = pathlib.Path(creditum_hermes_reasoning_dir())
        achados = []
        for py in sorted(raiz.rglob("*.py")):
            fonte = py.read_text(encoding="utf-8")
            for veneno in (
                "test-secret-never-log",
                "approved_binding_for_tests",
                "live_authorization_for_tests",
                "_MATERIAL_SINTETICO",
            ):
                if veneno in fonte:
                    achados.append(f"{py.name}:{veneno}")
        self.assertEqual(achados, [])

    def test_nenhuma_funcao_publica_do_pacote_emite_capacidade(self) -> None:
        import importlib
        import inspect
        import pkgutil

        import creditum_hermes_reasoning as pkg
        from creditum_hermes_reasoning.runtime import live_authorization_is_valid

        emitiu = []
        for info in pkgutil.iter_modules(pkg.__path__):
            mod = importlib.import_module(f"{pkg.__name__}.{info.name}")
            for nome, obj in vars(mod).items():
                if nome.startswith("_") or not callable(obj):
                    continue
                try:
                    sig = inspect.signature(obj)
                except (TypeError, ValueError):
                    continue
                if any(
                    p.default is inspect.Parameter.empty
                    and p.kind
                    in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)
                    for p in sig.parameters.values()
                ):
                    continue
                try:
                    resultado = obj()
                except Exception:
                    continue
                if live_authorization_is_valid(resultado):
                    emitiu.append(f"{info.name}.{nome}")
        self.assertEqual(emitiu, [])


# ═══════════════════════════════════════════════════════════════════════════════
# Codex HIGH 2 — o Python não é autoridade semântica
#
# A r3 marcava `OK` depois de parsear o envelope. Isso criava uma SEGUNDA autoridade
# de sucesso, e `{"insights":[{}]}` passava: JSON válido, envelope certo, nenhum
# insight válido, nenhuma conferência referencial.
#
# A autoridade canônica está embarcada e testada no TypeScript:
#
#     reasoning.ts   acceptHermesReasoningOutput      envelope + contrato + referencial
#     reasoning.ts   validateInsightsAgainstReadModel referências contra o read model
#     adapter.ts     assertValid("hermes-insight")    contrato de cada item
#
# Duplicá-las aqui criaria duas autoridades que divergem no dia em que uma muda.
# ═══════════════════════════════════════════════════════════════════════════════


class PythonNaoAceita(unittest.TestCase):
    def vivo(self, texto):
        preparar(resposta_com(texto))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        env = executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        return executor, env

    def test_insight_VAZIO_nao_vira_sucesso(self) -> None:
        # O exemplo exato do Codex. JSON válido, envelope certo, nada dentro que valha.
        executor, env = self.vivo('{"insights":[{}]}')
        self.assertEqual(env.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)
        self.assertNotEqual(executor.evidence.verdict, "OK")
        self.assertEqual(executor.evidence.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)

    def test_evidencia_inventada_nao_vira_sucesso_deste_lado(self) -> None:
        bruto = '{"insights":[{"insight_id":"i1","evidence_refs":["ref_que_nao_existe"]}]}'
        executor, env = self.vivo(bruto)
        self.assertEqual(env.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)
        self.assertNotEqual(executor.evidence.verdict, "OK")

    def test_o_tipo_devolvido_ANUNCIA_que_nao_foi_validado(self) -> None:
        # Um tipo chamado `ReasoningResult` seria lido como resultado, e alguém o
        # devolveria ao chamador achando que estava validado.
        _, env = self.vivo(JSON_OK)
        self.assertIs(type(env), UntrustedReasoningEnvelope)
        self.assertIn("Untrusted", type(env).__name__)
        for enganoso in ("status", "accepted", "ok", "success", "insights"):
            self.assertFalse(hasattr(env, enganoso), enganoso)

    def test_NENHUM_veredito_de_sucesso_existe_no_executor(self) -> None:
        # Não basta o caminho atual não produzir `OK`: não pode existir a constante.
        import ast
        import inspect

        from creditum_hermes_reasoning import executor as mod

        fonte = inspect.getsource(mod)
        literais = {
            n.value
            for n in ast.walk(ast.parse(fonte))
            if isinstance(n, ast.Constant) and type(n.value) is str
        }
        for proibido in ("OK", "SUCCESS", "ACCEPTED", "VALIDATED"):
            self.assertNotIn(proibido, literais, f"{proibido} é veredito de sucesso")

    def test_o_python_nao_tem_o_schema_nem_as_regras_referenciais(self) -> None:
        # Se alguém recriar o validador aqui, passam a existir duas autoridades.
        import pathlib

        raiz = pathlib.Path(creditum_hermes_reasoning_dir())
        achados = []
        for py in sorted(raiz.rglob("*.py")):
            fonte = py.read_text(encoding="utf-8")
            executavel = "\n".join(
                l for l in fonte.splitlines() if not l.lstrip().startswith("#")
            )
            for regra in ("hermes-insight", "evidence_ref", "materiality_ref", "support_ref"):
                if regra in executavel:
                    achados.append(f"{py.name}:{regra}")
        self.assertEqual(achados, [], "autoridade semântica duplicada em Python")

    def test_os_estagios_tem_TIPOS_distintos(self) -> None:
        # RAW → TEXTO → ENVELOPE NÃO CONFIÁVEL. Se compartilhassem tipo, um sucesso
        # acidental de estágio anterior passaria por resultado final.
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        r = run(live_authorization=live_authorization_for_tests())
        bruta = resposta_com(JSON_OK)
        extraido = extrai(bruta)
        texto = extraido.text
        env_cru = parse_reasoning_envelope(texto)
        final = executor.execute_live(r)
        # 3.1d-c6: a extração devolve um DTO estrutural, e o texto é um campo dele —
        # três tipos distintos em três estágios, e nenhum deles é aceitação semântica.
        self.assertIsNot(type(bruta), type(extraido))
        self.assertIsNot(type(extraido), type(texto))
        self.assertIs(type(texto), str)
        self.assertIsNot(type(env_cru), type(final))
        self.assertIs(type(final), UntrustedReasoningEnvelope)

    def test_a_sonda_NUNCA_recebe_saida_de_modelo(self) -> None:
        executor = CreditumCodexReasoningExecutor(sdk_provider=None)
        with self.assertRaises(PrecallProbeComplete):
            executor.precall_probe(run())
        ev = executor.evidence
        self.assertEqual(ev.verdict, "PRECALL_PROBE_COMPLETE")
        self.assertFalse(ev.sdk_verified)
        self.assertEqual((ev.client_constructions, ev.provider_calls), (0, 0))
        self.assertFalse(ev.model_call_completed)


class EvidenciaNaoMENTE(unittest.TestCase):
    """
    Contador de chamada é prova para quem audita. Um contador que sobe antes da
    chamada transforma "tentamos" em "chamamos" — e quem lesse o relatório
    investigaria uma chamada que nunca existiu.
    """

    def test_falha_ao_construir_o_cliente_reporta_ZERO_chamadas(self) -> None:
        class ClienteIndisponivel:
            def __init__(self, *, api_key: str, base_url: str, max_retries: int = 2) -> None:
                raise RuntimeError("cliente indisponível")

        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(
            sdk_provider=provedor(client_class=ClienteIndisponivel), response_types=tipos()
        )
        with self.assertRaises(RuntimeError):
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(chamadas(), [])
        self.assertEqual(executor.evidence.provider_calls, 0)
        self.assertEqual(executor.evidence.client_constructions, 0)

    def test_o_contador_so_sobe_IMEDIATAMENTE_antes_da_chamada(self) -> None:
        # Espiado de DENTRO da chamada aprovada: naquele instante o contador já tem de
        # valer 1, e não antes.
        estado: dict = {}
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        ClienteFalso.espiao = lambda: estado.__setitem__(
            "no_momento_da_chamada", executor.evidence.provider_calls
        )
        try:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        finally:
            ClienteFalso.espiao = None
        self.assertEqual(estado["no_momento_da_chamada"], 1)


# ═══════════════════════════════════════════════════════════════════════════════
# r5 — PROCEDÊNCIA SELADA e ligação do VERIFICADO ao INVOCADO
#
# Codex HIGH da r4: o verificador conferia UMA superfície declarada e o VIVO podia
# invocar outra. `build_client` devolvia um cliente qualquer, e o nome "Trusted" não
# era procedência — era um nome.
# ═══════════════════════════════════════════════════════════════════════════════


class ProcedenciaSelada(unittest.TestCase):
    def recusa(self, prov, defeito="SDK_PROVIDER_NOT_TRUSTED"):
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=prov, response_types=tipos())
        with self.assertRaises(ExecutorRefusal, msg=repr(prov)[:40]) as ctx:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, defeito)
        self.assertEqual(CONSTRUCOES, [], "construiu cliente com provedor não selado")
        self.assertEqual(chamadas(), [], "chamou provider com provedor não selado")
        return ctx.exception

    def test_construcao_PUBLICA_nao_produz_provedor_aceito(self) -> None:
        # Construtor público com superfície 100% compatível. O selo é que falta.
        with self.assertRaises(ExecutorRefusal) as ctx:
            TrustedSdkProvider(
                _issuer=object(),
                version=EXPECTED_SDK_VERSION,
                client_class=ClienteFalso,
                responses_resource_class=RecursoFalso,
                create_descriptor=RecursoFalso.create,
            )
        self.assertEqual(ctx.exception.defect, "SDK_PROVIDER_NOT_TRUSTED")

    def test_objeto_com_a_MESMA_FORMA_e_recusado(self) -> None:
        import dataclasses

        @dataclasses.dataclass
        class Sosia:
            version: Any = EXPECTED_SDK_VERSION
            client_class: Any = ClienteFalso
            responses_resource_class: Any = RecursoFalso
            create_descriptor: Any = RecursoFalso.create

        class Solto:
            version = EXPECTED_SDK_VERSION
            client_class = ClienteFalso
            responses_resource_class = RecursoFalso
            create_descriptor = RecursoFalso.create

        for falso in (
            Sosia(),
            Solto(),
            {
                "version": EXPECTED_SDK_VERSION,
                "client_class": ClienteFalso,
                "responses_resource_class": RecursoFalso,
                "create_descriptor": RecursoFalso.create,
            },
            None,
            "provedor",
        ):
            self.recusa(falso)

    def test_SUBCLASSE_do_provedor_e_recusada(self) -> None:
        # `type(...) is` e não `isinstance`: uma subclasse herdaria o selo do pai sem
        # herdar a intenção.
        class Derivado(TrustedSdkProvider):
            pass

        # Com o selo VERDADEIRO: o teste tem de provar que `type(...) is` recusa a
        # subclasse mesmo quando ela carrega o sentinela legítimo.
        derivado = Derivado.__new__(Derivado)
        object.__setattr__(derivado, "_issuer", _SDK_ISSUER)
        object.__setattr__(derivado, "version", EXPECTED_SDK_VERSION)
        object.__setattr__(derivado, "client_class", ClienteFalso)
        object.__setattr__(derivado, "responses_resource_class", RecursoFalso)
        object.__setattr__(derivado, "create_descriptor", RecursoFalso.create)
        self.recusa(derivado)

    def test_NAO_existe_costura_de_fabrica_no_provedor(self) -> None:
        # O ataque do Codex era exatamente por aqui. A costura tem de não existir.
        import dataclasses

        campos = {f.name for f in dataclasses.fields(TrustedSdkProvider)}
        for costura in ("build_client", "client_factory", "factory", "resolver", "loader"):
            self.assertNotIn(costura, campos, costura)
        self.assertEqual(
            campos,
            {
                "_issuer",
                "version",
                "client_class",
                "responses_resource_class",
                "create_descriptor",
                "response_policy",
            },
        )


class VerificadoEhOInvocado(unittest.TestCase):
    """Cada teste ataca uma junta diferente entre o que se verifica e o que se chama."""

    def ataca(self, defeito, **over):
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(**over), response_types=tipos())
        with self.assertRaises(ExecutorRefusal, msg=defeito) as ctx:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, defeito)
        self.assertEqual(chamadas(), [])
        self.assertEqual(executor.evidence.provider_calls, 0)
        return executor

    def test_construtor_valido_que_devolve_OUTRO_tipo(self) -> None:
        # `__new__` pode devolver qualquer coisa. Conferir só o construtor provaria a
        # chamada, não o objeto — e era essa distância que sobrava.
        class Impostor:
            def __init__(self, *, api_key, base_url, max_retries=2) -> None:
                pass

            responses = RecursoFalso(None)

        class ClasseTraicoeira:
            def __new__(cls, **kwargs):
                return Impostor(**kwargs)

            def __init__(self, *, api_key: str, base_url: str, max_retries: int = 2) -> None:
                pass

        executor = self.ataca("SDK_CLIENT_TYPE_MISMATCH", client_class=ClasseTraicoeira)
        self.assertEqual(executor.evidence.client_constructions, 0)

    def test_recurso_responses_de_OUTRO_tipo(self) -> None:
        # Ter um `.create` com a assinatura certa não faz de um objeto o recurso
        # aprovado.
        class RecursoImpostor:
            def create(self, *, model, instructions, input, tools, stream, background, timeout):
                raise AssertionError("o recurso impostor foi chamado")

        class ClienteComRecursoTrocado(ClienteFalso):
            def __init__(self, *, api_key: str, base_url: str, max_retries: int = 2) -> None:
                super().__init__(api_key=api_key, base_url=base_url, max_retries=max_retries)
                self.responses = RecursoImpostor()

        self.ataca(
            "SDK_RESPONSES_RESOURCE_MISMATCH",
            client_class=ClienteComRecursoTrocado,
            responses_resource_class=RecursoFalso,
        )

    def test_create_com_MESMO_nome_e_MESMA_assinatura_mas_outra_funcao(self) -> None:
        # Nome e assinatura são falsificáveis. Identidade de função não é.
        class RecursoQuaseIgual:
            def create(self, *, model, instructions, input, tools, stream, background, timeout):
                raise AssertionError("o create impostor foi chamado")

        class ClienteQuaseIgual(ClienteFalso):
            def __init__(self, *, api_key: str, base_url: str, max_retries: int = 2) -> None:
                super().__init__(api_key=api_key, base_url=base_url, max_retries=max_retries)
                self.responses = RecursoQuaseIgual()

        self.ataca(
            "SDK_CREATE_IDENTITY_MISMATCH",
            client_class=ClienteQuaseIgual,
            responses_resource_class=RecursoQuaseIgual,
            create_descriptor=RecursoFalso.create,
        )

    def test_descritor_selado_com_assinatura_DERIVADA_cai_antes_do_cliente(self) -> None:
        # ─── O que este teste NÃO consegue medir, e por quê ─────────────────
        #
        # A intenção original era "identidade certa, assinatura derivada". Isso é
        # INALCANÇÁVEL: se `__func__` é a mesma função, a assinatura é a mesma função.
        # Escrever o teste como se alcançasse produziria uma prova falsa.
        #
        # O que É alcançável — e o que importa — é que um descritor selado com
        # assinatura incompatível cai na conferência DECLARADA, antes de existir
        # cliente. A segunda conferência sobre o callable ligado fica como redundância,
        # e está registrada como equivalente na tabela de mutações.
        class RecursoDerivado:
            def create(self, *, model, input):
                raise AssertionError("chamou com assinatura derivada")

        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(
            sdk_provider=provedor(
                responses_resource_class=RecursoDerivado,
                create_descriptor=RecursoDerivado.create,
            )
        )
        with self.assertRaises(CodexRefusal) as ctx:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, CodexDefect.SDK_SURFACE_INCOMPATIBLE)
        self.assertIsNone(executor.evidence)
        self.assertEqual(CONSTRUCOES, [])
        self.assertEqual(chamadas(), [])

    def test_acessor_que_TROCA_o_callable_na_segunda_leitura(self) -> None:
        # Captura-se UMA vez. Se houvesse segunda leitura, o atacante entraria nela.
        estado = {"leituras": 0, "atacante_chamado": False}

        def atacante(**kwargs):
            estado["atacante_chamado"] = True

        class RecursoAlternante:
            def __init__(self, cliente) -> None:
                self._cliente = cliente

            @property
            def create(self):
                estado["leituras"] += 1
                if estado["leituras"] == 1:
                    return types.MethodType(RecursoFalso.create, RecursoFalso(self._cliente))
                return atacante

        class ClienteAlternante(ClienteFalso):
            def __init__(self, *, api_key: str, base_url: str, max_retries: int = 2) -> None:
                super().__init__(api_key=api_key, base_url=base_url, max_retries=max_retries)
                self.responses = RecursoAlternante(self)

        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(
            sdk_provider=provedor(
                client_class=ClienteAlternante,
                responses_resource_class=RecursoAlternante,
                create_descriptor=RecursoFalso.create,
            ),
            response_types=tipos(),
        )
        executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(estado["leituras"], 1, "o executor releu o acessor")
        self.assertFalse(estado["atacante_chamado"])
        self.assertEqual(len(chamadas()), 1)

    def test_cadeia_COMPLETA_e_selada_constroi_1_e_chama_1(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(len(CONSTRUCOES), 1)
        self.assertEqual(len(chamadas()), 1)
        ev = executor.evidence
        self.assertTrue(ev.sdk_verified)
        self.assertEqual((ev.client_constructions, ev.provider_calls), (1, 1))

    def test_o_emissor_NAO_e_publico(self) -> None:
        import creditum_hermes_reasoning as pkg
        from creditum_hermes_reasoning import executor as mod

        self.assertNotIn("_SDK_ISSUER", getattr(pkg, "__all__", []))
        for nome in dir(pkg):
            self.assertNotIn("ISSUER", nome.upper(), nome)
        # E nenhuma função pública do módulo devolve um provedor aceito.
        import inspect

        for nome, obj in vars(mod).items():
            if nome.startswith("_") or not callable(obj):
                continue
            try:
                if any(
                    p.default is inspect.Parameter.empty
                    and p.kind is not p.VAR_KEYWORD
                    and p.kind is not p.VAR_POSITIONAL
                    for p in inspect.signature(obj).parameters.values()
                ):
                    continue
                resultado = obj()
            except Exception:
                continue
            self.assertIsNot(type(resultado), TrustedSdkProvider, nome)


# ═══════════════════════════════════════════════════════════════════════════════
# R6-R4 — A FRONTEIRA DA CHAMADA AO PROVEDOR
#
# A bateria de mutação dinâmica do R6-R4 achou esta fronteira VIVA: trocar
# `safe_exception_type(causa)` por `causa.args[0]` em PROVIDER_CALL_FAILED não fazia
# nenhum teste cair. O portão sintático via o padrão; nada executava a fronteira.
#
# Uma defesa que só o portão mede é uma defesa medida em uma dimensão. A exceção do
# SDK é o material MAIS sensível que passa por aqui — ela nasce de uma resposta HTTP
# real e pode carregar header de autorização, endpoint e corpo.
# ═══════════════════════════════════════════════════════════════════════════════

_SEGREDO_DO_SDK = "test-secret-never-log"
_URL_DO_SDK = "https://key-user:key-pass@codex.invalid/v1?token=hidden"


class ExplosaoDoSDK(Exception):
    """Como uma exceção de SDK realmente se parece: credencial e endpoint no texto."""

    def __init__(self) -> None:
        super().__init__(f"401 em {_URL_DO_SDK} com chave {_SEGREDO_DO_SDK}")

    def __repr__(self) -> str:
        return f"ExplosaoDoSDK({_SEGREDO_DO_SDK!r}, {_URL_DO_SDK!r})"


class FronteiraDaChamadaAoProvedor(unittest.TestCase):
    def _estoura(self, fabrica):
        preparar(resposta_com(JSON_OK))

        def espiao_que_estoura():
            # O espião é CHAMADO; passar a classe da exceção apenas a construiria.
            raise fabrica()

        ClienteFalso.espiao = espiao_que_estoura
        self.addCleanup(setattr, ClienteFalso, "espiao", None)
        executor = CreditumCodexReasoningExecutor(sdk_provider=provedor(), response_types=tipos())
        r = run(live_authorization=live_authorization_for_tests())
        with self.assertRaises(ExecutorRefusal) as ctx:
            executor.execute_live(r)
        self.assertEqual(ctx.exception.defect, "PROVIDER_CALL_FAILED")
        return executor, ctx.exception

    def _sem_vazamento(self, exc) -> None:
        # `str(exc)` e os `args` renderizados: o vazamento aparece nos dois.
        render = f"{str(exc)} {exc.args!r} {getattr(exc, 'detail', '')!r}"
        for veneno in (_SEGREDO_DO_SDK, _URL_DO_SDK, "key-pass", "token=hidden", "401"):
            self.assertNotIn(veneno, render, f"{veneno} atravessou a fronteira: {render}")

    def test_excecao_do_SDK_com_segredo_no_texto_nao_atravessa(self) -> None:
        _, refusal = self._estoura(ExplosaoDoSDK)
        self._sem_vazamento(refusal)

    def test_nome_de_classe_HOSTIL_cai_para_o_tipo_fixo(self) -> None:
        # `type(nome, (Exception,), {})` é Python legal: o nome é do atacante.
        hostil = type(f"Erro {_SEGREDO_DO_SDK}", (Exception,), {})
        _, refusal = self._estoura(hostil)
        self._sem_vazamento(refusal)
        self.assertIn("Exception", f"{refusal.args!r}")

    def test_nome_ASCII_comum_atravessa_provando_allowlist_real(self) -> None:
        # Controle POSITIVO. Sem ele, um sanitizador que devolvesse sempre o tipo
        # fixo passaria nos dois testes acima parecendo rigoroso.
        class FalhaSinteticaDoProvedor(Exception):
            pass

        _, refusal = self._estoura(FalhaSinteticaDoProvedor)
        self.assertIn("FalhaSinteticaDoProvedor", f"{refusal.args!r}")

    def test_a_causa_original_nao_fica_encadeada(self) -> None:
        _, refusal = self._estoura(ExplosaoDoSDK)
        self.assertIsNone(refusal.__cause__)
        # `from None` marca a supressão; `__context__` continua carregando o original,
        # e é `__suppress_context__` que decide se o traceback o imprime.
        self.assertTrue(refusal.__suppress_context__)
        render = "".join(
            traceback.format_exception(type(refusal), refusal, refusal.__traceback__)
        )
        for veneno in (_SEGREDO_DO_SDK, _URL_DO_SDK):
            self.assertNotIn(veneno, render, f"{veneno} apareceu no traceback")

    def test_a_evidencia_marca_a_falha_e_conta_a_chamada(self) -> None:
        executor, _ = self._estoura(ExplosaoDoSDK)
        self.assertEqual(executor.evidence.verdict, "PROVIDER_CALL_FAILED")
        self.assertEqual(executor.evidence.provider_calls, 1)
        self.assertFalse(executor.evidence.model_call_completed)

class PoliticaDeRespostaDeProducao(unittest.TestCase):
    def _provedor(self, policy: str = RESPONSE_POLICY_APPROVED) -> TrustedSdkProvider:
        return issue_trusted_sdk_provider_for_tests(
            version=EXPECTED_SDK_VERSION,
            client_class=ClienteFalso,
            responses_resource_class=RecursoFalso,
            create_descriptor=RecursoFalso.create,
            response_policy=policy,
        )

    def test_politica_nao_aprovada_recusa_antes_do_cliente(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=self._provedor("NAO_APROVADA"))
        with self.assertRaises(ExecutorRefusal) as ctx:
            executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, ExecutorDefect.LIVE_RESPONSE_POLICY_NOT_APPROVED)
        self.assertEqual(CONSTRUCOES, [])

    def test_tipos_reais_indisponiveis_recusam_antes_do_cliente(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(
            sdk_provider=self._provedor(), response_types=tipos()
        )
        with mock.patch(
            "creditum_hermes_reasoning.executor.resolve_production_governed_response_types",
            side_effect=CodexRefusal(CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE),
        ):
            with self.assertRaises(CodexRefusal) as ctx:
                executor.execute_live(run(live_authorization=live_authorization_for_tests()))
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE)
        self.assertEqual(CONSTRUCOES, [])
        self.assertEqual(chamadas(), [])

    def test_politica_aprovada_usa_resolvedor_selado(self) -> None:
        preparar(resposta_com(JSON_OK))
        executor = CreditumCodexReasoningExecutor(sdk_provider=self._provedor())
        with mock.patch(
            "creditum_hermes_reasoning.executor.resolve_production_governed_response_types",
            return_value=tipos(),
        ) as resolver:
            envelope = executor.execute_live(
                run(live_authorization=live_authorization_for_tests())
            )
        resolver.assert_called_once_with()
        self.assertEqual(envelope.verdict, VERDICT_MODEL_OUTPUT_UNVALIDATED)
        self.assertEqual(len(chamadas()), 1)
