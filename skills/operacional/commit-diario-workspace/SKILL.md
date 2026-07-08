---
name: commit-diario-workspace
status: RASCUNHO
category: operacional
owner: agent (autônomo via cron)
version: 0.1
mode: cron
estimated_time: 30s-2min (depende de mudanças do dia)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Commit + push diário do workspace pro GitHub (gancho A2 backup-workspace-github + A9 cron + A12 GitHub via PAT). Roda toda noite 23h59 BRT, faz git add . / commit / push se houver mudança real. Skip silencioso se git status limpo. Notifica resultado no Telegram tópico Operação. Cria histórico granular do segundo cérebro além do snapshot semanal manual da A2.
---

# Commit Diário do Workspace — versionamento granular automático

## Promessa

Em ~30s-2min por dia (rodando 23h59 enquanto você dorme), agente faz commit + push do workspace inteiro pro GitHub. Cria histórico granular do que mudou no seu segundo cérebro — você consegue ver "o que mudou na quinta passada" em vez de só "qual foi o snapshot semanal".

Complementa (não substitui) a skill `backup-workspace-github` da A2:
- `backup-workspace-github` (A2) = setup inicial + push inicial
- `commit-diario-workspace` (A12) = commit incremental noturno

Resolve pendência cross-aula registrada em A12 do roteiro principal.

## Quando disparar

**Trigger primário (cron):**
- Cron diário 23h59 BRT
- Sessão isolada (`--session isolated`)
- Comando natural pra criar:
  > *"cria um cron toda noite 23h59 que roda a skill commit-diario-workspace em sessão isolada e me posta resultado no tópico Operação"*

**Trigger explícito (sob demanda):**
- "commita o workspace agora"
- "commit diário"
- "salva no GitHub"

**NÃO disparar se:**
- Já rodou nas últimas 6h (resultado em cache em `MEMORY.md` `last_daily_commit`)
- `backup-workspace-github` ainda não foi configurado (skill irmã obrigatória)

## Pré-requisitos

1. `backup-workspace-github` ativo (setup feito na A2 ou via item Integrações da CHECKLIST)
2. `GITHUB_TOKEN` no `.env` com scope `repo` (recap A12 — Padrão 1 de auth)
3. Repo GitHub privado configurado e remote `origin` apontando pra ele
4. Branch padrão definida (geralmente `main`)

## Princípio fundador

**Princípio de versionamento granular**: snapshot semanal manual (A2) é cobertor de proteção contra catástrofe. Commit diário é histórico de evolução. São complementares, não redundantes.

Aplica também **Princípio 3 dos defensivos**: skill é autônoma via cron mas opera dentro de scope específico (workspace · git operations · GitHub push). Não escala permissão, não toca arquivo fora do workspace, não modifica config do agente.

## Fluxo principal

### 1. Detecção de mudança (5s)

```bash
cd ~/.openclaw/workspace
git status --porcelain
```

| Resultado | Ação |
|-----------|------|
| Output vazio | **Skip silencioso** — git limpo, nada pra commitar. Marca `last_daily_commit_status: skipped` em MEMORY.md, não notifica. Sai. |
| Output com arquivos | Continua pro passo 2 (existe mudança real) |
| Erro (`not a git repo`) | Notifica falha + pausa skill (pré-requisito quebrado) |

### 2. Análise de mudanças (10s)

Captura resumo do que mudou:

```bash
git status --short
git diff --stat
```

Formata pra notificação:
- Quantidade de arquivos modificados/criados/deletados
- Top 5 arquivos com mais mudanças (linha count)
- Pasta com mais atividade (memory/, content/, skills/, etc)

### 3. Commit (5s)

```bash
git add .
git commit -m "Auto: snapshot $(date +%Y-%m-%d %H:%M)"
```

**Mensagem de commit padrão:**
```
Auto: snapshot 2026-05-03 23:59

Modificados: N arquivo(s)
Criados: N arquivo(s)
Pasta principal: memory/

[skill: commit-diario-workspace v0.1]
```

### 4. Push (10s-1min, depende de tamanho)

```bash
git push origin main
```

Tratamento de erro:

| Erro | Causa provável | Ação |
|------|----------------|------|
| `Authentication failed` | `GITHUB_TOKEN` expirou ou foi revogado | Notifica imediatamente · NÃO retry · marca skill como failed até token rotacionado |
| `Updates were rejected` | Branch divergiu (alguém commitou direto pelo GitHub web) | Tenta `git pull --rebase` automático · se conflito, notifica e pausa |
| `Network error` | Falha temporária | Retry 1x após 30s · se falhar de novo, notifica |
| `Repository not found` | Remote desconfigurado | Notifica + pausa skill (pré-requisito quebrado) |

### 5. Notificação (5s)

Posta no Telegram tópico **Operação**:

**Caso commit OK:**
```
✅ Commit diário do workspace OK
03/05/2026 23:59

Modificados: 12 arquivos
Criados: 3 arquivos
Atividade: memory/ (8) · content/ (5) · skills/ (2)

Top 5 arquivos com mais mudanças:
- memory/2026-05-03.md (+87/-12)
- content/linkedin/drafts/post-x.md (+56/-0)
- memory/context/decisoes/2026-05.md (+34/-8)
- areas/conteudo/contexto/voz/linkedin.md (+22/-3)
- memory/curso-openclaw/ROTEIRO-MAIN-V2.md (+18/-2)

Push: 1.2MB · 3.8s
```

