---
name: multi-agente
status: ATIVO
category: cheatsheet
referenced_by: [A13]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra decisão de multi-agente — quando vale, 2 caminhos (subagente vs paralelo), arquitetura por plataforma (Managed vs VPS), comunicação real entre agentes (4 caminhos validados na doc OpenClaw), AGENTS.md como organograma, e 4 prompts prontos pra colar.
---

# Multi-agente — referência rápida

## Como usar este cheatsheet

**Caminho default — prompt natural pro agente** (linha de produção):

Cola um dos prompts da seção "Prompts prontos pra colar" (abaixo) direto no Telegram ou terminal. Cada prompt aponta pra **doc oficial OpenClaw** e pede pro agente conduzir o setup com explicação antes de executar.

**Caminho de plano B — comando direto** (use quando):
- Agente travou (tool não conhecida, doc desatualizada)
- Você prefere conduzir manual em vez de delegar
- Validando config específica que o agente leu errado

Comandos validados na doc oficial OpenClaw em 03/05/2026 — antes de release v1.0 do kit, validar cada um em conta de teste.

## Pergunta zero: 1 agente ou vários?

**Resposta honesta**: maioria absoluta dos PME, **1 agente bem configurado resolve**. Multi-agente é refinamento.

### 4 sinais que VALE evoluir

1. Agente único tá lento (context rot · threads pesadas)
2. Você fala 2 línguas operacionais distintas (ex: marketing + dev) e ele confunde
3. Você tem time/funcionários e quer dar agente próprio pra cada
4. Você quer delegação 24/7 (1 vigia inbox enquanto outro escreve)

### Custo REAL de cada agente extra (não-óbvio)

| O que multiplica | Quando você tem 3 agentes |
|------------------|---------------------------|
| SOUL · IDENTITY · USER · MEMORY pra manter sincronizados | 3x arquivos · 3x atualizações quando seu contexto muda |
| Credenciais pra rotacionar (recap A10/A12) | 3x sets de tokens · 3x rotações mensais |
| Monitoramento diário (primeiros 30d, recap A10) | 3x históricos pra revisar · 3x prompts pra blindar |
| Skills atualizadas | 3x conjuntos pra manter sincronizados |
| Comunicação entre eles (handoff, AGENTS.md) | Crescimento exponencial |

> **3 agentes ≠ 3x trabalho. Mais perto de 5x.** Multiplicar agentes multiplica manutenção.

### Sintomas de overengineering (revisar)

| Sintoma | Diagnóstico |
|---------|-------------|
| "Vou criar 5 agentes só porque é legal" | Estética > função. Volta pra 1 |
| Cada agente fica ocioso 90% do dia | Sub-utilização — junte funções |
| Custo dobrou e produtividade não | ROI ruim — reverta |
| Você passa mais tempo orquestrando que produzindo | Overhead > benefício — simplifique |
| Você fala com 1 agente e ele "não sabe" o que outro fez | AGENTS.md desatualizado OU domínios mal divididos |
| Manutenção dos SOULs/USERs ficou pesada | Multiplicador 5x te alcançou — corrija ou consolide |

## Os 2 caminhos quando vale evoluir

| Aspecto | **Subagente** (`/subagents spawn`) | **Agente paralelo** (entidade separada) |
|---------|---------------------|-------------------------------|
| O que é | Background run spawned do agente pai · async · resultado anunciado quando termina | Entidade separada · SOUL/IDENTITY/USER próprios · vida própria · canais próprios |
| Custo de **criar** | Baixo — comando direto | Alto — SOUL + IDENTITY + USER + memória + canais |
| Custo de **manter** | Quase zero — sem identidade pra manter | 5x trabalho |
| Identidade | **Limitada** — só herda `AGENTS.md` + `TOOLS.md` (não SOUL próprio) | Completa — SOUL/IDENTITY/USER próprios |
| Memória | **Sandbox isolado** por execução (modo `isolated` default) ou herda contexto pai (modo `fork`) | Memória própria contínua (MEMORY.md) |
| Tracking de tokens | Independente — cada subagent rastreia próprio uso | Independente — cap por agente |
| Aparece no seu Telegram? | Não — invisível | Sim — handle próprio |
| Como invocar | `/subagents spawn <agentId> "<task>"` ou tool `sessions_spawn` | Mention no canal · subagente · arquivo · cron |
| Pode ser invocado direto pelo aluno? | Não — só pelo agente principal | Sim |
| Ideal pra | Tarefas pontuais (pesquisa, análise PDF, gerar imagem) — **execução isolada com retorno async** | Domínios contínuos (atendimento, conteúdo, ops) — **identidade persistente** |
| Risco de overengineering | Quase nenhum | Frequente |

