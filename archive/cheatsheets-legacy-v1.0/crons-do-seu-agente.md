---
name: crons-do-seu-agente
status: ATIVO
category: cheatsheet
referenced_by: [A9]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra crons + heartbeat do agente OpenClaw (A9). Cobre cron vs heartbeat (tabela comparativa) · 4 categorias com 10+ exemplos · 4 comandos naturais cobrem 100% · Revisão do Dia (cron-âncora 18h) · meta-cron de auditoria · 7 ideias de heartbeat · regras de silêncio · 5 prompts prontos · comandos OpenClaw validados · troubleshooting · princípios A10.
---

# Crons do seu agente — referência rápida (A9)

## Como usar este cheatsheet

**Caminho default — prompt natural pro agente** (linha de produção):

Cola um dos prompts da seção "Prompts prontos pra colar" direto no Telegram. O agente cuida da sintaxe Unix, da sessão isolada, do delivery channel — você fala natural.

**Caminho de plano B — comando direto** (use quando):
- Cron criado mas não disparou e você quer inspecionar histórico
- Aluno avançado quer rodar `openclaw cron *` no terminal Managed
- Validando flags específicas (`--session isolated`, `--light-context`, `--at`)

## A9 em 1 minuto (resumo executivo)

OpenClaw tem **2 mecanismos de proatividade complementares**:

- **Cron** — timing exato (segunda 9h sharp), tarefa isolada, output entregue direto no canal. *"O que TEM que acontecer."*
- **Heartbeat** — drift de timing OK (~30min de janela), múltiplas checks pequenas em batch, agente decide se age ou fica quieto. *"O que PODE valer a pena."*

**Frase-mãe da A9:** *"cron = onde você dá super poderes ao agente. Sem cron, ele é assistente. Com cron, ele é operação."*

Você sai da A9 com **3 crons suficientes pra começar:** Revisão do Dia (18h) + meta-cron de auditoria (7h) + 1 cron próprio do seu workflow. Não cria 15 no day 1 — vira ruído.

## Cron vs heartbeat — quando usar cada um

| Dimensão | **Heartbeat** | **Cron** |
|----------|--------------|----------|
| **Timing** | Drift OK (~30min de janela) | Exato ("segunda 9h sharp") |
| **Tarefa** | Múltiplas checks pequenas em batch | 1 task isolada |
| **Contexto** | Usa histórico de mensagens recentes + lê `memory/hot.md` | Sessão isolada (default) |
| **Custo API** | Reduz chamadas (1 turno = N checks) | 1 chamada por trigger |
| **Output** | Conversa contigo (ou silêncio) | Entrega direto no canal |
| **Quem mantém o quê** | `HEARTBEAT.md` (aluno · raro) + `memory/hot.md` (agente · auto) | `openclaw cron add` ou prompt natural · agente cuida |
| **Exemplo** | "a cada 30min checa inbox + calendar + mentions, me avisa só se tiver algo real" | "toda segunda 9h roda doctor + lista pendências priorizadas" |

> **Regra de bolso:** se você quer *"que ele me avise SE acontecer X"*, é heartbeat. Se você quer *"que ele faça X no horário Y"*, é cron. Os dois convivem — agente bom usa os 2.

## 4 categorias de cron — 10+ exemplos

Quase todo cron útil cai em 1 dessas 4. Antes de criar cron novo, identifica em qual categoria ele vive — ajuda a manter painel organizado e evita duplicar tarefa.

### 1. Monitoramento (saúde do sistema)

- **Health check semanal** (recap A2) · valida que API key, OAuth, canais e crons tão OK
- **Auditar workspace mensal** (gancho A6) · agente checa MAPAs, MEMORY, skills e relata o que tá fora do padrão
- **Auditar os próprios crons** (meta-cron, ver mais abaixo) · cron que checa se os outros rodaram OK nas últimas 24h

### 2. Pesquisa & estudo

