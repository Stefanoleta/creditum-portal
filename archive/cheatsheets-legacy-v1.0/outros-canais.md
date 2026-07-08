---
name: outros-canais
status: ATIVO
category: cheatsheet
referenced_by: [A3, A11]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet de referência pra conectar qualquer canal nativo do OpenClaw (24 canais com URL canônica + Voice Call e WebChat como plugins separados). Caminho default é meta-prompt natural; comando CLI direto e link da doc oficial são plano B quando agente travar.
---

# Outros canais — referência rápida (24 canais nativos)

## Como usar este cheatsheet

**Caminho default — meta-prompt natural** (linha de produção):

```
Conecta meu agente no [Slack / Discord / iMessage / Signal /
Teams / Matrix / outro].

Lê a doc oficial em https://docs.openclaw.ai/channels, segue o
passo-a-passo do canal escolhido, me pede o que precisar (token,
OAuth, QR, allowlist), valida que tá funcionando, e me avisa
quando tiver tudo pronto.

Se a doc tiver alguma escolha que muda como o canal funciona
(ex: bot vs conta pessoal, DM vs canal específico, app oficial
vs self-hosted), me explica as opções e me deixa escolher antes
de seguir.
```

**Caminho de plano B — comando CLI direto** (use quando):
- Agente travou (rate limit, timeout, doc desatualizada)
- Você prefere conduzir manual em vez de delegar
- Está validando uma config específica que o agente leu errado

Cole o comando da tabela abaixo no terminal Managed (Hostinger painel → menu OpenClaw → "Abrir linha de comando") e siga as instruções da doc oficial linkada pra cada canal.

> **Lembrete**: terminal Managed é `lshell` (limited shell) — só comandos `openclaw *` passam. Tudo o mais é bloqueado por design (recap A2/A10).

## Tabela canônica — 24 canais com URL própria

### Trabalho async (PME comum)

