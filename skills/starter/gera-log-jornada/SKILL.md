---
name: gera-log-jornada
status: ATIVO
category: starter
owner: aluno
version: 1.1
mode: guided
estimated_time: 1-2min
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "gera log" / "gera feedback" / "histórico jornada" / "relatório" — generates a structured log of the student's journey through the kit (which steps completed, which were skipped/postponed, observations captured inline, final config) to be sent as feedback to Bruno. Reads MEMORY.md (flags + decisions + observations) and formats into shareable markdown. Offers 2 send paths: Tally form (https://tally.so/r/obyy1V) and Telegram group (@cursoopenclaw with `me marca`). Created in v2.1 (Bruno feedback): students wanted a way to send rich feedback context, not just "achei vago". Includes PII sanitization option (default ON). v1.1 (kit v2.2): header com Princípios 13/14/15 explícitos (auditoria pós-v2.1).
---

# Gera Log da Jornada — Feedback Estruturado pro Bruno

> 🔴 **PRINCÍPIOS NÃO-NEGOCIÁVEIS PRO AGENTE (kit v2.2):**
>
> **NÃO IMPROVISE.** Read este arquivo INTEIRO antes de falar com aluno. Não invente fluxo simplificado.
>
> **P13 — Guard Rail.** Esta skill é curta (~30s); aluno raramente desvia. Se desviar, mesmo padrão dos wizards — anota em `## Perguntas pendentes` e traz de volta.
>
> **P14 — Smoke tests visíveis.** Esta skill OBEDECE P14 por design: NUNCA inventa dado que não está em MEMORY.md. Se uma flag não existe, marca `não rodou` no log — não preenche valor plausível.
>
> **P15 — Mensagens `<canonical>` literais.** Os 2 links de envio (Tally + grupo Telegram) e o convite à sanitização PII são CANONICAL — usar LITERAL.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno (convite + 2 caminhos de envio Tally/Telegram) usam parágrafos contínuos. NÃO quebrar manualmente.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

> 🤖 **Agente:** essa skill gera um log estruturado da jornada do aluno pra ele enviar como feedback. NÃO é a skill que MANDA o feedback — é a que GERA o conteúdo formatado e oferece os caminhos de envio. Aluno valida + manda manualmente.

## Promessa

Aluno consegue mandar feedback rico em ~30 segundos: agente gera log estruturado da jornada (passos, pulos, observações, configuração final), aluno valida, copia e cola onde quiser (Tally form ou grupo Telegram).

Bruno recebe input com **contexto** em vez de "achei vago". Padroniza coleta pra Pixel iterar com base em dados reais.

## Quando disparar

**Trigger automático:**
- NÃO disparar automaticamente

**Trigger explícito (qualquer um):**
- "gera log"
- "gera feedback"
- "log da jornada"
- "histórico da jornada"
- "relatório"
- "relatório de feedback"
- "feedback estruturado"
- "me ajuda a mandar feedback"

**Funciona em qualquer momento:**
- Durante o onboarding (gera log parcial — útil pra aluno reportar quando trava no meio)
- Após primeira vitória (log completo)
- Em qualquer ponto depois (com flags atualizadas)

## Princípio 11 — Detecção antes de gerar

Antes de gerar, lê:

```bash
# Lê MEMORY.md
cat MEMORY.md

# Detecta flags principais
onboarding_complete=$(grep "onboarding_complete:" MEMORY.md)
versao_kit=$(grep "kit_version:" MEMORY.md)
ambiente=$(grep "ambiente:" MEMORY.md)
modo=$(grep "modo:" MEMORY.md)
```

### 3 estados detectáveis

| Estado | Comportamento |
|---|---|
| **MEMORY.md vazio ou aluno não começou jornada** | Avisar: "Você ainda não começou a jornada. Manda 'oi' que eu disparo o onboarding." NÃO gerar log. |
| **Jornada parcial** (onboarding_complete: false) | Gerar log parcial: passos completados + onde travou + observações até aqui |
| **Jornada completa** (onboarding_complete: true) | Gerar log completo: jornada inteira + configuração final |

## Fluxo principal

### 1. Confirmar intenção + perguntar sobre PII

```
"Vou gerar um log da sua jornada pra você mandar de feedback pro Bruno.

Antes, 1 escolha:

→ **Sanitizado** (recomendado, default): tiro seu nome, cidade, dados pessoais
   antes de gerar — fica genérico, mas ainda útil pra Bruno entender o que
   aconteceu

→ **Completo**: inclui seu nome + dados de USER.md (mais contexto, menos
   privacidade)

Manda 'sanitizado' ou 'completo'. Se não responder, vou de sanitizado."
```

Aguardar resposta. Default: sanitizado.

