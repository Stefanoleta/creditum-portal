---
name: backup-workspace-github
status: ATIVO
category: operacional
owner: aluno
version: 1.2
mode: guided
estimated_time: 5min (ativação) + automatic (cron)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4]
description: Use when student wants automatic daily backup of workspace to private GitHub repo. Activates during item "Integrações" of the wizard checklist OR standalone when student types "ativa backup github" / "configura backup". Combines openclaw backup create + git push to student's private repo. Cron daily at 03:00 BRT. Maintains 30-day history. Notifies via Telegram on failure. **v1.2 (kit v2.5.3 — fix Allan silêncio 10min): regra UX EXPECTATIVA aplicada no primeiro push manual. Antes de invocar `git push backup main` (que pode levar 30s-2min), agente manda canonical avisando expectativa de tempo + reconhecendo que vai ficar bloqueado durante execução. Evita repetir caso Allan 03/05 17:55-18:05 onde aluno achou que travou. v1.1 (kit v2.5.2): mensagens de ativação são SEQUENCIAIS e cada uma tem smoke test visível (P14). Antes (v1.0) bot mandava "Feito. Backup ativo. Cron 03:00." ANTES de mandar "Vou ativar..." — caso real Adrylan 17:32 confirmação chegou antes do 17:33 anúncio. Sem ordem garantida = ABORTAR.**
---

# Backup Workspace GitHub

> 🔴 **PRINCÍPIOS NÃO-NEGOCIÁVEIS PRO AGENTE (kit v2.5.2):**
>
> **P14 EXTRA-RÍGIDO nesta skill** (caso real Adrylan 03/05 17:32-17:33):
>
> Mensagens de ativação são SEQUENCIAIS e cada uma tem smoke test visível:
>
> 1. **Anúncio + comando:** "Vou ativar backup agora. Comando: `{cmd}`"
> 2. **Output literal:** "Output: ```{stdout/stderr}```"
> 3. **Confirmação SÓ DEPOIS de output OK:** "✓ Backup ativo. Cron 03:00 BRT registrado."
>
> **NUNCA mandar a confirmação (passo 3) ANTES dos passos 1+2.** Se output não for OK, ABORTA — não finge sucesso. Se Telegram bridge tiver race condition (mensagens chegando fora de ordem), enviar tudo em UMA mensagem em vez de 3 (perde respiro visual mas garante ordem).
>
> Falha real (Adrylan stress test 03/05): 17:32 bot mandou "Feito. Backup GitHub ativo. Cron 03:00 BRT." → 17:33 mandou "Vou ativar o backup agora..." — confirmação chegou ANTES do anúncio. Aluno legitimamente confuso.
>
> Detalhes: `../../starter/onboarding-checklist/references/principios-defensivos.md` (P14 — Smoke tests visíveis).

## Promessa

O workspace inteiro do aluno (skills, memory, configs, arquivos raiz — exceto `.env`) é versionado automaticamente todo dia em um repo privado do GitHub. Se algo der errado (deleção acidental, bug do Managed, hardware fail), aluno restaura pelo histórico de commits.

## Quando disparar

**Trigger automático (durante jornada):**
- Aluno chega no item "Integrações" da checklist (módulo 7) e fornece o GitHub Service Token

**Trigger explícito (standalone):**
- "ativa backup github"
- "configura backup"
- "quero backup do workspace"

**NÃO disparar se:**
- Cron `backup-workspace-github` já tá rodando (verificar via `openclaw cron list`)
- Aluno explicitamente desativou backup (`backup_disabled=true` em `MEMORY.md`)

## Princípio 11 — Detectar antes de pedir

Antes de qualquer coisa, **detectar** estado atual:

```
1. Lê .env: existe GITHUB_TOKEN?
2. Roda `openclaw cron list`: existe cron backup-workspace-github?
3. Verifica se repo privado existe no GitHub do aluno
```

**Casos:**

| Estado | Ação |
|---|---|
| Tudo configurado e rodando | "✓ Backup já tá ativo. Último push: {timestamp}. Próximo: hoje 03:00." |
| Token existe mas cron não | Ativa cron com token existente (skip pedir token) |
| Token não existe | Pede token (segue fluxo "credencial não encontrada" do Princípio 11/.env first) |
| Repo não existe | Cria repo privado no GitHub do aluno via API |

