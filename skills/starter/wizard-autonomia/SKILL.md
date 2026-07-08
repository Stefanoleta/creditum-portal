---
name: wizard-autonomia
status: ATIVO
category: starter
owner: aluno
version: 1.7
mode: guided
estimated_time: 5min (manual no terminal — Managed CLI ou SSH VPS root)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "libera autonomia" / "ativa yolo" / "configura exec-policy", OR when dispatched by onboarding-checklist as passo 3. Guides student to manually run `openclaw exec-policy preset yolo` in the appropriate terminal (Princípio 3 — agent NEVER executes privilege elevation silently). Detects current state first via `openclaw exec-policy show`. **v1.7 (kit v2.5.2 — fix Adrylan P14 violado): header ganha bloco "P14 EXTRA-RÍGIDO" obrigando 3 mensagens em ordem (anúncio + comando → output literal → interpretação) na validação `openclaw exec-policy show`. Caso real Adrylan 13:57: bot anunciou validação e depois "exec-policy yolo confirmado" sem mostrar comando nem output. v2.5.2 obriga: passo 2 (output) NUNCA pode ser pulado.** v1.6 (kit v2.5 — stress test Letícia): caminho local-dev (Mac/Linux dev) ganha seção própria (2c) em vez de "tratar igual VPS root". Razão: aluno em Mac dev NÃO é root, aviso "porque você é root" + referência ao Pixel AI Hub (VPS hardening) confunde. v2.5 separa copy adequada ao contexto dev (sem aviso de root, sem Pixel AI Hub, sem SSH).** v1.5 (kit v2.2): header com Princípios 13/14/15 explícitos no topo. v1.3-1.4: BIFURCAÇÃO POR AMBIENTE (Managed vs VPS root). Salva flag `ambiente:` em MEMORY.md.
---

# Wizard Autonomia — Passo 3 (Liberar exec-policy yolo)

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
> **P14 — Smoke tests visíveis.** `openclaw exec-policy show` SEMPRE mostra (1) comando exato em bloco de código, (2) output literal em bloco de código, (3) só DEPOIS interpreta. Sem evidência = ABORTA e pede ajuda. NUNCA finge que rodou.
>
> **P15 — Mensagens `<canonical>` literais.** A copy da pergunta de detecção (Managed vs ROOT) é CANONICAL — usar LITERAL na linguagem do aluno. Não reformula, não substitui pelos termos técnicos antigos.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — Telegram faz word-wrap natural.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).
>
> ⚠️ **P14 EXTRA-RÍGIDO nesta skill (kit v2.5.2 — fix Adrylan):** validação `openclaw exec-policy show` foi violada repetidamente em testes reais (caso Adrylan 13:57 — bot disse "vou checar exec-policy" e depois "exec-policy yolo confirmado" SEM mostrar comando nem output). REGRA: cada validação tem 3 mensagens em ordem:
>
> 1. **Anúncio + comando:** "Vou checar exec-policy: `openclaw exec-policy show`"
> 2. **Output literal:** "Output: ```yolo``` (ou ```ask```)"
> 3. **Interpretação SÓ DEPOIS:** "✓ exec-policy = yolo, autonomia liberada"
>
> **NUNCA pular passo 2.** Se output não disponível, ABORTA + reporta honesto. NÃO finja sucesso.