- **Pesquisas de conteúdo** · tendências do dia no seu nicho · pauta de newsletter
- **Ler documentação nova** de ferramenta que você usa · agente avisa do que mudou
- **Analisar próprias memórias** pra aprender padrões sobre você (recap A7)

### 3. Sumarização & relatórios

- **Relatório semanal** (vendas · KPIs · métricas operacionais)
- **Analisar fluxos** (operacionais · conteúdo · comunicação) e propor otimização
- **Tickets de suporte** · agente lê novos tickets, classifica por categoria + urgência
- **Newsletter da comunidade** · caso real do openclawzinho — agente compila dúvidas e respostas da semana

### 4. Planejamento & reflexão

- **Revisão do Dia** (próprio Bloco 4 da A9 — cron-âncora) · agente fecha o dia 18h e prepara o seguinte
- **Auditar notas das pessoas** pra ver o que aprenderam · útil pra cohort de mentoria
- **Pergunta-da-semana** · cron faz 1 pergunta toda segunda pra te conhecer melhor — agente curador da relação humano-máquina

> **Princípio:** se cron novo não couber em nenhuma das 4 categorias, provavelmente não é cron — é skill que você roda manualmente.

## 4 comandos naturais cobrem 100% do uso

Esquece terminal, esquece crontab, esquece cron expression. **Você fala natural. Ele cuida da técnica.**

| Intenção | Prompt natural |
|----------|----------------|
| Criar cron | `cria um cron toda manhã 8h que olha minhas pendências e me manda priorizadas` |
| Listar crons | `me lista os crons que eu tenho` |
| Apagar cron | `apaga o cron das pendências` |
| Rodar agora (teste) | `roda o cron de revisão do dia agora` |

Saída esperada do listar: nome · horário · próxima execução · status (ativo/pausado). Vale rodar 1x por mês pra revisar.

## Revisão do Dia em detalhe (cron-âncora 18h)

Cron equivalente do "fechamento do dia" do empreendedor humano. Roda fim de tarde, agente audita o próprio dia, manda no Telegram tópico Operação. **Você chega de manhã e o agente já preparou amanhã pra você.**

### O que faz

1. **Lê a daily note do dia** (cruza com memória semântica — recap A7)
2. **Lista o que ficou pendente** (cruza decisões com pendências — sem dramatização)
3. **Alerta sobre amanhã** (calls, deadlines, prazos do dia seguinte)

### Output típico no Telegram tópico Operação

> **Hoje fiz:** X, Y, Z.
>
> **Aberto:** A, B.
>
> **Amanhã:** call Cayo 14h sobre VSL — lembrei de revisar antes.

### Prompt pra criar Revisão do Dia

```
cria um cron toda dia 18h chamado revisao-do-dia que:

1. Lê minha daily note do dia (memory/YYYY-MM-DD.md) e cruza
   com memória semântica
2. Lista o que ficou pendente (cruza decisões do dia com
   pendencias.md)
3. Alerta sobre amanhã: lê calls, deadlines, prazos do dia
   seguinte do calendar e do pendencias.md
4. Manda resumo no Telegram tópico Operação no formato:
   - Hoje fiz: ...
   - Aberto: ...
   - Amanhã: ...
5. Roda em sessão isolada (não polui contexto da sessão atual)

Se não tiver daily note do dia, gera uma rápida cruzando com
memória antes de fazer a revisão.
```

> **Skill `revisao-do-dia`:** existe no kit (verificar `starter-kit/skills/` da release ativa). Se não estiver instalada, o agente cria sob demanda usando `criar-skill` (recap A8).

## Meta-cron de auditoria (cron que audita os próprios crons)

Crons às vezes quebram — modelo retorna erro, ferramenta externa fica fora, prompt não funciona como esperado. Sem auditoria, você só descobre quando alguém reclama (ou pior, quando o relatório que ia chegar segunda não chegou).

