"""
Fase 3.1b-r3 — a ÚNICA superfície que toca o runtime instalado do Hermes.

─── O que mudou, e por quê ───────────────────────────────────────────────────

A r1 foi escrita sem o Hermes instalado. Ela procurava um módulo de topo `hermes` e
falhava fechada dizendo qual símbolo faltou — o preflight de produção devolveu
`RUNTIME_API_INCOMPATIBLE`, que era a resposta CERTA para uma expectativa ERRADA.

A descoberta somente-leitura da r2, na instalação real, mostrou que não existe módulo
`hermes`. O que existe em /opt/hermes-agent:

    run_agent.AIAgent                     construtor do agente
    model_tools.get_tool_definitions      resolvedor de ferramentas
    acp_adapter.session.SessionManager     máquina de sessão de fábrica

Este arquivo agora se liga a esses nomes OBSERVADOS. Não há mais adivinhação de API
neste caminho.

─── O que continua valendo ───────────────────────────────────────────────────

Cada símbolo é conferido, e o que falta é NOMEADO. A alternativa — supor que existe e
estourar um AttributeError no meio de uma sessão — trocaria uma recusa clara por um
erro ambíguo, e ambiguidade na fronteira de capacidade é o começo de uma suposição de
que está tudo bem.

─── O que este arquivo NUNCA faz ─────────────────────────────────────────────

Não escreve configuração. Não liga ferramenta. Não reinicia gateway. Não lê `.env`.
Não chama modelo. Não edita nada em /opt. Não chama o expansor de fábrica.

Ele constrói um agente com allowlist explicitamente vazia e MEDE o que sobrou.
"""

from __future__ import annotations

import contextlib
import importlib
import importlib.metadata
import os
import sys
from dataclasses import dataclass
from typing import Any, Callable

from .capability import (
    ACP_DISTRIBUTIONS,
    GOVERNED_AGENT_MODULE,
    GOVERNED_AGENT_SYMBOL,
    GOVERNED_TOOL_RESOLVER_MODULE,
    GOVERNED_TOOL_RESOLVER_SYMBOL,
    HERMES_DISTRIBUTIONS,
    HERMES_INSTALL_ROOT_DEFAULT,
    HERMES_INSTALL_ROOT_ENV,
    HERMES_VERSION_MODULES,
    CapabilityReport,
    ToolSurfaceMeasurement,
    allowlist_violation,
    creditum_agent_kwargs,
    creditum_disabled_toolsets,
    creditum_enabled_toolsets,
    evaluate,
    merge_surfaces,
    tool_names,
)

#: Atributos onde a superfície final do agente pode estar. Procurados em ordem; o
#: primeiro que existir é a fonte. Nenhum encontrado NÃO é zero — é desconhecido.
AGENT_SURFACE_ATTRS = (
    "tool_definitions",
    "get_tool_definitions",
    "tools",
    "get_tools",
    "available_tools",
    "_tool_definitions",
    "_tools",
)


def hermes_install_root() -> str:
    """Raiz de instalação do fornecedor, sobrescritível por ambiente."""
    return os.environ.get(HERMES_INSTALL_ROOT_ENV) or HERMES_INSTALL_ROOT_DEFAULT


def ensure_install_root_importable() -> str:
    """
    Põe a raiz do fornecedor em `sys.path` para que `run_agent` e `model_tools` sejam
    importáveis. Devolve a raiz usada, ou `""` se ela não existir.

    `append`, não `insert(0)`: os módulos do fornecedor são de TOPO — `agent`,
    `run_agent`, `model_tools` — e colocá-los na frente do caminho deixaria a
    instalação sombrear módulos do processo. A precedência continua sendo nossa.

    Isto altera `sys.path` do processo. É a única mutação que este arquivo faz, e não
    toca disco: nada em /opt é lido além dos módulos importados, nada é escrito.
    """
    raiz = hermes_install_root()
    if not os.path.isdir(raiz):
        return ""
    if raiz not in sys.path:
        sys.path.append(raiz)
    return raiz


