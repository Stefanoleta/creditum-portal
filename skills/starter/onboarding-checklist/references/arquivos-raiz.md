# Arquivos Raiz do Workspace

> Documentação canônica dos 8 arquivos raiz que vivem no workspace do aluno após a jornada do starter-kit.
> Cada arquivo tem função única, owner definido, e regra clara de quando atualizar.

---

## Visão geral

```
workspace/
├── USER.md         ← quem é o aluno
├── IDENTITY.md     ← quem é o agente (nome, tom, iniciativa)
├── SOUL.md         ← personalidade do agente (anti-patterns, jeitos)
├── AGENTS.md       ← regras de interação aluno↔agente
├── MAPA.md         ← mapa raiz: lista pastas, aponta pros mapas locais
├── MEMORY.md       ← decisões + flags + memória contínua
├── HEARTBEAT.md    ← configuração do mecanismo de proatividade
└── .env            ← chaves API + segredos
```

Princípio: cada arquivo tem **uma responsabilidade clara**. Sem mistura.

---

## Detalhe por arquivo

### `USER.md` — Identidade do aluno

**Função:** quem é a pessoa que conversa com o agente. Nome, papel, área, dor principal, contexto.

**Criado em:** Passo 2 (`wizard-aluno`)

**Quem atualiza:**
- Aluno (manual) — quando contexto pessoal muda (mudou de empresa, trocou foco)
- Agente — nunca sozinho, só sugere

**Frequência:** Raramente. Pode ficar meses sem mudar.

**Estrutura mínima:**
```markdown
# USER.md

## Quem sou
- Nome: Carlos
- Como me chame: Carlos

## O que faço
- Papel: dono de padaria
- Setor: alimentação
- Tamanho: padaria pequena, 4 funcionários

## Contexto
- Maior dor: atender cliente no WhatsApp (encomendas de bolo)
- Resultado esperado em 30 dias: organizar fluxo de pedidos sem perder cliente
```

---

### `IDENTITY.md` — Identidade do agente

**Função:** características operacionais do agente. Nome, tom, iniciativa.

**Criado em:** Passo 1 (`wizard-agente`)

**Quem atualiza:**
- Aluno (manual) — quando quer ajustar tom/iniciativa
- Agente — nunca sozinho

**Frequência:** Raro. Aluno ajusta quando descobre que tom não tá bom.

**Estrutura mínima:**
```markdown
# IDENTITY.md

## Sobre mim (este agente)
- Nome: Léa
- Tom: casual brasileiro, sem jargão corporativo
- Iniciativa: sugere e pergunta (te mostro 2-3 opções, você escolhe)
- Owner: Carlos
```

---

### `SOUL.md` — Personalidade profunda

**Função:** anti-patterns, jeitos de falar específicos, valores. Vai além de "tom" — define caráter.

**Criado em:** Passo 1 (stub mínimo) → B1 (completo no curso)

**Quem atualiza:** Aluno + agente sugere

**Frequência:** Stub criado uma vez, completo evolui ao longo do tempo

**Estrutura mínima (stub do passo 1):**
```markdown
# SOUL.md (stub)

Sou Léa, agente do Carlos (dono de padaria).

## Tom geral
Casual brasileiro, sem jargão corporativo.

## 1 anti-pattern fundamental
Nunca uso linguagem motivacional/coach. Falo direto.
```

**Versão completa (após B1):** detalha múltiplos anti-patterns, situações específicas (como falar quando dá erro, quando aluno tá frustrado, etc).

---

### `AGENTS.md` — Regras de interação

**Função:** o que aluno e agente combinaram que pode ou não pode rolar. Regras de comportamento.

**Criado em:** Passo 1 (`wizard-agente`)

**Quem atualiza:** Aluno (manual) — adiciona regra quando pega agente fazendo algo que não gostou

**Frequência:** Raro depois do passo 1

