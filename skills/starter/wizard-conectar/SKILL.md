---
name: wizard-conectar
status: ATIVO
category: starter
owner: aluno
version: 2.1
mode: guided
estimated_time: 12min (varia se chaves já existem)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "conecta superpoderes" / "configura integrações" / "ativa tavily/brave/github", OR when dispatched by onboarding-checklist as passo 5. Configures Tavily Search API key (default desde kit v2.5.5 — designed pra agente IA, sem cartão obrigatório) OU Brave Search API key (alternativa legada) + GitHub Personal Access Token (classic) + (optional) Chromium via .env first pattern. **v2.1 (kit v2.5.7 — fix Allan caso real Tavily 11/05): (1) Removido `openclaw secrets set TAVILY_API_KEY tvly-XXX` que NÃO existe na CLI oficial — confirmado lendo `docs.openclaw.ai/cli/secrets`. Substituído pelo fluxo canônico: edita `.env` → `openclaw configure --section web` (ativa plugin bundled) → `openclaw secrets reload` (atomic snapshot swap via RPC) → `openclaw secrets audit` (confirma). (2) Removido disclaimer "fallback SDK Python via shell export" — era baseado em hipótese errada minha. TAVILY_API_KEY está na lista oficial de credenciais suportadas (`reference/secretref-credential-surface`, caminho `plugins.entries.tavily.config.webSearch.apiKey`). Não precisa workaround. (3) Adicionada nota sobre `pairing required`: erro do gateway local em chamadas RPC internas é comportamento conhecido do OpenClaw 2026.4.x — workaround documentado pela aula é pedir pro aluno executar o comando manualmente no terminal Managed (aluno tem pairing, agente não tem). Não é responsabilidade do kit resolver.** v2.0 (kit v2.5.5 — fix Brave Search free tier apertou): default Search API trocado de Brave → Tavily. Razão: Brave virou "cartão obrigatório + $5 créditos/mês" enquanto Tavily mantém 1.000 créditos/mês SEM cartão + foi feito specifically pra agente IA + 99.99% SLA + 1M+ devs adopters (AWS, IBM, MongoDB, BCG como clientes enterprise). Brave Search continua suportado como alternativa pra aluno que prefira (compat com kit v1.x-v2.5.4). Wizard pergunta default Tavily, aceita "brave" pra escolher fluxo legado.** v1.9 (kit v2.5.3 — fix Allan VPS root + Chromium SingletonLock + silêncio 10min): (1) Novo ramo SingletonLock detecta erro literal `SingletonLock: Permission denied` + ambiente vps-root → executa sequência canônica (--no-sandbox attempt, snap remove chromium, apt install chromium-browser, gateway restart, validate). Caso comum em VPS root onde Chromium veio via Snap por default e AppArmor restringe acesso. Anti-loop: 2 tentativas máx — se falhar, fallback opcional (skip Chromium, marca `chromium=skipped` em MEMORY). (2) Regra UX EXPECTATIVA aplicada antes de invocar tool de install Chromium — mensagem canonical avisa que comando `apt install chromium-browser` pode levar 5-10min e que agente vai ficar bloqueado durante execução. Sem aviso, aluno acha que travou (caso Allan: 10min silêncio levou aluno a perguntar "ainda processando?").** v1.8 (kit v2.5.2 — fix Adrylan P14 violado em validações): header ganha bloco "P14 EXTRA-RÍGIDO" no topo com 3 mensagens obrigatórias em ordem (anúncio + comando → output literal → interpretação). Caso real Adrylan: bot anunciou "vou validar Brave" + "vou validar GitHub" + confirmou "validado" SEM mostrar comando nem output em 4 momentos (13:18, 13:57, 17:26, 17:30). v2.5.2 obriga: passo 2 (output) NUNCA pode ser pulado.** v1.7 (kit v2.5 — stress test Letícia round 2): Chromium passa a detectar `ambiente:` ANTES de afirmar "vem incluído". Em local-dev (Mac/Linux dev), Chromium não vem bundled — comando `openclaw browser status` falha. v2.5 adapta mensagem por ambiente (Managed/VPS root: bundled; local-dev: brew/apt manual; unknown: pergunta).** v1.6 (kit v2.4): (1) Brave 401 ramo dedicado — antes mensagem genérica "tenta de novo" tratava chave existente-mas-expirada igual a chave digitada errada; agora distingue (chave Brave de meses atrás é caso comum em VPS legados, requer regenerar, não re-colar); (2) PAT browser local — adicionada 1 frase antes do tutorial "abre seu navegador no laptop/desktop, não na máquina onde o agente roda" (caso Rodrigo VPS root SSH sem GUI).** v1.5: Brave URL homepage (`brave.com/pt-br/search/api/`) + cartão obrigatório no free tier. v1.4: PAT-only (sem `gh` CLI). v1.3: `conectado=partial` + flags individuais.
---

# Wizard Conectar — Passo 5 (Tavily Search + GitHub + Chromium · Brave como alternativa)

