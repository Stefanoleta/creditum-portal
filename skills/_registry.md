# Registry — Skills do Starter Kit (v2.2)

> Índice de todas as skills que vão dentro do Starter Kit.
> Atualizado: 03/05/2026 tarde — Onda 14 unificada (auditoria Princípios 13/14/15 + cron-DM ativo + Princípio 16).

## Categorias

| Categoria | Total | Descrição |
|---|---|---|
| starter | 10 (1 mestre + 7 wizards + 2 skills v2.1) | Jornada obrigatória do aluno novo + post-vitória + log feedback |
| canais | 1 | Skills opcionais pós-vitória (WhatsApp) |
| planejamento | 4 | Curadoria do Superpowers (brainstorming, plans, executing, verification) |
| operacional | 2 | Utilities (backup-workspace-github + cron-resume-wizards NOVA v2.2) |

**Total: 17 skills no v2.2** (era 14 no v1.0; +2 v2.1 + 1 v2.2 = 17).

---

## starter/ (jornada obrigatória)

| Skill | Status | Versão | Função |
|---|---|---|---|
| [`onboarding-checklist`](starter/onboarding-checklist/SKILL.md) | ✅ ATIVO | 1.6 | Mestre — apresenta jornada, dispatcha wizards, gerencia checklist. v1.6: Boas-vindas universal + Cenário B reformulado com 3 opções (1=PRD/2=Wizard review/3=Referência). v1.5: Caminho A detalhado. v1.4: entry point INSTRUCOES. v1.2: Caminho B executa direto. |
| [`wizard-conectar`](starter/wizard-conectar/SKILL.md) | ✅ ATIVO | 2.0 | Configura Search API (Tavily default desde v2.5.5 · Brave como alternativa) + GitHub PAT + Chromium opcional. v2.0: troca default Brave → Tavily (sem cartão obrigatório, 1k/mês free, designed pra agente IA). v1.3: não marca `conectado=true` se algo foi pulado — usa `partial` + flags individuais. |
| [`primeira-vitoria`](starter/primeira-vitoria/SKILL.md) | ✅ ATIVO | 1.5 | v1.5: msg final reescrita com comandos de retomada óbvios (continuar/retomar/config/ajuda) + modo `complete_active` (não tranca). v1.4: NPS Tally + retoma pulos. v1.3: PRE-CHECK + 4 opções FIXAS. |
| [`continuar-jornada`](starter/continuar-jornada/SKILL.md) | ✅ ATIVO | 1.3 | Orchestrator pós-Bloco A — disparada por "continuar"/"próximo passo"/"aula X feito". Consulta `_curso/INDICE.md` (mapa canônico das 31 aulas Hotmart), oferece próxima aula, rastreia progress flag (`aula_X_concluida`). v1.3: renomeação Bloco/B1/C1/etc → Aulas Hotmart + uso de `_curso/` como fonte de material. |
| [`wizard-whisper-quick`](starter/wizard-whisper-quick/SKILL.md) | ✅ ATIVO | 1.8 | Pré-passo opcional — configura OpenAI API pra Whisper. v1.8: pulo agora oferece agendar 24h vs definitivo (em vez de flag silenciosa). |
| [`wizard-agente`](starter/wizard-agente/SKILL.md) | ✅ ATIVO | 1.0 | Passo 1 — entrevista pra criar IDENTITY + SOUL stub + AGENTS |
| [`wizard-aluno`](starter/wizard-aluno/SKILL.md) | ✅ ATIVO | 1.0 | Passo 2 — entrevista pra criar USER.md |
| [`wizard-autonomia`](starter/wizard-autonomia/SKILL.md) | ✅ ATIVO | 1.4 | Passo 3 — guiada-manual pra exec-policy + bifurcação Managed (CLI painel + screenshot) vs ROOT (SSH direto + aviso segurança reforçado). v1.4: copy da pergunta de detecção em linguagem do aluno (1 click vs terminal). |
| [`wizard-workspace`](starter/wizard-workspace/SKILL.md) | ✅ ATIVO | 1.0 | Passo 4 — cria pastas + MAPA raiz + 4 mapas locais (Princípio 12) |
| [`wizard-conectar`](starter/wizard-conectar/SKILL.md) | ✅ ATIVO | 1.0 | Passo 5 — Brave Search + GitHub Token + Chromium opcional |
| [`primeira-vitoria`](starter/primeira-vitoria/SKILL.md) | ✅ ATIVO | 1.0 | Passo 6 — primeiro artefato real salvo + NPS |

