---
name: wizard-agente
status: ATIVO
category: starter
owner: aluno
version: 1.3
mode: guided
estimated_time: 4min (ou 1min se já configurado)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "configura agente" / "cria identidade do agente", OR when dispatched by onboarding-checklist as passo 1. Creates IDENTITY.md (nome, gênero, modelo, agent_id) + SOUL.md stub (tom geral, 1 anti-pattern) + AGENTS.md (boot sequence, red lines mínimas). Stub-first approach — SOUL completo só na Aula 5. Detects existing files first (Princípio 1 + 11). Templates Amora opt-in via comando "exemplo". **v1.3 (kit v2.5.2 — fix Adrylan loop transição): Mensagem canonical "Estado Parcial" NOVA usa LETRAS `a/b` (não `1/2`) — anti-colisão com whisper-quick passo 1.5. Plus: bloco TRANSIÇÃO whisper→wizard-agente com sequência canonical de 2 mensagens separadas (confirmação A + abertura B com marcador inequívoco). Caso real Adrylan: 3 turnos perdidos por ambiguidade entre `2` (whisper definitivo) e `2` (wizard-agente refazer).** v1.2 (kit v2.4 — stress test multi-persona): quando detecta IDENTITY/SOUL/AGENTS preenchidos manualmente (caso Rodrigo VPS root legado), agente AGORA OFERECE EXPLICITAMENTE Princípio 6 (preservar/ajustar/refazer) — antes pulava direto pra pergunta-âncora sem dar opção de mexer. P6 já estava documentado mas não aplicado nesse caminho.** v1.1 (kit v2.2): header com Princípios 13/14/15 explícitos.
---

# Wizard Agente — Passo 1 (Personalidade do agente)

> 🔴 **PRINCÍPIOS NÃO-NEGOCIÁVEIS PRO AGENTE (kit v2.2):**
>
> **NÃO IMPROVISE.** Read este arquivo INTEIRO antes de falar com aluno. Não invente fluxo simplificado.
>
> **P13 — Guard Rail (wizard é passo bloqueante).** Toda mensagem do aluno é classificada:
> - (a) resposta direta → processa, avança
> - (b) comando canônico (`cancela`, `pula`, `voltar N`, `sobre`, `faq`, `corrige`, `muda modo`) → honra
> - (c1) pergunta tangencial → responde 1 linha, traz de volta ao passo
> - (c2) desvio total → anota em `## Perguntas pendentes` (MEMORY.md), traz de volta
> - 3 desvios consecutivos no mesmo passo → oferecer pause com `wizard_resume_at` agendado
>
> **P14 — Smoke tests visíveis.** Comando externo SEMPRE mostra (1) comando exato em bloco de código, (2) output literal em bloco de código, (3) só DEPOIS interpreta/narra. Sem evidência = ABORTA e pede ajuda. NUNCA finge que rodou.
>
> **P15 — Mensagens `<canonical>` literais.** Trechos marcados `<canonical>...</canonical>` usam LITERAL. Não reformula, não "melhora", não substitui exemplos. Ajustar TOM (formal/casual via SOUL.md) é OK; estrutura/ordem/keywords técnicas preservadas.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — Telegram faz word-wrap natural. Pergunta-âncora "como você apresenta seu agente pra cliente?" entra como parágrafo único.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

> ⚠️ **ANTI-PRESUNÇÃO (kit v2.2 — Princípio 16 aplicado a este wizard):**
>
> NÃO presumir identidade do agente baseado em conversa anterior. Mesmo que aluno tenha mencionado nome desejado, profissão, contexto ou tom em mensagens anteriores, **começar pela Detecção (P11)** + perguntas canônicas deste wizard. Não pular passos "porque já sei a resposta".
>
> Falha real (NC, 03/05): agente ofereceu *"propor identidade inicial pra mim e você só ajusta"* como alternativa ao wizard — improvisação que quebra P1 (modificar arquivo raiz sem backup) + P11 (detectar antes de propor) + P16 (entry point literal).
>
> Em vez de propor, **invocar wizard normalmente, deixar o aluno responder cada pergunta canonical**. Aluno valida 1 pergunta de cada vez = sensação de tutor. Pré-preenchimento sem validação = bot adivinhando, e adivinha errado em 2 dias.

## Promessa

Em 4 minutos, aluno transforma "agente genérico que responde tudo igual ChatGPT" em "agente com nome, tom de voz e jeito específico". 3 arquivos criados (IDENTITY, SOUL stub, AGENTS) que o agente lê toda mensagem.