> 🔴 **AVISOS CRÍTICOS PRO AGENTE (v2.1, REFORÇADOS em v2.5.2):**
>
> ⚠️ **P14 EXTRA-RÍGIDO nesta skill (kit v2.5.2 — fix Adrylan):** validações de Brave + GitHub têm 4 momentos historicamente violados (caso Adrylan 13:18, 13:57, 17:26, 17:30 — bot anunciou "vou validar" + confirmou "validado" SEM mostrar comando nem output). REGRA: cada validação tem 3 mensagens em ordem:
>
> 1. **Anúncio + comando exato:** "Vou validar a chave Brave: `curl ...`"
> 2. **Output literal:** "Output: ```200```" (ou ```401```/etc)
> 3. **Interpretação SÓ DEPOIS:** "✓ HTTP 200 = chave válida" (ou erro específico)
>
> **NUNCA pular passo 2.** Se output não disponível (problema de tool/bridge), ABORTA + reporta honesto: "Não consegui rodar o comando — me mostra um print da chave funcionando OU rode manualmente e cola o output aqui." NÃO finja sucesso.
>
> Validações sob esta regra (todos os 4 anúncios do caso Adrylan):
> - Detecção `.env` Whisper (`grep -E "^OPENAI_API_KEY=" $WORKSPACE/.env`)
> - `openclaw exec-policy show` (em wizard-autonomia)
> - Validação Brave (`curl /res/v1/web/search?q=test`)
> - Validação GitHub PAT (`curl /user`)
>
> **1. URLs SEMPRE COMPLETOS + corretos por cenário (v1.5 fix Brave 03/05).** NUNCA mostrar URL truncada — gera 403/404 quando aluno clica direto. Sempre:
> - **Brave (criar conta + chave):** `https://brave.com/pt-br/search/api/` (homepage com "Get Started" — funciona pra aluno SEM conta)
> - **Brave (gerenciar chaves, depois de logado):** `https://api.search.brave.com/app/keys` (essa URL dá 403 pra aluno sem conta — usar SÓ depois do login)
> - GitHub PAT: `https://github.com/settings/tokens/new?scopes=repo&description=openclaw-backup` (completo, com query params pra pré-preencher)
> - GitHub signup (caso aluno não tenha conta): `https://github.com/signup`
>
> Falhas reais:
> - Dr. Thiago v1.9.2: aluno clicou Brave e deu 403 (URL `api.search.brave.com` requer login; v1.4 tinha essa URL como primária)
> - Bruno v2.2 conta nova: `https://api.search.brave.com/app/keys` deu 403 ("você não tem autorização"). Aluno teve que ir em `https://brave.com/pt-br/search/api/` manualmente pra criar conta. v1.5 corrige.
>
> **2. SMOKE TESTS VISÍVEIS (Princípio 14).** Toda chamada `curl` de validação:
> - MOSTRA o comando exato (em bloco de código) ANTES de rodar
> - MOSTRA o output literal (HTTP code + body se relevante) DEPOIS
> - Só DEPOIS interpretar/narrar
> - Se não conseguir rodar → ABORTA e pede ajuda. NUNCA fingir que validou.
>
> Falha real (Dr. Thiago, v1.9.2): outros wizards inventaram resultado de validação. Aqui você SEMPRE mostra evidência.
>
> **3. CAMINHO GITHUB É APENAS PAT CLASSIC** (decisão Bruno v2.1):
> - NÃO instalar `gh` CLI (não precisa)
> - NÃO chamar skill OpenClaw "github" (não existe pra todos)
> - NÃO ramificar por OS (Managed/VPS root usam o MESMO caminho aqui)
> - O agente usa `git` (built-in Linux/macOS) + GitHub API (curl + token) pra commits/push/repo create
> - Aluno cria conta (se não tem) → gera PAT classic com scope `repo` → cola → agente salva em `.env` como `GITHUB_TOKEN` → usa daí pra frente
>
> **4. GUARD RAIL (Princípio 13).** Se aluno desviar no meio do passo (ex: pergunta sobre Whisper, sobre outro tema), agente:
> - Anota a pergunta em `## Perguntas pendentes` em MEMORY.md
> - Responde 1 linha se for tangencial sobre o passo
> - Traz de volta: "Anotado, vou abordar depois. Mas pra fechar este passo, preciso que você {ação atual}"
> - Após 3 desvios consecutivos, oferece pausar (`wizard_resume_at` agendado)

## Promessa

Em ~12min, aluno conecta 3 superpoderes externos:

1. **Brave Search API** → agente faz pesquisa web textual ($5 grátis/mês)
2. **GitHub Service Token** → backup automático do workspace + futuras integrações
3. **Chromium browser** (opcional) → agente abre páginas web em headless quando precisar

Após conectar GitHub, dispara `backup-workspace-github` (skill em `operacional/`) — backup diário às 03:00 BRT começa hoje.

A diferença visível: agente passa a poder "pesquisar X na web" e "salvar tudo no meu GitHub". Sem isso, agente é caixa-preta isolada.

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 5

**Trigger explícito (standalone):**
- "conecta superpoderes"
- "configura integrações"
- "ativa brave"
- "ativa github"
- "configura chromium"

**NÃO disparar se:**
- `conectado=true` em `MEMORY.md` E todas as 3 chaves estão no `.env` validadas

## Dependência: passo 3 (autonomia)

Sem `exec-policy=yolo`, agente vai pedir aprovação a cada call de validação de chave. Aviso padrão (mesmo do wizard-workspace):

```
"Antes de seguir, aviso: o passo 5 depende do passo 3 (autonomia).
Sem yolo, vou pedir aprovação a cada validação de chave (~6 calls).
Quer voltar pro 3 ou seguir com fricção?"
```

## Princípio 11 + .env first — Detecção antes de pedir

Antes de pedir nada, lê `.env` e valida cada chave.

### Estado das 3 credenciais

