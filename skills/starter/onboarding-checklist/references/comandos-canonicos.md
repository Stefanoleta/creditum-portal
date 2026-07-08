# Comandos Canônicos da Checklist

> 14 comandos que o aluno pode mandar em qualquer momento da jornada.
> A `onboarding-checklist` deve reconhecer estes patterns mesmo com variações de fraseado.

---

## Regra geral de matching (kit v2.4)

⚠️ **Patterns são regex case-insensitive com flexões.** Aluno escreve casualmente — pode usar gerundivos, plurais, conjugações verbais. Agente precisa cobrir variações naturais sem forçar aluno a memorizar a forma exata.

**Princípios:**

1. **Case-insensitive sempre:** `Continuar`, `CONTINUAR`, `continuar` são equivalentes.
2. **Flexões verbais comuns:**
   - Infinitivo: `retomar`, `voltar`, `continuar`
   - 1ª pessoa singular: `retomei`, `voltei`, `continuei`
   - 1ª pessoa plural: `retomamos`, `voltamos`, `continuamos`, `vamos retomar`, `bora continuar`
   - Imperativo: `retoma`, `volta`, `continua`
3. **Plurais e variações curtas:** `comandos` ≡ `comando`; `aulas` ≡ `aula`.
4. **Acentuação tolerante:** `volta` ≡ `vólta`; `aula` ≡ `aulá` (typos comuns no celular).

**Falha real corrigida (kit v2.4 — stress test Pedro):** aluno mandou `"eae, retomamos?"` após pausa — `retomamos` é gerundivo plural de `retomar`, não casava com pattern `retomar` literal. Fix: regex `\b(retomar|retomamos|retomei|retoma|retomo)\b` cobre flexões.

**Implementação sugerida:** quando o agente comparar mensagem com pattern, normalizar (lowercase + strip diacritics opcional) e usar regex com `\b` (word boundary) + flexões. Não precisa cobrir TODAS as conjugações possíveis — só as comuns (infinitivo, 1ª pess sing/plur, imperativo).

---

## 1. Voltar / Refazer

**Função:** re-disparar wizard de um passo já completado.

### Patterns reconhecidos

- "volta no [N]"
- "voltar pro passo [N]"
- "refazer [tema]"  (ex: "refazer identidade")
- "muda [campo]"  (ex: "muda meu nome", "muda o tom")
- "quero ajustar [coisa]"

### Comportamento

1. Identificar qual passo o aluno quer voltar (pelo número OU pelo tema)
2. Antes de re-executar, perguntar:

   > "Quer editar trecho específico ou refazer do passo do zero?
   >
   > **a) Editar** — eu mostro o que tem hoje, você diz o que mudar, mexo só nisso
   > **b) Refazer** — apago o que tinha, faço backup, e a gente conversa de novo desde o começo"

3. Conforme resposta:
   - **(a)**: passa contexto pro wizard em modo "edição parcial" — preserva tudo que aluno não pediu pra mudar
   - **(b)**: backup timestamped do estado atual em `~/backups/pre-redo-{passo}-{timestamp}/` + re-executa wizard inteiro

### Casos de borda

- Aluno pediu pra voltar num passo que NUNCA foi feito → "Esse passo ainda não rolou. Quer fazer ele agora?"
- Aluno pediu "volta" sem especificar → "Voltar pro qual? Você fez até o passo {N}. Manda 'volta no 2', 'volta no 4', etc."

---

## 2. Pular

**Função:** marcar passo como pulado e avançar pro próximo.

### Patterns reconhecidos

- "pulo"
- "pula esse"
- "deixa pra depois"
- "próximo"
- "skip"
- "não vou fazer agora"

### Comportamento

1. Marcar passo atual como `skipped` em `MEMORY.md` (não `done`)
2. Renderizar checklist com `[→]` no lugar de `[x]`
3. **Antes de avançar**, checar dependências (`references/dependencias.md`)
4. Se próximo passo TEM dependência do que foi pulado:

   > "Antes de seguir, aviso: o passo {próximo} depende do passo {pulado}.
   >
   > Sem ele, o {próximo} vai funcionar com fricção (ex: vou pedir aprovação a cada coisa que faço).
   >
   > Quer:
   > **a)** Voltar e fazer o {pulado} agora (~{tempo}min)
   > **b)** Seguir mesmo assim e aceitar a fricção"

