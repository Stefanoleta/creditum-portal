---
name: primeira-vitoria
status: ATIVO
category: starter
owner: aluno
version: 2.2
mode: guided
estimated_time: 5min
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "primeira vitória" / "vamo gerar algo", OR when dispatched by onboarding-checklist as passo 6 (último). Generates first real artifact (post, email, decisão registrada) using IDENTITY + USER + Brave Search. Saves to content/drafts/ and shows the path. **v2.2 (kit v2.5.2 — fix Adrylan UX cognitivo primeira-vitoria): opções tipo de artefato passam a usar NOMES inline (Post / Email / Decisão / Checklist / Outro) em vez de `a/b/c/d/e` apenas. Plus: bot CONFIRMA escolha antes de refinar ("Beleza, vamos fazer um Email. Sim/trocar?"). Caso real Adrylan 03/05 17:39: aluno escolheu `b` esperando "Checklist", mas `b` era "Email" — bot foi pra fluxo email (correto), aluno se perdeu, eventualmente bot reordenou e salvou como "decisão registrada". Aluno NÃO recebeu o que escolheu. v2.5.2 elimina ambiguidade de letra + pega erro antes do refinamento.** v2.1 (kit v2.5 — stress test round 2): (1) auto-arquivamento usa `$WORKSPACE/` prefixado em vez de path relativo (fix Letícia local-dev — `mv starter-kit/...` retornava 0 mesmo se cwd ≠ workspace = falha silenciosa que P14 não pegava); (2) P14 mostra contagem REAL pós-mv (`ARCHIVED_COUNT` do `ls $ARCHIVE_DIR | wc -l`), não output esperado hardcoded; (3) mensagem final pós-vitória bifurca em 4 variantes baseadas em `modo_jornada` (aula vs wizard) + `tem_minicurso` (true vs false): Modo B sem nomenclatura A0-A6 (fix Gustavo); avulso troca "Bloco B Hotmart" por CTA Pixel (fix Letícia — não-disrespect aluno sem login).** v2.0 (kit v2.4): mensagem final reescrita: (1) A6 mencionada explicitamente — antes ficava órfã pós-vitória; (2) ponte honesta pro Bloco B — antes "continuar → próximo passo Bloco B" implicava condução, agora deixa claro "kit acabou, Hotmart conduz daqui — eu marco progresso"; (3) `restaura manuais` ganha 1 linha lembrando que existe (caso aluno volte dias depois confuso); (4) terminologia atualizada de "passo 0..6" pra "A0..A6" (Modo A v2 — coerência com aula-menus.md).** v1.7 (kit v2.2 final): auto-arquivamento (consentimento informado P1). v1.6: header P13/14/15. v1.5: comandos retomada visíveis. v1.3: 3 critical guards.
---

# Primeira Vitória — Passo 6 (último, vitória visível)

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
> **P15 — Mensagens `<canonical>` literais.** As 4 opções pós-vitória + comandos de retomada são CANONICAL — usar LITERAL. Não reformula, não "melhora", não substitui exemplos. Ajustar TOM (formal/casual via SOUL.md) é OK; estrutura/ordem/keywords técnicas preservadas.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — as 4 opções pós-vitória + mensagem final com comandos de retomada (`continuar`/`retomar`/`config`/`ajuda`) viram listas explícitas.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

## Promessa

Em ~5min, aluno tem o primeiro artefato CONCRETO entregue pelo agente: um post salvo, um email rascunhado, uma decisão registrada. Arquivo no caminho previsto (`content/drafts/`), editável, em formato markdown.

Esse é o momento de vitória — onde aluno PERCEBE que não comprou só "mais um chatbot": comprou uma extensão da própria cabeça que entrega trabalho.

NPS aparece aqui (decisão D9): após primeira vitória, aluno tá no topo da curva de promoter score.

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 6 (último)

**Trigger explícito (standalone):**
- "primeira vitória"
- "vamo gerar algo"
- "primeiro post"
- "vamo testar"

**NÃO disparar se:**
- `first_win_completed=true` em `MEMORY.md` E `content/drafts/` tem ao menos 1 arquivo

Se aluno mandar trigger explícito mesmo já tendo primeira vitória:

```
"Você já fez sua primeira vitória em {data}. Quer:
a) Gerar OUTRO artefato (mesmo fluxo)
b) Reabrir a primeira (em content/drafts/{arquivo})
c) Cancelar"
```

## Dependência: passos 3, 4, 5

Sem autonomia (3): vou pedir aprovação a cada call do Brave + cada salvamento.
Sem workspace (4): não tenho onde salvar.
Sem chave Brave (5): não consigo buscar referências.

Aviso quando dependência não cumprida (mesmo padrão dos wizards anteriores).

## Princípio 11 — Detecção antes de pedir

Antes de gerar, checa:

```
1. Existe content/drafts/primeira-vitoria-*.md?
   - Sim: aluno já fez. Pergunta se quer gerar outra ou só re-abrir.
   - Não: fluxo normal.

2. Existe drafts em content/drafts/ (mesmo que não seja primeira-vitoria)?
   - Sim: aluno já usou agente em outra sessão. OK, não bloqueia.
   - Não: caso típico.
```

## Fluxo principal

### 1. Narrar promessa

```
"Chegou a hora boa. Em 5min você sai daqui com um artefato REAL
no seu workspace.

Vou:
1. Te perguntar QUE tipo de coisa você quer entregar
2. Pesquisar referências no Brave Search (se for sobre tema externo)
3. Escrever um draft seguindo seu USER.md (tom + contexto)
4. Salvar em content/drafts/primeira-vitoria-{tipo}-{data}.md
5. Te mostrar onde tá pra você editar

A diferença pra ChatGPT: o arquivo fica no SEU workspace, em
markdown, editável. Você abre no editor que preferir, ajusta o que
quiser, e usa.

Bora?"
```

