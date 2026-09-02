"""
Fase 3.1d-b-r1 — autoridade de execução e vínculo de runtime.

─── Os três defeitos que este arquivo existe para fechar ─────────────────────

1. A STRING era a autorização. `mode="LIVE_SYNTHETIC"` bastava para alcançar o
   provider. Um nome não é uma permissão.

2. `runtime_kwargs: dict` deixava o chamador escolher provider, modelo, base_url e
   credencial — e depois escolher a expectativa que combinava com a própria escolha.
   O portão provava CONSISTÊNCIA, não PROCEDÊNCIA.

3. `HERMES_HOME` DEFINIA o cwd governado. `HERMES_HOME=/tmp/x` mais `cwd=/tmp/x`
   passava. Observação de ambiente não pode definir governança.

─── O modelo de ameaça, dito com precisão ───────────────────────────────────

A fronteira aqui é a **API pública**. Um chamador legítimo do runtime governado não
consegue escolher runtime, credencial nem modo de execução.

Isto NÃO é defesa criptográfica contra código arbitrário rodando dentro do mesmo
processo Python: quem pode importar um módulo privado pode chamá-lo. Dizer o
contrário seria vender uma garantia que a linguagem não dá.

O que se garante: nenhuma superfície pública — construtor, argumento, variável de
ambiente, flag de CLI, campo de requisição ACP — concede LIVE nem escolhe provider.
"""

from __future__ import annotations

import hashlib
import os
import pathlib
import re
import urllib.parse
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Mapping

# ─────────────────────────────────────────────────────────────────────────────
# Autoridade de caminho — constante governada, não observação
# ─────────────────────────────────────────────────────────────────────────────

#: A raiz aprovada do runtime da Creditum. CONSTANTE, não derivada de ambiente.
#:
#: `HERMES_HOME` passou a ser uma OBSERVAÇÃO que tem de bater com isto. Antes ela
#: definia a autoridade, e `HERMES_HOME=/tmp/x` com `cwd=/tmp/x` passava: a variável
#: escolhia a regra e depois se declarava conforme.
APPROVED_HERMES_HOME = "/data"


class RuntimeDefect:
    RUNTIME_NOT_RESOLVED = "RUNTIME_NOT_RESOLVED"
    RUNTIME_INCOMPATIBLE = "RUNTIME_INCOMPATIBLE"
    HERMES_HOME_NOT_APPROVED = "HERMES_HOME_NOT_APPROVED"
    CWD_NOT_ALLOWED = "CWD_NOT_ALLOWED"
    BINDING_FORGED = "BINDING_FORGED"
    RUNTIME_MATERIAL_NOT_APPROVED = "RUNTIME_MATERIAL_NOT_APPROVED"
    RUNTIME_IDENTITY_MISMATCH = "RUNTIME_IDENTITY_MISMATCH"
    BASE_URL_NOT_APPROVED = "BASE_URL_NOT_APPROVED"
    SECRET_MATERIAL_INVALID = "SECRET_MATERIAL_INVALID"
    HERMES_RUNTIME_NOT_AVAILABLE = "HERMES_RUNTIME_NOT_AVAILABLE"
    HERMES_CONFIG_LOAD_FAILED = "HERMES_CONFIG_LOAD_FAILED"
    HERMES_RUNTIME_RESOLUTION_FAILED = "HERMES_RUNTIME_RESOLUTION_FAILED"
    LIVE_AUTHORIZATION_FORGED = "LIVE_AUTHORIZATION_FORGED"


class RuntimeRefusal(Exception):
    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect
        self.detail = detail