@dataclass(frozen=True)
class VendorProbe:
    """O que se conseguiu observar do fornecedor. `detail` explica o que faltou."""

    hermes_version: str | None = None
    hermes_version_source: str = ""
    acp_protocol_version: str | None = None
    acp_protocol_version_source: str = ""
    surface: ToolSurfaceMeasurement | None = None
    detail: str = ""
    late_injection_detail: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Impressão digital do runtime — sem `import hermes`
# ─────────────────────────────────────────────────────────────────────────────


def _versao_de_distribuicao(nome: str) -> str | None:
    try:
        return importlib.metadata.version(nome)
    except Exception:  # noqa: BLE001 — ausência é resposta, não exceção
        return None


def _versao_de_modulo(modulo: Any) -> str | None:
    for atributo in ("__version__", "VERSION", "version"):
        valor = getattr(modulo, atributo, None)
        if isinstance(valor, str) and valor:
            return valor
    return None


def _importar(nome: str) -> Any | None:
    try:
        return importlib.import_module(nome)
    except Exception:  # noqa: BLE001 — qualquer falha de import é ausência
        return None


def discover_hermes_version() -> tuple[str | None, str]:
    """
    Versão do Hermes instalado, e de ONDE ela veio.

    Metadado de distribuição primeiro: não depende de o módulo expor `__version__`, e é
    o que o gerenciador de pacotes efetivamente instalou. Depois, atributo de módulo
    OBSERVADO — nunca `hermes`, que não existe.

    Nada aqui executa `hermes chat` nem qualquer comando que possa chamar modelo.
    """
    for dist in HERMES_DISTRIBUTIONS:
        v = _versao_de_distribuicao(dist)
        if v:
            return v, f"distribution:{dist}"

    # Varredura do que está instalado. É leitura de metadado, e evita que a ponte
    # dependa de acertar o nome exato da distribuição na primeira tentativa.
    try:
        for d in importlib.metadata.distributions():
            nome = (d.metadata["Name"] or "") if d.metadata else ""
            if nome and "hermes" in nome.lower() and d.version:
                return d.version, f"distribution:{nome}"
    except Exception:  # noqa: BLE001
        pass

    for nome_modulo in HERMES_VERSION_MODULES:
        modulo = _importar(nome_modulo)
        if modulo is None:
            continue
        v = _versao_de_modulo(modulo)
        if v:
            return v, f"module:{nome_modulo}"

    return None, ""


def discover_acp_protocol_version() -> tuple[str | None, str]:
    """Versão do protocolo ACP, preferindo metadado de pacote instalado."""
    for dist in ACP_DISTRIBUTIONS:
        v = _versao_de_distribuicao(dist)
        if v:
            return v, f"distribution:{dist}"
    for nome_modulo in ("acp", "agent_client_protocol", "acp_adapter"):
        modulo = _importar(nome_modulo)
        if modulo is None:
            continue
        v = _versao_de_modulo(modulo)
        if v:
            return v, f"module:{nome_modulo}"
    return None, ""


# ─────────────────────────────────────────────────────────────────────────────
# Construção governada do agente REAL
# ─────────────────────────────────────────────────────────────────────────────


def discover_agent_factory() -> tuple[Callable[..., Any] | None, str]:
    """`run_agent.AIAgent`, o construtor OBSERVADO. Ausente é recusa nomeada."""
    modulo = _importar(GOVERNED_AGENT_MODULE)
    if modulo is None:
        return None, (
            f"módulo `{GOVERNED_AGENT_MODULE}` não importável a partir de "
            f"`{hermes_install_root()}`"
        )
    fabrica = getattr(modulo, GOVERNED_AGENT_SYMBOL, None)
    if not callable(fabrica):
        return None, (
            f"`{GOVERNED_AGENT_MODULE}.{GOVERNED_AGENT_SYMBOL}` ausente ou não chamável"
        )
    return fabrica, ""


