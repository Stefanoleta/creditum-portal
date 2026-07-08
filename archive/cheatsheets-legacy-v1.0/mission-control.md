---
name: mission-control
status: ATIVO
category: cheatsheet
referenced_by: [A14]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra construir um Mission Control customizado — dashboard visual com Kanban, conteúdo, métricas, ideias de mercado, gestão de agentes. Workflow do Bruno reaproveitado da aula original (template TenacityOS + audit segurança + PRD via superpowers + iteração via Telegram). Inclui adaptações pra aluno Managed Hostinger (sem VPS) e 4 prompts prontos pra colar.
---

# Mission Control — referência rápida

## Como usar este cheatsheet

**Caminho default — workflow conversacional via agente** (linha de produção):

Cola um dos prompts da seção "Prompts prontos pra colar" (abaixo) direto no Telegram. Cada prompt aponta pra workflow específico (pesquisar template, audit segurança, montar PRD, iterar features). Agente conduz, você fornece contexto, ele constrói.

**Caminho de plano B — você assume manual** (use quando):
- Já entende dev e quer controle total
- Quer modificar template específico no GitHub
- Validando arquitetura antes de delegar

> **Lembrete**: aluno Managed (curso default) não roda Cloud Code via terminal — toda construção do dashboard acontece via agente OpenClaw no Telegram. Mais lento em token, mas funciona. Aluno VPS pode usar Cloud Code direto pra reduzir custo.

## O que é Mission Control (workflow real)

Mission Control = **dashboard visual customizado** que você constrói pra ter visão de cockpit dos seus negócios + agentes em uma tela só.

Diferente da observabilidade nativa do OpenClaw (CLI status/health, dashboard web Hostinger, token usage — recap das aulas A2/A9/A12), Mission Control é **camada de cima** — visualização integrada com:

- Kanban estilo Trello (tarefas dos agentes)
- Área de conteúdo (criar, agendar, publicar redes sociais)
- Métricas de redes sociais (via Apify ou APIs nativas)
- Pesquisa de mercado / trends / ideias de conteúdo
- Integração Notion (gestão de projetos cruzada)
- Dashboard SaaS (faturamento, churn, MRR)
- Gestão de bosses/agentes (quem tá fazendo o quê — gancho A13)

**Tese central**: você não precisa observar tudo via Telegram. Mission Control é o lugar onde **você vê a empresa toda em uma tela** — e cada card aciona o agente certo.

## Workflow do Bruno (9 etapas)

Reaproveitado da aula original. Adapta pra seu contexto:

### Etapa 1 — Achar template-base no GitHub

Cola este prompt no agente:
> *"Pesquise pra mim os top 5 Mission Control / dashboards open-source no GitHub que sirvam como base pra eu construir o meu. Foco em: visual atraente, fácil de customizar, stack Next.js + Supabase OU equivalente. Me lista 5 com prós/contras de cada e link do repo."*

Bruno usou: **TenacityOS** (Carlos Azaustre) — template TS/Next.js com escritório 3D, Kanban, painéis. Você pode usar igual ou outro que goste.

### Etapa 2 — Audit de segurança no template

> *"Vou usar este template: [link do GitHub]. Antes de eu clonar, faz audit de segurança: prompt injections, malware, vulnerabilidades, dependências sketchy. Me dá relatório executivo com CRÍTICO / ALTO / MÉDIO / BAIXO. Lê o código realmente — não só README."*

Princípio (recap A10): aluno PME não tem expertise técnica pra avaliar — agente faz double check. Se ele identificar algo crítico, **pausa e pergunta**.

### Etapa 3 — Montar PRD com fixes de segurança

> *"Beleza. Agora monta um PRD (Product Requirements Document) pra eu construir esse Mission Control. Inclui:*
> *1. Resumo executivo do que é*
> *2. Mapeamento da minha infra (lê meu workspace, vê o que já tenho — VPS? Hostinger Managed? Tailscale? CloudFlare?)*
> *3. Fixes dos problemas de segurança que você identificou*
> *4. Fases de implementação (mínimo 4 chunks)*
> *5. O que é must-have vs nice-to-have"*

