# Template Visual da Checklist

> Texto literal que a `onboarding-checklist` renderiza no Telegram.
> Variáveis com `{nome}` são substituídas dinamicamente.

---

## Modo A v2 — Template de checklist por aulas (NOVO em kit v2.3)

⚠️ **REESCRITO em v2.3:** Modo A agora espelha aulas do mini-curso 1:1 (A0-A6) em vez de "passos do kit". Cada aula tem submenu próprio (ver `references/aula-menus.md`).

### Template renderizado quando aluno escolhe Modo A

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
- 'vou assistir A{X}' → me avisa que tá saindo, eu espero
- 'travei na A{X}' → ajuda durante o vídeo

📞 Travou em geral? Manda 'ajuda' (menu completo) ou @Openclawzinho no grupo.

Bora pela A0?
```

### Substituições condicionais por ambiente (kit v2.3)

**Se `ambiente: managed` E `managed_has_openai_envvar: true`** (Fase Pré-Zero detectou):

Linha A0 vira:
```
[✓] 🎬 A0 — Visão geral (~12min vídeo) · áudio já tá funcionando (chave OpenAI vem do Managed)
```

A0 some como "passo de configuração" — Whisper já tá pronto. Aluno assiste o vídeo se quiser, mas sem fricção mental de "o que tem que configurar nesse passo?".

**Se `aula_A1_assistida=true` setada antes** (aluno já tinha visto antes do kit chegar):

Linha A1 vira:
```
[✓] 🎬 A1 — Primeiro login Managed · pré-req consolidado
```

### Renderização durante a jornada (após cada aula)

```
=== Curso OpenClaw — Bloco A ===

[✓] 🎬 A0 — Visão geral · áudio funcionando
[✓] 🎬 A1 — Primeiro login Managed · pré-req
[✓] 🎬 A2 — Identidade mínima · agente + USER configurados
[ ] 🎬 A3 — Telegram bot ← agora (pré-req, manda 'vi A3' pra marcar)
[ ] 🎬 A4 — Desbloqueio + superpoderes
[ ] 🎬 A5 — Primeira vitória
[ ] 🎬 A6 — Debug primeiros socorros

Bora pela A3?
```

---

## Template inicial (primeira vez que aluno vê) — DEPRECATED em v2.3 pra Modo A

⚠️ **Histórico:** este era o template original do Modo A em kits v1.x → v2.2. Substituído pela checklist por aulas (acima) em v2.3. Mantido aqui como referência histórica e como fallback se algum agente legado precisar (não usar em fluxos novos).

```
=== Sua jornada — total estimado: ~37min ===

*Antes da gente começar (5min, opcional)*

[ ] 0. Chave OpenAI API (pra Whisper transcrever áudios)   👤 5min
       — manda "pulo" pra deixar pra depois

*Comece sua jornada por aqui*

🎭 [ ] 1. Vamos configurar a personalidade do seu agente   🤖 4min
🎭 [ ] 2. Vamos configurar a sua personalidade             🤖 3min
⚙️ [ ] 3. Vamos liberar autonomia pra ele trabalhar        👤 6min
⚙️ [ ] 4. Vamos mostrar onde tudo vive                     🤖 4min
⚙️ [ ] 5. Vamos conectar mais superpoderes                 👤 12min
🚀 [ ] 6. Vamos rodar sua primeira vitória                 🤖 5min

📞 Travou?
   → Resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
   → Ajuda humana: galera do mini-curso tá nos outros tópicos
   Grupo: https://t.me/cursoopenclaw
✉️  Feedback estruturado pro Bruno: bruno@microsaas.com.br
🧭 Quer entender mais? Manda "sobre"

Bora começar pelo passo 0? (Manda "começar" pra ir, ou "pulo" pra
ir direto pro passo 1.)
```

---

## Template em progresso (após cada passo concluído)

```
=== Sua jornada ===

[x] 0. Chave OpenAI API (pra Whisper)                      ✓ feito
🎭 [x] 1. Vamos configurar a personalidade do seu agente   ✓ feito
🎭 [x] 2. Vamos configurar a sua personalidade             ✓ feito
⚙️ [→] 3. Vamos liberar autonomia                          pulado — "volta no 3" pra fazer
⚙️ [ ] 4. Vamos mostrar onde tudo vive                     ← agora 🤖 4min
⚙️ [ ] 5. Vamos conectar mais superpoderes                 👤 12min
🚀 [ ] 6. Vamos rodar sua primeira vitória                 🤖 5min

Bora pro passo 4?
```

---

## Template ao reativar (aluno volta após pausa)

```
Bem-vindo de volta, {nome_aluno}. Você parou no passo {N}.

=== Status atual ===

[x] 0. Chave OpenAI API (pra Whisper)                      ✓
🎭 [x] 1. Vamos configurar a personalidade do seu agente   ✓
🎭 [x] 2. Vamos configurar a sua personalidade             ✓
⚙️ [⏸️] 3. Vamos liberar autonomia                          ← parou aqui
⚙️ [ ] 4. Vamos mostrar onde tudo vive
⚙️ [ ] 5. Vamos conectar mais superpoderes
🚀 [ ] 6. Vamos rodar sua primeira vitória

Continuar do passo {N} ou prefere recapitular o que já fizemos?
```

---

## Template ao concluir jornada

```
=== Sua jornada — COMPLETA ===

