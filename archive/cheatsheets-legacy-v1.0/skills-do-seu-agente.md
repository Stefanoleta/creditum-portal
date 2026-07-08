---
name: skills-do-seu-agente
status: ATIVO
category: cheatsheet
referenced_by: [A8]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra skills do agente OpenClaw (A8). Cobre conceito skill vs prompt · 8 capacidades nativas · tour das 6 skills curadas (using-superpowers, criar-skill, skill-checkup-openclaw, canvas-design, last30days, pptx) · anatomia do SKILL.md · criação custom via criar-skill · 3 fontes oficiais (Anthropic skills, awesome-openclaw, ClawHub) · 5 prompts prontos · troubleshooting · princípios A10.
---

# Skills do seu agente — referência rápida (A8)

## Como usar este cheatsheet

**Caminho default — prompt natural pro agente** (linha de produção):

Cola um dos prompts da seção "Prompts prontos pra colar" direto no Telegram. Cada prompt aponta pra doc oficial OpenClaw e descreve passo-a-passo o que o agente deve fazer — você só revisa e aprova.

**Caminho de plano B — comando direto** (use quando):
- Agente não encontra a skill ou trigger não dispara
- Aluno avançado quer rodar `openclaw skills *` direto no terminal Managed
- Validando skill instalada vs registry

## A8 em 1 minuto (resumo executivo)

Skill = **SOP executável nomeado** que o agente carrega quando o gatilho dispara. Diferente de prompt (one-shot, você reescreve toda vez), skill executa os mesmos passos, retorna o mesmo formato, todo dia.

| Conceito | O que é | Exemplo |
|----------|---------|---------|
| **Prompt** | Instrução one-shot | "Resume essas 3 dúvidas pra mim agora" |
| **Skill** | Capacidade que vira hábito do agente | `relatorio-comunidade-semanal` roda toda sexta automaticamente, sempre no mesmo formato |
| **Capacidade nativa** | Tool que já vem de fábrica (PDF, browser, web search, image-gen, TTS, memória, cron, ClawHub) | Agente já lê PDF e gera imagem sem instalar nada |

**Frase-mãe da A8:** *"prompt resolve uma vez. Skill resolve mil vezes igual."*

## Skill vs prompt — quando virar skill

Cria skill quando:
1. Você pediu a mesma tarefa **2+ vezes** (3+ é certeza)
2. O **formato de saída** importa (relatório, post, classificação)
3. Você quer combinar com **cron** depois (A9) — skill + cron = autopilot
4. Tarefa só faz sentido **no seu sistema** (workflow específico do seu negócio)

Não cria skill quando:
- Tarefa pontual que não vai repetir
- Pergunta de pesquisa one-shot
- Job que tool nativa já faz sozinha (testa o nativo primeiro)

## Capacidades nativas — bateria recheada

Antes de instalar ou criar skill, valida se tool nativa já resolve. **Em ~80% dos casos, resolve.**

| Capacidade | O que faz | Quando usar |
|------------|-----------|-------------|
| **PDF** | Lê, extrai texto/tabelas, gera novos | Resumo de contrato · proposta · relatório formatado |
| **Browser** | Abre site, navega, extrai conteúdo | Pesquisa concorrência · monitoramento de página |
| **Web search** | 12 providers nativos (Google, Brave, Perplexity, etc.) | Notícia · validar fato · pesquisa profunda |
| **Image-gen** | Gera imagem (DALL-E e outros) | Capa de post · ilustração de relatório |
| **TTS** | Texto vira áudio (várias vozes) | Briefing em áudio · resumo pro carro |
| **Memória semântica** | Embeddings + busca · agente lembra de você | Recall de decisão antiga · contexto persistente (A7) |
| **Cron** | Agendamento nativo (A9) | Health check · revisão do dia · pesquisas recorrentes |
| **ClawHub** | App store oficial — instala skill com 1 comando | Quando quer skill pronta sem clonar repo |

