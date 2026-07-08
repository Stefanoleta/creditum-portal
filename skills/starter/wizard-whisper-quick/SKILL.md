---
name: wizard-whisper-quick
status: ATIVO
category: starter
owner: aluno
version: 1.12
mode: guided
estimated_time: 5min (ou 15s se chave já existe e válida — qualquer ambiente)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "configura whisper" / "ativa áudio" / "quero mandar áudio", OR when dispatched by onboarding-checklist as passo 0 (pré-passo opcional). Configures OpenAI API key in .env so student can send voice messages on Telegram (Whisper) AND have semantic memory (embeddings). Detects existing key first (Princípio 11/.env first OBRIGATÓRIO), validates with API call, asks only if missing. **v1.12 (kit v2.4 — stress test multi-persona): fast-path AGORA INDEPENDENTE DE AMBIENTE. Antes (v1.10/v1.11) só ativava se `ambiente: managed`. Stress test Rodrigo (VPS root com chave válida em .env) revelou: aluno era re-entrevistado por causa de condicional desnecessária. Fix: se chave existe (env var OR .env) E smoke test retorna HTTP 200 → pula entrevista, independente de ambiente. Princípio: condição "chave válida" não é exclusiva de Managed. Em VPS root + local-dev, mesma economia.** v1.11: env var fast-path (chave Managed em env var, não .env). v1.10: fast-path Managed inicial. v1.9: header P13/14/15. v1.8: pulo agendar 24h vs definitivo. v1.7: P11 reforçado.
---

# Wizard Whisper Quick — Passo 0 (Pré-passo opcional)

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
> **P14 — Smoke tests visíveis.** Validação da chave OpenAI + smoke test de áudio SEMPRE mostram (1) comando `curl` exato, (2) output literal (HTTP code + transcrição), (3) só DEPOIS interpreta. Sem evidência = ABORTA e pede ajuda. NUNCA finge que validou ou que transcreveu áudio que não rodou — falha real Dr. Thiago v1.9.1.
>
> **P15 — Mensagens `<canonical>` literais.** "Você quer ajuda pra pegar essa chave, ou já tem ela fácil aí?" + 3 opções pós-pulo (agendar 24h / definitivo / volta quando quiser) são CANONICAL — usar LITERAL.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — Telegram faz word-wrap natural.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

> ⚠️ **Agente:** se você é a `onboarding-checklist` despachando este wizard, **NÃO IMPROVISE uma versão simplificada na conversa**. Read este arquivo INTEIRO e siga à risca. Em particular: SEMPRE rode a Detecção (Princípio 11 abaixo) ANTES de mandar qualquer pergunta ao aluno. Falha real (sessão Lia 02/05): agente perguntou "quer ativar Whisper?" sem checar `.env`, gerando pergunta desnecessária pra aluno que já tinha chave.

## Promessa

Aluno termina esse passo conseguindo **mandar áudio em vez de digitar** no Telegram. Eu transcrevo na hora e respondo. Quem tá no celular dirigindo, andando, fazendo café — fala em vez de teclar.

**Bonus:** a mesma chave OpenAI configurada aqui também serve pra **memória semântica** (embeddings) — quando aluno tem essa memória ativa, agente "lembra" coisas pelo SIGNIFICADO, não só pelo texto exato. Útil pra recall de decisões antigas, padrões em conteúdo, etc. Sem chave OpenAI: só busca textual literal.

Sem ele, aluno passa a jornada inteira digitando + perde memória semântica. Com ele, passa falando + tem agente que entende contexto. Mudança grande na primeira impressão.

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 0 antes da jornada principal

**Trigger explícito (standalone):**
- "configura whisper"
- "ativa áudio"
- "quero mandar áudio"
- "configura openai"

**NÃO disparar se:**
- `whisper_configured=true` em `MEMORY.md` E última validação foi há menos de 7 dias
- Aluno explicitamente pulou no passo 0 (`whisper_skipped=true` em `MEMORY.md`)

## Princípio 11 — Detecção antes de pedir (OBRIGATÓRIO, não pular)