**Princípio**: *"Subagente é **execução background** com identidade limitada. Agente paralelo é **entidade separada** com identidade completa."*

### Decisão prática

- Tarefa pontual? → **Subagente** (sempre que dúvida, comece por aqui)
- Domínio contínuo + 4 sinais acima? → **Agente paralelo** (e antes, releia o custo de manutenção)

## Arquitetura por plataforma

### Onde os agentes paralelos vivem

| Plataforma | Limite | Como funciona |
|------------|--------|---------------|
| **Managed (curso default)** | **1 OpenClaw por plano** | Múltiplos agentes coexistem **dentro do mesmo workspace** · 1 daemon orquestra todos |
| **VPS standalone (bônus R1-R4)** | Até **3 OpenClaws na mesma VPS** | Cada OpenClaw é independente · containers Docker separados · network e volumes próprios |

**Pra aluno do curso (Managed): única opção é multi-agente NO MESMO WORKSPACE.** Não tem como ter 2 OpenClaws no plano Managed.

### Estrutura de pastas no Managed

```
~/.openclaw/
├── .env                          ← compartilhado (cuidado escopo, recap A10)
├── shared/
│   ├── assets/                   ← logos, templates, files compartilhados
│   └── notes/                    ← arquivos de troca entre agentes
└── agents/
    ├── amora/
    │   ├── SOUL.md              ← identidade própria (direta)
    │   ├── IDENTITY.md          ← Chief of Staff
    │   ├── USER.md              ← perfil do Bruno (compartilhado entre agentes)
    │   ├── MEMORY.md            ← memória própria isolada
    │   └── workspace/           ← arquivos próprios
    ├── openclawzinho/
    │   ├── SOUL.md              ← identidade DIFERENTE (atenciosa)
    │   ├── IDENTITY.md          ← Suporte da comunidade
    │   ├── MEMORY.md            ← memória própria
    │   └── workspace/
    └── pesquisador/             ← subagente — não tem SOUL próprio
        └── (herda AGENTS.md + TOOLS.md do workspace)
```

Cada agente paralelo: identidade própria · memória isolada · canais distintos · escopos diferentes.

Compartilham: `.env` (cuidado), USER.md (mesmo aluno), assets em `shared/`.

## Como agentes conversam entre si — 4 caminhos REAIS

> Validados na doc oficial OpenClaw em 03/05/2026. **NÃO existe DM interna direta entre agentes em runtime** — a comunicação acontece via mecanismos abaixo.

| Caminho | Mecanismo real | Quando usar |
|---------|---------------|-------------|
| **Subagente via spawn** | `/subagents spawn <agentId> "<task>"` ou tool `sessions_spawn` · async · resultado anunciado quando termina | Delegar tarefa específica · agente principal continua trabalhando enquanto subagente roda |
| **Mention em canal compartilhado** | `@amora @openclawzinho ...` no Telegram/Slack/etc · `requireMention: true` (recap A3) previne spam | Aluno orquestra explícito · 1 thread, múltiplos respondedores |
| **Arquivo compartilhado** | Agente A escreve em `~/.openclaw/shared/notes/X.md` · Agente B lê quando precisa · async, sem bloqueio | Dump de contexto pesado · handoff async · documentação cruzada |
| **Trigger via cron + `openclaw agent --agent <id>`** | Cron de B detecta evento de A (arquivo criado, webhook) · roda comando externo programático · B processa | Automação async sem interação humana · cross-agente via script |