5. Se próximo passo NÃO tem dependência: avançar direto sem aviso

### Casos de borda

- Aluno pediu "pulo" no passo 0 (Whisper opcional) → seguir sem aviso (passo 0 é opcional por design)
- Aluno pediu "pulo" e já tá no último passo → "Esse é o último. Quer cancelar a jornada inteira?"

---

## 3. Cancelar

**Função:** pausar a checklist (não encerrar permanente).

### Patterns reconhecidos

- "cancelar"
- "cancela"
- "deixa quieto"
- "fecha o tour"
- "para por aqui"
- "depois eu volto"
- "sai disso"

### Comportamento

1. Salvar `onboarding_paused_at_step={N}` em `MEMORY.md`
2. Mensagem de despedida:

   > "Beleza, parei aqui. Você fez até o passo {N}.
   >
   > Se quiser voltar, manda 'reativa jornada' que eu retomo do ponto.
   >
   > Se quiser apagar de vez, manda 'nunca mais'."

3. NÃO marcar `onboarding_dismissed=true` (a não ser que aluno mande "nunca mais")

### Casos de borda

- Aluno mandou "nunca mais" depois → marcar `onboarding_dismissed=true`. Próxima interação não dispara checklist.
- Aluno cancelou no passo 0 ou 1 → vale anotar `onboarding_cancelled_early=true` (sinal de friction, pra Bruno olhar)

---

## 4. Reativar

**Função:** retomar checklist do ponto onde parou.

### Patterns reconhecidos (regex case-insensitive com flexões — kit v2.4)

```
\b(reativa|reativar|reativamos)\s+jornada\b
\b(retoma|retomar|retomamos|retomei|retomo)\b
\b(continuar?|continuamos|continuei|continuou)\b
\b(volta|voltar|voltamos|voltei) (o tour|aqui|wizard|comigo)\b
\b(guia|guiar) de novo\b
\b(volta|voltar) onde parou\b
\b(eae|hey|oi|opa) (retomamos|voltamos|continuamos)\??\b
```

**Exemplos válidos** (todos casam):
- "retomar"
- "retoma"
- "retomamos" ← caso real Pedro
- "continuar"
- "continuamos"
- "voltar pra checklist"
- "vamos voltar"
- "eae, retomamos?"

### Comportamento

1. Ler `onboarding_paused_at_step={N}` em `MEMORY.md`
2. Se `onboarding_dismissed=true`:
   > "Você tinha cancelado de vez essa jornada. Manda 'reativar mesmo' pra confirmar que quer voltar."
3. Se pausa normal:

   > "Bem-vindo de volta. Você parou no passo {N}.
   >
   > [renderizar checklist atualizada com [x] feitos e [→] pulados]
   >
   > Continuar daí ou prefere recapitular o que já fizemos?"

4. Esperar resposta antes de despachar wizard

### Casos de borda

- Aluno reativou mas não tem `onboarding_paused_at_step` (nunca cancelou) → tratar como primeira interação (re-disparar checklist do começo)
- Aluno reativou e MEMORY corrupted/perdido → mostrar checklist com tudo desmarcado e perguntar "Não consegui recuperar onde você parou. Bora começar de novo?"

---

## 5. Sobre

**Função:** mostrar versão expandida do manifesto.

### Patterns reconhecidos

- "sobre"
- "filosofia"
- "quem fez isso?"
- "me explica o kit"
- "manifesto"

### Comportamento

1. Carregar `references/sobre-o-kit.md`
2. Apresentar texto inteiro
3. Substituir `{N}` na última linha pelo passo atual
4. Esperar aluno responder pra retomar (não despachar wizard automaticamente)

### Casos de borda

- Aluno mandou "sobre" antes de começar a jornada (logo após manifesto curto): trocar última linha por "Bora começar pelo passo 0 ou ir direto pro 1?"
- Aluno mandou "sobre" no meio de um wizard ativo: pausar wizard, mostrar texto, perguntar se quer retomar

---

## 6. Exemplo

**Função:** mostrar template do Bruno/Amora pra aluno se inspirar quando trava em pergunta de design.

### Patterns reconhecidos

