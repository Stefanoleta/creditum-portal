"""
Fase 3.1d-b-r3 — a requisição Codex Responses governada, e o portão final.

─── O pivô, e a razão dele ──────────────────────────────────────────────────

Até a r2 o caminho de execução passava por `run_agent.AIAgent.run_conversation`. As
descobertas c2/c3 mostraram o que isso obriga a herdar:

    c2   o AIAgent SEMPRE descobre plugins; o portão da r2 ficava ANTES da mutação do
         relay, então ele validava um payload que o relay ainda podia mudar
    c3   não existe costura oficial para pular plugin; o lifecycle pode descobrir de
         forma tardia; e a superfície de telemetria/rede ANTES do portão não foi
         provada ausente

A conclusão não é "endurecer mais". É que a superfície estava do lado errado da
fronteira: para governar o AIAgent seria preciso governar tudo que ele carrega.

A r3 remove o AIAgent. A Creditum constrói UMA requisição Codex Responses fechada e a
entrega direto ao SDK do provider. O que não existe no caminho não precisa de portão.

─── O que este módulo NÃO importa, nunca ────────────────────────────────────

`run_agent` — porque importá-lo EXECUTA `load_hermes_dotenv()` no import, e um import
que lê segredo do disco é um efeito colateral que nenhuma leitura de código local
denuncia. Nem plugin, nem lifecycle, nem middleware, nem relay.

O import do SDK é TARDIO e só no caminho vivo: a sonda pública prova a semântica da
requisição sem tocar em biblioteca de rede.

─── Fronteira de capacidade do SDK ──────────────────────────────────────────

O SDK `openai` 2.24.0 NÃO está instalado na máquina que escreve isto, então a forma
exata de `responses.create` e do objeto de resposta é DECLARADA aqui, não observada.

A 3.1b-r3 nasceu exatamente deste erro — adivinhar API upstream — e a regra que ficou
foi: não adivinhar. Então isto não adivinha em silêncio: `verify_sdk_surface()` confere
a superfície declarada contra a instalada e RECUSA quando divergem. Um palpite errado
vira recusa nomeada no host de produção, não resultado errado.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

from .contract import SystemContract
from .runtime import (
    APPROVED_API_MODE,
    safe_exception_type,
    safe_label,
    safe_type_name,
    APPROVED_MODEL,
    APPROVED_PROVIDER,
    ApprovedRuntimeBinding,
)


class CodexDefect:
    REQUEST_NOT_CANONICAL = "REQUEST_NOT_CANONICAL"
    SYSTEM_CONTRACT_MISMATCH = "SYSTEM_CONTRACT_MISMATCH"
    USER_PAYLOAD_MISMATCH = "USER_PAYLOAD_MISMATCH"
    TOOLS_NOT_ZERO = "TOOLS_NOT_ZERO"
    RUNTIME_IDENTITY_MISMATCH = "RUNTIME_IDENTITY_MISMATCH"
    SECRET_IN_REQUEST = "SECRET_IN_REQUEST"
    SDK_SURFACE_INCOMPATIBLE = "SDK_SURFACE_INCOMPATIBLE"
    RESULT_NOT_COMPLETE = "RESULT_NOT_COMPLETE"
    RESULT_AMBIGUOUS = "RESULT_AMBIGUOUS"
    OUTPUT_NOT_VALIDATED = "OUTPUT_NOT_VALIDATED"

    # ─── 3.1d-c6: política governada de extração de `Response.output` ────────
    #
    # Códigos próprios e determinísticos. Um defeito por condição, e a mesma resposta
    # malformada devolve sempre o mesmo — a ordem de iteração não escolhe o veredito.
    RESPONSE_TYPES_NOT_AVAILABLE = "RESPONSE_TYPES_NOT_AVAILABLE"
    SDK_VERSION_NOT_APPROVED = "SDK_VERSION_NOT_APPROVED"

    # ─── 3.1d-D1: controles de execução, separados do pedido semântico ───────
    EXECUTION_CONTROLS_NOT_CANONICAL = "EXECUTION_CONTROLS_NOT_CANONICAL"
    EXECUTION_BACKGROUND_NOT_APPROVED = "EXECUTION_BACKGROUND_NOT_APPROVED"
    EXECUTION_TIMEOUT_NOT_APPROVED = "EXECUTION_TIMEOUT_NOT_APPROVED"
    RESPONSE_TYPE_NOT_APPROVED = "RESPONSE_TYPE_NOT_APPROVED"
    RESPONSE_ERROR_PRESENT = "RESPONSE_ERROR_PRESENT"
    RESPONSE_STATUS_NOT_COMPLETED = "RESPONSE_STATUS_NOT_COMPLETED"
    RESPONSE_INCOMPLETE = "RESPONSE_INCOMPLETE"
    RESPONSE_OUTPUT_NOT_AVAILABLE = "RESPONSE_OUTPUT_NOT_AVAILABLE"
    RESPONSE_OUTPUT_ITEM_NOT_APPROVED = "RESPONSE_OUTPUT_ITEM_NOT_APPROVED"
    RESPONSE_MESSAGE_COUNT_INVALID = "RESPONSE_MESSAGE_COUNT_INVALID"
    RESPONSE_MESSAGE_ROLE_INVALID = "RESPONSE_MESSAGE_ROLE_INVALID"
    RESPONSE_MESSAGE_NOT_COMPLETED = "RESPONSE_MESSAGE_NOT_COMPLETED"
    RESPONSE_CONTENT_COUNT_INVALID = "RESPONSE_CONTENT_COUNT_INVALID"
    RESPONSE_CONTENT_NOT_APPROVED = "RESPONSE_CONTENT_NOT_APPROVED"
    RESPONSE_OUTPUT_TEXT_INVALID = "RESPONSE_OUTPUT_TEXT_INVALID"
    RESPONSE_OUTPUT_TEXT_EMPTY = "RESPONSE_OUTPUT_TEXT_EMPTY"

    #: DESFECHO CONTROLADO, não erro de estrutura. O modelo recusou, a resposta estava
    #: bem formada, e isso é um fato — não um raciocínio, não um insight, não conteúdo
    #: a repassar. O TEXTO da recusa NUNCA atravessa.
    MODEL_REFUSED = "MODEL_REFUSED"


class CodexRefusal(Exception):
    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect
        self.detail = detail


class PrecallProbeComplete(Exception):
    """
    Sucesso da sonda, não erro.

    Tipo próprio de propósito: um `CodexRefusal` significaria que algo foi recusado, e
    quem tratasse exceção por classe genérica contaria a prova como falha.
    """


# ═════════════════════════════════════════════════════════════════════════════
# A requisição — vocabulário FECHADO
# ═════════════════════════════════════════════════════════════════════════════

#: Os campos que a requisição governada pode ter. Fechado.
#:
#: `instructions` carrega o contrato de sistema; `input` carrega a única pergunta
#: governada; `tools` é a negação explícita; `stream` é política, não estilo.
#:
#: Não existe `extra_body`, `extra_query`, `extra_headers`, `timeout`, `metadata`,
#: `tool_choice`, `service_tier` nem `reasoning`. Não é esquecimento: é a lista.
REQUEST_FIELDS = ("model", "instructions", "input", "tools", "stream")

#: ─── Por que `tools=[]` explícito e não `tools` omitido ─────────────────────
#:
#: A 3.1b mediu o custo de "ausente": `enabled_toolsets=None` significava "use o
#: padrão", e o padrão eram 20 ferramentas. Omitir um campo pede o default do
#: provider; declarar `[]` diz NENHUMA.
#:
#: Ausência nunca é zero. A lista vazia é a única forma que afirma zero.
GOVERNED_TOOLS: tuple[Any, ...] = ()

#: Não-streaming na primeira execução governada: precisamos de UM resultado JSON
#: completo, e nada de delta bruto pode escapar antes da validação.
GOVERNED_STREAM = False

CREATE_EXECUTION_CONTROL_FIELDS = ("background", "timeout")

#: Modo de execução do servidor. Explícito, e só este valor.
GOVERNED_BACKGROUND = False

#: O teto APROVADO de uma tentativa. O timeout efetivo é derivado do orçamento
#: monotônico restante, calculado pelo orquestrador TypeScript, e nunca o excede.
LIVE_ATTEMPT_DEADLINE_SECONDS = 180

#: O conjunto EXATO de chaves que `Responses.create` recebe. União, sem extras.
FINAL_CREATE_FIELDS = tuple(REQUEST_FIELDS) + CREATE_EXECUTION_CONTROL_FIELDS

#: ─── `reasoning` foi OMITIDO de propósito ───────────────────────────────────
#:
#: A 3.1d-c não observou uma configuração de reasoning exigida por este caminho.
#: Inventar uma seria escolher como o modelo pensa com base em palpite. Omitido, e
#: registrado como pergunta para a próxima descoberta.
REASONING_OMITTED_BY_DECISION = True

USER_PAYLOAD_HASH_DOMAIN = "hermes_codex_user_payload/v1"
REQUEST_HASH_DOMAIN = "hermes_codex_request/v1"


def governed_user_payload(read_model: Mapping[str, Any]) -> str:
    """
    O payload determinístico, derivado do read model PRÓPRIO — e de nada mais.

    `sort_keys` e separadores fixos: a mesma entrada tem de dar os mesmos bytes, senão
    o hash não prova nada e a comparação exata do portão viraria comparação de sorte.
    """
    if type(read_model) is not dict:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "read_model não é dict")
    return json.dumps(read_model, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(dominio: str, texto: str) -> str:
    return hashlib.sha256(f"{dominio}:{texto}".encode("utf-8")).hexdigest()


def user_payload_hash(payload: str) -> str:
    return _hash(USER_PAYLOAD_HASH_DOMAIN, payload)


def build_governed_request(
    *,
    binding: ApprovedRuntimeBinding,
    contract: SystemContract,
    user_payload: str,
) -> Mapping[str, Any]:
    """
    A requisição fechada, construída SÓ de material próprio.

    Estruturas planas e valores escalares. Nenhuma coleção do chamador entra, nada
    mutável é compartilhado, e o retorno é somente-leitura para que ninguém entre o
    portão e a rede possa mexer nele.

    O `model` sai do VÍNCULO, nunca de argumento — é a mesma autoridade que o portão
    depois compara.
    """
    if type(binding) is not ApprovedRuntimeBinding:
        raise CodexRefusal(CodexDefect.REQUEST_NOT_CANONICAL, "vínculo não aprovado")
    if type(user_payload) is not str or not user_payload:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "payload tem de ser str não vazia")
    texto = contract.text
    if type(texto) is not str or not texto:
        raise CodexRefusal(CodexDefect.SYSTEM_CONTRACT_MISMATCH, "contrato vazio")

    return MappingProxyType(
        {
            "model": binding.model,
            "instructions": texto,
            "input": user_payload,
            "tools": list(GOVERNED_TOOLS),
            "stream": GOVERNED_STREAM,
        }
    )


def request_fingerprint(request: Mapping[str, Any]) -> str:
    """
    Hash da requisição SEM material secreto.

    A requisição governada não contém credencial — o segredo vive no cliente, não no
    corpo. Este hash existe para provar que o que passou no portão é o que foi enviado.
    """
    material = json.dumps(
        {k: request[k] for k in REQUEST_FIELDS if k in request},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return _hash(REQUEST_HASH_DOMAIN, material)


# ═════════════════════════════════════════════════════════════════════════════
# O portão final — imediatamente antes da rede
# ═════════════════════════════════════════════════════════════════════════════


def enforce_final_request(
    request: Any,
    *,
    binding: ApprovedRuntimeBinding,
    contract: SystemContract,
    expected_user_payload: str,
) -> None:
    """
    VERIFICA a requisição exata. Não conserta.

    ─── Uma autoridade só ────────────────────────────────────────────────────

    A expectativa sai do VÍNCULO e do CONTRATO — os mesmos objetos que construíram a
    requisição. Uma expectativa fornecida pelo chamador ao lado provaria consistência
    entre duas escolhas dele, não procedência.

    ─── Igualdade EXATA, não continência ─────────────────────────────────────

    `instructions` tem de ser o contrato inteiro e nada mais. `in`, `startswith` ou
    `endswith` aceitariam texto acrescentado — e texto acrescentado ao system é
    autoridade que a Creditum não escreveu.
    """
    if type(request) is not MappingProxyType and type(request) is not dict:
        raise CodexRefusal(CodexDefect.REQUEST_NOT_CANONICAL, safe_type_name(request))

    chaves = set(request.keys())
    if chaves != set(REQUEST_FIELDS):
        faltando = sorted(set(REQUEST_FIELDS) - chaves)
        sobrando = sorted(chaves - set(REQUEST_FIELDS))
        raise CodexRefusal(
            CodexDefect.REQUEST_NOT_CANONICAL,
            f"faltando={faltando} sobrando={sobrando}",
        )

    # identidade: o modelo que sai é o modelo aprovado
    if request["model"] != binding.model or binding.model != APPROVED_MODEL:
        raise CodexRefusal(CodexDefect.RUNTIME_IDENTITY_MISMATCH, "model")
    if binding.provider != APPROVED_PROVIDER or binding.api_mode != APPROVED_API_MODE:
        raise CodexRefusal(CodexDefect.RUNTIME_IDENTITY_MISMATCH, "provider/api_mode")

    instrucoes = request["instructions"]
    if type(instrucoes) is not str:
        raise CodexRefusal(CodexDefect.SYSTEM_CONTRACT_MISMATCH, safe_type_name(instrucoes))
    if instrucoes != contract.text:
        raise CodexRefusal(CodexDefect.SYSTEM_CONTRACT_MISMATCH, "igualdade exata falhou")

    entrada = request["input"]
    if type(entrada) is not str:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, safe_type_name(entrada))
    if entrada != expected_user_payload:
        raise CodexRefusal(CodexDefect.USER_PAYLOAD_MISMATCH, "igualdade exata falhou")

    ferramentas = request["tools"]
    if type(ferramentas) is not list or len(ferramentas) != 0:
        # Desconhecido falha fechado: uma representação que não sabemos contar não é 0.
        # `repr` truncado ainda é repr: 40 caracteres de conteúdo externo.
        raise CodexRefusal(CodexDefect.TOOLS_NOT_ZERO, safe_type_name(ferramentas))

    if request["stream"] is not GOVERNED_STREAM:
        raise CodexRefusal(CodexDefect.REQUEST_NOT_CANONICAL, "stream fora da política")

    # o corpo não carrega credencial — o segredo vive no cliente
    if binding.has_secret_material():
        segredo = binding.to_client_kwargs()["api_key"]
        for chave in REQUEST_FIELDS:
            valor = request[chave]
            if type(valor) is str and segredo in valor:
                raise CodexRefusal(CodexDefect.SECRET_IN_REQUEST, chave)


# ═════════════════════════════════════════════════════════════════════════════
# Fronteira de capacidade do SDK — DECLARADA, conferida, nunca suposta
# ═════════════════════════════════════════════════════════════════════════════

#: A versão do SDK que a 3.1d-c registrou como instalada em produção.
EXPECTED_SDK_VERSION = "2.24.0"

#: Os argumentos que o CLIENTE recebe. Derivados de `to_client_kwargs()`, não de uma
#: lista paralela que poderia envelhecer sem ninguém notar.
REQUIRED_CLIENT_PARAMS = ("api_key", "base_url")

#: Os argumentos que `responses.create` recebe. Derivados do contrato FECHADO da
#: requisição — a mesma tupla que o portão final confere.
#:
#: Uma lista própria aqui viraria uma segunda declaração do que enviamos, e no dia em
#: que as duas divergissem a conferência estaria provando a lista errada.
#: 3.1d-D1: a superfície verificada tem de aceitar o pedido semântico E os
#: controles. Verificar cinco e enviar sete deixaria dois parâmetros sem conferência
#: de compatibilidade — e a divergência apareceria tarde, na chamada.
REQUIRED_CREATE_PARAMS = FINAL_CREATE_FIELDS


def _aceita_por_palavra_chave(alvo: Any, nomes: tuple[str, ...]) -> str:
    """
    O callable aceita CADA nome como argumento nomeado? `""` quando sim.

    ─── Por que nome igual não basta ─────────────────────────────────────────

    Um parâmetro POSITIONAL_ONLY com o nome certo NÃO pode ser passado por palavra
    chave. Conferir só o nome aprovaria uma assinatura que estoura na chamada — e
    estourar na chamada seria descobrir a incompatibilidade depois de já ter um cliente
    de rede construído.

    `**kwargs` é aceito conscientemente: é a forma como um SDK legitimamente encaminha
    campos, e recusá-la exigiria que o fornecedor escrevesse a assinatura do nosso jeito.
    """
    if not callable(alvo):
        return "não é callable"
    try:
        assinatura = inspect.signature(alvo)
    except (TypeError, ValueError):
        # Assinatura ilegível é DESCONHECIDA, e desconhecida não é compatível.
        return "assinatura não inspecionável"
    parametros = assinatura.parameters
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parametros.values()):
        return ""
    faltando = []
    for nome in nomes:
        p = parametros.get(nome)
        if p is None:
            faltando.append(nome)
        elif p.kind is inspect.Parameter.POSITIONAL_ONLY:
            faltando.append(f"{nome} (posicional-apenas)")
    return "incompatível: " + ", ".join(faltando) if faltando else ""


def sdk_version_is_approved(observada: object) -> bool:
    """
    A ÚNICA comparação de versão do SDK no pacote.

    ─── Por que uma só ───────────────────────────────────────────────────────

    Duas comparações são duas definições de "SDK aprovado", e elas divergem no dia em
    que uma for endurecida. Uma comparação, vários consumidores — cada fronteira
    levanta o SEU defeito, mas nenhuma decide sozinha o que é aprovado.

    ─── Igualdade EXATA, e `type(...) is str` ───────────────────────────────

    Nada de `startswith("2.24")`: `2.24.1` pode mover uma classe de módulo e o nome
    continuaria igual. E uma subclasse de `str` com `__eq__` próprio responderia o que
    quisesse à comparação — tipo não é procedência, mas aqui o tipo errado já basta
    para recusar.
    """
    return type(observada) is str and observada == EXPECTED_SDK_VERSION


def verify_sdk_surface(
    *,
    version: Any,
    client_class: Any,
    create_callable: Any,
) -> None:
    """
    A superfície instalada aceita EXATAMENTE o que vamos passar? Senão, recusa.

    ─── Por que isto existe, e por que a r3 estava errada ────────────────────

    A r3 conferia versão e a EXISTÊNCIA de `OpenAI`. Isso prova que existe um símbolo
    com aquele nome — não que ele aceita `api_key` e `base_url`, nem que
    `responses.create` aceita `instructions`, `input`, `tools` e `stream`.

    Nome parecido não é contrato compatível. E a diferença aparecia tarde: com um
    cliente de rede já construído, na hora da chamada.

    ─── Recebe descritores, não constrói cliente ─────────────────────────────

    A conferência acontece sobre a CLASSE e sobre o descritor do método, então ela roda
    antes de existir qualquer objeto capaz de rede. Este módulo não importa `openai`:
    quem tem o SDK entrega os descritores.
    """
    if not sdk_version_is_approved(version):
        raise CodexRefusal(
            CodexDefect.SDK_SURFACE_INCOMPATIBLE,
            f"versão {safe_label(version, (EXPECTED_SDK_VERSION,))} != {EXPECTED_SDK_VERSION}",
        )
    if client_class is None:
        raise CodexRefusal(CodexDefect.SDK_SURFACE_INCOMPATIBLE, "classe de cliente ausente")
    problema = _aceita_por_palavra_chave(client_class, REQUIRED_CLIENT_PARAMS)
    if problema:
        raise CodexRefusal(CodexDefect.SDK_SURFACE_INCOMPATIBLE, f"construtor {problema}")
    if create_callable is None:
        raise CodexRefusal(CodexDefect.SDK_SURFACE_INCOMPATIBLE, "responses.create ausente")
    problema = _aceita_por_palavra_chave(create_callable, REQUIRED_CREATE_PARAMS)
    if problema:
        raise CodexRefusal(CodexDefect.SDK_SURFACE_INCOMPATIBLE, f"responses.create {problema}")


# ═════════════════════════════════════════════════════════════════════════════
# A resposta — predicado FECHADO de sucesso
# ═════════════════════════════════════════════════════════════════════════════

#: O status que significa concluído. Qualquer outro — `incomplete`, `failed`,
#: `cancelled`, `in_progress` — não é sucesso, e AUSENTE também não.
COMPLETED_STATUS = "completed"

#: Os status que a 3.1d-c4 observou. Fora desta lista: nomeia-se o tipo, não o valor.
KNOWN_STATUSES = (
    "completed",
    "failed",
    "in_progress",
    "cancelled",
    "queued",
    "incomplete",
)

#: Os tipos de item de saída que sabemos ler. Tipo fora desta lista é DESCONHECIDO, e
#: desconhecido falha fechado: um item que não sabemos interpretar pode ser
#: exatamente o que muda o sentido da resposta.
KNOWN_OUTPUT_ITEM_TYPES = ("message",)
KNOWN_CONTENT_BLOCK_TYPES = ("output_text",)


# ═══════════════════════════════════════════════════════════════════════════════
# 3.1d-c6 — POLÍTICA GOVERNADA DE EXTRAÇÃO DE `Response.output`
#
# ─── O que a 3.1d-c5 mediu, e por que isto existe ─────────────────────────────
#
# `Response.output` admite DEZOITO tipos de item. `Response.output_text` percorre
# todos, junta só os blocos `output_text` e devolve a concatenação — apagando
# fronteiras de mensagem, recusas, reasoning e chamadas de ferramenta.
#
# Uma string plausível saindo de uma agregação destrutiva passa por texto de modelo e
# não é. `output_text` está PROIBIDO como fronteira governada, e essa proibição agora
# se apoia em comportamento medido, não em precaução.
#
# ─── Três classes semânticas, e só três ──────────────────────────────────────
#
#   A. CONTRIBUI TEXTO      exatamente UMA mensagem de assistente concluída,
#                           com exatamente UM bloco `output_text`
#   B. RECONHECIDO E OPACO  `reasoning` e `compaction` podem existir, contribuem
#                           ZERO texto, e seus campos NUNCA são lidos
#   C. RECUSADO             todo item de ferramenta/ação, todo tipo futuro, e —
#                           como DESFECHO controlado, não como erro — a recusa
#                           do modelo
#
# ─── Por que identidade de classe, e não `type` declarado ────────────────────
#
# O campo `type` é um dado dentro do objeto: quem constrói o objeto escolhe o valor.
# A classe é o que o SDK selado construiu. Conferem-se as DUAS, e a classe primeiro —
# a r6-r6 já pagou por autorizar pelo nome em vez da identidade três vezes.
#
# ─── Reasoning é opaco de verdade, não por convenção ─────────────────────────
#
# A classificação usa SÓ `type(item) is ...`. Nenhum `getattr`, nenhuma leitura de
# `content`, `summary`, `encrypted_content`, `id` ou `status`. Ler cadeia de
# pensamento seria trazer para dentro do sistema exatamente o que não foi governado —
# e os testes provam a omissão com campos que EXPLODEM se tocados. Intenção não é
# medida.
# ═══════════════════════════════════════════════════════════════════════════════

POLICY_ID = "creditum_hermes_response_extraction/v1"
POLICY_VERSION = "1.0.0"

#: A 3.1d-c5 observou estes dois motivos de resposta incompleta. Fora da lista:
#: continua sendo recusa — a lista existe para nomear, não para decidir.
KNOWN_INCOMPLETE_REASONS = ("max_output_tokens", "content_filter")

#: Os status que a mensagem pode declarar. Só um é sucesso.
KNOWN_MESSAGE_STATUSES = ("in_progress", "completed", "incomplete")

APPROVED_MESSAGE_TYPE = "message"
APPROVED_MESSAGE_ROLE = "assistant"
APPROVED_TEXT_BLOCK_TYPE = "output_text"
APPROVED_REFUSAL_BLOCK_TYPE = "refusal"

#: O pacote raiz do SDK. Uma constante, e não uma string solta em três lugares.
PRODUCTION_SDK_PACKAGE = "openai"

#: Os módulos e qualnames EXATOS observados pela 3.1d-c5 no openai 2.24.0.
PRODUCTION_RESPONSE_TYPES = (
    ("response", "openai.types.responses.response", "Response"),
    ("output_message", "openai.types.responses.response_output_message", "ResponseOutputMessage"),
    ("output_text", "openai.types.responses.response_output_text", "ResponseOutputText"),
    ("output_refusal", "openai.types.responses.response_output_refusal", "ResponseOutputRefusal"),
    ("reasoning_item", "openai.types.responses.response_reasoning_item", "ResponseReasoningItem"),
    ("compaction_item", "openai.types.responses.response_compaction_item", "ResponseCompactionItem"),
)

#: Os quinze tipos de ferramenta/ação enumerados pela 3.1d-c5. Estão aqui para o
#: RELATÓRIO e para o teste — a recusa NÃO se apoia nesta lista. A recusa se apoia na
#: allowlist de três classes: procurar o ruim exige conhecer todo o ruim, e o próximo
#: tipo hostil nasce fora da lista.
C5_REJECTED_ACTION_TYPES = (
    "ResponseFileSearchToolCall",
    "ResponseFunctionToolCall",
    "ResponseFunctionWebSearch",
    "ResponseComputerToolCall",
    "ImageGenerationCall",
    "ResponseCodeInterpreterToolCall",
    "LocalShellCall",
    "ResponseFunctionShellToolCall",
    "ResponseFunctionShellToolCallOutput",
    "ResponseApplyPatchToolCall",
    "ResponseApplyPatchToolCallOutput",
    "McpCall",
    "McpListTools",
    "McpApprovalRequest",
    "ResponseCustomToolCall",
)

#: Sentinela DO MÓDULO, comparada por IDENTIDADE. Um chamador não consegue obter este
#: objeto, então não consegue emitir tipos confiáveis — a autoridade não é injetável.
_TIPOS_ISSUER = object()


@dataclass(frozen=True)
class GovernedResponseTypes:
    """
    As seis classes EXATAS do SDK selado que a política reconhece.

    Selada como o provedor de SDK da r5/r6, e pelo mesmo motivo: `TrustedResponseType`
    passado pelo chamador devolveria a autoridade a quem chama, e foi exatamente esse
    defeito que a r5 fechou. Aqui não há o que injetar pela API pública.
    """

    _issuer: Any
    response: Any
    output_message: Any
    output_text: Any
    output_refusal: Any
    reasoning_item: Any
    compaction_item: Any

    def __post_init__(self) -> None:
        if self._issuer is not _TIPOS_ISSUER:
            raise CodexRefusal(CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE)


@dataclass(frozen=True)
class ExtractedResponseText:
    """
    O resultado ESTRUTURAL. Não é raciocínio aceito.

    `reasoning_item_count` e `compaction_item_count` são inteiros de auditoria: provam
    que os itens foram RECONHECIDOS sem que nada deles fosse lido. Contagem não é
    conteúdo.
    """

    text: str
    reasoning_item_count: int
    compaction_item_count: int
    policy_id: str = POLICY_ID
    policy_version: str = POLICY_VERSION


def resolve_production_governed_response_types() -> GovernedResponseTypes:
    """
    Sela os seis tipos EXATOS do `openai` 2.24.0 instalado. ZERO argumento.

    ─── 3.1d-c6-r1: declarar 2.24.0 não é provar 2.24.0 ──────────────────────

    A c6 importava os seis módulos e selava as classes. A versão aparecia no manifesto
    e no nome da política — DECLARADA, nunca observada. Um ambiente com outra versão
    do `openai` resolveria classes de mesmo nome e receberia autoridade confiável.

    Agora a versão é lida do SDK carregado e conferida ANTES de qualquer classe ser
    resolvida. Sem prova de versão não existe carrier: a recusa acontece antes de
    haver o que selar.

    ─── E as classes vêm do MESMO módulo cuja versão foi provada ────────────

    Conferir a versão de um `openai` e depois aceitar classes de outro módulo de mesmo
    nome seria provar uma coisa e usar outra. As classes são alcançadas por travessia
    de atributo A PARTIR do objeto de módulo verificado, e cada uma confere o próprio
    `__module__`. Igualdade de versão não substitui procedência de classe.

    Import TARDIO: a máquina que escreve isto não tem o SDK, e import no topo faria o
    pacote inteiro exigir produção. Ausência é recusa nomeada, nunca improviso.
    """
    import importlib

    def _recusa_de_import(causa: BaseException) -> CodexRefusal:
        # `openai:` é prefixo NOSSO; o tipo passa pelo sanitizador compartilhado. A
        # mensagem do ImportError carrega caminho de sistema de arquivos e não sai.
        return CodexRefusal(
            CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE, f"openai:{safe_exception_type(causa)}"
        )

    try:
        openai_mod = importlib.import_module(PRODUCTION_SDK_PACKAGE)
    except Exception as causa:  # noqa: BLE001
        recusa = _recusa_de_import(causa)
        del causa
        raise recusa from None

    # ─── PRIMEIRO a versão. Nada é selado antes disto. ──────────────────────
    #
    # A versão observada é texto de terceiro: um pacote qualquer pode declarar o que
    # quiser em `__version__`. Ela não entra no defeito — o código fixo basta, e
    # ecoá-la seria publicar material externo por conveniência de diagnóstico.
    if not sdk_version_is_approved(getattr(openai_mod, "__version__", None)):
        raise CodexRefusal(CodexDefect.SDK_VERSION_NOT_APPROVED)

    encontrados: dict[str, Any] = {}
    for campo, modulo, qualname in PRODUCTION_RESPONSE_TYPES:
        try:
            importlib.import_module(modulo)
        except Exception as causa:  # noqa: BLE001
            recusa = _recusa_de_import(causa)
            del causa
            raise recusa from None

        # Travessia A PARTIR do módulo verificado, e não `import_module(...)` de novo:
        # o objeto que se alcança por aqui é filho DAQUELE pacote.
        alvo: Any = openai_mod
        for parte in modulo.split(".")[1:]:
            alvo = getattr(alvo, parte, None)
            if alvo is None:
                raise CodexRefusal(
                    CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE, f"modulo:{campo}"
                )
        classe = getattr(alvo, qualname, None)
        if classe is None or not isinstance(classe, type):
            raise CodexRefusal(CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE, f"ausente:{campo}")
        # A classe declara ter nascido no módulo esperado? Nome de atributo é
        # apontamento; `__module__` é onde ela foi definida.
        if getattr(classe, "__module__", None) != modulo:
            raise CodexRefusal(CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE, f"origem:{campo}")
        encontrados[campo] = classe
    return GovernedResponseTypes(_issuer=_TIPOS_ISSUER, **encontrados)


def _texto_governado_de_bloco(bloco: Any, tipos: GovernedResponseTypes) -> str:
    """O bloco textual: classe exata, discriminador exato, `str` exato, não vazio."""
    if _atributo(bloco, "type") != APPROVED_TEXT_BLOCK_TYPE:
        raise CodexRefusal(CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID, "type divergente")
    texto = _atributo(bloco, "text")
    # `type(...) is str` e não `isinstance`: uma subclasse de `str` traz `__str__`
    # próprio. E nenhuma coerção: `str(texto)` executaria o `__str__` do que viesse.
    if type(texto) is not str:
        raise CodexRefusal(CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID, safe_type_name(texto))
    # Espaço em branco é inspecionado SÓ para decidir vacuidade. O texto aceito é
    # devolvido EXATO — `strip()` antes do envelope alteraria o que o modelo disse.
    if not texto.strip():
        raise CodexRefusal(CodexDefect.RESPONSE_OUTPUT_TEXT_EMPTY)
    return texto


def extract_governed_response_text(
    response: Any, *, types: GovernedResponseTypes
) -> ExtractedResponseText:
    """
    A fronteira estrutural governada. Precedência DETERMINÍSTICA, documentada:

      1. tipo exato de `Response`      RESPONSE_TYPE_NOT_APPROVED
      2. `error is None`               RESPONSE_ERROR_PRESENT
      3. `status == "completed"`        RESPONSE_STATUS_NOT_COMPLETED
      4. `incomplete_details is None`  RESPONSE_INCOMPLETE
      5. `output` lista não vazia      RESPONSE_OUTPUT_NOT_AVAILABLE
      6. cada item na allowlist        RESPONSE_OUTPUT_ITEM_NOT_APPROVED
      7. exatamente 1 mensagem         RESPONSE_MESSAGE_COUNT_INVALID
      8. `type` e `role` da mensagem   RESPONSE_MESSAGE_ROLE_INVALID
      9. `status` da mensagem          RESPONSE_MESSAGE_NOT_COMPLETED
     10. exatamente 1 bloco            RESPONSE_CONTENT_COUNT_INVALID
     11. bloco: texto ou recusa        MODEL_REFUSED / RESPONSE_CONTENT_NOT_APPROVED
     12. texto exato e não vazio       RESPONSE_OUTPUT_TEXT_INVALID / _EMPTY

    A ordem é fixa de propósito: a MESMA resposta malformada devolve SEMPRE o mesmo
    defeito. Deixar a iteração escolher o veredito faria dois operadores lerem duas
    causas para o mesmo fato.

    ─── Por que a contagem de blocos vem ANTES da recusa ────────────────────

    `[output_text, refusal]` são DUAS respostas num bloco só. Escolher a recusa seria
    escolher por nós, e chamar isso de `MODEL_REFUSED` esconderia uma ambiguidade
    estrutural atrás de um desfecho limpo. `MODEL_REFUSED` vale apenas para o caso
    inequívoco: uma mensagem concluída com UM bloco de recusa.

    ─── Nem `str(response)` nem `repr(response)` ─────────────────────────────

    Os dois transformam estrutura desconhecida em string plausível, executando o
    `__str__`/`__repr__` DO OBJETO. Uma string plausível passa por texto de modelo e
    não é. Nomeia-se aqui o que não se faz, e um teste confere que o corpo EXECUTÁVEL
    não contém nenhum dos dois.
    """
    if type(types) is not GovernedResponseTypes:
        raise CodexRefusal(CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE, safe_type_name(types))

    # 1. Identidade de classe, não forma. `type(...) is` e não `isinstance`: uma
    #    subclasse herdaria a aprovação sem herdar a procedência.
    if type(response) is not types.response:
        raise CodexRefusal(CodexDefect.RESPONSE_TYPE_NOT_APPROVED, safe_type_name(response))

    # 2. `error` primeiro: um erro presente descreve a resposta inteira. E a MENSAGEM
    #    dele é texto de provedor — não sai daqui.
    if _atributo(response, "error") is not None:
        raise CodexRefusal(CodexDefect.RESPONSE_ERROR_PRESENT)

    # 3. Status agregado.
    status = _atributo(response, "status")
    if status != COMPLETED_STATUS:
        raise CodexRefusal(
            CodexDefect.RESPONSE_STATUS_NOT_COMPLETED,
            f"status={safe_label(status, KNOWN_STATUSES)}",
        )

    # 4. A 3.1d-c5 provou que este campo existe. Texto parcial de uma resposta
    #    truncada em `max_output_tokens` é texto presente — e texto presente não é
    #    sucesso. O motivo é nomeado por allowlist, nunca ecoado.
    incompleto = _atributo(response, "incomplete_details")
    if incompleto is not None:
        motivo = getattr(incompleto, "reason", None)
        raise CodexRefusal(
            CodexDefect.RESPONSE_INCOMPLETE,
            f"reason={safe_label(motivo, KNOWN_INCOMPLETE_REASONS)}",
        )

    # 5. `output` é `Optional[List[...]]`: ausente é recusa, vazio é recusa.
    saida = _atributo(response, "output")
    if type(saida) is not list or not saida:
        raise CodexRefusal(CodexDefect.RESPONSE_OUTPUT_NOT_AVAILABLE)

    # 6. Classificação por IDENTIDADE de classe. Nenhum atributo de reasoning ou
    #    compaction é lido — nem `type`. Só `type(item) is`.
    mensagens: list[Any] = []
    reasoning = compaction = 0
    for item in saida:
        classe = type(item)
        if classe is types.reasoning_item:
            reasoning += 1
        elif classe is types.compaction_item:
            compaction += 1
        elif classe is types.output_message:
            mensagens.append(item)
        else:
            raise CodexRefusal(
                CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED, safe_type_name(item)
            )

    # 7. Nenhuma invariante de ORDEM: `[reasoning, message]`, `[message, reasoning]` e
    #    `[compaction, message, reasoning]` são igualmente válidas. Exigir ordem seria
    #    inventar um contrato que a 3.1d-c5 não observou.
    if len(mensagens) != 1:
        raise CodexRefusal(
            CodexDefect.RESPONSE_MESSAGE_COUNT_INVALID, f"mensagens={len(mensagens)}"
        )
    mensagem = mensagens[0]

    # 8. Classe exata JÁ conferida; o discriminador e o papel declarados também.
    if _atributo(mensagem, "type") != APPROVED_MESSAGE_TYPE:
        raise CodexRefusal(CodexDefect.RESPONSE_MESSAGE_ROLE_INVALID, "type divergente")
    if _atributo(mensagem, "role") != APPROVED_MESSAGE_ROLE:
        raise CodexRefusal(CodexDefect.RESPONSE_MESSAGE_ROLE_INVALID, "role divergente")

    # 9. Um `Response` concluído NÃO desculpa uma mensagem não concluída.
    mstatus = _atributo(mensagem, "status")
    if mstatus != COMPLETED_STATUS:
        raise CodexRefusal(
            CodexDefect.RESPONSE_MESSAGE_NOT_COMPLETED,
            f"status={safe_label(mstatus, KNOWN_MESSAGE_STATUSES)}",
        )

    # 10. Exatamente um bloco. Dois blocos são duas respostas.
    blocos = _atributo(mensagem, "content")
    if type(blocos) is not list or len(blocos) != 1:
        raise CodexRefusal(
            CodexDefect.RESPONSE_CONTENT_COUNT_INVALID,
            f"blocos={len(blocos) if type(blocos) is list else -1}",
        )
    bloco = blocos[0]
    classe_bloco = type(bloco)

    # 11. Recusa: DESFECHO controlado. Sem detalhe, sem texto, sem log. O campo
    #     `refusal` não é lido — a identidade da classe já identificou o desfecho, e
    #     dereferenciar o payload só criaria a chance de vazá-lo.
    if classe_bloco is types.output_refusal:
        raise CodexRefusal(CodexDefect.MODEL_REFUSED)
    if classe_bloco is not types.output_text:
        raise CodexRefusal(CodexDefect.RESPONSE_CONTENT_NOT_APPROVED, safe_type_name(bloco))

    # 12. Texto exato, preservado byte a byte.
    texto = _texto_governado_de_bloco(bloco, types)
    return ExtractedResponseText(
        text=texto, reasoning_item_count=reasoning, compaction_item_count=compaction
    )

# ═══════════════════════════════════════════════════════════════════════════════
# 3.1d-D1 — CONTROLES DE EXECUÇÃO DO `create`
#
# ─── Três vocabulários, um dono por valor ────────────────────────────────────
#
#   A. REQUEST_FIELDS                 o pedido SEMÂNTICO. Fechado em 5, INTOCADO.
#   B. CREATE_EXECUTION_CONTROL_FIELDS `background` e `timeout` — modo e limite
#   C. kwargs do CLIENTE               `max_retries` — só existe na construção
#
# `timeout` é DINÂMICO: depende do relógio. Pô-lo no pedido semântico faria o
# fingerprint que Stefano aprovou mudar a cada milissegundo — e um compromisso que
# muda sozinho não é compromisso. O humano aprova o ALGORITMO limitado e os 180 s;
# o float só existe no instante da chamada.
#
# `background` NÃO é omitido. A 3.1d-D1 observou `Optional[bool] | Omit`, e `Omit`
# significa default do SERVIDOR — que não observamos. Mesma decisão de `tools=[]`:
# zero explícito, não omissão. Desconhecido nunca é sucesso.
# ═══════════════════════════════════════════════════════════════════════════════

def enforce_execution_controls(controls: Any) -> dict[str, Any]:
    """
    Os controles de execução, conferidos por valor EXATO.

    ─── Por que o timeout é conferido aqui, e não aprovado no fingerprint ───

    O orçamento restante é uma leitura de relógio: não existia quando Stefano
    aprovou. O que foi aprovado é o limite de 180 s e a regra de derivação. Aqui se
    confere que o valor derivado obedece a esse limite — finito, positivo, e nunca
    maior que o teto.
    """
    if type(controls) is not dict:
        raise CodexRefusal(
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL, safe_type_name(controls)
        )
    chaves = set(controls.keys())
    if chaves != set(CREATE_EXECUTION_CONTROL_FIELDS):
        faltando = sorted(set(CREATE_EXECUTION_CONTROL_FIELDS) - chaves)
        sobrando = sorted(chaves - set(CREATE_EXECUTION_CONTROL_FIELDS))
        raise CodexRefusal(
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
            f"faltando={faltando} sobrando={sobrando}",
        )

    # `type(...) is bool` e não `is False`: `0` é igual a `False` em Python, e um
    # inteiro chegando aqui significaria que alguém passou outra coisa.
    fundo = controls["background"]
    if type(fundo) is not bool or fundo is not GOVERNED_BACKGROUND:
        raise CodexRefusal(CodexDefect.EXECUTION_BACKGROUND_NOT_APPROVED)

    prazo = controls["timeout"]
    # `bool` é subclasse de `int`: `True` passaria por número sem esta recusa.
    if type(prazo) is bool or type(prazo) not in (int, float):
        raise CodexRefusal(
            CodexDefect.EXECUTION_TIMEOUT_NOT_APPROVED, safe_type_name(prazo)
        )
    if prazo != prazo or prazo in (float("inf"), float("-inf")):  # NaN e infinitos
        raise CodexRefusal(CodexDefect.EXECUTION_TIMEOUT_NOT_APPROVED, "nao_finito")
    if prazo <= 0:
        raise CodexRefusal(CodexDefect.EXECUTION_TIMEOUT_NOT_APPROVED, "nao_positivo")
    if prazo > LIVE_ATTEMPT_DEADLINE_SECONDS:
        raise CodexRefusal(CodexDefect.EXECUTION_TIMEOUT_NOT_APPROVED, "acima_do_teto")
    return {"background": fundo, "timeout": prazo}


def enforce_final_create_kwargs(enviado: Any) -> None:
    """
    O conjunto EXATO de chaves da invocação final: pedido semântico UNIÃO controles.

    Sem extras e sem faltantes. Uma chave a mais é um parâmetro que ninguém governou;
    uma a menos é um limite que ninguém aplicou.
    """
    if type(enviado) is not dict:
        raise CodexRefusal(
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL, safe_type_name(enviado)
        )
    chaves = set(enviado.keys())
    if chaves != set(FINAL_CREATE_FIELDS):
        faltando = sorted(set(FINAL_CREATE_FIELDS) - chaves)
        sobrando = sorted(chaves - set(FINAL_CREATE_FIELDS))
        raise CodexRefusal(
            CodexDefect.EXECUTION_CONTROLS_NOT_CANONICAL,
            f"faltando={faltando} sobrando={sobrando}",
        )


#: A chave única do envelope de raciocínio. Fechado: `{"insights": [...]}` e nada mais.
ENVELOPE_KEY = "insights"


def _atributo(objeto: Any, nome: str) -> Any:
    """Leitura estrita: ausente é desconhecido, e desconhecido não é vazio."""
    if not hasattr(objeto, nome):
        raise CodexRefusal(CodexDefect.RESULT_AMBIGUOUS, f"campo {nome} ausente")
    return getattr(objeto, nome)


def parse_reasoning_envelope(texto: str) -> Mapping[str, Any]:
    """
    JSON estrito, envelope fechado. Sem reparo.

    ─── Por que nada de remover cerca de markdown ────────────────────────────

    ```json ... ``` significa que o modelo respondeu em formato de conversa quando o
    contrato pedia máquina. Tirar a cerca e seguir ensinaria que o contrato é opcional,
    e a próxima violação seria maior. Falha é falha.
    """
    if type(texto) is not str:
        raise CodexRefusal(CodexDefect.OUTPUT_NOT_VALIDATED, safe_type_name(texto))
    try:
        dados = json.loads(texto)
    except (ValueError, TypeError) as causa:
        tipo = safe_exception_type(causa)
        del causa
        raise CodexRefusal(CodexDefect.OUTPUT_NOT_VALIDATED, f"JSON inválido: {tipo}") from None
    if type(dados) is not dict:
        raise CodexRefusal(CodexDefect.OUTPUT_NOT_VALIDATED, "raiz não é objeto")
    if set(dados.keys()) != {ENVELOPE_KEY}:
        raise CodexRefusal(
            CodexDefect.OUTPUT_NOT_VALIDATED, f"chaves {sorted(dados.keys())}"
        )
    if type(dados[ENVELOPE_KEY]) is not list:
        raise CodexRefusal(CodexDefect.OUTPUT_NOT_VALIDATED, "insights não é lista")
    # A validação HermesInsightV1 e a validação REFERENCIAL contra o read model próprio
    # acontecem do lado TypeScript, onde o schema canônico é a autoridade (3.1c-r2).
    # Duplicá-las aqui criaria uma segunda autoridade que poderia divergir.
    return MappingProxyType(dados)