```bash
# Tavily Search (default desde v2.5.5) — verifica primeiro
1. Lê TAVILY_API_KEY do .env
2. Se existe, valida:
   curl -s -X POST "https://api.tavily.com/search" \
        -H "Content-Type: application/json" \
        -d "{\"api_key\":\"$TAVILY_API_KEY\",\"query\":\"test\",\"max_results\":1}" \
        -o /dev/null -w "%{http_code}"
3. 200 = válida, 401 = inválida

# Brave Search (alternativa legada — verifica se Tavily não estiver presente)
1. Lê BRAVE_SEARCH_API_KEY do .env
2. Se existe, valida:
   curl -s -H "X-Subscription-Token: $BRAVE_SEARCH_API_KEY" \
        "https://api.search.brave.com/res/v1/web/search?q=test" \
        -o /dev/null -w "%{http_code}"
3. 200 = válida, 401 = inválida

# GitHub
1. Lê GITHUB_TOKEN do .env
2. Se existe, valida:
   curl -s -H "Authorization: token $GITHUB_TOKEN" \
        https://api.github.com/user -w "%{http_code}"
3. 200 = válido

# Chromium (opcional)
1. Roda `chromium --version` ou `which chromium`
2. Se retorna versão, instalado
3. Se não, marcador "não instalado"
```

### Estados detectáveis

| Search | GitHub | Chromium | Ação |
|---|---|---|---|
| ✓ Tavily ou Brave válida | ✓ válido | ✓ instalado | "Tudo conectado já. Vou só ativar backup-workspace-github e ir pra pergunta-âncora." |
| ✓ | ✓ | ⏳ | "Search + GitHub OK. Chromium opcional, posso pular ou instalar agora — qual prefere?" |
| ✓ | ⏳ | qualquer | "Search OK. Vou pedir só GitHub Token." |
| ⏳ | ✓ | qualquer | "GitHub OK. Vou pedir só search key (Tavily recomendado)." |
| ⏳ | ⏳ | qualquer | Fluxo normal completo |

### Mensagem padrão ao detectar tudo pronto

```
"✓ Detectei suas integrações já configuradas:
 - Search API ({Tavily | Brave Search} — validei agora, retornou 200)
 - GitHub Token (validei — username: @{username})
 - Chromium {se instalado}

Vou ativar o backup-workspace-github e seguir pra pergunta-âncora."
```

**Nota:** se aluno tem AMBAS configuradas (Tavily E Brave), agente prioriza Tavily (default v2.5.5+) e marca Brave como `search_legacy_active`. Aluno pode trocar manualmente depois com `troca search` (comando opcional, atalho pra desabilitar Tavily e voltar pra Brave).

## Fluxo principal

### 1. Narrar promessa

```
"Vamos conectar 3 superpoderes externos. ~12min total.

1. Tavily Search API → eu busco coisa na web (notícias, dados, refs).
   Designed pra agentes IA. Free tier: 1.000 buscas/mês. Sem cartão.

2. GitHub Service Token → backup automático do seu workspace inteiro
   pro GitHub privado. Cron diário às 03:00. 30 dias de histórico.

3. Chromium (opcional) → eu abro páginas web em headless quando preciso
   ler conteúdo (artigo, doc, página inteira). Sem isso, eu vejo só
   título + descrição da busca.

Sem essas 3, eu fico isolada — não busco web, não salvo histórico,
não leio página completa.

Bora começar pelo Tavily?"
```

### 2. Tavily Search — gerar e validar chave (default desde kit v2.5.5)

```
"Pra gerar Tavily Search API key:

1. Abre https://tavily.com/
2. Clica em 'Get API Key' / 'Sign up'
3. Faz cadastro: email + senha (sem cartão de crédito)
4. Confirma email
5. Acessa o dashboard → 'API Keys' → copia a chave (formato: tvly-XXXXXXXXX...)

Plano Free Researcher: 1.000 créditos/mês renováveis. Suficiente pra
agente PME usar buscas todo dia. Quando estourar, plano Pay As You Go
fica $0.008/crédito (= $8/1.000 buscas adicionais). Sem cartão exigido
no plano free.

Se quiser conhecer mais antes: https://tavily.com/pricing

Quando tiver a chave, cola aqui que eu salvo no .env e valido."
```

**Persistência + validação Tavily — fluxo oficial OpenClaw (smoke test visível — Princípio 14):**

`TAVILY_API_KEY` está na lista oficial de credenciais suportadas pelo OpenClaw (`reference/secretref-credential-surface` — caminho `plugins.entries.tavily.config.webSearch.apiKey` resolve da env var `TAVILY_API_KEY`). Não precisa workaround.

```bash
# 1. Escrever a chave no .env do workspace
#    NOTA: o agente faz isso via tool (lshell do Managed bloqueia `>>`).
#    Path padrão Managed: /data/.openclaw/workspace/.env
#    Path padrão VPS root: /root/.openclaw/workspace/.env
#    Path local-dev: $WORKSPACE/.env

# 2. Ativar plugin Tavily bundled (idempotente — pode rodar 2x sem problema)
openclaw configure --section web

# 3. Commitar plano dos secrets (se configure salvou plan file)
#    Geralmente configure --allow-exec já aplica; este passo é safety net.
openclaw secrets apply --dry-run    # valida sem escrever
openclaw secrets apply              # commita

# 4. Recarregar secrets pro daemon (atomic snapshot swap via RPC)
openclaw secrets reload

# 5. Auditar — confirma resolução da chave + ausência de plaintext
openclaw secrets audit

# 6. Validar com call HTTP real (mostrar comando + output literal)
curl -s -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"$TAVILY_API_KEY\",\"query\":\"test\",\"max_results\":1}" \
  -w "\nHTTP %{http_code}\n"

# 7. 200 OK = válida · 401 = inválida · 429 = rate limit
```

