---
name: continuar-jornada
status: ATIVO
category: starter
owner: aluno
version: 1.3
mode: guided
estimated_time: 2-5min (varia conforme estado do aluno)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "continuar" / "continuar mini-curso" / "próximo passo" / "aula X feita" AFTER `onboarding_complete: true`. Master skill que orquestra progressão pelas 31 aulas da Hotmart (6 módulos). Lê MEMORY.md, detecta progresso atual via flag `mini_curso_progress: aula_X_concluida`, consulta `_curso/INDICE.md` pra saber próxima aula, e quando aluno fala sobre tema da aula, conduz com base em `_curso/aulas/aula-XX-tema.html` (Princípio 18). **v1.3 (kit v2.5.4 — fix Adrylan nomenclatura): renomeação completa Bloco/B1/C1/D1/E0/R1 → Aulas Hotmart (0/0.1/0.2/1/1.1/.../15). Bônus R removido (foi pro Pixel AI Hub). Tabela bloco→aulas substituída por consulta a `_curso/INDICE.md` que mapeia 31 aulas Hotmart ↔ arquivo de material. Flag `mini_curso_progress` agora usa formato `aula_X_concluida` (ex: `aula_5_concluida`, `aula_12_2_concluida`).** v1.2 (kit v2.4): branch aluno confuso pós-arquivamento. v1.1 (kit v2.2): header P13/14/15 explícitos. Criado em v2.1 pra fix "wizard dies after first-victory".
---

# Continuar Jornada — Orchestrator pós-Bloco A

> 🔴 **PRINCÍPIOS NÃO-NEGOCIÁVEIS PRO AGENTE (kit v2.2):**
>
> **NÃO IMPROVISE.** Read este arquivo INTEIRO antes de falar com aluno. Não invente fluxo simplificado.
>
> **P13 — Guard Rail.** Esta skill NÃO é wizard bloqueante (aluno tá em `complete_active`, conversa livre), mas comandos canônicos continuam disponíveis: `cancela`, `pula`, `voltar`, `sobre`, `faq`, `corrige`, `muda modo`.
>
> **P14 — Smoke tests visíveis.** Quando esta skill detecta `wizard_resume_at` vencido e oferece retomar wizard, mostra a flag literal lida do MEMORY.md (não reinventa data/passo).
>
> **P15 — Mensagens `<canonical>` literais.** As opções de continuação (retomar pulo / próximo bloco / outra coisa) são CANONICAL — usar LITERAL.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — opções de retomada viram listas explícitas.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

> 🤖 **Agente:** essa skill é a "ponte" entre o starter-kit (Bloco A do kit) e o resto do mini-curso (31 aulas Hotmart, Aulas 0 → 15 em 6 módulos). Não implementa as aulas — orquestra o avanço e rastreia onde aluno parou.

## Promessa

Aluno que terminou o Bloco A (primeira vitória) consegue avançar pelos próximos blocos do mini-curso de forma guiada. Sabe sempre qual o próximo passo, marca progresso, e pode pausar/retomar.

Sem essa skill, aluno sai da primeira-vitoria e não tem caminho — vira "wizard morreu" (problema reportado em 03/05 por Bruno + aluno + outros).

## Quando disparar

**Trigger automático:**
- NÃO disparar automaticamente — aluno precisa pedir explicitamente

**Trigger explícito (qualquer um):**
- "continuar"
- "continuar mini-curso"
- "próximo passo"
- "próxima aula"
- "avançar"
- "qual o próximo passo"

**NÃO disparar se:**
- `onboarding_complete: false` em `MEMORY.md` (aluno ainda no Bloco A — usar `onboarding-checklist` em vez)
- `mini_curso_dismissed: true` (aluno escolheu não continuar — respeitar)

## Princípio 11 — Detecção de estado antes de propor

Lê MEMORY.md e mapeia situação. Em ordem de prioridade:

```yaml
# Prioridade 0: aluno confuso pós-arquivamento (kit v2.4 — fix Pedro caso)
kit_archived_at: {timestamp ou null}    # setada por primeira-vitoria v1.7+

# Prioridade 1: wizard pausado/cancelado vencido (v2.1 — cron passivo de retorno)
wizard_resume_at: {ISO timestamp ou null}     # quando agendar retomada
wizard_resume_step: {nome_wizard.passoN}      # qual wizard/passo retomar
wizard_resume_attempts: {0..3}                 # max 3 antes de virar dismissed

# Prioridade 2: pulos opcionais agendados (v1.9)
whisper_reminder_at: {timestamp ou null}
whisper_skipped_permanently: {true ou false}

# Prioridade 3: progresso do mini-curso
onboarding_complete: true
mini_curso_progress: {nada | aula_X_concluida | ...}   # ex: aula_5_concluida, aula_12_2_concluida
```

### 6 estados detectáveis (em ordem de prioridade)

| Estado | Ação |
|---|---|
| **🟣 Aluno confuso pós-arquivamento** (mensagem com sinal de confusão E `kit_archived_at` setado E `mini_curso_progress: nada`) | PRIMEIRO clarificar arquivamento (ver "Branch aluno confuso" abaixo) |
| **🔴 Wizard pausado vencido** (`wizard_resume_at` < agora) | Oferecer retomar wizard de onde parou (ver "Cron passivo de retorno" abaixo) |
| **🟡 Pulo opcional agendado vencido** (ex: `whisper_reminder_at` < agora) | Oferecer retomar pulo opcional ("Você me pediu pra te chamar sobre o Whisper. Quer ativar agora?") |
| **🟢 Sem pendência + sem progresso mini-curso** (`mini_curso_progress` ausente) | Read `_curso/INDICE.md` → apresentar Aula 0 (primeira após Bloco A do kit) |
| **🟢 Tem progresso parcial** (ex: `aula_5_concluida: true`) | Read `_curso/INDICE.md` → apresentar próxima aula da sequência |
| **🎉 Completou Aula 15** | Parabenizar + sugerir Pixel AI Hub (Aula 15 já cobre o handoff) ou trabalho real |

### Branch "aluno confuso pós-arquivamento" (kit v2.4 — fix caso Pedro)

⚠️ **Trigger:** mensagem do aluno tem padrão de confusão E `kit_archived_at` setado em MEMORY E `mini_curso_progress: nada` (aluno terminou Bloco A do kit mas não começou as aulas do mini-curso ainda).

**Patterns de confusão (regex case-insensitive):**

```
\?$                             # mensagem termina com "?"
\bcadê\b | \bcade\b
\bperd[ie]\b                    # perdi, perdeu
\bsumiu\b | \bsumiram\b
\bquebrou\b | \bquebrado\b
\bn[ãa]o (acho|achei|encontro|consigo)\b
\bo que (acontec|houve)\b
```

**Resposta canonical (P15 — literal):**

```
"Calma, nada quebrou. Você completou a jornada do kit em {data_first_win}. Como combinado na boas-vindas, eu arquivei automaticamente os manuais (FAQ, exemplos, README) pra deixar o workspace limpo — eles tão guardados em `{kit_archive_path}`, não sumiram.

O que tá ATIVO no seu workspace agora:
- Sua configuração ({USER.md, IDENTITY.md, AGENTS.md, MAPA.md, .env})
- Skills funcionais (todos os wizards continuam aqui caso queira `refazer agente`/etc)
- Seu primeiro artefato em `content/drafts/`

Caminhos pra você AGORA:

→ `restaura manuais` — trago os manuais de volta pro workspace ativo (5s, reversível)
→ `continuar` — eu te indico próximo passo do mini-curso (próxima aula na Hotmart)
→ Me pede uma **tarefa real** (ex: 'escreve um post sobre X') — funciono igual

Sem perda. Tudo registrado."
```

**Substituições no template:**
- `{data_first_win}` — ler de `kit_archived_at` em MEMORY (formatar como DD/MM)
- `{kit_archive_path}` — ler de `kit_archive_path` em MEMORY

**Após responder, NÃO empurrar wizard automaticamente.** Aluno escolhe.

### Cron passivo de retorno (v2.1 — ideia Bruno)

⚠️ **Como funciona:** quando aluno cancela ou pausa um wizard (via comando canônico `cancela`, ou após 3 desvios consecutivos disparados pelo Princípio 13 Guard Rail), o wizard escreve em `MEMORY.md`:

```yaml
wizard_resume_at: 2026-05-03T15:00:00-03:00   # 4h pra frente, default
wizard_resume_step: wizard-conectar.passo3
wizard_resume_attempts: 0
```