A partir desse passo, agente para de soar como assistente padrão e começa a soar como personagem definido. É a primeira vitória visível: aluno conversa de novo e percebe a diferença.

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 1

**Trigger explícito (standalone):**
- "configura agente"
- "cria identidade do agente"
- "muda nome do agente"
- "redefine personalidade"

**NÃO disparar se:**
- `agente_configured=true` em `MEMORY.md` E os 3 arquivos raiz existem preenchidos

Se aluno mandar trigger explícito mesmo já configurado, perguntar antes:

```
"Você já configurou seu agente em {data}. Quer:
a) Refazer do zero (vou fazer backup do atual antes)
b) Editar trecho específico (manda 'muda nome', 'muda tom', etc)
c) Cancelar"
```

## Princípio 11 — Detecção antes de pedir

**Antes de qualquer entrevista**, checar 3 arquivos raiz:

```
1. IDENTITY.md existe?
   - Sim e preenchido (tem nome real, não "PLACEHOLDER"): ✓
   - Sim mas vazio/template não-preenchido: ⏳ tratar como nada
   - Não: ⏳

2. SOUL.md existe?
   - Sim com conteúdo real (>3 linhas além do título): ✓
   - Sim mas só estrutura: ⏳
   - Não: ⏳

3. AGENTS.md existe?
   - Sim com red lines + boot sequence: ✓
   - Sim mas template não-preenchido: ⏳
   - Não: ⏳
```

### 4 estados detectáveis

| Estado | Ação |
|---|---|
| **Tudo preenchido** | "✓ Detectei que IDENTITY, SOUL e AGENTS já estão preenchidos. Validei rapidinho. Não precisa fazer nada nesse passo. Marquei como feito." Vai direto pra pergunta-âncora. |
| **Parcial (1-2 prontos)** | Lista o que tá pronto + o que falta. Pergunta canonical (kit v2.5.2): usa LETRAS `a/b` (NÃO `1/2`) — ver mensagem canonical "Estado Parcial" abaixo. |
| **Nada feito** | Fluxo normal (entrevista) |
| **Existe mas é template não-preenchido** | Tratar como "nada feito" mas avisar: "Detectei IDENTITY.md mas tá com placeholders ainda — vou completar agora" |

### Mensagem canonical — Estado Parcial (kit v2.5.2 — fix Adrylan loop)

⚠️ **ANTI-COLISÃO de numeração:** anterior usava `1. completar / 2. refazer`. Quando despachado após wizard-whisper-quick (que pergunta `1/2` agendar/definitivo), aluno respondendo `"2"` gera ambiguidade — bot pode interpretar como resposta do whisper. Caso real Adrylan: 3 turnos perdidos no loop.

**Texto canonical (P15 — literal):**

```
"Detectei que parte da personalidade do agente já está configurada:

- IDENTITY.md → {placeholders/template | preenchido}
- SOUL.md → {placeholder/template | preenchido}
- AGENTS.md → {placeholder/template | preenchido}

Como você prefere seguir?

a) **Completar só o que falta** — preencho IDENTITY (e/ou outro arquivo placeholder), preservo o resto
b) **Refazer tudo** — backup do atual + recrio IDENTITY/SOUL/AGENTS canonical

Manda **a** ou **b** (NÃO use 1/2 — pode causar confusão com whisper anterior)."
```

**Substituir variáveis** conforme estado real detectado em cada arquivo (placeholder vs preenchido).

**Comportamento por resposta:**

| Resposta | Ação |
|---|---|
| `a` ou "completar" / "só o que falta" | Modo edição parcial — preenche só placeholders, preserva resto |
| `b` ou "refazer" / "tudo do zero" | Aplica P1 (backup timestamped) + roda fluxo principal (entrevista do passo 1) |
| Resposta ambígua | Repetir as 2 opções uma vez (P15+P7 — não inferir) |

### ⚠️ TRANSIÇÃO entre wizard-whisper-quick e wizard-agente (kit v2.5.2 — fix Adrylan loop)

⚠️ **CRÍTICO:** wizard-agente é frequentemente despachado IMEDIATAMENTE após wizard-whisper-quick (que pergunta `1/2` em "agendar vs definitivo"). Sem marcador de transição inequívoco + opções com letras diferentes, aluno que responde "2" gera ambiguidade — bot pode interpretar como wizard-whisper.passo1.5 OU wizard-agente.passo1.

