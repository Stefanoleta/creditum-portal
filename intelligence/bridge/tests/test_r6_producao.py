"""
Fase 3.1d-b-r6 — resolvedor de runtime e emissor de SDK de PRODUÇÃO.

O que é FALSO aqui: os módulos `hermes_cli` e `openai`, montados com a forma EXATA
que a 3.1d-c4 observou em produção.
O que é REAL: o resolvedor, o emissor, a verificação de superfície e a sonda.

Zero rede. Zero SDK real. Zero chamada de provider. Segredo sempre sintético — nenhum
valor observado na c4 aparece aqui.
"""

from __future__ import annotations

import sys
import types
import unittest

from creditum_hermes_reasoning import executor as ex
from creditum_hermes_reasoning import runtime as rt
from creditum_hermes_reasoning.codex import CodexDefect, CodexRefusal, PrecallProbeComplete
from creditum_hermes_reasoning.executor import (
    RESPONSE_POLICY_NOT_APPROVED,
    RESPONSE_POLICY_SYNTHETIC,
    CreditumCodexReasoningExecutor,
    ExecutorRefusal,
    GovernedReasoningRun,
    TrustedSdkProvider,
    resolve_production_trusted_sdk_provider,
)
from creditum_hermes_reasoning.contract import build_system_contract
from creditum_hermes_reasoning.probe import load_fixture
from creditum_hermes_reasoning.runtime import RuntimeRefusal, resolve_approved_runtime_binding
from tests.support import (
    TEST_FAKE_SECRET,
    approved_binding_for_tests,
    live_authorization_for_tests,
)

# Os objetos de resposta falsos, com a forma DECLARADA, vivem na suíte da r3. Importar
# em vez de recriar: duas versões da mesma forma divergiriam.
from tests.test_r3_codex_executor import (  # noqa: E402
    extrai,
    CONSTRUCOES,
    JSON_OK,
    Bloco,
    ClienteFalso,
    Item,
    RecursoFalso,
    Resposta,
    preparar,
)
from creditum_hermes_reasoning.codex import (  # noqa: E402
    build_governed_request,
    governed_user_payload,
)

CONTRATO = build_system_contract()
FIXTURE, _ = load_fixture()

#: Valores SINTÉTICOS. Nenhum foi observado em produção — a c4 não imprimiu segredo,
#: e um `base_url` real também não entra em código.
BASE_URL_SINTETICA = "https://codex.sintetico.invalid/v1"


# ─── `hermes_cli` sintético, com a forma observada pela c4 ───────────────────


def hermes_falso(**over):
    modelo = over.pop("modelo", "gpt-5.6-luna")
    resolvido = {
        "provider": over.pop("provider", "openai-codex"),
        "api_mode": over.pop("api_mode", "codex_responses"),
        "base_url": over.pop("base_url", BASE_URL_SINTETICA),
        "api_key": over.pop("api_key", TEST_FAKE_SECRET),
        # A c4 observou que o retorno mais amplo PODE trazer isto. Não é autorização.
        "credential_pool": over.pop("credential_pool", {"pool": ["k1", "k2"]}),
    }
    resolvido.update(over.pop("extra", {}))

    prov = types.ModuleType("hermes_cli.runtime_provider")
    chamadas: list = []

    def resolve_runtime_provider(*, requested=None, explicit_api_key=None,
                                 explicit_base_url=None, target_model=None):
        chamadas.append(
            {"requested": requested, "explicit_api_key": explicit_api_key,
             "explicit_base_url": explicit_base_url, "target_model": target_model}
        )
        return dict(resolvido)

    prov.resolve_runtime_provider = resolve_runtime_provider  # type: ignore[attr-defined]

    cfg = types.ModuleType("hermes_cli.config")
    cfg.load_config = lambda: {"model": {"default": modelo}}  # type: ignore[attr-defined]
    return prov, cfg, chamadas


class HermesSintetico:
    """Instala/remove os módulos de produção falsos."""

    def __init__(self, **over):
        self.prov, self.cfg, self.chamadas = hermes_falso(**over)

    def __enter__(self):
        self._antes = {n: sys.modules.get(n) for n in
                       ("hermes_cli", "hermes_cli.runtime_provider", "hermes_cli.config")}
        sys.modules["hermes_cli"] = types.ModuleType("hermes_cli")
        sys.modules["hermes_cli.runtime_provider"] = self.prov
        sys.modules["hermes_cli.config"] = self.cfg
        return self

    def __exit__(self, *a):
        for n, antigo in self._antes.items():
            if antigo is None:
                sys.modules.pop(n, None)
            else:
                sys.modules[n] = antigo