def _canonico(caminho: object) -> pathlib.Path | None:
    """
    Caminho canônico, ou `None` quando não é caminho.

    `resolve()` antes de comparar: `/data/../tmp`, um caminho relativo e um symlink
    apontando para fora seriam caminhos diferentes do mesmo destino — ou o mesmo
    caminho de destinos diferentes.

    Devolve o `Path`, e não o texto dele. O único consumidor compara por igualdade, e
    `Path.__eq__` já compara o destino normalizado. Converter para texto aqui não
    servia à comparação: servia apenas para obrigar o portão de higiene a abrir uma
    exceção para `str(...resolve())` — e uma exceção por GRAFIA vale para qualquer
    objeto cujo método se chame `resolve`.
    """
    if type(caminho) is not str or not caminho:
        return None
    try:
        return pathlib.Path(caminho).resolve(strict=False)
    except OSError:
        return None


def approved_hermes_home_ok(observado: object | None = None) -> bool:
    """
    O `HERMES_HOME` OBSERVADO é o aprovado?

    Ausente é recusa, não convite. A ausência de uma observação nunca autoriza confiar
    em outra coisa no lugar dela.
    """
    valor = os.environ.get("HERMES_HOME") if observado is None else observado
    canonico = _canonico(valor)
    return canonico is not None and canonico == _canonico(APPROVED_HERMES_HOME)


def governed_cwd_ok(cwd: object) -> bool:
    """
    O cwd é a raiz aprovada — e o `HERMES_HOME` observado também?

    As DUAS coisas, de forma independente. `cwd == HERMES_HOME` não basta: era
    exatamente a equivalência que deixava o ambiente escolher a regra.
    """
    if not approved_hermes_home_ok():
        return False
    canonico = _canonico(cwd)
    return canonico is not None and canonico == _canonico(APPROVED_HERMES_HOME)


# ─────────────────────────────────────────────────────────────────────────────
# Material de execução — vocabulário FECHADO
# ─────────────────────────────────────────────────────────────────────────────

#: ─── Identidade de runtime APROVADA — 3.1d-c ────────────────────────────────
#:
#: A descoberta somente-leitura em produção FIXOU estes três. Não são default nem
#: sugestão: são a única identidade que o vínculo aceita nesta fase.
#:
#: Se a configuração do Hermes mudar, o vínculo recusa com `RUNTIME_IDENTITY_MISMATCH`.
#: Não existe upgrade silencioso e não existe fallback — um modelo diferente do
#: aprovado é outro raciocínio, e trocá-lo sem decisão seria trocar a cognição por
#: conveniência de configuração.
APPROVED_PROVIDER = "openai-codex"
APPROVED_MODEL = "gpt-5.6-luna"
APPROVED_API_MODE = "codex_responses"

#: As chaves de material de execução aprovadas. Fechado, e derivado de OBSERVAÇÃO.
#:
#: A 3.1d-c observou que o caminho `codex_responses` exige `base_url` E `api_key`, e
#: observou que NÃO exige `command`, `args`, `credential_pool` nem `fallback_model`.
#:
#: `api_key` entra aqui como material SECRETO IMUTÁVEL — escalar `str` resolvido pelo
#: resolvedor confiável, nunca parâmetro público. Que o SDK aceite um campo não é
#: autoridade para a Creditum aceitá-lo de um chamador.
#:
#: Os quatro proibidos seguem proibidos por observação, não por omissão.
APPROVED_MATERIAL_KEYS = ("base_url", "api_key")

#: 3.1d-D1 — zero retry automático. NÃO é material de credencial: é controle de
#: execução governado, aplicado deterministicamente na construção do cliente.
GOVERNED_MAX_RETRIES = 0

#: O conjunto EXATO de kwargs que o cliente recebe. Credencial, endpoint e o
#: controle de zero-retry — e NADA além disso.
APPROVED_CLIENT_KWARGS = ("api_key", "base_url", "max_retries")

#: Material exigido. Ausência é recusa: um vínculo sem credencial não é um vínculo
#: "sem credencial", é um vínculo NÃO RESOLVIDO.
REQUIRED_MATERIAL_KEYS = ("base_url", "api_key")

