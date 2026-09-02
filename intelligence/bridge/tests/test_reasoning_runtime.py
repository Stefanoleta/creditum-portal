"""
Fase 3.1d-b — o runtime de raciocínio governado, provado sem modelo.

O que é FALSO aqui: a base `AIAgent`, com a superfície observada na 3.1d-a/a2.
O que é REAL: o contrato de sistema, o portão final, a subclasse, a sessão, o predicado
de resultado. É onde a segurança mora.

Zero chamadas de modelo. Zero rede. Zero dado da Creditum.

    python3 -B -m unittest discover -s bridge -t bridge
"""

from __future__ import annotations

import os
import pathlib
import unittest



from tests.support import (
    TEST_FAKE_BASE_URL,
    TEST_FAKE_SECRET,
    approved_binding_for_tests,
    live_authorization_for_tests,
)
from creditum_hermes_reasoning.runtime import (
    APPROVED_API_MODE,
    APPROVED_HERMES_HOME,
    APPROVED_MATERIAL_KEYS,
    APPROVED_MODEL,
    APPROVED_PROVIDER,
    FORBIDDEN_MATERIAL_KEYS,
    ApprovedRuntimeBinding,
    LiveExecutionAuthorization,
    RuntimeDefect,
    RuntimeRefusal,
    approved_hermes_home_ok,
    governed_cwd_ok,
    resolve_approved_runtime_binding,
)
from creditum_hermes_reasoning.contract import (
    APPROVED_CONSTITUTION_HASH,
    CONSTITUTION_ID,
    STOCK_SYSTEM_SENTINELS,
    ContractError,
    build_system_contract,
    constitution_content_hash,
    load_constitution_text,
)
from creditum_hermes_reasoning.probe import load_fixture
from creditum_hermes_reasoning.session import (
    CreditumSessionStore,
    SessionRefusal,
    single_text_prompt,
)

# A autoridade de caminho exige `HERMES_HOME == /data` OBSERVADO. Os testes rodam fora
# da Hostinger, então a observação é encenada aqui — e há testes dedicados que a
# adulteram de propósito para provar que ela não é autoridade.
os.environ.setdefault("HERMES_HOME", APPROVED_HERMES_HOME)

CONTRATO = build_system_contract()
SISTEMA = CONTRATO.text
USUARIO = '{"read_model_id":"rm_sintetico"}'
PROVIDER = APPROVED_PROVIDER
MODEL = APPROVED_MODEL

#: Texto que o builder de fábrica devolveria. Sentinela: se aparecer, o override não
#: substituiu — ele complementou.
STOCK = "DEFAULT_AGENT_IDENTITY\n\nHERMES_AGENT_HELP_GUIDANCE\n\nSOUL.md"


