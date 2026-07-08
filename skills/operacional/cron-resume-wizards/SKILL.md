---
name: cron-resume-wizards
status: ATIVO
category: operacional
owner: agent (autônomo, sem aluno)
version: 1.3
mode: cron (background)
estimated_time: 2-5s por execução
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Cron-DM ATIVO. **v1.3 (kit v2.5.6 — humanização do tom + redução de frequência baseada em feedback Bruno): (1) Cron volta de 2x/dia (09h+19h) pra **1x/dia (09h BRT)** — feedback de aluno sentindo cobrança 2x ao dia + 3 tentativas era invasivo demais, parecia babá vigilante. Anti-hustle culture da Pixel pede tom mais respeitoso. (2) Anti-spam reduzido: **max 2 tentativas** (era 3) — depois marca `wizard_dismissed: true` em silêncio. 1.5 dia coberto vira ~1 dia. Aluno ainda pode pedir retomada via `continuar`. (3) Tom das DMs reescrito em primeira pessoa, sem menu rígido, voz humana — não cobra, oferece. (4) Respeita `wizard_nudge_silenced_until` (Princípio 19, kit v2.5.6) — se aluno usou `silencia wizard`, cron NÃO dispara DM até a flag expirar. (5) Princípio 18 mencionado como contexto: agente do aluno usa `_curso/INDICE.md` quando aluno mencionar tema da aula em retorno. v1.2 (kit v2.5 — stress test Mira round 2): (1) Inferência silenciosa — antes do guard `active_wizard != null`, verifica se aluno pausou silenciosamente (fechou Telegram sem comando explícito): se `last_user_message_at < now() - 12h` E `active_wizard != null` E `wizard_resume_at == null`, agente APLICA protocolo de pause (zera `active_wizard`, seta `wizard_resume_at: now()`, attempts:0); (2) Mapa tradução `{wizard_resume_step}` → linguagem natural (`wizard-autonomia.passo3` → `passo 3 (autonomia)`) em todas as 3 DMs canonical; (3) DMs incluem contagem `X/3` desde a 1ª tentativa pra aluno saber onde tá no ciclo. Caso real Mira: pausou no passo 3 fechando Telegram, ficou 4+ dias sem nudge porque guard bloqueava.** v1.1 (kit v2.4 — stress test Pedro): roda 2x/dia (09:00 + 19:00 BRT) — antes era só 09:00. Razão: aluno que pausa wizard "à noite" ficava 19h sem nudge (cron só na manhã seguinte). Cobertura matinal (09h pra começar dia) + noturna (19h pra retomar antes de dormir).** Lê MEMORY.md do próprio agente, detecta `wizard_resume_at` vencido, dispara DM canônica no Telegram pra retomar wizard pausado. Anti-loop: max 3 tentativas (`wizard_resume_attempts`), depois marca `wizard_dismissed: true` e para de tentar. Funciona em Managed (cron-worker OpenClaw) e VPS root (systemd timer). NUNCA dispara durante wizard ativo (`active_wizard != null`) — espera próximo ciclo. NOVA na v2.2 — upgrade do mecanismo passivo da v2.1.
---

# Cron Resume Wizards — Cron-DM ATIVO de Retomada

> 🔴 **PRINCÍPIOS NÃO-NEGOCIÁVEIS PRO AGENTE (kit v2.2):**
>
> Esta skill é **autônoma** (rodada por cron, sem aluno na conversa). Mesmo assim, segue P14 + P15:
>
> **P14 — Smoke tests visíveis.** Toda execução loga no `MEMORY.md` (seção `## Cron log`) o que leu, o que decidiu, e o que mandou. NUNCA finge ter rodado. Se falhou ao enviar DM, loga erro com timestamp. Aluno (ou Bruno) consegue auditar histórico depois.
>
> **P15 — Mensagem da DM é CANONICAL.** Texto exato definido na seção "DM canônica" abaixo. NÃO reformular, NÃO criar variações "mais naturais" por execução. Variar tom de DM proativa cria confusão — aluno precisa reconhecer o padrão.
>
> Detalhes: `../../starter/onboarding-checklist/references/principios-defensivos.md` (P1–P15).

## Promessa

