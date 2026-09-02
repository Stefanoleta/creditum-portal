# Fase 3.1b-r1 — a ponte ACP de zero ferramentas

```
TRANSPORTE ESCOLHIDO       ACP (stdio · JSON-RPC 2.0)
ACP DE FÁBRICA É SEGURO    NÃO — 15 ferramentas efetivas em produção
FORNECEDOR EM /opt         NÃO MODIFICADO
VAZIO EXPLÍCITO PRESERVADO SIM
CHAMADAS DE MODELO         0
TESTES                     40 (Python) + 33 (adapter TS) · 7 mutações, 7 mortas
STATUS                     IMPLEMENTED · produção NÃO VERIFICADA
```

## 1. O defeito, em uma linha de Python

```python
toolsets or ["hermes-acp"]
```

Em Python, `[] or X` devolve `X`. A lista **vazia** — que significa "explicitamente
nenhuma ferramenta" — é falsy, e some.

```
None   não especificado, use o padrão
[]     ZERO, e isso é uma decisão
```

Colapsar os dois transforma uma negação explícita no seu oposto exato. O resultado em
produção foi **15 ferramentas chegando ao modelo**, incluindo `terminal`,
`execute_code`, `write_file`, `process` e `delegate_task`.

É a mesma família de defeito que este projeto persegue desde a Fase 2 — ausência
virando default, desconhecido virando valor. Só que aqui o valor errado é permissão de
agir.

A correção usa `is None`, não truthiness:

```python
default if requested is None else list(requested)
```

## 2. Por que uma ponte, e não um patch

O ambiente é gerenciado. O fornecedor vive em `/opt/hermes-agent`; o estado persistente
da Creditum vive em `/data`.

Editar `acp_adapter/session.py` no lugar seria:

```
difícil de auditar      o diff mora fora do repositório
possivelmente efêmero   perdido no próximo redeploy ou update
silencioso              some sem ninguém notar
irreprodutível          "funciona lá" não é uma garantia
```

Então o Hermes 0.20.4 oficial fica **intocado**, e a Creditum é dona de uma camada fina
em volta. O artefato do repositório é a fonte da verdade.

## 3. As três camadas, e por que separadas

```
capability.py   DECIDE       não importa Hermes — testável sem runtime
runtime.py      DESCOBRE     única superfície que toca o fornecedor
bridge.py       FALA         JSON-RPC por stdio, e o portão
```

`capability.py` não importa nada do Hermes. É isso que torna a lógica de segurança
provável no ambiente de desenvolvimento, onde o runtime não existe. Toda decisão mora
lá; a ponte obedece.

Se a 0.20.4 expuser nomes diferentes dos esperados, o conserto é em `runtime.py` e em
nenhum outro arquivo.

## 4. A honestidade que `runtime.py` precisa ter

A ponte foi escrita **sem o Hermes instalado**. Os nomes de API são expectativa, não
observação.

Por isso nada adivinha em silêncio. Cada símbolo procurado é conferido, e o que falta é
**nomeado**:

```json
{
  "verdict": "RUNTIME_API_INCOMPATIBLE",
  "compatible": false,
  "detail": "construtor de agente não encontrado; procurado como `hermes.AIAgent`, ..."
}
```

Supor que `AIAgent` existe e estourar um `AttributeError` no meio de uma sessão trocaria
uma recusa clara por um erro ambíguo — e ambiguidade na fronteira de capacidade é o
começo de uma suposição de que está tudo bem.

Falhar dizendo qual símbolo faltou é o que permite consertar em uma iteração, em vez de
investigar.

## 5. As duas invariantes, e a ordem entre elas

```
PRIMÁRIA     enabled_toolsets == []           permissão vazia
SECUNDÁRIA   disabled_toolsets                defesa em profundidade
```

A segunda **nunca** sustenta a segurança sozinha: negar por enumeração exige conhecer
tudo que existe, e a próxima ferramenta que o upstream criar nasce fora da lista. A
allowlist vazia não tem esse problema — ela nega por construção.

Um teste prova que, mesmo com a lista de negação esvaziada, a invariante primária
decide.

## 6. Configuração não é prova

```
inspecionar config.yaml            →  intenção
inspecionar enabled_toolsets       →  intenção
CONTAR as definições após init     →  fato
```

A pré-checagem constrói o agente de verdade e **mede** o que sobrou. Vale a contagem
final, depois de tudo que MCP, memória, plugins, skills e contexto tenham injetado.

Um teste simula injeção **tardia** — o agente nasce limpo e ganha ferramenta depois da
construção — e a pré-checagem pega. Contar no começo não pegaria.

E a contagem **não determinável** bloqueia igual à contagem alta: *"não sei quantas
ferramentas o modelo pode chamar"* é tão inaceitável quanto *"sei que são quinze"*.

## 7. O portão, e por que ele repete

`initialize`, `session/new` e **cada** `session/prompt` reconferem.

Entre a pré-checagem e o pedido, o runtime pode ganhar ferramenta. Medir uma vez no
começo responderia sobre um estado que já passou.

A mutação que faz o prompt reusar a medição anterior **sobreviveu** ao meu primeiro
teste — porque ele fazia um único prompt, e o cache só morde no segundo. O cenário que
importa é a sessão longa. Com o teste de dois prompts, a mutação morre.

Fica registrado porque é a armadilha de sempre: a mutação passou por teste fraco, não
por código certo.

## 8. stdout é sagrado