class ConstituicaoVerificada(unittest.TestCase):
    def test_os_bytes_batem_com_o_hash_aprovado(self) -> None:
        texto = load_constitution_text()
        self.assertEqual(constitution_content_hash(texto), APPROVED_CONSTITUTION_HASH)

    def test_um_byte_diferente_muda_o_hash(self) -> None:
        self.assertNotEqual(
            constitution_content_hash(load_constitution_text() + " "),
            APPROVED_CONSTITUTION_HASH,
        )

    def test_o_LOADER_recusa_bytes_adulterados(self) -> None:
        # O teste anterior media a ARITMÉTICA do hash, não o PORTÃO. A mutação que
        # remove a conferência sobrevivia a ele: o arquivo em disco está correto, então
        # o portão nunca disparava. Este teste adultera os bytes de verdade.
        import tempfile

        from creditum_hermes_reasoning import contract as mod

        original = mod.CONSTITUTION_FILE
        with tempfile.TemporaryDirectory() as d:
            falso = pathlib.Path(d) / "adulterada.txt"
            adulterado = original.read_text(encoding="utf-8").replace(
                "Stefano é a autoridade final", "Hermes é a autoridade final"
            )
            self.assertNotEqual(adulterado, original.read_text(encoding="utf-8"))
            falso.write_text(adulterado, encoding="utf-8")
            mod.CONSTITUTION_FILE = falso
            try:
                with self.assertRaises(ContractError) as ctx:
                    mod.load_constitution_text()
                self.assertEqual(ctx.exception.defect, "CONSTITUTION_DRIFT")
                with self.assertRaises(ContractError):
                    mod.build_system_contract()
            finally:
                mod.CONSTITUTION_FILE = original
        # E volta a funcionar com os bytes aprovados.
        self.assertEqual(
            constitution_content_hash(load_constitution_text()), APPROVED_CONSTITUTION_HASH
        )

    def test_o_contrato_de_sistema_CONTEM_a_constituicao_intacta(self) -> None:
        self.assertIn(load_constitution_text(), CONTRATO.text)
        self.assertEqual(CONTRATO.constitution_hash, APPROVED_CONSTITUTION_HASH)
        self.assertEqual(CONTRATO.constitution_id, CONSTITUTION_ID)

    def test_o_hash_do_contrato_e_de_dominio_PROPRIO(self) -> None:
        # Domínio separado: o contrato de sistema compromete com outro conteúdo.
        self.assertNotEqual(CONTRATO.system_contract_hash, APPROVED_CONSTITUTION_HASH)
        self.assertRegex(CONTRATO.system_contract_hash, r"^[a-f0-9]{64}$")

    def test_o_contrato_nao_carrega_nada_de_ambiente(self) -> None:
        for proibido in ("localhost", "/opt/", "api_key", "sk-", "Bearer"):
            self.assertNotIn(proibido, CONTRATO.text, proibido)
        self.assertNotRegex(CONTRATO.text, r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")

    def test_deterministico(self) -> None:
        self.assertEqual(build_system_contract().text, build_system_contract().text)
        self.assertEqual(
            build_system_contract().system_contract_hash, CONTRATO.system_contract_hash
        )


# ═══════════════════════════════════════════════════════════════════════════════
# §48 §49 — o override do system
# ═══════════════════════════════════════════════════════════════════════════════


class Sessao(unittest.TestCase):
    def setUp(self) -> None:
        self.store = CreditumSessionStore()

    def test_cwd_governado_e_exigido(self) -> None:
        for ruim in ("/tmp", "/", "", None, "/data/subpasta", 42):
            with self.assertRaises(SessionRefusal, msg=repr(ruim)) as ctx:
                self.store.create(ruim)
            self.assertEqual(ctx.exception.defect, "CWD_NOT_ALLOWED")

    def test_mcp_e_RECUSADO(self) -> None:
        for pedido in ([{"name": "x"}], ["x"], {}, "x"):
            with self.assertRaises(SessionRefusal, msg=repr(pedido)) as ctx:
                self.store.create("/data", pedido)
            self.assertEqual(ctx.exception.defect, "MCP_NOT_ALLOWED")

    def test_mcp_vazio_canonico_e_None_passam(self) -> None:
        self.assertTrue(self.store.create("/data", None).session_id)
        self.assertTrue(self.store.create("/data", []).session_id)

    def test_uuid_novo_e_estado_NEW(self) -> None:
        a = self.store.create("/data")
        b = self.store.create("/data")
        self.assertNotEqual(a.session_id, b.session_id)
        self.assertEqual(a.state, "NEW")
        self.assertEqual(len(a.session_id), 36)

    def test_USO_UNICO_segundo_prompt_e_recusado(self) -> None:
        s = self.store.create("/data")
        self.store.begin_prompt(s.session_id)
        with self.assertRaises(SessionRefusal) as ctx:
            self.store.begin_prompt(s.session_id)
        self.assertEqual(ctx.exception.defect, "SESSION_ALREADY_RUNNING")
        # E depois de concluída, continua recusando.
        self.store.settle(s.session_id, "PROBED")
        with self.assertRaises(SessionRefusal) as ctx:
            self.store.begin_prompt(s.session_id)
        self.assertEqual(ctx.exception.defect, "SESSION_NOT_NEW")

    def test_sessao_inexistente_e_recusa(self) -> None:
        for ruim in ("nao-existe", 42, None):
            with self.assertRaises(SessionRefusal):
                self.store.get(ruim)

    def test_cancelar_so_vale_para_EM_EXECUCAO(self) -> None:
        s = self.store.create("/data")
        with self.assertRaises(SessionRefusal):
            self.store.cancel(s.session_id)  # ainda NEW
        self.store.begin_prompt(s.session_id)
        self.assertEqual(self.store.cancel(s.session_id).state, "CANCELLED")
        # Terminal: sem retomada.
        with self.assertRaises(SessionRefusal):
            self.store.begin_prompt(s.session_id)

    def test_SOMENTE_texto_um_bloco(self) -> None:
        self.assertEqual(single_text_prompt([{"type": "text", "text": "x"}]), "x")
        for ruim in (
            [{"type": "image", "data": "..."}],
            [{"type": "audio", "data": "..."}],
            [{"type": "resource"}],
            [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}],
            [],
            "texto",
            None,
        ):
            with self.assertRaises(SessionRefusal, msg=repr(ruim)[:40]):
                single_text_prompt(ruim)