Aluno que pausou wizard (cancelou no meio, ou 3 desvios consecutivos dispararam pause automático) recebe DM proativa no Telegram quando o `wizard_resume_at` vence — sem precisar voltar ao chat por conta própria.

Resolve gap real: aluno fecha Telegram, vai dormir, volta 3 dias depois e esqueceu da pendência. Sem nudge ativo, wizard "morria" silencioso. Versão passiva (v2.1) só ajudava quando aluno já estava voltando — não puxa o cara de volta.

## Quando disparar

**Trigger (apenas cron interno do agente — NÃO comando do aluno):**
- Cron registrado no agente, default **2 ciclos diários: 09:00 + 19:00 BRT** (kit v2.4)
- Cobertura matinal (aluno começando o dia) + noturna (aluno antes de dormir)
- Qualquer ambiente: Managed via `openclaw cron create`, VPS root via systemd timer ou crontab

**Por que 1 ciclo (kit v2.5.6 — feedback Bruno + DNA anti-hustle Pixel):**

v1.1 tinha 2 ciclos (09h + 19h). Feedback prático: aluno sentia cobrança 2x ao dia + 3 tentativas total (até 1.5 dia de cobertura) virava **babá vigilante**, contradizia o anti-hustle culture da Pixel. Aluno PME adulto não precisa ser tratado como criança que esquece.

v1.3 volta pra **1 ciclo diário (09h BRT)** + **max 2 tentativas**. Cobertura cai pra ~24h, mas:
- Aluno que pausa 16h e fica ativo continua tendo Princípio 19 (estagnação suave) durante a sessão
- Aluno que sumiu mesmo recebe 1 DM no dia seguinte 09h. Se não responder, mais uma DM 24h depois (09h do dia 2). Daí marca `dismissed` em silêncio.

**Anti-spam v1.3:** `wizard_resume_attempts` incrementa 1 por DM enviada. **2 tentativas** = ~1 dia coberto. Aluno pode reativar quando quiser via `continuar`.

**Histórico (kit v2.4 — fix stress test Pedro):** Pedro pausou às 16h falando "volto à noite", recebia DM só na manhã seguinte. Mas a v1.3 detectou que cron mais frequente trazia OUTRO problema (cobrança). Princípio 19 (estagnação durante sessão ativa) substitui parcialmente o que v1.1 tentava — Pedro veria header sutil às 16h35, sem precisar esperar cron.

**NÃO disparar manualmente:**
- Aluno NÃO tem comando explícito pra essa skill — é background only
- Se aluno mandar "reativa wizard" / "continuar", a skill responsável é `continuar-jornada` (síncrona)

## Comportamento detalhado

### Passo 1 — Ler MEMORY.md

Lê o `MEMORY.md` do próprio agente. Procura no frontmatter ou seção dedicada as flags:

```yaml
active_wizard: null|wizard-X            # wizard rodando agora
last_user_message_at: 2026-05-04T08:30  # quando aluno mandou última msg (qualquer)
wizard_resume_at: 2026-05-04T09:00      # ISO timestamp (pause explícito)
wizard_resume_step: wizard-conectar.passo3
wizard_resume_attempts: 0
```

### Passo 1.5 — Inferência silenciosa (kit v2.5 — fix Mira)

⚠️ **NOVO em v2.5:** ANTES dos checks abaixo, verificar se aluno pausou silenciosamente (fechou Telegram sem mandar `cancela` nem disparar 3 desvios).

```
Se `active_wizard != null` E `wizard_resume_at` está null E `last_user_message_at < now() - 12h`:
    → aluno pausou silenciosamente
    → APLICAR protocolo de pause (ver principios-defensivos.md):
        - active_wizard: null
        - wizard_resume_at: now()  # vence imediatamente, próximo ciclo dispara DM
        - wizard_resume_step: {wizard ativo}.{active_step}
        - wizard_resume_attempts: 0
    → Continuar pro Passo 2 (smoke test) e Passo 3 (DM)
```

**12h é conservador.** Aluno em meeting longo ou viagem volta dentro desse range. 24h também é defensável — escolha 12h pra capturar maioria dos casos sem ser agressivo.

### Passo 2 — Decisão de envio

**Se `wizard_resume_at` não existe ou é `null` (E não inferiu silenciosa acima):** sem trabalho, loga `nada a fazer` e termina.

