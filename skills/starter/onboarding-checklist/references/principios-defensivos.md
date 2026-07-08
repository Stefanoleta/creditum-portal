# Princípios Defensivos Universais

> Regras de segurança herdadas por TODAS as skills do starter (não só `onboarding-checklist`).
> Quando criar wizard novo, copiar este arquivo como referência cruzada.

---

## Princípio 1 — Nunca sobrescrever sem backup + confirmação

**Regra:** Antes de modificar QUALQUER arquivo que já existe (raiz ou não), seguir 3 passos obrigatórios:

1. **Detectar** se o arquivo existe
2. **Backup** timestamped em `~/backups/pre-{wizard_name}-{YYYY-MM-DD-HHMM}/`
3. **Confirmação** explícita do aluno antes de aplicar mudança

### Exemplo correto

```
"Detectei que você já tem USER.md preenchido. Antes de mexer:

1. Vou fazer backup do atual em ~/backups/pre-wizard-aluno-2026-05-02-1430/
2. Mostro pra você o que vou MUDAR (em forma de diff)
3. Você aprova ou ajusta antes de eu aplicar

Confirma?"
```

### Exemplo INCORRETO (não fazer)

```
"Vou atualizar seu USER.md com as informações novas..."
[modifica direto sem backup nem confirmação]
```

### Exceções

- Arquivos efêmeros que aluno espera ser sobrescritos (logs, caches): pode escrever direto
- Backup automático de cron (`/cron-state.json`, etc): não precisa confirmação humana

---

## Princípio 2 — Confirmação humana em ações de modificação

**Regra:** Sempre pedir confirmação antes de:

- Modificar `.env`
- Executar comando de sistema (criar pasta, mover arquivo, instalar pacote)
- Criar arquivo persistente novo (template, skill, doc)
- Conectar/desconectar integração externa (OAuth, API, webhook)
- Configurar cron novo

**Exceção:** ações de leitura (read-only) não precisam de confirmação.

**Padrão:** "Vou fazer X. Confirma?" → espera aluno responder "sim" / "vai" / "confirma" / "pode" / similar.

---

## Princípio 3 — Comandos de elevação de privilégio NUNCA via agente

**Regra:** O agente NUNCA executa silenciosamente comandos que mudam:

- `exec-policy` (yolo, ask, reset)
- `/elevated full` ou `/elevated on` (modo elevated por sessão)
- Sudo/root no host
- Permissões de arquivo críticas (`chmod 777` em pasta sistema)

**Por quê:** design de segurança do OpenClaw Managed. O agente não pode escalar próprias permissões — isso protege contra agente comprometido.

**Padrão correto:** instruir o aluno a colar o comando no terminal manualmente:

```
"Pra liberar autonomia, cola isto no SEU TERMINAL do Managed:

  openclaw exec-policy preset yolo

Quando rodar, manda 'liberado' aqui."
```

---

## Princípio 4 — Modo guiado: SEMPRE narrar antes de executar

**Regra:** Em todas as skills do starter, narrar a ação ANTES de fazer. Não executar silencioso e mostrar resultado.

### Exemplo correto

```
"Agora vou criar o USER.md no seu workspace. Vai ter:
- Seu nome: Carlos
- Sua área: padaria pequena
- Seu tom preferido: direto

Confirma que pode criar?"

[aluno: "vai"]

"✓ Criado: /workspace/USER.md (412 bytes)"
```

### Exemplo INCORRETO

```
[cria USER.md silenciosamente]
"Pronto."
```

**Por quê:** o premium do kit é o agente VIRAR TUTOR. Tutor explica enquanto faz. Sem narração, vira ferramenta cega.

---

## Princípio 5 — Atualização de MEMORY.md ao concluir cada passo

**Regra:** Sempre que um wizard completa seu fluxo, marcar a flag correspondente em `MEMORY.md`:

| Passo | Flag |
|---|---|
| 0 | `whisper_configured=true` |
| 1 | `agente_configured=true` |
| 2 | `aluno_configured=true` |
| 3 | `autonomia_liberada=true` |
| 4 | `workspace_organizado=true` |
| 5 | `conectado=true` |
| 6 | `first_win_completed=true` |

Além disso, atualizar `onboarding_current_step` pra `N+1`.

**Por quê:** sem essas flags, a `onboarding-checklist` não sabe o que já foi feito ao reativar/voltar.

---

## Princípio 6 — Detectar e respeitar customização manual

**Regra:** Se aluno editou manualmente um arquivo entre execuções de wizard, NÃO sobrescrever silenciosamente.

### Exemplo

Aluno fez passo 1 (cria IDENTITY.md). Depois editou manualmente IDENTITY.md mudando o tom. Mais tarde manda "volta no 1" pra refazer.

**Comportamento incorreto:**
- Detectar IDENTITY.md, sobrescrever com versão nova baseada na entrevista. Aluno perde o que editou.

**Comportamento correto:**
- Detectar IDENTITY.md
- Detectar que o conteúdo difere do template original (sinal de edição manual)
- Avisar: "Detectei que você editou IDENTITY.md manualmente. Quer (a) preservar suas edições e modificar só o que pedir, ou (b) refazer do zero (com backup do atual)?"

---

## Princípio 7 — Em dúvida, perguntar

**Regra:** Quando o agente não tem certeza do que o aluno quer, **perguntar é sempre melhor que assumir**.

### Casos comuns

- Aluno mandou comando ambíguo ("muda isso") — perguntar "muda o quê especificamente?"
- Aluno responde algo que pode ser interpretado de 2 formas — perguntar pela interpretação correta
- Aluno pediu pra fazer algo que conflita com decisão anterior — confirmar prioridade

**NÃO usar:** "imagino que você quer X, vou fazer assim". Tentar adivinhar = erro caro.

---

## Princípio 8 — Logging de decisões em MEMORY.md

**Regra:** Toda escolha relevante do aluno deve virar entrada em `MEMORY.md` na seção "decisoes":

```
## Decisões da jornada de onboarding

- 2026-05-02: Aluno escolheu pular passo 0 (Whisper) — vai configurar depois
- 2026-05-02: Aluno escolheu nome "Atlas" pro agente
- 2026-05-02: Aluno autorizou exec-policy yolo
- 2026-05-02: Aluno conectou Brave Search + OpenAI + GitHub. Pulou Apify e Perplexity.
```

**Por quê:** se aluno volta dias depois, o agente precisa ler isso pra entender contexto sem fazer entrevista de novo.

---

## Princípio 9 — Se algo der errado, PARAR

**Regra:** Quando wizard falha em algum passo crítico, NÃO continuar empurrando. Parar, reportar estado, perguntar.

### Exemplo

```
"Tentei criar USER.md mas deu erro de permissão. Aqui o erro:

  /workspace/USER.md: Permission denied

Tô pausando o wizard aqui. Possíveis causas:
- Workspace não tem permissão de escrita
- Você editou USER.md em outro lugar e ficou travado
- Bug do Managed (raro)

O que você quer fazer:
a) Eu te ajudo a debugar (rodo diagnose)
b) Você verifica manualmente e me avisa
c) Pula esse passo por enquanto e volta depois"
```

**NÃO usar:** "tive um problema, vou tentar de novo" sem investigar a causa.

---

## Princípio 10 — Backup global antes de mudanças massivas

**Regra:** Antes de qualquer wizard que modifica MAIS DE UM arquivo persistente, fazer backup global do workspace inteiro:

```bash
tar -czf ~/backups/pre-wizard-{nome}-{timestamp}.tar.gz [PATH_WORKSPACE]
```

**Quando aplica:**
- Wizard de migração v1 → v2 (Fase 0.5 do prompt-upgrade)
- Wizard que reorganiza workspace (passo 4)
- Wizard de instalação de skills múltiplas (caso futuro)

**Quando NÃO aplica:**
- Wizard que cria 1 arquivo só (princípio 1 já cobre)
- Wizard read-only

---

## Princípio 11 — Detectar antes de pedir