[x] 0. Chave OpenAI API                                    ✓
🎭 [x] 1. Personalidade do seu agente                       ✓
🎭 [x] 2. Sua personalidade                                ✓
⚙️ [x] 3. Autonomia liberada                               ✓
⚙️ [x] 4. Workspace organizado                             ✓
⚙️ [x] 5. Superpoderes conectados                          ✓
🚀 [x] 6. Primeira vitória entregue                        ✓

🎉 Você terminou a jornada de configuração.

Seu agente tá pronto pra trabalhar. Manda áudio, manda texto, peça
pesquisa, peça resumo, peça plano. Tô aqui.

*Próximos passos opcionais (qualquer hora):*
- "ativa whatsapp" → adicionar canal extra
- "instala perplexity" → deep research
- "instala apify" → puxar dados de redes sociais
- "1password" → migrar .env pro cofre

Manda "ajuda" se quiser ver tudo que sei fazer.
```

---

## Símbolos da checklist

| Símbolo | Significado |
|---|---|
| `[ ]` | Pendente |
| `[x]` | Concluído com sucesso |
| `[→]` | Pulado pelo aluno (com "pulo") |
| `[⏸️]` | Pausado no meio (aluno cancelou aqui) |
| `[!]` | Erro durante execução (raro) |
| `🤖` | Eu (agente) executo a maior parte |
| `👤` | Você executa parte (cola comando, autoriza, etc) |
| `🎭` | Bloco identidade |
| `⚙️` | Bloco configuração técnica |
| `🚀` | Bloco vitória |

---

## Regras de renderização

- **Sempre mostrar checklist completa**, não só o passo atual. Aluno precisa ver progresso global.
- **Manter ETA total visível** na primeira renderização (depois pode omitir se ficar repetitivo)
- **Rodapé fixo** com 3 linhas (grupo + feedback + sobre) só na primeira vez. Depois aparece a cada 2-3 mensagens (não em todas — polui).
- **Emoji do passo atual com seta** (`← agora`) ajuda foco visual
- **Nunca usar tabela formatada** — Telegram não renderiza bem em mobile. Lista vertical é mais legível.

---

## Variáveis substituíveis

| Variável | Valor | Fonte |
|---|---|---|
| `{nome_aluno}` | Nome do aluno | `USER.md` (depois do passo 2) |
| `{N}` | Número do passo atual | `MEMORY.md` (`onboarding_current_step`) |
| `{eta_total}` | "~37min" | Calculado dos passos restantes |
| `{passo_atual_nome}` | Ex: "Vamos configurar a personalidade do seu agente" | Config interna |

Se variável não tem valor (ex: `{nome_aluno}` antes do passo 2), omitir graciosamente — não escrever "Bem-vindo de volta, {nome_aluno}" literal.

---

## Modo B — Wizard direto (checklist OCULTA)

Quando aluno escolheu modo B (wizard direto), os templates acima NÃO são renderizados durante a jornada.

### O que aluno vê no modo B

Em vez de checklist visual, aluno vê **conversa fluida** conduzida pelo agente. Sem números de passo, sem "[ ] X", sem ETA na cara. O agente conduz como tutor:

```
"Beleza, modo wizard direto.

Bora começar.

Primeiro, me conta um pouco sobre você: quem é, com o que trabalha,
um pouco da família, hobbies que importam, o que rouba teu tempo hoje.
Não precisa escrever tese — me fala como falaria pra um amigo novo
que quer te conhecer.

Pode mandar áudio, se preferir."
```

[aluno responde]

```
"Beleza, anotei: [resume o que captou].

Agora, quem você quer que eu seja?

Vou te mostrar um exemplo concreto: a Amora, Chief of Staff do Bruno...

Você não precisa copiar a Amora. Mas serve de referência. Me conta:
- Que nome você quer me dar?
- Que tom você quer que eu fale com você?
..."
```

E assim por diante. **Internamente**, o agente passa pelos mesmos wizards (wizard-aluno, wizard-agente, etc), mas **sem mostrar a estrutura modular** ao aluno.

### Quando aparece checklist no modo B

**Só no resumo final**, depois da primeira vitória:

```
Pronto, terminamos de configurar tudo. Olha o que a gente construiu juntos:

[x] Sua identidade salva em USER.md
[x] Minha identidade configurada (sou {nome_agente})
[x] Autonomia liberada — posso trabalhar sem te interromper a cada passo
[x] Workspace organizado com mapas distribuídos
[x] {N} integrações conectadas (Brave Search, OpenAI, GitHub)
[x] Primeira vitória entregue: arquivo salvo em {path}

🎉 Você terminou a jornada de configuração.

[continua com NPS + arquivamento + próximos passos opcionais]
```

Aluno vê pela primeira vez que estava passando por uma jornada estruturada — só agora, no fim. Cria efeito de "uau, eu fiz tudo isso?".

### Trocando entre modos no meio

Se aluno mandou "muda modo" durante a jornada, o agente:

- Salva nova preferência em `MEMORY.md`
- Re-renderiza próxima mensagem no novo modo:
  - **A → B:** esconde checklist, vira tutor conversacional
  - **B → A:** mostra checklist completa atualizada com o que já foi feito

Aluno mantém progresso ao trocar de modo. Não perde nada.
