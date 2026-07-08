---
name: wizard-workspace
status: ATIVO
category: starter
owner: aluno
version: 1.1
mode: guided
estimated_time: 4min
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "organiza workspace" / "cria mapa", OR when dispatched by onboarding-checklist as passo 4. Creates minimal workspace structure (content/, memory/, skills/, archive/) + MAPA.md raiz + 4 local MAPAs (Princípio 12 — mapas distribuídos). Detects existing structure first (Princípio 11). Depends on passo 3 (autonomia) — without yolo, every mkdir asks for approval. v1.1 (kit v2.2): header com Princípios 13/14/15 explícitos no topo (auditoria pós-v2.1).
---

# Wizard Workspace — Passo 4 (Estrutura mínima + mapas distribuídos)

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
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — Telegram faz word-wrap natural.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

## Promessa

Em 4min, o workspace do aluno passa de "pasta vazia" pra "estrutura mínima com lugar pra cada coisa". 4 pastas (`content/`, `memory/`, `skills/`, `archive/`) + 1 MAPA raiz + 4 mapas locais (Princípio 12).

A partir desse passo, agente sabe ONDE salvar quando aluno pedir algo. "Cria um post" → vai pra `content/drafts/`. "Salva essa decisão" → vai pra `memory/decisoes/`. Sem MAPA, agente improvisa e vira bagunça em 1 semana.

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 4

**Trigger explícito (standalone):**
- "organiza workspace"
- "cria mapa"
- "estrutura inicial"
- "monta workspace"

**NÃO disparar se:**
- `workspace_organizado=true` em `MEMORY.md` E `MAPA.md` raiz existe E as 4 pastas existem

## Dependência: passo 3 (autonomia)

Esse passo cria múltiplas pastas e arquivos. Sem `exec-policy=yolo` (passo 3), agente pede aprovação a CADA `mkdir` e CADA arquivo. Vai virar irritação extrema.

Se `autonomia_liberada != true` em `MEMORY.md`, avisar:

```
"Antes de seguir, aviso: o passo 4 depende do passo 3 (autonomia).
Sem yolo ativo, eu vou pedir aprovação a cada pasta e arquivo que
criar. São ~10 confirmações nesse passo. Vai irritar.

Quer:
a) Voltar e fazer o passo 3 (~6min)
b) Seguir mesmo assim e aceitar a fricção"
```

## Princípio 11 — Detecção antes de pedir

Antes de criar qualquer coisa, checar 7 itens:

```
1. MAPA.md raiz existe e tem conteúdo?
2. content/ existe?
3. memory/ existe?
4. skills/ existe?
5. archive/ existe?
6. Cada pasta tem MAPA.md local?
7. Subpastas mínimas existem (content/drafts, memory/decisoes, skills/_registry.md)?
```

### 4 estados detectáveis

| Estado | Ação |
|---|---|
| **Tudo pronto (MAPA + 4 pastas + 4 mapas locais)** | Marca workspace_organizado=true. "Detectei estrutura completa. Vou direto pra pergunta-âncora." |
| **Parcial (algumas pastas existem, outras não)** | Lista o que tá pronto + o que falta. Cria só o que falta. NÃO mexe no que existe. |
| **MAPA existe mas estrutura não** | Improvável. Pergunta se aluno quer expandir o MAPA atual com base no que vai criar. |
| **Nada feito** | Fluxo normal (cria tudo). |

## Fluxo principal

### 1. Narrar promessa

```
"Vamos organizar onde tudo vive. 4min.

Vou criar:

📁 Pastas (4 principais):
   content/  → onde vou salvar coisas que crio (posts, drafts)
   memory/   → onde vou guardar coisas pra lembrar (decisões, pendências)
   skills/   → habilidades modulares que você adiciona ao longo do tempo
   archive/  → versionamento manual quando algo fica obsoleto

📄 MAPA.md raiz → lista as pastas e me ensina onde encontrar cada coisa

📄 4 MAPAs locais (1 dentro de cada pasta) → detalham conteúdo
   Princípio do segundo cérebro: cada pasta documenta a si mesma.
   Sem TOOLS.md monolítico (cresce sem controle).

A partir de agora, quando você pedir 'cria um post sobre X', eu sei
EXATO onde salvar (content/drafts/post-X.md). Sem improvisar.

Bora?"
```

Esperar OK do aluno.

### 2. Aplicar Princípio 1 — backup global se workspace tem conteúdo

Diferente dos wizards anteriores (1 arquivo cada), este modifica MÚLTIPLAS pastas. Aplicar **Princípio 10** (backup global):