**Regra:** Todo wizard começa **detectando o estado atual** antes de pedir input ou executar passo. Aluno pode ter feito parte do trabalho na aula do curso, em sessão anterior, ou manualmente.

Detectar e respeitar é diferente de assumir e pular: mesmo que a detecção mostre que está pronto, **avisar o aluno** que pulou (ex: "✓ Achei sua chave Brave já configurada, validei, tá funcionando — segui sem pedir nada").

### Padrão de detecção em 3 estados

Cada wizard começa com este check:

| Estado detectado | Ação |
|---|---|
| **100% pronto** | Validar que funciona, marcar passo como `[x]` com nota "já estava configurado", seguir |
| **Parcial** | Fazer só o que falta, narrar o que pulou e o que vai fazer |
| **Nada feito** | Executar wizard inteiro normalmente |

### P11 forte ao detectar `wizard_resume_step` (kit v2.5 — fix Mira retomada)

⚠️ **NOVO em v2.5:** quando wizard é despachado E `wizard_resume_step` em MEMORY aponta pra ele (ex: `wizard_resume_step: wizard-autonomia.passo3`), wizard DEVE aplicar P11 com **agressividade extra** — assumir que aluno já passou por partes do fluxo e detectar estado real ANTES de mostrar copy de promessa.

**Padrão:**

1. **Detecção primeiro, narração depois.** Se `wizard_resume_step` setado, rode TODOS os checks de P11 do wizard (validações de chave, comandos shell read-only, leitura de arquivos raiz) ANTES de qualquer mensagem ao aluno
2. **Sumarize estado parcial em UMA mensagem.** Em vez de "Vamos configurar X em 4min..." (copy de promessa do passo 1, redundante pra aluno que voltou), use:

```
"Voltamos pra fechar {nome_wizard_natural}. Detectei que:
- {item 1: ✓ já feito | ⏳ falta}
- {item 2: ✓ já feito | ⏳ falta}
- {item 3: ✓ já feito | ⏳ falta}

Próximo: {única coisa que falta}. Bora?"
```

3. **NÃO repetir narração de promessa**. Se wizard tem passo "Narrar o que vai acontecer" no início, esse passo é PULADO quando `wizard_resume_step` setado (aluno já ouviu).
4. **Quando wizard conclui retomada**, MEMORY zera `wizard_resume_*` (ou `continuar-jornada` zera ANTES do dispatch — implementação a ser decidida por wizard).

**Exemplo concreto — wizard-autonomia retomando passo 3 após 4 dias:**

❌ Comportamento ANTIGO (kit v2.4 e anterior):
- Despacha wizard-autonomia
- Wizard começa pelo passo 1 ("Vou liberar autonomia. Em 6min você sai daqui podendo me deixar trabalhar sozinho. Vou:..."). Aluno ouve copy completa de novo.
- Aí vai pro passo 2 (P11 — `openclaw exec-policy show` retorna `ask`). OK.
- Aí vai pro passo 3 (instruir colar comando).

✅ Comportamento v2.5:
- Despacha wizard-autonomia COM contexto `wizard_resume_step: wizard-autonomia.passo3`
- Wizard pula passo 1 (narração).
- Roda P11 imediato: `openclaw exec-policy show` → `ask`.
- Mensagem ao aluno (P15 canonical):
```
"Voltamos pra fechar autonomia. Você tinha pausado antes de colar o comando no terminal. Detectei: exec-policy ainda em `ask` (não yolo). Falta só colar o comando. Bora?"
```
- Aluno responde. Wizard segue do passo 3.

**Wizards aplicáveis (todos retomáveis):**
- `wizard-whisper-quick` (`passo0` raramente — fluxo é fast)
- `wizard-agente` (passos 2/3/4/5 — perguntas)
- `wizard-aluno` (similar)
- `wizard-autonomia` (`passo3` — caso Mira)
- `wizard-workspace` (passos de criação)
- `wizard-conectar` (passos por chave: brave/github/chromium)
- `primeira-vitoria` (passo de geração — raramente pausável)

**Falhas que isso PREVINE (caso real Mira stress test):**

1. Mira retoma após 4 dias. wizard-autonomia v1.5 começa do passo 1 (copy completa de promessa). Mira já ouviu isso 4 dias atrás — sente que kit "esqueceu" dela.
2. Aluno em qualquer wizard retomando após pause longa fica perdido em narração de promessa quando só precisava da próxima ação concreta.

**Princípio 11 vs P11 forte:** Princípio 11 já manda detectar antes de pedir. P11 forte é a aplicação ESPECÍFICA quando há flag `wizard_resume_step` ativa — passa a sumarizar estado em vez de re-narrar wizard inteiro.

### O que cada wizard deve detectar

| Wizard | O que detectar | Como |
|---|---|---|
| `wizard-whisper-quick` | Chave OpenAI no `.env` válida | Lê `.env`, faz call teste à API |
| `wizard-agente` | `IDENTITY.md` + `SOUL.md` + `AGENTS.md` preenchidos | Existe + tem campos preenchidos |
| `wizard-aluno` | `USER.md` preenchido | Existe + tem campo `nome` preenchido |
| `wizard-autonomia` | exec-policy yolo | `openclaw exec-policy show` |
| `wizard-workspace` | `MAPA.md` preenchido + estrutura de pastas padrão | Existe + tem conteúdo |
| `wizard-conectar` | Chaves Brave/GitHub/etc no `.env`, todas válidas | Lê cada uma, valida individualmente |
| `primeira-vitoria` | Existe arquivo `content/drafts/primeira-vitoria-*.md` | Glob no path |

### Mensagem padrão "achei já pronto"

Quando detecta 100% pronto:

```
"✓ Detectei que {coisa} já está configurada.
 Validei rapidinho — {evidência: ex: 'busca de teste no Brave funcionou'}.
 Não precisa fazer nada nesse passo. Marquei como feito."
```

Quando detecta parcial:

```
"Achei parte do passo já feito:
 ✓ {item já pronto}
 ⏳ {item que falta}
 Vou completar só o que falta. Não vou mexer no que você já configurou."
```

### Por que isso importa

- **Reduz fricção drasticamente** — aluno que seguiu o curso não precisa refazer setup
- **Cria sensação de "agente que te conhece"** — não pede o que já sabe
- **Cobre cenários de retomada** — aluno pausa e volta, agente lembra
- **Resolve cenário "workspace parcial"** automaticamente — fase zero da onboarding-checklist não precisa tratar caso especial

### Aplicação especial: ".env first" (credenciais)

**Toda skill que precisa de credencial (API key, token, OAuth) segue este padrão:**

1. **Tenta ler do `.env` primeiro** (Princípio 11)
2. **Se achou e funciona:** usa direto, marca como pronto, narra "✓ Achei chave X no .env, validei, funcionando"
3. **Se achou mas inválida:** explica o erro específico (revogada, expirada, sintaxe) e pede nova chave
4. **Se não achou:** pede ao aluno (UMA vez só, nunca repete na mesma sessão)
5. **Salva no formato padronizado** no `.env` com nome canônico (ex: `BRAVE_SEARCH_API_KEY`, não `brave-key` ou `BRAVE_TOKEN`)
6. **Próxima vez já encontra sozinho** — não pede de novo

**Por quê é universal:** aluno fornece chave UMA vez na vida. Skill que pede de novo é skill quebrada. `.env` é fonte canônica única.

**Aplica imediatamente em:** `wizard-whisper-quick`, `wizard-conectar`, `backup-workspace-github`, `wizard-whatsapp`, qualquer skill futura com credencial.

**Nomes padronizados pro `.env`:**

```bash
OPENAI_API_KEY=sk-proj-xxx          # Whisper + embeddings + image
OPENAI_OAUTH_TOKEN=managed-by-openclaw  # ChatGPT Plus
BRAVE_SEARCH_API_KEY=BSAk-xxx
GITHUB_TOKEN=ghp_xxx
PERPLEXITY_API_KEY=pplx-xxx
APIFY_TOKEN=apify_api_xxx
NOTION_TOKEN=secret_xxx
```