# ═══════════════════════════════════════════════════════════════════════════════
# §38 §39 — o fixture sintético
# ═══════════════════════════════════════════════════════════════════════════════


class FixtureSintetico(unittest.TestCase):
    def test_identidade_e_hash(self) -> None:
        d, h = load_fixture()
        self.assertEqual(d["fixture_id"], "creditum_hermes_synthetic_direct_fact/v1")
        self.assertEqual(d["fixture_version"], "1.0.0")
        self.assertRegex(h, r"^[a-f0-9]{64}$")
        self.assertEqual(load_fixture()[1], h)

    def test_e_SINTETICO(self) -> None:
        d, _ = load_fixture()
        self.assertIs(d["synthetic"], True)
        bruto = str(d).lower()
        for proibido in ("cpf", "@creditum", "bitrix", "supabase", "lucas", "leonardo"):
            self.assertNotIn(proibido, bruto, proibido)

    def test_uma_evidencia_permitida(self) -> None:
        d, _ = load_fixture()
        self.assertEqual(d["read_model"]["permitted_evidence_refs"], ["ev_permitida"])

    def test_a_expectativa_e_INVARIANTE_nao_prosa(self) -> None:
        d, _ = load_fixture()
        self.assertIn("FACT", d["expected_invariant"])
        self.assertNotIn("exatamente", d["expected_invariant"].lower())


if __name__ == "__main__":
    unittest.main()


# ═══════════════════════════════════════════════════════════════════════════════
# 3.1d-b-r1 §5 — HIGH 1: a STRING não é autorização
# ═══════════════════════════════════════════════════════════════════════════════


class AutoridadeDeRuntime(unittest.TestCase):
    def test_D_E_credencial_e_base_url_forjadas_sao_recusadas(self) -> None:
        # Mesmo com TODOS os campos de identidade combinando, o vínculo forjado cai:
        # o portão passou a exigir PROCEDÊNCIA, não consistência.
        with self.assertRaises(RuntimeRefusal) as ctx:
            ApprovedRuntimeBinding(
                _issuer=object(),
                hermes_version="0.20.4",
                acp_version="0.9.0",
                provider=PROVIDER,
                model=MODEL,
                api_mode=APPROVED_API_MODE,
                hermes_home=APPROVED_HERMES_HOME,
                _execution_material={"api_key": "sk-atacante", "base_url": TEST_FAKE_BASE_URL},
            )
        self.assertEqual(ctx.exception.defect, "BINDING_FORGED")

    def test_I_mutar_a_fonte_depois_nao_muda_o_vinculo(self) -> None:
        # A versão r1 deste teste usava `{"api_key": "sk-original"}` — fixture 100%
        # escalar. Ela provava a casca e PASSAVA, e foi por isso que o aliasing
        # aninhado sobreviveu: o fixture não alcançava a condição.
        material = {"base_url": TEST_FAKE_BASE_URL, "api_key": TEST_FAKE_SECRET}
        b = approved_binding_for_tests(execution_material=material)
        material["base_url"] = "https://trocada.invalid"
        material["api_key"] = "sk-injetada"
        self.assertEqual(b.to_client_kwargs()["base_url"], TEST_FAKE_BASE_URL)
        self.assertEqual(b.to_client_kwargs()["api_key"], TEST_FAKE_SECRET)

    def test_J_resolvedor_de_producao_recusa_sem_o_runtime(self) -> None:
        # Os valores efetivos não foram observados. Inventar um faria o portão comparar
        # contra um palpite e chamar isso de identidade aprovada.
        with self.assertRaises(RuntimeRefusal) as ctx:
            resolve_approved_runtime_binding()
        self.assertIn(
            ctx.exception.defect, ("HERMES_RUNTIME_NOT_AVAILABLE", "RUNTIME_NOT_RESOLVED")
        )

    def test_o_vinculo_nunca_RENDERIZA_segredo(self) -> None:
        b = approved_binding_for_tests()
        for render in (repr(b), str(b), f"{b}"):
            self.assertNotIn(TEST_FAKE_SECRET, render)
            self.assertNotIn(TEST_FAKE_BASE_URL, render)
            self.assertIn("<omitido>", render)
        # E a identidade segura não carrega material nenhum.
        for proibido in ("base_url", "api_key"):
            self.assertNotIn(proibido, b.safe_identity())
        # A impressão digital do endpoint prova identidade sem publicar o host.
        self.assertNotIn("fixture.invalid", b.base_url_fingerprint())