**Caso skip silencioso:**
- NÃO posta nada (git limpo, sem novidade)
- Atualiza apenas MEMORY.md com `status: skipped`

**Caso falha:**
```
🔴 Commit diário FALHOU — 03/05/2026 23:59

Erro: Authentication failed
Causa provável: GITHUB_TOKEN expirou ou foi revogado

Ação sugerida: rotaciona PAT no github.com/settings/tokens
e atualiza .env. Skill pausada até confirmação.
```

### 6. Atualizar MEMORY.md

```markdown
## Last daily commit
- Data: 2026-05-03 23:59
- Status: ok | skipped | failed
- Modificados: 12 (se ok)
- Erro: <descrição> (se failed)
- Próximo agendado: 2026-05-04 23:59
```

## Critérios de sucesso

- [ ] Cron rodou no horário previsto (23:59 ± 5min)
- [ ] Detectou estado correto do git (modificado vs limpo)
- [ ] Se modificado: commit + push executados sem erro
- [ ] Se limpo: skip silencioso (sem notificação)
- [ ] Se erro: notificação completa + skill pausada (não tenta loop)
- [ ] `MEMORY.md` atualizado com status

## Erros comuns

- **GITHUB_TOKEN expira em 30/60/90 dias**: cron diário falha silencioso quando token expira. **Solução:** cron mensal (gancho A9 — meta-cron) que lembra de rotacionar PAT 7 dias antes do vencimento
- **Conflito de branch**: alguém commitou direto pelo GitHub web e localmente também tem mudança. Rebase automático funciona pra mudanças não conflitantes. **Solução:** se conflito, skill pausa e notifica — você resolve manual
- **Workspace gigante**: push de 100MB+ pode demorar. **Solução:** `.gitignore` agressivo (excluir `node_modules`, `*.log`, `tmp/`, `.cache`, files >10MB) — verificar antes de ativar skill
- **Repo público acidental**: workspace tem dados pessoais. SE repo virou público sem querer, **NÃO ativa esta skill até voltar pra privado**. Configurar trigger que falha se `gh repo view --json visibility` retornar `PUBLIC`
- **GitHub Actions consumindo build minutes**: se você tem Action rodando em cada push, vai disparar diariamente. **Solução:** adicionar `[skip ci]` no commit message OR limitar Actions a paths específicos

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../../starter/onboarding-checklist/references/principios-defensivos.md`](../../starter/onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 3 (NUNCA elevação via agente)**: skill opera dentro de scope fixo (workspace + git ops + GitHub push). Não toca arquivo fora do workspace. Não modifica config do agente. Não escala permissão
- **Princípio 5 (atualizar MEMORY ao concluir)**: cada execução atualiza `last_daily_commit` em MEMORY
- **Princípio 9 (parar se algo der errado)**: erro de auth ou repo não pausa apenas a execução, **pausa a skill inteira** até confirmação humana
- **Princípio 11 (detectar antes de pedir)**: começa SEMPRE com `git status` — se limpo, skip silencioso. Não cria commit vazio nem notificação desnecessária

## Caso público vs privado

**Repo PRIVADO** (default e único caminho permitido):
- Workspace contém info sensível (USER.md, decisões, pessoas, negócios)
- Skill exige `gh repo view --json visibility` retornar `PRIVATE` antes de cada push
- Se virar `PUBLIC` por engano, skill pausa imediatamente

**Repo PÚBLICO**: skill NUNCA roda. Recap A10/A12 — workspace é território sensível.

## Referências

### Internas
- A2 do roteiro principal: skill irmã `backup-workspace-github` (setup inicial)
- A9 do roteiro principal: como criar/agendar crons via comando natural
- A12 do roteiro principal: contexto da skill (Bloco 4 — GitHub via PAT) e princípios A10 (scope mínimo, rotação)
- Princípios defensivos: `../../starter/onboarding-checklist/references/principios-defensivos.md`
- Cheatsheet `integracoes-de-produtividade.md`: padrão 1 (token simples) + Prompt #2 (GitHub via PAT)

### Externas
- GitHub PAT docs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- OpenClaw cron docs: https://docs.openclaw.ai/cli/cron
- OpenClaw secrets docs: https://docs.openclaw.ai/cli/secrets

## Status

🟡 RASCUNHO desde 03/05/2026 — esboçada na sessão de fechamento da A12 do roteiro principal, antes de gravação. Pendências:

1. Validar que `git push` funciona dentro do ambiente do daemon OpenClaw (lshell vs ambiente do agente — agente roda fora da lshell, deve ter acesso normal a git)
2. Confirmar que `gh` CLI tá disponível pra check de visibilidade do repo (alternativa: parsing de `git remote -v`)
3. Decidir se skill detecta automaticamente que `backup-workspace-github` foi configurado (read MEMORY.md flag) ou exige aluno confirmar
4. Definir release: v1.0 do kit (junto da A12) ou v1.1 (depois)?

## Roadmap

- v0.2: validação real executada + ajuste fino dos triggers
- v0.3: integração com cron mensal de rotação de PAT (cross-skill)
- v1.0: pronta pra entrar no Starter Kit
- v1.1: detectar arquivo grande (>10MB) e perguntar antes de commit (gitignore sugerido)
- v1.2: sumário semanal automático ("essa semana você commitou X arquivos em Y dias produtivos") — cross com `revisao-do-dia` (skill da A9)
- v2: integração com 1Password Service Account quando OpenClaw lançar caminho first-class (rotação de PAT via cofre)