**Sequência canonical de TRANSIÇÃO (P15 literal):**

Quando despachado após whisper:

1. **Mensagem de confirmação curta do whisper (separada):**
```
"✓ Whisper {pulado definitivo | configurado | agendado pra 24h}. {1 frase de fechamento}."
```

2. **Mensagem de abertura wizard-agente (separada, marcador inequívoco):**
```
"Agora vamos pra **personalidade do agente** (passo 1 da jornada — IDENTITY/SOUL/AGENTS).

{conteúdo da detecção P11 + perguntas com opções em letras `a/b/c` ou palavras, NÃO `1/2`}"
```

3. **MEMORY.md ATUALIZADO ANTES da 2ª mensagem:**
```yaml
active_wizard: wizard-agente
active_step: 1
awaiting: detection_result_or_choice
```

**REGRA ANTI-COLISÃO:** todas as opções de wizard-agente que pediriam ao aluno escolher entre `1/2` agora usam **letras** (`a/b/c`) OU **palavras-chave** (`manter`/`ajustar`/`refazer`). Razão: whisper passo 1.5 usa `1/2` — colisão de respostas curtas é silenciosa e gera loop (caso Adrylan, 3 turnos perdidos).

### Mensagem padrão ao detectar 100% pronto (REESCRITA em kit v2.4 — P6 explícito)

⚠️ **Mudança v1.2 (kit v2.4):** quando detecta arquivos preenchidos com conteúdo manual (não-template), agente DEVE oferecer Princípio 6 — preservar / ajustar / refazer. Antes (v1.1) pulava direto pra pergunta-âncora sem dar opção de mexer. Caso real Rodrigo (VPS root legado, IDENTITY editado manualmente meses atrás): aluno NUNCA via opção de modificar trabalho prévio dentro deste passo.

⚠️ **Detecção "conteúdo manual" vs "template canonical":** comparar com template `IDENTITY.template.md`. Se difere significativamente (ex: estrutura customizada, anti-patterns próprios, tom específico) → tratar como **manual** e oferecer P6. Se é template não-preenchido (placeholders ainda lá) → fluxo normal de entrevista.

**Texto canonical (P15 — literal):**

```
"✓ Detectei seu agente já configurado:
- IDENTITY.md → nome: {nome_extraído} ({tamanho_bytes} bytes)
- SOUL.md → {N} linhas de personalidade ({tamanho_bytes} bytes)
- AGENTS.md → red lines configuradas ({tamanho_bytes} bytes)

Os arquivos têm conteúdo customizado (não-template). Princípio 6 (respeitar customização) — você decide o que fazer:

a) **Manter como está** — não toco em nada, só rodo a pergunta-âncora pra fechar o passo
b) **Ajustar trecho específico** — me diz o que quer mudar (ex: 'mudar tom pra mais formal'), eu mexo só nisso
c) **Refazer do zero** — backup do atual em `~/backups/`, depois entrevista canonical (4min)

Manda 'a', 'b' ou 'c'. Default seguro = 'a' (não mexer)."
```

**Comportamento por resposta:**

| Resposta | Ação |
|---|---|
| `a` ou "mantém" / "deixa" / "tá bom" | Vai direto pra pergunta-âncora (passo 9). Marca `agente_configured: true` (já estava). |
| `b` ou "ajustar" / "muda X" | Pergunta o que mudar especificamente. Despacha modo edição parcial — backup + edit cirúrgico no trecho mencionado. |
| `c` ou "refazer" / "do zero" | Aplica Princípio 1 (backup timestamped) + roda fluxo principal (passo 1 entrevista) com flag `redo_from_existing: true` (mostra valores antigos como sugestão). |
| Resposta ambígua | Repetir as 3 opções uma vez. Se persistir ambíguo, default seguro: `a` (não mexer). |

## Fluxo principal (entrevista)

### 1. Narrar o que vai acontecer

```
"Vamos configurar a personalidade do seu agente. Em 4min você sai
daqui com 3 arquivos no seu workspace:

1. IDENTITY.md → bilhete de identidade do agente (nome, modelo, etc)
2. SOUL.md → como ele pensa e fala (versão STUB de 5 linhas, vai
   crescer na Aula 5)
3. AGENTS.md → regras de comportamento (boot sequence + red lines)

Esses arquivos ficam vivos no workspace. Toda vez que o agente vai
responder, ele lê eles. Se você editar lá direto depois, muda na hora.

Vou te fazer 3-4 perguntas. Sem certo nem errado — é como você
quer que ele seja. Se travar em alguma, manda 'exemplo' que eu
te mostro como o Bruno fez com a Amora.

Bora?"
```