**Solução:** cron de auditoria às 7h. Funcionário precisa de supervisor — mesmo se o supervisor for ele mesmo.

### Prompt pra criar meta-cron

```
cria um cron toda manhã 7h que checa todos os crons que
rodaram nas últimas 24h, lista os que deram OK e os que
falharam, e me manda resumo no Telegram tópico Operação.

Se algum falhou, inclui o erro pra eu poder corrigir.

Roda em sessão isolada e usa --light-context (não precisa
carregar contexto pesado pra essa auditoria).
```

> **Por que 7h:** a maioria dos crons matinais dispara entre 8h-10h. O relatório das 7h pega o que rodou na noite anterior + dá tempo pra você corrigir antes do dia começar.
>
> **Frase-mãe:** *você não confia 100% em cron. Mas você confia em cron que audita cron.*

## Heartbeat — o agente que respira

Heartbeat é o 2º mecanismo de proatividade. A cada N minutos o agente recebe uma "batida" — uma mensagem do tipo "tô vivo, alguma coisa nova?". Ele rotaciona checagens curtas e tem 2 saídas: ou **te escreve algo de valor**, ou responde `HEARTBEAT_OK` e fica quieto.

### Os 2 arquivos que fazem heartbeat funcionar

| Arquivo | Função | Quem mantém |
|---------|--------|-------------|
| `HEARTBEAT.md` | **COMO ele vigia** — frequência do poll, quais checks rotacionar, regras de silêncio, quiet hours | Aluno (raro · só quando muda comportamento) |
| `memory/hot.md` | **O QUE ele vigia** — prioridades da semana, prazos críticos, negociações ativas, decisões recentes | Agente (auto · pipeline + skill `/salve`) |

> **Por que separar:** `hot.md` muda toda hora (você decide algo, agente atualiza). `HEARTBEAT.md` raramente muda (você define comportamento uma vez e ajusta só se ficar barulhento ou silencioso demais). Misturar os 2 = arquivo gigante que ninguém edita.

### 7 ideias de heartbeat pra experimentar

O agente sorteia 2-4 dessas por dia (não checa todas em todo heartbeat — senão fica chato). Cada uma é 1 linha em `HEARTBEAT.md` na seção "## Checks rotacionáveis":

- **Inbox triage** — abre Gmail, lista emails não-lidos das últimas 4h, classifica em [urgente / pode esperar / lixo], avisa só os urgentes
- **Calendário próximo** — checa próximas 24-48h, lembra do que tem amanhã 1 dia antes às 18h se você ainda não confirmou
- **Mention sweep** — checa LinkedIn/Twitter por menções desde a última checagem, manda só as relevantes pro negócio
- **Pendências paradas** — lê `pendencias.md`, identifica itens com nome de terceiro parado há 3+ dias, sugere mensagem de follow-up
- **Memory maintenance** — a cada 3 dias lê últimos `memory/YYYY-MM-DD.md`, extrai aprendizados duráveis pra `MEMORY.md`, remove ruído
- **Weather guard** — se você tiver evento externo hoje, checa previsão e avisa só se tem chance real de chuva
- **News watch** — checa 2-3 fontes que importam pro seu negócio (newsletters · RSS · feeds), só manda se tiver algo realmente novo desde a última checagem

### Regras de silêncio (anti-spam) — vêm prontas no template do Kit

Heartbeat sem regras de silêncio vira spam. Bom heartbeat é silencioso a maior parte do tempo:

- **Quiet hours 23h–8h** — só interrompe se for urgência real (deadline em <2h)
- **Já checou nos últimos 30min?** — não checa de novo, responde `HEARTBEAT_OK` direto
- **Nada novo desde a última checagem?** — silêncio (não manda "tudo certo!" gratuito)
- **Você tá em modo focado** (call · trabalho profundo) — segura mensagem não-urgente pro próximo break
- **Reach out só quando:** email importante chegou · evento <2h · achou algo genuinamente interessante · faz >8h sem dizer nada