**Princípio**: *"Por default, agentes não se veem em runtime. **Você decide** quando e como cooperam — via subagente, mention explícita, arquivo compartilhado ou cron."*

Esse design previne:
- Spam de respostas duplicadas em canais compartilhados
- Vazamento de contexto entre escopos diferentes (recap A10 escopo mínimo)
- Loops infinitos (Amora pergunta a openclawzinho que pergunta de volta)

## A pergunta clássica: 2 agentes no mesmo grupo Telegram

> *"Se eu colocar Amora E openclawzinho no mesmo grupo do Telegram, eles vão ver as mensagens um do outro?"*

**Resposta direta:**

- Tecnicamente, **sim** — ambos os bots leem o canal
- Por design (recap A3 — `requireMention: true`), **só respondem quando mencionados**: `@amora` ou `@openclawzinho`
- Mensagem genérica sem mention? **Ninguém responde** (não vira spam de 2 respostas duplicadas)
- Pra cooperarem em 1 thread: `@amora @openclawzinho coordenem essa task` — ambos veem, mas só o mencionado primeiro responde por default
- AGENTS.md pode configurar handoff (ex: openclawzinho escala pra Amora se aparecer mention dela no escopo dele)

## Comandos `/subagents` (validados na doc oficial)

### Spawn

```
/subagents spawn <agentId> "<task>" [--model <model>] [--thinking <level>]
```

Parâmetros:
- `<agentId>` — handle do agente (configurado em AGENTS.md)
- `"<task>"` — descrição da tarefa pra subagente executar
- `--model` (opcional) — override de modelo (ex: `claude-haiku` pra task barata)
- `--thinking <low|medium|high>` (opcional) — nível de thinking budget

### Modos de contexto

- **`isolated` (default)** — sandbox limpo, sem acesso à transcrição do agente pai. Token-economy.
- **`fork`** — herda contexto pai. Use só quando subagente precisa de histórico conversacional.

### Tool `sessions_spawn` (uso programático em skill)

```json
{
  "task": "descrição da tarefa",
  "agentId": "id do agente alvo",
  "context": "isolated",
  "model": "override de modelo",
  "thread": false,
  "cleanup": "keep"
}
```

### Limitação importante

> Sub-agent context só injeta `AGENTS.md` + `TOOLS.md` (não SOUL.md, IDENTITY.md, USER.md...)

Sub-agent é **sandbox isolado com função específica**, não clone total do agente pai. Pra ter identidade própria persistente, você precisa de **agente paralelo** (caminho mais caro de manter).

## AGENTS.md como organograma

Recap A5: AGENTS.md já estava lá no day 1 com framing "preparado pra equipe quando quiser". A13 dá substância — vira o **organograma vivo do seu time digital**.

### O que tem em AGENTS.md

| Seção | Conteúdo |
|-------|----------|
| **Quem é cada agente** | Handle · papel · modelo (Sonnet/Opus/Haiku) · escopo |
| **Quem chama quem** | Subagentes disponíveis · agentes paralelos com handoff |
| **Onde cada um vive** | Workspace · canais · integrações |
| **Permissões cruzadas** | Subagente herda allowlist? Não. Cada um tem scope próprio (recap A10) |
| **Governance** | Cap de custo mensal por agente · audit log · digest semanal |

### Template AGENTS.md (baseado no caso Pixel)

