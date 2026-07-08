# Índice do Mini-Curso OpenClaw v2

> Mapeia cada aula da Hotmart (31 aulas em 6 módulos) pro arquivo de material correspondente.
> O agente consulta este índice quando aluno menciona qualquer aula.

## Como o agente usa este índice

1. Aluno menciona aula (ex: "aula 12.2 feita", "como funciona memória", "preciso configurar Notion")
2. Agente identifica aula da Hotmart na tabela abaixo
3. Agente abre o arquivo de material correspondente
4. Agente busca a seção específica (subaulas estão dentro do HTML "pai")
5. Agente conduz o aluno passo a passo com base no material

## Tabela canônica — Hotmart ↔ Material

| Aula Hotmart | Título | Material no kit | Seção dentro do material |
|---|---|---|---|
| **Módulo 1 — Boas-vindas e Introdução** | | | |
| Aula 0 | O que você precisa saber pra começar | `aulas/aula-00-visao-stack.html` | Tudo |
| Aula 0.1 | Cases da Comunidade | `aulas/aula-01-cases-3-agentes.html` | Tudo |
| Aula 0.2 | Mapa do Curso + Materiais | `aulas/aula-00-visao-stack.html` | Seção "Mapa das aulas" |
| **Módulo 2 — Ativando seu Openclaw** | | | |
| Aula 1 | Ativando Manage Openclaw | `aulas/aula-01-setup-managed.html` | Bloco 1-2 (Setup Hostinger) |
| Aula 1.1 | Conectando Assinatura do ChatGPT | `aulas/aula-01-setup-managed.html` | Bloco 3 (OAuth ChatGPT) |
| Aula 1.2 | Documentação do seu Agente | `aulas/aula-01-setup-managed.html` | Bloco 4-5 (agente lê doc) |
| Aula 2 | Liberando acesso e Resolvendo problemas no Openclaw | `aulas/aula-02-cockpit.html` | Bloco 1-5 (cockpit) |
| Aula 2.1 | Liberando acesso total ao seu agente | `aulas/aula-02-cockpit.html` | Bloco 6-9 (exec-policy yolo) |
| **Módulo 3 — Configuração do Openclaw** | | | |
| Aula 3 | Instalando Starter Kit | `aulas/aula-03-starter-kit.html` | Tudo |
| Aula 4 | Criando Grupos + Tópicos no Telegram | `aulas/aula-04-telegram.html` | Tudo |
| Aula 5 | Identidade, Soul, Agents, User | `aulas/aula-05-identidade.html` | Tudo |
| Aula 6 | Organizando Workspace do seu Agente | `aulas/aula-06-workspace.html` | Tudo |
| Aula 7 | Boas Práticas para melhorar a Memória | `aulas/aula-07-memoria.html` | Tudo |
| **Módulo 4 — Skills, Crons, Heartbeats e Segurança** | | | |
| Aula 8 | Tudo que você precisa saber sobre Skills | `aulas/aula-08-skills.html` | Tudo |
| Aula 9 | Autonomia dos agentes e Heartbeats | `aulas/aula-09-crons.html` | Tudo (crons + heartbeats) |
| Aula 10 | Instalando 1 password | `aulas/aula-10-seguranca.html` | Bloco 1Password |
| Aula 10.1 | Conectando seu agente em APIs | `aulas/aula-10-seguranca.html` | Seção API keys + scope mínimo |
| Aula 10.2 | Canais Públicos | `aulas/aula-10-seguranca.html` | Seção canais públicos |
| Aula 10.3 | Prompt Injection | `aulas/aula-10-seguranca.html` | Seção prompt injection |
| Aula 10.4 | Recovery e Snapshot da VPS | `aulas/aula-10-seguranca.html` | Seção recovery/snapshot |
| **Módulo 5 — Integrações** | | | |
| Aula 11 | Como conectar openclaw em outros canais | `aulas/aula-11-outros-canais.html` | Tudo |
| Aula 12 | Integrações e como Conectar Notion | `aulas/aula-12-integracoes.html` | Bloco 3 (Notion via API token) |
| Aula 12.1 | Conectando Github e Fazendo Backup | `aulas/aula-12-integracoes.html` | Bloco 4 (GitHub PAT + commit-diario) |
| Aula 12.2 | Integrando Google Workspace | `aulas/aula-12-integracoes.html` | Bloco 5 (Google via gog CLI) |
| Aula 12.3 | Instalando Brave Browser | `aulas/aula-12-integracoes.html` | Bloco 6 (Browser control) |
| **Módulo 6 — Multiagentes e Mission Control** | | | |
| Aula 13 | Multiagentes | `aulas/aula-13-multi-agente.html` | Bloco 1-2 (tese + framework) |
| Aula 13.1 | Subagents e Agentes Paralelos | `aulas/aula-13-multi-agente.html` | Bloco 3 (subagents) |
| Aula 13.2 | Onde os agentes vivem e Como os agentes conversam entre si | `aulas/aula-13-multi-agente.html` | Bloco 4-5 (arquitetura + comunicação) |
| Aula 13.3 | Como configurar o Agents.md | `aulas/aula-13-multi-agente.html` | Bloco 6 (AGENTS.md prático) |
| Aula 13.4 | Criando a Esmeralda | `aulas/aula-13-multi-agente.html` | Bloco 7 (case real) |
| Aula 14 | Criando um Controle de Missão | `aulas/aula-14-mission-control.html` | Tudo |
| Aula 15 | Conclusão | `aulas/aula-15-fechamento.html` | Tudo |