# ═══════════════════════════════════════════════════════════════════════════════
# §19 — HIGH 3: HERMES_HOME é OBSERVAÇÃO, não autoridade
# ═══════════════════════════════════════════════════════════════════════════════


class AutoridadeDeCaminho(unittest.TestCase):
    def setUp(self) -> None:
        self._antigo = os.environ.get("HERMES_HOME")

    def tearDown(self) -> None:
        if self._antigo is None:
            os.environ.pop("HERMES_HOME", None)
        else:
            os.environ["HERMES_HOME"] = self._antigo

    def test_A_home_e_cwd_aprovados_passam(self) -> None:
        os.environ["HERMES_HOME"] = "/data"
        self.assertTrue(approved_hermes_home_ok())
        self.assertTrue(governed_cwd_ok("/data"))

    def test_B_home_e_cwd_iguais_mas_NAO_aprovados_falham(self) -> None:
        # O defeito exato: `cwd == HERMES_HOME` bastava, e o ambiente escolhia a regra.
        os.environ["HERMES_HOME"] = "/tmp/atacante"
        self.assertFalse(approved_hermes_home_ok())
        self.assertFalse(governed_cwd_ok("/tmp/atacante"))

    def test_C_home_errado_com_cwd_certo_falha(self) -> None:
        os.environ["HERMES_HOME"] = "/tmp/atacante"
        self.assertFalse(governed_cwd_ok("/data"))

    def test_D_home_certo_com_cwd_errado_falha(self) -> None:
        os.environ["HERMES_HOME"] = "/data"
        for ruim in ("/tmp/atacante", "/", "/data/subpasta", "", None, 42):
            self.assertFalse(governed_cwd_ok(ruim), repr(ruim))

    def test_E_caminho_relativo_que_resolve_para_fora_falha(self) -> None:
        os.environ["HERMES_HOME"] = "/data"
        for truque in ("/data/../tmp", "data", "./data", "/data/./../etc"):
            self.assertFalse(governed_cwd_ok(truque), truque)

    def test_F_home_ausente_e_RECUSA_nao_convite(self) -> None:
        os.environ.pop("HERMES_HOME", None)
        self.assertFalse(approved_hermes_home_ok())
        self.assertFalse(governed_cwd_ok("/data"))

    def test_o_vinculo_recusa_home_nao_aprovado(self) -> None:
        os.environ["HERMES_HOME"] = "/data"
        with self.assertRaises(RuntimeRefusal) as ctx:
            approved_binding_for_tests(hermes_home="/tmp/atacante")
        self.assertEqual(ctx.exception.defect, "HERMES_HOME_NOT_APPROVED")

    def test_a_sessao_usa_a_MESMA_autoridade(self) -> None:
        os.environ["HERMES_HOME"] = "/tmp/atacante"
        store = CreditumSessionStore()
        with self.assertRaises(SessionRefusal) as ctx:
            store.create("/tmp/atacante")
        self.assertEqual(ctx.exception.defect, "CWD_NOT_ALLOWED")
        os.environ["HERMES_HOME"] = "/data"
        self.assertTrue(store.create("/data").session_id)


# ═══════════════════════════════════════════════════════════════════════════════
# §1–§21 r2 — PROPRIEDADE PROFUNDA do material de execução aprovado
#
# O HIGH do Codex: `ApprovedRuntimeBinding` copiava só a CASCA. Valor aninhado
# mutável seguia sendo o objeto do chamador, e `to_agent_kwargs()` o devolvia por
# referência — material aprovado na emissão podia mudar DEPOIS, sem revalidação.
#
# A correção não copia mais fundo: ela não admite o que teria fundo.
# ═══════════════════════════════════════════════════════════════════════════════


class ClasseHostil:
    """Objeto mutável com cara de configuração."""

    def __init__(self) -> None:
        self.valor = "inicial"