## Princípio ".env first"

Token GitHub segue padrão universal de credenciais:

1. Tenta ler `GITHUB_TOKEN` do `.env`
2. Se achou e funciona (call de teste à API GitHub): usa direto
3. Se achou mas inválido: explica erro e pede novo token
4. Se não achou: pede ao aluno (uma vez)
5. Salva no `.env` com nome canônico `GITHUB_TOKEN`

**Como aluno gera o token:**

```
"Pra criar GitHub Service Token:

1. Acessa https://github.com/settings/tokens (logado)
2. Clica 'Generate new token (classic)'
3. Nome sugerido: 'openclaw-backup-{seu-agente}'
4. Expiration: 'No expiration' (ou 1 ano se preferir rotacionar)
5. Marca scopes: 'repo' (acesso completo a repos privados)
6. Clica 'Generate token' no fim
7. Copia o token (começa com ghp_...) e cola aqui

Atenção: o token só é mostrado UMA vez. Copia agora."
```

## Fluxo de configuração

### 1. Validar token GitHub

Após receber token, agente roda:

```bash
curl -s -H "Authorization: token GITHUB_TOKEN" https://api.github.com/user
```

Se retorna 200 com info do usuário: ✓ token válido
Se retorna 401: token inválido — pede novo
Se outro erro: investiga e reporta

### 2. Criar repo privado (se não existir)

Nome padrão: `{username-github}-workspace-backup`

```bash
curl -X POST -H "Authorization: token GITHUB_TOKEN" \
     https://api.github.com/user/repos \
     -d '{"name": "{nome}", "private": true, "auto_init": true}'
```

Confirmação ao aluno: "✓ Repo criado: github.com/{username}/{nome}-workspace-backup (privado)"

### 3. Configurar git local no workspace

```bash
cd $WORKSPACE
git init  # se não estiver inicializado
git remote add backup https://{TOKEN}@github.com/{username}/{nome}-workspace-backup.git
```

**Importante:** o token vai inline no remote URL. Cuidado com vazamento — não commitar `.git/config` em outro repo.

### 4. Criar `.gitignore` defensivo

Adicionar/verificar entradas no `.gitignore` do workspace:

```
.env
.env.local
.env.*.local
*.key
*.pem
*-credentials.json
.tmp-*
```

**Crítico:** `.env` NUNCA vai pro backup. Chaves API ficam só no Managed do aluno.

### 5. Criar cron diário

```bash
openclaw cron create \
  --name "backup-workspace-github" \
  --schedule "0 3 * * *" \
  --tz "America/Sao_Paulo" \
  --command "cd $WORKSPACE && \
             openclaw backup create && \
             git add -A && \
             git commit -m \"backup: $(date +%Y-%m-%d-%H%M)\" && \
             git push backup main"
```

Confirma ao aluno: "✓ Cron configurado: diário às 03:00 BRT"

### 6. Primeiro push manual (smoke test)

**REGRA UX EXPECTATIVA (kit v2.5.3 — fix Allan):**

Antes de invocar a tool de push, mandar mensagem canonical pro aluno avisando da expectativa. Comando `git push backup main` no primeiro push sobe workspace inteiro (50-200 MB tipicamente) e leva 30s-2min, dependendo da rede do Managed.

Sem esse aviso, aluno fica olhando 1-2 minutos sem feedback achando que travou (caso real Allan 03/05 17:55-18:05 — 10min de silêncio durante setup levou aluno a perguntar "ainda processando?").

**Mensagem canonical antes de invocar git push:**

```
🔄 Vou fazer o primeiro backup agora — `git push backup main`.

Esse comando sobe o workspace inteiro pro GitHub privado. Dependendo do tamanho dele e da rede do Managed, pode levar 30s-2min.

Vou ficar bloqueado esperando o git terminar (não consigo mandar update no meio). Se demorar mais de 3min, pode ser que travou de verdade — me avisa.
```

Depois roda imediatamente:

```bash
cd $WORKSPACE
git add -A
git commit -m "backup: initial setup $(date +%Y-%m-%d-%H%M)"
git push backup main
```

