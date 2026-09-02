"""
Fase 3.1b-r1 — o núcleo de decisão de capacidade da ponte ACP da Creditum.

─── Por que este módulo é separado ───────────────────────────────────────────

Aqui não se importa Hermes. Nenhuma linha deste arquivo depende do runtime estar
instalado, e é isso que o torna testável no ambiente de desenvolvimento — onde o
Hermes não existe. Toda decisão de segurança mora aqui; a ponte apenas obedece.

─── O defeito que este módulo existe para impedir ────────────────────────────

O ACP do Hermes 0.20.4 constrói agentes com `enabled_toolsets=["hermes-acp"]` fixo e
não preserva a postura de zero ferramentas da Creditum. A contagem efetiva observada
em produção foi 15, incluindo `terminal`, `execute_code`, `write_file`, `process` e
`delegate_task`.

A raiz é uma linha em Python que parece inofensiva:

    toolsets or ["hermes-acp"]

Em Python, `[] or X` devolve `X`. A lista VAZIA — que significa "explicitamente
nenhuma ferramenta" — é falsy, e some. `None` e `[]` viram a mesma coisa.

    None   não especificado, use o padrão
    []     ZERO, e isso é uma decisão

Colapsar os dois transforma uma negação explícita no seu oposto exato. É a mesma
família de defeito que este projeto persegue desde a Fase 2: ausência virando
default, desconhecido virando valor.

─── A ordem das duas invariantes ─────────────────────────────────────────────

    PRIMÁRIA     enabled_toolsets == []           permissão vazia
    SECUNDÁRIA   disabled_toolsets não amplia     defesa em profundidade

A segunda NUNCA sustenta a segurança sozinha: uma lista de negação precisa enumerar
tudo que existe, e a próxima ferramenta que o upstream criar nasce fora dela. A
allowlist vazia não tem esse problema — ela nega por construção.

─── E a invariante que fecha o resto ─────────────────────────────────────────

Configuração não é prova. O que vale é a CONTAGEM FINAL de definições de ferramenta
depois da inicialização real do agente, medida antes de qualquer chamada ao modelo.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence

# ─────────────────────────────────────────────────────────────────────────────
# Expectativa governada
# ─────────────────────────────────────────────────────────────────────────────

BRIDGE_VERSION = "1.1.0"  # r3: ligada à API OBSERVADA (run_agent.AIAgent)

#: Versão EXATA. Não faixa, não `latest`, não `0.20.x`.
#:
#: O upstream tem histórico documentado de migração de config reescrevendo nomes de
#: toolset em silêncio — sem erro, sem aviso, sem log. Uma faixa aceitaria justamente
#: a atualização que muda a superfície de capacidade sem avisar ninguém.
GOVERNED_HERMES_VERSION = "0.20.4"

#: Protocolo observado em produção. Incompatibilidade de protocolo falha fechada.
GOVERNED_ACP_PROTOCOL_VERSION = "0.9.0"

#: ZERO. Não "poucas", não "só as seguras".
GOVERNED_TOOL_COUNT = 0

#: O toolset que o ACP de fábrica injeta, e que a Creditum recusa.
STOCK_ACP_TOOLSET = "hermes-acp"

# ─────────────────────────────────────────────────────────────────────────────
# API OBSERVADA — Fase 3.1b-r3
# ─────────────────────────────────────────────────────────────────────────────
#
# Estes nomes NÃO são expectativa. Vieram da descoberta somente-leitura executada na
# instalação real da Hostinger (3.1b-r2). A versão anterior desta ponte procurava um
# módulo de topo `hermes`, que NÃO EXISTE — e o preflight de produção recusou por
# isso, corretamente.
#
# O que existe em /opt/hermes-agent:
#
#     run_agent.AIAgent                     construtor do agente
#     model_tools.get_tool_definitions      resolvedor de ferramentas
#     acp_adapter.session.SessionManager    máquina de sessão de fábrica
#     hermes_cli                            CLI
#
#: Raiz de instalação do fornecedor. Os módulos acima são de TOPO dentro dela — não há
#: pacote que os agrupe —, então a raiz precisa estar em `sys.path` para importá-los.
#: Sobrescritível por ambiente para não amarrar a lógica a um caminho de máquina.
HERMES_INSTALL_ROOT_ENV = "CREDITUM_HERMES_INSTALL_ROOT"
HERMES_INSTALL_ROOT_DEFAULT = "/opt/hermes-agent"

GOVERNED_AGENT_MODULE = "run_agent"
GOVERNED_AGENT_SYMBOL = "AIAgent"
GOVERNED_TOOL_RESOLVER_MODULE = "model_tools"
GOVERNED_TOOL_RESOLVER_SYMBOL = "get_tool_definitions"

#: Distribuição instalada que declara o protocolo. Metadado de pacote é a fonte
#: preferida: não depende de o módulo expor `__version__`.
ACP_DISTRIBUTIONS = ("agent-client-protocol", "acp")

#: Módulos onde procurar a versão do Hermes quando o metadado de distribuição não
#: responder. NUNCA `hermes` — ele não existe, e foi essa suposição que a r2 corrigiu.
HERMES_VERSION_MODULES = ("hermes_cli", "run_agent", "agent")
HERMES_DISTRIBUTIONS = ("hermes-agent", "hermes_agent", "hermes", "hermes-cli")

#: O ajudante de fábrica que colapsa `[]` em `["hermes-acp"]`. A Creditum NUNCA o
#: chama: ele contém a linha `list(toolsets or ["hermes-acp"])`, que é exatamente o
#: defeito. Nomeado aqui para que a proibição seja legível, não folclórica.
STOCK_EXPANSION_SYMBOL = "_expand_acp_enabled_toolsets"

#: Caminhos de injeção TARDIA observados em produção. Nenhum deles é chamado por esta
#: ponte; todos podem alterar a superfície DEPOIS da construção do agente, e é por
#: isso que a medição acontece no fim e se repete a cada prompt.
LATE_INJECTION_SYMBOLS = (
    "ensure_mcp_discovery_before_agent_build",
    "_register_session_mcp_servers",
    "_schedule_mcp_late_refresh",
    STOCK_EXPANSION_SYMBOL,
    "inject_memory_provider_tools",
)

#: Prefixo dos toolsets que a descoberta MCP acrescenta. Com allowlist vazia, nenhum
#: pode aparecer — nem antes, nem depois da construção.
MCP_TOOLSET_PREFIX = "mcp-"

#: Ferramentas cuja presença é, por si só, motivo de recusa gritante. A lista NÃO é a
#: defesa — a defesa é a contagem ser zero. Ela existe para o diagnóstico dizer o que
#: apareceu, em vez de só dizer "15".
NOTABLY_DANGEROUS = (
    "terminal",
    "execute_code",
    "read_file",
    "write_file",
    "process",
    "delegate_task",
)


class CapabilityVerdict:
    """Vocabulário FECHADO de veredito. Nenhum deles é 'siga com aviso'."""

    OK = "OK"
    #: Versão do Hermes fora da governada, em qualquer direção.
    HERMES_VERSION_MISMATCH = "HERMES_VERSION_MISMATCH"
    #: Protocolo ACP diferente do verificado.
    ACP_PROTOCOL_MISMATCH = "ACP_PROTOCOL_MISMATCH"
    #: Contagem final maior que zero. A postura não sobreviveu à inicialização.
    TOOL_SURFACE_NOT_EMPTY = "TOOL_SURFACE_NOT_EMPTY"
    #: Contagem não determinável — tão inaceitável quanto contagem alta.
    TOOL_SURFACE_UNKNOWN = "TOOL_SURFACE_UNKNOWN"
    #: A API do runtime instalado não é a que a ponte sabe operar.
    RUNTIME_API_INCOMPATIBLE = "RUNTIME_API_INCOMPATIBLE"
    #: A allowlist vazia foi AMPLIADA depois de entregue, ou a superfície cresceu entre
    #: duas leituras. Estado próprio porque diz algo diferente de "havia ferramentas":
    #: diz que a negação explícita não sobreviveu ao runtime.
    LATE_TOOL_INJECTION_DETECTED = "LATE_TOOL_INJECTION_DETECTED"

    ALL = (
        OK,
        HERMES_VERSION_MISMATCH,
        ACP_PROTOCOL_MISMATCH,
        TOOL_SURFACE_NOT_EMPTY,
        TOOL_SURFACE_UNKNOWN,
        RUNTIME_API_INCOMPATIBLE,
        LATE_TOOL_INJECTION_DETECTED,
    )


@dataclass(frozen=True)
class CapabilityReport:
    """
    O que a pré-checagem concluiu, e por quê.

    `compatible` é derivado, nunca atribuído à mão: só existe compatibilidade quando o
    veredito é `OK`, e não há caminho que produza `compatible=True` com veredito outro.
    """

    verdict: str
    bridge_version: str = BRIDGE_VERSION
    hermes_version: str | None = None
    acp_protocol_version: str | None = None
    #: Contagem FINAL, medida após inicialização. `None` significa NÃO MEDIDA.
    effective_model_callable_tool_count: int | None = None
    #: Nomes observados, para diagnóstico. Nunca conteúdo, nunca credencial.
    observed_tool_names: tuple[str, ...] = ()
    #: Detalhe técnico seguro. Sem segredo, sem dado de negócio.
    detail: str = ""
    #: PROCEDÊNCIA. De onde cada evidência veio — qual distribuição declarou a versão,
    #: qual atributo do agente foi lido. Sem isto, `hermes_version: "0.20.4"` é um
    #: número sem autor, e um número sem autor é indistinguível de um palpite. Foi
    #: exatamente um palpite de API que a r2 precisou corrigir.
    hermes_version_source: str = ""
    acp_protocol_version_source: str = ""
    tool_surface_source: str = ""

    @property
    def compatible(self) -> bool:
        return self.verdict == CapabilityVerdict.OK

    def to_public_dict(self) -> dict[str, Any]:
        """
        Metadado sanitizado. Só o que é seguro sair.

        Campo ausente significa NÃO OBSERVADO — nunca zero. É a regra que atravessa
        este projeto desde a Fase 2, e aqui zero é justamente a resposta que queremos
        ver, o que torna o engano mais caro.
        """
        saida: dict[str, Any] = {
            "bridge_version": self.bridge_version,
            "transport": "acp",
            "verdict": self.verdict,
            "compatible": self.compatible,
            "expected_hermes_version": GOVERNED_HERMES_VERSION,
            "expected_acp_protocol_version": GOVERNED_ACP_PROTOCOL_VERSION,
            "expected_model_callable_tool_count": GOVERNED_TOOL_COUNT,
        }
        if self.hermes_version is not None:
            saida["hermes_version"] = self.hermes_version
        if self.acp_protocol_version is not None:
            saida["acp_protocol_version"] = self.acp_protocol_version
        if self.effective_model_callable_tool_count is not None:
            saida["effective_model_callable_tool_count"] = (
                self.effective_model_callable_tool_count
            )
        if self.observed_tool_names:
            saida["observed_tool_names"] = list(self.observed_tool_names)
        if self.detail:
            saida["detail"] = self.detail
        for campo, valor in (
            ("hermes_version_source", self.hermes_version_source),
            ("acp_protocol_version_source", self.acp_protocol_version_source),
            ("tool_surface_source", self.tool_surface_source),
        ):
            if valor:
                saida[campo] = valor
        return saida


# ─────────────────────────────────────────────────────────────────────────────
# A distinção que o upstream perde
# ─────────────────────────────────────────────────────────────────────────────


def resolve_enabled_toolsets(
    requested: Sequence[str] | None,
    default: Sequence[str],
) -> list[str]:
    """
    Resolve toolsets PRESERVANDO a diferença entre não-especificado e vazio.

    É a correção da linha que causa o defeito::

        toolsets or ["hermes-acp"]     # `[]` é falsy — o vazio some
        ↓
        default if toolsets is None else list(toolsets)

    `is None` em vez de truthiness. Uma lista vazia é uma DECISÃO, e a decisão de não
    conceder nada é exatamente a que não pode ser silenciosamente revertida.
    """
    if requested is None:
        return list(default)
    return list(requested)


def creditum_enabled_toolsets() -> list[str]:
    """
    A allowlist da Creditum: vazia, sempre, explicitamente.

    Devolve lista nova a cada chamada de propósito — devolver uma constante
    compartilhada deixaria um `.append()` distraído virar concessão de capacidade.
    """
    return []


def creditum_disabled_toolsets() -> list[str]:
    """
    Defesa em profundidade. NÃO é a defesa.

    Nomeia o toolset que o ACP de fábrica injeta e as famílias de ação externa. Se um
    dia isto virar a única proteção, a proteção já falhou: negar por enumeração exige
    conhecer tudo que existe, e a próxima ferramenta do upstream nasce fora da lista.
    """
    return [
        STOCK_ACP_TOOLSET,
        "terminal",
        "file",
        "browser",
        "web",
        "search",
        "code_execution",
        "cronjob",
        "delegation",
        "memory",
        "skills",
        "computer_use",
        "desktop_ui",
        "homeassistant",
    ]


def is_explicit_deny_all(enabled: Sequence[str] | None) -> bool:
    """
    Verdadeiro somente para a lista VAZIA. `None` não é negação: é omissão.

    A pergunta que esta função responde é "o chamador negou tudo?", e omitir não é
    negar.
    """
    return enabled is not None and len(enabled) == 0


def expansion_allowed(enabled: Sequence[str] | None) -> bool:
    """
    Expansão dinâmica — MCP, memória, plugins, skills, contexto — é permitida?

    Com allowlist explicitamente vazia: NÃO. Vazio explícito é estado de negação
    total, e "zero mais o que aparecer depois" não é zero.
    """
    return not is_explicit_deny_all(enabled)


# ─────────────────────────────────────────────────────────────────────────────
# A construção governada do agente real
# ─────────────────────────────────────────────────────────────────────────────


def creditum_agent_kwargs() -> dict[str, Any]:
    """
    Os argumentos EXATOS com que a Creditum constrói `run_agent.AIAgent`.

    Autoridade única: preflight e sessão constroem pelos mesmos kwargs. Duas receitas
    de construção seriam duas posturas de capacidade, e a que vale seria a que ninguém
    olhou.

    `platform="acp"` entra de propósito. O `_make_agent` de fábrica passa isso, e medir
    um agente configurado diferente do que vai rodar mediria com precisão o agente
    errado.

    O que NÃO entra:

        enabled_toolsets=None              "use o padrão" — e o padrão são 20
        enabled_toolsets=["hermes-acp"]    o que o ACP de fábrica faz
        _expand_acp_enabled_toolsets([])   o ajudante que devolve ["hermes-acp"]
    """
    return {
        "platform": "acp",
        "enabled_toolsets": creditum_enabled_toolsets(),
        "disabled_toolsets": creditum_disabled_toolsets(),
    }


def allowlist_violation(enabled: Sequence[str] | None) -> str:
    """
    A allowlist ainda é a negação total que entregamos? `""` quando sim.

    Conferida DUAS vezes: antes de construir e depois. O construtor do fornecedor
    recebe a lista por referência, e `kwargs["enabled_toolsets"].append("mcp-x")` é uma
    ampliação de capacidade que nenhuma leitura de configuração pegaria — o objeto que
    inspecionamos e o objeto que o agente usa são o mesmo.
    """
    if enabled is None:
        return "allowlist virou `None` — 'use o padrão' é o oposto de 'nenhuma'"
    if len(enabled) != 0:
        mcp = [t for t in enabled if str(t).startswith(MCP_TOOLSET_PREFIX)]
        detalhe = f"allowlist deixou de ser vazia: {sorted(str(t) for t in enabled)}"
        if mcp:
            detalhe += "; expansão MCP acrescentou " + ", ".join(sorted(mcp))
        return detalhe
    return ""


# ─────────────────────────────────────────────────────────────────────────────
# A medição que vale
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ToolSurfaceMeasurement:
    """
    Quantas ferramentas o modelo poderia chamar, e como isso foi sabido.

    `known=False` NÃO é `count=0`. É a mesma regra que atravessa este projeto desde a
    Fase 2, e aqui ela custa mais caro que em qualquer outro lugar: zero é justamente a
    resposta que queremos ver, então confundir "não medi" com "medi e deu zero" é o
    erro mais confortável possível.
    """

    known: bool
    count: int | None = None
    names: tuple[str, ...] = ()
    source: str = ""
    detail: str = ""

    @staticmethod
    def unknown(detail: str, source: str = "") -> "ToolSurfaceMeasurement":
        return ToolSurfaceMeasurement(known=False, source=source, detail=detail)

    @staticmethod
    def measured(
        names: Sequence[str], source: str, detail: str = ""
    ) -> "ToolSurfaceMeasurement":
        nomes = tuple(names)
        return ToolSurfaceMeasurement(
            known=True, count=len(nomes), names=nomes, source=source, detail=detail
        )


def merge_surfaces(*medicoes: ToolSurfaceMeasurement) -> ToolSurfaceMeasurement:
    """
    União conservadora de leituras independentes da superfície.

    Uma leitura desconhecida contamina o conjunto: se o resolvedor diz zero e o agente
    não é legível, o que chega ao modelo permanece desconhecido. União, e não a menor
    das contagens, porque a pergunta é "o que PODE ser chamado", e qualquer fonte que
    enxergue uma ferramenta a mais está certa.
    """
    if not medicoes:
        return ToolSurfaceMeasurement.unknown("nenhuma leitura de superfície")
    for m in medicoes:
        if not m.known:
            return m
    vistos: dict[str, None] = {}
    for m in medicoes:
        for n in m.names:
            vistos[n] = None
    return ToolSurfaceMeasurement.measured(
        tuple(vistos), source=" + ".join(m.source for m in medicoes if m.source)
    )


# ─────────────────────────────────────────────────────────────────────────────
# A medição que vale
# ─────────────────────────────────────────────────────────────────────────────


def tool_names(definitions: Iterable[Any] | None) -> tuple[str, ...] | None:
    """
    Extrai nomes das definições de ferramenta. `None` quando não determinável.

    Aceita as formas que uma definição de ferramenta costuma ter — dicionário no
    formato de function-calling, dicionário plano, objeto com `.name` — e recusa o que
    não reconhece. Recusar é devolver `None`, que a montante vira
    `TOOL_SURFACE_UNKNOWN`: se não sei ler a lista, não posso afirmar que ela é vazia.
    """
    if definitions is None:
        return None
    nomes: list[str] = []
    try:
        for d in definitions:
            nome = _nome_de(d)
            if nome is None:
                return None
            nomes.append(nome)
    except TypeError:
        # Não iterável. Não sabemos o que é, então não sabemos quantas são.
        return None
    return tuple(nomes)


def _nome_de(d: Any) -> str | None:
    if isinstance(d, dict):
        # Formato de function-calling: {"type": "function", "function": {"name": ...}}
        funcao = d.get("function")
        if isinstance(funcao, dict) and isinstance(funcao.get("name"), str):
            return funcao["name"]
        if isinstance(d.get("name"), str):
            return d["name"]
        return None
    nome = getattr(d, "name", None)
    return nome if isinstance(nome, str) else None


def evaluate(
    hermes_version: str | None,
    acp_protocol_version: str | None,
    tool_definitions: Iterable[Any] | None,
    *,
    api_detail: str = "",
    late_injection_detail: str = "",
    surface_detail: str = "",
    hermes_version_source: str = "",
    acp_protocol_version_source: str = "",
    tool_surface_source: str = "",
) -> CapabilityReport:
    """
    O veredito completo. Falha fechada em toda dúvida.

    A ordem importa: versão antes de protocolo, protocolo antes de ferramentas. Medir
    a superfície de um runtime que não é o governado responderia com precisão a
    pergunta errada.

    A injeção tardia é conferida ANTES da contagem porque diz algo mais específico: não
    "havia ferramentas", e sim "a negação explícita que entregamos foi desfeita". Quem
    investiga precisa dessa diferença — uma aponta para configuração, a outra para o
    runtime ter mexido no que era nosso.
    """
    proveniencia = {
        "hermes_version_source": hermes_version_source,
        "acp_protocol_version_source": acp_protocol_version_source,
    }

    if api_detail:
        return CapabilityReport(
            verdict=CapabilityVerdict.RUNTIME_API_INCOMPATIBLE,
            hermes_version=hermes_version,
            acp_protocol_version=acp_protocol_version,
            detail=api_detail,
            **proveniencia,
        )

    if hermes_version != GOVERNED_HERMES_VERSION:
        return CapabilityReport(
            verdict=CapabilityVerdict.HERMES_VERSION_MISMATCH,
            hermes_version=hermes_version,
            acp_protocol_version=acp_protocol_version,
            detail=f"esperado {GOVERNED_HERMES_VERSION}",
            **proveniencia,
        )

    if acp_protocol_version != GOVERNED_ACP_PROTOCOL_VERSION:
        return CapabilityReport(
            verdict=CapabilityVerdict.ACP_PROTOCOL_MISMATCH,
            hermes_version=hermes_version,
            acp_protocol_version=acp_protocol_version,
            detail=f"esperado {GOVERNED_ACP_PROTOCOL_VERSION}",
            **proveniencia,
        )

    nomes = tool_names(tool_definitions)

    if late_injection_detail:
        return CapabilityReport(
            verdict=CapabilityVerdict.LATE_TOOL_INJECTION_DETECTED,
            hermes_version=hermes_version,
            acp_protocol_version=acp_protocol_version,
            effective_model_callable_tool_count=None if nomes is None else len(nomes),
            observed_tool_names=nomes or (),
            detail=late_injection_detail,
            tool_surface_source=tool_surface_source,
            **proveniencia,
        )

    if nomes is None:
        # Não determinável. "Não sei quantas ferramentas o modelo pode chamar" é tão
        # inaceitável quanto "sei que são quinze".
        return CapabilityReport(
            verdict=CapabilityVerdict.TOOL_SURFACE_UNKNOWN,
            hermes_version=hermes_version,
            acp_protocol_version=acp_protocol_version,
            detail=surface_detail or "definições de ferramenta não legíveis",
            tool_surface_source=tool_surface_source,
            **proveniencia,
        )

    if len(nomes) != GOVERNED_TOOL_COUNT:
        perigosas = tuple(n for n in nomes if n in NOTABLY_DANGEROUS)
        detalhe = f"{len(nomes)} definição(ões) chegaram ao modelo"
        if perigosas:
            detalhe += f"; entre elas {', '.join(sorted(perigosas))}"
        return CapabilityReport(
            verdict=CapabilityVerdict.TOOL_SURFACE_NOT_EMPTY,
            hermes_version=hermes_version,
            acp_protocol_version=acp_protocol_version,
            effective_model_callable_tool_count=len(nomes),
            observed_tool_names=nomes,
            detail=detalhe,
            tool_surface_source=tool_surface_source,
            **proveniencia,
        )

    return CapabilityReport(
        verdict=CapabilityVerdict.OK,
        hermes_version=hermes_version,
        acp_protocol_version=acp_protocol_version,
        effective_model_callable_tool_count=0,
        tool_surface_source=tool_surface_source,
        **proveniencia,
    )