## Aliases — termos comuns que aluno pode usar

Quando aluno fala um termo, agente identifica a aula correspondente:

| Termo do aluno | Aula(s) | Material |
|---|---|---|
| identidade · SOUL · IDENTITY · AGENTS · USER · personalidade do agente | Aula 5 | aula-05-identidade.html |
| workspace · MAPA · pasta · estrutura · organização | Aula 6 | aula-06-workspace.html |
| memória · contexto · `/new` · `/compact` · esqueceu · lembrar | Aula 7 | aula-07-memoria.html |
| skill · skills · habilidade · capacidade · criar skill | Aula 8 | aula-08-skills.html |
| cron · heartbeat · automação · agendar · roda sozinho | Aula 9 | aula-09-crons.html |
| segurança · 1password · API key · scope · token · prompt injection · recovery · snapshot | Aula 10 e sub | aula-10-seguranca.html |
| outros canais · slack · discord · whatsapp (cuidado) · imessage | Aula 11 | aula-11-outros-canais.html |
| Notion · GitHub · Calendar · Gmail · Drive · Google Workspace · gog · integração · API · OAuth | Aula 12 e sub | aula-12-integracoes.html |
| tavily · brave search · search api · busca web · pesquisa internet · search engine pra agente | Aula 10.1 (APIs) + Aula 12 | aula-10-seguranca.html · aula-12-integracoes.html |
| browser · navegador · CRM legado · sistema sem API | Aula 12.3 | aula-12-integracoes.html (Bloco 6) |
| webhook · evento externo · reage | Aula 12 | aula-12-integracoes.html (Bloco 7) |
| multi-agente · subagent · Esmeralda · agente paralelo · vários agentes | Aula 13 e sub | aula-13-multi-agente.html |
| mission control · cockpit · dashboard | Aula 14 | aula-14-mission-control.html |
| terminei · acabou · próximos passos · pixel ai hub | Aula 15 | aula-15-fechamento.html |
| visão · stack · custo · investimento · ChatGPT · OpenAI · Hostinger | Aula 0/1 | aula-00-visao-stack.html ou aula-01-setup-managed.html |
| starter kit · zip · onboarding · checklist | Aula 3 | aula-03-starter-kit.html |
| telegram · grupo · tópico · bot | Aula 4 | aula-04-telegram.html |

## Arquivos de apoio

- **`transcricao-completa.md`** — transcrição literal das 16 aulas (4h28min, 48.886 palavras). Use quando aluno fizer pergunta vaga ou que cruze múltiplas aulas. Faça grep textual antes de carregar HTML específico.
- **`aulas/_shared/`** — CSS compartilhado pelos HTMLs (renderização visual).

## Regra de ouro pro agente

**NÃO IMPROVISE sobre conteúdo do curso.** O aluno comprou o curso, o material existe aqui. Sempre consulte primeiro:

1. Se aluno mencionou número de aula → consulte tabela canônica acima
2. Se aluno fez pergunta sobre tema → consulte tabela de aliases
3. Se ainda em dúvida → faça `grep` em `transcricao-completa.md`
4. Carregue só os trechos relevantes (não o HTML inteiro a cada turno)
5. Conduza o aluno passo a passo com base no material — não tente recriar do treino geral

## Notas de divergência material × kit (kit v2.5.5+)

Quando o vídeo da aula menciona ferramenta que mudou no kit, **explique a divergência ao aluno antes de prosseguir**:

| Tema | O que o vídeo diz | O que o kit faz hoje |
|---|---|---|
| **Search API** (Aulas 10.1 + 12) | Brave Search API como default | **Tavily Search** como default desde v2.5.5 (Brave virou cartão obrigatório · Tavily é grátis 1k/mês sem cartão · feito pra agente IA). Brave continua como **alternativa documentada** no `wizard-conectar`. |

Quando aluno chegar na configuração, agente diz: *"a aula mostra Brave, mas em maio/2026 o Brave passou a exigir cartão de crédito até pro free tier. O kit migrou pra Tavily como default — mesmo free tier (1k/mês), sem cartão, e foi feito specifically pra agentes IA. Brave continua suportado se você preferir. Qual quer?"*

---

*Versão 1.0 — 07/05/2026 · Mini-curso OpenClaw v2 (Hotmart) · 31 aulas em 6 módulos.*