#: Proibidos explicitamente, para que a recusa NOMEIE o campo em vez de dizer
#: genericamente "chave não aprovada".
FORBIDDEN_MATERIAL_KEYS = ("command", "args", "credential_pool", "fallback_model")

#: Mapping vazio e somente-leitura. Compartilhável porque não tem o que mutar.
_MATERIAL_VAZIO: Mapping[str, Any] = MappingProxyType({})


def _material_url(valor: object) -> str:
    """
    `base_url`: `str` exata, `https`, com host, e SEM nada mais.

    ─── Por que recusar em vez de limpar ─────────────────────────────────────

    `https://user:pass@host/p?token=x#f` tem quatro lugares onde credencial viaja:
    userinfo, query, fragment e path. Tirar em silêncio e seguir entregaria um endpoint
    que o resolvedor não pretendia, com a aparência de ter sido aprovado — e o dia em
    que o token estivesse na query seria o dia em que ele iria para o log de alguém.

    Um `base_url` malformado é uma configuração errada. Configuração errada é recusa.
    """
    if type(valor) is not str or not valor:
        raise RuntimeRefusal(RuntimeDefect.BASE_URL_NOT_APPROVED, "tem de ser str não vazia")
    try:
        p = urllib.parse.urlsplit(valor)
    except ValueError:
        raise RuntimeRefusal(RuntimeDefect.BASE_URL_NOT_APPROVED, "não parseável") from None
    if p.scheme != "https":
        raise RuntimeRefusal(RuntimeDefect.BASE_URL_NOT_APPROVED, "scheme tem de ser https")
    if not p.hostname:
        raise RuntimeRefusal(RuntimeDefect.BASE_URL_NOT_APPROVED, "hostname ausente")
    for nome, presente in (
        ("username", p.username is not None),
        ("password", p.password is not None),
        ("query", p.query != ""),
        ("fragment", p.fragment != ""),
    ):
        if presente:
            # A recusa nomeia a PARTE, nunca o valor: dizer "query" não publica o token.
            raise RuntimeRefusal(RuntimeDefect.BASE_URL_NOT_APPROVED, f"{nome} não permitido")
    return valor


def _material_secreto(valor: object) -> str:
    """
    `api_key`: `str` exata e não vazia, e nada além disso.

    Objeto de credencial, provider de segredo, wrapper mutável: recusados. Um objeto de
    credencial é código que roda na hora de ler a credencial, e o vínculo não empresta
    autoridade de execução a um valor.
    """
    if type(valor) is not str or not valor:
        raise RuntimeRefusal(RuntimeDefect.SECRET_MATERIAL_INVALID, "tem de ser str não vazia")
    return valor


#: Um validador por chave aprovada. Sem validador genérico de escape.
_VALIDADORES_DE_MATERIAL = {"base_url": _material_url, "api_key": _material_secreto}


