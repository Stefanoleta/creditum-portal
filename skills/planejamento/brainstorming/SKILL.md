---
name: brainstorming
status: ATIVO
category: planejamento
owner: aluno
version: 1.0
mode: guided
estimated_time: 5-15min (varia por escopo da decisão)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4]
description: Use BEFORE any creative or design work — features novas, mudanças de comportamento do agente, decisões de arquitetura. Explores user intent, requirements, and design BEFORE implementation. Adapted from obra/superpowers (originally for software engineering, applied here to general agent workflows). Forces explicit thinking instead of jumping to action.
source: https://github.com/obra/superpowers (skill: brainstorming)
---

# Brainstorming — Pensar Antes de Construir

## Promessa

Antes de pedir pro agente CONSTRUIR algo (feature nova, fluxo, automação, conteúdo), gastar 5-15min explorando o problema. Resultado: você sabe O QUE quer e POR QUÊ antes de começar. Constrói a coisa certa em vez de iterar versões erradas.

Adaptado da skill `brainstorming` do projeto [obra/superpowers](https://github.com/obra/superpowers) — originalmente pra eng de software, aplicado aqui pra workflows gerais de agente.

## Quando usar

**Use ANTES de:**
- Pedir agente criar skill nova
- Definir comportamento novo (ex: "agente vai responder X de jeito Y")
- Adicionar integração nova
- Mudar fluxo existente que tá te incomodando
- Qualquer "vamos construir" que envolve >1 hora de trabalho

**NÃO use pra:**
- Tarefa simples ("escreve um post sobre X")
- Bug fix óbvio
- Pedidos one-shot sem peso futuro

## Como funciona

### Etapa 1 — Por que (5min)

Antes de QUALQUER decisão técnica, responde:

```
1. O que tá te incomodando hoje?
2. Como você sabe que isso é problema (sintomas concretos)?
3. Se você não fizer NADA, qual o impacto em 30 dias?
4. Quem mais tem esse problema? (você só? equipe? clientes?)
```

Se você não consegue responder os 4 com clareza, você não tem PROBLEMA — você tem URGE de fazer coisa nova. Pausa.

### Etapa 2 — O quê (5min)

```
1. Em 1 frase, qual o resultado ideal? (não "usar X tecnologia" — RESULTADO)
2. Como você vai saber que deu certo? (métrica concreta)
3. Mínima coisa que resolve o problema? (não a versão completa, a versão MÍNIMA)
```

Maior parte dos projetos morrem porque pulam essa etapa. Aluno define escopo em "tudo que parece interessante" em vez de "o mínimo que resolve".

### Etapa 3 — Como (5min)

Só agora, pensa em implementação:

```
1. 2-3 abordagens diferentes pra resolver
2. Tradeoff principal de cada uma (tempo vs qualidade vs flexibilidade)
3. Qual você escolhe e POR QUÊ?
```

Se aluno só consegue pensar em 1 abordagem, geralmente não pensou direito. Forçar 2-3 expõe alternativas.

### Etapa 4 — Riscos (3min)

```
1. O que pode dar errado?
2. Se isso acontecer, qual o plano B?
3. Custo de errar (tempo perdido, dinheiro, relacionamento)?
```

## Como invocar com seu agente

Manda no chat:

```
"Vamos brainstormar [coisa que você quer]. Roda a skill brainstorming.

Contexto:
- [contexto relevante]

Me guia pelas 4 etapas."
```

Agente vai te conduzir pelas 4 etapas com perguntas específicas pro seu caso.

## Output esperado

Ao final, agente entrega:

- **Problema** (1 parágrafo)
- **Solução proposta** (mínima viável)
- **Métricas de sucesso** (como saberá que funcionou)
- **Riscos principais + mitigação**
- **Próximos passos concretos** (não "explorar mais" — ações específicas)

Salvar em `memory/decisoes/{YYYY-MM}.md` (Princípio: tudo que importa vai pra arquivo).

## Adaptação pro Starter Kit

A versão original da `obra/superpowers` é mais densa (15+ tópicos cobertos). Esta versão simplifica pras 4 etapas críticas. Conforme aluno usa, pode expandir pra cobertura completa do superpower original.

Se quer versão completa, ler: https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md

## Princípios herdados

- **Princípio 7 (em dúvida, perguntar):** brainstorming É a aplicação canônica desse princípio.
- **Princípio 9 (parar se algo der errado):** se etapa 1 não consegue responder com clareza, parar e pensar mais antes de seguir.

## Critérios de sucesso

- [ ] As 4 etapas foram percorridas explicitamente (não pulou nenhuma)
- [ ] Solução proposta é MÍNIMA (não "tudo de uma vez")
- [ ] Output salvo em `memory/decisoes/`
- [ ] Próximos passos são concretos (verbos no infinitivo + prazos)

## Referências

- Skill original: https://github.com/obra/superpowers
- Princípios universais: [`../../starter/onboarding-checklist/references/principios-defensivos.md`](../../starter/onboarding-checklist/references/principios-defensivos.md)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026) — versão curada/simplificada do superpower original.
