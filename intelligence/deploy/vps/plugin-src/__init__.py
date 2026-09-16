"""
D2E-A8-R1 §6 — o ponto de entrada do plugin de diretório. CASCA, não implementação.

O Hermes 0.20.4 carrega plugin de diretório chamando `register(ctx: PluginContext)`,
síncrono. Esta casca faz três coisas e nenhuma quarta:

  1. delega para a implementação GOVERNADA da a4, `creditum_hermes_telegram.adapter`;
  2. oferece um coletor em memória como sumidouro de ingresso;
  3. devolve o que a a4 devolveu.

─── Por que casca e não implementação ──────────────────────────────────────────

O §6 é explícito: não criar uma segunda implementação da a4. A lógica de admissão,
emissão, cardinalidade e compatibilidade mora no pacote embarcado, que passou cinco
rodadas de regate. Reescrever qualquer parte dela aqui criaria uma segunda verdade
sobre a mesma coisa — o defeito que esta fase inteira vem fechando.

─── Por que o sumidouro NÃO planeja ────────────────────────────────────────────

O sumidouro recebe cada `GovernedTelegramIngressV1` emitido e o GUARDA. Ele não chama
`build_production_candidate`, não deriva plano, não renderiza autorização e não
executa.

Planejar dentro do sumidouro faria uma mensagem do Telegram disparar derivação
canônica automaticamente — e derivação automática é meio caminho para execução
automática. Admissão de transporte e aprovação humana são portões independentes desde
a a4, e continuam sendo dois: o ingresso fica aqui até alguém explicitamente pedir o
candidato.
"""
from __future__ import annotations

from collections import deque
from contextvars import ContextVar
from typing import Any, Deque

from creditum_hermes_telegram.telemetry import (
    RuntimeTelemetryJournal,
    TelemetryRefusal,
)

#: Limite do coletor. Sem limite, uma rajada de mensagens cresceria sem fim dentro do
#: processo do gateway; com limite, a mais antiga sai e o processo segue previsível.
COLETOR_MAX = 256

# Identifica a linhagem, não o hash final da imagem. O digest da imagem continua
# sendo autoridade externa e precisa ser registrado na qualificação A8.
CANDIDATE_LINEAGE = "g3v_from_c3f6abceb4953dbb924ce12250909e48823a5cfb"


def _monta_coletor() -> tuple[Any, Any]:
    """
    O coletor e seu leitor, no mesmo escopo léxico.

    O `deque` não tem nome de módulo: quem escreve nele é apenas o sumidouro devolvido
    aqui. A lição da d2e-a4-r5 — estado de emissão não mora em atributo de módulo —
    vale para qualquer estado que alguém possa querer forjar.
    """
    fila: Deque[Any] = deque(maxlen=COLETOR_MAX)

    def sumidouro(ingresso: Any) -> None:
        fila.append(ingresso)

    def drena() -> list[Any]:
        """Retira o que foi coletado. Somente leitura destrutiva, sem planejar."""
        itens = list(fila)
        fila.clear()
        return itens

    return sumidouro, drena


_sumidouro, drain_admitted_ingress = _monta_coletor()

# O adaptador A4 é byte-congelado. Esta capacidade ambiente existe somente durante
# a chamada do enfileiramento governado da instância instrumentada; o sink a consome
# para ligar o ingresso admitido ao consumidor que o observou.
_consumidor_corrente: ContextVar[Any | None] = ContextVar(
    "creditum_g3v_telemetry_consumer", default=None)


def _sumidouro_instrumentado(ingresso: Any) -> None:
    consumidor = _consumidor_corrente.get()
    if consumidor is None:
        raise TelemetryRefusal("TELEMETRY_CONSUMER_CONTEXT_MISSING")
    # O A4 chama o sink depois de sua admissão e antes de agendar a entrega. Logo a
    # escrita continua anterior ao primeiro efeito a jusante sem alterar um byte A4.
    consumidor.update_admitted(ingresso.update_id)
    _sumidouro(ingresso)


class _ContextoInstrumentado:
    """Fachada mínima: conserva o registro nativo e envolve somente a fábrica."""

    def __init__(self, delegate: Any, journal: RuntimeTelemetryJournal) -> None:
        self._delegate = delegate
        self._journal = journal
        self.instrumented_factory: Any | None = None

    def register_platform(
        self,
        name: str,
        label: str,
        adapter_factory: Any,
        check_fn: Any,
        **extra: Any,
    ) -> Any:
        # A fábrica não deve reter a fachada do PluginContext. Ela precisa somente
        # do journal; capturar `self` manteria `_delegate` (e suas capacidades) vivo
        # pelo tempo inteiro do processo sem necessidade operacional.
        journal = self._journal

        def fabrica_instrumentada(config: Any) -> Any:
            adaptador = adapter_factory(config)
            if adaptador is None:
                return None

            conecta_nativo = getattr(adaptador, "connect", None)
            enfileira_governado = getattr(adaptador, "_enqueue_text_event", None)
            if not callable(conecta_nativo) or not callable(enfileira_governado):
                raise TelemetryRefusal("TELEMETRY_ADAPTER_BOUNDARY_MISSING")

            consumidor = journal.new_consumer()

            async def conecta_instrumentado(*args: Any, **kwargs: Any) -> Any:
                # Durável antes de entregar controle ao connect A4/nativo. Se o
                # journal falhar, nenhum consumidor começa sem identidade.
                consumidor.connect_attempt()
                return await conecta_nativo(*args, **kwargs)

            def enfileira_instrumentado(evento: Any) -> Any:
                token = _consumidor_corrente.set(consumidor)
                try:
                    return enfileira_governado(evento)
                finally:
                    _consumidor_corrente.reset(token)

            # São atributos da INSTÂNCIA produzida pela fábrica já governada. A
            # classe A4, sua prova estrutural e seus bytes permanecem intocados.
            adaptador.connect = conecta_instrumentado
            adaptador._enqueue_text_event = enfileira_instrumentado
            return adaptador

        self.instrumented_factory = fabrica_instrumentada
        return self._delegate.register_platform(
            name=name,
            label=label,
            adapter_factory=fabrica_instrumentada,
            check_fn=check_fn,
            **extra,
        )


def register(ctx: Any) -> type:
    """
    O ponto de entrada que o Hermes 0.20.4 chama. Síncrono, como o contrato exige.

    Delega para a a4, que prova a compatibilidade do adaptador nativo ANTES de
    registrar — registrar e conferir depois deixaria uma janela em que o adaptador
    governado já está no lugar sem prova.
    """
    from creditum_hermes_telegram.adapter import register as register_governado

    telemetria = RuntimeTelemetryJournal.production(
        candidate_lineage=CANDIDATE_LINEAGE)
    contexto = _ContextoInstrumentado(ctx, telemetria)
    governada = register_governado(contexto, _sumidouro_instrumentado)
    if contexto.instrumented_factory is None:
        raise TelemetryRefusal("TELEMETRY_FACTORY_NOT_REGISTERED")
    # A sonda de vencedor compara a fábrica armazenada com esta identidade. Manter
    # ambas iguais evita que a observabilidade esconda qual fábrica está em vigor.
    governada._creditum_adapter_factory = staticmethod(
        contexto.instrumented_factory)
    return governada