def _snapshot_material(material: object) -> Mapping[str, Any]:
    """
    A fronteira de propriedade do material de execução.

    ─── O defeito que isto fecha ─────────────────────────────────────────────

    A r1 fazia `dict(material)`: copiava a CASCA. Um valor aninhado mutável seguia
    sendo o objeto do chamador, e a saída de kwargs o devolvia por referência.
    Material aprovado na emissão podia mudar DEPOIS da aprovação, sem revalidação.

    A correção não é copiar mais fundo — é não admitir o que teria fundo. O
    vocabulário só aceita escalares imutáveis, então a pergunta "a cópia foi
    profunda?" deixa de existir.

    ─── Por que `type(material) is not dict` e não `isinstance` ───────────────

    Uma subclasse de `dict` pode sobrescrever `__getitem__` e devolver um valor
    diferente em cada leitura: validar-e-guardar leria duas vezes e guardaria o que
    não foi validado. Exigir o tipo exato mata esse caminho.

    Cada valor é lido UMA vez, e o que se guarda é o que o validador devolveu.
    """
    if material is None:
        return _MATERIAL_VAZIO
    if type(material) is not dict:
        raise RuntimeRefusal(
            RuntimeDefect.RUNTIME_MATERIAL_NOT_APPROVED,
            f"material tem de ser dict, veio {safe_type_name(material)}",
        )
    proprio: dict[str, Any] = {}
    for chave in material:
        if type(chave) is not str or chave not in _VALIDADORES_DE_MATERIAL:
            # Nomear o proibido explicitamente: "credential_pool é proibido" ensina, e
            # "chave não aprovada" faria alguém pensar que foi erro de digitação.
            proibido = chave in FORBIDDEN_MATERIAL_KEYS if type(chave) is str else False
            raise RuntimeRefusal(
                RuntimeDefect.RUNTIME_MATERIAL_NOT_APPROVED,
                # A chave vem do resolvedor. `!r` publicaria o conteúdo dela.
                f"{safe_label(chave, FORBIDDEN_MATERIAL_KEYS)} é proibido"
                if proibido
                else f"chave não aprovada: {safe_type_name(chave)}",
            )
        proprio[chave] = _VALIDADORES_DE_MATERIAL[chave](material[chave])
    for exigida in REQUIRED_MATERIAL_KEYS:
        if exigida not in proprio:
            # Ausência não é "sem credencial": é NÃO RESOLVIDO.
            raise RuntimeRefusal(RuntimeDefect.RUNTIME_NOT_RESOLVED, f"{exigida} ausente")
    return MappingProxyType(proprio)


# ─────────────────────────────────────────────────────────────────────────────
# Vínculo de runtime aprovado
# ─────────────────────────────────────────────────────────────────────────────

#: Sentinela do emissor. Objeto de módulo, comparado por IDENTIDADE.
#:
#: Um objeto forjado com os mesmos campos não carrega ESTE objeto, então não passa.
#: É o que separa "tem a forma de um vínculo" de "veio do resolvedor".
_EMISSOR = object()


def _mascarar(material: Mapping[str, Any]) -> str:
    """Só os NOMES dos campos. Nunca os valores."""
    return "{" + ", ".join(f"{k}=<omitido>" for k in sorted(material)) + "}"


