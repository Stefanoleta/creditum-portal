---
name: workspace-do-seu-agente
status: ATIVO
category: cheatsheet
referenced_by: [A6]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra workspace do agente OpenClaw (A6). Cobre estrutura canônica em 4 pastas raiz · MAPAs distribuídos (Princípio 12) · arquivos raiz (SOUL/IDENTITY/USER/AGENTS/MAPA/.env) · quando atualizar MAPA vs nunca · 5 prompts prontos · comandos `openclaw workspace` · troubleshooting profundo · princípios A10 (workspace isolado · `.env` nunca commita · backup periódico).
---

# Workspace do seu agente — referência rápida (A6)

## Como usar este cheatsheet

**Caminho default — siga a aula A6** (linha de produção):

A6 entrega o A-ha estrutural ("mapas mantêm ele afiado · audit 1x/mês") em 10min. Este cheatsheet é referência pós-aula pra fixar a árvore canônica, MAPAs distribuídos e workflow de audit. Use quando agente "perder" arquivo OU quando você sentir vontade de criar pasta nova.

**Caminho de plano B — comando direto** (use quando):
- Agente criou pasta órfã (não documentada em MAPA)
- Audit mensal mostrou MAPAs desatualizados
- Você acidentalmente mexeu em `memory/` e agente ficou confuso

## A6 em 1 minuto (resumo executivo)

Workspace canônico = **4 pastas raiz** + **arquivos de identidade na raiz** + **MAPAs distribuídos** (1 por pasta). Kit (A3) provisiona. Agente respeita. Você audita 1x/mês em 5min.

| Pasta raiz | O que mora aqui | Quem mexe |
|------------|------------------|-----------|
| **`content/`** | Coisas que ele CRIA pra você (posts · drafts · materiais) | Agente cria · você revisa |
| **`memory/`** | Coisas pra LEMBRAR (decisões · pendências · context · dailies · projects) | Só o agente — território dele |
| **`skills/`** | Capacidades modulares (cobertura A8) | Agente curado · você cria custom |
| **`archive/`** | Coisas obsoletas/fechadas/encerradas (flat por mês) | Agente arquiva · você nunca deleta |

> **Frase-mãe da A6:** *"Workspace organizado = capacidade de escalar. Mapas em cada pasta = agente achando as coisas. Audit mensal = ele afiado pro próximo mês."*

## Árvore canônica (visual)

```
~/.openclaw/agents/<id>/
├── SOUL.md             ← persona (recap A5)
├── IDENTITY.md         ← papel funcional (recap A5)
├── AGENTS.md           ← organograma (recap A5 · cobertura A13)
├── USER.md             ← seu perfil (recap A5)
├── MEMORY.md           ← auto-conhecimento do agente (cobertura A7)
├── MAPA.md             ← lista as 4 pastas + onde encontrar cada coisa
├── HEARTBEAT.md        ← config de proatividade (cobertura A9)
├── content/            ← coisas que ele CRIA
│   └── MAPA.md         ← documenta a si mesma (Princípio 12)
├── memory/             ← coisas pra LEMBRAR
│   ├── MAPA.md
│   ├── hot.md          ← contexto quente (cobertura A7)
│   ├── 2026-05-02.md   ← daily SOLTA na raiz (padrão OpenClaw)
│   ├── context/        ← people, business, decisões, pendências
│   └── projects/       ← 1 arquivo por projeto + _index.md
├── skills/             ← capacidades modulares
│   └── MAPA.md
├── archive/            ← onde joga as coisas pra trás
│   └── MAPA.md
└── .env                ← credenciais (NUNCA commita · cobertura A10)
```

## Anatomia dos arquivos raiz

Recap rápido — `identidade-do-seu-agente.md` cobre profundo:

| Arquivo raiz | Função | Quando muda |
|--------------|--------|-------------|
| **`SOUL.md`** | Persona · tom · valores | Quando tom não bate com desejado |
| **`IDENTITY.md`** | Papel funcional · cargo | Quando função muda (cron · multi-agente) |
| **`AGENTS.md`** | Organograma · relação com outros agentes | Quando entra agente novo (A13) |
| **`USER.md`** | Seu perfil · família · negócios | Toda mudança material no seu contexto |
| **`MEMORY.md`** | Auto-conhecimento do agente (long-term) | Raramente — quando agente aprende algo durável |
| **`MAPA.md`** | Mapa raiz das 4 pastas + onde guardar coisa nova | Quando estrutura de pasta muda (raro) |
| **`HEARTBEAT.md`** | Config de proatividade (poll · quiet hours · checks) | Quando você muda cadência de proatividade |
| **`.env`** | Credenciais (API keys · tokens · secrets) | Quando rotaciona credencial (mensal recap A10) |