```markdown
# AGENTS.md — [Sua empresa/projeto]

## [Agente principal — ex: Amora COS]
- Modelo: Claude Sonnet 4.5 / GPT 5.5
- Localização: ~/.openclaw/agents/amora/
- Papel: coordenação geral, contexto [aluno], propagação semântica
- Subagentes invocáveis: pesquisador, gerador-imagem, analista
- Agentes paralelos coordenados: openclawzinho
- Cap mensal: R$X-Y

## [Agente secundário — ex: openclawzinho]
- Modelo: GPT-5.5
- Localização: ~/.openclaw/agents/openclawzinho/
- Papel: atendimento da comunidade
- Canal: WhatsApp comunidade (com monitoramento diário 30d, recap A10)
- Handoff pra [agente principal]: escala se questão fora de escopo OU se cliente pedir "falar com [aluno]"
- Cap mensal: R$X-Y

## [Subagente — ex: pesquisador]
- Modelo: Claude Haiku
- Tipo: subagente · invocado por [agente principal] sob demanda via /subagents spawn
- Modo: isolated (default)
- Retorna: síntese de 200 palavras
```

## Prompts prontos pra colar

### 1. Análise honesta — preciso evoluir pra multi-agente?

```
Quero analisar honestamente se faz sentido evoluir pra multi-agente
agora. Vai na doc oficial em https://docs.openclaw.ai/concepts/multi-agent
e nesse cheatsheet (multi-agente.md no kit), e me responde:

1. Quais dos 4 sinais de "vale evoluir" se aplicam ao meu uso atual?
   (analisa minha MEMORY.md e crons ativos pra evidência)
2. Tô em risco de cair em algum dos 6 sintomas de overengineering?
3. Se faço sentido, qual caminho recomenda PRIMEIRO — subagente
   pontual OU agente paralelo?
4. Custo estimado de manutenção mensal (multiplicador 5x sobre
   o que tenho hoje)?

Se a resposta for "ainda não vale", me diz claramente. Não invente
problema pra justificar evolução.
```

### 2. Criar subagente especialista (caminho mais comum)

```
Quero criar um subagente especialista pra tarefas pontuais de
[pesquisa profunda / análise de documento / geração de imagem /
análise financeira].

Vai na doc oficial em https://docs.openclaw.ai/tools/subagents,
lê como criar, me explica:

1. Como configurar o agentId (registrar em AGENTS.md)
2. Quais TOOLS.md ele precisa (scope mínimo — recap A10)
3. Modelo recomendado (Haiku pra task barata, Sonnet pra
   complexa, Opus pra raciocínio profundo)
4. Modo de contexto: isolated (default) vs fork
5. Como vou invocar via /subagents spawn

Configura tudo, registra em AGENTS.md, me dá comando exato pra
testar com 1 task simples primeiro. Aplica scope mínimo (recap
A10) e me lembra de monitorar uso de tokens nos primeiros 30 dias.
```

### 3. Gerar AGENTS.md inicial baseado no meu perfil

```
Quero estruturar meu AGENTS.md como organograma do meu time
digital. Vai na doc oficial em https://docs.openclaw.ai/reference/AGENTS.default
+ template em https://docs.openclaw.ai/reference/templates/AGENTS,
e me ajuda:

1. Lê meu USER.md pra entender meu contexto (negócios, papéis,
   ferramentas)
2. Identifica 2-3 domínios mais críticos que poderiam ter agente
   próprio (não me empurre 5+, princípio anti-overengineering)
3. Sugere se cada um deve ser SUBAGENTE (pontual) ou AGENTE
   PARALELO (contínuo)
4. Gera AGENTS.md inicial com seções: quem é cada agente · quem
   chama quem · onde vivem · permissões cruzadas · governance
   (cap mensal)
5. Me mostra antes de salvar — quero revisar

Princípios A10: scope mínimo por agente · cap de custo por agente ·
audit log · monitoramento diário primeiros 30 dias.
```

### 4. Configurar handoff entre agentes paralelos

