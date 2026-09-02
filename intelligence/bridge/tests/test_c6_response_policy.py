"""
FASE 3.1D-C6 — política governada de extração de `Response.output`.

─── O que estes testes medem ─────────────────────────────────────────────────

A 3.1d-c5 observou a superfície de tipos do SDK. Ela NÃO observou a forma que o
modelo devolve — nenhuma chamada foi feita. Então a política tem de estar correta sob
TODAS as formas plausíveis, e é isso que se mede aqui.

O ponto mais importante: "reasoning é ignorado" não é uma promessa, é uma afirmação
verificável. As classes sintéticas de reasoning e compaction têm campos que ESTOURAM
se lidos. Se a extração tocar `content`, `summary` ou `encrypted_content`, o teste cai.
Intenção não é medida.

Zero cliente, zero create, zero provedor, zero modelo, zero rede.
"""

from __future__ import annotations

import unittest

from creditum_hermes_reasoning.codex import (
    APPROVED_MESSAGE_ROLE,
    APPROVED_MESSAGE_TYPE,
    C5_REJECTED_ACTION_TYPES,
    POLICY_ID,
    POLICY_VERSION,
    CodexDefect,
    CodexRefusal,
    ExtractedResponseText,
    GovernedResponseTypes,
    extract_governed_response_text,
)
from tests.support import issue_governed_response_types_for_tests

JSON_OK = '{"insights":[{"insight_id":"i1"}]}'
SEGREDO_NA_RECUSA = "test-secret-never-log"


# ─────────────────────────────────────────────────────────────────────────────
# Objetos sintéticos do SDK. Nenhum é lido além do que a política declara ler.
# ─────────────────────────────────────────────────────────────────────────────


class TextoSintetico:
    def __init__(self, texto, tipo="output_text"):
        self.text, self.type = texto, tipo


class RecusaSintetica:
    """A recusa carrega segredo. Se o texto atravessar, o teste vê."""

    def __init__(self, texto=f"não posso responder: {SEGREDO_NA_RECUSA}"):
        self._refusal, self.type = texto, "refusal"

    @property
    def refusal(self):  # pragma: no cover - não deve ser chamado
        raise AssertionError("o payload da recusa foi dereferenciado")


class MensagemSintetica:
    def __init__(self, blocos, tipo=APPROVED_MESSAGE_TYPE, papel=APPROVED_MESSAGE_ROLE,
                 status="completed"):
        self.content, self.type, self.role, self.status = blocos, tipo, papel, status


class _Opaco:
    """
    Base dos itens opacos: TODO campo semântico estoura ao ser lido.

    É assim que se mede a opacidade. Um teste que só verificasse "o texto final não
    mudou" passaria mesmo se a implementação lesse o reasoning e descartasse — e a
    próxima versão poderia deixar de descartar.
    """

    LIDOS: list = []

    def __init__(self, ident="op-1"):
        self._ident = ident

    def _explode(self, nome):
        type(self).LIDOS.append(nome)
        raise AssertionError(f"campo opaco {nome} foi lido")

    @property
    def id(self):  # pragma: no cover
        self._explode("id")

    @property
    def summary(self):  # pragma: no cover
        self._explode("summary")

    @property
    def content(self):  # pragma: no cover
        self._explode("content")

    @property
    def encrypted_content(self):  # pragma: no cover
        self._explode("encrypted_content")

    @property
    def status(self):  # pragma: no cover
        self._explode("status")

    @property
    def type(self):  # pragma: no cover
        self._explode("type")


class ReasoningSintetico(_Opaco):
    LIDOS: list = []


class CompactionSintetico(_Opaco):
    LIDOS: list = []


class IncompletoSintetico:
    def __init__(self, reason="max_output_tokens"):
        self.reason = reason


class ErroSintetico:
    def __init__(self, code="server_error", message=f"falha {SEGREDO_NA_RECUSA}"):
        self.code, self.message = code, message


class RespostaSintetica:
    def __init__(self, itens=None, status="completed", error=None, incomplete_details=None):
        self.output = [] if itens is None else itens
        self.status, self.error, self.incomplete_details = status, error, incomplete_details


class OutroTipoDeResposta(RespostaSintetica):
    """Subclasse: mesma forma, procedência diferente."""


def tipos() -> GovernedResponseTypes:
    return issue_governed_response_types_for_tests(
        response=RespostaSintetica,
        output_message=MensagemSintetica,
        output_text=TextoSintetico,
        output_refusal=RecusaSintetica,
        reasoning_item=ReasoningSintetico,
        compaction_item=CompactionSintetico,
    )


def extrair(resposta):
    return extract_governed_response_text(resposta, types=tipos())