## MAPAs distribuídos — Princípio 12

Conceito-chave da A6. Aluno PME geralmente nunca viu isso.

**Definição:** cada pasta tem um `MAPA.md` local que documenta o que vive ali dentro. Quando agente precisa decidir onde guardar algo, ele lê o MAPA da pasta-pai e encontra rota.

### Por que NÃO um TOOLS.md monolítico

Tentação inicial é fazer 1 arquivo central que liste tudo. Quebra rápido por 3 motivos:

| Problema | Por quê |
|----------|---------|
| **Cresce sem controle** | Em 3 meses tem 800 linhas, ninguém atualiza, vira mentira oficial |
| **Lock-in cognitivo** | Agente carrega 800 linhas no contexto pra cada decisão — desperdício de janela e custo |
| **Sem domínio** | Edição de um pedaço afeta tudo — uma mudança bobinha gera conflito noutro lugar |

### O que MAPAs distribuídos resolvem

| Vantagem | Como |
|----------|------|
| **Cada parte sabe de si** | `memory/MAPA.md` documenta só `memory/` · `content/MAPA.md` só `content/` |
| **Carrega só o que precisa** | Agente vai salvar coisa em content? Lê só `content/MAPA.md` · economia de janela |
| **Manutenção localizada** | Atualização de uma pasta não afeta as outras |
| **Audit é leitura paralela** | Cada pasta-MAPA é independente — fácil revisar |

> **Citação do Princípio 12** (skill `wizard-workspace` do kit): *"Sem MAPA, agente improvisa e vira bagunça em 1 semana."* Não é exagero. É padrão observado.

### Estrutura de um MAPA.md típico

Exemplo de `memory/MAPA.md`:

```markdown
# MAPA — memory/

Território do agente. Aluno NÃO mexe aqui manualmente.

## O que mora aqui

- `YYYY-MM-DD.md` — daily notes soltas na raiz (padrão OpenClaw)
- `hot.md` — contexto quente (auto-mantido)
- `context/people/` — 1 arquivo por pessoa relevante
- `context/business/` — 1 arquivo por negócio
- `context/decisoes/YYYY-MM.md` — decisões do mês
- `context/pendencias.md` — lista viva de pendências
- `projects/_index.md` — master de projetos ativos
- `projects/{nome}.md` — 1 arquivo por projeto

## Onde guardar coisa nova

- Decisão tomada hoje → `context/decisoes/2026-05.md`
- Pessoa nova → `context/people/{nome}.md`
- Projeto novo → `projects/{nome}.md` + atualiza `_index.md`
- Daily note → `YYYY-MM-DD.md` na raiz

## Regras

- Daily notes ficam SOLTAS na raiz (não em subpasta sessions/)
- Antes de criar pasta nova, verifica se já existe propósito similar
- Pendência fechada vai pra archive/ (não delete)
```

## Quando atualizar MAPA vs nunca atualizar

| Situação | Ação |
|----------|------|
| Estrutura de pasta MUDOU (criou subpasta nova com propósito real) | Atualiza MAPA da pasta-pai · agente faz isso automaticamente quando você pede |
| Estrutura ESTÁVEL (sem mudanças há 30 dias) | NÃO mexe · MAPA reflete realidade · audit mensal só confirma |
| Você criou arquivo manualmente em pasta gerenciada pelo agente | Pede agente: "olha o que mudou em <pasta>/ e atualiza MAPA pra refletir" |
| Você sente que precisa "customizar a estrutura" | Bias do day 1 — geralmente é resistência, não necessidade real. Deixa kit como veio nos primeiros 30 dias |

## memory/ é território do agente

Princípio que pode ser contraintuitivo: aluno acha que *"é meu workspace, posso mexer em tudo"*. Pode — mas em `memory/` você atrapalha mais do que ajuda.

**Razão:** memory é o cérebro persistente do agente. Você criar pasta aleatória ali bagunça os MAPAs e quebra busca semântica (cobertura A7).

### Anti-padrão clássico

Aluno cria `memory/notas-importantes/` aleatório porque "preciso de um lugar pra anotar coisa". Resultado: vira lixeira que ninguém olha. Agente não documenta o que não tem MAPA. **Em 2 semanas, ninguém lembra o que tá lá.**