@dataclass(frozen=True)
class ApprovedRuntimeBinding:
    """
    O runtime aprovado: identidade segura + material de execução opaco.

    Criável SOMENTE pelo resolvedor. O construtor exige o sentinela do emissor, e um
    objeto com os mesmos campos não o tem.

    ─── Por que identidade e material são separados ──────────────────────────

    A identidade (provider, modelo, api_mode) entra em relatório e auditoria: ela é o
    que se compara no portão final. O material de execução (base_url, credencial,
    comando) nunca sai — nem em `repr`, nem em erro, nem em log.

    Misturar os dois faria a auditoria carregar segredo por acidente, e o dia em que
    alguém imprimisse o vínculo para depurar seria o dia do vazamento.
    """

    _issuer: Any
    hermes_version: str
    acp_version: str
    provider: str
    model: str
    api_mode: str
    hermes_home: str
    #: Opaco. Só `to_client_kwargs()` o lê, e ele nunca é renderizado.
    #:
    #: Substituído no `__post_init__` pelo snapshot próprio e somente-leitura. O que
    #: o chamador passou não é o que o vínculo guarda.
    _execution_material: Mapping[str, Any] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if self._issuer is not _EMISSOR:
            raise RuntimeRefusal(RuntimeDefect.BINDING_FORGED)
        for campo, valor in (
            ("hermes_version", self.hermes_version),
            ("acp_version", self.acp_version),
            ("provider", self.provider),
            ("model", self.model),
            ("api_mode", self.api_mode),
        ):
            if type(valor) is not str or not valor:
                raise RuntimeRefusal(RuntimeDefect.RUNTIME_NOT_RESOLVED, campo)
        # A identidade tem de ser A APROVADA, não "uma identidade bem formada". Aceitar
        # qualquer trio consistente provaria forma, não procedência.
        for campo, valor, aprovado in (
            ("provider", self.provider, APPROVED_PROVIDER),
            ("model", self.model, APPROVED_MODEL),
            ("api_mode", self.api_mode, APPROVED_API_MODE),
        ):
            if valor != aprovado:
                raise RuntimeRefusal(
                    RuntimeDefect.RUNTIME_IDENTITY_MISMATCH, f"{campo} esperado {aprovado}"
                )
        if not approved_hermes_home_ok(self.hermes_home):
            raise RuntimeRefusal(
                RuntimeDefect.HERMES_HOME_NOT_APPROVED, f"esperado {APPROVED_HERMES_HOME}"
            )
        # A fronteira de propriedade fica no TIPO, não em um chamador. Qualquer
        # caminho que construa um vínculo — resolvedor, fixture, futuro emissor —
        # atravessa esta linha. Pôr o snapshot no resolvedor deixaria a garantia
        # valendo só para quem lembrasse de chamá-lo.
        object.__setattr__(
            self, "_execution_material", _snapshot_material(self._execution_material)
        )

    def __repr__(self) -> str:
        # `repr` explícito: o default de dataclass mostraria o dicionário de material.
        return (
            "ApprovedRuntimeBinding("
            f"hermes={self.hermes_version}, acp={self.acp_version}, "
            f"provider={self.provider}, model={self.model}, api_mode={self.api_mode}, "
            f"material={_mascarar(self._execution_material)})"
        )

    __str__ = __repr__

    def safe_identity(self) -> dict[str, str]:
        """Só o que pode sair. Nada de material de execução."""
        return {
            "hermes_version": self.hermes_version,
            "acp_version": self.acp_version,
            "provider": self.provider,
            "model": self.model,
            "api_mode": self.api_mode,
        }

    def to_client_kwargs(self) -> dict[str, Any]:
        """
        Os argumentos do CLIENTE do provider. FECHADO, NOVO — e carrega o segredo.

        Só a execução VIVA chama isto. A sonda PRECALL não constrói cliente, então o
        segredo não é lido nem materializado no modo público.

        ─── Dicionário novo a cada chamada ───────────────────────────────────

        Devolver o estado interno deixaria o CONSUMIDOR envenenar o vínculo. O
        dicionário é novo e todo valor é escalar imutável.
        """
        return {
            "api_key": self._execution_material["api_key"],
            "base_url": self._execution_material["base_url"],
            # ─── 3.1d-D1: zero retry, e ele só existe AQUI ──────────────────
            #
            # A 3.1d-D1 observou em produção: `OpenAI.__init__` traz
            # `max_retries=2` por padrão, e `Responses.create` NÃO aceita o
            # parâmetro. Sem esta linha, UMA autorização humana viraria três
            # tentativas em silêncio.
            #
            # Constante NOSSA, não material do vínculo: `APPROVED_MATERIAL_KEYS`
            # continua sendo o vocabulário de CREDENCIAL, fechado em dois. Retry é
            # controle de execução, e o chamador não escolhe.
            "max_retries": GOVERNED_MAX_RETRIES,
        }

    def base_url_fingerprint(self) -> str:
        """
        Identidade do endpoint sem publicar o endpoint.

        Hash de domínio separado: prova que o `base_url` é AQUELE sem transportar host,
        porta ou caminho para relatório e auditoria. Hostname em log é topologia interna
        de graça para quem lê o log.
        """
        material = "hermes_codex_base_url/v1:" + self._execution_material["base_url"]
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def has_secret_material(self) -> bool:
        """Existe credencial resolvida? Booleano — nunca o valor."""
        return type(self._execution_material.get("api_key")) is str


