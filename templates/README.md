# Templates — Starter Kit OpenClaw v2

> 2 grupos: **estruturais** (preenchidos pelos wizards na configuração inicial) e **de output** (usados pelo aluno pra produzir reports/material).

## 1. Templates estruturais (.md)

Templates raiz que os wizards usam pra criar arquivos no workspace do aluno durante o setup.

| Template | Usado pelo wizard | Cria no workspace |
|---|---|---|
| `IDENTITY.template.md` | wizard-agente | `IDENTITY.md` |
| `SOUL-stub.template.md` | wizard-agente | `SOUL.md` (versão stub) |
| `AGENTS.template.md` | wizard-agente | `AGENTS.md` |
| `USER.template.md` | wizard-aluno | `USER.md` |
| `MAPA.template.md` | wizard-workspace | `MAPA.md` (raiz) |
| `HEARTBEAT.template.md` | wizard-autonomia (heartbeats) | `HEARTBEAT.md` |

### Como funcionam

Cada template tem **placeholders** entre chaves (ex: `{NOME_AGENTE}`, `{DATA}`). O wizard:

1. Coleta dados do aluno via entrevista (ou detecta de arquivos existentes)
2. Lê o template
3. Substitui cada `{PLACEHOLDER}` pelo valor coletado
4. Salva o arquivo final no workspace do aluno

### Placeholders comuns

| Placeholder | Origem |
|---|---|
| `{NOME_AGENTE}` | wizard-agente — pergunta 1 |
| `{GENERO}` | wizard-agente — pergunta 2 |
| `{TOM}` | wizard-agente — pergunta 3 |
| `{ANTI_PATTERN}` | wizard-agente — pergunta 4 |
| `{MODELO}` | detectado via `openclaw config show model` |
| `{AGENT_ID}` | calculado: `{nome_lowercase}-{user_lowercase}` |
| `{NOME_COMPLETO}` | wizard-aluno — pergunta 1 |
| `{COMO_CHAMAR}` | wizard-aluno — pergunta 1 |
| `{CIDADE}` | wizard-aluno — pergunta 2 |
| `{TIMEZONE}` | inferido da cidade |
| `{IDIOMA}` | inferido do timezone |
| `{O_QUE_FAZ}` | wizard-aluno — pergunta 3 |
| `{TOM_PREFERIDO}` | wizard-aluno — pergunta 4 |
| `{NOME_USER}` | extraído de USER.md (campo `Como me chamar`) |
| `{DATA}` | data atual no formato YYYY-MM-DD |

### Mapas locais (criados pelo wizard-workspace)

Os 4 mapas locais (`content/MAPA.md`, `memory/MAPA.md`, `skills/MAPA.md`, `archive/MAPA.md`) são gerados **inline** pelo `wizard-workspace/SKILL.md` (não tem template `.md` separado pra eles). O conteúdo é simples e pouco varia por aluno — não compensa template separado.

---

## 2. Templates de output (.html)

Templates de **artefato final** que o aluno usa pra gerar reports, diagnósticos e material didático ao longo do uso. Cumpre a promessa da Aula 8 do mini-curso ("vocês têm aqui o Template Report, Template Report Executivo, Material Didático").

| Template | Pra que serve | Paleta |
|---|---|---|
| `template-report.html` | Análise semanal · deep dive · post-mortem · review de campanha | teal/jade + dourado · slate dark |
| `template-report-executivo.html` | Diagnóstico estratégico · leitura pra board · decisão go/no-go · kick-off de cliente | violeta + rosa · deep purple-black |
| `template-material-didatico.html` | Aula · playbook · tutorial · guia passo-a-passo · material de mentoria | sky cyan + lime · navy ink |

### Como o aluno usa

1. Pede pro agente: "abre o template de report" / "preciso fazer um diagnóstico" / "gera material didático sobre X"
2. Agente copia o `.html` pro `content/drafts/{tema}.html` do aluno
3. Aluno preenche os `{{ MARCADORES }}` (ou pede pro agente preencher com base num briefing)
4. Aluno apaga seções que não usa, salva, exporta como PDF se quiser

### Características comuns aos 3

- **Logo Pixel** discreta no topo + footer com assinatura "Pixel Educação · Template oficial OpenClaw v2"
- **Não usam a paleta oficial Pixel** (laranja/azul-marinho). Cada template tem paleta própria pra evitar diluir a marca quando aluno publicar
- **Plus Jakarta Sans** (font universal Pixel — mantida)
- **Dark premium editorial** (estilo canônico Pixel — manteve direção visual, trocou só cromática)
- **Self-contained**: SVG do logo embutido em base64, fontes via Google CDN — funciona stand-alone, sem servidor
- **Comentários `<!-- aluno preenche aqui -->`** guiando preenchimento
- **Print-friendly** (CSS `@media print` configurado)

### Sanitização

Os 3 templates foram derivados de reports REAIS da Pixel (Roberto Rocha · Naatooh · Pixel AI Track) que vivem em `memory/assets/pixel-educacao/references/templates/`. Esses originais NÃO devem virar templates públicos — têm dados de cliente. As versões em `starter-kit/templates/` são as sanitizadas, com placeholders.

### Espelho no Google Drive (planejado)

A intenção é manter espelho público no Drive da Pixel pra alunos que preferem baixar e abrir no Word/Notion sem passar pelo agente. Estrutura sugerida:

```
📁 OpenClaw v2 — Templates (Drive público)
├── 📁 estruturais (preenche na Aula 5)
│   ├── IDENTITY.template.md
│   ├── SOUL-stub.template.md
│   ├── AGENTS.template.md
│   ├── USER.template.md
│   └── MAPA.template.md
└── 📁 outputs (mostra na Aula 8)
    ├── template-report.html
    ├── template-report-executivo.html
    └── template-material-didatico.html
```

---

## Quando atualizar templates

- **Estruturais (.md):** quando estrutura padrão dos arquivos raiz mudar (ex: adicionar campo novo no IDENTITY) ou quando placeholder novo for necessário
- **Outputs (.html):** quando descobrir que aluno reclama de seção que falta, ou quando paleta/branding Pixel evoluir e fizer sentido refletir

**NÃO atualizar pra ajustes de UX dos wizards** — esses são os scripts (SKILL.md), não os templates.

---

*Templates estruturais v1 — criados junto com Onda 2 dos wizards filhos (02/05/2026).*
*Templates de output v1 — criados pra cumprir promessa da Aula 8 da Hotmart (07/05/2026).*
