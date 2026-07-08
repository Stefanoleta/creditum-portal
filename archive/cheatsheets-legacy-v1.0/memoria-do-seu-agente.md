---
name: memoria-do-seu-agente
status: ATIVO
category: cheatsheet
referenced_by: [A7]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra memória do agente OpenClaw (A7). Cobre os 3 tipos de memória (boot · sessão · semântica) · MEMORY.md (auto-conhecimento estável) · memory/hot.md (contexto quente · alimenta heartbeat) · memory/YYYY-MM-DD.md (dailies) · /new vs /compact · Memory Flush 70% · 5 prompts prontos · comandos `openclaw memory` e `openclaw sessions` · troubleshooting profundo · princípios A10 (memória não vaza credencial · sessões antigas auto-purgam).
---

# Memória do seu agente — referência rápida (A7)

## Como usar este cheatsheet

**Caminho default — siga a aula A7** (linha de produção):

A7 entrega o A-ha #5 ("ele lembra de mim e das decisões") em 15min. Este cheatsheet é referência pós-aula pra fixar os 3 tipos de memória, comandos de higiene e princípio "salve antes de limpar". Use quando agente esquecer decisão antiga OU quando sessão estiver lenta.

**Caminho de plano B — comando direto** (use quando):
- Memória semântica retornou arquivo errado (índice desatualizado)
- Agente respondeu "não lembro" pra decisão que VOCÊ sabe que foi salva
- Sessão saturada e você precisa decidir entre `/new` vs `/compact`

## A7 em 1 minuto (resumo executivo)

Memória do agente = **3 tipos** trabalhando juntos + **3 arquivos canônicos** + **higiene de contexto**.

| Tipo | O que cobre | Quando ativa |
|------|-------------|--------------|
| **1. Padrão (boot)** | MEMORY.md + dailies 48h + MAPAs | Toda nova sessão · automático |
| **2. Sessão** | Chat atual no Telegram/Gateway | Enquanto você conversa · janela 200k tokens |
| **3. Semântica** | Busca por significado no workspace inteiro | Quando você pergunta · usa embeddings (API key A1) |

| Arquivo | Função | Quem mantém |
|---------|--------|-------------|
| **`MEMORY.md`** (raiz) | Auto-conhecimento estável (raramente muda) | Agente · auto-gerenciado |
| **`memory/hot.md`** | Contexto quente · estado do agora | Agente · auto-mantido (skill `/salve` empurra) |
| **`memory/YYYY-MM-DD.md`** | Dailies (sessões diárias · padrão OpenClaw) | Agente · purga após 14 dias |

> **Frase-mãe da A7:** *"Memória sem higiene = agente lerdo. Higiene sem memória = começar do zero todo dia. Os dois juntos = ele escala com você."*

## Os 3 tipos de memória — anatomia

### 1. Memória padrão (boot) — como ele acorda

Quando agente "acorda" numa nova sessão, ele **automaticamente**:

| O que faz | Detalhe |
|-----------|---------|
| Lê `MEMORY.md` | Long-term self-knowledge (raramente muda) |
| Lê `memory/hot.md` | Contexto quente · top prioridades · prazos críticos |
| Lê dailies de hoje + ontem | 48h de contexto (padrão OpenClaw) |
| Lê SOUL/IDENTITY/USER/AGENTS | Identidade (recap A5) |
| Carrega MAPAs do workspace | Sabe onde tá cada tipo de coisa (recap A6) |

**Resultado:** ele acorda já sabendo de tudo que tá rolando — não começa do zero.

### 2. Memória de sessão — chat atual

Janela de contexto da conversa em curso. Tem limite — **200k tokens com GPT-5.5** (~150 páginas de texto).

**Sintomas de saturação:**
- Agente lento (demora pra responder)
- Não responde (trava no meio · pula · retorna erro)
- Alucina (inventa contexto · mistura conversas)
- Perde contexto antigo (esquece o que foi falado há 30min)

**Causa comum:** muitos tópicos no Telegram com mesmo agente (regra A4: máximo 3-4 tópicos).

### 3. Memória semântica — busca por significado

Sistema mais poderoso. Auto-ativada com OpenAI API key da A1.

**Como funciona (alto nível):**
1. Agente roda embeddings de cada arquivo do workspace · guarda vetores
2. Você pergunta com significado (*"o que decidimos sobre X?"*) · agente vetoriza pergunta
3. Retorna arquivos com vetores próximos · sintetiza resposta com data + raciocínio

