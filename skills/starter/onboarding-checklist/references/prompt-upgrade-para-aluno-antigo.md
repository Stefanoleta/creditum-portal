# Fluxo de Upgrade — Curso OpenClaw v1 → v2 (instrução interna pro agente)

> ⚠️ **NÃO ENTREGUE ESTE TEXTO PRO ALUNO COPIAR.**
>
> Falha real observada (v1.0 e v1.1): agentes leram esse arquivo, entregaram pro aluno como texto pra ele "colar no agente dele". Mas o aluno tá NO MESMO agente — não tem outro lugar pra colar. Resultado: aluno perdido.
>
> **Como usar (correto):** quando a `onboarding-checklist` detectar workspace populado (Cenário B) e aluno escolher caminho B (upgrade completo), VOCÊ (agente que recebeu o kit) carrega este arquivo como **instrução interna** e EXECUTA as fases pessoalmente. Você É o agente dele — não tem outro pra delegar.
>
> Você adota a missão descrita na "moldura" abaixo (estado mental do tutor da migração) e segue as 6 fases na ordem, narrando cada uma ao aluno (Princípio 4 — modo guiado).

---

## Moldura mental (sua postura interna)

Adote esta postura ao executar o caminho B do Cenário B:

```
Você é o agente OpenClaw deste aluno, configurado por ele ao longo dos
últimos meses. Você mantém seu nome, seu SOUL, seu USER. A diferença
agora é que você tem uma missão extra:

Recebi um Starter Kit novo do mini-curso v2 do Bruno Okamoto e preciso da
sua ajuda pra decidir se/como adotar partes dele — sem perder o que já
construímos juntos.

A localização do kit baixado é: [SUBSTITUIR_PELO_PATH]
A localização do nosso workspace atual é: [SUBSTITUIR_PELO_PATH]

Sua missão tem 6 fases. Execute em ordem. NÃO modifique nada nas Fases 0-4.
Só apresente. Eu aprovo antes da execução real (Fase 5).

==========================================================
FASE 0 — VERIFICAÇÃO DE PRÉ-REQUISITOS DE ACESSO
==========================================================

Antes de qualquer leitura, confirme que você tem nível de acesso necessário
pra executar TODA esta missão sem ficar parando a cada passo. A missão
envolve ler dezenas de arquivos, criar backup, criar arquivos novos e
modificar arquivos existentes — tudo precisa rodar fluido.

Cheque seu exec-policy atual:

  openclaw exec-policy show

Se VOCÊ JÁ TEM `exec-policy: yolo`:
  → Avise: "✓ Acesso suficiente. Prossigo pra Fase 0.5."

Se NÃO tem yolo:
  → Pause aqui. Mande pro usuário (eu) o seguinte texto:

    "Antes da gente seguir, preciso de nível de acesso maior pra rodar
    a missão sem parar. Cola este comando no SEU TERMINAL do OpenClaw
    Managed (Painel Hostinger → Menu OpenClaw → 'Abrir linha de comando' —
    não aqui no chat, eu não consigo escalar minhas próprias permissões):

      openclaw exec-policy preset yolo

    Esse comando libera: rodo coisas sem pedir aprovação a cada passo.

    Quando terminar, manda 'liberado' aqui que eu continuo a missão."

  → Espera aluno responder 'liberado'. Re-checa. Se ainda faltar, repete.

Critério de saída da Fase 0: você confirma que tem acesso pleno pra ler,
escrever, criar pasta, executar comandos sem precisar pedir aprovação a
cada passo. Sem isso, NÃO prossiga.

==========================================================
FASE 0.5 — BACKUP GLOBAL DO WORKSPACE
==========================================================

Antes de qualquer leitura ou modificação, faça backup completo do workspace
ATUAL inteiro. Isso é seguro porque, em qualquer momento das próximas fases,
podemos restaurar o estado original sem perder nada.

Crie diretório de backup:
  mkdir -p ~/backups/

Crie tar.gz timestamped:
  tar -czf ~/backups/pre-upgrade-v2-$(date +%Y-%m-%d-%H%M).tar.gz \
      [PATH_WORKSPACE]

Verifique tamanho do arquivo gerado e confirme que > 0 bytes:
  ls -lh ~/backups/pre-upgrade-v2-*.tar.gz | tail -1

Reporta pro usuário:

  "✓ Backup global criado em ~/backups/pre-upgrade-v2-YYYY-MM-DD-HHMM.tar.gz
   ({TAMANHO}MB). Se algo der errado nas próximas fases, basta extrair esse
   tar.gz pro path original que volta ao estado de agora."

Critério de saída da Fase 0.5: arquivo .tar.gz existe, tem tamanho > 0,
caminho confirmado pro usuário. Sem isso, NÃO prossiga pra Fase 1.

==========================================================
FASE 1 — RAIO-X DO KIT NOVO
==========================================================

Leia integralmente o conteúdo do kit em [PATH_DO_KIT_BAIXADO]:

- starter-kit/README.md
- starter-kit/manifesto.md
- starter-kit/MAPA-DA-V2.md (se existir)
- starter-kit/skills/_registry.md
- Todos os SKILL.md em starter-kit/skills/starter/
- Todos os SKILL.md em starter-kit/skills/canais/
- Todos os SKILL.md em starter-kit/skills/planejamento/
- Templates em starter-kit/templates/

Para cada skill, extraia em formato estruturado:
- Nome
- Status (DRAFT/ATIVO)
- Versão
- Categoria
- Propósito (1 frase)
- Dependências externas (chaves API, ferramentas)
- Dependências internas (outras skills)
- Valor agregado (o que ela faz que aluno não tinha antes)
- Risco de adoção (ALTO/MÉDIO/BAIXO de quebrar coisa existente)

Salve este inventário em `analise-kit-v2.md` no workspace atual.

==========================================================
FASE 2 — RAIO-X DA NOSSA INSTALAÇÃO ATUAL
==========================================================

Faça inventário completo do que já existe no nosso workspace:

Arquivos raiz (procure em todas as pastas-padrão):
- USER.md, IDENTITY.md, SOUL.md, AGENTS.md, MEMORY.md, MAPA.md
- HEARTBEAT.md, TOOLS.md, CLAUDE.md (se existir)
- .env, .env.local

Skills instaladas:
- Liste tudo em skills/ recursivo
- Para cada skill: nome, versão (se houver), última modificação, propósito

Configurações:
- .env: liste chaves (NÃO valores) configuradas
- exec-policy atual (já checado na Fase 0)
- exec-policy atual (já checado na Fase 0)
- crons ativos: openclaw cron list

Customizações detectáveis:
- Arquivos com edição manual recente (procure padrões não-padrão)
- Skills criadas pelo próprio usuário (não veio de pacote)
- Arquivos extras na raiz que não fazem parte do padrão OpenClaw

Salve em `analise-instalacao-atual.md`.

==========================================================
FASE 3 — ANÁLISE COMPARATIVA
==========================================================

Compare as duas instalações em 4 buckets:

BUCKET A — Skills do kit que NÃO temos
  → Candidatas a adicionar
  → Para cada: prioridade (ALTA/MÉDIA/BAIXA), risco (ALTO/MÉDIO/BAIXO),
    esforço (XS/S/M/L)

BUCKET B — Skills do kit que JÁ TEMOS em versão diferente
  → Candidatas a comparar e decidir se substitui ou mantém
  → Para cada: comparação curta de função, qualidade percebida,
    recomendação inicial (manter/substituir/coexistir)

BUCKET C — Padrões/estruturas do kit que poderíamos adotar
  → Ex: estrutura de pastas, naming convention, padrão de SKILL.md V3
  → Para cada: descreve o padrão, valor de adotar, esforço de migração

BUCKET D — Customizações nossas que NÃO devem ser tocadas
  → Lista do que é específico da minha instalação e tem que sobreviver
  → Para cada: o que é, por que importa, como proteger

Salve análise em `analise-comparativa.md`.

==========================================================
FASE 4 — PRD DE ADAPTAÇÃO PERSONALIZADO
==========================================================

Apresente um PRD de migração customizado pra essa instalação específica:

1. RESUMO EXECUTIVO (3-4 linhas: o que vai mudar, o que NÃO vai)
2. ITENS A ADICIONAR (do BUCKET A, ordenados por prioridade)
3. ITENS A SUBSTITUIR (do BUCKET B, com justificativa caso a caso)
4. ITENS A MANTER (do BUCKET D, lista clara do intocável)
5. ORDEM SEGURA DE EXECUÇÃO (skills sem dependência primeiro,
   modificações destrutivas por último)
6. PONTOS DE PARADA OBRIGATÓRIOS (onde vou pausar pra confirmação)
7. ESTIMATIVA DE TEMPO TOTAL E POR ITEM

Salve PRD em `prd-upgrade-v2.md`.

Apresente o PRD pro usuário (eu) e PARE.

==========================================================
FASE 5 — EXECUÇÃO (somente após aprovação humana explícita)
==========================================================

Aguarde aprovação textual do tipo:
  - "aprovado, executa"
  - "vai"
  - "pode rodar"

Se aluno aprovar PARCIALMENTE (ex: "executa só os itens A e C"):
  → Atualizar PRD com escopo aprovado e prosseguir só com esse subset.

Se aluno pedir AJUSTES no PRD:
  → Voltar pra Fase 4, refinar PRD, re-apresentar.

Quando executar:

Item por item, na ordem do PRD:
  1. Anuncia o que vai fazer:
     "→ Vou agora: {ação}. Item {N}/{total}."

  2. Backup específico do item ANTES da modificação:
     - Se modificar arquivo X existente: copiar pra ~/backups/pre-upgrade-v2-XXX/
       com timestamp
     - Se criar arquivo novo: confirma com aluno antes da criação

  3. Executa.

  4. Verifica resultado (lê arquivo gerado, testa skill nova, etc).

  5. Reporta:
     "✓ Item {N} concluído. {breve resumo do resultado}.
      Próximo: {item N+1}. Posso seguir? (manda 'segue' ou pausa
      qualquer coisa)"

  6. ESPERA confirmação explícita antes de cada próximo item.

==========================================================
REGRAS DE OURO (válidas em TODAS as fases)
==========================================================

- Nunca sobrescreve arquivo raiz sem backup específico + confirmação dupla
- Customização minha (edição manual em arquivos raiz) é SAGRADA
- Em dúvida, pergunta. Nunca assume.
- Se uma skill do kit conflita com o meu jeito de trabalhar, marca pra
  deixar de fora no PRD
- Documenta CADA decisão tomada em `decisoes-upgrade-v2.md`
- Se algo der errado em qualquer fase, PARA imediatamente, reporta o
  estado atual, e me pergunta como prosseguir
- Se você precisar abortar, me avisa pra eu restaurar do backup global
  (Fase 0.5) e voltar pro estado original

==========================================================
COMECE PELA FASE 0.
==========================================================
```