```bash
# Se workspace já tem conteúdo
if [ "$(ls -A $WORKSPACE)" ]; then
    BACKUP_FILE="$HOME/backups/pre-wizard-workspace-$(date +%Y-%m-%d-%H%M).tar.gz"
    tar -czf "$BACKUP_FILE" -C "$(dirname $WORKSPACE)" "$(basename $WORKSPACE)"
fi
```

Se workspace estava vazio (caso comum no kit), pula backup (não tem o que preservar).

Narrar:

```
"Detectei {N} arquivos no workspace. Backup global em:
  ~/backups/pre-wizard-workspace-{timestamp}.tar.gz

Se algo der errado, você restaura o workspace inteiro com:
  tar -xzf ~/backups/{arquivo} -C ~/

Vou criar a estrutura agora."
```

### 3. Criar pastas

```bash
mkdir -p "$WORKSPACE/content/drafts"
mkdir -p "$WORKSPACE/content/archive"
mkdir -p "$WORKSPACE/memory/decisoes"
mkdir -p "$WORKSPACE/memory/projects"
mkdir -p "$WORKSPACE/skills/operacional"
mkdir -p "$WORKSPACE/archive"
```

Narrar:

```
"✓ Criadas:
- content/ (drafts, archive)
- memory/ (decisoes, projects)
- skills/ (operacional - única categoria pra começar)
- archive/"
```

### 4. Criar MAPA.md raiz

A partir de `starter-kit/templates/MAPA.template.md`. Substituir placeholders:

| Placeholder | Substitui por |
|---|---|
| `{NOME_AGENTE}` | ler de IDENTITY.md (campo Nome) |
| `{NOME_USER}` | ler de USER.md (campo Como chamar) |
| `{DATA}` | data atual |

Salvar em `$WORKSPACE/MAPA.md`.

### 5. Criar 4 mapas locais (Princípio 12)

#### `content/MAPA.md`

```markdown
# MAPA — content/

> O que vive nesta pasta: tudo que o agente CRIA pra você (posts,
> drafts, imagens, scripts).

## Estrutura

```
content/
├── MAPA.md          ← este arquivo
├── drafts/          ← rascunhos em produção (posts, vídeos, emails)
└── archive/         ← drafts versionados quando viram outra coisa
```

## Convenção de nomes

- `drafts/post-{tema-curto}-{YYYY-MM-DD}.md`
- `drafts/email-{destinatario}-{YYYY-MM-DD}.md`
- `drafts/video-{titulo-curto}-{YYYY-MM-DD}.md`

Quando algo é publicado, mover de `drafts/` pra `archive/`. Não deletar.

## Atualizar este mapa quando

- Adicionar nova subpasta (ex: `imagens/`, `prompts/`)
- Mudar convenção de nomes

Sem TOOLS.md monolítico. Cada pasta documenta a si mesma (Princípio 12).
```

#### `memory/MAPA.md`

```markdown
# MAPA — memory/

> O que vive nesta pasta: tudo que o agente PRECISA LEMBRAR
> entre sessões (decisões, projetos, contexto).

## Estrutura

```
memory/
├── MAPA.md          ← este arquivo
├── decisoes/        ← decisões importantes (1 arquivo por mês: 2026-05.md)
└── projects/        ← projetos ativos (1 arquivo por projeto)
```

## Convenção de nomes

- `decisoes/{YYYY-MM}.md` — append-only (decisões cronológicas)
- `projects/{nome-curto}.md` — 1 por projeto, status atualizado

## Atualizar este mapa quando

- Adicionar `pendencias.md` na raiz (lista única de o que tá pendente)
- Adicionar `people/` (1 arquivo por pessoa relevante)
- Adicionar `business/` (1 arquivo por negócio se aluno tem múltiplos)

Sem TOOLS.md monolítico. Cada pasta documenta a si mesma (Princípio 12).
```

#### `skills/MAPA.md`

```markdown
# MAPA — skills/

> O que vive nesta pasta: skills (habilidades modulares) que o agente
> usa pra tarefas recorrentes. Cada skill é um SOP executável.

## Estrutura inicial

```
skills/
├── MAPA.md           ← este arquivo
├── _registry.md      ← índice global (auto-atualizado quando skill nova é instalada)
└── operacional/      ← única categoria inicial (backup, sync, etc)
    └── _registry.md