**Se `wizard_resume_at > now()`:** ainda não venceu, loga `aguardando` e termina.

**Se `wizard_resume_attempts >= 2`** (kit v2.5.6 reduzido de 3 → 2)**:** anti-loop ativo, marca `wizard_dismissed: true`, limpa flags de resume, loga `dismissed após 2 tentativas` e termina silenciosamente. Aluno pode reativar a qualquer momento via comando `continuar` (síncrono, despacha `continuar-jornada`).

**Se `wizard_nudge_silenced_until > now()`** (kit v2.5.6 — Princípio 19): aluno usou comando `silencia wizard` recentemente. NÃO disparar DM. Loga `silenciado até {timestamp}` e termina. Quando flag expirar, próximo ciclo dispara normalmente se ainda houver pendência.

**Se `active_wizard != null` E NÃO foi caso de inferência silenciosa acima:** aluno acabou de retomar wizard agora — NÃO interromper. Loga `wizard ativo, pulando ciclo` e termina.

⚠️ **Distinção crítica v2.5:** o guard `active_wizard != null` continua válido pra wizard que RECEBEU resposta recente do aluno (sub-12h). Pra pausa silenciosa (12h+ sem msg), o Passo 1.5 já zerou `active_wizard` antes de chegar aqui.

### Passo 2 — Smoke test do canal

Antes de mandar DM, valida que canal Telegram tá acessível. Comando exato (P14):

```bash
curl -s -o /dev/null -w "%{http_code}" \
     "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

Output esperado: `200`. Se != 200, ABORTA, loga erro com HTTP code, NÃO incrementa attempts (problema é nosso, não do aluno).

### Passo 3 — Enviar DM canônica

Se canal OK, monta DM usando texto canônico abaixo + envia via `sendMessage` API:

```bash
curl -s -X POST \
     "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -d "chat_id=${STUDENT_TELEGRAM_ID}" \
     -d "text=${DM_CANONICA}" \
     -d "parse_mode=Markdown"
```

Output capturado em log. Se response não é `"ok": true`, retry 1x, depois aborta com erro logado.

### Passo 4 — Atualizar MEMORY.md

Se DM enviada com sucesso:
- Incrementa `wizard_resume_attempts` em 1
- NÃO limpa `wizard_resume_at` ainda (espera aluno responder; se não responder, próximo ciclo tenta de novo OU marca dismissed quando attempts == 3)
- Adiciona entry em `## Cron log`:

```markdown
- 2026-05-04 09:00:03 BRT — cron-resume-wizards: DM enviada (tentativa 1/3) pra retomar `wizard-conectar.passo3`
```

### Passo 5 — Cleanup quando aluno responde

Esta skill NÃO acompanha resposta — é fire-and-forget. A retomada propriamente dita é responsabilidade da skill `continuar-jornada` (que é triggered pela próxima mensagem do aluno).

Quando `continuar-jornada` retoma com sucesso, ela limpa `wizard_resume_at`, `wizard_resume_step`, `wizard_resume_attempts`. Loop fechado.

## DM canônica (P15 — usar LITERAL)

⚠️ **kit v2.5:** todas as DMs traduzem `{wizard_resume_step}` em linguagem natural + incluem contagem `X/3` desde a 1ª tentativa pra aluno saber onde tá no ciclo.

### Mapa de tradução `{wizard_resume_step}` → linguagem natural

| `wizard_resume_step` (técnico) | `{passo_natural}` (pra aluno) |
|---|---|
| `wizard-whisper-quick.passo0` ou `.passo*` | "passo 0 (áudio)" |
| `wizard-agente.passo*` | "passo 1 (personalidade do agente)" |
| `wizard-aluno.passo*` | "passo 2 (sua personalidade)" |
| `wizard-autonomia.passo*` | "passo 3 (autonomia)" |
| `wizard-workspace.passo*` | "passo 4 (workspace)" |
| `wizard-conectar.passo*` | "passo 5 (conectar superpoderes)" |
| `primeira-vitoria.passo*` | "passo 6 (primeira vitória)" |

⚠️ **Strings curtas + naturais.** Aluno PME lê "passo 3 (autonomia)" mais rápido que "passo 3 (liberar autonomia)". Verbos desnecessários no rótulo só aumentam ruído visual.