def msg_ok(texto=JSON_OK):
    return MensagemSintetica([TextoSintetico(texto)])


def recusa_por(resposta) -> str:
    try:
        extrair(resposta)
    except CodexRefusal as r:
        return r.defect
    raise AssertionError("não recusou")


# ═══════════════════════════════════════════════════════════════════════════════
# A. CAMINHOS QUE PASSAM — e a ausência de invariante de ORDEM
# ═══════════════════════════════════════════════════════════════════════════════


class CaminhosQuePassam(unittest.TestCase):
    def setUp(self) -> None:
        ReasoningSintetico.LIDOS.clear()
        CompactionSintetico.LIDOS.clear()

    def test_A1_mensagem_sozinha(self) -> None:
        r = extrair(RespostaSintetica(itens=[msg_ok()]))
        self.assertIs(type(r), ExtractedResponseText)
        self.assertEqual(r.text, JSON_OK)
        self.assertEqual((r.reasoning_item_count, r.compaction_item_count), (0, 0))
        self.assertEqual((r.policy_id, r.policy_version), (POLICY_ID, POLICY_VERSION))

    def test_A2_todas_as_ORDENS_com_reasoning_e_compaction(self) -> None:
        # C6 proíbe codificar ordem. Se alguma permutação falhar, a ordem virou
        # invariante sem ninguém decidir isso.
        m = msg_ok
        formas = (
            ("[reasoning, message]", lambda: [ReasoningSintetico(), m()], 1, 0),
            ("[message, reasoning]", lambda: [m(), ReasoningSintetico()], 1, 0),
            ("[compaction, message]", lambda: [CompactionSintetico(), m()], 0, 1),
            ("[message, compaction]", lambda: [m(), CompactionSintetico()], 0, 1),
            ("[compaction, message, reasoning]",
             lambda: [CompactionSintetico(), m(), ReasoningSintetico()], 1, 1),
            ("[reasoning, message, compaction]",
             lambda: [ReasoningSintetico(), m(), CompactionSintetico()], 1, 1),
            ("[reasoning, reasoning, message]",
             lambda: [ReasoningSintetico(), ReasoningSintetico(), m()], 2, 0),
        )
        for rotulo, monta, nr, nc in formas:
            with self.subTest(rotulo):
                r = extrair(RespostaSintetica(itens=monta()))
                self.assertEqual(r.text, JSON_OK, rotulo)
                self.assertEqual(r.reasoning_item_count, nr, rotulo)
                self.assertEqual(r.compaction_item_count, nc, rotulo)

    def test_A3_texto_preservado_EXATO(self) -> None:
        # Nem `strip`, nem normalização. O que o modelo disse é o que atravessa.
        for bruto in ("  " + JSON_OK, JSON_OK + "\n", " \n" + JSON_OK + "  \t"):
            with self.subTest(repr(bruto)):
                self.assertEqual(extrair(RespostaSintetica(itens=[msg_ok(bruto)])).text, bruto)


# ═══════════════════════════════════════════════════════════════════════════════
# B. OPACIDADE MEDIDA — o ponto central de A e C
# ═══════════════════════════════════════════════════════════════════════════════


class OpacidadeMedida(unittest.TestCase):
    def setUp(self) -> None:
        ReasoningSintetico.LIDOS.clear()
        CompactionSintetico.LIDOS.clear()

    def test_B1_nenhum_campo_de_reasoning_e_lido(self) -> None:
        r = extrair(RespostaSintetica(itens=[ReasoningSintetico(), msg_ok()]))
        self.assertEqual(r.reasoning_item_count, 1)
        self.assertEqual([], ReasoningSintetico.LIDOS, "a extração leu campo opaco")

    def test_B2_nenhum_campo_de_compaction_e_lido(self) -> None:
        r = extrair(RespostaSintetica(itens=[CompactionSintetico(), msg_ok()]))
        self.assertEqual(r.compaction_item_count, 1)
        self.assertEqual([], CompactionSintetico.LIDOS, "a extração leu campo opaco")

    def test_B3_o_conteudo_opaco_nao_entra_no_texto(self) -> None:
        r = extrair(RespostaSintetica(itens=[ReasoningSintetico(), msg_ok(), CompactionSintetico()]))
        self.assertEqual(r.text, JSON_OK)
        self.assertEqual([], ReasoningSintetico.LIDOS + CompactionSintetico.LIDOS)

    def test_B4_o_fixture_ALCANCA_a_condicao(self) -> None:
        # Controle do próprio fixture: se ler um campo opaco NÃO estourasse, B1–B3
        # passariam sem provar nada. Aqui se prova que o veneno funciona.
        with self.assertRaises(AssertionError):
            _ = ReasoningSintetico().content
        with self.assertRaises(AssertionError):
            _ = CompactionSintetico().summary
        self.assertEqual(ReasoningSintetico.LIDOS, ["content"])
        self.assertEqual(CompactionSintetico.LIDOS, ["summary"])