```

## Adicionar skill nova

Ver template oficial em `skills/operacional/backup-workspace-github/SKILL.md`
(referência) ou docs do OpenClaw em `openclaw skill --help`.

Estrutura mínima de skill:
```
{nome-skill}/
├── SKILL.md           ← obrigatório (frontmatter + corpo)
├── references/        ← opcional (templates, docs auxiliares)
└── evals/             ← opcional (cenários de teste)
```

## Atualizar este mapa quando

- Adicionar nova categoria (ex: `content/`, `analytics/`, `research/`)
- Mudar padrão de organização

Sem TOOLS.md monolítico. Cada pasta documenta a si mesma (Princípio 12).
```

#### `archive/MAPA.md`

```markdown
# MAPA — archive/

> O que vive nesta pasta: arquivos versionados manualmente quando
> algo é substituído. NÃO é lixo (uso `trash` pro lixo). É história.

## Estrutura

```
archive/
└── MAPA.md          ← este arquivo
```

(vazia até primeiro uso)

## Quando usar archive/

- Wizard sobrescreveu arquivo → versão antiga vai pra `archive/{nome}-{YYYY-MM-DD}.md`
- Skill foi removida → SKILL.md vai pra `archive/skills-removidas/`
- Drafts publicados → mover de `content/drafts/` pra `archive/`

## Quando NÃO usar

- Lixo / arquivos quebrados → use `trash` (move pra Lixeira do sistema)
- Backups automáticos → vão pra `~/backups/` (fora do workspace)
- Histórico de git → o git já cuida (não duplicar)

Sem TOOLS.md monolítico. Cada pasta documenta a si mesma (Princípio 12).
```

#### `skills/operacional/_registry.md` (mínimo)

```markdown
# Registry — operacional/

> Skills da categoria operacional (backup, sync, manutenção).

## Skills

(vazia até primeira skill instalada)

## Como adicionar

Quando uma skill é instalada nesta categoria, adicionar linha:

| Skill | Status | Versão | Tempo |
|---|---|---|---|
| {nome} | ATIVO | 1.0 | {tempo} |

E criar pasta `{nome}/` com `SKILL.md` dentro.
```

Confirmar:

```
"✓ MAPA.md raiz criado.
✓ 4 mapas locais criados:
  - content/MAPA.md
  - memory/MAPA.md
  - skills/MAPA.md
  - archive/MAPA.md
✓ Registry inicial em skills/_registry.md + skills/operacional/_registry.md

Cada pasta documenta a si mesma. Não tem arquivo agregador (TOOLS.md).
Princípio 12 do segundo cérebro."
```

### 6. Pergunta-âncora

Pergunta literal (definida em `mapa-aulas.md` passo 4):

```
"Rapidão antes de fechar este passo: pra onde eu vou salvar um post
novo que você me pedir? E pra onde eu vou buscar uma decisão antiga
que você me contou?"
```

| Resposta esperada | Validação |
|---|---|
| "post em content/, decisão em memory/" (ou similar) | "Boa. `content/drafts/` pra criação, `memory/decisoes/` pra registro. Eu uso o MAPA.md como gabarito sempre que vou salvar algo." |
| Inverteu | "Quase. `content/` pra coisas que VOCÊ cria (posts, drafts, imagens). `memory/` pra coisas que VOCÊ lembra (decisões, pendências, pessoas). MAPA.md no workspace tem o gabarito completo." |
| Outro / não soube | "Sem problema. `content/drafts/` pra coisa que crio (posts, drafts). `memory/decisoes/` pra coisa que você me conta pra eu lembrar. MAPA.md é meu gabarito — leio sempre antes de salvar." |

Fechar com:

```
"Se quer aprofundar workspace + sistema de mapas (e por que cada
pasta tem MAPA.md local em vez de TOOLS.md gigante), a aula é a
Aula 6 (Organizando Workspace) — manda 'aula 6'.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 4 como feito. Bora pro passo 5 (conectar superpoderes
externos — Brave Search, GitHub, etc)?"
```

### 7. Atualizar MEMORY.md

```markdown
## Flags
workspace_organizado: true

## Decisões da jornada
- {data}: Workspace organizado. 4 pastas + MAPA raiz + 4 mapas locais (Princípio 12).
```

Atualizar `onboarding_current_step: 5`.

### 8. Devolver controle pra onboarding-checklist

## Critérios de sucesso

- [ ] `MAPA.md` raiz criado e preenchido (sem placeholders)
- [ ] 4 pastas criadas (`content/`, `memory/`, `skills/`, `archive/`)
- [ ] Subpastas mínimas (`content/drafts/`, `content/archive/`, `memory/decisoes/`, `memory/projects/`, `skills/operacional/`)
- [ ] 4 mapas locais criados com conteúdo (`content/MAPA.md`, `memory/MAPA.md`, `skills/MAPA.md`, `archive/MAPA.md`)
- [ ] `skills/_registry.md` e `skills/operacional/_registry.md` criados (vazios mas com estrutura)
- [ ] Backup global feito se workspace tinha conteúdo
- [ ] `workspace_organizado=true` em `MEMORY.md`
- [ ] `onboarding_current_step=5`
- [ ] Pergunta-âncora respondida + validada
- [ ] Aula B2 mencionada