#: O caminho autoritativo observado pela 3.1d-c4, em produção.
#:
#:     /opt/hermes-agent/hermes_cli/runtime_provider.py :: resolve_runtime_provider
#:     hermes_cli.config.load_config()  →  config["model"]["default"]
HERMES_RUNTIME_MODULE = "hermes_cli.runtime_provider"
HERMES_CONFIG_MODULE = "hermes_cli.config"


#: Identificador ASCII conservador. A ÚNICA forma que um nome de tipo pode ter.
#:
#: ─── Por que não `str.isidentifier()` ─────────────────────────────────────────
#:
#: `isidentifier()` aceita identificador UNICODE. Um nome com homóglifo cirílico,
#: marca de direção ou caractere invisível passaria — e o destino é o stderr de um
#: terminal, que interpreta sequência de controle.
#:
#: Allowlist, e não busca por conteúdo ruim: procurar o ruim exige conhecer todo o
#: ruim, e o próximo caractere hostil nasce fora da lista.
_NOME_DE_TIPO_SEGURO = re.compile(r"\A[A-Za-z_][A-Za-z0-9_]{0,63}\Z")

#: O nome fixo para tudo que não passa. Nada de "desconhecido: <coisa>".
TIPO_DESCONHECIDO = "Exception"


def safe_type_name(valor: object) -> str:
    """
    O NOME DO TIPO de um valor externo. Nunca o valor.

    ─── Por que nomear o tipo em vez de mostrar o valor ──────────────────────

    "esperava str, veio dict" diz o que o operador precisa saber. `repr(valor)`
    diria a mesma coisa E publicaria o conteúdo — que, vindo do resolvedor ou da
    resposta do modelo, pode ser credencial.

    E `repr()` de objeto de terceiro EXECUTA o `__repr__` dele. O objeto escolhe o
    que aparece no nosso stderr.
    """
    nome = type(valor).__name__
    if type(nome) is not str or _NOME_DE_TIPO_SEGURO.match(nome) is None:
        return TIPO_DESCONHECIDO
    return nome


def safe_label(valor: object, permitidos: tuple[str, ...]) -> str:
    """
    Ecoa o valor SÓ se ele for um `str` exato de uma lista governada.

    Para diagnóstico é útil dizer "status=incomplete". Mas `status` vem do objeto de
    resposta, e ecoar texto externo é como esta arca vazou quatro vezes.

    Allowlist: o que está na lista aparece; o resto vira o nome do tipo. Um valor
    fora da lista é exatamente o caso em que não se sabe o que ele é.
    """
    if type(valor) is str and valor in permitidos:
        return valor
    return safe_type_name(valor)


def safe_exception_type(exc: BaseException) -> str:
    """
    Nome do tipo da exceção, ou o fixo. NUNCA texto de terceiro.

    `type(exc).__name__` é escolhido por quem escreve a classe, e construir uma classe
    com nome arbitrário — `type(<qualquer texto>, (Exception,), {})` — é Python legal.
    O nome de classe é, portanto, texto controlado por TERCEIRO, e um regate mostrou
    que ele saía cru pelo catch-all da CLI.

    Não se chama `str(exc)` nem `repr(exc)` aqui. Lê-se o nome, confere-se a forma, e
    o que não tem a forma vira `Exception`.
    """
    nome = type(exc).__name__
    if type(nome) is not str or _NOME_DE_TIPO_SEGURO.match(nome) is None:
        return TIPO_DESCONHECIDO
    return nome