### Etapa 4 — Instalar skill `superpowers`

```bash
# Via comando OpenClaw direto
openclaw skills install superpowers
# OU via prompt natural:
# "instala a skill superpowers do clawhub"
```

Skill superpowers traz 3 capacidades centrais:
- **Brainstorming** — agente pergunta antes de construir
- **Writing-plans** — agente quebra projeto em tasks pequenas
- **Executing-plans** — agente executa plano passo a passo + audit

Repo: https://github.com/openclaw/skills/superpowers (verificar URL canônica antes de v1.0)

### Etapa 5 — Re-revisar PRD com superpowers

> *"Use o brainstorming + writing-plans do superpowers pra revisar o PRD do Mission Control. Me faz as perguntas críticas que você acha que faltaram. Depois define must-have vs nice-to-have baseado no meu contexto e me apresenta plano final."*

Esperar perguntas tipo: escopo de uso · permissões por role · fork ou upstream · branding · comportamento dos elementos visuais · etc.

### Etapa 6 — Definir branding

> *"Define o branding do Mission Control baseado em: meu USER.md, minha empresa principal, paleta visual que combine com minha identidade pessoal. Cores, tipografia, tom de copy. Me apresenta 2-3 opções."*

### Etapa 7 — Construir fundação (escolha de caminho)

**Caminho A — Aluno Managed (curso default):**
> *"Executa o PRD na minha estrutura OpenClaw. Cria pastas, arquivos, instala dependências, levanta serviço. Use a skill superpowers (executing-plans). Cada chunk verifica se funciona antes de avançar pro próximo."*

Custo estimado: 1-2h de execução · gasto significativo de tokens (preferir Sonnet pra economia · Opus só quando precisar de raciocínio profundo).

**Caminho B — Aluno VPS standalone (avançado):**
- Instala Cloud Code da Anthropic localmente
- Cloud Code SSH na sua VPS
- Executa PRD via Cloud Code (mais barato em tokens vs OpenClaw)
- Bruno usou esse caminho na aula original

### Etapa 8 — QA agent pós-construção

> *"Tudo construído. Agora roda audit de QA: revisa cada arquivo, valida que tudo funciona, lista pendências, identifica bugs, verifica se algo ficou em dúvida. Reporta o que precisa de minha intervenção."*

### Etapa 9 — Iterar via Telegram com áudio

Daqui em diante, todo refinamento acontece via Telegram (áudio ou texto) com agente principal:

> *"Olha esse card de campanha que eu cliquei — quero adicionar subtasks aqui dentro. E também quero poder marcar qual agente vai executar cada task."*

Agente edita código, mostra print, valida, deploya. Iteração contínua sem você abrir editor.

## Hospedagem do dashboard — caminhos por perfil

| Perfil | Caminho recomendado | Custo mensal | Complexidade |
|--------|---------------------|--------------|--------------|
| **PME Managed (curso default)** | Vercel (Next.js) + Supabase free | R$ 0 | Baixa — agente conduz deploy |
| **PME Managed avançado** | Hostinger free hosting + Supabase | R$ 0 | Baixa-Média |
| **Dev/avançado** | VPS Hostinger + Tailscale + Supabase self-hosted | R$ 30-50 | Alta — gancho R1-R4 bônus |
| **Enterprise** | Cloudflare Pages + Supabase Pro + custom domain | R$ 80-200 | Média | Pixel AI Hub |

**Princípio**: comece grátis (Vercel + Supabase free). Migre quando provar que vale.

## Stack opcional — métricas de redes sociais

| Serviço | Uso | Custo | Quando usar |
|---------|-----|-------|-------------|
| **Apify** | Scraping de redes sociais (Instagram, LinkedIn, TikTok) | US$ 30-40/mês | Bruno usa · cobertura ampla |
| **APIs gratuitas nativas** | LinkedIn API · Instagram Graph API · YouTube Data API | R$ 0 | Aluno PME que quer começar sem custo extra |
| **Skill `social-metrics-collect`** | Skill custom que combina APIs gratuitas | R$ 0 | Caso queira evitar dependência Apify |