### 2. Perguntar tipo (REESCRITO em kit v2.5.2 — fix Adrylan UX cognitivo)

⚠️ **kit v2.5.2 fix:** anteriormente opções eram `a/b/c/d/e` apenas com letra. Aluno PME (caso Adrylan 03/05 17:39) escolheu `b` esperando "checklist", mas `b` era "Email" — bot foi pra fluxo de email corretamente, aluno se confundiu, eventualmente bot reordenou e salvou como "decisão registrada" (`c`). 4 turnos perdidos. Causa: aluno lê rápido, associa letra com palavra que tá em mente, NÃO com letra real. Fix: opções com **nome inline** (não só letra) + bot **confirma escolha antes de avançar pra refinamento**.

**Texto canonical (P15 — literal):**

```
"O que você quer entregar?

Opções comuns:

- **Post** — 200-400 palavras sobre {tema relevante pro que você faz}
- **Email** — pra alguém específico (cliente, colega, fornecedor)
- **Decisão** — algo que você decidiu recentemente e quer registrar
- **Checklist** — lista/rotina sobre {tema}
- **Outro** — me conta o que precisa

Manda o **nome** (post, email, decisão, checklist) ou descreve. Pode ser bem específico: 'post pra LinkedIn sobre 3 erros que cometo na padaria'."
```

(Letras `a/b/c/d` removidas — aluno usa o nome direto, sem possibilidade de confusão.)

Salvar `tipo_artefato` em estado temporário.

### 2.5. Confirmar escolha antes de refinar (NOVO em kit v2.5.2)

Antes de avançar pra refinamento (passo 3), agente CONFIRMA a escolha:

```
"Beleza — você escolheu **{tipo_extenso}**. É isso mesmo?

Sim → vou refinar com algumas perguntas curtas
Trocar → me diz qual outro (post / email / decisão / checklist / outro)"
```

**Substituir** `{tipo_extenso}` por: "Post", "Email", "Decisão registrada", "Checklist" ou "Outro".

**Comportamento por resposta:**

| Resposta | Ação |
|---|---|
| `sim` / `é` / `confirma` / `pode` | Avançar pra passo 3 (Refinar conforme tipo) |
| `trocar` / `não` / nome de outro tipo | Refazer pergunta tipo (passo 2). Se aluno mandou outro nome direto, validar e confirmar de novo |
| Resposta ambígua | Repetir confirmação literal (P15+P7 — não inferir) |

**Falha real PREVENIDA (caso Adrylan 03/05 17:39-17:43):** aluno escolheu `b` esperando "Checklist" (era `Email`), bot foi pra fluxo email ("Pra quem?"), aluno confuso disse "não sei o que fazer", bot abandonou, propôs novo menu, aluno escolheu `c`, bot salvou como "decisão registrada" (que era `c` na lista original — opção 4). Resultado: aluno NÃO recebeu o que escolheu. v2.5.2 garante: nome inline elimina ambiguidade de letra; confirmação dupla pega erro antes do refinamento.

### 3. Refinar (perguntas curtas conforme o tipo)

#### Se "a) Post":

```
"Sobre o que? Quanto mais específico, melhor.

Exemplos:
- 'Post sobre como organizo o dia na padaria'
- 'Post sobre o erro mais caro que cometi nos últimos 6 meses'
- 'Post sobre por que troquei [ferramenta] por [outra]'

Manda em 1 linha."
```

Pra plataforma:

```
"Pra qual rede social ou canal?
- LinkedIn (texto técnico, parágrafos curtos)
- Instagram (foto + caption longa)
- Newsletter (mais profundo, ~800 palavras)
- Outro
"
```

#### Se "b) Email":

```
"Pra quem? E qual o assunto principal em 1 frase?

Ex: 'Email pro Pedro, fornecedor de farinha, pedindo desconto
porque tô comprando mais volume'."
```

#### Se "c) Decisão":

```
"Que decisão? Em 1-2 linhas.

Ex: 'Decidi parar de fazer entrega aos domingos. Volume baixo
não compensa o custo do entregador.'"
```

#### Se "d) Checklist":

```
"Sobre que processo? E pra quem usar?

Ex: 'Checklist de fechamento da padaria à noite, pra usar quando
funcionário novo treina'."
```

#### Se "e) Outro":

```
"Manda detalhe. Quanto mais contexto, melhor."
```

Salvar `tema_artefato` + `contexto_adicional`.

### 4. Buscar referências (opcional, dependendo do tipo)

Se artefato é POST sobre tema que tem benefício de pesquisa externa:

```
"Vou buscar 2-3 referências no Brave pra contextualizar."
```

Roda 1 query no Brave Search:

```bash
curl -s -H "X-Subscription-Token: $BRAVE_SEARCH_API_KEY" \
     "https://api.search.brave.com/res/v1/web/search?q={query_url_encoded}" \
     | jq '.web.results[0:3]'
```

Mostra ao aluno:

```
"Achei essas 3 referências:

1. {título_1}
   {snippet_1}
   {url_1}

2. {título_2}
   {snippet_2}
   {url_2}

3. {título_3}
   {snippet_3}
   {url_3}

Vou usar como inspiração + dar atribuição se citar dados específicos."
```

Se artefato é EMAIL ou DECISÃO ou CHECKLIST: **pular Brave** (não precisa de pesquisa). Direto pra geração.

### 5. Gerar artefato

Antes de gerar, ler:
- `IDENTITY.md` (pra usar nome do agente quando se referir a si)
- `SOUL.md` (tom)
- `USER.md` (contexto do aluno + tom preferido)

Gerar conteúdo seguindo:
- Tom: do `tom_preferido` em USER.md + diretrizes de SOUL.md
- Estrutura: padrão da plataforma escolhida (LinkedIn = parágrafos curtos, etc)
- Comprimento: respeita o que aluno pediu (200-400 palavras pra post LinkedIn, etc)
- Referências: se buscou no Brave, citar de forma natural (não "fonte 1, fonte 2")

