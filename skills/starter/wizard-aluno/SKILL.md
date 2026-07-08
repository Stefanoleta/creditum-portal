---
name: wizard-aluno
status: ATIVO
category: starter
owner: aluno
version: 1.1
mode: guided
estimated_time: 3min (ou 30s se já configurado)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4, gemini-pro]
description: Use when student types "configura usuário" / "cria meu perfil" / "USER.md", OR when dispatched by onboarding-checklist as passo 2. Creates USER.md with student's basic info (nome, timezone, o que faz, tom preferido). Detects existing USER.md first (Princípio 11). Templates Amora opt-in via "exemplo". Pergunta-âncora: "onde isso ficou salvo? edit direto pega automático?". v1.1 (kit v2.2): header com Princípios 13/14/15 explícitos no topo (auditoria pós-v2.1).
---

# Wizard Aluno — Passo 2 (Personalidade do aluno)

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
> **P14 — Smoke tests visíveis.** Comando externo SEMPRE mostra (1) comando exato em bloco de código, (2) output literal em bloco de código, (3) só DEPOIS interpreta/narra. Sem evidência = ABORTA e pede ajuda. NUNCA finge que rodou.
>
> **P15 — Mensagens `<canonical>` literais.** Trechos marcados `<canonical>...</canonical>` usam LITERAL. Não reformula, não "melhora", não substitui exemplos. Ajustar TOM (formal/casual via SOUL.md) é OK; estrutura/ordem/keywords técnicas preservadas.
>
> **P17 — Formatação Telegram-friendly.** Mensagens canonical pro aluno usam parágrafos contínuos (1 linha por parágrafo). NÃO quebrar manualmente a cada ~70 chars — Telegram faz word-wrap natural.
>
> Detalhes: `../onboarding-checklist/references/principios-defensivos.md` (P1–P17).

> ⚠️ **ANTI-PRESUNÇÃO (kit v2.2 — Princípio 16 aplicado a este wizard):**
>
> NÃO presumir dados do USER baseado em conversa anterior. Mesmo que aluno tenha mencionado nome, timezone, profissão, ou tom em mensagens anteriores, **começar pela Detecção (P11)** + perguntas canônicas deste wizard. Não pular passos "porque já sei a resposta".
>
> Em vez de pré-preencher USER.md baseado em "intuição da conversa", invocar wizard normalmente. Cada campo confirmado pelo aluno = USER.md preciso. Pré-preenchido sem validação = USER.md errado em 2 dias.

## Promessa

Em 3 minutos, agente passa a saber quem é o aluno: nome real, timezone, o que faz, jeito de falar preferido. 1 arquivo (`USER.md`) que o agente lê toda mensagem.

A diferença prática: agente para de te chamar de "aluno" / "usuário" / nada. Começa a chamar pelo seu nome, ajustar tom, considerar seu contexto profissional.

## Quando disparar

**Trigger automático:**
- `onboarding-checklist` despacha como passo 2

**Trigger explícito (standalone):**
- "configura usuário"
- "cria meu perfil"
- "preenche USER"
- "muda quem eu sou"

**NÃO disparar se:**
- `aluno_configured=true` em `MEMORY.md` E `USER.md` existe com `nome` preenchido (não-placeholder)

Se aluno mandar trigger explícito mesmo já configurado:

```
"Você já configurou seu perfil em {data}. Quer:
a) Refazer do zero (backup do atual antes)
b) Editar trecho específico (manda 'muda meu nome', 'muda tom', etc)
c) Cancelar"
```

## Princípio 11 — Detecção antes de pedir

```
1. USER.md existe?
   - Sim e tem campo `nome:` ou `Nome:` preenchido com valor real: ✓
   - Sim mas placeholder ou vazio: ⏳ tratar como nada
   - Não: ⏳
```

### 3 estados detectáveis