Skill nova que precisa de credencial: registra nome padronizado aqui. Não inventa formato próprio.

### Aplicação especial v2.1: detecção de AMBIENTE e OS antes de instruir

⚠️ **Adicionado em v2.1 do kit (Bruno feedback):** Detectar antes de pedir vai além de "credencial existe?". Vale também pra **plataforma** e **gerenciador de pacotes** quando wizard precisa instruir aluno a rodar comando.

**Tipos de detecção que devem rolar antes de qualquer instrução técnica:**

| Detecção | Como detectar | Onde aplicar |
|---|---|---|
| **Ambiente OpenClaw** | Sinais: workspace em `~/.openclaw/` (Managed) vs `/root/.openclaw/` (VPS root); aluno mencionou "Hostinger"/"painel" vs "VPS"/"SSH" | `wizard-autonomia` (CLI Hostinger vs SSH); `wizard-conectar` (cron-worker vs systemd) |
| **Sistema operacional** | `uname -s` ou `OSTYPE`; `/etc/debian_version`, `/etc/redhat-release`, `/etc/os-release` | `wizard-conectar` (gh install: brew vs apt vs dnf); qualquer skill que mande aluno instalar coisa |
| **Gerenciador de pacotes disponível** | `which brew`, `which apt`, `which dnf`, `which yum` | Antes de mandar `brew install X` cego — verificar se existe |
| **Skill já instalada no agente** | Listar skills disponíveis pro agente atual; checar se nome esperado está | Antes de invocar uma skill que assume disponibilidade (caso real: github skill em VPS) |

**Salva flag em `MEMORY.md`:**
```yaml
ambiente: managed | vps-root | local-dev
os: macos | debian | ubuntu | rhel | other
package_manager: brew | apt | dnf | yum | other | none
```

**Padrão pra mapeamento `OS → comando`:**

```bash
# Exemplo: instalar gh CLI
case "$os" in
  macos)  CMD="brew install gh" ;;
  debian) CMD="https://github.com/cli/cli/blob/trunk/docs/install_linux.md  # apt + repo oficial" ;;
  rhel)   CMD="dnf install gh" ;;
  *)      CMD="manual"; INSTRUCOES="link da doc + caminho de fallback" ;;
esac
```

**Falhas típicas que isso PREVINE (5 reportadas em escala v1.x):**
1. `wizard-autonomia` mostrava CLI Hostinger pra VPS root (não tem painel) — fix v1.9.1
2. `wizard-conectar` rodava `brew install gh` em Ubuntu (sem brew) — falha silenciosa
3. `wizard-conectar` assumia GitHub skill instalada em VPS (não vem) — falha silenciosa
4. (futuro) wizard-X assumindo Linux quando aluno tá em macOS/Windows
5. (futuro) skill esperando `gh` quando aluno não tem

---

## Princípio 13 — Wizards são GUARD RAILS (passo bloqueante, retorna em desvio)

⚠️ **NOVO em v2.1.** Adicionado depois de feedback consolidado de múltiplos alunos: agentes saem do passo no meio do wizard, improvisam, ou fogem quando aluno desvia. Wizard precisa ser **passo bloqueante** — só sai se aluno completar OU mandar comando canônico.

⚠️ **ESTENDIDO em kit v2.4** — adicionada categoria **(c3) Mensagem mista** após stress test Pedro. Caso real Bruno: aluno mid-wizard manda `"renomear todas pra português? E que hora roda backup?"` — 2 perguntas distintas em 1 mensagem. P13 antigo só categorizava mensagem singular. Agente respondia as 2 longamente e perdia foco do passo. Aplica também a casos `(a)+(c2)` (resposta parcial ao passo + desvio de tópico).

**Regra:** quando um wizard está ativo (`active_wizard:` setado em `MEMORY.md`), TODA mensagem do aluno é classificada em **5 tipos**:

| Tipo | Exemplo | Ação |
|---|---|---|
| **(a) Resposta direta ao passo** | "Tina" pra "qual nome?" | Processa, avança pro próximo passo |
| **(b) Comando canônico de escape** | `cancela`, `pula`, `voltar 2`, `sobre`, `faq`, `ajuda`, `config`, `muda modo`, `corrige` | Honra (interrompe wizard se cancela; pula se pula; etc) |
| **(c1) Pergunta tangencial sobre o passo** | "isso é seguro?", "muda depois?", "?" (confusão) | Responde EM 1 LINHA + traz de volta ao passo |
| **(c2) Desvio total / outro tópico** | "como funciona memória semântica?", "queria configurar Google Calendar agora" | Anota em `## Perguntas pendentes` em MEMORY.md + traz de volta ao passo |
| **(c3) Mensagem mista** (kit v2.4) | "Tina, e quero conectar Google Calendar"; "renomeia pasta pra PT? E que hora backup?" | Processa APENAS a parte (a) que responde o passo, anota o resto em pendências, repete pergunta original |

**Padrão da mensagem de retorno (c2):**

```
"Anotado: {resumo do desvio} — vou abordar depois.
Mas pra fechar este passo, preciso que você {ação específica do passo atual}."
```

**Schema MEMORY.md pra suportar Guard Rail:**

```yaml
active_wizard: wizard-agente   # ou null se nenhum
active_step: 2                  # passo dentro do wizard
awaiting: agent_name            # o que o passo espera (free-text descritivo)
desvios_neste_passo: 0          # contador

## Perguntas pendentes (capturadas durante desvios c2)
- {data}: aluno perguntou: "{texto literal}" — abordar quando wizard X terminar
```

**Limite anti-loop:** após 3 desvios consecutivos no mesmo passo, agente oferece pausar:

```
"Você desviou algumas vezes desse passo. Quer:
 - Pausar e voltar depois (manda 'cancela')
 - Pular esse passo (manda 'pula')
 - Tentar de novo (responde a pergunta original)?"
```

**Comportamento bloqueante NÃO se aplica a:**
- `complete_active` (após primeira-vitoria) — aluno tá em modo conversa normal, comandos canônicos disponíveis mas não há "passo travado"
- `wizard_dismissed: true` — aluno explicitamente saiu

**Casos especiais de classificação:**

- **Aluno corrige resposta anterior** ("espera, é Bruno, sem 2 n's"): trata como `corrige` canônico — backtrack 1 passo, edita, segue
- **Aluno responde parcial** (pediu 3 itens, mandou 1): aceita o item, completa o que falta. NÃO força resposta total
- **Aluno menciona algo de outro passo** ("Tina, e quero Google Calendar"): processa nome (avança), anota Google Calendar como pendência pro `wizard-conectar`

### (c3) Mensagem mista — padrão canonical (kit v2.4)

Quando aluno manda 1 mensagem com **resposta parcial ao passo + desvio adicional** OU **múltiplas perguntas distintas**:

**Algoritmo:**

1. Identificar a parte (a) que responde o passo atual
2. Processar essa parte (avançar normalmente)
3. Anotar TUDO o resto como itens em `## Perguntas pendentes` em MEMORY.md
4. Repetir LITERAL a pergunta original do passo (P15)

**Texto canonical (P15 — literal):**

```
"Anotei: {resumo curto do que ficou em aberto}. Vou abordar depois.

Antes, fechando este passo: {repete pergunta original do passo, literal}."
```

**Exemplos:**

| Mensagem do aluno | Parte (a) processada | Anotado em pendências | Resposta canonical |
|---|---|---|---|
| "Tina, e quero conectar Google Calendar" (mid wizard-aluno passo nome do agente) | nome = "Tina" | "Google Calendar — abordar no wizard-conectar" | "Anotei: Google Calendar pra abordar quando chegar no passo 5. Antes, fechando este passo: tô confirmando que o nome é **Tina** — pode ser?" |
| "renomear pra PT? E que hora roda backup?" (mid wizard-workspace) | nada (são 2 perguntas, nenhuma é resposta direta) | "renomear pastas pra PT — abordar pós-onboarding"; "horário do backup-workspace-github — abordar pós-passo 5" | "Anotei: 2 dúvidas (renomeação de pastas + horário do backup). Vou abordar quando o wizard atual fechar. Antes, fechando este passo: {repete pergunta workspace original}." |
| "vou parar aqui, tô atendendo cliente" | nada (é cancela implícito — vai pra (b)) | n/a | trata como `cancela` (b) |

