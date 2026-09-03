"""
O adaptador Telegram governado, e seu registro pela interface suportada.

─── A superfície interceptada, e por que só ela ────────────────────────────────

Uma única sobrescrita: `_enqueue_text_event`. É o último ponto em que a cardinalidade
da mensagem ainda existe — depois dele o nativo faz
`existing.text = existing.text + "\\n" + event.text` e a fronteira some.

Tudo o mais é herdado: polling, credencial, allowlist, envio, ciclo de vida, erros.
Não há segundo consumidor, não há segundo cliente do Telegram e nada sob
`/opt/hermes-agent` é tocado.

─── O que a sobrescrita faz ────────────────────────────────────────────────────

Captura o ingresso governado — uma mensagem, uma instância — e entrega o evento
IMEDIATAMENTE, sem lote. "Uma execução viva, uma mensagem" passa a ser verdade por
construção, não por inspeção de um texto que já foi concatenado.

O lote nativo é um recurso de conveniência de UX. Para o ingresso governado ele é
incompatível com a política, e a política ganha.

─── Deriva de versão falha FECHADA ─────────────────────────────────────────────

O carimbo de admissão é aplicado AQUI, pelo nosso código. Se uma versão futura do
Hermes deixar de chamar esta sobrescrita, nenhum evento sai daqui carimbado — e o
vínculo a jusante recusa material sem carimbo. A atualização não faz a cardinalidade
voltar a ser inverificável em silêncio: ela para o ingresso governado.
"""
from __future__ import annotations

import inspect
import weakref
from contextvars import ContextVar
from typing import Any, Callable

from .compat import METODO_TRATA_TEXTO, CompatibilityProof, verify_compatibility
from .ingress import GovernedTelegramIngressV1, IngressRefusal, capture_ingress

#: A prova de admissão que o vínculo a jusante exige. Descreve o CAMINHO, para que
#: ninguém a confunda com "alguém disse que estava autorizado".
ADMISSION_EVIDENCE = "hermes_telegram_post_allowlist_enqueue_intercept/v1"


