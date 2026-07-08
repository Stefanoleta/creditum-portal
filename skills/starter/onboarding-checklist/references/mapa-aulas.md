# Mapa de Perguntas-Âncora ↔ Aulas

> Cada wizard, ao terminar, dispara 1 pergunta-âncora padronizada.
> Esse mapa amarra: passo → pergunta → aula correspondente do mini-curso → grupo de apoio.

---

## Reforço pedagógico no modo A (aula-por-aula)

No modo A, agente sempre reforça que aluno deve **assistir TODAS as aulas, não pular**. Mesmo aulas de tema que aluno acha que não vai usar.

Mensagem padrão ao apresentar menu modular no modo A:

> "Importante: pra você entender a lógica completa do curso, recomendo MUITO que assista todas as aulas (não pula nenhuma), mesmo as de tema que você não vai usar agora. Cada aula constrói camada na cabeça que ajuda nas próximas.
>
> Quando assistir uma aula, volta aqui e manda o número do módulo correspondente. A gente configura juntos."

E quando aluno tenta pular módulo direto sem ter assistido aula correspondente (modo A):

> "Você quer configurar {módulo X} sem ter assistido a aula {Y}?
>
> Lembre-se: no modo aula-por-aula, a recomendação é sempre assistir aula primeiro. Aula traz contexto/conceito que ajuda você decidir o que configurar.
>
> Quer:
> a) Assistir aula {Y} primeiro (link: ...)
> b) Configurar mesmo assim (sem o conceito)
> c) Mudar pra modo wizard direto (manda 'muda modo')"

No modo B, esse reforço NÃO se aplica — aluno escolheu pular aulas explicitamente.

---

## Estrutura padrão da pergunta-âncora

Cada wizard usa este template ao final:

```
"Rapidão antes de fechar este passo: {pergunta_âncora}"

[espera resposta do aluno]

"{validação curta — 2 frases}.

Se quer aprofundar {tema do passo}, a aula que detalha isso é a *{AULA-X}*
— manda 'aula {X}' que eu te passo o link.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo {N} como feito. Bora pro {N+1}?"
```

---

## Mapa por passo

### Passo 0 — Whisper (pré-passo opcional)

**Pergunta-âncora:** "Pra confirmar que tá tudo certo: manda agora um áudio curto dizendo qualquer coisa. Eu transcrevo e te mostro."

**Tipo:** Validação prática (não conceitual). Smoke test embutido.

**Aula correspondente:** A0 (Visão — modelos, créditos, OpenAI API key)

**Resposta do agente após áudio:**
```
✓ Transcrevi: "{texto_transcrito}"

Funcionando perfeito. A partir de agora você pode mandar áudio em
qualquer momento — eu entendo.

Se quer aprofundar como configurar OpenAI API e gerenciar custos,
a aula é a *A0* — manda 'aula A0'.

Bora pro passo 1?
```

---

### Passo 1 — Personalidade do agente

**Pergunta-âncora:** "Rapidão: se daqui a 1 mês você editar o `IDENTITY.md` direto e mudar meu nome ou tom — eu pego automático ou preciso ser avisado?"

**Resposta esperada:** "automático" ou similar.

**Validação correta:** "Boa. IDENTITY.md fica vivo no seu workspace. Toda vez que eu vou responder, leio ele. Se mudar lá, mudo aqui na hora seguinte."

**Validação se errou:** "Quase. IDENTITY.md fica vivo no workspace — toda mensagem minha consulta ele. Edit direto = mudança imediata. Não precisa me avisar."

**Aula correspondente:** Aula 5 — Identidade, Soul, Agents, User

---

### Passo 2 — Personalidade do aluno

**Pergunta-âncora:** "Você acabou de me passar várias coisas sobre você. Onde isso ficou salvo? E se você editar lá direto, eu pego?"

**Resposta esperada:** "USER.md" ou "no workspace" + "sim, automático".

**Validação correta:** "Isso. USER.md no seu workspace. Mesma regra do IDENTITY: edit lá = mudança imediata aqui."

**Validação se errou:** "USER.md no seu workspace. Mesma regra do IDENTITY: edit direto, mudança imediata. Você sempre tem controle do que eu sei sobre você."

**Aula correspondente:** Aula 5 — Identidade, Soul, Agents, User (mesma aula, foco no USER.md)

---

### Passo 3 — Autonomia (exec-policy + security)

**Pergunta-âncora:** "Se você desfizer a exec-policy yolo daqui a pouco (rodar `openclaw exec-policy reset`), o que volta a acontecer?"

**Resposta esperada:** "vai pedir aprovação" ou similar.

**Validação correta:** "Exato. Eu volto a perguntar 'posso?' a cada coisa que faço — criar arquivo, salvar, executar comando. É reversível."

