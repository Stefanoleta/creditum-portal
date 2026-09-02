# Fase 3.1b — a fronteira Creditum ↔ Hermes

```
ADAPTER                        CreditumHermesAdapter
OPERAÇÃO                       reason(request) — uma, e só uma
EXECUÇÃO ARBITRÁRIA DE CLI     não existe superfície
TRANSPORTE DE PRODUÇÃO         ACP · production_transport_verified = true  (r3 §0)
IDENTIDADE EXIGIDA             completa e exata (r4 §14)
DADO DA CREDITUM ENVIADO       nenhum
CHAMADA DE MODELO              nenhuma
TESTES                         99 · transporte falso, nada mais mockado
```

## 1. A separação que esta fase estabelece

```
ambiente de desenvolvimento        ambiente de produção
(este repositório, macOS)          (container Hostinger)
                                   Hermes v0.20.4 · HERMES_HOME=/data
   adapter + testes         →      sonda read-only        →   evidência
```

O runtime autoritativo **não é alcançável daqui**: sem executável, sem `/data`, sem
chave SSH, sem config de host. Verifiquei os sete caminhos antes de afirmar.

A consequência é a decisão central desta fase: **o transporte não foi escolhido**.
Escolher ACP, servidor HTTP ou subprocesso de CLI a partir de documentação seria adotar
por leitura o que só a instalação prova — e a doc do upstream já se mostrou incompleta
na 3.1a, onde ela nem descrevia modo de zero ferramentas que a produção conseguiu
persistir.

Então o transporte é uma **porta injetada**, e não existe implementação de produção
neste commit. A `scripts/hermes-production-probe.sh` é o que resolve isso.

## 2. A regra que dá razão ao adapter existir

```
NENHUM componente da Creditum chama comando arbitrário do Hermes.
```

Cada chamador montando a própria invocação significaria cada chamador com a própria
ideia de quais ferramentas o modelo pode chamar, qual versão serve e o que fazer quando
algo não bate. A pergunta *"o Hermes pode agir?"* tem de ter **um** lugar onde é
respondida.

Não existe `executeHermes(args: string[])`, nem string de comando, nem shell, nem
interpolação de conteúdo em linha de comando — um teste enumera os métodos do protótipo
e afirma que só há `reason`. Não há superfície onde injeção de comando caiba: dado viaja
como dado, por porta tipada.

## 3. A ordem, que é a garantia

```
1  envelope canônico        objeto externo não é dado estável (3.0c)
2  read model validado      contrato canônico, ANTES de qualquer transporte
3  PRÉ-CHECAGEM             versão · perfil · superfície de ferramentas
4  só então                 o transporte é acionado
5  saída validada           hermes-insight, nunca confiada
```

Inverter 3 e 4 seria perguntar ao modelo antes de saber se ele pode agir. Testes contam
`probes` e `sends`: em toda recusa de pré-checagem, `sends === 0`.

## 4. Zero ferramentas é precondição, não preferência

```
esperado    0
observado   tem de ser 0
ausente     TAMBÉM bloqueia
```

A terceira linha é a que importa. *"Não sei quantas ferramentas o modelo pode chamar"* é
tão inaceitável quanto *"sei que são três"* — e aceitar o desconhecido aqui seria aceitar
tudo. Contagem ausente e contagem não-zero caem no **mesmo** estado
(`TOOL_SURFACE_MISMATCH`) de propósito.

E a auditoria registra a ausência como ausência: `observed_tool_count` **não aparece**
quando não foi observado. Não vira zero. É a regra que atravessa este projeto desde a
Fase 2.

## 5. Versão exata, nunca faixa

`0.20.4`. Não `latest`, não `>=0.20.4`, não `0.20.x`.

O motivo é upstream e documentado: há relato de migração de config reescrevendo nomes de
toolset **em silêncio** — sem erro, sem aviso, sem log. Uma faixa de versão aceitaria
justamente a atualização que muda a superfície de capacidade sem avisar ninguém.

Deriva em **qualquer direção** bloqueia. Uma versão nova não testada é tão desconhecida
quanto uma antiga. Subir de versão é gate novo, com sonda nova — não é configuração.

## 6. Estados fechados, e nenhum deles é vazio