| Estado | Ação |
|---|---|
| **Preenchido** | "✓ Detectei seu USER.md já preenchido (nome: {nome_extraído}). Não vou mexer. Vou direto pra pergunta-âncora." |
| **Existe mas placeholder** | Tratar como "nada feito", avisar: "Detectei USER.md mas tá com placeholders ainda — vou completar agora" |
| **Nada feito** | Fluxo normal |

## Fluxo principal (entrevista)

### 1. Narrar promessa

```
"Vamos configurar a SUA personalidade — quem você é. 3min, 1 arquivo.

USER.md vai ter o básico de você: nome, timezone, o que você faz,
como prefere que eu fale com você.

Esse arquivo eu leio toda vez que vou responder. Se editar lá direto
depois, muda na hora. Você sempre tem controle do que eu sei sobre você.

Vou te perguntar 4 coisas. Se travar em alguma, manda 'exemplo' que
mostro como o Bruno Okamoto fez."
```

### 2. Pergunta 1 — Nome e como chamar

```
"Qual seu nome completo? E como você quer que eu te chame?

Ex:
- Carlos Eduardo Silva → me chama de Carlos
- Bianca → me chama de Bia
- Rodrigo Pereira → Rodrigo (formal mesmo)
"
```

Salvar `nome_completo` + `como_chamar`.

### 3. Pergunta 2 — Timezone / cidade

```
"Onde você mora? (Cidade + país já basta)

Isso me ajuda a saber se 'amanhã 9h' são 9h da manhã pra você
ou outro fuso. E pra contextualizar 'tá frio', 'final de semana
chovendo', etc."
```

Inferir timezone:
- Curitiba/SP/RJ/Brasil → America/Sao_Paulo (UTC-3)
- Lisboa/Portugal → Europe/Lisbon (UTC+0/+1)
- NYC/EUA → America/New_York
- etc

Se cidade ambígua (ex: "Belo Horizonte" — pode ser BH-Brasil ou ES-EUA), perguntar.

Salvar `cidade` + `timezone`.

### 4. Pergunta 3 — O que você faz

```
"Em 1 frase: o que você faz?

Não precisa ser cargo formal. Pode ser projeto, área, contexto.

Exemplos:
- 'Dono de padaria pequena em Curitiba'
- 'Designer freelancer pra startups SaaS'
- 'Médico cardiologista, consultório próprio'
- 'Estudo medicina, no 4° ano, USP'
- 'Founder de agência de marketing em Lisboa'
- 'Aposentado, mas crio conteúdo de jardinagem'

Pode mandar mais que 1 frase se tiver contexto importante."
```

Salvar `o_que_faz`.

### 5. Pergunta 4 — Tom preferido

```
"Como você quer que eu fale com você?

3 dimensões:

1) Quão direto?
   - Bem direto: 'isso aqui tá errado, faz X'
   - Cuidadoso: 'sugiro considerar X'

2) Quão técnico?
   - Técnico: assume que você sabe os termos da sua área
   - Explicado: explico contexto, não assumo

3) Quão pessoal?
   - Mais formal: 'você' / linguagem profissional
   - Mais informal: 'tu', gírias, jargão de internet

Manda em 1 frase ou descreve do seu jeito."
```

Salvar `tom_preferido`.

### 6. Confirmação

```
"Vou criar:

📄 USER.md
    Nome: {nome_completo}
    Como chamar: {como_chamar}
    Timezone: {timezone} ({cidade})
    O que faz: {o_que_faz}
    Tom preferido: {tom_preferido}

Confirma que pode criar?"
```

### 7. Aplicar Princípio 1 — backup se já existe

```bash
if [ -f "$WORKSPACE/USER.md" ]; then
    BACKUP_DIR="$HOME/backups/pre-wizard-aluno-$(date +%Y-%m-%d-%H%M)"
    mkdir -p "$BACKUP_DIR"
    cp "$WORKSPACE/USER.md" "$BACKUP_DIR/"
fi
```

### 8. Criar USER.md a partir de template

Template em `starter-kit/templates/USER.template.md`. Substituir placeholders:

| Placeholder | Substitui por |
|---|---|
| `{NOME_COMPLETO}` | `nome_completo` |
| `{COMO_CHAMAR}` | `como_chamar` |
| `{CIDADE}` | `cidade` |
| `{TIMEZONE}` | `timezone` |
| `{IDIOMA}` | inferir do timezone (BR → "Português brasileiro", PT → "Português europeu", US → "English (American)") |
| `{O_QUE_FAZ}` | `o_que_faz` |
| `{TOM_PREFERIDO}` | `tom_preferido` |
| `{DATA}` | data atual |

Salvar em `$WORKSPACE/USER.md`.

Confirmar:

```
"✓ Criado: /workspace/USER.md ({tamanho} bytes)

A partir de agora, em vez de te chamar de 'aluno', vou te chamar
de {como_chamar}. Considerando o que você faz ({o_que_faz_resumido}),
e seu tom preferido ({tom_preferido_resumido}).

Você pode abrir o USER.md em qualquer momento e editar direto.
Eu uso a versão atual sempre — não tem cache."
```

### 9. Pergunta-âncora

```
"Rapidão antes de fechar este passo: você acabou de me passar
várias coisas sobre você. Onde isso ficou salvo? E se você editar
lá direto, eu pego?"
```

| Resposta esperada | Validação |
|---|---|
| "USER.md" / "no workspace" + "sim, automático" | "Isso. USER.md no seu workspace. Mesma regra do IDENTITY: edit lá = mudança imediata aqui." |
| Só primeira parte (não menciona automatic) | "Quase. Sim, USER.md. E sim — edit direto pega na hora seguinte. Não precisa me avisar." |
| Errou ambas | "USER.md no seu workspace. Mesma regra do IDENTITY: edit direto, mudança imediata. Você sempre tem controle do que eu sei sobre você." |

Fechar com:

```
"Se quer aprofundar como o agente usa USER.md (e qual a diferença
pra MEMORY.md), a aula que detalha isso é a *B1* (Identidade
completa) — manda 'aula 5' que eu te passo o link.

E se ficou alguma dúvida que eu não cobri, dois caminhos no grupo:
- resposta rápida 24/7: chama @Openclawzinho (bot IA) no tópico Suporte
- ajuda humana: pergunta nos outros tópicos
https://t.me/cursoopenclaw

Marquei o passo 2 como feito. Bora pro passo 3 (liberar autonomia
pra eu trabalhar sem te interromper a cada coisa)?"
```

### 10. Atualizar MEMORY.md

```markdown
## Flags
aluno_configured: true
nome_aluno: {como_chamar}

## Decisões da jornada
- {data}: Configurou USER. Nome: {nome_completo}. Cidade: {cidade}. Faz: {o_que_faz}. Tom: {tom_resumo}.
```

Atualizar `onboarding_current_step: 3`.

### 11. Devolver controle

## Comando "exemplo" durante este wizard

Se aluno mandar "exemplo":

| Pergunta atual | Carrega |
|---|---|
| Nome | `exemplos/USER-amora.md` linhas 1-15 (cabeçalho) |
| Timezone | `exemplos/USER-amora.md` linhas 11-15 |
| O que faz | `exemplos/USER-amora.md` seção "Quem é o Bruno" + "Negócios Atuais" |
| Tom | `exemplos/USER-amora.md` seção "Tom e Voz" |
| Outros (genérico) | Mostra o arquivo inteiro |

Header padrão ao mostrar:

```
"Esse é o USER.md do Bruno Okamoto, que a Amora consulta. É um
exemplo de USER.md MADURO — Bruno usou o agente por meses e foi
adicionando contexto.

Você não precisa começar tão completo. Manda o básico agora — pode
expandir depois. Aula B1 ensina a expandir.

Volta pra pergunta: {repetir pergunta original}"
```

## Critérios de sucesso

