---
name: integracoes-de-produtividade
status: ATIVO
category: cheatsheet
referenced_by: [A12]
version: 1.0
last_updated: 2026-05-03
description: Cheatsheet de referência pra integrar qualquer ferramenta de produtividade no agente — Notion, GitHub, Calendar, Gmail, Drive, Stripe, Linear, etc. Cobre 4 padrões de auth (token simples, OAuth, CLI dedicada como gog, IMAP/SMTP) + 6 prompts prontos pra colar + plano B CLI direto pra cada integração.
---

# Integrações de produtividade — referência rápida

## Como usar este cheatsheet

**Caminho default — prompt natural pro agente** (linha de produção):

Cola um dos prompts da seção "Prompts prontos pra colar" (abaixo) direto no Telegram ou terminal. Cada prompt aponta pra **doc oficial OpenClaw + doc oficial da ferramenta** e pede pro agente conduzir o setup com explicação antes de executar.

**Caminho de plano B — comando CLI direto** (use quando):
- Agente travou (rate limit, token expirado, doc desatualizada)
- Você prefere conduzir manual em vez de delegar
- Está validando uma config específica que o agente leu errado

Cole o comando da tabela canônica abaixo no terminal Managed (Hostinger painel → menu OpenClaw → "Abrir linha de comando") e siga as instruções da doc oficial linkada.

> **Lembrete**: terminal Managed é `lshell` (limited shell) — só comandos `openclaw *` passam direto. Tudo o mais (instalar pacote, editar `.env` arbitrário) precisa ser feito **via agente** ou via comando OpenClaw específico.

## Os 4 padrões de auth

| # | Padrão | Como funciona | Exemplos |
|---|--------|---------------|----------|
| 1 | **Token simples** (API key) | Gera no painel da ferramenta · cola no `.env` (known key OpenClaw) · agente usa via Bearer | Notion · GitHub · Linear · Stripe · Buffer · Anthropic · Brave |
| 2 | **OAuth flow** | Fluxo de browser · agente recebe access_token · refresha quando expira | Slack (como ferramenta de busca) · Twitter/X API · Spotify · Hubspot · Salesforce |
| 3 | **CLI dedicada** | Instala CLI da plataforma · autentica uma vez via browser · agente roda comandos | **Google Workspace: `gog`** (Gmail/Calendar/Drive/Docs/Sheets) · AWS: `aws` · Azure: `az` · Heroku: `heroku` |
| 4 | **IMAP/SMTP + skill** | Protocolo padrão · skill custom abstrai · útil pra email | Gmail (alternativa ao gog) · Outlook · Yahoo · qualquer servidor email |

Princípio: *"Você decora 4 padrões. Não decora 50 APIs."*

## Tabela canônica — integrações comuns

### Padrão 1 — Token simples (API key direto no `.env`)

