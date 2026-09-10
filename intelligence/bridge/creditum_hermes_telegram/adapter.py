"""
O adaptador Telegram governado, e seu registro pela interface suportada.

─── A superfície interceptada, e por que só ela ────────────────────────────────

Uma única sobrescrita de comportamento: `_enqueue_text_event`. É o último ponto em
que a cardinalidade da mensagem ainda existe — depois dele o nativo faz
`existing.text = existing.text + "\\n" + event.text` e a fronteira some.

Além dela, DUAS sobrescritas de escopo — `_handle_text_message` e `_handle_command` —
que não decidem nada: apenas marcam que a execução está dentro de um manipulador
nativo. Tudo o mais é herdado: polling, credencial, allowlist, envio, ciclo de vida,
erros. Não há segundo consumidor, não há segundo cliente do Telegram e nada sob
`/opt/hermes-agent` é tocado.

─── O que a r6 mediu, e mudou ──────────────────────────────────────────────────

Até a r5 este arquivo assumia um contrato que o Hermes 0.20.4 GENUÍNO refuta em
quatro pontos. Cada um deles teria falhado em produção, e três em silêncio:

  * o enfileiramento nativo tem DOIS chamadores. `_handle_command` roteia colagem
    de comando longa pelo mesmo pipeline. A capacidade cobria só o de texto, então
    um `/comando` longo legítimo era RECUSADO;
  * os manipuladores nativos são `async def (self, update, context)`. A sobrescrita
    declarava `(self, message)`, e o python-telegram-bot chama com dois — `TypeError`
    na primeira mensagem real;
  * `handle_message` é ASSÍNCRONO, e a interceptação fazia `return
    self.handle_message(event)` de dentro de um método SÍNCRONO que o nativo chama
    sem `await`. A corrotina era criada e descartada: ingresso registrado, sink
    chamado, mensagem nunca entregue;
  * `register_platform` exige `(name, label, adapter_factory, check_fn)`, e a r5
    passava a classe num único posicional.

O despacho agora usa o MESMO mecanismo do nativo — uma task no loop corrente, que é
o que `_enqueue_text_event` nativo faz com seu flush. Não é invenção da Creditum.

─── Deriva de versão falha FECHADA ─────────────────────────────────────────────

O carimbo de admissão é aplicado AQUI, pelo nosso código. Se uma versão futura do
Hermes deixar de chamar esta sobrescrita, nenhum evento sai daqui carimbado — e o
vínculo a jusante recusa material sem carimbo. A atualização não faz a cardinalidade
voltar a ser inverificável em silêncio: ela para o ingresso governado.
"""
from __future__ import annotations

import asyncio
import weakref
from contextvars import ContextVar
from typing import Any, Callable

from .compat import (
    ATRIBUTO_APLICACAO, CAMPO_COM_AUTORIDADE_DE_INSTALACAO,
    CHAMADORES_DO_ENFILEIRAMENTO,
    METODO_CONECTA, METODO_ENTREGA, METODO_REGISTRA_HANDLERS,
    NATIVE_REGISTER_PLATFORM, PLATFORM_LABEL, PLATFORM_NAME, CompatRefusal,
    CompatibilityProof, _classe_nativa, campos_do_registro_embutido,
    prova_assinatura_do_registro, resolvedor_de_notificacao, verify_compatibility,
)
from .ingress import GovernedTelegramIngressV1, IngressRefusal, capture_ingress

#: A prova de admissão que o vínculo a jusante exige. Descreve o CAMINHO, para que
#: ninguém a confunda com "alguém disse que estava autorizado".
#:
#: v1 dizia apenas `post_allowlist_enqueue_intercept` — e era exato: sob a r6c, tudo
#: o que a admissão garantia era ter passado pela allowlist nativa. Foi exatamente o
#: bastante para o defeito da r6c-inv existir, porque a allowlist confere a
#: identidade que o objeto DECLARA, não a origem: qualquer código do processo
#: chamando o manipulador nomeado com um `update` forjado a satisfazia.
#:
#: A r6d acrescenta a origem: a admissão só nasce no chamável que o
#: python-telegram-bot guarda. O rótulo tem de dizer isso. Manter v1 faria dois
#: registros com garantias diferentes compartilharem um nome — o mesmo motivo pelo
#: qual o compat id virou v2.
ADMISSION_EVIDENCE = (
    "hermes_telegram_registered_dispatch_post_allowlist_intercept/v2")

