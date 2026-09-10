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
from typing import Any, Deque

#: Limite do coletor. Sem limite, uma rajada de mensagens cresceria sem fim dentro do
#: processo do gateway; com limite, a mais antiga sai e o processo segue previsível.
COLETOR_MAX = 256


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


def register(ctx: Any) -> type:
    """
    O ponto de entrada que o Hermes 0.20.4 chama. Síncrono, como o contrato exige.

    Delega para a a4, que prova a compatibilidade do adaptador nativo ANTES de
    registrar — registrar e conferir depois deixaria uma janela em que o adaptador
    governado já está no lugar sem prova.
    """
    from creditum_hermes_telegram.adapter import register as register_governado

    return register_governado(ctx, _sumidouro)