**Estrutura mínima:**
```markdown
# AGENTS.md — Regras entre nós

## O que NUNCA faço
- Mandar email/whats em nome do Carlos sem perguntar
- Deletar arquivo sem confirmação dupla
- Usar jargão de marketing

## O que SEMPRE posso fazer (sem perguntar)
- Criar arquivo dentro de content/drafts/
- Salvar decisão em memory/decisoes/
- Pesquisar na web pra responder pergunta

## Quando perguntar antes
- Modificar arquivo raiz (USER, IDENTITY, SOUL, AGENTS, MAPA, .env)
- Executar comando shell
- Conectar/desconectar integração externa
- Criar cron novo
```

---

### `MAPA.md` — Mapa raiz do workspace

**Função:** lista as pastas principais e aponta pros mapas locais de cada uma.

**Criado em:** Passo 4 (`wizard-workspace`)

**Quem atualiza:** Agente — quando estrutura macro muda (pasta nova criada/removida)

**Frequência:** Raro. Estrutura macro estabiliza após o passo 4.

**Padrão e exemplo completo:** ver [`sistema-de-mapas.md`](sistema-de-mapas.md)

---

### `MEMORY.md` — Decisões + memória contínua

**Função:** flags da jornada de onboarding + decisões importantes do aluno + memória factual de longo prazo.

**Criado em:** Vários passos (cada wizard adiciona sua flag)

**Quem atualiza:** **Agente — automático.** Constantemente.

**Frequência:** A cada decisão tomada, flag setada, fato relevante.

**Estrutura:**
```markdown
# MEMORY.md

## Flags da jornada de onboarding
- kit_intro_done: true (2026-05-02 14:15)
- whisper_configured: true (2026-05-02 14:20)
- agente_configured: true (2026-05-02 14:25) — nome: Léa
- aluno_configured: true (2026-05-02 14:30)
- autonomia_liberada: true (2026-05-02 14:38)
- workspace_organizado: true (2026-05-02 14:45)
- conectado: true (2026-05-02 15:02)
- first_win_completed: true (2026-05-02 15:10)
- onboarding_complete: true (2026-05-02 15:12)
- nps_completed: true (2026-05-02 15:18)

## Decisões importantes
- 2026-05-02: Aluno escolheu manter starter-kit instalado (não arquivar)
- 2026-05-02: Aluno pulou Apify e Perplexity no passo 5 — disse que vai instalar depois
- ...

## Fatos do aluno (descobertos ao longo do tempo)
- Padaria fica em Curitiba
- Funcionários: Maria (caixa), João (forno), ...
- ...
```

---

### `HEARTBEAT.md` — Configuração do mecanismo de proatividade

**Função:** define COMO o agente vigia o dia do aluno. Frequência de poll, checks rotacionáveis (inbox, calendário, menções, pendências paradas), regras de silêncio, regras de reach out, quiet hours.

> **Importante:** `HEARTBEAT.md` é configuração, não log de estado. O que o agente vigia (prioridades, prazos, negociações ativas, decisões recentes) mora em `memory/hot.md` — auto-mantido pela skill `/salve` e pela pipeline de captura. Não confundir os dois: `HEARTBEAT.md` = COMO ele vigia. `hot.md` = O QUE ele vigia.

**Criado em:** Passo 4 (`wizard-workspace`)

**Quem atualiza:** **Aluno (manual).** Raro — só quando quer mudar comportamento (ativar/desativar check, mudar frequência, ajustar quiet hours).

**Frequência:** Edita raro. Agente recarrega no próximo poll após qualquer mudança.