def discover_tool_resolver() -> tuple[Callable[..., Any] | None, str]:
    """`model_tools.get_tool_definitions`, o resolvedor OBSERVADO."""
    modulo = _importar(GOVERNED_TOOL_RESOLVER_MODULE)
    if modulo is None:
        return None, (
            f"módulo `{GOVERNED_TOOL_RESOLVER_MODULE}` não importável a partir de "
            f"`{hermes_install_root()}`"
        )
    resolvedor = getattr(modulo, GOVERNED_TOOL_RESOLVER_SYMBOL, None)
    if not callable(resolvedor):
        return None, (
            f"`{GOVERNED_TOOL_RESOLVER_MODULE}.{GOVERNED_TOOL_RESOLVER_SYMBOL}` "
            "ausente ou não chamável"
        )
    return resolvedor, ""


@contextlib.contextmanager
def _stdout_protegido():
    """
    Código do fornecedor pode imprimir. stdout desta ponte é protocolo ACP e nada mais,
    então tudo que ele escrever vai para stderr.

    Sem isto, um banner do fornecedor entraria no meio das mensagens JSON-RPC e o
    adapter leria a linha como falha de transporte — um defeito que apareceria só em
    produção, e só às vezes.
    """
    with contextlib.redirect_stdout(sys.stderr):
        yield


def build_creditum_agent(fabrica: Callable[..., Any]) -> tuple[Any, list[str], str]:
    """
    Constrói o agente com os kwargs governados e devolve `(agente, allowlist, erro)`.

    A `allowlist` devolvida é o MESMO objeto entregue ao construtor. Ela volta para ser
    reconferida: o fornecedor recebe a lista por referência, e um `.append()` lá dentro
    é ampliação de capacidade que nenhuma leitura de configuração pegaria.
    """
    kwargs = creditum_agent_kwargs()
    allowlist: list[str] = kwargs["enabled_toolsets"]

    violacao = allowlist_violation(allowlist)
    if violacao:  # pragma: no cover — a autoridade governada não produz isto
        return None, allowlist, f"allowlist governada inválida antes da construção: {violacao}"

    try:
        with _stdout_protegido():
            agente = fabrica(**kwargs)
    except TypeError as causa:
        return None, allowlist, (
            f"`{GOVERNED_AGENT_MODULE}.{GOVERNED_AGENT_SYMBOL}` não aceita os kwargs "
            f"governados ({', '.join(sorted(kwargs))}): {type(causa).__name__}"
        )
    except Exception as causa:  # noqa: BLE001
        return None, allowlist, f"construção do agente falhou: {type(causa).__name__}"

    return agente, allowlist, ""


# ─────────────────────────────────────────────────────────────────────────────
# A medição final — o que efetivamente chega ao modelo
# ─────────────────────────────────────────────────────────────────────────────


def _normalizar(bruto: Any) -> list[Any] | None:
    """
    Converte uma superfície bruta em lista de definições, ou `None` se ilegível.

    Mapeamentos entram porque um registro `{nome: ferramenta}` é uma forma comum de
    guardar a superfície, e tratá-lo como ilegível produziria DESCONHECIDO onde a
    verdade era perfeitamente legível — falha fechada por preguiça, não por dúvida.
    """
    if bruto is None:
        return None
    if isinstance(bruto, dict):
        if all(isinstance(k, str) for k in bruto):
            return [{"name": k} for k in bruto]
        return None
    if isinstance(bruto, (str, bytes)):
        return None
    try:
        return list(bruto)
    except TypeError:
        return None


def _ler_superficie_do_agente(agente: Any) -> tuple[str, Any] | None:
    """Devolve `(atributo, valor bruto)` da primeira fonte de superfície encontrada."""
    for nome in AGENT_SURFACE_ATTRS:
        atributo = getattr(agente, nome, None)
        if atributo is None:
            continue
        try:
            with _stdout_protegido():
                return nome, (atributo() if callable(atributo) else atributo)
        except Exception:  # noqa: BLE001 — leitura que estoura não é leitura
            return nome, None
    return None


