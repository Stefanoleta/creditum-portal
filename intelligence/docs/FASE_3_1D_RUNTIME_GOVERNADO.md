# Fase 3.1d — o runtime de raciocínio governado da Creditum

```
ESTRATÉGIA              C — ACP mínimo, propriedade da Creditum
RUNTIME                 creditum_hermes_reasoning_runtime/v1 · 1.0.0
CONSTITUIÇÃO            creditum_hermes_constitution/v1 · 1.0.0 · 38a38edc…1b79  INTACTA
CONTRATO DE SISTEMA     creditum_hermes_reasoning_system/v1 · 1.0.0 · a315e9ec…84de
OVERRIDES PRIVADOS      3
MODO PADRÃO             PRECALL_PROBE
CHAMADAS DE MODELO      0 · REDE 0 · DADOS DA CREDITUM nenhum
TESTES                  144 Python · 103 adapter · 18 mutações
```

## 1. As duas descobertas que definiram a fase

**3.1d-a** mapeou o ACP de produção. **3.1d-a2** mapeou a supressão de contexto de
sistema. As duas foram feitas pelo Work, somente leitura, sem alterar nada.

Três achados mudaram decisões:

### A estratégia B estava morta — e eu a tinha recomendado

Na 3.1b documentei "C para esta fase, **B como alvo declarado**". Errado:

```python
self._agent_factory()      # chamado SEM argumento nenhum
```

A fábrica injetável não recebe `session_id`, `cwd`, `model` nem `provider` — ela não
sabe qual sessão está construindo. E o **servidor** de fábrica, não o `SessionManager`,
continua rodando `_schedule_mcp_late_refresh`, que reexecuta `[] or ["hermes-acp"]`
**depois** da construção.

O defeito nunca esteve onde a estratégia A miraria. C não é o caminho de menor esforço:
é o único que elimina o expansor por construção.

### O portão por prompt da 3.1b é necessário e NÃO suficiente

```
prompt → _perform_api_call → middleware → _interruptible_*   ← último ponto
```

Entre o portão do prompt e a rede existem `llm_request`, `pre_api_request` e
`llm_execution`. A garantia final confere **as duas coisas juntas**: o estado do agente
(`len(agent.tools) == 0`) e o **payload que sai** (`not api_kwargs["tools"]`). Conferir
só a primeira afirma sobre o agente, não sobre a requisição.

### Chamadas de MODELO auxiliares

```
session_db=<db>              → 1º turno pode disparar auto-title
skip_background_review=False → finalizador pode iniciar review de memória/skills
```

O auto-title é excluído só para `cron` e `subagent`; a nossa plataforma é `acp`.

**`MODEL CALLS: 0` não é propriedade de "não pedir raciocínio"** — é propriedade de
`session_db=None` e `skip_background_review=True`. Sem os dois, uma execução que nunca
pergunta nada ainda gasta token.

## 2. A tensão constitucional, e como foi resolvida

A constituição foi congelada partindo de uma premissa que a observação desmentiu: que
ela seria o contexto de sistema. Na prática o Hermes monta, nesta ordem:

```
1  DEFAULT_AGENT_IDENTITY        SOUL bloqueado, mas o fallback stock fica
2  HERMES_AGENT_HELP_GUIDANCE
…
N  ephemeral_system_prompt       a constituição, POR ÚLTIMO
```

Três caminhos existiam. Stefano decidiu: **nenhuma coexistência, e a constituição não
muda para declarar precedência.** Sobrou a rota C — suprimir o default.

A 3.1d-a2 encontrou o ponto: `_build_system_prompt()` é chamado por **despacho
virtual**, então uma subclasse o substitui sem tocar `/opt`.

```
Não basta CONTER a constituição.
Não basta ela vir POR ÚLTIMO.
Não basta instruir "ignore o que vem acima".

O conteúdo final é EXATAMENTE o contrato Creditum. Igualdade, não inclusão.
```

Um teste afirma as quatro variantes tentadoras — stock+constituição, constituição+extra,
"ignore tudo acima"+constituição, e a constituição com uma frase trocada — e todas são
recusadas com `SYSTEM_CONTRACT_MISMATCH`.

## 3. A autoridade da constituição mora no TypeScript

O runtime é Python; a constituição é TypeScript, congelada e com hash aprovado.

Duplicar o texto criaria duas fontes da mesma verdade, e a que valeria seria a que
ninguém olhou. Então:

```
constitution.ts          AUTORIDADE — define e congela
constitution.v1.txt      bytes exportados dela
contract.py              CONSUMIDOR — recalcula o hash e falha fechado
```

A paridade foi **medida**, não suposta: `json.dumps(ensure_ascii=False,
separators=(",",":"))` reproduz `JSON.stringify` exatamente, e Python chega ao mesmo
`38a38edc…1b79`. Um byte de deriva no arquivo derruba a construção com
`CONSTITUTION_DRIFT`.

O contrato de sistema tem hash em **domínio próprio** — ele compromete com outro
conteúdo. E o rodapé dele **não repete** a §17 da constituição: só nomeia a versão em
vigor. Repetir a regra de formato criaria duas redações da mesma coisa, e a divergência
futura entre elas seria invisível até um modelo obedecer à errada.

## 4. Três overrides, e nenhum a mais

```python
class CreditumAIAgent(AIAgent):
    _build_system_prompt(self, system_message=None)
    _interruptible_api_call(self, api_kwargs)
    _interruptible_streaming_api_call(self, api_kwargs, *, on_first_delta=None)
```

**Sem monkey patch, sem alteração de módulo, sem edição de `/opt`, sem troca de
constante global.** Só herança.

`_build_system_prompt` também escreve `_cached_system_prompt_static` com os mesmos
bytes. A razão é específica: a 3.1d-a2 observou `reconstruct_static_prefix()` chamando o
builder de fábrica **diretamente, sem despacho virtual**. Preencher o cache remove a
razão de reconstruir. Um teste prova que, antes do override, aquela rota devolve texto
de fábrica; depois, devolve o contrato.

E `system_message` não vazio é **recusa**, não silêncio: ignorá-lo deixaria um chamador
achar que configurou algo.

## 5. Por que uma fábrica em vez de uma classe

`run_agent.AIAgent` só existe na Hostinger. Definir a subclasse no import quebraria o
módulo em qualquer outra máquina — inclusive na que escreve os testes.

`make_creditum_agent_class(base)` recebe a base. Em produção é `run_agent.AIAgent`; nos
testes é uma base falsa com a superfície **observada**. O que é falso nos testes é a
base; a lógica de governança é a real.

## 6. O portão VERIFICA — não conserta

```
divergência de system    → aborta
mensagem estranha        → aborta
tools que saem           → aborta
modelo/provider trocado  → aborta
```

Nunca reescreve o system para o aprovado, nunca remove mensagem, nunca zera tools e
segue. Consertar em silêncio produziria um request governado a partir de um pipeline que
não estava governado — e a prova passaria a ser sobre o conserto.

Um teste afirma que o `api_kwargs` sai do portão **byte a byte igual** ao que entrou.

### O request também não pode executar código

```python
if type(valor) in _ESCALARES: ...     # `type() is`, não `isinstance`
```

Uma subclasse de `dict` com `__getitem__` sobrescrito, ou uma classe com `@property`,
pode devolver um valor para o portão e outro para o transporte — que lê **depois** de
nós. É o mesmo TOCTOU que a 3.0c fecha no TypeScript, na forma que Python permite.
`isinstance` aceitaria a subclasse; `type() is` não.

## 7. Middleware: recusa, não confiança

Cinco pontos de mutação foram observados: `pre_llm_call`, `llm_request`,
`pre_api_request`, `llm_execution`, `transform_llm_output`.

O `llm_execution` é o mais grave — ele pode **substituir ou nem chamar** o downstream.
Nenhuma verificação posterior alcança isso; a recusa tem de ser antes.

Política: **allowlist vazia**. E o inspetor é injetável porque a 3.1d-a descreveu os
cinco hooks e **não capturou a API de registro deles**. Sem inspetor, a política é
recusa — não se prova ausência presumindo-a.

Defesa em profundidade: mesmo que o inspetor diga que não há hook, a igualdade final
pega a mutação. Um teste injeta autoridade extra em `pre_api_request` por referência e o
portão a detecta.

## 8. `response_transformed` é recusa

`transform_llm_output` pode **substituir** `final_response`. Validar o texto
transformado seria validar a saída de um plugin e chamá-la de saída do modelo. Não
existe caminho que aceite isso com aviso.

## 9. A sonda usa o caminho VIVO

`PRECALL_PROBE` percorre `AIAgent`, construção do request, shaping do provider e
middleware — e **para** no último ponto, com todos os portões conferidos.

Não é um request paralelo falso. É o mesmo caminho, interrompido no fim.

```
sucesso da sonda   PrecallProbeComplete   tipo PRÓPRIO, não subclasse de recusa
chamadas ao provider   0
```

O tipo separado importa: quem captura precisa distinguir "passou e paramos" de "falhou".

Provado localmente com um Hermes falso, em quatro cenários:

| cenário | veredito | chamadas ao provider |
| --- | --- | --- |
| caminho normal | `PRECALL_PROBE_COMPLETE` | 0 |
| streaming | `PRECALL_PROBE_COMPLETE` | 0 |
| middleware injeta system extra | `DUPLICATE_SYSTEM_AUTHORITY` | 0 |
| `llm_execution` registrado | `UNAUTHORIZED_MIDDLEWARE` | 0 |

## 10. Sessão de uso único

Sem `SessionManager` de fábrica, sem `SessionDB`, sem restauração, sem fork.

```
NEW → RUNNING     única transição elegível a prompt
segundo prompt    RECUSA, inclusive depois de sucesso
cwd               /data canônico, resolvido antes de comparar
MCP               qualquer pedido não-vazio é recusa
conteúdo          SOMENTE um TextContentBlock
load/resume/fork/list   fora do vocabulário
```

A 3.1d-a observou que o fluxo de fábrica persiste em `state.db` e que `get_session()`
pode **restaurar** sessão conhecida daquele banco. Uso único remove a pergunta: não há
segundo turno, não há o que restaurar.

## 11. A lacuna da 3.1c foi FECHADA

A 3.1c deixou nomeado e aberto: o validador referencial existia e **não estava ligado**
ao caminho vivo do adapter. Agora está.

```
insights validados por schema
    ↓
validateInsightsAgainstReadModel(read_model, insights)   ← MESMO artefato do passo 2
    ↓
REFERENTIAL_VALIDATION_FAILED se qualquer ref não resolver
```

Estado **próprio**, e não `OUTPUT_NOT_VALIDATED`: o objeto satisfaz o schema; o que falha
é a integridade referencial. Colapsar os dois mandaria quem investiga procurar erro de
forma onde houve invenção de lastro.

**Três testes que passavam pararam de passar** quando eu liguei isso — os fixtures
citavam `ev_1`, que o read model real nunca autorizou. Era exatamente a lacuna. Os
fixtures de sucesso agora citam uma ref que o read model **de fato** autoriza.

E a janela do `await` é real: `transport.probe()` e `transport.send()` devolvem o
controle ao laço de eventos **entre** a captura e a validação. Um teste muta o array do
chamador dentro do `send()` e prova que não vale — a autoridade é a do instantâneo
capturado na entrada.

## 12. Mutações

**Python — 15 executadas, 15 mortas:**

| | |
| --- | --- |
| portão de igualdade do system removido | ✗ mata 3 |
| igualdade vira substring | ✗ mata 2 |
| tools que saem não conferidas | ✗ mata 2 |
| `agent.tools` não conferido | ✗ mata 1 |
| middleware não autorizado aceito | ✗ mata 1 |
| mensagem extra aceita | ✗ mata 2 |
| payload de usuário não conferido | ✗ mata 1 |
| `response_transformed` aceito | ✗ mata 1 |
| a sonda chama o pai | ✗ mata 1 |
| `session_db` habilitado | ✗ mata 2 |
| background review habilitado | ✗ mata 1 |
| fallback model habilitado | ✗ mata 1 |
| inspetor ausente tolerado | ✗ mata 1 |
| deriva de constituição tolerada | ✗ mata 1 *(após corrigir o teste)* |
| request não-simples aceito | ✗ mata 1 *(após corrigir o teste)* |

**TypeScript — 3 executadas, 2 mortas, 1 equivalente:**

| | |
| --- | --- |
| validação referencial removida | ✗ mata 3 |
| referencial vira `OUTPUT_NOT_VALIDATED` | ✗ mata 3 |
| valida contra outro read model | **equivalente** |

### Duas sobreviventes que eram testes meus fracos

**Deriva de constituição** sobreviveu porque meu teste media a **aritmética** do hash, não
o **portão**: o arquivo em disco está correto, então a conferência nunca disparava.
Acrescentei um teste que adultera os bytes de verdade num arquivo temporário.

**Request não-simples** sobreviveu porque a conferência de topo (`type(api_kwargs) is
dict`) pegava a subclasse antes de `assert_plain` ser alcançada. O caso que separa as
duas defesas é o objeto exótico **aninhado**. Sexta vez nesta arca que a defesa mais
externa mascara a interna.

### A equivalente, e por quê

`envelope["read_model"]` e `read_model` derivam do **mesmo** `snapshotPlainData(request)`
do passo 1 — cópia profunda independente, conteúdo idêntico por construção. Não há
janela entre eles. É uma propriedade da 3.0c, não coincidência.

## 13. O que permanece congelado

```
5 arquivos Python provados da 3.1b   INALTERADOS (SHA-256 conferido)
constituição 1.0.0                   38a38edc…1b79, conferida em runtime
schemas canônicos                    zero arquivos em contracts/ tocados
pinos 0.20.4 / 0.9.0 / 1.1.0         intactos
```

## 14. Bloqueadores para a primeira chamada sintética

```
1  API de registro de hooks não observada → sem inspetor, a sonda RECUSA
2  provider / model / api_mode efetivos não observados (runtime sensível)
3  a sonda de produção 3.1d-c ainda não rodou
```

O primeiro é o que importa: a política de middleware é allowlist vazia, e provar que a
lista está vazia exige enumerar o registro. Sem isso a sonda falha fechada — corretamente,
e sem avançar.

`LIVE_SYNTHETIC` existe no código e **não foi executado**. O padrão é `PRECALL_PROBE`, e
não há booleano de chamador que troque um pelo outro.

## 15. Remediação 3.1d-b-r1 — autoridade de execução e vínculo de runtime

Histórico do gate, sem reescrita:

```
3.1d-b gate 1   BLOCK · 3 HIGH
  HIGH 1        a STRING "LIVE_SYNTHETIC" era a autorização
  HIGH 2        runtime_kwargs deixava o chamador escolher runtime e credencial
  HIGH 3        HERMES_HOME DEFINIA o cwd governado
r1              autoridade pública de LIVE removida · vínculo aprovado · /data fixo
```

Os três procediam. Todos eram defeitos de **autoridade de execução**, não do contrato
cognitivo — a constituição e o contrato de sistema não mudaram um byte.

### 15.1. HIGH 1 — um nome não é uma permissão

```python
GovernedExecution(mode="LIVE_SYNTHETIC")   # bastava
```

O campo `mode` saiu. O modo agora é **derivado**: existe uma capacidade válida, ou não
existe.

```
LiveExecutionAuthorization   construtor exige o sentinela do emissor
emissor de produção          NÃO EXISTE
```

Nenhuma função pública deste pacote devolve uma. A CLI não cria. O construtor não
aceita. **LIVE é inalcançável pela API pública nesta fase** — e essa é a decisão, não
uma limitação. O emissor será ligado depois da prova PRECALL em produção e de uma
decisão arquitetural explícita.

Um objeto forjado com o mesmo campo é recusado: a validação é por **identidade** do
sentinela, não por forma.

**O modelo de ameaça, dito com precisão.** A fronteira é a **API pública**. Isto não é
defesa criptográfica contra código arbitrário no mesmo processo: quem pode importar um
módulo privado pode chamá-lo. Dizer o contrário venderia uma garantia que a linguagem
não dá.

### 15.2. HIGH 2 — consistência não é procedência

`runtime_kwargs: dict` deixava o chamador escolher provider, modelo, `base_url` e
credencial — e depois escolher a expectativa que combinava com a própria escolha. O
portão provava que dois valores do chamador eram iguais.

```
ANTES   runtime_kwargs.provider = X  ·  expectativa.provider = X     duas fontes
DEPOIS  ApprovedRuntimeBinding X ─┬─ constrói o agente               UMA
                                  └─ é a expectativa do portão
```

O `ApprovedRuntimeBinding` é criável **somente pelo resolvedor**. Identidade segura
(provider, modelo, api_mode) e material de execução (credencial, `base_url`, comando)
ficam separados: a primeira entra em relatório e auditoria; o segundo **nunca sai** —
nem em `repr`, nem em erro, nem em log. Misturar os dois faria o dia em que alguém
imprimisse o vínculo para depurar ser o dia do vazamento.

**Não existe mais slot de kwarg de chamador.** A lista de campos proibidos saiu junto:
uma lista que nada aplica documenta uma defesa que não existe.

**E o resolvedor de produção recusa hoje**, de propósito: `provider`, `model` e
`api_mode` efetivos não foram observados. Inventar um valor faria o portão comparar
contra um palpite e chamar isso de identidade aprovada.

### 15.3. HIGH 3 — observação não define governança

```
ANTES   esperado = HERMES_HOME        →  HERMES_HOME=/tmp/x + cwd=/tmp/x passava
DEPOIS  APPROVED_HERMES_HOME = "/data"   constante governada
```

`HERMES_HOME` virou uma **observação que tem de bater** com a constante. E as duas
conferências são independentes:

```
realpath(HERMES_HOME) == /data     E     realpath(cwd) == /data
```

`cwd == HERMES_HOME` não basta — era exatamente a equivalência que deixava o ambiente
escolher a regra. Ausência de `HERMES_HOME` é recusa, não convite: a falta de uma
observação nunca autoriza confiar em outra coisa no lugar dela.

Resolução canônica antes de comparar: `/data/../tmp`, caminho relativo e symlink para
fora são recusados.

### 15.4. Mutações — 11 executadas, 11 mortas

| | |
| --- | --- |
| A capacidade LIVE não é conferida | ✗ mata 7 |
| B a string volta a autorizar | ✗ mata 2 |
| B2 validador aceita forma em vez de identidade | ✗ mata 1 |
| C vínculo forjado é aceito | ✗ mata 1 |
| D builder aceita vínculo de qualquer tipo | ✗ mata 2 |
| E material de execução aparece no `repr` | ✗ mata 1 |
| F portão compara contra campo paralelo | ✗ mata 2 |
| G cwd derivado do `HERMES_HOME` | ✗ mata 2 |
| H conferência de `HERMES_HOME` removida | ✗ mata 1 |
| I home ausente tolerado | ✗ mata 1 |
| J resolvedor inventa valores | ✗ mata 1 |

Nenhuma sobrevivente.

### 15.5. Dois testes meus que não testavam nada

**O filtro por nome** julgava emissores de capacidade pelo nome da função, e reprovava a
própria classe pública — que é o **oposto** de um emissor, porque recusa construção. O
teste passou a medir o que importa: nenhuma chamada pública produz autorização que o
validador aceite.

**O helper mascarava o veneno.** `execucao(binding=None)` era substituído por um vínculo
válido, então o teste de "dicionário com cara de vínculo" nunca alcançava a condição.
Corrigido com sentinela: *não fornecido* deixou de ser o mesmo que *`None` explícito*.

Sétima vez nesta arca. O padrão não muda: **o fixture que não alcança a condição passa
parecendo prova.**

## 16. Remediação 3.1d-b-r2 — propriedade PROFUNDA do vínculo aprovado

O segundo gate adversarial devolveu **BLOCK** com um HIGH:

> `ApprovedRuntimeBinding` copia só o mapping EXTERNO. Valores aninhados de
> propriedade do chamador — `args`, `command`, `credential_pool` — seguem aliasados, e
> `to_agent_kwargs()` devolve esses mesmos objetos. Depois da emissão, mutá-los muda o
> material de construção aprovado sem revalidação.

Procede, e a linha era exatamente a apontada: `dict(execution_material or {})`.

### 16.1. A correção não copia mais fundo — não admite o que teria fundo

O reflexo seria `deepcopy`. Ele estaria errado por duas razões.

A primeira: `deepcopy` copia um objeto executável e devolve um objeto executável.
Copiar não é aprovar.

A segunda é a que decide. Perguntei de onde vinham `args`, `command`,
`credential_pool` e `api_key`, e a resposta é que **não vinham de observação nenhuma**.
A 3.1d-a registrou a assinatura real da construção em produção:

```
SessionManager._make_agent   session_id, cwd, model, requested_provider,
                             base_url, api_mode
```

Tirando identidade — `model`, `requested_provider`, `api_mode` — sobra `base_url`. Os
quatro campos aliasáveis entraram na allowlist da r1 por **suposição minha**.

E a suposição *era* a vulnerabilidade: só existia material de coleção para aliasar
porque campos não observados foram admitidos.

```
ANTES   base_url · api_key · command · args · credential_pool     4 supostos
DEPOIS  base_url                                                  1 observado
```

Vocabulário fechado, um validador por chave, `str` exata e não vazia. Chave fora da
allowlist é recusa nomeando a chave — nunca o valor. Não se aliasa o que não entra.

Se a 3.1d-c observar que produção precisa de um dos quatro, o resolvedor **recusa** e a
decisão é do Stefano. Recusa é o caminho governado; default silencioso não é.

### 16.2. A fronteira fica no TIPO, não em um chamador

O snapshot roda no `__post_init__`. Qualquer caminho que construa um vínculo —
resolvedor, fixture de teste, futuro emissor — atravessa a mesma linha. Pôr o snapshot
no resolvedor deixaria a garantia valendo só para quem lembrasse de chamá-lo.

`type(material) is not dict` e não `isinstance`: uma subclasse de `dict` pode
sobrescrever `__getitem__` e devolver valor diferente em cada leitura, e
validar-e-guardar leria duas vezes guardando o que não foi validado. Cada valor é lido
uma vez, e o que se guarda é o que o validador devolveu.

`to_agent_kwargs()` devolve dicionário **novo** de escalares imutáveis. Devolver o
estado interno deixaria o *consumidor* envenenar o vínculo.

### 16.3. O segundo aliasing, que o Codex não pediu

Auditando o campo, achei o mesmo defeito num lugar pior.