# ═══════════════════════════════════════════════════════════════════════════════
# C. RECUSA DO MODELO — desfecho controlado, texto NUNCA
# ═══════════════════════════════════════════════════════════════════════════════


class RecusaDoModelo(unittest.TestCase):
    def test_C1_um_bloco_de_recusa_e_MODEL_REFUSED(self) -> None:
        d = recusa_por(RespostaSintetica(itens=[MensagemSintetica([RecusaSintetica()])]))
        self.assertEqual(d, CodexDefect.MODEL_REFUSED)
        self.assertNotEqual(d, CodexDefect.RESULT_AMBIGUOUS)

    def test_C2_o_texto_da_recusa_NAO_atravessa(self) -> None:
        try:
            extrair(RespostaSintetica(itens=[MensagemSintetica([RecusaSintetica()])]))
        except CodexRefusal as r:
            render = f"{str(r)} {r.args!r} {r.detail!r} {r.defect!r}"
            self.assertNotIn(SEGREDO_NA_RECUSA, render, f"segredo atravessou: {render}")
            self.assertEqual(r.detail, "", "a recusa carregou detalhe")

    def test_C3_o_payload_da_recusa_nao_e_dereferenciado(self) -> None:
        # `RecusaSintetica.refusal` estoura. A recusa é identificada pela CLASSE, e
        # dereferenciar o payload só criaria a chance de vazá-lo.
        d = recusa_por(RespostaSintetica(itens=[MensagemSintetica([RecusaSintetica()])]))
        self.assertEqual(d, CodexDefect.MODEL_REFUSED)

    def test_C4_recusa_COM_reasoning_continua_MODEL_REFUSED(self) -> None:
        d = recusa_por(RespostaSintetica(
            itens=[ReasoningSintetico(), MensagemSintetica([RecusaSintetica()])]))
        self.assertEqual(d, CodexDefect.MODEL_REFUSED)

    def test_C5_texto_MAIS_recusa_e_contagem_invalida_nao_MODEL_REFUSED(self) -> None:
        # Dois blocos são duas respostas. Escolher a recusa seria escolher por nós, e
        # chamar isso de MODEL_REFUSED esconderia ambiguidade atrás de desfecho limpo.
        d = recusa_por(RespostaSintetica(
            itens=[MensagemSintetica([TextoSintetico(JSON_OK), RecusaSintetica()])]))
        self.assertEqual(d, CodexDefect.RESPONSE_CONTENT_COUNT_INVALID)
        self.assertNotEqual(d, CodexDefect.MODEL_REFUSED)

    def test_C6_recusa_em_mensagem_NAO_concluida_falha_antes(self) -> None:
        # Precedência: status da mensagem vem antes da classificação do bloco.
        d = recusa_por(RespostaSintetica(
            itens=[MensagemSintetica([RecusaSintetica()], status="incomplete")]))
        self.assertEqual(d, CodexDefect.RESPONSE_MESSAGE_NOT_COMPLETED)


# ═══════════════════════════════════════════════════════════════════════════════
# D. INVARIANTES DE SUCESSO — cada um recusa com o SEU código
# ═══════════════════════════════════════════════════════════════════════════════