### 2. Ler dados de MEMORY.md

Extrair em ordem:

**Cabeçalho:**
- Data atual
- Versão do kit (`kit_version` em MEMORY.md, ou inferir de SKILL.md do onboarding-checklist)
- Ambiente (`ambiente: managed | vps-root | local-dev`)
- Modo (`modo: A | B`)
- Tempo total (calcular: `created_at` da primeira flag até `last_activity_at`, se disponível)

**Passos (na ordem 0-6):**
- Para cada passo, status: ✓ concluído / ✗ pulou / ⏰ agendado / ⚠ erro
- Observações inline (se aluno reportou problemas durante o passo, devem estar em `## Observações inline` em MEMORY.md)

**Pulos pendentes:**
- `whisper_reminder_at` ainda válido?
- `whisper_skipped_permanently: true`?

**Configuração final (apenas se sanitizado=false):**
- Nome do agente (de IDENTITY.md)
- Tom (de SOUL.md)
- exec-policy
- Backup ativo?

### 3. Gerar log no formato canônico

```markdown
=== Log da Jornada — Starter Kit OpenClaw v2.1 ===
Data: {YYYY-MM-DD}
Versão do kit: {kit_version}
Ambiente: {managed | vps-root | local-dev}
Modo: {A | B}
Tempo total: {Nmin}

PASSO 0 — Whisper: {status} {detalhes}
PASSO 1 — Agente: {status} {detalhes}
PASSO 2 — Aluno: {status} {detalhes}
PASSO 3 — Autonomia: {status} {detalhes}
PASSO 4 — Workspace: {status} {detalhes}
PASSO 5 — Conectar:
  {sub-status Brave Search}
  {sub-status GitHub Token}
  {sub-status Backup automático}
  {sub-status Chromium se aplicável}
PASSO 6 — Primeira vitória: {status} {detalhes}

OBSERVAÇÕES INLINE (capturadas durante a jornada):
{lista das observações registradas em MEMORY.md ## Observações inline}
{ou: "Nenhuma observação inline registrada." se vazio}

CONFIGURAÇÃO FINAL: {se sanitizado=true, omitir essa seção inteira}
- Agente: {nome agente}, tom {tom}
- exec-policy: {yolo | ask}
- Backup GitHub: {ativo | inativo}
- Whisper: {ativo | inativo}

PULOS PENDENTES: {lista, ou "nenhum"}
COMANDOS QUE NÃO ENTENDI (registrados): {lista, ou "nenhum"}
```

**Limite de tamanho:** ~80 linhas. Se exceder, cortar `OBSERVAÇÕES INLINE` mantendo as mais recentes.

### 4. Mostrar log pro aluno + perguntar se quer ajustar

```
"Pronto, log gerado:

[bloco de código com o log]

Tá certo? Quer adicionar algo, remover algo, ou já mandar como tá?

→ 'manda' — vou te dar os 2 jeitos de enviar
→ 'ajusta' — me diz o que mudar
→ 'cancela' — não envia, mas log fica salvo em content/feedback-log-{data}.md
"
```

### 5. Ações por resposta

**Se "manda":**

```
"Beleza. 2 jeitos de enviar (escolhe um ou os dois):

📊 **Tally form** (1 pergunta NPS + textarea pra colar log):
   https://tally.so/r/obyy1V
   → Cole o log no campo 'comentário' do form

💬 **Grupo Telegram dos alunos:**
   https://t.me/cursoopenclaw
   → Tópico 'Suporte' ou 'Geral'
   → Marca o Bruno com @brunookamoto + cola o log

Sem pressão, escolhe o que preferir. O importante é que tá em formato
estruturado — Bruno vai conseguir entender contexto rápido.

Salvei o log em content/feedback-log-{data}.md também (caso queira
abrir/editar antes de mandar)."
```

**Se "ajusta":**

```
"O que muda? Pode ser:
- Adicionar uma observação que esqueci de registrar
- Remover algo que tá errado
- Mudar de sanitizado pra completo (ou vice-versa)

Manda."
```

Aplicar ajuste, mostrar log atualizado, voltar pra step 4.

**Se "cancela":**

```
"Beleza, não enviei. Log salvo em content/feedback-log-{data}.md
(você pode reabrir/editar depois).

Se mudar de ideia: 'manda log' que eu reabro o fluxo."
```

### 6. Salvar log em arquivo

Independente da escolha, salvar em:

```
content/feedback-log-{YYYY-MM-DD-HHMM}.md
```

Conteúdo: o log gerado + cabeçalho com data + status de envio (enviado / cancelado / aguardando).

### 7. Atualizar MEMORY.md

```markdown
## Decisões da jornada
- {data}: Gerou log de feedback. Sanitizado: {sim|não}. Status envio: {enviado | cancelado | aguardando}.

## Flags
last_feedback_log_at: {timestamp}
```

