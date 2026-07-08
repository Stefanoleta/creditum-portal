# `_curso/` — Material do Mini-Curso OpenClaw v2

> Pasta com o material completo do mini-curso pro agente do aluno consultar quando aluno fizer pergunta sobre conteúdo.
> **Não é pro aluno ler.** É a base de conhecimento que o agente usa pra conduzir.

## Estrutura

```
_curso/
├── README.md                        ← este arquivo
├── INDICE.md                        ← MAPA CANÔNICO Hotmart ↔ arquivo (consulte primeiro)
├── transcricao-completa.md          ← transcrição literal (~270KB · 48.886 palavras · 4h28min)
└── aulas/
    ├── _shared/                     ← CSS compartilhado dos HTMLs
    ├── aula-00-visao-stack.html
    ├── aula-01-cases-3-agentes.html
    ├── aula-01-setup-managed.html
    ├── aula-02-cockpit.html
    ├── aula-03-starter-kit.html
    ├── aula-04-telegram.html
    ├── aula-05-identidade.html
    ├── aula-06-workspace.html
    ├── aula-07-memoria.html
    ├── aula-08-skills.html
    ├── aula-09-crons.html
    ├── aula-10-seguranca.html
    ├── aula-11-outros-canais.html
    ├── aula-12-integracoes.html
    ├── aula-13-multi-agente.html
    ├── aula-14-mission-control.html
    └── aula-15-fechamento.html
```

## Quando o agente usa cada arquivo

| Cenário | O que ler |
|---|---|
| Aluno mencionou aula específica (ex: "aula 12.2") | `INDICE.md` → identifica arquivo + seção → carrega trecho do HTML |
| Aluno fez pergunta sobre tema (ex: "como configuro Notion") | `INDICE.md` → tabela de aliases → identifica aula → carrega trecho do HTML |
| Pergunta vaga ou cruzando aulas | `transcricao-completa.md` (grep textual) → identifica trechos → carrega HTML específico |
| Aluno marcou aula como concluída ("aula 7 feito") | Marca `mini_curso_progress: aula_7_concluida` em MEMORY.md, sugere próxima aula |

## Princípios pro agente (recap)

1. **Sempre consulte `INDICE.md` primeiro** — ele é o mapa canônico Hotmart ↔ arquivo
2. **Não carregue HTML inteiro** (~30-50KB cada) — use grep + leia só o trecho relevante
3. **Não improvise** sobre conteúdo do curso — material existe, use
4. **Não mande URL externa** — o material tá aqui, local
5. **Conduza passo a passo** com base no material — aluno não precisa ler HTML, agente é o tutor

Detalhes completos no Princípio 18 do `0-LEIA-PRIMEIRO-AGENTE.md` (raiz do workspace).

## Versionamento

Material é gerado a partir do mini-curso v1.0 (gravado maio/2026 · 16 aulas · 4h28min totais).

Quando Bruno regravar uma aula, atualizar:
- `transcricao-completa.md` → versão nova da transcrição
- `aulas/aula-XX-tema.html` → versão nova do HTML

A pasta `cheatsheets/` foi descontinuada em v2.5.4 — todo conteúdo agora vive na transcrição + HTMLs. Versão antiga preservada em `archive/cheatsheets-legacy-v1.0/` pra histórico.

---

*Versão 1.0 · 07/05/2026 · Pixel Educação*
