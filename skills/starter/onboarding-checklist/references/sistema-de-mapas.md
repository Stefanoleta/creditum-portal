# Sistema de Mapas — Padrão Distribuído

> Como o workspace do aluno se documenta sozinho sem nenhum arquivo virar gigante.

---

## A regra em uma frase

**Cada pasta importante tem seu próprio `MAPA.md` local. O `MAPA.md` raiz só lista pastas e aponta pros mapas locais. Nada é duplicado.**

---

## Por que distribuído (e não centralizado)

Tentamos primeiro propor `TOOLS.md` monolítico (tudo num arquivo). Tem 3 problemas:

1. **Cresce sem controle** — power user com 50 skills + 20 integrações = arquivo de 500+ linhas
2. **Viola single source of truth** — duplica info que já vive em outros arquivos (registries, .env, OpenClaw cron list)
3. **Princípio 12 fica frágil** — atualizar em 2 lugares = fora de sincronia em semanas

Distribuído resolve os 3:
- Cada mapa cresce no seu escopo (limitado naturalmente)
- Cada mapa só fala da sua pasta — sem duplicar
- Princípio 12 só atualiza UM mapa (o local da pasta afetada)

---

## Estrutura completa

```
workspace/
├── MAPA.md                    ← MAPA RAIZ (lista pastas, aponta pros locais)
│
├── skills/
│   ├── MAPA.md                ← mapa local de skills/
│   ├── starter/
│   │   └── MAPA.md            ← mapa local de skills/starter/
│   ├── planejamento/
│   │   └── MAPA.md
│   └── canais/
│       └── MAPA.md
│
├── content/
│   ├── MAPA.md                ← mapa local de content/
│   ├── drafts/
│   └── images/
│
├── memory/
│   ├── MAPA.md                ← mapa local de memory/
│   ├── decisoes/
│   ├── pendencias/
│   └── pessoas/
│
└── archive/
    └── MAPA.md                ← mapa local de archive/
```

---

## Padrão visual de cada `MAPA.md`

Independente do nível, todo `MAPA.md` segue mesmo padrão:

```markdown
# MAPA.md — {pasta atual}

> Última atualização: {data}

## O que tem aqui

{Conteúdo específico da pasta — tabela, lista, ou descrição.}

## Como navegar

{Como ir mais fundo ou subir um nível.}

## Quando atualizar

{Trigger que dispara atualização deste mapa.}
```

---

## Exemplos por nível

### MAPA raiz (`workspace/MAPA.md`)

```markdown
# MAPA.md — workspace raiz

## Pastas principais

| Pasta | Função | Mapa local |
|---|---|---|
| `skills/` | Skills instaladas | [skills/MAPA.md](skills/MAPA.md) |
| `content/` | Coisas que eu crio | [content/MAPA.md](content/MAPA.md) |
| `memory/` | Coisas que eu lembro | [memory/MAPA.md](memory/MAPA.md) |
| `archive/` | Material arquivado | [archive/MAPA.md](archive/MAPA.md) |

## Arquivos raiz

Ver [`AGENTS.md`](AGENTS.md) pra regras de interação.
Ver detalhe de cada arquivo raiz em `references/arquivos-raiz.md` (no kit).

| Arquivo | Função |
|---|---|
| `USER.md` | Quem você é |
| `IDENTITY.md` | Quem eu sou |
| `SOUL.md` | Minha personalidade |
| `AGENTS.md` | Regras entre nós |
| `MEMORY.md` | Decisões + memória |
| `HEARTBEAT.md` | Configuração do mecanismo de proatividade |
| `.env` | Chaves API |

## Quando atualizar este mapa

Só quando estrutura macro mudar:
- Pasta nova criada
- Pasta importante removida ou renomeada
- Novo arquivo raiz adicionado

NÃO atualizar quando algo dentro de uma pasta muda — isso é responsabilidade do mapa local da pasta.
```

---

### MAPA local de pasta com sub-pastas (`workspace/skills/MAPA.md`)

```markdown
# MAPA.md — skills/

## Categorias

| Categoria | Skills | Status | Mapa |
|---|---:|---|---|
| starter | 1 ativa, 6 arquivadas | jornada de onboarding completa | [starter/MAPA.md](starter/MAPA.md) |
| planejamento | 4 | Superpowers curado | [planejamento/MAPA.md](planejamento/MAPA.md) |
| canais | 1 | wizard-whatsapp (não ativado) | [canais/MAPA.md](canais/MAPA.md) |

## Como navegar

- Detalhe de categoria: `{categoria}/MAPA.md`
- Detalhe de skill específica: `{categoria}/{nome}/SKILL.md`

## Quando atualizar

- Skill nova instalada → atualiza este mapa (contagem) + mapa da categoria
- Skill removida → idem
- Categoria nova criada → atualiza este mapa + cria MAPA.md da categoria
```

