---
name: wizard-whatsapp
status: ATIVO
category: canais
owner: aluno
version: 1.0
mode: guided
estimated_time: 15-45min (varia por modo escolhido)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4]
description: Use when student types "ativa whatsapp" / "configura whatsapp" / "quero usar whatsapp", typically AFTER finishing primeira-vitoria (next-step optional). Configures WhatsApp as additional channel beyond Telegram, with 2 modes (sessão própria / chip dedicado). Default behavior: read-only — agent only responds when EXPLICITLY mentioned/triggered, NOT to every message. Asks use case BEFORE configuring (Princípio 7 — em dúvida, pergunta).
---

# Wizard WhatsApp — Canal Opcional Pós-Vitória

## Promessa

Aluno ativa WhatsApp como canal extra do agente. NÃO substitui Telegram (que continua o canal principal — UX da checklist depende dele). Adiciona caminho alternativo pra interagir com agente quando WhatsApp é mais conveniente (mobile, mensagens curtas, áudio).

**Default crítico:** modo **read-only** — agente NÃO responde proativamente a todas as mensagens. Responde só quando aluno aciona explicitamente.

## Quando disparar

**Trigger explícito (sempre — não é trigger automático):**
- "ativa whatsapp"
- "configura whatsapp"
- "quero usar whatsapp"
- "adiciona whatsapp"

**NÃO disparar se:**
- `whatsapp_active=true` em `MEMORY.md` E sessão WhatsApp ainda válida (token não expirou)

Esse wizard NÃO é parte da jornada principal — é opcional pós-primeira-vitória.

## Pergunta zero — caso de uso ANTES de configurar (Princípio 7)

Antes de qualquer config técnica, perguntar caso de uso:

```
"Antes de mexer em WhatsApp, me conta: pra que você quer usar?

Casos comuns:

a) Eu quero mandar mensagem pro agente do meu WhatsApp pessoal
   (em vez de abrir Telegram). Mais cômodo no mobile.

b) Eu tenho um chip dedicado (ex: número de empresa) e quero o
   agente atendendo lá com regras claras.

c) Quero o agente respondendo grupos/contatos automaticamente
   (suporte, atendimento, vendas).

d) Outro — me conta.

Manda 'a', 'b', 'c' ou descreve."
```

**Por que perguntar antes:** os 3 casos precisam de SETUP DIFERENTE. Caso 'c' (resposta automática) tem riscos sérios (agente respondendo contato pessoal sem querer). Caso 'a' é mais simples. Caso 'b' é o intermediário.

### Resposta por caso

#### Caso 'a' — sessão própria (WhatsApp pessoal do aluno)

```
"Entendi. Caso A: sua sessão WhatsApp pessoal vinculada ao agente.

Implicações importantes:

✓ Você manda áudio/texto pro agente como se fosse contato seu
✓ Agente responde só PRA VOCÊ (o número que você usar pra mandar)
✗ Agente NUNCA responde outros contatos seus por padrão (read-only)
✗ Conexão depende de Linked Devices (mesma sessão do app — agente
    'lê suas mensagens', mas só responde quando você manda em chat
   1:1 contigo mesmo)

Modo correto: você cria um chat com você mesmo no WhatsApp
('Mensagem para si próprio') e usa esse chat como canal.

Tradeoff vs Telegram: WhatsApp não suporta UI visual da checklist
(botões inline, atualização in-place). Tudo vira texto plano.
A jornada principal ficou no Telegram por isso.

Quer prosseguir com setup A? Manda 'sim' ou 'mudei de ideia'."
```

#### Caso 'b' — chip dedicado

```
"Entendi. Caso B: chip dedicado (número de empresa ou separado).

Implicações:

✓ Agente atende esse número com regras claras
✓ Não mistura com seu WhatsApp pessoal (separação limpa)
✗ Custo: chip + plano (~R$ 15-30/mês) + setup ~30min

Setup envolve:
1. Você configura WhatsApp Business API ou Linked Devices nesse chip
2. Agente conecta a esse chip
3. Definimos regras: atende ou só lê? Quais contatos?

Esse caso é mais robusto pra casos PROFISSIONAIS (atendimento,
suporte). Pra uso pessoal o Caso A já basta.

Quer prosseguir com B? Manda 'sim' ou 'volto pro A'."
```