```
Tenho 2 agentes paralelos (Amora e openclawzinho) e quero
configurar handoff entre eles. Vai na doc oficial em
https://docs.openclaw.ai/concepts/delegate-architecture e
https://docs.openclaw.ai/concepts/multi-agent, e:

1. Atualiza meu AGENTS.md pra registrar regras de handoff:
   - openclawzinho escala pra Amora se aparecer mention dela no
     escopo dele OU se cliente pedir "falar com [aluno]"
   - Amora delega questão técnica de comunidade pra openclawzinho
     via /subagents spawn (mas openclawzinho é agente paralelo,
     não subagente, então o caminho é arquivo compartilhado em
     shared/notes/handoff-{timestamp}.md)
2. Configura `requireMention: true` nos canais compartilhados
   (recap A3) pra evitar spam de respostas duplicadas
3. Cria template de arquivo de handoff em shared/notes/
4. Me explica como vai funcionar na prática com 1 exemplo concreto

Princípios A10: cada agente mantém scope próprio · não vazamento
de contexto entre escopos · audit log do handoff.
```

### 5. Criar agente paralelo dedicado a 1 canal Telegram (do zero)

> Caso clássico: você tem agente principal (Amora pessoal) e quer criar um
> SEGUNDO agente dedicado a um grupo/canal Telegram específico (suporte da
> comunidade, equipe interna, atendimento de cliente). Esse é o padrão
> openclawzinho — agente nasce com escopo, identidade e canal próprios.

```
Quero criar um SEGUNDO agente paralelo dedicado APENAS ao canal
Telegram [DESCREVE O CANAL: ex "grupo da comunidade do meu curso",
"grupo do time de atendimento", "DM do meu cliente X"].

NÃO quero que ele acesse outros canais da Amora. NÃO quero que ele
veja contexto pessoal meu (USER.md fica isolado). Quero workspace,
identidade e memória SEPARADOS — só compartilha o que faz sentido
(eventualmente assets em shared/).

Vai na doc oficial em https://docs.openclaw.ai/concepts/multi-agent +
https://docs.openclaw.ai/reference/AGENTS.default + esse cheatsheet
(multi-agente.md), e executa:

1. **Bot novo no @BotFather** (NÃO reusar o token da Amora):
   - Me lista os passos no @BotFather (`/newbot` · nome · handle ·
     token)
   - Me LEMBRA explicitamente de rodar `/setprivacy` → Disable
     ANTES de adicionar o bot no grupo (recap A1/A4 — sem isso o
     bot fica cego no grupo)

2. **Workspace isolado em `~/.openclaw/agents/<nome>/`**:
   - Cria a pasta com SOUL.md, IDENTITY.md, MEMORY.md próprios
   - SOUL.md com TOM adequado ao papel (suporte = atencioso paciente
     · equipe = direto operacional · cliente = profissional formal) —
     diferente do tom da Amora
   - IDENTITY.md com missão única clara em 3 linhas
   - MEMORY.md vazio (só auto-conhecimento da doc OpenClaw)
   - USER.md: pergunta se quero compartilhar com a Amora (mesmo
     aluno · same `users/<aluno>.md`) ou criar perfil isolado
     (caso de cliente externo onde o "user" do agente não sou eu)

3. **Conectar SÓ a este canal**:
   - Configura o bot no agente novo via `openclaw channels add`
     com escopo restrito ao chat_id específico (não responde em
     outros canais mesmo se for adicionado)
   - Privacy disabled (já feito no passo 1)
   - `requireMention: true` se for grupo (recap A3) pra não virar
     spam

4. **Registra em `AGENTS.md` (organograma do workspace)**:
   - Adiciona seção do agente novo com: nome · papel · canais ·
     escopo (o que ele pode/não pode acessar) · regras de handoff
     com a Amora · cap mensal de custo (recap A10)
   - Atualiza seção da Amora pra deixar claro que ela NÃO opera
     nesse canal (escopo restrito)

5. **Validação final** antes de eu testar:
   - Manda mensagem no canal pra confirmar que o agente novo
     responde (e não a Amora)
   - Manda mensagem em outro canal da Amora pra confirmar que o
     agente novo NÃO responde lá
   - Mostra `AGENTS.md` final pra eu revisar

Princípios A10:
- Scope mínimo (token só pra ESTE bot · sem acesso cruzado)
- Identidade própria (SOUL/IDENTITY/MEMORY isolados)
- Cap mensal de custo (default: R$ 50/mês — me pergunta o valor)
- Audit log de mensagens primeiros 30 dias

NÃO crie o agente sem me mostrar o plano completo antes. Quero
confirmar identidade, escopo e cap antes de você executar.
```