### 6. Salvar arquivo

Path: `content/drafts/primeira-vitoria-{tipo_curto}-{YYYY-MM-DD}.md`

Exemplo: `content/drafts/primeira-vitoria-post-2026-05-02.md`

Estrutura do arquivo:

```markdown
# {título_artefato}

> Gerado em: {data} pela primeira-vitoria do {nome_agente}
> Tipo: {tipo_artefato}
> Plataforma destino: {plataforma_se_aplicavel}

---

{conteúdo gerado}

---

## Referências (se aplicável)

- {url_1} — {título_1}
- {url_2} — {título_2}

---

## Como usar

- **No celular (Telegram):** o conteúdo inteiro tá no chat acima. Você pode COPIAR daqui direto pra colar no LinkedIn / WhatsApp / Instagram / email. Se quiser refazer em outro tom, manda 'refaz com {ajuste}' que eu salvo nova versão e te mostro.
- **No computador (web/painel Hostinger):** abre o painel do Managed → File Manager → navega até `content/drafts/{arquivo}.md`. Edita lá direto.
- **Avançado:** se você usa VS Code/Obsidian com sync do workspace, abre por lá.
- Quando publicar/enviar, mover de `content/drafts/` pra `content/archive/`.
```

### 7. Mostrar caminho ao aluno + entregar conteúdo USÁVEL

```
"✓ Pronto. Salvei em:

  content/drafts/primeira-vitoria-{tipo}-{data}.md
  ({tamanho} bytes, ~{N} palavras)

Aqui tá o conteúdo INTEIRO pra você copiar:

---

{conteúdo gerado COMPLETO — pra Telegram dar pra copiar direto. Se for
muito grande (>2000 chars), divide em 2-3 mensagens pra não cortar.}

---

3 jeitos de usar:

📱 **No celular agora:** copia o texto acima direto do Telegram
   (pressiona, 'Copiar') e cola no LinkedIn / WhatsApp / etc.

💻 **No computador:** abre o painel da Hostinger Managed → File Manager →
   navega até `content/drafts/primeira-vitoria-{tipo}-{data}.md`. Edita lá.

🔄 **Refazer:** manda 'refaz com {ajuste}' (ex: 'mais curto', 'mais técnico',
   'tira a parte sobre X'). Eu versiono a antiga em archive/ e gero v2.

A versão salva é a v1. Você sempre tem palavra final."
```

### 8. Pergunta-âncora

Pergunta literal (mapa-aulas.md passo 6):

```
"Rapidão antes de fechar este passo: esse arquivo que eu acabei de
criar — onde ele tá salvo? Você consegue editar ele depois pra
ajustar antes de publicar?"
```

| Resposta esperada | Validação |
|---|---|
| "em content/drafts/" + "sim posso editar" | "Isso. `content/drafts/primeira-vitoria-{data}.md`. Você pode abrir no editor que preferir, ajustar o que quiser, e usar. Tudo que eu crio fica visível e editável — você sempre tem palavra final." |
| Quase / parcial | "`content/drafts/primeira-vitoria-{data}.md`. Markdown puro, abre em qualquer editor (VS Code, Obsidian, até bloco de notas). Pode editar tudo, eu não trava nada." |

Fechar com:

```
"Se quer aprofundar como skills funcionam (e como criar skill própria
pra repetir esse fluxo automatizado), a aula é a Aula 8 (Tudo que você precisa saber sobre Skills)
— manda 'aula 8'.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 6 como feito — você completou a jornada. 🎉

[próximo bloco: retomada de pulos opcionais]"
```

### 8.5. Retomar pulos opcionais (v1.9)

⚠️ **Nova seção v1.9:** antes do convite a colaborar (NPS antigo), checar se aluno tem pulos opcionais pendentes (atualmente: só Whisper, mas extensível). Se tiver, listar e oferecer retomar AGORA — antes de fechar a sessão.

**Detecção:**

Ler `MEMORY.md` e checar flags:

| Flag detectada | Significa |
|---|---|
| `whisper_reminder_at: {timestamp}` (sem `whisper_configured: true`) | Aluno pulou Whisper com agendamento — NÃO retomado ainda |
| `whisper_skipped_permanently: true` (sem `whisper_configured: true`) | Aluno pulou Whisper definitivo — NÃO oferecer retomar aqui (só lembrar 1x que pode voltar) |
| `whisper_configured: true` | Configurado, ignora |

**Se tiver pulo agendado** (`whisper_reminder_at`):

```
"Antes de fechar — você pulou o Whisper no início e me pediu pra te
chamar amanhã. Mas você ainda tá aqui agora, então vamos aproveitar:

→ Quer ativar Whisper agora? (~5min)
→ Ou mantém o lembrete pra amanhã?

Manda 'agora' ou 'mantém'."
```

| Resposta | Ação |
|---|---|
| "agora" / "ativa" / "vamos" | Re-disparar `wizard-whisper-quick` (modo de retomada — agente já sabe que aluno foi convidado, não repete tudo do zero) |
| "mantém" / "amanhã" / "depois" | "Beleza, mantenho o lembrete. Te chamo {data}. Bora pro próximo passo." |

**Se tiver pulo definitivo** (`whisper_skipped_permanently`):

```
"Lembrete leve: você pulou o Whisper definitivamente no início. Sem
pressão — você pode voltar quando quiser, é só me pedir 'ativa
whisper'. Bora pro próximo passo."
```

(Não pergunta se quer fazer agora — aluno foi explícito que era definitivo. Só lembra 1x que a porta está aberta.)

**Se NÃO tiver pulo pendente:** seguir direto pro próximo bloco (convite a colaborar).

**Por que essa seção existe (v1.9):**

