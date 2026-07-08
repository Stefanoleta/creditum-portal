# Sobre o Kit — Versão Expandida

> Carregado pela `onboarding-checklist` quando aluno manda comando `"sobre"` (ou variantes: "filosofia", "quem fez isso?", "me explica o kit").
> Após exibir, retomar pra última posição da jornada com pergunta: "Bora voltar pro passo {N}?"

---

## Texto

```
*Sobre o Starter Kit "Minha Cabeça"*

*Quem fez*
Bruno Okamoto — fundador da Pixel Educação, autor do mini-curso OpenClaw.
12+ anos construindo Micro-SaaS no Brasil.

*A tese*
A maioria dos cursos de IA ensina você a USAR a ferramenta. Esse aqui é
diferente: ele ensina o seu agente a se ensinar — e você assiste de
camarote enquanto isso acontece.

Por isso o nome "Minha Cabeça". Você não vai aprender a usar uma
ferramenta nova. Você vai construir uma extensão da sua cabeça que
trabalha por você.

*Por que "curso pra humanos E agentes"*
Esse é o primeiro experimento da Pixel onde o conteúdo do curso roda
DENTRO do agente do aluno. Cada skill aqui foi escrita pra ser lida e
executada por outro agente (LLM) E compreensível pra um humano que
olha por cima.

Isso é novo. Tá funcionando? A gente descobre junto.

*Filosofia operacional*

1. Managed-first — você nunca vai precisar abrir terminal SSH ou
   configurar Docker. Tudo roda no Managed Hostinger.

2. Primeira vitória antes de setup pesado — em ~37min você tem
   agente trabalhando de verdade.

3. Um agente forte com skills fortes > muitos agentes genéricos.

4. Agente como funcionário digital — pense nele como funcionário novo
   no primeiro dia. Você apresenta a empresa, dá acessos, define
   limites, ensina o jeito da casa.

*O que esse kit NÃO é*
- Tutorial pra você seguir lendo
- Configuração que você faz na mão
- Curso só pra desenvolvedor
- Setup VPS/SSH/Docker
- "Usar OpenAI" (você vai construir um agente, não chatbot)

*O que esse kit É*
- Tutoria agêntica: o agente te conduz, você só responde
- Setup que conclui em ~37min com agente trabalhando
- Identidade própria do agente (nome, tom, limites)
- Memória persistente
- Pesquisa real (Brave Search + Whisper pra áudio)
- Backup automático no GitHub
- Caminho claro pras próximas aulas

*Fase de testes*
Esse kit tá em v1. Nada quebrado, mas tem rugosidade. Se você travar:

— Rápido (24/7, IA): chama @Openclawzinho no tópico Suporte do grupo
  https://t.me/cursoopenclaw

— Médio (galera): pergunta nos outros tópicos do mesmo grupo
  https://t.me/cursoopenclaw

— Estruturado: bruno@microsaas.com.br
  (Bruno lê pessoalmente — feedback bom vira melhoria na v2)

*O que vem na v2 do kit*
- gera-imagem (após validar suporte do Managed pra gpt-image-1)
- wizard-whatsapp aprimorado (atendimento clientes)
- wizard-google-workspace (Calendar + Gmail + Drive)
- Skills de pesquisa avançada (Apify, Perplexity)
- Skill de design rápido

---

Bora voltar pro passo {N}?
```

---

## Notas

- **Substituição obrigatória**: `{N}` = último passo onde o aluno estava antes de pedir "sobre". Pega de `MEMORY.md` (`onboarding_current_step`).
- **Se aluno mandou "sobre" antes de começar a jornada** (logo após manifesto): trocar última linha por "Bora começar pelo passo 0 (opcional Whisper) ou ir direto pro passo 1?"
- **Se aluno mandou "sobre" durante a jornada**: voltar exatamente pro ponto onde parou — não restartar passo.

## Variações aceitáveis

- Aluno pode mandar variantes: "filosofia", "quem fez", "me explica isso", "manifesto"
- Todas disparam este texto

## Variações NÃO aceitáveis

- ❌ Adicionar/remover seções (mantém ordem fixa: tese → humanos+agentes → filosofia → não/é → testes → roadmap)
- ❌ Encurtar a parte "fase de testes" (vende vulnerabilidade que cria conexão)
- ❌ Mover email Bruno pra rodapé pequeno