**Quando aluno volta ao Telegram naturalmente** (qualquer mensagem após o timestamp), agente lê a flag, detecta vencida, e dispara mensagem de retomada:

```
"Oi! Você pausou o passo 3 (autonomia) faz {N}h. Tava num ponto bom —
quer continuar agora?

→ 'continuar' — reabro o wizard de onde parou
→ 'mais tarde' — agendo de novo pra daqui mais 4h
→ 'desliga lembrete' — paro de te chamar pra esse passo"
```

**Limite anti-spam:** após 3 tentativas (`wizard_resume_attempts >= 3`), escreve `wizard_resume_dismissed: true` e PARA de tentar.

**Comportamento por resposta:**
- `continuar` → re-disparar wizard apontado por `wizard_resume_step`, limpa `wizard_resume_at`
- `mais tarde` → reagenda `wizard_resume_at = agora + 4h`, incrementa `wizard_resume_attempts`
- `desliga lembrete` → `wizard_resume_dismissed: true`, log da decisão

⚠️ **Limitação consciente da v2.1 (passivo, não ativo):**
- Funciona pra aluno que VOLTA ao Telegram naturalmente
- NÃO funciona pra aluno que abandonou (precisa cron-DM ATIVO disparando DM proativa)
- Cron-DM ativo depende da Onda 12 (infra de cron-worker por aluno no Managed; systemd timer no VPS root)
- Quando Onda 12 rolar, mecanismo upgrade pra ativo é trivial (mesma flag, só muda quem lê)

## Fluxo principal

### 1. Detectar estado

```bash
# Lê MEMORY.md, extrai flags
onboarding_complete=$(grep "onboarding_complete:" MEMORY.md)
progress=$(grep "mini_curso_progress:" MEMORY.md || echo "nada")
whisper_reminder=$(grep "whisper_reminder_at:" MEMORY.md)
```

### 2a. Se tem pulo agendado vencido (prioridade alta)

```
"Antes de avançar, lembra que você me pediu pra te chamar sobre o
Whisper? Tá no horário.

→ Quer ativar agora? (~5min) — manda 'sim' ou 'ativa whisper'
→ Ou prefere mantém adiado? — manda 'mantém'

(Sem pressão — você sempre pode voltar com 'ativa whisper')"
```

Após resposta, retomar fluxo normal (continuar pra próxima aula da Hotmart).

### 2b. Se sem progresso (primeira vez no `continuar-jornada`)

**Antes de responder:** Read `$WORKSPACE/_curso/INDICE.md` pra carregar mapa atualizado das 31 aulas.

```
"Show, vamos avançar.

Você completou o **Bloco A do kit** (entrada — setup do agente). Próximo é começar o **mini-curso na Hotmart**, que tá organizado em 6 módulos:

- Módulo 1 — Boas-vindas e Introdução (Aulas 0, 0.1, 0.2)
- Módulo 2 — Ativando seu Openclaw (Aulas 1, 1.1, 1.2, 2, 2.1)
- Módulo 3 — Configuração do Openclaw (Aulas 3-7)
- Módulo 4 — Skills, Crons, Heartbeats e Segurança (Aulas 8-10.4)
- Módulo 5 — Integrações (Aulas 11-12.3)
- Módulo 6 — Multiagentes e Mission Control (Aulas 13-15)

Recomendo começar pela **Aula 0** (O que você precisa saber pra começar). Material fica em `_curso/aulas/aula-00-visao-stack.html` se você quiser que eu te conduza por aqui.

→ Manda **`aula 0`** que eu te oriento e abro o material
→ Quando assistir na Hotmart, manda **`aula 0 feito`** que eu marco em MEMORY e te aponto pra próxima"
```

**Aguardar resposta.** Se aluno pedir 'aula X', responder com URL canonical Hotmart (abaixo) E carregar trecho relevante de `_curso/aulas/aula-XX-tema.html` pra estar pronto pra conduzir. Se aluno mandar 'aula X feito' depois, marcar `mini_curso_progress: aula_X_concluida` em MEMORY.md (substitui `.` por `_` em subaulas: `aula 12.2 feito` → `aula_12_2_concluida`).

### Tabela aula → URL Hotmart + material local (kit v2.5.4)