Antes da v1.9, pulos viravam flags órfãs (`whisper_skipped: true`) sem que o aluno fosse lembrado. Maioria nunca voltava. Bruno pediu (02/05): "no final do onboarding, não é legal o wizard voltar para as perguntas que pulou".

Esta seção fecha esse loop ANTES do aluno sair, no momento de pico de engajamento (acabou de ter primeira vitória — receptivo).

### 9. Convite a colaborar (substitui NPS quantitativo — v1.9)

⚠️ **Mudança importante (v1.9):** o NPS quantitativo no chat foi removido. Razão: sem skill ouvinte de feedback rodando, o número ficava órfão (salvo em MEMORY.md local, sem rota de chegada pro Bruno). Vira teatro. Substituído por convite com 2 caminhos REAIS de chegada.

```
"Antes de fechar a jornada — quer me ajudar a melhorar o kit?

Dois jeitos, escolhe o que te encaixa (ou os dois):

📊 NPS rápido (1 pergunta + comentário, ~1min):
   https://tally.so/r/obyy1V

💬 Direto no grupo dos alunos:
   https://t.me/cursoopenclaw — me marca lá com o que mais te marcou
   (vai direto pro Bruno)

Sem pressão — você pode seguir pros próximos passos sem responder
nada. Mas se mandar, vira melhoria real no kit."
```

**Comportamento do agente:**
- NÃO esperar resposta antes de seguir pros próximos passos
- NÃO insistir se aluno não responder
- Se aluno mandar comentário inline ("achei massa", "travei no passo 3"): agradecer + reforçar o link Tally/grupo pra colaboração estruturada. NÃO salvar como `nps_score` (não é mais quantitativo no agente)
- Salvar em MEMORY.md apenas: `feedback_invited_at: {timestamp}` (pra debug futuro — mostra que o convite foi feito)

**O que NÃO fazer:**
- ❌ Pedir nota numérica de 0-10 no chat (era o teatro antigo)
- ❌ Prometer "leio tudo" no chat (sem rota de leitura, era mentira)
- ❌ Mencionar email `bruno@microsaas.com.br` (canal removido em v1.8)

### 10. PRÉ-CHECK obrigatório: verificar TODAS as flags antes de pós-vitória

⚠️ **CRÍTICO — não pular este passo.** Antes de oferecer pós-vitória, ler `MEMORY.md` e checar 7 flags:

| Flag | Esperado | Se diferente |
|---|---|---|
| `whisper_configured` | true OU `whisper_skipped: true` | Voltar pro passo 0 |
| `agente_configured` | true | Voltar pro passo 1 |
| `aluno_configured` | true | Voltar pro passo 2 |
| `autonomia_liberada` | true | Voltar pro passo 3 |
| `workspace_organizado` | true | Voltar pro passo 4 |
| `conectado` | true | Se `partial`, voltar pra completar (ver abaixo). Se `false`, voltar pro passo 5. |
| `first_win_completed` | true (acabou de marcar acima) | — |

**Se `conectado: partial`** (passo 5 incompleto), checar flags individuais:
- `backup_active: postponed` → "Antes de pós-vitória, faltou ativar o backup automático (passo 5). Sem isso, se algo der errado no workspace, você perde tudo até o último snapshot do Hostinger. Bora ativar agora? (3min)"
- `brave_search_active: false` → "Faltou conectar Brave Search (passo 5). Sem isso, eu não consigo pesquisar web — fica limitada à URL que você manda. Bora? (5min)"
- `github_token_active: false` → "Faltou GitHub Token (passo 5). Sem isso, sem backup. Bora? (5min)"

**Comportamento:**
- Se aluno aceitar: re-disparar `wizard-conectar` (modo edição parcial — só completa o que falta)
- Se aluno explicitamente declinar ("não quero, segue"): atualizar flag pra `skipped` (não `false`/`postponed`) + log da decisão. Aí oferece pós-vitória.

**NÃO oferecer pós-vitória com flags em `false` ou `postponed`** — vira bug onde aluno acha que tudo tá pronto mas falta coisa essencial. Ou completa, ou explicitamente skip.

### 11. Auto-arquivar material de instalação + Renderizar checklist final completa

⚠️ **NOVO em v1.7 (kit v2.2 final):** antes de renderizar a checklist, executar o **auto-arquivamento** do material de instalação. Boas-vindas universal já avisou o aluno na 1ª mensagem ("Quando a jornada terminar, arquivo automaticamente os manuais...") — consentimento informado (P1).

#### 11a. Auto-arquivamento (P14 — smoke test visível)

⚠️ **kit v2.5 — fix Letícia stress test:** comandos usam **`$WORKSPACE/` prefixado** (não path relativo). Sem prefix, `mv starter-kit/...` retorna 0 mesmo se cwd ≠ workspace e arquivo não existe — falha silenciosa que P14 não pegava (aluno via "✅ Material arquivado" sem nada movido). Plus: P14 mostra contagem REAL pós-mv, não output esperado hardcoded.

Comandos a executar (mostrar comando + output literal pro aluno):