class InvariantesDeSucesso(unittest.TestCase):
    def test_D1_tipo_de_resposta_nao_aprovado(self) -> None:
        for obj in (OutroTipoDeResposta(itens=[msg_ok()]), object(), None, {"output": []}):
            with self.subTest(type(obj).__name__):
                self.assertEqual(recusa_por(obj), CodexDefect.RESPONSE_TYPE_NOT_APPROVED)

    def test_D2_error_presente(self) -> None:
        d = recusa_por(RespostaSintetica(itens=[msg_ok()], error=ErroSintetico()))
        self.assertEqual(d, CodexDefect.RESPONSE_ERROR_PRESENT)

    def test_D3_a_mensagem_do_error_nao_atravessa(self) -> None:
        try:
            extrair(RespostaSintetica(itens=[msg_ok()], error=ErroSintetico()))
        except CodexRefusal as r:
            self.assertNotIn(SEGREDO_NA_RECUSA, f"{str(r)} {r.args!r} {r.detail!r}")

    def test_D4_status_agregado(self) -> None:
        for st in ("failed", "in_progress", "cancelled", "queued", "incomplete", None, "futuro"):
            with self.subTest(str(st)):
                d = recusa_por(RespostaSintetica(itens=[msg_ok()], status=st))
                self.assertEqual(d, CodexDefect.RESPONSE_STATUS_NOT_COMPLETED)

    def test_D5_incomplete_details_presente(self) -> None:
        for motivo in ("max_output_tokens", "content_filter", "futuro"):
            with self.subTest(motivo):
                # Texto de aparência VÁLIDA presente, e ainda assim recusa: texto
                # presente não é sucesso.
                d = recusa_por(RespostaSintetica(
                    itens=[msg_ok()], incomplete_details=IncompletoSintetico(motivo)))
                self.assertEqual(d, CodexDefect.RESPONSE_INCOMPLETE)

    def test_D6_output_ausente_vazio_ou_nao_lista(self) -> None:
        for saida in ([], None, "texto", (msg_ok(),), {}):
            with self.subTest(type(saida).__name__):
                r = RespostaSintetica()
                r.output = saida
                self.assertEqual(recusa_por(r), CodexDefect.RESPONSE_OUTPUT_NOT_AVAILABLE)

    def test_D7_contagem_de_mensagens(self) -> None:
        casos = (
            ("zero", [ReasoningSintetico()]),
            ("duas", [msg_ok(), msg_ok()]),
            ("duas com opacos", [ReasoningSintetico(), msg_ok(), msg_ok(), CompactionSintetico()]),
        )
        for rotulo, itens in casos:
            with self.subTest(rotulo):
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=itens)),
                    CodexDefect.RESPONSE_MESSAGE_COUNT_INVALID,
                )

    def test_D8_type_e_role_da_mensagem(self) -> None:
        for over in ({"tipo": "outro"}, {"papel": "user"}, {"papel": "system"}, {"papel": None}):
            with self.subTest(str(over)):
                m = MensagemSintetica([TextoSintetico(JSON_OK)], **over)
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=[m])),
                    CodexDefect.RESPONSE_MESSAGE_ROLE_INVALID,
                )

    def test_D9_status_da_mensagem(self) -> None:
        # Um `Response` concluído NÃO desculpa uma mensagem não concluída.
        for st in ("in_progress", "incomplete", None, "futuro"):
            with self.subTest(str(st)):
                m = MensagemSintetica([TextoSintetico(JSON_OK)], status=st)
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=[m])),
                    CodexDefect.RESPONSE_MESSAGE_NOT_COMPLETED,
                )

    def test_D10_contagem_de_blocos(self) -> None:
        for rotulo, blocos in (("zero", []), ("dois textos",
                               [TextoSintetico(JSON_OK), TextoSintetico(JSON_OK)])):
            with self.subTest(rotulo):
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=[MensagemSintetica(blocos)])),
                    CodexDefect.RESPONSE_CONTENT_COUNT_INVALID,
                )

    def test_D11_content_nao_lista(self) -> None:
        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[MensagemSintetica("texto")])),
            CodexDefect.RESPONSE_CONTENT_COUNT_INVALID,
        )

    def test_D12_bloco_de_classe_nao_aprovada(self) -> None:
        class BlocoImpostor:
            type = "output_text"
            text = JSON_OK

        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[MensagemSintetica([BlocoImpostor()])])),
            CodexDefect.RESPONSE_CONTENT_NOT_APPROVED,
        )

    def test_D13_discriminador_do_bloco_divergente(self) -> None:
        m = MensagemSintetica([TextoSintetico(JSON_OK, tipo="refusal")])
        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[m])), CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID
        )

    def test_D14_texto_nao_e_str(self) -> None:
        class TextoVenenoso:
            def __str__(self):  # pragma: no cover
                raise AssertionError("coerção executada")

        for valor in (None, 7, [], TextoVenenoso()):
            with self.subTest(type(valor).__name__):
                m = MensagemSintetica([TextoSintetico(valor)])
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=[m])),
                    CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID,
                )

    def test_D15_subclasse_de_str_nao_herda_aprovacao(self) -> None:
        class TextoDerivado(str):
            pass

        m = MensagemSintetica([TextoSintetico(TextoDerivado(JSON_OK))])
        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[m])), CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID
        )

    def test_D16_texto_vazio_ou_so_espaco(self) -> None:
        for vazio in ("", " ", "\n", "\t \r\n", " "):
            with self.subTest(repr(vazio)):
                m = MensagemSintetica([TextoSintetico(vazio)])
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=[m])),
                    CodexDefect.RESPONSE_OUTPUT_TEXT_EMPTY,
                )

    def test_D17_campo_ausente_e_desconhecido_nao_vazio(self) -> None:
        r = RespostaSintetica(itens=[msg_ok()])
        del r.status
        self.assertEqual(recusa_por(r), CodexDefect.RESULT_AMBIGUOUS)