def _chamada_selada(defeito: str, fn: Any, *args: Any, **kwargs: Any) -> Any:
    """
    Executa uma chamada de TERCEIRO atrás de uma fronteira que não deixa passar texto.

    ─── O defeito que isto fecha ─────────────────────────────────────────────

    `load_config()` e `resolve_runtime_provider()` resolvem credencial. Uma exceção
    deles pode carregar `api_key`, `base_url` ou um repr do dicionário de config na
    MENSAGEM — e a mensagem ia parar no traceback que o Python imprime em stderr.

    ─── Por que a mensagem não é usada, e não "limpa" ────────────────────────

    Redigir por regex, tirar query string ou procurar o segredo dentro do texto exige
    saber o formato do que se procura. Segredo em formato inesperado passaria, e a
    limpeza daria a impressão de que passou limpo.

    A regra simples é não usar o texto. Nem `str`, nem `repr`, nem `args`. Só o TIPO,
    e mesmo ele conferido.

    `from None` corta o encadeamento: sem isso o traceback renderiza a causa original,
    e a mensagem voltaria por baixo.
    """
    try:
        return fn(*args, **kwargs)
    except Exception as causa:  # noqa: BLE001
        tipo = safe_exception_type(causa)
        # A exceção original morre AQUI. Nada dela é guardado nem referenciado.
        del causa
        raise RuntimeRefusal(defeito, tipo) from None


def _texto_governado(valor: Any, padrao: str) -> str:
    """
    Aceita `str` exata do resolvedor, ou usa o padrão próprio.

    `str(valor)` sobre um objeto do resolvedor executaria o `__str__` DELE, e o
    resultado viraria campo do vínculo — que aparece em `repr` e em relatório. Um
    campo de versão não vale abrir essa porta.
    """
    return valor if type(valor) is str and valor else padrao


def _import_producao(modulo: str) -> Any:
    """
    Import TARDIO do runtime do Hermes. A máquina que escreve isto não o tem.

    Import no topo do módulo faria o pacote inteiro exigir produção — e os testes
    locais, que provam a governança, deixariam de rodar. A ausência aqui é recusa
    nomeada, não `ImportError` no meio de uma sessão.
    """
    import importlib

    try:
        return importlib.import_module(modulo)
    except Exception as causa:  # noqa: BLE001
        # `modulo` é constante NOSSA; o tipo vem de fora e é conferido.
        tipo = safe_exception_type(causa)
        del causa
        raise RuntimeRefusal(RuntimeDefect.HERMES_RUNTIME_NOT_AVAILABLE, f"{modulo}: {tipo}") from None


def _selecionar_modelo(config: Any) -> str:
    """
    O modelo vem de `config["model"]["default"]` — a SELEÇÃO autoritativa.

    ─── Por que não do retorno do resolvedor ─────────────────────────────────

    A 3.1d-c4 observou que `resolve_runtime_provider()` pode NÃO devolver campo de
    modelo quando quem chama já o selecionou. Ler o modelo de lá daria, às vezes,
    ausência — e ausência lida como "sem modelo" viraria fallback.

    Reproduzir a semântica de seleção é o que torna a leitura fiel ao que produção faz.
    """
    if type(config) is not dict:
        raise RuntimeRefusal(RuntimeDefect.RUNTIME_NOT_RESOLVED, "config não é dict")
    bloco = config.get("model")
    if type(bloco) is not dict:
        raise RuntimeRefusal(RuntimeDefect.RUNTIME_NOT_RESOLVED, "config['model'] ausente")
    escolhido = bloco.get("default")
    if type(escolhido) is not str or not escolhido:
        raise RuntimeRefusal(RuntimeDefect.RUNTIME_NOT_RESOLVED, "config['model']['default']")
    return escolhido


