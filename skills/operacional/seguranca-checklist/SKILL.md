---
name: seguranca-checklist
status: RASCUNHO
category: operacional
owner: aluno
version: 0.1
mode: read-only
estimated_time: 2-3min (audit + report)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "audit segurança" / "checklist segurança" / "como tá minha segurança" / "scan agente", OR when dispatched monthly via cron (gancho A9). Roda 5 verificações de saúde de segurança no agente do aluno e gera report ranqueado por urgência. NÃO executa ações — só reporta. Princípio 3 dos defensivos: agente não escala permissão sozinho. Aluno revisa report e decide o que fazer.
---

# Seguranca Checklist — audit mensal de segurança do agente

## Promessa

Em ~2-3min, agente faz audit das 5 frentes de segurança da A10 (secrets · APIs/scope · canais · prompt injection · recovery) e devolve um relatório formatado no Telegram. Sem executar nada — só reporta o que tá frouxo, ranqueia por urgência e sugere próxima ação.

Pensado pra rodar **mensalmente via cron** (gancho A9 — meta-cron de auditoria) ou sob demanda quando aluno quer ver estado geral.

## Quando disparar

**Trigger automático (recomendado):**
- Cron mensal — dia 1 de cada mês, 9h BRT, sessão isolada, posta no tópico Operação
- Comando natural pra criar: *"cria um cron mensal dia 1 às 9h que roda o seguranca-checklist e me posta no tópico Operação"*

**Trigger explícito (sob demanda):**
- "audit segurança"
- "checklist segurança"
- "como tá minha segurança"
- "scan agente"
- "rola um seguranca-checklist"

**NÃO disparar se:**
- Já rodou nas últimas 24h (resultado em cache em `MEMORY.md` `last_security_audit`)

## Princípio fundador

**Princípio 3 dos defensivos** (`onboarding-checklist/references/principios-defensivos.md`): comandos de elevação de privilégio NUNCA via agente.

Esta skill é **read-only por design** — lê estado, gera report, devolve pro aluno decidir. Nenhum subcomando dela escreve, deleta, rotaciona ou conecta nada. Aluno é a única pessoa que abre porta nova.

## Fluxo principal

### 1. Detecção (5s)

Roda em paralelo as 5 verificações:

| # | Verificação | Como | Output esperado |
|---|-------------|------|-----------------|
| 1 | **Secrets em texto** | Lê `~/.openclaw/.env`, lista nomes de chaves (NÃO valores) | `OPENAI_API_KEY · BRAVE_SEARCH_API_KEY · GITHUB_TOKEN` |
| 2 | **Integrações ativas** | Lê `auth-profiles.json` ou equivalente, lista cada integração | Lista de canais + APIs conectados |
| 3 | **Devices conectados** | Roda `openclaw devices list` | Lista com data de último uso |
| 4 | **exec-policy atual** | Roda `openclaw exec-policy show` | `yolo` ou `ask` ou outro |
| 5 | **Snapshot Hostinger** | Lê data do último snapshot manual via API ou flag em `MEMORY.md` | Data ou "desconhecido" |

### 2. Análise (10s)

Para cada verificação, classifica em 1 de 4 status:

| Status | Critério | Cor visual no report |
|--------|----------|---------------------|
| **OK** | Tá saudável, sem ação necessária | verde |
| **ATENÇÃO** | Mudança recomendada mas não urgente | amarelo |
| **AGIR** | Risco real, precisa endereçar nesta semana | laranja |
| **CRÍTICO** | Risco imediato, agir hoje | vermelho |

Regras de classificação:

| Verificação | OK | ATENÇÃO | AGIR | CRÍTICO |
|-------------|-----|---------|------|---------|
| Secrets em texto | 0-3 chaves | 4-6 chaves | 7+ chaves | 1+ chave com nome contendo "PROD" ou "ROOT" ou "ADMIN" |
| Integrações | Todas com data <60d | Alguma com 60-90d | Alguma com >90d | Alguma desconhecida (sem data) |
| Devices | Todos com atividade <30d | Algum com 30-60d | Algum com >60d | Algum desconhecido pelo nome |
| exec-policy | yolo (esperado pós-A2) | ask (mais conservador, pode ser intencional) | reset (default = aluno reverteu sem documentar) | mismatch entre `MEMORY.md` e estado real |
| Snapshot | <30d | 30-60d | >60d | Desconhecido / nunca |

### 3. Report formatado (no Telegram)

Template:

```
📋 Seguranca Checklist — {data}

🟢 OK ({n_ok})
{itens com status OK, 1 linha cada}

🟡 ATENÇÃO ({n_atencao})
{item} — {sugestão de ação}

🟠 AGIR ESTA SEMANA ({n_agir})
{item} — {ação sugerida + por quê}

🔴 CRÍTICO ({n_critico})
{item} — {ação sugerida + por quê + comando exato pra você rodar}

---
Próxima ação prioritária: {ação ranqueada do mais urgente}

Quer que eu detalhe algum item? Manda o número.
Próximo audit: {dia 1 do próximo mês}.
```

Exemplo concreto de output:

```
📋 Seguranca Checklist — 03/05/2026

🟢 OK (3)
- exec-policy: yolo (consistente com MEMORY)
- Snapshot Hostinger: 12d atrás (12/04)
- Devices: 2 ativos, todos com atividade <7d

🟡 ATENÇÃO (1)
- 5 secrets em texto no .env: OPENAI · BRAVE · GITHUB · NOTION · STRIPE
  Sugestão: começar a migrar pra 1Password (cheatsheet seguranca-do-seu-agente.md)

🟠 AGIR ESTA SEMANA (1)
- Integração Stripe conectada há 92 dias sem rotação
  Razão: chave nunca rotacionada = prazo de exposição alto se vazar
  Sugestão: rotacionar este fim de semana

🔴 CRÍTICO (0)
✓ Nenhum item crítico.

---
Próxima ação prioritária: rotacionar chave Stripe.
Quer que eu detalhe algum item? Manda o número.
Próximo audit: 01/06/2026.
```

### 4. Atualizar MEMORY.md

```markdown
## Last security audit
- Data: 2026-05-03
- Status geral: ATENÇÃO (1) + AGIR (1)
- Próximo agendado: 2026-06-01
- Itens críticos pendentes: nenhum
```

### 5. Não executar nenhuma ação

Skill termina aqui. Aluno revisa, decide o que fazer. Se aluno responder com "rotaciona Stripe agora", a skill **redireciona** pra outra skill apropriada (ou pro próprio agente em modo conversacional) — `seguranca-checklist` não rotaciona.

## Critérios de sucesso

- [ ] 5 verificações rodaram sem erro
- [ ] Report postado no tópico Operação (ou retornado em chat se sob demanda)
- [ ] `last_security_audit` atualizado em `MEMORY.md`
- [ ] Próxima execução agendada (se via cron)
- [ ] Nenhuma ação destrutiva executada

## Erros comuns

- **Permissão negada em `~/.openclaw/.env`**: skill detecta, reporta como "verificação 1: bloqueada por permissão". Não esconde o erro
- **`devices list` retorna vazio**: pode significar "nenhum aprovado" (legítimo dia 1) ou "permissão negada" — distinguir antes de classificar
- **Falha no comando `exec-policy show`**: insight do A10/lshell — agente roda em ambiente diferente do terminal lshell. Se falhar, reportar e sugerir aluno rodar manual no terminal Managed
- **Snapshot date desconhecido**: Hostinger pode não expor essa info via API. Plano B: ler flag `last_manual_snapshot` em `MEMORY.md` (atualizada manualmente pelo aluno depois de cada snapshot)

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../../starter/onboarding-checklist/references/principios-defensivos.md`](../../starter/onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 3 (NUNCA elevação via agente)**: skill É read-only por design. Não roda comando que muda estado. Aluno decide
- **Princípio 4 (narrar antes de executar)**: report explica O QUE foi verificado e POR QUÊ aquele status — não só "agir aqui"
- **Princípio 7 (em dúvida, perguntar)**: se verificação retornar dado ambíguo (ex: device com nome desconhecido), classifica como CRÍTICO e pede aluno confirmar ao invés de assumir
- **Princípio 9 (parar se algo der errado)**: se 2+ verificações falharem por erro técnico, skill pausa e reporta "audit incompleto — N de 5 verificações falharam, investigue antes de continuar"
- **Princípio 11 (detectar antes de pedir)**: lê estado atual de cada item antes de classificar. Não assume nada

## Referências

### Internas
- A10 do roteiro principal: `memory/curso-openclaw/ROTEIRO-MAIN-V2-2026-05-02.md` — fundamentação dos 5 critérios
- Princípios defensivos: `../../starter/onboarding-checklist/references/principios-defensivos.md`
- Cheatsheet `seguranca-do-seu-agente.md` (a criar): tabelas de scope mínimo + bloco anti-injection + 4 botões de recovery
- Skill `backup-workspace-github` (já no kit): operação irmã na categoria operacional

### Externas
- OpenClaw CLI security commands: https://docs.openclaw.ai/cli/security
- OpenClaw devices: https://docs.openclaw.ai/cli/devices
- OpenClaw exec-policy: https://docs.openclaw.ai/cli/approvals (alias)

## Status

🟡 RASCUNHO desde 03/05/2026 — esboçada na sessão de fechamento da A10 do roteiro principal, antes de gravação. Pendências:

1. **Validar comando exato** pra ler última data de snapshot Hostinger (pode não existir API — plano B é flag manual em `MEMORY.md`)
2. **Validar comando exato** pra listar integrações ativas (`auth-profiles.json` é o caminho?)
3. **Decidir release**: v1.0 do kit (junto da A10) ou v1.1 (depois)?
4. **Cheatsheet `seguranca-do-seu-agente.md`** precisa ser criado em paralelo (referenciado pela skill)

## Roadmap

- v0.2: validações reais executadas + ajuste fino dos critérios baseado em primeira rodada com Bruno
- v0.3: integração com cron mensal documentada (template de comando natural)
- v1.0: pronta pra entrar no Starter Kit
- v1.1: detectar agente conectado em canal público sem prompt blindado (cruza com Princípio do Bloco 4 da A10)
- v1.2: detectar SOUL.md sem bloco anti-prompt-injection (cruza com Princípio do Bloco 5 da A10)
- v2: integração com 1Password Service Account quando OpenClaw lançar caminho first-class