| Canal | Setup CLI | Auth | Doc oficial |
|-------|-----------|------|-------------|
| **Slack** | `openclaw channels add --channel slack --token <bot-token>` | Bot OAuth (Bolt SDK) | [docs.openclaw.ai/channels/slack](https://docs.openclaw.ai/channels/slack) |
| **Discord** | `openclaw channels add --channel discord --token <bot-token>` | Bot Token | [docs.openclaw.ai/channels/discord](https://docs.openclaw.ai/channels/discord) |
| **Microsoft Teams** | `openclaw channels add --channel msteams --token <bot-token>` | Bot Framework (enterprise) | [docs.openclaw.ai/channels/msteams](https://docs.openclaw.ai/channels/msteams) |
| **Mattermost** | `openclaw channels add --channel mattermost --token <bot-token>` | Bot API + WebSocket | [docs.openclaw.ai/channels/mattermost](https://docs.openclaw.ai/channels/mattermost) |

### Mensagem direta (pessoal/privacidade)

| Canal | Setup CLI | Auth | Doc oficial |
|-------|-----------|------|-------------|
| **Telegram** ⭐ | `openclaw channels add --channel telegram --token <bot-token>` | Bot Token (BotFather) | [docs.openclaw.ai/channels/telegram](https://docs.openclaw.ai/channels/telegram) |
| **WhatsApp** ⚠️ | `openclaw channels login --channel whatsapp --account dedicado` | QR pairing (Baileys) | [docs.openclaw.ai/channels/whatsapp](https://docs.openclaw.ai/channels/whatsapp) |
| **iMessage** ⚠️ | `openclaw channels add --channel imessage` | imsg CLI (deprecated) | [docs.openclaw.ai/channels/imessage](https://docs.openclaw.ai/channels/imessage) |
| **BlueBubbles** | `openclaw channels add --channel bluebubbles --token <api-token>` | REST API (alternativa moderna ao iMessage) | [docs.openclaw.ai/channels/bluebubbles](https://docs.openclaw.ai/channels/bluebubbles) |
| **Signal** | `openclaw channels add --channel signal` | signal-cli (privacy-focused) | [docs.openclaw.ai/channels/signal](https://docs.openclaw.ai/channels/signal) |
| **LINE** | `openclaw channels login --channel line` | Bot API | [docs.openclaw.ai/channels/line](https://docs.openclaw.ai/channels/line) |

⭐ = canal padrão do curso (default da A1 Bloco 5 + A3)
⚠️ = ressalvas A3/A10 — banimento, manipulação social, deprecated. Ler aula antes de conectar

### Comunidade aberta / federado

| Canal | Setup CLI | Auth | Doc oficial |
|-------|-----------|------|-------------|
| **Matrix** | `openclaw channels login --channel matrix` | Protocol login (federado) | [docs.openclaw.ai/channels/matrix](https://docs.openclaw.ai/channels/matrix) |
| **IRC** | `openclaw channels add --channel irc` | Allowlist | [docs.openclaw.ai/channels/irc](https://docs.openclaw.ai/channels/irc) |
| **Google Chat** | `openclaw channels login --channel googlechat` | HTTP webhook | [docs.openclaw.ai/channels/googlechat](https://docs.openclaw.ai/channels/googlechat) |
| **Twitch** | `openclaw channels add --channel twitch --token <oauth-token>` | IRC chat (apenas grupo, sem DM) | [docs.openclaw.ai/channels/twitch](https://docs.openclaw.ai/channels/twitch) |
| **Nostr** | `openclaw channels add --channel nostr --token <nip04-key>` | NIP-04 (descentralizado, sem grupo) | [docs.openclaw.ai/channels/nostr](https://docs.openclaw.ai/channels/nostr) |
| **Tlon (Urbit)** | `openclaw channels add --channel tlon --token <ship-id>` | Urbit | [docs.openclaw.ai/channels/tlon](https://docs.openclaw.ai/channels/tlon) |

### Self-hosted (infra própria)

| Canal | Setup CLI | Auth | Doc oficial |
|-------|-----------|------|-------------|
| **Nextcloud Talk** | `openclaw channels add --channel nextcloud-talk --token <token>` | Self-hosted (requer Nextcloud) | [docs.openclaw.ai/channels/nextcloud-talk](https://docs.openclaw.ai/channels/nextcloud-talk) |
| **Synology Chat** | `openclaw channels add --channel synology-chat --token <webhook>` | Webhooks (requer Synology NAS) | [docs.openclaw.ai/channels/synology-chat](https://docs.openclaw.ai/channels/synology-chat) |

### Mercado Ásia

| Canal | Setup CLI | Auth | Doc oficial |
|-------|-----------|------|-------------|
| **Feishu** | `openclaw channels add --channel feishu --token <bot-token>` | WebSocket | [docs.openclaw.ai/channels/feishu](https://docs.openclaw.ai/channels/feishu) |
| **WeChat** | `openclaw channels login --channel wechat` | QR + iLink (sem grupo) | [docs.openclaw.ai/channels/wechat](https://docs.openclaw.ai/channels/wechat) |
| **Zalo** | `openclaw channels add --channel zalo --token <bot-token>` | Bot API | [docs.openclaw.ai/channels/zalo](https://docs.openclaw.ai/channels/zalo) |
| **Zalo Personal** | `openclaw channels login --channel zalouser` | QR login | [docs.openclaw.ai/channels/zalouser](https://docs.openclaw.ai/channels/zalouser) |
| **QQ Bot** | `openclaw channels add --channel qqbot --token <bot-token>` | QQ API | [docs.openclaw.ai/channels/qqbot](https://docs.openclaw.ai/channels/qqbot) |
| **Yuanbao** | `openclaw channels login --channel yuanbao` | Tencent bot | [docs.openclaw.ai/channels/yuanbao](https://docs.openclaw.ai/channels/yuanbao) |

## Plugins separados (não usam `channels add`)

| Plugin | Para que serve | Onde achar |
|--------|---------------|------------|
| **Voice Call** | Chamadas de voz via Plivo/Twilio | Bônus R4 (VPS) |
| **WebChat** | UI Gateway web embarcável | [docs.openclaw.ai/cli/channels](https://docs.openclaw.ai/cli/channels) (instalação à parte) |

## 3 informações que o agente sempre vai pedir

Independente do canal, agente precisa de:

| Informação | Exemplo prático |
|------------|-----------------|
| **Identidade do agente naquele canal** (recap A5) | Slack: "bot dedicado da empresa, não meu user" · Discord: "bot novo, scope mínimo" |
| **Credencial** (token, OAuth, QR, app password) | Você fornece quando o agente pedir — segue OAuth flow do canal |
| **Escopo** (DM só seu? canal específico? grupo?) | "Só DM comigo + canal #ai-help" · "Apenas tópico Operação do supergrupo" |

## Princípios de segurança aplicados (recap A10)

Cada canal novo conectado = nova superfície de manipulação. Aplicar **sempre**:

1. **Conta dedicada do agente** onde gera output em nome seu (não conta pessoal)
2. **Prompt blindado** se o canal é público (template no SOUL — bloco anti-prompt-injection da A10)
3. **Monitoramento diário** nos primeiros 30 dias (lê histórico, marca tentativas de manipulação, ajusta)
4. **Scope mínimo** no token/OAuth (read-only se der; só os escopos que precisa)
5. **Revogação rápida** se vazar — `openclaw channels remove --channel <nome>` + revoga token na plataforma + cria novo

## Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `getUpdates 409` (Telegram) | Outro gateway/poller usando o mesmo bot token | Verificar se há 2 OpenClaws com mesmo bot — desligar o duplicado |
| OAuth expira (Slack/Discord) | Token rotacionado pela plataforma ou app desinstalado | Reinstalar app no workspace + atualizar token |
| QR expira (WhatsApp/WeChat/Zalo Personal) | Pareamento expira em ~1h | Refazer login — `openclaw channels login --channel <nome>` |
| 2FA bloqueia bot | Conta com 2FA em app que exige | Usar app password ou conta dedicada sem 2FA pra bot |
| Bot não posta em canal | Falta admin ou permissão no grupo | Adicionar bot como admin + dar permissões mínimas |
| Re-add bot necessário (Telegram) | Mudou privacy mode no @BotFather | Remove + Re-add no grupo (Telegram só aplica change com remove+re-add) |

## Quando NÃO usar o plano B

- **Aluno PME que não tem confiança em terminal**: stay com meta-prompt. Agente conduz, você fornece, pronto. Não vale o desconforto de colar comando.
- **Canal novo na sua vida**: deixa o agente conduzir — ele explica as escolhas (bot vs conta pessoal, scopes, etc) que você não conhece ainda. Plano B é pra quando você JÁ sabe o que quer.
- **Token sensível (Stripe, banco, prod)**: nunca cola no terminal sem revisar 3x. Mais um motivo pra deixar agente conduzir e validar antes.

## Pendências de validação (release v1.0 do kit)

A sintaxe CLI exata de cada canal acima foi inferida da estrutura geral `openclaw channels add/login --channel <nome> --token <token>` documentada na doc oficial. **Antes de release v1.0 do Starter Kit, validar uma a uma** rodando o comando real em conta de teste — algumas podem ter flags adicionais não documentadas no índice (ex: `--account`, `--workspace`, `--ws-id`).

URLs canônicas e nomes de canais foram validados via [docs.openclaw.ai/llms.txt](https://docs.openclaw.ai/llms.txt) em 03/05/2026.