def _atributos_com_cara_de_ferramenta(agente: Any) -> tuple[str, ...]:
    """
    NOMES de atributos do agente que mencionam ferramenta.

    Existe para o diagnóstico: se nenhum candidato conhecido servir, dizer o que EXISTE
    transforma um bloqueio em uma correção de uma rodada. São nomes de atributo, não
    valores — nada de credencial, nada de conteúdo.
    """
    try:
        nomes = [n for n in dir(agente) if "tool" in n.lower()]
    except Exception:  # noqa: BLE001
        return ()
    return tuple(sorted(nomes)[:12])


def measure_effective_model_callable_tools(
    agente: Any,
    *,
    tool_resolver: Callable[..., Any] | None = None,
    surface_reader: Callable[[Any], Any] | None = None,
) -> tuple[ToolSurfaceMeasurement, str]:
    """
    A superfície FINAL de ferramentas chamáveis pelo modelo, e o detalhe de injeção
    tardia (`""` quando nenhuma).

    ─── Duas leituras independentes, unidas ──────────────────────────────────

        resolvedor    model_tools.get_tool_definitions(enabled_toolsets=[])
        agente        o que o AIAgent construído carrega de fato

    O resolvedor sozinho NÃO basta. §11: a memória pode injetar ferramenta depois dele,
    e contar a resposta do resolvedor responderia sobre um estágio anterior ao que
    importa. O agente sozinho também não basta — se ele não expõe a superfície, a
    resposta do resolvedor pelo menos é uma leitura.

    União, e não a menor das duas: a pergunta é o que PODE ser chamado, e a fonte que
    enxerga uma ferramenta a mais está certa.

    ─── Ilegível não é zero ──────────────────────────────────────────────────

    Se o agente não expõe superfície por nenhum nome conhecido, o resultado é
    DESCONHECIDO, e o detalhe lista os candidatos procurados e os atributos que existem
    e mencionam ferramenta. Declarar zero aí seria trocar "não medi" por "medi e deu
    zero" — no único lugar onde zero é a resposta que queremos ver.
    """
    leituras: list[ToolSurfaceMeasurement] = []

    if tool_resolver is not None:
        allowlist = creditum_enabled_toolsets()
        try:
            with _stdout_protegido():
                bruto = tool_resolver(
                    enabled_toolsets=allowlist,
                    disabled_toolsets=creditum_disabled_toolsets(),
                    quiet_mode=True,
                )
        except Exception as causa:  # noqa: BLE001
            return (
                ToolSurfaceMeasurement.unknown(
                    f"`{GOVERNED_TOOL_RESOLVER_MODULE}."
                    f"{GOVERNED_TOOL_RESOLVER_SYMBOL}` falhou: {type(causa).__name__}",
                    source="resolver",
                ),
                "",
            )
        violacao = allowlist_violation(allowlist)
        if violacao:
            return (
                ToolSurfaceMeasurement.unknown("allowlist alterada pelo resolvedor"),
                f"resolvedor de ferramentas alterou a allowlist entregue: {violacao}",
            )
        nomes = tool_names(_normalizar(bruto))
        if nomes is None:
            return (
                ToolSurfaceMeasurement.unknown(
                    "definições devolvidas pelo resolvedor não são legíveis",
                    source="resolver",
                ),
                "",
            )
        leituras.append(ToolSurfaceMeasurement.measured(nomes, source="resolver"))

    if surface_reader is not None:
        fonte, bruto = "injected", surface_reader(agente)
    else:
        lido = _ler_superficie_do_agente(agente)
        if lido is None:
            candidatos = ", ".join(f"`{a}`" for a in AGENT_SURFACE_ATTRS)
            existentes = _atributos_com_cara_de_ferramenta(agente)
            detalhe = (
                "superfície final do agente não legível; procurada em "
                f"{candidatos}"
            )
            if existentes:
                detalhe += "; atributos presentes que mencionam ferramenta: " + ", ".join(
                    existentes
                )
            return ToolSurfaceMeasurement.unknown(detalhe, source="agent"), ""
        fonte, bruto = lido

    primeira = tool_names(_normalizar(bruto))
    if primeira is None:
        return (
            ToolSurfaceMeasurement.unknown(
                f"superfície do agente em `{fonte}` não é legível como definições",
                source=f"agent.{fonte}",
            ),
            "",
        )

    # Segunda leitura. Uma superfície que muda entre duas leituras imediatas não é uma
    # superfície: é um estado em movimento, e medir um estado em movimento devolve um
    # número que já não vale quando é impresso.
    if surface_reader is not None:
        segunda_bruta = surface_reader(agente)
    else:
        relido = _ler_superficie_do_agente(agente)
        segunda_bruta = None if relido is None else relido[1]
    segunda = tool_names(_normalizar(segunda_bruta))

    if segunda is None or set(segunda) != set(primeira):
        return (
            ToolSurfaceMeasurement.measured(
                tuple(sorted(set(primeira) | set(segunda or ()))),
                source=f"agent.{fonte}",
            ),
            (
                "a superfície mudou entre duas leituras consecutivas: "
                f"{len(primeira)} → "
                f"{'ilegível' if segunda is None else len(segunda)}"
            ),
        )

    leituras.append(ToolSurfaceMeasurement.measured(primeira, source=f"agent.{fonte}"))
    return merge_surfaces(*leituras), ""