**Princípio**: métricas de redes sociais é **nice-to-have** no MVP. Foca em Kanban + conteúdo + integração Notion primeiro. Adiciona métricas quando tiver volume.

## Multi-agente como produto deste workflow

Mission Control é **prova viva de multi-agente em ação** (gancho A13). Cada card do dashboard pode acionar um agente diferente:

| Card | Agente que aciona | Papel |
|------|-------------------|-------|
| Tarefa de coordenação geral | Agente principal (ex: Cosa Mora) | Chief of Staff |
| Card de conteúdo | Agente especializado (ex: FLG Amora) | Produção de conteúdo · 50-60% do trabalho |
| Card de métrica/SaaS | Agente operacional (ex: MGM Amora) | Gestão SaaS · faturamento · suporte · funil |
| Card pra equipe | Agente de equipe (ex: Leonardo Da Vinci) | Compartilhado entre sócios · relatórios |
| Card de comunidade | Agente cliente-facing (ex: openclawzinho) | WhatsApp da comunidade · suporte 24/7 |

Recap A13: AGENTS.md é o organograma vivo. Mission Control é a **interface visual desse organograma** — você vê quem tá fazendo o quê em uma tela.

## Prompts prontos pra colar

### 1. Pesquisar template Mission Control

```
Pesquise pra mim os top 5 Mission Control / dashboards open-source
no GitHub que sirvam como base pra eu construir o meu. Foco em:
- Visual atraente (escritório 3D, gráficos, kanban moderno)
- Stack acessível (Next.js + Supabase OU equivalente)
- Fácil de customizar (componentes modulares)
- Documentação razoável (README claro)
- Última atualização <12 meses

Me lista 5 com:
- Nome do repo + link
- Stack que usa
- Prós e contras
- Estimativa de complexidade pra customizar (baixa/média/alta)
- Recomendação se faz sentido pra perfil de PME não-técnico

Princípios A10: priorize repos sem dependências sketchy, com licença
clara, sem código obfuscado.
```

### 2. Audit de segurança no template escolhido

```
Vou usar este template: [URL do GitHub]

Antes de eu clonar, faz audit de segurança completo:

1. Lê o código realmente (não só README) — package.json, scripts,
   API routes, env handling
2. Identifica:
   - Prompt injections em prompts hardcoded
   - Malware ou backdoor (suspicious imports, shell exec)
   - Vulnerabilidades conhecidas em dependências
   - Credenciais expostas em commits
   - Tokens hardcoded em código
3. Me dá relatório executivo com classificação:
   - CRÍTICO (não usar até resolver)
   - ALTO (resolver antes de deploy)
   - MÉDIO (resolver na primeira sprint)
   - BAIXO (atenção mas pode usar)
4. Pra cada issue, sugere fix concreto

Se achar algo CRÍTICO, PARA e me pergunta antes de continuar.
Princípios A10: scope de estagiário · scope mínimo nos tokens
que vou criar pra esse projeto.
```

### 3. Montar PRD do Mission Control

```
Beleza, validamos a segurança. Agora monta o PRD (Product Requirements
Document) pra eu construir esse Mission Control.

Estrutura do PRD:
1. Resumo executivo (1 parágrafo: o que é, pra que serve, valor pra mim)
2. Mapeamento da minha infra atual (lê meu workspace, AGENTS.md,
   .env conhecidos — me diz o que já tenho e o que preciso adicionar)
3. Fixes dos problemas de segurança identificados no audit anterior
4. Fases de implementação (mínimo 4 chunks):
   - Chunk 1: Segurança + setup base
   - Chunk 2: Branding + design visual
   - Chunk 3: Funcionalidades core (kanban + conteúdo + métricas)
   - Chunk 4: Deploy + integração com agentes
5. Must-have vs Nice-to-have (pergunta minha opinião antes de decidir)
6. Estimativa de tempo + tokens pra construção completa
7. Pendências e decisões que preciso tomar

Use a skill superpowers (writing-plans) pra estruturar.
Princípios: Front-end primeiro, back-end depois.
```