| Ferramenta | Onde criar token | Scope mínimo recomendado | Doc oficial |
|------------|------------------|--------------------------|-------------|
| **Notion** | [notion.so/my-integrations](https://www.notion.so/my-integrations) | Read-only se só lê pages · Read+Write se cria/atualiza | [developers.notion.com](https://developers.notion.com/) |
| **GitHub** (PAT) | [github.com/settings/tokens](https://github.com/settings/tokens) | `repo:read` se só lê · `repo` se commit/push | [docs.github.com/rest](https://docs.github.com/en/rest) |
| **Linear** | [linear.app/settings/api](https://linear.app/settings/api) | Read-only se só consulta · Admin se cria/edita issues | [developers.linear.app](https://developers.linear.app/) |
| **Stripe** | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | Restricted Key com permissões mínimas (read MRR ≠ write charges) | [stripe.com/docs/api](https://stripe.com/docs/api) |
| **Buffer** | [publish.buffer.com/account/apps](https://publish.buffer.com/account/apps) | Token com escopo de canais específicos | [buffer.com/developers/api](https://buffer.com/developers/api) |
| **Anthropic** | [console.anthropic.com/account/keys](https://console.anthropic.com/account/keys) | Workspace específico se possível | [docs.anthropic.com](https://docs.anthropic.com/) |
| **Brave Search** | [brave.com/search/api](https://api.search.brave.com/) | Free tier suficiente pra começar | [api.search.brave.com](https://api.search.brave.com/) |

### Padrão 3 — CLI dedicada (gog para Google Workspace)

```bash
# gog já vem instalado no OpenClaw 2026.4+. Se precisar instalar:
npm install -g gogcli
# ou via brew:
brew install steipete/tap/gogcli

# Setup uma vez (autentica Gmail + Calendar + Drive + Docs + Sheets + Contacts):
gog auth credentials /path/to/client_secret.json
gog auth add seu@email.com --services gmail,calendar,drive,contacts,docs,sheets
gog auth list  # confirma que tá tudo OK

# Uso típico:
gog calendar events <calendar-id> --from 2026-01-01 --to 2026-01-07
gog gmail search 'newer_than:7d'
gog gmail send --to "x@y.com" --subject "X" --body-file -
gog drive search "minha pasta"
gog sheets get <sheet-id>!A1:Z100
gog docs cat <doc-id>
```

| Serviço Google | Comando gog | Doc oficial |
|----------------|-------------|-------------|
| Gmail | `gog gmail search/send/reply/draft` | [github.com/steipete/gogcli](https://github.com/steipete/gogcli) |
| Calendar | `gog calendar events/create/update` | [github.com/steipete/gogcli](https://github.com/steipete/gogcli) |
| Drive | `gog drive search/get/upload` | [github.com/steipete/gogcli](https://github.com/steipete/gogcli) |
| Docs | `gog docs cat/export` | [github.com/steipete/gogcli](https://github.com/steipete/gogcli) |
| Sheets | `gog sheets get/update/append/clear` | [github.com/steipete/gogcli](https://github.com/steipete/gogcli) |
| Contacts | `gog contacts list` | [github.com/steipete/gogcli](https://github.com/steipete/gogcli) |

**Por que gog em vez de gcloud:**
- Cobre Google Workspace inteiro num CLI unificado
- Sem precisar criar projeto manualmente no Google Cloud Console
- `gog auth` faz o fluxo OAuth inteiro pra você
- Skills oficiais OpenClaw de Calendar/Drive/Gmail já usam gog por padrão
- Confirma antes de enviar email ou criar evento (safe by default)

### Padrão 4 — IMAP/SMTP (email genérico)

Quando ferramenta não tem CLI dedicada nem API REST decente — útil pra Outlook, Yahoo, ou servidores de email custom.

| Servidor | Host IMAP | Host SMTP | Auth |
|----------|-----------|-----------|------|
| Gmail | `imap.gmail.com:993` | `smtp.gmail.com:587` | App Password (2FA obrigatório) |
| Outlook 365 | `outlook.office365.com:993` | `smtp.office365.com:587` | OAuth ou App Password |
| Yahoo | `imap.mail.yahoo.com:993` | `smtp.mail.yahoo.com:587` | App Password |
| Custom (cPanel/etc) | varia | varia | Senha do usuário |

Skill custom abstrai: lê inbox, classifica por regra, gera digest. Recap A10: email é vetor #1 de prompt injection — defesa anti-injection no SOUL é obrigatória.

## Prompts prontos pra colar

### 1. Conectar Notion via API token

```
Quero conectar meu Notion. Vai na doc oficial em
https://docs.openclaw.ai/cli/secrets e em
https://developers.notion.com/, lê como conectar via API com
Bearer token, me explica:

1. Onde criar o token (notion.so/my-integrations)
2. Qual scope mínimo eu preciso (read-only se só vou ler,
   read+write se vou criar/editar pages)
3. Como adicionar token no .env (qual nome canônico)
4. Como compartilhar pages/databases com a integração
   (Notion exige isso explícito — passo que muita gente esquece)
5. Como testar que tá funcionando (qual endpoint ler primeiro)

Me pede a credencial quando estiver pronto, valida lendo uma
page de teste, me avisa quando estiver tudo certo.

Princípios A10: scope mínimo · token no cofre depois (1Password
quando integração nativa OpenClaw vier) · rotação periódica.
```

### 2. Conectar GitHub via Personal Access Token (PAT)

```
Quero conectar meu GitHub. Vai na doc oficial em
https://docs.openclaw.ai/cli/secrets e em
https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens,
lê como conectar via PAT, me explica:

1. Onde criar o PAT (github.com/settings/tokens — fine-grained
   ou classic? me explica diferença)
2. Qual scope mínimo eu preciso pro meu caso de uso (vou só
   listar repos? ler PRs? commitar? push?)
3. Como adicionar token no .env como GITHUB_TOKEN
4. Quanto tempo o token dura e como rotacionar
5. Como testar (qual repo ler primeiro)

Me pede a credencial quando estiver pronto, valida listando meus
repos, me avisa quando estiver tudo certo.

Princípios A10: scope mínimo (read-only quando der) · token
expira em 30/60/90 dias · rotação periódica obrigatória.
```

### 3. Conectar Google Workspace via gog CLI

```
Quero conectar Gmail + Calendar + Drive do meu Google Workspace
no agente. O caminho oficial é gog CLI.

Vai na doc oficial em
https://github.com/steipete/gogcli, lê o setup, me explica:

1. Se gog já tá instalado nesse OpenClaw (deveria estar a partir
   da 2026.4 — confere com `gog --version`)
2. Como criar projeto no Google Cloud Console e baixar
   client_secret.json (passo único, fluxo de browser)
3. Como autenticar via `gog auth` (qual comando exato pra meu
   caso — gmail+calendar+drive+contacts+docs+sheets)
4. Como testar (lista próximos 3 eventos do meu calendário
   primário)
5. Quais permissões eu tô concedendo no fluxo OAuth (scope
   mínimo principle)

Me pede o que precisar, conduz o fluxo OAuth (vai me mandar URL
pra colar no browser), valida que tudo funciona, me avisa quando
estiver pronto.

Princípios A10: cada serviço (gmail/calendar/drive) é um escopo
separado · só autoriza o que vou usar · revogar acesso depois é
fácil em myaccount.google.com/permissions.
```

### 4. Conectar Stripe via API key (modo seguro)

```
Quero conectar minha conta Stripe no agente — só pra LER MRR,
listar customers, ler invoices. Sem write nessa primeira fase.

Vai na doc oficial em
https://docs.openclaw.ai/cli/secrets e em
https://stripe.com/docs/keys, lê como conectar via Restricted
Key (não Secret Key full), me explica:

1. Por que Restricted Key e não Secret Key (princípio scope
   mínimo da A10)
2. Como criar Restricted Key (dashboard.stripe.com/apikeys →
   Create restricted key) com permissões mínimas:
   - balance: read
   - customers: read
   - invoices: read
   - charges: read
   - subscriptions: read
3. Como adicionar token no .env (qual nome canônico)
4. Como testar lendo meu balance atual

Me pede a credencial quando estiver pronto, valida lendo balance,
me avisa quando estiver tudo certo.

Aviso: NÃO me peça pra criar Secret Key full. Quero scope mínimo
desde o dia 1.
```

### 5. Conectar Linear via API token

```
Quero conectar meu Linear no agente. Vai na doc oficial em
https://docs.openclaw.ai/cli/secrets e em
https://developers.linear.app/, lê como conectar via API token,
me explica:

1. Onde criar o token (linear.app/settings/api)
2. Diferença entre Personal API Key e OAuth (qual usar pra
   integração de 1 usuário só vs equipe inteira)
3. Como adicionar token no .env
4. Como testar (lista as 5 issues abertas atribuídas a mim)
5. Como rotacionar quando precisar

Me pede a credencial, valida listando minhas issues abertas, me
avisa quando estiver pronto.

Princípios A10: scope read-only se só vou consultar · escala pra
write quando provar que precisa.
```

### 6. Conectar Buffer pra publicar em redes sociais

```
Quero conectar meu Buffer no agente pra ele agendar posts em
canal específico (LinkedIn da minha empresa). Não quero que ele
acesse meus outros canais.

Vai na doc oficial em
https://docs.openclaw.ai/cli/secrets e em
https://buffer.com/developers/api, lê como conectar via OAuth,
me explica:

1. Onde criar app no Buffer (publish.buffer.com/account/apps)
2. Como o OAuth funciona pra restringir scope ao canal LinkedIn
   específico (não ao workspace inteiro)
3. Como adicionar token no .env
4. Como testar agendando um post DRAFT (não publicado) pra
   confirmar que tá funcionando
5. Como ver fila de posts agendados

Me pede o que precisar, valida criando 1 post DRAFT no LinkedIn
da empresa (não publicar), me avisa quando estiver pronto.

Princípios A10: gate humano pra publicar (recap A5) · scope
restrito a 1 canal · monitoramento diário nos primeiros 30 dias
quando agente vai postar de verdade (recap A10 Bloco 4).
```

## 3 informações que o agente sempre vai pedir

Independente da ferramenta, agente precisa de:

| Informação | Exemplo prático |
|------------|-----------------|
| **Tipo de credencial** (token, OAuth, CLI auth) | Notion → Bearer token · Calendar → gog auth · Slack → OAuth |
| **Scope** (read-only vs write, quais recursos) | Stripe → Restricted Key com `balance:read + customers:read` |
| **Onde guardar** (`.env` known key, 1Password vault, secret store) | Hoje: `.env` no Managed · futuro: 1Password quando integração nativa vier |

## Princípios de segurança aplicados (recap A10)

Cada integração nova = nova superfície de risco. Aplicar **sempre**:

1. **Scope de estagiário** — read-only quando der · só os escopos que precisa
2. **Token no cofre** — hábito do dia 1: cofre 1Password na sua vida pessoal/equipe (mesmo que OpenClaw ainda não tenha integração nativa)
3. **Rotação periódica** — cron mensal que te lembra (gancho A9 — meta-cron)
4. **Banco produção: nunca direto** — agente sempre via API com validação, nunca SQL direto
5. **Defesa anti-prompt-injection** — TODA leitura de input externo (email, página web, transcrição) passa pela defesa do SOUL (recap A10 Bloco 5)
6. **Monitoramento inicial** — primeiros 30 dias com integração nova, revisar histórico diariamente

## Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `401 Unauthorized` (qualquer API) | Token expirou ou foi revogado | Gera novo token na ferramenta + atualiza `.env` + `openclaw secrets reload` |
| `403 Forbidden` (Notion/GitHub) | Scope insuficiente OU page/repo não compartilhado com integração | Revisa scope do token · em Notion: compartilha page com integração explicitamente |
| `rate limit exceeded` | Cron muito frequente OU loop em skill | Aumenta intervalo do cron · adiciona retry com exponential backoff na skill |
| `gog: command not found` | gog não instalado no Managed | Roda via agente: `npm install -g gogcli` (precisa permissão) |
| `gog auth` trava | client_secret.json inválido ou expirou | Recria projeto no Google Cloud Console · baixa novo JSON · refaz `gog auth credentials` |
| Email com "instrução escondida" sendo executada | Defesa anti-injection não tá no SOUL | Adicionar bloco anti-injection da A10 Bloco 5 + monitoramento de tópicos suspeitos |
| Buffer post publicado errado | Gate humano não foi configurado | Recap A5 — instrução no SOUL pra confirmar antes de publicar em rede social |

## Quando NÃO usar plano B

- **Aluno PME que não tem confiança em terminal**: stay com prompt natural. Agente conduz, você fornece, pronto
- **Integração crítica (banco, prod, dinheiro)**: nunca cola comando direto sem revisar 3x. Mais um motivo pra deixar agente conduzir e validar antes
- **Integração nova na sua vida**: deixa o agente explicar as escolhas (scope, OAuth flow, etc) que você não conhece ainda. Plano B é pra quando você JÁ sabe o que quer

## Pendências de validação (release v1.0 do kit)

URLs canônicas e nomes validados via [docs.openclaw.ai/llms.txt](https://docs.openclaw.ai/llms.txt) em 03/05/2026.

**Antes de release v1.0 do Starter Kit:**

1. Validar que `gog` realmente vem instalado no Managed Hostinger 2026.4+ (PRD V1 afirma, mas testar em conta de teste)
2. Confirmar nomes canônicos das known keys do `.env` para Notion (`NOTION_TOKEN`?), Linear (`LINEAR_API_KEY`?), Stripe (`STRIPE_API_KEY`? `STRIPE_RESTRICTED_KEY`?), Buffer (`BUFFER_TOKEN`?)
3. Testar cada um dos 6 prompts prontos em conta de teste — refinar wording baseado em onde o agente trava
4. Validar que defesa anti-prompt-injection do SOUL (recap A10) é suficiente pra bloquear instrução vinda via email lido pela skill custom