**Regra anti-loop específica de c3:**

- Se aluno repetir mensagem mista 2x seguidas no mesmo passo (sem responder a parte (a)), tratar a 3ª como (c2) puro: anotar tudo + trazer de volta uma vez. Se 4ª ainda for mista, oferecer pause (`wizard_resume_at`) — mesma regra anti-loop dos 3 desvios.

**Falhas que isso PREVINE (1 reportada via stress test):**

- Pedro (stress test 03/05/2026 fim do dia): mid-wizard-workspace manda `"posso renomear pastas? E que hora você roda backup?"` — agente respondia as 2 longamente e perdia foco no passo. Sem regra explícita pra mensagem mista, P13 não cobria.

**Por que c3 não vira (a)+(c2) dois eventos separados:**

Em UX de chat, aluno mandou UMA mensagem. Tratar como 2 eventos cria sensação de "agente confuso" ou "respondeu 2x sem motivo". c3 unifica resposta numa só passagem.

**Cron de retorno passivo (v2.1):** quando aluno cancela/pausa wizard OU 3 desvios disparam pause, MEMORY.md recebe:

```yaml
wizard_resume_at: 2026-05-03T15:00   # ISO timestamp futuro
wizard_resume_step: wizard-conectar.passo3
wizard_resume_attempts: 0            # max 3 antes de virar dismissed
```

Quando aluno volta naturalmente ao Telegram (skill `continuar-jornada` é trigger natural pra checar isso), agente detecta a flag vencida e oferece retomar. Cron-DM ATIVO depende de Onda 12 (infra de cron-worker por aluno) — por enquanto é passivo (detectado quando aluno volta).

### ⚠️ Protocolo de TRANSIÇÃO entre wizards (kit v2.5.2 — fix Adrylan loop whisper→agente)

**REGRA CRÍTICA:** quando wizard A finaliza e despacha wizard B, MEMORY DEVE refletir transição limpa entre eles, e a 1ª mensagem de B DEVE ter marcador inequívoco. Sem isso, opções numeradas ambíguas (`1/2`) entre wizards consecutivos confundem o aluno — a resposta dele vira polissemântica.

**Caso real Adrylan stress test 03/05/2026:**

```
13:42  pula whisper
       Bot: agendar(1) ou definitivo(2)?
13:43  Aluno: "2" → bot confirma whisper definitivo
       Bot: [DESPACHA wizard-agente] completar(1) ou refazer(2)?
13:44  Aluno: "2" → bot RE-INTERPRETA como resposta do whisper, repete pergunta agente
13:45  Aluno: "2" → bot repete pela 3ª vez
13:45  Aluno: "refazer tudo" (escreveu por extenso) → bot finalmente avança
```

3 turnos perdidos por ambiguidade. Causa: `active_wizard` não trocou + 1ª mensagem de wizard-agente não tinha marcador claro de transição.

**Sequência obrigatória ao despachar wizard B a partir de wizard A:**

```yaml
# DENTRO de wizard A — conclusão do passo final
active_wizard: wizard-A     # ainda
active_step: ultimo_passo
# A faz cleanup (atualiza flags como agente_configured: true)

# TRANSIÇÃO (entre A e B)
active_wizard: null          # ⚠️ ZERAR antes de despachar
active_step: null
awaiting: null

# DESPACHO de wizard B
active_wizard: wizard-B      # ⚠️ SETAR ANTES da 1ª mensagem
active_step: 1
awaiting: {primeira_pergunta_de_B}

# 1ª mensagem de B (canonical):
# DEVE ter marcador inequívoco — ver template abaixo
```

**Template canonical de 1ª mensagem do wizard B (P15 literal):**

```
"✓ {confirmação curta do que A fez ou pulou}.

Agora vamos pra **{wizard-B nome natural}**: {1 frase do que vai rolar}.

{pergunta do passo 1 de B com opções renomeadas se houver risco de colisão}"
```

**Substituições:**
- `{confirmação curta de A}`: "Whisper pulado definitivamente" / "Personalidade do agente configurada" / etc.
- `{wizard-B nome natural}`: "personalidade do agente" (não `wizard-agente.passo1`) / "autonomia" / "workspace" / etc.

**Exemplo concreto — fix do caso Adrylan:**

❌ Comportamento BUGADO (kit ≤ v2.5.1):

```
[whisper pulou definitivo]
Bot: "Beleza, pulando definitivo. Lembrete: pode voltar com 'ativa whisper'.
     Agora entrei na personalidade do agente e detectei: ...
     
     Pra seguir com segurança, escolhe:
     1. Completar só o que falta — preencher IDENTITY.md...
     2. Refazer tudo — faço backup antes e recrio identidade..."

Aluno: "2"  ← ambíguo: bot pode interpretar como wizard-whisper.passo1.5 (definitivo) OU wizard-agente.passo1 (refazer)
```

✅ Comportamento v2.5.2 (transição com marcador inequívoco):

```
[whisper pulou definitivo]
Bot: "✓ Whisper pulado definitivamente. Pode reativar com 'ativa whisper' quando quiser."

[transição: zera active_wizard:null → seta active_wizard:wizard-agente, active_step:1]

Bot: "Agora vamos pra **personalidade do agente** (passo 1 da jornada — IDENTITY/SOUL/AGENTS).

     Detectei o estado atual:
     • IDENTITY.md → placeholders/template
     • SOUL.md → conteúdo real
     • AGENTS.md → regras configuradas
     
     Como você prefere?
     
     a) Completar só o que falta — preencho IDENTITY, preservo SOUL/AGENTS
     b) Refazer tudo — backup do atual + recrio os 3
     
     Manda **a** ou **b**."
```

**Mudanças nesta versão correta:**
1. **2 mensagens separadas** (confirmação A + abertura B). Telegram dá respiro visual.
2. **Marcador inequívoco** ("Agora vamos pra personalidade do agente" — aluno SABE que é outro wizard).
3. **Opções renomeadas pra `a/b`** em wizard-agente quando vem após wizard com `1/2`. Letras diferentes evitam colisão entre respostas. Outra alternativa: usar palavras-chave (`completar` / `refazer`) em vez de números.

**Regra anti-colisão de numeração:**

⚠️ **Quando 2 wizards consecutivos teriam mesmas opções numéricas (`1/2`), o segundo DEVE renomear pra letras (`a/b`) OU palavras-chave (`completar`/`refazer`).** Aluno tipicamente responde curto ("2"); ambiguidade é silenciosa, gera loop. Casos conhecidos:
- whisper-quick passo 1.5 (`1`/`2` — agendar/definitivo) → wizard-agente passo 1 (sempre renomeia pra `a`/`b` ou palavras)
- wizard-agente passo "100% pronto" (`a`/`b`/`c` — manter/ajustar/refazer) → wizard-aluno passo 1 (numera diferente OU usa palavras)
- wizard-conectar (passo a passo numerado) → primeira-vitoria (sempre usa nomes ou letras diferentes)

**Falha que isso PREVINE (caso real Adrylan stress test 03/05):**

3 turnos perdidos no loop transição whisper→wizard-agente. Aluno escreveu "refazer tudo" por extenso pra finalmente quebrar a ambiguidade. P13 cobria desvios DENTRO do wizard, mas não cobria handoff AB→BC. v2.5.2 adiciona regra de transição explícita.

---

### ⚠️ Protocolo de pause CORRETO (kit v2.5 — fix Mira stress test)

**REGRA CRÍTICA:** quando wizard pausa, MEMORY DEVE refletir estado pausado, NÃO ativo. Sem isso, cron-resume-wizards verifica `active_wizard != null`, conclui "wizard ativo, pulando ciclo", e DM nunca chega — bloqueando o próprio resgate (caso real Mira: pausou no passo 3 fechando Telegram, ficou 4+ dias sem nudge).