- [ ] `USER.md` criado com `nome`, `como_chamar`, `timezone`, `o_que_faz`, `tom_preferido` preenchidos (sem placeholders)
- [ ] Backup feito se `USER.md` já existia
- [ ] `aluno_configured=true` em `MEMORY.md`
- [ ] `nome_aluno` salvo em `MEMORY.md` (pra outros wizards usarem)
- [ ] `onboarding_current_step=3`
- [ ] Pergunta-âncora respondida + validada
- [ ] Aula B1 mencionada

## Erros comuns

- **Aluno responde "qualquer coisa" pra tom:** insistir mais 1x. "Sério: 1 frase de como você quer que eu fale. Sem isso, eu vou no tom default (que tende ao corporativo). Manda algo tipo 'fala como amigo' ou 'fala formal mas sem rodeios'."
- **Aluno mistura USER com SOUL:** explicar diferença. "USER.md é sobre VOCÊ — quem é, o que faz. SOUL.md é sobre o AGENTE — como ele pensa e fala. Os 2 são diferentes."
- **Aluno não quer dar nome real:** ok, aceita. "Beleza, vou te chamar de {apelido}. USER.md preserva privacidade — tudo que você manda fica só no SEU workspace, não vaza."
- **Aluno descreve cidade ambígua:** perguntar (ex: "Belo Horizonte do Brasil ou EUA?"). Não assumir.
- **Aluno tem contexto profissional complexo (ex: 3 negócios):** ok, deixa ele descrever em 2-3 frases. USER.md aceita contexto rico — modelo lê tudo.

## Aplicação dos princípios defensivos

Esta skill herda os princípios universais da `onboarding-checklist`. Ver: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md).

### Aplicação específica

- **Princípio 1 (backup antes de sobrescrever):** se `USER.md` existir, backup timestamped antes.
- **Princípio 2 (confirmação humana):** confirma antes de criar arquivo.
- **Princípio 4 (narrar antes de fazer):** explica os 4 campos antes de perguntar.
- **Princípio 5 (atualizar MEMORY ao concluir):** marca `aluno_configured=true` + `nome_aluno`.
- **Princípio 6 (respeitar customização manual):** se USER.md já tem campo preenchido, NÃO sobrescreve sem perguntar.
- **Princípio 8 (logging de decisões):** salva escolhas no MEMORY.
- **Princípio 11 (detectar antes de pedir):** lê USER.md primeiro. Se preenchido, pula entrevista.

## Modo A vs Modo B

**Modo A:**
```
"Bora pro Módulo 2 — Sua personalidade.
Aula correspondente: B1 (Identidade completa) — mesma da personalidade do agente.
Reforço: assista a B1 antes pra entender como agente USA o USER.md."
[entrevista numerada 1/4, 2/4...]
```

**Modo B:**
```
"Agora você. Quem é? 4 coisas — nome, onde mora, o que faz, jeito
que prefere que eu fale com você."
[fluído, sem numeração]
```

## Templates usados

- `USER.template.md` em `starter-kit/templates/`

## Referências

### Internas
- Princípios: [`../onboarding-checklist/references/principios-defensivos.md`](../onboarding-checklist/references/principios-defensivos.md)
- Comandos: [`../onboarding-checklist/references/comandos-canonicos.md`](../onboarding-checklist/references/comandos-canonicos.md)
- Pergunta-âncora oficial: [`../onboarding-checklist/references/mapa-aulas.md`](../onboarding-checklist/references/mapa-aulas.md) (passo 2)
- Decisão D21 (separar agente vs aluno em 2 wizards): [`../../../../DECISOES-ARQUITETURA.md`](../../../../DECISOES-ARQUITETURA.md)

### Externas
- Exemplo Amora: [`starter-kit/exemplos/USER-amora.md`](../../../exemplos/USER-amora.md)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026).

## Roadmap

- v1.1: Detectar timezone via locale do sistema operacional como fallback
- v1.2: Pergunta opcional sobre família/contexto pessoal (com aviso de privacidade)
- v2: Multi-perfil — "perfil profissional" e "perfil pessoal" em USER.md
