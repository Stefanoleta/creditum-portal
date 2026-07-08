# Mapa de Aulas → Submenus (Modo A v2 — kit v2.3)

> Referência canonical de cada aula do Bloco A com seu submenu de configuração no agente.
>
> Modo A v2 (NOVO em kit v2.3): jornada espelha aulas 1:1, não passos do kit. Aluno seleciona aula via `abre A{X}`, agente abre submenu específico daquela aula.
>
> **Princípio guia:** uma aula no vídeo = uma "unidade" mental no agente. Aluno nunca confunde "passo do kit" vs "aula do curso" — é o mesmo número.

---

## Visão geral do Bloco A (entrada)

| Aula | Vídeo (~min) | Configuração no agente (~min) | Tipo |
|---|---|---|---|
| A0 — Visão geral | 12min | 3min smoke test | Conceito + aplicação leve |
| A1 — Primeiro login Managed | 8min | — | **Pré-req** (já feito antes do kit) |
| A2 — Identidade mínima | 14min | 7min config | Aplicação (2 módulos) |
| A3 — Telegram bot básico | 6min | — | **Pré-req** (já feito antes do kit) |
| A4 — Desbloqueio + superpoderes | 11min | 22min config | Aplicação (3 módulos) |
| A5 — Primeira vitória | 9min | 5min config | Aplicação (1 módulo) |
| A6 — Debug primeiros socorros | 7min | — | **Referência** permanente (sem config dedicada) |

---

## Submenus de cada aula

### A0 — Visão geral

**Vídeo cobre:** O que é OpenClaw Managed, modelos disponíveis (GPT/Claude/Gemini), créditos OpenAI, como o curso funciona.

**Submenu (`abre A0`):**

```
=== A0 — Visão geral ===

Você acabou de assistir a aula. Aplicação prática agora:

→ smoke test áudio (Whisper) — 3min
  Manda um áudio curto pra eu transcrever e confirmar que tá funcionando.

[se ambiente: managed → ✓ Sua chave OpenAI veio do setup Managed (você forneceu na instalação 1-click). Whisper já tá pronto. Só falta o áudio teste.]

[se ambiente: vps-root → entrevistar chave OpenAI normalmente]
```

**Despacha:** `wizard-whisper-quick` (com fast-path Managed v1.10).

**Marca em MEMORY:** `whisper_configured=true`, `aula_A0_assistida=true`.

---

### A1 — Primeiro login Managed (PRÉ-REQ)

**Vídeo cobre:** Como entrar no painel Hostinger, vincular bot Telegram, primeiro contato com agente.

**Submenu (`vi A1` ou `abre A1`):**

```
=== A1 — Primeiro login Managed ===

Aula consolidatória — você JÁ FEZ isso antes de baixar o kit (caso contrário não estaria conversando comigo agora). Aula consolida o que já tá rodando.

Sem configuração nova. ✓ Marcado como visto.

Pergunta-âncora pra fixar (opcional):
"Em qual painel você entra pra ver/parar/reiniciar este agente quando precisar?"

Resposta esperada: "Hostinger, no menu OpenClaw."

Próxima: A2 (Identidade mínima — começamos a configurar de verdade).
```

**Despacha:** nada (pré-req).

**Marca em MEMORY:** `aula_A1_assistida=true`.

---

### A2 — Identidade mínima

**Vídeo cobre:** Por que agente precisa de personalidade definida, como SOUL/IDENTITY/AGENTS funcionam, como USER.md te representa.

**Submenu (`abre A2`):**

```
=== A2 — Identidade mínima ===

Aula cobre 2 coisas no kit. Total de configuração: ~7min.

Como prefere?

(a) Os 2 em sequência (~7min total)
(b) Um por vez. Qual?
    1. Personalidade do agente (4min) — IDENTITY + SOUL stub + AGENTS
    2. Sua personalidade (3min) — USER.md
```

**Despacha:** `wizard-agente` e/ou `wizard-aluno` (conforme escolha).

**Marca em MEMORY:** `agente_configured=true`, `aluno_configured=true`, `aula_A2_assistida=true`.

---

### A3 — Telegram bot básico (PRÉ-REQ)

**Vídeo cobre:** Como criar bot Telegram via @BotFather, vincular ao OpenClaw, primeiro `/start`.

