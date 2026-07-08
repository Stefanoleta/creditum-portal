# Arquivamento Pós-Jornada

> O que mover pra `~/archive/starter-kit-onboarding-{data}/` quando aluno escolhe "arquivar" depois da jornada completa.

---

## Fluxo do arquivamento

Após aluno completar jornada (passo 6 — primeira vitória) e responder NPS, agente pergunta:

> "Você quer arquivar o material de onboarding ou manter tudo onde tá?"

Se aluno escolhe **arquivar**, mover os items abaixo pra `~/archive/starter-kit-onboarding-{YYYY-MM-DD}/`.

---

## O que ARQUIVA (jornada cumprida, não roda mais)

```
skills/starter/onboarding-checklist/    ← mestre, função cumprida
skills/starter/wizard-whisper-quick/    ← Whisper já configurado
skills/starter/wizard-agente/           ← identidade já criada
skills/starter/wizard-aluno/            ← USER já criado
skills/starter/wizard-autonomia/        ← já liberada
skills/starter/wizard-workspace/        ← já organizado
skills/starter/wizard-conectar/         ← já conectado
templates/                              ← templates não usados (USER, IDENTITY, etc já preenchidos)
exemplos/                               ← exemplos da Amora (referência só serve no aprendizado inicial)
FAQ.md                                  ← perguntas comuns do começo (avançado já dominou)
BUILD.md                                ← script de build do zip (irrelevante pós-uso)
manifesto.md                            ← já lido na entrada
README.md                               ← do starter-kit (não confundir com README do workspace)
```

---

## O que PERMANECE no workspace (uso contínuo)

```
skills/starter/primeira-vitoria/        ← roda de novo pra criar mais artefatos
skills/canais/wizard-whatsapp/          ← opt-in pós-vitória (não ativado)
skills/planejamento/                    ← Superpowers — uso contínuo
skills/operacional/                     ← backup-workspace-github + outras utilities
content/                                ← criação ativa
memory/                                 ← memória contínua
archive/                                ← onde o material arquivado vai parar
USER.md, IDENTITY.md, SOUL.md, AGENTS.md, MAPA.md, MEMORY.md, HEARTBEAT.md, .env
```

---

## Mensagem antes do arquivamento

```
"Vou arquivar o material de onboarding agora. Resumo do que vai pra
~/archive/starter-kit-onboarding-{data}/:

- 7 wizards de onboarding (mestre + 6 passos)
- Pasta de templates (versões em branco)
- Pasta de exemplos da Amora
- FAQ.md
- README e manifesto do kit

Continua no seu workspace:
- Primeira-vitoria (você usa pra criar mais artefatos)
- Skills de planejamento (Superpowers)
- Wizard-whatsapp (opt-in pra adicionar canal)
- Skills operacionais (backup, status, etc)
- Seus arquivos raiz (USER, IDENTITY, etc)
- Pastas content/ e memory/

Tudo arquivado fica acessível em ~/archive/. Se um dia quiser revisitar
ou compartilhar o kit com alguém, tá tudo lá.

Confirma o arquivamento? (sim / não)"
```

---

## Após arquivar

```
"✓ Arquivado em ~/archive/starter-kit-onboarding-{data}/

Tamanho: {X}MB
Itens: {Y}

Workspace limpo. Próximos superpoderes opcionais (ative quando quiser):

- 'ativa whatsapp' → canal extra
- 'instala perplexity' → deep research
- 'instala apify' → puxar dados de redes sociais
- '1password' → migrar .env pro cofre

Manda 'ajuda' pra ver tudo que sei fazer.
Manda 'desarquiva kit' se um dia quiser voltar com o material."
```

---

## Comando "desarquiva kit"

Aluno pode reverter o arquivamento em qualquer momento:

```
Aluno: "desarquiva kit"

Agente:
"Vou mover de volta pro workspace:
- Wizards de onboarding
- Templates
- Exemplos
- FAQ
- README + manifesto

De ~/archive/starter-kit-onboarding-2026-05-02/

Confirma?"
```

---

## Casos especiais

### Aluno escolhe NÃO arquivar

```
"Beleza, mantenho tudo no workspace.

Vai ocupar mais espaço visual quando você for procurar suas skills,
mas se preferir ter o material disponível pra revisitar — sem problema.

Você sempre pode arquivar depois mandando 'arquiva kit'."
```

### Aluno arquivou e quer só o FAQ de volta

```
Aluno: "preciso do FAQ"

Agente:
"FAQ tá arquivado em ~/archive/starter-kit-onboarding-{data}/FAQ.md

Quer que eu:
a) Copie só o FAQ pra raiz do workspace
b) Desarquive o kit inteiro
c) Eu te respondo a dúvida específica usando o FAQ daqui mesmo (sem mover arquivo)

Qual?"
```

Default sugerido: **(c)** — agente lê o FAQ on-demand sem precisar mover. Mantém workspace limpo.

---

## Princípio aplicado

Este fluxo aplica vários princípios:

- **Princípio 1 (backup):** o tar.gz do GitHub backup já cobriu o estado pré-arquivamento. Se algo der errado, dá pra restaurar do GitHub.
- **Princípio 2 (confirmação):** arquivamento exige "sim" explícito do aluno antes de mover qualquer coisa.
- **Princípio 12 (mapas distribuídos):** atualizar `archive/MAPA.md` listando o que foi arquivado e quando.
- **Reversibilidade:** comando "desarquiva kit" garante que arquivamento não é destrutivo.

---

*Última revisão: 02/05/2026*