## Erros comuns

- **Aluno tem `exec-policy=ask` (passo 3 não foi liberado):** wizard fica perguntando aprovação a cada mkdir. Avisar antes (ver "Dependência: passo 3" no início).
- **Workspace tem conteúdo legado:** Princípio 10 (backup global) cobre. Tar.gz na pasta backups antes.
- **Aluno não entende por que tem MAPA por pasta:** explicar Princípio 12. "Pasta gigante com tudo (TOOLS.md) cresce sem controle. Pasta documentada localmente cresce no escopo dela. Mais sustentável."
- **Aluno quer adicionar `pendencias.md` já no setup:** ok, mas avisar que isso é da Aula 7 (Boas Práticas para melhorar a Memória). Pode criar agora vazio.
- **Aluno quer pular essa pasta (skills/, archive/):** explicar que estrutura mínima é mínima por design. Pular skills/ ou archive/ quebra wizards futuros (passo 5 instala skills, passo 6 pode arquivar drafts).

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 1 (backup antes):** se algum arquivo já existe no path que vai criar, backup antes.
- **Princípio 2 (confirmação humana):** confirma antes de criar a estrutura inteira.
- **Princípio 4 (narrar antes de fazer):** explica o quê e o por quê antes de mexer em pasta.
- **Princípio 5 (atualizar MEMORY ao concluir):** marca `workspace_organizado=true`.
- **Princípio 9 (parar se algo der errado):** se mkdir falhar (permissão, disco cheio), para e diagnostica.
- **Princípio 10 (backup global):** este wizard modifica múltiplos arquivos/pastas — backup global do workspace antes.
- **Princípio 11 (detectar antes de pedir):** lê estado atual da estrutura. Se já existe, NÃO recria. Se parcial, cria só o que falta.
- **Princípio 12 (mapas distribuídos):** este é o wizard que IMPLEMENTA o princípio. 4 MAPAs locais + 1 raiz. JAMAIS criar TOOLS.md monolítico aqui.

## Modo A vs Modo B

**Modo A:**
```
"Bora pro Módulo 4 — Workspace + mapas distribuídos.
Aula correspondente: B2 (Workspace + mapa externo).
Recomendo assistir antes pra entender Princípio 12 — por que cada
pasta documenta a si mesma."
[fluxo numerado]
```

**Modo B:**
```
"Agora a estrutura. Onde as coisas vão viver.
Vou criar 4 pastas + MAPA + 4 mapas locais. 4min."
[fluxo conversacional]
```

## Comando "exemplo" durante este wizard

Se aluno mandar "exemplo" pedindo pra ver MAPA da Amora:

```
"Esse é o MAPA.md da Amora — workspace MADURO de Chief of Staff.
Tem 12+ pastas principais, dezenas de subpastas, navegação rica.

Você não precisa começar tão complexo. Estrutura mínima do kit
(4 pastas) cobre 90% dos casos. Conforme você usa o agente, expande.

A Amora demorou 6 meses pra chegar nesse MAPA. Você começa com 4 pastas hoje.

[mostrar exemplos/MAPA-amora.md]

Volta pra criação do seu MAPA?"
```

## Templates usados

- `MAPA.template.md` em `starter-kit/templates/`
- `content-MAPA.template.md`
- `memory-MAPA.template.md`
- `skills-MAPA.template.md`
- `archive-MAPA.template.md`

(Podem ser inline neste SKILL.md também — wizard substitui placeholders e escreve.)

## Referências

### Internas
- Princípios universais: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)
- Sistema de mapas detalhado: [`../onboarding-checklist/references/sistema-de-mapas.md`](../onboarding-checklist/references/sistema-de-mapas.md)
- Princípio 12 (mapas distribuídos): mesmo arquivo de princípios
- Pergunta-âncora oficial: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 4)

### Externas
- Exemplo Amora MAPA: [`starter-kit/exemplos/MAPA-amora.md`](../../../exemplos/MAPA-amora.md)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Detectar workspace path automaticamente via `openclaw config workspace`
- v1.2: Estrutura customizável (aluno escolhe quais pastas extras quer no setup, ex: research/, palestras/)
- v2: Wizard `expandir-workspace` que adiciona subpastas conforme uso real (sugere ao detectar 10+ posts em drafts/, etc)