> **Anti-padrão:** heartbeat configurado pra "me manda resumo do dia toda hora". Vira ruído. **Bom heartbeat parece silêncio** — você só percebe que ele tá vivo quando ele te alerta de algo real. Se tá enchendo o saco, abre `HEARTBEAT.md` e aperta as regras.

## 5 prompts prontos pra colar

### 1. Criar primeiro cron (escolha o caso · 4 perguntas · prompt natural)

```
Quero criar meu primeiro cron próprio (já tenho o health
check da A2). Antes de criar, me pergunta:

1. Em qual das 4 categorias ele vive (monitoramento /
   pesquisa / sumarização / planejamento)?
2. Qual gatilho exato (dia + horário)?
3. Qual entrada o cron lê (Telegram, Gmail, pendencias.md,
   skill X)?
4. Qual o output esperado (formato + canal de entrega)?

Depois das minhas respostas, monta o prompt natural pro
cron e roda. Mostra como ficou o cron criado e a próxima
execução agendada. Roda em sessão isolada por padrão.
```

### 2. Ativar heartbeat com 1 check só (testar 1 dia, depois ligar mais)

```
Quero ativar heartbeat pra você ficar mais proativo no
meu dia — mas começando devagar.

Faz o seguinte:

1. Cria/atualiza HEARTBEAT.md na raiz do workspace (template
   do Kit já tem base — copia se ainda não existe). Estrutura
   inicial:
   - Frequência: poll a cada 30min entre 8h-22h
   - Quiet hours: 22h-8h (só urgência real)
   - Check rotacionável (1 só pra começar):
     · Inbox triage (emails das últimas 4h, só urgentes)
   - Regras de silêncio padrão (não checa 2x em 30min ·
     silêncio se nada novo · reach out só com valor real)

2. Pra cada heartbeat, lê memory/hot.md pra entender
   contexto da semana antes de decidir se age ou fica quieto.

3. Mostra como ficou o HEARTBEAT.md antes de salvar — eu
   confirmo.

Depois de aplicado, confirma que tá rodando: me manda
HEARTBEAT_OK no próximo poll mesmo se não tiver nada novo.

Princípio: heartbeat agressivo no day 1 é o jeito mais
rápido de odiar a feature. Começa com 1 check, vê 1 dia,
depois liga os outros.
```

### 3. Auditar crons rodando (meta-cron · detectar dormindo · custo)

```
Faz auditoria completa dos meus crons:

1. Lista todos os crons configurados (nome · horário ·
   última execução · status)
2. Identifica crons "dormindo" (não rodaram nos últimos
   30 dias) — sugere desativar ou apagar
3. Detecta crons com tarefas duplicadas (2 fazem a mesma
   coisa em horários diferentes)
4. Estima custo aproximado mensal de cada cron rodando
   (token usage do histórico)
5. Sugere quais valem manter e quais consolidar

Reporta no Telegram tópico Operação no formato:
- ATIVOS E ÚTEIS: ...
- DORMINDO (revisar): ...
- DUPLICADOS (consolidar): ...
- CUSTO MENSAL APROXIMADO: ...

Não desativa nada — só me mostra a análise pra eu decidir.
Princípio A10: cap mensal por cron · cron sem ROI claro
sai da lista.
```

### 4. Configurar Revisão do Dia (cron 18h · template de output)

```
cria um cron toda dia 18h chamado revisao-do-dia que:

1. Lê minha daily note do dia (memory/YYYY-MM-DD.md) e
   cruza com memória semântica
2. Lista o que ficou pendente (cruza decisões do dia com
   pendencias.md)
3. Alerta sobre amanhã: lê calls, deadlines, prazos do dia
   seguinte do calendar e do pendencias.md
4. Manda resumo no Telegram tópico Operação no formato:
   - Hoje fiz: ...
   - Aberto: ...
   - Amanhã: ...
5. Roda em sessão isolada (não polui contexto da sessão atual)

Se a skill revisao-do-dia já existir no kit, usa ela.
Se não existir, cria via criar-skill antes de configurar
o cron.

Mostra o cron criado e a próxima execução. Princípio A10:
audit log de cada execução · cap de tokens por run.
```

