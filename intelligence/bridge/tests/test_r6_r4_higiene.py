"""
FASE 3.1D-B-R6-R4 — provas do portão de higiene de saída.

Um portão que aprova o código limpo não provou nada: `def main(): return 0` também
aprovaria. Cada regra aqui é medida por MUTAÇÃO — o padrão perigoso é escrito num
pacote sintético e o portão tem de recusá-lo — e por CONTROLE POSITIVO — o padrão
seguro é escrito e o portão tem de aceitá-lo.

Sem o controle positivo, um portão que recusa tudo passaria por rigoroso.
"""

from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest

_SCRIPT = pathlib.Path(__file__).resolve().parent.parent.parent / "scripts" / "verify-output-hygiene.py"


def _carregar():
    # O portão é um script de build, não um módulo do pacote de produção: ele NÃO
    # entra no ZIP de deploy. Por isso é carregado por caminho.
    spec = importlib.util.spec_from_file_location("verify_output_hygiene", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


HIGIENE = _carregar()


class PacoteSintetico:
    """Um pacote de produção falso, para escrever código hostil sem tocar o real."""

    #: r6-r6: a identidade do módulo inclui o NOME DA RAIZ. O pacote sintético passa
    #: a se chamar como o real — senão o prefixo seria o nome do diretório temporário
    #: e nenhuma exceção casaria, fazendo os controles positivos falharem por motivo
    #: errado (e os ataques "passarem" sem provar nada).
    NOME_DO_PACOTE = "creditum_hermes_reasoning"

    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = pathlib.Path(self._tmp.name) / self.NOME_DO_PACOTE
        self.raiz.mkdir()

    def escrever(self, nome: str, corpo: str) -> pathlib.Path:
        caminho = self.raiz / nome
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(corpo, encoding="utf-8")
        return caminho

    def auditar(self):
        return HIGIENE.auditar(self.raiz)[0]

    def regras(self) -> set[str]:
        return {a.regra for a in self.auditar()}

    def fechar(self) -> None:
        self._tmp.cleanup()


CABECALHO = (
    "from .runtime import safe_exception_type, safe_type_name, safe_label\n"
    "from .probe import PrecallRefusalReport, serialize_safe_public_report\n\n\n"
)


class TestMutacoesEstaticas(unittest.TestCase):
    """Cada mutação escreve UM padrão perigoso. O portão tem de nomear a regra."""

    def setUp(self) -> None:
        self.pkg = PacoteSintetico()
        self.addCleanup(self.pkg.fechar)

    def _mutar(self, corpo: str, regra: str) -> None:
        self.pkg.escrever("mutante.py", CABECALHO + corpo)
        regras = self.pkg.regras()
        self.assertIn(
            regra,
            regras,
            f"o portão NÃO viu {regra}; viu {sorted(regras) or 'nada'}\ncorpo:\n{corpo}",
        )

    def test_A_str_de_excecao(self) -> None:
        self._mutar(
            "def f(exc):\n    raise RuntimeError(str(exc))\n",
            "OH001",
        )

    def test_B_repr_de_excecao(self) -> None:
        self._mutar(
            "def f(exc):\n    raise RuntimeError(repr(exc))\n",
            "OH002",
        )

    def test_C_args_de_excecao_capturada(self) -> None:
        self._mutar(
            "def f():\n"
            "    try:\n"
            "        pass\n"
            "    except Exception as causa:\n"
            "        raise RuntimeError(causa.args[0]) from None\n",
            "OH003",
        )

    def test_D_nome_de_tipo_cru(self) -> None:
        self._mutar(
            "def f(exc):\n    return type(exc).__name__\n",
            "OH004",
        )

    def test_E_nome_de_tipo_por_dunder_class(self) -> None:
        # A mesma leitura escrita pela outra rota. Se o portão só conhecesse
        # `type(x).__name__`, esta linha atravessaria.
        self._mutar(
            "def f(exc):\n    return exc.__class__.__name__\n",
            "OH004",
        )

    def test_F_conversao_repr_em_fstring(self) -> None:
        self._mutar(
            "def f(exc):\n    return f'falhou: {exc!r}'\n",
            "OH005",
        )

    def test_G_conversao_str_em_fstring(self) -> None:
        # `!s` executa `__str__` do objeto tanto quanto `!r` executa `__repr__`.
        self._mutar(
            "def f(exc):\n    return f'falhou: {exc!s}'\n",
            "OH005",
        )

    def test_H_conversao_ascii_em_fstring(self) -> None:
        self._mutar(
            "def f(exc):\n    return f'falhou: {exc!a}'\n",
            "OH005",
        )

    def test_I_format_como_desvio(self) -> None:
        # `.format` é a rota de fuga óbvia para quem só vê f-strings barradas.
        self._mutar(
            "def f(exc):\n    return 'falhou: {}'.format(exc)\n",
            "OH006",
        )

    def test_J_porcento_como_desvio(self) -> None:
        self._mutar(
            "def f(exc):\n    return 'falhou: %s' % (exc,)\n",
            "OH006",
        )

    def test_K_serializacao_de_objeto_arbitrario(self) -> None:
        # Um DTO fechado é aceito; `json.dumps(objeto)` não.
        self._mutar(
            "import json\n\n\ndef f(binding):\n    print(json.dumps(binding))\n",
            "OH007",
        )


class TestControlePositivo(unittest.TestCase):
    """
    O portão tem de ACEITAR o padrão governado.

    Sem isto, um `return 1` incondicional passaria por todas as mutações acima.
    """

    def setUp(self) -> None:
        self.pkg = PacoteSintetico()
        self.addCleanup(self.pkg.fechar)

    def _limpo(self, corpo: str) -> None:
        self.pkg.escrever("limpo.py", CABECALHO + corpo)
        achados = self.pkg.auditar()
        self.assertEqual(
            [], achados, "o portão recusou código GOVERNADO:\n" + "\n".join(str(a) for a in achados)
        )

    def test_L_safe_exception_type_atravessa(self) -> None:
        self._limpo(
            "def f():\n"
            "    try:\n"
            "        pass\n"
            "    except Exception as causa:\n"
            "        tipo = safe_exception_type(causa)\n"
            "        raise RuntimeError(tipo) from None\n"
        )

    def test_M_safe_type_name_atravessa(self) -> None:
        self._limpo("def f(valor):\n    return f'tipo: {safe_type_name(valor)}'\n")

    def test_N_safe_label_atravessa(self) -> None:
        self._limpo("def f(valor):\n    return safe_label(valor, ('aprovado',))\n")

    def test_O_fstring_de_constante_propria_atravessa(self) -> None:
        self._limpo("APROVADO = 'openai-codex'\n\n\ndef f():\n    return f'provider {APROVADO}'\n")

    def test_P_a_fronteira_governada_atravessa(self) -> None:
        # r6-r5: antes este teste afirmava que `json.dumps(dto.to_public_dict())` num
        # ponto qualquer passava. Ele CODIFICAVA a política vulnerável — o Codex
        # mostrou que a mesma forma aceita `json.dumps({"detail": binding})`.
        # O controle positivo agora é a chamada à fronteira, não a serialização solta.
        self._limpo(
            "def f(relatorio):\n    print(serialize_safe_public_report(relatorio))\n"
        )

    def test_Q_relatorio_de_constantes_pela_fronteira(self) -> None:
        # Um relatório só de constantes continua tendo de atravessar a fronteira.
        # Ser inofensivo não é ser conferido.
        self._limpo(
            "def f():\n"
            "    print(serialize_safe_public_report(PrecallRefusalReport(verdict='PRECALL_OK')))\n"
        )


class TestNaoDependeDeListaDeArquivos(unittest.TestCase):
    """
    O arquivo que alguém acrescentar amanhã é justamente o que ninguém revisa com o
    mesmo cuidado. Um portão preso a uma lista fixa cobre exatamente o passado.
    """

    def setUp(self) -> None:
        self.pkg = PacoteSintetico()
        self.addCleanup(self.pkg.fechar)

    def test_R_modulo_novo_com_sink_inseguro_e_pego(self) -> None:
        self.pkg.escrever("__init__.py", "")
        self.pkg.escrever("runtime.py", "def safe_exception_type(exc):\n    return 'Exception'\n")
        # Um módulo que não existia quando o portão foi escrito.
        self.pkg.escrever(
            "telemetria_nova.py", "def emitir(exc):\n    print(f'erro: {exc!r}')\n"
        )
        self.assertIn("OH005", self.pkg.regras())

    def test_S_submodulo_aninhado_e_pego(self) -> None:
        # rglob, não glob: um pacote-filho não é um esconderijo.
        self.pkg.escrever("sub/__init__.py", "")
        self.pkg.escrever("sub/fundo.py", "def f(exc):\n    return str(exc)\n")
        self.assertIn("OH001", self.pkg.regras())

    def test_T_enumeracao_cobre_o_pacote_real(self) -> None:
        modulos = HIGIENE.modulos_de_producao()
        nomes = {p.name for p in modulos}
        # Os módulos de produção que já tiveram achado desta família precisam estar
        # no conjunto auditado. Se algum sair da varredura, este teste cai.
        for esperado in ("runtime.py", "__main__.py", "executor.py", "codex.py", "probe.py"):
            self.assertIn(esperado, nomes, f"{esperado} fora da varredura do portão")
        self.assertFalse(
            [p for p in modulos if "__pycache__" in p.parts], "bytecode entrou na varredura"
        )
        self.assertFalse(
            [p for p in modulos if "test" in p.name], "arquivo de teste entrou na varredura"
        )


class TestAchadosHistoricos(unittest.TestCase):
    """
    A prova que mais importa: o portão pega os padrões que JÁ passaram.

    Quatro HIGHs seguidos foram a mesma classe. Cada um é reintroduzido no arquivo
    real (numa cópia) e o portão tem de recusá-lo. Se um dia um destes voltar VIVO,
    o portão regrediu e este teste cai antes do Codex ter de achar de novo.

    O alvo é o TEXTO real do arquivo, e a ausência do alvo FALHA o teste — uma
    mutação que não alcança a condição passa parecendo prova.
    """

    HISTORICOS = (
        ("R6-R1 resolver usa mensagem de terceiro", "runtime.py",
         "tipo = safe_exception_type(causa)", "tipo = str(causa)", "OH001"),
        ("R6-R2 CLI emite nome de tipo cru", "__main__.py",
         "safe_exception_type(causa)", "type(causa).__name__", "OH004"),
        ("R6-R3 import do SDK sem sanitizador", "executor.py",
         'f"openai:{tipo}"', 'f"openai:{causa!r}"', "OH005"),
        ("R6-R1b campo do relatorio coagido", "__main__.py",
         "sdk_version=PRODUCTION_SDK_VERSION", "sdk_version=str(provedor.version)", "OH001"),
        ("chamada ao provedor sem sanitizador", "executor.py",
         "raise ExecutorRefusal(ExecutorDefect.PROVIDER_CALL_FAILED, tipo) from None",
         "raise ExecutorRefusal(ExecutorDefect.PROVIDER_CALL_FAILED, causa.args[0]) from None",
         "OH003"),
    )

    def test_W_cada_high_historico_morre(self) -> None:
        import shutil

        for rotulo, arquivo, alvo, veneno, regra in self.HISTORICOS:
            with self.subTest(rotulo):
                base = pathlib.Path(tempfile.mkdtemp())
                self.addCleanup(shutil.rmtree, base, True)
                copia = base / "pkg"
                shutil.copytree(HIGIENE.PACOTE, copia)
                caminho = copia / arquivo
                fonte = caminho.read_text(encoding="utf-8")
                self.assertIn(
                    alvo,
                    fonte,
                    f"mutação MAL APONTADA: o alvo saiu de {arquivo}. "
                    "Reaponte-a — uma mutação que não alcança a condição passa "
                    "parecendo prova.",
                )
                caminho.write_text(fonte.replace(alvo, veneno, 1), encoding="utf-8")
                regras = {a.regra for a in HIGIENE.auditar(copia)[0]}
                self.assertIn(
                    regra,
                    regras,
                    f"o HIGH histórico voltou VIVO: {rotulo}; portão viu {sorted(regras) or 'nada'}",
                )


class TestPortaoRealLimpo(unittest.TestCase):
    def test_U_pacote_de_producao_esta_limpo(self) -> None:
        achados, arquivos = HIGIENE.auditar()
        self.assertGreaterEqual(len(arquivos), 5, "varredura suspeitamente pequena")
        self.assertEqual(
            [], achados, "produção suja:\n" + "\n".join(str(a) for a in achados)
        )

    def test_V_achado_nao_ecoa_o_material_suspeito(self) -> None:
        # Um portão de higiene de saída que imprime o literal ofensivo cria o
        # problema que existe para impedir.
        pkg = PacoteSintetico()
        self.addCleanup(pkg.fechar)
        pkg.escrever(
            "vazando.py",
            "MARCADOR = 'test-secret-never-log'\n\n\ndef f(exc):\n"
            "    return f'{MARCADOR}: {exc!r}'\n",
        )
        texto = "\n".join(str(a) for a in pkg.auditar())
        self.assertIn("OH005", texto)
        self.assertNotIn("test-secret-never-log", texto)


if __name__ == "__main__":
    unittest.main()


# ═══════════════════════════════════════════════════════════════════════════════
# R6-R5 — OS DOIS HIGH DA R6-R4: CONFIANÇA POR GRAFIA E POR CONTAINER
#
# Codex HIGH 1: `str(qualquer.resolve())` passava porque o método se chamava
#               `resolve`. O objeto era de terceiro e o `__str__` executado era o dele.
# Codex HIGH 2: `json.dumps({"detail": binding})` passava porque o argumento era um
#               `ast.Dict`. Um container não é uma garantia.
#
# Os dois compartilhavam a raiz: eu concedia confiança pela FORMA do código em vez da
# PROCEDÊNCIA do valor. Uma forma qualquer um escreve.
# ═══════════════════════════════════════════════════════════════════════════════


class TestGrafiaNaoConcedeConfianca(unittest.TestCase):
    def setUp(self) -> None:
        self.pkg = PacoteSintetico()
        self.addCleanup(self.pkg.fechar)

    def _recusa(self, corpo: str, regra: str) -> None:
        self.pkg.escrever("ataque.py", CABECALHO + corpo)
        regras = self.pkg.regras()
        self.assertIn(regra, regras, f"ATRAVESSOU: {corpo!s}\nportão viu {sorted(regras) or 'nada'}")

    def test_X1_resolve_de_objeto_de_terceiro(self) -> None:
        # O ataque literal do Codex.
        self._recusa(
            "class Atacante:\n"
            "    def resolve(self):\n"
            "        return Veneno()\n\n\n"
            "def f(atacante):\n"
            "    print(str(atacante.resolve()))\n",
            "OH001",
        )

    def test_X2_uuid4_local_definido_pelo_atacante(self) -> None:
        self._recusa(
            "def uuid4():\n"
            "    return Veneno()\n\n\n"
            "def f():\n"
            "    print(str(uuid4()))\n",
            "OH001",
        )

    def test_X3_uuid4_por_alias(self) -> None:
        self._recusa(
            "fake_uuid4 = fabrica_do_atacante\n\n\n"
            "def f():\n"
            "    print(str(fake_uuid4()))\n",
            "OH001",
        )

    def test_X4_resolve_qualificado_tambem_nao_e_isento(self) -> None:
        # Nem a forma "legítima" atravessa mais: a isenção não existe, e o código de
        # produção foi mudado para não precisar dela.
        self._recusa("import pathlib\n\n\ndef f(c):\n    return str(pathlib.Path(c).resolve())\n", "OH001")

    def test_X5_conversor_governado_atravessa(self) -> None:
        # Controle POSITIVO. Sem ele, um portão que recusa todo `str()` passaria nos
        # quatro ataques acima parecendo rigoroso.
        self.pkg.escrever("__init__.py", "")
        self.pkg.escrever(
            "session.py",
            "import uuid\n\n\n"
            "def governed_uuid_text(valor):\n"
            "    if type(valor) is not uuid.UUID:\n"
            "        raise SessionRefusal('SESSION_ID_NOT_GOVERNED')\n"
            "    return str(valor)\n",
        )
        self.assertEqual([], self.pkg.auditar(), "o conversor governado foi recusado")


class TestContainerNaoConcedeConfianca(unittest.TestCase):
    def setUp(self) -> None:
        self.pkg = PacoteSintetico()
        self.addCleanup(self.pkg.fechar)

    def _recusa_dumps(self, expressao: str) -> None:
        self.pkg.escrever(
            "ataque.py", "import json\n\n\ndef f(binding, exception, resolved, config,\n"
            "      client, response, provider_output, payload):\n"
            f"    print({expressao})\n"
        )
        regras = self.pkg.regras()
        self.assertIn("OH007", regras, f"ATRAVESSOU: {expressao}\nviu {sorted(regras) or 'nada'}")

    def test_Y1_binding_no_dicionario(self) -> None:
        self._recusa_dumps('json.dumps({"detail": binding})')

    def test_Y2_excecao_no_dicionario(self) -> None:
        self._recusa_dumps('json.dumps({"error": exception})')

    def test_Y3_resultado_do_resolvedor(self) -> None:
        self._recusa_dumps('json.dumps({"runtime": resolved})')

    def test_Y4_config(self) -> None:
        self._recusa_dumps('json.dumps({"config": config})')

    def test_Y5_cliente_resposta_provedor(self) -> None:
        for e in ('json.dumps({"client": client})',
                  'json.dumps({"response": response})',
                  'json.dumps({"provider": provider_output})'):
            with self.subTest(e):
                pkg = PacoteSintetico()
                self.addCleanup(pkg.fechar)
                pkg.escrever(
                    "ataque.py",
                    "import json\n\n\ndef f(client, response, provider_output):\n"
                    f"    print({e})\n",
                )
                self.assertIn("OH007", pkg.regras(), f"ATRAVESSOU: {e}")

    def test_Y6_aninhado(self) -> None:
        self._recusa_dumps('json.dumps({"safe": {"nested": binding}})')

    def test_Y7_lista_e_tupla(self) -> None:
        self._recusa_dumps('json.dumps({"itens": [binding]})')

    def test_Y8_variavel_intermediaria(self) -> None:
        # O padrão ordinário — e o que derrotava um scanner que só olhava o literal.
        self.pkg.escrever(
            "ataque.py",
            "import json\n\n\ndef f(binding):\n"
            '    payload = {"detail": binding}\n'
            "    print(json.dumps(payload))\n",
        )
        self.assertIn("OH007", self.pkg.regras())

    def test_Y9_dicionario_so_de_constantes_TAMBEM_recusado(self) -> None:
        # Nem o caso inocente atravessa. A regra deixou de olhar o argumento: quem
        # serializa é a fronteira governada, e ninguém mais.
        self.pkg.escrever(
            "ataque.py", 'import json\n\n\ndef f():\n    print(json.dumps({"verdict": "OK"}))\n'
        )
        self.assertIn("OH007", self.pkg.regras())

    def test_Y10_serializador_governado_atravessa(self) -> None:
        # Controle POSITIVO: a fronteira nomeada pode chamar `json.dumps`.
        self.pkg.escrever("__init__.py", "")
        self.pkg.escrever(
            "probe.py",
            "import json\n\n\ndef serialize_safe_public_report(relatorio):\n"
            "    if type(relatorio) not in GOVERNED_PUBLIC_REPORTS:\n"
            "        raise PublicReportRefusal('PUBLIC_REPORT_TYPE_NOT_GOVERNED')\n"
            "    return json.dumps(relatorio.to_public_dict(), ensure_ascii=False, indent=2)\n",
        )
        self.assertEqual([], self.pkg.auditar(), "o serializador governado foi recusado")

    def test_Y11_serializador_com_outro_nome_nao_atravessa(self) -> None:
        # A autoridade é (módulo, função), não a intenção declarada no nome.
        self.pkg.escrever("__init__.py", "")
        self.pkg.escrever(
            "probe.py",
            "import json\n\n\ndef serialize_safe_public_report_v2(relatorio):\n"
            "    return json.dumps(relatorio)\n",
        )
        self.assertIn("OH007", self.pkg.regras())


# ═══════════════════════════════════════════════════════════════════════════════
# R6-R5 — A FRONTEIRA EM RUNTIME
#
# O portão é sintático: ele garante que só `serialize_safe_public_report` chama
# `json.dumps`. Ele NÃO sabe o que há dentro do relatório — é o runtime que sabe.
#
# Sem estes testes, a proteção seria metade de um mecanismo descrita como inteira.
# ═══════════════════════════════════════════════════════════════════════════════

from creditum_hermes_reasoning.probe import (  # noqa: E402
    PrecallRefusalReport,
    PublicReportRefusal,
    serialize_safe_public_report,
)


class ObjetoComSegredoNoStr:
    """Como um vínculo/config/resposta se comporta se alguém o serializar."""

    def __str__(self) -> str:  # pragma: no cover - não deve ser chamado
        raise AssertionError("__str__ do material bruto foi executado")

    def __repr__(self) -> str:  # pragma: no cover - não deve ser chamado
        raise AssertionError("__repr__ do material bruto foi executado")


def _recusa_de_refusal() -> PrecallRefusalReport:
    return PrecallRefusalReport(
        runtime_id="creditum_hermes_reasoning_runtime/v1",
        runtime_version="1.0.0",
        mode="PRECALL_PROBE",
        executor="CreditumCodexReasoningExecutor",
        verdict="PRECALL_OK",
        aiagent_used=False,
        sdk_call_attempted=False,
        provider_call_count=0,
    )


class FronteiraDeSerializacaoEmRuntime(unittest.TestCase):
    def test_Z1_tipo_nao_governado_e_recusado(self) -> None:
        for bruto in ({"detail": "x"}, ObjetoComSegredoNoStr(), "texto", 7, None, [1]):
            with self.subTest(type(bruto).__name__):
                with self.assertRaises(PublicReportRefusal) as ctx:
                    serialize_safe_public_report(bruto)
                self.assertEqual(ctx.exception.defect, "PUBLIC_REPORT_TYPE_NOT_GOVERNED")

    def test_Z2_valor_bruto_num_campo_e_recusado_ANTES_de_serializar(self) -> None:
        # `ObjetoComSegredoNoStr` estoura se alguém o converter. O teste passar prova
        # que a recusa veio ANTES da conversão — serializar e depois olhar não seria
        # conferência, porque `json.dumps` já teria executado o `default`/`__str__`.
        envenenado = PrecallRefusalReport(
            runtime_id="creditum_hermes_reasoning_runtime/v1",
            runtime_version="1.0.0",
            mode="PRECALL_PROBE",
            executor="CreditumCodexReasoningExecutor",
            verdict=ObjetoComSegredoNoStr(),
            aiagent_used=False,
            sdk_call_attempted=False,
            provider_call_count=0,
        )
        with self.assertRaises(PublicReportRefusal) as ctx:
            serialize_safe_public_report(envenenado)
        self.assertEqual(ctx.exception.defect, "PUBLIC_REPORT_VALUE_NOT_GOVERNED")

    def test_Z3_aninhado_e_recusado(self) -> None:
        for aninhado in ({"nested": "x"}, ["x"], ("x",), {"a": {"b": "c"}}):
            with self.subTest(type(aninhado).__name__):
                r = PrecallRefusalReport(
                    runtime_id="r", runtime_version="1", mode="m", executor="e",
                    verdict=aninhado, aiagent_used=False, sdk_call_attempted=False,
                    provider_call_count=0,
                )
                with self.assertRaises(PublicReportRefusal):
                    serialize_safe_public_report(r)

    def test_Z4_subclasse_de_str_nao_herda_a_permissao(self) -> None:
        # `isinstance` deixaria passar; `type(...) in` não. Uma subclasse de `str`
        # pode redefinir `__str__` e herdaria a permissão sem herdar a intenção.
        class TextoTraicoeiro(str):
            pass

        r = PrecallRefusalReport(
            runtime_id="r", runtime_version="1", mode="m", executor="e",
            verdict=TextoTraicoeiro("PRECALL_OK"), aiagent_used=False,
            sdk_call_attempted=False, provider_call_count=0,
        )
        with self.assertRaises(PublicReportRefusal):
            serialize_safe_public_report(r)

    def test_Z5_relatorio_valido_serializa(self) -> None:
        # Controle POSITIVO. Sem ele, uma fronteira que recusasse tudo passaria em
        # Z1–Z4 parecendo rigorosa.
        texto = serialize_safe_public_report(_recusa_de_refusal())
        self.assertIn('"verdict": "PRECALL_OK"', texto)
        self.assertIn('"provider_call_count": 0', texto)

    def test_Z6_o_probe_report_real_tambem_atravessa(self) -> None:
        from creditum_hermes_reasoning.probe import PrecallProbeReport

        campos = {c: "x" for c in PrecallProbeReport.__dataclass_fields__}
        for nome, campo in PrecallProbeReport.__dataclass_fields__.items():
            campos[nome] = {"str": "x", "bool": False, "int": 0}[campo.type]
        texto = serialize_safe_public_report(PrecallProbeReport(**campos))
        self.assertTrue(texto.startswith("{"))


class ConversaoDeUuidGovernada(unittest.TestCase):
    """
    A r6-r4 isentava `str(uuid4())` pela GRAFIA do nome. Agora a permissão vem de
    `type(valor) is uuid.UUID`, e uma fronteira sem teste seria a lacuna D8 de novo.
    """

    def test_Z7_uuid_real_converte_no_formato_governado(self) -> None:
        import uuid as uuid_mod

        from creditum_hermes_reasoning.session import governed_uuid_text

        texto = governed_uuid_text(uuid_mod.uuid4())
        # 36 caracteres hifenizados: o formato É governado — há teste que o afirma —
        # e por isso `.hex` não servia como saída desta função.
        self.assertEqual(len(texto), 36)
        self.assertEqual(texto.count("-"), 4)

    def test_Z8_objeto_de_terceiro_com_str_hostil_e_recusado(self) -> None:
        from creditum_hermes_reasoning.session import SessionRefusal, governed_uuid_text

        class UuidFalso:
            def __str__(self) -> str:  # pragma: no cover - não deve ser chamado
                raise AssertionError("__str__ do impostor foi executado")

        with self.assertRaises(SessionRefusal) as ctx:
            governed_uuid_text(UuidFalso())
        self.assertEqual(ctx.exception.defect, "SESSION_ID_NOT_GOVERNED")

    def test_Z9_subclasse_de_UUID_nao_herda_a_permissao(self) -> None:
        import uuid as uuid_mod

        from creditum_hermes_reasoning.session import SessionRefusal, governed_uuid_text

        class UuidDerivado(uuid_mod.UUID):
            def __str__(self) -> str:  # pragma: no cover - não deve ser chamado
                raise AssertionError("__str__ da subclasse foi executado")

        with self.assertRaises(SessionRefusal):
            governed_uuid_text(UuidDerivado(int=1))


# ═══════════════════════════════════════════════════════════════════════════════
# R6-R6 — IDENTIDADE, NÃO NOME
#
# Codex HIGH: o portão identificava o módulo por `Path.stem`. Então `probe.py` e
# `anything/probe.py` eram os DOIS `"probe"`, e um módulo aninhado com o basename
# certo herdava a autoridade do serializador real.
#
# Terceiro eixo do MESMO defeito: r6-r5 era autoridade por grafia de método e por
# forma de container; esta é autoridade por nome curto de arquivo. Toda vez que eu
# aceitei um NOME no lugar de uma IDENTIDADE, alguém pôde escolher o nome.
# ═══════════════════════════════════════════════════════════════════════════════

_RAIZ = "creditum_hermes_reasoning"


class IdentidadeDeModulo(unittest.TestCase):
    """A função de identidade, medida direto. Sem ela, as colisões abaixo não têm base."""

    CASOS = (
        ("probe.py", f"{_RAIZ}.probe"),
        ("foo/probe.py", f"{_RAIZ}.foo.probe"),
        ("foo/bar.py", f"{_RAIZ}.foo.bar"),
        ("a/b/c/probe.py", f"{_RAIZ}.a.b.c.probe"),
        ("__init__.py", _RAIZ),
        ("foo/__init__.py", f"{_RAIZ}.foo"),
    )

    def test_ID1_cada_caminho_tem_identidade_esperada(self) -> None:
        raiz = pathlib.Path("/qualquer") / _RAIZ
        for rel, esperado in self.CASOS:
            with self.subTest(rel):
                self.assertEqual(HIGIENE.module_identity(raiz, raiz / rel), esperado)

    def test_ID2_nenhuma_identidade_colide(self) -> None:
        raiz = pathlib.Path("/qualquer") / _RAIZ
        ids = [HIGIENE.module_identity(raiz, raiz / rel) for rel, _ in self.CASOS]
        self.assertEqual(len(ids), len(set(ids)), f"identidades colidiram: {ids}")

    def test_ID3_fora_do_pacote_falha_fechado(self) -> None:
        raiz = pathlib.Path("/qualquer") / _RAIZ
        for fora in ("/outro/probe.py", "/qualquer/probe.py"):
            with self.subTest(fora):
                self.assertEqual(
                    HIGIENE.module_identity(raiz, pathlib.Path(fora)),
                    HIGIENE.IDENTIDADE_INDETERMINADA,
                )

    def test_ID4_identidade_indeterminada_nao_casa_com_exceção_alguma(self) -> None:
        ind = HIGIENE.IDENTIDADE_INDETERMINADA
        for allowlist in (HIGIENE.CONVERSORES_GOVERNADOS, HIGIENE.SERIALIZADORES_GOVERNADOS):
            for modulo, _ in allowlist:
                self.assertNotEqual(modulo, ind)

    def test_ID5_o_probe_real_tem_a_identidade_da_allowlist(self) -> None:
        # Fecha o laço: a identidade calculada para o arquivo REAL é exatamente a
        # chave da allowlist. Sem isto, a allowlist poderia estar certa e inútil.
        real = HIGIENE.PACOTE / "probe.py"
        self.assertTrue(real.exists())
        self.assertEqual(
            HIGIENE.module_identity(HIGIENE.PACOTE, real), f"{_RAIZ}.probe"
        )

    def test_ID6_o_portao_nao_usa_stem_para_autorizar(self) -> None:
        # `.stem`/`.name` podem existir na DESCOBERTA; não numa decisão de confiança.
        fonte = pathlib.Path(HIGIENE.__file__).read_text(encoding="utf-8")
        corpo = fonte[fonte.index("def module_identity") :]
        self.assertNotIn("caminho.stem", corpo, "stem voltou a decidir identidade")


class ColisaoDeNomeDeModulo(unittest.TestCase):
    """
    A matriz que o Codex exigiu: para cada módulo com exceção, um aninhado com o
    MESMO basename e a MESMA função tenta herdar a autoridade.
    """

    #: (basename, função governada, construto normalmente isento, regra esperada)
    MATRIZ = (
        ("probe", "serialize_safe_public_report", "return json.dumps(binding)", "OH007"),
        ("codex", "governed_user_payload", "return json.dumps(binding)", "OH007"),
        ("codex", "request_fingerprint", "return json.dumps(binding)", "OH007"),
        ("contract", "_material", "return json.dumps(binding)", "OH007"),
        ("runtime", "safe_type_name", "return str(valor)", "OH001"),
        ("runtime", "safe_exception_type", "return str(exc)", "OH001"),
        ("session", "governed_uuid_text", "return str(valor)", "OH001"),
    )

    def _monta(self, pkg, subdir: str, basename: str, funcao: str, corpo: str) -> None:
        pkg.escrever("__init__.py", "")
        if subdir:
            pkg.escrever(f"{subdir}/__init__.py", "")
        alvo = f"{subdir}/{basename}.py" if subdir else f"{basename}.py"
        pkg.escrever(alvo, f"import json\n\n\ndef {funcao}(binding, valor, exc):\n    {corpo}\n")

    def test_C1_aninhado_com_mesmo_basename_e_mesma_funcao_e_RECUSADO(self) -> None:
        for basename, funcao, corpo, regra in self.MATRIZ:
            with self.subTest(f"{basename}.{funcao}"):
                pkg = PacoteSintetico()
                self.addCleanup(pkg.fechar)
                self._monta(pkg, "anything", basename, funcao, corpo)
                regras = pkg.regras()
                self.assertIn(
                    regra, regras,
                    f"anything/{basename}.py::{funcao} HERDOU autoridade; viu {sorted(regras) or 'nada'}",
                )

    def test_C2_o_modulo_de_TOPO_correspondente_atravessa(self) -> None:
        # Par positivo/negativo exigido: o mesmo par (basename, função) no LUGAR
        # certo passa. Sem isto, um portão que recusa tudo passaria em C1.
        for basename, funcao, corpo, _ in self.MATRIZ:
            with self.subTest(f"{basename}.{funcao}"):
                pkg = PacoteSintetico()
                self.addCleanup(pkg.fechar)
                self._monta(pkg, "", basename, funcao, corpo)
                self.assertEqual(
                    [], pkg.auditar(),
                    f"{basename}.py::{funcao} de topo foi recusado indevidamente",
                )

    def test_C3_aninhamento_PROFUNDO_e_recusado(self) -> None:
        # Prova que a identidade não é um sufixo truncado do caminho.
        pkg = PacoteSintetico()
        self.addCleanup(pkg.fechar)
        pkg.escrever("__init__.py", "")
        for d in ("a", "a/b", "a/b/c"):
            pkg.escrever(f"{d}/__init__.py", "")
        pkg.escrever(
            "a/b/c/probe.py",
            "import json\n\n\ndef serialize_safe_public_report(binding):\n"
            "    return json.dumps(binding)\n",
        )
        self.assertIn("OH007", pkg.regras())


class ColisaoLexical(unittest.TestCase):
    """
    O mesmo defeito no eixo lexical: dentro do módulo CERTO, uma função aninhada ou
    um método de classe com o nome governado não herda a autoridade.
    """

    def setUp(self) -> None:
        self.pkg = PacoteSintetico()
        self.addCleanup(self.pkg.fechar)
        self.pkg.escrever("__init__.py", "")

    def _no_probe(self, corpo: str) -> set:
        self.pkg.escrever("probe.py", "import json\n\n\n" + corpo)
        return self.pkg.regras()

    def test_L1_funcao_aninhada_com_nome_governado(self) -> None:
        regras = self._no_probe(
            "def wrapper(binding):\n"
            "    def serialize_safe_public_report(x):\n"
            "        return json.dumps(x)\n\n"
            "    return serialize_safe_public_report(binding)\n"
        )
        self.assertIn("OH007", regras, "função aninhada herdou autoridade")

    def test_L2_metodo_de_classe_com_nome_governado(self) -> None:
        regras = self._no_probe(
            "class Algo:\n"
            "    def serialize_safe_public_report(self, binding):\n"
            "        return json.dumps(binding)\n"
        )
        self.assertIn("OH007", regras, "método de classe herdou autoridade")

    def test_L3_conversor_aninhado_no_runtime(self) -> None:
        self.pkg.escrever(
            "runtime.py",
            "def wrapper():\n"
            "    def safe_type_name(valor):\n"
            "        return str(valor)\n\n"
            "    return wrapper\n",
        )
        self.assertIn("OH001", self.pkg.regras(), "conversor aninhado herdou autoridade")

    def test_L4_a_funcao_de_TOPO_continua_atravessando(self) -> None:
        # Controle positivo do eixo lexical: no topo do módulo certo, atravessa.
        self._no_probe(
            "def serialize_safe_public_report(relatorio):\n"
            "    return json.dumps(relatorio.to_public_dict())\n"
        )
        achados = self.pkg.auditar()
        self.assertEqual(
            [], achados, "a função de topo foi recusada:\n" + "\n".join(str(a) for a in achados)
        )