> ✅ **Comandos canônicos (kit v2.5.7 — fix Allan):** o subcomando `openclaw secrets set` **não existe** na CLI oficial — wizard até v2.0 (kit v2.5.6) mandava ele por engano. O fluxo correto pra adicionar credencial é: editar `.env` direto → `openclaw configure --section <web|channels|...>` pra ativar o plugin → `openclaw secrets reload` pra propagar via RPC → `openclaw secrets audit` pra confirmar. Sintaxe completa em `https://docs.openclaw.ai/cli/secrets`.

> ⚠️ **Se o `reload` falhar com `pairing required`:** é bloqueio do gateway local (não é bug do kit, é UX do OpenClaw 2026.4.x). Workaround documentado pelo curso: pedir pro aluno executar manualmente o mesmo comando `openclaw secrets reload` no terminal Managed dele — aluno tem pairing, agente não tem. Se aluno ainda travar, manda no @cursoopenclaw que destrava no chat.

### 2b. Brave Search — alternativa (mantém compat com kit v1.x-v2.5.4)

Se aluno preferir Brave (já tem conta, prefere o ecosystem Brave, etc), wizard aceita:

```
"Beleza, vamos com Brave Search (alternativa). 2 coisas a saber antes:

1. Brave exige cartão de crédito pra ativar plano Free ($5 créditos/mês = ~1.000 buscas).
   Não cobra dentro do free tier — cartão é só anti-fraude.
2. Tavily não exige cartão e tem o mesmo free tier (1k/mês).
   Recomendamos como default em v2.5.5+, mas Brave continua suportado.

Confirma que quer Brave mesmo? Manda 'brave' que eu sigo, 'tavily' que
eu volto pro caminho default."
```

**Se aluno confirma Brave, fluxo legado:**

1. Abre https://brave.com/pt-br/search/api/ (homepage da API)
2. Clica em 'Get Started' / 'Começar agora'
3. Faz cadastro: email + senha
4. **⚠️ Heads up: Brave vai pedir cartão de crédito pra ativar o plano Free.** Não cobra nada se você ficar dentro do free tier (~1k queries/mês). Cartão é só pra prevenir abuso/bots. Se preferir não cadastrar agora, manda 'pula' — você pode ativar quando quiser.
5. Após cadastro completo, vai pra https://api.search.brave.com/app/keys (essa URL agora vai funcionar pra você porque tá logado)
6. Clica 'Add API Key'
7. Nome sugerido: 'openclaw-{nome_agente}' (ex: 'openclaw-atlas')
8. Copia a chave (começa com 'BSAk...')
9. Cola aqui

Resumo: free tier não cobra, mas precisa cartão no cadastro. Renova mensalmente."
```

Quando aluno colar a chave, **smoke test visível (Princípio 14)** — mostra comando + output literal:

```
"Validando a chave Brave agora:

```bash
curl -s -o /dev/null -w "%{http_code}" \
     -H "X-Subscription-Token: BSAk-xxxx" \
     "https://api.search.brave.com/res/v1/web/search?q=hello"
```

Output:
```
200
```

✓ HTTP 200 = chave válida."
```

(NÃO inventar HTTP code. Se não conseguir rodar curl, abortar e pedir ajuda.)

| Resposta | Ação |
|---|---|
| 200 | "✓ Brave validada. Vou salvar." |
| 401 (chave que aluno acabou de colar) | "Erro 401 — chave inválida. Copy/paste truncado? Tenta de novo." → volta pro passo 1 |
| 401 (chave já existia em `.env` antes — kit v2.4 ramo dedicado) | Ramo "chave expirada/revogada" abaixo |
| 429 | "Rate limit já. Você gerou e logo passou da quota? Tenta de novo em 1min." |
| Outros | Mostrar output literal + investigar com aluno |

#### Ramo: Brave 401 com chave PRÉ-EXISTENTE (kit v2.4 — fix Rodrigo)

⚠️ **Distinção importante:** se a Detecção do Princípio 11 já tinha encontrado `BRAVE_SEARCH_API_KEY` no `.env` ANTES desse fluxo (chave de meses atrás), e a validação inicial retornou 401, **não tratar como copy/paste errado** — chave realmente existia, foi revogada/expirada (Brave revogou 03/2026, comum em VPS legados).

Mensagem canonical (P15):

```
"Achei sua chave Brave já no `.env` (provavelmente configurada antes), mas a validação retornou **HTTP 401**:

```
{output_literal}
```

Isso significa: a chave foi **revogada ou expirou**. Não é erro de digitação — a chave existia, mas perdeu validade.

Próximo passo:

1. Abre **https://api.search.brave.com/app/keys** (você já tem login lá — chave antiga indica isso)
2. **Revoga** a chave antiga (botão Revoke ao lado dela)
3. **Add API Key** → nome: `openclaw-{nome_agente}` → copia a nova
4. Cola aqui que eu sobrescrevo o `.env`

Se você não conseguir acessar o painel (perdeu senha, etc), usa o caminho de criar do zero: https://brave.com/pt-br/search/api/"
```

(NÃO ficar perguntando "tenta de novo" — Rodrigo vai colar a mesma chave revogada em loop. P14 manda mostrar evidência e explicar root cause.)

Salvar como `BRAVE_SEARCH_API_KEY` no `.env` (após backup do `.env` se já existia — Princípio 1).

### 3. GitHub Personal Access Token (classic) — gerar e validar

⚠️ **Antes de pedir o token, perguntar:** "Você já tem conta GitHub?" Se aluno disser "não" / "preciso criar" / "nunca usei", vai pra **3a (criar conta)**. Se sim, vai pra **3b (gerar token)**.

#### 3a. Criar conta GitHub (caso aluno não tenha)

```
"Beleza, vamos criar sua conta GitHub primeiro. É grátis e leva ~2min.

