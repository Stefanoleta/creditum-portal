---
name: executing-plans
status: ATIVO
category: planejamento
owner: aluno
version: 1.0
mode: guided
estimated_time: varia (executa o plano todo)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4]
description: Use to execute a plan written by writing-plans skill. Walks through tasks one by one, marks progress in real-time, surfaces blockers, asks for review at checkpoints. Adapted from obra/superpowers (executing-plans skill). Loops independently until plan is done or blocker hit.
source: https://github.com/obra/superpowers (skill: executing-plans)
---

# Executing Plans — Tirar Plano do Papel

## Promessa

Pega o `PLAN.md` (gerado pela skill `writing-plans`) e executa tarefa por tarefa. Atualiza estado em tempo real, narra progresso, para em checkpoints definidos pra você revisar.

Sem essa skill, agente é "responsivo" — só faz quando você pergunta. Com ela, agente é "executivo" — você dá o plano, ele toca.

Adaptado de [obra/superpowers](https://github.com/obra/superpowers).

## Quando usar

**Use quando:**
- Tem `PLAN.md` em `memory/projects/{nome}/`
- Plano tem tarefas atômicas com verificação
- Você tem ~30min+ pra deixar agente executar e revisar pontos de checkpoint

**NÃO use pra:**
- Plano vago ("vou começar a fazer X")
- Tarefas sem critério de verificação (agente não saberá quando termina)
- Decisões pendentes ainda

## Como invocar

```
"Roda executing-plans pro projeto {nome}.

PLAN.md em memory/projects/{nome}/PLAN.md.

Quero que execute até o checkpoint da fase 1."
```

Ou mais aberto:

```
"Executa PLAN.md de memory/projects/{nome}/. Para no primeiro
checkpoint pra eu revisar."
```

## Comportamento esperado do agente

### 1. Lê plano + estado

Antes de começar, lê `PLAN.md` inteiro pra entender:

- O que tá feito (`[x]`)
- O que tá em progresso (`[~]`)
- O que tá bloqueado (`[!]`)
- O que falta (`[ ]`)

Identifica próxima tarefa não-bloqueada.

### 2. Anuncia próxima tarefa

```
"Próxima: T1.2 — {descrição}.
Estimativa: {Xmin}.
Verificação: {critério}.

Vou começar?"
```

Espera OK do aluno (ou pula confirmação se aluno mandou "executa tudo").

### 3. Executa

Faz a tarefa. Narra etapas significativas (não cada operação granular).

Se encontrar problema:
- **Ambíguo (precisa decisão):** PARA, pergunta ao aluno (Princípio 7)
- **Bloqueado externo (depende de algo fora):** marca `[!]`, segue pra próxima tarefa não-bloqueada
- **Erro técnico:** investiga 1-2x, se não resolve PARA e reporta (Princípio 9)

### 4. Verifica resultado

Antes de marcar `[x]`, valida o critério explicitamente:

```
"Verificação T1.2: {critério}
Resultado: {evidência concreta}
Status: ✓ passou"
```

Sem evidência concreta, NÃO marca como feito (Princípio: provar que funciona antes de declarar pronto).

### 5. Atualiza PLAN.md

Edita `PLAN.md` em tempo real:

- `[ ]` → `[~]` (começou)
- `[~]` → `[x]` (terminou e verificou)
- `[ ]` → `[!]` (bloqueado, com nota)

Atualiza seção "Estado atual" com última atividade.

### 6. Checkpoints

Em checkpoints definidos no plano (ex: fim de cada fase), PARA e mostra ao aluno:

```
"Checkpoint Fase 1 ✓

Resumo do que rolou:
- T1.1 [x]: {descrição curta + resultado}
- T1.2 [x]: {idem}
- T1.3 [x]: {idem}

Tempo gasto: ~Xmin (estimativa: Ymin)
Aprendizados: {nota se aprendeu algo importante}

Pronto pra Fase 2 ou quer revisar algo?"
```

Espera OK pra seguir.

## Casos especiais

### Aluno pediu "executa só T1.2"

Executa SÓ aquela tarefa. Não avança automaticamente.

### Aluno pediu "executa tudo até o final"

Executa todas as fases. Para SÓ em blockers ou quando precisa de decisão. Reporta ao final.

### Aluno pediu "para por aqui"

Pausa execução. Salva estado em `PLAN.md`. Não modifica nada mais.

### Plano tem tarefa com perigo (deletar dados, push pra prod, etc)

SEMPRE confirma antes — independente de aluno ter pedido "executa tudo". Princípio 2 (confirmação) sobrepõe modo automático.

## Princípios herdados

- **Princípio 4 (narrar antes):** sempre anuncia próxima tarefa antes de executar.
- **Princípio 5 (atualizar estado):** PLAN.md atualizado em tempo real.
- **Princípio 7 (em dúvida, perguntar):** ambiguidade material → para e pergunta.
- **Princípio 9 (parar se algo der errado):** erros técnicos não resolvidos em 1-2 tentativas viram pausa.

## Critérios de sucesso

- [ ] Próxima tarefa identificada e anunciada
- [ ] Tarefa executada
- [ ] Verificação explícita rodada (com evidência)
- [ ] PLAN.md atualizado
- [ ] Checkpoint reportado ao aluno (se aplicável)

## Erros comuns

- **Marcar tarefa como `[x]` sem verificação concreta:** falha clássica. Mostra evidência (output do comando, screenshot, link) ou não marca.
- **Pular tarefa "porque parecia trivial":** todas as tarefas viram `[x]` ou `[!]` ou `[~]`. Nenhuma é silenciosamente pulada.
- **Continuar mesmo com bloqueador:** Princípio 9 manda parar e replanejar, não empurrar.

## Adaptação pro Starter Kit

Versão original do superpower é mais elaborada (gerencia branches git, testes automáticos, etc). Esta versão simplifica pra projetos típicos de aluno: workflows, integrações, conteúdo.

Versão completa: https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md

## Referências

- Skill original: https://github.com/obra/superpowers
- Skill complementar: `writing-plans` (cria o plano)
- Skill complementar: `verification-before-completion` (valida ao final)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026) — versão curada/simplificada do superpower original.