Substituir `{passo_natural}` nas DMs abaixo.

### Tentativa 1 (kit v2.5.6 — voz humana, sem cobrança · `wizard_resume_attempts: 0 → 1`)

```
Oi! Quando a gente parou ontem, você tava no {passo_natural} do starter-kit. Queria saber se você quer retomar — sem pressão.

Manda **`continuar`** que eu volto exatamente de onde paramos.

Se preferir não voltar, tudo bem também: **`pula`** que eu tiro da fila e a gente segue só com o que você quiser.
```

### Tentativa 2 (kit v2.5.6 — última e respeitosa · `wizard_resume_attempts: 1 → 2`)

```
Última vez que eu te chamo sobre isso, prometo. Você ainda tem o {passo_natural} pausado.

Se quiser, manda **`continuar`** — eu reabro de onde paramos.

Se não, sem problema: a partir de agora não te lembro mais disso. Você pode reativar quando quiser com **`continuar`** mesmo (a flag fica salva).
```

⚠️ **Removido em v2.5.6:** Tentativa 3 — antes era "última tentativa (3/3)" com tom de prazo. v2.5.6 reduz pra max 2 tentativas + tom respeitoso. Anti-hustle culture > completude.

**Tom:** primeira pessoa, sem menu rígido, sem urgência fabricada. Aluno PME adulto. Princípio: **oferece, não cobra**. Se aluno ignorou 2x, é porque ele decidiu — kit respeita silenciosamente.

**Ajuste de SOUL:** seguir SOUL.md do agente (formal/casual). Estrutura, ordem, opções e formatação **preservadas**. Tom-base humano não pode virar "robôtico" ou "vendedor de academia" mesmo se SOUL pedir.

**Falhas que isso PREVINE:**

1. **(Caso real Mira stress test 03/05 madrugada):** DM tentativa 1 dizia `{wizard_resume_step}` cru ("wizard-autonomia.passo3") — aluno PME não entende jargão interno. Mantida a tradução pra `{passo_natural}`.
2. **(Insight pós-Mira/Pedro 07/05):** 3 tentativas com tom imperativo ("Última tentativa", "tiro da fila") parecia cobrança. Aluno desliga mentalmente nas DMs 2 e 3. v2.5.6 reduz pra 2 + linguagem que oferece em vez de cobrar.

## Configuração de cron por ambiente

### Managed (OpenClaw cron-worker) — 1 ciclo diário (kit v2.5.6)

Aluno (ou skill `wizard-conectar` v2.0+ no fluxo de instalação do kit) roda no Managed:

```bash
openclaw cron create \
  --name "Cron Resume Wizards" \
  --schedule "0 9 * * *" \
  --skill "cron-resume-wizards" \
  --description "Cron-DM ativo 1x/dia (09:00 BRT) de retomada de wizards pausados (kit v2.5.6 — humanizado)"
```

⚠️ **Mudança v1.3 (kit v2.5.6):** schedule volta de `0 9,19 * * *` (2x/dia) pra `0 9 * * *` (1x/dia 09h). Razão: feedback Bruno + DNA anti-hustle. 2x/dia + 3 tentativas virou cobrança invasiva. v1.3 mantém só matinal + max 2 tentativas + tom humano.

**Migração de instalações kit v2.4–v2.5.5:** quem já tem o cron com schedule `0 9,19 * * *` precisa atualizar pra `0 9 * * *`. Comando:

```bash
openclaw cron delete cron-resume-wizards
openclaw cron create \
  --name "Cron Resume Wizards" \
  --schedule "0 9 * * *" \
  --skill "cron-resume-wizards"
```

Ou em VPS root: `systemctl edit openclaw-resume-wizards.timer` e ajustar `OnCalendar`.

Verificação:

```bash
openclaw cron list | grep cron-resume-wizards
```

### VPS root (systemd timer) — 2 ciclos

`/etc/systemd/system/openclaw-resume-wizards.service`:

```ini
[Unit]
Description=Cron Resume Wizards (OpenClaw kit v2.4)
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/root/.openclaw
ExecStart=/usr/local/bin/openclaw skill run cron-resume-wizards
StandardOutput=append:/var/log/openclaw-resume-wizards.log
StandardError=append:/var/log/openclaw-resume-wizards.log
```