**Sequência obrigatória ao pausar (qualquer caminho — cancela explícito, 3 desvios consecutivos, ou inferência silenciosa por threshold):**

```yaml
# Estado ANTES (wizard rodando)
active_wizard: wizard-autonomia
active_step: 3
awaiting: terminal_aberto
desvios_neste_passo: 0..N

# Estado DEPOIS do pause (wizard pausado)
active_wizard: null                          # ⚠️ ZERAR — wizard pausado ≠ ativo
active_step: null
awaiting: null
desvios_neste_passo: 0
wizard_resume_at: 2026-05-03T19:00:00-03:00  # quando reagendar (cron lê isso)
wizard_resume_step: wizard-autonomia.passo3  # qual wizard.passoN retomar
wizard_resume_attempts: 0                    # ⚠️ ZERAR ao SETAR (não acumular)
```

**Pontos críticos:**

1. **`active_wizard: null` no pause.** Sem isso, cron-resume bloqueia DM (anti-overlap funcionando contra o objetivo).
2. **`wizard_resume_attempts: 0` ao SETAR `wizard_resume_at`** — mesmo que já tinha attempts de pause anterior em outro passo. Cada pause é evento NOVO, contagem zera. Sem isso, attempts de passo 3 (ex: 2) acumula em pause de passo 4 → DM chega em "última tentativa" sem alunos saber.
3. **Inferência silenciosa por threshold** (caso aluno fecha Telegram sem comando explícito): se `last_user_message_at > 12h` em wizard ativo, ao próximo ciclo do cron OU próxima interação do aluno, agente aplica este protocolo (zera `active_wizard` + seta `wizard_resume_at: now() + 0`). 12h é conservador (não 2h — risco de zerar wizard de aluno em meeting longo). Plus alternativo: Princípio 9 (parar quando algo dá errado) — pause silenciosa também é "algo deu errado" do ponto de vista do design.

**Quem zera `wizard_resume_*` ao retomar com sucesso:** continuar-jornada (passo 5 da própria SKILL — "cleanup quando aluno responde"). Quando wizard retomado conclui, ele NÃO precisa zerar `wizard_resume_at` — continuar-jornada já fez quando despachou. Cleanup centralizado evita drift de estado.

**Falhas que essa regra PREVINE (caso real Mira stress test 03/05 madrugada):**

1. Aluno pausa silenciosamente em passo N (fecha Telegram). `active_wizard` não zerado. Cron rodando 09 + 19 BRT loga "wizard ativo, pulando ciclo" eternamente. DM canonical nunca dispara. Mira ficou 4 dias sem retomada possível (todas as DMs canceladas pelo guard).
2. Aluno pausa em passo 3 (attempts=2 do antigo pause). Wizard-workspace seta novo `wizard_resume_at` em passo 4 sem zerar attempts. 1 DM no passo 4 já vai pra `wizard_dismissed: true` (ciclo curto demais).

---

## Princípio 14 — Smoke tests visíveis (mostra comando + output, nunca finge)

⚠️ **NOVO em v2.1.** Adicionado depois de bug "áudio falso" reportado por Dr. Thiago: agente afirmou ter validado áudio com texto que aluno não disse. Causa-raiz: agente não rodou `curl` da API Whisper, inventou transcrição plausível.

**Regra:** quando SKILL pede pra agente rodar comando externo (curl pra API, bash exec-policy show, gh CLI install, openclaw command, etc), agente DEVE mostrar:

1. **O comando exato que rodou** (em bloco de código)
2. **O output literal** (em bloco de código)
3. **Só DEPOIS** interpretar/narrar o resultado

**Sem comando+output mostrado = ABORTAR e perguntar ajuda. NUNCA fingir que rodou.**

### Padrão correto

```
"Vou validar a chave Whisper rodando call de teste à API:

```bash
curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -o /dev/null -w "%{http_code}"
```

Output:
```
200
```

✓ Chave válida (HTTP 200). Whisper pronto."
```

### Padrão INCORRETO (NUNCA fazer)

```
"✓ Validei a chave Whisper, tá funcionando. Bora pro próximo passo."
[sem mostrar comando, sem output, sem evidência]
```

### Quando o comando FALHA

Mostrar mesmo assim — fingir sucesso é o pior dos mundos:

```
"Tentei validar a chave:

```bash
curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -o /dev/null -w "%{http_code}"
```

Output:
```
401
```

❌ HTTP 401 = chave inválida ou revogada. Você quer:
 (a) Gerar nova chave (te guio)
 (b) Pular esse passo (manda 'pula')"
```

### Aplica IMEDIATAMENTE em

- `wizard-whisper-quick`: validação de chave + smoke test áudio (mostrar curl real, output literal da transcrição)
- `wizard-autonomia`: detecção de exec-policy + verificação pós-comando (mostrar `openclaw exec-policy show`)
- `wizard-conectar`: validação Brave Search + GitHub Token + install gh CLI (mostrar comandos de install + output)
- `backup-workspace-github`: validação de cron + primeiro push (mostrar saída do `gh repo create`, etc)
- Qualquer skill futura que rode comando externo

### ⚠️ Regra UX EXPECTATIVA antes de comandos longos (kit v2.5.3 — fix Allan silêncio 10min)

⚠️ **CRÍTICO:** quando agente vai rodar comando que tipicamente leva >2min (install via apt/brew, restart de Gateway, primeiro push de repo grande, build, etc), DEVE mandar mensagem de aviso ANTES de invocar o tool — NÃO durante.

**Por que ANTES e não DURANTE:** durante a execução do tool, agente fica BLOQUEADO esperando retorno. Não tem mecanismo de interromper espera pra mandar update intermediário (tool execution é síncrona em LLMs). A solução real é setar EXPECTATIVA antes do bloqueio começar.

**Texto canonical (P15 — usar literal):**

```
"Vou rodar {nome do comando legível} agora. Pode levar ~Nmin
({razão concreta — instalar X via apt, restart Gateway, primeiro push
do repo, etc}).

Aguenta — volto com resultado quando terminar."
```

**Substituições:**
- `{nome do comando legível}` — em linguagem natural pro aluno (não comando shell cru)
- `{N}` — estimativa real em min (1-2 / 2-5 / 5-10)
- `{razão concreta}` — o motivo factual da demora (não vago)

**Exemplos:**

❌ Vago: "Vou processar um pouco aqui — leva uns minutos."

✅ Canonical: "Vou reinstalar o Chromium fora do Snap (via apt). Esse processo reinicia o Gateway e leva ~3-5min total. Aguenta — volto com resultado quando estabilizar."

❌ Vago: "Configurando GitHub..."

✅ Canonical: "Vou criar o repo privado de backup no seu GitHub e fazer primeiro push do workspace. Leva ~1-2min (depende do tamanho). Volto com confirmação."

**Onde aplica (kit v2.5.3):**

| Skill | Comando longo | Estimativa | Razão |
|---|---|---|---|
| `wizard-conectar` | Reinstalar Chromium fora do Snap (VPS root) | 3-5min | apt install + restart Gateway |
| `wizard-conectar` | Primeiro push GitHub de workspace populado | 1-2min | Tamanho do diff inicial |
| `backup-workspace-github` | Primeiro snapshot + push | 1-3min | Criar repo + zip workspace + push |
| `wizard-autonomia` | Reset do Gateway pós-yolo (raro) | 30-60s | restart processo |

**O que essa regra NÃO cobre:**
- Comandos rápidos (<30s) — não precisa aviso
- Comandos cuja duração é imprevisível (depende de input externo, ex: aluno responder 2FA email) — esses ficam em estado "aguardando aluno" (não wizard travado)
- Updates intermediários durante execução do tool — IMPOSSÍVEL em arquitetura síncrona (ver "Por que ANTES" acima)

**Falha que isso PREVINE (caso real Allan stress test 03/05 18:43-18:53):**