def _monta_emissao() -> tuple[Any, Any]:
    """
    Cria o estado de EMISSÃO e a fábrica da classe no MESMO escopo léxico.

    ─── Por que closure, e não atributo de módulo ───────────────────────────────

    O regate da r2 mostrou que `type(x) is GovernedTelegramIngressV1` não é prova de
    nada: o chamador constrói a classe genuína. A correção precisa de um mecanismo que
    o chamador não alcance — e em Python, atributo de módulo com sublinhado não é
    fronteira. `_CONTEXTO.set(_CAPACIDADE)` seria uma linha.

    Então o contexto, a capacidade e o registro vivem aqui dentro, e quem os toca é
    apenas o corpo das duas sobrescritas, definidas neste mesmo escopo. Não há atributo
    de módulo que os exponha.

    Chamar `_monta_emissao()` de novo é inofensivo: devolve um estado NOVO e vazio,
    cuja classe continua exigindo a autorização nativa para emitir.

    ─── O limite, dito em vez de encoberto ─────────────────────────────────────

    Célula de closure ainda é alcançável por `cls._enqueue_text_event.__closure__`.
    Isso é introspecção de interpretador, não API pública, e cai no que o §22 do brief
    põe fora do modelo de ameaça. Não afirmo mais do que isso.
    """
    #: Marca a invocação do MANIPULADOR NATIVO. Não é booleano de chamador: é escopo.
    contexto: ContextVar[object | None] = ContextVar(
        "creditum_telegram_native_admission", default=None)
    #: Identidade comparada por `is`. Objeto, não string — string se copia.
    capacidade = object()
    #: id(objeto) → (referência fraca, instantâneo de conteúdo).
    #:
    #: Chaveado por IDENTIDADE e não por valor: um `WeakKeyDictionary` usaria `__eq__`
    #: do dataclass, e um clone de `dataclasses.replace` com os mesmos valores seria
    #: encontrado. Igualdade não é procedência.
    emitidos: dict[int, tuple[Any, tuple]] = {}

    def instantaneo(i: GovernedTelegramIngressV1) -> tuple:
        return (i.protocol_version, i.transport, i.sender_user_id,
                i.destination_chat_id, i.destination_thread_id, i.message_id,
                i.update_id, i.text, i.telegram_timestamp, i.admission_evidence,
                i.hermes_version, i.adapter_compat_id, i.source_message_count)

    def limpa_mortos() -> None:
        for chave in [k for k, (r, _) in emitidos.items() if r() is None]:
            emitidos.pop(chave, None)

    def registra(i: GovernedTelegramIngressV1) -> None:
        limpa_mortos()
        emitidos[id(i)] = (weakref.ref(i), instantaneo(i))

    def verifica_emissao(objeto: object) -> bool:
        """
        Este OBJETO EXATO foi emitido pelo fluxo nativo admitido?

        Pública e somente-leitura: responder "sim/não" não cria autoridade. O que
        cria é `registra`, e ele não é alcançável.

        Identidade primeiro (`is`), conteúdo depois. Um `id` reciclado por outro objeto
        falha no `is`; um objeto alterado depois da emissão falha no instantâneo.
        """
        if type(objeto) is not GovernedTelegramIngressV1:
            return False
        entrada = emitidos.get(id(objeto))
        if entrada is None:
            return False
        ref, guardado = entrada
        if ref() is not objeto:
            return False
        return instantaneo(objeto) == guardado

    def build_governed_adapter_class(nativa: type, prova: CompatibilityProof) -> type:
        """
        Constrói a subclasse governada a partir da classe nativa JÁ verificada.

        Fábrica em vez de `class X(TelegramAdapter)` no topo do módulo porque a classe
        nativa não existe em máquina de desenvolvimento, e um import no topo faria o
        pacote inteiro exigir produção — o mesmo motivo pelo qual o executor congelado
        importa o SDK tarde.
        """
        nativo_trata = getattr(nativa, METODO_TRATA_TEXTO)
        e_assincrono = inspect.iscoroutinefunction(nativo_trata)

        def intercepta(self: Any, event: Any) -> Any:
            """A sobrescrita do enfileiramento. Só emite dentro do fluxo nativo."""
            if contexto.get() is not capacidade:
                # Chamada direta, fora do manipulador nativo. A allowlist não rodou,
                # então não há admissão — e sem admissão não há emissão.
                raise IngressRefusal("INGRESS_OUTSIDE_NATIVE_ADMISSION")
            ingresso = capture_ingress(
                event, admission_evidence=ADMISSION_EVIDENCE,
                hermes_version=prova.hermes_version,
                adapter_compat_id=prova.adapter_compat_id)
            registra(ingresso)
            sink = type(self)._creditum_ingress_sink
            if sink is not None:
                sink(ingresso)
            # Entrega IMEDIATA, sem janela de lote. `super()` é quem concatena.
            return self.handle_message(event)

        if e_assincrono:
            class CreditumGovernedTelegramAdapter(nativa):  # type: ignore[misc,valid-type]
                _creditum_ingress_sink: Callable[[GovernedTelegramIngressV1], None] | None = None
                _creditum_proof: CompatibilityProof = prova

                async def _handle_text_message(self, message: Any) -> Any:  # noqa: D102
                    # O `finally` só pode limpar DEPOIS de a corrotina nativa terminar.
                    # Num override síncrono sobre método assíncrono, o reset rodaria
                    # antes de o corpo nativo sequer começar.
                    token = contexto.set(capacidade)
                    try:
                        return await super()._handle_text_message(message)
                    finally:
                        contexto.reset(token)

                def _enqueue_text_event(self, event: Any) -> Any:  # noqa: D102
                    return intercepta(self, event)
        else:
            class CreditumGovernedTelegramAdapter(nativa):  # type: ignore[misc,valid-type,no-redef]
                _creditum_ingress_sink: Callable[[GovernedTelegramIngressV1], None] | None = None
                _creditum_proof: CompatibilityProof = prova

                def _handle_text_message(self, message: Any) -> Any:  # noqa: D102
                    token = contexto.set(capacidade)
                    try:
                        return super()._handle_text_message(message)
                    finally:
                        contexto.reset(token)

                def _enqueue_text_event(self, event: Any) -> Any:  # noqa: D102
                    return intercepta(self, event)

        CreditumGovernedTelegramAdapter.__name__ = "CreditumGovernedTelegramAdapter"
        return CreditumGovernedTelegramAdapter

    return build_governed_adapter_class, verifica_emissao


#: A fábrica e o verificador. O estado que os liga NÃO tem nome de módulo.
build_governed_adapter_class, verify_issued = _monta_emissao()


def register(plugin_context: Any, ingress_sink: Callable[[GovernedTelegramIngressV1], None]) -> type:
    """
    Registra pela interface SUPORTADA. Recusa antes de registrar se algo divergir.

    A ordem importa: a compatibilidade é provada PRIMEIRO. Registrar e depois conferir
    deixaria uma janela em que o adaptador governado já está no lugar sem prova — e
    "descobrir depois" é o que esta fase inteira existe para evitar.
    """
    prova = verify_compatibility()
    from .compat import CompatRefusal, _classe_nativa  # noqa: PLC0415

    nativa = _classe_nativa()
    governada = build_governed_adapter_class(nativa, prova)
    governada._creditum_ingress_sink = staticmethod(ingress_sink)  # type: ignore[assignment]

    registrar = getattr(plugin_context, "register_platform", None)
    if not callable(registrar):
        raise CompatRefusal("PLUGIN_CONTEXT_UNSUPPORTED", "register_platform ausente")
    registrar(governada)
    return governada


#: ─── O que a Hostinger vai precisar, quando o deploy for autorizado ───────────
#:
#: Este pacote precisa ser descobrível como plugin do Hermes e chamar `register(...)`
#: no seu ponto de entrada de plugin. A entrada exata de configuração depende do
#: carregador de plugins da 0.20.4, que não pude inspecionar — está declarado como
#: pendência no relatório, não presumido aqui.
PLUGIN_ENTRYPOINT_NOTE = (
    "Registrar via PluginContext.register_platform. A entrada de descoberta de plugin "
    "na config da Hostinger ainda precisa ser confirmada contra o carregador da 0.20.4."
)
