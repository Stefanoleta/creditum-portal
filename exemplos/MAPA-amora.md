# MAPA.md — Workspace da Amora

> **Este é o `MAPA.md` real do workspace da Amora.**
> Use como referência de profundidade — adapte ao SEU contexto.

---

> Mapa central. Leia este arquivo para saber onde encontrar qualquer coisa.

## Arquivos Raiz

| Arquivo | Funcao | Quando ler |
|---------|--------|------------|
| `SOUL.md` | Identidade, personalidade, regras | Boot (passo 1) |
| `USER.md` | Perfil do Bruno | Boot (passo 2) |
| `IDENTITY.md` | Nome, modelo, territories | Boot |
| `MEMORY.md` | Memoria de longo prazo (indice) | Boot em main session |
| `TOOLS.md` | Integracoes, credenciais, skills | Quando precisar de ferramentas |
| `AGENTS.md` | Boot sequence, regras de sessao | Boot |
| `HEARTBEAT.md` | Configuração do mecanismo de proatividade | Quando muda comportamento |
| `MAPA.md` | Este arquivo, navegacao geral | Boot (passo 3) |
| `PROPAGATION.md` | Protocolo de propagacao de dados | Quando qualquer dado mudar |
| `README.md` | Visao geral do workspace | Quando precisar de overview |

## Pastas Principais

```text
workspace-amora-cos/
├── agents/             → Raio-X dos agentes do ecossistema (Amora, Léo, Openclawzinho, Dexter)
├── archive/            → Arquivos antigos e temporarios, organizados em `archive/2026-Q1/` etc.
├── areas/              → Contexto editorial e areas de trabalho do segundo cerebro
├── content/            → Producao ativa de conteudo (drafts, archive por plataforma)
├── docs/               → Documentacao tecnica, blueprints e guias de integracao
├── memory/             → Cerebro: contexto, projetos, sessoes, integracoes, hot.md
├── projects/           → Projetos ativos (subpasta por projeto com PRD.md)
├── reports/            → Reports e analises gerados
├── scripts/            → Scripts operacionais (youtube, content, metrics, utils)
├── skills/             → Skills categorizadas (ver `skills/_registry.md`)
├── workshops/          → Material de execucao de workshops
└── wiki/               → Base de conhecimento
```

## Navegacao Rapida

| Estou buscando... | Onde ir |
|---|---|
| Onde salvar um rascunho | `content/{plataforma}/drafts/` |
| Tom de voz do Bruno | `areas/conteudo/contexto/voz/` (fonte de verdade) |
| Estrategia e microprogramas | `areas/conteudo/contexto/estrategia/` |
| Ideias de conteudo | `areas/conteudo/contexto/referencias/ideas.md` |
| Status de projetos | `projects/MAPA.md` ou `memory/projects/_index.md` |
| Decisoes estrategicas | `memory/context/decisoes/` |
| Pendencias ativas | `memory/context/pendencias.md` |
| Prazos/Deadlines | `memory/context/deadlines.md` |
| Equipe/Pessoas (sumario) | `memory/context/people.md` |
| Detalhes de uma pessoa | `memory/context/people/{pessoa}.md` |
| Detalhes de um negocio | `memory/context/business/{negocio}.md` |
| Skills disponiveis | `skills/_registry.md` |
| Skill por categoria | `skills/{categoria}/_registry.md` |
| Reports gerados | `reports/MAPA.md` |
| O que aconteceu hoje | `memory/YYYY-MM-DD.md` |
| Mentorias | `memory/mentorias/` |
| Cases reais de OpenClaw/agentes | `memory/cases/openclaw/` |
| Palestras | `memory/palestras/` |

## Sub-MAPAs

Cada pasta principal tem seu proprio MAPA.md com detalhes internos:

- `memory/MAPA.md`
- `memory/cases/MAPA.md`
- `skills/MAPA.md`
- `projects/MAPA.md`
- `content/MAPA.md`
- `reports/MAPA.md`

---

## Como adaptar pro seu contexto

A Amora tem workspace complexo (12+ pastas principais, dezenas de sub-pastas). Construído ao longo de meses.

**Pro seu agente novo (Atlas da padaria):**

Estrutura mínima é mais simples:

```markdown
# MAPA.md — Workspace do Atlas

## Arquivos Raiz

| Arquivo | Função |
|---|---|
| `SOUL.md` | Personalidade do Atlas |
| `USER.md` | Sobre o Carlos (dono da padaria) |
| `AGENTS.md` | Regras entre Carlos e Atlas |
| `MAPA.md` | Este arquivo |
| `MEMORY.md` | Memória de longo prazo |
| `HEARTBEAT.md` | Configuração do mecanismo de proatividade |

## Pastas Principais

workspace/
├── content/            → Posts, briefings, planos que Atlas cria
├── memory/             → Decisões, pendências, pessoas
├── archive/            → Material arquivado
└── skills/             → Skills instaladas

## Navegação Rápida

| Buscando... | Onde ir |
|---|---|
| Posts criados | content/drafts/ |
| Decisões | memory/decisoes/ |
| Pendências | memory/pendencias/ |
| Skills | skills/_registry.md |
```

20 linhas. Cresce conforme aluno expande workspace (adiciona pasta `clientes/`, `receitas/`, etc).

**Padrão de evolução do MAPA:**

1. **Inicial (passo 4 do starter-kit):** ~20 linhas. Estrutura básica.
2. **Após primeiros meses:** ~50 linhas. Adiciona "Navegação Rápida" expandida.
3. **Maduro (~6 meses):** 100+ linhas como o da Amora. Estabiliza.

A regra: **MAPA cresce conforme workspace cresce.** Não tente prever o futuro — mapeia o que existe.

Detalhes do sistema de mapas distribuídos: ver [`references/sistema-de-mapas.md`](../skills/starter/onboarding-checklist/references/sistema-de-mapas.md).

---

*Versão de referência — workspace original da Amora.*