```bash
# 0. Garante que $WORKSPACE está setado (fallback pro cwd se ausente)
WORKSPACE="${WORKSPACE:-$(pwd)}"

# 1. Criar pasta de arquivamento com data
ARCHIVE_DIR="$WORKSPACE/archive/starter-kit-onboarding-$(date +%Y-%m-%d)"
mkdir -p "$ARCHIVE_DIR"

# 2. Mover material de instalação (manuais, FAQ, manifesto, exemplos, templates, CHANGELOG)
[ -f "$WORKSPACE/starter-kit/0-LEIA-PRIMEIRO-AGENTE.md" ] && mv "$WORKSPACE/starter-kit/0-LEIA-PRIMEIRO-AGENTE.md" "$ARCHIVE_DIR/"
[ -f "$WORKSPACE/starter-kit/README.md" ] && mv "$WORKSPACE/starter-kit/README.md" "$ARCHIVE_DIR/"
[ -f "$WORKSPACE/starter-kit/CHANGELOG.md" ] && mv "$WORKSPACE/starter-kit/CHANGELOG.md" "$ARCHIVE_DIR/"
[ -f "$WORKSPACE/starter-kit/FAQ.md" ] && mv "$WORKSPACE/starter-kit/FAQ.md" "$ARCHIVE_DIR/"
[ -f "$WORKSPACE/starter-kit/manifesto.md" ] && mv "$WORKSPACE/starter-kit/manifesto.md" "$ARCHIVE_DIR/"
[ -d "$WORKSPACE/starter-kit/exemplos" ] && mv "$WORKSPACE/starter-kit/exemplos" "$ARCHIVE_DIR/"
[ -d "$WORKSPACE/starter-kit/templates" ] && mv "$WORKSPACE/starter-kit/templates" "$ARCHIVE_DIR/"

# 3. NÃO mover starter-kit/skills/ — skills funcionais já estão em workspace/skills/ ativas
#    Se starter-kit/skills/ ainda tem conteúdo (skills NÃO instaladas), deixar onde está

# 4. Se starter-kit/ ficou vazia (todas skills foram pra workspace/skills/), remover
[ -z "$(ls -A "$WORKSPACE/starter-kit/" 2>/dev/null)" ] && rmdir "$WORKSPACE/starter-kit/"

# 5. CONTAR e listar o que foi movido (P14 — mostrar real)
ARCHIVED_COUNT=$(ls -1 "$ARCHIVE_DIR/" 2>/dev/null | wc -l | tr -d ' ')
echo "✓ Arquivados: $ARCHIVED_COUNT itens em $ARCHIVE_DIR"
ls -la "$ARCHIVE_DIR/"
```

**Output esperado mostra contagem REAL** (P14 — não hardcode):

Se contagem = 0, mensagem ao aluno EXPLICITA: "⚠️ Material de instalação não encontrado (talvez já foi arquivado em sessão anterior, ou starter-kit/ não está em $WORKSPACE)". NÃO afirmar "✅ arquivado" sem ter movido nada.

Se contagem > 0, narrar literal:

```
"✓ Arquivados: {ARCHIVED_COUNT} itens em {ARCHIVE_DIR}.
{ls -la output literal}"
```

**Se algum mv falhar individualmente** (arquivo não existe, permissão negada): NÃO abortar — registrar em log e continuar. Auto-arquivamento é best-effort. **MAS:** P14 + contagem real REVELA falhas — se 7 arquivos esperados e contagem = 2, alunos vê e pode reportar.

**Atualizar MEMORY.md:**

```yaml
kit_archived_at: 2026-05-03T13:30:00-03:00
kit_archive_path: archive/starter-kit-onboarding-2026-05-03/
kit_archived_files: [0-LEIA-PRIMEIRO-AGENTE.md, README.md, CHANGELOG.md, FAQ.md, manifesto.md, exemplos/, templates/]
```

#### 11b. Renderizar checklist final completa (REESCRITA em kit v2.5 — branching modo_jornada + tem_minicurso)

⚠️ **kit v2.5 — fix Gustavo + Letícia stress test:** mensagem final ANTES era hardcoded em linguagem Modo A (A0-A6, "vi A6", "Bloco B Hotmart"). Aluno em Modo B (sem aulas) ou avulso (sem mini-curso) recebia mensagem que contradizia o caminho dele. v2.5 bifurca em 4 combinações:

```
modo_jornada = aula | wizard
tem_minicurso = true | false
                                                            v
                                            ┌───────────────┴────────────────┐
                                            │                                │
                          modo_jornada: aula                modo_jornada: wizard
                          tem_minicurso: true              (combinações abaixo)
                                ↓                                ↓
                          [VARIANTE A1]                   [VARIANTES B*]
```

**Devolver controle pra `onboarding-checklist`** que lê `modo_jornada` + `tem_minicurso` em MEMORY e escolhe variante.

---

### VARIANTE A1 — Modo aula + tem mini-curso (caminho canonical original v2.4)

```
=== Sua jornada — Bloco A COMPLETA 🎉 ===

[x] A0. Áudio (Whisper) {configurado | skipped}
[x] A1. Login Managed (pré-req — já feito antes do kit)
[x] A2. Personalidade (agente + sua)
[x] A3. Telegram bot (pré-req — já feito antes do kit)
[x] A4. Desbloqueio (autonomia + workspace + superpoderes)
[x] A5. Primeira vitória ({content/drafts/primeira-vitoria-{data}.md})
[ ] A6. Debug primeiros socorros — referência permanente, sem config

⚠️ Você ainda não viu **A6** (debug). É a aula que ensina a categorizar erros e saber pedir ajuda — vale assistir DEPOIS, fica como referência. Quando assistir, manda `vi A6` que eu marco.

✅ **Material de instalação arquivado** em `{ARCHIVE_DIR}` ({ARCHIVED_COUNT} itens). Workspace limpo. Manda `restaura manuais` se quiser trazer de volta.

---

**Importante: o kit acabou aqui.**

O Starter Kit cobre o Bloco A (entrada). Daqui pra frente, o mini-curso continua no **Hotmart** (31 aulas em 6 módulos) — você assiste cada aula, volta pra mim, e eu marco progresso e te ajudo no que cada aula ensinou. **Eu não conduzo wizard pelo conteúdo das aulas (Aula 5 em diante)** (ainda) — você é o motorista a partir daqui.

→ **`continuar`** — eu te indico qual aula assistir agora (começa pela Aula 0 — O que você precisa saber pra começar)
→ **`retomar`** — re-renderiza esta checklist (caso queira retomar pulos pendentes)
→ **`ajuda`** — menu completo de comandos
→ **`config`** — mudar algo do setup (nome do agente, autonomia, chaves, etc)

Ou me peça uma **tarefa real** (escreve um post sobre X, organiza minhas decisões da semana, etc) — eu funciono igual sem precisar de wizard.

**Suas configurações ficam salvas se você sair. Volta a hora que quiser.**

---

Avulsos (caso queira ativar AGORA):

- `ativa whatsapp` — WhatsApp como canal extra (read-only)
- `instala superpowers` — skills de planejamento (brainstorming, plans, debugging)
- `restaura manuais` — trazer manuais de volta pro workspace ativo
- `gera log` — log estruturado pro Bruno (feedback rico)

Feedback rápido (1 pergunta + comentário): https://tally.so/r/obyy1V
Comunidade: https://t.me/cursoopenclaw  ·  Bruno: bruno@microsaas.com.br
```