Allan autorizou agente reinstalar Chromium fora do Snap. Agente rodou `process cool-atlas` e ficou silencioso. **10 minutos depois** Allan teve que perguntar "Wizard, está processando ainda?". Agente respondeu reportando status (gateway reiniciou + Chromium falhando por SingletonLock).

Se agente tivesse setado expectativa antes ("Vou reinstalar Chromium fora do Snap, leva ~3-5min, reinicia o Gateway"), Allan saberia que era pra esperar — não teria perguntado em 10min.

**Princípio meta:** o bug de UX não foi o tempo de execução (3-5min é razoável); foi o silêncio sem expectativa. Aluno em silêncio depois de "Working..." sem prazo concreto interpreta como "travou ou esqueceu de mim". Aviso prévio resolve.

### Por que isso importa

- **Honestidade:** aluno SABE se algo deu certo de verdade. Não confia em afirmação cega
- **Debug:** quando algo dá errado, aluno tem o output real pra mostrar pro suporte
- **Educa:** aluno aprende o que cada comando faz vendo o output literal
- **Previne alucinação:** modelo LLM não consegue "inventar" output literal — ou roda de verdade ou não fala que rodou

### Falhas que isso PREVINE (1 reportada, dezenas potenciais)

1. **Áudio falso (Dr. Thiago, v1.9.1):** agente afirmou ter transcrito "Olá, tudo bem? É um teste de voz" mas aluno disse só "Oi tudo bem". Sem smoke test visível, alucinação passou.
2. **Brew Ubuntu silencioso (potencial):** comando falha, agente segue como se tivesse instalado. Smoke test visível obriga mostrar erro.
3. **Validação de chaves cego:** agente diz "validei" sem mostrar HTTP code. Pode estar usando chave revogada e não sabe.

---

## Princípio 15 — Mensagens canônicas são literais (não reformula, não "melhora")

⚠️ **NOVO em v2.1.** Adicionado depois de feedbacks de aluno onde wizard-autonomia/workspace fizeram perguntas vagas que SKILL.md tinha como literal/precisas. Causa-raiz: agente "reformulou" pra parecer melhor, perdeu precisão.

**Regra:** trechos de SKILL.md marcados como `<canonical>...</canonical>` (ou em bloco de código com prefixo `# CANONICAL`) são pra ser USADOS LITERAL ao falar com aluno. Agente NÃO:

- Reformula a frase pra "ficar mais natural"
- Adapta o vocabulário "achando que melhorou"
- Substitui exemplos por outros que parecem equivalentes
- Encurta ou simplifica

**Exceção permitida:** ajustar TOM (formal/casual) seguindo `SOUL.md` do agente. Mas estrutura, ordem das opções, palavras-chave técnicas — preservar.

### Marcação no SKILL.md

```markdown
<canonical>
"Você quer me dar autonomia pra trabalhar:

1. **Conservador** — eu sempre pergunto antes de fazer algo
2. **Moderado** — eu executo direto coisas seguras (criar arquivo,
   pesquisar), peço pra coisas sensíveis (deletar, instalar)
3. **Avançado (yolo)** — eu executo direto e te aviso ao final

Manda 1, 2 ou 3."
</canonical>
```

(Quando agente vê esse bloco, usa exato. Não inventa "vamo lá, qual nível de autonomia?".)

### Por que importa

- **Pergunta-âncora precisa funcionar:** se autoria reformula a pergunta, perde a função pedagógica de fixar conhecimento
- **Termos técnicos consistentes:** aluno aprende vocabulário canônico se sempre vê o mesmo. Variação cria confusão ("yolo" vs "automático" vs "livre")
- **Anti-improviso:** agente já tem tendência de "melhorar" — Princípio 15 trava isso explicitamente

### Aplica IMEDIATAMENTE em

- `wizard-autonomia`: 3 perfis (conservador/moderado/yolo) — usar literal quando implementado
- `wizard-workspace`: pergunta-âncora "post novo / decisão importante" — versão simplificada literal (a/b/c)
- `wizard-aluno`: bloco "como você se apresenta pra cliente novo" — usar literal
- `primeira-vitoria`: 4 opções pós-vitória + comandos de retomada — literal
- Pergunta-âncora de cada wizard (`mapa-aulas.md`) — sempre literal

### Falhas que isso PREVINE (2 reportadas)

1. **wizard-autonomia vago (Dr. Thiago):** agente perguntou "definir até onde posso agir sozinho" em vez do canônico. Bruno pediu perfis estruturados — Princípio 15 obriga usar literal quando implementado
2. **wizard-workspace pergunta vaga:** agente fez pergunta-âncora aberta em vez do canônico estruturado

---

## Princípio 16 — Entry point literal (sem improvisar primeira mensagem)

⚠️ **NOVO em v2.2.** Adicionado após feedback do tester NC (03/05/2026): agente recebeu zip do kit e respondeu *"Recebi o starter kit e dei uma olhada rápida [...] você quer que eu siga o wizard do kit ou prefere que eu proponha uma identidade inicial pra mim?"*. Causa-raiz: agente leu `0-LEIA-PRIMEIRO-AGENTE.md` + viu o kit, mas em vez de invocar `onboarding-checklist` IMEDIATAMENTE, criou escolha falsa (wizard formal vs improvisação disfarçada de "atalho conveniente").

**Regra:** quando agente detecta arquivos do kit no workspace (extração de zip OU presença de `0-LEIA-PRIMEIRO-AGENTE.md` + `skills/starter/onboarding-checklist/SKILL.md`), próxima ação OBRIGATÓRIA é:

1. **Read** `skills/starter/onboarding-checklist/SKILL.md`
2. **Renderizar literal** a seção "Boas-vindas universal" desse arquivo (P15 aplicado ao entry point)
3. Seguir o fluxo canonical SEM perguntar nada antes

**O que P16 PROIBE:**

- ❌ "Recebi o kit, dei uma olhada rápida..." — preâmbulo zero. Mensagem inicial = boas-vindas canonical
- ❌ "Posso usar isso como base pra nossa configuração inicial" — sem narrar antes do design despachar
- ❌ "Você quer que eu siga o wizard, ou prefere que eu proponha identidade inicial?" (NC, 03/05) — escolha falsa, ambas precisam vir via onboarding-checklist
- ❌ "Antes de começar, qual seu nome?" — wizard-aluno faz isso na ordem certa, não o entry point
- ❌ "Vamos por etapas: primeiro vou..." — entry point não tem etapas próprias
- ❌ Modificar arquivos raiz (IDENTITY, USER, SOUL, AGENTS) ANTES da onboarding-checklist despachar wizards específicos

**O que P16 PERMITE:**

- ✅ Invocar `onboarding-checklist` IMEDIATAMENTE
- ✅ Pedir esclarecimento à `0-LEIA-PRIMEIRO-AGENTE.md` se algo no design não bater (Princípio 7 — em dúvida, perguntar... a si mesmo, não ao aluno)
- ✅ Reusar dados do contexto existente DENTRO dos wizards (P11 — detectar antes de pedir), mas não ANTES de invocar a checklist

### Padrão correto

Aluno entrega zip → agente extrai (se ainda não) → agente Read onboarding-checklist → agente renderiza:

```
"Oi! 👋

Eu sou {nome_agente}. Acabei de receber o **Starter Kit OpenClaw v{X.Y}** —
um experimento da **Pixel Educação** (mini-curso OpenClaw), feito pelo
**Bruno Okamoto**.

[resto da boas-vindas canonical...]"
```

Aluno tá no Telegram, vê isso, sabe que entrou no fluxo. Sem ambiguidade.

### Padrão INCORRETO (caso real NC, 03/05/2026)

```
"Recebi o starter kit e dei uma olhada rápida: tem instruções, templates de
identidade/SOUL/USER, exemplos e skills.

Posso usar isso como base pra nossa configuração inicial. Mas antes preciso
de uma escolha tua: você quer que eu siga o wizard do kit e vá te perguntando
passo a passo, ou prefere que eu proponha uma identidade inicial pra mim e
você só ajusta?"
```