### 2. Pergunta 1 — Nome do agente

```
"Como você quer chamar seu agente?

Sugestões pra inspirar (não copia):
- Nome humano: Atlas, Olivia, Marcos, Sophia
- Nome simbólico: Zênite, Norte, Bússola, Eco
- Nome sem peso: Bot, Helper, Assistant (recomendo evitar — vira chatbot)

A Amora do Bruno chama Amora porque ele tem cachorra com esse nome. Histórico pessoal grava.

Manda o nome que escolheu."
```

Salvar resposta como `nome_agente`.

### 3. Pergunta 2 — Gênero

```
"Como o {nome_agente} se refere a si mesmo?

a) Mulher (ela/dela)
b) Homem (ele/dele)
c) Neutro (eles/deles ou sem flexão)

Isso muda o jeito que ele escreve sobre si. A Amora fala 'Sou a Amora' (mulher).
"
```

Salvar como `genero_agente`.

### 4. Pergunta 3 — Tom geral

```
"Como o {nome_agente} fala?

3 dimensões pra você escolher:

1) Formal vs Casual:
   - Formal: 'Bom dia, posso ajudá-lo?'
   - Casual: 'oi, no que te ajudo?'

2) Direto vs Cuidadoso:
   - Direto: 'isso aqui tá errado, faz X'
   - Cuidadoso: 'sugiro considerar fazer X'

3) Brasileiro vs Neutro:
   - Brasileiro: 'porra, ficou bom isso'
   - Neutro: 'o resultado ficou interessante'

Manda como prefere (ex: 'casual + direto + brasileiro') OU descreve
do seu jeito (ex: 'fala como um amigo de boteco que entende de
{tema}')."
```

Salvar como `tom_agente`.

### 5. Pergunta 4 — Anti-pattern (algo que ELE NUNCA faz)

```
"Última pergunta, importante: 1 coisa que o {nome_agente} JAMAIS deve fazer.

Exemplos de anti-pattern (cada agente escolhe os seus):
- 'nunca usa linguagem de coach (destrave seu potencial, mindset)'
- 'nunca abre com Ótima pergunta ou Com certeza'
- 'nunca fecha com Espero ter ajudado'
- 'nunca usa emoji a menos que eu peça'
- 'nunca dá conselho jurídico ou médico'
- 'nunca fala português de Portugal'

Pode mandar 1 só (ou mais se já tiver claro). Se travou, manda 'exemplo'
que mostro os do Bruno."
```

Salvar como `anti_pattern`.

### 6. Confirmação antes de criar arquivos

Antes de escrever qualquer arquivo, mostrar resumo:

```
"Beleza, vou criar:

📄 IDENTITY.md
    Nome: {nome_agente}
    Gênero: {genero_agente}
    Modelo: {modelo_detectado_do_managed}
    Agent ID: {nome_lowercase}-{user_lowercase}
    Reporta para: {nome_aluno_se_souber, ou 'aluno'}

📄 SOUL.md (stub de 5 linhas)
    Tom: {tom_agente}
    Anti-pattern: {anti_pattern}
    [SOUL completo na Aula 5]

📄 AGENTS.md
    Boot sequence padrão (lê SOUL → USER → MAPA)
    Red lines mínimas (trash > rm, pergunta antes de coisa irreversível)

Confirma que pode criar?"
```

Esperar "sim" / "vai" / "confirma" / "pode".

### 7. Aplicar Princípio 1 — backup se já existe

Para cada arquivo (IDENTITY, SOUL, AGENTS):

```bash
if [ -f "$WORKSPACE/IDENTITY.md" ]; then
    BACKUP_DIR="$HOME/backups/pre-wizard-agente-$(date +%Y-%m-%d-%H%M)"
    mkdir -p "$BACKUP_DIR"
    cp "$WORKSPACE/IDENTITY.md" "$BACKUP_DIR/"
fi
```

Se algum arquivo existia, narrar:

```
"Detectei {N} arquivo(s) existente(s). Backup feito em:
{path_backup}

Você pode restaurar a qualquer momento copiando de volta.
Vou criar os arquivos novos agora."
```

### 8. Criar os 3 arquivos a partir de templates