- "exemplo"
- "mostra exemplo"
- "como o Bruno fez"
- "template Amora"
- "me mostra como ficou"

### Comportamento

1. Identificar contexto atual (qual wizard ativo, qual pergunta foi feita)
2. Carregar arquivo correspondente em `starter-kit/exemplos/` (ex: `IDENTITY-amora.md` se aluno tá em pergunta sobre identidade do agente)
3. Apresentar template com header de contexto: "esse é o IDENTITY.md da Amora — Chief of Staff do Bruno. Não copia, adapta"
4. Após mostrar, voltar pra pergunta original: "agora que viu, me manda o seu jeito"

### Mapa de contextos → exemplos

| Contexto / Wizard | Carrega arquivo |
|---|---|
| `wizard-aluno` perguntando sobre você | `exemplos/USER-amora.md` |
| `wizard-agente` perguntando nome/tom | `exemplos/IDENTITY-amora.md` + `SOUL-amora.md` |
| `wizard-agente` perguntando regras | `exemplos/AGENTS-amora.md` |
| `wizard-workspace` mostrando estrutura | `exemplos/MAPA-amora.md` |
| Outros (futuro) | conforme novos exemplos forem adicionados |

### Casos de borda

- Aluno pediu "exemplo" sem contexto claro (ex: chat livre fora de wizard): listar todos os exemplos disponíveis e perguntar qual quer ver
- Exemplo não existe pro contexto: explicar e oferecer alternativa próxima

Detalhes do padrão completo: `references/padrao-exemplos-opt-in.md`

---

## 7. FAQ

**Função:** carregar FAQ do starter-kit pra responder dúvidas comuns sem agente improvisar.

### Patterns reconhecidos

- "faq"
- "perguntas frequentes"
- "ajuda"
- "tô com dúvida"
- "isso é normal?"

### Comportamento

1. Carregar `starter-kit/FAQ.md`
2. Se aluno mandou só "faq": mostrar índice das seções (1-9)
3. Se aluno mandou pergunta específica: identificar seção relevante e mostrar só essa parte
4. Sempre oferecer no final: "manda 'faq' + número da seção pra ver outra parte. Se não respondeu sua dúvida, manda no grupo: https://t.me/cursoopenclaw"

### Casos de borda

- Aluno arquivou kit (incluindo FAQ): agente lê FAQ direto de `~/archive/starter-kit-onboarding-{data}/FAQ.md` sem precisar mover arquivo
- FAQ não cobre dúvida: agente é honesto ("isso não tá no FAQ, manda no grupo que a galera ou o @Openclawzinho responde")

---

## 8. Muda modo

**Função:** trocar entre modo aula-por-aula (A) e modo wizard direto (B).

---

## 9. Abre A{X} (Modo A v2 — kit v2.3)

**Função:** abrir submenu de configuração da aula X (X ∈ {0, 1, 2, 3, 4, 5, 6}).

### Patterns reconhecidos

- "abre A0", "abre A1", ..., "abre A6"
- "aula A{X}" (sinônimo)
- "começar A{X}"
- "vamos pela A{X}"

### Comportamento

1. Carregar `references/aula-menus.md` na seção da aula correspondente
2. Renderizar submenu LITERAL (P15)
3. Esperar aluno escolher entre opções do submenu (a/b/c, ou módulo específico)
4. Despachar wizard(s) correspondente(s)
5. Marcar `aula_A{X}_assistida=true` em MEMORY ao concluir

### Casos de borda

- Aula com pré-req incompleto (ex: aluno mandou "abre A4" sem ter completado A2): avisar dependência, perguntar se quer voltar
- Aula pré-req (A1, A3): submenu confirma "já feito antes do kit", oferece pergunta-âncora opcional
- Aula A6: submenu explica que é referência permanente, sem config

---

## 10. Vi A{X} / Assisti A{X}

**Função:** marcar aula como assistida (rápido, sem abrir submenu).

### Patterns reconhecidos

- "vi A{X}", "assisti A{X}"
- "terminei A{X}"
- "A{X} feita", "A{X} ok"
- "concluí A{X}"

### Comportamento

1. Marcar `aula_A{X}_assistida=true` em MEMORY
2. Re-renderizar checklist com [✓] na linha da aula X
3. Sugerir próxima aula