⚠️ **CRÍTICO:** sua PRIMEIRA ação ao ser invocada é a checagem abaixo. Não escreva NADA pro aluno antes de checar. Se pular essa detecção, vai perguntar coisa que aluno já configurou — irrita, parece amador.

**Sequência obrigatória de detecção:**

```bash
# 1. Lê .env (caminho varia por workspace, geralmente ~/workspace/.env ou ~/.env)
cat $WORKSPACE/.env | grep -E "^OPENAI_API_KEY="

# 2. Se existe, valida com call de teste à API:
curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -o /dev/null -w "%{http_code}"

# 3. Interpreta:
#    200 → chave válida
#    401 → chave inválida/revogada
#    429 → chave OK mas sem saldo
#    outro → investiga
```

**Falha real observada (Lia 02/05):** agente recebeu "wizard direto" e foi PERGUNTAR "quer ativar Whisper?" sem rodar a detecção. Aluno tinha chave, virou pergunta desnecessária. Princípio 11 existe pra isso — **não pule**.

### Fast-path por chave detectada (kit v2.4 — INDEPENDENTE de ambiente)

⚠️ **Mudança v1.12 (kit v2.4):** antes (v1.10/v1.11) o fast-path só rodava se `ambiente: managed`. Agora a condição passa a ser **"chave válida em env var OR .env"** — independente de ambiente. Razão: stress test Rodrigo (VPS root com chave existente no `.env`) revelou que aluno era re-entrevistado mesmo já tendo chave válida. A condicional `if ambiente == managed` era desnecessária — o que importa é se a chave existe e funciona, não de onde veio.

**Detecção em 2 fontes (mantida da v1.11):**

```bash
# 1. PRIMEIRO: env var do processo (fonte primária em Managed)
if [ -n "$OPENAI_API_KEY" ]; then
    echo "found_in_envvar"
    KEY="$OPENAI_API_KEY"
fi

# 2. FALLBACK: .env do workspace (fonte primária em VPS root / local-dev / Managed que tirou da env var)
if [ -z "$KEY" ] && [ -f "$WORKSPACE/.env" ] && grep -q "^OPENAI_API_KEY=" "$WORKSPACE/.env"; then
    echo "found_in_dotenv"
    KEY="$(grep "^OPENAI_API_KEY=" "$WORKSPACE/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
```

Se achou em qualquer um dos 2 lugares → smoke test visível (P14):

```bash
# Validar chave (não importa de qual fonte veio)
curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer $KEY" \
     -o /dev/null -w "%{http_code}"
```

**Se HTTP 200 → narra (mensagem ajusta-se ao ambiente detectado):**

| `ambiente:` | Mensagem |
|---|---|
| `managed` | "✓ Detectei sua chave OpenAI vinda do setup Managed (você forneceu quando instalou o OpenClaw no painel Hostinger). Validei, tá funcionando. Whisper + memória semântica já prontos." |
| `vps-root` | "✓ Detectei sua chave OpenAI no `.env` do workspace. Validei, tá funcionando. Whisper + memória semântica já prontos — sem pergunta extra." |
| `local-dev` ou `unknown` | "✓ Detectei sua chave OpenAI configurada (env var ou `.env`). Validei, tá funcionando. Whisper + memória semântica já prontos." |

→ pula direto pro smoke test (seção 5 abaixo). Marca `whisper_configured=true` em MEMORY.md.

**Se HTTP ≠ 200:**
- 401 (chave inválida/revogada) → "Achei uma chave OpenAI configurada, mas a validação retornou 401 (chave inválida ou revogada). Fluxo: você gera nova chave OU me manda outra que eu sobrescrevo. Continuar?" → cai no fluxo normal abaixo (passo 2 — instruir geração)
- 429 (sem saldo) → "A chave funciona, mas a conta tá sem crédito. Adiciona $5 em platform.openai.com/billing e me chama de volta com 'continua' que eu valido de novo."
- Outro → mostrar output literal + investigar com aluno (P14)

**Se NEM env var NEM .env tem chave:**

Comportamento normal — entrevistar conforme fluxo tradicional abaixo (passo 1).

**Por que Fast-path independente de ambiente:** caso Rodrigo (VPS root com chave) era idêntico ao caso Managed em termos de UX — aluno já tinha chave, agente devia detectar. Condicional `ambiente == managed` excluía 15k VPS legados sem motivo. Agora cobertura é universal.