### 5. Migrar workflow recorrente pra cron (opcional)

```
Você percebeu que toda [dia/semana/mês] eu peço:
"[cola aqui o pedido recorrente]"

Toda vez que eu peço, você executa basicamente os mesmos
passos.

Transforma isso num cron:
1. Identifica em qual das 4 categorias ele vive
2. Sugere horário ótimo (considerando meu fuso BRT e quando
   o output é mais útil)
3. Define gatilho + entrada + processo + entrega
4. Se precisar de skill custom, cria via criar-skill antes
5. Cria o cron rodando em sessão isolada

Antes de ativar, mostra a configuração completa e a primeira
execução agendada. Roda 1x manualmente como teste pra eu
validar antes de virar autopilot.
```

## Comandos `openclaw cron` (validados na doc oficial)

| Comando | Pra que serve |
|---------|---------------|
| `openclaw cron add` | Adiciona cron novo (sintaxe Unix ou flag `--at`) |
| `openclaw cron list` | Lista todos os crons configurados |
| `openclaw cron run --id <id>` | Executa cron agora (sem esperar horário) |
| `openclaw cron runs --id <id>` | Histórico de execuções de cron específico |
| `openclaw cron edit --id <id>` | Edita prompt, horário ou flags |
| `openclaw cron rm --id <id>` | Remove cron |
| `openclaw cron enable / disable` | Pausa ou retoma cron sem deletar |
| `openclaw cron status` | Saúde geral do sistema de crons |

### Flags úteis

| Flag | Pra que serve |
|------|---------------|
| `--session isolated` | Cron roda em sessão limpa (default · evita poluir contexto atual) |
| `--light-context` | Carrega só o essencial (mais rápido, custo menor) |
| `--no-deliver` | Executa mas não envia output (útil pra teste) |
| `--at <datetime>` | Cron de execução única (em vez de cron expression Unix) |

> **Princípio do curso:** 95% dos casos não precisa abrir terminal. Você fala natural pro agente — ele monta as flags certas. Esses comandos ficam aqui pra debugar caso algo dê errado.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Cron criado mas não disparou no horário | Timezone errado ou agente offline na hora | Pede *"checa o status do cron X e me diz se rodou"* · roda `openclaw cron runs --id <id>` |
| Output do cron não chega no Telegram | Tópico não definido ou bot sem permissão de postar | Confere allowlist do tópico (A4) · refaz cron com tópico explícito |
| Cron poluiu sessão atual com contexto novo | Esqueceu de pedir sessão isolada | Pede *"reedita esse cron pra rodar em sessão isolada"* (`--session isolated`) |
| 2 crons rodam tarefa parecida | Você criou novo sem revisar lista | Pede *"me lista todos os crons e me diz se algum tá duplicado"* |
| Cron quebrou com erro de modelo | OAuth caducou ou API key sem crédito | Roda `openclaw status` · recarrega API se preciso (recap A1) |
| Revisão do Dia vem vazia | Daily note do dia não foi alimentada | Pede *"o que rolou no nosso dia hoje?"* antes da Revisão · agente popula a memória |
| Meta-cron de auditoria não detecta falhas | Janela de 24h muito longa pra cron horário | Reduz janela de auditoria pra 6h ou roda meta-cron 4x/dia |
| Cron usa skill que mudou e quebra | Skill foi editada após o cron ser criado | Roda cron manualmente pra ver erro · pede agente pra atualizar referência |
| Heartbeat virou spam | Regras de silêncio não estão sendo respeitadas OU checks ativos demais | Abre `HEARTBEAT.md` · reduz pra 1-2 checks · aperta quiet hours · aumenta intervalo de poll |
| Heartbeat ficou silencioso demais | Regras de silêncio agressivas demais OU `hot.md` desatualizado | Pede *"audita HEARTBEAT.md e hot.md, sugere ajustes pra você ser mais útil"* |
| Meta-cron consume tokens demais | Auditoria carregando contexto pesado sem precisar | Adiciona flag `--light-context` no meta-cron · audita só os 5 crons mais importantes (não todos) |