1. Acessa https://github.com/signup
2. Email pessoal (ou de trabalho) + senha forte + username
   - Username vai aparecer em URLs públicas — escolhe algo profissional.
     Ex: 'thiago-russo' melhor que 'tagueitiago42'
3. Verifica email (eles mandam código)
4. Plano 'Free' já vem ativo

Quando criar, manda 'criei' que a gente vai pro próximo passo (gerar
token)."
```

Aguardar aluno confirmar. Quando confirmar, vai pra 3b.

#### 3b. Gerar PAT classic — tutorial visual em 4 cliques

⚠️ **Antes de tudo (kit v2.4 — fix Rodrigo VPS root):** o tutorial abaixo é executado **no SEU navegador** (Chrome/Safari/Firefox no seu laptop/celular) — NÃO na máquina onde o agente roda. Se você tá em VPS root via SSH (ou só não tem GUI na máquina do agente), abre o navegador no SEU computador/celular e segue os passos lá. Quando copiar o token gerado, vem aqui pro Telegram e cola — eu salvo.

⚠️ **Agente: tem 2 caminhos pro aluno (oferecer link direto primeiro, fallback manual com screenshots):**

**Caminho A — Link direto (mais rápido):**

```
"Agora gera o Personal Access Token. Tem 2 jeitos:

🔗 **JEITO RÁPIDO** (link direto já com scope 'repo' pré-marcado):
   https://github.com/settings/tokens/new?scopes=repo&description=openclaw-backup

Esse link abre a página de criação já configurada — você só precisa
escolher 'No expiration' e clicar 'Generate token' no fim.

Se o link não funcionar (raro), me responde 'manual' que eu te guio
pelos 4 cliques no painel."
```

**Caminho B — Manual em 4 cliques (com screenshots):**

⚠️ **Agente: ao apresentar o caminho manual, anexar os 4 screenshots na ordem.** Cada passo tem 1 imagem em `screenshots/github-pat/`. Se a bridge Telegram não suportar `sendPhoto`, mandar links raw GitHub como fallback (já incluídos no texto).

```
"Beleza, vou te guiar passo a passo:

📷 **Clique 1** — abre o menu do seu avatar (canto superior direito)
   → clica em **Settings**
   [foto: 01-avatar-settings.png anexada]

📷 **Clique 2** — na página Settings, sidebar esquerdo (no FIM da lista,
   no rodapé) → **Developer settings**
   [foto: 02-developer-settings.png anexada]

📷 **Clique 3** — no sidebar de Developer settings → **Personal access
   tokens** → **Tokens (classic)** (NÃO 'Fine-grained tokens')
   → no canto superior direito: botão **Generate new token**
   [foto: 03-tokens-classic.png anexada]

📷 **Clique 4** — no dropdown que abre, escolhe a 2ª opção:
   **Generate new token (classic)** (For general use)
   ⚠️ NÃO clica na 1ª (Fine-grained, repo-scoped) — a versão 'classic'
   é a que precisamos
   [foto: 04-generate-classic.png anexada]

Configurações na próxima tela:
   ☑ Note: openclaw-backup
   ☑ Expiration: 'No expiration' (ou 1 ano se quiser rotacionar depois)
   ☑ Scopes: SÓ 'repo' (Full control of private repositories)
     ⚠️ NÃO marca admin:* nem nada além de 'repo'. Princípio do menor
     privilégio: token só precisa criar/modificar repos pra backup.

Clica 'Generate token' no fim da página.

⚠️ Atenção: o token só é mostrado UMA vez. Fechou janela = gerar outro.

Copia o token (começa com 'ghp_...') e cola aqui.

Antes de colar: confirma que esse chat é só seu (não é grupo).
Token em chat público = vazado."
```

**Fallback de links raw (caso bridge Telegram não anexe imagens):**

```
Se as fotos não chegaram, são esses 4 links:
1. https://raw.githubusercontent.com/okjpg/repo-amora-cos/main/memory/curso-openclaw-v2/starter-kit/skills/starter/wizard-conectar/screenshots/github-pat/01-avatar-settings.png
2. https://raw.githubusercontent.com/okjpg/repo-amora-cos/main/memory/curso-openclaw-v2/starter-kit/skills/starter/wizard-conectar/screenshots/github-pat/02-developer-settings.png
3. https://raw.githubusercontent.com/okjpg/repo-amora-cos/main/memory/curso-openclaw-v2/starter-kit/skills/starter/wizard-conectar/screenshots/github-pat/03-tokens-classic.png
4. https://raw.githubusercontent.com/okjpg/repo-amora-cos/main/memory/curso-openclaw-v2/starter-kit/skills/starter/wizard-conectar/screenshots/github-pat/04-generate-classic.png
```

#### 3c. Validar (smoke test visível — Princípio 14)

⚠️ Quando aluno colar o token, MOSTRAR o comando + output literal:

```
"Validando o token agora:

```bash
curl -s -o /dev/null -w "%{http_code}" \
     -H "Authorization: token ghp_xxxx" \
     https://api.github.com/user
```

Output:
```
200
```

✓ HTTP 200 = token válido."
```

(Mostrar HTTP code real recebido. NÃO inventar.)

Após validação OK, extrair username:

```bash
curl -s -H "Authorization: token {token}" \
     https://api.github.com/user | jq -r '.login'