### Padrão correto

Quando precisar de pasta nova, **conversa com o agente**. Ele decide onde encaixa baseado no MAPA da pasta-pai. Se já existe propósito similar, ele reusa. Se é novo, ele cria + atualiza MAPA + commita.

## Archive — nunca deletar, sempre arquivar

Princípio absoluto. Pode ser contraintuitivo (*"se tá obsoleto pra que guardar?"*) — mas tem razão prática forte.

### Estrutura simples (flat por mês)

```
archive/
├── 2026-04/
│   ├── projeto-X-encerrado.md
│   ├── decisao-revertida.md
│   └── pendencia-fechada-Y.md
├── 2026-05/
│   └── ...
└── MAPA.md
```

**Sem subpastas profundas. Sem taxonomia complexa.** Agente arquiva, fica lá, busca semântica acha quando precisa.

### O que vai pra archive

| Tipo | Quando |
|------|--------|
| Pendência fechada | Sai de `pendencias.md` · vai pra `archive/2026-MM/` |
| Projeto encerrado | `projects/X.md` migra pra archive |
| Decisão obsoleta ou revertida | Não some · vira contexto histórico |
| Daily notes muito antigas | Depois de 14 dias (default) saem da raiz · viram archive |
| Drafts abandonados | Em vez de deletar, arquiva |

### Por que NÃO deletar

Agente pode precisar consultar histórico depois pra contexto. Cenário real: 6 meses depois você pergunta *"a gente já tentou X uma vez?"* · agente busca em archive · acha decisão revertida · responde com data + raciocínio. Sem archive, ele não tem como saber.

> **Histórico é vantagem competitiva.** Não joga fora — arquiva.

## 5 prompts prontos pra colar

### 1. Gerar MAPA.md raiz baseado em ls -R do workspace

Cola após Starter Kit (A3) ter rodado, pra confirmar que MAPA raiz tá alinhado com realidade:

```
Faz scan completo do workspace (ls -R em ~/.openclaw/agents/<id>/).

Lê o MAPA.md raiz atual e me responde:

1. As 4 pastas raiz esperadas existem (content, memory, skills, archive)?
2. Cada uma tem MAPA.md local?
3. MAPA raiz lista as 4 pastas + descreve onde guardar coisa nova?
4. Há pasta na raiz que NÃO está em nenhum MAPA (órfã)?
5. Há referência em MAPA pra pasta que NÃO existe (zumbi)?

Me devolve diagnóstico em tabela.
Se há divergência, propõe ajuste antes de executar.
NÃO altera nada sem confirmação.
```

### 2. Atualizar MAPA local quando criar pasta nova

Cola sempre que você sentir que precisa de pasta nova — Princípio 11 (detecta antes de criar):

```
Preciso guardar [TIPO DE COISA] de forma recorrente.

Antes de criar pasta nova:
1. Lê o MAPA das pastas existentes (memory/, content/, etc.)
2. Verifica se já existe propósito similar onde encaixa
3. Se não existir, propõe pasta nova + onde ela vive + atualiza MAPA
4. Me mostra plano antes de criar — eu confirmo ou ajusto

Princípio 11: detecta antes de criar. Não improvisa estrutura.
Princípio 12: MAPA da pasta-pai documenta a nova entrada.
```

### 3. Auditar MAPAs órfãos e referências quebradas

Cola 1x por mês — audit mensal de 5min:

```
Roda audit do workspace. Olha:

1. Pendências em pendencias.md que tão fechadas — propõe arquivar
2. Projetos em projects/ que tão encerrados — propõe migrar pra archive
3. Daily notes na raiz de memory/ com mais de 14 dias — propõe arquivar
4. Pastas/arquivos que NÃO estão documentados em nenhum MAPA — lista
5. MAPAs que descreveram coisas que não existem mais — lista
6. Decisões em decisoes/ que foram revertidas/obsoletas — propõe arquivar

Me devolve plano em lista. Eu aprovo em massa.
Princípio: archive em vez de delete. Sempre.
```

### 4. Reorganizar workspace antes de criar agente novo (recap multi-agente)

Cola antes de seguir multi-agente.md (A13) — limpa workspace pra evitar bagunça quando entra agente paralelo:

```
Vou criar agente novo paralelo (recap cheatsheet multi-agente.md).
Antes disso, quero deixar workspace da Amora 100% limpo.

Roda audit pré-multi-agente:

1. Confirma que os 5 arquivos raiz (SOUL, IDENTITY, USER, AGENTS,
   MEMORY) tão consistentes (recap identidade-do-seu-agente.md)
2. Confirma que AGENTS.md tá pronto pra receber agente novo
   (seção do agente principal documentada · pronto pra adicionar
   seção do agente novo)
3. Audit completo (Prompt 3 acima) pra arquivar pendências fechadas
4. Move tudo que é exclusivo do canal/escopo do agente novo pra
   shared/migrations/ (caso eu queira migrar — ver Prompt 6 do
   multi-agente.md)
5. Me mostra workspace ANTES e DEPOIS do limpa

NÃO cria o agente novo aqui — só prepara terreno.
```

### 5. Backup do workspace pro GitHub via skill (opcional)

Quando aluno avançado quer redundância em git privado:

```
Quero criar skill `workspace-backup-git` que:

1. Inicializa repo git em ~/.openclaw/agents/<id>/workspace/
2. Adiciona .gitignore com:
   - .env (NUNCA commita — recap A10)
   - secrets/, credentials/, tokens/
   - sessions/ (logs operacionais)
   - .openclaw/cache/
3. Configura remote pra GitHub PRIVADO (NUNCA público)
4. Cria cron diário (recap A9) que faz commit + push automático
5. Adiciona regra no SOUL: agente nunca commita arquivo com
   pattern de credencial (regex: API_KEY=, TOKEN=, SECRET=)

Princípios A10:
- Repo PRIVADO sempre · nunca público
- .gitignore validado antes do primeiro commit
- Audit mensal: confirma que .env nunca foi commitado em histórico
- Token do GitHub no .env (rotação mensal)

Me mostra plano da skill antes de criar.
NÃO faz primeiro commit antes de eu validar .gitignore.
```

## Comandos `openclaw workspace` (validados na doc oficial)