class ResolvedorDeProducao(unittest.TestCase):
    def test_resolve_o_vinculo_com_a_identidade_observada(self) -> None:
        with HermesSintetico() as h:
            b = resolve_approved_runtime_binding()
        self.assertEqual(b.provider, "openai-codex")
        self.assertEqual(b.model, "gpt-5.6-luna")
        self.assertEqual(b.api_mode, "codex_responses")
        # 3.1d-D1: credencial, endpoint e o controle governado de zero-retry — e
        # NADA além disso. `APPROVED_MATERIAL_KEYS` segue fechado em dois: retry não
        # é credencial.
        self.assertEqual(
            set(b.to_client_kwargs()), {"api_key", "base_url", "max_retries"}
        )
        self.assertEqual(b.to_client_kwargs()["max_retries"], 0)
        # Invocação MÍNIMA: credencial e endpoint não vêm daqui.
        self.assertEqual(len(h.chamadas), 1)
        self.assertIsNone(h.chamadas[0]["explicit_api_key"])
        self.assertIsNone(h.chamadas[0]["explicit_base_url"])

    def test_o_AMBIENTE_nao_atravessa_para_o_resolvedor_do_hermes(self) -> None:
        # A versão anterior deste teste só afirmava `is None` — e passava porque a
        # variável não existia na máquina. Um fixture que depende do ambiente estar
        # vazio não mede nada: ele mede a máquina.
        import os

        venenos = {
            "OPENAI_API_KEY": "sk-do-ambiente-NUNCA",
            "OPENAI_BASE_URL": "https://ambiente.invalid",
            "CREDITUM_API_KEY": "sk-tambem-nao",
        }
        antes = {k: os.environ.get(k) for k in venenos}
        os.environ.update(venenos)
        try:
            with HermesSintetico() as h:
                b = resolve_approved_runtime_binding()
        finally:
            for k, v in antes.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        self.assertIsNone(h.chamadas[0]["explicit_api_key"])
        self.assertIsNone(h.chamadas[0]["explicit_base_url"])
        # E o vínculo ficou com o material do RESOLVEDOR, não com o do ambiente.
        self.assertEqual(b.to_client_kwargs()["api_key"], TEST_FAKE_SECRET)
        self.assertEqual(b.to_client_kwargs()["base_url"], BASE_URL_SINTETICA)

    def test_credential_pool_NAO_entra_no_vinculo(self) -> None:
        # A c4 viu o campo no retorno do Hermes. Ver não é autorizar.
        with HermesSintetico():
            b = resolve_approved_runtime_binding()
        self.assertNotIn("credential_pool", b.to_client_kwargs())
        self.assertNotIn("credential_pool", repr(b))

    def test_o_modelo_vem_da_CONFIG_nao_do_retorno_do_resolvedor(self) -> None:
        # A c4 observou que o resolvedor pode não devolver campo de modelo quando quem
        # chama já o selecionou. Ler de lá daria ausência — e ausência viraria fallback.
        with HermesSintetico(extra={"model": "modelo-do-resolvedor"}):
            b = resolve_approved_runtime_binding()
        self.assertEqual(b.model, "gpt-5.6-luna")

    def test_deriva_de_identidade_FALHA_FECHADA(self) -> None:
        for over, defeito in (
            ({"modelo": "gpt-5.5"}, "RUNTIME_IDENTITY_MISMATCH"),
            ({"provider": "openai"}, "RUNTIME_IDENTITY_MISMATCH"),
            ({"api_mode": "openai_chat"}, "RUNTIME_IDENTITY_MISMATCH"),
        ):
            with HermesSintetico(**over):
                with self.assertRaises(RuntimeRefusal, msg=repr(over)) as ctx:
                    resolve_approved_runtime_binding()
            self.assertEqual(ctx.exception.defect, defeito)

    def test_base_url_estruturalmente_invalida_e_recusada(self) -> None:
        for url in ("http://x.invalid", "https://u:p@x.invalid", "https://x.invalid?t=1",
                    "https://x.invalid#f", "https://", None, 42):
            with HermesSintetico(base_url=url):
                with self.assertRaises(RuntimeRefusal, msg=repr(url)[:30]) as ctx:
                    resolve_approved_runtime_binding()
            self.assertIn(ctx.exception.defect, ("BASE_URL_NOT_APPROVED", "RUNTIME_NOT_RESOLVED"))

    def test_api_key_ausente_ou_vazia_e_recusada(self) -> None:
        for chave in (None, "", 42, {"k": "v"}):
            with HermesSintetico(api_key=chave):
                with self.assertRaises(RuntimeRefusal, msg=repr(chave)[:20]) as ctx:
                    resolve_approved_runtime_binding()
            self.assertIn(
                ctx.exception.defect, ("SECRET_MATERIAL_INVALID", "RUNTIME_NOT_RESOLVED")
            )

    def test_config_sem_model_default_e_NAO_RESOLVIDO(self) -> None:
        for cfg in ({}, {"model": {}}, {"model": "gpt"}, {"model": {"default": ""}}):
            with HermesSintetico() as h:
                h.cfg.load_config = lambda c=cfg: c
                with self.assertRaises(RuntimeRefusal, msg=repr(cfg)) as ctx:
                    resolve_approved_runtime_binding()
            self.assertEqual(ctx.exception.defect, "RUNTIME_NOT_RESOLVED")

    def test_o_resolvedor_NAO_tem_parametro_de_chamador(self) -> None:
        import inspect

        self.assertEqual(list(inspect.signature(resolve_approved_runtime_binding).parameters), [])

    def test_sem_hermes_instalado_e_recusa_NOMEADA(self) -> None:
        with self.assertRaises(RuntimeRefusal) as ctx:
            resolve_approved_runtime_binding()
        self.assertEqual(ctx.exception.defect, "HERMES_RUNTIME_NOT_AVAILABLE")

    def test_o_pacote_NAO_importa_hermes_cli_no_import(self) -> None:
        self.assertNotIn("hermes_cli", sys.modules)


# ─── `openai` sintético com a forma exata da c4 ──────────────────────────────


def openai_falso(*, versao="2.24.0", cliente_qualname="OpenAI",
                 recurso_qualname="Responses", com_create=True,
                 cliente_module="openai",
                 recurso_module="openai.resources.responses.responses"):
    responses_mod = types.ModuleType("openai.resources.responses.responses")

    class Responses:
        def create(self, *, model, instructions, input, tools, stream, background, timeout):
            raise AssertionError("a sonda chamou o provider")

    Responses.__qualname__ = recurso_qualname
    Responses.__module__ = recurso_module
    if not com_create:
        del Responses.create
    setattr(responses_mod, recurso_qualname, Responses)

    openai_mod = types.ModuleType("openai")
    openai_mod.__version__ = versao  # type: ignore[attr-defined]

    class OpenAI:
        def __init__(self, *, api_key: str = "", base_url: str = "") -> None:
            raise AssertionError("a sonda construiu cliente")

    OpenAI.__qualname__ = cliente_qualname
    OpenAI.__module__ = cliente_module
    setattr(openai_mod, cliente_qualname, OpenAI)
    return openai_mod, responses_mod


class OpenAISintetico:
    def __init__(self, **over):
        self.openai_mod, self.responses_mod = openai_falso(**over)

    def __enter__(self):
        nomes = ("openai", "openai.resources", "openai.resources.responses",
                 "openai.resources.responses.responses")
        self._antes = {n: sys.modules.get(n) for n in nomes}
        sys.modules["openai"] = self.openai_mod
        sys.modules["openai.resources"] = types.ModuleType("openai.resources")
        sys.modules["openai.resources.responses"] = types.ModuleType("openai.resources.responses")
        sys.modules["openai.resources.responses.responses"] = self.responses_mod
        return self

    def __exit__(self, *a):
        for n, antigo in self._antes.items():
            if antigo is None:
                sys.modules.pop(n, None)
            else:
                sys.modules[n] = antigo