`/etc/systemd/system/openclaw-resume-wizards.timer`:

```ini
[Unit]
Description=Run Resume Wizards 2x/day (09:00 + 19:00 BRT) — kit v2.4

[Timer]
OnCalendar=*-*-* 09:00:00
OnCalendar=*-*-* 19:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Ativação:

```bash
systemctl daemon-reload
systemctl enable --now openclaw-resume-wizards.timer
systemctl list-timers | grep resume-wizards
```

### Alternativa simples — crontab regular (VPS sem systemd) — 2 ciclos

```cron
0 9,19 * * * cd /root/.openclaw && /usr/local/bin/openclaw skill run cron-resume-wizards >> /var/log/openclaw-resume-wizards.log 2>&1
```

## Schema MEMORY.md (resumo)

Flags relevantes (todas opcionais — skill funciona sem elas):

```yaml
# Setadas pelo wizard que pausou (ex: primeira-vitoria, qualquer wizard com 3 desvios)
wizard_resume_at: 2026-05-04T09:00:00-03:00
wizard_resume_step: wizard-conectar.passo3
wizard_resume_attempts: 0

# Setada por esta skill quando attempts == 3
wizard_dismissed: true   # impede ciclos futuros pra esse passo

# Limpas pela continuar-jornada quando aluno retoma
# (todas as 3 acima viram null/removidas)
```

## Logs (P14 — auditável)

Cada execução adiciona uma linha em `MEMORY.md` na seção `## Cron log`:

```markdown
## Cron log

- 2026-05-03 09:00:02 BRT — cron-resume-wizards: nada a fazer (sem wizard_resume_at)
- 2026-05-04 09:00:03 BRT — cron-resume-wizards: DM enviada (tentativa 1/3) pra `wizard-conectar.passo3`
- 2026-05-05 09:00:01 BRT — cron-resume-wizards: wizard_resume_at no futuro, aguardando
- 2026-05-06 09:00:04 BRT — cron-resume-wizards: dismissed após 3 tentativas, limpando flags
```

Manter últimas 90 linhas. Mais antigas são truncadas.

## Princípios Defensivos (aplicação específica)

- **P3 (privilégio):** skill NUNCA executa elevação. Sem chamadas `exec-policy`, sem `sudo`. Só lê arquivo + faz HTTP request.
- **P5 (atualização MEMORY.md):** sempre atualiza após cada execução, mesmo "nada a fazer".
- **P9 (em erro, parar):** se DM falha, loga erro detalhado e termina. NÃO retry agressivo (próximo ciclo tenta de novo).
- **P11 (detectar antes):** detecta `active_wizard` antes de mandar DM — nunca interrompe wizard rodando.
- **P14 (smoke tests visíveis):** logs auditáveis no MEMORY.md, com timestamp, comando e output.
- **P15 (canonical):** DM literal, sem variações por execução.

## Roadmap

- **v1.1:** suportar múltiplas pendências (atualmente só 1 `wizard_resume_*` por vez; v1.1 vai armazenar lista FIFO)
- **v1.2:** horário customizável por aluno (lê preferência de USER.md, não hardcoded 09:00)
- **v1.3:** integração com `gera-log-jornada` — DMs enviadas viram entrada no log de feedback
- **v2.0:** detecção de fuso horário (alunos fora de BRT recebem 09:00 do TZ deles)

## Falhas que esta skill PREVINE

1. **Wizard morre silencioso (Bruno + aluno + outros, 03/05):** aluno pausa, esquece, nunca volta. Versão passiva da v2.1 só ajudava quando aluno tentava voltar. Cron-DM ativo PUXA aluno de volta no momento certo.
2. **Notificação SPAM (potencial sem anti-loop):** sem cap de 3 tentativas, agente vira chato. Limite + dismissed flag previnem.
3. **Interromper wizard ativo (potencial sem `active_wizard` check):** mandar DM "retoma X" enquanto aluno tá no meio de Y é UX horrível. Skill espera ciclo seguinte.

---

*Skill criada na v2.2 (Onda 14). Padrão herdado de `backup-workspace-github` mas com mode `cron` em vez de `guided`.*