def mat(**over) -> dict:
    """Material sintético COMPLETO. `over` envenena um campo por vez.

    Existe para que um teste que quer testar `args` não falhe por falta de `api_key` —
    o fixture tem de alcançar a defesa que ele diz medir.
    """
    base = {"base_url": TEST_FAKE_BASE_URL, "api_key": TEST_FAKE_SECRET}
    base.update(over)
    return base


#: A família de recusa de material. A r3 deu defeito próprio a `base_url` e `api_key`
#: para que a mensagem NOMEIE o campo — "chave não aprovada" não diria qual regra caiu.
DEFEITOS_DE_MATERIAL = (
    "RUNTIME_MATERIAL_NOT_APPROVED",
    "BASE_URL_NOT_APPROVED",
    "SECRET_MATERIAL_INVALID",
    "RUNTIME_NOT_RESOLVED",
)


def _material_recusado(teste, material: dict, chave_esperada: str = "") -> RuntimeRefusal:
    with teste.assertRaises(RuntimeRefusal, msg=repr(material)[:60]) as ctx:
        approved_binding_for_tests(execution_material=material)
    teste.assertIn(ctx.exception.defect, DEFEITOS_DE_MATERIAL)
    if chave_esperada:
        # O teste tem de alcançar a defesa DAQUELA chave, não cair por outro campo.
        teste.assertIn(chave_esperada, ctx.exception.detail)
    return ctx.exception