## Estrutura sugerida do MEMORY.md (pros wizards alimentarem)

Pra essa skill funcionar bem, os outros wizards precisam registrar dados padronizados em MEMORY.md. Sugestão de seções (já parcialmente em uso):

```markdown
# MEMORY.md — Estado do agente

## Flags
{key: value list}

## Decisões da jornada
- {data}: descrição

## Observações inline (capturadas pelo agente durante uso)
- {data}: aluno reportou: "{texto literal}"
- {data}: agente detectou: "{descrição}"

## Configuração final
{snapshot do estado quando primeira vitória completou}

## Histórico de feedback enviado
- {data}: gerou log. Status: enviado/cancelado.
```

Se as seções não existirem ainda, essa skill funciona com dados parciais (extrai o que conseguir).

## Princípio CRÍTICO — log nunca inventa dados

⚠️ **Se MEMORY.md não tem dado, log mostra `não registrado` em vez de inventar.**

Falha que essa skill PREVINE: agente "completar" o log com inferências (ex: estimar tempo total, criar observações com base em padrão). Isso vira teatro — Bruno acha que tem dado real e na verdade é alucinação.

Regra dura: log só mostra o que tá em MEMORY.md ou outros arquivos do workspace. Se não tem, fala "não registrado".

## Critérios de sucesso

- [ ] Log gerado em < 2min do trigger
- [ ] Aluno valida antes de enviar (não força)
- [ ] PII sanitizada por default
- [ ] 2 caminhos de envio oferecidos (Tally + grupo Telegram)
- [ ] Log salvo em arquivo local independente de envio
- [ ] Log NUNCA inventa dado que não está em MEMORY.md

## Erros comuns

- **MEMORY.md não tem seção "Observações inline":** ainda não foi adotada por todos os wizards. Mostrar `## OBSERVAÇÕES INLINE: nenhuma observação registrada (essa estrutura é nova — wizards ainda estão sendo atualizados pra alimentar)`. Não tratar como erro.
- **Aluno pede log mas não fez nem o passo 1:** mostrar log "vazio" + sugerir começar jornada com 'oi' antes.
- **Log fica gigante (>200 linhas):** cortar `Observações inline` (manter só as 5 mais recentes) + avisar: "Cortei {N} observações antigas pra log caber. Versão completa em content/feedback-log-{data}-completo.md"
- **Aluno pediu 'completo' mas USER.md tem dados sensíveis (CPF, endereço):** sanitizar mesmo em modo completo se detectar padrão sensível. Avisar: "Detectei {tipo} em USER.md, sanitizei mesmo no modo completo pra sua segurança."

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

Especialmente relevantes:
- **Princípio 4 (narrar antes de fazer):** mostra log + pede validação antes de enviar
- **Princípio 7 (em dúvida, pergunte):** se aluno escolhe sanitizado vs completo, perguntar (não inferir)
- **Princípio 11 (detectar antes de pedir):** lê MEMORY.md ANTES de gerar
- **NOVO Princípio (v2.1): nunca inventa dado pro log** — se não está em MEMORY.md, mostra "não registrado". Sem teatro.

## Modo A vs Modo B

**Modo A (formal):**
```
"Vou gerar um log estruturado da sua jornada pra mandar de feedback.
Você escolhe: sanitizado (default) ou completo. Como prefere?"
[fluxo numerado]
```

**Modo B (conversacional):**
```
"Bora gerar um log do que rolou na sua jornada — ajuda o Bruno a melhorar
o kit. Sanitizado ou completo?"
[fluxo conversacional]
```

## Status

✅ ATIVO desde v2.1 do Starter Kit (03/05/2026 — Bruno: "criar algum tipo de change log ou de log para que o Wizard gere um log passo a passo para até o aluno mandar como feedback").

## Roadmap

- v1.1: Detecção automática de "Observações inline" — agente captura sozinho quando aluno reportar bug ("não consegui clicar", "deu erro", "ficou vago") durante qualquer passo, sem precisar pedir explicitamente
- v1.2: Envio direto pro Tally via API (sem aluno copiar/colar) — depende de Tally aceitar API call autenticada
- v1.3: Estatísticas agregadas — quando skill ouvinte rolar (pendência separada), agregar logs de N alunos pra view de Bruno

## Referências

### Internas
- Skill ouvinte de feedback de alunos (pendência aberta — esta skill é o "front-end" enquanto a ouvinte é o "back-end" de coleta)
- Princípios defensivos: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)

### Externas
- Tally form pra NPS + comentário: https://tally.so/r/obyy1V
- Grupo Telegram dos alunos: https://t.me/cursoopenclaw
