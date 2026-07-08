# Registry — operacional/ (skills utilities)

> Skills utilities pra operação contínua do agente.
> Não fazem parte da jornada obrigatória do starter-kit, mas são instaladas/ativadas durante ela.

## Skills

| Skill | Status | Versão | Owner | Mode | Quando ativar |
|---|---|---|---|---|---|
| [`backup-workspace-github`](backup-workspace-github/SKILL.md) | ✅ ATIVO | 1.0 | aluno | guided | Item "Integrações" da checklist (módulo 7) ou comando "ativa backup" |
| [`cron-resume-wizards`](cron-resume-wizards/SKILL.md) | ✅ ATIVO | 1.1 | agent (autônomo) | cron | Cron interno do agente. **v1.1 (kit v2.4):** 2 ciclos diários (09:00 + 19:00 BRT) — antes só 09:00, fix stress test Pedro. NOVA na v2.2 — Cron-DM ATIVO de retomada de wizards pausados (upgrade do mecanismo passivo da v2.1). Funciona em Managed (cron-worker OpenClaw) e VPS root (systemd timer). |
| [`seguranca-checklist`](seguranca-checklist/SKILL.md) | 🟡 RASCUNHO | 0.1 | aluno | read-only | Comando "audit segurança" / "scan agente" OU cron mensal (dia 1, 9h). Audit das 5 frentes da A10 (secrets · APIs/scope · canais · injection · recovery). Read-only por design — só reporta, aluno decide. Rascunhada 03/05/2026, release v1.0 ou v1.1 a definir. |
| [`commit-diario-workspace`](commit-diario-workspace/SKILL.md) | 🟡 RASCUNHO | 0.1 | agent (autônomo via cron) | cron | Cron diário 23h59 BRT — commit + push do workspace pro GitHub se houver mudança real (skip silencioso se git limpo). Notifica resultado no Telegram tópico Operação. Complementa `backup-workspace-github` (A2 = setup inicial) com versionamento granular (A12). Resolve pendência cross-aula A12. Rascunhada 03/05/2026, release v1.0 ou v1.1 a definir. |

## Princípios universais

Todas as skills aqui herdam os princípios defensivos da `onboarding-checklist`. Ver: [`../starter/onboarding-checklist/references/principios-defensivos.md`](../starter/onboarding-checklist/references/principios-defensivos.md).

Em v2.2, P13/P14/P15 ganharam tratamento especial em `cron-resume-wizards` — DM canônica (P15), logs auditáveis (P14), e respeitar wizard ativo (não interromper).

## Roadmap (skills futuras)

- `health-check` — diagnóstico do estado do agente (skills, crons, integrações)
- `restore-from-backup` — reverte workspace pra estado anterior do GitHub
- `clean-orphans` — remove arquivos órfãos detectados em pastas
- `cron-resume-wizards` v1.1 — múltiplas pendências (FIFO) em vez de 1 só