**Princípio 11 estendido (kit v2.1):** detectar ANTES de instruir. Aqui aplica direto — chave existe e funciona = pula entrevista, mesmo padrão pra qualquer ambiente.

### 4 estados detectáveis

| Estado | Ação |
|---|---|
| **Chave existe e válida** | Marca `whisper_configured=true`, narra "✓ Achei sua chave OpenAI no .env, validei, funcionando", pula direto pro smoke test |
| **Chave existe mas inválida** | Explica erro específico (revogada/expirada/sintaxe), pede chave nova |
| **Chave não existe no .env** | Pede ao aluno (fluxo normal abaixo) |
| **`.env` não existe** | Cria `.env` na raiz do workspace + pede chave |

## Fluxo principal (quando precisa pedir chave)

### 1. Narrar o que vai acontecer (SÓ se detecção do P11 mostrou que precisa pedir)

⚠️ Se Princípio 11 acima mostrou **chave válida**: PULE este passo, vá direto pro smoke test (passo 5). Mensagem: "✓ Achei sua chave OpenAI no .env, validei, funcionando. Whisper + memória semântica já estão prontos. Vou rodar smoke test pra confirmar."

⚠️ Se chave NÃO existe ou tá inválida, USA esse texto:

```
"Antes da gente começar a jornada principal, vou configurar uma coisa
que destrava muito: transcrição de áudio + memória semântica.

Pra que serve a chave OpenAI:
1. **Whisper** — transcrever áudio que você manda (no celular, no carro,
   fala em vez de digitar)
2. **Memória semântica** — embeddings que me deixam "lembrar" coisas
   pelo SIGNIFICADO, não só pelo texto exato (recall de decisões
   antigas, padrões em conteúdo, etc)

Custa centavos por mês de uso (~R$2-5 pra uso pessoal médio).

**Você já tem chave OpenAI configurada, ou precisa de ajuda pra pegar?**

→ Se já tem (mas não tá no meu .env ainda): só me manda aqui que eu salvo
→ Se quer ajuda pra pegar: te guio passo-a-passo (cadastro → cartão → gera chave). 5min.
→ Se prefere avançar pro próximo passo: manda 'pula' que eu te dou 2 opções de retomada."
```

Esperar resposta:
- Se aluno mandar a chave direto (começa com `sk-proj-` ou `sk-`): pular pro passo 3 (validar) — não precisa instruir geração.
- Se aluno mandar "ajuda" / "preciso ajuda" / "como pegar": ir pro passo 2 (instruir geração passo-a-passo).
- Se aluno mandar "pulo" / "depois" / "deixa pra depois": ir pro passo 1.5 (tratar pulo com agenda vs definitivo) — **NÃO** marcar `whisper_skipped=true` direto.
- Outras respostas ambíguas ("já tenho" sem mandar a chave): pedir pra mandar a chave.

### 1.5. Tratar pulo (agendar 24h vs definitivo) — v1.9

⚠️ **Nova seção v1.9 (Bruno feedback):** quando aluno escolhe pular uma etapa, NÃO marca `whisper_skipped=true` direto. Pergunta antes se quer agendar lembrete ou pular definitivo. Razão: pulo silencioso vira pendência órfã que aluno nunca lembra de retomar.

```
"Beleza, pulando o Whisper. Antes de avançar, escolhe uma:

1. **Agendo lembrete pra daqui 24h** — te chamo aqui no Telegram amanhã
   pra retomar esse passo (volta a perguntar se quer ativar)

2. **Pulo definitivamente** — saio do caminho normal. Você pode voltar
   quando quiser, é só me pedir 'ativa whisper' (ou 'configura whisper')

Manda 1 ou 2."
```

**Comportamento por resposta:**