#### Caso 'c' — atendimento automático

```
"Entendi. Caso C tem RISCO sério que você precisa pesar antes
de seguir.

⚠️  RISCO: se eu respondo automático em grupos/contatos do seu
WhatsApp pessoal, posso responder por você em conversa que não
era pra mim. Casos reais já aconteceram:
 - Agente respondendo grupo de família com contexto profissional
 - Agente respondendo cliente quando aluno não queria
 - Agente vazando contexto de outras conversas

Pra fazer C com segurança:

1. Use chip DEDICADO (Caso B), não WhatsApp pessoal
2. Whitelist de contatos que agente PODE responder (lista explícita)
3. Modo de aprovação: agente sugere resposta, você aprova antes de enviar

Posso configurar C com chip dedicado + whitelist + aprovação manual.

Quer:
a) Seguir com chip dedicado + segurança extra (Caso B+ na real)
b) Voltar pro Caso A (uso pessoal seguro)
c) Pular WhatsApp por enquanto"
```

#### Caso 'd' — outro

```
"Manda detalhe do que você quer fazer. Vou avaliar se cabe num
dos modos existentes ou se precisa abordagem custom."
```

## Princípio 11 — Detecção (sempre, antes do setup técnico)

Após aluno escolher caso, antes de configurar, detectar:

```
1. WhatsApp Web/Linked Device já configurado no Managed?
2. Chip dedicado já registrado?
3. Tokens válidos no .env (WHATSAPP_SESSION_TOKEN, etc)?
```

Se já tudo pronto: marca `whatsapp_active=true` e vai pra teste.

## Fluxo Caso A (sessão própria — mais comum)

### 1. Aluno escaneia QR code

```
"Vou gerar QR code do WhatsApp Web pra você escanear.

Isso vincula a sessão do agente ao seu WhatsApp pessoal — mesma
mecânica de quando você usa WhatsApp Web no navegador.

[gera QR via openclaw whatsapp link-qr]

Abre o WhatsApp no celular →
Configurações →
Aparelhos conectados →
'Conectar um aparelho' →
Escaneia o QR.

Quando vincular, manda 'conectado' aqui."
```

### 2. Validar conexão

```bash
openclaw whatsapp status
```

Se conectado: prossegue. Se não: investigar (provavelmente QR expirou ou não foi escaneado).

### 3. Configurar regras default — read-only

```
"Configuração padrão (recomendada): MODO READ-ONLY.

O que significa:
✓ Eu LEIO todas as suas mensagens (pra você poder me invocar)
✗ Eu NUNCA respondo automaticamente
✓ Eu respondo SÓ quando você manda mensagem pra mim explicitamente
   (no chat 'Você mesmo')

Como invocar quando precisar:
- No chat 'Você mesmo' (Mensagem para si próprio): qualquer mensagem
  é uma instrução pra mim
- Em outros chats: começa mensagem com '@agente' (ou nome configurado)
   pra acionar — fora isso, fico quieta

Confirma esse modo? Ou prefere customizar?"
```

Salvar config:

```bash
openclaw whatsapp config --mode=read-only \
                          --self-chat-trigger=any \
                          --other-chat-trigger="@agente"
```

### 4. Smoke test

```
"Manda mensagem pra mim no chat 'Você mesmo' agora.

Pode ser 'oi' ou áudio curto — qualquer coisa.
Eu respondo aqui ou no WhatsApp?
"
```

Pergunta extra: "qual canal prefere pra resposta?" (default: mesmo canal — WhatsApp).

Quando aluno mandar, validar end-to-end.

### 5. Atualizar MEMORY.md

```markdown
## Flags
whatsapp_active: true
whatsapp_mode: read-only
whatsapp_caso: A (sessão própria)

## Decisões da jornada
- {data}: Ativou WhatsApp. Modo: read-only. Caso: A. Trigger em outros chats: @agente.
```

### 6. Aviso final