> **Princípio:** *seu agente lê documentação.* Antes de criar skill, pergunta: *"isso aí você já consegue fazer com tool nativa?"* Doc oficial atualizada: [docs.openclaw.ai/tools](https://docs.openclaw.ai/tools).

## Tour das 6 skills curadas

Mistura comunidade + Bruno + Anthropic. Instala primeiro essas 6, vai usando 30 dias, **desinstala sem culpa as que não encaixaram no seu fluxo**.

| Skill | Origem | Pra que serve |
|-------|--------|---------------|
| **using-superpowers** | Comunidade | Wrapper meta-skill: orquestra brainstorm → PRD → execute em fluxo único. Substitui zigue-zague de prompts curtos. |
| **criar-skill** | Bruno | A skill que cria skill. Coração do Bloco 6 da A8. Você descreve workflow em linguagem natural, ela gera SKILL.md, instala. |
| **skill-checkup-openclaw** | Bruno (v1.3.0) | Diagnóstico executivo do agente · score 0-100 · detecta inconsistências, MEMORY desatualizada, skills duplicadas. Vale rodar mensal. |
| **canvas-design** | Anthropic | Gera poster, capa, ilustração estática em PNG/PDF · filosofia de design embutida (paleta, tipografia, hierarquia). |
| **last30days** | Comunidade | Pesquisa profunda dos últimos 30 dias sobre qualquer tema · relatório markdown com fontes, contradições, recomendação. |
| **pptx** | Anthropic | Gera apresentação `.pptx` completa em 1 prompt · estrutura narrativa + notas de rodapé. Abre em PowerPoint, Keynote, Slides. |

**Repos relevantes:**
- skill-checkup: [github.com/okjpg/skill-checkup-openclaw](https://github.com/okjpg/skill-checkup-openclaw)
- using-superpowers e last30days: catalogados na [awesome-openclaw](https://github.com/VoltAgent/awesome-openclaw-skills)
- canvas-design e pptx: [github.com/anthropics/skills](https://github.com/anthropics/skills)

## Anatomia mínima do SKILL.md

Toda skill OpenClaw é um markdown com 5 seções. Você não decora — entende uma vez e qualquer skill vira legível.

| Seção | Pra que serve | Exemplo |
|-------|---------------|---------|
| **1. Nome (frontmatter)** | Identificador único, kebab-case | `name: relatorio-comunidade-semanal` |
| **2. Descrição/propósito** | 1-2 frases — o que faz e quando usar (aparece no `skill list`) | "Toda sexta agrupa dúvidas do Telegram por categoria e gera relatório HTML." |
| **3. Trigger (inputs)** | Frases que disparam · quanto mais específico, menos falso-positivo | "Quando eu mandar link Tella e pedir posts" · "Toda sexta 13h" |
| **4. Runbook (passos)** | Sequência ordenada do que o agente faz · pode incluir tools nativas | "1. Lê últimos 7d do Telegram. 2. Agrupa por categoria. 3. Salva em `reports/`." |
| **5. Output esperado** | Formato de saída padronizado (markdown? HTML? mensagem?) — **regularidade da saída é o ROI da skill** | "HTML usando template `report-comunidade.html`, salvo em `reports/comunidade-[data].html`." |

## Como criar skill custom (caso João da agência)

João tem agência de design + dev em SP, 5 colaboradores, 12 clientes. Toda sexta perdia **2 horas** compilando o que rolou na semana com cada cliente. Criou `briefing-cliente-semanal` que:

1. Lê últimos 7 dias do canal Slack de cada cliente
2. Cruza com Notion do projeto · marca o que mudou de status
3. Gera 1 markdown por cliente com resumo executivo + pendências

Combinou com cron (A9): toda sexta 13h roda automático, 12 markdowns prontos no Notion. João abre 14h, revisa, ajusta tom, manda. **15 minutos.** 3 meses rodando = ~25 horas economizadas.

**Como ele criou a skill:** falou em linguagem natural pro `criar-skill`. Sem editar arquivo, sem decorar sintaxe. Próximo bloco mostra o prompt exato.

## Templates de report — 3 prontos no kit

Em `templates/reports/` do starter-kit:

| Arquivo | Pra que serve |
|---------|---------------|
| `report-comunidade.html` | Relatório de dúvidas/comunidade semanal |
| `report-executivo.html` | Diagnóstico/auditoria executiva (estilo skill-checkup) |
| `material-didatico.html` | Material de aula/treinamento interno |
| `_shared/tokens.css` | Sistema de design tokens (cores · fontes · spacing) |
| `_shared/logo-placeholder.svg` | Logo neutro pro aluno trocar |
| `_shared/COMO-PERSONALIZAR.md` | 1 página: troca 4 variáveis CSS + substitui SVG |

Personalização em 30s: troca 4 tokens CSS + SVG do logo, pronto. Footer mantém crédito discreto com link rastreável (você pode remover, mas se manter ajuda o curso a crescer).

## 5 prompts prontos pra colar

### 1. Listar skills atuais e detectar as não-usadas

```
Lista todas as skills instaladas no meu workspace.

Pra cada uma me diz:
1. Nome + descrição em 1 linha
2. Última vez que rodou (se tiver registro)
3. Se eu usei nos últimos 30 dias

No final, sugere quais posso desinstalar sem culpa
(skill que não rodou em 30+ dias provavelmente não encaixou).

Não desinstala nada — só me mostra a lista pra eu decidir.
```

### 2. Criar skill custom baseada em rotina repetitiva (case real)

```
Cria pra mim uma skill chamada [nome-em-kebab-case].

O que ela faz:
1. [Gatilho] (ex: "toda sexta de manhã" / "quando eu mandar link Tella")
2. [Passo 1 — entrada] (ex: "lê conversas do Telegram de suporte dos últimos 7 dias")
3. [Passo 2 — processo] (ex: "agrupa dúvidas por categoria e conta frequência")
4. [Passo 3 — output] (ex: "salva em reports/[data].html usando template report-comunidade.html")
5. [Passo 4 — entrega] (ex: "manda no Telegram tópico Operação")

Roda criar-skill e me mostra o SKILL.md gerado pra eu validar
antes de instalar.

Princípio A10: scope mínimo · só pede acesso ao que precisa pra
rodar (ex: Telegram + arquivos do workspace, não credenciais
extras).
```

### 3. Auditar skill antes de instalar (using-superpowers + checkup)

```
Quero instalar a skill [nome] de [github.com/X ou ClawHub/X].

Antes de aprovar, faz auditoria:

1. Lê o SKILL.md do repo · me resume em 3 linhas o que faz
2. Verifica os 4 critérios de skill confiável:
   - Última atualização <90 dias
   - README clara com exemplo
   - Autor responde issues
   - Compatível com OpenClaw atual
3. Lista quais permissões ela vai pedir (princípio A10:
   scope mínimo)
4. Diz se entra em conflito com skill já instalada

Reporta status: APROVAR / ATENÇÃO / REJEITAR.
Só instala depois que eu confirmar.
```

### 4. Atualizar skill existente quando OpenClaw lança versão nova

```
Atualiza a skill [nome] pra última versão.

Faz nessa ordem:
1. Verifica versão atual instalada
2. Compara com versão atual no repo oficial
3. Se tiver atualização, lê CHANGELOG e me explica o que mudou
4. Pergunta se posso aprovar a atualização
5. Após aprovação, atualiza o SKILL.md no workspace
6. Roda 1 execução de teste pra validar que ainda funciona

Se a nova versão pedir permissões adicionais, me alerta antes
de aplicar (princípio A10).
```

### 5. Migrar prompt recorrente em skill (opcional)

```
Você percebeu que eu peço variação desse prompt:
"[cola aqui o prompt que você repete]"

Toda vez que eu peço, você executa basicamente os mesmos passos.

Transforma isso numa skill custom:
1. Sugere nome em kebab-case
2. Identifica triggers naturais (frases que devem disparar)
3. Documenta os passos como runbook executável
4. Define formato de output esperado (igual aos últimos que você
   gerou pra mim)
5. Roda criar-skill com esse plano

Mostra o SKILL.md antes de instalar. Depois testa rodando 1x
e compara output com o último que você me deu — pra eu ver que
ficou consistente.
```

## Comandos `openclaw skills` (validados na doc oficial)

| Comando | Pra que serve |
|---------|---------------|
| `openclaw skills list` | Lista todas as skills instaladas no workspace |
| `openclaw skills install <name>` | Instala skill do ClawHub ou repo |
| `openclaw skills create` | Helper interativo pra criar skill (alternativa ao `criar-skill` via prompt) |
| `openclaw skills test <name>` | Roda skill em modo teste (sem entregar output ao canal real) |

> **Princípio do curso:** 95% dos casos não precisa abrir terminal — você fala natural pro agente. Esses comandos ficam aqui pra debugar caso algo dê errado ou pra aluno avançado.

## Onde achar mais skills (3 fontes oficiais)

| Fonte | O que tem | Pra quando |
|-------|-----------|-----------|
| **Anthropic Skills** ([github.com/anthropics/skills](https://github.com/anthropics/skills)) | Skills oficiais Anthropic (127k stars) — Creative/Design, Dev, Enterprise, Documents (pdf/docx/xlsx/pptx) | Tarefas técnicas · geração de documento · output formatado |
| **awesome-openclaw** ([github.com/VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills)) | Awesome list curado pela comunidade | Skill de nicho · integração específica · caso de uso vertical |
| **ClawHub** ([clawhub.ai](https://clawhub.ai/) · [docs.openclaw.ai/tools/clawhub](https://docs.openclaw.ai/tools/clawhub)) | App store oficial OpenClaw | Instalação 1-clique · skill validada · atualização automática |

**Critério pra adotar skill nova:** última atualização <90 dias · README clara com exemplo · autor responde issues · funciona com OpenClaw versão recente. Falhou em 1 dos 4? Pula — provavelmente repo abandonado.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Skill criada não dispara | Trigger genérico demais ou frase nova | Pede pro agente revisar trigger e listar 5 frases que devem disparar |
| Output da skill vem diferente cada vez | Passo "Output esperado" vago no SKILL.md | Cola exemplo do output ideal e pede pro agente atualizar a skill |
| `criar-skill` não está instalada | Skill ainda não foi adicionada ao workspace | Pede *"instala criar-skill no meu workspace"* |
| Skill duplicada com nome parecido | Você criou 2x sem revisar registry | Pede *"lista as skills com nome parecido a X e me diz qual usar"* |
| Skill da Anthropic não funciona no OpenClaw | Versão antiga ou formato incompatível | Atualiza repo · ou usa equivalente da awesome-openclaw |
| Agente "não conhece" skill instalada | Memória não foi atualizada após instalar | Pede *"atualiza memória sobre as skills instaladas"* |
| Skill custom funciona local mas não em cron | Cron roda em sessão isolada e não vê contexto da sessão atual | Aprofundamento na A9. Skill precisa carregar tudo que precisa explicitamente |
| Esqueci pra que servia uma skill antiga | Descrição vaga no SKILL.md | Pede pro agente reescrever descrição com 1-2 frases e exemplo de uso |
| ClawHub install retorna 404 | Nome digitado errado ou skill removida | `openclaw skills list` no ClawHub · confirma nome · tenta de novo |
| Skill conflita com outra (mesmo trigger) | 2 skills disputam o mesmo gatilho | Pede *"identifica skills com triggers conflitantes"* · ajusta trigger de uma delas |

## Princípios A10 aplicados a skills

Skill = código que vai rodar muitas vezes. Vale aplicar segurança defensiva desde a criação:

- **Scope mínimo por skill.** Skill só pede acesso ao que precisa pra executar. Se a skill é "agrupa dúvidas do Telegram", ela não precisa de acesso ao Gmail.
- **Audit em skills externas.** Antes de instalar do ClawHub ou awesome-openclaw, roda os 4 critérios (atualização <90d · README · issues respondidas · compat OpenClaw). Skill abandonada = vetor de ataque silencioso.
- **Revisão humana antes de instalar custom.** `criar-skill` mostra o SKILL.md gerado **antes** de instalar — vale 30s pra ler e ajustar.
- **Skill que toca segredo precisa rotação clara.** Se a skill usa API key (CRM, integração externa), o token vai no `.env` como known key e tem rotação periódica. Nunca hardcoded no SKILL.md.
- **Skill em cron isolado por padrão.** Quando combinar skill + cron (A9), default é `--session isolated`. Cron polui sessão atual = vazamento de contexto.

## Pendências de validação (release v1.0 do kit)

Antes de release v1.0:

1. Validar que `openclaw skills list / install / test` retornam formato esperado em conta zerada
2. Testar fluxo completo do `criar-skill` com prompt natural (caso "relatório semanal") — ponta a ponta
3. Validar que os 3 templates de report (`templates/reports/`) renderizam corretamente após troca de tokens CSS
4. Confirmar que skill-checkup-openclaw v1.3.0 detecta as inconsistências esperadas em workspace seed
5. Verificar que `using-superpowers` ainda está em versão compatível com OpenClaw atual (critério dos 4)

## Referências

### Internas
- A8 do roteiro principal: `memory/curso-openclaw-v2/aulas/aula-08-skills/`
- A7 (memória): aprofunda contexto persistente que skill usa
- A9 (crons): combina skill + cron = autopilot
- A10 (segurança): princípios aplicados a skills externas e tokens
- Cheatsheet `crons-do-seu-agente.md`: complementar (cron carrega skill)
- Cheatsheet `mission-control.md`: como observar skills rodando

### Externas
- Doc OpenClaw skills: [docs.openclaw.ai/tools](https://docs.openclaw.ai/tools)
- ClawHub: [clawhub.ai](https://clawhub.ai/) · [docs.openclaw.ai/tools/clawhub](https://docs.openclaw.ai/tools/clawhub)
- Anthropic Skills: [github.com/anthropics/skills](https://github.com/anthropics/skills)
- awesome-openclaw: [github.com/VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills)
- skill-checkup-openclaw: [github.com/okjpg/skill-checkup-openclaw](https://github.com/okjpg/skill-checkup-openclaw)

---

> **Comece com uma skill DO SEU SISTEMA.** Não copia a primeira da galera — pensa numa tarefa que SÓ FAZ SENTIDO no seu negócio (workspace audit · revisão de cohort · classificador de tickets). Ninguém vai criar pra você porque ninguém conhece seu sistema. Você cria. Esse é o A-ha real da A8.