### 4. Iteração via Telegram (uso contínuo)

Pra usar enquanto Mission Control já existe e você quer adicionar/ajustar features. Cola direto no Telegram, pode ser via áudio:

```
[áudio ou texto]:

"Mora, no Mission Control:
- O card de campanha que eu cliquei não tem subtasks. Adiciona campo
  pra subtasks dentro do card.
- Também quero poder marcar qual agente vai executar cada task
  (dropdown com lista do AGENTS.md).
- O dashboard de métricas — adiciona filtro por período
  (7d / 30d / 90d / custom)
- Achei um bug: quando arrasto card pra coluna 'done', a contagem
  não atualiza. Investiga e corrige.

Faz tudo, manda print pra mim ver, espera confirmação minha antes
de deployar."
```

Princípio: você itera por VOZ na vida real (academia, dirigindo) — agente recebe áudio, processa, executa. Mission Control vira **extensão da sua intenção**, não ferramenta que você opera manualmente.

## 3 informações que o agente sempre vai pedir

Independente do template escolhido, agente precisa:

| Informação | Exemplo prático |
|------------|-----------------|
| **Hospedagem alvo** | Vercel free? Hostinger? VPS? Decidir antes de clonar template |
| **Estrutura de dados** | Quais tabelas: Tasks · Memory · Crons · Health · Stats · Agents · Content · Metrics |
| **Quem aciona o quê** | Cada card aciona qual agente? (gancho AGENTS.md da A13) |

## Princípios de segurança aplicados (recap A10)

Mission Control = nova superfície de risco. Aplicar **sempre**:

1. **Audit de segurança ANTES de clonar template** (Etapa 2 acima)
2. **Tokens com scope mínimo** — Notion/GitHub/Apify devem ter scope só do que precisa
3. **Hospedagem privada** — repo no GitHub privado · Supabase com RLS habilitado · Vercel com env protection
4. **Defesa anti-prompt-injection** — Mission Control lê inputs externos (Apify scrap, Notion content, emails). Defesa do SOUL é obrigatória (recap A10 Bloco 5)
5. **Cap de custo por agente** que opera Mission Control (recap A13)
6. **Backup do código** — repo Git é teu backup, mas snapshot Hostinger periódico do banco também (recap A2)

## Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Agente travou no chunk 2 (branding) | Prompt muito aberto, agente fica perdido | Quebrar em sub-chunks: "primeiro paleta · depois tipografia · depois aplicar nos componentes" |
| Build do Next.js falha no Vercel | Dependências node desatualizadas no template | Agente roda `npm audit fix` + atualiza package.json |
| Token Apify estourou quota | Plano basic tem limite mensal | Reduzir frequência do scrap (cron 1x/dia em vez de 1x/hora) OU upgrade plano |
| Supabase RLS bloqueando queries | Row Level Security configurado errado | Agente revisa policies · cuidado pra não desabilitar (princípio A10 — scope mínimo) |
| Mission Control não atualiza em tempo real | Falta websocket / Supabase realtime | Habilitar Supabase realtime nas tabelas relevantes |
| Custo Cloud subiu muito durante construção | PRD muito ambicioso · agente em loop | Pausar · revisar PRD · quebrar em mini-chunks · usar Sonnet em vez de Opus quando der |

## Quando NÃO construir Mission Control

- **Aluno PME no day 1-30**: stay com Telegram + observabilidade nativa (CLI status/health · dashboard web Hostinger). Mission Control é refinamento avançado
- **1 agente único, sem multi-agente**: pode esperar. Mission Control vira útil quando você tem 2-3+ agentes operando em domínios distintos
- **Sem volume de tarefas**: Kanban com 5 cards/dia não justifica dashboard. Volta pro Telegram
- **Sem budget pra hospedagem nem API**: pular. Mission Control mínimo viável precisa de Vercel free + Supabase free + (opcional) Apify