> 🔴 **DETECÇÃO DE AMBIENTE OBRIGATÓRIA — antes de qualquer instrução de terminal (v1.4 / kit v1.9.2):**
>
> Este wizard tem 2 caminhos completamente diferentes dependendo de COMO o aluno instalou OpenClaw:
>
> - **Managed (instalação de 1 click no painel Hostinger)** → terminal web no painel (`hpanel.hostinger.com → OpenClaw → Abrir linha de comando (CLI)`) + mostra screenshot anexado
> - **ROOT (configurou no terminal da VPS)** → SSH que aluno já tem aberto (NÃO mencionar painel Hostinger, NÃO mostrar screenshot — vai confundir)
>
> **Sinais de ROOT/VPS** (qualquer um basta):
> - Aluno mencionou DigitalOcean, Hetzner, AWS, Vultr, Linode, Contabo, "minha VPS", "no SSH", "como root", "instalei pelo terminal"
> - Workspace em `/root/...` ou kit foi descomprimido via SSH em VPS
> - USER.md ou conversa indica perfil dev/sysadmin
>
> **Sinais de Managed:**
> - Aluno chegou via painel Hostinger, kit veio via Telegram do mini-curso
> - Workspace em `~/.openclaw/...` ou similar do Managed
> - Aluno mencionou "Hostinger", "painel", "1 click", "Managed"
>
> **Em dúvida: PERGUNTA ANTES, com linguagem que o aluno reconhece** (NÃO usar "Managed vs VPS root" como termos crus — aluno PME não conhece esses termos):
>
> ```
> "Antes de continuar, preciso saber como você instalou o OpenClaw:
>
> 1. **Managed OpenClaw** — instalação de 1 click pelo painel da Hostinger
> 2. **ROOT** — você configurou pelo terminal da sua VPS
>
> Manda 1 ou 2."
> ```
>
> **Razão da copy:** "Managed vs VPS root" como termos crus não são reconhecíveis pra aluno PME. "Instalação de 1 click vs configurou pelo terminal" é o que o aluno reconhece da própria experiência de compra/setup.
>
> Salvar a detecção em `MEMORY.md`:
> ```
> ambiente: managed | vps-root | local-dev
> ```
>
> Esta flag vira fonte de verdade pros wizards seguintes (`wizard-conectar` também tem caminhos diferentes). Onda 12 vai formalizar isso na `onboarding-checklist` mestre — por enquanto, cada wizard que tem caminho ramificado detecta sozinho.

## Promessa

Em ~5min, aluno transforma "agente que pede aprovação a cada coisinha" em "agente que executa direto e te avisa". Sem isso, a partir do passo 4 (workspace), aluno é interrompido a cada criação de pasta/arquivo/comando.

Este passo é o ÚNICO em que aluno cola comando no terminal manualmente. O agente NÃO executa esses comandos. Razão: Princípio 3 (comandos de elevação de privilégio jamais via agente).

⚠️ **Onde rodar o comando depende do ambiente** (detectado acima):
- **Managed Hostinger:** terminal web no painel (tutorial passo-a-passo abaixo, seção 2a)
- **VPS root:** SSH que aluno já tem aberto (instrução curta, seção 2b)

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 3

**Trigger explícito (standalone):**
- "libera autonomia"
- "ativa yolo"
- "configura exec-policy"
- "tira o ask"

**NÃO disparar se:**
- `autonomia_liberada=true` em `MEMORY.md` E `openclaw exec-policy show` retorna `yolo`

## Princípio 11 — Detecção antes de pedir

Antes de pedir aluno fazer nada, agente lê o estado atual:

```bash
openclaw exec-policy show
```

### 3 estados detectáveis

| exec-policy atual | Ação |
|---|---|
| `yolo` | "✓ Já liberado. Não precisa fazer nada nesse passo." (vai pra pergunta-âncora) |
| outro valor (`ask`, default, etc) | Fluxo normal (1 comando) |
| comando falha (sem CLI no path) | Investigar (provavelmente OpenClaw não instalado ou aluno em path errado) |

### Mensagem padrão ao detectar tudo já liberado

```
"✓ Detectei que sua autonomia já tá liberada (exec-policy: yolo).
Eu executo direto e te aviso. Se algo errado, reverto.

Vou direto pra pergunta-âncora.

[pergunta-âncora abaixo]"
```

## Fluxo principal (modo manual)

### 1. Narrar promessa + por que é manual

```
"Vamos liberar sua autonomia. Sem isso, a partir do próximo passo
você vai se irritar — eu vou pedir aprovação a CADA coisa que faço:
'posso criar essa pasta?', 'posso salvar esse arquivo?', 'posso
executar esse comando?'.

Com autonomia liberada (modo yolo), eu executo direto e te aviso ao
final. Se algo errado, reverto.

Atenção importante: ESSE passo você faz manual. Eu te passo 1 comando,
você cola no terminal web do Managed e roda.

Por que manual? Segurança. Comando que aumenta minha permissão
não pode partir de mim — esse design protege você se eu fosse
hackeado. Você tem palavra final.

É reversível: a qualquer momento você roda `openclaw exec-policy reset`
e eu volto a pedir aprovação a cada ação.

Bora?"
```

### 2. Tutorial — abrir terminal (BIFURCADO POR AMBIENTE — v1.3)

⚠️ **Use seção 2a OU 2b conforme `ambiente:` detectado no topo deste wizard. NUNCA mostre as duas pro mesmo aluno.**

#### 2a. Caminho Managed Hostinger