# ═══════════════════════════════════════════════════════════════════════════════
# E. FERRAMENTAS — os quinze tipos da C5, e o tipo futuro
# ═══════════════════════════════════════════════════════════════════════════════


class ItensDeFerramenta(unittest.TestCase):
    def test_E1_os_quinze_tipos_da_C5_sao_recusados(self) -> None:
        self.assertEqual(len(C5_REJECTED_ACTION_TYPES), 15)
        for nome in C5_REJECTED_ACTION_TYPES:
            with self.subTest(nome):
                # Classe construída com o nome exato observado pela C5, ao lado de uma
                # mensagem por tudo o mais válida.
                falso = type(nome, (), {"type": "function_call"})()
                self.assertEqual(
                    recusa_por(RespostaSintetica(itens=[falso, msg_ok()])),
                    CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED,
                )

    def test_E2_tipo_FUTURO_desconhecido_e_recusado(self) -> None:
        futuro = type("ResponseAlgoQueAindaNaoExiste", (), {"type": "algo_novo"})()
        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[futuro, msg_ok()])),
            CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED,
        )

    def test_E3_objeto_de_MESMA_FORMA_e_recusado(self) -> None:
        # Ter os campos certos não faz de um objeto a classe que o SDK construiu.
        class MensagemImpostora:
            type, role, status = APPROVED_MESSAGE_TYPE, APPROVED_MESSAGE_ROLE, "completed"
            content = [TextoSintetico(JSON_OK)]

        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[MensagemImpostora()])),
            CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED,
        )

    def test_E4_subclasse_de_mensagem_nao_herda_aprovacao(self) -> None:
        class MensagemDerivada(MensagemSintetica):
            pass

        m = MensagemDerivada([TextoSintetico(JSON_OK)])
        self.assertEqual(
            recusa_por(RespostaSintetica(itens=[m])),
            CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED,
        )


# ═══════════════════════════════════════════════════════════════════════════════
# F. AUTORIDADE DOS TIPOS E `output_text`
# ═══════════════════════════════════════════════════════════════════════════════


class AutoridadeDosTipos(unittest.TestCase):
    def test_F1_tipos_nao_selados_sao_recusados(self) -> None:
        for falso in (None, object(), {"response": RespostaSintetica}):
            with self.subTest(type(falso).__name__):
                with self.assertRaises(CodexRefusal) as ctx:
                    extract_governed_response_text(RespostaSintetica(itens=[msg_ok()]), types=falso)
                self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE)

    def test_F2_o_chamador_nao_consegue_emitir_tipos(self) -> None:
        with self.assertRaises(CodexRefusal) as ctx:
            GovernedResponseTypes(
                _issuer=object(), response=RespostaSintetica, output_message=MensagemSintetica,
                output_text=TextoSintetico, output_refusal=RecusaSintetica,
                reasoning_item=ReasoningSintetico, compaction_item=CompactionSintetico,
            )
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE)

    def test_F3_output_text_NAO_e_usado_pela_extracao(self) -> None:
        # Por AST, e não por substring: `types.output_text` é acesso LEGÍTIMO ao
        # carrier selado — é a nossa própria classe aprovada. O que não pode existir é
        # `output_text` lido de QUALQUER outra coisa, em especial da resposta.
        # Um `assertNotIn(".output_text", fonte)` reprovaria o código correto, e foi
        # exatamente o que a primeira versão deste teste fez.
        import ast
        import inspect

        arvore = ast.parse(inspect.getsource(extract_governed_response_text).lstrip())
        indevidos = [
            ast.dump(n.value)
            for n in ast.walk(arvore)
            if isinstance(n, ast.Attribute)
            and n.attr == "output_text"
            and not (isinstance(n.value, ast.Name) and n.value.id == "types")
        ]
        self.assertEqual([], indevidos, f"output_text lido de algo que não é `types`: {indevidos}")

    def test_F4_a_propriedade_output_text_nunca_e_tocada(self) -> None:
        class RespostaComOutputTextVenenoso(RespostaSintetica):
            @property
            def output_text(self):  # pragma: no cover
                raise AssertionError("output_text foi acessado")

        tipos_com = issue_governed_response_types_for_tests(
            response=RespostaComOutputTextVenenoso, output_message=MensagemSintetica,
            output_text=TextoSintetico, output_refusal=RecusaSintetica,
            reasoning_item=ReasoningSintetico, compaction_item=CompactionSintetico,
        )
        r = extract_governed_response_text(
            RespostaComOutputTextVenenoso(itens=[msg_ok()]), types=tipos_com
        )
        self.assertEqual(r.text, JSON_OK)

    def test_F5_nem_str_nem_repr_da_resposta(self) -> None:
        # A docstring NOMEIA `str(response)` para explicar por que não se usa —
        # escanear a fonte crua acusaria a explicação como se fosse o defeito. Corta-se
        # docstring e comentário; sobra o que EXECUTA. A primeira versão deste teste
        # falhou exatamente por isso, no momento em que a prosa foi escrita.
        import ast
        import inspect

        arvore = ast.parse(inspect.getsource(extract_governed_response_text).lstrip())
        funcao = arvore.body[0]
        assert isinstance(funcao, ast.FunctionDef)
        corpo = funcao.body[1:] if ast.get_docstring(funcao) else funcao.body
        executavel = "\n".join(ast.unparse(n) for n in corpo)
        self.assertNotIn("str(response)", executavel)
        self.assertNotIn("repr(response)", executavel)
        # Controle positivo: a prosa PRECISA nomear o que proíbe, senão o corte acima
        # tornaria o teste incapaz de falhar.
        self.assertIn("str(response)", ast.get_docstring(funcao) or "")

    def test_F6_python_nao_produz_OK_semantico(self) -> None:
        # O resultado estrutural não é aceitação. Nenhum campo diz "ok".
        r = extrair(RespostaSintetica(itens=[msg_ok()]))
        campos = {c: getattr(r, c) for c in r.__dataclass_fields__}
        self.assertNotIn("OK", str(list(campos.values())).upper().replace("TOKENS", ""))
        self.assertNotIn("verdict", campos)