---

## Notas de implementação (pra dev/QA)

### Substituições obrigatórias antes de entregar pro aluno

A `onboarding-checklist` deve substituir antes de mandar:

- `[SUBSTITUIR_PELO_PATH]` → path real do kit baixado no workspace do aluno
- `[PATH_DO_KIT_BAIXADO]` → idem
- `[PATH_WORKSPACE]` → path do workspace OpenClaw do aluno (detectado pelo `pwd` ou env var)

### Validação antes de entregar

Antes de mandar este texto pro aluno via Telegram:

1. Confirmar que aluno realmente tem instalação populada (Cenário B da fase zero)
2. Substituir todos os placeholders
3. Avisar aluno: "Esse prompt é longo (~150 linhas). Cola tudo de uma vez no seu agente."
4. Marcar `onboarding_dismissed=true` na MEMORY do KIT NOVO (essa instalação não vai usar a checklist)

### O que esperar do agente do aluno

- **Agente bom**: cumpre as 6 fases na ordem, pausa nas Fase 0/0.5/4 conforme instruído, executa Fase 5 com cuidado.
- **Agente médio**: cumpre fases 0-4 mas pula confirmações. Risco: começa a executar sem aprovação. Aluno avisado a interromper se isso acontecer.
- **Agente fraco**: ignora as fases, tenta "fazer tudo de uma vez". Aluno avisado: se isso acontecer, restaurar do backup global e tentar com outro modelo (recomendar GPT 5.5 mínimo).

### Limitações conhecidas

- O prompt assume que o agente do aluno tem ferramentas de leitura/escrita de arquivo + execução shell. Se for um agente puro chat sem ferramentas, NÃO funciona.
- Não cobre instalações com mais de uma versão do OpenClaw rodando simultaneamente.
- Não cobre instalações com workspace dividido em múltiplas pastas (assume workspace único).

### Roadmap

- v1.1: adicionar fase de "smoke test pós-execução" (rodar skills migradas pra confirmar que funcionam)
- v2: versão guiada via skill da própria `onboarding-checklist` (em vez de prompt-mestre estático)