### Casos de borda

- Aluno marca A{X} sem ter feito A{X-1}: tudo bem, kit não força ordem (mas avisa "você pulou A{X-1}, manda 'abre A{X-1}' depois pra fechar")

---

## 11. Vou assistir A{X} (auto-pause)

**Função:** aluno avisa que tá saindo pro Hotmart pra ver vídeo.

### Patterns reconhecidos

- "vou assistir A{X}"
- "tô vendo A{X}"
- "assistindo aula"

### Comportamento

1. Salvar `assistindo_aula: A{X}` em MEMORY com timestamp
2. Responder com mensagem de espera:

   > "Tô aqui esperando. Quando voltar, manda 'assisti A{X}' (ou 'A{X} ok') pra eu disparar o submenu da aula. Se travar na aula, manda 'travei na A{X}' que eu ajudo."

3. Não despachar wizard (espera próxima mensagem do aluno)

---

## 12. Travei na A{X}

**Função:** aluno tá com dificuldade durante o vídeo e pede ajuda contextual.

### Patterns reconhecidos

- "travei na A{X}"
- "tô travado na aula {X}"
- "não tô conseguindo na A{X}"

### Comportamento

1. Entrar em modo "ajuda contextualizada":

   > "Em qual ponto da aula? Manda timestamp aproximado ou descreve o que travou. Posso:
   > - Explicar o conceito de novo (texto)
   > - Apontar pro tópico relevante na FAQ
   > - Te jogar pro grupo (@Openclawzinho 24/7)"

2. Conforme aluno descreve, agente decide entre as 3 opções
3. NÃO despachar submenu da aula até aluno mandar "assisti A{X}"

---

## 13. Ajuda (kit v2.4 — formaliza handler)

**Função:** mostrar menu completo de comandos disponíveis. Mensagem final pós-vitória anuncia este comando — sem implementação, virava promessa não-cumprida.

### Patterns reconhecidos

- "ajuda"
- "comandos"
- "menu"
- "que comandos eu tenho?"
- "o que eu posso fazer?"
- "help"

### Comportamento

1. Renderizar menu enxuto agrupado por categoria (P17 — parágrafos contínuos):

```
"📋 **Comandos disponíveis:**

**Jornada:**
- `continuar` — próximo passo do mini-curso
- `retomar` / `voltar wizard` — re-renderizar checklist
- `pulo` — pular o passo atual
- `cancela` — pausar (volta com `retomar`)

**Aulas (Modo A v2):**
- `abre A{X}` — abrir submenu da aula X (X = 0 a 6)
- `vi A{X}` — marcar aula como assistida
- `vou assistir A{X}` — me avisa que tá saindo pro Hotmart
- `travei na A{X}` — ajuda contextual

**Setup:**
- `config` — mudar algo do setup (nome do agente, autonomia, etc)
- `restaura manuais` — trazer de volta os manuais arquivados pós-vitória

**Conteúdo:**
- `sobre` — manifesto expandido
- `faq` — perguntas frequentes
- `exemplo` — template do Bruno/Amora pra inspiração

**Apoio:**
- @Openclawzinho no grupo (bot IA 24/7) — https://t.me/cursoopenclaw
- Bruno: bruno@microsaas.com.br

Ou me peça uma **tarefa real** sem comando — eu funciono igual."
```

2. NÃO despachar wizard automaticamente — esperar aluno responder

### Casos de borda

- Aluno mandou "ajuda" no meio de wizard ativo: mostrar o menu mas avisar "você tá no passo X — quando voltar, manda 'continuar' que retomamos"

---

## 14. Config (kit v2.4 — formaliza handler)

**Função:** menu pra mudar elementos do setup já configurado (nome do agente, tom, autonomia, chaves, workspace). Atalho amigável pros comandos `voltar N`/`refazer` específicos.

### Patterns reconhecidos

- "config"
- "configurar"
- "configurações"
- "settings"
- "muda config"
- "mudar setup"

### Comportamento

1. Mostrar menu de áreas configuráveis (P17):

