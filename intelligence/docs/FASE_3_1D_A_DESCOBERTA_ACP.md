# Fase 3.1d-a — descoberta ACP em produção

```
ORIGEM              ChatGPT Work · Hostinger · somente leitura
HERMES              0.20.4 (2026.8.18)
ACP                 agent-client-protocol 0.9.0
PYTHON              3.13.15 · /opt/venv/bin/python3
HERMES_HOME         /data
CHAMADAS DE MODELO  0 · PROMPTS 0 · DADOS DA CREDITUM nenhum
AMBIENTE            não alterado · config, tools, gateway, segredos intactos
ESTRATÉGIA          C — ACP mínimo, propriedade da Creditum
```

Ressalva de medição registrada como veio: `NETWORK CALLS: 0 expected` significa que
nenhum comando executado iniciou comunicação de rede — **não** houve captura de pacotes
para medição independente.

## 1. A API que a descoberta fixou

```
acp_adapter.session.SessionManager           __init__(self, agent_factory=None, db=None)
SessionManager._make_agent                   keyword-only: session_id, cwd, model,
                                             requested_provider, base_url, api_mode
acp_adapter.server.HermesACPAgent            new_session · prompt · cancel
                                             load_session · resume_session · fork_session
run_agent.AIAgent.run_conversation           SÍNCRONO, rodado em ThreadPoolExecutor
acp.run_agent(agent, use_unstable_protocol)  loop stdio/JSON-RPC oficial
```

`SessionManager.__init__` é inerte: cria dicionário, lock e duas referências. Não
instancia agente, não abre banco, não registra MCP, não sobe thread, não chama rede. O
banco é lazy em `_get_db()` → `/data/state.db`.

## 2. A estratégia B está MORTA — e eu a tinha recomendado

Na 3.1b eu documentei estratégia **C para aquela fase, com B como alvo declarado** para
a 3.1c/3.1d. A descoberta mostra que B não é viável, e a razão é específica:

```python
self._agent_factory()      # chamado SEM argumento nenhum
```

A fábrica injetável não recebe `session_id`, `cwd`, `model` nem `provider`. Uma fábrica
da Creditum não teria como construir o agente daquela sessão — ela não sabe qual sessão
é.

E mesmo resolvido isso, `HermesACPAgent.new_session()` continua executando:

```python
await self._register_session_mcp_servers(state, mcp_servers)
self._schedule_mcp_late_refresh(state)
```

O late refresh reexecuta:

```python
_expand_acp_enabled_toolsets(getattr(agent, "enabled_toolsets", None) or ["hermes-acp"], ...)
agent.tools = get_tool_definitions(...)
```

**`[]` volta a ser `["hermes-acp"]` depois da construção.** O defeito não está no
`SessionManager` — está no *servidor*. Sobrescrever `_make_agent` (estratégia A) não
alcança.

Correção do registro: **B era a recomendação errada, por uma razão que só a observação
podia mostrar.** C não é o caminho de menor esforço; é o único que elimina o expansor
por construção.

## 3. O último ponto seguro de recheca não é onde eu o coloquei

A ponte 3.1b reconfere a superfície antes de **cada `session/prompt`**. Necessário, e
**não suficiente**:

```
run_conversation()
  → _perform_api_call(next_api_kwargs)
      → run_llm_execution_middleware(...)
          → _interruptible_api_call()  |  _interruptible_streaming_api_call()   ← ÚLTIMO PONTO
```

Entre o portão do prompt e a chamada real existe middleware. A garantia final tem de
conferir **as duas coisas**, juntas:

```python
len(agent.tools or []) == 0
not next_api_kwargs.get("tools")
```

A primeira é o estado do agente; a segunda é o **payload que sai**. Conferir só a
primeira afirmaria sobre o agente, não sobre a requisição.

Para alcançar esse ponto sem editar o fornecedor, a 3.1d terá de envolver dois métodos
privados: `_interruptible_api_call` e `_interruptible_streaming_api_call`.

## 4. Chamadas de modelo AUXILIARES que eu não conhecia

Dois defaults do construtor podem produzir chamadas que ninguém pediu:

```
session_db=<db>              → primeiro turno pode disparar auto-title
skip_background_review=False → finalizador pode iniciar review de memória/skills
```

O auto-title é excluído automaticamente só para as plataformas `cron` e `subagent` — e
a nossa é `acp`.

Consequência direta: **`MODEL CALLS: 0` não é uma propriedade do "não chamar o modelo".**
É uma propriedade de `session_db=None` e `skip_background_review=True`. Sem os dois, uma
execução que nunca pede raciocínio ainda pode gastar token.

## 5. A superfície zero sobrevive aos caminhos de injeção — menos um

