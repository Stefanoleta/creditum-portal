---
name: onboarding-do-seu-agente
status: ATIVO
category: cheatsheet
referenced_by: [A1]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet pra setup inicial do agente OpenClaw Managed (A1). Cobre Fase A (credencial OpenAI API + crédito) · Fase B (OAuth ChatGPT via terminal) · Quick Win Telegram (Bloco 5 da A1) · prompt de onboarding canônico · 4 prompts prontos pra colar · troubleshooting comum.
---

# Onboarding do seu agente — referência rápida (A1)

## Como usar este cheatsheet

**Caminho default — siga a aula A1** (linha de produção):

A aula A1 cobre o setup completo em 16min: 2 caminhos Hostinger · 2 fases de credencial · agente respondendo · onboarding · Telegram pro Quick Win. Este cheatsheet é referência rápida pós-aula pra fixar comandos e prompts.

**Caminho de plano B — comando direto** (use quando):
- Travou em algum passo da aula
- Aluno avançado quer pular direto pra comando
- Validando setup específico

## A1 em 1 minuto (resumo executivo)

Setup completo do agente OpenClaw Managed = **2 credenciais complementares** + **2 canais de fala** + **1 prompt de auto-conhecimento**:

| Etapa | O que faz | Onde |
|-------|-----------|------|
| **Fase A — Credencial OpenAI API** | Autentica OpenClaw + libera Whisper · embeddings · memória semântica | platform.openai.com (NÃO chatgpt.com) |
| **Fase B — OAuth ChatGPT Plus** | Destrava GPT 5.5/5.4 da assinatura · economiza crédito da API | Terminal Managed (1 comando) |
| **Bloco 5 — Telegram DM** | Habilita Quick Win da A4 (zip do kit não cabe no Gateway) | @BotFather + comando `channels add` |
| **Onboarding prompt** | Agente lê llms-full.txt e cria MEMORY.md de auto-conhecimento | DM ou painel |

## Fase A — Configurar credencial OpenAI API

### 1. Criar conta no `platform.openai.com` (NÃO `chatgpt.com`)

| Site | Pra que serve |
|------|---------------|
| **`platform.openai.com`** ⭐ | API + créditos pré-pagos · Whisper · embeddings · gera API key |
| `chatgpt.com` | Assinatura ChatGPT Plus (pra OAuth da Fase B) |

**Diferença crítica**: aluno PME confunde direto. Site errado = não consegue gerar API key.

### 2. Cadastrar cartão + comprar crédito (US$ 5-10 inicial)

- Painel OpenAI → Settings → Billing → Add payment method
- Compra US$ 5-10 de crédito inicial
- **Por que esse valor**: cobre Whisper + embeddings + memória semântica por meses pra aluno PME normal. Não é pra economizar 30 reais aqui

### 3. Gerar API key

- Painel OpenAI → API Keys → Create new secret key
- Copia · cola num lugar seguro temporariamente (vai precisar no passo seguinte)
- Princípio (recap A10): NÃO compartilha · NÃO commita em GitHub público

### 4. Contratar Managed OpenClaw + cupom BRUNOOKAMOTO