⚠️ **Honesto:** as aulas do mini-curso vivem TODAS em `https://app.hotmart.com/`. O link específico de cada aula está dentro da plataforma (descrição do módulo). NÃO inventar URLs específicas — agente alucinaria.

**Mas o MATERIAL escrito de cada aula tá local em `$WORKSPACE/_curso/aulas/aula-XX-tema.html`.** Aluno NÃO precisa abrir o HTML — agente lê e conduz. Aluno só precisa do vídeo na Hotmart.

Quando aluno pede `aula X` (qualquer aula 0/0.1/.../15), responder canonical:

```
"A aula tá em **https://app.hotmart.com/** — faz login com a conta que comprou o curso, navega pro mini-curso OpenClaw v2 e abre **Aula {X} — {título da aula}** no módulo correspondente.

Já carreguei o material pra te conduzir aqui no Telegram em paralelo. Pode assistir o vídeo e me chamar com qualquer dúvida — eu já sei o conteúdo.

Quando terminar, manda **`aula {X} feito`** que eu marco em MEMORY e te aponto pra próxima.

Se você recebeu este kit avulso (sem login Hotmart), peça acesso à Pixel — `bruno@microsaas.com.br`."
```

**Substituições:**
- `{X}` — número da aula extraído do comando: "aula 5" → `5`, "aula 12.2" → `12.2`
- `{título}` — Read `_curso/INDICE.md`, extrair título canonical da tabela

**Aplica a TODAS as 31 aulas** (Módulos 1-6). Use INDICE.md como fonte canônica do mapeamento aula → arquivo + título.

### 2c. Se tem progresso parcial (ex: `aula_5_concluida: true`)

**Antes de responder:** Read `$WORKSPACE/_curso/INDICE.md` pra identificar a próxima aula da sequência.

```
"Você já completou:
✓ Bloco A do kit (setup)
✓ Aula 5 — Identidade, Soul, Agents, User

Próxima: **Aula 6 — Organizando Workspace do seu Agente**

→ Manda 'aula 6' pro link e pra eu carregar o material
→ Quando terminar, manda 'aula 6 feito'"
```

(Adapta conforme progresso detectado em MEMORY. INDICE.md tem a ordem.)

### 2d. Se completou Aula 15 (conclusão)

```
"Você completou as 31 aulas dos 6 módulos. Brabo demais.

A partir daqui, 2 caminhos:
1. **Pixel AI Hub** — agente pra empresa toda, equipe, governance, escala. Aula 15 já te apresentou: aihub.pixeleducacao.com.br
2. **Trabalho real** — me peça o que quiser, seu agente tá pronto

Quer ir pro Hub ou já entrar em modo operação?"
```

### 3. Atualizar MEMORY.md ao avançar

Sempre que aluno marcar uma aula como concluída ('aula 5 feito', 'aula 12.2 feito', etc):

```markdown
## Flags
mini_curso_progress: aula_{X}_concluida   # ex: aula_5_concluida, aula_12_2_concluida

## Decisões da jornada
- {data}: Concluiu Aula {X} — {título} do mini-curso. Próxima: Aula {Y} — {título}.
```

**Convenção pra subaulas:** ponto vira underscore. `aula 12.2 feito` → `aula_12_2_concluida` (Hotmart usa numeração decimal, mas YAML não aceita ponto em chave sem aspas).

Atualizar `last_activity_at` + manter histórico cumulativo.

### 4. Devolver controle pro modo CHAT NORMAL

Após orientar o próximo passo, NÃO fica em loop. Aluno tá no modo `complete_active` — comandos canônicos de retomada continuam disponíveis (`continuar`, `retomar`, etc).

## Mapeamento Aula → Material

**Fonte canônica:** `$WORKSPACE/_curso/INDICE.md` — mapa completo das 31 aulas Hotmart (6 módulos) → arquivo de material + tabela de aliases por tema.

**Não duplique a tabela aqui.** Sempre que precisar do mapa, faça `Read("_curso/INDICE.md")`. Razão: 1 fonte de verdade. Se Bruno reorganizar a Hotmart no futuro, atualiza só o INDICE.

**Estrutura geral (recap rápido):**