`GOVERNED_AGENT_KWARGS` era `dict` de módulo, e `kwargs.update(...)` copia a casca: a
lista de `enabled_toolsets` era o **mesmo objeto** em toda construção do processo. O
fornecedor a guarda por referência, e o refresh tardio de MCP descrito na 3.1d-a é um
escritor real desse atributo. Um `append` em um agente reabriria ferramenta para todos
os agentes seguintes, porque a allowlist "vazia" deles já teria deixado de ser vazia.

Isto não é provenance — é **ampliação de capacidade**.

E a 3.1b já tinha documentado o risco, no mesmo campo:

> `kwargs["enabled_toolsets"].append("mcp-x")` é uma ampliação de capacidade que
> nenhuma leitura de configuração pegaria — o objeto que inspecionamos e o objeto que o
> agente usa são o mesmo.

`creditum_enabled_toolsets()` da 3.1b devolve lista nova a cada chamada, de propósito,
com essa razão escrita no docstring. A r1 trocou a função por uma constante de módulo e
perdeu a lição. Agora é `governed_agent_kwargs()`: coleções próprias por construção.

### 16.4. Mutações

| mutação | resultado |
|---|---|
| A cópia rasa só da casca (o defeito original) | ✗ mata 8 |
| B `args` retido na allowlist | ✗ mata 2 |
| B2 validador de `args` aceita a lista por referência | ✗ mata 1 |
| C/F devolve o estado interno em vez de dicionário novo | ✗ mata 3 |
| D validador aceita mapping aninhado | ✗ mata 2 |
| E `credential_pool` arbitrário permitido | ✗ mata 1 |
| E2 `credential_pool` na allowlist de saída | ✗ mata 2 |
| G rejeição de tipo exótico removida | ✗ mata 3 |
| H snapshot não roda no `__post_init__` | ✗ mata 32 |
| I `isinstance` em vez de `type` para o mapping | ✗ mata 1 |
| J kwargs governados voltam a `dict` de módulo compartilhado | ✗ mata 1 |

Nenhuma sobrevivente.

### 16.5. O fixture da r1 que deixou isto passar

`test_I_mutar_a_fonte_depois_nao_muda_o_vinculo` usava `{"api_key": "sk-original"}` —
fixture **100% escalar**. Provava a casca, passava, e por isso o aliasing aninhado
sobreviveu: o fixture não tinha valor aninhado, então não alcançava a condição.

Oitava vez nesta arca, e desta vez o teste fraco era meu, escrito na remediação
anterior. O padrão não muda: **o fixture que não alcança a condição passa parecendo
prova.**

## 17. Descobertas c2/c3 e o pivô da r3 — o AIAgent sai do caminho

### 17.1. O que a produção mostrou

```
c2   o AIAgent SEMPRE descobre plugins — não existe construção que não descubra
c2   o portão da r2 ficava ANTES da mutação do relay: ele validava um payload que o
     relay ainda podia mudar
c3   não existe costura oficial para pular plugin
c3   o lifecycle pode descobrir de forma TARDIA, depois da construção
c3   existe uma costura segura pós-relay, dentro do closure do provider
c3   a superfície de telemetria/rede ANTES do portão NÃO foi provada ausente
```

O último item é o que decide. "Não foi provada ausente" não é "está ausente", e a
arquitetura inteira desta arca é construída sobre não confundir os dois.

### 17.2. Por que endurecer mais era o caminho errado

Para governar o `AIAgent` seria preciso governar tudo que ele carrega: descoberta de
plugin, lifecycle, middleware, relay, memória, contexto, resolvedor de ferramentas,
review em background. Cada um desses é uma superfície com dono diferente do nosso.

A r1 fechou três defeitos de autoridade. A r2 fechou dois de propriedade. Ambas
corrigiram problemas reais — e ambas estavam do lado errado da fronteira, porque o
objeto que precisava de contenção era maior do que a contenção podia alcançar.

**A redução é a correção.** O que não existe no caminho não precisa de portão.

### 17.3. O que a r3 é

```
ANTES   read model → AIAgent → run_conversation → _perform_api_call
                   → middleware → relay → provider
                                    ↑ o portão ficava aqui, e o relay vinha depois

DEPOIS  read model PRÓPRIO → payload determinístico → contrato congelado
                           → vínculo aprovado → requisição FECHADA
                           → PORTÃO → responses.create
                                    ↑ e entre o portão e a chamada não há nada
```

Uma requisição Codex Responses, cinco campos, construída só de material próprio,
somente-leitura, entregue direto ao SDK do provider.

Isto **reduz autoridade e superfície**. Não muda a constituição, não muda o contrato de
sistema, não muda schema canônico. E não implementa a hierarquia futura.

### 17.4. O núcleo é papel-neutro, e de propósito não é genérico

O executor recebe contrato de sistema, artefato de entrada e vínculo. Nada nele sabe o
que é "CEO", "CFO" ou "conselho executivo": a hierarquia futura reusa este núcleo
passando OUTROS contratos aprovados e versionados.

O que ele não faz é aceitar contrato arbitrário de chamador. Generalizar hoje
transformaria a autoridade de produção em parâmetro — e o dia em que o contrato virasse
argumento seria o dia em que a constituição viraria sugestão.

### 17.5. Mutações

| mutação | resultado |
|---|---|
| A reintroduz execução via AIAgent | ✗ mata 15 |
| B chama `discover_plugins` | ✗ mata 6 |
| C usa o relay do Hermes | ✗ mata 15 |
| D permite `base_url` http | ✗ mata 1 |
| E permite query/userinfo/fragment | ✗ mata 4 |
| F expõe `api_key` no `repr` | ✗ mata 2 |
| G cria seletor público de LIVE | ✗ mata 1 |
| H pula igualdade de provider/model/api_mode | ✗ mata 1 |
| I igualdade de system vira continência | ✗ mata 1 |
| J permite ferramentas | ✗ mata 1 |
| K muta a requisição depois do portão | ✗ mata 15 |
| K2 remove a reconferência do objeto enviado | **EQUIVALENTE** |
| L chama `responses.create` no PRECALL | ✗ mata 1 |
| M recaptura o read model depois da execução | ✗ mata 2 |
| N permite kwargs arbitrários | ✗ mata 1 |
| O permite `command`/`args`/`credential_pool` | ✗ mata 4 |
| P texto presente vale como sucesso | ✗ mata 2 |
| Q aceita envelope com chave a mais | ✗ mata 1 |
| R CLI aceita flag arbitrária | ✗ mata 1 |

18 mortas, 1 equivalente, nenhuma sobrevivente por lacuna.

**K2 é equivalente, e o registro é honesto:** `dict(request)` nunca divergiu de
`request` por conta própria, então a reconferência é defesa em profundidade que nenhum
caminho atual exercita. Ela fica porque materializar é a única oportunidade de
divergência que existe entre o portão e a rede — mas ninguém deve ler a tabela achando
que ela foi medida contra um ataque real.

### 17.6. A superfície do SDK é DECLARADA, não observada

O `openai` 2.24.0 não está instalado na máquina que escreveu a r3. A forma de
`responses.create` e do objeto de resposta está declarada em constante governada, e
`verify_sdk_surface()` confere a declaração contra a instalada e RECUSA quando divergem.

A 3.1b-r3 nasceu do erro de adivinhar API upstream, e a regra que ficou foi não
adivinhar. Isto não adivinha em silêncio: um palpite errado vira recusa nomeada no host
de produção, não resultado errado. Mas segue sendo palpite até a observação, e é
bloqueador declarado para o VIVO.

### 17.7. `reasoning` foi omitido

A c3 não observou configuração de reasoning exigida por este caminho. Inventar uma seria
escolher como o modelo pensa por palpite. Omitido, e registrado como pergunta.

## 18. Gate da r3 e remediação r4 — portão de SDK e autoridade da saída

### 18.1. Os dois HIGH

```
HIGH 1   capacidade viva válida alcançava responses.create sem que a superfície do
         SDK fosse conferida — e o verificador só olhava versão e a EXISTÊNCIA de
         `OpenAI`
HIGH 2   o executor marcava OK depois de parsear o envelope, sem contrato por item e
         sem integridade referencial
```

Ambos procedem.

### 18.2. HIGH 1 — nome parecido não é contrato compatível

A r3 provava que existia um símbolo chamado `OpenAI`. Não provava que ele aceita
`api_key` e `base_url`, nem que `responses.create` aceita `instructions`, `input`,
`tools` e `stream`. E a diferença aparecia tarde: na hora da chamada, com um cliente de
rede já construído.

O verificador agora inspeciona **assinatura**, e distingue o que a linguagem distingue:
um parâmetro `POSITIONAL_ONLY` com o nome certo **não** pode ser passado por palavra
chave. Conferir só o nome aprovaria uma assinatura que estoura na chamada. `**kwargs` é
aceito conscientemente — é como um SDK legitimamente encaminha campos.

A lista de campos exigidos **é** `REQUEST_FIELDS`, por identidade e não por cópia. Uma
lista própria seria uma segunda declaração do que enviamos, e no dia em que as duas
divergissem a conferência estaria provando a lista errada.

`TrustedSdkProvider` entrega versão, classe e o **descritor** de `responses.create` —
então a conferência roda antes de existir qualquer objeto capaz de rede. Não existe
caminho público que o forneça.

Ordem nova, e a razão dela:

```
capacidade viva → vínculo → SUPERFÍCIE DO SDK → cliente → requisição → PORTÃO → chamada
```

Descobrir incompatibilidade depois de construir o cliente seria descobrir com o objeto
de rede já na mão. E do portão até a chamada continua não entrando nada.

### 18.3. HIGH 2 — sucesso de provider não é sucesso da Creditum

`{"insights":[{}]}` passava: JSON válido, envelope certo, nenhum insight válido,
nenhuma conferência referencial. O executor tinha virado uma **segunda autoridade
semântica**.

A correção não é validar em Python. A autoridade canônica já está embarcada e testada:

```
reasoning.ts   acceptHermesReasoningOutput        envelope + contrato + referencial
reasoning.ts   validateInsightsAgainstReadModel   referências contra o read model
adapter.ts     assertValid("hermes-insight")      contrato de cada item, passo 5
adapter.ts     passo 5.1                          referencial contra o MESMO X do passo 2
```

Recriar essas regras em Python criaria duas autoridades que divergem no dia em que uma
muda — e a que valeria seria a que ninguém olhou.

Então o Python passou a ser **estruturalmente incapaz** de aceitar:

```
RAW SDK RESPONSE → EXTRACTED MODEL TEXT → UntrustedReasoningEnvelope
                                          verdict = MODEL_OUTPUT_UNVALIDATED
```

Tipos distintos por estágio, e o nome carrega o estado. Um tipo chamado
`ReasoningResult` seria lido como resultado, e alguém o devolveria ao chamador achando
que estava validado. Um teste varre os literais do módulo e falha se `OK`, `SUCCESS`,
`ACCEPTED` ou `VALIDATED` reaparecerem; outro varre o pacote atrás de
`hermes-insight`, `evidence_ref`, `materiality_ref` e `support_ref`, para que a
autoridade duplicada não volte por descuido.

### 18.4. Mutações — os dois lados da fronteira

Como o HIGH 2 passou a **delegar**, medir só o Python provaria metade.

| mutação | lado | resultado |
|---|---|---|
| A remove a verificação de SDK do VIVO | py | ✗ |
| B enfraquece a verificação para só a versão | py | ✗ |
| C aceita `responses.create` ausente | py | ✗ |
| D aceita assinatura de create incompatível | py | ✗ |
| D2 confere o nome mas não o modo do parâmetro | py | ✗ |
| E conta a chamada antes de verificar o SDK | py | ✗ |
| F marca sucesso logo após o parse do JSON | py | ✗ |
| G pula `assertValid("hermes-insight")` | ts | ✗ |
| H pula a validação referencial | ts | ✗ |
| I valida contra o grafo do chamador em vez de X | ts | ✗ |
| J filtra o item inválido em vez de falhar inteiro | ts | ✗ |

11 executadas, 11 mortas, nenhuma sobrevivente.

**E sobreviveu na primeira rodada**, e a lacuna era real: eu não testava o caminho em
que o SDK verifica mas a construção do cliente falha. O mutante reportava
`provider_calls = 1` sem chamada nenhuma. Contador que sobe antes da chamada transforma
"tentamos" em "chamamos", e quem lesse o relatório investigaria uma chamada que nunca
existiu. Dois testes fecharam isso — um deles espiando o contador **de dentro** da
chamada falsa, para provar que ele vale 1 naquele instante e não antes.

## 19. Gate da r4 e remediação r5 — procedência selada, verificado = invocado

### 19.1. O HIGH

> Qualquer chamador constrói o dataclass público `TrustedSdkProvider` com versão,
> classe e descritor COMPATÍVEIS, enquanto `build_client()` devolve um cliente
> diferente cujo `responses.create` nunca foi conferido.

Procede. **Verificado ≠ invocado**, e o nome "Trusted" não era procedência: era um nome.

### 19.2. A fábrica saiu — a costura era o defeito

O reflexo seria conferir também o que a fábrica devolve. Errado: enquanto existir uma
costura que o chamador controla entre a verificação e a chamada, ela é o lugar por onde
a substituição entra.

Não existe mais `build_client`. O executor constrói o cliente **ele mesmo**, da classe
selada, com o material fechado do vínculo. Sem callback, sem lambda, sem wrapper de
construtor, sem resolvedor dinâmico.

### 19.3. A corrente inteira, e o que cada elo prova

```
emissor interno selado    _SDK_ISSUER, comparado por identidade
    ↓                     objeto com os mesmos campos não passa; subclasse não passa
superfície DECLARADA      versão + construtor + descritor de create
    ↓                     falha aqui: 0 clientes, 0 chamadas, evidência inexistente
cliente CONSTRUÍDO aqui   provedor.client_class(**vínculo)
    ↓
type(cliente) is a classe selada        `__new__` pode devolver outro tipo, então
    ↓                                   conferir o construtor prova a chamada, não o objeto
type(recurso) is o recurso selado       ter um `.create` não faz de um objeto o recurso
    ↓
create capturado UMA vez                acessor dinâmico só troca na segunda leitura
    ↓                                   — então não existe segunda leitura
__func__ is o descritor selado           nome e assinatura são falsificáveis; identidade não
    ↓
verified_create(**enviado)              o MESMO objeto capturado e conferido
```

### 19.4. Modelo de ameaça, sem exagero

Isto protege a fronteira **pública** contra um chamador que entrega um SDK substituto.
NÃO é resistência criptográfica contra código malicioso já rodando dentro do mesmo
processo Python: quem pode importar um módulo privado pode chamá-lo. Dizer o contrário
venderia uma garantia que a linguagem não dá.

### 19.5. Mutações

| mutação | resultado |
|---|---|
| A provedor publicamente construível | ✗ |
| B conferência de selo removida | ✗ |
| C aceita subclasse (`isinstance`) | ✗ |
| D pula o tipo do cliente construído | ✗ |
| E pula o recurso `responses` | ✗ |
| F compara `create` por nome | ✗ |
| G relê `client.responses.create` | ✗ |
| I conta a chamada antes da identidade | ✗ |
| J restaura a costura de fábrica | ✗ |
| K remove a 2ª conferência do callable ligado | **EQUIVALENTE** |

9 mortas, 1 equivalente.

**K é equivalente, e a razão é estrutural:** se `__func__` é a mesma função, a assinatura
é a mesma função. Identidade e compatibilidade não podem divergir para o mesmo objeto,
então a segunda conferência é redundância que nenhum caminho viola. Fica como defesa em
profundidade, e está registrada como redundância — não como medida.

**Uma mutação foi retirada da lista por ser duplicata:** "invocar outro callable que não
o capturado" é, na prática, reler o acessor — o mesmo defeito de G, morto pelo mesmo
teste. Contá-la duas vezes inflaria o número sem provar nada a mais.

### 19.6. Três testes meus que estavam errados

**O fixture que não alcançava a condição.** Eu queria provar "identidade certa,
assinatura derivada". É **inalcançável** — mesma função, mesma assinatura. O teste foi
reescrito para medir o que existe: descritor selado incompatível cai na conferência
declarada, antes de existir cliente. Escrevê-lo como se alcançasse produziria prova falsa.

**`type(self).ultima`** fazia uma subclasse do cliente falso gravar no próprio atributo
enquanto o teste lia o do pai — vazio, parecendo zero chamadas. Um fixture que reporta
zero por engano é pior que um teste ausente: ele afirma.

**Dois mutantes sem efeito.** `_guardado = x` não invoca nada, e um `getattr` de campo
que não existe é sempre `None`. Ambos "sobreviveram" por não fazerem nada. Corrigidos, e
os dois morreram.

## 20. Gate da r5 — contratos "deletados" e o portão que não podia falhar

### 20.1. O que o Codex viu, e por que estava certo em apontar

```
D  intelligence/contracts/aros-briefing.schema.json
D  intelligence/contracts/decision.schema.json
D  intelligence/contracts/recommendation.schema.json
```

Três autoridades de contrato deletadas na árvore. Para quem lê o `git diff` contra
`HEAD`, isso é exatamente o que parece: autoridade congelada sumindo.

### 20.2. O defeito de processo, que era meu

Cinco relatórios seguidos afirmaram **"contracts/ zero arquivos tocados"**. A
conferência por trás era:

```bash
find contracts -type f -newermt "<T>"      # "nenhum arquivo mais novo que T"
```

Um arquivo **deletado** nunca é mais novo que T — ele não existe. A pergunta que eu
fazia não podia ter a resposta que importava. Sempre "zero", e sempre por construção.

É a mesma família de defeito dos fixtures fracos, agora na verificação: **uma
conferência que não pode falhar não é uma conferência, é uma frase.** E ela passou por
cinco gates porque produzia a linha que todo mundo queria ler.

### 20.3. O que os três arquivos são — e por que restaurá-los é o oposto de congelar

A retirada é da **3.0a**, e a razão está escrita no código desde então:

```
decision        decided_by_role: "string"    aceitava "HERMES"
aros-briefing   approved_by_human: boolean   aprovação sem DecisionRecord
recommendation  human_decision_required      fora do contrato epistêmico

"os três abriam um SEGUNDO caminho de autoridade,
 incompatível com a constituição da Fase 3"
```

`decision` deixava a máquina se registrar como quem decidiu. Restaurá-lo reabre
exatamente o buraco que a 3.0a fechou, e faz de **"HERMES RECOMENDA. STEFANO DECIDE."**
uma frase sem lastro no schema.

### 20.4. A invariante estava enunciada errada

`HEAD` é `4a7fb7d — Fases 2.1–2.9`, anterior à 3.0a. **Todas** as fases 3.0a–3.1d estão
por commitar. "contracts/ idêntico a HEAD" nunca foi verdade desde a 3.0a, e não podia
ser: a 3.0a substituiu seis schemas por treze.

A invariante que importa não é *"nada mudou desde HEAD"*. É:

```
os 13 contratos canônicos da 3.0a têm bytes congelados
os 3 retirados na 3.0a continuam ausentes
```

Comparar contra `HEAD` mede distância de um ponto que já não é a linha de base.

### 20.5. O portão

`scripts/verify-frozen-contracts.mjs`, ligado ao `validate:schemas`. Faz duas perguntas,
e só duas: cada canônico existe com os bytes congelados; cada retirado continua fora.

Os nomes **não** são declarados no portão — vêm de `CONTRACT_NAMES` e
`WITHDRAWN_CONTRACT_NAMES` em `gateway/src/contracts.ts`, que já é o que torna um
contrato canônico. Uma segunda lista divergiria, e a que valeria seria a que ninguém
olhou.

Nove testes provam que ele **falha**: canônico ausente (o caso que a conferência antiga
não via), um byte alterado, cada um dos treze individualmente, retirado ressuscitado,
linha de base ausente, e um nome novo na autoridade sendo imediatamente exigido.

Ausência de linha de base é recusa: não saber nunca é estar íntegro.

## 21. Gate da r5-r1 — a segunda lista de associação

### 21.1. O HIGH

> `scripts/validate-schemas.mjs` tinha um registro `CONTRACTS` próprio. Acrescentar um
> nome ao `CONTRACT_NAMES` governado, registrar o hash congelado dele e **esquecer**
> desta segunda lista fazia o portão de congelamento aprovar um schema que a validação
> nunca compilava.

Procede. E a duplicação era minha: a 3.0a reescreveu essa lista em dois arquivos.

Duas listas não divergem no dia em que são criadas. Divergem no dia em que alguém mexe
em uma — e a que vale passa a ser a que ninguém olhou.

### 21.2. Uma declaração, três consumidores

```
gateway/src/contract-registry.ts     ← A ÚNICA declaração. Zero efeito colateral.
      ├── gateway/src/contracts.ts          runtime: compila e valida
      ├── scripts/validate-schemas.ts       compila TODO nome canônico
      └── scripts/verify-frozen-contracts.ts  bytes congelados + retirados ausentes
```

**Por que módulo separado:** `contracts.ts` compila todos os schemas no import.
Importá-lo do validador ou do portão de congelamento acoplaria integridade de arquivo a
compilação de schema — um schema quebrado derrubaria a conferência de bytes, que não
tem nada a ver com isso. O registro não faz nada; ele declara.

**Por que `tsx` e não `.mjs`:** a r5-r1 extraía os nomes com regex sobre o texto de
`contracts.ts`. Funcionava, e era frágil pela mesma razão de qualquer derivação de
segunda mão — formatação mudando o resultado sem a autoridade mudar. Agora é `import`.

O manifesto **não** define associação. Ele liga nome aprovado a hash, e a conferência
exige igualdade de conjunto contra `CONTRACT_NAMES`: entrada sobrando é recusa, e hash
de contrato retirado não o torna canônico.

### 21.3. A regressão que o regate pediu

Bancada sintética dentro do repo, nome novo entrando **só** pelo registro governado,
hash congelado correto, e o pipeline de verdade rodado por `spawnSync`:

```
schema QUE NÃO COMPILA   → verify:frozen passa (arquivo e hash certos)
                         → validate-schemas SAI NÃO-ZERO ao compilar
schema VÁLIDO            → pipeline passa, e imprime "14 contratos compilam"
sem linha de base        → portão falha antes
```

O segundo caso existe para que uma implementação que simplesmente recusa todo nome novo
não passasse no primeiro sem nunca compilar nada. Asserção sobre `exitCode`, nunca sobre
texto impresso: um script que imprime "falhou" e sai com 0 é um script que passa.