**Custo:**
- Indexação completa: centavos pra workspace típico (poucos MB de markdown)
- Busca individual: fração de centavo (1 query ≈ R$ 0,01-0,02)
- Reindexação: agente faz incremental (só arquivos modificados)

## Os 3 arquivos canônicos — anatomia detalhada

### MEMORY.md (raiz) — auto-conhecimento estável

Vive na raiz do workspace junto com SOUL/IDENTITY/USER/AGENTS. **Raramente muda.**

| Conteúdo típico | Exemplo |
|-----------------|---------|
| Auto-conhecimento durável | "Sou agente OpenClaw · workspace em ~/.openclaw/agents/<id>/" |
| Capacidades estáveis | "Acesso a Telegram · Gmail · Calendar · workspace · skills X/Y/Z" |
| Limites estruturais | "Não acesso WhatsApp pessoal · não opera financeiro · cap mensal R$ 100" |
| Aprendizados duráveis | "Bruno prefere prosa > listas · sem emoji · números específicos" |

**Quem atualiza:** agente, em rotinas de memory maintenance (heartbeat a cada 3 dias extrai aprendizados de hot.md pra MEMORY.md).

### memory/hot.md — contexto quente (alimenta heartbeat)

A "tela inicial" do agente. Snapshot do que importa **agora**, atualizado o tempo todo.

| Conteúdo típico | Exemplo |
|-----------------|---------|
| Top prioridades da semana | 3-5 itens que precisam atenção real |
| Negociações ativas | Quem tá pendurado · último toque · próximo passo |
| Decisões recentes | O que foi fechado nos últimos 7-14 dias |
| Métricas-chave | Números do mês que importam (receita · alunos · eventos) |
| Prazos críticos | Eventos com data próxima que não podem passar |

**Quem mantém:**
- Auto-gerenciado pelo agente no fluxo normal
- Skill `/salve` (cola final de sessão) empurra atualização explícita
- Você NÃO escreve `hot.md` à mão

**2 funções:**
1. **Boot context** — toda nova sessão, agente lê hot.md junto com MEMORY.md e dailies
2. **Combustível do heartbeat (A9)** — heartbeat consulta hot.md a cada batida pra decidir o que vigiar

> **Distinção crítica (recap A5):** `HEARTBEAT.md` (raiz) = config do mecanismo (poll · quiet hours · checks). `memory/hot.md` = contexto que o mecanismo consulta. HEARTBEAT.md = COMO ele vigia. hot.md = O QUE ele vigia.

### memory/YYYY-MM-DD.md — dailies (padrão OpenClaw)

Daily notes soltas na raiz de `memory/` (não em `sessions/` — recap A6).

| Detalhe | Especificação |
|---------|---------------|
| Path | `memory/2026-05-02.md` (1 arquivo por dia) |
| Quando agente escreve | Ao longo da conversa · final do dia · quando você pede |
| Conteúdo | Decisões · calls · pendências · contexto novo · resultados de tarefas |
| Formato | Bullet points + timestamp · não enche linguiça |
| Quem lê depois | Próprio agente no boot do dia seguinte (48h) · você quando consulta |
| Purga | Após 14 dias, vai pra `archive/YYYY-MM/` (recap A6) |

## /new vs /compact — quando usar cada

| Comando | Quando usar | O que faz |
|---------|-------------|-----------|
| **`/new`** | Mudou de assunto · sessão saturada · contexto contaminado | Limpa contexto inteiro · começa zero · boot reconstrói (MEMORY + hot + dailies 48h + MAPAs) |
| **`/compact`** | Sessão grande mas conversa ainda relevante · não quer perder fio | Comprime histórico mantendo essência · `/compact Focus on [tema]` mantém foco específico |
| **`/reset`** | Sinônimo de `/new` | Idem |
| **`/status`** | Diagnóstico · sentir lentidão · validar uso | Mostra uso de contexto · sessão atual · modelo ativo |
| **`/new <model>`** | Trocar modelo na nova (bônus OpenClaw) | Nova sessão + modelo override (ex: `/new gpt-5.5`) |

> **Princípio absoluto (recap A0):** *"Salve antes de limpar."* Memory Flush automático ajuda mas não é 100% (~70% de confiabilidade real).

## Memory Flush — feature nativa

Antes da compactação automática disparar, agente faz um **"silent memory flush"** — tenta salvar nas pastas certas antes de comprimir.

**Confiabilidade real (estimativa Bruno):** ~**70%** das vezes funciona limpo. Compactação às vezes mata o salvamento — token budget acaba antes do flush completar.

**Implicação:** você ajuda salvando manual quando o assunto importa. Não confia 100% no flush automático.

## Heartbeat memory maintenance

