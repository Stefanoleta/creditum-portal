---
name: verification-before-completion
status: ATIVO
category: planejamento
owner: aluno
version: 1.0
mode: guided
estimated_time: 5-15min (depende do escopo)
model_compatible: [gpt-5, gpt-5.5, claude-sonnet-4, claude-opus-4]
description: Use BEFORE declaring task/project complete. Forces evidence-based verification — runs tests, checks output, confirms each success criterion before marking done. Adapted from obra/superpowers (verification-before-completion skill). Eliminates "I think it works" claims.
source: https://github.com/obra/superpowers (skill: verification-before-completion)
---

# Verification Before Completion — Provar Antes de Declarar

## Promessa

Antes de declarar "tá pronto" / "merge" / "publica" / "tá ok", roda verificação concreta de cada critério de sucesso. Sem evidência, não marca como feito.

Mata o "achei que funcionava" e força "comprovei que funciona".

Adaptado de [obra/superpowers](https://github.com/obra/superpowers).

## Quando usar

**Use ANTES de:**
- Marcar projeto/plano como completo
- Fechar issue
- Publicar conteúdo
- Lançar feature
- Mandar entregável pro cliente
- Encerrar wave/sprint

**Use SEMPRE em:**
- Última tarefa do `executing-plans`
- Final do `wizard-{qualquer}` que afirma sucesso
- Antes de declarar bug "resolvido"

## Como funciona

### 1. Lê critérios de sucesso

Onde estão:
- `PLAN.md` → seção "Sucesso = (critérios)"
- Issue/ticket → critérios definidos
- Brief de conteúdo → critérios de qualidade
- (Se não tem critério, **PARA** — sem critério não há verificação)

### 2. Pra cada critério, confirma com evidência

| Critério | Como verificar |
|---|---|
| "Funciona em produção" | Roda comando real, mostra output |
| "Aparece corretamente em mobile" | Screenshot do mobile, não desktop |
| "API retorna 200" | curl real, não "deve retornar" |
| "Conteúdo segue brand voice" | Lê tom de voz + compara com draft |
| "Aluno consegue completar fluxo X" | Testa o fluxo end-to-end |
| "Aluno autorizou Y" | Mensagem do aluno mandada |

**Evidência ≠ pergunta retórica.** "Acho que tá ok?" não é evidência. "Rodei `curl` e vi 200" é evidência.

### 3. Reporta resultado

```
Verificação de {projeto/tarefa}:

✓ Critério 1: {evidência concreta}
✓ Critério 2: {evidência concreta}
✗ Critério 3: {falhou — detalhe do problema}
✓ Critério 4: {evidência}

Status: 3/4 passaram. Critério 3 precisa ser resolvido antes de marcar como completo.

Próxima ação: {ação concreta pra resolver critério 3}
```

### 4. SE algum critério falhou — NÃO MARCA COMO COMPLETO

```
Não vou marcar isso como completo até critério 3 passar.

Opções:
a) Resolvo critério 3 agora ({Xmin estimado})
b) Reescala o critério (era ambicioso demais? muda?)
c) Marca como "completo com ressalva" e abre issue pra T-X resolver isso

Qual prefere?
```

NÃO permite "ah deixa, depois eu vejo" — é por isso que essa skill existe.

## Erro principal que essa skill resolve

```
❌ ANTES:
"Implementei o fluxo X."
[marca como done]
[3 dias depois descobre que crashou na produção em caso edge]

✓ COM ESSA SKILL:
"Implementei o fluxo X. Verificação:
 ✓ Caminho feliz: rodei manualmente, funcionou
 ✓ Caso edge 1 (input vazio): tratei, validei
 ✗ Caso edge 2 (input gigante >1MB): não testei
 
Não vou marcar como completo até validar caso 2.
Vou rodar com input de 5MB agora."
```

## Princípios herdados

- **Princípio 5 (atualizar estado):** verificação atualiza PLAN.md/MEMORY com resultado.
- **Princípio 7 (em dúvida, perguntar):** se critério é ambíguo, pergunta antes de declarar OK.
- **Princípio 8 (logging):** verificação completa vira entrada em `memory/decisoes/`.
- **Princípio 9 (parar se algo der errado):** critério que falha = pausa, não empurra.

## Como invocar

No final de qualquer projeto/feature/conteúdo:

```
"Roda verification-before-completion pra: {projeto/tarefa}.
Critérios em: {PLAN.md / brief / issue}.
Não marca como done até passar tudo."
```

Agente vai rodar checks, mostrar evidência, reportar.

## Adaptação pro Starter Kit

Versão original do superpower é mais agressiva (assume contexto de software/CI). Esta versão adapta pro mix de projetos típicos de aluno: conteúdo, integrações, automações, decisões.

Princípio central preservado: **evidência antes de declaração**.

Versão completa: https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md

## Critérios de sucesso (meta — pra própria skill)

- [ ] Lista de critérios foi extraída antes de começar (não inventada na hora)
- [ ] Cada critério tem evidência concreta documentada
- [ ] Critérios falhos foram reportados, não escondidos
- [ ] Decisão final (completo / parcial / pendente) foi explícita

## Erros comuns

- **Confiar em "vibe check":** "parece bom" não é verificação. Roda o teste, não confia no olhómetro.
- **Pular critérios que parecem triviais:** "verificar permissão" não é trivial até testar.
- **Aceitar "vou validar depois":** depois é nunca. Valida agora ou marca como pendente.

## Referências

- Skill original: https://github.com/obra/superpowers
- Skills complementares: `writing-plans`, `executing-plans` (cria os critérios que essa skill verifica)

## Status

✅ ATIVO desde v1 do Starter Kit (02/05/2026) — versão curada/simplificada do superpower original.