Padrão comum dos 7 wizards filhos:

```
1. Detecção (Princípio 11) — lê estado antes de pedir
2. Decide caminho (pulo / parcial / completo)
3. Executa (entrevista, criação, validação)
4. Pergunta-âncora (texto literal em mapa-aulas.md)
5. Marca flag em MEMORY.md
6. Devolve controle pra onboarding-checklist
```

---

## canais/ (opcional pós-vitória)

| Skill | Status | Versão | Função |
|---|---|---|---|
| [`wizard-whatsapp`](canais/wizard-whatsapp/SKILL.md) | ✅ ATIVO | 1.0 | Adiciona WhatsApp como canal extra. 2 modos (sessão própria / chip dedicado). Default: read-only (responde só quando explicitamente acionado). |

---

## operacional/ (utilities)

| Skill | Status | Versão | Função |
|---|---|---|---|
| [`backup-workspace-github`](operacional/backup-workspace-github/SKILL.md) | ✅ ATIVO | 1.0 | Backup diário automático do workspace pro GitHub privado (cron 03:00 BRT). Ativada pelo wizard-conectar. |

---

## planejamento/ (Superpowers curado)

Curadoria de 4 skills do [obra/superpowers](https://github.com/obra/superpowers) pra leigos. Pacote completo (23 skills) é overwhelming pra aluno PME.

| Skill | Status | Versão | Função |
|---|---|---|---|
| [`brainstorming`](planejamento/brainstorming/SKILL.md) | ✅ ATIVO | 1.0 | Aluno explora ideia antes de fazer — 4 etapas (por que / o quê / como / riscos) |
| [`writing-plans`](planejamento/writing-plans/SKILL.md) | ✅ ATIVO | 1.0 | Transforma brainstorming em PLAN.md executável (tarefas atômicas + verificação) |
| [`executing-plans`](planejamento/executing-plans/SKILL.md) | ✅ ATIVO | 1.0 | Executa PLAN.md tarefa a tarefa, atualiza estado, pausa em checkpoints |
| [`verification-before-completion`](planejamento/verification-before-completion/SKILL.md) | ✅ ATIVO | 1.0 | Provar antes de declarar pronto — evidência por critério, sem "vibe check" |

Skills do Superpowers que NÃO entram no v1: `test-driven-development`, `code-reviewer`, `systematic-debugging`, `using-git-worktrees`, `dispatching-parallel-agents`, `subagent-driven-development`, `finishing-a-development-branch`, `requesting-code-review`, `receiving-code-review` — todas específicas de dev, aluno PME não usa.

---

## Estrutura final no kit

```
starter-kit/
├── README.md                      ← descrição + pré-requisitos
├── manifesto.md                   ← versão visível do manifesto
├── FAQ.md                         ← perguntas frequentes (carregado via "faq")
│
├── exemplos/                      ← templates Amora pra opt-in via "exemplo"
│   ├── README.md
│   ├── USER-amora.md
│   ├── IDENTITY-amora.md
│   ├── SOUL-amora.md
│   ├── AGENTS-amora.md
│   └── MAPA-amora.md
│
├── templates/                     ← templates raiz que wizards usam
│   ├── README.md
│   ├── IDENTITY.template.md
│   ├── SOUL-stub.template.md
│   ├── AGENTS.template.md
│   ├── USER.template.md
│   └── MAPA.template.md
│
└── skills/
    ├── _registry.md               ← este arquivo
    │
    ├── starter/                   ← 8 skills (1 mestre + 7 wizards)
    │   ├── _registry.md
    │   ├── onboarding-checklist/
    │   │   ├── SKILL.md
    │   │   ├── references/        ← 12 references (princípios, comandos, etc)
    │   │   └── evals/
    │   ├── wizard-whisper-quick/
    │   ├── wizard-agente/
    │   ├── wizard-aluno/
    │   ├── wizard-autonomia/
    │   ├── wizard-workspace/
    │   ├── wizard-conectar/
    │   └── primeira-vitoria/
    │
    ├── canais/                    ← 1 skill (wizard-whatsapp)
    │   ├── _registry.md
    │   └── wizard-whatsapp/
    │
    ├── planejamento/              ← 4 skills (Superpowers curado)
    │   ├── _registry.md
    │   ├── brainstorming/
    │   ├── writing-plans/
    │   ├── executing-plans/
    │   └── verification-before-completion/
    │
    └── operacional/               ← 1 skill (backup-workspace-github)
        ├── _registry.md
        └── backup-workspace-github/
```

---

## Convenções

- **Owner:** todas as skills do starter têm `owner: aluno` no frontmatter (executadas pelo agente do aluno, não pela Amora)
- **Mode:** todas em `mode: guided` (modo premium narrado, não executor silencioso)
- **Status:** `ATIVO` quando pronta pra produção; `DRAFT` durante construção
- **Versão:** semver simples (1.0, 1.1, 2.0)
- **Frontmatter V3:** name, status, category, owner, version, mode, estimated_time, model_compatible, description (+ source quando vem de externo)

---

## Princípios universais (heredados por TODAS as skills)

Definidos em [`starter/onboarding-checklist/references/principios-defensivos.md`](starter/onboarding-checklist/references/principios-defensivos.md):

1. Nunca sobrescrever sem backup + confirmação
2. Confirmação humana em ações de modificação
3. Comandos de elevação de privilégio NUNCA via agente (manual)
4. Modo guiado: SEMPRE narrar antes de executar
5. Atualização de MEMORY.md ao concluir cada passo
6. Detectar e respeitar customização manual
7. Em dúvida, perguntar
8. Logging de decisões em MEMORY.md
9. Se algo der errado, PARAR
10. Backup global antes de mudanças massivas
11. Detectar antes de pedir (+ .env first pra credenciais + ambiente/OS/package_manager em v2.1)
12. Mapas distribuídos (cada pasta documenta a si mesma)
13. **Wizards são GUARD RAILS** (passo bloqueante, classifica mensagem em 4 tipos, anti-loop 3 desvios) — v2.1
14. **Smoke tests visíveis** (mostra comando + output literal antes de interpretar; nunca finge ter rodado) — v2.1
15. **Mensagens canônicas literais** (trechos `<canonical>` usados literal, não reformula) — v2.1
16. **Entry point literal** (primeira ação ao receber kit é invocar onboarding-checklist; primeira mensagem ao aluno é boas-vindas canonical sem preâmbulo) — v2.2
17. **Formatação Telegram-friendly em mensagens canonical** (parágrafos contínuos, sem hard-breaks artificiais a cada ~70 chars; listas explícitas e code blocks pra comandos) — **v2.2 final NOVO** (caso Adrylan)

---

## Referências

- Estrutura geral do kit: [`../README.md`](../README.md)
- Manifesto: [`../manifesto.md`](../manifesto.md)
- FAQ: [`../FAQ.md`](../FAQ.md)
- Decisões arquiteturais: [`../../DECISOES-ARQUITETURA.md`](../../DECISOES-ARQUITETURA.md)
- Mapa da v2: [`../../MAPA-DA-V2.md`](../../MAPA-DA-V2.md)
- Build do zip: `BUILD.md` (a criar — sugestões na seção final)

---

*Registry v1.7 — Onda 2 + 3 + 9 fixes baseados em testes reais (02/05/2026).*

> Histórico completo no [CHANGELOG.md](../CHANGELOG.md) na raiz do kit.

## Changelog (resumido)

- **v1.7** (02/05/2026 madrugada cont. 4): wizard-whisper-quick v1.2→v1.7 com P11 imperativo no topo + menção de memória semântica + wording assume aluno antigo pode ter chave. INSTRUCOES-PARA-AGENTE.md ganha seção "wizards filhos TAMBÉM não improvisam". Trigger: Lia perguntou "quer Whisper?" sem detectar chave já existente.
- **v1.6** (02/05/2026 madrugada cont. 3): Boas-vindas universal antes de detecção + Cenário B reformulado com 3 opções 1/2/3 (PRD/Wizard review/Referência). Caminho A "skills agnósticas" removido como opção separada — vira caso especial do PRD.
- **v1.5** (02/05/2026 madrugada continuação 2):
  - **Caminho A do Cenário B detalhado** com 3 melhorias: (1) disclaimer explícito "⚠️ O que você PERDE escolhendo A: a experiência guiada do kit"; (2) lista EXATA do que copia (só `skills/planejamento/`) e do que NÃO copia (starter/, canais/, operacional/, templates/, exemplos/) — transparência total; (3) instrução de reativação futura: "se um dia quiser a experiência, manda 'roda onboarding' que eu copio starter-kit/skills/starter/ pro workspace ativo".
  - **Descrição do Caminho B sincronizada** com fix v1.2 (era "te passo prompt pra colar no SEU agente" — corrigido pra "eu mesma conduzo, você tá no MESMO agente").
  - **Trigger:** screenshot Bruno mostrando agente da Lia apresentando os 3 caminhos da v1.4. Bruno apontou que A precisa de disclaimer + transparência sobre o que copia + caminho de reativação. Aplicado.
- **v1.4** (02/05/2026 madrugada continuação):
  - **`INSTRUCOES-PARA-AGENTE.md`** criado na raiz do starter-kit. Entry point explícito pro agente que recebe o kit — diz pra ler `skills/starter/onboarding-checklist/SKILL.md` e seguir à risca, NÃO improvisar fluxo de instalação. Lista o que NÃO fazer (copiar skills sem autorização, criar arquivos raiz, inventar opções pós-vitória).
  - **README.md** atualizado com aviso destacado no topo apontando pra INSTRUCOES-PARA-AGENTE.md.
  - **manifesto.md** atualizado com nota pro agente.
  - **`onboarding-checklist` v1.4** — referência cruzada pra INSTRUCOES-PARA-AGENTE.md no topo.
  - **Causa-raiz NOVA identificada:** os fixes anteriores (v1.1, v1.2, v1.3) tratavam falhas individuais. Sessão Lia/Mira mostrou que TODAS as falhas vinham da mesma raiz: agente NÃO invocava a skill mestre, improvisava fluxo. Solução: entry point explícito ao invés de assumir que agente vai descobrir sozinho.
  - **Trigger:** screenshot Bruno mostrando agente da Lia fazendo "instalei skills + perguntou se quer iniciar jornada" — improvisando todo o fluxo. Em vez de fixar mais um caso isolado, atacar a causa-raiz (entry point ausente).
- **v1.3** (02/05/2026 madrugada):
  - **`primeira-vitoria` v1.3** — 3 guardas críticas: (1) PRE-CHECK obrigatório de TODAS as flags antes de pós-vitória (se algo crítico ficou pendente como `backup_active: postponed`, volta pra completar — não trata como opcional); (2) 4 opções pós-vitória FIXAS (arquivar/WhatsApp/planejamento/fechar) + instrução imperativa anti-improvisação (NÃO criar opções customizadas baseadas em contexto do aluno); (3) SAI do modo wizard após pós-vitória escolhida — "bora" não reabre, só comando explícito ("reativa jornada"). `onboarding_mode: closed` flag adicionada.
  - **`wizard-conectar` v1.3** — NÃO marca `conectado=true` se algo foi pulado/postponed. Usa `conectado: partial` + flags individuais (brave_search_active, github_token_active, backup_active, chromium_active). Aviso CRÍTICO no fim do passo 5: "não falsifique sucesso". primeira-vitoria checa essas flags antes de pós-vitória.
  - **FAQ item 6** — OAuth Claude/Gemini removido (não existem no OpenClaw Managed — só GPT tem OAuth). Substituído por Claude API direta (`ANTHROPIC_API_KEY`) + Gemini API direta (`GOOGLE_API_KEY`).
  - **Trigger:** sessão real Lia/Mira (02/05 21h59-00h22) onde wizard virou loop infinito + passo 5 marcado ✓ sem completar + pós-vitória improvisada com contexto custom.
- **v1.2** (02/05/2026 noite tardia):
  - `onboarding-checklist` Cenário B Caminho B reescrito: agente EXECUTA o upgrade diretamente em vez de entregar prompt como texto pro aluno copiar. Falha real observada (sessão da Mira): agente leu o prompt-upgrade, entregou como texto, aluno ficou perdido sem saber o que fazer com ele. Causa-raiz: design assumia 2 agentes (kit + agente do aluno), mas é 1 só — o agente que recebeu o kit É o agente do aluno.
  - `prompt-upgrade-para-aluno-antigo.md` reescrito como instrução interna (não texto pro aluno) com aviso explícito no topo.
  - `wizard-whisper-quick` wording reescrito: "Você quer ajuda pra pegar essa chave, ou já tem ela fácil aí? Se já tem, só me manda aqui que eu salvo no lugar certo." em vez de "tem ou pula" binário. Convidativo > seco.
- **v1.1** (02/05/2026 noite): `onboarding-checklist` Cenário B reescrito com 3 caminhos formais (A: skills agnósticas / B: prompt upgrade / C: só arquivos) + instrução imperativa pro agente NÃO improvisar opções. Fix baseado em falha real observada (agente da Lia improvisou A/B/C próprio em vez de seguir o design canônico).
- **v1.0** (02/05/2026): release inicial. 14 skills (8 starter + 4 planejamento + 1 canal + 1 operacional) + 5 templates + FAQ + exemplos sanitizados.