**Submenu (`vi A3` ou `abre A3`):**

```
=== A3 — Telegram bot básico ===

Aula consolidatória — bot já tá ativo (você tá conversando comigo via Telegram agora).

Sem configuração nova. ✓ Marcado como visto.

Pergunta-âncora opcional: "Se o token do bot vazar, o que você faz?"
Resposta esperada: "regenero no @BotFather e atualizo no OpenClaw."

Próxima: A4 (Desbloqueio + superpoderes).
```

**Despacha:** nada (pré-req).

**Marca em MEMORY:** `aula_A3_assistida=true`.

---

### A4 — Desbloqueio + superpoderes

**Vídeo cobre:** Por que agente precisa de autonomia (yolo), o que é workspace + MAPA, integrações externas (Brave + GitHub).

**Submenu (`abre A4`):**

```
=== A4 — Desbloqueio + superpoderes ===

Aula cobre 3 coisas. Total de configuração: ~22min — bloco mais longo do kit.

Como prefere?

(a) As 3 em sequência (autonomia → workspace → superpoderes externos)
(b) Uma por vez. Qual?
    1. Autonomia (yolo) — 6min — você cola 1 comando no terminal Hostinger
    2. Workspace + MAPA — 4min — eu crio pastas e mapas distribuídos
    3. Superpoderes externos (Brave + GitHub) — 12min — você cria 2 chaves, eu valido
(c) Pausar e voltar depois (manda 'cancela')
```

**Despacha:** `wizard-autonomia`, `wizard-workspace`, `wizard-conectar` (conforme escolha).

**Marca em MEMORY:** `autonomia_liberada`, `workspace_organizado`, `conectado` (conforme), `aula_A4_assistida=true`.

---

### A5 — Primeira vitória pelo Telegram

**Vídeo cobre:** Como agente entrega trabalho, primeiro artefato real, fluxo de "delegar e revisar".

**Submenu (`abre A5`):**

```
=== A5 — Primeira vitória ===

Aula cobre 1 coisa: gerar primeiro artefato. ~5min de configuração.

Pra começar, me conta o tema. Algo que você precisaria fazer hoje (post, email, ideia, decisão pra registrar).
```

**Despacha:** `primeira-vitoria` (com auto-arquivamento v1.7 no fim).

**Marca em MEMORY:** `first_win_completed=true`, `onboarding_complete=true`, `aula_A5_assistida=true`.

---

### A6 — Debug primeiros socorros (REFERÊNCIA)

**Vídeo cobre:** Categorias comuns de erro (chave inválida, comando não encontrado, agente não responde), como classificar, onde pedir ajuda.

**Submenu (`vi A6` ou `abre A6`):**

```
=== A6 — Debug primeiros socorros ===

Aula vira referência permanente — você nunca "configura A6", você consulta quando travar.

Sem configuração. ✓ Marcado como visto.

Próxima vez que travar, manda:
- 'travei' — eu te oriento na hora
- 'ajuda' — menu completo de comandos
- @Openclawzinho no grupo — bot IA 24/7

Onde tem o vídeo: link na área de membros do mini-curso.
```

**Despacha:** nada (referência).

**Marca em MEMORY:** `aula_A6_assistida=true`.

---

## Comandos canonical novos (Modo A v2)

Adicionados em `comandos-canonicos.md` na v1.9 da onboarding-checklist:

### `abre A{X}` (X ∈ {0,1,2,3,4,5,6})

Abre o submenu da aula X conforme tabela acima. Aluno escolhe:

- Aulas com aplicação (A0, A2, A4, A5): submenu lista módulos. Aluno faz tudo de uma vez OU um por vez OU pausa
- Aulas pré-req (A1, A3): submenu confirma que é pré-req, oferece pergunta-âncora opcional
- Aula A6: submenu explica que é referência

Sinônimos: `aula A{X}`, `começar A{X}`, `vamos pela A{X}`.

### `vi A{X}` ou `assisti A{X}`

Marca aula como vista em MEMORY (`aula_A{X}_assistida=true`). Útil pra aulas pré-req ou A6 — aluno marca sem precisar abrir submenu.

Sinônimos: `terminei A{X}`, `A{X} feita`, `A{X} ok`, `concluí A{X}`.