Aluno PME tipicamente nunca usou terminal. Isso aqui é a parte mais sensível do kit. Caminho EXATO no Hostinger.

**⚠️ Agente:** ao enviar a mensagem abaixo, ANEXE também o arquivo `screenshots/painel-hostinger-cli.jpg` (relativo a esta skill). Se a bridge do Telegram não suportar `sendPhoto`, mande o link raw permanente como fallback (já incluído no texto).

```
"Antes do comando, abre o terminal do seu OpenClaw Managed.
Sem SSH, sem Docker — é tudo no painel da Hostinger.

Caminho exato (2 cliques):

1. Abre https://hpanel.hostinger.com/ (logado)
2. Sidebar esquerda → clica em **OpenClaw** (ícone de garra,
   fica abaixo de VPS)
3. Na lista dos seus OpenClaws → embaixo do nome da sua instância
   tem um link **'Abrir linha de comando (CLI)'** → clica aí
4. Abre janela com terminal preto. Aguarda 2-3s até aparecer o
   prompt (algo tipo `$ `, indicando que tá pronto)

📷 [foto do painel mostra as 2 setas dos cliques — anexada acima]

Se a foto não chegou, é só esse link:
https://raw.githubusercontent.com/okjpg/repo-amora-cos/main/memory/curso-openclaw-v2/starter-kit/skills/starter/wizard-autonomia/screenshots/painel-hostinger-cli.jpg

Quando estiver com a janela aberta e o prompt visível, (quando quiser ir mais fundo em segurança VPS, tá no Pixel AI Hub)
'terminal aberto' aqui."
```

**Esperar aluno responder.** Se tentou e travou, ver "Caminho alternativo Managed: aluno não acha o terminal" abaixo.

#### 2b. Caminho VPS root

Aluno root em VPS já tem terminal/SSH aberto. **NÃO mostrar screenshot do painel Hostinger** (vai confundir, painel não existe). **NÃO mencionar `hpanel.hostinger.com`**. Instrução curta:

```
"Você já tá num terminal SSH como root na sua VPS, então pula
a parte de 'abrir terminal' — usa o que você já tem aberto.

⚠️ Aviso de segurança extra (porque você é root):
o modo 'yolo' libera eu executar direto SEM pedir aprovação. No
Managed isso fica contido no container do OpenClaw. Aqui na sua
VPS, eu sou root também — em teoria, posso tocar em qualquer coisa
do sistema se sair do escopo do workspace.

Eu continuo dentro do meu workspace (não saio dele) e narro tudo.
Mas se quiser blindar (rodar OpenClaw como user não-privilegiado,
firewall, etc), a Pixel AI Hub (VPS hardening avançado vai pra lá, fora do mini-curso) cobre. Manda
'pixel ai hub' depois quando quiser explorar trilha avançada.

Pra rodar o comando de yolo, veja a próxima mensagem."
```

(Pula a parte de "manda 'terminal aberto'" — aluno já tá no terminal.)

#### 2c. Caminho local-dev (kit v2.5 — fix Letícia stress test)

⚠️ **NOVO em v2.5:** local-dev (Mac/Linux dev local — não Managed, não VPS root) ganha caminho próprio em vez de "tratar igual VPS root". Razão: aluno em Mac dev NÃO é root e NÃO tem Pixel AI Hub (VPS hardening) como referência relevante. Mensagem de "porque você é root" no caminho 2b confunde aluno dev local.

**Quando aplicar:** `ambiente: local-dev` em MEMORY (setado pela Fase Pré-Zero da onboarding-checklist).

**Mensagem canonical (P15):**

```
"Você tá rodando OpenClaw em ambiente dev local (Mac ou Linux desktop). Vou te passar o comando, você cola no terminal que você já tem aberto na sua máquina:

```
openclaw exec-policy preset yolo
```

Depois manda 'liberado' aqui que eu valido."
```

**Diferenças vs caminho VPS root (2b):**

- ❌ NÃO inclui aviso "porque você é root" — aluno dev local não é root
- ❌ NÃO menciona Pixel AI Hub (VPS hardening) — irrelevante pra dev local
- ❌ NÃO instrui SSH — terminal já está local
- ✅ Comando idêntico (`openclaw exec-policy preset yolo`)
- ✅ Validação idêntica (`openclaw exec-policy show` — P14)

(Pula a parte de "manda 'terminal aberto'" — aluno já tá no terminal local.)