class PropriedadeProfundaDoMaterial(unittest.TestCase):
    # ── §2 §3 vocabulário fechado, derivado de observação ───────────────────

    def test_a_allowlist_de_material_e_so_o_OBSERVADO(self) -> None:
        # 3.1d-a: `_make_agent(session_id, cwd, model, requested_provider, base_url,
        # api_mode)`. Tirando identidade, sobra `base_url`.
        self.assertEqual(APPROVED_MATERIAL_KEYS, ("base_url", "api_key"))

    def test_os_quatro_campos_SUPOSTOS_da_r1_sairam(self) -> None:
        # Nenhum foi observado em produção. Eram a razão de existir material de
        # coleção para aliasar.
        # `api_key` PASSOU a ser aprovado na r3 por observação da 3.1d-c. Os outros
        # quatro seguem proibidos — e agora estão nomeados, não apenas ausentes.
        self.assertEqual(FORBIDDEN_MATERIAL_KEYS, ("command", "args", "credential_pool", "fallback_model"))
        for chave in FORBIDDEN_MATERIAL_KEYS:
            self.assertNotIn(chave, APPROVED_MATERIAL_KEYS, chave)

    # ── §13 args ────────────────────────────────────────────────────────────

    def test_13_args_e_PROIBIDO_e_mutar_a_lista_depois_e_irrelevante(self) -> None:
        original_args = ["one", "two"]
        _material_recusado(self, mat(args=original_args), "args")
        # E não há vínculo para envenenar: a lista do chamador nunca cruzou a fronteira.
        original_args.append("ATTACK")
        b = approved_binding_for_tests(execution_material=mat())
        self.assertNotIn("args", b.to_client_kwargs())

    # ── §14 aninhados ───────────────────────────────────────────────────────

    def test_14_mapping_e_lista_aninhados_sao_RECUSADOS(self) -> None:
        for material in (
            mat(base_url={"nested": {"items": ["a"]}}),
            mat(base_url=["https://a", "https://b"]),
            mat(nested={"items": []}),
        ):
            _material_recusado(self, material)

    # ── §15 command ─────────────────────────────────────────────────────────

    def test_15_command_escalar_OU_coleção_e_recusado(self) -> None:
        # Não foi observado em representação nenhuma. Não se inventa flexibilidade.
        _material_recusado(self, mat(command="python3"), "command")
        _material_recusado(self, mat(command=["python3"]), "command")

    # ── §16 credential_pool ─────────────────────────────────────────────────

    def test_16_credential_pool_arbitrario_e_RECUSADO(self) -> None:
        # Fixture com `base_url` VÁLIDO: a recusa tem de vir da defesa do
        # credential_pool, não de um campo de provider quebrado ao lado.
        e = _material_recusado(
            self,
            mat(credential_pool=ClasseHostil()),
            "credential_pool",
        )
        self.assertNotIn("inicial", e.detail)

    # ── §17 mutar o retorno não envenena o vínculo ──────────────────────────

    def test_17_mutar_os_kwargs_devolvidos_nao_afeta_a_proxima_chamada(self) -> None:
        b = approved_binding_for_tests(execution_material=mat())
        k1 = b.to_client_kwargs()
        k1["base_url"] = "https://atacante.invalid"
        k1["api_key"] = "sk-injetada"
        k2 = b.to_client_kwargs()
        self.assertEqual(k2["base_url"], TEST_FAKE_BASE_URL)
        self.assertEqual(k2["api_key"], TEST_FAKE_SECRET)
        self.assertIsNot(k1, k2)

    def test_17_o_retorno_nao_e_o_estado_interno(self) -> None:
        b = approved_binding_for_tests(execution_material=mat())
        self.assertIsNot(b.to_client_kwargs(), b._execution_material)
        # E o próprio estado interno é somente-leitura.
        with self.assertRaises(TypeError):
            b._execution_material["base_url"] = "https://atacante"  # type: ignore[index]

    # ── §18 identidade segue imutável ───────────────────────────────────────

    def test_18_identidade_aprovada_permanece_uma_autoridade(self) -> None:
        b = approved_binding_for_tests()
        self.assertEqual(b.safe_identity()["provider"], PROVIDER)
        with self.assertRaises(Exception):
            b.provider = "outro"  # type: ignore[misc]

    # ── §19 segredo não sai em exceção ──────────────────────────────────────

    def test_19_a_recusa_nomeia_a_CHAVE_nunca_o_valor(self) -> None:
        e = _material_recusado(
            self, mat(credential_pool="sk-SEGREDO-SINTETICO"), "credential_pool"
        )
        for render in (str(e), e.detail, repr(e)):
            self.assertNotIn("sk-SEGREDO-SINTETICO", render)
        # E a recusa de base_url nomeia a PARTE, nunca a URL.
        e2 = _material_recusado(self, mat(base_url="https://h.invalid/p?token=SEGREDO-QS"))
        for render in (str(e2), e2.detail, repr(e2)):
            self.assertNotIn("SEGREDO-QS", render)
            self.assertIn("query", render)

    # ── §20 objetos exóticos ────────────────────────────────────────────────

    def test_20_valores_EXOTICOS_sao_recusados_na_emissao(self) -> None:
        exoticos = (
            ClasseHostil(),
            lambda: "https://x",
            (x for x in ("https://x",)),
            iter(["https://x"]),
            bytearray(b"https://x"),
            {"a": 1},
            ["https://x"],
            {"https://x"},
            None,
            True,
            42,
            "",
        )
        for valor in exoticos:
            _material_recusado(self, mat(base_url=valor))

    def test_20_deepcopy_nao_e_a_defesa(self) -> None:
        # Um objeto executável copiável continua executável. Copiar não é aprovar.
        _material_recusado(self, mat(base_url=ClasseHostil()))

    # ── §1 nada de subclasse de dict com `__getitem__` traiçoeiro ───────────

    def test_1_subclasse_de_dict_e_RECUSADA(self) -> None:
        class DictTraicoeiro(dict):
            def __init__(self) -> None:
                super().__init__(**mat())
                self.leituras = 0

            def __getitem__(self, chave):
                # Validar-e-guardar leria duas vezes; a 2ª devolveria outra coisa.
                self.leituras += 1
                return TEST_FAKE_BASE_URL if self.leituras == 1 else "https://atacante.invalid"

        _material_recusado(self, DictTraicoeiro(), "dict")

    # ── §21 o vínculo é a única autoridade depois da emissão ────────────────

    def test_21_mutar_o_grafo_do_chamador_depois_nao_muda_nada(self) -> None:
        material = mat()
        b = approved_binding_for_tests(execution_material=material)
        material["base_url"] = "https://atacante.invalid"
        material["args"] = ["ATTACK"]
        del material  # o vínculo não relê a fonte
        self.assertEqual(b.to_client_kwargs()["base_url"], TEST_FAKE_BASE_URL)


# ═══════════════════════════════════════════════════════════════════════════════
# §6 §11 r2 — os kwargs GOVERNADOS também eram compartilhados
#
# `GOVERNED_AGENT_KWARGS` era `dict` de módulo, e `enabled_toolsets: []` era o MESMO
# objeto em toda construção do processo. A 3.1b já tinha documentado o risco no mesmo
# campo: o fornecedor guarda a lista por referência, e o refresh tardio de MCP da
# 3.1d-a é um escritor real dela.
# ═══════════════════════════════════════════════════════════════════════════════


