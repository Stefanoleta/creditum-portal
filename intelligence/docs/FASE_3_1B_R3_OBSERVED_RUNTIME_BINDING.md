# Fase 3.1b-r3 — a ponte ligada à API observada

```
FONTE DA API               OBSERVAÇÃO 3.1b-r2 (Hostinger, somente leitura)
CONSTRUTOR                 run_agent.AIAgent
RESOLVEDOR                 model_tools.get_tool_definitions
`import hermes` REMOVIDO   SIM — o módulo não existe
FORNECEDOR EM /opt         NÃO MODIFICADO
CHAMADAS DE MODELO         0
TESTES LOCAIS              68 (Python) · 15 mutações, 15 mortas
PROVA DE PRODUÇÃO          PASSOU — Hostinger, Hermes real (§0)
STATUS                     IMPLEMENTED · PRODUCTION_TRANSPORT_VERIFIED = true
```

## 0. A prova de produção

**Isto não é um teste local.** É a execução do artefato na instalação real da Hostinger,
com o Hermes 0.20.4 de verdade, feita pelo Work.

A distinção importa e é mantida em todo este documento:

```
TESTE LOCAL DE IMPLEMENTAÇÃO   fornecedor FALSO, lógica real     — prova a lógica
PROVA DE RUNTIME EM PRODUÇÃO   fornecedor REAL, runtime real     — prova o fato
```

Nenhuma quantidade de teste local poderia produzir a linha abaixo. Só a execução podia.

```
zip sha256   f0676c9c05f77e924cc945852423c8b84498ba5fccf59d2501d95ea117b5d2c7
MANIFEST     conferido · arquivos conferidos
python       /opt/venv/bin/python3
HERMES_HOME  /data
exit         0
```

```json
{
  "bridge_version": "1.1.0",
  "transport": "acp",
  "verdict": "OK",
  "compatible": true,
  "expected_hermes_version": "0.20.4",
  "expected_acp_protocol_version": "0.9.0",
  "expected_model_callable_tool_count": 0,
  "hermes_version": "0.20.4",
  "acp_protocol_version": "0.9.0",
  "effective_model_callable_tool_count": 0,
  "hermes_version_source": "distribution:hermes-agent",
  "acp_protocol_version_source": "distribution:agent-client-protocol",
  "tool_surface_source": "resolver + agent.tools"
}
```

Zero chamadas de modelo. Zero prompts. Nenhum dado da Creditum. `/opt` intocado,
configuração intocada, gateway intocado, nenhuma porta aberta.

### A sequência inteira, em três linhas

```
ACP de fábrica, medido em produção            15 ferramentas chamáveis pelo modelo
ponte Creditum 1.1.0, medida em produção      0
                                              → production_transport_verified = true
```

### O que a procedência revelou

Os dois bloqueios em aberto da r3 eram justamente as duas fontes que eu não tinha
observado. A produção respondeu as duas, e as respostas estavam **dentro das listas de
candidatos que a recusa nomeava**:

```
hermes_version_source        distribution:hermes-agent          1º candidato da lista
acp_protocol_version_source  distribution:agent-client-protocol 1º candidato da lista
tool_surface_source          resolver + agent.tools             3º candidato da lista
```

É o retorno concreto de nomear o que se procurou em vez de falhar em silêncio: nenhuma
rodada extra de descoberta foi necessária. E `agent.tools` confirma que a superfície
final em produção é um atributo **do agente construído** — não a resposta do resolvedor.
A união das duas leituras não era zelo teórico.

## 0.1. Invariantes que esta prova torna FINAIS para a 3.1b

```
TRANSPORTE          ACP sobre stdio · JSON-RPC 2.0        FINAL
FALLBACK HTTP       não existe                            FINAL
FALLBACK CLI        não existe                            FINAL
FALLBACK ONESHOT    não existe                            FINAL
```

Se o ACP não serve, a resposta é **recusa** — nunca outro caminho. Fallback silencioso
destruiria a auditabilidade justamente no ponto em que ela vale mais: a fronteira onde
se decide se o modelo pode agir.

Os pinos são exatos, sem faixa semver:

```
Hermes                    0.20.4
agent-client-protocol     0.9.0
ponte Creditum            1.1.0
```

Desvio em qualquer um dos três **falha fechado**. O upstream tem histórico de reescrever
nomes de toolset em migração de config sem erro e sem aviso; uma faixa aceitaria
exatamente a atualização que muda a superfície de capacidade sem avisar ninguém.

## 0.2. O ACP de fábrica continua INSEGURO

A prova de produção **não** reabilita o caminho de fábrica. O achado histórico fica de
pé, sem alteração:

```
Hermes 0.20.4 ACP de fábrica     INSEGURO PARA A CREDITUM
                                 15 ferramentas chamáveis pelo modelo
                                 entre elas terminal, execute_code, write_file,
                                 process, delegate_task
```

O que passou na produção foi a **ponte governada da Creditum**, e só ela é aprovada. O
que a prova diz é que a ponte funciona — não que o fornecedor virou seguro.