**Falha real (Letícia stress test 03/05 madrugada):** caminho 2b "VPS root" incluía `Aviso de segurança extra (porque você é root)` + referência ao Pixel AI Hub — Letícia em Mac M2 não é root, leu mensagem e ficou confusa. v2.5 separa caminho próprio com copy adequada ao contexto dev.

### 3. Passar comando

Quando aluno mandar "terminal aberto":

```
"Beleza. Cola este comando no terminal (Cmd+V no Mac, Ctrl+V no
Windows/Linux) e dá Enter:

  openclaw exec-policy preset yolo

Ele faz uma coisa: muda meu modo de 'ask' (perguntar antes) pra
'yolo' (executar direto e narrar).

Vai aparecer alguma saída no terminal — geralmente uma confirmação
tipo 'exec-policy updated to yolo' ou similar.

Quando rodar, copia a saída do terminal (CTRL+A, CTRL+C) e cola
aqui. Assim eu confirmo que pegou no terminal certo.

Ou só manda 'feito' se preferir mais rápido."
```

### 4. Validar comando

Quando aluno mandar "feito" ou colar output:

```bash
openclaw exec-policy show
```

| Resultado | Ação |
|---|---|
| Retorna `yolo` | "✓ Confirmei. exec-policy = yolo. Autonomia liberada." (segue pra confirmação final) |
| Ainda `ask` ou default | "Hm, não pegou. Pode ter rodado em terminal errado. Confere se a janela do terminal aberta tem o nome do seu OpenClaw no topo (ex: 'paleturquoise-flamingo-449562'). Tenta de novo: cola `openclaw exec-policy preset yolo` e Enter." |
| Erro `command not found` | "Parece que o `openclaw` CLI não tá no path desse terminal. Confere o caminho: o terminal que você abriu é mesmo o **'Abrir linha de comando (CLI)'** dentro do menu OpenClaw da Hostinger? (não é terminal local do seu computador)" |

### 5. Confirmação final ao aluno

```
"✓ Pronto. exec-policy = yolo.

A partir de agora, comportamento novo:

ANTES (modo ask):
  Você: 'cria um post sobre X'
  Eu: 'posso criar /workspace/content/drafts/post-X.md?'
  Você: 'pode'
  Eu: 'criado. Posso buscar referências no Brave?'
  Você: 'pode'
  ...irritante.

AGORA (modo yolo):
  Você: 'cria um post sobre X'
  Eu: '[criei post + busquei 3 fontes + salvei research]
       Post no caminho /workspace/content/drafts/post-X.md.'
  Sem fricção.

Pra desfazer a qualquer momento:
  openclaw exec-policy reset

(no mesmo terminal do Managed)

E se quiser revisar tudo que fiz no automático, manda 'mostra log'."
```

### 6. Pergunta-âncora

Pergunta literal (mapa-aulas.md passo 3):

```
"Rapidão antes de fechar este passo: se você desfizer a exec-policy
yolo daqui a pouco (rodar `openclaw exec-policy reset`), o que volta
a acontecer?"
```

| Resposta esperada | Validação |
|---|---|
| "vai pedir aprovação" / "volta o ask" / similar | "Exato. Eu volto a perguntar 'posso?' a cada coisa que faço — criar arquivo, salvar, executar comando. É reversível." |
| Errou | "Vou voltar a pedir aprovação a CADA ação. É reversível — você pode desligar e religar a hora que quiser. Útil pra quando você quer fazer algo sensível e não confia em mim sozinho." |

Fechar com:

```
"Se quer aprofundar segurança no Managed (níveis de exec-policy,
isolamento de containers, audit log), a aula que detalha isso é a
Aula 10 (Instalando 1password — segurança Managed) — manda 'aula 10' que eu te passo o link.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 3 como feito. Bora pro passo 4 (organizar o workspace)?"
```

### 7. Atualizar MEMORY.md

```markdown
## Flags
autonomia_liberada: true
exec_policy: yolo

## Decisões da jornada
- {data}: Liberou autonomia. exec-policy=yolo. Aluno autorizou explicitamente via terminal Hostinger.
```

Atualizar `onboarding_current_step: 4`.

### 8. Devolver controle pra onboarding-checklist

## Caminho alternativo: aluno não acha o terminal

Se aluno disser "não tô achando OpenClaw no menu" / "não vejo 'Abrir linha de comando'":

**Tentativa 1** — sugerir 3 causas comuns:

```
"Alguns motivos comuns:

1) Você tá num painel diferente do hpanel.hostinger.com
   — Confirma que tá em https://hpanel.hostinger.com/ (não em
     hosting.com.br ou similar).

2) Seu OpenClaw ainda não foi provisionado
   — No menu OpenClaw, se aparecer 'Configuração pendente' em
     vez de 'Abrir linha de comando', você precisa clicar em
     'Configurar' primeiro e completar o provisionamento.

3) Idioma do painel diferente
   — Em inglês: 'Open command line (CLI)'. Em espanhol:
     'Abrir línea de comandos'. Procura o link equivalente.

Qual desses bate com o que você tá vendo?"
```

**Tentativa 2** — se aluno ainda travado:

```
"Manda uma foto da tela do menu OpenClaw que você tá vendo.
Eu olho e te digo onde clicar.

OU vai direto no grupo @cursoopenclaw — galera responde em
<5min e quem já passou por isso ajuda visualmente."
```

Se travado por 10+ min, pausar:

```
"Vou pausar esse passo. Manda 'reativa jornada' quando o
terminal estiver aberto. Os passos 4-6 esperam você."
```

Marca `paused_at_step=3`. Aluno volta depois.

## Caminho alternativo: aluno se assusta com 'yolo'

Algumas pessoas leem 'yolo' e ficam preocupadas. Se aluno expressar dúvida:

```
"Entendo a preocupação. 'yolo' soa agressivo, mas o nome é só convenção
do OpenClaw — vem de 'You Only Live Once' (gíria que ficou). Na prática:

- Eu continuo dentro do seu workspace (não saio dele)
- Eu narro tudo que faço (você vê o log em tempo real)
- Você pode desligar com 1 comando: `openclaw exec-policy reset`
- Backups automáticos cobrem se algo der errado (passo 5 ativa
  backup-workspace-github)
- Não é 'sudo', não é root — é só 'menos perguntas dentro do escopo
  permitido'

A alternativa é manter 'ask' (default) — mas aí cada ação minha vira
3 mensagens entre nós. Vira chato em 5 minutos.

Quer prosseguir? Ou prefere ler a Aula 10 antes (5min) pra entender
melhor a fundo?"
```

## Critérios de sucesso

- [ ] `openclaw exec-policy show` retorna `yolo`
- [ ] `autonomia_liberada=true` em `MEMORY.md`
- [ ] `exec_policy=yolo` salvo em `MEMORY.md`
- [ ] `onboarding_current_step=4`
- [ ] Pergunta-âncora respondida
- [ ] Aula 10 mencionada

## Erros comuns

- **Aluno cola comando no Telegram em vez do terminal:** detectar quando aluno manda `openclaw exec-policy preset yolo` como mensagem. Resposta: "Esse comando vai NO TERMINAL (terminal web do Managed Hostinger), não aqui no chat. Cola lá e me avisa quando rodou."
- **Aluno cola no terminal local do laptop em vez do terminal Hostinger:** validação `openclaw exec-policy show` falha. Reforçar instrução: "É no terminal **dentro do painel Hostinger** (Menu OpenClaw → Abrir linha de comando)".
- **Aluno tem `openclaw` desatualizado no terminal:** se comando retorna erro de flag não reconhecida, sugerir `openclaw --version` e atualizar via Hostinger.
- **Aluno fica desconfortável com permissões:** sempre oferecer alternativa (manter `ask` + chamar agente caso a caso). Não forçar.
- **Aluno achou que ia ser automático:** explicar Princípio 3. "Esse é o único passo manual. Foi de propósito — segurança."

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 2 (confirmação humana):** EXAUSTIVA aqui. Aluno tem que abrir terminal + colar comando + confirmar.
- **Princípio 3 (NUNCA elevação via agente):** este passo É a aplicação canônica do Princípio 3. Agente JAMAIS roda `exec-policy preset yolo` por conta própria. Sempre passa o comando pro aluno colar no terminal.
- **Princípio 4 (narrar antes de fazer):** explica O QUE o comando faz e POR QUE manual antes de pedir.
- **Princípio 5 (atualizar MEMORY ao concluir):** marca `autonomia_liberada=true` + `exec_policy=yolo`.
- **Princípio 9 (parar se algo der errado):** se aluno trava 2x em comando, pausa o passo (não fica em loop). Sugere foto da tela ou grupo.
- **Princípio 11 (detectar antes de pedir):** roda `openclaw exec-policy show` ANTES de pedir aluno fazer nada. Se já liberado, pula direto pra pergunta-âncora.

