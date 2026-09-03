"""
A via de planejamento e AUTORIZAÇÃO de produção do Telegram. Em processo.

─── O problema que o §6 antecipou, e como ele foi resolvido ────────────────────

O achado do Codex é que o worker do planejador carrega o fixture. A correção óbvia
seria mandar a mensagem para ele — e é exatamente essa a armadilha: o worker é um
processo separado, e mandar a admissão por JSON transformaria a prova em campo
forjável. `{"authorized": true, "user_id": ...}` chegando pelo stdin é precisamente o
que a d1 e a d2b passaram sete rodadas fechando.

A saída não é assinar o JSON — é não atravessar fronteira nenhuma. O adaptador
governado roda DENTRO do processo do Hermes, e é lá que o objeto de ingresso existe.
O runtime de raciocínio também está importável lá: é o mesmo interpretador que o
worker PRECALL usa. Então o plano canônico é derivado no mesmo processo, a partir do
objeto em memória, e o que atravessa depois são apenas HASHES — dado para aprovar,
não autoridade.

Um hash que atravessa não é autoridade que atravessa. A d1 confere
`subject_content_hash == liveExecutionFingerprint(spec)` por conta própria; se alguém
adulterar um hash em trânsito, a aprovação não bate e a execução recusa.

─── O que a r4 fechou ──────────────────────────────────────────────────────────

A r3 construía o candidato e paravam aí três coisas:

  1. o texto de autorização era renderizado por uma função que aceitava QUALQUER
     `CanonicalLivePlanV1`. Como o construtor puro do TypeScript é exportado, existia
     uma composição de três passos — material arbitrário, construtor, renderizador —
     que produzia algo com a aparência do texto que Stefano assina, sem Telegram
     nenhum no caminho;

  2. o candidato guardava `read_model` e `plan` como `dict` vivos. Congelar o
     dataclass externo não congela o que está dentro dele: quem tivesse o candidato
     mudava `plan["model"]` e mudava o que seria exibido;

  3. `provenance_valid()` existia e ninguém a exigia. Um método que responde a uma
     pergunta que nada faz é documentação, não fronteira.

As três têm a mesma forma: eu havia construído a peça certa e não a tinha ligado.

─── O que continua sendo do worker ─────────────────────────────────────────────

`creditum_hermes_planner.worker` permanece como a via de EVIDÊNCIA, com o fixture
sintético. Ela não tem nada a ver com o Telegram, e é estruturalmente inalcançável
daqui: este módulo não importa `probe` nem chama `load_fixture`. Há teste.

─── O que este módulo NÃO faz ──────────────────────────────────────────────────

Não cria `DecisionRecord`, não emite nem consome capacidade viva, não reserva
livro-razão, não chama modelo, provedor ou rede, e não executa. Produzir um candidato
e RENDERIZAR seu texto não significa que Stefano aprovou: admissão de transporte e
aprovação humana são portões independentes, e continuam sendo dois. O texto é
exatamente o que ele pode aprovar depois — não a aprovação.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import weakref
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

from creditum_hermes_reasoning.contract import build_system_contract
from creditum_hermes_reasoning.plan import CanonicalPlanMaterial, build_canonical_plan_material
from creditum_hermes_reasoning.runtime import resolve_approved_runtime_binding
from creditum_hermes_reasoning.telegram_live import (
    admitted_from_governed_ingress,
    build_telegram_live_read_model,
    telegram_execution_id,
)

from .adapter import ADMISSION_EVIDENCE, verify_issued
from .compat import ADAPTER_COMPAT_ID, SUPPORTED_HERMES_VERSION
from .ingress import TELEGRAM_INGRESS_PROTOCOL, TELEGRAM_TRANSPORT, GovernedTelegramIngressV1

NODE_RUNTIME = "node_modules/.bin/tsx"
CANONICAL_PLAN_CLI = "gateway/src/canonical-plan-cli.ts"
PLAN_MATERIAL_PROTOCOL = "creditum_plan_material/1.0.0"
PLAN_RESULT_PROTOCOL = "creditum_canonical_live_plan_result/1.0.0"
PLAN_CLI_TIMEOUT_SECONDS = 60
CANDIDATE_VERSION = "creditum_production_telegram_candidate/1.0.0"

_HEX256 = re.compile(r"^[0-9a-f]{64}$")

#: Campos que atravessam. Conjunto FECHADO, e nenhum deles é autoridade.
CAMPOS_MATERIAL = (
    "execution_id", "read_model_fingerprint", "request_fingerprint",
    "runtime_binding_fingerprint", "request_hash", "user_payload_hash",
    "provider", "model", "api_mode", "sdk_version",
    "constitution_id", "constitution_version", "constitution_hash",
    "system_contract_id", "system_contract_version", "system_contract_hash",
    "runtime_id", "runtime_version", "response_policy_id", "response_policy_version",
    "tool_count", "stream", "operation",
)

OPERATION_REASONING_RESPONSE_ONLY = "REASONING_RESPONSE_ONLY"


class PlanningRefusal(Exception):
    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect


def _congela(valor: object) -> object:
    """
    Instantâneo PRÓPRIO e imutável até o fundo.

    ─── Por que não bastava o dataclass congelado ───────────────────────────────

    `@dataclass(frozen=True)` impede `candidato.plan = outro`. Não impede
    `candidato.plan["model"] = "outro-modelo"`, porque o `dict` lá dentro continua
    sendo o mesmo objeto vivo que veio do `json.loads`. Objeto externo congelado com
    dicionário mutável dentro não é imutável — é imutável na casca.

    O `dict` intermediário é construído AQUI e nunca sai daqui: o `MappingProxyType`
    é a única referência que escapa. Essa é a mesma disciplina da d2c — construir
    local, congelar no lugar, entregar só o congelado — e é o que faz o proxy valer
    algo, porque um proxy sobre um `dict` que o chamador ainda segura não protege nada.

    Tipo desconhecido é RECUSA. "Congelar o que eu reconheço e deixar passar o resto"
    seria a porta pela qual um objeto mutável entraria calado.
    """
    if type(valor) is dict:
        interno: dict[str, object] = {}
        for chave, item in valor.items():
            if type(chave) is not str:
                raise PlanningRefusal("MATERIAL_KEY_NOT_TEXT", type(chave).__name__)
            interno[chave] = _congela(item)
        return MappingProxyType(interno)
    if type(valor) in (list, tuple):
        return tuple(_congela(v) for v in valor)  # type: ignore[union-attr]
    if type(valor) in (str, bool, int, float, type(None)):
        return valor
    raise PlanningRefusal("MATERIAL_TYPE_UNSUPPORTED", type(valor).__name__)


def _conteudo(valor: object) -> object:
    """
    Estrutura comparável do conteúdo congelado, para o instantâneo de emissão.

    Tupla, e não digest. Um `sha256` aqui seria uma segunda verdade sobre os mesmos
    bytes — o defeito que esta fase inteira veio fechar — e não compraria nada:
    comparação exata de tupla não tem colisão para discutir. É também o que o
    adaptador já faz com o ingresso; reuso do mesmo mecanismo em vez de um segundo.
    """
    if isinstance(valor, Mapping):
        return tuple((c, _conteudo(valor[c])) for c in sorted(valor))
    if type(valor) is tuple:
        return tuple(_conteudo(v) for v in valor)
    return valor


def confere_plano_contra_material(plano: Mapping[str, Any], material: Any) -> None:
    """
    O plano devolvido pelo filho descreve ESTE material? Recusa se não.

    ─── Por que esta é pública, e o verificador de procedência não é ────────────

    A distinção que a r5 obrigou a nomear: esta função **só recusa**. Não há entrada
    que a faça conceder nada — no melhor caso ela retorna `None` e o chamador segue
    com o que já tinha. Um verificador de PROCEDÊNCIA é o contrário: ele responde
    "sim", e quem escolhe o verificador escolhe a resposta. Foi por isso que a r4 caiu.

    Então esta pode ser chamada por qualquer um, inclusive pelos testes com material
    adulterado — que é exatamente como se prova que os 23 campos são conferidos.

    ─── Os 23, e não uma amostra ────────────────────────────────────────────────

    A r3 conferia cinco, e os cinco eram os que eu tinha pensado em conferir.
    `provider` e `model` não estavam entre eles, e são justamente os dois que Stefano
    lê para saber o que vai rodar. Um filho que devolvesse outro modelo passava.
    """
    for campo in CAMPOS_MATERIAL:
        if plano.get(campo) != getattr(material, campo):
            raise PlanningRefusal("PLAN_RESULT_BINDING_MISMATCH", campo)

    # A relação da d1, conferida SEM reimplementar o hash: quem calcula
    # `liveExecutionFingerprint` é o TypeScript, e continua sendo só ele. O que se
    # confere aqui é que os dois campos são hexadecimais e são o MESMO valor —
    # exatamente o que a d1 vai exigir na hora de autorizar.
    impressao = plano.get("execution_fingerprint")
    if type(impressao) is not str or not _HEX256.match(impressao):
        raise PlanningRefusal("PLAN_FINGERPRINT_INVALID")
    if plano.get("subject_content_hash") != impressao:
        raise PlanningRefusal("PLAN_SUBJECT_BINDING_INVALID")


def _raiz_do_pacote() -> str:
    """A raiz do `intelligence/`, derivada do próprio arquivo. Sem caminho de chamador."""
    aqui = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(aqui))


# ═════════════════════════════════════════════════════════════════════════════
# A EMISSÃO DE CANDIDATO — e tudo o que depende dela, no mesmo escopo léxico
# ═════════════════════════════════════════════════════════════════════════════


def _liga_producao(verifica_ingresso: Any, node_runtime: str, plan_cli: str,
                   confere_plano_contra_material: Any) -> tuple[Any, ...]:
    """
    Liga a via de produção às suas dependências reais. Chamada UMA vez, no import.

    ─── O defeito que a r4 abriu, e que esta função deixa de ter ───────────────

    A r4 recebia o verificador do ingresso como parâmetro para que os testes
    pudessem desligá-lo e PROVAR que a procedência é exigida. O ponto de injeção que
    tornava a exigência testável era, ele mesmo, o furo:

        _, _, constroi, _, renderiza = planning._monta_producao(
            lambda _: True, planning.NODE_RUNTIME, planning.CANONICAL_PLAN_CLI)
        renderiza(constroi(ingresso_construido_a_mao))

    Três linhas, API pública de módulo, e saía o texto de autorização de produção com
    transporte "vinculado" a uma mensagem que nunca chegou pelo Telegram. Eu havia
    fechado a fronteira e deixado alcançável a fábrica que constrói fronteiras.

    O adaptador tem a mesma forma — `_monta_emissao()` é alcançável — e ali é
    inofensivo, porque ele NÃO recebe verificador: uma emissão nova nasce com registro
    vazio e a classe continua exigindo a autorização nativa. A diferença entre as duas
    era exatamente o parâmetro que eu acrescentei.

    A correção não é renomear. É esta função **deixar de existir** depois de ligar: o
    `del` no fim do módulo remove o nome, e o que sobra são as cinco callables com as
    dependências reais presas em célula. Não há mais fábrica para chamar, então não há
    mais o que escolher.

    Os caminhos do filho entram pelo mesmo motivo que o verificador. Lidos como global
    no momento da chamada, `planning.CANONICAL_PLAN_CLI = "/tmp/outro.ts"` redirecionaria
    o construtor "fixo". Ligados aqui, o atributo de módulo passa a ser documentação do
    que foi ligado, não o que executa.

    ─── O limite, dito em vez de encoberto ─────────────────────────────────────

    `__closure__` continua alcançando estas células. Isso é introspecção de
    interpretador, e o brief a põe fora do modelo de ameaça. Não afirmo mais.
    """
    #: id(candidato) → (referência fraca, digest do conteúdo emitido).
    #:
    #: Identidade, não valor — pelo mesmo motivo do adaptador: dois candidatos com os
    #: mesmos campos são iguais por `__eq__` e um deles pode não ter sido emitido.
    emitidos: dict[int, tuple[Any, object]] = {}

    def limpa_mortos() -> None:
        for chave in [k for k, (r, _) in emitidos.items() if r() is None]:
            emitidos.pop(chave, None)

    def instantaneo(c: Any) -> object:
        return _conteudo({
            "candidate_version": c.candidate_version,
            "execution_id": c.execution_id,
            "read_model": c.read_model,
            "plan": c.plan,
            "ingress": [
                c.ingress.protocol_version, c.ingress.transport,
                c.ingress.sender_user_id, c.ingress.destination_chat_id,
                c.ingress.destination_thread_id, c.ingress.message_id,
                c.ingress.update_id, c.ingress.text, c.ingress.telegram_timestamp,
                c.ingress.admission_evidence, c.ingress.hermes_version,
                c.ingress.adapter_compat_id, c.ingress.source_message_count,
            ],
        })

    def verifica_candidato(objeto: object) -> bool:
        """
        Este OBJETO EXATO foi emitido pela via de produção?

        Somente-leitura e pública: responder "sim/não" não cria autoridade. Quem cria
        é `registra`, e ele não tem nome alcançável.

        Identidade primeiro, conteúdo depois — a mesma ordem do adaptador. Um `id`
        reciclado falha no `is`; conteúdo que divergiu do emitido falha no instantâneo.
        """
        if type(objeto) is not ProductionTelegramCandidateV1:
            return False
        entrada = emitidos.get(id(objeto))
        if entrada is None:
            return False
        ref, guardado = entrada
        if ref() is not objeto:
            return False
        return instantaneo(objeto) == guardado

    @dataclass(frozen=True)
    class ProductionTelegramCandidateV1:
        """
        O candidato de produção. Emitido, congelado até o fundo, e reconferível.

        Construir esta classe à mão continua permitido e continua INÓCUO: a instância
        não estará no registro de emissão, e o renderizador de produção recusa. Forma
        de dado não é procedência — a r3 aprendeu isso no ingresso, e vale igual aqui.

        NÃO é aprovação de Stefano. Admissão de transporte e aprovação humana continuam
        sendo dois portões independentes, e este objeto só atravessou o primeiro.
        """

        candidate_version: str
        #: O ingresso EXATO que originou tudo, para reconferir a procedência.
        ingress: GovernedTelegramIngressV1
        #: Instantâneos próprios e imutáveis. Não são referências do chamador.
        read_model: Mapping[str, Any]
        plan: Mapping[str, Any]
        execution_id: str

        def provenance_valid(self) -> bool:
            """
            A procedência ainda vale? Reconferida nos DOIS elos, nunca presumida.

            O candidato tem de ter sido emitido por esta via, E o ingresso que o
            originou tem de continuar emitido pelo adaptador. Conferir só o segundo
            era o furo da r3: um candidato montado à mão em volta de um ingresso
            genuíno passava.
            """
            return verifica_ingresso(self.ingress) and verifica_candidato(self)

    def registra(c: Any) -> None:
        limpa_mortos()
        emitidos[id(c)] = (weakref.ref(c), instantaneo(c))

    # ─────────────────────────────────────────────────────────────────────────
    # ingresso admitido → material canônico
    # ─────────────────────────────────────────────────────────────────────────

    def valida_ingresso(ingresso: object) -> GovernedTelegramIngressV1:
        """
        O objeto tem de ter sido EMITIDO pelo fluxo nativo admitido.

        ─── O que a r2 errou aqui ───────────────────────────────────────────────

        Eu conferia `type(ingresso) is GovernedTelegramIngressV1` e chamava aquilo de
        prova de admissão. Não é: o construtor do dataclass é público, e
        `dataclasses.replace(real, text="FORJADO")` produz uma instância genuína com
        todos os marcadores que eu checava. Forma de dado não é procedência — eu tinha
        rejeitado o impostor de forma diferente e aceitado o impostor de forma idêntica.

        A pergunta certa não é "que classe é isto?", e sim "este OBJETO EXATO foi
        emitido pelo adaptador depois da admissão nativa?".

        O `type(...) is not` continua, mas como higiene de tipo, não como autoridade.
        """
        if type(ingresso) is not GovernedTelegramIngressV1:
            raise PlanningRefusal("INGRESS_NOT_OWNED", type(ingresso).__name__)
        # A CONFERÊNCIA QUE IMPORTA. Antes de qualquer derivação canônica.
        if not verifica_ingresso(ingresso):
            raise PlanningRefusal("INGRESS_NOT_ISSUED_BY_ADAPTER")
        if ingresso.protocol_version != TELEGRAM_INGRESS_PROTOCOL:
            raise PlanningRefusal("INGRESS_PROTOCOL_UNSUPPORTED", ingresso.protocol_version)
        if ingresso.transport != TELEGRAM_TRANSPORT:
            raise PlanningRefusal("INGRESS_TRANSPORT_INVALID", ingresso.transport)
        if ingresso.hermes_version != SUPPORTED_HERMES_VERSION:
            raise PlanningRefusal("INGRESS_HERMES_VERSION_UNSUPPORTED", ingresso.hermes_version)
        if ingresso.adapter_compat_id != ADAPTER_COMPAT_ID:
            raise PlanningRefusal("INGRESS_COMPAT_IDENTITY_UNSUPPORTED",
                                  ingresso.adapter_compat_id)
        if ingresso.source_message_count != 1:
            raise PlanningRefusal("INGRESS_NOT_SINGLE_MESSAGE",
                                  str(ingresso.source_message_count))
        # Evidência de admissão conferida por igualdade exata — mas como coerência,
        # não como autoridade: a autoridade já foi provada acima.
        if ingresso.admission_evidence != ADMISSION_EVIDENCE:
            raise PlanningRefusal("INGRESS_ADMISSION_EVIDENCE_INVALID")
        return ingresso

    def deriva(valido: GovernedTelegramIngressV1) -> tuple[dict[str, Any], CanonicalPlanMaterial]:
        read_model = build_telegram_live_read_model(admitted_from_governed_ingress(valido))
        # O identificador, derivado da identidade nativa imutável. Determinado uma vez
        # e estável: replanejar a mesma mensagem dá o mesmo id, e repetir bate no
        # `mkdir` atômico do livro-razão. Nada é reservado aqui.
        execution_id = telegram_execution_id(read_model)
        material = build_canonical_plan_material(
            execution_id=execution_id,
            contract=build_system_contract(),
            # Resolvedor de produção, SEM argumento de chamador. Um parâmetro de
            # vínculo aqui devolveria ao chamador a escolha do provedor e do endpoint.
            binding=resolve_approved_runtime_binding(),
            read_model=read_model,
        )
        return read_model, material

    def plan_from_admitted_ingress(
        ingresso: object,
    ) -> tuple[dict[str, Any], CanonicalPlanMaterial]:
        """
        A ÚNICA via de planejamento de produção do Telegram.

        Devolve o read model governado e o material canônico. Nenhum hash entra por
        parâmetro: eles são CALCULADOS, pelos produtores canônicos da a2. Não há
        segunda implementação de hash aqui — este módulo não hasheia material.

        Sem fixture, sem queda para valor padrão. Ingresso ausente, inválido, em lote,
        de outra versão ou sem evidência de admissão é RECUSA — nunca `load_fixture()`.
        """
        return deriva(valida_ingresso(ingresso))

    # ─────────────────────────────────────────────────────────────────────────
    # material canônico → plano REAL do TypeScript → candidato EMITIDO
    # ─────────────────────────────────────────────────────────────────────────

    def build_production_candidate(ingresso: object) -> Any:
        """
        A via de produção COMPLETA: mensagem admitida → candidato emitido.

        A ordem é a que importa:

          1. procedência da emissão do ingresso verificada NO PYTHON;
          2. material canônico derivado;
          3. só então o material — que não é autoridade — atravessa para o
             construtor FIXO do TypeScript;
          4. o plano devolvido é conferido campo a campo contra o material enviado;
          5. o candidato é congelado até o fundo e EMITIDO.

        Nada de autoridade é serializado: nem `authorized`, nem token, nem alça de
        registro, nem capacidade. Essas coisas ficam em célula, deste lado.
        """
        valido = valida_ingresso(ingresso)
        read_model, material = deriva(valido)

        doc: dict[str, Any] = {"protocol_version": PLAN_MATERIAL_PROTOCOL}
        for campo in CAMPOS_MATERIAL:
            doc[campo] = getattr(material, campo)

        raiz = _raiz_do_pacote()
        argv = [os.path.join(raiz, node_runtime), os.path.join(raiz, plan_cli)]
        if not os.path.isfile(argv[0]):
            raise PlanningRefusal("NODE_RUNTIME_UNAVAILABLE", argv[0])
        try:
            p = subprocess.run(argv, input=json.dumps(doc), capture_output=True, text=True,
                               timeout=PLAN_CLI_TIMEOUT_SECONDS, cwd=raiz)
        except Exception as causa:  # noqa: BLE001
            raise PlanningRefusal("PLAN_CLI_FAILED", type(causa).__name__) from None
        if p.returncode != 0:
            raise PlanningRefusal("PLAN_CLI_EXIT_NONZERO", str(p.returncode))

        linhas = [l for l in p.stdout.split("\n") if l.strip()]
        if len(linhas) != 1:
            raise PlanningRefusal("PLAN_RESULT_NOT_SINGLE_DOCUMENT")
        try:
            r = json.loads(linhas[0])
        except json.JSONDecodeError:
            raise PlanningRefusal("PLAN_RESULT_NOT_JSON") from None
        if r.get("protocol_version") != PLAN_RESULT_PROTOCOL:
            raise PlanningRefusal("PLAN_RESULT_VERSION_UNSUPPORTED")
        if r.get("outcome") != "PLAN_BUILT":
            raise PlanningRefusal("PLAN_REJECTED_BY_CONSTRUCTOR", str(r.get("defect"))[:64])

        plano = r.get("plan")
        if type(plano) is not dict:
            raise PlanningRefusal("PLAN_RESULT_MALFORMED")

        confere_plano_contra_material(plano, material)

        candidato = ProductionTelegramCandidateV1(
            candidate_version=CANDIDATE_VERSION,
            ingress=valido,
            read_model=_congela(read_model),  # type: ignore[arg-type]
            plan=_congela(plano),  # type: ignore[arg-type]
            execution_id=material.execution_id,
        )
        registra(candidato)
        return candidato

    # ─────────────────────────────────────────────────────────────────────────
    # candidato EMITIDO → o texto exato que Stefano pode aprovar
    # ─────────────────────────────────────────────────────────────────────────

    def render_production_telegram_authorization(candidato: object) -> str:
        """
        O texto de autorização de PRODUÇÃO. Exige candidato emitido e procedente.

        ─── O que ele recusa, e por quê ─────────────────────────────────────────

        Não existe sobrecarga: um `CanonicalLivePlanV1`, um material canônico, um JSON
        qualquer ou um candidato montado à mão não têm por onde entrar aqui. A r3
        deixava o caminho aberto porque o renderizador aceitava o plano, e o plano é
        construível a partir de material arbitrário. Um plano válido descreve uma
        execução possível; ele não diz nada sobre uma mensagem ter sido admitida.

        Determinístico: o mesmo candidato dá o mesmo texto. E ele NÃO é aprovação — é
        exatamente o que Stefano pode aprovar depois, num portão separado.
        """
        if type(candidato) is not ProductionTelegramCandidateV1:
            raise PlanningRefusal("CANDIDATE_NOT_OWNED", type(candidato).__name__)
        # Os dois portões, nesta ordem — e a ordem existe para que cada um seja
        # OBSERVÁVEL sozinho. O instantâneo do candidato inclui o conteúdo do
        # ingresso, então qualquer alteração no ingresso quebraria os dois ao mesmo
        # tempo; conferindo o ingresso primeiro, o defeito nomeia o elo que falhou.
        # A r4 conferia na ordem inversa e o portão do ingresso era inalcançável na
        # prática — defesa em profundidade que nenhum teste podia demonstrar.
        if not verifica_ingresso(candidato.ingress):
            raise PlanningRefusal("CANDIDATE_PROVENANCE_INVALID")
        if not verifica_candidato(candidato):
            raise PlanningRefusal("CANDIDATE_NOT_ISSUED")

        p = candidato.plan
        i = candidato.ingress

        def campo(nome: str) -> Any:
            if nome not in p:
                raise PlanningRefusal("PLAN_FIELD_MISSING", nome)
            return p[nome]

        def l(rotulo: str, valor: Any) -> str:
            texto = "—" if valor is None else str(valor).lower() if type(valor) is bool \
                else str(valor)
            return f"  {rotulo:<28}{texto}"

        return "\n".join([
            "AUTORIZAÇÃO DE EXECUÇÃO VIVA — PRODUÇÃO TELEGRAM",
            "",
            "  Uma mensagem. Uma execução. Uma tentativa. Sem retomada.",
            "",
            "IDENTIDADE",
            l("execution_id", campo("execution_id")),
            l("subject_content_hash", campo("subject_content_hash")),
            l("execution_fingerprint", campo("execution_fingerprint")),
            l("request_hash", campo("request_hash")),
            l("user_payload_hash", campo("user_payload_hash")),
            "",
            "PRECURSORES",
            l("read_model_fingerprint", campo("read_model_fingerprint")),
            l("request_fingerprint", campo("request_fingerprint")),
            l("runtime_binding_fingerprint", campo("runtime_binding_fingerprint")),
            "",
            "RUNTIME",
            l("provider", campo("provider")),
            l("model", campo("model")),
            l("api_mode", campo("api_mode")),
            l("sdk_version", campo("sdk_version")),
            l("constitution", f'{campo("constitution_id")} {campo("constitution_version")}'),
            l("system_contract",
              f'{campo("system_contract_id")} {campo("system_contract_version")}'),
            l("response_policy",
              f'{campo("response_policy_id")} {campo("response_policy_version")}'),
            "",
            "CONTROLES",
            l("tools", campo("tool_count")),
            l("max_retries", campo("max_retries")),
            l("stream", campo("stream")),
            l("background", campo("background")),
            l("attempt_deadline_seconds", campo("attempt_deadline_seconds")),
            l("authorization_ttl_seconds", campo("authorization_ttl_seconds")),
            "",
            "TRANSPORTE",
            l("transport", i.transport),
            l("sender_user_id", i.sender_user_id),
            l("destination_chat_id", i.destination_chat_id),
            l("destination_thread_id", i.destination_thread_id),
            l("message_id", i.message_id),
            l("update_id", i.update_id),
            l("telegram_timestamp", i.telegram_timestamp),
            l("source_message_count", i.source_message_count),
            "",
            "TEXTO ADMITIDO",
            *[f"  {linha}" for linha in i.text.split("\n")],
            "",
            "ESCOPO",
            l("operation", campo("operation")),
            "",
            "  Este texto NÃO é aprovação. É exatamente o que será aprovado, se for.",
        ])

    return (ProductionTelegramCandidateV1, plan_from_admitted_ingress,
            build_production_candidate, verifica_candidato,
            render_production_telegram_authorization)


#: A via de produção inteira. O estado que liga estas peças NÃO tem nome de módulo, e
#: o verificador do ingresso foi ligado no import — não no momento da chamada.
(
    ProductionTelegramCandidateV1,
    plan_from_admitted_ingress,
    build_production_candidate,
    verify_candidate_issued,
    render_production_telegram_authorization,
) = _liga_producao(verify_issued, NODE_RUNTIME, CANONICAL_PLAN_CLI,
                    confere_plano_contra_material)

#: A fábrica CUMPRIU seu papel e sai do namespace. Não é higiene de nome — é a
#: correção da r5: enquanto `_liga_producao` fosse alcançável, um chamador montaria
#: um domínio de produção paralelo com o verificador que ele escolhesse.
del _liga_producao
