"""
FASE 3.1D-D1 — controles de execução do lado Python.

A autoridade humana NÃO está aqui: ela é do TypeScript, e o Python é trabalhador
subordinado. O que se prova neste arquivo é o outro lado do envelope — que os limites
chegam conferidos, que a invocação final é o conjunto EXATO, e que o Python não tem
nenhuma noção de aprovação de Stefano.

Zero cliente real, zero create real, zero provedor, zero modelo, zero rede.
"""

from __future__ import annotations

import ast
import inspect
import re
import pathlib
import unittest

from creditum_hermes_reasoning import codex as C
from creditum_hermes_reasoning import executor as EX
from creditum_hermes_reasoning import runtime as RT
from creditum_hermes_reasoning.codex import (
    CREATE_EXECUTION_CONTROL_FIELDS,
    FINAL_CREATE_FIELDS,
    GOVERNED_BACKGROUND,
    LIVE_ATTEMPT_DEADLINE_SECONDS,
    REQUEST_FIELDS,
    CodexDefect,
    CodexRefusal,
    enforce_execution_controls,
    enforce_final_create_kwargs,
)
from tests.support import approved_binding_for_tests


def corpo_executavel(caminho: pathlib.Path) -> str:
    """
    A fonte SEM comentário e SEM docstring.

    Escanear o texto cru acusa a PROSA que documenta a ausência como se fosse a
    presença: `__main__.py` diz "`--live` não existe", e um grep vê `--live`. É o
    mesmo defeito que a c6 pagou três vezes — texto onde a pergunta é estrutural.

    `ast.unparse` já descarta comentários; as docstrings são removidas explicitamente.
    Sobra o que EXECUTA.
    """
    arvore = ast.parse(caminho.read_text(encoding="utf-8"))
    for n in ast.walk(arvore):
        if isinstance(n, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            corpo = getattr(n, "body", [])
            if corpo and isinstance(corpo[0], ast.Expr) and isinstance(
                getattr(corpo[0], "value", None), ast.Constant
            ) and isinstance(corpo[0].value.value, str):
                n.body = corpo[1:] or [ast.Pass()]
    return ast.unparse(arvore)


def recusa(fn, *a, **kw) -> str:
    try:
        fn(*a, **kw)
    except CodexRefusal as r:
        return r.defect
    raise AssertionError("não recusou")


class TresVocabularios(unittest.TestCase):
    """Um dono por valor. Nenhum valor em dois lugares."""

    def test_A1_o_pedido_semantico_continua_fechado_em_cinco(self) -> None:
        self.assertEqual(
            REQUEST_FIELDS, ("model", "instructions", "input", "tools", "stream")
        )
        self.assertEqual(len(REQUEST_FIELDS), 5)

    def test_A2_controles_sao_exatamente_dois(self) -> None:
        self.assertEqual(CREATE_EXECUTION_CONTROL_FIELDS, ("background", "timeout"))

    def test_A3_nenhum_valor_tem_dois_donos(self) -> None:
        # `stream` e `tools` pertencem ao pedido; `background` e `timeout` aos
        # controles; `max_retries` só ao cliente. Sobreposição seria duas fontes de
        # verdade para o mesmo valor.
        self.assertEqual(set(REQUEST_FIELDS) & set(CREATE_EXECUTION_CONTROL_FIELDS), set())
        self.assertNotIn("max_retries", FINAL_CREATE_FIELDS)
        self.assertNotIn("timeout", RT.APPROVED_CLIENT_KWARGS)
        self.assertNotIn("background", RT.APPROVED_CLIENT_KWARGS)

    def test_A4_a_uniao_e_exata(self) -> None:
        self.assertEqual(
            FINAL_CREATE_FIELDS, tuple(REQUEST_FIELDS) + CREATE_EXECUTION_CONTROL_FIELDS
        )
        self.assertEqual(len(FINAL_CREATE_FIELDS), 7)

    def test_A5_a_superficie_verificada_cobre_o_que_se_envia(self) -> None:
        # Verificar cinco e enviar sete deixaria dois sem conferência.
        self.assertIs(C.REQUIRED_CREATE_PARAMS, FINAL_CREATE_FIELDS)


class ControlesDeExecucao(unittest.TestCase):
    def test_B1_o_par_governado_atravessa(self) -> None:
        for prazo in (1, 0.001, 90.5, 180, 180.0):
            with self.subTest(prazo):
                out = enforce_execution_controls({"background": False, "timeout": prazo})
                self.assertIs(out["background"], False)
                self.assertEqual(out["timeout"], prazo)

    def test_B2_background_omitido_e_recusado(self) -> None:
        # Omitir seria aceitar o default do SERVIDOR, que não observamos.
        self.assertEqual(
            recusa(enforce_execution_controls, {"timeout": 10}),
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
        )

    def test_B3_background_diferente_de_False_e_recusado(self) -> None:
        for mau in (True, None, 0, 1, "false", ""):
            with self.subTest(repr(mau)):
                self.assertEqual(
                    recusa(enforce_execution_controls, {"background": mau, "timeout": 10}),
                    CodexDefect.EXECUTION_BACKGROUND_NOT_APPROVED,
                )

    def test_B4_timeout_omitido_e_recusado(self) -> None:
        self.assertEqual(
            recusa(enforce_execution_controls, {"background": False}),
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
        )

    def test_B5_timeout_invalido_e_recusado(self) -> None:
        maus = (
            None, "180", True, False, [], {},
            0, -1, -0.5,
            float("nan"), float("inf"), float("-inf"),
            181, 180.0001, 10_000,
        )
        for mau in maus:
            with self.subTest(repr(mau)):
                self.assertEqual(
                    recusa(enforce_execution_controls, {"background": False, "timeout": mau}),
                    CodexDefect.EXECUTION_TIMEOUT_NOT_APPROVED,
                )

    def test_B6_chave_inesperada_e_recusada(self) -> None:
        self.assertEqual(
            recusa(
                enforce_execution_controls,
                {"background": False, "timeout": 10, "max_retries": 0},
            ),
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
        )

    def test_B7_nao_e_dicionario(self) -> None:
        for mau in (None, [("background", False)], "x", object()):
            with self.subTest(type(mau).__name__):
                self.assertEqual(
                    recusa(enforce_execution_controls, mau),
                    CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
                )

    def test_B8_o_teto_e_o_aprovado(self) -> None:
        self.assertEqual(LIVE_ATTEMPT_DEADLINE_SECONDS, 180)
        self.assertIs(GOVERNED_BACKGROUND, False)


class InvocacaoFinal(unittest.TestCase):
    def _base(self) -> dict:
        return {
            "model": "gpt-5.6-luna", "instructions": "x", "input": "y",
            "tools": [], "stream": False, "background": False, "timeout": 180.0,
        }

    def test_C1_o_conjunto_exato_atravessa(self) -> None:
        enforce_final_create_kwargs(self._base())

    def test_C2_faltando_controle_e_recusado(self) -> None:
        for ausente in ("background", "timeout"):
            with self.subTest(ausente):
                d = self._base(); del d[ausente]
                self.assertEqual(
                    recusa(enforce_final_create_kwargs, d),
                    CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
                )

    def test_C3_chave_extra_e_recusada(self) -> None:
        d = self._base(); d["max_retries"] = 0
        self.assertEqual(
            recusa(enforce_final_create_kwargs, d),
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
        )

    def test_C4_faltando_campo_semantico_e_recusado(self) -> None:
        d = self._base(); del d["instructions"]
        self.assertEqual(
            recusa(enforce_final_create_kwargs, d),
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
        )


class ClienteComZeroRetry(unittest.TestCase):
    def test_D1_kwargs_do_cliente_sao_tres_e_so_tres(self) -> None:
        kw = approved_binding_for_tests().to_client_kwargs()
        self.assertEqual(set(kw), {"api_key", "base_url", "max_retries"})
        self.assertEqual(set(kw), set(RT.APPROVED_CLIENT_KWARGS))

    def test_D2_max_retries_e_zero_e_nao_vem_do_chamador(self) -> None:
        kw = approved_binding_for_tests().to_client_kwargs()
        self.assertEqual(kw["max_retries"], 0)
        self.assertIs(type(kw["max_retries"]), int)
        # Não é material de credencial: o vocabulário de material segue fechado em 2.
        self.assertEqual(set(RT.APPROVED_MATERIAL_KEYS), {"base_url", "api_key"})
        self.assertNotIn("max_retries", RT.APPROVED_MATERIAL_KEYS)

    def test_D3_o_chamador_nao_consegue_alterar_o_retry(self) -> None:
        b = approved_binding_for_tests()
        kw = b.to_client_kwargs()
        kw["max_retries"] = 5
        # Dicionário NOVO a cada chamada: envenenar o devolvido não muda o vínculo.
        self.assertEqual(b.to_client_kwargs()["max_retries"], 0)

    def test_D4_with_options_NAO_e_usado_em_producao(self) -> None:
        # `with_options` devolveria um cliente COPIADO — outro objeto, outro `create`,
        # e "verificado == invocado" da r5 deixaria de valer.
        raiz = pathlib.Path(EX.__file__).parent
        usos = []
        for py in sorted(raiz.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            for n in ast.walk(ast.parse(py.read_text(encoding="utf-8"))):
                if isinstance(n, ast.Attribute) and n.attr == "with_options":
                    usos.append(f"{py.name}:{n.lineno}")
        self.assertEqual([], usos, f"with_options usado: {usos}")


class PythonNaoTemAutoridadeHumana(unittest.TestCase):
    """
    Arquitetura (c): o TypeScript é a única autoridade de aprovação humana.

    O Python não valida `ApprovalRequestV1`, `DecisionRecordV1`, autoridade de Stefano
    nem efetividade de decisão. Reimplementar essas regras criaria uma segunda
    definição, mais fraca, de "aprovação efetiva" — o defeito que a r6-r6 e a c6-r1 já
    pagaram para fechar em outros eixos.
    """

    TERMOS = (
        "ApprovalRequest", "DecisionRecord", "approval_id", "decision_id",
        "decided_by", "STEFANO", "supersedes", "subject_content_hash",
        "resolveEffectiveDecision", "decisionAuthorizes",
    )

    def test_E1_nenhum_modulo_de_producao_interpreta_aprovacao_humana(self) -> None:
        raiz = pathlib.Path(EX.__file__).parent
        achados = []
        for py in sorted(raiz.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            texto = corpo_executavel(py)
            for termo in self.TERMOS:
                # Fronteira de PALAVRA: `McpApprovalRequest` é um dos quinze tipos de
                # ferramenta do SDK enumerados pela c5, e contém `ApprovalRequest`
                # como substring. Substring não é identidade — a mesma lição, no
                # eixo do léxico.
                if re.search(rf"(?<![A-Za-z0-9_]){re.escape(termo)}", texto):
                    achados.append(f"{py.name}: {termo}")
        self.assertEqual([], achados, f"autoridade humana vazou para o Python: {achados}")

    def test_E2_o_corte_de_docstring_nao_torna_o_teste_vazio(self) -> None:
        # Controle POSITIVO do próprio método: um módulo sintético com o termo no
        # CORPO tem de ser acusado, e o mesmo termo só na docstring, não.
        import tempfile

        d = pathlib.Path(tempfile.mkdtemp())
        no_corpo = d / "no_corpo.py"
        no_corpo.write_text('x = "ApprovalRequestV1"\n', encoding="utf-8")
        so_na_prosa = d / "so_na_prosa.py"
        so_na_prosa.write_text('"""Não interpreta ApprovalRequestV1."""\nx = 1\n', encoding="utf-8")
        self.assertIn("ApprovalRequest", corpo_executavel(no_corpo))
        # E a fronteira de palavra distingue o tipo de ferramenta do SDK:
        # Fronteira só ANTES, permitindo sufixo. `\b...\b` seria errado nos DOIS
        # sentidos: não casaria `ApprovalRequestV1` (o `V` é caractere de palavra) e
        # portanto deixaria passar justamente o nome canônico que se quer barrar.
        # O controle positivo achou isso; a regra sozinha parecia certa.
        regra = r"(?<![A-Za-z0-9_])ApprovalRequest"
        self.assertIsNone(re.search(regra, "McpApprovalRequest"))
        self.assertIsNotNone(re.search(regra, "ApprovalRequestV1"))
        self.assertIsNotNone(re.search(regra, "ApprovalRequest"))
        self.assertNotIn("ApprovalRequest", corpo_executavel(so_na_prosa))


class SemInterruptorGlobalDeLIVE(unittest.TestCase):
    def test_F1_a_politica_de_producao_continua_NAO_APROVADA(self) -> None:
        self.assertEqual(EX.RESPONSE_POLICY_NOT_APPROVED, "LIVE_RESPONSE_POLICY_NOT_APPROVED")
        self.assertEqual(
            EX.TrustedSdkProvider.__dataclass_fields__["response_policy"].default,
            EX.RESPONSE_POLICY_NOT_APPROVED,
        )

    def test_F2_nao_existe_bandeira_booleana_de_LIVE(self) -> None:
        raiz = pathlib.Path(EX.__file__).parent
        proibidos = ("allow_live", "enable_live", "LIVE_ENABLED", "live=True", "--live")
        achados = [
            f"{py.name}: {t}"
            for py in sorted(raiz.rglob("*.py"))
            if "__pycache__" not in py.parts
            for t in proibidos
            if re.search(rf"(?<![A-Za-z0-9_]){re.escape(t)}", corpo_executavel(py))
        ]
        self.assertEqual([], achados, f"interruptor de LIVE: {achados}")

    def test_F3_o_run_sem_controles_nao_alcanca_o_provedor(self) -> None:
        # `execution_controls=None` é recusa: execução sem limite conferido não é
        # execução autorizada.
        fonte = inspect.getsource(EX.CreditumCodexReasoningExecutor.execute_live)
        i_ctrl = fonte.index("enforce_execution_controls")
        i_uniao = fonte.index("enforce_final_create_kwargs")
        i_call = fonte.index("verified_create(")
        self.assertLess(i_ctrl, i_call, "os controles são conferidos DEPOIS da chamada")
        # A união também: conferir os controles e depois montar o dicionário sem
        # reconferir o conjunto deixaria uma chave nova entrar entre as duas etapas.
        self.assertLess(i_uniao, i_call, "a união é conferida DEPOIS da chamada")
        self.assertLess(i_ctrl, i_uniao, "a união é conferida antes dos controles")

    def test_F4_o_executor_CHAMA_as_duas_conferencias(self) -> None:
        # Estrutural, e dito como tal: o conjunto enviado é sempre correto por
        # construção, então só a presença da chamada distingue "confere" de
        # "confia". Uma prova comportamental exigiria uma costura que não deve existir.
        arvore = ast.parse(inspect.getsource(EX.CreditumCodexReasoningExecutor.execute_live).lstrip())
        chamadas = {
            n.func.id
            for n in ast.walk(arvore)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
        }
        self.assertIn("enforce_execution_controls", chamadas)
        self.assertIn("enforce_final_create_kwargs", chamadas)
        self.assertIn("enforce_final_request", chamadas)


if __name__ == "__main__":
    unittest.main()