```
"✓ WhatsApp ativo (modo read-only).

Importantes:

🔒 Privacidade: eu vejo TODAS suas mensagens (limitação do WhatsApp Web).
   Mas só processo as que são pra mim (chat 'Você mesmo' ou @agente).
   Mensagens privadas suas com outros contatos não viram contexto meu.

⏱️  Sessão expira em ~14 dias se WhatsApp Web ficar offline. Pra renovar,
   manda 'renova whatsapp' que eu gero novo QR.

🛑 Pra desativar a qualquer momento:
   'desativa whatsapp' — agente para de processar WhatsApp imediatamente.
   Sessão Linked Device permanece (pra reativar fácil) até você desconectar
   manualmente no app."
```

## Fluxo Caso B (chip dedicado)

Mais complexo. Setup principal:

1. Aluno informa número do chip
2. Configura WhatsApp Business API ou Linked Device no chip
3. Agente conecta via API key (formato `WHATSAPP_BUSINESS_TOKEN` no `.env`)
4. Define lista de contatos que agente atende (whitelist) — opcional
5. Smoke test

Detalhes específicos do Business API ficam em `references/whatsapp-business-setup.md` (criar quando necessário).

## Fluxo Caso C (atendimento automático)

Sempre redireciona pra Caso B+ (chip dedicado + whitelist + aprovação):

```
"Pra atendimento automático seguro: chip dedicado + whitelist explícita
de contatos + modo aprovação (agente sugere resposta, você aprova antes
de enviar).

Modo aprovação evita 90% dos riscos. Você dorme tranquilo sabendo que
nada sai sem sua palavra.

Vou configurar como Caso B+ — manda 'segue B+' pra prosseguir."
```

## Critérios de sucesso

- [ ] Caso de uso identificado e confirmado pelo aluno
- [ ] Sessão WhatsApp conectada (QR escaneado OU API token válido)
- [ ] Modo correto configurado (read-only por default)
- [ ] Smoke test passou
- [ ] `whatsapp_active=true` em `MEMORY.md`
- [ ] `whatsapp_mode` e `whatsapp_caso` registrados
- [ ] Aluno informado de privacidade + expiração + comando de desativação

## Erros comuns

- **QR expirou antes de aluno escanear:** padrão WhatsApp Web (45s). Gerar novo.
- **Aluno escolheu Caso C sem entender risco:** sempre redirecionar pra B+ (Princípio 7 — em dúvida, perguntar). Não configurar atendimento automático em WhatsApp pessoal.
- **Aluno tem 2+ números:** WhatsApp Web aceita 1 sessão por dispositivo. Esclarecer qual número será o canal.
- **Sessão derrubada por outra conexão:** se aluno conectar WhatsApp Web em outro lugar, pode invalidar a sessão do agente. Avisar antes.

## Aplicação dos princípios defensivos

- **Princípio 2 (confirmação):** confirma cada escolha (caso, modo, trigger).
- **Princípio 3 (NUNCA elevação):** NÃO escala automaticamente do read-only pra atendimento sem confirmação explícita do aluno.
- **Princípio 4 (narrar antes):** explica o que cada modo FAZ antes de configurar.
- **Princípio 5 (atualizar MEMORY):** múltiplas flags (mode, caso, expiração).
- **Princípio 7 (em dúvida, pergunta):** caso C sempre cai em B+ — não assume que aluno sabe risco.
- **Princípio 11 (detectar antes):** lê estado WhatsApp antes de pedir QR.

## Decisões arquiteturais

- **D14 (Telegram-only no kit core):** WhatsApp é OPCIONAL pós-vitória. Não substitui Telegram da jornada.
- **D15 (read-only default):** modo conservador inicial. Aluno escolhe expandir se quiser.

Ver: [`../../../DECISOES-ARQUITETURA.md`](../../../DECISOES-ARQUITETURA.md)

## Referências

### Internas
- Princípios: [`../../starter/onboarding-checklist/references/principios-defensivos.md`](../../starter/onboarding-checklist/references/principios-defensivos.md)

### Externas
- WhatsApp Web FAQ: https://faq.whatsapp.com/general/download-and-installation/about-whatsapp-web
- WhatsApp Business API: https://business.whatsapp.com/products/business-platform

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Suporte a múltiplos canais simultâneos (Telegram + WhatsApp + Slack)
- v1.2: Whitelist visual no Telegram (aluno gerencia "quem agente pode responder no WhatsApp")
- v1.3: Modo aprovação manual (agente sugere → aluno aprova → envia) pra atendimento
- v2: Routing inteligente — agente decide qual canal usar baseado no tipo de mensagem
