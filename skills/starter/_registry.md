# Registry — starter/ (jornada obrigatória)

> Skills da jornada principal do Starter Kit.
> Aluno novo passa por todas em ordem (com possibilidade de pular).

## Skills

| Skill | Status | Versão | Owner | Mode | Tempo |
|---|---|---|---|---|---|
| [`onboarding-checklist`](onboarding-checklist/SKILL.md) | ✅ ATIVO | 1.9 | aluno | guided | 1min apresentação / 37min jornada total. v1.9 (kit v2.3): **Fase Pré-Zero (detecção de ambiente ANTES de qualquer wizard) + Modo A v2 (checklist por aulas A0-A6 em vez de passos)** + 4 comandos canonical novos (abre/vi/vou assistir/travei A{X}) + Modo A condicional por ambiente (passo 0 invisível em Managed). v1.8: bloco canonical na bifurcação de modo. |
| [`wizard-whisper-quick`](wizard-whisper-quick/SKILL.md) | ✅ ATIVO | 1.11 | aluno | guided | 5min (~15s em Managed via fast-path — chave OpenAI vem do setup Hostinger). v1.11 (kit v2.3): fast-path checa env var `$OPENAI_API_KEY` PRIMEIRO (antes de `.env`) — chave Managed fica em env var, não em arquivo. Antes (v1.10) só lia `.env` e falhava em Managed. |
| [`wizard-agente`](wizard-agente/SKILL.md) | ✅ ATIVO | 1.1 | aluno | guided | 4min (ou 1min se já configurado) |
| [`wizard-aluno`](wizard-aluno/SKILL.md) | ✅ ATIVO | 1.1 | aluno | guided | 3min (ou 30s se já configurado) |
| [`wizard-autonomia`](wizard-autonomia/SKILL.md) | ✅ ATIVO | 1.5 | aluno | guided | 5min (manual no terminal — bifurcação Managed CLI vs ROOT SSH, copy do aluno) |
| [`wizard-workspace`](wizard-workspace/SKILL.md) | ✅ ATIVO | 1.1 | aluno | guided | 4min |
| [`wizard-conectar`](wizard-conectar/SKILL.md) | ✅ ATIVO | 1.5 | aluno | guided | 12min (varia por chaves existentes) — PAT-only, tutorial visual GitHub em 4 screenshots. v1.5 (kit v2.3): URL Brave correta (`https://brave.com/pt-br/search/api/` pra criar conta — homepage; `api.search.brave.com/app/keys` só pós-login) + disclaimer cartão obrigatório no plano free. Fix Bruno conta nova. |
| [`primeira-vitoria`](primeira-vitoria/SKILL.md) | ✅ ATIVO | 1.7 | aluno | guided | 5min + pré-check de flags + retoma pulos opcionais + auto-arquivamento de material de instalação (kit v2.2 final) + msg final com comandos de retomada |
| [`continuar-jornada`](continuar-jornada/SKILL.md) | ✅ ATIVO | 1.1 | aluno | guided | 2-5min (varia conforme estado) — orchestrator pós-Bloco A (introduzida na v2.1) |
| [`gera-log-jornada`](gera-log-jornada/SKILL.md) | ✅ ATIVO | 1.1 | aluno | guided | 1-2min — gera log estruturado da jornada pra feedback (Tally + grupo Telegram), introduzida na v2.1 |

> **v2.2 (auditoria):** todos os 8 wizards filhos + 2 skills novas têm header com Princípios 13/14/15 explícitos no topo. wizard-conectar v1.4 já tinha versão expandida (mantido). Detalhes em [`onboarding-checklist/references/wizard-header-template.md`](onboarding-checklist/references/wizard-header-template.md).

## Ordem oficial da jornada

```
0. wizard-whisper-quick (opcional, antes da jornada)
↓
1. wizard-agente
↓
2. wizard-aluno
↓
3. wizard-autonomia
↓
4. wizard-workspace
↓
5. wizard-conectar (ativa backup-workspace-github de operacional/)
↓
6. primeira-vitoria (NPS no fim, jornada completa)
```

## Dependências entre skills

Ver detalhe completo em [`onboarding-checklist/references/dependencias.md`](onboarding-checklist/references/dependencias.md).

Resumo:
- 0, 1, 2, 3 → independentes (sem dependência)
- 4 → depende de 3 (sem yolo, agente pede aprovação a cada criação)
- 5 → depende de 3 (sem yolo, agente pede aprovação a cada chave)
- 6 → depende de 3 + 4 + 5 (sem qualquer um, vitória degrada)

## Padrão comum entre os 7 wizards filhos

Todos seguem este esqueleto:

```
1. Detecção (Princípio 11) — lê estado atual antes de pedir nada
2. Decide caminho (pulo / parcial / completo)
3. Executa caminho escolhido (entrevista, criação de arquivo, validação de chave, etc)
4. Pergunta-âncora (texto literal em onboarding-checklist/references/mapa-aulas.md)
5. Marca flag em MEMORY.md (whisper_configured, agente_configured, etc)
6. Devolve controle pra onboarding-checklist (que renderiza checklist atualizada)
```

## Princípios universais

Todas as skills aqui herdam os princípios defensivos da `onboarding-checklist`. Ver: [`onboarding-checklist/references/principios-defensivos.md`](onboarding-checklist/references/principios-defensivos.md).

Especialmente relevantes:
- **Princípio 1** (backup antes de sobrescrever)
- **Princípio 3** (agente NUNCA elevação de privilégio — wizard-autonomia é a aplicação canônica)
- **Princípio 11** (detectar antes de pedir + .env first pra credenciais)
- **Princípio 12** (mapas distribuídos — wizard-workspace implementa)

## Templates usados pelos wizards

Em [`../../templates/`](../../templates/):

- `IDENTITY.template.md` (wizard-agente)
- `SOUL-stub.template.md` (wizard-agente)
- `AGENTS.template.md` (wizard-agente)
- `USER.template.md` (wizard-aluno)
- `MAPA.template.md` (wizard-workspace)

Mapas locais (`content/MAPA.md`, `memory/MAPA.md`, etc.) são gerados inline pelo wizard-workspace.

## Modo A vs Modo B (apresentação)

Toda skill aqui suporta os 2 modos:

- **Modo A** (aula-por-aula) — passos numerados, cada wizard menciona aula correspondente do mini-curso
- **Modo B** (wizard direto) — conversacional, sem números, fluído

Lógica é a mesma. Só muda apresentação. Aluno troca a qualquer momento com "muda modo" (comando 8).

---

*Registry v2.2 — Onda 14 completa (03/05/2026 tarde). Auditoria de Princípios 13/14/15 em todos os wizards filhos + 2 skills novas (continuar-jornada/gera-log-jornada) bumpadas.*