A cada **3 dias**, agente roda rotina de extração:

1. Lê `memory/hot.md` (contexto quente acumulado nos últimos dias)
2. Identifica aprendizados duráveis (não conjunturais)
3. Promove pra `MEMORY.md` (auto-conhecimento estável)
4. `hot.md` continua atualizado com o que ainda é quente

**Exemplo concreto:** Bruno disse 3x na última semana "prefiro prosa > listas". Heartbeat detecta padrão → adiciona em MEMORY.md como preferência durável → agente para de usar bullets sem necessidade. Ciclo se completa.

## 5 prompts prontos pra colar

### 1. Atualizar MEMORY.md com auto-conhecimento (pós-rodada de aprendizado)

Cola depois de uma sessão produtiva onde você corrigiu o agente várias vezes:

```
Lê seu MEMORY.md atual.

Nas últimas [X dias / Y sessões] eu te corrigi sobre [tema/padrão]:
- [Correção 1: ex "use prosa, não bullets desnecessários"]
- [Correção 2: ex "número específico, não arredondado"]
- [Correção 3: ex "sem emoji a menos que eu peça"]

Promove os aprendizados DURÁVEIS pra MEMORY.md (não conjunturais).
Mantém hot.md com o que ainda é contexto quente da semana.

Mostra diff antes de salvar. NÃO mexe em SOUL.md (essas correções
são auto-conhecimento, não mudança de persona).

Princípio: MEMORY.md é estável · hot.md é volátil · dailies são
cronológicas. Cada coisa no seu lugar.
```

### 2. Limpar memory/ antiga (sessões 14+ dias)

Cola 1x por mês — audit de dailies (complementa workspace audit do A6):

```
Roda cleanup de memory/:

1. Lista dailies (memory/YYYY-MM-DD.md) com mais de 14 dias
2. Para cada uma, faz scan rápido:
   - Tem decisão importante que NÃO foi salva em context/decisoes/?
   - Tem pendência que ainda tá aberta e NÃO está em pendencias.md?
   - Tem contexto sobre pessoa que NÃO está em context/people/{nome}.md?
3. Se houver lacuna, propõe salvar antes de arquivar
4. Move dailies pra archive/YYYY-MM/ depois de garantir que nada
   crítico vai sumir

Me devolve plano em lista. Eu aprovo em massa.
Princípio: archive em vez de delete. Sempre.
```

### 3. Investigar "por que ele esqueceu de X?" (debug de memória)

Cola quando agente respondeu "não lembro" pra algo que você sabe que foi salvo:

```
Investiga por que você esqueceu de [DECISÃO / CONTEXTO específico].

Diagnóstico em ordem:

1. Roda busca semântica: openclaw memory search "[query do tema]"
   - Algum arquivo retornou? Se sim, por que não usou na resposta?
2. Lê hot.md atual:
   - Tema aparece em hot.md? Se não, por que saiu?
3. Lê MEMORY.md:
   - Tema deveria estar aqui (durável) e não tá?
4. Olha dailies dos últimos 14 dias:
   - Decisão tá registrada em alguma daily?
5. Olha archive/:
   - Foi arquivado e índice desatualizado?

Me devolve diagnóstico em tabela.
Propõe ação corretiva (reindex · refazer hot · salvar manual).
NÃO faz nada antes de eu validar diagnóstico.

Princípio "salve antes de limpar" foi violado em algum momento?
```

### 4. Reindexar memória semântica após mudança grande

Cola quando você acabou de mover muitos arquivos manualmente OU mudou estrutura de pasta:

```
Acabei de [MUDANÇA: ex "mover 50 arquivos de people/ pra people/old/",
"reorganizar context/business/", "arquivar 30 projetos antigos"].

Memória semântica precisa reindexar pra refletir nova estrutura.
Roda em ordem:

1. openclaw memory status
   - Mostra estado atual do índice (# de arquivos · última atualização)
2. openclaw memory index --force
   - Força reindexação completa do workspace
   - Custa centavos · tempo: ~2-5min em workspace típico
3. Valida: openclaw memory search "[query teste]"
   - Confirma que arquivos novos aparecem
   - Confirma que arquivos movidos/arquivados não aparecem onde não devem
4. Atualiza MAPAs afetados pela mudança (recap workspace-do-seu-agente.md)

Me reporta antes/depois do índice.
NÃO roda --force se workspace tá quebrado (corrige estrutura primeiro).
```

### 5. Memory maintenance manual: extrai aprendizados de hot.md pra MEMORY.md

Cola quando heartbeat (a cada 3 dias) ainda não rodou e você quer empurrar manual:

```
Faz memory maintenance manual (heartbeat antecipado):

1. Lê memory/hot.md atual
2. Identifica padrões DURÁVEIS (não conjunturais):
   - Preferências repetidas (tom, formato, cadência)
   - Restrições que valem sempre (não só pra projeto X)
   - Capacidades aprendidas (skills que você usa bem)
   - Limites descobertos (coisas que não funcionam)
3. Promove pra MEMORY.md sob seção "Aprendizados duráveis"
4. Limpa de hot.md o que virou MEMORY (não duplica)
5. Mantém hot.md com o que ainda é quente da semana

Mostra diff de MEMORY.md e hot.md antes de salvar.

Princípio: hot é volátil · MEMORY é durável · dailies são cronologia.
Cada coisa no seu lugar.

Recap A9: heartbeat roda automático a cada 3 dias. Esse prompt é
pra quando você quer antecipar (ex: pós-rodada produtiva).
```

## Comandos `openclaw memory` e `openclaw sessions` (validados na doc oficial)

### Memória semântica

| Comando | Pra que serve |
|---------|---------------|
| `openclaw memory status` | Estado do índice · # de arquivos · última atualização |
| `openclaw memory search "<query>"` | Busca semântica · retorna arquivos ranqueados por proximidade |
| `openclaw memory index --force` | Reindexar workspace inteiro · custa centavos · use após mudança manual grande |

### Higiene de sessão

| Comando | Pra que serve |
|---------|---------------|
| `/new` (no chat) | Nova sessão limpa · boot reconstrói contexto |
| `/new <model>` | Nova sessão trocando modelo (bônus OpenClaw, ex: `/new gpt-5.5`) |
| `/reset` (no chat) | Sinônimo de `/new` |
| `/compact` (no chat) | Compacta contexto mantendo essência |
| `/compact Focus on [tema]` | Compacta com foco em tema específico |
| `/status` (no chat) | Mostra uso de contexto · sessão atual · modelo ativo |

### Limpeza Tier 2 (terminal)

| Comando | Pra que serve |
|---------|---------------|
| `openclaw sessions cleanup` | Lista sessões antigas + transcripts órfãos · dry-run |
| `openclaw sessions cleanup --enforce` | Aplica limpeza · reduz tamanho do session store |

> **Path do session store:** `~/.openclaw/agents/<agentId>/sessions/`. Cada tópico do Telegram vira `<sessionId>-topic-<threadId>.jsonl`.

## Troubleshooting profundo

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Memória semântica não acha nada | API key da A1 não configurada · embeddings não rodam | Volta A1 Fase A · valida com `openclaw memory status` |
| Busca semântica retorna arquivo errado | Índice desatualizado após muitas mudanças manuais | `openclaw memory index --force` (custa centavos) |
| Agente respondeu "não lembro" pra decisão antiga | Decisão não foi salva (Memory Flush 70% — falhou) | Princípio: "salve antes de limpar". No futuro, salva manual quando importa |
| Agente lento · alucinando · perdendo contexto | Sessão saturada (perto de 200k tokens) | `/status` · salva importante · `/new` |
| `/compact` deu erro / travou | Auto-compaction já tinha rodado · contexto inconsistente | `/new` direto · começa sessão limpa |
| Daily notes não aparecem | Estavam em `memory/sessions/` em vez de raiz | "migra dailies pra raiz de memory/, padrão OpenClaw" |
| `sessions.json` enorme | Acumulou muitos tópicos no Telegram | `openclaw sessions cleanup --enforce` + reduz tópicos (regra A4) |
| Boot não carrega contexto | MEMORY.md vazio (kit A3 não rodou completo) | Volta A3 · roda CHECKLIST · MEMORY.md popula com auto-conhecimento |
| Esqueci de salvar antes de `/new` | Princípio "salve antes de limpar" não respeitado | Snapshot automático (A2) tem rede de segurança · pede pro agente recuperar via semântica |
| MEMORY.md vazio | Kit não rodou completo OU agente nunca rodou heartbeat maintenance | Roda Prompt #5 (memory maintenance manual) · ou refaz CHECKLIST do A3 |
| hot.md inflado (200+ linhas) | Não rotaciona · vira lixeira de tudo | Pede agente: "rotaciona hot.md · promove aprendizado durável pra MEMORY · limpa o que não é mais quente" |
| Embeddings não indexados após criar arquivo | Index ainda não rodou (incremental tem delay) | Aguarda 5-10min · ou força com `openclaw memory index --force` |
| Context rot (agente confuso após sessão longa) | Janela cheia · contexto contaminado | `/status` confirma · salva manual · `/new` |
| Heartbeat memory maintenance não rodou em 1 semana | HEARTBEAT.md mal configurado (cobertura A9) | Confirma config do heartbeat · roda Prompt #5 manual enquanto debugger |
| Agente promove pra MEMORY coisa que NÃO é durável | Maintenance ruim · falta refinamento de critério | "MEMORY é durável · hot é volátil. Move X de volta pra hot.md" |