---

### MAPA local de pasta com arquivos diretos (`workspace/content/MAPA.md`)

```markdown
# MAPA.md — content/

## O que tem aqui

| Sub-pasta | Função | Conteúdo recente |
|---|---|---|
| `drafts/` | Posts, briefings, planos que crio pra você | 1 arquivo: primeira-vitoria-2026-05-02.md |
| `images/` | Imagens geradas (futuro) | vazio |

## Convenção de naming

- Drafts: `{nome-da-skill}-{YYYY-MM-DD}.md` (ex: `primeira-vitoria-2026-05-02.md`)
- Imagens: `{tema}-{YYYY-MM-DD}.png`

## Quando atualizar

- Novo arquivo criado em qualquer sub-pasta → atualiza contagem aqui
- Sub-pasta nova criada → adiciona linha
```

---

### MAPA local de pasta com items individuais (`workspace/skills/starter/MAPA.md`)

```markdown
# MAPA.md — skills/starter/

## Skills da jornada de onboarding (concluída)

| Skill | Status pós-jornada |
|---|---|
| onboarding-checklist | arquivada (mestre — função cumprida) |
| wizard-whisper-quick | arquivada (Whisper já configurado) |
| wizard-agente | arquivada (identidade já criada) |
| wizard-aluno | arquivada (USER já criado) |
| wizard-autonomia | arquivada (já liberada) |
| wizard-workspace | arquivada (já organizado) |
| wizard-conectar | arquivada (já conectado) |
| primeira-vitoria | **ativa** — usa de novo pra criar mais artefatos |

## Quando atualizar

Esse mapa estabiliza após jornada de onboarding.
Atualizar só se:
- Aluno desarquivar alguma wizard pra refazer
- primeira-vitoria for desativada/atualizada
```

---

## Como o agente usa os mapas

Princípio: **leia só o que precisa.**

| Aluno pergunta | Agente lê |
|---|---|
| "que skills eu tenho?" | `skills/MAPA.md` |
| "que skills de planejamento?" | `skills/planejamento/MAPA.md` |
| "como funciona a primeira-vitoria?" | `skills/starter/primeira-vitoria/SKILL.md` |
| "o que tem em content/drafts/?" | `content/MAPA.md` (vê contagem), depois `ls content/drafts/` se precisar lista |
| "que decisões tomei mês passado?" | `memory/MAPA.md` (vê estrutura), depois `memory/decisoes/2026-04.md` |

Não precisa de varredura completa do workspace. Mapas direcionam navegação.

---

## Comando "status" — visão consolidada sob demanda

Quando aluno quer ver tudo de uma vez, agente roda queries on-demand:

> Status do seu agente:
>
> **Skills ativas:** 12 (lê `skills/MAPA.md`)
> - 4 starter (1 ativa, 3 arquivadas)
> - 4 planejamento
> - 2 canais
> - 2 que você criou
>
> **Integrações conectadas:** 5 (lê `.env`, sem expor valores)
> - OpenAI API, OpenAI OAuth, Brave Search, GitHub, Chromium
>
> **Crons rodando:** 1 (`openclaw cron list`)
> - backup-github (diário 03h)
>
> **Última atividade:** hoje 14h30 (lê `memory/hot.md`)
>
> Quer detalhe? Manda "skills detalhado", "crons detalhado", etc.

Resposta sempre fresca, custo trivial, sem arquivo agregador pra inchar.

---

## Quando criar um MAPA novo

**SIM, criar `MAPA.md`:**
- Pasta tem 3+ items que precisam ser indexados
- Pasta vai crescer ao longo do tempo (skills, content, memory)
- Pasta tem sub-pastas que precisam ser navegadas

**NÃO criar `MAPA.md`:**
- Pasta com 1-2 arquivos triviais (ex: `images/` com 2 PNGs)
- Pasta gerada/temporária (ex: `tmp/`, `.cache/`)
- Sub-pasta de arquivos versionados pelo agente (ex: `decisoes/2026-04.md` — não precisa MAPA dentro de decisoes/)

Default: criar mapa só quando faz diferença pro agente OU pro aluno explorando.

---

## Princípio 12 conectado

Este sistema implementa o **Princípio 12 — Mapas distribuídos** descrito em `principios-defensivos.md`:

> Cada pasta importante tem mapa local; MAPA raiz só lista pastas. Quando algo muda, atualizar SÓ o mapa local da pasta afetada. Mapas desatualizados são pior que mapa nenhum — Princípio 12 mantém vivos.

---

*Última revisão: 02/05/2026*