```
stdout   uma mensagem JSON por linha, e nada mais
stderr   todo o diagnóstico
```

Um teste afirma que **toda** linha de stdout parseia como JSON, inclusive nos caminhos
de recusa. A mutação que manda log para stdout mata três testes.

JSON malformado vira erro de parse **sem derrubar o processo** — derrubar transformaria
um pedido ruim numa queda de serviço. A mensagem seguinte é atendida normalmente.

## 9. Sem fallback, em nenhuma direção

```
ACP falha  →  recusa
ACP falha  →  NÃO vira HTTP
ACP falha  →  NÃO vira `hermes chat`
ACP falha  →  NÃO vira `hermes -z`
```

O defeito de vazio→`None` do HTTP fica documentado e **não corrigido**: HTTP está fora
do caminho de produção escolhido, e consertá-lo criaria um caminho alternativo que
ninguém governou.

Fallback silencioso destrói auditabilidade. Se o ACP não serve, a resposta é recusa.

## 10. A 3.1b-r1 não chama modelo nem quando compatível

`session/prompt` recusa com `REASONING_CONTRACT_NOT_INSTALLED` mesmo com a capacidade
provada. O contrato de raciocínio é da 3.1c, e chamar o modelo sem ele seria perguntar
sem saber o que se está pedindo.

A recusa é governada e testada — não é um caminho esquecido.

## 11. Integração com o adapter da 3.1b

O adapter continua dono de tudo que é dele: validação do read model, impressão digital
de runtime, pré-checagem, timeout, auditoria, validação de saída e classificação de
falha. A ponte é infraestrutura de compatibilidade de transporte, e **nenhuma regra de
negócio mora nela**.

Estado novo no vocabulário do adapter:

```
RUNTIME_CAPABILITY_MISMATCH    a ponte recusou o runtime
```

Estado **próprio**, e nunca `MODEL_ERROR` — nenhum modelo foi chamado. Mapear
incompatibilidade de runtime para erro de modelo diria que o Hermes respondeu mal quando
ele nem foi perguntado, e mandaria quem investiga para o lugar errado.

## 12. Mutações executadas

| mutação | resultado |
| --- | --- |
| A `[] or default` — o defeito exato do upstream | ✗ mata 1 |
| B allowlist da Creditum vira `["hermes-acp"]` | ✗ mata 3 |
| C expansão dinâmica sempre permitida | ✗ mata 1 |
| D definições ilegíveis tratadas como vazias | ✗ mata 6 |
| E prompt reusa medição anterior (TOCTOU) | ✗ mata 1 *(após corrigir o teste)* |
| F versão não conferida | ✗ mata 6 |
| G log contamina stdout | ✗ mata 3 |

Sete executadas, sete mortas. Restauração conferida por hash.

## 13. Pacote de deploy para a Hostinger

Os arquivos que o operador precisa levar:

```
bridge/creditum_hermes_acp/__init__.py
bridge/creditum_hermes_acp/capability.py
bridge/creditum_hermes_acp/runtime.py
bridge/creditum_hermes_acp/bridge.py
bridge/creditum_hermes_acp/__main__.py
```

Sem dependência externa: só a biblioteca padrão do Python. Nada a instalar.

### Procedimento de verificação

```bash
# 1. levar o pacote para armazenamento controlado pela Creditum
#    (ex.: /data/creditum-bridge/ — o caminho é seu, não está hard-coded)

# 2. pré-checagem, com o perfil de produção
export HERMES_HOME=/data
cd /data/creditum-bridge
python3 -m creditum_hermes_acp --preflight
```

Saída esperada quando compatível:

```json
{
  "bridge_version": "1.0.0",
  "transport": "acp",
  "verdict": "OK",
  "compatible": true,
  "hermes_version": "0.20.4",
  "acp_protocol_version": "0.9.0",
  "effective_model_callable_tool_count": 0
}
```

Código de saída **0** quando compatível, **1** quando não — para que um script decida
sem parsear.

### O que o operador precisa reportar

```
o JSON inteiro do preflight
```

Se vier `RUNTIME_API_INCOMPATIBLE`, o campo `detail` nomeia exatamente o símbolo que
faltou. É o que permite adaptar `runtime.py` em uma iteração.

### O que o procedimento NÃO faz

```
não chama modelo        não envia prompt         não envia dado da Creditum
não muda config         não liga/desliga ferramenta
não reinicia gateway    não atualiza o Hermes    não lê .env
não abre porta          não modifica /opt
```

## 14. O que ainda bloqueia a 3.1b

A ponte é **implementação**, não prova. `production_transport_verified` continua
`false` até o preflight rodar na Hostinger com o Hermes real e devolver
`compatible: true` com contagem zero.

Só depois disso o gate adversarial faz sentido — revisar uma prova que ninguém produziu
seria revisar uma intenção.

---

**Posfácio (r3).** O preflight rodou na Hostinger e devolveu `RUNTIME_API_INCOMPATIBLE`:
o módulo de topo `hermes` que esta versão esperava não existe. A recusa nomeou o símbolo
que faltava, a fase 3.1b-r2 foi ler a API real, e a 3.1b-r3 religou a ponte a
`run_agent.AIAgent` e `model_tools.get_tool_definitions`. A prova de produção está em
`FASE_3_1B_R3_OBSERVED_RUNTIME_BINDING.md` §0. O que está escrito acima fica como
estava — era o estado correto do conhecimento naquele momento.