**Validação se errou:** "Vou voltar a pedir aprovação a CADA ação. É reversível — você pode desligar e religar a hora que quiser. Útil pra quando você quer fazer algo sensível e não confia em mim sozinho."

**Aula correspondente:** Aula 10 — Instalando 1password (e sub-aulas 10.1-10.4 — Segurança)

---

### Passo 4 — Workspace

**Pergunta-âncora:** "Pra onde eu vou salvar um post novo que você me pedir? E pra onde eu vou buscar uma decisão antiga que você me contou?"

**Resposta esperada:** "post em content/, decisão em memory/" ou similar — qualquer indicação que aluno entendeu a estrutura.

**Validação correta:** "Boa. `content/drafts/` pra criação, `memory/decisoes/` pra registro. Eu uso o MAPA.md como gabarito sempre que vou salvar algo."

**Validação se errou:** "Quase. `content/` pra coisas que você cria (posts, drafts, imagens). `memory/` pra coisas que você lembra (decisões, pendências, pessoas). MAPA.md no workspace tem o gabarito completo."

**Aula correspondente:** Aula 6 — Organizando Workspace do seu Agente

---

### Passo 5 — Conectar superpoderes

**Pergunta-âncora:** "Imagina que sua chave OpenAI vazou no Twitter por engano. O que você precisa fazer agora?"

**Resposta esperada:** "revogar a chave" ou "criar nova" ou similar.

**Validação correta:** "Exato. Vai em platform.openai.com/api-keys, revoga a chave vazada (botão 'Revoke'), gera nova, atualiza no .env. Toda chave de API funciona assim — revogar é instantâneo."

**Validação se errou:** "Você vai em platform.openai.com/api-keys, clica 'Revoke' na chave vazada (instantâneo, ela morre), gera nova, atualiza no seu .env. Mesma lógica pra Brave, GitHub, qualquer chave. Por isso 1Password ajuda — quando você troca chave, atualiza num lugar só."

**Aula correspondente:** Aula 10 — Instalando 1password + Aula 10.1 — Conectando seu agente em APIs

---

### Passo 6 — Primeira vitória

**Pergunta-âncora:** "Esse arquivo que eu acabei de criar — onde ele tá salvo? Você consegue editar ele depois pra ajustar antes de publicar?"

**Resposta esperada:** "em content/drafts/" + "sim, posso editar".

**Validação correta:** "Isso. `content/drafts/primeira-vitoria-{data}.md`. Você pode abrir no editor que preferir, ajustar o que quiser, e usar. Tudo que eu crio fica visível e editável — você sempre tem palavra final."

**Validação se errou:** "`content/drafts/primeira-vitoria-{data}.md`. Markdown puro, abre em qualquer editor (VS Code, Obsidian, até bloco de notas). Pode editar tudo, eu não trava nada."

**Aula correspondente:** Aula 8 — Tudo que você precisa saber sobre Skills

---

## Comando "aula {X}" — comportamento

Quando aluno responde "aula 5" (ou qualquer "aula X"), agente entrega:

```
A Aula {X} — {título da aula} aprofunda o que a gente fez no passo {N}.

Cobre:
- {tópicos da aula}

Link pra área de membros Hotmart: https://app.hotmart.com/ →
abre o módulo correspondente.

Já carreguei o material aqui no Telegram em paralelo — pode assistir
o vídeo e me chamar com qualquer dúvida que eu já sei do que tá
falando.

Volta aqui quando terminar com 'aula {X} feito', ou bora seguir
pro próximo passo da checklist?
```

**Mapeamento canônico de aula → arquivo de material:** sempre Read `$WORKSPACE/_curso/INDICE.md`. Não duplique aqui.

---

## Comando "grupo" — comportamento

Quando aluno menciona "grupo" ou "comunidade":

```
Grupo do mini-curso no Telegram:
https://t.me/cursoopenclaw

Lá dentro tem 2 caminhos pra você:

→ Tópico Suporte: @Openclawzinho (bot IA) responde 24/7. Bom pra dúvida
  técnica rápida, erro de comando, configuração travada.

→ Outros tópicos: galera que comprou o mesmo curso, fazendo isso junto.
  Bom pra ver o que outros tão construindo, trocar ideia, pedir feedback.
  O Bruno também aparece direto por lá.

Bora seguir pro próximo passo?
```

---

## Por que essa estrutura funciona

A pergunta-âncora resolve 3 problemas de uma vez:

1. **Validação leve de aprendizado** — aluno teve que pensar pra responder. Mesmo se errou, a correção fica.
2. **Venda da aula em vídeo** — cria hook concreto: "se quer aprofundar X, aula é a Y". Não é venda genérica, é venda contextual.
3. **Ativação da comunidade** — em vez de "tem grupo se quiser", aparece no momento natural (logo após pequeno marco).

Resultado: aluno termina kit com agente funcionando + sentimento de "fiz parte de algo, tem outras pessoas, e tem mais conteúdo se quiser".