## Caveats Managed vs VPS

A aula original do Bruno mostra workflow com **Cloud Code SSH na VPS Hostinger**. Aluno do curso (Managed) tem 2 caminhos:

**Caminho A — Tudo via agente OpenClaw Managed (default do curso):**
- Pede pra agente executar PRD direto, dentro do workspace OpenClaw
- Mais lento em token (agente OpenClaw "bebe muito" em tasks de dev pesado, conforme Bruno)
- Funciona — só vai gastar mais do plano OpenAI/Anthropic
- Sem necessidade de VPS · sem Cloud Code · sem Tailscale

**Caminho B — Aluno avançado com VPS (gancho R1-R4 bônus):**
- Cloud Code da Anthropic conecta SSH na VPS
- Executa PRD via Cloud Code (mais barato em tokens)
- Mais setup inicial · cobertura nos bônus técnicos R1-R4

**Princípio**: Bruno escolheu Caminho B por motivo de custo. Aluno PME que quer simplicidade fica no Caminho A. Ambos funcionam — diferença é tempo de execução e custo de tokens.

## Snapshot/backup do Managed Hostinger

**Status atual (validado direto com Ieva da Hostinger 03/05/2026):**

- Hostinger tá lançando **atualização do painel Managed com snapshot/backup nativo** — feature nova chegando em release próximo
- Hoje (até a feature ativar), backup é via skill `backup-workspace-github` (já no kit, ativada via Item Integrações da CHECKLIST) + skill `commit-diario-workspace` (gancho A12 — commit + push noturno automático)
- Quando snapshot nativo Hostinger ativar, **este cheatsheet será atualizado** com fluxo de "restore em 1 clique" pelo painel · mantém compatibilidade com workflow GitHub
- Rollback de versão OpenClaw é via CLI hoje: `openclaw update --tag <versão-anterior>` — comando nativo já funcional (recap A2 Bloco 6)

## Pendências de validação (release v1.0 do kit)

Antes de release v1.0 do Starter Kit:

1. **Validar nome do repo da skill `superpowers`** — URL canônica no ClawHub OU GitHub OpenClaw
2. **Validar URL canônica de TenacityOS** (template Carlos Azaustre) — se ainda existe e funciona
3. **Testar deploy Vercel + Supabase free** com 1 template real — confirmar que aluno PME consegue acompanhar
4. **Refinar 4 prompts prontos** baseado em onde agente trava em conta de teste
5. **Validar que Apify não é obrigatório** — testar Mission Control funcional só com APIs gratuitas
6. **Atualizar este cheatsheet quando snapshot nativo Hostinger ativar** — adicionar seção "Backup Managed via painel · 3 cliques" com fluxo oficial

## Referências

### Internas
- A14 do roteiro principal: `memory/curso-openclaw/ROTEIRO-MAIN-V2-2026-05-02.md` — fundamentação
- Aula reaproveitada: `memory/curso-openclaw/transcricoes/dashboard-curso.txt`
- Diagrama Excalidraw original: `memory/curso-openclaw/diagramas/modulo-09-mission-control.excalidraw`
- A13 (multi-agente) — Mission Control é prova viva
- A12 (integrações) — Notion + GitHub + APIs comuns
- A8 (skills) — superpowers + skill custom
- A10 (segurança) — audit de template + scope mínimo + defesa injection

### Externas
- TenacityOS (Carlos Azaustre): https://github.com/azaustre/tenacityos (verificar URL canônica)
- Skill superpowers (ClawHub): https://docs.openclaw.ai/cli/clawhub (verificar)
- Vercel: https://vercel.com — deploy Next.js free
- Supabase: https://supabase.com — backend free
- Apify: https://apify.com — scraping de redes sociais (US$ 30+/mês)