def resolve_approved_runtime_binding() -> ApprovedRuntimeBinding:
    """
    O ÚNICO caminho de produção que cria o vínculo. SEM argumento de chamador.

    ─── O que a 3.1d-c4 observou, e o que isso muda ──────────────────────────

    O resolvedor autoritativo existe e foi observado:

        hermes_cli.runtime_provider.resolve_runtime_provider(...)
        hermes_cli.config.load_config()  →  config["model"]["default"]

    Identidade efetiva: `openai-codex` / `gpt-5.6-luna` / `codex_responses`.

    ─── O que continua NÃO sendo autoridade ──────────────────────────────────

    `explicit_api_key` e `explicit_base_url` existem na assinatura do resolvedor do
    Hermes e NÃO são passados. Deixá-los ausentes é o que faz o Hermes usar o próprio
    caminho governado de credencial. Preenchê-los daqui — de ambiente ou de chamador —
    transformaria quem invoca em dono da credencial, que é o defeito que a r1 fechou.

    Esta função não tem parâmetro nenhum. Não há o que injetar.
    """
    provider_mod = _import_producao(HERMES_RUNTIME_MODULE)
    config_mod = _import_producao(HERMES_CONFIG_MODULE)

    config = _chamada_selada(RuntimeDefect.HERMES_CONFIG_LOAD_FAILED, config_mod.load_config)
    modelo = _selecionar_modelo(config)
    if modelo != APPROVED_MODEL:
        raise RuntimeRefusal(
            RuntimeDefect.RUNTIME_IDENTITY_MISMATCH, f"model esperado {APPROVED_MODEL}"
        )

    # Invocação MÍNIMA: nada de credencial nem endpoint vindos daqui.
    resolvido = _chamada_selada(
        RuntimeDefect.HERMES_RUNTIME_RESOLUTION_FAILED,
        provider_mod.resolve_runtime_provider,
        target_model=modelo,
    )
    if type(resolvido) is not dict:
        raise RuntimeRefusal(RuntimeDefect.RUNTIME_NOT_RESOLVED, "resolvedor não devolveu dict")

    provider = resolvido.get("provider")
    api_mode = resolvido.get("api_mode")
    for campo, valor, aprovado in (
        ("provider", provider, APPROVED_PROVIDER),
        ("api_mode", api_mode, APPROVED_API_MODE),
    ):
        if valor != aprovado:
            raise RuntimeRefusal(
                RuntimeDefect.RUNTIME_IDENTITY_MISMATCH, f"{campo} esperado {aprovado}"
            )

    # Só as duas chaves aprovadas atravessam. `credential_pool` pode existir no retorno
    # do Hermes e NÃO entra: aparecer no resolvedor não é autorização.
    material = {"base_url": resolvido.get("base_url"), "api_key": resolvido.get("api_key")}

    return ApprovedRuntimeBinding(
        _issuer=_EMISSOR,
        hermes_version=_texto_governado(resolvido.get("hermes_version"), "0.20.4"),
        acp_version=_texto_governado(resolvido.get("acp_version"), "0.9.0"),
        provider=APPROVED_PROVIDER,
        model=modelo,
        api_mode=APPROVED_API_MODE,
        hermes_home=APPROVED_HERMES_HOME,
        _execution_material=material,  # type: ignore[arg-type]
    )


# ─────────────────────────────────────────────────────────────────────────────
# Autorização de execução VIVA
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class LiveExecutionAuthorization:
    """
    A capacidade que autoriza chamar o provider.

    ─── Não existe emissor de produção ───────────────────────────────────────

    Nenhuma função pública deste pacote devolve uma destas. A CLI não cria. O
    construtor público de agente não aceita. Portanto `LIVE` é **inalcançável** pela
    API pública nesta fase — e essa é a decisão, não uma limitação.

    O emissor será ligado depois da prova PRECALL em produção (3.1d-c) e de uma
    decisão arquitetural explícita. Até lá, a ausência é a garantia.
    """

    _issuer: Any

    def __post_init__(self) -> None:
        if self._issuer is not _EMISSOR:
            # Um objeto forjado com o mesmo campo não carrega ESTE sentinela.
            raise RuntimeRefusal(RuntimeDefect.LIVE_AUTHORIZATION_FORGED)


def live_authorization_is_valid(auth: object) -> bool:
    """
    Autorização válida?

    Ausente, forjada ou de outro tipo: NÃO. `isinstance` sozinho não bastaria —
    a validação real aconteceu no construtor, que exigiu o sentinela.
    """
    return type(auth) is LiveExecutionAuthorization