| Comando | Pra que serve |
|---------|---------------|
| `openclaw workspace status` | Mostra estado do workspace (tamanho · # de arquivos · MAPAs encontrados · arquivos órfãos) |
| `openclaw workspace tree` | Árvore visual do workspace (similar `tree` Unix mas filtrado pra estrutura OpenClaw) |
| `openclaw workspace tree --depth 2` | Limita profundidade da árvore (útil em workspace grande) |
| `openclaw workspace cleanup` | Sugere limpeza (arquivos órfãos · sessions antigas · archive proposto). Dry-run por default |
| `openclaw workspace cleanup --apply` | Aplica limpeza após dry-run validado (CUIDADO — confirmar dry-run primeiro) |

> **Quando rodar `cleanup --apply`:** só após `cleanup` (dry-run) ter sido validado. Sempre faz backup antes em workspaces grandes (>1000 arquivos).

## Troubleshooting profundo

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Agente cria pasta nova sem perguntar | Não consultou MAPA antes (Princípio 11 violado) | "antes de criar, lê MAPA da pasta-pai e me mostra plano" |
| MAPA descreve coisa que não existe mais | Pasta foi removida, MAPA não atualizou | Roda audit mensal (Prompt #3) |
| Daily notes em subpasta `sessions/` | Estrutura legada — padrão OpenClaw é solta na raiz | "migra dailies de sessions/ pra raiz de memory/, atualiza MAPA" |
| Pendência fechada continua em pendencias.md | Agente não migrou pra archive | Audit mensal · ou manual: "essa pendência fechou — arquiva em archive/2026-MM/" |
| Archive cresce demais e fica bagunçado | Sem subpasta por mês ou taxonomia profunda | Estrutura é flat por mês (`archive/YYYY-MM/`). Não complica |
| Agente "perde" arquivo | Salvou em lugar diferente do MAPA | "onde você guardou X?" · ele lê e responde · atualiza MAPA se preciso |
| Você sente que precisa "customizar a estrutura" | Bias do day 1 — geralmente resistência, não necessidade | Deixa como kit veio nos primeiros 30 dias. Customização real vem com uso |
| Aluno mexeu em memory/ manualmente · agente confuso | Mudança fora do MAPA quebrou expectativa | "olha o que mudou em memory/ e atualiza MAPA pra refletir" |
| Workspace inflado (muitos GB) | Sessions antigas · cache · transcripts órfãos | `openclaw workspace cleanup` (dry-run) · validar · `--apply` |
| `.env` apareceu em git diff | NUNCA pode acontecer (recap A10) | STOP · `git rm --cached .env` · força .gitignore · ROTATE todas as credenciais que estavam ali |
| Agente não acha arquivo via busca semântica | Índice desatualizado (mudança manual recente) | `openclaw memory index --force` (cobertura A7) |
| MAPA raiz lista pasta que não existe mais (zumbi) | Pasta foi deletada · MAPA não atualizou | "atualiza MAPA raiz removendo referência pra pasta X que não existe mais" |

## Princípios de segurança aplicados (recap A10)

Workspace = onde dados sensíveis vivem. Princípios A10:

1. **Workspace isolado por agente.** Cada agente paralelo (Managed multi-agente · cobertura A13) tem `~/.openclaw/agents/<id>/` próprio. Não compartilha SOUL · IDENTITY · MEMORY com outro agente.
2. **`.env` NUNCA commita.** `.gitignore` default já protege. Auditoria mensal: confirma que histórico git não tem `.env`. Se vazou, ROTATE tudo.
3. **Backup periódico em repo PRIVADO.** Nunca público. `.gitignore` validado antes do primeiro commit (Prompt #5). Cron diário (recap A9) automatiza.
4. **`memory/` é território do agente** mas dados do USER.md (perfil pessoal) ficam ali — Docker isolation já protege em runtime, mas se workspace for clonado, USER.md vai junto. Se vai compartilhar workspace (raro), confirma o que é compartilhável.
5. **Arquivos sensíveis fora de `shared/`.** `shared/` é compartilhado entre agentes paralelos. Nunca coloca credencial · contrato · documento confidencial em `shared/`.
6. **Audit mensal de `.gitignore`.** Recap A10 — credencial nova (cron · webhook · API novo) precisa entrar no `.gitignore` antes do primeiro commit.

## Pendências de validação (release v1.0 do kit)

Antes de release v1.0:

1. Testar `openclaw workspace status` em conta Managed zerada — confirmar formato de output
2. Validar `openclaw workspace tree --depth 2` em workspace com 200+ arquivos — performance ok?
3. Testar `openclaw workspace cleanup` (dry-run) — confirmar que sugere arquivamento sensato
4. Testar `cleanup --apply` em workspace de teste — confirmar que faz archive em vez de delete
5. Validar que kit (A3) provisiona MAPA.md em cada uma das 4 pastas raiz com conteúdo populado (não só esqueleto)
6. Confirmar que `.gitignore` default do kit cobre `.env`, `secrets/`, `credentials/`, `tokens/`, `sessions/`

## Referências

### Internas
- A6 (este cheatsheet complementa) — `aulas/aula-06-workspace/Workspace + mapas.html`
- A3 (Starter Kit) — kit provisiona estrutura inicial
- A5 (identidade) — arquivos raiz SOUL/IDENTITY/USER/AGENTS — `cheatsheets/identidade-do-seu-agente.md`
- A7 (memória) — `memory/` é território do agente, contém daily notes + hot.md — `cheatsheets/memoria-do-seu-agente.md`
- A8 (skills) — pasta `skills/` aprofundada
- A9 (crons) — backup automático via cron + HEARTBEAT.md
- A10 (segurança) — princípios aplicados a workspace · `.env` · backup
- A13 (multi-agente) — `~/.openclaw/agents/` com múltiplos workspaces — `cheatsheets/multi-agente.md`

### Externas
- Doc OpenClaw `concepts/workspace`: [docs.openclaw.ai/concepts/workspace](https://docs.openclaw.ai/concepts/workspace)
- Doc OpenClaw `concepts/maps`: [docs.openclaw.ai/concepts/maps](https://docs.openclaw.ai/concepts/maps) (Princípio 12)
- Doc OpenClaw `cli/workspace`: [docs.openclaw.ai/cli/workspace](https://docs.openclaw.ai/cli/workspace)
- Doc OpenClaw `reference/MAPA.default`: [docs.openclaw.ai/reference/MAPA.default](https://docs.openclaw.ai/reference/MAPA.default)
- Doc OpenClaw `reference/.env`: [docs.openclaw.ai/reference/env](https://docs.openclaw.ai/reference/env)

---

> **Frase-mãe da A6:** *"Workspace organizado = capacidade de escalar. Mapas em cada pasta = agente achando as coisas. Audit mensal = ele afiado pro próximo mês."* 4 pastas raiz · MAPAs distribuídos (Princípio 12) · 1 pasta = 1 propósito · memory/ é território do agente · archive em vez de delete · 5min de audit por mês. Próxima referência: `memoria-do-seu-agente.md` (A7).