**Estrutura mínima:**
```markdown
# HEARTBEAT.md

## Frequência
- Poll a cada: 30 minutos
- Janela ativa: 08:00 às 22:00
- Quiet hours: 22:00 às 08:00

## Checks rotacionáveis
- [x] Inbox triage — emails das últimas 4h, avisa só urgentes
- [ ] Calendário próximo — eventos das próximas 24-48h
- [ ] Pendências paradas — itens com terceiro parado 3+ dias
- # [ ] Mention sweep, weather guard, news watch (desativados)

## Regras de silêncio
- Já checou nos últimos 30min → HEARTBEAT_OK
- Nada novo desde a última checagem → silêncio
- Quiet hours → só urgência real

## Regras de reach out
- Email importante chegou
- Evento começa em <2h sem confirmação
- Faz >8h sem dizer nada e tem coisa relevante
```

Template completo: [`templates/HEARTBEAT.template.md`](../../../../templates/HEARTBEAT.template.md). Exemplo real: [`exemplos/HEARTBEAT-amora.md`](../../../../exemplos/HEARTBEAT-amora.md).

---

### `.env` — Chaves API e segredos

**Função:** todas as chaves API + tokens + secrets que o agente usa.

**Criado em:** Passo 0 (Whisper) + Passo 5 (Conectar)

**Quem atualiza:** Aluno (paste) ou wizard-conectar (com confirmação dupla)

**Frequência:** A cada nova integração ou rotação de chave.

**Estrutura:**
```bash
# OpenAI
OPENAI_API_KEY=sk-proj-xxx          # Whisper + embeddings
OPENAI_OAUTH_TOKEN=managed-by-openclaw  # ChatGPT Plus

# Busca
BRAVE_SEARCH_API_KEY=BSAk-xxx

# GitHub
GITHUB_TOKEN=ghp_xxx                # backup automático

# Opcionais (não configurados)
# PERPLEXITY_API_KEY=
# APIFY_TOKEN=
```

**Nota de segurança:** `.env` tá no `.gitignore` por padrão. Cron de backup pra GitHub **não inclui `.env`** (chaves não vão pro repo).

---

## Resumo de quem atualiza o quê

| Arquivo | Atualização automática (agente) | Atualização manual (aluno) |
|---|:-:|:-:|
| `USER.md` | nunca | sim, raro |
| `IDENTITY.md` | nunca | sim, raro |
| `SOUL.md` | sugere | sim, evolui com tempo |
| `AGENTS.md` | nunca | sim, raro |
| `MAPA.md` | sim, quando estrutura muda | sim, raro |
| `MEMORY.md` | sim, constante | raramente edita direto |
| `HEARTBEAT.md` | nunca | sim, raro (muda comportamento) |
| `.env` | só com confirmação dupla | sim, paste de chaves |

---

## Nota sobre `HEARTBEAT.md` vs `memory/hot.md`

Em versões anteriores do Starter Kit, `HEARTBEAT.md` funcionava como log de estado (última atividade, contexto quente, próximo passo natural). **Não é mais.** Esse papel passou pra `memory/hot.md`, que é auto-mantido pela skill `/salve` e pela pipeline de captura — concentra prioridades da semana, negociações ativas, decisões recentes, métricas-chave e prazos críticos.

A divisão fica assim:

- **`HEARTBEAT.md`** = COMO o agente vigia (config: frequência, checks, regras)
- **`memory/hot.md`** = O QUE o agente vigia (contexto: prioridades, prazos, pendências)

O heartbeat lê `hot.md` a cada poll pra decidir se age ou fica quieto. Não duplica memória.

---

## Princípios aplicados

- **Princípio 1 (backup antes):** todos os 8 arquivos têm backup antes de qualquer modificação
- **Princípio 2 (confirmação humana):** modificação de arquivo raiz exige confirmação
- **Princípio 6 (respeitar customização):** se aluno editou manualmente, agente detecta e não sobrescreve
- **Princípio 11 (detectar antes de pedir):** wizard checa se arquivo existe e tá preenchido antes de pedir input
- **Princípio 12 (mapas distribuídos):** ver [`sistema-de-mapas.md`](sistema-de-mapas.md)

---

*Última revisão: 02/05/2026*
