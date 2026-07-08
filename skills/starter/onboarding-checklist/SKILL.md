---
name: onboarding-checklist
status: ATIVO
category: starter
owner: aluno
version: 2.1.3
mode: guided
estimated_time: 37min (jornada completa) ou 1min (apresentação)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student opens Telegram for the first time after installing the Starter Kit, OR when student types "continuar" / "retomar" / "reativa jornada" / "checklist". Master skill that orchestrates the full onboarding journey by dispatching to wizard-* skills. Renders persistent visual checklist, handles canonical commands, detects environment state, and protects existing installations. **v2.1.3 (kit v2.5.3 — fix Allan silêncio 10min): regra UX EXPECTATIVA antes de comandos longos adicionada como sub-regra de P14 (`principios-defensivos.md`). Quando wizard filho vai invocar tool que pode levar 30s+ (Chromium install, primeiro push GitHub, gateway restart), agente avisa ANTES com canonical setando expectativa de tempo + reconhecendo bloqueio durante execução. Caso real Allan 17:55-18:05: silêncio de 10min durante install Chromium em VPS root fez aluno perguntar "ainda processando?". Crítico: regra é ANTES do tool, não DURANTE — durante execução agente fica BLOQUEADO sincronicamente, sem mecanismo de update intermediário. Aplicado em wizard-conectar (Chromium SingletonLock branch) + backup-workspace-github (primeiro push) + wizard-autonomia (gateway restart).** v2.1.2 (kit v2.5.2 — fix Adrylan jornada ponta-a-ponta): protocolo de TRANSIÇÃO entre wizards adicionado em P13 (`principios-defensivos.md`) — quando wizard A despacha B, A zera `active_wizard` + B SETA `active_wizard:B + active_step:1` ANTES da 1ª mensagem; opções de B usam letras `a/b` (não `1/2`) se anterior usou `1/2` (anti-colisão de numeração). Caso real Adrylan 13:42-13:45: 3 turnos perdidos no loop whisper→wizard-agente porque ambos perguntavam `1/2`.** v2.1.1 (kit v2.5.1 — patch INSTALAÇÃO obrigatória, fix Mileo 03/05 17:43): bug arquitetural classe nova — kit foi EXTRAÍDO mas skills não foram MIGRADAS pra `$WORKSPACE/skills/`. Sem skills registradas, agente trata kit como arquivo solto e improvisa "análise tipo code review". Caso real: Mileo "extraia e analise" → agente enumerou skills + pediu identidade upfront + ofereceu 3 caminhos genéricos sem invocar onboarding-checklist. Fix em `0-LEIA-PRIMEIRO-AGENTE.md` (não nesta SKILL): bloco "INSTALAÇÃO OBRIGATÓRIA" no topo com 3 cenários de detecção (zip recém-recebido / pasta extraída em path temporário / primeira interação) + comandos shell de extração (com fallback Python pra Managed sem unzip) + migração skills pra `$WORKSPACE/skills/` + invocação imediata de onboarding-checklist. Esta SKILL fica intacta — fix é PRÉ-condição (instalação) que tem que rolar antes desta SKILL ser invocada.** v2.1 (kit v2.5 — stress test round 2, 4 personas novas Letícia/Mira/Gustavo/Helena → 8 fixes arquiteturais): Bifurcação a/b ganha regra "qualquer outra coisa ambígua → repetir literal" (NÃO infere por similaridade — viola P15+P7). Caso real Helena: "faz o que for mais rápido" → kit inferia 'b' por similaridade ('rápido' ≈ wizard). v2.5 explicita: nunca inferir, sempre repetir.** v2.0.1 (kit v2.4.1 — patch UX entrada, Bruno conta nova 03/05 noite): agente parava após boas-vindas porque texto terminava com cliffhanger "Agora deixa eu olhar..." sem canonical pra próxima mensagem. 5 fixes: (1) cliffhanger removido da boas-vindas; (2) novo bloco "⚠️ FLUXO DE TURNO" instrui agente a mandar boas-vindas (MSG 1) + Pré-bifurcação Hotmart (MSG 2) sequencialmente sem aguardar resposta entre elas; (3) seção `## Manifesto de abertura` marcada DEPRECATED — boas-vindas universal já cumpre o papel, carregar manifesto.md ali geraria duplicação histórica (bug v2.2.1); (4) `Heads up` → `Aviso` (anglicismo); email sem bold (Telegram bridge gerava mailto duplo); (5) ramo "avulso" da Pré-bifurcação ganha CTA Pixel Educação com UTM (https://openclaw.pixeleducacao.com.br?utm_source=starter-kit...).** v2.0 (kit v2.4): Fase Pré-Zero reordenada, pergunta Hotmart, handlers ajuda/config, mensagem final A6 + ponte honesta. v1.7: sinônimos `continuar`/`retomar`. v1.6: Boas-vindas universal. v1.4: entry point.
---

# Onboarding Checklist — Skill Mestre da Jornada

> 🤖 **Agente:** se você chegou aqui sem ter lido [`../../../../0-LEIA-PRIMEIRO-AGENTE.md`](../../../../0-LEIA-PRIMEIRO-AGENTE.md) na raiz do kit, **leia ela primeiro**. Ela explica como receber o kit corretamente (entry point literal + improvisações proibidas — Princípio 16, kit v2.2). Se você já leu, segue normal.
>
> ⚠️ **Boas-vindas canonical (Princípio 15 + 16):** a seção "Boas-vindas universal" abaixo é texto LITERAL — quando agente invoca esta skill, renderiza essa boas-vindas SEM preâmbulo, SEM versão resumida, SEM "olhada rápida no kit". Primeira mensagem do agente ao aluno = essa boas-vindas, ponto.

## Promessa

O aluno passa de "instalei um kit" pra "meu agente trabalhou pra mim de verdade" em ~37min, conduzido por uma checklist visual que aparece no Telegram, gameifica progresso e respeita o tempo dele (pode pausar, voltar, pular, cancelar).

A skill mestre não executa nenhum dos passos — ela apresenta a jornada e despacha cada passo pra um wizard específico (`wizard-agente`, `wizard-aluno`, etc).

## Quando disparar

**Trigger automático:**
- Primeira mensagem do aluno no Telegram + nenhuma marca `kit_intro_done=true` em `MEMORY.md`
- Workspace tem `skills/starter/` populado (kit acabou de ser instalado)

**Trigger explícito:**
- "checklist"
- "reativa jornada"
- **"continuar"** (v1.7 — sinônimo intuitivo de `reativa jornada`)
- **"retomar"** (v1.7)
- **"voltar wizard"** (v1.7)
- **"voltar"** quando NÃO está dentro de um passo específico (v1.7)
- "começar de novo"
- "onde eu parei?"

⚠️ **Razão dos sinônimos novos (v1.7):** `reativa jornada` é jargão interno — aluno não adivinha. Após primeira-vitoria, aluno tenta "continuar", "voltar", "retomar" e nenhum desses estava mapeado, gerando sensação de "wizard morreu". Agora o vocabulário natural funciona.

**NÃO disparar se:**
- `MEMORY.md` tem `onboarding_dismissed=true` (aluno escolheu não usar checklist)
- Já tem outra wizard ativa em execução

## ⚠️ FLUXO DE TURNO (CRÍTICO — kit v2.4.1)

A primeira interação com o aluno tem **2 mensagens em sequência do agente, SEM aguardar resposta entre elas:**

```
[MSG 1 do agente] — Boas-vindas universal (texto canonical abaixo)
   ↓ imediato (sem turn boundary, sem esperar input)
[Fase Pré-Zero silenciosa: detecção de ambiente, read-only, sem mensagem]
   ↓ imediato
[Fase Zero silenciosa: detecção Cenário A/B/C, read-only, sem mensagem]
   ↓ imediato
[Verificação de canal: visível SÓ se canal != Telegram, normalmente skipped]
   ↓ imediato
[MSG 2 do agente] — Pré-bifurcação Hotmart (pergunta "tenho/avulso")
   ↓
[ESPERA aluno responder]
```

**MSG 1 + MSG 2 são UM TURNO do agente.** Pode mandar como 2 mensagens sequenciais no Telegram (preferido — UX melhor, aluno processa boas-vindas e vê pergunta chegar 1-2s depois) OU como 1 mensagem combinada. **NÃO** esperar resposta entre elas.

**Falha real (Bruno conta nova v2.4 — 03/05/2026 noite):** agente recebeu zip, mandou boas-vindas, parou. Aluno ficou sem CTA. Causa-raiz: boas-vindas terminava com cliffhanger "Agora deixa eu olhar o que tem aqui no seu workspace pra escolher o melhor caminho..." (promessa narrativa sem texto canonical pra mensagem seguinte). Agente cumpria internamente (Pré-Zero silenciosa, Fase Zero silenciosa) e terminava o turno — instinto correto pra ele, péssimo pro aluno.

**v2.4.1 corrige:** boas-vindas SEM cliffhanger + Pré-bifurcação Hotmart como MSG 2 imediata + bloco DEPRECATED na seção "Manifesto de abertura" (boas-vindas já cumpre).

**A seção `## Manifesto de abertura` mais abaixo está DEPRECATED em v2.4.1** — pular ela (boas-vindas universal já apresentou manifesto na prática). Carregar `manifesto-abertura.md` ali = duplicação histórica documentada (bug v2.2.1 conta nova Bruno).

---

## Boas-vindas universal (MSG 1 — sempre PRIMEIRO, antes de qualquer detecção)

⚠️ **CRÍTICO:** essa boas-vindas aparece em TODOS os cenários (A vazio, B populado, C parcial). Padroniza primeira impressão. Mesmo que o aluno seja antigo, ele lê isso. Mesmo que workspace seja vazio, ele lê isso.

⚠️ **Esta é a MSG 1 do turno.** Imediatamente após mandar essa mensagem, agente faz Pré-Zero + Fase Zero silenciosas e DISPARA MSG 2 (Pré-bifurcação Hotmart). Não espera resposta aqui — ver "FLUXO DE TURNO" acima.

⚠️ **Formatação Princípio 17 (kit v2.2):** parágrafos contínuos, sem hard-breaks artificiais. Telegram faz word-wrap natural — não quebrar manualmente a cada ~70 chars (problema reportado por Adrylan 03/05).

```
"Oi! 👋

Eu sou {nome_agente}. Acabei de receber o **Starter Kit OpenClaw v{X.Y}** — um experimento da **Pixel Educação** (mini-curso OpenClaw), feito pelo **Bruno Okamoto**.

🧪 **Em fase EXPERIMENTAL.** É o primeiro experimento da Pixel onde o conteúdo do mini-curso roda DENTRO do agente do aluno. Cada skill foi escrita pra ser:

- Lida e executada por outro agente (eu)
- Compreensível por humano que olha por cima (você)

A tese: em vez de você ler manual e configurar tudo na mão, **eu sou seu tutor**. Te guio passo a passo, executo o que dá pra executar, te explico o por quê.

Esse é um curso pra **dois tipos de aluno: humanos E agentes**. Você é o humano, eu sou o agente, a gente faz isso juntos.

⚙️ **Sobre o kit:** ele não mexe em nada que você já tem — só adiciona com sua autorização passo a passo. Quando a jornada terminar, eu arquivo automaticamente os manuais, exemplos e FAQ que vieram só pra te guiar (vão pra `archive/`, não somem de vez — você pode consultar depois). **No workspace ativo permanece só: o que VOCÊ configurou + as skills novas que ativamos juntos.** Zero lixo.

Aviso: tá em **testes ativos**. Se algo soar estranho, manda direto pro Bruno: bruno@microsaas.com.br (ele lê pessoalmente). Comunidade no Telegram: https://t.me/cursoopenclaw"
```

(Fim da MSG 1. NÃO termina com cliffhanger — a frase "Agora deixa eu olhar..." da v2.4 foi REMOVIDA em v2.4.1. Razão: aluno ficava aguardando ação visível que não vinha; agente cumpria detecção silenciosa e terminava turno; bug Bruno conta nova 03/05 noite.)

⚠️ **APÓS MANDAR MSG 1 (acima):** agente IMEDIATAMENTE (sem turn boundary, sem aguardar resposta do aluno) executa em sequência:

1. **Fase Pré-Zero silenciosa** (detecta ambiente — read-only, sem mensagem ao aluno)
2. **Fase Zero silenciosa** (decide Cenário A/B/C — read-only)
3. **Verificação de canal** (visível SÓ se canal != Telegram; em Telegram, pula)
4. **Manifesto de abertura — SKIPPED** em v2.4.1 (DEPRECATED — boas-vindas já cobre o papel; não duplicar)
5. **Marca `kit_intro_done=true`** em MEMORY.md
6. **MSG 2 — Pré-bifurcação Hotmart** (próxima seção abaixo — pergunta visível ao aluno)
7. **AGORA** sim aguarda resposta do aluno

**Substituições no template:**
- `{nome_agente}` — ler de `IDENTITY.md` se existe; se não, usar nome default ("seu agente")
- `{X.Y}` — versão do kit (ler de `CHANGELOG.md` linha 1 ou hardcoded — atualmente v2.4.1)

**NÃO pular essa boas-vindas** mesmo que ache que aluno já conhece. Em testes anteriores, vários alunos não sabiam que era da Pixel ou que era experimental — gerou desconforto. Padronizar primeira impressão resolve.

---

## Fase Pré-Zero — Detecção de ambiente (CRÍTICA — roda PRIMEIRO, kit v2.4)

⚠️ **REORDENADA em kit v2.4** — antes era depois da Fase Zero, agora roda ANTES. Razão: Cenário B (workspace populado) precisa de `ambiente:` setado pra adaptar copy ("aluno antigo VPS" vs "aluno antigo Managed"); fast-path Whisper depende da flag; Modo A v2 (passo 0 invisível em Managed) idem.

⚠️ **CRÍTICA — roda ANTES da Fase Zero (Cenário A/B/C), antes da bifurcação de modo, ANTES até da Verificação de canal.** Sem essa detecção:
- `wizard-whisper-quick` fast-path não dispara (depende da flag `ambiente:`)
- Fase Zero não pode adaptar copy ao tipo de instalação detectada
- Modo A v2 (kit v2.3) checklist condicional não pode renderizar passo 0 invisível
- `wizard-conectar` fast-path GitHub PAT não pode avisar diferenças entre Managed e VPS

### Sequência

Agente detecta ambiente OpenClaw em ~1s, silencioso (sem perguntar nada ao aluno):

```bash
# 1. Sinais de Managed (OpenClaw 1-click Hostinger)
[ -d "$HOME/.openclaw" ] && echo "managed_signal_1: dir ~/.openclaw"
[ -f "$HOME/.openclaw/openclaw-config.json" ] && echo "managed_signal_2"
echo "$WORKSPACE" | grep -q "/.openclaw/" && echo "managed_signal_3"

# 2. Sinais de VPS root
[ "$(whoami)" = "root" ] && echo "root_signal_1"
[ -d "/root/.openclaw" ] && echo "root_signal_2"

# 3. Sinais de local-dev
[ -f "$HOME/.zshrc" ] || [ -f "$HOME/.bashrc" ] && echo "localdev_signal_1"

# 4. Env var OpenAI (vem do setup Managed; tb pode existir em outros)
[ -n "$OPENAI_API_KEY" ] && echo "has_openai_envvar"
```

**Decisão:**

| Padrão de sinais | `ambiente:` em MEMORY |
|---|---|
| 2+ sinais Managed + has_openai_envvar | `managed` |
| 2+ sinais Managed sem has_openai_envvar | `managed` (Whisper vai pedir chave normalmente) |
| 2+ sinais root | `vps-root` |
| Só sinais local-dev | `local-dev` |
| Ambíguo / nenhum forte | `unknown` (pergunta ao aluno mais tarde, no wizard-autonomia) |

Salvar também em MEMORY:

```yaml
ambiente: managed  # ou vps-root | local-dev | unknown
ambiente_detected_at: 2026-05-03T20:00:00-03:00
ambiente_signals: [managed_signal_1, managed_signal_3, has_openai_envvar]
managed_has_openai_envvar: true   # útil pro fast-path do wizard-whisper-quick
has_openai_envvar: true             # universal — útil pro fast-path em qualquer ambiente (kit v2.4)
```

### O que essa fase NÃO faz

- NÃO confirma a chave OpenAI (isso é P14 do wizard-whisper-quick — smoke test visível)
- NÃO pergunta ao aluno sobre ambiente (pra isso tem o wizard-autonomia se restar dúvida)
- NÃO modifica `.env` ou outros arquivos (read-only nesta fase)

Após detecção e MEMORY setada, segue pra Fase Zero (Cenário A/B/C).

---

## Fase Zero — Cenários A/B/C (após Pré-Zero)

Após a Fase Pré-Zero ter setado `ambiente:` em MEMORY, detectar estado da instalação. 3 cenários:

### Cenário A — Workspace vazio (aluno novo)

Detecção: nenhum arquivo raiz preenchido (`USER.md`, `IDENTITY.md`, `AGENTS.md` ausentes ou vazios) + `MEMORY.md` sem flags.

Ação: seguir fluxo normal (apresentar manifesto + checklist).

### Cenário B — Workspace populado (aluno antigo)

Detecção: arquivos raiz preenchidos OU `MEMORY.md` com flags de versão anterior OU skills customizadas pré-existentes.

**⚠️ IMPORTANTE pro agente que vai executar isso:**
- **NÃO improvise outras opções fora dos 3 caminhos abaixo.** Apresente os 3 textualmente como descrito.
- **NÃO ofereça "instalar tudo mesmo assim sobrescrevendo"** — quebra workspace do aluno (Princípio 1).
- **NÃO recomende um caminho sobre outro** — aluno escolhe baseado no perfil dele.
- **NÃO siga fluxo normal da jornada (Cenário A)** SEM aluno ter pedido opção 2 explicitamente.
- **Apresente os 3 caminhos e ESPERA resposta** ('1', '2' ou '3') antes de executar qualquer ação.

Ação: apresentar 3 caminhos canônicos e perguntar.

⚠️ **Formatação Princípio 17:** parágrafos contínuos, sem hard-breaks artificiais.

```
"[Nome], detectei que você já tem um OpenClaw configurado:

- {USER.md preenchido (último edit: DD/MM/AAAA)}
- {N skills instaladas}
- {N entradas em MEMORY.md}

Esse Starter Kit foi feito pra instalações do zero. Se eu rodar a jornada completa, vou criar arquivos por cima do seu trabalho. Não vai rolar.

MAS você tem 3 caminhos seguros, sem destruir o que você construiu:

**(1) PRD personalizado — analítico, 30-60min**

Eu leio o kit + seu workspace, proponho um documento de adaptação ('PRD'), você aprova/ajusta, executo item a item COM SUA APROVAÇÃO em cada passo.

Vou:

- Fazer raio-X do meu kit (skills, templates, exemplos)
- Fazer raio-X do seu workspace (raiz, skills, memory, configs)
- Listar o que tem de NOVO no kit que você ainda não tem (ex: 4 skills de planejamento, backup-github automático, wizard-whatsapp)
- Te mostrar o PRD com prioridades
- Executar SÓ o que você aprovar, no ritmo que você definir

Bom pra: você quer o RESULTADO sem passar pela jornada inteira. Pode terminar em 5min (se aprovar só "instala 4 skills") OU 60min (se quiser adaptação completa). Você decide o escopo no PRD.

**(2) Wizard em modo review — experiencial, 20-40min**

Eu conduzo a jornada completa (6 passos: agente → aluno → autonomia → workspace → conectar → primeira-vitória) MAS em **modo review**: detecto o que já tá feito, confirmo com você, sugiro o que veio
   novo no kit.

   Em cada passo:
   • Detecto estado atual ("seu IDENTITY tem X, Y, Z — tá assim desde
     29/04")
   • Confirmo: "Tá bom assim ou quer ajustar?"
   • Aluno aprova ou pede mudança cirúrgica
   • Sugiro o que veio NOVO do kit naquele passo (ex: passo 5: "vi que
     você não tem backup-github ativo — quer ativar?")

   Bom pra:
   - Você quer EXPERIMENTAR a UX do kit (mesma que aluno novo vai ter)
   - Auditar workspace passo a passo
   - Descobrir o que tá faltando do kit novo

(3) Só referência — zero ação no workspace ativo
   O zip já foi extraído em starter-kit/. Você acessa quando quiser:
   • 'faq' → 10 perguntas operacionais (CLI emergência, custo,
     privacidade, compartilhar agente, criar outro agente)
   • 'mostra exemplo' → 5 exemplos da Amora (USER, IDENTITY, SOUL,
     AGENTS, MAPA) pra inspirar
   • 'ativa backup' → instala skill backup-workspace-github
   • 'ativa whatsapp' → instala wizard-whatsapp como canal extra
   • 'roda onboarding' → ativa jornada guiada se mudar de ideia

   Bom pra: você quer só ter os arquivos disponíveis pra consulta,
   sem rodar nada agora.

Manda '1', '2' ou '3'. Sem certo nem errado — depende do seu perfil."
```

Se aluno responder **1** (PRD personalizado):

⚠️ **CRÍTICO pro agente:** você É o agente do aluno (mesmo workspace, mesma memória). Não entregue prompt como texto pra colar — você executa pessoalmente. Falha histórica v1.0-v1.2.

1. Carregar `references/prompt-upgrade-para-aluno-antigo.md` como **instrução interna**.
2. Adotar postura: você É o tutor da migração. Mantém nome, tom, workspace — adiciona missão "conduzir o upgrade".
3. **Anunciar ao aluno que VOCÊ vai conduzir**:
   ```
   "Beleza, eu mesma vou conduzir o upgrade. Vou:
    - Fazer raio-X do kit que você baixou
    - Comparar com o que a gente já construiu aqui
    - Te mostrar um PRD personalizado de adaptação
    - Executar item a item — você aprova cada coisa antes de eu mexer
    Sem destruir nada do que já tá funcionando. Bora?"
   ```
4. Esperar OK. Executar as 6 fases:
   - **Fase 0:** validar acesso (`openclaw exec-policy show` retorna `yolo`?)
   - **Fase 0.5:** backup global (Princípio 10) — `tar -czf ~/backups/pre-upgrade-{timestamp}.tar.gz $WORKSPACE`
   - **Fase 1:** raio-X do kit (ler manifesto, exemplos/, templates/, todas as 14 skills/)
   - **Fase 2:** raio-X do workspace dele (raiz, skills/, memory/, content/)
   - **Fase 3:** propor PRD personalizado destacando:
     - Skills do kit que ele AINDA não tem (ex: `planejamento/`, `backup-github`, `wizard-whatsapp`)
     - Templates/exemplos que valem como referência
     - Configurações sugeridas (ex: ativar backup automático)
     - **Caso aluno só queira o mínimo:** PRD pode propor "instalar só 4 skills de planejamento" e fechar em 5min — esse caminho cobre o "atalho rápido" sem ter opção separada
   - **Fase 4:** aluno aprova/ajusta PRD (escopo decidido aqui)
   - **Fase 5:** executar item a item COM APROVAÇÃO em cada passo
5. Narrar cada fase (Princípio 4). Não rodar silencioso.
6. Marcar `upgrade_in_progress=true` em `MEMORY.md` enquanto roda; substituir por `upgrade_completed=true` no fim.
7. **NÃO marcar `onboarding_dismissed`** — aluno aceitou e completou.

Se aluno responder **2** (Wizard em modo review):

⚠️ **CRÍTICO pro agente:** Cenário B + opção 2 dispara a jornada normal (passos 0-6 da `onboarding-checklist`), MAS cada wizard filho roda em **modo review**, não em modo "criar do zero". Princípio 11 (detectar antes de pedir) já cobre isso em todos os wizards filhos — apenas REFORCE o comportamento.

1. Confirmar com aluno:
   ```
   "Beleza. Vou rodar a jornada completa em MODO REVIEW:

   Em cada um dos 6 passos, eu:
   - Detecto o que você JÁ tem
   - Mostro pra você
   - Confirmo: 'tá bom assim, quer ajustar, ou sugiro o que veio novo no kit?'
   - Você aprova ou pede mudança cirúrgica
   - Marco como ✓ e sigo

   Vou também sugerir o que veio NOVO no kit que você ainda não tem
   (ex: passo 5 vou sugerir ativar backup automático se você não tem).

   Não vou recriar nada do zero. Não vou destruir nada. Bora?"
   ```
2. Esperar OK. Disparar `onboarding-checklist` no fluxo padrão (Cenário A — mesma sequência) MAS com flag `mode: review` em `MEMORY.md` que cada wizard filho lê pra ajustar comportamento:
   - Em vez de "vou criar/fazer X", agente diz "achei seu X com Y conteúdo. Tá bom?"
   - Em vez de "passo X criado ✓", agente diz "passo X auditado ✓ (já estava feito)"
   - Plus: cada wizard sugere o que do kit é NOVO no escopo dele (passo 5 sugere `backup-github` + `wizard-whatsapp` se não estão ativos)
3. Resto do fluxo (modos A/B aula vs wizard, comandos canônicos, pós-vitória) segue igual.
4. Marcar `upgrade_in_progress=true` enquanto roda; substituir por `upgrade_completed=true` no fim.

Se aluno responder **3** (só referência):
1. Confirmar:
   ```
   "✓ Beleza. Os arquivos do kit estão em starter-kit/. Acessa quando quiser:

   📖 'faq' → 10 perguntas operacionais (CLI emergência, custo,
      privacidade, compartilhar agente, criar outro agente, tópicos)
   📂 'mostra exemplo' → 5 exemplos da Amora (USER, IDENTITY, SOUL,
      AGENTS, MAPA) pra inspirar
   🌐 'ativa whatsapp' → instala wizard-whatsapp (canal extra)
   💾 'ativa backup' → instala skill backup-workspace-github (cron
      03:00 BRT pro GitHub)
   🎓 'roda onboarding' → ativa jornada guiada se mudar de ideia
   📋 'changelog' → ver histórico de versões do kit

   Não vou rodar nada agora. Quando precisar, me chama."
   ```
2. Marcar `onboarding_dismissed=true` em `MEMORY.md` + log da decisão
3. Sair

Se aluno responder qualquer outra coisa ou ignorar 1/2/3: pedir pra escolher um dos 3 (não improvisar outro caminho).

### Cenário C — Workspace parcial

Detecção: workspace vazio MAS `.env` já tem chaves OU arquivo raiz isolado existe (ex: só `USER.md`, sem o resto).

Ação: seguir fluxo normal **sem tratamento especial aqui**. Cada wizard filho aplica o **Princípio 11 (Detectar antes de pedir)** automaticamente, então o estado parcial é resolvido caso a caso.

Exemplo: se `.env` já tem chave OpenAI, o `wizard-whisper-quick` (passo 0) detecta isso, valida, marca como pronto sem pedir nada. Se só `USER.md` existe, o `wizard-aluno` (passo 2) detecta e pula. O fluxo é o mesmo do Cenário A — a detecção fica embutida em cada passo.

**Por que não tratar aqui:** centralizar lógica de detecção na fase zero criaria duplicação. Cada wizard sabe melhor que ninguém o que precisa checar. Ver `references/principios-defensivos.md` (Princípio 11) pra mapa completo do que cada wizard detecta.

## Verificação de canal

Confirmar que aluno está usando Telegram (não WhatsApp ou outro).

Se canal != Telegram:

```
"Detectei que você tá usando {canal}. Esse kit foi otimizado pra Telegram
— alguns recursos visuais (checklist atualizada in-place, áudio fluido,
botões inline) só funcionam direito lá.

Recomendo: cria um Telegram (5min, grátis), configura o bot do agente lá
(aula A3 do mini-curso ensina), e roda o kit por lá.

Se quiser seguir aqui mesmo: vai funcionar, mas a experiência vai ser
degradada. Manda 'aceito perda' pra continuar, ou 'mudo pra telegram'
pra pausar e configurar."
```

Se aluno aceitar perda: marcar `canal_degradado=true` e seguir.
Se preferir mudar: marcar `onboarding_paused_at_step=0` e sair.

## Manifesto de abertura — DEPRECATED em v2.4.1

⚠️ **Esta seção foi NEUTRALIZADA em kit v2.4.1.** A boas-vindas universal acima já cumpre o papel do manifesto curto (quem fez, o que é, escopo experimental, contato). Carregar `references/manifesto-abertura.md` AQUI causaria duplicação — bug histórico já reportado em v2.2.1 (Bruno conta nova: "boas-vindas duplicada — agente mandou a oficial + a Versão curta do manifesto.md em sequência").

**Comportamento correto v2.4.1 (NO-OP nesta seção):**

- ✅ Marca `kit_intro_done=true` em MEMORY.md (a boas-vindas já apresentou o manifesto na prática)
- ❌ NÃO carrega `references/manifesto-abertura.md` aqui — só carrega quando aluno mandar comando `sobre` (manifesto expandido / Carta do Bruno)
- → Pula direto pra **Pré-bifurcação Hotmart** abaixo (MSG 2)

**Razão de manter a seção (mesmo deprecated):** alguns leitores externos da skill ainda esperam encontrar uma seção "Manifesto de abertura" no fluxo. Marcar como NO-OP é mais seguro que apagar — nova versão do agente lê e entende "pular".

## Pré-bifurcação: aluno tem o mini-curso comprado? (kit v2.4)

⚠️ **NOVO em kit v2.4** — antes de oferecer Modo A (aula-por-aula) ou Modo B (wizard direto), descobrir se aluno tem acesso ao Hotmart. Sem isso, aluno avulso (recebeu zip por email/grupo, sem mini-curso comprado) escolhia Modo A por intuição → caía em deadlock (sem login Hotmart pra ver os vídeos).

⚠️ **Formatação Princípio 17:** parágrafo contínuo, sem hard-breaks artificiais.

```
"Antes da gente decidir o ritmo: você tem o **mini-curso OpenClaw v2** comprado (com login no Hotmart pra acessar as aulas A0-A6) ou recebeu este kit avulso (por email, grupo, ou amigo)?

Manda:

- **'tenho'** — você tem login Hotmart, posso te oferecer o ritmo aula-por-aula com vídeos
- **'avulso'** — não tem mini-curso, eu te conduzo direto sem depender de vídeo externo

Sem julgamento — quem recebeu avulso não fica com versão pior, só pula a parte de assistir aulas."
```

**Salvar resposta em MEMORY:**

```yaml
tem_minicurso: true   # ou false
```

**Se 'avulso':**

Mensagem canonical (P15 — literal):

```
"Anotado, kit avulso. Sem julgamento.

Pra você saber: este kit faz parte do **Mini-curso OpenClaw v2** da Pixel Educação. O kit CONFIGURA seu agente — mas a LÓGICA por trás (como criar agentes do zero, automações, skills próprias, governança, debugging) é o que o mini-curso ensina.

Vai longe usando só o kit, mas vai mais longe com o curso. Se quiser aprofundar depois:

https://openclaw.pixeleducacao.com.br?utm_source=starter-kit&utm_medium=avulso&utm_campaign=v2.4.1

Por enquanto sigo direto comigo. Próxima pergunta..."
```

- Forçar `modo_jornada: wizard` (Modo B) em MEMORY — não oferece bifurcação a/b
- Salvar `pixel_cta_shown_at: {timestamp}` em MEMORY (pra debug — mostra que CTA apareceu)
- Disparar Apresentação da checklist (Modo B) IMEDIATAMENTE após — sem aguardar resposta extra

**Se 'tenho':**
- Seguir pra Bifurcação de modo abaixo (a/b)

**Se aluno responder qualquer outra coisa:** repetir pergunta literal (P15) — não improvisar.

## Bifurcação de modo (só se `tem_minicurso: true`)

Antes de apresentar a checklist, perguntar como aluno prefere fazer:

```
"Beleza, você tem o mini-curso. Como prefere fazer:

a) Assistindo as aulas em paralelo — você assiste aula sobre X no Hotmart, volta aqui e configura X. Próxima aula, próximo módulo.

b) Direto comigo, sem aulas agora — eu te guio pelo essencial em ~30min. Você assiste aulas depois pra aprofundar.

Manda 'a' ou 'b'. Sem certo nem errado."
```

Salvar resposta em `MEMORY.md` como `modo_jornada: aula | wizard`.

⚠️ **kit v2.5 — Regra de matching pra Bifurcação a/b** (fix Helena stress test):

| Resposta do aluno | Ação |
|---|---|
| `a` ou contém "aula" / "video" / "Hotmart" / "pra aprofundar" | Salva `modo_jornada: aula`, segue |
| `b` ou contém "wizard" / "direto comigo" / "sem aula" / "rápido sem video" | Salva `modo_jornada: wizard`, segue |
| Comando canonical (`sobre`, `faq`, `cancela`, `pula`, etc) | Honra (P13) — depois repete literal a pergunta |
| Pergunta tangencial sobre o kit | Responde 1 linha + repete literal a pergunta |
| **Qualquer outra coisa ambígua** ("faz o que for mais rápido", "sei lá", "decide você") | **REPETE pergunta LITERAL** + 1 frase pedindo escolha. NÃO infere `b` por similaridade ("rápido" ≈ wizard). NÃO escolhe default automaticamente. P15 + P7 — em dúvida, perguntar. |

**Falha real (Helena stress test 03/05 madrugada):** "faz o que for mais rápido" tende a ser interpretado como `b` (wizard ~30min vs aula-por-aula mais longo). É decisão sensata, mas viola P15 (canonical literal) + P7 (em dúvida, perguntar). v2.5 explicita: nunca inferir, sempre repetir.

**Padrão de mensagem ao repetir após resposta ambígua:**

```
"Não consegui escolher entre 'a' e 'b' pela sua resposta. {1 frase de esclarecimento contextualizado, ex: 'Mais rápido' bate com (b) (~30min comigo, sem aulas). Mas como tem várias formas de 'rápido', prefiro confirmar.}

{repete pergunta literal a/b acima}"
```

Aluno pode mudar a qualquer momento mandando "muda modo" (ver `references/comandos-canonicos.md` → comando 8).

### ⚠️ Comandos canonical aceitos durante essa pergunta de bifurcação (v1.8 / kit v2.2.1)

Aluno pode mandar coisas além de `a` ou `b`. Tratar conforme:

| Comando | Ação |
|---|---|
| `sobre` | Carregar `../../../manifesto.md` (Carta do Bruno em primeira pessoa) + **REPETIR LITERAL** a pergunta de bifurcação no fim ("Manda 'a' ou 'b'. Sem certo nem errado.") |
| `faq` | Carregar `../../../FAQ.md` + repetir LITERAL a pergunta de bifurcação |
| Pergunta tangencial sobre o kit (ex: "isso é seguro?", "preciso pagar?") | Responder em 1 linha + repetir LITERAL a pergunta |
| Desvio total (ex: "como funciona memória semântica?") | Anotar em `## Perguntas pendentes` em MEMORY.md + repetir LITERAL a pergunta |

**Padrão de repetição da pergunta após desvio:**

```
[conteúdo do sobre/faq/resposta tangencial]

---

Volta pra pergunta: você prefere assistindo as aulas em paralelo (a) ou direto comigo sem aulas (b)?

Manda 'a' ou 'b'. Sem certo nem errado.
```

⚠️ **Falha real (Bruno conta nova v2.2, 03/05 noite):** após mostrar `sobre`, agente improvisou fechamento "Bora começar pelo passo 0 ou ir direto pro passo 1?" em vez de repetir a pergunta original de bifurcação. Aluno ficou perdido — jornada truncada. v2.2.1 corrige com instrução explícita acima (P15+P13 aplicados ao fluxo de bifurcação).

⚠️ **Outra falha real (Bruno mesma sessão):** boas-vindas universal apareceu DUPLICADA — agente mandou a oficial + a "Versão curta (primeira mensagem)" do `manifesto.md` em sequência. Causa: legado do design pré-v2.2 (manifesto tinha "Versão curta" pra ser primeira mensagem; quando Boas-vindas universal foi criada na onboarding-checklist v1.6, a Versão curta deveria ter sido removida do manifesto e não foi). v2.2.1 remove a Versão curta. Manifesto agora tem SÓ a Carta do Bruno (Versão completa, carregada via `sobre`).

### Modo A — Aula por aula (REESCRITO em v1.9 / kit v2.3)

⚠️ **Modo A v2 — kit v2.3:** estrutura agora **espelha as aulas do mini-curso 1:1** (A0, A1, A2, A3, A4, A5, A6) — não os "passos do kit" de antes. Cada aula tem submenu próprio com configuração específica do tópico daquela aula. Aluno nunca confunde "passo do kit" vs "aula do curso" — é o mesmo número.

**Como funciona:**

1. Renderizar checklist visual de **aulas** (não de passos) — template em `references/checklist-template.md` (seção "Modo A v2")
2. Aluno seleciona aula via `abre A{X}` → agente carrega submenu de `references/aula-menus.md` (NOVO em v2.3)
3. Submenu pode ter 1 ou múltiplos módulos (ex: A4 tem 3 — autonomia + workspace + conectar)
4. Aluno escolhe fazer tudo de uma vez OU um por vez OU pausar (controle granular)
5. Aulas pré-req (A1, A3) ganham submenu de "consolidação" — sem config nova, mas com pergunta-âncora opcional
6. Aula A6 (debug) vira referência permanente — sem config, acessível via `ajuda` futuro

**Comandos canonical novos** (ver `references/comandos-canonicos.md` 9-12):

- `abre A{X}` — abrir submenu da aula
- `vi A{X}` — marcar aula como assistida (rápido pra pré-req e A6)
- `vou assistir A{X}` — auto-pause (agente "espera junto" enquanto aluno assiste vídeo)
- `travei na A{X}` — ajuda contextual durante o vídeo

**Reforço pedagógico** (mantido da v1):
- Agente sempre recomenda assistir TODAS as aulas (não pular)
- Em aulas pré-req (A1, A3), recomendação é mais leve ("você já fez na prática, mas vale assistir pra consolidar")

**Aluno controla ritmo:** assiste aula → `abre A{X}` ou `vi A{X}` → submenu → escolhe ritmo de configuração → assiste próxima aula.

**Detalhes completos:** `references/aula-menus.md` (mapeamento aula → submenu + comandos canonical detalhados).

**Passo 0 invisível em Managed (kit v2.3):** se Fase Pré-Zero detectou `ambiente: managed` E `managed_has_openai_envvar: true`, **A0 NÃO aparece como item de configuração na checklist** (fica como "✓ Áudio já tá funcionando — sua chave OpenAI veio do setup Managed"). Smoke test ainda roda quando aluno mandar áudio, mas sem aparecer como passo separado. Reduz fricção mental ("o que tem nesse passo 0?"). Em VPS root e local-dev, A0 aparece normal.

### Modo B — Wizard direto

- **Sem checklist visível durante** a jornada
- **Sem números de passos** ("passo 1, 2, 3" desaparecem)
- **Conversação fluida** — agente conduz como tutor real
- **Templates da Amora como referência** pra acelerar decisões (`exemplos/` opt-in via comando "exemplo")
- **Resumo aparece só no final** (mostra o que foi construído)

Por baixo, **mesma estrutura** (mesmas skills filhas, mesmo dependencias.md). Só muda apresentação.

## Apresentação da checklist (modo A apenas)

Renderizar checklist visual (template em `references/checklist-template.md`):

```
=== Antes da gente começar (5min, opcional) ===

[ ] 0. Chave OpenAI API (pra Whisper transcrever áudios)   👤 5min
       — manda "pulo" pra deixar pra depois

=== Comece sua jornada por aqui — total estimado: ~37min ===

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

Esperar resposta do aluno.

## Despacho de wizards

Conforme aluno aceita cada passo, despachar:

| Passo | Wizard | Marca em MEMORY ao concluir |
|---|---|---|
| 0 | `wizard-whisper-quick` (pré) | `whisper_configured=true` |
| 1 | `wizard-agente` | `agente_configured=true` |
| 2 | `wizard-aluno` | `aluno_configured=true` |
| 3 | `wizard-autonomia` | `autonomia_liberada=true` |
| 4 | `wizard-workspace` | `workspace_organizado=true` |
| 5 | `wizard-conectar` | `conectado=true` |
| 6 | `primeira-vitoria` | `first_win_completed=true` |

Cada wizard executa seu fluxo independente. Quando termina, retorna controle pra `onboarding-checklist`, que:

1. Marca [x] no item correspondente
2. Roda pergunta-âncora do passo
3. Renderiza checklist atualizada
4. Pergunta se aluno quer seguir pro próximo passo

## Pergunta-âncora ao final de cada passo

Cada wizard, ao terminar, dispara uma pergunta-âncora padronizada (mapa em `references/mapa-aulas.md`).

Estrutura padrão:

```
"Rapidão antes de fechar este passo: {pergunta}"

[espera resposta do aluno]

"{validação curta — 2 frases}.

Se quer aprofundar {tema do passo}, a aula que detalha isso é a {AULA-X}
— manda 'aula {X}' que eu te passo o link.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo {N} como feito. Bora pro {N+1}?"
```

Mapa completo das perguntas-âncora ↔ aulas: `references/mapa-aulas.md`.

## Comandos canônicos

14 comandos canonical (detalhe completo em `references/comandos-canonicos.md`):

| # | Comando | Função |
|---|---|---|
| 1 | "voltar N" / "refazer N" | Re-disparar wizard do passo N |
| 2 | "pulo" / "deixa pra depois" | Marcar passo como skipped, avançar |
| 3 | "cancelar" / "deixa quieto" | Pausar checklist |
| 4 | "reativa jornada" / "continuar" / "retomar" | Retomar checklist do ponto onde parou |
| 5 | "sobre" | Mostrar manifesto expandido |
| 6 | "exemplo" | Mostrar template do Bruno/Amora pra inspiração |
| 7 | "faq" | Carregar FAQ do starter-kit |
| 8 | "muda modo" | Trocar entre modo aula (A) e wizard (B) |
| 9-12 | "abre/vi/vou assistir/travei na A{X}" | Comandos Modo A v2 (kit v2.3) |
| 13 | **"ajuda"** (kit v2.4) | Menu completo de comandos disponíveis |
| 14 | **"config"** (kit v2.4) | Menu pra mudar elementos do setup |

Resumo dos 5 originais (detalhe abaixo):

### "voltar [N]" / "refazer [N]" / "muda [campo]"

Re-disparar wizard do passo N. Antes de re-executar, perguntar:
- "Quer editar trecho específico ou refazer do zero?"

Se editar: passar contexto pro wizard pra modo edição (preserva o que aluno não pediu pra mudar).

Se refazer: backup timestamped do estado atual + re-executa wizard inteiro.

### "pulo" / "deixa pra depois" / "próximo"

Marcar passo como `skipped` (não `done`). Avançar pro próximo.

Se próximo passo tem dependência do que foi pulado:
```
"Antes de seguir, aviso: o passo {atual} depende do passo {pulado}.
Sem ele, o {atual} vai funcionar com fricção (ex: vou pedir aprovação
a cada coisa que faço). Quer:

a) Voltar e fazer o {pulado} agora (~Nmin)
b) Seguir mesmo assim e aceitar a fricção"
```

Mapa completo de dependências: `references/dependencias.md`.

### "cancelar" / "deixa quieto" / "fecha o tour"

Pausar checklist. Salvar `onboarding_paused_at_step=N` em `MEMORY.md`.

```
"Beleza, parei aqui. Você fez até o passo {N}.