Templates ficam em `starter-kit/templates/` (ver lista no fim deste arquivo).

Pra cada arquivo, fazer substituição de placeholders:

| Placeholder | Substitui por |
|---|---|
| `{NOME_AGENTE}` | `nome_agente` |
| `{GENERO}` | `genero_agente` |
| `{MODELO}` | detectar via `openclaw config show model` (fallback: `claude-sonnet-4` ou `gpt-5`) |
| `{AGENT_ID}` | `{nome_lowercase}-{user_lowercase}` |
| `{NOME_USER}` | ler de `USER.md` se existe, senão "aluno" |
| `{TOM}` | `tom_agente` |
| `{ANTI_PATTERN}` | `anti_pattern` |
| `{DATA}` | data atual |

Salvar:
- `$WORKSPACE/IDENTITY.md`
- `$WORKSPACE/SOUL.md`
- `$WORKSPACE/AGENTS.md`

Confirmar:

```
"✓ Criados:
- /workspace/IDENTITY.md ({tamanho} bytes)
- /workspace/SOUL.md ({tamanho} bytes — stub, vai crescer na Aula 5)
- /workspace/AGENTS.md ({tamanho} bytes)

A partir de agora eu vou ler esses 3 arquivos toda vez que for
responder. Se você editar direto, muda na hora seguinte."
```

### 9. Pergunta-âncora

Pergunta literal (definida em `mapa-aulas.md` passo 1):

```
"Rapidão antes de fechar este passo: se daqui a 1 mês você editar
o IDENTITY.md direto e mudar meu nome ou tom — eu pego automático
ou preciso ser avisado?"
```

| Resposta esperada | Validação |
|---|---|
| "automático" / "pega sozinho" / "não precisa avisar" | "Boa. IDENTITY.md fica vivo no seu workspace. Toda vez que eu vou responder, leio ele. Se mudar lá, mudo aqui na hora seguinte." |
| "preciso avisar" / "tem que reativar" | "Quase. IDENTITY.md fica vivo no workspace — toda mensagem minha consulta ele. Edit direto = mudança imediata. Não precisa me avisar." |
| Outro | Validação suave + reforço da regra (workspace = source of truth) |

Sempre fechar com:

```
"Se quer aprofundar identidade do agente, a aula que detalha isso
é a *B1* (Identidade completa) — manda 'aula 5' que eu te passo o link.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 1 como feito. Bora pro passo 2 (configurar a sua personalidade)?"
```

### 10. Atualizar MEMORY.md

```markdown
## Flags
agente_configured: true
nome_agente: {nome_agente}

## Decisões da jornada
- {data}: Configurou agente. Nome: {nome_agente}. Gênero: {genero}. Tom: {tom_resumo}. Anti-pattern: {anti_pattern_curto}.
```

Atualizar `onboarding_current_step: 2`.

### 11. Devolver controle pra onboarding-checklist

## Comando "exemplo" durante este wizard

Se aluno mandar "exemplo" em qualquer pergunta:

| Pergunta atual | Carrega |
|---|---|
| Nome | Trecho de `exemplos/IDENTITY-amora.md` (linhas 1-10) |
| Gênero | Mesmo trecho de IDENTITY |
| Tom | `exemplos/SOUL-amora.md` seção "Tom" |
| Anti-pattern | `exemplos/SOUL-amora.md` seção final + manchetes "Nunca abrir com..." |
| Outros (genérico) | Lista os 3 arquivos da Amora pro aluno escolher qual ver |

Após mostrar exemplo, retornar pra pergunta original:

```
"Esse é o IDENTITY.md (ou SOUL/AGENTS) da Amora — Chief of Staff
do Bruno Okamoto. Não copia, adapta.

Agora que viu, me manda como você quer pro {nome_agente}."
```

## Critérios de sucesso

- [ ] `IDENTITY.md` criado com `nome_agente`, gênero, modelo, agent_id preenchidos (sem placeholders)
- [ ] `SOUL.md` (stub) criado com tom + 1 anti-pattern
- [ ] `AGENTS.md` criado com boot sequence + red lines mínimas
- [ ] Backup feito se algum arquivo já existia (Princípio 1)
- [ ] `agente_configured=true` em `MEMORY.md`
- [ ] `onboarding_current_step=2` (avançou)
- [ ] Pergunta-âncora respondida (qualquer resposta — agente valida ou corrige)
- [ ] Aula 5 mencionada no fim

## Erros comuns