| Resposta | Ação |
|---|---|
| `1` ou "agenda" / "lembra" / "amanhã" | Marcar `whisper_reminder_at: {NOW + 24h ISO}` em MEMORY.md. Confirmar: "Anotado. Te chamo amanhã (≈ {DATA_HORA_LOCAL}). Bora pro próximo passo." |
| `2` ou "definitivo" / "pula tudo" | Marcar `whisper_skipped_permanently: true` em MEMORY.md. Confirmar: "Beleza, pulando definitivo. Lembrete: pode voltar quando quiser, é só me pedir 'ativa whisper'." |
| Resposta ambígua | Repetir as 2 opções uma vez. Se persistir ambíguo, default seguro: opção 2 (pular definitivo, com aviso de retomada). |

**Mecanismo do agendamento (v1.9 = MVP passivo):**

- Flag `whisper_reminder_at: {timestamp}` é gravada em MEMORY.md
- Quando aluno **abrir o Telegram naturalmente** depois das 24h, agente detecta a flag vencida e dispara mensagem de retomada — não precisa de cron-DM ativo
- **Limitação consciente:** se aluno não voltar, lembrete não chega. Aceito como tradeoff até cron-worker por aluno existir (depende da Onda 12 — detecção ambiente Managed/VPS + infra de cron-DM ativo)
- Mensagem de retomada (quando agente detecta flag vencida na próxima sessão): "Oi, lembra que você pediu pra eu te chamar sobre o Whisper? Quer ativar agora ou empurra mais?" → reabre 1.5

**Independente da escolha (1 ou 2), salvar em MEMORY.md:**

```markdown
## Flags
whisper_skip_choice: agendado | definitivo
whisper_reminder_at: 2026-05-04T22:55:00-03:00  # só se opção 1
whisper_skipped_permanently: true  # só se opção 2

## Decisões da jornada
- {data}: Pulou o passo 0 (Whisper) — escolha: {agendado | definitivo}
```

Após gravar flag e confirmar, **devolve controle pra `onboarding-checklist`** que segue pro passo 1.

### 2. Instruir como gerar chave

```
"Pra gerar a chave OpenAI:

PARTE 1 — se você NUNCA usou OpenAI API antes:

1. Abre https://platform.openai.com/signup (cria conta — pode usar
   o mesmo email do ChatGPT Plus, mas a API é separada)
2. Confirma o email (chega em 1min)
3. Vai em https://platform.openai.com/billing
4. Clica 'Add payment method' → adiciona cartão
5. Adiciona crédito inicial ($5 mínimo recomendado — dura ~6 meses
   pra uso pessoal médio de Whisper)
6. Sem isso, qualquer chave que você gerar vai retornar 429 (sem saldo)

PARTE 2 — gerar a chave:

1. Abre https://platform.openai.com/api-keys (logado)
2. Clica 'Create new secret key' (canto superior direito)
3. Nome sugerido: 'openclaw-{seu-agente}' (ex: 'openclaw-atlas')
4. Permissions: 'All' (default tá bom)
5. Clica 'Create secret key'
6. COPIA a chave que aparece (começa com 'sk-proj-' ou 'sk-')

⚠️ Atenção segurança:
- A OpenAI mostra a chave UMA vez só. Fechou janela = tem que gerar outra.
- ANTES de colar aqui no Telegram: confirma que esse chat é só seu
  (não é grupo). Chave em chat público = vazada.
- Se desconfiar de qualquer coisa, revoga a chave em
  platform.openai.com/api-keys (botão 'Revoke') e gera nova.

Pode mandar a chave."
```

### 3. Validar a chave que aluno colou

Quando aluno mandar a chave, **antes de salvar**:

```bash
# Testa com call simples ao endpoint /v1/models
curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer {chave_recebida}" \
     -o /tmp/openai-test.json -w "%{http_code}"
```

| Resposta | Ação |
|---|---|
| 200 | Chave válida, prossegue |
| 401 | "Essa chave veio com erro 401 — autenticação falhou. Provável que você copiou só parte dela. Pode mandar de novo?" |
| 429 | "A chave funciona, mas a conta tá sem crédito. Adiciona $5 em platform.openai.com/billing e tenta de novo." |
| Outros | "Erro inesperado: {código}. Manda no grupo @cursoopenclaw que ajudo a debugar." |

### 4. Salvar no .env (formato canônico)

Antes de salvar, aplicar **Princípio 1** (backup):