class EmissorDeProducao(unittest.TestCase):
    def test_sela_os_objetos_EXATOS_observados(self) -> None:
        with OpenAISintetico() as o:
            p = resolve_production_trusted_sdk_provider()
        self.assertIs(type(p), TrustedSdkProvider)
        self.assertIs(p.client_class, o.openai_mod.OpenAI)
        self.assertIs(p.responses_resource_class, o.responses_mod.Responses)
        self.assertIs(p.create_descriptor, o.responses_mod.Responses.create)
        self.assertEqual(p.version, "2.24.0")

    def test_producao_sela_a_politica_NAO_APROVADA(self) -> None:
        # A superfície está provada. A regra de leitura da RESPOSTA não está.
        with OpenAISintetico():
            self.assertEqual(
                resolve_production_trusted_sdk_provider().response_policy,
                RESPONSE_POLICY_NOT_APPROVED,
            )

    def test_versao_diferente_NAO_sela(self) -> None:
        for v in ("2.24.1", "2.25.0", "2.23.0", None):
            with OpenAISintetico(versao=v):
                with self.assertRaises(CodexRefusal, msg=repr(v)) as ctx:
                    resolve_production_trusted_sdk_provider()
            self.assertEqual(ctx.exception.defect, CodexDefect.SDK_SURFACE_INCOMPATIBLE)
            self.assertIn("versão", ctx.exception.detail)

    def test_classe_com_OUTRO_NOME_nao_sela(self) -> None:
        for over in ({"cliente_qualname": "AsyncOpenAI"}, {"recurso_qualname": "AsyncResponses"}):
            with OpenAISintetico(**over):
                with self.assertRaises(CodexRefusal, msg=repr(over)):
                    resolve_production_trusted_sdk_provider()

    def test_NOME_certo_e_MODULO_errado_nao_sela(self) -> None:
        # O caso que separa identidade de nome: o atributo existe, o qualname bate, e
        # `create` funciona. Só o módulo denuncia que é outro objeto. Conferir por nome
        # aprovaria isto — e foi o que uma mutação mostrou.
        for over, esperado in (
            ({"cliente_module": "impostor"}, "openai.OpenAI"),
            ({"recurso_module": "impostor"}, "openai.resources.responses.responses.Responses"),
        ):
            with OpenAISintetico(**over):
                with self.assertRaises(CodexRefusal, msg=repr(over)) as ctx:
                    resolve_production_trusted_sdk_provider()
            self.assertEqual(ctx.exception.defect, CodexDefect.SDK_SURFACE_INCOMPATIBLE)
            # E a recusa nomeia QUAL identidade faltou — senão o teste passaria por
            # qualquer motivo, inclusive pelo motivo errado.
            self.assertIn(esperado, ctx.exception.detail)

    def test_sem_create_nao_sela(self) -> None:
        with OpenAISintetico(com_create=False):
            with self.assertRaises(CodexRefusal):
                resolve_production_trusted_sdk_provider()

    def test_o_emissor_NAO_aceita_classe_de_chamador(self) -> None:
        import inspect

        self.assertEqual(
            list(inspect.signature(resolve_production_trusted_sdk_provider).parameters), []
        )

    def test_sem_openai_instalado_e_recusa_NOMEADA(self) -> None:
        with self.assertRaises(ExecutorRefusal) as ctx:
            resolve_production_trusted_sdk_provider()
        self.assertEqual(ctx.exception.defect, "SDK_RUNTIME_NOT_AVAILABLE")

    def test_o_pacote_NAO_importa_openai_no_import(self) -> None:
        self.assertNotIn("openai", sys.modules)