---

### VARIANTE A2 — Modo aula + AVULSO (sem mini-curso)

Mesma estrutura da A1 MAS troca o bloco "Importante: o kit acabou aqui":

```
**Importante: o kit acabou aqui.**

Como você não tem o mini-curso comprado, daqui pra frente você opera com o que configurou. Se quiser aprofundar — aprender a criar agentes do zero, automações, skills próprias, debugging, governança — o mini-curso completo está em:

https://openclaw.pixeleducacao.com.br?utm_source=starter-kit&utm_medium=avulso&utm_campaign=v2.5

Por enquanto, me peça **tarefas reais** (escreve um post sobre X, organiza minhas decisões da semana, etc) — eu funciono igual sem precisar de wizard.

→ **`retomar`** — re-renderiza esta checklist (caso queira retomar pulos pendentes)
→ **`ajuda`** — menu completo de comandos
→ **`config`** — mudar algo do setup (nome do agente, autonomia, chaves, etc)
```

(Resto da mensagem — avulsos + feedback — fica igual.)

---

### VARIANTE B1 — Modo wizard + tem mini-curso

⚠️ **Sem nomenclatura A0-A6.** Modo B prometeu "sem números de passos" — mensagem final honra essa promessa.

```
=== Sua configuração — COMPLETA 🎉 ===

✓ Áudio (Whisper) {configurado | skipped}
✓ Personalidade do agente
✓ Sua personalidade
✓ Autonomia liberada
✓ Workspace organizado
✓ Superpoderes conectados ({N}/4)
✓ Primeiro artefato: {content/drafts/primeira-vitoria-{data}.md}

✅ **Material de instalação arquivado** em `{ARCHIVE_DIR}` ({ARCHIVED_COUNT} itens). Workspace limpo. Manda `restaura manuais` se quiser trazer de volta.

---

**Importante: o starter-kit terminou aqui.**

Configuramos seu agente. A partir de agora, é trabalho real. Se quiser aprofundar conceitos (como o agente pensa, como criar skills próprias, integração com mais ferramentas, automação, governança), o **mini-curso OpenClaw v2** continua no Hotmart com mais conteúdo:

→ Manda **`continuar`** que eu te aponto pra próxima parte do mini-curso
→ Ou me peça uma **tarefa real** direto (escreve um post sobre X, organiza minhas decisões, etc)

→ **`retomar`** — voltar pra esta sumário se sair
→ **`ajuda`** — menu completo de comandos
→ **`config`** — mudar algo do setup

**Suas configurações ficam salvas. Volta a hora que quiser.**

---

Avulsos (caso queira ativar AGORA):

- `ativa whatsapp` — WhatsApp como canal extra (read-only)
- `instala superpowers` — skills de planejamento (brainstorming, plans, debugging)
- `restaura manuais` — trazer manuais de volta pro workspace ativo
- `gera log` — log estruturado pro Bruno (feedback rico)

Feedback rápido (1 pergunta + comentário): https://tally.so/r/obyy1V
Comunidade: https://t.me/cursoopenclaw  ·  Bruno: bruno@microsaas.com.br
```

---

### VARIANTE B2 — Modo wizard + AVULSO (sem mini-curso)

Mesma B1 mas com CTA Pixel:

```
**Importante: o starter-kit terminou aqui.**

Configuramos seu agente. Como você não tem o mini-curso, daqui pra frente é trabalho real direto. Se quiser aprender a criar agentes do zero, automações, skills próprias, debugging, governança — o mini-curso OpenClaw v2 está em:

https://openclaw.pixeleducacao.com.br?utm_source=starter-kit&utm_medium=avulso&utm_campaign=v2.5

Por enquanto, me peça **tarefas reais** — eu funciono igual sem precisar de wizard.

→ **`retomar`** — voltar pra este sumário se sair
→ **`ajuda`** — menu completo de comandos
→ **`config`** — mudar algo do setup
```

(Resto da mensagem — avulsos + feedback — igual.)

---

### Pseudocódigo de seleção de variante

```python
modo = MEMORY.get("modo_jornada")          # "aula" | "wizard"
minicurso = MEMORY.get("tem_minicurso", True)  # default True (legacy)

if modo == "aula" and minicurso:
    render(VARIANTE_A1)
elif modo == "aula" and not minicurso:
    render(VARIANTE_A2)
elif modo == "wizard" and minicurso:
    render(VARIANTE_B1)
elif modo == "wizard" and not minicurso:
    render(VARIANTE_B2)
```

⚠️ **NUNCA renderizar VARIANTE A se `modo_jornada == 'wizard'`** — quebra promessa explícita do Modo B (sem números de passos / aulas).

⚠️ **NUNCA renderizar bloco "próximas aulas Hotmart" se `tem_minicurso == False`** — aluno avulso vê referência ao Hotmart sem ter login.

⚠️ **CRÍTICO pro agente — opções pós-vitória são FIXAS, NÃO IMPROVISE:**