```
Existe .env já?
  - Se SIM: backup em ~/backups/pre-wizard-whisper-{YYYY-MM-DD-HHMM}/.env
  - Se NÃO: cria .env do zero
```

Adicionar/atualizar linha no `.env`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx
```

**Importante:**
- Nome canônico exato: `OPENAI_API_KEY` (não `openai-key`, `OPENAI_TOKEN`, etc).
- Se já existir linha `OPENAI_API_KEY=...`, substitui (não duplica).
- Garantir que `.env` tá em `.gitignore` (se workspace tem git inicializado).

Confirmar ao aluno:

```
"✓ Chave salva em .env como OPENAI_API_KEY.
✓ Adicionei .env no .gitignore (se ainda não estava).

Próxima vez que algum wizard precisar dessa chave, ele acha sozinho.
Você não vai precisar mandar de novo."
```

### 5. Smoke test (pergunta-âncora embutida)

```
"Rapidão antes de fechar este passo: pra confirmar que tá tudo certo,
manda agora um áudio curto dizendo qualquer coisa — 'oi', 'tô testando',
'gravando aqui'. Eu transcrevo e te mostro."
```

Quando aluno mandar áudio, transcreve via Whisper:

```bash
curl -s https://api.openai.com/v1/audio/transcriptions \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: multipart/form-data" \
     -F file=@{caminho_audio} \
     -F model=whisper-1
```

Mostra transcrição:

```
"✓ Transcrevi: \"{texto}\"

Funcionando. A partir de agora pode mandar áudio em qualquer momento —
eu entendo igual texto. Pode misturar áudio + texto na mesma conversa
sem problema.

Se quer aprofundar como configurar OpenAI API e gerenciar custos,
a aula é a *A0* — manda 'aula A0'.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 0 como feito. Bora pro passo 1 (configurar a personalidade do seu agente)?"
```

### 6. Atualizar MEMORY.md

Marcar flag e logar decisão:

```markdown
## Flags
whisper_configured: true

## Decisões da jornada
- {data}: Configurou OpenAI API key. Smoke test áudio passou. Transcrição OK.
```

Atualizar `onboarding_current_step: 1`.

### 7. Devolver controle pra onboarding-checklist

Wizard termina. `onboarding-checklist` retoma e mostra checklist atualizada.

## Caminho alternativo: chave já configurada

Quando detecção (passo 0 do fluxo) acha chave válida:

```
"✓ Detectei que sua chave OpenAI já está configurada no .env.
Validei agora — funcionando.

Mesmo assim, vou fazer um smoke test pra ter certeza que Whisper tá ok:

Manda um áudio curto pra mim agora. Pode ser qualquer coisa."
```

A partir daí, fluxo padrão (transcreve, mostra, marca como feito).

**Por que validar mesmo já tendo:** chave pode estar lá mas com saldo zerado, sem permissão pra Whisper, ou de uma conta diferente. Smoke test valida end-to-end em 30s.

## Caminho alternativo: aluno pula

Se aluno mandar "pulo" antes de gerar chave:

```
"Beleza, pulei o passo 0. Você pode ativar áudio depois mandando
'configura whisper' a qualquer momento, ou no passo 5 (Conectar)
junto com as outras chaves.

