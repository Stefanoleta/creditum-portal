# MAPA — Workspace do {NOME_AGENTE}

> Mapa central. Leia este arquivo pra saber onde encontrar qualquer coisa.

## Arquivos Raiz

| Arquivo | Função | Quando ler |
|---|---|---|
| `IDENTITY.md` | Bilhete de identidade do {NOME_AGENTE} (nome, modelo, etc) | Boot |
| `SOUL.md` | Personalidade — como o {NOME_AGENTE} pensa e fala | Boot (passo 1) |
| `USER.md` | Sobre o {NOME_USER} — quem é, o que faz, tom preferido | Boot (passo 2) |
| `AGENTS.md` | Boot sequence + red lines + regras de comportamento | Boot |
| `MAPA.md` | Este arquivo — navegação geral | Boot (passo 3) |

## Pastas Principais

```
workspace/
├── content/         → Tudo que o agente CRIA pro {NOME_USER} (posts, drafts)
│   ├── MAPA.md
│   ├── drafts/      → rascunhos em produção
│   └── archive/     → publicados/versionados
│
├── memory/          → Tudo que o agente PRECISA LEMBRAR entre sessões
│   ├── MAPA.md
│   ├── decisoes/    → 1 arquivo por mês (YYYY-MM.md)
│   └── projects/    → 1 arquivo por projeto ativo
│
├── skills/          → Habilidades modulares (1 pasta por skill)
│   ├── MAPA.md
│   ├── _registry.md → índice global das skills instaladas
│   └── operacional/ → categoria inicial (backup, sync, etc)
│
└── archive/         → Versionamento manual quando algo é substituído
    └── MAPA.md
```

## Navegação Rápida

| Estou buscando... | Onde ir |
|---|---|
| Onde salvar um draft novo | `content/drafts/` |
| Decisões registradas | `memory/decisoes/{YYYY-MM}.md` |
| Status de um projeto | `memory/projects/{nome}.md` |
| Skills instaladas | `skills/_registry.md` |
| Histórico de algo arquivado | `archive/` |

## Sub-MAPAs

Cada pasta principal documenta a si mesma (Princípio 12 — mapas distribuídos):

- `content/MAPA.md`
- `memory/MAPA.md`
- `skills/MAPA.md`
- `archive/MAPA.md`

Não tem `TOOLS.md` agregador. Razão: cresce sem controle, duplica info, fica desatualizado.

## Quando atualizar este arquivo

| Mudança | Atualizar este MAPA? |
|---|---|
| Skill nova instalada | NÃO (atualizar `skills/{categoria}/_registry.md`) |
| Pasta principal nova criada | SIM |
| Decisão importante registrada | NÃO (vai pra `memory/decisoes/`) |
| Estrutura de subpasta mudou | NÃO (atualizar MAPA local da pasta) |

---

*Criado em {DATA} pelo wizard-workspace do Starter Kit OpenClaw v2.*
*Veja `starter-kit/exemplos/MAPA-amora.md` pra exemplo maduro de workspace.*