### 21.4. Mutações

| mutação | resultado |
|---|---|
| A restaura a lista local em validate-schemas | ✗ |
| B validador itera as chaves do manifesto | ✗ |
| C pula o último canônico | ✗ |
| D filtra nomes novos antes de compilar | ✗ |
| E falha de compilação vira aviso | ✗ |
| F engole o código de saída | ✗ |
| G aceita canônico sem linha de base | ✗ |
| H aceita entrada canônica sobrando no manifesto | ✗ |
| I permite contrato retirado de volta | ✗ |
| J registro perde `WITHDRAWN_CONTRACT_NAMES` | ✗ |

10 executadas, 10 mortas.

**B e H sobreviveram na primeira rodada, e estavam ligadas.** B só sobrevivia porque H
também: com entrada sobrando no manifesto sendo aceita, as chaves do manifesto e
`CONTRACT_NAMES` nunca divergiam nos meus fixtures, e trocar uma pela outra não mudava
nada observável.

Fechei H com um teste direto, e B **estruturalmente** — o validador de schema não pode
sequer ler o manifesto de hashes. Deixar B morrendo só por causa de H seria fazer uma
defesa depender de outra sem dizer.

### 21.5. Um teste meu largo demais

A varredura "nenhum nome canônico aparece literal em validate-schemas" acusava
`snapshot`, `event` e `evidence` — que nomeiam **diretórios de fixture**, outra coisa.
Acusá-los confundiria mapa de fixture com lista de associação, e obrigaria a contorcer
código correto para calar um teste. A varredura passou a cobrir os dez contratos da
3.0a, que não têm diretório de fixture: se um deles aparecer literal ali, é lista de
associação renascendo.

## 22. Descoberta c4 e r6 — do declarado ao observado

### 22.1. O que a c4 observou em produção

```
openai                 2.24.0   /opt/venv/lib/python3.13/site-packages/openai/__init__.py
cliente                openai.OpenAI
recurso                openai.resources.responses.responses.Responses
descritor              Responses.create           método normal
relação observada      client.responses.create.__func__ is Responses.create     SIM

construtor             api_key, base_url — KEYWORD_ONLY, com default, SEM **kwargs
create                 model, instructions, input, tools, stream — todos aceitos, SEM **kwargs
não-streaming          suportado; stream=False devolve openai.types.responses.response.Response

resolvedor             /opt/hermes-agent/hermes_cli/runtime_provider.py :: resolve_runtime_provider
config                 hermes_cli.config.load_config()  →  config["model"]["default"]
identidade             openai-codex / gpt-5.6-luna / codex_responses      sem deriva
base_url               str, https, host, sem userinfo/query/fragment, com path
api_key                str, não vazia — materializada internamente, nunca impressa
command · args         ausentes, não usados
credential_pool        presente no runtime mais amplo, NÃO usado pelo caminho efetivo
```

A r5 declarava esta superfície. A r6 a **verifica contra o objeto instalado**.

### 22.2. O que a c4 fechou, e o que ela ABRIU

Fechou: versão, classes, descritor, assinaturas, resolvedor, identidade, material.

Abriu uma pergunta que não existia antes:

> `Response.output_text` é propriedade de conveniência DERIVADA. Ela agrega os blocos
> `output_text` de **todos** os itens `message` de `response.output` e concatena. E
> `response.output` pode trazer raciocínio, chamadas de ferramenta, itens MCP e
> aprovações.

Aceitar `output_text` como resultado final seria concatenar respostas e chamar o
resultado de uma. **A superfície está observada; a regra de qual é a resposta final
não está aprovada.**

Isso não é detalhe adiável: é a diferença entre ler o que o modelo respondeu e ler uma
colagem do que ele produziu. A r6 transforma a pergunta em recusa nomeada
(`LIVE_RESPONSE_POLICY_NOT_APPROVED`), selada no provedor de produção — para que a
ambiguidade não possa ser esquecida entre uma fase e a seguinte.

Provado por teste: vínculo de produção + provedor de produção selado + capacidade
válida → **0 chamadas ao provider**, recusa por política.

### 22.3. Resolvedor de produção — sem argumento, sem ambiente

```
resolve_approved_runtime_binding()      ZERO parâmetros
    hermes_cli.config.load_config()  →  config["model"]["default"]  →  == gpt-5.6-luna
    resolve_runtime_provider(target_model=modelo)
        explicit_api_key   NÃO passado
        explicit_base_url  NÃO passado
```

Deixá-los ausentes é o que faz o Hermes usar o próprio caminho governado de credencial.
Preenchê-los daqui — de ambiente ou de chamador — devolveria a credencial a quem
invoca, que é o defeito da r1.

**O modelo vem da CONFIG, não do retorno do resolvedor.** A c4 observou que o resolvedor
pode não devolver campo de modelo quando quem chama já selecionou; ler de lá daria
ausência às vezes, e ausência lida como "sem modelo" viraria fallback.

`credential_pool` aparece no retorno do Hermes e **não entra** no vínculo. Aparecer no
resolvedor não é autorização.

Imports são TARDIOS: o pacote importa sem `hermes_cli` e sem `openai`, e ausência é
recusa nomeada — não `ImportError` no meio de uma sessão.

### 22.4. Mutações

14 executadas, 14 mortas: emissor aceitando classe de chamador; versão do SDK;
identidade de cliente e de recurso enfraquecidas para nome; descritor trocado;
resolvedor aceitando credencial de chamador; ambiente atravessando; modelo vindo do
retorno em vez da config; `credential_pool` admitido; `base_url` sem validação; sonda
construindo cliente; segredo no `repr`; VIVO sem política de resposta.

**Quatro sobreviveram na primeira rodada, e as quatro eram fixtures fracos meus:**

- **versão conferida em dois lugares.** O emissor comparava, e `verify_sdk_surface`
  comparava de novo. Remover uma não mudava nada — e uma defesa duplicada que sobrevive
  à própria remoção não estava sendo medida. Ficou uma só.
- **identidade conferida por nome.** Meus fixtures trocavam o `__qualname__`, então
  conferir só o nome também pegava. Faltava o caso que separa: **nome certo, módulo
  errado, `create` funcionando**. Com ele, "parece o objeto" deixa de passar por "é o
  objeto".
- **o mesmo, para o recurso `responses`.** A mutação que pulava a conferência passava
  porque o teste caía depois, por `create` ausente — asserção certa pelo motivo errado.
- **ambiente que não atravessa.** O teste afirmava `is None` e passava porque a variável
  não existia nesta máquina. Um fixture que depende do ambiente estar vazio mede a
  máquina, não o código. Agora ele **põe** `OPENAI_API_KEY` e exige que não atravesse.

### 22.5. `npm run verify` sai ZERO

Pela primeira vez nesta arca. Os 8 erros de lint que eu venho reportando como
"pré-existentes" desde a 3.1b eram o que mantinha o pipeline composto vermelho.

Sete eram asserções de tipo desnecessárias (`--fix`), dois imports ficaram órfãos com
elas, e o último era `String(ruim)` sobre `{}` — que produz `"[object Object]"` para
toda entrada de objeto, ou seja, um rótulo de teste que não distingue os casos quando
um deles falha. Virou `JSON.stringify`.

Reportar dívida seis vezes e nunca pagá-la é uma forma de conviver com vermelho.

## 23. Gate da r6 — a exceção de terceiro como canal de vazamento

### 23.1. O HIGH

> `load_config()` e `resolve_runtime_provider()` executam fora de fronteira
> sanitizadora. Se qualquer um levantar exceção cuja MENSAGEM contenha credencial,
> endpoint ou um repr do dicionário de config, ela escapa — e o Python imprime o
> traceback em stderr.

Procede. Eu tinha selado o vínculo, o SDK e o relatório, e deixei aberto o canal mais
banal: **a mensagem de erro de quem resolve o segredo**.

### 23.2. Não se limpa a mensagem — não se usa a mensagem

O reflexo seria redigir: tirar query string, procurar o segredo, mascarar. Errado.
Redigir exige saber o formato do que se procura, e segredo em formato inesperado
passaria — com a limpeza dando a impressão de que passou limpo.

A regra é mais simples e mais forte: **o texto não é usado.** Nem `str`, nem `repr`,
nem `args`. Só o TIPO, e mesmo ele conferido — nome de classe é escolhido por quem
escreve a classe, e `improvável` não é `impossível`.

```
try:    fn(...)
except Exception as causa:
        tipo = _tipo_seguro(causa)     # identificador, ≤64 chars, senão "Exception"
        del causa                      # a original morre aqui
        raise RuntimeRefusal(defeito, tipo) from None
```

`from None` corta o encadeamento. Sem ele o traceback renderiza a causa, e a mensagem
volta por baixo.

Defeitos distintos por estágio — `HERMES_CONFIG_LOAD_FAILED` e
`HERMES_RUNTIME_RESOLUTION_FAILED` — porque saber *onde* falhou é observabilidade, e
não custa nada de conteúdo.

### 23.3. Um segundo vetor, no mesmo trecho

`str(resolvido.get("hermes_version") or "0.20.4")` executava o `__str__` de um objeto
do resolvedor, e o resultado virava **campo do vínculo** — que aparece no `repr` e no
relatório da sonda. Um campo de versão não vale abrir essa porta. Agora só `str` exata
atravessa; qualquer outra coisa cai no padrão próprio.

### 23.4. Mutações

12 executadas, 12 mortas: fronteira do config removida; fronteira do resolvedor
removida; `str(exc)`; `repr(exc)`; `exc.args`; `from None` removido; nome de tipo
hostil aceito; catch-all da CLI removido; versão via `str(objeto)`; dicionário
resolvido despejado; URL bruta na recusa de política; URL bruta na recusa de scheme.

**Cinco sobreviveram na primeira rodada, e duas delas se protegiam mutuamente.**

A fronteira selada e o catch-all da CLI mascaravam um ao outro: remover qualquer uma
sobrevivia porque a outra sanitizava. **Duas defesas que só falham juntas são, na
prática, uma defesa não medida** — nona ocorrência do padrão nesta arca, agora entre
camadas em vez de dentro de um fixture.

Cada camada passou a ser medida **sozinha**: o resolvedor chamado direto, sem CLI; e a
CLI com o resolvedor inteiro substituído por algo que estoura cru.

As outras três eram medição errada minha:

- **`__cause__` era o atributo errado.** `from None` zera `__cause__`, mas quem carrega
  a original é `__context__`. Eu afirmava sobre um campo que era `None` de qualquer
  jeito — um teste que sempre passava. Agora confere `__suppress_context__` e renderiza
  o traceback inteiro procurando o segredo.
- **recusa despejando o dicionário** não era testada porque nenhum fixture devolvia um
  não-dict com segredo no `repr`.
- **URL bruta na recusa** não era testada porque eu só afirmava o defeito, nunca o
  detalhe. E o mutante que escrevi mirava o ramo do valor não-string, onde o `repr`
  imprimiria `None` — mutante mal mirado é tão inútil quanto teste fraco.

### 23.5. A recusa nomeia o CAMPO, nunca o valor

Vale para todos os ramos: `base_url` inválida diz qual parte violou a política —
`query`, `fragment`, `scheme` — e nunca a URL. Se o token está na query, imprimir a URL
para explicar o erro publicaria o token justamente ao explicar por que ele não é
permitido.

## 24. Gate da r6-r1 — o NOME DA CLASSE também é texto de terceiro

### 24.1. O HIGH

> O catch-all da CLI emite `type(causa).__name__` cru. Construir uma classe com nome
> arbitrário é Python legal, então o nome é texto controlado por terceiro — e o teste
> existente só injetava uma classe de nome inofensivo, que mascarava o defeito.

Procede, e a ironia é minha: eu tinha escrito `_tipo_seguro` na r6-r1 exatamente para
isto, e **não o usei** justamente onde a defesa era independente. Escrever a defesa e
não ligá-la é a mesma família de "a conferência que não pode falhar" — só que pior,
porque o sanitizador existia e dava a impressão de estar cobrindo tudo.

Dois sítios: o catch-all da resolução de runtime e o análogo em volta da sonda.

### 24.2. Um sanitizador, dois consumidores

`safe_exception_type()` expõe a MESMA política que o resolvedor usa. Um sanitizador
próprio da CLI teria a própria noção de "seguro", e as duas divergiriam no dia em que
uma fosse endurecida.

### 24.3. E a política tinha um segundo furo

`str.isidentifier()` aceita identificador **Unicode**. Um nome com homóglifo cirílico,
marca de direção ou caractere invisível passaria — e o destino é o stderr de um
terminal, que interpreta sequência de controle.

```
ANTES   nome.isidentifier() and len(nome) <= 64
DEPOIS  ^[A-Za-z_][A-Za-z0-9_]{0,63}$        ASCII, ancorado nos dois lados
```

Allowlist, e não busca pelo ruim: procurar o ruim exige conhecer todo o ruim, e o
próximo caractere hostil nasce fora da lista.

### 24.4. Mutações

10 executadas, 10 mortas: cada catch-all voltando ao nome cru; `isidentifier` no lugar
do ASCII; regex sem limite; regex sem âncora final; `str(exc)`; `repr(exc)`;
sanitizador devolvendo sempre o fixo; fronteira do resolvedor removida; catch-all da
CLI removido.

As duas últimas medem as camadas **separadamente** — a lição da r6-r1, mantida.

**"Sanitizador devolvendo sempre o fixo"** existe porque uma defesa cega passaria em
todos os testes de nome hostil sem nunca ter medido nada. O contraponto positivo — um
nome bem formado ainda atravessa — é o que distingue sanitizar de apagar.

### 24.5. Meu próprio guard pegou uma coisa

Escrevi `"Bad test-secret-never-log"` como exemplo dentro de uma docstring do pacote de
**produção**. O teste de higiene do artefato acusou: o marcador iria para o ZIP.
O exemplo virou descrição.

Documentar um ataque escrevendo o ataque literal no código de produção é como explicar
uma senha citando a senha.

## 25. Gate da r6-r2 — a varredura que eu devia ter feito três rodadas antes

### 25.1. O HIGH

> O catch-all do import do SDK ainda formata `type(causa).__name__` cru dentro de
> `ExecutorRefusal.detail`, e a CLI imprime `r.detail`.

Procede. Quarto achado da **mesma família**, e o padrão é meu: nas três rodadas
anteriores eu corrigi *a linha apontada* e reportei o conserto. Corrigir o que o
revisor achou não é o mesmo que fechar a classe do defeito.

### 25.2. Desta vez a varredura veio antes da correção

Onze sítios inseguros, e a maioria **fora** da linha apontada:

```
exceção de terceiro       executor.py:429,487 · contract.py:119 · codex.py:454
valor externo → type()    executor.py:253,375,383 · codex.py:427,449 · runtime.py:236
valor externo → repr/str  codex.py:255,348,407,417,424 · runtime.py:246
                          session.py:88 · __main__.py:184
```

O pior era `f"status={status!r}"`: `status` vem do objeto de resposta do provider, e
`!r` **executa o `__repr__` dele**. O objeto de terceiro escolhia o que aparecia no
nosso stderr.

### 25.3. Dois helpers, uma política

```
safe_type_name(valor)         nomeia o TIPO. Nunca o valor.
safe_label(valor, permitidos) ecoa só se for str exata de uma allowlist governada.
```

Ambos usam o mesmo `_NOME_DE_TIPO_SEGURO` do `safe_exception_type`. Um sanitizador,
três entradas.

**Por que nomear o tipo:** "esperava str, veio dict" diz o que o operador precisa
saber. `repr(valor)` diria a mesma coisa E publicaria o conteúdo.

**Por que allowlist para rótulos:** "status=incomplete" é diagnóstico útil. Mas um
`status` fora da lista é exatamente o caso em que não se sabe o que ele é — e ecoar
texto externo é como esta arca vazou quatro vezes.

Sete ocorrências ficaram: constantes nossas (`{aprovado!r}`), `uuid` nosso, path já
validado como `str`, o fixture empacotado e hash-verificado, e a linha interna do
próprio sanitizador. Classificadas SEGURAS, não ignoradas.

### 25.4. Mutações

13 executadas, 13 mortas.

**Quatro sobreviveram na primeira rodada, e as quatro tinham a mesma raiz:** minha
classe venenosa tinha nome ASCII **seguro**. Os testes exercitavam o caminho do `repr`
e nunca o do nome do tipo — então trocar `safe_type_name` por `type().__name__` não
mudava nada observável.

O veneno passou a estar também no NOME da classe, que é o que o sanitizador lê.

E uma delas foi repetição pura: `__cause__` é `None` com ou sem `from None`; quem
carrega a original é `__context__`. **Eu já tinha cometido e corrigido esse erro na
r6-r1**, e o repeti aqui sem perceber. Corrigir um teste não corrige o hábito que o
produziu.

### 25.5. O que eu levo desta sequência

Quatro HIGH seguidos, todos "material externo atravessando uma fronteira de texto",
cada um numa camada acima do anterior. O que os produziu não foi ignorância da regra —
a regra estava escrita, e o sanitizador existia desde a r6-r1.

Foi tratar cada achado como um bug em vez de como uma amostra.

---

## 26. r6-r4 — a regra que passou a ser conferida em vez de lembrada

Quatro HIGH seguidos, todos da mesma família. A §25.5 fechou com o diagnóstico:
tratei cada achado como um bug em vez de como uma amostra.

Esta fase não corrige um quinto achado. Corrige o motivo pelo qual haveria um.

### 26.1. O que faltava não era a regra

A regra estava escrita desde a r6-r1. O sanitizador existia. O que faltava era a
regra ser **conferida** — nada no repositório recusava um sink novo. A revisão humana
pega o padrão quando olha para ele; o problema é o arquivo que ninguém olha com o
mesmo cuidado, e esse é sempre o arquivo novo.

`intelligence/scripts/verify-output-hygiene.py` é a conferência. Primeira etapa do
`npm run verify`, encadeada com `&&`: uma violação de higiene interrompe o pipeline
antes de 3035 testes, e o exit 1 é do processo, não um aviso impresso.

### 26.2. O que ele é, e o que ele não é

**Análise sintática por AST.** Não é verificação de fluxo de informação. Ele não sabe
de onde um valor veio e não prova que nenhum segredo vaza.

Dizer isso é a parte importante. Um portão descrito como mais forte do que é vira
justificativa para relaxar as provas semânticas — e aí duas defesas se tornam uma
defesa não medida, que é o defeito que a r5-r2 já cobrou.

O que ele faz é recusar os padrões que **já** vazaram, fora dos sanitizadores
governados:

| regra | padrão recusado |
|---|---|
| OH001 | `str(x)` |
| OH002 | `repr(x)` |
| OH003 | `.args` de exceção capturada |
| OH004 | `type(x).__name__` e `x.__class__.__name__` |
| OH005 | conversão `!r` / `!s` / `!a` em f-string |
| OH006 | `.format()` e `%` |
| OH007 | `json.dumps(objeto)` fora do DTO fechado |

Por que AST e não grep: `# type: ignore`, quebra de linha, espaço a mais e nome de
variável diferente derrotam texto. E o portão precisava distinguir `str(uuid4())` de
`str(excecao)` — o segundo executa `__str__` de terceiro, o primeiro não. Essa
distinção não existe no nível do texto.

### 26.3. Duas escolhas que valem ser ditas

**A allowlist de sanitizadores é uma lista de três nomes**, não o prefixo `safe_`.
Um portão que confia em qualquer coisa chamada `safe_*` transfere a autoridade para
quem escolhe o nome. `safe_exception_type`, `safe_type_name`, `safe_label`.

**Nenhuma exceção por arquivo, nenhuma por linha, nenhuma por supressão de lint.**
Linhas andam; supressão de lint é uma decisão de segurança escrita onde ninguém
procura por decisões de segurança. As duas únicas exceções são estruturais:

- módulo + função, para os sanitizadores que leem `type(x).__name__` para validá-lo;
- forma do argumento AST, para `str()` cujo argumento é uma chamada terminando em
  `uuid4` ou `resolve`.

E antes de escrever qualquer exceção, eliminei os casos que só existiriam como
exceção: os `!r` sobre constantes NOSSAS em `runtime.py` (a constante não precisa de
`repr`), e a coerção do id do fixture em `__main__.py`, que virou
`safe_label(..., (APPROVED_FIXTURE_ID,))` — uma allowlist afirma qual é o valor
esperado; `str()` coagiria o que viesse.

O portão também achou uma que eu não tinha previsto: `_tipo_seguro` e
`safe_exception_type` eram a mesma função com dois nomes, e dois nomes exigiriam
duas exceções. Colapsadas em uma. **Menos exceção, portão mais forte.**

### 26.4. Mutações — estáticas e dinâmicas, contadas separadamente

Os dois números medem coisas diferentes, e somá-los esconderia exatamente o que eu
precisava ver.

**Estáticas — 16 executadas, 16 mortas.** 11 padrões perigosos escritos num pacote
sintético (A–K) e 5 reintroduções dos HIGH históricos no arquivo REAL, numa cópia
(W). Se um histórico voltar VIVO, o teste cai antes de o Codex ter de achar de novo.

**Controle positivo — 6 (L–Q).** Sem eles, um `return 1` incondicional passaria em
todas as 16 acima parecendo rigoroso.

**Não-dependência de lista de arquivos — 3 (R–T).** Um módulo novo, um submódulo
aninhado e a conferência de que os cinco módulos com histórico continuam na varredura.

**Dinâmicas — 10 executadas, 10 mortas.** Mutam a fonte real e rodam as suítes de
segurança. `scripts/mutate-output-hygiene.py`, BANCADA e não etapa do pipeline: roda
a suíte uma vez por mutação.

### 26.5. O que a bateria dinâmica achou, e que o portão sozinho teria escondido

**D8 sobreviveu: `PROVIDER_CALL_FAILED` estava VIVO.**

Trocar `safe_exception_type(causa)` por `causa.args[0]` na fronteira da chamada ao
provedor (`executor.py:438`) não fazia **nenhum** teste cair. As únicas menções a
`PROVIDER_CALL_FAILED` em `tests/` eram as strings da minha própria mutação.

O portão sintático via o padrão. Nada executava a fronteira.

E esta é a fronteira mais sensível do módulo: a exceção nasce de uma resposta HTTP
real e pode carregar header de autorização, endpoint e corpo. Ela estava correta —
e correta sem prova é indistinguível de correta por acidente.