```
SUCCESS
RUNTIME_NOT_AVAILABLE      nenhum runtime alcançável
RUNTIME_VERSION_MISMATCH   deriva de versão, para mais ou para menos
RUNTIME_PROFILE_MISMATCH   HERMES_HOME diferente do governado
TOOL_SURFACE_MISMATCH      ≠ 0, OU não determinável
TRANSPORT_ERROR            falha ao iniciar, escrever ou ler
TIMEOUT                    estado próprio
PROTOCOL_ERROR             stdout contaminado, enquadramento inválido
MODEL_ERROR                o modelo respondeu com erro
OUTPUT_NOT_VALIDATED       saída fora do contrato canônico
INVALID_READ_MODEL         entrada não satisfaz hermes-read-model
INVALID_REQUEST            envelope não-canônico ou campo desconhecido
```

**Um Hermes travado não é um Hermes sem achados.** Um teste monta os dois lado a lado:
`timeout` dá `TIMEOUT` sem campo `insights`; resposta com zero achados dá `SUCCESS` com
`insights: []` — zero **conhecido**, porque houve resposta. Nenhuma falha carrega
`insights`.

## 7. A saída é validada contra o contrato que já existe

`hermes-insight`, da 3.0a. **Nenhum schema novo foi inventado** — a 3.1c define *quais*
insights se espera; a 3.1b só afirma que o que voltar tem a forma governada.

Um insight fora do contrato invalida a resposta **inteira**. Descartar o inválido e
seguir com os demais entregaria um conjunto que *parece* íntegro, e o descartado pode ser
justamente o que trazia a ressalva. É a mesma decisão de `decisoesCanonicas` na 3.0a.

## 8. Auditoria: metadado seguro, e só

```
run_id · requested_at · completed_at · duration_ms
adapter_protocol_version · transport · provider · model
expected/observed_tool_count · expected/observed_hermes_version
read_model_ref · input_content_hash · output_content_hash · status
```

Sem PII, sem credencial, sem `.env`, sem conteúdo bruto — e **sem cadeia de raciocínio
privada do modelo**. Guardar o pensamento interno seria guardar algo que ninguém
governou e que não se pode auditar; o que fica é o que foi validado.

`run_id` é determinístico: SHA-256 do material do pedido. Sem `Date.now`, sem
`Math.random`, sem UUID. Dois pedidos idênticos têm a mesma id, e é isso que permite
reconhecer repetição em vez de contá-la duas vezes. Um teste faz `Date.now` e
`Math.random` lançarem durante a montagem.

`duration_ms` sai de dois instantes **fornecidos** — `requested_at` do chamador,
`completed_at` do transporte, que é a borda impura. Quando não dá para calcular, o campo
**não aparece**. `?? 0` diria "levou zero".

## 9. A matriz de decisão — e por que ela não fecha aqui

| critério | ACP (stdio JSON-RPC) | servidor HTTP | subprocesso CLI |
| --- | --- | --- | --- |
| A enquadramento determinístico | JSON-RPC enquadrado | HTTP | texto para parsear |
| B protocolo de máquina | sim | sim | **não** |
| C ciclo de sessão | documentado | depende | `-q` é one-shot |
| D cancelamento | documentado | depende | matar processo |
| E stdout/stderr separados | **stdout só protocolo** | n/a | banner mistura |
| F superfície de ferramenta | por sessão | por config | `--toolsets` por sessão |
| G sem listener de rede | **sim** | **não** | sim |
| H compatível com Hostinger | provável | exige porta | sim |
| I complexidade em TS | média | baixa | baixa |
| J compatibilidade de upgrade | protocolo versionado | protocolo estável | help/flags mudam |
| K auditabilidade | alta | alta | baixa |
| L comportamento em falha | erro de protocolo | HTTP status | texto ambíguo |

**Recomendação, marcada como hipótese:** ACP por stdio, se a sonda provar que v0.20.4 o
expõe com ciclo de sessão utilizável. Ganha em G — nenhum listener novo — e em E, que é
o que separa protocolo de banner.

**O que derruba a recomendação:** se `hermes acp --help` não existir em v0.20.4, ou se o
subcomando não oferecer criação de sessão e cancelamento. Nesse caso a decisão volta para
você, porque a alternativa (raspar texto de CLI) contraria o critério B, e o servidor HTTP
contraria G.