### `vou assistir A{X}` (auto-pause)

Aluno avisa que tá saindo pro Hotmart pra ver vídeo. Agente registra `assistindo_aula: A{X}` em MEMORY e responde:

```
Tô aqui esperando. Quando voltar, manda 'assisti A{X}' (ou 'A{X} ok')
pra eu disparar o submenu da aula. Se travar na aula, manda 'travei
na A{X}' que eu ajudo.
```

Sensação de "agente espera junto" em vez de "agente sumiu".

### `travei na A{X}`

Aluno tá com dificuldade durante o vídeo (não conseguiu fazer algo, pergunta conceitual). Agente entra em modo "ajuda contextualizada":

```
Em qual ponto da aula? Manda timestamp aproximado ou descreve o que
travou. Posso:
- Explicar o conceito de novo (texto)
- Apontar pro tópico relevante na FAQ
- Te jogar pro grupo (@Openclawzinho 24/7)
```

NÃO despacha submenu — aluno só volta pro fluxo quando terminou aula.

---

## Renderização da checklist Modo A v2 (template novo)

Substitui o template antigo de "passos" por checklist de aulas:

```
=== Curso OpenClaw — Bloco A (Entrada) ===

Cada aula tem vídeo + menu de configuração próprio dentro do agente.
Você assiste no Hotmart, volta aqui, abre o menu daquela aula.

[ ] 🎬 A0 — Visão geral (~12min vídeo + 3min config)
[ ] 🎬 A1 — Primeiro login Managed (~8min vídeo · pré-req, sem config)
[ ] 🎬 A2 — Identidade mínima (~14min vídeo + 7min config — 2 módulos)
[ ] 🎬 A3 — Telegram bot (~6min vídeo · pré-req, sem config)
[ ] 🎬 A4 — Desbloqueio + superpoderes (~11min vídeo + 22min config — 3 módulos)
[ ] 🎬 A5 — Primeira vitória (~9min vídeo + 5min config)
[ ] 🎬 A6 — Debug primeiros socorros (~7min vídeo · referência permanente)

Comandos:
- 'abre A{X}' → submenu da aula X (config no agente)
- 'vi A{X}' → marcar aula como assistida (rápido pra pré-req)
- 'vou assistir A{X}' → me avisa que tá saindo pro Hotmart, eu espero
- 'travei na A{X}' → ajuda durante o vídeo

📞 Travou em geral? Manda 'ajuda' (menu completo) ou @Openclawzinho no grupo.

Bora pela A0?
```

Substituições por ambiente:
- Se `ambiente: managed` E A0 já tem chave: linha A0 vira "✓ A0 — chave OpenAI já vem do Managed (smoke test áudio quando você quiser)" — passo INVISÍVEL como módulo separado
- Se `aula_A1_assistida=true` ANTES da checklist (quando aluno é antigo Managed): linha A1 vira "✓ A1 — pré-req já consolidado"

---

## Modo B continua igual

Modo B (wizard direto) NÃO usa essa estrutura por aulas. Aluno escolheu pular vídeos — kit conduz como tutor conversacional sem mencionar aulas. Igual ao desenho v2.2.

Diferença visível só no Modo A. Por baixo, mesmas skills filhas (mesmos wizards, mesmas references).

---

## Falhas que essa estrutura PREVINE

1. **Confusão "passo X" vs "aula Y"** (Modo A v1) — agora é o mesmo número
2. **Aulas pré-req sem espaço próprio** — A1 e A3 ganham submenu de "consolidar visto" em vez de "passa direto sem-graça"
3. **Aulas multi-módulo viram parede de config** — A4 (3 módulos / 22min) agora oferece "um por vez ou tudo de uma vez"
4. **Aluno fica esperando enquanto vê vídeo sem feedback** — comando `vou assistir A{X}` registra estado, agente "espera junto"
5. **Aluno trava no vídeo sem saber pedir ajuda contextual** — `travei na A{X}` é canonical

---

*Criado em kit v2.3 (03/05/2026 noite). Substitui parcialmente `mapa-aulas.md` (que continua como referência de pergunta-âncora por passo). Os 2 arquivos coexistem — `mapa-aulas.md` é "pergunta de fixação por passo", `aula-menus.md` é "submenu de configuração por aula".*