### 6. Migrar contexto saturado de canal pra agente dedicado

> Caso clássico: sua Amora ficou confusa porque tá atendendo seu pessoal
> + grupo da comunidade ao mesmo tempo. Sintoma: ela responde em tom errado,
> confunde contexto entre clientes e você, perde performance. Hora de spawnar
> agente dedicado e migrar o contexto.

```
Minha [Amora / agente principal] tá saturada — começou a misturar
contextos do canal [DESCREVE O CANAL] com o resto. Sintomas que
percebo: [ex: "responde no tom da minha persona pessoal pra
cliente", "esquece briefing do grupo X depois de 2 dias", "não
distingue thread do cliente Y do thread do cliente Z"].

Quero migrar TODO o contexto desse canal pra um agente novo
dedicado. Vai na doc oficial + cheatsheet multi-agente.md, e
executa em ordem (CONFIRMA cada passo antes de seguir):

1. **Análise prévia (sem mexer em nada ainda)**:
   - Identifica quais arquivos do workspace da Amora são relevantes
     SÓ pra esse canal (memory, notes, briefings, decisões)
   - Lista o que vai migrar vs o que fica com a Amora
   - Estima tempo + risco (canal X horas sem bot durante migração)

2. **Cria o agente novo** seguindo o Prompt 5 do cheatsheet
   multi-agente.md (bot novo, privacy disabled, workspace isolado,
   identidade própria, etc) — usa nome [SUGESTÃO: ex
   "openclawzinho" pra suporte · "léo" pra equipe · "<dominio>"
   pra cliente].

3. **Migra arquivos**:
   - Move (não copia) os arquivos identificados no passo 1 pra
     `~/.openclaw/agents/<novo>/workspace/`
   - Atualiza referências internas (links, paths) nos arquivos
     migrados
   - Faz backup de tudo em `shared/migrations/<data>/` antes de
     mover, caso eu queira reverter

4. **Repassa identidade do canal pro novo agente**:
   - Cria SOUL.md adequado ao tom desse canal (suporte =
     atencioso, equipe = direto, cliente = formal)
   - IDENTITY.md com missão clara
   - MEMORY.md já populado com o histórico relevante extraído
     do canal (últimos 30 dias)

5. **Desconecta a Amora desse canal**:
   - Remove o canal da config da Amora
   - Atualiza AGENTS.md pra refletir que esse canal agora é do
     novo agente
   - Adiciona regra de handoff (Amora encaminha pro novo agente
     se cliente do canal acidentalmente DM ela)

6. **Valida tudo antes de eu testar**:
   - Manda 1 mensagem teste no canal — confirma que o novo agente
     responde (e a Amora NÃO)
   - Confirma que a Amora ainda funciona normal nos OUTROS canais
     dela
   - Resume o que mudou em formato de release notes

Princípios A10: backup antes de migrar · scope mínimo no agente
novo · cap de custo · 30 dias de monitoramento próximo.

CRÍTICO: NÃO faça migração destrutiva sem backup. NÃO desconecte
a Amora do canal antes do novo agente estar 100% testado e
respondendo. Aluno PME não pode ficar com canal mudo durante
migração.
```

## 3 informações que o agente sempre vai pedir

Independente do caminho escolhido, agente precisa de:

| Informação | Exemplo prático |
|------------|-----------------|
| **Tipo de relação** (subagente ou paralelo?) | Pesquisa pontual = subagente · atendimento contínuo = paralelo |
| **Escopo** (o que cada um pode fazer) | Amora vê tudo · openclawzinho só comunidade · pesquisador só busca web |
| **Comunicação** (como conversam) | Subagente spawn · mention canal · arquivo · cron — escolha 1-2 caminhos, não todos |

## Princípios de segurança aplicados (recap A10)

Multi-agente = múltiplas superfícies de risco. Aplicar **sempre**:

1. **Cada agente com scope próprio** — não compartilhe credenciais entre escopos diferentes
2. **AGENTS.md vivo e auditado** — atualiza quando muda algo, mensal review
3. **Cap de custo por agente** — previne loop ou bug que esgota quota
4. **Monitoramento diário primeiros 30 dias** — agente novo é como funcionário novo
5. **`requireMention: true` em canais compartilhados** — previne spam e vazamento
6. **Defesa anti-prompt-injection no SOUL** de cada agente paralelo (recap A10 Bloco 5)

## Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `/subagents spawn` retorna "agentId not found" | Subagente não registrado em AGENTS.md | Adiciona seção do subagente no AGENTS.md + reload |
| Subagente nunca anuncia resultado | Task muito complexa OU modelo travou | Reduzir thinking level · usar modelo melhor · verificar logs |
| 2 agentes respondendo no mesmo canal | `requireMention: false` ou config incorreta | Configurar `requireMention: true` em ambos · validar no AGENTS.md |
| Loop infinito Amora ↔ openclawzinho | Ambos com handoff pro outro sem condição de parada | Adicionar condição "max 1 handoff por thread" no AGENTS.md |
| Custo dobrou em 1 mês | Cron de subagente disparando demais | `openclaw cron list` · validar frequência · adicionar cap no AGENTS.md |
| Agente paralelo "esquece" o que outro fez | Contextos isolados (correto por design) | Use arquivo compartilhado em `shared/notes/` pra contexto cruzado |

## Quando NÃO usar plano B

- **Aluno PME que tá no day 30 ou menos**: stay com 1 agente principal + subagentes pontuais. Agente paralelo é refinamento avançado
- **Time de 1 pessoa**: provavelmente não precisa de multi-agente. 1 agente bem configurado resolve
- **Sem budget pra cap mensal por agente**: multi-agente sem governance vira surpresa de fatura

## Pendências de validação (release v1.0 do kit)

URLs e comandos validados na doc oficial OpenClaw em 03/05/2026.

**Antes de release v1.0 do Starter Kit:**

1. Testar `/subagents spawn` real em conta Managed — confirmar que sintaxe do exemplo funciona
2. Validar que `requireMention: true` funciona quando 2 bots estão no mesmo grupo Telegram (recap A3)
3. Testar handoff via arquivo compartilhado entre 2 agentes paralelos no mesmo workspace
4. Confirmar que `openclaw agent --agent <id>` dispara turno em agente específico no mesmo OpenClaw Managed
5. Refinar 4 prompts prontos baseado em onde o agente trava

## Referências

- **Doc oficial**: [docs.openclaw.ai/concepts/multi-agent](https://docs.openclaw.ai/concepts/multi-agent) · [delegate-architecture](https://docs.openclaw.ai/concepts/delegate-architecture) · [parallel-specialist-lanes](https://docs.openclaw.ai/concepts/parallel-specialist-lanes) · [tools/subagents](https://docs.openclaw.ai/tools/subagents) · [tools/multi-agent-sandbox-tools](https://docs.openclaw.ai/tools/multi-agent-sandbox-tools) · [cli/agents](https://docs.openclaw.ai/cli/agents)
- **Templates**: [AGENTS.default.md](https://docs.openclaw.ai/reference/AGENTS.default) · [AGENTS.md template](https://docs.openclaw.ai/reference/templates/AGENTS)
- **Recaps internos**: A5 (AGENTS.md introduzido) · A9 (cron) · A10 (segurança operacional aplicada a multi-agente) · A3 (`requireMention: true`)