Nada disso é conclusão. `production_transport_verified = false` até a sonda rodar.

## 10. A sonda de produção

`scripts/hermes-production-probe.sh` — somente leitura, saída JSON sanitizada.

```
NÃO faz    chamada de modelo · prompt · dado da Creditum
           mudança de config · liga/desliga ferramenta
           restart de gateway · update do Hermes · leitura de .env
FAZ        --version · --help · tools --summary · config get · config path
           teste de existência de arquivo
```

O conteúdo do `config.yaml` **não** é impresso: ele pode carregar credencial de provider.
A sonda afirma que o arquivo existe e onde, e nada mais.

Todo texto de saída passa por um redator antes de entrar no JSON — padrões de chave,
token, `Bearer` e cadeias longas viram `<redigido>`. Conservador de propósito: apagar um
valor inocente é melhor que vazar um segredo. O redator evita `\b` porque a âncora de
palavra não é portável entre BSD e GNU `sed`, e um redator que só funciona num dos dois
é um redator que não funciona.

A sonda **não conclui** a contagem de ferramentas. Ela captura a evidência; quem conclui
é o gate — porque o banner do CLI não é autoridade, e a pergunta canônica continua sendo
*quantas definições de ferramenta são passadas ao modelo*.

## 11. Onde vive, e por quê

```
integration/src/hermes/adapter.ts        a fronteira
integration/tests/hermes/adapter.test.ts os testes
scripts/hermes-production-probe.sh       a sonda
```

`integration/src/hermes/` e não `briefing/`: isto é integração de runtime, não montagem
de percepção. A direção de dependência segue a mesma — consome tipos de `integration`,
valida contra contratos de `gateway`.

Duas factories próprias entraram em `gateway/src/hermes.ts`:
`toOwnedHermesReadModel` e `toOwnedHermesInsight`, no mesmo padrão das cinco que a
remediação de ownership da 3.0a estabeleceu. Validar não pode congelar o objeto de quem
perguntou.

## 12. O que a 3.1b deliberadamente NÃO fez

```
prompt constitucional     3.1c — e criar o slot antes da regra convidaria a preenchê-lo
transporte de produção    depende da sonda
memória                   nenhuma; o adapter não depende de conversa anterior
sessão                    política é da 3.1c/3.1d
ferramenta habilitada     nenhuma
listener de rede          nenhum
gateway                   não tocado
provider/modelo           não alterados
```

Não existe campo de prompt, persona, regra ou instrução no envelope de pedido. O contrato
de raciocínio é da fase seguinte.

## 13. Perguntas abertas para a 3.1c

1. **Saída estruturada.** A doc de comandos não expõe flag de JSON. Sem contrato de
   saída, o resultado do Hermes não tem como ser validado — e todo este projeto se apoia
   em validar na fronteira. A sonda captura `chat --help`, `acp --help` e `serve --help`
   para responder.
2. **Injeção automática de contexto.** O transporte escolhido carrega `AGENTS.md`,
   `SOUL.md`, memória, skills ou regras sozinho? Se não der para isolar de forma
   previsível, é bloqueador de uso — não de investigação.
3. **Concorrência.** Uma sessão por vez, ou sessões isoladas? Até haver prova de
   separação, execução serializada.

## 14. Remediação 3.1b-r4 — os dois HIGH do gate adversarial

O gate do Codex devolveu **BLOCK** com dois achados HIGH. Os dois procediam. Ambos
estavam no adapter; a ponte Python não foi tocada, e continua byte a byte idêntica ao
artefato provado em produção — nenhuma resonda foi necessária.

### 14.1. A identidade do caminho aprovado estava incompleta

A pré-checagem conferia versão do Hermes, perfil e contagem de ferramentas. Nenhum
desses três campos diz **quem** está relatando.

```
relatado por qualquer processo      hermes 0.20.4 · /data · contagem 0
provado por ninguém                 quem mediu essa contagem
```

E o ACP de fábrica — o mesmo que em produção entregou 15 ferramentas ao modelo — é
justamente um processo capaz de produzir esse relato. O que separou 15 de 0 não foi o
Hermes: foi a ponte governada. Então a identidade dela é precondição, não log.

