"""
Fase 3.1b-r1 — a invariante de zero ferramentas, provada sem Hermes instalado.

O que é falso aqui: o construtor de agente e o leitor de definições. Nada mais.
Nenhum modelo é chamado, nenhum token é gasto, nenhum dado da Creditum existe neste
arquivo.

O que é real: toda a lógica de decisão, o veredito, a medição final e o portão do
protocolo. É onde a segurança mora.

    python3 -m unittest discover -s bridge -t bridge
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import types
import unittest

from creditum_hermes_acp.bridge import (
    JSONRPC_CAPABILITY_REFUSED,
    JSONRPC_METHOD_NOT_FOUND,
    JSONRPC_PARSE_ERROR,
    CreditumAcpBridge,
)
from creditum_hermes_acp.capability import (
    GOVERNED_ACP_PROTOCOL_VERSION,
    GOVERNED_AGENT_MODULE,
    GOVERNED_AGENT_SYMBOL,
    GOVERNED_HERMES_VERSION,
    GOVERNED_TOOL_RESOLVER_MODULE,
    GOVERNED_TOOL_RESOLVER_SYMBOL,
    HERMES_VERSION_MODULES,
    STOCK_EXPANSION_SYMBOL,
    CapabilityReport,
    CapabilityVerdict,
    allowlist_violation,
    creditum_agent_kwargs,
    creditum_disabled_toolsets,
    creditum_enabled_toolsets,
    evaluate,
    expansion_allowed,
    is_explicit_deny_all,
    merge_surfaces,
    resolve_enabled_toolsets,
    tool_names,
)
from creditum_hermes_acp.runtime import (
    discover_acp_protocol_version,
    discover_agent_factory,
    discover_hermes_version,
    discover_tool_resolver,
    preflight,
)

V_OK = GOVERNED_HERMES_VERSION
P_OK = GOVERNED_ACP_PROTOCOL_VERSION

FERRAMENTA_PERIGOSA = {"type": "function", "function": {"name": "terminal"}}
FERRAMENTA_DE_MEMORIA = {"type": "function", "function": {"name": "memory_search"}}


def modulo_falso(nome: str, **atributos: object) -> types.ModuleType:
    m = types.ModuleType(nome)
    for k, v in atributos.items():
        setattr(m, k, v)
    return m


@contextlib.contextmanager
def modulos_falsos(**modulos: types.ModuleType):
    """
    Instala módulos falsos em `sys.modules` e desfaz ao sair.

    O que é falso: os módulos do fornecedor. Nada mais. Nenhum modelo é chamado,
    nenhum token é gasto, nenhum dado da Creditum existe neste arquivo.
    """
    anteriores = {n: sys.modules.get(n) for n in modulos}
    for nome, modulo in modulos.items():
        sys.modules[nome.replace("__", ".")] = modulo
    try:
        yield
    finally:
        for nome, antigo in anteriores.items():
            chave = nome.replace("__", ".")
            if antigo is None:
                sys.modules.pop(chave, None)
            else:
                sys.modules[chave] = antigo


class AgenteFalso:
    """Modela `run_agent.AIAgent`: guarda os kwargs e expõe uma superfície."""

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self._defs: list[object] = []

    def get_tool_definitions(self) -> list[object]:
        return list(self._defs)


class VazioExplicito(unittest.TestCase):
    """§4 §29 — `None` e `[]` NÃO podem colapsar."""

    def test_none_usa_o_padrao(self) -> None:
        self.assertEqual(resolve_enabled_toolsets(None, ["hermes-acp"]), ["hermes-acp"])

    def test_vazio_permanece_vazio(self) -> None:
        # O defeito raiz: em Python, `[] or X` devolve X. A lista vazia é falsy, e a
        # negação explícita vira o seu oposto exato.
        self.assertEqual([] or ["hermes-acp"], ["hermes-acp"])
        # A correção usa `is None`, não truthiness.
        self.assertEqual(resolve_enabled_toolsets([], ["hermes-acp"]), [])

    def test_os_dois_sao_distinguiveis(self) -> None:
        self.assertFalse(is_explicit_deny_all(None))
        self.assertTrue(is_explicit_deny_all([]))
        self.assertFalse(is_explicit_deny_all(["web"]))

    def test_a_allowlist_da_creditum_e_vazia(self) -> None:
        self.assertEqual(creditum_enabled_toolsets(), [])
        self.assertTrue(is_explicit_deny_all(creditum_enabled_toolsets()))

    def test_a_allowlist_nao_e_objeto_compartilhado(self) -> None:
        # Devolver uma constante deixaria um `.append()` distraído virar concessão.
        a = creditum_enabled_toolsets()
        a.append("terminal")
        self.assertEqual(creditum_enabled_toolsets(), [])


class ExpansaoDinamica(unittest.TestCase):
    """§6 — vazio explícito é negação TOTAL. Nada é acrescentado depois."""

    def test_vazio_proibe_expansao(self) -> None:
        self.assertFalse(expansion_allowed([]))

    def test_nao_especificado_permite(self) -> None:
        # Fora do caminho seguro da Creditum, `None` mantém o comportamento do produto.
        self.assertTrue(expansion_allowed(None))

    def test_mcp_configurado_nao_muda_a_contagem_final(self) -> None:
        # §31 — a prova que importa não é sobre intenção de config: é a MEDIÇÃO.
        # Com allowlist vazia, um servidor MCP configurado não pode virar ferramenta.
        r = evaluate(V_OK, P_OK, [])
        self.assertEqual(r.verdict, CapabilityVerdict.OK)
        self.assertEqual(r.effective_model_callable_tool_count, 0)


class ListaDeNegacao(unittest.TestCase):
    """§7 — defesa em profundidade, e explicitamente NÃO a defesa."""

    def test_nomeia_o_toolset_de_fabrica_do_acp(self) -> None:
        self.assertIn("hermes-acp", creditum_disabled_toolsets())

    def test_nomeia_as_familias_de_acao_externa(self) -> None:
        negadas = creditum_disabled_toolsets()
        for t in ("terminal", "file", "browser", "web", "cronjob", "delegation"):
            self.assertIn(t, negadas)

    def test_a_negacao_nao_amplia_capacidade(self) -> None:
        # §32 — mesmo com a lista de negação vazia, a invariante primária decide.
        # Se um dia isto virar a única proteção, a proteção já falhou.
        r = evaluate(V_OK, P_OK, [])
        self.assertTrue(r.compatible)


class MedicaoFinal(unittest.TestCase):
    """§10 §11 — vale a contagem DEPOIS da inicialização, não a intenção de config."""

    def test_zero_definicoes_e_compativel(self) -> None:
        r = evaluate(V_OK, P_OK, [])
        self.assertEqual(r.verdict, CapabilityVerdict.OK)
        self.assertTrue(r.compatible)

    def test_uma_definicao_bloqueia(self) -> None:
        r = evaluate(V_OK, P_OK, [FERRAMENTA_PERIGOSA])
        self.assertEqual(r.verdict, CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY)
        self.assertFalse(r.compatible)
        self.assertEqual(r.effective_model_callable_tool_count, 1)

    def test_o_diagnostico_nomeia_as_perigosas(self) -> None:
        quinze = [
            {"type": "function", "function": {"name": n}}
            for n in (
                "terminal",
                "execute_code",
                "read_file",
                "write_file",
                "process",
                "delegate_task",
                *[f"outra_{i}" for i in range(9)],
            )
        ]
        r = evaluate(V_OK, P_OK, quinze)
        self.assertEqual(r.effective_model_callable_tool_count, 15)
        # O número sozinho não ajuda ninguém a agir. O nome ajuda.
        for perigosa in ("terminal", "execute_code", "delegate_task"):
            self.assertIn(perigosa, r.detail)

    def test_definicoes_ilegiveis_bloqueiam(self) -> None:
        # "Não sei quantas ferramentas o modelo pode chamar" é tão inaceitável quanto
        # "sei que são quinze".
        for ilegivel in (None, 42, object(), [{"sem": "nome"}], ["texto solto"]):
            with self.subTest(ilegivel=repr(ilegivel)[:30]):
                r = evaluate(V_OK, P_OK, ilegivel)  # type: ignore[arg-type]
                self.assertEqual(r.verdict, CapabilityVerdict.TOOL_SURFACE_UNKNOWN)
                self.assertFalse(r.compatible)

    def test_contagem_ausente_nao_vira_zero_no_relatorio(self) -> None:
        r = evaluate(V_OK, P_OK, None)
        publico = r.to_public_dict()
        # Campo AUSENTE. Não `0` — que é justamente o valor que queremos ver.
        self.assertNotIn("effective_model_callable_tool_count", publico)
        self.assertEqual(publico["expected_model_callable_tool_count"], 0)

    def test_nomes_saem_de_varias_formas_de_definicao(self) -> None:
        class Objeto:
            name = "web"

        self.assertEqual(
            tool_names(
                [
                    {"type": "function", "function": {"name": "a"}},
                    {"name": "b"},
                    Objeto(),
                ]
            ),
            ("a", "b", "web"),
        )


class Versao(unittest.TestCase):
    """§20 §34 — versão exata, deriva nos dois sentidos bloqueia."""

    def test_a_governada_passa(self) -> None:
        self.assertTrue(evaluate("0.20.4", P_OK, []).compatible)

    def test_anterior_e_posterior_bloqueiam(self) -> None:
        for v in ("0.20.3", "0.20.5", "0.21.0", "1.0.0", "0.20", "", None):
            with self.subTest(v=v):
                r = evaluate(v, P_OK, [])  # type: ignore[arg-type]
                self.assertEqual(r.verdict, CapabilityVerdict.HERMES_VERSION_MISMATCH)

    def test_protocolo_acp_divergente_bloqueia(self) -> None:
        for p in ("0.8.0", "0.10.0", "1.0.0", None):
            with self.subTest(p=p):
                r = evaluate(V_OK, p, [])  # type: ignore[arg-type]
                self.assertEqual(r.verdict, CapabilityVerdict.ACP_PROTOCOL_MISMATCH)

    def test_versao_e_conferida_ANTES_da_superficie(self) -> None:
        # Medir a superfície de um runtime que não é o governado responderia com
        # precisão a pergunta errada.
        r = evaluate("0.20.5", P_OK, [FERRAMENTA_PERIGOSA])
        self.assertEqual(r.verdict, CapabilityVerdict.HERMES_VERSION_MISMATCH)


class ApiObservada(unittest.TestCase):
    """
    §1-§3 §22 §23-A — a ponte se liga ao que a 3.1b-r2 OBSERVOU, não ao que a r1
    esperava.

    A r1 procurava um módulo de topo `hermes`. Ele não existe. O preflight de produção
    recusou por isso — resposta certa para expectativa errada. Estes testes existem
    para que a expectativa errada não volte.
    """

    def test_o_construtor_e_run_agent_AIAgent(self) -> None:
        self.assertEqual(GOVERNED_AGENT_MODULE, "run_agent")
        self.assertEqual(GOVERNED_AGENT_SYMBOL, "AIAgent")
        with modulos_falsos(run_agent=modulo_falso("run_agent", AIAgent=AgenteFalso)):
            fabrica, erro = discover_agent_factory()
        self.assertIs(fabrica, AgenteFalso)
        self.assertEqual(erro, "")

    def test_o_resolvedor_e_model_tools_get_tool_definitions(self) -> None:
        self.assertEqual(GOVERNED_TOOL_RESOLVER_MODULE, "model_tools")
        self.assertEqual(GOVERNED_TOOL_RESOLVER_SYMBOL, "get_tool_definitions")
        with modulos_falsos(
            model_tools=modulo_falso("model_tools", get_tool_definitions=lambda **_k: [])
        ):
            resolvedor, erro = discover_tool_resolver()
        self.assertIsNotNone(resolvedor)
        self.assertEqual(erro, "")

    def test_o_modulo_de_topo_hermes_NAO_e_mais_procurado(self) -> None:
        # MUTAÇÃO A: voltar a `import hermes`. O nome não é fonte de nada.
        self.assertNotEqual(GOVERNED_AGENT_MODULE, "hermes")
        self.assertNotIn("hermes", HERMES_VERSION_MODULES)

    def test_a_versao_NAO_vem_de_um_modulo_hermes(self) -> None:
        # Se `hermes` existisse e declarasse versão, ela ainda assim não valeria: a
        # fonte governada é metadado de distribuição ou módulo observado.
        with modulos_falsos(hermes=modulo_falso("hermes", __version__="9.9.9")):
            versao, _ = discover_hermes_version()
        self.assertNotEqual(versao, "9.9.9")

    def test_a_versao_vem_de_modulo_OBSERVADO_com_procedencia(self) -> None:
        with modulos_falsos(
            hermes_cli=modulo_falso("hermes_cli", __version__=GOVERNED_HERMES_VERSION)
        ):
            versao, fonte = discover_hermes_version()
        self.assertEqual(versao, GOVERNED_HERMES_VERSION)
        # Um número sem autor é indistinguível de um palpite. Foi um palpite de API
        # que a r2 precisou corrigir.
        self.assertEqual(fonte, "module:hermes_cli")

    def test_o_protocolo_acp_vem_de_fonte_nomeada(self) -> None:
        with modulos_falsos(
            acp=modulo_falso("acp", __version__=GOVERNED_ACP_PROTOCOL_VERSION)
        ):
            protocolo, fonte = discover_acp_protocol_version()
        self.assertEqual(protocolo, GOVERNED_ACP_PROTOCOL_VERSION)
        self.assertIn("acp", fonte)

    def test_sem_o_fornecedor_a_recusa_NOMEIA_o_que_faltou(self) -> None:
        r = preflight()
        self.assertFalse(r.compatible)
        self.assertEqual(r.verdict, CapabilityVerdict.RUNTIME_API_INCOMPATIBLE)
        # Não basta falhar: tem de dizer O QUE faltou, ou o operador investiga em vez
        # de consertar.
        self.assertNotEqual(r.detail, "")

    def test_construtor_ausente_nomeia_run_agent(self) -> None:
        fabrica, erro = discover_agent_factory()
        self.assertIsNone(fabrica)
        self.assertIn("run_agent", erro)

    def test_api_incompativel_vence_qualquer_outra_leitura(self) -> None:
        r = evaluate(V_OK, P_OK, [], api_detail="construtor não encontrado")
        self.assertEqual(r.verdict, CapabilityVerdict.RUNTIME_API_INCOMPATIBLE)


class ConstrucaoGovernada(unittest.TestCase):
    """§6 §23-B §23-C — o agente real nasce com `enabled_toolsets=[]`, explícito."""

    def test_os_kwargs_governados(self) -> None:
        k = creditum_agent_kwargs()
        self.assertEqual(k["enabled_toolsets"], [])
        self.assertIsNotNone(k["enabled_toolsets"])
        self.assertIn("hermes-acp", k["disabled_toolsets"])
        # O `_make_agent` de fábrica passa isto. Medir um agente configurado diferente
        # do que vai rodar mediria com precisão o agente errado.
        self.assertEqual(k["platform"], "acp")

    def test_o_AIAgent_real_recebe_vazio_EXPLICITO(self) -> None:
        # MUTAÇÃO B: converter [] em None antes do AIAgent.
        recebido: dict[str, object] = {}

        def fabrica(**kwargs: object) -> AgenteFalso:
            recebido.update(kwargs)
            return AgenteFalso(**kwargs)

        preflight(
            agent_factory=fabrica,
            surface_reader=lambda _a: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(recebido.get("enabled_toolsets"), [])
        self.assertIsNotNone(recebido.get("enabled_toolsets"))
        self.assertNotEqual(recebido.get("enabled_toolsets"), ["hermes-acp"])
        self.assertIn("hermes-acp", recebido.get("disabled_toolsets"))  # type: ignore[arg-type]

    def test_disabled_toolsets_é_propagado(self) -> None:
        # O ACP de fábrica NÃO passa disabled_toolsets. Por isso ele não serve.
        recebido: dict[str, object] = {}
        preflight(
            agent_factory=lambda **k: (recebido.update(k), AgenteFalso(**k))[1],
            surface_reader=lambda _a: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        negadas = recebido.get("disabled_toolsets")
        self.assertIsInstance(negadas, list)
        for familia in ("terminal", "file", "browser", "delegation"):
            self.assertIn(familia, negadas)  # type: ignore[arg-type]

    def test_o_expansor_de_fabrica_colapsa_o_vazio(self) -> None:
        # §5 — o segundo defeito de fábrica, reproduzido para ficar no registro.
        def _expand_acp_enabled_toolsets(toolsets, mcp_server_names=()):
            return list(toolsets or ["hermes-acp"])

        self.assertEqual(_expand_acp_enabled_toolsets([]), ["hermes-acp"])
        self.assertEqual(_expand_acp_enabled_toolsets(None), ["hermes-acp"])
        # A correção da Creditum não passa por ali.
        self.assertEqual(resolve_enabled_toolsets([], ["hermes-acp"]), [])

    def test_a_ponte_NUNCA_chama_o_expansor_de_fabrica(self) -> None:
        # MUTAÇÃO C: chamar `_expand_acp_enabled_toolsets([])`.
        chamadas = {"n": 0}

        def espiao(toolsets, mcp_server_names=()):
            chamadas["n"] += 1
            return list(toolsets or ["hermes-acp"])

        sessao = modulo_falso("acp_adapter.session")
        setattr(sessao, STOCK_EXPANSION_SYMBOL, espiao)
        pai = modulo_falso("acp_adapter", session=sessao, __version__=P_OK)

        with modulos_falsos(acp_adapter=pai, acp_adapter__session=sessao):
            preflight(
                agent_factory=AgenteFalso,
                surface_reader=lambda _a: [],
                hermes_version=V_OK,
            )
        self.assertEqual(chamadas["n"], 0)

    def test_o_resolvedor_e_chamado_com_allowlist_vazia(self) -> None:
        visto: dict[str, object] = {}

        def resolvedor(**kwargs: object) -> list[object]:
            visto.update(kwargs)
            return []

        preflight(
            agent_factory=AgenteFalso,
            tool_resolver=resolvedor,
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(visto.get("enabled_toolsets"), [])
        self.assertIsNotNone(visto.get("enabled_toolsets"))

    def test_construtor_que_recusa_os_kwargs_governados_falha_fechado(self) -> None:
        def fabrica_teimosa(**_kwargs: object) -> object:
            raise TypeError("enabled_toolsets não é aceito")

        r = preflight(
            agent_factory=fabrica_teimosa,
            surface_reader=lambda _a: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.verdict, CapabilityVerdict.RUNTIME_API_INCOMPATIBLE)
        # A recusa nomeia o símbolo OBSERVADO, não um genérico "construtor".
        self.assertIn("AIAgent", r.detail)
        self.assertIn("enabled_toolsets", r.detail)

    def test_stdout_do_fornecedor_nao_contamina_o_protocolo(self) -> None:
        # Um banner do fornecedor no meio das mensagens JSON-RPC seria um defeito que
        # aparece só em produção, e só às vezes.
        def fabrica_barulhenta(**k: object) -> AgenteFalso:
            print("Hermes Agent v0.20.4 — carregando perfil")
            return AgenteFalso(**k)

        capturado = io.StringIO()
        with contextlib.redirect_stdout(capturado):
            r = preflight(
                agent_factory=fabrica_barulhenta,
                surface_reader=lambda _a: [],
                hermes_version=V_OK,
                acp_protocol_version=P_OK,
            )
        self.assertEqual(capturado.getvalue(), "")
        self.assertTrue(r.compatible)


class SuperficieFinal(unittest.TestCase):
    """§11 §12 — vale o que chega ao MODELO, não o que o resolvedor devolveu."""

    def test_resolvedor_zero_e_agente_zero_e_compativel(self) -> None:
        r = preflight(
            agent_factory=AgenteFalso,
            tool_resolver=lambda **_k: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.verdict, CapabilityVerdict.OK)
        self.assertEqual(r.effective_model_callable_tool_count, 0)
        self.assertIn("agent", r.tool_surface_source)

    def test_injecao_de_MEMORIA_depois_do_resolvedor_bloqueia(self) -> None:
        # MUTAÇÃO E: contar só `get_tool_definitions([])`.
        #
        # O resolvedor diz zero e está dizendo a verdade sobre o estágio dele. A
        # memória injeta DEPOIS. Quem contasse só o resolvedor entregaria o modelo a
        # uma ferramenta com uma medição impecável do lugar errado.
        agente = AgenteFalso()
        agente._defs.append(FERRAMENTA_DE_MEMORIA)

        r = preflight(
            agent_factory=lambda **_k: agente,
            tool_resolver=lambda **_k: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.verdict, CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY)
        self.assertEqual(r.effective_model_callable_tool_count, 1)
        self.assertIn("memory_search", r.observed_tool_names)

    def test_agente_sem_superficie_legivel_e_DESCONHECIDO_nao_zero(self) -> None:
        class SemSuperficie:
            def tool_registry_v2(self) -> None:  # nome que a ponte não conhece
                return None

        r = preflight(
            agent_factory=lambda **_k: SemSuperficie(),
            tool_resolver=lambda **_k: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.verdict, CapabilityVerdict.TOOL_SURFACE_UNKNOWN)
        self.assertFalse(r.compatible)
        # Campo AUSENTE. Não `0` — que é justamente o valor que queremos ver.
        self.assertNotIn("effective_model_callable_tool_count", r.to_public_dict())
        # E o detalhe converte o bloqueio numa correção de uma rodada: diz onde
        # procurou E o que existe.
        self.assertIn("tool_definitions", r.detail)
        self.assertIn("tool_registry_v2", r.detail)

    def test_superficie_em_forma_de_registro_e_legivel(self) -> None:
        class ComRegistro:
            tools = {"terminal": object(), "web": object()}

        r = preflight(
            agent_factory=lambda **_k: ComRegistro(),
            tool_resolver=lambda **_k: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        # Tratar um registro `{nome: ferramenta}` como ilegível produziria DESCONHECIDO
        # onde a verdade era legível — falha fechada por preguiça, não por dúvida.
        self.assertEqual(r.verdict, CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY)
        self.assertEqual(r.effective_model_callable_tool_count, 2)

    def test_uniao_contamina_com_o_desconhecido(self) -> None:
        conhecida = merge_surfaces()
        self.assertFalse(conhecida.known)

    def test_a_uniao_nao_conta_a_mesma_ferramenta_duas_vezes(self) -> None:
        agente = AgenteFalso()
        agente._defs.append(FERRAMENTA_PERIGOSA)
        r = preflight(
            agent_factory=lambda **_k: agente,
            tool_resolver=lambda **_k: [FERRAMENTA_PERIGOSA],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.effective_model_callable_tool_count, 1)


class AmpliacaoTardia(unittest.TestCase):
    """§9 §10 §11 §23-D — a negação explícita tem de SOBREVIVER ao runtime."""

    def test_expansao_MCP_na_construcao_e_detectada(self) -> None:
        # MUTAÇÃO D: acrescentar `mcp-<servidor>` depois da inicialização.
        #
        # O construtor recebe a allowlist por referência. Um `.append()` lá dentro é
        # ampliação de capacidade que nenhuma leitura de configuração pegaria: o objeto
        # que inspecionamos e o objeto que o agente usa são o mesmo.
        def fabrica_que_expande(**kwargs: object) -> AgenteFalso:
            kwargs["enabled_toolsets"].append("mcp-omie")  # type: ignore[union-attr]
            return AgenteFalso(**kwargs)

        r = preflight(
            agent_factory=fabrica_que_expande,
            surface_reader=lambda _a: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.verdict, CapabilityVerdict.LATE_TOOL_INJECTION_DETECTED)
        self.assertFalse(r.compatible)
        self.assertIn("mcp-omie", r.detail)

    def test_superficie_que_muda_ENTRE_duas_leituras_bloqueia(self) -> None:
        estado = {"n": 0}

        def leitor(_agente: object) -> list[object]:
            estado["n"] += 1
            return [] if estado["n"] == 1 else [FERRAMENTA_PERIGOSA]

        r = preflight(
            agent_factory=AgenteFalso,
            surface_reader=leitor,
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        # Um estado em movimento devolve um número que já não vale quando é impresso.
        self.assertEqual(r.verdict, CapabilityVerdict.LATE_TOOL_INJECTION_DETECTED)

    def test_superficie_instavel_lida_do_agente_REAL_bloqueia(self) -> None:
        # A versão deste teste que usa a costura `surface_reader` prova a lógica de
        # comparação, mas NÃO o caminho de produção — lá a superfície é lida do
        # atributo do agente. Uma mutação na leitura real sobreviveria a ela.
        class AgenteInstavel:
            def __init__(self) -> None:
                self.n = 0

            def get_tool_definitions(self) -> list[object]:
                self.n += 1
                return [] if self.n == 1 else [FERRAMENTA_DE_MEMORIA]

        r = preflight(
            agent_factory=lambda **_k: AgenteInstavel(),
            tool_resolver=lambda **_k: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        self.assertEqual(r.verdict, CapabilityVerdict.LATE_TOOL_INJECTION_DETECTED)
        self.assertIn("memory_search", r.observed_tool_names)

    def test_o_estado_tardio_NAO_e_mapeado_para_erro_de_modelo(self) -> None:
        # §19 — nenhum modelo foi chamado. Dizer MODEL_ERROR mandaria quem investiga
        # para o lugar errado.
        self.assertIn(
            CapabilityVerdict.LATE_TOOL_INJECTION_DETECTED, CapabilityVerdict.ALL
        )
        self.assertNotIn("MODEL_ERROR", CapabilityVerdict.ALL)

    def test_allowlist_violada_e_nomeada(self) -> None:
        self.assertEqual(allowlist_violation([]), "")
        self.assertIn("None", allowlist_violation(None))
        self.assertIn("mcp-x", allowlist_violation(["mcp-x"]))


class ProcedenciaDaEvidencia(unittest.TestCase):
    """§14 §15 — de onde veio o `0.20.4` impresso no relatório."""

    def test_o_relatorio_diz_a_fonte_de_cada_versao(self) -> None:
        r = preflight(
            agent_factory=AgenteFalso,
            surface_reader=lambda _a: [],
            hermes_version=V_OK,
            acp_protocol_version=P_OK,
        )
        publico = r.to_public_dict()
        self.assertEqual(publico["hermes_version"], V_OK)
        self.assertEqual(publico["hermes_version_source"], "injected")
        self.assertEqual(publico["acp_protocol_version_source"], "injected")

    def test_versao_nao_determinavel_falha_fechado_nomeando_onde_procurou(self) -> None:
        r = preflight()
        self.assertEqual(r.verdict, CapabilityVerdict.RUNTIME_API_INCOMPATIBLE)
        self.assertIn("distribuição", r.detail)
        # E não inventa procedência para uma versão que não tem.
        self.assertNotIn("hermes_version", r.to_public_dict())


def _relatorio(verdict: str = CapabilityVerdict.OK) -> CapabilityReport:
    return CapabilityReport(
        verdict=verdict,
        hermes_version=V_OK,
        acp_protocol_version=P_OK,
        effective_model_callable_tool_count=0 if verdict == CapabilityVerdict.OK else 15,
    )


class Protocolo(unittest.TestCase):
    """§12 §36 — stdout é protocolo, stderr é log, e o portão fica antes do prompt."""

    def _ponte(self, entrada: str, relatorio: CapabilityReport | None = None):
        saida, erro = io.StringIO(), io.StringIO()
        contagem = {"preflights": 0}

        def pre() -> CapabilityReport:
            contagem["preflights"] += 1
            return relatorio if relatorio is not None else _relatorio()

        CreditumAcpBridge(
            stdin=io.StringIO(entrada), stdout=saida, stderr=erro, preflight_fn=pre
        ).serve()
        linhas = [json.loads(l) for l in saida.getvalue().splitlines() if l.strip()]
        return linhas, erro.getvalue(), contagem

    def test_initialize_compativel_nao_anuncia_ferramenta_alguma(self) -> None:
        linhas, _, _ = self._ponte('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n')
        self.assertEqual(linhas[0]["result"]["agentCapabilities"]["tools"], [])
        self.assertTrue(linhas[0]["result"]["bridge"]["capability"]["compatible"])

    def test_initialize_incompativel_recusa(self) -> None:
        linhas, log, _ = self._ponte(
            '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n',
            _relatorio(CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY),
        )
        self.assertEqual(linhas[0]["error"]["code"], JSONRPC_CAPABILITY_REFUSED)
        # Diagnóstico em stderr; stdout permanece só protocolo.
        self.assertIn("TOOL_SURFACE_NOT_EMPTY", log)

    def test_stdout_e_SO_protocolo(self) -> None:
        linhas, log, _ = self._ponte(
            '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n'
            '{"jsonrpc":"2.0","id":2,"method":"session/new"}\n',
            _relatorio(CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY),
        )
        # Toda linha de stdout parseia como JSON — nenhuma é banner humano.
        self.assertEqual(len(linhas), 2)
        for l in linhas:
            self.assertEqual(l["jsonrpc"], "2.0")
        self.assertNotEqual(log, "")

    def test_json_malformado_nao_derruba_o_processo(self) -> None:
        linhas, _, _ = self._ponte(
            "isto não é json\n" '{"jsonrpc":"2.0","id":2,"method":"initialize"}\n'
        )
        self.assertEqual(linhas[0]["error"]["code"], JSONRPC_PARSE_ERROR)
        # A mensagem seguinte é atendida normalmente. Um pedido ruim não é uma queda.
        self.assertIn("result", linhas[1])

    def test_linha_em_branco_e_EOF_sao_tolerados(self) -> None:
        linhas, _, _ = self._ponte(
            '\n\n{"jsonrpc":"2.0","id":1,"method":"initialize"}\n\n'
        )
        self.assertEqual(len(linhas), 1)

    def test_metodo_desconhecido(self) -> None:
        linhas, _, _ = self._ponte('{"jsonrpc":"2.0","id":1,"method":"hermes/yolo"}\n')
        self.assertEqual(linhas[0]["error"]["code"], JSONRPC_METHOD_NOT_FOUND)

    def test_cancel_impede_prompt_posterior(self) -> None:
        linhas, _, _ = self._ponte(
            '{"jsonrpc":"2.0","id":1,"method":"session/cancel","params":{"sessionId":"s1"}}\n'
            '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"s1"}}\n'
        )
        self.assertTrue(linhas[0]["result"]["cancelled"])
        self.assertEqual(linhas[1]["error"]["code"], JSONRPC_CAPABILITY_REFUSED)
        self.assertIn("cancelada", linhas[1]["error"]["message"])


class PortaoAntesDoPrompt(unittest.TestCase):
    """§9 §19 §35 — a recheca por prompt, contra TOCTOU."""

    def test_o_prompt_reconfere_a_capacidade(self) -> None:
        saida, erro = io.StringIO(), io.StringIO()
        chamadas = {"n": 0}

        def pre() -> CapabilityReport:
            chamadas["n"] += 1
            return _relatorio()

        CreditumAcpBridge(
            stdin=io.StringIO(
                '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n'
                '{"jsonrpc":"2.0","id":2,"method":"session/new"}\n'
                '{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"s"}}\n'
            ),
            stdout=saida,
            stderr=erro,
            preflight_fn=pre,
        ).serve()
        # Três portões, não um. Medir só na inicialização responderia sobre um estado
        # que já passou.
        self.assertEqual(chamadas["n"], 3)

    def test_superficie_que_MUDA_entre_init_e_prompt_bloqueia(self) -> None:
        saida, erro = io.StringIO(), io.StringIO()
        estado = {"n": 0}

        def pre() -> CapabilityReport:
            estado["n"] += 1
            # Limpo na inicialização; sujo quando o prompt chega.
            return _relatorio(
                CapabilityVerdict.OK
                if estado["n"] == 1
                else CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY
            )

        CreditumAcpBridge(
            stdin=io.StringIO(
                '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n'
                '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"s"}}\n'
            ),
            stdout=saida,
            stderr=erro,
            preflight_fn=pre,
        ).serve()
        linhas = [json.loads(l) for l in saida.getvalue().splitlines() if l.strip()]
        self.assertIn("result", linhas[0])
        self.assertEqual(linhas[1]["error"]["code"], JSONRPC_CAPABILITY_REFUSED)

    def test_CADA_prompt_reconfere_por_conta_propria(self) -> None:
        # A mutação que reusa a medição anterior sobrevive a um único prompt: a
        # primeira chamada preenche o cache e parece correta. O cenário que importa é
        # a sessão LONGA — a superfície muda entre o primeiro e o segundo pedido, e é
        # aí que confiar na medição de antes entrega o modelo a ferramentas.
        saida = io.StringIO()
        estado = {"n": 0}

        def pre() -> CapabilityReport:
            estado["n"] += 1
            # Limpo nos dois primeiros portões; sujo a partir do terceiro.
            return _relatorio(
                CapabilityVerdict.OK
                if estado["n"] <= 2
                else CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY
            )

        CreditumAcpBridge(
            stdin=io.StringIO(
                '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n'
                '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"s"}}\n'
                '{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"s"}}\n'
            ),
            stdout=saida,
            stderr=io.StringIO(),
            preflight_fn=pre,
        ).serve()
        linhas = [json.loads(l) for l in saida.getvalue().splitlines() if l.strip()]

        # Três portões: um por mensagem. Nenhum reaproveita medição.
        self.assertEqual(estado["n"], 3)
        self.assertIn("result", linhas[0])
        # O segundo prompt vê a superfície suja e recusa por ISSO — não pelo contrato
        # de raciocínio ausente.
        self.assertEqual(
            linhas[2]["error"]["data"]["verdict"],
            CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY,
        )
        self.assertNotIn("reason", linhas[2]["error"]["data"])

    def test_a_31b_r1_nao_chama_modelo_nem_quando_compativel(self) -> None:
        # O contrato de raciocínio é da 3.1c. Chamar o modelo sem ele seria perguntar
        # sem saber o que se está pedindo. A recusa é governada, não esquecimento.
        saida = io.StringIO()
        CreditumAcpBridge(
            stdin=io.StringIO(
                '{"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{"sessionId":"s"}}\n'
            ),
            stdout=saida,
            stderr=io.StringIO(),
            preflight_fn=_relatorio,
        ).serve()
        linha = json.loads(saida.getvalue().strip())
        self.assertEqual(linha["error"]["code"], JSONRPC_CAPABILITY_REFUSED)
        self.assertEqual(
            linha["error"]["data"]["reason"], "REASONING_CONTRACT_NOT_INSTALLED"
        )


class CicloDeVidaDaSessao(unittest.TestCase):
    """
    §17 §23-F — nenhuma sessão RESTAURADA volta com ferramentas.

    Uma sessão restaurada é um agente novo. Tratar `load` como leitura de estado — e
    não como construção — deixaria uma sessão salva voltar com o padrão do produto, que
    é o caminho pelo qual a postura de zero se perde sem ninguém notar.
    """

    def _rodar(self, entrada: str, relatorio_fn):
        saida, erro = io.StringIO(), io.StringIO()
        CreditumAcpBridge(
            stdin=io.StringIO(entrada),
            stdout=saida,
            stderr=erro,
            preflight_fn=relatorio_fn,
        ).serve()
        return [json.loads(l) for l in saida.getvalue().splitlines() if l.strip()]

    def test_session_load_passa_pelo_portao(self) -> None:
        chamadas = {"n": 0}

        def pre() -> CapabilityReport:
            chamadas["n"] += 1
            return _relatorio()

        self._rodar('{"jsonrpc":"2.0","id":1,"method":"session/load"}\n', pre)
        self.assertEqual(chamadas["n"], 1)

    def test_session_load_com_superficie_suja_e_RECUSADA(self) -> None:
        # MUTAÇÃO F: `load` reconstrói o agente com None/padrões.
        linhas = self._rodar(
            '{"jsonrpc":"2.0","id":1,"method":"session/load"}\n',
            lambda: _relatorio(CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY),
        )
        self.assertEqual(linhas[0]["error"]["code"], JSONRPC_CAPABILITY_REFUSED)
        self.assertEqual(
            linhas[0]["error"]["data"]["verdict"],
            CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY,
        )

    def test_new_e_load_recusam_do_MESMO_jeito(self) -> None:
        sujo = lambda: _relatorio(CapabilityVerdict.LATE_TOOL_INJECTION_DETECTED)
        a = self._rodar('{"jsonrpc":"2.0","id":1,"method":"session/new"}\n', sujo)
        b = self._rodar('{"jsonrpc":"2.0","id":1,"method":"session/load"}\n', sujo)
        self.assertEqual(a[0]["error"]["message"], b[0]["error"]["message"])

    def test_fork_e_resume_inexistentes_sao_RECUSA_nao_ramo_generico(self) -> None:
        # Se um dia existirem, caem em METHOD_NOT_FOUND — recusa — em vez de num ramo
        # que reconstruiria um agente sem passar pelo portão.
        for metodo in ("session/fork", "session/resume"):
            with self.subTest(metodo=metodo):
                linhas = self._rodar(
                    '{"jsonrpc":"2.0","id":1,"method":"%s"}\n' % metodo, _relatorio
                )
                self.assertEqual(
                    linhas[0]["error"]["code"], JSONRPC_METHOD_NOT_FOUND
                )


class SegredoNunca(unittest.TestCase):
    """§17 §26 — metadado seguro, e só."""

    def test_o_relatorio_publico_nao_carrega_segredo(self) -> None:
        publico = json.dumps(evaluate(V_OK, P_OK, []).to_public_dict())
        for proibido in ("api_key", "token", "secret", "Bearer", ".env", "password"):
            self.assertNotIn(proibido, publico)

    def test_compativel_e_derivado_do_veredito(self) -> None:
        # Não existe caminho que produza `compatible=True` com veredito outro.
        for v in CapabilityVerdict.ALL:
            r = CapabilityReport(verdict=v)
            self.assertEqual(r.compatible, v == CapabilityVerdict.OK)


if __name__ == "__main__":
    unittest.main()