if __name__ == "__main__":
    unittest.main()


# ═══════════════════════════════════════════════════════════════════════════════
# G. C6-R1 — PROCEDÊNCIA DE VERSÃO DO SDK
#
# O Codex, antes de a review dele ser interrompida pelo provedor, apontou: a c6
# DECLARAVA autoridade 2.24.0 sem observar a versão do SDK carregado. Estava certo.
#
# ─── Como isto é testado, dito sem enfeite ────────────────────────────────────
#
# A máquina não tem o `openai`. Os testes injetam um pacote sintético em
# `sys.modules`, que é o que `importlib.import_module` consulta. Isso NÃO é uma
# costura de produção: nenhum parâmetro foi acrescentado ao resolvedor, e ele continua
# com ZERO argumento.
#
# E é honesto dizer o que essa técnica implica: quem consegue escrever em
# `sys.modules` já executa Python arbitrário no processo. A fronteira de ameaça
# declarada desde a r5 é a API PÚBLICA governada — não resistência a código arbitrário
# in-process. O que estes testes provam é que a API pública não aceita SDK de versão
# errada, nem classes de fora do pacote verificado.
# ═══════════════════════════════════════════════════════════════════════════════


class _SdkSintetico:
    """Monta um pacote `openai` falso em `sys.modules` e o remove ao sair."""

    MODULOS = (
        "openai",
        "openai.types",
        "openai.types.responses",
        "openai.types.responses.response",
        "openai.types.responses.response_output_message",
        "openai.types.responses.response_output_text",
        "openai.types.responses.response_output_refusal",
        "openai.types.responses.response_reasoning_item",
        "openai.types.responses.response_compaction_item",
    )
    CLASSES = (
        ("openai.types.responses.response", "Response"),
        ("openai.types.responses.response_output_message", "ResponseOutputMessage"),
        ("openai.types.responses.response_output_text", "ResponseOutputText"),
        ("openai.types.responses.response_output_refusal", "ResponseOutputRefusal"),
        ("openai.types.responses.response_reasoning_item", "ResponseReasoningItem"),
        ("openai.types.responses.response_compaction_item", "ResponseCompactionItem"),
    )

    def __init__(self, versao="2.24.0", omitir=None, origem_falsa=None, sem_versao=False):
        self.versao, self.omitir = versao, omitir
        self.origem_falsa, self.sem_versao = origem_falsa, sem_versao
        self._antes = {}

    def __enter__(self):
        import sys
        import types as _t

        for nome in self.MODULOS:
            self._antes[nome] = sys.modules.get(nome)
            sys.modules[nome] = _t.ModuleType(nome)
        raiz = sys.modules["openai"]
        if not self.sem_versao:
            raiz.__version__ = self.versao
        # Liga a árvore de atributos: é por ela que o resolvedor caminha.
        for nome in self.MODULOS[1:]:
            pai, filho = nome.rsplit(".", 1)
            setattr(sys.modules[pai], filho, sys.modules[nome])
        for modulo, qualname in self.CLASSES:
            if qualname == self.omitir:
                continue
            origem = self.origem_falsa if qualname == "ResponseOutputText" and self.origem_falsa else modulo
            setattr(sys.modules[modulo], qualname, type(qualname, (), {"__module__": origem}))
        return self

    def __exit__(self, *exc):
        import sys

        for nome, antigo in self._antes.items():
            if antigo is None:
                sys.modules.pop(nome, None)
            else:
                sys.modules[nome] = antigo
        return False