```

Mostrar resultado:

```
"Você é @{username}. Anotado.

Salvando como GITHUB_TOKEN no .env."
```

| Resposta | Ação |
|---|---|
| 200 | "✓ Validado. Você é @{username}." → salva |
| 401 | "Token inválido (HTTP 401). Copia/cola pode ter cortado o final, ou token expirou. Tenta de novo gerando outro." → volta pra 3b |
| 403 | "Token sem scope 'repo' (HTTP 403). Volta no GitHub e marca o scope, gera de novo." → volta pra 3b |
| Outro | Mostrar o output literal + investigar com aluno |

Salvar como `GITHUB_TOKEN` no `.env` (após backup do `.env` se já existia — Princípio 1).

### 4. Chromium — opcional

```
"Quer instalar Chromium pra eu abrir páginas web em headless?

Sem ele:
- Brave Search me dá título + descrição (suficiente pra ~70% dos casos)

Com ele:
- Eu abro a página inteira, leio conteúdo completo, extraio dados

Custo: ~200MB de disco. Sem custo recorrente.

Manda 'instala' ou 'pula'."
```

Se "instala":

⚠️ **kit v2.5 — fix Letícia stress test:** detectar ambiente ANTES de afirmar "vem incluído". Em local-dev (Mac/Linux dev), Chromium não vem bundled — comando `openclaw browser status` falha. Mensagem deve adaptar.

**Lê `ambiente:` em MEMORY:**

| Ambiente | Mensagem + comando |
|---|---|
| `managed` | "Boa notícia: o Chromium já vem incluído no seu OpenClaw Managed. Não precisa instalar nada. Vou validar." → `openclaw browser status` |
| `vps-root` | "Em VPS root, o OpenClaw bundle inclui Chromium. Vou validar." → `openclaw browser status` |
| `local-dev` | "Em dev local, Chromium não vem bundled — você precisa instalar manualmente. Mac (brew): `brew install chromium`. Linux: `apt install chromium-browser` ou similar. Manda 'instalado' quando finalizar OU manda 'pula' se não quiser agora." (NÃO roda `openclaw browser status` — comando provavelmente falha) |
| `unknown` | "Não consegui detectar seu ambiente automaticamente. Você instalou OpenClaw via 1-click Hostinger (Managed), via SSH no VPS, ou local no seu computador?" → conforme resposta, redireciona |

**Após `openclaw browser status` (Managed/VPS root):**

| Resultado | Ação |
|---|---|
| `running` ou `available` | "✓ Browser disponível. Marcando como ativo." |
| `not started` ou similar | Ativar com `openclaw browser start --headless` (rodar via execução de tool, não pedir aluno colar) |
| **`SingletonLock: Permission denied`** (kit v2.5.3 — fix Allan VPS root + Snap) | Ramo dedicado SingletonLock — ver seção abaixo |
| Erro inesperado | "Hm, browser não tá respondendo. Manda no @cursoopenclaw que ajudo a debugar — não bloqueia o resto da jornada." |

#### Ramo SingletonLock (kit v2.5.3 — fix Allan)

⚠️ **Caso real Allan stress test 03/05/2026 18:43-18:55:** Chromium em VPS root via Snap retornou `SingletonLock: Permission denied`. Snap-based Chromium é incompatível com containers root (profile lock falha). Solução: trocar pra executável fora do Snap.

**Detecção:** se output de `openclaw browser status` ou primeira tentativa de start contém `SingletonLock` E ambiente é `vps-root`.

**Antes de invocar tool de instalação (P14 + Regra UX EXPECTATIVA — kit v2.5.3):**

```
"Detectei Chromium via Snap incompatível com root (erro de profile lock — `SingletonLock: Permission denied`). É edge case conhecido em containers VPS com Snap.

Vou tentar reinstalar fora do Snap (via apt direto). Esse processo:
- Configura `browser.noSandbox: true` (necessário pra root)
- Remove Chromium-Snap atual
- Instala chromium-browser via apt
- Restart Gateway pra apontar pro novo executável

Leva 5-10min total (apt install em VPS Hostinger costuma ser lento). Vou ficar bloqueado durante a execução, não consigo mandar update no meio — se passar de 12min sem retorno, me avisa pra eu confirmar que não travei."
```

**Comandos (P14 — mostrar comando + output após retornar):**

```bash
# 1. Configurar noSandbox
openclaw config set browser.noSandbox true

# 2. Remover Snap (se existir)
snap remove chromium 2>/dev/null || true

# 3. Instalar via apt (Debian/Ubuntu) ou yum (RHEL)
apt-get install -y chromium-browser 2>/dev/null || yum install -y chromium

# 4. Restart Gateway
openclaw gateway restart