## 1. A r1 falhou certo, pela razão certa

O preflight de produção devolveu `RUNTIME_API_INCOMPATIBLE`, zero chamadas de modelo,
zero prompts, zero dados de negócio.

Isso não foi um bug: foi o projeto funcionando. A r1 foi escrita sem o Hermes
instalado, e a única coisa honesta a fazer com uma expectativa de API era conferi-la e
**nomear o que faltou**. Ela nomeou. A r2 foi ler.

O que a r2 encontrou:

```
NÃO existe          módulo de topo `hermes`
existe              run_agent.AIAgent
existe              model_tools.get_tool_definitions
existe              acp_adapter.session.SessionManager
```

Este documento registra a religação. **Não há mais adivinhação de API neste caminho.**

## 2. Os dois defeitos de fábrica, agora confirmados

```python
# 1 — o ACP de fábrica fixa a allowlist e NÃO passa a lista de negação
kwargs = {"platform": "acp",
          "enabled_toolsets": _expand_acp_enabled_toolsets(["hermes-acp"], ...)}

# 2 — o expansor colapsa vazio em padrão
for name in list(toolsets or ["hermes-acp"]):
```

`None` e `[]` viram a mesma coisa. A Creditum nunca chama esse expansor — a proibição
está nomeada em `STOCK_EXPANSION_SYMBOL` e provada por um teste que instala um espião no
módulo de fábrica e exige **zero chamadas**.

```
None   não especificado, use o padrão   →  20 ferramentas
[]     ZERO, e isso é uma decisão       →  0 ferramentas
```

## 3. A procedência entrou no relatório

`hermes_version: "0.20.4"` sem autor é indistinguível de um palpite — e foi um palpite
de API que a r2 precisou corrigir. Agora o relatório diz de onde soube:

```json
{
  "hermes_version": "0.20.4",
  "hermes_version_source": "distribution:hermes-agent",
  "acp_protocol_version_source": "distribution:agent-client-protocol",
  "tool_surface_source": "resolver + agent.tool_definitions"
}
```

Metadado de distribuição primeiro, módulo observado depois, `hermes chat` **nunca**.
Versão não determinável falha fechada listando onde procurou.

## 4. Medir o resolvedor não é medir o que chega ao modelo

```
model_tools.get_tool_definitions([])   um ESTÁGIO
a superfície do AIAgent construído     o que o modelo VÊ
```

Entre os dois cabem MCP, memória, plugins e skills. A medição é a **união** das duas
leituras — a fonte que enxerga uma ferramenta a mais está certa.

A mutação que conta só o resolvedor mata 5 testes. O que a mata é o cenário exato do
§11: o resolvedor devolve zero, dizendo a verdade sobre o estágio dele, e a memória
injeta depois. Quem contasse só ele entregaria o modelo a uma ferramenta com uma medição
impecável do lugar errado.

E superfície ilegível continua sendo **DESCONHECIDO**, nunca zero — no único lugar onde
zero é a resposta que queremos ver. O detalhe lista os atributos procurados **e** os que
existem e mencionam ferramenta, para que o bloqueio vire correção de uma rodada.

## 5. A allowlist volta para ser reconferida

O construtor recebe a lista por referência. `kwargs["enabled_toolsets"].append("mcp-x")`
é ampliação de capacidade que nenhuma leitura de configuração pegaria: o objeto
inspecionado e o objeto usado são o mesmo.

Estado novo, próprio:

```
LATE_TOOL_INJECTION_DETECTED
```

Não é "havia ferramentas". É "a negação explícita que entregamos foi desfeita" — uma
aponta para configuração, a outra para o runtime ter mexido no que era nosso. O adapter
da 3.1b mapeia qualquer veredito ≠ `OK` para `RUNTIME_CAPABILITY_MISMATCH`, e **nunca**
para `MODEL_ERROR`: nenhum modelo foi chamado.

## 6. Sessão restaurada é agente novo

`session/new` e `session/load` passam pelo **mesmo** portão, com a mesma autoridade de
construção. Tratar `load` como leitura de estado deixaria uma sessão salva voltar com o
padrão do produto — o caminho pelo qual a postura de zero se perde sem ninguém notar.

`session/fork` e `session/resume` não estão no vocabulário: se um dia existirem, caem em
`METHOD_NOT_FOUND`, que é recusa, em vez de num ramo genérico que reconstruiria um
agente sem conferir.

## 7. stdout continua sagrado — inclusive o do fornecedor

Código do fornecedor pode imprimir. Toda construção e toda leitura acontecem sob
`redirect_stdout(sys.stderr)`. Sem isso, um banner entraria no meio das mensagens
JSON-RPC e o adapter leria a linha como falha de transporte — um defeito que aparece só
em produção, e só às vezes.

## 8. §16 — qual estratégia de SessionManager, e por quê

```
A  subclasse do SessionManager de fábrica, sobrescrevendo só _make_agent
B  máquina de sessão de fábrica + fábrica de agente da Creditum
C  o menor invólucro possível
```