`bridge_version`, `acp_protocol_version` e `capability_verdict` eram opcionais. Um
`capability_verdict` ausente era lido como *"o transporte não é a ponte, siga pelas
outras conferências"* — uma dispensa da prova disfarçada de tolerância. Havia até um
teste afirmando isso, e ele passava: **o teste codificava o defeito.** Foi invertido.

A expectativa governada agora nomeia o caminho inteiro:

```
transport                 acp
bridge_version            1.1.0
acp_protocol_version      0.9.0
capability_verdict        OK
hermes_version            0.20.4
hermes_home               /data
tool count                0
```

Sete campos, todos obrigatórios, todos exatos. Ausente falha igual a divergente.

**Ordem.** A identidade é conferida **depois** de versão, perfil e contagem, de
propósito. Quando o Hermes sobe de versão, a ponte recusa e o veredito deixa de ser
`OK`; conferir identidade primeiro reportaria `RUNTIME_CAPABILITY_MISMATCH` e esconderia
o fato mais específico. Nenhum envio escapa em nenhuma das ordens — o que muda é a
qualidade do diagnóstico. Um teste fixa essa escolha.

### 14.2. Resposta truncada virava zero achados

```ts
for (const bruto of brutos ?? []) { ... }   // undefined vira []
```

`{ outcome: "responded" }` sem payload atravessava como `SUCCESS` com `insights: []`.

```
{ outcome: "responded", insights: [] }   olhou e não viu nada    VÁLIDO
{ outcome: "responded" }                 chegou pela metade      INVÁLIDO
```

É a mesma família de defeito que este projeto persegue desde a Fase 2 — ausência virando
zero — e aqui o custo é o maior de todos: o zero fabricado é um relatório de inteligência
dizendo que está tudo bem.

`TransportResponse` virou união discriminada: o ramo `responded` não tem como omitir
`insights`, e os outros não têm como carregá-lo. A conferência em tempo de execução
continua existindo — o transporte é a borda impura, e tipo não vale como prova do lado de
lá. `null`, objeto, string e número caem pelo mesmo motivo: enquadramento correto com
payload que não é o payload.

A validação inteira-ou-nada foi preservada: um insight fora do contrato invalida a
resposta toda. Descartar o inválido e seguir entregaria um conjunto que parece íntegro, e
o descartado pode ser justamente o que continha a ressalva.

### 14.3. Mutações

| mutação | resultado |
| --- | --- |
| 1 `bridge_version` volta a ser opcional | ✗ mata 1 |
| 2 `acp_protocol_version` volta a ser opcional | ✗ mata 1 |
| 3 transporte arbitrário é aceito | ✗ mata 3 |
| 4 veredito ausente é aceito | ✗ mata 1 |
| 5 volta o `insights ?? []` | ✗ mata 2 |
| 6 `null` vira lista vazia | ✗ mata 3 |

Seis executadas, seis mortas. Restauração conferida por hash e por suíte verde depois.

## 15. Remediação 3.1b-r5 — o envelope inteiro do transporte

Histórico dos gates, sem reescrita:

```
1º gate Codex      BLOCK · 2 HIGH
r4                 os dois fechados
2º gate Codex      BLOCK · 1 HIGH novo
r5                 validação completa do envelope de transporte
```

### 15.1. O `switch` sem `default`

`TransportResponse` virou união discriminada na r4, e isso vale para quem **compila**
contra ela. O transporte é a borda impura.

```ts
switch (resposta.outcome) {
  case "timeout": ...
  case "responded": break
  // e nada mais
}
```

`{ outcome: "cancelled", insights: [] }` não casava com caso nenhum, seguia adiante,
passava pela validação de saída com uma lista vazia e saía como **SUCESSO com zero
achados** — indistinguível de *"o Hermes olhou e não viu nada"*.

Mesma família de defeito de sempre, na sua forma mais cara: desconhecido virando a
resposta tranquilizadora.

### 15.2. Duas defesas, não uma

```
A  validador de envelope     em tempo de EXECUÇÃO, antes de qualquer leitura semântica
B  `default` com `never`     em tempo de COMPILAÇÃO, para o desfecho que ainda não existe
```

O vocabulário virou fechado — `responded`, `timeout`, `protocol_error`, `model_error`,
`transport_error` — e os campos permitidos são fechados **por desfecho**. Um `insights`
chegando junto de `timeout` não é um extra inofensivo: é um transporte com outra ideia
do contrato, e a versão seguinte dele pode ter ideias piores.