#: ─── Política de dependência governada (a4-r6a) ──────────────────────────────
#:
#: "Dependência de runtime é autoridade de tempo de IMPLANTAÇÃO, não autoridade de
#: reparo em runtime."
#:
#: O runtime exato é construído e selado antes do deploy. Dependência faltando em
#: runtime é evidência de imagem inválida, deriva ou implantação incompleta — e
#: evidência disso tem de causar RECUSA, não autorreparo. Um contêiner que se
#: conserta sozinho deixou de ser o contêiner que foi selado, e a cadeia de
#: suprimento passa a descrever outra coisa.
DEPENDENCY_POLICY = "creditum_governed_no_runtime_dependency_repair/v1"

#: A dica que o Hermes imprime quando as dependências não passam. A embutida diz
#: "Run `hermes setup` to install Telegram support" — sob esta política isso é
#: conselho ERRADO, impresso pelo próprio aviso do Hermes. Substituída.
INSTALL_HINT_GOVERNADO = (
    "runtime governado: dependência ausente indica imagem inválida ou deriva. "
    "Reconstrua o artefato selado. NÃO instale nada nesta máquina.")


def _monta_emissao() -> tuple[Any, Any]:
    """
    Cria o estado de EMISSÃO e a fábrica da classe no MESMO escopo léxico.

    ─── Por que closure, e não atributo de módulo ───────────────────────────────

    O regate da r2 mostrou que `type(x) is GovernedTelegramIngressV1` não é prova de
    nada: o chamador constrói a classe genuína. A correção precisa de um mecanismo que
    o chamador não alcance — e em Python, atributo de módulo com sublinhado não é
    fronteira. `_CONTEXTO.set(_CAPACIDADE)` seria uma linha.

    Então o contexto, a capacidade e o registro vivem aqui dentro, e quem os toca é
    apenas o corpo das sobrescritas, definidas neste mesmo escopo. Não há atributo
    de módulo que os exponha.

    Chamar `_monta_emissao()` de novo é inofensivo: devolve um estado NOVO e vazio,
    cuja classe continua exigindo a autorização nativa para emitir.

    ─── O limite, dito em vez de encoberto ─────────────────────────────────────

    Célula de closure ainda é alcançável por `cls._enqueue_text_event.__closure__`.
    Isso é introspecção de interpretador, não API pública, e cai no que o §22 do brief
    põe fora do modelo de ameaça. Não afirmo mais do que isso.
    """
    #: Marca a invocação de UM MANIPULADOR NATIVO. Não é booleano de chamador: é
    #: escopo. A r6 ampliou a cobertura para os dois manipuladores medidos, e nada
    #: além deles — a capacidade não fica globalmente ativa.
    contexto: ContextVar[object | None] = ContextVar(
        "creditum_telegram_native_admission", default=None)
    #: Identidade comparada por `is`. Objeto, não string — string se copia.
    capacidade = object()
    #: ─── a capacidade de REGISTRO (a4-r6e) ───────────────────────────────────
    #:
    #: Distinta da de admissão, e de propósito: uma autoriza INSTALAR os callbacks
    #: governados, a outra autoriza EMITIR um ingresso. Confundi-las foi o que
    #: permitiu que `_register_handlers(app_qualquer)` entregasse o chamável
    #: privilegiado a quem pedisse.
    contexto_registro: ContextVar[object | None] = ContextVar(
        "creditum_telegram_registration", default=None)
    capacidade_registro = object()
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

        def intercepta(self: Any, event: Any) -> None:
            """
            A sobrescrita do enfileiramento. Só emite dentro do fluxo nativo, e só
            UMA vez por admissão.

            ─── A admissão é um DIREITO DE USO ÚNICO ────────────────────────────

            Até a r6a a capacidade seguia ativa enquanto o sink rodava e enquanto a
            task de entrega era criada. Isso a transformava em autoridade AMBIENTE
            para todo o processamento a jusante: o sink podia reentrar aqui com um
            evento forjado e receber procedência genuína. Reproduzido — o sink
            reentrante emitiu até estourar a pilha de recursão.

            "Está dentro de um manipulador nativo" e "esta é a mensagem admitida"
            não são a mesma afirmação, e tratá-las como uma só foi o defeito.

            Então a capacidade é CONSUMIDA na entrada, antes de qualquer outra coisa.
            Consumir antes até do `capture_ingress` é deliberado: se o evento tivesse
            uma propriedade com efeito colateral, nem ela alcançaria uma segunda
            emissão.
            """
            if contexto.get() is not capacidade:
                # Chamada direta, fora dos manipuladores nativos; ou segunda chamada
                # dentro da mesma admissão, já consumida. A allowlist não rodou para
                # ESTE evento, então não há admissão — e sem admissão não há emissão.
                raise IngressRefusal("INGRESS_OUTSIDE_NATIVE_ADMISSION")

            # ─── CONSOME ─────────────────────────────────────────────────────
            #
            # `set(None)` sem guardar token: não há caminho que reative. O `finally`
            # do envelope nativo faz `reset(token_externo)`, que restaura o valor
            # ANTERIOR à admissão — que é limpo. Restaurar limpo sobre consumido
            # continua limpo.
            contexto.set(None)

            ingresso = capture_ingress(
                event, admission_evidence=ADMISSION_EVIDENCE,
                hermes_version=prova.hermes_version,
                adapter_compat_id=prova.adapter_compat_id)
            registra(ingresso)

            # Daqui para baixo tudo roda em contexto LIMPO. O sink é fornecido pelo
            # chamador, e código do chamador não herda direito de admissão.
            sink = type(self)._creditum_ingress_sink
            if sink is not None:
                sink(ingresso)

            # Entrega IMEDIATA, sem janela de lote. `super()` é quem concatena.
            #
            # `handle_message` é uma corrotina, e o nativo chama este método SEM
            # `await`. Devolver a corrotina a descartaria. Uma task no loop corrente
            # é exatamente como o nativo despacha seu próprio flush.
            #
            # A task COPIA o contexto no momento da criação. Criá-la depois do
            # consumo é o que faz `handle_message` rodar sem direito de admissão —
            # criar antes daria à entrega a autoridade que acabamos de tirar do sink.
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                raise IngressRefusal("INGRESS_WITHOUT_EVENT_LOOP") from None
            tarefa = loop.create_task(self.handle_message(event))
            # Referência forte enquanto pendente: sem ela o coletor pode recolher a
            # task no meio do caminho, e a mensagem sumiria em silêncio.
            pendentes = self.__dict__.setdefault("_creditum_pending_delivery", set())
            pendentes.add(tarefa)
            tarefa.add_done_callback(pendentes.discard)
            return None

        def descarta_admissao_nao_usada() -> None:
            """
            Descarta uma admissão que NÃO foi usada para enfileirar.

            ─── Por que isto existe (a4-r6c) ────────────────────────────────────

            A r6b consumia a capacidade dentro de `_enqueue_text_event`. Isso cobre
            o caminho de texto e o de comando LONGO. Mas o `_handle_command` genuíno
            tem duas formas de entrega, e a curta não passa pelo enfileiramento:

                if len(event.text or "") >= self._SPLIT_THRESHOLD:
                    return self._enqueue_text_event(event)   # longa
                return await self.handle_message(event)      # curta ← sem consumo

            Num `/stop`, a admissão continuava ATIVA durante toda a entrega, e um
            gancho de entrega reentrante recebia procedência genuína. Reproduzido:
            `REENTRY ['ACCEPT']`, `ISSUED ['FORGED-FROM-SHORT-COMMAND']`.

            O erro de modelo foi supor que a admissão só termina onde ela é gasta.
            Ela também termina onde deixa de ser necessária — e entregar é isso.

            No-op quando o contexto já está limpo: `handle_message` é chamado de
            outros sete métodos nativos, e nenhum deles tem admissão ativa.
            """
            if contexto.get() is capacidade:
                contexto.set(None)

        nativo_entrega = getattr(nativa, METODO_ENTREGA)

        async def entrega_governada(self: Any, event: Any) -> Any:
            """
            A fronteira de ENTREGA é limpa por construção.

            O descarte é a primeira coisa: antes de tocar o evento, antes de
            qualquer gancho, antes do corpo nativo e antes de qualquer `await`.
            """
            descarta_admissao_nao_usada()
            return await nativo_entrega(self, event)

        entrega_governada.__name__ = METODO_ENTREGA
        entrega_governada.__qualname__ = f"CreditumGovernedTelegramAdapter.{METODO_ENTREGA}"

        # ─── a4-r6d: a ADMISSÃO nasce no registro, não num método nomeado ────
        #
        # Até a r6c, `_handle_text_message` e `_handle_command` eram sobrescritos e
        # ELES estabeleciam a capacidade. Isso fazia de um método nomeado a porta da
        # admissão: qualquer código do processo que o chamasse com um `update`
        # forjado abria uma admissão nova. A autorização nativa rodava — e passava,
        # porque ela confere a identidade que o objeto DECLARA, não a origem.
        #
        # Medido na fonte genuína, e é o que torna a correção possível:
        #
        #   * `_register_handlers(self, app)` é a FONTE ÚNICA de registro no
        #     python-telegram-bot (linha 4203 da 0.20.4);
        #   * `_handle_text_message` e `_handle_command` têm EXATAMENTE UMA
        #     referência cada em toda a classe, e é ali dentro;
        #   * nenhum outro código, nativo ou do gateway, os chama.
        #
        # Então a admissão passa a ser estabelecida pelo chamável que o PTB guarda,
        # e os métodos nomeados deixam de conceder autoridade. Chamar
        # `adapter._handle_text_message(forjado, None)` continua atravessando a
        # autorização nativa — e chega ao enfileiramento SEM admissão, que recusa.
        #
        # O limite, dito: quem vasculhar o registro interno do PTB alcança o
        # chamável. Isso é a mesma classe de introspecção que `__closure__`, que o
        # §22 do modelo de ameaça põe fora de escopo. O que muda é que a porta
        # deixou de ter nome público.
        funcoes_governadas = {
            getattr(nativa, nome): nome
            for nome in sorted(CHAMADORES_DO_ENFILEIRAMENTO)
        }
        nativo_registra = getattr(nativa, METODO_REGISTRA_HANDLERS)

        def admissao(instancia: Any, nome: str, nativo: Any):
            """O chamável que o PTB passa a guardar. Abre UMA admissão."""

            async def despacha(update: Any, context: Any) -> Any:
                # Admissão só se abre a partir de contexto LIMPO. Encontrar uma já
                # ativa seria empilhamento — e autoridade empilhada é autoridade que
                # sobrevive ao seu ato. Recusa em vez de reusar.
                if contexto.get() is capacidade:
                    raise IngressRefusal("NATIVE_ADMISSION_ALREADY_ACTIVE")
                token = contexto.set(capacidade)
                try:
                    return await nativo(instancia, update, context)
                finally:
                    contexto.reset(token)

            despacha.__name__ = f"creditum_admissao_{nome}"
            despacha.__qualname__ = (
                f"CreditumGovernedTelegramAdapter.<admissao>.{nome}")
            return despacha

        def registra_governado(self: Any, app: Any) -> None:
            """
            Deixa o registro NATIVO acontecer e troca só os dois chamáveis governados.

            Reimplementar o registro seria uma segunda implementação de filtros,
            grupos e dos outros quatro handlers — o defeito que a r6a já evitou no
            `register_platform`. Aqui o nativo registra tudo; um proxy intercepta
            `add_handler` e substitui o callback quando ele é um dos dois nossos.

            ─── Por que há três portões antes disso (a4-r6e) ────────────────────

            A r6d entregava o chamável governado a QUALQUER objeto com `add_handler`.
            Chamar `adapter._register_handlers(coletor)` devolvia a autoridade de
            despacho de bandeja — sem introspecção nenhuma, só uma chamada de método.
            A porta tinha perdido o nome e ganhado uma chave sob o tapete.

            Agora, nesta ordem:

              1. a capacidade de REGISTRO tem de estar ativa — ela só nasce no
                 `connect` governado, que é onde o nativo constrói a Application;
              2. o app tem de ser o `self._app` do próprio adaptador — o objeto que
                 o `builder.build()` acabou de produzir, não um trazido pelo chamador
                 (o `connect` nativo sobrescreve `self._app` antes de registrar,
                 então nem plantar o atributo antes adianta);
              3. registro é de uso único POR APLICAÇÃO — o mesmo objeto duas vezes
                 recusa, e o caminho de reconstrução, que constrói um app novo, passa.
            """
            if contexto_registro.get() is not capacidade_registro:
                raise IngressRefusal("REGISTRATION_OUTSIDE_NATIVE_CONNECT")
            proprio = self.__dict__.get(ATRIBUTO_APLICACAO)
            if proprio is None or app is not proprio:
                raise IngressRefusal("REGISTRATION_APP_NOT_OWNED")
            # ─── histórico COMPLETO por identidade (a4-r6f) ──────────────────
            #
            # Guardar só o último app fazia A→B→A aceitar a terceira: A já não era o
            # último, e voltava a ser elegível. Medido: A recebia quatro callbacks em
            # vez de dois. É o padrão A→B→A que a a6-r4 já tinha me ensinado, e que
            # eu não generalizei.
            #
            # A chave é `id(app)`, mas id sozinho NÃO é autoridade: o CPython reusa
            # ids de objetos coletados. Por isso cada entrada guarda uma referência
            # FRACA, e só conta como "já registrado" se ela ainda resolver para
            # ESTE objeto por `is`. Um id reusado por outro objeto tem referência
            # morta, e o objeto novo passa — que é o desfecho correto.
            historico = self.__dict__.setdefault("_creditum_registered_apps", {})
            for chave in [k for k, r in historico.items() if r() is None]:
                historico.pop(chave, None)
            anterior = historico.get(id(app))
            if anterior is not None and anterior() is app:
                raise IngressRefusal("REGISTRATION_ALREADY_DONE_FOR_APP")

            trocados: set[str] = set()
            #: As instalações ficam RETIDAS até a topologia estar conferida. Sem isso,
            #: uma recusa no meio deixaria o app com parte dos handlers já instalados
            #: — inclusive os governados — num objeto que ninguém mais vai validar.
            #: Nada chega ao app real antes de sabermos que o conjunto está certo.
            retidos: list[tuple[Any, tuple, dict]] = []

            class _AppGovernada:
                def add_handler(_p, handler: Any, *a: Any, **k: Any) -> None:
                    alvo = getattr(getattr(handler, "callback", None), "__func__", None)
                    nome = funcoes_governadas.get(alvo)
                    if nome is not None:
                        handler.callback = admissao(self, nome, alvo)
                        trocados.add(nome)
                    retidos.append((handler, a, k))

                def __getattr__(_p, atributo: str) -> Any:
                    return getattr(app, atributo)

            nativo_registra(self, _AppGovernada())

            # Falha FECHADA. Se o nativo deixar de registrar um dos dois por aqui,
            # nenhuma admissão seria criada para ele e o ingresso governado sumiria
            # em SILÊNCIO. Recusar no arranque é o desfecho certo.
            if trocados != set(CHAMADORES_DO_ENFILEIRAMENTO):
                faltando = sorted(set(CHAMADORES_DO_ENFILEIRAMENTO) - trocados)
                raise CompatRefusal("NATIVE_HANDLERS_NOT_INTERCEPTED",
                                    ",".join(faltando) or "nenhum")

            # Topologia conferida: só agora as instalações chegam ao app real, na
            # ordem e com os grupos que o nativo pediu.
            for handler, a, k in retidos:
                app.add_handler(handler, *a, **k)

            # E só depois disso o app entra no histórico. Um registro que falhou no
            # meio não instalou nada e não queima o objeto para uma tentativa correta.
            historico[id(app)] = weakref.ref(app)

        nativo_conecta = getattr(nativa, METODO_CONECTA)

        async def conecta_governada(self: Any, *args: Any, **kwargs: Any) -> Any:
            """
            O ciclo de vida que EMITE a capacidade de registro.

            Medido na 0.20.4: as duas chamadas a `_register_handlers` estão dentro de
            `connect`, e as duas passam o `self._app` que o `builder.build()` acabou
            de produzir. Então emitir aqui e exigir lá é exatamente cobrir o caminho
            genuíno, e nada além dele.

            O caminho de reconstrução do próprio `connect` registra de novo, num app
            NOVO — por isso a capacidade vale pela duração do `connect`, e o que é de
            uso único é o registro POR APLICAÇÃO.
            """
            token = contexto_registro.set(capacidade_registro)
            try:
                return await nativo_conecta(self, *args, **kwargs)
            finally:
                contexto_registro.reset(token)

        conecta_governada.__name__ = METODO_CONECTA
        conecta_governada.__qualname__ = f"CreditumGovernedTelegramAdapter.{METODO_CONECTA}"

        registra_governado.__name__ = METODO_REGISTRA_HANDLERS
        registra_governado.__qualname__ = (
            f"CreditumGovernedTelegramAdapter.{METODO_REGISTRA_HANDLERS}")

        corpo: dict[str, Any] = {
            # `__module__` explícito: a classe nativa tem metaclasse `ABCMeta`, e
            # `type(nome, bases, corpo)` delega para ela — que resolve `__module__`
            # pelo frame do chamador, ou seja, de dentro do `abc.py`. Sem isto a
            # classe governada se apresenta como `abc.CreditumGovernedTelegramAdapter`,
            # e a identidade que a sonda confere é justamente o módulo.
            "__module__": __name__,
            "__qualname__": "CreditumGovernedTelegramAdapter",
            "_creditum_ingress_sink": None,
            "_creditum_proof": prova,
            "_enqueue_text_event": intercepta,
            METODO_ENTREGA: entrega_governada,
            METODO_REGISTRA_HANDLERS: registra_governado,
            METODO_CONECTA: conecta_governada,
        }
        # `_handle_text_message` e `_handle_command` NÃO são mais sobrescritos: eles
        # deixaram de ser a porta da admissão, e sobrescrevê-los só para repassar
        # daria a impressão de que ainda são.

        return type("CreditumGovernedTelegramAdapter", (nativa,), corpo)

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
    nativa = _classe_nativa()
    governada = build_governed_adapter_class(nativa, prova)
    governada._creditum_ingress_sink = staticmethod(ingress_sink)  # type: ignore[assignment]

    registrar = getattr(plugin_context, NATIVE_REGISTER_PLATFORM, None)
    if not callable(registrar):
        raise CompatRefusal("PLUGIN_CONTEXT_UNSUPPORTED", "register_platform ausente")
    # A assinatura é provada ANTES da chamada. Descobrir o contrato por `TypeError`
    # no meio de um registro é descobrir depois.
    prova_assinatura_do_registro(registrar)

    resolve_modo = resolvedor_de_notificacao()

    # ─── a política de dependência, ligada lexicamente ───────────────────────
    #
    # O detector é o PASSIVO GENUÍNO do embutido — o mesmo `check_fn` que a entrada
    # registra, e que o Hermes chama de telas de status, do passe de habilitação e do
    # `create_adapter`. Não inventei um segundo detector: dois detectores dariam duas
    # respostas possíveis, e a que valeria seria a última consultada.
    campos = dict(campos_do_registro_embutido())
    verifica_dependencias = campos["check_fn"]

    def fabrica_governada(config: Any) -> Any:
        """
        A fábrica FIXA. Uma classe, ligada lexicamente; nada escolhido pelo chamador.

        `adapter_factory` no Hermes é um chamável que recebe `PlatformConfig` e
        devolve a INSTÂNCIA — não a classe. E a fábrica nativa aplica o modo de
        notificação depois de construir, porque `_notifications_mode` não tem default
        na classe. Herdo esse passo em vez de deixar o atributo ausente.

        ─── Por que a checagem também mora AQUI ─────────────────────────────────

        Com `ensure_deps_fn=None`, o `create_adapter` genuíno já recusa antes de
        chamar a fábrica: `if not deps_ok: logger.warning(...); return None`. Então
        esta checagem é redundante no caminho do Hermes — de propósito.

        O que ela acrescenta é a recusa EXPLÍCITA na fronteira governada. O outro
        consumidor do campo, o passe de habilitação do `gateway/config.py`, faz
        `if not deps_ok and entry.ensure_deps_fn is None: continue` — ou seja, deixa
        de habilitar a plataforma com um `logger.debug`. Isso é fechado, mas é
        QUIETO. E a fábrica pode ser chamada direto, fora do `create_adapter`.

        Uma exceção aqui é tratada pelo caminho de erro do próprio Hermes
        (`except Exception` → `logger.error` → devolve `None`), então recusar não
        inventa framework de erro paralelo: usa o que já existe.
        """
        try:
            dependencias_ok = bool(verifica_dependencias())
        except Exception:  # noqa: BLE001
            # O Hermes trata `check_fn` que levanta como falso. Faço o mesmo, e
            # recuso — "não sei" nunca vira "pode seguir".
            dependencias_ok = False
        if not dependencias_ok:
            raise CompatRefusal("PLATFORM_DEPENDENCIES_MISSING", DEPENDENCY_POLICY)
        adaptador = governada(config)
        try:
            adaptador._notifications_mode = resolve_modo()
        except Exception:  # noqa: BLE001
            adaptador._notifications_mode = "important"
        return adaptador

    governada._creditum_adapter_factory = staticmethod(  # type: ignore[assignment]
        fabrica_governada)

    # ─── a entrada: a EMBUTIDA, com três campos SUBSTITUÍDOS ─────────────────
    #
    # Registrar sob a chave `telegram` DESLOCA a entrada embutida — o Hermes é
    # last-writer-wins. Uma entrada nossa com só os quatro campos obrigatórios
    # derrubaria entrega de cron, fiação de allowlist por env, config em yaml,
    # envio autônomo e limite de mensagem, e derrubaria em silêncio.
    #
    # O que NÃO se herda são os campos que carregam autoridade que a política nega.
    campos["name"] = PLATFORM_NAME
    campos["label"] = PLATFORM_LABEL
    campos["adapter_factory"] = fabrica_governada

    # ─── a4-r6a: a autoridade ativa de instalação é REMOVIDA ─────────────────
    #
    # Medido no `create_adapter` genuíno:
    #
    #     deps_ok = bool(entry.check_fn())
    #     if not deps_ok and entry.ensure_deps_fn is not None:
    #         deps_ok = bool(entry.ensure_deps_fn())      # ← instala
    #     if not deps_ok:
    #         logger.warning(...install_hint); return None
    #
    # O embutido registra `ensure_deps_fn=check_telegram_requirements`, que chama
    # `tools.lazy_deps.ensure("platform.telegram", prompt=False)` — instalação de
    # pacote no venv ativo, sem prompt, porque o gateway é não-interativo. Dos sete
    # chamáveis herdados, esse é o ÚNICO que alcança um instalador.
    #
    # `None` é a representação genuína, não um contorno: o campo é `Optional`, e o
    # próprio comentário nativo define `None` como "no auto-install; a False check_fn
    # is then a hard block". Com `None`, o ramo do instalador nem é ENTRADO.
    #
    # Um "chamável de recusa governado" no lugar seria pior: o Hermes entraria no
    # ramo, logaria "dependencies missing — attempting install..." (que seria falso)
    # e chegaria ao mesmo `deps_ok=False`, com mais peças móveis.
    campos[CAMPO_COM_AUTORIDADE_DE_INSTALACAO] = None
    campos["install_hint"] = INSTALL_HINT_GOVERNADO

    registro = registrar(**campos)

    # ─── F3: o retorno é AUTORIDADE, não enfeite ─────────────────────────────
    #
    # O Hermes devolve `None` quando a entrada submetida não se tornou a registrada
    # em vigor. A r5 descartava o retorno, então perder o registro era invisível: o
    # plugin relatava sucesso e o vencedor era outro.
    if registro is None:
        raise CompatRefusal("PLATFORM_REGISTRATION_NOT_WINNER", PLATFORM_NAME)
    chave = getattr(registro, "key", None)
    if chave != PLATFORM_NAME:
        raise CompatRefusal("PLATFORM_REGISTRATION_KEY_UNEXPECTED", repr(chave)[:40])
    if getattr(registro, "kind", None) != "platform":
        raise CompatRefusal("PLATFORM_REGISTRATION_KIND_UNEXPECTED",
                            repr(getattr(registro, "kind", None))[:40])
    if getattr(registro, "active", None) is not True:
        raise CompatRefusal("PLATFORM_REGISTRATION_INACTIVE", PLATFORM_NAME)

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