Se sucesso: "✓ Primeiro backup feito. Você pode ver em https://github.com/{username}/{nome}-workspace-backup"

Se erro: investiga (provavelmente .gitignore mal configurado ou token sem scope correto) e reporta.

**Por que ANTES e não DURANTE:** durante a execução do tool, agente fica BLOQUEADO esperando retorno. Não tem mecanismo de mandar update intermediário ("ainda subindo, X% feito"). Só dá pra setar expectativa ANTES, e cumprir DEPOIS.

Detalhes da regra: `../../starter/onboarding-checklist/references/principios-defensivos.md` (P14 — Regra UX EXPECTATIVA antes de comandos longos).

### 7. Atualizar MEMORY.md

```markdown
- {data}: backup-workspace-github ativado. Repo: {url}. Cron: 03:00 BRT.
```

E flag: `backup_active: true`

## Critérios de sucesso

- [ ] `GITHUB_TOKEN` no `.env` e validado
- [ ] Repo privado criado no GitHub do aluno
- [ ] `.gitignore` exclui `.env` e secrets
- [ ] Cron `backup-workspace-github` rodando
- [ ] Primeiro push manual completou com sucesso
- [ ] `backup_active: true` em `MEMORY.md`

## Erros comuns

- **Token sem scope `repo`:** GitHub retorna 404 ao tentar criar repo. Pedir aluno regenerar token marcando `repo`.
- **`.env` indo pro backup:** falha catastrófica. SEMPRE validar `.gitignore` antes do primeiro push.
- **Repo nome conflita:** se já existir repo com mesmo nome, sufixar com `-2`, `-3`, etc.
- **Workspace tem outro remote configurado:** usar `backup` como nome do remote (não `origin`) pra não conflitar.
- **Cron silenciosamente falha:** configurar notificação via Telegram quando cron falha (próxima versão).

## Histórico de commits

Cada backup vira commit separado. Aluno consegue:

- Ver histórico: `git log backup/main`
- Restaurar versão antiga: `git checkout backup/main~7` (volta 7 dias)
- Ver diff: `git diff backup/main~1 backup/main` (mudanças do último dia)

Histórico de 30 dias garantido por convenção. Mais que isso, GitHub não cobra extra (repo privado free tier).

## Limpeza/desativação

Se aluno quiser parar:

```
"desativa backup"
```

Comportamento:
1. Remove cron: `openclaw cron remove backup-workspace-github`
2. Marca `backup_disabled: true` em `MEMORY.md`
3. **NÃO deleta repo** — fica no GitHub do aluno como histórico
4. **NÃO remove `GITHUB_TOKEN` do .env** — pode ser útil pra outras integrações
5. Confirma: "✓ Backup desativado. Repo histórico continua em {url}. Reativar a qualquer momento com 'ativa backup'."

## Atualização do TOOLS (se existir)

Esta skill aplica Princípio 12 (mapas distribuídos). Se aluno tiver `skills/operacional/MAPA.md`, atualizar com:

```markdown
| backup-workspace-github | Backup diário do workspace pro GitHub privado | ativo |
```

Não criar TOOLS.md monolítico (Princípio 12 proíbe).

## Princípios Defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: `skills/starter/onboarding-checklist/references/principios-defensivos.md`.

### Aplicação específica

- **Princípio 1 (backup antes):** N/A — esta skill É backup. Mas valida `.gitignore` antes do primeiro push (proteção equivalente)
- **Princípio 2 (confirmação):** pede confirmação antes de criar cron (afeta infra)
- **Princípio 11 (detectar antes de pedir):** lê estado atual antes de configurar — se já tá rodando, não duplica
- **Princípio ".env first":** GitHub Token segue padrão universal de credenciais

## Referências

- Padrão `.env first`: `skills/starter/onboarding-checklist/references/principios-defensivos.md` (Princípio 11)
- Como GitHub gera tokens: https://github.com/settings/tokens
- Documentação `openclaw cron`: rodar `openclaw cron --help`

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Notificação automática via Telegram quando cron falha
- v1.2: Comando "restaura do backup {data}" pra reverter workspace
- v2: Suporte a múltiplos remotes (backup pra mais de 1 repo simultâneo)