- Apresente APENAS as 4 opções principais (continuar / retomar / config / ajuda) + 3 avulsas (whatsapp / planejamento / **restaura manuais** — substitui "arquiva onboarding" da v1.6, que agora é automático em v1.7). Nem mais, nem menos.
- O bloco "Pra continuar a qualquer momento" é a parte mais importante — destacar visualmente. Aluno SAI sabendo que pode voltar.
- **NÃO inclua coisas que JÁ deveriam ter sido feitas na jornada principal** (backup é passo 5; pesquisa web é passo 5; configurar autonomia é passo 3). Se faltou alguma, voltar é responsabilidade do passo 10 acima — não tratar como "opcional pós-vitória".
- **NÃO improvise opções customizadas baseadas no contexto do aluno** (ex: "rodar pipeline nos seus 3 projetos", "criar a skill custom que você planejou"). Isso é trabalho normal de agente — vira tarefa SEPARADA depois do onboarding fechar, NÃO mais um passo do wizard.
- **NÃO trate skills de planejamento como "opcional pós-vitória" se foram instaladas no Caminho A do Cenário B** (workspace populado). Se já estão em `skills/planejamento/`, omita essa opção.

Falha real observada (sessão Lia/Mira 02/05): agente ofereceu 4 opções mas só 1 era canônica. As outras 3 (backup que era do passo 5 não-feito, pipeline em projetos da Lia, skill daily-creative-brief) eram improvisadas. Confundiu o aluno e deu sensação de "wizard infinito".

#### 11c. Comando opcional `restaura manuais` (kit v2.2 final, exit hatch do auto-arquivamento)

Se aluno mandar `restaura manuais` (ou `restaurar kit`, `traz manuais de volta`):

1. Ler `kit_archive_path` de MEMORY.md (ex: `archive/starter-kit-onboarding-2026-05-03/`)
2. Se path não existe ou flag ausente → "Não achei o material arquivado. Você não rodou primeira-vitoria ainda OU já restaurou antes."
3. Comando reverso (P14 — mostrar comando + output):

```bash
ARCHIVE_DIR="$(grep kit_archive_path MEMORY.md | cut -d: -f2 | xargs)"
mkdir -p starter-kit/
mv "$ARCHIVE_DIR"/* starter-kit/
rmdir "$ARCHIVE_DIR"
ls -la starter-kit/
```

4. Atualizar MEMORY.md: remover `kit_archived_at`, `kit_archive_path`, `kit_archived_files`. Adicionar `kit_restored_at: {timestamp}`.
5. Mensagem ao aluno: "✅ Manuais de volta em `starter-kit/`. Quando quiser, manda 'arquiva manuais' pra arquivar de novo."

**Falha real v1.9.x (Bruno + aluno + outros, 03/05):** depois da pós-vitória, modo wizard fechava e aluno não sabia como voltar. Comandos como "reativa jornada" eram jargão interno — aluno tentava "continuar", "voltar", "retomar" e não tinha mapeamento. Resultado: sensação de "wizard morreu". v2.1 corrige (a) reformulando esta mensagem com comandos óbvios + (b) adicionando sinônimos `continuar`/`retomar`/`voltar wizard` no `onboarding-checklist` v1.7 + (c) skill nova `continuar-jornada` orquestra avanço pós-Bloco A.

### 12. Atualizar MEMORY.md

```markdown
## Flags
first_win_completed: true
onboarding_complete: true
onboarding_mode: complete_active   ← v2.1 (era `closed` na v1.3 — renomeado pra refletir que aluno pode reativar via comandos canônicos)

## Decisões da jornada
- {data}: Primeira vitória completa. Tipo: {tipo}. Plataforma: {plataforma}. NPS: {score}. Pendente passo 5 (se aplicável): {nada | brave | github | backup | chromium}.

## Artefatos gerados
- content/drafts/primeira-vitoria-{tipo}-{data}.md
```

Atualizar `onboarding_current_step: done` (jornada principal completa).

### 13. Modo wizard "complete-active" — não trancar, mas não loopar (v2.1)

Após aluno escolher uma das opções pós-vitória:

1. Executar a opção escolhida (ex: rodar `wizard-whatsapp` se "ativa whatsapp"; rodar `continuar-jornada` se "continuar")
2. Marcar `onboarding_mode: complete_active` em `MEMORY.md` (v2.1 — antes era `closed`, mudou o nome pra refletir que aluno pode reativar)
3. **DEVOLVER controle pro modo CHAT NORMAL** — não fica oferecendo "próximas opções" infinitamente.

⚠️ **CRÍTICO — distinguir 3 tipos de mensagem do aluno depois da vitória:**

**Tipo 1 — Sinal vago ("bora", "ok", "manda bala"):**
- NÃO reabre wizard automaticamente (era o bug Lia/Mira)
- Pergunta o que ele quer: "Sobre o quê? Posso continuar mini-curso, fazer uma tarefa real, ou algo específico — manda."

**Tipo 2 — Comando canônico de retomada explícito:**
- `"continuar"` → despacha `continuar-jornada` (v2.1 — orquestra Aula 0 em diante)
- `"retomar"` / `"voltar wizard"` → re-renderiza `onboarding-checklist` (mostra estado, retoma pulos pendentes)
- `"checklist"` → mesmo que retomar
- `"refazer onboarding"` → confirma se quer refazer do zero (com backup)
- `"config"` → menu de mudança de setup
- `"ajuda"` → menu completo de comandos
- `"aula 5"` / `"aula 8"` etc → mostra link da aula correspondente

**Tipo 3 — Tarefa real ("escreve um post sobre X"):**
- Executa direto, sem wizard

Falha real observada (sessão Lia/Mira 02/05): aluno mandou "bora" 3x depois de fechar primeira-vitoria e wizard interpretou cada um como "continuar". Resultado: virou loop infinito. v1.3 fixou marcando `closed`. **MAS v1.9.x revelou outro bug:** alunos NÃO sabem que existe `reativa jornada` e ficam sem caminho pra voltar.