- **Aluno trava no nome:** se pediu "exemplo" 2x e ainda tá indeciso, sugerir "Você pode começar com qualquer nome. Mudar depois é trivial — manda 'muda nome' que refaço. Sem peso. Manda o que veio agora."
- **Aluno responde algo vazio (ex: "tipo a Siri"):** pedir mais especificidade. "Siri tem traços específicos — formal, tom neutro, briga com sotaque. É isso que você quer? Ou 'tipo a Siri' é só uma analogia? Me dá 1 frase de como ele falaria com você."
- **Aluno quer SOUL completo já:** explicar tensão Aula 5. "SOUL completo na entrada é cedo demais — você ainda não sabe o que QUER que o agente seja. A versão stub agora (5 linhas) já funciona. Aula 5 expande quando você já tem feeling do uso real."
- **Aluno pulou Whisper e tá digitando entrevista:** OK, mas mencionar uma vez "se quiser, depois desse passo dá pra ativar áudio com 'configura whisper'".

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 1 (backup antes de sobrescrever):** TODOS os 3 arquivos (IDENTITY, SOUL, AGENTS) checados antes. Se existirem, backup timestamped antes de criar novos.
- **Princípio 2 (confirmação humana):** pede confirmação ANTES de criar os arquivos (mostra resumo do que vai criar).
- **Princípio 4 (narrar antes de fazer):** explica os 3 arquivos e pra que servem antes de começar entrevista.
- **Princípio 5 (atualizar MEMORY ao concluir):** marca `agente_configured=true` + decisão das escolhas.
- **Princípio 6 (respeitar customização manual):** detecção checa não só "existe" mas "está preenchido com conteúdo real" — não sobrescreve template não-preenchido sem avisar.
- **Princípio 8 (logging de decisões):** salva as 4 escolhas (nome, gênero, tom, anti-pattern) em `MEMORY.md` decisões.
- **Princípio 11 (detectar antes de pedir):** o estado dos 3 arquivos é checado primeiro. Se preenchidos, pula entrevista.

## Modo A vs Modo B

**Modo A (aula-por-aula):**
```
"Bora pro Módulo 1 — Personalidade do agente.
Aula correspondente: Aula 5 (Identidade, Soul, Agents, User).
Recomendo assistir antes pra entender por que o SOUL é stub agora
e completa só depois."
[entrevista numerada: 'pergunta 1 de 4', 'pergunta 2 de 4'...]
```

**Modo B (wizard direto):**
```
"Bora dar identidade pro seu agente. Vou te perguntar 3-4 coisas
e crio os arquivos. 4 minutos."
[entrevista conversacional, sem numeração]
```

Mesma lógica, fluxo, princípios. Só apresentação muda.

## Templates usados (em starter-kit/templates/)

- `IDENTITY.template.md` — template do IDENTITY com placeholders
- `SOUL-stub.template.md` — template do SOUL stub (5-10 linhas, expansão na Aula 5)
- `AGENTS.template.md` — template do AGENTS com boot sequence + red lines mínimas

Wizard substitui placeholders e salva no workspace do aluno.

## Referências

### Internas
- Princípios universais: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)
- Comando "exemplo": [`../onboarding-checklist/references/comandos-canonicos.md`](../onboarding-checklist/references/comandos-canonicos.md) (comando 6)
- Pergunta-âncora oficial: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 1)
- Decisão D21 (separar agente vs aluno): [`../../../../DECISOES-ARQUITETURA.md`](../../../../DECISOES-ARQUITETURA.md)
- Decisão D22 (SOUL stub na entrada): mesma referência
- Templates raiz: `starter-kit/templates/`

### Externas
- Exemplo Amora IDENTITY: [`starter-kit/exemplos/IDENTITY-amora.md`](../../../exemplos/IDENTITY-amora.md)
- Exemplo Amora SOUL: [`starter-kit/exemplos/SOUL-amora.md`](../../../exemplos/SOUL-amora.md)
- Exemplo Amora AGENTS: [`starter-kit/exemplos/AGENTS-amora.md`](../../../exemplos/AGENTS-amora.md)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Detectar modelo automaticamente via `openclaw config` (em vez de hardcode no template)
- v1.2: Suporte a múltiplos perfis ("agente sério no trabalho, casual no pessoal" — 2 SOULs)
- v2: Skill `evolui-soul` que monitora padrões de uso e sugere expansões pro SOUL.md ao longo do tempo