## Princípios A10 aplicados a crons + heartbeat

Cron = código que roda sozinho à noite. Heartbeat = código que checa coisas sem você ver. Ambos pedem segurança defensiva desde o setup:

- **Cap mensal por cron.** Define limite de tokens/mês por cron. Cron sem ROI claro sai da lista. Princípio: 3 crons úteis > 15 crons enroscados.
- **Audit log de cada execução.** Toda execução de cron e heartbeat fica registrada — `openclaw cron runs --id <id>` mostra histórico. Sem histórico = você descobre falha tarde.
- **Heartbeat com regras de silêncio (anti-spam).** Quiet hours · não checa 2x em 30min · silêncio quando nada novo. Bom heartbeat parece silêncio.
- **Sessão isolada por padrão.** Cron sem `--session isolated` polui sessão atual = vazamento de contexto. Default seguro.
- **Meta-cron audita os crons.** Funcionário precisa de supervisor. Cron de 7h checa o que rodou nas últimas 24h e te avisa do que falhou — antes de você descobrir tarde.
- **Skill em cron precisa carregar tudo explicitamente.** Cron roda em sessão limpa — skill que dependia de contexto da sessão atual quebra. Documenta tudo no SKILL.md.

## Pendências de validação (release v1.0 do kit)

Antes de release v1.0:

1. Validar `openclaw cron add / list / run / runs / edit / rm / enable / disable / status` em conta zerada — confirmar formato de saída
2. Testar fluxo Revisão do Dia ponta-a-ponta (cron criado · daily note alimentada · output no Telegram tópico Operação)
3. Validar meta-cron de auditoria detectando falha intencional (cron com prompt quebrado) em <24h
4. Confirmar que template `HEARTBEAT.md` do kit traz: frequência · quiet hours · 7 checks rotacionáveis comentados · regras de silêncio
5. Validar que skill `revisao-do-dia` está instalada (ou cria via `criar-skill` sob demanda)
6. Testar que `--light-context` reduz custo de execução em meta-cron sem perder funcionalidade

## Referências

### Internas
- A9 do roteiro principal: `memory/curso-openclaw-v2/aulas/aula-09-crons/`
- A2 (cockpit terminal): primeiro cron (health check semanal) — pré-requisito
- A7 (memória): aprofunda `memory/hot.md` e contexto persistente que heartbeat lê
- A8 (skills): cron carrega skill — combinação skill + cron = autopilot
- A10 (segurança): princípios aplicados a crons autônomos
- A12 (integrações): cron acionado por evento (Calendar · Email)
- A14 (Mission Control): observar crons em tempo real
- Cheatsheet `skills-do-seu-agente.md`: complementar (skill que cron carrega)
- Cheatsheet `mission-control.md`: como observar crons rodando

### Externas
- Doc OpenClaw cron: [docs.openclaw.ai/cli/cron](https://docs.openclaw.ai/cli/cron)
- Doc OpenClaw tools (capacidade nativa cron): [docs.openclaw.ai/tools](https://docs.openclaw.ai/tools)

---

> **Anti-hype:** não cria 15 crons no day 1. Maioria fica órfã, ninguém revisa, vira ruído no Telegram. **3 crons úteis (Revisão do Dia + meta-cron + 1 do seu workflow) > 15 crons enroscados.** Vai adicionando conforme aparecer repetição real na sua semana.