def _resolver():
    from creditum_hermes_reasoning.codex import resolve_production_governed_response_types

    return resolve_production_governed_response_types()


class ProcedenciaDeVersaoDoSdk(unittest.TestCase):
    def test_G1_versao_exata_emite_os_tipos(self) -> None:
        # Controle POSITIVO. Sem ele, um resolvedor que recusasse tudo passaria em
        # G2–G7 parecendo rigoroso.
        with _SdkSintetico(versao="2.24.0"):
            t = _resolver()
        self.assertIs(type(t), GovernedResponseTypes)
        self.assertEqual(t.response.__name__, "Response")
        self.assertEqual(t.compaction_item.__name__, "ResponseCompactionItem")

    def test_G2_versao_ERRADA_recusa(self) -> None:
        for v in ("2.23.9", "2.24.1", "3.0.0", "2.24", "2.24.0 ", "", "v2.24.0"):
            with self.subTest(v):
                with _SdkSintetico(versao=v):
                    with self.assertRaises(CodexRefusal) as ctx:
                        _resolver()
                self.assertEqual(ctx.exception.defect, CodexDefect.SDK_VERSION_NOT_APPROVED)

    def test_G3_versao_AUSENTE_recusa(self) -> None:
        with _SdkSintetico(sem_versao=True):
            with self.assertRaises(CodexRefusal) as ctx:
                _resolver()
        self.assertEqual(ctx.exception.defect, CodexDefect.SDK_VERSION_NOT_APPROVED)

    def test_G4_versao_de_tipo_errado_recusa(self) -> None:
        for v in (None, 22400, ("2", "24", "0"), b"2.24.0"):
            with self.subTest(type(v).__name__):
                with _SdkSintetico(versao=v):
                    with self.assertRaises(CodexRefusal) as ctx:
                        _resolver()
                self.assertEqual(ctx.exception.defect, CodexDefect.SDK_VERSION_NOT_APPROVED)

    def test_G5_MESMOS_tipos_com_versao_errada_recusa(self) -> None:
        # O achado do Codex, literal: todas as seis classes presentes, com os nomes
        # exatos, e mesmo assim sem autoridade — porque a versão não bate.
        with _SdkSintetico(versao="2.23.0"):
            with self.assertRaises(CodexRefusal) as ctx:
                _resolver()
        self.assertEqual(ctx.exception.defect, CodexDefect.SDK_VERSION_NOT_APPROVED)

    def test_G6_versao_certa_com_tipo_AUSENTE_recusa(self) -> None:
        # Versão não substitui procedência de classe.
        with _SdkSintetico(versao="2.24.0", omitir="ResponseCompactionItem"):
            with self.assertRaises(CodexRefusal) as ctx:
                _resolver()
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE)
        self.assertEqual(ctx.exception.detail, "ausente:compaction_item")

    def test_G7_versao_certa_com_classe_de_OUTRA_origem_recusa(self) -> None:
        # Classe alcançável pelo nome certo, mas definida em outro módulo.
        with _SdkSintetico(versao="2.24.0", origem_falsa="pacote_do_atacante"):
            with self.assertRaises(CodexRefusal) as ctx:
                _resolver()
        self.assertEqual(ctx.exception.defect, CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE)
        self.assertEqual(ctx.exception.detail, "origem:output_text")

    def test_G8_a_versao_observada_NAO_entra_no_defeito(self) -> None:
        # `__version__` é texto de terceiro. O código fixo basta.
        marcador = "2.24.0-" + SEGREDO_NA_RECUSA
        with _SdkSintetico(versao=marcador):
            with self.assertRaises(CodexRefusal) as ctx:
                _resolver()
        render = f"{str(ctx.exception)} {ctx.exception.args!r} {ctx.exception.detail!r}"
        self.assertNotIn(SEGREDO_NA_RECUSA, render, render)
        self.assertEqual(ctx.exception.detail, "")

    def test_G9_nenhum_tipo_e_emitido_ANTES_da_prova_de_versao(self) -> None:
        # Estrutural: a comparação de versão precede, no corpo da função, qualquer
        # construção de `GovernedResponseTypes`. Um teste dinâmico mostra a recusa;
        # este mostra que não existe caminho em que o carrier nasça antes.
        import ast
        import inspect

        from creditum_hermes_reasoning.codex import resolve_production_governed_response_types

        fonte = inspect.getsource(resolve_production_governed_response_types).lstrip()
        arvore = ast.parse(fonte)
        versao = [
            n.lineno for n in ast.walk(arvore)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            and n.func.id == "sdk_version_is_approved"
        ]
        carrier = [
            n.lineno for n in ast.walk(arvore)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            and n.func.id == "GovernedResponseTypes"
        ]
        self.assertEqual(len(versao), 1, "a prova de versão não é única no resolvedor")
        self.assertEqual(len(carrier), 1, "há mais de um ponto de emissão do carrier")
        self.assertLess(versao[0], carrier[0], "o carrier pode nascer antes da prova")

    def test_G10_existe_UMA_definicao_de_versao_aprovada(self) -> None:
        # Duas comparações são duas definições de "SDK aprovado", e divergem no dia em
        # que uma for endurecida.
        import ast
        import pathlib

        from creditum_hermes_reasoning import codex as C

        raiz = pathlib.Path(C.__file__).parent
        comparacoes = []
        for py in sorted(raiz.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            for n in ast.walk(ast.parse(py.read_text(encoding="utf-8"))):
                if isinstance(n, ast.Compare) and any(
                    isinstance(c, ast.Name) and c.id == "EXPECTED_SDK_VERSION"
                    for c in [n.left, *n.comparators]
                ):
                    comparacoes.append(f"{py.name}:{n.lineno}")
        self.assertEqual(1, len(comparacoes), f"mais de uma comparação de versão: {comparacoes}")

    def test_G11_o_resolvedor_continua_com_ZERO_parametro(self) -> None:
        import inspect

        from creditum_hermes_reasoning.codex import resolve_production_governed_response_types

        self.assertEqual(
            0, len(inspect.signature(resolve_production_governed_response_types).parameters)
        )

    def test_G12_C6_R1_nao_ativa_LIVE(self) -> None:
        # Existir a política no repositório não autoriza chamada real. A barreira é
        # outra, e continua de pé.
        from creditum_hermes_reasoning.executor import (
            RESPONSE_POLICY_NOT_APPROVED,
            TrustedSdkProvider,
        )

        self.assertEqual(RESPONSE_POLICY_NOT_APPROVED, "LIVE_RESPONSE_POLICY_NOT_APPROVED")
        self.assertEqual(
            TrustedSdkProvider.__dataclass_fields__["response_policy"].default,
            RESPONSE_POLICY_NOT_APPROVED,
            "o provedor de produção deixou de nascer com a política bloqueada",
        )

    def test_G13_subclasse_de_str_com_valor_certo_e_recusada(self) -> None:
        # A mutação V4 (`isinstance` no lugar de `type(...) is str`) sobreviveu porque
        # G4 só usava não-strings. Uma subclasse de `str` pode redefinir `__eq__` e
        # responder o que quiser à comparação — e `isinstance` a deixaria entrar.
        class VersaoDerivada(str):
            def __eq__(self, outro):  # pragma: no cover - não deve decidir nada
                return True

            def __hash__(self):
                return hash(str(self))

        from creditum_hermes_reasoning.codex import sdk_version_is_approved

        self.assertFalse(sdk_version_is_approved(VersaoDerivada("qualquer coisa")))
        self.assertFalse(sdk_version_is_approved(VersaoDerivada("2.24.0")))

        with _SdkSintetico(versao=VersaoDerivada("2.24.0")):
            with self.assertRaises(CodexRefusal) as ctx:
                _resolver()
        self.assertEqual(ctx.exception.defect, CodexDefect.SDK_VERSION_NOT_APPROVED)

    def test_G14_classe_vem_da_TRAVESSIA_e_nao_de_sys_modules(self) -> None:
        # A mutação V7 (`import_module` no lugar da travessia) sobreviveu porque o SDK
        # sintético ligava `sys.modules` e a árvore de atributos ao MESMO objeto — o
        # fixture não alcançava a condição que dizia medir.
        #
        # Aqui os dois caminhos DIVERGEM: `sys.modules` aponta para um módulo hostil,
        # a árvore de atributos continua no módulo legítimo. Quem resolve por
        # `import_module` pega a classe do atacante; quem caminha a partir do `openai`
        # verificado pega a certa.
        import sys
        import types as _t

        alvo = "openai.types.responses.response"
        with _SdkSintetico(versao="2.24.0"):
            legitima = sys.modules[alvo].Response
            hostil = _t.ModuleType(alvo)
            hostil.Response = type("Response", (), {"__module__": alvo})
            anterior = sys.modules[alvo]
            sys.modules[alvo] = hostil
            try:
                t = _resolver()
            finally:
                sys.modules[alvo] = anterior

        self.assertIs(t.response, legitima, "a classe veio de sys.modules, não da travessia")
        self.assertIsNot(t.response, hostil.Response, "a classe hostil foi selada")