(Escolha falsa + improvisação disfarçada de polidez. A 2ª opção quebra Princípio 1: modificar arquivo raiz sem backup nem confirmação contextualizada.)

### Aplica IMEDIATAMENTE em

- `0-LEIA-PRIMEIRO-AGENTE.md`: documento explícito com lista de improvisações proibidas, casos reais
- `README.md`: bloco "Princípio 16" + lista de improvisações observadas no topo
- `onboarding-checklist`: a "Boas-vindas universal" passa a ser explicitamente CANONICAL (P15 reforçado)
- `wizard-agente` + `wizard-aluno`: bloco anti-presunção — não pré-preencher arquivos baseados em "intuição" antes da entrevista canonical

### Por que isso importa

- **Primeira impressão do aluno:** ele entrega zip esperando "agente vira tutor". Se primeira mensagem é "que caminho você prefere?", quebra a tese do kit
- **Cura na camada anterior:** P13/14/15 protegem DENTRO dos wizards. P16 protege ANTES de invocar wizard nenhum — agente esperto sempre acha um jeito de "consultar antes" se não for proibido explicitamente
- **Pega 5 sub-padrões num só:** preâmbulo / escolha falsa / proposta proativa / pergunta de identidade prévia / "configuração inicial" como conceito improvisado

### Falhas que isso PREVINE (1 reportada, vários potenciais)

1. **NC (03/05/2026):** agente respondeu zip com "wizard ou eu proponho identidade?" — escolha falsa onde a 2ª opção quebra Princípio 1
2. **Potencial:** agente que "interpreta intenção" do aluno antes de invocar checklist — vira "consultar" o aluno sobre como instalar
3. **Potencial:** agente que renderiza versão "resumida" da boas-vindas em vez da canonical — perde posicionamento Pixel + tom
4. **Potencial:** agente que usa contexto de conversa anterior pra pré-preencher USER/IDENTITY antes do wizard — quebra P11 + P1

---

## Princípio 17 — Formatação Telegram-friendly em mensagens canonical

⚠️ **NOVO em v2.2 (final).** Adicionado após feedback do tester **Adrylan Viana** (03/05/2026 tarde): a boas-vindas universal apareceu com hard-breaks visíveis no Telegram desktop ("os textos ficam quebrados, tem como melhorar isso?" + screenshot do agente do NC mostrando frases cortadas no meio). Causa-raiz: mensagens canonical em SKILL.md foram escritas com quebras manuais a cada ~70 chars (estilo "leitura no editor markdown"). Telegram (e WhatsApp, Slack, email) **preservam quebras hard** mesmo em telas mais largas que a quebra original — vira aparência de texto cortado.

**Regra:** TODA mensagem canonical destinada ao aluno via plataforma com word-wrap automático (Telegram, WhatsApp, Slack, email) deve seguir:

1. **Parágrafos contínuos.** 1 linha por parágrafo, sem quebras manuais no meio. Plataforma quebra naturalmente conforme largura da tela
2. **Separação por linha em branco.** `\n\n` entre parágrafos = visual limpo
3. **Listas explícitas.** Itens começando com `-`, `*`, `•` ou números (`1.`, `2.`) — quebras nesses casos são intencionais e preservam OK
4. **Code blocks pra comandos / URLs específicos.** Texto pra aluno COPIAR vai entre triple-backticks — Telegram renderiza monospace + tap-pra-copiar
5. **Bold / italic moderado.** Markdown nativo: `**bold**` e `*italic*` — usar pra ênfase semântica, não decoração

**O que P17 PROIBE:**

- ❌ Quebrar parágrafos a cada ~70 chars achando que "fica mais legível no editor". O editor não é o destino — o Telegram é.
- ❌ Usar `<br>`, `<br/>` ou tags HTML — Telegram trata como texto literal
- ❌ Múltiplos espaços pra "alinhar" texto — Telegram colapsa whitespace
- ❌ Tabs pra indentação — não preservam consistente entre clientes
- ❌ Listas com bullets virados pra direita ou caracteres exóticos (`›`, `»`) — usar `-` ou `•` simples

### Padrão correto (boas-vindas reformatada)

```
"Oi! 👋

Eu sou {nome_agente}. Acabei de receber o **Starter Kit OpenClaw v{X.Y}** — um experimento da **Pixel Educação** (mini-curso OpenClaw), feito pelo **Bruno Okamoto**.

🧪 **Em fase EXPERIMENTAL.** É o primeiro experimento da Pixel onde o conteúdo do mini-curso roda DENTRO do agente do aluno. Cada skill foi escrita pra ser:

- Lida e executada por outro agente (eu)
- Compreensível por humano que olha por cima (você)

A tese: em vez de você ler manual e configurar tudo na mão, **eu sou seu tutor**. Te guio passo a passo, executo o que dá pra executar, te explico o por quê.

Esse é um curso pra **dois tipos de aluno: humanos E agentes**. Você é o humano, eu sou o agente, a gente faz isso juntos.

Heads up: tá em **testes ativos**. Se algo soar estranho, manda direto pro Bruno: bruno@microsaas.com.br (ele lê pessoalmente). Comunidade no Telegram: https://t.me/cursoopenclaw

Agora deixa eu olhar o que tem aqui no seu workspace pra escolher o melhor caminho..."
```

Cada parágrafo é UMA linha contínua. Telegram word-wrap natural conforme largura.

### Padrão INCORRETO (caso real Adrylan, 03/05/2026)

```
"Eu sou seu agente. Acabei de receber o **Starter Kit OpenClaw v2** —
um experimento da **Pixel Educação** (mini-curso OpenClaw), feito pelo
**Bruno Okamoto**.

🧪 **Em fase EXPERIMENTAL.** É o primeiro experimento da Pixel onde o
conteúdo do mini-curso roda DENTRO do agente do aluno..."
```

Quebras hard a cada ~70 chars preservam no Telegram desktop. Vira aparência de texto cortado.

### Aplica IMEDIATAMENTE em (12 SKILL.md)

- `onboarding-checklist`: boas-vindas universal + Cenário B 3 caminhos + cancelamento
- `wizard-agente`, `wizard-aluno`, `wizard-autonomia`, `wizard-workspace`, `wizard-conectar`, `wizard-whisper-quick`, `primeira-vitoria`: pergunta-âncora + opções literais + mensagem-fim
- `continuar-jornada`: opções de retomada
- `gera-log-jornada`: convite + caminhos de envio
- `cron-resume-wizards` (operacional/): 3 DMs canonical
- `wizard-whatsapp` (canais/): opcional pós-vitória

### Por que isso importa

- **Primeira impressão visível.** Aluno em desktop/tablet lê texto cortado. Mesmo que P1, P11, P15 estejam corretos, percepção de qualidade despenca
- **P15 era textual, P17 é visual.** P15 garante palavra certa; P17 garante VISUAL certo
- **Quebra é só um dos problemas potenciais.** Princípio cobre 5 fontes de erro visual (hard-break, br tag, espaços, tabs, formatação inconsistente)
- **Categoria diferente das anteriores.** P13/14/15 são sobre LÓGICA/conteúdo; P17 é sobre RENDERIZAÇÃO

### Como testar (validação manual)

1. Mensagem canonical pronta? Cola no Telegram desktop (largura ~1200px)
2. Vê quebras estranhas no meio de frases? → reescreve os parágrafos como linhas contínuas
3. Cola no celular (largura ~400px) também — confirma que continua legível em ambos
4. Repete pra: WhatsApp, Slack (se aplicável)

### Falhas que isso PREVINE (1 reportada, vários potenciais)

1. **Adrylan (03/05/2026 tarde):** "@obrunookamoto os textos ficam quebrados, tem como melhorar isso?" + screenshot da boas-vindas com hard-breaks visíveis em Telegram desktop
2. **Potencial:** mensagens longas em outros wizards quebrando em telas largas — Lia/Mira/Dr. Thiago testaram em celular onde a quebra hard coincidiu com largura natural
3. **Potencial:** outros canais (WhatsApp Business, Slack threads, email) que fazem word-wrap automático com regras diferentes do Telegram
4. **Potencial:** futuras skills das aulas do mini-curso (Aulas 5+) herdando o mesmo erro de formatação se ninguém formalizou a regra