Cinco testes fecharam a lacuna: segredo no texto, nome de classe hostil, controle
positivo com identificador ASCII comum, `__suppress_context__` com traceback
renderizado, e a evidência. D8 passou a morrer com 5 falhas.

Duas mutações nasceram MAL APONTADAS — alvo ausente no arquivo. A décima ocorrência
da mesma família. O guard que compara o alvo com o texto real é o que impediu de
serem contadas como mortas; por isso ele agora FALHA o teste em vez de avisar.

### 26.6. Verificação

`npm run verify` (intelligence) — **exit 0**. Higiene: 9 módulos, nenhum sink. 13
contratos íntegros, 3 retirados ausentes, 13 compilam, 12 fixtures. 2725 TS
(1354 detectors + 926 integration + 445 gateway). 310 Python — eram 282; +23 do
portão, +5 da fronteira do provedor. lint 0, typecheck 0.

Portal: 190 testes, typecheck 0. **`npm run verify` do portal continua vermelho:**
16 erros de lint em `src/**`, em arquivos byte-idênticos ao HEAD. Pré-existentes, não
desta fase, e não corrigidos por ela.

---

## 27. r6-r5 — confiança por grafia e confiança por container

A §26 fechou dizendo que o portão automatiza a regra de higiene. O Codex leu o portão
e achou dois HIGH. Os dois eram meus, os dois eram simples, e os dois tinham a mesma
raiz: **eu concedi confiança pela FORMA do código em vez da PROCEDÊNCIA do valor.**

### 27.1. HIGH 1 — a isenção que valia para qualquer objeto

Eu isentava `str(x)` quando `x` era uma chamada cujo nome final fosse `resolve` ou
`uuid4`. A intenção era "objetos que NÓS construímos". O que eu escrevi foi outra
coisa:

```python
class Atacante:
    def resolve(self):
        return Veneno()

print(str(atacante.resolve()))   # passava
```

Um método se chamar `resolve` não diz nada sobre quem o escreveu. O `__str__`
executado era o do objeto de terceiro — exatamente a classe de defeito que o portão
existe para impedir. Eu tinha reintroduzido a vulnerabilidade dentro da defesa.

**Um dos dois casos nem precisava existir.** `_canonico` convertia o caminho para
texto, mas seus dois únicos consumidores comparam por igualdade — e `Path.__eq__` já
compara o destino normalizado. A conversão não servia à comparação; servia apenas
para obrigar o portão a abrir uma exceção. Passou a devolver `Path`. **Exceção
eliminada, não estreitada.**

**O outro caso não podia sumir:** o formato hifenizado de 36 caracteres do
`session_id` é governado (há teste que o afirma), então `.hex` mudaria o
identificador em silêncio. A conversão ficou — mas deixou de valer por grafia:
`governed_uuid_text` confere `type(valor) is uuid.UUID` em runtime. Um impostor com
método homônimo não alcança isso.

### 27.2. HIGH 2 — o container que eu li como garantia

Eu aceitava qualquer `ast.Dict` como argumento seguro de `json.dumps`. O ataque é uma
linha de Python perfeitamente ordinária:

```python
print(json.dumps({"detail": binding}))     # passava
print(json.dumps({"error": exception}))    # passava
payload = {"detail": binding}              # passava — e nem literal era
```

Um dicionário é um recipiente. O que importa é o que está dentro dele, e isso um
scanner sintático não sabe.

A correção não foi ensinar o scanner a olhar dentro. Foi **mover a conferência para
onde existe informação para fazê-la**:

- **Estático:** `json.dumps` é proibido em TODO o pacote de produção, exceto em
  quatro funções nomeadas por `(módulo, função)` — três canonicalizam material para
  hash e não são saída; uma é a fronteira pública.
- **Runtime:** `serialize_safe_public_report` aceita apenas `PrecallProbeReport` ou
  `PrecallRefusalReport`, conferidos por identidade de tipo, e confere cada campo
  contra `(str, bool, int)` **antes** de serializar. `dict` e `list` não estão na
  lista: aninhar é como o material bruto entraria sem ninguém olhar.

A ordem importa. Serializar e depois inspecionar não seria conferência — `json.dumps`
já teria executado o `default`/`__str__` do que recebeu. O teste que prova isso usa um
objeto cujo `__str__` levanta: ele passar é a prova de que a recusa veio antes.

`_recusa` na CLI também perdeu seu dicionário literal — mesmo sendo só de constantes.
**Ser inofensivo não é ser conferido**, e um literal seguro hoje é o lugar onde
alguém acrescenta um campo amanhã.

### 27.3. O que eu levo

A §26 dizia, com razão, que a r6-r4 automatizou a regra. O que ela não fez foi aplicar
a própria regra ao código da regra. Eu escrevi um portão contra confiança não
verificada e o construí sobre duas confianças não verificadas.

`str(x)` é `str(x)`, seja x o que for. `{...}` é um recipiente, não uma promessa. E
uma exceção estrutural só é estrutural se a estrutura for **procedência** — não
grafia, não forma.

### 27.4. Mutações

- **Portão/fronteira: 9 executadas, 9 mortas.** Cada uma reintroduz uma das regras
  vulneráveis (isenção por grafia, confiança em `ast.Dict`, `json.dumps` livre,
  autoridade por prefixo de nome, fronteira sem conferência de tipo, sem conferência
  de valor, `isinstance` no lugar de `type(...) is`, uuid sem procedência). Se
  qualquer uma sobrevivesse, a regressão correspondente não observaria o que diz.
- **Regressões de ataque r6-r5: 24**, incluindo os ataques literais do Codex e cinco
  controles positivos — sem eles, um portão que recusa tudo passaria por rigoroso.
- **Dinâmicas r6-r4: 10 executadas, 10 mortas** (sem regressão).
- Bancada com duas guardas: alvo tem de existir E fonte tem de mudar. Falhar qualquer
  uma é defeito de bancada, nunca "morta".

### 27.5. Verificação

`npm run verify` (intelligence) — **exit 0**. 9 módulos limpos · 13 contratos íntegros,
3 retirados ausentes, 13 compilam, 12 fixtures · 2725 TS · **335 Python** (eram 310) ·
lint 0 · typecheck 0. Sabotagem deliberada: exit 1 no portão, zero etapas seguintes.

Congelados conferidos pelo cálculo GOVERNADO com separação de domínio, e o verificador
foi desafiado: um byte trocado na constituição → recusa; um espaço no fim → recusa;
fonte intocada → passa.

Portal: 190 testes, typecheck 0, 16 erros de lint pré-existentes em `src/**` — nenhum
arquivo tocado por esta fase.

---

## 28. r6-r6 — a terceira vez que eu aceitei um nome no lugar de uma identidade

O Codex leu o portão da r6-r5 e achou um HIGH:

```python
v = Visitante(caminho.stem)
```

`creditum_hermes_reasoning/probe.py` e `creditum_hermes_reasoning/anything/probe.py`
eram os **dois** o módulo `"probe"`. Um módulo aninhado com o basename certo e uma
função com o nome certo herdava a autoridade `OH007` do serializador real.

### 28.1. O padrão, agora visível

Três rodadas, três eixos, um defeito:

| rodada | eu autorizei por | quem escolhe |
|---|---|---|
| r6-r5 HIGH 1 | grafia do método (`resolve`, `uuid4`) | quem escreve a classe |
| r6-r5 HIGH 2 | forma do container (`ast.Dict`) | quem escreve a chamada |
| r6-r6 HIGH | nome curto do arquivo (`Path.stem`) | quem acrescenta o arquivo |

Em todos os três eu tinha escrito "exceção **estrutural**" no comentário. Nenhuma das
três era. **Uma exceção só é estrutural se a estrutura for identidade** — e identidade
é aquilo que quem introduz o código novo não pode escolher.

### 28.2. Duas identidades, nenhum atalho

**Identidade completa do módulo**, relativa à raiz governada, por uma única função
`module_identity(raiz, caminho)`:

```
creditum_hermes_reasoning/probe.py        → creditum_hermes_reasoning.probe
creditum_hermes_reasoning/a/probe.py      → creditum_hermes_reasoning.a.probe
creditum_hermes_reasoning/a/b/c/probe.py  → creditum_hermes_reasoning.a.b.c.probe
creditum_hermes_reasoning/__init__.py     → creditum_hermes_reasoning
creditum_hermes_reasoning/a/__init__.py   → creditum_hermes_reasoning.a
```

O prefixo vem do **nome da raiz varrida**, que é um fato do sistema de arquivos: quem
acrescenta um arquivo ao pacote não escolhe onde o pacote está. Um caminho que não seja
filho da raiz devolve `IDENTIDADE_INDETERMINADA`, que **não casa com exceção alguma** —
e há teste afirmando que nenhuma entrada da allowlist é igual a ela.

**Qualname lexical exato.** `visit_ClassDef` passou a empilhar, e `_onde()` devolve a
pilha inteira. Então:

- `serialize_safe_public_report` — a de topo, autorizada;
- `wrapper.serialize_safe_public_report` — não;
- `Algo.serialize_safe_public_report` — não.

**Não há atalho para nome curto.** Nenhum `se a identidade completa não casar, tenta o
basename`. Uma autoridade, uma chave.

`.stem` saiu inteiramente das decisões de confiança. `.name` continua em dois lugares,
os dois construindo identidade e não concedendo isenção: `raiz.name` monta o prefixo, e
`node.name` monta a pilha lexical.

### 28.3. Allowlist final — 7 entradas

| identidade do módulo | qualname | regra isenta | por quê |
|---|---|---|---|
| `…reasoning.runtime` | `safe_type_name` | OH001/002/004 | lê o nome do tipo para VALIDÁ-LO |
| `…reasoning.runtime` | `safe_exception_type` | OH001/002/004 | idem, política ASCII ancorada |
| `…reasoning.session` | `governed_uuid_text` | OH001 | confere `type(v) is uuid.UUID` antes |
| `…reasoning.probe` | `serialize_safe_public_report` | OH007 | única fronteira de saída pública |
| `…reasoning.codex` | `governed_user_payload` | OH007 | canonicaliza para hash, não é saída |
| `…reasoning.codex` | `request_fingerprint` | OH007 | idem |
| `…reasoning.contract` | `_material` | OH007 | idem |

### 28.4. Mutações

**Portão/fronteira: 15 executadas, 15 mortas** (eram 9; +6 de identidade).

`I1` é a mutação exata do achado — restaura `Path.stem` — e morre com 12 falhas. `I2`
truncando para o basename final morre com 18. `I3` autorizando só por nome de função,
8. `I4` colapsando a pilha lexical, 3. `I5` tirando a classe da pilha, 1. `I6` dando
identidade governada a arquivo de fora, 2.

`G4` nasceu **mal apontada** — eu havia refatorado o alvo dela para `_autorizado()`.
A guarda de alvo-existe falhou a bancada em vez de contá-la como morta, que é para isso
que ela existe. Reapontada.

E o bypass foi plantado no **pacote real**: `anything/probe.py` com
`serialize_safe_public_report` chamando `json.dumps(binding)` → `npm run verify` exit 1
na primeira etapa, zero etapas seguintes. Removido depois.

### 28.5. Verificação

`npm run verify` (intelligence) — **exit 0**. 9 módulos · 13 contratos íntegros, 3
retirados ausentes, 13 compilam, 12 fixtures · 2725 TS · **348 Python** (eram 335) ·
lint 0 · typecheck 0.

**Bytes de runtime idênticos ao R6-R5** nos 11 arquivos de produção, e nenhum arquivo
novo no pacote. Esta fase mexeu em ferramenta de build, testes, bancada e documentação
— não no runtime.

Congelados conferidos pelo cálculo governado com separação de domínio.

---

## 29. c6 — a política governada de extração de `Response.output`

A 3.1d-c5 mediu a superfície de tipos do SDK em produção. Ela **não** mediu a forma
que o modelo devolve — nenhuma chamada foi feita, e continua sem ser. A política
precisa estar correta sob todas as formas plausíveis, não sob a que eu supor.

### 29.1. As decisões A–E, e por que cada uma

**A. `reasoning`: reconhecido, opaco, nunca lido.**
`gpt-5.6-luna` é modelo de raciocínio. Se a resposta vier `[reasoning, message]`, a
política anterior — `KNOWN_OUTPUT_ITEM_TYPES = ("message",)` — recusaria **toda
resposta válida**. Recusar tornaria LIVE inalcançável; ler cadeia de pensamento
traria para dentro exatamente o que não foi governado. Admitir-sem-ler é a única
opção que não escolhe entre quebrar e vazar.

**B. `refusal`: `MODEL_REFUSED`, desfecho controlado.**
Uma recusa não é ambígua — é determinada. E o **texto** dela não atravessa: o campo
`refusal` nem é dereferenciado, porque a identidade da classe já identificou o
desfecho e tocar o payload só criaria a chance de vazá-lo.

**C. `compaction`: idêntico a reasoning.** É gestão de contexto, não conteúdo.

**D. `incomplete_details` e status da mensagem: conferidos, fechado.**
O docstring antigo dizia *"texto presente não é sucesso"* — e então não olhava o campo
que diz se o texto está completo. Um `Response` concluído não desculpa uma mensagem
não concluída.

**E. Exatamente uma mensagem, exatamente um bloco.** Dois blocos são duas respostas.

### 29.2. Identidade, não forma — a quarta vez

`type(item) is types.reasoning_item`. Nunca `isinstance`, nunca o campo `type` como
autoridade primária. O campo `type` é um dado **dentro** do objeto: quem constrói o
objeto escolhe o valor. A classe é o que o SDK selado construiu.

As duas são conferidas, e a classe primeiro. As rodadas r6-r5 e r6-r6 pagaram três
vezes por autorizar pelo nome em vez da identidade; esta é a quarta aplicação da
mesma lição, agora antes de o Codex ter de apontá-la.

E os tipos são **selados**: `GovernedResponseTypes` tem sentinela do módulo comparada
por identidade, `resolve_production_governed_response_types()` não aceita argumento, e
`TrustedResponseType` passado pelo chamador não existe como API. Um chamador que
pudesse emitir os tipos escolheria o que é aprovado.

### 29.3. Opacidade MEDIDA, não prometida

"Reasoning é ignorado" é afirmação verificável. As classes sintéticas de reasoning e
compaction têm `id`, `summary`, `content`, `encrypted_content`, `status` e `type` como
propriedades que **estouram** ao serem lidas. Se a extração tocar qualquer uma, o teste
cai — e há um controle provando que o veneno funciona, senão B1–B3 passariam sem provar
nada.

Um teste que só verificasse "o texto final não mudou" passaria mesmo com uma
implementação que lesse o reasoning e descartasse. A próxima versão poderia deixar de
descartar.

### 29.4. Precedência determinística

Doze etapas, ordem fixa, um código por condição. A **mesma** resposta malformada
devolve **sempre** o mesmo defeito — deixar a iteração escolher o veredito faria dois
operadores lerem duas causas para o mesmo fato.

Detalhe que decide um caso: a **contagem de blocos vem antes** da classificação da
recusa. `[output_text, refusal]` é ambiguidade estrutural, não recusa; chamá-la de
`MODEL_REFUSED` esconderia duas respostas atrás de um desfecho limpo.

### 29.5. `Response.output_text` — proibido por medida, não por precaução

A 3.1d-c5 observou o que ele faz: percorre todos os itens, junta só `output_text`,
concatena, e apaga fronteiras de mensagem, recusas, reasoning e ferramentas. Uma string
plausível saindo de agregação destrutiva passa por texto de modelo e não é.

Dois testes independentes: um por AST no corpo do extrator, outro dinâmico com uma
propriedade `output_text` que **estoura** se acessada. Ambos morrem quando a extração
é trocada por `response.output_text` — as duas camadas são medidas separadamente.

### 29.6. O que eu errei nesta fase

**Três testes meus nasceram vazios ou errados**, e os três eram da mesma família:

`test_F3` escaneava a fonte por `.output_text` e reprovava `types.output_text` — o
acesso **legítimo** ao carrier selado. Reescrito por AST.

`test_F5` afirmava `"str(response)" not in fonte` e caiu no instante em que eu escrevi
a prosa que explica a proibição. O teste do r3 já resolvia isso cortando a docstring;
eu reescrevi o mesmo defeito num arquivo novo. Corrigido com o mesmo corte, mais um
controle positivo exigindo que a prosa **nomeie** o que proíbe.

`test_output_text_NAO_e_fronteira_aprovada` no r6 escaneava texto cru e passou a
reprovar o código correto. Reescrito por AST sobre todos os módulos de produção.

O padrão: **escanear texto onde a pergunta é estrutural.** O portão r6-r4 já tinha
aprendido isso; eu não transferi a lição para os testes.

### 29.7. Mutações

**16 executadas, 16 mortas, zero defeitos de bancada.** Cada uma reverte uma decisão:
compaction/reasoning contribuindo texto, reasoning/compaction sendo lidos, extração por
`output_text`, status da mensagem, `incomplete_details`, recusa de volta a
`RESULT_AMBIGUOUS`, admissão de um tipo de ferramenta, coerção `str()`, `isinstance` em
dois lugares, texto vazio aceito, `strip()` no texto, tipos selados dispensados, e a
ordem contagem-antes-de-recusa invertida.

`C5` (extração por `output_text`) mata 50 testes. `C9` (um tipo de ferramenta admitido)
mata 1 — e é o suficiente: um teste que morre é um teste que observa.

### 29.8. Verificação

`npm run verify` — **exit 0**. 9 módulos limpos · 13 contratos íntegros, 3 retirados
ausentes, 13 compilam, 12 fixtures · 2725 TS · **388 Python** (eram 348) · lint 0 ·
typecheck 0.

Baterias anteriores sem regressão: dinâmicas r6-r4 10/10, portão r6-r6 15/15.

PRECALL: 0 cliente, 0 create, 0 provedor, 0 modelo, 0 rede. LIVE:
`LIVE_RESPONSE_POLICY_NOT_APPROVED`, issuer de produção ausente.

Congelados conferidos pelo cálculo governado. Produção permanece em
`/data/creditum_hermes_runtime/r6_r6` — nenhum deploy de C6 antes do SHIP do Codex.

---

## 30. c6-r1 — procedência de versão do SDK para os tipos de resposta

O regate do Codex para a C6 **não produziu veredito**: foi interrompido pelo provedor
com `This content was flagged for possible cybersecurity risk`. Não houve SHIP e não
houve BLOCK técnico.

Mas antes de cair ele nomeou uma coisa concreta, e ela estava certa:

> `resolve_production_governed_response_types()` declara autoridade 2.24.0 mas não
> confere a versão do SDK instalado.

### 30.1. Declarar não é observar

A C6 importava os seis módulos e selava as classes. A versão `2.24.0` aparecia no
manifesto, no nome da política e na constante — **declarada em três lugares e observada
em nenhum**. Um ambiente com outra versão do `openai` resolveria classes de mesmo nome
e receberia autoridade confiável.

Era o mesmo defeito das rodadas r6-r5 e r6-r6 num quinto eixo: eu confiei num **nome**
(a constante que diz "2.24.0") em vez de num **fato** (o que o SDK carregado responde).

### 30.2. Uma verdade, não duas

A comparação de versão já existia — inline dentro de `verify_sdk_surface`. Criar uma
segunda no resolvedor de tipos seria criar **duas definições de "SDK aprovado"**, que
divergem no dia em que uma for endurecida.

A comparação saiu para `sdk_version_is_approved()`, única no pacote, e há teste por AST
afirmando que existe exatamente **uma** comparação contra `EXPECTED_SDK_VERSION` em
todos os módulos de produção. Cada fronteira levanta o SEU defeito —
`SDK_SURFACE_INCOMPATIBLE` na superfície, `SDK_VERSION_NOT_APPROVED` nos tipos — mas
nenhuma decide sozinha o que é aprovado.

Igualdade **exata**, e `type(observada) is str`: `2.24.1` pode mover uma classe de
módulo mantendo o nome, e uma subclasse de `str` com `__eq__` próprio responderia o que
quisesse à comparação.

### 30.3. As classes vêm do módulo cuja versão foi provada

Conferir a versão de um `openai` e depois aceitar classes de outro módulo de mesmo nome
seria provar uma coisa e usar outra. As classes passaram a ser alcançadas por
**travessia de atributo a partir do objeto de módulo verificado**, e cada uma confere o
próprio `__module__`.

Versão certa com classe ausente: recusa. Versão certa com classe definida em outro
módulo: recusa. **Igualdade de versão não substitui procedência de classe.**

### 30.4. Como isto foi testado, e o que a técnica implica

A máquina não tem o `openai`. Os testes injetam um pacote sintético em `sys.modules`.
Isso **não** é costura de produção: o resolvedor continua com zero parâmetros e nada
foi acrescentado à API pública.

E vale dizer o que a técnica implica: quem escreve em `sys.modules` já executa Python
arbitrário no processo. A fronteira de ameaça declarada desde a r5 é a **API pública
governada**, não resistência a código arbitrário in-process. O que os testes provam é
que a API pública não aceita SDK de versão errada nem classe de fora do pacote
verificado.

### 30.5. Duas mutações sobreviveram — e as duas eram lacunas minhas

**V4** (`isinstance` no lugar de `type(...) is str`) sobreviveu porque `G4` só usava
não-strings. Eu tinha verificado a subclasse de `str` no smoke test interativo e
**nunca a escrevi como teste**. Verificar não é medir.

**V7** (`import_module` no lugar da travessia) sobreviveu porque o SDK sintético ligava
`sys.modules` e a árvore de atributos ao **mesmo objeto** — o fixture não alcançava a
condição que dizia medir. Décima segunda ocorrência da família. O teste novo faz os
dois caminhos **divergirem**: `sys.modules` aponta para um módulo hostil, a árvore
continua no legítimo, e a asserção é sobre qual classe foi selada.

Depois: **23 mutações C6/C6-R1, 23 mortas, zero defeitos de bancada.**

### 30.6. O que NÃO mudou