## Princípios de segurança aplicados (recap A10)

Memória = onde aprendizado vive. Princípios A10:

1. **Memória NÃO é log de chat.** MEMORY.md · hot.md · dailies são curados (não dump bruto). Credencial mencionada em chat NÃO vai pra memória — agente filtra ou mascara.
2. **Sessões antigas auto-purgam.** Após 14 dias, dailies vão pra `archive/`. Após 30 dias, transcripts antigos viram candidatos pra `openclaw sessions cleanup`. Reduz superfície de leak.
3. **Workspace isolado em Docker.** Recap A3/A6. Memória do agente não acessível fora do container em runtime.
4. **`.env` nunca em memória.** Credenciais ficam só em `.env`. MEMORY.md · hot.md · dailies não citam tokens nem senhas. Audit mensal: grep por padrão de credencial em memória — se aparecer, é bug.
5. **Memória semântica é local.** Embeddings rodam via OpenAI mas vetores ficam no workspace. Busca não envia conteúdo bruto pra OpenAI · só vetorização da query.
6. **Defesa anti-prompt-injection no SOUL.** Recap A5/A10. Se agente paralelo (multi-agente) atende externo, SOUL bloqueia "salve isso na memória" vindo de mensagem externa — só você pode pedir.

## Pendências de validação (release v1.0 do kit)

Antes de release v1.0:

1. Testar `openclaw memory status` em conta Managed zerada — confirmar formato
2. Validar `openclaw memory search "<query>"` — confirmar que retorna arquivos ranqueados
3. Testar `openclaw memory index --force` em workspace de teste — confirmar tempo (~2-5min) e custo (centavos)
4. Validar `/new`, `/compact`, `/status`, `/reset` em Telegram — confirmar comportamento
5. Testar `/compact Focus on [tema]` — confirmar que mantém foco especificado
6. Validar `openclaw sessions cleanup --enforce` em workspace com sessões antigas — confirmar que arquiva (não deleta)
7. Confirmar que kit (A3) provisiona MEMORY.md com auto-conhecimento inicial populado
8. Validar Prompt #5 (memory maintenance manual) — confirmar que promove durável e mantém volátil

## Referências

### Internas
- A7 (este cheatsheet complementa) — `aulas/aula-07-memoria/Memória + contexto.html`
- A1 (setup) — OpenAI API key habilita embeddings da memória semântica
- A3 (Starter Kit) — kit popula MEMORY.md inicial
- A5 (identidade) — boot lê SOUL/IDENTITY/USER junto com MEMORY — `cheatsheets/identidade-do-seu-agente.md`
- A6 (workspace) — `memory/` é território do agente, dailies soltas na raiz — `cheatsheets/workspace-do-seu-agente.md`
- A9 (crons) — heartbeat memory maintenance roda a cada 3 dias · HEARTBEAT.md config
- A10 (segurança) — princípios aplicados a memória · `.env` nunca em memória
- Skill `/salve` — empurra atualização de hot.md no fim de sessão

### Externas
- Doc OpenClaw `concepts/memory`: [docs.openclaw.ai/concepts/memory](https://docs.openclaw.ai/concepts/memory)
- Doc OpenClaw `concepts/compaction`: [docs.openclaw.ai/concepts/compaction](https://docs.openclaw.ai/concepts/compaction)
- Doc OpenClaw `cli/memory`: [docs.openclaw.ai/cli/memory](https://docs.openclaw.ai/cli/memory)
- Doc OpenClaw `cli/sessions`: [docs.openclaw.ai/cli/sessions](https://docs.openclaw.ai/cli/sessions)
- Doc OpenClaw `reference/MEMORY.default`: [docs.openclaw.ai/reference/MEMORY.default](https://docs.openclaw.ai/reference/MEMORY.default)

---

> **Frase-mãe da A7:** *"Memória sem higiene = agente lerdo. Higiene sem memória = começar do zero todo dia. Os dois juntos = ele escala com você."* 3 tipos (padrão · sessão · semântica) · Memory Flush 70% (não confiar 100%) · `/compact` `/new` `/status` nativos · comando natural · *"salve antes de limpar"*. Próxima referência: `multi-agente.md` (A13).