# 5. Validar
sleep 5  # aguarda Gateway estabilizar
openclaw browser status
```

**Output após retorno:**

| Status | Ação |
|---|---|
| `running` ou `available` | "✓ Chromium reinstalado fora do Snap, Gateway estabilizado, browser disponível. Marcando como ativo." |
| Ainda `SingletonLock` ou outro erro | Fallback: "Não consegui ativar Chromium aqui — Snap+root é tricky. Marcado como skipped — você pode reativar depois com 'ativa browser' (vai precisar instalar Chromium manual via `apt install chromium-browser` ou similar). Bora seguir o passo? Brave Search e GitHub funcionam sem Chromium — você só perde leitura de página completa (Brave dá título+descrição, suficiente em 70% dos casos)." |

**Limite anti-loop:** se 2 tentativas de fix falharem (SingletonLock persiste), aplicar fallback skipped diretamente. Não tentar terceira vez.

**Após instalação manual (local-dev):** se aluno mandar "instalado", validar via `which chromium` ou `which chromium-browser`. Se OK, marca `chromium_active=true`. Se não encontrar, "Não encontrei `chromium` nem `chromium-browser` no PATH. Você instalou onde? Se preferir, manda 'pula' e ativa depois."

Se "pula": marca `chromium_active=false` em `MEMORY.md`. Aluno pode ativar depois com 'ativa browser'.

### 5. Ativar backup-workspace-github (skill em operacional/)

Após GitHub Token validado, dispara skill `backup-workspace-github` automaticamente:

```
"Agora vou ativar a skill backup-workspace-github.
Ela vai:
1. Criar repo privado no seu GitHub: {username}/openclaw-workspace-backup
2. Configurar git no workspace
3. Criar .gitignore defensivo (.env NUNCA vai pro backup)
4. Criar cron diário às 03:00 BRT
5. Fazer primeiro push (smoke test)

Confirma?"
```

Se sim: invoca skill `backup-workspace-github` (passa `GITHUB_TOKEN` pro escopo da skill, não pede de novo). Aguarda skill terminar.

Se aluno disser "não, depois": marca `backup_disabled=true` em `MEMORY.md`. Aluno reativa com "ativa backup".

⚠️ **CRÍTICO — não falsifique sucesso:** se aluno pulou Brave OU pulou GitHub OU desabilitou backup, **NÃO marque `conectado=true` no final do passo**. Use `conectado=partial` + flags individuais (`brave_search_active`, `github_token_active`, `backup_active`, `chromium_active`) refletindo o que REALMENTE foi feito. A skill `primeira-vitoria` (passo 6) verifica essas flags antes de oferecer pós-vitória — se algo crítico ficou pendente (ex: backup que aluno disse "depois"), ela vai voltar pra completar em vez de tratar como opcional.

Falha real observada (sessão Lia/Mira 02/05): aluno disse "Roda aí" sobre Brave mas wizard pulou pra primeira vitória sem configurar nada e marcou passo 5 ✓. Backup nunca foi ativado mas apareceu como "opção pós-vitória" depois — confundiu o fluxo. Não repetir.

### 6. Confirmação final ao aluno

```
"✓ Conectado:
 - Brave Search API → busca web disponível
 - GitHub Token (@{username}) → repo privado backup criado
 - {Chromium instalado / Chromium não instalado (pode ativar depois)}
 - backup-workspace-github → cron 03:00 BRT, primeiro push completou

A partir de agora, você pode pedir:
 - 'pesquisa X' → eu busco no Brave
 - 'lê essa URL' → eu abro no Chromium {se instalado}
 - 'restaura backup de Y' → eu acesso histórico do GitHub

E todo dia às 03:00 BRT, seu workspace inteiro vira commit no GitHub.
Você não precisa pensar nisso."
```

### 7. Pergunta-âncora

Pergunta literal (mapa-aulas.md passo 5):

```
"Rapidão antes de fechar este passo: imagina que sua chave OpenAI
vazou no Twitter por engano. O que você precisa fazer agora?"
```

| Resposta esperada | Validação |
|---|---|
| "revogar a chave" / "criar nova" / similar | "Exato. Vai em platform.openai.com/api-keys, revoga a chave vazada (botão 'Revoke'), gera nova, atualiza no .env. Toda chave de API funciona assim — revogar é instantâneo." |
| Errou ou vago | "Você vai em platform.openai.com/api-keys, clica 'Revoke' na chave vazada (instantâneo, ela morre), gera nova, atualiza no seu .env. Mesma lógica pra Brave, GitHub, qualquer chave. Por isso 1Password ajuda — quando você troca chave, atualiza num lugar só." |

Fechar com:

```
"Se quer aprofundar gestão de credenciais (1Password, rotação de
chaves, vault), a aula é a Aula 10 (Instalando 1password) — manda 'aula 10'.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 5 como feito. Bora pro passo 6 — sua primeira vitória?"
```

### 8. Atualizar MEMORY.md

**Regra:** `conectado` reflete o estado REAL. Use `true` SÓ se TODOS os 3 essenciais (Brave + GitHub + backup) foram configurados com sucesso. Caso contrário, `partial` + flags individuais.

```markdown
## Flags
conectado: {true | partial | false}
brave_search_active: {true | false | skipped}
github_token_active: {true | false | skipped}
backup_active: {true | false | postponed}
chromium_active: {true | false | skipped}

## Decisões da jornada
- {data}: Conectou {N de 4} superpoderes. {Brave: ✓/skip} | {GitHub: ✓/skip} | {Backup: ✓/postponed} | {Chromium: ✓/skip}.
```

**Exemplos do que `conectado` deve ser:**
- Brave ✓ + GitHub ✓ + backup ✓ + Chromium ✓ → `conectado: true`
- Brave ✓ + GitHub ✓ + backup ✓ + Chromium skipped → `conectado: true` (Chromium é opcional)
- Brave ✓ + GitHub ✓ + backup postponed → `conectado: partial` (primeira-vitoria vai voltar pra completar backup)
- Brave skipped + GitHub skipped → `conectado: false` (passo 5 efetivamente não rodou)

Atualizar `onboarding_current_step: 6`.

### 9. Devolver controle pra onboarding-checklist

## Caminho alternativo: aluno só quer 1 das 3

Se aluno disser "só quero Brave, não preciso de GitHub agora":

```
"Tranquilo. Brave configurado, GitHub fica pra depois.