- **Módulo 1** — Boas-vindas (Aulas 0, 0.1, 0.2)
- **Módulo 2** — Ativando Openclaw (Aulas 1, 1.1, 1.2, 2, 2.1)
- **Módulo 3** — Configuração (Aulas 3-7)
- **Módulo 4** — Skills/Crons/Heartbeats/Segurança (Aulas 8-10.4)
- **Módulo 5** — Integrações (Aulas 11-12.3)
- **Módulo 6** — Multiagentes/Mission Control (Aulas 13-15)

## Critérios de sucesso

- [ ] Aluno SAIU da primeira-vitoria sabendo que pode continuar
- [ ] `continuar` / `retomar` despacham essa skill
- [ ] Estado de progresso (mini_curso_progress) registrado em MEMORY.md
- [ ] Aluno consegue rastrear próxima aula sem precisar lembrar nome
- [ ] Pulos pendentes têm prioridade antes de avançar bloco

## Erros comuns

- **Aluno manda "continuar" sem ter completado primeira-vitoria:** verificar `onboarding_complete: true`. Se false, redirecionar pra `onboarding-checklist`.
- **Aluno manda "aula X feito" sem ter assistido o vídeo:** confiar no aluno, marcar como concluído. Se quiser, perguntar "tudo claro? Algo da aula ficou pendente?"
- **Agente improvisa sobre conteúdo da aula:** ⚠️ NÃO improvisar. Sempre Read `_curso/INDICE.md` + `_curso/aulas/aula-XX-tema.html` correspondente ANTES de responder pergunta sobre tema da aula (Princípio 18 — `0-LEIA-PRIMEIRO-AGENTE.md`).
- **Aluno usa nome antigo (B1/C1/D1/E0/R1):** pode acontecer com aluno que pegou material antigo ou viu screenshot legado. Aceite e converta: "B1" → Aula 5, "C2" → Aula 8, etc. Confirme com aluno: "você quer dizer Aula 5 (Identidade)? — manda 'aula 5 feito' que eu marco." Não invente equivalência; consulte INDICE se em dúvida.

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

Especialmente relevantes:
- **Princípio 11 (detectar antes de pedir):** lê estado de MEMORY.md ANTES de propor próximo passo
- **Princípio 5 (atualizar MEMORY ao concluir):** marca `mini_curso_progress` a cada aula
- **Princípio 7 (em dúvida, pergunte):** se estado ambíguo, perguntar ao aluno antes de inferir

## Modo A vs Modo B

**Modo A (aula-por-aula — formal):**
```
"Bora pra próxima aula do mini-curso: Aula 5 — Identidade, Soul, Agents, User.
Recomendo MUITO assistir antes (~12min). Manda 'aula 5' pro link
e 'aula 5 feito' quando terminar — eu carrego o material em paralelo
pra te conduzir aqui no Telegram."
```

**Modo B (conversacional — wizard direto):**
```
"Próximo passo do mini-curso: Aula 5 mergulha fundo na identidade do agente
(SOUL/IDENTITY/AGENTS/USER). Quer começar? Manda 'aula 5'."
```

## Status

✅ ATIVO desde v2.1 do Starter Kit. v1.3 (kit v2.5.4 — 07/05/2026): renomeação Bloco/B1/C1/etc → Aulas Hotmart + uso de `_curso/INDICE.md` como fonte canônica.

## Roadmap

- v1.4: Detecção automática de progresso via análise do workspace (ex: detectar que aluno criou skill custom = Aula 8 completa) — sem precisar do aluno mandar "aula 8 feito"
- v1.5: Carregamento automático de trecho relevante do HTML quando aluno fizer pergunta sobre tema (sem aluno precisar mencionar número de aula)
- v2: Memória semântica das transcrições (embeddings) pra busca melhor

## Referências

### Internas
- **Mapa canônico das aulas:** [`$WORKSPACE/_curso/INDICE.md`](../../../../_curso/INDICE.md) — fonte da verdade do mapeamento Hotmart ↔ arquivo de material
- **Material das aulas:** [`$WORKSPACE/_curso/aulas/`](../../../../_curso/aulas/) — 17 HTMLs + transcrição completa
- Pergunta-âncora oficial (modo A): [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md)
- Princípios defensivos (incluindo P18 — uso de _curso/): [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)

### Externas
- Plataforma do mini-curso: `https://app.hotmart.com/` (link específico de cada aula está dentro do módulo na plataforma). NÃO alucinar URLs por aula.