```
"⚙️ **O que você quer mudar?**

- **Personalidade do agente** (nome, tom, regras): manda `refazer agente` ou `volta no 1`
- **Sua personalidade** (USER.md — quem você é, o que faz): `refazer aluno` ou `volta no 2`
- **Autonomia** (yolo / pergunta antes / etc): `refazer autonomia` ou `volta no 3`
- **Workspace** (organização das pastas, MAPA): `refazer workspace` ou `volta no 4`
- **Chaves API** (OpenAI, Brave, GitHub): `refazer conectar` ou `volta no 5`

Cada um abre o wizard correspondente em **modo edição** — você diz o que quer mudar, eu mexo só nisso (não refaço do zero).

Se quer refazer DO ZERO algum desses, manda `refazer {area} do zero` que eu faço backup do estado atual antes."
```

2. Aguardar aluno escolher
3. Despachar wizard correspondente em modo edição (preserva o que aluno não pediu pra mudar — Princípio 6)

### Casos de borda

- Aluno mandou "config" antes de completar onboarding: redirecionar pra `onboarding-checklist` (faz mais sentido completar primeiro)
- Aluno mandou "config" sem especificar: mostrar o menu acima e esperar escolha

---

### Patterns reconhecidos

**Patterns explícitos (regex case-insensitive):**

```
\b(muda|trocar?|alterna|altera|vira)\s+(modo|pra (aula|wizard|video))\b
\b(ativa|ativar)\s+modo\s+(aula|wizard)\b
\b(esquece|sem)\s+aulas\b
\bvai\s+direto\b
```

**Classificação semântica (kit v2.5 — fix Gustavo stress test):**

⚠️ Patterns regex SEMPRE têm falso negativo em paráfrases naturais. Aluno cansado mid-jornada manda coisas como:

- "posso fazer direto sem aulas?"
- "tô cansando de alternar entre Hotmart e aqui"
- "será que dá pra pular a parte de ver vídeo?"
- "queria ir mais rápido sem essa de aula"

**Nenhuma dessas casa o regex acima.** Mas todas expressam intenção CLARA de mudar de Modo A → Modo B (ou vice-versa).

**Comportamento canonical do agente:**

1. **Quando classificar semanticamente "intenção de mudar modo":** se o aluno expressa frustração/cansaço com aulas (Modo A) ou desejo de ir mais rápido/direto, OU vice-versa (no Modo B, manda algo tipo "queria ver as aulas com calma"), agente DEVE oferecer confirmação canonical em vez de tratar como desvio (P13 c2).

2. **Mensagem canonical de oferta (P15 — literal):**

```
"Pelo que você falou, parece que quer trocar pra {modo_oposto}. {1 frase de contextualização}.

Confirma? Manda 'sim' que eu troco, ou 'não' que sigo o modo atual ({modo_atual})."
```

Substituições:
- `{modo_atual}` = leitura literal de MEMORY (`modo_jornada: aula | wizard`)
- `{modo_oposto}` = inverso (aula → wizard, wizard → aula)
- `{1 frase de contextualização}`:
  - Aula → Wizard: "Modo wizard é mais rápido (~30min comigo, sem aulas paralelas)"
  - Wizard → Aula: "Modo aula tem o suporte das aulas do mini-curso pra cada passo (~37min com aulas)"

3. **Após confirmação 'sim':** segue fluxo canonical do comando #8 normal (`"Vou trocar de aula pra wizard. Tem certeza?"` → re-renderiza UI, etc).

4. **Após 'não':** retoma onde estava + 1 frase neutra ("Beleza, sigo no modo {modo_atual}. Onde paramos: {breve recap}").

**Por que classificação semântica em vez de regex novo:**

- Regex pra paráfrase é jogo perdido (sempre falso negativo)
- Agentes LLM modernos classificam intenção naturalmente
- Mais robusto que listar 30 variações
- SKILL.md instrui o COMPORTAMENTO (oferecer confirmação canonical), não o MATCHING (deixa pra capacidade do modelo)

**Falha real (Gustavo stress test 03/05 madrugada):** aluno mid-A4 manda `"acho que eu tô cansando de ficar alternando. Posso só fazer direto sem aulas?"` — regex não casa, kit interpretava como desvio (P13 c2) e empurrava aluno DE VOLTA pra A4 (justo o que ele quer escapar). v2.5 ataca a raiz: agente classifica intenção e oferece confirmação.