## Modo A vs Modo B

**Modo A:**
```
"Bora pro Módulo 3 — Liberar autonomia.
Aula correspondente: Aula 10 (Instalando 1password — segurança Managed).
Recomendo MUITO assistir antes — esse passo mexe em segurança e
você precisa entender o tradeoff entre conveniência e controle."
[fluxo numerado: tutorial Hostinger + 1 comando + validação]
```

**Modo B:**
```
"Próxima coisa: liberar pra mim trabalhar sem te incomodar a cada
ação. Um comando só. Vou te guiar passo-a-passo."
[fluxo conversacional, mesma sequência sem numeração]
```

## Comando "exemplo" neste contexto

Aluno pode pedir "exemplo" pra ver o que muda na prática:

```
"Exemplo prático do que muda:

ANTES (com 'ask' default):
  Você: 'cria um post sobre X'
  Eu: 'posso criar /workspace/content/drafts/post-X.md?'
  Você: 'pode'
  Eu: 'criado. Posso buscar referências no Brave?'
  Você: 'pode'
  Eu: 'busquei 3 fontes. Posso salvar em research/?'
  Você: 'pode'
  ...3 minutos depois pra um post simples

DEPOIS (com 'yolo'):
  Você: 'cria um post sobre X'
  Eu: '[criei post + busquei 3 fontes + salvei research]
       Post no caminho /workspace/content/drafts/post-X.md.
       Quer que eu mostre?'

Mesma operação. Sem fricção.

Quer prosseguir liberando, ou tá com dúvida ainda?"
```

## Referências

### Internas
- Princípios universais (especialmente Princípio 3): [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)
- Decisão D18 (autonomia antes de workspace): [`../../../../DECISOES-ARQUITETURA.md`](../../../../DECISOES-ARQUITETURA.md)
- Pergunta-âncora oficial: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 3)

### Externas
- OpenClaw exec-policy docs oficial: https://docs.openclaw.ai/cli (e `openclaw exec-policy --help` no terminal)
- Painel Hostinger: https://hpanel.hostinger.com/ (menu OpenClaw)

## Status

✅ ATIVO desde v1.1 do Starter Kit (02/05/2026 — versão revisada com tutorial Hostinger CLI passo-a-passo após teste E2E identificar como ponto crítico de abandono).
✅ v1.2 (02/05/2026 madrugada cont. 5): screenshot anexado (`screenshots/painel-hostinger-cli.jpg`) reforça visualmente o caminho de 2 cliques no painel Hostinger. Reduz fricção do aluno mobile/iniciante.
✅ v1.3 (02/05/2026 madrugada cont. 7 / kit v1.9.1): BIFURCAÇÃO POR AMBIENTE. Detecta Managed vs VPS root no topo do wizard. Caminho Managed mantido (tutorial + screenshot). Caminho VPS root: SSH direto, sem painel Hostinger, sem screenshot, com aviso de segurança REFORÇADO (root = blast radius maior). Bruno: "no curso se for root nao pode mostrar cli do openclaw, precisa ser terminal". Quick fix antes da Onda 12 (detecção formal de ambiente na onboarding-checklist mestre).
✅ v1.4 (02/05/2026 madrugada cont. 8 / kit v1.9.2): copy da pergunta de detecção reescrita pra linguagem do aluno. Bruno: "fica confuso perguntar pro aluno se é Manage Openclaw ou VPS própria. Podemos deixar numa linguagem mais simples, tipo: Você instalou openclaw via Manage Openclaw (instalação de 1 click) ou configurou via ROOT (pelo terminal da vps)". Aplicado: pergunta agora é "1. Managed OpenClaw — instalação de 1 click no painel Hostinger / 2. ROOT — configurou pelo terminal da VPS" — termos que aluno reconhece da experiência real, não jargão de cloud.

## Roadmap

- v1.4: Detectar versão do `openclaw` CLI e adaptar comandos se sintaxe mudar
- v1.5: Suporte a Hostinger em outros idiomas (espanhol, inglês) com nomes de menu localizados + screenshot localizado
- v1.6: Após Onda 12 formalizar `ambiente:` na onboarding-checklist mestre — remover detecção redundante deste wizard (vira só ler flag de MEMORY.md)
- v2: Captura de screenshot do terminal automaticamente (se Hostinger expor API) pra confirmar que aluno tá no terminal certo sem aluno colar output
