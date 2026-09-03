"""
Fase 3.1d-b-r3 — `CreditumCodexReasoningExecutor`.

UMA rota de execução. Não existe rota dormente para o `AIAgent`.

─── O caminho, inteiro ──────────────────────────────────────────────────────

    read model PRÓPRIO X   (a propriedade canônica é da 3.0c, do lado TypeScript)
        ↓
    payload determinístico          derivado de X, uma vez
        ↓
    contrato de sistema congelado   igualdade exata, nunca continência
        ↓
    ApprovedRuntimeBinding          identidade E material, uma autoridade
        ↓
    requisição fechada              somente-leitura, escalares próprios
        ↓
    PORTÃO FINAL                    verifica; não conserta
        ↓
    PRECALL: sentinela              ·  VIVO: responses.create direto

─── A invariante que decide tudo ────────────────────────────────────────────

Entre o portão e a chamada não existe nada. Sem middleware, sem hook, sem callback,
sem `await`, sem reconstrução da requisição. A r2 falhou nisto por herança: o portão
ficava antes do relay, e o relay ainda podia mudar o payload.

Aqui o objeto validado é o objeto enviado, e ele é somente-leitura.

─── Papel-neutro de propósito ───────────────────────────────────────────────

O executor recebe contrato de sistema, artefato de entrada e vínculo. Nada nele sabe
o que é "CEO", "CFO" ou "conselho": a hierarquia futura reusa este núcleo passando
OUTROS contratos aprovados.

O que ele NÃO faz é aceitar contrato arbitrário de chamador. Papel novo exige contrato
novo, aprovado e versionado — generalizar hoje transformaria a autoridade de produção
em parâmetro.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping

from .codex import (
    CodexDefect,
    CodexRefusal,
    PrecallProbeComplete,
    GovernedResponseTypes,
    enforce_execution_controls,
    enforce_final_create_kwargs,
    extract_governed_response_text,
    build_governed_request,
    enforce_final_request,
    governed_user_payload,
    parse_reasoning_envelope,
    request_fingerprint,
    user_payload_hash,
    verify_sdk_surface,
)
from .contract import SystemContract
from .runtime import (
    ApprovedRuntimeBinding,
    live_authorization_is_valid,
    safe_exception_type,
    safe_type_name,
)

MODE_PRECALL_PROBE = "PRECALL_PROBE"
MODE_LIVE = "LIVE"

#: Nenhuma política de extração de resposta aprovada. O padrão, e o de produção.
RESPONSE_POLICY_NOT_APPROVED = "LIVE_RESPONSE_POLICY_NOT_APPROVED"
#: A política sintética dos testes: resposta com UM bloco textual, forma declarada.
RESPONSE_POLICY_SYNTHETIC = "SYNTHETIC_TEST_ONLY"

#: O veredito que a execução viva pode alcançar do lado Python. NÃO é sucesso.
#:
#: ─── Por que não existe "OK" aqui ─────────────────────────────────────────────
#:
#: A autoridade semântica é o TypeScript: `acceptHermesReasoningOutput` e
#: `validateInsightsAgainstReadModel` fazem contrato por item e integridade
#: referencial contra o MESMO read model próprio, atomicamente.
#:
#: A r3 marcava `OK` depois de parsear o envelope. Isso criava uma SEGUNDA autoridade
#: de sucesso, e `{"insights":[{}]}` passava — JSON válido, envelope certo, nenhum
#: insight válido.
#:
#: Duas autoridades semânticas divergem no dia em que uma muda. Então esta só sabe
#: dizer "recebi algo, e não sou quem decide se vale".
VERDICT_MODEL_OUTPUT_UNVALIDATED = "MODEL_OUTPUT_UNVALIDATED"


class ExecutorDefect:
    LIVE_NOT_AUTHORIZED = "LIVE_NOT_AUTHORIZED"
    SDK_NOT_VERIFIED = "SDK_NOT_VERIFIED"
    SDK_PROVIDER_NOT_TRUSTED = "SDK_PROVIDER_NOT_TRUSTED"
    SDK_CLIENT_TYPE_MISMATCH = "SDK_CLIENT_TYPE_MISMATCH"
    SDK_RESPONSES_RESOURCE_MISMATCH = "SDK_RESPONSES_RESOURCE_MISMATCH"
    SDK_CREATE_IDENTITY_MISMATCH = "SDK_CREATE_IDENTITY_MISMATCH"
    SDK_RUNTIME_NOT_AVAILABLE = "SDK_RUNTIME_NOT_AVAILABLE"
    #: A 3.1d-c4 observou o SDK, mas NÃO aprovou uma regra de extração do resultado.
    LIVE_RESPONSE_POLICY_NOT_APPROVED = "LIVE_RESPONSE_POLICY_NOT_APPROVED"
    RUNTIME_BINDING_REQUIRED = "RUNTIME_BINDING_REQUIRED"
    READ_MODEL_NOT_OWNED = "READ_MODEL_NOT_OWNED"
    PROVIDER_CALL_FAILED = "PROVIDER_CALL_FAILED"


class ExecutorRefusal(Exception):
    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect
        self.detail = detail


@dataclass(frozen=True)
class GovernedReasoningRun:
    """
    O que a execução governada precisa saber, decidido ANTES de qualquer chamada.

    Não existe campo de modo: o modo é DERIVADO da capacidade. A r1 fechou o defeito de
    a string `"LIVE"` bastar, e ele não volta por outra porta.
    """

    contract: SystemContract
    binding: ApprovedRuntimeBinding
    #: O read model PRÓPRIO. Capturado uma vez; nunca relido da fonte do chamador.
    read_model: Mapping[str, Any]
    #: `None` é PRECALL. Só uma capacidade emitida internamente autoriza VIVO.
    live_authorization: Any = None
    #: 3.1d-D1 — os controles de execução do `create`, derivados pelo orquestrador
    #: TypeScript a partir do orçamento monotônico restante. `None` é recusa no
    #: caminho vivo: uma execução sem limite conferido não é uma execução autorizada.
    execution_controls: Any = None

    @property
    def mode(self) -> str:
        return MODE_LIVE if live_authorization_is_valid(self.live_authorization) else MODE_PRECALL_PROBE


#: Sentinela de emissão do provedor de SDK. Objeto de módulo, comparado por IDENTIDADE.
#:
#: Mesmo papel do `_EMISSOR` do vínculo: um objeto com os mesmos campos não carrega
#: ESTE, então não passa. É o que separa "tem a forma" de "veio do emissor".
_SDK_ISSUER = object()


@dataclass(frozen=True)
class TrustedSdkProvider:
    """
    A procedência do SDK — selada, e sem nenhuma costura que o chamador controle.

    ─── O defeito da r4, dito com precisão ───────────────────────────────────

    A r4 tinha `build_client`, e o dataclass era publicamente construível. Um chamador
    montava um provedor com versão, classe e descritor COMPATÍVEIS, a verificação
    conferia esses três — e a fábrica devolvia um cliente **diferente**, cujo
    `responses.create` nunca foi visto.

    Verificado ≠ invocado. O nome "Trusted" não era procedência nenhuma; era um nome.

    ─── O que mudou ─────────────────────────────────────────────────────────

    Não existe mais fábrica. O executor constrói o cliente ELE MESMO, a partir da
    classe selada, com o material aprovado do vínculo — e depois confere que o objeto
    construído, o recurso `responses` e o `create` ligado pertencem à superfície
    aprovada.

    Não há callback, lambda, wrapper de construtor nem resolvedor dinâmico. Uma costura
    dessas é onde a substituição mora.

    ─── O modelo de ameaça, dito sem exagero ────────────────────────────────

    Isto protege a fronteira **pública** contra um chamador que entrega um SDK
    substituto. NÃO é resistência criptográfica contra código malicioso já rodando
    dentro do mesmo processo Python — quem pode importar um módulo privado pode chamá-lo.
    """

    _issuer: Any
    version: Any
    client_class: Any
    #: A classe EXATA do recurso `responses` do cliente aprovado.
    responses_resource_class: Any
    #: A função subjacente do método `create` aprovado — não o método ligado.
    create_descriptor: Any
    #: Qual política de aceitação de RESPOSTA foi provada para este provedor.
    #:
    #: A c4 observou o SDK, e observou também que `Response.output_text` AGREGA os
    #: blocos `output_text` de TODOS os itens `message`, e que `response.output` pode
    #: trazer raciocínio, chamadas de ferramenta, itens MCP e aprovações.
    #:
    #: Ou seja: a superfície está observada, mas a regra de "qual é a resposta final"
    #: NÃO está aprovada. Um provedor de produção carrega isso escrito, para que a
    #: ambiguidade não possa ser esquecida entre uma fase e outra.
    response_policy: str = RESPONSE_POLICY_NOT_APPROVED

    def __post_init__(self) -> None:
        if self._issuer is not _SDK_ISSUER:
            raise ExecutorRefusal(ExecutorDefect.SDK_PROVIDER_NOT_TRUSTED)


@dataclass(frozen=True)
class UntrustedReasoningEnvelope:
    """
    O que saiu do provider, parseado e NADA ALÉM DISSO.

    O nome carrega o estado de propósito. Um tipo chamado `ReasoningResult` seria lido
    como resultado, e alguém o devolveria ao chamador achando que estava validado.

    Quem aceita é o TypeScript. Aqui só existe "recebi".
    """

    envelope: Mapping[str, Any]
    verdict: str = VERDICT_MODEL_OUTPUT_UNVALIDATED

    @property
    def insight_candidates(self) -> Any:
        """CANDIDATOS. O adapter valida cada um; este lado nunca os julga."""
        return self.envelope["insights"]


@dataclass
class ExecutionEvidence:
    """Metadado SEGURO da execução. Contagens e hashes — nunca conteúdo, nunca segredo."""

    mode: str
    user_payload_hash: str
    request_hash: str
    tool_count: int
    sdk_verified: bool = False
    client_constructions: int = 0
    provider_calls: int = 0
    model_call_completed: bool = False
    #: 3.1d-c6: quantos itens opacos vieram. CONTAGEM, nunca conteúdo — a prova de que
    #: reasoning e compaction foram RECONHECIDOS sem que nada deles fosse lido.
    #: 3.1d-D1: os controles de execução foram conferidos e aplicados?
    execution_controls_applied: bool = False
    reasoning_item_count: int = 0
    compaction_item_count: int = 0
    #: NUNCA "OK". A aceitação semântica é do TypeScript.
    verdict: str = ""


def construir_material_governado(
    *,
    contract: SystemContract,
    binding: ApprovedRuntimeBinding,
    read_model: Mapping[str, Any],
) -> tuple[Mapping[str, Any], str]:
    """
    A ÚNICA construção do material governado. Pura: nada de rede, cliente ou estado.

    ─── Por que existe como função de módulo ────────────────────────────────────
    #
    A 3.1d-D2E descobriu que os hashes que Stefano aprova nasciam dentro do
    `precall_probe` — logo, obtê-los antes da aprovação exigia gastar uma execução, e
    reimplementá-los em TypeScript criaria uma segunda verdade. Extrair estas linhas
    para cá dá ao planejamento e à execução a MESMA origem, sem modo novo, sem
    bandeira e sem clone.

    `_construir` do executor agora delega para aqui. Não há dois caminhos.
    """
    if type(binding) is not ApprovedRuntimeBinding:
        raise ExecutorRefusal(ExecutorDefect.RUNTIME_BINDING_REQUIRED)
    if type(read_model) is not dict:
        raise ExecutorRefusal(ExecutorDefect.READ_MODEL_NOT_OWNED, safe_type_name(read_model))

    payload = governed_user_payload(read_model)
    request = build_governed_request(binding=binding, contract=contract, user_payload=payload)
    # O PORTÃO. Depois desta linha nada muda a requisição — ela é somente-leitura.
    enforce_final_request(
        request, binding=binding, contract=contract, expected_user_payload=payload
    )
    return request, payload


class CreditumCodexReasoningExecutor:
    """
    O executor governado. Constrói, verifica e — só com capacidade — envia.

    ─── Nada de `run_agent` ──────────────────────────────────────────────────

    Importar `run_agent` EXECUTA `load_hermes_dotenv()` no import. Um import que lê
    segredo do disco é efeito colateral invisível na leitura do código, então este
    módulo não o importa nem indiretamente.

    O SDK é importado TARDE, e só no caminho vivo, por uma fábrica injetada.
    """

    def __init__(
        self,
        *,
        sdk_provider: TrustedSdkProvider | None = None,
        response_types: GovernedResponseTypes | None = None,
    ) -> None:
        #: Injetável para que o teste prove o caminho vivo sem rede e sem o SDK
        #: instalado. `None` significa: não há SDK verificável, e o caminho vivo recusa
        #: em vez de improvisar um.
        self._sdk_provider = sdk_provider
        #: 3.1d-c6: os seis tipos EXATOS de `Response`, selados. `None` é recusa — a
        #: extração por forma (duck typing) seria o fallback que esta arquitetura não
        #: admite: uma classe de mesmo formato não é a classe que o SDK construiu.
        self._response_types = response_types
        self.evidence: ExecutionEvidence | None = None

    # ── construção governada, comum aos dois modos ──────────────────────────

    def _construir(self, run: GovernedReasoningRun) -> tuple[Mapping[str, Any], str]:
        # Delega para a função de MÓDULO. O planejamento (d2e) e a execução passam
        # pelas mesmas linhas — se divergissem, o hash que Stefano aprova não
        # descreveria o pedido que sai.
        return construir_material_governado(
            contract=run.contract, binding=run.binding, read_model=run.read_model
        )

    # ── sonda pública: prova a semântica sem rede ───────────────────────────

    def precall_probe(self, run: GovernedReasoningRun) -> ExecutionEvidence:
        """
        Prova a construção inteira e PARA. Zero cliente, zero requisição, zero rede.

        A sonda não precisa de cliente para provar semântica de requisição, então ela
        não constrói um: instanciar uma biblioteca de rede para não usá-la seria
        carregar o risco sem o benefício.
        """
        request, payload = self._construir(run)
        evidencia = ExecutionEvidence(
            mode=MODE_PRECALL_PROBE,
            user_payload_hash=user_payload_hash(payload),
            request_hash=request_fingerprint(request),
            tool_count=len(request["tools"]),
            client_constructions=0,
            provider_calls=0,
            model_call_completed=False,
            verdict="PRECALL_PROBE_COMPLETE",
        )
        self.evidence = evidencia
        raise PrecallProbeComplete()

    # ── caminho vivo: só com capacidade ─────────────────────────────────────

    def execute_live(self, run: GovernedReasoningRun) -> UntrustedReasoningEnvelope:
        """
        UMA chamada direta ao provider. Nenhuma auxiliar. E NENHUM veredito de sucesso.

        Inalcançável pela API pública nesta fase: não existe emissor de capacidade.

        ─── A ordem é a garantia ─────────────────────────────────────────────

            1. capacidade viva          sem ela, nada acontece
            2. vínculo aprovado
            3. provedor SELADO          emitido internamente, conferido por identidade
            4. superfície declarada      versão + construtor + descritor de create
            5. cliente                   construído AQUI, da classe selada
            6. procedência do construído cliente, recurso `responses`, `create` ligado
            7. requisição + PORTÃO
            8. materializa + reconfere + chama O MESMO callable capturado

        A verificação (4) vem antes do cliente (5) porque descobrir incompatibilidade
        depois de construir seria descobrir com o objeto de rede já na mão.

        E (6) existe porque (4) sozinha prova o que foi DECLARADO, não o que foi
        CONSTRUÍDO. Era exatamente essa distância que a r4 deixava aberta.
        """
        if run.mode != MODE_LIVE:
            raise ExecutorRefusal(ExecutorDefect.LIVE_NOT_AUTHORIZED)
        if type(run.binding) is not ApprovedRuntimeBinding:
            raise ExecutorRefusal(ExecutorDefect.RUNTIME_BINDING_REQUIRED)

        # ─── 3. O provedor veio do emissor interno? ─────────────────────────
        #
        # `type(...) is` e não `isinstance`: uma subclasse herdaria o selo do pai sem
        # herdar a intenção, e um objeto com os mesmos campos não carrega o sentinela.
        provedor = self._sdk_provider
        if type(provedor) is not TrustedSdkProvider:
            raise ExecutorRefusal(ExecutorDefect.SDK_PROVIDER_NOT_TRUSTED, "não selado")

        # ─── A ambiguidade da c4, transformada em recusa ─────────────────────
        #
        # O provedor de produção existe e está selado. O que NÃO existe é uma regra
        # aprovada de "qual é a resposta final" — `output_text` agrega vários blocos,
        # e `output` pode trazer itens que não são resposta.
        #
        # Sem essa regra, chamar o provider produziria bytes que ninguém sabe ler como
        # resultado. Recusar aqui é o que impede a pergunta de ser esquecida.
        if provedor.response_policy != RESPONSE_POLICY_SYNTHETIC:
            raise ExecutorRefusal(
                ExecutorDefect.LIVE_RESPONSE_POLICY_NOT_APPROVED, provedor.response_policy
            )

        # ─── 4. A superfície DECLARADA, antes de qualquer objeto de rede ────
        #
        # Falhar aqui deixa 0 clientes e 0 chamadas: a evidência ainda nem existe, então
        # não há contador para inflar por engano.
        verify_sdk_surface(
            version=provedor.version,
            client_class=provedor.client_class,
            create_callable=provedor.create_descriptor,
        )

        evidencia = ExecutionEvidence(
            mode=MODE_LIVE,
            user_payload_hash="",
            request_hash="",
            tool_count=-1,
            sdk_verified=True,
        )
        self.evidence = evidencia

        # ─── 5. O cliente é construído AQUI ─────────────────────────────────
        #
        # Sem fábrica, sem callback, sem wrapper. A classe é a selada, e o material é o
        # do vínculo — fechado em `api_key` e `base_url`. Uma fábrica seria a costura
        # por onde outro cliente entraria, que foi o defeito da r4.
        cliente = provedor.client_class(**run.binding.to_client_kwargs())

        # ─── 6. E o que foi CONSTRUÍDO pertence à superfície aprovada? ──────
        #
        # Um construtor com assinatura correta pode devolver outro tipo — `__new__` faz
        # isso. Conferir só o construtor provaria a chamada, não o objeto.
        if type(cliente) is not provedor.client_class:
            raise ExecutorRefusal(
                ExecutorDefect.SDK_CLIENT_TYPE_MISMATCH, safe_type_name(cliente)
            )
        evidencia.client_constructions = 1

        recurso = cliente.responses
        if type(recurso) is not provedor.responses_resource_class:
            # Ter um `.create` não faz de um objeto o recurso aprovado.
            raise ExecutorRefusal(
                ExecutorDefect.SDK_RESPONSES_RESOURCE_MISMATCH, safe_type_name(recurso)
            )

        # Capturado UMA vez. Um acessor dinâmico poderia devolver outro callable na
        # segunda leitura, então não existe segunda leitura: verifica-se e invoca-se
        # ESTE objeto.
        verified_create = recurso.create
        if getattr(verified_create, "__func__", None) is not provedor.create_descriptor:
            # Nome e assinatura são falsificáveis; identidade de função não é.
            raise ExecutorRefusal(ExecutorDefect.SDK_CREATE_IDENTITY_MISMATCH)
        # Identidade não substitui compatibilidade: uma função aprovada cuja assinatura
        # tenha derivado continua sendo a função errada para esta requisição.
        verify_sdk_surface(
            version=provedor.version,
            client_class=provedor.client_class,
            create_callable=verified_create,
        )

        request, payload = self._construir(run)
        evidencia.user_payload_hash = user_payload_hash(payload)
        evidencia.request_hash = request_fingerprint(request)
        evidencia.tool_count = len(request["tools"])

        # ─── Portão → chamada, sem nada no meio ─────────────────────────────
        #
        # `**` exige mapping concreto, então há uma materialização. Materializar é uma
        # oportunidade de divergência, então o portão roda DE NOVO sobre o objeto
        # exatamente que será passado — não sobre o que o originou.
        #
        # Isto não é reconstrução da requisição: é conferir o objeto que sai. A
        # diferença importa, porque reconstruir permitiria um valor novo e conferir não.
        enviado = dict(request)
        enforce_final_request(
            enviado,
            binding=run.binding,
            contract=run.contract,
            expected_user_payload=payload,
        )

        # ─── 3.1d-D1: os controles de execução, conferidos e unidos ─────────
        #
        # O pedido SEMÂNTICO permanece fechado em cinco campos — é ele que a r5
        # verifica e que o fingerprint aprovado por Stefano compromete. Os controles
        # são outro vocabulário, conferido por valor exato, e a união é o conjunto
        # EXATO que `create` recebe.
        controles = enforce_execution_controls(run.execution_controls)
        enviado.update(controles)
        enforce_final_create_kwargs(enviado)
        evidencia.execution_controls_applied = True
        evidencia.provider_calls = 1
        try:
            # O MESMO callable capturado e verificado. Reler `cliente.responses.create`
            # aqui daria a um acessor dinâmico a chance de devolver outro.
            resposta = verified_create(**enviado)
        except Exception as causa:
            evidencia.verdict = ExecutorDefect.PROVIDER_CALL_FAILED
            # Exceção do SDK: a mensagem pode carregar header, URL ou corpo.
            tipo = safe_exception_type(causa)
            del causa
            raise ExecutorRefusal(ExecutorDefect.PROVIDER_CALL_FAILED, tipo) from None

        if type(self._response_types) is not GovernedResponseTypes:
            raise CodexRefusal(
                CodexDefect.RESPONSE_TYPES_NOT_AVAILABLE, safe_type_name(self._response_types)
            )
        extraido = extract_governed_response_text(resposta, types=self._response_types)
        evidencia.reasoning_item_count = extraido.reasoning_item_count
        evidencia.compaction_item_count = extraido.compaction_item_count
        envelope = parse_reasoning_envelope(extraido.text)
        evidencia.model_call_completed = True

        # ─── E aqui PARA ────────────────────────────────────────────────────
        #
        # JSON válido não é raciocínio aceito. Contrato por item e integridade
        # referencial contra o MESMO read model próprio são do TypeScript, e este lado
        # não tem como invocá-los — então ele não tem como declarar sucesso.
        evidencia.verdict = VERDICT_MODEL_OUTPUT_UNVALIDATED
        return UntrustedReasoningEnvelope(envelope=envelope)


# ═════════════════════════════════════════════════════════════════════════════
# O emissor SELADO de produção — objetos exatos observados pela 3.1d-c4
# ═════════════════════════════════════════════════════════════════════════════

#: Identidade exata do SDK, como a c4 a observou em produção.
PRODUCTION_SDK_VERSION = "2.24.0"
PRODUCTION_CLIENT = ("openai", "OpenAI")
PRODUCTION_RESPONSES = ("openai.resources.responses.responses", "Responses")


def _identidade(objeto: Any) -> tuple[Any, Any]:
    return (getattr(objeto, "__module__", None), getattr(objeto, "__qualname__", None))


def resolve_production_trusted_sdk_provider() -> TrustedSdkProvider:
    """
    Sela os objetos EXATOS do `openai` 2.24.0 instalado. ZERO argumento de chamador.

    ─── Por que sem parâmetro ────────────────────────────────────────────────

    Um `issue(client_class=..., resource_class=...)` devolveria autoridade para quem
    chamasse — que é exatamente o defeito que a r4 tinha e a r5 fechou. Aqui não há o
    que injetar: a função importa, confere e sela.

    ─── Import TARDIO ───────────────────────────────────────────────────────

    A máquina que escreve isto não tem o SDK. Import no topo faria o pacote inteiro
    exigir produção, e os testes de governança deixariam de rodar. Ausência é recusa
    nomeada.

    ─── Identidade, e não nome ──────────────────────────────────────────────

    Conferem-se módulo e qualname E o objeto de classe/função em si. Nome igual não é
    o mesmo objeto, e foi essa distinção que a r5 estabeleceu.
    """
    import importlib

    try:
        openai_mod = importlib.import_module("openai")
        responses_mod = importlib.import_module(PRODUCTION_RESPONSES[0])
    except Exception as causa:  # noqa: BLE001
        # `openai:` é prefixo NOSSO; o tipo passa pelo sanitizador compartilhado.
        # O nome da classe é escolhido por quem a escreve, e o import de um pacote
        # ausente pode levantar qualquer coisa.
        tipo = safe_exception_type(causa)
        del causa
        raise ExecutorRefusal(ExecutorDefect.SDK_RUNTIME_NOT_AVAILABLE, f"openai:{tipo}") from None

    # A versão é conferida UMA vez, por `verify_sdk_surface`, lá embaixo. Uma segunda
    # comparação aqui seria redundância que passa por defesa: removê-la de qualquer um
    # dos dois lugares não mudaria nada, e uma mutação assim sobreviveria — o que é
    # exatamente o sinal de que a defesa não estava sendo medida.
    versao = getattr(openai_mod, "__version__", None)

    cliente = getattr(openai_mod, PRODUCTION_CLIENT[1], None)
    recurso = getattr(responses_mod, PRODUCTION_RESPONSES[1], None)
    for objeto, esperado in ((cliente, PRODUCTION_CLIENT), (recurso, PRODUCTION_RESPONSES)):
        if objeto is None or _identidade(objeto) != esperado:
            raise CodexRefusal(
                CodexDefect.SDK_SURFACE_INCOMPATIBLE, f"esperado {esperado[0]}.{esperado[1]}"
            )

    descritor = getattr(recurso, "create", None)
    if descritor is None:
        raise CodexRefusal(CodexDefect.SDK_SURFACE_INCOMPATIBLE, "Responses.create ausente")

    # Verificar ANTES de selar: um provedor selado é uma afirmação, e afirmar antes de
    # conferir é o que a r4 fazia.
    verify_sdk_surface(version=versao, client_class=cliente, create_callable=descritor)

    return TrustedSdkProvider(
        _issuer=_SDK_ISSUER,
        version=versao,
        client_class=cliente,
        responses_resource_class=recurso,
        create_descriptor=descritor,
        # A superfície está provada. A regra de leitura da RESPOSTA não está.
        response_policy=RESPONSE_POLICY_NOT_APPROVED,
    )