Desfecho ausente e desfecho desconhecido são o **mesmo** estado: nos dois casos ninguém
sabe o que o transporte quis dizer, e "não sei" não vira desfecho por omissão.

**Uma leitura por campo.** O envelope devolvido é construído do que foi lido, nunca do
objeto do transporte. Sem isso, `outcome` seria consultado no `switch` e `insights`
depois — duas leituras, e um acessor poderia responder `"responded"` na primeira e outra
coisa na segunda. Disciplina da 3.0c, aplicada à saída.

**Nada é lido antes da conferência**, nem `completed_at`. Ler antes seria usar a forma
para descobrir se a forma é confiável — e um `null` ali viraria exceção escapando por
fora do envelope de falha governado.

### 15.3. A camada certa para cada defeito

```
enquadramento errado    PROTOCOL_ERROR         envelope, desfecho, campos
payload errado          OUTPUT_NOT_VALIDATED   `insights` ausente, não-array, inválido
```

A primeira tentativa capturava o envelope inteiro com `snapshotPlainData`. Dois testes
morreram, e estavam certos: um insight com `Proxy` passou a ser reportado como falha de
**protocolo**, quando o enquadramento estava correto e quem errou foi o payload. Perder
essa distinção manda quem investiga para a camada errada.

A conferência do envelope é **estrutural e rasa**. `snapshotPlainData` continua sendo
aplicado a cada insight, onde ele é a defesa certa.

### 15.4. Mutações

| mutação | resultado |
| --- | --- |
| A sem `default` no switch semântico | **sobreviveu — equivalente em execução** |
| B desfecho desconhecido vira `responded` | ✗ mata 7 |
| C desfecho ausente vira `responded` | ✗ mata 2 |
| D o validador de envelope é pulado | ✗ mata 8 |
| E volta o `insights ?? []` | ✗ mata 3 |
| F resposta não-objeto é aceita | ✗ mata 1 *(após corrigir o teste)* |

**A é um mutante equivalente, e fica registrado como tal.** O `default` é inalcançável em
execução — a defesa A já recusa o desfecho desconhecido antes do `switch`. O que ele vale
é em compilação, e isso foi medido separadamente: com um sexto desfecho entrando na união
sem tratamento,

```
COM `default`   TS2322: Type '{ outcome: "cancelled" }' is not assignable to type 'never'
SEM `default`   TS2339: Property 'insights' does not exist on type ...
```

As duas quebram. Mas a primeira é a guarda disparando no lugar certo e **nomeando o
desfecho não tratado**; a segunda é acidente — só existe porque o código adiante lê um
campo específico do ramo. Se um dia ele não ler, não sobra nada.

**F sobreviveu à primeira rodada, e a culpa era do teste.** `"responded"`, `0` e `[]` não
têm propriedade `outcome`, então a conferência de vocabulário já os pegava sozinha. O
caso que separa as duas defesas é o não-objeto que **carrega** um desfecho válido —
`Object.assign([], { outcome: "responded", insights: [] })` — e ele existe. Com o teste
certo, a mutação morre.

É a armadilha de sempre, e a terceira vez que ela aparece nesta fase: a mutação passou
por teste fraco, não por código certo.

## 16. Remediação 3.1b-r6 — estado herdado não é estado de protocolo

Histórico dos gates, sem reescrita:

```
1º gate Codex      BLOCK · 2 HIGH        identidade incompleta · insights ausente
r4                 os dois fechados
2º gate Codex      BLOCK · 1 HIGH        desfecho desconhecido caindo em sucesso
r5                 fechado
3º gate Codex      BLOCK · 1 HIGH        estado herdado / protótipo
r6                 envelope de dados PRÓPRIOS
```

### 16.1. O exploit

```js
Object.create({ outcome: "responded", insights: [] })
```

Esse objeto não tem **uma** propriedade própria.

```
Object.keys(resposta)     []            a conferência de campos fechados passa no vazio
resposta.outcome          "responded"   a leitura sobe a cadeia de protótipos
resposta.insights         []
```