**Patterns explícitos continuam aceitos** — pra alunos que sabem o jargão.

### Comportamento

1. Ler `modo_jornada` atual em `MEMORY.md`
2. Confirmar troca: "Vou trocar de {modo_atual} pra {modo_novo}. Tem certeza?"
3. Se confirmado, salvar `modo_jornada: aula | wizard` em `MEMORY.md`
4. Re-renderizar UI conforme novo modo (modo A mostra menu modular completo, modo B esconde menu e conduz)

### Casos de borda

- Aluno tenta mudar mas não tá em jornada ativa: avisar "você não tá numa jornada agora. Use 'reativa jornada' pra começar"
- Aluno quer mudar repetidas vezes: aceitar (sem fricção), mas registrar na MEMORY como sinal de indecisão

---

## 15. Silencia wizard (kit v2.5.6 — Princípio 19)

### Patterns reconhecidos

**Patterns explícitos (regex case-insensitive):**

```
\bsilencia\s+wizard\b
\bdesliga\s+(lembrete|nudge|aviso)\s+(do\s+)?wizard\b
\b(para|pare)\s+de\s+me\s+(lembrar|cobrar)\b
\bsem\s+(lembrete|nudge)\s+(do\s+)?wizard\b
```

**Classificação semântica:** se aluno expressar irritação/cansaço com lembretes do wizard (ex: *"para de me lembrar"*, *"chega de cobrança"*, *"deixa eu em paz com isso"*), agente trata como `silencia wizard` mesmo sem o termo exato.

### Comportamento

1. Em `MEMORY.md`, seta:
   ```yaml
   wizard_nudge_silenced_until: now() + 4h   # ISO timestamp
   ```
2. Wizard ativo permanece (não cancela). Só desliga os nudges de estagnação (Princípio 19).
3. `cron-resume-wizards` também respeita a flag — não dispara DM enquanto `wizard_nudge_silenced_until > now()`.
4. Após 4h, flag expira automaticamente. Aluno pode renovar mandando `silencia wizard` de novo.

### Mensagem canonical de confirmação (P15 — literal)

```
"Beleza, desliguei os lembretes do wizard {nome} por 4h. Você
continua no passo {Y}/{Z}, é só voltar quando quiser — eu não
te cobro. Se mudar de ideia, manda 'continuar' pra retomar."
```

### Casos de borda

- Aluno usa `silencia wizard` SEM wizard ativo: responde *"você não tá em wizard ativo agora — não tem o que silenciar."*
- Aluno usa repetidas vezes: aceita silenciosamente. Cada uso renova 4h.
- Aluno pede pra silenciar PERMANENTEMENTE: oferece `cancela` em vez (cancela o wizard de fato).
- Aluno usa silencia wizard E depois usa `cancela`: cancela tem prioridade — wizard sai, flag de silêncio fica órfã (zerada na próxima reativação).

---

## Resumo da matriz

| Comando | Modifica MEMORY? | Despacha wizard? | Backup? |
|---|:-:|:-:|:-:|
| Voltar (modo edição) | Sim (atualiza) | Sim (modo parcial) | Não |
| Voltar (modo refazer) | Sim (reset do passo) | Sim (do zero) | ✅ Sim |
| Pular | Sim (`skipped`) | Sim (próximo passo) | Não |
| Cancelar | Sim (`paused_at_step`) | Não | Não |
| **Silencia wizard** | **Sim (`wizard_nudge_silenced_until`)** | **Não (mantém ativo)** | **Não** |
| Reativar | Sim (limpa `paused`) | Sim (do ponto pausado) | Não |
| Sobre | Não | Não | Não |
| Exemplo | Não | Não | Não |
| FAQ | Não | Não | Não |
| Muda modo | Sim (`modo_jornada`) | Não | Não |
| Abre A{X} | Sim (`aula_A{X}_assistida`) | Sim (submenu) | Não |
| Vi A{X} | Sim (`aula_A{X}_assistida`) | Não | Não |
| Vou assistir A{X} | Sim (`assistindo_aula`) | Não | Não |
| Travei na A{X} | Não | Não | Não |
| Ajuda | Não | Não | Não |
| Config | Não | Sim (modo edição) | Sim (se "do zero") |