Aviso: sem GitHub, você fica sem backup automático do workspace.
O OpenClaw Managed faz backup nativo do container, mas se o container
explode, você perde tudo até o último snapshot deles.

Você pode ativar GitHub Token depois mandando 'ativa github' a qualquer
momento.

Vou marcar Brave ativo, GitHub pendente, e seguir."
```

Marca `github_token_active=false`, `backup_active=false`. Devolve controle.

## Critérios de sucesso (caminho completo)

- [ ] `BRAVE_SEARCH_API_KEY` no `.env` validada
- [ ] `GITHUB_TOKEN` no `.env` validado
- [ ] (opcional) Chromium instalado E `chromium_installed=true` em `MEMORY.md`
- [ ] backup-workspace-github skill ativada (cron criado, primeiro push completou)
- [ ] `.env` no `.gitignore` (proteção)
- [ ] `conectado=true` em `MEMORY.md`
- [ ] `onboarding_current_step=6`
- [ ] Pergunta-âncora respondida
- [ ] Aula D2 mencionada

## Erros comuns

- **Aluno colou chave Brave do site errado:** Brave tem 2 produtos (Search API + Subscription Key pra Brave Browser). Validar via header `X-Subscription-Token` pega isso (chave Browser não funciona).
- **GitHub Token sem scope `repo`:** validação API user passa, mas criação de repo via API falha. Pegar isso na ativação do backup-workspace-github (skill faz call de criação) e pedir aluno regenerar com scope correto.
- **Aluno tem 2FA no GitHub e tenta usar password:** explicar que Service Token substitui password pra API (não usa password mesmo).
- **`.env` foi commitado por engano antes desse passo:** aluno chega aqui com .env público no GitHub. Não detectar é catastrófico. Antes de salvar GITHUB_TOKEN, fazer `git log -- .env` no workspace pra ver se foi commitado. Se sim, alertar e instruir revogação imediata.
- **Aluno pede Apify, Perplexity, Notion:** ainda não cobertos no v1 do kit. Resposta: "Apify e Perplexity ficam pra skills opcionais pós-vitória. Notion vira Aula 12. Por enquanto: Brave + GitHub cobre 80%."

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 1 (backup antes):** `.env` ANTES de adicionar/modificar qualquer chave, sempre backup timestamped.
- **Princípio 2 (confirmação humana):** confirma antes de salvar cada chave, antes de ativar backup-workspace-github.
- **Princípio 3 (NUNCA elevação via agente):** instalação de Chromium é manual no terminal, mesmo padrão do passo 3.
- **Princípio 4 (narrar antes de fazer):** explica O QUE cada chave faz e POR QUE precisa antes de pedir.
- **Princípio 5 (atualizar MEMORY ao concluir):** múltiplas flags (cada integração separada) + decisão consolidada.
- **Princípio 9 (parar se algo der errado):** se chave falha validação 2x, pausa e oferece grupo (não loop infinito).
- **Princípio 11 (detectar antes de pedir):** lê cada chave individualmente do `.env`. Pula a que já tá válida. Pede só a que falta.
- **Princípio ".env first":** TODAS as 3 credenciais seguem o padrão (nome canônico no `.env`, leitura prioritária, validação obrigatória).

### Nomes canônicos no .env

```bash
BRAVE_SEARCH_API_KEY=BSAk-xxx
GITHUB_TOKEN=ghp_xxx
# Chromium não usa env var, é binário
```

JAMAIS usar variantes (`brave-key`, `BRAVE_TOKEN`, `gh_token`). Padrão único pro ecossistema inteiro.

## Modo A vs Modo B

**Modo A:**
```
"Bora pro Módulo 5 — Conectar superpoderes.
Aulas correspondentes: D2 (1Password e secrets) + D4 (integrações).
Recomendo D2 antes — fala de gestão de credenciais como conceito."
[fluxo numerado em 3 partes: Brave, GitHub, Chromium]
```

**Modo B:**
```
"Agora os superpoderes externos. 3 chaves: Brave (busca web),
GitHub (backup), Chromium (browser, opcional). 12min se você nunca
gerou nenhuma."
[fluxo conversacional]
```

## Comando "exemplo" durante este wizard

Sem template Amora correspondente (chaves são código). Resposta padrão:

```
"Pra esse passo não tenho exemplo do Bruno — chaves API são só
código numérico, não tem 'jeito' de fazer.

Se você travou em algo específico (não sabe onde clicar, conta nova,
2FA, scope), me conta o que tá pegando que eu te ajudo."
```

## Referências

### Internas
- Princípios universais: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md) (especialmente .env first em P11)
- Skill backup-workspace-github: [`../../operacional/backup-workspace-github/SKILL.md`](../../operacional/backup-workspace-github/SKILL.md)
- Decisão D07 (Chromium + Brave Search): [`../../../../DECISOES-ARQUITETURA.md`](../../../../DECISOES-ARQUITETURA.md)
- Decisão D08 (.env default): mesma referência
- Decisão D11 (backup GitHub no setup): mesma referência
- Pergunta-âncora oficial: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 5)

### Externas
- Brave Search API console: https://api.search.brave.com/app/keys
- GitHub tokens: https://github.com/settings/tokens
- OpenClaw browser docs: rodar `openclaw browser --help`

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Suporte opcional a Perplexity API key (alternativa ao Brave pra busca contextual)
- v1.2: Suporte a Apify token (web scraping)
- v1.3: Detecção e migração `.env` → 1Password vault (skill separada `migra-secrets-1password`)
- v2: UX progressiva — começa com 1 chave (Brave), depois sugere expandir conforme uso