Resultado: **SUCESSO com zero achados** a partir de um envelope que não continha
resposta nenhuma. A r5 conferia o vocabulário e os campos, mas lia com acesso normal a
propriedade — e acesso normal não distingue *ter* de *herdar*.

**`outcome` herdado é `outcome` ausente.**

### 16.2. Descritores, nunca leitura

Toda a conferência passou a ser feita sobre `getOwnPropertyDescriptors`, que **não
executa getters**. Ler `objeto.outcome` para descobrir se `outcome` é confiável já teria
executado o código de terceiro que estávamos tentando avaliar — a garantia é *não ler*,
e não *ler uma vez*. Mesma disciplina da 3.0c.

A ordem é obrigatória:

```
1  null · não-objeto · array
2  Proxy                        antes de qualquer operação que dispare trap
3  protótipo                    Object.prototype ou null, e nada mais
4  chaves de símbolo
5  descritores                  todo campo próprio: enumerável e de DADOS
6  outcome                      do descritor, nunca do objeto
7  campos fechados por desfecho
8  só então, `.value`
```

Um `outcome` não-enumerável é um discriminador **escondido**, que é pior que um ausente.

### 16.3. Duas decisões registradas

**Protótipo `null` é aceito.** `Object.create(null)` é *mais* restrito que um literal,
não menos: sem cadeia de protótipos, não há de onde herdar nada. É a mesma política de
`snapshotPlainData` na 3.0c — manter duas políticas de protótipo no projeto seria manter
duas ideias do que é dado canônico, e a que valeria seria a que ninguém olhou.

**A conferência continua rasa.** `snapshotPlainData` segue aplicado a cada insight, onde
é a defesa certa. Capturar o envelope em profundidade reclassificaria um insight
não-canônico como falha de PROTOCOLO — e o enquadramento estava correto; quem errou foi
o payload. A lição é da r5 e foi preservada.

### 16.4. Duas medições que corrigiram a asserção, não o código

**O Proxy dispara um `get`, e ele não é nosso.** `send()` é `async`: a resolução da
promise pergunta a qualquer valor devolvido se ele é um *thenable*, lendo `.then`. Isso
acontece antes de o adapter ver o objeto e nenhum código nosso pode evitá-lo. O teste
afirma o que de fato importa e é verificável: **zero traps estruturais**
(`ownKeys`, `getOwnPropertyDescriptor`, `getPrototypeOf`) e **nenhum campo de protocolo
lido** — as chaves lidas são exatamente `["then"]`.

**`toHaveProperty` sobe a cadeia de protótipos.** No teste de poluição, a asserção
enxergava a poluição que o próprio teste tinha acabado de instalar. A pergunta passou a
ser sobre propriedade **própria** — exatamente o erro que aquele teste existe para pegar.

### 16.5. Mutações

| mutação | resultado |
| --- | --- |
| A/B `outcome` lido por acesso normal | ✗ mata 1 *(após corrigir o teste)* |
| C `insights` lido por acesso normal | ✗ mata 1 *(após corrigir o teste)* |
| D descritor de acessor é aceito | ✗ mata 1 |
| E campo não-enumerável é aceito | ✗ mata 2 |
| F conferência de protótipo removida | ✗ mata 3 |
| G detecção de Proxy removida | ✗ mata 1 |
| H chave de símbolo é aceita | ✗ mata 1 |

Sete executadas, sete mortas.

**A/B e C sobreviveram à primeira rodada**, e de novo a culpa era do teste. A conferência
de protótipo já recusava todo `Object.create({...})`, então trocar descritor por acesso
normal não mudava nada nos casos que eu tinha. O objeto que separa as duas defesas é o
que tem protótipo **canônico** e ainda assim herda:

```js
Object.defineProperty(Object.prototype, "outcome", { value: "responded" })
// agora `{}` responde "responded" — e o protótipo dele é impecável
```

Poluição de `Object.prototype` não é hipótese acadêmica: é a mesma família de ataque que
a 3.0c trata em `__proto__`, e basta uma dependência descuidada. Com esse teste, as duas
mutações morrem.

Quarta vez nesta fase que a armadilha aparece: **a mutação passou por teste fraco, não
por código certo.** Vale registrar o padrão — em toda ocorrência, a defesa mais externa
mascarava a interna, e só um caso construído para passar pela externa mediu a interna.
