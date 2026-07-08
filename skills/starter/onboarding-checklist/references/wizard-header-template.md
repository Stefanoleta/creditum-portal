# Template de Header Universal pros Wizards (v2.2)

> Este arquivo é referência. **Não é código executável.** Cada wizard filho do starter-kit copia o bloco abaixo no topo da própria SKILL.md (após o frontmatter, antes da seção `## Promessa`).
>
> Adicionado em **kit v2.2** depois de auditoria das Ondas 11–13 que revelou: princípios 13/14/15 viviam só em `principios-defensivos.md`, mas wizards filhos não os citavam explícitamente. Agente que despacha skill filha pode não ler o arquivo de princípios — header explícito força ele a ver no topo do próprio wizard.
>
> **v2.2 final (Adrylan):** template menciona P17 (formatação Telegram-friendly) — TODAS as mensagens canonical pro aluno usam parágrafos contínuos (sem hard-breaks artificiais a cada ~70 chars). Princípio adicionado após screenshot do tester Adrylan mostrando boas-vindas cortada no Telegram desktop.

---

## Bloco padrão pra colar no topo de cada wizard filho

```markdown
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
> **P15 — Mensagens `<canonical>` literais.** Trechos marcados `<canonical>...</canonical>` (ou bloco com prefixo `# CANONICAL`) usam LITERAL. Não reformula, não "melhora", não substitui exemplos. Ajustar TOM (formal/casual via SOUL.md) é OK; estrutura/ordem/keywords técnicas preservadas.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo, separados por linha em branco). NÃO quebrar manualmente a cada ~70 chars — Telegram faz word-wrap natural. Listas com `-`/`•`/numéricas e code blocks pra comandos preservam quebras intencionais.
>
> Detalhes completos: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).
```

---

## Quando adaptar o template

**Caso A — wizard virgem dos princípios novos:**
Cola o bloco como está, logo após o frontmatter. (Aplicado em: wizard-agente, wizard-aluno, wizard-workspace, continuar-jornada, gera-log-jornada na v2.2.)

**Caso B — wizard já tem aviso específico próprio (URLs completos, bifurcação de ambiente, etc):**
Cola o bloco do template ANTES do bloco específico. Os 2 convivem — template é meta-geral, bloco específico é particular do wizard. (Aplicado em: wizard-autonomia, wizard-whisper-quick, primeira-vitoria na v2.2.)

**Caso C — wizard já tem header expandido com 13/14/15 explícitos (raro):**
Pular. Wizard-conectar v1.4 já cobre todos com detalhes — não duplicar. Aplicar template aqui só geraria ruído.

## Por que header curto + apontar pro canônico

- Cada SKILL.md já é grande (300–650 linhas). Headers de 50 linhas matam densidade
- Princípios canônicos vivem em UM lugar (`principios-defensivos.md`) — header só lembra agente da existência e dá o resumo de 1 linha
- Quando princípio mudar (v2.3, v3.0), atualizar 1 arquivo central + (opcionalmente) bumpar versões dos wizards mencionando o novo princípio. Sem header copiado em 8 wizards pra atualizar