# ─────────────────────────────────────────────────────────────────────────────
# A sondagem completa
# ─────────────────────────────────────────────────────────────────────────────


def probe_vendor(
    *,
    agent_factory: Callable[..., Any] | None = None,
    tool_resolver: Callable[..., Any] | None = None,
    surface_reader: Callable[[Any], Any] | None = None,
    hermes_version: str | None = None,
    acp_protocol_version: str | None = None,
) -> VendorProbe:
    """
    Constrói um agente com allowlist VAZIA e mede a superfície que sobrou.

    ─── As costuras, e por que elas existem ──────────────────────────────────

    Tudo é injetável para que a lógica seja provada onde o Hermes NÃO está instalado.
    Em produção todas ficam em `None` e a descoberta é inteiramente real.

    Cada peça é descoberta apenas se NÃO tiver sido injetada. A primeira versão disto
    retornava no import e nunca chegava às costuras: as costuras existiam e não serviam
    para nada, que é a pior forma de peça de teste.
    """
    precisa_do_fornecedor = (
        agent_factory is None
        or tool_resolver is None
        or hermes_version is None
        or acp_protocol_version is None
    )
    if precisa_do_fornecedor:
        ensure_install_root_importable()

    versao, fonte_versao = (
        (hermes_version, "injected") if hermes_version is not None else (None, "")
    )
    if hermes_version is None:
        versao, fonte_versao = discover_hermes_version()
        if versao is None:
            candidatos = ", ".join(f"`{d}`" for d in HERMES_DISTRIBUTIONS)
            modulos = ", ".join(f"`{m}`" for m in HERMES_VERSION_MODULES)
            return VendorProbe(
                detail=(
                    "versão do Hermes não determinável sem chamar a CLI; procurada em "
                    f"metadado de distribuição ({candidatos}), em qualquer distribuição "
                    f"com 'hermes' no nome, e em {modulos}"
                )
            )

    protocolo, fonte_protocolo = (
        (acp_protocol_version, "injected")
        if acp_protocol_version is not None
        else (None, "")
    )
    if acp_protocol_version is None:
        protocolo, fonte_protocolo = discover_acp_protocol_version()
        if protocolo is None:
            candidatos = ", ".join(f"`{d}`" for d in ACP_DISTRIBUTIONS)
            return VendorProbe(
                hermes_version=versao,
                hermes_version_source=fonte_versao,
                detail=(
                    "versão do protocolo ACP não determinável; procurada em metadado de "
                    f"distribuição ({candidatos}) e nos módulos `acp`, "
                    "`agent_client_protocol`, `acp_adapter`"
                ),
            )

    fabrica = agent_factory
    if fabrica is None:
        fabrica, erro = discover_agent_factory()
        if fabrica is None:
            return VendorProbe(
                hermes_version=versao,
                hermes_version_source=fonte_versao,
                acp_protocol_version=protocolo,
                acp_protocol_version_source=fonte_protocolo,
                detail=erro,
            )

    resolvedor = tool_resolver
    if resolvedor is None and surface_reader is None:
        resolvedor, erro = discover_tool_resolver()
        if resolvedor is None:
            return VendorProbe(
                hermes_version=versao,
                hermes_version_source=fonte_versao,
                acp_protocol_version=protocolo,
                acp_protocol_version_source=fonte_protocolo,
                detail=erro,
            )

    agente, allowlist, erro = build_creditum_agent(fabrica)
    if erro:
        return VendorProbe(
            hermes_version=versao,
            hermes_version_source=fonte_versao,
            acp_protocol_version=protocolo,
            acp_protocol_version_source=fonte_protocolo,
            detail=erro,
        )

    # A allowlist entregue continua vazia? O construtor a recebeu por referência.
    violacao = allowlist_violation(allowlist)
    if violacao:
        return VendorProbe(
            hermes_version=versao,
            hermes_version_source=fonte_versao,
            acp_protocol_version=protocolo,
            acp_protocol_version_source=fonte_protocolo,
            surface=ToolSurfaceMeasurement.unknown("allowlist ampliada na construção"),
            late_injection_detail=(
                f"a construção do agente alterou a allowlist entregue: {violacao}"
            ),
        )

    medicao, tardia = measure_effective_model_callable_tools(
        agente, tool_resolver=resolvedor, surface_reader=surface_reader
    )
    return VendorProbe(
        hermes_version=versao,
        hermes_version_source=fonte_versao,
        acp_protocol_version=protocolo,
        acp_protocol_version_source=fonte_protocolo,
        surface=medicao,
        late_injection_detail=tardia,
    )