```
construção do agente      get_tool_definitions(enabled_toolsets=[])        → 0
memory provider           tem gating por enabled_toolsets; [] não autoriza  → 0
context engine            exige `is None` ou "context_engine" na lista      → 0
tool_search assembly      observado zero com []                             → 0
ACP stock / MCP late      `[] or ["hermes-acp"]`                            → ESCAPA
```

Reconfirmado no processo real: `enabled_toolsets=[]` → 0 · `None` → 20.

O único escape é o do stock. É exatamente o que a estratégia C remove por construção.

## 6. Sessão limpa é possível — com uma ressalva honesta

```python
enabled_toolsets=[]          disabled_toolsets=None
skip_context_files=True      load_soul_identity=False
skip_memory=True             skip_background_review=True
session_db=None              conversation_history=[]
```

Mais: UUID novo por `session/new`, sem `SessionManager` stock, sem
`_register_session_mcp_servers`, sem `acp_adapter.entry` (ele sobe descoberta MCP global
numa daemon thread **antes** de `acp.run_agent()`), `mcp_servers` recusado, sem
load/resume/fork, sem callbacks de streaming antes da validação.

**A ressalva:** mesmo com todos esses flags, o construtor de system prompt do Hermes
ainda inclui identidade e help internos. Não existe parâmetro público observado que
produza um system prompt *somente constituição*. Ver §8 — é a única decisão que não é
minha.

## 7. Onde a constituição entra

```
ephemeral_system_prompt   constituição + contrato de saída   acrescentado NA CHAMADA
user_message              o HermesReadModel                  payload
system_message            None                               evita duplicação
```

`ephemeral_system_prompt` é concatenado no momento da API:

```python
effective_system = (active_system_prompt + "\n\n" + agent.ephemeral_system_prompt).strip()
```

Nunca misturar o payload de negócio com as instruções de sistema. `system_message=`
entraria no prompt cacheável da sessão — não é onde a constituição deve morar.

## 8. A tensão que precisa de arbitragem

A ordem real de montagem do system prompt, com os flags de sessão limpa, é:

```
1  DEFAULT_AGENT_IDENTITY        (SOUL.md bloqueado, mas a identidade padrão fica)
2  HERMES_AGENT_HELP_GUIDANCE
3  orientações de modelo/execução
4  environment hints
5  …
N  ephemeral_system_prompt       ← a constituição da Creditum, POR ÚLTIMO
```

A constituição foi escrita e **congelada com hash** partindo de uma premissa que a
observação desmente: que ela seria o contexto de sistema. Na prática ela **coexiste**
com uma identidade anterior, e chega depois dela.

Isso não é um defeito de implementação que eu possa corrigir. São três caminhos, e a
escolha é do arquiteto:

```
A  aceitar a coexistência             constituição 1.0.0 intacta, hash intacto
B  afirmar precedência no texto       constituição 1.0.1+ · HASH NOVO · re-aprovação
C  achar rota que suprima o default   exige descoberta adicional; pode não existir
```

`38a38edc…1b79` acabou de ser congelado por gate adversarial. Mudar um byte é uma
constituição nova, e isso não acontece por efeito colateral de uma fase de transporte.

## 9. Outros itens que a 3.1d tem de tratar

```
response_transformed=True   o stock pode reescrever `final_response` por hook
áudio                       ACP aceita; o conversor stock não trata — aceitar só texto
erro interno stock          vira {"final_response": "Error: …"} — não serve ao fail-closed
session/update              texto vai em AgentMessageChunk; PromptResponse não o carrega
                            → acumular, validar, e emitir UMA mensagem validada
load/resume/fork/list       EXISTEM na 0.20.4; não anunciar nenhum
cancelamento                cancel_event + request_hard_interrupt; a ponte mantém
                            trava/`is_running` própria e impede reuso concorrente
```

Sobre `session/load`: a ponte 3.1b o atende e o coloca sob o portão. Como a Creditum não
usa o banco stock, não há o que carregar — a 3.1d deve **removê-lo** do vocabulário em
vez de guardá-lo. Nada disso é alcançável hoje, porque `session/prompt` recusa com
`REASONING_CONTRACT_NOT_INSTALLED`.

## 10. Não observado, e dito como tal

```
plugins ativos e seus hooks de prompt/output       não enumerados
provider/api_mode efetivo                         não impresso (runtime sensível)
ordem temporal real de cancelamento vs. rede      não testada
streaming real por provider                       não executado
NETWORK CALLS por telemetria externa              sem captura de pacotes
chamada de modelo                                 deliberadamente não feita
```

## 11. Estado

```
API NECESSÁRIA DESCOBERTA          SIM
PRONTO PARA IMPLEMENTAR A 3.1D     SIM — falta o briefing
PRONTO PARA A 1ª CHAMADA SINTÉTICA NÃO — 13 bloqueadores, um deles é decisão sua (§8)
```