Marquei como pulado. Bora pro passo 1?"
```

Marca `whisper_skipped=true` em `MEMORY.md` e devolve controle pra `onboarding-checklist`.

## Critérios de sucesso

- [ ] `OPENAI_API_KEY` no `.env` E validada (call de teste retornou 200)
- [ ] `.env` existe no `.gitignore` (proteção contra commit acidental)
- [ ] Smoke test áudio completou (aluno mandou áudio, agente transcreveu, mostrou texto)
- [ ] `whisper_configured=true` em `MEMORY.md`
- [ ] `onboarding_current_step=1` (avançou)
- [ ] Pergunta-âncora respondida (smoke test = a pergunta-âncora desse passo)

OU (se pulou):

- [ ] `whisper_skipped=true` em `MEMORY.md`
- [ ] Aluno avisado que pode reativar via "configura whisper"

## Erros comuns

- **Aluno colou chave inválida (típico erro de copy-paste):** explicar erro específico (401 = autenticação, 429 = sem saldo) ao invés de "deu errado". Aluno volta pro platform.openai.com com clareza do que verificar.
- **Aluno colou chave do ambiente errado** (ex: chave de uma org sem crédito, ou chave revogada num projeto): smoke test pega isso. Pedir nova.
- **Aluno mandou áudio mas Whisper falhou:** quase sempre é problema de formato/tamanho do áudio. Telegram converte automaticamente, mas se aluno mandou anexo de outro lugar, pode dar erro. Investigar.
- **`.env` não tá em `.gitignore`:** falha catastrófica se aluno commitar. Sempre validar antes de salvar chave.
- **Aluno fica preso na criação da conta OpenAI:** link direto + screenshot do botão "Create new secret key" ajuda. Próxima versão: incluir screenshot inline.

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 1 (backup antes de sobrescrever):** se `.env` já existe, faz backup timestamped antes de adicionar/modificar `OPENAI_API_KEY`.
- **Princípio 2 (confirmação humana):** pede confirmação antes de salvar a chave no `.env` ("Vou salvar essa chave em ~/.env como OPENAI_API_KEY. Confirma?").
- **Princípio 4 (narrar antes de fazer):** explica o que vai acontecer (gerar chave OpenAI, custo, smoke test) antes de pedir aluno fazer.
- **Princípio 5 (atualizar MEMORY ao concluir):** marca `whisper_configured=true` ou `whisper_skipped=true`.
- **Princípio 9 (parar se algo der errado):** se chave falhar validação 3x seguidas, parar e oferecer ajuda do grupo (não fica num loop infinito).
- **Princípio 11 (detectar antes de pedir):** lê `.env` primeiro. Se já tem chave válida, NÃO pede de novo. Apenas valida e segue pro smoke test.
- **Princípio ".env first":** chave OpenAI segue padrão universal (nome canônico `OPENAI_API_KEY`, leitura prioritária do `.env`).

## Modo A vs Modo B (apresentação)

A lógica é a mesma. Só muda o jeito de apresentar:

**Modo A (aula-por-aula):**
```
"Bora pro Módulo 0 — Whisper.
A aula correspondente é a A0 (Visão geral + créditos OpenAI).
Recomendo assistir antes pra entender por que a OpenAI cobra
diferente pra OAuth e API."
[segue fluxo]
```

**Modo B (wizard direto):**
```
"Antes da gente começar, uma coisa rápida que destrava você:
áudio. Posso configurar pra você mandar áudio em vez de digitar?"
[segue fluxo conversacional, sem mencionar passo/aula]
```

Por baixo, mesmo fluxo de detecção/validação/salvamento/smoke test.

## Comando "exemplo" neste contexto

Se aluno pedir "exemplo" durante esse wizard, NÃO tem template Amora correspondente (chave API é só código). Resposta padrão:

```
"Pra esse passo não tenho exemplo do Bruno — chave OpenAI é só
código numérico, não tem 'jeito' de fazer.

Se você travou em algo específico (não sabe onde clicar, conta nova,
cartão), me conta o que tá pegando que eu te ajudo."
```

## Referências

### Internas
- Princípios universais: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md) (Princípios 1, 2, 4, 5, 9, 11)
- Comando "pulo": [`../onboarding-checklist/references/comandos-canonicos.md`](../onboarding-checklist/references/comandos-canonicos.md) (comando 2)
- Pergunta-âncora padrão: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 0)

### Externas
- OpenAI API keys: https://platform.openai.com/api-keys
- OpenAI billing: https://platform.openai.com/billing
- OpenAI Whisper docs: https://platform.openai.com/docs/guides/speech-to-text
- Custos Whisper: $0.006/min de áudio (~R$3 por 100min — uso pessoal médio)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Screenshot inline mostrando exatamente onde clicar em platform.openai.com (reduz fricção de aluno leigo)
- v1.2: Smoke test multi-idioma (validar que aluno em PT-BR funciona perfeito)
- v1.3: Detecção de saldo OpenAI restante (pré-aviso quando aluno tá com $1 de crédito)
- v2: Suporte alternativo a Groq Whisper (gratuito, rate-limited) pra aluno sem cartão