**Escolhido: C para a 3.1b, com B como alvo declarado da 3.1c.**

A razão é a mesma que motivou esta fase. A r2 capturou o construtor do agente e o
resolvedor de ferramentas; **não** capturou a assinatura de `SessionManager.__init__`
nem o contrato de chamada de `_make_agent`. Ligar-se a eles agora repetiria exatamente
o palpite que a r2 corrigiu — e desta vez sobre um método privado.

O invólucro atual não é uma reimplementação do ACP: cinco métodos, e `session/prompt`
recusa. A 3.1b nunca serve um prompt real. Quando a 3.1c precisar servir, a delegação
passa a ser necessária, e aí ela se apoia em observação, não em suposição.

O que falta observar está no §11 deste documento.

## 9. A armadilha que quase passou

A primeira rodada de mutações reportou **G sobrevivente** e, pior, deixou a suíte
falhando *depois* de restaurar os arquivos por hash.

A causa: o `python3` do CommandLineTools da Apple guarda bytecode **fora da árvore**, em
`sys.pycache_prefix`. A mutação L trocava `_err` por `_out` — **mesmo tamanho de arquivo,
mesmo segundo de escrita**. A validação do `.pyc` compara tamanho e mtime em segundos
inteiros: o cache passou como válido e o Python executou o bytecode **mutado** sobre o
fonte **restaurado**.

Fica registrado porque é a pior categoria de defeito de verificação: o arnês reintroduz
em silêncio o defeito que ele existe para detectar. Um `grep` no fonte dizia `_err`;
`inspect.getsource` dizia `_err`; `co_names` dizia `_out`.

Correções:

```
mutações rodam com PYTHONDONTWRITEBYTECODE=1
package.json: test:bridge usa python3 -B
```

E a mutação G revelou o outro erro: ela caía no ramo da **costura injetada**, não no
caminho real de leitura de atributo. O teste que a matava provava a comparação, não a
produção. Foi acrescentado um teste com um agente cuja superfície muda entre duas
leituras **reais**.

## 10. Mutações executadas

| mutação | resultado |
| --- | --- |
| A `run_agent` volta a ser `hermes` | ✗ mata 3 |
| B `[]` vira `None` antes do `AIAgent` | ✗ mata 2 |
| C kwargs governados usam o expansor de fábrica | ✗ mata 14 |
| D allowlist não é reconferida após a construção | ✗ mata 1 |
| E mede só o resolvedor, ignora o agente | ✗ mata 5 |
| F ciclo de vida da sessão não passa pelo portão | ✗ mata 2 |
| G leitura única — injeção entre leituras some | ✗ mata 1 *(após corrigir o teste)* |
| H superfície ilegível tratada como vazia | ✗ mata 2 |
| I versão não conferida | ✗ mata 8 |
| J `[] or default` — o defeito exato do upstream | ✗ mata 2 |
| K prompt reusa a medição anterior (TOCTOU) | ✗ mata 1 |
| L log contamina stdout | ✗ mata 6 |
| M stdout do fornecedor não é protegido | ✗ mata 1 |
| N contagem ausente vira zero no relatório | ✗ mata 2 |
| O procedência da versão é inventada | ✗ mata 1 |

Quinze executadas, quinze mortas. Restauração conferida por hash **e** por suíte verde
depois, sem bytecode em cache.

## 11. O que bloqueava a 3.1b — e o que a produção resolveu

O texto abaixo é o que estava escrito **antes** da execução em produção. Fica como
estava; a resolução vem depois. Registro não se reescreve.

> ```
> 1  a fonte da versão 0.20.4 em Python ainda não foi OBSERVADA
> 2  o atributo que expõe a superfície final do AIAgent não foi OBSERVADO
> 3  a assinatura de SessionManager.__init__ / _make_agent não foi OBSERVADA  (3.1c)
> ```
>
> Os dois primeiros são a razão de o preflight poder recusar de novo — e, se recusar, o
> `detail` **nomeia** o que procurou e o que existe. Uma rodada resolve.
>
> `production_transport_verified` continua `false`. A ponte é implementação, não prova.

Resolução, pela execução descrita no §0:

```
1  RESOLVIDO   distribution:hermes-agent · distribution:agent-client-protocol
2  RESOLVIDO   agent.tools
3  ABERTO      continua sendo trabalho da 3.1c, e ninguém depende dele agora
```

**`production_transport_verified = true`.** A ponte deixou de ser só implementação: a
contagem zero foi medida no runtime real, antes de qualquer chamada de modelo.

O que a prova NÃO estabelece, e não deve ser lido como se estabelecesse:

```
não prova que o raciocínio da Creditum funciona     — é 3.1c
não instala constituição, persona ou regra          — é 3.1c
não autoriza a primeira chamada de modelo           — é 3.1c
não torna o ACP de fábrica seguro                   — ver §0.2
```

A invariante de invocação segue valendo por inteiro: antes da chamada de modelo **e**
antes de **cada** prompt futuro, a contagem efetiva tem de ser 0 — e desconhecido nunca
é zero.