def preflight(
    *,
    agent_factory: Callable[..., Any] | None = None,
    tool_resolver: Callable[..., Any] | None = None,
    surface_reader: Callable[[Any], Any] | None = None,
    hermes_version: str | None = None,
    acp_protocol_version: str | None = None,
) -> CapabilityReport:
    """
    A pré-checagem completa: descobre, constrói, mede e julga.

    Nunca devolve `compatible=True` a partir de configuração. O caminho passa
    obrigatoriamente pela construção real do agente e pela leitura da superfície que
    chegaria ao modelo. Nenhum modelo é chamado.
    """
    observado = probe_vendor(
        agent_factory=agent_factory,
        tool_resolver=tool_resolver,
        surface_reader=surface_reader,
        hermes_version=hermes_version,
        acp_protocol_version=acp_protocol_version,
    )
    medicao = observado.surface
    definicoes: Any = None
    if medicao is not None and medicao.known:
        definicoes = [{"name": n} for n in medicao.names]

    return evaluate(
        hermes_version=observado.hermes_version,
        acp_protocol_version=observado.acp_protocol_version,
        tool_definitions=definicoes,
        api_detail=observado.detail,
        late_injection_detail=observado.late_injection_detail,
        surface_detail=(medicao.detail if medicao is not None else ""),
        hermes_version_source=observado.hermes_version_source,
        acp_protocol_version_source=observado.acp_protocol_version_source,
        tool_surface_source=(medicao.source if medicao is not None else ""),
    )