- Landing: [hostg.xyz/SHJMI](https://www.hostg.xyz/SHJMI)
- Aplicar cupom **BRUNOOKAMOTO**
- Aguardar provisionamento (3-5min)

### 5. Logar painel OpenClaw com API key

- Acessa painel Hostinger → menu OpenClaw → seu OpenClaw
- Cola API key no campo solicitado
- Painel ativa · agente já consegue responder usando modelo da API

**Validação Fase A**: agente respondendo no Gateway do Managed OpenClaw via API key. Pronto pra Fase B.

## Fase B — Ativar OAuth ChatGPT (segundo passo crítico)

### 1. Abrir terminal Managed pela primeira vez

- Painel Hostinger → menu OpenClaw → seu OpenClaw → **"Abrir linha de comando (CLI)"**
- Aluno PME nunca usou terminal? Tudo bem — esse é o **único comando manual** que vai colar aqui no day 1
- Princípio 3 dos defensivos: comandos de elevação de privilégio JAMAIS via agente — sempre humano cola no terminal

### 2. Rodar comando OAuth

```bash
openclaw models auth login --provider openai-codex --set-default
```

Comportamento esperado:
- Abre fluxo OAuth no navegador
- Você loga com sua conta ChatGPT Plus (a mesma da assinatura)
- Confirma autorização
- Volta pro terminal · OpenClaw confirma sucesso

### 3. Validar Fase B

```bash
openclaw models auth list   # mostra providers configurados
openclaw status              # confirma que codex provider tá default
```

Resultado esperado: agente passa a usar **GPT 5.5/5.4 da sua assinatura ChatGPT Plus via OpenAI Codex**. API key da Fase A fica como rede de segurança (Whisper + embeddings + se OAuth quebrar).

## Por que as 2 fases são complementares

| Credencial | Cobertura | Custo |
|-----------|-----------|-------|
| **API key OpenAI** (Fase A) | Whisper · embeddings · memória semântica · cai aqui se OAuth falhar | Pago via crédito pré-pago (US$ 5-10) |
| **OAuth ChatGPT Plus** (Fase B) | GPT 5.5/5.4 pra inferência principal · agentic tasks | Já incluso na assinatura ChatGPT Plus (R$ 100/mês) |

**Frase-mãe da A1:** *"API key autentica seu OpenClaw e libera Whisper + embeddings. OAuth dá acesso ao GPT 5.5 da sua subscription. Você precisa das duas — uma não substitui a outra."*

**Aluno SEM ChatGPT Plus**: pula Fase B · agente roda só com API key · paga tudo via crédito pré-pago (mais caro pra agentic). Recomendação: assinar Plus e fazer Fase B — economia significativa.

## Bloco 5 da A1 — Conectar Telegram pro Quick Win

### Por que Telegram é essencial NA A1 (não só A3)

Descoberta crítica (sessão 03/05/2026): **chat do painel Hostinger (Gateway) NÃO aceita upload de arquivo**. Pra rodar Starter Kit (A4 — joga zip no agente), aluno **precisa de Telegram DM funcionando ANTES de chegar na A4**.

A1 absorve setup BÁSICO do bot Telegram. A3 aprofunda tópicos · grupos · allowlist.

### Setup em 5 passos (~2min)

1. Abre `@BotFather` no Telegram (https://t.me/BotFather)
2. Digita `/newbot` → escolhe nome amigável + handle único (ex: `meu-agente-bot`)
3. BotFather retorna o token (formato `123456:ABC-DEF...`) — copia
4. No terminal Managed, cola:
   ```bash
   openclaw channels add --channel telegram --token <bot-token>
   ```
5. Abre seu novo bot no Telegram, manda `/start` ou qualquer mensagem · agente responde

**Validação Bloco 5**: bot respondendo no celular. Quick Win conquistado — pronto pra A4 (Starter Kit).

## Onboarding prompt canônico (Bloco 4 da A1)

Cola este prompt direto no agente (DM ou painel) **logo após Fase B completa**:

```
Leia https://docs.openclaw.ai/llms-full.txt

Em português simples me explique:
1. O que vc é e como funciona
2. O que consegue fazer hoje (canais, ferramentas, integrações)
3. O que NÃO consegue fazer (limitações reais)
4. Comandos principais que eu posso usar pra te configurar
5. Onde guarda memórias, skills, configurações e logs

Salve esse resumo em MEMORY.md como "auto-conhecimento do agente"
e me mostre o resultado.
```

Resultado: agente lê doc oficial · processa · cria `MEMORY.md` com auto-conhecimento estruturado · retorna resumo. **A-ha #1 conquistado**: *"meu agente respondeu + se conhece + tá no meu celular."*

## 4 prompts prontos pra colar

### 1. Onboarding inicial (Bloco 4 da A1)

Já documentado acima. Cola direto após Fase B completa.

### 2. Setup Telegram pro Quick Win (Bloco 5 da A1)

Cola no agente OpenClaw via Gateway (depois do onboarding):

```
Quero conectar Telegram pra eu falar com você no celular —
preciso disso antes da próxima aula (A4) porque vou jogar
um arquivo zip que o Gateway não aceita.

Me guia passo a passo:
1. Como criar bot no @BotFather (link, comandos, qual nome usar)
2. Como pegar o token
3. Comando exato pra eu colar no terminal Managed pra conectar
4. Como validar que funcionou (manda /start no bot)
5. Cuidados de segurança (token = senha do bot, recap A10)

Não preciso configurar tópicos nem grupos agora — só DM funcional
pra próxima aula. A3 aprofunda Telegram depois.
```

### 3. Validar setup completo (após Fase A + B + Telegram)

```
Faz uma validação completa do meu setup OpenClaw Managed:

1. Confirma que API key tá ativa (consigo gerar embedding de teste?)
2. Confirma que OAuth ChatGPT Plus tá conectado (rodando GPT-5.5?)
3. Confirma que Telegram tá conectado (manda /test pro bot pra eu ver)
4. Lista o que tá faltando configurar pra eu chegar na A4 (Starter Kit)

Me reporta status de cada item: OK / ATENÇÃO / FALHOU.
Princípio A10: scope mínimo · nenhum token exposto em log/chat.
```

### 4. Trocar/adicionar modelo depois (avançado)

```
Quero adicionar [Claude Opus 4 / Gemini Pro / Llama 3.2 local /
outro modelo] como opção pro meu agente.

Vai na doc oficial em https://docs.openclaw.ai/cli/config, lê:
1. Como adicionar provider novo (`openclaw config set models.providers.<X>`)
2. Como configurar modelo default vs alternativos
3. Sintaxe JSON5 pro patch correto
4. Validar que provider funciona após adicionar

Configura, valida, me mostra como vou trocar entre modelos depois.
NÃO REMOVE OpenAI default — só adiciona alternativa.

Princípios A10: scope mínimo no token do novo provider · token no
.env como known key · rotação periódica.
```

## Comandos `openclaw models` (validados na doc oficial)

| Comando | Pra que serve |
|---------|---------------|
| `openclaw models auth login --provider <id> [--set-default]` | OAuth ou API key — fluxo principal Fase B |
| `openclaw models auth list` | Lista providers configurados + qual é default |
| `openclaw models auth logout --provider <id>` | Desconecta provider específico |
| `openclaw models auth add` | Helper interativo (alternativa se OAuth web travar) |
| `openclaw models auth setup-token --provider <id>` | Fluxo via token manual (sem OAuth web) |
| `openclaw models auth paste-token` | Cola token diretamente (caso OAuth visual não funcione) |

## Comandos `openclaw config` (avançado — trocar modelos depois)

| Comando | Pra que serve |
|---------|---------------|
| `openclaw config set agents.defaults.model.primary "openai/gpt-5.5"` | Define modelo default do agente |
| `openclaw config set agents.defaults.models '{"<id>":{}}' --strict-json --merge` | Adiciona modelo à lista (não substitui) |
| `openclaw config set models.providers.<provider>.models '[...]' --strict-json --merge` | Adiciona provider externo (Ollama, OpenRouter, etc) |
| `openclaw config get` | Mostra configuração atual completa |

## Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| API key inválida no painel | Confundiu site (chatgpt.com em vez de platform.openai.com) | Volta em platform.openai.com → API keys → gera nova |
| Crédito não suficiente | Esqueceu de comprar crédito após cadastrar cartão | Settings → Billing → Add credit (US$ 5-10) |
| OAuth via terminal trava | Browser bloqueou popup OU rede corporativa | Tenta `openclaw models auth paste-token` (token manual) |
| Comando `openclaw` não encontrado | Tá em terminal local em vez de terminal Managed | Use **terminal do painel Hostinger**, não terminal local do laptop |
| `lshell: forbidden character` | Tentou comando bash arbitrário no Managed | Terminal Managed é lshell — só comandos `openclaw *` passam direto |
| Telegram bot não responde | Token errado OU bot não conectado | `openclaw channels list` → confirma telegram aparece · refazer `channels add` se preciso |
| `getUpdates 409` (Telegram) | Outro gateway/poller usando o mesmo bot | Verifica se há 2 OpenClaws com mesmo bot · desliga duplicado |
| Agente não carrega contexto do onboarding | `llms-full.txt` muito grande pra janela | Tenta `https://docs.openclaw.ai/llms.txt` (índice resumido) |

## Pendências de validação (release v1.0 do kit)

Antes de release v1.0:

1. Validar `openclaw models auth login --provider openai-codex --set-default` em conta zerada — confirmar fluxo completo
2. Validar `openclaw models auth list` retorna formato esperado
3. Testar Telegram setup end-to-end em conta zerada (Bloco 5 da A1)
4. Validar que onboarding prompt funciona com `llms-full.txt` no plano default OpenAI

## Referências

### Internas
- A1 do roteiro principal: `memory/curso-openclaw/ROTEIRO-MAIN-V2-2026-05-02.md`
- A2 (cockpit terminal): aprofunda uso do terminal Managed (recap aqui só pra OAuth)
- A3 (Telegram aprofundado): tópicos · grupos · allowlist (Bloco 5 da A1 só faz DM básico)
- A10 (segurança): princípios aplicados ao setup (scope mínimo · token no cofre)
- Cheatsheet `outros-canais.md`: 24 canais nativos OpenClaw com setup CLI direto

### Externas
- Stack landing: [hostg.xyz/SHJMI](https://www.hostg.xyz/SHJMI)
- OpenAI API: [platform.openai.com](https://platform.openai.com)
- ChatGPT Plus (pra OAuth Fase B): [chatgpt.com](https://chatgpt.com)
- Doc OpenClaw `models`: [docs.openclaw.ai/cli/models](https://docs.openclaw.ai/cli/models)
- Doc OpenClaw `config`: [docs.openclaw.ai/cli/config](https://docs.openclaw.ai/cli/config)
- @BotFather Telegram: [t.me/BotFather](https://t.me/BotFather)

---

> **Outros providers (Anthropic · Google · OpenRouter · Ollama):** existem e funcionam — mas no day 1 você não precisa. OpenAI default + OAuth ChatGPT Plus cobre tudo. Quando quiser experimentar (testar modelos novos · otimizar custo · usar local LLM), bônus YouTube específico cobre OpenRouter + estratégia de fallback ativa. **Maioria dos PME nunca precisa sair do default.**