---

## Princípio 18 — Material do curso como fonte de verdade (não improvisa) (kit v2.5.4)

**Regra:** Quando aluno menciona aula ou tema do mini-curso, agente consulta `$WORKSPACE/_curso/INDICE.md` + carrega trecho relevante de `_curso/aulas/aula-XX-tema.html`. NÃO improvisa do treino geral.

Detalhes completos em `0-LEIA-PRIMEIRO-AGENTE.md` (seção "Quando aluno mencionar aula ou tema do curso").

---

## Princípio 19 — Estagnação suave do wizard (kit v2.5.6)

**Regra:** Se aluno está com `active_wizard != null` E `last_wizard_advance_at < now() - 25min` E `last_user_message_at > now() - 5min` (= aluno tá ATIVO no chat mas não avança no wizard), agente faz **UMA** intervenção sutil — não em cada turno, não com menu rígido. Tom humano. Aluno escolhe sem pressão.

### Por que existe

P13 (Guard Rail) conta desvios consecutivos. Mas aluno pode fazer 2 desvios → 1 retorno curto → 2 desvios infinito, resetando contador sem avançar. Wizard "morre" durante a sessão sem o agente perceber.

P19 conta **tempo desde último avanço REAL no wizard**, não desvios.

### Como funciona

Cada wizard escreve em `MEMORY.md` ao avançar passo:
```yaml
active_wizard: wizard-agente
active_step: 2
last_wizard_advance_at: 2026-05-07T14:32:00-03:00
last_user_message_at: 2026-05-07T14:48:12-03:00
```

**Estados detectados:**

| Estado | Condição | Comportamento |
|---|---|---|
| 🟢 Avançando | last_wizard_advance < 25min | Normal — agente segue conversa livre |
| 🟡 Estagnado (uma vez) | last_wizard_advance >= 25min E aluno ativo no chat E `nudge_enviado != true` | Header sutil + oferta humana (UMA vez) · seta `nudge_enviado: true` |
| 🟢 Reset | aluno avançou OU usou comando `silencia wizard` | Limpa `nudge_enviado`, volta pra normal |

### Mensagem canonical do estado 🟡 (uma vez por estagnação)

```
[resposta normal à última mensagem do aluno — conteúdo livre]

---
ei, eu tava te ajudando com o **wizard {nome}** ({passo}/{total}) — faz uns
{N} minutos que não avançamos. Sem pressão: posso continuar conversando
sobre o que você tá perguntando agora E você volta pro wizard quando
quiser, ou se preferir a gente fecha o wizard primeiro. Você decide.

(se quiser desligar esses lembretes: manda `silencia wizard`)
```

**Tom:** humano, primeira pessoa, sem menu a/b/c, sem cobrança. NÃO repetir em turnos seguintes — uma vez basta. Se aluno responde sem voltar pro wizard, agente segue normalmente sem reforçar.

### Reset do nudge

Limpa `nudge_enviado: false` quando:
- Aluno avança no wizard (`last_wizard_advance_at` atualiza)
- Aluno usa `silencia wizard` (P13 — comando canonical novo)
- Aluno usa `cancela` ou `pula` (pause/cancel explícito)

### Cobertura combinada com cron-resume

P19 cobre escala MINUTOS (aluno ativo no chat, wizard estagnado).
`cron-resume-wizards` cobre escala DIAS (aluno saiu, retorna depois).

Não sobrepõem.

### Falhas que isso PREVINE

- **Loop infinito do P13:** aluno desvia 2x → retorna 1x curto → desvia 2x → retorna 1x curto → wizard nunca avança, mas P13 nunca acumula 3 desvios consecutivos. P19 detecta porque conta tempo, não desvios.
- **Aluno que esquece silenciosamente:** entrou no wizard às 14h, são 14:35, ele tá conversando sobre Notion e nem lembra mais que tava no passo 2. Header gentil traz de volta sem cobrar.

---

## Princípio 12 — Mapas distribuídos (cada pasta documenta a si mesma)

**Regra:** Cada pasta importante do workspace tem seu próprio `MAPA.md` local. O `MAPA.md` raiz só lista pastas e aponta pros mapas locais. **Nada é duplicado.**

### Por quê

Tentar manter um arquivo agregador único (tipo `TOOLS.md` com tudo) tem 3 problemas:
1. Cresce sem controle (power user = 500+ linhas)
2. Viola single source of truth (duplica info de registries, .env, etc)
3. Fica desatualizado em semanas (Princípio 12 fragiliza com sincronia em 2 lugares)

Distribuído resolve os 3:
- Cada mapa cresce no escopo da própria pasta (limitado)
- Cada mapa só fala da sua pasta (sem duplicar)
- Atualizar = mexer em UM mapa local

### Estrutura

```
workspace/
├── MAPA.md              ← raiz (só lista pastas)
├── skills/
│   ├── MAPA.md          ← local de skills/
│   └── {categoria}/
│       └── MAPA.md      ← local da categoria
├── content/
│   └── MAPA.md
├── memory/
│   └── MAPA.md
└── archive/
    └── MAPA.md
```

### Quando atualizar

| Mudança | Mapa atualizado |
|---|---|
| Skill nova instalada | `skills/{categoria}/MAPA.md` (e contagem em `skills/MAPA.md` se afetar agregado) |
| Cron novo criado | OpenClaw já gerencia (não tem mapa próprio — usar `openclaw cron list`) |
| Decisão importante tomada | `MEMORY.md` (não `MAPA.md`) |
| Arquivo criado em content/drafts/ | `content/MAPA.md` (atualizar contagem) |
| Pasta nova criada | `MAPA.md` raiz (adicionar linha) + criar `MAPA.md` na pasta nova |

### O que NÃO fazer

- **Nunca criar arquivo agregador centralizado** (TOOLS.md, ALL.md, EVERYTHING.md). Usar mapas distribuídos.
- **Nunca duplicar info** entre mapas. Cada fato vive em UM lugar só.
- **Nunca atualizar mapa raiz** quando algo dentro de uma pasta muda — só quando estrutura macro muda.

### Quando criar mapa novo

**SIM, criar:**
- Pasta tem 3+ items que precisam ser indexados
- Pasta vai crescer ao longo do tempo
- Pasta tem sub-pastas que precisam ser navegadas

**NÃO criar:**
- Pasta com 1-2 arquivos triviais
- Pasta gerada/temporária (`tmp/`, `.cache/`)
- Sub-pasta de arquivos versionados (ex: `decisoes/2026-04.md` não precisa MAPA dentro de decisoes/)

### UX: comando "status"

Quando aluno quer ver tudo de uma vez, agente faz queries on-demand lendo os mapas locais + comandos OpenClaw + .env. **Não cachear**, sempre fresh.

Detalhe completo do padrão: `references/sistema-de-mapas.md`

---

## Como aplicar nos wizards filhos

Cada wizard novo (`wizard-agente`, `wizard-aluno`, etc.) deve ter na sua SKILL.md a seguinte seção:

```markdown
## Princípios Defensivos

Esta skill herda os princípios universais da `onboarding-checklist`.
Ver: `references/principios-defensivos.md` na pasta da onboarding-checklist.

### Aplicação específica
- **Princípio 1 (backup):** [como este wizard aplica]
- **Princípio 11 (detectar antes):** [o que esse wizard detecta antes de executar]
- [outros princípios relevantes]
```

E **TODO wizard começa com**:

```
1. Detecção (Princípio 11)
2. Decidir caminho: pulo / parcial / completo
3. Executar caminho escolhido
4. Pergunta-âncora
5. Marcar flag em MEMORY.md
6. Devolver controle pra onboarding-checklist
```

---

*Estes princípios são lei. Se uma skill nova precisa quebrar algum, levantar discussão antes — não criar exceção silenciosa.*