`RESPONSE_POLICY_NOT_APPROVED` permanece — é barreira intencional, não defeito. A
segunda observação do Codex ("o executor recusa qualquer política diferente da
sintética") descreve o comportamento pretendido, e há teste afirmando que **existir a
C6 no repositório não ativa LIVE**.

Semântica de extração intacta: reasoning e compaction opacos, recusa em
`MODEL_REFUSED`, `output_text` proibido, exatamente uma mensagem e um bloco.

`npm run verify` exit 0 · 2725 TS · **402 Python** (eram 388) · lint 0 · typecheck 0.
Produção permanece em `/data/creditum_hermes_runtime/r6_r6`.

---

## 31. d1 — o envelope de segurança da primeira chamada viva

Dois blockers restavam para LIVE: emissor de autorização e política de execução
limitada. A fase os fechou como **um envelope só** — e a razão é a frase que a define:
*não existe "LIVE autorizado com política de timeout opcional"*.

### 31.1. Três fatos observados antes de qualquer código

A fase mandou parar em vez de presumir, e as paradas produziram três achados.

**Os contratos canônicos sustentam.** `ApprovalRequestV1` já tinha o padrão de que a
D1 precisava, criado por um gate anterior pelo mesmo motivo: *"Stefano aprova UMA
divulgação, não um identificador."* `subject_type: "OTHER"` + `subject_ref` +
`subject_content_hash` representa a aprovação de uma execução exata. **Nenhuma mudança
de schema.**

**A superfície do SDK era inobservável daqui.** O `openai` não está instalado nesta
máquina. A sonda somente-leitura rodou em produção e devolveu os fatos —
`max_retries=2` por padrão, `create` sem `max_retries`, `DEFAULT_TIMEOUT` com
`read=600`, e `background` como `Optional[bool] | Omit`.

**A autoridade de decisão vive no TypeScript.** `resolveEffectiveDecision` — cadeia de
supersessão, bifurcação, raízes múltiplas, decisor não autorizado. O Python não
consegue reusá-la, só reimplementá-la, e reimplementar criaria uma segunda definição
de "aprovação efetiva". Stefano arbitrou: **arquitetura (c)**, TypeScript como
autoridade única, Python como trabalhador subordinado, sem token atravessando.

### 31.2. Duas leituras da sonda que contrariam a expectativa

**O cancelamento remoto existe e é inalcançável.** `Responses.cancel(response_id)` está
lá. Mas o `response_id` só existe se houve objeto de resposta — e numa chamada
síncrona, não-background, que estoura o prazo localmente, ele nunca chega. A API
existe e não serve.

Dito sem conflação, como a fase exigiu: **prazo local sim, cancelamento remoto não.**
O servidor continua computando. Tolerável em V1 só porque `tools=[]`, sem background,
sem stream, sem retry, e resultado tardio é descartado.

**Os timeouts do httpx são por FASE, não totais.** `Timeout(connect, read, write,
pool)`. `Timeout(180)` põe 180 em cada uma; o pior caso soma acima de 180. O limite
**total** não sai do SDK — ele é do orquestrador TypeScript, por relógio monotônico,
com descarte. O SDK dá limite de transporte; o orçamento é da Creditum.

### 31.3. Não havia lugar para os limites que não tocasse um contrato embarcado

`enforce_final_request` exige exatamente 5 chaves; `to_client_kwargs()` era fechado em
duas. Nenhum dos dois admitia `timeout`, `background` ou `max_retries`.

Isso não era defeito: era a consequência correta de ter fechado os dois vocabulários.
A D1 estende um e outro, **deliberadamente**, com um dono por valor:

| vocabulário | conteúdo | por quê |
|---|---|---|
| `REQUEST_FIELDS` | 5, **intocado** | é o pedido semântico, e é o que o fingerprint aprovado compromete |
| `CREATE_EXECUTION_CONTROL_FIELDS` | `background`, `timeout` | modo e limite da execução |
| kwargs do cliente | `+ max_retries` | `create` não aceita retry; só existe na construção |

`timeout` **não** entra no pedido semântico: ele é dinâmico, e um fingerprint que muda
a cada milissegundo não compromete com nada. Stefano aprova o **algoritmo limitado** —
180 s e a regra de derivação, versionada — não uma leitura futura de relógio.

`background=False` é explícito, nunca omitido. `Omit` significa default do servidor,
que não observamos. Mesma decisão de `tools=[]`: **zero explícito, não omissão.**

### 31.4. A capacidade não é forjável, e não atravessa

`LiveExecutionAuthorization` é local ao processo, selada por símbolo do módulo, de uso
único, e `toJSON()` **recusa**. Um JSON com os mesmos campos não é uma autorização — é
a descrição de uma.

`instanceof` sozinho não bastava: `Object.create(prototype)` produz um objeto que passa
no teste sem ter passado pelo construtor. Um `WeakSet` das emissões reais responde a
pergunta certa — *este objeto foi emitido aqui?*

Consumo de uso único por teste-e-atribuição síncrono. Dito com precisão: **não é um
mutex** — é a garantia do modelo de execução do JavaScript, que não preempta dentro de
uma função síncrona. Trinta e duas tentativas concorrentes, um vencedor.

### 31.5. Uma autoridade, dois consumidores

O emissor D1 chama `resolveEffectiveDecision` e `decisionAuthorizes` — as **mesmas**
funções que `authorizeSharedBriefing` chama. Não houve extração nem cópia: o avaliador
reutilizável já existia. A mutação que o troca por uma checagem local simplificada
morre.

E o Python não tem noção nenhuma de aprovação humana: varredura por AST do corpo
executável de todos os módulos de produção, com fronteira de palavra.

### 31.6. Mutações

**27 executadas, 27 mortas, zero defeitos de bancada** — 12 de autoridade, 4 de
cliente, 11 de create e prazo.

**Duas sobreviveram na primeira medição, e as duas eram lacunas minhas.** `A12`
(relógio de parede no lugar do monotônico) porque nada observava a monotonia — a
aritmética é idêntica. `C11` (união final não conferida) porque eu testava a função
direto e nada afirmava que o executor a chama.

Baterias anteriores sem regressão: c6 23/23, dinâmicas r6-r4 10/10, portão r6-r6 15/15.

### 31.7. Quatro vezes o mesmo erro meu

Escanear **texto** onde a pergunta é **estrutural**: `--live` acusado numa docstring
que documenta a ausência; `ApprovalRequest` acusado dentro de `McpApprovalRequest`;
filtro de comentário por prefixo de linha que não pega `/** … */` numa linha; e a
correção `\bApprovalRequest\b` errada nos dois sentidos, porque também não casava
`ApprovalRequestV1` — o nome canônico que se quer barrar. **O controle positivo pegou
essa.**

A c6 já tinha aprendido a lição no portão. Eu não a transferi para os testes.

### 31.8. Verificação

`npm run verify` — **exit 0**. 9 módulos limpos · 13 contratos íntegros, 3 retirados
ausentes, 13 compilam, 12 fixtures · **2779 TS** (eram 2725) · **429 Python** (eram
402) · lint 0 · typecheck 0.

`RESPONSE_POLICY_NOT_APPROVED` preservado. Existir a D1 no repositório **não** ativa
LIVE. Produção permanece em `/data/creditum_hermes_runtime/r6_r6`.

### 31.9. d1-r1 — identidade entre a spec selada e o fingerprint aprovado

O regate do Codex parou por falta de crédito antes de emitir veredito. **Não houve
exploit reproduzido.** Houve uma linha de investigação, e ela estava certa:

> o selo prova a origem do objeto, mas o estado interno segue mutável; validar se isso
> permite consumo duplo e se a spec aprovada pode divergir da armazenada.

**Consumo duplo: nada reproduzido, desenho preservado.** `private` desaparece na
compilação, mas `EMITIDAS` e `_consumeOnce(SELO)` exigem o símbolo do módulo, que não
é exportado. A fronteira de ameaça segue sendo a API governada — não JavaScript hostil
já executando dentro do processo confiável.

**Divergência spec/fingerprint: era real, e fechou.** A d1 fazia
`liveExecutionFingerprint(spec_do_chamador)` e só depois o construtor fazia
`Object.freeze({ ...spec })` — uma cópia **independente**. Com campos primitivos os
dois coincidem, mas por propriedade **acidental da forma atual**, não por construção.

E quebrava **hoje**, sem campo novo: um `get model()` que devolve um valor na leitura
do fingerprint e outro na leitura da cópia produz autorização cujo hash aprovado não
descreve a spec selada. É o TOCTOU clássico de "validar o objeto do chamador".

Com precisão sobre o que foi medido, porque a primeira redação disse mais do que a
medição sustenta: **uma mutação que restaura o fingerprint-antes-da-propriedade,
combinada ao teste de getter multi-leitura, demonstra a divergência aprovado/armazenado.**
A versão histórica completa da d1 não foi reexecutada diretamente, e o Codex **não**
reproduziu o exploit — ele apontou a direção antes de o crédito acabar.

A ordem agora é única:

```
ownedSpec = toOwnedLiveExecutionSpec(raw)   // chaves fechadas; UMA leitura por campo
valida(ownedSpec) · politicaExata(ownedSpec)
fingerprint = liveExecutionFingerprint(ownedSpec)
request.subject_ref          == ownedSpec.execution_id
request.subject_content_hash == fingerprint
seal(ownedSpec, fingerprint) // MESMA referência; o construtor re-deriva e confere
```

`deepFreeze`, não `Object.freeze` raso: a imutabilidade não pode depender de todos os
campos continuarem primitivos. Chave desconhecida é `SPEC_NOT_OWNED_SNAPSHOT`, nunca
campo ignorado em silêncio — a disciplina de `canonicoProprio`, com uma diferença: a
estrutura é validada no objeto submetido, os **valores** no instantâneo.

**Mutações: R1-1 e R1-4 mortas.** As duas são o furo real, e as duas morrem pelo teste
do getter instável.

**R1-2 e R1-3 continuam VIVAS por serem inalcançáveis, com razão SEPARADA para cada:**

| caso | ponto mutado | por que o caminho governado não o alcança |
|---|---|---|
| R1-2 | `PROPRIAS.has(spec)` sobre o **argumento** | só quem já possui o `SELO` entrega argumento não-próprio, e o `SELO` não é exportado |
| R1-3 | re-derivação `fingerprint(spec) !== fingerprint` | par incoerente exige construir direto, o que também exige o `SELO` |

A bancada as classifica como **guarda inalcançável, esperada VIVA**: se alguma morrer,
ela era alcançável, e isso é notícia.

### 31.10. d1-r2 — a classificação de R1-5 estava errada

O regate adversarial do Codex completou e devolveu **BLOCK**, com um achado material de
severidade alta, e ele estava certo.

A r1 pôs **R1-5** no mesmo grupo de R1-2 e R1-3. Não pertence ali. R1-5 muta
`this.spec = spec` — uma linha que executa em **toda emissão bem-sucedida** pelo
emissor exportado. É **alcançável**, e portanto kill-required. O efeito de classificá-la
errado é pior do que uma mutação viva: o invariante "nenhuma representação posterior"
ficou **sem proteção de regressão**, e o relatório afirmava o contrário. O
`29 mortas / 3 inalcançáveis` era inválido como afirmação.

**Erro meu, e é o mesmo de sempre numa forma nova.** Agrupei três casos pelo **sintoma
observado** — sobreviveram — em vez de pela **causa estrutural**. A c6 me cobrou isso em
varredura de texto contra estrutura; aqui foi em classificação de mutação. A bancada
agora exige razão estrutural documentada **por caso**, nunca por grupo.

A r2 adiciona o invariante que faltava, sem exportar o selo e sem costura de teste:

```ts
this.spec = spec
if (!PROPRIAS.has(this.spec)) throw new Error("LIVE_AUTHORIZATION_SPEC_NOT_OWNED")
```

A conferência anterior olhava o **argumento**; esta olha o que ficou **armazenado**. Um
clone introduzido depois da atribuição perde a identidade própria e é recusado pelo
caminho normal do emissor. **R1-5: MORTA.**

**32 mutações · 30 mortas · 2 guardas inalcançáveis · 0 sobreviventes alcançáveis · 0
defeitos de bancada.** `npm run verify` exit 0 · 2789 TS · 429 Python · lint 0 ·
typecheck 0. Python de produção inalterado; artefato byte-idêntico.

**Erro meu, de novo o mesmo.** A primeira versão do teste do getter aceitava *os dois*
desfechos — "ou autoriza, ou recusa". Um teste que aceita qualquer resultado não mede
nada, e as cinco mutações sobreviveram à primeira medição. Exigir desfecho único, mais
`leituras === 1`, matou as duas alcançáveis.

A r1 é endurecimento da autoridade TypeScript; o Python de produção não muda.

---

## 32. d2b — o livro-razão da tentativa única

A d2a fechou a topologia: o Hermes roda isolado num Linux da Hostinger, com Node
v22.23.2 e Python 3.13.15 em `/opt/venv/bin/python3`, e o Node consegue fazer `spawn`
naquele Python exato. Arquitetura escolhida: **supervisor TypeScript da Creditum no
mesmo host → processo filho Python privado**.

A d2b **não** faz esse `spawn`. Ela fecha quatro coisas antes: semântica global de
tentativa única, livro-razão persistente, capacidade local ao processo, e semântica de
queda.

### 32.1. Duas perguntas, duas autoridades

A d1 responde *"Stefano autorizou canonicamente ESTA execução?"*. O livro-razão
responde *"este `execution_id` já cruzou a fronteira global de tentativa única?"*.

Confundi-las seria o defeito. O livro-razão **nunca** avalia `ApprovalRequestV1`,
`DecisionRecordV1`, `resolveEffectiveDecision` nem `decisionAuthorizes`. Ele não sabe o
que é aprovação humana — guarda identificadores, hashes, estados fechados e carimbos.

### 32.2. Sistema de arquivos, e por quê

A primitiva governante exigida é UMA: reserva atômica e exclusiva por `execution_id`,
válida entre processos. `mkdir` **sem** `recursive` é exatamente isso — o SO garante um
único vencedor e devolve `EEXIST` aos demais.

SQLite, Redis, fila ou serviço remoto trariam dependência nova e uma segunda fonte de
verdade para uma pergunta que a chamada de sistema já responde. O `state.db` do Hermes
está fora por outra razão: não é nosso.

`recursive: true` seria o erro silencioso — ele torna `mkdir` idempotente e **não falha**
quando o diretório existe, apagando justamente o sinal de que outro processo reservou.

### 32.3. Consumir antes de reservar

```
(A) inicio = monotonicSeconds()          ← orçamento começa aqui
(B) consumeLiveExecutionAuthorization()  ← SÍNCRONO, nenhum await acima
(C) await reserveExecutionAttempt()      ← primeiro await do fluxo
(D) new ReservedExecutionAttempt(...)    ← só depois da reserva durável
```

A ordem é a segurança. Um objeto de mesma forma, ou uma autorização expirada, **não
pode queimar `execution_id`** no livro-razão persistente. Reservar primeiro deixaria um
atacante gastar identificadores sem nunca ter tido autorização.

A janela que isso cria: se o processo morrer entre (B) e (C), a autoridade d1 morre com
ele. **Não viola "uma tentativa real"** — não houve worker, provedor nem modelo. Falha
fechada, e se algum artefato sobreviveu, o id está queimado.

O orçamento de 180 s começa em (A). A IO do livro-razão consome o **mesmo** prazo; ela
não ganha 180 s novos depois de terminar. Relógio de parede é auditoria, nunca
autoridade.

### 32.4. Diretório existente é sempre queimado

Registro ausente, parcial, malformado, processo morto no meio: nada devolve "livre".
Interpretar corrupção como disponibilidade transformaria falha em segunda tentativa.

Não existe `deleteReservation`, `unreserve`, `reset`, `retry`, `release`, nem limpeza por
TTL. Nenhuma expiração por idade — um carimbo de 2019 continua queimando o id. Nova
tentativa exige `execution_id` NOVO e aprovação NOVA.

Estado é **derivado** da existência de registros imutáveis: `UNSEEN → RESERVED →
ATTEMPT_COMMITTED → TERMINAL`, mais `MALFORMED`. Nenhum `state.json` reescrito.
`ATTEMPT_COMMITTED` em vez de `STARTED` porque "started" alegaria que existe um filho no
SO, e entre a decisão e o `spawn` há uma janela: commit é o que sabemos.

### 32.5. Nada volta do disco

Não existe `loadReservedExecutionAttempt`, `restoreAttempt` nem `deserializeAttempt`.
Depois do reinício, toda capacidade em memória se foi para sempre. `toJSON()` recusa.
**Estado serializado é auditoria, nunca capacidade.**

### 32.6. Mutações — 14 de 16 mortas, e as duas que não morreram

**B4** (apagar a reserva após falha de durabilidade) e **B6** (criar a capacidade antes
da reserva durável) **sobreviveram**, pela MESMA causa: ambas só se observam no ramo de
**falha de durabilidade**, e eu não consigo produzi-lo deterministicamente num teste.

Medido, não suposto: com o diretório pai somente-leitura, o `mkdir` falha com `EACCES` e
o fluxo vira `EXECUTION_LEDGER_UNAVAILABLE` — nunca `EXECUTION_RESERVATION_NOT_DURABLE`.
O ramo exige disco cheio, `EIO` ou mudança de permissão no meio da chamada.

**Isso não é inalcançabilidade estrutural.** O ramo é alcançável em produção. É um
limite de observabilidade do teste, e a distinção é exatamente a que o regate da r2
cobrou: classificar por causa, não por sintoma. Registrado como **sobrevivente
alcançável**, não como guarda.

A remediação mínima seria um gancho de injeção de falha — mas ele viveria em código de
produção, e abrir costura de produção para a bancada foi recusado antes. Fica como
decisão do gate, não minha.

`npm run verify` exit 0 · 2815 TS (eram 2789) · 429 Python · lint 0 · typecheck 0.
Gates congelados intactos: d1 30/32+2, c6 23/23, r6 10/10 e 15/15. Python de produção
inalterado; artefato byte-idêntico. **Nenhum livro-razão criado em `/data`** — provisionar
a raiz de produção é fase posterior. Não existe LIVE depois da d2b.

### 32.7. d2b-r1 — a fronteira de durabilidade, fechada

A d2b entregou B4 e B6 **vivas**, declaradas. Vale ser exato sobre o que aconteceu ali:
elas **não** foram chamadas de inalcançáveis. O que faltava era outra coisa — eu não
conseguia provocar a falha de durabilidade num teste, e disse isso com essa palavra:
lacuna de **testabilidade**, não de alcançabilidade.

Medido na época: com o diretório pai em `0o500` o `mkdir` falha antes, com `EACCES`, e o
fluxo vira `EXECUTION_LEDGER_UNAVAILABLE` — nunca `EXECUTION_RESERVATION_NOT_DURABLE`.

**A r1 fecha as duas sem gancho de falha em produção.**

**Injeção de falha só em teste.** `vi.mock` sobre `node:fs/promises`, vivendo apenas no
arquivo de teste: o `mkdir` real cria o diretório, e o `fsync` do registro falha com
`ENOSPC`. É exatamente o estado que a produção alcança com disco cheio ou `EIO`, e nada
no código de produção sabe que o teste existe. Sem `failureHook`, `testMode`, variável
de ambiente ou configuração.

**Uma correção de expectativa minha.** Eu esperava que o estado em disco ficasse
`MALFORMED`. Não fica: o `writeFile` completou e só o `fsync` falhou, então o registro
está legível e a classificação é `RESERVED`. Depois de um `ENOSPC` no `fsync` o dado pode
ou não estar persistido — e o que a fase exige não é adivinhar isso, é **nunca devolver
capacidade sem a garantia**. O teste afirma o invariante real: recusa, nenhuma
capacidade, diretório preservado, id queimado, segunda autorização recusada.

**O recibo de durabilidade.** A d2b garantia "reserva antes da capacidade" apenas pela
ORDEM das linhas. Ordem textual não é invariante — mover duas linhas a desfaz sem que
nada observe. Agora existe `DurableReservationReceipt`: local ao processo, selado por
símbolo do módulo, não serializável (`toJSON()` recusa), e **cunhado numa única linha do
livro-razão** — depois de criação atômica, registro completo, `fsync` do arquivo e
`fsync` do diretório. `ReservedExecutionAttempt` **exige** um recibo autêntico, conferido
pelo registro do módulo e coerente com o `execution_id` da spec própria da d1.

O recibo prova UMA coisa: a reserva cruzou a fronteira de durabilidade neste processo.
Não avalia aprovação, decisão nem Stefano — essa autoridade é da d1, e duplicá-la aqui
criaria uma segunda definição, mais fraca, de "aprovado". Não é reconstruível de arquivo
do livro-razão.

**Guarda estrutural por AST.** "O livro-razão de produção não contém mecanismo para
apagar uma reserva" é invariante de segurança, então virou teste. A varredura usa o
compilador do TypeScript e olha **nós de chamada** — `rm`, `rmdir`, `unlink`, `rename`,
`truncate` e variantes síncronas, escolhidos por semântica e não por banimento cego.
Comentário, string e nome de variável não são chamadas, então a prosa que documenta a
ausência não gera falso positivo. Tem controle positivo: fonte sintética com duas
chamadas reais e duas menções em prosa devolve **duas** detecções, não quatro.

Isso importa porque foi o quinto encontro com o mesmo erro. Ao conferir se a d2b tinha
`spawn`, o `grep` acusou três ocorrências — todas prosa dizendo que a d2b **não** faz
`spawn`. Por AST: zero chamadas.

**Mutações: 16 de 16 mortas.** B4 morre pelos dois mecanismos — o teste de durabilidade e
a guarda AST. B6 foi **reformulada**, não reclassificada: passou a mutar a fronteira nova
(capacidade construída antes da reserva, com recibo de mesma forma) e morre porque o
construtor exige recibo autêntico.

**B6b, mutação minha além das 16, sobrevive por ser inalcançável** — a exigência do
recibo no construtor só se atinge com o `SELO_TENTATIVA`, que não é exportado; pelo
caminho governado o supervisor sempre entrega o recibo real. Razão estrutural própria,
documentada, mesma causa da R1-2 da d1. Não a apaguei: apagar uma mutação porque ela
sobrevive é o instinto errado.

`npm run verify` exit 0 · **2822 TS** (eram 2815) · 429 Python · lint 0 · typecheck 0.
D1 **byte-idêntica** (`live-execution.ts` com o mesmo hash de antes da d2b) · d1 30/32+2 ·
c6 23/23 · r6 10/10 e 15/15. Python de produção inalterado; artefato byte-idêntico.
Nenhum `spawn`, nenhuma rede, nenhum `/data` criado. Não existe LIVE depois da d2b-r1.

### 32.8. d2b-r2 — a durabilidade que eu dizia ter, e não tinha

O regate adversarial do Codex completou e devolveu **BLOCK**, com dois achados
**críticos**. Os dois eram meus, e os dois estavam no mesmo módulo que eu havia acabado
de endurecer.

**Achado 1: eu escondia erro e chamava de portabilidade.** A r1 tinha isto:

```ts
await dir.sync().catch(() => undefined)   // "ausência de suporte não é falha"
```

O comentário alegava proteger plataforma sem suporte a `fsync` de diretório. O `.catch`
não distingue *plataforma não suporta* de *`ENOSPC` no `fsync`* — engolia os dois e
devolvia `"ok"`. O recibo de durabilidade era então cunhado, e a capacidade escapava sem
a garantia que ele existe para provar.

Medido agora, não suposto: `open(dir, "r")` + `sync()` **funciona** no alvo de produção
(Linux Debian, Node v22.23.2) e no darwin de desenvolvimento. Não havia plataforma a
proteger. Havia um erro sendo escondido, com uma justificativa que soava técnica.

**Achado 2: eu sincronizava o arquivo e esquecia o pai.** `fsync` no `reservation.json` e
no diretório que o contém — nunca na **entrada** desse diretório dentro de `attempts`,
nem em `attempts` dentro da raiz. O registro podia estar persistido enquanto a entrada
do diretório não estava; depois de uma queda de energia o diretório some do namespace
recuperado e o `execution_id` volta a estar livre. É exatamente a semântica de queima
entre reinícios que a fase existe para garantir.

A ironia é registrável: a §32.7 que escrevi diz que durabilidade não se infere de
"arquivo existe" nem de "escrita bem-sucedida". Apliquei a regra ao arquivo e a violei
no diretório.

**A cadeia agora é explícita, e cada elo falha fechado:**

```
raiz provisionada pelo deploy (validada, nunca fabricada)
  → mkdir attempts            → fsync RAIZ        ┐
  → mkdir <chave> (atômico)   → fsync attempts    ├ qualquer falha: NOT_DURABLE
  → reservation.json (wx)     → fsync arquivo     │  sem recibo, sem capacidade,
                              → fsync <chave>     ┘  sem rollback
  → DurableReservationReceipt
```

`sincronizaDiretorio` devolve `ok` ou `not_durable`. Sem "melhor esforço", sem
rebaixamento silencioso. O errno real fica dentro da função: para fora vai defeito
próprio, nunca objeto de exceção, caminho absoluto ou pilha.

**Mutações R2: DUR1–DUR4, todas mortas.** DUR1 engole a falha do sync; DUR2 omite o
`fsync` de `attempts`; DUR3 omite o da raiz; DUR4 volta a tratar falha como
plataforma-sem-suporte. Total: **21 mutações · 20 mortas · 1 guarda inalcançável (B6b) ·
0 sobreviventes alcançáveis · 0 defeitos de bancada.**

Cada injeção mira um `fsync` **identificado pelo caminho** — registro, diretório da
chave, `attempts`, raiz — então o teste prova que falhou o sync pretendido, e não "o
próximo que aparecesse". Há controle: com `attempts` já existente, a falha da raiz não
se aplica e a reserva conclui.

**Correção de uma afirmação minha.** O teste "multi-processo" da d2b usava `execFileSync`
em laço — os 8 processos rodavam **em série**. Eu o descrevi como corrida; não era.
Provava apenas que o segundo em diante recebia `EEXIST`. Agora são 8 filhos
independentes, todos iniciados antes de qualquer espera, bloqueados numa barreira em
disco até o pai liberar. A afirmação exata é **processos concorrentes com tempos de vida
sobrepostos disputando o mesmo `mkdir` atômico** — não partida simultânea no mesmo ciclo
de instrução, que nada em espaço de usuário garante.

**O que o Codex não pôde fazer.** O sandbox dele negou escrita temporária ao Vitest, de
novo. Ele **não rodou** as suítes nem a bancada: os dois achados vieram de leitura do
código, e a verificação por execução foi minha. `typecheck` e `lint` ele rodou.

`npm run verify` exit 0 · **2826 TS** · 429 Python · lint 0 · typecheck 0 · d1 30/32+2 ·
c6 23/23 · r6 10/10 e 15/15. D1 com o mesmo hash (`23a9c278…`), Python de produção
byte-idêntico, artefato inalterado, `/data` não criado.

**Uma limitação de prova que permanece.** `live-execution.ts` é **untracked** — as
alterações desta sequência nunca foram commitadas. A comparação de hash contra um valor
anotado nesta conversa é mais fraca do que prova de versionamento: o Git não pode atestar
identidade histórica de arquivo que ele não rastreia. Congelar isso em commit é decisão
posterior ao SHIP da d2b.

### 32.9. d2b-r3 — a lavagem da durabilidade do pai

O regate voltou com **BLOCK** e o achado #2 ainda **aberto**. A r2 tinha corrigido
metade, e a metade que faltou era o furo inteiro.

**O que eu tinha feito.** O `fsync` da raiz acontecia só quando *aquela* invocação havia
criado `attempts`:

```ts
if (criouPai && (await sincronizaDiretorio(ledgerRoot)) !== "ok") { ... }
```

**Como se lava.** Chamada A cria `attempts`, falha no `fsync` da raiz, recusa — e deixa
o diretório para trás, exatamente como a regra de não-limpeza manda. Chamada B, com
autorização d1 legítima nova, vê `attempts` existindo, entra com `criouPai = false`,
**pula o `fsync`**, completa a cadeia e emite recibo sobre uma entrada de diretório cuja
durabilidade nunca foi estabelecida. Uma queda de energia leva `attempts` e toda a
subárvore, e o `execution_id` volta ao pool **depois** de o recibo ter sido emitido.

O mesmo acontece em concorrência de primeiro uso, sem falha nenhuma: B enxerga o
`attempts` de A antes de o `fsync` de A concluir.

**O pior: meu próprio teste afirmava o defeito.** Eu havia escrito

```
it("com `attempts` já existente, a falha da raiz NÃO se aplica — e a reserva conclui")
expect(r.status).toBe("reserved")
```

e o chamei de *controle positivo*, dizendo que provava que a injeção mirava o `fsync`
pretendido. O que ele codificava era o bypass. Um teste que consagra o defeito é pior
que teste ausente: ausência não mente.

**O invariante correto não é sobre quem criou.** É: *antes de qualquer reserva
prosseguir, a entrada `attempts` tem de ter passado por um `fsync` da raiz bem-sucedido
NESTA invocação governada*. Existir no namespace vivo não prova durabilidade.

Então o `fsync` da raiz é **incondicional**, em toda invocação, e nenhum booleano o
controla. Troca-se um pouco de IO por um invariante simples que falha fechado. E nada de
marcador tipo `attempts.synced` ou `initialized.json`: um marcador desses precisaria, ele
próprio, da garantia que alega ter.

`EEXIST` passou a re-`stat` e exigir o tipo: `EEXIST` diz que **algo** ocupa o caminho,
não que seja o diretório esperado. Corrida com outro processo criando `attempts` é
benigna; arquivo ou link no lugar dele não é.

Falha no `fsync` da raiz agora impede a criação do diretório da chave — não se queima
estado mais fundo sobre um pré-requisito que não se cumpriu.

**DUR3 era estreita demais, e foi por isso que não pegou.** Ela mutava o ramo `criouPai`;
agora muta o invariante. Somam-se **LAUNDER1** (fsync só para o criador) e **EEXIST1**
(seguir sem revalidar o tipo). Alcançar o ramo `EEXIST` exige a janela real entre `stat`
e `mkdir` — o teste a reproduz escondendo `attempts` do primeiro `stat` enquanto um
arquivo ocupa o caminho.

**Defeito de bancada, corrigido.** O Codex notou que a bancada nunca rodava um **baseline
não-mutado na mesma cópia**. Qualquer quebra da cópia temporária — fixture faltando,
diretório temporário indisponível — seria lida como "MORTO", e a bancada declararia prova
onde houve acidente. A árvore de trabalho estar verde não diz nada sobre a cópia. Agora
cada mutação roda o baseline na sua própria cópia antes de mutar; baseline vermelho é
**defeito de bancada**, nunca kill.

**Correção de uma afirmação sobre o teste multiprocesso.** Ele é concorrente de verdade,
mas exercita `mkdir` **cru** — prova a primitiva atômica, não o protocolo completo de
reserva. A afirmação exata é essa. As regressões de lavagem sequencial e concorrente
cobrem o caminho completo no mesmo processo.

**23 mutações · 22 mortas · 1 guarda inalcançável (B6b) · 0 sobreviventes alcançáveis ·
0 defeitos de bancada.** `npm run verify` exit 0 · **2831 TS** · 429 Python · lint 0 ·
typecheck 0 · d1 30/32+2 · c6 23/23 · r6 10/10 e 15/15. D1 com o mesmo hash, Python de
produção byte-idêntico, artefato inalterado, `/data` não criado.

### 32.10. d2b-r4 — o link que a prosa proibia e o código aceitava

O regate devolveu **BLOCK** com dois achados. O crítico é a sexta vez nesta sequência
que escrevo texto correto e código que não o cumpre.

**O que eu havia escrito, no comentário do ramo `EEXIST`:**

> *"`EEXIST` diz que ALGO ocupa o caminho — não que seja o diretório esperado. Corrida
> com outro processo criando `attempts` é benigna; arquivo ou LINK no lugar dele não é."*

**E então validei com `stat`, que segue links.** Um `attempts` que seja symlink para um
diretório qualquer passa em `isDirectory()`, nas DUAS validações — a inicial e a de
`EEXIST`. A partir daí o `mkdir` da chave, a escrita e todos os `fsync` atravessam o
link, e o recibo é emitido para estado **fora da raiz fixa** — justamente a propriedade
que a raiz fixa existe para garantir.

As cinco vezes anteriores foram varredura de texto onde a pergunta era estrutural. Esta
foi prosa onde a pergunta era verificação. O padrão é o mesmo: eu descrevo a regra
corretamente e implemento outra coisa.

**A correção.** `lstat`, nunca `stat`, na raiz e em `attempts`. Link é recusado ANTES de
qualquer pergunta sobre o alvo — seguir o link e então aprovar o destino seria a mesma
falha com outro nome. A raiz é barrada por `lstat` antes de qualquer `realpath`:
resolver a raiz por um link e depois aprovar o destino transformaria a raiz fixa em raiz
sugerida.

Contenção canônica por caminho relativo exato, não `startsWith` — `/ledger/v1-evil`
compartilha prefixo com `/ledger/v1`. Tem de ser exatamente a string `attempts`.

O diretório da chave existente continua **queimado seja qual for o tipo**: não se segue,
não se repara, não se inspeciona através dele.

**Achado 2: minha LAUNDER1 era inválida.** Ela inseria `const criouPai = false`, o que
pulava o `fsync` em TODA invocação — comportamento idêntico ao da DUR3. A chamada A já
passava, o teste morria em A, e nunca se demonstrava que B recusa. Eu reportei 22 kills
tratando-a como prova de algo que ela não provava; aquela contagem era **inválida**.

A versão fiel rastreia a criação NESTA invocação e condiciona o `fsync` a ela. Medida a
causalidade, não presumida: sob o mutante, o teste que falha é exatamente *"A cria
`attempts` e falha na raiz; B NÃO lava a falha"*, com B devolvendo `reserved` onde
deveria recusar. É a lavagem histórica, reproduzida.

**CONTAIN1 sobrevive, e é inalcançável por construção.** Com `attempts` validado por
`lstat` como diretório real e derivado literalmente de `join(raiz, "attempts")`, o
`realpath` dos dois resolve pela mesma cadeia de ancestrais — a igualdade é consequência
da construção. Fazê-la falhar exigiria um diretório real fora da raiz ocupando aquele
nome, e o SO **recusa hardlink de diretório** (medido, não suposto). É a condição que o
próprio regate previu: contenção que protege estado já impedido estruturalmente.

**TOCTOU residual, declarado.** Entre o `lstat` e o `mkdir` existe uma janela. Fechá-la
exigiria operações relativas a descritor (`openat2` e afins), e isso só se justifica se
o modelo de ameaça incluir adversário de MESMA CREDENCIAL corrida a corrida com o
processo. Não inclui: a fronteira declarada desde a r5 é a **API governada**. Fica como
premissa residual explícita, não como lacuna silenciosa.

**Sétima vez, e a mutação foi quem me contou.** Depois de trocar `stat` por `lstat` no
código, meu mock de teste continuou interceptando só `stat`. Os dois testes que dizem
exercitar o ramo `EEXIST` passavam sem nunca alcançá-lo — barravam na validação inicial,
pelo motivo errado. Nada nos testes indicava isso; foi a **EEXIST1 sobreviver** que
denunciou. Mock corrigido para `lstat`, e a mutação morreu.

Vale registrar o que isso diz sobre o método: a suíte verde não detectou o defeito da
própria suíte. A bancada de mutação detectou.

**26 mutações · 24 mortas · 2 guardas inalcançáveis (B6b, CONTAIN1) · 0 sobreviventes
alcançáveis · 0 defeitos de bancada**, cada uma com baseline não-mutado na própria cópia.

**O que a d2d tem de verificar em produção:** quem pode escrever em
`/data/creditum_hermes_runtime/execution-ledger/v1`. O livro-razão não pode depender de
processos não relacionados terem permissão de mutá-lo. A r4 não altera permissão de
deploy — só registra o requisito.

### 32.11. d2b-r5 — o kill emprestado, e o que a atribuição causal encontrou

O regate confirmou o código de produção da r4 em tudo — raiz e `attempts` com `lstat`,
revalidação `EEXIST`, contenção exata, `fsync` incondicional. O BLOCK foi por
**evidência**, não por defeito de produção. E o achado é preciso:

**SYM1 mutava o helper COMPARTILHADO.** `diretorioRealNaoLink` valida a raiz *e* o
`attempts`. Sob a mutação, a raiz symlinkada passava a ser aceita, o teste da raiz
falhava, e a bancada lia "morto". Mas o teste do `attempts` symlink continuava recusando
por outro motivo: o `stat` seguia o link, e era a **contenção canônica** que barrava o
`realpath` externo. Kill emprestado da proteção vizinha — SYM1 nunca provou o invariante
que declara.

Vale notar a ironia: a CONTAIN1, que classifiquei como defesa em profundidade
inalcançável, era exatamente quem mascarava. "Inalcançável pelo caminho governado" e
"irrelevante para a bancada" são coisas diferentes, e eu tratei como se fossem a mesma.

**Duas correções.** Um envelope fino `attemptsRealNaoLink` — semanticamente idêntico,
porque a regra de segurança é UMA — dá à bancada um alvo que atinge só o `attempts`. E os
testes passaram a afirmar **onde** a recusa acontece: registro das chamadas de
`realpath`, `mkdir` e `open` prova que nada abaixo do `lstat` foi alcançado. Sem isso, o
desfecho "recusou" não distingue qual proteção agiu.

**O defeito estrutural da bancada, fechado.** Ela tratava QUALQUER saída não-zero como
kill. Foi assim que a LAUNDER1 inválida passou na r3 e a SYM1 na r4. Agora cada mutação
declara o teste que deve falhar, e kill exige três coisas: baseline daquele teste verde
**naquela cópia**, alvo efetivamente mudado, e o **mesmo** teste falhando sob a mutação.
Categorias explícitas: `KILLED_CAUSALLY`, `SURVIVED`, `STRUCTURALLY_UNREACHABLE`,
`HARNESS_DEFECT`, `INVALID_MUTATION`, `ENVIRONMENT_FAILURE`. Nenhuma colapsa em kill.

**A primeira execução da bancada causal encontrou cinco problemas meus** que a versão
anterior escondia — e nenhum era de produção:

| # | problema | causa |
|---|---|---|
| 1 | DUR2 sem baseline | padrão `-t` com `(pai)`: parêntese é metacaractere, casava zero testes |
| 2 | LAUNDER1 alvo ausente | alvo gerado antes do envelope; o código mudou |
| 3 | EEXIST1 alvo ausente | idem |
| 4 | **B1 SOBREVIVEU** | eu apontava o teste de `mkdir` CRU, que não carrega o módulo do livro-razão |
| 5 | **B3 SOBREVIVEU** | eu apontava o teste de reserva MALFORMADA, onde o `readFile` SUCEDE e a mutação não muda nada; quem pega é o de diretório SEM registro |

Os itens 4 e 5 são atribuições **genuinamente erradas** — mutações que eu vinha contando
como prova de invariantes que elas não exercitavam. Nenhuma suíte verde teria revelado
isso.

**26 mutações · 24 mortas CAUSALMENTE · 2 guardas inalcançáveis (B6b, CONTAIN1, cada uma
com razão própria) · 0 sobreviventes alcançáveis · 0 mutações inválidas · 0 defeitos de
bancada · 0 falhas de ambiente.**

`npm run verify` exit 0 · 2836 TS · 429 Python · lint 0 · typecheck 0 · d1 30/32+2 ·
c6 23/23 · r6 10/10 e 15/15. D1 com o mesmo hash, Python de produção byte-idêntico,
artefato inalterado, `/data` não criado.

### 32.12. d2b-r7 — as oito inválidas, uma a uma

A r6 devolveu **BLOCKED** por decisão própria: o oráculo de estado inseguro expôs
**oito** mutações que nunca demonstraram a propriedade que declaravam. Isso significa,
dito sem atenuar, que a contagem da r5 — *24 mortas causalmente* — estava **errada em
oito casos**. O regate havia encontrado dois; o instrumento encontrou oito.

Cada uma foi diagnosticada dinamicamente **antes** de qualquer decisão. As causas se
dividem em três famílias, e só uma delas era "oráculo faltando":

| id | causa raiz medida | ação |
|---|---|---|
| DUR2 | oráculo ausente no teste esperado | reparada |
| DUR3 | oráculo no ponto errado: o estado inseguro surge em **A**, o oráculo estava em **B** | oráculo próprio em A (`UNSAFE_RESERVATION_WITHOUT_ROOT_FSYNC`), distinto da lavagem |
| B1 | **mascarada**: sob `exists`-depois-`mkdir` vários passam a checagem, mas o registro write-once barra todos menos um — capacidade duplicada nunca aparece | removida, coberta por B7 |
| B3 | veneno era **código quebrado** (duas vezes): primeiro `readFile` fora de escopo, depois queda no `return UNAVAILABLE` genérico do mesmo `catch` | reescrita mirando o `catch` inteiro |
| B4 | oráculo media "diretório sumiu"; o estado inseguro é **reuso do id** | oráculo movido para a segunda reserva |
| B6 | **mascarada** pela exigência de recibo autêntico — mesma causa das antigas B5/B7 | fundida em B7 |
| B12 | o mutante invalida a **autoridade d1** (TTL estoura) em vez de testar o prazo d2b; e não por acidente: o relógio do consumo d1 e o do prazo d2b são o mesmo valor **por desenho** | removida, coberta por B11 |
| B14 | oráculo estreito: a queda para `/tmp` aconteceu, mas apareceu como `ALREADY_RESERVED` | oráculo passa a exigir falha FECHADA |

**Três remoções, e nenhuma por conveniência.** B1, B6 e B12 saem porque suas propriedades
declaradas ou já são cobertas causalmente por outra mutação, ou são inalcançáveis por um
mutante de um ponto. Cada razão está registrada no próprio código da bancada, não só aqui.

**A B3 merece nota** porque foi reescrita duas vezes e as duas primeiras versões eram
inválidas de formas diferentes. Só a terceira — mirando o bloco `catch` inteiro, para o
fluxo realmente atravessá-lo — produziu o defeito: reservar sobre um id já queimado.

**Autotestes da bancada: 5/5.** Exceção antes do oráculo não é kill; falha de setup vira
`ENVIRONMENT_FAILURE`; mutante fiel produz kill causal; mutante inócuo sobrevive; falha de
asserção sem oráculo não é kill. Um deles pegou um erro **meu**: eu havia exigido
`INVALID_MUTATION` onde a especificação pede `ENVIRONMENT_FAILURE`.

**22 mutações válidas · 20 mortas CAUSALMENTE · 2 guardas inalcançáveis (B6b, CONTAIN1) ·
0 sobreviventes · 0 inválidas · 0 defeitos de bancada · 0 falhas de ambiente.** O total
deriva do manifesto em `scripts/d2b-mutation-manifest.json`, não de contagem à mão.

**Quantidade não é métrica.** A r5 reportava 26 definições; a r7 reporta 22 válidas — e as
22 provam mais do que as 26 provavam.

`npm run verify` exit 0 · 2836 TS · 429 Python · lint **0 avisos** · typecheck 0 · d1
30/32+2 · c6 23/23 · r6 10/10 e 15/15. **Nenhuma linha de produção mudou nesta r7** —
`execution-ledger.ts` e `execution-supervisor.ts` intocados; só testes, oráculos e bancada.

### 32.13. d2b-r8 — o instrumento vira objeto de governança

O regate confirmou que as oito remediações da r7 são **causalmente válidas**, e que a
produção segue fechada. O BLOCK foi inteiramente na arquitetura de evidência — quatro
defeitos, todos meus, todos no medidor.

**Precedência invertida.** Meu classificador conferia o oráculo **antes** de olhar a
saúde da execução. Mutante emite a marca, o Vitest morre por `EPERM`, e sai
`KILLED_CAUSALLY`. O regate provou executando: oráculo + `ENOSPC vite startup` → kill.
Agora a ordem é aplicação → **saúde** → oráculo, e falha de ambiente tem precedência.

**O manifesto não governava nada.** Eu achava ter resolvido "total derivado do
manifesto" gravando o JSON no fim — mas os totais saíam de `len(MUTACOES)` e de um
dicionário local, e o arquivo era escrito **depois**. Era relatório, não fonte.

Agora há dois arquivos com papéis distintos: `d2b-mutation-manifest.json` é a **entrada**
autoritativa — versionada, com schema fechado, alvo, cardinalidade exigida, oráculo,
prova estrutural e o registro das cinco exclusões históricas. `d2b-mutation-results.json`
é a **saída**, ligada ao SHA-256 da entrada. Os totais vêm da **leitura de volta** do
resultado, validada contra esse hash. Nenhuma lista em Python governa execução ou
contagem: o runner tem 40 linhas e não contém definição de mutação alguma.

**Sobrevivência virava prova.** Qualquer mutação com o sufixo de guarda recebia
`STRUCTURALLY_UNREACHABLE` só por a suíte continuar verde — o mesmo erro que a r2 já
havia cobrado em outro nível, reintroduzido no classificador. Agora a classificação vem
de um **validador declarado no manifesto**:

* **B6b** — confere que `SELO_TENTATIVA` não é exportado, que o construtor o exige, que
  `SELO_RECIBO` é privado, que o recibo é cunhado em **um único ponto** do livro-razão, e
  que o construtor exige recibo autêntico.
* **CONTAIN1** — confere que `attempts` é derivado literalmente de `join(raiz,
  "attempts")` e que raiz e `attempts` passam por `lstat` com recusa de link.

Prova falha → `STRUCTURAL_PROOF_FAILED`, que bloqueia. Guarda sem validador → também
bloqueia. Suíte verde não promove nada.

**Autotestes: 13/13, todos pelo executor real.** Os 5/5 anteriores chamavam o
classificador direto e por isso nunca exercitavam a aplicação da mutação. Os quatro
cenários que faltavam entraram: alvo ausente, cardinalidade divergente, no-op, e
oráculo+ambiente simultâneos. Mais quatro que o regate não pediu mas o desenho exige:
guarda sem validador, prova estrutural falsa, manifesto com id duplicado, resultado com
hash divergente — e um provando que mudar uma classificação no resultado **muda o total**,
o que fecha a pergunta "os números vêm de onde?".

**22 no manifesto · 20 ATIVAS todas mortas causalmente · 2 ESTRUTURAIS com prova
validada · 0 sobreviventes · 0 inválidas · 0 defeitos de bancada · 0 falhas de ambiente ·
5 históricas excluídas** (B5 e B7 antigas, B1, B6, B12 — cada uma com razão e
`covered_by` no manifesto).

`npm run verify` exit 0 · 2836 TS · 429 Python · lint **0 erros, 0 avisos** · typecheck 0
· d1 30/32+2 · c6 23/23 · r6 10/10 e 15/15.

**Nenhuma linha de produção mudou na r8.** `execution-ledger.ts`, `execution-supervisor.ts`
e `live-execution.ts` com os mesmos hashes da r7.

**A limitação que permanece, e que é hora de fechar:** os módulos seguem **untracked**.
"Produção não mudou" continua sendo afirmação minha contra hashes que eu mesmo anotei
nesta conversa. Um checkpoint Git torna isso verificável por terceiros — e é o próximo
passo assim que a d2b passar.

### 32.14. d2b-r9 — o medidor conferido contra a própria evidência

O regate não achou defeito de produção. Achou **cinco** no medidor, e desta vez
*executou* as provas em vez de argumentar sobre elas.

**Crítico: a validação de leitura-de-volta não validava nada que importasse.** Ela
conferia hash, ids e compatibilidade grosseira. O regate adulterou um resultado —
`baseline_health=broken`, `mutation_application=not-applied`,
`unsafe_oracle_observed=false`, prova estrutural removida — e a validação **devolveu
True**, com os totais ainda mostrando 20 kills. `classification` era uma string que
ninguém confrontava com os fatos anexos. Trocar o `status` de ACTIVE para STRUCTURAL
também passava, e mudava a contagem de ativas de 20 para 19.

Agora existe **contrato de evidência**: `KILLED_CAUSALLY` exige baseline sã, teste
esperado passando no baseline, mutação aplicada, mutante sadio, oráculo observado, sem
timeout e com `rc` normal. `STRUCTURALLY_UNREACHABLE` exige `proof_id`, prova `PASS` e
fatos verificados. Status do resultado tem de ser **igual** ao do manifesto. E as
contagens de ATIVAS/ESTRUTURAIS vêm do **manifesto de entrada**, não do resultado — foi
por aí que a adulteração mudou 20 para 19.

**O código de saída era ignorado.** `saude()` recebia `rc` e não o usava. O regate provou
com `rc=137` (SIGKILL) + oráculo → `KILLED_CAUSALLY`. Agora só `0` e `1` são saídas
normais do Vitest; qualquer outra é término anormal. E há `timeout` finito: sem ele um
runner travado penduraria a bancada para sempre.

**As provas estruturais eram lexicais, e ele quebrou as duas.** Fonte sintética com um
helper **exportado** que captura o selo e forja a capacidade passou como "selo privado".
Tokens de contenção em função **morta** passaram como "no-follow". Presença de token não
é inalcançabilidade governada — eu havia trocado uma inferência ruim (suíte verde) por
outra (substring).

Agora as provas rodam em **AST** com grafo de chamadas:

* **B6b** — o selo é declarado e não exportado; **nenhum export constrói** a capacidade;
  nenhum export devolve o selo; o construtor exige selo e recibo autêntico; o recibo é
  cunhado num único ponto e **apenas dentro** de `reserveExecutionAttempt`.
* **CONTAIN1** — validação da raiz, `attemptsRealNaoLink`, `contidoNaRaiz`, `lstat`,
  recusa de symlink e `join(ledgerRoot, "attempts")` literal, todos no **fecho transitivo
  alcançado a partir do entrypoint exportado**. Código morto não prova nada.

A saída da prova separa o que foi **verificado mecanicamente** do que permanece
**premissa declarativa** — o adversário de mesma credencial fora do modelo, e a recusa de
hardlink de diretório pelo SO. Não chamo premissa de prova.

**E os autotestes decisivos não passavam pelo executor.** O cenário oráculo+ambiente
chamava `saude` direto; o de totais chamava `totais` sobre objeto de memória, sem
escrever, reler nem validar. Eram exatamente os dois caminhos onde os bloqueios moravam,
e eu afirmei "13/13 pelo executor real" no relatório. Era falso para os dois que mais
importavam.

Agora há um **runner injetável** e um **finalizador único**
(serializar → reler → validar evidência → totalizar) usados pelo runner de produção e
pelos autotestes. **31 cenários, 31 corretos**, incluindo `rc=137`+oráculo, timeout,
sumário malformado, as onze adulterações de resultado que o regate demonstrou, cinco
manifestos malformados, e as duas fontes sintéticas que quebravam as provas antigas.

Um cenário meu falhou na primeira medição — o de código morto — porque eu havia removido
só **uma** das duas chamadas a `attemptsRealNaoLink`, e a função seguia alcançável. O
sintético é que estava fraco.

**Versão do manifesto por despacho exato**, campos de topo fechados, coleções
obrigatórias, `bool` recusado como cardinalidade (é subclasse de `int` em Python), e id
histórico não pode colidir com ativo.

**20 ATIVAS todas mortas causalmente · 2 ESTRUTURAIS com prova AST · 0 sobreviventes ·
0 inválidas · 0 defeitos · 0 falhas de ambiente · 5 históricas excluídas.**
`npm run verify` exit 0 · 2836 TS · 429 Python · lint 0/0 · typecheck 0.

**Nenhuma linha de produção mudou.** Os três módulos com os mesmos hashes da r7 e da r8.

### 32.15. d2b-ev2 — o verificador mínimo, e a aposentadoria da bancada

**O que a bancada r1–r9 achou, e por que ela valeu.** Ela encontrou defeitos REAIS de
produção, todos fechados:

* a divergência entre a spec aprovada e a selada (getter multi-leitura);
* a lavagem do `fsync` da raiz — sequencial e concorrente;
* a durabilidade da entrada de diretório no pai, ausente;
* o `attempts`/raiz symlinkados atravessando a raiz governada;
* a falha de `fsync` de diretório engolida e devolvida como sucesso.

Nenhum desses seria encontrado por suíte verde. A bancada pagou o próprio custo.

**Por que ela foi aposentada como portão final.** A partir da r5 o objeto de estudo
deixou de ser a produção e passou a ser o próprio medidor. Cada rodada corrigia uma
camada da bancada e revelava a seguinte: kill sem causa → kill pelo teste errado → kill
sem observar o estado inseguro → oráculo aceito com processo insalubre → total vindo de
contador → prova estrutural lexical → prova estrutural sem grafo de exports. O último
regate confirmou, textualmente, **nenhum defeito novo de produção** — e ainda assim
apontou três defeitos de medição.

Auditar a auditoria tem retorno decrescente e custo crescente. A decisão de congelar a
produção e reconstruir a evidência do zero é a leitura correta, e ela não desqualifica o
que a bancada achou.

**O que a ev2 é.** Treze perguntas de segurança sobre a d2b, cada uma respondida por
evidência direta: comportamento observado em teste focado, ou asserção pequena de AST
sobre a fonte de produção. Um arquivo, 39 verificações, sem framework: sem mutação, sem
oráculo, sem classificação, sem contagem de kill, sem prova genérica.

| # | invariante |
|---|---|
| 01 | consumo síncrono da autoridade d1 antes da IO |
| 02 | um `execution_id` nunca rende duas capacidades |
| 03 | `mkdir` atômico não-recursivo |
| 04 | diretório existente queima o id para sempre |
| 05 | produção sem caminho para liberar id queimado |
| 06 | ordem da cadeia de durabilidade |
| 07 | falha de durabilidade não devolve recibo nem capacidade |
| 08 | raiz e `attempts` no-follow, sem fuga por symlink |
| 09 | `fsync` da raiz exigido em toda reserva |
| 10 | capacidade local ao processo, não reconstruível |
| 11 | prazo monotônico antes da IO, sem reinício |
| 12 | raiz de produção fixa, sem queda alternativa |
| 13 | nenhuma ativação de execução |

**PASS: 13/13.**

**Um erro meu, na primeira execução da ev2, que vale registrar.** O teste 12 usava
`toContain` sobre o texto da fonte e acusou a **prosa** que diz que o `state.db` do
Hermes está fora de questão. É a sétima aparição do mesmo falso positivo nesta fase —
varredura de texto onde a pergunta é estrutural — e eu quase o embuti no verificador
novo. Corrigido para AST: comentário não é nó de chamada nem literal de código.

**A bancada r1–r9 fica preservada** em `scripts/` como evidência histórica de engenharia.
Não é autoridade para o SHIP da d2b; a ev2 é.

`npm run verify` exit 0 · **2875 TS** (2836 + 39 da ev2) · 429 Python · lint 0/0 ·
typecheck 0 · d1 30/32+2 · c6 23/23 · r6 10/10 e 15/15. Produção congelada com os mesmos
hashes de r7, r8 e r9.

### 32.16. d2b-ev2-r1 — a porta que eu mesmo abri

O regate final da ev2 encontrou um defeito **de produção**, não do medidor. É o achado
mais importante da sequência, e ele existia porque eu o construí.

**A r2 criou a brecha para fechar outra.** Para matar a mutação B13 — "raiz escolhida
pelo chamador" — separei `prepareGovernedExecution(auth)`, aridade 1, de
`__prepareGovernedExecutionForTests(auth, seam)`, que aceitava `ledgerRoot`. E
**exportei a segunda**.

Nome com `ForTests`, marca `@internal`, ausência do `index.ts`: nada disso é controle de
acesso em runtime. O módulo é importável diretamente e o pacote não tem export map. Duas
autorizações d1 legítimas para o MESMO `execution_id`, com duas raízes graváveis,
venciam cada uma o seu `mkdir` atômico e produziam **duas capacidades**.

A unicidade global é por identificador. Ela só coincide com "por diretório" enquanto a
raiz for única — e uma raiz escolhida pelo chamador desfaz a coincidência.

**Por que os meus testes não pegaram.** EV2-02 testava unicidade dentro de UMA raiz.
EV2-12 conferia a aridade do wrapper público e que ele ignorava a raiz passada. Nenhum
perguntava *"existe alguma função exportada que aceite raiz?"* — e a resposta estava na
linha seguinte do arquivo que eu escrevi. Pior: a ev2 usava a costura em 30 das 39
verificações, tratando como interna uma coisa que era superfície pública.

**A correção.** A costura foi **removida**, não renomeada. `prepareGovernedExecution` é
agora a única via, resolve na constante fixa e chama `monotonicSeconds()` direto. Os
testes que precisam de raiz temporária **mockam o módulo do livro-razão** — o que não
abre porta alguma em produção.

**Princípio, dito uma vez:** código de produção não exporta capacidade de teste.

**A superfície exportada do supervisor, inteira:**
`RESERVED_ATTEMPT_DEFECTS` · `ReservedExecutionAttempt` · `prepareGovernedExecution(auth)`
· `consumeReservedExecutionAttempt(attempt)`. Nenhuma aceita raiz.

**Uma distinção que o teste novo precisou fazer com honestidade.** O livro-razão exporta
`reserveExecutionAttempt(ledgerRoot, …)` — e isso é por desenho: é a camada inferior, e
os testes dela usam raiz temporária. Isso só é seguro porque aquele módulo **não conhece**
`ReservedExecutionAttempt`: um recibo cunhado em raiz arbitrária não vira capacidade. A
ev2 agora prova isso — capacidade construída em **um** ponto, dentro da via de raiz fixa.

Meu primeiro teste da correção era largo demais e acusou `reserveExecutionAttempt` como
se fosse a mesma coisa. Corrigi o escopo em vez de aceitar o falso positivo.

**EV2: 13/13, agora com 42 verificações.** As de invariante 12 passaram de "o wrapper
ignora o segundo argumento" para "nenhum export do supervisor aceita raiz ou semente,
por AST" mais "o livro-razão aceita raiz mas não pode produzir capacidade".

`npm run verify` exit 0 · **2878 TS** · 429 Python · lint 0/0 · typecheck 0 · d1 30/32+2
· c6 23/23 · r6 10/10 e 15/15. D1 e Python de produção intocados; artefato inalterado.

---

## §33 — D2C: costura privada de execução PRECALL (TS → Python)

### O que esta fase é, e onde ela para

A D2C constrói o **único caminho** pelo qual uma capacidade d2b vira um processo
filho, e para **antes** de qualquer chamada real de modelo. Não há chamada a
provedor, não há rede, não há `--live`, não há modo de ativação. O worker Python
executa a sonda PRECALL já existente e devolve **um** documento fechado com
hashes e contagens.

A pergunta que a D2C responde é estreita de propósito:

> Dada uma capacidade autêntica e de uso único, existe exatamente um processo
> filho, com executável fixo, módulo fixo e ambiente fixo, cujo resultado só é
> aceito se estiver amarrado a esta execução — e nada disso concede LIVE?

### Fronteiras de módulo

O `creditum_hermes_reasoning` **não foi tocado**. A D2C vive em um pacote novo,
`creditum_hermes_precall`, justamente para que o pacote congelado permaneça
byte-idêntico ao artefato que o selou. O ledger, o supervisor e o
`live-execution.ts` também seguem intocados — verificado por hash contra o
commit `6383374`, não por afirmação.

Por isso a EV2-13 da d2b continua correta ao exigir zero `spawn` no ledger e no
supervisor: o `spawn` da D2C nasce em `precall-execution.ts`, um módulo distinto,
coberto pelas checagens C4, C5, C10 e C12.

### Ordem da ativação

1. **consumo síncrono** da capacidade, antes de qualquer `await`;
2. **orçamento restante** derivado da mesma linhagem monotônica da d1 — sem
   relógio novo, sem reinício de prazo;
3. **`ATTEMPT_COMMITTED` durável** gravado **antes** do spawn: se o commit não
   for durável, nenhum filho nasce;
4. **um** filho, `spawn` de executável e módulo fixos, ambiente mínimo;
5. **amarração** do resultado: `execution_id`, `execution_fingerprint` e
   `request_nonce` conferidos contra o que foi enviado;
6. **terminal write-once**, que é auditoria e nunca devolve o id ao pool.

O passo 3 vem antes do 4 por uma razão só: um filho que nasce sem commit durável
é um filho cuja tentativa pode ser reexecutada após uma queda. A durabilidade
precede a atividade.

### Duas correções que o lint encontrou e que eram substantivas

Nenhuma das duas foi cosmética, e vale registrar porque ambas repetem a mesma
lição da d2b — **dado vindo de baixo não é autoridade**.

**(a) Coerção silenciosa de campos opcionais.** `leResultado` conferia o tipo dos
campos obrigatórios, mas dos opcionais conferia só a pertinência ao conjunto
permitido. Um filho que mandasse `"mode": {}` faria `String({})` gravar
`"[object Object]"` **dentro da evidência governada**. A correção não foi
melhorar a coerção: foi tipar na fronteira e recusar o documento inteiro quando
um campo presente tem o tipo errado. Coberto por C7.

**(b) Vocabulário de recusa aberto.** O tipo era `PrecallDefect | string`, e o
defeito devolvido vinha do filho. Isso deixava um worker comprometido **escolher
como esta camada classifica a própria recusa**. Agora o vocabulário é fechado, a
recusa semântica é sempre `PRECALL_SEMANTIC_REJECTED`, e o texto do filho
sobrevive apenas como `child_detail` — auditoria, nunca classificação. Coberto
por C7.

### Evidência

`gateway/tests/d2c-ev.test.ts` — C1 a C13, 46 checagens diretas. Mesma forma da
EV2: comportamento observado ou asserção pequena de AST, sem framework, sem
mutação, sem oráculo.

`bridge/tests/test_d2c_precall_worker.py` — 8 provas no nível do processo, com o
worker rodando de verdade e o protocolo fechado ponta a ponta.

Uma nota de precisão sobre o teste Python: produção usa `python3 -I` porque lá o
pacote está instalado no `/opt/venv`. `-I` descarta `PYTHONPATH`, e este
repositório não é instalado; o teste local roda sem `-I`, com o repositório como
`cwd`. A diferença é de **localização do módulo**, não de comportamento do
worker.

### C10 — o que a checagem realmente afirma

A primeira versão de C10 exigia zero laços no módulo e falhou: existem dois, em
`leResultado`, percorrendo campos do protocolo. A asserção estava errada, não o
código. A invariante real é que **nenhum laço envolve a invocação do filho** —
hoje é isso que a AST verifica, junto com a contagem única de chamadas.

Vale nomear o padrão porque esta fase já pagou por ele oito vezes: varredura de
texto acusa a prosa que documenta uma ausência. A resposta certa é sempre AST.

### O que continua NÃO construído

A costura que poria o worker em modo LIVE não existe. Não há
`__spawnForTests`, não há executável, módulo, ambiente, prazo ou protocolo
selecionáveis pelo chamador. A primeira execução LIVE segue não autorizada.

---

## §33.1 — D2C-R1: instantâneo imutável, prazo absoluto, contrato exato

O Codex bloqueou a D2C com três achados. Todos os três eram reais, todos em
`precall-execution.ts`, e nenhum exigiu tocar módulo congelado.

### (A) `readonly` é do compilador, não do runtime

A capacidade era autêntica — `instanceof` mais `WeakSet` — mas suas propriedades
continuavam graváveis por `Object.defineProperty`. E a via **relia** essas
propriedades depois do `await` do commit. Duas rotas saíam disso:

1. `execution_key` adulterado antes da invocação: `join(raiz, "attempts", chave)`
   com `../../../../../tmp/owned` aponta para fora da reserva governada.
2. `execution_id` ou `execution_fingerprint` mutados **durante** o commit: o
   `attempt-committed.json` no disco registra uma identidade, e o pedido ao
   filho, a conferência de vínculo, o terminal e a evidência usam outra.

A correção é a mesma disciplina que a d1-R1 pagou para aprender: **ler uma vez,
antes do primeiro `await`, e derivar tudo da cópia própria**. `instantaneoDaCapacidade`
lê cada campo exatamente uma vez de forma síncrona — o JavaScript não preempta
dentro de uma função síncrona, então nenhum `defineProperty` se intercala entre
duas leituras — valida, e congela. Depois disso a capacidade não é mais lida; há
uma checagem de AST que exige zero acessos a `attempt.*` dentro da via.

O diretório nunca vem da propriedade. Vem de `executionKey(execution_id)`, a
mesma derivação canônica da d2b. A propriedade é conferida contra a derivação e
descartada.

A validação é cruzada, não apenas de formato: mutar só o id quebra a spec; mutar
só a spec quebra o fingerprint; mutar só o fingerprint quebra a derivação. Um
chamador que mutasse os quatro coerentemente apontaria para uma execução que
nunca foi reservada — e `recordAttemptCommitted` recusa com `ATTEMPT_NOT_RESERVED`,
porque quem cria o diretório é a reserva, não o commit.

Uma nota sobre o que **não** foi feito: não inventei um regex mais estreito para
`execution_id`. A d1 exige texto não vazio e não impõe alfabeto; um regex mais
apertado aqui rejeitaria identificadores que a d1 legitimamente emite. A
segurança do caminho não depende do alfabeto, porque a chave é um sha256.

### (B) O commit devolvia tempo ao orçamento

O restante era calculado **antes** da escrita e dos dois `fsync`, e usado
**depois**. Um commit de 30 s deixava o filho com quase os 180 s originais —
cerca de 210 s de linhagem. Pior: um commit que terminasse já vencido ainda
chegava ao `spawn`.

A autoridade agora é o prazo **absoluto**. O restante é recalculado depois do
commit; se venceu, o commit permanece — a tentativa está queimada, e isso é
intencional — e nenhum filho nasce. O cronômetro do filho deriva do absoluto no
instante do `spawn`, dentro de `rodaFilho`, em vez de receber uma duração
pré-calculada.

O decorrido do registro terminal também passou a derivar do relógio atual e da
linhagem original, em vez de um restante obsoleto.

### (C) Sucesso media três campos e presumia o resto

O predicado antigo era `outcome + provider_calls + model_call_completed`, e o
resto da evidência vinha com `?? -1` e `?? ""`. Um filho podia declarar
`PRECALL_SUCCEEDED` com `mode: "LIVE"`, `client_constructions: 1`, veredito
inventado, hashes ausentes e `rc: 137` — e a camada gravava `COMPLETED_ACCEPTED`.

Agora há dois contratos, não um permissivo. O envelope mínimo vale para qualquer
resultado. O sucesso exige o conjunto **exato** de treze campos com os valores
exatos do worker congelado: `mode = "PRECALL_PROBE"`,
`verdict = "PRECALL_PROBE_COMPLETE"`, `tool_count`/`client_constructions`/
`provider_calls` iguais a zero como inteiros de verdade, `model_call_completed`
falso, e os dois hashes em `^[0-9a-f]{64}$`. Nada é opcional, nada tem default —
**ausência nunca é zero**.

O desfecho do processo precede a semântica: `rc != 0` ou sinal presente é
`WORKER_FAILED`, e stdout impecável não converte processo morto em sucesso. O
worker congelado sempre sai 0, até quando recusa, então saída diferente de zero
só pode significar que o processo quebrou.

E a evidência governada é construída pelo pai. As constantes vêm do módulo, não
do documento; `execution_key` não existe no protocolo do filho, então sua
presença na evidência é prova de que quem a montou foi esta camada. O texto do
filho sobrevive apenas como `child_detail`, limitado a 128 caracteres, auditoria
e nunca classificação.

### Duas coisas que os testes revelaram sobre si mesmos

O fixture usava `"r".repeat(64)` como `request_hash` — **`r` não é hexadecimal**.
O contrato canônico o rejeitou de imediato. O fixture estava errado desde o
início e nada media isso.

E o fixture emitia `mode: "precall_probe"` enquanto o worker congelado emite
`PRECALL_PROBE`, exatamente como o Codex apontou. A correção foi no teste. Tornar
o comparador insensível a caixa teria acomodado o erro do fixture dentro da
produção — o oposto do que a fase inteira vem construindo.

A checagem C9 que varria o texto procurando a expressão do cálculo foi
substituída por comportamento com relógio injetado: 180 s de orçamento, 30 s
consumidos no commit, cronômetro do filho medido em 150 000 ms. A varredura
antiga continuaria passando com o valor inflado, porque a expressão estava lá —
só estava no lugar errado. Décima vez nesta fase que texto não prova estrutura.

### Evidência

`gateway/tests/d2c-ev.test.ts` — C1 a C13, **80 checagens** (eram 46). As novas
cobrem instantâneo e travessia, mutação durante o commit, prazo absoluto sob
relógio determinístico, os doze sucessos impossíveis, os oito campos ausentes, os
três desfechos de processo quebrado, e a forma exata da evidência do pai.

---

## §33.2 — D2C-R2: estado privado de emissão e portão do prazo antes do spawn

O Codex bloqueou a R1 com dois achados novos. O primeiro exigiu reabrir a D2B —
mínima e justificadamente, porque a D2C não tem como derivar autoridade em
segurança de propriedades públicas mutáveis.

### (A) Coerência mútua não prova propriedade

A R1 lia os campos públicos da capacidade **uma vez**, de forma síncrona, e os
validava **entre si**: id contra spec, fingerprint contra a derivação, chave
contra `executionKey(id)`. Achei que isso fechava a rota. Não fechava.

O ataque que o Codex demonstrou: o chamador obtém **duas** capacidades
autênticas, A e B, e reescreve em A todos os campos públicos com os valores de B.
Esses valores são mutuamente coerentes — vêm de uma emissão real. A validação
cruzada passa. A é consumida, e a execução acontece sob a identidade de B, no
diretório já reservado de B, sem consumir B.

Minha defesa declarada na R1 — "um id não reservado é recusado com
`ATTEMPT_NOT_RESERVED`" — não cobria o caso, porque o alvo **está** reservado.

A correção não é validar melhor. É não consultar. O supervisor passou a capturar
o estado autoritativo no cunho, num `WeakMap` privado do módulo, e
`consumeReservedExecutionAttempt` devolve esse estado. As três coisas acontecem
juntas e de forma síncrona: autenticidade, uso único, entrega da identidade.
Separá-las devolvia à D2C a tarefa de descobrir por si qual identidade vale — e
foi disso que a rota A→B nasceu.

`WeakMap` e não campo privado de classe por uma razão prática: campo privado
ainda vive no objeto, e o objeto atravessa a fronteira. A chave aqui é a
identidade da capacidade autêntica, que não se forja, copia nem reescreve.

Os campos públicos permanecem, agora documentados como **observacionais**. E
`safeAuditView()` passou a ler a emissão: uma visão de auditoria que o detentor
pudesse reescrever seria auditoria de nada.

Uma decisão que vale explicitar: **não** tornei as propriedades públicas
não-graváveis. Seria barato e faria a mutação lançar. Mas isso converteria uma
prova de *irrelevância* numa prova de *rejeição*, e irrelevância é a propriedade
que sobrevive a alguém acrescentar um campo público novo daqui a três fases. As
regressões da R2 afirmam exatamente isso: a mutação acontece, e não muda nada.

O que devolvo do consumo é dado congelado, não uma segunda capacidade: sem selo,
fora do registro, e passá-lo de volta a qualquer via governada falha em
`instanceof`. Há checagem EV2 para isso.

### (B) O portão do prazo estava do lado errado do `spawn`

A R1 conferia o prazo na via, depois do commit, e recalculava **dentro** de
`rodaFilho` — depois de `spawn` já ter sido chamado. Uma tentativa que vencesse
entre as duas linhas criava um processo e só então agendava sua morte, com o
`Math.max(1, ...)` ainda dando um milissegundo a quem não tinha nenhum.

O portão mudou de lado: é a primeira coisa que `rodaFilho` faz, e nenhuma
declaração `spawn` é alcançável antes dele — há checagem de AST comparando
posições. A conferência da via permanece apenas como falha rápida, e está
marcada como não autoritativa: se ela desaparecesse, a correção continuaria
valendo pelo portão.

O cronômetro é relido do mesmo prazo absoluto imediatamente após o `spawn`, sem
mínimo artificial. Se o prazo venceu nesse intervalo, o atraso é zero e o filho
morre no próximo tique — o caminho local mais curto, e não é retry.

E o limite que não se pode fingir: entre ler o relógio e o sistema operacional
criar o processo existe um intervalo que nenhum código de espaço de usuário
fecha. A afirmação honesta é que a **permissão** para chamar `spawn` é decidida
imediatamente antes da chamada, pelo prazo absoluto. Não há atomicidade entre
leitura de relógio e criação de processo, e o comentário no código existe para
não sugerir que haja.

### O que as regressões afirmam agora

A decisiva: duas capacidades autênticas, A reescrita com os valores reais de B,
e então (i) a evidência é de A, (ii) o pedido ao filho é de A, (iii) A tem commit
e terminal, (iv) o diretório de B contém **só a própria reserva**, (v) B segue
consumível por si, (vi) um filho por capacidade.

Para o portão: relógio com fila de leituras encadeadas, positivo nas duas
conferências da via e vencido na terceira — a leitura do portão. `spawn` count 0.

Quatro testes da R1 tiveram de ser reescritos, e isso é o sinal de que a
correção é real: eles exigiam que a mutação fosse **rejeitada**; agora ela é
**irrelevante**.

### Dois detalhes que os testes revelaram

D1 recusou a segunda capacidade com `INVALID_APPROVAL_REQUEST`: uma aprovação
emite uma autorização, então A e B precisam de aprovações distintas. E o `$defs.identifier`
do contrato só aceita minúsculas — meu `d2c-exec-000B` tinha um `B` maiúsculo.
Ambos eram erros do teste, corrigidos no teste.

### Evidência

`gateway/tests/d2c-ev.test.ts` — **86 checagens** (eram 80).
`gateway/tests/d2b-ev2.test.ts` — **45 checagens** (eram 42), 13/13 invariantes.

---

## §33.3 — D2C-R3: o uso único sai do objeto

O Codex bloqueou a R2 com um achado só, e certeiro. Eu havia tirado a
**identidade** das propriedades públicas e deixado o **uso único** onde estava:
num campo booleano do objeto, decidido por um método público `_consumeOnce`.

Três consequências, todas alcançáveis com capacidades autênticas:

```
A._consumeOnce = B._consumeOnce.bind(B)
  → consumir A autenticava A, recuperava a emissão de A, e marcava B como gasta.
    B era recusada depois sem nunca ter executado.

A._consumeOnce = () => true
  → o uso único desaparecia: toda chamada "vencia", e uma aprovação rendia N filhos.
```

E a terceira, que o relato não precisou citar porque as duas primeiras já
bastavam: a chamada passava `SELO_TENTATIVA` como argumento para uma função
escolhida pelo portador. **O selo do módulo vazava.** Não é suficiente para
forjar capacidade — o construtor também exige um recibo durável autêntico, que
vive num `WeakSet` do livro-razão — mas entregar o selo é entregar metade.

O modelo de autoridade agora é simétrico e inteiro:

| Fato | Onde mora |
|---|---|
| **QUEM** é esta capacidade | `WeakMap` privado `EMISSAO` |
| **SE** já foi consumida | `WeakSet` privado `CONSUMIDAS` |

Nenhum campo nem método público controla qualquer um dos dois. `_consumeOnce` foi
**removido**, não renomeado nem marcado — não existem dois mecanismos competindo.
`isConsumed` e `safeAuditView().consumed` passaram a ler o `WeakSet`: são
observação, não autoridade.

O uso único é atômico por construção. Entre o `has` e o `add` não há `await` nem
chamada externa, e o JavaScript não preempta dentro de uma função síncrona. Isso
não é mutex; é a garantia do modelo de execução, e é a mesma que a D1 já usava —
só que agora sem despacho dinâmico no meio.

Emissão ausente recusa **antes** de marcar como consumida: um bug interno não
deve queimar a capacidade de quem não fez nada errado.

### O padrão idêntico continua aberto na D1

`live-execution.ts:552` faz exatamente o que o supervisor fazia:

```ts
if (!auth._consumeOnce(SELO)) { … }
```

`LiveExecutionAuthorization` tem `private consumida`, um `_consumeOnce` público e
o mesmo despacho dinâmico. As duas rotas do relato do Codex valem lá sem
alteração: rebinding entre duas autorizações autênticas queima a errada, e
`() => true` derruba o uso único da autorização — que é a autoridade de Stefano,
não a reserva.

Esta fase tinha instrução explícita de não tocar `live-execution.ts`, e não
toquei. Fica registrado como defeito conhecido, com localização exata, esperando
fase própria. A D2C não depende dele para estar correta: o supervisor recusa
autorização já consumida por `EMITIDAS` e TTL, e a unicidade global do
`execution_id` é garantida pelo `mkdir` atômico do livro-razão. Mas o defeito é
real e da mesma classe.

### Evidência

`gateway/tests/d2b-ev2.test.ts` — **49 checagens** (eram 45), 13/13 invariantes.
As quatro novas: função injetada não consome outra capacidade; função que sempre
"vence" não repete o consumo; estado de consumo vem do registro privado e
injetar `consumida` não desconsome; nenhum export desfaz, reseta ou clona
consumo, e `_consumeOnce` não existe mais no protótipo.

`gateway/tests/d2c-ev.test.ts` — **88 checagens** (eram 86). As duas novas provam
o efeito na ponta: método injetado não gera segundo filho, e consumo injetado de
A não queima B.

---

## §33.4 — D2C-R4: autoridade em campos privados de linguagem

A R3 tirou a autoridade do objeto e a pôs num `WeakMap` e num `WeakSet` privados
do módulo. O Codex mostrou que privado do módulo não é suficiente, porque o
**acesso** continuava sendo despacho comum:

```
EMISSAO.get(attempt)   →   WeakMap.prototype.get
CONSUMIDAS.has(...)    →   WeakSet.prototype.has
RESERVADAS.has(...)    →   WeakSet.prototype.has
attempt instanceof X   →   X[Symbol.hasInstance]
```

Todos com descritor `writable: true, configurable: true` — medido, não presumido.
O ataque: depois de os módulos governados já estarem inicializados, o chamador
guarda o `get` original e o substitui por um invólucro que, chamado com a chave
A, chama o original com a chave B. `EMISSAO.get(A)` devolve a emissão de B sem
que ninguém jamais tenha alcançado o `WeakMap`. A é marcada como gasta e a
execução acontece sob a identidade de B, que segue não consumida. `WeakSet.has`
mentindo "nunca consumida" derruba o uso único pelo mesmo mecanismo.

A classe do defeito tem nome: **autoridade por despacho mutável**. Corrigir uma
primitiva de cada vez não a fecha.

### O que fecha

Campos privados de classe. `this.#emissao` não é propriedade procurada num
protótipo — é referência resolvida lexicalmente, sem método que se possa
substituir. E `#emissao in obj` é uma marca que só o construtor real instala:
não se forja, não se acrescenta e não se intercepta.

| Fato | R3 | R4 |
|---|---|---|
| QUEM é a capacidade | `WeakMap` privado | `#emissao` |
| SE já foi consumida | `WeakSet` privado | `#consumida` |
| É emissão autêntica | `instanceof` + `WeakSet` | `#emissao in obj` |

O consumidor vive num bloco `static {}` da própria classe, onde os campos
privados são visíveis, e o módulo exporta apenas uma função que o chama. Nenhum
selo atravessa fronteira; nenhum retorno de chamada é escolhido pelo chamador.
`RESERVADAS`, `EMISSAO` e `CONSUMIDAS` foram removidos — a marca de linguagem já
é a prova de emissão, e ela foi instalada por um construtor que exige o selo do
módulo e um recibo durável autêntico.

Há checagem de AST sobre o bloco estático: nenhum `instanceof`, nenhuma chamada
a `get`/`has`/`add`/`set`.

### O que este desenho não promete

**Dentro** do modelo de ameaça: o chamador reescreve campos públicos, acrescenta
ou substitui métodos, adultera protótipos globais **depois** da inicialização dos
módulos governados, e tem múltiplas capacidades autênticas em mão.

**Fora**: código hostil arbitrário do mesmo realm executando **antes** da
inicialização destes módulos, ou substituição do próprio Node/V8. Quem controla o
bootstrap substitui a classe, o `import`, o `crypto` — e nenhuma dureza
incremental neste arquivo responde a isso. A resposta a essa ameaça é isolamento
de processo.

Uma verificação que fiz em vez de assumir: o caminho do diretório usa `join`
importado de `node:path`, e um binding nomeado de ESM **não** é interceptável —
substituir `path.join` depois do import não afeta a chamada. Medido.

E uma honestidade sobre proporção: `HEX256.test(...)`, `Number.isFinite` e
`Object.freeze` também são substituíveis, e não os capturei. Eles validam
valores que já vêm do estado privado, criado no cunho a partir de material
autêntico — são defesa em profundidade, não autoridade. Capturar todo intrínseco
que o módulo toca seria trocar um risco real por muito ruído.

### Evidência

`gateway/tests/d2b-ev2.test.ts` — **52 checagens** (eram 49), 13/13 invariantes.
As três novas: patch em `WeakMap.prototype.get`/`has` e `WeakSet.prototype.has`/
`add` não redireciona A para B nem derruba o uso único, com restauração no
`finally` e janela mínima; `Symbol.hasInstance` forjado faz `instanceof` devolver
`true` e ainda assim não cria capacidade; e a prova de AST do bloco estático.

`gateway/tests/d2c-ev.test.ts` — **89 checagens** (eram 88). A nova prova o
efeito na ponta: com os protótipos adulterados, A executa como A, o diretório de
B fica só com a própria reserva, e nasce um único filho.

---

## §33.5 — D2C-R5: a autoridade não é valor de retorno

A R4 pôs a autoridade em campos privados de linguagem. O Codex encontrou o que
ficou de fora: a linha que **preenchia** o campo.

```ts
this.#emissao = Object.freeze({ … })   // frágil
```

`Object.freeze` é `writable: true, configurable: true`. O campo privado é
inviolável, mas o que se atribui a ele era o **valor de retorno de uma função
substituível**. Um invólucro hostil instalado depois da inicialização devolve o
estado de outra emissão, e a capacidade A nasce com a identidade de B — A
consome como B, escreve no diretório de B, e B segue independentemente
consumível.

Na R4 eu havia escrito, sobre `Object.freeze`, que era "defesa em profundidade,
não autoridade". Estava errado no caso do construtor: ali o retorno **era** a
autoridade.

### As duas medidas, e qual importa mais

1. O intrínseco é capturado na inicialização do módulo: `const CONGELA = Object.freeze`.
2. O retorno nunca é a autoridade. O objeto é construído localmente, congelado
   no lugar, e o **local** é atribuído:

```ts
const emitido: IssuedExecutionState = { … }
CONGELA(emitido)
this.#emissao = emitido
```

A segunda importa mais. Só a captura deixaria a forma frágil: bastaria alguém
reescrever a linha como `= CONGELA(...)` e o defeito volta sem que nada observe.
Há checagem de AST exigindo zero atribuições de retorno de chamada a `#emissao`.

### O mesmo padrão estava na D2C, e também era autoridade

`instantaneoDaEmissao` fazia `return Object.freeze({...})`, e é esse objeto que
define o diretório da tentativa, a identidade do pedido ao filho e o registro
terminal. Um `freeze` hostil substituiria o instantâneo inteiro e a execução iria
para outro diretório. Corrigi nos dois arquivos pela mesma regra, porque a regra
é sobre autoridade, não sobre qual arquivo o relato citou.

`safeAuditView()` e a evidência devolvida também passaram a construir local e
congelar no lugar. Essas duas são observacionais — quem adultera o `freeze`
engana a si mesmo — mas deixar `return CONGELA(...)` ali convida a próxima linha
de autoridade a copiar a forma.

### O que continua não capturado, e por quê

`HEX256.test`, `Number.isFinite` e `join` seguem sem captura. Os dois primeiros
validam valores que já vêm do estado privado criado no cunho; nenhum retorno
deles se torna autoridade. E `join` vem de um binding nomeado de ESM, que não é
interceptável — medido na R4. Capturar intrínseco porque é mutável, sem efeito
de autoridade alcançável, seria trocar risco real por ruído.

### Evidência

`gateway/tests/d2b-ev2.test.ts` — **54 checagens** (eram 52), 13/13 invariantes.
As duas novas: `Object.freeze` hostil instalado após a inicialização, montado dos
campos públicos de B; A é cunhada nessa janela e ainda consome como A, com o
contador provando que o invólucro **nunca foi alcançado** pela emissão; e a
checagem de AST contra a forma frágil.

`gateway/tests/d2c-ev.test.ts` — **91 checagens** (eram 89). A nova cunha **e**
executa A com o intrínseco hostil no lugar: commit e terminal no diretório de A,
diretório de B só com a própria reserva, um único filho.

---

## §34 — D1-R3: a autoridade de Stefano em campos privados de linguagem

A §33.3 registrou um defeito conhecido em `live-execution.ts` e o deixou pendente
por instrução. A D2C fechou; esta rodada fecha a D1 pela mesma construção que o
Codex aprovou lá.

O que estava aberto, exatamente:

```ts
if (!(auth instanceof LiveExecutionAuthorization) || !EMITIDAS.has(auth)) { … }
if (!auth._consumeOnce(SELO)) { … }
```

Quatro rotas, todas alcançáveis dentro do modelo de ameaça declarado:

```
A._consumeOnce = B._consumeOnce.bind(B)        → consumir A queimava B
A._consumeOnce = () => true                    → o uso único desaparecia
WeakSet.prototype.has = () => true             → objeto qualquer virava emissão
Object.defineProperty(C, Symbol.hasInstance, …) → `instanceof` mentia
```

E a quinta, que não é rota de bypass mas é vazamento: `_consumeOnce(SELO)`
entregava o selo do módulo a uma função escolhida pelo detentor.

O peso aqui é maior que na D2B. A reserva responde "este `execution_id` já foi
gasto"; esta classe responde **"Stefano autorizou exatamente isto"**. Derrubar o
uso único da autorização é reusar uma aprovação humana.

### A correção

| Fato | Antes | Agora |
|---|---|---|
| O que Stefano autorizou | campos públicos + `EMITIDAS` | `#emissao` |
| Já foi gasta | `private consumida` via `_consumeOnce` | `#consumida` |
| É emissão autêntica | `instanceof` + `EMITIDAS.has` | `#emissao in auth` |

`_consumeOnce`, `private consumida` e `EMITIDAS` foram **removidos** — sem
renomear, sem `@internal`, sem dois mecanismos competindo. O consumidor vive num
bloco `static {}` da classe e a função exportada apenas o chama.

A ordem não mudou: **marca → TTL → uso único**. Uma autorização expirada não é
consumida, e isso é deliberado: exigir aprovação nova é o desfecho certo, e
queimá-la ali esconderia a expiração atrás de "já usada". Há teste exigindo que a
segunda tentativa de uma expirada continue dizendo `AUTHORIZATION_EXPIRED`.

O TTL e o prazo agora vivem em `#emissao`, não em campo público relido. Mutar
`issued_at_monotonic` não estende nada — há regressão empurrando o instante de
emissão para o presente e exigindo `AUTHORIZATION_EXPIRED`.

### Um caminho concreto que encontrei ao aplicar a regra da R5

`deepFreeze` devolve o **próprio** objeto, não o retorno de `Object.freeze` — já
seguia a regra, e portanto um `freeze` adulterado não substitui a spec. Mas podia
deixá-la **não congelada**, e a spec própria é publicada em `auth.spec`. O
detentor então mutaria `model` **depois** de Stefano ter aprovado um fingerprint
que descrevia outra coisa.

Fechado com o intrínseco capturado: `deepFreeze(proprio)` para o contrato
profundo, `CONGELA(proprio)` para a garantia rasa confiável, e o **local** é o que
se registra e devolve. Raso basta, e é demonstrável: `especificacaoValida` e
`politicaDeControleExata` juntas exigem que os vinte campos da spec sejam
primitivos.

### O que segue sem captura, e por quê

`PROPRIAS.has(spec)` continua sendo um `WeakSet`. Não é rota alcançável: só o
construtor o consulta, e o construtor exige o selo — que não é exportado e, agora
que `_consumeOnce` sumiu, não vaza. Adulterar `has` para sempre-verdadeiro só
ajudaria quem pudesse chamar o construtor. Adulterar `add` faz a emissão falhar
fechada.

`Reflect.ownKeys` e `CHAVES_GOVERNADAS.has` também são mutáveis. Ambos só
recusam chaves desconhecidas; a cópia lê os vinte campos nomeados e descarta o
resto, então derrubá-los não muda o que é armazenado.

### Evidência

`gateway/tests/live-execution.test.ts` — **77 checagens** (eram 64). As treze
novas cobrem: campos públicos de A reescritos com os de B; `_consumeOnce`
religado a B nunca invocado; `() => true` sem segundo consumo; ausência no
protótipo; patch de `WeakMap`/`WeakSet`; `Symbol.hasInstance` forjado; `freeze`
adulterado não deixa a spec mutável; TTL a partir da emissão; auditoria a partir
da emissão; objeto simples/de mesma forma/de protótipo/serializado recusados;
nenhum export desfaz ou reemite; e duas checagens de AST — selo nunca entregue a
método de objeto, `#emissao` nunca recebendo retorno de chamada.

As duas últimas nasceram como regex e a segunda **falhou acusando a própria prosa
que documenta a ausência do padrão**. Décima vez nesta fase. Convertidas para AST.