Se quiser voltar, manda 'reativa jornada' que eu retomo do ponto.
Se quiser apagar de vez, manda 'nunca mais'."
```

NÃO marcar `onboarding_dismissed=true` (a não ser que aluno mande "nunca mais").

### "reativa jornada" / "volta o tour" / "guia de novo"

Re-renderizar checklist do ponto onde parou. Mostrar progresso com [x] e [→] (pulados).

```
"Bem-vindo de volta. Você parou no passo {N}.

[checklist atualizada]

Continuar daí ou prefere recapitular o que já fizemos?"
```

### "sobre" / "filosofia" / "quem fez isso?"

Carregar `references/sobre-o-kit.md` (versão expandida do manifesto).

Não interrompe jornada — depois de mostrar, perguntar "Bora voltar pro passo {N}?".

## Princípios defensivos (heredados por todos os wizards)

Todos os wizards do starter herdam estes princípios. Detalhes em `references/principios-defensivos.md`:

1. **Antes de qualquer escrita de arquivo raiz**, checar existência. Se existe, backup timestamped + confirmação dupla.
2. **Confirmação humana** em qualquer ação que modifica `.env`, executa comando de sistema, ou cria arquivo persistente.
3. **Nunca executar** comando que muda exec-policy ou security-full silenciosamente. Aluno cola no terminal manualmente.
4. **Sempre narrar** o que tá fazendo antes de fazer (modo guiado).
5. **Após cada passo concluído**, atualizar `MEMORY.md` com flag correspondente + atualizar checklist visual.

## Critérios de sucesso

A jornada está completa quando:

- [ ] Manifesto apresentado e `kit_intro_done=true`
- [ ] Pelo menos 1 passo da jornada principal completado
- [ ] Aluno respondeu pelo menos 1 pergunta-âncora (não monólogo)
- [ ] `MEMORY.md` reflete estado consistente (todas as flags dos passos completados)
- [ ] Pelo menos 1 ponte pra aula ou grupo de apoio foi oferecida

A jornada está SEM SUCESSO se:

- Aluno cancelou no passo 0 ou 1 (sinal de friction excessiva — investigar)
- Algum wizard quebrou e jornada parou no meio sem retomada
- `MEMORY.md` ficou em estado inconsistente (passo marcado [x] mas flag não setada)

## Erros comuns

- **Pular fase zero de detecção de ambiente:** ignorar workspace populado e sobrescrever arquivos do aluno antigo. Destruidor de produto.
- **Apresentar checklist sem manifesto:** aluno entra direto na lista, não entende o que é o kit, fica frio. Manifesto cria conexão emocional.
- **Não respeitar comando "pulo":** insistir que aluno faça o passo é UX abusiva. Pular é direito.
- **Esquecer pergunta-âncora:** aluno termina passo sem absorver. Suporte explode com perguntas básicas depois.
- **Renderizar checklist sem ETA total:** aluno não sabe tamanho do compromisso, ansiedade.
- **Despachar wizard sem confirmar próximo passo:** correr no automático tira agência do aluno.

## Referências

### Internas (references/)
- `manifesto-abertura.md` — versão curta do manifesto (primeira mensagem)
- `sobre-o-kit.md` — versão expandida (carregada via "sobre")
- `comandos-canonicos.md` — patterns dos 8 comandos
- `checklist-template.md` — template visual da checklist (modo A)
- `dependencias.md` — quais passos dependem de quais
- `mapa-aulas.md` — pergunta-âncora ↔ aula correspondente
- `arquivos-raiz.md` — documentação dos 8 arquivos raiz
- `sistema-de-mapas.md` — padrão MAPA distribuído
- `principios-defensivos.md` — 12 princípios universais de segurança
- `padrao-exemplos-opt-in.md` — UX design do comando "exemplo"
- `arquivamento-pos-jornada.md` — o que arquivar quando aluno pede
- `prompt-upgrade-para-aluno-antigo.md` — entregue no Cenário B (workspace populado)

### Externas (no kit, fora da skill)
- `starter-kit/exemplos/` — 5 templates da Amora pra opt-in via "exemplo"
- `starter-kit/FAQ.md` — perguntas frequentes (carregado via "faq")
- `starter-kit/templates/` — templates raiz `.template` que wizards usam pra criar arquivos novos

## Evals

3 cenários testados em `evals/evals.json`:

1. **Aluno linear:** novo, faz tudo na ordem, sem pular
2. **Aluno que pula passos:** pula passo 3, chega no 5 com fricção, agente avisa
3. **Aluno que cancela e volta:** cancela no passo 2, volta 2 dias depois, retoma corretamente
4. **Workspace populado:** aluno antigo, agente recusa elegante e entrega prompt de upgrade