v2.1 resolve os DOIS bugs:
- Tipo 1 (sinal vago) NÃO reabre — preserva fix v1.3
- Tipo 2 (comando explícito) reabre, com vocabulário NATURAL (`continuar`/`retomar`/`voltar`) anunciado claramente na mensagem final do passo 11

### 14. Devolver controle pra onboarding-checklist (que sai)

## Comando "refaz" durante este wizard

Se aluno disser "refaz com tom mais X" ou "refaz mais curto":

1. Backup do artefato atual em `archive/{nome_arquivo}-v1.md`
2. Regenerar com ajuste pedido
3. Salvar como v2 no mesmo path original (não cria arquivo novo)
4. Mostrar diff resumido (o que mudou)

Aluno pode refazer N vezes — cada versão antiga vai pra archive/.

## Caminho alternativo: aluno sem inspiração

Se aluno não souber o que pedir:

```
"Tranquilo. Olhando o que você me contou no USER.md ({o_que_faz}),
3 sugestões pra essa primeira vitória:

a) Post: '3 coisas que aprendi no último mês {fazendo X}'
b) Decisão: registrar a decisão mais importante da semana
c) Checklist: rotina diária do {seu trabalho}

Manda 'a', 'b' ou 'c' (ou outra ideia)."
```

Personaliza sugestões pelo `o_que_faz` do USER.md.

## Critérios de sucesso

- [ ] Artefato gerado e salvo em `content/drafts/primeira-vitoria-*.md`
- [ ] Path mostrado ao aluno
- [ ] Aluno tem opção clara pra editar/refazer/usar
- [ ] Pergunta-âncora respondida + validada
- [ ] NPS coletado (0-10)
- [ ] `first_win_completed=true` E `onboarding_complete=true` em `MEMORY.md`
- [ ] Aula C2 mencionada
- [ ] Próximos passos opcionais oferecidos (arquivar, WhatsApp, Superpowers)

## Erros comuns

- **Brave Search retorna 0 resultados:** raro, mas acontece pra termos muito nichados. Gerar mesmo assim, sem referências externas.
- **Aluno pediu artefato que não conhece (ex: "post LinkedIn" mas nunca usou):** explicar diferença de plataformas brevemente. Não infantilizar.
- **Aluno detesta o draft gerado:** convidar pra "refaz com {ajuste}". Iterar 2-3x se preciso. Não defender a versão atual.
- **Aluno trata como 'só mais um teste':** ok, mas reforçar que arquivo é REAL no workspace dele. Não vai sumir. É dele.
- **NPS baixo (0-6) sem feedback acionável:** insistir 1x na razão. Se mesmo assim não vier, ok. Salvar como "detractor sem feedback explícito".

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 1 (backup antes):** se aluno pedir 'refaz', backup da versão atual em archive/ antes.
- **Princípio 2 (confirmação humana):** menos relevante aqui (geração de artefato é mais conversacional). Mas sempre confirma estrutura/tom antes se aluno tem opções múltiplas.
- **Princípio 4 (narrar antes de fazer):** narra cada etapa (pesquisa, geração, salvamento).
- **Princípio 5 (atualizar MEMORY ao concluir):** marca first_win_completed + onboarding_complete + NPS.
- **Princípio 8 (logging de decisões):** salva tipo, plataforma, NPS, artefato em MEMORY.
- **Princípio 11 (detectar antes de pedir):** checa se já existe primeira-vitoria. Não duplica silenciosamente.

## Modo A vs Modo B

**Modo A:**
```
"Bora pro Módulo 6 — Primeira vitória (último).
Aula correspondente: C2 (Skills como SOP).
Sua primeira vitória é o gancho pra C2 — depois dela você aprende
a transformar esse fluxo em skill reutilizável."
[fluxo numerado]
```

**Modo B:**
```
"Última coisa: vamos gerar algo real. 5min. Você sai com arquivo
salvo no workspace que você pode usar."
[fluxo conversacional, mais animado — momento de vitória]
```

## Comando "exemplo" durante este wizard

Se aluno pedir "exemplo" antes de escolher tipo:

```
"Pra calibrar, alguns artefatos que outros alunos geraram na
primeira vitória:

- 'Post LinkedIn sobre 5 erros que cometo na minha agência'
- 'Email pro time sobre mudança de sistema de gestão'
- 'Decisão de parar de pegar cliente abaixo de R$ X mil'
- 'Checklist diário pro estagiário começar segunda'

Cada pessoa escolhe coisa diferente. Manda o que faz sentido pra você."
```

(Esses são genéricos sanitizados — não tem template Amora específico aqui porque é geração ad-hoc.)

## Referências

### Internas
- Princípios universais: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)
- Decisão D09 (NPS após primeira vitória): [`../../../../DECISOES-ARQUITETURA.md`](../../../../DECISOES-ARQUITETURA.md)
- Decisão D10 (arquivamento opcional pós-jornada): mesma referência
- Pergunta-âncora oficial: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 6)
- Skill backup-workspace-github (já ativada no passo 5): [`../../operacional/backup-workspace-github/SKILL.md`](../../operacional/backup-workspace-github/SKILL.md)

### Externas
- Brave Search API docs: https://api.search.brave.com/app/documentation
- Markdown spec: https://daringfireball.net/projects/markdown/

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Templates de artefato por plataforma (LinkedIn, Newsletter, Instagram) embutidos
- v1.2: Comando "exporta primeira-vitoria" que faz formato apropriado pra publicação direta (HTML pro LinkedIn, etc)
- v1.3: Detecção de artefatos similares já gerados (sugere "você já fez algo parecido em {data}, quer reutilizar?")
- v2: Loop de iteração premium — agente sugere 3 versões em paralelo (mais conservador, mais arrojado, mais técnico) pra aluno escolher