class SondaDeProducao(unittest.TestCase):
    """A sonda com runtime e SDK de produção presentes — e ainda assim zero rede."""

    def sonda(self):
        with HermesSintetico(), OpenAISintetico():
            binding = resolve_approved_runtime_binding()
            provedor = resolve_production_trusted_sdk_provider()
            executor = CreditumCodexReasoningExecutor(sdk_provider=provedor)
            run = GovernedReasoningRun(
                contract=CONTRATO, binding=binding, read_model=dict(FIXTURE["read_model"])
            )
            with self.assertRaises(PrecallProbeComplete):
                executor.precall_probe(run)
            return executor, binding, provedor

    def test_a_sonda_completa_SEM_construir_cliente(self) -> None:
        executor, _, _ = self.sonda()
        ev = executor.evidence
        self.assertEqual(ev.verdict, "PRECALL_PROBE_COMPLETE")
        self.assertEqual((ev.client_constructions, ev.provider_calls), (0, 0))
        self.assertFalse(ev.model_call_completed)
        self.assertEqual(ev.tool_count, 0)

    def test_o_SEGREDO_nao_aparece_em_lugar_nenhum(self) -> None:
        executor, binding, provedor = self.sonda()
        for s in (repr(binding), str(binding), repr(provedor), repr(executor.evidence),
                  executor.evidence.request_hash, executor.evidence.user_payload_hash,
                  binding.base_url_fingerprint()):
            self.assertNotIn(TEST_FAKE_SECRET, s)
            self.assertNotIn(BASE_URL_SINTETICA, s)

    def test_o_VIVO_recusa_por_POLITICA_mesmo_com_tudo_pronto(self) -> None:
        # Vínculo de produção + provedor de produção selado + capacidade válida.
        # Falta a única coisa que a c4 não aprovou: como ler a resposta.
        with HermesSintetico(), OpenAISintetico():
            binding = resolve_approved_runtime_binding()
            provedor = resolve_production_trusted_sdk_provider()
            executor = CreditumCodexReasoningExecutor(sdk_provider=provedor)
            run = GovernedReasoningRun(
                contract=CONTRATO, binding=binding, read_model=dict(FIXTURE["read_model"]),
                live_authorization=live_authorization_for_tests(),
            )
            with self.assertRaises(ExecutorRefusal) as ctx:
                executor.execute_live(run)
        self.assertEqual(ctx.exception.defect, "LIVE_RESPONSE_POLICY_NOT_APPROVED")
        self.assertIsNone(executor.evidence, "contabilizou execução antes de recusar")

    def test_output_text_NAO_e_fronteira_aprovada(self) -> None:
        # `Response.output_text` AGREGA os blocos de todos os itens `message`. Aceitá-lo
        # como resultado final seria concatenar respostas e chamar o resultado de uma —
        # e a 3.1d-c5 MEDIU esse comportamento, então a proibição deixou de ser
        # precaução.
        #
        # 3.1d-c6: por AST, e não por substring. `types.output_text` é acesso LEGÍTIMO
        # ao carrier selado — é a NOSSA classe aprovada. O que não pode existir em
        # nenhum módulo de produção é `output_text` lido de qualquer outra coisa.
        # Um scan textual reprovaria o código correto, que é como este teste começou.
        import ast
        import pathlib

        raiz = pathlib.Path(ex.__file__).parent
        indevidos = []
        for py in sorted(raiz.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            for n in ast.walk(ast.parse(py.read_text(encoding="utf-8"))):
                if (
                    isinstance(n, ast.Attribute)
                    and n.attr == "output_text"
                    and not (isinstance(n.value, ast.Name) and n.value.id == "types")
                ):
                    indevidos.append(f"{py.name}:{n.lineno}")
        self.assertEqual([], indevidos, f"output_text lido fora do carrier selado: {indevidos}")


class CliDeProducao(unittest.TestCase):
    """A CLI com runtime e SDK presentes: relatório completo, e zero rede."""

    def cli(self):
        import contextlib
        import io as _io
        import json

        from creditum_hermes_reasoning.__main__ import main

        out, err = _io.StringIO(), _io.StringIO()
        with HermesSintetico(), OpenAISintetico():
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                codigo = main(["--precall-probe"])
        return codigo, json.loads(out.getvalue()), out.getvalue() + err.getvalue()

    def test_a_sonda_de_producao_COMPLETA(self) -> None:
        codigo, r, _ = self.cli()
        self.assertEqual(codigo, 0)
        self.assertEqual(r["verdict"], "PRECALL_PROBE_COMPLETE")
        self.assertEqual((r["provider"], r["model"], r["api_mode"]),
                         ("openai-codex", "gpt-5.6-luna", "codex_responses"))
        self.assertEqual(r["sdk_version"], "2.24.0")
        self.assertEqual(r["sdk_client_class"], "openai.OpenAI")
        self.assertEqual(r["sdk_responses_class"], "openai.resources.responses.responses.Responses")
        self.assertTrue(r["sdk_constructor_surface_verified"])
        self.assertTrue(r["sdk_create_surface_verified"])
        self.assertEqual(r["live_response_policy"], RESPONSE_POLICY_NOT_APPROVED)
        self.assertEqual((r["client_constructions"], r["provider_call_count"]), (0, 0))
        self.assertFalse(r["sdk_call_attempted"])
        self.assertFalse(r["model_call_completed"])
        self.assertFalse(r["aiagent_used"])
        self.assertEqual(r["tool_count"], 0)

    def test_o_relatorio_prova_a_credencial_SEM_publicá_la(self) -> None:
        codigo, r, bruto = self.cli()
        self.assertTrue(r["secret_material_present"])
        self.assertEqual(r["secret_material_type"], "str")
        self.assertTrue(r["secret_material_nonempty"])
        self.assertFalse(r["secret_material_exposed"])
        # E nada do valor, nem do endpoint, em stdout ou stderr.
        for veneno in (TEST_FAKE_SECRET, BASE_URL_SINTETICA, "codex.sintetico"):
            self.assertNotIn(veneno, bruto)
        self.assertNotIn("base_url", {k for k, v in r.items() if isinstance(v, str) and "://" in v})


# ═══════════════════════════════════════════════════════════════════════════════
# r6-r1 — a fronteira selada contra exceção de terceiro
#
# Codex HIGH: `load_config()` e `resolve_runtime_provider()` resolvem credencial. Uma
# exceção deles pode carregar `api_key` ou `base_url` na MENSAGEM, e a mensagem ia
# parar no traceback que o Python imprime em stderr.
# ═══════════════════════════════════════════════════════════════════════════════

#: Marcadores SINTÉTICOS, escolhidos para serem inconfundíveis numa varredura.
SEGREDO_NA_EXCECAO = "test-secret-never-log"
URL_NA_EXCECAO = "https://secret-user:secret-pass@example.invalid/private?token=hidden"


class ExplosaoComSegredo(Exception):
    """Exceção de terceiro que carrega segredo em `str`, `repr` E `args`."""

    def __init__(self) -> None:
        super().__init__(f"falha ao resolver credencial {SEGREDO_NA_EXCECAO} em {URL_NA_EXCECAO}")

    def __repr__(self) -> str:
        return f"ExplosaoComSegredo({SEGREDO_NA_EXCECAO!r}, {URL_NA_EXCECAO!r})"


class ExplosaoMuda(Exception):
    """`str` inofensivo, segredo escondido só em `args` — para provar que args não sai."""

    def __init__(self) -> None:
        super().__init__("erro interno", SEGREDO_NA_EXCECAO, URL_NA_EXCECAO)

    def __str__(self) -> str:
        return "erro interno"


class ExplosaoEncadeada(Exception):
    """Levantada A PARTIR de outra que carrega o segredo — o `__cause__` também vaza."""


class FronteiraSelada(unittest.TestCase):
    def cli_com_falha(self, *, onde: str, excecao):
        """Roda a CLI DE VERDADE com o Hermes sintético explodindo em `onde`."""
        import contextlib
        import io as _io

        from creditum_hermes_reasoning.__main__ import main

        def explode(*a, **k):
            if excecao is ExplosaoEncadeada:
                try:
                    raise ExplosaoComSegredo()
                except ExplosaoComSegredo as causa:
                    raise ExplosaoEncadeada("encadeada") from causa
            raise excecao()

        out, err = _io.StringIO(), _io.StringIO()
        with HermesSintetico() as h, OpenAISintetico():
            if onde == "config":
                h.cfg.load_config = explode
            else:
                h.prov.resolve_runtime_provider = explode
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                try:
                    codigo = main(["--precall-probe"])
                except BaseException:  # noqa: BLE001
                    # Traceback escapando JÁ é a falha; capturar aqui para poder
                    # inspecioná-lo em vez de derrubar a suíte sem evidência.
                    import traceback

                    codigo = -1
                    err.write(traceback.format_exc())
        return codigo, out.getvalue(), err.getvalue()

    def assert_sem_vazamento(self, onde, excecao):
        codigo, saida, erro = self.cli_com_falha(onde=onde, excecao=excecao)
        tudo = saida + erro
        for veneno in (SEGREDO_NA_EXCECAO, URL_NA_EXCECAO, "secret-pass", "token=hidden",
                       "secret-user", TEST_FAKE_SECRET, BASE_URL_SINTETICA):
            self.assertNotIn(veneno, tudo, f"{onde}/{excecao.__name__} vazou {veneno!r}")
        self.assertNotEqual(codigo, -1, "traceback escapou da CLI")
        self.assertNotEqual(codigo, 0)
        # E a recusa é NOSSA, nomeada.
        import json

        r = json.loads(saida)
        self.assertIn(
            r["verdict"],
            ("HERMES_CONFIG_LOAD_FAILED", "HERMES_RUNTIME_RESOLUTION_FAILED"),
        )
        self.assertEqual(r["provider_call_count"], 0)
        self.assertFalse(r["sdk_call_attempted"])
        return r

    def test_load_config_explodindo_com_segredo_NAO_vaza(self) -> None:
        r = self.assert_sem_vazamento("config", ExplosaoComSegredo)
        self.assertEqual(r["verdict"], "HERMES_CONFIG_LOAD_FAILED")

    def test_resolve_runtime_provider_explodindo_com_segredo_NAO_vaza(self) -> None:
        r = self.assert_sem_vazamento("resolver", ExplosaoComSegredo)
        self.assertEqual(r["verdict"], "HERMES_RUNTIME_RESOLUTION_FAILED")

    def test_segredo_escondido_em_ARGS_nao_vaza(self) -> None:
        # `str` inofensivo. Se o código serializasse `args`, o segredo sairia.
        for onde in ("config", "resolver"):
            self.assert_sem_vazamento(onde, ExplosaoMuda)

    def test_exceção_ENCADEADA_nao_vaza_a_causa(self) -> None:
        # Sem `from None`, o traceback renderiza a causa — e a causa carrega o segredo.
        for onde in ("config", "resolver"):
            self.assert_sem_vazamento(onde, ExplosaoEncadeada)

    def test_a_recusa_carrega_o_TIPO_e_nada_mais(self) -> None:
        with HermesSintetico() as h, OpenAISintetico():
            h.cfg.load_config = lambda: (_ for _ in ()).throw(ExplosaoComSegredo())
            with self.assertRaises(RuntimeRefusal) as ctx:
                resolve_approved_runtime_binding()
        e = ctx.exception
        self.assertEqual(e.defect, "HERMES_CONFIG_LOAD_FAILED")
        self.assertEqual(e.detail, "ExplosaoComSegredo")
        for render in (str(e), repr(e), e.detail):
            self.assertNotIn(SEGREDO_NA_EXCECAO, render)
            self.assertNotIn(URL_NA_EXCECAO, render)
        # E a recusa não guarda referência à exceção original.
        self.assertIsNone(e.__cause__)

    def test_nome_de_TIPO_hostil_vira_fixo(self) -> None:
        # Nome de classe é escolhido por quem escreve a classe. Improvável não é
        # impossível, e fechar custa uma linha.
        hostil = type(f"Erro {SEGREDO_NA_EXCECAO}", (Exception,), {})
        with HermesSintetico() as h, OpenAISintetico():
            h.cfg.load_config = lambda: (_ for _ in ()).throw(hostil())
            with self.assertRaises(RuntimeRefusal) as ctx:
                resolve_approved_runtime_binding()
        self.assertEqual(ctx.exception.detail, "Exception")
        self.assertNotIn(SEGREDO_NA_EXCECAO, str(ctx.exception))

    def test_falha_do_resolvedor_NAO_cai_para_o_ambiente(self) -> None:
        # O ataque: resolvedor explode E `OPENAI_API_KEY` existe. Recusa, nunca resgate.
        import os

        antes = os.environ.get("OPENAI_API_KEY")
        os.environ["OPENAI_API_KEY"] = "sk-do-ambiente-NUNCA"
        try:
            codigo, saida, erro = self.cli_com_falha(onde="resolver", excecao=ExplosaoComSegredo)
        finally:
            if antes is None:
                os.environ.pop("OPENAI_API_KEY", None)
            else:
                os.environ["OPENAI_API_KEY"] = antes
        self.assertNotEqual(codigo, 0)
        self.assertNotIn("sk-do-ambiente-NUNCA", saida + erro)

    def test_versao_do_resolvedor_nao_executa___str___de_objeto(self) -> None:
        # `str(objeto)` rodaria o `__str__` DELE, e o resultado viraria campo do
        # vínculo — que aparece em repr e em relatório.
        class VersaoHostil:
            def __str__(self) -> str:
                return SEGREDO_NA_EXCECAO

        with HermesSintetico(extra={"hermes_version": VersaoHostil(),
                                    "acp_version": VersaoHostil()}):
            b = resolve_approved_runtime_binding()
        self.assertEqual(b.hermes_version, "0.20.4")
        self.assertNotIn(SEGREDO_NA_EXCECAO, repr(b))


class FronteiraSeladaMedidaSozinha(unittest.TestCase):
    """
    Cada camada medida SEM a outra.

    A primeira rodada de mutações mostrou que a fronteira selada e o catch-all da CLI
    se protegiam mutuamente: remover uma sobrevivia porque a outra sanitizava. Duas
    defesas que só falham juntas são, na prática, uma defesa não medida.
    """

    def refusa_direto(self, onde: str):
        """Chama o resolvedor DIRETO, sem CLI — a camada de baixo, sozinha."""
        with HermesSintetico() as h, OpenAISintetico():
            explode = lambda *a, **k: (_ for _ in ()).throw(ExplosaoComSegredo())
            if onde == "config":
                h.cfg.load_config = explode
            else:
                h.prov.resolve_runtime_provider = explode
            with self.assertRaises(RuntimeRefusal) as ctx:
                resolve_approved_runtime_binding()
        return ctx.exception

    def test_a_fronteira_do_RESOLVEDOR_sozinha(self) -> None:
        # Faltava este: só o caminho de config era medido sem a CLI.
        e = self.refusa_direto("resolver")
        self.assertEqual(e.defect, "HERMES_RUNTIME_RESOLUTION_FAILED")
        self.assertEqual(e.detail, "ExplosaoComSegredo")
        for render in (str(e), repr(e)):
            self.assertNotIn(SEGREDO_NA_EXCECAO, render)
            self.assertNotIn(URL_NA_EXCECAO, render)

    def test_o_ENCADEAMENTO_e_suprimido_nos_dois_caminhos(self) -> None:
        # `__cause__` é None com ou sem `from None` — quem carrega a original é
        # `__context__`. Medir o atributo errado dava um teste que sempre passava.
        import traceback

        for onde in ("config", "resolver"):
            e = self.refusa_direto(onde)
            self.assertTrue(e.__suppress_context__, onde)
            rendido = "".join(traceback.format_exception(type(e), e, e.__traceback__))
            self.assertNotIn(SEGREDO_NA_EXCECAO, rendido, onde)
            self.assertNotIn(URL_NA_EXCECAO, rendido, onde)

    def test_o_catch_all_da_CLI_sozinho(self) -> None:
        # A camada de cima, medida sem a de baixo: o resolvedor inteiro é substituído
        # por algo que estoura cru. Nenhum traceback pode sair.
        import contextlib
        import io as _io
        import json

        from creditum_hermes_reasoning import __main__ as cli

        original = cli.resolve_approved_runtime_binding
        cli.resolve_approved_runtime_binding = lambda: (_ for _ in ()).throw(
            ExplosaoComSegredo()
        )
        out, err = _io.StringIO(), _io.StringIO()
        try:
            with OpenAISintetico():
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    codigo = cli.main(["--precall-probe"])
        finally:
            cli.resolve_approved_runtime_binding = original
        tudo = out.getvalue() + err.getvalue()
        self.assertNotEqual(codigo, 0)
        for veneno in (SEGREDO_NA_EXCECAO, URL_NA_EXCECAO, "secret-pass", "token=hidden"):
            self.assertNotIn(veneno, tudo)
        self.assertEqual(json.loads(out.getvalue())["verdict"], "HERMES_RUNTIME_RESOLUTION_FAILED")


class RecusasNaoDespejamValor(unittest.TestCase):
    """Toda recusa nomeia o CAMPO. Nenhuma imprime o valor."""

    def test_resolvedor_devolvendo_NAO_DICT_nao_e_despejado(self) -> None:
        class RetornoHostil:
            def __repr__(self) -> str:
                return f"<runtime {SEGREDO_NA_EXCECAO} {URL_NA_EXCECAO}>"

        with HermesSintetico() as h, OpenAISintetico():
            h.prov.resolve_runtime_provider = lambda **k: RetornoHostil()
            with self.assertRaises(RuntimeRefusal) as ctx:
                resolve_approved_runtime_binding()
        e = ctx.exception
        self.assertEqual(e.defect, "RUNTIME_NOT_RESOLVED")
        for render in (str(e), repr(e), e.detail):
            self.assertNotIn(SEGREDO_NA_EXCECAO, render)
            self.assertNotIn(URL_NA_EXCECAO, render)

    def test_base_url_invalida_nao_aparece_na_recusa(self) -> None:
        # A recusa diz QUAL PARTE violou a política — nunca a URL. Se o token está na
        # query, imprimir a URL para explicar o erro publicaria o token.
        ruins = (
            "https://u:p@host.invalid/x?token=SEGREDO-QS#frag",
            "http://host.invalid",
            "https://",
        )
        for url in ruins:
            with HermesSintetico(base_url=url), OpenAISintetico():
                with self.assertRaises(RuntimeRefusal, msg=url) as ctx:
                    resolve_approved_runtime_binding()
            e = ctx.exception
            for render in (str(e), repr(e), e.detail):
                self.assertNotIn(url, render, url)
                self.assertNotIn("SEGREDO-QS", render, url)
                self.assertNotIn("host.invalid", render, url)

    def test_api_key_de_tipo_errado_nao_aparece_na_recusa(self) -> None:
        for chave in ({"k": SEGREDO_NA_EXCECAO}, [SEGREDO_NA_EXCECAO], 42):
            with HermesSintetico(api_key=chave), OpenAISintetico():
                with self.assertRaises(RuntimeRefusal, msg=repr(chave)[:20]) as ctx:
                    resolve_approved_runtime_binding()
            e = ctx.exception
            for render in (str(e), repr(e), e.detail):
                self.assertNotIn(SEGREDO_NA_EXCECAO, render)


# ═══════════════════════════════════════════════════════════════════════════════
# r6-r2 — o NOME DA CLASSE também é texto de terceiro
#
# Codex HIGH: o catch-all da CLI emitia `type(causa).__name__` cru, e construir uma
# classe com nome arbitrário é Python legal. Eu tinha escrito o sanitizador e não o
# usei justamente onde a defesa era independente.
# ═══════════════════════════════════════════════════════════════════════════════

#: Nomes de classe hostis. Cada um ataca uma parte da política de forma.
NOMES_HOSTIS = (
    f"Bad {SEGREDO_NA_EXCECAO}",          # espaço + segredo
    f"Bad\t{SEGREDO_NA_EXCECAO}",         # tabulação
    f"Bad\n{SEGREDO_NA_EXCECAO}",         # quebra de linha
    f"Bad.{SEGREDO_NA_EXCECAO}",          # ponto
    f"Bad/{SEGREDO_NA_EXCECAO}",          # barra
    f"Bad<{SEGREDO_NA_EXCECAO}>",         # sinais
    f"\x1b[31m{SEGREDO_NA_EXCECAO}\x1b[0m",  # sequência ANSI — stderr é terminal
    f"Erro{SEGREDO_NA_EXCECAO.replace('-', '_')}" + "x" * 64,  # >64, forma válida
    "Соdеx",                              # homóglifos cirílicos: isidentifier() aceitaria
)


def excecao_com_nome(nome: str) -> BaseException:
    return type(nome, (Exception,), {})()


class NomeDeTipoHostil(unittest.TestCase):
    def cli_com_thrower(self, *, alvo: str, nome: str):
        """
        Roda a CLI DE VERDADE com uma camada substituída por algo que estoura cru.

        `alvo="runtime"` derruba o resolvedor inteiro — a fronteira selada do
        resolvedor não participa, e só o catch-all da CLI protege.
        `alvo="precall"` faz a sonda estourar — o outro catch-all.
        """
        import contextlib
        import io as _io

        from creditum_hermes_reasoning import __main__ as cli

        original_res = cli.resolve_approved_runtime_binding
        original_exec = cli.CreditumCodexReasoningExecutor

        def estoura(*a, **k):
            raise excecao_com_nome(nome)

        class ExecutorQueEstoura:
            def __init__(self, **k) -> None:
                self.evidence = None

            def precall_probe(self, run):
                raise excecao_com_nome(nome)

        out, err = _io.StringIO(), _io.StringIO()
        try:
            if alvo == "runtime":
                cli.resolve_approved_runtime_binding = estoura
            else:
                cli.CreditumCodexReasoningExecutor = ExecutorQueEstoura
            with HermesSintetico(), OpenAISintetico():
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    try:
                        codigo = cli.main(["--precall-probe"])
                    except BaseException:  # noqa: BLE001
                        import traceback

                        codigo = -1
                        err.write(traceback.format_exc())
        finally:
            cli.resolve_approved_runtime_binding = original_res
            cli.CreditumCodexReasoningExecutor = original_exec
        return codigo, out.getvalue(), err.getvalue()

    def assert_nome_nao_sai(self, alvo: str, nome: str):
        codigo, saida, erro = self.cli_com_thrower(alvo=alvo, nome=nome)
        tudo = saida + erro
        self.assertNotEqual(codigo, -1, f"{alvo}: traceback escapou")
        self.assertNotEqual(codigo, 0, alvo)
        self.assertNotIn(nome, tudo, f"{alvo}: nome hostil cru saiu")
        for veneno in (SEGREDO_NA_EXCECAO, "\x1b[", "Соdеx"):
            if veneno in nome:
                self.assertNotIn(veneno, tudo, f"{alvo}: {veneno!r} saiu")
        # O que sai é o fixo.
        self.assertIn("Exception", tudo, alvo)
        import json

        r = json.loads(saida)
        self.assertEqual(r["provider_call_count"], 0)
        self.assertFalse(r["sdk_call_attempted"])
        return r

    def test_catch_all_do_RUNTIME_com_nomes_hostis(self) -> None:
        # O ataque exato do regate: resolvedor inteiro substituído, só a CLI protege.
        for nome in NOMES_HOSTIS:
            self.assert_nome_nao_sai("runtime", nome)

    def test_catch_all_do_PRECALL_com_nomes_hostis(self) -> None:
        # O sítio análogo que o Codex mandou cobrir também.
        for nome in NOMES_HOSTIS:
            self.assert_nome_nao_sai("precall", nome)

    def test_nome_BEM_FORMADO_ainda_atravessa(self) -> None:
        # Sem isto, um sanitizador que devolve sempre "Exception" passaria nos testes
        # acima sem nunca ter medido nada.
        for alvo in ("runtime", "precall"):
            _, saida, erro = self.cli_com_thrower(alvo=alvo, nome="SyntheticResolverFailure")
            self.assertIn("SyntheticResolverFailure", saida + erro, alvo)

    def test_a_politica_de_forma_e_ASCII_e_deterministica(self) -> None:
        from creditum_hermes_reasoning.runtime import TIPO_DESCONHECIDO, safe_exception_type

        for nome in NOMES_HOSTIS:
            self.assertEqual(safe_exception_type(excecao_com_nome(nome)), TIPO_DESCONHECIDO, nome)
        for bom in ("Erro", "_Erro", "E1", "A" * 64):
            self.assertEqual(safe_exception_type(excecao_com_nome(bom)), bom)
        self.assertEqual(safe_exception_type(excecao_com_nome("A" * 65)), TIPO_DESCONHECIDO)

    def test_o_sanitizador_e_UM_so(self) -> None:
        # Dois sanitizadores teriam duas noções de "seguro", e divergiriam no dia em
        # que um fosse endurecido.
        import pathlib

        cli = pathlib.Path(__file__).parent.parent / "creditum_hermes_reasoning" / "__main__.py"
        fonte = cli.read_text(encoding="utf-8")
        executavel = "\n".join(
            l for l in fonte.splitlines() if not l.lstrip().startswith("#")
        )
        self.assertNotIn("__name__}", executavel)
        self.assertNotIn("isidentifier", executavel)
        self.assertIn("safe_exception_type", executavel)


# ═══════════════════════════════════════════════════════════════════════════════
# r6-r3 — TODA superfície de texto observável, não só a apontada
#
# Quarto achado da mesma família. Corrigir a linha do relatório foi o que me trouxe
# até aqui três vezes; desta vez a varredura veio antes da correção e achou onze
# sítios — a maioria fora da linha apontada.
# ═══════════════════════════════════════════════════════════════════════════════


class FronteiraDeImportDoSDK(unittest.TestCase):
    """O sítio do Codex: falha de import do `openai`."""

    def issuer_direto(self, nome: str):
        """Sem CLI. Só o emissor — a camada de baixo, sozinha."""
        import importlib

        original = importlib.import_module

        def explode(mod, *a, **k):
            if mod.startswith("openai"):
                raise excecao_com_nome(nome)
            return original(mod, *a, **k)

        importlib.import_module = explode
        try:
            with self.assertRaises(ExecutorRefusal) as ctx:
                resolve_production_trusted_sdk_provider()
        finally:
            importlib.import_module = original
        return ctx.exception

    def cli_com_import_quebrado(self, nome: str):
        import contextlib
        import importlib
        import io as _io

        from creditum_hermes_reasoning.__main__ import main

        original = importlib.import_module

        def explode(mod, *a, **k):
            if mod.startswith("openai"):
                raise excecao_com_nome(nome)
            return original(mod, *a, **k)

        out, err = _io.StringIO(), _io.StringIO()
        importlib.import_module = explode
        try:
            with HermesSintetico():
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    try:
                        codigo = main(["--precall-probe"])
                    except BaseException:  # noqa: BLE001
                        import traceback

                        codigo = -1
                        err.write(traceback.format_exc())
        finally:
            importlib.import_module = original
        return codigo, out.getvalue(), err.getvalue()

    def test_issuer_SOZINHO_nao_deixa_o_nome_hostil_passar(self) -> None:
        for nome in NOMES_HOSTIS:
            e = self.issuer_direto(nome)
            self.assertEqual(e.defect, "SDK_RUNTIME_NOT_AVAILABLE")
            for render in (str(e), repr(e), e.detail):
                self.assertNotIn(nome, render, nome)
                self.assertNotIn(SEGREDO_NA_EXCECAO, render)
                self.assertNotIn("\x1b[", render)
            self.assertEqual(e.detail, "openai:Exception")
            self.assertIsNone(e.__cause__)

    def test_nome_BEM_FORMADO_atravessa_no_issuer(self) -> None:
        # Prova que é allowlist, e não fallback cego.
        self.assertEqual(
            self.issuer_direto("SyntheticResolverFailure").detail,
            "openai:SyntheticResolverFailure",
        )

    def test_CLI_com_import_do_SDK_quebrado(self) -> None:
        import json

        for nome in NOMES_HOSTIS:
            codigo, saida, erro = self.cli_com_import_quebrado(nome)
            tudo = saida + erro
            self.assertNotEqual(codigo, -1, nome)
            self.assertNotEqual(codigo, 0, nome)
            self.assertNotIn(nome, tudo, nome)
            self.assertNotIn(SEGREDO_NA_EXCECAO, tudo)
            self.assertNotIn("\x1b[", tudo)
            r = json.loads(saida)
            self.assertEqual(r["verdict"], "SDK_RUNTIME_NOT_AVAILABLE")
            self.assertEqual(r["provider_call_count"], 0)


class NenhumValOrExternoVIRA_TEXTO(unittest.TestCase):
    """
    Os outros dez sítios: valores externos que viravam texto por `repr`, `!r` ou
    `str`. `repr` de objeto de terceiro EXECUTA o `__repr__` dele — o objeto escolhe
    o que aparece no nosso stderr.
    """

    class Venenoso:
        def __repr__(self) -> str:
            return f"<{SEGREDO_NA_EXCECAO} {URL_NA_EXCECAO}>"

        def __str__(self) -> str:
            return f"<{SEGREDO_NA_EXCECAO}>"

    def limpo(self, e, rotulo: str):
        for render in (str(e), repr(e), getattr(e, "detail", "")):
            self.assertNotIn(SEGREDO_NA_EXCECAO, render, rotulo)
            self.assertNotIn(URL_NA_EXCECAO, render, rotulo)

    def test_status_de_resposta_venenoso(self) -> None:
        with self.assertRaises(CodexRefusal) as ctx:
            extrai(Resposta(status=self.Venenoso()))
        self.limpo(ctx.exception, "status")

    def test_tipo_de_item_e_de_bloco_venenosos(self) -> None:
        for resposta in (
            Resposta(itens=[Item([Bloco(JSON_OK)], tipo=self.Venenoso())]),
            Resposta(itens=[Item([Bloco(JSON_OK, tipo=self.Venenoso())])]),
        ):
            with self.assertRaises(CodexRefusal) as ctx:
                extrai(resposta)
            self.limpo(ctx.exception, "item/bloco")

    def test_texto_final_de_tipo_venenoso(self) -> None:
        with self.assertRaises(CodexRefusal) as ctx:
            extrai(Resposta(itens=[Item([Bloco(self.Venenoso())])]))
        self.limpo(ctx.exception, "texto")

    def test_versao_do_SDK_venenosa(self) -> None:
        from creditum_hermes_reasoning.codex import verify_sdk_surface

        with self.assertRaises(CodexRefusal) as ctx:
            verify_sdk_surface(
                version=self.Venenoso(), client_class=ClienteFalso,
                create_callable=RecursoFalso.create,
            )
        self.limpo(ctx.exception, "versão")

    def test_ferramentas_venenosas_no_portao(self) -> None:
        from creditum_hermes_reasoning.codex import enforce_final_request

        r = dict(
            build_governed_request(
                binding=approved_binding_for_tests(), contract=CONTRATO,
                user_payload=governed_user_payload(dict(FIXTURE["read_model"])),
            )
        )
        r["tools"] = self.Venenoso()
        with self.assertRaises(CodexRefusal) as ctx:
            enforce_final_request(
                r, binding=approved_binding_for_tests(), contract=CONTRATO,
                expected_user_payload=governed_user_payload(dict(FIXTURE["read_model"])),
            )
        self.limpo(ctx.exception, "tools")

    def test_chave_de_material_venenosa(self) -> None:
        class ChaveVenenosa(str):
            def __repr__(self) -> str:
                return f"<{SEGREDO_NA_EXCECAO}>"

        with self.assertRaises(RuntimeRefusal) as ctx:
            approved_binding_for_tests(
                execution_material={ChaveVenenosa("inesperada"): "x", "base_url": "https://a.invalid"}
            )
        self.limpo(ctx.exception, "chave")

    def test_material_de_tipo_venenoso(self) -> None:
        with self.assertRaises(RuntimeRefusal) as ctx:
            approved_binding_for_tests(execution_material=self.Venenoso())
        self.limpo(ctx.exception, "material")

    def test_read_model_de_tipo_venenoso(self) -> None:
        executor = CreditumCodexReasoningExecutor(sdk_provider=None)
        with self.assertRaises(ExecutorRefusal) as ctx:
            executor.precall_probe(
                GovernedReasoningRun(
                    contract=CONTRATO, binding=approved_binding_for_tests(),
                    read_model=self.Venenoso(),
                )
            )
        self.limpo(ctx.exception, "read_model")

    def test_bloco_ACP_de_tipo_venenoso(self) -> None:
        from creditum_hermes_reasoning.session import SessionRefusal, single_text_prompt

        with self.assertRaises(SessionRefusal) as ctx:
            single_text_prompt([{"type": self.Venenoso()}])
        self.limpo(ctx.exception, "bloco ACP")

    def test_o_relatorio_usa_a_CONSTANTE_e_nao_o_objeto_do_SDK(self) -> None:
        # `str(provedor.version)` executaria o `__str__` do SDK para dizer o que já
        # sabemos: a versão foi provada igual à nossa constante.
        import pathlib

        cli = pathlib.Path(__file__).parent.parent / "creditum_hermes_reasoning" / "__main__.py"
        fonte = cli.read_text(encoding="utf-8")
        self.assertNotIn("str(provedor.version)", fonte)
        self.assertIn("sdk_version=PRODUCTION_SDK_VERSION", fonte)


class NomeDeTipoDO_VALOR_tambem(unittest.TestCase):
    """
    O veneno anterior tinha nome de classe ASCII seguro — então os testes exercitavam
    o `repr` e NUNCA o nome do tipo. Quatro mutações sobreviveram por isso.

    Aqui o veneno está no NOME da classe do valor, que é o que `safe_type_name` lê.
    """

    def venenoso_nomeado(self, nome: str = f"Bad {SEGREDO_NA_EXCECAO}"):
        return type(nome, (), {})()

    def limpo(self, e, rotulo: str):
        for render in (str(e), repr(e), getattr(e, "detail", "")):
            self.assertNotIn(SEGREDO_NA_EXCECAO, render, rotulo)
            self.assertNotIn("\x1b[", render, rotulo)

    def test_read_model_com_NOME_DE_CLASSE_hostil(self) -> None:
        executor = CreditumCodexReasoningExecutor(sdk_provider=None)
        for nome in (f"Bad {SEGREDO_NA_EXCECAO}", "Соdеx", f"\x1b[31m{SEGREDO_NA_EXCECAO}"):
            with self.assertRaises(ExecutorRefusal, msg=nome) as ctx:
                executor.precall_probe(
                    GovernedReasoningRun(
                        contract=CONTRATO, binding=approved_binding_for_tests(),
                        read_model=self.venenoso_nomeado(nome),
                    )
                )
            self.limpo(ctx.exception, nome)
            self.assertEqual(ctx.exception.detail, "Exception")

    def test_material_com_NOME_DE_CLASSE_hostil(self) -> None:
        with self.assertRaises(RuntimeRefusal) as ctx:
            approved_binding_for_tests(execution_material=self.venenoso_nomeado())
        self.limpo(ctx.exception, "material")

    def test_bloco_ACP_com_NOME_DE_CLASSE_hostil(self) -> None:
        from creditum_hermes_reasoning.session import SessionRefusal, single_text_prompt

        with self.assertRaises(SessionRefusal) as ctx:
            single_text_prompt([{"type": self.venenoso_nomeado()}])
        self.limpo(ctx.exception, "bloco ACP")

    def test_safe_type_name_rejeita_UNICODE(self) -> None:
        # `isidentifier()` aceitaria — homóglifos cirílicos são identificador válido.
        from creditum_hermes_reasoning.runtime import TIPO_DESCONHECIDO, safe_type_name

        for nome in ("Соdеx", "Ol​а", "Erro‮"):
            self.assertEqual(safe_type_name(type(nome, (), {})()), TIPO_DESCONHECIDO, nome)
        self.assertEqual(safe_type_name(type("Seguro", (), {})()), "Seguro")

    def test_safe_label_NAO_ecoa_str_fora_da_lista(self) -> None:
        # Um `str` externo que não está na allowlist é texto de terceiro. Ecoá-lo
        # porque "é string" seria confundir tipo com procedência.
        with self.assertRaises(CodexRefusal) as ctx:
            extrai(Resposta(status=f"falhou: {SEGREDO_NA_EXCECAO}"))
        self.limpo(ctx.exception, "status str hostil")
        self.assertEqual(ctx.exception.detail, "status=str")
        # E um status conhecido AINDA aparece — allowlist, não apagamento.
        with self.assertRaises(CodexRefusal) as ctx2:
            extrai(Resposta(status="incomplete"))
        self.assertEqual(ctx2.exception.detail, "status=incomplete")

    def test_o_encadeamento_do_import_do_SDK_e_suprimido(self) -> None:
        # `__cause__` é None com ou sem `from None`. Quem carrega a original é
        # `__context__` — o mesmo erro de medição que a r6-r1 corrigiu, repetido aqui.
        import importlib
        import traceback

        original = importlib.import_module

        def explode(mod, *a, **k):
            if mod.startswith("openai"):
                raise excecao_com_nome(f"Bad {SEGREDO_NA_EXCECAO}")
            return original(mod, *a, **k)

        importlib.import_module = explode
        try:
            with self.assertRaises(ExecutorRefusal) as ctx:
                resolve_production_trusted_sdk_provider()
        finally:
            importlib.import_module = original
        e = ctx.exception
        self.assertTrue(e.__suppress_context__)
        rendido = "".join(traceback.format_exception(type(e), e, e.__traceback__))
        self.assertNotIn(SEGREDO_NA_EXCECAO, rendido)
